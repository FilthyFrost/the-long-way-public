/**
 * Tiny helper for building low-poly models from coloured primitives and merging them into
 * one geometry per material (one draw call for a whole vehicle body).
 */
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const tmpColor = new THREE.Color();
const tmpMat = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();

/** a 2D outline: [u, v] points in order round the edge */
export type Outline = [number, number][];

/** reverse the winding of a non-indexed geometry (after a mirroring transform) */
function flipWinding(g: THREE.BufferGeometry): void {
  for (const name of Object.keys(g.attributes)) {
    const a = g.getAttribute(name) as THREE.BufferAttribute;
    const k = a.itemSize;
    const arr = a.array as Float32Array;
    for (let t = 0; t + 2 < a.count; t += 3) {
      for (let c = 0; c < k; c++) {
        const i1 = (t + 1) * k + c;
        const i2 = (t + 2) * k + c;
        const v = arr[i1];
        arr[i1] = arr[i2];
        arr[i2] = v;
      }
    }
  }
}

/** colour every vertex of a geometry */
function paint(g: THREE.BufferGeometry, color: THREE.ColorRepresentation): void {
  tmpColor.set(color);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = tmpColor.r;
    col[i * 3 + 1] = tmpColor.g;
    col[i * 3 + 2] = tmpColor.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

export interface PartOpts {
  /** rotations in radians, applied in order x, y, z about the part centre */
  rx?: number;
  ry?: number;
  rz?: number;
}

export class ModelBuilder {
  private parts: THREE.BufferGeometry[] = [];
  private xf: THREE.Matrix4 | null = null;

  /** every part added from now on is also moved by this matrix (null = none): place a whole prop at once */
  transform(m: THREE.Matrix4 | null): this {
    this.xf = m ? m.clone() : null;
    return this;
  }

  /**
   * Run `fn` with every part it adds also moved by `m`, on top of the transform already set:
   * nested props place their own parts in their own frame.
   */
  within(m: THREE.Matrix4, fn: () => void): this {
    const prev = this.xf;
    this.xf = prev ? prev.clone().multiply(m) : m.clone();
    try {
      fn();
    } finally {
      this.xf = prev;
    }
    return this;
  }

  private finish(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, local: THREE.Matrix4 | null): void {
    if (local) g.applyMatrix4(local);
    if (this.xf) g.applyMatrix4(this.xf);
    // a mirroring transform turns the faces inside out: put them back
    const det = (local ? local.determinant() : 1) * (this.xf ? this.xf.determinant() : 1);
    if (det < 0) flipWinding(g);
    paint(g, color);
    g.deleteAttribute('uv');
    this.parts.push(g);
  }

  private push(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, cx: number, cy: number, cz: number, o: PartOpts = {}): void {
    const g = geo.index ? geo.toNonIndexed() : geo;
    tmpEuler.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, 'XYZ');
    tmpQuat.setFromEuler(tmpEuler);
    tmpMat.compose(new THREE.Vector3(cx, cy, cz), tmpQuat, new THREE.Vector3(1, 1, 1));
    this.finish(g, color, tmpMat);
  }

  /**
   * A flat outline (with holes) drawn in one of the axis planes and given thickness along the third
   * axis, from d0 to d1: walls with windows cut out of them, shaped panels, arches.
   * 'xy' = side walls (u = x, v = y, thickness along z), 'zy' = ends (u = z, v = y, along x),
   * 'xz' = floors and roofs (u = x, v = z, along y).
   */
  prism(plane: 'xy' | 'zy' | 'xz', outer: Outline, holes: Outline[], d0: number, d1: number, color: THREE.ColorRepresentation, curveSegments = 2): this {
    const shape = new THREE.Shape(outer.map(([u, v]) => new THREE.Vector2(u, v)));
    for (const h of holes) shape.holes.push(new THREE.Path(h.map(([u, v]) => new THREE.Vector2(u, v))));
    const depth = Math.abs(d1 - d0);
    const g0 = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments });
    const g = g0.index ? g0.toNonIndexed() : g0;
    const lo = Math.min(d0, d1);
    const m = new THREE.Matrix4();
    if (plane === 'xy') m.makeTranslation(0, 0, lo);
    else if (plane === 'zy') m.makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)).setPosition(lo, 0, 0);
    else m.makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)).setPosition(0, lo, 0);
    this.finish(g, color, m);
    return this;
  }

  /** the convex solid around a set of points [x, y, z]: wedges, bevelled corners, cushions */
  hull(points: number[][], color: THREE.ColorRepresentation): this {
    const g = new ConvexGeometry(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    this.finish(g, color, null);
    return this;
  }

  /**
   * A skin through a row of sections (each a polyline of [x, y, z] points, all the same length),
   * drawn on both faces: the rounded roof of a body, a canvas, a curtain.
   */
  loft(sections: number[][][], color: THREE.ColorRepresentation, closed = false): this {
    const pos: number[] = [];
    const n = sections[0].length;
    const segs = closed ? n : n - 1;
    for (let s = 0; s + 1 < sections.length; s++) {
      const A = sections[s];
      const B = sections[s + 1];
      for (let i = 0; i < segs; i++) {
        const j = (i + 1) % n;
        const a = A[i], b = A[j], c = B[j], d = B[i];
        pos.push(...a, ...b, ...c, ...a, ...c, ...d); // one face
        pos.push(...a, ...c, ...b, ...a, ...d, ...c); // and the other
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    this.finish(g, color, null);
    return this;
  }

  /** any geometry, coloured and placed like the primitives */
  geo(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, cx: number, cy: number, cz: number, o?: PartOpts): this {
    this.push(g, color, cx, cy, cz, o);
    return this;
  }

  /** axis-aligned box given by centre and size */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: THREE.ColorRepresentation, o?: PartOpts): this {
    this.push(new THREE.BoxGeometry(sx, sy, sz), color, cx, cy, cz, o);
    return this;
  }

  /** box given by its min / max corners */
  span(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: THREE.ColorRepresentation): this {
    return this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), color);
  }

  /** cylinder along the local y axis before rotation */
  cyl(cx: number, cy: number, cz: number, radius: number, length: number, color: THREE.ColorRepresentation, o?: PartOpts & { segments?: number; radiusTop?: number }): this {
    this.push(new THREE.CylinderGeometry(o?.radiusTop ?? radius, radius, length, o?.segments ?? 12), color, cx, cy, cz, o);
    return this;
  }

  /** straight bar between two points with a square section */
  bar(ax: number, ay: number, az: number, bx: number, by: number, bz: number, thick: number, color: THREE.ColorRepresentation): this {
    const d = new THREE.Vector3(bx - ax, by - ay, bz - az);
    const len = d.length();
    const g = new THREE.BoxGeometry(thick, len, thick).toNonIndexed();
    tmpQuat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    tmpMat.compose(new THREE.Vector3((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), tmpQuat, new THREE.Vector3(1, 1, 1));
    this.finish(g, color, tmpMat);
    return this;
  }

  sphere(cx: number, cy: number, cz: number, radius: number, color: THREE.ColorRepresentation, detail = 1): this {
    this.push(new THREE.IcosahedronGeometry(radius, detail), color, cx, cy, cz);
    return this;
  }

  torus(cx: number, cy: number, cz: number, radius: number, tube: number, color: THREE.ColorRepresentation, o?: PartOpts): this {
    this.push(new THREE.TorusGeometry(radius, tube, 8, 28), color, cx, cy, cz, o);
    return this;
  }

  /** a geometry built by another builder (already coloured), moved by the current transform */
  add(geo: THREE.BufferGeometry): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (this.xf) {
      g.applyMatrix4(this.xf);
      if (this.xf.determinant() < 0) flipWinding(g);
    }
    this.parts.push(g);
    return this;
  }

  get count(): number {
    return this.parts.length;
  }

  build(): THREE.BufferGeometry {
    if (this.parts.length === 0) {
      const e = new THREE.BufferGeometry();
      e.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
      e.setAttribute('normal', new THREE.Float32BufferAttribute([], 3));
      e.setAttribute('color', new THREE.Float32BufferAttribute([], 3));
      e.computeBoundingSphere();
      e.computeBoundingBox();
      return e;
    }
    const merged = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    return merged;
  }
}
