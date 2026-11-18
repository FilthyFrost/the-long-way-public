/**
 * The ecotope field (docs/V3/nodes/W2-flora.md): what kind of spot each place in the world is for a plant —
 * how steep, how shaded, how wet, how far from water and from the road, how much under trees. One answer for
 * everything that asks: the vegetation (flora.ts), foraging, later the animals' ranges and the fish's banks.
 *
 * It is computed in tiles of 128 m on an 8 m grid, each tile once, kept in a bounded cache: the land function
 * costs about a microsecond a call, so slopes and hollows come from differences on the grid, not from more
 * calls. A tile is a pure function of the world and its place: thrown out of the cache and computed again it
 * is the same, and the order in which tiles are asked for never matters.
 *
 * Pure, no three, no DOM. (Like the land function itself it is deterministic for one JavaScript engine; the
 * last bits of a height may differ between engines.)
 */
import { fbm2 } from '../math/noise';
import { TerrainPoint, type World } from './terrain';

/** the side of a tile (m), the grid's step (m), and the nodes along a side (both ends counted) */
export const ECO_TILE = 128;
export const ECO_STEP = 8;
export const ECO_N = ECO_TILE / ECO_STEP + 1;
const NODES = ECO_N * ECO_N;
/** the grid with one more ring of nodes round it, for differences at the edge */
const WIDE = ECO_N + 2;

/** water farther than this is not felt (m) */
export const WATER_FAR = 150;

/** what a node may be besides land that plants can stand on */
export const ECO_ROAD = 1;
export const ECO_WET = 2;
export const ECO_SITE = 4;
export const ECO_PLOT = 8;

/** nothing grows this near the road's centre line (m): the pavement, the shoulder, the ditch */
export const ROAD_CLEAR = 7.5;

/** how a region's country is wooded and how wet it is, where nothing else speaks (a region carries one of these) */
export interface EcoParams {
  /** how much of the land is under trees: 0 none, 0.5 about half, 1 nearly all */
  readonly wood: number;
  /** the size of the woods' patches (m) */
  readonly woodScale: number;
  /** woods keep this far from the road (m), and are at their thickest only `edge` m further out */
  readonly clear: number;
  readonly edge: number;
  /** relief (m above the road's base) where the woods thin out and where they end; null: no tree line */
  readonly treeline: readonly [number, number] | null;
  /** how much trees crowd to the water in country otherwise open: 0 not at all … 1 a wood along every bank */
  readonly thirsty: number;
  /** the land's moisture where nothing else speaks, 0 dry … 1 wet */
  readonly moist: number;
}

/** the ecotope at one point (EcotopeField.at fills one of these) */
export class Ecotope {
  /** height of the land (m) */
  h = 0;
  /** metres from the road's centre line */
  ad = 0;
  /** rise over run */
  slope = 0;
  /** 0 a slope in the sun … 1 one turned away from it (level ground 0.5) */
  shade = 0.5;
  /** −1 a knoll … 1 a hollow */
  hollow = 0;
  /** metres to the nearest water's edge (WATER_FAR and beyond: none near), and which water: 0 none, 1 lake, 2 river, 3 sea */
  waterDist = WATER_FAR;
  waterKind = 0;
  /** 0 open … 1 under closed wood */
  canopy = 0;
  /** 0 dry … 1 wet */
  moisture = 0;
  /** metres above the road's base */
  relief = 0;
  /** ECO_ROAD, ECO_WET, ECO_SITE, ECO_PLOT of the nearest node */
  flags = 0;
  /** the regions that meet here (indices in the registry) and how far it is the second's (0 … 1) */
  ra = 0;
  rb = 0;
  rt = 0;
}

/** one tile of the field: its values at the grid's nodes, row by row (z outer, x inner) */
export class EcoTile {
  readonly h = new Float32Array(NODES);
  readonly ad = new Float32Array(NODES);
  readonly slope = new Float32Array(NODES);
  readonly shade = new Float32Array(NODES);
  readonly hollow = new Float32Array(NODES);
  readonly waterDist = new Float32Array(NODES);
  readonly canopy = new Float32Array(NODES);
  readonly moisture = new Float32Array(NODES);
  readonly relief = new Float32Array(NODES);
  readonly flags = new Uint8Array(NODES);
  readonly waterKind = new Uint8Array(NODES);
  readonly ra = new Uint8Array(NODES);
  readonly rb = new Uint8Array(NODES);
  readonly rt = new Float32Array(NODES);
  /** when it was last asked for (the cache drops the longest unasked) */
  used = 0;

  constructor(
    readonly tx: number,
    readonly tz: number,
  ) {}
}

/** how far (m) a point is from the nearest water's edge and which water it is (0 none); beyond WATER_FAR it may say WATER_FAR */
export type ShoreReader = (x: number, z: number, s: number, out: { dist: number; kind: number }) => void;

function smooth(t: number): number {
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
}

/**
 * How much of the sky the trees close at a point, 0 … 1, for a region's parameters: patches of wood where a
 * slow noise is high (how high, `wood` says), kept back from the road, thinning to the tree line, and crowding
 * to the water where the country is `thirsty`.
 */
export function canopyAt(p: EcoParams, seed: number, x: number, z: number, ad: number, relief: number, waterDist: number): number {
  if (ad < p.clear || p.woodScale <= 0) return 0;
  const n = fbm2(x / p.woodScale, z / p.woodScale, seed + 0x5c1, 3);
  // (the noise lies mostly within ±0.6: `wood` 0.5 puts the threshold at its middle)
  const t = (0.5 - p.wood) * 1.1;
  let c = smooth((n - t + 0.11) / 0.22);
  if (p.thirsty > 0 && waterDist < WATER_FAR) {
    const bank = p.thirsty * (1 - smooth((waterDist - 5) / 60));
    if (bank > c) c = bank;
  }
  if (c <= 0) return 0;
  // the wood's edge wanders: a ragged line, not one parallel to the road
  const e = smooth((ad + 9 * fbm2(x / 55, z / 55, seed + 0x5c2, 2) - p.clear) / p.edge);
  let k = c * e;
  if (p.treeline) k *= 1 - smooth((relief - p.treeline[0]) / (p.treeline[1] - p.treeline[0]));
  return k;
}

/** how wet a spot is, 0 … 1: the region's own, wetter by water, in a hollow and in the shade, drier on a steep slope, with a slow patchiness */
export function moistureAt(p: EcoParams, seed: number, x: number, z: number, slope: number, shade: number, hollow: number, waterDist: number): number {
  const q = waterDist / 26;
  const m = p.moist + 0.44 / (1 + q * q) + 0.2 * hollow + 0.24 * (shade - 0.5) - 0.7 * (slope > 0.12 ? slope - 0.12 : 0) + 0.16 * fbm2(x / 210, z / 210, seed + 0x5c3, 2);
  return m < 0 ? 0 : m > 1 ? 1 : m;
}

/**
 * The field over a world. `paramsOf(region)` gives a region's EcoParams by its registry index; `shore`, when
 * given, is the water's own account of how far its edge is (exact across tiles); without it the tile measures
 * to the wet nodes it can see, which is good within a tile and blind beyond its rim.
 */
export class EcotopeField {
  private readonly tiles = new Map<number, EcoTile>();
  private clock = 0;
  private readonly tp = new TerrainPoint();
  private readonly H = new Float64Array(WIDE * WIDE);
  private readonly shoreOut = { dist: WATER_FAR, kind: 0 };

  constructor(
    private readonly world: World,
    private readonly paramsOf: (region: number) => EcoParams,
    private readonly shore: ShoreReader | null = null,
    /** how many tiles are kept */
    private readonly cap = 320,
  ) {}

  /** how many tiles are in the cache now (for the tests and the budget's report) */
  get size(): number {
    return this.tiles.size;
  }

  /** the tile whose corner is at (tx, tz) × ECO_TILE */
  tile(tx: number, tz: number): EcoTile {
    // (tiles within ±2^15 of the origin each way: 4,000 km of road and more)
    const key = (tx + 32768) * 65536 + (tz + 32768);
    let t = this.tiles.get(key);
    if (!t) {
      if (this.tiles.size >= this.cap) this.evict();
      t = this.build(new EcoTile(tx, tz));
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

  private build(t: EcoTile): EcoTile {
    const w = this.world;
    const tp = this.tp;
    const H = this.H;
    const x0 = t.tx * ECO_TILE;
    const z0 = t.tz * ECO_TILE;
    const seed = w.seed;
    // heights on the wide grid; everything else the land function says, at the tile's own nodes
    for (let j = -1; j <= ECO_N; j++) {
      for (let i = -1; i <= ECO_N; i++) {
        const x = x0 + i * ECO_STEP;
        const z = z0 + j * ECO_STEP;
        w.shape(x, z, tp);
        H[(j + 1) * WIDE + i + 1] = tp.bed;
        if (i < 0 || j < 0 || i >= ECO_N || j >= ECO_N) continue;
        const n = j * ECO_N + i;
        const ad = tp.d < 0 ? -tp.d : tp.d;
        t.h[n] = tp.bed;
        t.ad[n] = ad;
        t.relief[n] = tp.relief;
        const wet = tp.wl > tp.bed + 0.02;
        t.flags[n] = (ad < ROAD_CLEAR || tp.zone !== 0 ? ECO_ROAD : 0) | (wet ? ECO_WET : 0) | (tp.site > 0.02 ? ECO_SITE : 0) | (tp.plot > 0.02 ? ECO_PLOT : 0);
        t.waterKind[n] = wet ? tp.wkind : 0;
        t.ra[n] = tp.ba;
        t.rb[n] = tp.bb;
        t.rt[n] = tp.bt;
        if (this.shore) {
          this.shore(x, z, tp.s, this.shoreOut);
          t.waterDist[n] = wet ? 0 : this.shoreOut.dist < WATER_FAR ? this.shoreOut.dist : WATER_FAR;
          if (!wet) t.waterKind[n] = this.shoreOut.dist < WATER_FAR ? this.shoreOut.kind : 0;
        } else t.waterDist[n] = wet ? 0 : WATER_FAR;
      }
    }
    if (!this.shore) this.spreadWater(t);
    // slope, shade and hollow by differences; then the canopy and the moisture, which read them
    for (let j = 0; j < ECO_N; j++) {
      for (let i = 0; i < ECO_N; i++) {
        const n = j * ECO_N + i;
        const c = (j + 1) * WIDE + i + 1;
        const gx = (H[c + 1] - H[c - 1]) / (2 * ECO_STEP);
        const gz = (H[c + WIDE] - H[c - WIDE]) / (2 * ECO_STEP);
        const slope = Math.sqrt(gx * gx + gz * gz);
        t.slope[n] = slope;
        // the sun stands towards +z at noon (core/env/time.ts): land that rises towards +z faces away from it
        const sh = 0.5 + 2.2 * gz;
        t.shade[n] = sh < 0 ? 0 : sh > 1 ? 1 : sh;
        const lap = (H[c + 1] + H[c - 1] + H[c + WIDE] + H[c - WIDE] - 4 * H[c]) / (ECO_STEP * ECO_STEP);
        const ho = lap * 10;
        t.hollow[n] = ho < -1 ? -1 : ho > 1 ? 1 : ho;
        const x = x0 + i * ECO_STEP;
        const z = z0 + j * ECO_STEP;
        const pa = this.paramsOf(t.ra[n]);
        let canopy = canopyAt(pa, seed + t.ra[n] * 131, x, z, t.ad[n], t.relief[n], t.waterDist[n]);
        let moist = moistureAt(pa, seed, x, z, slope, t.shade[n], t.hollow[n], t.waterDist[n]);
        const mix = t.rt[n];
        if (mix > 0 && t.rb[n] !== t.ra[n]) {
          const pb = this.paramsOf(t.rb[n]);
          canopy += (canopyAt(pb, seed + t.rb[n] * 131, x, z, t.ad[n], t.relief[n], t.waterDist[n]) - canopy) * mix;
          moist += (moistureAt(pb, seed, x, z, slope, t.shade[n], t.hollow[n], t.waterDist[n]) - moist) * mix;
        }
        if (t.flags[n] & (ECO_WET | ECO_ROAD)) canopy = 0;
        t.canopy[n] = canopy;
        t.moisture[n] = t.flags[n] & ECO_WET ? 1 : moist;
      }
    }
    return t;
  }

  /** without the water's own account: distances from the wet nodes of this tile, by two sweeps over the grid */
  private spreadWater(t: EcoTile): void {
    const d = t.waterDist;
    const k = t.waterKind;
    const D = ECO_STEP * 1.41421356;
    const relax = (n: number, m: number, step: number): void => {
      if (d[m] + step < d[n]) {
        d[n] = d[m] + step;
        k[n] = k[m];
      }
    };
    for (let j = 0; j < ECO_N; j++) {
      for (let i = 0; i < ECO_N; i++) {
        const n = j * ECO_N + i;
        if (i > 0) relax(n, n - 1, ECO_STEP);
        if (j > 0) relax(n, n - ECO_N, ECO_STEP);
        if (i > 0 && j > 0) relax(n, n - ECO_N - 1, D);
        if (i < ECO_N - 1 && j > 0) relax(n, n - ECO_N + 1, D);
      }
    }
    for (let j = ECO_N - 1; j >= 0; j--) {
      for (let i = ECO_N - 1; i >= 0; i--) {
        const n = j * ECO_N + i;
        if (i < ECO_N - 1) relax(n, n + 1, ECO_STEP);
        if (j < ECO_N - 1) relax(n, n + ECO_N, ECO_STEP);
        if (i < ECO_N - 1 && j < ECO_N - 1) relax(n, n + ECO_N + 1, D);
        if (i > 0 && j < ECO_N - 1) relax(n, n + ECO_N - 1, D);
      }
    }
    for (let n = 0; n < NODES; n++) if (d[n] >= WATER_FAR) k[n] = 0;
  }

  /** the ecotope at (x, z): the tile's nodes round the point, weighed by how near each is; allocates nothing once the tile is there */
  at(x: number, z: number, out: Ecotope): Ecotope {
    const tx = Math.floor(x / ECO_TILE);
    const tz = Math.floor(z / ECO_TILE);
    const t = this.tile(tx, tz);
    const fx = (x - tx * ECO_TILE) / ECO_STEP;
    const fz = (z - tz * ECO_TILE) / ECO_STEP;
    let i = Math.floor(fx);
    let j = Math.floor(fz);
    if (i > ECO_N - 2) i = ECO_N - 2;
    if (j > ECO_N - 2) j = ECO_N - 2;
    const u = fx - i;
    const v = fz - j;
    const a = j * ECO_N + i;
    const b = a + 1;
    const c = a + ECO_N;
    const d = c + 1;
    const wa = (1 - u) * (1 - v);
    const wb = u * (1 - v);
    const wc = (1 - u) * v;
    const wd = u * v;
    out.h = t.h[a] * wa + t.h[b] * wb + t.h[c] * wc + t.h[d] * wd;
    out.ad = t.ad[a] * wa + t.ad[b] * wb + t.ad[c] * wc + t.ad[d] * wd;
    out.slope = t.slope[a] * wa + t.slope[b] * wb + t.slope[c] * wc + t.slope[d] * wd;
    out.shade = t.shade[a] * wa + t.shade[b] * wb + t.shade[c] * wc + t.shade[d] * wd;
    out.hollow = t.hollow[a] * wa + t.hollow[b] * wb + t.hollow[c] * wc + t.hollow[d] * wd;
    out.waterDist = t.waterDist[a] * wa + t.waterDist[b] * wb + t.waterDist[c] * wc + t.waterDist[d] * wd;
    out.canopy = t.canopy[a] * wa + t.canopy[b] * wb + t.canopy[c] * wc + t.canopy[d] * wd;
    out.moisture = t.moisture[a] * wa + t.moisture[b] * wb + t.moisture[c] * wc + t.moisture[d] * wd;
    out.relief = t.relief[a] * wa + t.relief[b] * wb + t.relief[c] * wc + t.relief[d] * wd;
    // what is not a quantity is the nearest node's
    const near = u < 0.5 ? (v < 0.5 ? a : c) : v < 0.5 ? b : d;
    out.flags = t.flags[near];
    out.waterKind = t.waterKind[near];
    out.ra = t.ra[near];
    out.rb = t.rb[near];
    out.rt = t.rt[near];
    return out;
  }
}
