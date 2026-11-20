/**
 * The fifty scenic roads as the journey deals them (docs/V3/research/scenic-50.md): for each, what the shuffle and
 * the joins between two of them need to know — its band of climate, the look-alike families it belongs to, its
 * warmth, wetness and height in its best season, that season's month, the thresholds it can be entered and left by,
 * and whether it makes a gentle start or has a show at night or at dawn. And the six quiet stretches (the regions
 * there were before the fifty) that stand between two of them.
 *
 * Provisional: the list waits for the player's approval (approval A, docs/V3/STATUS.md); whatever is changed there
 * is changed here, the shuffle (journey.ts) reads only these cards.
 *
 * Data only, DOM-free.
 */

export type Band = 'polar' | 'mountain' | 'plateau' | 'temperate' | 'eastasia' | 'coast' | 'desert' | 'grass_tropic';

/** what stands between two worlds apart and hides the change: the land and the weather's thresholds */
export type Threshold = 'tunnel' | 'pass' | 'fog' | 'dust' | 'blizzard' | 'rain' | 'bridge';

export interface SceneCard {
  /** its number in the list (1 … 50) and its key */
  no: number;
  id: string;
  /** its made-up name, and the line under it */
  name: string;
  tag: string;
  band: Band;
  /** the families of look-alikes it belongs to (two of a family are never dealt close together) */
  families: readonly string[];
  /** the middle of a day's warmth in its season (°C), how wet (0 arid … 1 wet), how high (0 the sea … 1 the high plateau) */
  temp: number;
  wet: number;
  alt: number;
  /** its best month (1 … 12): the season it is fixed in */
  month: number;
  /** the thresholds it can be entered and left by; `ecotone`: it also blends into a near neighbour */
  doors: readonly Threshold[];
  ecotone?: boolean;
  /** a gentle start (for a new journey's first stretch) */
  gentle?: boolean;
  /** a show at night (an aurora, the stars) or at dawn (balloons, mirror terraces, steaming vents) */
  night?: boolean;
  dawn?: boolean;
  /** the region there already was that it grows from (docs/V3/research/scenic-50.md §6) */
  region?: string;
}

const s = (no: number, id: string, name: string, tag: string, band: Band, families: string[], temp: number, wet: number, alt: number, month: number, doors: Threshold[], more: Partial<SceneCard> = {}): SceneCard => ({ no, id, name, tag, band, families, temp, wet, alt, month, doors, ...more });

export const SCENES: readonly SceneCard[] = [
  // A polar and cold
  s(1, 'aurora_tundra', '北烛原', '极光冻原', 'polar', ['ice'], 3.5, 0.5, 0.3, 9, ['blizzard', 'pass', 'fog'], { night: true }),
  s(2, 'ice_sea_isles', '渔灯群岛', '冰海群岛', 'polar', ['norway'], 0.5, 0.6, 0.2, 3, ['bridge', 'tunnel', 'blizzard'], { night: true }),
  s(3, 'black_sand_glacier', '黑砂湾', '黑沙冰河岸', 'polar', [], 11, 0.7, 0.1, 8, ['fog', 'bridge', 'blizzard']),
  s(4, 'rainbow_rhyolite', '彩岚岭', '流纹岩彩山', 'polar', [], 8, 0.5, 0.5, 8, ['pass', 'fog', 'blizzard']),
  s(5, 'frozen_mirror_lake', '镜冰湖', '冰上公路', 'polar', ['ice'], -15, 0.3, 0.3, 2, ['blizzard', 'fog']),
  s(6, 'snow_veil_taiga', '霜林', '雪幕针叶林', 'polar', ['ice'], -18, 0.4, 0.3, 1, ['blizzard', 'tunnel', 'fog']),
  // B cold-temperate mountains
  s(7, 'icefield_avenue', '蓝川道', '冰原大道', 'mountain', ['plateau_lake'], 12.5, 0.6, 0.6, 7, ['tunnel', 'pass', 'fog']),
  s(8, 'fjord_waterfalls', '银瀑峡湾', '峡湾瀑布梯', 'mountain', ['norway', 'hairpins'], 13, 0.8, 0.5, 6, ['tunnel', 'pass', 'fog']),
  s(9, 'hairpin_pass', '云梯垭口', '千回发夹弯', 'mountain', ['hairpins'], 8.5, 0.5, 0.8, 7, ['pass', 'tunnel', 'fog']),
  s(10, 'pale_spires', '粉峰', '白云岩尖塔', 'mountain', [], 8, 0.5, 0.7, 10, ['pass', 'tunnel']),
  s(11, 'heather_glen', '紫雾谷', '高地石楠谷', 'mountain', [], 13.5, 0.8, 0.4, 8, ['fog', 'pass']),
  s(12, 'geyser_basin', '沸泉原', '地热间歇泉', 'mountain', [], 10, 0.4, 0.6, 9, ['fog', 'pass', 'tunnel'], { dawn: true }),
  // C high plateaus and mountains
  s(13, 'sky_grassland', '天马原', '天山草原雪峰', 'plateau', [], 13.5, 0.5, 0.6, 7, ['pass', 'tunnel', 'fog']),
  s(14, 'prayer_flag_plateau', '风旗原', '经幡高原', 'plateau', ['plateau_lake'], 6.5, 0.25, 1, 9, ['pass', 'blizzard']),
  s(15, 'apricot_gorge', '杏花峡', '雪山峡谷杏花村', 'plateau', [], 11.5, 0.2, 0.7, 4, ['tunnel', 'pass', 'dust']),
  s(16, 'jewel_lagoons', '七彩湖链', '高原彩湖', 'plateau', ['plateau_lake'], -2.5, 0.1, 1, 6, ['pass', 'dust', 'fog'], { dawn: true }),
  s(17, 'sky_mirror_salt', '天镜盐原', '盐沼之镜', 'plateau', [], 11.5, 0.3, 0.9, 2, ['dust', 'fog', 'rain']),
  s(18, 'cloud_cliff_road', '云崖道', '云雾悬崖路', 'plateau', ['wet_forest'], 18, 0.95, 0.6, 6, ['fog', 'rain', 'tunnel']),
  s(19, 'wind_towers', '风塔原', '巴塔哥尼亚风原', 'plateau', [], 11.5, 0.35, 0.4, 12, ['pass', 'fog', 'dust']),
  // D temperate forests and farmland
  s(20, 'giant_fog_forest', '巨杉雾谷', '巨木雾林', 'temperate', ['wet_forest'], 15, 0.8, 0.2, 6, ['fog', 'tunnel'], { ecotone: true, gentle: true }),
  s(21, 'moss_rainforest', '苔谷', '苔藓雨林', 'temperate', ['wet_forest'], 9.5, 0.95, 0.3, 4, ['fog', 'tunnel', 'rain'], { ecotone: true }),
  s(22, 'maple_fire_ridges', '焰岭', '枫火山岭', 'temperate', [], 9, 0.6, 0.35, 10, ['tunnel', 'fog'], { ecotone: true, gentle: true, region: 'maple' }),
  s(23, 'cherry_tunnel', '樱川', '樱花隧道', 'temperate', [], 11, 0.6, 0.2, 4, ['tunnel', 'fog'], { ecotone: true, gentle: true }),
  s(24, 'cypress_hills', '柏影丘', '柏树丘陵', 'temperate', [], 16.5, 0.4, 0.25, 5, ['fog'], { ecotone: true, gentle: true }),
  s(25, 'lavender_plateau', '紫穗原', '薰衣草高原', 'temperate', ['flower'], 23, 0.2, 0.4, 7, ['pass'], { ecotone: true, gentle: true }),
  s(26, 'windmill_tulips', '风车圩', '风车花田', 'temperate', ['flower'], 10, 0.7, 0, 4, ['bridge', 'fog'], { ecotone: true, gentle: true }),
  s(27, 'lupin_star_lake', '星湖', '鲁冰花星空湖', 'temperate', ['flower'], 12.5, 0.35, 0.5, 12, ['pass', 'fog'], { night: true }),
  s(28, 'balloon_chimneys', '烟囱谷', '奇石热气球谷', 'temperate', [], 16, 0.25, 0.5, 5, ['pass', 'tunnel', 'dust'], { dawn: true }),
  // E East Asian landscapes
  s(29, 'mirror_terraces', '镜田', '梯田镜湖', 'eastasia', [], 11, 0.8, 0.5, 2, ['fog', 'tunnel'], { dawn: true, region: 'terraces' }),
  s(30, 'bamboo_sea', '翠篁岭', '竹海', 'eastasia', [], 17, 0.8, 0.3, 4, ['fog', 'tunnel'], { ecotone: true, gentle: true, region: 'bamboo_sea' }),
  s(31, 'karst_river', '漓峰', '峰林江流', 'eastasia', [], 24, 0.8, 0.1, 5, ['fog', 'rain'], { ecotone: true, gentle: true, region: 'karst_peaks' }),
  s(32, 'floating_pillars', '悬柱山', '悬浮石柱山', 'eastasia', ['hairpins'], 23, 0.8, 0.6, 6, ['fog', 'tunnel']),
  // F coasts and islands
  s(33, 'fog_cliff_coast', '雾崖岸', '海崖雾岸', 'coast', ['sea_cliff'], 16, 0.5, 0.3, 8, ['fog', 'bridge', 'tunnel'], { gentle: true }),
  s(34, 'lemon_cliffs', '柠檬崖', '柠檬悬崖小镇', 'coast', ['sea_cliff'], 19, 0.4, 0.3, 5, ['tunnel'], { ecotone: true, gentle: true }),
  s(35, 'fynbos_cape', '花岬', '海角花灌丛', 'coast', ['sea_cliff'], 14.5, 0.45, 0.3, 9, ['tunnel', 'fog', 'pass']),
  s(36, 'coral_bridges', '珊瑚长桥', '海上长桥', 'coast', [], 23.5, 0.6, 0, 3, ['bridge', 'rain']),
  s(37, 'volcano_garden', '火山花园', '熔岩雨林海岸', 'coast', ['wet_forest'], 23.5, 0.9, 0.2, 11, ['rain', 'fog', 'tunnel']),
  s(38, 'mangrove_tide', '红树潮径', '红树林潮间路', 'coast', [], 23, 0.9, 0, 7, ['rain', 'bridge'], { ecotone: true }),
  // G deserts
  s(39, 'red_monuments', '赤碑原', '红岩巨碑', 'desert', ['red_desert'], 13.5, 0.1, 0.5, 10, ['dust', 'pass', 'tunnel'], { region: 'red_canyon' }),
  s(40, 'rainbow_hills', '彩丘', '彩虹丹霞', 'desert', ['red_desert'], 16, 0.1, 0.5, 9, ['dust', 'pass']),
  s(41, 'red_dune_sea', '赤沙海', '红沙丘海', 'desert', ['red_desert'], 15, 0.05, 0.2, 6, ['dust', 'fog']),
  s(42, 'kasbah_oasis', '椰影峡', '绿洲峡谷土堡', 'desert', ['red_desert'], 15, 0.15, 0.5, 3, ['pass', 'dust', 'tunnel']),
  s(43, 'saguaro_valley', '柱仙谷', '巨柱仙人掌荒原', 'desert', [], 18, 0.15, 0.3, 3, ['dust', 'pass'], { region: 'desert' }),
  s(44, 'red_outback', '赤土心', '红土内陆巨岩', 'desert', ['red_desert'], 15, 0.1, 0.2, 8, ['dust', 'rain']),
  s(45, 'wind_city_yardangs', '风城', '风蚀雅丹', 'desert', [], 10, 0.05, 0.4, 10, ['dust']),
  s(46, 'dragon_blood_plateau', '龙血台', '龙血树高原', 'desert', [], 23, 0.15, 0.4, 2, ['pass', 'dust', 'fog']),
  // H grassland and tropics
  s(47, 'baobab_avenue', '瓶树道', '猴面包树大道', 'grass_tropic', [], 22.5, 0.3, 0.1, 7, ['dust', 'rain'], { ecotone: true }),
  s(48, 'acacia_savanna', '金合欢原', '稀树草原', 'grass_tropic', [], 21, 0.3, 0.4, 7, ['dust'], { ecotone: true }),
  s(49, 'endless_steppe', '苍穹原', '无边草原', 'grass_tropic', [], 19, 0.35, 0.4, 7, ['dust', 'rain'], { ecotone: true, gentle: true }),
  s(50, 'red_earth_rainforest', '红土雨林', '热带雨林红土路', 'grass_tropic', ['wet_forest'], 28, 1, 0.1, 9, ['rain', 'bridge', 'fog']),
];

/** a quiet stretch between two of the fifty: one of the regions there were before them, and its climate */
export interface BufferCard {
  id: string;
  name: string;
  temp: number;
  wet: number;
  alt: number;
}

export const BUFFERS: readonly BufferCard[] = [
  { id: 'plains', name: '草原', temp: 16, wet: 0.5, alt: 0.2 },
  { id: 'forest', name: '森林', temp: 13, wet: 0.6, alt: 0.3 },
  { id: 'alpine', name: '雪山', temp: 6, wet: 0.5, alt: 0.8 },
  { id: 'lakes', name: '湖区', temp: 12, wet: 0.65, alt: 0.4 },
  { id: 'wetland', name: '湿地', temp: 18, wet: 0.85, alt: 0 },
  { id: 'flower_fields', name: '花田', temp: 18, wet: 0.45, alt: 0.2 },
];

export const sceneById = new Map(SCENES.map((c) => [c.id, c]));
