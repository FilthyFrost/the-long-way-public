/**
 * What a container holds stands in it (the player's ask, 2026-11-26: "打开保温箱、冰箱、柜子的时候不要跳出来这个UI，
 * 我希望是玩家打开后，能直接看到里面存放的物品，鼠标对准该物品就可以捡起来…所见即所得"). As Nomad Drive has it, a
 * cooler, a fridge, a chest and a drawer have boards inside them — flat places a thing is set on, each clear so far
 * above it: a cooler's floor, a fridge's two wire shelves and its crisper's top, the shelves in its door, a drawer's
 * bottom, a chest's floor — and what is put in stands where it was put, turned as it was put, kept so while the
 * container is shut and seen there again when it is opened. A board in a door rides on the door, a drawer's bottom on
 * the drawer: what stands on them goes with them.
 *
 * A thing goes on a board as Nomad Drive's interior boards take one: no taller than the board is clear, its longest
 * side 0.7 m at the most, its footprint on the board — a twentieth of it may stand out over an edge — and clear of
 * what stands there already, with 5 mm of slack in each. How many things and how much weight a container takes are the
 * game's own (ItemDef.holds: so many stacks, so many kg), asked apart from this.
 *
 * The frame is the container's model's (x its front, y up, z across, metres from its foot; a board on a door or a
 * drawer as it is with that shut). A thing's place there: which board, where its origin is on the board's plan, its
 * turn about the upright (rad, as a thing lying about is turned: its front to (cos r, sin r) on x and z), and whether
 * it lies on its side (cargo.ts: laid about its z, or about its x). A container keeps its things' places on itself
 * (ItemState.spots: by the things' uids), so they are saved with it and go where it goes.
 *
 * Pure: no three, no DOM.
 */
import { COOLER } from '../kitchen/items';
import { ND_CHEST, ND_CHEST_RARE } from './dig';
import { ND_FRIDGE, ND_NIGHTSTAND } from './items';
import { footprint, rectsOverlap, type Box3, type Rect } from './place';

declare module '../../modcar/items' {
  interface ItemState {
    /** where each thing in a container stands in it, by the thing's uid (spotSaved) */
    spots?: Record<string, SpotSaved>;
  }
}

export type Lie = 'z' | 'x';

/** a board inside a container (its model's frame, m) */
export interface Board {
  /** its floor's height, and how far it is clear above it */
  readonly y: number;
  readonly clear: number;
  /** its plan: from its back to its front (x), across (z) */
  readonly x: readonly [number, number];
  readonly z: readonly [number, number];
  /** the movers of the container one of which, open, reaches it (its lid, a door, a drawer) */
  readonly behind: readonly string[];
  /** the mover it rides on (a door's shelf, a drawer's bottom); absent: the container itself */
  readonly on?: string;
  /** the side of its room a hand comes in by: its top (a cooler, a chest, a drawer), its front (+x: a fridge's shelf) or its back (−x: a shelf in a fridge's door, reached with the door open) */
  readonly from: 'top' | 'front' | 'back';
}

/**
 * Where a thing stands in a container: on which board, its origin on the board's plan, its turn, laid on its side or
 * not; `up`, how far over the board's floor it lies on others (a container fuller than its floor: layOut)
 */
export interface Spot {
  b: number;
  x: number;
  z: number;
  r: number;
  lie?: Lie;
  up?: number;
}

/** a thing as a board takes it: its footprint where it stands, how high it stands, how far its origin is over the board */
export interface Standing {
  readonly rect: Rect;
  readonly h: number;
  readonly lift: number;
}

const B = (y: number, clear: number, x: [number, number], z: [number, number], behind: string[], from: Board['from'], on?: string): Board => ({ y, clear, x, z, behind, from, ...(on ? { on } : {}) });

/** a chest's floor (tools/blender/items/nd_tools.py chest: its walls 4 cm, its floor 5 cm; clear up under its domed lid's middle) */
const CHEST_FLOOR: readonly Board[] = [B(0.05, 0.3, [-0.245, 0.245], [-0.355, 0.355], ['LID'], 'top')];

/**
 * The boards of the containers (their models: tools/blender/items). The cooler is Nomad Drive's size (its inside 0.53
 * by 0.31 m and clear 0.36 under its lid: cookware.py kit_cooler); the fridge's shelves are its model's own (nd_home.py
 * nd_fridge: its wire shelves end short of the door's, so what stands in the door clears them as it shuts; each of the
 * door's clear up to the one over it); the nightstand's drawer is clear 9 cm under its carcass (nd_home2.py).
 */
export const STORES: Readonly<Record<string, readonly Board[]>> = {
  [COOLER]: [B(0.044, 0.35, [-0.15, 0.15], [-0.26, 0.26], ['LID'], 'top')],
  [ND_FRIDGE]: [
    B(0.865, 0.355, [-0.22, 0.12], [-0.25, 0.25], ['P_door'], 'front'),
    B(0.525, 0.325, [-0.22, 0.12], [-0.25, 0.25], ['P_door'], 'front'),
    B(0.291, 0.22, [-0.22, 0.12], [-0.25, 0.25], ['P_door'], 'front'),
    B(1.006, 0.2, [0.152, 0.22], [-0.25, 0.25], ['P_door'], 'back', 'P_door'),
    B(0.706, 0.28, [0.152, 0.22], [-0.25, 0.25], ['P_door'], 'back', 'P_door'),
    B(0.366, 0.32, [0.152, 0.22], [-0.25, 0.25], ['P_door'], 'back', 'P_door'),
  ],
  [ND_NIGHTSTAND]: [B(0.444, 0.09, [-0.135, 0.195], [-0.165, 0.165], ['P_drawer_a'], 'top', 'P_drawer_a')],
  [ND_CHEST]: CHEST_FLOOR,
  [ND_CHEST_RARE]: CHEST_FLOOR,
};

/** the boards of a kind of thing (none: what it holds is not seen in it — a basket, a creel: their lists) */
export function boardsOf(item: string): readonly Board[] {
  return STORES[item] ?? [];
}

/** Nomad Drive's interior boards: a twentieth of a thing's base may stand out over an edge, its base at most 0.7 m, 5 mm of slack */
export const FIT = { overhang: 0.05, base: 0.7, slack: 0.005 } as const;
/** things laid out by themselves keep this much apart (m); one put just so may touch another */
const GAP = 0.01;
/** the squares a thing put just so keeps to on a board, from its back left corner (m: nd-home's) */
export const CELL = 0.05;

/** is a board reached now: one of the movers it is behind stands open */
export function boardOpen(board: Board, open: readonly string[] | undefined): boolean {
  if (!open) return false;
  for (const name of board.behind) if (open.includes(name)) return true;
  return false;
}

/** a thing's box laid on its side (cargo.ts lieBox: about its z, its x) */
export function laid(b: Box3, lie: Lie | undefined): Box3 {
  if (lie === 'z') return { minX: -b.maxY, maxX: -b.minY, minY: b.minX, maxY: b.maxX, minZ: b.minZ, maxZ: b.maxZ };
  if (lie === 'x') return { minX: b.minX, maxX: b.maxX, minY: b.minZ, maxY: b.maxZ, minZ: -b.maxY, maxZ: -b.minY };
  return b;
}

/** a thing (its own box) standing at a place: its footprint, its height, how far its origin stands over the board */
export function standing(box: Box3, s: { x: number; z: number; r: number; lie?: Lie }): Standing {
  const b = laid(box, s.lie);
  return { rect: footprint(b, s.x, s.z, s.r), h: b.maxY - b.minY, lift: -b.minY };
}

/** how far a footprint reaches along x and along z from its middle */
function extent(r: Rect): { ex: number; ez: number } {
  const c = Math.abs(Math.cos(r.yaw));
  const s = Math.abs(Math.sin(r.yaw));
  return { ex: r.hx * c + r.hz * s, ez: r.hx * s + r.hz * c };
}

/**
 * Why a thing standing so does not go on the board: 'tall' (taller than the board is clear), 'big' (its base over 0.7 m),
 * 'off' (it stands out over an edge by more than a twentieth of itself); '' it goes.
 */
export function fitWhy(board: Board, st: Standing): '' | 'tall' | 'big' | 'off' {
  if (st.h > board.clear + FIT.slack) return 'tall';
  const { ex, ez } = extent(st.rect);
  if (2 * Math.max(st.rect.hx, st.rect.hz) > FIT.base + FIT.slack) return 'big';
  const ox = FIT.overhang * 2 * ex + FIT.slack;
  const oz = FIT.overhang * 2 * ez + FIT.slack;
  const r = st.rect;
  if (r.x - ex < board.x[0] - ox || r.x + ex > board.x[1] + ox || r.z - ez < board.z[0] - oz || r.z + ez > board.z[1] + oz) return 'off';
  return '';
}

/** does a footprint stand clear of others (on the same board)? `gap`: how far apart they keep (a little less: they may touch) */
export function clearOf(rect: Rect, others: readonly Rect[], gap = 0): boolean {
  for (const o of others) if (rectsOverlap(rect, o, -gap + 0.002)) return false;
  return true;
}

/**
 * Where a thing put just so stands on a board: its footprint's middle on the point the line of sight came down to
 * (px, pz), kept on the board (as far as it may stand out: none of it off the back and the ends of a board in a
 * cupboard — a twentieth over the edges as Nomad Drive lets it), on squares of 5 cm from the board's back left corner
 * when `grid`. Its origin, the board's frame.
 */
export function aimOn(board: Board, box: Box3, r: number, lie: Lie | undefined, px: number, pz: number, grid: boolean): { x: number; z: number } {
  const at0 = standing(box, { x: 0, z: 0, r, lie });
  const { ex, ez } = extent(at0.rect);
  // (its footprint's middle off its origin)
  const mx = at0.rect.x;
  const mz = at0.rect.z;
  let cx = px;
  let cz = pz;
  if (grid) {
    cx = board.x[0] + ex + Math.round((cx - ex - board.x[0]) / CELL) * CELL;
    cz = board.z[0] + ez + Math.round((cz - ez - board.z[0]) / CELL) * CELL;
  }
  const ox = FIT.overhang * 2 * ex;
  const oz = FIT.overhang * 2 * ez;
  cx = keep(cx, board.x[0] + ex - ox, board.x[1] - ex + ox);
  cz = keep(cz, board.z[0] + ez - oz, board.z[1] - ez + oz);
  return { x: cx - mx, z: cz - mz };
}

/** v kept within [lo, hi] (the middle of the two when they cross: a thing wider than the board stands in its middle) */
function keep(v: number, lo: number, hi: number): number {
  if (lo > hi) return (lo + hi) / 2;
  return v < lo ? lo : v > hi ? hi : v;
}

/** a way a thing may stand: its turn, laid on its side or not */
export interface Way {
  readonly r: number;
  readonly lie?: Lie;
}

/** standing as it is, and turned a quarter (how one puts a thing into a box) */
export const UPRIGHT: readonly Way[] = [{ r: 0 }, { r: Math.PI / 2 }];
/** … and laid on its side either way, when it stands nowhere (what came in without a place: its list, an old save) */
export const ANY_WAY: readonly Way[] = [...UPRIGHT, { r: 0, lie: 'z' }, { r: Math.PI / 2, lie: 'z' }, { r: 0, lie: 'x' }, { r: Math.PI / 2, lie: 'x' }];

/** a thing standing on a board already: its footprint, and how high its top is over the board's floor */
export interface Placed {
  readonly b: number;
  readonly rect: Rect;
  readonly top: number;
}

/** a thing standing at its place, as the others are measured against it */
export function placedOf(box: Box3, s: Spot): Placed {
  const st = standing(box, s);
  return { b: s.b, rect: st.rect, top: (s.up ?? 0) + st.h };
}

/**
 * The first place on the boards (in their order; `boards` the indices of those it may go on) where a thing stands, in
 * one of its ways, clear of what stands there by a finger's width: on each board from its back to its front, along it
 * from its −z end — as far back and as far along as it goes beside what is there (the corners the board's edges and
 * the others' make). null: it stands nowhere.
 */
export function firstFit(all: readonly Board[], boards: readonly number[], box: Box3, placed: readonly Placed[], ways: readonly Way[]): Spot | null {
  for (const bi of boards) {
    const board = all[bi];
    const here = placed.filter((p) => p.b === bi).map((p) => p.rect);
    for (const w of ways) {
      const at0 = standing(box, { x: 0, z: 0, r: w.r, lie: w.lie });
      // (too tall for the board this way, or too big for any board: nowhere on it)
      if (at0.h > board.clear + FIT.slack || 2 * Math.max(at0.rect.hx, at0.rect.hz) > FIT.base + FIT.slack) continue;
      const { ex, ez } = extent(at0.rect);
      // where its footprint's middle may go: against the board's back or a thing's front, against its −z end or a
      // thing's +z side — a thing deeper or longer than the board (by no more than may stand out over its edges) in
      // the board's middle that way
      const lox = board.x[0] + ex;
      const loz = board.z[0] + ez;
      const hix = Math.max(board.x[1] - ex, (lox + board.x[1] - ex) / 2);
      const hiz = Math.max(board.z[1] - ez, (loz + board.z[1] - ez) / 2);
      const xs = [Math.min(lox, hix)];
      const zs = [Math.min(loz, hiz)];
      for (const o of here) {
        const e = extent(o);
        xs.push(o.x + e.ex + GAP + ex);
        zs.push(o.z + e.ez + GAP + ez);
      }
      xs.sort((a, c) => a - c);
      zs.sort((a, c) => a - c);
      for (const cx of xs) {
        for (const cz of zs) {
          const rect = { ...at0.rect, x: cx, z: cz };
          if (cx > hix + 1e-9 || cz > hiz + 1e-9) continue;
          if (fitWhy(board, { rect, h: at0.h, lift: at0.lift }) !== '') continue;
          if (!clearOf(rect, here, GAP)) continue;
          return { b: bi, x: cx - at0.rect.x, z: cz - at0.rect.z, r: w.r, ...(w.lie ? { lie: w.lie } : {}) };
        }
      }
    }
  }
  return null;
}

/** how high the things under a footprint (its middle, how far it reaches) come: the top of the highest of them over the board's floor */
function heapUnder(cx: number, cz: number, ex: number, ez: number, here: readonly Placed[]): number {
  let up = 0;
  for (const p of here) {
    if (p.top <= up) continue;
    const e = extent(p.rect);
    if (Math.abs(p.rect.x - cx) < e.ex + ex - 0.002 && Math.abs(p.rect.z - cz) < e.ez + ez - 0.002) up = p.top;
  }
  return up;
}

/**
 * Where a thing goes on top of others when no board has a place clear for it (a container fuller than its floor:
 * things put in by the list, an old save's): where it lies lowest, its top still under what the board is clear, in any
 * of its ways — looked for over each board every 2 cm, from its back left corner, so a heap grows over what is there
 * before it grows up. null: nowhere is low enough. (What lies on others is measured by their boxes as they stand
 * square to the board: a thing turned askew a little larger than it is.)
 */
function onTop(all: readonly Board[], box: Box3, placed: readonly Placed[]): Spot | null {
  let best: Spot | null = null;
  let bestUp = Infinity;
  const step = 0.02;
  for (let bi = 0; bi < all.length; bi++) {
    const board = all[bi];
    const here = placed.filter((p) => p.b === bi);
    for (const w of ANY_WAY) {
      const at0 = standing(box, { x: 0, z: 0, r: w.r, lie: w.lie });
      if (2 * Math.max(at0.rect.hx, at0.rect.hz) > FIT.base + FIT.slack || at0.h > board.clear + FIT.slack) continue;
      const { ex, ez } = extent(at0.rect);
      const nx = Math.max(0, Math.floor((board.x[1] - board.x[0] - 2 * ex) / step + 1e-9));
      const nz = Math.max(0, Math.floor((board.z[1] - board.z[0] - 2 * ez) / step + 1e-9));
      for (let i = 0; i <= nx; i++) {
        const cx = keep(board.x[0] + ex + i * step, board.x[0] + ex, board.x[1] - ex);
        for (let j = 0; j <= nz; j++) {
          const cz = keep(board.z[0] + ez + j * step, board.z[0] + ez, board.z[1] - ez);
          const up = heapUnder(cx, cz, ex, ez, here);
          if (up + at0.h > board.clear + FIT.slack || up >= bestUp - 1e-6) continue;
          bestUp = up;
          best = { b: bi, x: cx - at0.rect.x, z: cz - at0.rect.z, r: w.r, ...(w.lie ? { lie: w.lie } : {}), ...(up > 0 ? { up } : {}) };
        }
      }
    }
  }
  return best;
}

/**
 * Places for several things at once (what came into a container without one: an old save's, its list's, what a chest
 * was found with), beside what stands there already: the biggest first, each in the first place it fits (firstFit) in
 * any of its ways; one that fits nowhere lies on top of others (the lowest heap it goes on), and one too big even for
 * that in the middle of the first board it is not too tall for, on what is there: it has to be somewhere. In the order
 * of the things.
 */
export function layOut(all: readonly Board[], boxes: readonly Box3[], placed: readonly Placed[]): Spot[] {
  const out: Spot[] = new Array(boxes.length);
  const now = [...placed];
  const size = (b: Box3): number => (b.maxX - b.minX) * (b.maxZ - b.minZ) * (b.maxY - b.minY);
  const order = boxes.map((_, i) => i).sort((a, c) => size(boxes[c]) - size(boxes[a]) || a - c);
  const every = all.map((_, i) => i);
  for (const i of order) {
    const box = boxes[i];
    let s = firstFit(all, every, box, now, ANY_WAY) ?? onTop(all, box, now);
    if (!s) {
      const bi = Math.max(0, all.findIndex((b) => box.maxY - box.minY <= b.clear + FIT.slack));
      const board = all[bi];
      const at0 = standing(box, { x: 0, z: 0, r: 0 });
      const cx = (board.x[0] + board.x[1]) / 2;
      const cz = (board.z[0] + board.z[1]) / 2;
      const { ex, ez } = extent(at0.rect);
      const up = heapUnder(cx, cz, ex, ez, now.filter((p) => p.b === bi));
      s = { b: bi, x: cx - at0.rect.x, z: cz - at0.rect.z, r: 0, ...(up > 0 ? { up } : {}) };
    }
    out[i] = s;
    now.push(placedOf(box, s));
  }
  return out;
}

/**
 * The heaps come down after something has been taken from under them: each thing lying on top of others (the lowest
 * first) rests on the highest of what is still under it, or on the board. The places, the same ones where nothing moved.
 */
export function settle(boxes: readonly Box3[], spots: readonly Spot[]): Spot[] {
  const out = spots.slice();
  const order = spots.map((_, i) => i).sort((a, c) => (spots[a].up ?? 0) - (spots[c].up ?? 0) || a - c);
  const done: Placed[] = [];
  for (const i of order) {
    const s = out[i];
    if (s.up) {
      const rect = standing(boxes[i], s).rect;
      const { ex, ez } = extent(rect);
      // (on what is under it and no higher than it lay: a heap only comes down)
      const up = heapUnder(rect.x, rect.z, ex, ez, done.filter((p) => p.b === s.b && p.top <= s.up! + 1e-6));
      if (Math.abs(up - s.up) > 1e-6) {
        const { up: _, ...rest } = s;
        out[i] = up > 0 ? { ...rest, up } : rest;
      }
    }
    done.push(placedOf(boxes[i], out[i]));
  }
  return out;
}

// ------------------------------------------------------------------ as a container keeps them

/**
 * A place as a container keeps it (ItemState.spots): board, x, z, turn; then 1 laid about its z, 2 about its x (0
 * standing), and how far up it lies on others — to the millimetre and the thousandth of a radian
 */
export type SpotSaved = number[];

const r3 = (v: number): number => Math.round(v * 1000) / 1000;

export function spotSaved(s: Spot): SpotSaved {
  const a = [s.b, r3(s.x), r3(s.z), r3(s.r)];
  if (s.lie || s.up) a.push(s.lie === 'z' ? 1 : s.lie === 'x' ? 2 : 0);
  if (s.up) a.push(r3(s.up));
  return a;
}

/** a place read back (a save's): null when it is not one of the boards' (a container's kind that has fewer boards now, a number that is none) */
export function spotOf(a: unknown, boards: number): Spot | null {
  if (!Array.isArray(a) || a.length < 4) return null;
  const [b, x, z, r, lie, up] = a as unknown[];
  if (typeof b !== 'number' || !Number.isInteger(b) || b < 0 || b >= boards) return null;
  if (typeof x !== 'number' || typeof z !== 'number' || typeof r !== 'number' || !Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(r)) return null;
  const s: Spot = { b, x, z, r };
  if (lie === 1) s.lie = 'z';
  else if (lie === 2) s.lie = 'x';
  if (typeof up === 'number' && Number.isFinite(up) && up > 0) s.up = Math.min(up, 2);
  return s;
}
