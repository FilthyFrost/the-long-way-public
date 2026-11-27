/**
 * The rooms of a piece of furniture (docs/V3/plan/finish.md §十一 2: 格位): where things stand in it and on it — a board
 * of a bookshelf, the bottom of a cupboard behind its doors and the shelf over it, a nightstand's open shelf, a table's
 * top — each with its room: across, deep, high. Whether a thing fits is by its size, not by a count of squares.
 *
 * A room is a box in the piece's own frame (its model's: x its front, y up, z across, metres from its bottom
 * centre; tools/blender/items/nd_home.py, nd_home2.py): its floor's height, how far it is clear above it, its plan.
 * `behind`: the doors that shut it off (the piece's movers, by name) — reached, and seen, with one of them open.
 * `top`: the piece's own top, where things stand in the open (packed last: things go in before they go on).
 * `glass`: its doors are glazed — what stands behind them is seen through them.
 *
 * What belongs to a piece is what stands in its rooms: there is nothing kept of it but where things are.
 * Pure: no three, no DOM.
 */
import {
  ND_BOOKSHELF,
  ND_CABINET,
  ND_DINNER_TABLE,
  ND_FRIDGE,
  ND_KITCHEN_STAND,
  ND_NIGHTSTAND,
  ND_PEGBOARD,
  ND_ROD_RACK,
  ND_TABLE,
  ND_TOP_CABINET,
  ND_WALL_SHELF,
  ND_WORKBENCH,
} from '../../../../core/v3/nd/items';

export interface Room {
  /** its floor (m over the piece's bottom) and how far it is clear above it */
  readonly y: number;
  readonly clear: number;
  /** its plan: from the back to the front (x), across (z) */
  readonly x: readonly [number, number];
  readonly z: readonly [number, number];
  readonly behind?: readonly string[];
  readonly top?: boolean;
  readonly glass?: boolean;
}

const R = (y: number, clear: number, x: [number, number], z: [number, number], o: Partial<Pick<Room, 'behind' | 'top' | 'glass'>> = {}): Room => ({ y, clear, x, z, ...o });

/** how far over a piece's top a thing standing on it may reach (m): taller, it is not the piece's */
const TOP_CLEAR = 0.9;

export const ROOMS: Readonly<Record<string, readonly Room[]>> = {
  // (its lowest board is its own row of books; three boards free, and its top)
  [ND_BOOKSHELF]: [
    R(0.451, 0.33, [-0.14, 0.15], [-0.37, 0.37]),
    R(0.811, 0.33, [-0.14, 0.15], [-0.37, 0.37]),
    R(1.171, 0.32, [-0.14, 0.15], [-0.37, 0.37]),
    R(1.53, TOP_CLEAR, [-0.15, 0.17], [-0.4, 0.4], { top: true }),
  ],
  // (one cupboard behind its two doors: its bottom and its shelf; its top)
  [ND_CABINET]: [
    R(0.1, 0.36, [-0.23, 0.27], [-0.36, 0.36], { behind: ['P_door_a', 'P_door_b'] }),
    R(0.489, 0.32, [-0.23, 0.27], [-0.36, 0.36], { behind: ['P_door_a', 'P_door_b'] }),
    R(0.915, TOP_CLEAR, [-0.29, 0.3], [-0.39, 0.39], { top: true }),
  ],
  // (two bays, each a bottom and a shelf behind its door under its drawer — the model's −y is the game's +z: bay a on
  // +z — and the worktop)
  [ND_KITCHEN_STAND]: [
    R(0.14, 0.26, [-0.24, 0.25], [0.04, 0.66], { behind: ['P_door_a'] }),
    R(0.429, 0.26, [-0.24, 0.25], [0.04, 0.66], { behind: ['P_door_a'] }),
    R(0.14, 0.26, [-0.24, 0.25], [-0.66, -0.04], { behind: ['P_door_b'] }),
    R(0.429, 0.26, [-0.24, 0.25], [-0.66, -0.04], { behind: ['P_door_b'] }),
    R(0.922, TOP_CLEAR, [-0.27, 0.3], [-0.7, 0.7], { top: true }),
  ],
  // (a wall cabinet: its bottom and its shelf behind two glazed doors; its top)
  [ND_TOP_CABINET]: [
    R(0.025, 0.25, [-0.11, 0.13], [-0.42, 0.42], { behind: ['P_door_a', 'P_door_b'], glass: true }),
    R(0.296, 0.27, [-0.11, 0.13], [-0.42, 0.42], { behind: ['P_door_a', 'P_door_b'], glass: true }),
    R(0.63, TOP_CLEAR, [-0.15, 0.16], [-0.45, 0.45], { top: true }),
  ],
  // (its open shelf under the drawer — what is in the drawer is what it holds, standing in the drawer: core/v3/nd/store.ts — and its top)
  [ND_NIGHTSTAND]: [R(0.318, 0.1, [-0.17, 0.19], [-0.19, 0.19]), R(0.59, TOP_CLEAR, [-0.2, 0.22], [-0.22, 0.22], { top: true })],
  [ND_WALL_SHELF]: [R(0.04, 0.24, [-0.06, 0.07], [-0.33, 0.33]), R(0.32, TOP_CLEAR, [-0.06, 0.07], [-0.33, 0.33], { top: true })],
  [ND_TABLE]: [R(0.762, TOP_CLEAR, [-0.34, 0.34], [-0.55, 0.55], { top: true })],
  [ND_DINNER_TABLE]: [R(0.664, TOP_CLEAR, [-0.41, 0.41], [-0.33, 0.33], { top: true })],
  // (a workbench: the shelf under it, and its top beside the vice)
  [ND_WORKBENCH]: [R(0.237, 0.55, [-0.2, 0.2], [-0.48, 0.48]), R(0.885, TOP_CLEAR, [-0.27, 0.2], [-0.3, 0.55], { top: true })],
  // (its top; what is in it is what it holds, kept cold, standing on its shelves: core/v3/nd/store.ts)
  [ND_FRIDGE]: [R(1.36, TOP_CLEAR, [-0.25, 0.2], [-0.28, 0.28], { top: true })],
};

/**
 * A hook of the tool board (tools/blender/items/nd_home3.py PEGS; the board's frame: z across, y up): what it holds —
 * a thing's id, or tool:<kind> for a tool. Each of the tools one lives by has its own (docs/V3/plan/finish.md §十一 2):
 * the long ones along the top, the grinder lower. A tool stands on the board's ledge under its hook (LEDGE_Y), up the
 * wall from there: hung from the hook, a shovel reached a metre down the wall and through a van's floor.
 */
export interface Peg {
  readonly y: number;
  readonly z: number;
  readonly takes: readonly string[];
}
export const PEGS: readonly Peg[] = [
  { y: 0.53, z: -0.36, takes: ['nd_crowbar'] },
  { y: 0.53, z: -0.18, takes: ['nd_shovel'] },
  { y: 0.53, z: 0, takes: ['nd_metal_detector'] },
  { y: 0.53, z: 0.18, takes: ['tool:scraper'] },
  { y: 0.53, z: 0.36, takes: ['nd_flashlight'] },
  { y: 0.27, z: 0.27, takes: ['nd_grinder', 'nd_polisher'] },
];

/** the top of the board's ledge, which the tools stand on (m over its foot) */
export const LEDGE_Y = 0.045;

/** the rod rack's rests (the heights a rod lies at across its two arms), and how far out of the wall */
export const RACK: readonly number[] = [0.07, 0.19, 0.31];
export const RACK_OUT = 0.04;

/**
 * What stands on a board's ledge, or lies across a rack, is within this box of the piece's frame: its least and its
 * greatest corner (a shovel stands a metre up the wall; a rod lies a metre and a half either way). (Not an object of
 * lists named x, y and z: the engine would then keep every plain {x, y, z} of the game's in boxes on the heap, and a
 * frame that writes one would allocate — harness/sim/v3_module.test.ts measures it.)
 */
export const HANGS: Readonly<Record<string, { lo: readonly [number, number, number]; hi: readonly [number, number, number] }>> = {
  [ND_PEGBOARD]: { lo: [-0.03, -0.1, -0.55], hi: [0.4, 1.4, 0.55] },
  [ND_ROD_RACK]: { lo: [-0.06, -0.05, -1.7], hi: [0.3, 0.5, 1.7] },
};

/** the board's hook for a thing (by its id, or tool:<kind>) that none of `taken` hangs from; −1: it has none, or it is taken */
export function pegFor(key: string, taken: readonly string[]): number {
  const i = PEGS.findIndex((p) => p.takes.includes(key));
  if (i < 0) return -1;
  return PEGS[i].takes.some((k) => taken.includes(k)) ? -1 : i;
}

/** the rooms of a kind of furniture (none: it holds nothing on it) */
export function roomsOf(item: string): readonly Room[] {
  return ROOMS[item] ?? [];
}

/** the room of a piece a point of its own frame stands in (its feet on the room's floor, a hand's width either way); −1: none */
export function roomAt(item: string, lx: number, ly: number, lz: number): number {
  const rooms = roomsOf(item);
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    if (lx < r.x[0] - 0.06 || lx > r.x[1] + 0.06 || lz < r.z[0] - 0.06 || lz > r.z[1] + 0.06) continue;
    if (ly < r.y - 0.06 || ly > r.y + r.clear) continue;
    const d = Math.abs(ly - r.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** a room is shut: it has doors and none of them is open */
export function roomShut(room: Room, open: readonly string[] | undefined): boolean {
  if (!room.behind) return false;
  return !room.behind.some((d) => open?.includes(d));
}

/** a thing as a room takes it: how wide it is across the room, how deep, how high; and where it stands now (across, its middle) if it does */
export interface Standing {
  readonly w: number;
  readonly at: number;
}

/**
 * Where a thing of a size goes in a room: across it, the first gap it fits in beside what stands there (a finger's
 * width between two things, from the room's −z end on), in the middle of the room's depth. Null: it does not fit — too
 * tall, too deep (a quarter of its depth may stand out of an open shelf's front, none out of a shut cupboard's), or
 * no gap wide enough.
 */
export function spotIn(room: Room, size: { w: number; d: number; h: number }, there: readonly Standing[]): { x: number; z: number } | null {
  const GAP = 0.02;
  const deep = room.x[1] - room.x[0];
  if (size.h > room.clear || size.d > deep * (room.behind ? 1 : 1.25) || size.w > room.z[1] - room.z[0]) return null;
  const taken = there.map((s) => [s.at - s.w / 2 - GAP, s.at + s.w / 2 + GAP] as const).sort((a, b) => a[0] - b[0]);
  let from = room.z[0];
  for (const [a, b] of taken) {
    if (a - from >= size.w) break;
    from = Math.max(from, b);
  }
  if (from + size.w > room.z[1] + 1e-9) return null;
  // (as far back as it goes without standing out of the front more than it must)
  const x = size.d <= deep ? room.x[0] + size.d / 2 + Math.min(0.02, (deep - size.d) / 2) : room.x[0] + size.d / 2;
  return { x, z: from + size.w / 2 };
}
