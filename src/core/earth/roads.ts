/**
 * The emergent Earth's roads (docs/V3/plan/scenic-roads.md, docs/V3/nodes/R2-roads.md): the kinds of scenic road a
 * place may be driven by — a shelf cut into a valley's side with the far wall across the void, a skyline drive along
 * a ridge, a road at the foot of a gorge, a cliff road over the sea, a lane through a tunnel of trees, the long
 * swell of the grassland, a road wound between the dunes, the one straight to the vanishing point over a salt pan …
 * — and the director of the roads, who gives each place the road that suits it and the journey: never the same twice
 * running, the closed and the open, the winding and the flowing, the climbing and the level in turn, a road one
 * remembers never far off.
 *
 * The rules are the great scenic roads' (the Blue Ridge Parkway's designer, Stanley Abbott: variety above all —
 * "following a mountain stream for a while, then climbing up on the slope of a hill pasture, then dipping down into
 * the open bottom lands and back into the woodlands"; the intimate glimpse against the heroic panorama; Appleyard,
 * Lynch and Myer, The View from the Road, 1964: a drive is a sequence, its rhythm of enclosure and openness, of
 * motion and of views revealed; the Norwegian Scenic Routes: the road's best places given to the view).
 *
 * Pure and DOM-free. A type says what a road is like — its country's cross-section stretch by stretch, how it winds,
 * how it rises and falls, how closed in it is, how far one sees — and the world makes the road of it
 * (world/earth/region.ts).
 */
import { growingAt, wetnessAt } from './climate';
import type { EarthJourney, Scene } from './director';
import { SCENE_LENGTH } from './director';

/** the cross-section of a stretch of road (world/landform.ts LandKind): the five of before and the scenic roads' own */
export type RoadLand = 'open' | 'hillside' | 'valley' | 'ridge' | 'canyon' | 'shelf' | 'rim';

export type RoadId =
  | 'shelf'
  | 'switchback'
  | 'pass'
  | 'skyline'
  | 'gorge'
  | 'valley'
  | 'cliff_coast'
  | 'shore'
  | 'lakeshore'
  | 'forest_tunnel'
  | 'swell'
  | 'sweepers'
  | 'straight'
  | 'dune_road'
  | 'rim'
  | 'terrace_road'
  | 'tower_road'
  | 'lava_road'
  | 'ice_valley'
  | 'plateau_road'
  | 'hill_twister'
  | 'river_road'
  | 'heath_road'
  | 'orchard_lane';

/** how a road winds (world/biomes.ts RegionDef's road fields) */
export interface RoadAlign {
  /** its design speed (km/h): how tight its tightest curve is */
  kmh: number;
  /** how often a straight follows a curve, and how long a straight is (m) */
  straight: number;
  straightLen: readonly [number, number];
  /** how far a curve turns (degrees), and how much wider than the tightest its radius may be */
  turn: readonly [number, number];
  spread: number;
}

/** how a road rises and falls: the swell of its grade (rise over run), over what length (m), and its steepest */
export interface RoadGrade {
  amp: number;
  len: number;
  max: number;
}

export interface RoadType {
  id: RoadId;
  zh: string;
  /** what one remembers of it */
  moment: string;
  /** how well it suits a place, 0 (it cannot be built there) … 1 */
  fit(sc: Scene): number;
  /** its country's cross-section, stretch by stretch of the place's four */
  land: readonly RoadLand[];
  align: RoadAlign;
  grade: RoadGrade;
  /** how closed in it is (0 open on every side … 1 walls or trees close on both), how much it winds (0 … 1), how far one sees from it (0 … 1) */
  enclosed: number;
  twist: number;
  view: number;
  /** a road one remembers (the director keeps one never far off) */
  wow?: boolean;
  /** trees close along both sides (0 … 1): an avenue, a tunnel of crowns */
  avenue?: number;
  /** the stretches (0 … 3) it climbs in a switchback stack: legs across a steep face joined by hairpin bends */
  hairpins?: readonly number[];
}

/** (docs/V3/nodes/R3-structures.md) the surface and edges of each kind of road (world/roadStyles.ts ROAD_STYLES 'road:…'), and the stretch its view is given a lookout at */
export const ROAD_BUILD: Readonly<Record<RoadId, { style: string; lookout?: number }>> = {
  shelf: { style: 'road:mountain', lookout: 2 },
  switchback: { style: 'road:mountain', lookout: 3 },
  pass: { style: 'road:mountain', lookout: 2 },
  skyline: { style: 'road:upland', lookout: 1 },
  gorge: { style: 'road:mountain' },
  valley: { style: 'road:parkway' },
  cliff_coast: { style: 'road:corniche', lookout: 1 },
  shore: { style: 'road:parkway' },
  lakeshore: { style: 'road:parkway' },
  forest_tunnel: { style: 'road:track' },
  swell: { style: 'road:open' },
  sweepers: { style: 'road:open' },
  straight: { style: 'road:desert' },
  dune_road: { style: 'road:desert' },
  rim: { style: 'road:upland', lookout: 2 },
  terrace_road: { style: 'road:slabs', lookout: 2 },
  tower_road: { style: 'road:slabs' },
  lava_road: { style: 'road:open' },
  ice_valley: { style: 'road:mountain' },
  plateau_road: { style: 'road:upland' },
  hill_twister: { style: 'road:lane' },
  river_road: { style: 'road:parkway' },
  heath_road: { style: 'road:upland' },
  orchard_lane: { style: 'road:lane' },
};

const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const ramp = (x: number, a: number, b: number): number => clamp((x - a) / (b - a), 0, 1);
const align = (kmh: number, straight: number, straightLen: readonly [number, number], turn: readonly [number, number], spread: number): RoadAlign => ({ kmh, straight, straightLen, turn, spread });
const grade = (amp: number, len: number, max: number): RoadGrade => ({ amp, len, max });

const W = (sc: Scene): number => wetnessAt(sc.macro, sc.macro.base);
const mountainous = (sc: Scene): boolean => sc.macro.context === 'mountain' || sc.macro.context === 'valley';
const wooded = (sc: Scene): boolean => sc.look.efg.struct === 'closed_forest' || (sc.look.efg.struct === 'open_forest' && sc.look.efg.cover > 0.55);
const lf = (sc: Scene): string => sc.look.landform.id;

/**
 * The kinds of road. Each its country, its winding and its grades, its rhythm's three numbers, and the test of a
 * place it can be built in.
 */
export const ROADS: readonly RoadType[] = [
  {
    id: 'shelf',
    zh: '傍山路',
    moment: '路凿在山腰上，一侧是石壁，另一侧几百米下是谷底，对面整面山墙',
    fit: (sc) => (mountainous(sc) || sc.macro.context === 'hills' ? ramp(sc.macro.relief, 300, 700) : 0) * (sc.look.efg.struct === 'ice' ? 0.3 : 1),
    land: ['hillside', 'shelf', 'shelf', 'shelf'],
    align: align(45, 0.18, [40, 140], [25, 75], 2.6),
    grade: grade(0.025, 900, 0.07),
    enclosed: 0.4,
    twist: 0.75,
    view: 1,
    wow: true,
  },
  {
    id: 'switchback',
    zh: '盘山路',
    moment: '一个接一个的急弯一层层爬上山坡，回头能看见刚走过的路就在脚下',
    fit: (sc) => (sc.macro.context === 'mountain' && (sc.move === 'climb' || sc.move === 'descend' || sc.move === 'plateau') ? ramp(sc.macro.relief, 450, 900) : 0),
    land: ['hillside', 'open', 'open', 'hillside'],
    align: align(30, 0.12, [30, 90], [40, 80], 1.6),
    grade: grade(0.035, 500, 0.085),
    hairpins: [1, 2],
    enclosed: 0.3,
    twist: 1,
    view: 0.85,
    wow: true,
  },
  {
    id: 'pass',
    zh: '垭口路',
    moment: '一路爬到垭口，翻过去的那一刻，整片新地方在脚下铺开',
    fit: (sc) => (sc.moment.startsWith('翻过山口') ? 1 : sc.macro.context === 'mountain' && sc.move === 'climb' ? 0.55 : 0),
    land: ['valley', 'hillside', 'ridge', 'hillside'],
    align: align(50, 0.2, [60, 220], [20, 70], 2.4),
    grade: grade(0.03, 1100, 0.08),
    enclosed: 0.5,
    twist: 0.65,
    view: 0.9,
    wow: true,
  },
  {
    id: 'skyline',
    zh: '山脊路',
    moment: '路骑在山脊上，两边都往下落，左右都能看到很远',
    fit: (sc) => (['hills', 'mountain', 'plateau', 'coast'].includes(sc.macro.context) ? ramp(sc.macro.relief, 120, 400) : 0) * (sc.look.efg.struct === 'ice' ? 0.3 : 1),
    land: ['ridge', 'ridge', 'ridge', 'hillside'],
    align: align(65, 0.3, [120, 380], [12, 50], 3.6),
    grade: grade(0.04, 800, 0.075),
    enclosed: 0,
    twist: 0.45,
    view: 1,
    wow: true,
  },
  {
    id: 'gorge',
    zh: '峡谷路',
    moment: '两侧的崖壁越收越紧，天只剩一条缝，路贴着谷底转来转去',
    fit: (sc) => (sc.look.landform.silhouette === 'canyon' || lf(sc) === 'waterfall_gorge' ? 1 : mountainous(sc) && ['limestone', 'dolomite', 'sandstone_red', 'sandstone_pale', 'granite'].includes(sc.macro.rock) ? 0.5 * ramp(sc.macro.relief, 300, 700) : 0),
    land: ['canyon', 'canyon', 'canyon', 'valley'],
    align: align(45, 0.15, [40, 140], [30, 85], 2),
    grade: grade(0.02, 700, 0.06),
    enclosed: 1,
    twist: 0.85,
    view: 0.25,
    wow: true,
  },
  {
    id: 'valley',
    zh: '河谷路',
    moment: '宽阔的谷底，两侧的山一层层退远，路顺着谷底缓缓弯',
    fit: (sc) => (sc.macro.context === 'valley' ? 1 : sc.macro.context === 'mountain' ? 0.6 : sc.macro.context === 'hills' ? 0.25 : 0),
    land: ['valley', 'valley', 'open', 'valley'],
    align: align(70, 0.35, [150, 420], [12, 45], 3.4),
    grade: grade(0.02, 1000, 0.06),
    enclosed: 0.6,
    twist: 0.35,
    view: 0.55,
  },
  {
    id: 'cliff_coast',
    zh: '海崖路',
    moment: '路在海崖顶上绕着海湾走，几十米下是拍岸的浪',
    fit: (sc) => (lf(sc) === 'sea_cliffs' || lf(sc) === 'sea_stacks' ? 1 : sc.macro.water === 'coast' || sc.macro.context === 'coast' ? (['granite', 'basalt', 'limestone', 'schist', 'sandstone_red', 'sandstone_pale', 'dolomite', 'rhyolite'].includes(sc.macro.rock) ? 1 : 0.45) * (0.4 + 0.6 * ramp(sc.macro.relief, 40, 200)) : 0),
    land: ['hillside', 'shelf', 'shelf', 'hillside'],
    align: align(50, 0.2, [50, 160], [25, 80], 2.6),
    grade: grade(0.035, 700, 0.075),
    enclosed: 0.3,
    twist: 0.75,
    view: 1,
    wow: true,
  },
  {
    id: 'shore',
    zh: '海边低路',
    moment: '路贴着海滩，车窗外就是浪花和一整条海平线',
    fit: (sc) => (sc.macro.water === 'coast' || sc.macro.context === 'coast' ? 1 - 0.6 * ramp(sc.macro.relief, 80, 250) : 0),
    land: ['open', 'hillside', 'hillside', 'open'],
    align: align(70, 0.35, [120, 380], [12, 45], 3.2),
    grade: grade(0.015, 900, 0.05),
    enclosed: 0.1,
    twist: 0.35,
    view: 0.95,
  },
  {
    id: 'lakeshore',
    zh: '湖岸路',
    moment: '路沿着湖岸弯，湖面上倒映着对岸的山',
    fit: (sc) => (sc.macro.water === 'lake' || sc.macro.water === 'wetland' ? 1 : 0),
    land: ['open', 'open', 'valley', 'open'],
    align: align(60, 0.25, [80, 260], [18, 60], 3),
    grade: grade(0.015, 900, 0.05),
    enclosed: 0.3,
    twist: 0.5,
    view: 0.8,
    wow: true,
  },
  {
    id: 'forest_tunnel',
    zh: '林荫道',
    moment: '两侧的大树在头顶合拢，光从树叶缝里一格一格地漏下来',
    fit: (sc) => (wooded(sc) ? 1 : sc.look.efg.struct === 'woodland' || sc.look.efg.struct === 'open_forest' ? 0.4 : 0),
    land: ['valley', 'open', 'valley', 'open'],
    align: align(55, 0.22, [60, 200], [20, 65], 2.6),
    grade: grade(0.03, 600, 0.065),
    enclosed: 1,
    twist: 0.6,
    view: 0.1,
    avenue: 1,
    wow: true,
  },
  {
    id: 'swell',
    zh: '草原波浪路',
    moment: '路像过山车一样一起一伏，每爬上一道坡顶，前面又是一整片草原',
    fit: (sc) => (['grassland', 'savanna', 'farmland', 'tundra', 'shrubland'].includes(sc.look.efg.struct) && ['hills', 'plain', 'plateau', 'basin'].includes(sc.macro.context) ? 0.5 + 0.5 * ramp(sc.macro.relief, 30, 150) : 0),
    land: ['open', 'ridge', 'open', 'open'],
    align: align(85, 0.4, [220, 520], [8, 30], 4.4),
    grade: grade(0.075, 380, 0.085),
    enclosed: 0,
    twist: 0.2,
    view: 0.85,
    wow: true,
  },
  {
    id: 'sweepers',
    zh: '平原弯道',
    moment: '一个个舒展的大弯，地平线跟着方向盘一起慢慢转',
    fit: (sc) => (['plain', 'basin', 'plateau'].includes(sc.macro.context) ? 0.7 : sc.macro.context === 'hills' ? 0.35 : 0),
    land: ['open', 'open', 'hillside', 'open'],
    align: align(72, 0.16, [100, 260], [25, 70], 2.8),
    grade: grade(0.025, 1200, 0.05),
    enclosed: 0.15,
    twist: 0.3,
    view: 0.75,
  },
  {
    id: 'straight',
    zh: '天际直路',
    moment: '一条直线一直伸到地平线，路面在热气里像水',
    fit: (sc) => (sc.macro.water === 'salt' || lf(sc) === 'salt_flat' || lf(sc) === 'salt_lake' ? 1 : W(sc) < 0.18 && ['plain', 'basin', 'plateau'].includes(sc.macro.context) && sc.macro.relief < 120 ? 0.35 : 0),
    land: ['open', 'open', 'open', 'open'],
    align: align(110, 0.85, [1400, 2600], [4, 12], 6),
    grade: grade(0.006, 2000, 0.03),
    enclosed: 0,
    twist: 0,
    view: 1,
    wow: true,
  },
  {
    id: 'dune_road',
    zh: '沙丘路',
    moment: '路在沙丘之间穿行，转过一道沙梁又是一道沙梁',
    fit: (sc) => (sc.look.landform.silhouette === 'dunes' ? 1 : 0),
    land: ['open', 'open', 'open', 'open'],
    align: align(60, 0.3, [100, 300], [15, 55], 3),
    grade: grade(0.035, 400, 0.06),
    enclosed: 0.35,
    twist: 0.5,
    view: 0.6,
    wow: true,
  },
  {
    id: 'rim',
    zh: '峡谷边缘路',
    moment: '路沿着峡谷的边缘走，一侧的地面突然断开，几百米深的峡谷就在车窗外',
    fit: (sc) => (sc.look.landform.silhouette === 'tables' || sc.look.landform.silhouette === 'canyon' || lf(sc) === 'escarpment' ? (sc.macro.context === 'plateau' || sc.macro.context === 'basin' || sc.macro.context === 'plain' ? 1 : 0.6) : 0),
    land: ['open', 'rim', 'rim', 'open'],
    align: align(60, 0.3, [80, 300], [15, 55], 3),
    grade: grade(0.012, 900, 0.04),
    enclosed: 0.1,
    twist: 0.45,
    view: 1,
    wow: true,
  },
  {
    id: 'terrace_road',
    zh: '梯田路',
    moment: '路在梯田间盘绕，一层层水田像镜子一样叠上山',
    fit: (sc) => (sc.look.efg.code === 'T7.1r' || sc.look.efg.code === 'T7.1t' ? 1 : 0),
    land: ['hillside', 'valley', 'hillside', 'hillside'],
    align: align(40, 0.15, [40, 120], [30, 90], 2.2),
    grade: grade(0.04, 500, 0.075),
    enclosed: 0.35,
    twist: 0.85,
    view: 0.75,
    wow: true,
  },
  {
    id: 'tower_road',
    zh: '峰林路',
    moment: '路在一座座拔地而起的石峰之间绕行',
    fit: (sc) => (sc.look.landform.silhouette === 'towers' ? 1 : 0),
    land: ['open', 'valley', 'open', 'open'],
    align: align(50, 0.2, [60, 200], [25, 75], 2.6),
    grade: grade(0.015, 700, 0.05),
    enclosed: 0.55,
    twist: 0.7,
    view: 0.55,
    wow: true,
  },
  {
    id: 'lava_road',
    zh: '熔岩原路',
    moment: '黑色的熔岩一直铺到火山脚下，路像一条刀切的线',
    fit: (sc) => (lf(sc) === 'lava_field' || lf(sc) === 'cinder_cones' || sc.macro.disturb === 'lava' ? 1 : 0),
    land: ['open', 'open', 'ridge', 'open'],
    align: align(75, 0.45, [200, 600], [10, 40], 3.6),
    grade: grade(0.02, 900, 0.05),
    enclosed: 0.1,
    twist: 0.3,
    view: 0.9,
    wow: true,
  },
  {
    id: 'ice_valley',
    zh: '冰川谷路',
    moment: 'U 形的大谷两侧是冰川磨出来的峭壁，谷头挂着冰川',
    fit: (sc) => (sc.look.landform.process === 'glacial' && lf(sc) !== 'drumlins' ? 1 : 0),
    land: ['valley', 'valley', 'valley', 'valley'],
    align: align(60, 0.3, [100, 320], [15, 55], 3),
    grade: grade(0.02, 1000, 0.06),
    enclosed: 0.7,
    twist: 0.4,
    view: 0.6,
    wow: true,
  },
  {
    id: 'plateau_road',
    zh: '高原路',
    moment: '天低得像能摸到，远处的雪山一直跟着，路在高原上慢慢起伏',
    fit: (sc) => (sc.macro.context === 'plateau' ? 0.5 + 0.5 * ramp(sc.macro.base, 1800, 3800) : 0),
    land: ['open', 'ridge', 'open', 'open'],
    align: align(80, 0.35, [200, 500], [10, 40], 4),
    grade: grade(0.03, 1000, 0.06),
    enclosed: 0,
    twist: 0.3,
    view: 1,
  },
  {
    id: 'hill_twister',
    zh: '丘陵蜿蜒路',
    moment: '小山包一个连一个，路左拐右拐、上上下下，一刻也不让你闲着',
    fit: (sc) => (sc.macro.context === 'hills' ? ramp(sc.macro.relief, 50, 160) * (1 - 0.5 * ramp(sc.macro.relief, 350, 600)) : 0),
    land: ['hillside', 'ridge', 'hillside', 'valley'],
    align: align(45, 0.12, [40, 120], [30, 95], 2),
    grade: grade(0.06, 260, 0.085),
    enclosed: 0.45,
    twist: 1,
    view: 0.45,
  },
  {
    id: 'river_road',
    zh: '沿河路',
    moment: '河就在路边，一会儿跑到左边，一会儿从桥下穿到右边',
    fit: (sc) => (sc.macro.water === 'river' ? 1 : sc.look.landform.process === 'fluvial' ? 0.6 : 0),
    land: ['valley', 'open', 'valley', 'open'],
    align: align(60, 0.25, [80, 260], [18, 60], 2.8),
    grade: grade(0.015, 900, 0.05),
    enclosed: 0.45,
    twist: 0.55,
    view: 0.5,
  },
  {
    id: 'heath_road',
    zh: '荒原路',
    moment: '一棵树也没有的荒原，风贴着地面吹，路细得像一根线',
    fit: (sc) => (['tundra', 'shrubland', 'bare', 'desert', 'grassland'].includes(sc.look.efg.struct) && growingAt(sc.macro, sc.macro.base) < 12 ? 0.8 : ['tundra', 'bare'].includes(sc.look.efg.struct) ? 0.6 : 0),
    land: ['open', 'hillside', 'open', 'ridge'],
    align: align(70, 0.35, [150, 450], [12, 45], 3.6),
    grade: grade(0.03, 700, 0.06),
    enclosed: 0,
    twist: 0.35,
    view: 0.9,
  },
  {
    id: 'orchard_lane',
    zh: '田园小路',
    moment: '路两旁是一行行的树和田，村子在前面的山坡上',
    fit: (sc) => (sc.look.efg.struct === 'farmland' ? 1 : sc.look.efg.group === 'T7' ? 0.8 : 0),
    land: ['open', 'hillside', 'open', 'valley'],
    align: align(55, 0.3, [80, 240], [15, 60], 2.6),
    grade: grade(0.025, 600, 0.06),
    enclosed: 0.4,
    twist: 0.55,
    view: 0.6,
    avenue: 0.6,
  },
];

export const ROAD: Readonly<Record<RoadId, RoadType>> = Object.fromEntries(ROADS.map((r) => [r.id, r])) as Record<RoadId, RoadType>;

/** the road a place falls back to when nothing else fits it (by the lie of its land) */
function fallback(sc: Scene): RoadId {
  switch (sc.macro.context) {
    case 'mountain':
    case 'valley':
      return 'valley';
    case 'hills':
      return 'hill_twister';
    case 'coast':
      return 'shore';
    default:
      return 'sweepers';
  }
}

/** a number 0 … 1 of a place's own (its world's seed, its index) */
function dice(seed: number, k: number): number {
  let x = (Math.imul(seed | 0, 0x2c1b3c6d) ^ Math.imul(k + 0x51ed, 0x297a2d39)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** how many places back the director looks for a road it has given (and how much less it likes giving it again) */
const MEMORY: readonly number[] = [0.04, 0.35, 0.55, 0.75, 0.85, 0.92];
/** after this many places without a road one remembers the director goes looking for one */
const WOW_AFTER = 2;

/**
 * The director of the roads: each place of a journey its road, in order — the best of the roads that suit it, by
 * how well it suits it, how long since the journey had it (never twice running), how unlike the road before it is
 * (the closed after the open, the winding after the flowing, the long view after the short), and how long since
 * a road one remembers. Among the best two or three the place's own dice choose, the better the likelier.
 */
export class RoadDirector {
  private readonly roads: RoadId[] = [];

  constructor(
    readonly journey: EarthJourney,
    readonly seed: number,
  ) {}

  /** the road of place k (place 0, home, is the road the world began with: the director's first choice there all the same) */
  roadOf(k: number): RoadType {
    while (this.roads.length <= k) this.roads.push(this.choose(this.roads.length));
    return ROAD[this.roads[k]];
  }

  /** the roads of places 0 … n − 1 */
  list(n: number): RoadType[] {
    this.roadOf(n - 1);
    return this.roads.slice(0, n).map((id) => ROAD[id]);
  }

  private choose(k: number): RoadId {
    const sc = this.journey.sceneAt(k * SCENE_LENGTH + 1);
    const prev = k > 0 ? ROAD[this.roads[k - 1]] : null;
    let sinceWow = 0;
    for (let i = this.roads.length - 1; i >= 0 && !ROAD[this.roads[i]].wow; i--) sinceWow++;
    const scored: { id: RoadId; score: number }[] = [];
    for (const r of ROADS) {
      const f = r.fit(sc);
      if (f <= 0) continue;
      let score = f;
      // (how long since the journey had it)
      for (let back = 1; back <= MEMORY.length && back <= this.roads.length; back++) {
        if (this.roads[this.roads.length - back] === r.id) {
          score *= MEMORY[back - 1];
          break;
        }
      }
      // (a road the journey has never had yet: the more welcome)
      if (!this.roads.includes(r.id)) score *= 1.25;
      // (how unlike the road before: closed against open, winding against flowing, the long view against the short)
      if (prev) {
        const contrast = Math.abs(r.enclosed - prev.enclosed) + Math.abs(r.twist - prev.twist) + Math.abs(r.view - prev.view);
        score *= 0.55 + 0.45 * Math.min(1, contrast / 1.2);
      }
      // (a road one remembers, the more eagerly the longer it has been)
      if (r.wow && sinceWow >= WOW_AFTER) score *= 1 + 0.35 * (sinceWow - WOW_AFTER + 1);
      scored.push({ id: r.id, score });
    }
    if (!scored.length) return fallback(sc);
    scored.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
    // (the best two or three, the better the likelier: the place's own dice)
    const top = scored.filter((x, i) => i < 3 && x.score >= 0.6 * scored[0].score);
    const total = top.reduce((a, x) => a + x.score * x.score, 0);
    let u = dice(this.seed, k) * total;
    for (const x of top) {
      u -= x.score * x.score;
      if (u <= 0) return x.id;
    }
    return top[top.length - 1].id;
  }
}
