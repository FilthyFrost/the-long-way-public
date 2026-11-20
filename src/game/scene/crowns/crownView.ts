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
import { atlasLayers, atlasRowsOf, putLayer } from './crownAtlas';
import { put3, vec3s } from '../../render/uniformArrays';
import { bakeLater, bakeNow, type Baked } from './crownBake';
import type { VariantPack } from './variantPack';
import { KIT_OF, SPECIES, VARIANTS, floraKitOn, type SpeciesDef } from './species';
import { measureOf } from './speciesGrow';
import { growLater, growNow, type Grown } from './crownGrow';
import { floraMaterial } from '../flora/material';


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
/** far pictures being baked in the worker at once at most, and how long one unused is kept (ms) */
const BAKES_IN_FLIGHT = 6;
const ATLAS_KEEP_MS = 30000;
/** species being grown in the worker at once at most, and how long one no tree of is kept (ms) */
const GROWS_IN_FLIGHT = 2;
const SPECIES_KEEP_MS = 60000;

function fadeWidth(edge: number): number {
  return Math.max(2, Math.abs(edge) * 0.06);
}

interface Draw {
  /** a species' far trees: the model of each variant its far picture is baked from (a layer each) */
  atlasModels?: THREE.BufferGeometry[];
  /** which layers are in, and which are being baked in the worker */
  baked?: boolean[];
  baking?: boolean[];
  /** the rows of its pictures (two where its trees have leaves to lose: crownAtlas.ts atlasRowsOf) */
  rows?: 1 | 2;
  /** its species let go of (a bake that comes back after is dropped) */
  gone?: boolean;
  /** since when its far pictures have had no tree to draw (ms) */
  idleSince?: number;
  /** its far pictures baked from the plant toolkit's atlas */
  kit?: boolean;
  mesh: THREE.InstancedMesh;
  look: THREE.InstancedBufferAttribute;
  tree: THREE.InstancedBufferAttribute;
  fade: THREE.InstancedBufferAttribute;
  /** a pack's instances: which of its variants each tree is (crowns/variantPack.ts; 0 in a draw of one model) */
  pick: THREE.InstancedBufferAttribute;
  /** the species' variants packed in one (the near and middle levels, the shadow map's) */
  packed: boolean;
  /** the triangles of one tree drawn from it (a pack: its variants' mean) */
  perTris: number;
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

/**
 * A species the crowns draw: known from the start, its measure with it (the scatter sizes its trees by it), its
 * variants grown when its first tree is to be drawn (docs/V3/nodes/P3-variant-packs.md) and let go of a while after
 * its last.
 */
interface Species {
  family: string;
  def: SpeciesDef;
  /** grown by the plant toolkit (scene/flora): drawn with its atlas */
  kit: boolean;
  height: number;
  radius: number;
  /** none: not grown; growing: in the worker; ready: its draws are here */
  state: 'none' | 'growing' | 'ready';
  /** near and middle: its variants packed (crowns/variantPack.ts) */
  packs: Draw[] | null;
  /** its far trees: one draw, the pictures of its variants the layers of one array (the tree's own picked) */
  far: Draw | null;
  /** the shadow map's, its variants packed as well */
  shadow: Draw | null;
  /** since when none of its draws has had a tree (ms) */
  idleSince?: number;
}

const frustum = new THREE.Frustum();
const proj = new THREE.Matrix4();
const sphere = new THREE.Sphere();
const fwd = new THREE.Vector3();

export class CrownView implements CrownLookup {
  readonly group = new THREE.Group();
  readonly material: THREE.ShaderMaterial;
  private readonly species: Species[] = [];
  private readonly byFamily = new Map<string, number>();
  /** species grown: how many, the time it took (in the worker, or here) */
  readonly growStats = { grown: 0, ms: 0, inWorker: 0, letGo: 0 };
  private growing = 0;
  private readonly tiles = new Map<string, Tile>();
  private readonly billboard = new THREE.PlaneGeometry();
  /** far pictures baked: how many, the time the bakes took (in the worker, or here), and what the pictures hold */
  readonly atlasStats = { residentBytes: 0, bakedMs: 0, bakes: 0, inWorker: 0 };
  /**
   * Grow the species and bake the far pictures here, as soon as they are wanted, every one in the frame that wants
   * it: the harness's stepped frames (?shot), whose pictures must be whole and which never wait for a worker. In
   * play they are grown and baked in workers, the trees drawn once theirs come back (docs/V3/nodes/P3-bake-worker.md,
   * P3-variant-packs.md).
   */
  static bakeAtOnce = false;
  private inFlight = 0;
  private disposed = false;
  private tokens = 0;
  private changed = true;
  private originMoved = true;
  private readonly last = new Float64Array(20);
  /** what the last frame drew: trees, by level, and into the shadow map */
  readonly drawn = { levels: [0, 0, 0], shadows: 0, triangles: 0 };

  constructor(private readonly core: RenderCore) {
    this.group.name = 'crowns';
    this.material = crownMaterial();
    // every species known, none grown: its measure only (the scatter sizes its trees by it)
    const kit = floraKitOn();
    for (const [family, def] of Object.entries(SPECIES)) {
      const own = kit && KIT_OF[family] !== undefined;
      const m = measureOf(family, own);
      this.byFamily.set(family, this.species.length);
      this.species.push({ family, def, kit: own, height: m.height, radius: m.radius, state: 'none', packs: null, far: null, shadow: null });
    }
  }

  /** a species' draws: grown if they are not (there and then in the harness's stepped frames; else asked of the worker, null until they come) */
  private ensure(sp: number): Species | null {
    const s = this.species[sp];
    if (s.state === 'ready') return s;
    if (s.state === 'growing') return null;
    if (CrownView.bakeAtOnce) {
      this.install(s, growNow(s.family, s.kit));
      return s;
    }
    if (this.growing >= GROWS_IN_FLIGHT) return null;
    s.state = 'growing';
    this.growing++;
    void growLater(s.family, s.kit).then((g) => {
      this.growing--;
      if (this.disposed) return;
      this.install(s, g ?? growNow(s.family, s.kit));
      // (every tile set out again: the trees that waited for this species drawn now)
      for (const t of this.tiles.values()) t.state = null;
      this.changed = true;
    });
    return null;
  }

  /** a grown species' draws made */
  private install(s: Species, g: Grown): void {
    const grown = g.species;
    const look = s.kit ? floraMaterial() : this.material;
    s.packs = [this.makePack(grown.near, look, false, 1), this.makePack(grown.mid, look, false, 2)];
    // the far level: a picture baked of each variant, the layers of one array, one draw
    const variants = grown.far.length;
    const material = crownMaterial();
    material.defines.CROWN_ATLAS = 1;
    material.defines.ATLAS_LAYERS = variants;
    material.uniforms.tNormalAtlas = { value: null };
    material.uniforms.tPaintAtlas = { value: null };
    material.uniforms.uCards = { value: vec3s(variants) };
    material.uniforms.uAtlasRows = { value: 1 };
    const far = this.makeDraw(this.billboard, material, false, 3);
    far.packed = true;
    far.atlasModels = grown.far;
    far.baked = new Array<boolean>(variants).fill(false);
    far.baking = new Array<boolean>(variants).fill(false);
    far.rows = grown.far.some((m) => atlasRowsOf(m) === 2) ? 2 : 1;
    if (s.kit) far.kit = true;
    s.far = far;
    s.shadow = this.makePack(grown.shadow, this.material, true);
    s.state = 'ready';
    s.idleSince = undefined;
    this.growStats.grown++;
    this.growStats.ms += g.ms;
    if (g.inWorker) this.growStats.inWorker++;
  }

  /** a species no tree of has been drawn for a while let go of: its draws, its models, its far pictures */
  private letGo(s: Species): void {
    for (const d of [...s.packs!, s.far!, s.shadow!]) {
      d.gone = true;
      this.group.remove(d.mesh);
      if (d.packed && d.geometry !== this.billboard) d.geometry.dispose();
      d.mesh.geometry.dispose();
      d.mesh.dispose();
    }
    const u = (s.far!.material as THREE.ShaderMaterial).uniforms;
    if (u.tNormalAtlas.value) this.atlasStats.residentBytes -= 2 * u.tNormalAtlas.value.image.data.byteLength;
    u.tNormalAtlas.value?.dispose();
    u.tPaintAtlas.value?.dispose();
    s.far!.material.dispose();
    for (const m of s.far!.atlasModels!) m.dispose();
    s.packs = null;
    s.far = null;
    s.shadow = null;
    s.state = 'none';
    this.growStats.letGo++;
  }
  /** the species a family of model is drawn as (−1: none; it stays the atlas's) */
  speciesOf(family: string): number {
    return this.byFamily.get(family) ?? -1;
  }

  variants(_species: number): number {
    return VARIANTS;
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

  /** a draw of a species' variants, packed (crowns/variantPack.ts) */
  private makePack(pack: VariantPack, material: THREE.Material, shadow: boolean, order = 0): Draw {
    const d = this.makeDraw(pack.geometry, material, shadow, order);
    d.packed = true;
    d.perTris = pack.trianglesEach;
    d.mesh.userData.trisEach = d.perTris;
    return d;
  }

  private makeDraw(model: THREE.BufferGeometry, material: THREE.Material, shadow: boolean, order = 0): Draw {
    const none = null as unknown as THREE.InstancedBufferAttribute;
    const d: Draw = { mesh: null as unknown as THREE.InstancedMesh, look: none, tree: none, fade: none, pick: none, packed: false, perTris: (model.index?.count ?? 0) / 3, slots: [], dirtyFrom: Infinity, dirtyTo: 0, cap: 0, geometry: model, material, shadow, order };
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
    const pick = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    pick.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPick', pick);
    const mesh = new THREE.InstancedMesh(g, d.material, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = d.order;
    // (a pack draws one variant of the tree's: what the budget counts, harness/shots/perf_gate.mjs)
    if (d.packed) mesh.userData.trisEach = d.perTris;
    mesh.count = 0;
    mesh.visible = false;
    if (d.shadow) mesh.layers.set(LAYER_SHADOW_FAR);
    if (d.mesh) {
      mesh.instanceMatrix.array.set(d.mesh.instanceMatrix.array);
      look.array.set(d.look.array);
      tree.array.set(d.tree.array);
      fade.array.set(d.fade.array);
      pick.array.set(d.pick.array);
      this.group.remove(d.mesh);
      d.mesh.geometry.dispose();
      d.mesh.dispose();
    }
    this.group.add(mesh);
    d.mesh = mesh;
    d.look = look;
    d.tree = tree;
    d.fade = fade;
    d.pick = pick;
    d.cap = cap;
  }

  /** Swap the tail into a vacated slot. Its tree retains the same Slot object. */
  private removeSlot(slot: Slot): void {
    const d = slot.draw, i = slot.index;
    const tail = d.slots.pop()!;
    if (tail === slot) return;
    for (const a of [d.mesh.instanceMatrix, d.look, d.tree, d.fade, d.pick]) {
      const width = a.itemSize;
      a.array.copyWithin(i * width, tail.index * width, (tail.index + 1) * width);
    }
    tail.index = i;
    d.slots[i] = tail;
    d.dirtyFrom = Math.min(i, d.dirtyFrom);
    d.dirtyTo = Math.max(i, d.dirtyTo);
  }

  private assign(tile: Tile, id: number, d: Draw | undefined, data: Float32Array, o: number,
    px: number, py: number, pz: number, sway: number, bark: number, variant: number, fade = 0): void {
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
    // (a pack draws the tree's own variant; a draw of one model has nothing to pick)
    (d.pick.array as Float32Array)[i] = d.packed ? variant : 0;
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
        const s = this.ensure(sp);
        if (!s) {
          // (its species not grown yet: nothing drawn for it now; its tile is set out again once it is)
          for (let k = 0; k < 3; k++) this.assign(t, i * 3 + k, undefined, d, o, 0, 0, 0, 0, 0, 0);
          continue;
        }
        const def = s.def;
        const sway = def.sway;
        const bark = def.bark === 'accent' ? 1 : 0;
        let main: Draw | undefined, next: Draw | undefined, shadow: Draw | undefined;
        let cut = 0;
        if (state === 'far') {
          main = s.far!;
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
              main = s.packs![lower];
              next = lower === 0 ? s.packs![1] : s.far!;
              cut = edge;
            } else {
              main = level < 2 ? s.packs![level] : s.far!;
            }
            t.levels[level]++;
          }
        }
        if (inShadow && Math.hypot(px - sx, pz - sz) < SHADOW_REACH + R + 3) {
          sphere.center.set(px, py + H * 0.5, pz);
          const radius = Math.hypot(R, H * 0.55) + 9;
          if (castingPlanes.every(plane => plane.distanceToPoint(sphere.center) >= -radius)) shadow = s.shadow!;
        }
        this.assign(t, i * 3, main, d, o, px, py, pz, sway, bark, va, -cut);
        this.assign(t, i * 3 + 1, next, d, o, px, py, pz, sway, bark, va, cut);
        this.assign(t, i * 3 + 2, shadow, d, o, px, py, pz, sway, bark, va);
      }
      for (let l = 0; l < 3; l++) lv[l] += t.levels[l];
    }
    let triangles = 0, shadows = 0;
    // (a far picture is some ten milliseconds to bake: in the worker, the trees drawn once theirs comes back — on the
    // main thread, one in a frame lengthened that frame each time a new kind of tree came into the far band)
    const now = performance.now();
    const finish = (dr: Draw): void => {
      const count = dr.slots.length;
      let ready = true;
      if (dr.atlasModels) {
        const u = (dr.material as THREE.ShaderMaterial).uniforms;
        const baked = dr.baked!;
        if (count) dr.idleSince = undefined;
        if (count) {
          // every variant's picture asked for (a tree whose layer is not in yet is not drawn: its layer is blank)
          for (let v = 0; v < baked.length; v++) {
            if (baked[v] || dr.baking![v]) continue;
            if (CrownView.bakeAtOnce) this.giveLayer(dr, v, bakeNow(dr.atlasModels[v], dr.kit === true));
            else if (this.inFlight < BAKES_IN_FLIGHT) this.bakeLayer(dr, v);
          }
        } else if (u.tNormalAtlas.value && (dr.idleSince ??= now) < now - ATLAS_KEEP_MS) {
          // (kept a while unused: trees going in and out of the far band are not baked again and again)
          this.atlasStats.residentBytes -= 2 * u.tNormalAtlas.value.image.data.byteLength;
          for (const channel of [u.tNormalAtlas, u.tPaintAtlas]) {
            channel.value.dispose();
            channel.value = null;
          }
          baked.fill(false);
        }
        ready = baked.some(Boolean);
      }
      dr.mesh.count = count;
      dr.mesh.visible = count > 0 && ready;
      const end = Math.min(dr.dirtyTo + 1, count);
      if (end > dr.dirtyFrom) {
        for (const attr of [dr.mesh.instanceMatrix, dr.look, dr.tree, dr.fade, dr.pick]) {
          attr.clearUpdateRanges();
          attr.addUpdateRange(dr.dirtyFrom * attr.itemSize, (end - dr.dirtyFrom) * attr.itemSize);
          attr.needsUpdate = true;
        }
      }
      dr.dirtyFrom = Infinity;
      dr.dirtyTo = 0;
      if (dr.shadow) shadows += count;
      else triangles += count * dr.perTris;
    };
    for (const s of this.species) {
      if (s.state !== 'ready') continue;
      s.packs!.forEach(finish);
      finish(s.far!);
      finish(s.shadow!);
      // (no tree of it drawn for a while: let go of, grown again should one come)
      if (s.packs!.some((dr) => dr.slots.length > 0) || s.far!.slots.length > 0 || s.shadow!.slots.length > 0) s.idleSince = undefined;
      else if ((s.idleSince ??= now) < now - SPECIES_KEEP_MS) this.letGo(s);
    }
    this.drawn.shadows = shadows;
    this.drawn.triangles = triangles;
  }

  /** a variant's far picture baked in the worker (or here, should the worker fail), its trees drawn from the next frame on */
  private bakeLayer(dr: Draw, v: number): void {
    dr.baking![v] = true;
    this.inFlight++;
    const model = dr.atlasModels![v];
    void bakeLater(model, dr.kit === true).then((b) => {
      this.inFlight--;
      dr.baking![v] = false;
      if (this.disposed || dr.gone) return;
      this.giveLayer(dr, v, b ?? bakeNow(model, dr.kit === true));
      // (the next frame sets the trees out again: theirs drawn now it is here)
      this.changed = true;
    });
  }

  /** a variant's far picture into its layer of the species' arrays (made, blank, with the first) */
  private giveLayer(dr: Draw, v: number, b: Baked): void {
    const u = (dr.material as THREE.ShaderMaterial).uniforms;
    const atlas = b.atlas;
    let normals = u.tNormalAtlas.value as THREE.DataArrayTexture | null;
    let paint = u.tPaintAtlas.value as THREE.DataArrayTexture | null;
    if (!normals || !paint) {
      const layers = dr.baked!.length;
      normals = atlasLayers(atlas.width, dr.rows!, layers);
      paint = atlasLayers(atlas.width, dr.rows!, layers);
      u.tNormalAtlas.value = normals;
      u.tPaintAtlas.value = paint;
      u.uAtlasRows.value = dr.rows!;
      this.atlasStats.residentBytes += 2 * (normals.image as { data: Uint8Array }).data.byteLength;
    }
    putLayer(normals, v, atlas.normals, atlas.width, atlas.height);
    putLayer(paint, v, atlas.paint, atlas.width, atlas.height);
    put3(u.uCards.value as Float32Array, v, atlas.radius, atlas.bottom, atlas.top - atlas.bottom);
    dr.baked![v] = true;
    this.atlasStats.bakedMs += b.ms;
    this.atlasStats.bakes++;
    if (b.inWorker) this.atlasStats.inWorker++;
  }

  /** far pictures wanted and not yet baked (or being baked) — the performance gate waits for none before it times a frame */
  get pendingBakes(): number {
    let n = 0;
    for (const s of this.species) {
      if (s.state === 'ready' && s.far!.slots.length > 0) for (const b of s.far!.baked!) if (!b) n++;
    }
    // (and the species being grown: their pictures come after them)
    return n + this.growing;
  }

  /** the draws this view holds (for the budget: two packs, its far trees and its shadow's pack for each species grown) */
  get drawCount(): number {
    let n = 0;
    for (const s of this.species) if (s.state === 'ready') n += 4;
    return n;
  }

  dispose(): void {
    this.disposed = true;
    for (const sp of this.species) if (sp.state === 'ready') this.letGo(sp);
    this.billboard.dispose();
    this.material.dispose();
    this.tiles.clear();
  }
}

