/**
 * What the cooking module adds to the game's catalogues besides the core's dishes and cookware
 * (src/core/v3/cooking/items.ts): the cuts of meat and the eggs as items (hunting brings them later; the
 * developer's panel hands them out now), the twelve recipe pages, the skill 烹饪 with its four perks, the
 * stations and what each has of its own, and the words the module says. Pure data: nothing here touches the
 * page or the game.
 */
import type { ItemRow } from '../../../../core/modcar/items';
import type { Text } from '../../../../core/v3/contracts/base';
import { MEAT_CUTS } from '../../../../core/v3/cooking/ingredients';
import type { DishClass, Method } from '../../../../core/v3/cooking/types';
import type { SkillDef } from '../../../../core/v3/progress/types';

/** the skill's id, and the field of the compendium the recipes are kept in */
export const COOK_SKILL_ID = 'cooking';
export const COOK_DOMAIN = 'dish';

/** the perks' ids */
export const PERK_TASTE = 'cook_taste';
export const PERK_EXTRA = 'cook_extra';
export const PERK_KEEP = 'cook_keep';
export const PERK_MASTER = 'cook_master';

export const COOK_SKILL: SkillDef = {
  id: COOK_SKILL_ID,
  name: { zh: '烹饪', en: 'Cooking' },
  perks: [
    { id: PERK_TASTE, level: 5, name: { zh: '舌头灵', en: 'A good palate' }, blurb: { zh: '调味时看得到这道菜要的味道，差一点也算得上好。', en: 'The taste a dish wants shows as you season, and near enough counts for more.' } },
    { id: PERK_EXTRA, level: 10, name: { zh: '会匀', en: 'Making it stretch' }, blurb: { zh: '有机会多盛出一份。', en: 'A chance of one more serving from the pot.' } },
    { id: PERK_KEEP, level: 15, name: { zh: '会存', en: 'Keeping well' }, blurb: { zh: '做好的菜放得久一倍。', en: 'Dishes keep twice as long.' } },
    { id: PERK_MASTER, level: 20, name: { zh: '大厨', en: 'Master cook' }, blurb: { zh: '不照菜谱的一锅也能做到四星。', en: 'A pot of no recipe may reach four stars.' } },
  ],
};

/** the chance of one more serving with the perk cook_extra */
export const EXTRA_CHANCE = 0.3;

/** experience for a dish: a pot of no recipe, a recipe, a star more; a recipe cooked for the first time counts so many times */
export const XP_FREE = 3;
export const XP_RECIPE = 6;
export const XP_STAR = 2;
export const XP_FIRST = 3;

// ------------------------------------------------------------------ the cuts of meat and the eggs

/** game hours a raw cut keeps, and eggs */
const MEAT_HOURS = 30;
const EGG_HOURS = 120;

/** their colours (the meat and its fat; bones; eggs), for the one model each */
const MEAT_PAINT: Readonly<Record<string, [number, number, string]>> = {
  meat_venison: [0x8e3a32, 0xe8d6c4, 'meat_cut'],
  meat_boar: [0xa84a44, 0xf0e0cc, 'meat_cut'],
  meat_rabbit: [0xc8786a, 0xf2e6d8, 'meat_cut'],
  meat_fowl: [0xe0a48a, 0xf6ead8, 'meat_cut'],
  meat_duck: [0xb05a4a, 0xf4e4ca, 'meat_cut'],
  meat_bear: [0x7a3028, 0xe6d4be, 'meat_cut'],
  meat_bone: [0xece2cc, 0xb88a6a, 'meat_bone'],
  meat_fat: [0xf2e8d2, 0xd8c4a4, 'meat_cut'],
  egg_wild: [0xe6dcc4, 0x8a7a5e, 'egg_wild'],
};

/** the cuts of meat and the eggs (the core's MEAT_CUTS): food, never safe raw — eaten raw they give nothing but a sore stomach */
export const MEAT_ROWS: readonly ItemRow[] = MEAT_CUTS.map(([id, zh, en, cls, , tags]) => {
  const egg = cls === 'egg';
  const [paint, paint2, model] = MEAT_PAINT[id] ?? [0x9a4a3c, 0xeadccc, 'meat_cut'];
  return {
    id,
    cat: 'food',
    name: { zh, en },
    stars: 2,
    mass: egg ? 0.3 : id === 'meat_bone' ? 0.6 : 0.5,
    carry: 'small',
    stack: egg ? 6 : 4,
    tags: ['raw_meat', ...tags],
    perish: { hours: egg ? EGG_HOURS : MEAT_HOURS },
    eat: { food: 0, hp: 0, sec: 3.9, effect: 'sick1' },
    salvage: { organics: 2 },
    model,
    paint,
    paint2,
    blurb: egg ? '一窝野禽蛋。生吃要闹肚子，煎一煎、蒸一蒸就好了。' : id === 'meat_bone' ? '带点肉的骨头，熬汤最好。生的不能吃。' : `${zh}，生的。不能生吃，下锅做熟了才行。`,
  };
});

// ------------------------------------------------------------------ the recipe pages

/** the classes of dish in the catalogue's order */
export const DISH_CLASSES: readonly DishClass[] = ['soup', 'stew', 'stirfry', 'roast', 'fry', 'steam', 'rice', 'salad', 'preserve', 'sweet', 'drink', 'camp'];

export const DISH_CLASS_NAME: Readonly<Record<DishClass, Text>> = {
  soup: { zh: '汤', en: 'Soups' },
  stew: { zh: '炖菜', en: 'Stews' },
  stirfry: { zh: '小炒', en: 'Stir-fries' },
  roast: { zh: '烧烤', en: 'Roasts' },
  fry: { zh: '煎物', en: 'Pan-fries' },
  steam: { zh: '蒸菜', en: 'Steamed' },
  rice: { zh: '饭面', en: 'Rice and noodles' },
  salad: { zh: '凉拌', en: 'Cold dishes' },
  preserve: { zh: '腌熏干货', en: 'Preserves' },
  sweet: { zh: '甜点', en: 'Sweets' },
  drink: { zh: '饮品', en: 'Drinks' },
  camp: { zh: '野营简餐', en: 'Camp food' },
};

/** the id of the page that teaches every recipe of a class */
export function recipePageId(cls: DishClass): string {
  return `recipe_page_${cls}`;
}

export const PAGE_ROWS: readonly ItemRow[] = DISH_CLASSES.map((c) => ({
  id: recipePageId(c),
  cat: 'gear',
  name: { zh: `菜谱页：${DISH_CLASS_NAME[c].zh}`, en: `Recipe page: ${DISH_CLASS_NAME[c].en}` },
  stars: 2,
  mass: 0.02,
  carry: 'small',
  tags: ['recipe_page'],
  salvage: { organics: 1 },
  model: 'recipe_page',
  paint: 0xefe3c6,
  paint2: 0xb8693a,
  blurb: `从一本旧菜谱上撕下来的一页，写满了${DISH_CLASS_NAME[c].zh}的做法。拿到手里看一看，这一类的菜就都会做了。`,
}));

/** the class a page teaches, by the page's id */
export const PAGE_CLASS: ReadonlyMap<string, DishClass> = new Map(DISH_CLASSES.map((c) => [recipePageId(c), c]));

// ------------------------------------------------------------------ the stations

/** a fire ring of a place, a camp stove set down, the workshop's kitchen corner; a drying rack and a smoker set down */
export type StationKind = 'fire' | 'stove' | 'kitchen' | 'rack' | 'smoker';

/** the cookware of the ways of cooking at a pot (the three ways of keeping are stations of their own) */
export const POT_METHODS: readonly Method[] = ['mix', 'roast', 'fry', 'stirfry', 'steam', 'soup', 'stew', 'rice', 'bake', 'brew'];

/**
 * What a station has of its own, and what of the cookware at hand it can use: a fire ring roasts on a stick and
 * boils water in a can, and takes a pan, a pot, a kettle, a grill or a bowl from the hands; a camp stove is a
 * burner and nothing else (what it cooks is what is in the hands or lies by it); the kitchen corner has every
 * pan and pot hanging over it.
 */
export const STATION_GEAR: Readonly<Record<StationKind, { own: readonly string[]; takes: readonly string[] }>> = {
  fire: { own: ['spit', 'kettle'], takes: ['pan', 'pot', 'dutch_oven', 'grill', 'kettle', 'bowl'] },
  stove: { own: [], takes: ['bowl', 'grill', 'pan', 'wok', 'steamer', 'pot', 'dutch_oven', 'kettle'] },
  kitchen: { own: ['bowl', 'spit', 'grill', 'pan', 'wok', 'steamer', 'pot', 'dutch_oven', 'oven', 'kettle'], takes: [] },
  rack: { own: ['rack'], takes: [] },
  smoker: { own: ['smoker'], takes: [] },
};

export const STATION_NAME: Readonly<Record<StationKind, Text>> = {
  fire: { zh: '篝火', en: 'Fire ring' },
  stove: { zh: '便携灶', en: 'Camp stove' },
  kitchen: { zh: '厨房角', en: 'Kitchen corner' },
  rack: { zh: '晾干架', en: 'Drying rack' },
  smoker: { zh: '烟熏箱', en: 'Smoker box' },
};

/**
 * The workshop's kitchen corner (world metres, the garage's frame: x towards the gate): a counter against the
 * front wall to the left of the doors as one comes up the yard, its front to the yard (+x), the hob at its
 * middle. The generator stands on the other side of the doors.
 */
export const KITCHEN = { x: 7.78, z: 4.65, heading: 0, w: 1.8, d: 0.62, h: 0.9, hobY: 0.92 } as const;

/** how near a station must be to cook at it (m, from the eye; the player's pick reaches 2.6) */
export const STATION_REACH = 3.2;
/** the cookware at hand for a camp stove: in the hotbar, or lying within this of it (m) */
export const STOVE_GEAR_M = 2;
/** a jar or a cool box set down within this of the station lends its contents (m) */
export const PANTRY_M = 3;

export const WORDS = {
  cook: { zh: '做饭', en: 'Cook' } as Text,
  keep: { zh: '晾晒 / 烟熏', en: 'Dry / smoke' } as Text,
  atFeet: { zh: '拿不下的放在脚边了', en: 'the rest is at your feet' } as Text,
  unknown: { zh: '？', en: '?' } as Text,
};

/** the five tastes, in the order of the core's Taste, and the key that adds a pinch of each */
export const TASTES: readonly { zh: string; en: string; key: string; label: string }[] = [
  { zh: '咸', en: 'Salt', key: 'KeyZ', label: 'Z' },
  { zh: '甜', en: 'Sweet', key: 'KeyX', label: 'X' },
  { zh: '酸', en: 'Sour', key: 'KeyC', label: 'C' },
  { zh: '辣', en: 'Heat', key: 'KeyV', label: 'V' },
  { zh: '鲜', en: 'Savoury', key: 'KeyB', label: 'B' },
];

/** what a pinch adds to its taste (the core's tastes run 0 … 3) */
export const PINCH = 0.5;

/** the five bands of doneness (steps.ts band) and the four flames */
export const BAND_NAME: readonly Text[] = [
  { zh: '生', en: 'Raw' },
  { zh: '嫩', en: 'Tender' },
  { zh: '正好', en: 'Just right' },
  { zh: '过头', en: 'Overdone' },
  { zh: '焦', en: 'Burnt' },
];
export const HEAT_NAME: readonly Text[] = [
  { zh: '关火', en: 'Off' },
  { zh: '小火', en: 'Low' },
  { zh: '中火', en: 'Medium' },
  { zh: '大火', en: 'High' },
];
