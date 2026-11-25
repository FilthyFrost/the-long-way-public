// Her hair as one solid (docs/V3/plan/character-pv.md §3, the head round of 2026-11-24), the way the turnaround draws
// it (refs/character/turnaround.png): a short, full, tousled cut — a round mass over her head, widest a little above
// her eyes where the tips at the sides flick out, narrowing to her jaw; a long fringe to her eyes, one big lock over
// her right eye; locks before her ears to her jaw; jagged ends over the nape; two thin strands up from the crown.
//
// A cap (her skull's shape blown up and cut along the hairline) and locks: each lock a chain of flattened round cones
// along a path that lies on the cap from its root and then hangs, flaring and flicking out at its tip. The locks join
// the cap smoothly and each other plainly (a crease between them), so each keeps its own edge; each point of the
// surface knows its lock (the ink draws a line where one lies over another), how far down it is (its shade, its sway).
//
// In the Head bone's frame of the bind pose (x her left, y up the head, z out of the face), metres; HAIR holds the
// numbers. Pure TypeScript (no three.js).

import { type Field, type Node, type Prim, compile, ellipsoid, frameAxes, hardMin, prim, primDist, roundCone, smooth } from './sdf';
import type { HeadSculpt } from './head';
import { polygonize, fieldNormals } from './polygonize';
import { decimate } from './decimate';
import type { V3 } from './qmath';

export const HAIR = {
  /**
   * The mass's outline as the turnaround draws it: at each height (head frame) how far out it reaches at her sides
   * (front view), before her and behind her (side view), from the line up through the middle of her head (z = mid);
   * between those, round as a squared ellipse (exponent sq).
   */
  mid: -0.02,
  side: [[0.278, 0.0], [0.27, 0.035], [0.25, 0.076], [0.225, 0.106], [0.2, 0.123], [0.175, 0.133], [0.15, 0.139], [0.125, 0.141], [0.1, 0.138], [0.075, 0.131], [0.05, 0.119], [0.025, 0.103], [0.0, 0.09], [-0.03, 0.08]] as [number, number][],
  front: [[0.278, 0.0], [0.27, 0.035], [0.25, 0.078], [0.225, 0.103], [0.2, 0.116], [0.175, 0.123], [0.15, 0.127], [0.125, 0.128], [0.1, 0.127], [0.075, 0.124], [0.05, 0.12], [0.0, 0.115]] as [number, number][],
  back: [[0.278, 0.0], [0.27, 0.04], [0.25, 0.084], [0.225, 0.114], [0.2, 0.131], [0.175, 0.14], [0.15, 0.146], [0.125, 0.147], [0.1, 0.144], [0.075, 0.136], [0.05, 0.124], [0.025, 0.108], [0.0, 0.094], [-0.03, 0.082]] as [number, number][],
  sq: 2.4,
  /** the mass's thickness (its outer surface to its inner) */
  thick: 0.022,
  /** its lower edge's teeth: how deep, how many round her head, how far the tips flick out */
  teeth: { depth: 0.036, count: 17, flick: 0.014 },
  /** the cap: her head blown up (middle y, z; half-sizes) */
  cap: { y: 0.128, z: -0.02, rx: 0.116, ry: 0.128, rz: 0.114 },
  /** where the cap ends round her head: [azimuth (deg: 0 her front, 90 her left side, 180 her back), height] */
  hem: [[0, 0.112], [30, 0.108], [48, 0.096], [62, 0.05], [76, 0.06], [90, 0.088], [102, 0.07], [116, 0.03], [140, 0.0], [160, -0.014], [180, -0.024]] as [number, number][],
  /** how close a lock may come to her skull and face */
  clear: 0.006,
  /** the smooth join of the locks into the cap */
  join: 0.009,
  seed: 11,
};

export interface LockSpec {
  /** where its root is round her head (deg: 0 front, + her left), and how high */
  phi: number;
  y0: number;
  /** how far it falls (m), its half-width at the root (m), its thickness to its width */
  drop: number;
  w: number;
  flat: number;
  /** how far round it turns as it falls (deg) */
  sweep: number;
  /** below the cap's widest: out (+) or in (−) for each metre it falls */
  flare: number;
  /** its tip out (m) and up (m) */
  flick: number;
  lift: number;
  /** how far inside the cap's surface it lies at the root (m) */
  inset: number;
  /** 2 a lock of the mass, 3 the fringe, 4 a strand on its own (the ahoge) */
  layer: number;
  /** an explicit path (head frame), instead of the one made from the numbers above */
  path?: V3[];
  /** it lies on the mass (an outer layer: its own shape shows), not under it */
  outer?: boolean;
}

/** mulberry32: the same tousle every build */
function rng(seed: number): () => number {
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
 * The locks, in layers as a cut is: the crown's clumps radiating from the whorl and lying on the cap; a layer all
 * round hanging past the cap's edge (the sides' tips flicking out, the back's ends jagged over the nape); the fringe
 * over the forehead to the eyes, the longest over her right eye; long locks before the ears to the jaw; the ahoge.
 * Each lock wide at its root (a clump of hair, not a strand) and pointed at its tip.
 */
export function hairLocks(): LockSpec[] {
  const r = rng(HAIR.seed);
  const j = (a: number) => (r() * 2 - 1) * a;
  const L: LockSpec[] = [];
  const base = { flat: 0.38, sweep: 0, flare: -0.2, flick: 0, lift: 0, inset: 0.0, layer: 2 };
  // the fringe: over the forehead to the eyes; the longest over her right eye (−phi), a thin one between the eyes
  const fringe: [number, number, number][] = [[-56, 0.13, 0.024], [-44, 0.15, 0.027], [-6, 0.165, 0.026], [7, 0.158, 0.027], [20, 0.155, 0.027], [33, 0.145, 0.026], [46, 0.135, 0.025], [58, 0.122, 0.022]];
  for (const [phi, drop, w] of fringe) {
    L.push({ ...base, phi: phi + j(2), y0: 0.258 + j(0.006), drop: drop + j(0.01), w: w + j(0.002), flat: 0.3, sweep: -phi * 0.12 + j(4), flare: -0.06, flick: 0.004 + j(0.003), inset: 0.003, layer: 3 });
  }
  // the big lock over her right eye, sweeping toward her right, and one beside it
  L.push({ ...base, phi: -12, y0: 0.262, drop: 0.215, w: 0.034, flat: 0.28, sweep: -16, flare: -0.05, flick: 0.006, inset: 0.003, layer: 3 });
  L.push({ ...base, phi: -27, y0: 0.258, drop: 0.2, w: 0.03, flat: 0.3, sweep: -10, flare: -0.05, flick: 0.006, inset: 0.003, layer: 3 });
  L.push({ ...base, phi: -4, y0: 0.225, drop: 0.195, w: 0.0075, flat: 0.45, sweep: 4, flare: -0.05, flick: 0.002, inset: 0.006, layer: 3 });
  // before and behind each ear: long to the jaw, the tips out; over the ear the hair is short (the ear shows)
  for (const s of [1, -1]) {
    for (const [phi, drop, w, flick] of [[58, 0.2, 0.022, -0.012], [70, 0.21, 0.023, 0.004], [106, 0.165, 0.022, 0.016], [120, 0.17, 0.024, 0.018]] as [number, number, number, number][]) {
      L.push({ ...base, phi: s * (phi + j(3)), y0: 0.19 + j(0.008), drop: drop + j(0.012), w: w + j(0.0015), sweep: s * (flick < 0 ? -6 : j(5)), flare: -0.16, flick: flick + j(0.004), lift: 0.003, inset: 0.006 });
    }
    // tufts flicking out a little above the eyes, the widest of her outline: spiky, out and a little up
    for (const [phi, y0, drop] of [[66, 0.19, 0.095], [80, 0.188, 0.09], [93, 0.186, 0.085], [106, 0.19, 0.095], [119, 0.185, 0.1], [134, 0.178, 0.105]] as [number, number, number][]) {
      L.push({ ...base, phi: s * (phi + j(4)), y0: y0 + 0.03 + j(0.008), drop: drop + 0.03 + j(0.012), w: 0.024 + j(0.003), flat: 0.34, sweep: s * j(6), flare: 0.3, flick: 0.03 + j(0.01), lift: 0.02 + j(0.008), inset: -0.009, outer: true });
    }
  }
  // the ahoge: two thin strands up from the crown and over forward
  L.push({ ...base, phi: 0, y0: 0, drop: 0, w: 0.0026, flat: 0.8, layer: 4, inset: 0, path: [[0.004, 0.262, -0.03], [0.006, 0.29, -0.022], [0.011, 0.305, -0.004], [0.015, 0.301, 0.016], [0.017, 0.288, 0.026]] });
  L.push({ ...base, phi: 0, y0: 0, drop: 0, w: 0.0022, flat: 0.8, layer: 4, inset: 0, path: [[-0.004, 0.262, -0.034], [-0.006, 0.283, -0.03], [-0.013, 0.297, -0.016], [-0.023, 0.299, 0.0], [-0.03, 0.29, 0.006]] });
  return L;
}

/** A table [height, value] read at a height (smoothly between its rows, held past its ends). */
function rowAt(t: [number, number][], y: number): number {
  if (y >= t[0][0]) return t[0][1];
  for (let i = 0; i < t.length - 1; i++) {
    if (y >= t[i + 1][0]) {
      const u = (t[i][0] - y) / (t[i][0] - t[i + 1][0]);
      return t[i][1] + (t[i + 1][1] - t[i][1]) * u;
    }
  }
  return t[t.length - 1][1];
}

/** The mass's outline at a height and azimuth (rad): how far out from the middle line. */
export function shellR(phi: number, y: number): number {
  const sx = rowAt(HAIR.side, y), sz = Math.cos(phi) >= 0 ? rowAt(HAIR.front, y) : rowAt(HAIR.back, y);
  if (sx <= 0 || sz <= 0) return 0;
  const n = HAIR.sq;
  return Math.pow(Math.pow(Math.abs(Math.sin(phi)) / sx, n) + Math.pow(Math.abs(Math.cos(phi)) / sz, n), -1 / n);
}

/** The teeth along the lower edge: how far below the hem the edge is at azimuth phi (rad): deepest at a tip, 0 at a notch. */
function toothAt(phi: number): number {
  const t = HAIR.teeth;
  const u = ((phi / (2 * Math.PI)) * t.count + 0.37) ;
  const k = Math.floor(u);
  const f = u - k;
  // each tooth its own depth and lean
  const rk = Math.sin(k * 12.9898) * 43758.5453;
  const rnd = rk - Math.floor(rk);
  const lean = 0.35 + 0.3 * rnd;
  const tri = f < lean ? f / lean : (1 - f) / (1 - lean);
  const long = rnd > 0.78 ? 1.7 : 1;
  return t.depth * (0.5 + 0.9 * rnd) * long * tri;
}

/**
 * The mass (head frame): a shell of HAIR.thick under the outline, its lower edge the hem less the teeth, the tips
 * flicked out. Signed distance (near enough) in the head's frame.
 */
export function shellField(): (x: number, y: number, z: number) => number {
  // the outline in the head's polar terms about its middle: a table of the radius at each (polar angle, azimuth)
  const C = { y: 0.12, z: HAIR.mid };
  const NT = 96, NP = 128;
  const tab = new Float32Array((NT + 1) * NP);
  for (let it = 0; it <= NT; it++) {
    const th = (it / NT) * Math.PI;
    for (let ip = 0; ip < NP; ip++) {
      const phi = (ip / NP) * 2 * Math.PI - Math.PI;
      let lo = 0, hi = 0.32;
      const f = (rr: number) => rr * Math.sin(th) - shellR(phi, C.y + rr * Math.cos(th));
      if (f(hi) < 0) { tab[it * NP + ip] = hi; continue; }
      for (let k = 0; k < 30; k++) {
        const m = (lo + hi) / 2;
        if (f(m) < 0) lo = m;
        else hi = m;
      }
      tab[it * NP + ip] = (lo + hi) / 2;
    }
  }
  const radiusAt = (th: number, phi: number) => {
    const ft = (th / Math.PI) * NT, fp = ((phi + Math.PI) / (2 * Math.PI)) * NP;
    const t0 = Math.min(NT - 1, Math.max(0, Math.floor(ft))), dt = Math.min(1, Math.max(0, ft - t0));
    const p0 = ((Math.floor(fp) % NP) + NP) % NP, p1 = (p0 + 1) % NP, dp = fp - Math.floor(fp);
    const a = tab[t0 * NP + p0] * (1 - dp) + tab[t0 * NP + p1] * dp;
    const b = tab[(t0 + 1) * NP + p0] * (1 - dp) + tab[(t0 + 1) * NP + p1] * dp;
    return a * (1 - dt) + b * dt;
  };
  const T = HAIR.thick, fl = HAIR.teeth.flick;
  return (x, y, z) => {
    const vx = x, vy = y - C.y, vz = z - C.z;
    const r = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1e-6;
    const th = Math.acos(Math.max(-1, Math.min(1, vy / r)));
    const phi = Math.atan2(vx, vz);
    const edge = hemAt(phi) - toothAt(phi);
    // the tips flick out near the edge (at her sides and back, not over her face)
    const near = Math.max(0, 1 - (y - edge) / 0.04);
    const sideness = Math.min(1, Math.abs(Math.sin(phi)) * 1.4 + Math.max(0, -Math.cos(phi)) * 0.9);
    let rs = radiusAt(th, phi) + fl * near * near * sideness;
    const d = (r - rs) * 0.85;
    const shell = Math.max(d, -(d + T));
    return Math.max(shell, (edge - y) * 0.9);
  };
}

/** The cap's surface: how far out from its middle line it is at azimuth phi (rad) and height y (0 below its bottom). */
function capR(phi: number, y: number): number {
  const c = HAIR.cap;
  const e = 1 - ((y - c.y) / c.ry) ** 2;
  if (e <= 0) return 0;
  return Math.sqrt(e) / Math.sqrt((Math.sin(phi) / c.rx) ** 2 + (Math.cos(phi) / c.rz) ** 2);
}

/** The cap's lower edge at azimuth phi (rad). */
function hemAt(phi: number): number {
  let a = Math.abs((phi * 180) / Math.PI) % 360;
  if (a > 180) a = 360 - a;
  const h = HAIR.hem;
  for (let i = 0; i < h.length - 1; i++) {
    if (a <= h[i + 1][0]) {
      const t = (a - h[i][0]) / (h[i + 1][0] - h[i][0]);
      const s = t * t * (3 - 2 * t);
      return h[i][1] + (h[i + 1][1] - h[i][1]) * s;
    }
  }
  return h[h.length - 1][1];
}

/** A lock's path in the head's frame, from its root to its tip (n + 1 points). */
export function lockPath(l: LockSpec, skull: Field | null, toWorld: (p: V3) => V3, fromWorld: (p: V3) => V3, n = 10): V3[] {
  if (l.path) return l.path.map((p) => [p[0], p[1], p[2]] as V3);
  const c = HAIR.cap;
  const pts: V3[] = [];
  const phi0 = (l.phi * Math.PI) / 180;
  // where it leaves the cap: the cap's widest at this azimuth (its middle height) or its root, whichever is lower
  const yEq = Math.min(0.125, l.y0);
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const phi = phi0 + ((l.sweep * Math.PI) / 180) * s;
    let y = l.y0 - l.drop * s;
    let rad: number;
    const deep = l.inset + 0.014 * (1 - Math.min(1, s / 0.45));
    if (y >= yEq) rad = shellR(phi, y) - deep - l.w * l.flat * 0.5;
    else rad = shellR(phi, yEq) - deep - l.w * l.flat * 0.5 + l.flare * (yEq - y);
    // above the mass's edge a lock stays inside it (it shows only where it hangs past)
    const edgeY = hemAt(phi);
    if (y > edgeY + 0.012 && !l.outer) rad = Math.min(rad, shellR(phi, y) - l.w * l.flat * 0.5 - 0.008);
    // the tip flicks out and up
    const k = Math.max(0, (s - 0.7) / 0.3);
    const f = k * k;
    rad += l.flick * f;
    y += l.lift * f;
    let p: V3 = [Math.sin(phi) * rad, y, c.z + Math.cos(phi) * rad];
    // never into her skull or face: pushed out from the cap's middle line until clear
    if (skull) {
      for (let it = 0; it < 6; it++) {
        const w = toWorld(p);
        const d = skull(w[0], w[1], w[2]);
        if (d >= HAIR.clear + l.w * l.flat * (1 - s)) break;
        rad += HAIR.clear + l.w * l.flat * (1 - s) - d + 0.001;
        p = [Math.sin(phi) * rad, y, c.z + Math.cos(phi) * rad];
      }
    }
    pts.push(p);
  }
  void fromWorld;
  return pts;
}

export interface HairSculpt {
  field: Field;
  /** the mass alone (world) */
  mass: Field;
  /** each lock's solids (for which lock a point of the surface is on), the cap's */
  lockPrims: Prim[][];
  capPrim: Prim;
  specs: LockSpec[];
}

/** The hair's field (world, bind pose) on a sculpted head. */
export function sculptHair(hs: HeadSculpt, bone: number): HairSculpt {
  const { H } = hs;
  const toWorld = (p: V3): V3 => H(p[0], p[1], p[2]);
  const skull = compile(hs.neckHead, 0.05);
  const specs = hairLocks();
  const c = HAIR.cap;
  const capPrim = ellipsoid(frameAxes(H(0, c.y, c.z), hs.y, hs.z), c.rx, c.ry, c.rz, { bone, name: 'hair_cap' });
  const lockPrims: Prim[][] = [];
  for (const l of specs) {
    const path = lockPath(l, skull, toWorld, (p) => p);
    const prims: Prim[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const s0 = i / (path.length - 1), s1 = (i + 1) / (path.length - 1);
      const r0 = Math.max(0.0007, l.w * (1 - Math.pow(s0, 1.6))), r1 = Math.max(0.0005, l.w * (1 - Math.pow(s1, 1.6)));
      const a = toWorld(path[i]), b = toWorld(path[i + 1]);
      // flat on the mass: its front (local z) out from the hair's middle (the mass's surface faces that way, up on
      // the crown as well as round the sides)
      const mid: V3 = [(path[i][0] + path[i + 1][0]) / 2, (path[i][1] + path[i + 1][1]) / 2 - 0.12, (path[i][2] + path[i + 1][2]) / 2 - c.z];
      const ml = Math.hypot(mid[0], mid[1], mid[2]) || 1;
      const out: V3 = [
        hs.x[0] * (mid[0] / ml) + hs.y[0] * (mid[1] / ml) + hs.z[0] * (mid[2] / ml),
        hs.x[1] * (mid[0] / ml) + hs.y[1] * (mid[1] / ml) + hs.z[1] * (mid[2] / ml),
        hs.x[2] * (mid[0] / ml) + hs.y[2] * (mid[1] / ml) + hs.z[2] * (mid[2] / ml),
      ];
      prims.push(roundCone(a, b, r0, r1, { bone, name: `lock_${lockPrims.length}_${i}` }, 1, l.flat, out));
    }
    lockPrims.push(prims);
  }
  // the mass
  const shell = shellField();
  void prim;
  // (each lock in short runs of three, so a point far from a run does not weigh its solids; the band no wider than the join)
  const runs: Node[] = [];
  for (const ps of lockPrims) for (let i = 0; i < ps.length; i += 3) runs.push(hardMin(...ps.slice(i, i + 3).map((p) => prim(p))));
  const locksField = compile(hardMin(...runs), HAIR.join * 1.5);
  const { o, x, y, z } = hs;
  const k = HAIR.join;
  const field: Field = (px, py, pz) => {
    const wx = px - o[0], wy = py - o[1], wz = pz - o[2];
    const lx = wx * x[0] + wy * x[1] + wz * x[2];
    const ly = wx * y[0] + wy * y[1] + wz * y[2];
    const lz = wx * z[0] + wy * z[1] + wz * z[2];
    const cap = shell(lx, ly, lz);
    const locks = locksField(px, py, pz);
    // the locks into the cap smoothly
    const h = Math.max(k - Math.abs(cap - locks), 0) / k;
    return Math.min(cap, locks) - h * h * k * 0.25;
  };
  void smooth;
  const mass: Field = (px, py, pz) => {
    const wx = px - o[0], wy = py - o[1], wz = pz - o[2];
    return shell(wx * x[0] + wy * x[1] + wz * x[2], wx * y[0] + wy * y[1] + wz * y[2], wx * z[0] + wy * z[1] + wz * z[2]);
  };
  return { field, mass, lockPrims, capPrim, specs };
}

export interface HairMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  /** per point: x how far down its lock (0 root, 1 tip), y which lock (0..1), z its layer, w across (0.5) */
  hair: Float32Array;
}

/** Which lock each point is on (or the mass), how far down it, its layer, its angle round the head (hair attribute). */
function lockOf(hs: HeadSculpt, hair: HairSculpt, positions: ArrayLike<number>): { attr: Float32Array; owner: Int32Array } {
  const n = positions.length / 3;
  const attr = new Float32Array(n * 4);
  const owners = new Int32Array(n);
  // ink groups (the shader takes floor(id * 3)): the fringe one group (no lines between its locks), the big lock over
  // her eye another, the rest by turns; the mass the third
  const ids = hair.specs.map((s, i) => (s.layer === 3 ? (s.w > 0.033 ? 0.5 : 0.15) : ((i * 7) % 3) / 3 + 0.12 + ((i * 0.618) % 1) * 0.2));
  const O = hs.o;
  for (let v = 0; v < n; v++) {
    const px = positions[v * 3], py = positions[v * 3 + 1], pz = positions[v * 3 + 2];
    let best = hair.mass(px, py, pz) - 0.0025, owner = -1, seg = 0, segs = 1;
    for (let l = 0; l < hair.lockPrims.length; l++) {
      const ps = hair.lockPrims[l];
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        const dx = px - p.bc[0], dy = py - p.bc[1], dz = pz - p.bc[2];
        if (dx * dx + dy * dy + dz * dz > (p.br + Math.max(best, 0) + 0.004) ** 2) continue;
        const d = primDist(p, px, py, pz);
        if (d < best) { best = d; owner = l; seg = i; segs = ps.length; }
      }
    }
    const wx = px - O[0], wy = py - O[1], wz = pz - O[2];
    const lx = wx * hs.x[0] + wy * hs.x[1] + wz * hs.x[2], lz = wx * hs.z[0] + wy * hs.z[1] + wz * hs.z[2];
    const round = Math.atan2(lx, lz - HAIR.mid) / (2 * Math.PI) + 0.5;
    owners[v] = owner;
    if (owner < 0) attr.set([0, 0.95, 2, round], v * 4);
    else attr.set([(seg + 0.5) / segs, ids[owner], hair.specs[owner].layer, round], v * 4);
  }
  return { attr, owner: owners };
}

/** The hair's surface, each point told its lock; simplified to o.target triangles keeping the edges between locks. */
export function growHairSolid(hs: HeadSculpt, bone: number, o: { h?: number; target?: number } = {}): HairMesh {
  const hair = sculptHair(hs, bone);
  const h = o.h ?? 0.0011;
  const O = hs.o;
  const raw = polygonize(hair.field, { h, min: [O[0] - 0.19, O[1] - 0.09, O[2] - 0.2], max: [O[0] + 0.19, O[1] + 0.34, O[2] + 0.2], project: 3 });
  const own = lockOf(hs, hair, raw.positions);
  let positions: Float32Array, indices: Uint32Array, attr: Float32Array;
  if (o.target && raw.indices.length / 3 > o.target) {
    // a point where one lock meets another (or the mass) costs more to take away: the lines between them stay clean
    const weight = new Float32Array(raw.positions.length / 3).fill(1);
    const I = raw.indices;
    for (let t = 0; t < I.length; t += 3) {
      const a = own.owner[I[t]], b = own.owner[I[t + 1]], c = own.owner[I[t + 2]];
      if (a !== b || b !== c) weight[I[t]] = weight[I[t + 1]] = weight[I[t + 2]] = 14;
    }
    const dec = decimate(raw.positions, raw.indices, { target: o.target, maxEdge: 0.012, weight });
    positions = new Float32Array(dec.positions);
    indices = dec.indices;
    attr = new Float32Array((positions.length / 3) * 4);
    for (let v = 0; v < positions.length / 3; v++) attr.set(own.attr.subarray(dec.source[v] * 4, dec.source[v] * 4 + 4), v * 4);
  } else {
    positions = new Float32Array(raw.positions);
    indices = raw.indices;
    attr = own.attr;
  }
  const normals = fieldNormals(hair.field, positions, h * 0.7);
  return { positions, normals, indices, hair: attr };
}
