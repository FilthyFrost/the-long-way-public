// Her hair (docs/V3/plan/character-pv.md §3, §4): short, white, messy, layered — the turnaround's cut, grown lock by
// lock as anime hair is drawn: each lock a tapering blade with a little body (a lens in section), its root on the
// scalp, flowing from the crown's whorl over the head and falling under its own weight, its tip a point that flicks.
// Under them a cap on the skull so no scalp shows between them. Everything follows the Head bone; how a lock swings
// is done in the vertex shader from numbers each vertex carries (how far along the lock, which lock), so the hair
// needs no bones of its own.
//
// Shading reads the hair as one volume: a lock's normal is mostly the normal of an egg round the whole head of hair,
// so the light falls across it in big clean shapes and not lock by lock.

import { mulberry } from './rand';
import type { Skeleton } from './skeleton';
import { type V3, add3, cross, dot, norm, scale3, sub3 } from './qmath';

export interface HairData {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  /** x how far along its lock (0 root … 1 tip), y the lock's own number (0..1), z the layer (0 cap, 1 under, 2 main, 3 fringe, 4 tuft), w across the lock (−1 … 1) */
  hair: Float32Array;
}

interface Lock {
  /** root on the scalp: azimuth (0 front, + to her left), polar angle from the crown (radians) */
  az: number;
  pol: number;
  length: number;
  width: number;
  /** how far off the scalp it stands (volume), at the root and growing toward the tip */
  lift: number;
  /** which way it is combed at the root (a direction in the head frame; it falls from there) */
  comb: V3;
  /** how strongly its own weight pulls it down as it goes (0..1) */
  fall: number;
  /** the tip's flick: outward (+) or in toward the face/neck (−) */
  flick: number;
  /** a sideways sweep of the tip (+ to her left) */
  sweep: number;
  layer: number;
  thickness: number;
}

const DEG = Math.PI / 180;

export function growHair(sk: Skeleton, seed = 7): HairData {
  const rnd = mulberry(seed);
  const head = sk.bindPos[sk.index.Head];
  // the skull as the scalp: the sculpt's cranium (body.ts) a little enlarged
  const c: V3 = [head[0], head[1] + 0.113, head[2] - 0.006];
  const R: V3 = [0.0745 + 0.004, 0.096 + 0.004, 0.09 + 0.004];
  // the volume the hair fills, for its normals
  const vc: V3 = [head[0], head[1] + 0.09, head[2] - 0.012];
  const vr: V3 = [0.108, 0.13, 0.118];
  const scalp = (az: number, pol: number, lift = 0): { p: V3; n: V3 } => {
    const d: V3 = [Math.sin(pol) * Math.sin(az), Math.cos(pol), Math.sin(pol) * Math.cos(az)];
    const p: V3 = [c[0] + R[0] * d[0], c[1] + R[1] * d[1], c[2] + R[2] * d[2]];
    const n = norm([(p[0] - c[0]) / (R[0] * R[0]), (p[1] - c[1]) / (R[1] * R[1]), (p[2] - c[2]) / (R[2] * R[2])]);
    return { p: add3(p, scale3(n, lift)), n };
  };
  /** how far a point is outside the scalp, along the scalp's normal (negative inside), and the normal */
  const above = (p: V3): { d: number; n: V3 } => {
    const q: V3 = [(p[0] - c[0]) / R[0], (p[1] - c[1]) / R[1], (p[2] - c[2]) / R[2]];
    const k = Math.hypot(q[0], q[1], q[2]);
    const n = norm([(p[0] - c[0]) / (R[0] * R[0]), (p[1] - c[1]) / (R[1] * R[1]), (p[2] - c[2]) / (R[2] * R[2])]);
    return { d: (k - 1) * Math.min(R[0], R[1], R[2]), n };
  };
  // the face and neck below the skull, for the locks that fall past them (an ellipsoid each)
  const face: [V3, V3][] = [
    [[head[0], head[1] + 0.045, head[2] + 0.028], [0.066, 0.07, 0.066]],
    [[head[0], head[1] - 0.02, head[2] - 0.01], [0.034, 0.08, 0.036]],
  ];

  const locks: Lock[] = [];
  const whorl = { az: 180 * DEG, pol: 28 * DEG };
  /** the direction to comb a root: away from the whorl over the head, falling */
  const combAt = (az: number, pol: number): V3 => {
    const w = scalp(whorl.az, whorl.pol).p;
    const { p, n } = scalp(az, pol);
    let d = sub3(p, w);
    d = sub3(d, scale3(n, dot(d, n)));
    return norm(add3(norm(d), [0, -0.25, 0]));
  };
  const add = (l: Partial<Lock> & { az: number; pol: number }) => {
    locks.push({
      length: 0.1, width: 0.03, lift: 0.006, comb: combAt(l.az, l.pol), fall: 0.5, flick: 0.2, sweep: 0, layer: 2, thickness: 0.0045,
      ...l,
    });
  };
  const jit = (a: number) => (rnd() * 2 - 1) * a;

  // under layer: short and close at the back and sides, darker, filling between the outer locks
  for (let i = 0; i < 12; i++) {
    const az = (60 + (i / 11) * 240) * DEG + jit(4 * DEG);
    add({ az, pol: (78 + jit(6)) * DEG, length: 0.085 + jit(0.012), width: 0.05, lift: 0.012, fall: 0.85, flick: 0.1, layer: 1, thickness: 0.004 });
  }
  // the crown: locks radiating from the whorl over the top
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * 360 * DEG + jit(6 * DEG);
    // a root a little out from the whorl, in that direction over the scalp
    const az = whorl.az + Math.sin(a) * 0.9;
    const pol = Math.max(4 * DEG, whorl.pol + Math.cos(a) * 0.22 + 0.05);
    add({ az, pol, length: 0.105 + jit(0.015), width: 0.05 + jit(0.005), lift: 0.022, fall: 0.5, flick: 0.3, layer: 2, thickness: 0.007 });
  }
  // the main ring round the head
  for (let i = 0; i < 26; i++) {
    const az = (i / 26) * 360 * DEG + jit(5 * DEG);
    const front = Math.cos(az);
    if (front > 0.55) continue; // the fringe has the front
    const pol = (54 + jit(6)) * DEG;
    const back = -front;
    add({
      az, pol,
      length: 0.11 + 0.035 * Math.max(0, back) + jit(0.015),
      width: 0.05 + jit(0.005), lift: 0.03 + jit(0.005), fall: 0.7, flick: 0.4 + jit(0.25),
      layer: 2, thickness: 0.0052,
    });
  }
  // the sides: over the ears to the jaw, the tips in toward the cheeks
  for (const side of [1, -1]) {
    for (let i = 0; i < 5; i++) {
      const az = side * (62 + i * 11 + jit(3)) * DEG;
      add({
        az, pol: (72 + jit(4)) * DEG, length: 0.13 - i * 0.006 + jit(0.01), width: 0.044, lift: 0.026, fall: 0.85,
        flick: i < 2 ? -0.45 : 0.2, sweep: -side * 0.02 * (i < 2 ? 1 : 0), layer: 2, thickness: 0.0048,
      });
    }
  }
  // the nape: layered down the back of the neck, pointed, the outer ones flicking out
  for (let i = 0; i < 11; i++) {
    const az = (138 + (i / 10) * 84) * DEG + jit(3 * DEG);
    const edge = Math.abs(i - 5) / 5;
    add({
      az, pol: (80 + jit(5)) * DEG, length: 0.11 + 0.02 * (1 - edge) + jit(0.012), width: 0.044, lift: 0.022, fall: 0.9,
      flick: 0.25 + edge * 0.5, layer: 2, thickness: 0.0048,
    });
  }
  // the fringe: heavy, swept to her right, down to the eyes, one long lock between them
  const fringe: [number, number, number, number][] = [
    // azimuth (deg), polar (deg), length, sweep (to her left +)
    [-50, 60, 0.11, -0.01], [-39, 56, 0.12, -0.014], [-28, 52, 0.128, -0.016], [-17, 48, 0.132, -0.02], [-6, 45, 0.13, -0.022],
    [5, 44, 0.126, -0.025], [15, 45, 0.122, -0.026], [25, 48, 0.118, -0.024], [35, 52, 0.112, -0.018], [45, 56, 0.104, -0.012], [54, 61, 0.095, -0.006],
  ];
  for (const [az, pol, L, sw] of fringe) {
    add({
      az: az * DEG, pol: pol * DEG, length: L + jit(0.008), width: 0.05, lift: 0.019, fall: 0.45, flick: -0.3,
      sweep: sw, comb: norm([sw * 4, 0.15, 1]), layer: 3, thickness: 0.0048,
    });
  }
  // the long lock between the eyes (a little to her right)
  add({ az: 2 * DEG, pol: 40 * DEG, length: 0.16, width: 0.022, lift: 0.012, fall: 0.3, flick: -0.2, sweep: -0.008, comb: norm([-0.05, 0.1, 1]), layer: 3, thickness: 0.004 });
  // the ahoge: two thin strands up from the crown
  add({ az: 165 * DEG, pol: 14 * DEG, length: 0.075, width: 0.008, lift: 0.004, fall: -0.4, flick: 0.6, comb: norm([0.2, 1.4, 0.6]), layer: 4, thickness: 0.0022 });
  add({ az: 195 * DEG, pol: 18 * DEG, length: 0.06, width: 0.007, lift: 0.004, fall: -0.3, flick: 0.5, comb: norm([-0.3, 1.2, 0.2]), layer: 4, thickness: 0.002 });

  // ---- geometry
  const pos: number[] = [], nrm: number[] = [], hair: number[] = [], idx: number[] = [];
  const SEG = 9; // along a lock
  const ACROSS = 4; // points across one face of the lens
  const volumeNormal = (p: V3): V3 => norm([(p[0] - vc[0]) / (vr[0] * vr[0]), (p[1] - vc[1]) / (vr[1] * vr[1]), (p[2] - vc[2]) / (vr[2] * vr[2])]);

  locks.forEach((L, li) => {
    const id = rnd();
    // the lock's spine, stepped over the head
    const { p: p0, n: n0 } = scalp(L.az, L.pol, L.lift * 0.4);
    const spine: V3[] = [p0];
    const ups: V3[] = [n0];
    let dir = norm(sub3(L.comb, scale3(n0, dot(L.comb, n0) * 0.9)));
    let p = p0;
    const step = L.length / SEG;
    let free = false;
    for (let k = 1; k <= SEG; k++) {
      const t = k / SEG;
      const a = above(p);
      // over the top of the head a lock lies on it, combed along it and pulled round it by its weight; once past the
      // head's widest it leaves it and hangs, flaring out a little, its tip flicking (out, or in to the face) and
      // sweeping aside
      const want = L.lift * (0.45 + 0.85 * Math.min(1, t * 1.5));
      if (!free && a.n[1] < -0.05 && dir[1] < 0) free = true;
      if (!free) {
        dir = add3(dir, [0, -L.fall * 0.35, 0]);
        dir = norm(sub3(dir, scale3(a.n, dot(dir, a.n))));
      } else {
        dir = norm(add3(dir, add3([0, -L.fall * 0.3, 0], scale3(a.n, 0.06))));
      }
      if (t > 0.55) dir = norm(add3(dir, add3(scale3(a.n, L.flick * 0.4 * (t - 0.55)), [L.sweep * 3 * (t - 0.55), 0, 0])));
      let q = add3(p, scale3(dir, step));
      const b = above(q);
      // on the head: at its lift exactly; hanging: never closer than its lift
      if (!free || b.d < want) q = add3(q, scale3(b.n, want - b.d));
      for (const [fc, fr] of face) {
        const qq: V3 = [(q[0] - fc[0]) / fr[0], (q[1] - fc[1]) / fr[1], (q[2] - fc[2]) / fr[2]];
        const kk = Math.hypot(qq[0], qq[1], qq[2]);
        const margin = 1 + (L.layer === 3 ? 0.06 : 0.09);
        if (kk < margin) q = [fc[0] + qq[0] / kk * margin * fr[0], fc[1] + qq[1] / kk * margin * fr[1], fc[2] + qq[2] / kk * margin * fr[2]];
      }
      dir = norm(sub3(q, p));
      p = q;
      spine.push(p);
      ups.push(above(p).n);
    }
    // the blade round the spine
    const base = pos.length / 3;
    const ring = ACROSS * 2 - 2; // the lens: ACROSS on top, ACROSS-2 under (the edges shared)
    for (let k = 0; k <= SEG; k++) {
      const t = k / SEG;
      const sp = spine[k];
      const tan = norm(sub3(spine[Math.min(SEG, k + 1)], spine[Math.max(0, k - 1)]));
      let up = ups[k];
      up = norm(sub3(up, scale3(tan, dot(up, tan))));
      const side = norm(cross(tan, up));
      // width: full soon after the root, a long taper to a point
      const w = L.width * 0.5 * Math.min(1, 0.55 + t * 2.2) * Math.pow(Math.max(0, 1 - t), 0.85);
      const th = L.thickness * Math.min(1, 0.6 + t * 2) * Math.pow(Math.max(0, 1 - t), 0.6);
      for (let j = 0; j < ring; j++) {
        // round the lens: top face j = 0..ACROSS-1 (edge to edge), bottom face back
        let u: number, top: number;
        if (j < ACROSS) { u = -1 + (2 * j) / (ACROSS - 1); top = 1; }
        else { u = 1 - (2 * (j - ACROSS + 1)) / (ACROSS - 1); top = -1; }
        const bulge = Math.sqrt(Math.max(0, 1 - u * u));
        const off = add3(scale3(side, u * w), scale3(up, top * bulge * th * 0.5 + th * 0.15));
        const q = add3(sp, off);
        pos.push(q[0], q[1], q[2]);
        const lockN = norm(add3(scale3(up, top), scale3(side, u * 0.6)));
        const vn = volumeNormal(q);
        // the under face of a lock is shaded as what it is (it faces the head)
        const mixw = top > 0 ? 0.72 : 0.25;
        const nn = norm(add3(scale3(lockN, 1 - mixw), scale3(vn, mixw)));
        nrm.push(nn[0], nn[1], nn[2]);
        hair.push(t, id, L.layer, u);
      }
    }
    for (let k = 0; k < SEG; k++) {
      for (let j = 0; j < ring; j++) {
        const a = base + k * ring + j, b = base + k * ring + ((j + 1) % ring);
        const c2 = a + ring, d = b + ring;
        idx.push(a, c2, b, b, c2, d);
      }
    }
    void li;
  });

  // ---- the cap under the locks: the scalp a little out, cut at the hairline
  {
    const base = pos.length / 3;
    const NA = 40, NP = 18;
    const hairline = (az: number): number => {
      // polar angle where the hair ends: the forehead high, over the ears lower, the nape lowest
      const f = Math.cos(az);
      return (f > 0 ? 66 + (1 - f) * 22 : 88 - f * 18) * DEG;
    };
    for (let i = 0; i <= NA; i++) {
      const az = (i / NA) * 2 * Math.PI;
      const end = hairline(az);
      for (let j = 0; j <= NP; j++) {
        const pol = (j / NP) * end;
        const { p, n } = scalp(az, pol, 0.002);
        pos.push(p[0], p[1], p[2]);
        const vn = volumeNormal(p);
        const nn = norm(add3(scale3(n, 0.4), scale3(vn, 0.6)));
        nrm.push(nn[0], nn[1], nn[2]);
        hair.push(0, 0.5, 0, 0);
      }
    }
    for (let i = 0; i < NA; i++) {
      for (let j = 0; j < NP; j++) {
        const a = base + i * (NP + 1) + j, b = a + 1, c2 = a + (NP + 1), d = c2 + 1;
        idx.push(a, b, c2, b, d, c2);
      }
    }
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), indices: new Uint32Array(idx), hair: new Float32Array(hair) };
}
