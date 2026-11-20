/**
 * A region of the emergent Earth (world version 4, docs/V3/nodes/E1-earth-world.md): one of the director's places
 * (core/earth/director.ts Scene) made into a region the world can draw — what its road is like by the lie of its
 * land, how high it lies and how high its country rises about it, its walls where it is a mountain valley, its
 * water and its sea, where its woods end and its snow begins by the physics of core/earth/climate.ts, its warmth
 * by day and by night in its month, and its colours by its rock and its plants (biomes.ts EarthLook).
 *
 * What is not yet the place's own is borrowed from the region written by hand it looks most like (`templateOf`):
 * its landforms and anchored forms (the karst's towers, the canyon country's buttes), its plants and its ground
 * plants (E3 and E4 grow the Earth's own), the reference its ground profile was drawn from.
 *
 * Its noise is its place's own (`noise`), not its index: the index is wherever the registry stood when the journey
 * reached it, and the world must be the same whoever made it first.
 */
import { BIOME_INDEX, BIOMES, type EarthLook, type RegionDef, type RegionRelief, type RegionWater } from '../biomes';
import { Surface } from '../ground';
import type { LandKind } from '../landform';
import { LAPSE, growingAt, swingOf, warmthAt, wetnessAt, type Macro } from '../../earth/climate';
import type { Scene } from '../../earth/director';
import type { Efg, Struct, VegHue } from '../../earth/efg';
import { rock } from '../../earth/rocks';

/** the id of the region of a world's place k */
export function earthRegionId(seed: number, k: number): string {
  return `earth:${seed | 0}:${k}`;
}

/** the land's own noise of place k (in place of a registry index: biomes.ts RegionDef.noise) */
export function earthNoise(k: number): number {
  return 4096 + k;
}

const DRY_BELOW = 0.3;

/**
 * The region written by hand a place looks most like, by what it is (its landform's silhouette, its ecosystem,
 * its water): whose landforms, anchored forms, plants and ground plants it borrows until its own are made.
 */
export function templateOf(sc: Scene): string {
  const look = sc.look;
  const e = look.efg;
  const m = sc.macro;
  const sil = look.landform.silhouette;
  const w = wetnessAt(m, m.base);
  const g = growingAt(m, m.base);
  if (sil === 'towers') return 'karst_peaks';
  if (sil === 'tables' || sil === 'canyon' || (w < DRY_BELOW + 0.1 && (sil === 'cliffs' || look.landform.process === 'weathering' || look.landform.process === 'tectonic'))) return 'red_canyon';
  if (e.code === 'T7.1r' || look.water?.code === 'F3.3') return 'terraces';
  if (e.code === 'T7.1f' || e.code === 'T7.1l') return 'flower_fields';
  if (e.struct === 'wetland' || m.water === 'wetland') return 'wetland';
  if (e.trees[0] === 'bamboo' && e.cover > 0.5) return 'bamboo_sea';
  if (look.sig.snow || e.struct === 'ice' || e.struct === 'tundra' || g < 6.4 || (m.context === 'mountain' && g < 10)) return 'alpine';
  if (w < DRY_BELOW || e.struct === 'desert') return 'desert';
  if (m.water === 'lake' || m.water === 'coast' || m.water === 'salt') return 'lakes';
  if (e.struct === 'closed_forest' || e.struct === 'open_forest') return e.code === 'T2.2' && m.month >= 9 && m.month <= 11 ? 'maple' : 'forest';
  return 'plains';
}

/** the region written by hand whose road a place's road is like, by the lie of its land */
function roadTemplateOf(m: Macro): string {
  switch (m.context) {
    case 'mountain':
      return 'alpine';
    case 'valley':
      return 'bamboo_sea';
    case 'hills':
      return 'maple';
    case 'coast':
      return 'lakes';
    case 'plateau':
    case 'basin':
      return wetnessAt(m, m.base) < DRY_BELOW ? 'desert' : 'plains';
    default:
      return wetnessAt(m, m.base) < DRY_BELOW ? 'desert' : 'plains';
  }
}

/** the kinds of country its road runs through, stretch by stretch (routeProfiles.ts routeSetting), by the lie of its land */
export function settingsOf(sc: Scene): readonly LandKind[] {
  const m = sc.macro;
  if (sc.look.landform.silhouette === 'canyon') return ['canyon', 'ridge', 'open', 'canyon'];
  switch (m.context) {
    case 'mountain':
      return ['valley', 'hillside', 'ridge', 'hillside'];
    case 'valley':
      return ['valley', 'valley', 'hillside', 'open'];
    case 'hills':
      return ['hillside', 'ridge', 'open', 'valley'];
    case 'coast':
      return ['open', 'hillside', 'ridge'];
    case 'plateau':
      return ['open', 'ridge', 'open', 'open'];
    default:
      return ['open', 'open', 'ridge', 'hillside'];
  }
}

const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);

/** the warmth of a month at a height (°C): the year's mean and the swing, warmest in July */
export function monthWarmth(m: Macro, h: number, month: number): number {
  return warmthAt(m, h) + swingOf(m) * Math.cos((2 * Math.PI * (month - 7)) / 12);
}

/**
 * The height (m above the sea) where snow lies in a place's month: where the month's mean is below a degree of
 * frost, and never above where the growing season is (the snow that stays all year)
 */
export function snowLineOf(m: Macro, month: number): number {
  const h = (monthWarmth(m, 0, month) + 1) / LAPSE;
  const perennial = (growingAt(m, 0) + 1.5) / LAPSE;
  return Math.max(0, Math.min(h, perennial));
}

/** the height where the woods end: where the growing season's warmth falls to 6.4 °C (core/earth/climate.ts growingAt) */
export function treeLineOf(m: Macro): number {
  return Math.max(0, (growingAt(m, 0) - 6.4) / LAPSE);
}

/** the country's relief about the road (biomes.ts RegionRelief), from how high it rises and the lie of its land */
export function reliefOf(sc: Scene, template: RegionDef): RegionRelief {
  const m = sc.macro;
  const R = Math.max(5, m.relief);
  const base = Math.round(m.base);
  const snow = Math.round(snowLineOf(m, m.month));
  const trees = Math.round(treeLineOf(m));
  const far = template.relief?.far ?? 0;
  switch (m.context) {
    case 'mountain':
    case 'valley': {
      const mountain = R >= 450;
      const walls = mountain ? { height: [Math.round(0.55 * R), Math.round(R)] as const, floor: m.context === 'valley' ? 260 : 170, steep: [0.36, 0.6] as const, crest: Math.round(clamp(1.8 * R, 1400, 3200)) } : undefined;
      return { base, snow, trees, hills: { amp: mountain ? 24 : Math.round(clamp(0.3 * R, 15, 110)), len: 620 }, far, ranges: { amp: Math.round(Math.max(900, 1.6 * R)), from: 3500, full: 16000 }, ...(walls ? { walls, odds: { valley: 0.45, hillside: 0.4, ridge: 0.1, open: 0.05 } } : {}) };
    }
    case 'hills': {
      // (hills as high as the country rises, their crests further apart the higher they stand)
      const amp = Math.round(clamp(0.55 * R, 12, 320));
      return { base, snow, trees, hills: { amp, len: Math.round(clamp(5 * amp, 600, 2200)) }, far, ranges: { amp: Math.round(Math.max(300, 2.5 * R)), from: 2500, full: 10000 } };
    }
    case 'plateau':
      return { base, snow, trees, hills: { amp: Math.round(clamp(0.35 * R, 5, 150)), len: 1100 }, far, ranges: { amp: Math.round(Math.max(400, 2.2 * R)), from: 3000, full: 12000 } };
    case 'basin':
      return { base, snow, trees, hills: { amp: Math.round(clamp(0.2 * R, 3, 60)), len: 900 }, far, ranges: { amp: Math.round(Math.max(450, 2.6 * R)), from: 3000, full: 12000 } };
    case 'coast':
      return { base, snow, trees, hills: { amp: Math.round(clamp(0.4 * R, 5, 160)), len: 900 }, far, ranges: { amp: Math.round(Math.max(300, 2 * R)), from: 2500, full: 9500 } };
    default:
      return { base, snow, trees, hills: { amp: Math.round(clamp(0.25 * R, 3, 60)), len: 850 }, far, ranges: { amp: Math.round(Math.max(300, 3 * R)), from: 2500, full: 10000 } };
  }
}

/** how often a stretch of it holds a lake or a river, whether they freeze, how clear they run (water.ts RegionWater) */
export function waterOfPlace(sc: Scene): RegionWater {
  const m = sc.macro;
  const frozen = monthWarmth(m, m.base, m.month) < -2 ? 1 : 0;
  const w = wetnessAt(m, m.base);
  switch (m.water) {
    case 'lake':
      return { lake: 0.66, river: 0.1, frozen, clear: 6 };
    case 'river':
      return { lake: 0.08, river: 0.7, frozen, clear: 7 };
    case 'wetland':
      return { lake: 0.78, river: 0.12, frozen, clear: 3.5 };
    case 'salt':
      return { lake: 0.55, river: 0, frozen: 0, clear: 3 };
    case 'oasis':
      return { lake: 0.35, river: 0, frozen: 0, clear: 5 };
    case 'coast':
      return { lake: 0.06, river: 0.12, frozen, clear: 6 };
    default:
      return { lake: clamp(0.04 + 0.2 * w, 0.03, 0.2), river: clamp(0.3 * w - 0.02, 0, 0.22), frozen, clear: 6.5 };
  }
}

// ---- its colours

/** the hue of its plants, painted (the crowns' and the grass's): a few tones a hue */
const VEG: Readonly<Record<VegHue, readonly [number, number, number]>> = {
  deepgreen: [0x2f6a3e, 0x3f7f48, 0x56935a],
  green: [0x5c9a50, 0x74ae5c, 0x8cc070],
  fresh: [0x86bd5a, 0x9fcd68, 0xb4d878],
  teal: [0x3f7a6a, 0x4f8c74, 0x63a080],
  olive: [0x7f8f4c, 0x93a05a, 0xa8b06a],
  grey: [0x8d9a80, 0xa2ac92, 0xb6bea6],
  gold: [0xc4a456, 0xd6b866, 0xe4c97a],
  autumn: [0xc6602e, 0xdc8a3a, 0xe8b04e],
  blossom: [0xe8a8bc, 0xf2c2d0, 0xf8dbe2],
  brown: [0x8a6a4a, 0x9c7c58, 0xae8e68],
  white: [0xdfe6ea, 0xeef2f4, 0xf8fafb],
  purple: [0x8a6aa8, 0x9e80bc, 0xb498cc],
  none: [0xbcb090, 0xccc0a0, 0xdcd0b0],
};

/** how much of its ground is under grass or the like, by its structure (the rest is its rock's ground) */
const GRASSY: Readonly<Record<Struct, number>> = { closed_forest: 0.85, open_forest: 0.8, woodland: 0.75, savanna: 0.75, shrubland: 0.5, grassland: 1, farmland: 1, wetland: 1, tundra: 0.7, desert: 0.08, bare: 0.08, ice: 0, water: 0.5 };

/** the colours of its flowers, by their forms */
const FLOWER_HUE: Readonly<Record<string, number>> = { flower_daisy: 0xf6f2e6, flower_cup: 0xe2503a, flower_spike: 0x8f6cd0, flower_umbel: 0xf4efe0, flower_bell: 0x7f8fd8, flower_tube: 0xd8483a, flower_cluster: 0xe89ab0, crop_sunflower: 0xf2c84b, crop_tulip: 0xe0443c, crop_rape: 0xf2d84b, crop_lavender: 0x8a6ec8 };

function mix(a: number, b: number, t: number): number {
  const k = clamp(t, 0, 1);
  const r = Math.round(((a >> 16) & 255) * (1 - k) + ((b >> 16) & 255) * k);
  const g = Math.round(((a >> 8) & 255) * (1 - k) + ((b >> 8) & 255) * k);
  const bl = Math.round((a & 255) * (1 - k) + (b & 255) * k);
  return (r << 16) | (g << 8) | bl;
}

/** the veg hue of a place's plants in its month (a deciduous wood's gold in autumn, the orchards' blossom in spring) */
function vegOf(sc: Scene): VegHue {
  return sc.look.sig.veg === 'none' ? (sc.look.efg.veg === 'none' ? 'none' : sc.look.efg.veg) : sc.look.sig.veg;
}

/** how a place is painted (biomes.ts EarthLook) */
export function lookOfPlace(sc: Scene): EarthLook {
  const m = sc.macro;
  const e: Efg = sc.look.efg;
  const rk = rock(m.rock);
  const snow = sc.look.sig.snow;
  const veg = VEG[snow ? 'white' : vegOf(sc)];
  const grassy = snow ? 0.15 : GRASSY[e.struct];
  const g = rk.ground;
  const ground: [number, number, number] = [mix(g, veg[0], grassy), mix(g, veg[1], grassy), mix(g, veg[2], grassy)];
  const crownsHue = VEG[e.struct === 'ice' ? 'grey' : vegOf(sc) === 'white' ? 'teal' : vegOf(sc)];
  const crowns = [crownsHue[0], crownsHue[1], crownsHue[2], mix(crownsHue[1], 0xffffff, 0.12), mix(crownsHue[0], 0x203020, 0.15)];
  const pale = e.trees.some((t) => t === 'broadleaf_leader' || t === 'eucalypt');
  const fl = (e.flowers ?? []).map((f) => FLOWER_HUE[f]).filter((x): x is number => x !== undefined);
  const herbs = e.herbs.map((f) => FLOWER_HUE[f]).filter((x): x is number => x !== undefined);
  const hues = [...herbs, ...fl, 0xf6f2e6, 0xf2c84b, 0x9a7fd0];
  const w = wetnessAt(m, m.base);
  return {
    ground,
    dust: mix(g, 0xffffff, 0.12),
    rock: rk.lit,
    rock2: rk.shade,
    forest: mix(crownsHue[0], 0x1c2a1c, 0.25),
    crowns,
    trunk: pale ? 0xd8d0c0 : 0x6e5a44,
    flowers: [hues[0], hues[1], hues[2]],
    dryness: clamp((0.5 - w) / 0.4, 0, 1),
    grass: grassy,
    grassSize: e.struct === 'savanna' ? 1.3 : e.struct === 'tundra' ? 0.5 : e.struct === 'farmland' ? 1.1 : 1,
    flowerAmount: clamp((e.flowers?.length ?? 0) * 0.08 + (e.code.startsWith('T7.1') ? 0.2 : 0), 0, 0.6),
    rockStart: e.struct === 'bare' || e.struct === 'desert' ? 0.45 : e.struct === 'tundra' ? 0.6 : 0.85,
    snow: snow ? 1 : 0,
    strata: m.rock === 'sandstone_red' || m.rock === 'sandstone_pale' || m.rock === 'shale' ? 1 : m.rock === 'limestone' || m.rock === 'dolomite' ? 0.5 : 0,
    crownVariety: sc.look.sig.veg === 'autumn' ? 1 : 0,
    month: m.month,
  };
}

/** its surface where it is not road: what the wheels find off it */
function groundOf(sc: Scene): number {
  const e = sc.look.efg;
  const r = rock(sc.macro.rock);
  if (sc.look.sig.snow || e.struct === 'ice') return Surface.Snow;
  if ((e.struct === 'desert' || e.struct === 'bare') && r.loose) return Surface.Sand;
  if (e.struct === 'desert' || e.struct === 'bare') return Surface.Dirt;
  return Surface.Grass;
}

/**
 * Place k of a world's journey as a region: its road the road of the region written by hand whose lie of the
 * land is its own, its landforms and plants its look's template's (`templateOf`), its height, relief, water,
 * sea, lines of woods and snow, warmth and colours its own.
 */
export function regionOfPlace(sc: Scene, seed: number, k: number): RegionDef {
  const template = BIOMES[BIOME_INDEX[templateOf(sc)] ?? 0];
  const road = BIOMES[BIOME_INDEX[roadTemplateOf(sc.macro)] ?? 0];
  const m = sc.macro;
  const t = monthWarmth(m, m.base, m.month);
  const w = wetnessAt(m, m.base);
  const range = 6 + 8 * clamp(1 - w, 0, 1);
  const g = growingAt(m, m.base);
  const kin: RegionDef['kin'] = sc.look.sig.snow || g < 6.4 ? 'alpine' : w < DRY_BELOW ? 'desert' : 'plains';
  const relief = reliefOf(sc, template);
  return {
    ...template,
    // (its road, as the lie of its land asks)
    designKmh: road.designKmh,
    straightMin: road.straightMin,
    straightMax: road.straightMax,
    straightChance: road.straightChance,
    turnMin: road.turnMin,
    turnMax: road.turnMax,
    radiusSpread: road.radiusSpread,
    gradeAmp: road.gradeAmp,
    // (steep enough for the director's climbs and descents: the road follows its country's height, rules.ts RULES_V4)
    gradeMax: Math.max(road.gradeMax, 0.075),
    gradeLen: road.gradeLen,
    id: earthRegionId(seed, k),
    label: sc.name,
    kin,
    baseElev: relief.base,
    ground: groundOf(sc),
    tempDay: Math.round(t + range / 2),
    tempNight: Math.round(t - range / 2),
    intensity: 'scenic',
    climate: kin === 'alpine' ? 'cold' : kin === 'desert' ? 'dry' : warmthAt(m, m.base) > 20 ? 'warm' : 'temperate',
    sea: m.water === 'coast' || m.context === 'coast',
    surreal: false,
    weight: 1,
    water: waterOfPlace(sc),
    relief,
    noise: earthNoise(k),
    earth: lookOfPlace(sc),
  };
}
