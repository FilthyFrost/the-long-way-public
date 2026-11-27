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

/**
 * What the recycler turns things into: shared counters, not things one carries. Two of them (docs/V3/plan/finish.md
 * §六 1): scrap, which anything gives a little of, and components, which only what has a motor or a board in it gives
 * (an engine, a gearbox, a turbo, a radio, a battery, a television, a fridge, a power tool) — few of them, and what is
 * better to make asks for them. (Organics and chemicals, which there were, are gone: an old game's chemicals are its
 * components, one for one.)
 */
export type Material = 'scrap' | 'components';

export const MATERIALS: Record<Material, { name: Text; hex: number }> = {
  scrap: { name: { zh: '废料', en: 'Scrap' }, hex: 0xf2c14e },
  components: { name: { zh: '元件', en: 'Components' }, hex: 0x58b8e8 },
};

export const MATERIAL_IDS: readonly Material[] = ['scrap', 'components'];

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

/** what one drinks: water quenches, alcohol makes one drunk, the energy drink makes one quick, coffee warms and wakes one up (and quenches a little), milk feeds (and quenches a little: docs/ND/PLAN.md) */
export type DrinkLiquid = 'water' | 'alcohol' | 'energy' | 'coffee' | 'milk';

/** effects that last a while (the vitals: docs/MODCAR.md §13) */
export type EffectId = 'warm1' | 'warm2' | 'sick1' | 'sick2';

/** where a piece of clothing is worn */
export type WearSlot = 'hat' | 'jacket' | 'pants' | 'shoes' | 'gloves';

/** any category's id: one of the nine built in, or one a system registered (registerItemCat) */
export type ItemCatId = ItemCat | (string & {});

/** a system's own state on one thing (JSON only: rounds in a magazine, a blueprint's page): systems add their fields by declaration merging */
export interface ItemState {
  /**
   * a box that keeps things by power (a fridge, docs/V3/plan/rv.md R2) riding in a vehicle with no charge to draw on:
   * what is in it goes off as in the open air until there is again (boxDecay; the power module sets it)
   */
  unpowered?: boolean;
}

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
  /**
   * How one walks with it in the hands against empty hands, whatever its `carry` (docs/ND/PLAN.md: Nomad Drive's
   * furniture is carried as fast, its heaviest pieces a tenth slower and not run with); absent: as `carry` says
   * (a large thing slowly, not run or jumped with)
   */
  readonly carryWalk?: { readonly share: number; readonly run: boolean };
  /** what the recycler gives for it (one scrap at least: salvageOf) */
  readonly salvage: Partial<Record<Material, number>>;
  /** its model (default its id) and the colours its paint and paint_b materials take */
  readonly model: string;
  readonly paint: number;
  readonly paint2: number;
  /** its paint's gloss, as a share of a car's clear coat (absent: all of it — a tin, a bottle; a tomato some, a loaf of bread hardly any) */
  readonly matte?: number;
  /** eaten whole (food, pills): food points, health points, over `sec`; an effect after */
  readonly eat?: { food: number; hp: number; sec: number; effect?: EffectId; water?: number };
  /**
   * drunk from while the button is held: what it holds when full, at what rate (L/s); `empty`: it is made and
   * found empty, filled by the player (a coffee pot: docs/V3/nodes/M2-rv.md)
   */
  readonly drink?: { litres: number; liquid: DrinkLiquid; rate: number; empty?: boolean };
  /** medicine: health at once, or a warming; a side effect with its chance */
  /** medicine: life at once, a warming, health given back (cap); cure: being ill is over; treat: being hurt is over */
  readonly heal?: { hp: number; warm?: number; cap?: number; cure?: true; treat?: true };
  /** a first-aid box carried: used up when one would die, one gets up again with this much life */
  readonly revive?: { hp: number };
  readonly wear?: { slot: WearSlot; warmth: number };
  /** a backpack: hotbar slots it adds */
  readonly pack?: { slots: number };
  /** a head lamp: how far it reaches (m) */
  readonly lamp?: { range: number };
  /** heavy tools: a sledgehammer's blows, a repair kit's points and how fast it gives them */
  readonly gear?: { kind: 'hammer' | 'repair' | 'flare'; uses?: number; points?: number; rate?: number };
  /**
   * used up a portion at a time (a bag of ground coffee: a pot's worth each, docs/V3/nodes/M2-rv.md): how many
   * when new; the thing's `uses` counts them down, and the one who takes the last throws the bag away
   */
  readonly portions?: number;
  /** words other systems ask for (lower case, no spaces): a recipe wants any "meat", a basket accepts "#forage" */
  readonly tags?: readonly string[];
  /** how many make one stack (absent: 1, it does not stack). A stack is ONE instance with a count. */
  readonly stack?: number;
  /**
   * It holds other things: how many stacks, of which categories ("food"), tags ("#forage") or anything ("*"),
   * up to what weight; `decay` is how fast things in it go off against the open air (absent 1; a cool box
   * 0.25; 0 never). Containers do not nest. `shut`: it is opened to be put into (a drawer pulled out, its list): what
   * is picked up while it is carried never goes into it by itself, as it does into a basket.
   */
  readonly holds?: { readonly slots: number; readonly accepts: readonly string[]; readonly maxKg?: number; readonly decay?: number; readonly shut?: boolean };
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

I('food_chips', 'food', '虾片', 'Prawn crackers', 1, 0.15, {}, '一袋虾片，嘎嘣脆，垫垫肚子。', { paint: 0xe07b39, paint2: 0xf0c23c, eat: { food: 20, hp: 2, sec: EAT } });
I('food_biscuits', 'food', '苏打饼干', 'Soda crackers', 1, 0.2, {}, '一包苏打饼干，干巴巴的，管饱。', { model: 'food_chips', paint: 0xe2cf98, paint2: 0x3e6ea8, eat: { food: 25, hp: 2, sec: EAT } });
I('food_chips_ginger', 'food', '姜汁虾片', 'Ginger prawn crackers', 3, 0.15, {}, '加了老姜的虾片，吃完从胃里暖到手指头。', { model: 'food_chips', paint: 0xb85c3e, paint2: 0xf0c23c, eat: { food: 20, hp: 2, sec: EAT, effect: 'warm1' } });
I('food_chips_ginger_xl', 'food', '姜汁虾片（大包）', 'Ginger prawn crackers, family bag', 4, 0.3, {}, '一大包姜汁虾片，够吃一路，暖得更久。', { paint: 0x9e3b2f, paint2: 0xf0c23c, eat: { food: 40, hp: 4, sec: EAT, effect: 'warm2' } });
I('food_licorice', 'food', '甘草糖', 'Liquorice twists', 2, 0.2, {}, '黑乎乎的甘草糖，嚼起来没完没了，挺顶饿。', { paint: 0x2f3236, paint2: 0xc8323a, eat: { food: 40, hp: 4, sec: EAT } });
I('food_nuggets', 'food', '冻鸡块', 'Frozen chicken nuggets', 2, 0.75, {}, '一盒冻鸡块，化开了也能吃，就是有点软。', { paint: 0xf0c23c, paint2: 0xc8323a, eat: { food: 40, hp: 4, sec: EAT } });
I('food_dumplings', 'food', '冻饺子', 'Frozen dumplings', 2, 0.75, {}, '一袋冻饺子，生啃也行，煮了更好。', { paint: 0x7fb3d5, paint2: 0xf4efe2, eat: { food: 40, hp: 4, sec: EAT } });
I('food_fish_can', 'food', '鲭鱼罐头', 'Tin of mackerel', 3, 0.5, {}, '一罐油浸鲭鱼，吃完能撑好久。', { paint: 0x3e8e87, paint2: 0xede3c8, eat: { food: 75, hp: 6, sec: EAT } });
I('food_dog_old', 'food', '过期狗粮', 'Out-of-date dog food', 0, 0.4, {}, '早就过期的狗粮。实在饿了也能吃，代价是拉肚子。', { paint: 0xb9915f, paint2: 0x9e3b2f, eat: { food: 20, hp: 0, sec: EAT, effect: 'sick1' } });
I('food_cat_old', 'food', '过期猫粮', 'Out-of-date cat food', 0, 0.5, {}, '一罐过期猫粮，闻着就不太对劲。', { model: 'food_dog_old', paint: 0xa99bc9, paint2: 0x6b4a73, eat: { food: 20, hp: 0, sec: EAT, effect: 'sick1' } });
I('food_nuts_old', 'food', '受潮的坚果', 'Damp nuts', 1, 0.35, {}, '一包受潮的坚果，管饱，但肚子会闹一阵。', { paint: 0x557a46, paint2: 0xd8c29a, eat: { food: 40, hp: 0, sec: EAT, effect: 'sick2' } });

// ------------------------------------------------------------------ drinks (held to the mouth while the button is held)

I('drink_soda', 'drink', '橘子汽水', 'Orange soda', 1, 0.05, {}, '一罐橘子汽水，气跑了一半，还是解渴。', { paint: 0xe07b39, paint2: 0xf4efe2, drink: { litres: 0.33, liquid: 'water', rate: 0.075 } });
I('drink_cola', 'drink', '山谷可乐', 'Valley cola', 2, 0.05, {}, '谷里自己的可乐，冰的时候最好喝。', { model: 'drink_soda', paint: 0x9e3b2f, paint2: 0xede3c8, drink: { litres: 0.33, liquid: 'water', rate: 0.075 } });
I('drink_water', 'drink', '大瓶矿泉水', 'Big bottle of water', 2, 0.2, {}, '两升矿泉水。喝完瓶子留着，还能接水。', { paint: 0x7fb3d5, paint2: 0xf7f7f2, drink: { litres: 2, liquid: 'water', rate: 0.3 } });
I('drink_beer', 'drink', '啤酒', 'Bottle of beer', 1, 0.35, {}, '一瓶啤酒。喝了浑身发热，开车就别想了。', { paint: 0x557a46, paint2: 0xf0c23c, drink: { litres: 0.55, liquid: 'alcohol', rate: 0.1 } });
I('drink_spirit', 'drink', '高粱烈酒', 'Sorghum spirit', 2, 0.5, {}, '一瓶高粱烈酒，一口下去冻都不怕了，路也看不清了。', { paint: 0xf4efe2, paint2: 0xc8323a, drink: { litres: 1, liquid: 'alcohol', rate: 0.1 } });
I('drink_energy', 'drink', '能量饮料', 'Energy drink', 3, 0.05, {}, '喝完心跳加速，跑起来飞快，就是不解渴。', { paint: 0x2e4a6b, paint2: 0xa9d3b5, drink: { litres: 0.55, liquid: 'energy', rate: 0.1 } });

// ------------------------------------------------------------------ medicine

// (five in all — docs/V3/plan/finish.md §三.3: a bandage, painkillers and a warming patch here; the stomach pills and
// the first-aid box are the ones on the road's shelves, src/core/v3/nd/items.ts. What a save holds of the eight
// others is read as the nearest of the five.)
I('med_bandage', 'med', '绷带', 'Bandage', 2, 0.1, {}, '一卷绷带：摔了撞了，包扎好就不瘸了。', { model: 'med_kit', paint: 0xf7f7f2, paint2: 0xc8323a, eat: { food: 0, hp: 0, sec: PILL }, heal: { hp: 25, treat: true } });
I('med_pain_2', 'med', '止痛片', 'Painkillers', 3, 0.1, {}, '一板止痛片，吃两粒，伤口就不那么疼了。', { model: 'med_pain', paint: 0xf7f7f2, paint2: 0xc8323a, eat: { food: 0, hp: 0, sec: PILL }, heal: { hp: 40, treat: true } });
I('med_warm_2', 'med', '暖身贴', 'Warming patch', 2, 0.1, {}, '撕开贴在身上，一会儿就暖过来了。', { model: 'med_warm', paint: 0xd4a53b, paint2: 0xede3c8, eat: { food: 0, hp: 0, sec: PILL }, heal: { hp: 0, warm: 5 } });

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
// (the old repair kits, repair_1..3, never mended anything: Nomad Drive's three one-use kits took their place —
// core/v3/nd/items.ts, where a save's old ones are read back as engine repair kits)
I('flare_gun', 'gear', '信号枪', 'Flare gun', 5, 1, { scrap: 35 }, '只有一发。打上天，会有人看见的。', { paint: 0xe07b39, paint2: 0x2f3236, gear: { kind: 'flare', uses: 1 } });

// ------------------------------------------------------------------ junk (for the recycler)

I('junk_sign', 'junk', '广告牌', 'Advertising board', 0, 1, { scrap: 2 }, '一块褪了色的汽水广告牌。', { paint: 0xe07b39, paint2: 0xf4efe2 });
I('junk_bucket', 'junk', '水桶', 'Bucket', 0, 1, { scrap: 2 }, '铁皮水桶，还没漏。', { paint: 0x6f7a82, paint2: 0x2f3236 });
I('junk_bucket_old', 'junk', '旧水桶', 'Old bucket', 0, 1, { scrap: 1 }, '桶底锈穿了，装不了水了。', { model: 'junk_bucket', paint: 0x9e3b2f, paint2: 0x2f3236 });
I('junk_bucket_paint', 'junk', '结垢的漆桶', 'Crusty paint bucket', 0, 1, { scrap: 1 }, '一桶干透了的油漆，硬得像石头。', { paint: 0xede3c8, paint2: 0x3e8e87 });
I('junk_camera', 'junk', '三脚架相机', 'Camera on a tripod', 0, 5, { scrap: 8, components: 2 }, '老式相机架在三脚架上，零件不少。', { paint: 0x2f3236, paint2: 0x6f7a82 });
I('junk_candle', 'junk', '大烛台', 'Big candlestick', 0, 5, { scrap: 3 }, '沉甸甸的铜烛台。', { paint: 0xd4a53b, paint2: 0x5a3a2b });
I('junk_chair', 'junk', '椅子', 'Chair', 0, 3, { scrap: 5 }, '一把铁腿椅子。', { paint: 0x3e8e87, paint2: 0x6f7a82 });
I('junk_chair_wood', 'junk', '木椅', 'Wooden chair', 0, 5, { scrap: 3 }, '一把老木椅，晃晃悠悠的。', { paint: 0xb9915f, paint2: 0x5a3a2b });
I('junk_chair_soft', 'junk', '软椅', 'Cushioned chair', 0, 6, { scrap: 5 }, '坐垫塌了一半的软椅。', { paint: 0x6e2534, paint2: 0x5a3a2b });
I('junk_chair_fold', 'junk', '折叠椅', 'Folding chair', 0, 3, { scrap: 4 }, '野餐用的折叠椅。', { paint: 0x557a46, paint2: 0x6f7a82 });
I('junk_chair_office', 'junk', '办公椅', 'Office chair', 0, 6, { scrap: 6 }, '带轮子的办公椅，一个轮子不转了。', { paint: 0x2f3236, paint2: 0x6f7a82 });
I('junk_stool', 'junk', '铁凳', 'Metal stool', 0, 5, { scrap: 4 }, '车间里的铁凳子。', { paint: 0x6f7a82, paint2: 0x2f3236 });
I('junk_stool_tall', 'junk', '高脚凳', 'Tall stool', 0, 1.5, { scrap: 3 }, '吧台边的高脚凳。', { paint: 0xc8323a, paint2: 0x6f7a82 });
I('junk_sunchair', 'junk', '躺椅', 'Sun lounger', 0, 3.3, { scrap: 2 }, '晒太阳用的帆布躺椅。', { carry: 'large', paint: 0xf0c23c, paint2: 0xb9915f });
I('junk_clockradio', 'junk', '收音闹钟', 'Clock radio', 0, 0.6, { scrap: 2, components: 1 }, '到点就响的收音机，早就不响了。', { paint: 0xede3c8, paint2: 0x2f3236 });
I('junk_hanger', 'junk', '衣帽架', 'Coat stand', 0, 2.5, { scrap: 4 }, '立式的衣帽架。', { carry: 'large', paint: 0x5a3a2b, paint2: 0x6f7a82 });
I('junk_fax', 'junk', '传真机', 'Fax machine', 0, 3, { scrap: 8, components: 3 }, '一台老传真机，里面零件不少。', { paint: 0xede3c8, paint2: 0x6f7a82 });
I('junk_box_food', 'junk', '纸箱', 'Cardboard box', 0, 1, { scrap: 2 }, '一个空纸箱。', { paint: 0xb9915f, paint2: 0x5a3a2b });
I('junk_lamp', 'junk', '台灯', 'Desk lamp', 0, 1, { scrap: 3 }, '弯脖子的台灯。', { paint: 0x3e8e87, paint2: 0x6f7a82 });
I('junk_barrel', 'junk', '铁皮桶', 'Steel drum', 0, 30, { scrap: 16 }, '空的大铁皮桶，沉得很。', { paint: 0x2e4a6b, paint2: 0x6f7a82 });
I('junk_mop', 'junk', '拖把', 'Mop', 0, 1.5, { scrap: 1 }, '一把拖把。', { carry: 'medium', paint: 0x7fb3d5, paint2: 0xede3c8 });
I('junk_mug', 'junk', '马克杯', 'Mug', 0, 0.3, { scrap: 1 }, '缺了个口的马克杯。', { paint: 0xc8323a, paint2: 0xf4efe2 });
I('junk_ball', 'junk', '旧皮球', 'Old ball', 0, 0.5, {}, '瘪了的皮球。', { paint: 0xe07b39, paint2: 0xf4efe2 });
I('junk_pillow', 'junk', '枕头', 'Pillow', 0, 1, { scrap: 1 }, '软乎乎的枕头。抱着睡一觉多好。', { paint: 0xf4efe2, paint2: 0x7fb3d5 });
I('junk_pillow_s', 'junk', '小靠垫', 'Cushion', 0, 0.5, { scrap: 1 }, '沙发上的小靠垫。', { paint: 0xe8a3a8, paint2: 0xf4efe2 });
I('junk_crate_plastic', 'junk', '塑料筐', 'Plastic crate', 0, 1, { scrap: 2 }, '红色的塑料周转筐。', { paint: 0xc8323a, paint2: 0x2f3236 });
I('junk_plate', 'junk', '盘子', 'Plate', 0, 0.5, { scrap: 1 }, '一个搪瓷盘子。', { paint: 0xf4efe2, paint2: 0x2e4a6b });
I('junk_transceiver', 'junk', '电台', 'Radio transceiver', 0, 14, { scrap: 12, components: 4 }, '一台老式无线电台，拆开全是好元件。', { paint: 0x7a7f45, paint2: 0x2f3236 });
I('junk_record', 'junk', '唱片机', 'Record player', 0, 4, { scrap: 6, components: 1 }, '手提箱式的唱片机。', { paint: 0xb85c3e, paint2: 0x2f3236 });
I('junk_vinyl', 'junk', '黑胶唱片', 'Vinyl record', 0, 0.3, { scrap: 1 }, '一张黑胶唱片，封套都褪色了。', { paint: 0xa99bc9, paint2: 0x2f3236 });
I('junk_cage', 'junk', '小笼子', 'Small cage', 0, 2, { scrap: 3 }, '养鸟用的铁丝笼子。', { paint: 0xd8c29a, paint2: 0x6f7a82 });
I('junk_bin', 'junk', '垃圾桶', 'Waste bin', 0, 2.2, { scrap: 3 }, '带脚踏的铁皮垃圾桶。', { paint: 0x557a46, paint2: 0x6f7a82 });
I('junk_solar_lamp', 'junk', '太阳能灯', 'Solar lamp', 0, 2, { scrap: 4, components: 1 }, '插在院子里的太阳能灯，白天充电晚上亮。', { paint: 0x2f3236, paint2: 0xf0c23c });
I('junk_rod', 'junk', '断鱼竿', 'Broken fishing rod', 0, 1, { scrap: 4 }, '断成两截的鱼竿，线轮还能用。', { carry: 'medium', paint: 0x2e4a6b, paint2: 0x6f7a82 });
I('junk_sign_wet', 'junk', '小心地滑牌', 'Wet floor sign', 0, 1, { scrap: 1 }, '黄色的小心地滑牌。', { paint: 0xf0c23c, paint2: 0x2f3236 });
I('junk_tv', 'junk', '旧电视', 'Old television', 0, 6, { scrap: 10, components: 3 }, '大屁股电视机，砸了可惜，回收正好。', { paint: 0x5a3a2b, paint2: 0x2f3236 });
// (the workshop's at the start, docs/V3/plan/growth.md §一 1: no plug, a cracked screen — scrap, not a set to switch on)
I('junk_tv_dead', 'junk', '坏电视', 'Dead television', 0, 6, { scrap: 10, components: 3 }, '屏幕裂了，插头也没了，只能回收。', { model: 'junk_tv', paint: 0x4a3326, paint2: 0x2f3236 });
I('junk_cone', 'junk', '路锥', 'Traffic cone', 0, 1, { scrap: 1 }, '一个路锥。', { paint: 0xe07b39, paint2: 0xf4efe2 });
I('junk_bag', 'junk', '垃圾袋', 'Bin bag', 0, 6, {}, '鼓鼓的一袋垃圾，最好别打开。', { paint: 0x2f3236, paint2: 0x6f7a82 });
I('junk_bag_s', 'junk', '小垃圾袋', 'Small bin bag', 0, 1, {}, '一小袋垃圾。', { model: 'junk_bag', paint: 0x557a46, paint2: 0x6f7a82 });
I('junk_trolley', 'junk', '手推车', 'Hand truck', 0, 5, { scrap: 4 }, '搬货用的两轮手推车。', { carry: 'large', paint: 0xc8323a, paint2: 0x2f3236 });
I('junk_jack', 'junk', '卧式千斤顶', 'Trolley jack', 0, 12, { scrap: 6 }, '车间里的卧式千斤顶，液压早漏光了。', { paint: 0xc8323a, paint2: 0x6f7a82 });
I('junk_trumpet', 'junk', '小号', 'Trumpet', 0, 1.2, { scrap: 2 }, '一把凹了的小号，还吹得响。', { paint: 0xd4a53b, paint2: 0x5a3a2b });
I('junk_food_bucket', 'junk', '粮食桶', 'Feed bucket', 0, 8, {}, '一桶喂牲口的粮食，早就不能吃了，桶还能回收。', { paint: 0xede3c8, paint2: 0x557a46 });

// ------------------------------------------------------------------ boxes of components (the recycler's best friends)

I('crate_parts', 'crate', '旧零件箱', 'Box of old components', 0, 2, { scrap: 20 }, '一箱拆下来的螺丝、垫片和小零件。', { paint: 0xb9915f, paint2: 0x6f7a82 });
I('crate_parts_s', 'crate', '小零件盒', 'Small box of components', 0, 4, { scrap: 10 }, '一盒小零件，回收出十废料。', { model: 'crate_parts', paint: 0xd8c29a, paint2: 0x6f7a82 });
I('crate_parts_heavy', 'crate', '重零件箱', 'Heavy box of components', 0, 12, { scrap: 24 }, '一大箱铁疙瘩，搬起来腰都直不起来。', { paint: 0x9e7a4f, paint2: 0x6f7a82, carry: 'medium' });
I('crate_junk', 'crate', '一箱破烂', 'Box of junk', 0, 3.5, { scrap: 8 }, '什么都有一点的破烂箱子。', { paint: 0xb9915f, paint2: 0x2f3236 });
I('crate_chem', 'crate', '元件箱', 'Box of electrical components', 0, 2.4, { components: 12 }, '一箱旧电路板、开关和小电机，回收出十二个元件。', { paint: 0xede3c8, paint2: 0x58b8e8 });
I('crate_lye', 'crate', '重元件箱', 'Heavy box of electrical components', 0, 10, { components: 10 }, '一箱拆下来的电机和变压器，沉，回收出十个元件。', { paint: 0xf4efe2, paint2: 0x7a7f45 });
I('crate_supps', 'crate', '营养品箱', 'Box of food supplements', 0, 5, {}, '一箱过期的营养品，瓶瓶罐罐还能回收一点。', { paint: 0xa9d3b5, paint2: 0xf4efe2 });

/** every kind of thing, in the catalogue's order: the kinds above, then what systems registered, in the order they did */
export const ITEMS: readonly ItemDef[] = ALL;

/**
 * The kinds above alone, as they were before any system registered anything. The loot tables that existed
 * before V3 pick by category out of THIS list (src/core/modcar/loot.ts, wrecks.ts), so a kind registered later,
 * even into one of the nine old categories, never enters what a seed's containers and wrecks hold.
 */
export const BASE_ITEMS: readonly ItemDef[] = Object.freeze(ALL.slice());

const BY_ID = new Map(ALL.map((d) => [d.id, d]));

/**
 * Each kind's weight (kg, empty), beside the catalogue: a weight is asked every frame, and a number looked up
 * here comes back as it is, where one read out of a kind's own record — the records are of many shapes — is
 * handed back by the engine as a new number on the heap every time.
 */
const KIND_KG = new Map(ALL.map((d) => [d.id, d.mass]));

export function itemDef(id: string): ItemDef {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`no item ${id}`);
  return d;
}

export function hasItem(id: string): boolean {
  return BY_ID.has(id);
}

/**
 * Kinds that are no more (docs/V3/plan/growth.md §三: the doubles of the two versions sorted), and what a saved one
 * becomes as it is read: another kind (its state as it was), or what a function makes of the record in place.
 */
const RETIRED = new Map<string, (r: Record<string, unknown>) => void>();

export function retireItem(id: string, into: string | ((r: Record<string, unknown>) => void)): void {
  RETIRED.set(id, typeof into === 'string' ? (r) => void (r.item = into) : into);
}

/**
 * The systems' word on kinds they retired by a rule of their own (a family of ids: the fishing's old rods and baits):
 * for an id the catalogue has no more, the kind it is now (null: not theirs)
 */
const RETIRED_BY: ((id: string) => string | null)[] = [];

/**
 * A system's kinds retired, merged into others (as its module is loaded, before a save is read): a thing of one in a
 * save is read back as the kind `now` says, its count and state kept, in place of being left out.
 */
export function registerRetiredItems(now: (id: string) => string | null): void {
  RETIRED_BY.push(now);
}

/**
 * The kind a thing of a save named so is read back as: its own, or the one a system's rule merged it into; null: none
 * there is by a rule (a kind retired one by one, retireItem, is made over as it is read: retiredKind knows both)
 */
export function itemIdNow(id: string): string | null {
  if (BY_ID.has(id)) return id;
  for (const fn of RETIRED_BY) {
    const to = fn(id);
    if (to !== null && BY_ID.has(to)) return to;
  }
  return null;
}

/** a kind there is not any more, that a save is read into another (not lost) */
export function retiredKind(id: string): boolean {
  return !BY_ID.has(id) && (RETIRED.has(id) || itemIdNow(id) !== null);
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

const ID_RE = /^[a-z][a-z0-9_]*$/;
const TAG_RE = /^[a-z][a-z0-9_]*$/;

/** a name in both languages */
function isText(t: unknown): t is Text {
  const x = t as Partial<Text> | null | undefined;
  return !!x && typeof x === 'object' && typeof x.zh === 'string' && typeof x.en === 'string' && !!x.zh && !!x.en;
}

/** a new category of things (a system does this once, as its module is loaded); an id taken already, a name that is not one in both languages or an order that is no number throws, and nothing is registered */
export function registerItemCat(def: { readonly id: string; readonly name: Text; readonly order?: number }): void {
  if (typeof def?.id !== 'string' || !ID_RE.test(def.id)) throw new Error(`item category "${String(def?.id)}": an id is lower-case letters, digits and _`);
  if (CAT_BY_ID.has(def.id)) throw new Error(`item category ${def.id} is registered already`);
  if (!isText(def.name)) throw new Error(`item category ${def.id}: needs a name in both languages`);
  if (def.order !== undefined && (typeof def.order !== 'number' || !Number.isFinite(def.order))) throw new Error(`item category ${def.id}: its order is a number`);
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

const CARRIES: readonly string[] = ['small', 'medium', 'large'];

/** a weight, a rate, a time: a number that is one, from nothing up */
function isAmount(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

/** a colour as the paints are written: 0xrrggbb */
function isHex(v: unknown): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffff;
}

/**
 * What is wrong with one row (nothing: an empty list). It is handed whatever a system wrote, so nothing in
 * it is taken on trust: a row that is no object, a list that is no list and a number that is none are each
 * named, never thrown on.
 */
function rowProblems(r: ItemRow, seen: ReadonlySet<string>): string[] {
  if (!r || typeof r !== 'object') return ['an item is an object with an id, a category, a name, stars and a mass'];
  const bad: string[] = [];
  const say = (m: string): void => void bad.push(`item ${String(r.id)}: ${m}`);
  if (typeof r.id !== 'string' || !ID_RE.test(r.id)) say('an id is lower-case letters, digits and _');
  else if (BY_ID.has(r.id)) say('is registered already');
  else if (seen.has(r.id)) say('is in this list twice');
  if (typeof r.cat !== 'string' || !CAT_BY_ID.has(r.cat)) say(`no category ${String(r.cat)} (register it first)`);
  if (!isText(r.name)) say('needs a name in both languages');
  if (!Number.isInteger(r.stars) || r.stars < 0 || r.stars > 5) say('stars are 0 to 5');
  if (!isAmount(r.mass)) say('mass is a weight in kg');
  // what the catalogue would otherwise work out: said, it has to be right
  if (r.carry !== undefined && !CARRIES.includes(r.carry)) say('carry is small, medium or large');
  const cw = r.carryWalk as ItemDef['carryWalk'] | null;
  if (cw !== undefined && !(cw && typeof cw === 'object' && isAmount(cw.share) && cw.share > 0 && cw.share <= 1 && typeof cw.run === 'boolean')) say('carryWalk is a share of the walking speed (above 0, up to 1) and whether one may run');
  if (r.model !== undefined && (typeof r.model !== 'string' || !r.model)) say('model is the name of a model');
  if (r.blurb !== undefined && typeof r.blurb !== 'string') say('blurb is a line of text');
  if ((r.paint !== undefined && !isHex(r.paint)) || (r.paint2 !== undefined && !isHex(r.paint2))) say('paint and paint2 are colours (0xrrggbb)');
  if (r.matte !== undefined && !(isAmount(r.matte) && r.matte <= 1)) say('matte is a share of a full gloss, 0 to 1');
  if (r.salvage !== undefined) {
    if (!r.salvage || typeof r.salvage !== 'object' || Array.isArray(r.salvage)) say('salvage says how much of which material');
    else for (const [m, v] of Object.entries(r.salvage)) if (!isAmount(v)) say(`salvage.${m} is an amount from 0`);
  }
  if (r.tags !== undefined) {
    if (!Array.isArray(r.tags)) say('tags is a list of words');
    else for (const t of r.tags as readonly unknown[]) if (typeof t !== 'string' || !TAG_RE.test(t)) say(`tag "${String(t)}": lower-case letters, digits and _`);
  }
  if (r.stack !== undefined) {
    if (!Number.isInteger(r.stack) || r.stack < 1 || r.stack > MAX_COUNT) say(`stack is a whole number from 1 to ${MAX_COUNT}`);
    // a thing with a level of its own (litres, blows left) or with things in it is one of a kind
    else if (r.stack > 1 && (r.drink || r.gear?.uses !== undefined || r.gear?.points !== undefined || r.portions !== undefined || r.holds || r.pack)) say('a thing that is drunk from, wears out, is used a portion at a time, holds things or is a backpack does not stack');
  }
  if (r.portions !== undefined && !(Number.isInteger(r.portions) && r.portions >= 1)) say('portions is a whole number from 1');
  const h = r.holds as ItemDef['holds'] | null;
  if (h !== undefined) {
    if (!h || typeof h !== 'object') say('holds says how many slots and what it accepts');
    else {
      if (!Number.isInteger(h.slots) || h.slots < 1) say('holds.slots is a whole number from 1');
      if (!Array.isArray(h.accepts) || !h.accepts.length) say('holds.accepts is a list of category ids, "#tag" or "*", and not empty');
      else for (const a of h.accepts as readonly unknown[]) if (typeof a !== 'string' || (a !== '*' && !(a.startsWith('#') ? TAG_RE.test(a.slice(1)) : ID_RE.test(a)))) say(`holds.accepts "${String(a)}": a category id, "#tag" or "*"`);
      if (h.maxKg !== undefined && !(isAmount(h.maxKg) && h.maxKg > 0)) say('holds.maxKg is a weight in kg');
      if (h.decay !== undefined && !isAmount(h.decay)) say('holds.decay is a rate from 0');
      if (h.shut !== undefined && typeof h.shut !== 'boolean') say('holds.shut is true or false');
      // (what would become of the things in it when it turned into something that holds nothing?)
      if (r.perish !== undefined) say('a thing that holds things does not go off');
    }
  }
  const p = r.perish as ItemDef['perish'] | null;
  if (p !== undefined) {
    if (!p || typeof p !== 'object' || !(isAmount(p.hours) && p.hours > 0)) say('perish.hours is a time in game hours');
    else if (p.into !== undefined) {
      if (typeof p.into !== 'string' || !ID_RE.test(p.into)) say('perish.into is the id of a kind');
      else if (p.into === r.id) say('turns into itself');
    }
  }
  return bad;
}

/**
 * Add kinds to the catalogue (a system does this once, as its module is loaded, before a save is read).
 * All of them or none: one bad row (an id taken, a category not registered, a stack of things that cannot
 * stack) throws with every problem found and nothing is added.
 */
export function registerItems(rows: readonly ItemRow[]): void {
  if (!Array.isArray(rows)) throw new Error('registerItems takes a list of items');
  const bad: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    bad.push(...rowProblems(r, seen));
    if (r && typeof r.id === 'string') seen.add(r.id);
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
    KIND_KG.set(d.id, d.mass);
  }
}

/**
 * What is wrong with the catalogue as a whole, for the tests of whoever registers into it (nothing: an empty
 * list): a kind that turns into one that does not exist, or into one that itself goes off into a third
 * (one step only), a container no registered kind fits into.
 */
export function itemCatalogueProblems(): string[] {
  const bad: string[] = [];
  // (what may go into a container at all: containers do not nest)
  const loose = ALL.filter((k) => !k.holds);
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
      const tag = a.startsWith('#') ? a.slice(1) : null;
      if (!loose.some((k) => (tag !== null ? hasTag(k, tag) : k.cat === a))) bad.push(`item ${d.id}: accepts ${a}, which nothing is`);
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

/** a uid's number past this is none of ours: a counter of whole numbers could never get there, and counted on from there it would no longer move */
const UID_MAX = 2 ** 50;

/** things read back from a save keep their ids: new ones are numbered past them (pass the uids of things inside things too: forEachItem) */
export function reserveItemUids(uids: readonly string[]): void {
  for (const u of uids) {
    if (typeof u !== 'string') continue;
    const k = /^i([0-9a-z]+)$/.exec(u);
    if (!k) continue;
    const v = parseInt(k[1], 36);
    if (v < UID_MAX && v > uidN) uidN = v;
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
    ...(d.drink ? { litres: d.drink.empty ? 0 : d.drink.litres } : {}),
    ...(d.gear?.uses !== undefined ? { uses: d.gear.uses } : d.gear?.points !== undefined ? { uses: d.gear.points } : d.portions !== undefined ? { uses: d.portions } : {}),
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

/**
 * What the recycler gives for it: its kind's salvage — one scrap at the least, whatever it is (anything gives a
 * little) — a stack that for each, a container also what is in it. A liquid in it gives nothing more.
 */
export function salvageOf(inst: ItemInstance): Partial<Record<Material, number>> {
  const d = itemDef(inst.item);
  const n = inst.n ?? 1;
  const out: Partial<Record<Material, number>> = {};
  for (const m of MATERIAL_IDS) {
    const v = d.salvage[m];
    if (v) out[m] = v * n;
  }
  if (!out.scrap && !out.components) out.scrap = n;
  if (inst.inside) {
    for (const x of inst.inside) {
      const s = salvageOf(x);
      for (const m of MATERIAL_IDS) if (s[m]) out[m] = (out[m] ?? 0) + s[m]!;
    }
  }
  return out;
}

/**
 * Where weights are summed. A fraction handed back from one function to another is put on the heap, a slot of
 * this is not: so a box's weight is added up here, thing by thing, and a weight is asked every frame (the
 * prompt, the cargo's load) without leaving anything behind.
 */
const KG = new Float64Array(1);

/** the weight of a thing, with what is in it, added to KG[0] */
function addMass(inst: ItemInstance): void {
  const kg = KIND_KG.get(inst.item);
  if (kg === undefined) throw new Error(`no item ${inst.item}`);
  KG[0] += (kg + (inst.litres ?? 0)) * (inst.n ?? 1);
  const list = inst.inside;
  if (list) for (let i = 0; i < list.length; i++) addMass(list[i]);
}

/** how heavy it is now (kg): all of a stack, with what is in it */
export function itemMass(inst: ItemInstance): number {
  KG[0] = 0;
  addMass(inst);
  return KG[0];
}

/**
 * A veil over kinds the player does not know yet (foraging: a mushroom never met is "an unknown mushroom" in
 * every list, prompt and card until it is identified). The system that keeps the player's knowledge sets one
 * function: it answers with the name a kind goes by while unknown, or null when the kind is known (or is none
 * of its business). The thing itself is always its true kind; only what it is called changes.
 */
let veil: ((id: string) => Text | null) | null = null;

/** set (or with null, lift) the veil; one system owns it */
export function setItemVeil(fn: ((id: string) => Text | null) | null): void {
  veil = fn;
}

/** the name a kind goes by while the player does not know it; null: it is known */
export function itemVeil(id: string): Text | null {
  return veil ? veil(id) : null;
}

/** its name, with what is in it and how many there are (a kind under the veil by the veil's name) */
export function itemName(inst: ItemInstance, lang: 'zh' | 'en' = 'zh'): string {
  const d = itemDef(inst.item);
  const v = veil ? veil(inst.item) : null;
  if (v) {
    const k = inst.n ?? 1;
    return k > 1 ? `${v[lang]} ×${k}` : v[lang];
  }
  if (d.drink) return `${d.name[lang]}（${(inst.litres ?? 0).toFixed(2)} L）`;
  const n = inst.n ?? 1;
  return n > 1 ? `${d.name[lang]} ×${n}` : d.name[lang];
}

/** the colours its model is painted, and how much of a full gloss its paint has (absent: all) */
export function itemPaint(inst: ItemInstance): { paint: number; paint2: number; matte?: number } {
  const d = itemDef(inst.item);
  return d.matte === undefined ? { paint: inst.tint ?? d.paint, paint2: d.paint2 } : { paint: inst.tint ?? d.paint, paint2: d.paint2, matte: d.matte };
}

/** the models the catalogue asks for (one file serves every kind that names it) */
export function itemModels(): string[] {
  return [...new Set(ALL.map((d) => d.model))];
}

/**
 * The model one thing is drawn with: its kind's (ItemDef.model), unless a system says this thing is drawn with
 * another of its own (docs/V3/plan/fishing.md: a golden carp is the carp drawn in gold). A system sets one function
 * for its kinds (registerItemModelOf) and answers null for any other thing. Asked when a thing is put down, taken
 * into the hands or pictured on the hotbar, never per frame.
 */
export function itemModelOf(inst: ItemInstance): string {
  for (let i = 0; i < MODEL_OF.length; i++) {
    const m = MODEL_OF[i](inst);
    if (m) return m;
  }
  return itemDef(inst.item).model;
}

const MODEL_OF: ((inst: ItemInstance) => string | null)[] = [];

/** a system's say in which model a thing of its kinds is drawn with (itemModelOf); called once as its module loads */
export function registerItemModelOf(fn: (inst: ItemInstance) => string | null): void {
  if (!MODEL_OF.includes(fn)) MODEL_OF.push(fn);
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

/**
 * Where the questions asked every frame keep their fractions: [0] the time a question is asked at, [1] and
 * [2] the freshness of the two things it compares. (As KG above: a fraction handed from one function to
 * another may be put on the heap; canStack and roomInside ask about every stack in a box, every frame.)
 */
const FR = new Float64Array(3);

/** how fresh a thing that has a freshness is at the time FR[0]: into FR[slot] */
function freshInto(inst: ItemInstance, slot: number): void {
  let f = inst.fresh as number;
  // (never more than fresh, whatever was written into it)
  if (!(f < 1)) f = 1;
  const t0 = inst.t0;
  if (t0 !== undefined) {
    const dt = FR[0] - t0;
    if (dt > 0) {
      const p = itemDef(inst.item).perish;
      if (p) f -= (dt / (p.hours * HOUR_S)) * (inst.fk ?? 1);
    }
  }
  FR[slot] = f > 0 ? f : 0;
}

/**
 * How fresh it is now, 1 ... 0 (1 for a thing that does not go off). A function of the time alone: read once
 * or brought up to date any number of times on the way (rebaseFresh), it says the same.
 */
export function freshNow(inst: ItemInstance, nowS: number): number {
  if (inst.fresh === undefined) return 1;
  FR[0] = nowS;
  freshInto(inst, 1);
  return FR[1];
}

/** fresh (0), still good (1), going off (2), turned (3): the card's word, and what a recipe may ask */
export type FreshStage = 0 | 1 | 2 | 3;

export function freshStage(f: number): FreshStage {
  return f > 0.6 ? 0 : f > 0.3 ? 1 : f > 0 ? 2 : 3;
}

/**
 * Start a thing's freshness counting if it has not started (a thing that goes off, made without a time); with
 * what is in it, which starts at the rate of what holds it unless it has a rate of its own already (a basket
 * made with berries in it, never put in by putInside).
 */
export function stampFresh(inst: ItemInstance, nowS: number): void {
  const d = itemDef(inst.item);
  if (d.perish) {
    if (inst.fresh === undefined) inst.fresh = 1;
    if (inst.t0 === undefined) inst.t0 = nowS;
  }
  const list = inst.inside;
  if (!list) return;
  const k = boxDecay(inst);
  for (let i = 0; i < list.length; i++) {
    const x = list[i];
    if (k !== 1 && x.t0 === undefined && x.fk === undefined && itemDef(x.item).perish) x.fk = k;
    stampFresh(x, nowS);
  }
}

/**
 * Bring its freshness up to now (it goes off from here): before its rate changes, before two stacks become
 * one. A thing that had not started starts. A time that is not after the one it was last brought up to
 * changes nothing: the clock never runs backwards, and a time moved back would age the thing twice. A thing
 * that has turned is written as of the moment it ran out, and stays so however often this is called.
 */
export function rebaseFresh(inst: ItemInstance, nowS: number): void {
  if (inst.fresh === undefined) return;
  const t0 = inst.t0;
  if (t0 !== undefined && !(nowS > t0)) return;
  const f = freshNow(inst, nowS);
  if (f > 0 || t0 === undefined) {
    inst.fresh = f;
    inst.t0 = nowS;
    return;
  }
  // turned: it stays written as of the moment it ran out, which is when what it becomes began (settleItem)
  const p = itemDef(inst.item).perish;
  inst.t0 = p ? ranOutAt(inst, p.hours) : t0;
  inst.fresh = 0;
}

/**
 * The moment the freshness of a thing that has turned ran out (the time it is written as of, when it was
 * turned by then already). Only for a thing that has started and has turned.
 */
function ranOutAt(inst: ItemInstance, hours: number): number {
  const t0 = inst.t0 as number;
  const f0 = (inst.fresh as number) < 1 ? (inst.fresh as number) : 1;
  const k = inst.fk ?? 1;
  return f0 > 0 && k > 0 ? t0 + (f0 * hours * HOUR_S) / k : t0;
}

/**
 * How fast what is in a box goes off: what holds it says (ItemDef.holds.decay); the open air's 1 for a box that keeps
 * things by power and has none now (ItemState.unpowered: a fridge in a vehicle whose batteries are flat)
 */
export function boxDecay(box: ItemInstance): number {
  if (box.state?.unpowered) return 1;
  return itemDef(box.item).holds?.decay ?? 1;
}

/**
 * A box that keeps things by power has it again, or has lost it (off): what is in it goes off at the box's rate from
 * now. True when it changed.
 */
export function setUnpowered(box: ItemInstance, nowS: number, off: boolean): boolean {
  if (!!box.state?.unpowered === off) return false;
  if (off) (box.state ??= {}).unpowered = true;
  else if (box.state) {
    delete box.state.unpowered;
    if (Object.keys(box.state).length === 0) delete box.state;
  }
  const k = boxDecay(box);
  for (const x of box.inside ?? []) setFreshRate(x, nowS, k);
  return true;
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
 * card, eaten. A kind without perish.into stays what it is, turned.
 *
 * It makes no difference when it is called: what the thing has become is counted from the moment the first
 * ran out, and where that kind goes off in its turn it does so from then, at the rate of where it lies now
 * (a thing moved to another rate between turning and being looked at is counted at the new rate for all of
 * that stretch: the one place where the order of things shows). Not called for a save: writing a save
 * changes nothing, and what is read back settles the same way later.
 */
export function settleItem(inst: ItemInstance, nowS: number): boolean {
  if (inst.fresh === undefined || freshNow(inst, nowS) > 0) return false;
  const p = itemDef(inst.item).perish;
  const into = p?.into;
  if (!p || into === undefined) return false;
  const d = BY_ID.get(into);
  if (!d) return false;
  // when it turned: the moment its freshness ran out, not the moment somebody looked (what it has become
  // goes off from then, so it is as old whenever it is settled); a thing that never started has no moment
  const rate = inst.fk;
  const at = inst.t0 === undefined ? undefined : ranOutAt(inst, p.hours);
  inst.item = into;
  delete inst.fresh;
  delete inst.t0;
  delete inst.fk;
  delete inst.q;
  delete inst.state;
  delete inst.tint;
  delete inst.opened;
  // a level of its own only as its new kind has one (a drink stays as full as it was, a thing that was none comes as newItem makes it)
  if (d.drink) inst.litres = Math.min(inst.litres ?? d.drink.litres, d.drink.litres);
  else delete inst.litres;
  const uses = d.gear?.uses ?? d.gear?.points;
  if (uses !== undefined) inst.uses = Math.min(inst.uses ?? uses, uses);
  else delete inst.uses;
  if (d.perish) {
    // (it is where it was: it goes off at the rate it did)
    inst.fresh = 1;
    if (at !== undefined) inst.t0 = at < nowS ? at : nowS;
    if (rate !== undefined) inst.fk = rate;
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

/** how deep a thing's state is looked into (and kept, when it is read back from a save): no state of ours is anywhere near */
const STATE_DEPTH = 12;

/**
 * The same JSON value: objects whatever the order of their keys, a key that holds undefined as good as absent
 * (as stableJson has it). Compared in place, nothing made: this is asked while the player looks at things.
 */
function sameJson(a: unknown, b: unknown, depth: number): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object' || depth > STATE_DEPTH) return false;
  const arr = Array.isArray(a);
  if (arr !== Array.isArray(b)) return false;
  if (arr) {
    const x = a as unknown[];
    const y = b as unknown[];
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (!sameJson(x[i] ?? null, y[i] ?? null, depth + 1)) return false;
    return true;
  }
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  let n = 0;
  for (const k in x) {
    const v = x[k];
    if (v === undefined) continue;
    n++;
    const w = y[k];
    if (w === undefined || !sameJson(v, w, depth + 1)) return false;
  }
  for (const k in y) if (y[k] !== undefined) n--;
  return n === 0;
}

const NO_STATE: ItemState = Object.freeze({});

function sameState(a: ItemState | undefined, b: ItemState | undefined): boolean {
  return a === b || sameJson(a ?? NO_STATE, b ?? NO_STATE, 0);
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

/** about as fresh as each other at the time FR[0] (STACK_FRESH_TOL), each read at its own rate; a turned one only with turned ones */
function freshClose(a: ItemInstance, b: ItemInstance): boolean {
  if ((a.fresh === undefined) !== (b.fresh === undefined)) return false;
  if (a.fresh === undefined) return true;
  freshInto(a, 1);
  freshInto(b, 2);
  const fa = FR[1];
  const fb = FR[2];
  if ((fa <= 0) !== (fb <= 0)) return false;
  return Math.abs(fa - fb) <= STACK_FRESH_TOL;
}

/**
 * May these two be one stack? (Not whether there is room: mergeStacks says how many fit.) The same kind, a
 * kind that stacks, nothing inside, no level of their own (litres, blows left), the same colour, quality and
 * state, going off at the same rate and about as fresh (STACK_FRESH_TOL; a turned one only with turned ones).
 */
export function canStack(a: ItemInstance, b: ItemInstance, nowS: number): boolean {
  // (a stack used up is no stack: nothing joins it, and it joins nothing)
  FR[0] = nowS;
  return (a.n ?? 1) > 0 && (b.n ?? 1) > 0 && sameSort(a, b) && (a.fk ?? 1) === (b.fk ?? 1) && freshClose(a, b);
}

/** move k of `from` onto `into` (the caller has checked that they stack and that k fit) */
function mergeSome(into: ItemInstance, from: ItemInstance, k: number, nowS: number): void {
  const na = countOf(into);
  if (into.fresh !== undefined) {
    const fi = freshNow(into, nowS);
    const ff = freshNow(from, nowS);
    const p = fi <= 0 && ff <= 0 ? itemDef(into.item).perish : undefined;
    if (p) {
      // two turned ones: one that ran out at the mean, by count, of the moments the two did (what they
      // become is counted from then: the same as settling each first and putting them together after)
      const ti = into.t0 === undefined ? undefined : ranOutAt(into, p.hours);
      const tf = from.t0 === undefined ? undefined : ranOutAt(from, p.hours);
      into.fresh = 0;
      if (ti !== undefined && tf !== undefined) into.t0 = (ti * na + tf * k) / (na + k);
      else if (tf !== undefined) into.t0 = tf;
      else if (ti !== undefined) into.t0 = ti;
    } else {
      // the mean by count: no freshness is made or lost by putting things together
      into.fresh = (fi * na + ff * k) / (na + k);
      // (two that have not started are one that has not started; and a time it is written as of is never moved back)
      if ((into.t0 !== undefined || from.t0 !== undefined) && !(into.t0 !== undefined && into.t0 > nowS)) into.t0 = nowS;
    }
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
  if (left <= 0) return 0;
  if (!canStack(into, from, nowS)) return left;
  const room = stackMax(into.item) - countOf(into);
  if (room <= 0) return left;
  const k = Math.min(room, left);
  mergeSome(into, from, k, nowS);
  return left - k;
}

/**
 * Take k off a stack as a new stack (a new uid). null when k is not a whole number from 1 to one less than
 * what there is (to take all of it, take the thing itself), and for a thing with things in it, which is one
 * of a kind.
 */
export function splitStack(inst: ItemInstance, k: number): ItemInstance | null {
  const n = countOf(inst);
  if (!Number.isInteger(k) || k < 1 || k >= n || inst.inside !== undefined) return null;
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
  KG[0] = 0;
  const list = box.inside;
  if (list) for (let i = 0; i < list.length; i++) addMass(list[i]);
  return KG[0];
}

/**
 * How many of `inst` the box would take now (0 ... its count): by its kind, by the weight the box bears, by
 * room on the stacks inside that it would join and by free slots. Changes nothing and allocates nothing.
 */
export function roomInside(box: ItemInstance, inst: ItemInstance, nowS: number): number {
  const total = countOf(inst);
  if (total <= 0 || !accepts(box, inst)) return 0;
  FR[0] = nowS;
  const h = itemDef(box.item).holds!;
  let can = total;
  const list = box.inside;
  const used = list ? list.length : 0;
  if (h.maxKg !== undefined) {
    // (the weights are summed in KG, not handed back from itemMass and insideMass: see there)
    KG[0] = 0;
    addMass(inst);
    const unit = KG[0] / total;
    if (unit > 0) {
      KG[0] = 0;
      for (let i = 0; i < used; i++) addMass(list![i]);
      const fit = Math.floor((h.maxKg - KG[0]) / unit + 1e-9);
      if (fit < can) can = fit > 0 ? fit : 0;
    }
    if (can <= 0) return 0;
  }
  // (what is in it already is not put in again)
  for (let i = 0; i < used; i++) if (list![i] === inst) return 0;
  if (used < h.slots) return can;
  // no free slot: only what fits onto stacks it would join (as if it were at the box's rate already)
  let room = 0;
  for (let i = 0; i < used && room < can; i++) {
    const s = list![i];
    if (stacksInside(s, inst)) room += Math.max(0, stackMax(s.item) - countOf(s));
  }
  return Math.min(can, room);
}

/** canStack, at the time FR[0], for a thing about to join a stack inside a box: its own rate is not compared, since it takes the box's as it goes in */
function stacksInside(s: ItemInstance, inst: ItemInstance): boolean {
  return sameSort(s, inst) && freshClose(s, inst);
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
  const k = boxDecay(box);
  const list = (box.inside ??= []);
  const out = inst.fk ?? 1;
  setFreshRate(inst, nowS, k);
  let left = total;
  for (let i = 0; i < list.length && can > 0 && left > 0; i++) {
    const s = list[i];
    // (the time is said again each round: what was asked in between asked at this same time, but need not have)
    FR[0] = nowS;
    if (!stacksInside(s, inst)) continue;
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

/**
 * Take the i-th thing out of a box (or k off it, as a new stack; k of all there is or more: the thing itself);
 * it goes off in the open air from now. null, and nothing changed, when there is no such thing or k is not a
 * whole number from 1.
 */
export function takeInside(box: ItemInstance, i: number, nowS: number, k?: number): ItemInstance | null {
  const list = box.inside;
  const s = list?.[i];
  if (!list || !s) return null;
  if (k !== undefined && !(Number.isInteger(k) && k >= 1)) return null;
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

/** how deep things inside things are counted in a save that is not ours (ours hold one level: containers do not nest) */
const NEST_MAX = 6;

/** how many things something from a save stands for, with what is in it: what is counted when it cannot be read back */
function lostCount(raw: unknown, depth: number): number {
  if (!raw || typeof raw !== 'object' || depth > NEST_MAX) return 0;
  const r = raw as Record<string, unknown>;
  if (typeof r.uid !== 'string' || typeof r.item !== 'string') return 0;
  const n = r.n;
  let c = typeof n !== 'number' || n !== n ? 1 : n < 1 ? 0 : Math.min(Math.floor(n), MAX_COUNT);
  if (Array.isArray(r.inside)) for (const x of r.inside) c += lostCount(x, depth + 1);
  return c;
}

/** JSON no deeper than STATE_DEPTH (what is deeper is not a state any code here could have written, and would be walked without end) */
function shallow(v: unknown, depth: number): boolean {
  if (v === null || typeof v !== 'object') return true;
  if (depth >= STATE_DEPTH) return false;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) if (!shallow(v[i], depth + 1)) return false;
    return true;
  }
  const o = v as Record<string, unknown>;
  for (const k in o) if (!shallow(o[k], depth + 1)) return false;
  return true;
}

/**
 * A thing read back from a save, made sound, in place. null when it is not a thing at all, when it is a stack
 * used up (a count of 0 or less: it is gone, and never comes back as one), or when its kind is not in the
 * catalogue (a kind from a system this build does not have; one a system retired is read back as the kind it went
 * into, registerRetiredItems): then it and what was in it are counted in `loss`.
 * Whoever was holding it drops it. A count, a level, a freshness or a quality out of range is brought back
 * into range (a count that is no number at all is one thing; a stack over its kind's maximum is kept as it
 * is); fields its kind has no use for are removed; what is inside is cleaned the same way, and what was
 * inside a thing that cannot hold it (a box in a box, a kind that holds nothing any more) is counted in
 * `loss` too. It never throws, whatever it is handed.
 */
export function cleanItem(raw: unknown, loss: LoadLoss): ItemInstance | null {
  try {
    return cleaned(raw, loss, false);
  } catch {
    // (what cannot be made sound is no thing)
    return null;
  }
}

function cleaned(raw: unknown, loss: LoadLoss, inner: boolean): ItemInstance | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.uid !== 'string' || typeof r.item !== 'string') return null;
  // (a kind there is not any more: read as what took its place — retired one by one (retireItem), or by a system's
  // rule (registerRetiredItems))
  if (!BY_ID.has(r.item)) RETIRED.get(r.item)?.(r);
  const id = typeof r.item === 'string' ? itemIdNow(r.item) : null;
  const d = id !== null ? BY_ID.get(id) : undefined;
  if (!d) {
    loss.unknown += lostCount(r, 0);
    return null;
  }
  const inst = raw as ItemInstance;
  if (d.id !== r.item) inst.item = d.id;
  const n = r.n;
  if (n !== undefined) {
    // (no number at all: one thing, as a thing without a count is)
    if (typeof n !== 'number' || n !== n) delete inst.n;
    else if (n < 1) {
      // a stack used up: gone (what such a thing claims to hold is not read back either)
      if (Array.isArray(r.inside)) for (const x of r.inside) loss.unknown += lostCount(x, 1);
      return null;
    } else {
      const k = Math.min(Math.floor(n), MAX_COUNT);
      // (written only when it is more than one; a thing that holds things is one of a kind)
      if (k === 1 || d.holds) delete inst.n;
      else inst.n = k;
    }
  }
  // a level of its own, as its kind has one
  if (r.litres !== undefined) {
    if (d.drink && typeof r.litres === 'number' && Number.isFinite(r.litres)) inst.litres = Math.min(d.drink.litres, Math.max(0, r.litres));
    else delete inst.litres;
  }
  if (r.uses !== undefined) {
    const full = d.gear?.uses ?? d.gear?.points;
    if (full !== undefined && typeof r.uses === 'number' && Number.isFinite(r.uses)) inst.uses = Math.min(full, Math.max(0, r.uses));
    else delete inst.uses;
  }
  if (r.tint !== undefined && !isHex(r.tint)) delete inst.tint;
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
  if (r.state !== undefined && (r.state === null || typeof r.state !== 'object' || Array.isArray(r.state) || !shallow(r.state, 0))) delete inst.state;
  if (r.inside !== undefined) {
    const list: readonly unknown[] = Array.isArray(r.inside) ? r.inside : [];
    if (!d.holds || inner) {
      // containers do not nest, and a kind that holds nothing holds nothing: it stays, without what was in it
      for (const x of list) loss.unknown += lostCount(x, 1);
      delete inst.inside;
    } else {
      const kept: ItemInstance[] = [];
      for (const x of list) {
        const c = cleaned(x, loss, true);
        if (c && c !== inst) kept.push(c);
      }
      if (kept.length) inst.inside = kept;
      else delete inst.inside;
    }
  }
  return inst;
}
