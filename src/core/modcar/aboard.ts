/**
 * Where one walks inside a vehicle's living space (docs/V3/nodes/M2-rv.md): the motorhome's floor between its
 * furniture as rectangles one stays inside of (core/onboard/walker.ts), the doors one comes in and goes out by,
 * and the spot behind the cab's seats one stands on coming back from the driver's seat. Frame model space, as the
 * cargo zones (cargo.ts): +x forward, +y up, +z right, metres, the origin on the ground under the middle of the
 * wheelbase. Measured on the frame's own build (tools/blender/frames/_rv_inner.py: the dinette, the galley, the
 * wardrobe and bath, the rear bench). Pure data, no three, no DOM.
 */
import type { WalkArea } from '../onboard/walker';

export interface BoardDoor {
  /** the door's mount (a panel of the frame): open, one passes */
  readonly mount: string;
  /**
   * the doorway as a box (frame model space), aimed at from inside or out: its least and greatest corner. (Not
   * an object of lists named x, y and z: the engine would then keep every plain {x, y, z} of the game's in boxes
   * on the heap, and a frame that writes one would allocate.)
   */
  readonly box: { readonly lo: readonly [number, number, number]; readonly hi: readonly [number, number, number] };
  /** where one stands just inside it and just outside it (x, z) */
  readonly inside: readonly [number, number];
  readonly outside: readonly [number, number];
  /** which way one faces coming in (a walker's yaw: 0 forward, + to the right) */
  readonly inYaw: number;
}

/** a bed in a living space (frame model space): the mattress's top over a rectangle — one lies down on it to sleep */
export interface Bed {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
  readonly top: number;
}

export interface Aboardable extends WalkArea {
  readonly doors: readonly BoardDoor[];
  /** behind the cab's seats: where one stands on coming back from the driver's seat (x, z), facing aft */
  readonly aft: readonly [number, number];
  /** one stands up in it only with the elevating roof up (the Turtle's): in by the door or from the seat only then */
  readonly roof?: boolean;
  /** its beds (docs/V3/plan/rv.md: six hours to be rested, eight in a seat) */
  readonly beds?: readonly Bed[];
}

/** the frames one can walk about inside, by frame id */
export const ABOARD: Readonly<Record<string, Aboardable>> = {
  rv: {
    headroom: 1.9,
    areas: [
      // the front of the box: from behind the cab's seats past the side door, the dinette's bench and table on the left
      { x0: -1.35, x1: 0.85, z0: -0.12, z1: 1.0, floor: 0.86, name: 'lounge' },
      // the aisle between the galley (left) and the wardrobe and the bath (right)
      { x0: -2.45, x1: -0.8, z0: -0.48, z1: 0.38, floor: 0.86, name: 'aisle' },
      // before the rear bench, and its left past the galley's end
      { x0: -2.9, x1: -2.45, z0: -1.0, z1: 1.0, floor: 0.86, name: 'rear' },
      { x0: -2.45, x1: -1.95, z0: -1.0, z1: 0.38, floor: 0.86, name: 'rear-left' },
    ],
    // (the side door's opening spans x −0.36 … 0.2, its leaf hinged at the front edge swings out beside it)
    doors: [{ mount: 'door_side', box: { lo: [-0.36, 0.86, 0.75], hi: [0.2, 2.55, 1.4] }, inside: [-0.08, 0.75], outside: [-0.08, 1.9], inYaw: -Math.PI / 2 }],
    aft: [0.72, 0.1],
    // (the over-cab bunk: its mattress, tools/blender/frames/_rv_inner.py)
    beds: [{ x0: 0.99, x1: 1.93, z0: -1.03, z1: 1.03, top: 2.32 }],
  },
  // the Old Elephant (docs/V3/plan/rv.md R2): its aisle from the bed's platform to the cab between the dinette and the
  // galley (left) and the fridge's cabinet and the sofa (right), and the floor by the entry door out to its step; in by
  // the entry door on the right; back from the driver's seat into the aisle (tools/blender/frames/_elephant_inner.py)
  elephant: {
    headroom: 2.0,
    areas: [
      { x0: -1.88, x1: 2.46, z0: -0.4, z1: 0.36, floor: 0.62, name: 'room' },
      { x0: 0.46, x1: 1.64, z0: 0.36, z1: 0.95, floor: 0.62, name: 'door' },
    ],
    // (the entry door's opening spans x 0.55 … 1.4 on the right, its leaf hinged at the front edge)
    doors: [{ mount: 'door_side', box: { lo: [0.55, 0.62, 0.95], hi: [1.4, 2.55, 1.45] }, inside: [0.98, 0.72], outside: [0.98, 1.9], inYaw: -Math.PI / 2 }],
    aft: [2.25, 0.0],
    // (the bed across the back over the engine: its mattress)
    beds: [{ x0: -4.02, x1: -1.92, z0: -1.13, z1: 1.13, top: 1.44 }],
  },
  // the Camel (docs/V3/plan/rv.md R3): its emptied floor, the rear wheels' humps kept out of it, and the cab's right beside
  // the driver's console out to the entry door's stairwell; in by the entry door, out by it or the emergency door's
  // floor; back from the driver's seat behind the modesty panel (tools/blender/frames/_camel_inner.py). Its beds are
  // the ones put in it (the camper's: a cot riding in it)
  camel: {
    headroom: 2.0,
    areas: [
      { x0: -4.98, x1: 1.84, z0: -0.58, z1: 0.58, floor: 0.72, name: 'aisle' },
      { x0: -2.24, x1: 1.84, z0: -1.13, z1: 1.13, floor: 0.72, name: 'front' },
      { x0: -4.98, x1: -3.46, z0: -1.13, z1: 1.13, floor: 0.72, name: 'back' },
      { x0: 1.84, x1: 2.7, z0: -0.1, z1: 1.05, floor: 0.72, name: 'door' },
    ],
    // (the entry door's opening spans x 2.0 … 2.74 on the right, its leaf hinged at the front edge)
    doors: [{ mount: 'door_side', box: { lo: [2.0, 0.62, 0.95], hi: [2.74, 2.42, 1.45] }, inside: [2.37, 0.8], outside: [2.37, 1.95], inYaw: -Math.PI / 2 }],
    aft: [1.6, 0.2],
  },
  // the Turtle (docs/V3/plan/rv.md R1): the floor between the galley (left) and the sliding door (right), from the bed's
  // cupboard to the front seats' backs; one stands up in it with the roof up (tools/blender/frames/_turtle_inner.py)
  turtle: {
    headroom: 2.0,
    areas: [{ x0: -0.36, x1: 0.84, z0: -0.4, z1: 0.82, floor: 0.42, name: 'room' }],
    // (the sliding door's opening spans x −0.56 … 0.64 on the right, its leaf hinged at the front edge)
    doors: [{ mount: 'door_side', box: { lo: [-0.56, 0.42, 0.62], hi: [0.64, 1.66, 1.2] }, inside: [0.04, 0.6], outside: [0.04, 1.6], inYaw: -Math.PI / 2 }],
    aft: [0.78, 0.0],
    roof: true,
    beds: [{ x0: -2.33, x1: -0.42, z0: -0.84, z1: 0.84, top: 1.065 }],
  },
};

/** what a frame offers for walking about in it (null: nothing) */
export function aboardOf(frame: string): Aboardable | null {
  return ABOARD[frame] ?? null;
}
