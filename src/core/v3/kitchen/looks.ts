/**
 * What the kitchen's things look like (docs/V3/plan/cooking.md §2, §3): for each of the sixty ingredients the two colours
 * its own model is painted (public/models/modcar/items/food_<id>.glb, tools/blender/items/kitchen.py) and the shape it
 * takes once it is prepared — sliced, diced, shredded … — with the colours of that (its flesh, its skin); for each dish
 * the shape it comes to the table in (meal_<shape>.glb, tools/blender/items/meals.py) and its two colours, which are its
 * ingredients' as they come out of the pot.
 *
 * One prepared shape serves every ingredient cut that way, one dish shape every dish of its sort: sixty ingredients and
 * a hundred and sixty dishes are thirteen and thirty-four models, told apart by what they are painted.
 *
 * Pure data.
 */
import { DISH } from './dishes';
import { FOOD } from './pantry';

/** what an ingredient becomes on the board, and what of it lies in the pot */
export type Prep =
  | 'slices' | 'dice' | 'shreds' | 'wedges' | 'florets' | 'caps' | 'fillet'
  | 'mince' | 'strips' | 'beef_slices' | 'egg' | 'mound' | 'nest' | 'pool';

export const PREPS: readonly Prep[] = [
  'slices', 'dice', 'shreds', 'wedges', 'florets', 'caps', 'fillet',
  'mince', 'strips', 'beef_slices', 'egg', 'mound', 'nest', 'pool',
];

export interface FoodLook {
  /** its own model's two colours */
  readonly paint: number;
  readonly paint2: number;
  /** prepared: the shape, its flesh and its skin; null: it goes into the pot as it is (a shrimp, a crab) */
  readonly prep: Prep | null;
  readonly flesh: number;
  readonly skin: number;
  /** it is cut on the board (false: it is poured, cracked or dropped in as it is, and counts as prepared) */
  readonly chop: boolean;
}

type FoodRow = readonly [paint: number, paint2: number, prep: Prep | null, flesh: number, skin: number, chop?: 0];

const FOOD_ROWS: Readonly<Record<string, FoodRow>> = {
  // vegetables
  tomato: [0xd8432e, 0x4f8a3a, 'wedges', 0xe8604a, 0xd8432e],
  potato: [0xc9a468, 0x8a6a40, 'dice', 0xf0dc9a, 0xe8cc80],
  carrot: [0xe8822a, 0x5fa84a, 'slices', 0xf09a3a, 0xe8822a],
  onion: [0xc88a45, 0xe8dcc0, 'shreds', 0xf4ecd8, 0xe8d8b0],
  cabbage: [0xb4d684, 0x7fb060, 'shreds', 0xd4e89a, 0xa9cf7a],
  cucumber: [0x4f8f3f, 0xc9d88a, 'slices', 0xd4e8a0, 0x4f8f3f],
  corn: [0xf2cf4a, 0x9fc46a, 'mound', 0xf2cf4a, 0xf8e080],
  lettuce: [0x8fca5a, 0xd4e89a, 'shreds', 0xa9d870, 0xd4e89a],
  pepper: [0x4f9a3f, 0x3f7030, 'shreds', 0x5fa84a, 0x4f9a3f],
  eggplant: [0x5a3578, 0x4f8a3a, 'slices', 0xf0e8c8, 0x5a3578],
  pumpkin: [0xe8922a, 0x6f7a3a, 'dice', 0xf0a030, 0xe8922a],
  broccoli: [0x3f8a3a, 0x9fc46a, 'florets', 0x3f8a3a, 0x9fc46a],
  // aromatics
  garlic: [0xf0e8d8, 0xc9b890, 'mince', 0xf4ecd0, 0xe8dcb0],
  scallion: [0x5fae4a, 0xf0f0e0, 'mince', 0x5fae4a, 0xf0f0e0],
  ginger: [0xd2ab64, 0xf0dc9a, 'mince', 0xf0dc9a, 0xd2ab64],
  chili: [0xd6281e, 0x4f8a3a, 'mince', 0xd6281e, 0xf0c060],
  // mushrooms (sliced: `flesh` the cap, `skin` the pale cut)
  oyster: [0xb9ada0, 0xf0e8d8, 'caps', 0xb9ada0, 0xf0e8d8],
  shiitake: [0x8a5a3a, 0xe8d8b8, 'caps', 0x8a5a3a, 0xf0e4cc],
  porcini: [0xa86a38, 0xf0e0c0, 'caps', 0xa86a38, 0xf0e0c0],
  chanterelle: [0xf0a830, 0xd88a20, 'caps', 0xf0a830, 0xf6c860],
  matsutake: [0xb98a5a, 0xf0e4cc, 'caps', 0xb98a5a, 0xf0e4cc],
  truffle: [0x3a2e28, 0x8a7460, 'slices', 0x8a7460, 0x3a2e28],
  // wild greens
  shepherds: [0x5fa84a, 0xe8dcc0, 'shreds', 0x5fa84a, 0x7fc060],
  mint: [0x4fb06a, 0x3f8050, 'shreds', 0x4fb06a, 0x6fc88a],
  bamboo: [0xe8d49a, 0x8a6a48, 'slices', 0xf0e0a8, 0xe8d49a],
  // fruit
  apple: [0xd8382e, 0x5fa84a, 'wedges', 0xf8e8b0, 0xd8382e],
  berry: [0x5a3f9a, 0x5fa84a, 'mound', 0x5a3f9a, 0x7a5fc0, 0],
  strawberry: [0xe0303a, 0x4f9a3f, 'wedges', 0xf06a6a, 0xe0303a],
  orange: [0xf08a1e, 0x8a6a30, 'wedges', 0xf8a83a, 0xf08a1e],
  lemon: [0xf4d83a, 0xa8a030, 'slices', 0xf8e880, 0xf4d83a],
  banana: [0xf4d24a, 0x6a5030, 'slices', 0xf8ecb0, 0xf4d24a],
  watermelon: [0x3f8a3a, 0x1f5a2a, 'dice', 0xe8404a, 0x3f8a3a],
  // grain
  rice: [0xe8dcc0, 0xc8323a, 'mound', 0xf4f0e4, 0xe8e0cc, 0],
  flour: [0x3a6a9a, 0xf0e8d8, 'mound', 0xf4f0e8, 0xe8e0d0, 0],
  noodle: [0xf0d890, 0xc8323a, 'nest', 0xf0d890, 0xe8c870, 0],
  bread: [0xc98a45, 0xf0d8a0, 'slices', 0xf0d8a0, 0xc98a45],
  bean: [0x8a2f2a, 0xf0e8d8, 'mound', 0x8a2f2a, 0xa84a3a, 0],
  // eggs, dairy
  egg: [0xf0d8b8, 0xfaf0e0, 'egg', 0xf4b82a, 0xfaf6ea, 0],
  wildegg: [0xc9d8d0, 0x6a5a48, 'egg', 0xf0a020, 0xfaf6ea, 0],
  milk: [0x3a6a9a, 0x9fc4e8, 'pool', 0xfaf6ea, 0xffffff, 0],
  butter: [0xf4d870, 0xf0f0e8, 'dice', 0xf4d870, 0xf8e490, 0],
  cheese: [0xf0b83a, 0xd8902a, 'dice', 0xf0b83a, 0xf8d060],
  // meat
  chicken: [0xf0b8a0, 0xf4d8b0, 'dice', 0xf0b8a0, 0xf4c8b0],
  pork: [0xe07a7a, 0xf8e8e0, 'strips', 0xe07a7a, 0xf8e8e0],
  bacon: [0xb8483a, 0xf4d8c8, 'strips', 0xb8483a, 0xf4d8c8],
  duck: [0xb0404a, 0xf0d8a8, 'strips', 0xb0404a, 0xf0d8a8],
  beef: [0xa82a2a, 0xf8ece0, 'beef_slices', 0xb22828, 0xf8ece0],
  lamb: [0xc04a4a, 0xf8ece0, 'beef_slices', 0xc44444, 0xf8ece0],
  venison: [0x7a2028, 0xc8a0a0, 'beef_slices', 0x86242c, 0xf0dcd4],
  // fish and shellfish
  brookfish: [0x7a8a6a, 0xe8e8d8, 'fillet', 0xf0e0d0, 0x7a8a6a],
  trout: [0x6a8a7a, 0xf0d8c8, 'fillet', 0xf4b8a0, 0x6a8a7a],
  salmon: [0x7a8a9a, 0xe8e8e8, 'fillet', 0xf08a5a, 0x7a8a9a],
  tuna: [0x2f4a6a, 0xd8dce0, 'fillet', 0xc8303a, 0x2f4a6a],
  shrimp: [0xe8a090, 0xd86a4a, null, 0xe8a090, 0xd86a4a, 0],
  clam: [0xc9b89a, 0xe8dcc8, null, 0xc9b89a, 0xe8dcc8, 0],
  crab: [0xc84a2a, 0xe06a3a, null, 0xc84a2a, 0xe06a3a, 0],
  lobster: [0xb8302a, 0xd84a30, null, 0xb8302a, 0xd84a30, 0],
  // the rest
  walnut: [0xb08a5a, 0x7a5a38, 'mince', 0xd8b880, 0xb08a5a],
  honey: [0xe8a020, 0x8a5a2a, 'pool', 0xe8a020, 0xf8c850, 0],
  tofu: [0xf4f0e0, 0x4f9a8a, 'dice', 0xf4f0e0, 0xfaf6ea],
};

export const FOOD_LOOK: Readonly<Record<string, FoodLook>> = Object.fromEntries(
  Object.entries(FOOD_ROWS).map(([id, [paint, paint2, prep, flesh, skin, chop]]) => [id, { paint, paint2, prep, flesh, skin, chop: chop !== 0 }]),
);

/** the shapes a dish comes to the table in (meal_<shape>.glb) */
export type Meal =
  | 'stirfry' | 'cutlet' | 'fish' | 'egg' | 'omelette' | 'friedrice' | 'noodles' | 'toast' | 'pancake' | 'sandwich' | 'skewer' | 'roast' | 'shell'
  | 'sashimi' | 'dumpling' | 'stuffed' | 'curry' | 'cookie' | 'loaf' | 'soup' | 'stew' | 'noodlesoup' | 'congee' | 'ricebowl' | 'salad' | 'custard'
  | 'hotpot' | 'glass' | 'mug' | 'pie' | 'pizza' | 'cake' | 'mess' | 'burnt';

export const MEALS: readonly Meal[] = [
  'stirfry', 'cutlet', 'fish', 'egg', 'omelette', 'friedrice', 'noodles', 'toast', 'pancake', 'sandwich', 'skewer', 'roast', 'shell',
  'sashimi', 'dumpling', 'stuffed', 'curry', 'cookie', 'loaf', 'soup', 'stew', 'noodlesoup', 'congee', 'ricebowl', 'salad', 'custard',
  'hotpot', 'glass', 'mug', 'pie', 'pizza', 'cake', 'mess', 'burnt',
];

export interface DishLook {
  readonly meal: Meal;
  /** what it is mostly made of, what is second in it */
  readonly paint: number;
  readonly paint2: number;
  /** it is eaten from a bowl or a cup (the rest: from a plate) */
  readonly bowl: boolean;
}

/** the shapes that are a bowl's or a cup's: what such a dish is dished up into */
const BOWLS: ReadonlySet<Meal> = new Set<Meal>(['soup', 'stew', 'noodlesoup', 'congee', 'ricebowl', 'salad', 'custard', 'hotpot', 'glass', 'mug']);

type DishRow = readonly [meal: Meal, paint: number, paint2: number];

const DISH_ROWS: Readonly<Record<string, DishRow>> = {
  // ---- by kinds: a pan
  stir_veg: ['stirfry', 0x6fb84a, 0xe8e0b0],
  fried_egg: ['egg', 0xf4b82a, 0x5fae4a],
  fried_mushroom: ['stirfry', 0xa8744a, 0xe8d8b8],
  pan_meat: ['cutlet', 0x9a5230, 0x5fa84a],
  pan_fish: ['fish', 0xd8a050, 0x7fc060],
  veg_egg: ['stirfry', 0xf4c84a, 0x6fb84a],
  meat_veg: ['stirfry', 0x9a5230, 0x6fb84a],
  mushroom_meat: ['stirfry', 0x9a5230, 0xc8a070],
  egg_fried_rice: ['friedrice', 0xf0d070, 0x6fb84a],
  fried_noodle: ['noodles', 0xd8a850, 0x6fb84a],
  toast: ['toast', 0xe8b060, 0xf4d870],
  shell_stir: ['shell', 0xe8603a, 0x5fae4a],
  fried_tofu: ['stirfry', 0xe8c070, 0x5fae4a],
  // a pot
  veg_soup: ['soup', 0xd8c070, 0x6fb84a],
  mushroom_soup: ['soup', 0xc8a878, 0x8a5a3a],
  meat_stew: ['stew', 0x8a4a2a, 0xb87850],
  fish_soup: ['soup', 0xf0e8d0, 0xe8c8a0],
  congee: ['congee', 0xe8dcc0, 0x5fae4a],
  noodle_soup: ['noodlesoup', 0xd8b070, 0x6fb84a],
  boiled_egg: ['egg', 0xf4b82a, 0xf4f0e4],
  bean_soup: ['soup', 0xa8503a, 0x8a2f2a],
  shell_boil: ['shell', 0xf07050, 0x7fc060],
  compote: ['soup', 0xf0c890, 0xe86a5a],
  mixed_pot: ['hotpot', 0xd8a860, 0xa85a3a],
  tofu_soup: ['soup', 0xe8dcc0, 0xf4f0e0],
  // a bowl
  salad: ['salad', 0x8fca5a, 0xd8432e],
  fruit_salad: ['salad', 0xf4c84a, 0xe0303a],
  fruit_milk: ['glass', 0xf8d8c8, 0xe86a5a],
  veg_sandwich: ['sandwich', 0x8fca5a, 0xd8432e],
  // a grill, a steamer, an oven, a kettle
  skewer: ['skewer', 0x9a5230, 0x6fb84a],
  grilled_fish: ['fish', 0xc88840, 0x7fc060],
  grilled_veg: ['skewer', 0x6fb84a, 0xe8a03a],
  grilled_mushroom: ['skewer', 0xa8744a, 0xe8d8b8],
  grilled_shell: ['shell', 0xe05030, 0xf4d83a],
  steamed_fish: ['fish', 0xe8dcc8, 0x5fae4a],
  steamed_egg: ['custard', 0xf4d870, 0x5fae4a],
  steamed_veg: ['stirfry', 0x7fc060, 0xe8a03a],
  steamed_shell: ['shell', 0xf08060, 0x5fae4a],
  roast_meat: ['roast', 0x9a5028, 0x6fb84a],
  fruit_tea: ['mug', 0xd8704a, 0xf4a03a],
  herb_tea: ['mug', 0xa8c070, 0x4fb06a],
  // ---- by name: a pan
  tomato_egg: ['stirfry', 0xe0482e, 0xf4c84a],
  potato_shreds: ['noodles', 0xf0d890, 0xd6281e],
  garlic_broccoli: ['stirfry', 0x3f8a3a, 0xf0e8d0],
  pepper_pork: ['stirfry', 0x5fa84a, 0xa85a3a],
  yuxiang_eggplant: ['stirfry', 0x6a3f8a, 0xc8482a],
  bacon_egg: ['egg', 0xf4b82a, 0xb8483a],
  bacon_fried_rice: ['friedrice', 0xf0d070, 0xb8483a],
  onion_beef: ['stirfry', 0x8a4028, 0xf0e0b8],
  kungpao: ['stirfry', 0xb8683a, 0xd6281e],
  mapo: ['stew', 0xc8402a, 0xf4f0e0],
  scallion_egg: ['omelette', 0xf4c84a, 0x5fae4a],
  shrimp_egg: ['stirfry', 0xf4d060, 0xf08a70],
  butter_chanterelle: ['stirfry', 0xf0a830, 0xf4e090],
  bamboo_pork: ['stirfry', 0xe8d49a, 0xa85a3a],
  cheese_omelette: ['omelette', 0xf4c84a, 0xf0b83a],
  pancake: ['pancake', 0xe8b060, 0xb0621e],
  french_toast: ['toast', 0xe8a850, 0xf4d870],
  steak: ['cutlet', 0x7a3a22, 0x5fa84a],
  lamb_chop: ['cutlet', 0x8a4a30, 0x4fb06a],
  salmon_steak: ['cutlet', 0xf08a5a, 0x6fb84a],
  garlic_shrimp: ['shell', 0xf07050, 0xf0e8c0],
  orange_duck: ['cutlet', 0x9a4a2a, 0xf08a1e],
  corn_fritter: ['pancake', 0xf2cf4a, 0xf8e8a0],
  shepherds_egg: ['stirfry', 0xf4c84a, 0x5fa84a],
  cabbage_bacon: ['stirfry', 0xb4d684, 0xb8483a],
  porcini_beef: ['stirfry', 0x8a4028, 0xa86a38],
  oyster_egg: ['stirfry', 0xf4c84a, 0xb9ada0],
  berry_toast: ['toast', 0xe8b060, 0x5a3f9a],
  wild_frittata: ['omelette', 0xf0c040, 0x8a5a3a],
  fried_brookfish: ['fish', 0xe0a848, 0xf4d83a],
  cucumber_egg: ['stirfry', 0xf4c84a, 0x7fb85a],
  broccoli_shrimp: ['stirfry', 0x3f8a3a, 0xf08a70],
  blt: ['sandwich', 0xb8483a, 0x8fca5a],
  // a pot
  potato_beef: ['stew', 0x8a4a2a, 0xe8c070],
  tomato_beef: ['stew', 0xc8402a, 0x8a4028],
  pumpkin_soup: ['soup', 0xf0a030, 0xfaf6ea],
  cream_mushroom: ['soup', 0xf0e4c8, 0x8a5a3a],
  shiitake_chicken: ['stew', 0xb8804a, 0xf0d8b0],
  corn_pork: ['stew', 0xd8b060, 0xf2cf4a],
  borscht: ['soup', 0xb8283a, 0xf4f0e0],
  clam_pasta: ['noodles', 0xf0d890, 0xc9b89a],
  tomato_egg_noodle: ['noodlesoup', 0xe0583a, 0xf4c84a],
  beef_noodle: ['noodlesoup', 0x8a4a2a, 0x7a3a22],
  shrimp_congee: ['congee', 0xf08a70, 0x5fae4a],
  chicken_congee: ['congee', 0xd8a878, 0x5fae4a],
  lamb_stew: ['stew', 0xa85a3a, 0xe8822a],
  venison_stew: ['stew', 0x6a3020, 0xb08a60],
  fish_tofu: ['soup', 0xf4ecd8, 0xf4f0e0],
  egg_drop: ['soup', 0xe0583a, 0xf4d060],
  chicken_curry: ['curry', 0xc8882a, 0xe8c070],
  bean_bacon: ['stew', 0x9a4a30, 0xb8483a],
  duck_bamboo: ['soup', 0xd8b878, 0xe8d49a],
  crab_congee: ['congee', 0xe0603a, 0x5fae4a],
  mac_cheese: ['noodles', 0xf4c040, 0xb8483a],
  bean_rice: ['friedrice', 0xe8d8c0, 0x8a2f2a],
  oyster_pork_soup: ['soup', 0xe8d8b0, 0xb9ada0],
  carbonara: ['noodles', 0xf0d890, 0xb8483a],
  brookfish_soup: ['soup', 0xf0e8d0, 0x5fae4a],
  // a bowl
  caesar: ['salad', 0x8fca5a, 0xf0d8a0],
  smashed_cucumber: ['salad', 0x7fb85a, 0xd6281e],
  tuna_salad: ['salad', 0x8fca5a, 0xc8303a],
  berry_shake: ['glass', 0xb07ac8, 0x5a3f9a],
  banana_milk: ['glass', 0xf8e8b0, 0xf4d24a],
  honey_fruit: ['salad', 0xf4c84a, 0xb08a5a],
  salmon_sashimi: ['sashimi', 0xf08a5a, 0xf4a070],
  cold_tofu: ['stirfry', 0xf4f0e0, 0x5fae4a],
  watermelon_juice: ['glass', 0xe8404a, 0x4fb06a],
  watermelon_cheese: ['salad', 0xe8404a, 0xf4f0d8],
  // a grill
  grilled_corn: ['skewer', 0xf2cf4a, 0xe8a83a],
  lamb_skewer: ['skewer', 0x9a4a2a, 0xd6281e],
  honey_chicken: ['roast', 0xc8782a, 0x6fb84a],
  garlic_eggplant: ['stuffed', 0x6a3f8a, 0xf0e0b0],
  grilled_matsutake: ['skewer', 0xb98a5a, 0xf0e4cc],
  lemon_trout: ['fish', 0xc89050, 0xf4d83a],
  // a steamer
  steamed_trout: ['fish', 0xe8d8c8, 0x5fae4a],
  garlic_clam: ['shell', 0xc9b89a, 0x5fae4a],
  steamed_crab: ['shell', 0xe0502a, 0xf0dc9a],
  shrimp_custard: ['custard', 0xf4d870, 0xf08a70],
  honey_pumpkin: ['stuffed', 0xe8922a, 0xf0b840],
  dumpling: ['dumpling', 0x8fca5a, 0x3a2a20],
  shepherds_dumpling: ['dumpling', 0x5fa84a, 0x3a2a20],
  stuffed_pepper: ['stuffed', 0x4f9a3f, 0xb8704a],
  egg_pudding: ['custard', 0xf4d870, 0xb0621e],
  // an oven
  apple_pie: ['pie', 0xe8b850, 0xd8382e],
  baked_potato: ['stuffed', 0xc9a468, 0xf4d870],
  pizza: ['pizza', 0xd8432e, 0x4f9a3f],
  berry_tart: ['pie', 0x6a3f9a, 0xe0303a],
  banana_bread: ['loaf', 0xb07a3a, 0x7a5a38],
  roast_chicken: ['roast', 0xc8822a, 0xf4d83a],
  cheesecake: ['cake', 0xe0303a, 0xf4e0a0],
  walnut_cookie: ['cookie', 0xc8904a, 0x7a5a38],
  strawberry_cake: ['cake', 0xe0303a, 0xf4e0b0],
  garlic_bread: ['toast', 0xe8b060, 0x7fc060],
  baked_apple: ['stuffed', 0xd8382e, 0xe8b850],
  // a kettle
  lemon_honey: ['mug', 0xe8c040, 0xf4d83a],
  mint_lemon: ['glass', 0xd8e8a0, 0x4fb06a],
  honey_milk: ['mug', 0xfaf0d8, 0xe8a020],
  ginger_tea: ['mug', 0xc8882a, 0xd2ab64],
  // ---- feasts
  paella: ['friedrice', 0xe8a830, 0xe8603a],
  matsutake_chicken: ['hotpot', 0xd8b870, 0xb98a5a],
  butter_lobster: ['shell', 0xd8402a, 0xf4d870],
  truffle_pasta: ['noodles', 0xf0d890, 0x3a2e28],
  sashimi_platter: ['sashimi', 0xc8303a, 0xf08a5a],
  herb_lamb_rack: ['roast', 0x9a4a2a, 0x4fb06a],
  wellington: ['loaf', 0xc8904a, 0x8a3a2a],
  seafood_pot: ['hotpot', 0xe8703a, 0xe0502a],
  truffle_steak: ['cutlet', 0x7a3a22, 0x3a2e28],
  bouillabaisse: ['hotpot', 0xe07030, 0xf08a70],
  orange_roast_duck: ['roast', 0xa85a22, 0xf08a1e],
  roast_venison: ['roast', 0x7a3a22, 0xe8822a],
  crab_noodle: ['noodlesoup', 0xe8a050, 0xe0502a],
  mushroom_risotto: ['friedrice', 0xf0e0b0, 0xa86a38],
  surf_turf: ['cutlet', 0x7a3a22, 0xd8402a],
  farm_breakfast: ['egg', 0xf4b82a, 0xb8483a],
  fruit_layer_cake: ['cake', 0xf08a1e, 0xf4e0b0],
  lobster_bisque: ['soup', 0xe8703a, 0xfaf0e0],
  tuna_bowl: ['ricebowl', 0xc8303a, 0x5fae4a],
  harvest_stew: ['stew', 0xd8922a, 0xf2cf4a],
};

/** each dish's look, by its id (dishes.ts) */
export const DISH_LOOK: Readonly<Record<string, DishLook>> = Object.fromEntries(
  Object.entries(DISH_ROWS).map(([id, [meal, paint, paint2]]) => [id, { meal, paint, paint2, bowl: BOWLS.has(meal) }]),
);

/** what the three failures look like (cook.ts Fail) */
export const FAIL_LOOK: Readonly<Record<'mess' | 'burnt' | 'raw', DishLook>> = {
  mess: { meal: 'mess', paint: 0x6a5a7a, paint2: 0x8fa04a, bowl: false },
  burnt: { meal: 'burnt', paint: 0xe86a1e, paint2: 0x8a8a8a, bowl: false },
  raw: { meal: 'mess', paint: 0xe0a0a0, paint2: 0xf0e0d0, bowl: false },
};

/** what is wrong with these tables (nothing: an empty list): an ingredient or a dish without a look, a look of nothing */
export function lookProblems(): string[] {
  const bad: string[] = [];
  for (const id of Object.keys(FOOD)) if (!FOOD_LOOK[id]) bad.push(`ingredient ${id} has no look`);
  for (const id of Object.keys(FOOD_LOOK)) if (!FOOD[id]) bad.push(`a look for ${id}, which is no ingredient`);
  for (const id of Object.keys(DISH)) if (!DISH_LOOK[id]) bad.push(`dish ${id} has no look`);
  for (const id of Object.keys(DISH_LOOK)) if (!DISH[id]) bad.push(`a look for ${id}, which is no dish`);
  return bad;
}
