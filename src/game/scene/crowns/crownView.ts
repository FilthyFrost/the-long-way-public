/**
 * The painted trees of the scatter, batched by species, variant and distance.
 * Each tree owns a slot until it crosses a distance band or leaves view. Near a boundary
 * both levels are resident and the shader shares pixels between them. Distant tiles can
 * enter and leave in one piece: all their trees use the same sixteen-view atlas per variant.
 * The wide shadow map uses the coarse three-dimensional model.
 */
import * as THREE from 'three';
import type { RenderCore } from '../../render/core';
import { crownMaterial } from '../../render/crownMaterial';
import { globals } from '../../render/shaderlib';
import { LAYER_SHADOW_FAR } from '../../render/shadow';
import { CROWN_STRIDE, type CrownLookup } from './crownData';
import { bakeCrown, atlasTexture } from './crownAtlas';
import { crownSpecies, type SpeciesModels } from './species';
import { floraCover } from '../flora/atlas';
import { floraMaterial, shadowCaster } from '../flora/material';


/** within these (m) a tree is drawn at its nearest level, and at its second; a shrub within its own */
export { CROWN_STRIDE };
export const CROWN_NEAR = 70;
export const CROWN_MID = 200;
export const SHRUB_NEAR = 35;
export const SHRUB_MID = 110;
/** a tree inside a thick wood is drawn a level lower from this far on (m) */
const INSIDE_FROM = 40;
/** the trees this near the wide shadow map's middle are drawn into it (m, beyond their crown) */
const SHADOW_REACH = 96;
/** the level a tree's shadow is drawn in */
const SHADOW_LEVEL = 2;

function fadeWidth(edge: number): number {
  return Math.max(2, Math.abs(edge) * 0.06);
}

interface Draw {
  atlasModel?: THREE.BufferGeometry;
  /** its far picture baked from the plant toolkit's atlas */
  kit?: boolean;
  mesh: THREE.InstancedMesh;
  look: THREE.InstancedBufferAttribute;
  tree: THREE.InstancedBufferAttribute;
  fade: THREE.InstancedBufferAttribute;
  slots: Slot[];
  dirtyFrom: number;
  dirtyTo: number;
  cap: number;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  shadow: boolean;
  order: number;
}

interface Slot {
  draw: Draw;
  index: number;
  fade: number;
}

interface Tile {
  slots: (Slot | undefined)[];
  // Fully outside, fully far, or straddling the distance bands.
  state: 'outside' | 'far' | 'near' | null;
  levels: number[];
  eye: THREE.Vector3;
  rotation: THREE.Quaternion;
  sun: THREE.Vector3;
  fov: number;
  aspect: number;

  /** who set it (setTile's token): a tile that is replaced is not taken back by the one it replaced */
  token: number;
  data: Float32Array;
  n: number;
  /** a sphere round all of it (world) */
  cx: number;
  cy: number;
  cz: number;
  r: number;
}

const frustum = new THREE.Frustum();
const proj = new THREE.Matrix4();
const sphere = new THREE.Sphere();
const fwd = new THREE.Vector3();

export class CrownView implements CrownLookup {
  readonly group = new THREE.Group();
  readonly material: THREE.ShaderMaterial;
  private readonly species: SpeciesModels[] = [];
  private readonly byFamily = new Map<string, number>();
  /** by species, variant, level */
  private readonly draws: Draw[][][] = [];
  /** by species, variant: the shadow map's */
  private readonly shadowDraws: Draw[][] = [];
  private readonly tiles = new Map<string, Tile>();
  private readonly billboard = new THREE.PlaneGeometry();
  private readonly atlasMaterials: THREE.ShaderMaterial[] = [];
  readonly atlasStats = { residentBytes: 0, bakedMs: 0, bakes: 0 };
  private tokens = 0;
  private changed = true;
  private originMoved = true;
  private readonly last = new Float64Array(20);
  /** what the last frame drew: trees, by level, and into the shadow map */
  readonly drawn = { levels: [0, 0, 0], shadows: 0, triangles: 0 };

  constructor(private readonly core: RenderCore) {
    this.group.name = 'crowns';
    this.material = crownMaterial();
    for (const s of crownSpecies().values()) {
      const k = this.species.length;
      this.species.push(s);
      this.byFamily.set(s.family, k);
      this.draws.push(s.models.map((levels) => levels.map((m, level) => {
        if (level < 2) return this.makeDraw(m.geometry, s.kit ? floraMaterial() : this.material, false, level + 1);
        const material = crownMaterial();
        material.defines.CROWN_ATLAS = 1;
        material.uniforms.tNormalAtlas = { value: null };
        material.uniforms.tPaintAtlas = { value: null };
        this.atlasMaterials.push(material);
        const draw = this.makeDraw(this.billboard, material, false, 3);
        draw.atlasModel = m.geometry;
        if (s.kit) draw.kit = true;
        return draw;
      })));
      // (a kit species' shadow: its sprays' uv made their own cards', so the shadow pass cuts them as every tree's)
      this.shadowDraws.push(s.models.map((levels) => this.makeDraw(s.kit ? shadowCaster(levels[SHADOW_LEVEL].geometry) : levels[SHADOW_LEVEL].geometry, this.material, true)));
    }
  }

  /** the species a family of model is drawn as (−1: none; it stays the atlas's) */
  speciesOf(family: string): number {
    return this.byFamily.get(family) ?? -1;
  }

  variants(species: number): number {
    return this.species[species].models.length;
  }

  /** a species' measure: its first variant's height and crown radius at the size it is grown (m) */
  measure(species: number): { height: number; radius: number; small: boolean } {
    const s = this.species[species];
    return { height: s.height, radius: s.radius, small: s.def.small === true };
  }

  /**
   * A tile's trees (CROWN_STRIDE numbers each, world coordinates), in place of whatever it held. Returns the
   * token to take them back with (dropTile): taking back a tile set since under the same key does nothing.
   */
  setTile(key: string, data: Float32Array, n: number): number {
    const token = ++this.tokens;
    if (n === 0) {
      this.dropTile(key);
      return token;
    }
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let reach = 0;
    for (let i = 0; i < n; i++) {
      const o = i * CROWN_STRIDE;
      x0 = Math.min(x0, data[o]);
      x1 = Math.max(x1, data[o]);
      z0 = Math.min(z0, data[o + 2]);
      z1 = Math.max(z1, data[o + 2]);
      y0 = Math.min(y0, data[o + 1]);
      y1 = Math.max(y1, data[o + 1] + data[o + 15]);
      reach = Math.max(reach, data[o + 14]);
    }
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const cy = (y0 + y1) / 2;
    this.dropTile(key);
    this.tiles.set(key, { eye: new THREE.Vector3(), sun: new THREE.Vector3(), rotation: new THREE.Quaternion(), fov: 0, aspect: 0, slots: [], state: null, levels: [0, 0, 0], token, data, n, cx, cy, cz, r: Math.hypot((x1 - x0) / 2 + reach, (y1 - y0) / 2, (z1 - z0) / 2 + reach) });
    this.changed = true;
    return token;
  }

  /** take a tile's trees back (with `token`: only if they are still the ones that token set) */
  dropTile(key: string, token?: number): void {
    const t = this.tiles.get(key);
    if (!t || (token !== undefined && t.token !== token)) return;
    for (const slot of t.slots) if (slot) this.removeSlot(slot);
    this.tiles.delete(key);
    this.changed = true;
  }

  get trees(): number {
    let n = 0;
    for (const t of this.tiles.values()) n += t.n;
    return n;
  }

  private makeDraw(model: THREE.BufferGeometry, material: THREE.Material, shadow: boolean, order = 0): Draw {
    const d: Draw = { mesh: null as unknown as THREE.InstancedMesh, look: null as unknown as THREE.InstancedBufferAttribute, tree: null as unknown as THREE.InstancedBufferAttribute, fade: null as unknown as THREE.InstancedBufferAttribute, slots: [], dirtyFrom: Infinity, dirtyTo: 0, cap: 0, geometry: model, material, shadow, order };
    this.grow(d, 64);
    return d;
  }

  /** room for at least `need` instances in a draw: its mesh made anew with room to spare */
  private grow(d: Draw, need: number): void {
    const cap = Math.max(64, Math.ceil(need * 1.5));
    const g = new THREE.BufferGeometry();
    // (the model's own attributes, shared: one buffer on the GPU whatever the number of draws)
    for (const [name, attr] of Object.entries(d.geometry.attributes)) g.setAttribute(name, attr);
    g.setIndex(d.geometry.index);
    const look = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    const tree = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    const fade = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    fade.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aFade', fade);
    look.setUsage(THREE.DynamicDrawUsage);
    tree.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aLook', look);
    g.setAttribute('aTree', tree);
    const mesh = new THREE.InstancedMesh(g, d.material, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = d.order;
    mesh.count = 0;
    mesh.visible = false;
    if (d.shadow) mesh.layers.set(LAYER_SHADOW_FAR);
    if (d.mesh) {
      mesh.instanceMatrix.array.set(d.mesh.instanceMatrix.array);
      look.array.set(d.look.array);
      tree.array.set(d.tree.array);
      fade.array.set(d.fade.array);
      this.group.remove(d.mesh);
      d.mesh.geometry.dispose();
      d.mesh.dispose();
    }
    this.group.add(mesh);
    d.mesh = mesh;
    d.look = look;
    d.tree = tree;
    d.fade = fade;
    d.cap = cap;
  }

  /** Swap the tail into a vacated slot. Its tree retains the same Slot object. */
  private removeSlot(slot: Slot): void {
    const d = slot.draw, i = slot.index;
    const tail = d.slots.pop()!;
    if (tail === slot) return;
    for (const a of [d.mesh.instanceMatrix, d.look, d.tree, d.fade]) {
      const width = a.itemSize;
      a.array.copyWithin(i * width, tail.index * width, (tail.index + 1) * width);
    }
    tail.index = i;
    d.slots[i] = tail;
    d.dirtyFrom = Math.min(i, d.dirtyFrom);
    d.dirtyTo = Math.max(i, d.dirtyTo);
  }

  private assign(tile: Tile, id: number, d: Draw | undefined, data: Float32Array, o: number,
    px: number, py: number, pz: number, sway: number, bark: number, fade = 0): void {
    const old = tile.slots[id];
    if (old?.draw !== d && old) {
      this.removeSlot(old);
      tile.slots[id] = undefined;
    }
    if (!d) return;
    let slot = tile.slots[id];
    if (slot && slot.fade === fade && !this.originMoved) return;
    if (!slot) {
      if (d.slots.length >= d.cap) this.grow(d, d.slots.length + 1);
      slot = { index: d.slots.length, draw: d, fade };
      tile.slots[id] = slot;
      d.slots.push(slot);
    }
    slot.fade = fade;
    const i = slot.index;
    d.dirtyFrom = Math.min(i, d.dirtyFrom);
    d.dirtyTo = Math.max(i, d.dirtyTo);
    const m = d.mesh.instanceMatrix.array as Float32Array;
    const c = Math.cos(data[o + 3]);
    const s = Math.sin(data[o + 3]);
    const sx = data[o + 4];
    const sy = data[o + 5];
    d.fade.setXYZ(i, fade, data[o + 15] * 0.4, fadeWidth(fade));
    const k = i * 16;
    m[k] = c * sx;
    m[k + 1] = 0;
    m[k + 2] = -s * sx;
    m[k + 3] = 0;
    m[k + 4] = 0;
    m[k + 5] = sy;
    m[k + 6] = 0;
    m[k + 7] = 0;
    m[k + 8] = s * sx;
    m[k + 9] = 0;
    m[k + 10] = c * sx;
    m[k + 11] = 0;
    m[k + 12] = px;
    m[k + 13] = py;
    m[k + 14] = pz;
    m[k + 15] = 1;
    const l = d.look.array as Float32Array;
    l[i * 4] = data[o + 8];
    l[i * 4 + 1] = data[o + 9];
    l[i * 4 + 2] = data[o + 10];
    l[i * 4 + 3] = data[o + 11];
    const t = d.tree.array as Float32Array;
    t[i * 4] = data[o + 12];
    t[i * 4 + 1] = sway;
    t[i * 4 + 2] = bark;
    t[i * 4 + 3] = sy;
  }

  /** has the camera, the origin or the tiles changed since the last frame written */
  private moved(): boolean {
    const cam = this.core.camera;
    const o = this.core.origin;
    const L = this.last;
    const sun = globals.uSunDir.value;
    const now = [cam.position.x, cam.position.y, cam.position.z, cam.quaternion.x, cam.quaternion.y, cam.quaternion.z, cam.quaternion.w, o.x, o.y, o.z, cam.fov, cam.aspect, sun.x, sun.y, sun.z];
    let same = !this.changed;
    for (let i = 0; i < now.length; i++) {
      if (same && Math.abs(L[i] - now[i]) > (i < 3 ? 0.8 : i < 7 ? 0.003 : i >= 12 ? 0.025 : 1e-6)) same = false;
    }
    if (same) return false;
    this.originMoved = L[7] !== o.x || L[8] !== o.y || L[9] !== o.z;
    for (let i = 0; i < now.length; i++) L[i] = now[i];
    this.changed = false;
    return true;
  }

  /** every frame, before the shadow map and the frame are drawn */
  update(): void {
    if (!this.moved()) return;
    this.write();
  }

  private write(): void {
    const cam = this.core.camera;
    cam.updateMatrixWorld();
    proj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(proj);
    const sun = globals.uSunDir.value;
    // A caster outside one of these planes casts its entire shadow away from view.
    // The positive margin covers the small camera/light changes between tile updates.
    const castingPlanes = frustum.planes.filter(plane => plane.normal.dot(sun) > 0.15);
    const ox = this.core.origin.x;
    const oy = this.core.origin.y;
    const oz = this.core.origin.z;
    const ex = cam.position.x;
    const ey = cam.position.y;
    const ez = cam.position.z;
    // the wide shadow map's middle: 55 m ahead of the camera, along the level (as render/core.ts sets it)
    cam.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() > 1e-6) fwd.normalize();
    const sx = ex + fwd.x * 55;
    const sz = ez + fwd.z * 55;
    const lv = this.drawn.levels;
    lv.fill(0);
    for (const t of this.tiles.values()) {
      sphere.center.set(t.cx - ox, t.cy - oy, t.cz - oz);
      // Include what can enter the frustum before the next position/orientation refresh.
      const distance = sphere.center.distanceTo(cam.position);
      const margin = 3.5 + (distance + t.r) * 0.03;
      sphere.radius = t.r + margin;
      const inView = frustum.intersectsSphere(sphere);
      const inShadow = Math.hypot(sphere.center.x - sx, sphere.center.z - sz) < SHADOW_REACH + t.r;
      const far = distance - t.r > CROWN_MID + 18;
      const state = !inView && !inShadow ? 'outside' : far && !inShadow ? 'far' : 'near';
      // Both LODs are resident either side of a boundary. The shader updates the
      // blend as the camera moves between these guarded CPU classification updates.
      const reuse = state !== 'near' || (t.eye.distanceToSquared(cam.position) < 2.25
        && Math.abs(t.rotation.dot(cam.quaternion)) > 0.99998 && t.sun.distanceToSquared(sun) < 0.0025 && t.fov === cam.fov && t.aspect === cam.aspect);
      if (state === t.state && reuse && !this.originMoved) {
        for (let l = 0; l < 3; l++) lv[l] += t.levels[l];
        continue;
      }
      t.sun.copy(sun);
      t.eye.copy(cam.position);
      t.rotation.copy(cam.quaternion);
      t.fov = cam.fov;
      t.aspect = cam.aspect;
      t.state = state;
      t.levels.fill(0);
      if (state === 'outside') {
        for (const slot of t.slots) if (slot) this.removeSlot(slot);
        t.slots.length = 0;
        continue;
      }
      const d = t.data;
      for (let i = 0; i < t.n; i++) {
        const o = i * CROWN_STRIDE;
        const px = d[o] - ox;
        const py = d[o + 1] - oy;
        const pz = d[o + 2] - oz;
        const R = d[o + 14];
        const H = d[o + 15];
        const sp = d[o + 6];
        const va = d[o + 7];
        const def = this.species[sp].def;
        const sway = def.sway;
        const bark = def.bark === 'accent' ? 1 : 0;
        let main: Draw | undefined, next: Draw | undefined, shadow: Draw | undefined;
        let cut = 0;
        if (state === 'far') {
          main = this.draws[sp][va][2];
          t.levels[2]++;
        } else if (inView) {
          sphere.center.set(px, py + H * 0.5, pz);
          const treeMargin = 3 + sphere.center.distanceTo(cam.position) * 0.024;
          const visible = frustum.planes.every(plane => plane.distanceToPoint(sphere.center) + treeMargin
            + R * Math.sqrt(Math.max(0, 1 - plane.normal.y ** 2)) + H * 0.52 * Math.abs(plane.normal.y) >= 0);
          if (visible) {
            const dist = Math.hypot(px - ex, py + H * 0.4 - ey, pz - ez);
            const small = def.small === true;
            const inside = d[o + 13] > 0.5;
            const near = small ? SHRUB_NEAR : inside ? INSIDE_FROM : CROWN_NEAR;
            const far = small ? SHRUB_MID : inside ? CROWN_NEAR : CROWN_MID;
            const level = dist < near ? 0 : dist < far ? 1 : 2;
            const edge = Math.abs(dist - near) < Math.abs(dist - far) ? near : far;
            if (Math.abs(dist - edge) < fadeWidth(edge) + 4) {
              const lower = edge === near ? 0 : 1;
              main = this.draws[sp][va][lower];
              next = this.draws[sp][va][lower + 1];
              cut = edge;
            } else {
              main = this.draws[sp][va][level];
            }
            t.levels[level]++;
          }
        }
        if (inShadow && Math.hypot(px - sx, pz - sz) < SHADOW_REACH + R + 3) {
          sphere.center.set(px, py + H * 0.5, pz);
          const radius = Math.hypot(R, H * 0.55) + 9;
          if (castingPlanes.every(plane => plane.distanceToPoint(sphere.center) >= -radius)) shadow = this.shadowDraws[sp][va];
        }
        this.assign(t, i * 3, main, d, o, px, py, pz, sway, bark, -cut);
        this.assign(t, i * 3 + 1, next, d, o, px, py, pz, sway, bark, cut);
        this.assign(t, i * 3 + 2, shadow, d, o, px, py, pz, sway, bark);
      }
      for (let l = 0; l < 3; l++) lv[l] += t.levels[l];
    }
    let triangles = 0, shadows = 0;
    const finish = (dr: Draw): void => {
      const count = dr.slots.length;
      if (dr.atlasModel) {
        const u = (dr.material as THREE.ShaderMaterial).uniforms;
        if (count && !u.tNormalAtlas.value) {
          const start = performance.now();
          const atlas = bakeCrown(dr.atlasModel, dr.kit ? floraCover() : undefined);
          u.uCard = { value: new THREE.Vector3(atlas.radius, atlas.bottom, atlas.top - atlas.bottom) };
          u.uAtlasRows = { value: atlas.height / atlas.width };
          u.tNormalAtlas.value = atlasTexture(atlas.normals, atlas.width);
          u.tPaintAtlas.value = atlasTexture(atlas.paint, atlas.width);
          this.atlasStats.bakedMs += performance.now() - start;
          this.atlasStats.bakes++;
          this.atlasStats.residentBytes += atlas.normals.byteLength + atlas.paint.byteLength;
        } else if (!count && u.tNormalAtlas.value) {
          this.atlasStats.residentBytes -= 2 * u.tNormalAtlas.value.image.data.byteLength;
          for (const channel of [u.tNormalAtlas, u.tPaintAtlas]) {
            channel.value.dispose();
            channel.value = null;
          }
        }
      }
      dr.mesh.count = count;
      dr.mesh.visible = count > 0;
      const end = Math.min(dr.dirtyTo + 1, count);
      if (end > dr.dirtyFrom) {
        for (const attr of [dr.mesh.instanceMatrix, dr.look, dr.tree, dr.fade]) {
          attr.clearUpdateRanges();
          attr.addUpdateRange(dr.dirtyFrom * attr.itemSize, (end - dr.dirtyFrom) * attr.itemSize);
          attr.needsUpdate = true;
        }
      }
      dr.dirtyFrom = Infinity;
      dr.dirtyTo = 0;
      if (dr.shadow) shadows += count;
      else triangles += count * ((dr.geometry.index?.count ?? 0) / 3);
    };
    this.draws.forEach(s => s.forEach(v => v.forEach(finish)));
    this.shadowDraws.forEach(s => s.forEach(finish));
    this.drawn.shadows = shadows;
    this.drawn.triangles = triangles;
  }

  /** the draws this view holds (for the budget: the species × variants × levels it may draw) */
  get drawCount(): number {
    let n = 0;
    for (const s of this.draws) for (const v of s) n += v.length;
    return n + this.shadowDraws.reduce((a, s) => a + s.length, 0);
  }

  dispose(): void {
    for (const s of this.draws) for (const v of s) for (const d of v) {
      d.mesh.geometry.dispose();
      d.mesh.dispose();
    }
    for (const s of this.shadowDraws) for (const d of s) {
      d.mesh.geometry.dispose();
      d.mesh.dispose();
    }
    for (const material of this.atlasMaterials) {
      material.uniforms.tNormalAtlas.value?.dispose();
      material.uniforms.tPaintAtlas.value?.dispose();
      material.dispose();
    }
    this.billboard.dispose();
    this.material.dispose();
    this.tiles.clear();
  }
}

