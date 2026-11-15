/**
 * A plain list of solids that do not move (a site's walls, a crate, a step), with a coarse grid so
 * that asking for the ones nearby stays cheap however many there are.
 */
import { Solid, solidWithin, type SolidSource } from '../world/solids';

const CELL = 16;

export class StaticSolids implements SolidSource {
  readonly all: Solid[] = [];
  private readonly grid = new Map<number, Solid[]>();
  /** the largest plan reach of any solid: how far round a query the grid must look */
  private reach = 0;

  private key(i: number, j: number): number {
    return (i + 32768) * 65536 + (j + 32768);
  }

  add(s: Solid): Solid {
    this.all.push(s);
    const r = s.hz === 0 ? s.hx : Math.hypot(s.hx, s.hz);
    if (r > this.reach) this.reach = r;
    const k = this.key(Math.floor(s.x / CELL), Math.floor(s.z / CELL));
    let l = this.grid.get(k);
    if (!l) this.grid.set(k, (l = []));
    l.push(s);
    return s;
  }

  /** a new box: centre, half extents along and across its heading, heading, bottom and top */
  box(x: number, z: number, hx: number, hz: number, yaw: number, y0: number, y1: number, floor = false, tag = ''): Solid {
    return this.add(new Solid().set(x, z, hx, hz, yaw, y0, y1, floor, tag));
  }

  /** a new round post */
  post(x: number, z: number, radius: number, y0: number, y1: number, tag = ''): Solid {
    return this.add(new Solid().set(x, z, radius, 0, 0, y0, y1, false, tag));
  }

  remove(s: Solid): void {
    const i = this.all.indexOf(s);
    if (i < 0) return;
    this.all.splice(i, 1);
    const l = this.grid.get(this.key(Math.floor(s.x / CELL), Math.floor(s.z / CELL)));
    if (l) l.splice(l.indexOf(s), 1);
  }

  clear(): void {
    this.all.length = 0;
    this.grid.clear();
    this.reach = 0;
  }

  solidsNear(x: number, z: number, r: number, out: Solid[]): void {
    const rr = r + this.reach;
    const i0 = Math.floor((x - rr) / CELL);
    const i1 = Math.floor((x + rr) / CELL);
    const j0 = Math.floor((z - rr) / CELL);
    const j1 = Math.floor((z + rr) / CELL);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const l = this.grid.get(this.key(i, j));
        if (!l) continue;
        for (const s of l) if (solidWithin(s, x, z, r)) out.push(s);
      }
    }
  }
}
