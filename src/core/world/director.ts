/**
 * The director of the second world version (docs/V3/nodes/W1-worldgen.md): what each stretch of a region is
 * for. A region runs for six to eight stretches (slots of 1,250 m, dealt by dealer.ts); the director gives
 * every stretch its part in the region's programme, from the region's data and hashes alone:
 *
 *   - one quiet run of two stretches in every region after the first (no place, no lake, no bridge, no
 *     landmark: a few minutes of just driving), never at the region's first or last stretch;
 *   - the stretches that hold the region's anchored landforms (tower clusters, buttes, cones: features.ts),
 *     as many as the region's recipe asks, never in the quiet run nor in the region's first stretch;
 *   - (later nodes) the stretch of a wonder, the gate at a border, grade and curve classes.
 *
 * It does not read the road's geometry: the road, the water and the landforms read the programme. So the
 * order in which the world is asked can never matter here.
 *
 * The world's rules load this file (rules.ts names `quietRun`), so it knows the chapter plan and the rules
 * by their types and loads nothing of the road or the land to run.
 */
import { hash2 } from '../math/rng';
import type { QuietRule } from './rules';
import type { ChapterPlan } from './spine';

/** one region as the director sees it: where it lies in stretches, and how many anchored landforms it wants */
export interface RegionRun {
  /** the chapter's index along the road */
  readonly chapter: number;
  /** its first stretch and the one after its last */
  readonly k0: number;
  readonly k1: number;
  /** how many of its stretches hold an anchored landform */
  readonly features: number;
}

const SALT_QUIET = 0x0d21;
const SALT_FEATURE = 0x0d22;

/** the first stretch of the quiet run of a region (the run is this one and the next); −1: it has none */
export function quietStart(seed: number, run: RegionRun): number {
  const n = run.k1 - run.k0;
  // the first region is the journey's beginning: places all the way; and a region too short has no room
  if (run.chapter < 1 || n < 5) return -1;
  // the run lies within [k0 + 1, k1 − 1): its first stretch is one of n − 3
  const h = hash2(run.chapter | 0, SALT_QUIET, seed | 0) >>> 8;
  return run.k0 + 1 + (h % (n - 3));
}

/** is stretch k of this region one of its quiet two? */
export function isQuiet(seed: number, run: RegionRun, k: number): boolean {
  const q = quietStart(seed, run);
  return q >= 0 && (k === q || k === q + 1);
}

/**
 * The stretches of a region that hold an anchored landform, in road order: `run.features` of them (fewer
 * when the region has no room), none in the quiet run, none in the first stretch (the country changes
 * there), spread over the region and not bunched: the candidates are taken in an order the hash shuffles,
 * and one next to a stretch already taken is passed over while others remain.
 */
export function featureSlots(seed: number, run: RegionRun): number[] {
  const want = run.features;
  if (want <= 0) return [];
  const q = quietStart(seed, run);
  const cand: number[] = [];
  for (let k = run.k0 + 1; k < run.k1; k++) if (q < 0 || (k !== q && k !== q + 1)) cand.push(k);
  // a shuffle by hash (Fisher-Yates with a hash per step: the same for the same region and seed)
  for (let i = cand.length - 1; i > 0; i--) {
    const j = (hash2(run.chapter * 64 + i, SALT_FEATURE, seed | 0) >>> 8) % (i + 1);
    const t = cand[i];
    cand[i] = cand[j];
    cand[j] = t;
  }
  const out: number[] = [];
  const near = (k: number): boolean => out.some((o) => Math.abs(o - k) <= 1);
  for (const k of cand) if (out.length < want && !near(k)) out.push(k);
  for (const k of cand) if (out.length < want && !out.includes(k)) out.push(k);
  return out.sort((a, b) => a - b);
}

/** is stretch k of this region one that holds an anchored landform? */
export function isFeatureSlot(seed: number, run: RegionRun, k: number): boolean {
  return featureSlots(seed, run).includes(k);
}

/**
 * The region stretch k lies in, as the director sees it, read off a chapter plan of version 2: there every
 * chapter is a whole number of stretches, so its first stretch and the one after its last are its borders
 * divided by the length of a stretch. `features` is how many of its stretches the region wants a cluster
 * of anchored landforms in (RegionDef.featureSlots).
 */
export function runAt(plan: ChapterPlan, k: number, features = 0): RegionRun {
  const slot = plan.rules.slot;
  const c = plan.chapterAt((k + 0.5) * slot);
  return { chapter: c, k0: Math.round(plan.starts[c] / slot), k1: Math.round(plan.starts[c + 1] / slot), features };
}

/** the quiet rule of world version 2 (rules.ts QuietRule): the two stretches of the quiet run of the region stretch k lies in; the journey's first region has none */
export const quietRun: QuietRule = (plan, seed, k) => k >= 0 && isQuiet(seed, runAt(plan, k), k);
