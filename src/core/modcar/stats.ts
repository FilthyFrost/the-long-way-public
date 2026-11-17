/**
 * What a build is like to drive, at a glance (docs/MODCAR.md §4, the stat card): 0–100 km/h, top speed,
 * fuel at 90 km/h, weight, grip and handling. A one-dimensional run of the drivetrain against drag and
 * rolling resistance — a millisecond, good enough to compare two builds side by side while a part is held
 * up to a mount. The measured numbers (harness/sim/modcar/feel.ts) come from the full simulation.
 */
import { boostedCurve, derive, type Derived } from './derive';
import { partDef } from './parts';
import { fitPart, fitSub, newInstance } from './build';
import type { Build, PartInstance } from './types';

const G = 9.81;
const RHO = 1.2;

export interface Perf {
  /** seconds from rest to 100 km/h; null = never gets there */
  t100: number | null;
  /** km/h on the flat */
  vmax: number;
  /** L/100 km at a steady 90 km/h (or 90% of the top speed if slower) */
  fuel: number;
  /** kg, with fuel and driver */
  mass: number;
  /** lateral grip on asphalt (g) */
  grip: number;
  /** 0 … 100: quick, light and planted is high; heavy, tall and lazy is low */
  handling: number;
  /** peak power (kW) */
  power: number;
  /** metres to stop from 100 km/h on asphalt (null: no brakes) */
  stop: number | null;
  /** the body's lowest point above the ground at rest (m) */
  clear: number;
  /** body roll in a corner (° per g of cornering) */
  roll: number;
  /** why it cannot drive at all (then t100, vmax and fuel mean nothing) */
  why?: 'engine' | 'gearbox' | 'wheels' | 'other';
}

/** what is missing, for the card */
export const WHY: Record<NonNullable<Perf['why']>, { zh: string; en: string }> = {
  engine: { zh: '缺发动机', en: 'no engine' },
  gearbox: { zh: '缺变速箱', en: 'no gearbox' },
  wheels: { zh: '驱动轮没着地', en: 'no driven wheel down' },
  other: { zh: '开不动', en: "won't drive" },
};

function torqueAt(curve: [number, number][], rpm: number): number {
  if (rpm <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    const [r1, t1] = curve[i];
    if (rpm <= r1) {
      const [r0, t0] = curve[i - 1];
      return t0 + ((t1 - t0) * (rpm - r0)) / (r1 - r0);
    }
  }
  return 0;
}

export function quickPerf(d: Derived, canDrive = true): Perf {
  const s = d.spec;
  const M = s.mass;
  const frontDriven = s.front.driven;
  const rearDriven = s.rear.driven;
  const wf = s.weightFront;
  const wAsph = (i: number): number => d.wheels[i].grip[0];
  const driveLoad = (frontDriven ? wf : 0) + (rearDriven ? 1 - wf : 0);
  const driveGrip =
    (frontDriven ? wf * s.front.muScale * (wAsph(0) + wAsph(1)) * 0.5 : 0) + (rearDriven ? (1 - wf) * s.rear.muScale * (wAsph(2) + wAsph(3)) * 0.5 : 0);
  const traction = driveLoad > 0 ? s.tire.muLong * driveGrip * M * G : 0;
  const r = rearDriven ? (s.rear.wheelRadius ?? s.wheelRadius) : (s.front.wheelRadius ?? s.wheelRadius);
  const rrMul = d.wheels.reduce((a, w) => a + w.rr, 0) / d.wheels.length;
  const rrN = 0.014 * rrMul * M * G;
  const cdA = s.aero.cdA;
  const gb = s.gearbox;
  const eff = gb.efficiency;
  const curve = s.engine.curve;
  const redline = s.engine.redline;
  const mEff = M * 1.06;
  const grip = s.tire.muLat * 0.95 * ((s.front.muScale + s.rear.muScale) / 2) * ((wAsph(0) + wAsph(1) + wAsph(2) + wAsph(3)) / 4);
  // a motorcycle leans instead of rolling over: judge it as if it had a car's track
  const track = d.frame.balance ? 1.3 : Math.max(0.3, (s.front.track + s.rear.track) / 2);
  const rate = s.steering.rateLow;
  const tip = Math.max(0, s.cgHeight / track - 0.42);
  const handling = Math.max(0, Math.min(100, 100 * Math.pow(grip, 0.6) * Math.pow(rate / 1.9, 0.25) * Math.pow(1300 / M, 0.15) / (1 + 2.2 * tip) * (d.frame.balance ? 1.05 : 1)));
  const power = d.peakKw;
  // stopping: the brakes or the tyres, whichever gives first
  const brakeG = Math.min(s.brakes.maxG, s.tire.muLong * 0.95 * ((s.front.muScale + s.rear.muScale) / 2) * ((wAsph(0) + wAsph(1) + wAsph(2) + wAsph(3)) / 4));
  const stop = brakeG > 0.02 ? (100 / 3.6) ** 2 / (2 * brakeG * G) : null;
  const clear = s.cgHeight + s.body.bottom;
  // roll: the weight's moment over the springs' and bars' roll stiffness (a motorcycle leans instead)
  const corner = (share: number, a: typeof s.front): number => {
    const m = (M * share) / 2;
    const k = m * (2 * Math.PI * a.springHz) ** 2;
    return k * (a.track * a.track) * 0.5 * (1 + a.antiRollRatio);
  };
  const kRoll = corner(wf, s.front) + corner(1 - wf, s.rear);
  const roll = d.frame.balance || kRoll <= 0 ? 0 : ((M * G * Math.max(0.1, s.cgHeight - 0.1)) / kRoll) * (180 / Math.PI);
  if (!canDrive || traction <= 0 || power <= 0 || !d.gearbox) {
    const why = power <= 0 ? 'engine' : !d.gearbox ? 'gearbox' : traction <= 0 ? 'wheels' : 'other';
    return { t100: null, vmax: 0, fuel: 0, mass: M, grip, handling, power, why, stop, clear, roll };
  }

  const k = (60 / (2 * Math.PI)) * gb.final;
  let v = 0.05;
  let t = 0;
  let t100: number | null = null;
  let still = 0;
  const dt = 0.02;
  while (t < 120) {
    let best = 0;
    for (let gi = 0; gi < gb.ratios.length; gi++) {
      const ratio = gb.ratios[gi];
      let rpm = (v / r) * ratio * k;
      if (rpm > redline) continue;
      // first gear from rest slips the clutch around the stall speed
      if (gi === 0) rpm = Math.max(rpm, Math.min(s.engine.stall, redline * 0.9));
      const f = (torqueAt(curve, rpm) * ratio * gb.final * eff) / r;
      if (f > best) best = f;
    }
    const fx = Math.min(best, traction) - 0.5 * RHO * cdA * v * v - rrN;
    const a = fx / mEff;
    v = Math.max(0, v + a * dt);
    t += dt;
    if (t100 === null && v >= 100 / 3.6) t100 = t;
    if (a < 0.004) still += dt;
    else still = 0;
    if (still > 1.5) break;
  }
  const vmax = v * 3.6;
  const vf = Math.min(25, v * 0.9);
  const pKw = vf > 0 ? ((0.5 * RHO * cdA * vf * vf + rrN) * vf) / eff / 1000 : 0;
  const lph = pKw * (s.fuel?.lPerKWh ?? 1.5) + (s.fuel?.idleLph ?? 0);
  const fuel = vf > 0 ? lph / (vf * 3.6) * 100 : 0;
  return { t100, vmax, fuel, mass: M, grip, handling, power, stop, clear, roll };
}

export interface StatLine {
  key: 'accel' | 'top' | 'fuel' | 'mass' | 'grip' | 'handling' | 'brake' | 'clear' | 'roll' | 'drive';
  label: { zh: string; en: string };
  /** the value as shown (a number with its unit, or what is missing) */
  before: string | { zh: string; en: string };
  after: string | { zh: string; en: string };
  /** a line that only says something (no before → after) */
  note?: boolean;
  /** −1 worse, 0 same, +1 better */
  better: -1 | 0 | 1;
  /** relative change (after / before − 1), NaN when not comparable */
  change: number;
}

const fmt = (v: number | null, digits: number, unit: string): string => (v === null || !Number.isFinite(v) ? '—' : `${v.toFixed(digits)}${unit}`);

/** the six lines of the stat card: this build now, and with that part on that mount */
export function compare(before: Perf, after: Perf): StatLine[] {
  const line = (key: StatLine['key'], zh: string, en: string, a: number | null, b: number | null, digits: number, unit: string, higherBetter: boolean, driving = false): StatLine => {
    let change = NaN;
    let better: StatLine['better'] = 0;
    // (a line about driving: a build that cannot drive shows what it lacks, and gaining it is better)
    const wa = driving && before.why ? WHY[before.why] : null;
    const wb = driving && after.why ? WHY[after.why] : null;
    if (wa || wb) better = wa && !wb ? 1 : !wa && wb ? -1 : 0;
    else if (a !== null && b !== null && a > 0) {
      change = b / a - 1;
      if (Math.abs(change) > 0.015) better = (change > 0) === higherBetter ? 1 : -1;
    } else if (a === null && b !== null) better = higherBetter ? -1 : 1;
    else if (a !== null && b === null) better = higherBetter ? 1 : -1;
    return { key, label: { zh, en }, before: wa ?? fmt(a, digits, unit), after: wb ?? fmt(b, digits, unit), better, change };
  };
  const rest = [
    line('mass', '重量', 'Weight', before.mass, after.mass, 0, ' kg', false),
    line('grip', '抓地', 'Grip', before.grip, after.grip, 2, ' g', true),
    line('handling', '操控', 'Handling', before.handling, after.handling, 0, '', true),
    line('brake', '百公里刹停', 'Stopping from 100', before.stop, after.stop, 0, ' m', false),
    line('clear', '离地间隙', 'Ground clearance', before.clear * 100, after.clear * 100, 0, ' cm', true),
    // (a motorcycle leans: no roll to show)
    ...(before.roll > 0 || after.roll > 0 ? [line('roll', '侧倾', 'Body roll', before.roll, after.roll, 1, '°/g', false)] : []),
  ];
  // neither way can it drive: say once what it lacks instead of three empty lines
  if (before.why && after.why) return [{ key: 'drive', label: { zh: '还开不动', en: "Won't drive" }, before: WHY[after.why], after: WHY[after.why], better: 0, change: NaN, note: true }, ...rest];
  return [
    // a quicker 0–100 is a smaller number: treat "never" as infinitely slow
    line('accel', '0–100', '0–100', before.t100, after.t100, 1, ' s', false, true),
    line('top', '极速', 'Top speed', before.vmax, after.vmax, 0, ' km/h', true, true),
    line('fuel', '油耗', 'Fuel', before.fuel, after.fuel, 1, ' L/100km', false, true),
    ...rest,
  ];
}

/** a deep copy of a build (instances are plain data) */
export function cloneBuild(b: Build): Build {
  return structuredClone(b);
}

/**
 * The build's performance with `inst` on `mountId` (or on that mount's rim / engine as a sub-part when
 * `sub` is given) — for the stat card while the player holds the part up to the mount.
 */
export function perfWith(build: Build, mountId: string, inst: PartInstance, sub: string | null = null): Perf {
  const b = cloneBuild(build);
  const copy = structuredClone(inst);
  if (sub) {
    const host = b.parts[mountId];
    if (host) fitSub(host, sub, copy);
  } else {
    const p = partDef(copy.part);
    // a bare rim held up to a hub keeps the tyre that is on the hub now, so the card compares rims
    const old = b.parts[mountId];
    if (p.rim?.tire && !copy.sub.tire && old?.sub.tire) copy.sub.tire = old.sub.tire;
    fitPart(b, mountId, copy);
  }
  return quickPerf(derive(b));
}

export { boostedCurve, newInstance };
