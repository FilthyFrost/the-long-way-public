/**
 * When the new things first turn up down the road (docs/V3/plan/growth.md §六 3–6, J8): each has its own schedule — the
 * kilometres it first appears between, how far apart it comes again after that, the sorts of place it is found at
 * (three times as likely at one of them, and a planned one waits up to 600 m for one) — and what goes with it: a thing
 * that comes in the same box (a pan with the stove, three in four times), a thing guaranteed within so many kilometres
 * after it (the stove's gas within 2–6 km). Besides the new things, the supplies that keep one going come on a
 * schedule of their own (a can of petrol every 5 km or so, a tyre kit every 2.5 km), their spacing shortened or
 * stretched by the difficulty (more on the comfortable one, less on the hard one).
 *
 * The plan is a pure function of the world's seed: every new game of that world finds the same things at the same
 * places. Pure data and maths.
 */
import { hash2, Rng } from '../math/rng';
import type { SiteKind } from '../world/sites';
import { BLUEPRINT_RECIPES, CHAPTER_KM } from './crafting';
import { DIFFICULTY, type Difficulty } from './difficulty';
import { frameDef } from './frames';
import { roadParts } from './startKit';
import { foundLayout } from './wrecks';

/**
 * what is found: an item by id, a tool of a kind (with what the tool's maker takes), a part — or a blueprint, of a
 * chapter of the journey and those before it: which one is not said here but when one comes to its place (the next
 * not learnt yet: crafting.ts nextBlueprint, docs/V3/plan/finish.md §六 2)
 */
export type ScheduledThing =
  /**
   * `food`: it is something to eat that keeps one going (the supply of tins) — further down the road of a world of
   * version 7 it is as often something to cook instead, as the places' own are (loot.ts foundScheduled, LootRules.ready)
   */
  | { item: string; food?: true }
  | { tool: 'jerrycan' | 'bottle' | 'oilcan' | 'spray'; coolant?: boolean; litres?: number }
  | { part: string; shapeOf?: string }
  | { blueprint: number };

export interface ScheduleEntry {
  /** its name in the plan (the novelty's own: 'stove', 'coffee', 'fuel') */
  id: string;
  thing: ScheduledThing;
  /** a new thing (counted by the pace: at most one in any ten minutes' drive) or a supply */
  novelty: boolean;
  /** first appears between these kilometres */
  firstKm: readonly [number, number];
  /** then again every so many kilometres (absent: once) */
  everyKm?: readonly [number, number];
  /** the sorts of place it is found at (absent: any) */
  themes?: readonly SiteKind[];
  /** what may come in the same box, and how likely */
  with?: readonly { thing: ScheduledThing; chance: number }[];
  /** what is guaranteed within so many kilometres after its first (the stove's gas) */
  after?: readonly { thing: ScheduledThing; km: readonly [number, number] }[];
  /** a can's litres, between these, each find its own */
  litres?: readonly [number, number];
  /**
   * the set it begins (kits.ts): what goes with it is not in this plan — it comes after this has been picked up,
   * where it was picked up — and once the set has begun another of it down the road is one too many (the game gives
   * that place something else)
   */
  kit?: string;
  /**
   * the chapter of the journey its first belongs to (crafting.ts CHAPTER_KM): it is to turn up within that chapter's
   * kilometres whatever the road is like there (PlannedFind.within, fitToPlaces)
   */
  chapter?: number;
}

const I = (item: string): ScheduledThing => ({ item });

/** the houses, cabins and the motel: where a home's things are */
const HOME: readonly SiteKind[] = ['house'];
const STATION: readonly SiteKind[] = ['station'];
const WORKSHOP: readonly SiteKind[] = ['garage', 'works'];
const SHOP: readonly SiteKind[] = ['shop', 'station'];
const CAMP: readonly SiteKind[] = ['camp', 'jetty'];
/** the big places a blueprint is found at */
const BLUEPRINT_PLACES: readonly SiteKind[] = [...WORKSHOP, 'station', 'shop', 'house'];

/**
 * The blueprints' places down the road (docs/V3/plan/finish.md §六 2): in each chapter as many as it has sheets to
 * learn and one more (for a sheet missed), spread over its kilometres; from the last chapter's start one every 12 to
 * 16 km, as long as the road goes. Which sheet a place has is settled when one comes to it — the next not learnt yet
 * — so that what is found is always new: about one every ten kilometres to some 300 km.
 */
function blueprintSlots(): ScheduleEntry[] {
  const out: ScheduleEntry[] = [];
  for (let c = 2; c <= 7; c++) {
    const n = BLUEPRINT_RECIPES.filter((r) => r.chapter === c && !r.rare).length + 1;
    const a = CHAPTER_KM[c] + 0.5;
    const w = (CHAPTER_KM[c + 1] - 0.5 - a) / n;
    for (let k = 0; k < n; k++) out.push({ id: `bp${c}_${k}`, thing: { blueprint: c }, novelty: false, firstKm: [a + k * w, a + (k + 0.8) * w], themes: BLUEPRINT_PLACES });
  }
  out.push({ id: 'bp8', thing: { blueprint: 8 }, novelty: false, firstKm: [191, 198], everyKm: [12, 16], themes: BLUEPRINT_PLACES });
  return out;
}
const BLUEPRINT_SLOTS = blueprintSlots();

/**
 * The new things (§六 3's table) and the supplies (§六 4, 6). Where the plan names a thing the game has two of, the
 * Nomad Drive one (重复的东西以 ND 为主); what the game has not got yet (the two-burner camp stove, the four-burner
 * range, the fishing rod's module) is left out until it has.
 */
export const SCHEDULE: readonly ScheduleEntry[] = [
  // ---- 0–3 km: a crowbar, painkillers, a torch
  { id: 'crowbar', thing: I('nd_crowbar'), novelty: true, firstKm: [0.5, 3], everyKm: [25, 40], themes: WORKSHOP },
  { id: 'torch', thing: I('nd_flashlight'), novelty: true, firstKm: [0.5, 3], everyKm: [20, 35], themes: [...WORKSHOP, 'station'], after: [{ thing: I('nd_battery'), km: [3, 6] }] },
  // ---- 3–8 km: the kits, the first-aid pack (things to keep going with: not counted by the pace)
  { id: 'engine_kit', thing: I('nd_engine_kit'), novelty: false, firstKm: [3, 8], everyKm: [10, 16], themes: WORKSHOP },
  { id: 'charger', thing: I('nd_charger'), novelty: false, firstKm: [3, 8], everyKm: [14, 22], themes: [...WORKSHOP, 'station'] },
  { id: 'bandage', thing: I('med_bandage'), novelty: false, firstKm: [3, 8], everyKm: [12, 20], themes: [...HOME, 'shop'] },
  // ---- the blueprints' places (blueprintSlots; the first of them here and the second at the end of the list, where
  // the roof rack's and the ladder's sheets were: an entry's draws are by its place in the list, and the others keep
  // theirs)
  BLUEPRINT_SLOTS[0],
  // ---- 5–10 km: the cassette stove (a pan or a pot with it, gas soon after)
  {
    id: 'stove',
    thing: I('kit_stove'),
    novelty: true,
    firstKm: [5, 10],
    everyKm: [30, 50],
    themes: [...HOME, ...CAMP],
    with: [
      { thing: I('kit_pan'), chance: 0.75 },
      { thing: I('kit_pot'), chance: 0.75 },
    ],
    after: [{ thing: I('kit_gas'), km: [2, 6] }],
  },
  // ---- 5–15 km: a radio (a tape later)
  { id: 'radio', thing: { part: 'radio_old' }, novelty: true, firstKm: [5, 15], everyKm: [30, 50], themes: [...WORKSHOP, ...HOME], after: [{ thing: I('nd_tape_01'), km: [2, 6] }] },
  // ---- 8–15 km: the coffee machine with its pot (beans and a mug after it)
  {
    id: 'coffee',
    thing: I('nd_coffee_machine'),
    novelty: true,
    firstKm: [8, 15],
    everyKm: [40, 60],
    themes: HOME,
    with: [{ thing: I('coffee_pot'), chance: 1 }],
    after: [
      { thing: I('nd_coffee_pack'), km: [2, 6] },
      { thing: I('nd_mug'), km: [2, 6] },
    ],
  },
  // ---- 10–18 km: the instant camera (with its pack of film; more film later)
  { id: 'camera', thing: I('nd_camera'), novelty: true, firstKm: [10, 18], everyKm: [50, 80], themes: [...HOME, 'lookout', 'lighthouse'], after: [{ thing: I('nd_film_pack'), km: [3, 8] }] },
  // ---- 10–20 km: a flower pot (the seeds after it)
  { id: 'pot', thing: I('nd_plant_pot'), novelty: true, firstKm: [10, 20], everyKm: [25, 40], themes: HOME, after: [{ thing: I('nd_seeds_tomato'), km: [2, 6] }] },
  // ---- 12–20 km: the metal detector (a shovel after it; what it finds wants keys)
  { id: 'detector', thing: I('nd_metal_detector'), novelty: true, firstKm: [12, 20], everyKm: [60, 90], themes: [...WORKSHOP, 'house'], after: [{ thing: I('nd_shovel'), km: [2, 6] }] },
  // ---- 15–25 km: a bigger backpack
  { id: 'pack', thing: I('pack_std'), novelty: true, firstKm: [15, 25], everyKm: [40, 60], themes: [...HOME, ...CAMP] },
  // ---- 20–30 km: the kitchen's second batch (the steamer, the kettle)
  { id: 'kitchen2', thing: I('kit_kettle'), novelty: true, firstKm: [20, 30], everyKm: [40, 60], themes: HOME, with: [{ thing: I('kit_steamer'), chance: 0.6 }] },
  // ---- 25–40 km: the grinder (a battery after it)
  { id: 'grinder', thing: I('nd_grinder'), novelty: true, firstKm: [25, 40], everyKm: [50, 70], themes: WORKSHOP, after: [{ thing: I('nd_battery'), km: [2, 6] }] },
  // ---- 30–45 km: the polisher, spray cans
  { id: 'polisher', thing: I('nd_polisher'), novelty: true, firstKm: [30, 45], everyKm: [50, 70], themes: WORKSHOP },
  { id: 'spray', thing: { tool: 'spray' }, novelty: true, firstKm: [30, 45], everyKm: [6, 10], themes: [...WORKSHOP, 'station'] },
  // ---- 40–60 km: furniture (room for it comes with the bigger vehicles)
  { id: 'furniture', thing: I('nd_chair'), novelty: true, firstKm: [40, 60], everyKm: [10, 16], themes: HOME, with: [{ thing: I('nd_table'), chance: 0.5 }] },
  { id: 'shelves', thing: I('nd_wall_shelf'), novelty: true, firstKm: [45, 65], everyKm: [15, 25], themes: HOME },
  // ---- 50–70 km: the fridge
  { id: 'fridge', thing: I('nd_fridge'), novelty: true, firstKm: [50, 70], everyKm: [60, 90], themes: HOME },
  // ---- 60 km on: what one collects
  { id: 'bobble', thing: I('nd_bobble_1'), novelty: true, firstKm: [60, 80], everyKm: [20, 35], themes: [...HOME, 'shop'] },

  // ---- the supplies (§六 4, 6), as J10 balanced them with what is left in the places' own boxes (loot.ts PLACES_KEEP):
  // over a hundred kilometres at Nomad Drive's pace of play, food 2.5 times what one eats, water twice, petrol to carry
  // 2.6 times what our car burns (27 L), never more than 8.2 km without any (the cans, the pumps, the wrecks' tanks)
  // (the petrol: any place, a can left by a wreck by the road too)
  { id: 'fuel', thing: { tool: 'jerrycan' }, novelty: false, firstKm: [1, 3], everyKm: [2.5, 4], litres: [0.8, 1.8] },
  { id: 'tyre_kit', thing: I('nd_tire_kit'), novelty: false, firstKm: [2, 4], everyKm: [2, 3], themes: [...WORKSHOP, 'station', 'roadside'] },
  { id: 'coolant', thing: { tool: 'bottle', coolant: true }, novelty: false, firstKm: [3, 6], everyKm: [50, 80], themes: [...STATION, ...WORKSHOP], litres: [1, 2.5] },
  { id: 'oil', thing: { tool: 'oilcan' }, novelty: false, firstKm: [4, 8], everyKm: [60, 100], themes: [...STATION, ...WORKSHOP], litres: [1.5, 3] },
  { id: 'painkillers', thing: I('med_pain_2'), novelty: false, firstKm: [1, 3], everyKm: [5, 9], themes: [...HOME, ...SHOP] },
  { id: 'stomach', thing: I('nd_pills'), novelty: false, firstKm: [4, 9], everyKm: [8, 14], themes: [...HOME, ...SHOP] },
  { id: 'water', thing: I('drink_water'), novelty: false, firstKm: [0.5, 2], everyKm: [12, 20], themes: [...SHOP, ...HOME, ...CAMP] },
  { id: 'food', thing: I('nd_baked_beans'), novelty: false, firstKm: [0.5, 2], everyKm: [3, 5], themes: [...SHOP, ...HOME, ...CAMP] },

  // ---- the rest of the blueprints' places
  ...BLUEPRINT_SLOTS.slice(1),
];

/**
 * The plan of a world of version 7 (docs/V3/plan/finish.md §二 1: the journey in chapters, by the kilometre): each
 * chapter's new things first turn up within its kilometres — the first twelve the car's own missing parts, a crowbar,
 * a torch and a camera; to the 30th a radio, a bigger pack, paint; to the 50th coffee and the first meal; to the 75th
 * the garden; to the 105th fishing; to the 140th a home's things. A thing that begins a set (`kit`) comes by itself:
 * what goes with it follows where it was picked up (kits.ts), and it is offered again every 22–30 km until it has
 * been. The supplies and the blueprints' places as in the plan before it.
 */
export const SCHEDULE_V7: readonly ScheduleEntry[] = [
  // ---- chapter 1, to the 12th km
  { id: 'crowbar', thing: I('nd_crowbar'), novelty: true, chapter: 1, firstKm: [0.5, 3], everyKm: [25, 40], themes: WORKSHOP },
  { id: 'torch', thing: I('nd_flashlight'), novelty: true, chapter: 1, firstKm: [2, 5], everyKm: [20, 35], themes: [...WORKSHOP, 'station'], after: [{ thing: I('nd_battery'), km: [3, 6] }] },
  { id: 'engine_kit', thing: I('nd_engine_kit'), novelty: false, firstKm: [3, 8], everyKm: [10, 16], themes: WORKSHOP },
  { id: 'charger', thing: I('nd_charger'), novelty: false, firstKm: [3, 8], everyKm: [14, 22], themes: [...WORKSHOP, 'station'] },
  { id: 'bandage', thing: I('med_bandage'), novelty: false, firstKm: [3, 8], everyKm: [12, 20], themes: [...HOME, 'shop'] },
  { id: 'camera', thing: I('nd_camera'), novelty: true, chapter: 1, firstKm: [7, 10.5], everyKm: [22, 30], kit: 'photo', themes: [...HOME, 'lookout', 'lighthouse'] },
  // ---- chapter 2, to the 30th: a bigger vehicle (vehiclePlan), a radio, a bigger pack, paint
  { id: 'radio', thing: { part: 'radio_old' }, novelty: true, chapter: 2, firstKm: [13, 18], everyKm: [22, 30], kit: 'music', themes: [...WORKSHOP, ...HOME] },
  { id: 'pack', thing: I('pack_std'), novelty: true, chapter: 2, firstKm: [19, 24], everyKm: [40, 60], themes: [...HOME, ...CAMP] },
  { id: 'spray', thing: { tool: 'spray' }, novelty: true, chapter: 2, firstKm: [24.5, 28.5], everyKm: [6, 10], themes: [...WORKSHOP, 'station'] },
  // ---- chapter 3, to the 50th: coffee, and the first meal
  { id: 'coffee', thing: I('nd_coffee_machine'), novelty: true, chapter: 3, firstKm: [31, 35], everyKm: [22, 30], kit: 'coffee', themes: HOME },
  { id: 'stove', thing: I('kit_stove'), novelty: true, chapter: 3, firstKm: [38.5, 42.5], everyKm: [22, 30], kit: 'cooking', themes: [...HOME, ...CAMP] },
  { id: 'cooler', thing: I('kit_cooler'), novelty: true, chapter: 3, firstKm: [45.5, 48.5], everyKm: [40, 60], themes: [...HOME, ...CAMP, 'shop'] },
  // ---- chapter 4, to the 75th: the garden; a knife and a basket for what grows wild; the grinder
  { id: 'pot', thing: I('nd_plant_pot'), novelty: true, chapter: 4, firstKm: [50.5, 54.5], everyKm: [22, 30], kit: 'garden', themes: HOME },
  { id: 'forage', thing: I('forage_knife'), novelty: true, chapter: 4, firstKm: [58, 62], everyKm: [40, 60], themes: [...HOME, ...CAMP], with: [{ thing: I('forage_basket'), chance: 1 }] },
  { id: 'grinder', thing: I('nd_grinder'), novelty: true, chapter: 4, firstKm: [66, 72], everyKm: [22, 30], kit: 'refit', themes: WORKSHOP },
  // ---- chapter 5, to the 105th: fishing; the metal detector; the spoon
  { id: 'rod', thing: I('rod_willow'), novelty: true, chapter: 5, firstKm: [76, 81], everyKm: [22, 30], kit: 'fishing', themes: ['jetty', 'camp'] },
  { id: 'detector', thing: I('nd_metal_detector'), novelty: true, chapter: 5, firstKm: [86, 92], everyKm: [22, 30], kit: 'treasure', themes: [...WORKSHOP, 'house'] },
  { id: 'spoon', thing: I('bait_spoon'), novelty: true, chapter: 5, firstKm: [95, 102], everyKm: [15, 25], themes: ['jetty', 'camp'] },
  // ---- chapter 6, to the 140th: a home
  { id: 'furniture', thing: I('nd_chair'), novelty: true, chapter: 6, firstKm: [105.5, 110], everyKm: [10, 16], themes: HOME, with: [{ thing: I('nd_table'), chance: 0.5 }] },
  { id: 'shelves', thing: I('nd_wall_shelf'), novelty: true, chapter: 6, firstKm: [113.5, 118], everyKm: [15, 25], themes: HOME },
  { id: 'fridge', thing: I('nd_fridge'), novelty: true, chapter: 6, firstKm: [121.5, 127], everyKm: [60, 90], themes: HOME },
  { id: 'kitchen2', thing: I('kit_kettle'), novelty: true, chapter: 6, firstKm: [130.5, 136.5], everyKm: [40, 60], themes: HOME, with: [{ thing: I('kit_steamer'), chance: 0.6 }] },
  // ---- what one collects (not counted by the pace: there is one or another in many a house)
  { id: 'bobble', thing: I('nd_bobble_1'), novelty: false, firstKm: [60, 80], everyKm: [20, 35], themes: [...HOME, 'shop'] },

  // ---- the supplies, as the plan before it has them
  { id: 'fuel', thing: { tool: 'jerrycan' }, novelty: false, firstKm: [1, 3], everyKm: [2.5, 4], litres: [0.8, 1.8] },
  { id: 'tyre_kit', thing: I('nd_tire_kit'), novelty: false, firstKm: [2, 4], everyKm: [2, 3], themes: [...WORKSHOP, 'station', 'roadside'] },
  { id: 'coolant', thing: { tool: 'bottle', coolant: true }, novelty: false, firstKm: [3, 6], everyKm: [50, 80], themes: [...STATION, ...WORKSHOP], litres: [1, 2.5] },
  { id: 'oil', thing: { tool: 'oilcan' }, novelty: false, firstKm: [4, 8], everyKm: [60, 100], themes: [...STATION, ...WORKSHOP], litres: [1.5, 3] },
  { id: 'painkillers', thing: I('med_pain_2'), novelty: false, firstKm: [1, 3], everyKm: [5, 9], themes: [...HOME, ...SHOP] },
  { id: 'stomach', thing: I('nd_pills'), novelty: false, firstKm: [4, 9], everyKm: [8, 14], themes: [...HOME, ...SHOP] },
  { id: 'water', thing: I('drink_water'), novelty: false, firstKm: [0.5, 2], everyKm: [12, 20], themes: [...SHOP, ...HOME, ...CAMP] },
  { id: 'food', thing: { item: 'nd_baked_beans', food: true }, novelty: false, firstKm: [0.5, 2], everyKm: [3, 5], themes: [...SHOP, ...HOME, ...CAMP] },

  // ---- the blueprints' places
  ...BLUEPRINT_SLOTS,
];

/** the plan of a world by its version: version 7's by chapters, the one before it for every world made before */
export function scheduleOf(worldVersion: number): readonly ScheduleEntry[] {
  return worldVersion >= 7 ? SCHEDULE_V7 : SCHEDULE;
}

/** a vehicle to find: of which sort, the tier of the parts beside it, its own roll's seed (core/modcar/wrecks.ts rollFound) */
export interface VehiclePlanned extends PlannedFind {
  frame: string;
  tier: number;
  seed: number;
}

/** the big places a vehicle to find stands at (a yard, a forecourt, a shop's, a house's, a camp's ground) */
export const VEHICLE_PLACES: readonly SiteKind[] = ['garage', 'works', 'station', 'shop', 'house', 'camp'];

/**
 * The vehicles one finds before the 100th kilometre (§六 2's table): the first a Loaf or a Mule, then the Swallow, then
 * a second of the bigger ones, then the Whale with better parts, then the Tadpole, a trailer (J9d: a hitch ball for it a
 * few kilometres before it, vehicleExtras) — each its first kilometres
 */
export const VEHICLE_STEPS: readonly { km: readonly [number, number]; frames: readonly string[]; tier: number }[] = [
  { km: [12, 20], frames: ['van', 'pickup'], tier: 2 },
  { km: [25, 40], frames: ['moto'], tier: 2 },
  { km: [30, 45], frames: ['buffalo', 'wagon', 'goat', 'fox'], tier: 2 },
  { km: [50, 70], frames: ['rv', 'turtle'], tier: 3 },
  { km: [75, 100], frames: ['trailer'], tier: 2 },
];

/** from the 100th kilometre: one every 15–20 km, the Rhino, the Snail, the Old Elephant and the Camel first (docs/V3/plan/rv.md), then all of them in turn */
const LATER_FROM_KM = 100;
const LATER_FIRST: readonly string[] = ['rhino', 'snail', 'elephant', 'camel'];
const LATER_ALL: readonly string[] = ['van', 'pickup', 'moto', 'buffalo', 'wagon', 'goat', 'fox', 'rv', 'rhino', 'snail', 'turtle', 'elephant', 'camel'];

/** two vehicles to find at least so far apart (km) */
const VEHICLE_GAP_KM = 5;

/**
 * The vehicles to find down a world's road (§六 2): the table's four before the 100th kilometre, then one every 15–20
 * km, never the same sort twice running — each at the first big place soon after it is due (wrecks.ts VehicleFinds: a
 * bare frame standing on its ground, a set of parts beside it); one gets in and makes it one's own. The wrecks by the
 * road are for their parts.
 */
export function vehiclePlan(seed: number, toKm: number): VehiclePlanned[] {
  const r = new Rng(hash2(seed | 0, 0x7e41c, 2));
  const out: VehiclePlanned[] = [];
  const add = (km: number, frame: string, tier: number): void => {
    out.push({ entry: `vehicle:${frame}`, thing: { item: 'vehicle' }, s: km * 1000, themes: VEHICLE_PLACES, novelty: true, frame, tier, seed: hash2(seed | 0, out.length, 0x7e41d) });
  };
  let last = -Infinity;
  for (const st of VEHICLE_STEPS) {
    const km = Math.max(st.km[0] + (st.km[1] - st.km[0]) * r.next(), last + VEHICLE_GAP_KM);
    const frame = st.frames[r.int(st.frames.length)];
    last = km;
    if (km < toKm) add(km, frame, st.tier);
  }
  let prev = out[out.length - 1]?.frame ?? '';
  for (let k = 0, km = Math.max(LATER_FROM_KM, last + 15) + 5 * r.next(); km < toKm; k++, km += 15 + 5 * r.next()) {
    let frame = k < LATER_FIRST.length ? LATER_FIRST[k] : LATER_ALL[r.int(LATER_ALL.length)];
    if (frame === prev) frame = LATER_ALL[(LATER_ALL.indexOf(frame) + 1 + r.int(LATER_ALL.length - 1)) % LATER_ALL.length];
    prev = frame;
    add(km, frame, 3);
  }
  return out;
}

/**
 * The panels missing from each vehicle to find (its roll's `missing`), each coming 2–6 km after where the vehicle is due
 * (§六 2: 缺的 2–6 km 后补上) — at a workshop, a filling station, a house or a shop, shaped for its frame; a trailer's
 * hitch ball 3–8 km before it, at a workshop or a filling station (what tows it, on whatever one drives); the
 * motorcycle rack's blueprint 2–5 km after the motorcycle (§六 2: 摩托车架跟着摩托车出现, J9e), at the big places a
 * blueprint is found at
 */
export function vehicleExtras(seed: number, toKm: number): PlannedFind[] {
  const out: PlannedFind[] = [];
  for (const v of vehiclePlan(seed, toKm)) {
    const r = new Rng(hash2(v.seed, 0x7e41e, 3));
    if (frameDef(v.frame).towed) out.push({ entry: 'vehicle+', thing: { part: 'hitch_ball' }, s: Math.max(1000, v.s - (3 + 5 * r.next()) * 1000), themes: ['garage', 'works', 'station'], novelty: false });
    // (its own draw: the panels' after it keep theirs)
    if (frameDef(v.frame).balance) out.push({ entry: 'moto_rack', thing: { item: 'bp_moto_rack' }, s: v.s + (2 + 3 * new Rng(hash2(v.seed, 0xb1e9, 5)).next()) * 1000, themes: ['garage', 'works', 'station', 'shop', 'house'], novelty: false });
    for (const m of foundLayout(v.frame, v.seed).missing) {
      out.push({ entry: 'vehicle+', thing: { part: m.part, shapeOf: v.frame }, s: v.s + (2 + 4 * r.next()) * 1000, themes: ['garage', 'works', 'station', 'house', 'shop'], novelty: false });
    }
  }
  return out;
}

/** the driver's door of the car one starts with is found within this far down the road (km) */
export const DOOR_BY_KM = 3;

/** where the rest of the car one starts with is found: at a workshop or a filling station, or by a wreck on the verge */
const CAR_PLACES: readonly SiteKind[] = ['garage', 'works', 'station', 'roadside'];

/**
 * The car one starts with, in a world of version 7 (docs/V3/plan/finish.md §二 2: 把方糖拼完整): the sixteen parts its
 * workshop does not have (startKit.ts ROAD_MOUNTS), each somewhere down the first chapter of the road — the driver's
 * door first, at a workshop or a filling station between the first kilometre and the third; the rest one after
 * another from there to the tenth and a half, in an order of the world's own, at a workshop, a filling station or by a
 * wreck on the verge. Every one of them within the chapter whatever the road is like (`within`: fitToPlaces).
 */
export function startExtras(seed: number): PlannedFind[] {
  const r = new Rng(hash2(seed | 0, 0x57a27, 4));
  const parts = roadParts();
  const first = parts.find((p) => p.mount === 'door_FL');
  const rest = parts.filter((p) => p !== first);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = r.int(i + 1);
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const chapter = [0, CHAPTER_KM[2] * 1000] as const;
  const find = (p: (typeof parts)[number], km: number, themes: readonly SiteKind[], within: readonly [number, number] = chapter): PlannedFind => ({ entry: `start:${p.mount}`, thing: { part: p.part, ...(p.shapeOf ? { shapeOf: p.shapeOf } : {}) }, s: km * 1000, themes, novelty: false, within });
  const out: PlannedFind[] = [];
  // (the driver's door: within the first three kilometres whatever the road is like — a cab with no door is cold)
  if (first) out.push(find(first, 1 + 1.5 * r.next(), ['garage', 'works', 'station'], [0, DOOR_BY_KM * 1000]));
  const from = 1.5;
  const to = 10.5;
  rest.forEach((p, i) => out.push(find(p, from + ((i + r.next()) / rest.length) * (to - from), CAR_PLACES)));
  return out;
}

/**
 * The plan the places lay (places.ts): the things (plan) and the panels missing from the vehicles to find, by where
 * each is due — and, by version 7's table, the rest of the car one starts with (startExtras)
 */
export function placesPlan(seed: number, toKm: number, difficulty: Difficulty = 'normal', table: readonly ScheduleEntry[] = SCHEDULE): PlannedFind[] {
  return [...plan(seed, toKm, difficulty, table), ...vehicleExtras(seed, toKm), ...(table === SCHEDULE_V7 ? startExtras(seed) : [])].sort((a, b) => a.s - b.s);
}

/**
 * What stands for a new thing among a place's own (heldBackUntil): the other bobbleheads for the first; the hiking pack,
 * a bigger one than the plan's canvas rucksack, for it
 */
const HELD_KIN: Readonly<Record<string, string>> = { nd_bobble_2: 'nd_bobble_1', nd_bobble_3: 'nd_bobble_1', nd_bobble_4: 'nd_bobble_1', pack_hike: 'pack_std' };
/** the new things that are a building's furnishing (its table and chairs, its shelf, its kitchen's fridge): never held back */
const FURNISHING: ReadonlySet<string> = new Set(['furniture', 'shelves', 'fridge']);

/**
 * How far down the road a place's own may first have each of the new things (§六 3: 新东西按里程放出): where the plan's
 * first of it is due (m), by item — a Nomad Drive building's own (core/v3/nd/cards.ts: a cabin's coffee machine and its
 * camera, a filling station's store room's grinder) waits for it and for the THEME_WAIT_M it may wait for its place
 * (places.ts), so that the new things come one at a time as the plan has them; after it they may be anywhere as Nomad
 * Drive has them. The furniture is the buildings' furnishing and waits for nothing. `finds` the places' plan in road
 * order (placesPlan). `all` (a world of version 7 on: docs/V3/plan/finish.md §二 1): by the thing's key (thingKey) —
 * the parts and the tools among the new things too (a car radio, a spray can), and what comes in the same box — for
 * the places' own boxes to wait as well as what lies in plain sight: nothing of a chapter turns up before it.
 */
export function heldBackUntil(finds: readonly PlannedFind[], all = false): Map<string, number> {
  const out = new Map<string, number>();
  for (const f of finds) {
    if (!f.novelty || FURNISHING.has(f.entry)) continue;
    if (all) {
      // (a world of version 7: every new thing by its key — a part, a tool as an item — and what comes in its box with it)
      for (const t of [f.thing, ...(f.with ?? [])]) {
        const key = thingKey(t);
        if (key !== 'blueprint' && !out.has(key)) out.set(key, f.s);
      }
    } else if ('item' in f.thing && !out.has(f.thing.item)) out.set(f.thing.item, f.s);
  }
  for (const [kin, of] of Object.entries(HELD_KIN)) {
    const s = out.get(of);
    if (s !== undefined && !out.has(kin)) out.set(kin, s);
  }
  return out;
}

/** a thing's key: an item's id, a part's with `part:` before it, a tool's with `tool:` (the sets', the hold-back's, a found thing's: loot.ts foundKey) */
export function thingKey(t: ScheduledThing): string {
  return 'item' in t ? t.item : 'part' in t ? `part:${t.part}` : 'tool' in t ? `tool:${t.tool}` : 'blueprint';
}

/** a planned find: what, at how far down the road (m) it is due, and which entry it is of */
export interface PlannedFind {
  entry: string;
  thing: ScheduledThing;
  /** due here (m): the first place it fits at or after this takes it */
  s: number;
  /** the sorts of place it wants (absent: any) */
  themes?: readonly SiteKind[];
  novelty: boolean;
  /** what comes in the same box */
  with?: ScheduledThing[];
  /** the set it begins (ScheduleEntry.kit) */
  kit?: string;
  /** the first of a chapter's new thing: the stretch of road (m, from–to) it is to turn up within (ScheduleEntry.chapter; fitToPlaces) */
  within?: readonly [number, number];
}

/**
 * a novelty pushed later when another came too close before it (§六 3: at most one new thing in any ten minutes — of
 * play, the stops at the places with it: about three and a half kilometres of road)
 */
export const NOVELTY_GAP_KM = 3.5;

/**
 * The plan of what turns up down a world's road as far as `toKm`: each entry's finds (its first in its band, then
 * again at its spacing, the spacing of the supplies by the difficulty's), the novelties spaced at least NOVELTY_GAP_KM
 * apart (a later one pushed on), what comes after one guaranteed within its kilometres, and what comes with one in the
 * same box rolled now. Sorted by where each is due.
 */
export function plan(seed: number, toKm: number, difficulty: Difficulty = 'normal', table: readonly ScheduleEntry[] = SCHEDULE): PlannedFind[] {
  const out: PlannedFind[] = [];
  const supply = DIFFICULTY[difficulty].supply;
  const firsts: { e: ScheduleEntry; km: number }[] = [];
  table.forEach((e, i) => {
    const r = new Rng(hash2(seed | 0, 0x5c4ed, i));
    let km = e.firstKm[0] + (e.firstKm[1] - e.firstKm[0]) * r.next();
    firsts.push({ e, km });
    if (!e.novelty) {
      // (supplies: their spacing by the difficulty's supply — more of them on the comfortable one)
      while (km < toKm) {
        const thing = e.litres && 'tool' in e.thing ? { ...e.thing, litres: Math.round((e.litres[0] + (e.litres[1] - e.litres[0]) * r.next()) * 10) / 10 } : e.thing;
        out.push({ entry: e.id, thing, s: km * 1000, themes: e.themes, novelty: false });
        if (!e.everyKm) break;
        km += (e.everyKm[0] + (e.everyKm[1] - e.everyKm[0]) * r.next()) / supply;
      }
    }
  });
  // the novelties' firsts, spaced: one pushed on past the one before it by the gap
  const novel = firsts.filter((f) => f.e.novelty).sort((a, b) => a.km - b.km);
  let last = -Infinity;
  for (const f of novel) {
    if (f.km < last + NOVELTY_GAP_KM) f.km = last + NOVELTY_GAP_KM;
    // (the first three, the ones of the first kilometres, come together: a crowbar and a torch at the first station)
    if (f.e.firstKm[1] <= 3) f.km = Math.min(f.km, f.e.firstKm[1]);
    else last = f.km;
  }
  table.forEach((e, i) => {
    if (!e.novelty) return;
    const f = firsts.find((x) => x.e === e)!;
    const r = new Rng(hash2(seed | 0, 0x5c4ee, i));
    let km = f.km;
    let n = 0;
    while (km < toKm) {
      const w: ScheduledThing[] = [];
      for (const c of e.with ?? []) if (r.next() < c.chance) w.push(c.thing);
      const within = n === 0 && e.chapter !== undefined && CHAPTER_KM[e.chapter + 1] !== undefined ? ([CHAPTER_KM[e.chapter] * 1000, CHAPTER_KM[e.chapter + 1] * 1000] as const) : null;
      out.push({ entry: e.id, thing: e.thing, s: km * 1000, themes: e.themes, novelty: true, ...(w.length ? { with: w } : {}), ...(e.kit ? { kit: e.kit } : {}), ...(within ? { within } : {}) });
      // what goes after the first one, within its kilometres
      if (n === 0) for (const a of e.after ?? []) out.push({ entry: `${e.id}+`, thing: a.thing, s: (km + a.km[0] + (a.km[1] - a.km[0]) * r.next()) * 1000, novelty: false });
      n++;
      if (!e.everyKm) break;
      km += e.everyKm[0] + (e.everyKm[1] - e.everyKm[0]) * r.next();
    }
  });
  out.sort((a, b) => a.s - b.s);
  return out;
}

/** a place down the road that may take a planned find: where it is (m), what sort, how many boxes it has to put things in */
export interface PlanPlace {
  s: number;
  kind: SiteKind;
  boxes: number;
  /**
   * no box of its own, but the ground by a wreck (loot.ts planGround): it takes only what wants no sort of place (the
   * petrol) or wants this sort (a verge's tyre kit)
   */
  ground?: boolean;
  /** has it room for this one (absent: for any) — a vehicle to find wants ground of its own size (wrecks.ts VehicleFinds) */
  room?: (f: PlannedFind) => boolean;
}

/** may this place take this find: a box of its own, or the ground by a wreck for what may lie by the road — and room for it */
function fits(f: PlannedFind, p: Pick<PlanPlace, 'kind' | 'boxes' | 'ground' | 'room'>): boolean {
  return (p.boxes > 0 || (!!p.ground && (!f.themes || f.themes.includes(p.kind)))) && (!p.room || p.room(f));
}

/** how far a planned find waits for a place of its own sort before it takes any (m: Nomad Drive's) */
export const THEME_WAIT_M = 600;

/**
 * The plan laid over a world's places as one comes down the road (the game's; placeFinds does the same at once): fed
 * the places in road order, each takes what is due at it — a find waiting up to THEME_WAIT_M for a place of its sorts,
 * then any place with boxes — and says what it holds. The same places give the same answer however they come in.
 */
export class SitePlanner {
  private readonly pending: PlannedFind[] = [];
  /** finds added as the game goes (add), not due yet: in the order they are due */
  private readonly later: PlannedFind[] = [];
  private next = 0;
  private readonly at = new Map<string, PlannedFind[]>();
  /** where the place that took each find is (m) */
  private readonly where = new Map<PlannedFind, number>();
  /** places taken in up to here (m) */
  private to = -Infinity;

  constructor(private readonly finds: readonly PlannedFind[]) {}

  /** how far down the road the places have been taken in (m) */
  get through(): number {
    return this.to;
  }

  /** the places from where the last ended, in road order: what each holds is decided */
  take(places: readonly (PlanPlace & { id: string })[]): void {
    for (const p of places) {
      if (p.s <= this.to) continue;
      this.to = p.s;
      while (this.next < this.finds.length && this.finds[this.next].s <= p.s + 1) this.pending.push(this.finds[this.next++]);
      while (this.later.length && this.later[0].s <= p.s + 1) this.pending.push(this.later.shift()!);
      if (p.boxes <= 0 && !p.ground) continue;
      for (let i = 0; i < this.pending.length; i++) {
        const f = this.pending[i];
        if (!fits(f, p)) continue;
        const sorts = !f.themes || f.themes.includes(p.kind);
        if (!sorts && p.s < f.s + THEME_WAIT_M) continue;
        const list = this.at.get(p.id) ?? [];
        list.push(f);
        this.at.set(p.id, list);
        this.where.set(f, p.s);
        this.pending.splice(i--, 1);
      }
    }
  }

  /**
   * Finds added to the plan as the game goes (a set's next step, put out where the one before it was picked up:
   * kits.ts): laid as the plan's own are, at the first place that takes them from where each is due — never at a place
   * taken in already: one due behind where the places have been taken in to is due just beyond it (so that a planner
   * made again with the same finds — a game taken up — lays it at the same place). Returns the finds as they were
   * added: these are what a game keeps.
   */
  add(finds: readonly PlannedFind[]): PlannedFind[] {
    const out: PlannedFind[] = [];
    for (const g of finds) {
      // (a place takes what is due up to a metre past it: beyond that)
      const f = g.s > this.to + 1 ? g : { ...g, s: this.to + 2 };
      let i = this.later.length;
      while (i > 0 && this.later[i - 1].s > f.s) i--;
      this.later.splice(i, 0, f);
      out.push(f);
    }
    return out;
  }

  /** where the place that took a find is (m of road), or undefined: none has yet */
  laidAt(f: PlannedFind): number | undefined {
    return this.where.get(f);
  }

  /** what of the plan a place holds (taken in already) */
  findsAt(id: string): readonly PlannedFind[] {
    return this.at.get(id) ?? [];
  }
}

/** where the planner's rule lays a find among these places (road order): the place's distance down the road (m), or Infinity: none takes it */
function laidWhere(f: PlannedFind, places: readonly PlanPlace[]): number {
  for (const p of places) {
    if (p.s < f.s - 1 || !fits(f, p)) continue;
    if (!f.themes || f.themes.includes(p.kind) || p.s >= f.s + THEME_WAIT_M) return p.s;
  }
  return Infinity;
}

/**
 * The plan fitted to a world's places (docs/V3/plan/finish.md §二 4: 每章的主玩具在它的里程段里一定出现). A chapter's
 * new thing (PlannedFind.within) that would be laid beyond its chapter — the road has no place with a box in it from
 * where it is due to the chapter's end — is due instead at the last place within the chapter that takes it: one of its
 * own sorts if the chapter has one, else any with a box of its own (and then it waits for no sort of place). The rest
 * of the plan as it was. `places` in road order, down to the end of the last chapter there is to fit.
 */
export function fitToPlaces(finds: readonly PlannedFind[], places: readonly PlanPlace[]): PlannedFind[] {
  const out = finds.map((f) => {
    if (!f.within || laidWhere(f, places) <= f.within[1]) return f;
    const within = f.within;
    const boxes = places.filter((p) => p.boxes > 0 && p.s >= within[0] && p.s <= within[1] && (!p.room || p.room(f)));
    const own = boxes.filter((p) => !f.themes || f.themes.includes(p.kind));
    const at = own.length ? own[own.length - 1] : boxes[boxes.length - 1];
    if (!at) return f;
    if (own.length) return { ...f, s: at.s - 0.5 };
    const { themes: _sorts, ...any } = f;
    return { ...any, s: at.s - 0.5 };
  });
  return out.sort((a, b) => a.s - b.s);
}

/**
 * Where each planned find is found: the first place at or after where it is due that is of its sorts (if one comes
 * within THEME_WAIT_M), else the first place with boxes at all from there on. `places` in road order. Returns, for
 * each place's index, the finds it holds.
 */
export function placeFinds(finds: readonly PlannedFind[], places: readonly PlanPlace[]): Map<number, PlannedFind[]> {
  const out = new Map<number, PlannedFind[]>();
  let from = 0;
  for (const f of finds) {
    while (from < places.length && places[from].s < f.s - 1) from++;
    let at = -1;
    for (let i = from; i < places.length && places[i].s <= f.s + THEME_WAIT_M; i++) {
      if (fits(f, places[i]) && (!f.themes || f.themes.includes(places[i].kind))) {
        at = i;
        break;
      }
    }
    if (at < 0) for (let i = from; i < places.length; i++) if (fits(f, places[i]) && places[i].s >= f.s + (f.themes ? THEME_WAIT_M : 0)) {
      at = i;
      break;
    }
    if (at < 0) continue;
    const list = out.get(at) ?? [];
    list.push(f);
    out.set(at, list);
  }
  return out;
}
