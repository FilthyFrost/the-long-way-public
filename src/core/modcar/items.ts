/**
 * Things one carries that are neither a vehicle's part nor a tool for working on it (docs/MODCAR.md §5.7):
 * food, drinks, medicine, clothes, backpacks, head lamps, heavy tools, and the junk and boxes of old
 * components that go into the recycler for materials. The kinds follow Arctic Drive's (its numbers were the
 * starting point; the names, the lines and the economy are ours). Pure data, no three, no DOM.
 *
 * Every thing has a grade (0-5 stars, as on the parts' cards), a weight, how it is carried, and what the
 * recycler gives for it; what it does when used is in its own field (eat, drink, heal, revive, wear, pack,
 * lamp, gear). Its model is public/models/modcar/items/<model>.glb (tools/blender/items/), painted with its
 * paint / paint2 (one model serves every colour of a jacket).
 *
 * The catalogue is open (V3, docs/V3/nodes/N0-items.md): a gameplay system registers its own categories and
 * kinds (registerItemCat, registerItems) and adds its own typed fields to ItemDef and ItemState by declaration
 * merging, so this file is not edited for every system. Things may stack (ONE instance with a count `n`), hold
 * other things (`inside`, flat) and go off (`fresh`, read lazily against the world clock, never stepped).
 * What was here before any system registered (the nine categories, the kinds below) is BASE_ITEMS: the old
 * loot tables draw from that alone, so what a seed's containers and wrecks hold never changes.
 */
import type { Text } from './types';

/** what the recycler turns things into: shared counters, not things one carries */
export type Material = 'scrap' | 'organics' | 'chemicals';

export const MATERIALS: Record<Material, { name: Text; hex: number }> = {
  scrap: { name: { zh: '废料', en: 'Scrap' }, hex: 0xf2c14e },
  organics: { name: { zh: '有机物', en: 'Organics' }, hex: 0x7cc25b },
  chemicals: { name: { zh: '化学品', en: 'Chemicals' }, hex: 0x58b8e8 },
};

export const MATERIAL_IDS: readonly Material[] = ['scrap', 'organics', 'chemicals'];

export type ItemCat = 'food' | 'drink' | 'med' | 'wear' | 'pack' | 'lamp' | 'gear' | 'junk' | 'crate';

export const ITEM_CATS: Record<ItemCat, Text> = {
  food: { zh: '食物', en: 'Food' },
  drink: { zh: '饮料', en: 'Drinks' },
  med: { zh: '药品', en: 'Medicine' },
  wear: { zh: '衣服', en: 'Clothes' },
  pack: { zh: '背包', en: 'Backpacks' },
  lamp: { zh: '头灯', en: 'Head lamps' },
  gear: { zh: '器具', en: 'Gear' },
  junk: { zh: '杂物', en: 'Junk' },
  crate: { zh: '材料箱', en: 'Boxes of components' },
};

/** what one drinks: water quenches, alcohol makes one drunk, the energy drink makes one quick */
export type DrinkLiquid = 'water' | 'alcohol' | 'energy';

/** effects that last a while (the vitals: docs/MODCAR.md §13) */
export type EffectId = 'warm1' | 'warm2' | 'sick1' | 'sick2';

/** where a piece of clothing is worn */
export type WearSlot = 'hat' | 'jacket' | 'pants' | 'shoes' | 'gloves';

/** any category's id: one of the nine built in, or one a system registered (registerItemCat) */
export type ItemCatId = ItemCat | (string & {});

/** a system's own state on one thing (JSON only: rounds in a magazine, a blueprint's page): systems add their fields by declaration merging */
export interface ItemState {}

export interface ItemDef {
  readonly id: string;
  readonly cat: ItemCatId;
  readonly name: Text;
  /** grade, 0-5 stars */
  readonly stars: number;
  /** the line on its card */
  readonly blurb: string;
  /** kg, empty */
  readonly mass: number;
  /** in one hand (small), in both hands (medium), in both arms, slowly (large) */
  readonly carry: 'small' | 'medium' | 'large';
  /** what the recycler gives for it (a liquid in it adds organics on top) */
  readonly salvage: Partial<Record<Material, number>>;
  /** its model (default its id) and the colours its paint and paint_b materials take */
  readonly model: string;
  readonly paint: number;
  readonly paint2: number;
  /** eaten whole (food, pills): food points, health points, over `sec`; an effect after */
  readonly eat?: { food: number; hp: number; sec: number; effect?: EffectId };
  /** drunk from while the button is held: what it holds when full, at what rate (L/s) */
  readonly drink?: { litres: number; liquid: DrinkLiquid; rate: number };
  /** medicine: health at once, or a warming; a side effect with its chance */
  readonly heal?: { hp: number; warm?: number; side?: number };
  /** a first-aid kit: used up when one would die, one gets up again with this much health */
  readonly revive?: { hp: number };
  readonly wear?: { slot: WearSlot; warmth: number };
  /** a backpack: hotbar slots it adds */
  readonly pack?: { slots: number };
  /** a head lamp: how far it reaches (m) */
  readonly lamp?: { range: number };
  /** heavy tools: a sledgehammer's blows, a repair kit's points and how fast it gives them */
  readonly gear?: { kind: 'hammer' | 'repair' | 'flare'; uses?: number; points?: number; rate?: number };
  /** words other systems ask for (lower case, no spaces): a recipe wants any "meat", a basket accepts "#forage" */
  readonly tags?: readonly string[];
  /** how many make one stack (absent: 1, it does not stack). A stack is ONE instance with a count. */
  readonly stack?: number;
  /**
   * It holds other things: how many stacks, of which categories ("food"), tags ("#forage") or anything ("*"),
   * up to what weight; `decay` is how fast things in it go off against the open air (absent 1; a cool box
   * 0.25; 0 never). Containers do not nest.
   */
  readonly holds?: { readonly slots: number; readonly accepts: readonly string[]; readonly maxKg?: number; readonly decay?: number };
  /** it goes off: game hours in the open air from fresh to turned, and the kind it has become then (absent: it stays what it is, turned) */
  readonly perish?: { readonly hours: number; readonly into?: string };
  /** a drawn picture (its id) instead of a thumbnail of its model */
  readonly icon?: string;
}

/** one thing of a kind, as carried, lying about or riding in a vehicle */
export interface ItemInstance {
  uid: string;
  item: string;
  /** a drink: litres in it (of its own liquid) */
  litres?: number;
  /** a sledgehammer's blows left, a repair kit's points left */
  uses?: number;
  /** a coloured variant: paint instead of the kind's own (clothes) */
  tint?: number;
  /** a can or a bottle opened already (its hiss or its cap only the first time) */
  opened?: boolean;
  /** how many in this stack (absent: 1) */
  n?: number;
  /** what is in it (a container item: ItemDef.holds); flat, containers do not nest; absent when empty */
  inside?: ItemInstance[];
  /**
   * Freshness, 1 (fresh) ... 0 (turned), as it was at world time `t0` (the world clock's seconds); `fk` is how
   * fast it is going off where it is now (absent: 1, the open air). Read with freshNow; nothing steps it.
   * A thing that goes off and has no `t0` yet has not started (stampFresh starts it).
   */
  fresh?: number;
  t0?: number;
  fk?: number;
  /** quality, 1-5 stars (absent: it has none) */
  q?: number;
  /** its system's own state (JSON only) */
  state?: ItemState;
}

interface Opt {
  carry?: ItemDef['carry'];
  model?: string;
  paint?: number;
  paint2?: number;
  eat?: ItemDef['eat'];
  drink?: ItemDef['drink'];
  heal?: ItemDef['heal'];
  revive?: ItemDef['revive'];
  wear?: ItemDef['wear'];
  pack?: ItemDef['pack'];
  lamp?: ItemDef['lamp'];
  gear?: ItemDef['gear'];
}

const ALL: ItemDef[] = [];

function I(id: string, cat: ItemCat, zh: string, en: string, stars: number, mass: number, salvage: Partial<Record<Material, number>>, blurb: string, o: Opt = {}): void {
  ALL.push({ id, cat, name: { zh, en }, stars, blurb, mass, carry: o.carry ?? (mass >= 12 ? 'large' : mass >= 3 ? 'medium' : 'small'), salvage, model: o.model ?? id, paint: o.paint ?? 0xd8c29a, paint2: o.paint2 ?? 0xf4efe2, ...strip(o) });
}

function strip(o: Opt): Partial<ItemDef> {
  const { carry: _c, model: _m, paint: _p, paint2: _p2, ...rest } = o;
  return rest;
}

const EAT = 3.9;
const PILL = 2.2;

// ------------------------------------------------------------------ food (eaten whole, over five seconds)

I('food_chips', 'food', '虾片', 'Prawn crackers', 1, 0.15, { organics: 5 }, '一袋虾片，嘎嘣脆，垫垫肚子。', { paint: 0xe07b39, paint2: 0xf0c23c, eat: { food: 20, hp: 2, sec: EAT } });
I('food_chips_ginger', 'food', '姜汁虾片', 'Ginger prawn crackers', 3, 0.15, { organics: 14 }, '加了老姜的虾片，吃完从胃里暖到手指头。', { model: 'food_chips', paint: 0xb85c3e, paint2: 0xf0c23c, eat: { food: 20, hp: 2, sec: EAT, effect: 'warm1' } });
I('food_chips_ginger_xl', 'food', '姜汁虾片（大包）', 'Ginger prawn crackers, family bag', 4, 0.3, { organics: 24 }, '一大包姜汁虾片，够吃一路，暖得更久。', { paint: 0x9e3b2f, paint2: 0xf0c23c, eat: { food: 40, hp: 4, sec: EAT, effect: 'warm2' } });
I('food_licorice', 'food', '甘草糖', 'Liquorice twists', 2, 0.2, { organics: 7 }, '黑乎乎的甘草糖，嚼起来没完没了，挺顶饿。', { paint: 0x2f3236, paint2: 0xc8323a, eat: { food: 40, hp: 4, sec: EAT } });
I('food_nuggets', 'food', '冻鸡块', 'Frozen chicken nuggets', 2, 0.75, { organics: 7 }, '一盒冻鸡块，化开了也能吃，就是有点软。', { paint: 0xf0c23c, paint2: 0xc8323a, eat: { food: 40, hp: 4, sec: EAT } });
I('food_dumplings', 'food', '冻饺子', 'Frozen dumplings', 2, 0.75, { organics: 8 }, '一袋冻饺子，生啃也行，煮了更好。', { paint: 0x7fb3d5, paint2: 0xf4efe2, eat: { food: 40, hp: 4, sec: EAT } });
I('food_fish_can', 'food', '鲭鱼罐头', 'Tin of mackerel', 3, 0.5, { organics: 10 }, '一罐油浸鲭鱼，吃完能撑好久。', { paint: 0x3e8e87, paint2: 0xede3c8, eat: { food: 75, hp: 6, sec: EAT } });
I('food_dog_old', 'food', '过期狗粮', 'Out-of-date dog food', 0, 0.4, { organics: 3 }, '早就过期的狗粮。实在饿了也能吃，代价是拉肚子。', { paint: 0xb9915f, paint2: 0x9e3b2f, eat: { food: 20, hp: 0, sec: EAT, effect: 'sick1' } });
I('food_cat_old', 'food', '过期猫粮', 'Out-of-date cat food', 0, 0.5, { organics: 3 }, '一罐过期猫粮，闻着就不太对劲。', { model: 'food_dog_old', paint: 0xa99bc9, paint2: 0x6b4a73, eat: { food: 20, hp: 0, sec: EAT, effect: 'sick1' } });
I('food_nuts_old', 'food', '受潮的坚果', 'Damp nuts', 1, 0.35, { organics: 3 }, '一包受潮的坚果，管饱，但肚子会闹一阵。', { paint: 0x557a46, paint2: 0xd8c29a, eat: { food: 40, hp: 0, sec: EAT, effect: 'sick2' } });

// ------------------------------------------------------------------ drinks (held to the mouth while the button is held)

I('drink_soda', 'drink', '橘子汽水', 'Orange soda', 1, 0.05, { organics: 3 }, '一罐橘子汽水，气跑了一半，还是解渴。', { paint: 0xe07b39, paint2: 0xf4efe2, drink: { litres: 0.33, liquid: 'water', rate: 0.075 } });
I('drink_cola', 'drink', '山谷可乐', 'Valley cola', 2, 0.05, { organics: 5 }, '谷里自己的可乐，冰的时候最好喝。', { model: 'drink_soda', paint: 0x9e3b2f, paint2: 0xede3c8, drink: { litres: 0.33, liquid: 'water', rate: 0.075 } });
I('drink_water', 'drink', '大瓶矿泉水', 'Big bottle of water', 2, 0.2, { organics: 5 }, '两升矿泉水。喝完瓶子留着，还能接水。', { paint: 0x7fb3d5, paint2: 0xf7f7f2, drink: { litres: 2, liquid: 'water', rate: 0.3 } });
I('drink_beer', 'drink', '啤酒', 'Bottle of beer', 1, 0.35, { organics: 4 }, '一瓶啤酒。喝了浑身发热，开车就别想了。', { paint: 0x557a46, paint2: 0xf0c23c, drink: { litres: 0.55, liquid: 'alcohol', rate: 0.1 } });
I('drink_spirit', 'drink', '高粱烈酒', 'Sorghum spirit', 2, 0.5, { organics: 7 }, '一瓶高粱烈酒，一口下去冻都不怕了，路也看不清了。', { paint: 0xf4efe2, paint2: 0xc8323a, drink: { litres: 1, liquid: 'alcohol', rate: 0.1 } });
I('drink_energy', 'drink', '能量饮料', 'Energy drink', 3, 0.05, { organics: 7 }, '喝完心跳加速，跑起来飞快，就是不解渴。', { paint: 0x2e4a6b, paint2: 0xa9d3b5, drink: { litres: 0.55, liquid: 'energy', rate: 0.1 } });

// ------------------------------------------------------------------ medicine

I('med_pain_1', 'med', '过期止痛片', 'Old painkillers', 1, 0.1, { organics: 10 }, '过期了，药效打了折，总比没有强。', { model: 'med_pain', paint: 0xd8c29a, paint2: 0xc8323a, eat: { food: 0, hp: 0, sec: PILL }, heal: { hp: 20 } });
I('med_pain_2', 'med', '止痛片', 'Painkillers', 3, 0.1, { organics: 16 }, '一板止痛片，吃两粒，伤口就不那么疼了。', { model: 'med_pain', paint: 0xf7f7f2, paint2: 0xc8323a, eat: { food: 0, hp: 0, sec: PILL }, heal: { hp: 35 } });
I('med_pain_3', 'med', '特效止痛片', 'Strong painkillers', 5, 0.1, { organics: 28 }, '医院里才有的特效药，一吃见效。', { model: 'med_pain', paint: 0x2e4a6b, paint2: 0xf0c23c, eat: { food: 0, hp: 0, sec: PILL }, heal: { hp: 50 } });
I('med_warm_1', 'med', '暖身丸', 'Warming pills', 1, 0.1, { organics: 8 }, '吃了身上一下就暖了。小作坊做的，偶尔会上头。', { model: 'med_warm', paint: 0xe07b39, paint2: 0xede3c8, eat: { food: 0, hp: 0, sec: PILL }, heal: { hp: 0, warm: 5, side: 0.5 } });
I('med_warm_2', 'med', '好暖身丸', 'Good warming pills', 3, 0.15, { organics: 12 }, '药厂出的暖身丸，暖得快，副作用少。', { model: 'med_warm', paint: 0xd4a53b, paint2: 0xede3c8, eat: { food: 0, hp: 0, sec: PILL }, heal: { hp: 0, warm: 5, side: 0.25 } });
I('med_warm_3', 'med', '特效暖身丸', 'Strong warming pills', 5, 0.15, { organics: 15 }, '登山队用的暖身丸，几乎没有副作用。', { model: 'med_warm', paint: 0x9e3b2f, paint2: 0xf0c23c, eat: { food: 0, hp: 0, sec: PILL }, heal: { hp: 0, warm: 5, side: 0.05 } });
I('med_kit_1', 'med', '旧急救包', 'Old first-aid kit', 2, 1.5, { organics: 24 }, '带在身上：倒下时会自己用上，让你缓过来。旧的，东西不全。', { model: 'med_kit', paint: 0xb9915f, paint2: 0xf7f7f2, revive: { hp: 10 } });
I('med_kit_2', 'med', '急救包', 'First-aid kit', 4, 1.5, { organics: 30 }, '带在身上：倒下时会自己用上。东西齐全，缓得更快。', { model: 'med_kit', paint: 0xc8323a, paint2: 0xf7f7f2, revive: { hp: 25 } });
I('med_kit_3', 'med', '好急救包', 'Good first-aid kit', 5, 1.5, { organics: 36 }, '专业的急救包，倒下了也能马上站起来接着走。', { model: 'med_kit', paint: 0xe07b39, paint2: 0xf7f7f2, revive: { hp: 50 } });

// ------------------------------------------------------------------ clothes (each slot's warmth lowers the cold one feels)

I('wear_cap', 'wear', '鸭舌帽', 'Cap', 1, 0.2, { scrap: 2 }, '挡挡太阳，挡不了多少风。', { paint: 0x2e4a6b, paint2: 0xede3c8, wear: { slot: 'hat', warmth: 3 } });
I('wear_beanie', 'wear', '毛线帽', 'Beanie', 3, 0.2, { scrap: 3 }, '一顶厚毛线帽，耳朵终于不冻了。', { paint: 0xc8323a, paint2: 0xede3c8, wear: { slot: 'hat', warmth: 5 } });
I('wear_trapper', 'wear', '护耳帽', 'Trapper hat', 4, 0.45, { scrap: 3 }, '带护耳的皮毛帽，风再大也吹不透。', { paint: 0x5a3a2b, paint2: 0xd8c29a, wear: { slot: 'hat', warmth: 7 } });
I('wear_jacket_torn', 'wear', '破外套', 'Torn jacket', 0, 1, { scrap: 1 }, '袖子都磨破了，聊胜于无。', { model: 'wear_jacket', paint: 0x6f7a82, paint2: 0x5a3a2b, wear: { slot: 'jacket', warmth: 3 } });
I('wear_sweater_torn', 'wear', '破毛衣', 'Torn sweater', 0, 0.8, { scrap: 1 }, '起球又破洞的毛衣，还能挡点风。', { paint: 0x7a7f45, paint2: 0xd8c29a, wear: { slot: 'jacket', warmth: 3 } });
I('wear_jacket', 'wear', '夹克', 'Jacket', 1, 1, { scrap: 4 }, '一件结实的旧夹克，春秋天正好。', { paint: 0x9e3b2f, paint2: 0x2f3236, wear: { slot: 'jacket', warmth: 5 } });
I('wear_padded', 'wear', '棉服', 'Padded jacket', 3, 1.2, { scrap: 6 }, '厚实的棉服，冬天出门就靠它了。', { paint: 0x2e4a6b, paint2: 0xd8c29a, wear: { slot: 'jacket', warmth: 7 } });
I('wear_down', 'wear', '羽绒服', 'Down jacket', 4, 1.2, { scrap: 9 }, '鼓鼓囊囊的羽绒服，零下二十度也不怕。', { paint: 0xe07b39, paint2: 0x2f3236, wear: { slot: 'jacket', warmth: 10 } });
I('wear_pants_torn', 'wear', '破裤子', 'Torn trousers', 0, 0.8, { scrap: 1 }, '膝盖磨出洞的裤子。', { model: 'wear_pants', paint: 0x6f7a82, paint2: 0x5a3a2b, wear: { slot: 'pants', warmth: 3 } });
I('wear_pants', 'wear', '工装裤', 'Work trousers', 1, 0.9, { scrap: 3 }, '口袋多、耐磨，修车穿正合适。', { paint: 0xb9915f, paint2: 0x5a3a2b, wear: { slot: 'pants', warmth: 5 } });
I('wear_pants_lined', 'wear', '加绒裤', 'Fleece-lined trousers', 3, 1, { scrap: 5 }, '里面一层绒，腿再也不打哆嗦。', { model: 'wear_pants', paint: 0x2f3236, paint2: 0xc8323a, wear: { slot: 'pants', warmth: 7 } });
I('wear_pants_snow', 'wear', '雪地裤', 'Snow trousers', 4, 1.1, { scrap: 7 }, '防水又保暖的雪地裤，雪里打滚都行。', { paint: 0x557a46, paint2: 0x2f3236, wear: { slot: 'pants', warmth: 10 } });
I('wear_shoes_torn', 'wear', '破鞋', 'Worn-out shoes', 0, 0.8, { scrap: 2 }, '鞋底都快掉了。', { model: 'wear_shoes', paint: 0x5a3a2b, paint2: 0x6f7a82, wear: { slot: 'shoes', warmth: 3 } });
I('wear_shoes', 'wear', '靴子', 'Boots', 1, 1.2, { scrap: 3 }, '一双结实的靴子，泥里雪里都能走。', { paint: 0x5a3a2b, paint2: 0xb9915f, wear: { slot: 'shoes', warmth: 3 } });
I('wear_gloves_torn', 'wear', '破手套', 'Torn gloves', 0, 0.2, { scrap: 2 }, '手指头都露在外面。', { model: 'wear_gloves', paint: 0x6f7a82, paint2: 0x5a3a2b, wear: { slot: 'gloves', warmth: 1 } });
I('wear_gloves', 'wear', '劳保手套', 'Work gloves', 1, 0.2, { scrap: 3 }, '修车搬东西都不怕磨手。', { paint: 0xd4a53b, paint2: 0x2f3236, wear: { slot: 'gloves', warmth: 3 } });
I('wear_gloves_wool', 'wear', '毛线手套', 'Woollen gloves', 3, 0.25, { scrap: 5 }, '厚厚的毛线手套，冬天开车握方向盘不冰手。', { model: 'wear_gloves', paint: 0xc8323a, paint2: 0xede3c8, wear: { slot: 'gloves', warmth: 5 } });
I('wear_gloves_ski', 'wear', '滑雪手套', 'Ski gloves', 4, 0.3, { scrap: 7 }, '防风防水的滑雪手套，最暖和的一双。', { model: 'wear_gloves', paint: 0x2e4a6b, paint2: 0xe07b39, wear: { slot: 'gloves', warmth: 7 } });

// ------------------------------------------------------------------ backpacks, head lamps

I('pack_old', 'pack', '旧背包', 'Old backpack', 1, 1, { scrap: 3 }, '背上它能多带两样东西。带子有点松。', { paint: 0x7a7f45, paint2: 0x5a3a2b, pack: { slots: 2 } });
I('pack_std', 'pack', '帆布背包', 'Canvas rucksack', 3, 1, { scrap: 6 }, '结实的帆布背包，能多带三样东西。', { paint: 0xb85c3e, paint2: 0x5a3a2b, pack: { slots: 3 } });
I('pack_hike', 'pack', '登山包', 'Hiking pack', 4, 1.2, { scrap: 8 }, '带骨架的登山包，能多带四样东西。', { paint: 0x3e8e87, paint2: 0x2f3236, pack: { slots: 4 } });
I('lamp_old', 'lamp', '旧头灯', 'Old head lamp', 1, 0.4, { scrap: 7 }, '戴在头上，L 开关。灯光发黄，照得不远。', { paint: 0x2f3236, paint2: 0xd4a53b, lamp: { range: 7 } });
I('lamp_std', 'lamp', '头灯', 'Head lamp', 3, 0.4, { scrap: 10 }, '戴在头上，L 开关。又白又亮，照得远。', { model: 'lamp_old', paint: 0xe07b39, paint2: 0x2f3236, lamp: { range: 10 } });

// ------------------------------------------------------------------ gear

I('hammer_1', 'gear', '旧大锤', 'Old sledgehammer', 1, 14, { scrap: 6 }, '砸开钉死的木板和锁着的门。木柄有裂，砸三下就散。', { model: 'hammer', paint: 0xb9915f, paint2: 0x6f7a82, carry: 'medium', gear: { kind: 'hammer', uses: 3 } });
I('hammer_2', 'gear', '大锤', 'Sledgehammer', 3, 15, { scrap: 14 }, '砸开钉死的木板和锁着的门，能砸十下。', { model: 'hammer', paint: 0x9e3b2f, paint2: 0x6f7a82, carry: 'medium', gear: { kind: 'hammer', uses: 10 } });
I('hammer_3', 'gear', '好大锤', 'Fine sledgehammer', 5, 16, { scrap: 15 }, '玻璃钢柄的大锤，能砸二十五下。', { model: 'hammer', paint: 0xf0c23c, paint2: 0x2f3236, carry: 'medium', gear: { kind: 'hammer', uses: 25 } });
I('repair_1', 'gear', '旧修理包', 'Old repair kit', 1, 3.2, { scrap: 10 }, '对着坏了的零件按住，慢慢修好它。东西不多，修不了几件。', { model: 'repair', paint: 0x6f7a82, paint2: 0xd4a53b, gear: { kind: 'repair', points: 300, rate: 50 } });
I('repair_2', 'gear', '修理包', 'Repair kit', 3, 3, { scrap: 20 }, '一箱像样的工具和配件，修得快，修得多。', { model: 'repair', paint: 0xc8323a, paint2: 0x2f3236, gear: { kind: 'repair', points: 1000, rate: 60 } });
I('repair_3', 'gear', '好修理包', 'Fine repair kit', 5, 2.6, { scrap: 30 }, '赛车队的修理包，什么都修得好。', { model: 'repair', paint: 0x2e4a6b, paint2: 0xf0c23c, gear: { kind: 'repair', points: 2500, rate: 100 } });
I('flare_gun', 'gear', '信号枪', 'Flare gun', 5, 1, { scrap: 35 }, '只有一发。打上天，会有人看见的。', { paint: 0xe07b39, paint2: 0x2f3236, gear: { kind: 'flare', uses: 1 } });

// ------------------------------------------------------------------ junk (for the recycler)

I('junk_sign', 'junk', '广告牌', 'Advertising board', 0, 1, { scrap: 2 }, '一块褪了色的汽水广告牌。', { paint: 0xe07b39, paint2: 0xf4efe2 });
I('junk_bucket', 'junk', '水桶', 'Bucket', 0, 1, { scrap: 2 }, '铁皮水桶，还没漏。', { paint: 0x6f7a82, paint2: 0x2f3236 });
I('junk_bucket_old', 'junk', '旧水桶', 'Old bucket', 0, 1, { scrap: 1 }, '桶底锈穿了，装不了水了。', { model: 'junk_bucket', paint: 0x9e3b2f, paint2: 0x2f3236 });
I('junk_bucket_paint', 'junk', '结垢的漆桶', 'Crusty paint bucket', 0, 1, { scrap: 1 }, '一桶干透了的油漆，硬得像石头。', { paint: 0xede3c8, paint2: 0x3e8e87 });
I('junk_camera', 'junk', '三脚架相机', 'Camera on a tripod', 0, 5, { scrap: 12 }, '老式相机架在三脚架上，零件不少。', { paint: 0x2f3236, paint2: 0x6f7a82 });
I('junk_candle', 'junk', '大烛台', 'Big candlestick', 0, 5, { scrap: 3 }, '沉甸甸的铜烛台。', { paint: 0xd4a53b, paint2: 0x5a3a2b });
I('junk_chair', 'junk', '椅子', 'Chair', 0, 3, { scrap: 5 }, '一把铁腿椅子。', { paint: 0x3e8e87, paint2: 0x6f7a82 });
I('junk_chair_wood', 'junk', '木椅', 'Wooden chair', 0, 5, { scrap: 3 }, '一把老木椅，晃晃悠悠的。', { paint: 0xb9915f, paint2: 0x5a3a2b });
I('junk_chair_soft', 'junk', '软椅', 'Cushioned chair', 0, 6, { scrap: 5 }, '坐垫塌了一半的软椅。', { paint: 0x6e2534, paint2: 0x5a3a2b });
I('junk_chair_fold', 'junk', '折叠椅', 'Folding chair', 0, 3, { scrap: 4 }, '野餐用的折叠椅。', { paint: 0x557a46, paint2: 0x6f7a82 });
I('junk_chair_office', 'junk', '办公椅', 'Office chair', 0, 6, { scrap: 6 }, '带轮子的办公椅，一个轮子不转了。', { paint: 0x2f3236, paint2: 0x6f7a82 });
I('junk_stool', 'junk', '铁凳', 'Metal stool', 0, 5, { scrap: 4 }, '车间里的铁凳子。', { paint: 0x6f7a82, paint2: 0x2f3236 });
I('junk_stool_tall', 'junk', '高脚凳', 'Tall stool', 0, 1.5, { scrap: 3 }, '吧台边的高脚凳。', { paint: 0xc8323a, paint2: 0x6f7a82 });
I('junk_sunchair', 'junk', '躺椅', 'Sun lounger', 0, 3.3, { scrap: 2 }, '晒太阳用的帆布躺椅。', { carry: 'large', paint: 0xf0c23c, paint2: 0xb9915f });
I('junk_clockradio', 'junk', '收音闹钟', 'Clock radio', 0, 0.6, { scrap: 2 }, '到点就响的收音机，早就不响了。', { paint: 0xede3c8, paint2: 0x2f3236 });
I('junk_hanger', 'junk', '衣帽架', 'Coat stand', 0, 2.5, { scrap: 4 }, '立式的衣帽架。', { carry: 'large', paint: 0x5a3a2b, paint2: 0x6f7a82 });
I('junk_coffee', 'junk', '咖啡机', 'Coffee maker', 0, 2, { scrap: 6 }, '滴滤咖啡机，玻璃壶还在。', { paint: 0x2f3236, paint2: 0xc8323a });
I('junk_fax', 'junk', '传真机', 'Fax machine', 0, 3, { scrap: 7 }, '一台老传真机，里面零件不少。', { paint: 0xede3c8, paint2: 0x6f7a82 });
I('junk_box_food', 'junk', '纸箱', 'Cardboard box', 0, 1, { scrap: 2 }, '一个空纸箱。', { paint: 0xb9915f, paint2: 0x5a3a2b });
I('junk_lamp', 'junk', '台灯', 'Desk lamp', 0, 1, { scrap: 3 }, '弯脖子的台灯。', { paint: 0x3e8e87, paint2: 0x6f7a82 });
I('junk_barrel', 'junk', '铁皮桶', 'Steel drum', 0, 30, { scrap: 16 }, '空的大铁皮桶，沉得很。', { paint: 0x2e4a6b, paint2: 0x6f7a82 });
I('junk_mop', 'junk', '拖把', 'Mop', 0, 1.5, { scrap: 1 }, '一把拖把。', { carry: 'medium', paint: 0x7fb3d5, paint2: 0xede3c8 });
I('junk_mug', 'junk', '马克杯', 'Mug', 0, 0.3, { scrap: 1 }, '缺了个口的马克杯。', { paint: 0xc8323a, paint2: 0xf4efe2 });
I('junk_ball', 'junk', '旧皮球', 'Old ball', 0, 0.5, { organics: 1 }, '瘪了的皮球。', { paint: 0xe07b39, paint2: 0xf4efe2 });
I('junk_pillow', 'junk', '枕头', 'Pillow', 0, 1, { scrap: 1 }, '软乎乎的枕头。抱着睡一觉多好。', { paint: 0xf4efe2, paint2: 0x7fb3d5 });
I('junk_pillow_s', 'junk', '小靠垫', 'Cushion', 0, 0.5, { scrap: 1 }, '沙发上的小靠垫。', { paint: 0xe8a3a8, paint2: 0xf4efe2 });
I('junk_crate_plastic', 'junk', '塑料筐', 'Plastic crate', 0, 1, { scrap: 2 }, '红色的塑料周转筐。', { paint: 0xc8323a, paint2: 0x2f3236 });
I('junk_plate', 'junk', '盘子', 'Plate', 0, 0.5, { scrap: 1 }, '一个搪瓷盘子。', { paint: 0xf4efe2, paint2: 0x2e4a6b });
I('junk_transceiver', 'junk', '电台', 'Radio transceiver', 0, 14, { scrap: 38 }, '一台老式无线电台，拆开全是好零件。', { paint: 0x7a7f45, paint2: 0x2f3236 });
I('junk_record', 'junk', '唱片机', 'Record player', 0, 4, { scrap: 6 }, '手提箱式的唱片机。', { paint: 0xb85c3e, paint2: 0x2f3236 });
I('junk_vinyl', 'junk', '黑胶唱片', 'Vinyl record', 0, 0.3, { scrap: 1 }, '一张黑胶唱片，封套都褪色了。', { paint: 0xa99bc9, paint2: 0x2f3236 });
I('junk_cage', 'junk', '小笼子', 'Small cage', 0, 2, { scrap: 3 }, '养鸟用的铁丝笼子。', { paint: 0xd8c29a, paint2: 0x6f7a82 });
I('junk_bin', 'junk', '垃圾桶', 'Waste bin', 0, 2.2, { scrap: 3 }, '带脚踏的铁皮垃圾桶。', { paint: 0x557a46, paint2: 0x6f7a82 });
I('junk_solar_lamp', 'junk', '太阳能灯', 'Solar lamp', 0, 2, { scrap: 7 }, '插在院子里的太阳能灯，白天充电晚上亮。', { paint: 0x2f3236, paint2: 0xf0c23c });
I('junk_rod', 'junk', '断鱼竿', 'Broken fishing rod', 0, 1, { scrap: 4 }, '断成两截的鱼竿，线轮还能用。', { carry: 'medium', paint: 0x2e4a6b, paint2: 0x6f7a82 });
I('junk_sign_wet', 'junk', '小心地滑牌', 'Wet floor sign', 0, 1, { scrap: 1 }, '黄色的小心地滑牌。', { paint: 0xf0c23c, paint2: 0x2f3236 });
I('junk_tv', 'junk', '旧电视', 'Old television', 0, 6, { scrap: 10 }, '大屁股电视机，砸了可惜，回收正好。', { paint: 0x5a3a2b, paint2: 0x2f3236 });
I('junk_cone', 'junk', '路锥', 'Traffic cone', 0, 1, { scrap: 1 }, '一个路锥。', { paint: 0xe07b39, paint2: 0xf4efe2 });
I('junk_bag', 'junk', '垃圾袋', 'Bin bag', 0, 6, { organics: 3 }, '鼓鼓的一袋垃圾，最好别打开。', { paint: 0x2f3236, paint2: 0x6f7a82 });
I('junk_bag_s', 'junk', '小垃圾袋', 'Small bin bag', 0, 1, { organics: 1 }, '一小袋垃圾。', { model: 'junk_bag', paint: 0x557a46, paint2: 0x6f7a82 });
I('junk_trolley', 'junk', '手推车', 'Hand truck', 0, 5, { scrap: 4 }, '搬货用的两轮手推车。', { carry: 'large', paint: 0xc8323a, paint2: 0x2f3236 });
I('junk_jack', 'junk', '卧式千斤顶', 'Trolley jack', 0, 12, { scrap: 6 }, '车间里的卧式千斤顶，液压早漏光了。', { paint: 0xc8323a, paint2: 0x6f7a82 });
I('junk_trumpet', 'junk', '小号', 'Trumpet', 0, 1.2, { scrap: 2 }, '一把凹了的小号，还吹得响。', { paint: 0xd4a53b, paint2: 0x5a3a2b });
I('junk_food_bucket', 'junk', '粮食桶', 'Feed bucket', 0, 8, { organics: 22 }, '一桶喂牲口的粮食，回收能出不少有机物。', { paint: 0xede3c8, paint2: 0x557a46 });

// ------------------------------------------------------------------ boxes of components (the recycler's best friends)

I('crate_parts', 'crate', '旧零件箱', 'Box of old components', 0, 2, { scrap: 20 }, '一箱拆下来的螺丝、垫片和小零件。丢进回收台，能出二十废料。', { paint: 0xb9915f, paint2: 0x6f7a82 });
I('crate_parts_s', 'crate', '小零件盒', 'Small box of components', 0, 4, { scrap: 10 }, '一盒小零件，回收出十废料。', { model: 'crate_parts', paint: 0xd8c29a, paint2: 0x6f7a82 });
I('crate_parts_heavy', 'crate', '重零件箱', 'Heavy box of components', 0, 12, { scrap: 24 }, '一大箱铁疙瘩，搬起来腰都直不起来。', { paint: 0x9e7a4f, paint2: 0x6f7a82, carry: 'medium' });
I('crate_junk', 'crate', '一箱破烂', 'Box of junk', 0, 3.5, { scrap: 8 }, '什么都有一点的破烂箱子。', { paint: 0xb9915f, paint2: 0x2f3236 });
I('crate_chem', 'crate', '化工箱', 'Box of chemicals', 0, 2.4, { chemicals: 12, organics: 8 }, '一箱瓶瓶罐罐的化学品，回收出化学品和有机物。', { paint: 0xede3c8, paint2: 0x58b8e8 });
I('crate_lye', 'crate', '碱液箱', 'Box of lye', 0, 10, { chemicals: 10, organics: 4 }, '一箱碱液，搬的时候别洒了。', { paint: 0xf4efe2, paint2: 0x7a7f45 });
I('crate_supps', 'crate', '营养品箱', 'Box of food supplements', 0, 5, { organics: 10 }, '一箱过期的营养品，回收出有机物。', { paint: 0xa9d3b5, paint2: 0xf4efe2 });

/** every kind of thing, in the catalogue's order: the kinds above, then what systems registered, in the order they did */
export const ITEMS: readonly ItemDef[] = ALL;

/**
 * The kinds above alone, as they were before any system registered anything. The loot tables that existed
 * before V3 pick by category out of THIS list (src/core/modcar/loot.ts, wrecks.ts), so a kind registered later,
 * even into one of the nine old categories, never enters what a seed's containers and wrecks hold.
 */
export const BASE_ITEMS: readonly ItemDef[] = Object.freeze(ALL.slice());

const BY_ID = new Map(ALL.map((d) => [d.id, d]));

export function itemDef(id: string): ItemDef {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`no item ${id}`);
  return d;
}

export function hasItem(id: string): boolean {
  return BY_ID.has(id);
}

export function itemsOf(cat: ItemCatId): ItemDef[] {
  return ALL.filter((d) => d.cat === cat);
}

// ------------------------------------------------------------------ the open catalogue

export interface ItemCatDef {
  readonly id: string;
  readonly name: Text;
  /** its place in lists of categories: the nine built in are 0, 10 ... 80; one registered without an order comes after them, in the order registered */
  readonly order: number;
}

const CATS: ItemCatDef[] = (Object.keys(ITEM_CATS) as ItemCat[]).map((id, i) => ({ id, name: ITEM_CATS[id], order: i * 10 }));
const CAT_BY_ID = new Map(CATS.map((c) => [c.id, c]));
let catSeq = 0;

/** a new category of things (a system does this once, as its module is loaded); an id taken already throws */
export function registerItemCat(def: { readonly id: string; readonly name: Text; readonly order?: number }): void {
  if (!ID_RE.test(def.id)) throw new Error(`item category "${def.id}": an id is lower-case letters, digits and _`);
  if (CAT_BY_ID.has(def.id)) throw new Error(`item category ${def.id} is registered already`);
  const c: ItemCatDef = { id: def.id, name: def.name, order: def.order ?? 1000 + catSeq++ };
  CATS.push(c);
  CAT_BY_ID.set(c.id, c);
  // sort is stable: equal orders keep the order they were registered in
  CATS.sort((a, b) => a.order - b.order);
}

export function hasItemCat(id: string): boolean {
  return CAT_BY_ID.has(id);
}

export function itemCat(id: string): ItemCatDef {
  const c = CAT_BY_ID.get(id);
  if (!c) throw new Error(`no item category ${id}`);
  return c;
}

/** every category, in list order */
export function itemCats(): readonly ItemCatDef[] {
  return CATS;
}

/** a kind as a system writes it: what the catalogue can work out may be left out (carried by its weight, modelled by its id, kraft and cream, nothing for the recycler, no line on its card) */
export type ItemRow = Omit<ItemDef, 'carry' | 'model' | 'paint' | 'paint2' | 'salvage' | 'blurb'> & Partial<Pick<ItemDef, 'carry' | 'model' | 'paint' | 'paint2' | 'salvage' | 'blurb'>>;

const ID_RE = /^[a-z][a-z0-9_]*$/;
const TAG_RE = /^[a-z][a-z0-9_]*$/;

/** what is wrong with one row (nothing: an empty list) */
function rowProblems(r: ItemRow, taken: (id: string) => boolean): string[] {
  const bad: string[] = [];
  const say = (m: string): void => void bad.push(`item ${r.id}: ${m}`);
  if (typeof r.id !== 'string' || !ID_RE.test(r.id)) say('an id is lower-case letters, digits and _');
  else if (taken(r.id)) say('is registered already');
  if (!CAT_BY_ID.has(r.cat)) say(`no category ${r.cat} (register it first)`);
  if (!r.name || typeof r.name.zh !== 'string' || typeof r.name.en !== 'string' || !r.name.zh || !r.name.en) say('needs a name in both languages');
  if (!Number.isInteger(r.stars) || r.stars < 0 || r.stars > 5) say('stars are 0 to 5');
  if (!(r.mass >= 0) || !Number.isFinite(r.mass)) say('mass is a weight in kg');
  for (const t of r.tags ?? []) if (!TAG_RE.test(t)) say(`tag "${t}": lower-case letters, digits and _`);
  if (r.stack !== undefined) {
    if (!Number.isInteger(r.stack) || r.stack < 1 || r.stack > MAX_COUNT) say(`stack is a whole number from 1 to ${MAX_COUNT}`);
    // a thing with a level of its own (litres, blows left) or with things in it is one of a kind
    if (r.stack > 1 && (r.drink || r.gear?.uses !== undefined || r.gear?.points !== undefined || r.holds || r.pack)) say('a thing that is drunk from, wears out, holds things or is a backpack does not stack');
  }
  if (r.holds) {
    if (!Number.isInteger(r.holds.slots) || r.holds.slots < 1) say('holds.slots is a whole number from 1');
    if (!r.holds.accepts.length) say('holds.accepts is empty');
    for (const a of r.holds.accepts) if (a !== '*' && !(a.startsWith('#') ? TAG_RE.test(a.slice(1)) : ID_RE.test(a))) say(`holds.accepts "${a}": a category id, "#tag" or "*"`);
    if (r.holds.maxKg !== undefined && !(r.holds.maxKg > 0)) say('holds.maxKg is a weight in kg');
    if (r.holds.decay !== undefined && !(r.holds.decay >= 0 && Number.isFinite(r.holds.decay))) say('holds.decay is a rate from 0');
  }
  if (r.perish && !(r.perish.hours > 0 && Number.isFinite(r.perish.hours))) say('perish.hours is a time in game hours');
  return bad;
}

/**
 * Add kinds to the catalogue (a system does this once, as its module is loaded, before a save is read).
 * All of them or none: one bad row (an id taken, a category not registered, a stack of things that cannot
 * stack) throws with every problem found and nothing is added.
 */
export function registerItems(rows: readonly ItemRow[]): void {
  const bad: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    bad.push(...rowProblems(r, (id) => BY_ID.has(id) || seen.has(id)));
    seen.add(r.id);
  }
  if (bad.length) throw new Error(bad.join('; '));
  for (const r of rows) {
    const d: ItemDef = {
      ...r,
      carry: r.carry ?? (r.mass >= 12 ? 'large' : r.mass >= 3 ? 'medium' : 'small'),
      model: r.model ?? r.id,
      paint: r.paint ?? 0xd8c29a,
      paint2: r.paint2 ?? 0xf4efe2,
      salvage: r.salvage ?? {},
      blurb: r.blurb ?? '',
    };
    ALL.push(d);
    BY_ID.set(d.id, d);
  }
}

/**
 * What is wrong with the catalogue as a whole, for the tests of whoever registers into it (nothing: an empty
 * list): a kind that turns into one that does not exist, or into one that itself goes off into a third
 * (one step only), a container no registered kind fits into.
 */
export function itemCatalogueProblems(): string[] {
  const bad: string[] = [];
  const tags = new Set<string>();
  for (const d of ALL) for (const t of d.tags ?? []) tags.add(t);
  for (const d of ALL) {
    if (!CAT_BY_ID.has(d.cat)) bad.push(`item ${d.id}: no category ${d.cat}`);
    const into = d.perish?.into;
    if (into !== undefined) {
      const t = BY_ID.get(into);
      if (!t) bad.push(`item ${d.id}: turns into ${into}, which does not exist`);
      else if (t.perish?.into !== undefined) bad.push(`item ${d.id}: turns into ${into}, which turns into something again`);
      else if ((t.stack ?? 1) < (d.stack ?? 1)) bad.push(`item ${d.id}: stacks to ${d.stack}, but what it turns into (${into}) stacks to ${t.stack ?? 1}`);
    }
    for (const a of d.holds?.accepts ?? []) {
      if (a === '*') continue;
      if (a.startsWith('#') ? !tags.has(a.slice(1)) : !CAT_BY_ID.has(a)) bad.push(`item ${d.id}: accepts ${a}, which nothing is`);
    }
  }
  return bad;
}

// ------------------------------------------------------------------ instances

let uidN = 0;

function nextUid(): string {
  uidN++;
  return `i${uidN.toString(36)}`;
}

/** things read back from a save keep their ids: new ones are numbered past them (pass the uids of things inside things too: forEachItem) */
export function reserveItemUids(uids: readonly string[]): void {
  for (const u of uids) {
    const k = /^i([0-9a-z]+)$/.exec(u);
    if (k) uidN = Math.max(uidN, parseInt(k[1], 36));
  }
}

/**
 * One thing of a kind (or a stack: `n`); a drink comes full unless it says, a hammer and a repair kit new,
 * a thing that goes off fresh. Its freshness starts counting at `t0` if given (the world clock's seconds),
 * otherwise when stampFresh is first called on it.
 */
export function newItem(id: string, o: Partial<ItemInstance> = {}): ItemInstance {
  const d = itemDef(id);
  return {
    uid: nextUid(),
    item: id,
    ...(d.drink ? { litres: d.drink.litres } : {}),
    ...(d.gear?.uses !== undefined ? { uses: d.gear.uses } : d.gear?.points !== undefined ? { uses: d.gear.points } : {}),
    ...(d.perish ? { fresh: 1 } : {}),
    ...o,
  };
}

/** the most one stack may ever hold, whatever a kind says */
export const MAX_COUNT = 9999;

/** how many a stack of this kind holds (1: it does not stack) */
export function stackMax(id: string): number {
  return itemDef(id).stack ?? 1;
}

/** how many this one is (a stack counts its count) */
export function countOf(inst: ItemInstance): number {
  return inst.n ?? 1;
}

/** the count is written only when it is more than one (one canonical form in saves and comparisons); 0 marks a stack used up, to be dropped by whoever holds it */
function setCount(inst: ItemInstance, n: number): void {
  if (n === 1) delete inst.n;
  else inst.n = n;
}

/** the thing and what is in it: for walking a save, reserving uids, stamping freshness */
export function forEachItem(inst: ItemInstance, fn: (x: ItemInstance, box: ItemInstance | null) => void): void {
  fn(inst, null);
  if (inst.inside) for (const x of inst.inside) fn(x, inst);
}

/** what the recycler gives for it: its kind's salvage, and one organics more for every half litre of liquid in it; a stack gives that for each, a container also what is in it */
export function salvageOf(inst: ItemInstance): Partial<Record<Material, number>> {
  const d = itemDef(inst.item);
  const n = inst.n ?? 1;
  const out: Partial<Record<Material, number>> = {};
  for (const m of MATERIAL_IDS) {
    const v = d.salvage[m];
    if (v) out[m] = v * n;
  }
  const liquid = Math.floor((inst.litres ?? 0) / 0.5);
  if (liquid > 0) out.organics = (out.organics ?? 0) + liquid * n;
  if (inst.inside) {
    for (const x of inst.inside) {
      const s = salvageOf(x);
      for (const m of MATERIAL_IDS) if (s[m]) out[m] = (out[m] ?? 0) + s[m]!;
    }
  }
  return out;
}

/** how heavy it is now (kg): all of a stack, with what is in it */
export function itemMass(inst: ItemInstance): number {
  let m = (itemDef(inst.item).mass + (inst.litres ?? 0)) * (inst.n ?? 1);
  if (inst.inside) for (let i = 0; i < inst.inside.length; i++) m += itemMass(inst.inside[i]);
  return m;
}

/** its name, with what is in it and how many there are */
export function itemName(inst: ItemInstance, lang: 'zh' | 'en' = 'zh'): string {
  const d = itemDef(inst.item);
  if (d.drink) return `${d.name[lang]}（${(inst.litres ?? 0).toFixed(2)} L）`;
  const n = inst.n ?? 1;
  return n > 1 ? `${d.name[lang]} ×${n}` : d.name[lang];
}

/** the colours its model is painted */
export function itemPaint(inst: ItemInstance): { paint: number; paint2: number } {
  const d = itemDef(inst.item);
  return { paint: inst.tint ?? d.paint, paint2: d.paint2 };
}

/** the models the catalogue asks for (one file serves every kind that names it) */
export function itemModels(): string[] {
  return [...new Set(ALL.map((d) => d.model))];
}

/** does this kind carry this tag? (no allocation: this is asked while the player looks at things) */
export function hasTag(d: ItemDef, tag: string): boolean {
  const t = d.tags;
  if (!t) return false;
  for (let i = 0; i < t.length; i++) if (t[i] === tag) return true;
  return false;
}

// ------------------------------------------------------------------ freshness (lazy: a value at a time, read when asked)

const HOUR_S = 3600;

/** how fresh it is now, 1 ... 0 (1 for a thing that does not go off) */
export function freshNow(inst: ItemInstance, nowS: number): number {
  const f0 = inst.fresh;
  if (f0 === undefined) return 1;
  const t0 = inst.t0;
  if (t0 === undefined) return f0;
  const p = itemDef(inst.item).perish;
  if (!p) return f0;
  const dt = nowS - t0;
  if (!(dt > 0)) return f0;
  const f = f0 - (dt / (p.hours * HOUR_S)) * (inst.fk ?? 1);
  return f > 0 ? f : 0;
}

/** fresh (0), still good (1), going off (2), turned (3): the card's word, and what a recipe may ask */
export type FreshStage = 0 | 1 | 2 | 3;

export function freshStage(f: number): FreshStage {
  return f > 0.6 ? 0 : f > 0.3 ? 1 : f > 0 ? 2 : 3;
}

/** start a thing's freshness counting if it has not started (a thing that goes off, made without a time); with what is in it */
export function stampFresh(inst: ItemInstance, nowS: number): void {
  if (itemDef(inst.item).perish) {
    if (inst.fresh === undefined) inst.fresh = 1;
    if (inst.t0 === undefined) inst.t0 = nowS;
  }
  if (inst.inside) for (let i = 0; i < inst.inside.length; i++) stampFresh(inst.inside[i], nowS);
}

/** bring its freshness up to now (it goes off from here): before its rate changes, before two stacks become one */
export function rebaseFresh(inst: ItemInstance, nowS: number): void {
  if (inst.fresh === undefined) return;
  inst.fresh = freshNow(inst, nowS);
  inst.t0 = nowS;
}

/** how fast it goes off from now on: 1 in the open air, what holds it says otherwise (ItemDef.holds.decay) */
export function setFreshRate(inst: ItemInstance, nowS: number, k: number): void {
  if (inst.fresh === undefined) return;
  if ((inst.fk ?? 1) === k && inst.t0 !== undefined) return;
  rebaseFresh(inst, nowS);
  if (k === 1) delete inst.fk;
  else inst.fk = k;
}

/** has it gone off altogether? */
export function turned(inst: ItemInstance, nowS: number): boolean {
  return inst.fresh !== undefined && freshNow(inst, nowS) <= 0;
}

/**
 * A thing that has turned becomes what its kind says (perish.into), in place: the same uid, the same count
 * and the same place, nothing else of what it was. True when it changed kind (its picture, its name and its
 * card must be made again). Call it where the world looks at a thing: as it is picked up, listed, shown on a
 * card, eaten, saved. A kind without perish.into stays what it is, turned.
 */
export function settleItem(inst: ItemInstance, nowS: number): boolean {
  if (inst.fresh === undefined || freshNow(inst, nowS) > 0) return false;
  const into = itemDef(inst.item).perish?.into;
  if (into === undefined) return false;
  const d = BY_ID.get(into);
  if (!d) return false;
  inst.item = into;
  delete inst.fresh;
  delete inst.t0;
  delete inst.fk;
  delete inst.q;
  delete inst.state;
  delete inst.tint;
  delete inst.opened;
  if (d.perish) {
    inst.fresh = 1;
    inst.t0 = nowS;
  }
  return true;
}

// ------------------------------------------------------------------ stacks

/** two stacks whose freshness differs by no more than this may become one (it takes the mean, by count) */
export const STACK_FRESH_TOL = 0.25;

/** JSON with its keys in order, so two states written in different orders compare equal */
function stableJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
    .join(',')}}`;
}

function sameState(a: ItemState | undefined, b: ItemState | undefined): boolean {
  if (a === undefined && b === undefined) return true;
  return stableJson(a ?? {}) === stableJson(b ?? {});
}

/** the same sort of thing, apart from how fresh: the same kind, a kind that stacks, nothing inside, no level of their own (litres, blows left), the same colour, quality and state */
function sameSort(a: ItemInstance, b: ItemInstance): boolean {
  if (a === b || a.item !== b.item) return false;
  if ((itemDef(a.item).stack ?? 1) <= 1) return false;
  if (a.inside !== undefined || b.inside !== undefined) return false;
  if (a.litres !== undefined || b.litres !== undefined || a.uses !== undefined || b.uses !== undefined) return false;
  if (a.tint !== b.tint || a.q !== b.q || !!a.opened !== !!b.opened) return false;
  return a.state === b.state || sameState(a.state, b.state);
}

/** about as fresh as each other (STACK_FRESH_TOL), each read at its own rate; a turned one only with turned ones */
function freshClose(a: ItemInstance, b: ItemInstance, nowS: number): boolean {
  if ((a.fresh === undefined) !== (b.fresh === undefined)) return false;
  if (a.fresh === undefined) return true;
  const fa = freshNow(a, nowS);
  const fb = freshNow(b, nowS);
  if ((fa <= 0) !== (fb <= 0)) return false;
  return Math.abs(fa - fb) <= STACK_FRESH_TOL;
}

/**
 * May these two be one stack? (Not whether there is room: mergeStacks says how many fit.) The same kind, a
 * kind that stacks, nothing inside, no level of their own (litres, blows left), the same colour, quality and
 * state, going off at the same rate and about as fresh (STACK_FRESH_TOL; a turned one only with turned ones).
 */
export function canStack(a: ItemInstance, b: ItemInstance, nowS: number): boolean {
  return sameSort(a, b) && (a.fk ?? 1) === (b.fk ?? 1) && freshClose(a, b, nowS);
}

/** move k of `from` onto `into` (the caller has checked that they stack and that k fit) */
function mergeSome(into: ItemInstance, from: ItemInstance, k: number, nowS: number): void {
  const na = countOf(into);
  if (into.fresh !== undefined) {
    // the mean by count: no freshness is made or lost by putting things together
    into.fresh = (freshNow(into, nowS) * na + freshNow(from, nowS) * k) / (na + k);
    into.t0 = nowS;
  }
  setCount(into, na + k);
  setCount(from, countOf(from) - k);
}

/**
 * Move as many of `from` as fit onto the stack `into`. Returns how many are left in `from`: when 0, `from`
 * is used up (its count reads 0) and whoever holds it drops it. Nothing moves when they do not stack.
 */
export function mergeStacks(into: ItemInstance, from: ItemInstance, nowS: number): number {
  const left = countOf(from);
  if (left <= 0 || !canStack(into, from, nowS)) return left;
  const room = stackMax(into.item) - countOf(into);
  if (room <= 0) return left;
  const k = Math.min(room, left);
  mergeSome(into, from, k, nowS);
  return left - k;
}

/** take k off a stack as a new stack (a new uid). null when k is not a whole number from 1 to one less than what there is (to take all of it, take the thing itself). */
export function splitStack(inst: ItemInstance, k: number): ItemInstance | null {
  const n = countOf(inst);
  if (!Number.isInteger(k) || k < 1 || k >= n) return null;
  const out: ItemInstance = { ...inst, uid: nextUid() };
  if (inst.state !== undefined) out.state = JSON.parse(JSON.stringify(inst.state)) as ItemState;
  setCount(out, k);
  setCount(inst, n - k);
  return out;
}

// ------------------------------------------------------------------ things that hold things

/** would this box take a thing of this kind at all? (its kind, not whether there is room: roomInside) */
export function accepts(box: ItemInstance, inst: ItemInstance): boolean {
  if (box === inst) return false;
  const h = itemDef(box.item).holds;
  if (!h) return false;
  const d = itemDef(inst.item);
  // containers do not nest
  if (d.holds || inst.inside !== undefined) return false;
  const acc = h.accepts;
  for (let i = 0; i < acc.length; i++) {
    const a = acc[i];
    if (a === '*' || a === d.cat) return true;
    if (a.charCodeAt(0) === 35 && d.tags) {
      // "#tag": compared without cutting a string (this is asked while the player looks at things)
      for (let j = 0; j < d.tags.length; j++) if (a.length === d.tags[j].length + 1 && a.endsWith(d.tags[j])) return true;
    }
  }
  return false;
}

/** the weight of what is in it (kg) */
export function insideMass(box: ItemInstance): number {
  let m = 0;
  if (box.inside) for (let i = 0; i < box.inside.length; i++) m += itemMass(box.inside[i]);
  return m;
}

/**
 * How many of `inst` the box would take now (0 ... its count): by its kind, by the weight the box bears, by
 * room on the stacks inside that it would join and by free slots. Changes nothing and allocates nothing.
 */
export function roomInside(box: ItemInstance, inst: ItemInstance, nowS: number): number {
  const total = countOf(inst);
  if (total <= 0 || !accepts(box, inst)) return 0;
  const h = itemDef(box.item).holds!;
  let can = total;
  if (h.maxKg !== undefined) {
    const unit = itemMass(inst) / total;
    if (unit > 0) can = Math.min(can, Math.floor((h.maxKg - insideMass(box)) / unit + 1e-9));
    if (can <= 0) return 0;
  }
  const list = box.inside;
  const used = list ? list.length : 0;
  if (used < h.slots) return can;
  // no free slot: only what fits onto stacks it would join (as if it were at the box's rate already)
  let room = 0;
  for (let i = 0; i < used && room < can; i++) {
    const s = list![i];
    if (stacksInside(s, inst, nowS)) room += Math.max(0, stackMax(s.item) - countOf(s));
  }
  return Math.min(can, room);
}

/** canStack for a thing about to join a stack inside a box: its own rate is not compared, since it takes the box's as it goes in */
function stacksInside(s: ItemInstance, inst: ItemInstance, nowS: number): boolean {
  return sameSort(s, inst) && freshClose(s, inst, nowS);
}

/**
 * Put a thing into a box: onto the stacks inside that it joins first, then into a free slot. Returns how many
 * are left outside: 0 when it is all in (then either `inst` itself is in box.inside, or it was used up onto
 * stacks and its count reads 0: drop it either way); otherwise `inst` stays with that count. What goes in
 * goes off at the box's rate from now.
 */
export function putInside(box: ItemInstance, inst: ItemInstance, nowS: number): number {
  const total = countOf(inst);
  let can = roomInside(box, inst, nowS);
  if (can <= 0) return total;
  const h = itemDef(box.item).holds!;
  const k = h.decay ?? 1;
  const list = (box.inside ??= []);
  const out = inst.fk ?? 1;
  setFreshRate(inst, nowS, k);
  let left = total;
  for (let i = 0; i < list.length && can > 0 && left > 0; i++) {
    const s = list[i];
    if (!stacksInside(s, inst, nowS)) continue;
    const m = Math.min(stackMax(s.item) - countOf(s), can, left);
    if (m <= 0) continue;
    mergeSome(s, inst, m, nowS);
    left -= m;
    can -= m;
  }
  if (left > 0 && can > 0 && list.length < h.slots) {
    if (can >= left) {
      list.push(inst);
      return 0;
    }
    const part = splitStack(inst, can);
    if (part) {
      list.push(part);
      left -= can;
    }
  }
  if (!list.length) delete box.inside;
  // what stays outside goes off as it did
  if (left > 0) setFreshRate(inst, nowS, out);
  return left;
}

/** take the i-th thing out of a box (or k off it, as a new stack); it goes off in the open air from now. null when there is no such thing. */
export function takeInside(box: ItemInstance, i: number, nowS: number, k?: number): ItemInstance | null {
  const list = box.inside;
  const s = list?.[i];
  if (!list || !s) return null;
  let out: ItemInstance;
  if (k !== undefined && k < countOf(s)) {
    const part = splitStack(s, k);
    if (!part) return null;
    out = part;
  } else {
    list.splice(i, 1);
    if (!list.length) delete box.inside;
    out = s;
  }
  setFreshRate(out, nowS, 1);
  return out;
}

// ------------------------------------------------------------------ identity and loading

/**
 * A string that is the same for two things that are the same thing in the same state, whatever their uids:
 * kind, count, level, colour, quality, state and what is inside (not freshness, which moves with time).
 */
export function itemSig(inst: ItemInstance): string {
  let s = inst.item;
  if (inst.n !== undefined) s += `*${inst.n}`;
  if (inst.litres !== undefined) s += `|l${inst.litres.toFixed(2)}`;
  if (inst.uses !== undefined) s += `|u${inst.uses.toFixed(2)}`;
  if (inst.tint !== undefined) s += `|t${inst.tint}`;
  if (inst.q !== undefined) s += `|q${inst.q}`;
  if (inst.state !== undefined) s += `|s${stableJson(inst.state)}`;
  if (inst.inside) s += `[${inst.inside.map(itemSig).join(',')}]`;
  return s;
}

/** what a tolerant load set aside: how many things (a stack counts its count) were of a kind the catalogue does not have */
export interface LoadLoss {
  unknown: number;
}

function lostCount(raw: Record<string, unknown>): number {
  const n = raw.n;
  let c = typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= MAX_COUNT ? n : 1;
  if (Array.isArray(raw.inside)) for (const x of raw.inside) if (x && typeof x === 'object') c += lostCount(x as Record<string, unknown>);
  return c;
}

/**
 * A thing read back from a save, made sound, in place. null when it is not a thing at all, or when its kind
 * is not in the catalogue (a kind from a system this build does not have): then it and what was in it are
 * counted in `loss` and whoever was holding it drops it. A count, a freshness or a quality out of range is
 * brought back into range; fields its kind has no use for are removed; what is inside is cleaned the same way.
 */
export function cleanItem(raw: unknown, loss: LoadLoss): ItemInstance | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.uid !== 'string' || typeof r.item !== 'string') return null;
  const d = BY_ID.get(r.item);
  if (!d) {
    loss.unknown += lostCount(r);
    return null;
  }
  const inst = raw as ItemInstance;
  if (r.n !== undefined) {
    const n = r.n;
    if (typeof n !== 'number' || !Number.isInteger(n) || n <= 1) delete inst.n;
    else if (n > MAX_COUNT) inst.n = MAX_COUNT;
  }
  for (const k of ['litres', 'uses', 'tint'] as const) if (r[k] !== undefined && (typeof r[k] !== 'number' || !Number.isFinite(r[k] as number))) delete inst[k];
  if (r.opened !== undefined && typeof r.opened !== 'boolean') delete inst.opened;
  if (!d.perish) {
    delete inst.fresh;
    delete inst.t0;
    delete inst.fk;
  } else {
    if (typeof r.fresh !== 'number' || !Number.isFinite(r.fresh)) inst.fresh = 1;
    else inst.fresh = Math.min(1, Math.max(0, r.fresh));
    if (r.t0 !== undefined && (typeof r.t0 !== 'number' || !Number.isFinite(r.t0))) delete inst.t0;
    if (r.fk !== undefined && (typeof r.fk !== 'number' || !Number.isFinite(r.fk) || r.fk < 0 || r.fk === 1)) delete inst.fk;
  }
  if (r.q !== undefined && (typeof r.q !== 'number' || !Number.isInteger(r.q) || r.q < 1 || r.q > 5)) delete inst.q;
  if (r.state !== undefined && (r.state === null || typeof r.state !== 'object' || Array.isArray(r.state))) delete inst.state;
  if (r.inside !== undefined) {
    if (!d.holds || !Array.isArray(r.inside)) delete inst.inside;
    else {
      const kept: ItemInstance[] = [];
      for (const x of r.inside) {
        const c = cleanItem(x, loss);
        if (!c) continue;
        // containers do not nest: a box found inside a box stays, without what was in it
        if (c.inside) {
          for (const y of c.inside) loss.unknown += countOf(y);
          delete c.inside;
        }
        kept.push(c);
      }
      if (kept.length) inst.inside = kept;
      else delete inst.inside;
    }
  }
  return inst;
}
