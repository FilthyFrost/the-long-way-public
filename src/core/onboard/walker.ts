/**
 * Walking about inside a vehicle (docs/DESIGN_V2.md §5.7, specs/vehicles/rv_model.md §4): a point
 * and a heading in the body frame, kept inside the union of the vehicle's walk rectangles. Against
 * an edge the step slides along it instead of stopping. The vehicle carries the walker rigidly:
 * everything here is in the body frame (+x forward, +y up, +z right, origin at the centre of gravity).
 */

/** a rectangle one can stand in, and the height of its floor (body frame) */
export interface WalkRect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** body-frame y of the floor */
  floor: number;
  /** what it is: 'aisle' (held to the aisle width), 'door', 'passage' (between the cab seats), … */
  name?: string;
}

export interface WalkArea {
  /** clear height above every floor (m) */
  headroom: number;
  areas: WalkRect[];
}

export const WALK_SPEED = 1.9;
/** eye above the floor when standing (m) */
export const EYE_HEIGHT = 1.5;

const EPS = 1e-9;

export function insideRect(r: WalkRect, x: number, z: number): boolean {
  return x >= r.x0 - EPS && x <= r.x1 + EPS && z >= r.z0 - EPS && z <= r.z1 + EPS;
}

export class Walker {
  x = 0;
  z = 0;
  /** heading: 0 = forward (+x), + = to the right */
  yaw = 0;
  /**
   * Walked straight at a wall with a way on a little to one side of it (the aisle beside a cupboard): eased
   * sideways into the way, as one steps round a corner, instead of standing pressed to the wall. Off: as before.
   */
  funnel = false;

  constructor(readonly area: WalkArea) {
    const r = area.areas[0];
    this.x = (r.x0 + r.x1) / 2;
    this.z = (r.z0 + r.z1) / 2;
  }

  inside(x: number, z: number): boolean {
    for (const r of this.area.areas) if (insideRect(r, x, z)) return true;
    return false;
  }

  /** floor height under a point: the highest floor of the rectangles holding it (NaN = outside) */
  floorAt(x: number, z: number): number {
    let f = -Infinity;
    for (const r of this.area.areas) if (insideRect(r, x, z) && r.floor > f) f = r.floor;
    return f === -Infinity ? NaN : f;
  }

  /** the walkable point nearest to (x, z) */
  nearest(x: number, z: number, out: { x: number; z: number; d: number } = { x: 0, z: 0, d: 0 }): { x: number; z: number; d: number } {
    let best = Infinity;
    for (const r of this.area.areas) {
      const cx = Math.min(r.x1, Math.max(r.x0, x));
      const cz = Math.min(r.z1, Math.max(r.z0, z));
      const d = Math.hypot(cx - x, cz - z);
      if (d < best) {
        best = d;
        out.x = cx;
        out.z = cz;
      }
    }
    out.d = best;
    return out;
  }

  /** stand at the walkable point nearest to (x, z), facing `yaw` */
  place(x: number, z: number, yaw = this.yaw): void {
    const p = this.nearest(x, z);
    this.x = p.x;
    this.z = p.z;
    this.yaw = yaw;
  }

  /**
   * Move for dt seconds. `forward` and `right` are the stick (−1…1 each, the pair is limited to
   * length 1), relative to the heading. Returns the distance actually covered.
   */
  step(dt: number, forward: number, right: number): number {
    let f = forward;
    let r = right;
    const len = Math.hypot(f, r);
    if (len < 1e-6 || dt <= 0) return 0;
    if (len > 1) {
      f /= len;
      r /= len;
    }
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    const dx = (f * c - r * s) * WALK_SPEED * dt;
    const dz = (f * s + r * c) * WALK_SPEED * dt;
    const nx = this.x + dx;
    const nz = this.z + dz;
    let bx = this.x;
    let bz = this.z;
    if (this.inside(nx, nz)) {
      bx = nx;
      bz = nz;
    } else {
      // slide: the wanted point pulled back into each rectangle that holds us now; the closest wins.
      // A rectangle is convex and holds the start, so the pulled-back step is never longer than the wanted one.
      let best = Infinity;
      for (const rc of this.area.areas) {
        if (!insideRect(rc, this.x, this.z)) continue;
        const cx = Math.min(rc.x1, Math.max(rc.x0, nx));
        const cz = Math.min(rc.z1, Math.max(rc.z0, nz));
        const d = (cx - nx) ** 2 + (cz - nz) ** 2;
        if (d < best) {
          best = d;
          bx = cx;
          bz = cz;
        }
      }
    }
    const want = Math.hypot(dx, dz);
    if (this.funnel && Math.hypot(bx - this.x, bz - this.z) < want * 0.35) {
      // the way one walks and across it; the nearest offset across (up to 0.7 m) with floor beside one and on ahead of it
      const ux = dx / want;
      const uz = dz / want;
      const px = -uz;
      const pz = ux;
      let best = 0;
      for (let k = 1; k <= 7 && !best; k++) {
        for (const side of [1, -1]) {
          const o = side * k * 0.1;
          if (this.inside(this.x + px * o, this.z + pz * o) && this.inside(this.x + px * o + ux * 0.25, this.z + pz * o + uz * 0.25)) {
            best = o;
            break;
          }
        }
      }
      if (best) {
        const m = Math.sign(best) * Math.min(Math.abs(best), want * 0.9);
        const sx = this.x + px * m;
        const sz = this.z + pz * m;
        if (this.inside(sx, sz)) {
          bx = sx;
          bz = sz;
        }
      }
    }
    const moved = Math.hypot(bx - this.x, bz - this.z);
    this.x = bx;
    this.z = bz;
    return moved;
  }

  /** the eye point (body frame) */
  eye(out: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }): { x: number; y: number; z: number } {
    out.x = this.x;
    out.y = this.floorAt(this.x, this.z) + EYE_HEIGHT;
    out.z = this.z;
    return out;
  }
}

/** the narrowest gap one has to pass to get from a to b (0 = they do not touch) */
export function passageWidth(a: WalkRect, b: WalkRect): number {
  const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
  if (ox < -EPS || oz < -EPS) return 0;
  // touching along an edge: the edge they share; overlapping: the wider way through the shared patch
  return Math.max(0, Math.max(ox, oz));
}

/** shoulders need about this much to pass from one rectangle into the next */
export const MIN_PASSAGE = 0.3;

export function rectsTouch(a: WalkRect, b: WalkRect): boolean {
  return passageWidth(a, b) >= MIN_PASSAGE;
}

/** true when every rectangle can be reached from the first one */
export function connected(area: WalkArea): boolean {
  const n = area.areas.length;
  if (n === 0) return false;
  const seen = new Set<number>([0]);
  const todo = [0];
  while (todo.length) {
    const i = todo.pop()!;
    for (let j = 0; j < n; j++) {
      if (!seen.has(j) && rectsTouch(area.areas[i], area.areas[j])) {
        seen.add(j);
        todo.push(j);
      }
    }
  }
  return seen.size === n;
}
