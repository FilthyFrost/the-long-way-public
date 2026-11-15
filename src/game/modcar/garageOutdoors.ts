/**
 * The country round the starting garage (docs/MODCAR.md §9): what is seen through its door and
 * windows must be the world the road runs through, painted the same way — meadow grass, the road
 * past the gate, copses, rolling hills, far blue ranges. Built here from the world's own shaders
 * (terrainMaterial, roadStripMaterial, grass, foliage) over a height field of its own, since the
 * garage stage has no World: the yard and the road in front stay flat, the meadow rolls a little,
 * hills rise beyond the road and mountains stand on the skyline.
 *
 * World frame as the garage's: x towards the road (it runs along z at x = ROAD_X), y up, z right.
 */
import * as THREE from 'three';
import { fbm2, ridged2 } from '../../core/math/noise';
import { smoothstep } from '../../core/math/util';
import { roadStripMaterial, terrainMaterial, wireMaterial } from '../render/terrainMaterials';
import { flowerMaterial, foliageMaterial, grassMaterial, surfaceMaterial } from '../render/materials';
import { castShadows } from '../render/shadow';
import { woodland } from '../scene/palette';
import { PaintBuilder } from '../scene/paintBuilder';
import { buildPlants } from '../scene/vegetation';
import { GRASS_FADE, GRASS_KEEP_FAR, buildFlower, buildGrassTuft } from '../scene/worldBuild';
import type { RenderCore } from '../render/core';

/** the road's centre line (it runs along z) */
export const ROAD_X = 24;
const SEED = 20261116;

/** the yard: the concrete apron before the door and the gravel drive out to the road */
export const APRON = { x0: 7.25, x1: 15.5, z0: -6.5, z1: 8.0 };
export const DRIVE = { x0: 15.0, x1: ROAD_X - 3.4, z0: -2.4, z1: 1.9 };
/** the building's footprint with its slab (the meadow stays below it) */
const FOOT = { x0: -7.3, x1: 7.3, z0: -5.3, z1: 5.3 };

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

/** how far out from the road's centre line (m) */
export function roadDist(x: number, z: number): number {
  void z;
  return Math.abs(x - ROAD_X);
}

/**
 * The ground's height at (x, z): flat where the yard, the building and the road are; a meadow that
 * rolls by a hand or two near by, hills of tens of metres past the first fields, mountains far off.
 */
export function groundHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const yard = Math.min(boxDist(x, z, APRON), boxDist(x, z, DRIVE), boxDist(x, z, FOOT));
  // the meadow rolls a little (and is a hand below the slab and the yard)
  let h = 0.55 * fbm2(x / 46, z / 46, SEED, 3) * smoothstep(4, 30, yard) - 0.08 - 0.1 * smoothstep(0.5, 6, yard);
  // gentle rises over the first fields, behind the garage and across the road
  h += 7 * (fbm2(x / 210, z / 210, SEED + 7, 3) + 0.25) * smoothstep(60, 260, r);
  // hills
  h += 60 * Math.max(0, fbm2(x / 900, z / 900, SEED + 11, 4) + 0.35) * smoothstep(300, 1500, r);
  // the ranges on the skyline
  h += 1350 * Math.pow(ridged2(x / 7000, z / 7000, SEED + 13, 4), 1.6) * smoothstep(2200, 8000, r);
  // the road lies on its own level band
  const ad = roadDist(x, z);
  const along = Math.abs(z);
  const roadBand = (1 - smoothstep(6, 26, ad)) * (1 - smoothstep(1500, 2600, along));
  return h * (1 - roadBand);
}

/** the relief above the valley floor (for the paint: tree line, bare rock) */
function relief(x: number, z: number, h: number): number {
  void x;
  void z;
  return Math.max(0, h);
}

function wood(x: number, z: number, h: number): number {
  const ad = Math.min(roadDist(x, z), Math.hypot(x, z) * 0.9);
  return woodland(0, SEED, x, z, ad, relief(x, z, h));
}

export interface Outdoors {
  readonly root: THREE.Group;
  dispose(): void;
}

/** a polar grid of terrain round the garage: rings every 2 m near by, growing out to the skyline */
function terrainGeometry(): THREE.BufferGeometry {
  const radii: number[] = [0];
  for (let r = 2.5; r <= 70; r += 2.5) radii.push(r);
  let r = 70;
  while (r < 21000) {
    r *= 1.085;
    radii.push(r);
  }
  const seg = 128;
  const nv = radii.length * seg;
  const pos = new Float32Array(nv * 3);
  const bw = new Float32Array(nv * 4);
  const gd = new Float32Array(nv * 4);
  for (let i = 0; i < radii.length; i++) {
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      // the centre of the rings sits over the yard, so the near grid is finest where it is seen most
      const x = 8 + Math.cos(a) * radii[i];
      const z = Math.sin(a) * radii[i];
      const h = groundHeight(x, z);
      const k = i * seg + j;
      pos[k * 3] = x;
      // under the strip (road and yard) the open terrain is let down a little: nothing to fight with
      pos[k * 3 + 1] = h - 0.35 * stripInside(x, z);
      pos[k * 3 + 2] = z;
      bw[k * 4] = 1;
      gd[k * 4] = Math.min(roadDist(x, z), 2000);
      gd[k * 4 + 1] = relief(x, z, h);
      gd[k * 4 + 2] = wood(x, z, h);
      gd[k * 4 + 3] = -40;
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < radii.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j;
      const b = i * seg + ((j + 1) % seg);
      const c = (i + 1) * seg + ((j + 1) % seg);
      const d = (i + 1) * seg + j;
      idx.push(a, b, c, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aBiomeW', new THREE.BufferAttribute(bw, 4));
  g.setAttribute('aGround', new THREE.BufferAttribute(gd, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * A strip of the road-strip material over a grid: the road itself (lateral offset across, distance
 * along), or the yard (its lot field says concrete slabs, gravel or ground).
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

/** the strip of road-strip material: the yard and the road, from the front of the garage to beyond the road */
const STRIP = { x0: FOOT.x1 - 0.06, x1: ROAD_X + 16, z0: -2400, z1: 2400 };

/** the strip's surface: the yard and the road are level with the garage floor, the rest follows the meadow */
function stripHeight(x: number, z: number): number {
  const lot = x < ROAD_X - 2.5 ? Math.abs(yardLot(x, z)) : 0;
  const road = 1 - smoothstep(4.5, 8, roadDist(x, z));
  return groundHeight(x, z) * (1 - Math.max(lot, road));
}

/** what a wheel or a foot stands on at (x, z): the slab, the yard and the road, or the meadow */
export function visibleHeight(x: number, z: number): number {
  if (x >= FOOT.x0 && x <= FOOT.x1 && z >= FOOT.z0 && z <= FOOT.z1) return 0;
  if (x >= STRIP.x0 && x <= STRIP.x1 && z >= STRIP.z0 && z <= STRIP.z1) return stripHeight(x, z);
  return groundHeight(x, z);
}

/** the ground's kind at (x, z): 0 concrete or asphalt, 1 gravel, 3 grass (Surface ids of core/world/ground) */
export function surfaceKind(x: number, z: number): number {
  if (x >= FOOT.x0 && x <= FOOT.x1 && z >= FOOT.z0 && z <= FOOT.z1) return 0;
  const ad = roadDist(x, z);
  if (ad < 3.25) return 0;
  if (ad < 4.6) return 1;
  if (x < ROAD_X - 2.5) {
    const lot = yardLot(x, z);
    if (lot < -0.5) return 0;
    if (lot > 0.5) return 1;
  }
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
  // the drive is two wheel tracks with grass up the middle (where the car's centre line runs, z = -0.25)
  const middle = 1 - smoothstep(0.25, 0.5, Math.abs(z + 0.25));
  const inDrive = (1 - smoothstep(-0.5, 1.4, boxDist(x, z, DRIVE) + ragged)) * (1 - middle * smoothstep(15.8, 16.8, x));
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

/** is (x, z) bare of grass: the building, the yard's concrete and gravel, the road and its shoulders */
function bare(x: number, z: number): boolean {
  if (x > FOOT.x0 - 0.05 && x < FOOT.x1 + 0.05 && z > FOOT.z0 - 0.05 && z < FOOT.z1 + 0.05) return true;
  if (roadDist(x, z) < 3.6) return true;
  if (x < ROAD_X - 2.5 && Math.abs(yardLot(x, z)) > 0.45) return true;
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

/** trees and bushes: an old tree behind the workshop, a few by the road, copses over the fields */
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
  // a line of trees along the far side of the road, and bushes along this side
  for (let z = -170; z <= 170; z += 18 + rnd() * 14) put(rnd() < 0.5 ? 'broadleaf' : 'broadleaf2', ROAD_X + 11 + rnd() * 5, z, 0.9 + rnd() * 0.4);
  for (let k = 0; k < 26; k++) put('bush', ROAD_X - 7 - rnd() * 4, -60 + k * 4.8 + rnd() * 2, 0.8 + rnd() * 0.5);
  for (let k = 0; k < 18; k++) put('bush', -10 - rnd() * 14, -20 + rnd() * 40, 0.8 + rnd() * 0.6);
  // copses out over the fields
  for (const [cx, cz, n] of [
    [-60, 40, 9],
    [-90, -50, 11],
    [70, 70, 8],
    [80, -80, 10],
    [-40, -110, 7],
    [140, 20, 12],
    [-150, 10, 10],
  ] as const) {
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.283;
      const r = rnd() * 16;
      put(['broadleaf', 'broadleaf2', 'broadleaf3', 'bush'][Math.floor(rnd() * 4)], cx + Math.cos(a) * r, cz + Math.sin(a) * r, 0.9 + rnd() * 0.6);
    }
  }
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

/** telephone poles along the far side of the road with their sagging wires, and a fence round the yard */
function furniture(root: THREE.Group, mats: THREE.Material[]): void {
  const b = new PaintBuilder();
  const WOOD = 0x6e5a4a;
  const FENCE = 0x8a6a4c;
  const wire: number[] = [];
  const px = ROAD_X + 6.6;
  const rnd = mulberry(SEED + 31);
  const poles: { x: number; z: number; top: number }[] = [];
  for (let z = -520; z <= 520; z += 42) {
    const h = groundHeight(px, z);
    const lean = (rnd() - 0.5) * 0.25;
    const top = h + 7.2;
    b.bar(px, h - 0.3, z, px + lean, top, z + (rnd() - 0.5) * 0.2, 0.2, WOOD);
    b.bar(px + lean - 1.1, top - 0.5, z, px + lean + 1.1, top - 0.5, z, 0.1, WOOD);
    poles.push({ x: px + lean, z, top });
  }
  for (let i = 0; i < poles.length - 1; i++) {
    const a = poles[i];
    const c = poles[i + 1];
    for (const off of [-0.9, 0, 0.9]) {
      const SEG = 6;
      for (let k = 0; k < SEG; k++) {
        const u0 = k / SEG;
        const u1 = (k + 1) / SEG;
        const ax = a.x + off;
        const bx = c.x + off;
        const ay = a.top - 0.42;
        const by = c.top - 0.42;
        wire.push(ax + (bx - ax) * u0, ay + (by - ay) * u0 - 1.1 * 4 * u0 * (1 - u0), a.z + (c.z - a.z) * u0);
        wire.push(ax + (bx - ax) * u1, ay + (by - ay) * u1 - 1.1 * 4 * u1 * (1 - u1), a.z + (c.z - a.z) * u1);
      }
    }
  }
  // the fence: posts and two rails round the yard, open where the drive meets the road
  const fence = (x0: number, z0: number, x1: number, z1: number): void => {
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
  fence(-13, -14, ROAD_X - 5.5, -14);
  fence(-13, 15, ROAD_X - 5.5, 15);
  fence(-13, -14, -13, 15);
  fence(ROAD_X - 5.5, -14, ROAD_X - 5.5, -4.2);
  fence(ROAD_X - 5.5, 4.2, ROAD_X - 5.5, 15);
  const mat = surfaceMaterial({ vertexColors: true, flat: true, snowCap: 0 });
  const wm = wireMaterial();
  mats.push(mat, wm);
  const mesh = new THREE.Mesh(b.build(), mat);
  mesh.name = 'garage:poles';
  castShadows(mesh);
  root.add(mesh);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
  const lines = new THREE.LineSegments(g, wm);
  lines.name = 'garage:wires';
  lines.frustumCulled = false;
  root.add(lines);
}

export function buildOutdoors(core: RenderCore): Outdoors {
  const root = new THREE.Group();
  root.name = 'garage:outdoors';
  const terrainMat = terrainMaterial();
  const stripMat = roadStripMaterial();
  const terrain = new THREE.Mesh(terrainGeometry(), terrainMat);
  terrain.name = 'garage:terrain';
  terrain.frustumCulled = false;
  root.add(terrain);
  // the road along z, out to where the haze takes it, and the yard before the garage, in one strip:
  // the apron's slabs and the drive's gravel are its 'lots', the drive runs into the road's shoulder
  const xs = [...range(STRIP.x0, ROAD_X - 5.4, 0.5), ROAD_X - 4.5, ROAD_X - 3.8, ROAD_X - 3.25, ROAD_X - 2.4, ROAD_X - 1.6, ROAD_X - 0.8, ROAD_X, ROAD_X + 0.8, ROAD_X + 1.6, ROAD_X + 2.4, ROAD_X + 3.25, ROAD_X + 3.8, ROAD_X + 4.5, ROAD_X + 5.4, ROAD_X + 7, ROAD_X + 9, ROAD_X + 12, STRIP.x1];
  const zs = [
    ...range(STRIP.z0, -400, 50).slice(0, -1),
    ...range(-400, -60, 10).slice(0, -1),
    ...range(-60, -14, 2).slice(0, -1),
    ...range(-14, 14, 0.5).slice(0, -1),
    ...range(14, 60, 2).slice(0, -1),
    ...range(60, 400, 10).slice(0, -1),
    ...range(400, STRIP.z1, 50),
  ];
  const road = new THREE.Mesh(
    stripGeometry(xs, zs, (x, z) => ({ lat: x - ROAD_X, along: z, lot: x < ROAD_X - 2.5 ? yardLot(x, z) : 0 })),
    stripMat,
  );
  road.name = 'garage:road';
  road.frustumCulled = false;
  root.add(road);
  const extra: THREE.Material[] = [];
  meadow(root, extra);
  trees(root, extra);
  furniture(root, extra);
  core.scene.add(root);
  core.place(root, 0, 0, 0);
  return {
    root,
    dispose: () => {
      root.removeFromParent();
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh || (o as THREE.LineSegments).isLineSegments) m.geometry.dispose();
      });
      terrainMat.dispose();
      stripMat.dispose();
      for (const m of extra) m.dispose();
    },
  };
}
