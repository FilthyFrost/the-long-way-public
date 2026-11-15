/**
 * The on-foot test bed: a small yard beside the road with one of everything the player base has to
 * handle — a wall, a step and a platform, a crate and a toolbox, a fuel tank, and loose things of
 * every size. The game shows it with ?fixture=1 (src/game/player/fixtures.ts); the tests and the
 * measurements walk about in the very same layout.
 *
 * Layout in the yard's own frame: u along the road (forward), v across it to the right; the yard's
 * origin sits YARD_OFFSET metres right of the centre line (negative: left), YARD_AHEAD metres ahead.
 */
import type { Land } from './land';
import { TerrainPoint } from './land';
import { StaticSolids } from './statics';
import type { Solid } from '../world/solids';
import { Containers, type Container } from '../items/containers';
import { FuelSources, fuelFor } from '../items/fuel';
import { LooseItems } from '../items/loose';

export interface YardFrame {
  /** origin (world) and the road's heading there */
  x: number;
  z: number;
  heading: number;
}

/** what a yard piece is, for the view */
export type PieceKind = 'wall' | 'step' | 'platform' | 'crate' | 'toolbox' | 'tank' | 'post';

export interface Piece {
  kind: PieceKind;
  /** yard frame (m) and yaw relative to the yard */
  u: number;
  v: number;
  yaw: number;
  /** half extents along / across, height (round: hz = 0, hx = radius) */
  hx: number;
  hz: number;
  h: number;
  floor: boolean;
}

export const YARD_PIECES: readonly Piece[] = [
  { kind: 'wall', u: 9.0, v: 4.2, yaw: Math.PI / 2, hx: 1.6, hz: 0.14, h: 2.1, floor: false },
  { kind: 'wall', u: 7.5, v: 5.7, yaw: 0, hx: 1.4, hz: 0.14, h: 2.1, floor: false },
  { kind: 'step', u: 4.2, v: 5.2, yaw: 0, hx: 0.9, hz: 0.6, h: 0.24, floor: true },
  { kind: 'platform', u: 4.2, v: 6.6, yaw: 0, hx: 1.1, hz: 0.8, h: 0.48, floor: true },
  { kind: 'crate', u: 2.4, v: 2.6, yaw: 0.25, hx: 0.45, hz: 0.32, h: 0.62, floor: false },
  { kind: 'toolbox', u: 0.6, v: 3.6, yaw: -0.4, hx: 0.3, hz: 0.16, h: 0.3, floor: false },
  { kind: 'tank', u: 6.0, v: 1.8, yaw: 0, hx: 0.55, hz: 0, h: 1.25, floor: false },
  { kind: 'post', u: 1.2, v: 6.4, yaw: 0, hx: 0.09, hz: 0, h: 1.1, floor: false },
];

/** loose things lying in the yard: item id, count, yard position, yaw */
export const YARD_LOOSE: readonly { id: string; n: number; u: number; v: number; yaw: number; fill?: number }[] = [
  { id: 'food.can.beans', n: 2, u: 1.4, v: 2.0, yaw: 0.3 },
  { id: 'drink.water', n: 1, u: 1.7, v: 2.3, yaw: 1.2 },
  { id: 'tool.siphon', n: 1, u: 3.3, v: 1.6, yaw: 0.6 },
  { id: 'mat.rope', n: 1, u: 0.9, v: 4.6, yaw: 2.1 },
  { id: 'food.porcini', n: 3, u: 2.6, v: 5.0, yaw: 0.4 },
  { id: 'fuel.jerrycan', n: 1, u: 4.8, v: 2.6, yaw: 1.0, fill: 0 },
  { id: 'part.battery.1', n: 1, u: 3.4, v: 3.8, yaw: -0.5 },
  { id: 'tyre.road', n: 1, u: 6.4, v: 3.6, yaw: 0.2 },
  { id: 'fuel.drum', n: 1, u: 7.2, v: 1.6, yaw: 0 },
];

/**
 * The yard lies on the road itself, just ahead of the parked vehicle: its edge on the left edge of
 * the asphalt, reaching across to the right shoulder (flat, clear of the tall verge grass).
 */
export const YARD_OFFSET = -3.4;
export const YARD_AHEAD = 4;

/** world point of a yard point */
export function yardToWorld(f: YardFrame, u: number, v: number, out: { x: number; z: number } = { x: 0, z: 0 }): { x: number; z: number } {
  const c = Math.cos(f.heading);
  const s = Math.sin(f.heading);
  out.x = f.x + u * c - v * s;
  out.z = f.z + u * s + v * c;
  return out;
}

/** the lowest ground under a piece's footprint (it is set into the land, never floating) */
function groundUnder(land: Land, f: YardFrame, p: Piece, tp: TerrainPoint): { lo: number; mid: number } {
  const w = { x: 0, z: 0 };
  let lo = Infinity;
  let sum = 0;
  let n = 0;
  const hz = p.hz === 0 ? p.hx : p.hz;
  for (const [a, b] of [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const c = Math.cos(p.yaw);
    const s = Math.sin(p.yaw);
    const du = a * p.hx * c - b * hz * s;
    const dv = a * p.hx * s + b * hz * c;
    yardToWorld(f, p.u + du, p.v + dv, w);
    land.shape(w.x, w.z, tp);
    lo = Math.min(lo, tp.h);
    sum += tp.h;
    n++;
  }
  return { lo, mid: sum / n };
}

export interface PlacedPiece extends Piece {
  /** its solid (a container's own, for the crate and the toolbox) */
  solid: Solid;
  /** the container it is, if it is one */
  container: Container | null;
  /** world: centre, yaw, bottom and top */
  x: number;
  z: number;
  wyaw: number;
  y0: number;
  y1: number;
}

export interface Yard {
  solids: StaticSolids;
  pieces: PlacedPiece[];
}

/** the yard's seed for its containers' rolls */
export const YARD_SEED = 4242;

/**
 * The whole yard set on the land: its solids, and — given the world's registries — its crate and
 * toolbox as containers, its fuel tank as a fuel source, its loose things lying about. This is also
 * the worked example of how a roadside site registers what it holds.
 */
export function buildYard(land: Land, f: YardFrame, reg?: { containers: Containers; loose: LooseItems; fuel: FuelSources }): Yard {
  const solids = new StaticSolids();
  const tp = new TerrainPoint();
  const pieces: PlacedPiece[] = [];
  const w = { x: 0, z: 0 };
  let n = 0;
  for (const p of YARD_PIECES) {
    const g = groundUnder(land, f, p, tp);
    yardToWorld(f, p.u, p.v, w);
    const wyaw = f.heading + p.yaw;
    const base = p.floor ? g.mid : g.lo;
    const y0 = g.lo - 0.15;
    const y1 = base + p.h;
    let container: Container | null = null;
    let solid: Solid;
    if (reg && (p.kind === 'crate' || p.kind === 'toolbox')) {
      container = reg.containers.add({ id: `yard:${p.kind}`, kind: p.kind, x: w.x, y: base, z: w.z, heading: wyaw, seed: YARD_SEED + n++, hx: p.hx, h: p.h, hz: p.hz, shelf: p.h - (p.kind === 'crate' ? 0.1 : 0.06) });
      solid = container.solid;
    } else solid = p.hz === 0 ? solids.post(w.x, w.z, p.hx, y0, y1, `yard.${p.kind}`) : solids.box(w.x, w.z, p.hx, p.hz, wyaw, y0, y1, p.floor, `yard.${p.kind}`);
    if (reg && p.kind === 'tank') {
      // the tap is on its side facing back along the road, towards the vehicle
      const tap = yardToWorld(f, p.u - p.hx - 0.08, p.v);
      reg.fuel.add('yard:tank', 'tank', tap.x, base + 0.4, tap.z, fuelFor('tank', YARD_SEED));
    }
    pieces.push({ ...p, solid, container, x: w.x, z: w.z, wyaw, y0, y1 });
  }
  if (reg) {
    for (const [i, l] of YARD_LOOSE.entries()) {
      yardToWorld(f, l.u, l.v, w);
      land.shape(w.x, w.z, tp);
      reg.loose.add(l.id, l.n, w.x, tp.h, w.z, f.heading + l.yaw, 'yard', l.fill ?? 0, `yard:${i}`);
    }
  }
  return { solids, pieces };
}

/** the yard's solids alone, set on the land (crate and toolbox as plain boxes) */
export function buildYardSolids(land: Land, f: YardFrame, solids = new StaticSolids()): { solids: StaticSolids; pieces: PlacedPiece[] } {
  const tp = new TerrainPoint();
  const pieces: PlacedPiece[] = [];
  const w = { x: 0, z: 0 };
  for (const p of YARD_PIECES) {
    const g = groundUnder(land, f, p, tp);
    yardToWorld(f, p.u, p.v, w);
    const wyaw = f.heading + p.yaw;
    // floors stand on the middle of their ground so their top is a true step from it
    const base = p.floor ? g.mid : g.lo;
    const y0 = g.lo - 0.15;
    const y1 = base + p.h;
    const solid = p.hz === 0 ? solids.post(w.x, w.z, p.hx, y0, y1, `yard.${p.kind}`) : solids.box(w.x, w.z, p.hx, p.hz, wyaw, y0, y1, p.floor, `yard.${p.kind}`);
    pieces.push({ ...p, solid, container: null, x: w.x, z: w.z, wyaw, y0, y1 });
  }
  return { solids, pieces };
}
