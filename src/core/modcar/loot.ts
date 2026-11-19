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
import { partStars } from './crafting';
import { BASE_ITEMS, ITEMS, type ItemCat, type ItemDef } from './items';
import { BASIC_PAINTS, PALETTE } from './palette';
import { sprayFound } from './paint';
import { PARTS, partDef } from './parts';
import { newTool, type Tool, type ToolKind } from './tools';
import type { PartDef, PartInstance } from './types';
import { findOdds } from './wrecks';

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
  | { part: readonly string[] };

interface Entry {
  pick: Pick;
  w: number;
}

interface Table {
  /** how many things (each a pick) */
  picks: readonly [number, number];
  /** the chance of nothing at all (somebody was here first) */
  empty: number;
  entries: readonly Entry[];
}

const E = (pick: Pick, w: number): Entry => ({ pick, w });

/** the small parts a toolbox keeps */
const SMALL_PARTS = ['ignition', 'horn', 'gearLever', 'handbrake', 'headlight', 'taillight', 'mirror', 'radio'];

export const LOOT_TABLES: Record<ContainerKind, Table> = {
  // a crate by the verge or at a lay-by: whatever was packed and never fetched
  crate: { picks: [1, 3], empty: 0.15, entries: [E({ junk: true }, 3), E({ cat: 'crate' }, 2.5), E({ cat: 'food' }, 1.5), E({ cat: 'drink' }, 1.2), E({ cat: 'wear' }, 0.8), E({ tool: 'spray' }, 0.5), E({ cat: 'gear' }, 0.25), E({ tool: 'bottle' }, 0.3)] },
  // a workshop's drawers
  toolbox: { picks: [1, 3], empty: 0.05, entries: [E({ cat: 'crate' }, 2.5), E({ tool: 'spray' }, 1.2), E({ tool: 'scraper' }, 0.6), E({ one: ['repair_1', 'repair_2', 'repair_3'] }, 1), E({ part: SMALL_PARTS }, 1.4), E({ tool: 'oilcan' }, 0.8), E({ tool: 'sponge' }, 0.3), E({ tool: 'brush' }, 0.4), E({ cat: 'lamp' }, 0.3)] },
  // a shop's shelves
  shelf: { picks: [2, 5], empty: 0.05, entries: [E({ cat: 'food' }, 4), E({ cat: 'drink' }, 3), E({ cat: 'med' }, 0.6), E({ one: ['crate_supps', 'crate_chem'] }, 0.5), E({ cat: 'wear' }, 0.4), E({ junk: true }, 0.5), E({ tool: 'spray' }, 0.3)] },
  // a filling station's till
  counter: { picks: [2, 4], empty: 0.05, entries: [E({ cat: 'food' }, 3), E({ cat: 'drink' }, 3), E({ one: ['med_pain_1', 'med_pain_2'] }, 0.8), E({ tool: 'oilcan' }, 1.0), E({ cat: 'lamp' }, 0.4), E({ tool: 'spray' }, 0.3), E({ one: ['crate_parts'] }, 0.3)] },
  // a kitchen
  cupboard: { picks: [1, 3], empty: 0.1, entries: [E({ cat: 'food' }, 3), E({ cat: 'drink' }, 2), E({ junk: true }, 2), E({ one: ['med_warm_1', 'med_warm_2', 'med_pain_1'] }, 0.5)] },
  // a bedroom
  wardrobe: { picks: [1, 3], empty: 0.1, entries: [E({ cat: 'wear' }, 4), E({ cat: 'pack' }, 0.6), E({ one: ['junk_pillow', 'junk_pillow_s', 'junk_ball', 'junk_vinyl'] }, 1)] },
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
};

/** the junk each sort of place has about it (what its kitchen, its forecourt, its workshop leave) */
const JUNK: Record<string, readonly string[]> = {
  house: ['junk_mug', 'junk_plate', 'junk_pillow', 'junk_pillow_s', 'junk_lamp', 'junk_clockradio', 'junk_chair_wood', 'junk_stool', 'junk_record', 'junk_vinyl', 'junk_cage', 'junk_candle', 'junk_coffee', 'junk_box_food', 'junk_ball', 'junk_food_bucket', 'junk_bucket_old', 'junk_tv'],
  station: ['junk_sign', 'junk_cone', 'junk_bucket', 'junk_bin', 'junk_bag', 'junk_bag_s', 'junk_crate_plastic', 'junk_sign_wet', 'junk_mop', 'junk_stool_tall', 'junk_coffee'],
  garage: ['junk_bucket_paint', 'junk_crate_plastic', 'junk_bag', 'junk_bucket', 'junk_stool', 'junk_chair_office', 'junk_lamp', 'junk_clockradio', 'junk_cone', 'junk_mop'],
  shop: ['junk_box_food', 'junk_crate_plastic', 'junk_mug', 'junk_plate', 'junk_bag_s', 'junk_sign_wet', 'junk_mop', 'junk_bin', 'junk_stool_tall'],
  camp: ['junk_chair_fold', 'junk_bucket', 'junk_bag', 'junk_bag_s', 'junk_mug', 'junk_solar_lamp', 'junk_ball', 'junk_crate_plastic', 'junk_food_bucket'],
  jetty: ['junk_rod', 'junk_bucket_old', 'junk_bag_s', 'junk_chair_fold', 'junk_mug'],
  works: ['junk_bucket_paint', 'junk_fax', 'junk_chair_office', 'junk_transceiver', 'junk_lamp', 'junk_bag', 'junk_crate_plastic', 'junk_camera'],
  lighthouse: ['junk_lamp', 'junk_camera', 'junk_clockradio', 'junk_trumpet', 'junk_mug', 'junk_plate', 'junk_pillow_s'],
  other: ['junk_bag_s', 'junk_bucket_old', 'junk_crate_plastic', 'junk_mug', 'junk_cone', 'junk_ball'],
};

/** what systems added to the places' junk (addJunk), by the sort of place: read after the place's own */
const ADDED: Record<string, string[]> = {};

function junkOf(siteKind: string): readonly string[] {
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
function gradeRoll(r: Rng, s: number): number {
  const fo = findOdds(s);
  if (r.chance(Math.min(0.6, fo.mean / 3))) return 3 + r.weighted(fo.grades);
  return r.weighted([0.25, 0.45, 0.3]);
}

/** an item of a category, of a grade at most `top` (the better ones as likely as the plain ones under it) */
function itemOf(r: Rng, cat: ItemCat, top: number): string | null {
  const list: ItemDef[] = BASE_ITEMS.filter((it) => it.cat === cat && it.stars <= Math.max(top, minStars(cat)) && it.carry !== 'large');
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
export function foundPart(r: Rng, cats: readonly string[], s: number): PartInstance | null {
  const g = Math.max(1, gradeRoll(r, s));
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
export function foundTool(r: Rng, kind: ToolKind, s: number): Tool {
  switch (kind) {
    case 'spray': {
      const g = gradeRoll(r, s);
      const tier: 1 | 2 | 3 = g >= 4 ? 3 : g >= 2 && r.chance(0.6) ? 2 : 1;
      const colour = tier === 2 ? r.int(PALETTE.length) : r.pick(tier === 3 ? BASIC_PAINTS.filter((c) => c !== 9) : BASIC_PAINTS);
      return newTool('spray', { tier, colour, paint: sprayFound(tier, r.next()) });
    }
    case 'scraper': {
      const g = gradeRoll(r, s);
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
 * What a container holds: its kind's table, picked so many times, each pick graded by the distance down the road
 * (s, m); the junk the place's own (siteKind). The same for the same seed.
 */
export function rollContainer(kind: ContainerKind, seed: number, s: number, siteKind = 'other'): Found[] {
  const t = LOOT_TABLES[kind];
  const r = new Rng(hash2(seed | 0, 0x10c7, 0x5a));
  if (!t.entries.length || r.chance(t.empty)) return [];
  const n = t.picks[0] + r.int(t.picks[1] - t.picks[0] + 1);
  const out: Found[] = [];
  for (let i = 0; i < n; i++) {
    const e = t.entries[r.weighted(t.entries.map((x) => x.w))];
    const f = foundOf(r, e.pick, s, siteKind);
    if (f) out.push(f);
  }
  return out;
}

function foundOf(r: Rng, p: Pick, s: number, siteKind: string): Found | null {
  if ('cat' in p) {
    const id = itemOf(r, p.cat, gradeRoll(r, s));
    return id ? { item: id } : null;
  }
  if ('one' in p) {
    // (the better of a list further on: a pick of grade g takes the ones up to it)
    const g = gradeRoll(r, s);
    const ok = p.one.filter((id) => (ITEMS.find((it) => it.id === id)?.stars ?? 0) <= Math.max(g, 1));
    return { item: r.pick(ok.length ? ok : p.one) };
  }
  if ('junk' in p) return { item: r.pick(junkOf(siteKind)) };
  if ('tool' in p) return { tool: foundTool(r, p.tool, s) };
  const part = foundPart(r, p.part, s);
  return part ? { part } : null;
}

/**
 * A thing lying in plain sight at a place (the world's own list names the old game's things: sites.ts `loose`):
 * what it is in ModCar — a tyre, a jerrycan, an oil can, food, a drink, a battery; the rest junk of the place's
 * sort, to recycle. Null: nothing (bait, ammunition).
 */
export function looseFound(old: string, seed: number, s: number, siteKind: string): Found | null {
  const r = new Rng(hash2(seed | 0, 0x1005e, 0x77));
  const head = old.split('.')[0];
  if (old.startsWith('tyre.')) {
    const t = newInstance('tire_road', { tread: 0.15 + 0.6 * r.next() });
    t.cond = 0.4 + 0.5 * r.next();
    t.dirt = 0.3 + 0.5 * r.next();
    t.flat = r.chance(0.2);
    return { part: t };
  }
  if (old === 'fuel.jerrycan') return { tool: foundTool(r, 'jerrycan', s) };
  if (old === 'fuel.oil') return { tool: foundTool(r, 'oilcan', s) };
  if (old === 'fuel.drum') return { item: 'junk_barrel' };
  if (old === 'part.battery.1') {
    const b = foundPart(r, ['battery'], s);
    return b ? { part: b } : null;
  }
  if (head === 'part' || old === 'tool.wrench') return { item: r.pick(['crate_parts', 'crate_parts_s']) };
  if (old === 'tool.jack') return { item: 'junk_jack' };
  if (head === 'food') return { item: itemOf(r, 'food', gradeRoll(r, s)) ?? 'food_chips' };
  if (head === 'drink') return { item: itemOf(r, 'drink', gradeRoll(r, s)) ?? 'drink_water' };
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
};
