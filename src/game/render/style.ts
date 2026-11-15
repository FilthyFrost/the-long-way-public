/**
 * The art spec (specs/art/style.json) as typed data, plus the light of the hour interpolated
 * from its keys. Renderer code reads colours from here, never from literals scattered around.
 */
import * as THREE from 'three';
import styleJson from '../../../specs/art/style.json';
import { BIOMES } from '../../core/world/biomes';

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

/** biome styles in the order of BIOMES (index = biome id used everywhere else) */
export const BIOME_STYLES: BiomeStyle[] = BIOMES.map((b) => STYLE.biomes[b.id] ?? STYLE.biomes.plains);

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
 * Lay the palettes out for a traveller in chapter `chapter`: the chapter behind, this one and the
 * two ahead each get their own slot.
 */
export function showChapters(biomeOf: (c: number) => number, chapter: number): void {
  for (let c = Math.max(0, chapter - 1); c <= chapter + 2; c++) setSlotBiome(c & 3, biomeOf(c));
}

// until a world says otherwise (the proving ground, tests): the first biome in every slot
for (let sl = 0; sl < SLOTS; sl++) setSlotBiome(sl, 0);

/** number of palette slots the shaders are written for */
export const BIOME_COUNT = SLOTS;
