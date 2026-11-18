/**
 * The art spec (specs/art/style.json) as typed data, plus the light of the hour interpolated
 * from its keys. Renderer code reads colours from here, never from literals scattered around.
 *
 * A region's painted look (`BiomeStyle`) is its own entry of the spec where it has one (the first six
 * regions); otherwise it is made from the region's row of the palette table (scene/palette.ts) over the look
 * of its kin, and without a row it is its kin's look (`regionStyle`). Never the plains' for want of an entry.
 */
import * as THREE from 'three';
import styleJson from '../../../specs/art/style.json';
import { BIOMES, type BiomeDef } from '../../core/world/biomes';
import { PALETTES, paletteOf, type BiomePalette } from '../scene/palette';

type RGB = [number, number, number];

export interface LightKey {
  elev: number;
  sun: RGB;
  amb: RGB;
  bounce: RGB;
  zenith: RGB;
  mid: RGB;
  horizon: RGB;
  glow: RGB;
  fog: RGB;
  fogSun: RGB;
  haze: number;
  cloudLit: RGB;
  cloudMid: RGB;
  cloudShade: RGB;
  cloudUnder: RGB;
  exposure: number;
}

export interface BiomeStyle {
  ground: { deep: RGB; mid: RGB; lit: RGB };
  dry: RGB;
  patchWarm: RGB;
  patchCool: RGB;
  farLift: RGB;
  forest: [RGB, RGB, RGB, RGB];
  rock: { lit: RGB; shade: RGB };
  flowers: [RGB, RGB, RGB];
  grassDensity: number;
  dryness: number;
  snow: number;
  /** steepness (1 − normal.y) at which bare rock begins */
  rockStart?: number;
  /** 1 = the rock is layered (mesas, canyon walls) */
  strata?: number;
  /** tufts of grass: how many grow (0…1), how lush the weeds on the old road are, how tall */
  grassGrow?: number;
  grassLush?: number;
  grassSize?: number;
  /** meadow flowers: 0 none … 1 drifts of them */
  flowerAmount?: number;
  /** autumn: 1 = the woods are painted red to gold, with a green tree and an all-yellow one among them, the firs staying dark */
  crownVariety?: number;
}

export interface StyleSpec {
  pipeline: {
    msaa: Record<string, number>;
    bloom: { threshold: number; strength: number; levels: number };
    paint: { radius: Record<string, number>; nearDepthM: number; farDepthM: number; skipAlphaBelow: number };
    ink: { color: RGB; strength: number };
    vignette: number;
    curve: { knee: number; shoulder: number };
    saturation: number;
    dither: boolean;
    fov: number;
  };
  lightKeys: LightKey[];
  morning: { horizon: RGB; glow: RGB; fog: RGB };
  biomes: Record<string, BiomeStyle>;
  road: { asphalt: { lit: RGB; mid: RGB; deep: RGB }; patch: RGB; gravel: RGB; paint: RGB; paintWhite: RGB };
  clouds: { cubeSize: Record<string, number>; steps: Record<string, number>; base: number; count: number; puffsPerCloud: number; redrawStripsPerFrame: number; recenterMeters: number };
  grass: { tile: number; cell: number; bladesPerTuft: number; nearTileM: number; keepFar: number; fadeExtra: [number, number]; fadeAll: [number, number]; radius: number };
  acceptance: Record<string, number>;
}

export const STYLE = styleJson as unknown as StyleSpec;

/** an sRGB hex colour as the linear triple the paints are written in */
function linear(hex: number): RGB {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

const luma = (c: RGB): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** the mean of some colours (linear) */
function mean(list: readonly RGB[]): RGB {
  const m: RGB = [0, 0, 0];
  for (const c of list) for (let i = 0; i < 3; i++) m[i] += c[i] / list.length;
  return m;
}

/**
 * A paint of the kin's look carried over to a region: changed, channel by channel, as the region's row
 * differs from its kin's row at the colour the paint answers to. (Held within a factor of four, and within
 * what a paint may be: a row that is far off its kin's cannot blow a paint out.)
 */
function carried(paint: RGB, row: RGB, kinRow: RGB): RGB {
  const out: RGB = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const by = Math.min(4, Math.max(0.25, row[i] / Math.max(kinRow[i], 1e-3)));
    out[i] = Math.round(Math.min(1, paint[i] * by) * 1000) / 1000;
  }
  return out;
}

/**
 * The painted look of a region that has a row of the palette table and no entry of the art spec: its kin's
 * hand-made look with every paint carried over by how the two rows differ. The three ground tones of a row,
 * from dark to light, answer to the shade, middle and light paints of the ground; its dust to the dry earth;
 * its two rocks to the lit and the shaded rock; its forest tint to the two deep paints of the woods and its
 * crowns to the two light ones. What a row does not hold (the warm and cool patches, the lift of the far land)
 * stays the kin's; its flowers and the numbers of its `look` are its own where it gives them. A row equal to
 * its kin's gives the kin's look to the last figure.
 */
export function styleFromPalette(row: BiomePalette, kinRow: BiomePalette, kin: BiomeStyle): BiomeStyle {
  const tones = (p: BiomePalette): RGB[] => p.ground.map(linear).sort((a, b) => luma(a) - luma(b));
  const g = tones(row);
  const kg = tones(kinRow);
  const forest = linear(row.forest);
  const kinForest = linear(kinRow.forest);
  const crowns = row.crowns.map(linear);
  const kinCrowns = kinRow.crowns.map(linear);
  const lightest = (list: readonly RGB[]): RGB => list.reduce((a, b) => (luma(b) > luma(a) ? b : a));
  return {
    ...kin,
    ground: { deep: carried(kin.ground.deep, g[0], kg[0]), mid: carried(kin.ground.mid, g[1], kg[1]), lit: carried(kin.ground.lit, g[2], kg[2]) },
    dry: carried(kin.dry, linear(row.dust), linear(kinRow.dust)),
    forest: [carried(kin.forest[0], forest, kinForest), carried(kin.forest[1], forest, kinForest), carried(kin.forest[2], mean(crowns), mean(kinCrowns)), carried(kin.forest[3], lightest(crowns), lightest(kinCrowns))],
    rock: { lit: carried(kin.rock.lit, linear(row.rock), linear(kinRow.rock)), shade: carried(kin.rock.shade, linear(row.rock2), linear(kinRow.rock2)) },
    flowers: row.flowers ? [linear(row.flowers[0]), linear(row.flowers[1]), linear(row.flowers[2])] : kin.flowers,
    ...row.look,
  };
}

/**
 * The painted look of a region: its own entry of the art spec; else made from its row of the palette table
 * over its kin's look; else its kin's look (a copy: a dial moved on one region does not move its kin's).
 */
export function regionStyle(region: BiomeDef): BiomeStyle {
  if (Object.prototype.hasOwnProperty.call(STYLE.biomes, region.id)) return STYLE.biomes[region.id];
  const kin = STYLE.biomes[region.kin];
  const row = paletteOf(region);
  return row ? styleFromPalette(row, PALETTES[region.kin], kin) : { ...kin };
}

/** biome styles in the order of BIOMES (index = biome id used everywhere else) */
export const BIOME_STYLES: BiomeStyle[] = BIOMES.map(regionStyle);

const COLOR_KEYS = ['sun', 'amb', 'bounce', 'zenith', 'mid', 'horizon', 'glow', 'fog', 'fogSun', 'cloudLit', 'cloudMid', 'cloudShade', 'cloudUnder'] as const;
type ColorKey = (typeof COLOR_KEYS)[number];

export class LightState {
  sun = new THREE.Color();
  amb = new THREE.Color();
  bounce = new THREE.Color();
  zenith = new THREE.Color();
  mid = new THREE.Color();
  horizon = new THREE.Color();
  glow = new THREE.Color();
  fog = new THREE.Color();
  fogSun = new THREE.Color();
  cloudLit = new THREE.Color();
  cloudMid = new THREE.Color();
  cloudShade = new THREE.Color();
  cloudUnder = new THREE.Color();
  haze = 0.00017;
  exposure = 1;
}

/** Light of the hour for a sun elevation in degrees (keys are sorted by elevation). */
export function lightAt(elevDeg: number, morning: boolean, out: LightState): LightState {
  const keys = STYLE.lightKeys;
  let a = keys[0];
  let b = keys[keys.length - 1];
  if (elevDeg <= a.elev) b = a;
  else if (elevDeg >= b.elev) a = b;
  else {
    for (let i = 0; i < keys.length - 1; i++) {
      if (elevDeg >= keys[i].elev && elevDeg <= keys[i + 1].elev) {
        a = keys[i];
        b = keys[i + 1];
        break;
      }
    }
  }
  const t = a === b ? 0 : (elevDeg - a.elev) / (b.elev - a.elev);
  for (const k of COLOR_KEYS) {
    const ca = a[k as ColorKey];
    const cb = b[k as ColorKey];
    out[k].setRGB(ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t);
  }
  out.haze = a.haze + (b.haze - a.haze) * t;
  out.exposure = a.exposure + (b.exposure - a.exposure) * t;
  if (morning) {
    const m = STYLE.morning;
    out.horizon.multiply(new THREE.Color(...m.horizon));
    out.glow.multiply(new THREE.Color(...m.glow));
    out.fog.multiply(new THREE.Color(...m.fog));
  }
  return out;
}

/**
 * Palettes reach the shaders in four slots. A slot belongs to a chapter of the journey (chapter
 * index mod 4): two neighbouring chapters never share one, so any blend between biomes is a blend
 * between two slots, and the shaders need not know how many biomes exist. As the traveller moves
 * on, the slot of the chapter two behind is handed to the chapter two ahead.
 */
export const SLOTS = 4;

const fill = <T>(n: number, f: () => T): T[] => Array.from({ length: n }, f);

/** Per-slot palettes as uniform arrays, indexed [slot * n + i] in GLSL. */
export const paletteUniforms = {
  uGroundPal: { value: fill(SLOTS * 3, () => new THREE.Vector3()) },
  uDryPal: { value: fill(SLOTS, () => new THREE.Vector3()) },
  uWarmPal: { value: fill(SLOTS, () => new THREE.Vector3()) },
  uCoolPal: { value: fill(SLOTS, () => new THREE.Vector3()) },
  uFarLiftPal: { value: fill(SLOTS, () => new THREE.Vector3()) },
  uForestPal: { value: fill(SLOTS * 4, () => new THREE.Vector3()) },
  uRockLitPal: { value: fill(SLOTS, () => new THREE.Vector3()) },
  uRockShadePal: { value: fill(SLOTS, () => new THREE.Vector3()) },
  uFlowerPal: { value: fill(SLOTS * 3, () => new THREE.Vector3()) },
  /** x: snow, y: dryness, z: grass density, w: layered rock (mesas, canyon walls) */
  uBiomeMisc: { value: fill(SLOTS, () => new THREE.Vector4()) },
  /** x: steepness at which bare rock begins, y: autumn (crown variety) */
  uBiomeMisc2: { value: fill(SLOTS, () => new THREE.Vector4()) },
};

const shown = [-1, -1, -1, -1];

/** show biome `biome` (index into BIOMES) in palette slot `slot` */
export function setSlotBiome(slot: number, biome: number): void {
  if (shown[slot] === biome) return;
  shown[slot] = biome;
  const b = BIOME_STYLES[biome] ?? BIOME_STYLES[0];
  const u = paletteUniforms;
  const put = (arr: THREE.Vector3[], i: number, c: RGB): void => {
    arr[i].set(c[0], c[1], c[2]);
  };
  put(u.uGroundPal.value, slot * 3, b.ground.deep);
  put(u.uGroundPal.value, slot * 3 + 1, b.ground.mid);
  put(u.uGroundPal.value, slot * 3 + 2, b.ground.lit);
  put(u.uDryPal.value, slot, b.dry);
  put(u.uWarmPal.value, slot, b.patchWarm);
  put(u.uCoolPal.value, slot, b.patchCool);
  put(u.uFarLiftPal.value, slot, b.farLift);
  for (let i = 0; i < 4; i++) put(u.uForestPal.value, slot * 4 + i, b.forest[i]);
  put(u.uRockLitPal.value, slot, b.rock.lit);
  put(u.uRockShadePal.value, slot, b.rock.shade);
  for (let i = 0; i < 3; i++) put(u.uFlowerPal.value, slot * 3 + i, b.flowers[i]);
  u.uBiomeMisc.value[slot].set(b.snow, b.dryness, b.grassDensity, b.strata ?? 0);
  u.uBiomeMisc2.value[slot].set(b.rockStart ?? 0.3, b.crownVariety ?? 0, 0, 0);
}

/** the slot a chapter's palette lives in */
export function slotOfChapter(c: number): number {
  return c & 3;
}

/**
 * Which chapters have a slot of their own for a traveller at arc length s in chapter `chapter`: the first and
 * the last of a run of consecutive chapters, written into `out`.
 *
 * Four slots hold four chapters in a row, and more than four can lie within the far view (measured on worlds
 * of version 2, whose regions are 7.5 to 10 km long: six within the 20 km of land that is built at three
 * positions in four, seven at some). Land of a chapter outside the run is painted with the palette of the
 * chapter four on or four back that holds its slot. The run is therefore the one that leaves the nearest such
 * land furthest off: the chapter behind, this one and the two ahead — or, in the first part of a chapter, when
 * the chapter two behind is still nearer than the chapter two ahead, the two behind, this one and the one
 * ahead. The slot they share changes hands when both are as far away as they get (about one and a half
 * chapters), where the air has taken most of the colour.
 *
 * @param starts where each chapter begins (m of road), dealt as far as chapter + 3; absent: the run of the
 * chapter behind, this one and the two ahead, whatever the distances
 */
export function chapterRun(chapter: number, s: number, starts: readonly number[] | null, out: { from: number; to: number }): void {
  out.from = Math.max(0, chapter - 1);
  out.to = chapter + 2;
  if (!starts || chapter < 2 || !(s === s) || starts.length <= chapter + 3) return;
  // the nearest land each run leaves out: behind, where the chapter before the run ends; ahead, where the one after it begins
  const oneBehind = Math.min(s - starts[chapter - 1], starts[chapter + 3] - s);
  const twoBehind = Math.min(chapter >= 3 ? s - starts[chapter - 2] : Infinity, starts[chapter + 2] - s);
  if (twoBehind > oneBehind) {
    out.from = chapter - 2;
    out.to = chapter + 1;
  }
}

const run = { from: 0, to: 0 };

/**
 * Lay the palettes out for a traveller in chapter `chapter`: four chapters in a row each get their own slot
 * (`chapterRun` says which four; without `starts`, the chapter behind, this one and the two ahead).
 */
export function showChapters(biomeOf: (c: number) => number, chapter: number, s = NaN, starts: readonly number[] | null = null): void {
  // (the plan deals as far as the run may reach)
  if (starts) biomeOf(chapter + 3);
  chapterRun(chapter, s, starts, run);
  for (let c = run.from; c <= run.to; c++) setSlotBiome(c & 3, biomeOf(c));
}

// until a world says otherwise (the proving ground, tests): the first biome in every slot
for (let sl = 0; sl < SLOTS; sl++) setSlotBiome(sl, 0);

/** number of palette slots the shaders are written for */
export const BIOME_COUNT = SLOTS;
