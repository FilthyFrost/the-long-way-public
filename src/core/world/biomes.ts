/**
 * Biome definitions: how the road behaves and how the land rises around it.
 * Plain data — the renderer adds palettes on top of these ids.
 *
 * A biome is a region of the world, and the regions are a registry: BIOMES, the six there always were
 * and then the list of regions/index.ts, appended to and never reordered. What a region does not say for
 * itself, the tables of the other modules say for it, by its id or else by its kin (`regionRow`).
 */
import type { FeatureRecipe } from './features';
import { Surface } from './ground';
import type { LandKind, LandSize } from './landform';
import type { DuneShape } from './operators';
import { ADDED_REGIONS } from './regions/index';

export interface BiomeDef {
  id: string;
  label: string;
  /**
   * Which of the three first kinds of country it behaves like wherever nothing says otherwise:
   * temperate and green, dry, or cold. Weather, what grows, what lies on a wreck all start from this.
   */
  kin: 'plains' | 'desert' | 'alpine';
  // ---- road style
  /** design speed: sets the tightest curve and the banking */
  designKmh: number;
  straightMin: number;
  straightMax: number;
  /** chance that a curve is followed by a straight rather than another curve */
  straightChance: number;
  /** heading change of one curve (deg) */
  turnMin: number;
  turnMax: number;
  /** curve radii range from the minimum up to this multiple of it */
  radiusSpread: number;
  /** typical and maximum grade (rise per metre) and the length scale of climbs (m) */
  gradeAmp: number;
  gradeMax: number;
  gradeLen: number;
  /** elevation the road drifts back to (m) */
  baseElev: number;
  // ---- land
  /** rolling relief beside the road: amplitude (m) and wavelength (m) */
  nearAmp: number;
  nearLen: number;
  detailAmp: number;
  detailLen: number;
  /** big landforms away from the road */
  farAmp: number;
  farLen: number;
  /** lateral distance where the big landforms start / reach full height (m) */
  farStart: number;
  farEnd: number;
  /**
   * The shape of the big landforms: 0 = rounded hills, 1 = sharp ridges, 2 = flat-topped mesas. Other
   * numbers are for shapes still to come; one the height function does not know is drawn as rounded hills.
   */
  farShape: number;
  /** height (m) of the mountain massifs that stand kilometres back from the road, on the skyline */
  massifAmp: number;
  /** width over which the verge blends from road level into the land (m) */
  vergeBlend: number;
  ditch: number;
  ground: number;
  // ---- climate (used by weather and, later, survival)
  tempDay: number;
  tempNight: number;
}

/**
 * The relief of a region in a world of version 2 (stage L1 of docs/V3/nodes/L-landscape.md; relief.ts and
 * terrain.ts read it). In its place a world of version 1 has the far field, the massifs and the giant peaks of
 * the BiomeDef's numbers, which version 2 keeps only as much as `far` says.
 */
export interface RegionRelief {
  /** the elevation its road drifts back to (m above the sea): in place of `baseElev` */
  base: number;
  /** where snow lies on all but the steepest faces, and where the woods end (m above the sea): by its climate */
  snow: number;
  trees: number;
  /**
   * The hills of the middle distance: how high they stand (m) and how far it is from one to the next (m). They
   * begin beyond the reach of the verge and of the places by the road (relief.ts HILLS_FROM) and are whole a
   * few hundred metres further out, the higher the further (relief.ts hillsFade): big, clean forms, with valleys
   * and saddles the road passes through.
   */
  hills: { amp: number; len: number };
  /** how much of version 1's far field it keeps: 0 none (hill country has its hills instead) … 1 all (the mesas of the dry country, the towers of the karst) */
  far: number;
  /**
   * The ranges beyond, layer behind layer to the horizon: how high they stand at their fullest (m), from how
   * far out they begin to rise and where they are whole (m). The shape of the ranges is the world's own; how
   * high they stand goes with the country, and changes from one region to the next over kilometres
   * (relief.ts LONG_BLEND).
   */
  ranges: { amp: number; from: number; full: number };
  /**
   * Mountain country: walls on either side of a valley floor (relief.ts wallsAt). `height` the lowest and the
   * highest a wall stands above the floor (m); `floor` how far out from the road the floor runs before the
   * walls begin to rise (m); `steep` how steeply a wall climbs on average, height over run, the gentlest and
   * the steepest; `crest` how far out its crest stands at the most (m). Where the country opens on one side (a
   * hillside's low side, a ridge) the wall on that side stands lower and further back: a view over a valley.
   */
  walls?: { height: readonly [number, number]; floor: number; steep: readonly [number, number]; crest: number };
  /** the odds of each kind of country in a world of version 2, in place of `land.odds` or the row of LAND_ODDS (a kind left out never comes) */
  odds?: Partial<Record<LandKind, number>>;
  /** the strength of each kind in a world of version 2, in place of what `land.size` or LAND_SIZE says (those left out stay) */
  size?: Partial<LandSize>;
}

/** how often a stretch of a region holds a lake or a river (0…1), whether its water freezes (0…1), and how far below the road its rivers run (m) */
export interface RegionWater {
  lake: number;
  river: number;
  frozen: number;
  clear: number;
}

/**
 * A region: a biome, and what it may say for itself beyond the road and the land. Every field here is
 * optional; a region that leaves one out is treated as its kin wherever a table is asked (`regionRow`),
 * and as the plainest case wherever a dealer is.
 */
export interface RegionDef extends BiomeDef {
  /** how much a stretch of it asks of the traveller (absent: calm); a dealer paces the journey by it */
  intensity?: 'calm' | 'scenic' | 'highlight';
  /** what its colours, its landforms and its plants are akin to: a dealer keeps neighbours different in at least two of the three */
  family?: { palette: string; land: string; flora: string };
  /** its climate belt: a dealer keeps the dry heat and the hard cold apart */
  climate?: 'temperate' | 'dry' | 'cold' | 'warm';
  /** it lies by the sea: its chapters may have the sea along one side (sea.ts), and a dealer never deals two such in a row */
  sea?: boolean;
  /** it is one of the surreal ones: a dealer deals one among six regions at most */
  surreal?: boolean;
  /** how readily a dealer deals it (absent: 1) */
  weight?: number;
  /**
   * Its landforms (landform.ts).
   *   odds     of each kind of country; a kind left out never comes. Absent: the row LAND_ODDS holds for
   *            its id, else for its kin.
   *   size     the strength of each kind at its fullest; one left out is what LAND_SIZE holds for its id,
   *            else for its kin (and so is the whole of it when absent).
   *   terrace  worlds of version 2 only: its hillsides and valley sides are cut into benches `step` m
   *            apart, as fully as `strength` says (0 … 1; operators.ts).
   *   dune     worlds of version 2 only: its open stretches carry dunes up to `amp` m high, `len` m from
   *            crest to crest.
   */
  land?: {
    odds?: Partial<Record<LandKind, number>>;
    size?: Partial<LandSize>;
    terrace?: { step: number; strength: number };
    dune?: { amp: number; len: number; shape?: DuneShape };
  };
  /** its water (water.ts). Absent: the row for its id, else for its kin. */
  water?: RegionWater;
  /** worlds of version 2 only: what a cluster of its anchored landforms is made of (features.ts) */
  features?: readonly FeatureRecipe[];
  /** worlds of version 2 only: how many stretches of a chapter of it hold such a cluster (the director says which; absent: none) */
  featureSlots?: number;
  /** worlds of version 2 only: its relief (absent: version 1's, from the numbers above) */
  relief?: RegionRelief;
  /**
   * What seeds its land's noise and its weather's in place of its index in the registry (absent: the index, as
   * for every region written by hand). A region of the emergent Earth (world version 4, earth/region.ts) is made
   * as the journey reaches it, and its index is wherever the registry stood then: its noise must be the same
   * whichever world of a session made it first.
   */
  noise?: number;
  /**
   * A region of the emergent Earth (world version 4): the director's place it is, for whoever draws it — its
   * colours (painted, 0xRRGGBB: the ground's three tones, the dust, the rock's lit and shaded faces, the woods,
   * the crowns, the trunks, the flowers) and how its ground looks (render/style.ts BiomeStyle's dials).
   */
  earth?: EarthLook;
}

/** how a region of the emergent Earth is painted (biomes.ts RegionDef.earth; scene/palette.ts reads it) */
export interface EarthLook {
  ground: readonly [number, number, number];
  dust: number;
  rock: number;
  rock2: number;
  forest: number;
  crowns: readonly number[];
  trunk: number;
  flowers: readonly [number, number, number];
  /** 0 … 1: how dry its ground looks, how much grass and how tall, how many flowers; the slope where bare rock begins */
  dryness: number;
  grass: number;
  grassSize: number;
  flowerAmount: number;
  rockStart: number;
  /** 0 … 1: snow on its ground (its month's snow line below the road), its rock in layers (sandstones, shales), its woods in autumn's colours */
  snow: number;
  strata: number;
  crownVariety: number;
  /** its month (1 … 12), as the northern year runs: what season its plants are in */
  month: number;
}

/**
 * The six regions there were before there was a registry: the worlds of version 1 are made of these and no
 * others, in this order. What each says of itself beyond its road and its land (how much it asks of the
 * traveller, its families, its climate, the sea, the desert's dunes) is read by worlds of version 2 only.
 */
const FIRST_SIX: readonly RegionDef[] = [
  {
    id: 'plains',
    label: '草原丘陵',
    kin: 'plains',
    designKmh: 70,
    straightMin: 140,
    straightMax: 650,
    straightChance: 0.55,
    turnMin: 14,
    turnMax: 62,
    radiusSpread: 4.5,
    gradeAmp: 0.045,
    gradeMax: 0.06,
    gradeLen: 900,
    baseElev: 60,
    nearAmp: 6.5,
    nearLen: 230,
    detailAmp: 0.9,
    detailLen: 37,
    farAmp: 190,
    farLen: 1400,
    farStart: 160,
    farEnd: 1300,
    farShape: 0,
    massifAmp: 1500,
    vergeBlend: 24,
    ditch: 0.32,
    ground: Surface.Grass,
    tempDay: 22,
    tempNight: 11,
    intensity: 'calm',
    family: { palette: 'green', land: 'rolling', flora: 'meadow' },
    climate: 'temperate',
    relief: { base: 60, snow: 3000, trees: 2200, hills: { amp: 32, len: 720 }, far: 0, ranges: { amp: 520, from: 2500, full: 9000 }, size: { tilt: 0.07, wall: 30, drop: 20 } },
  },
  {
    id: 'desert',
    label: '荒漠公路',
    kin: 'desert',
    designKmh: 85,
    straightMin: 500,
    straightMax: 2600,
    straightChance: 0.8,
    turnMin: 8,
    turnMax: 38,
    radiusSpread: 5,
    gradeAmp: 0.022,
    gradeMax: 0.04,
    gradeLen: 1600,
    baseElev: 120,
    nearAmp: 2.6,
    nearLen: 310,
    detailAmp: 1.1,
    detailLen: 53,
    farAmp: 130,
    farLen: 950,
    farStart: 260,
    farEnd: 620,
    farShape: 2,
    massifAmp: 900,
    vergeBlend: 30,
    ditch: 0.12,
    ground: Surface.Sand,
    tempDay: 38,
    tempNight: 9,
    intensity: 'calm',
    family: { palette: 'sand', land: 'mesa', flora: 'scrub' },
    climate: 'dry',
    // (version 2: dunes on its open stretches; its odds and strengths stay the rows of landform.ts)
    land: { dune: { amp: 7, len: 95 } },
    relief: { base: 120, snow: 5000, trees: 3600, hills: { amp: 0, len: 900 }, far: 1, ranges: { amp: 750, from: 3000, full: 13000 } },
  },
  {
    id: 'alpine',
    label: '针叶雪山',
    kin: 'alpine',
    designKmh: 45,
    straightMin: 40,
    straightMax: 210,
    straightChance: 0.3,
    turnMin: 22,
    turnMax: 78,
    radiusSpread: 3.2,
    gradeAmp: 0.075,
    gradeMax: 0.08,
    gradeLen: 700,
    baseElev: 420,
    nearAmp: 9,
    nearLen: 170,
    detailAmp: 1.6,
    detailLen: 29,
    farAmp: 520,
    farLen: 2100,
    farStart: 70,
    farEnd: 1500,
    farShape: 1,
    massifAmp: 2200,
    vergeBlend: 18,
    ditch: 0.3,
    ground: Surface.Snow,
    tempDay: -4,
    tempNight: -16,
    intensity: 'scenic',
    family: { palette: 'snow', land: 'mountain', flora: 'conifer' },
    climate: 'cold',
    // (version 2: a valley floor high in the mountains, walls of a thousand metres and more on either side)
    relief: {
      base: 1000,
      snow: 2000,
      trees: 1700,
      hills: { amp: 24, len: 520 },
      far: 0,
      ranges: { amp: 3000, from: 3500, full: 16000 },
      walls: { height: [1000, 1750], floor: 200, steep: [0.42, 0.62], crest: 3000 },
      odds: { valley: 0.4, hillside: 0.42, open: 0.08, ridge: 0.1 },
    },
  },
  // ---- the second round (docs/DESIGN_V2.md 4.1): they come from the fifth chapter on (spine.ts)
  {
    // tall trees close to the road on both sides, the light in patches, the road winding between them
    id: 'forest',
    label: '森林',
    kin: 'plains',
    designKmh: 60,
    straightMin: 80,
    straightMax: 380,
    straightChance: 0.42,
    turnMin: 16,
    turnMax: 70,
    radiusSpread: 4,
    gradeAmp: 0.05,
    gradeMax: 0.065,
    gradeLen: 800,
    baseElev: 140,
    nearAmp: 7.5,
    nearLen: 190,
    detailAmp: 1.1,
    detailLen: 33,
    farAmp: 215,
    farLen: 1550,
    farStart: 110,
    farEnd: 1100,
    farShape: 0,
    massifAmp: 1700,
    vergeBlend: 20,
    ditch: 0.34,
    ground: Surface.Grass,
    tempDay: 17,
    tempNight: 8,
    intensity: 'calm',
    family: { palette: 'deepgreen', land: 'valley', flora: 'broadleaf' },
    climate: 'temperate',
    relief: { base: 140, snow: 3000, trees: 2200, hills: { amp: 100, len: 980 }, far: 0, ranges: { amp: 700, from: 2500, full: 11000 }, size: { tilt: 0.12, wall: 50, drop: 34 } },
  },
  {
    // low, open country full of water: a lake in most stretches, reeds, morning fog
    id: 'lakes',
    label: '湖区',
    kin: 'plains',
    designKmh: 65,
    straightMin: 120,
    straightMax: 520,
    straightChance: 0.5,
    turnMin: 12,
    turnMax: 58,
    radiusSpread: 4.5,
    gradeAmp: 0.03,
    gradeMax: 0.045,
    gradeLen: 1100,
    baseElev: 40,
    nearAmp: 4,
    nearLen: 260,
    detailAmp: 0.7,
    detailLen: 41,
    farAmp: 150,
    farLen: 1600,
    farStart: 220,
    farEnd: 1500,
    farShape: 0,
    massifAmp: 1300,
    vergeBlend: 26,
    ditch: 0.25,
    ground: Surface.Grass,
    tempDay: 19,
    tempNight: 10,
    intensity: 'calm',
    family: { palette: 'green', land: 'lakeland', flora: 'meadow' },
    climate: 'temperate',
    sea: true,
    relief: { base: 40, snow: 3000, trees: 2200, hills: { amp: 42, len: 820 }, far: 0, ranges: { amp: 600, from: 2500, full: 9500 }, size: { tilt: 0.08, wall: 35, drop: 22 } },
  },
  {
    // hill country in its autumn: the road along the slopes, every wood red and gold, leaves in the air
    id: 'maple',
    label: '枫叶丘陵',
    kin: 'plains',
    designKmh: 60,
    straightMin: 100,
    straightMax: 420,
    straightChance: 0.45,
    turnMin: 16,
    turnMax: 66,
    radiusSpread: 4.2,
    gradeAmp: 0.055,
    gradeMax: 0.07,
    gradeLen: 800,
    baseElev: 180,
    nearAmp: 8,
    nearLen: 210,
    detailAmp: 1.0,
    detailLen: 35,
    farAmp: 225,
    farLen: 1650,
    farStart: 130,
    farEnd: 1200,
    farShape: 0,
    massifAmp: 1600,
    vergeBlend: 22,
    ditch: 0.3,
    ground: Surface.Grass,
    tempDay: 14,
    tempNight: 5,
    intensity: 'calm',
    family: { palette: 'autumn', land: 'hills', flora: 'maple' },
    climate: 'temperate',
    relief: { base: 180, snow: 3000, trees: 2200, hills: { amp: 115, len: 900 }, far: 0, ranges: { amp: 750, from: 2500, full: 11000 }, size: { tilt: 0.13, wall: 55, drop: 38 } },
  },
];

/** the three kinds of country the journey begins in; the others join from the fifth chapter on */
export const FIRST_BIOMES = 3;

const REGISTRY: RegionDef[] = [];

/**
 * THE registry of regions: the six above first, in their order, then the list of regions/index.ts.
 *
 * A region's index in this array is its identity. The chapter plan deals indices, a world's region count
 * (rules.ts) counts them, and the index seeds the land's noise (terrain.ts: seed + index · 7919) and the
 * weather's (weather.ts: seed + 17 + index · 3). So the array only ever grows at its end: an entry is
 * never taken out, moved or put in between two others, or every world made before becomes another world.
 */
export const BIOMES: readonly RegionDef[] = REGISTRY;

/** the index of each region in BIOMES, by id (an object without a prototype: only the ids are in it) */
export const BIOME_INDEX: Record<string, number> = Object.create(null) as Record<string, number>;

/**
 * One entry of the registry: every field of a region set, in one order, those the region leaves out as
 * undefined. The height function reads these objects at every point of the land, and the engine reads
 * objects that are all laid out alike faster than objects of several layouts (measured with six regions
 * of six layouts: 0.1 to 0.2 µs more for every far-field call, some 15 %). A field added to RegionDef
 * must be listed here: the type sees to it.
 */
function entry(d: RegionDef): RegionDef {
  const e: { [K in keyof Required<RegionDef>]: RegionDef[K] } = {
    id: d.id,
    label: d.label,
    kin: d.kin,
    designKmh: d.designKmh,
    straightMin: d.straightMin,
    straightMax: d.straightMax,
    straightChance: d.straightChance,
    turnMin: d.turnMin,
    turnMax: d.turnMax,
    radiusSpread: d.radiusSpread,
    gradeAmp: d.gradeAmp,
    gradeMax: d.gradeMax,
    gradeLen: d.gradeLen,
    baseElev: d.baseElev,
    nearAmp: d.nearAmp,
    nearLen: d.nearLen,
    detailAmp: d.detailAmp,
    detailLen: d.detailLen,
    farAmp: d.farAmp,
    farLen: d.farLen,
    farStart: d.farStart,
    farEnd: d.farEnd,
    farShape: d.farShape,
    massifAmp: d.massifAmp,
    vergeBlend: d.vergeBlend,
    ditch: d.ditch,
    ground: d.ground,
    tempDay: d.tempDay,
    tempNight: d.tempNight,
    intensity: d.intensity,
    family: d.family,
    climate: d.climate,
    sea: d.sea,
    surreal: d.surreal,
    weight: d.weight,
    land: d.land,
    water: d.water,
    features: d.features,
    featureSlots: d.featureSlots,
    relief: d.relief,
    noise: d.noise,
    earth: d.earth,
  };
  return e;
}

function append(d: RegionDef): number {
  if (!d.id) throw new Error('a region needs an id');
  if (d.id in BIOME_INDEX) throw new Error(`region '${d.id}' is in the registry already (at ${BIOME_INDEX[d.id]})`);
  BIOME_INDEX[d.id] = REGISTRY.length;
  REGISTRY.push(entry(d));
  return REGISTRY.length - 1;
}

for (const d of FIRST_SIX) append(d);
for (const d of ADDED_REGIONS) append(d);

/**
 * The regions written by hand: the six and the list of regions/index.ts, all there as soon as this file is
 * loaded. Worlds of versions 2 and 3 know these and no more (rules.ts); what comes after them in the registry
 * is the emergent Earth's, made as a world of version 4 reaches it (`earthRegion`).
 */
export const AUTHORED_REGIONS = REGISTRY.length;

/** the index of each region of the emergent Earth made so far, by its id */
const EARTH_INDEX = new Map<string, number>();

/**
 * A region of the emergent Earth (world version 4: earth/region.ts makes it from the director's place): put at
 * the end of the registry the first time its id is asked for, the same index every time after (a world made
 * again from the same seed, the probe world and the game's, finds its regions there). Never taken out.
 */
export function earthRegion(id: string, make: () => RegionDef): number {
  const known = EARTH_INDEX.get(id);
  if (known !== undefined) return known;
  const def = make();
  if (def.id !== id) throw new Error(`earth region '${id}' made as '${def.id}'`);
  const index = append(def);
  EARTH_INDEX.set(id, index);
  return index;
}

/** is the region at this index one of the emergent Earth's (made by `earthRegion`)? */
export function isEarthRegion(index: number): boolean {
  return index >= AUTHORED_REGIONS && index < REGISTRY.length && REGISTRY[index].earth !== undefined;
}

/**
 * How many regions at the head of the registry are written by hand — the game's, and any a test or a tool has
 * put in (`registerRegion`) — up to the first of the emergent Earth's: what a world of versions 2 and 3 may know.
 */
export function handRegions(): number {
  let first = REGISTRY.length;
  for (const i of EARTH_INDEX.values()) if (i < first) first = i;
  return first;
}

/** what seeds a region's noise: its own `noise`, else its index (the regions written by hand) */
export function regionSalt(index: number): number {
  return REGISTRY[index]?.noise ?? index;
}

/**
 * Put one more region at the end of the registry; returns what takes it out again. For tests and tools:
 * the game's regions are the list of regions/index.ts and are there as soon as this file is loaded. A
 * region is taken out only while it is the registry's last (they leave in the reverse of the order they
 * came), and a world made while it was there is not to be used after.
 */
export function registerRegion(def: RegionDef): () => void {
  const index = append(def);
  return () => {
    if (REGISTRY.length !== index + 1 || BIOME_INDEX[def.id] !== index) throw new Error(`region '${def.id}' is not the registry's last: regions are taken out in the reverse of the order they were put in`);
    REGISTRY.pop();
    delete BIOME_INDEX[def.id];
  };
}

/** the region of an id (the first of all for an id the registry does not hold) */
export function regionById(id: string): RegionDef {
  return REGISTRY[BIOME_INDEX[id] ?? 0];
}

/**
 * A region's row of a table kept by region id: the row under its own id, else the row of its kin. (The
 * three kins — plains, desert, alpine — have a row in every such table, so there always is one.)
 */
export function regionRow<T>(table: Readonly<Record<string, T>>, region: BiomeDef): T {
  return table[region.id] ?? table[region.kin];
}

/** tightest curve radius (m) for a design speed, from the usual highway formula R = V² / (127 (e + f)) */
export function minRadius(designKmh: number): number {
  const f = 0.2 - 0.00075 * designKmh;
  return (designKmh * designKmh) / (127 * (0.06 + f));
}

/** absolute floor for any curve; the road-aligned mesh strips rely on it */
export const MIN_RADIUS_ANY = 60;
