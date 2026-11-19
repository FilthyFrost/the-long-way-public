/**
 * The painted crowns set out (scene/crowns/grow.ts grows them, render/crownMaterial.ts paints them): the trees and
 * shrubs of the nearer scatter tiles of a world of version 2 whose family has a painted crown
 * (scene/crowns/species.ts), drawn as instances of their species, not of the tile.
 *
 * Why a view of its own. The plants' atlas (scene/plantRegistry.ts) draws every plant of a tile with as many
 * vertices as the largest model among them: fine for trees of a few hundred triangles, wasteful for crowns of
 * thousands, where a shrub would be drawn with an oak's vertex count. Here each species, variant and level is
 * one instanced draw for the whole of the near ground, and every frame the camera has moved each tree is
 * culled against the view on its own and given its level by its own distance — the nearest level within some
 * 70 m (a shrub's within 35 m), the second to 200 m, the third beyond, out to where the scatter's furthest
 * tiles (still the atlas's) take over. A tree inside a thick wood, under closed canopy, is drawn a level
 * lower than the trees of the wood's edge from 40 m on: one sees its top at most.
 *
 * Shadows: the trees round the wide shadow map's middle are drawn into it, each species in its second level
 * (a shadow some way off needs no tree's every spray), on the shadow map's layer only (render/shadow.ts: its
 * depth material cuts the sprays out of the leaf texture by aCard and uv, as it does any leaf card).
 *
 * Tiles hand their trees over as numbers (CROWN_STRIDE to a tree, world coordinates) and take them back when
 * they are dropped; the instances are written in render space, again whenever the render origin moves.
 */
import * as THREE from 'three';
import type { RenderCore } from '../../render/core';
import { crownMaterial } from '../../render/crownMaterial';
import { LAYER_SHADOW_FAR } from '../../render/shadow';
import { CROWN_STRIDE, type CrownLookup } from './crownData';
import { crownSpecies, type SpeciesModels } from './species';


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
const SHADOW_LEVEL = 1;

interface Draw {
  mesh: THREE.InstancedMesh;
  look: THREE.InstancedBufferAttribute;
  tree: THREE.InstancedBufferAttribute;
  n: number;
  cap: number;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  shadow: boolean;
}

interface Tile {
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
  private tokens = 0;
  private changed = true;
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
      this.draws.push(s.models.map((levels) => levels.map((m) => this.makeDraw(m.geometry, this.material, false))));
      this.shadowDraws.push(s.models.map((levels) => this.makeDraw(levels[SHADOW_LEVEL].geometry, this.material, true)));
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
    this.tiles.set(key, { token, data, n, cx, cy, cz, r: Math.hypot((x1 - x0) / 2 + reach, (y1 - y0) / 2, (z1 - z0) / 2 + reach) });
    this.changed = true;
    return token;
  }

  /** take a tile's trees back (with `token`: only if they are still the ones that token set) */
  dropTile(key: string, token?: number): void {
    const t = this.tiles.get(key);
    if (!t || (token !== undefined && t.token !== token)) return;
    this.tiles.delete(key);
    this.changed = true;
  }

  get trees(): number {
    let n = 0;
    for (const t of this.tiles.values()) n += t.n;
    return n;
  }

  private makeDraw(model: THREE.BufferGeometry, material: THREE.Material, shadow: boolean): Draw {
    const d: Draw = { mesh: null as unknown as THREE.InstancedMesh, look: null as unknown as THREE.InstancedBufferAttribute, tree: null as unknown as THREE.InstancedBufferAttribute, n: 0, cap: 0, geometry: model, material, shadow };
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
    look.setUsage(THREE.DynamicDrawUsage);
    tree.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aLook', look);
    g.setAttribute('aTree', tree);
    const mesh = new THREE.InstancedMesh(g, d.material, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.visible = false;
    if (d.shadow) mesh.layers.set(LAYER_SHADOW_FAR);
    if (d.mesh) {
      this.group.remove(d.mesh);
      d.mesh.geometry.dispose();
      d.mesh.dispose();
    }
    this.group.add(mesh);
    d.mesh = mesh;
    d.look = look;
    d.tree = tree;
    d.cap = cap;
  }

  /** one tree into a draw, in render space */
  private put(d: Draw, data: Float32Array, o: number, px: number, py: number, pz: number, sway: number, bark: number): void {
    if (d.n >= d.cap) {
      // (grown between frames: what is written this frame so far is lost with the old mesh, so write it all again)
      this.grow(d, d.n + 1);
      this.changed = true;
    }
    const i = d.n++;
    const m = d.mesh.instanceMatrix.array as Float32Array;
    const c = Math.cos(data[o + 3]);
    const s = Math.sin(data[o + 3]);
    const sx = data[o + 4];
    const sy = data[o + 5];
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
    const now = [cam.position.x, cam.position.y, cam.position.z, cam.quaternion.x, cam.quaternion.y, cam.quaternion.z, cam.quaternion.w, o.x, o.y, o.z, cam.fov, cam.aspect];
    let same = !this.changed;
    for (let i = 0; i < now.length; i++) {
      if (same && Math.abs(L[i] - now[i]) > (i < 3 ? 0.05 : i < 7 ? 2e-4 : 1e-6)) same = false;
    }
    if (same) return false;
    for (let i = 0; i < now.length; i++) L[i] = now[i];
    this.changed = false;
    return true;
  }

  /** every frame, before the shadow map and the frame are drawn */
  update(): void {
    if (!this.moved()) return;
    for (let pass = 0; pass < 2; pass++) {
      // (a draw that had to grow while being written asks for the whole frame to be written again)
      if (!this.write()) break;
    }
  }

  private write(): boolean {
    const cam = this.core.camera;
    cam.updateMatrixWorld();
    proj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(proj);
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
    for (const bySpecies of this.draws) for (const byVariant of bySpecies) for (const d of byVariant) d.n = 0;
    for (const bySpecies of this.shadowDraws) for (const d of bySpecies) d.n = 0;
    const lv = this.drawn.levels;
    lv[0] = lv[1] = lv[2] = 0;
    let shadows = 0;
    const grew = this.changed;
    for (const t of this.tiles.values()) {
      sphere.center.set(t.cx - ox, t.cy - oy, t.cz - oz);
      sphere.radius = t.r;
      const inView = frustum.intersectsSphere(sphere);
      const inShadow = Math.hypot(sphere.center.x - sx, sphere.center.z - sz) < SHADOW_REACH + t.r;
      if (!inView && !inShadow) continue;
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
        if (inView) {
          sphere.center.set(px, py + H * 0.5, pz);
          sphere.radius = Math.max(R, H * 0.55);
          if (frustum.intersectsSphere(sphere)) {
            const dist = Math.hypot(px - ex, py + H * 0.4 - ey, pz - ez);
            const small = def.small === true;
            let level = dist < (small ? SHRUB_NEAR : CROWN_NEAR) ? 0 : dist < (small ? SHRUB_MID : CROWN_MID) ? 1 : 2;
            if (d[o + 13] > 0.5 && level < 2 && dist > INSIDE_FROM) level++;
            this.put(this.draws[sp][va][level], d, o, px, py, pz, sway, bark);
            lv[level]++;
          }
        }
        if (inShadow && Math.hypot(px - sx, pz - sz) < SHADOW_REACH + R) {
          this.put(this.shadowDraws[sp][va], d, o, px, py, pz, sway, bark);
          shadows++;
        }
      }
    }
    if (this.changed && !grew) return true;
    let triangles = 0;
    const finish = (dr: Draw, level: number): void => {
      const m = dr.mesh;
      m.count = dr.n;
      m.visible = dr.n > 0;
      if (dr.n === 0) return;
      for (const a of [m.instanceMatrix, dr.look, dr.tree]) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, dr.n * a.itemSize);
        a.needsUpdate = true;
      }
      if (!dr.shadow) triangles += dr.n * ((dr.geometry.index?.count ?? 0) / 3);
      void level;
    };
    this.draws.forEach((bySpecies) => bySpecies.forEach((byVariant) => byVariant.forEach((dr, level) => finish(dr, level))));
    this.shadowDraws.forEach((bySpecies) => bySpecies.forEach((dr) => finish(dr, SHADOW_LEVEL)));
    this.drawn.shadows = shadows;
    this.drawn.triangles = triangles;
    return false;
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
    this.material.dispose();
    this.tiles.clear();
  }
}

