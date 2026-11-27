/**
 * What is found at the places by the road (docs/MODCAR.md §20, Arctic Drive's buildings): every container the
 * world lays out (core/world/sites.ts: a kitchen's cupboard, a filling station's till, a garage's drawers and its
 * shelves of big parts, a crate by the verge …) holds ModCar's own things, by what it is and where it stands —
 * food and drink in a kitchen, snacks, drinks and oil at a till, clothes in a wardrobe, spray cans, scrapers and
 * small parts in a toolbox, engines, wheels and radiators on a garage's shelves — and the things lying about in
 * plain sight at a place become junk to recycle, a tyre, a jerrycan. Better things the further down the road, as
 * the wrecks' finds (wrecks.ts findOdds). A filling station's pumps hold petrol and diesel.
 *
 * A roll is a pure function of its seed: the same cupboard holds the same things for every player. Pure data
 * and maths.
 */
import type { ContainerKind } from '../items/loot';
import { Rng, hash2 } from '../math/rng';
import { fitSub, newInstance } from './build';
import { BLUEPRINT_RECIPES, blueprintOf, partStars } from './crafting';
import { BASE_ITEMS, ITEMS, hasItem, itemDef as ITEMS_BY_ID, type ItemCat, type ItemDef } from './items';
import { BASIC_PAINTS, PALETTE } from './palette';
import { sprayFound } from './paint';
import { keepInsideClean, PARTS, partDef } from './parts';
import { newTool, type Tool, type ToolKind } from './tools';
import type { PartDef, PartInstance } from './types';
import { findOdds, type FindRules } from './wrecks';
import type { ScheduledThing } from './schedule';
import { needOf, type Stocks } from './needs';

/**
 * A thing found: an item (its id), a tool, or a part. An item may be found as a stack of `n`, of a quality `q`
 * (1-5 stars) and with its system's own `state`; without them it is one plain thing, as every table here gives.
 * Its freshness starts counting when it is found (where a Found becomes an instance: places.ts heldOfFound).
 */
export type Found = { item: string; n?: number; q?: number; state?: import('./items').ItemState } | { tool: Tool } | { part: PartInstance };

type Pick =
  /** one of the items of a category (graded: better further on) */
  | { cat: ItemCat }
  /** one of these items */
  | { one: readonly string[] }
  /** junk of the place's own sort (a kitchen's mug, a garage's paint bucket) */
  | { junk: true }
  | { tool: ToolKind }
  /** a part of one of these categories (graded) */
  | { part: readonly string[] }
  /** something to cook with, of a shelf of the larder (addLarder: what the kitchen has registered), no better than the road allows this far */
  | { larder: LarderShelf };

interface Entry {
  pick: Pick;
  w: number;
  /** only from this far down the road (m): before it the entry is not in the table */
  from?: number;
  /** only at these sorts of place (sites.ts Site.sort): a cool box's shellfish on a jetty, under a lighthouse */
  at?: readonly string[];
}

interface Table {
  /** how many things (each a pick) */
  picks: readonly [number, number];
  /** the chance of nothing at all (somebody was here first) */
  empty: number;
  entries: readonly Entry[];
  /** one thing more now and then, over its picks (a packet of seeds in a kitchen's cupboard): each by its own chance, from so far down the road */
  also?: readonly { pick: Pick; chance: number; from?: number }[];
}

const E = (pick: Pick, w: number, from?: number, at?: readonly string[]): Entry => ({ pick, w, ...(from === undefined ? {} : { from }), ...(at ? { at } : {}) });

/** the small parts a toolbox keeps */
const SMALL_PARTS = ['ignition', 'horn', 'gearLever', 'handbrake', 'headlight', 'taillight', 'mirror', 'radio'];

export const LOOT_TABLES: Record<ContainerKind, Table> = {
  // a crate by the verge or at a lay-by: whatever was packed and never fetched
  crate: { picks: [1, 3], empty: 0.15, entries: [E({ junk: true }, 3), E({ cat: 'crate' }, 2.5), E({ cat: 'food' }, 1.5), E({ cat: 'drink' }, 1.2), E({ cat: 'wear' }, 0.8), E({ tool: 'spray' }, 0.5), E({ cat: 'gear' }, 0.25), E({ tool: 'bottle' }, 0.3)] },
  // a workshop's drawers
  toolbox: { picks: [1, 3], empty: 0.05, entries: [E({ cat: 'crate' }, 2.5), E({ tool: 'spray' }, 1.2), E({ tool: 'scraper' }, 0.6), E({ part: SMALL_PARTS }, 1.4), E({ tool: 'oilcan' }, 0.8), E({ cat: 'lamp' }, 0.3)] },
  // a shop's shelves
  shelf: { picks: [2, 5], empty: 0.05, entries: [E({ cat: 'food' }, 4), E({ cat: 'drink' }, 3), E({ cat: 'med' }, 0.6), E({ one: ['crate_supps', 'crate_chem'] }, 0.5), E({ cat: 'wear' }, 0.4), E({ junk: true }, 0.5), E({ tool: 'spray' }, 0.3)] },
  // a filling station's till
  counter: { picks: [2, 4], empty: 0.05, entries: [E({ cat: 'food' }, 3), E({ cat: 'drink' }, 3), E({ one: ['med_bandage', 'med_pain_2'] }, 0.8), E({ tool: 'oilcan' }, 1.0), E({ cat: 'lamp' }, 0.4), E({ tool: 'spray' }, 0.3), E({ one: ['crate_parts'] }, 0.3)] },
  // a kitchen
  cupboard: { picks: [1, 3], empty: 0.1, entries: [E({ cat: 'food' }, 3), E({ cat: 'drink' }, 2), E({ junk: true }, 2), E({ one: ['med_warm_2', 'med_bandage'] }, 0.5)] },
  // a bedroom
  wardrobe: { picks: [1, 3], empty: 0.1, entries: [E({ cat: 'wear' }, 4), E({ cat: 'pack' }, 0.6), E({ one: ['junk_pillow', 'junk_pillow_s', 'junk_ball'] }, 1)] },
  // an office
  desk: { picks: [1, 2], empty: 0.2, entries: [E({ junk: true }, 2), E({ cat: 'med' }, 0.6), E({ cat: 'lamp' }, 0.5), E({ one: ['crate_parts', 'crate_parts_s'] }, 0.6)] },
  // a clinic's cabinet
  medicine: { picks: [1, 3], empty: 0.05, entries: [E({ cat: 'med' }, 4)] },
  // (a wreck's glovebox and boot: in ModCar a wreck is a vehicle with its own things, wrecks.ts)
  glovebox: { picks: [0, 0], empty: 1, entries: [] },
  boot: { picks: [0, 0], empty: 1, entries: [] },
  // an oil drum cut open, a rain barrel
  barrel: { picks: [0, 2], empty: 0.35, entries: [E({ junk: true }, 3), E({ cat: 'crate' }, 1.5), E({ tool: 'jerrycan' }, 0.4)] },
  // on a jetty: somebody's fishing things
  tacklebox: { picks: [1, 2], empty: 0.1, entries: [E({ one: ['junk_rod'] }, 1.5), E({ one: ['food_fish_can', 'food_nuts_old'] }, 1.5), E({ one: ['drink_beer', 'drink_water'] }, 1), E({ cat: 'lamp' }, 0.3)] },
  // in a hide at the edge of a wood
  gamebag: { picks: [1, 2], empty: 0.1, entries: [E({ cat: 'food' }, 2), E({ cat: 'wear' }, 1.5), E({ one: ['drink_spirit', 'drink_water'] }, 1), E({ cat: 'lamp' }, 0.5), E({ one: ['flare_gun'] }, 0.08)] },
  // a garage's shelves and floor: the big parts
  garage: {
    picks: [1, 2],
    empty: 0,
    entries: [
      E({ part: ['engine'] }, 1.0),
      E({ part: ['radiator'] }, 1.2),
      E({ part: ['battery'] }, 1.2),
      E({ part: ['gearbox'] }, 0.8),
      E({ part: ['exhaust'] }, 0.8),
      E({ part: ['rim'] }, 1.3),
      E({ part: ['tire'] }, 1.6),
      E({ part: ['suspension'] }, 0.6),
      E({ part: ['brakes'] }, 0.7),
      E({ part: ['diff'] }, 0.4),
      E({ part: ['turbo'] }, 0.3),
      E({ part: ['seat'] }, 0.5),
      E({ part: ['steering'] }, 0.5),
      E({ part: ['bumperFront', 'bumperRear'] }, 0.6),
      E({ part: ['hood'] }, 0.3),
      E({ part: ['roof'] }, 0.3),
      E({ part: ['fuelTank'] }, 0.4),
      E({ tool: 'jerrycan' }, 0.6),
    ],
  },
  // (a world of version 7 on: docs/V3/plan/finish.md §二 4, §八 1)
  // a place's refrigerator, long without power but shut: what keeps — eggs, a cabbage, a cheese, a joint; drinks
  fridge: { picks: [2, 4], empty: 0.12, entries: [E({ larder: 'fresh' }, 4.5), E({ larder: 'meat' }, 2), E({ cat: 'drink' }, 1.6), E({ cat: 'food' }, 1)] },
  // a camp's cool box
  // (by the water — on a jetty, under a lighthouse — from the fishing's chapter on: what the shore gives, on ice)
  coolbox: { picks: [1, 3], empty: 0.18, entries: [E({ cat: 'drink' }, 2.2), E({ larder: 'fresh' }, 2.4), E({ larder: 'meat' }, 1), E({ cat: 'food' }, 1.2), E({ larder: 'sea' }, 4.5, 75_000, ['jetty', 'lighthouse']), E({ one: ['bait_shrimp'] }, 1.6, 110_000, ['jetty', 'lighthouse']), E({ one: ['bait_squid_strip'] }, 1, 150_000, ['jetty', 'lighthouse'])] },
};

/**
 * The packets of seeds (core/v3/nd/items.ts CROP_INFO; docs/V3/plan/finish.md §八 2: 种子在房子的抽屉、信箱里，高星的种子
 * 越远越多): found from the garden's chapter on in a kitchen's cupboard, a desk's drawer, on a house's mailbox — the
 * plainer ones first, the better further down the road (a pick of a list takes the ones up to its grade)
 */
const SEEDS: readonly string[] = ['tomato', 'potato', 'carrot', 'onion', 'cabbage', 'cucumber', 'corn', 'lettuce', 'garlic', 'pepper', 'eggplant', 'pumpkin', 'broccoli', 'chili', 'strawberry', 'apple', 'watermelon'].map((id) => `nd_seeds_${id}`);

/** how far down the road the first rod is found in a tackle box (m): the fishing's chapter (crafting.ts CHAPTER_KM[5]) */
const ROD_FROM_M = 75_000;

/**
 * A world of version 7's own tables for the kinds that change in it (docs/V3/plan/finish.md §二 4: 钓具箱里出竿和饵): a
 * tackle box has a rod and bait in it from the fishing's chapter on (the bait kept back until one has a rod: kits.ts)
 */
const LOOT_TABLES_V7: Partial<Record<ContainerKind, Table>> = {
  tacklebox: {
    picks: [1, 3],
    empty: 0.1,
    entries: [
      E({ one: ['rod_willow'] }, 1.4, ROD_FROM_M),
      E({ one: ['bait_worm'] }, 2.2, ROD_FROM_M),
      E({ one: ['bait_spoon'] }, 1, 95_000),
      E({ one: ['junk_rod'] }, 1.2),
      E({ one: ['food_fish_can', 'food_nuts_old'] }, 1.3),
      E({ one: ['drink_beer', 'drink_water'] }, 0.9),
      E({ cat: 'lamp' }, 0.3),
    ],
  },
  // a kitchen's cupboard, a desk: as they were, and from the garden's chapter on a packet of seeds now and then
  // (one thing more, not one of its picks: what there is to eat in it stays as much as ever)
  cupboard: { ...LOOT_TABLES.cupboard, also: [{ pick: { one: SEEDS }, chance: 0.22, from: 50_000 }] },
  desk: { ...LOOT_TABLES.desk, also: [{ pick: { one: SEEDS }, chance: 0.16, from: 50_000 }] },
  // a hunter's bag at his stand: as it was, and from the garden's chapter on a joint of what he shot (docs/V3/plan/finish.md §八 1: 鹿肉在猎人小屋)
  gamebag: { picks: [1, 2], empty: 0.1, entries: [E({ cat: 'food' }, 2), E({ cat: 'wear' }, 1.5), E({ one: ['drink_spirit', 'drink_water'] }, 1), E({ cat: 'lamp' }, 0.5), E({ one: ['flare_gun'] }, 0.08), E({ larder: 'game' }, 1.6, 50_000)] },
};

/** from where a garden gone wild behind a house still has something in its bed (m: the garden's chapter, crafting.ts CHAPTER_KM[4]) */
export const BED_FROM_M = 50_000;

// ------------------------------------------------------------------ the rules of what is found, by the world's version

/**
 * How what is found goes with the distance, by the world's version (docs/V3/plan/finish.md §二 4: 档次, 转型). A world
 * made before version 7 is as it always was: better things out to the 100th kilometre, anything anywhere, everything
 * to eat ready to eat.
 */
export interface LootRules extends FindRules {
  readonly version: number;
  /** the best an ingredient may be at s (0: none — the kitchen's chapter has not come) */
  larderTop(s: number): number;
  /** thick clothes (items.ts warmth 7 and over) only from here on (m) — but where the road ahead is cold */
  readonly thickFromM: number;
  /** the share of the picks of food that are something ready to eat at s; the rest are an ingredient that keeps */
  ready(s: number): number;
  /** its own tables for the kinds that have one */
  readonly tables?: Partial<Record<ContainerKind, Table>>;
}

export const LOOT_V6: LootRules = { version: 6, farM: 100_000, top: () => 5, larderTop: () => 0, thickFromM: 0, ready: () => 1 };

/**
 * Version 7's (docs/V3/plan/finish.md §二 4): better things out to the 250th kilometre; a part, a tool, a tin no better
 * than ★2 before the 20th, ★3 to the 60th, ★4 to the 120th; ingredients from the 35th (★1–2), ★3 from the 70th, ★4
 * from the 120th, ★5 from the 170th; thick clothes from the 60th; and what there is to eat less and less ready to
 * eat — all of it to the 35th kilometre, three parts in ten at the 150th and after.
 */
export const LOOT_V7: LootRules = {
  version: 7,
  farM: 250_000,
  top: (s) => (s < 20_000 ? 2 : s < 60_000 ? 3 : s < 120_000 ? 4 : 5),
  larderTop: (s) => (s < 35_000 ? 0 : s < 70_000 ? 2 : s < 120_000 ? 3 : s < 170_000 ? 4 : 5),
  thickFromM: 60_000,
  ready: (s) => (s <= 35_000 ? 1 : s >= 150_000 ? 0.3 : 1 - (0.7 * (s - 35_000)) / 115_000),
  tables: LOOT_TABLES_V7,
};

/** the rules of a world by its version */
export function lootRules(worldVersion: number): LootRules {
  return worldVersion >= 7 ? LOOT_V7 : LOOT_V6;
}

/** what the road is like where a place stands and a little way on, for what its wardrobe holds (docs/V3/plan/finish.md §二 4: 衣柜里的衣服看前方的气候) */
export type Climate = 'mild' | 'cold' | 'hot';

/** the warmth of a garment from which it is a thick one (items.ts: the padded jacket, the lined trousers, the trapper hat and up) */
export const THICK_WARMTH = 7;

// ------------------------------------------------------------------ the larder

/**
 * a shelf of the larder: what keeps in a cupboard (rice, beans, an onion), what wants the cold (eggs, greens, cheese),
 * the meat — and what is no cupboard's: a hunter's game, a shore's shellfish, what still comes up in a garden's bed
 */
export type LarderShelf = 'dry' | 'fresh' | 'meat' | 'game' | 'sea' | 'bed';

interface LarderRow {
  item: string;
  star: number;
  shelf: LarderShelf;
  /** the country it is likelier in (absent: any): a warm one's bananas and oranges, a cold one's potatoes and cabbage */
  likes?: 'hot' | 'cold';
}

const LARDER: LarderRow[] = [];

/**
 * A system's things to cook with among what the places hold (docs/V3/plan/finish.md §八 1), as the system's module is
 * loaded — the kitchen's pantry: each an item, how hard it is to come by (1–5) and the shelf it is found on. With
 * nothing registered a pick of the larder finds nothing, and a place holds what it always did.
 */
export function addLarder(rows: readonly { item: string; star: number; shelf: LarderShelf; likes?: 'hot' | 'cold' }[]): void {
  // (a thing may be on two shelves — a tomato in a refrigerator and in a garden's bed: once on each)
  for (const x of rows) if (!LARDER.some((y) => y.item === x.item && y.shelf === x.shelf)) LARDER.push({ item: x.item, star: x.star, shelf: x.shelf, ...(x.likes ? { likes: x.likes } : {}) });
}

/** the larder as registered (for the tests and the robot traveller) */
export function larder(): readonly { item: string; star: number; shelf: LarderShelf; likes?: 'hot' | 'cold' }[] {
  return LARDER;
}

/** how many of an ingredient are found together: a bag of rice is several meals, a joint one or two */
const LARDER_N: Record<LarderShelf, readonly [number, number]> = { dry: [1, 3], fresh: [1, 3], meat: [1, 2], game: [1, 2], sea: [1, 3], bed: [1, 3] };
/** how much likelier a thing is in the country it likes, and how much less in the other (docs/V3/plan/finish.md §八 1: 食材按地区有偏好) */
const LIKED = 2.6;
const UNLIKED = 0.3;
/** the plainer the likelier: ★1 … ★5 */
const LARDER_W = [1, 0.75, 0.45, 0.25, 0.12];

/** an ingredient of a shelf, no better than `top` stars (null: none registered, or none so plain) */
function larderOf(r: Rng, shelf: LarderShelf, top: number, climate: Climate = 'mild'): Found | null {
  const list = LARDER.filter((x) => x.shelf === shelf && x.star <= top);
  if (!list.length) return null;
  // (by the country: in a warm one or a cold one, what it likes likelier and what the other likes rarer; a mild one has all alike)
  const row = list[r.weighted(list.map((x) => LARDER_W[Math.max(0, Math.min(4, x.star - 1))] * (climate === 'mild' || !x.likes ? 1 : x.likes === climate ? LIKED : UNLIKED)))];
  const [lo, hi] = LARDER_N[shelf];
  return { item: row.item, n: lo + r.int(hi - lo + 1) };
}

/** the junk each sort of place has about it (what its kitchen, its forecourt, its workshop leave) */
const JUNK: Record<string, readonly string[]> = {
  house: ['junk_mug', 'junk_plate', 'junk_pillow', 'junk_pillow_s', 'junk_lamp', 'junk_clockradio', 'junk_chair_wood', 'junk_stool', 'junk_record', 'junk_cage', 'junk_candle', 'junk_box_food', 'junk_ball', 'junk_food_bucket', 'junk_bucket_old', 'junk_tv'],
  station: ['junk_sign', 'junk_cone', 'junk_bucket', 'junk_bin', 'junk_bag', 'junk_bag_s', 'junk_crate_plastic', 'junk_sign_wet', 'junk_mop', 'junk_stool_tall'],
  garage: ['junk_bucket_paint', 'junk_crate_plastic', 'junk_bag', 'junk_bucket', 'junk_stool', 'junk_chair_office', 'junk_lamp', 'junk_clockradio', 'junk_cone', 'junk_mop'],
  shop: ['junk_box_food', 'junk_crate_plastic', 'junk_mug', 'junk_plate', 'junk_bag_s', 'junk_sign_wet', 'junk_mop', 'junk_bin', 'junk_stool_tall'],
  camp: ['junk_chair_fold', 'junk_bucket', 'junk_bag', 'junk_bag_s', 'junk_mug', 'junk_solar_lamp', 'junk_ball', 'junk_crate_plastic', 'junk_food_bucket'],
  jetty: ['junk_rod', 'junk_bucket_old', 'junk_bag_s', 'junk_chair_fold', 'junk_mug'],
  works: ['junk_bucket_paint', 'junk_fax', 'junk_chair_office', 'junk_transceiver', 'junk_lamp', 'junk_bag', 'junk_crate_plastic', 'junk_camera'],
  lighthouse: ['junk_lamp', 'junk_camera', 'junk_clockradio', 'junk_trumpet', 'junk_mug', 'junk_plate', 'junk_pillow_s'],
  // (a world of version 7's motel, a sort of place of its own — sites.ts Site.sort: what its rooms leave)
  motel: ['junk_pillow', 'junk_pillow_s', 'junk_lamp', 'junk_clockradio', 'junk_mug', 'junk_plate', 'junk_candle', 'junk_hanger', 'junk_bag_s', 'junk_bin', 'junk_tv'],
  other: ['junk_bag_s', 'junk_bucket_old', 'junk_crate_plastic', 'junk_mug', 'junk_cone', 'junk_ball'],
};

/** what systems added to the places' junk (addJunk), by the sort of place: read after the place's own */
const ADDED: Record<string, string[]> = {};

/** the junk a sort of place has about it: its own list (the other sorts' for one that has none) with what systems added to it */
export function junkOf(siteKind: string): readonly string[] {
  const own = JUNK[siteKind] ?? JUNK.other;
  const more = ADDED[JUNK[siteKind] ? siteKind : 'other'];
  return more ? MERGED[siteKind] ??= [...own, ...more] : own;
}
/** each sort of place's junk with what was added to it, made when first asked */
const MERGED: Record<string, readonly string[]> = {};

/**
 * A system's kinds among the junk a sort of place has lying about (docs/V3/nodes/M2-rv.md: the coffee maker
 * without its pot, a coffee pot and ground coffee in a house's kitchen), as the system's module is loaded: from
 * then on a place of that sort finds them as often as each of its own. The places' own lists stay as they are,
 * and with nothing added a place finds what it always did.
 */
export function addJunk(siteKind: string, ids: readonly string[]): void {
  (ADDED[siteKind] ??= []).push(...ids);
  for (const k of Object.keys(MERGED)) delete MERGED[k];
}

/** the grade a pick may go up to at s metres down the road: mostly plain things (★0-2), now and then a find (★3-5) */
function gradeRoll(r: Rng, s: number, rules: LootRules = LOOT_V6): number {
  const fo = findOdds(s, rules.farM);
  const g = r.chance(Math.min(0.6, fo.mean / 3)) ? 3 + r.weighted(fo.grades) : r.weighted([0.25, 0.45, 0.3]);
  return Math.min(g, rules.top(s));
}

/** an item of a category, of a grade at most `top` (the better ones as likely as the plain ones under it) */
function itemOf(r: Rng, cat: ItemCat, top: number, rules: LootRules = LOOT_V6, s = 0, climate: Climate = 'mild'): string | null {
  let list: ItemDef[] = BASE_ITEMS.filter((it) => it.cat === cat && it.stars <= Math.max(top, minStars(cat)) && it.carry !== 'large');
  if (cat === 'wear' && rules.version >= 7) {
    // (the cold ahead: whatever is warm, however good — a wardrobe by the snow has a winter coat in it; else thick
    // clothes only from where the rules have them)
    if (climate === 'cold') list = BASE_ITEMS.filter((it) => it.cat === cat && it.carry !== 'large' && (it.stars <= Math.max(top, minStars(cat)) || (it.wear?.warmth ?? 0) >= THICK_WARMTH));
    else if (s < rules.thickFromM) list = list.filter((it) => (it.wear?.warmth ?? 0) < THICK_WARMTH);
    if (!list.length) return null;
    // (and by what the road asks for: the warm ones before the cold, the light ones in the heat)
    if (climate !== 'mild') return list[r.weighted(list.map((it) => (climate === 'cold' ? (it.wear?.warmth ?? 1) ** 2 : (11 - (it.wear?.warmth ?? 5)) ** 2)))].id;
  }
  return list.length ? r.pick(list).id : null;
}

/** the lowest grade a category has (so a category with nothing under ★1 still gives something) */
function minStars(cat: ItemCat): number {
  let m = 9;
  for (const it of BASE_ITEMS) if (it.cat === cat && it.stars < m) m = it.stars;
  return m;
}

/** how likely a part is to be found on a shelf (any frame's: a motorcycle's too), by what it is */
function shelfWeight(p: PartDef): number {
  if (p.tags?.includes('meme')) return 0.2;
  if (p.tags?.includes('apoc')) return 0.4;
  return 1;
}

/** the tyre a rim would be found with */
function tyreFor(rim: string): string | null {
  const d = partDef(rim).rim;
  if (!d?.tire) return null;
  if (rim === 'rim_moto18') return 'tire_moto';
  if (rim === 'rim_truck19' || rim === 'rim_dually') return 'tire_truck';
  if (rim === 'rim_off16') return 'tire_offroad';
  return 'tire_road';
}

/** a part of one of the categories, of a grade by the distance, used but not wrecked */
export function foundPart(r: Rng, cats: readonly string[], s: number, rules: LootRules = LOOT_V6): PartInstance | null {
  const g = Math.max(1, gradeRoll(r, s, rules));
  const cands = PARTS.filter((p) => cats.includes(p.cat));
  if (!cands.length) return null;
  // the grade rolled, else the nearest below, else above
  let pick: PartDef | null = null;
  for (const want of [g, g - 1, g + 1, g - 2, g + 2, g - 3, g + 3, g - 4, g + 4]) {
    const at = cands.filter((p) => partStars(p.id) === want);
    if (!at.length) continue;
    pick = at[r.weighted(at.map(shelfWeight))];
    break;
  }
  if (!pick) return null;
  const inst = newInstance(pick.id, { charge: 0.1 + 0.5 * r.next(), oil: 0.2 + 0.7 * r.next(), coolant: 0.5 * r.next(), tread: 0.25 + 0.65 * r.next() });
  inst.cond = 0.35 + 0.55 * r.next();
  inst.dirt = 0.15 + 0.45 * r.next();
  inst.rust = 0.05 + 0.35 * r.next();
  inst.crust = r.chance(0.4) ? 0.25 * r.next() : 0;
  // (what goes inside a car is clean however it was found: docs/V3/plan/hands.md §五)
  keepInsideClean(inst);
  const t = tyreFor(pick.id);
  if (t) {
    const ti = newInstance(t, { tread: 0.2 + 0.7 * r.next() });
    ti.cond = 0.4 + 0.5 * r.next();
    ti.dirt = 0.2 + 0.5 * r.next();
    fitSub(inst, 'tire', ti);
  }
  return inst;
}

/** a tool as one finds it: a spray can partly used, a jerrycan with a little in it, a worn scraper */
export function foundTool(r: Rng, kind: ToolKind, s: number, rules: LootRules = LOOT_V6): Tool {
  switch (kind) {
    case 'spray': {
      const g = gradeRoll(r, s, rules);
      const tier: 1 | 2 | 3 = g >= 4 ? 3 : g >= 2 && r.chance(0.6) ? 2 : 1;
      const colour = tier === 2 ? r.int(PALETTE.length) : r.pick(tier === 3 ? BASIC_PAINTS.filter((c) => c !== 9) : BASIC_PAINTS);
      return newTool('spray', { tier, colour, paint: sprayFound(tier, r.next()) });
    }
    case 'scraper': {
      const g = gradeRoll(r, s, rules);
      return newTool('scraper', { tier: g >= 5 ? 3 : g >= 3 ? 2 : 1, life: 0.35 + 0.6 * r.next() });
    }
    case 'jerrycan':
      return newTool('jerrycan', { fuel: r.chance(0.35) ? 'diesel' : 'petrol', litres: Math.round(8 * r.next() * r.next() * 10) / 10 });
    case 'oilcan':
      return newTool('oilcan', { litres: Math.round((0.3 + 3.2 * r.next()) * 10) / 10 });
    case 'bottle':
      return newTool('bottle', { litres: Math.round(4 * r.next() * 10) / 10 });
    default:
      return newTool(kind, { life: 0.4 + 0.6 * r.next() });
  }
}

/**
 * A thing of the plan (schedule.ts) as it is found: an item, a can of petrol or coolant or oil as much in it as the
 * plan says, a spray can as one finds it, a part used but sound
 */
export function foundScheduled(t: ScheduledThing, seed: number, s: number, rules: LootRules = LOOT_V6): Found {
  const r = new Rng(hash2(seed | 0, 0x5ced, 0x91));
  if ('item' in t) {
    // (the supply of tins, further down the road of a world of version 7: as often something that keeps, to cook)
    if (t.food && rules.ready(s) < 1 && !r.chance(rules.ready(s))) {
      const raw = larderOf(r, 'dry', rules.larderTop(s));
      if (raw) return raw;
    }
    return { item: t.item };
  }
  // (a blueprint's place with nobody to say what has been learnt: the first sheet of its chapter — the game asks its
  // own, places.ts)
  if ('blueprint' in t) return { item: blueprintOf((BLUEPRINT_RECIPES.find((x) => x.chapter === t.blueprint && !x.rare) ?? BLUEPRINT_RECIPES[0]).id) };
  if ('part' in t) {
    const inst = newInstance(t.part, { charge: 0.5, oil: 0.8, coolant: 0.5 });
    inst.cond = 0.55 + 0.35 * r.next();
    inst.dirt = 0.15 + 0.35 * r.next();
    // (a panel for a found vehicle: shaped for it)
    if (t.shapeOf) inst.shapeOf = t.shapeOf;
    keepInsideClean(inst);
    return { part: inst };
  }
  if (t.tool === 'spray') return { tool: foundTool(r, 'spray', s, rules) };
  const tool = t.tool === 'jerrycan' ? newTool('jerrycan', { fuel: 'petrol', litres: t.litres ?? 15 }) : newTool(t.tool, { litres: t.litres ?? 3 });
  if (t.tool === 'bottle' && t.coolant) tool.coolant = true;
  return { tool };
}

/**
 * What a container holds: its kind's table, picked so many times, each pick graded by the distance down the road
 * (s, m); the junk the place's own (siteKind). By the rules of the world's version (the table too, where the version
 * has its own of the kind), and by what the road is like there and a little way on (a wardrobe's clothes). The same
 * for the same seed.
 */
export function rollContainer(kind: ContainerKind, seed: number, s: number, siteKind = 'other', rules: LootRules = LOOT_V6, climate: Climate = 'mild'): Found[] {
  const t = rules.tables?.[kind] ?? LOOT_TABLES[kind];
  const r = new Rng(hash2(seed | 0, 0x10c7, 0x5a));
  if (!t.entries.length || r.chance(t.empty)) return [];
  const n = t.picks[0] + r.int(t.picks[1] - t.picks[0] + 1);
  const out: Found[] = [];
  // (an entry that begins further down the road is not in the table yet)
  // (… nor one that is another sort of place's)
  const w = t.entries.map((x) => ((x.from !== undefined && s < x.from) || (x.at && !x.at.includes(siteKind)) ? 0 : x.w));
  for (let i = 0; i < n; i++) {
    const e = t.entries[r.weighted(w)];
    const f = foundOf(r, e.pick, s, siteKind, rules, climate, kind === 'fridge' || kind === 'coolbox' ? 'fresh' : 'dry');
    if (f) out.push(f);
  }
  // (one thing more now and then: asked after its picks, so that they are what they were)
  for (const b of t.also ?? []) {
    if ((b.from !== undefined && s < b.from) || !r.chance(b.chance)) continue;
    const f = foundOf(r, b.pick, s, siteKind, rules, climate);
    if (f) out.push(f);
  }
  return out;
}

/**
 * What a place's container holds of its own: its kind's roll (rollContainer) — none in a prefab building's box for the
 * plan's finds (sites.ts SiteContainer.plan: the building's own things lie at its spots)
 */
export function ownRoll(c: { readonly kind: ContainerKind; readonly seed: number; readonly plan?: boolean }, s: number, siteKind = 'other', rules: LootRules = LOOT_V6, climate: Climate = 'mild'): Found[] {
  return c.plan ? [] : rollContainer(c.kind, c.seed, s, siteKind, rules, climate);
}

/**
 * How much of the places' own food, drink, petrol and oil is still there (docs/V3/plan/growth.md §六 6, J10): an
 * abandoned road — most of what was on the shelves is gone; what is left and the plan's finds (schedule.ts) are what
 * one lives on. Over a hundred kilometres at Nomad Drive's pace of play (10 km an hour: it budgets for it) this is food
 * two and a half times what one eats, water nearly twice what one drinks (no taps on the road yet), on the normal
 * difficulty; the difficulty's supply scales it (DIFFICULTY).
 */
export const PLACES_KEEP = 0.27;

/**
 * How much of what a place's refrigerator or cool box held is still there, on the normal difficulty (against
 * PLACES_KEEP for the rest of its boxes): shut all these years, it was passed over — what a kitchen's cupboard lost
 * to whoever came first, the cold box mostly kept (docs/V3/plan/finish.md §二 4: 冰箱和保温箱里出食材)
 */
export const COLD_KEEP = 0.6;

/** how much of a box's own is still there, by its kind: `keep` the places' (PLACES_KEEP by the difficulty's supply; 1: all of it) */
export function keepOf(kind: ContainerKind, keep: number): number {
  return kind === 'fridge' || kind === 'coolbox' ? Math.min(1, (keep / PLACES_KEEP) * COLD_KEEP) : keep;
}

/** a found thing's key, as the sets know it (kits.ts thingKey): an item's id, `part:` and a part's, `tool:` and a tool's kind */
export function foundKey(f: Found): string {
  return 'item' in f ? f.item : 'part' in f ? `part:${f.part.part}` : `tool:${f.tool.kind}`;
}

/**
 * What a place's container holds of its own as one finds it: its roll by the rules of the world's version and by the
 * road ahead, what is still there of it (thinOut, a cold box's kept better: keepOf), and nothing that is kept back
 * for now (`withheld`: a piece of a set whose earlier pieces have not been picked up — kits.ts); more or less of what
 * one lives on by what one is short of (`factors`: needs.ts supplyFactors). The game's and the robot traveller's.
 */
export function ownFound(c: { readonly kind: ContainerKind; readonly seed: number; readonly plan?: boolean }, s: number, siteKind: string, rules: LootRules, climate: Climate, keep: number, withheld?: (key: string) => boolean, factors?: Stocks): Found[] {
  const all = thinOut(ownRoll(c, s, siteKind, rules, climate), c.seed, keepOf(c.kind, keep), factors);
  return withheld ? all.filter((f) => !withheld(foundKey(f))) : all;
}

/**
 * What a piece of a place's furniture holds inside as one finds it (a world of version 7; docs/V3/plan/finish.md §二 6:
 * 床头柜里的小东西), by the piece and the sort of place: a motel's nightstand — in its drawer none, one or two small
 * things a traveller left (a medicine, a battery, a torch, a pack of film, a tape, a key, something sweet, a compass,
 * an odd or end).
 */
const INSIDE: Readonly<Record<string, Readonly<Record<string, Table>>>> = {
  motel: {
    nd_nightstand: {
      picks: [1, 2],
      empty: 0.3,
      entries: [
        E({ one: ['med_bandage', 'med_pain_2', 'nd_pills'] }, 2.2),
        E({ one: ['nd_battery'] }, 1.1),
        E({ one: ['nd_flashlight'] }, 0.6),
        E({ one: ['nd_film_pack'] }, 0.8),
        E({ one: ['nd_tape_01'] }, 0.6),
        E({ one: ['nd_key_1'] }, 0.5),
        E({ one: ['nd_chocolate_1', 'food_licorice', 'food_nuts_old'] }, 1.4),
        E({ one: ['nd_compass'] }, 0.5),
        E({ one: ['junk_clockradio', 'junk_mug', 'nd_vinyl_01', 'nd_vinyl_05', 'nd_vinyl_08', 'nd_vinyl_11'] }, 1.5),
      ],
    },
  },
};

/**
 * What a piece of furniture standing at a place holds inside (INSIDE), by its seed — the same every time: its roll,
 * no thing twice, what is still there of what one lives on (thinOut: as a box's own, by what one is short of), and
 * nothing that is kept back for now (`withheld`: a piece of a set whose main thing has not been picked up, a new
 * thing of the plan's before its first). Null: this piece holds nothing of its own at a place of this sort (every
 * piece of a world made before version 7).
 */
export function insideFound(item: string, sort: string, seed: number, s: number, rules: LootRules, keep: number, withheld?: (key: string) => boolean, factors?: Stocks): Found[] | null {
  const t = rules.version >= 7 ? INSIDE[sort]?.[item] : undefined;
  if (!t) return null;
  const r = new Rng(hash2(seed | 0, 0x9157, 0x4d));
  if (r.chance(t.empty)) return [];
  const n = t.picks[0] + r.int(t.picks[1] - t.picks[0] + 1);
  const w = t.entries.map((x) => (x.from !== undefined && s < x.from ? 0 : x.w));
  const all: Found[] = [];
  for (let i = 0; i < n; i++) {
    const f = foundOf(r, t.entries[r.weighted(w)].pick, s, sort, rules);
    if (f && 'item' in f && hasItem(f.item) && !all.some((x) => 'item' in x && x.item === f.item)) all.push(f);
  }
  const left = thinOut(all, seed, keep, factors);
  return withheld ? left.filter((f) => !withheld(foundKey(f))) : left;
}

/** is it one of what one lives on: food (what fills one), drink, a can of petrol or of oil — the medicines are not */
export function isConsumable(f: Found): boolean {
  if ('item' in f) {
    if (!hasItem(f.item)) return false;
    const d = ITEMS_BY_ID(f.item);
    // (what is to cook with is food as much as a tin is, raw or not: rice went off the shelves with the beans)
    return (!!d.eat && d.eat.food > 0) || (!!d.drink && !d.drink.empty) || !!d.tags?.includes('ingredient');
  }
  if ('tool' in f) return f.tool.kind === 'jerrycan' || f.tool.kind === 'oilcan';
  return false;
}

/** what of a container's roll is still there: its consumables thinned out to `keep` (the rest as rolled), the same every time */
export function thinOut(found: Found[], seed: number, keep: number, factors?: Stocks): Found[] {
  if (keep >= 1 && !factors) return found;
  const r = new Rng(hash2(seed | 0, 0x7417, 0x2c));
  if (!factors) return found.filter((f) => !isConsumable(f) || r.next() < keep);
  // (by what one is short of: needs.ts — more of it still there, or less; what was never thinned — a tyre kit, a
  // medicine — only less, where one has plenty)
  const r2 = new Rng(hash2(seed | 0, 0x7419, 0x2e));
  return found.filter((f) => {
    const need = needOf(f);
    const k = need ? factors[need] : 1;
    if (isConsumable(f)) return keep * k >= 1 ? (r.next(), true) : r.next() < keep * k;
    return k >= 1 || r2.next() < k;
  });
}

/** is a thing lying about still there: a consumable one only so often (as the boxes' are), the same every time */
export function looseKept(f: Found, seed: number, keep: number, factors?: Stocks): boolean {
  if (!factors) return keep >= 1 || !isConsumable(f) || new Rng(hash2(seed | 0, 0x7418, 0x2d)).next() < keep;
  const need = needOf(f);
  const k = need ? factors[need] : 1;
  const u = new Rng(hash2(seed | 0, 0x7418, 0x2d)).next();
  return isConsumable(f) ? u < keep * k : k >= 1 || u < k;
}

/** a place's containers as the plan sees them: where they are on the road and what sort of place it is */
interface PlanSite {
  readonly s: number;
  readonly kind: string;
  readonly containers: readonly { readonly kind: ContainerKind; readonly seed: number; readonly plan?: boolean }[];
}

/**
 * The boxes of a place the plan's finds (schedule.ts) go in: its own containers — a wreck's glovebox and boot are the
 * wreck's (wrecks.ts: the places never open them)
 */
export function planBoxes<C extends PlanSite['containers'][number]>(site: { readonly containers: readonly C[] }): C[] {
  // (nor a refrigerator, nor a cool box: what is in those is to eat and to drink)
  return site.containers.filter((c) => c.kind !== 'glovebox' && c.kind !== 'boot' && c.kind !== 'fridge' && c.kind !== 'coolbox');
}

/**
 * A place with no box of its own for the plan's finds but a wreck by the road: the ground by the wreck's door takes
 * what may lie by the road (schedule.ts PlanPlace.ground; places.ts lays them there)
 */
export function planGround(site: { readonly containers: PlanSite['containers']; readonly objects: readonly { readonly kind: string }[] }): boolean {
  return !planBoxes(site).length && site.objects.some((o) => o.kind === 'wreck');
}

/** how many things a box of a kind holds before it is full (the plan's finds go where there is the most room) */
const BOX_ROOM: Partial<Record<ContainerKind, number>> = { shelf: 6, counter: 5, crate: 4, cupboard: 4, wardrobe: 4, garage: 3, barrel: 2, toolbox: 2, desk: 2, medicine: 1, tacklebox: 1, gamebag: 1, fridge: 4, coolbox: 3 };

/** the small boxes: nothing bigger than a hand goes in them while a bigger box is there */
const SMALL_BOXES: ReadonlySet<ContainerKind> = new Set<ContainerKind>(['toolbox', 'desk', 'medicine', 'tacklebox', 'gamebag']);

/** is a planned thing bigger than a hand (a coffee machine, a stove, a chair, a part)? */
function bigThing(t: ScheduledThing): boolean {
  if ('part' in t) return true;
  return 'item' in t && hasItem(t.item) && ITEMS_BY_ID(t.item).carry !== 'small';
}

/**
 * Which of a place's boxes (planBoxes) each of its planned finds goes in: the one with the most room left for it — what
 * it holds of its own and the finds put in it already against how much a box of its kind holds; what is bigger than a
 * hand not in a small box while a bigger one is there; the first on a tie. The same every time.
 */
export function boxesOfFinds(site: PlanSite, finds: readonly { readonly thing: ScheduledThing }[], rules: LootRules = LOOT_V6): number[] {
  const boxes = planBoxes(site);
  if (!boxes.length) return [];
  const count = boxes.map((c) => ownRoll(c, site.s, site.kind, rules).length);
  const room = boxes.map((c) => BOX_ROOM[c.kind] ?? 2);
  const anyBig = boxes.some((c) => !SMALL_BOXES.has(c.kind));
  const out: number[] = [];
  for (const f of finds) {
    const big = bigThing(f.thing) && anyBig;
    let best = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (big && SMALL_BOXES.has(boxes[i].kind)) continue;
      if (best < 0 || (count[i] + 1) / room[i] < (count[best] + 1) / room[best]) best = i;
    }
    out.push(best);
    count[best]++;
  }
  return out;
}

function foundOf(r: Rng, p: Pick, s: number, siteKind: string, rules: LootRules = LOOT_V6, climate: Climate = 'mild', shelf: LarderShelf = 'dry'): Found | null {
  if ('cat' in p) {
    // (further down the road of a world of version 7 some of what there is to eat is not ready to eat but to cook:
    // an ingredient in its place, of the shelf the box is — one that keeps, in a cupboard; one that wants the cold, in
    // a refrigerator — where the kitchen has registered any so plain)
    if (p.cat === 'food' && rules.ready(s) < 1 && !r.chance(rules.ready(s))) {
      const raw = larderOf(r, shelf, rules.larderTop(s), climate);
      if (raw) return raw;
    }
    const id = itemOf(r, p.cat, gradeRoll(r, s, rules), rules, s, climate);
    return id ? { item: id } : null;
  }
  if ('larder' in p) return larderOf(r, p.larder, rules.larderTop(s), climate);
  if ('one' in p) {
    // (the better of a list further on: a pick of grade g takes the ones up to it)
    const g = gradeRoll(r, s, rules);
    const ok = p.one.filter((id) => (ITEMS.find((it) => it.id === id)?.stars ?? 0) <= Math.max(g, 1));
    return { item: r.pick(ok.length ? ok : p.one) };
  }
  if ('junk' in p) return { item: r.pick(junkOf(siteKind)) };
  if ('tool' in p) return { tool: foundTool(r, p.tool, s, rules) };
  const part = foundPart(r, p.part, s, rules);
  return part ? { part } : null;
}

/**
 * A thing lying in plain sight at a place (the world's own list names the old game's things: sites.ts `loose`):
 * what it is in ModCar — a tyre, a jerrycan, an oil can, food, a drink, a battery; the rest junk of the place's
 * sort, to recycle. Null: nothing (bait, ammunition).
 * A kind of ModCar's own (an id without a dot: the old game's all have one) is itself — a prefab building's
 * furniture and what lies on it (core/world/prefabs.ts, docs/ND/PLAN.md).
 * A world of version 7 (docs/V3/plan/finish.md §二 4, §八 1): an ingredient lying at a place is not there before the
 * road allows one so hard to come by (a cabin's steak waits for the 70th kilometre as a refrigerator's does); and a
 * garden's bed behind a house (`plot.bed`, and the potatoes the old game left on it) still has a vegetable or two in
 * it from the garden's chapter on — by the country's warmth (`climate`).
 */
export function looseFound(old: string, seed: number, s: number, siteKind: string, rules: LootRules = LOOT_V6, climate: Climate = 'mild'): Found | null {
  if (!old.includes('.') && hasItem(old)) {
    if (rules.version >= 7 && ITEMS_BY_ID(old).tags?.includes('ingredient')) {
      const row = LARDER.find((x) => x.item === old);
      if (rules.larderTop(s) < (row ? row.star : 1)) return null;
    }
    return { item: old };
  }
  const r = new Rng(hash2(seed | 0, 0x1005e, 0x77));
  const head = old.split('.')[0];
  if (old === 'plot.bed' || (old === 'food.potato' && rules.version >= 7 && s >= BED_FROM_M)) return rules.version >= 7 && s >= BED_FROM_M ? larderOf(r, 'bed', rules.larderTop(s), climate) : null;
  // (a packet of seeds left on a house's mailbox: the plainer the likelier, the better further on)
  if (old === 'plot.seeds') {
    if (rules.version < 7 || s < BED_FROM_M) return null;
    const g = gradeRoll(r, s, rules);
    const known = SEEDS.filter((id) => hasItem(id));
    const ok = known.filter((id) => ITEMS_BY_ID(id).stars <= Math.max(g, 1));
    return known.length ? { item: r.pick(ok.length ? ok : known) } : null;
  }
  if (old.startsWith('tyre.')) {
    const t = newInstance('tire_road', { tread: 0.15 + 0.6 * r.next() });
    t.cond = 0.4 + 0.5 * r.next();
    t.dirt = 0.3 + 0.5 * r.next();
    t.flat = r.chance(0.2);
    return { part: t };
  }
  if (old === 'fuel.jerrycan') return { tool: foundTool(r, 'jerrycan', s, rules) };
  if (old === 'fuel.oil') return { tool: foundTool(r, 'oilcan', s, rules) };
  if (old === 'fuel.drum') return { item: 'junk_barrel' };
  if (old === 'part.battery.1') {
    const b = foundPart(r, ['battery'], s, rules);
    return b ? { part: b } : null;
  }
  if (head === 'part' || old === 'tool.wrench') return { item: r.pick(['crate_parts', 'crate_parts_s']) };
  if (old === 'tool.jack') return { item: 'junk_jack' };
  if (head === 'food') {
    // (as in a cupboard: further down the road of a world of version 7, as often something to cook)
    if (rules.ready(s) < 1 && !r.chance(rules.ready(s))) {
      const raw = larderOf(r, 'dry', rules.larderTop(s));
      if (raw) return raw;
    }
    return { item: itemOf(r, 'food', gradeRoll(r, s, rules)) ?? 'food_chips' };
  }
  if (head === 'drink') return { item: itemOf(r, 'drink', gradeRoll(r, s, rules)) ?? 'drink_water' };
  if (head === 'bait' || head === 'ammo' || head === 'spice') return null;
  return { item: r.pick(junkOf(siteKind)) };
}

/** a filling station's tank (its old petrol, sites.ts SiteFuel): the litres of petrol and diesel its pumps give */
export function stationFuel(litres: number, seed: number): { petrol: number; diesel: number } {
  const r = new Rng(hash2(seed | 0, 0xf0e1, 0x3));
  return { petrol: Math.round(30 + litres * 4 * (0.8 + 0.4 * r.next())), diesel: Math.round(20 + litres * 3 * (0.6 + 0.8 * r.next())) };
}

/** what a container is called */
export const CONTAINER_NAMES: Record<ContainerKind, string> = {
  crate: '木箱',
  toolbox: '工具箱',
  shelf: '货架',
  counter: '柜台',
  cupboard: '橱柜',
  wardrobe: '衣柜',
  desk: '书桌',
  medicine: '药柜',
  glovebox: '手套箱',
  boot: '后备箱',
  barrel: '铁桶',
  tacklebox: '钓具箱',
  gamebag: '猎包',
  garage: '零件架',
  fridge: '冰箱',
  coolbox: '保温箱',
};

/** what a search sounds like by the container (foley.ts rummage's material: a crate's lid prised up on its nails) */
export const CONTAINER_MATERIAL: Record<ContainerKind, 'wood' | 'crate' | 'metal' | 'cloth' | 'card'> = {
  crate: 'crate',
  toolbox: 'metal',
  shelf: 'card',
  counter: 'card',
  cupboard: 'wood',
  wardrobe: 'cloth',
  desk: 'wood',
  medicine: 'metal',
  glovebox: 'card',
  boot: 'metal',
  barrel: 'metal',
  tacklebox: 'metal',
  gamebag: 'cloth',
  garage: 'metal',
  fridge: 'metal',
  coolbox: 'card',
};
