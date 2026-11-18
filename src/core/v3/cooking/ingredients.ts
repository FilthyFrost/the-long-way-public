/**
 * What each thing is to the pot (node C1, docs/V3/nodes/C1-cooking.md): the table of ingredients. The eighty
 * forage kinds get their row from their category, with a few said one by one; the packed foods and drinks the
 * game already has get a row each; fishing and hunting register theirs when they come (registerIngredients),
 * so no recipe has to be touched then. Pure data and lookups.
 */
import { FISH } from '../fishing/species';
import { FORAGE_KINDS } from '../forage/kinds';
import type { ForageCat } from '../forage/types';
import type { IngClass, Ingredient, Taste } from './types';

const T = (salt = 0, sweet = 0, sour = 0, hot = 0, umami = 0): Taste => [salt, sweet, sour, hot, umami];

/** what a forage category is to the pot unless a kind says otherwise; null: not an ingredient */
const BY_CAT: Readonly<Record<ForageCat, { cls: IngClass; taste: Taste } | null>> = {
  mushroom: { cls: 'mushroom', taste: T(0, 0, 0, 0, 2) },
  fruit: { cls: 'fruit', taste: T(0, 2, 1, 0, 0) },
  greens: { cls: 'veg', taste: T(0, 0, 0, 0, 1) },
  root: { cls: 'root', taste: T(0, 1, 0, 0, 0) },
  herb: { cls: 'herb', taste: T(0, 0, 0, 0, 1) },
  nut: { cls: 'nut', taste: T(0, 1, 0, 0, 1) },
  flower: { cls: 'flower', taste: T(0, 1, 0, 0, 0) },
  medicinal: { cls: 'herb', taste: T(0, 0, 0, 0, 0) },
  shore: { cls: 'shellfish', taste: T(1, 0, 0, 0, 2) },
  resource: null,
};

/** kinds that are not what their category is */
const KIND: Readonly<Record<string, { cls?: IngClass; taste?: Taste; food?: number; raw?: boolean } | null>> = {
  // mushrooms
  truffle: { taste: T(0, 0, 0, 0, 3) },
  matsutake: { taste: T(0, 0, 0, 0, 3) },
  reishi: { cls: 'herb', taste: T(0, 0, 0, 0, 0), food: 0 },
  // fruit
  cranberry: { taste: T(0, 1, 3, 0, 0) },
  sea_buckthorn: { taste: T(0, 1, 3, 0, 0) },
  wild_tomato: { cls: 'veg', taste: T(0, 1, 1, 0, 2) },
  cactus_fruit: { taste: T(0, 2, 0, 0, 0) },
  persimmon: { taste: T(0, 3, 0, 0, 0) },
  // greens
  wild_scallion: { cls: 'herb', taste: T(0, 0, 0, 1, 1) },
  samphire: { taste: T(2, 0, 0, 0, 1) },
  bamboo_shoot: { taste: T(0, 1, 0, 0, 2) },
  nettle: { taste: T(0, 0, 0, 0, 2) },
  purslane: { taste: T(0, 0, 1, 0, 0) },
  // roots
  potato: { taste: T(0, 0, 0, 0, 1), raw: false },
  ginseng: { cls: 'herb', taste: T(0, 1, 0, 0, 0) },
  agave_heart: { taste: T(0, 3, 0, 0, 0) },
  // herbs and spices
  sichuan_pepper: { cls: 'spice', taste: T(0, 0, 0, 2, 0) },
  chili: { cls: 'spice', taste: T(0, 0, 0, 3, 0) },
  wild_garlic: { taste: T(0, 0, 0, 1, 1) },
  mint: { taste: T(0, 1, 0, 0, 0) },
  pine_needle: { taste: T(0, 0, 1, 0, 0) },
  // nuts and grain
  wild_rice: { cls: 'grain', taste: T(0, 1, 0, 0, 0), raw: false },
  sorghum: { cls: 'grain', taste: T(0, 1, 0, 0, 0), raw: false },
  // flowers
  rose_hip: { taste: T(0, 1, 2, 0, 0) },
  tea_leaf: { taste: T(0, 0, 0, 0, 1) },
  // shore
  kelp: { cls: 'veg', taste: T(1, 0, 0, 0, 2) },
  water_chestnut: { cls: 'root', taste: T(0, 1, 0, 0, 0) },
  crab: { taste: T(1, 1, 0, 0, 3) },
  // resources that are food
  salt: { cls: 'spice', taste: T(3, 0, 0, 0, 0), food: 0 },
  honeycomb: { cls: 'sweet', taste: T(0, 3, 0, 0, 0) },
};

const ALL = new Map<string, Ingredient>();

function add(i: Ingredient): void {
  if (ALL.has(i.item)) throw new Error(`ingredient ${i.item} is in the table already`);
  ALL.set(i.item, i);
}

for (const k of FORAGE_KINDS) {
  const cat = BY_CAT[k.cat];
  const own = KIND[k.id];
  if (!cat && !own) continue;
  const eat = k.item.eat;
  add({
    item: k.id,
    cls: own?.cls ?? cat!.cls,
    food: own?.food ?? eat?.food ?? 0,
    hp: eat?.hp ?? 0,
    sick: eat?.effect === 'sick2' ? 2 : eat?.effect === 'sick1' ? 1 : 0,
    taste: own?.taste ?? cat!.taste,
    tags: ['forage', k.cat, ...(k.item.tags ?? [])],
    raw: own?.raw ?? true,
    processed: false,
  });
}

/** the packed foods and drinks of the game as it was (src/core/modcar/items.ts): already cooked or packed */
const PACKED: readonly [string, IngClass, number, Taste, readonly string[], (0 | 1 | 2)?][] = [
  ['food_chips', 'grain', 20, T(2, 0, 0, 0, 1), ['packed', 'crisp']],
  ['food_chips_ginger', 'grain', 20, T(2, 0, 0, 1, 1), ['packed', 'crisp', 'hot']],
  ['food_chips_ginger_xl', 'grain', 40, T(2, 0, 0, 1, 1), ['packed', 'crisp', 'hot']],
  ['food_licorice', 'sweet', 40, T(0, 3, 0, 0, 0), ['packed']],
  ['food_nuggets', 'poultry', 40, T(1, 0, 0, 0, 2), ['packed', 'meat']],
  ['food_dumplings', 'grain', 40, T(1, 0, 0, 0, 2), ['packed', 'dumpling', 'meat']],
  ['food_fish_can', 'fish', 75, T(1, 0, 0, 0, 2), ['packed', 'fish', 'tin']],
  ['food_dog_old', 'meat', 20, T(1, 0, 0, 0, 1), ['packed', 'meat', 'petfood'], 1],
  ['food_cat_old', 'fish', 20, T(1, 0, 0, 0, 1), ['packed', 'fish', 'petfood'], 1],
  ['food_nuts_old', 'nut', 40, T(1, 0, 0, 0, 1), ['packed']],
  ['drink_water', 'liquid', 0, T(), ['water']],
  ['drink_soda', 'liquid', 0, T(0, 2, 1, 0, 0), ['soda']],
  ['drink_cola', 'liquid', 0, T(0, 3, 0, 0, 0), ['soda']],
  ['drink_beer', 'liquid', 0, T(0, 0, 0, 0, 1), ['alcohol']],
  ['drink_spirit', 'liquid', 0, T(0, 0, 0, 1, 0), ['alcohol']],
];
for (const [item, cls, food, taste, tags, sick] of PACKED) add({ item, cls, food, hp: 0, sick: sick ?? 0, taste, tags, raw: true, processed: true });

// the fish of the fishing table (node F1 registers their items; the pot knows them already): never safe raw
for (const k of FISH) {
  const sea = k.water === 'sea' || k.water === 'reef';
  add({
    item: k.id,
    cls: k.cls ?? 'fish',
    food: k.food,
    hp: 0,
    sick: 0,
    taste: T(sea ? 1 : 0, 0, 0, 0, k.cls === 'shellfish' ? 3 : 2),
    tags: [k.cls === 'shellfish' ? 'seafood' : k.cls === 'poultry' ? 'meat' : 'fish', sea ? 'sea' : 'fresh', ...(k.cls === 'shellfish' ? ['shellfish'] : []), ...(k.kg[1] >= 1.5 ? ['bigfish'] : [])],
    raw: false,
    processed: false,
  });
}

/**
 * Cuts of meat and what else an animal gives the kitchen (node H1's hunting brings them; cooking's module
 * registers their items so that the developer's panel can hand them out before that). Never safe raw.
 */
export const MEAT_CUTS: readonly [string, string, string, IngClass, number, readonly string[]][] = [
  ['meat_venison', '鹿肉', 'Venison', 'meat', 16, ['meat', 'red', 'game']],
  ['meat_boar', '野猪肉', 'Wild boar', 'meat', 17, ['meat', 'red', 'game', 'fatty']],
  ['meat_rabbit', '兔肉', 'Rabbit', 'meat', 13, ['meat', 'white', 'game']],
  ['meat_fowl', '野禽肉', 'Wild fowl', 'poultry', 13, ['meat', 'bird', 'game']],
  ['meat_duck', '鸭肉', 'Duck', 'poultry', 15, ['meat', 'bird', 'game', 'fatty']],
  ['meat_bear', '熊肉', 'Bear meat', 'meat', 18, ['meat', 'red', 'game', 'fatty']],
  ['meat_bone', '骨头', 'Bones', 'meat', 3, ['bone']],
  ['meat_fat', '油脂', 'Fat', 'meat', 8, ['fat']],
  ['egg_wild', '野禽蛋', 'Wild eggs', 'egg', 9, ['egg']],
];
for (const [item, , , cls, food, tags] of MEAT_CUTS) add({ item, cls, food, hp: 0, sick: 0, taste: T(0, 0, 0, 0, cls === 'egg' ? 1 : 2), tags, raw: false, processed: false });

/** rows from another system (dried and smoked things, whatever else comes); an item twice throws */
export function registerIngredients(rows: readonly Ingredient[]): void {
  for (const r of rows) add(r);
}

/** what an item is to the pot; null: it does not go into one */
export function ingredient(item: string): Ingredient | null {
  return ALL.get(item) ?? null;
}

/** every ingredient, in the order they came into the table */
export function ingredients(): Ingredient[] {
  return [...ALL.values()];
}
