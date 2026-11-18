/**
 * The proving ground's own ground as meshes (docs/MODCAR.md §28; the plan: core/modcar/proving/layout.ts): the asphalt
 * sheet (the straight, its turning circle, the dynamics pad and the apron), the gravel loop with its features, the
 * grade hill; the rocks of the rock garden and the logs across the loop. Built in slices (generators that pause every
 * row or so), the view (provingView.ts) running them within its budget.
 *
 * Every mesh lies on what the wheels and the feet stand on (ProvingGround.heightAt: provingAt without the unevenness
 * the eye does not see), and runs on past the edge of what is drawn over the land as a skirt of the land's own ground,
 * at the land's own height and painted as the land paints itself (its palette and paint inputs taken at the land
 * mesh's own vertices and spread over a cell as that mesh spreads them): the land's coarse mesh dips under the drawn
 * ground's edge where it is let down, and the skirt covers the dip. Where the drawn ground has shapes the land's
 * mesh cannot hold (the hill, the side slope's bank), the land's vertices are held under it (`clampMap`,
 * terrainMaterials.ts terrainClamp).
 *
 * Frames: world x, z (y up), positions relative to a piece's own origin (wx, wy, wz) for the float precision far out.
 */
import * as THREE from 'three';
import { TerrainPoint, type World } from '../../core/world/terrain';
import {
  APRON,
  FEATURES,
  HILL,
  LOGS,
  LOOP,
  LOOP_CORRIDOR,
  LOOP_LEN,
  MOWN,
  PAD,
  ROCKS,
  STRAIGHT,
  TURN,
  loopAt,
  loopProject,
  provingAt,
  ProvingPoint,
  type Feature,
} from '../../core/modcar/proving/layout';
import { groundAttrs, lawnOf } from '../scene/worldBuild';

/** a build in slices: it pauses (yields) every so often, and returns what it made */
export type Slices<T> = Generator<void, T, void>;

/** what one piece of ground is: its geometry and where its origin is in the world */
export interface Piece {
  geometry: THREE.BufferGeometry;
  wx: number;
  wy: number;
  wz: number;
}

// ------------------------------------------------------------------ the asphalt's shape (as layout.ts provingAt has it)

/** how far inside the asphalt (m; negative outside): the straight, the turning circle, the pad, the apron */
export function asphaltInside(x: number, z: number): number {
  return Math.max(
    Math.min(x - STRAIGHT.xFar, STRAIGHT.xNear - x, z + STRAIGHT.half, STRAIGHT.half - z),
    TURN.r - Math.hypot(x - TURN.x, z - TURN.z),
    Math.min(x - PAD.x0, PAD.x1 - x, z - PAD.z0, STRAIGHT.half - z),
    Math.min(x - APRON.x0, APRON.x1 - x, z - APRON.z0, APRON.z1 - z),
  );
}

/** the skirts: how far past the drawn ground's edge each mesh runs on over the land (m) */
export const SKIRT_ASPHALT = 12;
export const SKIRT_HILL = 16;
/** the loop's meshes reach this far either side of its line (m): further where the side slope leans the land */
export const LOOP_REACH = 26;
export const LOOP_REACH_CAMBER = 36;

// ------------------------------------------------------------------ the land's paint inputs, as its mesh spreads them

/** the land mesh's finest grid (worldBuild.ts: 256 m leaves of 32 cells) */
const LAND_STEP = 8;

/**
 * The land's paint inputs (worldBuild.ts groundAttrs: palette weights, road distance, relief, woodland, water) at the
 * land mesh's own vertices, spread over each cell by its own two triangles: a skirt painted with these meets the land
 * without a seam.
 */
export class LandPaint {
  private readonly cache = new Map<number, Float32Array>();
  private readonly tp = new TerrainPoint();
  private readonly bw = new Float32Array(4);
  private readonly gd = new Float32Array(4);

  constructor(private readonly world: World) {}

  private corner(i: number, j: number): Float32Array {
    const key = (i + 32768) * 65536 + (j + 32768);
    let a = this.cache.get(key);
    if (!a) {
      const x = i * LAND_STEP;
      const z = j * LAND_STEP;
      this.world.shape(x, z, this.tp);
      groundAttrs(this.world.seed, this.tp, x, z, this.bw, this.gd, 0, lawnOf(this.world, this.tp, x, z));
      a = new Float32Array(8);
      a.set(this.bw, 0);
      a.set(this.gd, 4);
      this.cache.set(key, a);
    }
    return a;
  }

  /** the inputs at (x, z) into bw[k*4…] and gd[k*4…] */
  at(x: number, z: number, bw: Float32Array, gd: Float32Array, k: number): void {
    const i = Math.floor(x / LAND_STEP);
    const j = Math.floor(z / LAND_STEP);
    const fx = x / LAND_STEP - i;
    const fz = z / LAND_STEP - j;
    // (the land's quads are split b–c: a, b, c below the diagonal, d, c, b above it)
    let wa: number, wb: number, wc: number, wd: number;
    if (fx + fz <= 1) {
      wa = 1 - fx - fz;
      wb = fx;
      wc = fz;
      wd = 0;
    } else {
      wa = 0;
      wb = 1 - fz;
      wc = 1 - fx;
      wd = fx + fz - 1;
    }
    const A = this.corner(i, j);
    const B = this.corner(i + 1, j);
    const C = this.corner(i, j + 1);
    const D = wd > 0 ? this.corner(i + 1, j + 1) : A;
    for (let c = 0; c < 4; c++) {
      bw[k * 4 + c] = A[c] * wa + B[c] * wb + C[c] * wc + D[c] * wd;
      gd[k * 4 + c] = A[4 + c] * wa + B[4 + c] * wb + C[4 + c] * wc + D[4 + c] * wd;
    }
  }
}

// ------------------------------------------------------------------ small helpers

/** a grid's triangles (rows × cols vertices, row-major), wound to face up */
function gridIndex(rows: number, cols: number, pos: Float32Array, keep?: (r: number, c: number) => boolean): THREE.BufferAttribute {
  // (which way round faces up depends on how the rows and columns run on the plan: ask the first quad)
  const ax = pos[0], az = pos[2];
  const bx = pos[3] - ax, bz = pos[5] - az;
  const cx = pos[cols * 3] - ax, cz = pos[cols * 3 + 2] - az;
  // y of (c − a) × (b − a)
  const up = cz * bx - cx * bz > 0;
  const n = rows * cols;
  const idx: number[] = [];
  for (let r = 0; r + 1 < rows; r++) {
    for (let c = 0; c + 1 < cols; c++) {
      if (keep && !keep(r, c)) continue;
      const a = r * cols + c;
      const b = a + 1;
      const cc = a + cols;
      const d = cc + 1;
      if (up) idx.push(a, cc, b, b, cc, d);
      else idx.push(a, b, cc, b, d, cc);
    }
  }
  return new THREE.BufferAttribute(n > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1);
}

function range(a: number, b: number, step: number): number[] {
  const out: number[] = [];
  const n = Math.max(1, Math.ceil((b - a) / step - 1e-6));
  for (let i = 0; i <= n; i++) out.push(a + ((b - a) * i) / n);
  return out;
}

/** a sorted list without near repeats */
function uniq(v: number[], eps = 1e-4): number[] {
  const s = [...v].sort((p, q) => p - q);
  const out: number[] = [];
  for (const x of s) if (!out.length || x - out[out.length - 1] > eps) out.push(x);
  return out;
}

const pp = new ProvingPoint();
/** the drawn ground's height above the level (the wheels' and the feet's, without the unevenness) */
const hAt = (x: number, z: number): number => provingAt(x, z, pp).h;

/** the surface normal there, by differences over e either way */
function normalAt(x: number, z: number, e: number, out: Float32Array, o: number): void {
  const dhx = (hAt(x + e, z) - hAt(x - e, z)) / (2 * e);
  const dhz = (hAt(x, z + e) - hAt(x, z - e)) / (2 * e);
  const inv = 1 / Math.sqrt(dhx * dhx + 1 + dhz * dhz);
  out[o] = -dhx * inv;
  out[o + 1] = inv;
  out[o + 2] = -dhz * inv;
}

// ------------------------------------------------------------------ the asphalt sheet

/** the asphalt sheet's tiles (m): world-aligned, on the land mesh's grid */
export const ASPHALT_TILE = 256;
const ASPHALT_CELL = 8;

/** every tile of the asphalt sheet (tile indices) */
export function asphaltTiles(): { ix: number; iz: number }[] {
  const out: { ix: number; iz: number }[] = [];
  const reach = SKIRT_ASPHALT + ASPHALT_CELL;
  const x0 = Math.min(STRAIGHT.xFar, TURN.x - TURN.r, PAD.x0) - reach;
  const x1 = Math.max(STRAIGHT.xNear, APRON.x1) + reach;
  const z0 = Math.min(-STRAIGHT.half, PAD.z0, APRON.z0, TURN.z - TURN.r) - reach;
  const z1 = Math.max(STRAIGHT.half, APRON.z1, TURN.z + TURN.r) + reach;
  for (let iz = Math.floor(z0 / ASPHALT_TILE); iz <= Math.floor(z1 / ASPHALT_TILE); iz++) {
    for (let ix = Math.floor(x0 / ASPHALT_TILE); ix <= Math.floor(x1 / ASPHALT_TILE); ix++) {
      // (a tile with nothing of the sheet on it is not one)
      let any = false;
      for (let j = 0; j < ASPHALT_TILE / ASPHALT_CELL && !any; j++)
        for (let i = 0; i < ASPHALT_TILE / ASPHALT_CELL && !any; i++) any = asphaltCell(ix * ASPHALT_TILE + i * ASPHALT_CELL, iz * ASPHALT_TILE + j * ASPHALT_CELL);
      if (any) out.push({ ix, iz });
    }
  }
  return out;
}

/** does the sheet (with its skirt) reach into the cell at (x, z) */
function asphaltCell(x: number, z: number): boolean {
  const c = asphaltInside(x + ASPHALT_CELL / 2, z + ASPHALT_CELL / 2);
  return c > -SKIRT_ASPHALT - ASPHALT_CELL * 0.7072;
}

/**
 * A tile of the asphalt sheet: flat at the level, on the land mesh's own grid (8 m: the sheet's edge and its paint
 * are the shader's, from the plan position), only the cells it reaches into.
 */
export function* asphaltSlices(paint: LandPaint, level: number, ix: number, iz: number): Slices<Piece | null> {
  const n = ASPHALT_TILE / ASPHALT_CELL + 1;
  const x0 = ix * ASPHALT_TILE;
  const z0 = iz * ASPHALT_TILE;
  const keepCell = (r: number, c: number): boolean => asphaltCell(x0 + c * ASPHALT_CELL, z0 + r * ASPHALT_CELL);
  let any = false;
  for (let r = 0; r + 1 < n && !any; r++) for (let c = 0; c + 1 < n && !any; c++) any = keepCell(r, c);
  if (!any) return null;
  const pos = new Float32Array(n * n * 3);
  const nrm = new Float32Array(n * n * 3);
  const bw = new Float32Array(n * n * 4);
  const gd = new Float32Array(n * n * 4);
  const plan = new Float32Array(n * n * 2);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const k = r * n + c;
      const x = x0 + c * ASPHALT_CELL;
      const z = z0 + r * ASPHALT_CELL;
      pos[k * 3] = c * ASPHALT_CELL;
      pos[k * 3 + 1] = 0;
      pos[k * 3 + 2] = r * ASPHALT_CELL;
      nrm[k * 3 + 1] = 1;
      paint.at(x, z, bw, gd, k);
      plan[k * 2] = x;
      plan[k * 2 + 1] = z;
    }
    if ((r & 3) === 3) yield;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('aBiomeW', new THREE.BufferAttribute(bw, 4));
  g.setAttribute('aGround', new THREE.BufferAttribute(gd, 4));
  g.setAttribute('aPlan', new THREE.BufferAttribute(plan, 2));
  g.setIndex(gridIndex(n, n, pos, keepCell));
  compact(g);
  g.computeBoundingSphere();
  return { geometry: g, wx: x0, wy: level, wz: z0 };
}

/** drop the vertices no triangle uses */
function compact(g: THREE.BufferGeometry): void {
  const idx = g.getIndex()!;
  const used = new Int32Array(g.getAttribute('position').count).fill(-1);
  let n = 0;
  for (let i = 0; i < idx.count; i++) {
    const v = idx.getX(i);
    if (used[v] < 0) used[v] = n++;
  }
  for (const name of Object.keys(g.attributes)) {
    const a = g.getAttribute(name) as THREE.BufferAttribute;
    const out = new Float32Array(n * a.itemSize);
    for (let v = 0; v < used.length; v++) {
      if (used[v] < 0) continue;
      for (let c = 0; c < a.itemSize; c++) out[used[v] * a.itemSize + c] = (a.array as Float32Array)[v * a.itemSize + c];
    }
    g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
  }
  const ni = n > 65535 ? new Uint32Array(idx.count) : new Uint16Array(idx.count);
  for (let i = 0; i < idx.count; i++) ni[i] = used[idx.getX(i)];
  g.setIndex(new THREE.BufferAttribute(ni, 1));
}

// ------------------------------------------------------------------ the loop

/** a length of the loop drawn as one mesh: from s0 to s1, rows as close as its features need, columns across */
export interface LoopChunk {
  key: string;
  s0: number;
  s1: number;
  /** the features on it (for the rows' spacing, the columns, the rocks and the logs) */
  feats: Feature[];
  /** how far either side its mesh reaches (m) */
  reach: number;
}

const featOf = (k: Feature['kind']): Feature => FEATURES.find((f) => f.kind === k)!;

/** the loop cut into chunks: at the features (each in the flat between two), the long flat lengths in pieces */
export function loopChunks(): LoopChunk[] {
  // (cuts in the flat between the features: there the gravel is level, so pieces with other rows and columns meet
  // without a crack)
  const cuts = [0, 25, 78, 157, 212, 277, 342, 398, 450, 576, 701.3, 805, 897, 960, 1025, 1150, 1276, LOOP_LEN];
  const out: LoopChunk[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const s0 = cuts[i];
    const s1 = cuts[i + 1];
    const feats = FEATURES.filter((f) => f.s1 > s0 && f.s0 < s1);
    out.push({ key: `loop${i}`, s0, s1, feats, reach: feats.some((f) => f.kind === 'camber') ? LOOP_REACH_CAMBER : LOOP_REACH });
  }
  return out;
}

/** the washboard's ripple: its wavelength (layout.ts WASH): far off the rows fall where it crosses the level */
const WASH_WAVE = 0.9;

/**
 * The rows' spacing along the loop at s (m): fine over the washboard and the logs, coarse where it is level. Far off
 * (coarse) only the long shapes are kept: the whoops, the twister, the side slope; the washboard's rows on its level
 * crossings, so it reads flat.
 */
function rowStep(s: number, feats: readonly Feature[], coarse = false): number {
  let step = 2;
  for (const f of feats) {
    if (s < f.s0 - 1.5 || s > f.s1 + 1.5) continue;
    if (coarse) {
      if (f.kind === 'twister' || f.kind === 'logs') step = Math.min(step, 1);
      if (f.kind === 'washboard') step = Math.min(step, WASH_WAVE * 2);
      continue;
    }
    switch (f.kind) {
      case 'washboard':
        step = Math.min(step, 0.12);
        break;
      case 'whoops':
        step = Math.min(step, 0.4);
        break;
      case 'twister':
        step = Math.min(step, 0.33);
        break;
      case 'rocks':
      case 'potholes':
        step = Math.min(step, 0.25);
        break;
      case 'logs': {
        let near = Infinity;
        for (const at of LOGS.at) near = Math.min(near, Math.abs(s - at));
        step = Math.min(step, near < LOGS.width * 0.7 ? 0.05 : 0.5);
        break;
      }
      case 'camber':
      case 'mud':
      case 'sand':
        step = Math.min(step, 1);
        break;
    }
  }
  return step;
}

/** the columns across the loop (d, m; + right of the way it runs) for a chunk */
function loopColumns(c: LoopChunk, coarse = false): number[] {
  const half = LOOP.half;
  const R = c.reach;
  // (the gravel's edge, the shoulder, the corridor's edge, the land's skirt)
  const cols = coarse ? [0, 2, half, 5.5, LOOP_CORRIDOR, 13, R] : [0, 2, 3.5, half, half + 0.4, 5.5, LOOP_CORRIDOR, 10, 13, 18, R];
  for (const f of c.feats) {
    if (coarse && (f.kind === 'rocks' || f.kind === 'potholes' || f.kind === 'logs')) continue;
    switch (f.kind) {
      case 'washboard':
        cols.push(4.75, 5.5, 6.25);
        break;
      case 'whoops':
        cols.push(5, 6, 8, 9, 11.5);
        break;
      case 'twister':
        cols.push(0.45, 0.9, 1.4, 3, 4.75, 6.25);
        break;
      case 'rocks':
      case 'potholes':
        // (a lump stops at the gravel's edge: a step there)
        for (let d = 0.25; d < half - 0.01; d += 0.25) cols.push(d);
        cols.push(half - 0.002, half + 0.002);
        break;
      case 'camber':
        cols.push(8.5, 11, 12, 14, 16, 21, 26, 31);
        break;
      case 'logs':
        cols.push(LOGS.half - 0.3, LOGS.half - 0.15, LOGS.half);
        break;
      case 'mud':
        cols.push(1.5, 3, 4.5, 5);
        break;
      case 'sand':
        break;
    }
  }
  const pos = uniq(cols.filter((d) => d <= R));
  return uniq([...pos.map((d) => -d), ...pos]);
}

const lp = { x: 0, z: 0, tx: 0, tz: 0, kappa: 0 };

/**
 * A chunk of the loop: a strip along its line (its rows at s, its columns at d across), at the drawn ground's height,
 * its skirt the land's. aLoop: (s, d, the lump there — a rock + or a pothole −, the height).
 */
export function* loopSlices(paint: LandPaint, level: number, c: LoopChunk, coarse = false): Slices<Piece> {
  const rows: number[] = [];
  const wash = c.feats.find((f) => f.kind === 'washboard');
  for (let s = c.s0; s < c.s1 - 1e-6; ) {
    rows.push(s);
    let next = s + rowStep(s, c.feats, coarse);
    // (far off, the washboard's rows on its level crossings: a whole number of waves from its start)
    if (coarse && wash && next > wash.s0 - 1.5 && next < wash.s1 + 1.5) next = wash.s0 + Math.max(Math.ceil((next - wash.s0) / WASH_WAVE), -1) * WASH_WAVE;
    s = next > s + 1e-3 ? next : s + 0.5;
  }
  rows.push(c.s1);
  const cols = loopColumns(c, coarse);
  const nr = rows.length;
  const nc = cols.length;
  const n = nr * nc;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const bw = new Float32Array(n * 4);
  const gd = new Float32Array(n * 4);
  const lo = new Float32Array(n * 4);
  loopAt(c.s0, lp);
  const ox = lp.x;
  const oz = lp.z;
  const lumpy = !coarse && c.feats.some((f) => f.kind === 'rocks' || f.kind === 'potholes');
  const fine = !coarse && c.feats.some((f) => f.kind === 'washboard' || f.kind === 'logs');
  for (let r = 0; r < nr; r++) {
    const s = rows[r];
    loopAt(s, lp);
    const e = fine ? 0.04 : lumpy ? 0.08 : 0.15;
    for (let j = 0; j < nc; j++) {
      const k = r * nc + j;
      const d = cols[j];
      // (right of the way it runs: (−tz, tx))
      const x = lp.x - lp.tz * d;
      const z = lp.z + lp.tx * d;
      const p = provingAt(x, z, pp);
      pos[k * 3] = x - ox;
      pos[k * 3 + 1] = p.h;
      pos[k * 3 + 2] = z - oz;
      normalAt(x, z, e, nrm, k * 3);
      paint.at(x, z, bw, gd, k);
      lo[k * 4] = s;
      lo[k * 4 + 1] = d;
      lo[k * 4 + 2] = lumpy && Math.abs(d) < LOOP.half ? p.h : 0;
      lo[k * 4 + 3] = p.h;
    }
    yield;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('aBiomeW', new THREE.BufferAttribute(bw, 4));
  g.setAttribute('aGround', new THREE.BufferAttribute(gd, 4));
  g.setAttribute('aLoop', new THREE.BufferAttribute(lo, 4));
  g.setIndex(gridIndex(nr, nc, pos));
  g.computeBoundingSphere();
  return { geometry: g, wx: ox, wy: level, wz: oz };
}

/** the plan box a loop chunk covers (world) */
export function loopChunkBox(c: LoopChunk): { x0: number; z0: number; x1: number; z1: number } {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let s = c.s0; s <= c.s1 + 1e-6; s += Math.max(1, (c.s1 - c.s0) / 24)) {
    loopAt(Math.min(s, c.s1), lp);
    for (const d of [-c.reach, c.reach]) {
      const x = lp.x - lp.tz * d;
      const z = lp.z + lp.tx * d;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
  }
  return { x0, z0, x1, z1 };
}

// ------------------------------------------------------------------ the hill

/** a ramp's length on the plan: up, the top, down (m) */
export const rampLen = (grade: number): number => (2 * HILL.rise) / grade + HILL.top;
/** the hill's footprint's reach either side of a ramp's middle (m) */
const HILL_REACH = HILL.lane / 2 + HILL.rise * HILL.side;

/** the hill's mesh's plan box (world): the three footprints and their skirt */
export function hillBox(): { x0: number; z0: number; x1: number; z1: number } {
  const len = Math.max(...HILL.ramps.map((r) => rampLen(r.grade)));
  return {
    x0: HILL.x0 - len - 1.5 - SKIRT_HILL,
    x1: HILL.x0 + HILL.apron + SKIRT_HILL,
    z0: Math.min(...HILL.ramps.map((r) => r.z)) - HILL_REACH - SKIRT_HILL,
    z1: Math.max(...HILL.ramps.map((r) => r.z)) + HILL_REACH + SKIRT_HILL,
  };
}

/** a ramp's profile as layout.ts hillAt has it: its height at u along it (rounded over a metre at each change of grade) */
function rampProfile(grade: number, u: number): number {
  const up = HILL.rise / grade;
  const len = 2 * up + HILL.top;
  const prof = (q: number): number => Math.max(0, Math.min(grade * q, HILL.rise, grade * (len - q)));
  return (prof(u - 0.5) + 2 * prof(u) + prof(u + 0.5)) / 4;
}

/**
 * The grade hill: one mesh over the three ramps and the land between and round them. Its rows lie at every change of
 * grade (and half a metre either side, where the profile is rounded), so the ramps are exact planes between; its
 * columns at each lane's edges and at the foot of each side slope, which moves with the ramp's height, so the slopes
 * are exact planes too. aPlan: the plan position.
 */
export function* hillSlices(paint: LandPaint, level: number): Slices<Piece> {
  const box = hillBox();
  const uMax = HILL.x0 - box.x0;
  // (the skirt, the aprons before the feet, then the ramps)
  const A = HILL.apron;
  const us: number[] = [-A - SKIRT_HILL, -A - 8, -A - 3, -A, -A + 6, -A + 12, -A + 18, -3, -1.5, -1];
  for (const rp of HILL.ramps) {
    const up = HILL.rise / rp.grade;
    const len = rampLen(rp.grade);
    for (const k of [0, up, len - up, len]) us.push(k - 0.5, k, k + 0.5);
    // (and a few between: the paint's inputs are spread from the vertices)
    for (const k of range(0.5, up - 0.5, 3)) us.push(k);
    for (const k of range(len - up + 0.5, len - 0.5, 3)) us.push(k);
    us.push(len + 1, len + 1.5);
  }
  for (const k of range(Math.max(...HILL.ramps.map((r) => rampLen(r.grade))) + 1.5, uMax, 5)) us.push(k);
  const rows = uniq(us.filter((u) => u >= -A - SKIRT_HILL - 1e-6 && u <= uMax + 1e-6), 1e-3);
  const ramps = [...HILL.ramps].sort((a, b) => a.z - b.z);
  // the columns: the skirt, then for each ramp its footprint's edge, the slope's foot, the lane's edges; between two
  // ramps the land
  const colsAt = (u: number): number[] => {
    const out: number[] = [box.z0, box.z0 + SKIRT_HILL * 0.5];
    ramps.forEach((rp, i) => {
      const p = rampProfile(rp.grade, u);
      const foot = HILL.lane / 2 + p * HILL.side;
      const half = HILL.lane / 2;
      out.push(rp.z - HILL_REACH, rp.z - Math.max(foot, half + 0.001), rp.z - half, rp.z, rp.z + half, rp.z + Math.max(foot, half + 0.001), rp.z + HILL_REACH);
      if (i + 1 < ramps.length) out.push((rp.z + ramps[i + 1].z) / 2);
    });
    out.push(box.z1 - SKIRT_HILL * 0.5, box.z1);
    return out;
  };
  const nr = rows.length;
  const nc = colsAt(0).length;
  const n = nr * nc;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const bw = new Float32Array(n * 4);
  const gd = new Float32Array(n * 4);
  const plan = new Float32Array(n * 3);
  const ox = HILL.x0;
  const oz = box.z0;
  for (let r = 0; r < nr; r++) {
    const u = rows[r];
    const x = HILL.x0 - u;
    const cols = colsAt(u);
    for (let j = 0; j < nc; j++) {
      const k = r * nc + j;
      const z = cols[j];
      const h = hAt(x, z);
      pos[k * 3] = x - ox;
      pos[k * 3 + 1] = h;
      pos[k * 3 + 2] = z - oz;
      nrm[k * 3 + 1] = 1;
      paint.at(x, z, bw, gd, k);
      plan[k * 3] = x;
      plan[k * 3 + 1] = z;
      plan[k * 3 + 2] = h;
    }
    if ((r & 3) === 3) yield;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('aBiomeW', new THREE.BufferAttribute(bw, 4));
  g.setAttribute('aGround', new THREE.BufferAttribute(gd, 4));
  g.setAttribute('aPlan', new THREE.BufferAttribute(plan, 3));
  g.setIndex(gridIndex(nr, nc, pos));
  g.computeBoundingSphere();
  return { geometry: g, wx: ox, wy: level, wz: oz };
}

// ------------------------------------------------------------------ the rocks and the logs

/**
 * A rock of the rock garden, as a low stone: a faceted dome of unit radius and height over the bump layout.ts makes of
 * it (h (1 − ρ²)²), always a little proud of the bump so the gravel never shows through it, its foot sunk into the
 * gravel; its facets each a shade of grey of their own (lighter where they face up). Scaled by (r, h, r) and turned
 * for each rock, tinted by its instance colour.
 */
export function rockTemplate(seed: number): THREE.BufferGeometry {
  let s = seed * 9301 + 49297;
  const rnd = (): number => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const bump = (rho: number): number => (rho >= 1 ? 0 : (1 - rho * rho) ** 2);
  const rings = [0.16, 0.4, 0.64, 0.85, 1.0];
  const seg = 9;
  const verts: number[][] = [[(rnd() - 0.5) * 0.1, 1.04 + 0.04 * rnd(), (rnd() - 0.5) * 0.1]];
  const ringIdx: number[][] = [];
  for (let ri = 0; ri < rings.length; ri++) {
    const row: number[] = [];
    const rho = rings[ri];
    for (let i = 0; i < seg; i++) {
      const a = ((i + (ri % 2) * 0.5 + (rnd() - 0.5) * 0.55) / seg) * Math.PI * 2;
      const rr = Math.min(1, rho * (0.86 + 0.2 * rnd()));
      // (the last ring under the gravel: the stone sits in it)
      const y = ri === rings.length - 1 ? -0.2 : bump(rr) + 0.05 + 0.1 * rnd();
      row.push(verts.length);
      verts.push([Math.cos(a) * rr, y, Math.sin(a) * rr]);
    }
    ringIdx.push(row);
  }
  const tris: number[] = [];
  for (let i = 0; i < seg; i++) tris.push(0, ringIdx[0][(i + 1) % seg], ringIdx[0][i]);
  for (let ri = 0; ri + 1 < rings.length; ri++) {
    const A = ringIdx[ri];
    const B = ringIdx[ri + 1];
    for (let i = 0; i < seg; i++) {
      const a0 = A[i], a1 = A[(i + 1) % seg], b0 = B[i], b1 = B[(i + 1) % seg];
      tris.push(a0, a1, b1, a0, b1, b0);
    }
  }
  // lift every vertex until no face's middle falls under the bump (the chords of a dome lie inside it)
  for (let pass = 0; pass < 6; pass++) {
    for (let t = 0; t < tris.length; t += 3) {
      const p = [verts[tris[t]], verts[tris[t + 1]], verts[tris[t + 2]]];
      for (const [wa, wb, wc] of [[1 / 3, 1 / 3, 1 / 3], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5]]) {
        const x = p[0][0] * wa + p[1][0] * wb + p[2][0] * wc;
        const y = p[0][1] * wa + p[1][1] * wb + p[2][1] * wc;
        const z = p[0][2] * wa + p[1][2] * wb + p[2][2] * wc;
        const need = bump(Math.hypot(x, z)) + 0.035 - y;
        if (need > 0) for (const q of p) if (q[1] > -0.1) q[1] += need;
      }
    }
  }
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const u = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let t = 0; t < tris.length; t += 3) {
    const [A, B, C] = [verts[tris[t]], verts[tris[t + 1]], verts[tris[t + 2]]];
    pos.push(...A, ...B, ...C);
    u.set(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
    v.set(C[0] - A[0], C[1] - A[1], C[2] - A[2]);
    const ny = Math.abs(u.cross(v).normalize().y);
    // (each facet its own grey; the tops paler, weathered)
    const k = 0.8 + 0.3 * rnd() + 0.12 * ny;
    c.setRGB(0.4 * k, 0.39 * k, 0.37 * k);
    for (let i = 0; i < 3; i++) col.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** a rock's tint: warm grey, cool grey, a rusty one, a dark one */
export const ROCK_TINTS: readonly [number, number, number][] = [
  [1.06, 1.0, 0.92],
  [0.9, 0.96, 1.04],
  [1.12, 0.94, 0.78],
  [0.78, 0.78, 0.8],
];

/** the rocks as instances: where each stands (its bump's middle on the drawn ground), its size and its turn */
export function rockPlaces(level: number): { x: number; y: number; z: number; r: number; h: number; yaw: number; kind: number }[] {
  return ROCKS.map((l, i) => {
    // (the rock garden's gravel is level: a rock's bump stands on the level)
    return { x: l.x, y: level, z: l.z, r: l.r, h: l.h, yaw: ((i * 2.399) % (Math.PI * 2)) - Math.PI, kind: i % 3 };
  });
}

/** where the logs lie: their middles on the loop, the way across */
export function logPlaces(): { x: number; z: number; ax: number; az: number; at: number }[] {
  return LOGS.at.map((at) => {
    loopAt(at, lp);
    return { x: lp.x, z: lp.z, ax: -lp.tz, az: lp.tx, at };
  });
}


// ------------------------------------------------------------------ the land held under the drawn ground

/** the clamp map: heights above the level the land's vertices are held to (NO_LIMIT: none), on a 2 m grid */
export interface ClampMap {
  x0: number;
  z0: number;
  texel: number;
  w: number;
  h: number;
  data: Float32Array;
}

export const NO_LIMIT = 1000;
/** the land mesh's triangles reach this far from a vertex (an 8 m grid's diagonal, and a texel over) */
const CLAMP_REACH = 13.5;

/** is (x, z) under one of the meshes that run over the loop and the hill (and how far either side the loop's run) */
export function coversLand(x: number, z: number, lpOut = { s: 0, d: 0 }, margin = 0.5): boolean {
  const hb = hillBox();
  if (x >= hb.x0 + margin && x <= hb.x1 - margin && z >= hb.z0 + margin && z <= hb.z1 - margin) return true;
  loopProject(x, z, lpOut);
  const reach = lpOut.s >= 277 && lpOut.s <= 342 ? LOOP_REACH_CAMBER : LOOP_REACH;
  return Math.abs(lpOut.d) < reach - margin;
}

/**
 * Only the land's vertices this far inside the meshes are held down: a held vertex's triangles reach no further than
 * an 8 m cell's diagonal, so they stay under the meshes (and near the meshes' edges the land is level anyway)
 */
const CLAMP_INSET = 12;

/**
 * How far down the land's vertices are to be held where the loop's and the hill's meshes cover it: under each
 * covered point, the lowest the drawn ground goes within a land triangle's reach (a little lower where it dips
 * between the samples: the potholes, the washboard); nowhere else. In slices, a row at a time.
 */
export function* clampSlices(): Slices<ClampMap> {
  const texel = 1;
  const hb = hillBox();
  const R = LOOP_REACH_CAMBER;
  const x0 = Math.min(LOOP.xFar - (LOOP.zBack - LOOP.zOut) / 2 - R, hb.x0) - 8;
  const x1 = Math.max(LOOP.xNear + (LOOP.zBack - LOOP.zOut) / 2 + R, hb.x1) + 8;
  const z0 = Math.min(LOOP.zOut - R, hb.z0) - 8;
  const z1 = Math.max(LOOP.zBack + R, hb.z1) + 8;
  const w = Math.ceil((x1 - x0) / texel);
  const h = Math.ceil((z1 - z0) / texel);
  const D = new Float32Array(w * h);
  const cov = new Uint8Array(w * h);
  const q = { s: 0, d: 0 };
  const pothole = FEATURES.find((f) => f.kind === 'potholes')!;
  const wash = featOf('washboard');
  for (let j = 0; j < h; j++) {
    const z = z0 + (j + 0.5) * texel;
    for (let i = 0; i < w; i++) {
      const x = x0 + (i + 0.5) * texel;
      const k = j * w + i;
      cov[k] = coversLand(x, z, q, CLAMP_INSET) ? 1 : 0;
      // (and what dips between the samples: a sharp fold of the side slope's bank, the potholes, the washboard)
      let v = hAt(x, z) - 0.1;
      const ad = Math.abs(q.d);
      if (ad < LOOP.half + 0.5) {
        if (q.s > pothole.s0 - 1 && q.s < pothole.s1 + 1) v -= 0.16;
        if (q.s > wash.s0 - 1 && q.s < wash.s1 + 1) v -= 0.03;
      }
      D[k] = v;
    }
    if ((j & 3) === 3) yield;
  }
  // the lowest within the reach: a square's minimum, a row's then a column's
  const k = Math.ceil(CLAMP_REACH / texel);
  const tmp = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let m = Infinity;
      for (let a = Math.max(0, i - k); a <= Math.min(w - 1, i + k); a++) m = Math.min(m, D[j * w + a]);
      tmp[j * w + i] = m;
    }
    if ((j & 15) === 15) yield;
  }
  const out = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let m = Infinity;
      for (let b = Math.max(0, j - k); b <= Math.min(h - 1, j + k); b++) m = Math.min(m, tmp[b * w + i]);
      out[j * w + i] = cov[j * w + i] ? Math.min(m, 0) : NO_LIMIT;
    }
    if ((j & 15) === 15) yield;
  }
  return { x0, z0, texel, w, h, data: out };
}


// ------------------------------------------------------------------ the hill's grass

/**
 * The grass on the hill's banks and round its feet, where the world's grass is kept off (layout.ts provingPlot: bare
 * within two metres of what is drawn): mown short as the world's is on the proving ground (MOWN), a tuft every
 * 0.58 m, painted as the world's (materials.ts grassMaterial: its palette slots, a lawn's evenness). Roots relative to
 * the hill mesh's origin.
 */
export function* hillGrass(world: World): Slices<{ roots: Float32Array; info: Float32Array; count: number; wx: number; wz: number }> {
  const box = hillBox();
  const tp = new TerrainPoint();
  world.shape((box.x0 + box.x1) / 2, (box.z0 + box.z1) / 2, tp);
  const pair = (tp.ca & 3) + 4 * (tp.cb & 3);
  const size0 = 0.85;
  const cell = 0.58;
  const roots: number[] = [];
  const info: number[] = [];
  const ox = HILL.x0;
  const oz = box.z0;
  let s = 20261118;
  const rnd = (): number => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const p = new ProvingPoint();
  for (let x = box.x0; x < box.x1; x += cell) {
    yield;
    for (let z = box.z0; z < box.z1; z += cell) {
      const px = x + rnd() * cell;
      const pz = z + rnd() * cell;
      provingAt(px, pz, p);
      // (not on the concrete, nor where the world's own grass grows)
      if (p.inside <= -2 || p.surface >= 0) continue;
      const r2 = rnd();
      const r3 = rnd();
      const f = 0.7 + 0.75 * r3 * r3 + 0.3 * r2;
      const keep = rnd();
      roots.push(px - ox, p.h - 0.04, pz - oz, Math.pow(f, 0.35) * MOWN * size0);
      const comb = 1.2 * Math.sin(px / 23 + pz / 31);
      info.push(pair + 0.45, tp.bt, Math.min(keep, 0.999), comb + (r3 - 0.5) * 1.4);
    }
  }
  return { roots: new Float32Array(roots), info: new Float32Array(info), count: roots.length / 4, wx: ox, wz: oz };
}
