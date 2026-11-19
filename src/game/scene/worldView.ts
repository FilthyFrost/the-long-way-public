/**
 * Streams the generated world around the camera: decides what should exist (road strips,
 * terrain leaves, scatter tiles), builds missing pieces within a per-frame time budget, and
 * retires old ones only once their replacements are in place — no holes, no pops to black.
 */
import * as THREE from 'three';
import { regionById } from '../../core/world/biomes';
import type { Coast } from '../../core/world/sea';
import type { Site, SiteObject } from '../../core/world/sites';
import type { World } from '../../core/world/terrain';
import type { QualitySettings, RenderCore } from '../render/core';
import { floraMaterial, floraUniforms } from '../render/floraMaterial';
import { farWoodsMaterial, flowerMaterial, foliageMaterial, grassMaterial, groundShadowMaterial, rockMaterial, surfaceMaterial } from '../render/materials';
import { castShadows } from '../render/shadow';
import { coverUniforms, ownPalettes, showChapters, type OwnPalettes } from '../render/style';
import { roadStripMaterial, terrainMaterial, wireMaterial } from '../render/terrainMaterials';
import type { Lake, River, WaterFeature } from '../../core/world/water';
import { waterMaterial } from '../render/water';
import { floraMesh, floraShadows } from './floraMesh';
import { LOD_FAR, LOD_MID, LOD_NEAR, LOD_CLOSE, buildFloraScatter, type FloraLod } from './floraScatter';
import { plantRegistry, type PlantRegistry } from './plantRegistry';
import { siteSlices } from './siteBuild';
import { LakeBuild, RIVER_CHUNK, SEA_CHUNK, buildBridge, buildRiverChunk, riverChunks, riverPoint, seaChunks, seaSlices, type WaterSheet } from './waterBuild';
import { grassSlices, woodsSlices, type GrassTile, type Slices, type WoodsTile } from './worldBuild';
import { GRASS_FADE, GRASS_KEEP_FAR, GRASS_NEAR, GRASS_RADIUS, GRASS_TILE, STRIP_STATIONS, TERRAIN_MAX_LEVEL, TERRAIN_ROOT, TILE, WOODS_FADE, WOODS_TILE, buildFarWoods, buildFlower, buildGrass, buildGrassTuft, buildPoles, buildWoodsCard, buildScatter, buildScatterKinds, buildStrip, buildTerrain, type ScatterKinds } from './worldBuild';

/** a sliced build runs at most about this long per turn (ms): no single step may hold up a frame */
const SLICE_MS = 2;

/** far road strips are merged this many chunks to a mesh */
const FAR_SPAN = 4;
/** poles, wires and roadside leftovers are built this many chunks to a mesh, hung on the first chunk of the group */
const POLE_SPAN = 4;
/** scatter tiles nearer than this (m, to their middle) hold every plant in its full model */
const SCATTER_NEAR = 230;
/**
 * … and in a world of version 2 (scene/floraScatter.ts): within the first of these a tile is at its nearest
 * level — every plant in its full model, throwing its own shadow; beyond it, the trees inside a thick wood are
 * in their far models already and the tile's shadows are thrown by far models; within the second a tile still
 * shows its larger shrubs, in low models; beyond it, its trees alone, in their smallest
 */
const SCATTER_FULL = 120;
const SCATTER_MID = 420;

interface Piece {
  objects: THREE.Object3D[];
}

interface TerrainLeaf extends Piece {
  level: number;
  ix: number;
  iz: number;
}

interface Job {
  priority: number;
  run: () => void;
}

export class WorldView {
  private readonly strips = new Map<number, Piece & { lod: number }>();
  private readonly terrain = new Map<string, TerrainLeaf>();
  private readonly tiles = new Map<string, Piece & { far: boolean; lod: FloraLod }>();
  private readonly grass = new Map<string, Piece & { near: boolean }>();
  private wantGrass = new Map<string, { gx: number; gz: number; dist: number; near: boolean }>();
  private readonly grassMat = grassMaterial(GRASS_FADE, GRASS_KEEP_FAR);
  private readonly flowerMat = flowerMaterial(GRASS_FADE, GRASS_KEEP_FAR);
  private readonly grassGeo = buildGrassTuft();
  private readonly woods = new Map<string, Piece>();
  private wantWoods = new Map<string, { tx: number; tz: number; dist: number }>();
  private readonly woodsMat = farWoodsMaterial(WOODS_FADE);
  private readonly woodsGeo = buildWoodsCard();
  private readonly flowerGeo = buildFlower();
  private wantStrips = new Map<number, number>();
  private wantTerrain = new Map<string, { level: number; ix: number; iz: number; dist: number }>();
  private wantTiles = new Map<string, { tx: number; tz: number; far: boolean; lod: FloraLod; dist: number }>();
  /** water sheets (lakes whole, rivers in lengths) and bridges, keyed L<slot>, R<slot>/<chunk>, B<slot> */
  private readonly water = new Map<string, Piece>();
  private wantWater = new Map<string, { f: WaterFeature; chunk: number; dist: number }>();
  private readonly lakeBuilds = new Map<string, LakeBuild>();
  private readonly waterMat = waterMaterial();
  private readonly bridgeMat = surfaceMaterial({ vertexColors: true, flat: true, snowCap: 0, side: THREE.DoubleSide });
  private readonly feats: WaterFeature[] = [];
  /** the sea along a chapter, a kilometre of road to a sheet, keyed <chapter>/<length> */
  private readonly seas = new Map<string, Piece>();
  private wantSeas = new Map<string, { c: Coast; i: number; dist: number }>();
  private readonly coasts: Coast[] = [];
  /** the places by the road and what lies on its verges: one mesh each, keyed by the site's id */
  private readonly sites = new Map<string, Piece>();
  private wantSites = new Map<string, { site: Site; dist: number }>();
  private readonly siteList: Site[] = [];
  // (the builder gives every face its own exact normal: normals from screen derivatives turn to speckle
  // on a wall the sun grazes when one stands a hand's breadth from it)
  private readonly siteMat = surfaceMaterial({ vertexColors: true, snowCap: 0, brush: 1 });
  /** … and in the mountains, with old snow on every roof */
  private readonly siteSnowMat = surfaceMaterial({ vertexColors: true, snowCap: 0.7, brush: 1 });
  private readonly rp = { x: 0, z: 0, nx: 0, nz: 0 };
  private jobs: Job[] = [];
  /** builds in progress, spread over several turns (grass and far woods), keyed by what they build */
  private readonly slicing = new Map<string, Slices<unknown>>();
  private planX = NaN;
  private planZ = NaN;
  private readonly terrainMat = terrainMaterial();
  /** a world of version 2: the far ring's materials, by the first of the four chapters whose palettes they hold (farMaterial) */
  private readonly farMats = new Map<number, { mat: THREE.ShaderMaterial; pal: OwnPalettes; users: number }>();
  private readonly stripMat = roadStripMaterial();
  private readonly treeMat = foliageMaterial({ sway: 1, snowCap: 0 });
  private readonly coniferMat = foliageMaterial({ sway: 0.6, snowCap: 0.72, evergreen: true });
  private readonly rockMat = rockMaterial();
  private readonly poleMat = surfaceMaterial({ vertexColors: true, flat: true, snowCap: 0 });
  private readonly wireMat = wireMaterial();
  private readonly shadowMat = groundShadowMaterial();
  private readonly shadowGeo = (() => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    return g;
  })();
  /** the first renderer's plant templates: what a world of version 1 scatters (null in a world of version 2) */
  private readonly kinds: ScatterKinds | null;
  /** a world of version 2: the plants' registry and the one material they are all drawn with (null in a world of version 1) */
  private readonly plants: PlantRegistry | null;
  private readonly floraMat: THREE.ShaderMaterial | null;
  private readonly proj = { s: 0, d: 0 };
  private readonly group = new THREE.Group();
  private sCam = 0;
  /** the sites' objects not drawn here, the game making them things of their own (ModCar's wrecks: vehicles) */
  skipObject: ((o: SiteObject, site: Site) => boolean) | null = null;
  /** longest single build so far this session (ms): a proxy for streaming hitches */
  maxBuildMs = 0;
  totalBuilds = 0;

  constructor(
    private readonly core: RenderCore,
    readonly world: World,
    private readonly q: QualitySettings,
  ) {
    this.group.name = 'world';
    core.scene.add(this.group);
    // (a world of version 2 draws what its flora field stands: the models of every plant in one atlas)
    this.plants = world.flora ? plantRegistry() : null;
    if (this.plants) floraUniforms.tPlants.value = this.plants.atlas.texture;
    this.floraMat = this.plants ? floraMaterial() : null;
    this.kinds = this.plants ? null : buildScatterKinds();
    if (this.plants) {
      // … and paints its ground and its flowers by the flora field's ground cover. (The materials are made
      // where they always were, in the order they always were — the renderer draws in the order materials
      // were made, and a world of version 1 is to be drawn exactly as before — and told of the cover here,
      // before they are first used.)
      coverUniforms.uCoverSeed.value = world.seed | 0;
      this.terrainMat.defines.RT_COVER = '';
      this.stripMat.defines.RT_COVER = '';
      this.flowerMat.defines.RT_HUE = '';
    }
    core.onRebase(() => {
      const visit = (p: Piece): void => {
        for (const o of p.objects) {
          const w = o.userData.w as [number, number, number];
          core.place(o, w[0], w[1], w[2]);
        }
      };
      this.strips.forEach(visit);
      this.terrain.forEach(visit);
      this.tiles.forEach(visit);
      this.grass.forEach(visit);
      this.woods.forEach(visit);
      this.water.forEach(visit);
      this.seas.forEach(visit);
      this.sites.forEach(visit);
    });
  }

  private add(obj: THREE.Object3D, wx: number, wy: number, wz: number): THREE.Object3D {
    obj.userData.w = [wx, wy, wz];
    this.core.place(obj, wx, wy, wz);
    obj.matrixAutoUpdate = true;
    this.group.add(obj);
    return obj;
  }

  private drop(p: Piece): void {
    for (const o of p.objects) {
      this.group.remove(o);
      const m = o as THREE.Mesh;
      // geometries are per piece, except shared scatter models and the shared terrain index
      if (m.geometry && !(m as unknown as { isInstancedMesh?: boolean }).isInstancedMesh) m.geometry.dispose();
      if ((m as unknown as { isInstancedMesh?: boolean }).isInstancedMesh) (m as unknown as THREE.InstancedMesh).dispose();
      // (… and what a piece holds for itself: a far leaf its share of a material with palettes of its own)
      const own = o.userData.own as { dispose(): void }[] | undefined;
      if (own) for (const x of own) x.dispose();
    }
  }

  // ------------------------------------------------------------------------------------------ planning

  private plan(cx: number, cz: number): void {
    this.planX = cx;
    this.planZ = cz;
    const vs = this.q.viewScale;
    const sp = this.world.spine;
    sp.project(cx, cz, this.sCam, this.proj);
    this.sCam = this.proj.s;
    // the palettes of four chapters in a row: the ones nearest to where one is (render/style.ts chapterRun)
    showChapters((c) => sp.plan.biomeOf(c), sp.plan.chapterAt(Math.max(0, this.sCam)), Math.max(0, this.sCam), sp.plan.starts);

    // ---- road strips
    const ds = sp.ds;
    const len = STRIP_STATIONS * ds;
    const wantS = new Map<number, number>();
    // (a road that ends at its start: no strip behind it)
    const c0 = this.world.deadEnd ? Math.max(0, Math.floor((this.sCam - 520) / len)) : Math.floor((this.sCam - 520) / len);
    const c1 = Math.floor((this.sCam + 3400 * vs) / len);
    for (let c = c0; c <= c1; c++) {
      const dist = Math.abs((c + 0.5) * len - this.sCam);
      const lod = dist < 380 ? 0 : dist < 1000 ? 1 : 2;
      // far strips are built four chunks to a mesh, keyed by the first chunk of the group
      if (lod === 2) {
        const g = Math.floor(c / FAR_SPAN) * FAR_SPAN;
        // only when the whole group is far; otherwise fall back to single far chunks
        const d0 = Math.abs((g + 0.5) * len - this.sCam);
        const d1 = Math.abs((g + FAR_SPAN - 0.5) * len - this.sCam);
        if (d0 >= 1000 && d1 >= 1000) {
          wantS.set(g + 0.5, 3);
          continue;
        }
      }
      wantS.set(c, lod);
    }
    this.wantStrips = wantS;

    // ---- terrain quadtree, then a coarse ring of 8 km leaves out to the skyline
    const wantT = new Map<string, { level: number; ix: number; iz: number; dist: number }>();
    const R = 6000 * vs;
    const RF = 20000 * vs;
    const splitK = 1.2;
    const boxDist = (x0: number, z0: number, size: number): number => {
      const dx = cx < x0 ? x0 - cx : cx > x0 + size ? cx - x0 - size : 0;
      const dz = cz < z0 ? z0 - cz : cz > z0 + size ? cz - z0 - size : 0;
      return Math.hypot(dx, dz);
    };
    // levels below 0 are the far ring (4 and 8 km leaves): they only split where they reach the detailed disc
    const visit = (level: number, ix: number, iz: number): void => {
      const size = TERRAIN_ROOT / Math.pow(2, level);
      const dist = boxDist(ix * size, iz * size, size);
      const split = level < 0 ? dist <= R : dist <= R && level < TERRAIN_MAX_LEVEL && dist < size * splitK;
      if (!split) {
        wantT.set(`${level}/${ix}/${iz}`, { level, ix, iz, dist });
        return;
      }
      visit(level + 1, ix * 2, iz * 2);
      visit(level + 1, ix * 2 + 1, iz * 2);
      visit(level + 1, ix * 2, iz * 2 + 1);
      visit(level + 1, ix * 2 + 1, iz * 2 + 1);
    };
    const BIG = TERRAIN_ROOT * 4;
    const b0x = Math.floor((cx - RF) / BIG);
    const b1x = Math.floor((cx + RF) / BIG);
    const b0z = Math.floor((cz - RF) / BIG);
    const b1z = Math.floor((cz + RF) / BIG);
    for (let bz = b0z; bz <= b1z; bz++) {
      for (let bx = b0x; bx <= b1x; bx++) {
        if (boxDist(bx * BIG, bz * BIG, BIG) <= RF) visit(-2, bx, bz);
      }
    }
    this.wantTerrain = wantT;

    // ---- scatter tiles
    const wantK = new Map<string, { tx: number; tz: number; far: boolean; lod: FloraLod; dist: number }>();
    const Rt = 780 * vs;
    const t0x = Math.floor((cx - Rt) / TILE);
    const t1x = Math.floor((cx + Rt) / TILE);
    const t0z = Math.floor((cz - Rt) / TILE);
    const t1z = Math.floor((cz + Rt) / TILE);
    for (let tz = t0z; tz <= t1z; tz++) {
      for (let tx = t0x; tx <= t1x; tx++) {
        const dist = Math.hypot((tx + 0.5) * TILE - cx, (tz + 0.5) * TILE - cz);
        if (dist > Rt) continue;
        const far = dist > SCATTER_NEAR;
        // (a world of version 1 knows two levels: near and far)
        const lod = !this.plants ? (far ? LOD_FAR : LOD_NEAR) : dist <= SCATTER_FULL ? LOD_NEAR : !far ? LOD_CLOSE : dist <= SCATTER_MID ? LOD_MID : LOD_FAR;
        wantK.set(`${tx},${tz}`, { tx, tz, far, lod, dist });
      }
    }
    this.wantTiles = wantK;

    // ---- grass, close to the camera only
    const wantG = new Map<string, { gx: number; gz: number; dist: number; near: boolean }>();
    if (this.q.density >= 0.6) {
      const Rg = GRASS_RADIUS;
      const g0x = Math.floor((cx - Rg) / GRASS_TILE);
      const g1x = Math.floor((cx + Rg) / GRASS_TILE);
      const g0z = Math.floor((cz - Rg) / GRASS_TILE);
      const g1z = Math.floor((cz + Rg) / GRASS_TILE);
      for (let gz = g0z; gz <= g1z; gz++) {
        for (let gx = g0x; gx <= g1x; gx++) {
          const dx = cx < gx * GRASS_TILE ? gx * GRASS_TILE - cx : cx > (gx + 1) * GRASS_TILE ? cx - (gx + 1) * GRASS_TILE : 0;
          const dz = cz < gz * GRASS_TILE ? gz * GRASS_TILE - cz : cz > (gz + 1) * GRASS_TILE ? cz - (gz + 1) * GRASS_TILE : 0;
          const dist = Math.hypot(dx, dz);
          if (dist < Rg) wantG.set(`${gx},${gz}`, { gx, gz, dist, near: dist < GRASS_NEAR });
        }
      }
    }
    this.wantGrass = wantG;
    for (const [k, p] of this.grass) {
      // a tile changing ring is replaced when its rebuild is ready (makeGrass), not dropped now
      if (!wantG.has(k)) {
        this.drop(p);
        this.grass.delete(k);
      }
    }

    // ---- far woods: painted tree masses on 2 km tiles, from where the modelled trees end
    const wantW = new Map<string, { tx: number; tz: number; dist: number }>();
    const Rw = WOODS_FADE.out[1] * vs;
    for (let tz = Math.floor((cz - Rw) / WOODS_TILE); tz <= Math.floor((cz + Rw) / WOODS_TILE); tz++) {
      for (let tx = Math.floor((cx - Rw) / WOODS_TILE); tx <= Math.floor((cx + Rw) / WOODS_TILE); tx++) {
        const dist = boxDist(tx * WOODS_TILE, tz * WOODS_TILE, WOODS_TILE);
        if (dist < Rw) wantW.set(`${tx},${tz}`, { tx, tz, dist });
      }
    }
    this.wantWoods = wantW;
    // ---- the sea: seen from a long way along the coast
    const wantC = new Map<string, { c: Coast; i: number; dist: number }>();
    for (const c of this.world.sea.between(this.sCam - 13000, this.sCam + 13000, this.coasts)) {
      const n = seaChunks(c);
      for (let i = 0; i < n; i++) {
        const dist = Math.max(0, Math.abs(c.s0 + (i + 0.5) * SEA_CHUNK - this.sCam) - SEA_CHUNK / 2);
        if (dist < 12000 * vs) wantC.set(`${c.chapter}/${i}`, { c, i, dist });
      }
    }
    this.wantSeas = wantC;
    for (const [k, p] of this.seas) {
      if (!wantC.has(k)) {
        this.drop(p);
        this.seas.delete(k);
      }
    }
    // ---- places by the road; a building shows from further off than a crate on the verge
    const wantP = new Map<string, { site: Site; dist: number }>();
    this.siteList.length = 0;
    for (const site of this.world.sites.between(this.sCam - 1600, this.sCam + 2600 * vs, this.siteList)) {
      const dist = Math.hypot(site.x - cx, site.z - cz);
      if (dist < (site.kind === 'roadside' ? 1000 : 2400) * vs) wantP.set(site.id, { site, dist });
    }
    this.wantSites = wantP;
    for (const [k, p] of this.sites) {
      if (!wantP.has(k)) {
        this.drop(p);
        this.sites.delete(k);
      }
    }
    // builds in progress for what is no longer wanted (or wanted at another ring) are dropped
    for (const k of this.slicing.keys()) {
      const [kind, key, ring] = k.split('|');
      const keep = kind === 'w' ? wantW.has(key) : kind === 's' ? wantP.has(key) : kind === 'c' ? wantC.has(key) : wantG.get(key)?.near === (ring === '1');
      if (!keep) this.slicing.delete(k);
    }
    for (const [k, p] of this.woods) {
      if (!wantW.has(k)) {
        this.drop(p);
        this.woods.delete(k);
      }
    }

    // ---- water: lakes whole, rivers in lengths, and the bridges
    const wantV = new Map<string, { f: WaterFeature; chunk: number; dist: number }>();
    const Rv = 5200 * vs;
    for (const f of this.world.water.between(this.sCam - Rv - 1500, this.sCam + Rv + 1500, this.feats)) {
      if (f.kind === 'lake') {
        const dist = Math.max(0, Math.hypot(f.cx - cx, f.cz - cz) - Math.max(f.a, f.b));
        if (dist < Rv) wantV.set(`L${f.slot}`, { f, chunk: 0, dist });
      } else {
        const [c0r, c1r] = riverChunks(f);
        for (let c = c0r; c <= c1r; c++) {
          riverPoint(f, (c + 0.5) * RIVER_CHUNK, this.rp);
          const dist = Math.max(0, Math.hypot(this.rp.x - cx, this.rp.z - cz) - RIVER_CHUNK * 0.6);
          if (dist < 3800 * vs) wantV.set(`R${f.slot}/${c}`, { f, chunk: c, dist });
        }
        const db = Math.abs(f.s - this.sCam);
        if (db < 1500 * vs) wantV.set(`B${f.slot}`, { f, chunk: 0, dist: db });
      }
    }
    this.wantWater = wantV;
    for (const [k, p] of this.water) {
      if (!wantV.has(k)) {
        this.drop(p);
        this.water.delete(k);
      }
    }
    for (const k of this.lakeBuilds.keys()) if (!wantV.has(k)) this.lakeBuilds.delete(k);

    // ---- retire what is out of range right away (nothing replaces it)
    for (const [c, p] of this.strips) {
      if (!wantS.has(c)) {
        this.drop(p);
        this.strips.delete(c);
      }
    }
    for (const [k, p] of this.tiles) {
      if (!wantK.has(k)) {
        this.drop(p);
        this.tiles.delete(k);
      }
    }

    // ---- job list, nearest first
    const jobs: Job[] = [];
    for (const [c, lod] of wantS) {
      const have = this.strips.get(c);
      if (have && have.lod === lod) continue;
      jobs.push({ priority: Math.abs((Math.floor(c) + 0.5) * len - this.sCam) * 0.5, run: () => this.makeStrip(c, lod) });
    }
    for (const [key, t] of wantT) {
      if (this.terrain.has(key)) continue;
      jobs.push({ priority: t.dist, run: () => this.makeTerrain(key, t.level, t.ix, t.iz) });
    }
    for (const [key, t] of wantK) {
      const have = this.tiles.get(key);
      if (have && have.far === t.far && have.lod === t.lod) continue;
      jobs.push({ priority: t.dist + 150, run: () => this.makeTile(key, t.tx, t.tz, t.far, t.lod) });
    }
    for (const [key, t] of wantG) {
      const have = this.grass.get(key);
      if (have && have.near === t.near) continue;
      jobs.push({ priority: t.dist + 60, run: () => this.makeGrass(key, t.gx, t.gz, t.near) });
    }
    for (const [key, t] of wantW) {
      if (this.woods.has(key)) continue;
      jobs.push({ priority: t.dist * 0.5 + 400, run: () => this.makeWoods(key, t.tx, t.tz) });
    }
    for (const [key, t] of wantV) {
      if (this.water.has(key)) continue;
      jobs.push({ priority: t.dist * 0.6 + 120, run: () => this.makeWater(key) });
    }
    for (const [key, t] of wantC) {
      if (this.seas.has(key)) continue;
      jobs.push({ priority: t.dist * 0.4 + 150, run: () => this.makeSea(key) });
    }
    for (const [key, t] of wantP) {
      if (this.sites.has(key)) continue;
      jobs.push({ priority: t.dist * 0.5 + 90, run: () => this.makeSite(key) });
    }
    jobs.sort((a, b) => a.priority - b.priority);
    this.jobs = jobs;
    this.pruneTerrain();
  }

  /** remove terrain leaves that are no longer wanted, once everything that covers them exists */
  private pruneTerrain(): void {
    for (const [key, leaf] of this.terrain) {
      if (this.wantTerrain.has(key)) continue;
      let covered = true;
      for (const [wk, w] of this.wantTerrain) {
        let overlap: boolean;
        if (w.level >= leaf.level) {
          const sh = w.level - leaf.level;
          overlap = w.ix >> sh === leaf.ix && w.iz >> sh === leaf.iz;
        } else {
          const sh = leaf.level - w.level;
          overlap = leaf.ix >> sh === w.ix && leaf.iz >> sh === w.iz;
        }
        if (overlap && !this.terrain.has(wk)) {
          covered = false;
          break;
        }
      }
      if (covered) {
        this.drop(leaf);
        this.terrain.delete(key);
      }
    }
  }

  // ------------------------------------------------------------------------------------------ building

  private makeStrip(c: number, lod: number): void {
    if (this.wantStrips.get(c) !== lod) return;
    // lod 3 = a far group: key is (first chunk + 0.5), mesh spans FAR_SPAN chunks at far detail
    const b = lod === 3 ? buildStrip(this.world, Math.floor(c), 2, FAR_SPAN) : buildStrip(this.world, c, lod);
    const objects: THREE.Object3D[] = [this.add(new THREE.Mesh(b.geometry, this.stripMat), b.wx, b.wy, b.wz)];
    if (lod <= 1 && ((c % POLE_SPAN) + POLE_SPAN) % POLE_SPAN === 0) {
      const p = buildPoles(this.world, c, POLE_SPAN);
      if (p.poles) {
        const poles = this.add(new THREE.Mesh(p.poles, this.poleMat), p.wx, p.wy, p.wz);
        castShadows(poles);
        objects.push(poles);
      }
      if (p.wires) objects.push(this.add(new THREE.LineSegments(p.wires, this.wireMat), p.wx, p.wy, p.wz));
    }
    const old = this.strips.get(c);
    if (old) this.drop(old);
    this.strips.set(c, { objects, lod });
  }

  private makeTerrain(key: string, level: number, ix: number, iz: number): void {
    if (!this.wantTerrain.has(key) || this.terrain.has(key)) return;
    const b = buildTerrain(this.world, level, ix, iz);
    let mat = this.terrainMat;
    let own: { dispose(): void }[] | null = null;
    if (this.plants && level < 0 && b.chapters) {
      // a leaf of the far ring in a world of version 2 keeps the palettes of its own chapters (render/style.ts
      // ownPalettes): far land may lie in a chapter the four rolling slots do not hold
      const first = b.chapters[0];
      mat = this.farMaterial(first);
      own = [{ dispose: () => this.letFarMaterialGo(first) }];
    }
    const mesh = new THREE.Mesh(b.geometry, mat);
    if (own) mesh.userData.own = own;
    this.terrain.set(key, { objects: [this.add(mesh, b.wx, b.wy, b.wz)], level, ix, iz });
  }

  /**
   * The far land's material with the palettes of chapters `first` … `first` + 3, each in its own slot: the
   * rolling material's code and every other uniform of it, shared by every far leaf whose chapters begin there
   * (a few in all: the far ring's leaves begin in one of five or six chapters), and freed with the last of them.
   */
  private farMaterial(first: number): THREE.ShaderMaterial {
    let m = this.farMats.get(first);
    if (!m) {
      const plan = this.world.spine.plan;
      const biomes = [0, 0, 0, 0];
      for (let c = first; c < first + 4; c++) biomes[c & 3] = plan.biomeOf(c);
      const pal = ownPalettes(biomes);
      const t = this.terrainMat;
      const mat = new THREE.ShaderMaterial({ defines: { ...t.defines }, uniforms: { ...t.uniforms, ...pal.uniforms } as THREE.ShaderMaterial['uniforms'], vertexShader: t.vertexShader, fragmentShader: t.fragmentShader });
      this.farMats.set(first, (m = { mat, pal, users: 0 }));
    }
    m.users++;
    return m.mat;
  }

  private letFarMaterialGo(first: number): void {
    const m = this.farMats.get(first);
    if (!m || --m.users > 0) return;
    this.farMats.delete(first);
    m.mat.dispose();
    m.pal.dispose();
  }

  private makeTile(key: string, tx: number, tz: number, far: boolean, lod: FloraLod): void {
    const want = this.wantTiles.get(key);
    if (!want || want.far !== far || want.lod !== lod) return;
    if (this.plants) {
      this.makeFloraTile(key, tx, tz, lod);
      return;
    }
    // soft ground discs are only needed when there are no real cast shadows
    const s = buildScatter(this.world, tx, tz, far, this.q.shadowSize === 0);
    const objects: THREE.Object3D[] = [];
    for (const batch of s.batches) {
      const isShadow = batch.kind === 'shadow';
      const mat = isShadow ? this.shadowMat : batch.kind === 'rock' ? this.rockMat : batch.kind.startsWith('conifer') ? this.coniferMat : this.treeMat;
      const geo = batch.kind === 'shadow' ? this.shadowGeo : this.kinds![batch.kind];
      const mesh = new THREE.InstancedMesh(geo, mat, batch.count);
      (mesh.instanceMatrix.array as Float32Array).set(batch.matrices);
      mesh.instanceMatrix.needsUpdate = true;
      if (isShadow) mesh.renderOrder = 1;
      else {
        mesh.instanceColor = new THREE.InstancedBufferAttribute(batch.colors, 3);
        castShadows(mesh);
      }
      mesh.computeBoundingSphere();
      objects.push(this.add(mesh, s.wx, s.wy, s.wz));
    }
    const old = this.tiles.get(key);
    if (old) this.drop(old);
    this.tiles.set(key, { objects, far, lod });
  }

  /**
   * A scatter tile of a world of version 2: the plants the flora field stands there, one draw for its trees and
   * one for its shrubs and ground plants (scene/floraScatter.ts, scene/floraMesh.ts).
   */
  private makeFloraTile(key: string, tx: number, tz: number, lod: FloraLod): void {
    const s = buildFloraScatter(this.world, this.plants!, tx, tz, lod, this.q.shadowSize === 0);
    const objects: THREE.Object3D[] = [];
    for (const b of s.batches) {
      const mesh = floraMesh(b, this.floraMat!, TILE);
      // (the shadow map reaches some 190 m from the camera: only the two nearest levels can stand in it. At the
      // nearest a plant throws its own shadow; at the close level the trees' far models throw the tile's, below)
      if (lod === LOD_NEAR) floraShadows(mesh);
      objects.push(this.add(mesh, s.wx, s.wy, s.wz));
    }
    if (s.shadows) {
      // drawn into the shadow map and nowhere else
      const mesh = floraMesh(s.shadows, this.floraMat!, TILE);
      floraShadows(mesh, true);
      objects.push(this.add(mesh, s.wx, s.wy, s.wz));
    }
    if (s.discs) {
      const mesh = new THREE.InstancedMesh(this.shadowGeo, this.shadowMat, s.discCount);
      (mesh.instanceMatrix.array as Float32Array).set(s.discs);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.renderOrder = 1;
      mesh.computeBoundingSphere();
      objects.push(this.add(mesh, s.wx, s.wy, s.wz));
    }
    const old = this.tiles.get(key);
    if (old) this.drop(old);
    this.tiles.set(key, { objects, far: lod >= LOD_MID, lod });
  }

  /** an instanced mesh of `template` with per-instance root and info attributes */
  private instanced(template: THREE.BufferGeometry, mat: THREE.Material, roots: Float32Array, info: Float32Array, count: number): THREE.Mesh {
    const geo = new THREE.InstancedBufferGeometry();
    for (const [name, attr] of Object.entries(template.attributes)) geo.setAttribute(name, (attr as THREE.BufferAttribute).clone());
    geo.setAttribute('aRoot', new THREE.InstancedBufferAttribute(roots, 4));
    geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
    geo.instanceCount = count;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(GRASS_TILE / 2, 0, GRASS_TILE / 2), GRASS_TILE * 0.75 + 6);
    return new THREE.Mesh(geo, mat);
  }

  /**
   * Advance the sliced build `id` (made by `make` the first time) for about SLICE_MS; if it is not
   * finished, carry on at the next turn ahead of everything else. Returns the result once done.
   */
  private slice<T>(id: string, make: () => Slices<T>, again: () => void): { done: true; value: T } | { done: false } {
    let g = this.slicing.get(id) as Slices<T> | undefined;
    if (!g) this.slicing.set(id, (g = make()));
    const t0 = performance.now();
    for (;;) {
      const r = g.next();
      if (r.done) {
        this.slicing.delete(id);
        return { done: true, value: r.value };
      }
      if (performance.now() - t0 > SLICE_MS) break;
    }
    this.jobs.unshift({ priority: 0, run: again });
    return { done: false };
  }

  private makeWoods(key: string, tx: number, tz: number): void {
    if (!this.wantWoods.has(key) || this.woods.has(key)) return;
    const r = this.slice<WoodsTile | null>(`w|${key}|`, () => woodsSlices(this.world, tx, tz), () => this.makeWoods(key, tx, tz));
    if (!r.done) return;
    const w = r.value;
    const objects: THREE.Object3D[] = [];
    if (w) {
      const mesh = this.instanced(this.woodsGeo, this.woodsMat, w.roots, w.info, w.count);
      const mid = (w.minY + w.maxY) / 2;
      mesh.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(WOODS_TILE / 2, mid, WOODS_TILE / 2), WOODS_TILE * 0.72 + (w.maxY - w.minY) / 2 + 40);
      objects.push(this.add(mesh, w.wx, w.wy, w.wz));
    }
    this.woods.set(key, { objects });
  }

  /** a lake's sheet (a few rows per call until it is whole), a length of river, or a bridge */
  private makeWater(key: string): void {
    const want = this.wantWater.get(key);
    if (!want || this.water.has(key)) return;
    const f = want.f;
    if (key[0] === 'L') {
      let build = this.lakeBuilds.get(key);
      if (!build) this.lakeBuilds.set(key, (build = new LakeBuild(this.world, f as Lake)));
      if (!build.step()) {
        // not whole yet: carry on at the next turn, ahead of everything else
        this.jobs.unshift({ priority: 0, run: () => this.makeWater(key) });
        return;
      }
      this.lakeBuilds.delete(key);
      const r = build.result!;
      const mesh = new THREE.Mesh(r.geometry, this.waterMat);
      mesh.renderOrder = 3;
      this.water.set(key, { objects: [this.add(mesh, r.wx, r.wy, r.wz)] });
    } else if (key[0] === 'R') {
      const r = buildRiverChunk(this.world, f as River, want.chunk);
      const objects: THREE.Object3D[] = [];
      if (r) {
        const mesh = new THREE.Mesh(r.geometry, this.waterMat);
        mesh.renderOrder = 3;
        objects.push(this.add(mesh, r.wx, r.wy, r.wz));
      }
      this.water.set(key, { objects });
    } else {
      const b = buildBridge(this.world, f as River);
      const mesh = this.add(new THREE.Mesh(b.geometry, this.bridgeMat), b.wx, b.wy, b.wz);
      castShadows(mesh);
      this.water.set(key, { objects: [mesh] });
    }
  }

  /** a kilometre of a coast's sea, built a few rows per turn */
  private makeSea(key: string): void {
    const want = this.wantSeas.get(key);
    if (!want || this.seas.has(key)) return;
    const r = this.slice<WaterSheet | null>(`c|${key}|`, () => seaSlices(this.world, want.c, want.i), () => this.makeSea(key));
    if (!r.done) return;
    const objects: THREE.Object3D[] = [];
    if (r.value) {
      const mesh = new THREE.Mesh(r.value.geometry, this.waterMat);
      mesh.renderOrder = 3;
      objects.push(this.add(mesh, r.value.wx, r.value.wy, r.value.wz));
    }
    this.seas.set(key, { objects });
  }

  /** a car laid a post or a board flat at arc length s: the poles and the furniture of that stretch are drawn again */
  redrawFurniture(s: number): void {
    const len = STRIP_STATIONS * this.world.spine.ds;
    const c = Math.floor(s / len);
    const g = c - (((c % POLE_SPAN) + POLE_SPAN) % POLE_SPAN);
    const piece = this.strips.get(g);
    if (!piece || piece.lod > 1) return;
    const p = buildPoles(this.world, g, POLE_SPAN);
    for (const o of piece.objects) {
      if (!(o instanceof THREE.Mesh) || o.material !== this.poleMat || !p.poles) continue;
      o.geometry.dispose();
      o.geometry = p.poles;
      p.poles = null;
    }
    // (the wires are as they were)
    p.poles?.dispose();
    p.wires?.dispose();
  }

  /** something of a site was moved (a car shoved a crate): draw it again */
  redrawSite(id: string): void {
    const p = this.sites.get(id);
    if (p) {
      this.drop(p);
      this.sites.delete(id);
    }
    this.slicing.delete(`s|${id}|`);
    // (the next update plans again and finds it missing)
    this.planX = NaN;
  }

  /** a place by the road, or a wreck or a heap of crates on its verge: built a few things per turn */
  private makeSite(key: string): void {
    const want = this.wantSites.get(key);
    if (!want || this.sites.has(key)) return;
    const site = want.site;
    const r = this.slice<THREE.BufferGeometry>(`s|${key}|`, () => siteSlices(site, this.skipObject ?? undefined), () => this.makeSite(key));
    if (!r.done) return;
    const mesh = this.add(new THREE.Mesh(r.value, regionById(site.biome).kin === 'alpine' ? this.siteSnowMat : this.siteMat), site.x, site.y, site.z);
    castShadows(mesh);
    this.sites.set(key, { objects: [mesh] });
  }

  private makeGrass(key: string, gx: number, gz: number, near: boolean): void {
    const want = this.wantGrass.get(key);
    if (!want || want.near !== near) return;
    const r = this.slice<GrassTile | null>(`g|${key}|${near ? 1 : 0}`, () => grassSlices(this.world, gx, gz, this.q.density, near), () => this.makeGrass(key, gx, gz, near));
    if (!r.done) return;
    const g = r.value;
    const objects: THREE.Object3D[] = [];
    if (g) {
      objects.push(this.add(this.instanced(this.grassGeo, this.grassMat, g.roots, g.info, g.count), g.wx, g.wy, g.wz));
      if (g.flowers > 0) objects.push(this.add(this.instanced(this.flowerGeo, this.flowerMat, g.flowerRoots, g.flowerInfo, g.flowers), g.wx, g.wy, g.wz));
    }
    const old = this.grass.get(key);
    if (old) this.drop(old);
    this.grass.set(key, { objects, near });
  }

  // ------------------------------------------------------------------------------------------ frame

  /**
   * @param cx,cz   camera position in world space
   * @param budgetMs time allowed for building this frame; Infinity builds everything now
   */
  update(cx: number, cz: number, budgetMs: number): void {
    const moved = Math.hypot(cx - this.planX, cz - this.planZ);
    if (!(moved < 14)) this.plan(cx, cz);
    if (this.jobs.length === 0) return;
    const t0 = performance.now();
    let ran = 0;
    while (this.jobs.length > 0) {
      const job = this.jobs.shift()!;
      const tj = performance.now();
      job.run();
      const ms = performance.now() - tj;
      if (ms > this.maxBuildMs && Number.isFinite(budgetMs)) this.maxBuildMs = ms;
      this.totalBuilds++;
      ran++;
      if (performance.now() - t0 > budgetMs) break;
    }
    if (ran > 0) this.pruneTerrain();
  }

  get pending(): number {
    return this.jobs.length;
  }

  get counts(): { strips: number; terrain: number; tiles: number; sites: number; pending: number } {
    return { strips: this.strips.size, terrain: this.terrain.size, tiles: this.tiles.size + this.grass.size, sites: this.sites.size, pending: this.jobs.length };
  }
}
