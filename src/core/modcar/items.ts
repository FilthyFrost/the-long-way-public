/**
 * Things one carries that are neither a vehicle's part nor a tool for working on it (docs/MODCAR.md §13):
 * food, drinks, medicine, clothes, backpacks, head lamps, heavy tools, and the junk and boxes of old
 * components that go into the recycler for materials. The kinds follow Arctic Drive's (its numbers were the
 * starting point; the names, the lines and the economy are ours). Pure data, no three, no DOM.
 *
 * Every thing has a grade (0-5 stars, as on the parts' cards), a weight, how it is carried, and what the
 * recycler gives for it; what it does when used is in its own field (eat, drink, heal, revive, wear, pack,
 * lamp, gear). Its model is public/models/modcar/items/<model>.glb (tools/blender/items/), painted with its
 * paint / paint2 (one model serves every colour of a jacket).
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

export interface ItemDef {
  readonly id: string;
  readonly cat: ItemCat;
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

/** every kind of thing, in the catalogue's order */
export const ITEMS: readonly ItemDef[] = ALL;

const BY_ID = new Map(ALL.map((d) => [d.id, d]));

export function itemDef(id: string): ItemDef {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`no item ${id}`);
  return d;
}

export function hasItem(id: string): boolean {
  return BY_ID.has(id);
}

export function itemsOf(cat: ItemCat): ItemDef[] {
  return ALL.filter((d) => d.cat === cat);
}

let n = 0;

/** things read back from a save keep their ids: new ones are numbered past them */
export function reserveItemUids(uids: readonly string[]): void {
  for (const u of uids) {
    const k = /^i([0-9a-z]+)$/.exec(u);
    if (k) n = Math.max(n, parseInt(k[1], 36));
  }
}

/** one thing of a kind; a drink comes full unless it says, a hammer and a repair kit new */
export function newItem(id: string, o: Partial<ItemInstance> = {}): ItemInstance {
  const d = itemDef(id);
  n++;
  return {
    uid: `i${n.toString(36)}`,
    item: id,
    ...(d.drink ? { litres: d.drink.litres } : {}),
    ...(d.gear?.uses !== undefined ? { uses: d.gear.uses } : d.gear?.points !== undefined ? { uses: d.gear.points } : {}),
    ...o,
  };
}

/** what the recycler gives for one: its own salvage, and one organics more for every half litre of liquid in it */
export function salvageOf(inst: ItemInstance): Partial<Record<Material, number>> {
  const d = itemDef(inst.item);
  const out: Partial<Record<Material, number>> = { ...d.salvage };
  const liquid = Math.floor((inst.litres ?? 0) / 0.5);
  if (liquid > 0) out.organics = (out.organics ?? 0) + liquid;
  return out;
}

/** how heavy one is now (kg): with what is in it */
export function itemMass(inst: ItemInstance): number {
  return itemDef(inst.item).mass + (inst.litres ?? 0);
}

/** its name, with what is in it */
export function itemName(inst: ItemInstance, lang: 'zh' | 'en' = 'zh'): string {
  const d = itemDef(inst.item);
  if (d.drink) return `${d.name[lang]}（${(inst.litres ?? 0).toFixed(2)} L）`;
  return d.name[lang];
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
