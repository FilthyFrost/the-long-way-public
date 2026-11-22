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
import { LAPSE, growingAt, monthWarmthAt, warmthAt, wetnessAt, type Macro } from '../../earth/climate';
import type { Scene } from '../../earth/director';
import type { Efg, Struct } from '../../earth/efg';
import { rock } from '../../earth/rocks';
import { landOfPlace } from './landform';
import { GRASSY, accentColour, barkColour, paletteOfPlace, patchesOf, stoneColour, swatches } from './palette';
import { ROAD_BUILD, type RoadType } from '../../earth/roads';
import { hash2 } from '../../math/rng';

/** the id of the region of a world's place k (a world of version 5's its own: its places are driven by roads of their own) */
export function earthRegionId(seed: number, k: number, version: 4 | 5 = 4): string {
  return version === 5 ? `earth5:${seed | 0}:${k}` : `earth:${seed | 0}:${k}`;
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

/** the kinds of country its road runs through, stretch by stretch (routeProfiles.ts routeSetting), by the lie of its land — or by its road's kind (world version 5) */
export function settingsOf(sc: Scene, road?: RoadType): readonly LandKind[] {
  if (road) return road.land;
  const m = sc.macro;
  if (sc.look.landform.silhouette === 'canyon') return ['canyon', 'ridge', 'open', 'canyon'];
  // (the ice's valleys: walls on both sides all the way)
  if (sc.look.landform.process === 'glacial' && sc.look.landform.id !== 'drumlins') return ['valley'];
  switch (m.context) {
    case 'mountain':
      return ['valley', 'valley', 'hillside', 'valley'];
    case 'valley':
      return ['valley', 'valley', 'open', 'valley'];
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
  return monthWarmthAt(m, h, month);
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

/**
 * The height where the ground's plants end (m above the sea): where the growing season's warmth falls to 3 °C, the
 * alpine meadow's and the tundra's last cushions some five hundred metres above the last trees
 */
export function bareLineOf(m: Macro): number {
  return Math.max(0, (growingAt(m, 0) - 3) / LAPSE);
}

/** the country's relief about the road (biomes.ts RegionRelief), from how high it rises and the lie of its land */
export function reliefOf(sc: Scene, template: RegionDef): RegionRelief {
  const m = sc.macro;
  const R = Math.max(5, m.relief);
  const base = Math.round(m.base);
  const snow = Math.round(snowLineOf(m, m.month));
  const trees = Math.round(treeLineOf(m));
  // (never below a vegetated place's own slopes: its card is what grows at its road)
  const vegetated = !['bare', 'ice', 'desert'].includes(sc.look.efg.struct);
  const bare = Math.round(Math.max(bareLineOf(m), vegetated ? m.base + 320 : 0));
  const far = template.relief?.far ?? 0;
  switch (m.context) {
    case 'mountain':
    case 'valley': {
      const mountain = R >= 450;
      const walls = mountain ? { height: [Math.round(0.55 * R), Math.round(R)] as const, floor: m.context === 'valley' ? 260 : 170, steep: [0.36, 0.6] as const, crest: Math.round(clamp(1.8 * R, 1400, 3200)) } : undefined;
      return { base, snow, trees, bare, hills: { amp: mountain ? 24 : Math.round(clamp(0.3 * R, 15, 110)), len: 620 }, far, ranges: { amp: Math.round(Math.max(900, 1.6 * R)), from: 3500, full: 16000 }, ...(walls ? { walls, odds: { valley: 0.45, hillside: 0.4, ridge: 0.1, open: 0.05 } } : {}) };
    }
    case 'hills': {
      // (hills as high as the country rises, their crests further apart the higher they stand)
      const amp = Math.round(clamp(0.55 * R, 12, 320));
      return { base, snow, trees, bare, hills: { amp, len: Math.round(clamp(5 * amp, 600, 2200)) }, far, ranges: { amp: Math.round(Math.max(300, 2.5 * R)), from: 2500, full: 10000 } };
    }
    case 'plateau':
      return { base, snow, trees, bare, hills: { amp: Math.round(clamp(0.35 * R, 5, 150)), len: 1100 }, far, ranges: { amp: Math.round(Math.max(400, 2.2 * R)), from: 3000, full: 12000 } };
    case 'basin':
      return { base, snow, trees, bare, hills: { amp: Math.round(clamp(0.2 * R, 3, 60)), len: 900 }, far, ranges: { amp: Math.round(Math.max(450, 2.6 * R)), from: 3000, full: 12000 } };
    case 'coast':
      return { base, snow, trees, bare, hills: { amp: Math.round(clamp(0.4 * R, 5, 160)), len: 900 }, far, ranges: { amp: Math.round(Math.max(300, 2 * R)), from: 2500, full: 9500 } };
    default:
      return { base, snow, trees, bare, hills: { amp: Math.round(clamp(0.25 * R, 3, 60)), len: 850 }, far, ranges: { amp: Math.round(Math.max(300, 3 * R)), from: 2500, full: 10000 } };
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


/** the colours of its flowers, by their forms */
const FLOWER_HUE: Readonly<Record<string, number>> = { flower_daisy: 0xf6f2e6, flower_cup: 0xe2503a, flower_spike: 0x8f6cd0, flower_umbel: 0xf4efe0, flower_bell: 0x7f8fd8, flower_tube: 0xd8483a, flower_cluster: 0xe89ab0, crop_sunflower: 0xf2c84b, crop_tulip: 0xe0443c, crop_rape: 0xf2d84b, crop_lavender: 0x8a6ec8 };

function mix(a: number, b: number, t: number): number {
  const k = clamp(t, 0, 1);
  const r = Math.round(((a >> 16) & 255) * (1 - k) + ((b >> 16) & 255) * k);
  const g = Math.round(((a >> 8) & 255) * (1 - k) + ((b >> 8) & 255) * k);
  const bl = Math.round((a & 255) * (1 - k) + (b & 255) * k);
  return (r << 16) | (g << 8) | bl;
}

/**
 * The colours of a place's tree crowns: five tones of the key of its woods (world/earth/palette.ts), by the traits
 * its climate gives its leaves — an autumn wood red where the winters are hard and the country continental, gold
 * by a milder sea; the dry country's hard leaves grey and glaucous; the wet tropics' deep and glossy; the cold's
 * dark and blue; under snow an ink green.
 */
export function crownsOf(sc: Scene, seed = 0, k = sc.index): number[] {
  return swatches(paletteOfPlace(sc, seed, k)).leaf;
}

/** how a place is painted (biomes.ts EarthLook): every colour of it out of its palette */
export function lookOfPlace(sc: Scene, seed = 0, k = sc.index): EarthLook {
  const m = sc.macro;
  const e: Efg = sc.look.efg;
  const rk = rock(m.rock);
  const snow = sc.look.sig.snow;
  const pal = paletteOfPlace(sc, seed, k);
  const sw = swatches(pal);
  // (on the salt itself — a pan, a crust — the white shows through everything)
  const grassy = snow ? 0.15 : rk.fertile < 0.03 ? 0.04 : GRASSY[e.struct];
  // (snow lying: its ground white, the rock showing a little through it)
  const g0 = snow ? mix(sw.soil, 0xf2f5f7, 0.8) : sw.soil;
  const ground: [number, number, number] = [mix(g0, sw.grass[0], grassy), mix(g0, sw.grass[1], grassy), mix(g0, sw.grass[2], grassy)];
  const crowns = sw.leaf;
  const pale = e.trees.some((t) => t === 'broadleaf_leader' || t === 'eucalypt');
  const fl = (e.flowers ?? []).map((f) => FLOWER_HUE[f]).filter((x): x is number => x !== undefined);
  const herbs = e.herbs.map((f) => FLOWER_HUE[f]).filter((x): x is number => x !== undefined);
  const hues = [...herbs, ...fl, 0xf6f2e6, 0xf2c84b, 0x9a7fd0].map((c) => accentColour(pal, c));
  const w = wetnessAt(m, m.base);
  const layered = m.rock === 'sandstone_red' || m.rock === 'sandstone_pale' || m.rock === 'shale';
  const limey = m.rock === 'limestone' || m.rock === 'dolomite';
  const sil = sc.look.landform.silhouette;
  // (G8: a salt pan — what shows of its land, its causeway's banks and its dry margins, is salt)
  const pan = sc.look.landform.id === 'salt_flat';
  // (a green country's towers, tables and cliffs are green but for their steepest faces — a wet karst's cones are wooded,
  // not banded rock from the foot up: V2)
  const green = e.struct === 'closed_forest' || e.struct === 'open_forest' || e.struct === 'woodland' || e.struct === 'wetland' || e.struct === 'farmland' || (e.struct === 'grassland' && w > 0.5);
  const shows = e.struct === 'desert' || e.struct === 'bare' || (e.struct === 'shrubland' && w < 0.35) || (!green && (sil === 'tables' || sil === 'canyon' || sil === 'cliffs' || sil === 'towers'));
  return {
    ground: pan ? [0xc9c8c4, 0xd6d4ce, 0xe2dfd8] : ground,
    // (the dusty verge and the dry patches, the blades gone to straw: between its ground and its straw)
    dust: pan ? 0xd9d6cf : mix(mix(sw.soil, sw.straw, snow ? 0.2 : 0.55), 0xffffff, 0.06),
    rock: stoneColour(pal, rk.lit),
    rock2: stoneColour(pal, rk.shade),
    forest: mix(crowns[0], 0x1c2a1c, 0.25),
    crowns,
    woods: sw.woods,
    trunk: barkColour(pal, pale ? 0xd8d0c0 : 0x6e5a44),
    flowers: [hues[0], hues[1], hues[2]],
    // (its grass as far gone to straw as its palette's: the meadow by the road and the far hills alike)
    dryness: clamp(Math.max(pal.parched, (0.42 - w) / 0.4), 0, 1),
    grass: pan ? 0 : grassy,
    grassSize: e.struct === 'savanna' ? 1.3 : e.struct === 'tundra' ? 0.5 : e.struct === 'farmland' ? 1.1 : 1,
    flowerAmount: clamp((e.flowers?.length ?? 0) * 0.08 + (e.code.startsWith('T7.1') ? 0.2 : 0), 0, 0.6),
    rockStart: e.struct === 'bare' || e.struct === 'desert' ? 0.45 : e.struct === 'tundra' ? 0.6 : 0.85,
    snow: snow ? 1 : 0,
    // (its rock in layers where its rock shows — the dry and bare country, the tables, canyons, cliffs and towers:
    // the paint lays that rock on all its higher ground, render/terrainMaterials.ts; a green place on sandstone is green)
    strata: shows ? (layered ? 1 : limey ? 0.5 : 0) : 0,
    crownVariety: sc.look.sig.veg === 'autumn' ? 1 : 0,
    month: m.month,
    palette: pal,
    // (a sandy shore, a desert's: the sand all the way up; else a strip of it at the water's edge)
    beach: rk.loose && (m.water === 'coast' || e.struct === 'desert' || e.struct === 'bare') ? 1 : 0.4,
    patches: patchesOf(pal),
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
/**
 * (world version 5) A place's road made of its region: how its road winds and climbs, its kinds of country and how
 * strong each is, as its kind of road asks (core/earth/roads.ts), sized by how high its country rises.
 */
function roadOfPlace(sc: Scene, road: RoadType, relief: RegionRelief, seed: number, k: number): Partial<RegionDef> & { relief: RegionRelief } {
  const R = Math.max(20, sc.macro.relief);
  const a = road.align;
  const g = road.grade;
  // (a place the director climbs or comes down through: steep enough for its climb whatever the road)
  const climbs = sc.move === 'climb' || sc.move === 'descend' || sc.move === 'plateau' || sc.move === 'basin';
  const kinds = [...new Set(road.land)];
  const odds: Partial<Record<LandKind, number>> = { open: 0, hillside: 0, valley: 0, ridge: 0, canyon: 0, shelf: 0, rim: 0 };
  for (const kd of kinds) odds[kd] = 1 / kinds.length;
  const size = {
    ...(relief.size ?? {}),
    tilt: road.id === 'shelf' || road.id === 'switchback' || road.id === 'cliff_coast' || road.id === 'terrace_road' ? 0.5 : relief.size?.tilt ?? clamp(R / 1400, 0.12, 0.34),
    wall: road.id === 'ice_valley' || road.id === 'valley' || road.id === 'gorge' ? clamp(0.55 * R, 90, 700) : relief.size?.wall ?? clamp(0.4 * R, 40, 300),
    drop: road.id === 'skyline' || road.id === 'pass' ? clamp(0.6 * R, 70, 340) : road.id === 'swell' || road.id === 'plateau_road' || road.id === 'lava_road' ? clamp(0.35 * R, 25, 130) : relief.size?.drop ?? clamp(0.3 * R, 25, 160),
    canyon: road.id === 'gorge' ? clamp(0.7 * R, 90, 420) : relief.size?.canyon ?? clamp(0.5 * R, 40, 200),
    shelf: road.id === 'cliff_coast' ? clamp(0.6 * R, 70, 180) : clamp(0.55 * R, 140, 480),
    // (a cliff road's void is the sea: no far wall stands in it)
    opp: road.id === 'cliff_coast' ? 0 : clamp(1.1 * R, 300, 1600),
    rim: clamp(0.8 * R, 140, 520),
    // (a gorge's walls close in and stand near two in one)
    steep: road.id === 'gorge' || road.id === 'tower_road' ? 0.9 : 0,
  };
  // (a shelf's or a rim's own far wall stands across its void: no valley wall of the mountains' is added to it)
  const open = road.land.includes('shelf') || road.land.includes('rim') || !!road.hairpins;
  const out: RegionRelief = { ...relief, odds, size, ...(open ? { walls: undefined } : {}) };
  if (open) delete out.walls;
  // (docs/V3/nodes/R7-wrapup.md: its viaduct over a ravine and its gallery under the rock, where its kind has them and
  // its dice say so; under snow the gallery an avalanche shed, else a gallery with windows or a tunnel through a spur)
  const build = ROAD_BUILD[road.id];
  const dice = (salt: number): number => (hash2(k, salt, seed) & 0xffff) / 65536;
  const viaduct = build.viaduct && dice(0x7a1d) < build.viaduct[1] ? build.viaduct[0] : undefined;
  const gallery = build.gallery && dice(0x6a11) < build.gallery[1] ? build.gallery[0] : undefined;
  const galleryKind = sc.look.sig.snow ? 'shed' : dice(0x6a12) < 0.42 ? 'tunnel' : 'rock';
  return {
    designKmh: a.kmh,
    straightMin: a.straightLen[0],
    straightMax: a.straightLen[1],
    straightChance: a.straight,
    turnMin: a.turn[0],
    turnMax: a.turn[1],
    radiusSpread: a.spread,
    gradeAmp: g.amp,
    gradeLen: g.len,
    gradeMax: climbs ? Math.max(g.max, 0.075) : Math.max(g.max, 0.05),
    relief: out,
    land: { odds, size },
    // (a cliff road: the sea far below it — the sea's level hung that far under the road's lowest along its shore)
    ...(road.id === 'cliff_coast' ? { cliff: size.shelf } : {}),
    // (a switchback climb: its stacks where its kind has them, spine.ts)
    ...(road.hairpins ? { hairpins: road.hairpins } : {}),
    // (its surface and edges, and the lookout its view is given: docs/V3/nodes/R3-structures.md)
    roadStyle: ROAD_BUILD[road.id].style,
    ...(ROAD_BUILD[road.id].lookout !== undefined ? { lookouts: [ROAD_BUILD[road.id].lookout!] } : {}),
    ...(viaduct !== undefined ? { viaducts: [viaduct] } : {}),
    ...(build.stream ? { streams: build.stream } : {}),
    ...(gallery !== undefined ? { galleries: [gallery], gallery: galleryKind } : {}),
    // (a lakeshore road: a lake by it all the way through its heart, now on one side, now on the other)
    ...(road.id === 'lakeshore' && !landOfPlace(sc).dry ? { water: { ...waterOfPlace(sc), lake: 1, river: 0, shore: true } } : {}),
  };
}

export function regionOfPlace(sc: Scene, seed: number, k: number, kind?: RoadType): RegionDef {
  const template = BIOMES[BIOME_INDEX[templateOf(sc)] ?? 0];
  const road = BIOMES[BIOME_INDEX[roadTemplateOf(sc.macro)] ?? 0];
  const m = sc.macro;
  const t = monthWarmth(m, m.base, m.month);
  const w = wetnessAt(m, m.base);
  const range = 6 + 8 * clamp(1 - w, 0, 1);
  const g = growingAt(m, m.base);
  // (its kin, what the tables it has no row of its own in take it for: the cold, the dry — the deserts and semi-deserts, whatever the year's rain — or the green)
  const dryCard = sc.look.efg.group === 'T5' || sc.look.efg.struct === 'desert' || sc.look.efg.code === 'T4.3';
  const kin: RegionDef['kin'] = sc.look.sig.snow || g < 6.4 ? 'alpine' : w < DRY_BELOW || dryCard ? 'desert' : 'plains';
  const own = reliefOf(sc, template);
  // (its landform's own land: its anchored forms, its dunes and benches, its kinds of country, its hills and walls)
  const land = landOfPlace(sc);
  const relief: RegionRelief = {
    ...own,
    ...(land.hills ? { hills: land.hills } : {}),
    ...(land.walls ? { walls: land.walls } : {}),
    ...(land.far !== undefined ? { far: land.far } : {}),
    ranges: land.ranges ? { ...own.ranges, amp: Math.round(own.ranges.amp * land.ranges) } : own.ranges,
    ...(land.odds ? { odds: land.odds } : {}),
    ...(land.size ? { size: land.size } : {}),
  };
  if (land.noWalls) delete relief.walls;
  const mesas = land.farShape === 2;
  const def: RegionDef = {
    ...template,
    // (version 1's far field where its landform keeps it: mesas on the skyline, as high as its country rises)
    farShape: land.farShape ?? template.farShape,
    ...(mesas ? { farAmp: Math.round(clamp(0.5 * m.relief, 80, 260)), farLen: 850, farStart: 300, farEnd: 800 } : {}),
    features: land.features,
    featureSlots: land.features ? land.featureSlots ?? 2 : 0,
    land: { ...(land.odds ? { odds: land.odds } : {}), ...(land.size ? { size: land.size } : {}), ...(land.dune ? { dune: land.dune } : {}), ...(land.terrace ? { terrace: land.terrace } : {}) },
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
    id: earthRegionId(seed, k, kind ? 5 : 4),
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
    water: land.dry ? { lake: 0, river: 0, frozen: 0, clear: 6 } : waterOfPlace(sc),
    ...(land.levelRoad ? { levelRoad: true } : {}),
    relief,
    noise: earthNoise(k),
    earth: lookOfPlace(sc, seed, k),
  };
  if (!kind) return def;
  // (world version 5: its road its kind's)
  const made = roadOfPlace(sc, kind, def.relief!, seed, k);
  return { ...def, ...made, land: { ...def.land, ...made.land } };
}
