/**
 * The starting workshop's yard (docs/MODCAR.md §9, §17): the concrete apron before the door, the gravel drive out
 * through the gate to where the road begins, the meadow round the barn with its grass and flowers, the old tree
 * behind it and the bushes, the fence round it all. The country beyond is the world's own (the road begins at the
 * gate: core/world WorldOptions.start, deadEnd), which takes this yard as a plot of its land (`YARD_PLOT`): within
 * it the land lies as the yard's height field has it, a hand below the slab and the yard, rolling a little out in
 * the meadow; outside the plot the world's land takes over.
 *
 * World frame as the garage's: x towards the gate and the road (it runs on along +x from ROAD_START_X), y up, z right.
 */
import * as THREE from 'three';
import { fbm2 } from '../../core/math/noise';
import { smoothstep } from '../../core/math/util';
import type { Plot } from '../../core/world/terrain';
import { roadStripMaterial } from '../render/terrainMaterials';
import { flowerMaterial, foliageMaterial, grassMaterial, surfaceMaterial } from '../render/materials';
import { castShadows } from '../render/shadow';
import { PaintBuilder } from '../scene/paintBuilder';
import { buildPlants } from '../scene/vegetation';
import { GRASS_FADE, GRASS_KEEP_FAR, buildFlower, buildGrassTuft } from '../scene/worldBuild';

/** where the world's road begins (s = 0, at the gate's drive, level with the yard; it runs on along +x) */
export const ROAD_START_X = 26;
const SEED = 20261116;

/** the yard: the concrete apron before the door and the gravel drive out to the road */
export const APRON = { x0: 7.25, x1: 15.5, z0: -6.5, z1: 8.0 };
export const DRIVE = { x0: 15.0, x1: ROAD_START_X - 0.4, z0: -2.4, z1: 1.9 };
/** the building's footprint with its slab (the meadow stays below it) */
const FOOT = { x0: -7.3, x1: 7.3, z0: -5.3, z1: 5.3 };
/** the plot the yard is of the world's land: the barn, the yard and the meadow round them (the fence and a little over) */
export const PLOT = { x0: -27, x1: ROAD_START_X, z0: -23, z1: 23 };

function boxDist(x: number, z: number, b: { x0: number; x1: number; z0: number; z1: number }): number {
  const dx = Math.max(b.x0 - x, 0, x - b.x1);
  const dz = Math.max(b.z0 - z, 0, z - b.z1);
  return Math.hypot(dx, dz);
}

/** the same, negative inside the box (how far in from its nearest edge) */
function boxSigned(x: number, z: number, b: { x0: number; x1: number; z0: number; z1: number }): number {
  const out = boxDist(x, z, b);
  return out > 0 ? out : -Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z);
}

/** how far (m) from where the road begins (for the paint: the verge's colours by the distance to a road) */
export function roadDist(x: number, z: number): number {
  return Math.hypot(Math.max(0, ROAD_START_X - x), z);
}

/** is (x, z) on the yard's plot (where the garage's own ground is what the wheels and the feet stand on) */
export function onPlot(x: number, z: number): boolean {
  return x >= PLOT.x0 && x <= PLOT.x1 && z >= PLOT.z0 && z <= PLOT.z1;
}

/**
 * The meadow's height at (x, z): a hand below the slab and the yard, rolling by a hand or two further out (and
 * level by the road's start, where the drive meets it).
 */
export function groundHeight(x: number, z: number): number {
  const yard = Math.min(boxDist(x, z, APRON), boxDist(x, z, DRIVE), boxDist(x, z, FOOT));
  return 0.55 * fbm2(x / 46, z / 46, SEED, 3) * smoothstep(4, 30, yard) * (1 - smoothstep(-14, -4, x - ROAD_START_X) * (1 - smoothstep(8, 16, Math.abs(z)))) - 0.08 - 0.1 * smoothstep(0.5, 6, yard);
}

/**
 * The yard as a plot of the world's land (core/world WorldOptions.plots): the meadow's height, let down a little
 * under the yard's strip (its concrete and gravel are drawn over the land: nothing to fight with)
 */
export const YARD_PLOT: Plot = {
  ...PLOT,
  skirt: 26,
  height: (x, z) => groundHeight(x, z) - 0.35 * stripInside(x, z),
};

export interface Outdoors {
  readonly root: THREE.Group;
  dispose(): void;
}

/**
 * A strip of the road-strip material over a grid: the yard (its lot field says concrete slabs, gravel or ground),
 * lateral offset across and distance along as the road's own strip has them.
 */
function stripGeometry(
  xs: number[],
  zs: number[],
  attr: (x: number, z: number) => { lat: number; along: number; lot: number },
): THREE.BufferGeometry {
  const nx = xs.length;
  const nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  const bw = new Float32Array(nx * nz * 4);
  const gd = new Float32Array(nx * nz * 4);
  const rd = new Float32Array(nx * nz * 4);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = xs[i];
      const z = zs[j];
      const a = attr(x, z);
      pos[k * 3] = x;
      pos[k * 3 + 1] = stripHeight(x, z);
      pos[k * 3 + 2] = z;
      bw[k * 4] = 1;
      gd[k * 4] = Math.min(roadDist(x, z), 2000);
      gd[k * 4 + 1] = 0;
      gd[k * 4 + 2] = 0;
      gd[k * 4 + 3] = -40;
      rd[k * 4] = a.lat;
      rd[k * 4 + 1] = a.along;
      rd[k * 4 + 2] = 0;
      rd[k * 4 + 3] = a.lot;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      idx.push(a, a + nx, a + nx + 1, a, a + nx + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aBiomeW', new THREE.BufferAttribute(bw, 4));
  g.setAttribute('aGround', new THREE.BufferAttribute(gd, 4));
  g.setAttribute('aRoad', new THREE.BufferAttribute(rd, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** the strip of road-strip material over the yard: from the front of the garage to where the road begins */
const STRIP = { x0: FOOT.x1 - 0.06, x1: ROAD_START_X, z0: -10, z1: 10.5 };

/** the strip's surface: the yard level with the garage floor, the rest follows the meadow */
function stripHeight(x: number, z: number): number {
  const lot = Math.abs(yardLot(x, z));
  return groundHeight(x, z) * (1 - lot);
}

/** what a wheel or a foot stands on at (x, z) on the plot: the slab, the yard, or the meadow */
export function visibleHeight(x: number, z: number): number {
  if (x >= FOOT.x0 && x <= FOOT.x1 && z >= FOOT.z0 && z <= FOOT.z1) return 0;
  if (x >= STRIP.x0 && x <= STRIP.x1 && z >= STRIP.z0 && z <= STRIP.z1) return stripHeight(x, z);
  return groundHeight(x, z);
}

/** the ground's kind at (x, z) on the plot: 0 concrete, 1 gravel, 3 grass (Surface ids of core/world/ground) */
export function surfaceKind(x: number, z: number): number {
  if (x >= FOOT.x0 && x <= FOOT.x1 && z >= FOOT.z0 && z <= FOOT.z1) return 0;
  const lot = yardLot(x, z);
  if (lot < -0.5) return 0;
  if (lot > 0.5) return 1;
  return 3;
}

/** 0 at the strip's edge (and outside it) … 1 a metre and a half in */
function stripInside(x: number, z: number): number {
  const d = Math.min(x - STRIP.x0, STRIP.x1 - x, z - STRIP.z0, STRIP.z1 - z);
  return smoothstep(0.2, 1.5, d);
}

function range(a: number, b: number, step: number): number[] {
  const out: number[] = [];
  for (let v = a; v < b - 1e-6; v += step) out.push(v);
  out.push(b);
  return out;
}

/** how much of a yard point is the apron's concrete (−) or the drive's gravel (+), 0 = meadow */
function yardLot(x: number, z: number): number {
  const ragged = 0.6 * fbm2(x / 3, z / 3, SEED + 31, 2);
  // (ragged at its edges, whole within them)
  const inApron = 1 - smoothstep(-0.3, 0.9, boxSigned(x, z, APRON) + ragged * 0.6);
  // the drive is two wheel tracks with grass up the middle (where the car's centre line runs, z = -0.25), gravel
  // all over where it meets the road (none of it ragged there: the road's edge is a straight one)
  const middle = (1 - smoothstep(0.25, 0.5, Math.abs(z + 0.25))) * (1 - smoothstep(ROAD_START_X - 4, ROAD_START_X - 2, x));
  const nearRoad = smoothstep(ROAD_START_X - 3, ROAD_START_X - 0.6, x);
  const inDrive = (1 - smoothstep(-0.5, 1.4, boxDist(x, z, DRIVE) + ragged * (1 - nearRoad))) * (1 - middle * smoothstep(15.8, 16.8, x));
  if (inApron >= inDrive) return -inApron;
  return inDrive;
}

/** a small deterministic generator (the same meadow every time) */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** is (x, z) bare of the yard's grass: the building, the yard's concrete and gravel, off the plot (the world's grass there) */
function bare(x: number, z: number): boolean {
  if (x > FOOT.x0 - 0.05 && x < FOOT.x1 + 0.05 && z > FOOT.z0 - 0.05 && z < FOOT.z1 + 0.05) return true;
  if (!onPlot(x, z) || x > ROAD_START_X - 0.6) return true;
  if (Math.abs(yardLot(x, z)) > 0.45) return true;
  return false;
}

/** an instanced mesh of `template` with per-instance root and info (the world's grass and flowers) */
function instancedTufts(template: THREE.BufferGeometry, mat: THREE.Material, roots: number[], info: number[], centre: THREE.Vector3, radius: number): THREE.Mesh {
  const geo = new THREE.InstancedBufferGeometry();
  for (const [name, attr] of Object.entries(template.attributes)) geo.setAttribute(name, (attr as THREE.BufferAttribute).clone());
  geo.setAttribute('aRoot', new THREE.InstancedBufferAttribute(new Float32Array(roots), 4));
  geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(new Float32Array(info), 4));
  geo.instanceCount = roots.length / 4;
  geo.boundingSphere = new THREE.Sphere(centre, radius);
  return new THREE.Mesh(geo, mat);
}

/**
 * The meadow's grass round the garage, as the world grows it (STYLE.md §5): a tuft every 0.36 m near
 * the building, fewer further out (the shader shrinks those away at their distance), taller weeds along
 * the walls where nobody mows, short at the yard's edge; drifts of flowers in it.
 */
function meadow(root: THREE.Group, mats: THREE.Material[]): void {
  const rnd = mulberry(SEED + 99);
  const cell = 0.36;
  const R = 40;
  // four quarters round the garage, each its own mesh (they are culled apart)
  const quarters: { roots: number[]; info: number[]; fr: number[]; fi: number[] }[] = [0, 1, 2, 3].map(() => ({ roots: [], info: [], fr: [], fi: [] }));
  const cx0 = 2;
  for (let gz = -R; gz < R; gz += cell) {
    for (let gx = -R; gx < R; gx += cell) {
      const x = cx0 + gx + rnd() * cell;
      const z = gz + rnd() * cell;
      const d = Math.hypot(x - cx0, z);
      if (d > R) continue;
      if (bare(x, z)) continue;
      const toWall = Math.hypot(Math.max(Math.abs(x) - 7.3, 0), Math.max(Math.abs(z) - 5.3, 0));
      // fewer tufts out in the field: the far ones are the ones far tiles keep
      const keep = rnd();
      if (d > 15 && keep > GRASS_KEEP_FAR * 0.85 * (1 - smoothstep(15, R, d) * 0.6)) continue;
      const r3 = rnd();
      const yard = Math.abs(yardLot(x, z));
      // weeds grow tall against the walls, the yard's edge is trodden short
      const size = (0.75 + 0.7 * r3 * r3) * (1 + 0.55 * (1 - smoothstep(0.2, 1.4, toWall))) * (1 - 0.5 * smoothstep(0.1, 0.45, yard)) * (roadDist(x, z) < 6 ? 0.7 : 1);
      const q = quarters[(x > cx0 ? 1 : 0) + (z > 0 ? 2 : 0)];
      const y = visibleHeight(x, z) - 0.04;
      q.roots.push(x, y, z, size);
      const comb = fbm2(x / 60, z / 60, SEED + 0x3c0, 1) * 2.4;
      q.info.push(0, 0, Math.min(keep, 0.999), comb + (r3 - 0.5) * 1.4);
      // flowers in drifts
      const drift = fbm2(x / 46, z / 46, SEED + 0x5ee, 2);
      if (drift > 0.15 && rnd() < 0.05 && toWall > 0.6) {
        q.fr.push(x + 0.05, y, z - 0.04, 0.8 + 0.5 * rnd());
        q.fi.push(Math.floor(rnd() * 3) % 3, keep * 0.3, rnd() * 6.283, 0);
      }
    }
  }
  const tuft = buildGrassTuft();
  const flower = buildFlower();
  const gm = grassMaterial(GRASS_FADE, GRASS_KEEP_FAR);
  const fm = flowerMaterial(GRASS_FADE, GRASS_KEEP_FAR);
  mats.push(gm, fm);
  for (const [i, q] of quarters.entries()) {
    const c = new THREE.Vector3(cx0 + (i & 1 ? 1 : -1) * R * 0.5, 0, (i & 2 ? 1 : -1) * R * 0.5);
    if (q.roots.length) {
      const m = instancedTufts(tuft, gm, q.roots, q.info, c, R * 0.75);
      m.name = 'garage:grass';
      root.add(m);
    }
    if (q.fr.length) {
      const m = instancedTufts(flower, fm, q.fr, q.fi, c, R * 0.75);
      m.name = 'garage:flowers';
      root.add(m);
    }
  }
}

/** trees and bushes on the plot: an old tree behind the workshop and its neighbours, bushes along the back fence */
function trees(root: THREE.Group, mats: THREE.Material[]): void {
  const kinds = buildPlants() as unknown as Record<string, THREE.BufferGeometry>;
  const mat = foliageMaterial({ sway: 1, snowCap: 0 });
  mats.push(mat);
  const rnd = mulberry(SEED + 7);
  const list: Record<string, { x: number; z: number; s: number; rot: number }[]> = { broadleaf: [], broadleaf2: [], broadleaf3: [], bush: [] };
  const put = (kind: string, x: number, z: number, s: number): void => {
    if (bare(x, z) || (Math.abs(x - 2) < 9.5 && Math.abs(z) < 8)) return;
    list[kind].push({ x, z, s, rot: rnd() * 6.283 });
  };
  // the old tree behind the workshop and its neighbours
  put('broadleaf3', -14, 8.5, 1.55);
  put('broadleaf', -16, -7, 1.2);
  put('broadleaf2', 5, 16.5, 1.25);
  put('broadleaf', -4, 17, 1.05);
  // bushes along the back fence (the country beyond the plot is the world's, with its own trees)
  for (let k = 0; k < 18; k++) put('bush', -10 - rnd() * 14, -20 + rnd() * 40, 0.8 + rnd() * 0.6);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (const [kind, items] of Object.entries(list)) {
    if (!items.length) continue;
    const mesh = new THREE.InstancedMesh(kinds[kind], mat, items.length);
    items.forEach((t, i) => {
      e.set((rnd() - 0.5) * 0.06, t.rot, (rnd() - 0.5) * 0.06);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(t.x, groundHeight(t.x, t.z) - 0.05, t.z), q, new THREE.Vector3(t.s, t.s * (0.92 + rnd() * 0.16), t.s));
      mesh.setMatrixAt(i, m4);
    });
    // (instance colour: the palette slots of the spot — the garage stage paints every slot as its own country)
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(items.length * 3), 3);
    mesh.computeBoundingSphere();
    mesh.name = `garage:trees:${kind}`;
    castShadows(mesh);
    root.add(mesh);
  }
}

/** the fence round the yard: posts and two rails, open where the drive goes out to the road */
function fence(root: THREE.Group, mats: THREE.Material[]): void {
  const b = new PaintBuilder();
  const FENCE = 0x8a6a4c;
  const rnd = mulberry(SEED + 31);
  const run = (x0: number, z0: number, x1: number, z1: number): void => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 2.4));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const x = x0 + (x1 - x0) * u;
      const z = z0 + (z1 - z0) * u;
      const h = visibleHeight(x, z);
      b.bar(x, h - 0.1, z, x + (rnd() - 0.5) * 0.06, h + 1.15, z, 0.1, FENCE);
      if (i < n) {
        const xn = x0 + ((x1 - x0) * (i + 1)) / n;
        const zn = z0 + ((z1 - z0) * (i + 1)) / n;
        const hn = visibleHeight(xn, zn);
        for (const ry of [0.45, 0.95]) b.bar(x, h + ry, z, xn, hn + ry + (rnd() - 0.5) * 0.06, zn, 0.06, FENCE);
      }
    }
  };
  const gx = 18.5;
  run(-13, -14, gx, -14);
  run(-13, 15, gx, 15);
  run(-13, -14, -13, 15);
  run(gx, -14, gx, -4.2);
  run(gx, 4.2, gx, 15);
  const mat = surfaceMaterial({ vertexColors: true, flat: true, snowCap: 0 });
  mats.push(mat);
  const mesh = new THREE.Mesh(b.build(), mat);
  mesh.name = 'garage:fence';
  castShadows(mesh);
  root.add(mesh);
}

/** the yard, under `parent` (the garage's root: it goes where the garage goes, a rebase of the origin too) */
export function buildOutdoors(parent: THREE.Object3D): Outdoors {
  const root = new THREE.Group();
  root.name = 'garage:outdoors';
  const stripMat = roadStripMaterial();
  // the apron's slabs and the drive's gravel are the strip's 'lots'; the drive runs into the road's start
  const xs = [...range(STRIP.x0, STRIP.x1, 0.5)];
  const zs = [...range(STRIP.z0, STRIP.z1, 0.5)];
  const yard = new THREE.Mesh(
    stripGeometry(xs, zs, (x, z) => ({ lat: 40 + Math.abs(z), along: x, lot: yardLot(x, z) })),
    stripMat,
  );
  yard.name = 'garage:yard';
  root.add(yard);
  const extra: THREE.Material[] = [];
  meadow(root, extra);
  trees(root, extra);
  fence(root, extra);
  parent.add(root);
  return {
    root,
    dispose: () => {
      root.removeFromParent();
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      stripMat.dispose();
      for (const m of extra) m.dispose();
    },
  };
}
