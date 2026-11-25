// Her nightdress in three.js (docs/V3/plan/character-pv.md §3, §5): the cups, ribbons and bandage skinned to her
// bones; the skirt and the halter tie's ends cloth, stepped each frame from where her body is (core/character/cloth.ts).
// The cloth lives in render space (it is not under her root): when the game moves its origin, shift() moves it too.

import * as THREE from 'three';
import { Cloth, type Capsule, RopeSim } from '../../core/character/cloth';
import type { ClothSheet, GarmentMesh, Rope } from '../../core/character/dress';
import { LAYER_SHADOW_NEAR } from '../render/shadow';
import { clothMaterial } from './clothMaterial';
import { type HerRig, attr } from './her';
import { shadowDepthMaterial } from './material';

/** Her body as rounded sticks for the cloth to lie on: [bone, offset in the bone's frame (bind), bone, offset, radius]. */
interface StickDef { a: string; ao: THREE.Vector3; b: string; bo: THREE.Vector3; r: number }

export class DressView {
  readonly group = new THREE.Group();
  readonly cloth: Cloth;
  readonly tails: RopeSim[];
  readonly skirtMesh: THREE.Mesh;
  readonly skinnedParts: THREE.SkinnedMesh[] = [];
  private readonly skirtGeo: THREE.BufferGeometry;
  readonly tailMeshes: THREE.Mesh[] = [];
  private readonly pins: Float32Array;
  private readonly sticks: Capsule[] = [];
  private readonly stickDefs: StickDef[] = [];
  private readonly boneMats: THREE.Matrix4[];
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly m4 = new THREE.Matrix4();
  readonly skinnedMat = clothMaterial(true);
  readonly skirtMat = clothMaterial(false);
  /** the wind where she stands (m/s, render space) */
  readonly wind = new THREE.Vector3();
  floor = 0;
  /** the skirt's swing limits (cos, a column each) standing and sitting or crouched (see Cloth.swingCos) */
  private readonly swingStand = new Float32Array(72);
  private readonly swingSit = new Float32Array(72);
  /** the skirt's home: each point's weights on the pelvis and the two thighs, and those bones' indices */
  private homeW = new Float32Array(0);
  private homeBones: number[] = [];
  /** she sits or crouches (the skirt may lie on her lap) */
  sitting = false;
  /** her middle (render space), for which way is out from her */
  private readonly center = new THREE.Vector3();
  /** each skinned piece's shadow caster, by name (bodice, ribbons, bandage) */
  private readonly shadows: Record<string, THREE.SkinnedMesh> = {};
  private skirtShadow!: THREE.Mesh;
  /** what of the nightdress she has on (see show) */
  private readonly on = { top: true, skirt: true, under: true };
  /** the skirt was off: when it is put on again it is laid where it hangs, not swung there from where it was left */
  private skirtStale = false;

  constructor(readonly rig: HerRig, parts: Record<string, unknown>, meta: Record<string, unknown>, scene: THREE.Object3D) {
    // ---- skinned pieces
    for (const name of ['bodice', 'ribbons', 'bandage']) {
      const d = parts[name] as GarmentMesh;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', attr(d.positions, 3));
      g.setAttribute('normal', attr(d.normals, 3));
      g.setAttribute('skinIndex', attr(d.skinIndex, 4, false));
      g.setAttribute('skinWeight', attr(d.skinWeight, 4));
      g.setAttribute('aCloth', attr(d.cloth, 4));
      g.setIndex(new THREE.BufferAttribute(d.indices as unknown as THREE.TypedArray, 1));
      const m = new THREE.SkinnedMesh(g, this.skinnedMat);
      m.name = `player:${name}`;
      m.bind(rig.skeleton, new THREE.Matrix4());
      m.frustumCulled = false;
      rig.root.add(m);
      this.skinnedParts.push(m);
      const sh = new THREE.SkinnedMesh(g, shadowDepthMaterial());
      sh.name = `player:${name}_shadow`;
      sh.bind(rig.skeleton, new THREE.Matrix4());
      sh.frustumCulled = false;
      sh.layers.set(LAYER_SHADOW_NEAR);
      rig.root.add(sh);
      this.shadows[name] = sh;
    }
    // ---- the skirt
    const sm = meta.skirt as { cols: number; rows: number; closed: boolean };
    const sp = parts.skirt as Omit<ClothSheet, 'cols' | 'rows' | 'closed'>;
    const sheet: ClothSheet = { ...sp, cols: sm.cols, rows: sm.rows, closed: sm.closed };
    this.cloth = new Cloth(sheet);
    // how far each column of the skirt may swing from her body's down: least at the back (a skirt trails behind her,
    // it does not stand out like a shelf), more at the sides, and at the front as far as a stride kicks it; sitting or
    // crouched, far enough at the front to lie on her lap
    if (this.swingStand.length !== sheet.cols) throw new Error(`the skirt has ${sheet.cols} columns, not ${this.swingStand.length}`);
    for (const [lim, frontDeg] of [[this.swingStand, 78], [this.swingSit, 112]] as const) {
      for (let c = 0; c < sheet.cols; c++) {
        const front = Math.cos(Math.atan2(sheet.rest[c * 3], sheet.rest[c * 3 + 2] + 0.012));
        const deg = front > 0 ? 62 + (frontDeg - 62) * front : 62 + 10 * front;
        lim[c] = Math.cos((deg * Math.PI) / 180);
      }
    }
    this.cloth.swingCos = this.swingStand;
    this.cloth.relDamp = 14;
    // the skirt as if simply worn: its waist on her pelvis, further down more and more on each thigh (60% at the hem,
    // left and right blended across her middle); how far it may stray from that and how much it is drawn back, by row
    {
      const n = sheet.cols * sheet.rows;
      this.homeW = new Float32Array(n * 3);
      const bi = (name: string) => rig.skeleton.bones.indexOf(rig.bones[name]);
      this.homeBones = [bi('pelvis'), bi('thigh_l'), bi('thigh_r')];
      for (let k = 0; k < n; k++) {
        const t = 0.6 * Math.min(1, ((k / sheet.cols) | 0) / (sheet.rows - 1));
        const x = sheet.rest[k * 3];
        const l = Math.min(1, Math.max(0, (x + 0.035) / 0.07));
        const ls = l * l * (3 - 2 * l);
        this.homeW.set([1 - t, t * ls, t * (1 - ls)], k * 3);
      }
      this.cloth.home = new Float32Array(n * 3);
      this.cloth.homeMax = new Float32Array(sheet.rows);
      for (let j = 0; j < sheet.rows; j++) this.cloth.homeMax[j] = 0.012 + 0.14 * Math.pow(j / (sheet.rows - 1), 1.3);
      // drawn back only a little (it hangs as it falls, not as cut), more beside the slit: with cloth on one side only,
      // its flap swings like a door and nothing else would close it
      const nearSlit = new Uint8Array(sheet.cols);
      for (let k = 0; k < n; k++) if (sheet.open[k]) for (let o = -2; o <= 3; o++) nearSlit[(((k % sheet.cols) + o) % sheet.cols + sheet.cols) % sheet.cols] = 1;
      this.cloth.homePull = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        const f = ((k / sheet.cols) | 0) / (sheet.rows - 1);
        this.cloth.homePull[k] = (0.0004 + 0.0026 * f) * (nearSlit[k % sheet.cols] ? 5 : 1);
      }
    }
    this.pins = new Float32Array(sheet.cols * 3);
    const n = sheet.cols * sheet.rows;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aFold', new THREE.BufferAttribute(this.cloth.fold, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCloth', new THREE.BufferAttribute(sheet.cloth, 4));
    const idx: number[] = [];
    const C = sheet.cols;
    for (let j = 0; j + 1 < sheet.rows; j++) {
      for (let i = 0; i < C; i++) {
        if (sheet.open[i + j * C]) continue;
        const i2 = (i + 1) % C;
        if (!sheet.closed && i2 === 0) continue;
        const a = i + j * C, b = i2 + j * C, c = a + C, d = b + C;
        idx.push(a, c, b, b, c, d);
      }
    }
    g.setIndex(idx);
    this.skirtGeo = g;
    this.skirtMesh = new THREE.Mesh(g, this.skirtMat);
    this.skirtMesh.name = 'player:skirt';
    this.skirtMesh.frustumCulled = false;
    const skirtShadow = new THREE.Mesh(g, shadowDepthMaterial());
    skirtShadow.name = 'player:skirt_shadow';
    skirtShadow.frustumCulled = false;
    skirtShadow.layers.set(LAYER_SHADOW_NEAR);
    this.skirtShadow = skirtShadow;
    this.group.add(this.skirtMesh, skirtShadow);
    // ---- the tie's ends
    const tm = meta.tails as { width: number }[];
    this.tails = tm.map((t, i) => new RopeSim({ ...(parts[`tail${i}`] as Omit<Rope, 'width'>), width: t.width }));
    for (const rope of this.tails) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rope.n * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(rope.n * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const cl = new Float32Array(rope.n * 2 * 4);
      for (let k = 0; k < rope.n * 2; k++) cl.set([k, 9, 2, 1], k * 4);
      geo.setAttribute('aCloth', new THREE.BufferAttribute(cl, 4));
      geo.setAttribute('aFold', new THREE.BufferAttribute(new Float32Array(rope.n * 2), 1));
      const ti: number[] = [];
      for (let k = 0; k + 1 < rope.n; k++) { const a = k * 2; ti.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      geo.setIndex(ti);
      const mesh = new THREE.Mesh(geo, this.skirtMat);
      mesh.name = 'player:tie';
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.tailMeshes.push(mesh);
    }
    scene.add(this.group);

    // ---- the sticks: hips, seat, thighs, calves, the belly and the back (bind-pose points on bones)
    const B = (n: string) => rig.bones[n];
    rig.root.updateMatrixWorld(true);
    const bindPoint = (bone: string, world: THREE.Vector3) => {
      // a bind-pose world point into the bone's frame (the skeleton is in its bind pose now)
      const inv = rig.skeleton.boneInverses[rig.skeleton.bones.indexOf(B(bone))];
      return world.clone().applyMatrix4(inv);
    };
    const J = (n: string) => B(n).getWorldPosition(new THREE.Vector3());
    const add = (a: string, pa: THREE.Vector3, b: string, pb: THREE.Vector3, r: number) =>
      this.stickDefs.push({ a, ao: bindPoint(a, pa), b, bo: bindPoint(b, pb), r });
    const hipL = J('thigh_l'), hipR = J('thigh_r');
    add('pelvis', new THREE.Vector3(0.04, 0.9, -0.01), 'pelvis', new THREE.Vector3(-0.04, 0.9, -0.01), 0.108);
    add('pelvis', new THREE.Vector3(0.047, 0.862, -0.045), 'pelvis', new THREE.Vector3(-0.047, 0.862, -0.045), 0.066);
    add('spine_01', new THREE.Vector3(0, 0.98, 0.012), 'spine_02', new THREE.Vector3(0, 1.08, 0.0), 0.088);
    // the upper back and the neck, for the tie's ends to lie on
    add('spine_02', new THREE.Vector3(0, 1.1, -0.006), 'spine_03', new THREE.Vector3(0, 1.26, -0.01), 0.086);
    add('neck_01', new THREE.Vector3(0, 1.31, -0.004), 'Head', new THREE.Vector3(0, 1.42, 0.0), 0.034);
    for (const s of ['l', 'r']) {
      const hip = s === 'l' ? hipL : hipR;
      const knee = J(`calf_${s}`), ankle = J(`foot_${s}`);
      const mid = hip.clone().lerp(knee, 0.45);
      add(`thigh_${s}`, hip.clone().add(new THREE.Vector3(0, -0.02, 0.006)), `thigh_${s}`, mid.clone().add(new THREE.Vector3(0, 0, 0.008)), 0.083);
      add(`thigh_${s}`, mid.clone().add(new THREE.Vector3(0, 0, 0.008)), `calf_${s}`, knee, 0.062);
      add(`calf_${s}`, knee, `foot_${s}`, ankle.clone().add(new THREE.Vector3(0, 0.05, 0)), 0.044);
    }
    for (let i = 0; i < this.stickDefs.length; i++) this.sticks.push({ a: [0, 0, 0], b: [0, 0, 0], r: this.stickDefs[i].r });
    this.boneMats = rig.skeleton.bones.map(() => new THREE.Matrix4());
  }

  private skinPoint(rest: ArrayLike<number>, at: number, si: ArrayLike<number>, sw: ArrayLike<number>, k: number, out: THREE.Vector3): THREE.Vector3 {
    out.set(0, 0, 0);
    for (let j = 0; j < 4; j++) {
      const w = sw[k * 4 + j];
      if (w <= 0) continue;
      this.tmp2.set(rest[at], rest[at + 1], rest[at + 2]).applyMatrix4(this.boneMats[si[k * 4 + j]]);
      out.addScaledVector(this.tmp2, w);
    }
    return out;
  }

  /**
   * What of the nightdress she has on: its top (the cups, the ribbons, the tie), its skirt, and what is under it (the
   * lace shorts and the bandage on her thigh). Under other clothes it comes off (wardrobeView.ts): a jacket takes the
   * top and the skirt, trousers the skirt and what is under it. A skirt that is off is not stepped.
   */
  show(top: boolean, skirt: boolean, under: boolean): void {
    if (skirt && !this.on.skirt) this.skirtStale = true;
    this.on.top = top;
    this.on.skirt = skirt;
    this.on.under = under;
    for (const m of this.skinnedParts) {
      const name = m.name.replace('player:', '');
      const vis = name === 'bandage' ? under : top;
      m.visible = vis;
      if (this.shadows[name]) this.shadows[name].visible = vis;
    }
    for (const t of this.tailMeshes) t.visible = top;
    this.skirtMesh.visible = this.skirtShadow.visible = skirt;
  }

  /** After her bones are posed for the frame: hang the cloth from them and step it. */
  update(dt: number): void {
    const rig = this.rig;
    rig.root.updateMatrixWorld(true);
    const bones = rig.skeleton.bones;
    for (let i = 0; i < bones.length; i++) this.boneMats[i].multiplyMatrices(bones[i].matrixWorld, rig.skeleton.boneInverses[i]);
    const sheet = this.cloth.sheet;
    for (let i = 0; i < sheet.cols; i++) {
      this.skinPoint(sheet.rest, i * 3, sheet.pinSkinIndex, sheet.pinSkinWeight, i, this.tmp);
      this.pins[i * 3] = this.tmp.x; this.pins[i * 3 + 1] = this.tmp.y; this.pins[i * 3 + 2] = this.tmp.z;
    }
    this.stickDefs.forEach((d, i) => {
      const a = this.tmp.copy(d.ao).applyMatrix4(rig.bones[d.a].matrixWorld);
      this.sticks[i].a = [a.x, a.y, a.z];
      const b = this.tmp.copy(d.bo).applyMatrix4(rig.bones[d.b].matrixWorld);
      this.sticks[i].b = [b.x, b.y, b.z];
    });
    this.center.setFromMatrixPosition(rig.bones.spine_02.matrixWorld);
    // her body's down (the trunk's line, the pelvis below the chest): the skirt's swing is measured from it
    {
      const pel = this.tmp.setFromMatrixPosition(rig.bones.pelvis.matrixWorld);
      const dx = pel.x - this.center.x, dy = pel.y - this.center.y, dz = pel.z - this.center.z;
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      this.cloth.down[0] = dx / l; this.cloth.down[1] = dy / l; this.cloth.down[2] = dz / l;
    }
    this.cloth.swingCos = this.sitting ? this.swingSit : this.swingStand;
    // where the skirt would be if simply worn
    if (this.on.skirt) {
      const home = this.cloth.home, rest = sheet.rest, W = this.homeW, B = this.homeBones.map((b) => this.boneMats[b].elements);
      for (let k = 0; k < home.length / 3; k++) {
        const i = k * 3, x = rest[i], y = rest[i + 1], z = rest[i + 2];
        let hx = 0, hy = 0, hz = 0;
        for (let b = 0; b < 3; b++) {
          const w = W[i + b];
          if (w <= 0) continue;
          const e = B[b];
          hx += w * (e[0] * x + e[4] * y + e[8] * z + e[12]);
          hy += w * (e[1] * x + e[5] * y + e[9] * z + e[13]);
          hz += w * (e[2] * x + e[6] * y + e[10] * z + e[14]);
        }
        home[i] = hx; home[i + 1] = hy; home[i + 2] = hz;
      }
      // (put on again: laid where it hangs, still)
      if (this.skirtStale) {
        this.cloth.p.set(home);
        this.cloth.prev.set(home);
        this.skirtStale = false;
      }
    }
    const w = this.wind;
    const air = (_x: number, _y: number, _z: number, out: number[]) => { out[0] = w.x; out[1] = w.y; out[2] = w.z; };
    if (this.on.skirt) {
      this.cloth.update(dt, this.pins, this.sticks, air, this.floor);
      const pos = this.skirtGeo.attributes.position as THREE.BufferAttribute;
      (pos.array as Float32Array).set(this.cloth.p);
      pos.needsUpdate = true;
      const nrm = this.skirtGeo.attributes.normal as THREE.BufferAttribute;
      (nrm.array as Float32Array).set(this.cloth.normals);
      nrm.needsUpdate = true;
      (this.skirtGeo.attributes.aFold as THREE.BufferAttribute).needsUpdate = true;
    }
    // the tie's ends, from the bow
    this.tails.forEach((rope, ti) => {
      const r = rope.rope;
      this.skinPoint(r.rest, 0, r.pinSkinIndex, r.pinSkinWeight, 0, this.tmp);
      rope.update(dt, [this.tmp.x, this.tmp.y, this.tmp.z], this.sticks, air);
      const geo = this.tailMeshes[ti].geometry;
      const p = geo.attributes.position.array as Float32Array;
      const nn = geo.attributes.normal.array as Float32Array;
      for (let k = 0; k < rope.n; k++) {
        const i = k * 3;
        const k2 = Math.min(rope.n - 1, k + 1), k0 = Math.max(0, k - 1);
        const tx = rope.p[k2 * 3] - rope.p[k0 * 3], ty = rope.p[k2 * 3 + 1] - rope.p[k0 * 3 + 1], tz = rope.p[k2 * 3 + 2] - rope.p[k0 * 3 + 2];
        // the ribbon's width lies across the line out from her middle (sideways on her back), its face out from her
        const ox = rope.p[i] - this.center.x, oz = rope.p[i + 2] - this.center.z;
        let sx = -ty * oz, sz = ty * ox;
        let sl = Math.hypot(sx, sz);
        if (sl < 1e-6) { sx = 1; sz = 0; sl = 1; }
        sx /= sl; sz /= sl;
        const half = r.width / 2 * (1 - 0.3 * (k / rope.n));
        p.set([rope.p[i] + sx * half, rope.p[i + 1], rope.p[i + 2] + sz * half, rope.p[i] - sx * half, rope.p[i + 1], rope.p[i + 2] - sz * half], k * 6);
        const nx = sz * ty, ny = sz * tx - sx * tz, nz = -sx * ty;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nn.set([nx / nl, ny / nl, nz / nl, nx / nl, ny / nl, nz / nl], k * 6);
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.normal.needsUpdate = true;
    });
  }

  /** The render origin moved by (dx, dy, dz): the cloth moves with the world. */
  shift(dx: number, dy: number, dz: number): void {
    for (const arr of [this.cloth.p, this.cloth.prev]) for (let i = 0; i < arr.length; i += 3) { arr[i] -= dx; arr[i + 1] -= dy; arr[i + 2] -= dz; }
    for (const r of this.tails) for (const arr of [r.p, r.prev]) for (let i = 0; i < arr.length; i += 3) { arr[i] -= dx; arr[i + 1] -= dy; arr[i + 2] -= dz; }
  }

  setHidden(h: boolean): void {
    this.skinnedMat.uniforms.uHide.value = h ? 1 : 0;
    this.skirtMat.uniforms.uHide.value = h ? 1 : 0;
  }
}
