/**
 * Things lying in the world, drawn: every loose thing and everything lying in an open container
 * within 90 m, baked into ONE mesh (one draw call however many there are), rebuilt only when
 * something is taken, put down or opened, or when the player has moved 30 m. A stack lying about
 * shows up to three of its things. Nothing near: the mesh is hidden and costs nothing.
 *
 * And the thing in the hands, in first person: a medium thing low on the right, swaying with the
 * walk; a big thing held in both arms low in the middle, hiding part of the view.
 */
import * as THREE from 'three';
import { item } from '../../core/items/catalog';
import type { Containers } from '../../core/items/containers';
import type { LooseItems } from '../../core/items/loose';
import { SHAPE_SIZE, sizeOf } from '../../core/items/shapes';
import { surfaceMaterial } from '../render/materials';
import type { RenderCore } from '../render/core';
import { bakeTinted, vertexCount } from './shapes3d';

const RANGE = 90;
const MOVE = 30;

export class ItemsView {
  readonly mesh: THREE.Mesh;
  private readonly geo = new THREE.BufferGeometry();
  private cx = NaN;
  private cz = NaN;
  private cy = 0;
  private lastLoose = -1;
  private lastBox = -1;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly p = { x: 0, y: 0, z: 0 };
  /** how many things are drawn (for the tests and telemetry) */
  drawn = 0;

  constructor(
    readonly core: RenderCore,
    readonly loose: LooseItems,
    readonly containers: Containers,
  ) {
    this.mesh = new THREE.Mesh(this.geo, surfaceMaterial({ vertexColors: true, ink: true }));
    this.mesh.name = 'player.items';
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    core.scene.add(this.mesh);
  }

  update(fx: number, fy: number, fz: number): void {
    const moved = !(Math.hypot(fx - this.cx, fz - this.cz) < MOVE);
    if (moved || this.loose.version !== this.lastLoose || this.containers.version !== this.lastBox) this.rebuild(fx, fy, fz);
    if (this.mesh.visible) this.core.place(this.mesh, this.cx, this.cy, this.cz);
  }

  private each(fn: (id: string, x: number, y: number, z: number, heading: number, copy: number) => void): void {
    const r2 = RANGE * RANGE;
    for (const l of this.loose.all()) {
      if ((l.x - this.cx) ** 2 + (l.z - this.cz) ** 2 > r2) continue;
      const n = Math.min(3, l.n);
      for (let k = 0; k < n; k++) fn(l.id, l.x, l.y, l.z, l.heading, k);
    }
    for (const c of this.containers.all()) {
      if (!c.opened || (c.def.x - this.cx) ** 2 + (c.def.z - this.cz) ** 2 > r2) continue;
      c.store.slots.forEach((s, i) => {
        if (!s) return;
        c.shelfPoint(i, this.p);
        const n = Math.min(2, s.n);
        for (let k = 0; k < n; k++) fn(s.id, this.p.x, this.p.y, this.p.z, c.def.heading + i * 0.7, k);
      });
    }
  }

  private rebuild(fx: number, fy: number, fz: number): void {
    this.cx = fx;
    this.cy = fy;
    this.cz = fz;
    this.lastLoose = this.loose.version;
    this.lastBox = this.containers.version;
    let verts = 0;
    let count = 0;
    this.each((id) => {
      verts += vertexCount(item(id).shape);
      count++;
    });
    this.drawn = count;
    if (count === 0) {
      this.mesh.visible = false;
      return;
    }
    const pos = new Float32Array(verts * 3);
    const nor = new Float32Array(verts * 3);
    const col = new Float32Array(verts * 3);
    let at = 0;
    this.each((id, x, y, z, heading, k) => {
      const d = item(id);
      const sz = sizeOf(id);
      // copies of a stack lie beside the first, a little turned
      const off = k === 0 ? 0 : (k === 1 ? 1 : -1) * (Math.max(sz.hx, sz.hz) * 2.1 + 0.01);
      const hh = heading + k * 0.6;
      const ox = -Math.sin(heading) * off;
      const oz = Math.cos(heading) * off;
      // three turns the other way round: yaw a = −heading puts +x along (cos h, sin h)
      this.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, -hh);
      this.m.compose(this.v.set(x + ox - this.cx, y - this.cy, z + oz - this.cz), this.q, this.one);
      at += bakeTinted(d.shape, d.tint, this.m, pos, nor, col, at, bigScale(id));
    });
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.geo.computeBoundingSphere();
    this.mesh.visible = true;
  }
}

/** how much bigger than its plain shape a thing is drawn (a whole duck, a pike: core/items/shapes.ts) */
export function bigScale(id: string): number {
  return sizeOf(id).hx / SHAPE_SIZE[item(id).shape].hx;
}

/** the thing in the hands, drawn in first person in front of the camera */
export class HeldView {
  readonly mesh: THREE.Mesh;
  private readonly geo = new THREE.BufferGeometry();
  private id: string | null = null;
  private readonly m = new THREE.Matrix4();
  private readonly off = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();

  constructor(readonly core: RenderCore) {
    this.mesh = new THREE.Mesh(this.geo, surfaceMaterial({ vertexColors: true, ink: true, fog: false }));
    this.mesh.name = 'player.held';
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    core.scene.add(this.mesh);
  }

  /**
   * @param id what is in the hands (null = nothing)
   * @param sway the walk's side-to-side (m), bob its up-and-down (m)
   */
  update(id: string | null, cam: THREE.Camera, sway: number, bob: number): void {
    if (id !== this.id) {
      this.id = id;
      if (id) this.bake(id);
    }
    this.mesh.visible = id !== null;
    if (!id) return;
    const large = item(id).size === 'large';
    const s = sizeOf(id);
    // camera space: +x right, +y up, −z ahead
    if (large) this.off.set(sway * 0.5, -0.36 - s.h * 0.25 + bob * 0.6, -0.62);
    else this.off.set(0.34 + sway, -0.26 - s.h * 0.4 + bob, -0.62);
    this.off.applyQuaternion(cam.quaternion).add(cam.position);
    this.mesh.position.copy(this.off);
    // lies across the arms (large), or held upright turned a little inward (medium)
    this.e.set(large ? 0.35 : -0.5, large ? 0 : 0.45, large ? 0 : 0.05);
    this.q.setFromEuler(this.e);
    this.mesh.quaternion.copy(cam.quaternion).multiply(this.q);
  }

  private bake(id: string): void {
    const d = item(id);
    const n = vertexCount(d.shape);
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const s = sizeOf(id);
    // centred on its middle so it turns about itself
    this.m.makeTranslation(0, -s.h / 2, 0);
    bakeTinted(d.shape, d.tint, this.m, pos, nor, col, 0, bigScale(id));
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.geo.computeBoundingSphere();
  }
}
