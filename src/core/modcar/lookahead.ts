/**
 * Looking down the road (docs/V3/plan/finish.md §二 4: 看前方). A world is made by its seed: what lies ahead of a place
 * is known when the place is laid. So —
 *
 *   - what a wardrobe holds goes with the road from there on: warm things where the cold begins within ten kilometres,
 *     light ones before the heat (loot.ts Climate);
 *   - before the road comes into the snow's country there is a thick coat to be had, within three kilometres of the
 *     border; before the desert's, a big bottle of water;
 *   - before a long way with nowhere a can of petrol could stand — four kilometres and more without a place that has
 *     a box of its own or a wreck's ground — there is one at the last such place before it.
 *
 * Pure data and maths: the game hands in the world's regions along its road and its places as the plan sees them, and
 * gets finds to add to the plan (schedule.ts PlannedFind).
 */
import { hash2, Rng } from '../math/rng';
import { BIOMES } from '../world/biomes';
import type { PlaceSort } from '../world/sites';
import type { Climate } from './loot';
import { takesSorts, type PlannedFind, type PlanPlace } from './schedule';

/** what of a world's plan of regions is asked (core/world/spine.ts ChapterPlan) */
export interface RoadPlan {
  chapterAt(s: number): number;
  biomeOf(c: number): number;
  readonly starts: readonly number[];
}

/** a stretch of the road through one region: from where to where (m), and what it is to one out in it */
export interface RoadRegion {
  from: number;
  to: number;
  /** the snow's country (its kin the cold's) */
  snow: boolean;
  /** the desert's */
  desert: boolean;
  climate: Climate;
}

/** by day colder than this (°C) a region is cold, whatever its kin; a desert as warm as this by day is hot */
const COLD_DAY = 8;
const HOT_DAY = 26;

/** the regions of a world's road from its start to `toM` (m), in road order */
export function regionsAlong(plan: RoadPlan, toM: number): RoadRegion[] {
  plan.chapterAt(toM);
  const out: RoadRegion[] = [];
  for (let c = 0; plan.starts[c] < toM; c++) {
    const b = BIOMES[plan.biomeOf(c)];
    const snow = b.kin === 'alpine';
    const desert = b.kin === 'desert';
    out.push({ from: plan.starts[c], to: plan.starts[c + 1], snow, desert, climate: snow || b.tempDay <= COLD_DAY ? 'cold' : desert && b.tempDay >= HOT_DAY ? 'hot' : 'mild' });
  }
  return out;
}

/** how far ahead of a place its wardrobe looks (m) */
export const CLIMATE_AHEAD_M = 10_000;

/**
 * What the road is like at a point of it and on from there: cold where it is in the cold or comes into it within
 * `ahead` metres, else hot likewise, else mild
 */
export function climateAhead(regions: readonly RoadRegion[], s: number, ahead = CLIMATE_AHEAD_M): Climate {
  let hot = false;
  for (const r of regions) {
    if (r.to <= s || r.from > s + ahead) continue;
    if (r.climate === 'cold') return 'cold';
    if (r.climate === 'hot') hot = true;
  }
  return hot ? 'hot' : 'mild';
}

/** how near before a border its thing is to be had (m), and how far back the last place with a box may be when there is none so near */
export const BEFORE_BORDER_M = 3000;
const FAR_BACK_M = 8000;
/** not again for this far after a border that had its thing (m): a road in and out of the snow has one coat, not five */
const COAT_AGAIN_M = 30_000;
const WATER_AGAIN_M = 15_000;
/**
 * A way with nowhere a can could stand as long as this (m) has a can of petrol before it. (The plan's word is six
 * kilometres; its promise is never more than eight without petrol to be had — and the plan's own cans come up to
 * four kilometres apart: one that falls due just past the last place before four kilometres of nothing would leave
 * eight and more. So: four.)
 */
export const LONG_WAY_M = 4000;

/** the thick coat, the big bottle of water */
export const AHEAD_COAT = 'wear_padded';
export const AHEAD_WATER = 'drink_water';

// (a motel before the pass or the desert: a coat left on a hook, a big bottle by a bed)
const COAT_PLACES: readonly PlaceSort[] = ['house', 'shop', 'camp', 'hide', 'motel'];
const WATER_PLACES: readonly PlaceSort[] = ['shop', 'station', 'house', 'camp', 'motel'];

/**
 * The finds the road ahead asks for (docs/V3/plan/finish.md §二 4: 看前方), from `fromM` on (the first chapter is mild
 * country): a thick coat at the last place of a home's sort within three kilometres before the road comes into the
 * snow's country (none so near: the last place with a box of its own there, or failing that within eight); a big
 * bottle of water likewise before the desert's; a can of petrol at the last place that can hold one before a way of
 * LONG_WAY_M and more with none (this one from the start of the road, whatever `fromM`). `places` the world's in
 * road order, `regions` its road's.
 */
export function lookAheadFinds(seed: number, regions: readonly RoadRegion[], places: readonly PlanPlace[], fromM = 12_000): PlannedFind[] {
  const out: PlannedFind[] = [];
  /** the place a border's thing is put at: the last of its sorts within BEFORE_BORDER_M of it, else the last with a box there, else the last with a box within FAR_BACK_M */
  const before = (at: number, sorts: readonly PlaceSort[]): { p: PlanPlace; sort: boolean } | null => {
    let own: PlanPlace | null = null;
    let near: PlanPlace | null = null;
    let far: PlanPlace | null = null;
    for (const p of places) {
      if (p.s >= at) break;
      if (p.boxes <= 0 || !takesSorts(p.kind, sorts)) continue;
      if (p.s >= at - BEFORE_BORDER_M) {
        near = p;
        if (sorts.includes(p.kind)) own = p;
      } else if (p.s >= at - FAR_BACK_M) far = p;
    }
    return own ? { p: own, sort: true } : near ? { p: near, sort: false } : far ? { p: far, sort: false } : null;
  };
  let coatAt = -Infinity;
  let waterAt = -Infinity;
  for (let i = 1; i < regions.length; i++) {
    const r = regions[i];
    const prev = regions[i - 1];
    if (r.from < fromM) continue;
    if (r.snow && !prev.snow && r.from - coatAt >= COAT_AGAIN_M) {
      const at = before(r.from, COAT_PLACES);
      if (at) {
        out.push({ entry: 'ahead:coat', thing: { item: AHEAD_COAT }, s: at.p.s - 0.5, novelty: false, themes: COAT_PLACES, ...(at.sort ? {} : { any: true as const }) });
        coatAt = r.from;
      }
    }
    if (r.desert && !prev.desert && r.from - waterAt >= WATER_AGAIN_M) {
      const at = before(r.from, WATER_PLACES);
      if (at) {
        out.push({ entry: 'ahead:water', thing: { item: AHEAD_WATER }, s: at.p.s - 0.5, novelty: false, themes: WATER_PLACES, ...(at.sort ? {} : { any: true as const }) });
        waterAt = r.from;
      }
    }
  }
  // a long way with nowhere a can could stand (no place with a box of its own nor a wreck's ground): one at the last
  // such place before it
  let last: PlanPlace | null = null;
  places.forEach((p, i) => {
    if (p.boxes <= 0 && !p.ground) return;
    // (from the first place on: the first chapter has its long ways too)
    if (last && p.s - last.s >= LONG_WAY_M) {
      const r = new Rng(hash2(seed | 0, 0xa4ead, i));
      // (enough for the way and well beyond: seven to eleven litres, thirty kilometres and more)
      out.push({ entry: 'ahead:fuel', thing: { tool: 'jerrycan', litres: Math.round((7 + 4 * r.next()) * 10) / 10 }, s: last.s - 0.5, novelty: false });
    }
    last = p;
  });
  return out.sort((a, b) => a.s - b.s);
}
