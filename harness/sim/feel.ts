/**
 * Driving feel beyond the handling numbers (docs/VEHICLE_SYSTEMS.md §4, §9): pedals, engine braking,
 * the gear selector and manual mode, the handbrake, steering, and what the body, the camera and the
 * road-feel channel do over kerbs, bridge joints, washboard gravel and landings. Headless, per vehicle.
 */
import { FirstPersonRig } from '../../src/core/camera/rig';
import { RobotDriver, StraightPath } from '../../src/core/driver/robot';
import { GRAVITY, VehicleSim, zeroInput, type VehicleInput } from '../../src/core/vehicle/sim';
import type { VehicleSpec } from '../../src/core/vehicle/spec';
import { FlatGround, Surface, type Ground } from '../../src/core/world/ground';
import type { Metrics } from './scenarios';

const KMH = 1 / 3.6;
const DEG = 180 / Math.PI;

function spawn(spec: VehicleSpec, ground: Ground, settle = 1.5, slope = 0): VehicleSim {
  const v = new VehicleSim(spec);
  v.reset(0, 0, 0, 0);
  if (slope !== 0) {
    // stand it on the slope nose up
    const th = Math.atan(slope);
    v.qz = v.pqz = Math.sin(th / 2);
    v.qw = v.pqw = Math.cos(th / 2);
    v.px = v.ppx = -Math.sin(th) * spec.cgHeight;
    v.py = v.ppy = Math.cos(th) * spec.cgHeight + 0.03;
  }
  const inp = zeroInput();
  for (let t = 0; t < settle; t += v.h) v.substep(inp, ground);
  return v;
}

/** bring the vehicle up to `kmh` with a simple speed controller and hold it there for `hold` s */
function cruiseTo(v: VehicleSim, ground: Ground, kmh: number, hold = 2): void {
  const inp = zeroInput();
  let integ = 0;
  let steady = 0;
  for (let t = 0; t < 90 && steady < hold; t += v.h) {
    const err = kmh * KMH - v.vForward;
    integ = Math.min(0.9, Math.max(0, integ + err * 0.1 * v.h));
    inp.throttle = Math.min(1, Math.max(0, err * 0.6 + integ));
    inp.brake = err < -1 ? 0.3 : 0;
    v.substep(inp, ground);
    steady = Math.abs(err) < 0.4 ? steady + v.h : 0;
  }
}

/** pedals, engine braking, creep and the shifts a driver feels */
export function pedalTest(spec: VehicleSpec): Metrics {
  const flat = new FlatGround();
  // creep: D, nothing pressed, assists off
  const c = spawn(spec, flat);
  c.autoHold = false;
  c.hold = false;
  const idle = zeroInput();
  for (let t = 0; t < 15; t += c.h) c.substep(idle, flat);
  const creep = c.vForward * 3.6;

  // lift-off at 60 km/h in D: engine braking + drag + rolling resistance
  const d = spawn(spec, flat);
  cruiseTo(d, flat, 62);
  let t0 = -1;
  let tEnd = NaN;
  for (let t = 0; t < 40; t += d.h) {
    d.substep(idle, flat);
    if (t0 < 0 && d.vForward <= 60 * KMH) t0 = d.time;
    if (t0 >= 0 && d.vForward <= 50 * KMH) {
      tEnd = d.time;
      break;
    }
  }
  const coastG = ((10 * KMH) / (tEnd - t0)) / GRAVITY;

  // the same lift-off in manual mode, one gear lower than the automatic held
  const m = spawn(spec, flat);
  cruiseTo(m, flat, 62);
  m.setManual(true);
  const autoGear = m.gear;
  m.shiftDown();
  for (let t = 0; t < 1; t += m.h) m.substep({ ...idle, throttle: 0.15 }, flat);
  let t1 = -1;
  let t2 = NaN;
  for (let t = 0; t < 40; t += m.h) {
    m.substep(idle, flat);
    if (t1 < 0 && m.vForward <= 58 * KMH) t1 = m.time;
    if (t1 >= 0 && m.vForward <= 48 * KMH) {
      t2 = m.time;
      break;
    }
  }
  const lowG = ((10 * KMH) / (t2 - t1)) / GRAVITY;

  // tip-in at 50 km/h: from a light cruise to full throttle, time to 90 % of the strongest pull in 3 s
  const p = spawn(spec, flat);
  cruiseTo(p, flat, 50, 3);
  const acc: number[] = [];
  const full: VehicleInput = { steer: 0, throttle: 1, brake: 0, handbrake: 0 };
  let pv = p.vForward;
  for (let t = 0; t < 3; t += p.h) {
    p.substep(full, flat);
    acc.push((p.vForward - pv) / p.h);
    pv = p.vForward;
  }
  // smooth over 50 ms
  const sm = acc.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let j = Math.max(0, i - 6); j <= i; j++) {
      s += acc[j];
      n++;
    }
    return s / n;
  });
  const peak = Math.max(...sm);
  const tip = sm.findIndex((a) => a >= 0.9 * peak) * p.h;

  // full-throttle run to 80: how many upshifts and how deep the pull drops in each
  const r = spawn(spec, flat);
  let up = 0;
  let lastShifts = r.shifts;
  let maxDip = 0;
  let before = 0;
  let minDuring = Infinity;
  let inShift = false;
  pv = r.vForward;
  const hist: number[] = [];
  for (let t = 0; t < 60 && r.vForward < 80 * KMH; t += r.h) {
    r.substep(full, flat);
    const a = (r.vForward - pv) / r.h;
    pv = r.vForward;
    hist.push(a);
    if (hist.length > 6) hist.shift();
    const as = hist.reduce((s, x) => s + x, 0) / hist.length;
    if (r.shifts !== lastShifts) {
      if (r.lastShift > 0) up++;
      lastShifts = r.shifts;
      before = as;
      minDuring = as;
      inShift = true;
    } else if (inShift) {
      if (as < minDuring) minDuring = as;
      if (r.shiftTimer <= 0 && as > minDuring + 0.05) {
        inShift = false;
        if ((before - minDuring) / GRAVITY > maxDip) maxDip = (before - minDuring) / GRAVITY;
      }
    }
  }

  // reverse: top speed in R
  const rv = spawn(spec, flat);
  rv.autoReverse = false;
  rv.shift('R');
  for (let t = 0; t < 25; t += rv.h) rv.substep(full, flat);

  return {
    creep_kmh: creep,
    coast_decel_60_g: coastG,
    engine_brake_low_gear_gain: lowG / coastG,
    manual_gear_from: autoGear,
    tip_in_s: tip,
    upshifts_0_80: up,
    shift_dip_g: maxDip,
    reverse_top_kmh: -rv.vForward * 3.6,
  };
}

/** the selector, the handbrake lever and rolling away */
export function parkingTest(spec: VehicleSpec): Metrics {
  const drift = (grade: number, setup: (v: VehicleSim) => void, seconds = 20): { cm: number; kmh: number } => {
    const g = new FlatGround({ slopeX: grade });
    const v = spawn(spec, g, 4, grade);
    v.autoHold = false;
    v.hold = false;
    v.autoReverse = false;
    setup(v);
    const inp = zeroInput();
    for (let t = 0; t < 1; t += v.h) v.substep(inp, g);
    const x0 = v.px;
    for (let t = 0; t < seconds; t += v.h) v.substep(inp, g);
    return { cm: Math.abs(v.px - x0) * 100, kmh: v.speed * 3.6 };
  };
  const pHold = drift(0.15, (v) => v.shift('P'), 30);
  const nRoll = drift(0.08, (v) => v.shift('N'), 5);
  let hbMax = 0;
  for (let g = 0.1; g <= 0.6001; g += 0.02) {
    const r = drift(g, (v) => {
      v.shift('N');
      v.setParkBrake(true);
    });
    if (r.cm < 5) hbMax = g;
    else break;
  }
  // P is refused at 30 km/h
  const flat = new FlatGround();
  const s = spawn(spec, flat);
  cruiseTo(s, flat, 30, 0.5);
  const refused = s.shift('P') ? 0 : 1;
  // driving off with the lever latched: the assist lets it go
  const a = spawn(spec, flat);
  a.setParkBrake(true);
  for (let t = 0; t < 3; t += a.h) a.substep({ steer: 0, throttle: 0.6, brake: 0, handbrake: 0 }, flat);
  return {
    park_p_hold15_drift_cm: pHold.cm,
    neutral_rollaway_8pct_kmh: nRoll.kmh,
    parkbrake_max_hold_pct: hbMax * 100,
    p_refused_at_30kmh: refused,
    parkbrake_auto_release: a.parkBrake === 0 && a.vForward > 1 ? 1 : 0,
  };
}

/** handbrake as a tool: at 40 km/h on gravel, a pull with the wheel turned swings the tail */
export function handbrakeTurnTest(spec: VehicleSpec): Metrics {
  const g = new FlatGround({ surface: Surface.Gravel });
  const run = (hb: boolean): number => {
    const v = spawn(spec, g);
    cruiseTo(v, g, 40, 1);
    const y0 = v.yaw;
    for (let t = 0; t < 1.2; t += v.h) v.substep({ steer: 0.6, throttle: 0, brake: 0, handbrake: hb && t < 0.9 ? 1 : 0 }, g);
    let d = v.yaw - y0;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return Math.abs(d) * DEG;
  };
  const plain = run(false);
  const pulled = run(true);
  return { handbrake_turn_yaw_deg: pulled, handbrake_yaw_gain: pulled / Math.max(1e-3, plain) };
}

/** steering a keyboard driver feels: build-up, return to centre, speed sensitivity */
export function steeringTest(spec: VehicleSpec): Metrics {
  const flat = new FlatGround();
  const v = spawn(spec, flat);
  cruiseTo(v, flat, 60, 1);
  const inp: VehicleInput = { steer: 0.5, throttle: 0.25, brake: 0, handbrake: 0 };
  let rise = NaN;
  const target = 0.5 * v.maxSteerNow;
  for (let t = 0; t < 2; t += v.h) {
    v.substep(inp, flat);
    if (Number.isNaN(rise) && Math.abs(v.steerAngle) >= 0.9 * Math.abs(target)) rise = t + v.h;
  }
  const held = Math.abs(v.steerAngle);
  inp.steer = 0;
  let centre = NaN;
  for (let t = 0; t < 3; t += v.h) {
    v.substep(inp, flat);
    if (Number.isNaN(centre) && Math.abs(v.steerAngle) <= 0.1 * held) centre = t + v.h;
  }
  // full-input road-wheel angle at walking pace and at 90 km/h
  const lock = (kmh: number): number => {
    const w = spawn(spec, flat);
    if (kmh > 0) cruiseTo(w, flat, kmh, 0.5);
    const a = { steer: 1, throttle: kmh > 0 ? 0.3 : 0.08, brake: 0, handbrake: 0 };
    for (let t = 0; t < 0.3; t += w.h) w.substep(a, flat);
    return w.maxSteerNow * DEG;
  };
  const slow = lock(0);
  const fast = lock(90);
  return { steer_rise_s: rise, steer_centre_s: centre, steer_lock_slow_deg: slow, steer_lock_ratio_90: fast / slow };
}

/** angular speed of the view between two rig orientations (deg/s) */
function camRate(a: number[], b: number[], h: number): number {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return (2 * Math.acos(Math.min(1, dot)) * DEG) / h;
}

interface RideResult {
  thumps: number;
  bottomOuts: number;
  landings: number;
  bodyPeakG: number;
  camPeakDegS: number;
  bodyPeakDegS: number;
  camHfDegS: number;
  bodyHfDegS: number;
  suspRms: number;
  exploded: number;
}

/** drive straight over `ground` at `kmh` with the robot, record what the body and the camera do from x0 on */
function rideOver(spec: VehicleSpec, ground: Ground, kmh: number, x0: number, x1: number, startY = 0): RideResult {
  const v = new VehicleSim(spec);
  v.reset(0, startY, 0, 0);
  const rig = new FirstPersonRig();
  const robot = new RobotDriver({ cruise: kmh * KMH, latG: 5 });
  const path = new StraightPath();
  let pq = [0, 0, 0, 1];
  let started = false;
  let th0 = 0;
  let bo0 = 0;
  let la0 = 0;
  const r: RideResult = { thumps: 0, bottomOuts: 0, landings: 0, bodyPeakG: 0, camPeakDegS: 0, bodyPeakDegS: 0, camHfDegS: 0, bodyHfDegS: 0, suspRms: 0, exploded: 0 };
  const camR: number[] = [];
  const bodyR: number[] = [];
  let rmsAcc = 0;
  let rmsN = 0;
  for (let t = 0; t < 60; t += v.h) {
    // the robot holds the speed up to the feature, then the driver just rolls through
    const inp = robot.update(v.h, v, path);
    v.substep(inp, ground);
    rig.update(v.h, v);
    const q = [rig.qx, rig.qy, rig.qz, rig.qw];
    if (!started && v.px > x0 - 6 && t > 3) {
      started = true;
      th0 = v.feel.thumps;
      bo0 = v.feel.bottomOuts;
      la0 = v.feel.landings;
    }
    if (started) {
      const cr = camRate(pq, q, v.h);
      const br = Math.hypot(v.avx, v.avz) * DEG;
      camR.push(cr);
      bodyR.push(br);
      if (cr > r.camPeakDegS) r.camPeakDegS = cr;
      if (br > r.bodyPeakDegS) r.bodyPeakDegS = br;
      const g = Math.abs(v.accY - GRAVITY) / GRAVITY;
      if (g > r.bodyPeakG) r.bodyPeakG = g;
      rmsAcc += v.feel.suspRms;
      rmsN++;
      if (v.px > x1) break;
    }
    pq = q;
    if (v.exploded) break;
  }
  r.thumps = v.feel.thumps - th0;
  r.bottomOuts = v.feel.bottomOuts - bo0;
  r.landings = v.feel.landings - la0;
  r.suspRms = rmsAcc / Math.max(1, rmsN);
  r.exploded = v.exploded ? 1 : 0;
  // settle: time after the vehicle reached x0 until the body stops rocking (> 2 deg/s)
  // high-frequency part (above ~8 Hz) of the angular speed
  const hf = (x: number[]): number => {
    const win = Math.round(1 / v.h / 8);
    let s = 0;
    let n = 0;
    for (let i = win; i < x.length; i++) {
      let m = 0;
      for (let j = i - win; j < i; j++) m += x[j];
      const d = x[i] - m / win;
      s += d * d;
      n++;
    }
    return Math.sqrt(s / Math.max(1, n));
  };
  r.camHfDegS = hf(camR);
  r.bodyHfDegS = hf(bodyR);
  return r;
}

export function rideFeelTest(spec: VehicleSpec): Metrics {
  // a kerb: 8 cm up at x = 40, taken at 15 km/h
  const kerb = rideOver(spec, new FlatGround({ relief: (x) => (x > 40 ? 0.08 : 0) }), 15, 40, 55);
  // a bridge joint: a 2 cm slot 0.12 m wide at x = 60, taken at 60 km/h
  const joint = rideOver(spec, new FlatGround({ relief: (x) => (x > 60 && x < 60.12 ? -0.02 : 0) }), 60, 60, 90);
  // washboard: corrugations 1 cm high every 0.8 m across the gravel road, from x = 60, at 50 km/h
  const wb = rideOver(
    spec,
    new FlatGround({ surface: Surface.Gravel, relief: (x) => (x > 60 ? 0.01 * Math.sin((2 * Math.PI * x) / 0.8) : 0) }),
    50,
    70,
    170,
  );
  // a landing: the road drops 0.5 m at x = 60, taken at 40 km/h
  const land = rideOver(spec, new FlatGround({ relief: (x) => (x > 60 ? -0.5 : 0) }), 40, 60, 90);
  return {
    kerb_thumps: kerb.thumps,
    kerb_body_peak_g: kerb.bodyPeakG,
    kerb_cam_vs_body_peak: kerb.camPeakDegS / Math.max(1e-6, kerb.bodyPeakDegS),
    joint_thumps: joint.thumps,
    joint_cam_peak_deg_s: joint.camPeakDegS,
    washboard_susp_rms_m_s: wb.suspRms,
    washboard_thumps: wb.thumps,
    washboard_cam_hf_deg_s: wb.camHfDegS,
    washboard_cam_vs_body_hf: wb.camHfDegS / Math.max(1e-6, wb.bodyHfDegS),
    landing_detected: land.landings,
    landing_body_peak_g: land.bodyPeakG,
    landing_cam_peak_deg_s: land.camPeakDegS,
    landing_cam_vs_body_peak: land.camPeakDegS / Math.max(1e-6, land.bodyPeakDegS),
    ride_feel_exploded: kerb.exploded + joint.exploded + wb.exploded + land.exploded,
  };
}

export function collectFeelMetrics(spec: VehicleSpec): Metrics {
  return { ...pedalTest(spec), ...parkingTest(spec), ...handbrakeTurnTest(spec), ...steeringTest(spec), ...rideFeelTest(spec) };
}
