/**
 * The kinds of forage (docs/V3/CATALOG.md "采集物", docs/V3/nodes/W3-forage.md): one row each. A row
 * says what the thing is once picked (weight, how it stacks, how long it keeps, what eating it raw does), how
 * much a plant gives and how soon again, when it shows, which tool helps, and what it looks like in the hand.
 * Where it grows is the flora field's business: plants bear kinds (src/core/world/plants.ts).
 *
 * The numbers hang together like this (the body's rules are src/core/modcar/vitals.ts: food 100 lasts 48
 * minutes; a tin of mackerel is 75, a bag of crackers 20):
 *   - one item is a PORTION (a handful of berries, one apple, a bunch of greens), and a plant gives 1 to 4;
 *   - raw, a portion is worth little: fruit 8 to 12, berries 6, nuts 9, roots 5, mushrooms 4, greens 3,
 *     shellfish 5, herbs and flowers 1. A stop's picking (15 portions or so) is about a region's driving.
 *     Cooking is where forage becomes meals (node C1 multiplies these and adds what a dish does);
 *   - the poisonous mushrooms cause sickness and HP loss; the death cap has the largest penalty;
 *   - what is soft goes off in a day or two, roots keep ten days, nuts, grain and minerals keep;
 *   - rarity sets the grade on the card (1, 2, 3, 5 stars) and what proficiency a pick is worth.
 *
 * To add a kind: add a row at the end of its category here, a plant that bears it in plants.ts, and rules
 * for that plant in the flora tables of the regions it grows in. The catalogue test counts the rows.
 */
import type { Rarity, Text } from '../contracts/base';
import type { ForageCat, ForageKind, ForageWhen, ItemFamily } from './types';

/** what a category's kinds have in common unless a row says otherwise */
const CAT: Readonly<Record<ForageCat, { mass: number; stack: number; perish?: number; regrow: number; tool?: ForageKind['tool']; item: ItemFamily }>> = {
  mushroom: { mass: 0.08, stack: 8, perish: 30, regrow: 2, tool: 'knife', item: 'mushroom' },
  fruit: { mass: 0.1, stack: 10, perish: 48, regrow: 3, item: 'berries' },
  greens: { mass: 0.08, stack: 10, perish: 30, regrow: 2, tool: 'knife', item: 'leaves' },
  root: { mass: 0.25, stack: 6, perish: 240, regrow: 5, tool: 'trowel', item: 'root' },
  herb: { mass: 0.03, stack: 12, perish: 72, regrow: 2, tool: 'knife', item: 'sprig' },
  nut: { mass: 0.1, stack: 12, regrow: 4, item: 'nuts' },
  flower: { mass: 0.02, stack: 12, perish: 60, regrow: 2, item: 'flower' },
  medicinal: { mass: 0.03, stack: 8, perish: 96, regrow: 4, tool: 'knife', item: 'sprig' },
  shore: { mass: 0.2, stack: 6, perish: 20, regrow: 1, tool: 'trowel', item: 'shell' },
  resource: { mass: 0.4, stack: 10, regrow: 6, item: 'lump' },
};

const STARS: Readonly<Record<Rarity, number>> = { common: 1, uncommon: 2, rare: 3, legendary: 5 };

/** what a row may say beyond the common */
interface More {
  mass?: number;
  stack?: number;
  /** game hours it keeps; 0: it keeps for ever */
  perish?: number;
  regrow?: number;
  tool?: ForageKind['tool'] | null;
  when?: ForageWhen;
  twin?: string;
  hp?: number;
  effect?: 'sick1' | 'sick2' | 'warm1' | 'warm2';
  item?: ItemFamily;
  tags?: readonly string[];
  glow?: boolean;
}

const ALL: ForageKind[] = [];

/**
 * A row: id, category, names, rarity, the food a raw portion gives (0: not eaten), how many portions a plant
 * gives (low, high), three colours (main, second, accent), the card's line, where to look (both languages).
 */
function K(id: string, cat: ForageCat, zh: string, en: string, rarity: Rarity, food: number, lo: number, hi: number, colours: readonly [number, number, number], blurb: string, whereZh: string, whereEn: string, o: More = {}): void {
  const c = CAT[cat];
  const perish = o.perish !== undefined ? o.perish : c.perish;
  const tool = o.tool === null ? undefined : (o.tool ?? c.tool);
  const eats = food > 0 || (o.hp ?? 0) !== 0 || o.effect !== undefined;
  const name: Text = { zh, en };
  ALL.push({
    id,
    cat,
    name,
    rarity,
    ...(o.when ? { when: o.when } : {}),
    yield: [lo, hi],
    regrowDays: o.regrow ?? c.regrow,
    ...(tool ? { tool } : {}),
    ...(o.twin ? { twin: o.twin } : {}),
    item: {
      mass: o.mass ?? c.mass,
      stack: o.stack ?? c.stack,
      stars: STARS[rarity],
      ...(perish ? { perishHours: perish } : {}),
      ...(eats ? { eat: { food, hp: o.hp ?? 0, ...(o.effect ? { effect: o.effect } : {}) } } : {}),
      ...(o.tags ? { tags: o.tags } : {}),
    },
    look: { item: o.item ?? c.item, colours, ...(o.glow ? { glow: true } : {}) },
    blurb,
    where: { zh: whereZh, en: whereEn },
  });
}

const RAIN: ForageWhen = { afterRain: true };
const DAWN: ForageWhen = { hours: [5, 9] };
const NIGHT: ForageWhen = { hours: [20, 5] };
const TIDE: ForageWhen = { lowTide: true };

// ------------------------------------------------------------------ mushrooms (12)

K('porcini', 'mushroom', '牛肝菌', 'Porcini', 'common', 4, 1, 3, [0x8a5a34, 0xe8dcc0, 0x6e4526], '肥厚的牛肝菌，切片下锅满屋子香。', '松林和橡树林下，雨后最多。', 'Under pines and oaks, most after rain.', { when: RAIN });
K('chanterelle', 'mushroom', '鸡油菌', 'Chanterelle', 'common', 4, 2, 4, [0xf0a830, 0xf6cf7a, 0xd98a1c], '杏黄色的小喇叭，带一点果香。', '阔叶林的苔地上，成片地长。', 'On mossy ground in broadleaf woods, in troops.', { when: RAIN });
K('matsutake', 'mushroom', '松茸', 'Matsutake', 'rare', 5, 1, 2, [0xb08a5c, 0xefe6d2, 0x7a5a38], '一朵就能香一锅饭，难得。', '老松树下，背阴的坡上。', 'Under old pines, on shaded slopes.', { regrow: 4 });
K('morel', 'mushroom', '羊肚菌', 'Morel', 'uncommon', 0, 1, 3, [0x9a7a4c, 0xe6d9b8, 0x5e4a30], '蜂窝一样的菌帽，要煮熟了吃。', '春天的林缘和老果树下。', 'At the wood\'s edge and under old fruit trees.', { when: RAIN });
K('truffle', 'mushroom', '松露', 'Truffle', 'legendary', 5, 1, 1, [0x2e2620, 0x6a5a48, 0x9c8c74], '埋在土里的黑疙瘩，削一点就够一桌。', '橡树和榛树根旁的土里，极少。', 'In the soil by oak and hazel roots; very seldom.', { item: 'truffle', tool: 'trowel', regrow: 10, perish: 120 });
K('reishi', 'mushroom', '灵芝', 'Reishi', 'rare', 0, 1, 1, [0x8a2a1c, 0xd98a2c, 0xf2e2c0], '硬质的木生多孔菌，菌盖表面有漆状光泽。', '朽木和老树桩上。', 'On fallen logs and old stumps.', { perish: 0, regrow: 8, tags: ['medicine'] });
K('oyster_mushroom', 'mushroom', '平菇', 'Oyster mushroom', 'common', 4, 2, 4, [0xd8d2c6, 0xf4f0e6, 0xa8a094], '一层一层叠在木头上，嫩的最好。', '朽木和倒下的树干上。', 'On fallen logs and dead trunks.');
K('lions_mane', 'mushroom', '猴头菇', "Lion's mane", 'uncommon', 5, 1, 2, [0xf2ead8, 0xe0d2b4, 0xc8b490], '毛茸茸的一团，口感像肉。', '高处的阔叶树干上。', 'High on the trunks of broadleaf trees.');
K('bamboo_fungus', 'mushroom', '竹荪', 'Bamboo fungus', 'uncommon', 4, 1, 2, [0xf6f2e8, 0x6a5a40, 0xe8e0cc], '穿着网裙的菌子，炖汤最鲜。', '竹林里，清晨。', 'In bamboo groves, in the early morning.', { when: DAWN });
// Vitals schedules poisoning HP loss only for an ingested portion with positive food.
// One is its minimum integer intake; the HP loss and sickness outweigh it.
K('glow_mushroom', 'mushroom', '西美南瓜灯菇', 'Western jack-o’-lantern', 'rare', 1, 2, 4, [0xba792f, 0xe0ac56, 0x9baf72], '橙褐色菌盖下的菌褶能发微光。这种木腐菌有毒。', '加州阔叶树的根木和树桩旁，常成簇。', 'On hardwood roots and stumps in California.', { when: NIGHT, glow: true, hp: 0, effect: 'sick1', twin: 'chanterelle' });
K('fly_agaric', 'mushroom', '毒蝇伞', 'Fly agaric', 'uncommon', 1, 1, 3, [0xd8362a, 0xf6f0e4, 0xffffff], '毒蝇伞可引起严重中毒。', '桦树和松树下。', 'Under birches and pines.', { hp: 0, effect: 'sick1', when: RAIN });
K('death_cap', 'mushroom', '毒鹅膏', 'Death cap', 'uncommon', 1, 1, 2, [0xc8d0a8, 0xf2f0e2, 0xa8b088], '毒鹅膏（Amanita phalloides）有致命毒性。', '橡树林下。', 'Under oaks.', { hp: -10, effect: 'sick2' });

// ------------------------------------------------------------------ berries and fruit (12)

K('wild_berry', 'fruit', '野生黑莓', 'Wild blackberries', 'common', 6, 2, 4, [0x37293f, 0x6fa456, 0x774158], '当地悬钩子属的黑莓，熟果由许多小核果聚在一起。', '林缘和树篱的野莓丛上。', 'On berry bushes at the wood\'s edge and in hedges.');
K('blueberry', 'fruit', '笃斯越橘', 'Bog bilberry', 'common', 6, 2, 4, [0x3d4f9c, 0x5f9450, 0x8a9ae0], '笃斯越橘（Vaccinium uliginosum）的蓝紫色小果。', '北方酸性湿地和苔原的低矮灌丛。', 'In northern bogs and tundra scrub.');
K('cranberry', 'fruit', '蔓越莓', 'Cranberries', 'uncommon', 5, 2, 4, [0xb01f3c, 0x6a8f52, 0xe05a70], '酸得人眯眼，熬成酱正好。', '酸性泥炭地的低矮蔓丛。', 'In acidic peat bogs.');
K('cloudberry', 'fruit', '云莓', 'Cloudberries', 'rare', 7, 1, 3, [0xf0a03c, 0x7fa860, 0xf8c878], '寒地里的金色莓子，一年就熟那么几天。', '北方酸性泥炭湿地的开阔处。', 'In wet hollows of the cold country.', { regrow: 5 });
K('wild_grape', 'fruit', '野葡萄', 'Wild grapes', 'uncommon', 8, 1, 3, [0x5a2a6a, 0x7fa850, 0x8a5aa0], '一小串一小串，皮厚籽多，味道浓。', '废墟的藤蔓和向阳的林缘。', 'On vines over ruins and sunny wood edges.', { item: 'fruit' });
K('wild_tomato', 'fruit', '逸生番茄', 'Volunteer tomato', 'common', 8, 2, 4, [0xd8402c, 0x5f9a4a, 0xf07a4c], '没人管的菜地里自己长出来的，小而甜。', '废弃的菜园、梯田和村子边。', 'In old gardens, terraces and by villages.', { item: 'fruit', mass: 0.12 });
K('wild_apple', 'fruit', '苹果', 'Apple', 'common', 10, 2, 4, [0xd8483a, 0x7fb060, 0xf0c060], '果园里栽培的苹果；旧果园边也可有实生树。', '农耕河谷和旧果园旁。', 'In orchard valleys and on old orchard edges.', { item: 'fruit', mass: 0.18, stack: 6, perish: 120, regrow: 4 });
K('persimmon', 'fruit', '美洲柿', 'American persimmon', 'common', 12, 2, 4, [0xf08a24, 0xa9a24e, 0xd86a14], '软了才甜，硬的涩嘴。', '北美东部疏林边缘的美洲柿树。', 'On American persimmon trees in eastern woodland openings.', { item: 'fruit', mass: 0.2, stack: 6, perish: 96, regrow: 4 });
K('cherry', 'fruit', '樱桃', 'Cherries', 'uncommon', 7, 2, 4, [0xb3202c, 0x86b866, 0xe04a50], '成对挂在枝头，鸟比人来得早。', '樱桃树上。', 'On cherry trees.', { perish: 36 });
K('cactus_fruit', 'fruit', '仙人掌果', 'Prickly pear', 'common', 8, 1, 3, [0xd0406a, 0x6fa060, 0xf07a9c], '剥掉带刺的皮，里面是凉凉的甜。', '荒漠和红岩地带的仙人掌上。', 'On prickly pears in desert and red-rock country.', { item: 'fruit', mass: 0.15 });
K('sea_buckthorn', 'fruit', '沙棘', 'Sea buckthorn', 'uncommon', 5, 2, 4, [0xf09a1c, 0x9aa878, 0xf8c44c], '橙黄的小果子挤满枝条，酸得提神。', '干河滩和沙地的灌丛上。', 'On shrubs of dry river beds and sands.');
K('baobab_fruit', 'fruit', '猴面包果', 'Baobab fruit', 'rare', 14, 1, 2, [0xa89a6a, 0x7a6a48, 0xe8dcc0], '硬壳里是酸酸的粉，顶饿。', '稀树草原的猴面包树下。', 'Under the baobabs of the savanna.', { item: 'fruit', mass: 0.4, stack: 4, perish: 0, regrow: 6 });

// ------------------------------------------------------------------ wild greens (10)

K('dandelion', 'greens', '蒲公英', 'Dandelion', 'common', 3, 2, 4, [0x6fae4c, 0xf2c83c, 0x8ac060], '嫩叶微苦，焯一下拌着吃。', '草地上到处都是。', 'Everywhere in grass.');
K('shepherds_purse', 'greens', '荠菜', "Shepherd's purse", 'common', 3, 2, 4, [0x5f9c48, 0xf0f0e0, 0x7ab25a], '包饺子的好东西，有股清香。', '田埂、路边和梯田的坎上。', 'On field banks, verges and terrace risers.');
K('fiddlehead', 'greens', '荚果蕨嫩卷叶', 'Ostrich fern fiddleheads', 'common', 0, 2, 4, [0x4f9450, 0x8a6a3c, 0x6fae5a], '仅指荚果蕨嫩卷叶；形状相似的其他蕨类不能代用。', '湿润河岸的荚果蕨种群。', 'In verified stands of ostrich fern on moist floodplains.', { when: DAWN });
K('wild_scallion', 'greens', '野葱', 'Wild scallion', 'common', 2, 2, 4, [0x5fa04c, 0xf0f0e4, 0x7ab85a], '细细的一把，比家葱冲。', '草坡和林间空地。', 'On grassy slopes and in clearings.', { tags: ['spice'] });
K('watercress', 'greens', '豆瓣菜', 'Watercress', 'common', 3, 2, 4, [0x4f9a4c, 0x7fbe6a, 0xe8f0e0], '豆瓣菜（Nasturtium officinale）属十字花科，常见于有缓流的浅水。', '溪边和湖岸的浅水里。', 'In the shallows of streams and lake shores.');
K('purslane', 'greens', '马齿苋', 'Purslane', 'common', 3, 2, 4, [0x6aa04c, 0xb04a4a, 0x8aba5c], '肉乎乎的小叶子，酸溜溜的。', '干燥的路边和荒地。', 'On dry verges and waste ground.');
K('nettle', 'greens', '荨麻', 'Nettles', 'common', 3, 2, 4, [0x4a8a44, 0x6aa85a, 0x3a6a38], '蜇手，煮过就老实了，汤很鲜。', '林缘和废屋旁边。', 'At wood edges and by old houses.', { tags: ['fibre'] });
K('bamboo_shoot', 'greens', '竹笋', 'Bamboo shoot', 'common', 0, 1, 2, [0xb89a5c, 0xf0e6c4, 0x6a4a2c], '来自栽培食用竹的嫩笋，供烹饪使用。', '竹林里，竹子脚下。', 'In bamboo groves, at the foot of the canes.', { item: 'tuber', mass: 0.3, stack: 6, tool: 'trowel', perish: 72 });
K('samphire', 'greens', '海蓬子', 'Samphire', 'uncommon', 3, 2, 4, [0x5a9a5c, 0x7ab87a, 0xb04a4a], '自带咸味的海边野菜。', '海滩和盐湖边的泥地上。', 'On the mud of sea shores and salt lakes.', { tags: ['salty'] });
K('reindeer_moss', 'greens', '驯鹿地衣', 'Reindeer lichen', 'uncommon', 0, 2, 4, [0xc8d0b4, 0x9aa88a, 0xe6ecd8], '枝状地衣是北方驯鹿的冬季食源。', '雪山和苔原的石头上。', 'On rocks of the cold country.', { perish: 0 });

// ------------------------------------------------------------------ roots and tubers (6)

K('wild_yam', 'root', '山药', 'Chinese yam', 'uncommon', 6, 1, 2, [0xb89a70, 0xf0e8d4, 0x7a6244], '薯蓣（Dioscorea polystachya）的细长块茎。', '有当地记录的山药种植地或林缘。', 'In sunny scrub and at the foot of the karst towers.');
K('lotus_root', 'root', '莲藕', 'Lotus root', 'common', 6, 1, 3, [0xe0cfae, 0xf6efdc, 0x9a8460], '从泥里拔出来的一节一节，脆甜。', '湖和池塘的浅泥里。', 'In the shallow mud of lakes and ponds.', { perish: 120 });
K('burdock', 'root', '牛蒡', 'Burdock', 'common', 5, 1, 2, [0x8a6a44, 0xe6d8b8, 0x5e4a30], '长长的根，有股泥土的香。', '路边和林缘的肥土里。', 'In rich soil at verges and wood edges.');
K('potato', 'root', '土豆', 'Potato', 'common', 0, 2, 4, [0xc8a86a, 0xf2e2b0, 0x8a6a3c], '耕地里的块茎，作为烹饪原料。', '草原的旧田和村子边。', 'In old fields of the grassland and by villages.', { item: 'tuber', perish: 360 });
K('ginseng', 'root', '人参', 'Ginseng', 'legendary', 3, 1, 1, [0xe0c890, 0xb02a2a, 0x5f9a4c], '亚洲人参（Panax ginseng）的根。', '东北亚湿润温带林下。', 'In temperate woods of northeastern Asia.', { hp: 10, effect: 'warm1', regrow: 12, perish: 0, tags: ['medicine'] });
K('agave_heart', 'root', '龙舌兰芯', 'Agave heart', 'uncommon', 0, 1, 1, [0xc8d6a0, 0x7fa58a, 0xf0e8c0], '砍掉尖叶剩下的芯，烤过像蜜一样甜。', '荒漠的龙舌兰。', 'From agaves of the desert.', { item: 'tuber', mass: 1.2, stack: 3, tool: 'knife', regrow: 8 });

// ------------------------------------------------------------------ herbs and spices (9)

K('coriander', 'herb', '香菜', 'Coriander', 'common', 1, 2, 4, [0x5fa850, 0x8ac86a, 0xf0f0e0], '有人爱有人恨。', '梯田、菜园和村子边。', 'On terraces, in gardens and by villages.');
K('mint', 'herb', '薄荷', 'Mint', 'common', 1, 2, 4, [0x4fa860, 0x8ad09a, 0xc8a0d0], '揉一片叶子，凉气直冲鼻子。', '溪边和潮湿的草地。', 'By streams and in damp grass.');
K('sage', 'herb', '鼠尾草', 'Sage', 'common', 1, 2, 4, [0x9aa88a, 0x8a84b0, 0xc8d0b8], '灰绿的叶子，干了更香。', '栽培药用鼠尾草（Salvia officinalis）的香草园。', 'In culinary sage gardens.', { perish: 0 });
K('wild_garlic', 'herb', '欧洲熊葱', 'Ramsons', 'common', 2, 2, 4, [0x4f9a4c, 0xf4f4ea, 0x7aba6a], '熊葱（Allium ursinum）春季展叶。铃兰和秋水仙是有毒的混淆种。', '阔叶林下背阴处。', 'In the shade of broadleaf woods.');
K('sichuan_pepper', 'herb', '花椒', 'Sichuan pepper', 'uncommon', 1, 2, 4, [0xb0302c, 0x5f9a4c, 0x7a2a24], '麻得舌头跳舞。', '峰林和向阳山坡的花椒树上。', 'On pepper trees of the karst and sunny slopes.', { perish: 0, item: 'berries' });
K('chili', 'herb', '辣椒', 'Chili', 'common', 1, 2, 4, [0xd82a1c, 0x4f9a44, 0xf07a2c], '红的辣，绿的也辣。', '梯田、菜园和荒漠的旧院子。', 'On terraces, in gardens and old desert yards.', { item: 'fruit', perish: 120, tags: ['hot'] });
K('perilla', 'herb', '紫苏', 'Perilla', 'common', 1, 2, 4, [0x7a3a6a, 0x5f9a50, 0xa86a9a], '紫色的叶子，包着烤肉吃。', '樱花谷和梯田的地头。', 'At the field edges of the cherry valley and terraces.');
K('thyme', 'herb', '百里香', 'Thyme', 'common', 1, 2, 4, [0x7a9a6a, 0xb08ac0, 0x9ab88a], '贴着石头长的小叶子，炖什么都搭。', '干燥向阳的石坡。', 'On dry, sunny, stony slopes.', { perish: 0 });
K('pine_needle', 'herb', '松针', 'Pine needles', 'common', 0, 2, 4, [0x3f7a4c, 0x6a9a5c, 0x8a6a44], '真松属树下的落针，晒干可作引火物。', '松树下。', 'Under pines.', { perish: 0, tool: null, tags: ['tinder'] });

// ------------------------------------------------------------------ nuts, seeds and grain (6)

K('chestnut', 'nut', '栗子', 'Chestnuts', 'common', 9, 2, 4, [0x7a4a2a, 0xb08a4c, 0xe0c890], '带刺的壳裂开，里面油亮亮的。烤着吃。', '意大利甜栗林的成年栗树下。', 'Beneath mature sweet chestnut trees in Italian coppice.');
K('walnut', 'nut', '核桃', 'Walnuts', 'common', 9, 2, 4, [0xa8824c, 0x6a8a3c, 0xe0cfa0], '青皮染手，壳硬，仁香。', '核桃树下。', 'Under walnut trees.');
K('pine_nut', 'nut', '松子', 'Pine nuts', 'uncommon', 9, 1, 3, [0xc8a06a, 0x7a5a34, 0xf0e0b8], '从松塔里一粒一粒磕出来。', '科罗拉多矮松（Pinus edulis）的成熟球果。', 'In mature cones of Colorado pinyon.');
K('wild_rice', 'nut', '稻谷', 'Cultivated rice', 'common', 7, 2, 4, [0xc8b46a, 0x7fa850, 0xe8dca0], '稻穗上结的是栽培稻（Oryza sativa）的谷粒。', '亚洲稻作地区的浅水田。', 'In cultivated Asian rice paddies.', { item: 'grain', tool: 'sickle', mass: 0.15 });
K('sunflower_seed', 'nut', '葵花籽', 'Sunflower seeds', 'common', 8, 2, 4, [0x3a3630, 0xf2c23c, 0xe0dcd0], '一个花盘够嗑一路。', '花海原野的向日葵。', 'From the sunflowers of the flower fields.', { item: 'grain' });
K('sorghum', 'nut', '高粱', 'Sorghum', 'common', 7, 2, 4, [0xa83a2a, 0x8a9a4c, 0xd8a078], '红彤彤的穗子，能做饭也能酿酒。', '稀树草原和干燥的旧田。', 'On the savanna and dry old fields.', { item: 'grain', tool: 'sickle', mass: 0.15 });

// ------------------------------------------------------------------ flowers and tea (5)

K('chamomile', 'flower', '洋甘菊', 'Chamomile', 'common', 1, 2, 4, [0xf6f2e6, 0xf2c83c, 0x6aa850], '母菊（Matricaria chamomilla）的花序，白色舌状花围着黄心。', '草原的草地上。', 'In the grass of the plains.', { tags: ['tea'] });
K('jasmine', 'flower', '茉莉', 'Jasmine', 'uncommon', 1, 2, 4, [0xfaf8f0, 0x4f9a50, 0xf0e8c8], '夜里最香的小白花。', '花海原野和村子的篱笆上。', 'In the flower fields and on village fences.', { tags: ['tea'] });
K('wild_chrysanthemum', 'flower', '野菊', 'Wild chrysanthemum', 'common', 1, 2, 4, [0xf2c43c, 0x5f9a4c, 0xf8e08a], '秋天路边一片一片的小黄花。', '向阳的路边和坡上。', 'On sunny verges and slopes.', { tags: ['tea'] });
K('rose_hip', 'flower', '玫瑰果', 'Rose hips', 'common', 3, 2, 4, [0xe2572f, 0x77a85a, 0xf08a5c], '野蔷薇谢了以后结的小红果，酸。', '野蔷薇丛上。', 'On wild rose bushes.', { item: 'berries', perish: 120, tags: ['tea'] });
K('tea_leaf', 'flower', '茶叶', 'Tea leaves', 'uncommon', 0, 2, 4, [0x3f8a4a, 0x6fb060, 0x8aca7a], '一芽两叶，掐尖。', '茶园中成行的茶树新梢。', 'On cultivated tea bushes in hillside tea gardens.', { hp: 0, item: 'leaves', perish: 72, tags: ['tea'] });

// ------------------------------------------------------------------ medicinal plants (5)

K('mugwort', 'medicinal', '艾草', 'Mugwort', 'common', 1, 2, 4, [0x7a9a6a, 0xc8d4b8, 0x5a7a4c], '艾（Artemisia argyi）的叶背有灰白色绒毛。', '路边和河滩。', 'On verges and river flats.', { hp: 2, effect: 'warm1', tags: ['medicine'] });
K('calendula', 'medicinal', '金盏花', 'Calendula', 'common', 1, 2, 4, [0xf08a1c, 0x6aa850, 0xf8b44c], '栽培金盏花的头状花序呈橙黄或金黄。', '向阳的草地和旧花园。', 'In sunny grass and old gardens.', { hp: 4, tags: ['medicine'] });
K('snow_lotus', 'medicinal', '天山雪莲', 'Tianshan snow lotus', 'legendary', 0, 1, 1, [0xf0f4e8, 0xb8d0a0, 0x7a5a8a], '天山雪莲（Saussurea involucrata）生长于中亚高山碎石带。', '现有公路档案未收录已确认的产地。', 'No verified site on the current routes.', { regrow: 14, perish: 240, tags: ['medicine'] });
K('cordyceps', 'medicinal', '冬虫夏草', 'Caterpillar fungus', 'legendary', 0, 1, 1, [0x8a6a3c, 0xc8a05c, 0x4a3a28], '冬虫夏草（Ophiocordyceps sinensis）寄生于青藏高原及周缘的蝙蝠蛾科幼虫。', '现有公路档案未收录已确认的宿主草甸。', 'No verified host meadow on the current routes.', { regrow: 14, perish: 0, tool: 'trowel', tags: ['medicine'] });
K('echinacea', 'medicinal', '紫锥菊', 'Echinacea', 'uncommon', 1, 2, 3, [0xc86aa8, 0x8a4a2c, 0x6aa850], '紫色的花瓣往下垂，中间一个刺球。', '开阔的草甸。', 'In open meadows.', { hp: 5, tags: ['medicine'] });

// ------------------------------------------------------------------ waterside and shore (5)

K('kelp', 'shore', '大型褐藻', 'Kelp', 'common', 3, 1, 3, [0x3a5a34, 0x5a7a44, 0x8a9a5c], '海浪推上来的长带子，晒干了能放很久。', '有当地大型褐藻群落的海岸。', 'On coasts with kelp beds.', { item: 'kelp', when: TIDE, perish: 48, tool: null, tags: ['salty'] });
K('clam', 'shore', '蛤蜊', 'Clams', 'common', 5, 2, 4, [0xe0d4bc, 0xa89878, 0xf6f0e0], '退潮的沙里冒小泡的地方，往下挖。', '海滩的沙里，退潮时。', 'In the sand of the sea shore, at low tide.', { when: TIDE });
K('mussel', 'shore', '贻贝', 'Mussels', 'common', 5, 2, 4, [0x2a2a3a, 0x5a5a7a, 0xf0a060], '黑亮的壳成串地粘在石头上。', '海边的礁石上，退潮时。', 'On sea rocks, at low tide.', { when: TIDE, tool: 'knife' });
K('crab', 'shore', '螃蟹', 'Crab', 'uncommon', 7, 1, 2, [0xb04a2c, 0xe08a4c, 0xf6e0c0], '横着跑得飞快，手慢了就钻进石缝。', '海滩和河口的石头间，退潮或夜里。', 'Among stones of shore and estuary, at low tide.', { item: 'crab', mass: 0.4, stack: 4, when: TIDE, tool: null });
K('water_chestnut', 'shore', '菱角', 'Water caltrop', 'common', 6, 2, 4, [0x4a2a3a, 0x5f9a50, 0xf0e8d4], '两头尖尖的角，煮熟了粉粉的。', '栽培菱（Trapa 属）的浅水塘。', 'In shallow ponds cultivated with Trapa.', { item: 'nuts', perish: 96, tool: null });

// ------------------------------------------------------------------ resources (10)

K('flint', 'resource', '燧石', 'Flint', 'common', 0, 1, 2, [0x4a4a52, 0x8a8a94, 0xc8c8d0], '敲得出火星，也磨得出刃。', '河滩、峡谷和石坡。', 'On river gravel, in canyons and on scree.', { item: 'stone', regrow: 12, tags: ['material', 'stone'] });
K('clay', 'resource', '黏土', 'Clay', 'common', 0, 1, 3, [0xb07a4c, 0xc89a6a, 0x8a5a34], '一捏一个形，烧过就是罐子。', '河岸和湖边的断面上。', 'In the cut banks of rivers and lakes.', { mass: 1, stack: 6, regrow: 8, tool: 'trowel', tags: ['material'] });
K('salt', 'resource', '盐', 'Salt', 'common', 0, 1, 3, [0xf4f2ee, 0xd8d4cc, 0xfafafa], '白花花的一层，刮下来就是盐。', '盐湖、海边的石洼和荒漠的干湖床。', 'On salt lakes, sea rock pools and dry desert lake beds.', { mass: 0.2, stack: 12, regrow: 4, tags: ['material', 'salty', 'spice'] });
K('resin', 'resource', '针叶树脂', 'Conifer resin', 'common', 0, 1, 2, [0xd89a2c, 0xf0c86a, 0x8a5a1c], '树干伤口上流出来的，粘手，点得着。', '松树和云杉的树干上。', 'On the trunks of pines and spruces.', { mass: 0.1, stack: 12, regrow: 6, tool: 'knife', tags: ['material', 'tinder'] });
K('honeycomb', 'resource', '蜂蜡与蜂蜜', 'Honeycomb', 'rare', 14, 1, 2, [0xe8a82c, 0xf6d06a, 0x8a5a1c], '掰一块下来，蜜顺着手流。小心蜂。', '有蜂群占用的蜂箱或树洞。', 'In hives of the flower fields and hollow old trees.', { item: 'jar', mass: 0.3, stack: 6, regrow: 8, tags: ['material', 'sweet'] });
K('reed', 'resource', '芦苇', 'Reeds', 'common', 0, 2, 4, [0xcbb890, 0xa9b866, 0x8a7a4c], '割一捆，编席子、扎火把都用得上。', '湖边和湿地的芦苇丛。', 'In the reed beds of lakes and marshes.', { item: 'cane', mass: 0.2, stack: 12, regrow: 3, tool: 'sickle', tags: ['material', 'fibre'] });
K('bamboo_cane', 'resource', '竹子', 'Bamboo cane', 'common', 0, 1, 2, [0x9fcf6a, 0x7fbf55, 0xd8c88a], '又直又轻又结实，什么都能做。', '竹林里。', 'In bamboo groves.', { item: 'cane', mass: 1.2, stack: 6, regrow: 4, tool: 'knife', tags: ['material', 'wood'] });
K('fibre_grass', 'resource', '纤维草', 'Fibre grass', 'common', 0, 2, 4, [0xb8b46a, 0x8a9a4c, 0xe0dca0], '韧得很，搓成绳子拉不断。', '干燥的草坡和荒地。', 'On dry grassy slopes and waste ground.', { item: 'fibre', mass: 0.1, stack: 12, regrow: 3, tool: 'sickle', tags: ['material', 'fibre'] });
K('sulphur', 'resource', '硫磺', 'Sulphur', 'uncommon', 0, 1, 2, [0xe8d82c, 0xf6ec8a, 0xb8a81c], '自然硫常呈黄色结晶，受火山或热液环境控制。', '火山地带的喷气孔边。', 'By the vents of volcanic country.', { regrow: 12, tags: ['material', 'chemical'] });
K('saltpetre', 'resource', '硝石', 'Saltpetre', 'uncommon', 0, 1, 2, [0xe8e6dc, 0xc8c4b4, 0xfafaf4], '局部干燥洞穴和含硝沉积物可有硝酸盐析出。', '盐湖边、岩洞口和老墙根。', 'By salt lakes, cave mouths and the foot of old walls.', { regrow: 12, tags: ['material', 'chemical'] });

// Regional additions follow the legacy rows so existing item indices stay stable.
K('acorn', 'nut', '橡实', 'Acorn', 'uncommon', 0, 1, 3, [0x925d32, 0x69794a, 0xc9b074], '有杯状壳斗的栎树种子。', '成熟栎树的冠下。', 'Beneath local oaks.', { item: 'nuts' });
K('evergreen_huckleberry', 'fruit', '常绿越橘', 'Evergreen huckleberry', 'uncommon', 6, 1, 3, [0x37314b, 0x69794a, 0xc9b074], '加州海岸湿林中的深色小果。', '海岸红杉林有光的灌丛边缘。', 'At humid edges of coastal redwood groves.', { item: 'berries' });
K('bilberry', 'fruit', '欧洲越橘', 'Bilberry', 'uncommon', 6, 1, 3, [0x443b79, 0x69794a, 0xc9b074], '欧洲矮灌丛上的蓝紫色果实。', '欧洲凉湿山地的酸性林下。', 'On acidic woodland soils in European uplands.', { item: 'berries' });
K('lingonberry', 'fruit', '越橘红果', 'Lingonberry', 'uncommon', 6, 1, 3, [0xae3148, 0x69794a, 0xc9b074], '矮常绿灌木的红果。', '北方疏林的酸性土丘。', 'On acidic hummocks in boreal woodland.', { item: 'berries' });
K('saguaro_fruit', 'fruit', '巨柱仙人掌果', 'Saguaro fruit', 'uncommon', 6, 1, 3, [0xbd3652, 0x69794a, 0xc9b074], '初夏成熟于巨柱枝顶。', '索诺兰沙漠的成年巨柱仙人掌冠端。', 'Atop mature saguaros in the Sonoran Desert.', { item: 'fruit' });
K('calafate', 'fruit', '卡拉法特小檗果', 'Calafate berry', 'uncommon', 6, 1, 3, [0x3e3556, 0x69794a, 0xc9b074], '巴塔哥尼亚刺灌的蓝紫浆果。', '南美南端背风的草坡和林缘。', 'In sheltered Patagonian scrub.', { item: 'berries' });
K('native_raspberry', 'fruit', '澳洲原生悬钩子', 'Native raspberry', 'uncommon', 6, 1, 3, [0xc93c47, 0x69794a, 0xc9b074], '澳洲温带林缘的红色聚合果。', '东南澳大利亚的湿林缘。', 'On moist forest edges in southeastern Australia.', { item: 'berries' });
K('serviceberry', 'fruit', '桤叶唐棣果', 'Saskatoon berry', 'uncommon', 6, 1, 3, [0x4a3a68, 0x69794a, 0xc9b074], '唐棣的小果成熟时由红转紫。', '北美山地的林窗灌木。', 'In montane woodland openings in North America.', { item: 'berries' });
K('hazelnut', 'nut', '欧洲榛子', 'European hazelnut', 'uncommon', 9, 1, 3, [0x985c37, 0x69794a, 0xc9b074], '果苞中的小型坚果。', '已确认的欧洲榛林与田篱。', 'In European hazel groves and hedges.', { item: 'nuts' });

/** every kind, by category in the catalogue's order */
export const FORAGE_KINDS: readonly ForageKind[] = ALL;

/** a kind's index in FORAGE_KINDS by its id */
export const FORAGE_INDEX: Readonly<Record<string, number>> = Object.fromEntries(ALL.map((k, i) => [k.id, i]));

export function forageKind(id: string): ForageKind {
  const i = FORAGE_INDEX[id];
  if (i === undefined) throw new Error(`no forage kind ${id}`);
  return ALL[i];
}
