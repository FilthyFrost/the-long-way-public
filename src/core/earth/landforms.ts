/**
 * The landforms of the emergent Earth (docs/V3/plan/emergent-earth.md §5): what shape the land takes, by the rock
 * it is made of and the process that made it — the wind's, running water's, the ice's and the frost's, the
 * solution of limestone, the volcanoes', the earth's folding and faulting, weathering, the sea's, the salt's.
 * About forty, and each can only be where its making is plausible: dunes where there is sand and dryness (or a
 * shore), a glacier where it is cold, tower karst where limestone is warm and wet, a salt flat in a dry basin.
 *
 * Each names the terrain operator that shapes it (E2 builds them; the land's own operators and anchored features
 * stand in until then: core/world/operators.ts, features.ts), its silhouette (for the director's measure of how
 * different two places look) and its moment (what the road is laid to show). Pure data, DOM-free.
 */
import { band, type Context, type Trap, type WaterKind } from './kinds';
import type { RockId } from './rocks';

export type Process = 'aeolian' | 'fluvial' | 'glacial' | 'periglacial' | 'karst' | 'volcanic' | 'tectonic' | 'weathering' | 'coastal' | 'evaporite' | 'plain';

/** how a landform stands against the sky: the director's measure of shape */
export type Silhouette = 'flat' | 'rolling' | 'dunes' | 'towers' | 'tables' | 'cones' | 'ridges' | 'cliffs' | 'valley' | 'canyon' | 'peaks' | 'domes' | 'mirror';

export interface Landform {
  id: string;
  zh: string;
  process: Process;
  /** where it can be: the rocks it is made of (absent: any), the lie of the land, the moisture and warmth (local, as the ecosystems' are), a water */
  rocks?: readonly RockId[];
  contexts?: readonly Context[];
  m?: Trap;
  t?: Trap;
  /** the growing season's warmth (°C, climate.ts growingAt) at the top of the land in view: where ice is on the peaks, or once was */
  top?: Trap;
  water?: readonly WaterKind[];
  /** how often it is chosen where it can be (1 as often) */
  weight?: number;
  /** the relief of the land it stands in (m): the least and the most (a delta in no mountains, a horn in no lowland) */
  span?: readonly [number, number];
  /** the operator that shapes it (E2) */
  op: string;
  silhouette: Silhouette;
  /** how high its forms stand above the road's level (m: a rough guide for the operator and the director) */
  relief: number;
  /** what the road is laid to show of it */
  moment: string;
  /** the characters a place of it is named with */
  name: readonly string[];
}

const DRY = band(0, 0.3, 0.08);
const WET = band(0.6, 1, 0.1);

export const LANDFORMS: readonly Landform[] = [
  // ---- the wind's ----
  { id: 'dune_barchan', zh: '新月形沙丘', process: 'aeolian', rocks: ['quartz_sand', 'gypsum', 'coral_sand', 'sandstone_red'], contexts: ['plain', 'basin', 'coast'], m: DRY, span: [0, 300], op: 'dunes_barchan', silhouette: 'dunes', relief: 25, moment: '一弯弯新月沙丘排到天边', name: ['沙', '丘'] },
  { id: 'dune_star', zh: '星状沙山', process: 'aeolian', rocks: ['quartz_sand', 'sandstone_red'], contexts: ['basin', 'plain'], m: band(0, 0.16, 0.06), weight: 0.8, span: [60, 500], op: 'dunes_star', silhouette: 'dunes', relief: 220, moment: '三百米高的沙山，脊线像刀刻', name: ['沙山', '海'] },
  { id: 'dune_linear', zh: '纵向沙垄', process: 'aeolian', rocks: ['quartz_sand', 'sandstone_red', 'laterite'], contexts: ['plain', 'basin'], m: DRY, span: [0, 300], op: 'dunes_linear', silhouette: 'dunes', relief: 40, moment: '一道道平行的红沙垄，路从中间穿过', name: ['沙垄', '赤'] },
  { id: 'dune_coastal', zh: '海岸沙丘', process: 'aeolian', rocks: ['quartz_sand', 'coral_sand'], contexts: ['coast'], water: ['coast'], span: [0, 200], op: 'dunes_parabolic', silhouette: 'dunes', relief: 30, moment: '翻过沙丘，海一下子出现在眼前', name: ['沙', '滩'] },
  { id: 'gypsum_dunes', zh: '石膏沙丘', process: 'evaporite', rocks: ['gypsum'], contexts: ['basin'], m: DRY, t: band(6, 32, 4), weight: 1.4, span: [0, 300], op: 'dunes_barchan', silhouette: 'dunes', relief: 15, moment: '雪一样白的沙丘，脚下却是暖的', name: ['白膏', '雪沙'] },
  { id: 'yardang', zh: '雅丹', process: 'aeolian', rocks: ['shale', 'loess', 'sandstone_pale'], contexts: ['basin', 'plain'], m: band(0, 0.15, 0.06), span: [0, 250], op: 'yardangs', silhouette: 'ridges', relief: 25, moment: '风刻出的一队队"搁浅的船"', name: ['风城', '魔'] },

  // ---- running water's ----
  { id: 'canyon', zh: '峡谷', process: 'fluvial', rocks: ['sandstone_red', 'sandstone_pale', 'limestone', 'basalt', 'rhyolite'], contexts: ['plateau', 'valley'], weight: 1.2, span: [150, 2000], op: 'canyon', silhouette: 'canyon', relief: 300, moment: '路沿着悬崖边，脚下是几百米的深谷', name: ['峡', '谷'] },
  { id: 'meander_valley', zh: '曲流河谷', process: 'fluvial', contexts: ['valley', 'plain', 'hills'], water: ['river'], span: [30, 700], op: 'meanders', silhouette: 'valley', relief: 60, moment: '河在谷底绕出一个个大弯', name: ['川', '湾'] },
  { id: 'braided_river', zh: '辫状河', process: 'fluvial', rocks: ['till', 'schist', 'granite'], contexts: ['valley', 'plain'], water: ['river'], span: [0, 900], op: 'braids', silhouette: 'flat', relief: 10, moment: '宽阔的白色砾石河床，水分成几十股', name: ['川', '滩'] },
  { id: 'alluvial_fan', zh: '冲积扇', process: 'fluvial', contexts: ['basin', 'mountain'], m: band(0, 0.4, 0.1), span: [100, 1600], op: 'fans', silhouette: 'rolling', relief: 60, moment: '山口铺开的一把巨大的石头扇子', name: ['扇', '口'] },
  { id: 'badlands', zh: '彩色劣地', process: 'fluvial', rocks: ['shale', 'rhyolite', 'loess'], contexts: ['hills', 'basin', 'plateau'], m: band(0, 0.4, 0.1), weight: 1.2, span: [30, 500], op: 'badlands', silhouette: 'ridges', relief: 70, moment: '红橙黄白一条条的山，像打翻的颜料', name: ['彩丘', '霞'] },
  { id: 'waterfall_gorge', zh: '瀑布峡谷', process: 'fluvial', contexts: ['mountain', 'valley'], m: WET, water: ['river'], span: [200, 2000], op: 'gorge', silhouette: 'cliffs', relief: 200, moment: '瀑布直接淋到路面上', name: ['瀑', '涧'] },
  { id: 'delta', zh: '三角洲', process: 'fluvial', contexts: ['coast', 'plain'], water: ['river', 'wetland', 'coast'], span: [0, 80], op: 'delta', silhouette: 'flat', relief: 3, moment: '河分成无数汊流进海里', name: ['洲', '汊'] },

  // ---- the ice's ----
  { id: 'u_valley', zh: 'U 形冰川谷', process: 'glacial', top: band(-40, 3, 2), rocks: ['granite', 'schist', 'till', 'limestone'], contexts: ['mountain', 'valley'], t: band(-14, 8, 4), weight: 1.2, span: [500, 2500], op: 'u_valley', silhouette: 'valley', relief: 900, moment: '两边千米的绝壁，谷底平得像铺过', name: ['谷', '川'] },
  { id: 'horn_arete', zh: '角峰与刃脊', process: 'glacial', top: band(-40, 0, 2), contexts: ['mountain'], t: band(-20, 2, 3), span: [800, 3000], op: 'horns', silhouette: 'peaks', relief: 1400, moment: '金字塔一样的雪峰', name: ['峰', '角', '脊'] },
  { id: 'glacier', zh: '冰川', process: 'glacial', top: band(-40, -2, 1.5), contexts: ['mountain', 'valley'], t: band(-30, -3, 3), m: band(0.3, 1, 0.1), weight: 1.3, span: [400, 3000], op: 'glacier', silhouette: 'valley', relief: 600, moment: '蓝色的冰舌从山口伸下来', name: ['冰', '舌'] },
  { id: 'moraine_lake', zh: '冰碛湖', process: 'glacial', top: band(-40, 3, 2), rocks: ['till', 'granite', 'schist'], contexts: ['mountain', 'valley'], t: band(-10, 8, 3), water: ['lake'], weight: 1.2, span: [300, 2500], op: 'moraine_lake', silhouette: 'valley', relief: 300, moment: '碛石坝后面一汪发光的松石绿', name: ['碧湖', '海子'] },
  { id: 'fjord', zh: '峡湾', process: 'glacial', contexts: ['coast', 'mountain'], water: ['coast'], t: band(-8, 12, 3), m: band(0.45, 1, 0.1), weight: 1.4, span: [400, 3000], op: 'fjord', silhouette: 'cliffs', relief: 1000, moment: '发夹弯一路下到海边，对面岩壁挂着瀑布', name: ['峡湾', '湾'] },
  { id: 'drumlins', zh: '鼓丘原', process: 'glacial', rocks: ['till'], contexts: ['plain', 'hills'], t: band(-10, 10, 3), weight: 0.5, span: [0, 120], op: 'drumlins', silhouette: 'rolling', relief: 25, moment: '一群群倒扣的勺子一样的小丘', name: ['丘', '原'] },

  // ---- the frost's ----
  { id: 'patterned_ground', zh: '多边形冻土', process: 'periglacial', contexts: ['plain', 'plateau'], t: band(-16, -4, 2), weight: 0.6, span: [0, 150], op: 'polygons', silhouette: 'flat', relief: 2, moment: '地上一张巨大的多边形网', name: ['冻', '原'] },
  { id: 'pingo', zh: '冻胀丘', process: 'periglacial', contexts: ['plain'], t: band(-16, -5, 2), weight: 0.4, span: [0, 120], op: 'pingos', silhouette: 'domes', relief: 30, moment: '平地上鼓起的冰核小山', name: ['丘', '冻'] },

  // ---- limestone's ----
  { id: 'tower_karst', zh: '峰林', process: 'karst', rocks: ['limestone', 'dolomite'], contexts: ['plain', 'valley', 'hills'], t: band(14, 30, 3), m: band(0.6, 1, 0.1), weight: 1.5, span: [100, 600], op: 'karst_towers', silhouette: 'towers', relief: 220, moment: '平地拔起几百座石峰，江上起雾', name: ['峰', '漓', '林'] },
  { id: 'cone_karst', zh: '峰丛', process: 'karst', rocks: ['limestone', 'dolomite'], contexts: ['hills', 'mountain'], t: band(10, 28, 3), m: band(0.5, 1, 0.1), span: [150, 800], op: 'karst_cones', silhouette: 'cones', relief: 250, moment: '连绵的锥形石山', name: ['丛', '峰'] },
  { id: 'pillar_mountain', zh: '石柱峰林', process: 'karst', rocks: ['sandstone_pale', 'limestone'], contexts: ['mountain'], m: band(0.6, 1, 0.1), weight: 1.2, span: [300, 1600], op: 'pillars', silhouette: 'towers', relief: 400, moment: '浮在云里的一根根石柱', name: ['柱', '悬', '云'] },
  { id: 'sinkholes', zh: '天坑与漏斗', process: 'karst', rocks: ['limestone'], contexts: ['plateau', 'hills'], m: band(0.4, 1, 0.1), weight: 0.6, span: [60, 600], op: 'sinkholes', silhouette: 'rolling', relief: 150, moment: '路边一个深不见底的天坑，底下是森林', name: ['坑', '洞'] },
  { id: 'travertine', zh: '钙华梯池', process: 'karst', rocks: ['limestone'], contexts: ['valley', 'mountain'], water: ['river', 'lake'], weight: 0.6, span: [50, 900], op: 'terraced_pools', silhouette: 'flat', relief: 30, moment: '一层层蓝绿色的梯池', name: ['池', '彩池'] },
  { id: 'stone_forest', zh: '石林', process: 'karst', rocks: ['limestone'], contexts: ['plateau', 'hills'], weight: 0.6, span: [20, 300], op: 'stone_forest', silhouette: 'towers', relief: 25, moment: '刀锋一样的石林把路夹在中间', name: ['石林', '剑'] },

  // ---- the volcanoes' ----
  { id: 'cinder_cones', zh: '火山渣锥', process: 'volcanic', rocks: ['cinder', 'basalt'], contexts: ['plain', 'plateau'], weight: 1.2, span: [80, 900], op: 'cones', silhouette: 'cones', relief: 180, moment: '一个个红黑色的截顶火山锥', name: ['锥', '焰'] },
  { id: 'stratovolcano', zh: '层状火山', process: 'volcanic', rocks: ['basalt', 'rhyolite', 'cinder'], contexts: ['mountain', 'plateau'], weight: 1.2, span: [500, 3500], op: 'stratocone', silhouette: 'peaks', relief: 2000, moment: '远处一座完美对称的雪顶火山', name: ['山', '雪顶'] },
  { id: 'crater_lake', zh: '火山口湖', process: 'volcanic', rocks: ['basalt', 'rhyolite', 'cinder'], contexts: ['mountain', 'plateau'], water: ['lake'], weight: 1.2, span: [200, 2000], op: 'crater_lake', silhouette: 'domes', relief: 300, moment: '翻上火口缘，下面一池深蓝', name: ['池', '天池'] },
  { id: 'lava_field', zh: '熔岩原', process: 'volcanic', rocks: ['basalt'], contexts: ['plain', 'plateau', 'coast'], span: [0, 400], op: 'lava_field', silhouette: 'flat', relief: 8, moment: '一望无际的黑色绳状熔岩', name: ['焦', '黑原'] },
  { id: 'columnar_basalt', zh: '柱状节理', process: 'volcanic', rocks: ['basalt'], contexts: ['coast', 'valley'], weight: 0.6, span: [30, 500], op: 'columns', silhouette: 'cliffs', relief: 40, moment: '六角形石柱排成的崖', name: ['柱', '崖'] },
  { id: 'geothermal', zh: '地热区', process: 'volcanic', rocks: ['rhyolite', 'basalt', 'cinder'], contexts: ['plateau', 'valley', 'basin'], weight: 0.9, span: [0, 700], op: 'geothermal', silhouette: 'flat', relief: 10, moment: '喷向天的间歇泉和冒汽的地缝', name: ['沸泉', '汽'] },

  // ---- the earth's folding and faulting ----
  { id: 'mesas_buttes', zh: '方山与孤峰', process: 'tectonic', rocks: ['sandstone_red', 'sandstone_pale', 'basalt'], contexts: ['plain', 'plateau', 'basin'], m: band(0, 0.45, 0.1), weight: 1.4, span: [60, 700], op: 'buttes', silhouette: 'tables', relief: 220, moment: '长直路正对着一座孤零零的砂岩巨碑', name: ['碑', '台'] },
  { id: 'cuestas', zh: '单面山', process: 'tectonic', contexts: ['hills', 'plain'], weight: 0.6, span: [60, 600], op: 'cuestas', silhouette: 'ridges', relief: 120, moment: '一道道斜着的山脊像排好的书', name: ['脊', '岭'] },
  { id: 'escarpment', zh: '大断崖', process: 'tectonic', contexts: ['plateau', 'mountain'], weight: 0.8, span: [300, 2000], op: 'escarpment', silhouette: 'cliffs', relief: 600, moment: '路在断崖上盘下千米', name: ['崖', '梯'] },
  { id: 'rift_valley', zh: '裂谷', process: 'tectonic', contexts: ['valley', 'basin'], weight: 0.5, span: [400, 2500], op: 'rift', silhouette: 'valley', relief: 800, moment: '大地裂开，谷底一串湖', name: ['谷', '裂'] },
  { id: 'tepui', zh: '桌状山', process: 'tectonic', rocks: ['sandstone_pale', 'sandstone_red'], contexts: ['plain', 'hills'], m: band(0.6, 1, 0.1), t: band(18, 30, 3), weight: 0.8, span: [300, 1500], op: 'tepuis', silhouette: 'tables', relief: 700, moment: '雨林里升起的千米桌山，顶上挂着瀑布', name: ['台', '天'] },
  { id: 'fold_mountains', zh: '褶皱山', process: 'tectonic', contexts: ['mountain', 'hills'], span: [400, 3000], op: 'ranges', silhouette: 'ridges', relief: 900, moment: '一层层弯曲的岩层露在山体上', name: ['岭', '山'] },

  // ---- weathering ----
  { id: 'inselberg', zh: '花岗岩岛山', process: 'weathering', rocks: ['granite'], contexts: ['plain', 'hills'], weight: 1.1, span: [60, 600], op: 'inselbergs', silhouette: 'domes', relief: 250, moment: '平原上浮起一座圆顶巨岩', name: ['岩', '心'] },
  { id: 'tors', zh: '石蛋与巨石堆', process: 'weathering', rocks: ['granite'], contexts: ['hills', 'plateau', 'plain'], span: [20, 400], op: 'tors', silhouette: 'rolling', relief: 20, moment: '一堆堆叠起来的圆石', name: ['石', '卵'] },
  { id: 'danxia', zh: '丹霞', process: 'weathering', rocks: ['sandstone_red'], contexts: ['hills', 'mountain'], m: band(0.3, 0.9, 0.1), weight: 1.1, span: [100, 800], op: 'danxia', silhouette: 'cliffs', relief: 200, moment: '红色的崖壁顶上长着绿树', name: ['丹', '霞'] },
  { id: 'hoodoos', zh: '石柱与烟囱岩', process: 'weathering', rocks: ['rhyolite', 'sandstone_pale', 'shale'], contexts: ['plateau', 'valley', 'hills'], m: band(0, 0.5, 0.1), weight: 1.1, span: [30, 500], op: 'hoodoos', silhouette: 'towers', relief: 40, moment: '一片尖锥，岩壁里凿着门窗', name: ['烟囱', '林'] },

  // ---- the sea's ----
  { id: 'sea_cliffs', zh: '海崖', process: 'coastal', contexts: ['coast'], water: ['coast'], weight: 1.2, span: [60, 800], op: 'sea_cliffs', silhouette: 'cliffs', relief: 150, moment: '路悬在海崖半腰，混凝土拱桥跨过溪谷', name: ['崖', '岸'] },
  { id: 'sea_stacks', zh: '海蚀柱与拱', process: 'coastal', rocks: ['limestone', 'sandstone_pale', 'sandstone_red', 'basalt'], contexts: ['coast'], water: ['coast'], weight: 1.1, span: [30, 500], op: 'sea_stacks', silhouette: 'towers', relief: 60, moment: '海里一排石柱', name: ['门', '柱'] },
  { id: 'beach_spit', zh: '沙滩与沙嘴', process: 'coastal', rocks: ['quartz_sand', 'coral_sand', 'basalt'], contexts: ['coast'], water: ['coast'], span: [0, 150], op: 'beach', silhouette: 'flat', relief: 5, moment: '一弯长长的沙滩', name: ['滩', '湾'] },
  { id: 'barrier_lagoon', zh: '潟湖沙坝', process: 'coastal', contexts: ['coast'], water: ['coast'], weight: 0.7, span: [0, 80], op: 'lagoon', silhouette: 'flat', relief: 3, moment: '两边都是水的长堤', name: ['潟', '堤'] },
  { id: 'island_chain', zh: '岛链', process: 'coastal', contexts: ['coast'], water: ['coast'], weight: 1.1, span: [20, 600], op: 'islands', silhouette: 'domes', relief: 120, moment: '桥一座接一座连起小岛', name: ['岛', '桥'] },
  { id: 'coral_cays', zh: '礁岛', process: 'coastal', rocks: ['coral_sand'], contexts: ['coast'], water: ['coast'], t: band(22, 30, 2), weight: 1.1, span: [0, 40], op: 'cays', silhouette: 'flat', relief: 2, moment: '十公里长桥贴着碧水', name: ['礁', '碧'] },

  // ---- the salt's ----
  { id: 'salt_flat', zh: '盐沼盐壳', process: 'evaporite', rocks: ['salt'], contexts: ['basin', 'plateau'], m: band(0, 0.3, 0.08), water: ['salt'], weight: 1.4, span: [0, 400], op: 'salt_flat', silhouette: 'mirror', relief: 0, moment: '一望无际的白，雨后成了天空之镜', name: ['镜', '盐', '天镜'] },
  { id: 'salt_lake', zh: '盐湖', process: 'evaporite', rocks: ['salt', 'gypsum', 'shale'], contexts: ['basin', 'plateau'], m: band(0, 0.32, 0.06), water: ['salt', 'lake'], weight: 0.9, span: [0, 600], op: 'salt_lake', silhouette: 'mirror', relief: 0, moment: '红、绿、白色的湖一串排开', name: ['彩湖', '盐湖'] },

  // ---- the plain shapes, wherever nothing grander stands ----
  { id: 'plain', zh: '平原', process: 'plain', contexts: ['plain', 'basin', 'coast'], weight: 0.5, span: [0, 90], op: 'plain', silhouette: 'flat', relief: 5, moment: '路笔直地伸向地平线', name: ['原', '野'] },
  { id: 'rolling_hills', zh: '起伏丘陵', process: 'plain', contexts: ['hills', 'plain', 'valley'], weight: 0.6, span: [30, 450], op: 'hills', silhouette: 'rolling', relief: 60, moment: '翻过一道丘，下一道丘', name: ['丘', '坡'] },
  { id: 'plateau', zh: '高原', process: 'plain', contexts: ['plateau'], weight: 0.6, span: [0, 500], op: 'plateau', silhouette: 'flat', relief: 40, moment: '天和地之间只剩这条路', name: ['原', '台'] },
  { id: 'mountain_slopes', zh: '山地', process: 'plain', contexts: ['mountain', 'valley'], weight: 0.5, span: [450, 3500], op: 'ranges', silhouette: 'peaks', relief: 700, moment: '发夹弯一道道叠在山坡上', name: ['岭', '山', '坡'] },
];

export const landformById = new Map(LANDFORMS.map((l) => [l.id, l]));

export function landform(id: string): Landform {
  const l = landformById.get(id);
  if (!l) throw new Error(`earth: no landform ${id}`);
  return l;
}
