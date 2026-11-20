/**
 * The emergent Earth's physics (docs/V3/plan/emergent-earth.md §3): from the few slow knobs of a stretch of the
 * road (its Macro state: the warmth of its latitude, its wetness, how continental it is, its height and relief,
 * its rock, its water, what has happened to it lately), what a point at some height in it is like — its warmth by
 * the lapse rate, its wetness with the mountains' rain and their shadows, the cloud a humid mountain wears — and
 * so which ecosystem it is (the card of efg.ts that best fits it, the next best for the edge between two) and which
 * landforms it can show.
 *
 * Pure, deterministic, DOM-free: the director (director.ts) and the world (E1) ask the same questions.
 */
import { LAND_EFGS, WATER_EFGS, type Efg } from './efg';
import { fit, type Context, type Disturb, type SeasonType, type WaterKind } from './kinds';
import { LANDFORMS, type Landform } from './landforms';
import { rock, type RockId } from './rocks';

/** degrees of cooling a metre of height (the standard atmosphere's 6.5 °C a kilometre) */
export const LAPSE = 0.0065;

/** a stretch of the road's slow knobs */
export interface Macro {
  /** the mean yearly warmth at sea level of its latitude (°C, about −18 polar … 28 equatorial) */
  tSea: number;
  /** its wetness, 0 hyper-arid … 1 always wet */
  wet: number;
  /** how far from the sea's tempering, 0 a coast … 1 the heart of a continent */
  cont: number;
  /** its month (1 … 12, as the northern year runs): what season its plants are in */
  month: number;
  /** the road's height (m) and the land's relief about it (m: how high the slopes and peaks in view stand above it) */
  base: number;
  relief: number;
  context: Context;
  rock: RockId;
  water: WaterKind;
  /** how its slopes meet the wet wind: 1 the windward side, −1 the lee, 0 neither */
  windward: number;
  disturb: Disturb;
  /** the landform the director has set here (absent: the plain shapes of its context) */
  landform: string | null;
  /**
   * The patch of its country's mosaic the road goes through (an ecosystem's code): where several fit nearly as
   * well — a wood and its clearings' fields, a savanna and its dry forest, a heath and its bog — the one the
   * director chose for this place, holding wherever it fits at least PATCH_HOLD as well as the best there; and
   * the same for its water (a rocky shore or a reef, a lake or a hot spring). Absent: the best that fits.
   */
  efg?: string | null;
  waterEfg?: string | null;
}

/** a place's patch holds where it fits at least this share as well as the best that fits there … */
export const PATCH_HOLD = 0.5;
/** … and fades into the best over this much less */
const PATCH_FADE = 0.2;

/** the kind of year a climate has, from its warmth, wetness and continentality */
export function seasonOf(tSea: number, wet: number, cont: number): SeasonType {
  if (tSea < -6) return 'polar';
  if (tSea >= 24 && wet >= 0.75) return 'equatorial';
  if (tSea >= 18) return 'monsoon';
  if (tSea >= 13 && wet >= 0.22 && wet <= 0.62 && cont < 0.5) return 'mediterranean';
  if (tSea < 14 && cont < 0.4 && wet >= 0.5) return 'oceanic';
  return 'continental';
}

/** the local mean warmth at height h (°C) */
export function warmthAt(m: Macro, h: number): number {
  return m.tSea - LAPSE * h;
}

/**
 * The year's swing (°C): how much warmer its warmest month is than its mean — a degree in the tropics, six or
 * seven by a temperate sea, thirty in the heart of Siberia (fitted to Singapore, Cairo, Beijing, London, Moscow,
 * Reykjavik, Davos, Yakutsk, Utqiaġvik within a few degrees)
 */
export function swingOf(m: Macro): number {
  const lat = Math.max(0.03, Math.min(1.4, (27 - m.tSea) / 24));
  return lat * (7 + 18 * m.cont);
}

/**
 * The mean warmth of the growing season at height h (°C): the year's mean and most of its swing. Trees stand
 * where it is above 6.4 °C (the treeline, Körner & Paulsen 2004: about the warmest month's 10 °C outside the
 * tropics), the tundra and the alpine below that, the ice where it does not come above freezing.
 */
export function growingAt(m: Macro, h: number): number {
  return warmthAt(m, h) + 0.6 * swingOf(m);
}

/** the warmth of a month at height h (°C): the year's mean and its swing, warmest in July (the northern year) */
export function monthWarmthAt(m: Macro, h: number, month: number): number {
  return warmthAt(m, h) + swingOf(m) * Math.cos((2 * Math.PI * (month - 7)) / 12);
}

/**
 * Does snow lie at height h in a month: where the month's mean is below a degree of frost, or where the growing
 * season never thaws (the snow that stays all year)
 */
export function snowAt(m: Macro, h: number, month: number): boolean {
  return monthWarmthAt(m, h, month) < -1 || growingAt(m, h) < -1.5;
}

/** the warmth of the warmest month at height h (°C): below freezing, the snow of every winter stays — an ice cap */
export function summerAt(m: Macro, h: number): number {
  return warmthAt(m, h) + swingOf(m);
}

/**
 * The local wetness at height h: a humid wind climbing a windward slope rains out as it rises (wetter up to the
 * cloud), what crosses a crest comes down dry (the lee, the rain shadow), and the high cold is drier again.
 */
export function wetnessAt(m: Macro, h: number): number {
  const above = Math.max(0, h - m.base);
  const rise = Math.min(1, above / 1200);
  const oro = m.windward > 0 ? 0.16 * m.windward * rise : 0.1 * m.windward * (1 - 0.5 * rise);
  const cold = h > 3500 ? -Math.min(0.2, (h - 3500) / 6000) : 0;
  return Math.max(0, Math.min(1, m.wet + oro + cold));
}

/**
 * How much a point at height h is in a mountain's cloud, 0 … 1: humid mountains wear a belt of cloud where the
 * rising air cools to its dew point — above the condensation level (some 800 m up a tropical range, 500 m
 * outside the tropics) and between about 7 and 20 °C in the tropics (the cloud forests, up to the treeline's elfin
 * wood), 3 and 12 °C outside them.
 */
export function cloudAt(m: Macro, h: number): number {
  if (m.relief < 400 || m.wet < 0.6) return 0;
  const t = warmthAt(m, h);
  const tropic = m.tSea > 18;
  const [lo, hi] = tropic ? [7, 20] : [3, 12];
  const inBelt = fit(t, [lo - 2, lo, hi, hi + 2]) * fit(h, tropic ? [500, 900, 4000, 4500] : [250, 550, 3000, 3500]);
  return inBelt * Math.min(1, (m.wet - 0.6) / 0.25) * Math.min(1, m.relief / 900);
}

/** how well an ecosystem's card fits a point, 0 … weight: its own fit, times how often it is the one where it fits */
export function fitness(e: Efg, m: Macro, h: number, season = seasonOf(m.tSea, m.wet, m.cont)): number {
  return rawFit(e, m, h, season) * (e.weight ?? 1);
}

/** how well an ecosystem's card fits a point, 0 … 1 (its niche, its kind of year, its needs) */
export function rawFit(e: Efg, m: Macro, h: number, season = seasonOf(m.tSea, m.wet, m.cont)): number {
  const t = warmthAt(m, h);
  const w = wetnessAt(m, h);
  let f = fit(t, e.t) * fit(w, e.m);
  if (f > 0 && e.g) f *= fit(t + 0.6 * swingOf(m), e.g);
  if (f > 0 && e.summer) f *= fit(t + swingOf(m), e.summer);
  // (the ground's own say: fields and pastures want soil, a forest will not stand on salt or gypsum, and on
  // the salt itself — a pan, a crust — hardly anything grows at all)
  if (f > 0) {
    const fertile = rock(m.rock).fertile;
    if (e.struct === 'farmland' || e.code === 'T7.2') f *= Math.min(1, fertile / 0.3);
    else if (fertile < 0.03 && e.cover >= 0.05) f *= 0.08;
    else if (e.cover > 0.3 && fertile < 0.1) f *= 0.2;
  }
  if (f <= 0) return 0;
  if (e.seasons && !e.seasons.includes(season)) f *= 0.15;
  const n = e.needs;
  if (n) {
    if (n.water && !n.water.includes(m.water)) return 0;
    if (n.rocks && !n.rocks.includes(m.rock)) return 0;
    if (n.avoid && n.avoid.includes(m.rock)) return 0;
    if (n.landforms && !(m.landform && n.landforms.includes(m.landform))) return 0;
    if (n.mountain && m.relief < 400) return 0;
    if (n.coastal && m.water !== 'coast' && m.context !== 'coast') return 0;
    // (the alpine: a mountain's heights, or a high plateau's — the cold of height, not of latitude)
    if (n.alpine && m.relief < 400 && h < 1800) return 0;
    if (n.cloud) f *= cloudAt(m, h);
    // (the tropics' edge a band: a tropical card fades out between 20 and 16 °C of sea-level warmth, an extratropical one in between 18 and 22)
    if (n.tropical) f *= fit(m.tSea, [16, 20, 99, 100]);
    if (n.extratropical) f *= fit(m.tSea, [-99, -98, 18, 22]);
    if (f <= 0) return 0;
    if (n.disturb && m.disturb !== n.disturb) return 0;
    if (n.flat && m.relief > 160) f *= 0.2;
    if (n.lowland && (m.relief >= 400 || h > 1200)) f *= 0.2;
  }
  return f;
}

export interface EcoPick {
  efg: Efg;
  fit: number;
  /** the next best, and how far toward it the point lies (0 … 0.5: an ecotone where the two fit nearly as well) */
  second: Efg | null;
  blend: number;
}

/**
 * The land's ecosystem at height h of a stretch: the best fitting card, or the place's own patch (Macro.efg) where
 * that fits nearly as well; and the next, for an ecotone — where two fit nearly as well, or where the patch gives
 * way to the best.
 */
export function ecosystemAt(m: Macro, h: number): EcoPick {
  const season = seasonOf(m.tSea, m.wet, m.cont);
  let best: Efg = LAND_EFGS[0];
  let bf = -1;
  let next: Efg | null = null;
  let nf = -1;
  let top = 0;
  let patch: Efg | null = null;
  let pr = 0;
  for (const e of LAND_EFGS) {
    const raw = rawFit(e, m, h, season);
    if (raw > top) top = raw;
    if (e.code === m.efg) {
      patch = e;
      pr = raw;
    }
    const f = raw * (e.weight ?? 1);
    if (f > bf) {
      next = best;
      nf = bf;
      best = e;
      bf = f;
    } else if (f > nf) {
      next = e;
      nf = f;
    }
  }
  // (nothing fits at all — a corner of the knobs no card covers: the card whose bands, widened, come nearest)
  if (bf <= 0) return { efg: nearest(m, h), fit: 0, second: null, blend: 0 };
  if (patch && patch !== best && pr > 0) {
    const k = pr / top;
    if (k >= PATCH_HOLD) return { efg: patch, fit: pr * (patch.weight ?? 1), second: best, blend: 0.5 * Math.max(0, Math.min(1, 1 - (k - PATCH_HOLD) / PATCH_FADE)) };
    if (k > PATCH_HOLD - PATCH_FADE) return { efg: best, fit: bf, second: patch, blend: 0.5 * Math.min(1, (k - (PATCH_HOLD - PATCH_FADE)) / PATCH_FADE) };
  }
  const blend = nf > 0 ? 0.5 * Math.max(0, Math.min(1, (nf / bf - 0.75) / 0.25)) : 0;
  return { efg: best, fit: bf, second: nf > 0 ? next : null, blend };
}

/** the land card whose bands, widened, come nearest a point no card fits */
function nearest(m: Macro, h: number): Efg {
  const t = warmthAt(m, h);
  const w = wetnessAt(m, h);
  let near = LAND_EFGS.find((e) => e.code === 'T3.4') ?? LAND_EFGS[0];
  let nb = 0;
  for (const e of LAND_EFGS) {
    if (e.needs?.water || e.needs?.rocks) continue;
    const f = fit(t, [e.t[0] - 8, e.t[1], e.t[2], e.t[3] + 8]) * fit(w, [e.m[0] - 0.25, e.m[1], e.m[2], e.m[3] + 0.25]);
    if (f > nb) {
      nb = f;
      near = e;
    }
  }
  return near;
}

/**
 * The patches a place could be at height h: the cards (the land's, or with `water` its water's) that fit at least
 * PATCH_HOLD as well as the best there, and always the one most often found there (the best by fit and weight),
 * with their own fits and how often each is the one (most often first).
 */
export function patchesAt(m: Macro, h: number, water = false): { efg: Efg; raw: number; weight: number }[] {
  if (water && m.water === 'none') return [];
  const season = seasonOf(m.tSea, m.wet, m.cont);
  const all = (water ? WATER_EFGS : LAND_EFGS)
    .map((efg) => ({ efg, raw: rawFit(efg, m, h, season), weight: efg.weight ?? 1 }))
    .filter((x) => x.raw > 0)
    .sort((a, b) => b.raw * b.weight - a.raw * a.weight);
  const top = Math.max(0, ...all.map((x) => x.raw));
  return all.filter((x, k) => k === 0 || x.raw >= PATCH_HOLD * top);
}

/** the ecosystem a stretch's water brings (its river, lake, wetland, shore, salt), if it has one: the best that fits, or the place's own (Macro.waterEfg) where that fits nearly as well */
export function waterEcosystemAt(m: Macro, h: number): Efg | null {
  if (m.water === 'none') return null;
  const season = seasonOf(m.tSea, m.wet, m.cont);
  let best: Efg | null = null;
  let bf = 0;
  let top = 0;
  let patch: Efg | null = null;
  let pr = 0;
  for (const e of WATER_EFGS) {
    const raw = rawFit(e, m, h, season);
    if (raw > top) top = raw;
    if (e.code === m.waterEfg) {
      patch = e;
      pr = raw;
    }
    const f = raw * (e.weight ?? 1);
    if (f > bf) {
      best = e;
      bf = f;
    }
  }
  return patch && pr > 0 && pr >= PATCH_HOLD * top ? patch : best;
}

/** how well a landform can stand in a stretch (0: it cannot), at the stretch's own height */
export function landformFit(l: Landform, m: Macro): number {
  if (l.contexts && !l.contexts.includes(m.context)) return 0;
  if (l.rocks && !l.rocks.includes(m.rock)) return 0;
  if (l.water && !l.water.includes(m.water)) return 0;
  if (l.span && (m.relief < l.span[0] || m.relief > l.span[1])) return 0;
  const h = m.base + m.relief * 0.5;
  let f = fit(warmthAt(m, h), l.t) * fit(wetnessAt(m, m.base), l.m);
  if (f > 0 && l.top) f *= fit(growingAt(m, m.base + m.relief), l.top);
  return f * (l.weight ?? 1);
}

/** every landform that can stand in a stretch, best first */
export function landformsFor(m: Macro): { landform: Landform; fit: number }[] {
  return LANDFORMS.map((landform) => ({ landform, fit: landformFit(landform, m) }))
    .filter((x) => x.fit > 0)
    .sort((a, b) => b.fit - a.fit);
}

/**
 * The belts a stretch shows, from the road up its slopes: the land's ecosystem at the road, a third of the way
 * up and at the top of what is in view — the altitude zonation a climb goes through.
 */
export function beltsOf(m: Macro): EcoPick[] {
  const out: EcoPick[] = [];
  for (const k of [0, 0.4, 1]) {
    const p = ecosystemAt(m, m.base + m.relief * k);
    if (!out.length || out[out.length - 1].efg !== p.efg) out.push(p);
  }
  return out;
}
