/**
 * The vehicle against things standing in the world (docs/VEHICLE_SYSTEMS.md §4.7): a wall head-on
 * at 30 and 60 km/h, a thin wall at 120 km/h (no tunnelling), a glancing blow, a post off-centre,
 * a light crate knocked aside, body damage per hit, and what the solids cost per physics step.
 */
import { RobotDriver, StraightPath } from '../../src/core/driver/robot';
import { StaticSolids } from '../../src/core/onfoot/statics';
import { VehicleSim, zeroInput, type VehicleInput } from '../../src/core/vehicle/sim';
import type { VehicleSpec } from '../../src/core/vehicle/spec';
import { stockState, VehicleSystems } from '../../src/core/vehicle/systems';
import { FlatGround } from '../../src/core/world/ground';
import type { Solid, SolidSource } from '../../src/core/world/solids';
import type { Metrics } from './scenarios';

const KMH = 1 / 3.6;
const DEG = 180 / Math.PI;
const ENV = { ambientC: 20, dark: false, rain: 0 };

interface Run {
  v: VehicleSim;
  sys: VehicleSystems;
}

function rig(spec: VehicleSpec, solids: SolidSource | null, yaw = 0, z = 0): Run {
  const v = new VehicleSim(spec);
  v.reset(0, 0, z, yaw);
  v.solids = solids;
  const sys = new VehicleSystems(spec, stockState(spec, 1, { fresh: true })).bind(v);
  v.fuelL = Infinity;
  return { v, sys };
}

/**
 * Drive at `kmh` along the vehicle's heading (the robot holds the speed and the line) until the first
 * hit, then the driver lets go of everything; follow for `after` seconds.
 */
function drive(r: Run, ground: FlatGround, kmh: number, after: number, onStep?: (hit: boolean) => void): { hitX: number; hitT: number } {
  const { v, sys } = r;
  const robot = new RobotDriver({ cruise: kmh * KMH, latG: 5 });
  const path = new StraightPath();
  const lane = v.pz;
  robot.opts.lane = lane;
  let hitT = NaN;
  let hitX = NaN;
  const idle = zeroInput();
  for (let i = 0; i < 120 * 90; i++) {
    const hit = v.hits > 0;
    let inp: VehicleInput = idle;
    if (!hit) {
      inp = robot.update(v.h, v, path);
      // straight ahead along the heading it was given (the robot's path is the x axis)
      if (Math.abs(v.yaw) > 1e-3) inp = { ...inp, steer: 0 };
    }
    v.substep(inp, ground);
    if (i % 4 === 3) sys.update(v.h * 4, ENV);
    onStep?.(hit);
    if (hit && Number.isNaN(hitT)) {
      hitT = v.time;
      hitX = v.px;
    }
    if (!Number.isNaN(hitT) && v.time - hitT > after) break;
    if (v.exploded) break;
  }
  return { hitX, hitT };
}

/** run the vehicle up to speed on an empty plane first (the wall comes at x = start + run-up) */
function wallAhead(x: number, thick = 0.4, tag = 'wall'): StaticSolids {
  const s = new StaticSolids();
  s.box(x + thick / 2, 0, thick / 2, 10, 0, -1, 3, false, tag);
  return s;
}

export function wallTest(spec: VehicleSpec): Metrics {
  const ground = new FlatGround();
  const head = (kmh: number): { travel: number; rebound: number; pen: number; body: number; engine: number; exploded: number } => {
    // far enough to reach the speed
    const wx = Math.max(60, ((kmh * KMH) ** 2 / (2 * 1.2)) * 1.5 + 30);
    const r = rig(spec, wallAhead(wx));
    const body0 = r.sys.state.slots.body!.cond;
    const eng0 = r.sys.state.slots.engine!.cond;
    let maxX = -Infinity;
    let minV = Infinity;
    drive(r, ground, kmh, 1.5, (hit) => {
      if (hit) {
        if (r.v.px > maxX) maxX = r.v.px;
        if (r.v.vForward < minV) minV = r.v.vForward;
      }
    });
    return {
      travel: maxX - (wx - spec.body.centerX - spec.body.halfLength),
      rebound: Math.max(0, -minV) / KMH,
      pen: r.v.maxPenetration,
      body: body0 - r.sys.state.slots.body!.cond,
      engine: eng0 - r.sys.state.slots.engine!.cond,
      exploded: r.v.exploded ? 1 : 0,
    };
  };
  const w30 = head(30);
  const w60 = head(60);
  // a thin wall at 120 km/h: the body must stop on the near side of it
  const thinX = 300;
  const thin = rig(spec, wallAhead(thinX, 0.12));
  let maxFront = -Infinity;
  drive(thin, ground, 120, 1.0, () => {
    const front = thin.v.px + spec.body.centerX + spec.body.halfLength;
    if (front > maxFront) maxFront = front;
  });
  return {
    wall_travel_30_m: w30.travel,
    wall_travel_60_m: w60.travel,
    wall_rebound_60_kmh: w60.rebound,
    wall_penetration_max_m: Math.max(w30.pen, w60.pen),
    wall_body_damage_30: w30.body,
    wall_body_damage_60: w60.body,
    wall_engine_damage_60: w60.engine,
    wall_tunnel_120: maxFront > thinX + 0.12 || thin.v.hits === 0 ? 1 : 0,
    wall_exploded: w30.exploded + w60.exploded + (thin.v.exploded ? 1 : 0),
  };
}

/** a long wall along the road, met at 20° at 60 km/h: the vehicle turns along it and keeps most of its speed */
export function glanceTest(spec: VehicleSpec): Metrics {
  const ground = new FlatGround();
  const s = new StaticSolids();
  // the wall runs along +x at z = 6; the vehicle heads 20° towards it (yaw −20°: towards +z)
  s.box(200, 6 + 0.2 + spec.body.halfWidth, 200, 0.2, 0, -1, 3, false, 'wall');
  const yaw = -20 / DEG;
  const r = rig(spec, s, yaw, 0);
  // bring it up to speed first, on a heading line (the robot is not used: plain throttle, no steering)
  const v = r.v;
  const inp: VehicleInput = { steer: 0, throttle: 1, brake: 0, handbrake: 0 };
  let speed0 = NaN;
  let yaw0 = NaN;
  let tHit = NaN;
  for (let i = 0; i < 120 * 40; i++) {
    const hit = v.hits > 0;
    if (hit && Number.isNaN(speed0)) {
      speed0 = v.speed;
      yaw0 = v.yaw;
      tHit = v.time;
    }
    inp.throttle = hit ? 0 : v.speed < 60 * KMH ? 1 : 0.3;
    v.substep(inp, ground);
    if (i % 4 === 3) r.sys.update(v.h * 4, ENV);
    if (hit && v.time - tHit > 1.2) break;
    if (v.exploded) break;
  }
  let d = v.yaw - yaw0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return {
    glance_turn_deg: Math.abs(d) * DEG,
    glance_speed_kept: v.speed / speed0,
    glance_penetration_m: v.maxPenetration,
    glance_body_damage: 100 - r.sys.state.slots.body!.cond,
  };
}

/** a post 0.5 m off the centre line at 40 km/h: the hit turns the vehicle */
export function postTest(spec: VehicleSpec): Metrics {
  const ground = new FlatGround();
  const s = new StaticSolids();
  s.post(80, 0.5, 0.12, -1, 3, 'post');
  const r = rig(spec, s);
  let yaw0 = NaN;
  drive(r, ground, 40, 1.0, (hit) => {
    if (hit && Number.isNaN(yaw0)) yaw0 = r.v.yaw;
  });
  return { post_turn_deg: Math.abs(r.v.yaw - yaw0) * DEG, post_exploded: r.v.exploded ? 1 : 0 };
}

/** a light crate on the road at 50 km/h: knocked aside, a little speed lost */
export function lightTest(spec: VehicleSpec): Metrics {
  const ground = new FlatGround();
  const s = new StaticSolids();
  s.box(80, 0, 0.4, 0.4, 0, 0, 0.8, false, 'light:crate');
  const r = rig(spec, s);
  let knocks = 0;
  r.v.onKnock = () => knocks++;
  const robot = new RobotDriver({ cruise: 50 * KMH, latG: 5 });
  const path = new StraightPath();
  let before = NaN;
  let after = NaN;
  for (let i = 0; i < 120 * 30; i++) {
    const near = r.v.px + spec.body.centerX + spec.body.halfLength;
    if (Number.isNaN(before) && near > 78) before = r.v.speed;
    r.v.substep(near > 78 && near < 84 ? zeroInput() : robot.update(r.v.h, r.v, path), ground);
    if (Number.isNaN(after) && near > 84) after = r.v.speed;
    if (!Number.isNaN(after)) break;
  }
  return { light_knocks: knocks, light_speed_kept: after / before, light_hits: r.v.hits };
}

/**
 * What the solids cost: µs per physics step while driving at 60 km/h with 0, 50 and 500 solids in the
 * world (scattered beside the road, none touched). Lower quartile of 7 batches (the machine is shared).
 */
export function solidsCostTest(spec: VehicleSpec): Metrics {
  const ground = new FlatGround();
  const world = (n: number): StaticSolids => {
    const s = new StaticSolids();
    for (let k = 0; k < n; k++) {
      // beside a 2 km road, none touched (the site plan keeps solids off the road)
      const x = (k * 37.3) % 2000;
      const side = k % 2 === 0 ? 1 : -1;
      s.box(x, side * (8 + (k % 5)), 0.6, 0.6, 0.3 * k, -1, 2, false, 'site:crate');
    }
    return s;
  };
  const cases: [string, SolidSource | null][] = [
    ['none', null],
    ['0', world(0)],
    ['50', world(50)],
    ['500', world(500)],
  ];
  const times: number[][] = cases.map(() => []);
  // batches interleaved, so a busy moment on the shared machine hits every case alike
  for (let b = 0; b < 9; b++) {
    for (let c = 0; c < cases.length; c++) {
      const v = new VehicleSim(spec);
      v.reset(0, 0, 0, 0);
      v.solids = cases[c][1];
      const robot = new RobotDriver({ cruise: 60 * KMH, latG: 5 });
      const path = new StraightPath();
      for (let i = 0; i < 400; i++) v.substep(robot.update(v.h, v, path), ground);
      const t0 = performance.now();
      for (let i = 0; i < 1200; i++) v.substep(robot.update(v.h, v, path), ground);
      times[c].push(((performance.now() - t0) * 1000) / 1200);
    }
  }
  // lower quartile, first batch dropped (warm-up)
  const q = (t: number[]): number => {
    const x = t.slice(1).sort((a, b) => a - b);
    return x[Math.floor(x.length / 4)];
  };
  const r = times.map(q);
  return {
    solids_step_us_none: r[0],
    solids_step_us_0: r[1],
    solids_step_us_50: r[2],
    solids_step_us_500: r[3],
    solids_cost_ratio_500: r[3] / r[0],
  };
}

export function collectCollideMetrics(spec: VehicleSpec): Metrics {
  return { ...wallTest(spec), ...glanceTest(spec), ...postTest(spec), ...lightTest(spec) };
}

export type { Solid };
