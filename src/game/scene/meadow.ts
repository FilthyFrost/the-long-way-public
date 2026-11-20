/**
 * The meadow of a world of version 2, as Painted Valley grows its grass (lib/blades.js, MIT: THIRD-PARTY-NOTICES.md):
 * rings of instanced blades following the eye, near ones fine and dense, far ones wider and fewer, out to some
 * 120 m, every blade placed and shaped by the number of its world cell on the GPU (render/meadowMaterial.ts). What
 * the grass is where a blade stands comes from the meadow's map: a square of the land's 2 m samples
 * (worldBuild.ts meadowSample — the same a grass tile's tufts were read from) round the vehicle, held in textures
 * whose texels wrap round (a sample of world column i lies in texel column i mod N), so that as one goes only the
 * samples newly come into the square are taken, the nearest first, a few hundred a frame.
 *
 * The flowers stay the grass tiles' (worldBuild.ts grassSlices, `flowersOnly`); a world of version 1 keeps its tufts.
 */
import * as THREE from 'three';
import type { World } from '../../core/world/terrain';
import { TerrainPoint } from '../../core/world/terrain';
import type { RenderCore } from '../render/core';
import { MEADOW_MAP, MEADOW_SCALE, meadowMaterial, meadowRingGeometry, meadowUniforms } from '../render/meadowMaterial';
import { MeadowSample, meadowSample } from './worldBuild';

/**
 * The rings: cell (m between blades), tile (m a side) × tiles a side the square of ground a ring covers round the eye,
 * rows of vertices up a blade, blades to a cell, fade (in from, to; out from, to: m), width against a near blade,
 * tops (how much a blade stands for many, of which one sees the tops). Painted Valley's rings, their cells made
 * whole parts of the 256 m the render origin moves by (render/core.ts maybeRebase): a blade's cell is counted from
 * the origin, and stays the same cell when the origin moves.
 */
export const RINGS = [
  // (the performance budget, docs/V3/perf-budget.json: grass and flowers 1.2 M triangles. A blade's rows are its bends:
  // eight near the eye, where a blade is a hand tall on the screen; beyond 13 m a blade is a few pixels and one bend is
  // all it shows. The cells a little wider than Painted Valley's, each still a whole part of 256 m and of its tile.)
  { name: 'near', cell: 256 / 4096, tile: 3, tiles: 6, rows: 6, sub: 1, fade: [-2, -1, 2.8, 6], width: 1.12, tops: 0 },
  { name: 'mid', cell: 256 / 2560, tile: 6.4, tiles: 8, rows: 3, sub: 1, fade: [2.8, 6, 13, 21.6], width: 2.05, tops: 0.05 },
  { name: 'wide', cell: 256 / 1152, tile: 16, tiles: 8, rows: 2, sub: 1, fade: [13, 21.6, 34, 48], width: 4.9, tops: 0.22 },
  { name: 'far', cell: 256 / 300, tile: 40.96, tiles: 8, rows: 2, sub: 3, fade: [34, 48, 80, 96], width: 12.4, tops: 0.4 },
] as const;

/** the meadow reaches this far from the eye (m): the far ring's last blades */
export const MEADOW_REACH = 96;

const N = MEADOW_MAP.n;
const SP = MEADOW_MAP.spacing;
/** (no sample of the world has this column or row) */
const NONE = -0x7fffffff;

const byte = (v: number): number => (v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255));
const mod = (a: number, n: number): number => ((a % n) + n) % n;

/**
 * The meadow's map: N × N samples of the land 2 m apart round a point, in three textures (render/meadowMaterial.ts
 * meadowUniforms). Texel (c, r) holds the sample of world column i and row j with i ≡ c, j ≡ r (mod N), for the
 * i0 ≤ i < i0 + N, j0 ≤ j < j0 + N of the square; a texel that does not hold its sample yet says bare.
 */
export class MeadowMap {
  /** per texel: the ground's height, and the palette pair + 0.98 × share (+ 16 where bare) */
  readonly a = new Float32Array(N * N * 2);
  /** per texel, 8 bits each: road distance, how much grows, how tall, how mown (MEADOW_SCALE) */
  readonly b = new Uint8Array(N * N * 4);
  /** per texel, 8 bits each: towards a shore, the old road's weeds, the woods */
  readonly c = new Uint8Array(N * N * 4);
  readonly texA: THREE.DataTexture;
  readonly texB: THREE.DataTexture;
  readonly texC: THREE.DataTexture;
  /** the world column and row of the square's first sample */
  i0 = NONE;
  j0 = NONE;
  /** which sample each texel holds (NONE: none yet) */
  private readonly hasI = new Int32Array(N * N).fill(NONE);
  private readonly hasJ = new Int32Array(N * N).fill(NONE);
  /** texels of the square not holding their sample yet */
  pending = 0;
  /** the ring (squares round the middle, 0 the middle's) the filling has got to */
  private ring = 0;
  /** something was written since the textures last went up */
  dirty = false;
  private readonly s = new MeadowSample();

  constructor(private readonly world: World) {
    for (let t = 0; t < N * N; t++) this.a[t * 2 + 1] = 16;
    const make = (data: Float32Array | Uint8Array, format: THREE.PixelFormat, type: THREE.TextureDataType, linear: boolean): THREE.DataTexture => {
      const tex = new THREE.DataTexture(data, N, N, format, type);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.magFilter = tex.minFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.needsUpdate = true;
      return tex;
    };
    this.texA = make(this.a, THREE.RGFormat, THREE.FloatType, false);
    this.texB = make(this.b, THREE.RGBAFormat, THREE.UnsignedByteType, true);
    this.texC = make(this.c, THREE.RGBAFormat, THREE.UnsignedByteType, true);
  }

  /** the square round world point (x, z): samples gone out of it are forgotten (bare) until their new ones are taken */
  follow(x: number, z: number): void {
    const i0 = Math.floor(x / SP) - N / 2;
    const j0 = Math.floor(z / SP) - N / 2;
    if (i0 === this.i0 && j0 === this.j0) return;
    this.i0 = i0;
    this.j0 = j0;
    this.ring = 0;
    let pending = 0;
    for (let r = 0; r < N; r++) {
      const j = j0 + mod(r - j0, N);
      for (let c = 0; c < N; c++) {
        const t = r * N + c;
        if (this.hasJ[t] === j && this.hasI[t] === i0 + mod(c - i0, N)) continue;
        pending++;
        if (this.a[t * 2 + 1] < 16) {
          this.a[t * 2 + 1] = 16;
          this.dirty = true;
        }
      }
    }
    this.pending = pending;
  }

  /** the sample at world column i, row j: is it in the texels yet */
  holds(i: number, j: number): boolean {
    const t = mod(j, N) * N + mod(i, N);
    return this.hasI[t] === i && this.hasJ[t] === j;
  }

  /** the ground's height there as the map holds it (NaN where it does not yet) */
  heightAt(i: number, j: number): number {
    return this.holds(i, j) ? this.a[(mod(j, N) * N + mod(i, N)) * 2] : NaN;
  }

  /** take the samples not yet held, the nearest the middle first, until `budgetMs` is spent; returns how many */
  fill(budgetMs: number): number {
    if (this.pending === 0 || this.i0 === NONE) return 0;
    const t0 = performance.now();
    const m = N / 2;
    let n = 0;
    for (let k = this.ring; k <= m; k++) {
      // the square ring k round the middle sample (m, m) of the square
      for (let v = m - k; v <= m + k; v++) {
        if (v < 0 || v >= N) continue;
        const edge = v === m - k || v === m + k;
        for (let u = m - k; u <= m + k; u += edge ? 1 : 2 * k) {
          if (u >= 0 && u < N && this.take(this.i0 + u, this.j0 + v)) {
            n++;
            if ((n & 15) === 0 && performance.now() - t0 > budgetMs) {
              this.ring = k;
              return n;
            }
          }
          if (k === 0) break;
        }
      }
      this.ring = k + 1;
    }
    return n;
  }

  /** take the sample of column i, row j if its texel does not hold it */
  private take(i: number, j: number): boolean {
    const t = mod(j, N) * N + mod(i, N);
    if (this.hasI[t] === i && this.hasJ[t] === j) return false;
    const s = meadowSample(this.world, i * SP, j * SP, this.s);
    this.a[t * 2] = s.y;
    this.a[t * 2 + 1] = s.pair + 0.98 * s.share + (s.bare > 0 ? 16 : 0);
    const S = MEADOW_SCALE;
    this.b[t * 4] = byte(s.ad / S.ad);
    this.b[t * 4 + 1] = byte(s.grow / S.grow);
    this.b[t * 4 + 2] = byte(s.tall / S.tall);
    this.b[t * 4 + 3] = byte(s.mow);
    this.c[t * 4] = byte(s.shore / S.shore);
    this.c[t * 4 + 1] = byte(s.lush);
    this.c[t * 4 + 2] = byte(s.canopy);
    this.hasI[t] = i;
    this.hasJ[t] = j;
    this.pending--;
    this.dirty = true;
    return true;
  }

  /** send what was written to the GPU */
  upload(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.texA.needsUpdate = true;
    this.texB.needsUpdate = true;
    this.texC.needsUpdate = true;
  }

  dispose(): void {
    this.texA.dispose();
    this.texB.dispose();
    this.texC.dispose();
  }
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Ring {
  readonly def: (typeof RINGS)[number];
  readonly geometry: THREE.InstancedBufferGeometry;
  readonly material: THREE.ShaderMaterial;
  readonly count: number;
  readonly tiles: { mesh: THREE.Mesh; i: number; j: number }[];
  /** the tile the eye is in (world), and the origin the tiles were placed for */
  at: [number, number];
  ox: number;
  oz: number;
}

/** The meadow: its map and its rings, in a group of the scene. */
export class Meadow {
  readonly group = new THREE.Group();
  readonly map: MeadowMap;
  private readonly rings: Ring[];
  private readonly tp = new TerrainPoint();
  private readonly eye = new THREE.Vector3();
  private readonly off: () => void;

  constructor(
    private readonly core: RenderCore,
    private readonly world: World,
    density: number,
  ) {
    this.group.name = 'meadow';
    this.map = new MeadowMap(world);
    meadowUniforms.tMeadowA.value = this.map.texA;
    meadowUniforms.tMeadowB.value = this.map.texB;
    meadowUniforms.tMeadowC.value = this.map.texC;
    meadowUniforms.uDensity.value = 1;
    meadowUniforms.uLift.value = world.spine.lift;
    const random = mulberry32(world.seed * 977 + 3);
    this.rings = RINGS.map((def, index) => {
      const { geometry, count } = meadowRingGeometry(def, random);
      geometry.instanceCount = Math.max(1, Math.round(count * Math.min(1, Math.max(0.05, density))));
      // (a tile's ground may rise and fall within it: the sphere it is culled by is roomy)
      geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(def.tile / 2, 0.3, def.tile / 2), def.tile * 0.9 + 3);
      const material = meadowMaterial({ cell: def.cell, rows: def.rows, fade: def.fade, width: def.width, tops: def.tops, salt: index * 101 + (world.seed & 0xffff) });
      const tiles: Ring['tiles'] = [];
      for (let j = 0; j < def.tiles; j++) {
        for (let i = 0; i < def.tiles; i++) {
          const mesh = new THREE.Mesh(geometry, material);
          mesh.matrixAutoUpdate = false;
          mesh.name = `meadow.${def.name}`;
          tiles.push({ mesh, i: i - def.tiles / 2, j: j - def.tiles / 2 });
          this.group.add(mesh);
        }
      }
      return { def, geometry, material, count, tiles, at: [NaN, NaN], ox: NaN, oz: NaN };
    });
    core.scene.add(this.group);
    this.off = core.onFrame(() => this.frame());
  }

  /** samples of the map still to take (the world is not all there until they are) */
  get pending(): number {
    return this.map.pending;
  }

  /** the map round world point (x, z) (the vehicle, the walker), and as much of it taken as `budgetMs` allows */
  update(x: number, z: number, budgetMs: number): void {
    this.map.follow(x, z);
    this.map.fill(budgetMs);
  }

  /** every frame, before it is drawn: the rings under the eye, the map's place, what was taken sent up */
  private frame(): void {
    const o = this.core.origin;
    const cam = this.core.camera;
    cam.getWorldPosition(this.eye);
    const ex = this.eye.x + o.x;
    const ez = this.eye.z + o.z;
    for (const r of this.rings) {
      const T = r.def.tile;
      const sx = Math.floor(ex / T);
      const sz = Math.floor(ez / T);
      this.cull(r, ex, ez);
      if (sx === r.at[0] && sz === r.at[1] && r.ox === o.x && r.oz === o.z) continue;
      r.at = [sx, sz];
      r.ox = o.x;
      r.oz = o.z;
      // (the origin moves in whole steps of 256 m, a whole number of the ring's cells)
      (r.material.uniforms.uOriginCell.value as THREE.Vector2).set(Math.round(o.x / r.def.cell), Math.round(o.z / r.def.cell));
      for (const tile of r.tiles) {
        const wx = (sx + tile.i) * T;
        const wz = (sz + tile.j) * T;
        const ci = Math.floor((wx + T / 2) / MEADOW_MAP.spacing);
        const cj = Math.floor((wz + T / 2) / MEADOW_MAP.spacing);
        let y = this.map.heightAt(ci, cj);
        if (!(y === y)) {
          this.world.shape(wx + T / 2, wz + T / 2, this.tp);
          y = this.tp.bed;
        }
        tile.mesh.position.set(wx - o.x, y - o.y, wz - o.z);
        tile.mesh.updateMatrix();
        tile.mesh.updateMatrixWorld(true);
      }
    }
    const m = this.map;
    if (m.i0 !== NONE) {
      meadowUniforms.uMapOrigin.value.set(m.i0 * SP - o.x, m.j0 * SP - o.z);
      meadowUniforms.uMapBase.value.set(mod(m.i0, N), mod(m.j0, N));
    }
    meadowUniforms.uOriginY.value = o.y;
    m.upload();
  }

  /**
   * Only the tiles of a ring that reach into its band of the meadow are drawn: a tile wholly beyond where the ring's
   * blades have all gone, or wholly within where none of them has come yet, would run every one of its blades through
   * the GPU to draw none (the eye's world position ex, ez).
   */
  private cull(r: Ring, ex: number, ez: number): void {
    const T = r.def.tile;
    const [inFrom, , , outTo] = r.def.fade;
    const sx = Math.floor(ex / T);
    const sz = Math.floor(ez / T);
    for (const tile of r.tiles) {
      const x0 = (sx + tile.i) * T;
      const z0 = (sz + tile.j) * T;
      const dx = ex < x0 ? x0 - ex : ex > x0 + T ? ex - x0 - T : 0;
      const dz = ez < z0 ? z0 - ez : ez > z0 + T ? ez - z0 - T : 0;
      const near = Math.hypot(dx, dz);
      const far = Math.hypot(Math.max(ex - x0, x0 + T - ex), Math.max(ez - z0, z0 + T - ez));
      tile.mesh.visible = near < outTo && far > inFrom;
    }
  }

  /** blades drawn this frame by ring (tiles in view × blades a tile): for the developer's figures */
  get blades(): number {
    let n = 0;
    for (const r of this.rings) n += r.tiles.length * r.geometry.instanceCount * r.def.sub;
    return n;
  }

  dispose(): void {
    this.off();
    this.core.scene.remove(this.group);
    for (const r of this.rings) {
      r.geometry.dispose();
      r.material.dispose();
    }
    this.map.dispose();
  }
}

