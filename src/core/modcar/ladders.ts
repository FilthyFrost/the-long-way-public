/**
 * A vehicle's ladder and the roof one stands on up there (docs/V3/plan/growth.md §六 2, J9e; Nomad Drive's
 * vehicle ladder): where each roofed frame's ladder goes (data/ladders.json — the Blender script builds each frame's
 * ladder from the same table), the line it is climbed along (core/v3/nd/climb.ts climbs it as it climbs a building's:
 * the feet's line standing off its rungs, its foot and its head, the way one faces it), where one is let go at its head,
 * and the boxes one stands on up there — the roof, raised to a rack's slats while one is on the roof mount — with the
 * walls that keep one off what one cannot stand on. Frame model space (+x forward, +y up, +z right, metres, the origin
 * on the ground under the middle of the wheels). Pure data and maths.
 */
import { CLIMB } from '../v3/nd/climb';
import table from './data/ladders.json';
import type { V3 } from './types';

/**
 * a box one stands on: its plan (its x range along, its z range across) and its top. (Not keys named x, y and z
 * holding pairs: the engine would then keep every plain {x, y, z} of the game's in boxes on the heap — a frame that
 * writes a walker's x would allocate: harness/sim/v3_module.test.ts measures it.)
 */
export interface LadderFloor {
  readonly along: readonly [number, number];
  readonly across: readonly [number, number];
  readonly top: number;
  /** raised to the walking height of the part on the roof mount (a rack's slats) */
  readonly rack?: boolean;
}

/** what one cannot stand on and does not walk into up there (the Rhino's canvas tilt): its plan and its heights */
export interface LadderWall {
  readonly along: readonly [number, number];
  readonly across: readonly [number, number];
  readonly height: readonly [number, number];
}

/** where a frame's ladder goes (data/ladders.json) */
export interface LadderSpot {
  /** +1 up the right side, −1 the left, 0 the back */
  readonly side: -1 | 0 | 1;
  /** a side ladder: the middle between its rails along the body */
  readonly x?: number;
  /** a rear one: the middle between its rails across it */
  readonly z?: number;
  /** the plane of its rails: out from the middle (|z|, a side ladder) or along (x, a rear one) */
  readonly rail: number;
  /** a side ladder's stand-offs: in from its rails to the body's skin (m; absent 0.05) */
  readonly stand?: number;
  /** its lowest rung's height */
  readonly foot: number;
  /** a side ladder's hooks over the roof's edge: shifted forward by dx, reaching in to |z| = to */
  readonly hook?: { readonly dx: number; readonly to: number };
  /** where one is let go up there (x, z) */
  readonly exit: readonly [number, number];
  readonly floors: readonly LadderFloor[];
  readonly walls?: readonly LadderWall[];
  /** the frame's own model has it (the Whale's): climbable without a part, no mount */
  readonly builtin?: boolean;
}

/** how far apart a ladder's rails are (m) */
export const LADDER_RAILS: number = table.rails;

/** the part that is a ladder (on the frames' 'ladder' mount) */
export const LADDER_PART = 'ladder';

/** each roofed frame's ladder: where it goes, what one stands on up there */
export const LADDER_SPOTS: Readonly<Record<string, LadderSpot>> = table.frames as unknown as Record<string, LadderSpot>;

/** where a frame's ladder goes (null: a frame without a roof — the motorcycle, the trailer) */
export function ladderSpot(frameId: string): LadderSpot | null {
  return LADDER_SPOTS[frameId] ?? null;
}

/**
 * The ladder mount a frame gets (frames.ts withLadder): the part's origin at the middle of its foot, in the plane of
 * its rails, the side it hangs on (the part is built for the left and mirrored on the right). Null: no roof, or the
 * frame's own model has its ladder (the Whale's, up its back).
 */
export function ladderMountOf(frameId: string): { pos: V3; side: -1 | 1 } | null {
  const s = ladderSpot(frameId);
  if (!s || s.builtin || s.side === 0 || s.x === undefined) return null;
  return { pos: { x: s.x, y: s.foot, z: s.side * s.rail }, side: s.side };
}

/** how high a part on the roof mount lifts what one stands on there (m over the mount, at a fit 0.15 m high): a rack's slats, a panel's face */
export const ROOF_WALK: Readonly<Record<string, number>> = { roof_rack: 0.085, roof_solar: 0.09, roof_spikes: 0.04 };

/** the roof mount as built, for its floors: the part on it, the mount's height, its fit's height */
export interface RoofAsBuilt {
  readonly part: string;
  readonly mountY: number;
  readonly fitH: number;
}

/** the boxes one stands on up there as the vehicle is built: a rack's floor at its slats */
export function roofFloors(spot: LadderSpot, roof: RoofAsBuilt | null): LadderFloor[] {
  const lift = roof ? ROOF_WALK[roof.part] : undefined;
  return spot.floors.map((f) => (f.rack && lift !== undefined && roof ? { ...f, top: Math.max(f.top, roof.mountY + lift * (roof.fitH / 0.15)) } : f));
}

/** the highest floor holding a point (x, z), null: none */
export function floorAt(floors: readonly LadderFloor[], x: number, z: number): number | null {
  let best: number | null = null;
  for (const f of floors) if (x >= f.along[0] && x <= f.along[1] && z >= f.across[0] && z <= f.across[1] && (best === null || f.top > best)) best = f.top;
  return best;
}

/** the top the body's box is cut to while one is up there: the lowest floor less a hair (what one stands on is above it) */
export function bodyCut(floors: readonly LadderFloor[]): number {
  return Math.min(...floors.map((f) => f.top)) - 0.03;
}

/** the feet's line over what one is let go onto at its head (m: the water tower's 0.14) */
const HEAD_OVER = 0.12;
/** the feet's line starts no higher than this over the ground (m: Nomad Drive's 0.61 — taking hold lifts one onto it) */
const FOOT_MAX = 0.62;

/**
 * The ladder as it is climbed (frame model space): the feet's line — off its rungs by Nomad Drive's stand-off — from
 * its foot (no higher than one is lifted onto it from the ground) to just over the floor at its head, the way one faces
 * it (a unit vector on the plan, into the body), and where one is let go up there.
 */
export function ladderLine(spot: LadderSpot, floors: readonly LadderFloor[]): { foot: V3; head: V3; face: { x: number; z: number }; exit: V3 } {
  const ex = spot.exit[0];
  const ez = spot.exit[1];
  const top = floorAt(floors, ex, ez) ?? Math.max(...floors.map((f) => f.top));
  const fy = Math.min(spot.foot, FOOT_MAX);
  if (spot.side === 0) {
    const x = spot.rail - CLIMB.standOff;
    const z = spot.z ?? 0;
    return { foot: { x, y: fy, z }, head: { x, y: top + HEAD_OVER, z }, face: { x: 1, z: 0 }, exit: { x: ex, y: top + 0.02, z: ez } };
  }
  const x = spot.x ?? 0;
  const z = spot.side * (spot.rail + CLIMB.standOff);
  return { foot: { x, y: fy, z }, head: { x, y: top + HEAD_OVER, z }, face: { x: 0, z: -spot.side }, exit: { x: ex, y: top + 0.02, z: ez } };
}
