/**
 * The proving ground drawn (docs/MODCAR.md §28): its asphalt and the lines painted on it, the gravel loop and its
 * features, the grade hill, the cones (cones.ts: where each stands, or lies where it was knocked), and what stands
 * there (props.ts). Built near the eye over a few frames, within a time budget; the land around it is the world's.
 *
 * The pieces (provingLand.ts): the asphalt sheet in 256 m tiles, the loop in lengths cut at its features (each twice:
 * fine near the eye, its long shapes only further off), the hill in one with its mown banks; the rocks and the logs
 * with the loop's lengths they lie on; the props in groups (provingStands.ts). Each is a build in slices, run nearest
 * first; once built a piece stays until the view is disposed. Where the loop and the hill have shapes the land's
 * coarse mesh cannot follow, the land's vertices are held down under them (terrainMaterials.ts terrainClamp), once
 * the map of how far is made (first of all).
 */
import * as THREE from 'three';
import { ConeField } from '../../core/modcar/proving/cones';
import { PG, type ProvingGround } from '../../core/modcar/proving/layout';
import { provingProps } from '../../core/modcar/proving/props';
import { globals } from '../render/shaderlib';
import { castShadows } from '../render/shadow';
import type { RenderCore } from '../render/core';
import { terrainClamp } from '../render/terrainMaterials';
import { grassMaterial, surfaceMaterial } from '../render/materials';
import { GRASS_FADE, GRASS_KEEP_FAR, buildGrassTuft } from '../scene/worldBuild';
import {
  ASPHALT_TILE,
  LandPaint,
  asphaltSlices,
  asphaltTiles,
  clampSlices,
  hillBox,
  hillGrass,
  hillSlices,
  logPlaces,
  loopChunkBox,
  loopChunks,
  loopSlices,
  rockPlaces,
  rockTemplate,
  ROCK_TINTS,
  type ClampMap,
  type Piece,
  type Slices,
} from './provingLand';
import { asphaltMaterial, glyphAtlas, hillMaterial, loopMaterial } from './provingPaint';
import { PropKit, coneGeometry, logGeometry, type StartLights } from './provingStands';

/** pieces are built when the eye comes this near them (m) */
const BUILD_REACH = 2600;
/** … the loop's fine pieces this near (m); nearer than LOD_NEAR they are drawn, further their coarse ones */
const FINE_REACH = 700;
const LOD_NEAR = 160;
/** what a teleport's fade waits for: the pieces this near the eye (m) */
const PENDING_REACH = 600;

interface Chunk {
  key: string;
  box: { x0: number; z0: number; x1: number; z1: number };
  make: () => Slices<THREE.Object3D[]>;
  gen: Slices<THREE.Object3D[]> | null;
  objects: THREE.Object3D[] | null;
  /** small things: hidden past this distance (m) */
  hideBeyond?: number;
  /** built only this near (m; default BUILD_REACH) */
  reach?: number;
  /** a level of detail: the loop's length it is of, and whether it is the fine one (drawn near) or the coarse */
  lod?: { group: string; fine: boolean };
}

const boxDist = (b: Chunk['box'], x: number, z: number): number => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));

export class ProvingView {
  private readonly root = new THREE.Group();
  private readonly paint: LandPaint;
  private readonly glyphs = glyphAtlas();
  private readonly asphaltMat: THREE.ShaderMaterial;
  private readonly loopMat: THREE.ShaderMaterial;
  private readonly hillMat: THREE.ShaderMaterial;
  /** the rock garden's stones: flat facets, cel-lit */
  private readonly rockMat = surfaceMaterial({ vertexColors: true, flat: true, snowCap: 0 });
  private readonly grassMat = grassMaterial(GRASS_FADE, GRASS_KEEP_FAR);
  private readonly tuft = buildGrassTuft();
  private readonly kit: PropKit;
  private readonly chunks: Chunk[] = [];
  private current: Chunk | null = null;
  private eyeX = NaN;
  private eyeZ = NaN;
  private disposed = false;
  /** the longest single step of a build so far (ms) and whose: a proxy for hitches */
  maxStepMs = 0;
  maxStepKey = '';
  private clampTex: THREE.DataTexture | null = null;
  private clamp: ClampMap | null = null;
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly coneMesh: THREE.InstancedMesh;
  private readonly coneGeo = coneGeometry();
  private readonly coneMat: THREE.ShaderMaterial;
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly base = { x: 0, y: 0, z: 0 };
  /** the cones' mesh is placed here (world), its instances relative to it */
  private readonly coneAt = { x: (PG.x0 + PG.x1) / 2, z: (PG.z0 + PG.z1) / 2 };

  constructor(
    private readonly core: RenderCore,
    private readonly ground: ProvingGround,
    private readonly cones: ConeField,
  ) {
    this.root.name = 'proving';
    core.scene.add(this.root);
    core.onRebase(() => {
      if (this.disposed) return;
      for (const o of this.root.children) {
        const w = o.userData.w as [number, number, number] | undefined;
        if (w) core.place(o, w[0], w[1], w[2]);
      }
    });
    this.paint = new LandPaint(ground.world);
    this.asphaltMat = asphaltMaterial(this.glyphs);
    this.loopMat = loopMaterial(this.glyphs);
    this.hillMat = hillMaterial(this.glyphs);
    this.kit = new PropKit(ground);
    this.coneMat = this.kit.coneMaterial;
    this.coneMesh = new THREE.InstancedMesh(this.coneGeo, this.coneMat, cones.cones.length);
    this.coneMesh.name = 'proving:cones';
    this.coneMesh.frustumCulled = false;
    castShadows(this.coneMesh, true);
    this.put(this.coneMesh, this.coneAt.x, ground.level, this.coneAt.z);
    this.plan();
  }

  /** an object into the scene at its world place (kept there through the origin's moves) */
  private put(o: THREE.Object3D, wx: number, wy: number, wz: number): THREE.Object3D {
    o.userData.w = [wx, wy, wz];
    this.core.place(o, wx, wy, wz);
    this.root.add(o);
    return o;
  }

  private mesh(p: Piece, mat: THREE.Material, name: string): THREE.Mesh {
    const m = new THREE.Mesh(p.geometry, mat);
    m.name = name;
    this.geos.push(p.geometry);
    m.userData.w = [p.wx, p.wy, p.wz];
    return m;
  }

  /** every piece there is to build, with the plan box it covers */
  private plan(): void {
    const level = this.ground.level;
    const self = this;
    // the land held under the loop and the hill: first, so the land never stands through them
    {
      const hb = hillBox();
      this.chunks.push({
        key: 'clamp',
        box: { x0: hb.x0 - 600, z0: 30, x1: hb.x1 + 300, z1: 270 },
        *make() {
          const map: ClampMap = yield* clampSlices();
          self.setClamp(map);
          return [];
        },
        gen: null,
        objects: null,
      });
    }
    for (const t of asphaltTiles()) {
      const x0 = t.ix * ASPHALT_TILE;
      const z0 = t.iz * ASPHALT_TILE;
      this.chunks.push({
        key: `asphalt${t.ix},${t.iz}`,
        box: { x0, z0, x1: x0 + ASPHALT_TILE, z1: z0 + ASPHALT_TILE },
        *make() {
          const p = yield* asphaltSlices(self.paint, level, t.ix, t.iz);
          return p ? [self.mesh(p, self.asphaltMat, `proving:asphalt:${t.ix},${t.iz}`)] : [];
        },
        gen: null,
        objects: null,
      });
    }
    const rocks = rockPlaces(level);
    const logs = logPlaces();
    for (const c of loopChunks()) {
      const box = loopChunkBox(c);
      // (far off, a coarse one: the long shapes only)
      this.chunks.push({
        key: `${c.key}far`,
        box,
        *make() {
          const p = yield* loopSlices(self.paint, level, c, true);
          return [self.mesh(p, self.loopMat, `proving:${c.key}:far`)];
        },
        gen: null,
        objects: null,
        lod: { group: c.key, fine: false },
      });
      this.chunks.push({
        key: c.key,
        box,
        *make() {
          const p = yield* loopSlices(self.paint, level, c);
          const out: THREE.Object3D[] = [self.mesh(p, self.loopMat, `proving:${c.key}`)];
          if (c.feats.some((f) => f.kind === 'rocks')) out.push(...self.rocks(rocks));
          if (c.feats.some((f) => f.kind === 'logs')) out.push(self.logs(logs, level));
          return out;
        },
        gen: null,
        objects: null,
        reach: FINE_REACH,
        lod: { group: c.key, fine: true },
      });
    }
    this.chunks.push({
      key: 'hill',
      box: hillBox(),
      *make() {
        const p = yield* hillSlices(self.paint, level);
        return [self.mesh(p, self.hillMat, 'proving:hill')];
      },
      gen: null,
      objects: null,
    });
    // the hill's banks mown, as the grass round it
    this.chunks.push({
      key: 'hillgrass',
      box: hillBox(),
      *make() {
        const g = yield* hillGrass(self.ground.world);
        return [self.grass(g, level)];
      },
      gen: null,
      objects: null,
      hideBeyond: 75,
      reach: FINE_REACH,
    });
    // what stands there, in groups by place
    for (const g of this.kit.groups(provingProps())) {
      this.chunks.push({
        key: `props:${g.key}`,
        box: g.box,
        *make() {
          const out: THREE.Object3D[] = yield* g.build();
          for (const o of out) self.geos.push(...geometriesOf(o));
          return out;
        },
        gen: null,
        objects: null,
        hideBeyond: g.hideBeyond,
      });
    }
  }

  /** the rock garden's stones: three shapes of stone, each rock one of them scaled to its bump */
  private rocks(list: ReturnType<typeof rockPlaces>): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    const level = this.ground.level;
    const ox = list[0].x;
    const oz = list[0].z;
    for (let kind = 0; kind < 3; kind++) {
      const mine = list.filter((r) => r.kind === kind);
      if (!mine.length) continue;
      const geo = rockTemplate(kind + 1);
      this.geos.push(geo);
      const mesh = new THREE.InstancedMesh(geo, this.rockMat, mine.length);
      const tint = new THREE.Color();
      mine.forEach((r, i) => {
        this.q.setFromAxisAngle(this.v.set(0, 1, 0), r.yaw);
        // (a stone a little narrower one way than its bump: never wider, or it would stand over flat gravel)
        const nar = 0.86 + 0.14 * (((i * 7919) % 13) / 13);
        this.m4.compose(this.v.set(r.x - ox, r.y - level, r.z - oz), this.q, new THREE.Vector3(r.r, r.h, r.r * nar));
        mesh.setMatrixAt(i, this.m4);
        const t = ROCK_TINTS[(i * 3 + kind) % ROCK_TINTS.length];
        mesh.setColorAt(i, tint.setRGB(t[0], t[1], t[2]));
      });
      mesh.computeBoundingSphere();
      mesh.name = 'proving:rocks';
      castShadows(mesh);
      mesh.userData.w = [ox, level, oz];
      out.push(mesh);
    }
    return out;
  }

  /** grass tufts as the world's: the tuft's blades, a root and paint inputs each */
  private grass(g: { roots: Float32Array; info: Float32Array; count: number; wx: number; wz: number }, level: number): THREE.Object3D {
    const geo = new THREE.InstancedBufferGeometry();
    for (const [name, attr] of Object.entries(this.tuft.attributes)) geo.setAttribute(name, attr as THREE.BufferAttribute);
    if (this.tuft.index) geo.setIndex(this.tuft.index);
    geo.setAttribute('aRoot', new THREE.InstancedBufferAttribute(g.roots, 4));
    geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(g.info, 4));
    geo.instanceCount = g.count;
    const hb = hillBox();
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3((hb.x0 + hb.x1) / 2 - g.wx, 2, (hb.z0 + hb.z1) / 2 - g.wz), Math.hypot(hb.x1 - hb.x0, hb.z1 - hb.z0) / 2);
    this.geos.push(geo);
    const m = new THREE.Mesh(geo, this.grassMat);
    m.name = 'proving:grass';
    m.userData.w = [g.wx, level, g.wz];
    m.userData.tufts = g.count;
    return m;
  }

  /** the logs across the loop */
  private logs(list: ReturnType<typeof logPlaces>, level: number): THREE.Object3D {
    const geo = logGeometry(list);
    this.geos.push(geo.geometry);
    const m = new THREE.Mesh(geo.geometry, this.kit.paintMat);
    m.name = 'proving:logs';
    castShadows(m);
    m.userData.w = [geo.wx, level, geo.wz];
    return m;
  }

  /** the map of how far the land is held down, into the land's material */
  private setClamp(map: ClampMap): void {
    this.clamp = map;
    const half = new Uint16Array(map.data.length);
    for (let i = 0; i < half.length; i++) half[i] = THREE.DataUtils.toHalfFloat(map.data[i]);
    const t = new THREE.DataTexture(half, map.w, map.h, THREE.RedFormat, THREE.HalfFloatType);
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    this.clampTex = t;
    terrainClamp.tClamp.value = t;
    this.placeClamp();
  }

  /** the clamp map's box in render space (the origin moves) */
  private placeClamp(): void {
    const m = this.clamp;
    if (!m || this.disposed) return;
    const o = this.core.origin;
    terrainClamp.uClampBox.value.set(m.x0 - o.x, m.z0 - o.z, m.x0 + m.w * m.texel - o.x, m.z0 + m.h * m.texel - o.z);
    terrainClamp.uClampBase.value = this.ground.level - o.y;
  }

  /** every frame: what is not built yet near the eye built (within `budgetMs`), the cones where they are */
  update(dt: number, eyeX: number, eyeZ: number, budgetMs: number): void {
    if (this.disposed) return;
    this.eyeX = eyeX;
    this.eyeZ = eyeZ;
    const t0 = performance.now();
    for (;;) {
      if (!this.current) {
        let best: Chunk | null = null;
        let bd = BUILD_REACH;
        for (const c of this.chunks) {
          if (c.objects) continue;
          const d = boxDist(c.box, eyeX, eyeZ) + (c.key === 'clamp' ? -1e6 : 0);
          if (d > (c.reach ?? BUILD_REACH)) continue;
          if (d < bd) {
            bd = d;
            best = c;
          }
        }
        if (!best) break;
        this.current = best;
        best.gen = best.make();
      }
      const c = this.current;
      const ts = performance.now();
      const r = c.gen!.next();
      const ms = performance.now() - ts;
      if (ms > this.maxStepMs) {
        this.maxStepMs = ms;
        this.maxStepKey = c.key;
      }
      if (r.done) {
        c.objects = r.value;
        c.gen = null;
        this.current = null;
        for (const o of c.objects) {
          const w = o.userData.w as [number, number, number];
          this.put(o, w[0], w[1], w[2]);
        }
      }
      if (performance.now() - t0 > budgetMs) break;
    }
    this.placeClamp();
    // small things go out of sight far off; the loop near in its fine pieces, further in its coarse ones
    const fineShown = new Set<string>();
    for (const c of this.chunks) {
      if (c.lod?.fine && c.objects && boxDist(c.box, eyeX, eyeZ) < LOD_NEAR) fineShown.add(c.lod.group);
    }
    for (const c of this.chunks) {
      if (!c.objects) continue;
      let vis = true;
      if (c.hideBeyond !== undefined) vis = boxDist(c.box, eyeX, eyeZ) < c.hideBeyond;
      if (c.lod) {
        const fine = fineShown.has(c.lod.group);
        if (c.lod.fine) {
          // (the rocks and the logs stay a while after the gravel under them has gone coarse)
          const d = boxDist(c.box, eyeX, eyeZ);
          c.objects.forEach((o, i) => (o.visible = i === 0 ? fine : d < 600));
          continue;
        }
        vis = !fine;
      }
      for (const o of c.objects) o.visible = vis;
    }
    this.kit.update(dt, globals);
    // (the cones are small: out of sight from far off the ground)
    this.coneMesh.visible = boxDist({ x0: PG.x0, z0: PG.z0, x1: PG.x1, z1: PG.z1 }, eyeX, eyeZ) < 900;
    if (this.coneMesh.visible) this.updateCones();
  }

  /** each cone where it is: standing, flying (its base from its middle of mass), or lying where it fell */
  private updateCones(): void {
    const level = this.ground.level;
    const list = this.cones.cones;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      ConeField.base(c, this.base);
      this.q.set(c.qx, c.qy, c.qz, c.qw);
      this.v.set(this.base.x - this.coneAt.x, this.base.y - level, this.base.z - this.coneAt.z);
      this.m4.compose(this.v, this.q, this.one);
      this.coneMesh.setMatrixAt(i, this.m4);
    }
    this.coneMesh.instanceMatrix.needsUpdate = true;
  }

  /** the start gantry's lights (the timing may set them): off, red (ready), amber (set), green (go) */
  get startLights(): StartLights {
    return this.kit.lights;
  }
  set startLights(v: StartLights) {
    this.kit.lights = v;
  }

  /** how much near the eye is still to be built (0: all there; a teleport's fade waits for it) */
  get pending(): number {
    if (!Number.isFinite(this.eyeX)) return this.chunks.length;
    let n = 0;
    for (const c of this.chunks) if (!c.objects && boxDist(c.box, this.eyeX, this.eyeZ) < Math.min(PENDING_REACH, c.reach ?? PENDING_REACH)) n++;
    return n;
  }

  /** what is built (the probes): pieces, triangles by kind */
  stats(): { pieces: number; built: number; triangles: Record<string, number> } {
    const tri: Record<string, number> = {};
    let built = 0;
    for (const c of this.chunks) {
      if (!c.objects) continue;
      built++;
      const kind = c.lod ? (c.lod.fine ? 'loop' : 'loopFar') : c.key.replace(/^props.*/, 'props').replace(/[\d,:-]+.*$/, '');
      for (const o of c.objects)
        o.traverse((m) => {
          const mesh = m as THREE.Mesh;
          if (!mesh.isMesh) return;
          const g = mesh.geometry;
          const n = g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
          const inst = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : (g as THREE.InstancedBufferGeometry).isInstancedBufferGeometry ? (g as THREE.InstancedBufferGeometry).instanceCount : 1;
          tri[kind] = (tri[kind] ?? 0) + n * inst;
        });
    }
    tri.cones = (this.coneGeo.index ? this.coneGeo.index.count / 3 : this.coneGeo.getAttribute('position').count / 3) * this.cones.cones.length;
    return { pieces: this.chunks.length, built, triangles: tri };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    for (const g of this.geos) g.dispose();
    this.coneGeo.dispose();
    this.coneMesh.dispose();
    this.asphaltMat.dispose();
    this.loopMat.dispose();
    this.hillMat.dispose();
    this.rockMat.dispose();
    this.grassMat.dispose();
    this.tuft.dispose();
    this.glyphs.dispose();
    this.kit.dispose();
    if (terrainClamp.tClamp.value === this.clampTex) {
      terrainClamp.tClamp.value = null;
      terrainClamp.uClampBox.value.set(0, 0, 0, 0);
    }
    this.clampTex?.dispose();
  }
}

/** the geometries under an object */
function geometriesOf(o: THREE.Object3D): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  o.traverse((m) => {
    const mesh = m as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) out.push(mesh.geometry);
  });
  return out;
}
