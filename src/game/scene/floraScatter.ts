/**
 * The plants of a scatter tile in a world of version 2 (docs/V3/nodes/W2-flora.md): what the flora field of
 * the core stands there (core/world/flora.ts `FloraField.tile`) — trees, shrubs, and the rocks, boulders,
 * logs, stumps and flower clumps of the ground layer — packed for drawing. Nothing is decided here: where a
 * plant stands, how big it is and how it is turned are the core's; this file only says how each is drawn
 * (plantRegistry.ts) and sets it on the ground.
 *
 * A tile is drawn at one of three levels: near (every plant in its full model), mid (the trees and the larger
 * shrubs in their far models) and far (the trees in their far models). Each level is one or two instanced
 * draws, whatever the number of kinds: see plantRegistry.ts.
 *
 * Per instance, four attributes of four numbers (render/floraMaterial.ts reads them):
 *   aPlace  where it stands in the tile (x, y, z) and its turn (rad)
 *   aShape  its scale across and up, the first vertex of its model in the atlas, and how many vertices it has
 *   aLook   the two palette slots of its spot (a + 4 b), the share of the second plus 2 if it bears plus 4 if
 *           it is evergreen, its first colour (0xRRGGBB, −1: the region's palette) and its second
 *   aLie    the slope of the ground under it along x and along z (a low plant lies with it; 0 for a tree, which
 *           stands plumb), its own number 0 … 1, and its lean out of plumb
 *
 * DOM-free, and deterministic: a tile comes out the same whenever it is built.
 */
import { BIOMES } from '../../core/world/biomes';
import { ECO_N, ECO_SQ, ECO_STEP, ECO_TILE } from '../../core/world/ecotope';
import { LAYER_GROUND, LAYER_SHRUB, LAYER_TREE, type FloraLayer } from '../../core/world/flora';
import { floraTableOf } from '../../core/world/floraTables';
import { PLANTS, bearsAt, plantIndex, type PlantDef } from '../../core/world/plants';
import { TerrainPoint, type World } from '../../core/world/terrain';
import { globals } from '../render/shaderlib';
import type { AtlasModel, PlantClass, PlantDraw, PlantRegistry } from './plantRegistry';

export const LOD_NEAR = 0;
export const LOD_MID = 1;
export const LOD_FAR = 2;
export type FloraLod = 0 | 1 | 2;

export interface FloraBatch {
  cls: PlantClass;
  count: number;
  place: Float32Array;
  shape: Float32Array;
  look: Float32Array;
  lie: Float32Array;
  /** vertices drawn per plant: as many as the largest model among them has */
  verts: number;
  /** the triangles of the models themselves (what is drawn without the padding) */
  triangles: number;
  /** the lowest foot and the highest top among them, against the tile's origin (m) */
  minY: number;
  maxY: number;
}

export interface FloraScatter {
  batches: FloraBatch[];
  /** soft discs on the ground under the near plants, where no shadow map is drawn: a matrix each (null: none asked for) */
  discs: Float32Array | null;
  discCount: number;
  /** the tile's origin in the world */
  wx: number;
  wy: number;
  wz: number;
}

/** the most plants a tile's draw can hold: the trees' cells, and the shrubs' and the ground's together */
const MOST: Record<PlantClass, number> = { tree: 256, small: 256 + 1024 };

class Gather {
  n = 0;
  verts = 0;
  triangles = 0;
  minY = Infinity;
  maxY = -Infinity;
  readonly place: Float32Array;
  readonly shape: Float32Array;
  readonly look: Float32Array;
  readonly lie: Float32Array;

  constructor(readonly cls: PlantClass) {
    const most = MOST[cls];
    this.place = new Float32Array(most * 4);
    this.shape = new Float32Array(most * 4);
    this.look = new Float32Array(most * 4);
    this.lie = new Float32Array(most * 4);
  }

  reset(): void {
    this.n = 0;
    this.verts = 0;
    this.triangles = 0;
    this.minY = Infinity;
    this.maxY = -Infinity;
  }

  batch(): FloraBatch {
    const k = this.n * 4;
    return { cls: this.cls, count: this.n, place: this.place.slice(0, k), shape: this.shape.slice(0, k), look: this.look.slice(0, k), lie: this.lie.slice(0, k), verts: this.verts, triangles: this.triangles, minY: this.minY, maxY: this.maxY };
  }
}

const gather: Record<PlantClass, Gather> = { tree: new Gather('tree'), small: new Gather('small') };
const discScratch = new Float32Array((256 + 256 + 1024) * 16);
const tp = new TerrainPoint();

/** the palette slots across a tile: asked of the land on a grid this coarse (m), the nearest answer serves a plant */
const SLOT_STEP = 32;
const SLOT_N = ECO_TILE / SLOT_STEP + 1;
const slotPair = new Float32Array(SLOT_N * SLOT_N);
const slotShare = new Float32Array(SLOT_N * SLOT_N);
const slotA = new Int32Array(SLOT_N * SLOT_N);
const slotB = new Int32Array(SLOT_N * SLOT_N);

/** the flower colours of each region's ground cover, by registry index (for the flower clumps that have no colour of their own) */
const hues: (readonly number[])[] = [];
function huesOf(region: number): readonly number[] {
  let h = hues[region];
  if (!h) {
    const b = BIOMES[region] ?? BIOMES[0];
    h = hues[region] = floraTableOf(b.id, b.kin).cover.hues;
  }
  return h;
}

/**
 * One plant into a draw: set on its ground at (x, y, z) of the tile (y: the land under it), at its size and turn.
 * Returns its scale across.
 */
function put(g: Gather, d: PlantDraw, plant: PlantDef, model: AtlasModel, near: boolean, x: number, y: number, z: number, size: number, vary: number, yaw: number, gx: number, gz: number, pair: number, share: number, region: number, bearing: boolean | null = null): number {
  const fam = d.family;
  const o = g.n * 4;
  // a little of its own in its girth; its height is the core's to the centimetre
  const sxz = (near ? d.kx : d.fkx) * size * (0.92 + 0.16 * ((vary * 7.31) % 1));
  const sy = (near ? d.ky : d.fky) * size;
  let foot = y - (fam.sink ?? 0);
  if (fam.lies) {
    g.lie[o] = gx < -1.5 ? -1.5 : gx > 1.5 ? 1.5 : gx;
    g.lie[o + 1] = gz < -1.5 ? -1.5 : gz > 1.5 ? 1.5 : gz;
  } else {
    // a tree stands plumb: sunk until the low side of its foot is in the ground
    foot -= Math.min(1.2, Math.sqrt(gx * gx + gz * gz)) * Math.max(0.15, plant.trunk * size);
    g.lie[o] = 0;
    g.lie[o + 1] = 0;
  }
  g.lie[o + 2] = vary;
  g.lie[o + 3] = fam.lean ?? 0;
  g.place[o] = x;
  g.place[o + 1] = foot;
  g.place[o + 2] = z;
  g.place[o + 3] = fam.turn === 'row' ? (vary - 0.5) * 0.14 : fam.turn === 'sun' ? (vary - 0.5) * 0.5 : yaw;
  g.shape[o] = sxz;
  g.shape[o + 1] = sy;
  g.shape[o + 2] = model.first;
  g.shape[o + 3] = model.count;
  const bears = (bearing ?? (d.showsFruit && bearsAt(plant, vary) !== null)) ? 2 : 0;
  g.look[o] = pair;
  g.look[o + 1] = share * 0.999 + bears + d.evergreen;
  g.look[o + 2] = d.tintA;
  let second = d.tintB;
  if (d.regionAccent) {
    const hs = huesOf(region);
    if (hs.length) second = hs[Math.min(hs.length - 1, Math.floor(vary * hs.length))];
  }
  g.look[o + 3] = second;
  g.n++;
  if (model.count > g.verts) g.verts = model.count;
  g.triangles += model.count / 3;
  const top = foot + plant.height * size + 1;
  if (foot - 1 < g.minY) g.minY = foot - 1;
  if (top > g.maxY) g.maxY = top;
  return sxz;
}

/** a plant set out by hand (floraSheet): which, where against the sheet's origin (m; y: the ground under it), and how */
export interface SheetPlant {
  plant: string;
  x: number;
  y: number;
  z: number;
  /** its far model (default: its near one) */
  far?: boolean;
  /** it bears (default: by its own number, as in the world) */
  bears?: boolean;
  size?: number;
  yaw?: number;
  vary?: number;
  /** the region whose palette paints it (registry index; default 0), in palette slot `slot` (default 0) */
  region?: number;
  slot?: number;
}

/**
 * Plants set out by hand, as the draws of one tile: for looking at the models side by side (the browser
 * script's sheet) and for tests. Not how the world is drawn: that is buildFloraScatter.
 */
export function floraSheet(reg: PlantRegistry, list: readonly SheetPlant[]): FloraBatch[] {
  gather.tree.reset();
  gather.small.reset();
  for (const it of list) {
    const pi = plantIndex(it.plant);
    if (pi < 0) throw new Error(`no plant ${it.plant}`);
    const d = reg.draws[pi];
    const model = it.far ? d.far : d.near;
    if (!d.drawn || !model) continue;
    put(gather[d.cls], d, PLANTS[pi], model, !it.far, it.x, it.y, it.z, it.size ?? 1, it.vary ?? 0.4, it.yaw ?? 0, 0, 0, it.slot ?? 0, 0, it.region ?? 0, it.bears ?? null);
  }
  const out: FloraBatch[] = [];
  if (gather.tree.n > 0) out.push(gather.tree.batch());
  if (gather.small.n > 0) out.push(gather.small.batch());
  return out;
}

/**
 * The plants of tile (tx, tz) at a level of detail, ready to draw. `discs`: also the soft ground discs of the
 * near plants (for a renderer without shadow maps). The world must be of version 2 (it has a flora field).
 */
export function buildFloraScatter(world: World, reg: PlantRegistry, tx: number, tz: number, lod: FloraLod, discs = false): FloraScatter {
  const flora = world.flora;
  const eco = world.eco;
  if (!flora || !eco) throw new Error('a world of version 1 has no flora field: its scatter is buildScatter');
  const x0 = tx * ECO_TILE;
  const z0 = tz * ECO_TILE;
  const et = eco.tile(tx, tz);
  const H = et.h;
  // (the tile's origin: the land at its middle node)
  const oy = H[(ECO_SQ / 2) * ECO_N + ECO_SQ / 2];
  // which palettes the tile's ground is painted from, on a coarse grid
  for (let j = 0; j < SLOT_N; j++) {
    for (let i = 0; i < SLOT_N; i++) {
      world.shape(x0 + i * SLOT_STEP, z0 + j * SLOT_STEP, tp);
      const k = j * SLOT_N + i;
      slotPair[k] = (tp.ca & 3) + 4 * (tp.cb & 3);
      slotShare[k] = tp.bt;
      slotA[k] = tp.ba;
      slotB[k] = tp.bb;
    }
  }
  const sun = globals.uSunDir.value;
  let nd = 0;
  gather.tree.reset();
  gather.small.reset();
  const layers: FloraLayer[] = lod === LOD_NEAR ? [LAYER_TREE, LAYER_SHRUB, LAYER_GROUND] : lod === LOD_MID ? [LAYER_TREE, LAYER_SHRUB] : [LAYER_TREE];
  const near = lod === LOD_NEAR;
  for (const layer of layers) {
    const t = flora.tile(layer, tx, tz);
    for (let i = 0; i < t.n; i++) {
      const pi = t.plant[i];
      const d = reg.draws[pi];
      if (!d.drawn) continue;
      const model = near ? d.near : d.far;
      if (!model) continue;
      const g = gather[d.cls];
      if (g.n >= MOST[d.cls]) continue;
      const plant = PLANTS[pi];
      const x = t.x[i];
      const z = t.z[i];
      const size = t.size[i];
      const vary = t.vary[i];
      // the ground under it: its slope from the ecotope's heights round it
      const fx = (x - x0) / ECO_STEP;
      const fz = (z - z0) / ECO_STEP;
      const ci = fx < 0 ? 0 : fx >= ECO_SQ ? ECO_SQ - 1 : Math.floor(fx);
      const cj = fz < 0 ? 0 : fz >= ECO_SQ ? ECO_SQ - 1 : Math.floor(fz);
      const u = fx - ci;
      const v = fz - cj;
      const a = cj * ECO_N + ci;
      const gx = ((H[a + 1] - H[a]) * (1 - v) + (H[a + ECO_N + 1] - H[a + ECO_N]) * v) / ECO_STEP;
      const gz = ((H[a + ECO_N] - H[a]) * (1 - u) + (H[a + ECO_N + 1] - H[a + 1]) * u) / ECO_STEP;
      const si = Math.min(SLOT_N - 1, Math.max(0, Math.round((x - x0) / SLOT_STEP)));
      const sj = Math.min(SLOT_N - 1, Math.max(0, Math.round((z - z0) / SLOT_STEP)));
      const sk = sj * SLOT_N + si;
      // its palette: of the region whose table stood it, where two regions meet
      const region = t.region[i];
      const share = slotA[sk] === slotB[sk] ? slotShare[sk] : region === slotB[sk] ? 1 : region === slotA[sk] ? 0 : slotShare[sk];
      const sxz = put(g, d, plant, model, near, x - x0, t.y[i] - oy, z - z0, size, vary, t.yaw[i], gx, gz, slotPair[sk], share, region);
      // a soft shadow disc on the ground, pushed away from the sun (as the first renderer's)
      if (discs && near && d.family.shadow > 0) {
        const r = d.family.shadow * sxz;
        const m = nd * 16;
        discScratch.fill(0, m, m + 16);
        discScratch[m] = r * 2.3;
        discScratch[m + 5] = 1;
        discScratch[m + 10] = r * 2.3;
        discScratch[m + 12] = x - x0 - sun.x * r * 0.6;
        discScratch[m + 13] = t.y[i] - oy + 0.12;
        discScratch[m + 14] = z - z0 - sun.z * r * 0.6;
        discScratch[m + 15] = 1;
        nd++;
      }
    }
  }
  const batches: FloraBatch[] = [];
  if (gather.tree.n > 0) batches.push(gather.tree.batch());
  if (gather.small.n > 0) batches.push(gather.small.batch());
  return { batches, discs: discs && nd > 0 ? discScratch.slice(0, nd * 16) : null, discCount: nd, wx: x0, wy: oy, wz: z0 };
}
