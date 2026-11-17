/**
 * The things one works on a vehicle with (docs/MODCAR.md §5.3): a jerrycan of petrol or diesel, a
 * bottle of water for the radiator, a can of oil, a spray can (one colour, three sizes, so much paint in it:
 * paint.ts, §16), a sponge, a cleaning scraper (made at the bench, §14), a wire brush — and what each does
 * when it is held up to the right place and the button is held.
 * A tank that is not a vehicle's (the generator's) takes a can's fuel the same way (FuelTank). The sponge, the
 * scrapers and the brush clean (CLEANERS, §15): each pass over a surface takes off so much of the dirt, the
 * crust and the rust, in a band as wide as the tool, and wears the tool down by the area it went over.
 */
import { frameDef } from './frames';
import { partDef } from './parts';
import { PALETTE } from './palette';
import { SPRAY_TIERS, sprayLeft, sprayTier } from './paint';
import type { Build, FuelType, PartInstance, Text } from './types';

export type ToolKind = 'jerrycan' | 'bottle' | 'oilcan' | 'spray' | 'sponge' | 'scraper' | 'brush';

/** what goes in where: fuel into the tank, water into the radiator, oil into the engine */
export type LiquidKind = 'fuel' | 'water' | 'oil';

/** the liquid a tool carries (null: a spray can, a sponge) */
export function liquidOf(t: Tool): LiquidKind | null {
  return t.kind === 'jerrycan' ? 'fuel' : t.kind === 'bottle' ? 'water' : t.kind === 'oilcan' ? 'oil' : null;
}

export interface Tool {
  uid: string;
  kind: ToolKind;
  /** jerrycans: what is in it */
  fuel?: FuelType;
  litres?: number;
  /** spray cans: palette index */
  colour?: number;
  /** scrapers: which (1 plastic, 2 metal, 3 gold); spray cans: the size (1 small, 2 medium, 3 large) */
  tier?: 1 | 2 | 3;
  /** spray cans: units of paint left (paint.ts SPRAY_TIERS; without it, full) */
  paint?: number;
  /** the sponge, the scrapers, the brush: how much of it is left (1 new … 0 worn out) */
  life?: number;
}

/**
 * The cleaning scrapers (Arctic Drive's ice scrapers, at its costs): a blade 10, 22 or 25 cm wide — the wider,
 * the quicker the work; their models, grades and what the recycler gives for them.
 */
export const SCRAPERS: Record<1 | 2 | 3, { model: string; name: Text; width: number; stars: number; salvage: { scrap: number } }> = {
  1: { model: 'scraper_plastic', name: { zh: '塑料清理铲', en: 'Plastic scraper' }, width: 0.1, stars: 1, salvage: { scrap: 3 } },
  2: { model: 'scraper_metal', name: { zh: '金属清理铲', en: 'Metal scraper' }, width: 0.22, stars: 3, salvage: { scrap: 7 } },
  3: { model: 'scraper_gold', name: { zh: '金色清理铲', en: 'Golden scraper' }, width: 0.25, stars: 5, salvage: { scrap: 10 } },
};

/** the model a tool is drawn with (public/models/modcar/tools/<id>.glb): its kind, a scraper's or a spray can's by its tier */
export function toolModelId(t: Pick<Tool, 'kind' | 'tier'>): string {
  if (t.kind === 'scraper') return SCRAPERS[t.tier ?? 1].model;
  return t.kind === 'spray' ? SPRAY_TIERS[sprayTier(t)].model : t.kind;
}

export const TOOL_INFO: Record<ToolKind, { name: Text; capacity: number; rate: number }> = {
  jerrycan: { name: { zh: '油桶', en: 'Jerrycan' }, capacity: 20, rate: 2 },
  bottle: { name: { zh: '水壶', en: 'Water bottle' }, capacity: 5, rate: 1.2 },
  oilcan: { name: { zh: '机油壶', en: 'Oil can' }, capacity: 4, rate: 0.6 },
  spray: { name: { zh: '喷漆罐', en: 'Spray can' }, capacity: 1, rate: 1 / 1.2 },
  sponge: { name: { zh: '海绵', en: 'Sponge' }, capacity: 1, rate: 1 / 1.6 },
  scraper: { name: { zh: '清理铲', en: 'Scraper' }, capacity: 1, rate: 1 },
  brush: { name: { zh: '钢丝刷', en: 'Wire brush' }, capacity: 1, rate: 1 },
};

/**
 * How each cleaning tool works (docs/MODCAR.md §15): the band it cleans (m), what one pass takes off of the
 * dirt (dust, mud), the crust (caked grime, scale) and the rust (the amounts the parts carry, 0…1), how far off
 * the surface it still reaches (m: a pane's two faces, a panel's curve under a straight blade), how wet it
 * leaves it, and how many square metres of passes it lasts. The sponge takes the dirt in one pass and leaves a
 * wet trail; the scrapers (Arctic Drive's ice scrapers, 10 / 22 / 25 cm) the crust in two or three, the dirt
 * on the way; the brush the rust in three. A part of a car is about 1 m²; a whole car's outside about 12.
 */
export interface Cleaner {
  width: number;
  take: [number, number, number];
  depth: number;
  wet: number;
  /** m² of passes it lasts */
  lasts: number;
  /** what the button does, in words */
  word: Text;
}

export const CLEANERS: Record<'sponge' | 'brush' | 'scraper_1' | 'scraper_2' | 'scraper_3', Cleaner> = {
  sponge: { width: 0.14, take: [0.85, 0.05, 0], depth: 0.03, wet: 1, lasts: 24, word: { zh: '擦洗', en: 'Scrub' } },
  scraper_1: { width: SCRAPERS[1].width, take: [0.6, 0.3, 0.03], depth: 0.025, wet: 0, lasts: 60, word: { zh: '刮', en: 'Scrape' } },
  scraper_2: { width: SCRAPERS[2].width, take: [0.6, 0.34, 0.04], depth: 0.025, wet: 0, lasts: 140, word: { zh: '刮', en: 'Scrape' } },
  scraper_3: { width: SCRAPERS[3].width, take: [0.65, 0.4, 0.05], depth: 0.025, wet: 0, lasts: 320, word: { zh: '刮', en: 'Scrape' } },
  brush: { width: 0.11, take: [0.3, 0.2, 0.34], depth: 0.03, wet: 0, lasts: 40, word: { zh: '刷锈', en: 'Brush off rust' } },
};

/** a cleaning tool's way of working, or null (not one) */
export function cleanerOf(t: Pick<Tool, 'kind' | 'tier'>): Cleaner | null {
  if (t.kind === 'sponge') return CLEANERS.sponge;
  if (t.kind === 'brush') return CLEANERS.brush;
  if (t.kind === 'scraper') return CLEANERS[`scraper_${t.tier ?? 1}` as 'scraper_1'];
  return null;
}

/** the tool worn by a stroke over `area` m² of surface: its life left (0 = worn out) */
export function wearCleaner(t: Tool, area: number): number {
  const c = cleanerOf(t);
  if (!c) return t.life ?? 1;
  t.life = Math.max(0, (t.life ?? 1) - area / c.lasts);
  return t.life;
}

const FUEL_NAME: Record<FuelType, Text> = {
  petrol: { zh: '汽油', en: 'petrol' },
  diesel: { zh: '柴油', en: 'diesel' },
  mix2t: { zh: '混合油', en: 'two-stroke mix' },
};

let n = 0;
export function newTool(kind: ToolKind, o: Partial<Tool> = {}): Tool {
  n++;
  const cleans = kind === 'sponge' || kind === 'scraper' || kind === 'brush';
  // (a spray can: a medium one, cherry red, full, unless said otherwise — a can found lying about is not full: paint.ts sprayFound)
  const spray = kind === 'spray' ? { tier: o.tier ?? 2, colour: o.colour ?? 13, paint: o.paint ?? SPRAY_TIERS[o.tier ?? 2].capacity } : {};
  return { uid: `t${n.toString(36)}`, kind, litres: o.litres ?? TOOL_INFO[kind].capacity, ...(kind === 'scraper' ? { tier: o.tier ?? 1 } : {}), ...spray, ...(cleans ? { life: 1 } : {}), ...o };
}

export function toolName(t: Tool, lang: 'zh' | 'en' = 'zh'): string {
  const base = TOOL_INFO[t.kind].name[lang];
  if (t.kind === 'jerrycan') return `${base}（${FUEL_NAME[t.fuel ?? 'petrol'][lang]} ${(t.litres ?? 0).toFixed(0)} L）`;
  if (t.kind === 'bottle' || t.kind === 'oilcan') return `${base}（${(t.litres ?? 0).toFixed(1)} L）`;
  if (t.kind === 'spray') return `${SPRAY_TIERS[sprayTier(t)].name[lang]}（${PALETTE[t.colour ?? 0]?.name[lang] ?? ''}）`;
  if (t.kind === 'scraper') return SCRAPERS[t.tier ?? 1].name[lang];
  return base;
}

// ------------------------------------------------------------------ a tank of its own (the generator's)

/** a fuel tank that is not a vehicle's: how much it holds, and what is in it */
export interface FuelTank {
  capacity: number;
  fuel: Partial<Record<FuelType, number>>;
}

export function tankLitres(t: FuelTank): number {
  return (t.fuel.petrol ?? 0) + (t.fuel.diesel ?? 0) + (t.fuel.mix2t ?? 0);
}

/** pour a jerrycan into such a tank for dt seconds (litres moved) */
export function pourTank(can: Tool, tank: FuelTank, dt: number): number {
  if (can.kind !== 'jerrycan') return 0;
  const l = Math.min(can.litres ?? 0, TOOL_INFO.jerrycan.rate * dt, tank.capacity - tankLitres(tank));
  if (l <= 0) return 0;
  const k = can.fuel ?? 'petrol';
  tank.fuel[k] = (tank.fuel[k] ?? 0) + l;
  can.litres = (can.litres ?? 0) - l;
  return l;
}

/** draw a tank's fuel back into a jerrycan for dt seconds: an empty can takes the kind there is most of */
export function siphonTank(can: Tool, tank: FuelTank, dt: number): number {
  if (can.kind !== 'jerrycan') return 0;
  const f = tank.fuel;
  if ((can.litres ?? 0) <= 0.01) {
    const most = (['petrol', 'diesel', 'mix2t'] as FuelType[]).reduce((a, k) => ((f[k] ?? 0) > (f[a] ?? 0) ? k : a), 'petrol' as FuelType);
    if ((f[most] ?? 0) > 0) can.fuel = most;
  }
  const k = can.fuel ?? 'petrol';
  const l = Math.min(TOOL_INFO.jerrycan.capacity - (can.litres ?? 0), TOOL_INFO.jerrycan.rate * SIPHON_RATE * dt, f[k] ?? 0);
  if (l <= 0) return 0;
  f[k] = (f[k] ?? 0) - l;
  can.litres = (can.litres ?? 0) + l;
  return l;
}

/** what a jerrycan held to such a tank would do: pour (in) or draw back (out) */
export function tankUse(can: Tool, tank: FuelTank): { in: { can: boolean; why?: Text }; out: { can: boolean; why?: Text } } {
  if (can.kind !== 'jerrycan') return { in: { can: false }, out: { can: false } };
  const room = tank.capacity - tankLitres(tank);
  const pin = (can.litres ?? 0) <= 0.01 ? { can: false, why: { zh: '油桶空了', en: 'The can is empty' } } : room <= 0.05 ? { can: false, why: { zh: '油箱满了', en: 'The tank is full' } } : { can: true };
  const k = (can.litres ?? 0) > 0.01 ? (can.fuel ?? 'petrol') : null;
  const there = k ? (tank.fuel[k] ?? 0) : tankLitres(tank);
  const pout =
    (can.litres ?? 0) >= TOOL_INFO.jerrycan.capacity - 0.02
      ? { can: false, why: { zh: '油桶满了', en: 'The can is full' } }
      : there <= 0.01
        ? { can: false, why: k && tankLitres(tank) > 0.01 ? { zh: `油箱里没有${FUEL_NAME[k].zh}`, en: `No ${FUEL_NAME[k].en} in the tank` } : { zh: '油箱是空的', en: 'The tank is empty' } }
        : { can: true };
  return { in: pin, out: pout };
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
  if (t.kind === 'spray') return sprayLeft(t) > 0 ? { where: 'any', word: { zh: '喷漆', en: 'Spray' }, can: true } : { where: 'any', word: { zh: '喷漆', en: 'Spray' }, can: false, why: { zh: '罐子空了', en: 'The can is empty' } };
  const c = cleanerOf(t);
  if (c && (t.life ?? 1) <= 0) return { where: 'any', word: c.word, can: false, why: { zh: `${TOOL_INFO[t.kind].name.zh}用坏了`, en: 'Worn out' } };
  return { where: 'any', word: c?.word ?? { zh: '擦洗', en: 'Wash' }, can: true };
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

/** the room left in a vehicle's fuel tank (L); null: it has none */
export function tankRoomOf(build: Build): number | null {
  const tank = instOf(build, 'fuelTank');
  if (!tank) return null;
  return Math.max(0, partDef(tank.part).fuelTank!.litres - fuelIn(tank));
}

/** so many litres of a fuel straight into a vehicle's tank (a filling station's pump): what went in */
export function pumpInto(build: Build, fuel: FuelType, litres: number): number {
  const tank = instOf(build, 'fuelTank');
  if (!tank || !(litres > 0)) return 0;
  const l = Math.min(litres, partDef(tank.part).fuelTank!.litres - fuelIn(tank));
  if (l <= 0) return 0;
  const f = (tank.fluids.fuel ??= {});
  f[fuel] = (f[fuel] ?? 0) + l;
  return l;
}

/** how fast liquid is drawn back out into a can (a share of how fast it pours) */
export const SIPHON_RATE = 0.7;

/** what drawing liquid back out of a vehicle into the held can would do */
export function siphonUse(t: Tool, build: Build): { can: boolean; why?: Text } {
  const info = TOOL_INFO[t.kind];
  if ((t.litres ?? 0) >= info.capacity - 0.02) return { can: false, why: { zh: `${info.name.zh}满了`, en: 'Full' } };
  if (t.kind === 'jerrycan') {
    const tank = instOf(build, 'fuelTank');
    const f = tank?.fluids.fuel ?? {};
    const k = (t.litres ?? 0) > 0.01 ? (t.fuel ?? 'petrol') : null;
    const there = k ? (f[k] ?? 0) : fuelIn(tank ?? ({ fluids: {} } as PartInstance));
    if (there <= 0.01) return { can: false, why: k && fuelIn(tank ?? ({ fluids: {} } as PartInstance)) > 0.01 ? { zh: `油箱里没有${FUEL_NAME[k].zh}`, en: `No ${FUEL_NAME[k].en} in the tank` } : { zh: '油箱是空的', en: 'The tank is empty' } };
    return { can: true };
  }
  if (t.kind === 'bottle') return (instOf(build, 'radiator')?.fluids.coolantL ?? 0) > 0.01 ? { can: true } : { can: false, why: { zh: '散热器里没有水', en: 'No water in the radiator' } };
  if (t.kind === 'oilcan') return (instOf(build, 'engine')?.fluids.oilL ?? 0) > 0.01 ? { can: true } : { can: false, why: { zh: '发动机里没有机油', en: 'No oil in the engine' } };
  return { can: false };
}

/**
 * Draw liquid back out of a vehicle into the held can for dt seconds (a siphon): fuel out of the tank — an
 * empty can takes the kind there is most of, a can with some in it only its own kind — water out of the
 * radiator, oil out of the engine. Returns the litres moved.
 */
export function siphon(t: Tool, build: Build, dt: number): number {
  const info = TOOL_INFO[t.kind];
  const want = Math.min(info.capacity - (t.litres ?? 0), info.rate * SIPHON_RATE * dt);
  if (want <= 0) return 0;
  if (t.kind === 'jerrycan') {
    const f = instOf(build, 'fuelTank')?.fluids.fuel;
    if (!f) return 0;
    if ((t.litres ?? 0) <= 0.01) {
      const most = (['petrol', 'diesel', 'mix2t'] as FuelType[]).reduce((a, k) => ((f[k] ?? 0) > (f[a] ?? 0) ? k : a), 'petrol' as FuelType);
      if ((f[most] ?? 0) > 0) t.fuel = most;
    }
    const k = t.fuel ?? 'petrol';
    const l = Math.min(want, f[k] ?? 0);
    if (l <= 0) return 0;
    f[k] = (f[k] ?? 0) - l;
    t.litres = (t.litres ?? 0) + l;
    return l;
  }
  const inst = instOf(build, t.kind === 'bottle' ? 'radiator' : t.kind === 'oilcan' ? 'engine' : '');
  if (!inst) return 0;
  const key = t.kind === 'bottle' ? 'coolantL' : 'oilL';
  const l = Math.min(want, inst.fluids[key] ?? 0);
  if (l <= 0) return 0;
  inst.fluids[key] = (inst.fluids[key] ?? 0) - l;
  t.litres = (t.litres ?? 0) + l;
  return l;
}

