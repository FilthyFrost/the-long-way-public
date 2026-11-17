/**
 * A ray against a mesh's triangles, quickly: the triangles sorted once into a uniform grid over the geometry's
 * box (about two to a cell), the ray walked through the cells it crosses (Amanatides & Woo) and tested only
 * against what is in them. For aiming a cleaning tool at the exact point of a part (src/game/modcar/grime.ts),
 * where three's Raycaster would test every triangle of a body every frame.
 *
 *   const g = triGrid(mesh.geometry);          // built on first use, kept with the geometry
 *   const hit = g.cast(localOrigin, localDir, far);   // in the geometry's own space
 */
import * as THREE from 'three';

export interface TriHit {
  /** distance along the (local) ray */
  t: number;
  /** the triangle (its first index in the index buffer / 3) */
  tri: number;
  /** barycentric weights of its 2nd and 3rd corners */
  u: number;
  v: number;
}

export class TriGrid {
  private readonly pos: Float32Array | ArrayLike<number>;
  private readonly idx: ArrayLike<number> | null;
  readonly triangles: number;
  private readonly lo = new THREE.Vector3();
  private readonly cell = new THREE.Vector3();
  private readonly dims: [number, number, number];
  private readonly start: Int32Array;
  private readonly list: Int32Array;
  private readonly stamp: Uint32Array;
  private ray = 0;

  constructor(geometry: THREE.BufferGeometry) {
    const p = geometry.getAttribute('position') as THREE.BufferAttribute;
    // (interleaved or normalised positions come out as plain floats)
    const flat = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      flat[i * 3] = p.getX(i);
      flat[i * 3 + 1] = p.getY(i);
      flat[i * 3 + 2] = p.getZ(i);
    }
    this.pos = flat;
    this.idx = geometry.index ? geometry.index.array : null;
    const n = this.idx ? this.idx.length / 3 : p.count / 3;
    this.triangles = Math.floor(n);
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = geometry.boundingBox!.clone().expandByScalar(1e-4);
    this.lo.copy(box.min);
    const size = box.getSize(new THREE.Vector3());
    // about two triangles to a cell, the cells as near cubes as the box allows
    const vol = Math.max(size.x * size.y * size.z, 1e-9);
    const want = Math.max(1, this.triangles / 2);
    const edge = Math.cbrt(vol / want);
    const d = (x: number): number => Math.max(1, Math.min(128, Math.ceil(x / Math.max(edge, 1e-6))));
    this.dims = [d(size.x), d(size.y), d(size.z)];
    this.cell.set(size.x / this.dims[0], size.y / this.dims[1], size.z / this.dims[2]);
    const cells = this.dims[0] * this.dims[1] * this.dims[2];
    const count = new Int32Array(cells + 1);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const range = (t: number): [number, number, number, number, number, number] => {
      this.corner(t, 0, a);
      this.corner(t, 1, b);
      this.corner(t, 2, c);
      const x0 = this.ci(Math.min(a.x, b.x, c.x), 0);
      const x1 = this.ci(Math.max(a.x, b.x, c.x), 0);
      const y0 = this.ci(Math.min(a.y, b.y, c.y), 1);
      const y1 = this.ci(Math.max(a.y, b.y, c.y), 1);
      const z0 = this.ci(Math.min(a.z, b.z, c.z), 2);
      const z1 = this.ci(Math.max(a.z, b.z, c.z), 2);
      return [x0, x1, y0, y1, z0, z1];
    };
    const [dx, dy] = this.dims;
    for (let t = 0; t < this.triangles; t++) {
      const [x0, x1, y0, y1, z0, z1] = range(t);
      for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) count[(z * dy + y) * dx + x + 1]++;
    }
    for (let i = 0; i < cells; i++) count[i + 1] += count[i];
    this.start = count;
    this.list = new Int32Array(count[cells]);
    const fill = count.slice(0, cells);
    for (let t = 0; t < this.triangles; t++) {
      const [x0, x1, y0, y1, z0, z1] = range(t);
      for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.list[fill[(z * dy + y) * dx + x]++] = t;
    }
    this.stamp = new Uint32Array(this.triangles);
  }

  private ci(v: number, axis: 0 | 1 | 2): number {
    const lo = axis === 0 ? this.lo.x : axis === 1 ? this.lo.y : this.lo.z;
    const s = axis === 0 ? this.cell.x : axis === 1 ? this.cell.y : this.cell.z;
    return Math.max(0, Math.min(this.dims[axis] - 1, Math.floor((v - lo) / s)));
  }

  /** a corner of a triangle (local space) */
  corner(tri: number, k: 0 | 1 | 2, out: THREE.Vector3): THREE.Vector3 {
    const i = this.idx ? this.idx[tri * 3 + k] : tri * 3 + k;
    const p = this.pos;
    return out.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
  }

  /** the vertex index of a triangle's corner */
  vertex(tri: number, k: 0 | 1 | 2): number {
    return this.idx ? this.idx[tri * 3 + k] : tri * 3 + k;
  }

  private readonly e1 = new THREE.Vector3();
  private readonly e2 = new THREE.Vector3();
  private readonly pv = new THREE.Vector3();
  private readonly tv = new THREE.Vector3();
  private readonly qv = new THREE.Vector3();
  private readonly ta = new THREE.Vector3();
  private readonly tb = new THREE.Vector3();
  private readonly tc = new THREE.Vector3();

  /** Möller–Trumbore, both faces */
  private test(o: THREE.Vector3, d: THREE.Vector3, tri: number, best: TriHit): void {
    const a = this.corner(tri, 0, this.ta);
    const b = this.corner(tri, 1, this.tb);
    const c = this.corner(tri, 2, this.tc);
    const e1 = this.e1.subVectors(b, a);
    const e2 = this.e2.subVectors(c, a);
    const pv = this.pv.crossVectors(d, e2);
    const det = e1.dot(pv);
    if (Math.abs(det) < 1e-12) return;
    const inv = 1 / det;
    const tv = this.tv.subVectors(o, a);
    const u = tv.dot(pv) * inv;
    if (u < 0 || u > 1) return;
    const qv = this.qv.crossVectors(tv, e1);
    const v = d.dot(qv) * inv;
    if (v < 0 || u + v > 1) return;
    const t = e2.dot(qv) * inv;
    if (t <= 1e-6 || t >= best.t) return;
    best.t = t;
    best.tri = tri;
    best.u = u;
    best.v = v;
  }

  /** the nearest triangle the ray o + t·d (local space, d unit) meets within far, or null */
  cast(o: THREE.Vector3, d: THREE.Vector3, far: number): TriHit | null {
    const best: TriHit = { t: far, tri: -1, u: 0, v: 0 };
    // where the ray is in the grid's box
    const hi = [this.lo.x + this.cell.x * this.dims[0], this.lo.y + this.cell.y * this.dims[1], this.lo.z + this.cell.z * this.dims[2]];
    const lo = [this.lo.x, this.lo.y, this.lo.z];
    const oa = [o.x, o.y, o.z];
    const da = [d.x, d.y, d.z];
    let t0 = 0;
    let t1 = far;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(da[k]) < 1e-12) {
        if (oa[k] < lo[k] || oa[k] > hi[k]) return null;
        continue;
      }
      let a = (lo[k] - oa[k]) / da[k];
      let b = (hi[k] - oa[k]) / da[k];
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
      if (t0 > t1) return null;
    }
    this.ray = (this.ray + 1) >>> 0;
    if (this.ray === 0) {
      this.stamp.fill(0);
      this.ray = 1;
    }
    const size = [this.cell.x, this.cell.y, this.cell.z];
    const p = [oa[0] + da[0] * t0, oa[1] + da[1] * t0, oa[2] + da[2] * t0];
    const c = [this.ci(p[0], 0), this.ci(p[1], 1), this.ci(p[2], 2)];
    const step = [0, 0, 0];
    const tMax = [Infinity, Infinity, Infinity];
    const tDelta = [Infinity, Infinity, Infinity];
    for (let k = 0; k < 3; k++) {
      if (da[k] > 1e-12) {
        step[k] = 1;
        tMax[k] = (lo[k] + (c[k] + 1) * size[k] - oa[k]) / da[k];
        tDelta[k] = size[k] / da[k];
      } else if (da[k] < -1e-12) {
        step[k] = -1;
        tMax[k] = (lo[k] + c[k] * size[k] - oa[k]) / da[k];
        tDelta[k] = -size[k] / da[k];
      }
    }
    const [dx, dy] = this.dims;
    for (let guard = 0; guard < 1024; guard++) {
      const cellI = (c[2] * dy + c[1]) * dx + c[0];
      for (let j = this.start[cellI]; j < this.start[cellI + 1]; j++) {
        const tri = this.list[j];
        if (this.stamp[tri] === this.ray) continue;
        this.stamp[tri] = this.ray;
        this.test(o, d, tri, best);
      }
      // the next cell: along the axis whose boundary comes first
      const k = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : tMax[1] < tMax[2] ? 1 : 2;
      // (a hit nearer than where this cell ends is the nearest of all)
      if (best.tri >= 0 && best.t <= tMax[k]) break;
      if (tMax[k] > t1) break;
      c[k] += step[k];
      if (c[k] < 0 || c[k] >= this.dims[k]) break;
      tMax[k] += tDelta[k];
    }
    return best.tri >= 0 ? best : null;
  }
}

const grids = new WeakMap<THREE.BufferGeometry, TriGrid>();

/** the grid of a geometry, built the first time it is asked for */
export function triGrid(g: THREE.BufferGeometry): TriGrid {
  let t = grids.get(g);
  if (!t) {
    t = new TriGrid(g);
    grids.set(g, t);
  }
  return t;
}

const inv = new THREE.Matrix4();
const lo = new THREE.Vector3();
const ld = new THREE.Vector3();
const na = new THREE.Vector3();
const nb = new THREE.Vector3();
const nc = new THREE.Vector3();

/**
 * A world-space ray against one mesh: the distance (world), the point and the face's normal (world, turned to
 * face the ray's origin side as drawn), or null.
 */
export function castMesh(mesh: THREE.Mesh, origin: THREE.Vector3, dir: THREE.Vector3, far: number): { dist: number; point: THREE.Vector3; normal: THREE.Vector3; tri: number } | null {
  mesh.updateWorldMatrix(true, false);
  inv.copy(mesh.matrixWorld).invert();
  lo.copy(origin).applyMatrix4(inv);
  ld.copy(dir).transformDirection(inv);
  // (the local ray's length per world metre: a scaled mesh)
  const scale = new THREE.Vector3().copy(dir).transformDirection(inv).length();
  const end = new THREE.Vector3().copy(origin).addScaledVector(dir, far).applyMatrix4(inv);
  const farL = end.distanceTo(lo);
  void scale;
  const g = triGrid(mesh.geometry);
  const h = g.cast(lo, ld, farL);
  if (!h) return null;
  const pl = new THREE.Vector3().copy(lo).addScaledVector(ld, h.t);
  const point = pl.clone().applyMatrix4(mesh.matrixWorld);
  g.corner(h.tri, 0, na);
  g.corner(h.tri, 1, nb);
  g.corner(h.tri, 2, nc);
  const n = new THREE.Vector3().subVectors(nb, na).cross(nc.sub(na)).normalize();
  // (the face's winding as drawn: a mirrored mesh turns it)
  if (mesh.matrixWorld.determinant() < 0) n.negate();
  const normal = n.transformDirection(mesh.matrixWorld);
  return { dist: point.distanceTo(origin), point, normal, tri: h.tri };
}
