/**
 * Cooking's contract (node C1, docs/V3/nodes/C1-cooking.md): what an ingredient is to the pot, the ways of
 * cooking, what a recipe says and what a dish is. Types and a few constants only. Pure, no three, no DOM.
 */
import type { RegionId, Text } from '../contracts/base';

/** what an ingredient is to the pot */
export type IngClass = 'meat' | 'poultry' | 'fish' | 'shellfish' | 'egg' | 'mushroom' | 'veg' | 'root' | 'fruit' | 'grain' | 'nut' | 'herb' | 'spice' | 'flower' | 'sweet' | 'liquid';

/** the five tastes an ingredient adds, each 0 … 3: salt, sweet, sour, hot, savoury */
export type Taste = readonly [salt: number, sweet: number, sour: number, hot: number, umami: number];

export interface Ingredient {
  /** the item's id */
  readonly item: string;
  readonly cls: IngClass;
  /** food points of one portion as it goes into the pot */
  readonly food: number;
  /** health it carries (a medicinal herb's good, a toxic mushroom's harm) and the sickness it brings (0 none, 1, 2) however it is cooked */
  readonly hp: number;
  readonly sick: 0 | 1 | 2;
  readonly taste: Taste;
  readonly tags: readonly string[];
  /** safe to eat without heat (meat and fish are not) */
  readonly raw: boolean;
  /** already cooked or packed (a tin, frozen dumplings): cooking adds little to it */
  readonly processed: boolean;
}

/** the ways of cooking, each from its cookware */
export type Method = 'mix' | 'roast' | 'fry' | 'stirfry' | 'steam' | 'soup' | 'stew' | 'rice' | 'bake' | 'brew';

/** what a method does: how much more nourishing it makes fresh produce, the water a serving gains, whether it heats (raw things become safe), the cookware that does it */
export const METHODS: Readonly<Record<Method, { name: Text; gain: number; water: number; heats: boolean; cookware: readonly string[] }>> = {
  mix: { name: { zh: '拌', en: 'Toss' }, gain: 1.2, water: 0, heats: false, cookware: ['bowl'] },
  roast: { name: { zh: '烤', en: 'Roast' }, gain: 1.6, water: 0, heats: true, cookware: ['spit', 'grill'] },
  fry: { name: { zh: '煎', en: 'Pan-fry' }, gain: 1.7, water: 0, heats: true, cookware: ['pan'] },
  stirfry: { name: { zh: '炒', en: 'Stir-fry' }, gain: 1.7, water: 0, heats: true, cookware: ['wok'] },
  steam: { name: { zh: '蒸', en: 'Steam' }, gain: 1.7, water: 4, heats: true, cookware: ['steamer'] },
  soup: { name: { zh: '煮汤', en: 'Soup' }, gain: 1.8, water: 15, heats: true, cookware: ['pot'] },
  stew: { name: { zh: '炖', en: 'Stew' }, gain: 2.0, water: 8, heats: true, cookware: ['pot', 'dutch_oven'] },
  rice: { name: { zh: '饭面', en: 'Rice and noodles' }, gain: 2.0, water: 5, heats: true, cookware: ['pot'] },
  bake: { name: { zh: '烘焙', en: 'Bake' }, gain: 1.9, water: 0, heats: true, cookware: ['oven', 'dutch_oven'] },
  brew: { name: { zh: '饮品', en: 'Brew' }, gain: 1.0, water: 28, heats: true, cookware: ['kettle'] },
};

/** the twelve sorts of dish (docs/V3/CATALOG.md) */
export type DishClass = 'soup' | 'stew' | 'stirfry' | 'roast' | 'fry' | 'steam' | 'rice' | 'salad' | 'preserve' | 'sweet' | 'drink' | 'camp';

/** the timed buffs a dish may leave (buffs.ts has what each does) */
export type BuffId = 'warm' | 'cool' | 'vigor' | 'hearty' | 'hydrated' | 'sturdy' | 'keen' | 'steady' | 'quiet' | 'lucky';

/** one need of a recipe: `n` portions that are a given item, or carry a tag, or are of one of some classes */
export interface Slot {
  readonly item?: string;
  readonly tag?: string;
  readonly cls?: readonly IngClass[];
  readonly n: number;
}

export interface Recipe {
  readonly id: string;
  readonly cls: DishClass;
  readonly name: Text;
  readonly method: Method;
  /** what must be in the pot */
  readonly need: readonly Slot[];
  /** what else may be in it besides herbs, spices and liquids (which always may); absent: nothing else */
  readonly also?: readonly IngClass[];
  /** the taste it wants (for the seasoning step) */
  readonly taste?: Taste;
  readonly buff: BuffId;
  /** how long its buff lasts at three stars (s) */
  readonly buffS: number;
  /** the region whose signature dish it is */
  readonly region?: RegionId;
  /** the line on its card */
  readonly blurb: string;
}

/** one portion in the pot: its item, its quality (1 … 5 stars; absent 2) and how fresh (0 fresh, 1 still good, 2 going off) */
export interface PotItem {
  readonly item: string;
  readonly q?: number;
  readonly fresh?: 0 | 1 | 2;
}

/** how well each step went, 0 … 1; a step left out was not part of this cooking (free cooking has only the heat) */
export interface StepScores {
  readonly heat: number;
  readonly knife?: number;
  readonly season?: number;
}

/** what came out of the pot */
export interface Dish {
  /** the recipe it is (null: a dish of no recipe) */
  recipe: string | null;
  name: Text;
  cls: DishClass;
  servings: number;
  /** per serving */
  food: number;
  water: number;
  hp: number;
  /** the sickness a serving brings: 0 none, 1, 2 */
  sick: 0 | 1 | 2;
  buff: BuffId | null;
  buffS: number;
  stars: number;
  /** nobody could say what this is: edible, worth less, no buff */
  odd: boolean;
}

/** the most a serving feeds */
export const FOOD_CAP = 90;
/** what a recipe adds to a serving's food over a pot of no recipe */
export const RECIPE_BONUS = 10;
/** a pot of no recipe is never better than this many stars */
export const FREE_STARS = 3;
/** the most portions a pot takes */
export const POT_MAX = 5;
