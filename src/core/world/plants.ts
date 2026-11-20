/**
 * The plants of the world (docs/V3/nodes/W2-flora.md): every kind of tree, shrub and ground plant the flora
 * field can stand somewhere, as data. A region's flora table (flora.ts FloraRule) names plants by their id;
 * the renderer draws a plant by its `model` family with its colours; foraging asks what a plant `bears`.
 *
 * The list is append-only in spirit: a plant's id is what tables and saves may name. Pure data.
 */
import type { Text } from '../modcar/types';

/** the layer a plant stands in: trees and shrubs on the 8 m grid, ground plants on the 4 m grid */
export type PlantLayer = 'tree' | 'shrub' | 'ground';

export interface PlantDef {
  readonly id: string;
  readonly layer: PlantLayer;
  readonly name: Text;
  /** how tall it stands, full grown (m): the flora field's size (0.6 … 1.3 or so) scales this */
  readonly height: number;
  /** the radius of its crown or clump (m), and of its trunk where it has one that stops a wheel or a bullet (0: none) */
  readonly crown: number;
  readonly trunk: number;
  /** keeps its leaves in winter and under snow */
  readonly evergreen?: boolean;
  /** the family of model the renderer draws it with */
  readonly model: string;
  /** main colour and second colour (0xRRGGBB): crown and trunk, leaf and flower; absent: the region's palette decides */
  readonly tint?: readonly [number, number];
  /**
   * What it bears for the forager (a forage kind's id), on itself or fallen under it; `share` is how many of
   * its kind bear at all (absent: every one): not every pine has cones within reach, not every reed is worth
   * cutting. Which ones do is the plant's own dice (bearsAt).
   */
  readonly bears?: { readonly forage: string; readonly where: 'on' | 'under'; readonly share?: number };
  /** it grows in water: only where shallow water stands over the ground (no deeper than AQUATIC_DEPTH) */
  readonly aquatic?: boolean;
}

/** the deepest water (m) a plant that grows in water stands in */
export const AQUATIC_DEPTH = 0.7;

const ALL: PlantDef[] = [];

function P(id: string, layer: PlantLayer, zh: string, en: string, height: number, crown: number, trunk: number, model: string, o: Partial<PlantDef> = {}): void {
  ALL.push({ id, layer, name: { zh, en }, height, crown, trunk, model, ...o });
}

// ------------------------------------------------------------------ trees

P('oak', 'tree', '橡树', 'Oak', 11, 4.6, 0.36, 'broadleaf', { bears: { forage: 'acorn', where: 'under', share: 0.12 } });
P('linden', 'tree', '椴树', 'Linden', 12, 4.2, 0.32, 'broadleaf2');
P('ash', 'tree', '白蜡树', 'Ash', 13, 3.8, 0.3, 'broadleaf3');
P('birch', 'tree', '白桦', 'Birch', 11, 2.6, 0.18, 'birch', { tint: [0x9fcf6a, 0xe9e6dc] });
P('poplar', 'tree', '白杨', 'Poplar', 15, 2.0, 0.24, 'poplar');
P('willow', 'tree', '垂柳', 'Willow', 9, 4.4, 0.34, 'willow', { tint: [0x9cc86a, 0x6e5a40] });
P('maple', 'tree', '枫树', 'Maple', 11, 4.2, 0.3, 'broadleaf', { tint: [0xd4572f, 0x5a4034] });
P('pine', 'tree', '松树', 'Pine', 13, 3.0, 0.3, 'conifer2', { evergreen: true });
P('spruce', 'tree', '云杉', 'Spruce', 14, 2.6, 0.28, 'conifer', { evergreen: true, bears: { forage: 'resin', where: 'on', share: 0.05 } });
P('juniper', 'tree', '刺柏', 'Juniper', 5, 1.9, 0.22, 'juniper', { evergreen: true, tint: [0x6f8f5a, 0x7a6248] });
P('camphor', 'tree', '香樟', 'Camphor', 12, 5.2, 0.4, 'broadleaf2', { evergreen: true, tint: [0x4f9a55, 0x5c4a38] });
P('bamboo', 'tree', '毛竹', 'Bamboo', 12, 2.2, 0.14, 'bamboo', { evergreen: true, tint: [0x7fbf55, 0x9fcf6a], bears: { forage: 'bamboo_cane', where: 'on', share: 0.08 } });
P('apple_tree', 'tree', '苹果树', 'Apple tree', 6, 3.2, 0.22, 'fruit_tree', { tint: [0x7fb060, 0xd8483a], bears: { forage: 'wild_apple', where: 'on' } });
P('cherry_tree', 'tree', '樱桃树', 'Cherry tree', 7, 3.4, 0.22, 'fruit_tree', { tint: [0x86b866, 0xb3202c], bears: { forage: 'cherry', where: 'on' } });
P('persimmon_tree', 'tree', '美洲柿树', 'American persimmon tree', 8, 3.4, 0.26, 'fruit_tree', { tint: [0xa9a24e, 0xf08a24], bears: { forage: 'persimmon', where: 'on' } });
P('chestnut_tree', 'tree', '欧洲甜栗', 'Sweet chestnut', 12, 4.8, 0.38, 'broadleaf', { tint: [0x86a84e, 0x5a4034], bears: { forage: 'chestnut', where: 'under' } });
P('walnut_tree', 'tree', '美洲黑核桃', 'Black walnut', 12, 4.6, 0.36, 'broadleaf3', { tint: [0x8fb25a, 0x5e4a38], bears: { forage: 'walnut', where: 'under' } });
P('saguaro', 'tree', '巨人柱', 'Saguaro', 6, 0.9, 0.3, 'cactus', { evergreen: true, bears: { forage: 'saguaro_fruit', where: 'on', share: 0.3 } });
P('baobab', 'tree', '猴面包树', 'Baobab', 14, 5.5, 1.6, 'baobab', { tint: [0x8fa860, 0x8a7a66], bears: { forage: 'baobab_fruit', where: 'under' } });
P('pepper_tree', 'tree', '花椒树', 'Sichuan pepper tree', 4, 2.2, 0.14, 'fruit_tree', { tint: [0x5f9a4c, 0xb0302c], bears: { forage: 'sichuan_pepper', where: 'on' } });

// ------------------------------------------------------------------ shrubs

P('bush', 'shrub', '灌木', 'Bush', 1.6, 1.3, 0, 'bush');
P('hazel', 'shrub', '榛丛', 'Hazel', 2.6, 1.8, 0, 'bush', { tint: [0x7fae5a, 0x6a5540] });
P('berry_bush', 'shrub', '野生黑莓丛', 'Blackberry bramble', 1.2, 1.1, 0, 'berry_bush', { tint: [0x6fa456, 0x37293f], bears: { forage: 'wild_berry', where: 'on' } });
P('blueberry_bush', 'shrub', '笃斯越橘丛', 'Bog bilberry shrub', 0.6, 0.8, 0, 'berry_bush', { tint: [0x5f9450, 0x3d4f9c], bears: { forage: 'blueberry', where: 'on', share: 0.6 } });
P('cranberry_bush', 'shrub', '蔓越莓丛', 'Cranberry bush', 0.4, 0.9, 0, 'berry_bush', { tint: [0x6a8f52, 0xb01f3c], bears: { forage: 'cranberry', where: 'on', share: 0.7 } });
P('rose_bush', 'shrub', '野蔷薇', 'Wild rose', 1.4, 1.2, 0, 'berry_bush', { tint: [0x77a85a, 0xe2572f], bears: { forage: 'rose_hip', where: 'on' } });
P('tea_bush', 'shrub', '茶丛', 'Tea bush', 0.9, 0.8, 0, 'tea_bush', { evergreen: true, tint: [0x3f8a4a, 0x6fb060], bears: { forage: 'tea_leaf', where: 'on', share: 0.25 } });
P('sage_bush', 'shrub', '蒿灌丛', 'Sagebrush', 0.8, 0.9, 0, 'sage', { evergreen: true, tint: [0x9aa88a, 0x8a84b0] });
P('agave', 'shrub', '龙舌兰', 'Agave', 1.1, 1.0, 0, 'agave', { evergreen: true, tint: [0x7fa58a, 0xc8d6a0], bears: { forage: 'agave_heart', where: 'on', share: 0.5 } });
P('prickly_pear', 'shrub', '仙人掌', 'Prickly pear', 1.0, 1.0, 0, 'prickly_pear', { evergreen: true, tint: [0x6fa060, 0xd0406a], bears: { forage: 'cactus_fruit', where: 'on', share: 0.35 } });
P('reed', 'shrub', '芦苇丛', 'Reeds', 2.2, 1.0, 0, 'reed', { tint: [0xa9b866, 0xcbb890], bears: { forage: 'reed', where: 'on', share: 0.08 } });
P('fern', 'shrub', '蕨丛', 'Ferns', 0.7, 0.9, 0, 'fern', { tint: [0x4f9450, 0x6fae5a] });
P('buckthorn_bush', 'shrub', '沙棘丛', 'Sea buckthorn', 1.8, 1.3, 0, 'berry_bush', { tint: [0x9aa878, 0xf09a1c], bears: { forage: 'sea_buckthorn', where: 'on' } });
P('jasmine_bush', 'shrub', '茉莉丛', 'Jasmine', 1.2, 1.0, 0, 'berry_bush', { evergreen: true, tint: [0x4f9a50, 0xfaf8f0], bears: { forage: 'jasmine', where: 'on' } });
P('grape_vine', 'shrub', '野葡萄藤', 'Wild grape vine', 1.6, 1.4, 0, 'vine', { tint: [0x7fa850, 0x5a2a6a], bears: { forage: 'wild_grape', where: 'on' } });
P('sunflower', 'shrub', '向日葵', 'Sunflower', 1.9, 0.5, 0, 'sunflower', { tint: [0x5f9a44, 0xf2c23c], bears: { forage: 'sunflower_seed', where: 'on', share: 0.3 } });
P('sorghum_stand', 'shrub', '高粱丛', 'Sorghum', 2.0, 0.7, 0, 'tall_grass', { tint: [0x8a9a4c, 0xa83a2a], bears: { forage: 'sorghum', where: 'on', share: 0.6 } });
P('rice_stand', 'shrub', '栽培稻丛', 'Cultivated rice', 1.1, 0.7, 0, 'tall_grass', { tint: [0x7fa850, 0xc8b46a], bears: { forage: 'wild_rice', where: 'on', share: 0.3 }, aquatic: true });
P('fibre_tuft', 'shrub', '纤维草丛', 'Fibre grass', 0.9, 0.7, 0, 'tall_grass', { tint: [0x8a9a4c, 0xb8b46a], bears: { forage: 'fibre_grass', where: 'on', share: 0.6 } });

// ------------------------------------------------------------------ ground

P('rock', 'ground', '石块', 'Rock', 0.6, 0.7, 0.5, 'rock');
P('boulder', 'ground', '大石', 'Boulder', 1.6, 1.6, 1.3, 'boulder');
P('log', 'ground', '朽木', 'Fallen log', 0.4, 1.6, 0.25, 'log');
P('stump', 'ground', '树桩', 'Stump', 0.5, 0.4, 0.3, 'stump');
P('flower_clump', 'ground', '花丛', 'Flower clump', 0.4, 0.6, 0, 'flower_clump');

// ------------------------------------------------------------------ ground plants that are picked (node W3: one for each kind no tree or shrub bears)

/** a ground plant that bears the forage kind of the same name: `id` is the kind's id with `_plant` */
function F(kind: string, zh: string, en: string, height: number, crown: number, model: string, tint: readonly [number, number], o: Partial<PlantDef> = {}): void {
  P(`${kind}_plant`, 'ground', zh, en, height, crown, 0, model, { tint, bears: { forage: kind, where: 'on' }, ...o });
}

// mushrooms
F('porcini', '牛肝菌', 'Porcini', 0.14, 0.2, 'cap_mushroom', [0x8a5a34, 0xe8dcc0]);
F('chanterelle', '鸡油菌', 'Chanterelles', 0.08, 0.3, 'cluster_mushroom', [0xf0a830, 0xf6cf7a]);
F('matsutake', '松茸', 'Matsutake', 0.12, 0.18, 'cap_mushroom', [0xb08a5c, 0xefe6d2]);
F('morel', '羊肚菌', 'Morels', 0.1, 0.2, 'cap_mushroom', [0x9a7a4c, 0xe6d9b8]);
F('truffle', '松露', 'Truffle', 0.05, 0.25, 'truffle_mound', [0x5a4a3a, 0x2e2620]);
F('reishi', '灵芝', 'Reishi', 0.25, 0.5, 'shelf_mushroom', [0x8a2a1c, 0xd98a2c]);
F('oyster_mushroom', '平菇', 'Oyster mushrooms', 0.25, 0.6, 'shelf_mushroom', [0xd8d2c6, 0xf4f0e6]);
F('lions_mane', '猴头菇', "Lion's mane", 0.3, 0.4, 'shelf_mushroom', [0xf2ead8, 0xe0d2b4]);
F('bamboo_fungus', '竹荪', 'Bamboo fungus', 0.18, 0.15, 'cap_mushroom', [0xf6f2e8, 0x6a5a40]);
F('glow_mushroom', '西美南瓜灯菇', 'Western jack-o’-lanterns', 0.08, 0.3, 'cluster_mushroom', [0xba792f, 0xe0ac56]);
F('fly_agaric', '毒蝇伞', 'Fly agaric', 0.16, 0.2, 'cap_mushroom', [0xd8362a, 0xf6f0e4]);
F('death_cap', '毒鹅膏', 'Death cap', 0.14, 0.18, 'cap_mushroom', [0xc8d0a8, 0xf2f0e2]);
// fruit
F('cloudberry', '云莓', 'Cloudberries', 0.15, 0.4, 'low_berry', [0x7fa860, 0xf0a03c]);
F('wild_tomato', '逸生番茄', 'Volunteer tomatoes', 0.6, 0.5, 'tall_herb', [0x5f9a4a, 0xd8402c]);
// greens
F('dandelion', '蒲公英', 'Dandelions', 0.15, 0.3, 'rosette', [0x6fae4c, 0xf2c83c]);
F('shepherds_purse', '荠菜', "Shepherd's purse", 0.15, 0.3, 'rosette', [0x5f9c48, 0xf0f0e0]);
F('wild_scallion', '野葱', 'Wild scallions', 0.3, 0.25, 'grass_tuft', [0x5fa04c, 0xf0f0e4]);
F('watercress', '豆瓣菜', 'Watercress', 0.25, 0.5, 'water_plant', [0x4f9a4c, 0x7fbe6a], { aquatic: true });
F('purslane', '马齿苋', 'Purslane', 0.1, 0.35, 'rosette', [0x6aa04c, 0xb04a4a]);
F('nettle', '荨麻', 'Nettles', 0.7, 0.5, 'tall_herb', [0x4a8a44, 0x6aa85a]);
F('bamboo_shoot', '竹笋', 'Bamboo shoots', 0.3, 0.25, 'shoot', [0xb89a5c, 0x6a4a2c]);
F('samphire', '海蓬子', 'Samphire', 0.15, 0.35, 'rosette', [0x5a9a5c, 0xb04a4a]);
F('reindeer_moss', '苔原地衣', 'Reindeer moss', 0.06, 0.5, 'crust', [0xc8d0b4, 0x9aa88a]);
// roots
F('wild_yam', '野山药', 'Wild yam', 0.5, 0.4, 'vine', [0x6fa450, 0xb89a70]);
F('lotus_root', '莲藕', 'Lotus', 0.5, 0.8, 'water_plant', [0x5f9a50, 0xf0b0c0], { aquatic: true });
F('burdock', '牛蒡', 'Burdock', 0.6, 0.5, 'root_tuft', [0x5f8a44, 0x8a6a44]);
F('potato', '土豆', 'Potato plants', 0.4, 0.45, 'root_tuft', [0x5f9448, 0xf2e2b0]);
F('ginseng', '人参', 'Ginseng', 0.35, 0.3, 'root_tuft', [0x5f9a4c, 0xb02a2a]);
// herbs
F('coriander', '香菜', 'Coriander', 0.3, 0.3, 'tall_herb', [0x5fa850, 0xf0f0e0]);
F('mint', '薄荷', 'Mint', 0.35, 0.4, 'tall_herb', [0x4fa860, 0xc8a0d0]);
F('wild_garlic', '欧洲熊葱', 'Ramsons', 0.25, 0.4, 'rosette', [0x4f9a4c, 0xf4f4ea]);
F('chili', '辣椒', 'Chili plants', 0.5, 0.4, 'tall_herb', [0x4f9a44, 0xd82a1c]);
F('perilla', '紫苏', 'Perilla', 0.5, 0.4, 'tall_herb', [0x7a3a6a, 0x5f9a50]);
F('thyme', '百里香', 'Thyme', 0.1, 0.4, 'rosette', [0x7a9a6a, 0xb08ac0]);
F('pine_needle', '松针', 'Pine needles', 0.05, 0.6, 'crust', [0x8a6a44, 0x3f7a4c]);
// flowers
F('chamomile', '洋甘菊', 'Chamomile', 0.3, 0.4, 'flower_clump', [0x6aa850, 0xf6f2e6]);
F('wild_chrysanthemum', '野菊', 'Wild chrysanthemums', 0.4, 0.5, 'flower_clump', [0x5f9a4c, 0xf2c43c]);
// medicinal
F('mugwort', '艾草', 'Mugwort', 0.7, 0.5, 'tall_herb', [0x7a9a6a, 0xc8d4b8]);
F('calendula', '金盏花', 'Calendula', 0.35, 0.4, 'flower_clump', [0x6aa850, 0xf08a1c]);
F('snow_lotus', '天山雪莲', 'Tianshan snow lotus', 0.25, 0.3, 'rosette', [0xb8d0a0, 0xf0f4e8]);
F('cordyceps', '冬虫夏草', 'Cordyceps', 0.06, 0.1, 'shoot', [0x8a6a3c, 0xc8a05c]);
F('echinacea', '紫锥菊', 'Echinacea', 0.6, 0.4, 'flower_clump', [0x6aa850, 0xc86aa8]);
// waterside and shore
F('kelp', '海带', 'Kelp', 0.1, 0.9, 'kelp', [0x3a5a34, 0x5a7a44]);
F('clam', '蛤蜊', 'Clam bed', 0.04, 0.5, 'shell_bed', [0xe0d4bc, 0xa89878]);
F('mussel', '贻贝', 'Mussels', 0.1, 0.5, 'shell_bed', [0x2a2a3a, 0x5a5a7a]);
F('crab', '螃蟹', 'Crab', 0.08, 0.25, 'crab', [0xb04a2c, 0xe08a4c]);
F('water_chestnut', '菱角', 'Water caltrop', 0.1, 0.8, 'water_plant', [0x5f9a50, 0x4a2a3a], { aquatic: true });
// resources
F('flint', '燧石', 'Flint nodule', 0.2, 0.35, 'rock_nodule', [0x4a4a52, 0x8a8a94]);
F('clay', '黏土', 'Clay bank', 0.3, 0.8, 'crust', [0xb07a4c, 0xc89a6a]);
F('salt', '盐', 'Salt crust', 0.05, 0.8, 'crust', [0xf4f2ee, 0xd8d4cc]);
F('honeycomb', '蜂巢', 'Beehive', 0.8, 0.5, 'hive', [0xc8a05c, 0xe8a82c]);
F('sulphur', '硫磺', 'Sulphur crust', 0.1, 0.6, 'crust', [0xe8d82c, 0xb8a81c]);
F('saltpetre', '硝石', 'Saltpetre crust', 0.05, 0.6, 'crust', [0xe8e6dc, 0xc8c4b4]);

P('evergreen_huckleberry_bush', 'shrub', '常绿越橘丛', 'Evergreen huckleberry shrub', 0.7, 0.8, 0, 'berry_bush', { tint: [0x627e53, 0x37314b], bears: { forage: 'evergreen_huckleberry', where: 'on', share: 0.5 } });
P('bilberry_bush', 'shrub', '欧洲越橘丛', 'Bilberry shrub', 0.7, 0.8, 0, 'berry_bush', { tint: [0x627e53, 0x443b79], bears: { forage: 'bilberry', where: 'on', share: 0.5 } });
P('lingonberry_bush', 'shrub', '越橘红果丛', 'Lingonberry shrub', 0.7, 0.8, 0, 'berry_bush', { tint: [0x627e53, 0xae3148], bears: { forage: 'lingonberry', where: 'on', share: 0.5 } });
P('calafate_bush', 'shrub', '卡拉法特小檗果丛', 'Calafate berry shrub', 0.7, 0.8, 0, 'berry_bush', { tint: [0x627e53, 0x3e3556], bears: { forage: 'calafate', where: 'on', share: 0.5 } });
P('native_raspberry_bush', 'shrub', '澳洲原生悬钩子丛', 'Native raspberry shrub', 0.7, 0.8, 0, 'berry_bush', { tint: [0x627e53, 0xc93c47], bears: { forage: 'native_raspberry', where: 'on', share: 0.5 } });
P('serviceberry_bush', 'shrub', '桤叶唐棣果丛', 'Saskatoon berry shrub', 2.6, 0.8, 0, 'berry_bush', { tint: [0x627e53, 0x4a3a68], bears: { forage: 'serviceberry', where: 'on', share: 0.5 } });
P('southern_beech', 'tree', '南方山毛榉', 'Southern beech', 12, 4.2, 0.35, 'broadleaf', { evergreen: true });
P('pinyon', 'tree', '科罗拉多矮松', 'Colorado pinyon', 5, 2.8, 0.22, 'conifer2', { evergreen: true, bears: { forage: 'pine_nut', where: 'under', share: 0.25 } });
P('european_hazel', 'shrub', '欧洲榛', 'European hazel', 2.8, 1.8, 0, 'bush', { bears: { forage: 'hazelnut', where: 'under', share: 0.4 } });

// ------------------------------------------------------------------ the emergent Earth's (docs/V3/nodes/E1-earth-world.md)
// (the forms the ecosystem cards of core/earth/efg.ts name, drawn by the families the crowns already have)
P('coconut_palm', 'tree', '椰子', 'Coconut palm', 14, 3.2, 0.25, 'coconut_palm', { evergreen: true });
P('fan_palm', 'tree', '扇叶棕', 'Fan palm', 9, 2.6, 0.3, 'fan_palm', { evergreen: true });
P('acacia', 'tree', '金合欢', 'Acacia', 8, 4.8, 0.25, 'acacia');
P('eucalyptus', 'tree', '桉树', 'Eucalyptus', 22, 4.5, 0.4, 'eucalyptus', { evergreen: true });
P('mangrove', 'tree', '红树', 'Mangrove', 8, 4, 0.3, 'mangrove', { evergreen: true });
P('tree_fern', 'tree', '树蕨', 'Tree fern', 5, 2.2, 0.15, 'tree_fern', { evergreen: true });
P('olive', 'tree', '橄榄', 'Olive', 6, 3, 0.3, 'olive', { evergreen: true });
P('cypress', 'tree', '意大利柏', 'Italian cypress', 14, 1.2, 0.25, 'cypress', { evergreen: true });
P('cedar', 'tree', '雪松', 'Cedar', 18, 5, 0.5, 'cedar', { evergreen: true });
P('redwood', 'tree', '红杉', 'Redwood', 45, 4.5, 1, 'redwood', { evergreen: true });
P('stone_pine', 'tree', '伞松', 'Stone pine', 13, 5, 0.35, 'stone_pine', { evergreen: true });
P('joshua_tree', 'tree', '约书亚树', 'Joshua tree', 6, 2.5, 0.3, 'joshua_tree', { evergreen: true });
P('larch', 'tree', '落叶松', 'Larch', 18, 2.6, 0.3, 'larch');
P('fir', 'tree', '冷杉', 'Fir', 20, 2.6, 0.3, 'fir', { evergreen: true });
P('giant_broadleaf', 'tree', '雨林巨树', 'Emergent tree', 32, 8, 0.8, 'giant_broadleaf', { evergreen: true });
P('dwarf_pine', 'tree', '偃松', 'Dwarf pine', 2.5, 2, 0.15, 'dwarf_pine', { evergreen: true });
P('beech', 'tree', '山毛榉', 'Beech', 18, 5, 0.4, 'beech');
P('aspen', 'tree', '山杨', 'Aspen', 14, 2.4, 0.2, 'aspen');
P('palo_verde', 'tree', '绿干树', 'Palo verde', 6, 3.5, 0.2, 'palo_verde');
P('river_fig', 'tree', '榕树', 'Fig', 15, 7, 0.7, 'river_fig', { evergreen: true });
P('marula', 'tree', '马鲁拉树', 'Marula', 12, 6, 0.5, 'marula');
P('rimu', 'tree', '陆均松', 'Rimu', 25, 4, 0.5, 'rimu', { evergreen: true });
P('rhododendron', 'shrub', '杜鹃丛', 'Rhododendron', 2.6, 1.8, 0, 'rhododendron', { evergreen: true });
P('thorn_bush', 'shrub', '刺灌丛', 'Thorn scrub', 1.6, 1.6, 0, 'bush_dry');
P('heath_bush', 'shrub', '高山矮灌', 'Alpine shrub', 0.9, 1.4, 0, 'bush_alpine', { evergreen: true });

/** every plant, in the catalogue's order (an index into this list is what a flora cell holds) */
export const PLANTS: readonly PlantDef[] = ALL;

const INDEX = new Map(ALL.map((p, i) => [p.id, i]));

/** the index of a plant in PLANTS; −1: there is none of that id */
export function plantIndex(id: string): number {
  return INDEX.get(id) ?? -1;
}

/**
 * What the plant standing in a cell bears, if this one bears at all: the forage kind's id, or null. `vary` is
 * the cell's own number (FloraCell.vary, 0 … 1), so the same plant bears or does not for ever.
 */
export function bearsAt(plant: PlantDef, vary: number): string | null {
  const b = plant.bears;
  if (!b) return null;
  return b.share === undefined || vary < b.share ? b.forage : null;
}

export function plantDef(id: string): PlantDef {
  const i = INDEX.get(id);
  if (i === undefined) throw new Error(`no plant ${id}`);
  return ALL[i];
}
