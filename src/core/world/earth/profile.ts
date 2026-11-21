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

/**
 * How stony a place's ground is, 0 … 1 (V3, docs/V3/nodes/V3-rocks.md): its ecosystem's bareness — the bare ground's
 * and the deserts', the tundra's, the scrub's, the grass's and the woods' — and its landform's: a lava field strewn
 * with blocks, a glacier's valley with its moraine, a granite country's tors, the canyons and the cliffs' falls.
 */
export function rockinessOf(sc: Scene): number {
  const s = sc.look.efg.struct;
  const lf = sc.look.landform.id;
  let r = s === 'bare' ? 0.5 : s === 'desert' ? 0.38 : s === 'tundra' ? 0.42 : s === 'shrubland' ? 0.22 : s === 'grassland' || s === 'savanna' ? 0.1 : s === 'ice' ? 0.3 : s === 'closed_forest' || s === 'open_forest' || s === 'woodland' ? 0.07 : 0.03;
  if (lf === 'lava_field' || lf === 'cinder_cones' || lf === 'columnar_basalt') r = Math.max(r, 0.85);
  else if (lf === 'stratovolcano' || lf === 'moraine_lake' || lf === 'u_valley' || lf === 'glacier' || lf === 'horn_arete' || lf === 'drumlins') r = Math.max(r, 0.55);
  else if (lf === 'tors' || lf === 'inselberg' || lf === 'stone_forest' || lf === 'hoodoos' || lf === 'badlands' || lf === 'yardang') r = Math.max(r, 0.5);
  else if (lf === 'canyon' || lf === 'mesas_buttes' || lf === 'escarpment' || lf === 'cuestas' || lf === 'sea_cliffs' || lf === 'sea_stacks' || lf === 'waterfall_gorge' || lf === 'fold_mountains' || lf === 'mountain_slopes') r = Math.max(r, 0.3);
  return r;
}

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

/** a number 0 … 1 of a place's own, for its choices among its birds and insects */
function pick(sc: Scene, salt: number): number {
  let x = (Math.imul(sc.index + 0x6a5, 0x9e3779b1) ^ Math.imul(salt + 0x51, 0x85ebca77)) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0;
  return ((x ^ (x >>> 13)) >>> 0) / 4294967296;
}

/** some of a list, by the place's dice (at least `least`), the order kept */
function some<T>(sc: Scene, list: readonly T[], least: number, salt: number): T[] {
  const out = list.filter((_, i) => pick(sc, salt + i) < 0.7);
  for (let i = 0; out.length < Math.min(least, list.length) && i < list.length; i++) if (!out.includes(list[i])) out.push(list[i]);
  return out;
}

/**
 * The birds of a place (docs/V3/nodes/R6-life.md; the life system's catalogue, core/v3/life/rules.ts): its woods' — the
 * tropics' parrots, fruit doves, tanagers and sunbirds, the temperate woods' jays, tits, vireos and woodpeckers, the
 * cold woods' nutcrackers and grey jays —, its open country's larks, swallows and buzzards (the tropics' weavers and
 * caracaras), the desert's ravens and doves, the high country's choughs, its water's: gulls, shearwaters and pelicans
 * by the sea, egrets, swans and ducks on its lakes and marshes, kingfishers and fish eagles by its rivers.
 */
function birdsOf(sc: Scene): { name: string; habitat: string }[] {
  const m = sc.macro;
  const e = sc.look.efg;
  const warm = m.tSea > 20;
  const cold = growingAt(m, m.base) < 9 || sc.look.sig.snow;
  const out: { name: string; habitat: string }[] = [];
  const add = (names: readonly string[], habitat: string, least = 1, salt = 0): void => {
    for (const name of some(sc, names, least, salt)) if (!out.some((b) => b.name === name)) out.push({ name, habitat });
  };
  const wooded = e.struct === 'closed_forest' || e.struct === 'open_forest' || e.struct === 'woodland';
  if (wooded) add(warm ? ['深红玫瑰鹦鹉', '果鸠', '绯红丽唐纳雀', '太阳鸟'] : cold ? ['克拉克星鸦', '灰噪鸦', '黑顶山雀'] : ['暗冠蓝鸦', '黑顶山雀', '红眼莺雀', '吉拉啄木鸟'], '林冠枝头', 2, 1);
  if (['grassland', 'savanna', 'farmland', 'shrubland', 'tundra'].includes(e.struct)) add(warm ? ['织布鸟', '燕类', '南方凤头卡拉鹰'] : ['西草地鹨', '草地鹨', '仓燕', '红尾鵟'], '开阔草地', 2, 11);
  if (e.struct === 'farmland') add(['黑嘴喜鹊', '东部蓝鸲', '美洲鸦'], '田边', 1, 21);
  if (e.struct === 'desert' || e.struct === 'bare') add(['渡鸦', '红尾鵟', '白翅哀鸽'], '荒原岩顶', 2, 31);
  if (cold || m.context === 'mountain' || e.group === 'T6') add(['黄嘴山鸦', '渡鸦'], '山脊上空', 1, 41);
  if (m.context === 'mountain' && !cold) add(['南方凤头卡拉鹰', '红尾鵟'], '山脊上空', 1, 51);
  if (m.water === 'coast' || m.context === 'coast') add(warm ? ['银鸥', '褐鹈鹕', '短尾鹱'] : ['银鸥', '短尾鹱'], '海浪近岸', 2, 61);
  if (m.water === 'lake' || m.water === 'wetland' || m.water === 'oasis') add(cold ? ['白鹭', '苔原天鹅', '绿头鸭'] : ['白鹭', '绿头鸭', '绿翅鸭'], '池塘静水', 2, 71);
  if (m.water === 'river') add(warm ? ['翠鸟', '非洲渔雕'] : ['翠鸟', '美洲鸦'], '沿河', 1, 81);
  if (!out.length) add(['燕类', '渡鸦'], '开阔草地', 1, 91);
  return out;
}

/**
 * The insects of a place (the same catalogue): bees and bumblebees where it flowers, butterflies — the tropics'
 * swallowtails and monarchs, the temperate country's whites and blues —, dragonflies by its water, fireflies where
 * its summer nights are warm and wet, moths at a lamp; each in its months of warmth.
 */
function insectsOf(sc: Scene): { name: string; months: readonly number[]; activity: 'day' | 'night'; habitat: string }[] {
  const m = sc.macro;
  const e = sc.look.efg;
  const warm = m.tSea > 20;
  const w = wetnessAt(m, m.base);
  // (its months warm enough to fly in: a month's mean of 9 °C or more at its road)
  const months: number[] = [];
  for (let k = 1; k <= 12; k++) if (monthWarmth(m, m.base, k) >= 9) months.push(k);
  if (!months.length || sc.look.sig.snow) return [];
  const out: { name: string; months: readonly number[]; activity: 'day' | 'night'; habitat: string }[] = [];
  const flowers = (e.flowers?.length ?? 0) > 0 || e.code.startsWith('T7.1');
  if (flowers) {
    out.push({ name: warm ? '野蜂' : '熊蜂', months, activity: 'day', habitat: '花丛' });
    for (const name of some(sc, warm ? ['凤蝶类', '斑蝶类'] : ['粉蝶类', '灰蝶类'], 1, 101)) out.push({ name, months, activity: 'day', habitat: '花丛' });
  }
  if (m.water !== 'none' && m.water !== 'salt') out.push({ name: '蜻蜓', months, activity: 'day', habitat: '池塘静水' });
  const summer = months.filter((k) => monthWarmth(m, m.base, k) >= 16);
  if (summer.length && w > 0.45) out.push({ name: '萤火虫', months: summer, activity: 'night', habitat: '林缘湿地' });
  out.push({ name: '蛾类', months, activity: 'night', habitat: '灯下' });
  return out;
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
  // (a lava field's and a cinder field's ground is the flow's own black blocks, rough and jagged: V3)
  const lava = sc.look.landform.id === 'lava_field' || sc.look.landform.id === 'cinder_cones';
  const rk = lava ? { type: '玄武岩', color: '暗灰', form: '熔岩块' } : ROCKS[m.rock];
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
    // (docs/V3/nodes/R6-life.md: its birds and its insects by its ecosystem, its water, its warmth and its months)
    birds: birdsOf(sc),
    insects: insectsOf(sc),
    rocks: [{ ...rk, share: 1 }],
    rockiness: rockinessOf(sc),
    roadStyles: [],
    transitions: [],
    needsModel: [],
  };
}

/** (the lapse rate, for whoever needs a height from a warmth here) */
export const PROFILE_LAPSE = LAPSE;
