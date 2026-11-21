/**
 * The ground of a region of the emergent Earth (docs/V3/nodes/E3-earth-plants.md): its ground profile
 * (data/ecoProfiles.ts EcoProfile) made from its place — the grasses, sedges, mosses, ferns, low shrubs and
 * flowers its ecosystem cards name, belt by belt up its slopes (the card that fits each height, core/earth/
 * climate.ts ecosystemAt: the altitude zonation the ground plants follow, groundField.ts elevationBand), its
 * climate month by month (what dries the grass, what browns it in frost), its snow line season by season, its
 * rocks (what lies on its ground, rockTables.ts sampleRock).
 *
 * The plants' traits follow the climate (the plan's trait rules, §6): flowers of the tropics and of the high
 * mountains red and tubular (the birds pollinate them), of the temperate country blue, purple, yellow and white
 * (the bees'), of the deserts gold and orange; they bloom in the place's own month and the months either side,
 * none under snow.
 */
import type { EcoBand, EcoProfile } from '../data/ecoProfiles';
import { LAPSE, ecosystemAt, growingAt, seasonOf, snowAt, wetnessAt, type Macro } from '../../earth/climate';
import type { Scene } from '../../earth/director';
import type { Efg, Form } from '../../earth/efg';
import type { RockId } from '../../earth/rocks';
import { monthWarmth, snowLineOf, treeLineOf } from './region';

/** the ground plants a form is drawn as (groundTables.ts: the names its ground growths are kept under) */
const GROUND: Partial<Record<Form, string>> = {
  grass_meadow: '草甸禾草',
  grass_tall: '象草',
  grass_tussock: '丛生旱草',
  grass_hummock: '刺鬣草团',
  sedge: '莎草',
  reed: '莎草',
  aquatic: '莎草',
  fern: '地蕨',
  moss: '苔藓',
  lichen: '岩面地衣',
  crop_rice: '水稻',
  crop_wheat: '高秆草',
};
/** … the low shrubs */
const SHRUB: Partial<Record<Form, string>> = {
  shrub_round: '林缘灌丛',
  shrub_heath: '帚状欧石南',
  shrub_sage: '蒿灌丛',
  shrub_thorn: '刺灌丛',
  shrub_sclero: '桃金娘',
  cushion: '垫状草本',
  fern: '剑蕨',
  rosette: '垫状草本',
  rosette_giant: '垫状草本',
};
/** … the flowers (groundTables.ts blossoms) */
const FLOWER: Partial<Record<Form, string>> = {
  flower_daisy: '草原锥花',
  flower_umbel: '草原锥花',
  flower_cup: '加州罂粟',
  flower_spike: '柳兰',
  flower_bell: '高山勿忘草',
  flower_tube: '科罗拉多蓝耧斗菜',
  flower_cluster: '糖山龙眼',
  crop_lavender: '柳兰',
  crop_rape: '油菜',
  crop_tulip: '加州罂粟',
};

/** the rocks lying on its ground, by its rock: their kind (rockTables.ts reads it), colour and form */
const ROCKS: Readonly<Record<RockId, { type: string; color: string; form: string }>> = {
  limestone: { type: '石灰岩', color: '乳灰', form: '竖沟孤峰' },
  dolomite: { type: '石灰岩', color: '浅灰', form: '竖沟孤峰' },
  sandstone_red: { type: '砂岩', color: '赭红', form: '层状块' },
  sandstone_pale: { type: '砂岩', color: '淡赭', form: '层状块' },
  granite: { type: '花岗岩', color: '灰白', form: '圆蚀巨石' },
  basalt: { type: '玄武岩', color: '暗灰', form: '柱状块' },
  cinder: { type: '玄武岩', color: '赤红', form: '碎块' },
  rhyolite: { type: '流纹岩', color: '粉灰', form: '层状块' },
  gypsum: { type: '海砂', color: '白', form: '沙' },
  salt: { type: '海砂', color: '白', form: '盐壳' },
  loess: { type: '坡积土', color: '淡金', form: '土' },
  laterite: { type: '砂岩', color: '赤红', form: '块' },
  peat: { type: '坡积土', color: '灰褐', form: '土' },
  shale: { type: '页岩', color: '粉灰', form: '片层' },
  quartz_sand: { type: '海砂', color: '淡金', form: '沙' },
  coral_sand: { type: '海砂', color: '白', form: '沙' },
  till: { type: '冰碛', color: '灰褐', form: '砾' },
  schist: { type: '片岩', color: '青灰', form: '片层' },
};

/** the colours its flowers come in (groundTables.ts pigments), by who pollinates them where it is */
function pollinated(m: Macro, h: number): readonly string[] {
  const w = wetnessAt(m, h);
  // (the tropics' birds — hummingbirds, sunbirds — wherever there is cover; in their deserts red and orange among the gold)
  if (m.tSea > 20) return w < 0.25 ? ['橙红', '金黄', '猩红', '白'] : ['猩红', '橙红', '玫红', '白'];
  if (growingAt(m, h) < 6.4) return ['猩红', '紫蓝', '白', '黄'];
  if (w < 0.25) return ['金黄', '橙', '粉红', '白'];
  if (seasonOf(m.tSea, m.wet, m.cont) === 'mediterranean') return ['紫粉', '黄', '白', '淡紫'];
  return ['紫蓝', '黄', '白', '淡紫'];
}

const wrap = (k: number): number => ((k - 1 + 12) % 12) + 1;

/** one belt's ground plants: its card's herbs, low shrubs and flowers */
function bandOf(e: Efg, from: number, to: number, m: Macro, month: number): EcoBand {
  const ground = [...new Set(e.herbs.map((f) => GROUND[f]).filter((x): x is string => !!x))];
  const shrubs = [...new Set(e.shrubs.map((f) => SHRUB[f]).filter((x): x is string => !!x))];
  // (docs/V3/nodes/R5-ground.md: the tropical forests' understory of great leaves; the salt and the dry country's saltbush)
  if (e.group === 'T1' && (e.struct === 'closed_forest' || e.struct === 'open_forest')) ground.unshift('林下大叶草');
  if (e.struct === 'desert' && (m.rock === 'salt' || m.rock === 'gypsum' || m.water === 'salt')) shrubs.unshift('盐生灌丛');
  // (its height nearest the road: where it is seen, and where it is in bloom or under snow)
  const at = Math.max(from, Math.min(Math.min(to, from + 600), m.base));
  const colors = pollinated(m, at);
  const bloom = snowAt(m, at, month) ? [] : [wrap(month - 1), month, wrap(month + 1)];
  const forms = [...(e.flowers ?? []), ...e.herbs.filter((f) => f === 'crop_lavender' || f === 'crop_rape' || f === 'crop_tulip')];
  const flowers = [...new Set(forms.map((f) => FLOWER[f]).filter((x): x is string => !!x))].map((name, i) => ({
    name,
    // (a field of one crop in its own colour; the wild flowers in their pollinators' colours, each its own pair)
    colors: name === '油菜' ? ['黄'] : forms.includes('crop_lavender') && name === '柳兰' ? ['淡紫', '紫蓝'] : [colors[i % colors.length], colors[(i + 1) % colors.length]],
    bloomMonths: bloom,
  }));
  return { fromM: Math.round(from), toM: Math.round(to), habitat: e.zh, trees: [], shrubs, ground: ground.length ? ground : e.struct === 'ice' ? [] : ['裸地'], flowers };
}

/** the precipitation of a month (mm) by the year's kind: the monsoon's wet summer, the Mediterranean's wet winter, the rest all year */
function rainOf(m: Macro, month: number): number {
  const year = 50 + 2400 * m.wet * m.wet;
  const season = seasonOf(m.tSea, m.wet, m.cont);
  const summer = Math.cos((2 * Math.PI * (month - 7)) / 12);
  const share = season === 'monsoon' ? 1 + 0.9 * summer : season === 'mediterranean' ? 1 - 0.85 * summer : season === 'equatorial' ? 1 : 1 + 0.25 * summer;
  return Math.round((year / 12) * share);
}

/** a place's ground profile (its region's id the profile's) */
export function profileOfPlace(sc: Scene, id: string): EcoProfile {
  const m = sc.macro;
  const lo = Math.max(-200, m.base - 300);
  const hi = m.base + Math.max(200, m.relief) + 600;
  // the belts up its slopes: the card that fits each height, the runs of one card a band
  const bands: EcoBand[] = [];
  let from = lo;
  let card = ecosystemAt(m, lo).efg;
  for (let h = lo + 100; h <= hi + 100; h += 100) {
    const e = h > hi ? null : ecosystemAt(m, h).efg;
    if (e !== card) {
      bands.push(bandOf(card, from, h > hi ? 9000 : h, m, m.month));
      from = h;
      if (e) card = e;
    }
  }
  if (!bands.length) bands.push(bandOf(card, lo, 9000, m, m.month));
  bands[0] = { ...bands[0], fromM: -1000 };
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const w = wetnessAt(m, m.base);
  const range = 6 + 8 * Math.max(0, Math.min(1, 1 - w));
  const tuple = <T,>(f: (month: number) => T): readonly [T, T, T, T, T, T, T, T, T, T, T, T] => months.map(f) as unknown as readonly [T, T, T, T, T, T, T, T, T, T, T, T];
  const tl = Math.round(treeLineOf(m));
  const rk = ROCKS[m.rock];
  return {
    id,
    name: sc.name,
    kin: sc.look.sig.snow ? 'alpine' : w < 0.3 ? 'desert' : 'plains',
    roads: [],
    typicalStretchKm: [5, 5],
    climate: {
      reference: 'the emergent Earth (core/earth)',
      // (its year runs as the northern one does: the director's months are)
      latitude: 30,
      longitude: 0,
      gridElevationM: Math.round(m.base),
      highC: tuple((k) => Math.round(monthWarmth(m, m.base, k) + range / 2)),
      lowC: tuple((k) => Math.round(monthWarmth(m, m.base, k) - range / 2)),
      precipMm: tuple((k) => rainOf(m, k)),
      snowCover: tuple((k) => (snowAt(m, m.base, k) ? 1 : 0)),
      snowBasis: 'terrain-estimate',
    },
    bands,
    treelineM: [tl, tl, tl, tl],
    snowlineM: [Math.round(snowLineOf(m, 1)), Math.round(snowLineOf(m, 4)), Math.round(snowLineOf(m, 7)), Math.round(snowLineOf(m, 10))],
    birds: [],
    insects: [],
    rocks: [{ ...rk, share: 1 }],
    roadStyles: [],
    transitions: [],
    needsModel: [],
  };
}

/** (the lapse rate, for whoever needs a height from a warmth here) */
export const PROFILE_LAPSE = LAPSE;
