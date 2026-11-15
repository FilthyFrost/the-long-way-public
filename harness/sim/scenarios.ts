/**
 * Standard manoeuvres run headless in Node. Each returns plain numbers that the spec
 * cards in specs/driving/ put bounds on. No rendering, no browser: an hour of driving
 * simulates in seconds.
 */
import { FirstPersonRig } from '../../src/core/camera/rig';
import { CirclePath, RobotDriver, StraightPath } from '../../src/core/driver/robot';
import { fbm2 } from '../../src/core/math/noise';
import { Rng } from '../../src/core/math/rng';
import { GRAVITY, VehicleSim, zeroInput, type VehicleInput } from '../../src/core/vehicle/sim';
import type { VehicleSpec } from '../../src/core/vehicle/spec';
import { FlatGround, Surface, type Ground } from '../../src/core/world/ground';

const KMH = 1 / 3.6;
const DEG = 180 / Math.PI;

export type Metrics = Record<string, number>;

function spawn(spec: VehicleSpec, ground: Ground, settle = 1.5): VehicleSim {
  const v = new VehicleSim(spec);
  v.reset(0, 0, 0, 0);
  const inp = zeroInput();
  for (let t = 0; t < settle; t += v.h) v.substep(inp, ground);
  return v;
}

/** linear least squares slope of y over x */
function slope(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return NaN;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
    sxx += xs[i] * xs[i];
    sxy += xs[i] * ys[i];
  }
  return (n * sxy - sx * sy) / (n * sxx - sx * sx);
}

/** Ride: kick the body downwards and read heave frequency and damping from the decay. */
export function rideTest(spec: VehicleSpec): Metrics {
  const ground = new FlatGround();
  const v = spawn(spec, ground, 3);
  v.autoHold = true;
  const y0 = v.py;
  v.vy = -0.45;
  const inp = zeroInput();
  const ys: number[] = [];
  for (let t = 0; t < 4; t += v.h) {
    v.substep(inp, ground);
    ys.push(v.py - y0);
  }
  // extrema of the heave trace
  const ext: { t: number; y: number }[] = [];
  for (let i = 1; i < ys.length - 1; i++) {
    if ((ys[i] - ys[i - 1]) * (ys[i + 1] - ys[i]) < 0 && Math.abs(ys[i]) > 0.0015) ext.push({ t: i * v.h, y: ys[i] });
  }
  let hz = NaN;
  let zeta = NaN;
  if (ext.length >= 3) {
    hz = 1 / (ext[2].t - ext[0].t);
    // half-cycle log decrements, averaged over one full cycle (bump and rebound differ)
    const d1 = Math.log(Math.abs(ext[0].y) / Math.abs(ext[1].y));
    const d2 = Math.log(Math.abs(ext[1].y) / Math.abs(ext[2].y));
    const d = (d1 + d2) / 2;
    zeta = d / Math.sqrt(Math.PI * Math.PI + d * d);
  } else if (ext.length === 2) {
    hz = 0.5 / (ext[1].t - ext[0].t);
    const d = Math.log(Math.abs(ext[0].y) / Math.abs(ext[1].y));
    zeta = d / Math.sqrt(Math.PI * Math.PI + d * d);
  }
  return { ride_hz: hz, ride_zeta: zeta, ride_height_error_cm: Math.abs(y0 - spec.cgHeight) * 100 };
}

/** Straight-line acceleration from rest and top speed. */
export function accelTest(spec: VehicleSpec): Metrics {
  const ground = new FlatGround();
  const v = spawn(spec, ground);
  const inp: VehicleInput = { steer: 0, throttle: 1, brake: 0, handbrake: 0 };
  let t60 = NaN;
  let t100m = NaN;
  let maxPitch = 0;
  let shifts = 0;
  let lastGear = v.gear;
  let maxJerkDip = 0;
  const x0 = v.px;
  for (let t = 0; t < 70; t += v.h) {
    v.substep(inp, ground);
    if (isNaN(t60) && v.vForward >= 60 * KMH) t60 = v.time - 1.5;
    if (isNaN(t100m) && v.px - x0 >= 100) t100m = v.time - 1.5;
    if (t < 6 && v.pitch * DEG > maxPitch) maxPitch = v.pitch * DEG;
    if (v.gear !== lastGear) {
      shifts++;
      lastGear = v.gear;
    }
    if (v.shiftTimer > 0 && -v.accX > maxJerkDip) maxJerkDip = -v.accX;
  }
  return {
    accel_0_60_s: t60,
    accel_100m_s: t100m,
    top_speed_kmh: v.vForward * 3.6,
    squat_deg: maxPitch,
    lateral_drift_m: Math.abs(v.pz),
    gears_used: shifts + 1,
  };
}

/** Full braking from 60 km/h. */
export function brakeTest(spec: VehicleSpec, surface: number = Surface.Asphalt): Metrics {
  const ground = new FlatGround({ surface });
  const v = spawn(spec, ground);
  v.autoReverse = false;
  const inp: VehicleInput = { steer: 0, throttle: 1, brake: 0, handbrake: 0 };
  let guard = 0;
  while (v.vForward < 60.5 * KMH && guard++ < 120 * 120) v.substep(inp, ground);
  inp.throttle = 0;
  while (v.vForward > 60 * KMH && guard++ < 120 * 200) v.substep(inp, ground);
  const x0 = v.px;
  const t0 = v.time;
  inp.brake = 1;
  let maxDive = 0;
  let maxYaw = 0;
  while (v.vForward > 0.1 && v.time - t0 < 20) {
    v.substep(inp, ground);
    if (-v.pitch * DEG > maxDive) maxDive = -v.pitch * DEG;
    if (Math.abs(v.yaw) * DEG > maxYaw) maxYaw = Math.abs(v.yaw) * DEG;
  }
  const dist = v.px - x0;
  return {
    brake_60_0_m: dist,
    brake_time_s: v.time - t0,
    brake_dive_deg: maxDive,
    brake_yaw_dev_deg: maxYaw,
    brake_avg_g: (60 * KMH) ** 2 / (2 * dist) / GRAVITY,
  };
}

/** Constant-radius circle with slowly rising speed: grip limit, understeer and roll gradients. */
export function skidpadTest(spec: VehicleSpec, R = 30): Metrics {
  const ground = new FlatGround();
  const v = new VehicleSim(spec);
  v.reset(0, 0, -R, 0);
  const path = new CirclePath(R);
  const robot = new RobotDriver({ cruise: 4, latG: 5, decel: 5, laneKi: 0.03, laneTrimMax: 0.5 });
  const ays: number[] = [];
  const steers: number[] = [];
  const rolls: number[] = [];
  let maxAy = 0;
  let window = 0;
  let wn = 0;
  let spun = 0;
  for (let t = 0; t < 140; t += v.h) {
    robot.opts.cruise = 4 + 0.16 * Math.max(0, t - 3);
    // the robot holds the radius (pure pursuit + slow trim); when full steering input can no
    // longer hold it, the grip limit a player can reach has been found
    const inp = robot.update(v.h, v, path);
    v.substep(inp, ground);
    const ay = Math.abs(v.vForward * v.yawRate) / GRAVITY;
    window += ay;
    wn++;
    if (wn === 120) {
      const mean = window / wn;
      if (Math.abs(robot.d) < 2.5 && mean > maxAy) maxAy = mean;
      // quasi-steady samples for the gradients
      if (t > 6 && Math.abs(robot.d) < 1.2) {
        ays.push(mean);
        steers.push(Math.abs(v.steerAngle) * DEG);
        rolls.push(Math.abs(v.roll) * DEG);
      }
      window = 0;
      wn = 0;
    }
    if (Math.abs(robot.d) > 6) break;
    const beta = Math.atan2(v.vx * 0 + sideSpeed(v), Math.max(1, Math.abs(v.vForward)));
    if (Math.abs(beta) * DEG > 25) spun = 1;
  }
  const xs: number[] = [];
  const ss: number[] = [];
  const rs: number[] = [];
  for (let i = 0; i < ays.length; i++) {
    if (ays[i] > 0.15 && ays[i] < 0.5) {
      xs.push(ays[i]);
      ss.push(steers[i]);
      rs.push(rolls[i]);
    }
  }
  return {
    max_lat_g: maxAy,
    understeer_deg_per_g: slope(xs, ss),
    roll_deg_per_g: slope(xs, rs),
    skidpad_spun: spun,
  };
}

function sideSpeed(v: VehicleSim): number {
  const b = new Float64Array(9);
  v.basis(b);
  return v.vx * b[6] + v.vy * b[7] + v.vz * b[8];
}

/** Step steer at 60 km/h through the normal input path (includes the steering rate limit). */
export function stepSteerTest(spec: VehicleSpec): Metrics {
  const ground = new FlatGround();
  const v = spawn(spec, ground);
  const robot = new RobotDriver({ cruise: 60 * KMH, latG: 5 });
  const path = new StraightPath();
  let guard = 0;
  while ((v.vForward < 59.8 * KMH || v.time < 20) && guard++ < 120 * 90) {
    const inp = robot.update(v.h, v, path);
    v.substep(inp, ground);
  }
  // find the input that gives ~0.3 g, then measure the transient
  const run = (u: number): { rise: number; over: number; steadyG: number; peakRoll: number } => {
    const s = v.serialize();
    const w = new VehicleSim(spec);
    w.deserialize(s);
    for (const [i, wh] of w.wheels.entries()) wh.comp = v.wheels[i].comp;
    const inp: VehicleInput = { steer: 0, throttle: 0, brake: 0, handbrake: 0 };
    const yr: number[] = [];
    let peakRoll = 0;
    let integ = 0.3;
    for (let t = 0; t < 3.2; t += w.h) {
      const err = 60 * KMH - w.vForward;
      integ = Math.min(1, Math.max(0, integ + err * w.h * 0.3));
      inp.throttle = Math.min(1, Math.max(0, err * 0.5 + integ));
      inp.steer = t >= 0.2 ? u : 0;
      w.substep(inp, ground);
      if (t >= 0.2) {
        yr.push(Math.abs(w.yawRate));
        if (Math.abs(w.roll) * DEG > peakRoll) peakRoll = Math.abs(w.roll) * DEG;
      }
    }
    const n = yr.length;
    let steady = 0;
    let cnt = 0;
    for (let i = Math.floor(n * 0.7); i < n; i++) {
      steady += yr[i];
      cnt++;
    }
    steady /= cnt;
    let t10 = NaN;
    let t90 = NaN;
    let peak = 0;
    for (let i = 0; i < n; i++) {
      if (isNaN(t10) && yr[i] >= 0.1 * steady) t10 = i * w.h;
      if (isNaN(t90) && yr[i] >= 0.9 * steady) t90 = i * w.h;
      if (yr[i] > peak) peak = yr[i];
    }
    return { rise: t90 - t10, over: (peak / steady - 1) * 100, steadyG: (steady * 60 * KMH) / GRAVITY, peakRoll };
  };
  let u = 0.2;
  let r = run(u);
  for (let k = 0; k < 4; k++) {
    u = Math.min(1, Math.max(0.03, (u * 0.3) / Math.max(0.02, r.steadyG)));
    r = run(u);
  }
  return {
    yaw_rise_time_s: r.rise,
    yaw_overshoot_pct: r.over,
    step_steady_g: r.steadyG,
    step_input: u,
  };
}

/** Parked on flat ground, on a hill and on a side slope: must not creep or jitter. */
export function parkedTest(spec: VehicleSpec): Metrics {
  const out: Metrics = {};
  const cases: [string, Ground, Partial<VehicleInput>][] = [
    ['flat', new FlatGround(), {}],
    ['hill8', new FlatGround({ slopeX: 0.08 }), {}],
    ['bank8', new FlatGround({ slopeZ: 0.08 }), {}],
    ['hill15_handbrake', new FlatGround({ slopeX: 0.15 }), { handbrake: 1 }],
  ];
  for (const [name, ground, extra] of cases) {
    const v = new VehicleSim(spec);
    v.reset(0, 0, 0, 0);
    const inp = { ...zeroInput(), ...extra };
    // the vehicle is dropped level onto the slope: long, softly sprung ones need a few seconds to settle
    for (let t = 0; t < 8; t += v.h) v.substep(inp, ground);
    const x0 = v.px;
    const z0 = v.pz;
    let maxV = 0;
    let rmsW = 0;
    let n = 0;
    for (let t = 0; t < 60; t += v.h) {
      v.substep(inp, ground);
      if (v.speed > maxV) maxV = v.speed;
      rmsW += v.avx * v.avx + v.avy * v.avy + v.avz * v.avz;
      n++;
    }
    out[`parked_${name}_drift_cm`] = Math.hypot(v.px - x0, v.pz - z0) * 100;
    out[`parked_${name}_maxv_mm_s`] = maxV * 1000;
    out[`parked_${name}_jitter_mrad_s`] = Math.sqrt(rmsW / n) * 1000;
  }
  return out;
}

/** Random inputs on rough ground: numerical robustness. */
export function fuzzTest(spec: VehicleSpec, seed = 7, seconds = 180): Metrics {
  const relief = (x: number, z: number): number => 0.35 * fbm2(x / 23, z / 23, 11, 3) + 0.05 * fbm2(x / 2.1, z / 2.1, 12, 2);
  const ground = new FlatGround({ relief, surface: Surface.Dirt });
  const v = new VehicleSim(spec);
  v.reset(0, relief(0, 0), 0, 0);
  const rng = new Rng(seed);
  const inp = zeroInput();
  let maxSpeed = 0;
  let flips = 0;
  let flipped = false;
  const b = new Float64Array(9);
  let next = 0;
  let minClear = 1e9;
  const gs = { h: 0 };
  for (let t = 0; t < seconds; t += v.h) {
    if (t >= next) {
      next = t + rng.range(0.2, 1.2);
      inp.steer = rng.range(-1, 1);
      inp.throttle = rng.chance(0.75) ? rng.next() : 0;
      inp.brake = rng.chance(0.2) ? rng.next() : 0;
      inp.handbrake = rng.chance(0.08) ? 1 : 0;
    }
    v.substep(inp, ground);
    if (v.exploded) break;
    if (v.speed > maxSpeed) maxSpeed = v.speed;
    v.basis(b);
    const up = b[4];
    if (up < 0.2 && !flipped) {
      flipped = true;
      flips++;
    }
    gs.h = relief(v.px, v.pz);
    const clear = v.py - gs.h;
    if (clear < minClear) minClear = clear;
    if (flipped && up < 0.2 && v.speed < 0.5) {
      // put it back on its wheels, like the player would
      v.reset(v.px, relief(v.px, v.pz), v.pz, v.yaw);
      flipped = false;
    } else if (up > 0.6) flipped = false;
  }
  return {
    fuzz_exploded: v.exploded ? 1 : 0,
    fuzz_max_speed_kmh: maxSpeed * 3.6,
    fuzz_flips: flips,
    fuzz_min_cg_clearance_m: minClear,
  };
}

/** Spectrum helper: RMS of the part of a signal above `cutHz`. */
function highPassRms(x: number[], rate: number, cutHz: number): number {
  // subtract a moving average whose length matches the cut-off, then take the RMS
  const win = Math.max(1, Math.round(rate / cutHz));
  let acc = 0;
  const out: number[] = [];
  for (let i = 0; i < x.length; i++) {
    acc += x[i];
    if (i >= win) acc -= x[i - win];
    if (i >= win - 1) out.push(x[i - Math.floor(win / 2)] - acc / win);
  }
  let s = 0;
  for (const v of out) s += v * v;
  return Math.sqrt(s / Math.max(1, out.length));
}

/** Camera comfort: drive a coarse dirt road at 50 km/h and measure high-frequency view shake. */
export function cameraComfortTest(spec: VehicleSpec): Metrics {
  const relief = (x: number, z: number): number => 0.02 * fbm2(x / 1.4, z / 1.4, 31, 2) + 0.05 * fbm2(x / 9, z / 9, 32, 2);
  const ground = new FlatGround({ relief, surface: Surface.Gravel });
  const v = new VehicleSim(spec);
  v.reset(0, relief(0, 0), 0, 0);
  const rig = new FirstPersonRig();
  const robot = new RobotDriver({ cruise: 50 * KMH, latG: 5 });
  const path = new StraightPath();
  const camPitch: number[] = [];
  const camRoll: number[] = [];
  const bodyPitch: number[] = [];
  const bodyRoll: number[] = [];
  const camY: number[] = [];
  let pq = [0, 0, 0, 1];
  for (let t = 0; t < 40; t += v.h) {
    const inp = robot.update(v.h, v, path);
    v.substep(inp, ground);
    rig.update(v.h, v);
    if (t > 15) {
      // angular velocity of the view from successive quaternions (deg/s), split into pitch-ish and roll-ish parts
      const dq = quatDelta(pq, [rig.qx, rig.qy, rig.qz, rig.qw]);
      camRoll.push((2 * dq[0] * DEG) / v.h);
      camPitch.push((2 * dq[2] * DEG) / v.h);
      bodyPitch.push((v.avz * DEG) as number);
      bodyRoll.push((v.avx * DEG) as number);
      camY.push(rig.y);
    }
    pq = [rig.qx, rig.qy, rig.qz, rig.qw];
  }
  const rate = 1 / v.h;
  const cam = Math.hypot(highPassRms(camPitch, rate, 8), highPassRms(camRoll, rate, 8));
  const body = Math.hypot(highPassRms(bodyPitch, rate, 8), highPassRms(bodyRoll, rate, 8));
  return {
    cam_shake_hf_deg_s: cam,
    cam_vs_body_shake_ratio: cam / Math.max(1e-6, body),
    cam_bob_hf_mm: highPassRms(camY, rate, 8) * 1000,
    comfort_speed_kmh: v.vForward * 3.6,
  };
}

/** relative rotation b·a⁻¹ (small angle → xyz ≈ half the rotation vector, in the local frame of a) */
function quatDelta(a: number[], b: number[]): number[] {
  // a⁻¹ ⊗ b
  const ax = -a[0];
  const ay = -a[1];
  const az = -a[2];
  const aw = a[3];
  return [
    aw * b[0] + ax * b[3] + ay * b[2] - az * b[1],
    aw * b[1] - ax * b[2] + ay * b[3] + az * b[0],
    aw * b[2] + ax * b[1] - ay * b[0] + az * b[3],
    aw * b[3] - ax * b[0] - ay * b[1] - az * b[2],
  ];
}

/** Lane change at 50 km/h on asphalt: tracking and stability through the normal driver model. */
export function laneChangeTest(spec: VehicleSpec): Metrics {
  const ground = new FlatGround();
  const v = spawn(spec, ground);
  const robot = new RobotDriver({ cruise: 50 * KMH, latG: 5 });
  const path = new StraightPath();
  let maxRoll = 0;
  let maxBeta = 0;
  let settleT = NaN;
  let tChange = NaN;
  for (let t = 0; t < 45; t += v.h) {
    if (isNaN(tChange) && v.vForward > 49.5 * KMH && t > 15) {
      tChange = t;
      robot.opts.lane = 3.2;
    }
    const inp = robot.update(v.h, v, path);
    v.substep(inp, ground);
    if (!isNaN(tChange)) {
      if (Math.abs(v.roll) * DEG > maxRoll) maxRoll = Math.abs(v.roll) * DEG;
      const beta = Math.abs(Math.atan2(sideSpeed(v), Math.max(1, v.vForward))) * DEG;
      if (beta > maxBeta) maxBeta = beta;
      if (Math.abs(v.pz - 3.2) > 0.25) settleT = NaN;
      else if (isNaN(settleT)) settleT = t - tChange;
    }
  }
  return { lane_change_settle_s: settleT, lane_change_max_roll_deg: maxRoll, lane_change_max_slip_deg: maxBeta };
}

export function collectDrivingMetrics(spec: VehicleSpec): Metrics {
  return {
    ...rideTest(spec),
    ...accelTest(spec),
    ...brakeTest(spec),
    ...skidpadTest(spec),
    ...stepSteerTest(spec),
    ...laneChangeTest(spec),
    ...parkedTest(spec),
    ...fuzzTest(spec),
    ...cameraComfortTest(spec),
  };
}
