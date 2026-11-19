/**
 * Regional scene references. Calendar arrays run January–December in both hemispheres.
 * Climate uses NASA POWER daily MERRA-2, 2001–2020. See road-ecology.md for points,
 * aggregation, terrain overrides, source URLs and evidence limits.
 */
import type { BiomeDef } from '../biomes';

export const ECO_TREE_FAMILIES = [
  'giant_broadleaf', 'birch', 'spruce', 'redwood', 'fir', 'pine', 'larch', 'beech',
  'maple', 'oak', 'camphor', 'cedar', 'dwarf_pine', 'cypress', 'stone_pine', 'aspen',
  'chestnut', 'linden', 'ash', 'olive', 'eucalyptus', 'rhododendron', 'acacia', 'coconut_palm',
  'fan_palm', 'saguaro', 'joshua_tree', 'tree_fern', 'desert_poplar', 'broadleaf', 'conifer', 'willow',
  'poplar', 'juniper', 'bamboo', 'baobab', 'cactus',
] as const;
export type EcoTreeFamily = typeof ECO_TREE_FAMILIES[number];
type Months = readonly [number, number, number, number, number, number, number, number, number, number, number, number];
/** DJF, MAM, JJA, SON. Null means no threshold is specified for this landscape. */
type Seasons = readonly [number | null, number | null, number | null, number | null];

export interface EcoBand {
  readonly fromM: number;
  readonly toM: number;
  readonly habitat: string;
  /** Regional tree forms still awaiting models in this band. */
  readonly pendingTrees?: readonly string[];
  /** Conditional shares among available tree models, never canopy density. */
  readonly trees: readonly { family: EcoTreeFamily; name: string; taxon: string; share: number }[];
  readonly shrubs: readonly string[];
  readonly ground: readonly string[];
  readonly flowers: readonly { name: string; colors: readonly string[]; bloomMonths: readonly number[] }[];
}

export interface EcoProfile {
  readonly id: string;
  readonly name: string;
  readonly kin: BiomeDef['kin'];
  readonly roads: readonly string[];
  readonly climate: {
    reference: string;
    latitude: number;
    longitude: number;
    gridElevationM: number;
    highC: Months;
    lowC: Months;
    precipMm: Months;
    /** Mean snow-covered fraction of land (FRSNO), or a documented local terrain estimate. */
    snowCover: Months;
    snowBasis: 'terrain-estimate' | 'grid-area-fraction';
  };
  readonly bands: readonly EcoBand[];
  readonly treelineM: Seasons;
  /** Seasonal visible snow margin estimates, not glacier equilibrium-line altitudes. */
  readonly snowlineM: Seasons;
  readonly birds: readonly { name: string; habitat: string }[];
  readonly insects: readonly { name: string; months: readonly number[]; activity: 'day' | 'night'; habitat: string }[];
  readonly rocks: readonly { type: string; color: string; form: string; share: number }[];
  readonly roadStyles: readonly string[];
  /** A self-edge continues through another local habitat; widths are designed driving distances. */
  readonly transitions: readonly { to: string; widthM: number; reason: string }[];
  readonly needsModel: readonly string[];
}

export const ECO_PROFILES: readonly EcoProfile[] = [
  {
    id: 'sierra-valley',
    name: '内华达花岗岩谷底',
    kin: 'plains',
    roads: ['优胜美地 Valley Loop（Northside / Southside Drive）'],
    climate: {
      reference: '优胜美地 Valley Loop（Northside / Southside Drive）',
      latitude: 37.74,
      longitude: -119.58,
      gridElevationM: 2125.74,
      highC: [3.9, 3.9, 6.2, 10, 15.6, 22.2, 27, 26.4, 23, 17, 10, 3.8],
      lowC: [-6.3, -6.5, -4.8, -2.1, 2, 6.7, 11.6, 10.7, 7.2, 2.5, -1.8, -6.3],
      precipMm: [115.9, 110.4, 97.7, 61.5, 34.7, 7.8, 8.1, 5.9, 6.1, 38.7, 60.9, 125.1],
      snowCover: [0.35, 0.35, 0.2, 0.04, 0, 0, 0, 0, 0, 0, 0.06, 0.25],
      snowBasis: 'terrain-estimate',
    },
    bands: [
      {
        fromM: 1100,
        toM: 1800,
        habitat: '河阶与林缘，季淹草甸留空',
        trees: [
          { family: 'oak', name: '黑栎', taxon: 'Quercus kelloggii', share: 0.45 },
          { family: 'pine', name: '西黄松', taxon: 'Pinus ponderosa', share: 0.55 },
        ],
        shrubs: ['熊果灌丛'],
        ground: ['莎草', '草甸禾草'],
        flowers: [
          { name: '加州罂粟', colors: ['橙'], bloomMonths: [4, 5, 6] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [1200, 1900, null, 2300],
    birds: [
      { name: '暗冠蓝鸦', habitat: '林缘枝头' },
      { name: '美洲河乌', habitat: '急流石上' },
    ],
    insects: [
      { name: '熊蜂', months: [4, 5, 6, 7, 8, 9], activity: 'day', habitat: '晴暖草甸' },
      { name: '蜻蜓', months: [6, 7, 8, 9], activity: 'day', habitat: '池塘静水' },
    ],
    rocks: [
      { type: '花岗岩', color: '灰白', form: '剥片巨壁', share: 0.8 },
      { type: '冲积砾', color: '灰褐', form: '河滩圆石', share: 0.2 },
    ],
    roadStyles: ['valley floor', 'river bend'],
    transitions: [
      { to: 'sierra-high', widthM: 4200, reason: '沿支谷爬升，黑栎退出后松杉林渐密' },
    ],
    needsModel: [],
  },
  {
    id: 'sierra-high',
    name: '内华达高山草甸',
    kin: 'alpine',
    roads: ['优胜美地 Tioga Road'],
    climate: {
      reference: '优胜美地 Tioga Road（Tuolumne 一带格点）',
      latitude: 37.87,
      longitude: -119.37,
      gridElevationM: 2554.64,
      highC: [0.5, 0.3, 2.7, 6.8, 13.2, 19.7, 24.5, 24.1, 20.4, 14.1, 6.5, 0.4],
      lowC: [-9.9, -10, -8.3, -5, -0.4, 4.2, 9.3, 8.3, 4.5, -0.3, -4.9, -9.8],
      precipMm: [103.1, 100.6, 90, 56.1, 37.1, 11.5, 14.1, 9.2, 8.8, 37.6, 61.2, 118],
      snowCover: [0.696, 0.68, 0.57, 0.252, 0.024, 0.001, 0, 0, 0.001, 0.035, 0.167, 0.59],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 1800,
        toM: 2650,
        habitat: '山地针叶林；雪花草限林下',
        trees: [
          { family: 'pine', name: '洋松', taxon: 'Pinus jeffreyi', share: 0.45 },
          { family: 'fir', name: '红冷杉', taxon: 'Abies magnifica', share: 0.55 },
        ],
        shrubs: ['熊果灌丛'],
        ground: ['林下针叶毡'],
        flowers: [
          { name: '雪花草', colors: ['深红'], bloomMonths: [5, 6, 7] },
        ],
      },
      {
        fromM: 2650,
        toM: 2900,
        habitat: '林岛与湿草甸镶嵌',
        trees: [
          { family: 'pine', name: '扭叶松', taxon: 'Pinus contorta', share: 0.8 },
          { family: 'pine', name: '西部白松', taxon: 'Pinus monticola', share: 0.2 },
        ],
        shrubs: ['矮柳'],
        ground: ['莎草', '岩面地衣'],
        flowers: [
          { name: '沼泽金盏草类', colors: ['白'], bloomMonths: [6, 7, 8] },
        ],
      },
      {
        fromM: 2900,
        toM: 3700,
        habitat: '林线以上的远景岩坡',
        trees: [],
        shrubs: ['矮柳'],
        ground: ['垫状草本', '裸岩'],
        flowers: [
          { name: '高山福禄考', colors: ['淡粉'], bloomMonths: [7, 8] },
        ],
      },
    ],
    treelineM: [2900, 2900, 2900, 2900],
    snowlineM: [1500, 2300, 3400, 2900],
    birds: [
      { name: '克拉克星鸦', habitat: '高处松冠' },
      { name: '山蓝鸲', habitat: '草甸边缘' },
    ],
    insects: [
      { name: '熊蜂', months: [6, 7, 8], activity: 'day', habitat: '融雪花带' },
      { name: '斑蝶类', months: [7, 8], activity: 'day', habitat: '有蜜源的林间空地' },
    ],
    rocks: [
      { type: '花岗岩', color: '灰白', form: '磨圆穹丘', share: 0.8 },
      { type: '冰碛', color: '灰褐', form: '混粒石垄', share: 0.2 },
    ],
    roadStyles: ['lakeshore', 'open pass'],
    transitions: [
      { to: 'sierra-valley', widthM: 4200, reason: '溪流下切并汇入混交林谷底' },
    ],
    needsModel: [],
  },
  {
    id: 'fog-redwood',
    name: '海雾红杉河谷',
    kin: 'plains',
    roads: ['加州 Avenue of the Giants', '加州一号公路 Big Sur'],
    climate: {
      reference: '加州 Avenue of the Giants',
      latitude: 40.32,
      longitude: -123.92,
      gridElevationM: 665.35,
      highC: [9.8, 10.3, 11.7, 13.9, 18, 23.2, 29.4, 29.7, 27.3, 21.3, 13.5, 9.1],
      lowC: [2.2, 2, 2.8, 3.9, 6.8, 9.1, 12.5, 12.6, 11.1, 7.7, 4, 1.8],
      precipMm: [205, 186.4, 191.1, 100.4, 48.4, 19.2, 3.4, 3.3, 17, 78.6, 146.8, 279.6],
      snowCover: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      snowBasis: 'terrain-estimate',
    },
    bands: [
      {
        fromM: 0,
        toM: 500,
        habitat: '河漫滩与湿润沟谷；巨干留明显空隙',
        pendingTrees: ['花旗松 Pseudotsuga menziesii'],
        trees: [
          { family: 'redwood', name: '海岸红杉', taxon: 'Sequoia sempervirens', share: 1 },
        ],
        shrubs: ['越橘'],
        ground: ['剑蕨', '红杉酢浆草'],
        flowers: [
          { name: '红杉酢浆草', colors: ['白', '淡粉'], bloomMonths: [3, 4, 5, 6] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '冬鹪鹩近缘的太平洋鹪鹩', habitat: '倒木根盘' },
      { name: '暗冠蓝鸦', habitat: '林缘' },
    ],
    insects: [
      { name: '熊蜂', months: [3, 4, 5, 6, 7, 8, 9], activity: 'day', habitat: '林缘开花灌木' },
      { name: '蜻蜓', months: [6, 7, 8, 9], activity: 'day', habitat: '河湾静水' },
    ],
    rocks: [
      { type: '冲积砾', color: '灰褐', form: '河滩圆石', share: 0.8 },
      { type: '砂岩', color: '灰褐', form: '河谷露头', share: 0.2 },
    ],
    roadStyles: ['forest tunnel', 'river bend'],
    transitions: [
      { to: 'sur-coast', widthM: 2500, reason: '模拟海岸横切支谷，沟内雾水与避风使红杉成立' },
    ],
    needsModel: ['花旗松 Pseudotsuga menziesii'],
  },
  {
    id: 'sur-coast',
    name: '加州地中海型海崖',
    kin: 'plains',
    roads: ['加州一号公路 Big Sur'],
    climate: {
      reference: '加州一号公路 Big Sur',
      latitude: 36.24,
      longitude: -121.77,
      gridElevationM: 94.12,
      highC: [13.7, 13.4, 13.7, 13.8, 14.5, 15.5, 16.5, 17.3, 17.9, 17.4, 15.6, 13.8],
      lowC: [11, 10.7, 10.8, 10.7, 11.4, 12.3, 13.5, 14.2, 14.5, 13.9, 12.6, 11.3],
      precipMm: [78.7, 78.3, 60.4, 29.2, 12.8, 3.6, 1.2, 1.7, 4.3, 21, 40.2, 94.1],
      snowCover: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      snowBasis: 'terrain-estimate',
    },
    bands: [
      {
        fromM: 0,
        toM: 150,
        habitat: '崖缘风剪灌丛；橡树限避风凹地',
        trees: [
          { family: 'oak', name: '海岸栎', taxon: 'Quercus agrifolia', share: 1 },
        ],
        shrubs: ['海岸鼠尾草'],
        ground: ['草甸禾草', '裸岩'],
        flowers: [
          { name: '加州罂粟', colors: ['橙'], bloomMonths: [3, 4, 5] },
        ],
      },
      {
        fromM: 150,
        toM: 650,
        habitat: '向海旱坡；下切到常流湿沟时切红杉原型',
        trees: [
          { family: 'oak', name: '海岸栎', taxon: 'Quercus agrifolia', share: 1 },
        ],
        shrubs: ['熊果灌丛', '加州丁香'],
        ground: ['硬叶灌丛落叶'],
        flowers: [
          { name: '加州丁香', colors: ['蓝', '白'], bloomMonths: [3, 4, 5] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '褐鹈鹕', habitat: '海浪上方' },
      { name: '美洲河乌', habitat: '入海溪' },
    ],
    insects: [
      { name: '粉蝶类', months: [3, 4, 5, 6, 7, 8, 9], activity: 'day', habitat: '晴天向阳灌坡' },
      { name: '野蜂', months: [3, 4, 5, 6, 7, 8], activity: 'day', habitat: '鼠尾草花' },
    ],
    rocks: [
      { type: '花岗岩', color: '灰白', form: '崖面坡脚块', share: 0.55 },
      { type: '变质岩', color: '灰褐', form: '片状崩壁', share: 0.45 },
    ],
    roadStyles: ['coastal ledge', 'river bend'],
    transitions: [
      { to: 'fog-redwood', widthM: 2500, reason: '海崖退进潮湿背风沟，限加州海岸红杉分布带' },
    ],
    needsModel: [],
  },
  {
    id: 'rocky-pass',
    name: '落基山林线公路',
    kin: 'alpine',
    roads: ['科罗拉多 Trail Ridge Road', '落基山 Bear Lake Road'],
    climate: {
      reference: '科罗拉多 Trail Ridge Road',
      latitude: 40.4,
      longitude: -105.75,
      gridElevationM: 2669.67,
      highC: [-2.5, -2.2, 2.9, 8, 13.9, 21.8, 25.5, 23.9, 19.7, 11.2, 4, -2.5],
      lowC: [-11.8, -12.1, -8.7, -4.9, -0.5, 4.9, 9.1, 8.1, 3.9, -2, -6.7, -11.7],
      precipMm: [34, 38.7, 47, 64.5, 68.3, 43.9, 53.6, 44.3, 41.7, 43.4, 35, 36.7],
      snowCover: [0.563, 0.591, 0.426, 0.167, 0.048, 0.002, 0, 0, 0.004, 0.06, 0.187, 0.467],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 2350,
        toM: 2850,
        habitat: '谷底草坡，杨树沿水分集中的沟',
        trees: [
          { family: 'pine', name: '西黄松', taxon: 'Pinus ponderosa', share: 0.6 },
          { family: 'aspen', name: '美洲山杨', taxon: 'Populus tremuloides', share: 0.4 },
        ],
        shrubs: ['矮柳'],
        ground: ['草甸禾草', '林下针叶毡'],
        flowers: [
          { name: '科罗拉多蓝耧斗菜', colors: ['蓝白'], bloomMonths: [6, 7, 8] },
        ],
      },
      {
        fromM: 2850,
        toM: 3450,
        habitat: '高处树冠受风倾斜',
        trees: [
          { family: 'spruce', name: '恩氏云杉', taxon: 'Picea engelmannii', share: 0.6 },
          { family: 'fir', name: '亚高山冷杉', taxon: 'Abies lasiocarpa', share: 0.4 },
        ],
        shrubs: ['矮柳'],
        ground: ['越橘地毯', '莎草'],
        flowers: [
          { name: '科罗拉多蓝耧斗菜', colors: ['蓝白'], bloomMonths: [6, 7, 8] },
        ],
      },
      {
        fromM: 3450,
        toM: 4000,
        habitat: '冰缘地和碎石，花限融雪后土袋',
        trees: [],
        shrubs: ['矮柳'],
        ground: ['垫状草本', '岩面地衣'],
        flowers: [
          { name: '高山勿忘草', colors: ['天蓝'], bloomMonths: [6, 7, 8] },
        ],
      },
    ],
    treelineM: [3450, 3450, 3450, 3450],
    snowlineM: [2200, 2750, 3800, 3100],
    birds: [
      { name: '白尾雷鸟', habitat: '无树岩坡' },
      { name: '克拉克星鸦', habitat: '林线上缘' },
    ],
    insects: [
      { name: '熊蜂', months: [6, 7, 8], activity: 'day', habitat: '林线花甸' },
      { name: '灰蝶类', months: [6, 7, 8], activity: 'day', habitat: '避风的石间花丛' },
    ],
    rocks: [
      { type: '花岗岩', color: '灰白', form: '块海与冰斗', share: 0.65 },
      { type: '片麻岩', color: '灰褐', form: '条带崖面', share: 0.35 },
    ],
    roadStyles: ['switchback pass', 'lakeshore', 'open plateau'],
    transitions: [
      { to: 'rocky-pass', widthM: 2300, reason: '越分水岭折入背风冰斗，按海拔依次重穿各带' },
    ],
    needsModel: [],
  },
  {
    id: 'redrock',
    name: '科罗拉多高原红岩',
    kin: 'desert',
    roads: ['犹他 Arches Scenic Drive', '峡谷地 Island in the Sky'],
    climate: {
      reference: '犹他 Arches Scenic Drive',
      latitude: 38.7,
      longitude: -109.57,
      gridElevationM: 1819.21,
      highC: [4, 6.3, 12.1, 16.6, 22.5, 30.2, 33.2, 30.8, 26.3, 18, 10.7, 3.8],
      lowC: [-5.9, -4.5, -1.1, 1.8, 7, 13.2, 17.8, 16.3, 11.7, 4.3, -1.2, -5.8],
      precipMm: [22.6, 22.7, 23.6, 21.8, 22.7, 11.6, 31.1, 30.9, 33.8, 31.2, 21.1, 27.3],
      snowCover: [0.12, 0.08, 0.02, 0, 0, 0, 0, 0, 0, 0, 0.01, 0.08],
      snowBasis: 'terrain-estimate',
    },
    bands: [
      {
        fromM: 1100,
        toM: 2000,
        habitat: '树限节理土袋，裸砂岩禁树',
        trees: [
          { family: 'juniper', name: '犹他刺柏', taxon: 'Juniperus osteosperma', share: 0.6 },
          { family: 'pine', name: '矮松', taxon: 'Pinus edulis', share: 0.4 },
        ],
        shrubs: ['黑刷灌木'],
        ground: ['生物结皮', '丛生旱草'],
        flowers: [
          { name: '沙漠锦葵', colors: ['橙'], bloomMonths: [4, 5, 6] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '渡鸦', habitat: '台地上升气流' },
      { name: '灌丛鸦', habitat: '圆柏林' },
    ],
    insects: [
      { name: '野蜂', months: [3, 4, 5, 6], activity: 'day', habitat: '雨后草花' },
      { name: '粉蝶类', months: [4, 5, 6, 7, 8, 9], activity: 'day', habitat: '沟底花带' },
    ],
    rocks: [
      { type: '砂岩', color: '赤红', form: '直立岩鳍', share: 0.65 },
      { type: '砂岩', color: '赭红', form: '层状台阶', share: 0.35 },
    ],
    roadStyles: ['open plateau', 'rim road'],
    transitions: [
      { to: 'redrock', widthM: 1600, reason: '岩面流出的水沿裂隙汇集，裸岩转为疏林台地' },
    ],
    needsModel: [],
  },
  {
    id: 'appalachian',
    name: '阿巴拉契亚阔叶山脊',
    kin: 'plains',
    roads: ['阿巴拉契亚 Blue Ridge Parkway', '仙纳度 Skyline Drive'],
    climate: {
      reference: '阿巴拉契亚 Blue Ridge Parkway',
      latitude: 35.5,
      longitude: -82.8,
      gridElevationM: 738.06,
      highC: [7, 8.9, 13.6, 18.9, 22.9, 27.1, 29, 28.9, 25.8, 20, 14, 9],
      lowC: [-3.2, -1.8, 2, 6.6, 11.6, 15.9, 17.7, 17.3, 13.9, 7.9, 2.1, -0.9],
      precipMm: [99, 98.4, 105.5, 112.9, 119.7, 117.1, 135.2, 119.2, 116.9, 97.8, 102.2, 124.3],
      snowCover: [0.034, 0.054, 0.012, 0.001, 0, 0, 0, 0, 0, 0, 0.009, 0.039],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 150,
        toM: 1350,
        habitat: '橡树林冠；湿沟槭与春季短命花',
        trees: [
          { family: 'oak', name: '北美红栎', taxon: 'Quercus rubra', share: 0.65 },
          { family: 'maple', name: '糖槭', taxon: 'Acer saccharum', share: 0.35 },
        ],
        shrubs: ['山月桂', '杜鹃'],
        ground: ['林下落叶', '地蕨'],
        flowers: [
          { name: '延龄草', colors: ['白'], bloomMonths: [4, 5] },
        ],
      },
      {
        fromM: 1350,
        toM: 1850,
        habitat: '限南阿巴拉契亚高峰；仙纳度的公路达不到此带；1350–1500 m仍可保留阔叶林镶嵌，冷杉限最高峰',
        trees: [
          { family: 'spruce', name: '红云杉', taxon: 'Picea rubens', share: 0.75 },
          { family: 'fir', name: '弗氏冷杉', taxon: 'Abies fraseri', share: 0.25 },
        ],
        shrubs: ['杜鹃'],
        ground: ['苔藓', '林下针叶毡'],
        flowers: [
          { name: '卡托巴杜鹃', colors: ['紫粉'], bloomMonths: [5, 6] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '红眼莺雀', habitat: '阔叶树冠' },
      { name: '绯红丽唐纳雀', habitat: '成熟林' },
    ],
    insects: [
      { name: '萤火虫', months: [6, 7], activity: 'night', habitat: '温暖湿夜的草甸林缘' },
      { name: '蝉', months: [7, 8, 9], activity: 'day', habitat: '阔叶树冠高温时' },
      { name: '熊蜂', months: [4, 5, 6, 7, 8, 9], activity: 'day', habitat: '杜鹃及草花' },
    ],
    rocks: [
      { type: '片麻岩', color: '灰褐', form: '条带崖面', share: 0.55 },
      { type: '变质岩', color: '灰色', form: '破碎山脊', share: 0.45 },
    ],
    roadStyles: ['ridge road', 'forest tunnel'],
    transitions: [
      { to: 'appalachian', widthM: 2600, reason: '北坡湿沟转日照山脊，林下灌丛随坡向变化' },
    ],
    needsModel: [],
  },
  {
    id: 'arctic-tundra',
    name: '布鲁克斯北坡苔原',
    kin: 'alpine',
    roads: ['阿拉斯加 Dalton Highway'],
    climate: {
      reference: '阿拉斯加 Dalton Highway',
      latitude: 68.78,
      longitude: -148.83,
      gridElevationM: 555.73,
      highC: [-20.8, -18.1, -15.6, -6.3, 3.4, 12.5, 14.2, 10.6, 4, -6.4, -15.8, -19.1],
      lowC: [-26.5, -24.8, -24.8, -15.6, -4.4, 4.7, 6.8, 3.3, -2.5, -11.9, -20.9, -24.5],
      precipMm: [19.9, 22.2, 19.3, 23.8, 43.3, 66.8, 96.8, 91.1, 64, 39.4, 26.9, 21.5],
      snowCover: [1, 1, 1, 0.999, 0.509, 0.016, 0.003, 0.023, 0.227, 0.759, 0.988, 0.999],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 0,
        toM: 1450,
        habitat: '湿地莎草，排水脊与碎石处低矮垫丛',
        trees: [],
        shrubs: ['矮柳', '矮桦'],
        ground: ['莎草', '棉花莎草', '岩面地衣'],
        flowers: [
          { name: '仙女木', colors: ['白'], bloomMonths: [6, 7] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [0, 0, 1300, 400],
    birds: [
      { name: '柳雷鸟', habitat: '矮柳' },
      { name: '苔原天鹅', habitat: '平原池塘' },
    ],
    insects: [
      { name: '蚊', months: [6, 7, 8], activity: 'day', habitat: '融水池背风处' },
      { name: '熊蜂', months: [6, 7], activity: 'day', habitat: '开花矮灌' },
    ],
    rocks: [
      { type: '冰碛', color: '灰褐', form: '混粒石垄', share: 0.55 },
      { type: '碎岩', color: '灰色', form: '冻融多边形', share: 0.45 },
    ],
    roadStyles: ['open plateau', 'valley floor'],
    transitions: [
      { to: 'alaska-taiga', widthM: 5500, reason: '越过山口下坡，沿温暖河谷渐见林线孤树' },
    ],
    needsModel: [],
  },
  {
    id: 'alaska-taiga',
    name: '阿拉斯加内陆泰加林',
    kin: 'plains',
    roads: ['阿拉斯加 Dalton Highway', '阿拉斯加 Parks Highway'],
    climate: {
      reference: '阿拉斯加 Parks Highway',
      latitude: 63.72,
      longitude: -148.88,
      gridElevationM: 1107.58,
      highC: [-15.4, -12.1, -9.2, -2.4, 4.2, 11.1, 12.8, 10.7, 4.8, -3.6, -12.6, -13.9],
      lowC: [-21.4, -19.6, -19.2, -10.8, -2.1, 4.2, 6.3, 4.5, -1, -9.6, -18.2, -19.6],
      precipMm: [40.4, 36, 37.6, 45.7, 72.1, 147.8, 160.6, 143.6, 111.2, 70.2, 52.5, 44.8],
      snowCover: [1, 1, 1, 0.983, 0.511, 0.007, 0.001, 0.002, 0.141, 0.759, 0.987, 0.998],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 100,
        toM: 850,
        habitat: '低洼冷土黑云杉矮且稀，排水河阶白云杉较高',
        trees: [
          { family: 'spruce', name: '黑云杉', taxon: 'Picea mariana', share: 0.45 },
          { family: 'spruce', name: '白云杉', taxon: 'Picea glauca', share: 0.4 },
          { family: 'birch', name: '白桦类', taxon: 'Betula neoalaskana', share: 0.15 },
        ],
        shrubs: ['矮柳', '越橘'],
        ground: ['苔藓', '岩面地衣'],
        flowers: [
          { name: '柳兰', colors: ['玫红'], bloomMonths: [6, 7, 8] },
        ],
      },
    ],
    treelineM: [850, 850, 850, 850],
    snowlineM: [100, 450, 1800, 850],
    birds: [
      { name: '灰噪鸦', habitat: '针叶枝间' },
      { name: '黑顶山雀', habitat: '林缘' },
    ],
    insects: [
      { name: '蚊', months: [5, 6, 7, 8], activity: 'day', habitat: '沼地静水' },
      { name: '蜻蜓', months: [6, 7, 8], activity: 'day', habitat: '林间池塘' },
    ],
    rocks: [
      { type: '冲积砾', color: '灰褐', form: '河滩圆石', share: 0.65 },
      { type: '冰碛', color: '灰褐', form: '混粒石垄', share: 0.35 },
    ],
    roadStyles: ['valley floor', 'forest tunnel'],
    transitions: [
      { to: 'arctic-tundra', widthM: 5500, reason: '冷土层变浅，云杉从散树变矮直至消失' },
    ],
    needsModel: [],
  },
  {
    id: 'sonoran',
    name: '索诺兰柱仙人掌冲积扇',
    kin: 'desert',
    roads: ['亚利桑那 Cactus Forest Drive', '亚利桑那 Bajada Loop Drive'],
    climate: {
      reference: '亚利桑那 Cactus Forest Drive',
      latitude: 32.18,
      longitude: -110.73,
      gridElevationM: 1261.97,
      highC: [16.1, 17.5, 21.6, 25.6, 30.5, 36.2, 33.9, 33.3, 31.8, 27.2, 21.2, 15.7],
      lowC: [1.8, 2.7, 5.6, 8.5, 13, 19, 21.2, 20.6, 17.8, 12.1, 6.3, 1.6],
      precipMm: [24.4, 21.2, 14, 7.4, 4.2, 9.4, 82.3, 65.3, 40.6, 14.9, 15.6, 25.1],
      snowCover: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      snowBasis: 'terrain-estimate',
    },
    bands: [
      {
        fromM: 600,
        toM: 1300,
        habitat: '巨柱为树形多肉；幼株在庇护树下，冲沟内豆科乔木需独立模型',
        pendingTrees: ['帕洛维德树 Parkinsonia microphylla', '牧豆树 Prosopis velutina'],
        trees: [
          { family: 'saguaro', name: '巨柱仙人掌', taxon: 'Carnegiea gigantea', share: 1 },
        ],
        shrubs: ['杂酚油灌木', '帕洛维德幼树'],
        ground: ['丛生旱草', '裸砾'],
        flowers: [
          { name: '巨柱仙人掌', colors: ['白'], bloomMonths: [4, 5, 6] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '吉拉啄木鸟', habitat: '柱仙人掌洞' },
      { name: '白翅哀鸽', habitat: '冠顶花果' },
    ],
    insects: [
      { name: '野蜂', months: [3, 4, 5, 6], activity: 'day', habitat: '柱仙人掌花与灌木' },
      { name: '蝉', months: [6, 7, 8], activity: 'day', habitat: '热天豆科树上' },
    ],
    rocks: [
      { type: '火山岩', color: '棕灰', form: '西区山前棱石', share: 0.3 },
      { type: '片麻岩', color: '灰褐', form: '东区山前棱石', share: 0.3 },
      { type: '冲积砾', color: '灰褐', form: '河滩圆石', share: 0.4 },
    ],
    roadStyles: ['alluvial fan', 'foothill loop'],
    transitions: [
      { to: 'sonoran', widthM: 1500, reason: '粗砾扇面逐渐解体成间歇河沟，沟里灌木较高' },
    ],
    needsModel: ['帕洛维德树 Parkinsonia microphylla', '牧豆树 Prosopis velutina'],
  },
  {
    id: 'prairie-badlands',
    name: '混合草原与劣地',
    kin: 'plains',
    roads: ['南达科他 Badlands Loop Road'],
    climate: {
      reference: '南达科他 Badlands Loop Road',
      latitude: 43.78,
      longitude: -102.04,
      gridElevationM: 754.57,
      highC: [2.6, 3.4, 10.7, 16.2, 22.1, 29.3, 33.9, 31.8, 26.3, 16.4, 9.3, 2.4],
      lowC: [-7.8, -8, -3.1, 1.5, 7.6, 14.1, 18.5, 16.8, 11.5, 3.4, -2.2, -6.7],
      precipMm: [7.9, 12.7, 22.8, 47.7, 76.7, 71.3, 50.6, 45.3, 35.3, 34.8, 11.5, 10.6],
      snowCover: [0.077, 0.082, 0.042, 0.025, 0.002, 0, 0, 0, 0, 0.02, 0.033, 0.088],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 600,
        toM: 1050,
        habitat: '树限常湿沟底；路边干台顶和泥岩壁皆无树',
        trees: [
          { family: 'poplar', name: '三角叶杨', taxon: 'Populus deltoides', share: 1 },
        ],
        shrubs: ['蒿灌丛'],
        ground: ['混合草原禾草', '裸土'],
        flowers: [
          { name: '草原锥花', colors: ['黄'], bloomMonths: [6, 7, 8] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '西草地鹨', habitat: '草原鸣唱' },
      { name: '黑嘴喜鹊', habitat: '沟底灌丛' },
    ],
    insects: [
      { name: '草蜢', months: [6, 7, 8, 9], activity: 'day', habitat: '干草茎' },
      { name: '野蜂', months: [5, 6, 7, 8, 9], activity: 'day', habitat: '杂色草花带' },
    ],
    rocks: [
      { type: '泥岩', color: '粉灰', form: '水平彩带沟脊', share: 0.75 },
      { type: '砂岩', color: '灰黄', form: '层状台阶', share: 0.25 },
    ],
    roadStyles: ['rim road', 'open prairie'],
    transitions: [
      { to: 'prairie-badlands', widthM: 1800, reason: '易蚀泥坡露岩，台顶保留草皮' },
    ],
    needsModel: [],
  },
  {
    id: 'central-alps',
    name: '中阿尔卑斯落叶松山口',
    kin: 'alpine',
    roads: ['意大利 SS38 斯泰尔维奥山口', '奥地利 Großglockner Hochalpenstraße'],
    climate: {
      reference: '意大利 SS38 斯泰尔维奥山口',
      latitude: 46.53,
      longitude: 10.45,
      gridElevationM: 1968.36,
      highC: [-4.2, -3.2, 0.5, 5.8, 10.7, 15.2, 17.1, 16.7, 13, 8.6, 1.9, -3],
      lowC: [-13.4, -13, -8.7, -3.1, 1, 5.1, 6.9, 6.8, 2.9, -0.6, -5.4, -11.5],
      precipMm: [40.5, 38.5, 49.3, 68.8, 103.4, 114, 118.7, 130.9, 90.9, 87.8, 85.8, 51.2],
      snowCover: [0.875, 0.882, 0.653, 0.202, 0.034, 0.005, 0.001, 0.002, 0.017, 0.07, 0.323, 0.72],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 850,
        toM: 1650,
        habitat: '避开开垦草场',
        trees: [
          { family: 'spruce', name: '欧洲云杉', taxon: 'Picea abies', share: 1 },
        ],
        shrubs: ['越橘'],
        ground: ['草甸禾草', '林下针叶毡'],
        flowers: [
          { name: '草甸毛茛', colors: ['黄'], bloomMonths: [5, 6, 7] },
        ],
      },
      {
        fromM: 1650,
        toM: 2200,
        habitat: '上缘疏林；落叶松秋黄冬裸',
        trees: [
          { family: 'larch', name: '欧洲落叶松', taxon: 'Larix decidua', share: 0.7 },
          { family: 'pine', name: '瑞士五针松', taxon: 'Pinus cembra', share: 0.3 },
        ],
        shrubs: ['高山杜鹃'],
        ground: ['越橘地毯', '草甸禾草'],
        flowers: [
          { name: '锈叶杜鹃', colors: ['玫红'], bloomMonths: [6, 7, 8] },
        ],
      },
      {
        fromM: 2200,
        toM: 3200,
        habitat: '碎石坡仅在稳固土袋有花',
        trees: [],
        shrubs: [],
        ground: ['垫状草本', '裸岩'],
        flowers: [
          { name: '高山龙胆', colors: ['深蓝'], bloomMonths: [6, 7, 8] },
        ],
      },
    ],
    treelineM: [2200, 2200, 2200, 2200],
    snowlineM: [900, 1700, 3000, 2200],
    birds: [
      { name: '黄嘴山鸦', habitat: '垭口乘风' },
      { name: '岩鹨', habitat: '石堆' },
    ],
    insects: [
      { name: '熊蜂', months: [6, 7, 8, 9], activity: 'day', habitat: '高山牧坡花丛' },
      { name: '粉蝶类', months: [6, 7, 8], activity: 'day', habitat: '避风向阳草甸' },
    ],
    rocks: [
      { type: '片麻岩', color: '灰褐', form: '条带崖面', share: 0.6 },
      { type: '碎岩', color: '灰色', form: '陡坡碎石扇', share: 0.4 },
    ],
    roadStyles: ['switchback pass', 'valley floor'],
    transitions: [
      { to: 'central-alps', widthM: 3000, reason: '翻口后重新进入牧场与疏落叶松林' },
    ],
    needsModel: [],
  },
  {
    id: 'norway-fjord',
    name: '西挪威峡湾雪路',
    kin: 'alpine',
    roads: ['挪威 Fv63 Geiranger–Ørnesvingen', '挪威 Aurlandsfjellet'],
    climate: {
      reference: '挪威 Aurlandsfjellet',
      latitude: 60.93,
      longitude: 7.27,
      gridElevationM: 1119.03,
      highC: [-6.6, -5.8, -3.3, -0.6, 2.5, 8.8, 13.1, 12, 7.6, 1.7, -3.3, -5.7],
      lowC: [-11.8, -12.1, -10.7, -6.7, -2.4, 2.8, 6.3, 5.7, 2.2, -3.2, -8.2, -10.6],
      precipMm: [174, 124.5, 127.1, 106.2, 116.2, 137.6, 169, 172.6, 175.3, 164.6, 169, 182.3],
      snowCover: [1, 1, 1, 0.997, 0.784, 0.23, 0.011, 0.002, 0.054, 0.424, 0.885, 0.996],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 0,
        toM: 450,
        habitat: '码头与牧草地仅田界长树',
        trees: [
          { family: 'birch', name: '欧洲白桦', taxon: 'Betula pubescens', share: 0.65 },
          { family: 'pine', name: '欧洲赤松', taxon: 'Pinus sylvestris', share: 0.35 },
        ],
        shrubs: ['越橘'],
        ground: ['草甸禾草', '苔藓'],
        flowers: [
          { name: '柳兰', colors: ['玫红'], bloomMonths: [6, 7, 8] },
        ],
      },
      {
        fromM: 450,
        toM: 850,
        habitat: '风口林线上下起伏',
        trees: [
          { family: 'birch', name: '山地桦', taxon: 'Betula pubescens subsp. czerepanovii', share: 1 },
        ],
        shrubs: ['矮柳'],
        ground: ['越橘地毯', '岩面地衣'],
        flowers: [
          { name: '石南', colors: ['紫粉'], bloomMonths: [7, 8, 9] },
        ],
      },
      {
        fromM: 850,
        toM: 1400,
        habitat: '浅槽积雪，凸脊露岩',
        trees: [],
        shrubs: ['矮柳'],
        ground: ['莎草', '岩面地衣'],
        flowers: [
          { name: '虎耳草类', colors: ['白'], bloomMonths: [6, 7, 8] },
        ],
      },
    ],
    treelineM: [850, 850, 850, 850],
    snowlineM: [200, 500, 1350, 950],
    birds: [
      { name: '河乌', habitat: '瀑布溪石' },
      { name: '草地鹨', habitat: '高地草坡' },
    ],
    insects: [
      { name: '熊蜂', months: [5, 6, 7, 8], activity: 'day', habitat: '低地野花与石南' },
      { name: '蚊', months: [6, 7, 8], activity: 'day', habitat: '背风湿洼' },
    ],
    rocks: [
      { type: '片麻岩', color: '灰褐', form: '条带崖面', share: 0.8 },
      { type: '冰碛', color: '灰褐', form: '混粒石垄', share: 0.2 },
    ],
    roadStyles: ['coastal ledge', 'switchback pass', 'open plateau'],
    transitions: [
      { to: 'norway-fjord', widthM: 2400, reason: '由峡湾果园上升到山地桦林，再露出风蚀岩板' },
    ],
    needsModel: [],
  },
  {
    id: 'amalfi-terrace',
    name: '地中海柠檬梯园',
    kin: 'plains',
    roads: ['意大利 SS163 阿马尔菲海岸'],
    climate: {
      reference: '意大利 SS163 阿马尔菲海岸',
      latitude: 40.64,
      longitude: 14.6,
      gridElevationM: 27.5,
      highC: [13.2, 12.9, 14.2, 16.3, 19.7, 23.6, 26.3, 26.8, 24.4, 21.4, 18.2, 14.9],
      lowC: [11.1, 10.7, 11.9, 14.1, 17.5, 21.5, 24.3, 24.8, 22.3, 19.3, 16, 12.7],
      precipMm: [101.7, 81.5, 74.5, 56.6, 40.7, 30.1, 20.9, 24.4, 76.8, 87.8, 130.4, 100.6],
      snowCover: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      snowBasis: 'terrain-estimate',
    },
    bands: [
      {
        fromM: 0,
        toM: 450,
        habitat: '橄榄只在田园与弃耕地；种植柠檬另建模型',
        pendingTrees: ['柠檬 Citrus × limon'],
        trees: [
          { family: 'oak', name: '地中海冬青栎', taxon: 'Quercus ilex', share: 0.65 },
          { family: 'olive', name: '油橄榄', taxon: 'Olea europaea', share: 0.35 },
        ],
        shrubs: ['桃金娘', '岩蔷薇'],
        ground: ['硬叶灌丛落叶', '裸岩'],
        flowers: [
          { name: '岩蔷薇', colors: ['粉', '白'], bloomMonths: [3, 4, 5, 6] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '雨燕', habitat: '村舍屋檐上空' },
      { name: '蓝矶鸫', habitat: '崖壁' },
    ],
    insects: [
      { name: '蝉', months: [6, 7, 8, 9], activity: 'day', habitat: '暖坡树冠' },
      { name: '野蜂', months: [3, 4, 5, 6, 7, 8], activity: 'day', habitat: '果园花与岩蔷薇' },
    ],
    rocks: [
      { type: '石灰岩', color: '乳灰', form: '层裂海崖', share: 0.85 },
      { type: '崩积石', color: '灰白', form: '坡脚棱石', share: 0.15 },
    ],
    roadStyles: ['coastal ledge', 'village hairpin'],
    transitions: [
      { to: 'amalfi-terrace', widthM: 1200, reason: '有人维护的梯墙与弃耕灌丛交替' },
    ],
    needsModel: ['柠檬 Citrus × limon'],
  },
  {
    id: 'hani-paddy',
    name: '哀牢山灌溉梯田',
    kin: 'plains',
    roads: ['中国云南元阳多依树梯田公路'],
    climate: {
      reference: '中国云南元阳多依树梯田公路',
      latitude: 23.09,
      longitude: 102.8,
      gridElevationM: 1378.87,
      highC: [17.9, 21.1, 24.8, 27.5, 28.5, 27.8, 26.9, 26.9, 26, 23.7, 20.9, 17.8],
      lowC: [6.9, 8.8, 12, 15.3, 17.4, 18.9, 18.8, 18.4, 17, 14.4, 10.5, 7.2],
      precipMm: [37.3, 17.7, 34.2, 74.6, 144.4, 196.5, 266.3, 254.6, 142.5, 99.5, 45.5, 24.5],
      snowCover: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      snowBasis: 'terrain-estimate',
    },
    bands: [
      {
        fromM: 800,
        toM: 1650,
        habitat: '人工灌水田面无树；花期随海拔与品种',
        trees: [],
        shrubs: [],
        ground: ['水稻', '田埂莎草'],
        flowers: [
          { name: '稻花', colors: ['乳白'], bloomMonths: [7, 8, 9] },
        ],
      },
      {
        fromM: 1650,
        toM: 2100,
        habitat: '山头涵养林；上部也有村田，须有土地利用掩膜',
        trees: [
          { family: 'oak', name: '常绿栎类', taxon: 'Quercus spp.', share: 1 },
        ],
        shrubs: ['林缘灌丛'],
        ground: ['地蕨', '林下落叶'],
        flowers: [],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '白鹭', habitat: '浅水稻田' },
      { name: '燕类', habitat: '村舍田上' },
    ],
    insects: [
      { name: '蜻蜓', months: [5, 6, 7, 8, 9, 10], activity: 'day', habitat: '缓流水渠' },
      { name: '粉蝶类', months: [3, 4, 5, 6, 7, 8, 9, 10], activity: 'day', habitat: '未喷药田界' },
    ],
    rocks: [
      { type: '风化岩', color: '灰褐', form: '田埂碎块', share: 0.35 },
      { type: '坡积土', color: '赭色', form: '夯实梯坎', share: 0.65 },
    ],
    roadStyles: ['contour terraces', 'village bend'],
    transitions: [
      { to: 'hani-paddy', widthM: 1300, reason: '沿沟从田边穿过村寨，抬头见涵养水源的林地' },
    ],
    needsModel: [],
  },
  {
    id: 'ifugao-paddy',
    name: '吕宋山地水田',
    kin: 'plains',
    roads: ['菲律宾 Banaue–Bontoc 山路巴纳韦段'],
    climate: {
      reference: '菲律宾 Banaue–Bontoc 山路巴纳韦段',
      latitude: 16.94,
      longitude: 121.06,
      gridElevationM: 693.02,
      highC: [24, 25.7, 28.4, 31.3, 30.7, 29.1, 28, 27.8, 27.6, 26.7, 25.6, 24.3],
      lowC: [16.4, 16.7, 17.9, 19.8, 21.3, 21.3, 21, 21.1, 20.7, 19.6, 19.2, 17.8],
      precipMm: [76, 68.2, 76.6, 78.5, 227.7, 283.9, 385.2, 424.6, 322.1, 316.9, 285.5, 264.1],
      snowCover: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 850,
        toM: 1600,
        habitat: '一期稻物候由地方品种决定；耕田禁树',
        trees: [],
        shrubs: [],
        ground: ['水稻', '田埂莎草'],
        flowers: [
          { name: '稻花', colors: ['乳白'], bloomMonths: [4, 5, 6, 7] },
        ],
      },
      {
        fromM: 1600,
        toM: 2000,
        habitat: 'muyong 林地；保留天然林与人工次生林差别；Poitan 调查见本地及引入树种混生，沿线优势种待核',
        trees: [
          { family: 'broadleaf', name: '本地混交阔叶林', taxon: '多种属', share: 1 },
        ],
        shrubs: ['林缘灌丛'],
        ground: ['地蕨', '林下落叶'],
        flowers: [],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '秧鸡', habitat: '田边密草' },
      { name: '白鹭', habitat: '浅水稻田' },
    ],
    insects: [
      { name: '蜻蜓', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], activity: 'day', habitat: '有水田面' },
      { name: '粉蝶类', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], activity: 'day', habitat: '有花的田坎' },
    ],
    rocks: [
      { type: '风化岩', color: '灰褐', form: '田埂碎块', share: 0.5 },
      { type: '坡积土', color: '赭色', form: '夯实梯坎', share: 0.5 },
    ],
    roadStyles: ['contour terraces', 'forest bend'],
    transitions: [
      { to: 'ifugao-paddy', widthM: 1200, reason: '沿分水脊绕到另一组小流域的林田交界' },
    ],
    needsModel: [],
  },
  {
    id: 'karst-river',
    name: '桂北峰林河谷',
    kin: 'plains',
    roads: ['中国广西阳朔十里画廊'],
    climate: {
      reference: '中国广西阳朔十里画廊',
      latitude: 24.73,
      longitude: 110.49,
      gridElevationM: 358.12,
      highC: [14.5, 17.9, 21.5, 25.5, 28.1, 29.3, 30.2, 30.2, 28.8, 25.5, 21.1, 15.7],
      lowC: [3.5, 6.6, 10.8, 15.5, 19.5, 22.5, 23.4, 23.1, 20.4, 15.4, 10.1, 4.3],
      precipMm: [71.2, 63.8, 135, 177.9, 290.8, 359.3, 207.3, 169.9, 98.9, 56.4, 81.1, 50.7],
      snowCover: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      snowBasis: 'terrain-estimate',
    },
    bands: [
      {
        fromM: 80,
        toM: 180,
        habitat: '人工田、竹带与河滩分开；油菜仅轮作田',
        trees: [
          { family: 'bamboo', name: '江边竹类', taxon: 'Bambusa spp.', share: 1 },
        ],
        shrubs: ['河岸灌丛'],
        ground: ['水稻', '田埂莎草'],
        flowers: [
          { name: '油菜', colors: ['黄'], bloomMonths: [2, 3] },
        ],
      },
      {
        fromM: 180,
        toM: 550,
        habitat: '根系沿石灰岩缝，直壁留白',
        trees: [
          { family: 'oak', name: '常绿栎类', taxon: 'Quercus spp.', share: 1 },
        ],
        shrubs: ['石山灌丛'],
        ground: ['地蕨', '裸岩'],
        flowers: [],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '白鹭', habitat: '浅水岸边' },
      { name: '翠鸟', habitat: '溪岸低枝' },
    ],
    insects: [
      { name: '蜻蜓', months: [4, 5, 6, 7, 8, 9, 10], activity: 'day', habitat: '江岸静水湾' },
      { name: '蝉', months: [6, 7, 8, 9], activity: 'day', habitat: '村边树冠' },
    ],
    rocks: [
      { type: '石灰岩', color: '青灰', form: '竖沟孤峰', share: 0.85 },
      { type: '冲积砾', color: '灰褐', form: '河滩圆石', share: 0.15 },
    ],
    roadStyles: ['valley floor', 'riverside'],
    transitions: [
      { to: 'karst-river', widthM: 1300, reason: '石峰脚转入冲积平地，林与村田交错' },
    ],
    needsModel: [],
  },
  {
    id: 'lowveld',
    name: '南非低地稀树草原',
    kin: 'plains',
    roads: ['南非克鲁格 H4-1 萨比河道'],
    climate: {
      reference: '南非克鲁格 H4-1 萨比河道',
      latitude: -24.99,
      longitude: 31.8,
      gridElevationM: 255.87,
      highC: [33.4, 33.4, 32.5, 30.2, 29, 26.8, 26.6, 29.1, 31.6, 32.8, 33.3, 33.8],
      lowC: [20.9, 21, 20.1, 17.8, 15.2, 12.8, 12.3, 14, 16.1, 17.8, 19.2, 20.5],
      precipMm: [122.5, 84.7, 84, 48.3, 12.7, 7.8, 8.1, 8.3, 18.1, 45.8, 84, 110.7],
      snowCover: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 150,
        toM: 550,
        habitat: '玄武岩台地可见瘤刺金合欢与马鲁拉树；成荫的河岸无花果单列资产',
        pendingTrees: ['河岸无花果 Ficus sycomorus', '马鲁拉树 Sclerocarya birrea'],
        trees: [
          { family: 'acacia', name: '瘤刺金合欢', taxon: 'Senegalia nigrescens', share: 1 },
        ],
        shrubs: ['刺灌丛'],
        ground: ['高秆草', '裸土'],
        flowers: [
          { name: '地被芦荟类', colors: ['橙红'], bloomMonths: [5, 6, 7, 8] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '非洲渔雕', habitat: '沿河高枝' },
      { name: '织布鸟', habitat: '营地河岸树' },
    ],
    insects: [
      { name: '蜣螂', months: [1, 2, 3, 11, 12], activity: 'day', habitat: '降雨后动物粪旁' },
      { name: '蜻蜓', months: [1, 2, 3, 4, 10, 11, 12], activity: 'day', habitat: '萨比河边静水' },
    ],
    rocks: [
      { type: '花岗岩', color: '浅灰', form: '西段圆蚀巨石', share: 0.3 },
      { type: '玄武岩', color: '暗灰', form: '东段低坡碎块', share: 0.3 },
      { type: '冲积砾', color: '灰褐', form: '河滩圆石', share: 0.4 },
    ],
    roadStyles: ['valley floor', 'open savanna'],
    transitions: [
      { to: 'lowveld', widthM: 1700, reason: '离河后密荫退为开阔刺灌草地' },
    ],
    needsModel: ['河岸无花果 Ficus sycomorus', '马鲁拉树 Sclerocarya birrea'],
  },
  {
    id: 'cape-fynbos',
    name: '开普硬叶灌丛海崖',
    kin: 'plains',
    roads: ['南非 Chapman\'s Peak Drive'],
    climate: {
      reference: '南非 Chapman\'s Peak Drive',
      latitude: -34.08,
      longitude: 18.37,
      gridElevationM: 18.82,
      highC: [21.8, 22.1, 21.1, 19.6, 18.1, 16.5, 15.9, 15.7, 16.5, 17.9, 19.2, 20.8],
      lowC: [18.5, 18.7, 17.8, 16.2, 15.2, 13.8, 13.1, 13, 13.6, 14.7, 15.8, 17.5],
      precipMm: [13.6, 9.3, 17, 37.3, 50.9, 90.8, 81.1, 76.4, 39.9, 30.9, 29.7, 11.7],
      snowCover: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 0,
        toM: 650,
        habitat: '保留低灌连片，花窗仅冬花型样板',
        trees: [],
        shrubs: ['山龙眼', '帚状欧石南'],
        ground: ['灯芯草状帚草', '裸岩'],
        flowers: [
          { name: '糖山龙眼', colors: ['乳白', '粉'], bloomMonths: [5, 6, 7, 8, 9] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '开普糖鸟', habitat: '山龙眼花冠' },
      { name: '太阳鸟', habitat: '细枝花丛' },
    ],
    insects: [
      { name: '野蜂', months: [7, 8, 9, 10, 11], activity: 'day', habitat: '硬叶灌丛花头' },
      { name: '粉蝶类', months: [8, 9, 10, 11, 12], activity: 'day', habitat: '晴暖背风坡' },
    ],
    rocks: [
      { type: '石英砂岩', color: '灰黄', form: '垂直层崖', share: 0.65 },
      { type: '花岗岩', color: '浅灰', form: '圆蚀巨石', share: 0.35 },
    ],
    roadStyles: ['coastal ledge', 'contour bend'],
    transitions: [
      { to: 'cape-fynbos', widthM: 1200, reason: '花岗岩底座上转入砂岩层，群丛受基质与风影响' },
    ],
    needsModel: [],
  },
  {
    id: 'otway-coast',
    name: '维州石灰岩海蚀岸',
    kin: 'plains',
    roads: ['澳大利亚 Great Ocean Road 坎贝尔港段'],
    climate: {
      reference: '澳大利亚 Great Ocean Road 坎贝尔港段',
      latitude: -38.62,
      longitude: 143,
      gridElevationM: 97.2,
      highC: [23.8, 23.5, 22.1, 19, 15.6, 13.1, 12.4, 12.9, 14.7, 17.1, 19.8, 21.6],
      lowC: [13.5, 14, 13.3, 11.5, 10, 8.3, 7.7, 7.7, 8.4, 9.3, 10.8, 12],
      precipMm: [42.5, 40.5, 47.6, 58.5, 72.4, 84.1, 92.4, 97.7, 79.2, 65.8, 63.3, 55.9],
      snowCover: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 0,
        toM: 180,
        habitat: '崖口风切低矮，海柱无树林',
        trees: [],
        shrubs: ['滨海茶树灌木', '盐生矮灌'],
        ground: ['滨海丛草', '裸岩'],
        flowers: [
          { name: '滨海雏菊类', colors: ['白'], bloomMonths: [1, 2, 3, 10, 11, 12] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '短尾鹱', habitat: '近海归巢' },
      { name: '银鸥', habitat: '岸边' },
    ],
    insects: [
      { name: '野蜂', months: [1, 2, 3, 9, 10, 11, 12], activity: 'day', habitat: '沿海灌丛花' },
      { name: '粉蝶类', months: [1, 2, 3, 10, 11, 12], activity: 'day', habitat: '内陆草坡' },
    ],
    rocks: [
      { type: '石灰岩', color: '蜜黄', form: '海柱与拱', share: 0.9 },
      { type: '海砂', color: '灰黄', form: '湾底沙坪', share: 0.1 },
    ],
    roadStyles: ['clifftop road', 'open pasture'],
    transitions: [
      { to: 'otway-forest', widthM: 3500, reason: '远离海风和浅土，沿内陆湿沟长出高林' },
    ],
    needsModel: [],
  },
  {
    id: 'otway-forest',
    name: '奥特韦湿沟桉林',
    kin: 'plains',
    roads: ['澳大利亚奥特韦 Turtons Track'],
    climate: {
      reference: '澳大利亚奥特韦 Turtons Track',
      latitude: -38.62,
      longitude: 143.58,
      gridElevationM: 120.74,
      highC: [23.6, 23.1, 21.8, 18.7, 15.4, 13, 12.2, 12.8, 14.7, 16.9, 19.5, 21.5],
      lowC: [14, 14.5, 13.7, 11.9, 10, 8.3, 7.6, 7.5, 8.3, 9.3, 11, 12.3],
      precipMm: [43.9, 44, 45.4, 59.7, 65, 76.1, 79.9, 85.8, 71.6, 62.9, 64.1, 50.6],
      snowCover: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 100,
        toM: 650,
        habitat: '桉树限湿林天窗，闭合雨林沟以南方山毛榉和树蕨为主（Nothofagus cunninghamii）',
        pendingTrees: ['南方山毛榉 Nothofagaceae', '黑木相思 Acacia melanoxylon'],
        trees: [
          { family: 'eucalyptus', name: '山灰桉', taxon: 'Eucalyptus regnans', share: 0.6 },
          { family: 'tree_fern', name: '软树蕨', taxon: 'Dicksonia antarctica', share: 0.4 },
        ],
        shrubs: ['湿林灌木'],
        ground: ['地蕨', '苔藓'],
        flowers: [
          { name: '山铁线莲', colors: ['乳白'], bloomMonths: [8, 9, 10, 11] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '深红玫瑰鹦鹉', habitat: '树冠' },
      { name: '黄色知更鸲类', habitat: '林下低枝' },
    ],
    insects: [
      { name: '蝉', months: [1, 2, 3, 11, 12], activity: 'day', habitat: '暖日桉树冠' },
      { name: '野蜂', months: [1, 2, 3, 9, 10, 11, 12], activity: 'day', habitat: '湿林边缘花丛' },
    ],
    rocks: [
      { type: '砂岩', color: '灰褐', form: '河谷露头', share: 0.65 },
      { type: '泥岩', color: '灰色', form: '沟侧薄层', share: 0.35 },
    ],
    roadStyles: ['forest tunnel', 'creek crossing'],
    transitions: [
      { to: 'otway-coast', widthM: 3500, reason: '山路向外海下降，乔木渐矮让给滨海灌丛' },
    ],
    needsModel: ['南方山毛榉 Nothofagaceae', '黑木相思 Acacia melanoxylon'],
  },
  {
    id: 'fiordland',
    name: '南岛山毛榉冰川谷',
    kin: 'alpine',
    roads: ['新西兰 SH94 Milford Road'],
    climate: {
      reference: '新西兰 SH94 Milford Road',
      latitude: -44.91,
      longitude: 168.08,
      gridElevationM: 891.28,
      highC: [15.1, 15.2, 13.6, 10.4, 7, 4.2, 3.6, 5.3, 7.2, 9.1, 11.5, 13.9],
      lowC: [5.8, 5.9, 4.8, 2.9, 1.2, -0.9, -1.5, -0.8, 0.1, 0.9, 2.6, 4.7],
      precipMm: [159.8, 133.1, 133.2, 133.1, 155.6, 133, 132.3, 120.3, 147.8, 158.7, 141.4, 159.2],
      snowCover: [0, 0, 0.001, 0.005, 0.034, 0.1, 0.11, 0.061, 0.033, 0.011, 0.006, 0.001],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 0,
        toM: 700,
        habitat: '湿侧林下树蕨；冠层南方山毛榉需独立模型；红山毛榉 Fuscospora fusca、银山毛榉 Lophozonia menziesii',
        pendingTrees: ['南方山毛榉 Nothofagaceae', '泪柏 Dacrydium cupressinum'],
        trees: [
          { family: 'tree_fern', name: '树蕨类', taxon: 'Cyathea smithii', share: 1 },
        ],
        shrubs: ['倒挂金钟类'],
        ground: ['地蕨', '苔藓'],
        flowers: [
          { name: '本地倒挂金钟', colors: ['绿紫'], bloomMonths: [8, 9, 10, 11, 12] },
        ],
      },
      { fromM: 700, toM: 1000, habitat: '山林上缘银山毛榉矮化；雪崩槽可低于林线', trees: [], shrubs: ['矮生灌木'], ground: ['苔藓', '丛生雪草'], flowers: [] },
      {
        fromM: 1000,
        toM: 1600,
        habitat: '隧道口夏季融雪后见大白花',
        trees: [],
        shrubs: ['矮生灌木'],
        ground: ['丛生雪草', '裸岩'],
        flowers: [
          { name: '库克山毛茛', colors: ['白'], bloomMonths: [1, 11, 12] },
        ],
      },
    ],
    treelineM: [1000, 1000, 1000, 1000],
    snowlineM: [1600, 1150, 650, 850],
    birds: [
      { name: '啄羊鹦鹉', habitat: '隧道口岩石' },
      { name: '新西兰扇尾鹟', habitat: '溪谷林缘' },
    ],
    insects: [
      { name: '沙蝇', months: [1, 2, 3, 4, 10, 11, 12], activity: 'day', habitat: '流动淡水附近背风处' },
      { name: '蛾类', months: [1, 2, 3, 11, 12], activity: 'night', habitat: '温暖林缘' },
    ],
    rocks: [
      { type: '深成岩', color: '灰色', form: '冰蚀峭壁', share: 0.7 },
      { type: '冰碛', color: '灰褐', form: '混粒石垄', share: 0.3 },
    ],
    roadStyles: ['valley floor', 'tunnel pass', 'fjord shore'],
    transitions: [
      { to: 'fiordland', widthM: 2400, reason: '跨分水岭后迎风坡水量增加，红山毛榉转银山毛榉' },
    ],
    needsModel: ['南方山毛榉 Nothofagaceae', '泪柏 Dacrydium cupressinum'],
  },
  {
    id: 'wet-tropics',
    name: '昆士兰低地热带雨林',
    kin: 'plains',
    roads: ['澳大利亚 Cape Tribulation Road'],
    climate: {
      reference: '澳大利亚 Cape Tribulation Road',
      latitude: -16.17,
      longitude: 145.42,
      gridElevationM: 44.47,
      highC: [28.6, 28.8, 28.1, 27, 25.6, 24.5, 23.8, 24.1, 25, 26.1, 27.3, 28.5],
      lowC: [26.9, 27, 26.6, 25.5, 24.1, 22.8, 22.1, 22.2, 23, 24.1, 25.3, 26.5],
      precipMm: [366.6, 378.2, 429, 186, 77.5, 53.5, 36.9, 25.2, 26.8, 50.1, 69.5, 183.9],
      snowCover: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 0,
        toM: 250,
        habitat: '低地淡水沼林与高燥雨林区别；潮沟红树林单列',
        pendingTrees: ['潮间带红树 Rhizophora spp.'],
        trees: [
          { family: 'fan_palm', name: '澳洲扇棕', taxon: 'Licuala ramsayi', share: 0.35 },
          { family: 'giant_broadleaf', name: '板根阔叶树', taxon: '多种属', share: 0.65 },
        ],
        shrubs: ['林缘灌丛'],
        ground: ['地蕨', '林下落叶'],
        flowers: [],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '南方鹤鸵', habitat: '有落果的密林' },
      { name: '果鸠', habitat: '上层树冠' },
    ],
    insects: [
      { name: '凤蝶类', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], activity: 'day', habitat: '雨林天窗' },
      { name: '蝉', months: [1, 2, 3, 4, 11, 12], activity: 'day', habitat: '低地湿林' },
    ],
    rocks: [
      { type: '变质岩', color: '灰褐', form: '片状崩壁', share: 0.55 },
      { type: '冲积砾', color: '灰褐', form: '河滩圆石', share: 0.45 },
    ],
    roadStyles: ['forest tunnel', 'tidal crossing'],
    transitions: [
      { to: 'wet-tropics', widthM: 1600, reason: '在潮沟和淡水湿林之间绕行，耐盐根系只在潮界内' },
    ],
    needsModel: ['潮间带红树 Rhizophora spp.'],
  },
  {
    id: 'patagonian-steppe',
    name: '安第斯雨影丛草原',
    kin: 'plains',
    roads: ['阿根廷 RP23 查尔滕入口', '阿根廷 RN40 拉莱奥纳段'],
    climate: {
      reference: '阿根廷 RN40 拉莱奥纳段',
      latitude: -49.79,
      longitude: -72.04,
      gridElevationM: 543.77,
      highC: [15.2, 15.4, 12.9, 9.3, 4.8, 0.7, 0.2, 2.8, 7.1, 10, 12.1, 14.1],
      lowC: [4.7, 4.6, 3.2, 0.9, -1.8, -5.1, -6.4, -4.1, -1.3, 0.1, 2.1, 3.8],
      precipMm: [39.8, 36.9, 44.1, 42.8, 49, 42, 38.9, 38.7, 29.7, 31, 33.1, 41.3],
      snowCover: [0, 0, 0, 0.01, 0.05, 0.15, 0.2, 0.1, 0.05, 0.01, 0, 0],
      snowBasis: 'terrain-estimate',
    },
    bands: [
      {
        fromM: 150,
        toM: 900,
        habitat: '风影侧小灌木，远离河道无树',
        trees: [],
        shrubs: ['刺小檗类', '贴地小灌木'],
        ground: ['丛生旱草', '裸砾'],
        flowers: [
          { name: '巴塔哥尼亚小檗', colors: ['黄'], bloomMonths: [10, 11, 12] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '小美洲鸵', habitat: '开阔草坡' },
      { name: '南方凤头卡拉鹰', habitat: '栅柱' },
    ],
    insects: [
      { name: '野蜂', months: [1, 2, 11, 12], activity: 'day', habitat: '风影内矮灌花' },
      { name: '粉蝶类', months: [1, 2, 3, 11, 12], activity: 'day', habitat: '有草花的河阶' },
    ],
    rocks: [
      { type: '冰碛', color: '灰褐', form: '混粒石垄', share: 0.6 },
      { type: '冲积砾', color: '灰褐', form: '河滩圆石', share: 0.4 },
    ],
    roadStyles: ['open plateau', 'lakeshore'],
    transitions: [
      { to: 'patagonian-steppe', widthM: 2500, reason: '湖畔融水润湿河阶，越台地后又回干草坡' },
      { to: 'andes-rainforest', widthM: 12500, reason: '安第斯南段跨分水岭的压缩样带：先河阶草甸、低矮落叶南方山毛榉，再到迎风密林' },
    ],
    needsModel: [],
  },
  {
    id: 'andes-rainforest',
    name: '巴塔哥尼亚温带雨林',
    kin: 'alpine',
    roads: ['智利 Carretera Austral 凯乌拉特段'],
    climate: {
      reference: '智利 Carretera Austral 凯乌拉特段',
      latitude: -44.47,
      longitude: -72.54,
      gridElevationM: 677.38,
      highC: [14.3, 15.4, 12.8, 9.7, 7, 4, 3.5, 4.7, 7.1, 9.1, 11.1, 13],
      lowC: [6, 6.3, 5, 3.1, 1.6, -0.3, -1, -0.3, 0.7, 1.8, 3.1, 5],
      precipMm: [94.6, 78.8, 106.6, 115.5, 153.6, 173.7, 133.4, 135.8, 85.6, 125, 125.5, 105],
      snowCover: [0, 0, 0.001, 0.005, 0.042, 0.128, 0.173, 0.092, 0.025, 0.011, 0.005, 0.001],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 0,
        toM: 700,
        habitat: '常绿南方山毛榉林；需要本土冠层模型；常绿 Nothofagus betuloides、N. nitida',
        pendingTrees: ['南方山毛榉 Nothofagaceae', '智利火树 Embothrium coccineum'],
        trees: [],
        shrubs: [],
        ground: ['地蕨', '苔藓'],
        flowers: [
          { name: '智利火树', colors: ['猩红'], bloomMonths: [1, 10, 11, 12] },
        ],
      },
      {
        fromM: 700,
        toM: 1100,
        habitat: '高处落叶南方山毛榉，湿地开窗；Nothofagus pumilio',
        pendingTrees: ['南方山毛榉 Nothofagaceae'],
        trees: [],
        shrubs: ['刺小檗类'],
        ground: ['林下落叶', '苔藓'],
        flowers: [],
      },
      { fromM: 1100, toM: 1900, habitat: '冰川磨光岩壁，雪崩廊道下限另算', trees: [], shrubs: [], ground: ['裸岩', '垫状草本'], flowers: [] },
    ],
    treelineM: [1100, 1100, 1100, 1100],
    snowlineM: [1600, 1100, 550, 900],
    birds: [
      { name: '麦哲伦啄木鸟', habitat: '老林枯干' },
      { name: '查考窜鸟', habitat: '浓密林下' },
    ],
    insects: [
      { name: '熊蜂', months: [1, 2, 3, 11, 12], activity: 'day', habitat: '林缘花木' },
      { name: '蛾类', months: [1, 2, 3, 11, 12], activity: 'night', habitat: '湿润林窗' },
    ],
    rocks: [
      { type: '深成岩', color: '灰色', form: '冰蚀峭壁', share: 0.7 },
      { type: '冰碛', color: '灰褐', form: '混粒石垄', share: 0.3 },
    ],
    roadStyles: ['forest tunnel', 'fjord shore'],
    transitions: [
      { to: 'andes-rainforest', widthM: 1900, reason: '由潮湿谷底升至低矮山林，雪崩沟打断树冠' },
      { to: 'patagonian-steppe', widthM: 12500, reason: '越岭进入雨影，森林先变疏成矮林，冲积台地转为丛草原' },
    ],
    needsModel: ['南方山毛榉 Nothofagaceae', '智利火树 Embothrium coccineum'],
  },
];
