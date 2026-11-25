/**
 * The 110 fish of the casual fishing module (docs/V3/nodes/F2-fishing-lite.md §6): eleven to each of the ten
 * waters — three common, three uncommon, two rare, one epic, the water's lord and one celestial fish that only
 * comes with a moment of the sky. One row each; the order is the journal's.
 *
 * A row: water, rarity, id, names, lengths caught (cm), hours (a mask of the parts of the day), what it eats
 * best (and second), how it fights, its body, its skin, a line for its card, and whatever else it has (`o`).
 * Kinds the kitchen knows (src/core/v3/fishing/species.ts) name it in `kind`.
 *
 * To add a fish: a row in its water's block (and a body family the view knows). The tests count the rows.
 *
 * A fish's water is its home in the journal. Below the lords every water is alike (docs/V3/plan/fishing-feel.md §10):
 * the common to epic fish of all ten swim in every pond (fishOfTier); a lord and a sky fish keep to their own water.
 */
import { ANY_HOUR, DAWN, DAY, DUSK, NIGHT, type BaitKind, type Family, type FishDef, type Look, type Temper, type Tier } from './types';

const ALL: FishDef[] = [];

const D = DAY;
const E = DAWN | DUSK;
const N = NIGHT;
const A = ANY_HOUR;
const S = DUSK;
const EN = DAWN | DUSK | NIGHT;

type Extra = Partial<Pick<FishDef, 'span' | 'weather' | 'only' | 'also' | 'live' | 'slick' | 'wary' | 'move' | 'k' | 'kind'>>;

function F(spot: number, tier: Tier, id: string, zh: string, en: string, cm: readonly [number, number], hours: number, eats: BaitKind, temper: Temper, family: Family, look: Look, note: string, o: Extra = {}): void {
  ALL.push({ id, zh, en, spot, tier, cm, hours, eats, temper, family, look, note, ...o });
}

// ------------------------------------------------------------------ 0 樱岭塘 (a pond under the spring wood)
F(0, 0, 'bleak', '白条', 'Bleak', [8, 15], D, 'meat', 'steady', 'fusiform', { c: [0x6f8a8c, 0xdfe6e3, 0xf4f6f2, 0xc9d3cf], p: 'stripe', pc: 0x9fb6b5, h: 0.2 }, '新手的第一条鱼，也是老塘主最爱的活饵。', { kind: 'bleak' });
F(0, 0, 'crucian_carp', '鲫鱼', 'Crucian carp', [15, 38], A, 'veg', 'steady', 'carp', { c: [0x5d5a3a, 0xb3a777, 0xe6dcb6, 0x8a7a52], p: 'scales', pc: 0x7a6e44, h: 0.42 }, '什么时候来都在，塘里的老住户。', { also: 'meat', kind: 'crucian_carp' });
F(0, 0, 'bluegill', '蓝鳃太阳鱼', 'Bluegill', [12, 28], D, 'meat', 'steady', 'disc', { c: [0x3f5a46, 0x7d9a6a, 0xe0a25a, 0x5a6d55], p: 'bars', pc: 0x3b4f3c, n: 6, f: ['earFlap'] }, '腮边一点蓝，太阳越大越活跃。', { weather: 'clear', kind: 'bluegill' });
F(0, 1, 'yellow_perch', '黄鲈', 'Yellow perch', [15, 35], D, 'meat', 'runner', 'perch', { c: [0x4f5a2a, 0xd9c552, 0xf1ead0, 0xe07a3a], p: 'bars', pc: 0x3a3d1e, n: 6 }, '六道黑条纹，上钩先猛窜两下。', { also: 'lure', kind: 'yellow_perch' });
F(0, 1, 'loach', '泥鳅', 'Loach', [10, 25], A, 'meat', 'steady', 'eel', { c: [0x6a5a40, 0xa48e62, 0xe2d3b0, 0x8c7a5a], p: 'speck', pc: 0x4a3c28, h: 0.13, f: ['whiskers'] }, '下雨才从泥里钻出来，滑得抓不住。', { weather: 'rain', slick: true, kind: 'loach' });
F(0, 1, 'carp', '鲤鱼', 'Carp', [35, 80], E, 'veg', 'brute', 'carp', { c: [0x4d4f2e, 0xb39a52, 0xe8d9a8, 0x8c5a3a], p: 'scales', pc: 0x6d5a30, f: ['whiskers'] }, '第一条让人觉得"拉不动"的鱼。', { kind: 'carp' });
F(0, 2, 'largemouth_bass', '大口黑鲈', 'Largemouth bass', [25, 60], E, 'lure', 'jumper', 'perch', { c: [0x3e5a32, 0x8fae6a, 0xeef0d6, 0x6d7d50], p: 'blotch', pc: 0x2f3f24, f: ['bigMouth'] }, '只追会动的东西，换个亮片试试。', { also: 'meat', kind: 'largemouth_bass' });
F(0, 2, 'catfish', '鲶鱼', 'Catfish', [40, 100], N, 'meat', 'brute', 'catfish', { c: [0x3b3a36, 0x6e6a5e, 0xdcd6c6, 0x4d4a42], p: 'speck', pc: 0x2a2926, f: ['whiskers'] }, '天黑了才出来，下雨更馋。', { weather: 'rain', kind: 'catfish' });
F(0, 3, 'koi', '锦鲤', 'Koi', [40, 80], D, 'veg', 'runner', 'carp', { c: [0xf4f0e6, 0xf4f0e6, 0xfaf6ee, 0xf2ece0], p: 'koi', pc: 0xd8392b, f: ['whiskers'] }, '不知谁家池子里逃出来的，绿水里一抹红白。', { weather: 'clear', kind: 'carp' });
F(0, 4, 'old_pond_lord', '老塘主', 'The Old Pond Lord', [110, 140], A, 'lure', 'brute', 'carp', { c: [0x3a4a2a, 0x8a8a4a, 0xd8cfa0, 0x5a4a2a], p: 'moss', pc: 0x6a8a3a, f: ['whiskers', 'moss'] }, '背上长着青苔的百年巨鲤，会一头扎进芦苇根。', { span: [17, 20], live: 'bleak', move: 'reedBore', kind: 'carp' });
F(0, 5, 'rainbow_fish', '虹', 'Rainbow', [40, 60], A, 'lure', 'trick', 'fusiform', { c: [0x8ad0ff, 0xffffff, 0xffffff, 0xffd0f0], p: 'rainbow', f: ['glow', 'longFins'] }, '雨后彩虹的一头落进塘里，它就在那一头。', { only: 'rainbow' });

// ------------------------------------------------------------------ 1 苍谷湖 (a lake in the wet forest)
F(1, 0, 'chub', '马口鱼', 'Chub', [8, 18], D, 'meat', 'steady', 'fusiform', { c: [0x56708a, 0xbfcfd8, 0xf2f2ee, 0xd86a4a], p: 'bars', pc: 0x6a8aa8, n: 10, h: 0.22 }, '浅水边一群一群的，鳍是橘红色的。', { kind: 'chub' });
F(1, 0, 'mud_carp', '鲮鱼', 'Mud carp', [20, 45], A, 'veg', 'steady', 'carp', { c: [0x5a6066, 0xb9bec0, 0xeceae4, 0x9aa0a2], p: 'scales', pc: 0x8a9092, h: 0.3 }, '啃石头上的苔，啃得石头发亮。', { kind: 'mud_carp' });
F(1, 0, 'brook_trout', '溪鳟', 'Brook trout', [15, 40], E, 'meat', 'runner', 'fusiform', { c: [0x3c4a32, 0x7a7a4a, 0xe8803a, 0xe05a3a], p: 'worm', pc: 0xb8b070, f: ['finEdge'] }, '第一条鳟鱼。林湖之主的活饵。', { also: 'lure', kind: 'brook_trout' });
F(1, 1, 'rainbow_trout', '虹鳟', 'Rainbow trout', [25, 60], D, 'meat', 'jumper', 'fusiform', { c: [0x4a6a5a, 0xd6d8cc, 0xf4f2ec, 0x9aa08a], p: 'stripe', pc: 0xd8687a, f: ['spots'] }, '侧面一道粉红，上钩就往天上跳。', { also: 'lure', kind: 'rainbow_trout' });
F(1, 1, 'grayling', '茴鱼', 'Grayling', [20, 45], D, 'meat', 'steady', 'fusiform', { c: [0x4a5a66, 0xa8b4b8, 0xe8eae6, 0x8a6a8a], p: 'speck', pc: 0x3a4248, f: ['sail'] }, '背鳍像一面紫色的帆。只在晴天出来晒。', { weather: 'clear', kind: 'grayling' });
F(1, 1, 'smallmouth_bass', '小口黑鲈', 'Smallmouth bass', [20, 50], D, 'lure', 'jumper', 'perch', { c: [0x5a4a2a, 0xa88a4a, 0xe8dcc0, 0x7a6a3a], p: 'bars', pc: 0x4a3a1a, n: 9, f: ['redEye'] }, '红眼睛，脾气比个头大。', { also: 'meat', kind: 'smallmouth_bass' });
F(1, 2, 'brown_trout', '褐鳟', 'Brown trout', [30, 75], E, 'lure', 'runner', 'fusiform', { c: [0x5a4a2a, 0xc8a86a, 0xf0e2b8, 0x8a6a3a], p: 'halo', pc: 0x2a1a10 }, '很警觉，咬钩的那一下特别短。', { also: 'meat', wary: true, kind: 'brown_trout' });
F(1, 2, 'eel', '鳗鱼', 'Eel', [40, 100], N, 'meat', 'diver', 'eel', { c: [0x3a3a2a, 0x6a6a4a, 0xd8d0a0, 0x4a4a3a], p: 'plain', h: 0.08 }, '夜里贴着湖底游，一上钩就往石缝里钻。', { slick: true, kind: 'eel' });
F(1, 3, 'sockeye', '红鲑', 'Sockeye salmon', [50, 80], S, 'lure', 'runner', 'fusiform', { c: [0x3a6a4a, 0xd8382a, 0xe86a4a, 0x6a3a2a], p: 'plain', f: ['hump', 'greenHead', 'hookJaw'] }, '黄昏时全身红得像火，一口气冲很远。');
F(1, 4, 'forest_taimen', '林湖之主', 'The Forest Taimen', [120, 180], A, 'lure', 'runner', 'fusiform', { c: [0x3a3a3a, 0x8a6a5a, 0xd8c0b0, 0xb84a3a], p: 'spots', pc: 0x1a1a1a, n: 3 }, '一条哲罗鲑。连冲三次，一次比一次远。', { span: [5, 8], live: 'brook_trout', move: 'tripleRun', kind: 'taimen' });
F(1, 5, 'mist_fish', '雾隐', 'Mistveil', [45, 70], A, 'lure', 'trick', 'fusiform', { c: [0xd8e4ea, 0xf0f4f6, 0xffffff, 0xe0eef4], p: 'clear', f: ['glow', 'longFins'] }, '只看得见晨雾里的一道水痕。', { only: 'fog' });

// ------------------------------------------------------------------ 2 金汊水乡 (a delta of rice paddies)
F(2, 0, 'sleeper', '塘鳢', 'Sleeper goby', [10, 26], A, 'meat', 'steady', 'perch', { c: [0x5a4a32, 0x9a845a, 0xd8ccaa, 0x7a6a4a], p: 'blotch', pc: 0x3a2c1a, f: ['flatHead'] }, '趴在田埂边一动不动，嘴一张就吞。', { kind: 'sleeper' });
F(2, 0, 'crayfish', '小龙虾', 'Crayfish', [6, 14], N, 'meat', 'steady', 'crayfish', { c: [0xb83a2a, 0xd8502a, 0xe8a07a, 0xa8302a] }, '夹住饵就不松，提上岸才肯放。', { kind: 'crayfish' });
F(2, 0, 'swamp_eel', '黄鳝', 'Swamp eel', [25, 60], N, 'meat', 'steady', 'eel', { c: [0x5a4a22, 0xb89a4a, 0xe0c86a, 0x8a7438], p: 'speck', pc: 0x3a2a12, h: 0.07 }, '下雨的夜里从田埂的洞里钻出来。老鲶的活饵。', { weather: 'rain', slick: true, kind: 'swamp_eel' });
F(2, 1, 'bullfrog', '牛蛙', 'Bullfrog', [10, 20], N, 'meat', 'jumper', 'frog', { c: [0x4a6a2a, 0x7a9a4a, 0xe8e0b0, 0x5a7a3a], p: 'spots', pc: 0x2a3a1a }, '钓上来的是只蛙，叫声比牛还响。', { weather: 'rain', kind: 'bullfrog' });
F(2, 1, 'snakehead', '黑鱼', 'Snakehead', [35, 85], D, 'lure', 'brute', 'pike', { c: [0x2a2e22, 0x5a5a42, 0xcac4a8, 0x3a3a2a], p: 'blotch', pc: 0x1a1a12, f: ['flatHead'] }, '水田里的霸王，咬住就往泥里拖。', { kind: 'snakehead' });
F(2, 1, 'paddy_carp', '禾花鲤', 'Paddy carp', [20, 40], D, 'veg', 'steady', 'carp', { c: [0x8a6a3a, 0xd8a85a, 0xf0e0b0, 0xd8784a], p: 'scales', pc: 0xb08040 }, '吃稻花长大的鲤鱼，鳞是金红色的。', { kind: 'carp' });
F(2, 2, 'spotted_gar', '斑点雀鳝', 'Spotted gar', [60, 120], D, 'lure', 'jumper', 'pike', { c: [0x5a5a3a, 0xa8a070, 0xe8e0c0, 0x8a8050], p: 'spots', pc: 0x2a2a1a, f: ['snout'] }, '长嘴，浮在水面上晒太阳。', { weather: 'clear', kind: 'gar' });
F(2, 2, 'snapping_turtle', '鳄龟', 'Snapping turtle', [30, 60], A, 'meat', 'brute', 'turtle', { c: [0x4a4a32, 0x6a6a4a, 0xb8a878, 0x5a5a3a], f: ['spikes'] }, '最慢、最沉，咬住就不松口。', { k: 1.6e-4 });
F(2, 3, 'alligator_gar', '鳄雀鳝', 'Alligator gar', [150, 250], S, 'lure', 'brute', 'pike', { c: [0x4a5a3a, 0x8a9a6a, 0xd8d8b8, 0x6a6a4a], p: 'spots', pc: 0x2a3420, f: ['snout', 'armor'] }, '披着铠甲的活化石，黄昏浮上来换气。', { k: 4.8e-6 });
F(2, 4, 'delta_catfish', '水乡老鲶', 'The Old Delta Catfish', [180, 240], A, 'lure', 'brute', 'catfish', { c: [0x2a2c26, 0x4a4a40, 0xb8b0a0, 0x34342e], p: 'blotch', pc: 0x1a1c18, f: ['whiskers', 'scar'] }, '往沉木底下钻，要顶住它三次。', { span: [20, 4], weather: 'rain', live: 'swamp_eel', move: 'tripleBore', kind: 'wels' });
F(2, 5, 'thunder_eel', '雷鳗', 'Thunder eel', [80, 120], A, 'lure', 'trick', 'eel', { c: [0x2a2a5a, 0x5a6ad8, 0xc8d8ff, 0x8a9aff], p: 'lightning', pc: 0xfff6a0, h: 0.09, f: ['glow'] }, '每一道闪电都照亮它一次。', { only: 'storm' });

// ------------------------------------------------------------------ 3 霞海子 (a great lake on the open plains)
F(3, 0, 'whitefish', '白鲑', 'Whitefish', [25, 50], D, 'meat', 'steady', 'fusiform', { c: [0x6a7a82, 0xd8dcda, 0xf6f6f2, 0xb8c0c0], p: 'scales', pc: 0xa8b0b2 }, '银白一片，湖王最爱的活饵。', { kind: 'whitefish' });
F(3, 0, 'bream', '鳊鱼', 'Bream', [20, 45], A, 'veg', 'steady', 'carp', { c: [0x5a5a4a, 0xbab49a, 0xece6d6, 0x8a8470], p: 'scales', pc: 0x9a9480, h: 0.48, w: 0.11 }, '又扁又高，侧过来像一片银叶子。');
F(3, 0, 'silver_carp', '鲢鱼', 'Silver carp', [40, 90], D, 'veg', 'jumper', 'carp', { c: [0x6a7a7a, 0xdce0dc, 0xf4f4f0, 0xb0b8b4], p: 'scales', pc: 0xc0c6c2, f: ['lowEyes'] }, '一受惊就成片跳出水面。', { kind: 'silver_carp' });
F(3, 1, 'grass_carp', '草鱼', 'Grass carp', [50, 110], D, 'veg', 'runner', 'carp', { c: [0x4a5a3a, 0xa8a874, 0xe8e4cc, 0x7a7a5a], p: 'scales', pc: 0x6a7048, h: 0.26 }, '吃草的大个子，跑起来像一列火车。', { kind: 'grass_carp' });
F(3, 1, 'pike', '狗鱼', 'Pike', [45, 110], D, 'lure', 'runner', 'pike', { c: [0x3a4a2a, 0x7a9a4a, 0xe8e8c8, 0x8a7a3a], p: 'spots', pc: 0xd8e0a0, f: ['duckbill'] }, '藏在水草边伏击，一口能吞下半条鱼。', { kind: 'pike' });
F(3, 1, 'culter', '翘嘴', 'Topmouth culter', [35, 90], E, 'lure', 'jumper', 'fusiform', { c: [0x5a6a72, 0xd8dee0, 0xf6f6f6, 0xb8c0c4], p: 'plain', f: ['upMouth'], h: 0.21 }, '嘴往上翘，贴着水面追小鱼。', { kind: 'culter' });
F(3, 2, 'zander', '梭鲈', 'Zander', [40, 90], EN, 'lure', 'diver', 'perch', { c: [0x4a5248, 0x9aa294, 0xe6e8e0, 0x8a907e], p: 'bars', pc: 0x3a4038, n: 8, f: ['glassEye', 'fangs'], h: 0.22 }, '玻璃一样的大眼睛，专在昏暗里出来。', { kind: 'zander' });
F(3, 2, 'mandarin_fish', '鳜鱼', 'Mandarin fish', [25, 60], N, 'lure', 'diver', 'perch', { c: [0x6a5a2a, 0xc8a85a, 0xf0e2c0, 0x8a7a42], p: 'leopard', pc: 0x2a1e10, f: ['bigMouth'] }, '一身豹纹，只吃活的。', { kind: 'mandarin_fish' });
F(3, 3, 'sturgeon', '鲟鱼', 'Sturgeon', [100, 220], N, 'meat', 'brute', 'ancient', { c: [0x4a5052, 0x8a9294, 0xe8e8e2, 0x6a7072], f: ['scutes', 'snout', 'whiskers'] }, '活化石，背上一排骨板，夜里在湖底拱泥。', { kind: 'sturgeon' });
F(3, 4, 'lake_king', '湖王', 'The Lake King', [150, 200], A, 'lure', 'jumper', 'pike', { c: [0x2a3a22, 0x6a8a3a, 0xe0e4c0, 0x7a6a2a], p: 'spots', pc: 0xc8d890, f: ['duckbill', 'scar'] }, '两米长的老狗鱼，跳起来整个湖都听得见。', { span: [5, 8], live: 'whitefish', move: 'leap', kind: 'lake_king' });
F(3, 5, 'meteor_fish', '流星', 'Meteor', [50, 80], A, 'lure', 'trick', 'fusiform', { c: [0x1a2040, 0x3a4a8a, 0xc8d0ff, 0xffe8a0], p: 'stars', pc: 0xfff4c0, f: ['glow', 'longTail'] }, '流星雨的夜里，有一颗落进了湖。', { only: 'meteor' });

// ------------------------------------------------------------------ 4 黑海子 (a great lake of the savanna under the escarpment)
F(4, 0, 'tilapia', '罗非鱼', 'Tilapia', [15, 40], D, 'veg', 'steady', 'perch', { c: [0x5a6a5a, 0xa8b09a, 0xe8e4d4, 0x8a6a6a], p: 'bars', pc: 0x7a8474, n: 7, h: 0.4 }, '湖边最多的鱼，法老的活饵。', { kind: 'tilapia' });
F(4, 0, 'blue_cichlid', '蓝丽鱼', 'Blue cichlid', [8, 18], D, 'meat', 'steady', 'perch', { c: [0x2a5ab0, 0x4a7ad8, 0x9ab8f0, 0x2a4a9a], p: 'bars', pc: 0x1a2a6a, n: 7, h: 0.36 }, '整条鱼蓝得像湖水本身。');
F(4, 0, 'dagaa', '银针鱼', 'Dagaa', [5, 10], N, 'meat', 'steady', 'fusiform', { c: [0x8a9aa0, 0xe8eeee, 0xffffff, 0xd0d8d8], p: 'stripe', pc: 0xc0ccd0, h: 0.16 }, '夜里被灯光引过来，一闪一闪的。');
F(4, 1, 'african_catfish', '尖齿胡鲶', 'African catfish', [50, 110], N, 'meat', 'brute', 'catfish', { c: [0x3a3a32, 0x6a6a58, 0xd8d2c0, 0x4a4a40], p: 'blotch', pc: 0x2a2a22, f: ['whiskers', 'flatHead'] }, '旱季能在泥里活好几个月。');
F(4, 1, 'elephantnose', '象鼻鱼', 'Elephantnose', [12, 25], N, 'meat', 'steady', 'pike', { c: [0x4a3a3a, 0x7a6a6a, 0xb8a8a8, 0x5a4a4a], p: 'plain', f: ['trunk'] }, '长着一根象鼻子，靠电感找吃的。很警觉。', { wary: true });
F(4, 1, 'upside_down_catfish', '倒游鲶', 'Upside-down catfish', [6, 12], N, 'meat', 'trick', 'catfish', { c: [0xc8b89a, 0x9a8a6a, 0x3a3226, 0xa8987a], p: 'spots', pc: 0x3a3020, f: ['whiskers', 'flipped'] }, '肚皮朝天游，搏的时候也不按常理。');
F(4, 2, 'lungfish', '非洲肺鱼', 'African lungfish', [60, 120], A, 'meat', 'brute', 'ancient', { c: [0x4a4a3a, 0x7a7a5a, 0xc8c0a0, 0x5a5a4a], p: 'speck', pc: 0x2e2e22, f: ['threadFins'], h: 0.1 }, '会呼吸空气。雨季一来，它从干泥里醒过来。', { weather: 'rain', k: 3.4e-6 });
F(4, 2, 'bichir', '恐龙鱼', 'Bichir', [30, 70], N, 'meat', 'diver', 'ancient', { c: [0x5a5a42, 0x8a8a62, 0xd8d0b0, 0x6a6a4a], p: 'bars', pc: 0x34342a, n: 6, f: ['finlets'], h: 0.12 }, '背上一排小旗，长得像四亿年前的样子。', { k: 4.5e-6 });
F(4, 3, 'goliath_tigerfish', '歌利亚虎鱼', 'Goliath tigerfish', [80, 150], E, 'lure', 'runner', 'fusiform', { c: [0x4a5a62, 0xc8d0d4, 0xf0f0ec, 0xd84a3a], p: 'stripe', pc: 0x3a4a52, n: 5, f: ['tusks'], h: 0.26 }, '一嘴獠牙，红尾巴。咬断过无数根线。');
F(4, 4, 'pharaoh', '法老', 'The Pharaoh', [160, 200], A, 'lure', 'brute', 'perch', { c: [0x5a6a6a, 0xc0c8c4, 0xece8e0, 0x8a8a7a], p: 'plain', f: ['glowEye'] }, '一条巨型尼罗尖吻鲈。不冲不跳，只是沉。', { span: [18.5, 20.5], live: 'tilapia', move: 'heavy', k: 1.25e-5 });
F(4, 5, 'sunshower_fish', '太阳雨', 'Sunshower', [50, 80], A, 'lure', 'trick', 'fusiform', { c: [0xd8a02a, 0xf2c84a, 0xfff0b0, 0xe8782a], p: 'stripe', pc: 0xb8781a, f: ['glow'], h: 0.24 }, '出着太阳下雨的时候，一条金色的影子。', { only: 'sunshower' });

// ------------------------------------------------------------------ 5 碧梯天坑 (a sinkhole pool among the old rice terraces)
F(5, 0, 'piranha', '红腹食人鱼', 'Red-bellied piranha', [15, 30], D, 'meat', 'runner', 'disc', { c: [0x5a6a6a, 0xa8b4b0, 0xd83a2a, 0x6a6a6a], p: 'speck', pc: 0xd8e0e0, f: ['teeth'] }, '偷饵快。也是深潭巨灵的活饵。');
F(5, 0, 'cardinal_tetra', '宝莲灯鱼', 'Cardinal tetra', [2, 4], D, 'meat', 'steady', 'tetra', { c: [0x2a3a5a, 0x3ad0ff, 0xe02a2a, 0xc0c8d0], p: 'neon' }, '全图鉴最小的鱼，一道蓝一道红。');
F(5, 0, 'pacu', '淡水白鲳', 'Pacu', [30, 70], D, 'veg', 'brute', 'disc', { c: [0x4a4e4e, 0x8a9290, 0xd8783a, 0x5a5e5c], p: 'plain' }, '食人鱼的表亲，只吃落进水里的果子。');
F(5, 1, 'peacock_bass', '孔雀鲈', 'Peacock bass', [30, 75], D, 'lure', 'jumper', 'perch', { c: [0x5a7a3a, 0xd8c84a, 0xf0e0a0, 0xd8502a], p: 'bars', pc: 0x2a3a1a, n: 3, f: ['eyespot'] }, '尾巴上一只"眼睛"，晴天最凶。', { weather: 'clear' });
F(5, 1, 'discus', '七彩神仙鱼', 'Discus', [10, 20], E, 'meat', 'steady', 'disc', { c: [0x8a3a2a, 0xd8783a, 0xf0b07a, 0x3a7ad8], p: 'waves', pc: 0x3aa8e8, h: 0.9 }, '圆得像一块盘子，非常警觉。', { wary: true });
F(5, 1, 'oscar', '地图鱼', 'Oscar', [20, 40], A, 'meat', 'steady', 'perch', { c: [0x3a3a32, 0x6a5a42, 0xa88a5a, 0x4a4232], p: 'blotch', pc: 0xd8682a, f: ['eyespot'] }, '身上的花纹像一张旧地图。', { also: 'lure' });
F(5, 2, 'arowana', '银龙鱼', 'Silver arowana', [50, 100], E, 'lure', 'jumper', 'pike', { c: [0x7a8a8a, 0xd8e0e0, 0xf4f4f0, 0xc0c8c8], p: 'bigScales', pc: 0xe8f0f0, f: ['upMouth', 'barbels'] }, '贴着水面游，会跳起来吃树枝上的虫。');
F(5, 2, 'redtail_catfish', '红尾鲶', 'Redtail catfish', [60, 130], N, 'meat', 'brute', 'catfish', { c: [0x2a2a2a, 0x4a4a46, 0xe8e4d8, 0xd84a2a], p: 'band', pc: 0xe8e4d8, f: ['whiskers'] }, '黑背白腹，尾巴一抹火红。');
F(5, 3, 'electric_eel', '电鳗', 'Electric eel', [120, 220], N, 'meat', 'diver', 'eel', { c: [0x3a3a2e, 0x5a5644, 0xd88a3a, 0x4a4638], p: 'plain', h: 0.09 }, '会放电：它亮起来的那一秒，必须松手。', { weather: 'rain', slick: true, move: 'zap' });
F(5, 4, 'arapaima', '深潭巨灵', 'The Arapaima', [200, 300], A, 'lure', 'brute', 'ancient', { c: [0x3a4a3a, 0x7a8a6a, 0xd8d0b0, 0xb83a2a], p: 'bigScales', pc: 0xc84a3a, h: 0.16 }, '每隔一阵要浮上来换气，那是收线的机会。', { span: [17, 19.5], live: 'piranha', move: 'breathe', k: 6.2e-6 });
F(5, 5, 'afterglow_fish', '晚霞', 'Afterglow', [30, 50], A, 'lure', 'trick', 'disc', { c: [0xff8a4a, 0xffb86a, 0xffe0b0, 0xff5a8a], p: 'gradient', f: ['longFins', 'glow'], h: 1.0 }, '火烧云映在潭里的时候，它从霞光里游出来。', { only: 'afterglow' });

// ------------------------------------------------------------------ 6 霞镜冰湖 (a thawing lake among the hoodoos, high up)
F(6, 0, 'alpine_trout', '高山鳟', 'Alpine trout', [15, 40], D, 'meat', 'runner', 'fusiform', { c: [0x4a5a4a, 0xb8b89a, 0xf0ece0, 0x8a8a6a], p: 'spots', pc: 0x2a2a1a }, '高原的冷水里长得慢，肉却最紧。', { kind: 'alpine_trout' });
F(6, 0, 'sculpin', '杜父鱼', 'Sculpin', [5, 15], A, 'meat', 'steady', 'catfish', { c: [0x5a5040, 0x8a7a60, 0xd0c4a8, 0x6a5e48], p: 'blotch', pc: 0x3a3226, f: ['bigFins', 'flatHead'] }, '趴在石头缝里，跟石头一个颜色。', { kind: 'sculpin' });
F(6, 0, 'smelt', '胡瓜鱼', 'Smelt', [8, 20], A, 'meat', 'steady', 'fusiform', { c: [0x6a8a8a, 0xd8e4e0, 0xffffff, 0xc8d8d4], p: 'stripe', pc: 0xa8c8c4, h: 0.17 }, '闻起来有黄瓜的清香。冰湖王的活饵。', { kind: 'smelt' });
F(6, 1, 'char', '红点鲑', 'Char', [25, 65], E, 'lure', 'diver', 'fusiform', { c: [0x3a4a4a, 0x7a8a7a, 0xe8884a, 0xe86a4a], p: 'spots', pc: 0xf0c0a0, f: ['finEdge'] }, '一身淡色的点，肚子是橘红的。', { kind: 'char' });
F(6, 1, 'lenok', '细鳞鱼', 'Lenok', [25, 65], D, 'meat', 'runner', 'fusiform', { c: [0x4a4a3a, 0xa89a6a, 0xe8dcb8, 0x8a6a4a], p: 'spots', pc: 0x2a1a10 }, '鳞细得几乎看不见。', { also: 'lure', kind: 'lenok' });
F(6, 1, 'burbot', '江鳕', 'Burbot', [30, 80], N, 'meat', 'steady', 'catfish', { c: [0x4a4a2a, 0x7a7a4a, 0xd8d0a0, 0x5a5a3a], p: 'blotch', pc: 0x2e2e18, f: ['chinBarbel'], h: 0.15 }, '越冷越活跃，结冰的夜里最好钓。', { kind: 'burbot' });
F(6, 2, 'golden_trout', '金鳟', 'Golden trout', [15, 45], E, 'meat', 'jumper', 'fusiform', { c: [0x6a7a3a, 0xe8c84a, 0xe8502a, 0xe8a03a], p: 'parr', pc: 0x6a6a3a }, '全游戏最警觉的鱼。晴天的晨昏才出来。', { weather: 'clear', wary: true, kind: 'golden_trout' });
F(6, 2, 'arctic_char', '北极红点鲑', 'Arctic char', [30, 80], E, 'lure', 'diver', 'fusiform', { c: [0x2a3a4a, 0x6a7a8a, 0xe85a2a, 0xe84a2a], p: 'spots', pc: 0xf0d0c0, f: ['finEdge'] }, '冰川融水里的红肚子。', { kind: 'arctic_char' });
F(6, 3, 'icefish', '冰鱼', 'Icefish', [25, 50], N, 'meat', 'trick', 'pike', { c: [0xc8e0e8, 0xe0f0f4, 0xf6fbfc, 0xd8ecf0], p: 'clear', f: ['bigFins', 'crocHead'] }, '血是透明的，影子几乎看不见。');
F(6, 4, 'ice_king', '冰湖王', 'The Ice King', [100, 140], A, 'lure', 'brute', 'fusiform', { c: [0x1a2a3a, 0x4a6a7a, 0xe86a3a, 0xd84a2a], p: 'spots', pc: 0xe8f0f4 }, '日出前的蓝调时刻出来，往冰下的暗处扎。', { span: [4.5, 6.5], live: 'smelt', move: 'iceDive', kind: 'ice_king' });
F(6, 5, 'aurora_fish', '极光', 'Aurora', [45, 70], A, 'lure', 'trick', 'fusiform', { c: [0x1a3a3a, 0x3ad8a0, 0xa0f0d0, 0xb06ad8], p: 'aurora', f: ['glow', 'longFins'] }, '身上的颜色跟天上一起变。', { only: 'aurora' });

// ------------------------------------------------------------------ 7 青野海湾 (a bay of sea stacks, the lighthouse's pier)
F(7, 0, 'sardine', '沙丁鱼', 'Sardine', [10, 20], D, 'meat', 'steady', 'fusiform', { c: [0x2a5a7a, 0xc8dce4, 0xffffff, 0xb8c8d0], p: 'dots', pc: 0x2a3a4a, n: 5, h: 0.18 }, '成群结队，运气好一竿两条。', { kind: 'sardine' });
F(7, 0, 'mackerel', '鲭鱼', 'Mackerel', [25, 45], D, 'lure', 'runner', 'fusiform', { c: [0x2a6a5a, 0xc8d8d0, 0xf8f8f4, 0x8aa0a0], p: 'tiger', pc: 0x1a2a2a, f: ['finlets'] }, '背上一道道波纹。海王最爱的活饵。', { also: 'meat', kind: 'mackerel' });
F(7, 0, 'flounder', '比目鱼', 'Flounder', [25, 60], A, 'meat', 'steady', 'flat', { c: [0x7a6a4a, 0x9a8a62, 0xf4f0e8, 0x8a7a5a], p: 'speck', pc: 0xd8783a }, '两只眼睛长在同一边，贴着沙底。', { kind: 'flounder' });
F(7, 1, 'sea_bream', '鲷鱼', 'Sea bream', [25, 60], D, 'meat', 'diver', 'perch', { c: [0xd84a5a, 0xf08a8a, 0xf8e0e0, 0xe86a7a], p: 'speck', pc: 0x6ab0e8, h: 0.42 }, '一身喜庆的红，撒着蓝点。', { kind: 'sea_bream' });
F(7, 1, 'squid', '鱿鱼', 'Squid', [15, 40], N, 'lure', 'steady', 'squid', { c: [0xe8c8c0, 0xd8a090, 0xf4e4e0, 0xe0b0a8], p: 'speck', pc: 0xb85a4a }, '上岸喷你一脸墨。', { kind: 'squid' });
F(7, 1, 'pufferfish', '河豚', 'Pufferfish', [15, 35], D, 'meat', 'steady', 'round', { c: [0x5a5a3a, 0xc8c08a, 0xf8f4e8, 0xd8c87a], p: 'blotch', pc: 0x2a2a1a, f: ['spikes'] }, '一上岸就鼓成一个球。');
F(7, 2, 'grouper', '石斑', 'Grouper', [40, 100], E, 'lure', 'diver', 'perch', { c: [0x6a4a3a, 0xa87a5a, 0xd8b898, 0x8a5a4a], p: 'spots', pc: 0xd84a2a, f: ['bigMouth'] }, '往礁石缝里钻，钻进去就拉不出来。', { kind: 'grouper' });
F(7, 2, 'octopus', '章鱼', 'Octopus', [30, 80], N, 'meat', 'brute', 'octopus', { c: [0xb85a4a, 0xd88a6a, 0xf0c8b0, 0xc86a5a], p: 'speck', pc: 0x8a3a2a }, '八条腿吸住海底，怎么拽都不松。', { kind: 'octopus' });
F(7, 3, 'ocean_sunfish', '翻车鱼', 'Ocean sunfish', [150, 250], D, 'meat', 'brute', 'round', { c: [0x6a7a8a, 0xb8c4cc, 0xe8ecf0, 0x8a96a0], p: 'speck', pc: 0x9aa4ac, f: ['mola'] }, '全图鉴最重的鱼，慢吞吞的，可就是拉不动。', { weather: 'clear', k: 6.4e-5 });
F(7, 4, 'sea_king', '海王', 'The Sea King', [200, 280], A, 'lure', 'runner', 'fusiform', { c: [0x1a2a5a, 0x8a9ab0, 0xe8ecf0, 0xe8c84a], p: 'plain', f: ['finlets', 'sickleTail'], h: 0.27 }, '一条蓝鳍金枪。全游戏最长的一次冲刺。', { span: [5, 7.5], live: 'mackerel', move: 'longRun', kind: 'sea_king', k: 1.5e-5 });
F(7, 5, 'oarfish', '龙宫使者', 'Oarfish', [300, 500], A, 'lure', 'trick', 'eel', { c: [0xc0c8d0, 0xe8ecf0, 0xffffff, 0xe83a3a], p: 'plain', f: ['crest'], h: 0.1, w: 0.03 }, '天上出现地震云的时候，它从深海浮上来。', { only: 'ribbon', k: 1.2e-6 });

// ------------------------------------------------------------------ 8 黑焰湖 (a cold lake among the cinder cones and the lava)
F(8, 0, 'doctor_fish', '温泉鱼', 'Doctor fish', [5, 12], A, 'meat', 'steady', 'fusiform', { c: [0x5a5a52, 0x9a9a8a, 0xd8d8c8, 0x7a7a6a], p: 'stripe', pc: 0x3a3a32, h: 0.2 }, '挤在热泉口，会轻轻啄你的手指。', { kind: 'hotspring_fish' });
F(8, 0, 'sulphur_killifish', '硫磺鳉', 'Sulphur killifish', [3, 7], D, 'meat', 'steady', 'fusiform', { c: [0x8a8a2a, 0xe8e04a, 0xf8f4c0, 0xd8c83a], p: 'plain', h: 0.24 }, '在硫磺水里也活得好好的。', { kind: 'sulphur_killifish' });
F(8, 0, 'obsidian_carp', '黑曜鲫', 'Obsidian carp', [20, 45], A, 'veg', 'steady', 'carp', { c: [0x0e0e12, 0x2a2a34, 0x4a4a5a, 0x1a1a22], p: 'glass', pc: 0x6a6a8a, h: 0.4 }, '鳞片像火山玻璃，又黑又亮。', { kind: 'crucian_carp' });
F(8, 1, 'crater_trout', '火口鳟', 'Crater trout', [30, 60], E, 'meat', 'runner', 'fusiform', { c: [0x3a3a3a, 0x8a6a5a, 0xe8b08a, 0xd85a3a], p: 'spots', pc: 0x1a1a1a, f: ['finEdge'] }, '在火山口湖里活了一万年的鳟鱼。', { also: 'lure', kind: 'crater_trout' });
F(8, 1, 'pumice_fish', '浮石鱼', 'Pumice fish', [15, 30], D, 'veg', 'trick', 'round', { c: [0xb8b0a0, 0xd0c8b8, 0xe8e0d0, 0xa8a090], p: 'pores', pc: 0x8a8070 }, '轻得能浮在水面上，收线时它往上漂。');
F(8, 1, 'lava_loach', '熔岩鳅', 'Lava loach', [10, 25], N, 'meat', 'steady', 'eel', { c: [0x1a1414, 0x3a2a24, 0x5a3a2a, 0x2a1a14], p: 'cracks', pc: 0xff7a2a, h: 0.12, f: ['glow'] }, '身上的裂纹在夜里透出火光。黑焰之主的活饵。', { slick: true });
F(8, 2, 'basalt_perch', '玄武鲈', 'Basalt perch', [40, 80], E, 'lure', 'diver', 'perch', { c: [0x2a2e34, 0x4a525a, 0x8a929a, 0x3a4048], p: 'hex', pc: 0x1a1e22 }, '鳞片是一格一格的六边形，像玄武岩柱。');
F(8, 2, 'chimney_catfish', '烟囱鲶', 'Chimney catfish', [60, 120], N, 'meat', 'brute', 'catfish', { c: [0x2a2624, 0x4a4440, 0x8a8078, 0x3a3430], p: 'soot', pc: 0x1a1614, f: ['whiskers'] }, '住在湖底的热泉烟囱里，一身烟灰。');
F(8, 3, 'ember_arowana', '炎鳞龙鱼', 'Ember arowana', [80, 140], S, 'lure', 'jumper', 'pike', { c: [0x3a1a12, 0xc84a1a, 0xff9a4a, 0xe8602a], p: 'bigScales', pc: 0xffc05a, f: ['upMouth', 'glow'] }, '每一片鳞都像烧红的炭。');
F(8, 4, 'lava_sturgeon', '黑焰之主', 'The Lava Sturgeon', [200, 260], A, 'lure', 'brute', 'ancient', { c: [0x1a1616, 0x3a2e2a, 0x6a4a3a, 0x2a2220], p: 'cracks', pc: 0xff6a1a, f: ['scutes', 'glow', 'snout'] }, '背上的骨板之间透着熔岩的光。会突然发力。', { span: [21, 3], live: 'lava_loach', move: 'surge', kind: 'sturgeon' });
F(8, 5, 'snow_ember', '雪烬', 'Snow Ember', [40, 60], A, 'lure', 'trick', 'fusiform', { c: [0xe8eef4, 0xf8fafc, 0xffffff, 0xff8a4a], p: 'embers', pc: 0xff7a3a, f: ['glow'] }, '雪落进火山湖的时候，它像一块不灭的炭。', { only: 'snow' });

// ------------------------------------------------------------------ 9 碧镜天池 (a crater lake high under the stars)
F(9, 0, 'glow_fish', '夜光鱼', 'Glow fish', [8, 20], N, 'meat', 'steady', 'tetra', { c: [0x1a3a4a, 0x3a8a9a, 0xa0f0f0, 0x6ad8e8], p: 'glow', pc: 0x8af8ff, f: ['glow'] }, '自己会发光。潭底的月亮只吃它。', { kind: 'glow_fish' });
F(9, 0, 'cube_fish', '方鱼', 'Cube fish', [15, 35], A, 'veg', 'steady', 'cube', { c: [0x8a7ab8, 0xb8a8e0, 0xe8e0f8, 0x9a8ad0] }, '四四方方，游起来一顿一顿的。', { kind: 'cube_fish' });
F(9, 0, 'mushroom_fish', '蘑菇鱼', 'Mushroom fish', [10, 25], A, 'veg', 'steady', 'carp', { c: [0xb85a3a, 0xe8c8a0, 0xf8f0e0, 0xd8a07a], p: 'spots', pc: 0xf8f4ec, f: ['cap'] }, '头上顶着菌盖，上岸撒一阵孢子。');
F(9, 1, 'three_eyed_carp', '三眼鲤', 'Three-eyed carp', [35, 80], E, 'veg', 'brute', 'carp', { c: [0x5a3a6a, 0x9a6ab8, 0xe0c8f0, 0x7a4a9a], p: 'scales', pc: 0x7a5a90, f: ['thirdEye', 'whiskers'] }, '第三只眼睛总是闭着。', { kind: 'three_eyed_carp' });
F(9, 1, 'upside_down_fish', '倒游鱼', 'Upside-down fish', [20, 50], A, 'veg', 'trick', 'fusiform', { c: [0xe8e4d8, 0x9aa0a8, 0x3a4048, 0x8a90a0], p: 'plain', f: ['flipped'] }, '收线的时候，它往反方向"游过来"。', { kind: 'upside_down_fish' });
F(9, 1, 'paper_fish', '纸鱼', 'Paper fish', [15, 30], D, 'meat', 'runner', 'fusiform', { c: [0xf0ece0, 0xf6f2e8, 0xfaf8f2, 0xe8e0d0], p: 'folds', pc: 0xc8c0b0, w: 0.025 }, '折纸一样，轻飘飘的，风一吹就跑。');
F(9, 2, 'glass_fish', '玻璃鱼', 'Glass fish', [10, 25], D, 'meat', 'steady', 'fusiform', { c: [0xd8f0f4, 0xe8f8fa, 0xf4fcfd, 0xe0f4f8], p: 'clear', f: ['bones'] }, '透明的，几乎看不见影子。', { kind: 'glass_fish' });
F(9, 2, 'crystal_fish', '晶鳞鱼', 'Crystal-scale fish', [40, 90], D, 'lure', 'runner', 'perch', { c: [0x8ab8e8, 0xc8e0f8, 0xf0f8ff, 0xa8d0f0], p: 'crystal', pc: 0xffffff }, '把阳光折成一地的彩虹斑。', { weather: 'clear', kind: 'crystal_fish' });
F(9, 3, 'moon_fish', '月光鱼', 'Moonlight fish', [30, 60], N, 'lure', 'jumper', 'disc', { c: [0xc8d0e8, 0xe8ecf8, 0xffffff, 0xd8e0f4], p: 'moon', pc: 0xfffce8, f: ['glow', 'longFins'], h: 0.95 }, '月亮升起来以后，它才浮到水面。', { only: 'moonup', kind: 'moon_fish' });
F(9, 4, 'moon_below', '潭底的月亮', 'The Moon Below', [180, 220], A, 'lure', 'trick', 'round', { c: [0xd8dce8, 0xf0f2f8, 0xffffff, 0xc8cce0], p: 'craters', pc: 0xb8bcd0, f: ['moonDisc', 'glow'] }, '上钩以后，水里的月亮倒影就不见了。', { span: [21, 3], only: 'fullmoon', live: 'glow_fish', move: 'eclipse', k: 2.4e-5 });
F(9, 5, 'dream_fish', '梦', 'Dream', [60, 90], A, 'lure', 'trick', 'fusiform', { c: [0x2a1a4a, 0x6a4ab8, 0xf0c8ff, 0xffd8a0], p: 'galaxy', pc: 0xfff4ff, f: ['glow', 'longFins', 'longTail'] }, '最后一条鱼。别的天象鱼都见过以后，它才会来。', { only: 'dream' });

/** every fish, by water in the journal's order */
export const FISH: readonly FishDef[] = ALL;

/** a fish's index in FISH by its id */
export const FISH_INDEX: ReadonlyMap<string, number> = new Map(ALL.map((f, i) => [f.id, i]));

export function fishIndex(id: string): number {
  const i = FISH_INDEX.get(id);
  if (i === undefined) throw new Error(`no fish ${id}`);
  return i;
}

/** the fish of a water, in the journal's order (indices into FISH) */
export function fishOfSpot(spot: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < ALL.length; i++) if (ALL[i].spot === spot) out.push(i);
  return out;
}

const BY_TIER: readonly (readonly number[])[] = [0, 1, 2, 3, 4, 5].map((t) => ALL.flatMap((f, i) => (f.tier === t ? [i] : [])));

/** the fish of a rarity, of every water, in the journal's order (indices into FISH; none for a tier there is not) */
export function fishOfTier(tier: number): readonly number[] {
  return BY_TIER[tier] ?? [];
}

/**
 * How common a kind is among the kinds of its rarity (docs/V3/plan/fishing-feel.md §11): a bait draws every fish of its
 * rarity and which of them comes is chance, a chance that favours the first waters' kinds, the familiar ones, over the
 * far waters' — a kind of the tenth water comes about half as often as one of the first. The pond's stock is drawn by it.
 */
export function kindWeight(def: FishDef): number {
  return 1 / (1 + 0.12 * def.spot);
}

/** a kind out of a list (indices into FISH) drawn by their weights (kindWeight) with one die u in [0, 1) */
export function pickKind(kinds: readonly number[], u: number): number {
  let sum = 0;
  for (const i of kinds) sum += kindWeight(ALL[i]);
  let x = u * sum;
  for (const i of kinds) {
    x -= kindWeight(ALL[i]);
    if (x < 0) return i;
  }
  return kinds[kinds.length - 1];
}

/** kilograms per cm³ for a family (a fish of length L weighs k · L³) */
export const FAMILY_K: Readonly<Record<Family, number>> = {
  fusiform: 1.12e-5,
  carp: 1.6e-5,
  perch: 1.56e-5,
  disc: 3.1e-5,
  eel: 2.3e-6,
  catfish: 9.8e-6,
  pike: 7.8e-6,
  flat: 1.4e-5,
  ancient: 7.4e-6,
  round: 3.8e-5,
  squid: 1.85e-5,
  octopus: 1.85e-5,
  crayfish: 2.9e-5,
  frog: 1.2e-4,
  turtle: 1.6e-4,
  tetra: 1.85e-5,
  cube: 6.4e-5,
};

/** what a fish of this kind weighs at this length (kg) */
export function kgOf(def: FishDef, cm: number): number {
  return (def.k ?? FAMILY_K[def.family]) * cm * cm * cm;
}
