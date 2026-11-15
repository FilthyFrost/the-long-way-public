/**
 * What a ModCar build feels like, measured headless (docs/MODCAR.md §4 属性卡, §10.4 手感差异): the
 * numbers a part swap must change — acceleration, top speed, braking, cornering grip, roll, wheelies,
 * the steepest start on a hill, fuel. Any VehicleSpec (+ the per-wheel SimMods its derive writes);
 * every measurement takes well under two seconds in Node.
 *
 *   npx tsx harness/sim/modcar/feel.ts        prints the four stock frames
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CirclePath, RobotDriver } from '../../../src/core/driver/robot';
import { clamp } from '../../../src/core/math/util';
import type { SimMods } from '../../../src/core/vehicle/mods';
import { GRAVITY, VehicleSim, zeroInput, type VehicleInput } from '../../../src/core/vehicle/sim';
import type { VehicleSpec } from '../../../src/core/vehicle/spec';
import { FlatGround, Surface, type Ground } from '../../../src/core/world/ground';

const KMH = 1 / 3.6;
const DEG = 180 / Math.PI;

export interface FeelSetup {
  /** the per-wheel modifiers of the build (mismatched sizes, bare rims, empty hubs), set before it is placed */
  mods?: (m: SimMods) => void;
}

export interface ModcarFeel {
  /** full throttle from rest on level asphalt: time to 60 and to 100 km/h (s; NaN = not within 60 s) */
  t0to60: number;
  t0to100: number;
  /** the figure that describes the build: 0–100, or 0–60 for a slow one (100 not reached in 40 s) */
  accelKind: '0-100' | '0-60' | 'none';
  /** the time for that figure (s; NaN for 'none') */
  accelS: number;
  /** top speed on the level (km/h): full throttle until it stops gaining */
  topKmh: number;
  /** full braking to rest on asphalt from 100 and from 60 km/h (m; NaN = it cannot reach the speed) */
  brake100m: number;
  brake60m: number;
  /** steady cornering limit on a 30 m circle (g) */
  maxLatG: number;
  /** body roll per g of steady cornering (°/g) — a single-track vehicle stays upright: see leanDegPerG */
  rollDegPerG: number;
  /** visual lean per g (°/g; 0 for four wheels) */
  leanDegPerG: number;
  /** full throttle from a standstill: the front wheels were off the ground for a quarter second or more */
  wheelie: boolean;
  /** largest nose-up pitch in that launch (deg) and how long the front was up (s) */
  wheelieMaxPitchDeg: number;
  wheelieS: number;
  /** steepest grade it starts up from rest and climbs 20 m (%) on asphalt and on gravel */
  gradeAsphaltPct: number;
  gradeGravelPct: number;
  /** fuel at a steady 60 and 90 km/h on level asphalt (L/100 km, game scale; NaN without spec.fuel or the speed) */
  fuel60: number;
  fuel90: number;
  /** a run blew up (NaN state) */
  exploded: boolean;
  /** wall time of the whole measurement (ms) */
  ms: number;
}

/** a sim of the build standing at rest on `ground` (on a grade: placed nose up on it), settled */
export function spawn(spec: VehicleSpec, setup: FeelSetup | undefined, ground: Ground, grade = 0, settle = 1.5): VehicleSim {
  const v = new VehicleSim(spec);
  setup?.mods?.(v.mods);
  v.reset(0, 0, 0, 0);
  if (grade !== 0) {
    // tip it onto the slope about its centre of gravity (a level drop onto a steep slope throws it)
    const th = Math.atan(grade);
    const c = Math.cos(th / 2);
    const s = Math.sin(th / 2);
    // pre-multiply by the world pitch: q' = (0, 0, s, c) ⊗ q
    const { qx, qy, qz, qw } = v;
    v.qx = v.pqx = c * qx - s * qy;
    v.qy = v.pqy = c * qy + s * qx;
    v.qz = v.pqz = c * qz + s * qw;
    v.qw = v.pqw = c * qw - s * qz;
    v.py = v.ppy = v.py / Math.cos(th) + 0.03;
  }
  const inp = zeroInput();
  for (let t = 0; t < settle; t += v.h) v.substep(inp, ground);
  return v;
}

/** hold `kmh` with a PI speed controller until steady for `hold` s (false if it never gets there) */
function cruiseTo(v: VehicleSim, ground: Ground, kmh: number, hold = 2, limit = 90): boolean {
  const inp = zeroInput();
  let integ = 0;
  let steady = 0;
  for (let t = 0; t < limit && steady < hold; t += v.h) {
    const err = kmh * KMH - v.vForward;
    integ = clamp(integ + err * 0.1 * v.h, 0, 0.9);
    inp.throttle = clamp(err * 0.6 + integ, 0, 1);
    inp.brake = err < -1 ? 0.3 : 0;
    v.substep(inp, ground);
    steady = Math.abs(err) < 0.4 ? steady + v.h : 0;
  }
  return steady >= hold;
}

interface Launch {
  t60: number;
  t100: number;
  top: number;
  wheelieS: number;
  maxPitch: number;
  exploded: boolean;
}

/** full throttle from rest: acceleration, the launch's pitch, and on until the speed stops rising */
function launch(spec: VehicleSpec, setup?: FeelSetup): Launch {
  const flat = new FlatGround();
  const v = spawn(spec, setup, flat);
  const inp: VehicleInput = { steer: 0, throttle: 1, brake: 0, handbrake: 0 };
  const r: Launch = { t60: NaN, t100: NaN, top: 0, wheelieS: 0, maxPitch: 0, exploded: false };
  const t0 = v.time;
  // the speed a few seconds back: it has topped out once that stops growing
  const hist: number[] = [];
  const every = 30;
  for (let i = 0; i < 120 * 150; i++) {
    v.substep(inp, flat);
    const t = v.time - t0;
    const kmh = v.vForward * 3.6;
    if (Number.isNaN(r.t60) && kmh >= 60) r.t60 = t;
    if (Number.isNaN(r.t100) && kmh >= 100) r.t100 = t;
    if (kmh > r.top) r.top = kmh;
    if (t < 8) {
      if (v.wheelie) r.wheelieS += v.h;
      if (v.pitch * DEG > r.maxPitch) r.maxPitch = v.pitch * DEG;
    }
    if (v.exploded) {
      r.exploded = true;
      break;
    }
    if (i % every === 0) {
      hist.push(kmh);
      // 4 s back (16 samples of 0.25 s)
      if (hist.length > 16 && t > 10 && kmh - hist[hist.length - 17] < 0.3) break;
    }
  }
  if (r.t60 > 60) r.t60 = NaN;
  if (r.t100 > 60) r.t100 = NaN;
  return r;
}

/** full braking from `kmh` to rest (m): NaN if the build cannot reach that speed */
function brakeFrom(spec: VehicleSpec, setup: FeelSetup | undefined, kmh: number): number {
  const flat = new FlatGround();
  const v = spawn(spec, setup, flat);
  v.autoReverse = false;
  const inp: VehicleInput = { steer: 0, throttle: 1, brake: 0, handbrake: 0 };
  let guard = 0;
  while (v.vForward < (kmh + 0.5) * KMH && guard++ < 120 * 90) v.substep(inp, flat);
  if (v.vForward < (kmh + 0.5) * KMH) return NaN;
  inp.throttle = 0;
  while (v.vForward > kmh * KMH && guard++ < 120 * 120) v.substep(inp, flat);
  const x0 = v.px;
  const z0 = v.pz;
  const t0 = v.time;
  inp.brake = 1;
  while (v.vForward > 0.1 && v.time - t0 < 30) v.substep(inp, flat);
  return v.exploded ? NaN : Math.hypot(v.px - x0, v.pz - z0);
}

/** linear least squares slope */
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
  const d = n * sxx - sx * sx;
  return Math.abs(d) < 1e-12 ? NaN : (n * sxy - sx * sy) / d;
}

/** the robot on a 30 m circle with the speed rising slowly: the grip limit, roll and lean gradients */
function skidpad(spec: VehicleSpec, setup?: FeelSetup): { maxLatG: number; roll: number; lean: number } {
  const R = 30;
  const ground = new FlatGround();
  const v = new VehicleSim(spec);
  setup?.mods?.(v.mods);
  v.reset(0, 0, -R, 0);
  const path = new CirclePath(R);
  const robot = new RobotDriver({ cruise: 4, latG: 5, decel: 5, laneKi: 0.03, laneTrimMax: 0.5 });
  const ays: number[] = [];
  const rolls: number[] = [];
  const leans: number[] = [];
  const b = new Float64Array(9);
  let maxAy = 0;
  let acc = 0;
  let n = 0;
  let beta = 0;
  for (let t = 0; t < 140; t += v.h) {
    robot.opts.cruise = 4 + 0.16 * Math.max(0, t - 3);
    v.substep(robot.update(v.h, v, path), ground);
    if (v.exploded) break;
    acc += Math.abs(v.vForward * v.yawRate) / GRAVITY;
    // sideslip: a window in which the vehicle slid or spun does not count (its yaw rate is not cornering)
    v.basis(b);
    const side = v.vx * b[6] + v.vy * b[7] + v.vz * b[8];
    const sl = Math.abs(Math.atan2(side, Math.max(1, Math.abs(v.vForward))));
    if (sl > beta) beta = sl;
    if (++n === 120) {
      const mean = acc / n;
      const held = Math.abs(robot.d) < 2.5 && beta < 8 / DEG;
      if (held && mean > maxAy) maxAy = mean;
      if (held && t > 6 && Math.abs(robot.d) < 1.2 && mean > 0.15 && mean < 0.5) {
        ays.push(mean);
        rolls.push(Math.abs(v.roll) * DEG);
        leans.push(Math.abs(v.lean) * DEG);
      }
      acc = 0;
      n = 0;
      beta = 0;
    }
    if (Math.abs(robot.d) > 6) break;
  }
  return { maxLatG: maxAy, roll: slope(ays, rolls), lean: spec.balance ? slope(ays, leans) : 0 };
}

/** does it start from rest up `grade` and climb 20 m in 16 s, still moving? */
function climbs(spec: VehicleSpec, setup: FeelSetup | undefined, grade: number, surface: number): boolean {
  const ground = new FlatGround({ slopeX: grade, surface });
  const v = spawn(spec, setup, ground, grade, 4);
  const x0 = v.px;
  const go: VehicleInput = { steer: 0, throttle: 1, brake: 0, handbrake: 0 };
  for (let t = 0; t < 16; t += v.h) v.substep(go, ground);
  return v.px - x0 >= 20 && v.vForward > 0.5 && !v.exploded;
}

/** steepest grade climbed (%), by bisection to 1 % between 0 and 100 % */
function maxGrade(spec: VehicleSpec, setup: FeelSetup | undefined, surface: number): number {
  if (!climbs(spec, setup, 0.005, surface)) return 0;
  let lo = 0.005;
  let hi = 1.0;
  if (climbs(spec, setup, hi, surface)) return hi * 100;
  while (hi - lo > 0.01) {
    const mid = (lo + hi) / 2;
    if (climbs(spec, setup, mid, surface)) lo = mid;
    else hi = mid;
  }
  return lo * 100;
}

/** L/100 km at a steady `kmh` on level asphalt (NaN without a fuel spec or if it cannot hold the speed) */
function fuelAt(spec: VehicleSpec, setup: FeelSetup | undefined, kmh: number): number {
  if (!spec.fuel) return NaN;
  const flat = new FlatGround();
  const v = spawn(spec, setup, flat, 0, 0.5);
  if (!cruiseTo(v, flat, kmh, 4, 120)) return NaN;
  const inp = zeroInput();
  let integ = 0.3;
  const x0 = v.px;
  const f0 = v.fuelUsedL;
  for (let t = 0; t < 200 && v.px - x0 < 1500; t += v.h) {
    const err = kmh * KMH - v.vForward;
    integ = clamp(integ + err * 0.08 * v.h, 0, 0.9);
    inp.throttle = clamp(err * 0.5 + integ, 0, 1);
    v.substep(inp, flat);
  }
  const km = (v.px - x0) / 1000;
  return km > 0.5 ? ((v.fuelUsedL - f0) / km) * 100 : NaN;
}

/** every figure of the feel card for one build */
export function measureFeel(spec: VehicleSpec, setup?: FeelSetup): ModcarFeel {
  const t0 = performance.now();
  const l = launch(spec, setup);
  const accelKind: ModcarFeel['accelKind'] = l.t100 <= 40 ? '0-100' : Number.isFinite(l.t60) ? '0-60' : 'none';
  const sk = skidpad(spec, setup);
  const out: ModcarFeel = {
    t0to60: l.t60,
    t0to100: l.t100,
    accelKind,
    accelS: accelKind === '0-100' ? l.t100 : accelKind === '0-60' ? l.t60 : NaN,
    topKmh: l.top,
    brake100m: brakeFrom(spec, setup, 100),
    brake60m: brakeFrom(spec, setup, 60),
    maxLatG: sk.maxLatG,
    rollDegPerG: sk.roll,
    leanDegPerG: sk.lean,
    wheelie: l.wheelieS >= 0.25,
    wheelieMaxPitchDeg: l.maxPitch,
    wheelieS: l.wheelieS,
    gradeAsphaltPct: maxGrade(spec, setup, Surface.Asphalt),
    gradeGravelPct: maxGrade(spec, setup, Surface.Gravel),
    fuel60: fuelAt(spec, setup, 60),
    fuel90: fuelAt(spec, setup, 90),
    exploded: l.exploded,
    ms: 0,
  };
  out.ms = performance.now() - t0;
  return out;
}

/** the single figures on their own, for tests that need only one (each well under 2 s) */
export const feel = {
  launch,
  brakeFrom,
  skidpad,
  maxGrade,
  fuelAt,
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { build } = await import('./specgen');
  for (const frame of ['sedan', 'pickup', 'moto', 'rv'] as const) {
    const m = measureFeel(build({ frame }));
    const f = (x: number, d = 1): string => (Number.isFinite(x) ? x.toFixed(d) : '—');
    console.log(
      `${frame.padEnd(7)} ${m.accelKind} ${f(m.accelS)} s · top ${f(m.topKmh, 0)} km/h · 100–0 ${f(m.brake100m)} m · 60–0 ${f(m.brake60m)} m · ` +
        `lat ${f(m.maxLatG, 2)} g · roll ${f(m.rollDegPerG, 2)} °/g · lean ${f(m.leanDegPerG, 1)} °/g · wheelie ${m.wheelie ? 'yes' : 'no'} ${f(m.wheelieMaxPitchDeg)}° · ` +
        `grade ${f(m.gradeAsphaltPct, 0)} / ${f(m.gradeGravelPct, 0)} % · fuel ${f(m.fuel60)} / ${f(m.fuel90)} L/100km · ${f(m.ms, 0)} ms`,
    );
  }
}
