/**
 * The world as one pure height function built around the road.
 *
 *   on the road        exact road plane (elevation + banking)
 *   verge (≈ 5–30 m)   blends from road level into the land, with a shallow ditch
 *   land               road base elevation + biome relief; the relief fades in with distance
 *                      from the road, big landforms only appear well away from it
 *
 * Wheels, meshes and object placement all call this, so the road always fits the land and what
 * you see is what you drive on.
 */
import { dcos, dsin } from '../math/detmath';
import { fbm2, ridged2, simplex2 } from '../math/noise';
import { hash2 } from '../math/rng';
import { smoothstep } from '../math/util';
import { roadStyleAt, roadSurface } from './roadStyles';
import { BIOMES, type BiomeDef } from './biomes';
import { featureSlots, runAt } from './director';
import { EcotopeField, shoreOf } from './ecotope';
import { FeaturePlan, MAX_ASPECT, featureProfile, type FeatureRecipe } from './features';
import { FloraVistas } from './floraVista';
import { FloraField } from './flora';
import { floraTableOf } from './floraTables';
import { GroundSample, SURFACES, Surface, type Ground } from './ground';
import { Furniture } from './furniture';
import { LAND_SLOT, LandParams, LandformPlan } from './landform';
import { DUNE_MEAN, dunes, riserFor, terrace } from './operators';
import { rulesFor, type WorldRules } from './rules';
import { SeaEffect, SeaPlan } from './sea';
import { GREAT_FROM, HILLS_FROM, ReliefMix, greatRange, hillsFade, hillField, openness, rangeField, reliefMix, wallAt } from './relief';
import { PAD_FALL, SITE_SLOT, SitePlan } from './sites';
import { BiomeBlend, RoadSpine, SpineSample, type SpineOptions } from './spine';
import { DECK_HALF, KERB_AT, KERB_HEIGHT, WATER_SLOT, WaterEffect, WaterPlan, type River } from './water';

/** half width of the paved surface (m) */
export const ROAD_HALF = 3.25;
/** outer edge of the gravel shoulder (m from the centre line) */
export const ROAD_EDGE = 4.5;
/** beyond this distance from the road the cheaper far-field formula is used */
const NEAR_FIELD = 200;
/** how far the foot of an anchored landform stays from a river's water (m): the gravel bar, the bank, and room to walk between */
const FEATURE_SHORE = 30;
/** how far apart the two points lie between which a terraced stretch measures the land's slope (m) */
const TERRACE_PROBE = 2;
/** how far a bridge deck stands proud of the road at its ends, and the joint over a beam bridge's pier (m) */
export const DECK_PROUD = 0.015;
export const PIER_JOINT_DEPTH = 0.012;
export const PIER_JOINT_HALF = 0.16;

export class TerrainPoint {
  h = 0;
  /** arc length and signed lateral offset (+ = right) of the nearest road point */
  s = 0;
  d = 0;
  roadY = 0;
  bank = 0;
  phi = 0;
  grade = 0;
  /** biome mix: indices and blend factor (0 = all a) */
  ba = 0;
  bb = 0;
  bt = 0;
  /** the chapters those two biomes belong to */
  ca = 0;
  cb = 0;
  /** 0 land, 1 paved road, 2 shoulder, 3 the edge of a bridge deck */
  zone = 0;
  /** height of the land above the road base (m): used for colouring (snow line, rock) */
  relief = 0;
  /**
   * The land to draw. It is `h` everywhere except where the wheels' surface is something laid over
   * the land: under a bridge deck (the river bed) and under the ice of a frozen lake.
   */
  bed = 0;
  /** water level standing over (or lapping beside) this point; −Infinity where there is none */
  wl = -Infinity;
  /** that water: 0 open … 1 frozen; 1 lake, 2 river, 3 the sea */
  frozen = 0;
  wkind = 0;
  /** rivers: metres along the river from its bridge, and across from its centre line */
  wt = 0;
  wlat = 0;
  /** how fully this point lies on a bridge span, 0…1 */
  bridge = 0;
  /** how fully it lies on the levelled ground of a place by the road, 0…1; and what that ground is (0 gravel, 1 concrete) */
  site = 0;
  siteGround = 0;
  /** how fully it lies on a plot of the caller's (WorldOptions.plots: ModCar's farmyard), 0…1 */
  plot = 0;
  /**
   * How much of the land's height here is an anchored landform's (m; features.ts: a tower, a butte): 0
   * where none stands, and everywhere in a world of version 1. For whoever paints the land: the flank of
   * a tower is rock. `relief` does not include it. (Whatever fills a TerrainPoint sets it: the Lands of
   * onfoot/land.ts set it to 0.)
   */
  landform = 0;
  /** a road that ends at its start (WorldOptions.deadEnd): how far behind its start the point lies (m), 0 beside it */
  behind = 0;
}

/**
 * A plot of ground of the caller's (ModCar's workshop and its yard at the road's start): within the box the land
 * takes the plot's own height, outside it blends back into the land over `skirt` metres. Not where the road is.
 */
export interface Plot {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  skirt: number;
  height(x: number, z: number): number;
  /**
   * Where no grass of the world's grows within the box (default: nowhere does — the caller draws its own ground
   * there; ModCar's proving ground: only under what it draws, the grass growing between)
   */
  bare?(x: number, z: number): boolean;
  /**
   * How tall the world's grass grows within the box, as a share of its height (default 1; ModCar's proving ground:
   * mown short), back to its full height over the skirt
   */
  grass?(x: number, z: number): number;
}

/** (the world's version and how many regions it knows are the road's options: SpineOptions.worldVersion, regionCount) */
export interface WorldOptions extends SpineOptions {
  /**
   * The road ends at its start: behind it there is no road bed, no ditch, no poles, and the land closes round
   * the end of the road (ModCar: the road begins at the workshop's gate). Without it the road runs on
   * straight behind its start.
   */
  deadEnd?: boolean;
  plots?: readonly Plot[];
  /**
   * How likely a stretch is to have a place by the road, one stretch, two, three or more after the last one
   * (sites.ts; default 0.2, 0.45, 0.8). ModCar's are higher: Arctic Drive's buildings come every few hundred metres.
   */
  placeOdds?: readonly [number, number, number];
  /**
   * How likely a stretch with a place is to have a second one too, well away from the first (sites.ts; default
   * none). ModCar's: most of them.
   */
  secondPlace?: number;
}

/** how fully (x, z) lies on a plot: 1 within its box, falling off smoothly over its skirt */
export function plotWeight(p: Plot, x: number, z: number): number {
  const dx = x < p.x0 ? p.x0 - x : x > p.x1 ? x - p.x1 : 0;
  const dz = z < p.z0 ? p.z0 - z : z > p.z1 ? z - p.z1 : 0;
  if (dx === 0 && dz === 0) return 1;
  const d = Math.sqrt(dx * dx + dz * dz);
  return d >= p.skirt ? 0 : 1 - smoothstep(0, p.skirt, d);
}

function smax(a: number, b: number, k: number): number {
  const d = k - (a > b ? a - b : b - a);
  if (d <= 0) return a > b ? a : b;
  return (a > b ? a : b) + (d * d * 0.25) / k;
}

/**
 * Mountains with a designed shape on a grid of cells of size C: 0…1.
 * shape 0 = rounded (broad shoulders, a soft top), 1 = a pyramid with three or four buttresses,
 * 2 = a table with steep sides, 3 = a sugarloaf (the towers of karst country, seen whole on the skyline).
 * Neighbours merge softly, so a row of them reads as one range.
 */
function peakField(x: number, z: number, seed: number, C: number, shape: number): number {
  const ci = Math.floor(x / C);
  const cj = Math.floor(z / C);
  let h = 0;
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const hh = hash2(ci + di, cj + dj, seed);
      if ((hh & 0xff) > 150) continue;
      const px = (ci + di + 0.15 + 0.7 * (((hh >>> 8) & 0xff) / 255)) * C;
      const pz = (cj + dj + 0.15 + 0.7 * (((hh >>> 16) & 0xff) / 255)) * C;
      const rad = C * (0.75 + 0.5 * (((hh >>> 24) & 0xff) / 255));
      const dx = x - px;
      const dz = z - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rad * rad) continue;
      const k = 1 - Math.sqrt(d2) / rad;
      const tall = 0.45 + 0.55 * (((hh >>> 4) & 0xf) / 15);
      let v: number;
      if (shape === 1) {
        const nb = 3 + ((hh >>> 12) & 1);
        v = Math.pow(k, 1.12) * (1 + 0.2 * Math.cos(nb * Math.atan2(dz, dx) + (hh & 7)) * (1 - k));
      } else if (shape === 2) {
        v = smoothstep(0, 0.22, k) * (0.85 + 0.15 * k);
      } else if (shape === 3) {
        v = featureProfile('tower', 1 - k);
      } else {
        v = k * k * (3 - 2 * k) * 0.8 + 0.2 * k;
      }
      h = smax(h, v * tall, 0.1);
    }
  }
  return h;
}

/**
 * A field of sugarloaf towers on a grid of cells of size C: 0…1 (far shape 3: karst country beyond its
 * near towers). A little over half the cells hold one, between half the full height and all of it; where
 * two lean on each other the taller shows. `cap` is the most a tower may stand per metre of its radius, as a
 * share of the full height: the caller's amplitude turned into the slope's limit (features.ts MAX_ASPECT),
 * so that at that amplitude no flank is steeper than two in one. A tower reaches at most a third of a cell
 * beyond its own, so the nine cells round a point hold every tower that covers it: no edge anywhere.
 */
function towerField(x: number, z: number, seed: number, C: number, cap: number): number {
  const ci = Math.floor(x / C);
  const cj = Math.floor(z / C);
  let h = 0;
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const hh = hash2(ci + di, cj + dj, seed);
      if ((hh & 0xff) > 150) continue;
      const px = (ci + di + 0.15 + 0.7 * (((hh >>> 8) & 0xff) / 255)) * C;
      const pz = (cj + dj + 0.15 + 0.7 * (((hh >>> 16) & 0xff) / 255)) * C;
      const rad = C * (0.32 + 0.18 * (((hh >>> 24) & 0xff) / 255));
      const dx = x - px;
      const dz = z - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rad * rad) continue;
      // (its height from bits of its own: the lowest eight decided whether the cell holds a tower at all)
      let tall = 0.5 + 0.5 * ((((hh >>> 12) ^ (hh >>> 20) ^ (hh >>> 28)) & 0xff) / 255);
      if (tall > cap * rad) tall = cap * rad;
      const v = tall * featureProfile('tower', Math.sqrt(d2) / rad);
      if (v > h) h = v;
    }
  }
  return h;
}

/**
 * The shape of a region's far field (version 1's big landforms away from the road, and what a region of
 * version 2 keeps of them: RegionRelief.far), 0 … 1 by its farShape: rounded hills, pyramids in rows, mesas,
 * sugarloaf towers.
 */
function farShape(b: BiomeDef, seed: number, x: number, z: number, coarse: boolean): number {
  let f: number;
  if (b.farShape === 1) {
    // the near ranges of the high country: pyramids at two sizes, standing in rows a slow noise lays out
    // (clean flanks and ridges: noise ridges only alias into needles on the far ring's grid)
    const row = smoothstep(-0.35, 0.3, fbm2(x / (b.farLen * 1.6), z / (b.farLen * 1.6), seed + 3, 2));
    f = (0.7 * peakField(x, z, seed + 5, 2300, 1) + 0.32 * peakField(x + 600, z + 900, seed + 6, 1100, 1)) * (0.35 + 0.65 * row);
    if (!coarse) f += 0.05 * fbm2(x / 400, z / 400, seed + 4, 2);
    if (f < 0) f = 0;
  } else if (b.farShape === 2) {
    // mesas: flat tops, steep sides, scattered over a level floor
    const n = fbm2(x / b.farLen, z / b.farLen, seed + 3, 3);
    const top = smoothstep(0.1, 0.19, n);
    f = top * (0.8 + 0.2 * fbm2(x / 160, z / 160, seed + 4, 2)) + 0.05 * smoothstep(-0.1, 0.1, n);
  } else if (b.farShape === 3) {
    // towers: sugarloaves in cells of farLen, half to all of farAmp tall, and smaller ones half their
    // size between them — the same towers for the far ring's coarse land, so that none changes as
    // it comes nearer
    const cap = MAX_ASPECT.tower / b.farAmp;
    const big = towerField(x, z, seed + 5, b.farLen, cap);
    const small = 0.5 * towerField(x + 0.37 * b.farLen, z + 0.61 * b.farLen, seed + 6, b.farLen * 0.5, 2 * cap);
    f = big > small ? big : small;
  } else {
    const n = fbm2(x / b.farLen, z / b.farLen, seed + 3, 4);
    const k = smoothstep(-0.3, 0.75, n);
    f = k * k;
  }
  return f;
}

export class World implements Ground {
  readonly spine: RoadSpine;
  readonly seed: number;
  /**
   * The rules this world is generated by (rules.ts): its version's, with its own region count. The road
   * holds the same object (`spine.rules`, `spine.plan.rules`), so every plan — each holds the road or
   * the world — has them at hand.
   */
  readonly rules: WorldRules;
  /** weather state that changes grip: 0…1 */
  wetness = 0;
  snowCover = 0;

  private readonly p0 = new SpineSample();
  private readonly p1 = new SpineSample();
  private readonly bl = new BiomeBlend();
  private readonly tp = new TerrainPoint();
  private readonly tq = new TerrainPoint();
  /** where the road runs along the coast */
  readonly sea: SeaPlan;
  private readonly se = new SeaEffect();
  /** lakes, rivers and the bridges over them */
  readonly water: WaterPlan;
  /** what kind of country each stretch runs through */
  readonly land: LandformPlan;
  /** the places beside the road, and what lies on its verges */
  readonly sites: SitePlan;
  /** what the road carries along its edges: delineators, guard rails, chevrons, kilometre stones */
  readonly furniture: Furniture;
  /**
   * The anchored landforms beside the road — tower clusters, buttes — in a world of version 2 (features.ts);
   * null in a world of version 1, which has none.
   */
  readonly features: FeaturePlan | null;
  private readonly lp = new LandParams();
  private readonly we = new WaterEffect();
  private readonly br: { river: River | null; mask: number } = { river: null, mask: 0 };
  /** the road ends at its start (WorldOptions.deadEnd) */
  readonly deadEnd: boolean;
  readonly plots: readonly Plot[];
  /** WorldOptions.placeOdds (null: the old game's) */
  readonly placeOdds: readonly [number, number, number] | null;
  /** WorldOptions.secondPlace (0: none) */
  readonly secondPlace: number;
  /** a world of version 2: its land is the relief of relief.ts (the regions' RegionRelief), version 1's is `relief` */
  private readonly relief2: boolean;
  /** … and how far out the nearest of its regions' ranges or walls may begin (m): nearer, `mountains` adds nothing */
  private readonly mountainsFrom: number;
  private readonly rm = new ReliefMix();
  /** the ecotope field and the flora field of a world of version 2, once they have been asked for (`eco`, `flora`) */
  private ecoField: EcotopeField | null = null;
  private floraVistas: FloraVistas | null = null;
  get vistas(): FloraVistas {
    return (this.floraVistas ??= new FloraVistas(this, new TerrainPoint()));
  }

  private floraField: FloraField | null = null;

  constructor(seed: number, opts: WorldOptions = {}) {
    this.seed = seed | 0;
    this.deadEnd = !!opts.deadEnd;
    this.plots = opts.plots ?? [];
    this.placeOdds = opts.placeOdds ?? null;
    this.secondPlace = opts.secondPlace ?? 0;
    this.rules = rulesFor(opts.worldVersion, opts);
    this.relief2 = this.rules.version >= 2;
    let from = Infinity;
    for (let r = 0; r < this.rules.regionCount; r++) {
      const R = BIOMES[r].relief;
      if (!R) continue;
      if (R.ranges.from < from) from = R.ranges.from;
      if (R.walls && R.walls.floor < from) from = R.walls.floor;
    }
    // (the great ranges of the far country rise in every world of version 2)
    this.mountainsFrom = this.relief2 ? Math.min(from, GREAT_FROM) : from;
    // One grid of stretches for everything laid out along the road: the landform of stretch k asks the
    // water's dice of stretch k, the places ask both, a quiet stretch silences all three. The rules name
    // its length and each plan keeps the number as a constant of its own; this is where they are held equal.
    if (LAND_SLOT !== WATER_SLOT || SITE_SLOT !== LAND_SLOT || this.rules.slot !== LAND_SLOT) {
      throw new Error(`the stretches do not agree: landform ${LAND_SLOT} m, water ${WATER_SLOT} m, places ${SITE_SLOT} m, the world's rules ${this.rules.slot} m`);
    }
    this.spine = new RoadSpine(seed, opts, this.rules);
    this.sea = new SeaPlan(this.spine, this.seed);
    this.water = new WaterPlan(this.spine, this.seed, (k) => (this.sea.near(k) || this.quiet(k) ? 2 : this.sea.along(k) ? 1 : 0));
    this.land = new LandformPlan(
      this.spine,
      this.seed,
      (k) => this.water.diceOf(k),
      (k) => this.sea.coastOf(k)?.side ?? 0,
      (k) => this.quiet(k),
    );
    this.sites = new SitePlan(this, new TerrainPoint(), this.seed);
    this.furniture = new Furniture(this, new TerrainPoint(), this.seed);
    this.features = this.rules.version >= 2 ? this.featurePlan() : null;
  }

  /**
   * The plan of the anchored landforms. It is laid out stretch by stretch from the road, the water plan's
   * boxes and the director's programme, none of which asks the land for a height: the land asks this plan
   * at every point (`shape`), so nothing it reads may ask the land in its turn.
   */
  private featurePlan(): FeaturePlan {
    const sp = this.spine;
    const st = new SpineSample();
    const road = {
      at(s: number, out: { x: number; z: number; cos: number; sin: number }): void {
        sp.at(s, st);
        out.x = st.x;
        out.z = st.z;
        out.cos = dcos(st.phi);
        out.sin = dsin(st.phi);
      },
    };
    // (water: a landform stands clear of a lake's basin and of a river's water with FEATURE_SHORE m of
    // bank, wherever its foot reaches. The water plan's quick answer, `mayReach`, is yes for the whole
    // strip of country a river runs through, a kilometre wide: with it a stretch that has a river kept
    // one landform in nine)
    return new FeaturePlan(road, this.seed, (k) => this.featureRecipes(k), (x, z, s, reach) => this.water.touches(x, z, s, reach, FEATURE_SHORE), this.rules.slot);
  }

  /**
   * What a cluster of anchored landforms in stretch k is made of: its region's recipes, if the director
   * gives the stretch to landforms (as many stretches of a chapter as the region asks for, the quiet ones
   * among them: scenery is not a place to stop) and it is not beside or along a sea; null otherwise.
   */
  private featureRecipes(k: number): readonly FeatureRecipe[] | null {
    const plan = this.spine.plan;
    const run = runAt(plan, k);
    const region = BIOMES[plan.biomes[run.chapter]];
    const want = region.featureSlots ?? 0;
    if (want <= 0 || !region.features || region.features.length === 0) return null;
    if (!featureSlots(this.seed, { chapter: run.chapter, k0: run.k0, k1: run.k1, features: want }).includes(k)) return null;
    if (this.sea.near(k) || this.sea.along(k)) return null;
    return region.features;
  }

  /** is stretch k one of the journey's quiet ones? (the rules' quiet rule; version 1's is quiet.ts: no place, no lake, no bridge, no landmark there) */
  quiet(k: number): boolean {
    return this.rules.quiet(this.spine.plan, this.seed, k);
  }

  /**
   * The ecotope field of a world of version 2 (ecotope.ts): what kind of spot each place is for a plant,
   * by the parameters each region's flora table gives (floraTables.ts), with the water's own account of
   * how far its edge is (the lakes', the rivers' and the sea's: `shoreOf`). It is made the first time it
   * is asked for and computes nothing until a tile of it is asked for. Null in a world of version 1, whose
   * plants are the renderer's own as they always were.
   */
  get eco(): EcotopeField | null {
    if (this.rules.version < 2) return null;
    return (this.ecoField ??= new EcotopeField(this, new TerrainPoint(), (r) => floraTableOf(BIOMES[r].id, BIOMES[r].kin).eco, shoreOf(this)));
  }

  /**
   * The flora field of a world of version 2 (flora.ts), over its ecotope field: what grows where, by each
   * region's flora table. Made the first time it is asked for, computing nothing until a cell is asked;
   * null in a world of version 1.
   */
  get flora(): FloraField | null {
    const eco = this.eco;
    if (eco === null) return null;
    return (this.floraField ??= new FloraField(this, new TerrainPoint(), eco, (r) => floraTableOf(BIOMES[r].id, BIOMES[r].kin)));
  }

  private relief(b: BiomeDef, bi: number, x: number, z: number, g1: number, lat: number, farK: number, coarse = false): number {
    const seed = this.seed + bi * 7919;
    let r = 0;
    if (g1 > 0) {
      r += (b.nearAmp * fbm2(x / b.nearLen, z / b.nearLen, seed + 1, 3) + b.detailAmp * fbm2(x / b.detailLen, z / b.detailLen, seed + 2, 2)) * g1;
    }
    const g2 = smoothstep(b.farStart, b.farEnd, lat);
    if (g2 > 0) {
      const f = farShape(b, seed, x, z, coarse);
      // ranges grow taller the further they stand from the road: layer behind layer to the horizon
      r += b.farAmp * f * g2 * farK * (1 + 0.5 * smoothstep(1500, 5500, lat));
    }
    // Ranges on the skyline, kilometres back. Each is a row of mountains with a designed shape —
    // rounded in the hills, pyramids in the high country, tables in the dry — big enough for the far
    // ring's grid to draw cleanly, standing where a slow noise puts them with open sky between.
    const g3 = smoothstep(2600, 7500, lat);
    if (g3 > 0) {
      const ms = this.seed + 0x3a55;
      const broad = smoothstep(-0.1, 0.45, fbm2(x / 15000, z / 15000, ms + 1, 2));
      if (broad > 0) {
        const big = peakField(x, z, ms + 11, 5200, b.farShape);
        const small = peakField(x + 1700, z - 900, ms + 12, 2600, b.farShape);
        r += b.massifAmp * broad * (0.85 * big + 0.35 * small + 0.06) * g3;
      }
      r += this.giantPeaks(x, z) * g3;
    }
    return r;
  }

  /**
   * A region's own relief in a world of version 2 (biomes.ts RegionRelief): version 1's near relief, the hills
   * of the middle distance from HILLS_FROM m out (`across`: the distance across the road from the road point of
   * the same x, smooth everywhere; `near`: within the near field, also the distance to the nearest road point,
   * which keeps the hills off the road's corridor inside a bend), and as much of version 1's far field as it
   * keeps. Its walls and ranges are the long blend's (mountains). A region without a relief of its own has
   * version 1's.
   */
  private reliefV2(b: BiomeDef, bi: number, x: number, z: number, g1: number, lat: number, farK: number, across: number, ad: number, coarse: boolean): number {
    const R = BIOMES[bi].relief;
    if (!R) return this.relief(b, bi, x, z, g1, lat, farK, coarse);
    const seed = this.seed + bi * 7919;
    let r = 0;
    if (g1 > 0) {
      r += (b.nearAmp * fbm2(x / b.nearLen, z / b.nearLen, seed + 1, 3) + b.detailAmp * fbm2(x / b.detailLen, z / b.detailLen, seed + 2, 2)) * g1;
    }
    if (R.hills.amp > 0) {
      let g = smoothstep(HILLS_FROM, HILLS_FROM + hillsFade(R.hills.amp), across);
      if (ad < HILLS_FROM + 10) g *= smoothstep(HILLS_FROM - 22, HILLS_FROM + 10, ad);
      if (g > 0) r += R.hills.amp * hillField(x, z, this.seed + 0x41f1, R.hills.len) * g * farK;
    }
    if (R.far > 0) {
      const g2 = smoothstep(b.farStart, b.farEnd, lat);
      if (g2 > 0) r += R.far * b.farAmp * farShape(b, seed, x, z, coarse) * g2 * farK * (1 + 0.5 * smoothstep(1500, 5500, lat));
    }
    return r;
  }

  /**
   * The walls of mountain valleys and the ranges beyond in a world of version 2 (relief.ts), as high as the
   * long blend of the country at s0 says: one shape for the whole world, not a region's, so that nothing
   * changes shape from one region to the next — only how high it stands.
   */
  private mountains(x: number, z: number, s0: number, dzl: number, lat: number): number {
    // (nearer the road than any region's ranges begin and any valley's walls: nothing to add)
    if (lat <= this.mountainsFrom) return 0;
    const m = reliefMix(this.spine.plan, s0, this.rm);
    let r = 0;
    if (m.ranges > 0) {
      const g = smoothstep(m.from, m.full, lat);
      if (g > 0) r += m.ranges * g * rangeField(x, z, this.seed + 0x7a1);
    }
    // (no wall stands on its floor, open country or not)
    if (m.walls > 0 && (dzl < 0 ? -dzl : dzl) > m.floor) {
      const open = openness(this.land, this.rules.slot, s0, dzl < 0 ? -1 : 1);
      r += m.walls * wallAt(x, z, dzl, m, open, this.seed + 0x3e5);
    }
    // the great ranges of the far country, beyond what any region by the road says
    r += greatRange(x, z, lat, r, this.seed + 0x9b1);
    return r;
  }

  /**
   * Giant peaks: at most one per 16 km world cell (about half the cells), 2.4–3 km high and some 6 km
   * across at the foot, rugged on top — snow-capped landmarks on the skyline that stay in view for
   * many minutes of driving. Only where the land is already far from the road (the caller fades them
   * in with the distance from the road), so the road never climbs one.
   */
  private giantPeaks(x: number, z: number): number {
    const C = 16000;
    const ci = Math.floor(x / C);
    const cj = Math.floor(z / C);
    let h = 0;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const hh = hash2(ci + di, cj + dj, this.seed + 0x9ea7);
        if ((hh & 0xff) > 128) continue;
        const px = (ci + di + 0.2 + 0.6 * ((hh >>> 8) & 0xff) / 255) * C;
        const pz = (cj + dj + 0.2 + 0.6 * ((hh >>> 16) & 0xff) / 255) * C;
        const rad = 5200 + 1800 * ((hh >>> 24) & 0xff) / 255;
        const dx = x - px;
        const dz = z - pz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rad * rad) continue;
        const k = 1 - Math.sqrt(d2) / rad;
        const height = 2400 + 600 * (((hh >>> 4) & 0xf) / 15);
        // a broad foot steepening to the top, with three or four great buttresses: one clean shape
        const nb = 3 + ((hh >>> 13) & 1);
        const butt = 1 + 0.2 * Math.cos(nb * Math.atan2(dz, dx) + (hh & 7)) * (1 - k);
        h = Math.max(h, height * k * k * (3 - 2 * k) * Math.pow(k, 0.35) * butt);
      }
    }
    return h;
  }

  /**
   * Full description of the ground at (x, z).
   * @param coarse for the far terrain ring only: leaves out the small near-field relief (metres high,
   *   tens of metres long), which those 128–256 m grids could not show anyway — a quarter of the cost
   */
  shape(x: number, z: number, o: TerrainPoint, coarse = false): void {
    const sp = this.spine;
    const p = this.p0;
    const s0 = sp.sAtX(x);
    // The places by the road level the ground they stand on. They are laid out stretch by stretch the
    // first time the land there is asked about — here, before anything of this call is held in the
    // scratch values, because laying out asks the land in its turn.
    if (!coarse) this.sites.ensure(Math.floor(s0 / SITE_SLOT));
    sp.at(s0, p);
    const cs0 = Math.cos(p.phi);
    const sn0 = Math.sin(p.phi);
    const dzl = z - p.z;
    const lat = dzl < 0 ? -dzl : dzl;
    const y0 = p.y;
    let s = s0 + dzl * sn0;
    let d = dzl * cs0;
    let ad = d < 0 ? -d : d;
    let q = p;
    const near = ad < NEAR_FIELD;
    if (near) {
      // exact nearest road point
      q = this.p1;
      let cs = cs0;
      let sn = sn0;
      for (let k = 0; k < 7; k++) {
        sp.at(s, q);
        cs = Math.cos(q.phi);
        sn = Math.sin(q.phi);
        // on the inside of a curve a metre along the tangent is more than a metre of road
        const dd = -(x - q.x) * sn + (z - q.z) * cs;
        const kd = q.kappa * dd;
        const along = (x - q.x) * cs + (z - q.z) * sn;
        // (only well inside the radius; near the centre of a curve the plain step is the stable one)
        s += kd > -0.7 && kd < 0.7 ? along / (1 - kd) : along;
        if (along < 0.01 && along > -0.01) break;
      }
      // (a road that ends at its start: the nearest road is its end, the point measured from there)
      if (s < 0 && this.deadEnd) s = 0;
      sp.at(s, q);
      cs = Math.cos(q.phi);
      sn = Math.sin(q.phi);
      d = -(x - q.x) * sn + (z - q.z) * cs;
      // if the search has not settled on a perpendicular foot, the point is certainly not beside
      // this station: count the leftover distance along the road too, so it is never mistaken for road
      const rest = (x - q.x) * cs + (z - q.z) * sn;
      ad = rest > 0.5 || rest < -0.5 ? Math.sqrt(d * d + rest * rest) : d < 0 ? -d : d;
      o.behind = this.deadEnd && s === 0 && rest < 0 ? -rest : 0;
    } else o.behind = 0;

    // biome mix is indexed by x, so it is continuous everywhere
    const bl = this.bl;
    sp.biomeAt(s0, bl);
    const A = BIOMES[bl.a];
    const g1 = coarse ? 0 : smoothstep(7, 58, ad);
    // the country this stretch runs through: its cross-section, measured from the road at the same x
    const lp = this.land.at(s0, this.lp);
    const farK = lp.farAt(dzl * cs0);
    let rel: number;
    let verge = A.vergeBlend;
    let ditchDepth = A.ditch;
    if (!this.relief2) {
      rel = this.relief(A, bl.a, x, z, g1, lat, farK, coarse);
      if (bl.t > 0) {
        const B = BIOMES[bl.b];
        rel += (this.relief(B, bl.b, x, z, g1, lat, farK, coarse) - rel) * bl.t;
        verge += (B.vergeBlend - verge) * bl.t;
        ditchDepth += (B.ditch - ditchDepth) * bl.t;
      }
    } else {
      // (version 2: the regions' own relief, then the walls and the ranges of the country)
      const across = dzl * cs0 < 0 ? -dzl * cs0 : dzl * cs0;
      rel = this.reliefV2(A, bl.a, x, z, g1, lat, farK, across, near ? ad : NEAR_FIELD, coarse);
      if (bl.t > 0) {
        const B = BIOMES[bl.b];
        rel += (this.reliefV2(B, bl.b, x, z, g1, lat, farK, across, near ? ad : NEAR_FIELD, coarse) - rel) * bl.t;
        verge += (B.vergeBlend - verge) * bl.t;
        ditchDepth += (B.ditch - ditchDepth) * bl.t;
      }
      rel += this.mountains(x, z, s0, dzl, lat);
    }
    rel += LandformPlan.offset(lp, dzl * cs0, x, z, this.seed);
    // land: the base follows the nearest road point close in, and the same-x road point far out
    const base = q.y + (y0 - q.y) * smoothstep(18, 55, ad);
    // (a world of version 2: the stretch's terraces and dunes; no stretch of a world of version 1 has either)
    if (lp.terrace > 0 || lp.dune > 0) rel = this.operate(lp, rel, base, x, z, ad, coarse, dzl, cs0, (sn0 / cs0) * (1 + (dzl * p.kappa) / cs0), y0 - q.y, s0);
    o.s = s;
    o.d = d;
    o.roadY = q.y;
    o.bank = q.bank;
    o.phi = q.phi;
    o.grade = q.grade;
    o.ba = bl.a;
    o.bb = bl.b;
    o.bt = bl.t;
    o.ca = bl.ia;
    o.cb = bl.ib;
    o.relief = rel;
    o.zone = 0;
    o.site = 0;

    let T = base + rel;
    o.wl = -Infinity;
    o.frozen = 0;
    o.wkind = 0;
    o.bridge = 0;
    // water reshapes the land (the far ring's grid is too coarse to hold a shore: it is left dry)
    if (!coarse) {
      const we = this.we;
      T = this.water.carve(x, z, s0, T, we);
      o.wl = we.level;
      o.frozen = we.frozen;
      o.wkind = we.kind;
      o.wt = we.t;
      o.wlat = we.l;
    } else if (this.relief2) {
      // (version 2: the valleys rivers cut through hills and mountain walls are kilometres wide and show from
      // far off, so the far ring's land has them too — still dry, its water standing as level ground)
      const we = this.we;
      T = this.water.carve(x, z, s0, T, we);
      if (we.level > T) T = we.level;
    }
    // the sea, where the road runs along a coast: beach and sea bed on its side — in the far ring too,
    // for it runs to the horizon
    const seaT = this.sea.carve(s0, dzl * cs0, T, y0, this.se);
    if (this.se.level > -1e8) {
      T = seaT;
      if (this.se.off > -60) {
        o.wl = this.se.level;
        o.wkind = 3;
        o.frozen = 0;
      }
    }
    // The anchored landforms of a world of version 2 stand on the land as it lies by now — near the
    // road, far from it and in the far ring's coarse land alike, so that a tower is the same tower
    // whoever draws it. They keep clear of the road's corridor (features.ts CLEAR), so the road, its
    // shoulders, its verge and the ground of the places are what they were.
    if (this.features !== null) {
      const add = this.features.heightAt(x, z, s0);
      T += add;
      o.landform = add;
    } else o.landform = 0;
    if (!near) {
      o.h = o.bed = T;
      if (o.frozen > 0.5 && o.wl > T) o.h = o.wl;
      o.plot = 0;
      if (this.plots.length) this.onPlots(x, z, o, ad);
      return;
    }
    // on a bridge span the road is a deck and the land beside and below it is the river's
    let bm = 0;
    if (ad < 60) {
      this.water.bridgeAt(s, this.br);
      bm = this.br.mask;
      o.bridge = bm;
    }
    if (ad <= ROAD_HALF) {
      o.h = q.y + q.bank * d;
      o.zone = 1;
      o.bed = o.h + (T - o.h) * bm;
    } else if (ad <= ROAD_EDGE) {
      o.h = q.y + q.bank * d - (ad - ROAD_HALF) * 0.06;
      o.zone = 2;
      o.bed = o.h + (T - o.h) * bm;
    } else {
      const sgn = d < 0 ? -1 : 1;
      // a place's levelled ground is the road's own level carried sideways: no ditch, a gentler fall,
      // and the land let in again only beyond it
      const pw = bm > 0 || ad > 60 ? 0 : this.sites.padWeight(s, d);
      if (pw > 0) {
        o.site = pw;
        o.siteGround = this.sites.padGround;
      }
      const ext = q.y + q.bank * sgn * ROAD_EDGE - (ROAD_EDGE - ROAD_HALF) * 0.06 - (ad - ROAD_EDGE) * (0.03 - (0.03 - PAD_FALL) * pw);
      const m = smoothstep(ROAD_EDGE, ROAD_EDGE + verge, ad) * (1 - pw);
      const u = (ad - (ROAD_EDGE + 2.4)) / 1.5;
      const ditch = ditchDepth * Math.exp(-u * u) * smoothstep(ROAD_EDGE, ROAD_EDGE + 1.2, ad) * (1 - pw);
      let h = ext + (T - ext) * m - ditch;
      // Ploughed snow piles up just beyond the wheelable shoulder. Keep the
      // bridge approaches and property entrances clear and taper at the snowline.
      if (this.rules.version === 2 && ad < 8.5 && bm === 0 && !coarse) {
        const snow = (BIOMES[o.ba].id === 'alpine' ? 1-o.bt : 0) + (BIOMES[o.bb].id === 'alpine' ? o.bt : 0);
        if (snow > 0) {
          const ridge = (ad-5.45)/1.05;
          h += snow*(1-pw)*smoothstep(ROAD_EDGE,ROAD_EDGE+1.1,ad)*Math.exp(-ridge*ridge)*(0.42+0.13*Math.sin(s/9+d));
        }
      }
      if (bm > 0) {
        // no embankment across the river: the land falls away from the abutments
        const land = h + (T - h) * bm;
        if (ad <= DECK_HALF) {
          const deck = q.y + q.bank * d - (ad - ROAD_HALF) * 0.06 + (ad > KERB_AT ? KERB_HEIGHT : 0);
          h += (deck - h) * bm;
          o.bed = land;
          if (bm > 0.5) o.zone = 3;
        } else {
          h = land;
          o.bed = h;
        }
        o.h = h;
      } else {
        o.h = o.bed = h;
      }
    }
    // a frozen lake carries the wheels on its ice
    if (o.frozen > 0.5 && o.wl > o.h && o.zone === 0) o.h = o.wl;
    o.plot = 0;
    if (this.plots.length) this.onPlots(x, z, o, ad);
  }

  /**
   * The cross-section operators of a world of version 2 (operators.ts) on the relief of a point `ad` m from
   * the road, the land's height there being base + rel. Both leave the road's corridor as it is: they
   * change the land the verge blends into and the places' ground is levelled from, not the blend, the
   * shoulder or the levelled ground themselves.
   *
   *   terraces  from 14 m out, in full from 34 m; in full to 350 m and gone by 600 m, where the far ring's
   *             grid could not draw a step of four metres. The benches are cut in the land's own height,
   *             not in its height above the road: a bench stays level where the road beside it climbs.
   *             How much of each step is riser goes by how steep the land is there (the same land asked
   *             once more, a few metres further from the road): steeper ground has narrower benches, never
   *             steeper risers, and ground too steep to bench at all is left as it lies.
   *   dunes     from 16 m out, in full from 60 m, and as far as the stretch's open ground goes; beyond
   *             1.5 to 3 km, and in the far ring's coarse land, their mean height instead of the dunes.
   *
   * @param dzl  the point's z less the road's at the same x
   * @param cs0  the cosine of the road's heading at the road point of the same x
   * @param skew how fast the distance across the road (dzl · cs0) changes along x, against how fast it
   *             changes along z: the heading's tangent, and more than that beside a bend, where the road
   *             point of the same x turns as x goes on
   * @param rise how much higher the road is at the same x than at the nearest road point (close to the
   *             road the land's base goes from the one to the other)
   * @param s0   the arc length of the road point of the same x
   */
  private operate(lp: LandParams, rel: number, base: number, x: number, z: number, ad: number, coarse: boolean, dzl: number, cs0: number, skew: number, rise: number, s0: number): number {
    if (lp.terrace > 0 && !coarse) {
      // (the fade far from the road goes by the distance across the road from the road point of the same
      // x, which changes smoothly everywhere; `ad`, the distance to the nearest road point, is only good
      // near the road: inside a bend, a hundred metres and more from it, the search for the nearest point
      // settles now here, now there, and nothing but what lies within 60 m of the road may go by it)
      const w = smoothstep(14, 34, ad) * (1 - smoothstep(350, 600, (dzl < 0 ? -dzl : dzl) * cs0));
      if (w > 0) {
        // How steep the land is here. It is the cross-section that makes a hillside, and the cross-section
        // is a function of the distance across the road: so the slope along z is measured (the same land
        // a few metres further out) and the slope along x follows from how that distance changes along x.
        // Then a margin for what the relief and the road's own grade add along the road, joined to it
        // smoothly: where the slope passes through nothing the measure does not turn a corner, and
        // neither does the riser that goes by it.
        const e = dzl < 0 ? -TERRACE_PROBE : TERRACE_PROBE;
        // (that point lies this far from the road: close to the road the near relief is still coming in
        // and the base still turning from the nearest road point's height to the same-x one's)
        const out = ad + TERRACE_PROBE * cs0;
        const dh = this.reliefAt(lp, x, z + e, dzl + e, cs0, smoothstep(7, 58, out), s0) - rel + rise * (smoothstep(18, 55, out) - smoothstep(18, 55, ad));
        const across = dh / TERRACE_PROBE;
        const slope = Math.sqrt(across * across * (1 + skew * skew) + 0.04) + 0.12;
        const k = lp.terrace * w * (1 - smoothstep(0.6, 0.9, slope));
        if (k > 0) rel = terrace(base + rel, lp.step, k, riserFor(slope)) - base;
      }
    }
    if (lp.dune > 0) {
      const w = smoothstep(16, 60, ad);
      if (w > 0) {
        // (kilometres out the land is drawn too coarsely for a dune a hundred metres long: there, and in
        // the far ring's coarse land everywhere, the ground is raised by the dunes' mean height instead)
        const far = coarse ? 1 : smoothstep(1500, 3000, (dzl < 0 ? -dzl : dzl) * cs0);
        let dune = far < 1 ? dunes(x, z, this.seed, lp.dune, lp.duneLen) : 0;
        dune += (DUNE_MEAN * lp.dune - dune) * far;
        rel += dune * w;
      }
    }
    return rel;
  }

  /**
   * The relief at a point with the same x as the one `shape` is working on (so the same road point, the
   * same mix of biomes in `this.bl`, the same cross-section) and another z: what `shape` itself adds up,
   * before the operators.
   */
  private reliefAt(lp: LandParams, x: number, z: number, dzl: number, cs0: number, g1: number, s0: number): number {
    const bl = this.bl;
    const lat = dzl < 0 ? -dzl : dzl;
    const farK = lp.farAt(dzl * cs0);
    let rel: number;
    if (!this.relief2) {
      rel = this.relief(BIOMES[bl.a], bl.a, x, z, g1, lat, farK);
      if (bl.t > 0) rel += (this.relief(BIOMES[bl.b], bl.b, x, z, g1, lat, farK) - rel) * bl.t;
    } else {
      // (the hills go by the distance across the road; the nearest road point's distance only keeps them off a
      // bend's corridor, and a probe two metres out is never there)
      const across = dzl * cs0 < 0 ? -dzl * cs0 : dzl * cs0;
      rel = this.reliefV2(BIOMES[bl.a], bl.a, x, z, g1, lat, farK, across, NEAR_FIELD, false);
      if (bl.t > 0) rel += (this.reliefV2(BIOMES[bl.b], bl.b, x, z, g1, lat, farK, across, NEAR_FIELD, false) - rel) * bl.t;
      rel += this.mountains(x, z, s0, dzl, lat);
    }
    return rel + LandformPlan.offset(lp, dzl * cs0, x, z, this.seed);
  }

  /** is (x, z) wholly on a plot that lets no grass of the world's grow there (Plot.bare) */
  plotBare(x: number, z: number): boolean {
    for (const p of this.plots) {
      if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
      return p.bare ? p.bare(x, z) : true;
    }
    return false;
  }

  /** how tall the world's grass grows at (x, z), as a share of its height: a plot's (Plot.grass), back to 1 over its skirt */
  plotGrass(x: number, z: number): number {
    let k = 1;
    for (const p of this.plots) {
      if (!p.grass) continue;
      const w = plotWeight(p, x, z);
      if (w <= 0) continue;
      k = Math.min(k, 1 + (p.grass(x, z) - 1) * w);
    }
    return k;
  }

  /** the caller's plots: the land within takes their height (never the road's bed and shoulders: they fade out by the road) */
  private onPlots(x: number, z: number, o: TerrainPoint, ad: number): void {
    if (o.zone !== 0) return;
    for (const p of this.plots) {
      let w = plotWeight(p, x, z);
      if (w <= 0) continue;
      // (beside the road the land keeps its verge for a few metres)
      if (o.behind <= 0) w *= smoothstep(ROAD_EDGE + 0.5, ROAD_EDGE + 6, ad);
      if (w <= 0) continue;
      const h = p.height(x, z);
      o.h += (h - o.h) * w;
      o.bed += (h - o.bed) * w;
      if (w > o.plot) o.plot = w;
    }
  }

  /** Smooth ground height (what the meshes show). */
  heightAt(x: number, z: number): number {
    this.shape(x, z, this.tp);
    return this.tp.h;
  }

  /** surface type at a shaped point */
  surfaceOf(t: TerrainPoint): number {
    if (this.rules.version === 2 && (t.zone === 1 || t.zone === 2) && t.bridge < 0.5)
      return roadSurface(roadStyleAt(this,t.s), Math.abs(t.d));
    if (t.zone === 1 || t.zone === 3) return Surface.Asphalt;
    if (t.zone === 2) return Surface.Gravel;
    if (t.site > 0.5) return t.siteGround === 1 ? Surface.Asphalt : Surface.Gravel;
    if (t.frozen > 0.5 && t.wl >= t.h) return Surface.Ice;
    // a beach is sand whatever the country behind it
    if (t.wkind === 3 && t.h < t.wl + 1.25) return Surface.Sand;
    return BIOMES[t.bt < 0.5 ? t.ba : t.bb].ground;
  }

  /**
   * The joints of a bridge, as a height added to the road at arc length s (m). The deck stands a finger
   * proud of the road it carries on — every old bridge's approaches have settled — so each axle thumps
   * once coming on and once going off; a beam bridge has a joint over every pier besides. The steps are
   * ramped over a hand's width (what the round of a tyre makes of an edge), so creeping over them is gentle.
   */
  static deckJoints(f: River, s: number): number {
    if (s < f.span0 - 0.2 || s > f.span1 + 0.2) return 0;
    let dh = DECK_PROUD * smoothstep(f.span0 - 0.06, f.span0 + 0.06, s) * (1 - smoothstep(f.span1 - 0.06, f.span1 + 0.06, s));
    if (f.bridge === 'beam') {
      // (the same piers the bridge is drawn with: one every 18 m or so)
      const span = f.span1 - f.span0;
      const bays = Math.max(1, Math.round(span / 18) - 1) + 1;
      const u = ((s - f.span0) / span) * bays;
      const k = Math.round(u);
      if (k >= 1 && k < bays) {
        const off = ((u - k) * span) / bays;
        const a = off < 0 ? -off : off;
        if (a < PIER_JOINT_HALF) dh -= PIER_JOINT_DEPTH * (1 - a / PIER_JOINT_HALF);
      }
    }
    return dh;
  }

  /** Physics query: height with micro-roughness, normal, and grip including weather. */
  sample(x: number, z: number, out: GroundSample): void {
    const t = this.tp;
    this.shape(x, z, t);
    const surf = this.surfaceOf(t);
    let dhx: number;
    let dhz: number;
    if (t.zone !== 0) {
      const cs = Math.cos(t.phi);
      const sn = Math.sin(t.phi);
      const cross = t.zone === 1 ? t.bank : t.bank - (t.d < 0 ? -0.06 : 0.06);
      dhx = t.grade * cs - cross * sn;
      dhz = t.grade * sn + cross * cs;
    } else {
      const e = 0.4;
      const h0 = t.h;
      const tq = this.tq;
      this.shape(x + e, z, tq);
      dhx = (tq.h - h0) / e;
      this.shape(x, z + e, tq);
      dhz = (tq.h - h0) / e;
    }
    const info = SURFACES[surf];
    // long, gentle undulation: an old road is never quite flat. Short ripples are left to sound and camera.
    const rough = info.rough * (1.5 * simplex2(x / 6.3, z / 6.3, this.seed + 91) + 0.6 * simplex2(x / 2.1, z / 2.1, this.seed + 92));
    const inv = 1 / Math.sqrt(dhx * dhx + 1 + dhz * dhz);
    out.h = t.h + rough;
    // what the wheels feel and the eye does not: where a bridge takes the road over (shape() has just
    // asked about the bridge here, for every point on the road)
    if (t.zone !== 0 && this.br.river) out.h += World.deckJoints(this.br.river, t.s);
    out.nx = -dhx * inv;
    out.ny = inv;
    out.nz = -dhz * inv;
    out.surface = surf;
    let mu = info.mu;
    let rr = info.rr;
    const wet = this.wetness;
    if (wet > 0) {
      const loss = surf === Surface.Asphalt ? 0.28 : surf === Surface.Sand ? -0.06 : surf === Surface.Gravel ? 0.14 : 0.3;
      mu *= 1 - loss * wet;
    }
    if (this.snowCover > 0 && surf !== Surface.Snow && surf !== Surface.Ice) {
      const k = smoothstep(0.15, 0.7, this.snowCover);
      mu += (SURFACES[Surface.Snow].mu + 0.04 - mu) * k;
      rr += (0.055 - rr) * k;
    }
    // open water: the deeper the wheels go, the harder it holds them (nobody drives across a lake)
    if (t.wl > t.h) {
      // (the resistance a wheel can pass on is capped by its grip, so the water's hold counts as both)
      const k = smoothstep(0.12, 0.65, t.wl - t.h);
      rr += 1.7 * k;
      mu += (1.8 - mu) * k;
    }
    out.mu = mu;
    out.rr = rr;
  }

  static create(seed: number, opts?: WorldOptions): World {
    return new World(seed, opts);
  }
}
