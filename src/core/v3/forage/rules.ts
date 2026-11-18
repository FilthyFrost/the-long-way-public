/**
 * The rules of a pick (docs/V3/nodes/W3-forage.md): whether a forage point shows now, how much a pick gives
 * and of what quality, what it is worth in proficiency, when a picked plant bears again, and the tide. Pure
 * functions of what they are handed; the dice are hashes of the point's own key, so the same point gives the
 * same pick on the same day whatever else has happened.
 */
import { hash2 } from '../../math/rng';
import type { Rarity } from '../contracts/base';
import { LOW_TIDE, RAIN_SHOW_H, type ForageCond, type ForageKind } from './types';

/** game seconds in a day and in one tide (two tides a day, a little over twelve hours each, so the tide's hour drifts through the days) */
const DAY_S = 86400;
export const TIDE_S = 12.4 * 3600;

/** the tide at a world time, −1 (lowest) … 1 (highest): a pure function of the world clock's seconds */
export function tideAt(worldSeconds: number): number {
  const p = worldSeconds / TIDE_S;
  const f = p - Math.floor(p);
  // a smooth wave without the engine's trigonometry: a parabola up and one down
  const x = f < 0.5 ? f * 4 - 1 : 3 - f * 4;
  return x * (1.5 - 0.5 * x * x);
}

/** is the hour within a span that may wrap past midnight? */
function inHours(hour: number, from: number, to: number): boolean {
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
}

/** does a point of this kind show under these conditions? (`hidden`: it is one of the after-rain half) */
export function forageShows(kind: ForageKind, hidden: boolean, cond: ForageCond): boolean {
  const w = kind.when;
  if (!w) return true;
  if (w.hours && !inHours(cond.hour, w.hours[0], w.hours[1])) return false;
  if (w.lowTide && cond.tide > LOW_TIDE) return false;
  if (w.afterRain && hidden && cond.sinceRainH > RAIN_SHOW_H) return false;
  return true;
}

/** has a plant picked on `pickedDay` borne again by `today` (whole game days)? */
export function regrown(kind: ForageKind, pickedDay: number, today: number): boolean {
  return today - pickedDay >= kind.regrowDays;
}

/** what the picker brings: the tools in the hotbar, the forage skill's level (1 … 20), and its perks */
export interface PickBonus {
  readonly knife: boolean;
  readonly trowel: boolean;
  readonly sickle: boolean;
  readonly level: number;
  /** the perk "a chance of twice as much" and "now and then a star more" */
  readonly double: boolean;
  readonly star: boolean;
}

export const NO_BONUS: PickBonus = { knife: false, trowel: false, sickle: false, level: 1, double: false, star: false };

/** what a pick is worth in proficiency, by rarity */
export const PICK_XP: Readonly<Record<Rarity, number>> = { common: 1, uncommon: 3, rare: 8, legendary: 20 };
/** the first pick ever of a kind is worth this many times as much */
export const FIRST_PICK_XP = 5;

/** the chance of twice as much, with the perk: a quarter, growing a little with the level */
export function doubleChance(level: number): number {
  return 0.25 + 0.01 * Math.max(0, level - 10);
}

export interface PickResult {
  /** portions */
  n: number;
  /** quality in stars: 2 as it comes, 3 with the right tool or now and then with the perk, never more than 4 */
  q: number;
  xp: number;
}

/**
 * What a pick gives. `key` is the point's own key and `day` the game day: together with the seed they throw
 * the dice, so a point's yield is the same however often it is looked at, and differs from one bearing to the
 * next.
 */
export function pickResult(kind: ForageKind, seed: number, key: number, day: number, vary: number, b: PickBonus, out: PickResult): PickResult {
  const h = hash2(key | 0, day | 0, (seed | 0) ^ 0x0f0a);
  const u1 = (h & 0xffff) / 65536;
  const u2 = ((h >>> 16) & 0xff) / 256;
  const u3 = ((h >>> 24) & 0xff) / 256;
  // how many: a little more than half the plant's own (a good bush is a good bush every time), the rest the day's luck
  const lo = kind.yield[0];
  const hi = kind.yield[1];
  let n = lo + Math.floor((hi - lo + 1) * Math.min(0.999, 0.55 * vary + 0.45 * u1));
  if (kind.tool === 'trowel' && b.trowel) n += 1;
  if (kind.tool === 'sickle' && b.sickle) n *= 2;
  if (b.double && u2 < doubleChance(b.level)) n *= 2;
  // quality: the right knife cuts clean
  let q = 2;
  if (kind.tool === 'knife' && b.knife) q += 1;
  if (b.star && u3 < 0.2) q += 1;
  out.n = n;
  out.q = q > 4 ? 4 : q;
  out.xp = PICK_XP[kind.rarity];
  return out;
}

/** how many game seconds until the tide is next below LOW_TIDE (0: it is now), for the hint on a shore plant's card */
export function nextLowTide(worldSeconds: number): number {
  if (tideAt(worldSeconds) <= LOW_TIDE) return 0;
  for (let t = 600; t <= TIDE_S; t += 600) if (tideAt(worldSeconds + t) <= LOW_TIDE) return t;
  return TIDE_S;
}

export { DAY_S };
