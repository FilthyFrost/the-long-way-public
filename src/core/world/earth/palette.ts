/**
 * A place's palette (docs/V3/nodes/R1-palettes.md): the few colours everything of a place is painted in — the key
 * of its woods, its grass and its straw, its bare ground, how far a plant may stray from them, its flowers' and its
 * bark's tones, the cast of its light and its air — made from its climate, its month and its rock, with a mood of
 * its own; and the rules that take any plant's own colour into it.
 *
 * A plant keeps what sets it apart from the plants about it (a birch lighter and yellower than the oaks, a spruce
 * darker and bluer, an olive greyer) and takes everything else from the place: in a snowfield every crown is a
 * snow-laden ink green and every blade frosted, in a hot desert the shrubs are sage and the grass straw, in the wet
 * tropics the woods are deep and glossy. Two places never share a palette: the mood turns each a little its own
 * way, within what its climate allows.
 *
 * The colours are worked in OKLab (Björn Ottosson's, 2020: a perceptual space where a step in lightness, chroma or
 * hue looks the same size wherever it is taken), written out as sRGB hex. Pure and DOM-free; render-only values,
 * nothing of the world's shape depends on them.
 */
import { growingAt, monthWarmthAt, wetnessAt, type Macro } from '../../earth/climate';
import type { Scene } from '../../earth/director';
import type { VegHue } from '../../earth/efg';
import { rock } from '../../earth/rocks';

/** a colour as OKLCH: lightness 0 … 1, chroma 0 … ~0.32, hue in degrees */
export interface Lch {
  L: number;
  C: number;
  h: number;
}

/** the air of a place: what its horizon and its zenith are multiplied by, its haze's share, its sun's tint (env/colorScript.ts) */
export interface PlaceAir {
  horizon: readonly [number, number, number];
  zenith: readonly [number, number, number];
  haze: number;
  sun: readonly [number, number, number];
  /**
   * its night sky (V1, docs/V3/nodes/V1-light.md): how clear its air is (the stars' and the Milky Way's brightness: 1 a
   * clear lowland night, up to 1.5 in the dry and the high country, less in the wet tropics' haze), and how near the
   * aurora's oval is (0 … 1: the cold north's)
   */
  night?: { clarity: number; aurora: number };
}

export interface PlacePalette {
  /** the key of its leaves, lit: every plant's green is measured from it (an autumn wood's evergreens too) */
  leaf: Lch;
  /** the colour of its woods as a whole (the trees of no colour of their own, the far woods): its leaves' key, or in autumn its autumn's */
  woods: Lch;
  /** its meadow's lit green (or gold, or rust), and its straw: the grass gone dry, the seed heads */
  grass: Lch;
  straw: Lch;
  /** its bare ground, as its rock weathers under its climate */
  soil: Lch;
  /** how far a plant's own colour carries it from the key: of lightness, of chroma, of hue (0 every plant the key, 1 as far as its own) */
  spread: readonly [number, number, number];
  /** the most chroma a leaf of it has */
  cap: number;
  /** its flowers' and fruits' chroma, as a share of their own */
  bloom: number;
  /** the cast of its light on everything: added to OKLab's a and b (warm in the deserts, cold on the snow) */
  cast: readonly [number, number];
  /** autumn: how far its woods have turned (0 … 1) and to what hue (red 35 … gold 85) */
  autumn: number;
  autumnHue: number;
  /** 1 where snow lies */
  snow: number;
  /** how far its grass has gone to straw this month (0 green … 1 all straw): its dryness and its dry season, its cold */
  parched: number;
  air: PlaceAir;
}

// ---- colour

const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const gam = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

/** sRGB hex → OKLab */
export function labOf(hex: number): [number, number, number] {
  const r = lin(((hex >> 16) & 255) / 255);
  const g = lin(((hex >> 8) & 255) / 255);
  const b = lin((hex & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

function rgbOfLab(L: number, a: number, b: number): [number, number, number] {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}

/** OKLab → sRGB hex, the chroma taken down until it is a colour a screen shows (the hue and the lightness kept) */
export function hexOfLab(L: number, a: number, b: number): number {
  let k = 1;
  let rgb = rgbOfLab(L, a, b);
  for (let i = 0; i < 24 && (Math.min(rgb[0], rgb[1], rgb[2]) < -1e-4 || Math.max(rgb[0], rgb[1], rgb[2]) > 1.0001); i++) {
    k *= 0.9;
    rgb = rgbOfLab(L, a * k, b * k);
  }
  const ch = (c: number): number => Math.round(clamp(gam(clamp(c, 0, 1)), 0, 1) * 255);
  return (ch(rgb[0]) << 16) | (ch(rgb[1]) << 8) | ch(rgb[2]);
}

export function lchOf(hex: number): Lch {
  const [L, a, b] = labOf(hex);
  const C = Math.hypot(a, b);
  return { L, C, h: C < 1e-6 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

/** OKLCH → sRGB hex, with a cast (OKLab a and b) added */
export function hexOf(c: Lch, cast: readonly [number, number] = [0, 0]): number {
  const r = (c.h * Math.PI) / 180;
  return hexOfLab(clamp(c.L, 0, 1), Math.max(0, c.C) * Math.cos(r) + cast[0], Math.max(0, c.C) * Math.sin(r) + cast[1]);
}

/** the way from hue a to hue b (degrees, −180 … 180) */
export function hueTurn(a: number, b: number): number {
  return ((((b - a) % 360) + 540) % 360) - 180;
}

const lch = (L: number, C: number, h: number): Lch => ({ L, C, h });
const toward = (h: number, to: number, t: number): number => (h + hueTurn(h, to) * clamp(t, 0, 1) + 360) % 360;
function mixLch(a: Lch, b: Lch, t: number): Lch {
  const k = clamp(t, 0, 1);
  return { L: a.L + (b.L - a.L) * k, C: a.C + (b.C - a.C) * k, h: toward(a.h, b.h, k) };
}

// ---- what a plant's own colour is measured from

/** the colour the plants' own colours were chosen against: the crown of the first plains (scene/palette.ts) */
const REF_LEAF = lchOf(0x6aa860);
/** the meadow's (the first plains' lit ground) */
const REF_GRASS = lchOf(0x8ebe69);

// ---- a place's palette

/** the key of the woods and of the meadow for each hue of a card's plants (efg.ts VegHue) */
const KEYS: Readonly<Record<VegHue, readonly [Lch, Lch]>> = {
  deepgreen: [lch(0.53, 0.092, 146), lch(0.63, 0.11, 138)],
  green: [lch(0.6, 0.12, 138), lch(0.69, 0.13, 132)],
  fresh: [lch(0.67, 0.122, 130), lch(0.73, 0.125, 124)],
  teal: [lch(0.52, 0.072, 168), lch(0.63, 0.085, 150)],
  olive: [lch(0.6, 0.085, 118), lch(0.7, 0.09, 108)],
  grey: [lch(0.65, 0.045, 138), lch(0.73, 0.06, 102)],
  gold: [lch(0.6, 0.085, 120), lch(0.77, 0.105, 86)],
  autumn: [lch(0.55, 0.09, 136), lch(0.68, 0.095, 80)],
  blossom: [lch(0.66, 0.12, 134), lch(0.72, 0.13, 128)],
  brown: [lch(0.55, 0.07, 96), lch(0.66, 0.07, 84)],
  white: [lch(0.46, 0.04, 182), lch(0.8, 0.025, 95)],
  purple: [lch(0.55, 0.07, 122), lch(0.6, 0.07, 100)],
  none: [lch(0.62, 0.06, 112), lch(0.74, 0.055, 86)],
};

/** the veg hue of a place's plants in its month (a deciduous wood's gold in autumn, the orchards' blossom in spring) */
export function vegOf(sc: Scene): VegHue {
  return sc.look.sig.veg === 'none' ? (sc.look.efg.veg === 'none' ? 'none' : sc.look.efg.veg) : sc.look.sig.veg;
}

/** the share of its month's rain against its year's mean month: under 1 a dry season (the monsoon's winter, the Mediterranean's summer) */
function monthRain(m: Macro): number {
  const summer = Math.cos((2 * Math.PI * (m.month - 7)) / 12);
  const monsoon = m.tSea > 18 && m.wet > 0.25 && m.cont > 0.35;
  const med = m.tSea > 11 && m.tSea < 21 && m.wet < 0.6 && m.cont < 0.45 && !monsoon;
  return monsoon ? 1 + 0.9 * summer : med ? 1 - 0.85 * summer : 1 + 0.25 * summer;
}

/** three numbers 0 … 1 of a place's own, for its mood */
function moodOf(seed: number, k: number): [number, number, number] {
  let x = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(k + 7717, 0x85ebca77)) >>> 0;
  const next = (): number => {
    x = (x + 0x6d2b79f5) >>> 0;
    let t = Math.imul(x ^ (x >>> 15), 1 | x);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return [next(), next(), next()];
}

/**
 * The palette of a place of the emergent Earth (core/earth/director.ts Scene), its mood its world's seed and its
 * index along the journey (the same place the same palette, whoever made it first).
 */
export function paletteOfPlace(sc: Scene, seed: number, k: number): PlacePalette {
  const m = sc.macro;
  const e = sc.look.efg;
  const h = m.base;
  const w = wetnessAt(m, h);
  const t = monthWarmthAt(m, h, m.month);
  const g = growingAt(m, h);
  const snow = sc.look.sig.snow ? 1 : 0;
  const veg = vegOf(sc);
  const [mh, mc, ml] = moodOf(seed, k);
  let [leaf, grass] = KEYS[snow ? 'white' : veg];
  leaf = { ...leaf };
  grass = { ...grass };
  let straw = lch(0.78, 0.075, 85);
  let spread: [number, number, number] = [0.85, 0.75, 0.6];
  let cap = 0.145;
  let bloom = 1;
  let cast: [number, number] = [0, 0];
  const autumn = veg === 'autumn' && !snow ? 1 : 0;
  // (an autumn red where the winters are hard and the country continental, gold by a milder sea; the tundra's rust)
  const autumnHue = e.struct === 'tundra' ? 42 : m.cont > 0.55 ? 40 : 84;

  // the dry country: its leaves hard and grey-green, its grass straw; the drier, the more
  const dry = clamp((0.36 - w) / 0.3, 0, 1);
  if (dry > 0 && !snow) {
    leaf.C *= 1 - 0.45 * dry;
    leaf.h = toward(leaf.h, 115, 0.55 * dry);
    leaf.L += 0.05 * dry;
    grass = mixLch(grass, lch(0.77, 0.07, 84), 0.85 * dry);
    straw = mixLch(straw, lch(0.8, 0.06, 78), dry);
    cap = 0.145 - 0.06 * dry;
    cast = [0.004 * dry, 0.014 * dry];
  }
  // a dry month in a wet year: the monsoon's winter, the Mediterranean's summer — the grass gone gold, the woods dusty
  const season = monthRain(m);
  let parched = dry;
  if (season < 0.55 && !snow) {
    const d = clamp((0.55 - season) / 0.45, 0, 1);
    parched = Math.max(parched, 0.75 * d);
    grass = mixLch(grass, straw, 0.75 * d);
    leaf.C *= 1 - 0.18 * d;
    leaf.h = toward(leaf.h, 112, 0.25 * d);
  }
  // the wet tropics: deep and glossy
  if (m.tSea > 22 && w > 0.7 && !snow) {
    leaf.C *= 1.04;
    leaf.L -= 0.02;
    cap = Math.min(cap, 0.13);
  }
  // the cold: darker and bluer, the needles' country
  if (g < 9 && !snow && !autumn) {
    const c = clamp((9 - g) / 4, 0, 1);
    leaf.h = toward(leaf.h, 168, 0.35 * c);
    leaf.C *= 1 - 0.18 * c;
    leaf.L -= 0.03 * c;
    cast = [cast[0] - 0.002 * c, cast[1] - 0.005 * c];
  }
  // the tundra by its month: green moss in its short summer, rust in its autumn, brown the rest of the year
  if (e.struct === 'tundra' && !snow) {
    grass = m.month >= 6 && m.month <= 8 ? lch(0.6, 0.08, 120) : m.month === 9 || m.month === 10 ? lch(0.58, 0.085, 54) : lch(0.6, 0.05, 80);
    straw = lch(0.7, 0.05, 82);
  }
  // a cold month without snow: the grass gone the colour of hay, the woods dull
  if (!snow && t < 3 && e.struct !== 'tundra') {
    const c = clamp((3 - t) / 5, 0, 1);
    parched = Math.max(parched, 0.6 * c);
    grass = mixLch(grass, lch(0.68, 0.05, 88), 0.7 * c);
    leaf.C *= 1 - 0.25 * c;
  }
  // the snow: everything under it ink and frost, the light cold
  if (snow) {
    spread = [0.6, 0.5, 0.3];
    cap = 0.05;
    bloom = 0.6;
    cast = [-0.004, -0.012];
    straw = lch(0.74, 0.03, 90);
  }
  // the ice: nothing green at all
  if (e.struct === 'ice') {
    leaf = lch(0.5, 0.03, 190);
    grass = lch(0.82, 0.02, 230);
    cap = 0.035;
  }
  // the high country: the air thin, the colours a little cooler
  if (h > 2200) {
    leaf.C *= 0.92;
    grass.C *= 0.9;
  }
  // (its mood: its own turn of hue, chroma and lightness — every other place a little warmer and lighter, the next a
  // little cooler and deeper, so that two neighbours of one country are never painted alike)
  const side = k % 2 === 0 ? 1 : -1;
  const turn = -side * (5 + 7 * mh) * (snow || autumn ? 0.5 : 1);
  leaf.h = (leaf.h + turn + 360) % 360;
  grass.h = (grass.h + turn * 0.9 + 360) % 360;
  leaf.C = Math.min(cap, leaf.C * (1 + side * (0.04 + 0.08 * mc)));
  grass.C *= 1 + side * (0.04 + 0.08 * mc);
  leaf.L += side * (0.012 + 0.025 * ml);
  grass.L += side * (0.012 + 0.025 * ml);
  if (dry > 0.5) bloom = 0.9;
  if (m.tSea > 20 && w > 0.5) bloom = 1.08;

  // its bare ground: its rock's, darker where it is wet, paler where it is dry
  const rk = rock(m.rock);
  const soil0 = lchOf(rk.ground);
  const soil = lch(clamp(soil0.L - 0.07 * w + 0.03 * dry + side * 0.02, 0.2, 0.9), soil0.C * (1 - 0.2 * snow) * (1 + side * 0.06), (soil0.h - side * 5 + 360) % 360);

  const woods = autumn ? lch(0.62 + (ml - 0.5) * 0.04, 0.15, autumnHue) : leaf;
  return { leaf, woods, grass, straw, soil, spread, cap, bloom, cast, autumn, autumnHue, snow, parched, air: airOf(sc, w, t, dry, snow, mh, side) };
}

/** the air of a place: a desert's warm horizon, the snow's cold blue, a high plateau's deep zenith, the wet tropics' haze */
function airOf(sc: Scene, w: number, t: number, dry: number, snow: number, mood: number, side: number): PlaceAir {
  const m = sc.macro;
  let horizon: [number, number, number] = [1, 1, 1];
  let zenith: [number, number, number] = [1, 1, 1];
  let sun: [number, number, number] = [1, 1, 1];
  let haze = 1;
  const mul = (a: [number, number, number], b: readonly [number, number, number], k: number): [number, number, number] => [a[0] * (1 + (b[0] - 1) * k), a[1] * (1 + (b[1] - 1) * k), a[2] * (1 + (b[2] - 1) * k)];
  if (dry > 0) {
    // (hot dry country: a warm low sky and a white-hot sun; cold dry country: a pale clear one)
    const hot = clamp((t - 8) / 14, 0, 1);
    horizon = mul(horizon, [1.08, 1.0, 0.88], dry * hot);
    sun = mul(sun, [1.04, 1.0, 0.93], dry * hot);
    zenith = mul(zenith, [0.98, 1.0, 1.03], dry);
    haze *= 1 - 0.15 * dry;
  }
  if (snow) {
    horizon = mul(horizon, [0.95, 1.0, 1.07], 1);
    zenith = mul(zenith, [0.94, 1.0, 1.06], 1);
    sun = mul(sun, [0.98, 1.0, 1.04], 1);
    haze *= 0.85;
  }
  if (m.base > 2600) {
    // (thin air: the sky deep blue overhead, the distance clear)
    const k = clamp((m.base - 2600) / 1600, 0, 1);
    zenith = mul(zenith, [0.84, 0.94, 1.08], k);
    haze *= 1 - 0.35 * k;
  }
  if (m.tSea > 22 && w > 0.7) {
    horizon = mul(horizon, [0.98, 1.03, 0.98], 1);
    haze *= 1.3;
  }
  if (sc.look.sig.veg === 'autumn' && !snow) {
    horizon = mul(horizon, [1.06, 1.0, 0.9], 1);
    sun = mul(sun, [1.05, 1.0, 0.9], 1);
  }
  if (m.water === 'coast') {
    horizon = mul(horizon, [0.98, 1.0, 1.04], 1);
    haze *= 1.15;
  }
  // (its mood: a breath warmer or cooler, as its colours are)
  const k = side * (0.012 + 0.02 * mood);
  horizon = mul(horizon, [1 + k, 1, 1 - k], 1);
  // (its night: the stars as bright as the air is clear — dry, high, away from the wet tropics and the sea's damp — and
  // the aurora where the north is near)
  const clear = 1 + 0.35 * dry + 0.3 * clamp((m.base - 800) / 2400, 0, 1) - (m.tSea > 22 && w > 0.7 ? 0.25 : 0) - (m.water === 'coast' ? 0.08 : 0);
  const night = { clarity: clamp(clear, 0.7, 1.5), aurora: clamp((10 - m.tSea) / 7, 0, 1) };
  return { horizon, zenith, haze, sun, night };
}

// ---- a plant's colours in a place

/**
 * A leaf of a place: the key of its woods, moved as far from it as the plant's own colour is from the colour it
 * was chosen against (REF_LEAF), as far as the place lets it stray — its lightness, chroma and hue — held to the
 * place's chroma, in the place's light.
 */
export function leafColour(p: PlacePalette, own: number): number {
  const n = lchOf(own);
  const L = p.leaf.L + (n.L - REF_LEAF.L) * p.spread[0];
  const C = Math.min(p.cap, p.leaf.C * Math.max(0.25, 1 + (n.C / REF_LEAF.C - 1) * p.spread[1]));
  const h = p.leaf.h + clamp(hueTurn(REF_LEAF.h, n.h), -60, 60) * p.spread[2];
  return hexOf({ L: clamp(L, 0.18, 0.88), C, h }, p.cast);
}

/** an autumn leaf of a place: its own autumn colour turned toward the place's autumn, lit as the place is */
export function autumnColour(p: PlacePalette, own: number): number {
  const n = lchOf(own);
  return hexOf({ L: clamp(n.L + (p.leaf.L - 0.62) * 0.6, 0.3, 0.85), C: Math.min(0.17, n.C), h: toward(n.h, p.autumnHue, 0.3) }, p.cast);
}

/** a blade of a place's meadow (grasses, sedges, rushes, the crops' stalks): its key, green or dry, and the blade's own difference */
export function grassColour(p: PlacePalette, own: number, dry = false): number {
  const n = lchOf(own);
  const key = dry ? p.straw : p.grass;
  const L = key.L + (n.L - REF_GRASS.L) * 0.6;
  const C = key.C * Math.max(0.3, 1 + (n.C / REF_GRASS.C - 1) * 0.5);
  const h = key.h + clamp(hueTurn(REF_GRASS.h, n.h), -50, 50) * 0.4;
  return hexOf({ L: clamp(L, 0.25, 0.9), C: Math.min(C, p.cap + 0.02), h }, p.cast);
}

/** a flower, a fruit, a blossom: its own hue, its chroma as the place's light lets it show */
export function accentColour(p: PlacePalette, own: number): number {
  const n = lchOf(own);
  return hexOf({ L: clamp(n.L + (p.leaf.L - REF_LEAF.L) * 0.25, 0.25, 0.95), C: n.C * p.bloom, h: n.h }, [p.cast[0] * 0.5, p.cast[1] * 0.5]);
}

/** bark, wood, a stalk's dead brown: its own, in the place's light, dulled under snow */
export function barkColour(p: PlacePalette, own: number): number {
  const n = lchOf(own);
  return hexOf({ L: clamp(n.L - 0.04 * p.snow, 0.15, 0.92), C: n.C * (1 - 0.3 * p.snow), h: n.h }, [p.cast[0] * 1.4, p.cast[1] * 1.4]);
}

/** a stone, a rock face: its own, in the place's light */
export function stoneColour(p: PlacePalette, own: number): number {
  return hexOf(lchOf(own), p.cast);
}

/** moss, lichen, litter, the ground's low mats: drawn toward the place's soil and its grass */
export function groundColour(p: PlacePalette, own: number): number {
  const n = lchOf(own);
  const to = mixLch(p.soil, p.grass, 0.5);
  const c = mixLch(n, to, 0.4);
  return hexOf({ L: c.L, C: Math.min(c.C, p.cap + 0.01), h: c.h }, p.cast);
}

/**
 * The broad patches of a place's ground (the paint's warm and cool patches: render/terrainMaterials.ts), as what
 * its grass is multiplied by there, channel by channel in linear light: a lighter, yellower patch and a deeper,
 * greener or bluer one — the tundra's gold sedge and its olive moss among the rust of its shrubs, a savanna's gold
 * and olive, a meadow's yellow-green and blue-green; hardly any under snow.
 */
export function patchesOf(p: PlacePalette): [[number, number, number], [number, number, number]] {
  const g = p.grass;
  const k = p.snow ? 0.35 : 1;
  const warm: Lch = { L: g.L + 0.05 * k, C: g.C * (1 + 0.08 * k), h: toward(g.h, p.parched > 0.5 ? 62 : 82, 0.4 * k) };
  const cool: Lch = { L: g.L - 0.06 * k, C: g.C * (1 - 0.1 * k), h: toward(g.h, g.h < 100 ? 118 : 158, 0.45 * k) };
  const lin3 = (hex: number): number[] => [lin(((hex >> 16) & 255) / 255), lin(((hex >> 8) & 255) / 255), lin((hex & 255) / 255)];
  const b = lin3(hexOf(g));
  const ratio = (c: Lch): [number, number, number] => {
    const x = lin3(hexOf(c));
    return [0, 1, 2].map((i) => clamp(x[i] / Math.max(b[i], 1e-3), 0.6, 1.5)) as [number, number, number];
  };
  return [ratio(warm), ratio(cool)];
}

/** the palette's own swatches, for the place's painted look (region.ts lookOfPlace) and for the tests */
export function swatches(p: PlacePalette): { leaf: number[]; grass: number[]; straw: number; soil: number } {
  const tone = (c: Lch, dL: number, kC = 1): number => hexOf({ L: c.L + dL, C: c.C * kC, h: c.h }, p.cast);
  return {
    leaf: [tone(p.woods, -0.05), tone(p.woods, 0), tone(p.woods, 0.05, 0.95), tone(p.woods, 0.1, 0.85), tone(p.woods, -0.11, 0.95)],
    grass: [tone(p.grass, -0.07, 0.95), tone(p.grass, 0), tone(p.grass, 0.05, 0.92)],
    straw: tone(p.straw, 0),
    soil: tone(p.soil, 0),
  };
}
