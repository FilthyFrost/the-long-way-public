/**
 * The ecosystems of the emergent Earth (docs/V3/plan/emergent-earth.md §4): the functional groups of IUCN's Global
 * Ecosystem Typology that a road goes through or past — the land's, the fresh waters' and the wetlands', the
 * shores' and the estuaries' — each a card of what it needs and how it looks. A point's ecosystem is the card that
 * best fits its local conditions (climate.ts `ecosystemAt`); near the edge of two, both, blended.
 *
 * What it needs (its niche, in the place's local terms): its mean temperature (°C, at that height: the lapse rate
 * is reckoned before it is asked), its moisture (0 hyper-arid … 1 always wet), the kinds of year it has, and what
 * else it must have — a coast, a river, salt, a mountain's cloud, a tropical latitude, a rock.
 *
 * How it looks: its structure (forest, woodland, savanna, shrubland, grassland, desert, tundra, wetland, bare, ice),
 * how much of the ground its canopy covers and how tall it stands, the plant forms of each layer (the archetypes
 * of the plant toolkit, built or to be built: docs/V3/art/plants-standard.md), the hue its vegetation takes, what
 * marks it out (its signature, for the director's moments), the characters a place's name is made of, and the
 * weather it leans to.
 *
 * The codes are IUCN's (GET v2: T terrestrial, F freshwater, TF palustrine, MT shoreline, MFT brackish tidal, FM
 * semi-confined transitional, M marine); the cards' numbers are ours, from the climates the groups are found in.
 * Pure data, DOM-free.
 */
import { band, type Disturb, type SeasonType, type Trap, type WaterKind } from './kinds';
import type { RockId } from './rocks';

/** plant forms: the plant toolkit's archetypes (and the shapes of them a card asks for) */
export type Form =
  | 'broadleaf'
  | 'broadleaf_small'
  | 'broadleaf_leader'
  | 'emergent'
  | 'laurel'
  | 'eucalypt'
  | 'sclerophyll'
  | 'conifer_spire'
  | 'conifer_tiered'
  | 'pine'
  | 'pine_umbrella'
  | 'cypress'
  | 'juniper'
  | 'larch'
  | 'redwood'
  | 'palm'
  | 'palm_fan'
  | 'bamboo'
  | 'tree_fern'
  | 'umbrella'
  | 'bottle'
  | 'succulent_tree'
  | 'cactus'
  | 'mangrove'
  | 'willow'
  | 'krummholz'
  | 'blossom'
  | 'orchard'
  | 'olive'
  | 'snag'
  | 'shrub_round'
  | 'shrub_heath'
  | 'shrub_sage'
  | 'shrub_thorn'
  | 'shrub_sclero'
  | 'rosette_giant'
  | 'rosette'
  | 'cushion'
  | 'grass_meadow'
  | 'grass_tall'
  | 'grass_tussock'
  | 'grass_hummock'
  | 'sedge'
  | 'reed'
  | 'fern'
  | 'moss'
  | 'lichen'
  | 'epiphyte'
  | 'flower_daisy'
  | 'flower_cup'
  | 'flower_spike'
  | 'flower_umbel'
  | 'flower_bell'
  | 'flower_tube'
  | 'flower_cluster'
  | 'aquatic'
  | 'crop_rice'
  | 'crop_wheat'
  | 'crop_vine'
  | 'crop_tea'
  | 'crop_lavender'
  | 'crop_sunflower'
  | 'crop_tulip'
  | 'crop_rape';

export type Struct = 'closed_forest' | 'open_forest' | 'woodland' | 'savanna' | 'shrubland' | 'grassland' | 'desert' | 'tundra' | 'wetland' | 'bare' | 'ice' | 'farmland' | 'water';

/** the hue a place's vegetation takes, as a painter would name it */
export type VegHue = 'deepgreen' | 'green' | 'fresh' | 'teal' | 'olive' | 'grey' | 'gold' | 'autumn' | 'blossom' | 'brown' | 'white' | 'purple' | 'none';

export type GroupId = 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7' | 'F1' | 'F2' | 'F3' | 'TF1' | 'MT' | 'MFT' | 'FM' | 'M';

export interface Needs {
  /** it is found only by these waters (a shore, a river, salt) */
  water?: readonly WaterKind[];
  /** only on these rocks, or never on these */
  rocks?: readonly RockId[];
  avoid?: readonly RockId[];
  /** only in mountains (it needs the relief), only in a mountain's cloud belt, only at a tropical latitude (the sea-level warmth above 18 °C) or never at one */
  mountain?: boolean;
  cloud?: boolean;
  tropical?: boolean;
  extratropical?: boolean;
  /** only after this has happened */
  disturb?: Disturb;
  /** only where the land lies level (fields, marshes) */
  flat?: boolean;
  /** seldom in the mountains or up high (the polar lowlands' own: the heights have the alpine cards) */
  lowland?: boolean;
  /** only in the mountains or on a high plateau (above 1,800 m): the alpine */
  alpine?: boolean;
  /** only by the sea (its shore, or a coast's lie of the land): the tides' own */
  coastal?: boolean;
  /** only where the land is one of these (landforms.ts ids): a lava field's own bare rock */
  landforms?: readonly string[];
}

export interface Efg {
  code: string;
  zh: string;
  group: GroupId;
  /** its niche: the local mean temperature (°C) and moisture (0 … 1); the kinds of year it has (absent: any) */
  t: Trap;
  m: Trap;
  /**
   * The mean warmth of its growing season (°C, climate.ts growingAt) it needs, where that and not the year's mean
   * draws its line: the treeline at 6.4 °C (Körner & Paulsen 2004), the alpine and the tundra below it, the ice
   * below freezing
   */
  g?: Trap;
  /** the warmth of its warmest month (°C, climate.ts summerAt) it needs: the ice caps where no month thaws (Köppen's EF) */
  summer?: Trap;
  seasons?: readonly SeasonType[];
  needs?: Needs;
  /** how often it is the one where it fits, against the others that fit as well (1 as often) */
  weight?: number;
  struct: Struct;
  /** its canopy's cover (0 … 1) and height (m) */
  cover: number;
  height: number;
  trees: readonly Form[];
  shrubs: readonly Form[];
  herbs: readonly Form[];
  flowers?: readonly Form[];
  veg: VegHue;
  /** what marks it out: the moments the director lays the road to show */
  signature: readonly string[];
  /** the characters a place of it is named with */
  name: readonly string[];
  weather?: { fog?: number; rain?: number; snow?: number; wind?: number; dust?: number };
}

const T = (lo: number, hi: number, soft = 3): Trap => band(lo, hi, soft);
const M = (lo: number, hi: number, soft = 0.08): Trap => band(lo, hi, soft);

export const EFGS: readonly Efg[] = [
  // ---- T1 tropical and subtropical forests ----
  { code: 'T1.1', zh: '热带低地雨林', group: 'T1', t: T(22, 30), m: M(0.78, 1), seasons: ['equatorial', 'monsoon'], struct: 'closed_forest', cover: 0.95, height: 40, trees: ['emergent', 'broadleaf', 'palm', 'tree_fern'], shrubs: ['shrub_round', 'fern'], herbs: ['fern', 'moss'], flowers: ['flower_tube'], veg: 'deepgreen', signature: ['板根巨树', '藤蔓垂帘', '林冠上的雾'], name: ['林', '莽', '翠'], weather: { rain: 0.8, fog: 0.3 } },
  { code: 'T1.2', zh: '热带干旱林与灌丛', group: 'T1', t: T(20, 30), m: M(0.35, 0.62), seasons: ['monsoon'], struct: 'open_forest', cover: 0.55, height: 15, trees: ['broadleaf_small', 'bottle', 'umbrella'], shrubs: ['shrub_thorn', 'shrub_round'], herbs: ['grass_tall'], flowers: ['flower_cluster'], veg: 'olive', signature: ['旱季落叶的林子', '开满红花的树'], name: ['林', '原'], weather: { dust: 0.2 } },
  { code: 'T1.3', zh: '热带山地云雾林', group: 'T1', t: T(7, 20), m: M(0.78, 1), needs: { mountain: true, cloud: true, tropical: true }, weight: 1.6, struct: 'closed_forest', cover: 0.9, height: 22, trees: ['broadleaf_small', 'tree_fern', 'bamboo'], shrubs: ['fern', 'shrub_round'], herbs: ['moss', 'fern', 'epiphyte'], flowers: ['flower_tube', 'flower_bell'], veg: 'teal', signature: ['满树苔藓和附生兰', '树蕨', '路上漫过的云'], name: ['雾', '云', '苔'], weather: { fog: 0.85, rain: 0.6 } },
  { code: 'T1.4', zh: '热带白沙石楠林', group: 'T1', t: T(22, 29), m: M(0.7, 0.95), needs: { rocks: ['quartz_sand', 'sandstone_pale'], tropical: true }, weight: 0.6, struct: 'open_forest', cover: 0.6, height: 14, trees: ['broadleaf_small', 'pine'], shrubs: ['shrub_heath', 'shrub_sclero'], herbs: ['sedge', 'moss'], flowers: ['flower_bell'], veg: 'olive', signature: ['白沙地上的矮林', '黑水溪'], name: ['林', '原', '溪'] },

  // ---- T2 temperate and boreal forests ----
  { code: 'T2.1', zh: '北方与山地针叶林', group: 'T2', t: T(-10, 6, 3), m: M(0.36, 0.95), g: [5.4, 6.4, 40, 41], needs: { extratropical: true }, struct: 'closed_forest', cover: 0.75, height: 25, trees: ['conifer_spire', 'larch', 'broadleaf_leader'], shrubs: ['shrub_heath', 'shrub_round'], herbs: ['moss', 'fern', 'lichen'], flowers: ['flower_bell'], veg: 'teal', signature: ['无边的尖塔针叶', '林间的湖', '雪压的枝'], name: ['杉', '松', '林'], weather: { snow: 0.5, fog: 0.2 } },
  { code: 'T2.2', zh: '温带落叶林', group: 'T2', t: T(5, 14), m: M(0.48, 0.85), seasons: ['continental', 'oceanic'], struct: 'closed_forest', cover: 0.8, height: 25, trees: ['broadleaf', 'broadleaf_leader', 'blossom'], shrubs: ['shrub_round', 'fern'], herbs: ['grass_meadow', 'fern'], flowers: ['flower_daisy', 'flower_bell', 'flower_cup'], veg: 'green', signature: ['秋天整山的红和金', '春天的花', '林荫隧道'], name: ['林', '岭', '荫'] },
  { code: 'T2.3', zh: '海洋性冷温带雨林', group: 'T2', t: T(5, 12), m: M(0.85, 1), seasons: ['oceanic'], struct: 'closed_forest', cover: 0.9, height: 45, trees: ['redwood', 'conifer_spire', 'broadleaf_small', 'tree_fern'], shrubs: ['fern', 'shrub_round'], herbs: ['moss', 'fern'], flowers: ['flower_bell'], veg: 'teal', signature: ['几人合抱的巨木', '垂满苔藓的枝', '林里的光柱'], name: ['苔', '雾', '巨木'], weather: { fog: 0.6, rain: 0.75 } },
  { code: 'T2.4', zh: '暖温带常绿阔叶林', group: 'T2', t: T(13, 20), m: M(0.65, 0.95), struct: 'closed_forest', cover: 0.85, height: 22, trees: ['laurel', 'bamboo', 'broadleaf'], shrubs: ['shrub_round', 'fern'], herbs: ['fern', 'moss'], flowers: ['flower_cluster', 'flower_bell'], veg: 'deepgreen', signature: ['常绿的樟楠', '竹林', '山间的茶'], name: ['樟', '翠', '篁'], weather: { fog: 0.35, rain: 0.5 } },
  { code: 'T2.5', zh: '温带火适应湿润林', group: 'T2', t: T(10, 18), m: M(0.6, 0.85), needs: { extratropical: true }, weight: 0.7, struct: 'open_forest', cover: 0.65, height: 45, trees: ['eucalypt', 'tree_fern'], shrubs: ['fern', 'shrub_sclero'], herbs: ['fern', 'grass_tussock'], flowers: ['flower_cluster'], veg: 'grey', signature: ['白干的高桉', '剥落的树皮', '林下的树蕨'], name: ['林', '谷'] },
  { code: 'T2.6', zh: '温带火适应硬叶林', group: 'T2', t: T(12, 20), m: M(0.38, 0.65), seasons: ['mediterranean'], struct: 'woodland', cover: 0.45, height: 18, trees: ['eucalypt', 'sclerophyll', 'pine'], shrubs: ['shrub_sclero', 'shrub_heath'], herbs: ['grass_tussock'], flowers: ['flower_cluster'], veg: 'olive', signature: ['火过后发芽的黑干', '硬叶灌丛'], name: ['岗', '丘'] },

  // ---- T3 shrublands ----
  { code: 'T3.1', zh: '季节干旱热带灌丛', group: 'T3', t: T(20, 30), m: M(0.25, 0.45), seasons: ['monsoon'], struct: 'shrubland', cover: 0.2, height: 5, trees: ['umbrella', 'succulent_tree'], shrubs: ['shrub_thorn', 'shrub_round'], herbs: ['grass_tall'], flowers: ['flower_cluster'], veg: 'olive', signature: ['刺灌丛', '红土路'], name: ['棘', '丛'] },
  { code: 'T3.2', zh: '地中海型硬叶灌丛', group: 'T3', t: T(12, 20), m: M(0.28, 0.58), seasons: ['mediterranean'], struct: 'shrubland', cover: 0.25, height: 6, trees: ['olive', 'cypress', 'pine_umbrella'], shrubs: ['shrub_sclero', 'shrub_sage', 'shrub_heath'], herbs: ['grass_meadow'], flowers: ['flower_spike', 'flower_cup', 'flower_cluster'], veg: 'olive', signature: ['芳香的灌丛', '石头山坡上的花', '伞松'], name: ['香', '岬', '丘'] },
  { code: 'T3.3', zh: '冷温带石楠灌丛', group: 'T3', t: T(4, 12), m: M(0.65, 1), seasons: ['oceanic'], struct: 'shrubland', cover: 0.05, height: 1, trees: ['broadleaf_leader', 'conifer_spire'], shrubs: ['shrub_heath'], herbs: ['grass_tussock', 'moss'], flowers: ['flower_bell'], veg: 'purple', signature: ['开满紫花的石楠坡', '雾里的荒原'], name: ['紫', '荒原', '雾'], weather: { fog: 0.5, wind: 0.5 } },
  { code: 'T3.4', zh: '岩石地、熔岩流与碎石坡', group: 'T3', t: T(-8, 30, 4), m: M(0, 1, 0), needs: { rocks: ['basalt', 'cinder', 'granite', 'schist', 'till'], landforms: ['lava_field', 'cinder_cones'] }, weight: 1.2, struct: 'bare', cover: 0.03, height: 2, trees: ['krummholz', 'snag'], shrubs: ['cushion'], herbs: ['lichen', 'moss'], flowers: ['flower_cup'], veg: 'grey', signature: ['刚冷却的熔岩', '石缝里的花', '碎石坡'], name: ['石', '岩', '焦'] },

  // ---- T4 savannas and grasslands ----
  { code: 'T4.1', zh: '营养型稀树草原', group: 'T4', t: T(20, 30), m: M(0.3, 0.55), seasons: ['monsoon'], struct: 'savanna', cover: 0.12, height: 10, trees: ['umbrella', 'bottle'], shrubs: ['shrub_thorn'], herbs: ['grass_tall', 'grass_meadow'], flowers: ['flower_daisy'], veg: 'gold', signature: ['平顶的金合欢', '齐膝的金草', '远处的石丘'], name: ['原', '金', '野'], weather: { dust: 0.15 } },
  { code: 'T4.2', zh: '火成型丛草稀树草原', group: 'T4', t: T(20, 30), m: M(0.45, 0.72), seasons: ['monsoon'], struct: 'savanna', cover: 0.2, height: 12, trees: ['broadleaf_small', 'palm_fan', 'umbrella'], shrubs: ['shrub_round'], herbs: ['grass_tall', 'grass_tussock'], flowers: ['flower_cluster'], veg: 'gold', signature: ['一人高的草', '散落的扇叶棕'], name: ['草海', '原'] },
  { code: 'T4.3', zh: '丘状草稀树草原', group: 'T4', t: T(20, 30), m: M(0.14, 0.34), struct: 'savanna', cover: 0.06, height: 8, trees: ['eucalypt', 'umbrella'], shrubs: ['shrub_round'], herbs: ['grass_hummock'], flowers: ['flower_daisy'], veg: 'gold', signature: ['一团团刺鬣草', '白蚁塔', '红土'], name: ['赤土', '丘'] },
  { code: 'T4.4', zh: '温带疏林', group: 'T4', t: T(8, 18), m: M(0.35, 0.62), struct: 'woodland', cover: 0.3, height: 16, trees: ['broadleaf', 'pine', 'juniper'], shrubs: ['shrub_round', 'shrub_sage'], herbs: ['grass_meadow', 'grass_tussock'], flowers: ['flower_daisy', 'flower_cup'], veg: 'olive', signature: ['草坡上一棵棵的老树'], name: ['坡', '野'] },
  { code: 'T4.5', zh: '温带半湿润草原', group: 'T4', t: T(-4, 14), m: M(0.3, 0.55), seasons: ['continental'], struct: 'grassland', cover: 0, height: 0, trees: ['broadleaf_leader'], shrubs: ['shrub_round'], herbs: ['grass_meadow', 'grass_tall'], flowers: ['flower_daisy', 'flower_spike', 'flower_umbel', 'flower_cup'], veg: 'fresh', signature: ['绿到天边的草原', '一整坡的野花', '大得吓人的天'], name: ['原', '野', '苍'], weather: { wind: 0.5 } },

  // ---- T5 deserts and semi-deserts ----
  { code: 'T5.1', zh: '半荒漠草原', group: 'T5', t: T(4, 18), m: M(0.15, 0.3), struct: 'grassland', cover: 0.01, height: 4, trees: ['juniper'], shrubs: ['shrub_sage'], herbs: ['grass_tussock'], flowers: ['flower_cup', 'flower_spike'], veg: 'grey', signature: ['灰绿的蒿草', '风里的草浪'], name: ['蒿', '原', '风'], weather: { wind: 0.5, dust: 0.25 } },
  { code: 'T5.2', zh: '多浆多刺荒漠', group: 'T5', t: T(16, 28), m: M(0.1, 0.28), struct: 'desert', cover: 0.04, height: 9, trees: ['cactus', 'succulent_tree'], shrubs: ['rosette', 'shrub_thorn', 'shrub_sage'], herbs: ['grass_tussock'], flowers: ['flower_cup', 'flower_spike'], veg: 'olive', signature: ['站满山坡的巨柱仙人掌', '雨后金色的罂粟'], name: ['仙', '刺', '谷'], weather: { dust: 0.2 } },
  { code: 'T5.3', zh: '硬叶热荒漠', group: 'T5', t: T(16, 28), m: M(0.08, 0.22), needs: { extratropical: true }, weight: 0.6, struct: 'desert', cover: 0.03, height: 6, trees: ['eucalypt', 'umbrella'], shrubs: ['shrub_sage', 'shrub_round'], herbs: ['grass_hummock'], flowers: ['flower_daisy'], veg: 'grey', signature: ['红沙上的灰绿灌丛', '地平线上的巨岩'], name: ['赤', '心'] },
  { code: 'T5.4', zh: '冷荒漠', group: 'T5', t: T(-6, 12), m: M(0.03, 0.2), seasons: ['continental', 'polar'], struct: 'desert', cover: 0, height: 0, trees: [], shrubs: ['shrub_sage', 'cushion'], herbs: ['grass_tussock'], flowers: ['flower_cup'], veg: 'grey', signature: ['戈壁上的风', '远处的雪山'], name: ['戈壁', '风', '漠'], weather: { wind: 0.7, dust: 0.4 } },
  { code: 'T5.5', zh: '极端干旱荒漠', group: 'T5', t: T(10, 32), m: M(0, 0.08, 0.04), struct: 'desert', cover: 0, height: 0, trees: ['snag'], shrubs: [], herbs: [], veg: 'none', signature: ['一棵草都没有的沙海', '海市蜃楼'], name: ['沙海', '漠', '旷'], weather: { dust: 0.5, wind: 0.5 } },

  // ---- T6 polar and alpine ----
  { code: 'T6.1', zh: '冰川与永久积雪', group: 'T6', t: T(-60, 2, 2), m: M(0.25, 1), summer: [-61, -60, -0.5, 0.5], struct: 'ice', cover: 0, height: 0, trees: [], shrubs: [], herbs: [], veg: 'white', signature: ['蓝色的冰舌', '冰川下的融水湖'], name: ['冰', '雪', '寒'], weather: { snow: 0.8, wind: 0.6 } },
  { code: 'T6.2', zh: '高寒裸岩', group: 'T6', t: T(-40, 6, 2), m: M(0, 1, 0), g: [-4.5, -3, 2, 3.5], needs: { mountain: true }, struct: 'bare', cover: 0, height: 0, trees: [], shrubs: ['cushion'], herbs: ['lichen'], veg: 'grey', signature: ['刀锋一样的山脊', '岩缝里的雪'], name: ['岩', '峰', '脊'], weather: { wind: 0.7, snow: 0.5 } },
  { code: 'T6.3', zh: '极地苔原与寒漠', group: 'T6', t: T(-40, 4, 2), m: M(0.04, 1), g: [-2.5, -1.5, 5.4, 6.4], seasons: ['polar', 'continental', 'oceanic'], needs: { extratropical: true, lowland: true }, struct: 'tundra', cover: 0, height: 0, trees: ['krummholz'], shrubs: ['shrub_heath', 'cushion'], herbs: ['moss', 'lichen', 'sedge'], flowers: ['flower_cup'], veg: 'autumn', signature: ['红褐色的苔原', '夜里的极光', '冻土上的小湖'], name: ['原', '烛', '冻'], weather: { snow: 0.5, wind: 0.6 } },
  { code: 'T6.4', zh: '温带高山草甸与灌丛', group: 'T6', t: T(-20, 8, 2), m: M(0.35, 1), g: [0, 1, 5.4, 6.4], needs: { alpine: true, extratropical: true }, struct: 'grassland', cover: 0.02, height: 3, trees: ['krummholz'], shrubs: ['shrub_heath', 'cushion'], herbs: ['grass_meadow', 'sedge'], flowers: ['flower_cup', 'flower_bell', 'flower_daisy', 'flower_spike'], veg: 'fresh', signature: ['林线以上的花海', '旗形的矮树', '旱獭的哨声'], name: ['甸', '梯', '花'], weather: { wind: 0.5 } },
  { code: 'T6.5', zh: '热带高山草地（帕拉莫）', group: 'T6', t: T(-5, 12, 2), m: M(0.45, 1), g: [0, 1, 6, 7.5], needs: { alpine: true, tropical: true }, weight: 1.5, struct: 'grassland', cover: 0.02, height: 4, trees: ['krummholz'], shrubs: ['rosette_giant', 'cushion', 'shrub_heath'], herbs: ['grass_tussock', 'moss'], flowers: ['flower_daisy', 'flower_tube'], veg: 'grey', signature: ['一株株巨大的银色莲座', '雾里的高山湖'], name: ['莲', '雾原', '天'], weather: { fog: 0.6, wind: 0.4 } },

  // ---- T7 intensive land use: fields and orchards gone wild ----
  { code: 'T7.1r', zh: '荒废的稻作梯田', group: 'T7', t: T(14, 28), m: M(0.7, 1), seasons: ['monsoon', 'equatorial'], weight: 0.5, struct: 'farmland', cover: 0.05, height: 10, trees: ['palm', 'bamboo', 'broadleaf'], shrubs: ['shrub_round'], herbs: ['crop_rice', 'sedge'], flowers: ['aquatic'], veg: 'fresh', signature: ['一层层灌满水的梯田', '水里倒映的天'], name: ['镜田', '梯', '禾'] },
  { code: 'T7.1w', zh: '荒废的麦田', group: 'T7', t: T(4, 16), m: M(0.3, 0.58), needs: { flat: true }, weight: 0.35, struct: 'farmland', cover: 0.02, height: 15, trees: ['broadleaf', 'broadleaf_leader'], shrubs: ['shrub_round'], herbs: ['crop_wheat', 'grass_meadow'], flowers: ['flower_cup', 'flower_daisy'], veg: 'gold', signature: ['金色的麦浪', '麦田里的虞美人', '路边一排白杨'], name: ['麦', '金', '圩'] },
  { code: 'T7.1v', zh: '荒废的葡萄园', group: 'T7', t: T(12, 20), m: M(0.3, 0.55), seasons: ['mediterranean'], weight: 0.35, struct: 'farmland', cover: 0.04, height: 12, trees: ['cypress', 'olive'], shrubs: ['shrub_sage'], herbs: ['crop_vine', 'grass_meadow'], flowers: ['flower_cup'], veg: 'olive', signature: ['一垄垄爬满坡的葡萄藤', '柏树领着的白土路'], name: ['柏', '丘', '藤'] },
  { code: 'T7.1t', zh: '荒废的茶园', group: 'T7', t: T(13, 22), m: M(0.68, 0.95), needs: { mountain: true }, weight: 0.4, struct: 'farmland', cover: 0.05, height: 10, trees: ['laurel', 'bamboo'], shrubs: ['shrub_round'], herbs: ['crop_tea', 'fern'], flowers: ['flower_bell'], veg: 'fresh', signature: ['一圈圈绕着山的茶垄', '茶山上的雾'], name: ['茶', '云山'], weather: { fog: 0.45 } },
  { code: 'T7.1l', zh: '荒废的薰衣草田', group: 'T7', t: T(10, 18), m: M(0.2, 0.45), seasons: ['mediterranean'], needs: { flat: true }, weight: 0.3, struct: 'farmland', cover: 0.01, height: 8, trees: ['broadleaf_small'], shrubs: ['crop_lavender'], herbs: ['crop_wheat', 'grass_meadow'], flowers: ['crop_sunflower'], veg: 'purple', signature: ['一垄垄铺到天边的紫', '旁边金色的麦和向日葵'], name: ['紫穗', '原'] },
  { code: 'T7.1f', zh: '荒废的花田', group: 'T7', t: T(6, 16), m: M(0.55, 0.85), needs: { flat: true }, weight: 0.3, struct: 'farmland', cover: 0.01, height: 10, trees: ['willow', 'broadleaf_leader'], shrubs: [], herbs: ['crop_tulip', 'crop_rape', 'grass_meadow'], flowers: ['flower_cup'], veg: 'blossom', signature: ['一条条颜色的花带', '运河边的风车'], name: ['花', '圩', '彩'] },
  { code: 'T7.2', zh: '荒废的牧场', group: 'T7', t: T(2, 18), m: M(0.45, 0.85), weight: 0.2, struct: 'grassland', cover: 0.08, height: 14, trees: ['broadleaf', 'broadleaf_leader'], shrubs: ['shrub_round'], herbs: ['grass_meadow'], flowers: ['flower_daisy', 'flower_umbel'], veg: 'fresh', signature: ['石墙围起来的绿坡', '坡上一棵孤树'], name: ['坡', '牧', '野'] },
  { code: 'T7.3', zh: '荒废的果园', group: 'T7', t: T(6, 22), m: M(0.4, 0.75), weight: 0.2, struct: 'farmland', cover: 0.25, height: 6, trees: ['orchard', 'blossom'], shrubs: ['shrub_round'], herbs: ['grass_meadow'], flowers: ['flower_daisy'], veg: 'blossom', signature: ['开满花的果树行', '树下落满的果子'], name: ['园', '花', '杏'] },

  // ---- F1 rivers and streams ----
  { code: 'F1.1', zh: '常流山溪', group: 'F1', t: T(-4, 26), m: M(0.45, 1), needs: { water: ['river'], mountain: true }, struct: 'water', cover: 0, height: 0, trees: [], shrubs: ['shrub_round'], herbs: ['moss', 'fern'], veg: 'none', signature: ['跌水和瀑布', '清水里的卵石'], name: ['溪', '涧', '瀑'] },
  { code: 'F1.2', zh: '常流平原河', group: 'F1', t: T(-2, 28), m: M(0.4, 1), needs: { water: ['river'] }, struct: 'water', cover: 0, height: 0, trees: ['willow', 'broadleaf_leader'], shrubs: ['reed'], herbs: ['sedge'], veg: 'none', signature: ['弯弯的河', '河边一线柳'], name: ['川', '河', '湾'] },
  { code: 'F1.3', zh: '冻融河', group: 'F1', t: T(-14, 0), m: M(0.2, 1), needs: { water: ['river'] }, struct: 'water', cover: 0, height: 0, trees: [], shrubs: ['shrub_heath'], herbs: ['sedge'], veg: 'none', signature: ['冰封的河', '浮冰'], name: ['冰川', '河'] },
  { code: 'F1.6', zh: '旱地偶发河', group: 'F1', t: T(10, 32), m: M(0, 0.3), needs: { water: ['river'] }, struct: 'water', cover: 0, height: 0, trees: ['willow', 'umbrella'], shrubs: ['reed', 'shrub_thorn'], herbs: ['grass_tussock'], veg: 'none', signature: ['干河床上一条绿带', '白色的砾石河床'], name: ['河谷', '绿洲'] },
  { code: 'F1.7', zh: '大河', group: 'F1', t: T(4, 30), m: M(0.3, 1), needs: { water: ['river'], flat: true }, weight: 0.6, struct: 'water', cover: 0, height: 0, trees: ['broadleaf', 'willow', 'palm'], shrubs: ['reed'], herbs: ['sedge'], veg: 'none', signature: ['宽得看不到对岸的褐色大河', '跨河的长桥'], name: ['江', '河'] },

  // ---- F2 lakes ----
  { code: 'F2.1', zh: '大淡水湖', group: 'F2', t: T(-4, 28), m: M(0.3, 1), needs: { water: ['lake'] }, struct: 'water', cover: 0, height: 0, trees: ['conifer_spire', 'broadleaf'], shrubs: ['reed'], herbs: ['sedge'], veg: 'none', signature: ['一望无际的湖', '湖心的岛'], name: ['湖', '海子'] },
  { code: 'F2.2', zh: '高山小湖', group: 'F2', t: T(-8, 14), m: M(0.3, 1), needs: { water: ['lake'], mountain: true }, struct: 'water', cover: 0, height: 0, trees: ['conifer_spire', 'larch'], shrubs: ['shrub_heath'], herbs: ['sedge', 'moss'], veg: 'none', signature: ['松石绿的冰湖', '倒映的雪峰'], name: ['碧湖', '镜', '池'] },
  { code: 'F2.4', zh: '冻融湖', group: 'F2', t: T(-20, -2), m: M(0.15, 1), needs: { water: ['lake'] }, struct: 'water', cover: 0, height: 0, trees: [], shrubs: ['shrub_heath'], herbs: ['sedge'], veg: 'none', signature: ['开在冰上的路', '冰下白色的裂纹'], name: ['镜冰', '冰湖'], weather: { snow: 0.4 } },
  { code: 'F2.6', zh: '常年盐湖与碱湖', group: 'F2', t: T(-4, 30), m: M(0.1, 0.35), needs: { water: ['salt', 'lake'] }, struct: 'water', cover: 0, height: 0, trees: [], shrubs: ['shrub_sage'], herbs: ['grass_tussock'], veg: 'none', signature: ['红色和绿色的盐湖', '湖边的火烈鸟'], name: ['彩湖', '碱湖'] },
  { code: 'F2.7', zh: '偶发盐湖（盐沼）', group: 'F2', t: T(0, 32), m: M(0, 0.22), needs: { water: ['salt'], flat: true }, struct: 'water', cover: 0, height: 0, trees: [], shrubs: [], herbs: [], veg: 'none', signature: ['雨后成镜的盐原', '盐壳上的六角形'], name: ['镜', '盐', '天镜'] },
  { code: 'F2.8', zh: '泉与绿洲', group: 'F2', t: T(12, 32), m: M(0, 0.35), needs: { water: ['oasis'] }, struct: 'water', cover: 0, height: 0, trees: ['palm', 'willow'], shrubs: ['reed'], herbs: ['grass_meadow'], veg: 'none', signature: ['沙漠里的一汪绿', '椰枣林'], name: ['泉', '绿洲'] },
  { code: 'F2.9', zh: '地热池与湿地', group: 'F2', t: T(-10, 26), m: M(0.2, 1), needs: { water: ['lake', 'wetland'], rocks: ['rhyolite', 'basalt', 'cinder'] }, weight: 0.6, struct: 'water', cover: 0, height: 0, trees: ['pine', 'conifer_spire'], shrubs: [], herbs: ['moss'], veg: 'none', signature: ['冒热气的彩色热泉', '喷向天的间歇泉'], name: ['沸泉', '汽'] },

  // ---- F3 water made by people ----
  { code: 'F3.3', zh: '水田', group: 'F3', t: T(14, 30), m: M(0.6, 1), needs: { water: ['wetland', 'river'], flat: true }, weight: 0.6, struct: 'farmland', cover: 0, height: 0, trees: ['palm', 'bamboo'], shrubs: [], herbs: ['crop_rice'], veg: 'fresh', signature: ['一块块水田映着天', '水牛'], name: ['田', '水乡'] },

  // ---- TF1 palustrine wetlands ----
  { code: 'TF1.1', zh: '热带淹没林与泥炭林', group: 'TF1', t: T(22, 30), m: M(0.75, 1), needs: { water: ['wetland', 'river'], tropical: true }, struct: 'closed_forest', cover: 0.8, height: 30, trees: ['broadleaf', 'palm', 'emergent'], shrubs: ['fern'], herbs: ['aquatic', 'fern'], veg: 'deepgreen', signature: ['泡在黑水里的树林', '水上的倒影'], name: ['泽', '林'] },
  { code: 'TF1.2', zh: '温带森林湿地', group: 'TF1', t: T(4, 20), m: M(0.6, 1), needs: { water: ['wetland', 'river'] }, struct: 'open_forest', cover: 0.55, height: 22, trees: ['cypress', 'willow', 'broadleaf'], shrubs: ['shrub_round', 'fern'], herbs: ['sedge', 'aquatic'], veg: 'green', signature: ['站在水里的落羽杉', '垂下的苔'], name: ['泽', '沼'] },
  { code: 'TF1.3', zh: '常年沼泽与芦苇荡', group: 'TF1', t: T(0, 30), m: M(0.5, 1), needs: { water: ['wetland'], flat: true }, struct: 'wetland', cover: 0.02, height: 6, trees: ['willow'], shrubs: ['reed'], herbs: ['reed', 'sedge', 'aquatic'], veg: 'gold', signature: ['一人高的芦苇海', '一齐飞起的白鹭'], name: ['苇', '泽', '荡'] },
  { code: 'TF1.4', zh: '季节洪泛沼泽', group: 'TF1', t: T(16, 30), m: M(0.4, 0.8), seasons: ['monsoon'], needs: { water: ['wetland', 'river'], flat: true }, struct: 'wetland', cover: 0.05, height: 10, trees: ['palm_fan', 'broadleaf_small'], shrubs: ['shrub_round'], herbs: ['grass_tall', 'aquatic'], veg: 'fresh', signature: ['淹没的草原', '水面上的树岛'], name: ['泽', '洪原'] },
  { code: 'TF1.6', zh: '泥炭藓沼泽', group: 'TF1', t: T(-4, 8), m: M(0.65, 1), needs: { water: ['wetland'] }, struct: 'wetland', cover: 0.04, height: 6, trees: ['conifer_spire', 'krummholz'], shrubs: ['shrub_heath'], herbs: ['moss', 'sedge'], flowers: ['flower_cup'], veg: 'autumn', signature: ['红绿相间的苔藓毯', '黑水小潭'], name: ['沼', '苔原'] },
  { code: 'TF1.7', zh: '碱沼（草本泥炭地）', group: 'TF1', t: T(-2, 12), m: M(0.55, 1), needs: { water: ['wetland', 'river'] }, struct: 'wetland', cover: 0.03, height: 8, trees: ['broadleaf_leader'], shrubs: ['shrub_round'], herbs: ['sedge', 'grass_tussock'], flowers: ['flower_spike', 'flower_umbel'], veg: 'fresh', signature: ['开着棉花草的湿草甸'], name: ['甸', '沼'] },

  // ---- MT shorelines ----
  { code: 'MT1.1', zh: '岩岸', group: 'MT', t: T(-6, 30), m: M(0, 1, 0), needs: { water: ['coast'], avoid: ['quartz_sand', 'coral_sand'] }, struct: 'bare', cover: 0, height: 0, trees: ['pine', 'cypress'], shrubs: ['shrub_heath', 'cushion'], herbs: ['lichen', 'grass_tussock'], flowers: ['flower_cup'], veg: 'none', signature: ['浪打在海崖上', '海蚀柱', '崖上的灯塔'], name: ['崖', '岬', '礁'], weather: { wind: 0.6, fog: 0.3 } },
  { code: 'MT1.2', zh: '泥岸滩涂', group: 'MT', t: T(0, 30), m: M(0.2, 1), needs: { water: ['coast'], flat: true }, weight: 0.6, struct: 'wetland', cover: 0, height: 0, trees: [], shrubs: ['reed'], herbs: ['sedge'], veg: 'none', signature: ['退潮后亮闪闪的滩涂', '涉禽'], name: ['滩', '潮'] },
  { code: 'MT1.3', zh: '沙岸', group: 'MT', t: T(-2, 30), m: M(0, 1, 0), needs: { water: ['coast'] }, struct: 'bare', cover: 0, height: 0, trees: ['palm', 'pine'], shrubs: ['shrub_round'], herbs: ['grass_tussock'], veg: 'none', signature: ['长长的沙滩', '海边的沙丘'], name: ['滩', '湾', '沙'] },
  { code: 'MT1.4', zh: '砾石岸', group: 'MT', t: T(-8, 20), m: M(0, 1, 0), needs: { water: ['coast'] }, weight: 0.5, struct: 'bare', cover: 0, height: 0, trees: [], shrubs: ['cushion'], herbs: ['lichen'], veg: 'none', signature: ['磨圆的黑色砾石', '搁浅的浮冰'], name: ['砾', '湾'] },
  { code: 'MT2.1', zh: '海岸灌丛与草地', group: 'MT', t: T(4, 26), m: M(0.2, 0.9), needs: { water: ['coast'] }, struct: 'shrubland', cover: 0.05, height: 4, trees: ['pine', 'cypress', 'umbrella'], shrubs: ['shrub_sclero', 'shrub_heath'], herbs: ['grass_tussock'], flowers: ['flower_cluster', 'flower_cup'], veg: 'olive', signature: ['海风吹弯的树', '开在崖顶的帝王花'], name: ['岬', '风'] },
  { code: 'MT2.2', zh: '海鸟与海兽聚居岸', group: 'MT', t: T(-10, 18), m: M(0.2, 1), needs: { water: ['coast'] }, weight: 0.3, struct: 'bare', cover: 0, height: 0, trees: [], shrubs: [], herbs: ['grass_tussock'], veg: 'none', signature: ['满崖的海鸟', '晒太阳的海豹'], name: ['鸟岛', '礁'] },

  // ---- MFT brackish tidal ----
  { code: 'MFT1.1', zh: '河口三角洲', group: 'MFT', t: T(0, 30), m: M(0.3, 1), needs: { water: ['coast', 'wetland', 'river'], flat: true, coastal: true }, weight: 0.6, struct: 'wetland', cover: 0.05, height: 8, trees: ['willow', 'palm'], shrubs: ['reed'], herbs: ['sedge', 'reed'], veg: 'fresh', signature: ['分成无数汊的河', '沙洲'], name: ['洲', '汊'] },
  { code: 'MFT1.2', zh: '红树林', group: 'MFT', t: T(22, 30), m: M(0.45, 1), needs: { water: ['coast', 'wetland'], tropical: true, coastal: true }, struct: 'closed_forest', cover: 0.85, height: 12, trees: ['mangrove'], shrubs: [], herbs: [], veg: 'deepgreen', signature: ['支柱根插进潮水', '一齐飞起的白鹭'], name: ['潮', '红树', '径'] },
  { code: 'MFT1.3', zh: '海岸盐沼与芦苇荡', group: 'MFT', t: T(-2, 24), m: M(0.3, 1), needs: { water: ['coast', 'wetland'], extratropical: true, coastal: true }, struct: 'wetland', cover: 0, height: 0, trees: [], shrubs: ['reed'], herbs: ['sedge', 'reed'], flowers: ['flower_spike'], veg: 'autumn', signature: ['红色的盐地碱蓬', '潮沟'], name: ['碱', '滩'] },

  // ---- FM semi-confined transitional waters ----
  { code: 'FM1.1', zh: '峡湾', group: 'FM', t: T(-6, 14), m: M(0.5, 1), needs: { water: ['coast'], mountain: true, extratropical: true }, weight: 1.4, struct: 'water', cover: 0, height: 0, trees: ['conifer_spire', 'broadleaf_leader'], shrubs: ['shrub_heath'], herbs: ['moss'], veg: 'none', signature: ['直插海里的雪峰', '岩壁上的七条瀑布'], name: ['峡湾', '银瀑'] },
  { code: 'FM1.2', zh: '河口海湾', group: 'FM', t: T(0, 30), m: M(0.3, 1), needs: { water: ['coast'] }, weight: 0.5, struct: 'water', cover: 0, height: 0, trees: ['broadleaf'], shrubs: ['reed'], herbs: ['sedge'], veg: 'none', signature: ['海湾里的岛', '跨海的桥'], name: ['湾', '港'] },
  { code: 'FM1.3', zh: '潟湖', group: 'FM', t: T(4, 30), m: M(0.1, 1), needs: { water: ['coast'], flat: true }, weight: 0.6, struct: 'water', cover: 0, height: 0, trees: ['palm', 'pine_umbrella'], shrubs: ['shrub_round'], herbs: ['grass_tussock'], veg: 'none', signature: ['沙坝后面平静的水', '水上的高脚屋'], name: ['潟', '湖'] },

  // ---- M marine, as seen from the shore and the bridges ----
  { code: 'M1.3', zh: '珊瑚礁浅海', group: 'M', t: T(22, 30), m: M(0, 1, 0), needs: { water: ['coast'], tropical: true }, struct: 'water', cover: 0, height: 0, trees: ['palm'], shrubs: [], herbs: [], veg: 'none', signature: ['齐膝深的碧水', '贴着水面的长桥'], name: ['碧', '珊瑚', '礁'] },
  { code: 'M1.2', zh: '海藻林海岸', group: 'M', t: T(6, 18), m: M(0, 1, 0), needs: { water: ['coast'], extratropical: true }, weight: 0.4, struct: 'water', cover: 0, height: 0, trees: ['cypress', 'pine'], shrubs: [], herbs: [], veg: 'none', signature: ['岸边金褐色的海藻林', '海獭'], name: ['藻', '湾'] },
];

export const efgByCode = new Map(EFGS.map((e) => [e.code, e]));

export function efg(code: string): Efg {
  const e = efgByCode.get(code);
  if (!e) throw new Error(`earth: no ecosystem ${code}`);
  return e;
}

/** the land's own ecosystems (those that cover the ground), and the waters' (those a water brings) */
export const LAND_EFGS = EFGS.filter((e) => e.group.startsWith('T') && !e.group.startsWith('TF'));
export const WATER_EFGS = EFGS.filter((e) => !LAND_EFGS.includes(e));
