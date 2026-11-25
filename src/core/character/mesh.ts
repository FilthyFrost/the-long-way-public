// Her skin as a skinned mesh (docs/V3/plan/character-pv.md §3): the field's surface polygonized, simplified where it
// is plain, every vertex given the four bones it follows and what the skin is there (palm, knuckle, the part of her
// it belongs to), all in the bind pose. Pure TypeScript: run by the build script (tools/character/build.ts) and in tests.

import { type Field, type Node, type Prim, Kind, compile, primAxial, primDist, primsOf } from './sdf';
import { decimate } from './decimate';
import { polygonize } from './polygonize';
import type { Skeleton } from './skeleton';
import type { Sculpt } from './body';

export interface SkinnedData {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  /** four bones a vertex, and their weights (summing to 1) */
  skinIndex: Uint16Array;
  skinWeight: Float32Array;
  /**
   * What the skin is, four numbers a vertex:
   *   x  palm-ness: 0 the back of the hand or the top of the foot … 1 the palm or the sole (paler skin)
   *   y  blush: knuckles, knees, elbows, fingertips, toes (a touch of red)
   *   z  part: 0 trunk and legs, 1 head and neck, 2 left arm, 3 right arm (first person hides some)
   *   w  ink: a number that runs smoothly along the skin and differs where one part lies over another (the line)
   */
  skin: Float32Array;
  /**
   * Where on a finger or toe a vertex is, for the nails and the creases drawn on them: x across (−1 … 1), y along its
   * bone (0 at the joint it starts from … 1 at the next, or the tip), z out of its back (1 the middle of the back, −1
   * the pad), w which (1 index, 2 middle, 3 ring, 4 little, 5 thumb, + 10 × the bone 1–3; toes 60 + the toe for the
   * last bone, 70 + the toe for the first); 0 elsewhere.
   */
  finger: Float32Array;
  /** which region of her body (wardrobe.ts REGIONS): what a garment over it hides */
  region: Float32Array;
}

export interface MeshOptions {
  /** cell size of the polygonizer (m) */
  h: number;
  /** triangles to end with */
  target: number;
  min: [number, number, number];
  max: [number, number, number];
  /** keep only what lies beyond this plane (point, normal): the first-person arm cut off above the elbow */
  keep?: { at: [number, number, number]; n: [number, number, number] };
  /** longest edge allowed after simplifying */
  maxEdge?: number;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Bones whose vertices are worth more triangles (hands, face, feet, joints). */
function importance(sk: Skeleton, sc: Sculpt, positions: Float64Array): Float32Array {
  const w = new Float32Array(positions.length / 3).fill(1);
  const head = sk.bindPos[sk.index.Head];
  const handsW = [sc.hands.l.wrist, sc.hands.r.wrist];
  const ankles = [sk.bindPos[sk.index.foot_l], sk.bindPos[sk.index.foot_r]];
  const joints = ['lowerarm_l', 'lowerarm_r', 'calf_l', 'calf_r', 'upperarm_l', 'upperarm_r', 'thigh_l', 'thigh_r'].map((n) => sk.bindPos[sk.index[n]]);
  for (let i = 0; i < w.length; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    let k = 1;
    // the face (front of the head)
    if (y > head[1] - 0.06 && z > head[2] + 0.02 && Math.hypot(x, y - head[1] - 0.05) < 0.12) k = Math.max(k, 5);
    for (const hw of handsW) if (Math.hypot(x - hw[0], y - hw[1], z - hw[2]) < 0.15) k = Math.max(k, 8);
    for (const a of ankles) if (Math.hypot(x - a[0], y - a[1] + 0.03, z - a[2] - 0.05) < 0.13) k = Math.max(k, 4);
    for (const j of joints) if (Math.hypot(x - j[0], y - j[1], z - j[2]) < 0.07) k = Math.max(k, 2.5);
    w[i] = k;
  }
  return w;
}

export function buildSkinned(sk: Skeleton, sc: Sculpt, o: MeshOptions, tree: Node = sc.tree): SkinnedData {
  let f: Field = compile(tree, 0.04);
  if (o.keep) {
    // cut by a plane: beyond it the body, before it nothing (a flat cap the first-person view never sees)
    const [px, py, pz] = o.keep.at, [nx, ny, nz] = o.keep.n;
    const body = f;
    f = (x, y, z) => Math.max(body(x, y, z), -((x - px) * nx + (y - py) * ny + (z - pz) * nz));
  }
  const raw = polygonize(f, { h: o.h, min: o.min, max: o.max, project: 3 });
  const imp = importance(sk, sc, raw.positions);
  const dec = decimate(raw.positions, raw.indices, { target: o.target, weight: imp, maxEdge: o.maxEdge ?? 0.035 });
  // back onto the surface, and normals from the field (smooth whatever the triangles)
  const n = dec.positions.length / 3;
  const positions = new Float32Array(n * 3);
  const normals = new Float32Array(n * 3);
  const e = o.h * 0.4;
  for (let i = 0; i < n; i++) {
    let x = dec.positions[i * 3], y = dec.positions[i * 3 + 1], z = dec.positions[i * 3 + 2];
    for (let s = 0; s < 2; s++) {
      const d = f(x, y, z);
      let gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
      const l = Math.hypot(gx, gy, gz) || 1;
      gx /= l; gy /= l; gz /= l;
      const step = Math.max(-o.h, Math.min(o.h, d));
      x -= gx * step; y -= gy * step; z -= gz * step;
    }
    positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
    let gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    gx /= l; gy /= l; gz /= l;
    normals[i * 3] = gx; normals[i * 3 + 1] = gy; normals[i * 3 + 2] = gz;
  }
  const prims = primsOf(tree).filter((p) => p.kind !== Kind.Plane && p.claim > 0);
  const { skinIndex, skinWeight, dominant } = skinWeights(sk, prims, positions);
  const skin = skinAttributes(sk, sc, prims, positions, skinIndex, skinWeight, dominant);
  faceNormals(sk, positions, normals, skin);
  handNormals(f, prims, dominant, positions, normals);
  const finger = fingerCoords(prims, dominant, positions);
  const region = new Float32Array(n);
  for (let i = 0; i < n; i++) region[i] = regionOf(prims[dominant[i]].name);
  return { positions, normals, indices: dec.indices, skinIndex, skinWeight, skin, finger, region };
}

/**
 * Each vertex follows the solids nearest it: the nearest fully, others by how little farther they are (a few
 * millimetres' falloff), each solid's share handed along its length to the bones before and after it.
 */
export function skinWeights(sk: Skeleton, prims: Prim[], positions: Float32Array, sigma = 0.0045): {
  skinIndex: Uint16Array; skinWeight: Float32Array; dominant: Int32Array;
} {
  const n = positions.length / 3;
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const dominant = new Int32Array(n);
  const acc = new Float64Array(sk.names.length);
  const d = new Float64Array(prims.length);
  const touched: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    let dmin = Infinity, best = 0;
    for (let k = 0; k < prims.length; k++) {
      const p = prims[k];
      const bx = x - p.bc[0], by = y - p.bc[1], bz = z - p.bc[2];
      const far = Math.sqrt(bx * bx + by * by + bz * bz) - p.br;
      if (far > dmin + 6 * sigma && far > 0.05) { d[k] = Infinity; continue; }
      d[k] = primDist(p, x, y, z);
      if (d[k] < dmin) { dmin = d[k]; best = k; }
    }
    dominant[i] = best;
    touched.length = 0;
    for (let k = 0; k < prims.length; k++) {
      const dk = d[k];
      if (dk - dmin > 6 * sigma) continue;
      const p = prims[k];
      const w = p.claim * Math.exp(-(dk - dmin) / sigma);
      const s = primAxial(p, x, y, z);
      const tA = p.boneA >= 0 ? 1 - smoothstep(p.atA - p.bandA, p.atA + p.bandA, s) : 0;
      const tB = p.boneB >= 0 ? smoothstep(p.atB - p.bandB, p.atB + p.bandB, s) : 0;
      const main = Math.max(0, 1 - tA - tB);
      const give = (b: number, v: number) => {
        if (v <= 0) return;
        if (acc[b] === 0) touched.push(b);
        acc[b] += v;
      };
      give(p.bone, w * main);
      if (tA > 0) give(p.boneA, w * tA);
      if (tB > 0) give(p.boneB, w * tB);
    }
    // the forearm's twist: the share of the forearm toward the wrist goes to its twist bone
    for (const s of ['l', 'r']) {
      const lo = sk.index[`lowerarm_${s}`], tw = sk.index[`lowerarm_twist_${s}`];
      if (acc[lo] > 0) {
        const e0 = sk.bindPos[lo], e1 = sk.bindPos[sk.index[`hand_${s}`]];
        const ax = e1[0] - e0[0], ay = e1[1] - e0[1], az = e1[2] - e0[2];
        const u = Math.min(1, Math.max(0, ((x - e0[0]) * ax + (y - e0[1]) * ay + (z - e0[2]) * az) / (ax * ax + ay * ay + az * az)));
        const share = smoothstep(0.1, 1.0, u) * 0.85;
        if (acc[tw] === 0) touched.push(tw);
        acc[tw] += acc[lo] * share;
        acc[lo] *= 1 - share;
      }
    }
    // the four largest
    touched.sort((a, b) => acc[b] - acc[a]);
    let sum = 0;
    for (let j = 0; j < 4 && j < touched.length; j++) sum += acc[touched[j]];
    for (let j = 0; j < 4; j++) {
      if (j < touched.length && sum > 0) {
        skinIndex[i * 4 + j] = touched[j];
        skinWeight[i * 4 + j] = acc[touched[j]] / sum;
      }
    }
    for (const b of touched) acc[b] = 0;
  }
  return { skinIndex, skinWeight, dominant };
}

function skinAttributes(sk: Skeleton, sc: Sculpt, prims: Prim[], positions: Float32Array, skinIndex: Uint16Array, skinWeight: Float32Array, dominant: Int32Array): Float32Array {
  const n = positions.length / 3;
  const out = new Float32Array(n * 4);
  const boneName = sk.names;
  const armOf = (b: number): number => {
    const nm = boneName[b];
    if (/^(upperarm|lowerarm|hand|index|middle|ring|pinky|thumb)/.test(nm)) return /_l$/.test(nm) ? 2 : 3;
    return -1;
  };
  for (let i = 0; i < n; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    const p = prims[dominant[i]];
    // --- palm-ness: the hand's solids are framed with z toward the palm; the soles are what lies on the floor
    let palm = 0;
    if (/^(palm|palmtop|hypothenar|thenar|knuckle|index|middle|ring|pinky|thumb)/.test(p.name)) {
      const F = p.frame, R = F.R;
      const wx = x - F.o[0], wy = y - F.o[1], wz = z - F.o[2];
      const lx = R[0] * wx + R[1] * wy + R[2] * wz, lz = R[6] * wx + R[7] * wy + R[8] * wz;
      const across = Math.hypot(lx, lz) || 1;
      palm = smoothstep(-0.15, 0.5, lz / across);
      if (/^knuckle/.test(p.name)) palm *= 0.3;
    } else if (/^(heel|arch|outeredge|ballpad|toe|ankle|foot)/.test(p.name)) {
      palm = smoothstep(0.013, 0.004, y);
    }
    // --- blush
    let blush = 0;
    if (p.tag === 5 /* Knuckle */) blush = 0.7;
    if (/^(index|middle|ring|pinky|thumb)3/.test(p.name)) {
      // fingertips: toward the end of the last bone
      blush = Math.max(blush, smoothstep(0.35, 1.0, primAxial(p, x, y, z) / Math.max(1e-4, p.c)) * 0.8);
    }
    if (/^(index|middle|ring|pinky|thumb)pad3/.test(p.name)) blush = Math.max(blush, 0.55);
    if (/^(elbow|knee|patella)/.test(p.name)) blush = Math.max(blush, 0.5);
    if (/^toe/.test(p.name)) blush = Math.max(blush, 0.45);
    // --- part: by the bones it follows
    let headW = 0, armL = 0, armR = 0;
    for (let j = 0; j < 4; j++) {
      const b = skinIndex[i * 4 + j], w = skinWeight[i * 4 + j];
      const nm = boneName[b];
      if (nm === 'Head') headW += w;
      else if (nm === 'neck_01') headW += w * 0.5;
      const a = armOf(b);
      if (a === 2) armL += w;
      else if (a === 3) armR += w;
    }
    let part = 0;
    if (headW > 0.5) part = 1;
    else if (armL > 0.5) part = 2;
    else if (armR > 0.5) part = 3;
    // --- ink: zero on the trunk, rising out along each limb, the left and right sides apart, the fingers each their
    // own rise from the palm, so where one lies over another the number jumps and the frame draws a line
    let ink = 0;
    const along = (a: number[], b: number[]) => {
      const ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2];
      return Math.min(1, Math.max(0, ((x - a[0]) * ax + (y - a[1]) * ay + (z - a[2]) * az) / (ax * ax + ay * ay + az * az)));
    };
    const J = (nm: string) => sk.bindPos[sk.index[nm]];
    const side = x >= 0 ? 'l' : 'r';
    const lr = side === 'l' ? 0 : 1;
    if (part === 2 || part === 3) {
      const s = part === 2 ? 'l' : 'r';
      const sideBase = part === 2 ? 0.18 : 0.3;
      const tArm = along(J(`upperarm_${s}`), J(`hand_${s}`));
      ink = sideBase * smoothstep(0.0, 0.25, tArm) + 0.12 * tArm;
      const fm = /^(index|middle|ring|pinky|thumb)/.exec(p.name);
      if (fm) {
        const order: Record<string, number> = { thumb: 0.62, index: 0.86, middle: 0.5, ring: 0.74, pinky: 0.98 };
        const f = fm[1];
        const tF = along(J(`${f}_01_${s}`), J(`${f}_04_leaf_${s}`));
        ink = ink + (order[f] - ink) * smoothstep(0.05, 0.55, tF);
      }
    } else if (part === 0 && y < 0.86) {
      const tLeg = along(J(`thigh_${side}`), J(`foot_${side}`));
      ink = (lr === 0 ? 0.36 : 0.66) * smoothstep(0.08, 0.45, tLeg);
    } else if (part === 1) {
      ink = 0;
    }
    out[i * 4] = palm;
    out[i * 4 + 1] = blush;
    out[i * 4 + 2] = part;
    out[i * 4 + 3] = ink;
  }
  return out;
}

/**
 * The face is shaded as a round thing, not by its nose and cheekbones (the way anime faces are lit; Guilty Gear
 * Xrd's edited normals): across the front of the head the normals are those of an egg round it, so the light
 * turns across the face along one smooth line and the nose throws no shadow; the nose and chin still stand out
 * in the outline.
 */
function faceNormals(sk: Skeleton, positions: Float32Array, normals: Float32Array, skin: Float32Array): void {
  const h = sk.bindPos[sk.index.Head];
  const c = [h[0], h[1] + 0.075, h[2] - 0.004];
  const r = [0.074, 0.112, 0.094];
  for (let i = 0; i < positions.length / 3; i++) {
    if (skin[i * 4 + 2] !== 1) continue;
    const x = positions[i * 3] - c[0], y = positions[i * 3 + 1] - c[1], z = positions[i * 3 + 2] - c[2];
    // how much of the face this is: the front of the head, above the chin's underside
    const front = smoothstep(-0.03, 0.03, z) * smoothstep(-0.115, -0.085, y);
    if (front <= 0) continue;
    let ex = x / (r[0] * r[0]), ey = y / (r[1] * r[1]), ez = z / (r[2] * r[2]);
    const l = Math.hypot(ex, ey, ez) || 1;
    ex /= l; ey /= l; ez /= l;
    const w = front * 0.9;
    let nx = normals[i * 3] * (1 - w) + ex * w, ny = normals[i * 3 + 1] * (1 - w) + ey * w, nz = normals[i * 3 + 2] * (1 - w) + ez * w;
    const m = Math.hypot(nx, ny, nz) || 1;
    normals[i * 3] = nx / m; normals[i * 3 + 1] = ny / m; normals[i * 3 + 2] = nz / m;
  }
}

const HAND = /^(palm|palmtop|hypothenar|thenar|knuckle|index|middle|ring|pinky|thumb|wrist|ulnahead|radiusend)/;

/** The region of her body a solid belongs to (wardrobe.ts REGIONS' order). */
export function regionOf(name: string): number {
  if (/^(trunk|chest|waist|belly|hips|trap|breast|buttock|blade|acromion|asis|erector|sternoclav|clavicle)/.test(name)) return 0;
  if (/^(deltoid|upperarm|elbow)/.test(name)) return 1;
  if (/^forearm/.test(name)) return 2;
  if (HAND.test(name)) return 3;
  if (/^(thigh|innerthigh|quad|knee|patella)/.test(name)) return 4;
  if (/^(calf|gastro|shin)/.test(name)) return 5;
  if (/^(heel|arch|outeredge|ballpad|toe|ankle|mal|achilles|foot)/.test(name)) return 6;
  if (/^neck/.test(name)) return 7;
  return 8;
}

/**
 * A hand is shaded by its shape, not by every swell of it: the normals there are the field's measured over a few
 * millimetres, so the light turns along the length of a finger in one clean line instead of breaking up over its
 * joints and pads.
 */
function handNormals(f: Field, prims: Prim[], dominant: Int32Array, positions: Float32Array, normals: Float32Array): void {
  const e = 0.0032;
  for (let i = 0; i < positions.length / 3; i++) {
    if (!HAND.test(prims[dominant[i]].name)) continue;
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    let gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    gx /= l; gy /= l; gz /= l;
    let nx = normals[i * 3] * 0.35 + gx * 0.65, ny = normals[i * 3 + 1] * 0.35 + gy * 0.65, nz = normals[i * 3 + 2] * 0.35 + gz * 0.65;
    const m = Math.hypot(nx, ny, nz) || 1;
    normals[i * 3] = nx / m; normals[i * 3 + 1] = ny / m; normals[i * 3 + 2] = nz / m;
  }
}

const FINGER = /^(index|middle|ring|pinky|thumb)([123])_[lr]$/;
const TOE = /^toe(\d)([ab])_[lr]$/;
const FINGER_ID: Record<string, number> = { index: 1, middle: 2, ring: 3, pinky: 4, thumb: 5 };

function fingerCoords(prims: Prim[], dominant: Int32Array, positions: Float32Array): Float32Array {
  const out = new Float32Array(positions.length / 3 * 4);
  // (a finger's pad lies under its bone's skin: there the coordinates are the bone's)
  const byName = new Map(prims.map((p) => [p.name, p]));
  for (let i = 0; i < positions.length / 3; i++) {
    let p = prims[dominant[i]];
    const pm = /^(index|middle|ring|pinky|thumb)pad([123])_([lr])$/.exec(p.name);
    if (pm) p = byName.get(`${pm[1]}${pm[2]}_${pm[3]}`) ?? p;
    const fm = FINGER.exec(p.name), tm = fm ? null : TOE.exec(p.name);
    if (!fm && !tm) continue;
    const F = p.frame, R = F.R;
    const wx = positions[i * 3] - F.o[0], wy = positions[i * 3 + 1] - F.o[1], wz = positions[i * 3 + 2] - F.o[2];
    const lx = R[0] * wx + R[1] * wy + R[2] * wz, ly = R[3] * wx + R[4] * wy + R[5] * wz, lz = R[6] * wx + R[7] * wy + R[8] * wz;
    const L = Math.max(1e-4, p.c);
    const v = ly / L;
    const r = (p.a + (p.b - p.a) * Math.min(1, Math.max(0, v))) || 1e-3;
    const u = lx / (r * p.e);
    // fingers' frames have z toward the palm; toes' z points up (out of the back of the foot)
    const back = fm ? -lz / (r * p.f) : lz / (r * p.f);
    const code = fm ? FINGER_ID[fm[1]] + 10 * Number(fm[2]) : (tm![2] === 'b' ? 60 : 70) + Number(tm![1]);
    out.set([u, v, back, code], i * 4);
  }
  return out;
}

/**
 * How each named array is stored: normals as signed bytes, weights and the skin's numbers as unsigned bytes (all
 * read by three.js as normalised), finger coordinates as 16-bit numbers in thousandths, regions as bytes, indices
 * as 16-bit when the mesh has few enough vertices. Positions and everything else stay 32-bit floats.
 */
function quantize(name: string, arr: ArrayBufferView & { length: number }, vertexCount: number): ArrayBufferView & { length: number } {
  if (!(arr instanceof Float32Array) && !(name === 'indices' && arr instanceof Uint32Array)) return arr;
  if (name === 'indices') return vertexCount < 65536 ? Uint16Array.from(arr as Uint32Array) : arr;
  const f = arr as Float32Array;
  if (name === 'normals') return Int8Array.from(f, (v) => Math.max(-127, Math.min(127, Math.round(v * 127))));
  if (name === 'skinWeight') {
    // rounded so each vertex's four still sum to 255
    const out = new Uint8Array(f.length);
    for (let i = 0; i < f.length; i += 4) {
      let sum = 0;
      for (let j = 1; j < 4; j++) { out[i + j] = Math.round(f[i + j] * 255); sum += out[i + j]; }
      out[i] = Math.max(0, 255 - sum);
    }
    return out;
  }
  if (name === 'skin') return Uint8Array.from(f, (v, i) => Math.max(0, Math.min(255, Math.round((i % 4 === 2 ? v / 3 : v) * 255))));
  if (name === 'finger') return Int16Array.from(f, (v) => Math.max(-32767, Math.min(32767, Math.round(v * 1000))));
  if (name === 'region') return Uint8Array.from(f, (v) => Math.round(v));
  return arr;
}

/** Serialises a skinned mesh to one buffer: a small JSON header then the arrays, 4-byte aligned. */
export function packSkinned(parts: Record<string, SkinnedData>, meta: Record<string, unknown>): Uint8Array {
  const header: { meta: Record<string, unknown>; parts: Record<string, Record<string, [number, number, string]>> } = { meta, parts: {} };
  const chunks: ArrayBufferView[] = [];
  let offset = 0;
  for (const [name, d] of Object.entries(parts)) {
    const entry: Record<string, [number, number, string]> = {};
    const vertexCount = ((d as { positions?: Float32Array }).positions?.length ?? 0) / 3;
    for (const [k, raw] of Object.entries(d) as [string, ArrayBufferView & { length: number }][]) {
      const arr = quantize(k, raw, vertexCount);
      const type = arr instanceof Float32Array ? 'f32' : arr instanceof Uint32Array ? 'u32' : arr instanceof Uint16Array ? 'u16' : arr instanceof Int16Array ? 'i16' : arr instanceof Int8Array ? 'i8' : 'u8';
      entry[k] = [offset, arr.length, type];
      chunks.push(arr);
      offset += arr.byteLength;
      const pad = (4 - (offset % 4)) % 4;
      if (pad) { chunks.push(new Uint8Array(pad)); offset += pad; }
    }
    header.parts[name] = entry;
  }
  const json = new TextEncoder().encode(JSON.stringify(header));
  const jpad = (4 - ((json.length + 4) % 4)) % 4;
  const out = new Uint8Array(4 + json.length + jpad + offset);
  new DataView(out.buffer).setUint32(0, json.length + jpad, true);
  out.set(json, 4);
  for (let i = 0; i < jpad; i++) out[4 + json.length + i] = 32;
  let o2 = 4 + json.length + jpad;
  for (const c of chunks) {
    out.set(new Uint8Array(c.buffer, c.byteOffset, c.byteLength), o2);
    o2 += c.byteLength;
  }
  return out;
}

export function unpackSkinned(buf: ArrayBuffer): { meta: Record<string, unknown>; parts: Record<string, SkinnedData> } {
  const dv = new DataView(buf);
  const jlen = dv.getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, jlen)));
  const base = 4 + jlen;
  const parts: Record<string, SkinnedData> = {};
  for (const [name, entry] of Object.entries(header.parts as Record<string, Record<string, [number, number, string]>>)) {
    const d: Record<string, ArrayBufferView> = {};
    for (const [k, [off, len, type]] of Object.entries(entry)) {
      const at = base + off;
      d[k] = type === 'f32' ? new Float32Array(buf, at, len) : type === 'u32' ? new Uint32Array(buf, at, len) : type === 'u16' ? new Uint16Array(buf, at, len) : type === 'i16' ? new Int16Array(buf, at, len) : type === 'i8' ? new Int8Array(buf, at, len) : new Uint8Array(buf, at, len);
    }
    parts[name] = d as unknown as SkinnedData;
  }
  return { meta: header.meta, parts };
}

export { primDist };
