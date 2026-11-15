/**
 * Builds a flat-painted model out of coloured primitives, straight into one set of arrays: a
 * roadside building is several hundred boards, sheets and bars, and it is built while driving, so
 * every primitive is a handful of numbers written once — no geometry object per board.
 *
 * Same vocabulary as the vehicle kit's builder (box, span, cyl, bar, hull, loft, within …), same
 * frame conventions; triangles are written unindexed with their own flat normals.
 */
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

export type Paint = number | THREE.Color;

export interface Turn {
  /** rotations in radians about the part's own centre, applied in the order x, y, z */
  rx?: number;
  ry?: number;
  rz?: number;
}

const tmpColor = new THREE.Color();
const tmpEuler = new THREE.Euler();
const tmpMat = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();
const linear = new Map<number, readonly [number, number, number]>();

/** the corners of a unit cube and its faces, wound to face outwards */
const CUBE = [
  [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
] as const;
const FACES = [
  [1, 0, 3, 2], // −z
  [4, 5, 6, 7], // +z
  [0, 4, 7, 3], // −x
  [5, 1, 2, 6], // +x
  [3, 7, 6, 2], // +y
  [0, 1, 5, 4], // −y
] as const;

/** an icosahedron: a sack, a stone */
const ICO = (() => {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(([x, y, z]) => {
    const l = Math.hypot(x, y, z);
    return [x / l, y / l, z / l];
  });
  const f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  return { v, f };
})();

export class PaintBuilder {
  private pos: number[] = [];
  private col: number[] = [];
  /** the frame parts are being placed in (column-major 4×4), or null for none */
  private xf: number[] | null = null;
  private r = 0;
  private g = 0;
  private b = 0;

  private paint(c: Paint): void {
    if (typeof c === 'number') {
      let l = linear.get(c);
      if (!l) {
        tmpColor.set(c);
        linear.set(c, (l = [tmpColor.r, tmpColor.g, tmpColor.b]));
      }
      this.r = l[0];
      this.g = l[1];
      this.b = l[2];
    } else {
      this.r = c.r;
      this.g = c.g;
      this.b = c.b;
    }
  }

  /** one vertex, in the current frame */
  private vert(x: number, y: number, z: number): void {
    const m = this.xf;
    if (m) this.pos.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
    else this.pos.push(x, y, z);
    this.col.push(this.r, this.g, this.b);
  }

  private tri(a: readonly number[], b: readonly number[], c: readonly number[]): void {
    this.vert(a[0], a[1], a[2]);
    this.vert(b[0], b[1], b[2]);
    this.vert(c[0], c[1], c[2]);
  }

  private quad(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[]): void {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  /** run `fn` with every part it adds placed by `m`, inside the frame already in force */
  within(m: THREE.Matrix4, fn: () => void): this {
    const prev = this.xf;
    this.xf = prev ? tmpMat.fromArray(prev).multiply(m).toArray() : m.toArray();
    try {
      fn();
    } finally {
      this.xf = prev;
    }
    return this;
  }

  /** a box given by its centre and size, turned about its centre if asked */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: Paint, o?: Turn): this {
    this.paint(color);
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const c: number[][] = [];
    if (o && (o.rx || o.ry || o.rz)) {
      tmpEuler.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, 'XYZ');
      const e = tmpMat.makeRotationFromEuler(tmpEuler).elements;
      for (const [x, y, z] of CUBE) {
        const px = x * hx;
        const py = y * hy;
        const pz = z * hz;
        c.push([cx + e[0] * px + e[4] * py + e[8] * pz, cy + e[1] * px + e[5] * py + e[9] * pz, cz + e[2] * px + e[6] * py + e[10] * pz]);
      }
    } else {
      for (const [x, y, z] of CUBE) c.push([cx + x * hx, cy + y * hy, cz + z * hz]);
    }
    for (const f of FACES) this.quad(c[f[0]], c[f[1]], c[f[2]], c[f[3]]);
    return this;
  }

  /** a box given by its two corners */
  span(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: Paint): this {
    return this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), color);
  }

  /** a cylinder (or a cone, or a taper) standing along its own y, turned about its centre if asked */
  cyl(cx: number, cy: number, cz: number, radius: number, length: number, color: Paint, o?: Turn & { segments?: number; radiusTop?: number }): this {
    this.paint(color);
    const n = o?.segments ?? 12;
    const rt = o?.radiusTop ?? radius;
    let e: number[] | null = null;
    if (o && (o.rx || o.ry || o.rz)) {
      tmpEuler.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, 'XYZ');
      e = tmpMat.makeRotationFromEuler(tmpEuler).toArray();
    }
    const at = (x: number, y: number, z: number): number[] => (e ? [cx + e[0] * x + e[4] * y + e[8] * z, cy + e[1] * x + e[5] * y + e[9] * z, cz + e[2] * x + e[6] * y + e[10] * z] : [cx + x, cy + y, cz + z]);
    const h = length / 2;
    const top = at(0, h, 0);
    const bot = at(0, -h, 0);
    let pa = at(0, -h, radius);
    let pb = at(0, h, rt);
    for (let i = 1; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const s = Math.sin(a);
      const c = Math.cos(a);
      const qa = at(s * radius, -h, c * radius);
      const qb = at(s * rt, h, c * rt);
      this.quad(pa, qa, qb, pb);
      if (rt > 1e-4) this.tri(top, pb, qb);
      if (radius > 1e-4) this.tri(bot, qa, pa);
      pa = qa;
      pb = qb;
    }
    return this;
  }

  /** a straight bar of square section between two points */
  bar(ax: number, ay: number, az: number, bx: number, by: number, bz: number, thick: number, color: Paint): this {
    this.paint(color);
    tmpV.set(bx - ax, by - ay, bz - az);
    const len = tmpV.length();
    if (len < 1e-6) return this;
    tmpQuat.setFromUnitVectors(UP, tmpV.multiplyScalar(1 / len));
    const e = tmpMat.makeRotationFromQuaternion(tmpQuat).elements;
    const cx = (ax + bx) / 2;
    const cy = (ay + by) / 2;
    const cz = (az + bz) / 2;
    const h = thick / 2;
    const c: number[][] = [];
    for (const [x, y, z] of CUBE) {
      const px = x * h;
      const py = (y * len) / 2;
      const pz = z * h;
      c.push([cx + e[0] * px + e[4] * py + e[8] * pz, cy + e[1] * px + e[5] * py + e[9] * pz, cz + e[2] * px + e[6] * py + e[10] * pz]);
    }
    for (const f of FACES) this.quad(c[f[0]], c[f[1]], c[f[2]], c[f[3]]);
    return this;
  }

  /** the convex solid about a set of points [x, y, z]: a car's cabin, a hull, a wedge */
  hull(points: number[][], color: Paint): this {
    this.paint(color);
    const g = new ConvexGeometry(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) this.vert(p.getX(i), p.getY(i), p.getZ(i));
    g.dispose();
    return this;
  }

  /** a triangle standing in the zy plane, given thickness along x from x0 to x1: a gable */
  gable(x0: number, x1: number, z0: number, z1: number, y0: number, yTop: number, color: Paint): this {
    this.paint(color);
    const lo = Math.min(x0, x1);
    const hi = Math.max(x0, x1);
    const zm = (z0 + z1) / 2;
    const a0 = [lo, y0, z0];
    const b0 = [lo, y0, z1];
    const c0 = [lo, yTop, zm];
    const a1 = [hi, y0, z0];
    const b1 = [hi, y0, z1];
    const c1 = [hi, yTop, zm];
    this.tri(a0, b0, c0);
    this.tri(b1, a1, c1);
    this.quad(a1, a0, c0, c1);
    this.quad(b0, b1, c1, c0);
    this.quad(a0, a1, b1, b0);
    return this;
  }

  /** a ball of twenty faces */
  sphere(cx: number, cy: number, cz: number, radius: number, color: Paint): this {
    this.paint(color);
    for (const [i, j, k] of ICO.f) {
      const a = ICO.v[i];
      const b = ICO.v[j];
      const c = ICO.v[k];
      this.vert(cx + a[0] * radius, cy + a[1] * radius, cz + a[2] * radius);
      this.vert(cx + b[0] * radius, cy + b[1] * radius, cz + b[2] * radius);
      this.vert(cx + c[0] * radius, cy + c[1] * radius, cz + c[2] * radius);
    }
    return this;
  }

  /** a ball of twenty faces squashed or stretched along the axes: a bush, a drift of sand, a heap */
  mound(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, color: Paint): this {
    this.paint(color);
    for (const [i, j, k] of ICO.f) {
      const a = ICO.v[i];
      const b = ICO.v[j];
      const c = ICO.v[k];
      this.vert(cx + a[0] * rx, cy + a[1] * ry, cz + a[2] * rz);
      this.vert(cx + b[0] * rx, cy + b[1] * ry, cz + b[2] * rz);
      this.vert(cx + c[0] * rx, cy + c[1] * ry, cz + c[2] * rz);
    }
    return this;
  }

  /** a skin through a row of sections (polylines of [x, y, z], all the same length), drawn on both faces: canvas */
  loft(sections: number[][][], color: Paint): this {
    this.paint(color);
    const n = sections[0].length;
    for (let s = 0; s + 1 < sections.length; s++) {
      const A = sections[s];
      const B = sections[s + 1];
      for (let i = 0; i + 1 < n; i++) {
        this.quad(A[i], A[i + 1], B[i + 1], B[i]);
        this.quad(A[i], B[i], B[i + 1], A[i + 1]);
      }
    }
    return this;
  }

  /** triangles so far */
  get triangles(): number {
    return this.pos.length / 9;
  }

  build(): THREE.BufferGeometry {
    const pos = new Float32Array(this.pos);
    const nrm = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i += 9) {
      const ux = pos[i + 3] - pos[i];
      const uy = pos[i + 4] - pos[i + 1];
      const uz = pos[i + 5] - pos[i + 2];
      const vx = pos[i + 6] - pos[i];
      const vy = pos[i + 7] - pos[i + 1];
      const vz = pos[i + 8] - pos[i + 2];
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      for (let k = 0; k < 9; k += 3) {
        nrm[i + k] = nx;
        nrm[i + k + 1] = ny;
        nrm[i + k + 2] = nz;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    this.pos = [];
    this.col = [];
    return g;
  }
}
