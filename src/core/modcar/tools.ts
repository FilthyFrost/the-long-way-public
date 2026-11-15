/**
 * The things one works on a vehicle with (docs/MODCAR.md §5.3): a jerrycan of petrol or diesel, a
 * bottle of water for the radiator, a can of oil, a spray can, a sponge — and what each does when it
 * is held up to the right place and the button is held.
 */
import { frameDef } from './frames';
import { partDef } from './parts';
import { PALETTE } from './palette';
import type { Build, FuelType, PartInstance, Text } from './types';

export type ToolKind = 'jerrycan' | 'bottle' | 'oilcan' | 'spray' | 'sponge';

export interface Tool {
  uid: string;
  kind: ToolKind;
  /** jerrycans: what is in it */
  fuel?: FuelType;
  litres?: number;
  /** spray cans: palette index */
  colour?: number;
}

export const TOOL_INFO: Record<ToolKind, { name: Text; capacity: number; rate: number }> = {
  jerrycan: { name: { zh: '油桶', en: 'Jerrycan' }, capacity: 20, rate: 2 },
  bottle: { name: { zh: '水壶', en: 'Water bottle' }, capacity: 5, rate: 1.2 },
  oilcan: { name: { zh: '机油壶', en: 'Oil can' }, capacity: 4, rate: 0.6 },
  spray: { name: { zh: '喷漆罐', en: 'Spray can' }, capacity: 1, rate: 1 / 1.2 },
  sponge: { name: { zh: '海绵', en: 'Sponge' }, capacity: 1, rate: 1 / 1.6 },
};

const FUEL_NAME: Record<FuelType, Text> = {
  petrol: { zh: '汽油', en: 'petrol' },
  diesel: { zh: '柴油', en: 'diesel' },
  mix2t: { zh: '混合油', en: 'two-stroke mix' },
};

let n = 0;
export function newTool(kind: ToolKind, o: Partial<Tool> = {}): Tool {
  n++;
  return { uid: `t${n.toString(36)}`, kind, litres: o.litres ?? TOOL_INFO[kind].capacity, ...o };
}

export function toolName(t: Tool, lang: 'zh' | 'en' = 'zh'): string {
  const base = TOOL_INFO[t.kind].name[lang];
  if (t.kind === 'jerrycan') return `${base}（${FUEL_NAME[t.fuel ?? 'petrol'][lang]} ${(t.litres ?? 0).toFixed(0)} L）`;
  if (t.kind === 'bottle' || t.kind === 'oilcan') return `${base}（${(t.litres ?? 0).toFixed(1)} L）`;
  if (t.kind === 'spray') return `${base}（${PALETTE[t.colour ?? 0]?.name[lang] ?? ''}）`;
  return base;
}

/** the part instance on the first mount of a category (the tank, the radiator, the engine) */
function instOf(build: Build, cat: string): PartInstance | null {
  const m = frameDef(build.frame).mounts.find((mm) => mm.cat === cat && build.parts[mm.id]);
  return m ? build.parts[m.id] : null;
}

/** what a held tool can do on a vehicle, with the place to do it ('' = nothing) */
export function toolUse(t: Tool, build: Build): { where: 'fuelTank' | 'radiator' | 'engine' | 'any' | ''; word: Text; can: boolean; why?: Text } {
  if (t.kind === 'jerrycan') {
    const tank = instOf(build, 'fuelTank');
    if (!tank) return { where: 'fuelTank', word: { zh: '加油', en: 'Refuel' }, can: false, why: { zh: '没有油箱', en: 'No fuel tank' } };
    const room = partDef(tank.part).fuelTank!.litres - fuelIn(tank);
    if ((t.litres ?? 0) <= 0) return { where: 'fuelTank', word: { zh: '加油', en: 'Refuel' }, can: false, why: { zh: '油桶空了', en: 'The can is empty' } };
    if (room <= 0.05) return { where: 'fuelTank', word: { zh: '加油', en: 'Refuel' }, can: false, why: { zh: '油箱满了', en: 'The tank is full' } };
    return { where: 'fuelTank', word: { zh: `加${FUEL_NAME[t.fuel ?? 'petrol'].zh}`, en: `Pour ${FUEL_NAME[t.fuel ?? 'petrol'].en}` }, can: true };
  }
  if (t.kind === 'bottle') {
    const rad = instOf(build, 'radiator');
    if (!rad) return { where: 'radiator', word: { zh: '加水', en: 'Add water' }, can: false, why: { zh: '没有散热器', en: 'No radiator' } };
    const room = partDef(rad.part).radiator!.coolantL - (rad.fluids.coolantL ?? 0);
    return { where: 'radiator', word: { zh: '加水', en: 'Add water' }, can: room > 0.05 && (t.litres ?? 0) > 0, why: room <= 0.05 ? { zh: '水满了', en: 'Full' } : undefined };
  }
  if (t.kind === 'oilcan') {
    const eng = instOf(build, 'engine');
    const cap = eng ? partDef(eng.part).engine!.oilL : 0;
    if (!eng || cap <= 0) return { where: 'engine', word: { zh: '加机油', en: 'Add oil' }, can: false, why: { zh: eng ? '二冲程机不加机油' : '没有发动机', en: eng ? 'A two-stroke takes no oil' : 'No engine' } };
    const room = cap - (eng.fluids.oilL ?? 0);
    return { where: 'engine', word: { zh: '加机油', en: 'Add oil' }, can: room > 0.05 && (t.litres ?? 0) > 0, why: room <= 0.05 ? { zh: '机油满了', en: 'Full' } : undefined };
  }
  if (t.kind === 'spray') return { where: 'any', word: { zh: '喷漆', en: 'Spray' }, can: true };
  return { where: 'any', word: { zh: '擦洗', en: 'Wash' }, can: true };
}

function fuelIn(tank: PartInstance): number {
  const f = tank.fluids.fuel ?? {};
  return (f.petrol ?? 0) + (f.diesel ?? 0) + (f.mix2t ?? 0);
}

/** pour for dt seconds; returns the litres moved (0 when there is nothing to do) */
export function pour(t: Tool, build: Build, dt: number): number {
  const info = TOOL_INFO[t.kind];
  const want = Math.min(t.litres ?? 0, info.rate * dt);
  if (want <= 0) return 0;
  if (t.kind === 'jerrycan') {
    const tank = instOf(build, 'fuelTank');
    if (!tank) return 0;
    const room = partDef(tank.part).fuelTank!.litres - fuelIn(tank);
    const l = Math.min(want, room);
    if (l <= 0) return 0;
    const f = (tank.fluids.fuel ??= {});
    const k = t.fuel ?? 'petrol';
    f[k] = (f[k] ?? 0) + l;
    t.litres = (t.litres ?? 0) - l;
    return l;
  }
  if (t.kind === 'bottle') {
    const rad = instOf(build, 'radiator');
    if (!rad) return 0;
    const room = partDef(rad.part).radiator!.coolantL - (rad.fluids.coolantL ?? 0);
    const l = Math.min(want, room);
    if (l <= 0) return 0;
    rad.fluids.coolantL = (rad.fluids.coolantL ?? 0) + l;
    t.litres = (t.litres ?? 0) - l;
    return l;
  }
  if (t.kind === 'oilcan') {
    const eng = instOf(build, 'engine');
    if (!eng) return 0;
    const cap = partDef(eng.part).engine!.oilL;
    const l = Math.min(want, cap - (eng.fluids.oilL ?? 0));
    if (l <= 0) return 0;
    eng.fluids.oilL = (eng.fluids.oilL ?? 0) + l;
    t.litres = (t.litres ?? 0) - l;
    return l;
  }
  return 0;
}

/**
 * Spray or wash a part (or the frame itself when `inst` is null) for dt seconds: paint creeps over
 * in 1.2 s, dirt comes off in 1.6 s. Returns how far along it is (0…1) for the progress ring.
 */
export function workSurface(t: Tool, build: Build, inst: PartInstance | null, dt: number, progress: number): number {
  const k = TOOL_INFO[t.kind].rate * dt;
  const p = Math.min(1, progress + k);
  if (t.kind === 'spray' && p >= 1) {
    const c = t.colour ?? 0;
    if (inst) inst.paint = c;
    else build.paint = c;
  }
  if (t.kind === 'sponge') {
    if (inst) {
      inst.dirt = Math.max(0, inst.dirt - k * 1.2);
      inst.rust = Math.max(0, inst.rust - k * 0.15);
    } else build.dirt = Math.max(0, build.dirt - k * 1.2);
  }
  return p;
}
