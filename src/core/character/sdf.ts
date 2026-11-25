// The shapes she is sculpted from, and the tree that joins them (docs/V3/plan/character-pv.md §3).
//
// Every part of her body is a handful of rounded solids hung on her bones — an ellipsoid for a calf's swell, a round
// cone for a finger's bone, a rounded box for the palm — joined by smooth unions so one flows into the next as clay
// would. The surface she is drawn with is where this field crosses zero (polygonize.ts), her weights come from which
// solid each point of it belongs to (skinweights.ts), and the clothes are sculpted from the same field pushed out.
//
// Distances are in metres. The field is a signed distance (or a close lower bound of one, as smooth unions and
// ellipsoids give): negative inside, positive outside. Pure TypeScript: no three.js, so it runs in tests and a worker.

/** A rigid frame: local = R (world - o). R is row-major 3×3, its rows the local axes in world space. */
export interface Frame {
  o: [number, number, number];
  R: [number, number, number, number, number, number, number, number, number];
}

export const enum Kind {
  Sphere = 0,
  /** radii (a, b, c) along local x, y, z */
  Ellipsoid = 1,
  /** from local origin up local +y by h, radius r1 at the foot and r2 at the top; cross-section squashed by sx, sz */
  RoundCone = 2,
  /** half extents (a, b, c), rounded by r */
  RoundBox = 3,
  /** in the local xz plane: ring radius a, tube radius b */
  Torus = 4,
  /** the half-space below the local xz plane (local y < 0 is inside) */
  Plane = 5,
  /** a solid swept along local +y through cross-sections, each eight radii round the axis (LoftData) */
  Loft = 6,
}

/**
 * A loft's cross-section: where along the axis it is (m from the start), its outline as eight radii round the axis
 * (from local +x toward local +z, every 45°: r[0] +x, r[2] +z, r[4] −x, r[6] −z), its middle off the axis (local x,
 * z), and how far the outline is turned about the axis there (rad, from +x toward +z). A limb's sections are its
 * girths where they are measured: a calf is widest behind and to the inside, a forearm flat near the wrist and turned
 * with the hand.
 */
export interface LoftSection {
  t: number;
  r: number[];
  cx?: number;
  cz?: number;
  tw?: number;
}

/** A loft's sections ready to sample: values and their slopes along the axis (per metre), section by section. */
export interface LoftData {
  n: number;
  t: Float64Array;
  /** per section: 8 radii, cx, cz, twist (11 numbers), and the same 11 slopes */
  v: Float64Array;
  m: Float64Array;
  rmax: number;
  /** its ends rounded (a limb meeting the next at a joint) or cut flat (a trunk's pieces) */
  round: boolean;
}

const LOFT_W = 11;

export interface Prim {
  kind: Kind;
  frame: Frame;
  /** shape numbers, by kind (see Kind) */
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  /** the bone this solid moves with */
  bone: number;
  /**
   * Along the solid's local y it may hand its surface over to the bone before it (below atA) and the bone after it
   * (beyond atB), half and half at those points, spread over ±band (-1: none). A finger's bone hands over to the
   * hand at its knuckle and to the next bone at its next joint, so a bent joint is shared and not creased.
   */
  boneA: number;
  atA: number;
  bandA: number;
  boneB: number;
  atB: number;
  bandB: number;
  /** what the surface here is: skin, palm, nail, lip… (Tag) */
  tag: number;
  /** how strongly this solid claims the surface near it for its bone (1 = as much as any) */
  claim: number;
  /** a name, for debugging and tests */
  name: string;
  /** a loft's sections (Kind.Loft only) */
  loft?: LoftData;
  /** bounding sphere (world) */
  bc: [number, number, number];
  br: number;
}

/** What the skin is at a point: drives the material (palms lighter, nails, lips). */
export const enum Tag {
  Skin = 0,
  Palm = 1,
  Nail = 2,
  Lip = 3,
  Sole = 4,
  Knuckle = 5,
}

export type Node =
  | { op: 'prim'; prim: Prim }
  | { op: 'smooth'; k: number; kids: Node[] }
  | { op: 'min'; kids: Node[] }
  | { op: 'carve'; k: number; base: Node; tool: Node }
  | { op: 'add'; k: number; base: Node; tool: Node }
  /** a smooth union whose fillet narrows from kNear at a point to kFar by radius from it (an armpit, a crotch) */
  | { op: 'addNear'; kNear: number; kFar: number; at: [number, number, number]; radius: number; base: Node; tool: Node }
  /** a branch used in several places: its value at the last point asked is kept */
  | { op: 'shared'; node: Node; id: number };

// --- frames -----------------------------------------------------------------------------------------------------

export function frameAt(o: [number, number, number], x: number[], y: number[], z: number[]): Frame {
  return { o: [o[0], o[1], o[2]], R: [x[0], x[1], x[2], y[0], y[1], y[2], z[0], z[1], z[2]] };
}

const norm3 = (v: number[]): number[] => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross3 = (a: number[], b: number[]): number[] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a: number[], b: number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * A frame whose local +y runs from a toward b, local +z as near to `front` as it can be (the side the solid's
 * flattening and swelling are measured from).
 */
export function frameAlong(a: number[], b: number[], front: number[] = [0, 0, 1]): Frame {
  const y = norm3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  let f = front;
  if (Math.abs(dot3(f, y)) > 0.98) f = Math.abs(y[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const x = norm3(cross3(y, f));
  const z = cross3(x, y);
  return frameAt([a[0], a[1], a[2]], x, y, z);
}

/** A frame at o with local axes given (they are made orthonormal: y kept, z as near as can be). */
export function frameAxes(o: number[], y: number[], z: number[]): Frame {
  const yy = norm3(y);
  const x = norm3(cross3(yy, z));
  const zz = cross3(x, yy);
  return frameAt([o[0], o[1], o[2]], x, yy, zz);
}

// --- primitives -------------------------------------------------------------------------------------------------

export interface PrimSpec {
  name?: string;
  bone: number;
  boneA?: number;
  atA?: number;
  bandA?: number;
  boneB?: number;
  /** defaults to the length of a round cone */
  atB?: number;
  bandB?: number;
  tag?: number;
  claim?: number;
}

function makePrim(kind: Kind, frame: Frame, s: PrimSpec, a: number, b: number, c: number, d = 0, e = 1, f = 1): Prim {
  const p: Prim = {
    kind, frame, a, b, c, d, e, f,
    bone: s.bone,
    boneA: s.boneA ?? -1, atA: s.atA ?? 0, bandA: s.bandA ?? 0.02,
    boneB: s.boneB ?? -1, atB: s.atB ?? (kind === Kind.RoundCone || kind === Kind.Loft ? c : 0), bandB: s.bandB ?? 0.02,
    tag: s.tag ?? Tag.Skin, claim: s.claim ?? 1, name: s.name ?? '',
    bc: [0, 0, 0], br: 0,
  };
  boundPrim(p);
  return p;
}

export const sphere = (o: number[], r: number, s: PrimSpec): Prim =>
  makePrim(Kind.Sphere, frameAt([o[0], o[1], o[2]], [1, 0, 0], [0, 1, 0], [0, 0, 1]), s, r, 0, 0);

export const ellipsoid = (frame: Frame, rx: number, ry: number, rz: number, s: PrimSpec): Prim =>
  makePrim(Kind.Ellipsoid, frame, s, rx, ry, rz);

/**
 * A round cone from a (radius r1) to b (radius r2); its cross-section squashed to sx across and sz front to back
 * (1, 1 is round). `front` is the side z faces.
 */
export function roundCone(a: number[], b: number[], r1: number, r2: number, s: PrimSpec, sx = 1, sz = 1, front: number[] = [0, 0, 1]): Prim {
  const h = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  return makePrim(Kind.RoundCone, frameAlong(a, b, front), s, r1, r2, Math.max(h, 1e-5), 0, sx, sz);
}

export const roundBox = (frame: Frame, hx: number, hy: number, hz: number, r: number, s: PrimSpec): Prim =>
  makePrim(Kind.RoundBox, frame, s, hx, hy, hz, r);

export const torus = (frame: Frame, R: number, r: number, s: PrimSpec): Prim => makePrim(Kind.Torus, frame, s, R, r, 0);

/**
 * A loft from a toward b (local +y along it, local +z as near to `front` as it can be) through its sections, sampled
 * between them by monotone cubics (a section's radius is where the outline is widest or narrowest, never overshot).
 * `range` (m along the axis) cuts it short of its first and last sections: pieces of one loft cut so and overlapping
 * are one surface where they overlap (each piece moving with its own bone: a trunk up its spine). `round` ends it in
 * a dome the size of its end section (as a capsule ends) instead of a flat cut: two limbs' lofts so ended at the joint
 * they share are one surface there, with nothing of either sticking out.
 */
export function loft(a: number[], b: number[], sections: LoftSection[], s: PrimSpec, front: number[] = [0, 0, 1], range?: [number, number], round = false): Prim {
  const secs = [...sections].sort((x, y) => x.t - y.t);
  const n = secs.length;
  if (n < 2) throw new Error('a loft needs two sections');
  const t = Float64Array.from(secs, (q) => q.t);
  const v = new Float64Array(n * LOFT_W);
  let rmax = 0;
  secs.forEach((q, i) => {
    if (q.r.length !== 8) throw new Error('a loft section has eight radii');
    for (let k = 0; k < 8; k++) { v[i * LOFT_W + k] = q.r[k]; rmax = Math.max(rmax, q.r[k] + Math.hypot(q.cx ?? 0, q.cz ?? 0)); }
    v[i * LOFT_W + 8] = q.cx ?? 0;
    v[i * LOFT_W + 9] = q.cz ?? 0;
    v[i * LOFT_W + 10] = q.tw ?? 0;
  });
  // slopes: the harmonic mean of the two sides' (Fritsch–Butland), zero where the value turns
  const m = new Float64Array(n * LOFT_W);
  for (let i = 0; i < n; i++) {
    for (let w = 0; w < LOFT_W; w++) {
      const d0 = i > 0 ? (v[i * LOFT_W + w] - v[(i - 1) * LOFT_W + w]) / (t[i] - t[i - 1]) : NaN;
      const d1 = i < n - 1 ? (v[(i + 1) * LOFT_W + w] - v[i * LOFT_W + w]) / (t[i + 1] - t[i]) : NaN;
      let g: number;
      if (Number.isNaN(d0)) g = d1;
      else if (Number.isNaN(d1)) g = d0;
      else g = d0 * d1 > 0 ? (2 * d0 * d1) / (d0 + d1) : 0;
      m[i * LOFT_W + w] = g;
    }
  }
  const data: LoftData = { n, t, v, m, rmax, round };
  const frame = frameAlong(a, b, front);
  const p = makePrim(Kind.Loft, frame, s, range ? range[0] : t[0], 0, range ? range[1] : t[n - 1]);
  p.loft = data;
  boundPrim(p);
  return p;
}

// (scratch for sampling a loft: values and slopes along the axis at one height)
const loftVal = new Float64Array(LOFT_W);
const loftSlope = new Float64Array(LOFT_W);

function sampleLoft(L: LoftData, tt: number): void {
  const t = L.t, n = L.n;
  let i = 0;
  while (i < n - 2 && tt > t[i + 1]) i++;
  const h = t[i + 1] - t[i];
  const u = Math.min(1, Math.max(0, (tt - t[i]) / h));
  const u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  const d00 = (6 * u2 - 6 * u) / h, d10 = 3 * u2 - 4 * u + 1, d01 = (-6 * u2 + 6 * u) / h, d11 = 3 * u2 - 2 * u;
  const a = i * LOFT_W, b = (i + 1) * LOFT_W, V = L.v, M = L.m;
  for (let w = 0; w < LOFT_W; w++) {
    loftVal[w] = h00 * V[a + w] + h10 * h * M[a + w] + h01 * V[b + w] + h11 * h * M[b + w];
    loftSlope[w] = d00 * V[a + w] + d10 * M[a + w] + d01 * V[b + w] + d11 * M[b + w];
  }
}

/** The distance from a point (in the loft's frame) to a loft. */
function loftDist(L: LoftData, t0: number, t1: number, lx: number, ly: number, lz: number): number {
  const tc = ly < t0 ? t0 : ly > t1 ? t1 : ly;
  sampleLoft(L, tc);
  const cx = loftVal[8], cz = loftVal[9], tw = loftVal[10];
  let qx = lx - cx, qz = lz - cz;
  if (tw !== 0) {
    const c = Math.cos(tw), s = Math.sin(tw);
    const rx = c * qx + s * qz, rz = -s * qx + c * qz;
    qx = rx; qz = rz;
  }
  const over = ly - tc;
  const rho = Math.sqrt(qx * qx + qz * qz);
  let phi = Math.atan2(qz, qx);
  if (phi < 0) phi += 2 * Math.PI;
  // round the outline: a closed Catmull-Rom through the eight radii
  const step = Math.PI / 4;
  const f = phi / step;
  const k = Math.min(7, Math.floor(f));
  const s = f - k;
  const k0 = (k + 7) & 7, k2 = (k + 1) & 7, k3 = (k + 2) & 7;
  const s2 = s * s, s3 = s2 * s;
  const c0 = -0.5 * s3 + s2 - 0.5 * s, c1 = 1.5 * s3 - 2.5 * s2 + 1, c2 = -1.5 * s3 + 2 * s2 + 0.5 * s, c3 = 0.5 * s3 - 0.5 * s2;
  const e0 = -1.5 * s2 + 2 * s - 0.5, e1 = 4.5 * s2 - 5 * s, e2 = -4.5 * s2 + 4 * s + 0.5, e3 = 1.5 * s2 - s;
  const R = c0 * loftVal[k0] + c1 * loftVal[k] + c2 * loftVal[k2] + c3 * loftVal[k3];
  const Rphi = (e0 * loftVal[k0] + e1 * loftVal[k] + e2 * loftVal[k2] + e3 * loftVal[k3]) / step;
  const Rt = c0 * loftSlope[k0] + c1 * loftSlope[k] + c2 * loftSlope[k2] + c3 * loftSlope[k3];
  // (the middle's drift along the axis tilts the surface too)
  const cphi = rho > 1e-9 ? qx / rho : 1, sphi = rho > 1e-9 ? qz / rho : 0;
  const slope = Rt - (loftSlope[8] * cphi + loftSlope[9] * sphi);
  const Rs = Math.max(R, 1e-5);
  const nk = Rs / Math.sqrt(Rs * Rs + Rphi * Rphi);
  // beyond a rounded end: a dome of the end section's radius
  if (over !== 0 && L.round) return (Math.sqrt(rho * rho + over * over) - R) * nk;
  let d = (rho - R) * nk;
  d /= Math.sqrt(1 + slope * slope);
  if (over === 0) return d;
  return d <= 0 ? Math.abs(over) : Math.sqrt(d * d + over * over);
}

/** Everything below a plane through o whose upward normal is up (a floor to flatten a sole on). Bounded by reach. */
export const halfSpace = (o: number[], up: number[], reach: number, s: PrimSpec): Prim =>
  makePrim(Kind.Plane, frameAxes(o, up, Math.abs(up[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1]), s, reach, 0, 0);

function boundPrim(p: Prim): void {
  const F = p.frame;
  // the local centre of the shape, then to world
  let cx = 0, cy = 0, cz = 0, r = 0;
  switch (p.kind) {
    case Kind.Sphere: r = p.a; break;
    case Kind.Ellipsoid: r = Math.max(p.a, p.b, p.c); break;
    case Kind.RoundCone: cy = p.c / 2; r = p.c / 2 + Math.max(p.a, p.b) * Math.max(p.e, p.f, 1); break;
    case Kind.RoundBox: r = Math.hypot(p.a, p.b, p.c) + p.d; break;
    case Kind.Torus: r = p.a + p.b; break;
    case Kind.Plane: r = p.a; break;
    case Kind.Loft: cy = (p.a + p.c) / 2; r = (p.c - p.a) / 2 + (p.loft?.rmax ?? 0) * (p.loft?.round ? 2 : 1); break;
  }
  // world = o + R^T local
  const R = F.R;
  p.bc = [F.o[0] + R[0] * cx + R[3] * cy + R[6] * cz, F.o[1] + R[1] * cx + R[4] * cy + R[7] * cz, F.o[2] + R[2] * cx + R[5] * cy + R[8] * cz];
  p.br = r;
}

/** The distance from p (world) to one solid. */
export function primDist(p: Prim, x: number, y: number, z: number): number {
  const F = p.frame, R = F.R;
  const wx = x - F.o[0], wy = y - F.o[1], wz = z - F.o[2];
  const lx = R[0] * wx + R[1] * wy + R[2] * wz;
  const ly = R[3] * wx + R[4] * wy + R[5] * wz;
  const lz = R[6] * wx + R[7] * wy + R[8] * wz;
  switch (p.kind) {
    case Kind.Sphere:
      return Math.sqrt(lx * lx + ly * ly + lz * lz) - p.a;
    case Kind.Ellipsoid: {
      // (Quilez's ellipsoid bound: exact on the surface, close near it)
      const ax = lx / p.a, ay = ly / p.b, az = lz / p.c;
      const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
      const bx = ax / p.a, by = ay / p.b, bz = az / p.c;
      const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
      if (k1 < 1e-12) return -Math.min(p.a, p.b, p.c);
      return (k0 * (k0 - 1)) / k1;
    }
    case Kind.RoundCone: {
      // the cross-section squashed: measured in a stretched space, scaled back by the smaller stretch
      const sx = p.e, sz = p.f;
      const qx = lx / sx, qz = lz / sz;
      const s = Math.min(sx, sz);
      const r1 = p.a, r2 = p.b, h = p.c;
      const bb = (r1 - r2) / h;
      const aa = Math.sqrt(Math.max(0, 1 - bb * bb));
      const q0 = Math.sqrt(qx * qx + qz * qz), q1 = ly;
      const k = -bb * q0 + aa * q1;
      let d: number;
      if (k < 0) d = Math.sqrt(q0 * q0 + q1 * q1) - r1;
      else if (k > aa * h) d = Math.sqrt(q0 * q0 + (q1 - h) * (q1 - h)) - r2;
      else d = q0 * aa + q1 * bb - r1;
      return d * s;
    }
    case Kind.RoundBox: {
      const qx = Math.abs(lx) - p.a + p.d, qy = Math.abs(ly) - p.b + p.d, qz = Math.abs(lz) - p.c + p.d;
      const mx = Math.max(qx, 0), my = Math.max(qy, 0), mz = Math.max(qz, 0);
      return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - p.d;
    }
    case Kind.Torus: {
      const q = Math.sqrt(lx * lx + lz * lz) - p.a;
      return Math.sqrt(q * q + ly * ly) - p.b;
    }
    case Kind.Plane:
      return ly;
    case Kind.Loft:
      return loftDist(p.loft!, p.a, p.c, lx, ly, lz);
  }
  return 1e9;
}

/** Where along a round cone's axis a point lies (its local y), for handing over between two bones. */
export function primAxial(p: Prim, x: number, y: number, z: number): number {
  const F = p.frame, R = F.R;
  return R[3] * (x - F.o[0]) + R[4] * (y - F.o[1]) + R[5] * (z - F.o[2]);
}

// --- joining ----------------------------------------------------------------------------------------------------

/** Quilez's polynomial smooth minimum: a and b joined with a fillet about k wide. */
export function smin(a: number, b: number, k: number): number {
  if (k <= 0) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** a with b carved out of it, the edge rounded by k. */
export function scarve(a: number, b: number, k: number): number {
  return -smin(-a, b, k);
}

export const prim = (p: Prim): Node => ({ op: 'prim', prim: p });
export const smooth = (k: number, ...kids: Node[]): Node => ({ op: 'smooth', k, kids });
export const hardMin = (...kids: Node[]): Node => ({ op: 'min', kids });
export const carve = (k: number, base: Node, tool: Node): Node => ({ op: 'carve', k, base, tool });
export const add = (k: number, base: Node, tool: Node): Node => ({ op: 'add', k, base, tool });
export const addNear = (kNear: number, kFar: number, at: number[], radius: number, base: Node, tool: Node): Node =>
  ({ op: 'addNear', kNear, kFar, at: [at[0], at[1], at[2]], radius, base, tool });
let sharedIds = 0;
export const shared = (node: Node): Node => ({ op: 'shared', node, id: sharedIds++ });

/** Every solid in a tree, in order. */
export function primsOf(n: Node, out: Prim[] = []): Prim[] {
  switch (n.op) {
    case 'prim': out.push(n.prim); break;
    case 'smooth': case 'min': for (const k of n.kids) primsOf(k, out); break;
    case 'carve': case 'add': case 'addNear': primsOf(n.base, out); primsOf(n.tool, out); break;
    case 'shared': primsOf(n.node, out); break;
  }
  return out;
}

export type Field = (x: number, y: number, z: number) => number;

interface Bound { c: [number, number, number]; r: number }

function boundOf(n: Node): Bound {
  const ps = n.op === 'carve' ? primsOf(n.base) : primsOf(n);
  if (ps.length === 0) return { c: [0, 0, 0], r: 1e9 };
  // a sphere round all the solids' spheres (centroid, then the farthest reach)
  let cx = 0, cy = 0, cz = 0;
  for (const p of ps) { cx += p.bc[0]; cy += p.bc[1]; cz += p.bc[2]; }
  cx /= ps.length; cy /= ps.length; cz /= ps.length;
  let r = 0;
  for (const p of ps) r = Math.max(r, Math.hypot(p.bc[0] - cx, p.bc[1] - cy, p.bc[2] - cz) + p.br);
  return { c: [cx, cy, cz], r };
}

/**
 * Compiles a tree to one function. `band` is how far from the surface the values must be true: a branch whose
 * bounding sphere is farther than that answers with the distance to its sphere (a lower bound), which changes
 * nothing a smooth union with a fillet narrower than the band could reach.
 */
export function compile(n: Node, band = 0.03): Field {
  const cache = new Map<number, Field>();
  return compileInner(n, band, cache);
}

function compileInner(n: Node, band: number, cache: Map<number, Field>): Field {
  if (n.op === 'shared') {
    const hit = cache.get(n.id);
    if (hit) return hit;
    const f = compileInner(n.node, band, cache);
    let lx = NaN, ly = NaN, lz = NaN, lv = 0;
    const memo: Field = (x, y, z) => {
      if (x === lx && y === ly && z === lz) return lv;
      lx = x; ly = y; lz = z;
      lv = f(x, y, z);
      return lv;
    };
    cache.set(n.id, memo);
    return memo;
  }
  const b = boundOf(n);
  const [cx, cy, cz] = b.c;
  const reach = b.r + band;
  const reach2 = reach * reach;
  const guard = (f: Field): Field => (x, y, z) => {
    const dx = x - cx, dy = y - cy, dz = z - cz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > reach2) return Math.sqrt(d2) - b.r;
    return f(x, y, z);
  };
  switch (n.op) {
    case 'prim': {
      const p = n.prim;
      return (x, y, z) => primDist(p, x, y, z);
    }
    case 'smooth': {
      const kids = n.kids.map((k) => compileInner(k, band, cache));
      const k = n.k;
      const m = kids.length;
      return guard((x, y, z) => {
        let d = kids[0](x, y, z);
        for (let i = 1; i < m; i++) d = smin(d, kids[i](x, y, z), k);
        return d;
      });
    }
    case 'min': {
      const kids = n.kids.map((k) => compileInner(k, band, cache));
      const m = kids.length;
      return guard((x, y, z) => {
        let d = kids[0](x, y, z);
        for (let i = 1; i < m; i++) {
          const e = kids[i](x, y, z);
          if (e < d) d = e;
        }
        return d;
      });
    }
    case 'carve': {
      const base = compileInner(n.base, band, cache), tool = compileInner(n.tool, band, cache);
      const k = n.k;
      return guard((x, y, z) => scarve(base(x, y, z), tool(x, y, z), k));
    }
    case 'add': {
      const base = compileInner(n.base, band, cache), tool = compileInner(n.tool, band, cache);
      const k = n.k;
      return guard((x, y, z) => smin(base(x, y, z), tool(x, y, z), k));
    }
    case 'addNear': {
      const base = compileInner(n.base, band, cache), tool = compileInner(n.tool, band, cache);
      const { kNear, kFar, radius } = n;
      const [ax, ay, az] = n.at;
      return guard((x, y, z) => {
        const r = Math.sqrt((x - ax) ** 2 + (y - ay) ** 2 + (z - az) ** 2) / radius;
        const t = r >= 1 ? 1 : r * r * (3 - 2 * r);
        return smin(base(x, y, z), tool(x, y, z), kNear + (kFar - kNear) * t);
      });
    }
  }
}

/** The field's gradient (not normalised), by central differences of step e. */
export function gradient(f: Field, x: number, y: number, z: number, e: number, out: number[]): number[] {
  out[0] = f(x + e, y, z) - f(x - e, y, z);
  out[1] = f(x, y + e, z) - f(x, y - e, z);
  out[2] = f(x, y, z + e) - f(x, y, z - e);
  const l = Math.hypot(out[0], out[1], out[2]) || 1;
  out[0] /= l; out[1] /= l; out[2] /= l;
  return out;
}

/** Moves a point onto the surface (a few Newton steps along the gradient). */
export function project(f: Field, p: number[], e: number, steps = 3): void {
  const g = [0, 0, 0];
  for (let i = 0; i < steps; i++) {
    const d = f(p[0], p[1], p[2]);
    if (Math.abs(d) < 1e-6) return;
    gradient(f, p[0], p[1], p[2], e, g);
    p[0] -= g[0] * d; p[1] -= g[1] * d; p[2] -= g[2] * d;
  }
}
