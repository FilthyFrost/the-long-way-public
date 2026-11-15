/**
 * Things that stand on the land and cannot be walked or driven through: walls, crates, wrecks,
 * pump islands, tree trunks. The land itself is the height function (terrain.ts); this is
 * everything put on top of it.
 *
 * A solid is an upright box (or a round post) between two heights. Whoever places things in the
 * world — the roadside sites, the vehicles, the woods — offers them through a `SolidSource`;
 * whoever moves through the world — a walker, a car — asks for the ones nearby and keeps out.
 *
 * Plan directions are the road's: heading `yaw` points along (cos yaw, sin yaw) in (x, z), and a
 * box's `hx` lies along that heading, `hz` across it (to the right: (−sin yaw, cos yaw)).
 */

export class Solid {
  /** centre on the plan (world m) */
  x = 0;
  z = 0;
  /** half extents along and across its heading (m); a round post has hz = 0 and hx = radius */
  hx = 0.5;
  hz = 0.5;
  yaw = 0;
  /** bottom and top (world m) */
  y0 = 0;
  y1 = 1;
  /** its top can be stood on: a floor, a porch, a jetty */
  floor = false;
  /** who put it there (a site id, a vehicle id): for debugging and for telling a wall from a crate */
  tag = '';
  /** which of its owner's things it belongs to (a site: the index of the object), −1 when that means nothing */
  ref = -1;

  set(x: number, z: number, hx: number, hz: number, yaw: number, y0: number, y1: number, floor = false, tag = ''): this {
    this.x = x;
    this.z = z;
    this.hx = hx;
    this.hz = hz;
    this.yaw = yaw;
    this.y0 = y0;
    this.y1 = y1;
    this.floor = floor;
    this.tag = tag;
    return this;
  }

  get round(): boolean {
    return this.hz === 0;
  }
}

export interface SolidSource {
  /** append every solid whose plan comes within r metres of (x, z) */
  solidsNear(x: number, z: number, r: number, out: Solid[]): void;
}

/** several sources asked as one */
export class SolidSet implements SolidSource {
  private readonly sources: SolidSource[] = [];

  add(s: SolidSource): void {
    if (!this.sources.includes(s)) this.sources.push(s);
  }

  remove(s: SolidSource): void {
    const i = this.sources.indexOf(s);
    if (i >= 0) this.sources.splice(i, 1);
  }

  solidsNear(x: number, z: number, r: number, out: Solid[]): void {
    for (const s of this.sources) s.solidsNear(x, z, r, out);
  }
}

/** result of a push-out: where the circle ends up, and the outward direction it was pushed along */
export class Push {
  x = 0;
  z = 0;
  nx = 0;
  nz = 0;
  depth = 0;
}

/**
 * Keep a circle of radius r (a walker's feet, a wheel) out of a solid, on the plan only — the
 * caller decides from y0/y1 whether the solid is in the way at all (or underfoot).
 * @returns true when the circle was inside and has been moved to the nearest free place
 */
export function pushOut(s: Solid, x: number, z: number, r: number, out: Push): boolean {
  const dx = x - s.x;
  const dz = z - s.z;
  if (s.hz === 0) {
    const d2 = dx * dx + dz * dz;
    const R = s.hx + r;
    if (d2 >= R * R) return false;
    const d = Math.sqrt(d2);
    // (standing exactly on the centre: any way out is as good as another)
    out.nx = d > 1e-9 ? dx / d : 1;
    out.nz = d > 1e-9 ? dz / d : 0;
    out.depth = R - d;
    out.x = s.x + out.nx * R;
    out.z = s.z + out.nz * R;
    return true;
  }
  const c = Math.cos(s.yaw);
  const sn = Math.sin(s.yaw);
  // into the box's own axes: u along, v across
  const u = dx * c + dz * sn;
  const v = -dx * sn + dz * c;
  const qu = u < -s.hx ? -s.hx : u > s.hx ? s.hx : u;
  const qv = v < -s.hz ? -s.hz : v > s.hz ? s.hz : v;
  let pu = u - qu;
  let pv = v - qv;
  const d2 = pu * pu + pv * pv;
  let nu: number;
  let nv: number;
  let depth: number;
  if (d2 > 1e-18) {
    // centre outside the box: away from the nearest point of it
    if (d2 >= r * r) return false;
    const d = Math.sqrt(d2);
    nu = pu / d;
    nv = pv / d;
    depth = r - d;
    pu = qu + nu * r;
    pv = qv + nv * r;
  } else {
    // centre inside: out through the nearest face
    const eu = s.hx - (u < 0 ? -u : u);
    const ev = s.hz - (v < 0 ? -v : v);
    if (eu < ev) {
      nu = u < 0 ? -1 : 1;
      nv = 0;
      depth = eu + r;
      pu = nu * (s.hx + r);
      pv = v;
    } else {
      nu = 0;
      nv = v < 0 ? -1 : 1;
      depth = ev + r;
      pu = u;
      pv = nv * (s.hz + r);
    }
  }
  out.x = s.x + pu * c - pv * sn;
  out.z = s.z + pu * sn + pv * c;
  out.nx = nu * c - nv * sn;
  out.nz = nu * sn + nv * c;
  out.depth = depth;
  return true;
}

/** does the plan of a solid come within r of (x, z)? (cheap test for `solidsNear`) */
export function solidWithin(s: Solid, x: number, z: number, r: number): boolean {
  const dx = x - s.x;
  const dz = z - s.z;
  const reach = r + (s.hz === 0 ? s.hx : Math.sqrt(s.hx * s.hx + s.hz * s.hz));
  return dx * dx + dz * dz < reach * reach;
}
