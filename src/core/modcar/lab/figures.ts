/**
 * Every part against the stock build, on the feel harness (docs/MODCAR.md §10.4 and the handling plan: a part swapped
 * must change at least one figure by 10 % or more): each part put on every mount of its kind of a frame it belongs on
 * (a motorcycle's on the motorcycle, a twin rim on the motorhome's rear, the rest on the saloon), measured, and the
 * figure that moved most. Two figures the stock harness does not take are added here: how quickly the car answers
 * the wheel (a step of steering at 60 km/h: the time to two thirds of its steady yaw rate, and that rate) and how far
 * the tail comes round on the handbrake (the largest body slip in a handbrake turn from 50 km/h).
 * (In the game's source so the developer's panel can run it on the vehicle at hand: devLab.ts.)
 *
 *   npx tsx harness/sim/modcar/part_matrix.ts [category …]
 */
import { fitPart, fitSub, newInstance, stockBuild } from '../build';
import { derive } from '../derive';
import { frameDef } from '../frames';
import { partDef } from '../parts';
import type { Build, PartDef } from '../types';
import { VehicleSim, type VehicleInput } from '../../vehicle/sim';
import type { VehicleSpec } from '../../vehicle/spec';
import { FlatGround, GroundSample, Surface, SURFACES, type Ground } from '../../world/ground';
import { derivedMods } from './derived';
import { measureFeel, spawn, type FeelSetup, type ModcarFeel } from './feel';

const KMH = 1 / 3.6;
const DEG = 180 / Math.PI;

/** a step of half steering at 60 km/h: the time to two thirds of the yaw rate it settles at (s), and that rate (°/s) */
export function stepSteer(spec: VehicleSpec, setup?: FeelSetup): { t63: number; yaw: number } {
  const flat = new FlatGround();
  const v = spawn(spec, setup, flat);
  v.autoReverse = false;
  const inp: VehicleInput = { steer: 0, throttle: 1, brake: 0, handbrake: 0 };
  let guard = 0;
  while (v.vForward < 60 * KMH && guard++ < 120 * 60) v.substep(inp, flat);
  if (v.vForward < 60 * KMH) return { t63: NaN, yaw: NaN };
  // hold 60 on the throttle, then the step
  const hold = (): void => {
    const err = 60 * KMH - v.vForward;
    inp.throttle = Math.max(0, Math.min(1, err * 0.5 + 0.25));
  };
  for (let i = 0; i < 120; i++) {
    hold();
    v.substep(inp, flat);
  }
  inp.steer = 0.5;
  const t0 = v.time;
  const rates: { t: number; r: number }[] = [];
  while (v.time - t0 < 2.5) {
    hold();
    v.substep(inp, flat);
    rates.push({ t: v.time - t0, r: Math.abs(v.yawRate) * DEG });
  }
  const tail = rates.filter((x) => x.t > 2.0);
  const steady = tail.reduce((a, x) => a + x.r, 0) / Math.max(1, tail.length);
  const hit = rates.find((x) => x.r >= steady * 0.632);
  return { t63: hit ? hit.t : NaN, yaw: steady };
}

/** a handbrake turn from 50 km/h: a quarter of the wheel and the handbrake for 0.6 s; the largest body slip (°) */
export function handbrakeTurn(spec: VehicleSpec, setup?: FeelSetup): number {
  const flat = new FlatGround();
  const v = spawn(spec, setup, flat);
  v.autoReverse = false;
  const inp: VehicleInput = { steer: 0, throttle: 1, brake: 0, handbrake: 0 };
  let guard = 0;
  while (v.vForward < 50 * KMH && guard++ < 120 * 60) v.substep(inp, flat);
  if (v.vForward < 50 * KMH) return NaN;
  inp.throttle = 0;
  inp.steer = 0.25;
  inp.handbrake = 1;
  const t0 = v.time;
  const b = new Float64Array(9);
  let beta = 0;
  while (v.time - t0 < 2.2) {
    if (v.time - t0 > 0.6) inp.handbrake = 0;
    v.substep(inp, flat);
    v.basis(b);
    const side = v.vx * b[6] + v.vy * b[7] + v.vz * b[8];
    const sp = Math.hypot(v.vx, v.vz);
    if (sp > 3) beta = Math.max(beta, Math.abs(Math.atan2(side, Math.abs(v.vForward))) * DEG);
  }
  return beta;
}

/** the left wheels on ice, the right ones on asphalt: a car pulling out of a frozen verge */
class SplitGround implements Ground {
  sample(_x: number, z: number, out: GroundSample): void {
    out.h = 0;
    out.nx = 0;
    out.ny = 1;
    out.nz = 0;
    const s = z < 0 ? Surface.Ice : Surface.Asphalt;
    out.surface = s;
    out.mu = SURFACES[s].mu;
    out.rr = SURFACES[s].rr;
  }
}

/**
 * Full throttle from rest with the left wheels on ice and the right ones on asphalt, steered to keep straight
 * along the line between them: the time to 30 km/h (s; NaN: not within 20 s). What a differential is for.
 */
export function splitLaunch(spec: VehicleSpec, setup?: FeelSetup): number {
  const g = new SplitGround();
  const v = spawn(spec, setup, g);
  v.autoReverse = false;
  const inp: VehicleInput = { steer: 0, throttle: 1, brake: 0, handbrake: 0 };
  const b = new Float64Array(9);
  const t0 = v.time;
  while (v.time - t0 < 20) {
    v.basis(b);
    // (the heading off +x, and how far the car has wandered off the line: steer back onto it)
    const head = Math.atan2(b[2], b[0]);
    inp.steer = Math.max(-1, Math.min(1, -(2.5 * head + 0.8 * v.pz)));
    v.substep(inp, g);
    if (v.vForward >= 30 * KMH) return v.time - t0;
  }
  return NaN;
}

/** the figures read off the build without driving it: what a part is, not how it drives */
export interface SpecFigures {
  /** the drive cut at each gear change (s) */
  shiftS: number;
  /** the eye above the ground at rest (m) */
  eyeY: number;
  /** the driver's seat's comfort (0…1) */
  comfort: number;
  /** protection (0…1) and drag (m²) */
  armor: number;
  cdA: number;
  mass: number;
  tankL: number;
  coolKw: number;
  batteryKWh: number;
  /** the headlamps' light and reach */
  lampLight: number;
  lampReach: number;
  /** the shell's protection (the panels' armour, on average), what the bumpers and the roof ram with */
  protection: number;
  ramFront: number;
  ramRear: number;
  ramRoof: number;
  /** air into the engine bay through the bonnet, the roof's lamps (W) and solar panel (W) */
  hoodCooling: number;
  roofLightW: number;
  solarW: number;
  /** the body's lowest point above the ground at rest (m), how far the tyres go new (km), how shut the cabin is */
  clearance: number;
  tyreLife: number;
  enclosed: number;
}

/** the figures compared (a name, how to read it from a measurement, which way is better) */
export interface Figures extends ModcarFeel, SpecFigures {
  steerT63: number;
  steerYaw: number;
  hbSlip: number;
  t60to100: number;
  splitS: number;
}

export function specFiguresOf(b: Build): SpecFigures {
  const d = derive(b);
  const spec = d.spec as VehicleSpec;
  const first = (cat: string): PartDef | null => {
    for (const m of frameDef(b.frame).mounts) {
      const inst = b.parts[m.id];
      if (m.cat === cat && inst && (cat !== 'seat' || m.driver)) return partDef(inst.part);
    }
    return null;
  };
  const lamp = first('headlight')?.lamp;
  const shell = frameDef(b.frame).mounts.filter((m) => m.cat === 'door' || m.cat === 'hood' || m.cat === 'trunk' || m.cat === 'armor');
  const prot = shell.length ? shell.reduce((a, m) => a + (b.parts[m.id] ? (partDef(b.parts[m.id].part).panel?.armor ?? partDef(b.parts[m.id].part).armor?.armor ?? 0) : 0), 0) / shell.length : 0;
  const roof = first('roof')?.roof;
  const tyre = frameDef(b.frame).mounts.map((m) => b.parts[m.id]?.sub.tire).find((t) => !!t);
  return {
    protection: prot,
    ramFront: first('bumperFront')?.bumper?.ram ?? 0,
    ramRear: first('bumperRear')?.bumper?.ram ?? 0,
    ramRoof: roof?.ram ?? 0,
    hoodCooling: first('hood')?.panel?.cooling ?? 0,
    roofLightW: roof?.lightW ?? 0,
    solarW: roof?.solarW ?? 0,
    clearance: spec.cgHeight + spec.body.bottom,
    tyreLife: tyre ? (partDef(tyre.part).tire?.life ?? 0) : 0,
    enclosed: d.enclosed,
    shiftS: spec.gearbox.shiftTime,
    eyeY: spec.eye.y + spec.cgHeight,
    comfort: first('seat')?.seat?.comfort ?? 0,
    armor: d.armor,
    cdA: spec.aero.cdA,
    mass: d.mass,
    tankL: d.fuelTankL,
    coolKw: first('radiator')?.radiator?.coolKw ?? 0,
    batteryKWh: first('battery')?.battery?.kWh ?? 0,
    lampLight: lamp?.light ?? 0,
    lampReach: lamp?.reach ?? 0,
  };
}

export function figuresOf(b: Build): Figures {
  const d = derive(b);
  const spec = d.spec as VehicleSpec;
  const setup = { mods: derivedMods(d) };
  const f = measureFeel(spec, setup);
  const s = stepSteer(spec, setup);
  return { ...f, ...specFiguresOf(b), steerT63: s.t63, steerYaw: s.yaw, hbSlip: handbrakeTurn(spec, setup), t60to100: f.t0to100 - f.t0to60, splitS: splitLaunch(spec, setup) };
}

export const FIGURES: { key: keyof Figures; zh: string; higher: boolean }[] = [
  { key: 'accelS', zh: '加速', higher: false },
  { key: 't60to100', zh: '中段加速', higher: false },
  { key: 'topKmh', zh: '极速', higher: true },
  { key: 'brake100m', zh: '刹车', higher: false },
  { key: 'maxLatG', zh: '侧向G', higher: true },
  { key: 'rollDegPerG', zh: '侧倾', higher: false },
  { key: 'understeerDegPerG', zh: '推头', higher: false },
  { key: 'gradeGravelPct', zh: '爬坡', higher: true },
  { key: 'fuel90', zh: '油耗', higher: false },
  { key: 'steerT63', zh: '转向响应', higher: false },
  { key: 'steerYaw', zh: '转向增益', higher: true },
  { key: 'hbSlip', zh: '手刹甩尾', higher: true },
  { key: 'splitS', zh: '单边冰起步', higher: false },
  { key: 'shiftS', zh: '换挡', higher: false },
  { key: 'eyeY', zh: '坐姿', higher: true },
  { key: 'comfort', zh: '舒适', higher: true },
  { key: 'armor', zh: '防护', higher: true },
  { key: 'cdA', zh: '风阻', higher: false },
  { key: 'mass', zh: '重量', higher: false },
  { key: 'tankL', zh: '油箱', higher: true },
  { key: 'coolKw', zh: '散热', higher: true },
  { key: 'batteryKWh', zh: '电量', higher: true },
  { key: 'lampLight', zh: '灯光', higher: true },
  { key: 'lampReach', zh: '照远', higher: true },
  { key: 'protection', zh: '车身防护', higher: true },
  { key: 'ramFront', zh: '前撞', higher: true },
  { key: 'ramRear', zh: '后撞', higher: true },
  { key: 'ramRoof', zh: '顶刺', higher: true },
  { key: 'hoodCooling', zh: '机舱进气', higher: true },
  { key: 'roofLightW', zh: '顶灯', higher: true },
  { key: 'solarW', zh: '太阳能', higher: true },
  { key: 'clearance', zh: '离地', higher: true },
  { key: 'tyreLife', zh: '胎寿', higher: true },
  { key: 'enclosed', zh: '密封', higher: true },
];

/** the categories whose parts are judged by how the build drives (the rest by what they are: spec figures only) */
export const DRIVEN_CATS: ReadonlySet<string> = new Set(['engine', 'gearbox', 'exhaust', 'turbo', 'rim', 'tire', 'steering', 'handbrake', 'suspension', 'brakes', 'diff']);

/** the categories that need not change a figure: they are what they do (a radio plays, a horn sounds, a key starts it) */
export const EXEMPT_CATS: ReadonlySet<string> = new Set(['radio', 'horn', 'ignition', 'taillight', 'mirror']);

/** (understeer reads oddly for a steering wheel of another ratio: never the figure a part is judged by) */
export const JUDGED: readonly (keyof Figures)[] = FIGURES.map((f) => f.key).filter((k) => k !== 'understeerDegPerG' && k !== 'rollDegPerG');

/** a part on every mount of its kind of the frame it belongs on (a wheel keeps its tyre; a tyre goes on every rim) */
export function withPart(p: PartDef): Build | null {
  const tags = p.tags ?? [];
  const frame = tags.includes('stock:moto') && !tags.some((t) => t === 'stock:sedan' || t === 'stock:pickup' || t === 'stock:rv') ? 'moto' : p.rim?.dual ? 'rv' : 'sedan';
  const b = stockBuild(frame, { fuel: 0.5 });
  const f = frameDef(frame);
  if (p.cat === 'tire') {
    let any = false;
    for (const m of f.mounts) {
      const inst = b.parts[m.id];
      if (inst && partDef(inst.part).rim?.tire) {
        fitSub(inst, 'tire', newInstance(p.id));
        any = true;
      }
    }
    return any ? b : null;
  }
  if (p.cat === 'turbo') {
    const eng = f.mounts.find((m) => m.cat === 'engine');
    const inst = eng ? b.parts[eng.id] : null;
    if (!inst || !partDef(inst.part).engine?.turbo) return null;
    fitSub(inst, 'turbo', newInstance(p.id));
    return b;
  }
  const mounts = f.mounts.filter((m) => m.cat === p.cat && (!p.rim?.dual || b.parts[m.id]?.part === 'rim_dually') && (p.cat !== 'seat' || m.driver));
  if (!mounts.length) return null;
  for (const m of mounts) {
    const was = b.parts[m.id];
    const inst = newInstance(p.id, { fuelL: 20 });
    if (was?.sub.tire && p.rim?.tire) fitSub(inst, 'tire', was.sub.tire);
    fitPart(b, m.id, inst);
  }
  return b;
}

/** the relative change of each figure (after / before − 1; NaN where it means nothing) */
export function changes(before: Figures, after: Figures): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of FIGURES) {
    const a = before[f.key] as number;
    const b = after[f.key] as number;
    out[f.key] = Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) > 1e-6 ? b / a - 1 : Number.isFinite(a) !== Number.isFinite(b) ? Infinity : NaN;
  }
  return out;
}
