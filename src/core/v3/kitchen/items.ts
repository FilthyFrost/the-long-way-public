/**
 * The kitchen's things as items (docs/V3/plan/cooking.md): rows for the catalogue (core/modcar/items.ts), which the
 * game's module registers as it is loaded.
 *
 *   ing_<id>    each of the sixty ingredients, whole as it is found; what is safe raw can be eaten as it is
 *   cut_<id>    the same, cut on the board (those that are cut at all): another kind, with the prepared shape's model
 *   kit_*       the cookware: the stove and its canister, the board, the seven vessels, a plate, a bowl, the seasonings
 *   dish_<id>   each dish, and the three failures: which it is is its kind; what this serving gives is on the thing
 *               itself (ItemState.meal), for two pots of one dish are not the same
 *
 * What a piece of cookware holds is on the thing itself too (ItemState.kit): the canister in a stove is its seconds of
 * flame, the pan on it its kind, what is in the pan a list of ids — plain data and no things inside things, so a stove
 * carried off with a pan of onions on it is one thing, saved as one.
 */
import type { ItemRow } from '../../modcar/items';
import type { Text } from '../../modcar/types';
import { DISHES, WAYS, type DishDef, type Way } from './dishes';
import { DISH_LOOK, FAIL_LOOK, FOOD_LOOK } from './looks';
import { FOOD, FOODS, tokenName, type Food, type Group } from './pantry';

// ------------------------------------------------------------------ what the things carry on themselves

/** one portion in a vessel: an ingredient of the pantry by its id (or another edible thing by its own kind), cut or not */
export interface Portion {
  id: string;
  cut?: 1;
}

/** what is in a vessel */
export interface PotState {
  /** up to five portions, in the order they went in */
  items: Portion[];
  /** how done: 0 raw … 1 right … (cook.ts) */
  done?: number;
  /** the seasonings that went over it (pantry.ts SEASONINGS) */
  season?: string[];
  /** how often it was stirred or turned when it asked to be */
  stirs?: number;
  /** tossed (a bowl has no heat: tossing is its cooking), 0 … 1 */
  toss?: number;
  /** servings dished up already (a pot of four portions or more gives two) */
  out?: number;
}

export interface KitState {
  /** a canister, or a stove with one in it: seconds of a high flame left (a stove without: absent) */
  gas?: number;
  /** a stove's knob: 0 off, 1 low, 2 high */
  fire?: 0 | 1 | 2;
  /** a stove: the vessel standing on it (its kind) */
  on?: string;
  /** a stove with the steamer on it: the pot of water the steamer stands on (its kind) — the steamer never stands on the flame itself */
  under?: string;
  /** a vessel, or a stove with one on it: what is in the vessel */
  pot?: PotState;
  /** a board: what lies on it, and how many strokes of the knife it has had */
  food?: Portion & { chops?: number };
}

/** what a serving carries: what it feeds, whether it came out perfect, what it was dished up on (given back when it is eaten) */
export interface MealState {
  food: number;
  perfect?: 1;
  ware?: string;
}

declare module '../../modcar/items' {
  interface ItemState {
    kit?: KitState;
    meal?: MealState;
  }
}

// ------------------------------------------------------------------ ids

export const INGREDIENT_CAT = { id: 'ingredient', name: { zh: '食材', en: 'Ingredients' }, order: 5 } as const;
export const MEAL_CAT = { id: 'meal', name: { zh: '菜肴', en: 'Dishes' }, order: 6 } as const;
/** the cookware goes with the appliances' kitchen things (core/v3/appliances/items.ts KITCHEN_CAT) */
export const COOKWARE_CAT = 'kitchen';

export const ingItem = (id: string): string => `ing_${id}`;
export const cutItem = (id: string): string => `cut_${id}`;
export const dishItem = (id: string): string => `dish_${id}`;

export const STOVE = 'kit_stove';
export const GAS = 'kit_gas';
export const BOARD = 'kit_board';
export const PLATE = 'kit_plate';
export const BOWL = 'kit_dish';
export const SPICE = 'kit_spice';
/** the cooler: a container (ItemDef.holds) in which what is fresh goes off at a quarter of the rate */
export const COOLER = 'kit_cooler';
/** what an ingredient that has gone off becomes: good for the recycler's organics and nothing else */
export const SPOILED = 'ing_spoiled';
/** how fast what is in the cooler goes off, against out of it */
export const COOLER_DECAY = 0.25;

/** the vessel of each way of cooking, and the way of each vessel */
export const VESSEL: Readonly<Record<Way, string>> = { fry: 'kit_pan', boil: 'kit_pot', mix: 'kit_bowl', grill: 'kit_grill', steam: 'kit_steamer', bake: 'kit_oven', brew: 'kit_kettle' };
export const WAY_OF: Readonly<Record<string, Way>> = Object.fromEntries((Object.keys(VESSEL) as Way[]).map((w) => [VESSEL[w], w]));

/** a canister new: seconds of a high flame (docs/V3/plan/cooking.md §4: some forty minutes); a low flame burns half as fast */
export const GAS_FULL = 40 * 60;

/** the portion a thing in the hands is: an ingredient whole or cut, or null — it is none of the sixty (a stand-in is asked of its own system) */
export function portionOf(item: string): Portion | null {
  if (item.startsWith('ing_') && FOOD[item.slice(4)]) return { id: item.slice(4) };
  if (item.startsWith('cut_') && FOOD[item.slice(4)]) return { id: item.slice(4), cut: 1 };
  return null;
}

/** the kind a portion is as a thing in the hands */
export function itemOfPortion(p: Portion): string {
  if (!FOOD[p.id]) return p.id;
  return p.cut && FOOD_LOOK[p.id]?.chop ? cutItem(p.id) : ingItem(p.id);
}

// ------------------------------------------------------------------ the ingredients

/** what one of each weighs (kg): by its group, and those that are not like their group */
const GROUP_KG: Readonly<Record<Group, number>> = { veg: 0.2, aromatic: 0.05, mushroom: 0.1, green: 0.08, fruit: 0.15, grain: 0.4, egg: 0.06, dairy: 0.3, meat: 0.4, seafood: 0.3, misc: 0.3 };
const KG: Readonly<Record<string, number>> = {
  cabbage: 0.8, corn: 0.3, lettuce: 0.3, eggplant: 0.3, pumpkin: 1.5, broccoli: 0.4, chili: 0.02, truffle: 0.05, mint: 0.02, bamboo: 0.4, banana: 0.4,
  watermelon: 3, rice: 0.5, flour: 0.5, noodle: 0.3, wildegg: 0.1, milk: 1, bacon: 0.2, venison: 0.5, brookfish: 0.15, trout: 0.4, salmon: 1.2, tuna: 2.5,
  shrimp: 0.1, clam: 0.2, crab: 0.4, lobster: 0.7, walnut: 0.1,
};

/** the line on each one's card */
const BLURB: Readonly<Record<string, string>> = {
  tomato: '熟透的番茄，生吃酸甜，下锅百搭。',
  potato: '土豆。煎炒炖烤样样行，顶饿。',
  carrot: '脆生生的胡萝卜，炖肉的老搭档。',
  onion: '切的时候会掉眼泪，炒出来却是甜的。',
  cabbage: '一整颗卷心菜，耐放，能吃好几顿。',
  cucumber: '顶花带刺的黄瓜，拍一拍就是一盘凉菜。',
  corn: '带着青皮的玉米，烤着吃最香。',
  lettuce: '一颗生菜，洗洗就能进沙拉。',
  pepper: '青椒，不怎么辣，和肉丝是绝配。',
  eggplant: '紫得发亮的茄子，很吃油，也很下饭。',
  pumpkin: '沉甸甸的南瓜，熬汤、蒸着吃都甜。',
  broccoli: '一朵西兰花，掰成小朵再下锅。',
  garlic: '一头大蒜。爆锅的时候，整个车厢都是香的。',
  scallion: '路边掐的野葱，味道比种的还冲。',
  ginger: '一块老姜，去腥、驱寒。',
  chili: '红辣椒，一点点就够劲。',
  oyster: '一丛平菇，林子里最常见，炒蛋很嫩。',
  shiitake: '香菇。炖鸡的时候放几朵，汤就不一样了。',
  porcini: '胖墩墩的牛肝菌，肉厚味浓，难得一见。',
  chanterelle: '金灿灿的鸡油菌，用黄油煎一下就很好。',
  matsutake: '松茸。松林深处才有，烤一烤就是大菜。',
  truffle: '其貌不扬的松露。刨几片下去，一锅都贵了。',
  shepherds: '贴着地皮长的荠菜，春天的味道。',
  mint: '一小枝薄荷，泡水、点缀都清凉。',
  bamboo: '刚冒头的竹笋，剥开来又脆又鲜。',
  apple: '红苹果，咬一口嘎嘣脆，也能烤成派。',
  berry: '一把野莓，酸酸甜甜，染得手指发紫。',
  strawberry: '草莓，蛋糕上最好看的那一颗。',
  orange: '橙子，汁水足，配鸭肉意外地合适。',
  lemon: '柠檬，酸得皱眉头，烤鱼泡茶都离不开它。',
  banana: '一小把香蕉，放软了正好烤面包。',
  watermelon: '圆滚滚的大西瓜，夏天的全部。',
  rice: '一袋大米。有米在，心里就不慌。',
  flour: '一袋面粉，饺子、松饼、派，都从它开始。',
  noodle: '一把干面条，水开下锅，几分钟就是一顿。',
  bread: '一条面包，外皮有点硬了，煎一下正好。',
  bean: '一碟红豆子，慢慢炖才出味。',
  egg: '鸡蛋。万能的鸡蛋。',
  wildegg: '草窝里捡的野禽蛋，带着斑点，蛋黄特别黄。',
  milk: '一瓶牛奶，煮汤、做点心都要它。',
  butter: '一块黄油，煎什么都香。',
  cheese: '一角奶酪，气孔很大，味道很足。',
  chicken: '一只鸡腿，煎炒炖烤都不会错。',
  pork: '一条五花肉，肥瘦相间。',
  bacon: '几片培根，煎到卷边，早晨就开始了。',
  duck: '一块鸭胸，皮下一层油，要慢慢煎。',
  beef: '一块带雪花的牛排，好东西。',
  lamb: '一根羊排，配大蒜和薄荷。',
  venison: '一条鹿腿肉，颜色很深，要多炖一会儿。',
  brookfish: '小溪里钓的小鱼，裹上面粉炸一炸。',
  trout: '一条鳟鱼，身上带着斑点，肉是粉的。',
  shrimp: '一只大虾，下锅就变红。',
  clam: '几只蛤蜊，吐干净沙再下锅。',
  salmon: '一条三文鱼，橙红的肉，煎着吃、生吃都好。',
  crab: '一只螃蟹，清蒸就够了，记得配姜。',
  tuna: '一条金枪鱼，沉得要两只手抱，是做刺身的料。',
  lobster: '一只龙虾。能遇上它，今天就是好日子。',
  walnut: '几个核桃，敲开来又香又脆。',
  honey: '一罐蜂蜜，甜得很正。',
  tofu: '一块豆腐，颤巍巍的，凉拌热炒都行。',
};

/** how long a bite of something raw takes (s) */
const RAW_SEC = 3;
/** food is no car: a little of a clear coat's gloss, so that a tomato has a shine and no mirror of the sky */
const FOOD_GLOSS = 0.22;

/**
 * How long an ingredient keeps out of a cooler (game hours) by its group, and by itself where it keeps longer or less
 * (null: it keeps — rice, flour, noodles, beans, nuts, honey). A cut one keeps a third as long. A dish does not go
 * off (a serving's plate is in its state, which a thing that turns loses): it is eaten when it is eaten.
 */
const KEEP_GROUP: Readonly<Record<Group, number | null>> = { veg: 96, aromatic: 168, mushroom: 48, green: 48, fruit: 96, grain: null, egg: 168, dairy: 72, meat: 36, seafood: 24, misc: null };
const KEEP: Readonly<Record<string, number | null>> = {
  potato: 336, onion: 336, pumpkin: 336, carrot: 168, cabbage: 168, corn: 72, lettuce: 48, cucumber: 72,
  garlic: 336, ginger: 336, chili: 120, truffle: 72, matsutake: 36, bamboo: 72,
  apple: 240, lemon: 240, orange: 240, watermelon: 120, banana: 72, berry: 36, strawberry: 36,
  bread: 96, butter: 168, cheese: 240, milk: 48, tofu: 48, wildegg: 120, bacon: 96,
};

/** how long a whole one keeps (game hours; null: it keeps) */
export function keepHours(id: string): number | null {
  const f = FOOD[id];
  if (!f) return null;
  return id in KEEP ? KEEP[id] : KEEP_GROUP[f.group];
}

function ingRow(f: Food): ItemRow {
  const look = FOOD_LOOK[f.id];
  const kg = KG[f.id] ?? GROUP_KG[f.group];
  const keep = keepHours(f.id);
  return {
    id: ingItem(f.id),
    cat: INGREDIENT_CAT.id,
    name: { zh: f.zh, en: f.en },
    stars: f.star,
    mass: kg,
    carry: kg >= 2 ? 'medium' : 'small',
    salvage: { organics: 1 + f.star },
    blurb: BLURB[f.id] ?? '',
    model: `food_${f.id}`,
    paint: look.paint,
    paint2: look.paint2,
    matte: FOOD_GLOSS,
    tags: ['ingredient', ...f.tags],
    stack: 10,
    ...(f.raw ? { eat: { food: f.food, hp: 0, sec: RAW_SEC } } : {}),
    ...(keep ? { perish: { hours: keep, into: SPOILED } } : {}),
  };
}

function cutRow(f: Food): ItemRow | null {
  const look = FOOD_LOOK[f.id];
  if (!look.chop || !look.prep) return null;
  const kg = KG[f.id] ?? GROUP_KG[f.group];
  const keep = keepHours(f.id);
  return {
    id: cutItem(f.id),
    cat: INGREDIENT_CAT.id,
    name: { zh: `切好的${f.zh}`, en: `${f.en}, cut` },
    stars: f.star,
    mass: kg,
    carry: 'small',
    salvage: { organics: 1 + f.star },
    blurb: `切好的${f.zh}：熟得快，下锅更入味。`,
    model: `prep_${look.prep}`,
    paint: look.flesh,
    paint2: look.skin,
    matte: FOOD_GLOSS,
    tags: ['ingredient', 'cut', ...f.tags],
    stack: 10,
    ...(f.raw ? { eat: { food: f.food, hp: 0, sec: RAW_SEC } } : {}),
    ...(keep ? { perish: { hours: Math.max(8, Math.round(keep / 3)), into: SPOILED } } : {}),
  };
}

/** an ingredient gone off */
export const SPOILED_ITEM: ItemRow = {
  id: SPOILED,
  cat: 'junk',
  name: { zh: '坏掉的食材', en: 'Spoiled food' },
  stars: 0,
  mass: 0.1,
  carry: 'small',
  stack: 20,
  salvage: { organics: 1 },
  model: 'forage_lump',
  paint: 0x5b4a3a,
  paint2: 0x3a3a28,
  blurb: '放坏了的食材，下不了锅。丢进回收台还能出点有机物。下次放进保温箱。',
};

export const INGREDIENT_ITEMS: readonly ItemRow[] = [...FOODS.map(ingRow), ...FOODS.map(cutRow).filter((r): r is ItemRow => r !== null)];

// ------------------------------------------------------------------ the cookware

const T = (zh: string, en: string): Text => ({ zh, en });

export const COOKWARE_ITEMS: readonly ItemRow[] = [
  { id: STOVE, cat: COOKWARE_CAT, name: T('卡式炉', 'Cassette stove'), stars: 2, mass: 1.8, carry: 'medium', salvage: { scrap: 6 }, blurb: '便携的卡式炉。右边的仓里装一罐燃气，锅往炉头上一放就能开火。', paint: 0x3e8e87, paint2: 0xede3c8 },
  { id: GAS, cat: COOKWARE_CAT, name: T('燃气罐', 'Gas canister'), stars: 1, mass: 0.35, carry: 'small', salvage: { scrap: 2 }, blurb: '一罐卡式炉用的燃气。拿着它看着炉子按 E 换上。', paint: 0xc8323a, paint2: 0xf4efe2 },
  { id: BOARD, cat: COOKWARE_CAT, name: T('案板和刀', 'Board and knife'), stars: 1, mass: 0.9, carry: 'small', salvage: { scrap: 2, organics: 2 }, blurb: '一块案板，刀就搁在上面。食材放上去，按三下 E 切好。', paint: 0xc9a26b, paint2: 0x8a6a48 },
  { id: VESSEL.fry, cat: COOKWARE_CAT, name: T('平底锅', 'Frying pan'), stars: 1, mass: 1.1, carry: 'small', salvage: { scrap: 5 }, blurb: '煎和炒都靠它。火大，熟得快，也容易焦。', paint: 0x2f3236, paint2: 0xb85c3e },
  { id: VESSEL.boil, cat: COOKWARE_CAT, name: T('汤锅', 'Soup pot'), stars: 1, mass: 1.6, carry: 'small', salvage: { scrap: 6 }, blurb: '带盖的汤锅：煮汤、炖菜、煮饭煮面。慢一点，也不容易煮坏。', paint: 0xd8c29a, paint2: 0x2f3236 },
  { id: VESSEL.mix, cat: COOKWARE_CAT, name: T('搅拌碗', 'Mixing bowl'), stars: 1, mass: 0.4, carry: 'small', salvage: { scrap: 2 }, blurb: '拌沙拉、凉菜和奶昔的大碗，不用火。', paint: 0x7fb3d5, paint2: 0xf4efe2 },
  { id: VESSEL.grill, cat: COOKWARE_CAT, name: T('烤盘', 'Grill plate'), stars: 2, mass: 1.4, carry: 'small', salvage: { scrap: 6 }, blurb: '带棱的铸铁烤盘，架在炉子上烤肉、烤鱼、烤蔬菜。', paint: 0x2f3236, paint2: 0x6f7a82 },
  { id: VESSEL.steam, cat: COOKWARE_CAT, name: T('蒸笼', 'Steamer'), stars: 2, mass: 0.7, carry: 'small', salvage: { organics: 4 }, blurb: '竹编的蒸笼，架在炉头上的空汤锅上（锅里是水），蒸鱼、蒸蛋、蒸饺子。', paint: 0xd9b877, paint2: 0xa8824a },
  { id: VESSEL.bake, cat: COOKWARE_CAT, name: T('铸铁焖烤锅', 'Camp oven'), stars: 3, mass: 3.5, carry: 'medium', salvage: { scrap: 10 }, blurb: '厚重的铸铁锅，盖上盖子就是一个小烤箱：派、面包、烤鸡。', paint: 0x33363a, paint2: 0x6f7a82 },
  { id: VESSEL.brew, cat: COOKWARE_CAT, name: T('水壶', 'Kettle'), stars: 1, mass: 0.6, carry: 'small', salvage: { scrap: 3 }, blurb: '烧水、煮茶、热牛奶的小水壶。水开了会响。', paint: 0xb85c3e, paint2: 0x2f3236 },
  { id: PLATE, cat: COOKWARE_CAT, name: T('盘子', 'Plate'), stars: 0, mass: 0.3, carry: 'small', salvage: { scrap: 1 }, blurb: '一只盘子。拿着它看着做好的菜按 E 装盘；吃完了盘子还在。', paint: 0xf4efe2, paint2: 0x3e8e87, stack: 6 },
  { id: BOWL, cat: COOKWARE_CAT, name: T('碗', 'Bowl'), stars: 0, mass: 0.2, carry: 'small', salvage: { scrap: 1 }, blurb: '一只碗。汤、粥、面都用它盛；吃完了碗还在。', paint: 0xf4efe2, paint2: 0xb85c3e, stack: 6 },
  {
    id: COOLER,
    cat: COOKWARE_CAT,
    name: T('保温箱', 'Cooler'),
    stars: 2,
    mass: 3.2,
    carry: 'medium',
    salvage: { scrap: 2, chemicals: 2 },
    blurb: '装食材的保温箱：放在里面的东西坏得慢四倍。看着它按 Tab 打开，放进去、拿出来。',
    paint: 0x3f86b8,
    paint2: 0xf2efe6,
    holds: { slots: 12, accepts: ['*'], maxKg: 16, decay: COOLER_DECAY },
  },
  { id: SPICE, cat: COOKWARE_CAT, name: T('调料盒', 'Seasonings'), stars: 1, mass: 0.8, carry: 'small', salvage: { scrap: 1, organics: 2 }, blurb: '盐、胡椒、酱油、油、醋和糖，都在这个提篮里。对着锅按 E 撒一点；怎么用都用不完。', paint: 0xb9915f, paint2: 0xc8323a },
];

// ------------------------------------------------------------------ the dishes

/** how long a serving takes to eat (s) */
const MEAL_SEC = 4.5;

/** what a dish is made of, in a line: "番茄、任意蛋 · 煎炒" */
export function recipeLine(d: DishDef, lang: 'zh' | 'en' = 'zh'): string {
  const seen = new Map<string, number>();
  for (const t of d.need) seen.set(t, (seen.get(t) ?? 0) + 1);
  const parts = [...seen].map(([t, n]) => `${tokenName(t, lang)}${n > 1 ? ` ×${n}` : ''}`);
  return `${parts.join(lang === 'zh' ? '、' : ', ')} · ${WAYS[d.way][lang]}`;
}

function dishRow(d: DishDef): ItemRow {
  const look = DISH_LOOK[d.id];
  return {
    id: dishItem(d.id),
    cat: MEAL_CAT.id,
    name: { zh: d.zh, en: d.en },
    stars: d.stars,
    mass: 0.4,
    carry: 'small',
    salvage: { organics: 3 },
    blurb: `${recipeLine(d)}。`,
    model: `meal_${look.meal}`,
    paint: look.paint,
    paint2: look.paint2,
    matte: FOOD_GLOSS,
    tags: ['meal'],
    eat: { food: 0, hp: 0, sec: MEAL_SEC },
  };
}

const FAIL_NAMES: Readonly<Record<'mess' | 'burnt' | 'raw', { name: Text; blurb: string }>> = {
  mess: { name: T('说不清的一团', 'Dubious mess'), blurb: '这几样东西凑在一起，没有哪本菜谱认。能吃，仅此而已。' },
  burnt: { name: T('焦炭', 'Charred lump'), blurb: '火开太久了。黑乎乎的一坨，还冒着烟。' },
  raw: { name: T('夹生的一锅', 'Half-raw pot'), blurb: '里面还是生的。再煮一会儿就好了，可惜已经出锅。' },
};

export const FAIL_ITEMS: readonly ItemRow[] = (['mess', 'burnt', 'raw'] as const).map((k) => ({
  id: dishItem(k),
  cat: MEAL_CAT.id,
  name: FAIL_NAMES[k].name,
  stars: 0,
  mass: 0.4,
  carry: 'small' as const,
  salvage: { organics: 2 },
  blurb: FAIL_NAMES[k].blurb,
  model: `meal_${FAIL_LOOK[k].meal}`,
  paint: FAIL_LOOK[k].paint,
  paint2: FAIL_LOOK[k].paint2,
  matte: FOOD_GLOSS,
  tags: ['meal', 'failed'],
  eat: { food: 0, hp: 0, sec: MEAL_SEC },
}));

export const DISH_ITEMS: readonly ItemRow[] = [...DISHES.map(dishRow), ...FAIL_ITEMS];

/** every kind the kitchen brings */
export const KITCHEN_ITEMS: readonly ItemRow[] = [...INGREDIENT_ITEMS, SPOILED_ITEM, ...COOKWARE_ITEMS, ...DISH_ITEMS];
