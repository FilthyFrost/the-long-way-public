/**
 * Placing a thing where one wants it (docs/ND/PLAN.md, ND4; Nomad Drive's object placement manager with its asset's
 * values): R with something in the hands holds it out before one — floating at 0.75 m (the wheel takes it out to
 * 2 m; a fridge 2 to 3), kept 5 cm short of a wall, facing one until it is turned — with its ghost on whatever is
 * under it (looked for 8 m down). Looked at from within 2.5 m, a vehicle's floor, bed, seat or wall takes it to the
 * spot it would go to there (the game's own stowing: cargo.ts), and the ghost goes. Q and E turn it a quarter round
 * to the next square (0.2 s, easing out), the right button held turns it as the mouse goes (the view holds still);
 * the left button puts it down where it shows, if nothing is in the way — a wall, a vehicle's body, another thing,
 * oneself (at 0.85 of one's size); R again takes it back into the hands. Put down, it settles with a little pop
 * (0.94 to its size over 0.18 s). The shapes here are the solids' (core/world/solids.ts): boxes on the plan turned
 * by a heading, with a bottom and a top. Pure: no three, no DOM.
 *
 * The grid (docs/V3/plan/prompts.md §四, the user's "按下Q或者E就自动进入网格的模式…车的网格"): Q or E puts the thing on
 * the grid of what it goes on — a vehicle's own (in its model's frame, from its first place for things: the lines one
 * sees in it go on outside it within 3 m), else the world's, north up — 10 cm squares: its heading on a quarter of the
 * grid's, its footprint's edges on the lines; the right button's turn takes it off again.
 */

export const PLACE = {
  /** how far before the eye it floats (m), and a fridge's */
  // (further than Nomad Drive's 0.75 to 2: docs/V3/plan/hands.md §四 — it starts out of the way, the wheel takes it out to 3 m, a big thing to 4)
  dist: { start: 1.2, min: 0.6, max: 3.0 },
  far: { start: 2.0, min: 1.0, max: 4.0 },
  /** a notch of the wheel moves it this much (m) */
  notch: 0.1,
  /** the line of sight meets a surface to put it on within this (m): there it goes, whatever the wheel says */
  surfaceReach: 3.5,
  /** the grid's squares (m): Q and E put the thing on it (docs/V3/plan/prompts.md 定案 3) */
  cell: 0.1,
  /** a vehicle's grid reaches this far out round it (m): on the ground behind a motorhome its lines go on (定案 2) */
  nearVehicle: 3,
  /** the grid drawn round the thing: Nomad Drive's 2.5 times its half diagonal, here within 0.6 to 1.2 m */
  gridR: { k: 2.5, min: 0.6, max: 1.2 },
  /** kept this far short of a wall (m) */
  wallGap: 0.05,
  /** its ghost is looked for this far down (m) */
  dropMax: 8,
  /** a vehicle's place to put things is taken up when looked at from within this (m) */
  planeReach: 3.0,
  /** how quickly it follows the view, and goes to a vehicle's spot (1/s) */
  floatK: 25,
  planeK: 20,
  /** Q and E: a quarter round, over this long (s) */
  stepS: 0.2,
  /** the right button held: the turn it makes for the view's (the mouse's) turn */
  turnPerLook: 1.6,
  /** put down: from this much of its size to all of it over this long (s) */
  popFrom: 0.94,
  popS: 0.18,
  /** oneself, as what it may not be put into (Nomad Drive tests the landing at 0.85 of the player's capsule) */
  playerScale: 0.85,
} as const;

/**
 * How far to move a thing for its footprint's edges to lie on a grid's lines: its corners in the grid's frame (u along,
 * w across), the shift that takes the least of each onto the nearest line (squares of `cell`, a line through 0).
 */
export function latticeShift(us: readonly number[], ws: readonly number[], cell: number): { du: number; dw: number } {
  const u0 = Math.min(...us);
  const w0 = Math.min(...ws);
  return { du: Math.round(u0 / cell) * cell - u0, dw: Math.round(w0 / cell) * cell - w0 };
}

/** the heading on the nearest square of a frame's (a multiple of a quarter round from `from`) */
export function nearestQuarter(yaw: number, from = 0): number {
  const q = Math.PI / 2;
  return from + Math.round((yaw - from) / q) * q;
}

/** how far a point is from a box on the plan (0 inside it) */
export function distToRect(x: number, z: number, r: Rect): number {
  const c = Math.cos(r.yaw);
  const s = Math.sin(r.yaw);
  const dx = x - r.x;
  const dz = z - r.z;
  const lx = Math.abs(dx * c + dz * s) - r.hx;
  const lz = Math.abs(-dx * s + dz * c) - r.hz;
  return Math.hypot(Math.max(0, lx), Math.max(0, lz));
}

/** a box on the plan: its middle, its half lengths along its heading and across, the heading (rad: (cos, sin) on x, z) */
export interface Rect {
  x: number;
  z: number;
  hx: number;
  hz: number;
  yaw: number;
}

/** a box on the plan with a bottom and a top (a solid's shape: hz 0 is a round post of radius hx) */
export interface Block extends Rect {
  y0: number;
  y1: number;
}

/** a thing's box in its own frame (+x its front, +z its right, y up: cargo.ts ThingBox) */
export interface Box3 {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/** the plan of a thing's box with its base at (x, z) turned to the heading `yaw` */
export function footprint(b: Box3, x: number, z: number, yaw: number): Rect {
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  // (its +x goes to (cos, sin), its +z — its right — to (−sin, cos))
  return { x: x + cx * c - cz * s, z: z + cx * s + cz * c, hx: (b.maxX - b.minX) / 2, hz: (b.maxZ - b.minZ) / 2, yaw };
}

/** how far a box reaches along a unit axis (ax, az) from its middle */
function reach(r: Rect, ax: number, az: number): number {
  const c = Math.cos(r.yaw);
  const s = Math.sin(r.yaw);
  return r.hx * Math.abs(c * ax + s * az) + r.hz * Math.abs(-s * ax + c * az);
}

/** do two boxes on the plan overlap (by more than `margin`)? A round one (hz 0) as a circle */
export function rectsOverlap(a: Rect, b: Rect, margin = 0): boolean {
  if (a.hz === 0 && b.hz === 0) return Math.hypot(a.x - b.x, a.z - b.z) < a.hx + b.hx - margin;
  if (a.hz === 0 || b.hz === 0) {
    const circle = a.hz === 0 ? a : b;
    const box = a.hz === 0 ? b : a;
    return circleInRect(circle.x, circle.z, circle.hx - margin, box);
  }
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const r of [a, b]) {
    const c = Math.cos(r.yaw);
    const s = Math.sin(r.yaw);
    for (const [ax, az] of [
      [c, s],
      [-s, c],
    ]) {
      const d = Math.abs(dx * ax + dz * az);
      if (d >= reach(a, ax, az) + reach(b, ax, az) - margin) return false;
    }
  }
  return true;
}

/** does a circle come into a box on the plan? */
export function circleInRect(x: number, z: number, r: number, b: Rect): boolean {
  if (r <= 0) return false;
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  const dx = x - b.x;
  const dz = z - b.z;
  const lx = dx * c + dz * s;
  const lz = -dx * s + dz * c;
  const qx = Math.max(-b.hx, Math.min(b.hx, lx));
  const qz = Math.max(-b.hz, Math.min(b.hz, lz));
  return (lx - qx) ** 2 + (lz - qz) ** 2 < r * r;
}

/** is a point inside a block (its plan and between its bottom and top)? */
export function pointInBlock(x: number, y: number, z: number, b: Block): boolean {
  if (y < b.y0 || y > b.y1) return false;
  if (b.hz === 0) return Math.hypot(x - b.x, z - b.z) < b.hx;
  return insideRect(x, z, b);
}

function insideRect(x: number, z: number, b: Rect): boolean {
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  const dx = x - b.x;
  const dz = z - b.z;
  return Math.abs(dx * c + dz * s) <= b.hx && Math.abs(-dx * s + dz * c) <= b.hz;
}

/**
 * The first of the blocks a thing would be put into: its plan `foot`, from `y0` (where it stands) to `y1`; what it
 * stands on (a block whose top is at most a couple of centimetres over its base) is not in the way. Null: none.
 */
export function firstBlocking<T extends Block>(foot: Rect, y0: number, y1: number, blocks: readonly T[], margin = 0.01): T | null {
  for (const b of blocks) {
    if (b.y1 <= y0 + 0.02 || b.y0 >= y1 - 0.01) continue;
    if (rectsOverlap(foot, b, margin)) return b;
  }
  return null;
}

/** the heading turned to the next square (a multiple of a quarter round) the way `dir` says, from `from` (a frame's own heading: 0 the world's) */
export function nextQuarter(yaw: number, dir: 1 | -1, from = 0): number {
  const q = Math.PI / 2;
  const k = (yaw - from) / q;
  // (on a square already, or within a hair of one: the next one over)
  const n = dir > 0 ? Math.floor(k + 1e-6) + 1 : Math.ceil(k - 1e-6) - 1;
  return from + n * q;
}

/** easing out: cubic (a quarter turn), and with a little overshoot (the pop of a thing put down) */
export function outCubic(t: number): number {
  const u = 1 - Math.min(1, Math.max(0, t));
  return 1 - u * u * u;
}

export function outBack(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
}

/** the distance it floats at after `notches` of the wheel (out +), within its range */
export function stepDistance(d: number, notches: number, range: { min: number; max: number }): number {
  return Math.max(range.min, Math.min(range.max, d + notches * PLACE.notch));
}
