/**
 * The dealer of the second world version (docs/V3/nodes/W1-worldgen.md): which region comes next along the
 * road, and for how many stretches. The first version drew a biome at random among those not just seen; this
 * one deals for a journey that is gentle with tension and release: mostly calm country, a scenic region every
 * few, a highlight seldom and never twice running, neighbours that look different, and every kind of country
 * met on a long drive.
 *
 * Pure: a function of the seed, the chapter's index, the cards of the regions the world knows and the
 * regions dealt so far. A chapter's dice come from hashes of its own index (never from a stream), so a rule
 * added later moves no dice of the chapters after it.
 *
 * A region takes whole stretches (slots of 1,250 m): its borders fall on stretch borders, so every stretch
 * belongs to one region and the director (director.ts) can plan a region stretch by stretch.
 *
 * The world's rules load this file (rules.ts names DEALER_V2), so it knows the registry's entries and the
 * rules by their types and loads nothing of the road or the land to run.
 */
import { hash2 } from '../math/rng';
import { BIOMES, type RegionDef } from './biomes';
import type { ChapterDealer, DealerView } from './rules';

export type Intensity = 'calm' | 'scenic' | 'highlight';
export type Climate = 'temperate' | 'dry' | 'cold' | 'warm';

/** what the dealer needs to know of a region (from its RegionDef; see cardOf) */
export interface RegionCard {
  /** index in the registry (BIOMES): the region's identity */
  readonly index: number;
  readonly id: string;
  readonly intensity: Intensity;
  /** three families; neighbours should differ in at least two */
  readonly palette: string;
  readonly land: string;
  readonly flora: string;
  readonly climate: Climate;
  /** it has a sea (two such never run on: each chapter hangs its own sea level) */
  readonly sea: boolean;
  /** a surreal region: at most one in six */
  readonly surreal: boolean;
  /** how often it comes against the others of its class (1 = as often) */
  readonly weight: number;
}

/**
 * The card of a region of the registry. What a region does not say for itself: calm, families of its own
 * (its id, so that it looks different from every other), temperate, no sea, not surreal, as likely as its
 * fellows.
 */
export function cardOf(def: RegionDef, index: number): RegionCard {
  return {
    index,
    id: def.id,
    intensity: def.intensity ?? 'calm',
    palette: def.family?.palette ?? def.id,
    land: def.family?.land ?? def.id,
    flora: def.family?.flora ?? def.id,
    climate: def.climate ?? 'temperate',
    sea: def.sea ?? false,
    surreal: def.surreal ?? false,
    weight: def.weight ?? 1,
  };
}

export interface Deal {
  /** index of the region in the registry */
  readonly region: number;
  /** how many stretches it runs for */
  readonly slots: number;
}

/** the long-run shares the dealer aims at, by intensity */
export const SHARE: Readonly<Record<Intensity, number>> = { calm: 0.6, scenic: 0.3, highlight: 0.1 };

/** a region is not dealt again while it is among the last this many */
export const NO_REPEAT = 3;
/** highlights stand at least this many regions apart */
export const HIGHLIGHT_GAP = 3;
/** at most one surreal region among any this many in a row */
export const SURREAL_SPAN = 6;
/** after this many calm regions running, the next is not calm */
export const CALM_RUN = 3;
/** at most this many scenic regions running */
export const SCENIC_RUN = 2;
/** the first this many regions hold no highlight (the journey begins gently) */
export const GENTLE_START = 3;

/** stretches a region of each intensity may run for (each as likely as the others) */
const SLOTS: Readonly<Record<Intensity, readonly number[]>> = {
  calm: [6, 7, 7, 8],
  scenic: [6, 6, 7],
  highlight: [6],
};

const SALT_CLASS = 0x0d1a;
const SALT_PICK = 0x0d1b;
const SALT_SLOTS = 0x0d1c;
const CLASSES: readonly Intensity[] = ['calm', 'scenic', 'highlight'];

/** a number in [0, 1) for chapter c and one of the salts */
function dice(seed: number, c: number, salt: number): number {
  return (hash2(c | 0, salt, seed | 0) >>> 8) / 16777216;
}

/** how different two regions look: the families (of three) in which they differ */
export function contrast(a: RegionCard, b: RegionCard): number {
  return (a.palette !== b.palette ? 1 : 0) + (a.land !== b.land ? 1 : 0) + (a.flora !== b.flora ? 1 : 0);
}

/** how many regions ago `index` was last dealt (1 = the one before; Infinity = never) */
function age(index: number, dealt: readonly number[]): number {
  for (let i = dealt.length - 1; i >= 0; i--) if (dealt[i] === index) return dealt.length - i;
  return Infinity;
}

/** which intensities the rules allow for chapter c, given the cards of what was dealt (most recent last) */
function allowed(c: number, past: readonly RegionCard[]): Record<Intensity, boolean> {
  const n = past.length;
  const ok: Record<Intensity, boolean> = { calm: true, scenic: true, highlight: true };
  const prev = n > 0 ? past[n - 1] : null;
  // the journey begins gently
  if (c < GENTLE_START) ok.highlight = false;
  // a highlight is followed by calm country
  if (prev && prev.intensity === 'highlight') {
    ok.scenic = false;
    ok.highlight = false;
  }
  // highlights stand apart
  for (let i = 1; i <= HIGHLIGHT_GAP && i <= n; i++) if (past[n - i].intensity === 'highlight') ok.highlight = false;
  // no more than two scenic regions running
  let scenic = 0;
  for (let i = n - 1; i >= 0 && past[i].intensity === 'scenic'; i--) scenic++;
  if (scenic >= SCENIC_RUN) ok.scenic = false;
  // after three calm regions something to look at
  let calm = 0;
  for (let i = n - 1; i >= 0 && past[i].intensity === 'calm'; i--) calm++;
  if (calm >= CALM_RUN) ok.calm = false;
  return ok;
}

/** how far back the dealer looks when it asks what a class is owed */
const OWED_SPAN = 24;

/**
 * How much likelier (above 1) or less likely (below 1) a class is for what the last regions held of it: its
 * share aimed at against its share of the last OWED_SPAN regions. A journey that has had no highlight for a
 * long while gets one sooner; one that has just had two scenic regions leans calm.
 */
function owed(q: Intensity, past: readonly RegionCard[]): number {
  const n = Math.min(OWED_SPAN, past.length);
  if (n < 4) return 1;
  let had = 0;
  for (let i = 1; i <= n; i++) if (past[past.length - i].intensity === q) had++;
  const f = 1 + 14 * (SHARE[q] - had / n);
  return f < 0.3 ? 0.3 : f > 4 ? 4 : f;
}

/** may this card follow what was dealt, apart from its intensity? (strictness 0: every rule; 1: it may repeat sooner; 2: anything but the region just left) */
function fits(k: RegionCard, past: readonly RegionCard[], strict: number): boolean {
  const n = past.length;
  if (n === 0) return true;
  const prev = past[n - 1];
  if (k.index === prev.index) return false;
  if (strict >= 2) return true;
  if (prev.sea && k.sea) return false;
  if (k.surreal) for (let i = 1; i < SURREAL_SPAN && i <= n; i++) if (past[n - i].surreal) return false;
  if (strict >= 1) return true;
  for (let i = 1; i <= NO_REPEAT && i <= n; i++) if (past[n - i].index === k.index) return false;
  return true;
}

/** how much a card is wanted after what was dealt: its own weight, how different it looks from the region before, the climate's step, how long it has not been seen */
function want(k: RegionCard, past: readonly RegionCard[], dealt: readonly number[]): number {
  let w = k.weight;
  const n = past.length;
  if (n > 0) {
    const prev = past[n - 1];
    const d = contrast(prev, k);
    w *= d >= 2 ? 1 : d === 1 ? 0.15 : 0.03;
    // from the desert straight into the snow (or back) is a jolt: seldom
    const hot = prev.climate === 'dry' || prev.climate === 'warm';
    const cold = prev.climate === 'cold';
    const hot2 = k.climate === 'dry' || k.climate === 'warm';
    const cold2 = k.climate === 'cold';
    if ((hot && cold2) || (cold && hot2)) w *= prev.climate === 'dry' || k.climate === 'dry' ? 0.25 : 0.5;
  }
  // long unseen: wanted more, and never seen most of all, so that a long journey meets every kind of country
  const a = age(k.index, dealt);
  w *= a === Infinity ? 4 : 0.2 + Math.min(1.4, a / 7);
  return w;
}

/**
 * The region of chapter c (c ≥ 1) and its length. `cards` are the regions this world knows, in registry
 * order; `dealt` the registry indices of chapters 0 … c − 1.
 */
export function dealRegion(seed: number, c: number, cards: readonly RegionCard[], dealt: readonly number[]): Deal {
  const byIndex = new Map<number, RegionCard>();
  for (const k of cards) byIndex.set(k.index, k);
  const past: RegionCard[] = [];
  for (const i of dealt) {
    const k = byIndex.get(i);
    if (k) past.push(k);
  }
  const ok = allowed(c, past);
  // the candidates: by every rule; then with a region allowed to return sooner; then anything but the one just left
  let cand: RegionCard[] = [];
  for (let strict = 0; strict <= 2 && cand.length === 0; strict++) {
    cand = cards.filter((k) => ok[k.intensity] && fits(k, past, strict));
    // (the rules on intensity give way last: a world of only calm regions still gets a region)
    if (cand.length === 0) cand = cards.filter((k) => fits(k, past, strict) && (k.intensity !== 'highlight' || ok.highlight));
  }
  if (cand.length === 0) cand = cards.slice();
  // the class first: by the shares aimed at, each leaning towards what the journey so far owes it (a class
  // that has had less than its share of the last regions is likelier, one that has had more is less likely),
  // among the classes that have a candidate
  const share: Record<Intensity, number> = { calm: 0, scenic: 0, highlight: 0 };
  let total = 0;
  for (const q of CLASSES) {
    if (!cand.some((k) => k.intensity === q)) continue;
    share[q] = SHARE[q] * owed(q, past);
    total += share[q];
  }
  let u = dice(seed, c, SALT_CLASS) * total;
  let cls: Intensity = cand[0].intensity;
  for (const q of CLASSES) {
    if (share[q] <= 0) continue;
    cls = q;
    if (u < share[q]) break;
    u -= share[q];
  }
  // then the region within the class, by how much each is wanted
  const of = cand.filter((k) => k.intensity === cls);
  let sum = 0;
  const w: number[] = [];
  for (const k of of) {
    const x = want(k, past, dealt);
    w.push(x);
    sum += x;
  }
  let v = dice(seed, c, SALT_PICK) * sum;
  let pick = of[of.length - 1];
  for (let i = 0; i < of.length; i++) {
    if (v < w[i]) {
      pick = of[i];
      break;
    }
    v -= w[i];
  }
  return { region: pick.index, slots: slotsOf(seed, c, pick.intensity) };
}

/** how many stretches chapter c runs for, by its region's intensity */
export function slotsOf(seed: number, c: number, intensity: Intensity): number {
  const list = SLOTS[intensity];
  return list[Math.min(list.length - 1, Math.floor(dice(seed, c, SALT_SLOTS) * list.length))];
}

/**
 * Check a dealt journey against the rules (for the tests and the developer's preview): every breach, in words.
 * `cards` by registry index; `dealt` the regions in order.
 */
export function dealProblems(cards: readonly RegionCard[], dealt: readonly number[]): string[] {
  const byIndex = new Map<number, RegionCard>();
  for (const k of cards) byIndex.set(k.index, k);
  const seq = dealt.map((i) => byIndex.get(i)!);
  const bad: string[] = [];
  let calm = 0;
  let scenic = 0;
  for (let c = 0; c < seq.length; c++) {
    const k = seq[c];
    const prev = c > 0 ? seq[c - 1] : null;
    if (prev && prev.index === k.index) bad.push(`chapter ${c}: ${k.id} twice running`);
    if (k.intensity === 'highlight') {
      if (c < GENTLE_START) bad.push(`chapter ${c}: a highlight (${k.id}) among the first ${GENTLE_START}`);
      for (let i = 1; i <= HIGHLIGHT_GAP && c - i >= 0; i++) if (seq[c - i].intensity === 'highlight') bad.push(`chapter ${c}: highlights ${seq[c - i].id} and ${k.id} only ${i} apart`);
    }
    if (prev && prev.intensity === 'highlight' && k.intensity !== 'calm') bad.push(`chapter ${c}: ${k.id} (${k.intensity}) straight after the highlight ${prev.id}`);
    if (prev && prev.sea && k.sea) bad.push(`chapter ${c}: two regions with a sea running (${prev.id}, ${k.id})`);
    if (k.surreal) for (let i = 1; i < SURREAL_SPAN && c - i >= 0; i++) if (seq[c - i].surreal) bad.push(`chapter ${c}: surreal ${seq[c - i].id} and ${k.id} within ${SURREAL_SPAN}`);
    calm = k.intensity === 'calm' ? calm + 1 : 0;
    scenic = k.intensity === 'scenic' ? scenic + 1 : 0;
    if (calm > CALM_RUN) bad.push(`chapter ${c}: ${calm} calm regions running`);
    if (scenic > SCENIC_RUN) bad.push(`chapter ${c}: ${scenic} scenic regions running`);
  }
  return bad;
}

/** the cards of the regions a world knows: the first `count` of the registry */
export function cardsOf(count: number): RegionCard[] {
  const cards: RegionCard[] = [];
  for (let i = 0; i < count && i < BIOMES.length; i++) cards.push(cardOf(BIOMES[i], i));
  return cards;
}

/**
 * A chapter's length along the road (m): its stretches, as many as its intensity and its dice give, times
 * the chapter scale (which is there for tests and screenshots: a scale below one packs the regions closer),
 * a whole number of stretches always and never fewer than two.
 */
function lengthOf(slots: number, deal: DealerView): number {
  return Math.max(2, Math.round(slots * deal.scale)) * deal.rules.slot;
}

/**
 * The dealer of world version 2, as the chapter plan asks it (rules.ts ChapterDealer). Chapter 0 is the
 * region the journey was asked to begin in; every chapter after it is dealt by `dealRegion` among the
 * regions the world knows. The plan's own stream of dice is never touched: every chapter's dice are hashes
 * of its index.
 */
export const DEALER_V2: ChapterDealer = {
  first(deal) {
    const card = cardOf(BIOMES[deal.startRegion], deal.startRegion);
    return { region: deal.startRegion, length: lengthOf(slotsOf(deal.seed, 0, card.intensity), deal) };
  },
  next(deal) {
    const d = dealRegion(deal.seed, deal.regions.length, cardsOf(deal.rules.regionCount), deal.regions);
    return { region: d.region, length: lengthOf(d.slots, deal) };
  },
};
