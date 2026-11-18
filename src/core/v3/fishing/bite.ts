/**
 * Who bites (node F1, docs/V3/nodes/F1-fishing.md): for a cast into a class of water under given conditions
 * with a given rig, how much each kind of fish there wants the bait, how long the wait is, which fish it is
 * and how heavy. Pure: the dice are hashes of the seed, the water's own number and the cast's index, so the
 * same casts in the same place bring the same fish.
 */
import { hash2 } from '../../math/rng';
import type { Rarity } from '../contracts/base';
import { FISH, fishOf } from './species';
import { MEDAL_AT, type Bait, type Diet, type FishCond, type FishKind, type Rig, type WaterClass } from './types';

/** how much each bait draws a fish of each diet, 0 … 1 (a bait not named does not draw it at all) */
export const DIETS: Readonly<Record<Diet, Partial<Record<Bait, number>>>> = {
  panfish: { worm: 1, insect: 0.9, dough: 0.7, fly: 0.6, corn: 0.4, shrimp: 0.4, softbait: 0.15 },
  carp: { dough: 1, corn: 0.95, worm: 0.6, insect: 0.2 },
  grazer: { corn: 0.8, dough: 0.7, insect: 0.3, fly: 0.2 },
  predator: { minnow: 1, softbait: 0.85, crank: 0.85, spinner: 0.8, jig: 0.75, spoon: 0.7, topwater: 0.6, worm: 0.25, cut: 0.2 },
  trout: { fly: 1, worm: 0.85, insect: 0.85, spinner: 0.75, spoon: 0.5, minnow: 0.45, softbait: 0.3 },
  catfish: { cut: 1, worm: 0.8, minnow: 0.7, shrimp: 0.6, squid: 0.4, dough: 0.3 },
  eel: { worm: 1, cut: 0.9, shrimp: 0.5, minnow: 0.4 },
  seabed: { shrimp: 1, squid: 0.9, cut: 0.85, worm: 0.6, jig: 0.5, softbait: 0.4 },
  pelagic: { minnow: 1, spoon: 0.9, jig: 0.85, crank: 0.6, squid: 0.5, topwater: 0.5, cut: 0.3 },
  cephalopod: { jig: 1, shrimp: 0.7, minnow: 0.5 },
  crustacean: { cut: 1, shrimp: 0.5, worm: 0.4 },
  ice: { jig: 1, worm: 0.85, minnow: 0.7, spoon: 0.6, insect: 0.5 },
};

/** how many of a rarity there are for one common fish */
export const RARITY_W: Readonly<Record<Rarity, number>> = { common: 1, uncommon: 0.38, rare: 0.12, legendary: 0.012 };

function hoursFit(kind: FishKind, hour: number): number {
  const day = hour >= 8 && hour < 17;
  const edge = (hour >= 5 && hour < 8) || (hour >= 17 && hour < 20);
  if (kind.hours === 'any') return 0.8;
  if (kind.hours === 'day') return day ? 1 : edge ? 0.6 : 0.15;
  if (kind.hours === 'edge') return edge ? 1 : day ? 0.4 : 0.3;
  return day ? 0.1 : edge ? 0.55 : 1;
}

function layerFit(kind: FishKind, rig: Rig): number {
  const l = kind.layer;
  if (rig.style === 'float') return l === 'top' ? 1 : l === 'mid' ? 0.8 : 0.15;
  if (rig.style === 'bottom') return l === 'bottom' ? 1 : l === 'mid' ? 0.35 : 0.05;
  if (rig.bait === 'topwater' || rig.bait === 'fly') return l === 'top' ? 1 : l === 'mid' ? 0.4 : 0.02;
  if (rig.bait === 'jig') return l === 'bottom' ? 1 : l === 'mid' ? 0.8 : 0.25;
  return l === 'mid' ? 1 : l === 'top' ? 0.7 : 0.5;
}

/** the largest hook (1 … 8) a kind can take: by its usual weight (a big hook catches no small fish; a small hook catches any) */
export function hookMax(kind: FishKind): number {
  const s = 2.2 + 1.9 * Math.log10(kind.kg[1] * 10);
  return s < 1 ? 1 : s > 8 ? 8 : Math.round(s);
}

/** how much this kind wants this rig now, 0 and up (0: it will not bite) */
export function biteWeight(kind: FishKind, rig: Rig, cond: FishCond): number {
  if (!!kind.ice !== cond.ice) return 0;
  const diet = DIETS[kind.diet][rig.bait] ?? 0;
  if (diet <= 0) return 0;
  const hook = rig.hook > hookMax(kind) + 1 ? 0 : rig.hook > hookMax(kind) ? 0.25 : 1;
  if (hook <= 0) return 0;
  const weather = kind.weather === 1 ? (cond.raining ? 1.5 : 0.8) : kind.weather === -1 ? (cond.raining ? 0.6 : 1.1) : 1;
  const stealth = 1 - 0.9 * kind.wary * rig.lineSeen;
  const s = cond.spot < 0 ? 0 : cond.spot > 1 ? 1 : cond.spot;
  // the common are everywhere in their water; the rare keep to the good spots; a legend to the very best
  const spot = kind.rarity === 'common' ? 0.4 + 0.6 * s : kind.rarity === 'uncommon' ? 0.15 + 0.85 * s : kind.rarity === 'rare' ? s * s : s > 0.85 ? (s - 0.85) / 0.15 : 0;
  return RARITY_W[kind.rarity] * diet * hook * hoursFit(kind, cond.hour) * weather * layerFit(kind, rig) * stealth * spot;
}

/** the weights of every kind of a water for a rig and conditions (index-aligned with fishOf(water, ice)), and their sum */
export function biteTable(water: WaterClass, rig: Rig, cond: FishCond): { kinds: FishKind[]; w: number[]; total: number } {
  const kinds = fishOf(water, cond.ice);
  const w = kinds.map((k) => biteWeight(k, rig, cond));
  let total = 0;
  for (const x of w) total += x;
  return { kinds, w, total };
}

/** seconds one waits for a bite on average with this much interest (Infinity: nothing here takes this) */
export function meanWait(total: number): number {
  if (total <= 0) return Infinity;
  const s = 14 / total;
  return s < 8 ? 8 : s > 75 ? 75 : s;
}

function dice(seed: number, waterId: number, cast: number, n: number): number {
  return (hash2((waterId | 0) * 8191 + n, cast | 0, (seed | 0) ^ 0xf15e) >>> 8) / 16777216;
}

export interface Bite {
  /** index into FISH; −1: nothing bites on this cast (bring it in and cast again) */
  fish: number;
  /** seconds from the bait settling to the true bite */
  wait: number;
  /** taps before the true bite */
  nibbles: number;
  /** seconds one has to strike after the true bite */
  window: number;
  kg: number;
}

/**
 * What a cast brings. `waterId` is the water's own number (a lake's or river's index along the road), `cast`
 * counts the casts made into it (a save keeps it), so the fish come in an order of their own for each water.
 */
export function castBite(seed: number, waterId: number, cast: number, water: WaterClass, rig: Rig, cond: FishCond, out: Bite): Bite {
  const t = biteTable(water, rig, cond);
  out.fish = -1;
  out.wait = 0;
  out.nibbles = 0;
  out.window = 0;
  out.kg = 0;
  if (t.total <= 0) return out;
  // the wait: exponential about its mean, never under three seconds nor over two minutes
  const mean = meanWait(t.total);
  const u = dice(seed, waterId, cast, 1);
  let wait = -mean * Math.log(1 - 0.999 * u);
  wait = wait < 3 ? 3 : wait > 120 ? 120 : wait;
  // which fish
  let v = dice(seed, waterId, cast, 2) * t.total;
  let pick = t.kinds.length - 1;
  for (let i = 0; i < t.kinds.length; i++) {
    if (v < t.w[i]) {
      pick = i;
      break;
    }
    v -= t.w[i];
  }
  const k = t.kinds[pick];
  out.fish = FISH.indexOf(k);
  out.wait = wait;
  out.nibbles = 1 + Math.floor(dice(seed, waterId, cast, 3) * (1 + 2 * k.wary));
  out.window = 0.9 - 0.3 * k.wary;
  out.kg = rollKg(k, dice(seed, waterId, cast, 4), dice(seed, waterId, cast, 5), dice(seed, waterId, cast, 6), cond.spot);
  return out;
}

/** a fish's weight from three dice: about its usual weight, seldom near its largest, better at a good spot */
export function rollKg(kind: FishKind, u1: number, u2: number, u3: number, spot: number): number {
  // about normal, from three even dice: mean 0, spread about 1
  const z = (u1 + u2 + u3 - 1.5) * 2 + 0.35 * (spot - 0.5);
  const sigma = Math.log(kind.kg[2] / kind.kg[1]) / 2.7;
  const kg = kind.kg[1] * Math.exp(sigma * z);
  return kg < kind.kg[0] ? kind.kg[0] : kg > kind.kg[2] ? kind.kg[2] : kg;
}

/** the medal a weight earns for its kind: 0 none, 1 bronze, 2 silver, 3 gold, 4 diamond */
export function medalOf(kind: FishKind, kg: number): number {
  const s = kg / kind.kg[2];
  return s >= MEDAL_AT.diamond ? 4 : s >= MEDAL_AT.gold ? 3 : s >= MEDAL_AT.silver ? 2 : s >= MEDAL_AT.bronze ? 1 : 0;
}
