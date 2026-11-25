/**
 * The numbers of the casual fishing module (docs/V3/nodes/F2-fishing-lite.md §2–4, §10): which fish wants a bait now,
 * how strong a fish is against a rod, how big it is, which colour it comes up in, what it is worth and what it
 * teaches. Pure functions of their arguments; the dice are a stream whose state can be saved.
 */
import { hash2, hash32 } from '../../../math/rng';
import { FISH_INDEX, kgOf } from './fish';
import { measurePower, variantBoost } from './gear';
import { DAWN, DAY, DUSK, MEDAL_AT, NIGHT, TIERS, VARIANTS, type BaitKind, type CharmEffect, type Conditions, type FishDef, type Medal, type RodDef, type TackleLine, type Variant } from './types';

// ------------------------------------------------------------------ dice

/** a small random stream (mulberry32) whose state is one number: save `s`, make it again with it */
export class Stream {
  s: number;
  constructor(seed: number) {
    this.s = hash32(seed | 0) | 0;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}

/** a number in [0, 1) from integers (the same every time) */
export function dice(a: number, b: number, c = 0): number {
  return hash2(a | 0, (b | 0) ^ Math.imul(c | 0, 0x2c1b3c6d), 0xf15e) / 4294967296;
}

// ------------------------------------------------------------------ the day

/** which part of the day an hour is in: DAWN 5–8, DAY 8–17, DUSK 17–20, NIGHT */
export function partOf(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  return h >= 5 && h < 8 ? DAWN : h >= 8 && h < 17 ? DAY : h >= 17 && h < 20 ? DUSK : NIGHT;
}

/** is the hour within a span (from, to; past midnight when from > to)? */
export function inSpan(span: readonly [number, number], hour: number): boolean {
  const h = ((hour % 24) + 24) % 24;
  return span[0] <= span[1] ? h >= span[0] && h < span[1] : h >= span[0] || h < span[1];
}

// ------------------------------------------------------------------ what is on the line

/** what the angler fishes with: the rod, the bait, the charms, the tackle box, the angler's level and luck */
export interface Rig {
  readonly rod: RodDef;
  /**
   * The bait's kind and tier (the one rarity it draws: 0 … 3; the star bait 5; nothing on the hook −1); `live`: the
   * fish (index into FISH) put on the hook alive; `star`: the star bait
   */
  readonly bait: { readonly kind: BaitKind; readonly tier: number; readonly live?: number; readonly star?: boolean };
  readonly charms: readonly CharmEffect[];
  readonly tackle: Readonly<Record<TackleLine, number>>;
  /** perfect strikes in a row (each raises the next catch's chance of a colour) */
  readonly streak: number;
  /** catches since the last one with a colour (at 40 the next has one) */
  readonly pity: number;
}

export const PITY_AT = 40;

export function hasCharm(rig: Rig, e: CharmEffect): boolean {
  return rig.charms.includes(e);
}

/** how much quicker fish come to the night rod's bait at night, and by day (its perk 'night') */
export const NIGHT_ROD: readonly [number, number] = [1.5, 0.7];
/** how much longer the willow gives one to strike (its perk 'window') */
export const WIDE_WINDOW = 1.5;

/**
 * How much a fish wants this bait (0: not at all), before the hour and the weather (docs/V3/plan/fishing-feel.md §10):
 * a bait draws the fish of its own tier and no others, whatever they eat; a lord takes only its own live fish, and a
 * fish alive on the hook is the lords' bait (the rest leave it be); a celestial fish takes only the star bait.
 */
export function dietFit(def: FishDef, bait: Rig['bait']): number {
  if (def.tier === 5) return bait.star ? 1 : 0;
  if (bait.star) return 0;
  if (def.live) return bait.live === FISH_INDEX.get(def.live) ? 1 : 0;
  if (bait.live !== undefined) return 0;
  return def.tier === bait.tier ? 1 : 0;
}

/** how much the hour suits it: its own hours 1, the rest seldom; a lord only in its span */
export function hourFit(def: FishDef, hour: number): number {
  if (def.span) return inSpan(def.span, hour) ? 1 : 0;
  return def.hours & partOf(hour) ? 1 : 0.25;
}

/** how much the weather and the sky suit it (0: what it needs is not there) */
export function skyFit(def: FishDef, c: Conditions): number {
  if (def.only) {
    if (def.only === 'rain' ? !c.rain : def.only === 'clear' ? !c.clear : def.only === 'fog' ? !c.fog : !c.events.has(def.only)) return 0;
  }
  if (def.weather === 'rain') return c.rain ? 2 : 0.4;
  if (def.weather === 'clear') return c.clear ? 1.6 : 0.5;
  return 1;
}

/** how readily a fish (of weight share q of its kind's largest) comes to this bait now, 0 and up */
export function appetite(def: FishDef, q: number, rig: Rig, c: Conditions): number {
  const diet = dietFit(def, rig.bait);
  if (diet <= 0) return 0;
  const sky = skyFit(def, c);
  if (sky <= 0) return 0;
  let w = TIERS[def.tier].bold * diet * hourFit(def, c.hour) * sky;
  // (a fish no longer than a hand bites less: it is the bigger ones one goes for; the little ones are the lords' live bait)
  if (def.cm[1] < 25) w *= 0.4;
  const night = partOf(c.hour) === NIGHT;
  if (night && hasCharm(rig, 'night')) w *= 1.25;
  // (the night rod: quick to be bitten at night, slow by day — docs/V3/plan/fishing-feel.md §11)
  if (rig.rod.perk === 'night') w *= night ? NIGHT_ROD[0] : NIGHT_ROD[1];
  if (hasCharm(rig, 'heavy')) w *= q > 0.45 ? 1.5 : 0.6;
  if (hasCharm(rig, 'bigHook')) w *= (0.6 + q) * 0.85;
  return w;
}

/** whether it is day (for a shy fish and the dark) */
export function isDay(hour: number): boolean {
  const p = partOf(hour);
  return p === DAY || p === DAWN || p === DUSK;
}

// ------------------------------------------------------------------ the fish itself

/** the shares of a day's stock in each band of size (weight against the kind's largest) and the bands */
const SIZE_BANDS: readonly (readonly [number, number, number])[] = [
  // [share, from, to]: 28 % under bronze, 34 % bronze, 22 % silver, 12 % gold, 4 % diamond (docs/V3/plan/fishing-fight.md §7: the catches a size up)
  [0.28, 0, 0.35],
  [0.34, 0.35, 0.55],
  [0.22, 0.55, 0.75],
  [0.12, 0.75, 0.9],
  [0.04, 0.9, 1],
];

/** a fish's length (cm) from two dice: its weight share falls into the medal bands in their shares */
export function rollLength(def: FishDef, u1: number, u2: number): { cm: number; kg: number; q: number } {
  const qMin = Math.pow(def.cm[0] / def.cm[1], 3);
  let acc = 0;
  let band = SIZE_BANDS[0];
  for (const b of SIZE_BANDS) {
    acc += b[0];
    band = b;
    if (u1 < acc) break;
  }
  const lo = Math.max(qMin, band[1]);
  const hi = Math.max(lo, band[2]);
  const q = lo + (hi - lo) * u2;
  const cm = def.cm[1] * Math.cbrt(q);
  const kgMax = kgOf(def, def.cm[1]);
  const kg = kgOf(def, cm);
  return { cm: Math.round(cm * 10) / 10, kg, q: kg / kgMax };
}

export function medalOf(q: number): Medal {
  return q >= MEDAL_AT[4] ? 4 : q >= MEDAL_AT[3] ? 3 : q >= MEDAL_AT[2] ? 2 : q >= MEDAL_AT[1] ? 1 : 0;
}

/**
 * How strong a fish is (against a rod's power): its rarity's share of the rod its rarity is measured against (gear.ts
 * REC_ROD), whichever water it lives in, by its size and temper; a lord (and a sky fish) against its own water's step
 * of the ladder from the willow to the sea rod (gear.ts homePower).
 */
export function strengthOf(def: FishDef, q: number): number {
  const [lo, hi] = TIERS[def.tier].strength;
  const t = def.temper === 'brute' ? 1.1 : def.temper === 'steady' ? 0.9 : 1;
  return measurePower(def.tier, def.spot) * (lo + (hi - lo) * Math.min(1, Math.max(0, q))) * t;
}

/** seconds of full tension it takes to tire it */
export function staminaOf(def: FishDef, q: number): number {
  return TIERS[def.tier].stamina * (0.75 + 0.5 * Math.min(1, q));
}

/** the moment one has to strike once it bites (s) */
export function strikeWindow(def: FishDef, rig: Rig): number {
  let w = TIERS[def.tier].window * (def.wary ? 0.75 : 1);
  w *= 1 + 0.1 * rig.tackle.hook;
  if (hasCharm(rig, 'window')) w *= 1.4;
  if (rig.rod.perk === 'window') w *= WIDE_WINDOW;
  return w;
}

/** a strike within this share of the window is perfect */
export const PERFECT_SHARE = 0.32;

/** the chance of each colour on a catch (index-aligned with VARIANTS; [0] is the plain one) */
export function variantOdds(def: FishDef, rig: Rig): number[] {
  const out = VARIANTS.map(() => 0);
  if (def.tier >= 4) {
    out[0] = 1;
    return out;
  }
  let boost = variantBoost(rig.bait.tier);
  if (hasCharm(rig, 'clover')) boost *= 1.5;
  boost *= 1 + Math.min(0.5, 0.1 * rig.streak);
  let sum = 0;
  for (let v = 1; v < VARIANTS.length; v++) {
    out[v] = VARIANTS[v].chance * boost;
    sum += out[v];
  }
  // (a colour on three catches in ten at the very most)
  if (sum > 0.3) for (let v = 1; v < out.length; v++) out[v] *= 0.3 / sum;
  out[0] = 1 - Math.min(0.3, sum);
  return out;
}

/** the colour a catch comes up in, from one die (and the pity: the fortieth plain catch in a row has one) */
export function rollVariant(def: FishDef, rig: Rig, u: number): Variant {
  if (def.tier >= 4) return 0;
  const odds = variantOdds(def, rig);
  let v: Variant = 0;
  let acc = 0;
  // (from the rarest up, so a die near 0 is the rarest colour)
  for (let i = odds.length - 1; i >= 1; i--) {
    acc += odds[i];
    if (u < acc) {
      v = i as Variant;
      break;
    }
  }
  if (v === 0 && rig.pity + 1 >= PITY_AT) v = 1;
  return v;
}

/** what a catch fetches at the hut: by its rarity, its size and its colour, whichever water it came out of */
export function valueOf(def: FishDef, q: number, variant: Variant, rig: Pick<Rig, 'charms' | 'rod'>): number {
  const base = 4 * TIERS[def.tier].value;
  const size = 0.6 + 1.6 * Math.pow(Math.min(1, Math.max(0, q)), 0.8);
  let v = base * size * VARIANTS[variant].value;
  if (rig.charms.includes('goldHook')) v *= 1.15;
  return Math.max(1, Math.round(v));
}

/** what a catch teaches (the first of its kind three times as much): by its rarity, its size and its colour, whichever water */
export function xpOf(def: FishDef, q: number, variant: Variant, first: boolean): number {
  return Math.round(8 * TIERS[def.tier].xp * (1 + Math.min(1, q)) * VARIANTS[variant].xp * (first ? 3 : 1));
}

// ------------------------------------------------------------------ the angler's level

export const LEVEL_MAX = 20;

/** experience from level L to L + 1 */
export function xpToNext(level: number): number {
  return Math.round(120 * Math.pow(1.32, level - 1));
}

/** the level a total of experience makes, and how far into the next */
export function levelOf(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let left = xp;
  while (level < LEVEL_MAX && left >= xpToNext(level)) {
    left -= xpToNext(level);
    level++;
  }
  return { level, into: left, need: level >= LEVEL_MAX ? 0 : xpToNext(level) };
}

/** what each level brings */
export const PERKS: readonly { level: number; zh: string }[] = [
  { level: 3, zh: '抖饵：等口时轻点一下，附近的鱼更容易过来' },
  { level: 5, zh: '活饵：钓上来的小鱼可以直接挂上钩' },
  { level: 8, zh: '读水：远处的涟漪带上稀有度的颜色' },
  { level: 12, zh: '第二个挂件格' },
  { level: 15, zh: '放生有回报：放生的经验翻倍' },
  { level: 20, zh: '湖主放生后，第二天它一定还在' },
];

export function hasPerk(level: number, perkLevel: number): boolean {
  return level >= perkLevel;
}
