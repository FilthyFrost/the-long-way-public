/**
 * Which fish live where and when (docs/DESIGN_V2.md 8.4, 11.2: the first chapter's twelve).
 *
 *   water   lake / stream / oasis (a lake in the desert) / ice (a frozen lake: a later package)
 *   time    dawn 5–8 h · day 8–17 h · dusk 17–20 h · night 20–5 h
 *   weather the moonfish only on clear nights, the rain eel only while or after it rains;
 *           rain lifts every rarer band (Dredge-like: "rain is one band rarer")
 *
 * Temperament (Stardew's fish behaviours, carried into the fight): steady, darting, sinker,
 * floater, brute. Shadow sizes: 0 small, 1 medium, 2 large, 3 huge.
 */
/** 'sea' (TerrainPoint.wkind 3) is fished the same way; its fish come with a later package */
export type WaterKind = 'lake' | 'stream' | 'oasis' | 'ice' | 'sea';
export type DaySlot = 'dawn' | 'day' | 'dusk' | 'night';
export type Temper = 'steady' | 'darting' | 'sinker' | 'floater' | 'brute';

export interface Species {
  /** catalogue id (items/catalog.ts) */
  id: string;
  waters: readonly WaterKind[];
  slots: readonly DaySlot[];
  /** shadow size class */
  size: 0 | 1 | 2 | 3;
  /** a long thin shadow (the eel) */
  slim?: boolean;
  temper: Temper;
  /** length range (cm) */
  len: readonly [number, number];
  /** 0 common, 1 uncommon, 2 rare, 3 legendary */
  rarity: 0 | 1 | 2 | 3;
  /** only under a clear sky */
  clear?: boolean;
  /** only while it rains or the ground is still wet from it */
  afterRain?: boolean;
  /** one in each lake, ever */
  onePerLake?: boolean;
}

const ALL: readonly DaySlot[] = ['dawn', 'day', 'dusk', 'night'];

export const SPECIES: readonly Species[] = [
  { id: 'fish.bleak', waters: ['lake', 'stream'], slots: ALL, size: 0, temper: 'steady', len: [8, 18], rarity: 0 },
  { id: 'fish.crucian', waters: ['lake'], slots: ['day'], size: 0, temper: 'steady', len: [12, 28], rarity: 0 },
  { id: 'fish.trout', waters: ['stream'], slots: ['dawn', 'dusk'], size: 1, temper: 'darting', len: [20, 45], rarity: 1 },
  { id: 'fish.perch', waters: ['lake'], slots: ['dusk'], size: 1, temper: 'brute', len: [22, 50], rarity: 1 },
  { id: 'fish.carp', waters: ['lake'], slots: ['day'], size: 2, temper: 'sinker', len: [35, 80], rarity: 1 },
  { id: 'fish.catfish', waters: ['lake'], slots: ['night'], size: 2, temper: 'sinker', len: [40, 110], rarity: 1 },
  { id: 'fish.pike', waters: ['lake'], slots: ['dawn'], size: 2, temper: 'darting', len: [45, 100], rarity: 2 },
  { id: 'fish.moon', waters: ['lake'], slots: ['night'], size: 1, temper: 'floater', len: [15, 30], rarity: 2, clear: true },
  { id: 'fish.eel', waters: ['stream'], slots: ALL, size: 1, slim: true, temper: 'darting', len: [40, 90], rarity: 2, afterRain: true },
  { id: 'fish.barb', waters: ['oasis'], slots: ['day'], size: 0, temper: 'steady', len: [10, 20], rarity: 0 },
  { id: 'fish.char', waters: ['ice'], slots: ['day'], size: 2, temper: 'brute', len: [40, 95], rarity: 1 },
  { id: 'fish.king', waters: ['lake'], slots: ['dusk'], size: 3, temper: 'brute', len: [120, 180], rarity: 3, onePerLake: true },
];

export function slotOf(hour: number): DaySlot {
  const h = ((hour % 24) + 24) % 24;
  return h >= 5 && h < 8 ? 'dawn' : h >= 8 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'dusk' : 'night';
}

export interface FishWeather {
  /** rain falling now */
  raining: boolean;
  /** the ground still wet from rain (0…1) */
  wetness: number;
  /** a clear sky (no cloud cover to speak of) */
  clear: boolean;
}

export const FAIR: FishWeather = { raining: false, wetness: 0, clear: true };

/** the fish that can be met in this water at this hour and weather */
export function speciesFor(water: WaterKind, hour: number, w: FishWeather = FAIR, out: Species[] = []): Species[] {
  const slot = slotOf(hour);
  for (const s of SPECIES) {
    if (!s.waters.includes(water) || !s.slots.includes(slot)) continue;
    if (s.clear && !w.clear) continue;
    if (s.afterRain && !(w.raining || w.wetness > 0.25)) continue;
    out.push(s);
  }
  return out;
}

/** how often each band turns up (rain: every rarer band one step likelier) */
export function weightOf(s: Species, w: FishWeather): number {
  const base = [10, 4, 1.4, 0.6][s.rarity];
  if (!w.raining) return base;
  return [10, 6, 2.4, 1][s.rarity];
}

/** a catch's shadow is drawn this long (m) from its size class */
export const SHADOW_LEN: readonly number[] = [0.25, 0.45, 0.75, 1.4];
