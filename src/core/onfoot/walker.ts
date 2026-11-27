/**
 * Walking in the world (docs/DESIGN_V2.md 6.2): a walker is an upright capsule — a circle of
 * radius `radius` on the plan between its feet and the top of its head — on the land's shape,
 * kept out of every solid nearby.
 *
 *   walk 1.9 m/s · run 3.6 · crouch 1.0 · carrying a big thing alone 1.2 · swimming 1.1
 *   eye 1.50 m (crouched 1.00), hers · jump 0.55 m · steps up to 0.3 m are walked up
 *   slopes up to 38° are walked, steeper ground slides one down and cannot be climbed
 *   wading slows one down; deeper than 1.1 m one swims (and floats: nobody drowns)
 *
 * Fixed steps of 1/120 s; every move is cut into pieces no longer than a third of the radius, so
 * nothing is tunnelled through at any speed. The head is smooth (5.3): steps and snaps are eased
 * out of the eye, the walking bob is a slow sine ≤ 2 cm, nothing above a few hertz.
 *
 * Plan directions are the road's (solids.ts): heading h faces (cos h, sin h) in (x, z), right is
 * (−sin h, cos h). Turning right increases h.
 */
import { Push, pushOut, type Solid, type SolidSource } from '../world/solids';
import { TerrainPoint, type Land } from './land';

export const FOOT = {
  walk: 1.9,
  run: 3.6,
  crouch: 1.0,
  crouchRun: 1.0,
  /** a big thing carried alone (two people: 1.7) */
  carry: 1.2,
  carryTwo: 1.7,
  swim: 1.1,
  /** her eye (docs/V3/plan/character-pv.md: the eye follows her body, about 1.50 m; it was 1.62) */
  eye: 1.5,
  eyeCrouch: 1.0,
  /** swimming: the eye above the (floating) feet; they hang `swimDepth` under the surface */
  eyeSwim: 1.3,
  height: 1.7,
  heightCrouch: 1.2,
  radius: 0.3,
  /** jump height (m) */
  jump: 0.55,
  /** jump initial vertical speed (0 = solve from jump height) */
  jumpV: 0,
  /** jump input buffer and ledge coyote time (s) */
  jumpBuffer: 0,
  coyote: 0,
  /** forbid jumping while crouched */
  noCrouchJump: false,
  /** linear ground accel/brake (m/s^2; 0 = legacy exponential smoothing) */
  groundAccel: 0,
  /** air control share of groundAccel (0..1) and air horizontal drag (/s) */
  airControl: 0.12,
  airDrag: 0,
  step: 0.3,
  slopeDeg: 38,
  /** water deeper than this is swum */
  swimDepth: 1.1,
  /** wading starts to slow one down from this depth */
  wadeFrom: 0.3,
  /** speed kept at the deepest wading */
  wadeKeep: 0.55,
  gravity: 9.81,
  h: 1 / 120,
  /** walking bob amplitude at walking pace (m); grows a little when running, never above 2 cm */
  bob: 0.012,
  bobMax: 0.018,
  /** steps per second: 2.4 walking, 2.9 running (one bob per step) */
  cadence: 1.75,
  cadencePerMs: 0.32,
} as const;

export interface FootProfile {
  readonly walk: number;
  readonly run: number;
  readonly crouch: number;
  readonly crouchRun: number;
  readonly carry: number;
  readonly swim: number;
  readonly eye: number;
  readonly eyeCrouch: number;
  readonly eyeSwim: number;
  readonly height: number;
  readonly heightCrouch: number;
  readonly radius: number;
  readonly jump: number;
  readonly jumpV: number;
  readonly jumpBuffer: number;
  readonly coyote: number;
  readonly noCrouchJump: boolean;
  readonly groundAccel: number;
  readonly airControl: number;
  readonly airDrag: number;
  readonly step: number;
  readonly slopeDeg: number;
  readonly bob: number;
  readonly bobMax: number;
}

/**
 * Nomad Drive on-foot movement profile:
 * walk 2.75 m/s, sprint 5.0, crouch 1.5 (crouch-sprint 2.0), crisp 20 m/s^2 ground accel/brake,
 * air control 0.3 with 0.3/s falling drag, jump v0 = 4.0 m/s (0.82 m apex) with 0.1 s buffer & coyote,
 * capsule radius 0.23 m, standing 1.60 m / crouched 0.70 m, base step 0.45 m, slope 45 deg, zero walking head bob.
 */
export const ND_FOOT: FootProfile = {
  walk: 2.75,
  run: 5.0,
  crouch: 1.5,
  crouchRun: 2.0,
  carry: 1.6,
  swim: 1.4,
  eye: 1.58,
  eyeCrouch: 0.65,
  eyeSwim: 1.3,
  height: 1.66,
  heightCrouch: 0.7,
  radius: 0.23,
  jump: 0.82,
  jumpV: 4.0,
  jumpBuffer: 0.1,
  coyote: 0.1,
  noCrouchJump: true,
  groundAccel: 20,
  airControl: 0.3,
  airDrag: 0.3,
  step: 0.45,
  slopeDeg: 45,
  bob: 0,
  bobMax: 0,
};

function solveJumpV(p: FootProfile): number {
  if (p.jumpV > 0) return p.jumpV;
  return (FOOT.gravity * FOOT.h) / 2 + Math.sqrt(((FOOT.gravity * FOOT.h) / 2) ** 2 + 2 * FOOT.gravity * p.jump);
}
/** a drop this big or less is followed down the next step without leaving the ground */
const SNAP_DOWN = 0.4;
/** how far a floor's edge can be stood on past the middle of the feet */
const FOOT_HOLD = 0.12;

export interface FootInput {
  /** stick: forward and right, −1…1 (the pair is limited to length 1) */
  forward: number;
  right: number;
  run: boolean;
  crouch: boolean;
  /** asks for a jump on the next step it can (cleared by the walker) */
  jump: boolean;
}

export type CarryLoad = 'none' | 'medium' | 'large';

export interface FootState {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  vx: number;
  vy: number;
  vz: number;
  grounded: boolean;
  swimming: boolean;
  crouched: boolean;
}

/** an empty solid source */
export const NO_SOLIDS: SolidSource = { solidsNear: () => {} };

export class FootWalker {
  /** feet on the plan and their height (world m) */
  x = 0;
  y = 0;
  z = 0;
  heading = 0;
  /** look up (+) / down (−), rad: only the view and the pick use it */
  pitch = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  grounded = true;
  swimming = false;
  crouched = false;
  /** water depth over the ground here (0 = dry) */
  depth = 0;
  /** what the hands are full of: a big thing slows one to `carry` and forbids running and jumping */
  load: CarryLoad = 'none';
  /** active movement profile (defaults to legacy FOOT; ModCar applies ND_FOOT) */
  profile: FootProfile = FOOT;
  private tanSlope = Math.tan((FOOT.slopeDeg * Math.PI) / 180);
  private jumpSpeed = solveJumpV(FOOT);
  /** optional dynamic step-up ceiling (m) from vehicle EntryAssistZone; 0 or null uses profile.step */
  stepLimit: ((x: number, y: number, z: number) => number) | null = null;
  /** the walking bob (the comfort setting can switch it off) */
  bobOn = true;
  /** ground slope under the feet (rad) and whether it is too steep to stand */
  slope = 0;
  sliding = false;
  /** the support under the feet comes from a solid's top (a step, a porch) */
  onFloor = false;

  // the eye: smoothed parts
  private eyeH: number = FOOT.eye;
  private stepOff = 0;
  private bobPhase = 0;
  private bobAmp = 0;
  private coyoteT = 0;
  private jumpBufT = 0;
  private acc = 0;
  /** distance walked (m), for the measurements */
  walked = 0;

  private readonly tp = new TerrainPoint();
  private readonly push = new Push();
  private readonly near: Solid[] = [];

  constructor(
    public land: Land,
    public solids: SolidSource = NO_SOLIDS,
  ) {}

  /** switch movement physics profile (e.g. ND_FOOT for Nomad Drive movement) */
  setProfile(p: FootProfile): this {
    this.profile = p;
    this.tanSlope = Math.tan((p.slopeDeg * Math.PI) / 180);
    this.jumpSpeed = solveJumpV(p);
    this.eyeH = this.targetEyeH();
    if (p.bob <= 0) this.bobAmp = 0;
    return this;
  }

  private stepMaxAt(x: number, y: number, z: number): number {
    const base = this.profile.step;
    if (!this.stepLimit || !Number.isFinite(y)) return base;
    const dyn = this.stepLimit(x, y, z);
    return dyn > base ? dyn : base;
  }

  // ---------------------------------------------------------------- queries

  /** height of the land (or a bridge deck, or the bed under it) at a point, for feet at `feet` */
  landAt(x: number, z: number, feet: number): number {
    const t = this.tp;
    this.land.shape(x, z, t);
    // under a bridge: the river's bed is the ground, the deck is overhead
    if (t.bridge > 0 && feet < t.h - 1.0 && t.bed < t.h) {
      this.wl = t.wl;
      return t.bed;
    }
    this.wl = t.wl;
    return t.h;
  }
  /** water level found by the last landAt */
  private wl = -Infinity;

  /** what the feet rest on at (x, z): the land or the top of a floor within a step (solids must be gathered) */
  private supportAt(x: number, z: number, feet: number): number {
    let s = this.landAt(x, z, feet);
    this.onFloor = false;
    this.floorTag = '';
    const maxTop = feet + this.stepMaxAt(x, feet, z) + 1e-6;
    for (const so of this.near) {
      if (!so.floor || so.y1 > maxTop || so.y1 <= s) continue;
      if (pushOut(so, x, z, FOOT_HOLD, this.push)) {
        s = so.y1;
        this.onFloor = true;
        this.floorTag = so.tag;
      }
    }
    return s;
  }
  /** the tag of the floor the feet were last found on ('' on the land): what they fall on (the footsteps) */
  floorTag = '';

  get height(): number {
    return this.crouched ? this.profile.heightCrouch : this.profile.height;
  }

  /** this walker's own walking and running speeds (m/s), where they are not FOOT's (ModCar: Arctic Drive's) */
  speeds: { walk: number; run: number } | null = null;
  /** a share of the speed it walks at (a drink, the cold, a load: ModCar's vitals) */
  speedScale = 1;
  /**
   * What the hands carry asks of the walk besides `load` (docs/ND/PLAN.md: Nomad Drive's furniture is carried as
   * fast as one walks with empty hands, its heaviest pieces a tenth slower and not run with): a share of the
   * speed, and whether one may run.
   */
  loadShare = 1;
  loadRun = true;
  /** whether one can jump with it (a heavy thing in the arms: not) */
  loadJump = true;
  /** jumps made so far (whoever counts stamina takes them off) */
  jumps = 0;
  /** footfalls so far: one each time the walking bob passes a step (on the ground, moving; the footsteps' sounds count them) */
  steps = 0;
  /** landings so far from a fall or a jump, and how fast the last came down (m/s) */
  lands = 0;
  landSpeed = 0;

  /** the speed asked for right now (m/s) */
  topSpeed(run: boolean): number {
    const p = this.profile;
    if (this.swimming) return p.swim * this.speedScale;
    const walk = this.speeds?.walk ?? p.walk;
    const runV = this.speeds?.run ?? p.run;
    const crouchV = run ? p.crouchRun : p.crouch;
    let v: number = (this.load === 'large' ? p.carry : this.crouched ? crouchV : run ? runV : walk) * this.speedScale * this.loadShare;
    if (this.depth > FOOT.wadeFrom) {
      const k = Math.min(1, (this.depth - FOOT.wadeFrom) / (FOOT.swimDepth - FOOT.wadeFrom));
      v *= 1 - (1 - FOOT.wadeKeep) * k;
    }
    return v;
  }

  /** is a solid in the way of a body standing with its feet at `feet`? */
  blocks(s: Solid, feet: number, height = this.height, stepMax = this.stepMaxAt(this.x, feet, this.z)): boolean {
    if (s.y1 <= feet + 0.02) return false; // under the feet
    if (s.floor && s.y1 <= feet + stepMax + 1e-6) return false; // a step: walked up
    // Overhead ceiling/roof slabs must NEVER trigger horizontal pushOut (which blasts players sideways out through
    // camper walls when stepping onto rear decks, furniture, or low-roof vans). Enforced vertically via ceilingAt() (#7).
    if (s.floor && s.y0 >= feet + 0.35) return false;
    if (s.tag.endsWith(':roof') && s.y0 >= feet + 0.2) return false;
    if (s.y0 >= feet + height - 0.14) return false;
    return s.y0 < feet + height;
  }

  /** lowest underside y0 of any overhead solid overlapping the capsule at (x, z) above feet + 0.35 m */
  private ceilingAt(x: number, z: number, feet: number): number {
    const rad = this.profile.radius;
    let minY0 = Infinity;
    for (const s of this.near) {
      if (s.y0 < feet + 0.35) continue;
      if (pushOut(s, x, z, rad, this.push) && s.y0 < minY0) minY0 = s.y0;
    }
    return minY0;
  }

  /** would a body stand free at (x, z) with its feet on the ground there? */
  freeAt(x: number, z: number, margin = 0, maxY = Infinity): boolean {
    const r = this.profile.radius;
    this.gather(x, z, r + margin + 0.5);
    const feet = this.supportAt(x, z, maxY);
    const stepMax = this.stepMaxAt(x, feet, z);
    for (const s of this.near) if (this.blocks(s, feet, this.profile.height, stepMax) && pushOut(s, x, z, r + margin, this.push)) return false;
    return true;
  }

  private gather(x: number, z: number, r: number): void {
    this.near.length = 0;
    this.solids.solidsNear(x, z, r, this.near);
  }

  // ---------------------------------------------------------------- placing

  /**
   * Stand at (x, z) facing `heading`, or at the free spot nearest to it (a spiral search out to
   * `search` m). Returns false when nothing free was found (the walker then stands at (x, z)).
   */
  place(x: number, z: number, heading = this.heading, search = 6, maxY = Infinity): boolean {
    let px = x;
    let pz = z;
    let ok = this.freeAt(x, z, 0, maxY);
    for (let r = 0.25; !ok && r <= search + 1e-9; r += 0.25) {
      const n = Math.max(8, Math.round((2 * Math.PI * r) / 0.25));
      for (let i = 0; i < n && !ok; i++) {
        const a = (i / n) * 2 * Math.PI;
        const cx = x + Math.cos(a) * r;
        const cz = z + Math.sin(a) * r;
        if (this.freeAt(cx, cz, 0, maxY)) {
          px = cx;
          pz = cz;
          ok = true;
        }
      }
    }
    this.x = px;
    this.z = pz;
    this.heading = heading;
    this.vx = this.vy = this.vz = 0;
    this.gather(px, pz, 1);
    this.y = this.supportAt(px, pz, maxY);
    this.grounded = true;
    this.coyoteT = this.profile.coyote;
    this.jumpBufT = 0;
    this.updateWater();
    if (this.swimming) this.y = Math.max(this.y, this.wl - FOOT.swimDepth);
    this.eyeH = this.targetEyeH();
    this.stepOff = 0;
    this.acc = 0;
    return ok;
  }

  /**
   * Place the walker directly at (x, y, z) facing `heading` (e.g. inside a vehicle's living space without snapping up
   * onto its roof): settles onto the highest floor at or below `y + 0.35`, resolving horizontal overlaps.
   */
  placeAt(x: number, y: number, z: number, heading = this.heading, crouch?: boolean): void {
    if (crouch !== undefined) this.crouched = crouch;
    this.x = x;
    this.y = y;
    this.z = z;
    this.heading = heading;
    this.vx = this.vy = this.vz = 0;
    this.gather(x, z, this.profile.radius + 0.8);
    const sup = this.supportAt(x, z, y + 0.35);
    this.y = sup;
    this.resolve();
    this.grounded = true;
    this.coyoteT = this.profile.coyote;
    this.jumpBufT = 0;
    this.updateWater(sup);
    this.eyeH = this.targetEyeH();
    this.stepOff = 0;
    this.acc = 0;
  }

  // ---------------------------------------------------------------- stepping

  /** advance by dt seconds of real time in fixed steps (the remainder is kept for the next call) */
  advance(dt: number, input: FootInput): void {
    this.acc += Math.min(dt, 0.25);
    while (this.acc >= FOOT.h) {
      this.step(input);
      this.acc -= FOOT.h;
    }
  }

  /** one fixed step */
  step(input: FootInput): void {
    const h = FOOT.h;
    const p = this.profile;
    // crouching: standing back up needs the room to
    if (input.crouch !== this.crouched) {
      if (input.crouch || this.headroomFor(p.height)) this.crouched = input.crouch && !this.swimming;
    }
    // ---- what the legs ask for
    let f = input.forward;
    let r = input.right;
    const len = Math.hypot(f, r);
    if (len > 1) {
      f /= len;
      r /= len;
    }
    const c = Math.cos(this.heading);
    const s = Math.sin(this.heading);
    const top = this.topSpeed(input.run && this.load !== 'large' && this.loadRun);
    const tx = (f * c - r * s) * top;
    const tz = (f * s + r * c) * top;
    if (p.groundAccel > 0) {
      if (this.grounded || this.swimming) {
        const dvx = tx - this.vx;
        const dvz = tz - this.vz;
        const dv = Math.hypot(dvx, dvz);
        const maxDv = p.groundAccel * h;
        if (dv <= maxDv) {
          this.vx = tx;
          this.vz = tz;
        } else {
          this.vx += (dvx / dv) * maxDv;
          this.vz += (dvz / dv) * maxDv;
        }
      } else {
        // airborne: reduced control toward wish velocity plus gentle lateral drag
        if (len > 1e-4) {
          const dvx = tx - this.vx;
          const dvz = tz - this.vz;
          const dv = Math.hypot(dvx, dvz);
          const maxDv = p.groundAccel * p.airControl * h;
          if (dv <= maxDv) {
            this.vx = tx;
            this.vz = tz;
          } else {
            this.vx += (dvx / dv) * maxDv;
            this.vz += (dvz / dv) * maxDv;
          }
        }
        if (p.airDrag > 0) {
          const drag = Math.max(0, 1 - p.airDrag * h);
          this.vx *= drag;
          this.vz *= drag;
        }
      }
    } else {
      const k = this.grounded || this.swimming ? 1 - Math.exp(-h / 0.075) : 1 - Math.exp(-h / 0.6);
      this.vx += (tx - this.vx) * k;
      this.vz += (tz - this.vz) * k;
    }

    // ---- slope: too steep to climb, and one slides down it
    this.sliding = false;
    this.slope = 0;
    if (this.grounded && !this.swimming && !this.onFloor) {
      const e = 0.25;
      const gx = (this.landAt(this.x + e, this.z, this.y) - this.landAt(this.x - e, this.z, this.y)) / (2 * e);
      const gz = (this.landAt(this.x, this.z + e, this.y) - this.landAt(this.x, this.z - e, this.y)) / (2 * e);
      const g = Math.hypot(gx, gz);
      this.slope = Math.atan(g);
      if (g > this.tanSlope) {
        this.sliding = true;
        const nx = gx / g;
        const nz = gz / g;
        // no way up it…
        const up = this.vx * nx + this.vz * nz;
        if (up > 0) {
          this.vx -= nx * up;
          this.vz -= nz * up;
        }
        // …and down it one goes, faster the steeper
        const sinA = g / Math.sqrt(1 + g * g);
        const down = FOOT.gravity * (sinA - 0.55);
        this.vx -= nx * Math.max(1.2, down) * h * 4;
        this.vz -= nz * Math.max(1.2, down) * h * 4;
        const v = Math.hypot(this.vx, this.vz);
        if (v > 4) {
          this.vx *= 4 / v;
          this.vz *= 4 / v;
        }
      }
    }

    // ---- move across the plan in short pieces, kept out of solids
    const dx = this.vx * h;
    const dz = this.vz * h;
    const dist = Math.hypot(dx, dz);
    this.gather(this.x, this.z, p.radius + dist + 0.6);
    const n = Math.max(1, Math.ceil(dist / (p.radius / 3)));
    const x0 = this.x;
    const z0 = this.z;
    for (let i = 0; i < n; i++) {
      const px = this.x;
      const pz = this.z;
      this.x += dx / n;
      this.z += dz / n;
      this.resolve();
      // the feet follow the ground between the pieces so a step met half way is walked up
      if (this.grounded && !this.swimming) {
        const sup = this.supportAt(this.x, this.z, this.y);
        const sm = this.stepMaxAt(this.x, this.y, this.z);
        if (sup <= this.y + sm + 1e-6 && sup >= this.y - SNAP_DOWN) {
          const ceil = this.ceilingAt(this.x, this.z, sup);
          const avail = ceil - sup;
          if (avail < p.heightCrouch + 0.04) {
            // Even crouched body cannot fit under overhead ceiling here (e.g. over-cab bunk / ceiling-touching furniture)
            this.x = px;
            this.z = pz;
            this.vx = 0;
            this.vz = 0;
            break;
          }
          if (avail < p.height + 0.02) {
            // Low ceiling (Old Elephant rear deck, Loaf van, stepping onto cabinet): auto-duck cleanly, never teleport (#7)
            this.crouched = true;
          }
          this.setFeet(sup);
        }
      }
    }
    this.walked += Math.hypot(this.x - x0, this.z - z0);

    // ---- up and down
    const sup = this.supportAt(this.x, this.z, this.y);
    this.updateWater(sup);
    if (this.swimming) {
      // float with the feet `swimDepth` under the surface (falling in from above first comes down to it)
      const target = Math.max(this.wl - FOOT.swimDepth, sup);
      if (this.y > target + 0.05) {
        this.vy -= FOOT.gravity * h;
        this.y = Math.max(target, this.y + this.vy * h);
      } else {
        this.vy = 0;
        this.y += (target - this.y) * (1 - Math.exp(-h / 0.25));
      }
      this.grounded = false;
    } else if (this.grounded) {
      if (sup >= this.y - SNAP_DOWN) this.setFeet(sup);
      else {
        this.grounded = false; // walked off an edge
        this.vy = 0;
      }
    } else {
      const prevHead = this.y + this.height;
      this.vy -= FOOT.gravity * h;
      this.y += this.vy * h;
      // ceiling clamp while rising: prevent head from clipping through an interior roof
      // Check ALL overlapping ceiling solids using the full capsule radius and leave a 5 mm clearance margin
      // so IEEE-754 rounding never triggers horizontal pushOut in resolve().
      if (this.vy > 0) {
        const curHead = this.y + this.height;
        let minCeil = Infinity;
        for (const so of this.near) {
          if (so.y0 < prevHead - 0.12 || so.y0 >= curHead) continue;
          if (pushOut(so, this.x, this.z, p.radius, this.push) && so.y0 < minCeil) minCeil = so.y0;
        }
        if (minCeil < Infinity) {
          this.y = Math.max(sup, minCeil - this.height - 0.005);
          this.vy = 0;
        }
      }
      if (this.y <= sup) {
        // (come down from a jump or off an edge: a landing, if it was more than a step's drop)
        if (this.vy < -1.2) {
          this.lands++;
          this.landSpeed = -this.vy;
        }
        this.y = sup;
        this.vy = 0;
        this.grounded = true;
      }
    }
    if (this.y < sup) this.y = sup;
    // coming down past the edge of a floor (or onto lower ground) can bring a solid into the way: out of it again
    this.resolve();

    // coyote time & jump buffer
    if (this.grounded && !this.swimming && !this.sliding) this.coyoteT = p.coyote;
    else this.coyoteT = Math.max(0, this.coyoteT - h);

    if (input.jump) {
      input.jump = false;
      this.jumpBufT = Math.max(h * 1.5, p.jumpBuffer);
    } else if (this.jumpBufT > 0) {
      this.jumpBufT = Math.max(0, this.jumpBufT - h);
    }

    if (
      this.jumpBufT > 0 &&
      (this.grounded || this.coyoteT > 0) &&
      !this.swimming &&
      !(p.noCrouchJump && this.crouched) &&
      this.load !== 'large' &&
      this.loadJump &&
      !this.sliding
    ) {
      this.vy = this.jumpSpeed;
      this.grounded = false;
      this.coyoteT = 0;
      this.jumpBufT = 0;
      this.jumps++;
    }

    // ---- the eye: eased height, eased steps, a slow bob (0 when profile.bob === 0)
    const tk = 1 - Math.exp(-h / 0.16);
    this.eyeH += (this.targetEyeH() - this.eyeH) * tk;
    this.stepOff *= Math.exp(-h / 0.11);
    const v = Math.hypot(this.vx, this.vz);
    const want = this.bobOn && p.bob > 0 && this.grounded && !this.swimming && v > 0.2 ? Math.min(p.bobMax, p.bob * (v / p.walk)) : 0;
    this.bobAmp += (want - this.bobAmp) * (1 - Math.exp(-h / 0.3));
    // one bob per step; the phase runs over two steps so the sway of the hands (left, right) has its own half rate
    const cadence = (FOOT.cadence + FOOT.cadencePerMs * v) * (v / (v + 0.3));
    const phase0 = this.bobPhase;
    this.bobPhase = (this.bobPhase + cadence * h * Math.PI * 2) % (Math.PI * 4);
    // (a footfall each time the phase passes a step, two to its turn: on the ground and moving)
    if (this.grounded && !this.swimming && v > 0.25 && Math.floor(this.bobPhase / (Math.PI * 2)) !== Math.floor(phase0 / (Math.PI * 2))) this.steps++;
  }

  /** move the feet to y; a sudden change (a step, a snap down) is taken out of the eye and eased back in */
  private setFeet(y: number): void {
    const d = y - this.y;
    if (d > 0.03 || d < -0.03) this.stepOff -= d;
    this.y = y;
  }

  private updateWater(sup = this.supportAt(this.x, this.z, this.y)): void {
    this.landAt(this.x, this.z, this.y);
    const wl = this.wl;
    this.depth = wl > sup ? wl - sup : 0;
    this.swimming = this.depth > FOOT.swimDepth;
    if (this.swimming) this.crouched = false;
  }

  /** push the body out of every solid in its way (a few passes for corners) */
  private resolve(): void {
    const p = this.push;
    const rad = this.profile.radius;
    const stepMax = this.stepMaxAt(this.x, this.y, this.z);
    for (let it = 0; it < 4; it++) {
      let moved = false;
      for (const s of this.near) {
        if (!this.blocks(s, this.y, this.height, stepMax)) continue;
        if (!pushOut(s, this.x, this.z, rad, p)) continue;
        this.x = p.x;
        this.z = p.z;
        // what was going into it stops
        const vn = this.vx * p.nx + this.vz * p.nz;
        if (vn < 0) {
          this.vx -= p.nx * vn;
          this.vz -= p.nz * vn;
        }
        moved = true;
      }
      if (!moved) return;
    }
  }

  private headroomFor(height: number): boolean {
    const rad = this.profile.radius;
    this.gather(this.x, this.z, rad + 0.5);
    if (this.ceilingAt(this.x, this.z, this.y) < this.y + height + 0.02) return false;
    const stepMax = this.stepMaxAt(this.x, this.y, this.z);
    for (const s of this.near) if (this.blocks(s, this.y, height, stepMax) && pushOut(s, this.x, this.z, rad, this.push)) return false;
    return true;
  }

  private targetEyeH(): number {
    const p = this.profile;
    const base = this.swimming ? p.eyeSwim : this.crouched ? p.eyeCrouch : p.eye;
    if (!this.swimming) {
      const ceil = this.ceilingAt(this.x, this.z, this.y);
      if (ceil < Infinity) return Math.min(base, Math.max(0.45, ceil - this.y - 0.1));
    }
    return base;
  }

  /** inside a solid that is in the way (for the tests) */
  insideSolid(margin = 0.01): boolean {
    const rad = this.profile.radius;
    this.gather(this.x, this.z, rad + 0.5);
    const stepMax = this.stepMaxAt(this.x, this.y, this.z);
    for (const s of this.near) if (this.blocks(s, this.y, this.height, stepMax) && pushOut(s, this.x, this.z, rad - margin, this.push)) return true;
    return false;
  }

  /**
   * Where the view stands from the walker's own eye as it looks level and how much further as it looks down (m, and m
   * a radian): ahead of it and below it — a character's head carries her eyes forward of her spine and down as she bows
   * it (the game's, measured on her: HerInGame). `turn`: the view goes round a point that far behind it as it looks
   * up and down (m) — ahead by turn·(1 − cos), down by turn·sin of how far down it looks (Nomad Drive's first-person
   * view turns so about its neck, 0.1 m: looking down, the view comes out over the chest). All nothing by default: the
   * view is the walker's own eye.
   */
  readonly view = { ahead: 0, aheadDown: 0, below: 0, belowDown: 0, turn: 0 };

  /**
   * The eye the view is from, and so the one everything is aimed from: the walker's own (eyeBase) and where the view
   * stands from it by how it looks now (view) — a function of the heading and the pitch alone, with no lag: the mark
   * is on what the hands reach for, and stays there when the view stops turning.
   */
  eye(out: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }): { x: number; y: number; z: number } {
    this.eyeBase(out);
    const v = this.view;
    if (v.ahead !== 0 || v.below !== 0 || v.aheadDown !== 0 || v.belowDown !== 0 || v.turn !== 0) {
      // (how far down it looks, as far as a neck bows: a little up, more down)
      const u = Math.max(-0.9, Math.min(1.1, -this.pitch));
      const a = v.ahead + v.aheadDown * u + v.turn * (1 - Math.cos(u));
      out.x += Math.cos(this.heading) * a;
      out.z += Math.sin(this.heading) * a;
      out.y -= v.below + v.belowDown * u + v.turn * Math.sin(u);
    }
    return out;
  }

  /**
   * The heading and the pitch that put a point dead ahead of the eye. Solved, not read off the eye as it is: the eye
   * stands ahead of the feet along the heading and moves as the look tips (view), so the angle to a point from where
   * the eye is now is not the angle from where it will be once it looks there — a few centimetres off at arm's
   * length, which is a knob missed.
   */
  lookAt(x: number, y: number, z: number, out: { yaw: number; pitch: number } = { yaw: 0, pitch: 0 }): { yaw: number; pitch: number } {
    const d = Math.hypot(x - this.x, z - this.z);
    const h = this.y + this.eyeH + this.stepOff + this.bobAmp * Math.sin(this.bobPhase);
    const v = this.view;
    let pitch = this.pitch;
    for (let i = 0; i < 8; i++) {
      const u = Math.max(-0.9, Math.min(1.1, -pitch));
      pitch = Math.atan2(y - h + v.below + v.belowDown * u + v.turn * Math.sin(u), d - v.ahead - v.aheadDown * u - v.turn * (1 - Math.cos(u)));
    }
    out.yaw = d > 1e-6 ? Math.atan2(z - this.z, x - this.x) : this.heading;
    out.pitch = pitch;
    return out;
  }

  /** the walker's own eye: over its feet at its eye height, with its steps' bob (where the view is put before a character's head moves it) */
  eyeBase(out: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }): { x: number; y: number; z: number } {
    out.x = this.x;
    out.z = this.z;
    out.y = this.y + this.eyeH + this.stepOff + this.bobAmp * Math.sin(this.bobPhase);
    return out;
  }

  /**
   * Held where one sits (docs/ND/PLAN.md: a chair, a sofa): the feet at (x, y, z) and still, the eye eased to
   * `eye` above them within about a tenth of a second (Nomad Drive's 0.12 s), no bob; the walk takes up from
   * there again (the eye easing back up as it does after crouching).
   */
  hold(x: number, y: number, z: number, eye: number, dt: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = this.vy = this.vz = 0;
    this.grounded = true;
    this.sliding = false;
    const k = 1 - Math.exp(-dt / 0.04);
    this.eyeH += (eye - this.eyeH) * k;
    this.stepOff *= 1 - k;
    this.bobAmp = 0;
  }

  /** the unit view direction (heading + pitch) */
  look(out: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }): { x: number; y: number; z: number } {
    const cp = Math.cos(this.pitch);
    out.x = Math.cos(this.heading) * cp;
    out.y = Math.sin(this.pitch);
    out.z = Math.sin(this.heading) * cp;
    return out;
  }

  /** the side-to-side sway of the hands with the walk (−1…1 × amplitude), for the first-person held thing */
  get sway(): number {
    return this.bobAmp * Math.sin(this.bobPhase / 2);
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vz);
  }

  toJSON(): FootState {
    return { x: this.x, y: this.y, z: this.z, heading: this.heading, pitch: this.pitch, vx: this.vx, vy: this.vy, vz: this.vz, grounded: this.grounded, swimming: this.swimming, crouched: this.crouched };
  }

  restore(s: FootState): this {
    this.x = s.x;
    this.y = s.y;
    this.z = s.z;
    this.heading = s.heading;
    this.pitch = s.pitch;
    this.vx = s.vx;
    this.vy = s.vy;
    this.vz = s.vz;
    this.grounded = s.grounded;
    this.swimming = s.swimming;
    this.crouched = s.crouched;
    this.eyeH = this.targetEyeH();
    this.stepOff = 0;
    return this;
  }
}
