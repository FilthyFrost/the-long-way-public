/**
 * Vehicle systems measured headless (docs/VEHICLE_SYSTEMS.md §9): heat on the steepest climb with a
 * trailer-like load, wear per 100 km on generated roads, punctures, battery hours, starting, tyres ×
 * surfaces on the climb test, a flat tyre's pull and limp mode.
 */
import { RobotDriver, StraightPath } from '../../src/core/driver/robot';
import { AUTOPILOT } from '../../src/core/driver/autopilot';
import { VehicleSim, zeroInput, type VehicleInput } from '../../src/core/vehicle/sim';
import type { VehicleSpec } from '../../src/core/vehicle/spec';
import { stockState, suspendedSpec, TUNE, TYRE_GRIP, VehicleSystems, type StockOptions, type SystemsEnv, type TyreId } from '../../src/core/vehicle/systems';
import { skidpadTest } from './scenarios';
import { FlatGround, Surface, type Ground } from '../../src/core/world/ground';
import { SpineSample } from '../../src/core/world/spine';
import { World } from '../../src/core/world/terrain';
import type { Metrics } from './scenarios';

const KMH = 1 / 3.6;
const DEG = 180 / Math.PI;
const ENV: SystemsEnv = { ambientC: 20, dark: false, rain: 0 };

function rig(spec: VehicleSpec, o: StockOptions = { fresh: true }, seed = 1): { v: VehicleSim; sys: VehicleSystems } {
  const v = new VehicleSim(spec);
  v.reset(0, 0, 0, 0);
  const sys = new VehicleSystems(spec, stockState(spec, seed, o)).bind(v);
  return { v, sys };
}

/** step the sim and update the systems every 4 physics steps (30 Hz), like the game */
function run(v: VehicleSim, sys: VehicleSystems, ground: Ground, inp: VehicleInput | (() => VehicleInput), seconds: number, env: SystemsEnv = ENV, each?: () => boolean): void {
  const n = Math.round(seconds / v.h);
  for (let i = 0; i < n; i++) {
    v.substep(typeof inp === 'function' ? inp() : inp, ground);
    if (i % 4 === 3) {
      sys.update(v.h * 4, env);
      if (each && each()) return;
    }
  }
}

/** Steepest grade climbed from rest, as vehicles.ts measures it, with the systems fitted (tyres) */
function maxClimbWith(spec: VehicleSpec, surface: number, tyre: TyreId | 'chains' | 'stock'): number {
  let best = 0;
  for (let grade = 0.06; grade <= 0.8001; grade += 0.02) {
    const ground = new FlatGround({ slopeX: grade, surface });
    const st = stockState(spec, 1, { fresh: true });
    if (tyre === 'chains') for (const w of st.wheels) w.chains = true;
    else if (tyre !== 'stock') for (const w of st.wheels) w.tyre = tyre;
    const v = new VehicleSim(spec);
    v.reset(0, 0, 0, 0);
    const th = Math.atan(grade);
    v.qz = v.pqz = Math.sin(th / 2);
    v.qw = v.pqw = Math.cos(th / 2);
    v.px = v.ppx = -Math.sin(th) * spec.cgHeight;
    v.py = v.ppy = Math.cos(th) * spec.cgHeight + 0.03;
    const sys = new VehicleSystems(spec, st).bind(v);
    v.fuelL = Infinity;
    sys.update(0, ENV);
    const hold = zeroInput();
    for (let t = 0; t < 6; t += v.h) v.substep(hold, ground);
    const x0 = v.px;
    const go: VehicleInput = { steer: 0, throttle: 1, brake: 0, handbrake: 0 };
    for (let t = 0; t < 16; t += v.h) v.substep(go, ground);
    if (v.px - x0 >= 20 && v.vForward > 0.5 && !v.exploded) best = grade;
    else break;
  }
  return best * 100;
}

export function tyreClimbTest(spec: VehicleSpec): Metrics {
  return {
    sys_stock_climb_gravel_pct: maxClimbWith(spec, Surface.Gravel, 'stock'),
    sys_stock_climb_snow_pct: maxClimbWith(spec, Surface.Snow, 'stock'),
    sys_snowtyre_climb_snow_pct: maxClimbWith(spec, Surface.Snow, 'tyre.snow'),
    sys_chains_climb_snow_pct: maxClimbWith(spec, Surface.Snow, 'chains'),
  };
}

/**
 * Heat: full throttle up an 8 % grade (the steepest main road) for up to 15 minutes, with 35 % extra mass
 * (a trailer-like load). Desert air (40 °C) and a tired radiator (condition 60): time to the yellow and
 * the red. Mild air with a sound radiator, and desert air with the large radiator: the highest temperature.
 */
export function heatTest(spec: VehicleSpec): Metrics {
  const heavy: VehicleSpec = { ...spec, mass: spec.mass * 1.35, inertia: { roll: spec.inertia.roll * 1.35, yaw: spec.inertia.yaw * 1.35, pitch: spec.inertia.pitch * 1.35 } };
  const climb = (cooling: string, cond: number, ambientC: number): { yellow: number; red: number; maxC: number; minKmh: number } => {
    const g = new FlatGround({ slopeX: 0.08 });
    const { v, sys } = rig(heavy, { fresh: true, cond: { cooling: cond } });
    sys.state.slots.cooling = { id: cooling, cond };
    sys.state.coolantC = 88;
    v.fuelL = Infinity;
    const env = { ambientC, dark: false, rain: 0 };
    let yellow = NaN;
    let red = NaN;
    let maxC = 0;
    let minKmh = Infinity;
    const go: VehicleInput = { steer: 0, throttle: 1, brake: 0, handbrake: 0 };
    run(v, sys, g, go, 900, env, () => {
      const c = sys.state.coolantC;
      if (c > maxC) maxC = c;
      if (Number.isNaN(yellow) && c >= TUNE.yellowC) yellow = v.time;
      if (Number.isNaN(red) && c >= TUNE.redC) red = v.time;
      if (v.time > 60 && v.kmh < minKmh) minKmh = v.kmh;
      return false;
    });
    return { yellow: Number.isNaN(yellow) ? 900 : yellow, red: Number.isNaN(red) ? 900 : red, maxC, minKmh };
  };
  const hot = climb('part.cooling.1', 60, 40);
  const mild = climb('part.cooling.1', 100, 20);
  const big = climb('part.cooling.2', 100, 40);
  // cruising at 60 on the level in mild air
  const { v, sys } = rig(spec);
  v.fuelL = Infinity;
  sys.state.coolantC = 20;
  const flat = new FlatGround();
  let integ = 0;
  run(v, sys, flat, () => {
    const err = 60 * KMH - v.vForward;
    integ = Math.min(0.9, Math.max(0, integ + err * 0.1 * v.h));
    return { steer: 0, throttle: Math.min(1, Math.max(0, err * 0.6 + integ)), brake: 0, handbrake: 0 };
  }, 600);
  return {
    sys_overheat_yellow_s: hot.yellow,
    sys_overheat_red_s: hot.red,
    sys_overheat_warning_s: hot.red - hot.yellow,
    sys_overheat_limp_min_kmh: hot.minKmh,
    sys_climb_mild_max_c: mild.maxC,
    sys_climb_desert_cooling2_max_c: big.maxC,
    sys_cruise60_temp_c: sys.state.coolantC,
  };
}

/** Wear on generated roads: the autopilot drives 12 km with the worn starting conditions */
export function wearTest(spec: VehicleSpec): Metrics {
  const a = AUTOPILOT[spec.id] ?? AUTOPILOT.t0_truck;
  const w = new World(101 * 3 + 3, { chapterScale: 0.2 });
  const sp = w.spine;
  const st = new SpineSample();
  const lane = 1.6;
  sp.at(40, st);
  const v = new VehicleSim(spec);
  v.reset(st.x - Math.sin(st.phi) * lane, st.y, st.z + Math.cos(st.phi) * lane, -st.phi);
  const state = stockState(spec, 7);
  state.hazardScale = 0; // punctures are measured separately
  const sys = new VehicleSystems(spec, state).bind(v);
  v.fuelL = Infinity;
  const before = sys.toJSON();
  const robot = new RobotDriver({ cruise: a.cruiseKmh / 3.6, lane, latG: a.latG });
  robot.s = 40;
  run(v, sys, w, () => robot.update(v.h, v, sp), 1400, ENV, () => robot.s - 40 >= 12000);
  const km = sys.state.odometerM / 1000;
  const after = sys.state;
  const per = (slot: 'engine' | 'cooling' | 'suspension' | 'brakes' | 'body'): number => (((before.slots[slot]?.cond ?? 0) - (after.slots[slot]?.cond ?? 0)) / Math.max(0.1, km)) * 100;
  let tread = 0;
  for (let i = 0; i < 4; i++) tread += before.wheels[i].tread - after.wheels[i].tread;
  return {
    sys_wear_km: km,
    sys_wear_engine_per_100km: per('engine'),
    sys_wear_suspension_per_100km: per('suspension'),
    sys_wear_brakes_per_100km: per('brakes'),
    sys_wear_tread_per_100km: (tread / 4 / Math.max(0.1, km)) * 100,
  };
}

/** Expected punctures per 100 km for the whole vehicle on its stock tyres at the starting tread */
export function punctureRate(spec: VehicleSpec, surface: number, tread = 62): number {
  const st = stockState(spec);
  const g = TYRE_GRIP[st.wheels[0].tyre];
  const worn = 1 - tread / 100;
  const pSeg = (TUNE.punctureP100[surface] / 100) * 0.05 * g.puncture * (1 + 3 * worn * worn);
  return 4 * pSeg * 20 * 100;
}

export function electricTest(spec: VehicleSpec): Metrics {
  // lights left on, engine off: hours until it will not crank
  const a = rig(spec);
  a.sys.turnKey('acc');
  a.sys.setLights('low');
  a.sys.state.battery = 100;
  let hours = NaN;
  const flat = new FlatGround();
  for (let t = 0; t < 6 * 3600; t += 1) {
    a.sys.update(1, { ambientC: 15, dark: true, rain: 0 });
    if (a.sys.state.battery < TUNE.minCrankCharge) {
      hours = t / 3600;
      break;
    }
  }
  // night drive with everything on: the alternator still wins
  const b = rig(spec);
  b.sys.setLights('high');
  b.sys.setHeater(true);
  b.sys.setRadio(true);
  b.sys.state.battery = 50;
  run(b.v, b.sys, flat, zeroInput(), 60, { ambientC: 5, dark: true, rain: 1 });
  const net = b.sys.state.battery - 50;
  // starting: warm and at −15 °C
  const crank = (ambientC: number): number => {
    const c = rig(spec);
    c.sys.stopEngine();
    c.sys.state.coolantC = ambientC;
    let t = 0;
    c.sys.crank(true);
    run(c.v, c.sys, flat, zeroInput(), 8, { ambientC, dark: false, rain: 0 }, () => {
      t += c.v.h * 4;
      return c.sys.state.running;
    });
    return c.sys.state.running ? t : NaN;
  };
  return {
    sys_battery_lights_on_hours: hours,
    sys_battery_night_net_per_min: net,
    sys_start_warm_s: crank(20),
    sys_start_cold_s: crank(-15),
    sys_punctures_per_100km_asphalt: punctureRate(spec, Surface.Asphalt),
    sys_punctures_per_100km_gravel: punctureRate(spec, Surface.Gravel),
  };
}

/** a front-left flat at 60 km/h, hands off: how far the heading wanders in 3 s; limp mode's top speed */
export function faultTest(spec: VehicleSpec): Metrics {
  const flat = new FlatGround();
  const { v, sys } = rig(spec);
  v.fuelL = Infinity;
  let integ = 0;
  const cruise = (): VehicleInput => {
    const err = 60 * KMH - v.vForward;
    integ = Math.min(0.9, Math.max(0, integ + err * 0.1 * v.h));
    return { steer: 0, throttle: Math.min(1, Math.max(0, err * 0.6 + integ)), brake: 0, handbrake: 0 };
  };
  run(v, sys, flat, cruise, 20);
  sys.puncture(0);
  const y0 = v.yaw;
  run(v, sys, flat, cruise, 3);
  // limp: engine at condition 0 still drives
  const l = rig(spec, { fresh: true, cond: { engine: 0 } });
  l.v.fuelL = Infinity;
  run(l.v, l.sys, flat, { steer: 0, throttle: 1, brake: 0, handbrake: 0 }, 60);
  // the robot keeps the lane with the flat (it is drivable)
  const r = rig(spec);
  r.v.fuelL = Infinity;
  const robot = new RobotDriver({ cruise: 40 * KMH, latG: 5 });
  r.sys.puncture(1);
  let maxErr = 0;
  const path = new StraightPath();
  run(r.v, r.sys, flat, () => robot.update(r.v.h, r.v, path), 30, ENV, () => {
    if (r.v.time > 10) maxErr = Math.max(maxErr, Math.abs(robot.d));
    return false;
  });
  return {
    sys_flat_heading_drift_deg: Math.abs(v.yaw - y0) * DEG,
    sys_limp_top_kmh: l.v.kmh,
    sys_flat_robot_lane_err_m: maxErr,
  };
}

export function collectSystemsMetrics(spec: VehicleSpec): Metrics {
  return { ...tyreClimbTest(spec), ...heatTest(spec), ...wearTest(spec), ...electricTest(spec), ...faultTest(spec), ...suspensionPushTest(spec) };
}

/**
 * Leftovers made real: the suspension tiers in the physics (roll gradient on the skid pad, ground
 * clearance, fitted while standing without a jolt), pushing the vehicle on foot (two people, 350 N
 * each, in N; in P it does not move).
 */
export function suspensionPushTest(spec: VehicleSpec): Metrics {
  const stock = skidpadTest(spec).roll_deg_per_g;
  const s2 = skidpadTest(suspendedSpec(spec, 'part.suspension.2')).roll_deg_per_g;
  const clearance = (sp: VehicleSpec): number => {
    const v = new VehicleSim(sp);
    v.reset(0, 0, 0, 0);
    const g = new FlatGround();
    for (let t = 0; t < 4; t += v.h) v.substep(zeroInput(), g);
    return v.py + sp.body.bottom;
  };
  const lift = clearance(suspendedSpec(spec, 'part.suspension.3')) - clearance(spec);
  const { v, sys } = rig(spec);
  const g = new FlatGround();
  for (let t = 0; t < 2; t += v.h) v.substep(zeroInput(), g);
  sys.stopEngine();
  sys.state.slots.suspension = { id: 'part.suspension.3', cond: 100 };
  sys.refreshSpec();
  let maxV = 0;
  for (let t = 0; t < 4; t += v.h) {
    v.substep(zeroInput(), g);
    if (v.speed > maxV) maxV = v.speed;
  }
  const push = (sel: 'N' | 'P'): number => {
    const { v: w, sys: s } = rig(spec);
    const fl = new FlatGround();
    for (let t = 0; t < 1; t += w.h) w.substep(zeroInput(), fl);
    s.stopEngine();
    w.shift(sel);
    const x0 = w.px;
    for (let t = 0; t < 6; t += w.h) {
      // two people at the tail, pushing along the body
      // (people push hard from a standstill and less as they have to walk faster: nothing past 2 m/s)
      w.addPush(700 * Math.max(0, 1 - w.speed / 2), 0, w.px + spec.body.centerX - spec.body.halfLength, w.pz);
      w.substep(zeroInput(), fl);
    }
    return sel === 'N' ? w.speed * 3.6 : Math.abs(w.px - x0) * 100;
  };
  return {
    sys_susp2_roll_ratio: s2 / stock,
    sys_susp3_clearance_gain_cm: lift * 100,
    sys_susp_swap_jolt_m_s: maxV,
    sys_push_two_people_kmh: push('N'),
    sys_push_in_p_cm: push('P'),
  };
}
