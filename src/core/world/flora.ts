/**
 * The flora field (docs/V3/nodes/W2-flora.md): what grows where, decided once, in the core. Everything that
 * shows or uses plants asks here: the renderer stands the trees and shrubs it is told, foraging picks what the
 * plants bear, and later the animals' cover and a bullet's path read the same trees.
 *
 * The world is cut into cells, one grid per layer (trees and shrubs 8 m, ground plants 4 m), and a cell holds
 * one plant or none. A cell is decided from its own hash and the ecotope at its plant's place: the region's
 * flora table is a list of rules, each "this plant, so many to the hectare where it likes it, and what it
 * likes"; the cell's dice fall on one rule or on none. Rules are data: a region's country is changed by
 * changing rows, never code.
 *
 * Whoever wants the plants of a stretch of country asks for them by the tile (FloraField.tile: the plants of
 * one layer in a square of 128 m, packed, computed once and kept in a bounded cache): the renderer, foraging
 * and the trunks one walks into (floraSolids.ts) all read the same tiles. A single cell can be asked too
 * (FloraField.cell); it is the same decision.
 *
 * Besides single plants there is the ground cover (FloraField.cover): how thick and tall the grass stands at
 * a place, how many flowers and of which colour, in rows or not, how much bare ground and leaf litter. That
 * is what the grass is drawn from.
 *
 * Pure, no three, no DOM; deterministic for a seed whatever is asked first.
 *
 * The world makes its own field when it is first asked for it (terrain.ts `World.flora`), so this file knows
 * the land by its types only and loads nothing of it to run: the world hands the field a terrain point to
 * work with.
 */
import { fbm2 } from '../math/noise';
import { hash2 } from '../math/rng';
import { ECO_N, ECO_PLOT, ECO_ROAD, ECO_SITE, ECO_SQ, ECO_STEP, ECO_TILE, ECO_WET, ROAD_CLEAR, Ecotope, type EcoParams, type EcoTile, type EcotopeField } from './ecotope';
import { AQUATIC_DEPTH, plantIndex, PLANTS } from './plants';
import type { TerrainPoint, World } from './terrain';

/** the layers, the side of a cell of each (m) */
export const LAYER_TREE = 0;
export const LAYER_SHRUB = 1;
export const LAYER_GROUND = 2;
export type FloraLayer = 0 | 1 | 2;
export const LAYER_CELL: readonly number[] = [8, 8, 4];
const LAYER_SALT: readonly number[] = [0x7ee5, 0x7ee6, 0x7ee7];
/** the most cells a tile has in one layer (the ground's: 32 a side) */
const MOST_CELLS = (ECO_TILE / 4) * (ECO_TILE / 4);

/** a band [low, high] of a quantity: inside it a plant is at home, outside it its numbers fall off over a quarter of the band's width */
export type Band = readonly [number, number];

/** one row of a region's flora table */
export interface FloraRule {
  /** the plant's id (plants.ts) */
  readonly plant: string;
  /** how many stand on a hectare where everything suits it */
  readonly perHa: number;
  /** what it likes: bands of the ecotope's quantities (one left out does not matter to it) */
  readonly canopy?: Band;
  readonly moisture?: Band;
  readonly slope?: Band;
  readonly relief?: Band;
  readonly shade?: Band;
  /** metres from the water's edge, and which waters count (bit 1 lake, 2 river, 4 sea; absent: any) */
  readonly water?: Band;
  readonly waterKinds?: number;
  /** metres from the road's centre line */
  readonly road?: Band;
  /**
   * metres of an anchored landform under it — a tower, a butte (0 where none stands): [8, 500] is "on one",
   * [0, 1] "on none". (Its edges are LANDFORM_EDGE m wide whatever the band's width: a landform has a foot.)
   */
  readonly landform?: Band;
  /**
   * It stands on the level benches of terraced country and nowhere else: only where the stretch is cut into
   * benches (the ecotope's `terrace`), and there only where the plant's own spot is a bench, not a riser
   * (its ground's own height a whole number of steps: `onBench`).
   */
  readonly bench?: boolean;
  /** its size against the plant's full size: a range (default 0.75 … 1.2) */
  readonly size?: Band;
  /** it grows in groves: its numbers swell and fade over patches of about this size (m) */
  readonly grove?: number;
  /**
   * It grows in hedges: along wandering lines some this far apart (m) — old field edges across the open
   * country — a few metres wide, broken by gaps, and nowhere off them (hedgeAt). Its numbers are those of
   * the line itself: write them high (a bush in nearly every cell the line crosses).
   */
  readonly hedge?: number;
}

/** a hedge's half width (m) */
const HEDGE_HALF = 5;

/**
 * How much of a hedge's line runs through (x, z), 0 … 1: the lines are where a slow noise of the given scale
 * (m) crosses its middle, so they wander and never end; a second, quicker noise breaks them into lengths with
 * gaps between (a gate, a gap where a tree fell). Every rule of the same scale follows the same lines: a hedge
 * of hazel and blackthorn is one hedge.
 */
export function hedgeAt(x: number, z: number, scale: number, seed: number): number {
  const g = fbm2(x / scale, z / scale, seed + 0x6b0, 2);
  // (the noise climbs about 2.4 across its scale near its middle: so many metres to a unit of it)
  const on = 1 - Math.abs(g) / ((HEDGE_HALF * 2.4) / scale);
  if (on <= 0) return 0;
  const gap = fbm2(x / (scale * 0.32), z / (scale * 0.32), seed + 0x6c0, 1);
  const s = on * 2.2;
  const t = (gap + 0.26) * 6;
  return (s >= 1 ? 1 : s * s * (3 - 2 * s)) * (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
}

/** how a region's ground is covered where no single plant stands */
export interface CoverParams {
  /** how thick the grass is, 0 … 1, in the open, and how tall (m) */
  readonly grass: number;
  readonly height: number;
  /** flowers among the grass, 0 … 1, and the colours they come in (0xRRGGBB) */
  readonly flowers: number;
  readonly hues: readonly number[];
  /** flowers or crops in rows: metres from row to row, the share of that which is the row, and how level the ground must be (a slope above this has none) */
  readonly rows?: { readonly spacing: number; readonly share: number; readonly maxSlope: number };
  /** bare ground where nothing else speaks, 0 … 1 (sand, scree, salt) */
  readonly bare: number;
}

/** what a region's country grows: its ecotope parameters, its rules by layer, its ground cover */
export interface FloraTable {
  readonly eco: EcoParams;
  readonly trees: readonly FloraRule[];
  readonly shrubs: readonly FloraRule[];
  readonly ground: readonly FloraRule[];
  readonly cover: CoverParams;
}

/** one plant standing in a cell (FloraField.cell fills one of these) */
export class FloraCell {
  /** index into PLANTS */
  plant = -1;
  x = 0;
  z = 0;
  /** height of the land under it (m) */
  y = 0;
  /** its size against the plant's full size */
  size = 1;
  /** its turn (rad) and a number 0 … 1 for whatever else should differ from one to the next */
  yaw = 0;
  vary = 0;
  /** the rule of its region's table that stood it there (index within its layer's rules) */
  rule = -1;
  /** the region whose table it came from */
  region = 0;
}

/** the ground cover at a place (FloraField.cover fills one of these) */
export class Cover {
  /** grass: 0 none … 1 thick, and its height (m) */
  grass = 0;
  height = 0;
  /** flowers: 0 none … 1 a carpet, and their colour */
  flowers = 0;
  hue = 0;
  /** 0 … 1: bare ground; leaf litter under trees */
  bare = 0;
  litter = 0;
}

/**
 * The plants of one layer in one tile of 128 m (FloraField.tile), packed: plant i of the tile is entry i of
 * every list. They come in the order of their cells, row by row along z and along x within a row, and each
 * stands inside its own cell (the cell of a plant is floor(x / the layer's cell), floor(z / it)).
 */
export class FloraTile {
  /** when it was last asked for (the cache drops the longest unasked) */
  used = 0;

  constructor(
    readonly layer: FloraLayer,
    /** the tile's corner is at (tx, tz) × 128 m, as an ecotope tile's */
    readonly tx: number,
    readonly tz: number,
    /** how many plants */
    readonly n: number,
    /** which plant: an index into PLANTS */
    readonly plant: Uint16Array,
    /** where it stands in the world (m), and the height of the land under it */
    readonly x: Float64Array,
    readonly z: Float64Array,
    readonly y: Float32Array,
    /** its size against the plant's full size, its turn (rad), and its own number 0 … 1 (what bearsAt asks for) */
    readonly size: Float32Array,
    readonly yaw: Float32Array,
    readonly vary: Float32Array,
    /** the rule of its region's table that stood it there (index within its layer's rules), and that region */
    readonly rule: Uint8Array,
    readonly region: Uint8Array,
    /** row[k] … row[k + 1] − 1 are the plants of the k-th row of cells (the cells whose cz is tz × cells a side + k) */
    readonly row: Uint16Array,
  ) {}
}

function smooth(t: number): number {
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
}

/** how well a value sits in a band: 1 inside, falling to 0 over a quarter of the band's width (at least `soft`) outside */
export function bandFit(v: number, band: Band | undefined, soft = 0.02): number {
  if (!band) return 1;
  const lo = band[0];
  const hi = band[1];
  if (v >= lo && v <= hi) return 1;
  const m = Math.max(soft, 0.25 * (hi - lo));
  if (v < lo) return smooth(1 - (lo - v) / m);
  return smooth(1 - (v - hi) / m);
}

/** how fully a stretch must be cut into benches for a plant of the benches to stand there (the ecotope's `terrace`) */
const BENCH_LAND: Band = [0.5, 1];
/** the width over which a landform band falls off outside itself (m of landform height) */
export const LANDFORM_EDGE = 3;

/** bandFit with an edge of a given width, whatever the band's own */
function edgeFit(v: number, band: Band, m: number): number {
  if (v >= band[0] && v <= band[1]) return 1;
  return smooth(1 - (v < band[0] ? band[0] - v : v - band[1]) / m);
}

/** a spot is a bench where its height is within this share of a step of a bench's level (a hand or two) */
export const BENCH_TOL = 0.02;

/**
 * Is ground of height y a level bench of terraces `step` m apart? The benches are cut in the land's own height
 * (operators.ts `terrace`): a bench lies at a whole number of steps, a riser between two.
 */
export function onBench(y: number, step: number): boolean {
  if (!(step > 0)) return false;
  const u = y / step;
  const f = u - Math.floor(u);
  return f <= BENCH_TOL || f >= 1 - BENCH_TOL;
}

/** how well a spot suits a rule, 0 … 1 (a rule of the benches: how well the country does; whether the spot itself is a bench is `onBench`'s to say) */
export function ruleFit(r: FloraRule, e: Ecotope): number {
  let f = bandFit(e.canopy, r.canopy) * bandFit(e.moisture, r.moisture) * bandFit(e.slope, r.slope) * bandFit(e.shade, r.shade);
  if (f <= 0) return 0;
  if (r.relief) f *= bandFit(e.relief, r.relief, 4);
  if (r.road) f *= bandFit(e.ad, r.road, 2);
  if (r.water) {
    if (r.waterKinds !== undefined && (e.waterKind === 0 || !(r.waterKinds & (1 << (e.waterKind - 1))))) return 0;
    f *= bandFit(e.waterDist, r.water, 1.5);
  }
  if (r.landform) f *= edgeFit(e.landform, r.landform, LANDFORM_EDGE);
  if (r.bench) f *= bandFit(e.terrace, BENCH_LAND);
  return f;
}

/** the quantities a rule's bands ask about, in the order ruleFit multiplies them */
const Q_CANOPY = 0;
const Q_MOISTURE = 1;
const Q_SLOPE = 2;
const Q_SHADE = 3;
const Q_RELIEF = 4;
const Q_ROAD = 5;
const Q_WATER = 6;
const Q_LANDFORM = 7;
const Q_TERRACE = 8;

/** one layer of a table made ready for the dice: its rules as numbers, looked up once per table */
interface Compiled {
  readonly rules: readonly FloraRule[];
  readonly plants: Int32Array;
  /** 1: the rule's plant grows in water (it stands in the shallows and nowhere else) */
  readonly aquatic: Uint8Array;
  /** 1: the rule stands its plant on the benches of terraced country only */
  readonly bench: Uint8Array;
  /** how many stand in one cell where everything suits */
  readonly per: Float64Array;
  /** the bands of rule r are the entries from[r] … from[r + 1] − 1 of `bands`, four numbers each: the quantity, low, high, and the width over which it falls off outside */
  readonly from: Int32Array;
  readonly bands: Float64Array;
  /** which waters count for its water band, as bits; −1: any, or it has no water band */
  readonly kinds: Int32Array;
  /** the size of its groves (m; 0: it does not grow in groves) */
  readonly grove: Float64Array;
  /** how far apart its hedges' lines are (m; 0: it does not grow in hedges) */
  readonly hedge: Float64Array;
  readonly size0: Float64Array;
  readonly size1: Float64Array;
  /** the most the rules can come to in one cell, groves at their thickest: on dry ground, in the shallows, and the greater of the two */
  readonly mostDry: number;
  readonly mostWet: number;
  readonly most: number;
}

function compile(rules: readonly FloraRule[], cell: number): Compiled {
  const n = rules.length;
  const plants = new Int32Array(n);
  const aquatic = new Uint8Array(n);
  const bench = new Uint8Array(n);
  const per = new Float64Array(n);
  const from = new Int32Array(n + 1);
  const kinds = new Int32Array(n);
  const grove = new Float64Array(n);
  const hedge = new Float64Array(n);
  const size0 = new Float64Array(n);
  const size1 = new Float64Array(n);
  const bands: number[] = [];
  let mostDry = 0;
  let mostWet = 0;
  const band = (q: number, b: Band | undefined, soft: number, edge = Math.max(soft, b ? 0.25 * (b[1] - b[0]) : 0)): void => {
    if (b) bands.push(q, b[0], b[1], edge);
  };
  for (let i = 0; i < n; i++) {
    const r = rules[i];
    plants[i] = plantIndex(r.plant);
    if (plants[i] < 0) throw new Error(`a flora rule names the plant ${r.plant}, which is not in the catalogue`);
    aquatic[i] = PLANTS[plants[i]].aquatic ? 1 : 0;
    per[i] = (r.perHa * cell * cell) / 10000;
    from[i] = bands.length;
    // (the order and the widths of ruleFit: the two must give the same number)
    band(Q_CANOPY, r.canopy, 0.02);
    band(Q_MOISTURE, r.moisture, 0.02);
    band(Q_SLOPE, r.slope, 0.02);
    band(Q_SHADE, r.shade, 0.02);
    band(Q_RELIEF, r.relief, 4);
    band(Q_ROAD, r.road, 2);
    band(Q_WATER, r.water, 1.5);
    band(Q_LANDFORM, r.landform, 0, LANDFORM_EDGE);
    if (r.bench) band(Q_TERRACE, BENCH_LAND, 0.02);
    bench[i] = r.bench ? 1 : 0;
    kinds[i] = r.water && r.waterKinds !== undefined ? r.waterKinds : -1;
    grove[i] = r.grove ?? 0;
    hedge[i] = r.hedge ?? 0;
    size0[i] = r.size ? r.size[0] : 0.75;
    size1[i] = r.size ? r.size[1] : 1.2;
    const most = per[i] * (grove[i] > 0 ? 2 : 1);
    if (aquatic[i]) mostWet += most;
    else mostDry += most;
  }
  from[n] = bands.length;
  return { rules, plants, aquatic, bench, per, from, bands: Float64Array.from(bands), kinds, grove, hedge, size0, size1, mostDry, mostWet, most: Math.max(mostDry, mostWet) };
}

/**
 * The flora of a world. `tp` is a terrain point for the field's own use (the caller makes it: `new
 * TerrainPoint()`, and not the ecotope field's); `tableOf(region)` gives a region's FloraTable by its
 * registry index (the same table object each time: its rules are compiled once).
 */
export class FloraField {
  private readonly e = new Ecotope();
  private readonly compiled = new Map<FloraTable, Compiled[]>();
  private readonly seed: number;
  private readonly tiles = new Map<number, FloraTile>();
  private clock = 0;
  /** the tables of the last two regions asked about, within one call of `cell` or `tile` */
  private regionA = -1;
  private regionB = -1;
  private layersA: Compiled[] | null = null;
  private layersB: Compiled[] | null = null;
  /** the ecotope's quantities at the plant's place, and how well each rule fits there */
  private readonly q = new Float64Array(9);
  private fit = new Float64Array(32);
  /** one cell's answer, and a tile's plants while they are being gathered */
  private readonly one = new FloraCell();
  private readonly gPlant = new Uint16Array(MOST_CELLS);
  private readonly gX = new Float64Array(MOST_CELLS);
  private readonly gZ = new Float64Array(MOST_CELLS);
  private readonly gY = new Float32Array(MOST_CELLS);
  private readonly gSize = new Float32Array(MOST_CELLS);
  private readonly gYaw = new Float32Array(MOST_CELLS);
  private readonly gVary = new Float32Array(MOST_CELLS);
  private readonly gRule = new Uint8Array(MOST_CELLS);
  private readonly gRegion = new Uint8Array(MOST_CELLS);

  constructor(
    private readonly world: World,
    private readonly tp: TerrainPoint,
    readonly eco: EcotopeField,
    private readonly tableOf: (region: number) => FloraTable,
    /** how many tiles of plants are kept, the three layers together (whoever asks for more at a time may raise it) */
    public capacity = 768,
  ) {
    this.seed = world.seed;
  }

  /** how many tiles of plants are in the cache now (for the tests and the budget's report) */
  get size(): number {
    return this.tiles.size;
  }

  private layersOf(t: FloraTable): Compiled[] {
    let c = this.compiled.get(t);
    if (!c) {
      c = [compile(t.trees, LAYER_CELL[LAYER_TREE]), compile(t.shrubs, LAYER_CELL[LAYER_SHRUB]), compile(t.ground, LAYER_CELL[LAYER_GROUND])];
      for (const lay of c) if (lay.rules.length > this.fit.length) this.fit = new Float64Array(lay.rules.length);
      this.compiled.set(t, c);
    }
    return c;
  }

  /** the compiled table of a region (a tile lies in one region or where two meet: the last two asked are at hand) */
  private layersAt(region: number): Compiled[] {
    if (region === this.regionA) return this.layersA!;
    if (region === this.regionB) return this.layersB!;
    this.regionB = this.regionA;
    this.layersB = this.layersA;
    this.regionA = region;
    return (this.layersA = this.layersOf(this.tableOf(region)));
  }

  /**
   * The plant of cell (cx, cz) of a layer. False: nothing grows there. The cell's place, size and turn come
   * from its hash alone; which plant, from the hash and the ecotope there. Nothing stands on the road's
   * corridor, on a place's ground or on a plot; a plant of the water stands in the shallows and nowhere
   * else, every other plant on dry ground. (The same decision as the tile's: `tile` is this for every cell
   * of a tile, kept.)
   */
  cell(layer: FloraLayer, cx: number, cz: number, out: FloraCell): boolean {
    const per = ECO_TILE / LAYER_CELL[layer];
    this.regionA = this.regionB = -1;
    return this.decide(layer, cx, cz, this.eco.tile(Math.floor(cx / per), Math.floor(cz / per)), out);
  }

  /**
   * The plants of one layer in the tile whose corner is at (tx, tz) × 128 m: every cell of the tile decided
   * once, packed, and kept (the cache holds `capacity` tiles and drops the longest unasked; a tile dropped
   * and asked for again comes out the same).
   */
  tile(layer: FloraLayer, tx: number, tz: number): FloraTile {
    // (tiles within ±2^15 of the origin each way, as the ecotope's)
    const key = (layer * 65536 + tx + 32768) * 65536 + tz + 32768;
    let t = this.tiles.get(key);
    if (!t) {
      if (this.tiles.size >= this.capacity) this.evict();
      t = this.build(layer, tx, tz);
      this.tiles.set(key, t);
    }
    t.used = ++this.clock;
    return t;
  }

  private evict(): void {
    let oldest = Infinity;
    let at = -1;
    for (const [k, t] of this.tiles) {
      if (t.used < oldest) {
        oldest = t.used;
        at = k;
      }
    }
    if (at >= 0) this.tiles.delete(at);
  }

  private build(layer: FloraLayer, tx: number, tz: number): FloraTile {
    const et = this.eco.tile(tx, tz);
    const per = ECO_TILE / LAYER_CELL[layer];
    const c = this.one;
    const row = new Uint16Array(per + 1);
    let n = 0;
    this.regionA = this.regionB = -1;
    for (let j = 0; j < per; j++) {
      row[j] = n;
      for (let i = 0; i < per; i++) {
        if (!this.decide(layer, tx * per + i, tz * per + j, et, c)) continue;
        this.gPlant[n] = c.plant;
        this.gX[n] = c.x;
        this.gZ[n] = c.z;
        this.gY[n] = c.y;
        this.gSize[n] = c.size;
        this.gYaw[n] = c.yaw;
        this.gVary[n] = c.vary;
        this.gRule[n] = c.rule;
        this.gRegion[n] = c.region;
        n++;
      }
    }
    row[per] = n;
    return new FloraTile(layer, tx, tz, n, this.gPlant.slice(0, n), this.gX.slice(0, n), this.gZ.slice(0, n), this.gY.slice(0, n), this.gSize.slice(0, n), this.gYaw.slice(0, n), this.gVary.slice(0, n), this.gRule.slice(0, n), this.gRegion.slice(0, n), row);
  }

  /**
   * One cell decided, from the ecotope tile `t` it lies in.
   *
   * The dice first, against the most the region's rules could ever come to: most cells of the ground layer
   * stand nothing whatever their ground, and are done with one hash. Then the ground: in an open square
   * of the ecotope's grid (EcoTile.open) it is dry land for certain; anywhere else the land is asked, and
   * a cell on a place's ground, on a plot or in deep water is done. Then the rules, twice over: how well
   * each fits and what they could come to at most, and only if the dice are below that, their groves'
   * noise and the pick. A plant that stands is given the land's own height: for that the land is asked
   * once, in an open square as anywhere else (the ecotope's height, read between nodes 8 m apart, is a
   * hand to a metre off, and more on a dune or a canyon's wall). By that height a plant of the benches is
   * held to the benches.
   */
  private decide(layer: FloraLayer, cx: number, cz: number, t: EcoTile, out: FloraCell): boolean {
    const C = LAYER_CELL[layer];
    const salt = this.seed + LAYER_SALT[layer];
    const h = hash2(cx, cz, salt);
    const x = (cx + 0.12 + 0.76 * ((h & 0xff) / 255)) * C;
    const z = (cz + 0.12 + 0.76 * (((h >>> 8) & 0xff) / 255)) * C;
    // where that is in the tile's grid: the square, and the four nodes round it
    const fx = (x - t.tx * ECO_TILE) / ECO_STEP;
    const fz = (z - t.tz * ECO_TILE) / ECO_STEP;
    let i = Math.floor(fx);
    let j = Math.floor(fz);
    i = i < 0 ? 0 : i > ECO_SQ - 1 ? ECO_SQ - 1 : i;
    j = j < 0 ? 0 : j > ECO_SQ - 1 ? ECO_SQ - 1 : j;
    const u = fx - i;
    const v = fz - j;
    const a = j * ECO_N + i;
    const b = a + 1;
    const c = a + ECO_N;
    const d = c + 1;
    const near = u < 0.5 ? (v < 0.5 ? a : c) : v < 0.5 ? b : d;
    // which of the two regions that meet here stands this cell's plant: by the cell's own dice against the mix
    // (its second hash: asked for only where two regions do meet, or when a plant stands and wants a size)
    const rt = t.rt[near];
    let h2 = rt > 0 ? hash2(cz, cx, salt + 0x100) : 0;
    const region = rt > 0 && ((h2 >>> 20) & 0xfff) / 4096 < rt ? t.rb[near] : t.ra[near];
    const lay = this.layersAt(region)[layer];
    const n = lay.rules.length;
    const dice = ((h >>> 16) & 0xffff) / 65536;
    if (n === 0 || dice >= lay.most) return false;
    const wa = (1 - u) * (1 - v);
    const wb = u * (1 - v);
    const wc = (1 - u) * v;
    const wd = u * v;
    const ad = t.ad[a] * wa + t.ad[b] * wb + t.ad[c] * wc + t.ad[d] * wd;
    if (ad < ROAD_CLEAR) return false;
    // the ground under it
    const tp = this.tp;
    let asked = false;
    let shallow = 0;
    if (!t.open[j * ECO_SQ + i]) {
      this.world.shape(x, z, tp);
      asked = true;
      if (tp.zone !== 0 || tp.site > 0.02 || tp.plot > 0.02) return false;
      const depth = tp.wl - tp.bed;
      if (depth > AQUATIC_DEPTH) return false;
      if (depth > 0.02) shallow = 1;
    }
    if (dice >= (shallow ? lay.mostWet : lay.mostDry)) return false;
    // the ecotope there, and how well each rule fits it
    const q = this.q;
    q[Q_CANOPY] = t.canopy[a] * wa + t.canopy[b] * wb + t.canopy[c] * wc + t.canopy[d] * wd;
    q[Q_MOISTURE] = t.moisture[a] * wa + t.moisture[b] * wb + t.moisture[c] * wc + t.moisture[d] * wd;
    q[Q_SLOPE] = t.slope[a] * wa + t.slope[b] * wb + t.slope[c] * wc + t.slope[d] * wd;
    q[Q_SHADE] = t.shade[a] * wa + t.shade[b] * wb + t.shade[c] * wc + t.shade[d] * wd;
    q[Q_RELIEF] = t.relief[a] * wa + t.relief[b] * wb + t.relief[c] * wc + t.relief[d] * wd;
    q[Q_ROAD] = ad;
    q[Q_WATER] = t.waterDist[a] * wa + t.waterDist[b] * wb + t.waterDist[c] * wc + t.waterDist[d] * wd;
    q[Q_LANDFORM] = t.landform[a] * wa + t.landform[b] * wb + t.landform[c] * wc + t.landform[d] * wd;
    q[Q_TERRACE] = t.terrace[a] * wa + t.terrace[b] * wb + t.terrace[c] * wc + t.terrace[d] * wd;
    const water = t.waterKind[near];
    const fit = this.fit;
    const bands = lay.bands;
    let most = 0;
    for (let r = 0; r < n; r++) {
      let f = 0;
      const kinds = lay.kinds[r];
      // (a plant of the water competes in the shallows only, every other on dry ground only)
      if (lay.aquatic[r] === shallow && (kinds < 0 || (water !== 0 && (kinds & (1 << (water - 1))) !== 0))) {
        f = 1;
        for (let k = lay.from[r]; k < lay.from[r + 1]; k += 4) {
          const val = q[bands[k]];
          let w: number;
          if (val < bands[k + 1]) w = 1 - (bands[k + 1] - val) / bands[k + 3];
          else if (val > bands[k + 2]) w = 1 - (val - bands[k + 2]) / bands[k + 3];
          else continue;
          if (w <= 0) {
            f = 0;
            break;
          }
          f *= w * w * (3 - 2 * w);
        }
      }
      fit[r] = f;
      most += lay.per[r] * f * (lay.grove[r] > 0 ? 2 : 1);
    }
    if (dice >= most) return false;
    // the pick: each rule's numbers here, its groves counted in
    let acc = 0;
    let pick = -1;
    for (let r = 0; r < n; r++) {
      let p = lay.per[r] * fit[r];
      if (p <= 0) continue;
      if (lay.grove[r] > 0) {
        // groves: the same kind stands together and is absent between
        const g = fbm2(x / lay.grove[r], z / lay.grove[r], this.seed + 0x6a0 + lay.plants[r] * 17, 2);
        p *= 2 * smooth(0.5 + 1.6 * g);
      }
      // hedges: only along their lines
      if (lay.hedge[r] > 0) p *= hedgeAt(x, z, lay.hedge[r], this.seed);
      acc += p;
      if (dice < acc) {
        pick = r;
        break;
      }
    }
    if (pick < 0) return false;
    // the exact ground under it: its height, and once more that it is ground this plant may stand on
    if (!asked) this.world.shape(x, z, tp);
    if (tp.zone !== 0 || tp.site > 0.02 || tp.plot > 0.02) return false;
    const depth = tp.wl - tp.bed;
    if (lay.aquatic[pick] ? !(depth > 0.02 && depth <= AQUATIC_DEPTH) : depth > 0.02) return false;
    // (a plant of the benches: its own spot must be one, by the land's own height there)
    if (lay.bench[pick] && !onBench(tp.bed, t.step[near])) return false;
    if (!(rt > 0)) h2 = hash2(cz, cx, salt + 0x100);
    out.plant = lay.plants[pick];
    out.rule = pick;
    out.region = region;
    out.x = x;
    out.z = z;
    out.y = tp.bed;
    out.size = lay.size0[pick] + (lay.size1[pick] - lay.size0[pick]) * ((h2 & 0xff) / 255);
    out.yaw = (((h2 >>> 8) & 0xfff) / 4096) * 6.283185307179586;
    out.vary = ((h >>> 4) & 0xfff) / 4096;
    return true;
  }

  /**
   * The ground cover at (x, z): grass, flowers, bare ground, litter. Under trees the grass thins and the
   * litter comes; on steep or dry ground the bare shows; rows of flowers or crops run along the contour of
   * the land where the region grows them and the ground is level enough.
   *
   * `y` is the height of the ground there, for a caller that has it (the land's own, not the ecotope's):
   * on terraced country the rows then keep to the benches, which the ecotope's slope, measured over 16 m,
   * cannot tell from the hillside they are cut in. Without it the rows grow by that slope alone.
   */
  cover(x: number, z: number, out: Cover, y?: number): Cover {
    const e = this.eco.at(x, z, this.e);
    const t = this.tableOf(e.rt >= 0.5 ? e.rb : e.ra);
    const c = t.cover;
    if (e.flags & (ECO_ROAD | ECO_WET | ECO_SITE | ECO_PLOT)) {
      out.grass = out.height = out.flowers = out.hue = out.litter = 0;
      out.bare = e.flags & ECO_WET ? 0 : 1;
      return out;
    }
    const open = 1 - e.canopy;
    const steep = smooth((e.slope - 0.45) / 0.35);
    const dry = smooth((0.18 - e.moisture) / 0.18);
    const bare = Math.min(1, c.bare + 0.8 * steep + 0.35 * dry * (1 - c.grass));
    out.bare = bare;
    out.litter = e.canopy * (1 - bare);
    out.grass = c.grass * (0.35 + 0.65 * open) * (1 - bare) * (0.7 + 0.3 * e.moisture);
    out.height = c.height * (0.7 + 0.6 * e.moisture) * (0.6 + 0.4 * open);
    let fl = c.flowers * open * (1 - bare);
    let hueAt = fbm2(x / 46, z / 46, this.seed + 0x6b1, 2);
    if (c.rows && fl > 0) {
      if (e.slope > c.rows.maxSlope && !(y !== undefined && e.terrace >= BENCH_LAND[0] && onBench(y, e.step))) fl = 0;
      else {
        // rows across the x axis, bent a little by the land: one colour to a row
        const p = (z + 14 * fbm2(x / 180, z / 180, this.seed + 0x6b2, 2)) / c.rows.spacing;
        const k = Math.floor(p);
        const f = p - k;
        fl *= f < c.rows.share ? 1 : 0;
        hueAt = ((hash2(k, 0x6b3, this.seed) >>> 8) & 0xffff) / 32768 - 1;
      }
    }
    out.flowers = fl;
    const n = c.hues.length;
    out.hue = n === 0 ? 0 : c.hues[Math.min(n - 1, Math.max(0, Math.floor((0.5 + 0.8 * hueAt) * n)))];
    return out;
  }
}

/** every plant a table names, by layer, as ids (for the tests and the developer's preview) */
export function plantsOf(t: FloraTable): string[] {
  return [...new Set([...t.trees, ...t.shrubs, ...t.ground].map((r) => r.plant))];
}

/** what is wrong with a table (nothing: an empty list): a plant that does not exist or stands in the wrong layer, numbers out of range */
export function floraTableProblems(id: string, t: FloraTable): string[] {
  const bad: string[] = [];
  const layers: [string, readonly FloraRule[]][] = [
    ['tree', t.trees],
    ['shrub', t.shrubs],
    ['ground', t.ground],
  ];
  for (const [layer, rules] of layers) {
    for (const r of rules) {
      const i = plantIndex(r.plant);
      if (i < 0) bad.push(`${id}: no plant ${r.plant}`);
      else if (PLANTS[i].layer !== layer) bad.push(`${id}: ${r.plant} is a ${PLANTS[i].layer}, listed among the ${layer}s`);
      if (!(r.perHa > 0)) bad.push(`${id}: ${r.plant} has no numbers`);
      for (const b of [r.canopy, r.moisture, r.slope, r.shade, r.relief, r.water, r.road, r.landform, r.size]) if (b && !(b[1] >= b[0])) bad.push(`${id}: ${r.plant} has a band upside down`);
    }
  }
  if (t.eco.wood < 0 || t.eco.wood > 1) bad.push(`${id}: wood is 0 to 1`);
  if (t.cover.grass < 0 || t.cover.grass > 1 || t.cover.flowers < 0 || t.cover.flowers > 1 || t.cover.bare < 0 || t.cover.bare > 1) bad.push(`${id}: cover shares are 0 to 1`);
  return bad;
}
