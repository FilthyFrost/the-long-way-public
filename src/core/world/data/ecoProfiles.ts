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
  /** Estimated real-road length of a representative continuous stretch, before game compression. */
  readonly typicalStretchKm: readonly [number, number];
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
    typicalStretchKm: [4, 15],
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
      { to: 'cal-oak', widthM: 2400, reason: 'CA-140 随 Merced 河上溯从夏干栎林进入较凉的松栎谷地' },
    ],
    needsModel: [],
  },
  {
    id: 'sierra-high',
    name: '内华达高山草甸',
    kin: 'alpine',
    roads: ['优胜美地 Tioga Road'],
    typicalStretchKm: [8, 40],
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
    typicalStretchKm: [3, 25],
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
      { to: 'cal-oak', widthM: 1100, reason: 'Big Sur River 沿谷湿阴坡与干燥山肩相接，谷底积雾支持红杉' },
    ],
    needsModel: ['花旗松 Pseudotsuga menziesii'],
  },
  {
    id: 'sur-coast',
    name: '加州地中海型海崖',
    kin: 'plains',
    roads: ['加州一号公路 Big Sur'],
    typicalStretchKm: [5, 50],
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
      { to: 'cal-oak', widthM: 1500, reason: 'Big Sur 背风谷肩远离盐雾，海岸灌丛逐渐让位于海岸栎' },
    ],
    needsModel: [],
  },
  {
    id: 'rocky-pass',
    name: '落基山林线公路',
    kin: 'alpine',
    roads: ['科罗拉多 Trail Ridge Road', '落基山 Bear Lake Road'],
    typicalStretchKm: [6, 30],
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
      { to: 'rocky-foothill', widthM: 4000, reason: 'US-34 至 Estes Park 盆地，干峡谷西黄松上方进入凉湿山杨与亚高山针叶带' },
      { to: 'sanjuan-montane', widthM: 4200, reason: 'US-550 从 Durango 向 Coal Bank Pass 上升，山杨林窗以上逐步出现云杉冷杉与高山垭口' },
      { to: 'redrock', widthM: 12500, reason: '犹他 La Sal Mountain Loop 从 Castle Valley 红岩经矮松刺柏、灌木栎、山杨到山地松杉；公路只达森林带' },
    ],
    needsModel: [],
  },
  {
    id: 'redrock',
    name: '科罗拉多高原红岩',
    kin: 'desert',
    roads: ['犹他 Arches Scenic Drive', '峡谷地 Island in the Sky'],
    typicalStretchKm: [6, 45],
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
      { to: 'mesa-woodland', widthM: 3200, reason: '科罗拉多高原裸露砂岩与积土台顶相接，水沿节理汇集后出现矮松刺柏' },
      { to: 'rocky-pass', widthM: 12500, reason: '犹他 La Sal Mountain Loop 从 Castle Valley 红岩经矮松刺柏、灌木栎、山杨到山地松杉；公路只达森林带' },
    ],
    needsModel: [],
  },
  {
    id: 'appalachian',
    name: '阿巴拉契亚阔叶山脊',
    kin: 'plains',
    roads: ['阿巴拉契亚 Blue Ridge Parkway', '仙纳度 Skyline Drive'],
    typicalStretchKm: [10, 65],
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
      { to: 'blue-meadow', widthM: 350, reason: 'Skyline Drive 的 Big Meadows 处林缘骤退，湿地与割草维持脊顶开口' },
      { to: 'shenandoah-farm', widthM: 2200, reason: 'US-211 从 Luray 上 Thornton Gap，开垦谷底和树篱接入林冠连续的 Blue Ridge 山坡' },
    ],
    needsModel: [],
  },
  {
    id: 'arctic-tundra',
    name: '布鲁克斯北坡苔原',
    kin: 'alpine',
    roads: ['阿拉斯加 Dalton Highway'],
    typicalStretchKm: [35, 180],
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
      { to: 'alaska-braid', widthM: 2300, reason: 'Dalton 北坡的河漫滩柳丛只沿稳定砾阶伸展，冷湿冻土台面转入苔原' },
    ],
    needsModel: [],
  },
  {
    id: 'alaska-taiga',
    name: '阿拉斯加内陆泰加林',
    kin: 'plains',
    roads: ['阿拉斯加 Dalton Highway', '阿拉斯加 Parks Highway'],
    typicalStretchKm: [20, 130],
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
      { to: 'alaska-braid', widthM: 1400, reason: 'Dietrich 河谷的成熟河阶长云杉，近水裸洲和新阶地先由先锋柳占据' },
    ],
    needsModel: [],
  },
  {
    id: 'sonoran',
    name: '索诺兰柱仙人掌冲积扇',
    kin: 'desert',
    roads: ['亚利桑那 Cactus Forest Drive', '亚利桑那 Bajada Loop Drive'],
    typicalStretchKm: [5, 20],
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
      { to: 'sky-oak', widthM: 3200, reason: 'Catalina Highway 从巨柱仙人掌扇面爬过半荒漠丛草带，进入较凉栎林' },
    ],
    needsModel: ['帕洛维德树 Parkinsonia microphylla', '牧豆树 Prosopis velutina'],
  },
  {
    id: 'prairie-badlands',
    name: '混合草原与劣地',
    kin: 'plains',
    roads: ['南达科他 Badlands Loop Road'],
    typicalStretchKm: [6, 38],
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
      { to: 'front-prairie', widthM: 2600, reason: 'SD-240 在 Wall 草原边缘切入受蚀泥岩，沟脊间的草台渐碎' },
    ],
    needsModel: [],
  },
  {
    id: 'central-alps',
    name: '中阿尔卑斯落叶松山口',
    kin: 'alpine',
    roads: ['意大利 SS38 斯泰尔维奥山口', '奥地利 Großglockner Hochalpenstraße'],
    typicalStretchKm: [4, 25],
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
      { to: 'alps-orchard', widthM: 1800, reason: 'SS38 从 Prato 谷地离开平整灌溉果园，爬向 Stelvio 山腰针叶林' },
      { to: 'alps-larch', widthM: 2400, reason: 'Trafoi 以上发卡弯穿过疏松牧场，跨过林线后只剩草场和碎石' },
    ],
    needsModel: [],
  },
  {
    id: 'norway-fjord',
    name: '西挪威峡湾雪路',
    kin: 'alpine',
    roads: ['挪威 Fv63 Geiranger–Ørnesvingen', '挪威 Aurlandsfjellet'],
    typicalStretchKm: [3, 32],
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
      { to: 'fjord-orchard', widthM: 1400, reason: 'Lærdal 冲积平地的农田在岩壁下收窄，山路贴峡湾上升进入桦林' },
      { to: 'fjord-heath', widthM: 2200, reason: 'Aurlandsfjellet 坡上山地桦逐渐风剪变矮，越林线露出雪槽和冰磨岩' },
    ],
    needsModel: [],
  },
  {
    id: 'amalfi-terrace',
    name: '地中海柠檬梯园',
    kin: 'plains',
    roads: ['意大利 SS163 阿马尔菲海岸'],
    typicalStretchKm: [2, 25],
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
      { to: 'lattari-coppice', widthM: 1700, reason: 'SS366 离开向海柠檬石墙后爬上凉湿山肩，栗林与栎林沿沟重新闭合' },
    ],
    needsModel: ['柠檬 Citrus × limon'],
  },
  {
    id: 'hani-paddy',
    name: '哀牢山灌溉梯田',
    kin: 'plains',
    roads: ['中国云南元阳多依树梯田公路'],
    typicalStretchKm: [2, 18],
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
      { to: 'south-china-paddy', widthM: 1500, reason: '元阳红河谷侧坡从宽谷田上升为依等高线分层灌溉的梯田' },
    ],
    needsModel: [],
  },
  {
    id: 'ifugao-paddy',
    name: '吕宋山地水田',
    kin: 'plains',
    roads: ['菲律宾 Banaue–Bontoc 山路巴纳韦段'],
    typicalStretchKm: [2, 12],
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
      { to: 'ifugao-grove', widthM: 450, reason: 'Banaue 的灌渠从村寨上方 muyong 林流入梯田，土地利用边界窄' },
    ],
    needsModel: [],
  },
  {
    id: 'karst-river',
    name: '桂北峰林河谷',
    kin: 'plains',
    roads: ['中国广西阳朔十里画廊'],
    typicalStretchKm: [3, 22],
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
      { to: 'south-china-paddy', widthM: 850, reason: '阳朔高田开阔冲积田与孤峰坡脚交错，岩缝灌丛仅在石山上变密' },
    ],
    needsModel: [],
  },
  {
    id: 'lowveld',
    name: '南非低地稀树草原',
    kin: 'plains',
    roads: ['南非克鲁格 H4-1 萨比河道'],
    typicalStretchKm: [8, 55],
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
      { to: 'sabie-gallery', widthM: 550, reason: 'H4-1 接近萨比河阶时树根触及常流水，窄带无花果大冠取代刺灌疏林' },
      { to: 'basalt-savanna', widthM: 2400, reason: 'Lower Sabie 外玄武母质的开阔高草台地与混合稀树草原交错' },
    ],
    needsModel: ['河岸无花果 Ficus sycomorus', '马鲁拉树 Sclerocarya birrea'],
  },
  {
    id: 'cape-fynbos',
    name: '开普硬叶灌丛海崖',
    kin: 'plains',
    roads: ['南非 Chapman\'s Peak Drive'],
    typicalStretchKm: [2, 9],
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
      { to: 'cape-dune', widthM: 1000, reason: 'Noordhoek 砂丘沉积与 Chapman\'s Peak 岩坡相接，盐雾和基质控制矮灌组合' },
      { to: 'cape-forest', widthM: 600, reason: '半岛湿润避火沟保住原生高林，越上受风砂岩坡便回到硬叶灌丛' },
    ],
    needsModel: [],
  },
  {
    id: 'otway-coast',
    name: '维州石灰岩海蚀岸',
    kin: 'plains',
    roads: ['澳大利亚 Great Ocean Road 坎贝尔港段'],
    typicalStretchKm: [4, 30],
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
      { to: 'otway-pasture', widthM: 2200, reason: 'Princetown 至内陆低丘从风剪滨海灌丛转为留桉牧场' },
    ],
    needsModel: [],
  },
  {
    id: 'otway-forest',
    name: '奥特韦湿沟桉林',
    kin: 'plains',
    roads: ['澳大利亚奥特韦 Turtons Track'],
    typicalStretchKm: [4, 22],
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
      { to: 'otway-pasture', widthM: 1000, reason: 'C159 Beech Forest 台地田界紧贴背阴湿沟，树蕨先沿溪连成带' },
    ],
    needsModel: ['南方山毛榉 Nothofagaceae', '黑木相思 Acacia melanoxylon'],
  },
  {
    id: 'fiordland',
    name: '南岛山毛榉冰川谷',
    kin: 'alpine',
    roads: ['新西兰 SH94 Milford Road'],
    typicalStretchKm: [5, 45],
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
      { to: 'eglinton-grass', widthM: 700, reason: 'Eglinton 谷底冲积草湿地和红山毛榉林岛相间，离开漫滩后林冠闭合' },
      { to: 'homer-alpine', widthM: 1600, reason: 'Homer Tunnel 两端雪崩反复清除林冠，槽边先锋灌木通向上部裸岩' },
    ],
    needsModel: ['南方山毛榉 Nothofagaceae', '泪柏 Dacrydium cupressinum'],
  },
  {
    id: 'wet-tropics',
    name: '昆士兰低地热带雨林',
    kin: 'plains',
    roads: ['澳大利亚 Cape Tribulation Road'],
    typicalStretchKm: [4, 33],
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
      { to: 'daintree-tidal', widthM: 250, reason: 'Noah Creek 横切淡水雨林与潮汐泥岸，水盐界附近换成支柱根' },
      { to: 'daintree-beach', widthM: 350, reason: 'Kulki 海滨支路出雨林到高潮线后的通风沙脊，大冠变稀' },
    ],
    needsModel: ['潮间带红树 Rhizophora spp.'],
  },
  {
    id: 'patagonian-steppe',
    name: '安第斯雨影丛草原',
    kin: 'plains',
    roads: ['阿根廷 RP23 查尔滕入口', '阿根廷 RN40 拉莱奥纳段'],
    typicalStretchKm: [25, 140],
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
      { to: 'andean-parkland', widthM: 3200, reason: 'El Chaltén 东侧避风谷缘矮曲山毛榉林岛缩小，开放砾阶转丛草原' },
    ],
    needsModel: [],
  },
  {
    id: 'andes-rainforest',
    name: '巴塔哥尼亚温带雨林',
    kin: 'alpine',
    roads: ['智利 Carretera Austral 凯乌拉特段'],
    typicalStretchKm: [8, 70],
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
      { to: 'andean-parkland', widthM: 4300, reason: '安第斯雨影内侧由闭合南方山毛榉林经湿谷林岛过渡到宽草甸' },
    ],
    needsModel: ['南方山毛榉 Nothofagaceae', '智利火树 Embothrium coccineum'],
  },
  {
    id: 'cal-oak',
    name: '加州山麓栎林草坡',
    kin: 'plains',
    roads: ['CA-140 Mariposa–El Portal', 'Big Sur 河谷近岸栎林'],
    typicalStretchKm: [4, 25],
    climate: {
      reference: 'CA-140 Mariposa–El Portal',
      latitude: 37.61,
      longitude: -119.96,
      gridElevationM: 793.48,
      highC: [12.6, 12.8, 15.2, 18, 23.7, 30.6, 35.1, 33.9, 30.5, 24.2, 17.4, 11.8],
      lowC: [2.7, 2.7, 4.2, 5.8, 9.7, 14.2, 18.4, 17.7, 15.4, 10.9, 6, 2.3],
      precipMm: [110.9, 106.5, 99, 59.3, 31.5, 7.1, 5.2, 3.7, 5.3, 36.9, 62.2, 124.6],
      snowCover: [0.128, 0.09, 0.057, 0.025, 0.005, 0, 0, 0, 0, 0.006, 0.035, 0.116],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 150,
        toM: 1100,
        habitat: '蓝栎偏内陆，海岸栎在沿海样区；冠下光隙保留连续草面',
        trees: [
          { family: 'oak', name: '蓝栎', taxon: 'Quercus douglasii', share: 0.6 },
          { family: 'oak', name: '海岸栎', taxon: 'Quercus agrifolia', share: 0.4 },
        ],
        shrubs: ['灌木栎', '熊果灌丛'],
        ground: ['干季金黄禾草', '裸土'],
        flowers: [
          { name: '加州罂粟', colors: ['橙'], bloomMonths: [3, 4, 5] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '橡树啄木鸟', habitat: '橡树林缘' },
    ],
    insects: [
      { name: '野蜂', months: [3, 4, 5, 6], activity: 'day', habitat: '林间春花' },
    ],
    rocks: [
      { type: '变质岩', color: '棕灰', form: '风化山肩', share: 1 },
    ],
    roadStyles: ['rolling foothills', 'valley floor'],
    transitions: [
      { to: 'sierra-valley', widthM: 2400, reason: 'CA-140 随 Merced 河上溯从夏干栎林进入较凉的松栎谷地' },
      { to: 'sur-coast', widthM: 1500, reason: 'Big Sur 背风谷肩远离盐雾，海岸灌丛逐渐让位于海岸栎' },
      { to: 'fog-redwood', widthM: 1100, reason: 'Big Sur River 沿谷湿阴坡与干燥山肩相接，谷底积雾支持红杉' },
    ],
    needsModel: [],
  },
  {
    id: 'mesa-woodland',
    name: '科罗拉多台地矮松刺柏疏林',
    kin: 'desert',
    roads: ['US-160 Cortez–Mancos', 'Mesa Verde 入口台地公路'],
    typicalStretchKm: [4, 22],
    climate: {
      reference: 'US-160 Cortez–Mancos',
      latitude: 37.24,
      longitude: -108.48,
      gridElevationM: 1791.95,
      highC: [5.3, 7.8, 13.6, 18.2, 23.9, 31.3, 33, 31, 27, 19.5, 12.2, 5.1],
      lowC: [-5.2, -3.9, -0.7, 2.4, 7.6, 13.7, 17.8, 16.4, 11.9, 4.8, -0.9, -5.1],
      precipMm: [30, 28.5, 21.2, 20.9, 21.9, 9.6, 35.4, 35.6, 39.1, 26.9, 23.5, 31.2],
      snowCover: [0.113, 0.06, 0.013, 0.003, 0.001, 0, 0, 0, 0, 0.002, 0.015, 0.096],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 1500,
        toM: 2450,
        habitat: '路沿覆土桌面爬升，灌木在岩缝间聚集',
        trees: [
          { family: 'pine', name: '科罗拉多矮松', taxon: 'Pinus edulis', share: 0.55 },
          { family: 'juniper', name: '犹他刺柏', taxon: 'Juniperus osteosperma', share: 0.45 },
        ],
        shrubs: ['苦灌木', '灌木栎'],
        ground: ['丛生旱草', '针叶碎毡'],
        flowers: [
          { name: '沙漠锦葵', colors: ['橙'], bloomMonths: [5, 6, 7] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '灌丛鸦', habitat: '矮松树冠' },
    ],
    insects: [
      { name: '野蜂', months: [5, 6, 7, 8], activity: 'day', habitat: '平台林窗草花' },
    ],
    rocks: [
      { type: '砂岩', color: '淡赭', form: '沉积台地硬帽', share: 1 },
    ],
    roadStyles: ['mesa rim', 'open woodland'],
    transitions: [
      { to: 'redrock', widthM: 3200, reason: '科罗拉多高原裸露砂岩与积土台顶相接，水沿节理汇集后出现矮松刺柏' },
      { to: 'sanjuan-montane', widthM: 3400, reason: 'US-160 Mancos 山前台阶抬高，矮松刺柏疏林逐步换为山地黄松' },
    ],
    needsModel: [],
  },
  {
    id: 'rocky-foothill',
    name: '南落基山东麓松林河峡',
    kin: 'plains',
    roads: ['US-34 Big Thompson Canyon', 'US-36 Lyons–Estes Park'],
    typicalStretchKm: [4, 32],
    climate: {
      reference: 'US-34 Big Thompson Canyon',
      latitude: 40.42,
      longitude: -105.31,
      gridElevationM: 1772.9,
      highC: [5.6, 6.1, 11.7, 15.9, 21, 28.7, 31.9, 30.3, 26.1, 17.8, 11.2, 4.8],
      lowC: [-5.5, -6, -2.4, 0.6, 5.5, 11.8, 16.1, 14.8, 10.1, 2.9, -1.8, -5.9],
      precipMm: [18.8, 23, 34.2, 51.8, 67.6, 45.1, 53.4, 43.8, 36.4, 33.5, 21.3, 21],
      snowCover: [0.077, 0.091, 0.05, 0.03, 0.014, 0, 0, 0, 0.001, 0.022, 0.043, 0.108],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 1450,
        toM: 2500,
        habitat: '松在干燥岩肩，杨限常湿水线',
        trees: [
          { family: 'pine', name: '西黄松', taxon: 'Pinus ponderosa', share: 0.85 },
          { family: 'poplar', name: '窄叶杨', taxon: 'Populus angustifolia', share: 0.15 },
        ],
        shrubs: ['山桃花心木灌丛'],
        ground: ['丛生禾草', '裸岩'],
        flowers: [
          { name: '野生天人菊', colors: ['黄红'], bloomMonths: [6, 7, 8] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '美洲河乌', habitat: '峡谷急流石上' },
    ],
    insects: [
      { name: '蜻蜓', months: [6, 7, 8], activity: 'day', habitat: '回水湾' },
    ],
    rocks: [
      { type: '片麻岩', color: '粉灰', form: '河切岩墙', share: 1 },
    ],
    roadStyles: ['canyon floor', 'river bend'],
    transitions: [
      { to: 'rocky-pass', widthM: 4000, reason: 'US-34 至 Estes Park 盆地，干峡谷西黄松上方进入凉湿山杨与亚高山针叶带' },
      { to: 'front-prairie', widthM: 3500, reason: '从 Loveland 向西沿 Big Thompson 进入山门，开阔草地变为受岩肩与河岸约束的松杨林' },
    ],
    needsModel: [],
  },
  {
    id: 'front-prairie',
    name: '大平原西缘短草台地',
    kin: 'plains',
    roads: ['US-85 科罗拉多北部平原', 'SD-240 Wall 草原边缘'],
    typicalStretchKm: [15, 100],
    climate: {
      reference: 'US-85 科罗拉多北部平原',
      latitude: 40.67,
      longitude: -104.9,
      gridElevationM: 1772.9,
      highC: [5.6, 6.1, 11.7, 15.9, 21, 28.7, 31.9, 30.3, 26.1, 17.8, 11.2, 4.8],
      lowC: [-5.5, -6, -2.4, 0.6, 5.5, 11.8, 16.1, 14.8, 10.1, 2.9, -1.8, -5.9],
      precipMm: [18.8, 23, 34.2, 51.8, 67.6, 45.1, 53.4, 43.8, 36.4, 33.5, 21.3, 21],
      snowCover: [0.077, 0.091, 0.05, 0.03, 0.014, 0, 0, 0, 0.001, 0.022, 0.043, 0.108],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 800,
        toM: 1750,
        habitat: '草连续而低，沟渠以外不放乔木',
        trees: [],
        shrubs: [],
        ground: ['蓝格兰马草 Bouteloua gracilis', '水牛草 Bouteloua dactyloides'],
        flowers: [
          { name: '草原锥花', colors: ['黄'], bloomMonths: [6, 7, 8] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '西草地鹨', habitat: '牧栏与草坡' },
    ],
    insects: [
      { name: '草蜢', months: [6, 7, 8, 9], activity: 'day', habitat: '日照草茎' },
    ],
    rocks: [
      { type: '冲积砾', color: '灰黄', form: '低缓砾阶', share: 1 },
    ],
    roadStyles: ['open prairie', 'rolling plateau'],
    transitions: [
      { to: 'rocky-foothill', widthM: 3500, reason: '从 Loveland 向西沿 Big Thompson 进入山门，开阔草地变为受岩肩与河岸约束的松杨林' },
      { to: 'prairie-badlands', widthM: 2600, reason: 'SD-240 在 Wall 草原边缘切入受蚀泥岩，沟脊间的草台渐碎' },
    ],
    needsModel: [],
  },
  {
    id: 'sanjuan-montane',
    name: '圣胡安山地黄松与山杨林',
    kin: 'alpine',
    roads: ['US-160 Mancos–Durango', 'US-550 Durango–Coal Bank Pass'],
    typicalStretchKm: [6, 40],
    climate: {
      reference: 'US-160 Mancos–Durango',
      latitude: 37.3,
      longitude: -107.94,
      gridElevationM: 2693.65,
      highC: [-0.6, -0.1, 4.9, 10, 15.5, 22.8, 25.1, 23.5, 19.8, 12.8, 5.9, -0.5],
      lowC: [-12, -11.7, -7.1, -3, 1.5, 7.4, 11.2, 10.2, 6, -0.1, -5.5, -11.4],
      precipMm: [47.2, 46.5, 37.3, 36.6, 36.1, 16.4, 52.4, 51.2, 55.2, 42.3, 40, 52.1],
      snowCover: [0.565, 0.553, 0.317, 0.056, 0.015, 0, 0, 0, 0.001, 0.014, 0.142, 0.457],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 1900,
        toM: 3100,
        habitat: '干坡松林逐渐混入山杨，高处凉湿沟换针叶',
        trees: [
          { family: 'pine', name: '西黄松', taxon: 'Pinus ponderosa', share: 0.6 },
          { family: 'aspen', name: '美洲山杨', taxon: 'Populus tremuloides', share: 0.4 },
        ],
        shrubs: ['灌木栎', '林缘柳'],
        ground: ['草甸禾草', '林下针叶毡'],
        flowers: [
          { name: '科罗拉多蓝耧斗菜', colors: ['蓝白'], bloomMonths: [6, 7, 8] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [1900, 2550, 3700, 2950],
    birds: [
      { name: '暗冠蓝鸦', habitat: '松林冠缘' },
    ],
    insects: [
      { name: '熊蜂', months: [6, 7, 8], activity: 'day', habitat: '山杨林窗' },
    ],
    rocks: [
      { type: '冰碛砾', color: '灰褐', form: '宽谷混粒垄', share: 1 },
    ],
    roadStyles: ['valley floor', 'forested climb'],
    transitions: [
      { to: 'mesa-woodland', widthM: 3400, reason: 'US-160 Mancos 山前台阶抬高，矮松刺柏疏林逐步换为山地黄松' },
      { to: 'rocky-pass', widthM: 4200, reason: 'US-550 从 Durango 向 Coal Bank Pass 上升，山杨林窗以上逐步出现云杉冷杉与高山垭口' },
    ],
    needsModel: [],
  },
  {
    id: 'blue-meadow',
    name: '蓝岭脊顶草甸',
    kin: 'plains',
    roads: ['Skyline Drive Big Meadows'],
    typicalStretchKm: [0.3, 1.5],
    climate: {
      reference: 'Skyline Drive Big Meadows',
      latitude: 38.52,
      longitude: -78.44,
      gridElevationM: 484.88,
      highC: [3.8, 5.7, 10.9, 17.4, 22, 26.8, 29.5, 29.2, 25.7, 18.7, 12.1, 5.8],
      lowC: [-5.6, -4.8, -0.8, 4.8, 10.7, 15.4, 17.9, 17.2, 13.4, 6.8, 0.8, -3.2],
      precipMm: [59.6, 62.8, 74.1, 92.8, 114.5, 109.9, 101.3, 94, 103.7, 86.7, 73.8, 77],
      snowCover: [0.085, 0.139, 0.04, 0.004, 0, 0, 0, 0, 0, 0.003, 0.014, 0.109],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 960,
        toM: 1120,
        habitat: 'Big Meadows 的开放面由湿度与持续管理维持；高草中不布成熟林',
        trees: [],
        shrubs: [],
        ground: ['莎草', '草甸禾草'],
        flowers: [
          { name: '加拿大一枝黄花类', colors: ['金黄'], bloomMonths: [8, 9, 10] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '东部蓝鸲', habitat: '草甸林缘' },
    ],
    insects: [
      { name: '野蜂', months: [5, 6, 7, 8, 9], activity: 'day', habitat: '开花草地' },
    ],
    rocks: [
      { type: '风化变质岩', color: '红褐', form: '草皮间碎块', share: 1 },
    ],
    roadStyles: ['open meadow', 'ridge road'],
    transitions: [
      { to: 'appalachian', widthM: 350, reason: 'Skyline Drive 的 Big Meadows 处林缘骤退，湿地与割草维持脊顶开口' },
    ],
    needsModel: [],
  },
  {
    id: 'shenandoah-farm',
    name: '仙纳度河谷牧地与树篱',
    kin: 'plains',
    roads: ['US-211 Thornton Gap–Luray'],
    typicalStretchKm: [3, 25],
    climate: {
      reference: 'US-211 Thornton Gap–Luray',
      latitude: 38.67,
      longitude: -78.46,
      gridElevationM: 484.88,
      highC: [3.8, 5.7, 10.9, 17.4, 22, 26.8, 29.5, 29.2, 25.7, 18.7, 12.1, 5.8],
      lowC: [-5.6, -4.8, -0.8, 4.8, 10.7, 15.4, 17.9, 17.2, 13.4, 6.8, 0.8, -3.2],
      precipMm: [59.6, 62.8, 74.1, 92.8, 114.5, 109.9, 101.3, 94, 103.7, 86.7, 73.8, 77],
      snowCover: [0.085, 0.139, 0.04, 0.004, 0, 0, 0, 0, 0, 0.003, 0.014, 0.109],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 180,
        toM: 420,
        habitat: '保留牧草、树篱、谷底河道三条边界',
        trees: [
          { family: 'oak', name: '白栎', taxon: 'Quercus alba', share: 0.65 },
          { family: 'maple', name: '红槭', taxon: 'Acer rubrum', share: 0.35 },
        ],
        shrubs: ['田界灌丛'],
        ground: ['牧草', '田埂草'],
        flowers: [
          { name: '红三叶', colors: ['粉红'], bloomMonths: [5, 6, 7, 8, 9] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '仓燕', habitat: '农舍与草场' },
    ],
    insects: [
      { name: '萤火虫', months: [6, 7], activity: 'night', habitat: '湿暖未割田界' },
    ],
    rocks: [
      { type: '石灰岩', color: '浅灰', form: '河谷田边露头', share: 1 },
    ],
    roadStyles: ['valley farms', 'hedgerow lane'],
    transitions: [
      { to: 'appalachian', widthM: 2200, reason: 'US-211 从 Luray 上 Thornton Gap，开垦谷底和树篱接入林冠连续的 Blue Ridge 山坡' },
    ],
    needsModel: [],
  },
  {
    id: 'alaska-braid',
    name: '阿拉斯加辫状河河阶柳丛',
    kin: 'plains',
    roads: ['Dalton Highway Dietrich 河谷至 Brooks Range'],
    typicalStretchKm: [2, 24],
    climate: {
      reference: 'Dalton Highway Dietrich 河谷至 Brooks Range',
      latitude: 67.29,
      longitude: -150.18,
      gridElevationM: 832.74,
      highC: [-20.9, -17.5, -13.7, -4.8, 3.8, 12.9, 14.1, 10.7, 3.7, -7, -17.1, -19],
      lowC: [-26.5, -24.4, -24.1, -15, -3.5, 5.4, 7.1, 3.5, -2.5, -12.9, -22.1, -24.3],
      precipMm: [23, 31.9, 22, 32.6, 53.9, 74.1, 104.8, 89.5, 73.7, 48.4, 33.6, 32.9],
      snowCover: [1, 1, 1, 0.997, 0.55, 0.012, 0.001, 0.004, 0.163, 0.786, 0.988, 0.998],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 220,
        toM: 900,
        habitat: '乔木状柳只在稳定背风河阶；活跃砾洲裸露',
        trees: [
          { family: 'willow', name: '阿拉斯加柳', taxon: 'Salix alaxensis', share: 1 },
        ],
        shrubs: ['矮柳', '桤木类'],
        ground: ['先锋莎草', '裸砾'],
        flowers: [
          { name: '柳兰', colors: ['玫红'], bloomMonths: [6, 7, 8] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [220, 450, null, 650],
    birds: [
      { name: '斑点矶鹬', habitat: '浅水砾洲' },
    ],
    insects: [
      { name: '蚊', months: [6, 7, 8], activity: 'day', habitat: '背风牛轭水洼' },
    ],
    rocks: [
      { type: '冲积砾', color: '灰白', form: '辫状裸洲', share: 1 },
    ],
    roadStyles: ['braided valley', 'river bridge'],
    transitions: [
      { to: 'arctic-tundra', widthM: 2300, reason: 'Dalton 北坡的河漫滩柳丛只沿稳定砾阶伸展，冷湿冻土台面转入苔原' },
      { to: 'alaska-taiga', widthM: 1400, reason: 'Dietrich 河谷的成熟河阶长云杉，近水裸洲和新阶地先由先锋柳占据' },
    ],
    needsModel: [],
  },
  {
    id: 'sky-oak',
    name: '索诺兰天空岛栎林',
    kin: 'plains',
    roads: ['Catalina Highway Molino Basin–Windy Point'],
    typicalStretchKm: [2, 11],
    climate: {
      reference: 'Catalina Highway Molino Basin–Windy Point',
      latitude: 32.34,
      longitude: -110.71,
      gridElevationM: 1178.19,
      highC: [15.9, 17.4, 21.6, 25.7, 30.8, 36.6, 34.9, 34.1, 32.5, 27.6, 21.3, 15.5],
      lowC: [2.1, 3.1, 6, 9.1, 13.8, 19.9, 22, 21.3, 18.5, 12.7, 6.8, 1.9],
      precipMm: [27.8, 25.2, 15.9, 8.3, 4.7, 7.6, 65.5, 54.4, 33.5, 15.5, 16.6, 28.5],
      snowCover: [0.001, 0.001, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 1250,
        toM: 2100,
        habitat: '南向坡可有干草与稀栎，北向沟冠层较密',
        trees: [
          { family: 'oak', name: '亚利桑那白栎', taxon: 'Quercus arizonica', share: 0.65 },
          { family: 'oak', name: '埃默里栎', taxon: 'Quercus emoryi', share: 0.35 },
        ],
        shrubs: ['熊果灌丛'],
        ground: ['丛生旱草', '林下落叶'],
        flowers: [
          { name: '当地鼠尾草类', colors: ['紫蓝'], bloomMonths: [7, 8, 9] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '橡树啄木鸟', habitat: '栎木枝干' },
    ],
    insects: [
      { name: '野蜂', months: [4, 5, 6, 7, 8, 9], activity: 'day', habitat: '季风后林窗' },
    ],
    rocks: [
      { type: '花岗岩', color: '灰黄', form: '岩塔与风化圆块', share: 1 },
    ],
    roadStyles: ['switchback climb', 'open woodland'],
    transitions: [
      { to: 'sonoran', widthM: 3200, reason: 'Catalina Highway 从巨柱仙人掌扇面爬过半荒漠丛草带，进入较凉栎林' },
      { to: 'sky-pine', widthM: 2800, reason: 'Mount Lemmon 高段先经过松栎混交，再由凉湿黄松林封顶' },
    ],
    needsModel: [],
  },
  {
    id: 'sky-pine',
    name: '圣卡塔利娜山顶黄松林',
    kin: 'alpine',
    roads: ['Catalina Highway Summerhaven 高段'],
    typicalStretchKm: [3, 13],
    climate: {
      reference: 'Catalina Highway Summerhaven 高段',
      latitude: 32.42,
      longitude: -110.74,
      gridElevationM: 1178.19,
      highC: [15.9, 17.4, 21.6, 25.7, 30.8, 36.6, 34.9, 34.1, 32.5, 27.6, 21.3, 15.5],
      lowC: [2.1, 3.1, 6, 9.1, 13.8, 19.9, 22, 21.3, 18.5, 12.7, 6.8, 1.9],
      precipMm: [27.8, 25.2, 15.9, 8.3, 4.7, 7.6, 65.5, 54.4, 33.5, 15.5, 16.6, 28.5],
      snowCover: [0.001, 0.001, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 2050,
        toM: 2790,
        habitat: '松林上升到冷湿沟时混入冷杉，本山顶低于气候林线',
        trees: [
          { family: 'pine', name: '西黄松', taxon: 'Pinus ponderosa', share: 0.75 },
          { family: 'fir', name: '白冷杉', taxon: 'Abies concolor', share: 0.25 },
        ],
        shrubs: ['林缘灌丛'],
        ground: ['松针毡', '山草甸'],
        flowers: [
          { name: '紫菀类', colors: ['淡紫'], bloomMonths: [8, 9, 10] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [2100, 2500, null, null],
    birds: [
      { name: '白胸䴓', habitat: '松干与枝背' },
    ],
    insects: [
      { name: '熊蜂', months: [6, 7, 8, 9], activity: 'day', habitat: '山顶草花带' },
    ],
    rocks: [
      { type: '花岗岩', color: '浅灰', form: '圆蚀山脊', share: 1 },
    ],
    roadStyles: ['forest tunnel', 'mountain ridge'],
    transitions: [
      { to: 'sky-oak', widthM: 2800, reason: 'Mount Lemmon 高段先经过松栎混交，再由凉湿黄松林封顶' },
    ],
    needsModel: [],
  },
  {
    id: 'alps-orchard',
    name: '南蒂罗尔灌溉果园谷地',
    kin: 'plains',
    roads: ['SS38 上文施高谷地 Prato allo Stelvio'],
    typicalStretchKm: [2, 14],
    climate: {
      reference: 'SS38 上文施高谷地 Prato allo Stelvio',
      latitude: 46.62,
      longitude: 10.58,
      gridElevationM: 1968.36,
      highC: [-4.2, -3.2, 0.5, 5.8, 10.7, 15.2, 17.1, 16.7, 13, 8.6, 1.9, -3],
      lowC: [-13.4, -13, -8.7, -3.1, 1, 5.1, 6.9, 6.8, 2.9, -0.6, -5.4, -11.5],
      precipMm: [40.5, 38.5, 49.3, 68.8, 103.4, 114, 118.7, 130.9, 90.9, 87.8, 85.8, 51.2],
      snowCover: [0.875, 0.882, 0.653, 0.202, 0.034, 0.005, 0.001, 0.002, 0.017, 0.07, 0.323, 0.72],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 650,
        toM: 1050,
        habitat: '修剪低冠行列只在灌溉农地，山壁不种果树',
        trees: [
          { family: 'broadleaf', name: '栽培苹果', taxon: 'Malus domestica', share: 1 },
        ],
        shrubs: ['田界灌丛'],
        ground: ['行间刈草', '灌溉沟莎草'],
        flowers: [
          { name: '苹果', colors: ['粉白'], bloomMonths: [4, 5] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '乌鸫', habitat: '果园外篱' },
    ],
    insects: [
      { name: '野蜂', months: [4, 5, 6], activity: 'day', habitat: '开花果园' },
    ],
    rocks: [
      { type: '冲积砾', color: '灰褐', form: '河床圆石', share: 1 },
    ],
    roadStyles: ['valley farms', 'orchard lane'],
    transitions: [
      { to: 'central-alps', widthM: 1800, reason: 'SS38 从 Prato 谷地离开平整灌溉果园，爬向 Stelvio 山腰针叶林' },
    ],
    needsModel: [],
  },
  {
    id: 'alps-larch',
    name: '阿尔卑斯疏落叶松牧场',
    kin: 'alpine',
    roads: ['SS38 Trafoi–Franzenshöhe'],
    typicalStretchKm: [2, 12],
    climate: {
      reference: 'SS38 Trafoi–Franzenshöhe',
      latitude: 46.53,
      longitude: 10.51,
      gridElevationM: 1968.36,
      highC: [-4.2, -3.2, 0.5, 5.8, 10.7, 15.2, 17.1, 16.7, 13, 8.6, 1.9, -3],
      lowC: [-13.4, -13, -8.7, -3.1, 1, 5.1, 6.9, 6.8, 2.9, -0.6, -5.4, -11.5],
      precipMm: [40.5, 38.5, 49.3, 68.8, 103.4, 114, 118.7, 130.9, 90.9, 87.8, 85.8, 51.2],
      snowCover: [0.875, 0.882, 0.653, 0.202, 0.034, 0.005, 0.001, 0.002, 0.017, 0.07, 0.323, 0.72],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 1450,
        toM: 2250,
        habitat: '落叶松在疏牧场中向上变矮，冬季落针',
        trees: [
          { family: 'larch', name: '欧洲落叶松', taxon: 'Larix decidua', share: 0.8 },
          { family: 'pine', name: '瑞士五针松', taxon: 'Pinus cembra', share: 0.2 },
        ],
        shrubs: ['越橘', '高山杜鹃'],
        ground: ['牧草', '伏地矮灌'],
        flowers: [
          { name: '锈叶杜鹃', colors: ['玫红'], bloomMonths: [6, 7, 8] },
        ],
      },
    ],
    treelineM: [2200, 2200, 2200, 2200],
    snowlineM: [900, 1700, 3000, 2200],
    birds: [
      { name: '星鸦', habitat: '五针松冠' },
    ],
    insects: [
      { name: '熊蜂', months: [6, 7, 8, 9], activity: 'day', habitat: '牧场草花' },
    ],
    rocks: [
      { type: '片岩', color: '灰褐', form: '霜裂碎片', share: 1 },
    ],
    roadStyles: ['forest hairpins', 'open pasture'],
    transitions: [
      { to: 'central-alps', widthM: 2400, reason: 'Trafoi 以上发卡弯穿过疏松牧场，跨过林线后只剩草场和碎石' },
    ],
    needsModel: [],
  },
  {
    id: 'fjord-orchard',
    name: '松恩峡湾河口果田',
    kin: 'plains',
    roads: ['Aurlandsfjellet 的 Lærdal 谷口'],
    typicalStretchKm: [1, 10],
    climate: {
      reference: 'Aurlandsfjellet 的 Lærdal 谷口',
      latitude: 61.09,
      longitude: 7.47,
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
        toM: 180,
        habitat: '温和谷底种果蔬，水岸与陡壁留空',
        trees: [
          { family: 'broadleaf', name: '甜樱桃', taxon: 'Prunus avium', share: 0.6 },
          { family: 'broadleaf', name: '苹果', taxon: 'Malus domestica', share: 0.4 },
        ],
        shrubs: ['田界灌丛'],
        ground: ['行间牧草', '河岸草'],
        flowers: [
          { name: '果树花', colors: ['白粉'], bloomMonths: [5, 6] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '白鹡鸰', habitat: '河岸农舍' },
    ],
    insects: [
      { name: '野蜂', months: [5, 6, 7], activity: 'day', habitat: '向阳果园' },
    ],
    rocks: [
      { type: '冲积砾', color: '灰白', form: '谷口冲积扇', share: 1 },
    ],
    roadStyles: ['fjord shore', 'valley farms'],
    transitions: [
      { to: 'norway-fjord', widthM: 1400, reason: 'Lærdal 冲积平地的农田在岩壁下收窄，山路贴峡湾上升进入桦林' },
    ],
    needsModel: [],
  },
  {
    id: 'fjord-heath',
    name: '西挪威高地石南雪槽',
    kin: 'alpine',
    roads: ['Fv5627 Aurlandsfjellet 山顶段'],
    typicalStretchKm: [4, 20],
    climate: {
      reference: 'Fv5627 Aurlandsfjellet 山顶段',
      latitude: 60.94,
      longitude: 7.33,
      gridElevationM: 1119.03,
      highC: [-6.6, -5.8, -3.3, -0.6, 2.5, 8.8, 13.1, 12, 7.6, 1.7, -3.3, -5.7],
      lowC: [-11.8, -12.1, -10.7, -6.7, -2.4, 2.8, 6.3, 5.7, 2.2, -3.2, -8.2, -10.6],
      precipMm: [174, 124.5, 127.1, 106.2, 116.2, 137.6, 169, 172.6, 175.3, 164.6, 169, 182.3],
      snowCover: [1, 1, 1, 0.997, 0.784, 0.23, 0.011, 0.002, 0.054, 0.424, 0.885, 0.996],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 850,
        toM: 1400,
        habitat: '背风雪槽长莎草，迎风裸脊仅地衣',
        trees: [],
        shrubs: ['矮柳', '矮桦'],
        ground: ['岩面地衣', '莎草'],
        flowers: [
          { name: '虎耳草类', colors: ['白'], bloomMonths: [6, 7, 8] },
        ],
      },
    ],
    treelineM: [850, 850, 850, 850],
    snowlineM: [200, 500, 1350, 950],
    birds: [
      { name: '草地鹨', habitat: '高地湿草坡' },
    ],
    insects: [
      { name: '熊蜂', months: [6, 7, 8], activity: 'day', habitat: '避风处花垫' },
    ],
    rocks: [
      { type: '片麻岩', color: '灰白', form: '冰川磨光岩板', share: 1 },
    ],
    roadStyles: ['open plateau', 'snowbank bend'],
    transitions: [
      { to: 'norway-fjord', widthM: 2200, reason: 'Aurlandsfjellet 坡上山地桦逐渐风剪变矮，越林线露出雪槽和冰磨岩' },
    ],
    needsModel: [],
  },
  {
    id: 'lattari-coppice',
    name: '拉塔里山栗林谷肩',
    kin: 'plains',
    roads: ['SS366 Amalfi–Agerola'],
    typicalStretchKm: [1, 8],
    climate: {
      reference: 'SS366 Amalfi–Agerola',
      latitude: 40.66,
      longitude: 14.55,
      gridElevationM: 27.5,
      highC: [13.2, 12.9, 14.2, 16.3, 19.7, 23.6, 26.3, 26.8, 24.4, 21.4, 18.2, 14.9],
      lowC: [11.1, 10.7, 11.9, 14.1, 17.5, 21.5, 24.3, 24.8, 22.3, 19.3, 16, 12.7],
      precipMm: [101.7, 81.5, 74.5, 56.6, 40.7, 30.1, 20.9, 24.4, 76.8, 87.8, 130.4, 100.6],
      snowCover: [0.001, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 350,
        toM: 950,
        habitat: '避风山肩的薪炭林和栗树林，薄土崖缘保留矮灌',
        trees: [
          { family: 'chestnut', name: '欧洲栗', taxon: 'Castanea sativa', share: 0.7 },
          { family: 'oak', name: '绒毛栎', taxon: 'Quercus pubescens', share: 0.3 },
        ],
        shrubs: ['林缘蔷薇'],
        ground: ['林下落叶', '地蕨'],
        flowers: [
          { name: '栗花', colors: ['乳黄'], bloomMonths: [6, 7] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '乌鸫', habitat: '次生林下层' },
    ],
    insects: [
      { name: '野蜂', months: [5, 6, 7], activity: 'day', habitat: '向阳林缘' },
    ],
    rocks: [
      { type: '石灰岩', color: '乳灰', form: '山腰裂壁', share: 1 },
    ],
    roadStyles: ['forest hairpins', 'contour road'],
    transitions: [
      { to: 'amalfi-terrace', widthM: 1700, reason: 'SS366 离开向海柠檬石墙后爬上凉湿山肩，栗林与栎林沿沟重新闭合' },
      { to: 'lattari-pasture', widthM: 800, reason: 'Agerola 村边刈草与放牧维持开地，越过田界进入萌生栗林' },
    ],
    needsModel: [],
  },
  {
    id: 'lattari-pasture',
    name: '阿杰罗拉高台牧地',
    kin: 'plains',
    roads: ['SS366 Agerola 高台村道'],
    typicalStretchKm: [1, 6],
    climate: {
      reference: 'SS366 Agerola 高台村道',
      latitude: 40.64,
      longitude: 14.54,
      gridElevationM: 27.5,
      highC: [13.2, 12.9, 14.2, 16.3, 19.7, 23.6, 26.3, 26.8, 24.4, 21.4, 18.2, 14.9],
      lowC: [11.1, 10.7, 11.9, 14.1, 17.5, 21.5, 24.3, 24.8, 22.3, 19.3, 16, 12.7],
      precipMm: [101.7, 81.5, 74.5, 56.6, 40.7, 30.1, 20.9, 24.4, 76.8, 87.8, 130.4, 100.6],
      snowCover: [0.001, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 550,
        toM: 850,
        habitat: 'Agerola 台地牧场，树只在村边田界',
        trees: [
          { family: 'chestnut', name: '欧洲栗', taxon: 'Castanea sativa', share: 1 },
        ],
        shrubs: ['田界黑莓'],
        ground: ['割草地', '牧场禾草'],
        flowers: [
          { name: '红三叶', colors: ['粉红'], bloomMonths: [5, 6, 7, 8, 9] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '燕类', habitat: '村舍与牲畜草场上空' },
    ],
    insects: [
      { name: '野蜂', months: [4, 5, 6, 7, 8, 9], activity: 'day', habitat: '未割草边' },
    ],
    rocks: [
      { type: '石灰岩', color: '米白', form: '石墙碎块', share: 1 },
    ],
    roadStyles: ['upland farms', 'village lane'],
    transitions: [
      { to: 'lattari-coppice', widthM: 800, reason: 'Agerola 村边刈草与放牧维持开地，越过田界进入萌生栗林' },
    ],
    needsModel: [],
  },
  {
    id: 'south-china-paddy',
    name: '华南冲积盆地水田',
    kin: 'plains',
    roads: ['阳朔高田遇龙河盆地', '元阳红河谷地的水田段'],
    typicalStretchKm: [2, 18],
    climate: {
      reference: '阳朔高田遇龙河盆地',
      latitude: 24.74,
      longitude: 110.47,
      gridElevationM: 358.12,
      highC: [14.5, 17.9, 21.5, 25.5, 28.1, 29.3, 30.2, 30.2, 28.8, 25.5, 21.1, 15.7],
      lowC: [3.5, 6.6, 10.8, 15.5, 19.5, 22.5, 23.4, 23.1, 20.4, 15.4, 10.1, 4.3],
      precipMm: [71.2, 63.8, 135, 177.9, 290.8, 359.3, 207.3, 169.9, 98.9, 56.4, 81.1, 50.7],
      snowCover: [0.015, 0.01, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.004],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 80,
        toM: 650,
        habitat: '宽谷平田沿河汲水，隔开种植田与天然河岸',
        trees: [],
        shrubs: [],
        ground: ['水稻 Oryza sativa', '田埂莎草'],
        flowers: [
          { name: '稻花', colors: ['乳白'], bloomMonths: [6, 7, 8, 9] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '白鹭', habitat: '浅水田面' },
    ],
    insects: [
      { name: '蜻蜓', months: [4, 5, 6, 7, 8, 9, 10], activity: 'day', habitat: '缓流水渠' },
    ],
    rocks: [
      { type: '冲积泥沙', color: '赭灰', form: '低河阶与田坎', share: 1 },
    ],
    roadStyles: ['valley floor', 'irrigation crossing'],
    transitions: [
      { to: 'hani-paddy', widthM: 1500, reason: '元阳红河谷侧坡从宽谷田上升为依等高线分层灌溉的梯田' },
      { to: 'karst-river', widthM: 850, reason: '阳朔高田开阔冲积田与孤峰坡脚交错，岩缝灌丛仅在石山上变密' },
    ],
    needsModel: [],
  },
  {
    id: 'ifugao-grove',
    name: '伊富高村寨水源林',
    kin: 'plains',
    roads: ['Banaue–Bontoc 山路 Poitan 一带支路'],
    typicalStretchKm: [0.5, 4],
    climate: {
      reference: 'Banaue–Bontoc 山路 Poitan 一带支路',
      latitude: 16.92,
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
        fromM: 1150,
        toM: 1850,
        habitat: 'muyong 林紧接梯田灌渠源头；Poitan 引入树只在栽植地出现',
        trees: [
          { family: 'broadleaf', name: '石栎类', taxon: 'Lithocarpus spp.', share: 1 },
        ],
        shrubs: ['次生林缘灌丛'],
        ground: ['地蕨', '林下落叶'],
        flowers: [],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '绣眼鸟类', habitat: '村寨林冠' },
    ],
    insects: [
      { name: '凤蝶类', months: [3, 4, 5, 6, 7, 8, 9, 10], activity: 'day', habitat: '林间天窗' },
    ],
    rocks: [
      { type: '坡积碎石', color: '棕灰', form: '有根系的坡坎', share: 1 },
    ],
    roadStyles: ['forest bend', 'village ridge'],
    transitions: [
      { to: 'ifugao-paddy', widthM: 450, reason: 'Banaue 的灌渠从村寨上方 muyong 林流入梯田，土地利用边界窄' },
      { to: 'cordillera-pine', widthM: 1800, reason: '吕宋山路在向阳山脊松林与较湿坡沟阔叶水源林之间转折' },
    ],
    needsModel: [],
  },
  {
    id: 'cordillera-pine',
    name: '吕宋科迪勒拉山脊松林',
    kin: 'plains',
    roads: ['Banaue 周边 Poitan 与吕宋中部山地的阳坡松林段'],
    typicalStretchKm: [2, 12],
    climate: {
      reference: 'Banaue 周边 Poitan 与吕宋中部山地的阳坡松林段',
      latitude: 17.04,
      longitude: 121.01,
      gridElevationM: 693.02,
      highC: [24, 25.7, 28.4, 31.3, 30.7, 29.1, 28, 27.8, 27.6, 26.7, 25.6, 24.3],
      lowC: [16.4, 16.7, 17.9, 19.8, 21.3, 21.3, 21, 21.1, 20.7, 19.6, 19.2, 17.8],
      precipMm: [76, 68.2, 76.6, 78.5, 227.7, 283.9, 385.2, 424.6, 322.1, 316.9, 285.5, 264.1],
      snowCover: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 1100,
        toM: 2200,
        habitat: '科迪勒拉阳坡松林，阴湿山凹保留阔叶；不把云雾林山顶刷成纯松林',
        trees: [
          { family: 'pine', name: '卡西亚松', taxon: 'Pinus kesiya', share: 1 },
        ],
        shrubs: ['林缘灌丛'],
        ground: ['林下针叶毡', '阳坡草'],
        flowers: [],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '山地绣眼鸟类', habitat: '边缘混交林冠' },
    ],
    insects: [
      { name: '蛾类', months: [4, 5, 6, 7, 8, 9, 10], activity: 'night', habitat: '温暖林窗' },
    ],
    rocks: [
      { type: '风化山岩', color: '灰褐', form: '台肩碎块', share: 1 },
    ],
    roadStyles: ['ridge road', 'open pine woodland'],
    transitions: [
      { to: 'ifugao-grove', widthM: 1800, reason: '吕宋山路在向阳山脊松林与较湿坡沟阔叶水源林之间转折' },
    ],
    needsModel: [],
  },
  {
    id: 'sabie-gallery',
    name: '萨比河岸无花果林',
    kin: 'plains',
    roads: ['H4-1 Skukuza 河阶与 Lower Sabie'],
    typicalStretchKm: [0.5, 7],
    climate: {
      reference: 'H4-1 Skukuza 河阶与 Lower Sabie',
      latitude: -24.99,
      longitude: 31.59,
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
        toM: 350,
        habitat: '沿永久河道成窄带；通用阔叶冠仅占位，需制作本地大树形',
        pendingTrees: ['河岸无花果 Ficus sycomorus'],
        trees: [
          { family: 'giant_broadleaf', name: '河岸无花果', taxon: 'Ficus sycomorus', share: 1 },
        ],
        shrubs: ['河岸灌丛'],
        ground: ['湿岸莎草', '沙洲草'],
        flowers: [],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '非洲渔雕', habitat: '临河高枝' },
    ],
    insects: [
      { name: '蜻蜓', months: [1, 2, 3, 4, 10, 11, 12], activity: 'day', habitat: '浅水回湾' },
    ],
    rocks: [
      { type: '冲积砾', color: '灰黄', form: '岸边沙砾滩', share: 1 },
    ],
    roadStyles: ['riverbank road', 'seasonal crossing'],
    transitions: [
      { to: 'lowveld', widthM: 550, reason: 'H4-1 接近萨比河阶时树根触及常流水，窄带无花果大冠取代刺灌疏林' },
      { to: 'basalt-savanna', widthM: 700, reason: 'H10 从河桥升上排水台地，河岸高冠只沿水道延伸' },
    ],
    needsModel: ['河岸无花果 Ficus sycomorus'],
  },
  {
    id: 'basalt-savanna',
    name: '克鲁格玄武土长草台地',
    kin: 'plains',
    roads: ['H10 Lower Sabie–Tshokwane'],
    typicalStretchKm: [6, 42],
    climate: {
      reference: 'H10 Lower Sabie–Tshokwane',
      latitude: -25.11,
      longitude: 31.93,
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
        toM: 500,
        habitat: '基性岩台地草层连续；马鲁拉与瘤刺树疏立，河道处才出现浓荫',
        pendingTrees: ['马鲁拉树 Sclerocarya birrea'],
        trees: [
          { family: 'acacia', name: '瘤刺金合欢', taxon: 'Senegalia nigrescens', share: 1 },
        ],
        shrubs: ['刺灌丛'],
        ground: ['高秆草', '旱季枯草'],
        flowers: [],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '鸵鸟', habitat: '开阔草原' },
    ],
    insects: [
      { name: '蜣螂', months: [1, 2, 3, 11, 12], activity: 'day', habitat: '雨后有兽粪的草地' },
    ],
    rocks: [
      { type: '玄武岩', color: '暗灰', form: '低坡风化碎块', share: 1 },
    ],
    roadStyles: ['open savanna', 'grassland rise'],
    transitions: [
      { to: 'lowveld', widthM: 2400, reason: 'Lower Sabie 外玄武母质的开阔高草台地与混合稀树草原交错' },
      { to: 'sabie-gallery', widthM: 700, reason: 'H10 从河桥升上排水台地，河岸高冠只沿水道延伸' },
    ],
    needsModel: ['马鲁拉树 Sclerocarya birrea'],
  },
  {
    id: 'cape-dune',
    name: '开普滨海沙丘灌丛',
    kin: 'plains',
    roads: ['Noordhoek 海滨村道与 Chapman\'s Peak 南端'],
    typicalStretchKm: [0.5, 5],
    climate: {
      reference: 'Noordhoek 海滨村道与 Chapman\'s Peak 南端',
      latitude: -34.11,
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
        toM: 100,
        habitat: '沙丘顶风剪平，活跃沙面留白，成熟灌丛仅在稳定沙垄',
        trees: [],
        shrubs: ['滨海盐生矮灌', '蜡质硬叶灌丛'],
        ground: ['海滨丛草', '裸沙'],
        flowers: [
          { name: '滨海菊类', colors: ['白或黄'], bloomMonths: [8, 9, 10, 11] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '非洲黑蛎鹬', habitat: '潮间岩岸' },
    ],
    insects: [
      { name: '野蜂', months: [8, 9, 10, 11, 12], activity: 'day', habitat: '背风沙丘花' },
    ],
    rocks: [
      { type: '贝屑风成砂', color: '米白', form: '横向沙脊', share: 1 },
    ],
    roadStyles: ['coastal flats', 'dune fringe'],
    transitions: [
      { to: 'cape-fynbos', widthM: 1000, reason: 'Noordhoek 砂丘沉积与 Chapman\'s Peak 岩坡相接，盐雾和基质控制矮灌组合' },
    ],
    needsModel: [],
  },
  {
    id: 'cape-forest',
    name: '半岛避风沟谷原生林',
    kin: 'plains',
    roads: ['M63 Hout Bay–Constantia Nek、Orange Kloof 谷缘'],
    typicalStretchKm: [0.3, 4],
    climate: {
      reference: 'M63 Hout Bay–Constantia Nek、Orange Kloof 谷缘',
      latitude: -34,
      longitude: 18.4,
      gridElevationM: 18.82,
      highC: [21.8, 22.1, 21.1, 19.6, 18.1, 16.5, 15.9, 15.7, 16.5, 17.9, 19.2, 20.8],
      lowC: [18.5, 18.7, 17.8, 16.2, 15.2, 13.8, 13.1, 13, 13.6, 14.7, 15.8, 17.5],
      precipMm: [13.6, 9.3, 17, 37.3, 50.9, 90.8, 81.1, 76.4, 39.9, 30.9, 29.7, 11.7],
      snowCover: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 80,
        toM: 480,
        habitat: '湿润避火沟容下闭合林冠；仅沿公路可见林缘，保护区内部不设通车',
        trees: [
          { family: 'broadleaf', name: '开普铁木', taxon: 'Olea capensis', share: 0.55 },
          { family: 'conifer', name: '罗汉松类黄木', taxon: 'Podocarpus latifolius', share: 0.45 },
        ],
        shrubs: ['林下灌丛'],
        ground: ['地蕨', '林下落叶'],
        flowers: [],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '南非林鸽', habitat: '林中树冠' },
    ],
    insects: [
      { name: '蛾类', months: [1, 2, 3, 9, 10, 11, 12], activity: 'night', habitat: '湿谷林缘' },
    ],
    rocks: [
      { type: '花岗岩', color: '浅灰', form: '溪谷圆蚀岩块', share: 1 },
    ],
    roadStyles: ['shaded mountain road', 'stream crossing'],
    transitions: [
      { to: 'cape-fynbos', widthM: 600, reason: '半岛湿润避火沟保住原生高林，越上受风砂岩坡便回到硬叶灌丛' },
    ],
    needsModel: [],
  },
  {
    id: 'otway-pasture',
    name: '奥特韦高地牧场',
    kin: 'plains',
    roads: ['C159 Lavers Hill–Beech Forest'],
    typicalStretchKm: [2, 16],
    climate: {
      reference: 'C159 Lavers Hill–Beech Forest',
      latitude: -38.63,
      longitude: 143.52,
      gridElevationM: 120.74,
      highC: [23.6, 23.1, 21.8, 18.7, 15.4, 13, 12.2, 12.8, 14.7, 16.9, 19.5, 21.5],
      lowC: [14, 14.5, 13.7, 11.9, 10, 8.3, 7.6, 7.5, 8.3, 9.3, 11, 12.3],
      precipMm: [43.9, 44, 45.4, 59.7, 65, 76.1, 79.9, 85.8, 71.6, 62.9, 64.1, 50.6],
      snowCover: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 120,
        toM: 600,
        habitat: '已清垦高原牧场上留少量桉树与防风带，湿沟林冠继续',
        trees: [
          { family: 'eucalyptus', name: '甘露桉', taxon: 'Eucalyptus viminalis', share: 1 },
        ],
        shrubs: ['篱边灌丛'],
        ground: ['牧草', '田界高草'],
        flowers: [
          { name: '白三叶', colors: ['白'], bloomMonths: [1, 2, 3, 10, 11, 12] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '澳洲喜鹊', habitat: '牧草地与栅柱' },
    ],
    insects: [
      { name: '野蜂', months: [1, 2, 3, 9, 10, 11, 12], activity: 'day', habitat: '三叶草花' },
    ],
    rocks: [
      { type: '风化砂岩', color: '灰黄', form: '低缓田肩', share: 1 },
    ],
    roadStyles: ['rolling pasture', 'farm lane'],
    transitions: [
      { to: 'otway-coast', widthM: 2200, reason: 'Princetown 至内陆低丘从风剪滨海灌丛转为留桉牧场' },
      { to: 'otway-forest', widthM: 1000, reason: 'C159 Beech Forest 台地田界紧贴背阴湿沟，树蕨先沿溪连成带' },
    ],
    needsModel: [],
  },
  {
    id: 'eglinton-grass',
    name: '埃格林顿谷原生草甸湿地',
    kin: 'plains',
    roads: ['SH94 Eglinton Valley–Mirror Lakes'],
    typicalStretchKm: [2, 18],
    climate: {
      reference: 'SH94 Eglinton Valley–Mirror Lakes',
      latitude: -44.97,
      longitude: 168.01,
      gridElevationM: 891.28,
      highC: [15.1, 15.2, 13.6, 10.4, 7, 4.2, 3.6, 5.3, 7.2, 9.1, 11.5, 13.9],
      lowC: [5.8, 5.9, 4.8, 2.9, 1.2, -0.9, -1.5, -0.8, 0.1, 0.9, 2.6, 4.7],
      precipMm: [159.8, 133.1, 133.2, 133.1, 155.6, 133, 132.3, 120.3, 147.8, 158.7, 141.4, 159.2],
      snowCover: [0, 0, 0.001, 0.005, 0.034, 0.1, 0.11, 0.061, 0.033, 0.011, 0.006, 0.001],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 250,
        toM: 480,
        habitat: '谷底原生草地、静水湿地与红山毛榉林岛交错',
        trees: [],
        shrubs: ['湿地矮灌'],
        ground: ['红雪丛草 Chionochloa rubra', '湿地莎草'],
        flowers: [],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '澳洲黑鸭近缘灰鸭', habitat: '池塘边' },
    ],
    insects: [
      { name: '沙蝇', months: [1, 2, 3, 4, 10, 11, 12], activity: 'day', habitat: '沟溪背风岸' },
    ],
    rocks: [
      { type: '冰水冲积砾', color: '灰白', form: '平坦河阶', share: 1 },
    ],
    roadStyles: ['valley floor', 'wetland bend'],
    transitions: [
      { to: 'fiordland', widthM: 700, reason: 'Eglinton 谷底冲积草湿地和红山毛榉林岛相间，离开漫滩后林冠闭合' },
    ],
    needsModel: [],
  },
  {
    id: 'homer-alpine',
    name: '霍默隧道雪崩槽',
    kin: 'alpine',
    roads: ['SH94 Homer Tunnel 两侧上坡'],
    typicalStretchKm: [1, 7],
    climate: {
      reference: 'SH94 Homer Tunnel 两侧上坡',
      latitude: -44.76,
      longitude: 167.99,
      gridElevationM: 891.28,
      highC: [15.1, 15.2, 13.6, 10.4, 7, 4.2, 3.6, 5.3, 7.2, 9.1, 11.5, 13.9],
      lowC: [5.8, 5.9, 4.8, 2.9, 1.2, -0.9, -1.5, -0.8, 0.1, 0.9, 2.6, 4.7],
      precipMm: [159.8, 133.1, 133.2, 133.1, 155.6, 133, 132.3, 120.3, 147.8, 158.7, 141.4, 159.2],
      snowCover: [0, 0, 0.001, 0.005, 0.034, 0.1, 0.11, 0.061, 0.033, 0.011, 0.006, 0.001],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 720,
        toM: 1500,
        habitat: '低于林线也可能因雪崩无树；溪边花坪不进入活动碎石面',
        trees: [],
        shrubs: ['矮生灌木', '山地缎带木幼株'],
        ground: ['丛生雪草', '裸岩'],
        flowers: [
          { name: '库克山毛茛', colors: ['白'], bloomMonths: [1, 11, 12] },
        ],
      },
    ],
    treelineM: [1000, 1000, 1000, 1000],
    snowlineM: [1600, 1150, 650, 850],
    birds: [
      { name: '啄羊鹦鹉', habitat: '隧道口岩块' },
    ],
    insects: [
      { name: '蛾类', months: [1, 2, 11, 12], activity: 'night', habitat: '避风雪槽边缘' },
    ],
    rocks: [
      { type: '深成岩', color: '深灰', form: '雪崩槽崩积巨块', share: 1 },
    ],
    roadStyles: ['switchback pass', 'tunnel approach'],
    transitions: [
      { to: 'fiordland', widthM: 1600, reason: 'Homer Tunnel 两端雪崩反复清除林冠，槽边先锋灌木通向上部裸岩' },
    ],
    needsModel: [],
  },
  {
    id: 'daintree-tidal',
    name: '丹翠潮间红树林',
    kin: 'plains',
    roads: ['Cape Tribulation Road，Noah Creek 潮沟'],
    typicalStretchKm: [0.1, 1.5],
    climate: {
      reference: 'Cape Tribulation Road，Noah Creek 潮沟',
      latitude: -16.22,
      longitude: 145.43,
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
        toM: 12,
        habitat: '潮差而非海拔独立决定红树界；红树支柱根需地方模型',
        pendingTrees: ['潮间带红树 Rhizophora spp.'],
        trees: [
          { family: 'broadleaf', name: '红树', taxon: 'Rhizophora stylosa', share: 1 },
        ],
        shrubs: ['耐盐灌木'],
        ground: ['潮泥', '气生根群'],
        flowers: [],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '鹭类', habitat: '退潮浅滩' },
    ],
    insects: [
      { name: '蚊', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], activity: 'day', habitat: '潮林背风处' },
    ],
    rocks: [
      { type: '潮汐淤泥', color: '灰褐', form: '潮沟泥滩', share: 1 },
    ],
    roadStyles: ['tidal crossing', 'lowland road'],
    transitions: [
      { to: 'wet-tropics', widthM: 250, reason: 'Noah Creek 横切淡水雨林与潮汐泥岸，水盐界附近换成支柱根' },
      { to: 'daintree-beach', widthM: 300, reason: '丹翠沿岸湾头潮沟通向海滩，潮泥与岸后排水沙脊的耐盐林型不同' },
    ],
    needsModel: ['潮间带红树 Rhizophora spp.'],
  },
  {
    id: 'daintree-beach',
    name: '丹翠海滩背缘林',
    kin: 'plains',
    roads: ['Cape Tribulation Road–Kulki 海滨支路'],
    typicalStretchKm: [0.2, 2],
    climate: {
      reference: 'Cape Tribulation Road–Kulki 海滨支路',
      latitude: -16.08,
      longitude: 145.46,
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
        toM: 45,
        habitat: '海滩背缘透光林；高潮线外缘留沙面和马鞍藤',
        trees: [
          { family: 'broadleaf', name: '榄仁树', taxon: 'Terminalia catappa', share: 1 },
        ],
        shrubs: ['滨海露兜类'],
        ground: ['滨海匍匐草', '落叶'],
        flowers: [
          { name: '马鞍藤', colors: ['粉紫'], bloomMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '银鸥', habitat: '沙滩边缘' },
    ],
    insects: [
      { name: '凤蝶类', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], activity: 'day', habitat: '背风海滨林' },
    ],
    rocks: [
      { type: '海砂', color: '淡金', form: '岸后沙脊', share: 1 },
    ],
    roadStyles: ['coastal fringe', 'beach access'],
    transitions: [
      { to: 'wet-tropics', widthM: 350, reason: 'Kulki 海滨支路出雨林到高潮线后的通风沙脊，大冠变稀' },
      { to: 'daintree-tidal', widthM: 300, reason: '丹翠沿岸湾头潮沟通向海滩，潮泥与岸后排水沙脊的耐盐林型不同' },
    ],
    needsModel: [],
  },
  {
    id: 'andean-parkland',
    name: '巴塔哥尼亚雨影疏林草甸',
    kin: 'plains',
    roads: ['RP41 El Chaltén–Río de las Vueltas'],
    typicalStretchKm: [2, 22],
    climate: {
      reference: 'RP41 El Chaltén–Río de las Vueltas',
      latitude: -49.32,
      longitude: -72.88,
      gridElevationM: 1088.71,
      highC: [5.9, 6.4, 5, 3, 0.3, -2.2, -2.7, -1.7, 0.6, 2.4, 3.7, 5.1],
      lowC: [0.7, 0.8, 0, -1.8, -4.3, -6.9, -7.6, -7, -4.7, -3.1, -1.7, -0.2],
      precipMm: [155.7, 124.6, 154, 160.3, 154, 156.1, 130.1, 134, 115.4, 130, 142.7, 152.8],
      snowCover: [0.377, 0.269, 0.242, 0.386, 0.542, 0.773, 0.838, 0.8, 0.576, 0.426, 0.411, 0.403],
      snowBasis: 'grid-area-fraction',
    },
    bands: [
      {
        fromM: 250,
        toM: 800,
        habitat: '洼地和避风肩残留矮曲 ñire，土层浅的东向台地退为丛草原',
        pendingTrees: ['南方山毛榉 Nothofagaceae'],
        trees: [
          { family: 'broadleaf', name: '南极山毛榉', taxon: 'Nothofagus antarctica', share: 1 },
        ],
        shrubs: ['刺小檗'],
        ground: ['丛生旱草', '林下落叶'],
        flowers: [
          { name: '巴塔哥尼亚小檗', colors: ['黄'], bloomMonths: [10, 11, 12] },
        ],
      },
    ],
    treelineM: [null, null, null, null],
    snowlineM: [null, null, null, null],
    birds: [
      { name: '南方凤头卡拉鹰', habitat: '草甸与林缘' },
    ],
    insects: [
      { name: '熊蜂', months: [1, 2, 3, 11, 12], activity: 'day', habitat: '风影灌丛' },
    ],
    rocks: [
      { type: '冰水冲积砾', color: '灰褐', form: '谷缘阶地', share: 1 },
    ],
    roadStyles: ['valley floor', 'open woodland'],
    transitions: [
      { to: 'andes-rainforest', widthM: 4300, reason: '安第斯雨影内侧由闭合南方山毛榉林经湿谷林岛过渡到宽草甸' },
      { to: 'patagonian-steppe', widthM: 3200, reason: 'El Chaltén 东侧避风谷缘矮曲山毛榉林岛缩小，开放砾阶转丛草原' },
    ],
    needsModel: ['南方山毛榉 Nothofagaceae'],
  },
];
