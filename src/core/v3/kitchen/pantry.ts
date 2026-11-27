/**
 * The kitchen's pantry (docs/V3/plan/cooking.md §2): the sixty ingredients a dish is made of and named by — garden
 * vegetables, the aromatics, mushrooms, wild greens, fruit, grain, eggs and dairy, meat, fish and shellfish — and the six
 * seasonings, which are no ingredient: there is always enough of them, and they are a pinch over the pot, not a portion
 * in it. An ingredient's star is how hard it is to come by (1 by every road … 5 a find): what dishes it makes follow.
 *
 * Its tags are what a dish may ask for in place of a name ("any mushroom", "any fish"). Whatever else is edible in the
 * world — the forage kinds, the fish of the rod — stands in by its class (`standIns`): it fills a tag, never a name.
 *
 * Pure data. Where each will come from (garden, wild, larder, hunt, rod, shore) is said for the modules to come: the
 * test panel hands out all of them for now.
 */
export type Group = 'veg' | 'aromatic' | 'mushroom' | 'green' | 'fruit' | 'grain' | 'egg' | 'dairy' | 'meat' | 'seafood' | 'misc';
export type Source = 'garden' | 'wild' | 'larder' | 'hunt' | 'rod' | 'shore';

export interface Food {
  readonly id: string;
  readonly zh: string;
  readonly en: string;
  readonly group: Group;
  /** how hard to come by, 1 … 5 */
  readonly star: number;
  /** food points of one portion */
  readonly food: number;
  /** safe to eat without heat */
  readonly raw: boolean;
  /** what a dish may ask for instead of its name: its group, and finer kinds (fish, shell, redmeat, poultry, cured, leaf, root, berry, citrus) */
  readonly tags: readonly string[];
  readonly from: readonly Source[];
  /** its colour in the pot and on the plate (0xRRGGBB), for the dish's toppings */
  readonly tint: number;
}

type Row = readonly [id: string, zh: string, en: string, star: number, food: number, raw: 0 | 1, tags: string, from: string, tint: number];

const rows = (group: Group, list: readonly Row[]): Food[] =>
  list.map(([id, zh, en, star, food, raw, tags, from, tint]) => ({ id, zh, en, group, star, food, raw: raw === 1, tags: [group, ...tags.split(' ').filter(Boolean)], from: from.split(' ') as Source[], tint }));

export const FOODS: readonly Food[] = [
  ...rows('veg', [
    ['tomato', '番茄', 'Tomato', 1, 6, 1, '', 'garden', 0xd8432e],
    ['potato', '土豆', 'Potato', 1, 9, 0, 'root', 'garden', 0xd9b877],
    ['carrot', '胡萝卜', 'Carrot', 1, 6, 1, 'root', 'garden', 0xe8822a],
    ['onion', '洋葱', 'Onion', 1, 5, 1, 'root', 'garden', 0xd9c2a0],
    ['cabbage', '卷心菜', 'Cabbage', 1, 5, 1, 'leaf', 'garden', 0xbfd98a],
    ['cucumber', '黄瓜', 'Cucumber', 1, 4, 1, '', 'garden', 0x7fb85a],
    ['corn', '玉米', 'Corn', 1, 8, 0, '', 'garden', 0xf2cf4a],
    ['lettuce', '生菜', 'Lettuce', 1, 3, 1, 'leaf', 'garden', 0x9fd06a],
    ['pepper', '青椒', 'Green pepper', 2, 5, 1, '', 'garden', 0x5fa84a],
    ['eggplant', '茄子', 'Aubergine', 2, 6, 0, '', 'garden', 0x6a3f8a],
    ['pumpkin', '南瓜', 'Pumpkin', 2, 9, 0, '', 'garden', 0xe89a2e],
    ['broccoli', '西兰花', 'Broccoli', 2, 6, 0, '', 'garden', 0x4f8f3a],
  ]),
  ...rows('aromatic', [
    ['garlic', '大蒜', 'Garlic', 1, 2, 1, '', 'garden', 0xf0e8d8],
    ['scallion', '野葱', 'Wild onion', 1, 2, 1, '', 'wild garden', 0x7fc060],
    ['ginger', '生姜', 'Ginger', 2, 2, 1, '', 'garden', 0xd9b56a],
    ['chili', '辣椒', 'Chilli', 2, 2, 1, '', 'garden wild', 0xd6281e],
  ]),
  ...rows('mushroom', [
    ['oyster', '平菇', 'Oyster mushroom', 1, 5, 0, '', 'wild', 0xd8cdbd],
    ['shiitake', '香菇', 'Shiitake', 2, 6, 0, '', 'wild', 0x8a5a3c],
    ['porcini', '牛肝菌', 'Porcini', 3, 8, 0, '', 'wild', 0xa87342],
    ['chanterelle', '鸡油菌', 'Chanterelle', 3, 7, 0, '', 'wild', 0xf0a830],
    ['matsutake', '松茸', 'Matsutake', 4, 9, 0, '', 'wild', 0xc9a070],
    ['truffle', '松露', 'Truffle', 5, 6, 1, '', 'wild', 0x3a2d28],
  ]),
  ...rows('green', [
    ['shepherds', '荠菜', "Shepherd's purse", 1, 4, 1, 'leaf', 'wild', 0x6fae54],
    ['mint', '薄荷', 'Mint', 1, 1, 1, 'herb', 'wild garden', 0x5fc08a],
    ['bamboo', '竹笋', 'Bamboo shoot', 2, 6, 0, '', 'wild', 0xe6d9a8],
  ]),
  ...rows('fruit', [
    ['apple', '苹果', 'Apple', 1, 6, 1, '', 'garden wild', 0xd9482e],
    ['berry', '野莓', 'Wild berries', 1, 4, 1, 'berry', 'wild', 0x5a3a8a],
    ['strawberry', '草莓', 'Strawberry', 2, 4, 1, 'berry', 'garden', 0xe0304a],
    ['orange', '橙子', 'Orange', 2, 6, 1, 'citrus', 'garden', 0xf29a2a],
    ['lemon', '柠檬', 'Lemon', 2, 3, 1, 'citrus', 'garden', 0xf2dc4a],
    ['banana', '香蕉', 'Banana', 3, 8, 1, '', 'garden wild', 0xf2d86a],
    ['watermelon', '西瓜', 'Watermelon', 3, 7, 1, '', 'garden', 0xe8485a],
  ]),
  ...rows('grain', [
    ['rice', '大米', 'Rice', 1, 12, 0, '', 'larder garden', 0xf4f0e4],
    ['flour', '面粉', 'Flour', 1, 10, 0, '', 'larder', 0xf2ead8],
    ['noodle', '干面条', 'Dried noodles', 1, 12, 0, '', 'larder', 0xe8d49a],
    ['bread', '面包', 'Bread', 1, 12, 1, '', 'larder', 0xc98f4a],
    ['bean', '豆子', 'Beans', 1, 10, 0, '', 'larder garden', 0x9a5a3a],
  ]),
  ...rows('egg', [
    ['egg', '鸡蛋', 'Egg', 1, 8, 0, '', 'larder', 0xf6d56a],
    ['wildegg', '野禽蛋', 'Wildfowl egg', 2, 9, 0, '', 'wild', 0xe8d9b8],
  ]),
  ...rows('dairy', [
    ['milk', '牛奶', 'Milk', 2, 6, 1, '', 'larder', 0xf8f6ee],
    ['butter', '黄油', 'Butter', 2, 5, 1, '', 'larder', 0xf4dc7a],
    ['cheese', '奶酪', 'Cheese', 3, 9, 1, '', 'larder', 0xf0c44a],
  ]),
  ...rows('meat', [
    ['chicken', '鸡肉', 'Chicken', 2, 14, 0, 'poultry', 'larder hunt', 0xe8c9a0],
    ['pork', '猪肉', 'Pork', 2, 15, 0, 'redmeat', 'larder hunt', 0xd98a7a],
    ['bacon', '培根', 'Bacon', 2, 10, 0, 'cured', 'larder', 0xc45a48],
    ['duck', '鸭肉', 'Duck', 3, 15, 0, 'poultry', 'hunt', 0xb8644a],
    ['beef', '牛肉', 'Beef', 3, 16, 0, 'redmeat', 'larder hunt', 0xa83a32],
    ['lamb', '羊肉', 'Lamb', 3, 16, 0, 'redmeat', 'larder hunt', 0xb85a4a],
    ['venison', '鹿肉', 'Venison', 3, 16, 0, 'redmeat', 'hunt', 0x8a3a30],
  ]),
  ...rows('seafood', [
    ['brookfish', '小溪鱼', 'Brook fish', 1, 9, 0, 'fish', 'rod', 0xb8c4c8],
    ['trout', '鳟鱼', 'Trout', 2, 12, 0, 'fish', 'rod', 0xd8a890],
    ['shrimp', '虾', 'Shrimp', 2, 8, 0, 'shell', 'shore rod', 0xf08a6a],
    ['clam', '蛤蜊', 'Clams', 2, 7, 0, 'shell', 'shore', 0xd9cfc0],
    ['salmon', '三文鱼', 'Salmon', 3, 14, 0, 'fish', 'rod', 0xf2885a],
    ['crab', '螃蟹', 'Crab', 3, 10, 0, 'shell', 'shore', 0xd9482a],
    ['tuna', '金枪鱼', 'Tuna', 4, 15, 0, 'fish', 'rod', 0xb83a4a],
    ['lobster', '龙虾', 'Lobster', 5, 13, 0, 'shell', 'shore', 0xd8382a],
  ]),
  ...rows('misc', [
    ['walnut', '核桃', 'Walnuts', 1, 7, 1, 'nut', 'wild', 0xa8784a],
    ['honey', '蜂蜜', 'Honey', 2, 5, 1, 'sweet', 'wild larder', 0xe8a82a],
    ['tofu', '豆腐', 'Tofu', 2, 8, 1, '', 'larder', 0xf4efe0],
  ]),
];

export const FOOD: Readonly<Record<string, Food>> = Object.fromEntries(FOODS.map((f) => [f.id, f]));

/**
 * Where the places by the road keep what of the pantry they have (docs/V3/plan/finish.md §八 1; core/modcar/loot.ts
 * LarderShelf): what keeps, in a kitchen's cupboard and on a shop's shelf — rice, flour, noodles, beans, potatoes,
 * onions, garlic, a pumpkin, a loaf, honey; what wants the cold, in a refrigerator or a cool box — the garden's
 * vegetables, eggs, milk, butter, cheese, tofu, the fruit; and the meat, there too. What is hunted is in a hunter's
 * bag at his stand (venison); what is caught or gathered on a shore, in the cool box on a jetty or under a lighthouse
 * (shrimp, clams, a crab, a lobster). What grows wild is not a place's to keep.
 */
export const LARDER_SHELF: Readonly<Record<string, 'dry' | 'fresh' | 'meat' | 'game' | 'sea'>> = {
  rice: 'dry',
  flour: 'dry',
  noodle: 'dry',
  bean: 'dry',
  potato: 'dry',
  onion: 'dry',
  garlic: 'dry',
  pumpkin: 'dry',
  bread: 'dry',
  honey: 'dry',
  tomato: 'fresh',
  carrot: 'fresh',
  cabbage: 'fresh',
  cucumber: 'fresh',
  corn: 'fresh',
  lettuce: 'fresh',
  pepper: 'fresh',
  eggplant: 'fresh',
  broccoli: 'fresh',
  ginger: 'fresh',
  chili: 'fresh',
  egg: 'fresh',
  milk: 'fresh',
  butter: 'fresh',
  cheese: 'fresh',
  tofu: 'fresh',
  apple: 'fresh',
  orange: 'fresh',
  lemon: 'fresh',
  chicken: 'meat',
  pork: 'meat',
  bacon: 'meat',
  beef: 'meat',
  lamb: 'meat',
  duck: 'meat',
  venison: 'game',
  shrimp: 'sea',
  clam: 'sea',
  crab: 'sea',
  lobster: 'sea',
};

/**
 * What still comes up in the bed of a garden gone wild behind a house (docs/V3/plan/finish.md §八 1: 房子后面荒了的菜地):
 * the garden's vegetables and its aromatics
 */
export const GARDEN_BED: readonly string[] = FOODS.filter((f) => f.from.includes('garden') && (f.group === 'veg' || f.group === 'aromatic')).map((f) => f.id);

/**
 * What a warm country has more of, and a cold one (docs/V3/plan/finish.md §八 1: 食材按地区有偏好——暖和的地方出香蕉、
 * 橙子): the same shelf holds other things there, so that a new country brings what one has not cooked with yet
 */
export const LIKES: Readonly<Record<string, 'hot' | 'cold'>> = {
  banana: 'hot',
  orange: 'hot',
  lemon: 'hot',
  watermelon: 'hot',
  chili: 'hot',
  pepper: 'hot',
  eggplant: 'hot',
  corn: 'hot',
  potato: 'cold',
  cabbage: 'cold',
  onion: 'cold',
  carrot: 'cold',
  pork: 'cold',
  lamb: 'cold',
  bacon: 'cold',
  butter: 'cold',
  cheese: 'cold',
};

/** what each tag is called where a dish asks for "any of a kind" (a recipe's line, a hint in the book) */
export const TAG_NAME: Readonly<Record<string, { zh: string; en: string }>> = {
  veg: { zh: '蔬菜', en: 'vegetable' },
  aromatic: { zh: '葱姜蒜', en: 'aromatic' },
  mushroom: { zh: '菌菇', en: 'mushroom' },
  green: { zh: '野菜香草', en: 'wild green' },
  fruit: { zh: '水果', en: 'fruit' },
  grain: { zh: '主食', en: 'staple' },
  egg: { zh: '蛋', en: 'egg' },
  dairy: { zh: '奶', en: 'dairy' },
  meat: { zh: '肉', en: 'meat' },
  seafood: { zh: '水产', en: 'seafood' },
  misc: { zh: '杂货', en: 'sundry' },
  root: { zh: '根茎', en: 'root' },
  leaf: { zh: '叶菜', en: 'leaf' },
  herb: { zh: '香草', en: 'herb' },
  berry: { zh: '莓果', en: 'berry' },
  citrus: { zh: '柑橘', en: 'citrus' },
  poultry: { zh: '禽肉', en: 'poultry' },
  redmeat: { zh: '红肉', en: 'red meat' },
  cured: { zh: '腌肉', en: 'cured meat' },
  fish: { zh: '鱼', en: 'fish' },
  shell: { zh: '虾蟹贝', en: 'shellfish' },
  nut: { zh: '坚果', en: 'nut' },
  sweet: { zh: '甜料', en: 'sweetener' },
};

/** a need or an extra of a dish in words: an ingredient's name, or "any <kind>" */
export function tokenName(token: string, lang: 'zh' | 'en' = 'zh'): string {
  if (token.startsWith('@')) {
    const t = TAG_NAME[token.slice(1)];
    return t ? (lang === 'zh' ? `任意${t.zh}` : `any ${t.en}`) : token;
  }
  return FOOD[token]?.[lang] ?? token;
}

/** the seasonings: a pinch over the pot, never a portion in it; always enough of them */
export const SEASONINGS: readonly { id: string; zh: string; en: string }[] = [
  { id: 'salt', zh: '盐', en: 'Salt' },
  { id: 'soy', zh: '酱油', en: 'Soy sauce' },
  { id: 'oil', zh: '食用油', en: 'Oil' },
  { id: 'sugar', zh: '糖', en: 'Sugar' },
  { id: 'vinegar', zh: '醋', en: 'Vinegar' },
  { id: 'pepper_s', zh: '胡椒', en: 'Pepper' },
];

/**
 * What stands in for a tag though it is none of the sixty: the classes of the world's other food (cooking/types.ts
 * IngClass — a forage kind's, a fish's) and the tags each fills. It fills a tag and never a name.
 */
export const STAND_INS: Readonly<Record<string, readonly string[]>> = {
  mushroom: ['mushroom'],
  veg: ['green', 'leaf'],
  root: ['veg', 'root'],
  fruit: ['fruit'],
  herb: ['green', 'herb'],
  nut: ['misc', 'nut'],
  grain: ['grain'],
  egg: ['egg'],
  meat: ['meat', 'redmeat'],
  poultry: ['meat', 'poultry'],
  fish: ['seafood', 'fish'],
  shellfish: ['seafood', 'shell'],
  sweet: ['misc', 'sweet'],
};
