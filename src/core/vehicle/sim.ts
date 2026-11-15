/**
 * Vehicle simulation: one rigid body, four ray-cast wheels, a simple drivetrain.
 * Pure TypeScript with scalar maths — it runs unchanged in Node (tests), the browser and workers.
 *
 * Body frame: +x forward, +y up, +z right. World: +y up.
 *
 * Each fixed step has two phases:
 *   1. gravity, drag and suspension act, velocities are updated;
 *   2. tyres act on those updated velocities. Friction that only opposes motion (brakes,
 *      rolling resistance, sideways grip near rest) is capped at "just enough to stop", so
 *      the vehicle sits still on a slope instead of creeping or jittering.
 */
import { clamp, lerp, smoothstep } from '../math/util';
import { GroundSample, SURFACES, type Ground } from '../world/ground';
import { Push, pushOut, type Solid, type SolidSource } from '../world/solids';
import { RoadFeel, SimMods, SURFACE_COUNT } from './mods';
import type { AxleSpec, VehicleSpec } from './spec';

export const GRAVITY = 9.81;
const AIR_DENSITY = 1.2;
const DEG = Math.PI / 180;
/** a solid whose tag starts with this is light: crates, barrels, fence runs — knocked aside, not hit */
export const LIGHT_TAG = 'light:';
/**
 * Kinds of roadside things a vehicle pushes through or knocks flat. Site solids are tagged
 * `<site id>:<kind>`; anything else (building, canopy, pump, wreck, tank, signpole, stand, jetty, a
 * vehicle) does not move.
 */
export const LIGHT_KINDS: ReadonlySet<string> = new Set(['crate', 'barrel', 'fence', 'mailbox', 'board', 'bench', 'table', 'trolley']);

/** does a vehicle knock this solid aside rather than stop against it? */
export function isLightSolid(tag: string): boolean {
  if (tag.startsWith(LIGHT_TAG)) return true;
  const i = tag.lastIndexOf(':');
  return i >= 0 && LIGHT_KINDS.has(tag.slice(i + 1));
}
/** what a light thing weighs to the vehicle that knocks it (kg) */
const LIGHT_MASS = 40;
/** bounce off something that does not move */
const WALL_RESTITUTION = 0.15;
/** sliding friction along a wall */
const WALL_FRICTION = 0.35;

/** share of the engine torque that still reaches the wheels while the automatic changes gear */
const SHIFT_TORQUE = 0.35;

export interface VehicleInput {
  /** -1 (full left) … +1 (full right) */
  steer: number;
  /** 0 … 1 */
  throttle: number;
  /** 0 … 1 */
  brake: number;
  /** 0 or 1 */
  handbrake: number;
}

/** gear selector of the automatic gearbox (docs/VEHICLE_SYSTEMS.md §3) */
export type Selector = 'P' | 'R' | 'N' | 'D';
/** the selector gate from front to back: Q moves one notch towards P, Z one towards D */
export const SELECTOR_ORDER: readonly Selector[] = ['P', 'R', 'N', 'D'];

export interface Pose {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

export function makePose(): Pose {
  return { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 };
}

export function zeroInput(): VehicleInput {
  return { steer: 0, throttle: 0, brake: 0, handbrake: 0 };
}

export class Wheel {
  // --- configuration (derived from the spec)
  hx = 0;
  hy = 0;
  hz = 0;
  radius = 0.3;
  axle!: AxleSpec;
  front = false;
  /** -1 left, +1 right */
  side = 1;
  k = 0;
  cBump = 0;
  cReb = 0;
  travel = 0.2;
  staticLoad = 0;
  staticComp = 0;
  /** spring pre-compression (m): lets a soft spring carry the car without using up the travel */
  preload = 0;
  arbK = 0;
  brakeMax = 0;
  alphaPeak = 0.14;
  // --- contact state
  contact = false;
  /** suspension compression: 0 = full droop, travel = full bump */
  comp = 0;
  compRate = 0;
  denom = 1;
  /** normal load on the tyre (N) */
  load = 0;
  cx = 0;
  cy = 0;
  cz = 0;
  nx = 0;
  ny = 1;
  nz = 0;
  mu = 1;
  rr = 0.014;
  surface = 0;
  // wheel heading / right vector on the contact plane (world)
  fx = 1;
  fy = 0;
  fz = 0;
  sx = 0;
  sy = 0;
  sz = 1;
  // --- tyre state
  steer = 0;
  /** filtered slip angle (rad) */
  alpha = 0;
  vLong = 0;
  vLat = 0;
  fLong = 0;
  fLat = 0;
  /** how much of the available grip is in use, 0…1 (1 = sliding) */
  util = 0;
  /** friction capacity this step (N): longitudinal, lateral, and what brakes/rolling resistance may use */
  capLong = 0;
  capLat = 0;
  capOpp = 0;
  /** rolling angle and speed, for visuals and audio */
  spin = 0;
  omega = 0;
  // --- road feel
  /** compression at the previous step, and whether the wheel was on the ground then */
  prevComp = 0;
  prevContact = false;
  /** in the bump stop (for counting strikes once) */
  inBump = false;
  /** time since this wheel's last thump (s) */
  sinceThump = 1;
  /** time off the ground (s) */
  air = 0;
  /** the radius drop the systems gave at the previous step (a wheel changed is not a bump in the road) */
  prevDrop = 0;
  /** distance rolled on the ground (m): tyre wear and punctures */
  rolled = 0;
  /** distance slid (m): sliding wears tread fast */
  slid = 0;
}

export class VehicleSim {
  /** the description in force (a suspension upgrade swaps it: applySpec) */
  get spec(): VehicleSpec {
    return this._spec;
  }
  private _spec!: VehicleSpec;
  readonly wheels: Wheel[] = [];
  /** fixed physics step (s) */
  readonly h: number;

  // pose (world, double precision)
  px = 0;
  py = 0;
  pz = 0;
  qx = 0;
  qy = 0;
  qz = 0;
  qw = 1;
  vx = 0;
  vy = 0;
  vz = 0;
  /** angular velocity (world) */
  avx = 0;
  avy = 0;
  avz = 0;
  /** pose at the start of the latest physics step (for render interpolation) */
  ppx = 0;
  ppy = 0;
  ppz = 0;
  pqx = 0;
  pqy = 0;
  pqz = 0;
  pqw = 1;

  // processed controls
  /** average road-wheel angle (rad), + = right */
  steerAngle = 0;
  /** largest road-wheel angle full input gives at the current speed (rad) */
  maxSteerNow = 0;
  throttle = 0;
  brake = 0;
  handbrake = 0;
  /** +1 forward, -1 reverse (follows the selector: D = +1, R = −1; kept through P and N) */
  dir = 1;
  gear = 1;
  /** gear selector position. P locks the driven wheels, N disconnects the engine */
  selector: Selector = 'D';
  /** manual (sequential) mode in D: the driver picks the gear with shiftUp / shiftDown */
  manual = false;
  /** the handbrake lever is latched on (the pedal input `handbrake` acts only while held) */
  parkBrake = 0;
  /** assist: pressing the throttle in D or R releases a latched handbrake (with a click) */
  autoRelease = true;
  /** starter motor turning the engine (set by the systems' ignition) */
  cranking = false;
  /** gear changes since reset and the direction of the latest (+1 up, −1 down) */
  shifts = 0;
  lastShift = 0;
  /** selector moves refused (P or the other direction while rolling): a grind for the sound */
  refused = 0;
  /** handbrake lever latched / released since reset (for the ratchet click) */
  leverEvents = 0;
  /** inputs from the vehicle systems (neutral by default) */
  readonly mods = new SimMods();
  /** what the suspension and tyres did this step */
  readonly feel = new RoadFeel();
  /** road-wheel angle after the steering play (rad) */
  wheelAngle = 0;
  /** distance travelled (m, along the ground) since reset */
  odometer = 0;
  /** power the engine is delivering right now (kW): heat for the cooling model */
  engineKw = 0;
  /**
   * Things standing in the world (walls, posts, pumps, wrecks, crates): the body keeps out of them.
   * null = only the ground (the handling tests). Solids tagged with this vehicle's id (its own body
   * as others see it) are ignored; solids tagged `light:…` are knocked aside through `onKnock`.
   */
  solids: SolidSource | null = null;
  /** a light solid was knocked: the solid, the vehicle's velocity at the hit (world x, z) and the closing speed (m/s) */
  onKnock: ((s: Solid, vx: number, vz: number, speed: number) => void) | null = null;
  /** hits against solids since reset, and the latest: closing speed (m/s), whether it was head-on, the solid */
  hits = 0;
  lastHitSpeed = 0;
  lastHitFront = false;
  lastHitSolid: Solid | null = null;
  /** deepest the body has been inside a solid (m) since reset (a test figure) */
  maxPenetration = 0;
  rpm = 850;
  /** fuel in the tank (L); Infinity = not tracked (tests, vehicles without a fuel spec) */
  fuelL = Infinity;
  /** fuel burnt since the last reset (L) */
  fuelUsedL = 0;
  /** engine running: off = no drive torque and no fuel burnt */
  engineOn = true;
  shiftTimer = 0;
  /** parked: brakes held automatically */
  hold = false;
  /** S/brake at standstill selects reverse (player convenience); tests may disable */
  autoReverse = true;
  autoHold = true;

  // telemetry
  time = 0;
  speed = 0;
  vForward = 0;
  yawRate = 0;
  /** specific force in the body frame (m/s²): what an occupant feels. At rest: (0, 9.81, 0) */
  accX = 0;
  accY = GRAVITY;
  accZ = 0;
  /** true if the state ever became non-finite */
  exploded = false;

  private acc = 0;
  private steerFilt = 0;
  private pendingShift = 0;
  // solids near the body, asked for every few steps with a margin for the distance covered meanwhile
  private readonly near: Solid[] = [];
  private nearT = 0;
  private readonly push = new Push();
  private readonly knocked: Solid[] = [];
  private readonly knockedT: number[] = [];
  private readonly hitWas = new Set<Solid>();
  private readonly hitNow = new Set<Solid>();
  /** the body footprint on the plan: circles along the body's centre line (body x) and their radius */
  private circX!: Float64Array;
  private circR!: number;
  private sinceShift = 10;
  private revTimer = 0;
  private holdTimer = 0;
  private invIroll!: number;
  private invIyaw!: number;
  private invIpitch!: number;
  private readonly gs = new GroundSample();
  private readonly bodyPts = new Float64Array(24);
  private readonly bodyN = new Float64Array(8);
  private readonly bodyNrm = new Float64Array(24);
  private kBody!: number;
  private cBody!: number;
  private nDriven!: number;

  constructor(spec: VehicleSpec, hz = 120) {
    this.h = 1 / hz;
    this.applySpec(spec, true);
    this.maxSteerNow = spec.steering.maxDeg * DEG;
    this.kThump = Math.exp(-this.h / 0.08);
    this.kRms = 1 - Math.exp(-this.h / 0.3);
  }

  /**
   * Put a (patched) description in force, keeping the pose, the velocities, the controls and the state
   * of every wheel: a suspension upgrade fitted at the roadside (docs/VEHICLE_SYSTEMS.md §6.2). The
   * springs, dampers, hard points, brakes and body box are derived again from it.
   */
  applySpec(spec: VehicleSpec, first = false): void {
    this._spec = spec;
    this.invIroll = 1 / spec.inertia.roll;
    this.invIyaw = 1 / spec.inertia.yaw;
    this.invIpitch = 1 / spec.inertia.pitch;

    const a = spec.wheelbase * (1 - spec.weightFront); // CG → front axle
    const b = spec.wheelbase * spec.weightFront; // CG → rear axle
    const mk = (w: Wheel, axle: AxleSpec, x: number, side: number, front: boolean): Wheel => {
      w.axle = axle;
      w.front = front;
      w.side = side;
      w.radius = spec.wheelRadius;
      const axleLoad = spec.mass * GRAVITY * (front ? spec.weightFront : 1 - spec.weightFront);
      w.staticLoad = axleLoad / 2;
      const mc = w.staticLoad / GRAVITY;
      const om = 2 * Math.PI * axle.springHz;
      w.k = mc * om * om;
      const cCrit = 2 * Math.sqrt(w.k * mc);
      w.cBump = cCrit * axle.dampingRatio * axle.bumpScale;
      w.cReb = cCrit * axle.dampingRatio * axle.reboundScale;
      w.travel = axle.travel;
      const natural = w.staticLoad / w.k;
      w.staticComp = axle.sag !== undefined ? Math.min(natural, axle.sag * axle.travel) : natural;
      w.preload = natural - w.staticComp;
      w.arbK = w.k * axle.antiRollRatio;
      w.brakeMax = (spec.mass * GRAVITY * spec.brakes.maxG * axle.brakeShare) / 2;
      w.alphaPeak = axle.slipPeakDeg * DEG;
      w.hx = x;
      w.hz = (side * axle.track) / 2;
      // hard point = wheel centre at full bump; chosen so the static ride height matches cgHeight
      w.hy = spec.wheelRadius - spec.cgHeight + w.travel - w.staticComp;
      return w;
    };
    if (first) for (let i = 0; i < 4; i++) this.wheels.push(new Wheel());
    const W = this.wheels;
    mk(W[0], spec.front, a, -1, true);
    mk(W[1], spec.front, a, 1, true);
    mk(W[2], spec.rear, -b, -1, false);
    mk(W[3], spec.rear, -b, 1, false);
    this.nDriven = (spec.front.driven ? 2 : 0) + (spec.rear.driven ? 2 : 0);

    const bd = spec.body;
    let n = 0;
    for (const y of [bd.bottom, bd.top]) {
      for (const x of [bd.centerX + bd.halfLength, bd.centerX - bd.halfLength]) {
        for (const z of [-bd.halfWidth, bd.halfWidth]) {
          this.bodyPts[n++] = x;
          this.bodyPts[n++] = y;
          this.bodyPts[n++] = z;
        }
      }
    }
    this.kBody = (spec.mass * GRAVITY) / 0.03;
    this.cBody = 2 * Math.sqrt(this.kBody * spec.mass) * 0.35;
    // circles of the body's half width along its length, ends flush with the box
    const hl = bd.halfLength;
    const hw = bd.halfWidth;
    const nC = Math.max(2, Math.ceil((2 * (hl - hw)) / (hw * 0.7)) + 1);
    this.circR = hw;
    this.circX = new Float64Array(nC);
    for (let i = 0; i < nC; i++) this.circX[i] = bd.centerX - (hl - hw) + (2 * (hl - hw) * i) / (nC - 1);
  }
  private readonly kThump: number;
  private readonly kRms: number;
  private bodyTouch = false;

  /** Place the vehicle at rest on ground height `groundY`, heading `yaw` (rad about +y; 0 = +x). */
  reset(x: number, groundY: number, z: number, yaw = 0): void {
    this.px = x;
    this.py = groundY + this.spec.cgHeight;
    this.pz = z;
    this.qx = 0;
    this.qy = Math.sin(yaw / 2);
    this.qz = 0;
    this.qw = Math.cos(yaw / 2);
    this.ppx = this.px;
    this.ppy = this.py;
    this.ppz = this.pz;
    this.pqx = this.qx;
    this.pqy = this.qy;
    this.pqz = this.qz;
    this.pqw = this.qw;
    this.vx = this.vy = this.vz = 0;
    this.avx = this.avy = this.avz = 0;
    this.speed = 0;
    this.vForward = 0;
    this.steerAngle = 0;
    this.throttle = 0;
    this.brake = 0;
    this.handbrake = 0;
    this.dir = 1;
    this.gear = 1;
    this.selector = 'D';
    this.manual = false;
    this.parkBrake = 0;
    this.pendingShift = 0;
    this.shifts = 0;
    this.lastShift = 0;
    this.wheelAngle = 0;
    this.odometer = 0;
    this.feel.reset();
    this.bodyTouch = false;
    this.near.length = 0;
    this.nearT = 0;
    this.knocked.length = 0;
    this.knockedT.length = 0;
    this.hitWas.clear();
    this.hits = 0;
    this.lastHitSpeed = 0;
    this.lastHitSolid = null;
    this.maxPenetration = 0;
    this.rpm = this.spec.engine.idle;
    this.fuelUsedL = 0;
    this.shiftTimer = 0;
    this.sinceShift = 10;
    this.hold = this.autoHold;
    this.holdTimer = 0;
    this.revTimer = 0;
    this.acc = 0;
    this.steerFilt = 0;
    this.exploded = false;
    for (const w of this.wheels) {
      w.comp = w.staticComp;
      w.compRate = 0;
      w.alpha = 0;
      w.contact = false;
      w.load = w.staticLoad;
      w.steer = 0;
      w.omega = 0;
      w.prevComp = w.staticComp;
      w.prevContact = false;
      w.inBump = false;
      w.sinceThump = 1;
    }
  }

  // ------------------------------------------------------------------ driver operations

  /** drive is connected (D or R) */
  get engaged(): boolean {
    return this.selector === 'D' || this.selector === 'R';
  }

  /**
   * Move the gear selector. P is refused above walking pace (about 3 km/h) and R / D while rolling
   * the other way faster than 5 km/h — the gearbox grinds instead (`refused` counts it).
   */
  shift(sel: Selector): boolean {
    if (sel === this.selector) return true;
    const vF = this.vForward;
    const ok = sel === 'N' || (sel === 'P' ? Math.abs(vF) < 0.85 : sel === 'R' ? vF < 1.4 : vF > -1.4);
    if (!ok) {
      this.refused++;
      return false;
    }
    if (sel === 'R') this.dir = -1;
    if (sel === 'D') {
      if (this.dir < 0) this.gear = 1;
      this.dir = 1;
      // re-engaging D at speed: pick the gear that suits the road speed
      if (!this.manual) this.gear = this.gearForSpeed(Math.max(0, vF));
    }
    this.selector = sel;
    return true;
  }

  /** one notch along the gate: −1 towards P, +1 towards D */
  stepSelector(delta: number): boolean {
    const i = SELECTOR_ORDER.indexOf(this.selector);
    const j = clamp(i + (delta < 0 ? -1 : 1), 0, SELECTOR_ORDER.length - 1);
    return this.shift(SELECTOR_ORDER[j]);
  }

  /** manual mode on / off (only meaningful in D) */
  setManual(on: boolean): void {
    this.manual = on;
    this.pendingShift = 0;
  }

  /** manual mode: ask for one gear up; refused if it would lug the engine below idle */
  shiftUp(): boolean {
    if (!this.manual || this.selector !== 'D' || this.gear >= this.spec.gearbox.ratios.length) return false;
    this.pendingShift = 1;
    return true;
  }

  /** manual mode: ask for one gear down; refused if it would over-rev */
  shiftDown(): boolean {
    if (!this.manual || this.selector !== 'D' || this.gear <= 1) return false;
    const g = this.spec.gearbox;
    const rpmNow = this.coupledRpm(this.gear);
    if ((rpmNow * g.ratios[this.gear - 2]) / g.ratios[this.gear - 1] > this.spec.engine.redline * 1.02) {
      this.refused++;
      return false;
    }
    this.pendingShift = -1;
    return true;
  }

  /** latch or release the handbrake lever */
  setParkBrake(on: boolean): void {
    const v = on ? 1 : 0;
    if (v !== this.parkBrake) this.leverEvents++;
    this.parkBrake = v;
  }

  private coupledRpm(gear: number): number {
    const sp = this.spec;
    return (Math.abs(this.vForward) / sp.wheelRadius) * sp.gearbox.ratios[gear - 1] * sp.gearbox.final * (30 / Math.PI);
  }

  /** the gear the automatic would hold at this road speed (light throttle) */
  private gearForSpeed(v: number): number {
    const g = this.spec.gearbox;
    const n = g.ratios.length;
    for (let gear = n; gear > 1; gear--) {
      const rpm = (v / this.spec.wheelRadius) * g.ratios[gear - 1] * g.final * (30 / Math.PI);
      if (rpm > g.downRpm[0] * 1.15) return gear;
    }
    return 1;
  }

  /** Advance by a variable frame time using fixed sub-steps. Returns the number of sub-steps taken. */
  update(dt: number, input: VehicleInput, ground: Ground): number {
    this.acc += dt;
    let n = 0;
    while (this.acc >= this.h && n < 10) {
      this.substep(input, ground);
      this.acc -= this.h;
      n++;
    }
    if (n === 10) this.acc = 0; // never spiral
    return n;
  }

  /** fraction of the next physics step already elapsed (for render interpolation) */
  get alphaStep(): number {
    return this.acc / this.h;
  }

  private engineTorque(rpm: number): number {
    const c = this.spec.engine.curve;
    if (rpm <= c[0][0]) return c[0][1];
    for (let i = 1; i < c.length; i++) {
      if (rpm <= c[i][0]) {
        const t = (rpm - c[i - 1][0]) / (c[i][0] - c[i - 1][0]);
        return c[i - 1][1] + (c[i][1] - c[i - 1][1]) * t;
      }
    }
    return 0;
  }

  private updateControls(h: number, input: VehicleInput, vF: number): void {
    const sp = this.spec;
    let thr = clamp(input.throttle, 0, 1);
    let brk = clamp(input.brake, 0, 1);

    // relaxed controls: W at a standstill in P or N selects D
    if (this.autoReverse && !this.engaged && vF < 0.5 && vF > -0.5 && thr > 0.2 && brk < 0.05) this.shift('D');
    // relaxed controls: holding S at a standstill selects R, holding W in R selects D
    // (S is then the throttle in reverse: the keys always mean "this way" / "that way")
    if (this.autoReverse && this.engaged) {
      if (this.dir > 0) {
        if (vF < 0.5 && brk > 0.2 && thr < 0.05) {
          this.revTimer += h;
          if (this.revTimer > 0.3) {
            this.dir = -1;
            this.selector = 'R';
            this.revTimer = 0;
          }
        } else this.revTimer = 0;
      } else {
        if (vF > -0.5 && thr > 0.2 && brk < 0.05) {
          this.revTimer += h;
          if (this.revTimer > 0.3) {
            this.dir = 1;
            this.gear = 1;
            this.selector = 'D';
            this.revTimer = 0;
          }
        } else this.revTimer = 0;
      }
    }
    // driving off releases a latched handbrake (assist), with the lever's click
    if (this.autoRelease && this.parkBrake > 0 && this.engaged && (this.dir > 0 ? thr : this.autoReverse ? brk : thr) > 0.3 && this.engineOn) this.setParkBrake(false);
    this.handbrake = input.handbrake > 0.5 || this.parkBrake > 0 ? 1 : 0;
    if (this.dir < 0 && this.autoReverse) {
      const t = thr;
      thr = brk;
      brk = t;
    }

    // pedals have a little travel time: avoids on/off jerks from a keyboard
    this.throttle += clamp(thr - this.throttle, -h / 0.07, h / 0.11);
    this.brake += clamp(brk - this.brake, -h / 0.06, h / 0.08);

    // parked: once the vehicle has come to rest without throttle the brakes stay on by themselves,
    // so it never rolls away on a hill when the driver lets go (or gets out)
    // (N is for rolling: pushing the car, coasting; nothing holds it there)
    if (!this.autoHold || thr > 0.02 || this.selector === 'N') {
      this.hold = false;
      this.holdTimer = 0;
    } else if (!this.hold) {
      if (Math.abs(vF) < 0.35) {
        this.holdTimer += h;
        if (this.holdTimer > 0.25) this.hold = true;
      } else this.holdTimer = 0;
    }

    // steering: full input asks for roughly `gripLimitG` of cornering at speed, full lock when slow
    const st = sp.steering;
    const speed = Math.abs(vF);
    let dMax = st.maxDeg * DEG;
    if (speed > 2) {
      const grip = Math.atan((sp.wheelbase * st.gripLimitG * GRAVITY) / (speed * speed)) + st.slipMarginDeg * DEG;
      if (grip < dMax) dMax = grip;
    }
    this.maxSteerNow = dMax;
    // a short low-pass on the input: takes the twitch out of keys and stick flicks
    this.steerFilt += (clamp(input.steer, -1, 1) - this.steerFilt) * (1 - Math.exp(-h / st.smoothTime));
    const target = this.steerFilt * dMax;
    let rate = lerp(st.rateLow, st.rateHigh, clamp(speed / 25, 0, 1));
    const returning = Math.abs(target) < Math.abs(this.steerAngle) || target * this.steerAngle < 0;
    if (returning) rate *= st.returnScale;
    this.steerAngle += clamp(target - this.steerAngle, -rate * h, rate * h);
    // free play: the steering wheel turns through it before the tyres follow
    const play = this.mods.steerPlay;
    if (play > 0) {
      const half = play * 0.5;
      if (this.steerAngle - this.wheelAngle > half) this.wheelAngle = this.steerAngle - half;
      else if (this.steerAngle - this.wheelAngle < -half) this.wheelAngle = this.steerAngle + half;
    } else this.wheelAngle = this.steerAngle;

    // per-wheel angles (Ackermann blend)
    const d = this.wheelAngle + this.mods.steerPull;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      if (!w.axle.steerable) {
        w.steer = 0;
        continue;
      }
      if (Math.abs(d) < 1e-4) {
        w.steer = d;
        continue;
      }
      const R = sp.wheelbase / Math.tan(d);
      const ack = Math.atan(sp.wheelbase / (R - w.hz));
      w.steer = d + (ack - d) * st.ackermann;
    }
  }

  /** Returns the drive force per driven wheel (N, + = along the wheel heading). */
  private updateDrivetrain(h: number, vDrive: number): number {
    const sp = this.spec;
    const g = sp.gearbox;
    const e = sp.engine;
    const mods = this.mods;
    const thr = this.throttle;
    const running = this.engineOn && this.fuelL > 0 && mods.engineCanRun;
    const fu = sp.fuel;
    if (!this.engaged) {
      // P or N: the engine revs freely, nothing reaches the wheels
      const target = running ? e.idle + thr * (e.redline * 0.85 * mods.rpmLimit - e.idle) : this.cranking ? 220 : 0;
      this.rpm += (target - this.rpm) * Math.min(1, h / (target > this.rpm ? 0.18 : 0.35));
      if (fu && running) {
        const burn = ((fu.idleLph * (1 + 2 * thr)) / 3600) * h * mods.fuel;
        this.fuelUsedL += burn;
        if (this.fuelL !== Infinity) this.fuelL = Math.max(0, this.fuelL - burn);
      }
      this.shiftTimer = 0;
      this.engineKw = running ? thr * 0.15 * this.engineTorque(this.rpm) * this.rpm * (Math.PI / 30000) : 0;
      return 0;
    }
    const ratio = this.dir > 0 ? g.ratios[this.gear - 1] : g.reverse;
    const overall = ratio * g.final;
    const vAlong = vDrive * this.dir;
    const rpmCoupled = (vAlong / sp.wheelRadius) * overall * (30 / Math.PI);
    const launch = e.idle + thr * (e.stall - e.idle);
    const slipping = rpmCoupled < launch;
    let rpm = slipping ? launch : rpmCoupled;
    let torque = running ? thr * this.engineTorque(rpm) * mods.torque : 0;
    // idle creep through the torque converter: walking pace on the level, gone by the stall point
    // (the brakes win against it: holding the pedal, or the automatic hold, takes it out)
    if (running && slipping && rpmCoupled < e.idle) {
      const held = this.hold ? 1 : this.brake;
      torque += 0.25 * this.engineTorque(e.idle) * (1 - thr) * (1 - held) * (1 - Math.max(0, rpmCoupled) / e.idle) * mods.torque;
    }
    // engine braking needs a turning engine (an automatic's converter does not couple a dead one)
    if (!slipping && running) torque -= (1 - thr) * e.brakeNm * (rpm / e.redline);
    const limit = e.redline * mods.rpmLimit;
    if (rpm > limit) torque = Math.min(torque, 0) - (running ? e.brakeNm * 0.5 : 0); // limiter
    if (!running) rpm = this.cranking ? 220 : 0;
    // fuel: an idle trickle plus a share for every kWh delivered (spec.fuel is at game scale)
    if (fu && running) {
      const kW = torque > 0 && this.shiftTimer <= 0 ? (torque * rpm * Math.PI) / 30000 : 0;
      const burn = (fu.idleLph / 3600 + (fu.lPerKWh * kW) / 3600) * h * mods.fuel;
      this.fuelUsedL += burn;
      if (this.fuelL !== Infinity) this.fuelL = Math.max(0, this.fuelL - burn);
    }

    if (this.shiftTimer > 0) {
      // an automatic does not cut the drive during a shift: the engine is pulled down, the pull sags
      // to a share of what it was (a felt and heard shift, not a clutch kick)
      this.shiftTimer -= h;
      torque *= SHIFT_TORQUE;
    } else if (this.dir > 0) {
      this.sinceShift += h;
      if (this.manual) {
        const n = g.ratios.length;
        // protect the engine: a lugging gear drops by itself (the gearbox would stall otherwise)
        if (this.gear > 1 && rpmCoupled < e.idle * 1.05 && this.sinceShift > 0.5) this.pendingShift = -1;
        if (this.pendingShift !== 0 && this.sinceShift > 0.25) {
          const to = clamp(this.gear + this.pendingShift, 1, n);
          if (to !== this.gear) {
            this.lastShift = to > this.gear ? 1 : -1;
            this.gear = to;
            this.shifts++;
            this.shiftTimer = g.shiftTime * (this.lastShift > 0 ? 1 : 0.7);
            this.sinceShift = 0;
          }
          this.pendingShift = 0;
        }
      } else if (this.sinceShift > 0.5) {
        // (a lowered rev limit — limp mode — pulls the upshift point down with it)
        const up = Math.min(lerp(g.upRpm[0], g.upRpm[1], thr), limit * 0.93);
        let down = lerp(g.downRpm[0], g.downRpm[1], thr);
        if (mods.rpmLimit < 1) down = Math.min(down, up * 0.5);
        if (this.gear < g.ratios.length && rpmCoupled > up) {
          this.gear++;
          this.shifts++;
          this.lastShift = 1;
          this.shiftTimer = g.shiftTime;
          this.sinceShift = 0;
        } else if (this.gear > 1 && rpmCoupled < down && (rpmCoupled * g.ratios[this.gear - 2]) / ratio < e.redline * 0.92) {
          this.gear--;
          this.shifts++;
          this.lastShift = -1;
          this.shiftTimer = g.shiftTime * 0.7;
          this.sinceShift = 0;
        }
      }
    }
    this.rpm += (rpm - this.rpm) * Math.min(1, h / 0.06);
    this.engineKw = torque > 0 ? (torque * rpm * Math.PI) / 30000 : 0;
    if (this.nDriven === 0) return 0;
    return ((torque * overall * g.efficiency) / (sp.wheelRadius * this.nDriven)) * this.dir;
  }

  /** One fixed physics step. */
  substep(input: VehicleInput, ground: Ground): void {
    const h = this.h;
    const sp = this.spec;
    const m = sp.mass;
    const wheels = this.wheels;
    const gs = this.gs;

    // body axes in world space
    const qx = this.qx;
    const qy = this.qy;
    const qz = this.qz;
    const qw = this.qw;
    const xx = qx * qx;
    const yy = qy * qy;
    const zz = qz * qz;
    const xy = qx * qy;
    const xz = qx * qz;
    const yz = qy * qz;
    const wqx = qw * qx;
    const wqy = qw * qy;
    const wqz = qw * qz;
    const Fx = 1 - 2 * (yy + zz);
    const Fy = 2 * (xy + wqz);
    const Fz = 2 * (xz - wqy);
    const Ux = 2 * (xy - wqz);
    const Uy = 1 - 2 * (xx + zz);
    const Uz = 2 * (yz + wqx);
    const Sx = 2 * (xz + wqy);
    const Sy = 2 * (yz - wqx);
    const Sz = 1 - 2 * (xx + yy);

    const px = this.px;
    const py = this.py;
    const pz = this.pz;
    this.ppx = px;
    this.ppy = py;
    this.ppz = pz;
    this.pqx = qx;
    this.pqy = qy;
    this.pqz = qz;
    this.pqw = qw;
    let vx = this.vx;
    let vy = this.vy;
    let vz = this.vz;
    let ax = this.avx;
    let ay = this.avy;
    let az = this.avz;
    const v0x = vx;
    const v0y = vy;
    const v0z = vz;

    const vF = vx * Fx + vy * Fy + vz * Fz;
    this.updateControls(h, input, vF);

    // ---------------------------------------------------------------- phase 1: gravity, drag, suspension
    let fX = 0;
    let fY = -m * GRAVITY;
    let fZ = 0;
    let tX = 0;
    let tY = 0;
    let tZ = 0;

    if (this.pushing) {
      fX += this.pushFx;
      fZ += this.pushFz;
      tY += this.pushTy;
      this.pushing = false;
      this.pushFx = this.pushFz = this.pushTy = 0;
    }
    const vmag = Math.sqrt(vx * vx + vy * vy + vz * vz);
    const kd = 0.5 * AIR_DENSITY * sp.aero.cdA * vmag;
    fX -= kd * vx;
    fY -= kd * vy;
    fZ -= kd * vz;

    const uyc = Uy > 0.35 ? Uy : 0.35;
    const mods = this.mods;
    let contacts = 0;
    let maxCompFrac = 0;
    for (let i = 0; i < 4; i++) {
      const w = wheels[i];
      w.prevContact = w.contact;
      w.prevComp = w.comp;
      const ox = px + Fx * w.hx + Ux * w.hy + Sx * w.hz;
      const oy = py + Fy * w.hx + Uy * w.hy + Sy * w.hz;
      const oz = pz + Fz * w.hx + Uz * w.hy + Sz * w.hz;
      if (Uy <= 0.05) {
        w.contact = false;
        w.comp = 0;
        w.compRate = 0;
        continue;
      }
      // intersect the suspension axis (direction −U) with the ground
      ground.sample(ox, oz, gs);
      let t = (oy - gs.h) / uyc;
      ground.sample(ox - Ux * t, oz - Uz * t, gs);
      t += (oy - Uy * t - gs.h) / uyc;
      const comp = w.travel - (t - (w.radius - mods.radiusDrop[i]));
      if (comp <= 0) {
        w.contact = false;
        w.comp = 0;
        w.compRate = 0;
        continue;
      }
      contacts++;
      w.contact = true;
      w.comp = comp;
      const frac = comp / w.travel;
      if (frac > maxCompFrac) maxCompFrac = frac;
      w.cx = ox - Ux * t;
      w.cy = oy - Uy * t;
      w.cz = oz - Uz * t;
      w.nx = gs.nx;
      w.ny = gs.ny;
      w.nz = gs.nz;
      w.surface = gs.surface;
      const si = i * SURFACE_COUNT + (gs.surface < SURFACE_COUNT ? gs.surface : 0);
      w.mu = gs.mu * mods.mu[si];
      w.rr = gs.rr * mods.rr[si];
      const nu = gs.nx * Ux + gs.ny * Uy + gs.nz * Uz;
      w.denom = nu > 0.3 ? nu : 0.3;
      const rx = w.cx - px;
      const ry = w.cy - py;
      const rz = w.cz - pz;
      const vcx = vx + (ay * rz - az * ry);
      const vcy = vy + (az * rx - ax * rz);
      const vcz = vz + (ax * ry - ay * rx);
      w.compRate = -(vcx * gs.nx + vcy * gs.ny + vcz * gs.nz) / w.denom;
    }

    this.updateFeel(h, contacts);

    for (let a = 0; a < 4; a += 2) {
      const wl = wheels[a];
      const wr = wheels[a + 1];
      const arb = wl.arbK * (wl.comp - wr.comp);
      for (let j = 0; j < 2; j++) {
        const w = j === 0 ? wl : wr;
        if (!w.contact) {
          w.load = 0;
          continue;
        }
        const c = w.comp;
        let f = w.k * (c < w.travel ? c : w.travel);
        // preload comes in over the first centimetre, so a wheel touching down does not hit a step
        if (w.preload > 0) f += w.k * w.preload * (c < 0.01 ? c * 100 : 1);
        const bs = w.travel - 0.035;
        if (c > bs) f += w.k * 8 * (c - bs); // bump stop, also covers c > travel
        f += (w.compRate > 0 ? w.cBump : w.cReb) * w.compRate;
        f += j === 0 ? arb : -arb;
        if (f < 0) f = 0;
        let N = f / w.denom;
        const nmax = w.staticLoad * 8;
        if (N > nmax) N = nmax;
        w.load = N;
        const nfx = w.nx * N;
        const nfy = w.ny * N;
        const nfz = w.nz * N;
        const rx = w.cx - px;
        const ry = w.cy - py;
        const rz = w.cz - pz;
        fX += nfx;
        fY += nfy;
        fZ += nfz;
        tX += ry * nfz - rz * nfy;
        tY += rz * nfx - rx * nfz;
        tZ += rx * nfy - ry * nfx;
      }
    }

    // body contact (only when it can matter: tilted, bottomed out or mostly airborne)
    const bp = this.bodyPts;
    const bn = this.bodyN;
    const bnr = this.bodyNrm;
    const bodyActive = Uy < 0.8 || maxCompFrac > 0.97 || contacts < 3;
    if (bodyActive) {
      const nmaxBody = m * GRAVITY * 6;
      for (let k = 0; k < 8; k++) {
        const bx = bp[k * 3];
        const by = bp[k * 3 + 1];
        const bz = bp[k * 3 + 2];
        const rx = Fx * bx + Ux * by + Sx * bz;
        const ry = Fy * bx + Uy * by + Sy * bz;
        const rz = Fz * bx + Uz * by + Sz * bz;
        ground.sample(px + rx, pz + rz, gs);
        const depth = gs.h - (py + ry);
        if (depth <= 0) {
          bn[k] = 0;
          continue;
        }
        const vpx = vx + (ay * rz - az * ry);
        const vpy = vy + (az * rx - ax * rz);
        const vpz = vz + (ax * ry - ay * rx);
        const vn = vpx * gs.nx + vpy * gs.ny + vpz * gs.nz;
        let N = this.kBody * depth - this.cBody * vn;
        if (N < 0) N = 0;
        if (N > nmaxBody) N = nmaxBody;
        bn[k] = N;
        bnr[k * 3] = gs.nx;
        bnr[k * 3 + 1] = gs.ny;
        bnr[k * 3 + 2] = gs.nz;
        const nfx = gs.nx * N;
        const nfy = gs.ny * N;
        const nfz = gs.nz * N;
        fX += nfx;
        fY += nfy;
        fZ += nfz;
        tX += ry * nfz - rz * nfy;
        tY += rz * nfx - rx * nfz;
        tZ += rx * nfy - ry * nfx;
      }
    }

    {
      let touching = false;
      let imp = 0;
      if (bodyActive) for (let k = 0; k < 8; k++) if (bn[k] > 0) {
        touching = true;
        imp += bn[k] * h;
      }
      if (touching && !this.bodyTouch) {
        this.feel.bodyHits++;
        this.feel.lastBodyHit = imp;
      } else if (touching && imp > this.feel.lastBodyHit) this.feel.lastBodyHit = imp;
      this.bodyTouch = touching;
    }

    const invM = 1 / m;
    vx += fX * invM * h;
    vy += fY * invM * h;
    vz += fZ * invM * h;
    {
      const abx = (tX * Fx + tY * Fy + tZ * Fz) * this.invIroll;
      const aby = (tX * Ux + tY * Uy + tZ * Uz) * this.invIyaw;
      const abz = (tX * Sx + tY * Sy + tZ * Sz) * this.invIpitch;
      ax += (Fx * abx + Ux * aby + Sx * abz) * h;
      ay += (Fy * abx + Uy * aby + Sy * abz) * h;
      az += (Fz * abx + Uz * aby + Sz * abz) * h;
    }

    // ---------------------------------------------------------------- phase 2: tyres
    fX = 0;
    fY = 0;
    fZ = 0;
    tX = 0;
    tY = 0;
    tZ = 0;
    let vDrive = 0;
    let nDrive = 0;
    for (let i = 0; i < 4; i++) {
      const w = wheels[i];
      if (w.contact) {
        const cs = Math.cos(w.steer);
        const sn = Math.sin(w.steer);
        let hx = Fx * cs + Sx * sn;
        let hy = Fy * cs + Sy * sn;
        let hz = Fz * cs + Sz * sn;
        const hn = hx * w.nx + hy * w.ny + hz * w.nz;
        hx -= w.nx * hn;
        hy -= w.ny * hn;
        hz -= w.nz * hn;
        const il = 1 / Math.sqrt(hx * hx + hy * hy + hz * hz);
        hx *= il;
        hy *= il;
        hz *= il;
        w.fx = hx;
        w.fy = hy;
        w.fz = hz;
        w.sx = hy * w.nz - hz * w.ny;
        w.sy = hz * w.nx - hx * w.nz;
        w.sz = hx * w.ny - hy * w.nx;
        const rx = w.cx - px;
        const ry = w.cy - py;
        const rz = w.cz - pz;
        const vcx = vx + (ay * rz - az * ry);
        const vcy = vy + (az * rx - ax * rz);
        const vcz = vz + (ax * ry - ay * rx);
        w.vLong = vcx * hx + vcy * hy + vcz * hz;
        w.vLat = vcx * w.sx + vcy * w.sy + vcz * w.sz;
      } else {
        w.vLong = vF;
        w.vLat = 0;
        w.alpha = 0;
        w.fLong = 0;
        w.fLat = 0;
        w.util = 0;
      }
      if (w.axle.driven) {
        vDrive += w.vLong;
        nDrive++;
      }
    }
    const drive = this.updateDrivetrain(h, nDrive > 0 ? vDrive / nDrive : vF);

    const tire = sp.tire;
    const brakeCmd = this.hold ? 1 : this.brake;
    // P: the parking pawl locks the driven wheels like a handbrake does the rear ones
    const pawl = this.selector === 'P';
    // How much friction each wheel can offer. Motion-opposing friction is capped at "just enough
    // to stop"; that stopping impulse is shared between the wheels in proportion to what each can
    // give, so two braked wheels hold the whole car as well as four do.
    let sumLat = 0;
    let sumOpp = 0;
    for (let i = 0; i < 4; i++) {
      const w = wheels[i];
      if (!w.contact || w.load < 1) {
        w.capLat = 0;
        w.capOpp = 0;
        continue;
      }
      const N = w.load;
      const ls = clamp(1 - tire.loadSens * (N / w.staticLoad - 1), 0.7, 1.1);
      const grip = w.axle.muScale * w.mu * ls;
      w.capLong = tire.muLong * grip * N;
      w.capLat = tire.muLat * grip * N;
      const locked = (this.handbrake > 0 && w.axle.handbrake) || (pawl && w.axle.driven);
      w.capOpp = locked ? w.capLong : Math.min(w.capLong, N * w.rr + brakeCmd * w.brakeMax * mods.brake[i]);
      sumLat += w.capLat;
      sumOpp += w.capOpp;
    }
    for (let i = 0; i < 4; i++) {
      const w = wheels[i];
      if (!w.contact) {
        w.omega = w.vLong / w.radius;
        w.spin += w.omega * h;
        continue;
      }
      const N = w.load;
      if (N < 1) {
        w.fLong = 0;
        w.fLat = 0;
        w.util = 0;
        continue;
      }
      const maxLong = w.capLong;
      const maxLat0 = w.capLat;
      // force per (m/s) of slip that would bring this wheel's share of the car to rest in one step
      const stickLat = (m * w.capLat) / (sumLat * h);
      const stickLong = sumOpp > 0 ? (m * w.capOpp) / (sumOpp * h) : 0;
      const meff = (N > 0.3 * w.staticLoad ? N : 0.3 * w.staticLoad) / GRAVITY;
      let FL = 0;
      let FS = 0;
      const speedC = Math.sqrt(w.vLong * w.vLong + w.vLat * w.vLat);
      const wStick = 1 - smoothstep(0.4, 1.6, speedC);

      if ((this.handbrake > 0 && w.axle.handbrake) || (pawl && w.axle.driven)) {
        // locked wheel. Near rest it takes exactly its share of the stopping impulse in each direction
        // (shares along and across the car differ, and mixing them lets a heavy vehicle creep on a hill);
        // once that exceeds the grip it slides, and friction simply opposes the sliding direction.
        const cap = (speedC > 0.3 ? tire.slideRatio : 1) * maxLong;
        const fl = stickLong * w.vLong;
        const fs = stickLat * w.vLat;
        let f = Math.sqrt(fl * fl + fs * fs);
        if (f <= cap) {
          FL = -fl;
          FS = -fs;
        } else {
          f = cap;
          if (speedC > 1e-6) {
            FL = (-f * w.vLong) / speedC;
            FS = (-f * w.vLat) / speedC;
          }
        }
        w.util = speedC > 0.3 ? 1 : f / maxLong;
        w.alpha = Math.atan2(w.vLat, Math.abs(w.vLong) + 0.3);
        w.omega = 0;
      } else {
        // longitudinal: engine drive plus motion-opposing forces (brake, rolling resistance)
        const fDrive = w.axle.driven ? drive : 0;
        const fOpp = w.capOpp;
        const vPred = w.vLong + (fDrive / meff) * h;
        const aPred = vPred < 0 ? -vPred : vPred;
        const fRes = fOpp < stickLong * aPred ? fOpp : stickLong * aPred;
        FL = fDrive - (vPred > 0 ? fRes : -fRes);
        let over = false;
        if (FL > maxLong) {
          FL = maxLong;
          over = true;
        } else if (FL < -maxLong) {
          FL = -maxLong;
          over = true;
        }
        const uL = FL / maxLong;
        let latScale = 1 - uL * uL;
        const minLat = tire.minLatUnderLong * tire.minLatUnderLong;
        if (latScale < minLat) latScale = minLat;
        const maxLat = maxLat0 * Math.sqrt(latScale);

        // lateral: slip-angle curve at speed, plain static friction near rest
        const vl = w.vLong < 0 ? -w.vLong : w.vLong;
        const aRaw = Math.atan2(w.vLat, vl + 0.3);
        const kRelax = vl > 1 ? Math.min(1, (vl * h) / tire.relaxLen) : 1;
        w.alpha += (aRaw - w.alpha) * kRelax;
        const aAbs = w.alpha < 0 ? -w.alpha : w.alpha;
        const x = aAbs / w.alphaPeak;
        const g = x < 1 ? x * (2 - x) : 1 - (1 - tire.slideRatio) * smoothstep(1, 3, x);
        let fLat = maxLat * (g + (1 - g) * wStick);
        const sameSign = w.alpha * w.vLat >= 0;
        if (sameSign) {
          const cap = stickLat * (w.vLat < 0 ? -w.vLat : w.vLat);
          if (fLat > cap) fLat = cap;
        }
        FS = w.alpha > 0 ? -fLat : fLat;
        const uS = maxLat0 > 0 ? fLat / maxLat0 : 0;
        w.util = Math.min(1, Math.sqrt(uL * uL + uS * uS));
        // visual wheel speed: spins up when traction-limited under power, slows when brake-limited
        let om = w.vLong / w.radius;
        if (over) om = fDrive * this.dir > 0 && FL * this.dir > 0 ? om + (this.dir * 6) / w.radius : om * 0.3;
        w.omega = om;
      }
      w.spin += w.omega * h;
      {
        const vl = w.vLong < 0 ? -w.vLong : w.vLong;
        w.rolled += vl * h;
        if (w.util >= 0.98) w.slid += Math.sqrt(w.vLong * w.vLong + w.vLat * w.vLat) * h;
      }
      w.fLong = FL;
      w.fLat = FS;
      const wfx = w.fx * FL + w.sx * FS;
      const wfy = w.fy * FL + w.sy * FS;
      const wfz = w.fz * FL + w.sz * FS;
      let rx = w.cx - px;
      let ry = w.cy - py;
      let rz = w.cz - pz;
      if (wStick > 0) {
        // near rest the tyre acts as plain static friction; applying it level with the CG keeps
        // "stop the slip" exact instead of trading it for body roll or pitch
        const lift = (rx * Ux + ry * Uy + rz * Uz) * wStick;
        rx -= Ux * lift;
        ry -= Uy * lift;
        rz -= Uz * lift;
      }
      fX += wfx;
      fY += wfy;
      fZ += wfz;
      tX += ry * wfz - rz * wfy;
      tY += rz * wfx - rx * wfz;
      tZ += rx * wfy - ry * wfx;
    }

    if (bodyActive) {
      const stickB = (0.9 * m) / 4 / h;
      for (let k = 0; k < 8; k++) {
        const N = bn[k];
        if (N <= 0) continue;
        const bx = bp[k * 3];
        const by = bp[k * 3 + 1];
        const bz = bp[k * 3 + 2];
        const rx = Fx * bx + Ux * by + Sx * bz;
        const ry = Fy * bx + Uy * by + Sy * bz;
        const rz = Fz * bx + Uz * by + Sz * bz;
        const nx = bnr[k * 3];
        const ny = bnr[k * 3 + 1];
        const nz = bnr[k * 3 + 2];
        let vpx = vx + (ay * rz - az * ry);
        let vpy = vy + (az * rx - ax * rz);
        let vpz = vz + (ax * ry - ay * rx);
        const vn = vpx * nx + vpy * ny + vpz * nz;
        vpx -= nx * vn;
        vpy -= ny * vn;
        vpz -= nz * vn;
        const vt = Math.sqrt(vpx * vpx + vpy * vpy + vpz * vpz);
        if (vt < 1e-6) continue;
        const f = Math.min(0.6 * N, stickB * vt) / vt;
        const ffx = -vpx * f;
        const ffy = -vpy * f;
        const ffz = -vpz * f;
        fX += ffx;
        fY += ffy;
        fZ += ffz;
        tX += ry * ffz - rz * ffy;
        tY += rz * ffx - rx * ffz;
        tZ += rx * ffy - ry * ffx;
      }
    }

    vx += fX * invM * h;
    vy += fY * invM * h;
    vz += fZ * invM * h;
    {
      const abx = (tX * Fx + tY * Fy + tZ * Fz) * this.invIroll;
      const aby = (tX * Ux + tY * Uy + tZ * Uz) * this.invIyaw;
      const abz = (tX * Sx + tY * Sy + tZ * Sz) * this.invIpitch;
      ax += (Fx * abx + Ux * aby + Sx * abz) * h;
      ay += (Fy * abx + Uy * aby + Sy * abz) * h;
      az += (Fz * abx + Uz * aby + Sz * abz) * h;
    }

    // ---------------------------------------------------------------- solids: walls, posts, crates
    let cx = 0;
    let cz = 0;
    if (this.solids) {
      const r = this.collide(h, px, py, pz, Fx, Fz, vx, vz, ay);
      vx = r[0];
      vz = r[1];
      ay = r[2];
      cx = r[3];
      cz = r[4];
    }

    // ---------------------------------------------------------------- integrate pose
    this.px = px + vx * h + cx;
    this.py = py + vy * h;
    this.pz = pz + vz * h + cz;
    const hh = 0.5 * h;
    let nqx = qx + hh * (ax * qw + ay * qz - az * qy);
    let nqy = qy + hh * (-ax * qz + ay * qw + az * qx);
    let nqz = qz + hh * (ax * qy - ay * qx + az * qw);
    let nqw = qw + hh * (-ax * qx - ay * qy - az * qz);
    const qn = 1 / Math.sqrt(nqx * nqx + nqy * nqy + nqz * nqz + nqw * nqw);
    nqx *= qn;
    nqy *= qn;
    nqz *= qn;
    nqw *= qn;
    this.qx = nqx;
    this.qy = nqy;
    this.qz = nqz;
    this.qw = nqw;
    this.vx = vx;
    this.vy = vy;
    this.vz = vz;
    this.avx = ax;
    this.avy = ay;
    this.avz = az;

    // ---------------------------------------------------------------- telemetry
    const sfx = (vx - v0x) / h;
    const sfy = (vy - v0y) / h + GRAVITY;
    const sfz = (vz - v0z) / h;
    const kf = Math.min(1, h / 0.04);
    this.accX += (sfx * Fx + sfy * Fy + sfz * Fz - this.accX) * kf;
    this.accY += (sfx * Ux + sfy * Uy + sfz * Uz - this.accY) * kf;
    this.accZ += (sfx * Sx + sfy * Sy + sfz * Sz - this.accZ) * kf;
    this.vForward = vx * Fx + vy * Fy + vz * Fz;
    this.speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (contacts > 0) this.odometer += this.speed * h;
    this.yawRate = ax * Ux + ay * Uy + az * Uz;
    this.time += h;
    if (!(this.px === this.px && this.qw === this.qw && this.speed < 1e4)) this.exploded = true;
  }

  private readonly colOut = new Float64Array(5);

  // someone on foot pushing the body: world force and yaw torque for the next step only
  private pushing = false;
  private pushFx = 0;
  private pushFz = 0;
  private pushTy = 0;

  /**
   * Someone on foot leans on the body (docs/VEHICLE_SYSTEMS.md §4.8): a horizontal world force (N) at a
   * world point, for the next physics step only — call it every step while pushing. In N (or with the
   * engine off in D and nobody braking) it rolls; in P or with the handbrake on it does not.
   */
  addPush(fx: number, fz: number, x: number, z: number): void {
    this.pushing = true;
    this.pushFx += fx;
    this.pushFz += fz;
    const rx = x - this.px;
    const rz = z - this.pz;
    this.pushTy += rz * fx - rx * fz;
  }

  /**
   * Keep the body out of the solids near it. The footprint is a row of circles on the plan at the
   * height of the centre of gravity; each one inside a solid gets an impulse along the push-out normal
   * (closing speed taken away with a little bounce, the rest sliding with some friction), through the
   * point of contact so a corner strike turns the vehicle, and the overlap is moved out at once.
   * Returns [vx, vz, yaw rate, dx, dz]: new velocities and the position correction.
   */
  private collide(h: number, px: number, py: number, pz: number, Fx: number, Fz: number, vx: number, vz: number, ay: number): Float64Array {
    const out = this.colOut;
    out[3] = 0;
    out[4] = 0;
    const sp = this.spec;
    const bd = sp.body;
    // the forward direction on the plan
    let fx = Fx;
    let fz = Fz;
    const fl = Math.sqrt(fx * fx + fz * fz);
    if (fl < 1e-6) {
      out[0] = vx;
      out[1] = vz;
      out[2] = ay;
      return out;
    }
    fx /= fl;
    fz /= fl;
    const speed = Math.sqrt(vx * vx + vz * vz);
    this.nearT -= h;
    if (this.nearT <= 0) {
      this.near.length = 0;
      // re-asked every 6 steps (0.05 s): the margin covers the way travelled meanwhile
      this.solids!.solidsNear(px + fx * bd.centerX, pz + fz * bd.centerX, bd.halfLength + 0.5 + speed * 0.08, this.near);
      this.nearT = h * 6;
    }
    for (let k = this.knockedT.length - 1; k >= 0; k--) {
      this.knockedT[k] -= h;
      if (this.knockedT[k] <= 0) {
        this.knocked.splice(k, 1);
        this.knockedT.splice(k, 1);
      }
    }
    if (this.near.length === 0) {
      this.hitWas.clear();
      out[0] = vx;
      out[1] = vz;
      out[2] = ay;
      return out;
    }
    const m = sp.mass;
    const invI = 1 / sp.inertia.yaw;
    const bottom = py + bd.bottom + 0.04;
    const top = py + bd.top;
    const own = sp.id;
    const R = this.circR;
    const pu = this.push;
    let corrX = 0;
    let corrZ = 0;
    this.hitNow.clear();
    for (const s of this.near) {
      if (s.tag === own || s.y1 <= bottom || s.y0 >= top) continue;
      if (this.knocked.includes(s)) continue;
      const light = isLightSolid(s.tag);
      for (let i = 0; i < this.circX.length; i++) {
        const ox = this.circX[i];
        // tested where the circle will be after this step (a speculative contact: nothing tunnels
        // through a thin wall at speed); the overlap now, if any, is corrected separately below
        const ccx = px + corrX + fx * ox + vx * h;
        const ccz = pz + corrZ + fz * ox + vz * h;
        if (!pushOut(s, ccx, ccz, R, pu)) continue;
        const nx = pu.nx;
        const nz = pu.nz;
        // point of contact: on the circle's rim towards the solid
        const rx = ccx - nx * R - px;
        const rz = ccz - nz * R - pz;
        // velocity of that point (yaw only: the plan view)
        const vcx = vx + ay * rz;
        const vcz = vz - ay * rx;
        const vn = vcx * nx + vcz * nz;
        if (light) {
          if (vn < -0.05) {
            // a light thing takes some of the momentum and is pushed aside
            const rn = rz * nx - rx * nz;
            const kn = 1 / m + rn * rn * invI;
            const j = (-vn * 1.0) / (kn + 1 / LIGHT_MASS);
            vx += (j * nx) / m;
            vz += (j * nz) / m;
            ay += (rz * j * nx - rx * j * nz) * invI;
            this.knocked.push(s);
            this.knockedT.push(1.0);
            this.onKnock?.(s, vx, vz, -vn);
            this.feel.thump = Math.max(this.feel.thump, Math.min(1, -vn / 12));
          }
          break;
        }
        // how far it still is from touching, measured along the normal (≤ 0: touching now)
        // (> 0: still apart; the closing speed that just closes it in this step is allowed)
        const gap = -vn * h - pu.depth;
        const allowed = gap > 0 ? -gap / h : 0;
        const contact = vn < allowed;
        if (contact || gap <= 1e-4) this.hitNow.add(s);
        if (contact) {
          const rn = rz * nx - rx * nz;
          const kn = 1 / m + rn * rn * invI;
          // arrive exactly at the surface, then bounce off it a little
          // a new impact: put it on the surface this step and send it back with a little bounce;
          // a contact that goes on: just do not let it go further in
          const fresh = !this.hitWas.has(s) && vn < 0;
          let target = allowed;
          if (fresh) {
            target = WALL_RESTITUTION * -vn;
            if (gap > 0) {
              corrX -= nx * gap;
              corrZ -= nz * gap;
            }
          }
          const j = (target - vn) / kn;
          // friction along the wall, at most μ·j
          const tx = -nz;
          const tz = nx;
          const vt = vcx * tx + vcz * tz;
          const rt = rz * tx - rx * tz;
          const kt = 1 / m + rt * rt * invI;
          let jt = -vt / kt;
          const jmax = WALL_FRICTION * j;
          if (jt > jmax) jt = jmax;
          else if (jt < -jmax) jt = -jmax;
          const Jx = j * nx + jt * tx;
          const Jz = j * nz + jt * tz;
          vx += Jx / m;
          vz += Jz / m;
          ay += (rz * Jx - rx * Jz) * invI;
          // one hit per solid per contact: counted when it starts
          if (!this.hitWas.has(s) && -vn > 0.3) {
            this.hits++;
            this.lastHitSpeed = -vn;
            this.lastHitSolid = s;
            this.lastHitFront = -(fx * nx + fz * nz) > 0.7;
            this.feel.thump = Math.max(this.feel.thump, Math.min(1, -vn / 6));
            this.feel.thumps++;
            this.feel.lastThump = -vn;
          }
        }
        // out of an overlap that exists already (the circle's centre is at the CG height; the depth is on the plan)
        if (pushOut(s, ccx - vx * h, ccz - vz * h, R, pu)) {
          corrX += pu.nx * pu.depth;
          corrZ += pu.nz * pu.depth;
          if (pu.depth > this.maxPenetration) this.maxPenetration = pu.depth;
        }
      }
    }
    const t = this.hitWas;
    t.clear();
    for (const s of this.hitNow) t.add(s);
    out[0] = vx;
    out[1] = vz;
    out[2] = ay;
    out[3] = corrX;
    out[4] = corrZ;
    return out;
  }

  /**
   * Road feel from the suspension state just computed: thumps are jumps in a wheel's compression that the
   * body's own motion does not explain (a kerb, a joint, a pothole edge); bump-stop strikes, landings, how
   * busy the suspension is, and the surface's micro-texture (cosmetic) for the sound and the props.
   */
  private updateFeel(h: number, contacts: number): void {
    const f = this.feel;
    f.thump *= this.kThump;
    let sq = 0;
    let rough = 0;
    let nc = 0;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      w.sinceThump += h;
      const dropNow = this.mods.radiusDrop[i];
      if (!w.contact) {
        w.prevDrop = dropNow;
        w.inBump = false;
        w.air += h;
        continue;
      }
      // touching down after a flight: a landing (one per jump, whichever wheel arrives first)
      if (w.air > 0.15 && w.compRate > 0.8 && f.sinceLanding > 0.4) {
        f.landings++;
        f.lastLanding = w.compRate;
        f.sinceLanding = 0;
        const s = clamp(w.compRate / 3, 0, 1);
        if (s > f.thump) f.thump = s;
      }
      w.air = 0;
      nc++;
      sq += w.compRate * w.compRate;
      rough += SURFACES[w.surface]?.rough ?? 0;
      if (w.prevContact) {
        // the geometric part of the compression change: what the ground did under the tyre
        const drop = this.mods.radiusDrop[i];
        const jump = (w.comp - w.prevComp + (drop - w.prevDrop)) / h - w.compRate;
        const aj = jump < 0 ? -jump : jump;
        if (aj > 0.9 && w.sinceThump > 0.12) {
          const s = clamp(aj / 6, 0, 1);
          if (s > f.thump) f.thump = s;
          f.thumps++;
          f.lastThump = aj;
          f.lastThumpWheel = i;
          w.sinceThump = 0;
        }
      }
      w.prevDrop = dropNow;
      const bs = w.travel - 0.035;
      if (w.comp > bs && w.compRate > 0.2 && !w.inBump) {
        w.inBump = true;
        f.bottomOuts++;
        f.lastBottomOut = w.compRate;
      } else if (w.comp < bs - 0.01) w.inBump = false;
    }
    f.suspRms += (Math.sqrt(sq / 4) - f.suspRms) * this.kRms;
    const buzz = nc > 0 ? clamp(((rough / nc) / 0.02) * clamp(this.speed / 15, 0, 1.3), 0, 1) : 0;
    f.buzz += (buzz - f.buzz) * this.kRms;
    const air = contacts < 2;
    f.airTime = air ? f.airTime + h : 0;
    f.sinceLanding += h;
    f.airborne = air;
  }

  // ------------------------------------------------------------------ queries for rendering, camera and tests

  /**
   * Pose for rendering: blended between the last two physics steps by the unspent frame time,
   * so motion stays smooth whatever the display refresh rate is.
   */
  renderPose(out: Pose, alpha = this.acc / this.h): void {
    const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
    const b = 1 - a;
    out.x = this.ppx * b + this.px * a;
    out.y = this.ppy * b + this.py * a;
    out.z = this.ppz * b + this.pz * a;
    // shortest-path nlerp
    const dot = this.pqx * this.qx + this.pqy * this.qy + this.pqz * this.qz + this.pqw * this.qw;
    const s = dot < 0 ? -a : a;
    let x = this.pqx * b + this.qx * s;
    let y = this.pqy * b + this.qy * s;
    let z = this.pqz * b + this.qz * s;
    let w = this.pqw * b + this.qw * s;
    const n = 1 / Math.sqrt(x * x + y * y + z * z + w * w);
    x *= n;
    y *= n;
    z *= n;
    w *= n;
    out.qx = x;
    out.qy = y;
    out.qz = z;
    out.qw = w;
  }

  /** Body axes (forward, up, right) in world space: out = [Fx,Fy,Fz, Ux,Uy,Uz, Sx,Sy,Sz]. */
  basis(out: Float64Array | number[]): void {
    const qx = this.qx;
    const qy = this.qy;
    const qz = this.qz;
    const qw = this.qw;
    out[0] = 1 - 2 * (qy * qy + qz * qz);
    out[1] = 2 * (qx * qy + qw * qz);
    out[2] = 2 * (qx * qz - qw * qy);
    out[3] = 2 * (qx * qy - qw * qz);
    out[4] = 1 - 2 * (qx * qx + qz * qz);
    out[5] = 2 * (qy * qz + qw * qx);
    out[6] = 2 * (qx * qz + qw * qy);
    out[7] = 2 * (qy * qz - qw * qx);
    out[8] = 1 - 2 * (qx * qx + qy * qy);
  }

  /** heading about +y (rad): 0 = +x, positive turns left (towards −z) */
  get yaw(): number {
    return Math.atan2(-2 * (this.qx * this.qz - this.qw * this.qy), 1 - 2 * (this.qy * this.qy + this.qz * this.qz));
  }

  /** nose-up angle (rad) */
  get pitch(): number {
    return Math.asin(clamp(2 * (this.qx * this.qy + this.qw * this.qz), -1, 1));
  }

  /** roll (rad): positive = right side down */
  get roll(): number {
    const sy = 2 * (this.qy * this.qz - this.qw * this.qx);
    const uy = 1 - 2 * (this.qx * this.qx + this.qz * this.qz);
    return Math.atan2(-sy, uy);
  }

  /** Wheel centre in the body frame (for placing wheel meshes). */
  wheelLocal(i: number, out: { x: number; y: number; z: number }): void {
    const w = this.wheels[i];
    const len = clamp(w.travel - w.comp, 0, w.travel);
    out.x = w.hx;
    out.y = w.hy - len;
    out.z = w.hz;
  }

  /** km/h shown on the speedometer */
  get kmh(): number {
    return Math.abs(this.vForward) * 3.6;
  }

  /** Compact state for save games and, later, network replication. */
  serialize(): number[] {
    return [
      this.px, this.py, this.pz, this.qx, this.qy, this.qz, this.qw, this.vx, this.vy, this.vz, this.avx, this.avy, this.avz,
      this.steerAngle, this.throttle, this.brake, this.handbrake, this.dir, this.gear, this.rpm,
      SELECTOR_ORDER.indexOf(this.selector), this.manual ? 1 : 0, this.parkBrake, this.engineOn ? 1 : 0, this.wheelAngle, this.odometer,
    ];
  }

  deserialize(s: readonly number[]): void {
    [this.px, this.py, this.pz, this.qx, this.qy, this.qz, this.qw, this.vx, this.vy, this.vz, this.avx, this.avy, this.avz, this.steerAngle, this.throttle, this.brake, this.handbrake, this.dir, this.gear, this.rpm] = s;
    if (s.length >= 26) {
      this.selector = SELECTOR_ORDER[s[20]] ?? 'D';
      this.manual = s[21] > 0;
      this.parkBrake = s[22];
      this.engineOn = s[23] > 0;
      this.wheelAngle = s[24];
      this.odometer = s[25];
    } else this.wheelAngle = this.steerAngle;
  }
}
