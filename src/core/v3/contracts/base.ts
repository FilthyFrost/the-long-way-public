/**
 * V3 shared vocabulary (docs/V3/ARCHITECTURE.md): the ids, small value types and conventions every V3
 * contract uses. Types and a few frozen constants only: no three, no DOM, no logic.
 *
 * Conventions that hold in every V3 contract and content table:
 *
 *  - Units are SI: metres, kilograms, seconds, metres per second, newtons, joules, degrees Celsius.
 *    Angles are radians unless the field's name ends in `Deg`. Shares and probabilities are 0…1.
 *  - Space: the world's own axes (src/core/world): x and z on the ground, y up; `s` is arc length along
 *    the road in metres from the start of the journey.
 *  - Time: `worldSeconds` is world time since the journey began; it is saved and never runs backwards.
 *    `hour` is the hour of the day as a float, 0 ≤ hour < 24. Nothing in a contract uses the wall clock.
 *  - Randomness: tables give weights and ranges; the dice are seeded hashes (src/core/math/rng.ts),
 *    never the system's random numbers.
 *  - An id is a lower-case snake_case string, unique within its table. One table refers to another by id.
 *    Ids are saved: once content has shipped in a save, its id is not renamed (add a migration instead).
 *  - Names shown to the player are `Text` (Chinese and English). Weapons and other made things carry
 *    invented names, never a real maker's or model's name.
 *  - Content scales by rows: a new animal, fish, dish or gun is a new row in a content table
 *    (src/core/v3/content/), never a new branch in code.
 */
import type { Text } from '../../modcar/types';

export type { Text };

// ------------------------------------------------------------------ ids

export type ItemId = string;
/** 'scrap' | 'organics' | 'chemicals' (the recycler's three) or a named material of the stash */
export type MaterialId = string;
export type RecipeId = string;
export type BlueprintId = string;
export type BenchTabId = string;
export type BenchAddonId = string;

export type RegionId = string;
/** one of today's six biomes (src/core/world/biomes.ts) or a V3 one */
export type BiomeId = string;
export type WonderId = string;
export type SiteKindId = string;
export type WaterKindId = string;
export type LandformOpId = string;

export type SpeciesId = string;
export type SkeletonFamilyId = string;
export type WeaponId = string;
export type AmmoId = string;
export type CalibreId = string;
export type AttachmentId = string;

export type FishId = string;
export type TackleId = string;
export type ForageId = string;

export type DishId = string;
export type CookwareId = string;
export type BuffId = string;

export type FurnitureId = string;
export type TrailerId = string;

export type SkillId = string;
export type CompendiumId = string;
export type NoticeId = string;

export type SoundId = string;
export type ModelId = string;

/** a free label on a row that other tables match on, e.g. `meat`, `fish`, `mushroom`, `spice`, `calibre:308` */
export type Tag = string;

// ------------------------------------------------------------------ small values

/** inclusive, min ≤ max */
export type Range = readonly [min: number, max: number];

/** hours of the day, 0…24; `from > to` wraps past midnight (e.g. [21, 4]) */
export type HourSpan = readonly [from: number, to: number];

/** the quality of one thing made, caught, picked or shot: 1…5 stars */
export type Stars = 1 | 2 | 3 | 4 | 5;

/** how often a kind turns up, in every table that grades by rarity */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export const RARITIES: readonly Rarity[] = ['common', 'uncommon', 'rare', 'legendary'];

/** the badge on a harvest card or a catch card, shared by hunting and fishing */
export type Medal = 'none' | 'bronze' | 'silver' | 'gold' | 'diamond' | 'legend';

export const MEDALS: readonly Medal[] = ['none', 'bronze', 'silver', 'gold', 'diamond', 'legend'];

/**
 * How demanding a region is to drive and look at (the pacing director's classes, docs/V3/PLAN.md
 * 世界生成 2.0): most of the way is calm, some is scenic, a little is a highlight.
 */
export type Intensity = 'calm' | 'scenic' | 'highlight';

export const INTENSITIES: readonly Intensity[] = ['calm', 'scenic', 'highlight'];

/** a row of a weighted table */
export interface Weighted<Id extends string = string> {
  readonly id: Id;
  /** relative weight, > 0 */
  readonly w: number;
}

/** how far along the journey something may first appear, km from the start: [from, to); to = Infinity for no end */
export type DistanceBand = readonly [fromKm: number, toKm: number];

/** a point on the ground */
export interface XZ {
  x: number;
  z: number;
}

/** a point in the world */
export interface XYZ {
  x: number;
  y: number;
  z: number;
}

/** something the tables can check at start-up: a list of what is wrong with a row, empty when it is sound */
export type Problems = string[];
