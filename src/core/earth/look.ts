/**
 * What a place looks like, told in a few words the director can compare (docs/V3/plan/emergent-earth.md §7, §9):
 * its scene — the ecosystem at the road, the belts up its slopes, its water's, its landform, its rock, its season —
 * reduced to a signature (structure, the vegetation's hue, the ground's colour, the land's silhouette, the water,
 * snow), and the distance between two signatures: how different two places look to someone driving through.
 * Also a place's name, made from what it is. Pure, DOM-free.
 */
import { beltsOf, ecosystemAt, seasonOf, snowAt, waterEcosystemAt, type Macro } from './climate';
import type { Efg, Struct, VegHue } from './efg';
import type { SeasonType, WaterKind } from './kinds';
import { landform, type Landform, type Silhouette } from './landforms';
import { rock } from './rocks';

export interface Signature {
  struct: Struct;
  veg: VegHue;
  /** the colour of the ground and rock where it shows: the rock's own word (白、赤、黑…) */
  ground: string;
  silhouette: Silhouette;
  water: WaterKind;
  snow: boolean;
  /** how much of it is under canopy (0 … 1), and how tall that stands (m) */
  cover: number;
  height: number;
  /** how far the land rises in view (m) */
  relief: number;
}

export interface Look {
  efg: Efg;
  belts: Efg[];
  water: Efg | null;
  landform: Landform;
  season: SeasonType;
  sig: Signature;
}

/** the plain shapes of a lie of the land, where the director set no landform */
const PLAIN_OF: Readonly<Record<string, string>> = { plain: 'plain', basin: 'plain', coast: 'beach_spit', hills: 'rolling_hills', valley: 'rolling_hills', plateau: 'plateau', mountain: 'mountain_slopes' };

/** what a stretch looks like, from its knobs */
export function lookOf(m: Macro): Look {
  const pick = ecosystemAt(m, m.base);
  const belts = beltsOf(m).map((b) => b.efg);
  const water = waterEcosystemAt(m, m.base);
  const lf = landform(m.landform ?? PLAIN_OF[m.context] ?? 'plain');
  const season = seasonOf(m.tSea, m.wet, m.cont);
  const e = pick.efg;
  // (autumn and blossom are seasons of the deciduous and the orchards: a temperate wood in October is its gold)
  let veg = e.veg;
  if ((e.code === 'T2.2' || e.code === 'T4.4' || e.code === 'T7.3') && m.month >= 9 && m.month <= 11) veg = 'autumn';
  if ((e.code === 'T2.2' || e.code === 'T7.3') && (m.month === 4 || m.month === 5)) veg = 'blossom';
  // (snow at the road in its month: the same rule as the world's snow line, world/earth/region.ts snowLineOf)
  const snow = snowAt(m, m.base, m.month) || e.struct === 'ice';
  return {
    efg: e,
    belts,
    water,
    landform: lf,
    season,
    sig: { struct: e.struct, veg: snow && e.struct !== 'closed_forest' ? 'white' : veg, ground: rock(m.rock).hue, silhouette: lf.silhouette, water: m.water, snow, cover: e.cover, height: e.height, relief: m.relief },
  };
}

const STRUCT_CLASS: Readonly<Record<Struct, number>> = { closed_forest: 0, open_forest: 0.15, woodland: 0.3, savanna: 0.45, shrubland: 0.5, farmland: 0.55, grassland: 0.6, wetland: 0.62, tundra: 0.72, desert: 0.82, bare: 0.9, ice: 1, water: 0.65 };

/**
 * How different two places look, 0 the same … about 1 nothing alike: their structure (a forest from a grassland
 * from a desert), the hue of their plants, the colour of their ground, the shape of their land, their water,
 * snow, and how high their land rises.
 */
export function distance(a: Signature, b: Signature): number {
  let d = 0;
  d += 0.28 * Math.abs(STRUCT_CLASS[a.struct] - STRUCT_CLASS[b.struct]) * 1.6;
  d += a.veg === b.veg ? 0 : 0.18;
  d += a.ground === b.ground ? 0 : 0.12 * (a.cover > 0.6 && b.cover > 0.6 ? 0.3 : 1);
  d += a.silhouette === b.silhouette ? 0 : 0.2;
  d += a.water === b.water ? 0 : 0.12;
  d += a.snow === b.snow ? 0 : 0.1;
  d += 0.06 * Math.min(1, Math.abs(Math.log((a.relief + 30) / (b.relief + 30))) / 2);
  return d;
}

/**
 * The months each ecosystem is at its most beautiful (docs/V3/plan/emergent-earth.md: the seasons follow each
 * place's climate, the director turning them slowly): a deciduous wood's spring blossom and autumn fire, a
 * tundra's red September, the alpine meadows' July, a desert's March bloom, a savanna's gold dry season, a rice
 * terrace's flooded mirror. Absent: any month will do (the always-wet tropics, the ice).
 */
export const BEST_MONTHS: Readonly<Record<string, readonly number[]>> = {
  'T1.2': [5, 8], 'T2.1': [1, 9], 'T2.2': [4, 10], 'T2.3': [6], 'T2.4': [4, 6], 'T2.5': [11], 'T2.6': [5],
  'T3.1': [7], 'T3.2': [5], 'T3.3': [8], 'T4.1': [7, 1], 'T4.2': [7], 'T4.3': [8], 'T4.4': [10, 5], 'T4.5': [6],
  'T5.1': [5], 'T5.2': [3], 'T5.3': [8], 'T5.4': [10], 'T6.2': [8], 'T6.3': [9], 'T6.4': [7], 'T7.1r': [6, 9],
  'T7.1w': [7, 5], 'T7.1v': [9], 'T7.1t': [4], 'T7.1l': [7], 'T7.1f': [4], 'T7.2': [6], 'T7.3': [4], 'TF1.6': [9],
  'TF1.7': [7], 'MFT1.3': [10], 'MT2.1': [9],
};

/** the month nearest `from` (round the year) at which an ecosystem is at its best; `from` where any will do */
export function bestMonth(code: string, from: number): number {
  const best = BEST_MONTHS[code];
  if (!best) return from;
  let pick = best[0];
  let gap = 13;
  for (const b of best) {
    const d = Math.min(Math.abs(b - from), 12 - Math.abs(b - from));
    if (d < gap) {
      gap = d;
      pick = b;
    }
  }
  return pick;
}

/** a month a step of at most `most` months nearer `to` from `from`, the short way round the year */
export function monthToward(from: number, to: number, most: number): number {
  let d = to - from;
  if (d > 6) d -= 12;
  if (d < -6) d += 12;
  const step = Math.max(-most, Math.min(most, d));
  return ((from - 1 + step + 12) % 12) + 1;
}

const VEG_WORD: Partial<Record<VegHue, string>> = { deepgreen: '幽', green: '翠', fresh: '碧', teal: '苍', olive: '青', grey: '苍', gold: '金', autumn: '秋', blossom: '樱', brown: '褐', white: '雪', purple: '紫' };
/** the tree a wood is known by, as a word */
const TREE_WORD: Partial<Record<string, string>> = { conifer_spire: '杉', larch: '松', pine: '松', pine_umbrella: '松', redwood: '杉', broadleaf_leader: '桦', willow: '柳', bamboo: '篁', palm: '椰', palm_fan: '榈', eucalypt: '桉', cypress: '柏', laurel: '樟', blossom: '樱', umbrella: '槐', bottle: '瓶', mangrove: '榕', olive: '榄', cactus: '仙', tree_fern: '蕨' };

/**
 * A place's name: a word for what it is like — its rock's colour, its plants' hue or its trees, its weather, its
 * season — and a word for what it is — its land's, its ecosystem's, its water's — two or three characters (白膏丘,
 * 赤岩峡, 雾苔林 …); and the line under it, what it is (石膏沙丘·极端干旱荒漠). `taken`: names already given on
 * this journey (a name is not given twice); `r` a number 0 … 1 for the choices.
 */
export function nameOf(look: Look, m: Macro, taken: Set<string>, r: () => number, avoid: readonly string[] = []): { name: string; tag: string } {
  const e = look.efg;
  const lf = look.landform;
  const plainLand = lf.process === 'plain';
  const wet = e.weather ?? {};
  const words: string[] = [];
  const add = (w: string | undefined, n = 1): void => {
    if (w) for (let k = 0; k < n; k++) words.push(w);
  };
  add(rock(m.rock).hue, look.sig.snow ? 0 : e.cover < 0.3 ? 3 : 1);
  add(VEG_WORD[look.sig.veg], e.cover >= 0.3 ? 3 : 1);
  add(TREE_WORD[e.trees[0] ?? ''], e.cover >= 0.3 ? 2 : 0);
  if ((wet.fog ?? 0) > 0.45) add('雾', 2);
  if ((wet.wind ?? 0) > 0.5) add('风');
  if (look.sig.snow) {
    add('雪', 2);
    add(e.struct === 'ice' ? '冰' : '寒');
  }
  if ((m.month >= 9 && m.month <= 11) && e.cover > 0.2) add('秋');
  if (look.water?.code === 'F2.7') add('镜', 2);
  if (m.rock === 'rhyolite' || m.rock === 'shale') add('霞');
  const nouns = [...(plainLand ? [] : lf.name), ...e.name, ...(look.water?.name ?? [])].filter(Boolean);
  for (let k = 0; k < 40; k++) {
    const a = words[Math.floor(r() * words.length) % words.length] ?? '';
    const b = nouns[Math.floor(r() * nouns.length) % nouns.length] ?? '原';
    if (b.includes(a) || (avoid.includes(a) && k < 30)) continue;
    const name = a + b;
    if (name.length < 2 || name.length > 3 || taken.has(name)) continue;
    taken.add(name);
    const tag = plainLand ? (look.water && look.water.group !== 'F1' ? `${e.zh}·${look.water.zh}` : e.zh) : lf.zh === e.zh ? lf.zh : `${lf.zh}·${e.zh}`;
    return { name, tag };
  }
  // (every pairing taken: the third character a lie of the land's)
  const tail = ({ coast: '湾', mountain: '岭', valley: '谷', basin: '原', plateau: '台', hills: '丘', plain: '野' } as Record<string, string>)[m.context] ?? '原';
  for (let k = 0; k < 40; k++) {
    const name = (words[k % Math.max(1, words.length)] ?? '') + (nouns[(k * 7) % Math.max(1, nouns.length)]?.slice(0, 1) ?? '') + tail;
    if (!taken.has(name)) {
      taken.add(name);
      return { name, tag: e.zh };
    }
  }
  const name = `${words[0] ?? ''}${nouns[0] ?? '原'}${tail}${taken.size}`;
  taken.add(name);
  return { name, tag: e.zh };
}
