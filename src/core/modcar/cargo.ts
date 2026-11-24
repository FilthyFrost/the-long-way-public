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
import { frameDef } from './frames';
import type { Text } from './types';

export type ZoneId = 'trunk' | 'rear' | 'pass' | 'bed' | 'cabin' | 'pillion' | 'lounge' | 'table' | 'galley' | 'bench' | 'wall' | 'dash' | 'roof' | 'sofa' | 'fridge';
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
  /**
   * the walls of a living space (docs/V3/nodes/M2-rv.md): things hung there, not stood on a floor — the zone's
   * rectangle says where its walls are, its floor and top how high on them
   */
  readonly wall?: boolean;
  /** how putting a thing there is said ("放到餐桌上", "挂到墙上"); absent: "放进" and its name, as into a boot */
  readonly put?: string;
  /** glass over it (a dashboard under the windscreen): the glass is no floor of it */
  readonly glassOver?: boolean;
  /** the step a thing aimed in keeps to (m; absent: 10 cm) — a narrow dashboard's finer */
  readonly grid?: number;
  /** there only with one of these parts on that mount (a roof rack on the roof); absent: always there */
  readonly needs?: { readonly mount: string; readonly parts: readonly string[] };
}

function Z(id: ZoneId, zh: string, en: string, x: [number, number], z: [number, number], floor: number, top: number, max: Carry, order: number, via?: string[]): CargoZone {
  return { id, label: { zh, en }, x, z, floor, top, max, order, via };
}

/**
 * The top of the dashboard under the windscreen (docs/ND/PLAN.md: Nomad Drive's dashboard surfaces, where its bobbleheads
 * stand): small things only, reached through a front door; never packed onto without aiming (last in order); the
 * windscreen over it is not its floor, and it reaches only as far forward as the glass leaves a hand's height over it
 * (the fox's raked glass leaves none: it has no dashboard to put things on).
 */
function D(x: [number, number], z: [number, number], floor: number, top: number, via: string[]): CargoZone {
  return { ...Z('dash', '仪表台', 'Dashboard', x, z, floor, top, 'small', 99, via), put: '放到仪表台上', glassOver: true, grid: 0.02 };
}

/** measured on the models (harness/shots/modcar_stow.mjs draws them): under a shut boot lid, on the seats */
export const CARGO_ZONES: Record<string, readonly CargoZone[]> = {
  sedan: [
    Z('trunk', '后备箱', 'Boot', [-1.97, -1.42], [-0.6, 0.6], 0.36, 0.85, 'large', 0, ['trunk']),
    Z('rear', '后座', 'Back seat', [-1.12, -0.66], [-0.58, 0.58], 0.47, 1.12, 'large', 1, ['door_RL', 'door_RR']),
    Z('pass', '副驾驶座', 'Passenger seat', [-0.42, 0.02], [0.12, 0.6], 0.5, 1.05, 'medium', 2, ['door_FR']),
    D([0.56, 0.68], [-0.55, 0.55], 0.94, 1.15, ['door_FL', 'door_FR']),
  ],
  pickup: [
    Z('bed', '车斗', 'Bed', [-2.22, -0.62], [-0.72, 0.72], 0.69, 1.9, 'large', 0),
    Z('pass', '副驾驶座', 'Passenger seat', [0.1, 0.5], [0.12, 0.6], 0.7, 1.3, 'medium', 1, ['door_FR']),
    D([0.67, 0.8], [-0.6, 0.6], 1.08, 1.29, ['door_FL', 'door_FR']),
  ],
  rv: [
    Z('cabin', '车厢', 'Cabin', [-2.95, -0.45], [-0.45, 0.55], 0.86, 2.6, 'large', 0, ['door_side', 'trunk']),
    Z('pass', '副驾驶座', 'Passenger seat', [0.9, 1.35], [0.3, 0.8], 0.9, 1.55, 'medium', 1, ['door_FR']),
    // (the living space as one walks about in it, docs/V3/nodes/M2-rv.md: the floor by the door, the dinette's
    // table, the galley's worktop under its lockers, the rear bench, and the walls)
    { ...Z('lounge', '车厢前部', 'By the door', [-1.3, 0.85], [-0.1, 1.0], 0.86, 2.6, 'large', 2, ['door_side']), put: '放到车厢地上' },
    { ...Z('table', '餐桌', 'Dinette table', [0.17, 0.59], [-1.04, -0.37], 1.59, 2.3, 'medium', 3, ['door_side']), put: '放到餐桌上' },
    { ...Z('galley', '厨房台面', 'Galley worktop', [-1.94, -0.79], [-1.06, -0.51], 1.75, 2.18, 'medium', 4, ['door_side']), put: '放到厨房台面上' },
    { ...Z('bench', '后排长椅', 'Rear bench', [-3.6, -2.95], [-0.95, 0.95], 1.2, 2.4, 'large', 5, ['door_side', 'trunk']), put: '放到后排长椅上' },
    // (the walls' inner faces stand at about ±1.09: the rectangle reaches a little past them)
    { ...Z('wall', '墙上', 'On the wall', [-3.95, 1.05], [-1.13, 1.13], 1.0, 2.5, 'medium', 9, ['door_side', 'trunk']), wall: true, put: '挂到墙上' },
    D([1.64, 2.04], [-0.75, 0.75], 1.4, 1.62, ['door_FL', 'door_FR', 'door_side']),
  ],
  moto: [Z('pillion', '后座', 'Pillion', [-0.85, -0.5], [-0.13, 0.13], 0.8, 1.15, 'small', 0)],
  snail: [
    Z('cabin', '货厢', 'Box', [-2.29, 0.62], [-0.86, 0.86], 0.95, 2.62, 'large', 0, ['trunk']),
    Z('pass', '副驾驶座', 'Passenger seat', [1.3, 1.62], [0.34, 0.79], 1.26, 1.9, 'medium', 1, ['door_FR']),
    D([2.11, 2.33], [-0.75, 0.75], 1.29, 1.5, ['door_FL', 'door_FR']),
  ],
  fox: [
    Z('trunk', '后备箱', 'Boot', [-1.86, -1.44], [-0.63, 0.63], 0.4, 0.77, 'medium', 0, ['trunk']),
    // (the shelf behind the seats over the rear axle, under the fastback glass: no wall between it and the boot)
    Z('rear', '后搁板', 'Luggage shelf', [-1.4, -0.84], [-0.34, 0.34], 0.56, 0.93, 'medium', 1, ['door_FL', 'door_FR', 'trunk']),
    Z('pass', '副驾驶座', 'Passenger seat', [-0.48, -0.06], [0.24, 0.52], 0.39, 1.05, 'medium', 2, ['door_FR']),
  ],
  rhino: [
    // (the box under its canvas, the tailgate the way in; and the seat beside the driver)
    Z('bed', '货厢', 'Cargo box', [-3.08, -0.37], [-1.04, 1.04], 1.24, 2.65, 'large', 0, ['trunk']),
    Z('pass', '副驾驶座', 'Passenger seat', [0.52, 0.9], [0.37, 0.83], 1.27, 1.87, 'medium', 1, ['door_FR']),
    D([1.25, 1.5], [-0.75, 0.75], 1.6, 1.81, ['door_FL', 'door_FR']),
  ],
  buffalo: [
    // (an open bed behind the cab, its tailgate the way in; and a bench across the back of the cab)
    Z('bed', '车斗', 'Bed', [-2.39, -1.13], [-0.41, 0.41], 0.8, 1.85, 'large', 0),
    Z('rear', '后座', 'Back seat', [-0.59, -0.23], [-0.47, 0.47], 0.87, 1.5, 'large', 1, ['door_RL', 'door_RR']),
    Z('pass', '副驾驶座', 'Passenger seat', [0.24, 0.65], [0.26, 0.54], 0.86, 1.5, 'medium', 2, ['door_FR']),
    D([0.87, 1.24], [-0.65, 0.65], 1.3, 1.51, ['door_FL', 'door_FR']),
  ],
  goat: [
    Z('trunk', '后备箱', 'Load space', [-1.84, -1.04], [-0.36, 0.36], 0.62, 1.66, 'large', 0, ['trunk']),
    Z('rear', '后座', 'Back seat', [-0.7, -0.27], [-0.55, 0.55], 0.76, 1.38, 'large', 1, ['door_FL', 'door_FR']),
    Z('pass', '副驾驶座', 'Passenger seat', [0.3, 0.68], [0.18, 0.6], 0.76, 1.36, 'medium', 2, ['door_FR']),
    D([0.75, 1.02], [-0.65, 0.65], 1.15, 1.36, ['door_FL', 'door_FR']),
  ],
  van: [
    Z('trunk', '行李台', 'Luggage deck', [-2.15, -1.42], [-0.74, 0.74], 0.95, 1.75, 'large', 0, ['trunk']),
    Z('cabin', '车厢', 'Cabin', [-0.67, 0.65], [-0.76, 0.72], 0.42, 1.78, 'large', 1, ['door_side', 'trunk']),
    Z('pass', '副驾驶座', 'Passenger seat', [0.98, 1.36], [0.14, 0.62], 0.88, 1.5, 'medium', 2, ['door_FR']),
    D([1.71, 1.95], [-0.7, 0.7], 1.08, 1.3, ['door_FL', 'door_FR', 'door_side']),
  ],
  // (the Turtle, docs/V3/plan/rv.md R1: the floor by the sliding door, the bed across the back (by the tailgate too),
  // the galley's worktop, the passenger's seat, the dash; the walls of the room. The tops under the shell's underside
  // with the roof down, 2.04: the floor is drawn looking down from the top)
  turtle: [
    // (in from the bed's cupboard knobs, the tail's roll over the bed, the wall over the worktop)
    Z('cabin', '车厢', 'Cabin', [-0.34, 0.86], [-0.42, 0.84], 0.42, 1.85, 'large', 0, ['door_side']),
    { ...Z('bed', '床上', 'Bed', [-2.26, -0.44], [-0.8, 0.8], 1.065, 1.85, 'large', 1, ['door_side', 'trunk']), put: '放到床上' },
    { ...Z('galley', '厨房台面', 'Galley worktop', [-0.2, 0.78], [-0.845, -0.47], 1.22, 1.85, 'medium', 2, ['door_side']), put: '放到厨房台面上' },
    Z('pass', '副驾驶座', 'Passenger seat', [1.18, 1.56], [0.14, 0.66], 0.88, 1.5, 'medium', 3, ['door_FR']),
    D([1.99, 2.22], [-0.74, 0.74], 1.08, 1.3, ['door_FL', 'door_FR', 'door_side']),
    { ...Z('wall', '墙上', 'On the wall', [-2.35, 0.86], [-0.9, 0.9], 1.0, 1.9, 'medium', 9, ['door_side']), wall: true, put: '挂到墙上' },
  ],
  // (the Old Elephant, docs/V3/plan/rv.md R2: the aisle's floor from the bed to the cab, the bed across the back, the
  // galley's worktop beside the sink (where its hobs stand), the dinette's table, the sofa, the fridge's niche behind
  // the passenger's seat, the passenger's seat, the dash; the walls of the room under the lockers)
  elephant: [
    Z('cabin', '车厢', 'Cabin', [-1.86, 2.44], [-0.4, 0.36], 0.62, 2.4, 'large', 0, ['door_side']),
    { ...Z('bed', '床上', 'Bed', [-4.0, -1.94], [-1.12, 1.12], 1.44, 2.4, 'large', 1, ['door_side']), put: '放到床上' },
    { ...Z('galley', '厨房台面', 'Galley worktop', [-1.86, -0.2], [-1.13, -0.58], 1.54, 2.4, 'medium', 2, ['door_side']), put: '放到厨房台面上' },
    { ...Z('table', '餐桌', 'Dinette table', [1.32, 1.98], [-1.13, -0.48], 1.34, 2.4, 'medium', 3, ['door_side']), put: '放到餐桌上' },
    { ...Z('sofa', '沙发', 'Sofa', [-1.74, 0.3], [0.57, 0.98], 1.06, 2.4, 'large', 4, ['door_side']), put: '放到沙发上' },
    { ...Z('fridge', '冰箱位', 'Fridge niche', [1.685, 2.455], [0.38, 1.13], 0.92, 2.34, 'large', 5, ['door_side']), put: '放进冰箱位' },
    Z('pass', '副驾驶座', 'Passenger seat', [2.82, 3.2], [0.34, 0.86], 1.23, 1.85, 'medium', 6, ['door_FR']),
    D([3.57, 3.95], [-1.0, 1.0], 1.5, 1.75, ['door_FL', 'door_FR', 'door_side']),
    { ...Z('wall', '墙上', 'On the wall', [-4.0, 2.45], [-1.16, 1.16], 1.62, 2.46, 'medium', 9, ['door_side']), wall: true, put: '挂到墙上' },
  ],
  // (the Camel, docs/V3/plan/rv.md R3: emptied — its whole floor from the tail to the modesty panel (the rear wheels'
  // humps in it), the dash; the walls under the ceiling's roll. The rack on its roof is the roof mount's)
  camel: [
    Z('cabin', '车厢', 'Cabin', [-4.98, 1.82], [-1.14, 1.14], 0.72, 2.6, 'large', 0, ['door_side', 'trunk']),
    D([2.64, 2.85], [-1.0, 1.0], 1.48, 1.7, ['door_side']),
    { ...Z('wall', '墙上', 'On the wall', [-5.0, 1.84], [-1.19, 1.19], 1.5, 2.45, 'medium', 9, ['door_side', 'trunk']), wall: true, put: '挂到墙上' },
  ],
  // (the trailer's box: its floor from the door to the front wall, the door the way in — docs/V3/plan/growth.md §六 2)
  // (its top under the ceiling's lining, 1.836: the floor is drawn looking down from the top)
  trailer: [Z('cabin', '货厢', 'Box', [-1.22, 0.92], [-0.64, 0.64], 0.67, 1.8, 'large', 0, ['trunk'])],
  wagon: [
    Z('trunk', '后备箱', 'Load space', [-2.42, -1.76], [-0.69, 0.69], 0.48, 1.25, 'large', 0, ['trunk']),
    Z('rear', '后座', 'Back seat', [-0.97, -0.63], [-0.57, 0.57], 0.47, 1.12, 'large', 1, ['door_RL', 'door_RR']),
    Z('pass', '副驾驶座', 'Passenger seat', [-0.23, 0.19], [0.23, 0.51], 0.5, 1.05, 'medium', 2, ['door_FR']),
    D([0.72, 0.82], [-0.55, 0.55], 0.95, 1.16, ['door_FL', 'door_FR']),
  ],
};

export function zonesOf(frame: string): readonly CargoZone[] {
  return CARGO_ZONES[frame] ?? [];
}

/** the parts that make a vehicle's roof a place for things (docs/V3/plan/growth.md §六 2: the roof rack) */
export const ROOF_RACKS: readonly string[] = ['roof_rack'];

const ROOFS = new Map<string, CargoZone | null>();

/**
 * A frame's roof as a place for things once a rack is on it: the roof mount's footprint (its fit, a hand in from its
 * edges), from the rack's rails up to most of a metre; large things too; packed into last (after the boot, the bed, the
 * seats); reached from beside the vehicle as one reaches up (no panel in the way). Null: a frame with no roof (the
 * motorcycle).
 */
export function roofZoneOf(frameId: string): CargoZone | null {
  if (ROOFS.has(frameId)) return ROOFS.get(frameId)!;
  const m = frameDef(frameId).mounts.find((x) => x.cat === 'roof');
  const fit = m?.fit;
  const zone: CargoZone | null =
    m && fit
      ? { ...Z('roof', '车顶行李架', 'Roof rack', [m.pos.x - fit[0] / 2 + 0.08, m.pos.x + fit[0] / 2 - 0.08], [-fit[1] / 2 + 0.06, fit[1] / 2 - 0.06], m.pos.y + 0.04, m.pos.y + 0.9, 'large', 8), put: '放到车顶行李架上', needs: { mount: m.id, parts: ROOF_RACKS } }
      : null;
  ROOFS.set(frameId, zone);
  return zone;
}

/** a vehicle's places for things as it is built: its frame's, and those its parts make (a rack on the roof) */
export function zonesFor(frameId: string, build: { readonly parts: Readonly<Record<string, { readonly part: string } | undefined>> }): readonly CargoZone[] {
  const roof = roofZoneOf(frameId);
  const base = zonesOf(frameId);
  if (!roof) return base;
  const on = build.parts[roof.needs!.mount];
  return on && roof.needs!.parts.includes(on.part) ? [...base, roof] : base;
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
/**
 * Where a thing goes in a zone: near the point aimed at (`near`), else packed in. `grid` (m, 0: none): where it is
 * aimed it keeps to a grid of that step (docs/V3/nodes/M2-rv.md: 10 cm), the point aimed at taken to the grid
 * and looked round in steps of it.
 */
export function findSpot(zone: CargoZone, g: HeightGrid, b: ThingBox, yaw: number, near: { x: number; z: number } | null, placed: readonly Placed[], grid = 0, exact = false): Spot | null {
  // (placed just so — docs/V3/plan/hands.md §四: there, so turned, or nowhere)
  if (exact && near) {
    const snap = (v: number): number => (grid > 0 ? Math.round(v / grid) * grid : v);
    const x = snap(near.x);
    const z = snap(near.z);
    const y = restAt(zone, g, b, x, z, yaw, placed);
    return y === null ? null : { x, y, z, yaw };
  }
  // standing as it is; if it does not fit anywhere so, laid on its side (the flatter way first)
  const flat: Lie = b.maxX - b.minX <= b.maxZ - b.minZ ? 'z' : 'x';
  for (const lie of [undefined, flat, flat === 'z' ? 'x' : 'z'] as (Lie | undefined)[]) {
    const s = findPose(zone, g, lieBox(b, lie), yaw, near, placed, grid);
    if (s) return lie ? { ...s, lie } : s;
  }
  return null;
}

function findPose(zone: CargoZone, g: HeightGrid, b: ThingBox, yaw: number, near: { x: number; z: number } | null, placed: readonly Placed[], grid = 0): Spot | null {
  const yaws = [yaw, yaw + Math.PI / 2];
  if (near) {
    const step = grid > 0 ? grid : 0.04;
    const snap = (v: number): number => (grid > 0 ? Math.round(v / grid) * grid : v);
    const cx = snap(near.x);
    const cz = snap(near.z);
    for (let r = 0; r <= 0.6 + 1e-9; r += step) {
      const n = r === 0 ? 1 : Math.max(6, Math.round((2 * Math.PI * r) / step));
      for (const w of yaws) {
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          const x = snap(cx + Math.cos(a) * r);
          const z = snap(cz + Math.sin(a) * r);
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
