/**
 * Materials and the crafting bench (docs/MODCAR.md §14), as Arctic Drive keeps them: scrap, organics and
 * chemicals are plain counts shared by the whole game, not things one carries. The recycler turns things into
 * them — an item's own salvage (items.ts salvageOf), a part's by its kind and grade, a tool's (here) — and an
 * organic more for every half litre of liquid in it; the bench turns them back into things, the whole cost taken
 * when the work starts and its hammer struck once for every 25 it costs (one to three blows). The recipes are
 * Arctic Drive's costs on our things; for now only the plastic scraper is open, the rest of the list is locked.
 * Pure data and maths, no three, no DOM.
 */
import { PART_BLURB } from './blurbs';
import { MATERIAL_IDS, salvageOf, type ItemInstance, type Material } from './items';
import { PALETTE } from './palette';
import { spraySalvage } from './paint';
import { partDef } from './parts';
import { SCRAPERS, type Tool, type ToolKind } from './tools';
import type { Category, PartInstance, Text } from './types';

/** how much of each material there is */
export type Stock = Record<Material, number>;
/** what something costs or gives */
export type Cost = Partial<Record<Material, number>>;

export function newStock(): Stock {
  return { scrap: 0, organics: 0, chemicals: 0 };
}

export function costTotal(c: Cost): number {
  return MATERIAL_IDS.reduce((s, m) => s + (c[m] ?? 0), 0);
}

/** the first material there is too little of, and how much more is needed (null: enough of everything) */
export function shortOf(s: Stock, c: Cost): { mat: Material; n: number } | null {
  for (const m of MATERIAL_IDS) {
    const need = (c[m] ?? 0) - (s[m] ?? 0);
    if (need > 0) return { mat: m, n: need };
  }
  return null;
}

export function canAfford(s: Stock, c: Cost): boolean {
  return shortOf(s, c) === null;
}

/** take the whole cost (true), or nothing when there is not enough (false) */
export function spend(s: Stock, c: Cost): boolean {
  if (!canAfford(s, c)) return false;
  for (const m of MATERIAL_IDS) s[m] = (s[m] ?? 0) - (c[m] ?? 0);
  return true;
}

export function addTo(s: Stock, c: Cost): void {
  for (const m of MATERIAL_IDS) s[m] = (s[m] ?? 0) + (c[m] ?? 0);
}

/** the bench's hammer: one blow for every 25 a thing costs, one to three */
export function hits(c: Cost): number {
  return Math.max(1, Math.min(3, Math.ceil(costTotal(c) / 25)));
}

function plus(a: Cost, b: Cost): Cost {
  const out: Cost = { ...a };
  for (const m of MATERIAL_IDS) if (b[m]) out[m] = (out[m] ?? 0) + (b[m] ?? 0);
  return out;
}

/** an organic for every half litre of liquid (Arctic Drive's: whatever the liquid) */
function liquidSalvage(litres: number): Cost {
  const n = Math.floor(Math.max(0, litres) / 0.5 + 1e-9);
  return n > 0 ? { organics: n } : {};
}

// ------------------------------------------------------------------ what the recycler gives

/**
 * Scrap for a part by its kind, at grades 1 to 5 (Arctic Drive's parts: an old engine 20, the best 150 to
 * 230; a door, a bonnet 2 to 5; a seat 2 to 12; a wheel 6 to 40, here shared between the rim and its tyre).
 */
const PART_SCRAP: Record<Category, readonly [number, number, number, number, number]> = {
  engine: [20, 40, 65, 110, 180],
  gearbox: [10, 18, 28, 40, 60],
  radiator: [3, 5, 8, 10, 14],
  battery: [3, 5, 7, 9, 12],
  fuelTank: [3, 5, 7, 10, 14],
  exhaust: [3, 5, 8, 12, 16],
  turbo: [10, 20, 35, 60, 90],
  rim: [3, 5, 8, 12, 18],
  tire: [3, 5, 10, 20, 30],
  suspension: [3, 5, 8, 12, 16],
  brakes: [2, 4, 6, 9, 12],
  diff: [6, 10, 15, 22, 30],
  steering: [2, 2, 3, 5, 6],
  seat: [2, 3, 4, 6, 12],
  door: [2, 3, 4, 5, 6],
  hood: [2, 3, 4, 5, 6],
  trunk: [2, 3, 3, 4, 5],
  bumperFront: [2, 3, 4, 6, 8],
  bumperRear: [2, 3, 4, 6, 8],
  headlight: [1, 2, 2, 3, 4],
  taillight: [1, 1, 2, 2, 3],
  mirror: [1, 2, 2, 3, 4],
  roof: [3, 5, 7, 10, 14],
  armor: [4, 6, 9, 12, 16],
  horn: [1, 2, 3, 4, 5],
  radio: [3, 5, 8, 12, 16],
  handbrake: [1, 2, 2, 3, 4],
  gearLever: [1, 2, 2, 3, 4],
  ignition: [1, 2, 3, 4, 5],
};

/** a part's grade (its card's stars), 1 at least */
export function partStars(id: string): number {
  return Math.max(1, Math.min(5, PART_BLURB[id]?.stars ?? 2));
}

/** what the recycler gives for a part: its own scrap, what is on it (a wheel's tyre, an engine's turbo), the liquids in it */
export function partSalvage(inst: PartInstance): Cost {
  const d = partDef(inst.part);
  let out: Cost = { scrap: PART_SCRAP[d.cat][partStars(inst.part) - 1] };
  for (const sub of Object.values(inst.sub ?? {})) out = plus(out, partSalvage(sub));
  const f = inst.fluids ?? {};
  const fuel = Object.values(f.fuel ?? {}).reduce((a, b) => a + (b ?? 0), 0);
  return plus(out, liquidSalvage(fuel + (f.oilL ?? 0) + (f.coolantL ?? 0)));
}

/** the tools' own scrap (Arctic Drive's: a jerrycan 3, a spray can 1 or 5 by its size and colour, the scrapers 3, 7 and 10) */
const TOOL_SALVAGE: Record<ToolKind, Cost> = {
  jerrycan: { scrap: 3 },
  bottle: { scrap: 1 },
  oilcan: { scrap: 2 },
  spray: { scrap: 1 },
  sponge: { organics: 2 },
  scraper: { scrap: 3 },
  brush: { scrap: 2, organics: 1 },
};

/** what the recycler gives for a tool: its own, and the liquid in it */
export function toolSalvage(t: Tool): Cost {
  const own = t.kind === 'scraper' ? SCRAPERS[t.tier ?? 1].salvage : t.kind === 'spray' ? { scrap: spraySalvage(t) } : TOOL_SALVAGE[t.kind];
  const liquid = t.kind === 'jerrycan' || t.kind === 'bottle' || t.kind === 'oilcan' ? (t.litres ?? 0) : 0;
  return plus(own, liquidSalvage(liquid));
}

/** what the recycler gives for an item (items.ts: its own, and its liquid) */
export function itemSalvage(inst: ItemInstance): Cost {
  return salvageOf(inst);
}

// ------------------------------------------------------------------ the bench's recipes

export type RecipeCat = 'tools' | 'paint' | 'vehicle' | 'clothing' | 'supplies';

export const RECIPE_CATS: Record<RecipeCat, Text> = {
  tools: { zh: '工具', en: 'Tools' },
  paint: { zh: '喷漆', en: 'Spray paint' },
  vehicle: { zh: '零件', en: 'Vehicle parts' },
  clothing: { zh: '衣物', en: 'Clothing' },
  supplies: { zh: '吃喝药', en: 'Food and medicine' },
};

/** what a recipe makes */
export type Makes =
  | { kind: 'tool'; tool: ToolKind; tier?: 1 | 2 | 3; fuel?: 'petrol' | 'diesel'; colour?: number }
  | { kind: 'part'; part: string; tire?: string }
  | { kind: 'item'; item: string };

export interface Recipe {
  readonly id: string;
  readonly cat: RecipeCat;
  /** Arctic Drive's tier (1-6): how far down the list it is */
  readonly tier: number;
  readonly makes: Makes;
  readonly cost: Cost;
  /** open from the start (the others are locked for now: blueprints come later) */
  readonly open?: boolean;
}

const R = (id: string, cat: RecipeCat, tier: number, makes: Makes, cost: Cost, open = false): Recipe => ({ id, cat, tier, makes, cost, ...(open ? { open } : {}) });

/** every recipe, in the bench's order (Arctic Drive's costs) */
export const RECIPES: readonly Recipe[] = [
  // tools
  R('scraper_1', 'tools', 1, { kind: 'tool', tool: 'scraper', tier: 1 }, { scrap: 70 }, true),
  R('scraper_2', 'tools', 3, { kind: 'tool', tool: 'scraper', tier: 2 }, { scrap: 200 }),
  R('scraper_3', 'tools', 5, { kind: 'tool', tool: 'scraper', tier: 3 }, { scrap: 450 }),
  R('jerrycan', 'tools', 3, { kind: 'tool', tool: 'jerrycan', fuel: 'petrol' }, { scrap: 75 }),
  R('lamp_old', 'tools', 1, { kind: 'item', item: 'lamp_old' }, { scrap: 40 }),
  R('repair_1', 'tools', 1, { kind: 'item', item: 'repair_1' }, { scrap: 70 }),
  R('repair_2', 'tools', 4, { kind: 'item', item: 'repair_2' }, { scrap: 250 }),
  R('hammer_1', 'tools', 1, { kind: 'item', item: 'hammer_1' }, { scrap: 70 }),
  R('hammer_2', 'tools', 3, { kind: 'item', item: 'hammer_2' }, { scrap: 240 }),
  R('flare_gun', 'tools', 6, { kind: 'item', item: 'flare_gun' }, { scrap: 300 }),
  // spray paint: a medium can in every colour, made full (Arctic Drive's 27 recipes, 20 organics and 10 scrap each)
  ...PALETTE.map((_, i) => R(`spray_${i}`, 'paint', 2, { kind: 'tool', tool: 'spray', tier: 2, colour: i }, { organics: 20, scrap: 10 })),
  // vehicle parts
  R('steer_std', 'vehicle', 1, { kind: 'part', part: 'steer_std' }, { scrap: 20 }),
  R('wheel_road', 'vehicle', 1, { kind: 'part', part: 'rim_steel13', tire: 'tire_road' }, { scrap: 80 }),
  R('bat_std', 'vehicle', 1, { kind: 'part', part: 'bat_std' }, { scrap: 40 }),
  R('rad_std', 'vehicle', 1, { kind: 'part', part: 'rad_std' }, { scrap: 80 }),
  R('mir_stock', 'vehicle', 1, { kind: 'part', part: 'mir_stock' }, { scrap: 20 }),
  R('seat_bucket', 'vehicle', 1, { kind: 'part', part: 'seat_bucket' }, { scrap: 50 }),
  R('door_stock', 'vehicle', 1, { kind: 'part', part: 'door_stock' }, { scrap: 50 }),
  R('hood_stock', 'vehicle', 1, { kind: 'part', part: 'hood_stock' }, { scrap: 50 }),
  R('bf_ram', 'vehicle', 1, { kind: 'part', part: 'bf_ram' }, { scrap: 80 }),
  R('eng_i4', 'vehicle', 1, { kind: 'part', part: 'eng_i4' }, { scrap: 160 }),
  R('horn_trumpet', 'vehicle', 1, { kind: 'part', part: 'horn_trumpet' }, { scrap: 180 }),
  R('turbo_small', 'vehicle', 1, { kind: 'part', part: 'turbo_small' }, { scrap: 300 }),
  R('tank_big', 'vehicle', 1, { kind: 'part', part: 'tank_big' }, { scrap: 300 }),
  // clothing
  R('wear_beanie', 'clothing', 2, { kind: 'item', item: 'wear_beanie' }, { scrap: 100 }),
  R('wear_jacket', 'clothing', 1, { kind: 'item', item: 'wear_jacket' }, { scrap: 100 }),
  R('wear_pants', 'clothing', 1, { kind: 'item', item: 'wear_pants' }, { scrap: 100 }),
  R('wear_shoes', 'clothing', 1, { kind: 'item', item: 'wear_shoes' }, { scrap: 100 }),
  R('wear_gloves', 'clothing', 1, { kind: 'item', item: 'wear_gloves' }, { scrap: 135 }),
  R('pack_old', 'clothing', 1, { kind: 'item', item: 'pack_old' }, { scrap: 100 }),
  R('pack_std', 'clothing', 3, { kind: 'item', item: 'pack_std' }, { scrap: 250 }),
  R('pack_hike', 'clothing', 4, { kind: 'item', item: 'pack_hike' }, { scrap: 350 }),
  // food and medicine
  R('drink_soda', 'supplies', 1, { kind: 'item', item: 'drink_soda' }, { organics: 20 }),
  R('food_chips', 'supplies', 1, { kind: 'item', item: 'food_chips' }, { organics: 20 }),
  R('drink_water', 'supplies', 4, { kind: 'item', item: 'drink_water' }, { organics: 40 }),
  R('med_pain_1', 'supplies', 1, { kind: 'item', item: 'med_pain_1' }, { organics: 30 }),
  R('med_warm_1', 'supplies', 1, { kind: 'item', item: 'med_warm_1' }, { organics: 45 }),
  R('med_kit_1', 'supplies', 1, { kind: 'item', item: 'med_kit_1' }, { organics: 45 }),
];

const RECIPE_BY_ID = new Map(RECIPES.map((r) => [r.id, r]));

export function recipeDef(id: string): Recipe {
  const r = RECIPE_BY_ID.get(id);
  if (!r) throw new Error(`no recipe ${id}`);
  return r;
}

/** can it be made at all now (open from the start, or unlocked since) */
export function recipeOpen(r: Recipe, unlocked: ReadonlySet<string> = new Set()): boolean {
  return !!r.open || unlocked.has(r.id);
}
