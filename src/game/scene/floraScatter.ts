/**
 * The plants of a scatter tile in a world of version 2 (docs/V3/nodes/W2-flora.md): what the flora field of
 * the core stands there (core/world/flora.ts `FloraField.tile`) — trees, shrubs, and the rocks, boulders,
 * logs, stumps and flower clumps of the ground layer — packed for drawing. Nothing is decided here: where a
 * plant stands, how big it is and how it is turned are the core's; this file only says how each is drawn
 * (plantRegistry.ts) and sets it on the ground.
 *
 * A tile is drawn at one of four levels: near (every plant in its full model), close (the same), mid (the trees
 * and the larger shrubs in their far models) and far (the trees alone, in their smallest models). In a tile of
 * thick wood the trees that stand inside the wood — under closed canopy, behind its edge and under its roof,
 * where the eye sees their tops at most — are drawn a level lower than the trees of its edge from the close
 * level on, and at the far level every other one of them is left to the far-woods cards that stand in the
 * same wood: a forest has more than twice the trees of the first renderer's, and its edge is what one sees.
 * Each level is
 * a few instanced draws, whatever the number of kinds (plantRegistry.ts): one for the trees and one for the
 * small plants, each cut in two where its models differ so much in size that drawing them all with the
 * largest one's vertex count would waste more than a second draw costs.
 *
 * Per instance, four attributes of four numbers (render/floraMaterial.ts reads them):
 *   aPlace  where it stands in the tile (x, y, z) and its turn (rad)
 *   aShape  its scale across and up, the first vertex of its model in the atlas, and how many vertices it has
 *   aLook   the two palette slots of its spot (a + 4 b) + settled snow / 4, the share of the second plus 2 if it bears plus 4 if
 *           it is evergreen or 8 for deciduous wood (atlas), its first colour (0xRRGGBB, −1: the region's palette) and its second
 *   aLie    the slope of the ground under it along x and along z (a low plant lies with it; 0 for a tree, which
 *           stands plumb), its own number 0 … 1, and its lean out of plumb
 *
 * DOM-free, and deterministic: a tile comes out the same whenever it is built.
 */
import { groundField } from '../../core/world/groundField';
import { groundProfile } from '../../core/world/groundTables';
import { smoothstep } from '../../core/math/util';
import { Surface } from '../../core/world/ground';
import { BIOMES } from '../../core/world/biomes';
import { ECO_N, ECO_SQ, ECO_STEP, ECO_TILE } from '../../core/world/ecotope';
import { LAYER_GROUND, LAYER_SHRUB, LAYER_TREE, type FloraLayer, type FloraTile } from '../../core/world/flora';
import { floraTableOf } from '../../core/world/floraTables';
import { PLANTS, bearsAt, plantIndex, type PlantDef } from '../../core/world/plants';
import { TerrainPoint, type World } from '../../core/world/terrain';
import { globals } from '../render/shaderlib';
import { paintedFamily, CROWN_PAINT } from './crowns/palette';
import { CROWN_STRIDE, type CrownLookup } from './crowns/crownData';
import { TEA_ROWS } from './plantModels';
import type { AtlasModel, PlantClass, PlantDraw, PlantRegistry } from './plantRegistry';

export const LOD_NEAR = 0;
export const LOD_CLOSE = 1;
export const LOD_MID = 2;
export const LOD_FAR = 3;
export type FloraLod = 0 | 1 | 2 | 3;
/** a tile with more trees than this is thick wood, and a tree of it under at least this much canopy stands inside the wood */
export const DENSE_TREES = 100;
export const INSIDE_CANOPY = 0.8;
/** a draw is cut in two by model size only if that saves this share of its vertices, and at least this many */
const SPLIT_SHARE = 0.15;
const SPLIT_VERTS = 9000;

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
  groundBatches: FloraBatch[];
  /**
   * At the close level: the tile's trees once more, each in its far model, to throw the tile's shadows instead
   * of the draws above (a shadow some 150 m off does not need a tree's four hundred triangles); else null,
   * and the draws above throw their own shadows where they throw any
   */
  shadows: FloraBatch | null;
  /** soft discs on the ground under the near plants, where no shadow map is drawn: a matrix each (null: none asked for) */
  discs: Float32Array | null;
  discCount: number;
  /**
   * The trees (and, at the two nearest levels, the shrubs) whose family is drawn as a painted crown
   * (scene/crowns/crownView.ts), handed over instead of drawn here: CROWN_STRIDE numbers each, world
   * coordinates (null: none, or no crowns were asked for)
   */
  crowns: Float32Array | null;
  crownCount: number;
  /** the tile's origin in the world */
  wx: number;
  wy: number;
  wz: number;
}

/** the most plants a tile's draw can hold: the trees' cells, and the shrubs' (a plant of rows is up to three rows) and the ground's together */
const MOST: Record<PlantClass, number> = { tree: 256, small: 256 * 3 + 1024 };

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

  /** the instances whose model has between lo and hi vertices, as one draw */
  private cut(lo: number, hi: number, count: number): FloraBatch {
    const place = new Float32Array(count * 4);
    const shape = new Float32Array(count * 4);
    const look = new Float32Array(count * 4);
    const lie = new Float32Array(count * 4);
    let k = 0;
    let verts = 0;
    let triangles = 0;
    for (let i = 0; i < this.n; i++) {
      const v = this.shape[i * 4 + 3];
      if (v < lo || v > hi) continue;
      for (let c = 0; c < 4; c++) {
        place[k * 4 + c] = this.place[i * 4 + c];
        shape[k * 4 + c] = this.shape[i * 4 + c];
        look[k * 4 + c] = this.look[i * 4 + c];
        lie[k * 4 + c] = this.lie[i * 4 + c];
      }
      k++;
      if (v > verts) verts = v;
      triangles += v / 3;
    }
    return { cls: this.cls, count, place, shape, look, lie, verts, triangles, minY: this.minY, maxY: this.maxY };
  }

  /** what was gathered, as one draw */
  whole(out: FloraBatch[]): void {
    if (this.n > 0) out.push(this.cut(0, Infinity, this.n));
  }

  /**
   * What was gathered, as one draw or as two. Every plant of a draw is drawn with as many vertices as its
   * largest model has: where small models and large ones stand together, the draw is cut where that saves
   * most (the models by size: the large ones in one draw, the rest in another).
   */
  batches(out: FloraBatch[]): void {
    if (this.n === 0) return;
    // how many instances there are of each model size, largest first
    let kinds = 0;
    for (let i = 0; i < this.n; i++) {
      const v = this.shape[i * 4 + 3];
      let k = 0;
      while (k < kinds && sizes[k] !== v) k++;
      if (k === kinds) {
        sizes[kinds] = v;
        counts[kinds++] = 0;
      }
      counts[k]++;
    }
    for (let a = 1; a < kinds; a++) {
      for (let c = a; c > 0 && sizes[c] > sizes[c - 1]; c--) {
        const sv = sizes[c];
        sizes[c] = sizes[c - 1];
        sizes[c - 1] = sv;
        const cv = counts[c];
        counts[c] = counts[c - 1];
        counts[c - 1] = cv;
      }
    }
    const whole = sizes[0] * this.n;
    let best = whole;
    let at = -1;
    let large = 0;
    let bestLarge = 0;
    for (let k = 0; k < kinds - 1; k++) {
      large += counts[k];
      const cost = sizes[0] * large + sizes[k + 1] * (this.n - large);
      if (cost < best) {
        best = cost;
        at = k;
        bestLarge = large;
      }
    }
    if (at < 0 || whole - best < Math.max(SPLIT_VERTS, SPLIT_SHARE * whole)) {
      out.push(this.cut(0, Infinity, this.n));
      return;
    }
    out.push(this.cut(sizes[at], Infinity, bestLarge));
    out.push(this.cut(0, sizes[at + 1], this.n - bestLarge));
  }
}

/** the model sizes of a draw and how many instances have each (no tile holds more kinds than the atlas has models) */
const sizes = new Float64Array(64);
const counts = new Float64Array(64);

const gather: Record<PlantClass, Gather> = { tree: new Gather('tree'), small: new Gather('small') };
const groundPaint = new Gather('small');
const shadowTrees = new Gather('tree');
const one: FloraBatch[] = [];

/** the slope of the ground at a point of a tile, from the ecotope's heights round it: along x and along z, and the node of its square */
let slopeX = 0;
let slopeZ = 0;
let slopeNode = 0;
function slopeAt(H: Float32Array, fx: number, fz: number): void {
  const ci = fx < 0 ? 0 : fx >= ECO_SQ ? ECO_SQ - 1 : Math.floor(fx);
  const cj = fz < 0 ? 0 : fz >= ECO_SQ ? ECO_SQ - 1 : Math.floor(fz);
  const u = fx - ci;
  const v = fz - cj;
  const a = cj * ECO_N + ci;
  slopeX = ((H[a + 1] - H[a]) * (1 - v) + (H[a + ECO_N + 1] - H[a + ECO_N]) * v) / ECO_STEP;
  slopeZ = ((H[a + ECO_N] - H[a]) * (1 - u) + (H[a + ECO_N + 1] - H[a + 1]) * u) / ECO_STEP;
  slopeNode = a;
}
const discScratch = new Float32Array((256 + 256 * 3 + 1024) * 16);
const tp = new TerrainPoint();
/** a tile's painted crowns as they are gathered: its trees' cells and its shrubs' */
const crownScratch = new Float32Array(512 * CROWN_STRIDE);
/** a crown may spread this much wider than the catalogue's crown, keeping its own shape (a painted tree is broad) */
const CROWN_BROADEN = 1.2;
/** by plant index: the species it is drawn as (−1 none), asked of the crowns once per lookup */
let crownSpeciesOf: Int16Array | null = null;
let crownLookupFor: CrownLookup | null = null;
function crownOf(crowns: CrownLookup, pi: number): number {
  if (crownLookupFor !== crowns || !crownSpeciesOf) {
    crownLookupFor = crowns;
    crownSpeciesOf = Int16Array.from(PLANTS, (p) => crowns.speciesOf(paintedFamily(p.id, p.model)));
  }
  return crownSpeciesOf[pi];
}
/** the same level of a bench, for a row of a plant of rows to stand on it (m) */
const BENCH_LEVEL = 0.25;

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

/** The integer is the palette pair; its fraction (0 ? 1/4) carries settled snow at the root.
 * rtSlotPair rounds to the nearest integer, including on renderers which only need the palette. */
function snowyPair(world: World, sk: number, height: number): number {
  const a = BIOMES[slotA[sk]];
  const b = BIOMES[slotB[sk]];
  const mix = slotShare[sk];
  const altitude = world.spine.altitude(height);
  const lineA = a.relief?.snow ?? 1e5;
  const line = lineA + ((b.relief?.snow ?? 1e5) - lineA) * mix;
  const valley = (a.ground === Surface.Snow ? 1 - mix : 0) + (b.ground === Surface.Snow ? mix : 0);
  const cover = Math.max(valley * (0.78 + 0.22 * smoothstep(line - 1600, line - 350, altitude)), smoothstep(line - 150, line + 150, altitude));
  return slotPair[sk] + cover * 0.25;
}

/**
 * One plant into a draw: set on its ground at (x, y, z) of the tile (y: the land under it), at its size and turn
 * (a plant of rows: the turn of its rows). `level`: which of its models `model` is (0 near, 1 far, 2 furthest).
 * Returns its scale across.
 */
function put(g: Gather, d: PlantDraw, plant: PlantDef, model: AtlasModel, level: number, x: number, y: number, z: number, size: number, vary: number, yaw: number, gx: number, gz: number, pair: number, share: number, region: number, bearing: boolean | null = null): number {
  const fam = d.family;
  const o = g.n * 4;
  const kx = level === 0 ? d.kx : level === 1 ? d.fkx : d.tkx;
  // a little of its own in its girth; its height is the core's to the centimetre
  const sxz = fam.turn === 'row' ? kx : kx * size * (0.92 + 0.16 * ((vary * 7.31) % 1));
  const sy = (level === 0 ? d.ky : level === 1 ? d.fky : d.tky) * size;
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
  g.place[o + 3] = fam.turn === 'sun' ? (vary - 0.5) * 0.5 : yaw;
  g.shape[o] = sxz;
  g.shape[o + 1] = sy;
  g.shape[o + 2] = model.first;
  g.shape[o + 3] = model.count;
  const bears = (bearing ?? (d.showsFruit && bearsAt(plant, vary) !== null)) ? 2 : 0;
  g.look[o] = pair;
  const deciduousWood = !plant.evergreen && (plant.layer === 'tree' || plant.layer === 'shrub');
  g.look[o + 1] = share * 0.999 + bears + d.evergreen + (deciduousWood ? 8 : 0);
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
  /** which of its models: 0 its near one (the default), 1 its far one, 2 its furthest */
  level?: number;
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
    const level = it.level ?? 0;
    const model = level === 0 ? d.near : level === 1 ? d.far : d.tiny;
    if (!d.drawn || !model) continue;
    put(gather[d.cls], d, PLANTS[pi], model, level, it.x, it.y, it.z, it.size ?? 1, it.vary ?? 0.4, it.yaw ?? 0, 0, 0, it.slot ?? 0, 0, it.region ?? 0, it.bears ?? null);
  }
  const out: FloraBatch[] = [];
  gather.tree.batches(out);
  gather.small.batches(out);
  return out;
}

/**
 * The plants of tile (tx, tz) at a level of detail, ready to draw. `discs`: also the soft ground discs of the
 * near plants (for a renderer without shadow maps). `crowns`: the painted crowns (scene/crowns/crownView.ts):
 * at the three nearer levels the trees whose family has one, and at the two nearest the shrubs, are handed
 * over to them instead of being drawn here (null: everything is drawn here). The world must be of version 2
 * (it has a flora field).
 */
export function buildFloraScatter(world: World, reg: PlantRegistry, tx: number, tz: number, lod: FloraLod, discs = false, crowns: CrownLookup | null = null): FloraScatter {
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
  const near = lod <= LOD_CLOSE;
  const layers: FloraLayer[] = near ? [LAYER_TREE, LAYER_SHRUB, LAYER_GROUND] : lod === LOD_MID ? [LAYER_TREE, LAYER_SHRUB] : [LAYER_TREE];
  // which of its models a tree is drawn in, and a small plant (0 near, 1 far, 2 furthest)
  const treeLevel = lod === LOD_NEAR || lod === LOD_CLOSE ? 0 : lod === LOD_MID ? 1 : 2;
  const smallLevel = near ? 0 : 1;
  const dense = lod !== LOD_NEAR && flora.tile(LAYER_TREE, tx, tz).n > DENSE_TREES;
  const C = et.canopy;
  // (how thick the wood is, for the crowns: whatever the level, a tree under closed canopy is drawn a level lower far off)
  const thick = flora.tile(LAYER_TREE, tx, tz).n > DENSE_TREES;
  let nc = 0;
  for (const layer of layers) {
    const t: FloraTile = flora.tile(layer, tx, tz);
    for (let i = 0; i < t.n; i++) {
      const pi = t.plant[i];
      const d = reg.draws[pi];
      // The profile supplies ornamental understory. Harvestable plants still come from the forage field.
      if (layer !== LAYER_TREE && !PLANTS[pi].bears && groundProfile(BIOMES[t.region[i]].id)) continue;
      if (!d.drawn) continue;
      // a painted crown: handed over, with where it stands and how it looks
      if (crowns && lod <= LOD_MID && (layer === LAYER_TREE || (layer === LAYER_SHRUB && lod <= LOD_CLOSE)) && nc < 512) {
        const climate = BIOMES[t.region[i]]?.kin;
        const bush = PLANTS[pi].model === 'sage' || (PLANTS[pi].model === 'bush' && climate === 'desert') ? 'bush_dry'
          : PLANTS[pi].model === 'bush' && climate === 'alpine' ? 'bush_alpine' : undefined;
        const sp = bush ? crowns.speciesOf(bush) : crownOf(crowns, pi);
        if (sp >= 0) {
          const plant = PLANTS[pi];
          const x = t.x[i];
          const z = t.z[i];
          const size = t.size[i];
          const vary = t.vary[i];
          slopeAt(H, (x - x0) / ECO_STEP, (z - z0) / ECO_STEP);
          const si = Math.min(SLOT_N - 1, Math.max(0, Math.round((x - x0) / SLOT_STEP)));
          const sj = Math.min(SLOT_N - 1, Math.max(0, Math.round((z - z0) / SLOT_STEP)));
          const sk = sj * SLOT_N + si;
          const region = t.region[i];
          const share = slotA[sk] === slotB[sk] ? slotShare[sk] : region === slotB[sk] ? 1 : region === slotA[sk] ? 0 : slotShare[sk];
          const m = crowns.measure(sp);
          const sy = (plant.height * size) / m.height;
          const sx = Math.min(sy, (plant.crown * size * CROWN_BROADEN) / m.radius) * (0.92 + 0.16 * ((vary * 7.31) % 1));
          // it stands plumb: sunk until the low side of its foot is in the ground
          const foot = t.y[i] - (d.family.sink ?? 0) - Math.min(1.2, Math.sqrt(slopeX * slopeX + slopeZ * slopeZ)) * Math.max(0.15, plant.trunk * size);
          let inside = 0;
          if (thick && layer === LAYER_TREE) {
            const qa = slopeNode;
            const qx = (x - x0) / ECO_STEP;
            const qz = (z - z0) / ECO_STEP;
            const qu = qx - (qa % ECO_N);
            const qv = qz - Math.floor(qa / ECO_N);
            if ((C[qa] * (1 - qu) + C[qa + 1] * qu) * (1 - qv) + (C[qa + ECO_N] * (1 - qu) + C[qa + ECO_N + 1] * qu) * qv > INSIDE_CANOPY) inside = 1;
          }
          const bears = d.showsFruit && bearsAt(plant, vary) !== null ? 2 : 0;
          let second = d.tintB;
          if (d.regionAccent) {
            const hs = huesOf(region);
            if (hs.length) second = hs[Math.min(hs.length - 1, Math.floor(vary * hs.length))];
          }
          const o = nc * CROWN_STRIDE;
          crownScratch[o] = x;
          crownScratch[o + 1] = foot;
          crownScratch[o + 2] = z;
          crownScratch[o + 3] = t.yaw[i];
          crownScratch[o + 4] = sx;
          crownScratch[o + 5] = sy;
          crownScratch[o + 6] = sp;
          crownScratch[o + 7] = Math.min(crowns.variants(sp) - 1, Math.floor(((vary * 13.7) % 1) * crowns.variants(sp)));
          crownScratch[o + 8] = snowyPair(world, sk, t.y[i]);
          crownScratch[o + 9] = share * 0.999 + bears + d.evergreen;
          const paint = CROWN_PAINT[bush ?? paintedFamily(plant.id, plant.model)];
          const autumn = BIOMES[region]?.id === 'maple';
          crownScratch[o + 10] = (autumn && !plant.evergreen ? paint?.autumn : undefined) ?? (bush || ['maple','chestnut_tree','willow'].includes(plant.id) ? paint.leaf : plant.tint?.[0]) ?? paint?.leaf ?? d.tintA;
          crownScratch[o + 11] = plant.bears?.where === 'on' && plant.model === 'fruit_tree' ? second : paint?.bark ?? second;
          crownScratch[o + 12] = vary;
          crownScratch[o + 13] = inside;
          crownScratch[o + 14] = m.radius * sx;
          crownScratch[o + 15] = m.height * sy;
          nc++;
          continue;
        }
      }
      let level = layer === LAYER_TREE ? treeLevel : smallLevel;
      if (dense && layer === LAYER_TREE) {
        // a tree inside a thick wood: a level lower than the wood's edge; furthest off, every other one
        const qx = (t.x[i] - x0) / ECO_STEP;
        const qz = (t.z[i] - z0) / ECO_STEP;
        const qi = qx < 0 ? 0 : qx >= ECO_SQ ? ECO_SQ - 1 : Math.floor(qx);
        const qj = qz < 0 ? 0 : qz >= ECO_SQ ? ECO_SQ - 1 : Math.floor(qz);
        const qu = qx - qi;
        const qv = qz - qj;
        const qa = qj * ECO_N + qi;
        if ((C[qa] * (1 - qu) + C[qa + 1] * qu) * (1 - qv) + (C[qa + ECO_N] * (1 - qu) + C[qa + ECO_N + 1] * qu) * qv > INSIDE_CANOPY) {
          if (level === 2 && t.vary[i] >= 0.5) continue;
          if (level < 2) level++;
        }
      }
      const model = level === 0 ? d.near : level === 1 ? d.far : d.tiny;
      if (!model) continue;
      const g = gather[d.cls];
      if (g.n >= MOST[d.cls]) continue;
      const plant = PLANTS[pi];
      const x = t.x[i];
      const z = t.z[i];
      const size = t.size[i];
      const vary = t.vary[i];
      // the ground under it: its slope from the ecotope's heights round it
      slopeAt(H, (x - x0) / ECO_STEP, (z - z0) / ECO_STEP);
      const gx = slopeX;
      const gz = slopeZ;
      const a = slopeNode;
      const si = Math.min(SLOT_N - 1, Math.max(0, Math.round((x - x0) / SLOT_STEP)));
      const sj = Math.min(SLOT_N - 1, Math.max(0, Math.round((z - z0) / SLOT_STEP)));
      const sk = sj * SLOT_N + si;
      // its palette: of the region whose table stood it, where two regions meet
      const region = t.region[i];
      const share = slotA[sk] === slotB[sk] ? slotShare[sk] : region === slotB[sk] ? 1 : region === slotA[sk] ? 0 : slotShare[sk];
      let ground = t.y[i];
      if (plant.aquatic) {
        // a plant of the water stands on the bed, in up to a few hands of water: it is drawn rising from the surface
        world.shape(x, z, tp);
        if (tp.wl > ground) ground = tp.wl - 0.12;
      }
      if (d.family.turn === 'row') {
        // a plant of rows (tea) is the rows of its whole cell: up to three hedges side by side, along the
        // contour of its ground (on level ground along x, as the field's own rows run). On the benches of
        // terraced country each stands level on the bench, and only where the bench reaches.
        const sl = Math.sqrt(gx * gx + gz * gz);
        const ax = sl > 0.04 ? gx / sl : 0;
        const az = sl > 0.04 ? gz / sl : 1;
        const turn = Math.atan2(-ax, -az) + (vary - 0.5) * 0.1;
        const benches = et.terrace[a] >= 0.5;
        for (let r = -1; r <= 1; r++) {
          if (g.n >= MOST[d.cls]) break;
          let h = ground + r * TEA_ROWS * sl;
          if (benches && r !== 0) {
            world.shape(x + r * TEA_ROWS * ax, z + r * TEA_ROWS * az, tp);
            if (Math.abs(tp.bed - ground) > BENCH_LEVEL) continue;
            h = tp.bed;
          }
          put(g, d, plant, model, level, x - x0 + r * TEA_ROWS * ax, h - oy, z - z0 + r * TEA_ROWS * az, size, vary, turn, benches ? 0 : gx, benches ? 0 : gz, snowyPair(world, sk, t.y[i]), share, region);
        }
        continue;
      }
      const sxz = put(g, d, plant, model, level, x - x0, ground - oy, z - z0, size, vary, t.yaw[i], gx, gz, snowyPair(world, sk, t.y[i]), share, region);
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
  const groundBatches: FloraBatch[] = [];
  if (lod <= LOD_MID) {
    const field = groundField(world);
    groundPaint.reset();
    for (const rocks of [false,true]) for (const it of field.tile(tx,tz,rocks)) {
      if (lod === LOD_MID && it.height < 0.7) continue;
      const model = reg.atlas.models['ground_'+it.form+lod];
      const g = groundPaint, o = 4*g.n++;
      const x=it.x-x0, z=it.z-z0, y=it.y-oy;
      const si=Math.min(SLOT_N-1,Math.max(0,Math.round(x/SLOT_STEP)));
      const sj=Math.min(SLOT_N-1,Math.max(0,Math.round(z/SLOT_STEP)));
      const sk=sj*SLOT_N+si;
      slopeAt(H,x/ECO_STEP,z/ECO_STEP);
      g.place.set([x,y,z,it.yaw],o);
      g.shape.set([it.radius,it.height,model.first,model.count],o);
      g.look.set([snowyPair(world,sk,it.y),slotShare[sk]*0.999,it.paint,it.accent],o);
      g.lie.set([Math.max(-1,Math.min(1,slopeX)),Math.max(-1,Math.min(1,slopeZ)),it.seed,0],o);
      g.verts=Math.max(g.verts,model.count);
      g.triangles+=model.count/3;
      g.minY=Math.min(g.minY,y-it.radius);
      g.maxY=Math.max(g.maxY,y+it.radius+it.height);
    }
    groundPaint.batches(groundBatches);
  }
  gather.tree.batches(batches);
  gather.small.batches(batches);
  // the close level's shadows: every tree of the tile in its far model, one draw
  let shadows: FloraBatch | null = null;
  // (none where the renderer draws no shadow map and asks for the soft discs instead)
  if (lod === LOD_CLOSE && !discs) {
    shadowTrees.reset();
    const t = flora.tile(LAYER_TREE, tx, tz);
    for (let i = 0; i < t.n; i++) {
      const d = reg.draws[t.plant[i]];
      if (!d.drawn || !d.far) continue;
      // (a painted crown throws its own shadow: scene/crowns/crownView.ts)
      if (crowns && crownOf(crowns, t.plant[i]) >= 0) continue;
      slopeAt(H, (t.x[i] - x0) / ECO_STEP, (t.z[i] - z0) / ECO_STEP);
      const si = Math.min(SLOT_N - 1, Math.max(0, Math.round((t.x[i] - x0) / SLOT_STEP)));
      const sj = Math.min(SLOT_N - 1, Math.max(0, Math.round((t.z[i] - z0) / SLOT_STEP)));
      put(shadowTrees, d, PLANTS[t.plant[i]], d.far, 1, t.x[i] - x0, t.y[i] - oy, t.z[i] - z0, t.size[i], t.vary[i], t.yaw[i], slopeX, slopeZ, snowyPair(world, sj * SLOT_N + si, t.y[i]), 0, t.region[i], false);
    }
    if (shadowTrees.n > 0) {
      one.length = 0;
      shadowTrees.whole(one);
      shadows = one[0];
    }
  }
  return { batches, groundBatches, shadows, discs: discs && nd > 0 ? discScratch.slice(0, nd * 16) : null, discCount: nd, crowns: nc > 0 ? crownScratch.slice(0, nc * CROWN_STRIDE) : null, crownCount: nc, wx: x0, wy: oy, wz: z0 };
}
