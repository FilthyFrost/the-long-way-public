/**
 * Meshes for water and what crosses it: the sheet of a lake, a river in lengths of half a
 * kilometre, and the bridges that carry the road over (stone arches for the small rivers, a
 * concrete beam bridge for the middling ones, a steel truss for the wide).
 *
 * The sheets are flat at the water level; each vertex carries the depth of the bed under it (from
 * World.shape(), the function the wheels use), which is all the water shader needs to paint with.
 */
import * as THREE from 'three';
import { SeaPlan, type Coast } from '../../core/world/sea';
import { SpineSample } from '../../core/world/spine';
import { ROAD_HALF, TerrainPoint, type World } from '../../core/world/terrain';
import { DECK_HALF, KERB_AT, KERB_HEIGHT, WaterPlan, type Lake, type River } from '../../core/world/water';
import { ModelBuilder } from '../vehicle/builder';
import type { Slices } from './worldBuild';

const tp = new TerrainPoint();
const st = new SpineSample();
const rc = { x: 0, dx: 0 };

export interface WaterSheet {
  geometry: THREE.BufferGeometry;
  wx: number;
  wy: number;
  wz: number;
}

/**
 * A lake's sheet, built a few rows at a time so that a big lake never holds up a frame:
 * call step() until it returns true, then take the result.
 */
export class LakeBuild {
  private readonly nu: number;
  private readonly nv: number;
  private readonly pos: Float32Array;
  private readonly wat: Float32Array;
  private row = 0;
  result: WaterSheet | null = null;

  constructor(
    private readonly world: World,
    readonly lake: Lake,
  ) {
    // the sheet reaches a little past the widest shore; cells of 7 m on a pond, up to 30 m on a great lake
    this.nu = Math.max(10, Math.min(64, Math.ceil((2 * lake.a * 0.93) / 9)));
    this.nv = Math.max(8, Math.min(44, Math.ceil((2 * lake.b * 0.93) / 9)));
    const n = (this.nu + 1) * (this.nv + 1);
    this.pos = new Float32Array(n * 3);
    this.wat = new Float32Array(n * 4);
  }

  /** build up to `rows` more rows; true when the sheet is finished */
  step(rows = 6): boolean {
    if (this.result) return true;
    const f = this.lake;
    const { nu, nv, pos, wat } = this;
    const end = Math.min(nv + 1, this.row + rows);
    for (let j = this.row; j < end; j++) {
      const v = (j / nv - 0.5) * 2 * f.b * 0.93;
      for (let i = 0; i <= nu; i++) {
        const u = (i / nu - 0.5) * 2 * f.a * 0.93;
        const x = f.cx + u * f.ax - v * f.az;
        const z = f.cz + u * f.az + v * f.ax;
        this.world.shape(x, z, tp);
        const k = j * (nu + 1) + i;
        pos[k * 3] = x - f.cx;
        pos[k * 3 + 1] = 0;
        pos[k * 3 + 2] = z - f.cz;
        // (the land under the sheet: on a frozen lake the wheels' surface is the ice itself)
        wat[k * 4] = f.level - tp.bed;
        wat[k * 4 + 3] = f.frozen;
      }
    }
    this.row = end;
    if (end <= nv) return false;
    // keep the cells that hold water (or touch it)
    const idx: number[] = [];
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = j * (nu + 1) + i;
        const b = a + 1;
        const c = a + nu + 1;
        const d = c + 1;
        if (Math.max(wat[a * 4], wat[b * 4], wat[c * 4], wat[d * 4]) < -0.1) continue;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aWater', new THREE.BufferAttribute(wat, 4));
    g.setIndex(idx);
    g.computeBoundingSphere();
    this.result = { geometry: g, wx: f.cx, wy: f.level, wz: f.cz };
    return true;
  }
}

/** length of river in one mesh (m) */
export const RIVER_CHUNK = 512;
const RIVER_STEP = 8;
const ACROSS = [-1.14, -0.86, -0.46, 0, 0.46, 0.86, 1.14];

/** chunk indices of a river that hold water: chunk c covers z − z0 in [c·512, (c+1)·512) */
export function riverChunks(f: River): [number, number] {
  return [Math.floor(-f.zEnd / RIVER_CHUNK), Math.floor(f.zEnd / RIVER_CHUNK)];
}

/** where the centre line of a river is at zr = z − z0, and the unit vector across it there */
export function riverPoint(f: River, zr: number, out: { x: number; z: number; nx: number; nz: number }): void {
  WaterPlan.riverCentre(f, zr, rc);
  out.x = rc.x;
  out.z = f.z0 + zr;
  const inv = 1 / Math.sqrt(1 + rc.dx * rc.dx);
  out.nx = inv;
  out.nz = -rc.dx * inv;
}

const rp = { x: 0, z: 0, nx: 0, nz: 0 };

/** One length of a river's water. Null where the river has run out. */
export function buildRiverChunk(world: World, f: River, c: number): WaterSheet | null {
  const t0 = c * RIVER_CHUNK;
  const rows = RIVER_CHUNK / RIVER_STEP + 1;
  const nc = ACROSS.length;
  const pos = new Float32Array(rows * nc * 3);
  const wat = new Float32Array(rows * nc * 4);
  riverPoint(f, t0, rp);
  const ox = rp.x;
  const oz = rp.z;
  const oy = world.water.riverLevel(rp.x);
  let any = false;
  const wide = new Float32Array(rows);
  for (let r = 0; r < rows; r++) {
    const t = t0 + r * RIVER_STEP;
    const w = WaterPlan.riverHalfWidth(f, t);
    wide[r] = w;
    if (w > 0.6) any = true;
    riverPoint(f, t, rp);
    const level = world.water.riverLevel(rp.x);
    for (let j = 0; j < nc; j++) {
      const k = r * nc + j;
      const x = rp.x + rp.nx * ACROSS[j] * w;
      const z = rp.z + rp.nz * ACROSS[j] * w;
      world.shape(x, z, tp);
      pos[k * 3] = x - ox;
      pos[k * 3 + 1] = level - oy;
      pos[k * 3 + 2] = z - oz;
      // under a bridge the wheels' surface is the deck: the bed is what the water lies on
      wat[k * 4] = level - tp.bed;
      wat[k * 4 + 1] = t;
      wat[k * 4 + 2] = ACROSS[j] + 1e-3;
      wat[k * 4 + 3] = f.frozen;
    }
  }
  if (!any) return null;
  const idx: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    if (wide[r] < 0.6 && wide[r + 1] < 0.6) continue;
    for (let j = 0; j < nc - 1; j++) {
      const a = r * nc + j;
      const b = a + 1;
      const cc = a + nc;
      const d = cc + 1;
      idx.push(a, cc, b, b, cc, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aWater', new THREE.BufferAttribute(wat, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return { geometry: g, wx: ox, wy: oy, wz: oz };
}

// ---------------------------------------------------------------------------------------------- the sea

/** length of coast in one mesh (m of road) */
export const SEA_CHUNK = 1000;
const SEA_STEP = 20;
const SEA_STEP_FAR = 50;
/** columns of a sea sheet, in metres out from the waterline: close together on the beach, strides to the horizon */
const SEA_OUT = [-5, 0, 3, 8, 16, 30, 55, 90, 140, 220, 340, 520, 800, 1300, 2200, 4000, 8000, 16000];

/** how many lengths a sea is built in */
export function seaChunks(c: Coast): number {
  return Math.ceil((c.s1 - c.s0) / SEA_CHUNK);
}

/**
 * One length of a coast's sea: a sheet at sea level from the beach to the horizon, its columns
 * following the waterline (so the depth under every vertex near the shore is exact), built a few
 * rows at a time. Null where the shore has left for the horizon along the whole length.
 */
export function* seaSlices(world: World, c: Coast, i: number): Slices<WaterSheet | null> {
  const sA = c.s0 + i * SEA_CHUNK;
  const sB = Math.min(c.s1, sA + SEA_CHUNK);
  // (a shore kilometres off needs no row every twenty metres)
  let nearest = Infinity;
  for (let s = sA; s <= sB; s += 100) nearest = Math.min(nearest, SeaPlan.shoreAt(c, s));
  const step = nearest < 700 ? SEA_STEP : SEA_STEP_FAR;
  const rows = Math.ceil((sB - sA) / step) + 1;
  const nc = SEA_OUT.length;
  const pos = new Float32Array(rows * nc * 3);
  const wat = new Float32Array(rows * nc * 4);
  const live = new Uint8Array(rows);
  const sp = world.spine;
  sp.at(sA, st);
  const ox = st.x;
  const oz = st.z;
  let any = false;
  for (let r = 0; r < rows; r++) {
    const s = Math.min(sB, sA + r * step);
    const D = SeaPlan.shoreAt(c, s);
    sp.at(s, st);
    const x = st.x;
    const z0 = st.z;
    // (the land is asked by x: straight out across the world's z, the distance from the road counted square to it)
    const out = c.side / Math.max(0.3, Math.cos(st.phi));
    live[r] = D < 30000 ? 1 : 0;
    if (live[r]) any = true;
    for (let j = 0; j < nc; j++) {
      const k = r * nc + j;
      const L = Math.min(D, 30000) + SEA_OUT[j];
      const z = z0 + out * L;
      world.shape(x, z, tp, L > 2500);
      pos[k * 3] = x - ox;
      pos[k * 3 + 1] = 0;
      pos[k * 3 + 2] = z - oz;
      wat[k * 4] = c.level - tp.bed;
      wat[k * 4 + 1] = 0;
      wat[k * 4 + 2] = 0;
      wat[k * 4 + 3] = 0;
    }
    if (r % 5 === 4) yield;
  }
  if (!any) return null;
  const idx: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    if (!live[r] && !live[r + 1]) continue;
    for (let j = 0; j < nc - 1; j++) {
      const a = r * nc + j;
      const b = a + 1;
      const cc = a + nc;
      const d = cc + 1;
      // (wound to face up whichever side of the road the sea is on)
      if (c.side > 0) idx.push(a, b, cc, b, d, cc);
      else idx.push(a, cc, b, b, cc, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aWater', new THREE.BufferAttribute(wat, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return { geometry: g, wx: ox, wy: c.level, wz: oz };
}

// ---------------------------------------------------------------------------------------------- bridges

const STONE = 0xc4b79e;
const STONE_2 = 0xb3a78f;
const STONE_MOSS = 0x9aa583;
const STONE_DARK = 0x8f8676;
const STONE_CAP = 0xd9d0bb;
const STONE_CAP_2 = 0xcdc3ac;
const CONCRETE = 0xb4b2ab;
const CONCRETE_DARK = 0x7f8083;
const STEEL = 0x6f9a92;
const STEEL_DARK = 0x4f6f6c;
const RUST = 0x9a5d3e;

/** triangles gathered by colour, turned into one flat-shaded geometry per colour for the model builder */
class Tris {
  private readonly lists = new Map<number, number[]>();
  quad(color: number, a: number[], b: number[], c: number[], d: number[]): void {
    let l = this.lists.get(color);
    if (!l) this.lists.set(color, (l = []));
    l.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]);
  }
  tri(color: number, a: number[], b: number[], c: number[]): void {
    let l = this.lists.get(color);
    if (!l) this.lists.set(color, (l = []));
    l.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  }
  into(b: ModelBuilder): void {
    for (const [color, l] of this.lists) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(l), 3));
      g.computeVertexNormals();
      b.geo(g, color, 0, 0, 0);
    }
  }
}

export interface BridgeMesh {
  geometry: THREE.BufferGeometry;
  wx: number;
  wy: number;
  wz: number;
}

/** height of the deck's surface at lateral offset d, relative to the centre line */
function deckDrop(d: number): number {
  const ad = d < 0 ? -d : d;
  return ad > ROAD_HALF ? -(ad - ROAD_HALF) * 0.06 : 0;
}

/**
 * The bridge that carries the road over river f. The road surface itself is the road strip's;
 * this is everything else: the slab's sides and underside, kerbs or parapets, railings, piers,
 * arches, girders, the truss.
 */
export function buildBridge(world: World, f: River): BridgeMesh {
  const sp = world.spine;
  sp.at(f.span0, st);
  const ox = st.x;
  const oy = st.y;
  const oz = st.z;
  /** a point of the bridge: distance along the road, lateral offset, height above the deck surface there */
  const pt = (s: number, d: number, up: number): number[] => {
    sp.at(s, st);
    return [st.x - Math.sin(st.phi) * d - ox, st.y + st.bank * d + deckDrop(d) + up - oy, st.z + Math.cos(st.phi) * d - oz];
  };
  /** the same point, at an absolute height (world) */
  const ptAbs = (s: number, d: number, y: number): number[] => {
    sp.at(s, st);
    return [st.x - Math.sin(st.phi) * d - ox, y - oy, st.z + Math.cos(st.phi) * d - oz];
  };
  /** height of the land under the deck (the river bed, the banks) */
  const bedAt = (s: number, d: number): number => {
    sp.at(s, st);
    world.shape(st.x - Math.sin(st.phi) * d, st.z + Math.cos(st.phi) * d, tp);
    return tp.bed;
  };
  const T = new Tris();
  const b = new ModelBuilder();
  const s0 = f.span0 - 3;
  const s1 = f.span1 + 3;
  const len = s1 - s0;
  const n = Math.max(4, Math.round(len / 2));
  const arch = f.bridge === 'arch';
  const slab = arch ? 0.95 : 0.7;
  const out = DECK_HALF + (arch ? 0.06 : 0);
  const wall = arch ? 0.95 : KERB_HEIGHT;
  const body = arch ? STONE : CONCRETE;
  const cap = arch ? STONE_CAP : 0xd4d1c8;
  const under = arch ? STONE_DARK : CONCRETE_DARK;
  // ---- the slab swept along the road: kerb or parapet, outer face, underside
  for (let i = 0; i < n; i++) {
    const a = s0 + (len * i) / n;
    const c = s0 + (len * (i + 1)) / n;
    // (a stone parapet is laid in blocks: every other length a shade apart, the odd one mossy)
    const block = arch ? (i % 7 === 3 ? STONE_MOSS : i % 2 ? STONE : STONE_2) : body;
    for (const sd of [-1, 1]) {
      const inner = sd * KERB_AT;
      const edge = sd * out;
      T.quad(block, pt(a, inner, 0), pt(a, inner, wall), pt(c, inner, wall), pt(c, inner, 0));
      T.quad(arch && i % 2 ? STONE_CAP_2 : cap, pt(a, inner, wall), pt(a, edge, wall), pt(c, edge, wall), pt(c, inner, wall));
      T.quad(block, pt(a, edge, wall), pt(a, edge, -slab), pt(c, edge, -slab), pt(c, edge, wall));
    }
    T.quad(under, pt(a, -out, -slab), pt(a, out, -slab), pt(c, out, -slab), pt(c, -out, -slab));
  }
  // closing faces at both ends
  for (const s of [s0, s1]) {
    T.quad(under, pt(s, -out, wall), pt(s, out, wall), pt(s, out, -slab), pt(s, -out, -slab));
  }

  if (arch) {
    // ---- stone arches: bays of about 13 m, piers between them, the spandrel walls filled in
    const bays = Math.max(1, Math.round((f.span1 - f.span0) / 13));
    const bayLen = (f.span1 - f.span0) / bays;
    const pier = Math.min(1.5, bayLen * 0.16);
    for (let k = 0; k < bays; k++) {
      const a0 = f.span0 + k * bayLen + pier / 2;
      const a1 = f.span0 + (k + 1) * bayLen - pier / 2;
      const SEG = 10;
      // the arch springs from a little above the water and rises to just under the slab
      const yTop = (s: number): number => {
        sp.at(s, st);
        return st.y - slab - 0.25;
      };
      const mid = (a0 + a1) / 2;
      const crown = yTop(mid) - 0.1;
      const spring = Math.max(f.level0 + 0.5, crown - (a1 - a0) * 0.46);
      const intr = (u: number): number => spring + (crown - spring) * Math.sqrt(Math.max(0, 1 - (2 * u - 1) * (2 * u - 1)));
      for (let q = 0; q < SEG; q++) {
        const u0 = q / SEG;
        const u1 = (q + 1) / SEG;
        const sa = a0 + (a1 - a0) * u0;
        const sb = a0 + (a1 - a0) * u1;
        const ya = intr(u0);
        const yb = intr(u1);
        // soffit
        T.quad(STONE_DARK, ptAbs(sa, -out, ya), ptAbs(sa, out, ya), ptAbs(sb, out, yb), ptAbs(sb, -out, yb));
        // spandrels on both faces, and the ring of the arch a shade lighter
        for (const sd of [-1, 1]) {
          T.quad(STONE, ptAbs(sa, sd * out, ya), ptAbs(sa, sd * out, yTop(sa) + 0.3), ptAbs(sb, sd * out, yTop(sb) + 0.3), ptAbs(sb, sd * out, yb));
          T.quad(STONE_CAP, ptAbs(sa, sd * (out + 0.05), ya), ptAbs(sa, sd * (out + 0.05), ya + 0.4), ptAbs(sb, sd * (out + 0.05), yb + 0.4), ptAbs(sb, sd * (out + 0.05), yb));
        }
      }
      // piers and abutments: from the springing down into the bed
      for (const [ps, half] of [[f.span0 + k * bayLen, pier / 2], [f.span0 + (k + 1) * bayLen, pier / 2]] as const) {
        if (k > 0 && ps === f.span0 + k * bayLen) continue; // shared with the bay before
        const foot = Math.min(bedAt(ps, 0), bedAt(ps, out), bedAt(ps, -out)) - 1.2;
        const top = yTop(ps) + 0.3;
        const widen = 0.35;
        const A = ps - half;
        const B = ps + half;
        for (const sd of [-1, 1]) {
          T.quad(STONE, ptAbs(A, sd * (out + widen), foot), ptAbs(A, sd * (out + widen), spring + 0.4), ptAbs(B, sd * (out + widen), spring + 0.4), ptAbs(B, sd * (out + widen), foot));
          T.quad(STONE, ptAbs(A, sd * out, spring + 0.4), ptAbs(A, sd * out, top), ptAbs(B, sd * out, top), ptAbs(B, sd * out, spring + 0.4));
          T.quad(STONE_CAP, ptAbs(A, sd * out, spring + 0.4), ptAbs(A, sd * (out + widen), spring + 0.4), ptAbs(B, sd * (out + widen), spring + 0.4), ptAbs(B, sd * out, spring + 0.4));
        }
        for (const [sq, face] of [[A, STONE_DARK], [B, STONE_DARK]] as const) {
          T.quad(face, ptAbs(sq, -(out + widen), foot), ptAbs(sq, out + widen, foot), ptAbs(sq, out + widen, spring + 0.4), ptAbs(sq, -(out + widen), spring + 0.4));
        }
      }
    }
    // lamp-less stone posts at the four corners
    for (const s of [f.span0 - 2, f.span1 + 2]) {
      for (const sd of [-1, 1]) {
        const p = pt(s, sd * (KERB_AT + 0.25), 0);
        b.box(p[0], p[1] + 0.65, p[2], 0.6, 1.3, 0.6, STONE_CAP);
        b.box(p[0], p[1] + 1.36, p[2], 0.75, 0.14, 0.75, STONE);
      }
    }
  } else {
    // ---- girders under the slab, piers every 18 m or so
    for (const gd of [-2.7, 2.7]) {
      for (let i = 0; i < n; i++) {
        const a = s0 + (len * i) / n;
        const c = s0 + (len * (i + 1)) / n;
        const d0 = gd - 0.3;
        const d1 = gd + 0.3;
        T.quad(CONCRETE_DARK, pt(a, d0, -slab), pt(a, d0, -slab - 1.25), pt(c, d0, -slab - 1.25), pt(c, d0, -slab));
        T.quad(CONCRETE_DARK, pt(a, d1, -slab - 1.25), pt(a, d1, -slab), pt(c, d1, -slab), pt(c, d1, -slab - 1.25));
        T.quad(under, pt(a, d0, -slab - 1.25), pt(a, d1, -slab - 1.25), pt(c, d1, -slab - 1.25), pt(c, d0, -slab - 1.25));
      }
    }
    const piers = Math.max(1, Math.round((f.span1 - f.span0) / 18) - 1);
    for (let k = 1; k <= piers; k++) {
      const ps = f.span0 + ((f.span1 - f.span0) * k) / (piers + 1);
      sp.at(ps, st);
      const top = st.y - slab - 1.25;
      const foot = Math.min(bedAt(ps, 0), bedAt(ps, 2.6), bedAt(ps, -2.6)) - 1.5;
      const pc = ptAbs(ps, 0, 0);
      const yaw = -st.phi;
      // a hammerhead: one column and a cap under the girders
      b.box(pc[0], (top - 1.0 + foot) / 2 - oy, pc[2], 1.5, top - 1.0 - foot, 2.6, CONCRETE, { ry: yaw });
      b.box(pc[0], top - 0.5 - oy, pc[2], 1.7, 1.0, 8.2, CONCRETE, { ry: yaw });
    }
    // ---- railings: posts every 2.5 m and two rails
    const posts = Math.max(2, Math.round(len / 2.5));
    for (const sd of [-1, 1]) {
      let prev: number[] | null = null;
      for (let i = 0; i <= posts; i++) {
        const s = s0 + (len * i) / posts;
        const p = pt(s, sd * (KERB_AT + 0.18), KERB_HEIGHT);
        b.box(p[0], p[1] + 0.5, p[2], 0.09, 1.0, 0.09, STEEL_DARK);
        if (prev) {
          b.bar(prev[0], prev[1] + 0.98, prev[2], p[0], p[1] + 0.98, p[2], 0.08, STEEL);
          b.bar(prev[0], prev[1] + 0.55, prev[2], p[0], p[1] + 0.55, p[2], 0.05, STEEL);
        }
        prev = p;
      }
    }
    if (f.bridge === 'truss') {
      // ---- a through truss: the road runs inside a cage of steel
      const panels = Math.max(4, Math.round((f.span1 - f.span0) / 6.5));
      const H = 5.4;
      const side = DECK_HALF + 0.25;
      const node = (i: number, sd: number, up: number): number[] => pt(f.span0 + ((f.span1 - f.span0) * i) / panels, sd * side, up);
      for (const sd of [-1, 1]) {
        for (let i = 0; i < panels; i++) {
          const a0 = node(i, sd, 0.2);
          const a1 = node(i + 1, sd, 0.2);
          const t0 = node(i, sd, H);
          const t1 = node(i + 1, sd, H);
          b.bar(a0[0], a0[1], a0[2], a1[0], a1[1], a1[2], 0.3, STEEL_DARK);
          // the top chord starts one panel in: the end posts lean
          if (i > 0 && i < panels - 1) b.bar(t0[0], t0[1], t0[2], t1[0], t1[1], t1[2], 0.3, STEEL);
          if (i === 0) b.bar(a0[0], a0[1], a0[2], t1[0], t1[1], t1[2], 0.32, STEEL);
          else if (i === panels - 1) b.bar(t0[0], t0[1], t0[2], a1[0], a1[1], a1[2], 0.32, STEEL);
          else {
            b.bar(a0[0], a0[1], a0[2], t0[0], t0[1], t0[2], 0.2, STEEL);
            // diagonals lean towards the middle of the span
            if (i < panels / 2) b.bar(t0[0], t0[1], t0[2], a1[0], a1[1], a1[2], 0.16, i % 3 === 1 ? RUST : STEEL);
            else b.bar(a0[0], a0[1], a0[2], t1[0], t1[1], t1[2], 0.16, i % 3 === 1 ? RUST : STEEL);
          }
        }
      }
      // overhead: a strut across at every panel point, and light bracing between
      for (let i = 1; i < panels; i++) {
        const l = node(i, -1, H);
        const r = node(i, 1, H);
        b.bar(l[0], l[1], l[2], r[0], r[1], r[2], 0.2, STEEL_DARK);
        if (i < panels - 1) {
          const r2 = node(i + 1, i % 2 ? 1 : -1, H);
          const l2 = i % 2 ? l : r;
          b.bar(l2[0], l2[1], l2[2], r2[0], r2[1], r2[2], 0.1, STEEL_DARK);
        }
      }
    }
  }
  T.into(b);
  return { geometry: b.build(), wx: ox, wy: oy, wz: oz };
}
