/**
 * What the proving ground reads off a vehicle (docs/MODCAR.md §28): speed, revs, the lateral and longitudinal g the
 * seat feels (the sim's specific force, smoothed as it already is over 40 ms), the body's slip angle (how far its
 * travel points off its heading), the yaw rate, roll and pitch; the wheels: on the ground, at the bump stops,
 * locked. Kept for the last seconds for the live charts, and as a run's trace for comparing two runs.
 */
import { GRAVITY, type VehicleSim } from '../../vehicle/sim';

const DEG = 180 / Math.PI;

/** the state of a vehicle as the runs and the charts see it, a frame */
export interface CarState {
  /** the game's clock (s) */
  t: number;
  x: number;
  z: number;
  /** heading on the plan: its forward is (cos h, sin h) in (x, z) */
  heading: number;
  /** speed (m/s; km/h), and along its heading (m/s) */
  speed: number;
  kmh: number;
  vForward: number;
  rpm: number;
  /** g: + towards its right; + forward */
  latG: number;
  longG: number;
  /** body slip angle (deg; + its travel to the right of its heading; 0 at walking pace), yaw rate (deg/s, + to the right) */
  slipDeg: number;
  yawDeg: number;
  /** body roll (deg, + right side down) and pitch (deg, + nose up) */
  rollDeg: number;
  pitchDeg: number;
  /** the pedals and the wheel as driven: 0…1, steer −1…1 */
  throttle: number;
  brake: number;
  steer: number;
  /** wheels on the ground, at their bump stops, locked under the brake (counts of four) */
  contacts: number;
  bottomed: number;
  locked: number;
  /** the engine runs */
  running: boolean;
}

export function newCarState(): CarState {
  return { t: 0, x: 0, z: 0, heading: 0, speed: 0, kmh: 0, vForward: 0, rpm: 0, latG: 0, longG: 0, slipDeg: 0, yawDeg: 0, rollDeg: 0, pitchDeg: 0, throttle: 0, brake: 0, steer: 0, contacts: 4, bottomed: 0, locked: 0, running: true };
}

const B = new Float64Array(9);

/** read a vehicle's state off its sim (the revs and running as its systems have them) */
export function readCar(sim: VehicleSim, t: number, rpm: number, running: boolean, out: CarState): CarState {
  sim.basis(B);
  const fl = Math.hypot(B[0], B[2]) || 1;
  const fx = B[0] / fl;
  const fz = B[2] / fl;
  out.t = t;
  out.x = sim.px;
  out.z = sim.pz;
  out.heading = Math.atan2(fz, fx);
  out.speed = sim.speed;
  out.kmh = sim.speed * 3.6;
  out.vForward = sim.vForward;
  out.rpm = rpm;
  out.latG = sim.accZ / GRAVITY;
  out.longG = sim.accX / GRAVITY;
  // (the travel against the heading, on the plan: right is (−fz, fx))
  const side = -sim.vx * fz + sim.vz * fx;
  const along = sim.vx * fx + sim.vz * fz;
  out.slipDeg = sim.speed > 2.5 ? Math.atan2(side, Math.max(0.5, Math.abs(along))) * DEG : 0;
  // (the sim's yaw rate is about +y: + turns left)
  out.yawDeg = -sim.yawRate * DEG;
  out.rollDeg = sim.roll * DEG;
  out.pitchDeg = sim.pitch * DEG;
  out.throttle = sim.throttle;
  out.brake = sim.brake;
  out.steer = sim.maxSteerNow > 0 ? sim.steerAngle / sim.maxSteerNow : 0;
  let contacts = 0;
  let bottomed = 0;
  let locked = 0;
  const n = sim.wheels.length;
  for (let i = 0; i < n; i++) {
    const w = sim.wheels[i];
    if (!w.contact) continue;
    contacts++;
    if (w.comp >= w.travel * 0.985) bottomed++;
    if (sim.speed > 3 && Math.abs(w.omega * w.radius) < 0.2 * sim.speed) locked++;
  }
  // (a motorcycle's two wheels are its four: as many as it has)
  const k = n > 0 ? 4 / n : 1;
  out.contacts = contacts * k;
  out.bottomed = bottomed * k;
  out.locked = locked * k;
  out.running = running;
  return out;
}

/** the channels the charts draw */
export const CHANNELS = [
  { key: 'kmh', zh: '速度', unit: 'km/h' },
  { key: 'rpm', zh: '转速', unit: 'rpm' },
  { key: 'latG', zh: '侧向 G', unit: 'g' },
  { key: 'slipDeg', zh: '打滑角', unit: '°' },
] as const;
export type Channel = (typeof CHANNELS)[number]['key'];

/** a run's samples: its x (time or distance, the section's) and each channel */
export class Trace {
  readonly x: number[] = [];
  readonly t: number[] = [];
  readonly ch: Record<Channel, number[]> = { kmh: [], rpm: [], latG: [], slipDeg: [] };

  push(x: number, c: CarState): void {
    this.x.push(x);
    this.t.push(c.t);
    for (const k of Object.keys(this.ch) as Channel[]) this.ch[k].push(c[k]);
  }

  get length(): number {
    return this.x.length;
  }

  /** the value of a channel at x (linear between samples; NaN outside) */
  at(k: Channel, x: number): number {
    const xs = this.x;
    const n = xs.length;
    if (!n || x < xs[0] || x > xs[n - 1]) return NaN;
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (xs[m] <= x) lo = m;
      else hi = m;
    }
    const a = xs[lo];
    const b = xs[hi];
    const v = this.ch[k];
    return b > a ? v[lo] + ((v[hi] - v[lo]) * (x - a)) / (b - a) : v[lo];
  }
}

/** the last seconds of a vehicle's state, for the live charts */
export class Recent {
  readonly trace = new Trace();
  constructor(
    /** seconds kept */
    readonly keep = 15,
    /** samples a second */
    readonly hz = 30,
  ) {}
  private last = -Infinity;

  add(c: CarState): void {
    if (c.t - this.last < 1 / this.hz) return;
    this.last = c.t;
    const tr = this.trace;
    tr.push(c.t, c);
    // (drop what has fallen off the back, in a lump now and then)
    if (tr.t.length > this.keep * this.hz * 1.25) {
      const cut = tr.t.length - Math.round(this.keep * this.hz);
      tr.x.splice(0, cut);
      tr.t.splice(0, cut);
      for (const k of Object.keys(tr.ch) as Channel[]) tr.ch[k].splice(0, cut);
    }
  }

  clear(): void {
    const tr = this.trace;
    tr.x.length = tr.t.length = 0;
    for (const k of Object.keys(tr.ch) as Channel[]) tr.ch[k].length = 0;
    this.last = -Infinity;
  }
}
