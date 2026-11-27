/**
 * Where one walks inside a vehicle's living space (docs/V3/nodes/M2-rv.md): the motorhome's floor between its
 * furniture as rectangles one stays inside of (core/onboard/walker.ts), the doors one comes in and goes out by,
 * and the spot behind the cab's seats one stands on coming back from the driver's seat. Frame model space, as the
 * cargo zones (cargo.ts): +x forward, +y up, +z right, metres, the origin on the ground under the middle of the
 * wheelbase as the frame was first drawn. Measured on the frame's own build (tools/blender/frames/_rv_inner.py and the
 * rest) — and, for the four campers lengthened since docs/V3/plan/finish.md §18 (tools/blender/frames/_stretch.py: the
 * Whale 1.2 m, the Old Elephant 1.5, the Camel 1.1, the Turtle 0.9 and 0.3 m wider), as they stand now: what lay behind
 * a cut moved back with it. Since docs/V3/plan/finish.md §十九 step 7 every living space is an empty shell, as Nomad
 * Drive's campers are: its floor, its walls; what one lives with — a bed to sleep in too — is what the player puts in
 * (the Whale's bunk over the cab its one bed, as Nomad Drive's class C keeps its own). Pure data, no three, no DOM.
 */
import type { WalkArea } from '../onboard/walker';
import { zonesOf } from './cargo';

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
  /** how far out from the spot just inside it the body's outer face is (m, along the way out): where its steps start */
  readonly sill: number;
  /**
   * The stairwell sunk into the floor inside the door, as Nomad Drive's campers have theirs (the frame's own: tools/
   * blender/frames/_steps.py): its treads' tops, the lowest first — that one at the door's sill, the door shutting over
   * the well — each `depth` deep from the body's outer face in.
   */
  readonly well?: { readonly tops: readonly number[]; readonly depth: number };
  /**
   * The step(s) outside the body, slid out from under it as the door opens (carView.ts buildSteps): their tops, the
   * lowest first — the highest against the body's outer face — each `depth` deep along the way out, `width` across
   * (default: the doorway's less 0.12 m).
   */
  readonly step?: { readonly tops: readonly number[]; readonly depth: number; readonly width?: number };
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
  /**
   * behind the cab's seats: where one stands on coming back from the driver's seat (x, z), facing aft. Absent: no way
   * through from a seat (a trailer; a truck's box behind its cab's back wall) — in and out by the doors only.
   */
  readonly aft?: readonly [number, number];
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
      // its whole floor, from behind the cab's seats to the back wall (its lining at −5.095), wall to wall (theirs at
      // ±1.1): the shelves, the galley, the dinette and the bed across the back that stood on it are gone (docs/V3/plan/
      // finish.md §十九 step 7). Up to the side door's stairwell (its inner edge at 0.725), and either side of it to the
      // right wall
      { x0: -5.0, x1: 0.85, z0: -1.0, z1: 0.72, floor: 0.86, name: 'room' },
      { x0: -5.0, x1: -1.36, z0: 0.72, z1: 1.0, floor: 0.86, name: 'room' },
      { x0: -0.48, x1: 0.85, z0: 0.72, z1: 1.0, floor: 0.86, name: 'room' },
    ],
    // (the side door's opening spans x −1.32 … −0.52 — 0.8 m since docs/V3/plan/finish.md §十一 1, it was 0.56 — from
    // its sill at 0.43 up to 2.71; its leaf hinged at the front edge swings out beside it. Inside it a stairwell of two
    // treads 0.2 m deep, as Nomad Drive's class C has, the body's face at 1.125; under it a step that slides out: four
    // rises of 0.215 from the ground to the floor)
    doors: [
      {
        mount: 'door_side',
        box: { lo: [-1.32, 0.43, 0.72], hi: [-0.52, 2.7, 1.4] },
        inside: [-0.92, 0.58],
        outside: [-0.92, 1.9],
        inYaw: -Math.PI / 2,
        sill: 0.545,
        well: { tops: [0.43, 0.645], depth: 0.2 },
        step: { tops: [0.215], depth: 0.26, width: 0.74 },
      },
    ],
    aft: [0.72, 0.1],
    // (the bunk over the cab, its mattress — tools/blender/frames/_rv_inner.py: kept, as Nomad Drive's class C keeps its
    // bed there; any other bed is one the player puts in)
    beds: [{ x0: 0.99, x1: 1.93, z0: -1.03, z1: 1.03, top: 2.32 }],
  },
  // the Old Elephant (docs/V3/plan/rv.md R2), an empty shell since docs/V3/plan/finish.md §十九 step 7 (the dinette, the
  // galley, the lockers, the fridge's cabinet and the bed on its platform are gone): its floor from the rear wheels'
  // humps (their feet at −3.51) to the front wheels' (at 2.21), wall to wall (the walls at ±1.17; on the right as far as
  // the entry door's stairwell); between the rear humps (their inboard walls at ±0.61) back to the engine deck's front
  // (−4.18); between the front humps (±0.64) up to the seat boxes. In by the entry door on the right; back from the
  // driver's seat between the front humps (tools/blender/frames/_elephant_inner.py)
  elephant: {
    headroom: 2.0,
    areas: [
      { x0: -3.42, x1: 2.1, z0: -1.08, z1: 0.95, floor: 0.62, name: 'room' },
      { x0: -4.11, x1: -3.42, z0: -0.56, z1: 0.56, floor: 0.62, name: 'back' },
      { x0: 2.1, x1: 2.46, z0: -0.58, z1: 0.58, floor: 0.62, name: 'front' },
    ],
    // (the entry door's opening spans x −0.95 … −0.1 on the right, from its sill at 0.41 up; its leaf hinged at the front
    // edge. Inside it a stairwell of one tread 0.25 m deep, as Nomad Drive's class A has, the body's face at 1.195; under
    // it a step that slides out: three rises of 0.207 from the ground to the floor)
    doors: [
      {
        mount: 'door_side',
        box: { lo: [-0.95, 0.413, 0.94], hi: [-0.1, 2.55, 1.45] },
        inside: [-0.52, 0.78],
        outside: [-0.52, 1.9],
        inYaw: -Math.PI / 2,
        sill: 0.415,
        well: { tops: [0.413], depth: 0.25 },
        step: { tops: [0.207], depth: 0.26, width: 0.74 },
      },
    ],
    aft: [2.25, 0.0],
  },
  // the Camel (docs/V3/plan/rv.md R3): its emptied floor, the rear wheels' humps kept out of it, and the cab's right beside
  // the driver's console out to the entry door's stairwell; in by the entry door, out by it or the emergency door's
  // floor; back from the driver's seat behind the modesty panel (tools/blender/frames/_camel_inner.py). Its beds are
  // the ones put in it (the camper's: a cot riding in it)
  // (its back 1.1 m longer since docs/V3/plan/finish.md §18: the floor behind the last window)
  camel: {
    headroom: 2.0,
    areas: [
      { x0: -6.08, x1: 1.84, z0: -0.58, z1: 0.58, floor: 0.72, name: 'aisle' },
      { x0: -2.24, x1: 1.84, z0: -1.13, z1: 1.13, floor: 0.72, name: 'front' },
      { x0: -6.08, x1: -3.46, z0: -1.13, z1: 1.13, floor: 0.72, name: 'back' },
      { x0: 1.84, x1: 2.7, z0: -0.1, z1: 0.6, floor: 0.72, name: 'door' },
    ],
    // (the entry door's opening spans x 2.0 … 2.74 on the right, from its sill at 0.24 up; its leaf hinged at the front
    // edge. Inside it a bus's stairwell, as Nomad Drive's school bus has: two treads 0.3 m deep, the body's face at 1.213,
    // three rises of 0.24 from the ground to the floor — no step outside)
    doors: [
      {
        mount: 'door_side',
        box: { lo: [2.0, 0.24, 0.6], hi: [2.74, 2.42, 1.45] },
        inside: [2.37, 0.45],
        outside: [2.37, 1.95],
        inYaw: -Math.PI / 2,
        sill: 0.763,
        well: { tops: [0.24, 0.48], depth: 0.3 },
      },
    ],
    aft: [1.6, 0.2],
  },
  // the Turtle (docs/V3/plan/rv.md R1), an empty shell as Nomad Drive's camper van since docs/V3/plan/finish.md §十九
  // step 7 (the bed on its platform, the bunk in the roof's opening and the galley are gone): its floor from the deck over
  // the rear axle (its front at −1.53) to the front seats' backs, wall to wall (the walls at ±1.04); one stands up in it
  // with the roof up (tools/blender/frames/_turtle_inner.py)
  turtle: {
    headroom: 2.0,
    areas: [{ x0: -1.43, x1: 0.84, z0: -0.97, z1: 0.97, floor: 0.42, name: 'room' }],
    // (the sliding door's opening spans x −1.46 … −0.26 on the right from the floor up, its leaf hinged at the front edge;
    // the body's face at 1.067. Under it a step that slides out, as Nomad Drive's van has its running board: two rises of
    // 0.21 from the ground to the floor)
    doors: [
      {
        mount: 'door_side',
        box: { lo: [-1.46, 0.42, 0.77], hi: [-0.26, 1.66, 1.35] },
        inside: [-0.86, 0.75],
        outside: [-0.86, 1.75],
        inYaw: -Math.PI / 2,
        sill: 0.317,
        step: { tops: [0.21], depth: 0.3, width: 1.1 },
      },
    ],
    aft: [0.78, 0.0],
    roof: true,
  },
  // the Snail (docs/V3/plan/finish.md §十一 1): its box behind the cab's back wall — no way through from the seats; in
  // and out by the rear door (the right leaf of its two: the opening from the middle to the right post). Its floor
  // between the plywood walls at ±0.905 (tools/blender/frames/_snail_inner.py), 1.9 m under the ceiling
  snail: {
    headroom: 1.9,
    areas: [{ x0: -2.2, x1: 0.48, z0: -0.76, z1: 0.76, floor: 0.95, name: 'box' }],
    // (under the rear door a ladder of three treads slides out from under the box's floor: four rises of 0.24)
    doors: [{ mount: 'trunk', box: { lo: [-2.7, 0.95, 0.02], hi: [-2.2, 2.76, 0.83] }, inside: [-1.9, 0.42], outside: [-3.45, 0.42], inYaw: 0, sill: 0.62, step: { tops: [0.2375, 0.475, 0.7125], depth: 0.24, width: 0.62 } }],
  },
  // the Tadpole (docs/V3/plan/finish.md §十一 1): the whole of its box's planked floor, in and out by the rear door
  // (tools/blender/frames/trailer.py: the walls' linings at ±0.85, the front wall's at 1.338, the door at −1.662)
  trailer: {
    headroom: 1.9,
    areas: [{ x0: -1.5, x1: 1.2, z0: -0.7, z1: 0.7, floor: 0.665, name: 'box' }],
    // (under the rear door two treads slide out from under the floor: three rises of 0.22)
    doors: [{ mount: 'trunk', box: { lo: [-1.85, 0.665, -0.79], hi: [-1.5, 2.57, 0.79] }, inside: [-1.25, 0], outside: [-2.55, 0], inYaw: 0, sill: 0.47, step: { tops: [0.222, 0.443], depth: 0.24, width: 0.9 } }],
  },
};

/**
 * Which making of its inside a frame is at (0: as it was first made). A save says which one the things in a vehicle
 * were put in under (SavedVehicle.room); under an older one than this, they are put in again where there is room for
 * them now — a thing that stood where the Whale's wardrobe was, on the Old Elephant's built-in sofa, on the floor of the
 * trailer's small box (docs/V3/plan/finish.md §十一 1); everything in the four campers once they were lengthened (§18);
 * everything in the Whale, the Old Elephant and the Turtle once their living spaces were emptied (§十九 step 7: what
 * stood on a galley, a table, a bed or a shelf that is no more).
 */
const ROOM_REV: Readonly<Record<string, number>> = { rv: 3, elephant: 3, camel: 1, turtle: 2, trailer: 1, snail: 1 };

export function roomRev(frame: string): number {
  return ROOM_REV[frame] ?? 0;
}

/**
 * The steps up into a doorway (the player's ask, 2026-11-26, as Nomad Drive's campers have them: one walks in at an open
 * door and up its steps, no jump; and as handsome as theirs, part of the body): frame model space along the way out from
 * the spot just inside it. The treads of the stairwell sunk into the floor inside the door (BoardDoor.well) and of the
 * step slid out under it (BoardDoor.step), every rise 0.24 m or less (Nomad Drive's 0.15-0.24).
 */
export interface DoorSteps {
  /** the way out on the plan (unit; x forward, z right) */
  readonly ux: number;
  readonly uz: number;
  /** the spot just inside the doorway, and how far out from it the body's outer face is (m) */
  readonly inside: readonly [number, number];
  readonly sill: number;
  /** the floor inside (m over the ground under the frame) */
  readonly floor: number;
  /**
   * every tread from the floor down to the ground: [s0, s1] along the way out from the body's outer face (m; the
   * stairwell's inside it, s1 ≤ 0) and its top (m) — the innermost first
   */
  readonly treads: readonly { readonly s0: number; readonly s1: number; readonly top: number }[];
  /** the step(s) outside the body that slide out with the door (null: none): their tops, the lowest first, depth, width */
  readonly out: { readonly tops: readonly number[]; readonly depth: number; readonly width: number } | null;
  /** the doorway's middle across (frame model space, x and z) and its half width (m) */
  readonly mid: readonly [number, number];
  readonly half: number;
}

const TREAD = 0.24;

export function doorSteps(def: Aboardable, door: BoardDoor): DoorSteps {
  const ox = door.outside[0] - door.inside[0];
  const oz = door.outside[1] - door.inside[1];
  const ol = Math.hypot(ox, oz) || 1;
  const [ix, iz] = door.inside;
  const area = def.areas.find((a) => ix >= a.x0 && ix <= a.x1 && iz >= a.z0 && iz <= a.z1) ?? def.areas[0];
  const floor = area?.floor ?? 0;
  const b = door.box;
  const side = Math.abs(oz) >= Math.abs(ox);
  const half = (side ? b.hi[0] - b.lo[0] : b.hi[2] - b.lo[2]) / 2;
  // (a doorway with neither: steps outside of a rise of about 0.3 m or less, each a quarter of a metre deep)
  let step = door.step;
  if (!door.well && !step) {
    const n = Math.max(1, Math.ceil(floor / 0.3) - 1);
    const tops: number[] = [];
    for (let k = 1; k <= n; k++) tops.push((floor * k) / (n + 1));
    step = { tops, depth: TREAD };
  }
  const treads: { s0: number; s1: number; top: number }[] = [];
  // (the stairwell's, from its inner edge out to the body's face: the highest innermost)
  const w = door.well;
  if (w) for (let k = w.tops.length - 1; k >= 0; k--) treads.push({ s0: -(k + 1) * w.depth, s1: -k * w.depth, top: w.tops[k] });
  // (the steps outside, from the face out: the highest against it)
  const out = step ? { tops: step.tops, depth: step.depth, width: step.width ?? Math.max(0.4, 2 * half - 0.12) } : null;
  if (out) {
    const n = out.tops.length;
    for (let k = n - 1; k >= 0; k--) treads.push({ s0: (n - 1 - k) * out.depth, s1: (n - k) * out.depth, top: out.tops[k] });
  }
  return { ux: ox / ol, uz: oz / ol, inside: door.inside, sill: door.sill, floor, treads, out, mid: [(b.lo[0] + b.hi[0]) / 2, (b.lo[2] + b.hi[2]) / 2], half };
}

/**
 * The height the feet stand at (m over the ground under the frame) `s` metres out from the body's outer face along a
 * doorway's way out (negative: inside it): the floor, the treads' tops — the stairwell's inside the face, the step's
 * outside it — and the ground, each edge eased over a fifth of a metre (less where a tread is shallower) as a foot going
 * up or down a step eases the eye (Nomad Drive's view follows its head's height smoothed).
 */
export function stepHeight(st: DoorSteps, s: number): number {
  const tr = st.treads;
  if (!tr.length) return s < 0 ? st.floor : 0;
  const first = tr[0].s0;
  const last = tr[tr.length - 1].s1;
  const at = (q: number): number => {
    if (q < first) return st.floor;
    if (q >= last) return 0;
    for (const t of tr) if (q >= t.s0 && q < t.s1) return t.top;
    return 0;
  };
  // (the nearest edge: the floor's, between two treads, the ground's; eased over e either side of it)
  let edge = first;
  for (const t of tr) {
    if (Math.abs(t.s0 - s) < Math.abs(edge - s)) edge = t.s0;
    if (Math.abs(t.s1 - s) < Math.abs(edge - s)) edge = t.s1;
  }
  let e = 0.1;
  for (const t of tr) e = Math.min(e, 0.45 * (t.s1 - t.s0));
  if (Math.abs(s - edge) >= e) return at(s);
  const lo = at(edge + e);
  const hi = at(edge - e);
  const t = (edge + e - s) / (2 * e);
  return lo + (hi - lo) * t * t * (3 - 2 * t);
}

/** what a frame offers for walking about in it (null: nothing) */
export function aboardOf(frame: string): Aboardable | null {
  return ABOARD[frame] ?? null;
}

/**
 * A living space as a box, wall to wall and floor to ceiling (frame model space; null: the frame has none): what is
 * inside it is indoors — lit as a room is and not by the open sky (a ceiling under the open sky takes the green of the
 * grass below it), never muddy, out of the rain (docs/V3/plan/finish.md §十一 1). Its walls are where its things hang
 * (cargo.ts: the frame's 'wall' zone, which reaches a little past them), else a hand's width past where one walks;
 * from under its floor to over its headroom.
 */
export function roomOf(frame: string): { lo: [number, number, number]; hi: [number, number, number] } | null {
  const def = ABOARD[frame];
  if (!def || !def.areas.length) return null;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, floor = Infinity;
  for (const a of def.areas) {
    x0 = Math.min(x0, a.x0 - 0.15);
    x1 = Math.max(x1, a.x1 + 0.15);
    z0 = Math.min(z0, a.z0 - 0.15);
    z1 = Math.max(z1, a.z1 + 0.15);
    floor = Math.min(floor, a.floor);
  }
  const wall = zonesOf(frame).find((z) => z.wall);
  if (wall) {
    x0 = Math.min(x0, wall.x[0]);
    x1 = Math.max(x1, wall.x[1]);
    z0 = Math.min(z0, wall.z[0]);
    z1 = Math.max(z1, wall.z[1]);
  }
  return { lo: [x0, floor - 0.08, z0], hi: [x1, floor + (def.headroom ?? 1.9) + 0.15, z1] };
}
