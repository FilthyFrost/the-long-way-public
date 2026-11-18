/**
 * The ninety kinds of fish (docs/V3/CATALOG.md "鱼", docs/V3/nodes/F1-fishing.md): one row each. A row says
 * which water it lives in and where in it, when it feeds, what it takes (a diet archetype), how shy of the
 * line it is, how it fights and how big it grows. What the generator's waters hold today are the first seven
 * classes (67 kinds); the rest wait for their regions.
 *
 * The numbers hang together like this: common fish are small and many, the rare are large or shy; a kind's
 * usual weight is what a patient hour brings, its largest what a lucky season does; food per portion runs
 * from 10 (bony small fry) to 14 (trout, sea fish), cooked it is worth twice that (node C1).
 *
 * To add a kind: add a row at the end of its water's block; the catalogue test counts the rows.
 */
import type { Rarity } from '../contracts/base';
import type { Diet, Fight, FishKind, Hours, Layer, WaterClass } from './types';

const ALL: FishKind[] = [];

const RAR: Readonly<Record<string, Rarity>> = { c: 'common', u: 'uncommon', r: 'rare', L: 'legendary' };
const LAY: Readonly<Record<string, Layer>> = { t: 'top', m: 'mid', b: 'bottom' };
const HRS: Readonly<Record<string, Hours>> = { d: 'day', e: 'edge', n: 'night', a: 'any' };

/**
 * A row: id, names, water, layer (t top, m mid, b bottom), rarity (c, u, r, L), hours (d day, e dawn and
 * dusk, n night, a any), diet, how wary (0 … 1), how it fights, weight (smallest, usual, largest; kg).
 */
function S(id: string, zh: string, en: string, water: WaterClass, layer: string, rarity: string, hours: string, diet: Diet, wary: number, fight: Fight, kg: readonly [number, number, number], o: { weather?: -1 | 0 | 1; food?: number; ice?: boolean; cls?: 'shellfish' | 'poultry' } = {}): void {
  ALL.push({
    id,
    name: { zh, en },
    water,
    ...(o.ice ? { ice: true } : {}),
    layer: LAY[layer],
    rarity: RAR[rarity],
    hours: HRS[hours],
    weather: o.weather ?? 0,
    diet,
    wary,
    fight,
    kg,
    food: o.food ?? 12,
    ...(o.cls ? { cls: o.cls } : {}),
  });
}

// ------------------------------------------------------------------ ponds and roadside lakes (12)
S('bleak', '白条', 'Bleak', 'pond', 't', 'c', 'd', 'panfish', 0.1, 'steady', [0.02, 0.05, 0.15], { food: 10 });
S('crucian_carp', '鲫鱼', 'Crucian carp', 'pond', 'b', 'c', 'a', 'carp', 0.2, 'steady', [0.1, 0.3, 1.5], { food: 11 });
S('carp', '鲤鱼', 'Carp', 'pond', 'b', 'c', 'e', 'carp', 0.4, 'brute', [0.5, 2.5, 18]);
S('grass_carp', '草鱼', 'Grass carp', 'pond', 'm', 'u', 'd', 'grazer', 0.5, 'runner', [1, 4, 25]);
S('silver_carp', '鲢鱼', 'Silver carp', 'pond', 't', 'u', 'd', 'grazer', 0.4, 'jumper', [1, 3, 20], { food: 11 });
S('tilapia', '罗非鱼', 'Tilapia', 'pond', 'm', 'c', 'd', 'panfish', 0.2, 'steady', [0.2, 0.6, 3]);
S('bluegill', '蓝鳃太阳鱼', 'Bluegill', 'pond', 'm', 'c', 'd', 'panfish', 0.1, 'steady', [0.05, 0.2, 1], { food: 11 });
S('yellow_perch', '黄鲈', 'Yellow perch', 'pond', 'm', 'c', 'd', 'panfish', 0.2, 'steady', [0.08, 0.25, 1.2]);
S('largemouth_bass', '大口黑鲈', 'Largemouth bass', 'pond', 'm', 'u', 'e', 'predator', 0.4, 'jumper', [0.3, 1.2, 7], { food: 13 });
S('catfish', '鲶鱼', 'Catfish', 'pond', 'b', 'u', 'n', 'catfish', 0.2, 'brute', [0.5, 2, 15], { weather: 1 });
S('loach', '泥鳅', 'Loach', 'pond', 'b', 'c', 'a', 'panfish', 0.1, 'steady', [0.01, 0.04, 0.12], { food: 10, weather: 1 });
S('crayfish', '小龙虾', 'Crayfish', 'pond', 'b', 'c', 'n', 'crustacean', 0.1, 'steady', [0.02, 0.05, 0.15], { food: 10, cls: 'shellfish' });
// ------------------------------------------------------------------ big lakes and reservoirs (10)
S('zander', '梭鲈', 'Zander', 'lake', 'b', 'u', 'e', 'predator', 0.6, 'diver', [0.5, 2, 10], { food: 14 });
S('pike', '狗鱼', 'Pike', 'lake', 'm', 'u', 'd', 'predator', 0.3, 'runner', [0.8, 3, 18]);
S('lake_trout', '湖鳟', 'Lake trout', 'lake', 'b', 'u', 'e', 'trout', 0.6, 'diver', [0.8, 3, 20], { food: 14 });
S('whitefish', '白鲑', 'Whitefish', 'lake', 'm', 'c', 'd', 'trout', 0.5, 'steady', [0.3, 1, 5], { food: 13 });
S('mandarin_fish', '鳜鱼', 'Mandarin fish', 'lake', 'b', 'r', 'n', 'predator', 0.7, 'diver', [0.3, 1, 6], { food: 14 });
S('culter', '翘嘴', 'Topmouth culter', 'lake', 't', 'u', 'e', 'predator', 0.6, 'jumper', [0.4, 1.5, 9]);
S('sturgeon', '鲟鱼', 'Sturgeon', 'lake', 'b', 'r', 'n', 'catfish', 0.5, 'brute', [3, 15, 90], { food: 14 });
S('burbot', '江鳕', 'Burbot', 'lake', 'b', 'u', 'n', 'catfish', 0.3, 'steady', [0.4, 1.5, 8], { food: 13 });
S('wels', '大鲶', 'Wels catfish', 'lake', 'b', 'r', 'n', 'catfish', 0.3, 'brute', [3, 15, 80], { weather: 1 });
S('lake_king', '湖王', 'The Lake King', 'lake', 'b', 'L', 'e', 'predator', 0.9, 'brute', [20, 35, 60], { food: 14 });
// ------------------------------------------------------------------ rivers and their bends (10)
S('brook_trout', '溪鳟', 'Brook trout', 'river', 'm', 'c', 'e', 'trout', 0.6, 'runner', [0.1, 0.4, 2.5], { food: 14 });
S('rainbow_trout', '虹鳟', 'Rainbow trout', 'river', 'm', 'c', 'd', 'trout', 0.5, 'jumper', [0.2, 0.8, 6], { food: 14 });
S('brown_trout', '褐鳟', 'Brown trout', 'river', 'm', 'u', 'e', 'trout', 0.8, 'runner', [0.2, 0.9, 8], { food: 14 });
S('grayling', '茴鱼', 'Grayling', 'river', 't', 'u', 'd', 'trout', 0.7, 'steady', [0.15, 0.5, 2], { food: 13 });
S('smallmouth_bass', '小口黑鲈', 'Smallmouth bass', 'river', 'm', 'u', 'd', 'predator', 0.4, 'jumper', [0.2, 0.8, 4], { food: 13 });
S('chub', '马口鱼', 'Chub', 'river', 't', 'c', 'd', 'panfish', 0.3, 'steady', [0.03, 0.1, 0.4], { food: 10 });
S('mud_carp', '鲮鱼', 'Mud carp', 'river', 'b', 'c', 'a', 'carp', 0.3, 'steady', [0.2, 0.6, 2.5], { food: 11 });
S('eel', '鳗鱼', 'Eel', 'river', 'b', 'u', 'n', 'eel', 0.3, 'diver', [0.2, 0.8, 4], { food: 14 });
S('rain_eel', '雨后鳗', 'Rain eel', 'river', 'b', 'r', 'n', 'eel', 0.4, 'diver', [0.5, 1.5, 5], { food: 14, weather: 1 });
S('taimen', '哲罗鲑', 'Taimen', 'river', 'm', 'L', 'e', 'predator', 0.9, 'runner', [8, 18, 45], { food: 14 });
// ------------------------------------------------------------------ mountain streams and tarns (6)
S('alpine_trout', '高山鳟', 'Alpine trout', 'tarn', 'm', 'c', 'd', 'trout', 0.6, 'runner', [0.1, 0.3, 2], { food: 14 });
S('char', '红点鲑', 'Char', 'tarn', 'b', 'u', 'e', 'trout', 0.6, 'diver', [0.2, 0.7, 5], { food: 14 });
S('golden_trout', '金鳟', 'Golden trout', 'tarn', 't', 'r', 'e', 'trout', 0.9, 'jumper', [0.1, 0.3, 2.5], { food: 14 });
S('lenok', '细鳞鱼', 'Lenok', 'tarn', 'm', 'u', 'd', 'trout', 0.7, 'runner', [0.2, 0.8, 5], { food: 14 });
S('sculpin', '杜父鱼', 'Sculpin', 'tarn', 'b', 'c', 'a', 'panfish', 0.1, 'steady', [0.01, 0.04, 0.15], { food: 10 });
S('tarn_king', '冰蚀湖王', 'The Tarn King', 'tarn', 'b', 'L', 'e', 'trout', 0.95, 'diver', [6, 12, 25], { food: 14 });
// ------------------------------------------------------------------ marshes and oxbows (7)
S('snakehead', '黑鱼', 'Snakehead', 'marsh', 't', 'u', 'd', 'predator', 0.3, 'brute', [0.4, 1.8, 9], { food: 13 });
S('bowfin', '弓鳍鱼', 'Bowfin', 'marsh', 'b', 'u', 'e', 'predator', 0.2, 'brute', [0.5, 2, 8], { food: 11 });
S('gar', '雀鳝', 'Gar', 'marsh', 't', 'r', 'd', 'predator', 0.5, 'jumper', [1, 4, 30], { food: 11 });
S('swamp_eel', '黄鳝', 'Swamp eel', 'marsh', 'b', 'c', 'n', 'eel', 0.2, 'diver', [0.05, 0.2, 1], { food: 13, weather: 1 });
S('sleeper', '塘鳢', 'Sleeper goby', 'marsh', 'b', 'c', 'a', 'panfish', 0.1, 'steady', [0.02, 0.08, 0.3], { food: 11 });
S('bullfrog', '牛蛙', 'Bullfrog', 'marsh', 't', 'c', 'n', 'panfish', 0.2, 'jumper', [0.1, 0.3, 0.8], { food: 12, cls: 'poultry', weather: 1 });
S('marsh_catfish', '沼泽老鲶', 'The Old Marsh Catfish', 'marsh', 'b', 'L', 'n', 'catfish', 0.8, 'brute', [15, 30, 70], { weather: 1 });
// ------------------------------------------------------------------ oases and salt lakes (3)
S('oasis_barb', '绿洲鲃', 'Oasis barb', 'oasis', 'm', 'c', 'e', 'panfish', 0.4, 'steady', [0.05, 0.2, 1], { food: 11 });
S('sand_loach', '沙鳅', 'Sand loach', 'oasis', 'b', 'c', 'a', 'panfish', 0.2, 'steady', [0.01, 0.03, 0.1], { food: 10 });
S('salt_killifish', '盐湖鳉', 'Salt-lake killifish', 'oasis', 't', 'u', 'd', 'panfish', 0.5, 'steady', [0.005, 0.01, 0.03], { food: 10 });
// ------------------------------------------------------------------ through the ice (5)
S('ice_salmon', '冰下鲑', 'Ice salmon', 'tarn', 'm', 'u', 'd', 'ice', 0.5, 'runner', [0.5, 2, 9], { food: 14, ice: true });
S('arctic_char', '北极红点鲑', 'Arctic char', 'tarn', 'b', 'u', 'e', 'ice', 0.6, 'diver', [0.3, 1.2, 8], { food: 14, ice: true });
S('smelt', '胡瓜鱼', 'Smelt', 'tarn', 'm', 'c', 'a', 'ice', 0.1, 'steady', [0.01, 0.04, 0.15], { food: 10, ice: true });
S('ice_whitefish', '冰下白鲑', 'Ice whitefish', 'tarn', 'b', 'c', 'd', 'ice', 0.4, 'steady', [0.3, 1, 4], { food: 13, ice: true });
S('ice_king', '冰湖王', 'The Ice King', 'tarn', 'b', 'L', 'e', 'ice', 0.9, 'brute', [8, 15, 30], { food: 14, ice: true });
// ------------------------------------------------------------------ hot springs and crater lakes (3)
S('hotspring_fish', '温泉鱼', 'Hot-spring fish', 'hotspring', 'm', 'c', 'a', 'panfish', 0.2, 'steady', [0.005, 0.02, 0.05], { food: 10 });
S('sulphur_killifish', '硫磺鳉', 'Sulphur killifish', 'hotspring', 't', 'u', 'd', 'panfish', 0.4, 'steady', [0.005, 0.01, 0.03], { food: 10 });
S('crater_trout', '火口鳟', 'Crater trout', 'hotspring', 'b', 'r', 'e', 'trout', 0.8, 'diver', [0.3, 1, 5], { food: 14 });
// ------------------------------------------------------------------ the coast and its piers (14)
S('mackerel', '鲭鱼', 'Mackerel', 'sea', 't', 'c', 'd', 'pelagic', 0.2, 'runner', [0.2, 0.5, 2], { food: 14 });
S('sardine', '沙丁鱼', 'Sardine', 'sea', 't', 'c', 'd', 'panfish', 0.1, 'steady', [0.02, 0.06, 0.2], { food: 11 });
S('sea_bass', '海鲈', 'Sea bass', 'sea', 'm', 'u', 'e', 'pelagic', 0.5, 'runner', [0.5, 2, 10], { food: 14 });
S('sea_bream', '鲷鱼', 'Sea bream', 'sea', 'b', 'u', 'd', 'seabed', 0.6, 'diver', [0.3, 1, 6], { food: 14 });
S('flounder', '比目鱼', 'Flounder', 'sea', 'b', 'c', 'a', 'seabed', 0.3, 'steady', [0.3, 1, 6], { food: 13 });
S('cod', '鳕鱼', 'Cod', 'sea', 'b', 'u', 'd', 'seabed', 0.3, 'diver', [0.8, 3, 25], { food: 14 });
S('grouper', '石斑', 'Grouper', 'sea', 'b', 'r', 'e', 'seabed', 0.5, 'diver', [0.8, 3, 30], { food: 14 });
S('conger', '海鳗', 'Conger eel', 'sea', 'b', 'u', 'n', 'eel', 0.3, 'brute', [0.5, 3, 25], { food: 13 });
S('hairtail', '带鱼', 'Hairtail', 'sea', 'm', 'c', 'n', 'pelagic', 0.3, 'steady', [0.2, 0.8, 3], { food: 13 });
S('yellow_croaker', '黄鱼', 'Yellow croaker', 'sea', 'b', 'c', 'e', 'seabed', 0.3, 'steady', [0.2, 0.6, 3], { food: 14 });
S('spanish_mackerel', '马鲛', 'Spanish mackerel', 'sea', 't', 'u', 'e', 'pelagic', 0.5, 'runner', [0.8, 3, 15], { food: 14 });
S('squid', '鱿鱼', 'Squid', 'sea', 'm', 'c', 'n', 'cephalopod', 0.2, 'steady', [0.1, 0.4, 2], { food: 12, cls: 'shellfish' });
S('octopus', '章鱼', 'Octopus', 'sea', 'b', 'u', 'n', 'cephalopod', 0.4, 'brute', [0.2, 1, 5], { food: 12, cls: 'shellfish' });
S('sea_crab', '梭子蟹', 'Swimming crab', 'sea', 'b', 'c', 'n', 'crustacean', 0.1, 'steady', [0.2, 0.5, 1.5], { food: 12, cls: 'shellfish' });
// ------------------------------------------------------------------ the open sea and the reefs (8, later)
S('tuna', '金枪鱼', 'Tuna', 'reef', 'm', 'r', 'd', 'pelagic', 0.5, 'runner', [10, 40, 250], { food: 14 });
S('sailfish', '旗鱼', 'Sailfish', 'reef', 't', 'r', 'd', 'pelagic', 0.6, 'jumper', [15, 35, 90], { food: 13 });
S('mahi', '鲯鳅', 'Mahi-mahi', 'reef', 't', 'u', 'd', 'pelagic', 0.4, 'jumper', [2, 8, 30], { food: 14 });
S('grunt', '石鲈', 'Grunt', 'reef', 'b', 'c', 'a', 'seabed', 0.2, 'steady', [0.2, 0.6, 2], { food: 12 });
S('small_shark', '小鲨', 'Small shark', 'reef', 'm', 'u', 'n', 'pelagic', 0.2, 'brute', [5, 20, 80], { food: 11 });
S('halibut', '大比目鱼', 'Halibut', 'reef', 'b', 'r', 'd', 'seabed', 0.4, 'brute', [5, 25, 150], { food: 14 });
S('ray', '鳐', 'Ray', 'reef', 'b', 'u', 'a', 'seabed', 0.3, 'brute', [2, 10, 60], { food: 11 });
S('sea_king', '海王', 'The Sea King', 'reef', 'm', 'L', 'e', 'pelagic', 0.9, 'runner', [80, 150, 300], { food: 14 });
// ------------------------------------------------------------------ the drowned city (5)
S('subway_carp', '地铁鲤', 'Subway carp', 'city', 'b', 'c', 'a', 'carp', 0.3, 'brute', [1, 4, 20]);
S('neon_fish', '霓虹鱼', 'Neon fish', 'city', 't', 'c', 'n', 'panfish', 0.3, 'steady', [0.02, 0.05, 0.2], { food: 10 });
S('rust_bass', '锈鳞鲈', 'Rust-scale bass', 'city', 'm', 'u', 'e', 'predator', 0.5, 'jumper', [0.3, 1.5, 8], { food: 13 });
S('tower_catfish', '楼影鲶', 'Tower-shadow catfish', 'city', 'b', 'r', 'n', 'catfish', 0.5, 'brute', [2, 10, 60]);
S('lift_eel', '电梯鳗', 'Lift-shaft eel', 'city', 'm', 'u', 'n', 'eel', 0.4, 'diver', [0.5, 2, 10], { food: 13 });
// ------------------------------------------------------------------ surreal waters (7)
S('cube_fish', '方鱼', 'Cube fish', 'surreal', 'm', 'u', 'a', 'panfish', 0.3, 'steady', [0.2, 0.6, 3]);
S('three_eyed_carp', '三眼鲤', 'Three-eyed carp', 'surreal', 'b', 'u', 'e', 'carp', 0.5, 'brute', [0.5, 2.5, 15]);
S('glass_fish', '玻璃鱼', 'Glass fish', 'surreal', 't', 'r', 'd', 'panfish', 0.9, 'steady', [0.05, 0.2, 1], { food: 10 });
S('moon_fish', '月光鱼', 'Moonlight fish', 'surreal', 't', 'r', 'n', 'trout', 0.8, 'jumper', [0.3, 1, 5], { food: 14 });
S('glow_fish', '夜光鱼', 'Glow fish', 'surreal', 'm', 'u', 'n', 'panfish', 0.4, 'steady', [0.05, 0.2, 1], { food: 11 });
S('crystal_fish', '晶鳞鱼', 'Crystal-scale fish', 'surreal', 'm', 'r', 'd', 'predator', 0.7, 'runner', [0.5, 2, 10], { food: 13 });
S('upside_down_fish', '倒游鱼', 'Upside-down fish', 'surreal', 't', 'r', 'a', 'grazer', 0.6, 'steady', [0.2, 0.8, 4]);

/** every kind, by water in the catalogue's order */
export const FISH: readonly FishKind[] = ALL;

/** a kind's index in FISH by its id */
export const FISH_INDEX: Readonly<Record<string, number>> = Object.fromEntries(ALL.map((k, i) => [k.id, i]));

export function fishKind(id: string): FishKind {
  const i = FISH_INDEX[id];
  if (i === undefined) throw new Error(`no fish ${id}`);
  return ALL[i];
}

/** the kinds of one class of water (through the ice or not) */
export function fishOf(water: WaterClass, ice = false): FishKind[] {
  return ALL.filter((k) => k.water === water && !!k.ice === ice);
}
