// Her helmet (docs/V3/plan/character-pv.md §14): a full-face motorcycle helmet worn in place of a head — she has no
// face or hair to make; the helmet is her head. A rounded shell a little large for her (as a figure in a cartoon wears
// one), its chin bar swelling forward under a tinted visor that wraps round the eye port, the visor's pivots on the
// sides, its lower edge higher at the nape than under the chin, hollow inside (her neck goes up into it).
//
// In the Head bone's frame of the bind pose (x her left, y up the head, z out of the face), metres; HELMET holds the
// numbers. The surface knows what each point is (shell, visor, pivot) and where it is on the helmet (head frame), for
// its stripe, its rubber trim and the visor's reflection (game/character/helmetMaterial.ts).

import type { HeadSculpt } from './head';
import type { Field } from './sdf';
import { fieldNormals, polygonize } from './polygonize';
import { decimate } from './decimate';

export const HELMET = {
  /** the dome over her head: its middle (y, z) and half-sizes */
  dome: { y: 0.115, z: -0.012, rx: 0.13, ry: 0.135, rz: 0.142 },
  /** the jaw and chin bar under it, swelling forward */
  jaw: { y: 0.03, z: 0.026, rx: 0.123, ry: 0.088, rz: 0.132 },
  join: 0.06,
  /** the shell's thickness */
  thick: 0.014,
  /** the lower edge: its height at the back of the neck and under the chin */
  bottom: { back: -0.01, front: -0.05 },
  /** the eye port the visor covers: half its angle round the front (deg), its top and bottom, its corners' rounding */
  port: { half: 64, top: 0.128, bottom: 0.05, round: 0.024 },
  /** the visor: off the shell, its thickness, how far past the port's edge it reaches */
  visor: { off: 0.006, thick: 0.0055, over: 0.01 },
  /** the visor's pivots on the sides: height, forwardness, radius, how far they stand out */
  pivot: { y: 0.088, z: 0.012, r: 0.0135, t: 0.0045 },
};

/** what a point of the helmet is */
export const enum HelmetPart {
  Shell = 0,
  Visor = 1,
  Pivot = 2,
}

/** an ellipsoid's distance (near enough: Inigo Quilez's bound) */
function ell(x: number, y: number, z: number, rx: number, ry: number, rz: number): number {
  const k0 = Math.sqrt((x / rx) ** 2 + (y / ry) ** 2 + (z / rz) ** 2);
  const k1 = Math.sqrt((x / (rx * rx)) ** 2 + (y / (ry * ry)) ** 2 + (z / (rz * rz)) ** 2);
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
}
const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);

/** The helmet's fields in the head's frame: the shell's outer surface, the shell, the visor, the pivots. */
export function helmetFields(): { outer: Field; shell: Field; visor: Field; pivots: Field } {
  const H = HELMET;
  const outer: Field = (x, y, z) => {
    const a = ell(x, y - H.dome.y, z - H.dome.z, H.dome.rx, H.dome.ry, H.dome.rz);
    const b = ell(x, y - H.jaw.y, z - H.jaw.z, H.jaw.rx, H.jaw.ry, H.jaw.rz);
    let d = smin(a, b, H.join);
    const t = Math.min(1, Math.max(0, (z + 0.1) / 0.23));
    const yb = H.bottom.back + (H.bottom.front - H.bottom.back) * t;
    d = smax(d, yb - y, 0.008);
    return d;
  };
  const shell: Field = (x, y, z) => {
    const d = outer(x, y, z);
    return Math.max(d, -(d + H.thick));
  };
  // the port: how far a point is outside it, measured over the front of the helmet (round the front by angle, up by height)
  const port = (x: number, y: number, z: number, grow: number) => {
    const P = H.port;
    const az = Math.abs(Math.atan2(x, z - H.dome.z));
    const R = 0.13;
    const du = (az - (P.half * Math.PI) / 180) * R + P.round - grow;
    const dv = Math.max(y - P.top, P.bottom - y) + P.round - grow;
    const ox = Math.max(du, 0), oy = Math.max(dv, 0);
    return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(du, dv), 0) - P.round;
  };
  const visor: Field = (x, y, z) => {
    const V = H.visor;
    const d = outer(x, y, z);
    const sheet = Math.abs(d - V.off - V.thick / 2) - V.thick / 2;
    return Math.max(sheet, port(x, y, z, V.over), -(z - H.dome.z));
  };
  const pivots: Field = (x, y, z) => {
    const p = H.pivot;
    const side = Math.sqrt(Math.max(0, 1 - ((p.y - H.dome.y) / H.dome.ry) ** 2 - ((p.z - H.dome.z) / H.dome.rz) ** 2)) * H.dome.rx;
    const ax = Math.abs(x) - side;
    const radial = Math.sqrt((y - p.y) ** 2 + (z - p.z) ** 2) - p.r;
    return Math.max(radial, Math.abs(ax - p.t * 0.5) - p.t);
  };
  return { outer, shell, visor, pivots };
}

export interface HelmetMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  /** per point: x what it is (HelmetPart), y z w where it is in the head's frame */
  helmet: Float32Array;
}

/**
 * The helmet's surface (world, bind pose) on her head's frame, each point told what it is and where on the helmet: the
 * shell sculpted and simplified (it has no thin edge), the visor and the pivots made directly (their rims exact).
 */
export function growHelmet(hs: HeadSculpt, o: { h?: number; target?: number } = {}): HelmetMesh {
  const f = helmetFields();
  const H = HELMET;
  const { o: O, x: X, y: Y, z: Z } = hs;
  const local = (px: number, py: number, pz: number): [number, number, number] => {
    const wx = px - O[0], wy = py - O[1], wz = pz - O[2];
    return [wx * X[0] + wy * X[1] + wz * X[2], wx * Y[0] + wy * Y[1] + wz * Y[2], wx * Z[0] + wy * Z[1] + wz * Z[2]];
  };
  const world = (lx: number, ly: number, lz: number): [number, number, number] =>
    [O[0] + X[0] * lx + Y[0] * ly + Z[0] * lz, O[1] + X[1] * lx + Y[1] * ly + Z[1] * lz, O[2] + X[2] * lx + Y[2] * ly + Z[2] * lz];
  const shellW: Field = (px, py, pz) => {
    const [a, b, c] = local(px, py, pz);
    return f.shell(a, b, c);
  };
  const h = o.h ?? 0.0012;
  const raw = polygonize(shellW, { h, min: [O[0] - 0.15, O[1] - 0.075, O[2] - 0.17], max: [O[0] + 0.15, O[1] + 0.28, O[2] + 0.17], project: 3 });
  let sp: Float32Array = new Float32Array(raw.positions);
  let si: Uint32Array = raw.indices;
  if (o.target && raw.indices.length / 3 > o.target) {
    const dec = decimate(raw.positions, raw.indices, { target: o.target, maxEdge: 0.014 });
    sp = new Float32Array(dec.positions);
    si = dec.indices;
  }
  const sn = fieldNormals(shellW, sp, h * 0.7);
  const pos: number[] = Array.from(sp), nrm: number[] = Array.from(sn), idx: number[] = Array.from(si);
  const part: number[] = new Array(sp.length / 3).fill(HelmetPart.Shell);
  const add = (p: [number, number, number], n: [number, number, number], what: HelmetPart) => {
    pos.push(p[0], p[1], p[2]);
    nrm.push(n[0], n[1], n[2]);
    part.push(what);
    return part.length - 1;
  };
  // the outer surface's normal (head frame) at a point, by the field
  const outN = (lx: number, ly: number, lz: number): [number, number, number] => {
    const e = 0.0008;
    const gx = f.outer(lx + e, ly, lz) - f.outer(lx - e, ly, lz), gy = f.outer(lx, ly + e, lz) - f.outer(lx, ly - e, lz), gz = f.outer(lx, ly, lz + e) - f.outer(lx, ly, lz - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    return [gx / l, gy / l, gz / l];
  };
  const toWorldN = (n: [number, number, number]): [number, number, number] => {
    const w = [X[0] * n[0] + Y[0] * n[1] + Z[0] * n[2], X[1] * n[0] + Y[1] * n[1] + Z[1] * n[2], X[2] * n[0] + Y[2] * n[1] + Z[2] * n[2]];
    return [w[0], w[1], w[2]];
  };
  // ---- the visor: a squared oval over the port (and a little past it), laid off the shell, with a thickness
  {
    const P = H.port, V = H.visor;
    const R = 0.13;
    const cy = (P.top + P.bottom) / 2;
    const A = ((P.half * Math.PI) / 180) * R + V.over, B = (P.top - P.bottom) / 2 + V.over;
    const SQ = 5;
    const outline = (t: number): [number, number] => {
      const c = Math.cos(t), s = Math.sin(t);
      return [A * Math.sign(c) * Math.pow(Math.abs(c), 2 / SQ), B * Math.sign(s) * Math.pow(Math.abs(s), 2 / SQ)];
    };
    // a point of the plate: round the front by u, up by v, off the shell by d (along the level line out from the dome's middle)
    const at = (u: number, v: number, d: number): [number, number, number] => {
      const phi = u / R, y = cy + v;
      const dx = Math.sin(phi), dz = Math.cos(phi);
      let lo = 0, hi = 0.3;
      for (let k = 0; k < 40; k++) {
        const m = (lo + hi) / 2;
        if (f.outer(dx * m, y, H.dome.z + dz * m) < d) lo = m;
        else hi = m;
      }
      const t = (lo + hi) / 2;
      return [dx * t, y, H.dome.z + dz * t];
    };
    const NT = 120, NR = 14;
    for (const [d, out] of [[V.off + V.thick, 1], [V.off, -1]] as [number, number][]) {
      const centre = at(0, 0, d);
      const n0 = outN(centre[0], centre[1], centre[2]);
      const c0 = add(world(...centre), toWorldN([n0[0] * out, n0[1] * out, n0[2] * out]), HelmetPart.Visor);
      const ring: number[][] = [];
      for (let r = 1; r <= NR; r++) {
        const row: number[] = [];
        const k = r / NR;
        for (let t = 0; t < NT; t++) {
          const [u, v] = outline((t / NT) * Math.PI * 2);
          const p = at(u * k, v * k, d);
          const n = outN(p[0], p[1], p[2]);
          row.push(add(world(...p), toWorldN([n[0] * out, n[1] * out, n[2] * out]), HelmetPart.Visor));
        }
        ring.push(row);
      }
      const tri = (a1: number, b1: number, c1: number) => (out > 0 ? idx.push(a1, b1, c1) : idx.push(a1, c1, b1));
      for (let t = 0; t < NT; t++) tri(c0, ring[0][t], ring[0][(t + 1) % NT]);
      for (let r = 0; r < NR - 1; r++) for (let t = 0; t < NT; t++) {
        const a1 = ring[r][t], b1 = ring[r][(t + 1) % NT], c1 = ring[r + 1][t], d1 = ring[r + 1][(t + 1) % NT];
        tri(a1, c1, b1);
        tri(b1, c1, d1);
      }
    }
    // the rim between the two faces: its own points, facing out of the outline
    const rimO: number[] = [], rimI: number[] = [];
    for (let t = 0; t < NT; t++) {
      const tt = (t / NT) * Math.PI * 2;
      const [u, v] = outline(tt);
      const [u2, v2] = outline(tt + 0.01);
      const pO = at(u, v, V.off + V.thick), pI = at(u, v, V.off);
      const along = at(u2, v2, V.off + V.thick);
      const tan = [along[0] - pO[0], along[1] - pO[1], along[2] - pO[2]];
      const nn = outN(pO[0], pO[1], pO[2]);
      // out of the outline: across its tangent, along the surface
      let rx = tan[1] * nn[2] - tan[2] * nn[1], ry = tan[2] * nn[0] - tan[0] * nn[2], rz = tan[0] * nn[1] - tan[1] * nn[0];
      const rl = Math.hypot(rx, ry, rz) || 1;
      rx /= rl; ry /= rl; rz /= rl;
      // (pointing away from the plate's middle)
      const mid = at(0, 0, V.off);
      if ((pO[0] - mid[0]) * rx + (pO[1] - mid[1]) * ry + (pO[2] - mid[2]) * rz < 0) { rx = -rx; ry = -ry; rz = -rz; }
      rimO.push(add(world(...pO), toWorldN([rx, ry, rz]), HelmetPart.Visor));
      rimI.push(add(world(...pI), toWorldN([rx, ry, rz]), HelmetPart.Visor));
    }
    for (let t = 0; t < NT; t++) {
      // (wound so the rim faces out of the outline)
      const a1 = rimO[t], b1 = rimO[(t + 1) % NT], c1 = rimI[t], d1 = rimI[(t + 1) % NT];
      idx.push(a1, c1, b1, b1, c1, d1);
    }
  }
  // ---- the pivots: a short disc on each side, its face out
  {
    const p = H.pivot;
    // (where the shell's outer surface is at the pivot, out along x)
    let lo = 0, hi = 0.25;
    for (let k = 0; k < 40; k++) {
      const m = (lo + hi) / 2;
      if (f.outer(m, p.y, p.z) < 0) lo = m;
      else hi = m;
    }
    const side = (lo + hi) / 2;
    const NS = 28;
    for (const m of [1, -1]) {
      const x0 = m * (side - 0.002), x1 = m * (side + p.t);
      const face: number[] = [], wallO: number[] = [], wallI: number[] = [];
      const c0 = add(world(x1, p.y, p.z), toWorldN([m, 0, 0]), HelmetPart.Pivot);
      for (let s = 0; s < NS; s++) {
        const a1 = (s / NS) * Math.PI * 2;
        const yy = p.y + Math.cos(a1) * p.r, zz = p.z + Math.sin(a1) * p.r;
        face.push(add(world(x1, yy, zz), toWorldN([m, 0, 0]), HelmetPart.Pivot));
        const rn: [number, number, number] = [0, Math.cos(a1), Math.sin(a1)];
        wallO.push(add(world(x1, yy, zz), toWorldN(rn), HelmetPart.Pivot));
        wallI.push(add(world(x0, yy, zz), toWorldN(rn), HelmetPart.Pivot));
      }
      for (let s = 0; s < NS; s++) {
        const s1 = (s + 1) % NS;
        if (m > 0) idx.push(c0, face[s], face[s1]);
        else idx.push(c0, face[s1], face[s]);
        if (m > 0) idx.push(wallO[s], wallI[s], wallO[s1], wallO[s1], wallI[s], wallI[s1]);
        else idx.push(wallO[s], wallO[s1], wallI[s], wallO[s1], wallI[s1], wallI[s]);
      }
    }
  }
  const positions = new Float32Array(pos), normals = new Float32Array(nrm);
  const n = positions.length / 3;
  const helmet = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) {
    const l = local(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
    helmet.set([part[v], l[0], l[1], l[2]], v * 4);
  }
  return { positions, normals, indices: new Uint32Array(idx), helmet };
}
