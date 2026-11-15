/**
 * Everything that can be picked up, carried, stored, eaten, burnt or fitted: one catalogue, one id
 * per kind of thing (docs/DESIGN_V2.md 6.4, 8.1, 11).
 *
 * Three sizes decide how a thing is handled, and that is the whole of the carrying rules:
 *   small   goes in a backpack slot; like things stack
 *   medium  is carried in the hands, one at a time
 *   large   takes two people (or one, slowly) and only rides in a cargo bay
 *
 * The catalogue is plain data. The world's loot tables (loot.ts) and the vehicle's parts both speak
 * in these ids; the vehicle track registers its own parts with `registerItems`.
 */

export type ItemSize = 'small' | 'medium' | 'large';

export type ItemCat = 'food' | 'drink' | 'spice' | 'material' | 'fuel' | 'part' | 'tyre' | 'tool' | 'bait' | 'fish' | 'game' | 'medical' | 'ammo' | 'keepsake';

/** which painted stand-in draws it when it lies in the world (the scene keeps one small mesh per shape) */
export type ItemShape =
  | 'can'
  | 'jar'
  | 'bottle'
  | 'carton'
  | 'sack'
  | 'bundle'
  | 'coil'
  | 'roll'
  | 'jerrycan'
  | 'drum'
  | 'tyre'
  | 'battery'
  | 'machine'
  | 'tool'
  | 'case'
  | 'book'
  | 'tape'
  | 'paper'
  | 'fish'
  | 'bunch'
  | 'cap'
  | 'berry'
  | 'egg'
  | 'cut'
  | 'pelt'
  | 'tuber';

export interface ItemDef {
  readonly id: string;
  readonly zh: string;
  readonly en: string;
  readonly cat: ItemCat;
  readonly size: ItemSize;
  /** how many share one slot (small things; 1 for everything carried in the hands) */
  readonly stack: number;
  /** 0 common, 1 uncommon, 2 rare */
  readonly rarity: 0 | 1 | 2;
  readonly shape: ItemShape;
  /** its paint, 0xRRGGBB (sRGB) */
  readonly tint: number;
  /** loses a fifth of its worth each time it is knocked about (8.1) */
  readonly fragile: boolean;
  /** a vessel: what it holds when full */
  readonly holds: { readonly what: 'fuel' | 'water'; readonly litres: number } | null;
}

interface Opt {
  size?: ItemSize;
  stack?: number;
  rarity?: 0 | 1 | 2;
  fragile?: boolean;
  holds?: { what: 'fuel' | 'water'; litres: number };
}

const table = new Map<string, ItemDef>();

function def(id: string, zh: string, en: string, cat: ItemCat, shape: ItemShape, tint: number, o: Opt = {}): void {
  const size = o.size ?? 'small';
  if (table.has(id)) throw new Error(`item ${id} defined twice`);
  table.set(id, { id, zh, en, cat, size, stack: size === 'small' ? (o.stack ?? 10) : 1, rarity: o.rarity ?? 0, shape, tint, fragile: o.fragile ?? false, holds: o.holds ?? null });
}

// ---- materials (11.3: fourteen, and everything that is built is built from these)
def('mat.firewood', '木柴', 'firewood', 'material', 'bundle', 0x8a6a48);
def('mat.plank', '木板', 'plank', 'material', 'bundle', 0xb89466);
def('mat.scrap', '废铁', 'scrap metal', 'material', 'machine', 0x7d8588);
def('mat.wire', '电线', 'wire', 'material', 'coil', 0xb5653a);
def('mat.cloth', '布', 'cloth', 'material', 'roll', 0xd8cdb4);
def('mat.rope', '绳', 'rope', 'material', 'coil', 0xc7ad7c);
def('mat.tape', '胶带', 'tape', 'material', 'roll', 0x9aa3a6);
def('mat.electronics', '电子件', 'electronics', 'material', 'case', 0x4f7f6c, { rarity: 1 });
def('mat.hide', '皮', 'hide', 'material', 'pelt', 0x9b7350, { rarity: 1 });
def('mat.yarn', '羊毛线', 'yarn', 'material', 'coil', 0xe7dccb);
def('mat.button', '纽扣', 'buttons', 'material', 'jar', 0xd9a441);
def('mat.bamboo', '竹竿', 'bamboo pole', 'material', 'bundle', 0xa9b06a);
def('mat.bottle', '玻璃瓶', 'glass bottle', 'material', 'bottle', 0x8fc2b4, { fragile: true });
def('mat.rubber', '橡胶', 'rubber', 'material', 'roll', 0x3d3f45);

// ---- from shelves and cupboards (11.1, 8.1)
def('food.rice', '米', 'rice', 'food', 'sack', 0xe9e2cf);
def('food.flour', '面粉', 'flour', 'food', 'sack', 0xf1ead9);
def('food.can.beans', '罐头豆', 'tinned beans', 'food', 'can', 0xb5503c);
def('food.can.meat', '午餐肉罐头', 'tinned meat', 'food', 'can', 0x5d7fa3);
def('food.can.butter', '黄油罐头', 'tinned butter', 'food', 'can', 0xe6c458, { rarity: 1 });
def('food.milkpowder', '奶粉', 'milk powder', 'food', 'can', 0xf0e6c8, { rarity: 1 });
def('food.snack', '零食', 'snacks', 'food', 'carton', 0xe08a3c);
def('spice.salt', '盐', 'salt', 'spice', 'jar', 0xf2f2ee);
def('spice.sugar', '糖', 'sugar', 'spice', 'jar', 0xf6efe2);
def('spice.chili', '辣椒', 'chili', 'spice', 'bunch', 0xc23a2b);
def('drink.coffee', '咖啡豆', 'coffee beans', 'drink', 'sack', 0x6b4630, { rarity: 1 });
def('drink.tea', '茶叶', 'tea', 'drink', 'can', 0x6f8f5a, { rarity: 1 });
def('drink.water', '瓶装水', 'bottled water', 'drink', 'bottle', 0xa9d3e6);
def('mat.seeds', '种子', 'seeds', 'material', 'paper', 0xcdbb7a, { rarity: 1 });
def('mat.cells', '电池', 'dry cells', 'material', 'case', 0xd0b23c);

// ---- gathered (11.1)
def('food.potato', '土豆', 'potato', 'food', 'tuber', 0xb99a68);
def('food.lotus', '莲藕', 'lotus root', 'food', 'tuber', 0xe3d3bb);
def('food.agave', '龙舌兰芯', 'agave heart', 'food', 'tuber', 0xa8b47a);
def('food.dandelion', '蒲公英', 'dandelion', 'food', 'bunch', 0x8fae4f);
def('food.nettle', '荨麻', 'nettle', 'food', 'bunch', 0x5f8f4a);
def('food.watercress', '水芹', 'watercress', 'food', 'bunch', 0x6fae5c);
def('food.lichen', '苔原地衣', 'tundra lichen', 'food', 'bunch', 0xb9c3a0);
def('food.porcini', '牛肝菌', 'porcini', 'food', 'cap', 0x9a6a3c);
def('food.truffle', '松露', 'truffle', 'food', 'cap', 0x3e332c, { rarity: 2 });
def('food.berry', '野莓', 'wild berries', 'food', 'berry', 0xb5304a);
def('food.blueberry', '蓝莓', 'blueberries', 'food', 'berry', 0x47518f);
def('food.cactusfruit', '仙人掌果', 'cactus fruit', 'food', 'berry', 0xc9486e);
def('food.frostberry', '冻莓', 'frost berries', 'food', 'berry', 0x9fc3e0);
def('food.egg', '鸟蛋', 'eggs', 'food', 'egg', 0xe9e0cb, { fragile: true });
def('spice.onion', '野葱', 'wild onion', 'spice', 'bunch', 0x9fc27a);
def('spice.sage', '鼠尾草', 'sage', 'spice', 'bunch', 0x8fa39a);
def('spice.pine', '松针', 'pine needles', 'spice', 'bunch', 0x3f6f4f);
def('spice.mint', '薄荷', 'mint', 'spice', 'bunch', 0x62b58a);
def('spice.chamomile', '洋甘菊', 'chamomile', 'spice', 'bunch', 0xf0e3a0);
def('spice.snowlotus', '雪莲', 'snow lotus', 'spice', 'bunch', 0xe8eef6, { rarity: 2 });

// ---- hunted (8.5)
def('food.rabbit', '兔肉', 'rabbit', 'food', 'cut', 0xc98a80);
def('food.fowl', '禽肉', 'fowl', 'food', 'cut', 0xd9a08a);
def('food.venison', '鹿肉', 'venison', 'food', 'cut', 0xa85a52, { rarity: 1 });
def('game.rabbit', '野兔', 'rabbit (whole)', 'game', 'pelt', 0xb7a38a, { size: 'medium' });
def('game.duck', '野鸭', 'duck (whole)', 'game', 'pelt', 0x5d7a5a, { size: 'medium' });
def('game.deer', '鹿', 'deer (whole)', 'game', 'pelt', 0x9a7350, { size: 'large', rarity: 1 });

// ---- caught (11.2, the first chapter's twelve)
def('fish.bleak', '白条', 'bleak', 'fish', 'fish', 0xc9d3d6);
def('fish.crucian', '鲫鱼', 'crucian carp', 'fish', 'fish', 0xa9a27a);
def('fish.trout', '鳟鱼', 'trout', 'fish', 'fish', 0xb98a6a, { rarity: 1 });
def('fish.perch', '鲈鱼', 'perch', 'fish', 'fish', 0x7f9a5a, { rarity: 1 });
def('fish.carp', '鲤鱼', 'carp', 'fish', 'fish', 0xc9903c, { rarity: 1, size: 'medium' });
def('fish.catfish', '鲶鱼', 'catfish', 'fish', 'fish', 0x5a5d58, { rarity: 1, size: 'medium' });
def('fish.pike', '狗鱼', 'pike', 'fish', 'fish', 0x6f8a5c, { rarity: 2, size: 'medium' });
def('fish.moon', '月光鱼', 'moonfish', 'fish', 'fish', 0xbfe6e0, { rarity: 2 });
def('fish.eel', '雨后鳗', 'rain eel', 'fish', 'fish', 0x4f5f4a, { rarity: 2, size: 'medium' });
def('fish.barb', '绿洲鲃', 'oasis barb', 'fish', 'fish', 0xd0b070);
def('fish.char', '冰下鲑', 'ice char', 'fish', 'fish', 0xd98a7a, { rarity: 1, size: 'medium' });
def('fish.king', '老湖王', 'the old king of the lake', 'fish', 'fish', 0x8a7a4a, { rarity: 2, size: 'large' });
// out of the water come other things too
def('junk.boot', '旧靴子', 'old boot', 'material', 'roll', 0x5a4a3c);

// ---- bait (8.4)
def('bait.worm', '蚯蚓', 'worms', 'bait', 'jar', 0xa86a5a);
def('bait.sandworm', '沙虫', 'sandworms', 'bait', 'jar', 0xd0a878);
def('bait.snail', '螺', 'snails', 'bait', 'jar', 0x8a8a70);
def('bait.bread', '面包', 'bread', 'bait', 'carton', 0xd9b070);
def('bait.spinner', '亮片鱼饵', 'spinner', 'bait', 'case', 0xc9ced3);

// ---- fuel and fluids (5.6, 8.1); the petrol itself is litres in a vessel, never a thing by itself
def('fuel.jerrycan', '油桶 10 L', 'jerrycan', 'fuel', 'jerrycan', 0xb5402c, { size: 'medium', holds: { what: 'fuel', litres: 10 } });
def('fuel.drum', '油桶 20 L', 'fuel drum', 'fuel', 'drum', 0x3f6f8a, { size: 'large', holds: { what: 'fuel', litres: 20 } });
def('fuel.oil', '机油', 'motor oil', 'fuel', 'bottle', 0xd9a23c);
def('water.canister', '水桶 8 L', 'water canister', 'drink', 'jerrycan', 0x8fb8d0, { size: 'medium', holds: { what: 'water', litres: 8 } });

// ---- tools (6.4: the tool wheel) and what goes with them
def('tool.repairkit', '修理包', 'repair kit', 'tool', 'case', 0xc0563c);
def('tool.siphon', '抽油管', 'siphon hose', 'tool', 'coil', 0xd8c24a);
def('tool.jack', '千斤顶', 'jack', 'tool', 'machine', 0xb5402c, { size: 'medium', rarity: 1 });
def('tool.wrench', '扳手', 'wrench', 'tool', 'tool', 0x9aa3a6);
def('tool.torch', '手电筒', 'torch', 'tool', 'tool', 0xd9b23c);
def('tool.binoculars', '望远镜', 'binoculars', 'tool', 'case', 0x3d3f45, { rarity: 2, fragile: true });
def('ammo.bullet', '子弹', 'bullets', 'ammo', 'case', 0xc9a23c, { rarity: 1 });

// ---- medicine (8.1 clinic)
def('med.herbs', '草药', 'herbs', 'medical', 'bunch', 0x7fa56a);
def('med.bandage', '绷带', 'bandage', 'medical', 'roll', 0xf0ece0);
def('med.tablets', '净水片', 'water tablets', 'medical', 'case', 0xe6eef2, { rarity: 1 });

// ---- things kept for their own sake (3.6, 8.1)
def('keep.tape', '磁带', 'cassette', 'keepsake', 'tape', 0xd98a3c, { stack: 1, rarity: 1, fragile: true });
def('keep.map', '地图残页', 'scrap of a map', 'keepsake', 'paper', 0xe6dcc0, { stack: 1, rarity: 1 });
def('keep.photo', '相片', 'photograph', 'keepsake', 'paper', 0xd9d3c6, { stack: 1, rarity: 1 });
def('keep.book', '书', 'book', 'keepsake', 'book', 0x8a4f3c, { stack: 1, rarity: 1 });
def('keep.radio', '收音机', 'radio', 'keepsake', 'case', 0x6f8f8a, { size: 'medium', rarity: 2, fragile: true });

// ---- big things that take two (6.4, 8.1): the first of the vehicle's parts are here so wrecks and
// workshops have something to give before the vehicle track registers the full list
def('tyre.road', '公路胎', 'road tyre', 'tyre', 'tyre', 0x34363b, { size: 'large' });
def('part.battery.1', '电瓶', 'battery', 'part', 'battery', 0x3f5f8a, { size: 'medium', stack: 1 }); // vehicle systems: was part.battery
def('part.belt', '皮带', 'drive belt', 'part', 'coil', 0x2f3035);
def('part.sparkplug', '火花塞', 'spark plugs', 'part', 'case', 0xd9d3c6);
def('big.generator', '发电机', 'generator', 'part', 'machine', 0xc9a23c, { size: 'large', rarity: 2 });
def('big.mattress', '床垫', 'mattress', 'material', 'roll', 0xd9cdb8, { size: 'large', rarity: 1 });

/** every item, by id */
export const ITEMS: ReadonlyMap<string, ItemDef> = table;

export function item(id: string): ItemDef {
  const d = table.get(id);
  if (!d) throw new Error(`no such item: ${id}`);
  return d;
}

export function hasItem(id: string): boolean {
  return table.has(id);
}

/**
 * Add items owned by another system (the vehicle's parts and tyres). Ids must be new; the same
 * definition given twice (a module loaded twice) is let through.
 */
export function registerItems(defs: readonly (Pick<ItemDef, 'id' | 'zh' | 'en' | 'cat' | 'shape' | 'tint'> & Partial<ItemDef>)[]): void {
  for (const d of defs) {
    const old = table.get(d.id);
    if (old) {
      if (old.zh !== d.zh || old.cat !== d.cat) throw new Error(`item ${d.id} is already taken`);
      continue;
    }
    const size = d.size ?? 'small';
    table.set(d.id, { id: d.id, zh: d.zh, en: d.en, cat: d.cat, size, stack: size === 'small' ? (d.stack ?? 10) : 1, rarity: d.rarity ?? 0, shape: d.shape, tint: d.tint, fragile: d.fragile ?? false, holds: d.holds ?? null });
  }
}
