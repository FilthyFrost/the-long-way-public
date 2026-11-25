// Her nightdress, the bandage on her thigh and the ribbons (docs/V3/plan/character-pv.md §3, §7): the turnaround's
// white babydoll — lace-trimmed cups on halter ties knotted behind the neck, the ties' ends hanging down her back; a
// skirt gathered under the bust, flaring to mid-thigh with a scalloped lace hem and a slit at the front on her right;
// the back open in a V laced across with a ribbon; a ribbon choker; three turns of bandage round her right thigh and
// a strap above them.
//
// Fitted to her own body: every piece is laid on the trunk's (or the leg's) surface found by casting from her middle
// outward, a few millimetres off it, so a change of her proportions refits the dress. The cups and the ribbons are
// skinned to her bones; the skirt is cloth (cloth.ts) hung from the seam under the bust and down the edges of the open
// back, falling against her hips and thighs.

import { type Field, addNear, compile, hardMin } from './sdf';
import { polygonize } from './polygonize';
import { decimate } from './decimate';
import type { Sculpt } from './body';
import type { Skeleton } from './skeleton';
import { skinWeights } from './mesh';
import { type Prim, Kind, primsOf } from './sdf';
import { type V3, add3, cross, norm, scale3, sub3 } from './qmath';

/** A skinned piece of clothing. `cloth`: x along its trimmed edge (m), y in from that edge (m; 9 = no edge near), z what it is (Stuff), w a variant (ink, shade). */
export interface GarmentMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  skinIndex: Uint16Array;
  skinWeight: Float32Array;
  cloth: Float32Array;
}

export const enum Stuff {
  Fabric = 0,
  Lace = 1,
  Ribbon = 2,
  Bandage = 3,
}

/** A sheet of cloth to simulate: a grid of cols × rows particles, the first row pinned to her. */
export interface ClothSheet {
  cols: number;
  rows: number;
  /** the particles where they hang in the bind pose */
  rest: Float32Array;
  /** the pinned particles' bones and weights (4 each), for the first row */
  pinSkinIndex: Uint16Array;
  pinSkinWeight: Float32Array;
  /** threads: [a, b, rest length, stiffness] */
  links: Float32Array;
  /** per particle, as GarmentMesh.cloth */
  cloth: Float32Array;
  /** quads not drawn (the slit): index of the quad's first particle */
  open: Uint8Array;
  /** the columns wrap round */
  closed: boolean;
}

/** A ribbon end hanging free: a chain of particles from a pinned first one. */
export interface Rope {
  rest: Float32Array;
  width: number;
  pinSkinIndex: Uint16Array;
  pinSkinWeight: Float32Array;
}

export interface Dress {
  bodice: GarmentMesh;
  skirt: ClothSheet;
  ribbons: GarmentMesh;
  bandage: GarmentMesh;
  tails: Rope[];
}

export const DRESS = {
  /** the lace shorts under it: their waist (low, under the navel) and their legs (a few centimetres under the crotch) */
  shortsTop: 0.925,
  shortsLeg: 0.735,
  /** the seam under the bust */
  underbust: 1.142,
  /** the cups' peaks (where the halter ties are sewn), the neckline's V between them, under the arms */
  cupPeak: 1.252,
  cupPeakAt: 0.4,
  vFront: 1.196,
  side: 1.205,
  /** the open back: its edges come down from under the arms to a point at the small of the back */
  backFrom: 1.75,
  backV: 1.02,
  hem: 0.705,
  /** radius gained per metre down from the seam */
  flare: 0.27,
  /** the slit: at her right front, up to here */
  slitAt: -0.5,
  slitTop: 0.865,
  cupOff: 0.0028,
  skirtOff: 0.006,
};

const TAU = Math.PI * 2;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The dress's top edge round her (θ: 0 the front, + to her left). */
export function topEdge(th: number): number {
  const a = Math.abs(wrapAngle(th));
  const D = DRESS;
  if (a <= D.cupPeakAt) return D.vFront + (D.cupPeak - D.vFront) * Math.sin((a / D.cupPeakAt) * Math.PI / 2) ** 1.4;
  if (a <= 1.1) return D.cupPeak + (D.side + 0.003 - D.cupPeak) * smooth(D.cupPeakAt, 1.1, a);
  if (a <= D.backFrom) return D.side + 0.003 - 0.003 * smooth(1.1, D.backFrom, a);
  return D.side - (D.side - D.backV) * ((a - D.backFrom) / (Math.PI - D.backFrom));
}

export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Where the trunk's surface is round its middle at height y, looking out at θ (radius from the axis). */
function makeCaster(f: Field, cz = -0.012) {
  return (th: number, y: number): number => {
    const dx = Math.sin(th), dz = Math.cos(th);
    let lo = 0, hi = 0.02;
    while (f(dx * hi, y, cz + dz * hi) < 0 && hi < 0.5) { lo = hi; hi += 0.02; }
    if (hi >= 0.5) return 0.2;
    for (let i = 0; i < 24; i++) {
      const m = (lo + hi) / 2;
      if (f(dx * m, y, cz + dz * m) < 0) lo = m; else hi = m;
    }
    return (lo + hi) / 2;
  };
}

/** The upper envelope of a ring of points round the axis (cloth bridges hollows: between the breasts, the small of the back). */
function bridge(ths: number[], rs: number[]): number[] {
  const n = ths.length;
  const out = rs.slice();
  for (let i = 0; i < n; i++) {
    // a straight thread from any two points either side must not pass outside this one
    for (let a = Math.max(0, i - 8); a < i; a++) {
      for (let b = i + 1; b <= Math.min(n - 1, i + 8); b++) {
        const pa = [Math.sin(ths[a]) * rs[a], Math.cos(ths[a]) * rs[a]], pb = [Math.sin(ths[b]) * rs[b], Math.cos(ths[b]) * rs[b]];
        // where the chord crosses the ray at θi
        const d = [Math.sin(ths[i]), Math.cos(ths[i])];
        const e = [pb[0] - pa[0], pb[1] - pa[1]];
        const den = d[0] * e[1] - d[1] * e[0];
        if (Math.abs(den) < 1e-9) continue;
        const t = (pa[0] * e[1] - pa[1] * e[0]) / den;
        if (t > out[i]) out[i] = t;
      }
    }
  }
  return out;
}

export function makeDress(sk: Skeleton, sc: Sculpt): Dress {
  const D = DRESS;
  const ft = compile(sc.torso, 0.04);
  const cast = makeCaster(ft);
  const CZ = -0.012;
  const prims = primsOf(sc.tree).filter((p: Prim) => p.kind !== Kind.Plane && p.claim > 0);
  const at = (th: number, y: number, r: number): V3 => [Math.sin(th) * r, y, CZ + Math.cos(th) * r];

  // ------------------------------------------------------------------ the bodice: cups, side panels, the back above the V
  const BC = 96, BR = 9;
  const bpos: number[] = [], bcl: number[] = [], bidx: number[] = [];
  const bodiceRows: number[][] = [];
  {
    const ths = Array.from({ length: BC }, (_, i) => -Math.PI + (i / BC) * TAU);
    for (let j = 0; j < BR; j++) {
      const v = j / (BR - 1);
      const ys = ths.map((th) => D.underbust + (Math.max(D.underbust, topEdge(th)) - D.underbust) * v);
      let rs = ths.map((th, i) => cast(th, ys[i]));
      rs = bridge(ths, rs);
      const row: number[] = [];
      for (let i = 0; i < BC; i++) {
        const p = at(ths[i], ys[i], rs[i] + D.cupOff);
        row.push(bpos.length / 3);
        bpos.push(p[0], p[1], p[2]);
        const top = topEdge(ths[i]);
        // the lace band along the top edge (1.3 cm), fabric below; the seam's band along the bottom
        const fromTop = top - ys[i];
        bcl.push(arcLen(ths[i]) , fromTop, fromTop < 0.014 ? Stuff.Lace : Stuff.Fabric, 0);
      }
      bodiceRows.push(row);
    }
    for (let j = 0; j < BR - 1; j++) {
      for (let i = 0; i < BC; i++) {
        const i2 = (i + 1) % BC;
        // only where there is a bodice (above the seam)
        if (topEdge(ths[i]) <= D.underbust + 0.004 || topEdge(ths[i2]) <= D.underbust + 0.004) continue;
        const a = bodiceRows[j][i], b = bodiceRows[j][i2], c = bodiceRows[j + 1][i], d = bodiceRows[j + 1][i2];
        bidx.push(a, b, c, b, d, c);
      }
    }
  }
  const bodice = finishGarment(sk, prims, bpos, bcl, bidx);

  // ------------------------------------------------------------------ the skirt: cloth
  const SC = 72, SR = 16;
  const rest = new Float32Array(SC * SR * 3);
  const cl = new Float32Array(SC * SR * 4);
  const ths = Array.from({ length: SC }, (_, i) => -Math.PI + ((i + 0.5) / SC) * TAU);
  const slitCol = ths.findIndex((th) => th > D.slitAt) - 1;
  const rUnder = bridge(ths, ths.map((th) => cast(th, D.underbust)));
  for (let i = 0; i < SC; i++) {
    const th = ths[i];
    const yPin = Math.min(D.underbust, topEdge(th));
    const hem = D.hem - 0.008 * (1 - Math.cos(th)) / 2;
    for (let j = 0; j < SR; j++) {
      const v = j / (SR - 1);
      const y = yPin + (hem - yPin) * v;
      const body = cast(th, y);
      const cone = rUnder[i] + D.skirtOff + (D.underbust - y) * D.flare;
      const r = Math.max(body + D.skirtOff, cone);
      const p = at(th, y, r);
      rest.set(p, (i + j * SC) * 3);
      // the lace: along the hem, and along the slit's two edges
      const fromHem = y - hem;
      const dSlit = Math.min(Math.abs(wrapAngle(th - (ths[slitCol] + Math.PI / SC))) * r, 9);
      const slitEdge = y < D.slitTop ? dSlit : 9;
      const fromBackEdge = topEdge(th) < D.underbust ? (topEdge(th) - y) : 9;
      const d = Math.min(fromHem, slitEdge, fromBackEdge);
      const along = d === fromHem ? arcLen(th) * (r / 0.2) : y;
      cl.set([along, d, d < 0.034 ? Stuff.Lace : Stuff.Fabric, 0], (i + j * SC) * 4);
    }
  }
  const links: number[] = [];
  const open = new Uint8Array(SC * SR);
  const blocked = (i: number, j: number) => i === slitCol && rest[(i + j * SC) * 3 + 1] < D.slitTop;
  const link = (a: number, b: number, k: number) => {
    const d = Math.hypot(rest[a * 3] - rest[b * 3], rest[a * 3 + 1] - rest[b * 3 + 1], rest[a * 3 + 2] - rest[b * 3 + 2]);
    links.push(a, b, d, k);
  };
  for (let j = 0; j < SR; j++) {
    for (let i = 0; i < SC; i++) {
      const k = i + j * SC;
      const i1 = (i + 1) % SC, i2 = (i + 2) % SC;
      const across = !blocked(i, j);
      if (across) link(k, i1 + j * SC, 1);
      if (j + 1 < SR) link(k, k + SC, 1);
      if (j + 1 < SR && across && !blocked(i, j + 1)) { link(k, i1 + (j + 1) * SC, 0.6); link(i1 + j * SC, k + SC, 0.6); }
      if (!blocked(i, j) && !blocked(i1, j)) link(k, i2 + j * SC, 0.25);
      if (j + 2 < SR) link(k, k + 2 * SC, 0.25);
      if (j + 1 < SR && (blocked(i, j) || blocked(i, j + 1))) open[k] = 1;
    }
  }
  const pinPts = new Float32Array(SC * 3);
  for (let i = 0; i < SC; i++) pinPts.set(rest.subarray(i * 3, i * 3 + 3), i * 3);
  const pinW = skinWeights(sk, prims, pinPts);
  const skirt: ClothSheet = { cols: SC, rows: SR, rest, pinSkinIndex: pinW.skinIndex, pinSkinWeight: pinW.skinWeight, links: new Float32Array(links), cloth: cl, open, closed: true };

  // ------------------------------------------------------------------ ribbons: the choker, the halter ties, the lacing
  const rpos: number[] = [], rcl: number[] = [], ridx: number[] = [], rnrm: number[] = [];
  const neck = sk.bindPos[sk.index.neck_01], headP = sk.bindPos[sk.index.Head];
  const neckAt = (th: number, y: number, off: number): V3 => {
    // the neck's surface round its axis (a slant from the neck's root to the skull)
    const t = (y - neck[1]) / (headP[1] - neck[1]);
    const cx = neck[0] + (headP[0] - neck[0]) * t, cz = neck[2] + (headP[2] - neck[2]) * t - 0.004;
    const r = 0.0275 - 0.002 * t;
    return [cx + Math.sin(th) * (r + off), y, cz + Math.cos(th) * (r * 0.93 + off)];
  };
  const RIB = (path: V3[], width: number, out: (p: V3) => V3, variant: number) => ribbon(rpos, rcl, ridx, path, width, out, variant, rnrm);
  // choker: a band round the neck under the jaw
  {
    const y = headP[1] - 0.012;
    const path: V3[] = [];
    for (let i = 0; i <= 40; i++) path.push(neckAt((i / 40) * TAU, y + 0.0015 * Math.sin((i / 40) * TAU * 2), 0.0022));
    RIB(path, 0.0085, (p) => norm([p[0] - neck[0], 0, p[2] - neck[2]]), 0);
  }
  // halter ties: from each cup's peak up over the collarbone and round the back of the neck to the knot
  const knot: V3 = [0, neck[1] + 0.03, neck[2] - 0.036];
  for (const side of [1, -1]) {
    const th = side * D.cupPeakAt;
    const cup = at(th, D.cupPeak - 0.004, cast(th, D.cupPeak - 0.004) + D.cupOff + 0.001);
    const path: V3[] = [];
    const n = 24;
    // up and in to the side of the neck, then round its back
    const neckSide = neckAt(side * 1.35, neck[1] + 0.005, 0.0025);
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      if (t <= 0.55) {
        const u = t / 0.55;
        // a straight run lifted a little off the chest (it is pulled taut)
        const p = add3(scale3(cup, 1 - u), scale3(neckSide, u));
        const r = cast(Math.atan2(p[0], p[2] - CZ), p[1]);
        const out = Math.hypot(p[0], p[2] - CZ);
        const lift = Math.max(0, r + 0.0025 - out);
        const dir = norm([p[0], 0, p[2] - CZ]);
        path.push(add3(p, scale3(dir, lift)));
      } else {
        const u = (t - 0.55) / 0.45;
        const a = side * (1.35 + u * (Math.PI - 1.35 - 0.12));
        path.push(neckAt(a, neck[1] + 0.005 + u * 0.022, 0.0028));
      }
    }
    path.push(add3(knot, [side * 0.006, 0, 0]));
    RIB(path, 0.0072, (p) => norm([p[0] - neck[0], 0.15, p[2] - neck[2]]), 1);
  }
  // the bow at the knot: two loops
  for (const side of [1, -1]) {
    const path: V3[] = [];
    for (let k = 0; k <= 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      path.push(add3(knot, [side * (0.016 * (1 - Math.cos(a)) / 2 + 0.003), 0.008 * Math.sin(a), -0.004 - 0.003 * Math.sin(a / 2)]));
    }
    RIB(path, 0.008, () => [0, 0, -1], 1);
  }
  // the lacing across the open back: a ribbon criss-crossing between the V's edges
  {
    const ys = [1.165, 1.128, 1.092, 1.058, 1.034];
    const edgeTh = (y: number) => {
      // where the top edge is at height y (the V's side), measured from the back
      const a = D.backFrom + ((D.side - y) / (D.side - D.backV)) * (Math.PI - D.backFrom);
      return Math.min(Math.PI - 0.05, a);
    };
    for (let k = 0; k + 1 < ys.length; k++) {
      for (const side of [1, -1]) {
        const a0 = side * edgeTh(ys[k] - 0.006), a1 = -side * edgeTh(ys[k + 1] - 0.006);
        const p0 = at(a0, ys[k] - 0.006, cast(a0, ys[k] - 0.006) + 0.004);
        const p1 = at(a1, ys[k + 1] - 0.006, cast(a1, ys[k + 1] - 0.006) + 0.004);
        const path: V3[] = [];
        for (let s = 0; s <= 8; s++) {
          const u = s / 8;
          const p = add3(scale3(p0, 1 - u), scale3(p1, u));
          const th = Math.atan2(p[0], p[2] - CZ);
          const r = cast(th, p[1]) + 0.003 + (side > 0 ? 0.0012 : 0);
          path.push(at(th, p[1], Math.max(r, Math.hypot(p[0], p[2] - CZ))));
        }
        RIB(path, 0.0055, (p) => norm([p[0], 0, p[2] - CZ]), 2);
      }
    }
  }
  const ribbons = finishGarment(sk, prims, rpos, rcl, ridx, rnrm);

  // the ends of the halter tie hanging from the bow down her back
  const tails: Rope[] = [];
  for (const side of [1, -1]) {
    const n = 9;
    const pts = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      const p = add3(knot, [side * (0.005 + k * 0.0012), -0.004 - k * 0.036, -0.006 - k * 0.0015]);
      // keep it off her back
      const th = Math.atan2(p[0], p[2] - CZ);
      const r = cast(th, p[1]) + 0.006;
      const out = Math.hypot(p[0], p[2] - CZ);
      const q = out < r ? at(th, p[1], r) : p;
      pts.set(q, k * 3);
    }
    const w = skinWeights(sk, prims, pts.slice(0, 3));
    tails.push({ rest: pts, width: 0.0072, pinSkinIndex: w.skinIndex, pinSkinWeight: w.skinWeight });
  }

  // ------------------------------------------------------------------ the bandage round her right thigh
  const gpos: number[] = [], gcl: number[] = [], gidx: number[] = [];
  {
    const fl = compile(sc.legs.r, 0.04);
    const hip = sk.bindPos[sk.index.thigh_r], knee = sk.bindPos[sk.index.calf_r];
    const axisAt = (y: number): V3 => {
      const t = (hip[1] - y) / (hip[1] - knee[1]);
      return [hip[0] + (knee[0] - hip[0]) * t, y, hip[2] + (knee[2] - hip[2]) * t];
    };
    const legCast = (th: number, y: number): number => {
      const c = axisAt(y);
      const dx = Math.sin(th), dz = Math.cos(th);
      let lo = 0, hi = 0.01;
      while (fl(c[0] + dx * hi, y, c[2] + dz * hi) < 0 && hi < 0.2) { lo = hi; hi += 0.01; }
      for (let i = 0; i < 20; i++) {
        const m = (lo + hi) / 2;
        if (fl(c[0] + dx * m, y, c[2] + dz * m) < 0) lo = m; else hi = m;
      }
      return (lo + hi) / 2;
    };
    // [height of the middle, width, tilt (m over a turn), layer]
    const turns: [number, number, number, number][] = [[0.585, 0.046, 0.012, 0], [0.622, 0.044, -0.01, 1], [0.66, 0.042, 0.014, 2], [0.69, 0.034, -0.006, 3], [0.745, 0.012, 0.004, 0]];
    for (const [y0, w, tilt, layer] of turns) {
      const N = 48, M = 4;
      const base = gpos.length / 3;
      for (let i = 0; i <= N; i++) {
        const th = (i / N) * TAU;
        const yc = y0 + tilt * Math.sin(th + layer);
        for (let j = 0; j < M; j++) {
          const v = j / (M - 1) - 0.5;
          const y = yc + v * w;
          const c = axisAt(y);
          // the cloth's edges sit a little proud of the turn under it
          const r = legCast(th, y) + 0.0022 + layer * 0.0007 + (Math.abs(v) > 0.45 ? 0.0004 : 0);
          gpos.push(c[0] + Math.sin(th) * r, y, c[2] + Math.cos(th) * r);
          gcl.push(th * r, Math.min(Math.abs(v + 0.5), Math.abs(v - 0.5)) * w, Stuff.Bandage, layer);
        }
      }
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < M - 1; j++) {
          const a = base + i * M + j, b = a + M, c = a + 1, d = b + 1;
          gidx.push(a, b, c, b, d, c);
        }
      }
    }
  }
  const bandage = finishGarment(sk, prims, gpos, gcl, gidx);
  // under it, lace shorts: one mesh with the bandage (both always shown, the one draw)
  const shorts = growShorts(sk, sc, prims);

  return { bodice, skirt, ribbons, bandage: mergeGarments(bandage, shorts), tails };

  /** arc length round the trunk from the front, for laying the lace's pattern along an edge */
  function arcLen(th: number): number {
    return th * 0.12;
  }
}

/**
 * Lace shorts under the nightdress: her hips and the tops of her thighs grown out a few millimetres (as trousers are,
 * wardrobe.ts), cut low at the waist and a few centimetres under the crotch, the lace's scallops and eyelets round
 * each leg. A skirt that blows or rides up shows them, not her.
 */
function growShorts(sk: Skeleton, sc: Sculpt, prims: Prim[]): GarmentMesh {
  const J = (n: string) => sk.bindPos[sk.index[n]];
  const hipL = J('thigh_l'), hipR = J('thigh_r');
  const body = compile(hardMin(addNear(0.05, 0.012, add3(hipL, [0, -0.04, 0]), 0.14, sc.torso, sc.legOnly.l), addNear(0.05, 0.012, add3(hipR, [0, -0.04, 0]), 0.14, sc.torso, sc.legOnly.r)), 0.06);
  const TOP = DRESS.shortsTop, LEG = DRESS.shortsLeg;
  const out = 0.0058, thick = 0.0052;
  const f: Field = (x, y, z) => {
    const d = body(x, y, z);
    return Math.max(Math.max(d - out, -(d - (out - thick))), Math.max(y - TOP, LEG - y));
  };
  const raw = polygonize(f, { h: 0.0022, min: [-0.21, LEG - 0.01, -0.17], max: [0.21, TOP + 0.01, 0.16], project: 3 });
  const dec = decimate(raw.positions, raw.indices, { target: 2600, maxEdge: 0.02 });
  const pos = Array.from(dec.positions);
  const cl: number[] = [];
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    // in from the leg's edge (the waist's edge is plain), along it round the thigh
    const fromLeg = y - LEG;
    const hip = x > 0 ? hipL : hipR;
    const along = Math.atan2(z - hip[2], x - hip[0]) * 0.08;
    cl.push(along, fromLeg < 0.05 ? fromLeg : 9, fromLeg < 0.034 ? Stuff.Lace : Stuff.Fabric, 0);
  }
  return finishGarment(sk, prims, pos, cl, Array.from(dec.indices));
}

/** Two skinned pieces as one mesh. */
function mergeGarments(a: GarmentMesh, b: GarmentMesh): GarmentMesh {
  const cat = <T extends Float32Array | Uint32Array | Uint16Array | Uint8Array>(x: T, y: T): T => {
    const out = new (x.constructor as new (n: number) => T)(x.length + y.length);
    out.set(x);
    out.set(y, x.length);
    return out;
  };
  const base = a.positions.length / 3;
  const indices = new Uint32Array(a.indices.length + b.indices.length);
  indices.set(a.indices);
  for (let i = 0; i < b.indices.length; i++) indices[a.indices.length + i] = b.indices[i] + base;
  return { positions: cat(a.positions, b.positions), normals: cat(a.normals, b.normals), indices, skinIndex: cat(a.skinIndex as Uint16Array, b.skinIndex as Uint16Array), skinWeight: cat(a.skinWeight, b.skinWeight), cloth: cat(a.cloth, b.cloth) };
}

/** A flat ribbon along a path, its face turned out as `out(p)` says (drawn from both sides). */
function ribbon(pos: number[], cl: number[], idx: number[], path: V3[], width: number, out: (p: V3) => V3, variant: number, nrm?: number[]): void {
  const base = pos.length / 3;
  let along = 0;
  for (let k = 0; k < path.length; k++) {
    const p = path[k];
    const tan = norm(sub3(path[Math.min(path.length - 1, k + 1)], path[Math.max(0, k - 1)]));
    const o = out(p);
    const side = norm(cross(tan, o));
    const up = norm(cross(side, tan));
    if (k > 0) along += Math.hypot(...sub3(p, path[k - 1]));
    for (const s of [-1, 1]) {
      const q = add3(add3(p, scale3(side, (s * width) / 2)), scale3(up, 0.0006));
      pos.push(q[0], q[1], q[2]);
      nrm?.push(up[0], up[1], up[2]);
      cl.push(along, 9, Stuff.Ribbon, variant);
    }
  }
  for (let k = 0; k < path.length - 1; k++) {
    const a = base + k * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
}

function finishGarment(sk: Skeleton, prims: Prim[], pos: number[], cl: number[], idx: number[], given?: number[]): GarmentMesh {
  const positions = new Float32Array(pos);
  const indices = new Uint32Array(idx);
  // normals from the faces (each piece is smooth enough), unless they were given
  const normals = new Float32Array(positions.length);
  if (given && given.length === pos.length) normals.set(given);
  else for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const u = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
    const v = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const i of [a, b, c]) { normals[i] += n[0]; normals[i + 1] += n[1]; normals[i + 2] += n[2]; }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= l; normals[i + 1] /= l; normals[i + 2] /= l;
  }
  const w = skinWeights(sk, prims, positions);
  return { positions, normals, indices, skinIndex: w.skinIndex, skinWeight: w.skinWeight, cloth: new Float32Array(cl) };
}
