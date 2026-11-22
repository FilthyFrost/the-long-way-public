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
import { hash2 } from '../../math/rng';

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
  /** its clouds (V1b, docs/V3/nodes/V1b-clouds.md): which kinds its climate and its land give it, by its own dice */
  sky?: PlaceSky;
  /** (G7) its light: what the hour's light is made in this country (env/colorScript.ts) */
  light?: PlaceLight;
}

/**
 * (G7, docs/V3/nodes/G-ghibli.md) The light of a place, against the hour's own — every country lit as it is, not all
 * of them as one meadow at noon:
 *
 *   a hot desert     a hard white sun and little fill: its shade deep and violet against the warm ground, and the ground's
 *                    own warmth thrown back up into it; the finish a little harder;
 *   the wet tropics  the sun softened by the wet air and the sky's fill strong: no hard shade anywhere, the shade green
 *                    under the canopy; colour rich, contrast gentle; the air shows every shaft of light;
 *   snow country     the snow throws the sky back into every shade: shade pale and blue, colour clean;
 *   the high country thin air: a fierce sun, a dark sky's little fill, shade a deep blue;
 *   a coast          a bright air, the sea's light in the shade;
 *   an autumn wood   the shade violet under the gold, the litter's warmth thrown back;
 *   woods, wetlands  a soft fill, a green shade, shafts through their air of a morning.
 */
export interface PlaceLight {
  /** the sun's strength and the sky's fill against the hour's */
  sun: number;
  fill: number;
  /** what the sky's light is multiplied by: the tint of the shade */
  shade: readonly [number, number, number];
  /** its ground's colour (linear): what it throws back up into the shade, and how far that replaces the hour's own */
  bounce: readonly [number, number, number];
  bounceK: number;
  /** the finish's contrast and saturation against the style's */
  contrast: number;
  saturation: number;
  /** how readily its air shows shafts of light, 0 … 1 */
  shafts: number;
}

/** how much of its ground is under grass or the like, by its structure (the rest is its rock's ground) */
export const GRASSY: Readonly<Record<string, number>> = { closed_forest: 0.85, open_forest: 0.8, woodland: 0.75, savanna: 0.75, shrubland: 0.5, grassland: 1, farmland: 1, wetland: 1, tundra: 0.7, desert: 0.08, bare: 0.08, ice: 0, water: 0.5 };

/** the light of a place (PlaceLight), from its climate, its country and its ground's colour */
function lightOf(sc: Scene, w: number, t: number, dry: number, snow: number, autumn: number, ground: number): PlaceLight {
  const m = sc.macro;
  const e = sc.look.efg;
  const hot = clamp((t - 8) / 14, 0, 1);
  const high = clamp((m.base - 2200) / 1800, 0, 1);
  // (warm and wet: the air itself is in the picture)
  const humid = clamp((w - 0.55) / 0.35, 0, 1) * clamp((t - 10) / 12, 0, 1);
  const wooded = snow ? 0 : e.struct === 'closed_forest' ? 1 : e.struct === 'open_forest' ? 0.7 : e.struct === 'woodland' ? 0.4 : 0;
  const coast = m.water === 'coast' ? 1 : 0;
  const watery = m.water === 'wetland' || m.water === 'lake' ? 1 : 0;
  const sun = 1 + 0.12 * dry * hot + 0.06 * dry * (1 - hot) + 0.1 * high - 0.1 * humid + 0.05 * snow;
  const fill = 1 - 0.16 * dry - 0.14 * high + 0.18 * humid + 0.12 * snow + 0.06 * coast + 0.05 * wooded + 0.08 * watery;
  const shade: [number, number, number] = [1, 1, 1];
  const tint = (c: readonly [number, number, number], k: number): void => {
    for (let i = 0; i < 3; i++) shade[i] *= 1 + (c[i] - 1) * k;
  };
  tint([0.93, 0.97, 1.09], dry);
  tint([0.88, 0.96, 1.1], high);
  tint([0.86, 0.96, 1.14], snow);
  tint([0.94, 1.03, 0.99], humid * (0.5 + 0.5 * wooded));
  tint([0.96, 1.02, 0.99], wooded * (1 - humid));
  tint([0.95, 1.0, 1.05], coast);
  tint([1.02, 0.96, 1.06], autumn);
  const lin3 = (hex: number): [number, number, number] => [lin(((hex >> 16) & 255) / 255), lin(((hex >> 8) & 255) / 255), lin((hex & 255) / 255)];
  return {
    sun,
    fill,
    shade,
    bounce: lin3(ground),
    bounceK: clamp(0.3 + 0.4 * dry + 0.45 * snow + 0.15 * wooded, 0, 0.85),
    contrast: 1 + 0.07 * dry + 0.06 * high - 0.05 * humid - 0.02 * snow,
    saturation: 1 + 0.03 * dry * hot + 0.08 * humid + 0.05 * wooded + 0.06 * autumn - 0.05 * snow + 0.04 * coast,
    shafts: clamp(0.3 + 0.5 * humid + 0.3 * wooded + 0.25 * watery + 0.2 * dry * hot + 0.15 * coast + 0.2 * autumn - 0.15 * high, 0.15, 1),
  };
}

/**
 * A place's clouds, each 0 … 1 (how much of it), as its climate and its land have them: the dry country's clean skies
 * and high cirrus, the wet tropics' towering heaps, a coast's grey flocks, the cold's veils, the mountains' lenses,
 * once in a while billows or a single long ribbon across the sky; the heaps' base higher in dry and high country.
 */
export interface PlaceSky {
  cirrus: number;
  cirrocumulus: number;
  altocumulus: number;
  veil: number;
  /** billows: how much, the direction they run across (rad), their spacing (m), 1 for a single ribbon */
  waves: number;
  waveDir: number;
  waveSpacing: number;
  ribbon: number;
  /** lenticular clouds over the peaks (mountain country with wind) */
  lens: number;
  /** the fair-weather heaps: a multiplier of how many, how far they tower, their base (m over the sea) */
  cumulus: number;
  towers: number;
  base: number;
  /** noctilucent clouds on its summer twilights (the cold north) */
  nlc: number;
  /**
   * (C1) its layers' own measure: the flock's scale (1 small heaps … 2.6 a deck of great low ones), how thick and
   * dark its flock and its rolls are (0 … 1), how ragged (0 … 1), its cirrus in broad feathers (1) or thin tails (0)
   */
  scale?: number;
  thick?: number;
  ragged?: number;
  feather?: number;
}

/** a place's clouds (PlaceSky), by its own dice: seed and place */
function skyOf(sc: Scene, seed: number, k: number, w: number, t: number, dry: number): PlaceSky {
  let n = 0;
  const r = (): number => ((hash2(k, 0x5c7 + n++ * 131, seed) >>> 8) & 0xffff) / 65536;
  const m = sc.macro;
  const maybe = (p: number, lo: number, hi: number): number => (r() < p ? lo + (hi - lo) * r() : 0);
  // (G1, as the user had it: every kind of cloud, each country its own. A place's sky is ONE theme — a sky of mares'
  // tails, a flock of altocumulus in bands, a ripple of cirrocumulus, a veil with the sun's halo, billows, a field of
  // fair-weather heaps, the tropics' towers, or nothing at all — and at most a trace of a second kind beside it: it was
  // every layer by its own dice, three or four patterns one over another on the same sky.)
  const mountain = m.relief > 700;
  const coast = m.water === 'coast';
  const tropic = t > 19 && w > 0.6;
  const cold = t < 4;
  // (C1: a deck — stratocumulus, great low heaps over most of the sky with the blue in its breaks; the billows oftener)
  type Theme = 'clear' | 'tails' | 'flock' | 'deck' | 'ripples' | 'veil' | 'billows' | 'heaps' | 'towers';
  // (G8: over a salt pan's mirror, a sky worth doubling — a flock to the horizon, billows, heaps, tails; never an empty one)
  const mirror = sc.look.landform.id === 'salt_flat';
  const odds: readonly (readonly [Theme, number])[] = mirror
    ? [['flock', 0.34], ['heaps', 0.2], ['billows', 0.18], ['tails', 0.16], ['deck', 0.12]]
    : dry > 0.5
      ? [['clear', 0.38], ['tails', 0.32], ['ripples', 0.1], ['flock', 0.06], ['billows', 0.06], ['heaps', 0.08]]
      : tropic
        ? [['towers', 0.46], ['heaps', 0.22], ['flock', 0.1], ['tails', 0.14], ['billows', 0.08]]
        : cold
          ? [['veil', 0.26], ['tails', 0.22], ['clear', 0.14], ['deck', 0.14], ['flock', 0.08], ['ripples', 0.08], ['billows', 0.08]]
          : coast
            ? [['deck', 0.2], ['flock', 0.16], ['heaps', 0.24], ['tails', 0.14], ['billows', 0.12], ['clear', 0.08], ['ripples', 0.06]]
            : mountain
              ? [['tails', 0.24], ['clear', 0.18], ['heaps', 0.24], ['flock', 0.12], ['ripples', 0.1], ['billows', 0.12]]
              : [['heaps', 0.36], ['tails', 0.18], ['flock', 0.13], ['deck', 0.08], ['clear', 0.07], ['ripples', 0.07], ['billows', 0.11]];
  let pick = r();
  let theme: Theme = odds[0][0];
  for (const [th, p] of odds) {
    theme = th;
    if (pick < p) break;
    pick -= p;
  }
  let cirrus = 0;
  let cirrocumulus = 0;
  let altocumulus = 0;
  let veil = 0;
  let waves = 0;
  // (C1: the heaps are the heaps' sky's and the towers' — a sky of another kind has none of them in it; they were in
  // every sky, the same white heaps under whatever else it held)
  let cumulus = 0.75 + 0.5 * r();
  let towers = 0;
  let scale = 0.8 + 0.5 * r();
  let thick = 0.35 + 0.4 * r();
  const ragged = r();
  let feather = 0;
  if (theme === 'clear') {
    cumulus = r() < 0.3 ? 0.22 : 0;
    cirrus = maybe(0.3, 0.2, 0.4);
  } else if (theme === 'tails') {
    cirrus = 0.6 + 0.4 * r();
    feather = r() < 0.45 ? 1 : 0;
    cumulus = 0;
  } else if (theme === 'flock') {
    altocumulus = 0.6 + 0.4 * r();
    cumulus = 0;
    cirrus = maybe(0.25, 0.3, 0.5);
  } else if (theme === 'deck') {
    altocumulus = 0.7 + 0.3 * r();
    scale = 2.1 + 0.7 * r();
    thick = 0.7 + 0.3 * r();
    cumulus = 0;
  } else if (theme === 'ripples') {
    cirrocumulus = 0.6 + 0.35 * r();
    cirrus = maybe(0.5, 0.35, 0.6);
    feather = r() < 0.3 ? 1 : 0;
    cumulus = 0;
  } else if (theme === 'veil') {
    veil = 0.3 + 0.3 * r();
    cirrus = maybe(0.4, 0.3, 0.55);
    cumulus = 0;
  } else if (theme === 'billows') {
    // (rank on rank of thick rolls to the horizon)
    waves = 0.8 + 0.2 * r();
    thick = 0.6 + 0.4 * r();
    cumulus = 0;
  } else if (theme === 'heaps') {
    cumulus *= 1.3;
    cirrus = maybe(0.2, 0.25, 0.45);
  } else {
    // the wet tropics' afternoon: towering heaps, their anvils' cirrus blown off them
    towers = 0.5 + 0.5 * r();
    cumulus *= 1.25;
    cirrus = 0.4 + 0.3 * r();
  }
  // (the dry country's heaps few and high based whatever its theme)
  if (dry > 0.4) cumulus *= 1 - 0.7 * dry;
  const waveDir = r() * Math.PI;
  const waveSpacing = 900 + 1300 * r();
  const ribbon = r() < 0.12 ? 1 : 0;
  // (wind over a range: lenses stand over its peaks, in a sky that is not a sheet already)
  const lens = mountain && theme !== 'flock' && theme !== 'veil' ? maybe(0.5, 0.55, 1) : 0;
  const nlc = m.tSea < 7 && m.month >= 5 && m.month <= 8 ? 0.55 + 0.45 * r() : 0;
  const base = 900 + 1700 * dry + Math.min(2600, Math.max(0, m.base) * 0.75) + 500 * r();
  return { cirrus, cirrocumulus, altocumulus, veil, waves, waveDir, waveSpacing, ribbon, lens, cumulus, towers, base, nlc, scale, thick, ragged, feather };
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
/** a share made nearly none or nearly all: a meadow is green or it is gold */
const sharp = (t: number): number => {
  const k = clamp((t - 0.22) / 0.5, 0, 1);
  return k * k * (3 - 2 * k);
};

/**
 * (G2) The four tones of a crown from its key, in linear light — Painted Valley's ladder (its key (0.10, 0.36, 0.12):
 * 0.014 0.10 0.10 in its depths, 0.035 0.20 0.12, the key, 0.30 0.56 0.15 where the sun is full on it) taken channel by
 * channel: the shade loses its red first and keeps its blue (a leaf mass's shade is sky), the light gains red; a warm
 * key's — an autumn wood's — shade goes to a deep red-brown and not to a blue. render/paint.ts rtLadder is the same
 * numbers: a plant with a colour of its own and one painted in its region's woods stand side by side in one ladder.
 */
export function crownLadder(key: readonly [number, number, number]): [number, number, number][] {
  const g = clamp(((key[1] - key[0]) / Math.max(key[1], 1e-3)) * 2, 0, 1);
  const by = (warm: readonly number[], green: readonly number[]): [number, number, number] => [0, 1, 2].map((i) => key[i] * (warm[i] + (green[i] - warm[i]) * g)) as [number, number, number];
  const f0 = by([0.3, 0.24, 0.45], [0.14, 0.28, 0.83]);
  const f1 = by([0.55, 0.5, 0.7], [0.35, 0.556, 1]);
  // (a shade is a deep teal at its bluest, never a blue: a spruce's key is half blue already)
  f0[2] = Math.min(f0[2], f0[1] * 1.02);
  f1[2] = Math.min(f1[2], f1[1] * 0.72);
  return [f0, f1, [key[0], key[1], key[2]], by([1.6, 1.5, 1.2], [3, 1.56, 1.25])];
}
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
  // (V4: the evergreen and the needle woods lit as Painted Valley lights its trees — a deep green still, but its sunny
  // side a green and not a shadow; they were the darkest and greyest of the keys, a laurel wood a gloom from the road)
  // (G2: measured against Painted Valley's own — its crown's key L0.65 C0.12 h146, its meadow's L0.70 C0.15 h138: the
  // greens fresh and a little blue of yellow, the dry country's leaves a silver green and its grass a wheat gold, never
  // the khaki between the two)
  deepgreen: [lch(0.615, 0.118, 146), lch(0.685, 0.14, 139)],
  green: [lch(0.635, 0.12, 144), lch(0.705, 0.15, 137)],
  fresh: [lch(0.665, 0.125, 139), lch(0.725, 0.152, 133)],
  teal: [lch(0.585, 0.09, 163), lch(0.665, 0.11, 146)],
  olive: [lch(0.625, 0.075, 132), lch(0.72, 0.105, 118)],
  grey: [lch(0.65, 0.045, 140), lch(0.74, 0.07, 108)],
  gold: [lch(0.615, 0.085, 134), lch(0.79, 0.115, 88)],
  autumn: [lch(0.57, 0.09, 142), lch(0.72, 0.105, 84)],
  blossom: [lch(0.655, 0.122, 141), lch(0.725, 0.15, 134)],
  brown: [lch(0.58, 0.07, 118), lch(0.7, 0.085, 84)],
  white: [lch(0.46, 0.04, 182), lch(0.8, 0.025, 95)],
  purple: [lch(0.58, 0.075, 134), lch(0.64, 0.08, 112)],
  none: [lch(0.62, 0.06, 128), lch(0.75, 0.07, 88)],
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
  let straw = lch(0.8, 0.105, 88);
  // (G2: a place's plants keep close to its key — a birch a shade paler than the oaks, a spruce a shade deeper, and no
  // more: a wood is one colour in four tones, as Painted Valley's, not a dozen colours side by side)
  let spread: [number, number, number] = [0.3, 0.35, 0.3];
  let cap = 0.145;
  let bloom = 1;
  let cast: [number, number] = [0, 0];
  const autumn = veg === 'autumn' && !snow ? 1 : 0;
  // (an autumn red where the winters are hard and the country continental, gold by a milder sea; the tundra's rust)
  const autumnHue = e.struct === 'tundra' ? 42 : m.cont > 0.55 ? 40 : 84;

  // the dry country: its leaves hard and grey-green, its grass straw; the drier, the more
  const dry = clamp((0.36 - w) / 0.3, 0, 1);
  if (dry > 0 && !snow) {
    leaf.C *= 1 - 0.4 * dry;
    leaf.h = toward(leaf.h, 128, 0.55 * dry);
    leaf.L += 0.03 * dry;
    // (green or gold: the mix between the two is a khaki no meadow is)
    grass = mixLch(grass, lch(0.8, 0.1, 88), sharp(0.9 * dry));
    straw = mixLch(straw, lch(0.82, 0.085, 84), dry);
    cap = 0.145 - 0.06 * dry;
    cast = [0.004 * dry, 0.014 * dry];
  }
  // a dry month in a wet year: the monsoon's winter, the Mediterranean's summer — the grass gone gold, the woods dusty
  const season = monthRain(m);
  let parched = dry;
  if (season < 0.55 && !snow) {
    const d = clamp((0.55 - season) / 0.45, 0, 1);
    parched = Math.max(parched, 0.75 * d);
    grass = mixLch(grass, straw, sharp(0.8 * d));
    leaf.C *= 1 - 0.14 * d;
    leaf.h = toward(leaf.h, 128, 0.25 * d);
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
  const turn = -side * (2 + 5 * mh) * (snow || autumn ? 0.5 : 1);
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
  const air = airOf(sc, w, t, dry, snow, mh, side);
  air.sky = skyOf(sc, seed, k, w, t, dry);
  // (G7: its light, its ground's colour in it — snow lying, its rock's ground and its grass as its structure has them)
  const grassy = snow ? 0.15 : rk.fertile < 0.03 ? 0.04 : (GRASSY[e.struct] ?? 0.5);
  const groundHex = snow ? 0xe6edf5 : hexOf(mixLch(soil, grass, grassy), cast);
  air.light = lightOf(sc, w, t, dry, snow, autumn, groundHex);
  return { leaf, woods, grass, straw, soil, spread, cap, bloom, cast, autumn, autumnHue, snow, parched, air };
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
    haze *= 1.42;
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
export function swatches(p: PlacePalette): { leaf: number[]; grass: number[]; straw: number; soil: number; woods: number } {
  const tone = (c: Lch, dL: number, kC = 1, dh = 0): number => hexOf({ L: c.L + dL, C: c.C * kC, h: c.h + dh }, p.cast);
  // (G2: a green meadow's shade is deeper and bluer, its light yellower — Painted Valley's 0.57 / 0.70 / 0.77 of lightness
  // and 147° / 138° / 131°; a gold one's shade is a deeper gold)
  const green = clamp((p.grass.h - 95) / 25, 0, 1);
  return {
    woods: tone(p.woods, 0),
    leaf: [tone(p.woods, -0.05), tone(p.woods, 0), tone(p.woods, 0.05, 0.95), tone(p.woods, 0.1, 0.85), tone(p.woods, -0.11, 0.95)],
    grass: [tone(p.grass, -0.07 - 0.065 * green, 0.95 - 0.15 * green, 9 * green), tone(p.grass, 0), tone(p.grass, 0.05 + 0.02 * green, 0.92, -7 * green)],
    straw: tone(p.straw, 0),
    soil: tone(p.soil, 0),
  };
}
