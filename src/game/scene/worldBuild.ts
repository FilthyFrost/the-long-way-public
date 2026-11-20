/**
 * Mesh builders for the generated world. Everything is sampled from World.shape(), the same
 * function the wheels use.
 *
 *   road strip   road-aligned grid ±40 m around the centre line: pavement, shoulders and verge in
 *                one mesh, so the road edge is exact and there is nothing to z-fight with
 *   terrain      world-aligned quadtree leaves; the ground is sunk a little under the strip
 *   scatter      trees, bushes and rocks on 128 m tiles, placed by hashing world cells
 *   poles        utility poles and sagging wires along the road
 *
 * In a world of version 2 the woods and the ground cover are the core's (docs/V3/nodes/W2-flora.md): the
 * ground's painted woods, the lift of the far land and the far-woods cards follow the ecotope's canopy
 * (floraCanopy.ts) instead of `woodland`, the land carries the rows its flowers and crops grow in (`aCover`),
 * the grass is what FloraField.cover says (floraCover.ts), and the scatter is floraScatter.ts. A world of
 * version 1 is built exactly as it always was.
 */
import * as THREE from 'three';
import { fbm2 } from '../../core/math/noise';
import { hash2 } from '../../core/math/rng';
import { smoothstep } from '../../core/math/util';
import { groundProfile, elevationBand, siteElevation } from '../../core/world/groundTables';
import { BIOMES } from '../../core/world/biomes';
import { ECO_PLOT, ECO_ROAD, ECO_SITE, ECO_WET, Ecotope, ROAD_CLEAR } from '../../core/world/ecotope';
import type { CoverParams } from '../../core/world/flora';
import { floraTableOf } from '../../core/world/floraTables';
import { LandParams } from '../../core/world/landform';
import { SpineSample } from '../../core/world/spine';
import { ROAD_EDGE, TerrainPoint, type World } from '../../core/world/terrain';
import { DECK_HALF, KERB_AT, KERB_HEIGHT, type River } from '../../core/world/water';
import { roadStyleAt } from '../../core/world/roadStyles';
import { RAIL_AT, RAIL_STEP, type RailRun, type RoadPost } from '../../core/world/furniture';
import { ModelBuilder } from '../vehicle/builder';
import { PaintBuilder } from './paintBuilder';
import { globals } from '../render/shaderlib';
import { BIOME_STYLES, STYLE } from '../render/style';
import { GROUND_FAR, ON_LANDFORM } from '../render/terrainMaterials';
import { canopyOf, woodHeight, woodOnSlope } from './floraCanopy';
import { CoverBase, coverBase, driftHue01, hueOf, rowCoord, rowHue01, rowsRun } from './floraCover';
import { floraOf, woodland } from './palette';
import { buildPlants } from './vegetation';

export const STRIP_STATIONS = 32;
export const STRIP_HALF = 40;
const SKIRT_AT = 44;
const COLS_FULL = [-SKIRT_AT, -40, -30, -22, -15, -10, -7, -5.4, -4.5, -3.25, -1.6, 0, 1.6, 3.25, 4.5, 5.4, 7, 10, 15, 22, 30, 40, SKIRT_AT];
const COLS_FAR = [-SKIRT_AT, -40, -22, -10, -4.5, -3.25, 0, 3.25, 4.5, 10, 22, 40, SKIRT_AT];
export const STRIP_LODS = [
  { stride: 1, cols: COLS_FULL },
  { stride: 2, cols: COLS_FULL },
  { stride: 4, cols: COLS_FAR },
];

/** how far the open terrain is lowered under the road strip */
export function stripSink(ad: number): number {
  return 2.2 * (1 - smoothstep(32, SKIRT_AT, ad));
}

/**
 * How much of that a shaped point gets: not on a plot of the world's caller (WorldOptions.plots), and on a road
 * that ends at its start (deadEnd) nothing behind the start, where there is no strip, and only from a few metres
 * past it (the strip's first metres lie on the land as it is, a hand proud of it: no step, no fighting)
 */
export function sinkShare(world: World, t: TerrainPoint): number {
  let k = 1 - t.plot;
  if (world.deadEnd) k *= t.behind > 0 ? 0 : smoothstep(4, 12, t.s);
  return k;
}

/** an anchored landform counts as one, for the paint, once it has risen this far (m) */
const LANDFORM_FOOT = 4;

/**
 * Ground paint inputs for a vertex (terrainMaterials.ts): the weight of each palette slot, and
 * (distance from the road centre, relief, woodland — or, negative, how mown a plot's lawn is — and the water's depth).
 *
 * Where an anchored landform stands (TerrainPoint.landform: a tower, a butte, in worlds of version 2) its height
 * is counted into the relief — the layers of a butte's rock go by height, as a mesa's do — and the point says
 * that it is on one by adding ON_LANDFORM to its road distance, by as much as the landform has risen over its
 * first metres (so the paint has it come in smoothly at the foot). Elsewhere, and in every world of version 1,
 * the inputs are what they always were.
 *
 * `canopy`: how wooded the point is, for a caller that knows (a world of version 2: the ecotope's canopy,
 * floraCanopy.ts); left out, it is the first renderer's `woodland`.
 */
export function groundAttrs(seed: number, t: TerrainPoint, x: number, z: number, bw: Float32Array, gd: Float32Array, k: number, lawn = 0, canopy = NaN): void {
  const ad = t.d < 0 ? -t.d : t.d;
  // a chapter's palette lives in slot (chapter mod 4): two neighbours never share one
  bw[k * 4] = bw[k * 4 + 1] = bw[k * 4 + 2] = bw[k * 4 + 3] = 0;
  bw[k * 4 + (t.ca & 3)] += 1 - t.bt;
  bw[k * 4 + (t.cb & 3)] += t.bt;
  let wood: number;
  if (canopy === canopy) wood = canopy;
  else {
    wood = woodland(t.ba, seed, x, z, ad, t.relief) * (1 - t.bt);
    if (t.bt > 0) wood += woodland(t.bb, seed, x, z, ad, t.relief) * t.bt;
  }
  // (no wood is painted on a plot of the caller's, where none stands: buildScatter keeps its trees off it)
  if (t.plot > 0.8) wood *= 1 - smoothstep(0.8, 0.95, t.plot);
  gd[k * 4] = Math.min(ad, GROUND_FAR) + (t.landform > 0 ? ON_LANDFORM * Math.min(1, t.landform / LANDFORM_FOOT) : 0);
  gd[k * 4 + 1] = t.relief + t.landform;
  gd[k * 4 + 2] = lawn > 0.02 ? -lawn : wood;
  // how far under the water this ground lies (negative above it; −40 where there is no water about)
  gd[k * 4 + 3] = t.wl > -1e8 ? Math.max(-40, Math.min(40, t.wl - t.bed)) : -40;
}

/** how mown the grass is at a shaped point (a plot's: Plot.grass), 0 … 1: the ground under a lawn is painted lusher and evener */
export function lawnOf(world: World, t: TerrainPoint, x: number, z: number): number {
  if (t.plot <= 0) return 0;
  const g = world.plotGrass(x, z);
  return g < 1 ? Math.min(1, (1 - g) / 0.6) : 0;
}

const bridgeProbe: { river: River | null; mask: number } = { river: null, mask: 0 };

const tp = new TerrainPoint();
const tq = new TerrainPoint();
const st = new SpineSample();
const eco = new Ecotope();
const lp = new LandParams();

/** the ground cover of each region's flora table, by registry index (looked up again when another region stands at that index) */
const covers: CoverParams[] = [];
const coversFor: string[] = [];
function coverOf(region: number): CoverParams {
  const b = BIOMES[region] ?? BIOMES[0];
  if (coversFor[region] !== b.id) {
    coversFor[region] = b.id;
    covers[region] = floraTableOf(b.id, b.kin).cover;
  }
  return covers[region];
}

function smooth01(t: number): number {
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
}

/**
 * The rows a region's flowers or crops grow in, for the ground's paint (a world of version 2), in two steps: a
 * builder knows the land at a vertex before it knows the slope there.
 *
 * rowBase: what of its region's rows a shaped point can carry at all, into out[o …]: how much stands in a row
 * (0: the region grows no rows, or nothing stands here: road, water, a place, a plot), the steepest ground the
 * rows run on, 1 where the country is cut into benches, and the region's own share of bare ground.
 */
function rowBase(world: World, t: TerrainPoint, x: number, out: Float32Array, o: number): void {
  out[o] = 0;
  const region = t.bt >= 0.5 ? t.bb : t.ba;
  const c = coverOf(region);
  const ad = t.d < 0 ? -t.d : t.d;
  if (!c.rows || c.flowers <= 0 || ad < ROAD_CLEAR || t.zone !== 0 || t.wl > t.bed + 0.02 || t.site > 0.02 || t.plot > 0.02) return;
  out[o] = c.flowers;
  out[o + 1] = c.rows.maxSlope;
  out[o + 2] = BIOMES[region].land?.terrace && world.land.at(world.spine.sAtX(x), lp).terrace >= 0.5 ? 1 : 0;
  out[o + 3] = c.bare;
}

/**
 * rowFinish: into cov[k·2 …] the row coordinate of the point (floraCover.ts rowCoord) and how much stands in a
 * row there — positive where rows run by the lie of the land, negative where they keep to the benches of
 * terraced country (the paint finds the benches itself, by height), 0 where there are none. `open` is the
 * share of the sky the trees leave (1 − canopy); `slope` the land's, rise over run.
 */
function rowFinish(seed: number, x: number, z: number, base: Float32Array, o: number, open: number, slope: number, cov: Float32Array, k: number): void {
  cov[k * 2] = cov[k * 2 + 1] = 0;
  if (!(base[o] > 0)) return;
  // (the cover's bare ground, as far as a region that grows rows has any: its own share and the steep)
  const amount = base[o] * open * (1 - Math.min(1, base[o + 3] + 0.8 * smooth01((slope - 0.45) / 0.35)));
  if (amount <= 0) return;
  if (slope > base[o + 1] && base[o + 2] < 0.5) return;
  cov[k * 2] = rowCoord(seed, x, z);
  cov[k * 2 + 1] = slope > base[o + 1] ? -amount : amount;
}

const rowOne = new Float32Array(4);

/** terrain normal by finite differences (world space) */
function normalAt(world: World, x: number, z: number, h: number, out: Float32Array, o: number): number {
  const e = 0.6;
  world.shape(x + e, z, tq);
  const dhx = (tq.bed - h) / e;
  world.shape(x, z + e, tq);
  const dhz = (tq.bed - h) / e;
  const inv = 1 / Math.sqrt(dhx * dhx + 1 + dhz * dhz);
  out[o] = -dhx * inv;
  out[o + 1] = inv;
  out[o + 2] = -dhz * inv;
  return inv;
}

export interface Built {
  geometry: THREE.BufferGeometry;
  /** world position of the mesh origin */
  wx: number;
  wy: number;
  wz: number;
  /** a terrain leaf: the first and the last chapter of the journey its vertices lie in (whose palettes it is painted with) */
  chapters?: [number, number];
}

/**
 * Road-aligned strip starting at chunk index c (stations c·32 …), `span` chunks long.
 * Far strips cover several chunks in one mesh to save draw calls.
 */
export function buildStrip(world: World, c: number, lod: number, span = 1): Built {
  const sp = world.spine;
  const ds = sp.ds;
  const { stride, cols } = STRIP_LODS[lod];
  const i0 = c * STRIP_STATIONS;
  const rows = (STRIP_STATIONS * span) / stride + 1;
  const nc = cols.length;
  sp.ensure((i0 + STRIP_STATIONS * span + 2) * ds);
  sp.at(i0 * ds, st);
  const ox = st.x;
  const oy = st.y;
  const oz = st.z;
  const sBase = Math.floor((i0 * ds) / 4096) * 4096;
  const n = rows * nc;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const bw = new Float32Array(n * 4);
  const gd = new Float32Array(n * 4);
  const road = new Float32Array(n * 4);
  const styles = world.rules.version >= 2 ? new Float32Array(n*4) : null;
  // a world of version 2: the woods beside the road are the ecotope's, and the land carries its region's rows
  const field = world.eco;
  const cov = field ? new Float32Array(n * 2) : null;
  // (… and the height above the sea, for its snow line and its tree line)
  const alt = field ? new Float32Array(n) : null;
  let k = 0;
  for (let r = 0; r < rows; r++) {
    const s = (i0 + r * stride) * ds;
    sp.at(s, st);
    const nx = -Math.sin(st.phi);
    const nz = Math.cos(st.phi);
    // The last vertex of both triangles comes from this row: the flat attribute
    // keeps the construction joint at the same station at all three mesh levels.
    const style = styles ? roadStyleAt(world, s - 0.01) : null;
    // over a river the strip is the deck alone: everything beyond its edge is folded onto the edge
    // (the land below belongs to the terrain leaves, the sides and railings to the bridge mesh)
    world.water.bridgeAt(s, bridgeProbe);
    const onBridge = bridgeProbe.mask > 0.5;
    for (let j = 0; j < nc; j++, k++) {
      let d = cols[j];
      const skirt = d < -STRIP_HALF || d > STRIP_HALF;
      if (onBridge) d = d < -DECK_HALF ? -DECK_HALF : d > DECK_HALF ? DECK_HALF : d;
      const wx = st.x + nx * d;
      const wz = st.z + nz * d;
      world.shape(wx, wz, tp);
      pos[k * 3] = wx - ox;
      // (the kerb of a bridge is the bridge mesh's: the strip stays flat under it)
      let hd = tp.zone === 3 && (d > KERB_AT || d < -KERB_AT) ? tp.h - KERB_HEIGHT : tp.zone !== 0 ? tp.h : tp.bed;
      // (a road that ends at its start: there the land beside it is not sunk under the strip, which stands a
      // hand proud of it for its first metres)
      if (world.deadEnd && tp.zone === 0 && s < 12) hd += 0.03 * (1 - smoothstep(4, 12, s));
      pos[k * 3 + 1] = hd - oy - (skirt && !onBridge ? 1.6 : 0);
      pos[k * 3 + 2] = wz - oz;
      if (alt) alt[k] = sp.altitude(hd);
      if (styles && style) {
        styles[k*4] = style.pavement;
        styles[k*4+1] = style.lines;
        styles[k*4+2] = style.verge;
        styles[k*4+3] = style.half;
      }
      road[k * 4] = d;
      road[k * 4 + 1] = s - sBase;
      road[k * 4 + 2] = bridgeProbe.mask;
      // a place's levelled ground: how fully, signed by what it is (+ packed gravel, − old concrete)
      road[k * 4 + 3] = tp.siteGround === 1 ? -tp.site : tp.site;
      if (tp.zone !== 0) {
        // on the road bed the normal is known exactly
        const cs = Math.cos(tp.phi);
        const sn = Math.sin(tp.phi);
        const cross = tp.zone === 1 ? tp.bank : tp.bank - (tp.d < 0 ? -0.06 : 0.06);
        const dhx = tp.grade * cs - cross * sn;
        const dhz = tp.grade * sn + cross * cs;
        const ny = 1 / Math.sqrt(dhx * dhx + 1 + dhz * dhz);
        nrm[k * 3] = -dhx * ny;
        nrm[k * 3 + 1] = ny;
        nrm[k * 3 + 2] = -dhz * ny;
      } else {
        normalAt(world, wx, wz, tp.bed, nrm, k * 3);
      }
      if (field && cov) {
        // near, the ecotope's own tile (what the trees and the grass beside the road are read from); far down
        // the road, the same canopy asked at the point itself, with the slope the strip has
        let wood = 0;
        let slope = 0;
        if (tp.zone === 0) {
          if (lod <= 1) {
            field.at(wx, wz, eco);
            wood = eco.flags & (ECO_ROAD | ECO_WET | ECO_SITE | ECO_PLOT) ? 0 : eco.canopy;
            slope = eco.slope;
          } else {
            const ny = nrm[k * 3 + 1];
            slope = Math.sqrt(Math.max(0, 1 - ny * ny)) / Math.max(ny, 1e-3);
            wood = canopyOf(world, tp, wx, wz) * woodOnSlope(slope);
          }
        }
        groundAttrs(world.seed, tp, wx, wz, bw, gd, k, lawnOf(world, tp, wx, wz), wood);
        rowBase(world, tp, wx, rowOne, 0);
        rowFinish(world.seed, wx, wz, rowOne, 0, 1 - wood, slope, cov, k);
      } else groundAttrs(world.seed, tp, wx, wz, bw, gd, k, lawnOf(world, tp, wx, wz));
      // the strip knows its lateral offset exactly; the nearest-point search can overshoot on a curve
      // (and paint a wedge of meadow into the verge)
      gd[k * 4] = Math.abs(d);
    }
  }
  const idx = new Uint16Array((rows - 1) * (nc - 1) * 6);
  let q = 0;
  for (let r = 0; r < rows - 1; r++) {
    for (let j = 0; j < nc - 1; j++) {
      const a = r * nc + j;
      const b = a + 1;
      const cc = a + nc;
      const dd = cc + 1;
      // +x is along the road, +z to the right: wind so the face normal points up
      idx[q++] = a;
      idx[q++] = b;
      idx[q++] = cc;
      idx[q++] = b;
      idx[q++] = dd;
      idx[q++] = cc;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('aBiomeW', new THREE.BufferAttribute(bw, 4));
  g.setAttribute('aGround', new THREE.BufferAttribute(gd, 4));
  if (styles) g.setAttribute('aRoadStyle', new THREE.BufferAttribute(styles,4));
  g.setAttribute('aRoad', new THREE.BufferAttribute(road, 4));
  if (cov) g.setAttribute('aCover', new THREE.BufferAttribute(cov, 2));
  if (alt) g.setAttribute('aAlt', new THREE.BufferAttribute(alt, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return { geometry: g, wx: ox, wy: oy, wz: oz };
}

// ---------------------------------------------------------------------------------------------- terrain

export const TERRAIN_N = 32;
export const TERRAIN_ROOT = 2048;
export const TERRAIN_MAX_LEVEL = 3; // 2048 → 256 m leaves (8 m grid; the road strip covers the nearest 40 m)

let sharedIndex: THREE.BufferAttribute | null = null;
function terrainIndex(): THREE.BufferAttribute {
  if (sharedIndex) return sharedIndex;
  const N = TERRAIN_N;
  const V = N + 1;
  const quads = N * N + 4 * N;
  const idx = new Uint16Array(quads * 6);
  let q = 0;
  const quad = (a: number, b: number, c: number, d: number): void => {
    idx[q++] = a;
    idx[q++] = c;
    idx[q++] = b;
    idx[q++] = b;
    idx[q++] = c;
    idx[q++] = d;
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) quad(j * V + i, j * V + i + 1, (j + 1) * V + i, (j + 1) * V + i + 1);
  // skirts: extra vertices after the grid, in the order: z-min edge, z-max edge, x-min edge, x-max edge
  const base = V * V;
  for (let i = 0; i < N; i++) {
    quad(base + i, base + i + 1, i, i + 1); // z-min, facing −z
    quad(N * V + i, N * V + i + 1, base + V + i, base + V + i + 1); // z-max
    quad(base + 2 * V + i + 1, base + 2 * V + i, (i + 1) * V, i * V); // x-min
    quad((i + 1) * V + N, i * V + N, base + 3 * V + i + 1, base + 3 * V + i); // x-max
  }
  sharedIndex = new THREE.BufferAttribute(idx, 1);
  return sharedIndex;
}

/** a far vertex that stands on an anchored landform asks the land for its own slope over this far (m): its coarse grid cannot tell a tower's side from its top */
const LANDFORM_PROBE = 8;
const TP = TERRAIN_N + 3;
/** a leaf's padded grid, for a world of version 2: the land's own height, the canopy on level ground, the slope where it was asked of the land (else none), the lift of its woods */
const tBed = new Float32Array(TP * TP);
const tWood = new Float32Array(TP * TP);
const tSlope = new Float32Array(TP * TP);
const tLift = new Float32Array(TP * TP);
const tRow = new Float32Array((TERRAIN_N + 1) * (TERRAIN_N + 1) * 4);

/** Quadtree leaf at (level, ix, iz): a 33×33 grid with skirts. */
export function buildTerrain(world: World, level: number, ix: number, iz: number): Built {
  const N = TERRAIN_N;
  const V = N + 1;
  const P = N + 3; // padded for normals
  // level < 0: the coarse ring of far leaves (several kilometres a side) out to the skyline
  const size = TERRAIN_ROOT / Math.pow(2, level);
  const step = size / N;
  const x0 = ix * size;
  const z0 = iz * size;
  const hs = new Float32Array(P * P);
  const bw = new Float32Array((V * V + 4 * V) * 4);
  const gd = new Float32Array((V * V + 4 * V) * 4);
  // far, coarse leaves lift the surface in woodland so distant forests have a silhouette
  const canopy = step >= 16;
  // a world of version 2: its woods are the ecotope's canopy, and the land carries the rows of its fields
  const flora = world.flora !== null;
  const cov = flora ? new Float32Array((V * V + 4 * V) * 2) : null;
  // (… and its height above the sea: the paint's snow line and tree line are the region's, in metres above the sea)
  const alt = flora ? new Float32Array(V * V + 4 * V) : null;
  let oy = 0;
  let cFirst = Infinity;
  let cLast = -Infinity;
  for (let j = -1; j <= N + 1; j++) {
    for (let i = -1; i <= N + 1; i++) {
      const wx = x0 + i * step;
      const wz = z0 + j * step;
      world.shape(wx, wz, tp, level < 0);
      if (tp.ca < cFirst) cFirst = tp.ca;
      if (tp.cb > cLast) cLast = tp.cb;
      const ad = tp.d < 0 ? -tp.d : tp.d;
      let h = tp.bed - stripSink(ad) * (1 - tp.bridge) * sinkShare(world, tp);
      const inner = i >= 0 && i <= N && j >= 0 && j <= N;
      if (flora) {
        // (the slope is known only once the whole grid is: the canopy on level ground now, the rest below)
        const p = (j + 1) * P + (i + 1);
        const wood = canopyOf(world, tp, wx, wz);
        tBed[p] = tp.bed;
        tWood[p] = wood;
        const bi = tp.bt < 0.5 ? tp.ba : tp.bb;
        // (no wood is lifted in water or on its shore: a lifted bed would come up through the water as green shoals)
        tLift[p] = canopy && tp.wl <= tp.bed - 1 ? woodHeight(bi) * 0.8 : 0;
        tSlope[p] = NaN;
        if (inner) {
          const k = j * V + i;
          groundAttrs(world.seed, tp, wx, wz, bw, gd, k, lawnOf(world, tp, wx, wz), wood);
          rowBase(world, tp, wx, tRow, k * 4);
          if (alt) alt[k] = world.spine.altitude(tp.bed);
        }
        if (wood > 0 && tp.landform > 2 && step > LANDFORM_PROBE) {
          const bed = tp.bed;
          world.shape(wx + LANDFORM_PROBE, wz, tq, level < 0);
          const dhx = (tq.bed - bed) / LANDFORM_PROBE;
          world.shape(wx, wz + LANDFORM_PROBE, tq, level < 0);
          const dhz = (tq.bed - bed) / LANDFORM_PROBE;
          tSlope[p] = Math.sqrt(dhx * dhx + dhz * dhz);
        }
        hs[p] = h;
        continue;
      }
      let wood = 0;
      if (canopy) {
        const bi = tp.bt < 0.5 ? tp.ba : tp.bb;
        // (no wood stands in water: a lifted lake bed or sea bed would come up through it as green shoals)
        wood = tp.wl > tp.bed - 1 ? 0 : woodland(bi, world.seed, wx, wz, ad, tp.relief);
        const kin = floraOf(bi);
        h += wood * (kin === 'alpine' ? 9 : kin === 'forest' ? 11 : 6.5);
      }
      if (i === 0 && j === 0) oy = h;
      hs[(j + 1) * P + (i + 1)] = h;
      if (inner) groundAttrs(world.seed, tp, wx, wz, bw, gd, j * V + i, lawnOf(world, tp, wx, wz));
    }
  }
  if (flora && cov) {
    // the slope of every point from the grid (as an ecotope node has it: the difference of its two neighbours),
    // then what the slope does to the woods: thinned on the steep, none on a cliff; the far land lifted under them
    for (let j = -1; j <= N + 1; j++) {
      for (let i = -1; i <= N + 1; i++) {
        const p = (j + 1) * P + (i + 1);
        let slope = tSlope[p];
        if (!(slope === slope)) {
          const a = i > -1 ? p - 1 : p;
          const b = i < N + 1 ? p + 1 : p;
          const c = j > -1 ? p - P : p;
          const d = j < N + 1 ? p + P : p;
          const gx = (tBed[b] - tBed[a]) / ((b - a) * step);
          const gz = (tBed[d] - tBed[c]) / (((d - c) / P) * step);
          slope = Math.sqrt(gx * gx + gz * gz);
        }
        const wood = tWood[p] * woodOnSlope(slope);
        hs[p] += wood * tLift[p];
        if (i < 0 || i > N || j < 0 || j > N) continue;
        const k = j * V + i;
        // (a lawn's vertex says how mown it is, negative: not how wooded)
        if (gd[k * 4 + 2] > 0) gd[k * 4 + 2] *= woodOnSlope(slope);
        rowFinish(world.seed, x0 + i * step, z0 + j * step, tRow, k * 4, 1 - wood, slope, cov, k);
      }
    }
    oy = hs[P + 1];
  }
  const n = V * V + 4 * V;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const skirtDepth = step * 1.2 + 2;
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const k = j * V + i;
      const h = hs[(j + 1) * P + (i + 1)];
      pos[k * 3] = i * step;
      pos[k * 3 + 1] = h - oy;
      pos[k * 3 + 2] = j * step;
      const dhx = (hs[(j + 1) * P + (i + 2)] - hs[(j + 1) * P + i]) / (2 * step);
      const dhz = (hs[(j + 2) * P + (i + 1)] - hs[j * P + (i + 1)]) / (2 * step);
      const inv = 1 / Math.sqrt(dhx * dhx + 1 + dhz * dhz);
      nrm[k * 3] = -dhx * inv;
      nrm[k * 3 + 1] = inv;
      nrm[k * 3 + 2] = -dhz * inv;
    }
  }
  // skirts copy their edge vertex, pushed down
  const base = V * V;
  const copy = (dst: number, src: number): void => {
    pos[dst * 3] = pos[src * 3];
    pos[dst * 3 + 1] = pos[src * 3 + 1] - skirtDepth;
    pos[dst * 3 + 2] = pos[src * 3 + 2];
    for (let c = 0; c < 3; c++) nrm[dst * 3 + c] = nrm[src * 3 + c];
    for (let c = 0; c < 4; c++) {
      gd[dst * 4 + c] = gd[src * 4 + c];
      bw[dst * 4 + c] = bw[src * 4 + c];
    }
    if (cov) {
      cov[dst * 2] = cov[src * 2];
      cov[dst * 2 + 1] = cov[src * 2 + 1];
    }
    if (alt) alt[dst] = alt[src];
  };
  for (let i = 0; i <= N; i++) {
    copy(base + i, i);
    copy(base + V + i, N * V + i);
    copy(base + 2 * V + i, i * V);
    copy(base + 3 * V + i, i * V + N);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('aBiomeW', new THREE.BufferAttribute(bw, 4));
  g.setAttribute('aGround', new THREE.BufferAttribute(gd, 4));
  if (cov) g.setAttribute('aCover', new THREE.BufferAttribute(cov, 2));
  if (alt) g.setAttribute('aAlt', new THREE.BufferAttribute(alt, 1));
  g.setIndex(terrainIndex());
  g.computeBoundingSphere();
  return { geometry: g, wx: x0, wy: oy, wz: z0, chapters: [cFirst, cLast] };
}

// ---------------------------------------------------------------------------------------------- scatter

export const TILE = 128;
const CELL = 8;

export interface ScatterKinds {
  broadleaf: THREE.BufferGeometry;
  broadleaf2: THREE.BufferGeometry;
  broadleaf3: THREE.BufferGeometry;
  broadleafFar: THREE.BufferGeometry;
  conifer: THREE.BufferGeometry;
  conifer2: THREE.BufferGeometry;
  coniferFar: THREE.BufferGeometry;
  bush: THREE.BufferGeometry;
  bushFar: THREE.BufferGeometry;
  rock: THREE.BufferGeometry;
  cactus: THREE.BufferGeometry;
}

export function buildScatterKinds(): ScatterKinds {
  const plants = buildPlants();
  const b = new ModelBuilder();
  b.sphere(0, 0.25, 0, 0.6, 0xffffff, 0);
  const rock = b.build();
  return { ...plants, rock };
}

const SHADOW_RADIUS: Record<string, number> = { broadleaf: 1.9, broadleaf2: 1.8, broadleaf3: 2.4, bushFar: 0.8, conifer: 1.5, conifer2: 1.3, bush: 0.8, cactus: 0.5, rock: 0.6 };

export interface ScatterBatch {
  kind: keyof ScatterKinds | 'shadow';
  matrices: Float32Array;
  colors: Float32Array;
  count: number;
}

const m4 = new THREE.Matrix4();
const quat = new THREE.Quaternion();
const eul = new THREE.Euler();
const v3 = new THREE.Vector3();
const sc = new THREE.Vector3();

/** Decide what grows on tile (tx, tz). Positions depend only on world cells, never on the tile or LOD. */
export function buildScatter(world: World, tx: number, tz: number, far: boolean, discs = true): { batches: ScatterBatch[]; wx: number; wy: number; wz: number } {
  const x0 = tx * TILE;
  const z0 = tz * TILE;
  const per = TILE / CELL;
  const lists: Record<string, { m: number[]; c: number[] }> = {};
  const sun = globals.uSunDir.value;
  // instance colour = the two palette slots of the spot and the share of the second (the painted materials pick their paints by it)
  const push = (kind: string, x: number, y: number, z: number, s: number, sy: number, rot: number, lean: number, bi: number): void => {
    const l = (lists[kind] ??= { m: [], c: [] });
    eul.set(lean * Math.cos(rot * 3), rot, lean * Math.sin(rot * 3));
    quat.setFromEuler(eul);
    m4.compose(v3.set(x - x0, y - oy, z - z0), quat, sc.set(s, s * sy, s));
    for (let i = 0; i < 16; i++) l.m.push(m4.elements[i]);
    void bi;
    l.c.push(tp.ca & 3, tp.cb & 3, tp.bt);
    // a soft shadow disc on the ground, pushed away from the sun
    const r = SHADOW_RADIUS[kind];
    if (r && !far && discs) {
      const sh = (lists.shadow ??= { m: [], c: [] });
      m4.compose(v3.set(x - x0 - sun.x * r * 0.6 * s, y - oy + 0.12, z - z0 - sun.z * r * 0.6 * s), quat.identity(), sc.set(r * s * 2.3, 1, r * s * 2.3));
      for (let i = 0; i < 16; i++) sh.m.push(m4.elements[i]);
      sh.c.push(1, 1, 1);
    }
  };
  world.shape(x0 + TILE / 2, z0 + TILE / 2, tp);
  const oy = tp.h;
  for (let j = 0; j < per; j++) {
    for (let i = 0; i < per; i++) {
      const cx = tx * per + i;
      const cz = tz * per + j;
      const h = hash2(cx, cz, world.seed + 0x7ee5);
      const r0 = (h & 0xffff) / 65536;
      const r1 = ((h >>> 16) & 0xffff) / 65536;
      const h2 = hash2(cz, cx, world.seed + 0x1eaf);
      const r2 = (h2 & 0xffff) / 65536;
      const r3 = ((h2 >>> 16) & 0xffff) / 65536;
      const wx = (cx + 0.15 + 0.7 * r0) * CELL;
      const wz = (cz + 0.15 + 0.7 * r1) * CELL;
      world.shape(wx, wz, tp);
      const ad = tp.d < 0 ? -tp.d : tp.d;
      if (ad < 7.5) continue;
      // nothing grows in the water or on the wet shore, nor on the ground of a place by the road
      if (tp.wl > tp.bed - 0.9 || tp.site > 0.2 || tp.plot > 0.9) continue;
      const bi = (tp.bt < 0.5 ? tp.ba : tp.bb) | 0;
      // (whose plants grow here: the region's own where the rules below know it, else its kin's)
      const id = floraOf(bi);
      // a coast road keeps its view: between the road and the water only the odd low bush
      if (world.sea.open(tp.s, tp.d) > 0.5) {
        if (!far && r2 > 0.988) push('bush', wx, tp.h, wz, 0.6 + 0.5 * r3, 0.55 + 0.2 * r1, r0 * 6.283, 0, bi);
        continue;
      }
      // the odd old tree close to the road (its shadow reaches across in the afternoon); in a forest the
      // trees stand at the road's edge on both sides and close over it
      if (ad < 13) {
        if (id === 'forest') {
          if (ad > 8.6 && r2 < 0.2) push(far ? 'broadleafFar' : (['broadleaf2', 'broadleaf', 'broadleaf3'] as const)[(h2 >>> 9) % 3], wx, tp.h - 0.15, wz, 1.5 + 0.6 * r3, 1.05 + 0.25 * r1, r0 * 6.283, 0.04, bi);
        } else if ((id === 'plains' || id === 'lakes' || id === 'maple') && r2 < 0.045) push(far ? 'broadleafFar' : (['broadleaf', 'broadleaf3'] as const)[(h2 >>> 9) & 1], wx, tp.h - 0.1, wz, 1.05 + 0.4 * r3, 0.95, r0 * 6.283, 0.06, bi);
        continue;
      }
      // (the forest belt beyond 450 m is painted by the far-woods cards, not modelled tree by tree)
      const wood = woodland(bi, world.seed, wx, wz, ad, tp.relief, false);
      const size = 0.8 + 0.7 * r3;
      const rot = r0 * 6.283;
      if (id === 'plains') {
        // groves and hedgerows: trees and bushes gather where a slow noise says so, with open meadow between
        // (the noise is only looked up for cells whose dice could make them a tree or a bush at all)
        const maybeTree = r2 < wood * 0.36 + 0.084;
        const maybeBush = r2 > 0.8 - wood * 0.1;
        const grove = maybeTree ? fbm2(wx / 150, wz / 150, world.seed + 0x62f, 2) : 0;
        const hedge = maybeBush ? fbm2(wx / 70, wz / 70, world.seed + 0x63a, 2) : 0;
        const treeP = wood * 0.36 + 0.004 + (grove > 0.32 ? 0.08 : 0);
        const bushP = wood * 0.1 + (hedge > 0.26 ? 0.2 : 0.012);
        if (r2 < treeP) push(far ? 'broadleafFar' : (['broadleaf', 'broadleaf2', 'broadleaf3'] as const)[(h2 >>> 8) % 3], wx, tp.h - 0.1, wz, 0.62 + 0.85 * r3 * r3 + 0.15 * r1, 0.9 + 0.3 * r0, rot, 0.05, bi);
        // far off, a bush is a far tree sunk to its crown: one mesh per tile instead of two
        else if (r2 > 1 - bushP) {
          if (far) push('broadleafFar', wx, tp.h - 2.0 * size * 0.6, wz, size * 0.6, 0.7, rot, 0, bi);
          else push('bush', wx, tp.h, wz, size * (1.1 + 0.6 * r1), 0.75 + 0.4 * r1, rot, 0, bi);
        }
        else if (!far && r2 > 0.935 && r2 < 0.94) push('rock', wx, tp.h, wz, size * 1.3, 0.7, rot, 0.2, bi);
      } else if (id === 'forest') {
        // tall trees close together, two in three broadleaved, the rest dark firs; little under them
        const treeP = wood * 0.42;
        if (r2 < treeP) {
          if (far) push('broadleafFar', wx, tp.h - 0.1, wz, 1.45 + 0.7 * r3, 1.05 + 0.3 * r0, rot, 0.04, bi);
          else if (((h2 >>> 8) & 7) < 5) push((['broadleaf2', 'broadleaf', 'broadleaf3'] as const)[(h2 >>> 11) % 3], wx, tp.h - 0.15, wz, 1.3 + 0.8 * r3 * r3 + 0.2 * r1, 1.1 + 0.35 * r0, rot, 0.04, bi);
          else push('conifer2', wx, tp.h - 0.15, wz, 1.5 + 0.7 * r3, 1.05 + 0.4 * r1, rot, 0.03, bi);
        } else if (!far && r2 > 0.955) push('bush', wx, tp.h, wz, size * (0.9 + 0.5 * r1), 0.7 + 0.3 * r1, rot, 0, bi);
      } else if (id === 'lakes') {
        // copses on the rises; willows and scrub along every shore
        const shore = tp.wl > -1e8 && tp.bed - tp.wl < 3.2;
        const maybeTree = r2 < wood * 0.3 + 0.07;
        const grove = maybeTree ? fbm2(wx / 150, wz / 150, world.seed + 0x62f, 2) : 0;
        const treeP = wood * 0.3 + 0.003 + (grove > 0.36 ? 0.06 : 0);
        if (r2 < treeP) push(far ? 'broadleafFar' : (['broadleaf3', 'broadleaf', 'broadleaf2'] as const)[(h2 >>> 8) % 3], wx, tp.h - 0.1, wz, 0.7 + 0.8 * r3 * r3 + 0.15 * r1, 0.85 + 0.3 * r0, rot, 0.05, bi);
        else if (r2 > (shore ? 0.72 : 0.975)) {
          if (far) push('broadleafFar', wx, tp.h - 2.0 * size * 0.6, wz, size * 0.6, 0.7, rot, 0, bi);
          else push('bush', wx, tp.h, wz, size * (shore ? 1.4 + 0.8 * r1 : 1.1 + 0.6 * r1), shore ? 1.0 + 0.5 * r1 : 0.75 + 0.4 * r1, rot, 0, bi);
        }
      } else if (id === 'maple') {
        // maples in groves all over the slopes, a dark fir among them here and there
        const maybeTree = r2 < wood * 0.42 + 0.1;
        const grove = maybeTree ? fbm2(wx / 140, wz / 140, world.seed + 0x62f, 2) : 0;
        const treeP = wood * 0.4 + 0.006 + (grove > 0.3 ? 0.09 : 0);
        if (r2 < treeP) {
          if (far) push('broadleafFar', wx, tp.h - 0.1, wz, 0.9 + 0.8 * r3, 0.9 + 0.3 * r0, rot, 0.05, bi);
          else if (((h2 >>> 8) & 15) < 14) push((['broadleaf', 'broadleaf2', 'broadleaf3'] as const)[(h2 >>> 12) % 3], wx, tp.h - 0.1, wz, 0.75 + 0.85 * r3 * r3 + 0.15 * r1, 0.9 + 0.3 * r0, rot, 0.05, bi);
          else push('conifer', wx, tp.h - 0.15, wz, 1.1 + 0.5 * r3, 1.0 + 0.4 * r1, rot, 0.04, bi);
        } else if (r2 > 0.9) {
          if (far) push('broadleafFar', wx, tp.h - 2.0 * size * 0.6, wz, size * 0.6, 0.7, rot, 0, bi);
          else push('bush', wx, tp.h, wz, size * (1.0 + 0.6 * r1), 0.75 + 0.4 * r1, rot, 0, bi);
        } else if (!far && r2 > 0.87 && r2 < 0.876) push('rock', wx, tp.h, wz, size * 1.3, 0.7, rot, 0.2, bi);
      } else if (id === 'alpine') {
        if (r2 < wood * 0.55 + 0.006 && tp.relief < 230) push(far ? 'coniferFar' : h & 0x10000 ? 'conifer2' : 'conifer', wx, tp.h - 0.15, wz, size * 1.15, 0.9 + 0.55 * r1, rot, 0.05, bi);
        else if (!far && r2 > 0.972) push('rock', wx, tp.h, wz, size * 1.8, 0.75, rot, 0.25, bi);
      } else {
        if (r2 < 0.012 + wood * 0.08) push('cactus', wx, tp.h - 0.05, wz, size * 0.9, 0.85 + 0.5 * r1, rot, 0.03, bi);
        else if (!far && r2 > 0.93) push('bush', wx, tp.h - 0.05, wz, size * 0.75, 0.6, rot, 0, bi);
        else if (!far && r2 > 0.905 && r2 < 0.92) push('rock', wx, tp.h, wz, size * 1.5, 0.7, rot, 0.25, bi);
      }
    }
  }
  const batches: ScatterBatch[] = [];
  for (const [kind, l] of Object.entries(lists)) {
    batches.push({ kind: kind as ScatterBatch['kind'], matrices: new Float32Array(l.m), colors: new Float32Array(l.c), count: l.c.length / 3 });
  }
  return { batches, wx: x0, wy: oy, wz: z0 };
}

// ---------------------------------------------------------------------------------------------- poles

const POLE_EVERY = 24; // stations (48 m)
const POLE_OFFSET = -8.6;
const POLE_H = 7.4;

export interface Pole {
  x: number;
  y: number;
  z: number;
  phi: number;
  /** 0 standing, 1 leaning hard, 2 snapped (a stump), 3 gone */
  state: number;
  /** top of the pole, where the wires hang */
  tx: number;
  ty: number;
  tz: number;
}

export function makePole(): Pole {
  return { x: 0, y: 0, z: 0, phi: 0, state: 0, tx: 0, ty: 0, tz: 0 };
}

/** Where pole number `poleIndex` stands and what the years have done to it. */
export function polePosition(world: World, poleIndex: number, out: Pole): void {
  const sp = world.spine;
  const s = poleIndex * POLE_EVERY * sp.ds;
  sp.at(s, st);
  const nx = -Math.sin(st.phi);
  const nz = Math.cos(st.phi);
  out.x = st.x + nx * POLE_OFFSET;
  out.z = st.z + nz * POLE_OFFSET;
  world.shape(out.x, out.z, tp);
  out.y = tp.bed;
  out.phi = st.phi;
  const h = hash2(poleIndex, 77, world.seed);
  const r = (h & 0xfff) / 4096;
  out.state = r < 0.07 ? 3 : r < 0.16 ? 2 : r < 0.34 ? 1 : 0;
  // the line does not cross a river on poles, and none stands in the water
  if (tp.bridge > 0.02 || tp.wl > tp.bed - 0.3) out.state = 3;
  // nor on the ground of a place: whoever built the forecourt took the pole away
  if (tp.site > 0.3 || tp.plot > 0.3 || (world.deadEnd && s < 0)) out.state = 3;
  const lean = out.state === 1 ? 0.2 + 0.22 * (((h >>> 12) & 255) / 255) : 0.02 + 0.07 * (((h >>> 12) & 255) / 255);
  const dir = (((h >>> 20) & 1023) / 1023) * Math.PI * 2;
  const hgt = out.state === 2 ? 2.1 : POLE_H;
  out.tx = out.x + Math.cos(dir) * Math.sin(lean) * hgt;
  out.tz = out.z + Math.sin(dir) * Math.sin(lean) * hgt;
  out.ty = out.y + Math.cos(lean) * hgt;
}

const poleA = makePole();
const poleB = makePole();
const RUST = 0x93583b;

function addSign(b: PaintBuilder, wx: number, wy: number, wz: number, yaw: number, h: number, ox: number, oy: number, oz: number): void {
  const r = (n: number): number => ((h >>> n) & 255) / 255;
  const fallen = r(2) > 0.82;
  eul.set(fallen ? 1.45 : (r(6) - 0.5) * 0.5, yaw, fallen ? 0.2 : (r(11) - 0.3) * 0.45, 'YXZ');
  quat.setFromEuler(eul);
  m4.compose(v3.set(wx - ox, wy - oy - 0.1, wz - oz), quat, sc.set(1, 1, 1));
  b.within(m4, () => {
    b.bar(0, 0, 0, 0, 2.5, 0, 0.07, 0x7b7f84);
    const kind = h % 3;
    if (kind === 0) {
      b.box(0, 2.15, 0, 0.04, 0.62, 0.95, 0x5a84a6);
      b.box(0.022, 2.15, 0, 0.01, 0.2, 0.7, 0xdcd6c2);
    } else if (kind === 1) {
      b.box(0, 2.1, 0, 0.04, 0.7, 0.7, 0xd0a04a, { rx: Math.PI / 4 });
    } else {
      b.cyl(0, 2.15, 0, 0.36, 0.04, 0xcfc9b8, { rz: Math.PI / 2, segments: 12 });
      b.cyl(0.022, 2.15, 0, 0.3, 0.012, 0xb14a3c, { rz: Math.PI / 2, segments: 12 });
    }
    b.box(0.03, 2.0, 0.2, 0.012, 0.22, 0.3, RUST);
  });
}

const fPosts: RoadPost[] = [];
const fRails: RailRun[] = [];
const RAIL_STEEL = 0x9aa3a6;
const RAIL_RUST = 0x8f6a4f;

/** delineators, kilometre stones, chevron boards and guard rails between two arc lengths (core/world/furniture.ts) */
function addFurniture(b: PaintBuilder, world: World, s0: number, s1: number, ox: number, oy: number, oz: number): void {
  const sp = world.spine;
  fPosts.length = 0;
  fRails.length = 0;
  world.furniture.between(s0, s1, fPosts, fRails);
  for (const p of fPosts) {
    const x = p.x - ox;
    const y = p.y - oy;
    const z = p.z - oz;
    // most stand straight; the leaning ones lean any way
    const postColor = world.rules.version >= 2 && roadStyleAt(world,p.s).rail === 'wood' ? 0x806649 : 0xe9e6dc;
    const lean = p.state === 1 ? 0.22 + 0.3 * (((p.h >>> 16) & 255) / 255) : 0.02;
    const dir = (((p.h >>> 20) & 1023) / 1023) * 6.283;
    const tx = Math.cos(dir) * Math.sin(lean);
    const tz = Math.sin(dir) * Math.sin(lean);
    const ty = Math.cos(lean);
    if (p.state === 2) {
      // laid flat by a car: it lies in the grass the way the car was going
      const fx = Math.cos(p.fall);
      const fz = Math.sin(p.fall);
      if (p.kind === 'delineator') {
        b.bar(x, y + 0.06, z, x + fx * 1.18, y + 0.08, z + fz * 1.18, 0.12, postColor);
        b.bar(x + fx * 0.82, y + 0.065, z + fz * 0.82, x + fx * 1.08, y + 0.075, z + fz * 1.08, 0.132, 0x30353a);
      } else if (p.kind === 'chevron') {
        b.bar(x, y + 0.045, z, x + fx * 1.95, y + 0.055, z + fz * 1.95, 0.09, 0x7b7f84);
        m4.makeRotationY(-p.fall + Math.PI / 2).setPosition(x + fx * 1.5, y + 0.08, z + fz * 1.5);
        b.within(m4, () => b.box(0, 0, 0, 1.36, 0.05, 0.8, 0xe0a23c));
      }
      continue;
    }
    if (p.kind === 'delineator') {
      // (tall enough to stand clear of the weeds that have come up round it)
      b.bar(x, y - 0.15, z, x + tx * 1.18, y + ty * 1.18, z + tz * 1.18, 0.12, postColor);
      // a dark band near the top with the reflector in it: red on the right, pale on the left
      b.bar(x + tx * 0.82, y + ty * 0.82, z + tz * 0.82, x + tx * 1.08, y + ty * 1.08, z + tz * 1.08, 0.132, 0x30353a);
      b.bar(x + tx * 0.89, y + ty * 0.89, z + tz * 0.89, x + tx * 1.01, y + ty * 1.01, z + tz * 1.01, 0.14, p.side > 0 ? 0xc9503c : 0xe6dcc0);
    } else if (p.kind === 'kmstone') {
      // a milestone as they used to be cast: a pale block with a red head, waist high
      b.box(x, y + 0.42, z, 0.3, 0.96, 0.46, 0xd9d3c6, { ry: -p.phi });
      b.box(x, y + 0.8, z, 0.315, 0.22, 0.475, 0xc9503c, { ry: -p.phi });
    } else {
      // a chevron board square to the road: yellow, two dark arrowheads pointing round the bend (towards the road's side)
      b.bar(x, y - 0.1, z, x + tx * 1.95, y + ty * 1.95, z + tz * 1.95, 0.09, 0x7b7f84);
      m4.makeRotationY(-p.phi).setPosition(x + tx * 1.5, y + ty * 1.5, z + tz * 1.5);
      b.within(m4, () => {
        b.box(0, 0, 0, 0.05, 0.8, 1.36, 0xe0a23c);
        for (const fx of [-0.032, 0.032]) {
          for (const cz of [-0.29, 0.31]) {
            b.box(fx, 0.155, cz, 0.012, 0.46, 0.14, 0x30353a, { rx: -0.7 * p.side });
            b.box(fx, -0.155, cz, 0.012, 0.46, 0.14, 0x30353a, { rx: 0.7 * p.side });
          }
        }
      });
    }
  }
  // guard rails: a post every four metres and two thin beams between (the old W-beam, seen from a car)
  for (const r of fRails) {
    let px = 0;
    let py = 0;
    let pz = 0;
    for (let s = r.s0, i = 0; s <= r.s1 + 1e-6; s += RAIL_STEP, i++) {
      sp.at(s, st);
      const wx = st.x - Math.sin(st.phi) * r.side * RAIL_AT;
      const wz = st.z + Math.cos(st.phi) * r.side * RAIL_AT;
      world.shape(wx, wz, tp);
      const x = wx - ox;
      const y = tp.h - oy;
      const z = wz - oz;
      const hh = hash2(Math.round(s / RAIL_STEP), r.side + 11, world.seed);
      if (world.rules.version >= 2 && roadStyleAt(world,s-RAIL_STEP/2).rail !== 'steel') {
        px = x; py = y; pz = z;
        continue;
      }
      const steel = (hh & 0xff) < 70 ? RAIL_RUST : RAIL_STEEL;
      b.bar(x, y - 0.25, z, x, y + 0.74, z, 0.1, 0x6f6a62);
      if (i > 0) {
        // (a beam hit long ago sags)
        const sag = (hh & 0xff00) < 0x1400 ? 0.16 : 0;
        b.bar(px, py + 0.66, pz, x, y + 0.66 - sag, z, 0.085, steel);
        b.bar(px, py + 0.5, pz, x, y + 0.5 - sag, z, 0.085, (hh & 0x10000) !== 0 ? RAIL_RUST : RAIL_STEEL);
      }
      px = x;
      py = y;
      pz = z;
    }
  }
}

/** Poles, wires, signs and the road's edge furniture whose station falls inside strip chunks c … c + span − 1. */
export function buildPoles(world: World, c: number, span = 1): { poles: THREE.BufferGeometry | null; wires: THREE.BufferGeometry | null; wx: number; wy: number; wz: number } {
  const i0 = c * STRIP_STATIONS;
  const first = Math.ceil(i0 / POLE_EVERY);
  const last = Math.ceil((i0 + STRIP_STATIONS * span) / POLE_EVERY) - 1;
  const sp = world.spine;
  sp.at(i0 * sp.ds, st);
  const ox = st.x;
  const oy = st.y;
  const oz = st.z;
  const b = new PaintBuilder();
  const wire: number[] = [];
  const a = poleA;
  const n = poleB;
  const WOOD = 0x6e5a4a;
  for (let p = first; p <= last; p++) {
    polePosition(world, p, a);
    if (a.state === 3) continue;
    const cs = Math.cos(a.phi);
    const sn = Math.sin(a.phi);
    const x = a.x - ox;
    const y = a.y - oy;
    const z = a.z - oz;
    const tx = a.tx - ox;
    const ty = a.ty - oy;
    const tz = a.tz - oz;
    b.bar(x, y - 0.3, z, tx, ty, tz, 0.2, WOOD);
    if (a.state === 2) {
      // the rest of it lies in the grass beside the stump
      b.bar(x + 0.6, y + 0.12, z + 0.3, x + 0.6 + cs * 4.8, y + 0.25, z + 0.3 + sn * 4.8, 0.19, WOOD);
      continue;
    }
    // cross-arm runs across the road direction
    b.bar(tx - -sn * 1.1, ty - 0.5, tz - cs * 1.1, tx + -sn * 1.1, ty - 0.5, tz + cs * 1.1, 0.1, WOOD);
    polePosition(world, p + 1, n);
    if (n.state >= 2) continue;
    const hw = hash2(p, 0x31e, world.seed);
    const ncs = Math.cos(n.phi);
    const nsn = Math.sin(n.phi);
    for (const off of [-1, 0, 1]) {
      const pick = (hw >>> ((off + 1) * 8)) & 255;
      if (pick < 56) continue; // this wire came down long ago
      const drooping = pick > 232;
      const ax = tx + -sn * off;
      const ay = ty - 0.42;
      const az = tz + cs * off;
      const bx = n.tx - ox + -nsn * off;
      const by = n.ty - oy - 0.42;
      const bz = n.tz - oz + ncs * off;
      const SEG = 6;
      const sag = drooping ? 5.2 : 1.1;
      for (let k = 0; k < SEG; k++) {
        const u0 = k / SEG;
        const u1 = (k + 1) / SEG;
        wire.push(ax + (bx - ax) * u0, ay + (by - ay) * u0 - sag * 4 * u0 * (1 - u0), az + (bz - az) * u0);
        wire.push(ax + (bx - ax) * u1, ay + (by - ay) * u1 - sag * 4 * u1 * (1 - u1), az + (bz - az) * u1);
      }
    }
  }
  // old road signs: one slot every 160 m, one in five has one (the wrecks and crates on the verges are
  // places of their own now: core/world/sites.ts)
  const SLOT = 80;
  for (let k = Math.ceil(i0 / SLOT); k * SLOT < i0 + STRIP_STATIONS * span; k++) {
    const h = hash2(k, 0xabc, world.seed);
    const pick = (h & 1023) / 1023;
    if (pick > 0.5 || pick < 0.3 || k < 1) continue;
    sp.at(k * SLOT * sp.ds, st);
    const side = h & 0x400 ? 1 : -1;
    const d = side * 5.3;
    const wx = st.x - Math.sin(st.phi) * d;
    const wz = st.z + Math.cos(st.phi) * d;
    world.shape(wx, wz, tp);
    if (tp.bridge > 0.02 || tp.wl > tp.bed - 0.3 || tp.site > 0.2 || tp.plot > 0.2) continue;
    addSign(b, wx, tp.h, wz, -st.phi, h, ox, oy, oz);
  }
  addFurniture(b, world, i0 * sp.ds, (i0 + STRIP_STATIONS * span) * sp.ds, ox, oy, oz);
  const poles = b.triangles > 0 ? b.build() : null;
  let wires: THREE.BufferGeometry | null = null;
  if (wire.length) {
    wires = new THREE.BufferGeometry();
    wires.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wire), 3));
    wires.computeBoundingSphere();
  }
  return { poles, wires, wx: ox, wy: oy, wz: oz };
}

export { ROAD_EDGE };

// ---------------------------------------------------------------------------------------------- grass

const GS = STYLE.grass;
export const GRASS_TILE = GS.tile;
/** one tuft per cell of this size (m) */
export const GRASS_CELL = GS.cell;
/** tiles nearer than this (m) hold every tuft; further ones only the share below GRASS_KEEP_FAR */
export const GRASS_NEAR = GS.nearTileM;
export const GRASS_KEEP_FAR = GS.keepFar;
/** where the extra tufts of near tiles have shrunk away, and where the rest go (m) */
export const GRASS_FADE = { extra: GS.fadeExtra, all: GS.fadeAll } as const;
export const GRASS_RADIUS = GS.radius;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One tuft: five tapered blades leaning out from a small clump, one triangle each.
 * aTip = 0 at the root, 1 at the tip; aBlade = a random number per blade (its own shade and sway).
 */
export function buildGrassTuft(): THREE.BufferGeometry {
  const rnd = mulberry32(5150);
  const pos: number[] = [];
  const tip: number[] = [];
  const blade: number[] = [];
  const n = GS.bladesPerTuft;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rnd() * 0.9;
    const off = 0.03 + 0.07 * rnd();
    const bx = Math.cos(a) * off;
    const bz = Math.sin(a) * off;
    // the blade faces across its lean, so from most directions some blades are broadside
    const fa = a + Math.PI / 2 + (rnd() - 0.5) * 1.2;
    const w = 0.018 + 0.02 * rnd();
    const h = 0.42 + 0.7 * rnd() * rnd() + 0.2 * rnd();
    // all blades of a meadow lean the same way (+x here; each tuft is turned only a little)
    const lean = 0.12 + 0.26 * rnd();
    const la = (rnd() - 0.5) * 1.9;
    const r = rnd();
    pos.push(bx - Math.cos(fa) * w, 0, bz - Math.sin(fa) * w, bx + Math.cos(fa) * w, 0, bz + Math.sin(fa) * w, bx + Math.cos(la) * lean, h, bz + Math.sin(la) * lean);
    tip.push(0, 0, 1);
    blade.push(r, r, r);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aTip', new THREE.BufferAttribute(new Float32Array(tip), 1));
  g.setAttribute('aBlade', new THREE.BufferAttribute(new Float32Array(blade), 1));
  return g;
}

/** A flower: a thin stalk and a head of two crossed quads. aHead = 1 on the head. */
export function buildFlower(): THREE.BufferGeometry {
  const pos: number[] = [];
  const head: number[] = [];
  const uv: number[] = [];
  const h = 0.5;
  pos.push(-0.008, 0, 0, 0.008, 0, 0, 0.02, h, 0);
  head.push(0, 0, 0);
  uv.push(0, 0, 0, 0, 0, 0);
  const r = 0.055;
  for (const [ax, az] of [[1, 0], [0, 1]]) {
    const c = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, -1],
      [1, 1],
      [-1, 1],
    ];
    for (const [u, v] of c) {
      pos.push(0.02 + ax * u * r, h + v * r * 0.8 + 0.02, az * u * r);
      head.push(1);
      uv.push(u, v);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aHead', new THREE.BufferAttribute(new Float32Array(head), 1));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  return g;
}

export interface GrassTile {
  /** per tuft: root (tile-local x, y, z) and size */
  roots: Float32Array;
  /** per tuft: palette slots (a + 4 b), share of b, a random number (which tufts far tiles keep), turn */
  info: Float32Array;
  count: number;
  flowerRoots: Float32Array;
  /** per flower: colour index (in a world of version 2: its colour itself, 0xRRGGBB), random, turn, palette slot */
  flowerInfo: Float32Array;
  flowers: number;
  wx: number;
  wy: number;
  wz: number;
}

const GRID = 2;
/** a world of version 2: the cover's grass at its thickest is this share of the cells with a tuft, a grass of this height (m) is a tuft of size 1 */
const COVER_GROW = 1.15;
const COVER_HEIGHT = 0.43;
/** … and where its flowers are a carpet, this share of the tufts carry one: in a meadow, and in a row of a field */
const COVER_FLOWERS = 0.55;
const ROW_FLOWERS = 0.8;
const cb = new CoverBase();

/**
 * What the grass is at one point of the land: the 2 m samples a grass tile reads its tufts from (grassSlices) and
 * the meadow's map holds for its blades (scene/meadow.ts), one function for both.
 */
export class MeadowSample {
  /** the ground's height (m) and the distance from the road's centre line (m) */
  y = 0;
  ad = 0;
  /** 1 where no grass may stand (in or beside water, on a bridge, a place's ground, a bare plot), else 0 */
  bare = 0;
  /** towards a shore the meadow is grazed short (and the water shows over it): 0 … about 1.2 */
  shore = 0;
  /** how much grows (the share of cells with a tuft), how lush the weeds on the old road are, the tufts' size */
  grow = 0;
  lush = 0;
  size = 0;
  /** flowers: 0 none … 1 a carpet */
  flowers = 0;
  /** the palette slots it is painted from (a + 4 b), the share of b, and the nearer slot */
  pair = 0;
  share = 0;
  slot = 0;
  /** how mown it is (a plot of the caller's: Plot.grass), 1 not at all */
  mow = 1;
  /** how tall the grass itself is (m): a world of version 2's cover; else the tufts' size in the same measure */
  tall = 0;
  /**
   * a world of version 2: the land's slope, how far its rows are bent off the z axis, how fully the country is
   * cut into benches and their step, the region whose cover it is, and how wooded it is (the ecotope's canopy)
   */
  slope = 0;
  bend = 0;
  terrace = 0;
  step = 0;
  region = 0;
  canopy = 0;
}
const ms = new MeadowSample();

/** what the grass is at (x, z) (MeadowSample), as the grass of a tile has always read it */
export function meadowSample(world: World, x: number, z: number, out: MeadowSample): MeadowSample {
  world.shape(x, z, tp);
  out.y = tp.bed;
  // (… nor on the sand of a sea beach)
  out.bare = tp.bridge > 0.02 || tp.wl > tp.bed - (tp.wkind === 3 ? 1.3 : 0.45) || tp.site > 0.5 || (tp.plot > 0.999 && world.plotBare(x, z)) || world.sites.bareAt(x, z) ? 1 : 0;
  // towards a shore the meadow is grazed short (and the water shows over it)
  out.shore = Math.max(tp.wl > -1e8 ? Math.max(0, 1 - (tp.bed - tp.wl) / 3) : 0, 1.2 * world.sea.open(tp.s, tp.d));
  out.ad = tp.d < 0 ? -tp.d : tp.d;
  const sa = BIOME_STYLES[tp.ba];
  const sb = BIOME_STYLES[tp.bb];
  const mixOf = (x: number | undefined, y: number | undefined, dflt: number): number => (x ?? dflt) + ((y ?? dflt) - (x ?? dflt)) * tp.bt;
  out.grow = mixOf(sa.grassGrow, sb.grassGrow, 0.5);
  out.lush = mixOf(sa.grassLush, sb.grassLush, 0.6);
  out.size = mixOf(sa.grassSize, sb.grassSize, 0.85);
  out.flowers = mixOf(sa.flowerAmount, sb.flowerAmount, 0);
  out.pair = (tp.ca & 3) + 4 * (tp.cb & 3);
  out.share = tp.bt;
  out.slot = (tp.bt < 0.5 ? tp.ca : tp.cb) & 3;
  out.mow = tp.plot > 0 ? world.plotGrass(x, z) : 1;
  out.tall = out.size * COVER_HEIGHT;
  out.slope = out.bend = out.terrace = out.step = out.region = out.canopy = 0;
  const field = world.eco;
  if (field) {
    // the cover's smooth part here; towards a shore the grass stands tall (reeds, wet meadow), except
    // where a coast road keeps its view over a beach
    field.at(x, z, eco);
    const region = eco.rt >= 0.5 ? eco.rb : eco.ra;
    const c = coverOf(region);
    out.canopy = eco.canopy;
    // (what the ecotope's nearest node says of roads, places and plots is too coarse for grass, and is
    // decided here as it always was: by the road's own distance, the places' ground, a plot's lawn)
    eco.flags = 0;
    coverBase(eco, c, cb);
    out.grow = cb.grass * COVER_GROW;
    // (a grass twice as tall is not drawn twice as tall: the tufts were always taller than the grass they stand for)
    out.size = Math.pow(cb.height / COVER_HEIGHT, 0.6);
    out.tall = cb.height;
    const biomeId = BIOMES[region].id;
    const profile = groundProfile(biomeId);
    if (profile) {
      // The separate profile clumps carry their own petals, month and seed.
      out.flowers = 0;
      const band = elevationBand(profile,siteElevation(biomeId,eco));
      if (!band || !band.ground.some(name => /草甸|禾草|莎草|丛草|雪草|旱草|高秆草|牧草|田埂草|刈草/.test(name))) out.grow *= 0.13;
    } else out.flowers = cb.flowers;
    out.slope = eco.slope;
    out.bend = c.rows ? rowCoord(world.seed, x, z) - z : 0;
    out.terrace = eco.terrace;
    out.step = eco.step;
    out.region = region;
    out.shore = 1.2 * world.sea.open(tp.s, tp.d);
    if (eco.waterKind === 2 && eco.waterDist < 9 && eco.slope < 0.48) {
      const grass = Math.max(0.02,eco.waterDist / 9);
      out.grow *= grass * grass;
      out.shore = Math.max(out.shore, 1 - grass);
    }
  }
  return out;
}

/** A build spread over several frames: it pauses at each `yield` (the end of a row) and returns its result. */
export type Slices<T> = Generator<void, T, void>;

/** run a sliced build to the end at once */
export function finish<T>(g: Slices<T>): T {
  for (;;) {
    const r = g.next();
    if (r.done) return r.value;
  }
}

/** Grass on tile (gx, gz), all at once (tests, tools). The world view builds it in slices. */
export function buildGrass(world: World, gx: number, gz: number, density: number, near: boolean, flowersOnly = false): GrassTile | null {
  return finish(grassSlices(world, gx, gz, density, near, flowersOnly));
}

/**
 * Grass on tile (gx, gz). Heights, road distance and biome come from a 2 m grid of world samples,
 * interpolated per tuft: the ground mesh is coarser than that. Pauses after every row.
 *
 * In a world of version 2 how much grass grows, how tall, and how many flowers of which colour are the flora
 * field's ground cover (core/world/flora.ts `FloraField.cover`), read the way floraCover.ts says: its smooth
 * part on the same 2 m grid, its rows — of the flower fields, of the crops on the terraces' benches — tuft by
 * tuft. The old road's weeds, a plot's lawn, the comb of a meadow and the fades are as they were.
 *
 * `flowersOnly`: the flowers alone, the same ones, and no tufts (a world of version 2 draws its grass as the
 * meadow's blades: scene/meadow.ts).
 */
export function* grassSlices(world: World, gx: number, gz: number, density: number, near: boolean, flowersOnly = false): Slices<GrassTile | null> {
  const x0 = gx * GRASS_TILE;
  const z0 = gz * GRASS_TILE;
  const G = GRASS_TILE / GRID + 1;
  const hs = new Float32Array(G * G);
  const ds = new Float32Array(G * G);
  // per sample: how much grass grows, how lush the weeds on the road are, how tall, how many flowers;
  // and which palette slots it is painted from
  const gGrow = new Float32Array(G * G);
  const gLush = new Float32Array(G * G);
  const gSize = new Float32Array(G * G);
  const gFlower = new Float32Array(G * G);
  const gPair = new Float32Array(G * G);
  const gShare = new Float32Array(G * G);
  const gSlot = new Float32Array(G * G);
  // how tall it grows there (a plot of the caller's may keep it mown: Plot.grass)
  const gMow = new Float32Array(G * G);
  // > 0 where grass must not stand: in or beside water, on a bridge
  const bare = new Float32Array(G * G);
  const shore = new Float32Array(G * G);
  // a world of version 2, per sample: the land's slope, how far its rows are bent off the z axis, how fully the
  // country is cut into benches and their step, and the region whose cover it is
  const field = world.eco;
  const gSlope = field ? new Float32Array(G * G) : null;
  const gBend = field ? new Float32Array(G * G) : null;
  const gTerr = field ? new Float32Array(G * G) : null;
  const gStep = field ? new Float32Array(G * G) : null;
  const gReg = field ? new Uint8Array(G * G) : null;
  let oy = 0;
  for (let j = 0; j < G; j++) {
    for (let i = 0; i < G; i++) {
      const k = j * G + i;
      const m = meadowSample(world, x0 + i * GRID, z0 + j * GRID, ms);
      hs[k] = m.y;
      bare[k] = m.bare;
      shore[k] = m.shore;
      ds[k] = m.ad;
      gGrow[k] = m.grow;
      gLush[k] = m.lush;
      gSize[k] = m.size;
      gFlower[k] = m.flowers;
      gPair[k] = m.pair;
      gShare[k] = m.share;
      gSlot[k] = m.slot;
      gMow[k] = m.mow;
      if (gSlope && gBend && gTerr && gStep && gReg) {
        gSlope[k] = m.slope;
        gBend[k] = m.bend;
        gTerr[k] = m.terrace;
        gStep[k] = m.step;
        gReg[k] = m.region;
      }
      if (i === 0 && j === 0) oy = m.y;
    }
    // (this grid is the dearer half: pause every few rows)
    if ((j & 3) === 3) yield;
  }
  const lerpGrid = (a: Float32Array, fx: number, fz: number): number => {
    const i = Math.min(G - 2, Math.floor(fx));
    const j = Math.min(G - 2, Math.floor(fz));
    const u = fx - i;
    const v = fz - j;
    const k = j * G + i;
    return (a[k] * (1 - u) + a[k + 1] * u) * (1 - v) + (a[k + G] * (1 - u) + a[k + G + 1] * u) * v;
  };
  const per = Math.round(GRASS_TILE / GRASS_CELL);
  const roots: number[] = [];
  const info: number[] = [];
  const fr: number[] = [];
  const fi: number[] = [];
  for (let j = 0; j < per; j++) {
    for (let i = 0; i < per; i++) {
      const cx = gx * per + i;
      const cz = gz * per + j;
      const h = hash2(cx, cz, world.seed + 0x6a55);
      const keep = ((h >>> 22) & 0x3ff) / 1024;
      if (!near && keep >= GRASS_KEEP_FAR) continue;
      const r0 = (h & 0x7ff) / 2048;
      const r1 = ((h >>> 11) & 0x7ff) / 2048;
      const lx = (i + r0) * GRASS_CELL;
      const lz = (j + r1) * GRASS_CELL;
      const fx = lx / GRID;
      const fz = lz / GRID;
      if (lerpGrid(bare, fx, fz) > 0.01) continue;
      const ad = lerpGrid(ds, fx, fz);
      // (slots are whole numbers: taken from the nearest sample, never interpolated)
      const kn = Math.min(G - 1, Math.round(fz)) * G + Math.min(G - 1, Math.round(fx));
      // how much grows here: lush on the plains, tufts in the desert, stalks through the snow
      let grow = lerpGrid(gGrow, fx, fz);
      const onRoad = ad < 4.9;
      if (onRoad) {
        // nobody mows any more: weeds in the shoulder, along the pavement edge and up the centre crack
        const lush = lerpGrid(gLush, fx, fz);
        grow = (ad > 3.25 ? 0.62 : ad > 2.8 ? 0.22 : ad > 2.55 ? 0.08 : ad < 0.28 ? 0.1 : 0.01) * lush;
      } else grow *= 0.6 + 0.4 * smoothstep(4.9, 9, ad);
      grow *= density;
      const h2 = hash2(cz, cx, world.seed + 0x2f1d);
      const r2 = (h2 & 0xffff) / 65536;
      if (r2 > grow) continue;
      const r3 = ((h2 >>> 16) & 0xffff) / 65536;
      const y = lerpGrid(hs, fx, fz) - oy - 0.04;
      // short by the road, growing taller into the meadow: the verge is an edge, not a wall
      // (mown, a plot's: as tall as its share, and the tufts much the same height; the more mown, the more even)
      const mow = lerpGrid(gMow, fx, fz);
      const lawn = mow < 1 ? Math.min(1, (1 - mow) / 0.6) : 0;
      const f = 0.7 + 0.75 * r3 * r3 + 0.3 * r2;
      const size = (lawn > 0 ? Math.pow(f, 1 - 0.65 * lawn) * mow : f) * (onRoad ? 0.7 : 0.6 + 0.4 * smoothstep(4.9, 10, ad)) * lerpGrid(gSize, fx, fz) * (1 - 0.55 * lerpGrid(shore, fx, fz));
      if (!flowersOnly) {
        roots.push(lx, y, lz, size);
        // a meadow is combed one way: tufts turn only a little from the direction of the field
        const comb = fbm2((x0 + lx) / 60, (z0 + lz) / 60, world.seed + 0x3c0, 1) * 2.4;
        // (how mown it is rides in the slot number's spare fraction: the grass paints a lawn lusher and more even)
        info.push(gPair[kn] + 0.45 * lawn, gShare[kn], keep, comb + (r3 - 0.5) * 1.4);
      }
      // flowers grow in drifts across the meadows (not on a lawn)
      const flowers = lerpGrid(gFlower, fx, fz) * (1 - lawn);
      if (gSlope && gBend && gTerr && gStep && gReg) {
        // a world of version 2: the cover's flowers, in its colours — in rows where the region grows them
        // (one colour to a row), else in drifts of a colour
        const dice = r3 * 7.13 - Math.floor(r3 * 7.13);
        const c = coverOf(gReg[kn]);
        if (c.rows) {
          if (flowers > 0.01 && !onRoad && rowsRun(c.rows, lerpGrid(gSlope, fx, fz), gTerr[kn], gStep[kn], y + oy + 0.04)) {
            const pr = (z0 + lz + lerpGrid(gBend, fx, fz)) / c.rows.spacing;
            const rk = Math.floor(pr);
            if (pr - rk < c.rows.share) {
              // in a row the grass is short under the flowers, and the flowers many and large: a band of colour
              roots[roots.length - 1] *= 1 - 0.45 * flowers;
              if (near && dice < flowers * ROW_FLOWERS) {
                fr.push(lx + 0.05, y, lz - 0.04, (1.25 + 0.7 * r2) * (0.75 + 0.5 * flowers));
                fi.push(hueOf(c.hues, rowHue01(world.seed, rk)), keep, r1 * 6.283, gSlot[kn]);
              }
            }
          }
        } else if (near && flowers > 0.01 && !onRoad && dice < flowers * COVER_FLOWERS * 2.2) {
          const h01 = driftHue01(world.seed, x0 + lx, z0 + lz);
          if (dice < flowers * COVER_FLOWERS * (Math.abs(h01 - 0.5) > 0.14 ? 2.2 : 0.3)) {
            fr.push(lx + 0.05, y, lz - 0.04, 0.8 + 0.5 * r2);
            fi.push(hueOf(c.hues, h01), keep, r1 * 6.283, gSlot[kn]);
          }
        }
      } else if (near && flowers > 0.05 && !onRoad) {
        const drift = fbm2((x0 + lx) / 46, (z0 + lz) / 46, world.seed + 0x5ee, 2);
        const fp = (drift > 0.18 ? 0.16 : 0.012) * flowers;
        if (r3 * 7.13 - Math.floor(r3 * 7.13) < fp) {
          fr.push(lx + 0.05, y, lz - 0.04, 0.8 + 0.5 * r2);
          fi.push(Math.floor(r0 * 7) % 3, keep, r1 * 6.283, gSlot[kn]);
        }
      }
    }
    if ((j & 7) === 7) yield;
  }
  if (roots.length === 0 && fr.length === 0) return null;
  return {
    roots: new Float32Array(roots),
    info: new Float32Array(info),
    count: roots.length / 4,
    flowerRoots: new Float32Array(fr),
    flowerInfo: new Float32Array(fi),
    flowers: fr.length / 4,
    wx: x0,
    wy: oy,
    wz: z0,
  };
}

// ---------------------------------------------------------------------------------------------- far woods

export const WOODS_TILE = 2048;
const WOODS_CELL = 44;
/** where the far woods stand: beyond the modelled trees, out to where the painted ground takes over (m) */
export const WOODS_FADE = { in: [380, 520], out: [3500, 4000] } as const;
/** in a world of version 2 no card stands nearer the road's centre line than this (m): a card is 38 m wide */
const WOODS_ROAD = 60;

export interface WoodsTile {
  /** per card: root (tile-local x, y, z) and size */
  roots: Float32Array;
  /** per card: palette slots (a + 4 b), share of b, random, variant 0–3 */
  info: Float32Array;
  count: number;
  minY: number;
  maxY: number;
  wx: number;
  wy: number;
  wz: number;
}

/** Far woods of tile (tx, tz), all at once (tests, tools). The world view builds them in slices. */
export function buildFarWoods(world: World, tx: number, tz: number): WoodsTile | null {
  return finish(woodsSlices(world, tx, tz));
}

/** Cards of painted tree masses on woodland within tile (tx, tz), one per 44 m cell where the wood is thick. Pauses after every row. */
export function* woodsSlices(world: World, tx: number, tz: number): Slices<WoodsTile | null> {
  const x0 = tx * WOODS_TILE;
  const z0 = tz * WOODS_TILE;
  const per = Math.round(WOODS_TILE / WOODS_CELL);
  world.shape(x0, z0, tp, true);
  const oy = tp.h;
  const flora = world.flora !== null;
  const roots: number[] = [];
  const info: number[] = [];
  let minY = Infinity;
  let maxY = -Infinity;
  for (let j = 0; j < per; j++) {
    for (let i = 0; i < per; i++) {
      const cx = tx * per + i;
      const cz = tz * per + j;
      const h = hash2(cx, cz, world.seed + 0x700d);
      const r0 = (h & 0x3ff) / 1024;
      const r1 = ((h >>> 10) & 0x3ff) / 1024;
      const r2 = ((h >>> 20) & 0x3ff) / 1024;
      const wx = x0 + (i + 0.1 + 0.8 * r0) * WOODS_CELL;
      const wz = z0 + (j + 0.1 + 0.8 * r1) * WOODS_CELL;
      world.shape(wx, wz, tp, true);
      const ad = tp.d < 0 ? -tp.d : tp.d;
      // (a world of version 2 has no belt of woods of the far country's own: its woods are where the ecotope
      // has them, and the cards stand on them from the first rows beside the road)
      if (ad < (flora ? WOODS_ROAD : 430)) continue;
      // (the sea is in the coarse land too: no wood in it or on its beach)
      if (tp.wkind === 3 && tp.wl > tp.h - 2) continue;
      let wood: number;
      if (flora) wood = canopyOf(world, tp, wx, wz);
      else {
        wood = woodland(tp.ba, world.seed, wx, wz, ad, tp.relief) * (1 - tp.bt);
        if (tp.bt > 0) wood += woodland(tp.bb, world.seed, wx, wz, ad, tp.relief) * tp.bt;
      }
      // woods stop at the treeline of the massifs
      wood *= 1 - smoothstep(450, 850, tp.relief);
      if (wood < 0.3 + 0.35 * r2) continue;
      // (the coarse land knows no lakes and no river valleys: where water may be near, ask the true land
      // before standing trees on it — a river cuts its valley through whole ridges, and a wood that kept
      // to the uncut land would hang in the air over it)
      const wet = world.water.mayReach(wx, wz, world.spine.sAtX(wx));
      let hHere = tp.h;
      if (wet) {
        world.shape(wx, wz, tq);
        if (tq.wl > tq.bed - 1.5) continue;
        hHere = tq.bed;
      }
      const pair = (tp.ca & 3) + 4 * (tp.cb & 3);
      const share = tp.bt;
      // sunk well in: on a slope a card's flat bottom must stay under the ground on both sides
      // (the steeper the ground, the deeper: half a card's width times the slope)
      const size = 0.75 + 0.55 * r2 * r0 + 0.2 * wood;
      world.shape(wx + 24, wz, tp, !wet);
      const sx = ((wet ? tp.bed : tp.h) - hHere) / 24;
      world.shape(wx, wz + 24, tp, !wet);
      const sz = ((wet ? tp.bed : tp.h) - hHere) / 24;
      // (a world of version 2: no wood on a cliff, as the ecotope has it — a tower's side stays rock)
      if (flora && wood * woodOnSlope(Math.sqrt(sx * sx + sz * sz)) < 0.3 + 0.35 * r2) continue;
      const y = hHere - oy - Math.max(8, Math.sqrt(sx * sx + sz * sz) * 21 * size + 3);
      roots.push(wx - x0, y, wz - z0, size);
      info.push(pair, share, r1, Math.floor(r2 * 4) % 4);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    yield;
  }
  if (roots.length === 0) return null;
  return { roots: new Float32Array(roots), info: new Float32Array(info), count: roots.length / 4, minY, maxY, wx: x0, wy: oy, wz: z0 };
}

/** the card every far-woods instance is drawn with: x −0.5…0.5 across, y 0…1 up */
export function buildWoodsCard(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3));
  return g;
}

