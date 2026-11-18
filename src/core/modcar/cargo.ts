/**
 * Where things ride in a vehicle (docs/MODCAR.md §5.6): each frame's places for them — a car's boot, its
 * back seat and the passenger's seat, a pickup's bed, a motorhome's cabin, a motorcycle's pillion — and where
 * in one a thing of a given size fits, beside or on top of what is already there. The floors come from the
 * model (a height grid the game draws from above, so a seat taken out or a wheel arch in a bed is where it
 * is); the rules here are plain geometry. Pure data and maths, no three, no DOM.
 *
 * Frame model space: +x forward, +y up, +z right, metres, the origin on the ground under the middle of the
 * wheelbase. A thing's turn `yaw` is about +y, as three.js turns an object (rotation.y).
 */
import type { Text } from './types';

export type ZoneId = 'trunk' | 'rear' | 'pass' | 'bed' | 'cabin' | 'pillion';
export type Carry = 'small' | 'medium' | 'large';

export interface CargoZone {
  readonly id: ZoneId;
  readonly label: Text;
  /** its floor's rectangle (x forward, z right) and how high things may stand (under a shut lid, the roof) */
  readonly x: readonly [number, number];
  readonly z: readonly [number, number];
  readonly top: number;
  /** about where the floor is (the grid finds the real one; this is where the grid is drawn from) */
  readonly floor: number;
  /** the panels one reaches it through: any one of them open or missing (none: always in reach) */
  readonly via?: readonly string[];
  /** the biggest thing it takes, by how it is carried */
  readonly max: Carry;
  /** packed first when things go in without aiming (lower first) */
  readonly order: number;
}

function Z(id: ZoneId, zh: string, en: string, x: [number, number], z: [number, number], floor: number, top: number, max: Carry, order: number, via?: string[]): CargoZone {
  return { id, label: { zh, en }, x, z, floor, top, max, order, via };
}

/** measured on the models (harness/shots/modcar_stow.mjs draws them): under a shut boot lid, on the seats */
export const CARGO_ZONES: Record<string, readonly CargoZone[]> = {
  sedan: [
    Z('trunk', '后备箱', 'Boot', [-1.97, -1.42], [-0.6, 0.6], 0.36, 0.85, 'large', 0, ['trunk']),
    Z('rear', '后座', 'Back seat', [-1.12, -0.66], [-0.58, 0.58], 0.47, 1.12, 'large', 1, ['door_RL', 'door_RR']),
    Z('pass', '副驾驶座', 'Passenger seat', [-0.42, 0.02], [0.12, 0.6], 0.5, 1.05, 'medium', 2, ['door_FR']),
  ],
  pickup: [
    Z('bed', '车斗', 'Bed', [-2.22, -0.62], [-0.72, 0.72], 0.69, 1.9, 'large', 0),
    Z('pass', '副驾驶座', 'Passenger seat', [0.1, 0.5], [0.12, 0.6], 0.7, 1.3, 'medium', 1, ['door_FR']),
  ],
  rv: [
    Z('cabin', '车厢', 'Cabin', [-2.95, -0.45], [-0.45, 0.55], 0.86, 2.6, 'large', 0, ['door_side', 'trunk']),
    Z('pass', '副驾驶座', 'Passenger seat', [0.9, 1.35], [0.3, 0.8], 0.9, 1.55, 'medium', 1, ['door_FR']),
  ],
  moto: [Z('pillion', '后座', 'Pillion', [-0.85, -0.5], [-0.13, 0.13], 0.8, 1.15, 'small', 0)],
  goat: [
    Z('trunk', '后备箱', 'Load space', [-1.84, -1.04], [-0.36, 0.36], 0.62, 1.66, 'large', 0, ['trunk']),
    Z('rear', '后座', 'Back seat', [-0.7, -0.27], [-0.55, 0.55], 0.76, 1.38, 'large', 1, ['door_FL', 'door_FR']),
    Z('pass', '副驾驶座', 'Passenger seat', [0.3, 0.68], [0.18, 0.6], 0.76, 1.36, 'medium', 2, ['door_FR']),
  ],
  van: [
    Z('trunk', '行李台', 'Luggage deck', [-2.15, -1.42], [-0.74, 0.74], 0.95, 1.75, 'large', 0, ['trunk']),
    Z('cabin', '车厢', 'Cabin', [-0.67, 0.65], [-0.76, 0.72], 0.42, 1.78, 'large', 1, ['door_side', 'trunk']),
    Z('pass', '副驾驶座', 'Passenger seat', [0.98, 1.36], [0.14, 0.62], 0.88, 1.5, 'medium', 2, ['door_FR']),
  ],
  wagon: [
    Z('trunk', '后备箱', 'Load space', [-2.47, -1.38], [-0.73, 0.73], 0.48, 1.3, 'large', 0, ['trunk']),
    Z('rear', '后座', 'Back seat', [-1.12, -0.62], [-0.6, 0.6], 0.5, 1.12, 'large', 1, ['door_RL', 'door_RR']),
    Z('pass', '副驾驶座', 'Passenger seat', [-0.3, 0.14], [0.12, 0.62], 0.52, 1.05, 'medium', 2, ['door_FR']),
  ],
};

export function zonesOf(frame: string): readonly CargoZone[] {
  return CARGO_ZONES[frame] ?? [];
}

export function zoneOf(frame: string, id: string): CargoZone | null {
  return zonesOf(frame).find((z) => z.id === id) ?? null;
}

const CARRY_RANK: Record<Carry, number> = { small: 0, medium: 1, large: 2 };

/** does a zone take things carried this way */
export function zoneTakes(zone: CargoZone, carry: Carry): boolean {
  return CARRY_RANK[carry] <= CARRY_RANK[zone.max];
}

/** a thing's box in its own frame (its origin where it stands; it turns about the origin's y) */
export interface ThingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/** a thing riding in a zone: its box where it is (frame model space; laid on its side already, if it lies) */
export interface Placed {
  box: ThingBox;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** how a thing lies: on its side, tipped a quarter round its own z (its x up) or its own x (its z up) */
export type Lie = 'z' | 'x';

/** a thing's box laid on its side */
export function lieBox(b: ThingBox, lie: Lie | undefined): ThingBox {
  if (lie === 'z') return { minX: -b.maxY, maxX: -b.minY, minY: b.minX, maxY: b.maxX, minZ: b.minZ, maxZ: b.maxZ };
  if (lie === 'x') return { minX: b.minX, maxX: b.maxX, minY: b.minZ, maxY: b.maxZ, minZ: -b.maxY, maxZ: -b.minY };
  return b;
}

/**
 * A zone's floor, drawn from above: the height of cell (i, j), which covers x0 + i·cell … and z0 + j·cell …;
 * NaN where nothing is under it (a hole, the edge of the model).
 */
export interface HeightGrid {
  x0: number;
  z0: number;
  cell: number;
  nx: number;
  nz: number;
  h: Float32Array;
}

/** where a thing goes: its origin and its turn, and whether it lies on its side (too tall to stand there) */
export interface Spot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  lie?: Lie;
}

/** how far apart things are kept, and in from the zone's sides (m) */
const GAP = 0.015;

/** the four corners of a box's footprint, placed (frame model space, x and z) */
export function footprint(b: ThingBox, x: number, z: number, yaw: number): [number, number][] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const out: [number, number][] = [];
  for (const [px, pz] of [
    [b.minX, b.minZ],
    [b.maxX, b.minZ],
    [b.maxX, b.maxZ],
    [b.minX, b.maxZ],
  ]) {
    // (three.js turns +x towards −z for a positive yaw)
    out.push([x + px * c + pz * s, z - px * s + pz * c]);
  }
  return out;
}

/** do two convex quads overlap (separating axes), each grown by half the gap */
function quadsMeet(a: [number, number][], b: [number, number][], gap: number): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < 4; i++) {
      const [x1, z1] = poly[i];
      const [x2, z2] = poly[(i + 1) % 4];
      const nx = z2 - z1;
      const nz = x1 - x2;
      const len = Math.hypot(nx, nz) || 1;
      let aMin = Infinity;
      let aMax = -Infinity;
      let bMin = Infinity;
      let bMax = -Infinity;
      for (const [px, pz] of a) {
        const d = (px * nx + pz * nz) / len;
        aMin = Math.min(aMin, d);
        aMax = Math.max(aMax, d);
      }
      for (const [px, pz] of b) {
        const d = (px * nx + pz * nz) / len;
        bMin = Math.min(bMin, d);
        bMax = Math.max(bMax, d);
      }
      if (aMax + gap <= bMin || bMax + gap <= aMin) return false;
    }
  }
  return true;
}

/** the floor's height at a point of the grid (NaN: nothing there, or off the grid) */
export function gridAt(g: HeightGrid, x: number, z: number): number {
  const i = Math.floor((x - g.x0) / g.cell);
  const j = Math.floor((z - g.z0) / g.cell);
  if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) return NaN;
  return g.h[j * g.nx + i];
}

/**
 * The height a thing would stand at with its origin at (x, z) turned by yaw: the highest floor under its
 * footprint, or the top of a thing already there it would stand on. Null when it does not fit: a corner out
 * of the zone, a hole under it, its top above the zone's.
 */
export function restAt(zone: CargoZone, g: HeightGrid, b: ThingBox, x: number, z: number, yaw: number, placed: readonly Placed[]): number | null {
  const q = footprint(b, x, z, yaw);
  for (const [px, pz] of q) {
    if (px < zone.x[0] + GAP || px > zone.x[1] - GAP || pz < zone.z[0] + GAP || pz > zone.z[1] - GAP) return null;
  }
  // the floor under it: sampled over the footprint at the grid's spacing
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const nu = Math.max(1, Math.ceil((b.maxX - b.minX) / g.cell));
  const nv = Math.max(1, Math.ceil((b.maxZ - b.minZ) / g.cell));
  let floor = -Infinity;
  for (let a = 0; a <= nu; a++) {
    const lx = b.minX + ((b.maxX - b.minX) * a) / nu;
    for (let d = 0; d <= nv; d++) {
      const lz = b.minZ + ((b.maxZ - b.minZ) * d) / nv;
      const h = gridAt(g, x + lx * c + lz * s, z - lx * s + lz * c);
      if (Number.isNaN(h)) return null;
      if (h > floor) floor = h;
    }
  }
  // on top of what it would overlap (its own bottom lands there)
  let base = floor - b.minY;
  for (const p of placed) {
    if (!quadsMeet(q, footprint(p.box, p.x, p.z, p.yaw), GAP)) continue;
    base = Math.max(base, p.y + p.box.maxY - b.minY);
  }
  if (base + b.maxY > zone.top + 1e-6) return null;
  return base;
}

/**
 * Where a thing goes in a zone: as near (x, z) as it fits (aimed: the nearest free spot round the mark,
 * turned as asked or a quarter turn more), or (near null: packed in) the lowest spot from the zone's back
 * corner on. Null: there is no room.
 */
export function findSpot(zone: CargoZone, g: HeightGrid, b: ThingBox, yaw: number, near: { x: number; z: number } | null, placed: readonly Placed[]): Spot | null {
  // standing as it is; if it does not fit anywhere so, laid on its side (the flatter way first)
  const flat: Lie = b.maxX - b.minX <= b.maxZ - b.minZ ? 'z' : 'x';
  for (const lie of [undefined, flat, flat === 'z' ? 'x' : 'z'] as (Lie | undefined)[]) {
    const s = findPose(zone, g, lieBox(b, lie), yaw, near, placed);
    if (s) return lie ? { ...s, lie } : s;
  }
  return null;
}

function findPose(zone: CargoZone, g: HeightGrid, b: ThingBox, yaw: number, near: { x: number; z: number } | null, placed: readonly Placed[]): Spot | null {
  const yaws = [yaw, yaw + Math.PI / 2];
  if (near) {
    const step = 0.04;
    for (let r = 0; r <= 0.6 + 1e-9; r += step) {
      const n = r === 0 ? 1 : Math.max(6, Math.round((2 * Math.PI * r) / step));
      for (const w of yaws) {
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          const x = near.x + Math.cos(a) * r;
          const z = near.z + Math.sin(a) * r;
          const y = restAt(zone, g, b, x, z, w, placed);
          if (y !== null) return { x, y, z, yaw: w };
        }
      }
    }
    return null;
  }
  // packed: tried only where it would touch the zone's back or left side or a thing already there (so a
  // row of boxes leaves no gap a grid step would), the lowest spot wins, then the one furthest back and left
  let best: Spot | null = null;
  for (const w of [0, Math.PI / 2]) {
    const q = footprint(b, 0, 0, w);
    const fx = Math.min(...q.map((p) => p[0]));
    const fz = Math.min(...q.map((p) => p[1]));
    const xs = [zone.x[0] + GAP * 1.01 - fx];
    const zs = [zone.z[0] + GAP * 1.01 - fz];
    for (const p of placed) {
      const pq = footprint(p.box, p.x, p.z, p.yaw);
      xs.push(Math.max(...pq.map((c) => c[0])) + GAP * 1.01 - fx, Math.min(...pq.map((c) => c[0])) - fx);
      zs.push(Math.max(...pq.map((c) => c[1])) + GAP * 1.01 - fz, Math.min(...pq.map((c) => c[1])) - fz);
    }
    for (const x of xs) {
      for (const z of zs) {
        const y = restAt(zone, g, b, x, z, w, placed);
        if (y === null) continue;
        if (!best || y < best.y - 0.01 || (Math.abs(y - best.y) <= 0.01 && (x < best.x - 0.01 || (Math.abs(x - best.x) <= 0.01 && z < best.z - 0.01)))) best = { x, y, z, yaw: w };
      }
    }
  }
  return best;
}

/** what the things in a vehicle weigh, where they sit (the derived mass and centre of gravity take them in) */
export interface CargoMass {
  m: number;
  x: number;
  y: number;
  z: number;
}
