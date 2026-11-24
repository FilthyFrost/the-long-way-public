/**
 * The proving ground's robot driver (docs/MODCAR.md §28): it drives a section's run the same way every time, so two
 * builds can be compared on it (two runs back to back, A then B). Pure pursuit on the section's line and a speed
 * governor (core/driver/robot.ts), with each section's own way of driving it:
 *  - 直线加速: full throttle down the lane to the kilometre, then brakes to a stop;
 *  - 刹车: up to 100 km/h (or as fast as it gets by the line), full brake from the brake line to a stop;
 *  - 定圆: round the circle, a little faster every lap until it cannot hold the lane, then slows to a stop;
 *  - 绕桩: through the cones at a set speed, then stops past the gate out;
 *  - 越野路段: the course at a speed for each feature (walking pace over the twister and the logs), stops past the finish;
 *  - 坡道: up the middle ramp at a crawl, stops on its top.
 */
import { RobotDriver, type DrivePath, type PathProbe } from '../../driver/robot';
import { zeroInput, type VehicleInput, type VehicleSim } from '../../vehicle/sim';
import { BRAKE_U, HILL, KM_U, LANE_OUT, OFFROAD_FINISH, SKIDPAD, SLALOM, SLALOM_LAST, SLALOM_OUT, START_X, loopAt, loopProject, type SectionId } from './layout';
import type { RunPhase } from './runs';

const KMH = 1 / 3.6;
/** the slalom pushed to the grip goes in at this (km/h) */
const PUSH_IN = 35;
/** off the slalom's line by more than this (m) the push slows down; under this it may go faster */
const SLALOM_OFF_SLOW = 0.45;
const SLALOM_OFF_FAST = 0.25;

/** a straight line from (x0, z0) along the unit (dx, dz) */
export class LinePath implements DrivePath {
  constructor(
    readonly x0: number,
    readonly z0: number,
    readonly dx: number,
    readonly dz: number,
  ) {}
  project(x: number, z: number, _hint: number, out: { s: number; d: number }): void {
    const rx = x - this.x0;
    const rz = z - this.z0;
    out.s = rx * this.dx + rz * this.dz;
    // (right of the way: (−dz, dx))
    out.d = -rx * this.dz + rz * this.dx;
  }
  probe(s: number, out: PathProbe): void {
    out.x = this.x0 + this.dx * s;
    out.y = 0;
    out.z = this.z0 + this.dz * s;
    out.tx = this.dx;
    out.tz = this.dz;
    out.kappa = 0;
  }
}

/** a circle round (cx, cz), driven from (cx, cz + R) along +x: a left turn */
export class LeftCircle implements DrivePath {
  constructor(
    readonly cx: number,
    readonly cz: number,
    readonly R: number,
  ) {}
  // (at angle θ: (cx + R sin θ, cz + R cos θ), heading (cos θ, −sin θ))
  project(x: number, z: number, hint: number, out: { s: number; d: number }): void {
    const rx = x - this.cx;
    const rz = z - this.cz;
    let th = Math.atan2(rx, rz);
    if (th < 0) th += 2 * Math.PI;
    const turns = Math.round((hint / this.R - th) / (2 * Math.PI));
    out.s = (th + turns * 2 * Math.PI) * this.R;
    // (outside the circle is its right)
    out.d = Math.hypot(rx, rz) - this.R;
  }
  probe(s: number, out: PathProbe): void {
    const th = s / this.R;
    out.x = this.cx + this.R * Math.sin(th);
    out.y = 0;
    out.z = this.cz + this.R * Math.cos(th);
    out.tx = Math.cos(th);
    out.tz = -Math.sin(th);
    out.kappa = -1 / this.R;
  }
}

/** the slalom's line: down its lane along −x, swinging `amp` either side of each cone in turn */
export class WeavePath implements DrivePath {
  private readonly u0: number;
  private readonly u9: number;
  constructor(readonly amp: number) {
    this.u0 = START_X - SLALOM.first;
    this.u9 = START_X - SLALOM_LAST;
  }
  /** the offset across (+z) at u along the lane, and its first and second derivatives */
  private off(u: number): [number, number, number] {
    const g = SLALOM.gap;
    const k = Math.PI / g;
    // (in from the lane's middle over the gap before the first cone, out over the gap after the last)
    const e = (a: number, b: number, x: number): [number, number, number] => {
      if (x <= a) return [0, 0, 0];
      if (x >= b) return [1, 0, 0];
      const t = (x - a) / (b - a);
      return [t * t * (3 - 2 * t), (6 * t * (1 - t)) / (b - a), (6 - 12 * t) / ((b - a) * (b - a))];
    };
    const [ei, ei1, ei2] = e(this.u0 - g, this.u0, u);
    const [eo0, eo1, eo2] = e(this.u9, this.u9 + g, u);
    const eo = 1 - eo0;
    const E = ei * eo;
    const E1 = ei1 * eo - ei * eo1;
    const E2 = ei2 * eo - 2 * ei1 * eo1 - ei * eo2;
    const c = Math.cos(k * (u - this.u0));
    const sN = Math.sin(k * (u - this.u0));
    const w = this.amp * c;
    const w1 = -this.amp * k * sN;
    const w2 = -this.amp * k * k * c;
    return [E * w, E1 * w + E * w1, E2 * w + 2 * E1 * w1 + E * w2];
  }
  project(x: number, z: number, _hint: number, out: { s: number; d: number }): void {
    const u = START_X - x;
    out.s = u;
    // (right of a way along −x is −z)
    out.d = -(z - (SLALOM.z + this.off(u)[0]));
  }
  probe(s: number, out: PathProbe): void {
    const [o, o1, o2] = this.off(s);
    const n = Math.hypot(1, o1);
    out.x = START_X - s;
    out.y = 0;
    out.z = SLALOM.z + o;
    out.tx = -1 / n;
    out.tz = o1 / n;
    // (bending towards −z, its right, is turning right)
    out.kappa = -o2 / (n * n * n);
  }
}

/** the off-road loop's middle line */
export class LoopPath implements DrivePath {
  private readonly lp = { s: 0, d: 0 };
  private readonly p = { x: 0, z: 0, tx: 0, tz: 0, kappa: 0 };
  project(x: number, z: number, _hint: number, out: { s: number; d: number }): void {
    loopProject(x, z, this.lp);
    out.s = this.lp.s;
    out.d = this.lp.d;
  }
  probe(s: number, out: PathProbe): void {
    loopAt(s, this.p);
    out.x = this.p.x;
    out.y = 0;
    out.z = this.p.z;
    out.tx = this.p.tx;
    out.tz = this.p.tz;
    out.kappa = this.p.kappa;
  }
}

/** how fast the robot takes each stretch of the off-road course (km/h), by where it is (s) */
const OFFROAD_KMH: [number, number][] = [
  [0, 30],
  [26, 32],
  [80, 24],
  [158, 9],
  [212, 12],
  [278, 18],
  [345, 8],
  [395, 25],
];

export interface PilotOptions {
  /**
   * the slalom's speed (km/h); 0: as fast as the tyres let it — in at 35 km/h, then faster while they have grip to
   * spare and slower when they run out (a slalom at a set speed times every build the same)
   */
  slalomKmh?: number;
  /** the speed the brake test is run up to (km/h) */
  brakeKmh?: number;
  /** the ramp of the grade hill (0, 1, 2: 20, 30, 40 %) */
  ramp?: number;
}

export class Pilot {
  /** the run is over and the vehicle stands: the robot lets go */
  done = false;
  /** it found what it was after (the skid pad's limit): the section's run should end now */
  wantStop = false;
  /** what it is doing, in a few words */
  doing = '';
  private readonly robot: RobotDriver;
  private readonly path: DrivePath;
  private readonly out: VehicleInput = zeroInput();
  private t = 0;
  private stopping = false;
  private stillT = 0;
  private lostT = 0;
  readonly opts: Required<PilotOptions>;

  constructor(
    readonly section: SectionId,
    /** the vehicle's half width (m): how wide it swings round the slalom's cones */
    halfWidth: number,
    opts: PilotOptions = {},
  ) {
    this.opts = { slalomKmh: 0, brakeKmh: 100, ramp: 1, ...opts };
    switch (section) {
      case 'accel':
      case 'brake':
        this.path = new LinePath(START_X + 40, LANE_OUT, -1, 0);
        this.robot = new RobotDriver({ cruise: 60, latG: 0.5, decel: 4 });
        break;
      case 'skidpad':
        this.path = new LeftCircle(SKIDPAD.x, SKIDPAD.z, SKIDPAD.r);
        this.robot = new RobotDriver({ cruise: 4, latG: 5, decel: 5, laneKi: 0.03, laneTrimMax: 0.5 });
        break;
      case 'slalom':
        this.path = new WeavePath(halfWidth + 0.75);
        // (its speed only: it steers by the line's own bend, see weave())
        this.robot = new RobotDriver({ cruise: (this.opts.slalomKmh || PUSH_IN) * KMH, latG: 5, decel: 6, laneKi: 0, laneTrimMax: 0 });
        this.pushV = PUSH_IN * KMH;
        break;
      case 'offroad':
        this.path = new LoopPath();
        this.robot = new RobotDriver({ cruise: 8, latG: 0.4, decel: 2.5 });
        break;
      case 'hill': {
        const r = HILL.ramps[Math.max(0, Math.min(HILL.ramps.length - 1, this.opts.ramp))];
        this.path = new LinePath(HILL.x0 + 40, r.z, -1, 0);
        this.robot = new RobotDriver({ cruise: 10 * KMH, latG: 0.4, decel: 2 });
        break;
      }
    }
  }

  /** a frame's pedals and wheel for the vehicle, the section's run being in `phase` (null: none ready or running) */
  drive(dt: number, sim: VehicleSim, phase: RunPhase | null): VehicleInput {
    this.t += dt;
    const o = this.out;
    const r = this.robot;
    const u = START_X - sim.px;
    // (the robot steers on the line and keeps its speed; each section has the pedals as it needs them — and on
    // a straight line, or the slalom's, the wheel by the line's bend: see track())
    const ri = r.update(dt, sim, this.path);
    o.steer = this.section === 'skidpad' || this.section === 'offroad' ? ri.steer : this.track(sim);
    o.throttle = ri.throttle;
    o.brake = ri.brake;
    o.handbrake = 0;
    switch (this.section) {
      case 'accel':
        this.doing = '全油门加速';
        if (u >= KM_U + 5 || phase === 'done') this.stopping = true;
        if (!this.stopping) {
          o.throttle = this.traction(sim, dt);
          o.brake = 0;
        }
        break;
      case 'brake': {
        const target = this.opts.brakeKmh * KMH;
        if (u >= BRAKE_U - 0.5) this.stopping = true;
        if (!this.stopping) {
          this.doing = `加速到 ${this.opts.brakeKmh} km/h`;
          r.opts.cruise = target;
          if (sim.vForward < target - 1) {
            o.throttle = this.traction(sim, dt);
            o.brake = 0;
          }
        } else {
          this.doing = '刹车线：刹死';
          o.throttle = 0;
          o.brake = 1;
        }
        break;
      }
      case 'skidpad': {
        // the speed for a lateral acceleration rising by 0.02 g a second from 0.25 g
        const g = 0.25 + 0.02 * Math.max(0, this.t - 4);
        r.opts.cruise = Math.min(4 + this.t * 1.5, Math.sqrt(g * 9.81 * SKIDPAD.r));
        this.doing = `转圈，${g.toFixed(2)} g 往上加`;
        // (out of the lane a while: that was the limit)
        this.lostT = Math.abs(r.d) > SKIDPAD.lane + 0.8 ? this.lostT + dt : 0;
        if (!this.stopping && (this.lostT > 0.5 || this.t > 90)) {
          this.stopping = true;
          this.wantStop = true;
        }
        if (this.stopping) r.opts.cruise = 0;
        break;
      }
      case 'slalom': {
        const set = this.opts.slalomKmh;
        if (sim.px <= SLALOM_OUT - 5 || phase === 'done') this.stopping = true;
        if (!set && sim.px <= SLALOM.gateIn + 2 && !this.stopping) {
          // as fast as the tyres let it: faster while the busiest has a fifth of its grip to spare, slower past nine tenths
          let used = 0;
          for (const w of sim.wheels) if (w.contact) used = Math.max(used, w.util);
          // (and off its line it is going faster than it can follow it: slower — a line held is what gets it round
          // the cones; since the steering's play no longer leaves the wheels turned, a grippy tyre has grip to spare
          // well past where its line can still be held: docs/V3/plan/growth.md J2)
          const off = Math.abs(this.proj.d);
          this.pushV += dt * (used > 0.92 || off > SLALOM_OFF_SLOW ? -3.5 : used < 0.8 && off < SLALOM_OFF_FAST ? 1.4 : 0);
          this.pushV = Math.max(PUSH_IN * 0.7 * KMH, Math.min(130 * KMH, this.pushV));
          r.opts.cruise = this.pushV;
        }
        this.doing = set ? `${set} km/h 绕桩` : `绕桩，贴着抓地力的极限（${(r.opts.cruise * 3.6).toFixed(0)} km/h）`;
        // (up to speed by the gate: full throttle until near it)
        if (!this.stopping && sim.vForward < r.opts.cruise - 2 && sim.px > SLALOM.gateIn) {
          o.throttle = 1;
          o.brake = 0;
        }
        break;
      }
      case 'offroad': {
        loopProject(sim.px, sim.pz, this.lp);
        let kmh = OFFROAD_KMH[0][1];
        for (const [s, v] of OFFROAD_KMH) if (this.lp.s >= s) kmh = v;
        r.opts.cruise = kmh * KMH;
        this.doing = `越野 ${kmh} km/h`;
        if (this.lp.s >= OFFROAD_FINISH + 5 || phase === 'done') this.stopping = true;
        break;
      }
      case 'hill': {
        const rp = HILL.ramps[Math.max(0, Math.min(HILL.ramps.length - 1, this.opts.ramp))];
        const top = HILL.x0 - HILL.rise / rp.grade - HILL.top / 2;
        this.doing = `爬 ${Math.round(rp.grade * 100)}% 的坡`;
        // (on the slope a crawl needs the throttle held: the governor's integral is slow to find it)
        if (!this.stopping && sim.vForward < 1.5 && sim.px < HILL.x0 + 1) o.throttle = Math.max(o.throttle, 0.85);
        if (sim.px <= top + 1 || phase === 'done') this.stopping = true;
        break;
      }
    }
    if (this.stopping) {
      this.doing = '停车';
      o.throttle = 0;
      // (a firm stop, short of locking the wheels: a car spun at the end of the kilometre measures nothing) — the
      // brake test's own stop is full
      o.brake = this.section === 'brake' ? 1 : Math.max(o.brake, 0.42);
      // (at a crawl the handbrake holds it, and sliding the brakes let go: the brake held with the car not going
      // forward would put it into reverse)
      if (sim.speed < 0.6 || sim.vForward < 0.6 * sim.speed) {
        o.brake = 0;
        o.handbrake = sim.speed < 0.6 ? 1 : 0;
      }
      this.stillT = sim.speed < 0.3 ? this.stillT + dt : 0;
      if (this.stillT > 0.8) this.done = true;
    }
    return o;
  }

  private readonly lp = { s: 0, d: 0 };
  /** how much of the throttle the wheels take without spinning (a launch's traction control) */
  private tc = 1;
  /** the slalom's speed as fast as the tyres let it (m/s) */
  private pushV = 0;

  /**
   * Full throttle as much as the driven wheels take it: eased off while they spin a sixth faster than the car goes,
   * or past 90 km/h use more than three quarters of their grip (a good driver's foot, a traction control's), let back as they
   * hold — a powerful car on a road tyre otherwise smokes them off the line, and at speed, its rear tyres all but
   * spent pushing, has nothing left to hold its line with and swaps ends
   */
  private traction(sim: VehicleSim, dt: number): number {
    const v = Math.max(1.5, sim.vForward);
    let slip = 0;
    let used = 0;
    for (const w of sim.wheels) {
      if (!w.axle.driven || !w.contact) continue;
      slip = Math.max(slip, (w.omega * w.radius - v) / v);
      used = Math.max(used, w.util);
    }
    // (the grip's share only at speed, where losing the line is what it costs: off the line all of it goes into going)
    const most = 1.01 - 0.27 * Math.max(0, Math.min(1, (v - 15) / 10));
    const over = Math.max(slip - 0.16, used - most);
    this.tc = over > 0 ? Math.max(0.2, this.tc - dt * (2 + 8 * over)) : Math.min(1, this.tc + dt * 1.0);
    return this.tc;
  }

  private readonly pr: PathProbe = { x: 0, y: 0, z: 0, tx: 1, tz: 0, kappa: 0 };
  private readonly proj = { s: 0, d: 0 };
  private readonly B = new Float64Array(9);

  /**
   * The wheel on a line: a pure-pursuit aim either cuts the slalom's swings short (looking far) or runs wider at
   * every cone (looking near: it lags the car's own yaw), and down the straight at speed it weaves and spins the
   * car. It steers by the bend of the line a moment ahead instead, and puts right what is left of the heading and
   * the offset (a Stanley controller with the bend fed forward), the gains easing with speed.
   */
  private track(sim: VehicleSim): number {
    const v = Math.max(1, sim.vForward);
    this.path.project(sim.px, sim.pz, 0, this.proj);
    // (the bend where the wheels will be by the time they have turned: a fifth of a second on)
    this.path.probe(this.proj.s + v * 0.2, this.pr);
    const ff = Math.atan(sim.spec.wheelbase * this.pr.kappa);
    this.path.probe(this.proj.s, this.pr);
    sim.basis(this.B);
    const fl = Math.hypot(this.B[0], this.B[2]) || 1;
    const fx = this.B[0] / fl;
    const fz = this.B[2] / fl;
    // (the line's heading against the car's: + the line goes off to its right)
    const he = Math.atan2(-this.pr.tx * fz + this.pr.tz * fx, this.pr.tx * fx + this.pr.tz * fz);
    const kh = 0.9 / (1 + v / 30);
    // (and the yaw the bend does not ask for damped out: at speed a car answers the wheel late, and a correction
    // that waits for the heading to go off comes too late and grows)
    const yawRight = -sim.yawRate - v * this.pr.kappa;
    const delta = ff + kh * he + Math.atan2(-0.8 * this.proj.d, v + 2) - 0.07 * yawRight;
    return Math.max(-1, Math.min(1, delta / Math.max(sim.maxSteerNow, 0.01)));
  }
}
