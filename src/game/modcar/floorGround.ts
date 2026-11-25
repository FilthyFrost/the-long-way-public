/**
 * The wheels' ground with the places' floors on it (docs/MODCAR.md §20): a building stands on a level plinth a
 * hand above the land (core/world/sites.ts), and a vehicle in it — a wreck on a workshop's lift, a car driven in
 * through the gate — rolls on that floor, not on the land under it (the plinth's box would hold it out, and threw
 * a wreck laid on it out of the door). Where a wheel is over a floor whose top stands no more than a kerb above
 * the land, the floor is its ground; a higher one (a porch, a jetty's deck over the water) is a wall to it still.
 * The floors near are kept by the cell, asked for again now and then (the places come and go as one drives).
 */
import { Surface, type Ground, type GroundSample } from '../../core/world/ground';
import type { Solid, SolidSource } from '../../core/world/solids';

/** how far above the land a floor's top may stand and still be driven onto (m): a kerb's height */
export const FLOOR_STEP = 0.35;
/** the side of a cell the floors are kept by (m), and how long they are kept (s) */
const CELL = 8;
const KEEP_S = 1;

export class FloorGround implements Ground {
  private readonly cells = new Map<string, { at: number; floors: Solid[] }>();
  private readonly near: Solid[] = [];

  constructor(
    private readonly land: Ground,
    private readonly solids: SolidSource,
    /** the game's clock (s) */
    private readonly now: () => number,
  ) {}

  sample(x: number, z: number, out: GroundSample): void {
    this.land.sample(x, z, out);
    const floors = this.floorsAt(x, z);
    if (!floors.length) return;
    let top = -Infinity;
    for (const s of floors) {
      if (s.y1 <= out.h || s.y1 - out.h > FLOOR_STEP || s.y1 <= top || !over(s, x, z)) continue;
      top = s.y1;
    }
    if (top === -Infinity) return;
    // a floor is level, and concrete
    out.h = top;
    out.nx = 0;
    out.ny = 1;
    out.nz = 0;
    out.surface = Surface.Asphalt;
    out.mu = 1;
    out.rr = 0.014;
  }

  /**
   * The top of the highest floor over (x, z) that is not above `fromY` (−∞: none): what a thing let fall from that
   * height comes to rest on (loose.ts: a fish swung onto a jetty's deck, docs/V3/plan/fishing.md) — a porch, a
   * jetty's deck over the water, however high above the land under it it stands.
   */
  floorTop(x: number, z: number, fromY: number): number {
    const floors = this.floorsAt(x, z);
    let top = -Infinity;
    for (const s of floors) if (s.y1 <= fromY + 0.05 && s.y1 > top && over(s, x, z)) top = s.y1;
    return top;
  }

  /** the floors in the cell (x, z) is in (asked for again after KEEP_S) */
  private floorsAt(x: number, z: number): Solid[] {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    const key = `${cx},${cz}`;
    const t = this.now();
    const c = this.cells.get(key);
    if (c && t - c.at < KEEP_S && t >= c.at) return c.floors;
    if (this.cells.size > 64) for (const [k, v] of this.cells) if (t - v.at > KEEP_S * 4 || t < v.at) this.cells.delete(k);
    const n = this.near;
    n.length = 0;
    this.solids.solidsNear((cx + 0.5) * CELL, (cz + 0.5) * CELL, CELL * 0.75, n);
    const floors = n.filter((s) => s.floor);
    this.cells.set(key, { at: t, floors });
    return floors;
  }
}

/** is (x, z) over the solid's plan (a box along its heading, or a round post) */
function over(s: Solid, x: number, z: number): boolean {
  const dx = x - s.x;
  const dz = z - s.z;
  if (s.hz === 0) return dx * dx + dz * dz <= s.hx * s.hx;
  const c = Math.cos(s.yaw);
  const sn = Math.sin(s.yaw);
  const u = dx * c + dz * sn;
  const v = -dx * sn + dz * c;
  return Math.abs(u) <= s.hx && Math.abs(v) <= s.hz;
}
