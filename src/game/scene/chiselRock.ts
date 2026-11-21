/**
 * Rocks as a painter carves them (V3, docs/V3/nodes/V3-rocks.md): a lump of the stone's own habit — chiselled by a
 * few planes of fracture into flat faces with soft edges between them, its foot sunk in the ground — in place of the
 * prisms of five to seven sides the stones were (they read as crystals, a gorge's blue shards). Each lithology its
 * habit: a boulder's lump and its few fractures, granite's rounded block (few, shallow cuts), a sandstone's or a
 * shale's bedding (level cuts, ledges), a fin's upright slab, a limestone's fluted tower. Three levels of detail are
 * three icospheres (2, 1, 0 subdivisions: 180, 80, 20 triangles); the normals are the vertices' own, so a cut face
 * shades flat and its edges round off (render/floraMaterial.ts, part 6).
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PlantBuilder } from './vegetation';

export interface RockHabit {
  /** height over width, depth over width of the lump before it is fitted */
  squat: number;
  long: number;
  /** how many planes of fracture, and how much of its reach each leaves (0 … 1) */
  cuts: number;
  cutDepth: readonly [number, number];
  /** which way the cuts face: 0 any (biased up), 1 level (bedding: ledges, a flat top), 2 upright (joints: fins, towers) */
  bedding: 0 | 1 | 2;
  /** how lumpy the lump is before it is cut */
  rough: number;
  /** grooves down its sides (a limestone's fluting): how many round it, how deep */
  flutes?: number;
  fluteDepth?: number;
  /** a fine grain over the lump (a clinker's roughness), and its facets crisp (its faces' own normals, part 5) */
  grain?: number;
  facet?: boolean;
}

export const HABITS: Readonly<Record<string, RockHabit>> = {
  boulder: { squat: 0.74, long: 0.86, cuts: 6, cutDepth: [0.55, 0.86], bedding: 0, rough: 0.13 },
  granite: { squat: 0.66, long: 0.9, cuts: 3, cutDepth: [0.72, 0.93], bedding: 0, rough: 0.07 },
  moraine: { squat: 0.72, long: 0.82, cuts: 5, cutDepth: [0.6, 0.9], bedding: 0, rough: 0.12 },
  strata: { squat: 0.52, long: 0.72, cuts: 7, cutDepth: [0.5, 0.86], bedding: 1, rough: 0.08 },
  fin: { squat: 1.7, long: 0.36, cuts: 6, cutDepth: [0.56, 0.86], bedding: 2, rough: 0.09 },
  karst: { squat: 1.45, long: 0.82, cuts: 3, cutDepth: [0.74, 0.95], bedding: 2, rough: 0.07, flutes: 9, fluteDepth: 0.13 },
  // (a lava flow's block: a clinker, jagged — cut every way, a grain over it, its facets crisp — and squat)
  lava: { squat: 0.6, long: 0.78, cuts: 17, cutDepth: [0.6, 0.9], bedding: 0, rough: 0.16, grain: 0.11, facet: true },
};

const spheres = new Map<number, { pos: THREE.Vector3[]; faces: number[] }>();
/** the unit icosphere of a subdivision, indexed */
function sphere(detail: number): { pos: THREE.Vector3[]; faces: number[] } {
  let s = spheres.get(detail);
  if (!s) {
    const g = mergeVertices(new THREE.IcosahedronGeometry(1, detail).deleteAttribute('normal').deleteAttribute('uv'), 1e-5);
    const p = g.getAttribute('position');
    const pos: THREE.Vector3[] = [];
    for (let i = 0; i < p.count; i++) pos.push(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)));
    s = { pos, faces: Array.from(g.index!.array) };
    spheres.set(detail, s);
    g.dispose();
  }
  return s;
}

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

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const WHITE = new THREE.Color(1, 1, 1);

/**
 * One rock into b: standing at (x, z) on the ground, its half width w and half depth d, its height h over the ground
 * (its foot sunk a tenth of that), turned by yaw; `detail` 0 … 2; `part` the material's part (6: a rock with its own
 * normals). `tone` darkens or lightens it as a whole.
 */
export function chiselRock(b: PlantBuilder, habit: RockHabit, seed: number, detail: number, x: number, z: number, w: number, h: number, d: number, yaw: number, part: number, tone = 1): void {
  const base = sphere(detail);
  const rnd = mulberry(seed * 2654435761 + 97);
  const P = base.pos.map((p) => p.clone());
  // the lump
  const ph = [rnd() * 9, rnd() * 9, rnd() * 9];
  for (const p of P) {
    const n = Math.sin(p.x * 2.1 + ph[0]) * Math.sin(p.y * 1.7 + ph[1]) * Math.sin(p.z * 2.4 + ph[2]) + 0.5 * Math.sin(p.x * 4.3 + ph[1]) * Math.sin(p.z * 3.9 + ph[0] + p.y);
    const g = habit.grain ? habit.grain * Math.sin(p.x * 7.3 + ph[2]) * Math.sin(p.y * 6.7 + ph[0]) * Math.sin(p.z * 8.1 + ph[1]) : 0;
    p.multiplyScalar(1 + habit.rough * n + g);
  }
  // its fluting (a limestone's): grooves down its sides, deepest at its waist
  if (habit.flutes && habit.fluteDepth) {
    const off = rnd() * 6.283;
    for (const p of P) {
      const a = Math.atan2(p.z, p.x);
      const k = 1 - habit.fluteDepth * (0.5 + 0.5 * Math.cos(a * habit.flutes + off)) * smooth(-0.7, 0.3, p.y) * (1 - smooth(0.6, 1, p.y));
      p.x *= k;
      p.z *= k;
    }
  }
  for (const p of P) {
    p.y *= habit.squat;
    p.z *= habit.long;
  }
  // the fractures: each plane takes what stands beyond it
  const n = new THREE.Vector3();
  for (let c = 0; c < habit.cuts; c++) {
    const theta = rnd() * Math.PI * 2;
    const y = habit.bedding === 1 ? (c % 3 === 0 ? -0.35 : 1) * (0.78 + 0.22 * rnd()) : habit.bedding === 2 ? (rnd() - 0.5) * 0.45 : rnd() * 1.25 - 0.3;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    n.set(Math.cos(theta) * r, y, Math.sin(theta) * r).normalize();
    let reach = -1e9;
    for (const p of P) reach = Math.max(reach, p.dot(n));
    const plane = reach * (habit.cutDepth[0] + (habit.cutDepth[1] - habit.cutDepth[0]) * rnd());
    for (const p of P) {
      const e = p.dot(n) - plane;
      if (e > 0) p.addScaledVector(n, -e);
    }
  }
  // its foot cut level and sunk; then fitted to the size asked
  let ymin = 1e9;
  let ymax = -1e9;
  for (const p of P) {
    ymin = Math.min(ymin, p.y);
    ymax = Math.max(ymax, p.y);
  }
  const foot = ymin + 0.16 * (ymax - ymin);
  let mx = 1e-6;
  let mz = 1e-6;
  for (const p of P) {
    if (p.y < foot) p.y = foot;
    mx = Math.max(mx, Math.abs(p.x));
    mz = Math.max(mz, Math.abs(p.z));
  }
  const sy = h / Math.max(ymax - foot, 1e-6);
  const cy = Math.cos(yaw);
  const syw = Math.sin(yaw);
  for (const p of P) {
    const px = (p.x * w) / mx;
    const pz = (p.z * d) / mz;
    p.set(x + px * cy + pz * syw, (p.y - foot) * sy - 0.1 * h, z - px * syw + pz * cy);
  }
  // normals of the vertices from their faces (area-weighted): a cut face is flat, its edges round off
  const N = P.map(() => new THREE.Vector3());
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const f = base.faces;
  for (let i = 0; i < f.length; i += 3) {
    e1.subVectors(P[f[i + 1]], P[f[i]]);
    e2.subVectors(P[f[i + 2]], P[f[i]]);
    n.crossVectors(e1, e2);
    N[f[i]].add(n);
    N[f[i + 1]].add(n);
    N[f[i + 2]].add(n);
  }
  for (const v of N) v.normalize();
  // a tone a vertex: darker toward its sunk foot and in its hollows, a little of its own
  const K = P.map((p, i) => {
    const up = (p.y + 0.1 * h) / Math.max(h * 1.1, 1e-6);
    return tone * (0.7 + 0.3 * smooth(0, 0.6, up)) * (0.94 + 0.12 * Math.sin(i * 12.9898 + seed));
  });
  for (let i = 0; i < f.length; i += 3) {
    const a = f[i];
    const c = f[i + 1];
    const e = f[i + 2];
    b.triN(P[a], P[c], P[e], N[a], N[c], N[e], part, WHITE, K[a], K[c], K[e]);
  }
}
