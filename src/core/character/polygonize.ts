// The surface of a field, as triangles (docs/V3/plan/character-pv.md §3).
//
// Naive surface nets on a sparse grid: the box is cut into blocks of 8³ cells, only blocks near the surface are
// filled in (the field's value at a block's middle says how far the surface can be), a vertex goes in each cell the
// surface passes through (the mean of where it crosses the cell's edges) and a quad joins the four cells round each
// edge it crosses. The vertices are then pulled onto the surface along the field's gradient. A fine grid everywhere
// would be millions of cells; near the surface only, a body at 2.5 mm is a few hundred thousand.

import type { Field } from './sdf';

export interface RawMesh {
  /** xyz per vertex */
  positions: Float64Array;
  /** three per triangle, counter-clockwise seen from outside */
  indices: Uint32Array;
}

export interface PolygonizeOptions {
  /** cell size (m) */
  h: number;
  min: [number, number, number];
  max: [number, number, number];
  /** Newton steps onto the surface after placing (0 to leave as placed) */
  project?: number;
  /** how far past a block's half diagonal the field may be and the block still be filled (lower bounds are loose) */
  slack?: number;
}

const B = 8; // cells a block

export function polygonize(f: Field, o: PolygonizeOptions): RawMesh {
  const h = o.h;
  const [x0, y0, z0] = o.min;
  const nx = Math.max(2, Math.ceil((o.max[0] - x0) / h) + 1);
  const ny = Math.max(2, Math.ceil((o.max[1] - y0) / h) + 1);
  const nz = Math.max(2, Math.ceil((o.max[2] - z0) / h) + 1);
  const cx = nx - 1, cy = ny - 1, cz = nz - 1; // cells
  const bx = Math.ceil(cx / B), by = Math.ceil(cy / B), bz = Math.ceil(cz / B);
  const half = (B * h * Math.sqrt(3)) / 2;
  const slack = o.slack ?? 1.6;

  // 1. which blocks the surface may pass through
  const active: number[] = [];
  for (let k = 0; k < bz; k++) {
    for (let j = 0; j < by; j++) {
      for (let i = 0; i < bx; i++) {
        const mx = x0 + (i * B + B / 2) * h, my = y0 + (j * B + B / 2) * h, mz = z0 + (k * B + B / 2) * h;
        const d = f(mx, my, mz);
        if (Math.abs(d) <= half * slack + h) active.push(i + bx * (j + by * k));
      }
    }
  }

  // 2. the field at every corner of every active block (corners shared by two blocks are asked twice)
  const C = B + 1;
  const values = new Map<number, Float32Array>();
  for (const b of active) {
    const i = b % bx, j = Math.floor(b / bx) % by, k = Math.floor(b / (bx * by));
    const v = new Float32Array(C * C * C);
    for (let c = 0; c < C; c++) {
      const gz = Math.min(k * B + c, cz);
      const pz = z0 + gz * h;
      for (let bb = 0; bb < C; bb++) {
        const gy = Math.min(j * B + bb, cy);
        const py = y0 + gy * h;
        for (let a = 0; a < C; a++) {
          const gx = Math.min(i * B + a, cx);
          v[a + C * (bb + C * c)] = f(x0 + gx * h, py, pz);
        }
      }
    }
    values.set(b, v);
  }

  // the value at grid corner (gx, gy, gz), from whichever active block holds it
  const valueAt = (gx: number, gy: number, gz: number): number => {
    let i = Math.floor(gx / B), j = Math.floor(gy / B), k = Math.floor(gz / B);
    if (i >= bx) i = bx - 1;
    if (j >= by) j = by - 1;
    if (k >= bz) k = bz - 1;
    const v = values.get(i + bx * (j + by * k));
    if (v) return v[(gx - i * B) + C * ((gy - j * B) + C * (gz - k * B))];
    // a corner of a block left empty (rare: on its face): ask the field
    return f(x0 + gx * h, y0 + gy * h, z0 + gz * h);
  };

  // 3. a vertex in each cell the surface passes through
  const cellVertex = new Map<number, number>();
  const pos: number[] = [];
  const corner = new Float64Array(8);
  const EDGES = [
    [0, 1], [2, 3], [4, 5], [6, 7], // along x
    [0, 2], [1, 3], [4, 6], [5, 7], // along y
    [0, 4], [1, 5], [2, 6], [3, 7], // along z
  ];
  const cornerOff = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  for (const b of active) {
    const bi = b % bx, bj = Math.floor(b / bx) % by, bk = Math.floor(b / (bx * by));
    const v = values.get(b)!;
    for (let c = 0; c < B; c++) {
      const gz = bk * B + c;
      if (gz >= cz) break;
      for (let bb = 0; bb < B; bb++) {
        const gy = bj * B + bb;
        if (gy >= cy) break;
        for (let a = 0; a < B; a++) {
          const gx = bi * B + a;
          if (gx >= cx) break;
          let mask = 0;
          for (let q = 0; q < 8; q++) {
            const o2 = cornerOff[q];
            const val = v[(a + o2[0]) + C * ((bb + o2[1]) + C * (c + o2[2]))];
            corner[q] = val;
            if (val < 0) mask |= 1 << q;
          }
          if (mask === 0 || mask === 255) continue;
          let sx = 0, sy = 0, sz = 0, n = 0;
          for (const [p, q] of EDGES) {
            const vp = corner[p], vq = corner[q];
            if ((vp < 0) === (vq < 0)) continue;
            const t = vp / (vp - vq);
            const op = cornerOff[p], oq = cornerOff[q];
            sx += op[0] + (oq[0] - op[0]) * t;
            sy += op[1] + (oq[1] - op[1]) * t;
            sz += op[2] + (oq[2] - op[2]) * t;
            n++;
          }
          const id = gx + cx * (gy + cy * gz);
          cellVertex.set(id, pos.length / 3);
          pos.push(x0 + (gx + sx / n) * h, y0 + (gy + sy / n) * h, z0 + (gz + sz / n) * h);
        }
      }
    }
  }

  // 4. a quad round every edge the surface crosses (each edge seen from the cell at its low corner)
  const idx: number[] = [];
  const P = pos;
  const quad = (a: number, b: number, c: number, d: number) => {
    // split along the shorter diagonal
    const ac = (P[a * 3] - P[c * 3]) ** 2 + (P[a * 3 + 1] - P[c * 3 + 1]) ** 2 + (P[a * 3 + 2] - P[c * 3 + 2]) ** 2;
    const bd = (P[b * 3] - P[d * 3]) ** 2 + (P[b * 3 + 1] - P[d * 3 + 1]) ** 2 + (P[b * 3 + 2] - P[d * 3 + 2]) ** 2;
    if (ac <= bd) idx.push(a, b, c, a, c, d);
    else idx.push(a, b, d, b, c, d);
  };
  const cell = (gx: number, gy: number, gz: number): number => {
    if (gx < 0 || gy < 0 || gz < 0 || gx >= cx || gy >= cy || gz >= cz) return -1;
    return cellVertex.get(gx + cx * (gy + cy * gz)) ?? -1;
  };
  for (const [id] of cellVertex) {
    const gx = id % cx, gy = Math.floor(id / cx) % cy, gz = Math.floor(id / (cx * cy));
    const v0 = valueAt(gx, gy, gz);
    const inside = v0 < 0;
    // the edge along x from this corner: shared by the cells (gx, gy-1..gy, gz-1..gz)
    if (gy > 0 && gz > 0 && (valueAt(gx + 1, gy, gz) < 0) !== inside) {
      const a = cell(gx, gy - 1, gz - 1), b = cell(gx, gy, gz - 1), c = cell(gx, gy, gz), d = cell(gx, gy - 1, gz);
      if (a >= 0 && b >= 0 && c >= 0 && d >= 0) {
        if (inside) quad(a, b, c, d);
        else quad(a, d, c, b);
      }
    }
    if (gx > 0 && gz > 0 && (valueAt(gx, gy + 1, gz) < 0) !== inside) {
      const a = cell(gx - 1, gy, gz - 1), b = cell(gx - 1, gy, gz), c = cell(gx, gy, gz), d = cell(gx, gy, gz - 1);
      if (a >= 0 && b >= 0 && c >= 0 && d >= 0) {
        if (inside) quad(a, b, c, d);
        else quad(a, d, c, b);
      }
    }
    if (gx > 0 && gy > 0 && (valueAt(gx, gy, gz + 1) < 0) !== inside) {
      const a = cell(gx - 1, gy - 1, gz), b = cell(gx, gy - 1, gz), c = cell(gx, gy, gz), d = cell(gx - 1, gy, gz);
      if (a >= 0 && b >= 0 && c >= 0 && d >= 0) {
        if (inside) quad(a, b, c, d);
        else quad(a, d, c, b);
      }
    }
  }

  const positions = new Float64Array(pos);
  // 5. onto the surface
  const steps = o.project ?? 2;
  if (steps > 0) {
    const e = h * 0.25;
    for (let i = 0; i < positions.length; i += 3) {
      let x = positions[i], y = positions[i + 1], z = positions[i + 2];
      for (let s = 0; s < steps; s++) {
        const d = f(x, y, z);
        if (Math.abs(d) < 1e-7) break;
        let gx = f(x + e, y, z) - f(x - e, y, z);
        let gy = f(x, y + e, z) - f(x, y - e, z);
        let gz = f(x, y, z + e) - f(x, y, z - e);
        const l = Math.hypot(gx, gy, gz);
        if (l < 1e-12) break;
        gx /= l; gy /= l; gz /= l;
        // never further than half a cell, so a thin part cannot be pulled through to its far side
        const step = Math.max(-h * 0.5, Math.min(h * 0.5, d));
        x -= gx * step; y -= gy * step; z -= gz * step;
      }
      positions[i] = x; positions[i + 1] = y; positions[i + 2] = z;
    }
  }
  return { positions, indices: new Uint32Array(idx) };
}

/** Area-weighted vertex normals of a triangle mesh. */
export function vertexNormals(positions: ArrayLike<number>, indices: ArrayLike<number>): Float32Array {
  const n = new Float32Array(positions.length);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) { n[i] += nx; n[i + 1] += ny; n[i + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}

/** Normals from the field itself: smooth whatever the triangles are. */
export function fieldNormals(f: Field, positions: ArrayLike<number>, e: number): Float32Array {
  const n = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    const gx = f(x + e, y, z) - f(x - e, y, z);
    const gy = f(x, y + e, z) - f(x, y - e, z);
    const gz = f(x, y, z + e) - f(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    n[i] = gx / l; n[i + 1] = gy / l; n[i + 2] = gz / l;
  }
  return n;
}

/** Joins vertices closer than eps (surface nets makes none, but meshes put together from parts may). */
export function meshStats(m: RawMesh): { vertices: number; triangles: number; boundaryEdges: number; nonManifoldEdges: number } {
  const edges = new Map<string, number>();
  for (let t = 0; t < m.indices.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = m.indices[t + e], b = m.indices[t + ((e + 1) % 3)];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  let boundary = 0, nonManifold = 0;
  for (const c of edges.values()) {
    if (c === 1) boundary++;
    else if (c > 2) nonManifold++;
  }
  return { vertices: m.positions.length / 3, triangles: m.indices.length / 3, boundaryEdges: boundary, nonManifoldEdges: nonManifold };
}
