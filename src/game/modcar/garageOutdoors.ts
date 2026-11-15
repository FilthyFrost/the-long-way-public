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
import { roadStripMaterial, terrainMaterial } from '../render/terrainMaterials';
import { woodland } from '../scene/palette';
import type { RenderCore } from '../render/core';

/** the road's centre line (it runs along z) */
export const ROAD_X = 24;
const SEED = 20261116;

/** the yard: the concrete apron before the door and the gravel drive out to the road */
export const APRON = { x0: 7.25, x1: 15.5, z0: -6.5, z1: 8.0 };
export const DRIVE = { x0: 15.0, x1: ROAD_X - 3.4, z0: -3.2, z1: 3.2 };
/** the building's footprint with its slab (the meadow stays below it) */
const FOOT = { x0: -7.3, x1: 7.3, z0: -5.3, z1: 5.3 };

function boxDist(x: number, z: number, b: { x0: number; x1: number; z0: number; z1: number }): number {
  const dx = Math.max(b.x0 - x, 0, x - b.x1);
  const dz = Math.max(b.z0 - z, 0, z - b.z1);
  return Math.hypot(dx, dz);
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
  for (let r = 2; r <= 70; r += 2) radii.push(r);
  let r = 70;
  while (r < 21000) {
    r *= 1.075;
    radii.push(r);
  }
  const seg = 160;
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
  const inApron = 1 - smoothstep(-0.3, 0.9, boxDist(x, z, APRON) + ragged * 0.6 - 0.2);
  const inDrive = 1 - smoothstep(-0.5, 1.4, boxDist(x, z, DRIVE) + ragged);
  if (inApron >= inDrive) return -inApron;
  return inDrive;
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
  const zs = [...range(STRIP.z0, -130, 20).slice(0, -1), ...range(-130, -14, 2).slice(0, -1), ...range(-14, 14, 0.5).slice(0, -1), ...range(14, 130, 2).slice(0, -1), ...range(130, STRIP.z1, 20)];
  const road = new THREE.Mesh(
    stripGeometry(xs, zs, (x, z) => ({ lat: x - ROAD_X, along: z, lot: x < ROAD_X - 2.5 ? yardLot(x, z) : 0 })),
    stripMat,
  );
  road.name = 'garage:road';
  road.frustumCulled = false;
  root.add(road);
  core.scene.add(root);
  core.place(root, 0, 0, 0);
  return {
    root,
    dispose: () => {
      root.removeFromParent();
      for (const m of [terrain, road]) m.geometry.dispose();
      terrainMat.dispose();
      stripMat.dispose();
    },
  };
}
