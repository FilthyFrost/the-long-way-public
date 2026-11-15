/**
 * Draws the animals near the camera (core/world/fauna.ts): one small mesh, rewritten every frame.
 *
 * An animal is a dozen painted boxes — body, neck, head, four legs, ears, a tail, antlers on the
 * stags — posed from what it is doing: the neck goes down to graze and comes up to look, the legs
 * swing with its stride (in diagonal pairs at a walk, fore and hind together at a gallop), the body
 * rises and falls when it runs. A few thousand vertices at most, so the pose is simply written out
 * again each frame: no skeletons, no instancing, one draw call for every animal in sight.
 */
import * as THREE from 'three';
import type { Animal, Fauna } from '../../core/world/fauna';
import type { RenderCore } from '../render/core';
import { surfaceMaterial } from '../render/materials';
import { castShadows } from '../render/shadow';

/** boxes per animal at most, animals at most */
const BOXES = 20;
const MAX = 18;
const VERTS = BOXES * 36;

const CUBE = [
  [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
] as const;
const FACES = [
  [1, 0, 3, 2],
  [4, 5, 6, 7],
  [0, 4, 7, 3],
  [5, 1, 2, 6],
  [3, 7, 6, 2],
  [0, 1, 5, 4],
] as const;

const lin = (hex: number): [number, number, number] => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};

interface Coat {
  body: [number, number, number];
  dark: [number, number, number];
  pale: [number, number, number];
  antler: [number, number, number];
}
const COATS: Record<string, Coat> = {
  deer: { body: lin(0xa67a52), dark: lin(0x6f5038), pale: lin(0xe9dcc4), antler: lin(0xcdbb96) },
  reindeer: { body: lin(0x9a9186), dark: lin(0x5a5148), pale: lin(0xe6e2d8), antler: lin(0xd2c7ad) },
  duck: { body: lin(0x7a6248), dark: lin(0x2f5f4a), pale: lin(0xd9cdb4), antler: lin(0xe0a23c) },
};

export class FaunaView {
  private readonly pos = new Float32Array(MAX * VERTS * 3);
  private readonly col = new Float32Array(MAX * VERTS * 3);
  private readonly nrm = new Float32Array(MAX * VERTS * 3);
  private readonly geo = new THREE.BufferGeometry();
  private readonly mesh: THREE.Mesh;
  private readonly list: Animal[] = [];
  private n = 0;
  /** world anchor of the mesh, and the animal frame being written (a 3×3 turn and an origin relative to the anchor) */
  private ax = 0;
  private ay = 0;
  private az = 0;
  private fc = 1;
  private fs = 0;
  private ox = 0;
  private oy = 0;
  private oz = 0;
  private sc = 1;
  /** how many are being drawn (telemetry) */
  shown = 0;

  constructor(
    private readonly core: RenderCore,
    private readonly fauna: Fauna,
  ) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(this.geo, surfaceMaterial({ vertexColors: true, snowCap: 0 }));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.name = 'fauna';
    castShadows(this.mesh);
    core.scene.add(this.mesh);
    core.onRebase(() => core.place(this.mesh, this.ax, this.ay, this.az));
  }

  /**
   * A box in the animal's own frame (x forward, y up, z to its right), turned by `ang` about the z
   * axis through the pivot (px, py): legs swing and necks nod in the animal's own vertical plane.
   * The box hangs from the pivot: it reaches `len` along the turned −y (or +x when `along`).
   */
  private limb(px: number, py: number, pz: number, ang: number, len: number, thick: number, wide: number, c: readonly number[], along = false): void {
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const hx = along ? len / 2 : thick / 2;
    const hy = along ? thick / 2 : len / 2;
    const cx = along ? len / 2 : 0;
    const cy = along ? 0 : -len / 2;
    this.boxAt(px, py, pz, ca, sa, cx, cy, hx, hy, wide / 2, c);
  }

  /** the box itself: centre (cx, cy) and half sizes in a frame turned by (ca, sa) about z at the pivot */
  private boxAt(px: number, py: number, pz: number, ca: number, sa: number, cx: number, cy: number, hx: number, hy: number, hz: number, c: readonly number[]): void {
    if (this.n + 36 > this.pos.length / 3) return;
    const s = this.sc;
    const v: number[][] = [];
    for (const [x, y, z] of CUBE) {
      // limb frame → animal frame
      const lx = cx + x * hx;
      const ly = cy + y * hy;
      const mx = (px + lx * ca - ly * sa) * s;
      const my = (py + lx * sa + ly * ca) * s;
      const mz = (pz + z * hz) * s;
      // animal frame → world (relative to the anchor): forward is (cos h, sin h) on the plan
      v.push([this.ox + mx * this.fc - mz * this.fs, this.oy + my, this.oz + mx * this.fs + mz * this.fc]);
    }
    for (const f of FACES) {
      for (const i of [f[0], f[1], f[2], f[0], f[2], f[3]]) {
        const k = this.n * 3;
        this.pos[k] = v[i][0];
        this.pos[k + 1] = v[i][1];
        this.pos[k + 2] = v[i][2];
        this.col[k] = c[0];
        this.col[k + 1] = c[1];
        this.col[k + 2] = c[2];
        this.n++;
      }
    }
  }

  private deer(a: Animal): void {
    const coat = COATS[a.species];
    const running = a.state === 'flee';
    const moving = a.speed > 0.05;
    // legs: at a walk the diagonal pairs move together; at a gallop the fore pair, then the hind pair
    const amp = !moving ? 0 : running ? 0.85 : 0.42;
    const ph = running ? [0, 0.35, Math.PI, Math.PI + 0.35] : [0, Math.PI, Math.PI, 0];
    const bob = running ? 0.07 * Math.sin(a.stride * 2) : 0;
    const pitch = running ? 0.06 * Math.sin(a.stride * 2 + 1) : 0;
    const top = 1.0 + bob;
    const stock = a.species === 'reindeer' ? 1.12 : 1;
    // body, a paler belly, the white rump
    this.boxAt(0, top, 0, Math.cos(pitch), Math.sin(pitch), 0, -0.02, 0.58, 0.2 * stock, 0.17 * stock, coat.body);
    this.boxAt(0, top, 0, Math.cos(pitch), Math.sin(pitch), -0.02, -0.2 * stock, 0.5, 0.05, 0.15 * stock, coat.pale);
    this.boxAt(0, top, 0, Math.cos(pitch), Math.sin(pitch), -0.585, 0.02, 0.02, 0.13, 0.14, coat.pale);
    this.limb(-0.58, top + 0.1, 0, -2.2, 0.16, 0.05, 0.06, coat.dark);
    // legs
    const hips: [number, number][] = [[0.42, 0.12], [0.42, -0.12], [-0.44, 0.12], [-0.44, -0.12]];
    for (let i = 0; i < 4; i++) {
      const sw = amp * Math.sin(a.stride + ph[i]);
      // the leg above the knee, and the darker shank below it, which folds back as the leg comes forward
      this.limb(hips[i][0], top - 0.16, hips[i][1], sw, 0.42, 0.1, 0.09, coat.body);
      const kx = hips[i][0] + Math.sin(sw) * 0.42;
      const ky = top - 0.16 - Math.cos(sw) * 0.42;
      this.limb(kx, ky, hips[i][1], sw - Math.max(0, Math.cos(a.stride + ph[i])) * amp * 0.9, 0.44, 0.065, 0.065, coat.dark);
    }
    // neck and head: down to the grass, or up and looking
    const na = -0.75 + 1.85 * a.head + pitch;
    const nx = 0.5;
    const ny = top + 0.1;
    const nl = 0.5;
    this.limb(nx, ny, 0, na, nl, 0.17 * stock, 0.14 * stock, coat.body, true);
    const hx = nx + Math.cos(na) * nl;
    const hy = ny + Math.sin(na) * nl;
    // the head hangs level-ish whatever the neck does (nose a little down)
    const ha = Math.min(0.2, na * 0.3) - 0.35 - (1 - a.head) * 0.5;
    this.limb(hx - 0.03, hy + 0.04, 0, ha, 0.3, 0.15, 0.14, coat.body, true);
    this.limb(hx + Math.cos(ha) * 0.27 - 0.03, hy + Math.sin(ha) * 0.27 + 0.04, 0, ha, 0.07, 0.1, 0.1, coat.dark, true);
    for (const sz of [-1, 1]) {
      // ears, back and up
      this.limb(hx - 0.02, hy + 0.08, sz * 0.085, Math.PI + 0.45 + ha * 0.3, 0.15, 0.03, 0.07, coat.dark);
      if (a.antlers) {
        const big = a.species === 'reindeer' ? 1.3 : 1;
        this.limb(hx + 0.02, hy + 0.1, sz * 0.07, ha + 1.75, 0.42 * big, 0.035, 0.035, coat.antler, true);
        const tx = hx + 0.02 + Math.cos(ha + 1.75) * 0.24 * big;
        const ty = hy + 0.1 + Math.sin(ha + 1.75) * 0.24 * big;
        this.limb(tx, ty, sz * 0.09, ha + 0.9, 0.22 * big, 0.03, 0.03, coat.antler, true);
        this.limb(tx + 0.02, ty + 0.1 * big, sz * 0.11, ha + 2.4, 0.2 * big, 0.03, 0.03, coat.antler, true);
      }
    }
  }

  private duck(a: Animal): void {
    const coat = COATS.duck;
    const rock = 0.05 * Math.sin(a.stride);
    const drake = a.antlers || a.size > 1;
    this.boxAt(0, 0.07, 0, Math.cos(rock), Math.sin(rock), 0, 0, 0.19, 0.075, 0.1, coat.body);
    this.boxAt(0, 0.07, 0, Math.cos(rock), Math.sin(rock), -0.2, 0.05, 0.05, 0.03, 0.06, coat.pale);
    this.limb(0.13, 0.11, 0, 1.2, 0.14, 0.06, 0.055, drake ? coat.dark : coat.body, true);
    this.boxAt(0.18, 0.25, 0, 1, 0, 0.02, 0, 0.055, 0.045, 0.045, drake ? coat.dark : coat.body);
    this.boxAt(0.18, 0.25, 0, 1, 0, 0.1, -0.01, 0.035, 0.014, 0.025, coat.antler);
  }

  /** write out every animal near the camera as it stands now */
  update(camX: number, camZ: number): void {
    this.list.length = 0;
    this.fauna.near(camX, camZ, 420, this.list);
    this.n = 0;
    const count = Math.min(MAX, this.list.length);
    this.shown = count;
    if (count === 0) {
      if (this.mesh.visible) this.mesh.visible = false;
      return;
    }
    // anchor the mesh on the first animal: coordinates stay small whatever the world position
    const first = this.list[0];
    if (Math.hypot(first.x - this.ax, first.z - this.az) > 300 || !this.mesh.visible) {
      this.ax = first.x;
      this.ay = first.y;
      this.az = first.z;
      this.core.place(this.mesh, this.ax, this.ay, this.az);
    }
    for (let i = 0; i < count; i++) {
      const a = this.list[i];
      this.fc = Math.cos(a.heading);
      this.fs = Math.sin(a.heading);
      this.ox = a.x - this.ax;
      this.oy = a.y - this.ay;
      this.oz = a.z - this.az;
      this.sc = a.size;
      if (a.species === 'duck') this.duck(a);
      else this.deer(a);
    }
    // every face its own normal: the faceted look, exact at any distance
    for (let i = 0; i < this.n * 3; i += 9) {
      const p = this.pos;
      const ux = p[i + 3] - p[i];
      const uy = p[i + 4] - p[i + 1];
      const uz = p[i + 5] - p[i + 2];
      const vx = p[i + 6] - p[i];
      const vy = p[i + 7] - p[i + 1];
      const vz = p[i + 8] - p[i + 2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      for (let k = 0; k < 9; k += 3) {
        this.nrm[i + k] = nx / l;
        this.nrm[i + k + 1] = ny / l;
        this.nrm[i + k + 2] = nz / l;
      }
    }
    this.geo.setDrawRange(0, this.n);
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('normal') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    this.mesh.visible = true;
  }
}
