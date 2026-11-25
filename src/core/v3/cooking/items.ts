/**
 * Cooking's things as items (node C1, docs/V3/nodes/C1-cooking.md): the dishes and the cookware, as rows for
 * the item catalogue (src/core/modcar/items.ts registerItemCat, registerItems), made here as data for the
 * game's module to register.
 *
 * A dish is one of twelve kinds of item, one for each class of dish (a bowl of soup, a plate, a skewer, a
 * cup …); WHICH dish it is and what it gives are on the thing itself (ItemState.dish), so the 150 recipes and
 * every pot of no recipe need no item kinds of their own. Two servings of the same dish with the same stars
 * stack; dishes go off within a day unless they are preserves.
 *
 * Cookware is what a way of cooking needs (types.ts METHODS[...].cookware names these ids without the
 * `cook_` in front); what the bench asks for one is beside it here, for whoever adds the bench's recipes.
 */
import type { ItemRow } from '../../modcar/items';
import type { BuffId, Dish, DishClass } from './types';

/** what a dish carries on itself: which it is and what a serving gives */
export interface DishState {
  /** the recipe's id (absent: a dish of no recipe) */
  r?: string;
  zh: string;
  en: string;
  food: number;
  water: number;
  hp: number;
  sick?: 1 | 2;
  buff?: BuffId;
  buffS?: number;
}

declare module '../../modcar/items' {
  interface ItemState {
    dish?: DishState;
  }
}

export const DISH_CAT = 'dish';
export const COOKWARE_CAT = 'cookware';

/** the two categories, after foraging's ten */
export function cookingItemCats(): { id: string; name: { zh: string; en: string }; order: number }[] {
  return [
    { id: DISH_CAT, name: { zh: '菜肴', en: 'Dishes' }, order: 220 },
    { id: COOKWARE_CAT, name: { zh: '厨具', en: 'Cookware' }, order: 221 },
  ];
}

/** each class of dish: its item's name, what it weighs, how many game hours it keeps (0: it keeps), how long a serving takes to eat (s), its two colours */
const DISHES: Readonly<Record<DishClass, { zh: string; en: string; mass: number; hours: number; sec: number; paint: number; paint2: number }>> = {
  soup: { zh: '一碗汤', en: 'Bowl of soup', mass: 0.4, hours: 18, sec: 4.5, paint: 0xe8dcc0, paint2: 0xc89a5c },
  stew: { zh: '一碗炖菜', en: 'Bowl of stew', mass: 0.45, hours: 18, sec: 5, paint: 0xd8c29a, paint2: 0x8a5a34 },
  stirfry: { zh: '一盘小炒', en: 'Plate of stir-fry', mass: 0.35, hours: 16, sec: 4.5, paint: 0xf4efe2, paint2: 0x6fa456 },
  roast: { zh: '一份烧烤', en: 'Roast', mass: 0.35, hours: 16, sec: 4.5, paint: 0xf4efe2, paint2: 0x9a5a34 },
  fry: { zh: '一盘煎物', en: 'Fried plate', mass: 0.35, hours: 16, sec: 4.5, paint: 0xf4efe2, paint2: 0xd8a04c },
  steam: { zh: '一笼蒸菜', en: 'Steamer basket', mass: 0.4, hours: 16, sec: 4.5, paint: 0xc8a06a, paint2: 0xf4efe2 },
  rice: { zh: '一碗饭', en: 'Bowl of rice', mass: 0.4, hours: 20, sec: 5, paint: 0xe8dcc0, paint2: 0xf6f2e8 },
  salad: { zh: '一盘凉菜', en: 'Cold plate', mass: 0.3, hours: 10, sec: 4, paint: 0xf4efe2, paint2: 0x7fbe6a },
  preserve: { zh: '一罐存货', en: 'Jar of preserves', mass: 0.4, hours: 0, sec: 4, paint: 0xc8d6c0, paint2: 0xb05a3c },
  sweet: { zh: '一份点心', en: 'Sweet', mass: 0.25, hours: 48, sec: 4, paint: 0xf4efe2, paint2: 0xc2334a },
  drink: { zh: '一杯饮品', en: 'Cup', mass: 0.3, hours: 12, sec: 3, paint: 0xe8e4d8, paint2: 0xb8d0a0 },
  camp: { zh: '一份野营餐', en: 'Camp meal', mass: 0.35, hours: 24, sec: 4.5, paint: 0x6f7a82, paint2: 0xd8a04c },
};

/** the item kind of a class of dish */
export function dishItemId(cls: DishClass): string {
  return `dish_${cls}`;
}

/** what a dish that has gone off becomes */
export const SPOILED_DISH = 'dish_spoiled';

/** the cookware: id (without `cook_`), names, weight (kg), carried small or medium, what the bench asked for one (three amounts, of the three materials there were: kept as written, not used), the line on its card */
const COOKWARE: readonly [string, string, string, number, 'small' | 'medium', readonly [number, number, number], string][] = [
  ['bowl', '拌菜碗', 'Mixing bowl', 0.3, 'small', [4, 0, 0], '拌凉菜、盛东西都用它。'],
  ['spit', '烤叉', 'Roasting spit', 0.4, 'small', [5, 0, 0], '架在篝火上就能烤。'],
  ['grill', '烤网', 'Grill', 0.8, 'small', [8, 0, 0], '一次能烤一排。'],
  ['pan', '平底锅', 'Frying pan', 1.2, 'small', [10, 0, 0], '煎东西离不开它。'],
  ['wok', '炒锅', 'Wok', 1.5, 'small', [12, 0, 0], '大火快炒。'],
  ['steamer', '蒸笼', 'Steamer', 0.9, 'small', [4, 8, 0], '竹子编的，一层一层。'],
  ['pot', '汤锅', 'Soup pot', 2.0, 'medium', [14, 0, 0], '煮汤、炖菜、焖饭。'],
  ['dutch_oven', '荷兰锅', 'Dutch oven', 4.5, 'medium', [24, 0, 0], '厚铸铁，埋在炭里能烤面包。'],
  ['kettle', '水壶', 'Kettle', 0.8, 'small', [8, 0, 0], '烧水泡茶。'],
  ['board', '砧板与刀', 'Board and knife', 0.9, 'small', [6, 4, 0], '切得匀，菜才好看。'],
  ['mortar', '研钵', 'Mortar', 1.1, 'small', [8, 0, 0], '把香料捣碎。'],
  ['rack', '晾干架', 'Drying rack', 2.5, 'medium', [6, 10, 0], '晾蘑菇、晾鱼、晾果干。'],
  ['smoker', '烟熏箱', 'Smoker box', 5, 'medium', [20, 6, 0], '熏过的东西能放很久。'],
  ['stove', '便携灶', 'Camp stove', 3, 'medium', [18, 0, 8], '一个灶头，哪里都能开火。'],
];

/** the item id of a piece of cookware */
export function cookwareItemId(id: string): string {
  return `cook_${id}`;
}

/** what the bench asked for each piece of cookware by item id, in the three materials there were (not used: the bench's list is crafting.ts RECIPES) */
export function cookwareCosts(): Record<string, readonly [number, number, number]> {
  return { ...Object.fromEntries(COOKWARE.map(([id, , , , , cost]) => [cookwareItemId(id), cost])), cook_jar: [6, 0, 2], cook_cooler: [14, 0, 6] };
}

/** the rows: twelve kinds of dish, what a spoiled dish becomes, the cookware, a pickling jar and a cool box that hold things */
export function cookingItemRows(): ItemRow[] {
  const rows: ItemRow[] = [{ id: SPOILED_DISH, cat: 'junk', name: { zh: '馊掉的饭菜', en: 'Spoiled food' }, stars: 0, mass: 0.3, stack: 8, salvage: {}, model: 'dish_spoiled', paint: 0x5b4636, paint2: 0x3a2f28, blurb: '放坏了。' }];
  for (const cls of Object.keys(DISHES) as DishClass[]) {
    const d = DISHES[cls];
    rows.push({
      id: dishItemId(cls),
      cat: DISH_CAT,
      name: { zh: d.zh, en: d.en },
      stars: 2,
      mass: d.mass,
      carry: 'small',
      stack: 4,
      tags: ['dish', cls],
      ...(d.hours ? { perish: { hours: d.hours, into: SPOILED_DISH } } : {}),
      // (what a serving gives is on the thing itself: ItemState.dish; these numbers only say that it is eaten, and how long that takes)
      eat: { food: 0, hp: 0, sec: d.sec },
      salvage: {},
      model: dishItemId(cls),
      paint: d.paint,
      paint2: d.paint2,
      blurb: '',
    });
  }
  for (const [id, zh, en, mass, carry, , blurb] of COOKWARE) {
    rows.push({ id: cookwareItemId(id), cat: COOKWARE_CAT, name: { zh, en }, stars: 2, mass, carry, tags: ['cookware', id], salvage: { scrap: Math.max(1, Math.round(mass * 2)) }, model: cookwareItemId(id), paint: 0x6f7a82, paint2: 0x2f3236, blurb });
  }
  rows.push(
    // a jar: what is put in it ferments or pickles as the road goes by (the game's module ripens what is an ingredient; anything fits); things in it do not go off
    { id: 'cook_jar', cat: COOKWARE_CAT, name: { zh: '腌菜坛', en: 'Pickling jar' }, stars: 2, mass: 2.2, carry: 'medium', tags: ['cookware', 'jar'], holds: { slots: 3, accepts: ['*'], maxKg: 4, decay: 0 }, salvage: { scrap: 2 }, model: 'cook_jar', paint: 0x8a5a34, paint2: 0x5e4a38, blurb: '放进去的东西随着路程慢慢腌透，不会坏。' },
    // a cool box: things in it go off four times slower
    { id: 'cook_cooler', cat: COOKWARE_CAT, name: { zh: '冷藏箱', en: 'Cool box' }, stars: 3, mass: 3.5, carry: 'medium', tags: ['cookware', 'cooler'], holds: { slots: 8, accepts: ['*'], maxKg: 12, decay: 0.25 }, salvage: { scrap: 6 }, model: 'cook_cooler', paint: 0x58b8e8, paint2: 0xf4efe2, blurb: '里面的东西坏得慢四倍。' },
  );
  return rows;
}

/** the item and the state of one serving of a dish */
export function dishItem(d: Dish): { item: string; q: number; state: { dish: DishState } } {
  const s: DishState = { zh: d.name.zh, en: d.name.en, food: d.food, water: d.water, hp: d.hp };
  if (d.recipe) s.r = d.recipe;
  if (d.sick) s.sick = d.sick;
  if (d.buff) {
    s.buff = d.buff;
    s.buffS = d.buffS;
  }
  return { item: dishItemId(d.cls), q: d.stars, state: { dish: s } };
}
