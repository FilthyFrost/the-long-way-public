/**
 * The relief of a world of version 2 (stage L1 of docs/V3/nodes/L-landscape.md): the hills of the middle
 * distance, the walls of mountain valleys, and the ranges beyond, layer behind layer to the horizon, each as
 * the kind of country a region is says (biomes.ts RegionRelief). terrain.ts adds them to the land; a world of
 * version 1 has none of it.
 *
 *   hills    rounded swells and hills with broad valleys and saddles between, from HILLS_FROM m out (beyond
 *            the verge and the places by the road), whole HILLS_FADE m further. Region by region, blended
 *            like the rest of a region's land over the border between two.
 *   walls    mountain country: a valley floor `floor` m wide on either side of the road, then a wall on each
 *            side climbing ever more steeply to a crest one to three kilometres out, the crest broken into
 *            peaks and cols, spurs coming down the wall, a side valley notching it every few kilometres; the
 *            two walls different. Where the country opens on one side (the low side of a hillside, a ridge:
 *            landform.ts) the wall on that side stands lower and kilometres further back, and the road looks
 *            out over a valley to the ranges beyond: enclosure and vista take turns along the valley.
 *   ranges   the world's own ranges (one shape for the whole world, ridged and crisp, coming and going), as
 *            high as the country is: hundreds of metres over the plains, a few kilometres in the mountains,
 *            rising with the distance so that layer shows behind layer.
 *
 * The walls and the ranges stand kilometres out: how high they are changes from one region to the next over
 * LONG_BLEND m either side of a border (a mountain wall of a kilometre and a half cannot come and go over the
 * nine hundred metres two regions' land is blended over), and where the country opens on one side changes
 * over two stretches (a cubic spline over the stretches' kinds). The walls go by the distance across from the
 * road point of the same x (`dzl`): smooth everywhere, so the valley follows the road's bends.
 *
 * Nothing here asks the land: arithmetic and hashing over (x, z), the road's chapters and the kinds of its
 * stretches only (the landform plan lays those out without the land).
 */
import { fbm1, fbm2, ridged2, simplex2 } from '../math/noise';
import { hash2 } from '../math/rng';
import { smoothstep } from '../math/util';
import { BIOMES } from './biomes';
import type { LandformPlan } from './landform';
import type { ChapterPlan } from './spine';

/** the hills begin this far from the road (m, across it) … */
export const HILLS_FROM = 70;
/** … and are whole at least this much further out (hillsFade) */
export const HILLS_FADE = 160;

/**
 * Over how many metres beyond HILLS_FROM hills `amp` m high come in: a hill rising out of the land beside the
 * road over a short way would be a bank as steep as the hill is high, and stand over the road like a wall,
 * so the higher the hills, the further out they are whole (a slope of a quarter at the most from the coming in
 * alone; seen from the road, a hill country's skyline stays within some twelve degrees).
 */
export function hillsFade(amp: number): number {
  return amp * 6.5 > HILLS_FADE ? amp * 6.5 : HILLS_FADE;
}
/** how far either side of a border between two regions the height of their walls and ranges changes (m; less in short chapters) */
export const LONG_BLEND = 3000;
/** where the country opens on one side, its wall stands this much lower (share) … */
const OPEN_LOWER = 0.75;
/** … and its foot this much further back (m) */
const OPEN_BACK = 3000;
/** the side valleys notching a wall: one in every stretch of this many metres along the valley */
const SIDE_VALLEY = 5200;
/** behind its crest a wall falls this much (share of its height) over BACK_RUN m */
const BACK_FALL = 0.45;
const BACK_RUN = 1600;

/** the shape of the hills, 0 … 1: rounded swells with broad valleys between (crest to crest about `len` m) */
export function hillField(x: number, z: number, seed: number, len: number): number {
  const n = fbm2(x / len, z / len, seed, 2, 2, 0.45);
  const f = smoothstep(-0.5, 0.6, n);
  return f * Math.sqrt(f);
}

/**
 * The shape of the world's ranges, 0 … 1: ridged (crisp crests, valleys between), in great sweeps that come
 * and go so that some horizons are open; ridges some four kilometres apart, broken into peaks and cols.
 */
export function rangeField(x: number, z: number, seed: number): number {
  const m = smoothstep(-0.55, 0.15, fbm2(x / 24000, z / 24000, seed + 1, 2));
  if (m <= 0) return 0;
  const r = ridged2(x / 8500, z / 8500, seed + 2, 4, 2.1, 0.5);
  return m * smoothstep(0.12, 0.85, r);
}

/** the great ranges of the far country begin to rise this far from the road (m) … */
export const GREAT_FROM = 14000;
/** … and stand whole this far out (m) */
export const GREAT_FULL = 32000;

/**
 * The great ranges of the far country (the sample stretch of node L): beyond some fifteen kilometres from the
 * road the land rises into ranges of the continent's own — 1.4 to 4 km high, the belt higher and lower in
 * sweeps of some sixty kilometres, whatever the country by the road — so that a plain too has mountains on its
 * horizon and a mountain valley has more mountains behind its walls, the layers rising with the distance as
 * real horizons do (docs/V3/research/landscape-params.md P2e: a main range 15–35 km out, high mountains
 * 40–80 km). Crisp ridges some nine kilometres apart, spurs and gullies on their upper parts. Over country
 * already high (`under`: what the land rises to there without them) they add half as much at most: a far range
 * stands over the walls, not on top of them.
 */
export function greatRange(x: number, z: number, lat: number, under: number, seed: number): number {
  // Subsidiary ridges climb in front of the main watershed. Their oblique fold axis
  // keeps the spurs overlapping as the valley turns; their saddles reveal the ridge behind.
  const foothill = smoothstep(7800, 16500, lat);
  if (foothill <= 0) return 0;
  const g = smoothstep(GREAT_FROM, GREAT_FULL, lat);
  const belt = 1400 + 2600 * smoothstep(-0.4, 0.5, fbm2(x / 60000, z / 60000, seed, 2));
  const r = ridged2(x / 16000, z / 16000, seed + 1, 3, 2.05, 0.5);
  let h = smoothstep(0.15, 0.9, r);
  h += 0.22 * h * (ridged2(x / 3800, z / 3800, seed + 2, 2) - 0.45);
  const fold = ridged2((x * 0.88 + z * 0.47) / 9500, (z * 0.88 - x * 0.47) / 3800, seed + 3, 2);
  const spur = (360 + belt * 0.24) * smoothstep(0.32, 0.89, fold) * foothill;
  return (belt * g * h + spur) * (1 - 0.5 * smoothstep(1000, 3000, under));
}

/** what the long blend gives at a point of the road: the ranges and the walls of the country there */
export class ReliefMix {
  /** the ranges: how high at their fullest (m), from how far out (m), whole how far out (m) */
  ranges = 0;
  from = 0;
  full = 0;
  /** how fully the country is mountain valley (0 … 1), and its walls' numbers (biomes.ts RegionRelief.walls) */
  walls = 0;
  lo = 0;
  hi = 0;
  floor = 0;
  gentle = 0;
  steep = 0;
  crest = 0;
  /** (how much of the blend is regions with a relief of their own) */
  known = 0;
}

/** the half length of the long blend over the border before chapter c (it is less where a chapter is short) */
function blendLength(plan: ChapterPlan, c: number): number {
  const a = plan.starts[c] - plan.starts[c - 1];
  const b = plan.starts[c + 1] - plan.starts[c];
  return Math.min(LONG_BLEND, 0.4 * (a < b ? a : b));
}

/** one region's share of a long blend */
function addRegion(out: ReliefMix, region: number, w: number): void {
  const R = BIOMES[region].relief;
  if (w <= 0 || !R) return;
  out.known += w;
  out.ranges += R.ranges.amp * w;
  out.from += R.ranges.from * w;
  out.full += R.ranges.full * w;
  const W = R.walls;
  if (!W) return;
  out.walls += w;
  out.lo += W.height[0] * w;
  out.hi += W.height[1] * w;
  out.floor += W.floor * w;
  out.gentle += W.steep[0] * w;
  out.steep += W.steep[1] * w;
  out.crest += W.crest * w;
}

/**
 * The elevation the road drifts back to at arc length s in a world of version 2 (m above the sea): each
 * region's (RegionRelief.base, else its baseElev), blended over the long blend's length either side of a
 * border, so that the road begins its climb into high country kilometres before the country itself begins.
 */
export function baseAt(plan: ChapterPlan, s: number): number {
  const c = plan.chapterAt(s);
  plan.biomeOf(c + 2);
  const wPrev = c > 0 ? 1 - smoothstep(-1, 1, (s - plan.starts[c]) / blendLength(plan, c)) : 0;
  const wNext = smoothstep(-1, 1, (s - plan.starts[c + 1]) / blendLength(plan, c + 1));
  let base = baseOf(plan.biomes[c]) * (1 - wPrev - wNext);
  if (wPrev > 0) base += baseOf(plan.biomes[c - 1]) * wPrev;
  if (wNext > 0) base += baseOf(plan.biomes[c + 1]) * wNext;
  return base;
}

/** a region's base elevation in a world of version 2 */
export function baseOf(region: number): number {
  const b = BIOMES[region];
  return b.relief ? b.relief.base : b.baseElev;
}

/**
 * The ranges and the walls at arc length s: those of the chapter s lies in, blended with the chapter before
 * and the one after over LONG_BLEND m either side of each border (each border its own length, the same seen
 * from both sides). A region without a relief of its own adds nothing.
 */
export function reliefMix(plan: ChapterPlan, s: number, out: ReliefMix): ReliefMix {
  const c = plan.chapterAt(s);
  // (the chapters after this one: the length of the next border needs the start of the one after it)
  plan.biomeOf(c + 2);
  const wPrev = c > 0 ? 1 - smoothstep(-1, 1, (s - plan.starts[c]) / blendLength(plan, c)) : 0;
  const wNext = smoothstep(-1, 1, (s - plan.starts[c + 1]) / blendLength(plan, c + 1));
  out.ranges = out.from = out.full = out.walls = out.lo = out.hi = out.floor = out.gentle = out.steep = out.crest = out.known = 0;
  addRegion(out, plan.biomes[c], 1 - wPrev - wNext);
  if (wPrev > 0) addRegion(out, plan.biomes[c - 1], wPrev);
  if (wNext > 0) addRegion(out, plan.biomes[c + 1], wNext);
  if (out.known > 0) {
    out.from /= out.known;
    out.full /= out.known;
  }
  if (out.walls > 0) {
    const k = 1 / out.walls;
    out.lo *= k;
    out.hi *= k;
    out.floor *= k;
    out.gentle *= k;
    out.steep *= k;
    out.crest *= k;
  }
  return out;
}

/**
 * How open the country is on one side of the road at arc length s, 0 … 1: 1 where a stretch is the low side
 * of a hillside or a ridge, 0 where the land rises or lies level on that side; a cubic spline over the
 * stretches, so that it changes over two of them and never turns a corner.
 * @param side +1 the right of the road, −1 the left
 */
export function openness(land: LandformPlan, slot: number, s: number, side: number): number {
  const u = s / slot - 0.5;
  const i = Math.floor(u);
  const t = u - i;
  const t2 = t * t;
  const t3 = t2 * t;
  const q = 1 - t;
  const v = (q * q * q * land.openOf(i - 1, side) + (3 * t3 - 6 * t2 + 4) * land.openOf(i, side) + (-3 * t3 + 3 * t2 + 3 * t + 1) * land.openOf(i + 1, side) + t3 * land.openOf(i + 2, side)) / 6;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * A mountain valley's wall at a point `dzl` m across from the road point of the same x (positive: the right):
 * its height above the floor (m), before the long blend's share of mountain country is taken.
 * @param open how open the country is on that side (openness)
 */
export function wallAt(x: number, z: number, dzl: number, m: ReliefMix, open: number, seed: number): number {
  const v = dzl < 0 ? -dzl : dzl;
  const floor = m.floor + OPEN_BACK * open;
  if (v <= floor) return 0;
  const side = dzl < 0 ? 0 : 1;
  const sd = seed + side * 0x65;
  // the two walls differ, and each changes along the valley: how high, how steep
  let H = m.lo + (m.hi - m.lo) * (0.5 + 0.5 * fbm1(x / 3400, sd + 1, 2));
  let k = m.gentle + (m.steep - m.gentle) * (0.5 + 0.5 * fbm1(x / 4100, sd + 2, 2));
  // (never so gentle that the crest stands beyond `crest` — the floor pushed back on an open side aside)
  const reach = m.crest - m.floor;
  if (k * reach < H) k = H / reach;
  H *= 1 - OPEN_LOWER * open;
  const run = H / k;
  // spurs come down the wall and gullies go up it: the wall stands forward here and back there — from its
  // foot up (the foot itself stays where the floor ends, so no wall ever comes nearer the road than that)
  const ve = v + 0.16 * run * simplex2(x / 1400, z / 3800, sd + 3) * smoothstep(floor, floor + 0.5 * run, v);
  const u = (ve - floor) / run;
  if (u <= 0) return 0;
  // the crest broken into peaks and cols
  let top = H * (0.82 + 0.3 * ridged2(x / 2600, z / 2600, sd + 4, 2));
  // side valleys: every few kilometres one notches the wall, wide at the crest, narrowing to its mouth
  const uc = u < 1 ? u : 1;
  const cell = Math.floor(x / SIDE_VALLEY);
  let notch = 0;
  for (let i = cell - 1; i <= cell + 1; i++) {
    const h = hash2(i, side, sd + 5);
    const xn = (i + 0.2 + 0.6 * ((h & 0xffff) / 0xffff)) * SIDE_VALLEY;
    const deep = 0.3 + 0.35 * (((h >>> 16) & 0xff) / 255);
    // (wide enough that its sides are never steeper than the wall's own: the deeper the notch, the wider)
    const half = (H * deep * 1.4 > 900 ? H * deep * 1.4 : 900) * (0.45 + 0.55 * uc);
    const dx = x < xn ? xn - x : x - xn;
    if (dx >= half) continue;
    const n = deep * (1 - smoothstep(0, half, dx));
    if (n > notch) notch = n;
  }
  top *= 1 - notch;
  // (the wall's face is not one smooth sweep: spurs stand out of it and gullies are cut into it, over its upper
  // two thirds, a few hundred metres apart — what a matte painter paints the light along)
  if (u < 1) return top * Math.pow(u, 1.7) * (1 + 0.16 * (ridged2(x / 760, z / 760, sd + 7, 3, 2.1, 0.5) - 0.42) * smoothstep(0.25, 0.85, u));
  // behind the crest the land falls to the next valley, where the ranges beyond take over
  return top * (1 - BACK_FALL * smoothstep(0, BACK_RUN, (u - 1) * run));
}
