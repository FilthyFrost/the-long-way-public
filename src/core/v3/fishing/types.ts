/**
 * Fishing's contract (node F1, docs/V3/nodes/F1-fishing.md): what a row of the fish table says, the classes
 * of water, the baits, and what a rig is. Types and a few constants only. Pure, no three, no DOM.
 */
import type { Rarity, Text } from '../contracts/base';

/** the classes of water a fish lives in: the first seven the world makes today, the rest come with later regions */
export type WaterClass = 'pond' | 'lake' | 'river' | 'tarn' | 'marsh' | 'oasis' | 'sea' | 'hotspring' | 'reef' | 'city' | 'surreal';
export const WATERS_TODAY: readonly WaterClass[] = ['pond', 'lake', 'river', 'tarn', 'marsh', 'oasis', 'sea'];

/** where in the water it swims */
export type Layer = 'top' | 'mid' | 'bottom';
/** when it feeds: by day, at dawn and dusk, by night, or at any hour */
export type Hours = 'day' | 'edge' | 'night' | 'any';
/** how it fights */
export type Fight = 'steady' | 'runner' | 'diver' | 'jumper' | 'brute';

/** the things that go on a hook: natural baits, then lures */
export type Bait = 'worm' | 'insect' | 'minnow' | 'dough' | 'corn' | 'shrimp' | 'squid' | 'cut' | 'spoon' | 'spinner' | 'crank' | 'jig' | 'softbait' | 'topwater' | 'fly';
export const BAITS: readonly Bait[] = ['worm', 'insect', 'minnow', 'dough', 'corn', 'shrimp', 'squid', 'cut', 'spoon', 'spinner', 'crank', 'jig', 'softbait', 'topwater', 'fly'];

/** what a kind of fish eats: how much each bait draws it, 0 … 1 (an archetype a species names) */
export type Diet = 'panfish' | 'carp' | 'predator' | 'trout' | 'catfish' | 'eel' | 'seabed' | 'pelagic' | 'cephalopod' | 'crustacean' | 'ice' | 'grazer';

export interface FishKind {
  /** snake_case; also the id of its item */
  readonly id: string;
  readonly name: Text;
  readonly water: WaterClass;
  /** it is caught only through the ice (the tarns of the cold country when frozen) */
  readonly ice?: boolean;
  readonly layer: Layer;
  readonly rarity: Rarity;
  readonly hours: Hours;
  /** it bites better in rain (1), in clear weather (−1), or does not care (0) */
  readonly weather: -1 | 0 | 1;
  readonly diet: Diet;
  /** how line-shy it is, 0 … 1: a wary fish wants a thin, hard-to-see line and gives a shorter moment to strike */
  readonly wary: number;
  readonly fight: Fight;
  /** weight (kg): the smallest worth catching, the usual, the largest there is */
  readonly kg: readonly [number, number, number];
  /** food points in one portion of its flesh (a portion is about 0.4 kg; small fish are a portion whole) */
  readonly food: number;
  /** what it is to the pot when not a fish: a squid and a crab are shellfish, a frog poultry */
  readonly cls?: 'shellfish' | 'poultry';
}

/** what is on the line */
export interface Rig {
  readonly bait: Bait;
  /** how the bait is fished: under a float (top and middle water), on the bottom, or cast and drawn back (a lure's depth follows its speed) */
  readonly style: 'float' | 'bottom' | 'lure';
  /** the hook's size, 1 (tiny) … 8 (huge) */
  readonly hook: number;
  /** the line's strength (N) and how easy it is to see, 0 (invisible) … 1 (a rope) */
  readonly lineN: number;
  readonly lineSeen: number;
}

/** what the conditions are for a cast */
export interface FishCond {
  /** the hour of the day, 0 … 24 */
  readonly hour: number;
  readonly raining: boolean;
  /** the water is frozen over (fishing through a hole) */
  readonly ice: boolean;
  /** how good the spot is, 0 … 1 */
  readonly spot: number;
}

/** the share of a kind's largest weight that earns each medal (the same ladder hunting uses) */
export const MEDAL_AT = { bronze: 0.35, silver: 0.55, gold: 0.75, diamond: 0.9 } as const;
/** a portion of fish, kg */
export const PORTION_KG = 0.4;
