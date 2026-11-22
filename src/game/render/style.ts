/**
 * The art spec (specs/art/style.json) as typed data, plus the light of the hour interpolated
 * from its keys. Renderer code reads colours from here, never from literals scattered around.
 *
 * A region's painted look (`BiomeStyle`) is its own entry of the spec where it has one (the first six
 * regions); otherwise it is made from the region's row of the palette table (scene/palette.ts) over the look
 * of its kin, and without a row it is its kin's look (`regionStyle`). Never the plains' for want of an entry.
 */
import { sceneSnowLine } from '../../core/world/routeProfiles';
import { ECO_PROFILES } from '../../core/world/data/ecoProfiles';
import * as THREE from 'three';
import { put3, put4, vec3s, vec4s } from './uniformArrays';
import styleJson from '../../../specs/art/style.json';
import { BIOMES, type BiomeDef } from '../../core/world/biomes';
import { crownLadder } from '../../core/world/earth/palette';
import { floraTableOf } from '../../core/world/floraTables';
import { hueShares } from '../scene/floraCover';
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
    /** contrast about mid grey (1: none; V1) */
    contrast?: number;
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
  if (row && (region as { earth?: unknown }).earth) return earthStyle(row, PALETTES[region.kin], kin);
  return row ? styleFromPalette(row, PALETTES[region.kin], kin) : { ...kin };
}

/**
 * The painted look of a region of the emergent Earth (core/world/earth/region.ts): its own colours as they are —
 * a black lava field's ground is black, a red desert's red, whatever its kin's — where a hand-made region's are its
 * kin's carried over (styleFromPalette, which holds a paint within a factor of four of its kin's and so cannot
 * turn green ground red). What a row does not hold (the warm and cool patches, the far land's lift) stays its
 * kin's, carried over.
 */
export function earthStyle(row: BiomePalette, kinRow: BiomePalette, kin: BiomeStyle): BiomeStyle {
  const tones = row.ground.map(linear).sort((a, b) => luma(a) - luma(b));
  const kt = kinRow.ground.map(linear).sort((a, b) => luma(a) - luma(b));
  const crowns = row.crowns.map(linear);
  const forest = linear(row.forest);
  const lightest = crowns.reduce((a, b) => (luma(b) > luma(a) ? b : a));
  return {
    ...kin,
    ground: { deep: tones[0], mid: tones[1], lit: tones[2] },
    dry: linear(row.dust),
    // (its own patches where its row has them: a multiplier carried by a ground's colour would tint them its colour)
    patchWarm: row.patches ? [...row.patches[0]] as RGB : carried(kin.patchWarm, tones[1], kt[1]),
    patchCool: row.patches ? [...row.patches[1]] as RGB : carried(kin.patchCool, tones[1], kt[1]),
    // (G2: its woods' four tones the ladder of their key, as Painted Valley's are — deep and blue in the shade, a
    // yellow green in the sun; they were four tones a hair apart, and a wood was one flat olive)
    forest: row.woods !== undefined ? (crownLadder(linear(row.woods)).map((c) => c.map((x) => Math.round(Math.min(1, x) * 1000) / 1000)) as [RGB, RGB, RGB, RGB]) : [forest, forest, mean(crowns), lightest],
    rock: { lit: linear(row.rock), shade: linear(row.rock2) },
    flowers: row.flowers ? [linear(row.flowers[0]), linear(row.flowers[1]), linear(row.flowers[2])] : kin.flowers,
    ...row.look,
  };
}

/** biome styles in the order of BIOMES (index = biome id used everywhere else): read them through `styleOf` */
export const BIOME_STYLES: BiomeStyle[] = BIOMES.map(regionStyle);
const styleIds: string[] = BIOMES.map((b) => b.id);

/**
 * The painted look of the region at a registry index: made the first time it is asked for — the regions of the
 * emergent Earth are put in the registry as a world of version 4 reaches them — and again when another region
 * stands at that index (tests put regions in and take them out)
 */
export function styleOf(biome: number): BiomeStyle {
  const b = BIOMES[biome] ?? BIOMES[0];
  if (styleIds[biome] !== b.id || BIOME_STYLES[biome] === undefined) {
    BIOME_STYLES[biome] = regionStyle(b);
    styleIds[biome] = b.id;
  }
  return BIOME_STYLES[biome];
}

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
  // (held flat: render/uniformArrays.ts)
  uSnowLines: { value: vec4s(SLOTS) },
  uGroundPal: { value: vec3s(SLOTS * 3) },
  uDryPal: { value: vec3s(SLOTS) },
  uWarmPal: { value: vec3s(SLOTS) },
  uCoolPal: { value: vec3s(SLOTS) },
  uFarLiftPal: { value: vec3s(SLOTS) },
  uForestPal: { value: vec3s(SLOTS * 4) },
  uRockLitPal: { value: vec3s(SLOTS) },
  uRockShadePal: { value: vec3s(SLOTS) },
  uFlowerPal: { value: vec3s(SLOTS * 3) },
  /** x: snow, y: dryness, z: grass density, w: layered rock (mesas, canyon walls) */
  uBiomeMisc: { value: vec4s(SLOTS) },
  /**
   * x: steepness at which bare rock begins, y: autumn (crown variety), z: how fully the region's slopes are
   * terraced (0: it has no terraces), w: that times the height between two benches (m) — so that the step
   * comes out whole where a terraced region blends into one without
   */
  uBiomeMisc2: { value: vec4s(SLOTS) },
};

/** how many flower colours a slot's row of the cover texture holds, and the texels of a row */
export const COVER_HUES = 5;
const COVER_ROW = 8;
const coverData = new Float32Array(COVER_ROW * SLOTS * 4);

/**
 * The ground cover of the regions in the slots, for the ground's paint in a world of version 2 (the flora
 * tables' cover: core/world/floraTables.ts; render/terrainMaterials.ts reads it under RT_COVER).
 */
export const coverUniforms = {
  /**
   * One row to a palette slot: texels 0 … 4 the colours of its region's flowers (linear; the last repeated),
   * 5 the colour its rows run together into far off (their colours by how often each falls to a row), 6 its
   * rows (metres from row to row — 0: it grows none —, the row's share of that, how many colours, flowers 0 … 1)
   */
  tCover: { value: null as THREE.DataTexture | null },
  /**
   * per slot: x how wet the region's open ground is (0 … 1: a marsh), y how reedy its shores (0 … 1), z its snow
   * line and w its tree line, in metres above the sea (core/world/biomes.ts RegionRelief; a region without: far
   * above any land)
   */
  uCoverMisc: { value: vec4s(SLOTS) },
  /** the world's seed: the rows' colours are dealt by it (scene/floraCover.ts rowHue01) */
  uCoverSeed: { value: 0 },
};

function coverTexture(): THREE.DataTexture {
  let t = coverUniforms.tCover.value;
  if (!t) {
    t = new THREE.DataTexture(coverData, COVER_ROW, SLOTS, THREE.RGBAFormat, THREE.FloatType);
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.NoColorSpace;
    coverUniforms.tCover.value = t;
  }
  return t;
}

// Existing region palettes have analogue profiles; new profile-named regions use their own rocks.
const mountainProfiles: Record<string, string> = {
  alpine: 'rocky-pass', plains: 'sierra-valley', forest: 'appalachian', lakes: 'sierra-high',
  desert: 'sonoran', red_canyon: 'redrock', karst_peaks: 'karst-river', terraces: 'hani-paddy',
};

/** a slot's row of a cover texture's data and its numbers, from its region's flora table */
function fillCover(coverData: Float32Array, misc: Float32Array, slot: number, biome: number): void {
  const region = BIOMES[biome] ?? BIOMES[0];
  const table = floraTableOf(region.id, region.kin);
  const c = table.cover;
  const n = Math.min(COVER_HUES, c.hues.length);
  const shares = hueShares(n);
  const o = slot * COVER_ROW * 4;
  coverData.fill(0, o, o + COVER_ROW * 4);
  for (let i = 0; i < COVER_HUES && n > 0; i++) {
    const hue = linear(c.hues[Math.min(i, n - 1)]);
    for (let k = 0; k < 3; k++) {
      coverData[o + i * 4 + k] = hue[k];
      if (i < n) coverData[o + 5 * 4 + k] += hue[k] * shares[i];
    }
  }
  coverData[o + 6 * 4] = c.rows ? c.rows.spacing : 0;
  coverData[o + 6 * 4 + 1] = c.rows ? c.rows.share : 0;
  coverData[o + 6 * 4 + 2] = n;
  // (the far drifts' dusting of flower colour only where there is a meadow to hold them, V5: a lava field's cinder and
  // a desert's gravel were dusted pink in patches, a pattern of blots over the black)
  coverData[o + 6 * 4 + 3] = c.flowers * (1 - (c.bare ?? 0)) * Math.min(1, c.grass / 0.35);
  // (V5: how far its woods hang on its steep rock — a wet karst's towers and cones wooded to their cliffs; the mean
  // hue's spare channel)
  coverData[o + 5 * 4 + 3] = Math.min(1, Math.max(0, ((table.eco.cling ?? 1) - 1) / 1.3));
  // a marsh: a region whose ground is wet where nothing else speaks; reedy shores: where its table stands a
  // reed in every cell of the bank
  // Last texel: weights for massive crystalline rock, karst, stratified rock and lava.
  const profile = ECO_PROFILES.find(p => p.id === (mountainProfiles[region.id] ?? region.id));
  for (const rock of profile?.rocks ?? []) {
    const channel = /花岗岩|片麻岩|深成岩/.test(rock.type) ? 0 : /石灰岩/.test(rock.type) ? 1 :
      /砂岩|泥岩/.test(rock.type) ? 2 : /玄武岩|火山岩/.test(rock.type) ? 3 : -1;
    if (channel >= 0) coverData[o + 28 + channel] += rock.share;
  }
  const wet = Math.min(1, Math.max(0, (table.eco.moist - 0.62) / 0.1));
  let reeds = 0;
  for (const r of table.shrubs) if (r.plant === 'reed') reeds = Math.max(reeds, r.perHa);
  // (the line the ground goes bare above: the emergent Earth's places keep their alpine meadows and tundra above
  // their last trees, up to where the ground's plants end; a region written by hand goes bare at its tree line)
  put4(misc, slot, wet * wet * (3 - 2 * wet), Math.min(1, reeds / 700), region.relief?.snow ?? 1e5, region.relief?.bare ?? region.relief?.trees ?? 1e5);
}

const shown = [-1, -1, -1, -1];

/** the paints of biome `biome` (index into BIOMES) into slot `slot` of a set of palette uniforms */
function fillSlot(u: typeof paletteUniforms, slot: number, biome: number): void {
  const b = styleOf(biome);
  const line = sceneSnowLine(BIOMES[biome]?.id ?? "plains");
  put4(u.uSnowLines.value, slot, line, line, line, line);
  const put = (arr: Float32Array, i: number, c: RGB): void => put3(arr, i, c[0], c[1], c[2]);
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
  put4(u.uBiomeMisc.value, slot, b.snow, b.dryness, b.grassDensity, b.strata ?? 0);
  // (the benches a region's hillsides are cut into are the core's: core/world/biomes.ts RegionDef.land.terrace)
  const benches = BIOMES[biome]?.land?.terrace;
  const cut = benches && benches.step > 0 ? Math.min(1, Math.max(0, benches.strength)) : 0;
  put4(u.uBiomeMisc2.value, slot, b.rockStart ?? 0.3, b.crownVariety ?? 0, cut, cut * (benches?.step ?? 0));
}

/** show biome `biome` (index into BIOMES) in palette slot `slot` */
export function setSlotBiome(slot: number, biome: number): void {
  if (shown[slot] === biome) return;
  shown[slot] = biome;
  fillSlot(paletteUniforms, slot, biome);
  fillCover(coverData, coverUniforms.uCoverMisc.value, slot, biome);
  coverTexture().needsUpdate = true;
}

/** palettes of its own for one piece of land (ownPalettes): the uniforms to give its material in place of the rolling ones, and what to free with it */
export interface OwnPalettes {
  uniforms: Record<string, { value: unknown }>;
  dispose(): void;
}

/**
 * Four palette slots of a piece's own, holding the given regions (by slot) for as long as the piece lives.
 *
 * The rolling slots hold the four chapters nearest the traveller (chapterRun); land of a fifth chapter is
 * painted with the palette of whichever of the four shares its slot. In a world of version 2 six or seven
 * chapters lie within the land that is built, so the far land can be painted as the wrong region. The far
 * land's pieces are few and large (scene/worldView.ts: the leaves of the far ring), and none of them touches
 * more than four chapters: so each is given the palettes of its own four chapters when it is built, and keeps
 * them. Everything nearer lies within the rolling four and uses those.
 */
export function ownPalettes(biomes: readonly number[]): OwnPalettes {
  const u: typeof paletteUniforms = {
    uGroundPal: { value: vec3s(SLOTS * 3) },
    uDryPal: { value: vec3s(SLOTS) },
    uWarmPal: { value: vec3s(SLOTS) },
    uCoolPal: { value: vec3s(SLOTS) },
    uFarLiftPal: { value: vec3s(SLOTS) },
    uForestPal: { value: vec3s(SLOTS * 4) },
    uRockLitPal: { value: vec3s(SLOTS) },
    uRockShadePal: { value: vec3s(SLOTS) },
    uFlowerPal: { value: vec3s(SLOTS * 3) },
    uSnowLines: { value: vec4s(SLOTS) },
    uBiomeMisc: { value: vec4s(SLOTS) },
    uBiomeMisc2: { value: vec4s(SLOTS) },
  };
  const data = new Float32Array(COVER_ROW * SLOTS * 4);
  const misc = vec4s(SLOTS);
  for (let slot = 0; slot < SLOTS; slot++) {
    fillSlot(u, slot, biomes[slot] ?? 0);
    fillCover(data, misc, slot, biomes[slot] ?? 0);
  }
  const tex = new THREE.DataTexture(data, COVER_ROW, SLOTS, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return { uniforms: { ...u, tCover: { value: tex }, uCoverMisc: { value: misc } }, dispose: () => tex.dispose() };
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
