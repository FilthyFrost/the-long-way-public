/**
 * Robot driver: pure-pursuit steering plus a speed governor. It is the automated test
 * driver (lane keeping, crash statistics) and the game's attract / benchmark mode.
 */
import { clamp } from '../math/util';
import { GRAVITY, type VehicleInput, type VehicleSim } from '../vehicle/sim';

export interface PathProbe {
  x: number;
  y: number;
  z: number;
  /** unit tangent in the horizontal plane */
  tx: number;
  tz: number;
  /** curvature (1/m), + = turning right */
  kappa: number;
}

export interface DrivePath {
  /** arc length of the closest point and signed lateral offset (+ = right of the path) */
  project(x: number, z: number, hint: number, out: { s: number; d: number }): void;
  probe(s: number, out: PathProbe): void;
}

export interface RobotOptions {
  /** lateral offset to hold, + = right of the centre line (m) */
  lane: number;
  /** cruising speed (m/s) */
  cruise: number;
  /** comfortable lateral acceleration in corners (g) */
  latG: number;
  /** comfortable braking (m/s²) */
  decel: number;
  /** integral gain on the lateral error (rad per m·s): trims out steady understeer in long curves */
  laneKi: number;
  /** limit of that trim (rad) */
  laneTrimMax: number;
}

export class RobotDriver {
  opts: RobotOptions;
  /** last projection, useful for metrics */
  s = 0;
  d = 0;
  targetSpeed = 0;
  private integ = 0;
  /** steering trim from the lateral-error integral (rad) */
  trim = 0;
  private prevErr = 0;
  /** smoothed grip under the wheels (1 = dry asphalt) */
  grip = 1;
  private readonly proj = { s: 0, d: 0 };
  private readonly probe: PathProbe = { x: 0, y: 0, z: 0, tx: 1, tz: 0, kappa: 0 };
  private readonly b = new Float64Array(9);
  private readonly out: VehicleInput = { steer: 0, throttle: 0, brake: 0, handbrake: 0 };

  constructor(opts: Partial<RobotOptions> = {}) {
    this.opts = { lane: 0, cruise: 16.7, latG: 0.3, decel: 2.2, laneKi: 0.012, laneTrimMax: 0.12, ...opts };
  }

  update(dt: number, veh: VehicleSim, path: DrivePath): VehicleInput {
    const o = this.opts;
    const out = this.out;
    const pr = this.probe;
    path.project(veh.px, veh.pz, this.s, this.proj);
    this.s = this.proj.s;
    this.d = this.proj.d;
    const v = veh.speed;

    // --- steering: aim at a point ahead on the lane
    const Ld = clamp(4 + 0.75 * v, 5, 26);
    path.probe(this.s + Ld, pr);
    const txp = pr.x - pr.tz * o.lane; // right normal = (−tz, tx)
    const tzp = pr.z + pr.tx * o.lane;
    const b = this.b;
    veh.basis(b);
    // horizontal forward / right
    let fx = b[0];
    let fz = b[2];
    const fl = Math.sqrt(fx * fx + fz * fz) || 1;
    fx /= fl;
    fz /= fl;
    const dx = txp - veh.px;
    const dz = tzp - veh.pz;
    const ahead = dx * fx + dz * fz;
    const right = dx * -fz + dz * fx;
    const dist2 = ahead * ahead + right * right;
    const kappaCmd = dist2 > 1 ? (2 * right) / dist2 : 0;
    // slow trim: if the car sits right of the lane (d > lane) steer a little more to the left, and vice versa
    const sat = out.steer >= 1 || out.steer <= -1;
    // (only while the error is small and steady — never during a lane change or a recovery)
    const laneErr = this.d - o.lane;
    const errRate = dt > 0 ? (laneErr - this.prevErr) / dt : 0;
    this.prevErr = laneErr;
    if (!sat && v > 2 && laneErr > -0.8 && laneErr < 0.8 && errRate > -0.12 && errRate < 0.12) {
      this.trim = clamp(this.trim - laneErr * o.laneKi * dt, -o.laneTrimMax, o.laneTrimMax);
    }
    const delta = Math.atan(veh.spec.wheelbase * kappaCmd) + this.trim;
    out.steer = clamp(delta / Math.max(veh.maxSteerNow, 0.01), -1, 1);

    // --- speed: slow down in time for the tightest curve within braking range.
    // A careful driver reads the road: on a wet or snowy surface everything is scaled by the grip.
    let grip = 1;
    for (let i = 0; i < 4; i++) if (veh.wheels[i].contact && veh.wheels[i].mu < grip) grip = veh.wheels[i].mu;
    this.grip += (grip - this.grip) * Math.min(1, dt * 2);
    const care = clamp(this.grip / 0.95, 0.3, 1);
    let vt = o.cruise * (0.55 + 0.45 * care);
    const aLat = o.latG * GRAVITY * care;
    const decel = o.decel * care;
    const horizon = clamp((v * v) / (2 * decel) + 20, 30, 260);
    for (let x = 0; x <= horizon; x += 8) {
      path.probe(this.s + x, pr);
      const k = pr.kappa < 0 ? -pr.kappa : pr.kappa;
      if (k < 1e-5) continue;
      const vc = Math.sqrt(aLat / k);
      const allowed = Math.sqrt(vc * vc + 2 * decel * Math.max(0, x - 6));
      if (allowed < vt) vt = allowed;
    }
    this.targetSpeed = vt;
    const err = vt - v;
    this.integ = clamp(this.integ + err * dt * 0.12, -0.2, 0.6);
    const u = err * 0.35 + this.integ;
    if (u >= 0) {
      out.throttle = clamp(u, 0, 1);
      out.brake = 0;
    } else {
      out.throttle = 0;
      out.brake = err < -0.5 ? clamp(-err * 0.3, 0, 0.9) * (0.4 + 0.6 * care) : 0;
    }
    out.handbrake = 0;
    return out;
  }
}

/** Straight line along +x at z = 0. */
export class StraightPath implements DrivePath {
  project(x: number, z: number, _hint: number, out: { s: number; d: number }): void {
    out.s = x;
    out.d = z;
  }
  probe(s: number, out: PathProbe): void {
    out.x = s;
    out.y = 0;
    out.z = 0;
    out.tx = 1;
    out.tz = 0;
    out.kappa = 0;
  }
}

/** Circle of radius R centred at the origin, driven clockwise seen from above (a right turn). */
export class CirclePath implements DrivePath {
  constructor(public R: number) {}
  // parameterise by angle a = s/R: position (R sin a, −R cos a)… tangent (cos a, sin a): heading turns towards +z = right turn
  project(x: number, z: number, _hint: number, out: { s: number; d: number }): void {
    const r = Math.sqrt(x * x + z * z);
    let a = Math.atan2(x, -z);
    if (a < 0) a += 2 * Math.PI;
    // unwrap near the hint
    const turns = Math.round((_hint / this.R - a) / (2 * Math.PI));
    out.s = (a + turns * 2 * Math.PI) * this.R;
    out.d = this.R - r; // inside the circle = right of the path
  }
  probe(s: number, out: PathProbe): void {
    const a = s / this.R;
    out.x = this.R * Math.sin(a);
    out.y = 0;
    out.z = -this.R * Math.cos(a);
    out.tx = Math.cos(a);
    out.tz = Math.sin(a);
    out.kappa = 1 / this.R;
  }
}
