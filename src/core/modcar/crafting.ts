/**
 * Materials and the crafting bench (docs/MODCAR.md §14, docs/V3/plan/finish.md §六): scrap and components are plain
 * counts shared by the whole game, not things one carries. The recycler turns things into them — an item's own
 * salvage (items.ts salvageOf), a part's by its kind and grade, a tool's (here); a liquid in a thing gives nothing
 * more. The bench turns them back into things: the whole cost taken when the work starts and its hammer struck once
 * for every 25 it costs (one to three blows).
 *
 * What the bench makes is what one has learnt to (§六 2): the plastic scraper from the start; everything else from its
 * blueprint — a sheet found down the road, learnt with the right button (it is used up, and the making is known for
 * good), each in the chapter of the journey it belongs to. The roof rack, the ladder and the motorcycle rack are made
 * so too: parts, fitted as any part is.
 * Pure data and maths, no three, no DOM.
 */
import { PART_BLURB } from './blurbs';
import { MATERIAL_IDS, salvageOf, type ItemInstance, type Material } from './items';
import { spraySalvage } from './paint';
import { partDef } from './parts';
import { SCRAPERS, type Tool, type ToolKind } from './tools';
import type { Category, PartInstance, Text } from './types';

/** how much of each material there is */
export type Stock = Record<Material, number>;
/** what something costs or gives */
export type Cost = Partial<Record<Material, number>>;

export function newStock(): Stock {
  return { scrap: 0, components: 0 };
}

/**
 * The materials of a game kept before there were two (three: scrap, organics, chemicals): its chemicals are its
 * components, one for one; its organics are gone.
 */
export function stockOf(kept: Partial<Record<string, number>> | null | undefined): Stock {
  const n = (v: number | undefined): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  return { scrap: n(kept?.scrap), components: n(kept?.components) + n(kept?.chemicals) };
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
  hitch: [2, 3, 4, 6, 8],
  ladder: [2, 3, 4, 5, 7],
  houseBattery: [4, 6, 8, 11, 14],
};

/**
 * Components for a part, of the kinds that have a motor or a board in them, at grades 1 to 5 (docs/V3/plan/finish.md
 * §六 1's table: an engine 2 to 16, a gearbox 1 to 7, a turbo 2 to 12); the other kinds give none.
 */
const PART_COMPONENTS: Partial<Record<Category, readonly [number, number, number, number, number]>> = {
  engine: [2, 4, 7, 11, 16],
  gearbox: [1, 2, 3, 5, 7],
  turbo: [2, 4, 6, 9, 12],
  battery: [1, 1, 2, 2, 3],
  radio: [2, 3, 3, 4, 4],
  houseBattery: [2, 3, 4, 5, 6],
};
/** …and of a part by itself (a solar panel is a roof's part: a roof gives none) */
const PART_COMPONENTS_OWN: Readonly<Record<string, number>> = { roof_solar: 5 };

/** a part's grade (its card's stars), 1 at least */
export function partStars(id: string): number {
  return Math.max(1, Math.min(5, PART_BLURB[id]?.stars ?? 2));
}

/** what the recycler gives for a part: its own scrap and components, and what is on it (a wheel's tyre, an engine's turbo); the liquids in it give nothing */
export function partSalvage(inst: PartInstance): Cost {
  const d = partDef(inst.part);
  const stars = partStars(inst.part);
  let out: Cost = { scrap: PART_SCRAP[d.cat][stars - 1] };
  const comp = PART_COMPONENTS_OWN[inst.part] ?? PART_COMPONENTS[d.cat]?.[stars - 1] ?? 0;
  if (comp > 0) out.components = comp;
  for (const sub of Object.values(inst.sub ?? {})) out = plus(out, partSalvage(sub));
  return out;
}

/** the tools' own scrap (Arctic Drive's: a jerrycan 3, a spray can 1 or 5 by its size and colour, the scrapers 3, 7 and 10) */
const TOOL_SALVAGE: Record<ToolKind, Cost> = {
  jerrycan: { scrap: 3 },
  bottle: { scrap: 1 },
  oilcan: { scrap: 2 },
  spray: { scrap: 1 },
  sponge: { scrap: 1 },
  scraper: { scrap: 3 },
  brush: { scrap: 2 },
};

/** what the recycler gives for a tool: its own (what is in it gives nothing) */
export function toolSalvage(t: Tool): Cost {
  return { ...(t.kind === 'scraper' ? SCRAPERS[t.tier ?? 1].salvage : t.kind === 'spray' ? { scrap: spraySalvage(t) } : TOOL_SALVAGE[t.kind]) };
}

/** what the recycler gives for an item (items.ts: its own, and its liquid) */
export function itemSalvage(inst: ItemInstance): Cost {
  return salvageOf(inst);
}

// ------------------------------------------------------------------ the bench's recipes

/** what a recipe makes */
export type Makes =
  | { kind: 'tool'; tool: ToolKind; tier?: 1 | 2 | 3; fuel?: 'petrol' | 'diesel'; colour?: number }
  | { kind: 'part'; part: string; tire?: string }
  | { kind: 'item'; item: string };

export interface Recipe {
  readonly id: string;
  /** what it makes, in a word (its blueprint is called by it) */
  readonly name: Text;
  /** the chapter of the journey its blueprint is first found in (docs/V3/plan/finish.md §二 1, §六 2); 0: known from the start */
  readonly chapter: number;
  readonly makes: Makes;
  readonly cost: Cost;
  /** known from the start: no blueprint */
  readonly open?: boolean;
  /** its blueprint is not among those found down the road (a lake's master has it) */
  readonly rare?: boolean;
}

/** where each chapter of the journey begins (km: docs/V3/plan/finish.md §二 1) — chapter 1 the first 12 km, 2 to 30, 3 to 50, 4 to 75, 5 to 105, 6 to 140, 7 to 190, 8 from there */
export const CHAPTER_KM: readonly number[] = [0, 0, 12, 30, 50, 75, 105, 140, 190];

/** the chapter one is in so far down the road (1 … 8) */
export function chapterAt(km: number): number {
  let c = 1;
  for (let i = 2; i < CHAPTER_KM.length; i++) if (km >= CHAPTER_KM[i]) c = i;
  return c;
}

const R = (id: string, zh: string, en: string, chapter: number, makes: Makes, cost: Cost, o: { open?: boolean; rare?: boolean } = {}): Recipe => ({ id, name: { zh, en }, chapter, makes, cost, ...o });
const item = (id: string): Makes => ({ kind: 'item', item: id });
const part = (id: string): Makes => ({ kind: 'part', part: id });

/**
 * Every recipe, in the order their blueprints come down the road (docs/V3/plan/finish.md §六 2's table; the amounts
 * are where it starts from). What the table names that the game has not got yet (the planter, the rain barrel, the
 * grill, the pegboard and the cupboard, the bench for a vehicle, the two-burner stove) comes in with the thing itself.
 */
export const RECIPES: readonly Recipe[] = [
  // known from the start
  R('scraper_1', '塑料铲', 'Plastic scraper', 0, { kind: 'tool', tool: 'scraper', tier: 1 }, { scrap: 50 }, { open: true }),
  // 2 — a bigger vehicle, 12–30 km: the recycler and the bench come into their own
  R('crowbar', '撬棍', 'Crowbar', 2, item('nd_crowbar'), { scrap: 40 }),
  R('jerrycan', '油桶', 'Jerrycan', 2, { kind: 'tool', tool: 'jerrycan', fuel: 'petrol' }, { scrap: 60 }),
  R('tire_kit', '轮胎修理包', 'Tyre repair kit', 2, item('nd_tire_kit'), { scrap: 35 }),
  R('roof_rack', '车顶行李架', 'Roof rack', 2, part('roof_rack'), { scrap: 70 }),
  R('flashlight', '手电筒', 'Flashlight', 2, item('nd_flashlight'), { scrap: 30, components: 2 }),
  // 3 — coffee and the first meal, 30–50 km
  R('engine_kit', '引擎修理包', 'Engine repair kit', 3, item('nd_engine_kit'), { scrap: 60, components: 3 }),
  R('charger', '电瓶充电器', 'Battery charger', 3, item('nd_charger'), { scrap: 40, components: 4 }),
  R('ladder', '梯子', 'Ladder', 3, part('ladder'), { scrap: 45 }),
  R('moto_rack', '摩托车架', 'Motorcycle rack', 3, part('moto_rack'), { scrap: 80 }),
  // (parts to get one home on: a plain wheel, a battery, a radiator)
  R('wheel_road', '普通车轮', 'Plain wheel', 3, { kind: 'part', part: 'rim_steel13', tire: 'tire_road' }, { scrap: 80 }),
  R('bat_std', '电瓶', 'Car battery', 3, part('bat_std'), { scrap: 40 }),
  R('rad_std', '水箱', 'Radiator', 3, part('rad_std'), { scrap: 60 }),
  // 4 — the garden, 50–75 km
  R('cot', '折叠床', 'Folding cot', 4, item('nd_cot'), { scrap: 70 }),
  R('battery', '电池', 'Battery cell', 4, item('nd_battery'), { scrap: 20, components: 2 }),
  // 5 — fishing, 75–105 km
  R('shovel', '铁锹', 'Shovel', 5, item('nd_shovel'), { scrap: 50 }),
  R('creel', '鱼篓', 'Creel', 5, item('fishing_creel'), { scrap: 30 }),
  R('spoon', '亮片', 'Spoon lure', 5, item('bait_spoon'), { scrap: 15 }),
  R('hitch_ball', '挂钩', 'Tow hitch', 5, part('hitch_ball'), { scrap: 40 }),
  // 6 — a home, 105–140 km
  R('rod_swift', '「飞燕」碳素竿', 'Swift carbon rod', 6, item('rod_swift'), { scrap: 120, components: 6 }),
  R('grinder', '打磨机', 'Grinder', 6, item('nd_grinder'), { scrap: 90, components: 8 }),
  R('polisher', '抛光机', 'Polisher', 6, item('nd_polisher'), { scrap: 90, components: 8 }),
  R('wall_shelf', '壁挂置物架', 'Wall shelf', 6, item('nd_wall_shelf'), { scrap: 40 }),
  // 7 — craft, 140–190 km
  R('metal_detector', '金属探测器', 'Metal detector', 7, item('nd_metal_detector'), { scrap: 110, components: 12 }),
  R('rod_pro', '「镜心」专业竿', 'Mirrorheart pro rod', 7, item('rod_pro'), { scrap: 220, components: 14 }),
  R('bat_house', '生活电瓶', 'House battery', 7, part('bat_house'), { scrap: 80, components: 10 }),
  R('roof_solar', '太阳能板', 'Solar panel', 7, part('roof_solar'), { scrap: 120, components: 15 }),
  // 8 — far away, from 190 km
  R('rod_sea', '「镇海」海竿', 'Sea Anchor boat rod', 8, item('rod_sea'), { scrap: 350, components: 24 }),
  // (the night rod's sheet is in the chest the third lake's master gives up)
  R('rod_heron', '「夜鹭」夜钓竿', 'Night Heron rod', 8, item('rod_heron'), { scrap: 280, components: 20 }, { rare: true }),
];

const RECIPE_BY_ID = new Map(RECIPES.map((r) => [r.id, r]));

export function recipeDef(id: string): Recipe {
  const r = RECIPE_BY_ID.get(id);
  if (!r) throw new Error(`no recipe ${id}`);
  return r;
}

/** can it be made at all now: known from the start, or learnt from its blueprint since */
export function recipeOpen(r: Recipe, learned: ReadonlySet<string> = new Set()): boolean {
  return !!r.open || learned.has(r.id);
}

// ------------------------------------------------------------------ blueprints

/** the item a recipe's blueprint is (docs/V3/plan/finish.md §六 2): a sheet, learnt with the right button and used up */
export function blueprintOf(recipe: string): string {
  return `bp_${recipe}`;
}

/** the recipe a blueprint teaches, or null for a thing that is no blueprint */
export function recipeOfBlueprint(item: string): Recipe | null {
  return item.startsWith('bp_') ? (RECIPE_BY_ID.get(item.slice(3)) ?? null) : null;
}

/** the recipes that are learnt from a sheet, in the order their sheets come */
export const BLUEPRINT_RECIPES: readonly Recipe[] = RECIPES.filter((r) => !r.open);

/**
 * The sheet a place has for one who has come so far: the first, in the order they come, of a chapter not beyond
 * `chapter` that is not learnt yet and that `taken` does not rule out (one in the hands, one lying at a place just
 * passed) — so that what is found is always new, and a sheet missed comes again. Null: nothing left to learn so far.
 */
export function nextBlueprint(chapter: number, learned: ReadonlySet<string>, taken: (recipe: string) => boolean = () => false): Recipe | null {
  for (const r of BLUEPRINT_RECIPES) {
    if (r.rare || r.chapter > chapter || learned.has(r.id) || taken(r.id)) continue;
    return r;
  }
  return null;
}

/** how far from a place a sheet it was found to have is not given at another (m): it may still be gone back for */
export const SHEET_KEPT_M = 15000;

/**
 * The sheet one of the plan's blueprint places has for one who comes to it now (docs/V3/plan/finish.md §六 2). `kept`
 * is what each place was found to have (its key → the recipe and how far down the road the place is, m): a place keeps
 * its sheet while that is still to be learnt; else it has the next not learnt, of chapter `chapter` or one before —
 * not one `carried` (in the hands), nor one a place within SHEET_KEPT_M of it was found to have; further on than
 * that, a sheet missed comes again. Null: nothing left to learn so far (the place has something else). `kept` is
 * brought up to date.
 */
export function sheetAt(slot: string, chapter: number, s: number, learned: ReadonlySet<string>, kept: Map<string, { r: string; s: number }>, carried: (recipe: string) => boolean = () => false): Recipe | null {
  const was = kept.get(slot);
  if (was && !learned.has(was.r) && RECIPE_BY_ID.has(was.r)) return RECIPE_BY_ID.get(was.r)!;
  const taken = (r: string): boolean => {
    if (carried(r)) return true;
    for (const [k, v] of kept) if (k !== slot && v.r === r && Math.abs(s - v.s) < SHEET_KEPT_M) return true;
    return false;
  };
  const next = nextBlueprint(chapter, learned, taken);
  if (!next) {
    kept.delete(slot);
    return null;
  }
  kept.set(slot, { r: next.id, s });
  return next;
}
