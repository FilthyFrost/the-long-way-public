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

export interface Aboardable extends WalkArea {
  readonly doors: readonly BoardDoor[];
  /** behind the cab's seats: where one stands on coming back from the driver's seat (x, z), facing aft */
  readonly aft: readonly [number, number];
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
  },
};

/** what a frame offers for walking about in it (null: nothing) */
export function aboardOf(frame: string): Aboardable | null {
  return ABOARD[frame] ?? null;
}
