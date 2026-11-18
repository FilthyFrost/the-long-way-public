/**
 * The regions' palettes, whose plants a region grows, and the woodland field.
 *
 * PALETTES is the render side's table of the regions: one row to a region, colours authored in sRGB hex. A
 * region the painted look has an entry of its own for (specs/art/style.json `biomes`: the first six) is drawn
 * from that entry; any other region's row is turned into such an entry over its kin's (render/style.ts
 * regionStyle), so a row here is all the look a new region needs. A region without a row is drawn as its kin.
 *
 * Nothing on the render side falls back to the plains for a region it does not know: it falls back to the
 * region's kin (core/world/biomes.ts: plains, desert or alpine) — `floraOf` for the plants and the woods.
 *
 * (PAL and groundColor are the palette of the first renderer, in linear working space; nothing draws with them
 * now, and they keep to the same rule.)
 */
import * as THREE from 'three';
import { fbm2 } from '../../core/math/noise';
import { smoothstep } from '../../core/math/util';
import { BIOMES, regionRow, type BiomeDef } from '../../core/world/biomes';
import type { TerrainPoint } from '../../core/world/terrain';
import type { BiomeStyle } from '../render/style';

export interface BiomePalette {
  /** three ground tones that mix into broad painted patches */
  ground: [number, number, number];
  /** dusty verge near the road, and the bare earth that shows in patches where the region is dry */
  dust: number;
  rock: number;
  rock2: number;
  /** tint of woodland floor and distant woods */
  forest: number;
  /** tree crown tints (instance colours) */
  crowns: number[];
  trunk: number;
  /** the three colours of its meadow flowers (absent: its kin's) */
  flowers?: [number, number, number];
  /**
   * What else of the painted look sets it apart from its kin (render/style.ts BiomeStyle): how dry it is, how
   * much grass grows and how tall, how many flowers, how steep the ground is where bare rock begins
   */
  look?: Partial<Pick<BiomeStyle, 'grassDensity' | 'dryness' | 'rockStart' | 'strata' | 'grassGrow' | 'grassLush' | 'grassSize' | 'flowerAmount' | 'crownVariety'>>;
}

export const PALETTES: Record<string, BiomePalette> = {
  plains: {
    ground: [0x8ebe69, 0xaccd74, 0x79ad67],
    dust: 0xbcb07e,
    rock: 0x9c968a,
    rock2: 0x86817a,
    forest: 0x5c9160,
    crowns: [0x6aa860, 0x7db866, 0x5c9a5e, 0x8cc070, 0xa3c66a],
    trunk: 0x7a5b43,
  },
  desert: {
    ground: [0xe3c18e, 0xdaad7d, 0xeed4a6],
    dust: 0xdac197,
    rock: 0xc9825c,
    rock2: 0xb16a4d,
    forest: 0xa2a66e,
    crowns: [0x8fa56a, 0x7d9a63, 0xa5ae72],
    trunk: 0x8a6a4c,
  },
  alpine: {
    ground: [0xeef3f8, 0xe1eaf3, 0xf8fafc],
    dust: 0xd3dae1,
    rock: 0x808894,
    rock2: 0x6c7381,
    forest: 0x9fb8bd,
    crowns: [0x3f6f5e, 0x4a7c66, 0x376354, 0x55866c],
    trunk: 0x5c4a3e,
  },
  forest: {
    ground: [0x5f9a56, 0x77a85c, 0x4f8a52],
    dust: 0x9c8f66,
    rock: 0x8a8a7c,
    rock2: 0x74766c,
    forest: 0x3f7a50,
    crowns: [0x4f9454, 0x5fa25a, 0x437f4c, 0x6fae60],
    trunk: 0x5e4a38,
  },
  lakes: {
    ground: [0x93c272, 0xa9cf7e, 0x7fb26e],
    dust: 0xc7bd8e,
    rock: 0xa6a294,
    rock2: 0x8e8c84,
    forest: 0x62966a,
    crowns: [0x72ae66, 0x84bc6c, 0x629e62, 0x92c476],
    trunk: 0x7a5f47,
  },
  maple: {
    ground: [0xb9b060, 0xcdb968, 0xa09a56],
    dust: 0xc2a070,
    rock: 0x9a8f80,
    rock2: 0x847a70,
    forest: 0xb5653a,
    crowns: [0xc9503c, 0xe0892f, 0xa63c34, 0xe9b03c, 0xd96a2c],
    trunk: 0x5a4034,
  },
  // ---- the first regions added to the registry (docs/V3/nodes/W1-worldgen.md step W1.3, docs/V3/CATALOG.md):
  // each a row over its kin, chosen against specs/art/STYLE.md. Their trees and bushes are their kin's until
  // the flora field of the next node places plants by region.
  flower_fields: {
    // a bright meadow, paler and yellower than the plains (a spring green, not a louder one), with drifts of
    // lavender, rape and sunflower yellow
    ground: [0xa2c576, 0xc4d690, 0x88b66e],
    dust: 0xc9bb86,
    rock: 0xa39c8e,
    rock2: 0x8b867d,
    forest: 0x5f9662,
    crowns: [0x72b062, 0x86c06a, 0x62a05e, 0x96c874, 0xaece6e],
    trunk: 0x7a5b43,
    flowers: [0xa78fe0, 0xf3da3c, 0xf5a92e],
    look: { flowerAmount: 1.45, grassGrow: 0.95, dryness: 0.08 },
  },
  terraces: {
    // paddy greens, and the dark wet earth of the banks between them
    ground: [0x86b85e, 0x9cc768, 0x6fa457],
    dust: 0x7a6248,
    rock: 0x8f897c,
    rock2: 0x77736a,
    forest: 0x4f8a58,
    crowns: [0x5e9e58, 0x70ae5e, 0x508f54, 0x80b866],
    trunk: 0x6a5140,
    look: { dryness: 0.34, flowerAmount: 0.35, grassSize: 0.9 },
  },
  wetland: {
    // muted reed greens over peat: an olive, greyer and browner than the lake country, the grass tall
    ground: [0x8ea469, 0xaab779, 0x739164],
    dust: 0x776553,
    rock: 0x8e8c80,
    rock2: 0x76766e,
    forest: 0x587e5c,
    crowns: [0x6a9a60, 0x7aa866, 0x5c8a5a, 0x88b06e],
    trunk: 0x6e5a48,
    look: { dryness: 0.3, grassSize: 1.3, grassLush: 1.0, flowerAmount: 0.3 },
  },
  bamboo_sea: {
    // fresh yellow-greens in the light, under a deep green wood
    ground: [0x6fae5c, 0x86be62, 0x5c9c56],
    dust: 0xa39a6c,
    rock: 0x8c8c7e,
    rock2: 0x75776d,
    forest: 0x4f9a4c,
    crowns: [0x7fbf55, 0x93cc5e, 0x6aae4e],
    trunk: 0x7d8a4a,
    look: { flowerAmount: 0.3, grassGrow: 0.7 },
  },
  red_canyon: {
    // orange-red rock in layers over pale sand, sage scrub
    ground: [0xd9905f, 0xcf7f52, 0xe2a877],
    dust: 0xe0b98c,
    rock: 0xb85a3c,
    rock2: 0x9c4630,
    forest: 0x93a07a,
    crowns: [0x8e9f74, 0x7d9068, 0xa0ad84],
    trunk: 0x8a6a4c,
  },
  karst_peaks: {
    // jade greens (cooler than the plains: more blue in them) under towers of grey-blue limestone
    ground: [0x76b380, 0x92c693, 0x5fa074],
    dust: 0xb3ad86,
    rock: 0x8a909c,
    rock2: 0x747985,
    forest: 0x4c8c62,
    crowns: [0x5fa46c, 0x70b276, 0x4f9464, 0x82bd7e],
    trunk: 0x6a5545,
  },
};

/** the ids the plants and the woods have rules of their own for (`woodland` below, worldBuild.ts buildScatter and its canopy) */
const FLORA_IDS: readonly string[] = ['plains', 'desert', 'alpine', 'forest', 'lakes', 'maple'];
const floraIds: string[] = [];
const floraFor: string[] = [];

/**
 * Whose plants and woods a region has, as an id: its own where the rules know it, else its kin's. (A region
 * added since the first six grows its kin's plants until the flora field of the next node places plants by
 * region.) Kept by registry index, and looked up again when another region stands at that index (tests put
 * regions in and take them out).
 */
export function floraOf(biome: number): string {
  const b = BIOMES[biome] ?? BIOMES[0];
  if (floraFor[biome] !== b.id) {
    floraFor[biome] = b.id;
    floraIds[biome] = FLORA_IDS.includes(b.id) ? b.id : b.kin;
  }
  return floraIds[biome];
}

/** a region's row of the table: its own, else none (render/style.ts then draws it as its kin) */
export function paletteOf(region: BiomeDef): BiomePalette | undefined {
  return Object.prototype.hasOwnProperty.call(PALETTES, region.id) ? PALETTES[region.id] : undefined;
}

interface LinearPalette {
  ground: THREE.Color[];
  dust: THREE.Color;
  rock: THREE.Color;
  rock2: THREE.Color;
  forest: THREE.Color;
  crowns: THREE.Color[];
  trunk: THREE.Color;
}

export const PAL: LinearPalette[] = BIOMES.map((b) => {
  const p = regionRow(PALETTES, b);
  return {
    ground: p.ground.map((c) => new THREE.Color(c)),
    dust: new THREE.Color(p.dust),
    rock: new THREE.Color(p.rock),
    rock2: new THREE.Color(p.rock2),
    forest: new THREE.Color(p.forest),
    crowns: p.crowns.map((c) => new THREE.Color(c)),
    trunk: new THREE.Color(p.trunk),
  };
});

/** How wooded the land is at (x, z), 0…1. Shared by ground tint and tree placement. */
export function woodland(biome: number, seed: number, x: number, z: number, ad: number, relief: number, withBelt = true): number {
  const id = floraOf(biome);
  if (ad < 11) return 0;
  const edge = smoothstep(14, 40, ad + 14 * fbm2(x / 90, z / 90, seed + 509, 2));
  // a forest belt along the valley sides, beyond where single trees are modelled (STYLE.md §5):
  // from the road it reads as the dark band of woods across the distance
  const belt = withBelt ? smoothstep(450, 750, ad) : 0;
  if (id === 'plains') {
    const n = fbm2(x / 380, z / 380, seed + 501, 3);
    return smoothstep(0.08 - 0.3 * belt, 0.36 - 0.24 * belt, n) * edge;
  }
  if (id === 'alpine') {
    const n = fbm2(x / 300, z / 300, seed + 502, 3);
    // conifers thin out towards the tree line
    return smoothstep(-0.2 - 0.25 * belt, 0.2 - 0.15 * belt, n) * edge * (1 - smoothstep(110, 210, relief));
  }
  if (id === 'forest') {
    // wood nearly everywhere and right up to the road; a glade now and then
    const n = fbm2(x / 420, z / 420, seed + 504, 2);
    return smoothstep(-0.62, -0.3, n) * smoothstep(8, 24, ad + 8 * fbm2(x / 60, z / 60, seed + 510, 2));
  }
  if (id === 'lakes') {
    // open country: copses and shelter belts, the rest meadow down to the water
    const n = fbm2(x / 380, z / 380, seed + 505, 3);
    return smoothstep(0.16 - 0.3 * belt, 0.44 - 0.24 * belt, n) * edge;
  }
  if (id === 'maple') {
    // the hills are wooded more often than not
    const n = fbm2(x / 340, z / 340, seed + 506, 3);
    return smoothstep(-0.06 - 0.3 * belt, 0.22 - 0.24 * belt, n) * edge;
  }
  const n = fbm2(x / 210, z / 210, seed + 503, 2);
  return smoothstep(0.32, 0.5, n) * 0.25 * edge;
}

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

function biomeGround(bi: number, seed: number, t: TerrainPoint, x: number, z: number, ny: number, ad: number, out: THREE.Color): void {
  const p = PAL[bi];
  // (snow country and dry country by kin: a region is steep and rocky, or layered, as its kin is)
  const id = BIOMES[bi].kin;
  const n1 = fbm2(x / 97, z / 97, seed + 601, 2);
  const n2 = fbm2(x / 31, z / 31, seed + 602, 1);
  out.copy(p.ground[0]).lerp(p.ground[1], smoothstep(-0.25, 0.3, n1));
  out.lerp(p.ground[2], smoothstep(0.1, 0.5, n2) * 0.6);
  const wood = woodland(bi, seed, x, z, ad, t.relief);
  if (wood > 0) out.lerp(p.forest, wood * (id === 'alpine' ? 0.35 : 0.5));
  // rock on steep ground
  const steep = 1 - ny;
  let rockAmt = smoothstep(id === 'alpine' ? 0.16 : 0.26, id === 'alpine' ? 0.34 : 0.48, steep);
  if (id === 'desert') {
    // mesa walls and tops show layered rock
    rockAmt = Math.max(rockAmt, smoothstep(26, 60, t.relief) * 0.85);
    const band = t.relief / 17 + n2 * 0.25;
    const f = band - Math.floor(band);
    tmpB.copy(p.rock).lerp(p.rock2, smoothstep(0.42, 0.5, f) - smoothstep(0.92, 1.0, f));
  } else {
    tmpB.copy(p.rock).lerp(p.rock2, smoothstep(-0.2, 0.3, n2));
  }
  if (rockAmt > 0) out.lerp(tmpB, rockAmt);
  // dusty verge
  const dusty = (1 - smoothstep(5, 17, ad)) * 0.65;
  if (dusty > 0) out.lerp(p.dust, dusty);
}

/** Ground albedo (linear) for a shaped terrain point. */
export function groundColor(seed: number, t: TerrainPoint, x: number, z: number, ny: number, out: THREE.Color): void {
  const ad = t.d < 0 ? -t.d : t.d;
  biomeGround(t.ba, seed, t, x, z, ny, ad, out);
  if (t.bt > 0) {
    biomeGround(t.bb, seed, t, x, z, ny, ad, tmpA);
    out.lerp(tmpA, t.bt);
  }
}
