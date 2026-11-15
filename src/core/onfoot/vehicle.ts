/**
 * A vehicle as seen by someone on foot: a solid one cannot walk through (its body box from the
 * spec), its doors, and where one stands after getting out.
 *
 * Body frame (vehicle sim): +x forward, +y up, +z right, origin at the centre of gravity.
 */
import type { VehicleSpec } from '../vehicle/spec';
import { Solid, solidWithin, type SolidSource } from '../world/solids';
import { FOOT, type FootWalker } from './walker';

/** what is needed of a vehicle's pose: position of the centre of gravity and the body axes */
export interface VehiclePose {
  readonly spec: VehicleSpec;
  readonly px: number;
  readonly py: number;
  readonly pz: number;
  /** body axes as columns: [fx fy fz, ux uy uz, rx ry rz] */
  basis(out: Float64Array | number[]): void;
}

/** world point of a body-frame point */
export function bodyToWorld(v: VehiclePose, b: Float64Array, x: number, y: number, z: number, out: { x: number; y: number; z: number }): typeof out {
  v.basis(b);
  out.x = v.px + b[0] * x + b[3] * y + b[6] * z;
  out.y = v.py + b[1] * x + b[4] * y + b[7] * z;
  out.z = v.pz + b[2] * x + b[5] * y + b[8] * z;
  return out;
}

/** body-frame point of a world point */
export function worldToBody(v: VehiclePose, b: Float64Array, x: number, y: number, z: number, out: { x: number; y: number; z: number }): typeof out {
  v.basis(b);
  const dx = x - v.px;
  const dy = y - v.py;
  const dz = z - v.pz;
  out.x = b[0] * dx + b[1] * dy + b[2] * dz;
  out.y = b[3] * dx + b[4] * dy + b[5] * dz;
  out.z = b[6] * dx + b[7] * dy + b[8] * dz;
  return out;
}

/** the plan heading of the vehicle's nose (solids' convention: facing (cos h, sin h)) */
export function vehicleHeading(v: VehiclePose, b: Float64Array): number {
  v.basis(b);
  return Math.atan2(b[2], b[0]);
}

/** the body as one upright box, kept up to date with the pose whenever it is asked for */
export class VehicleSolid implements SolidSource {
  readonly solid = new Solid();
  private readonly b = new Float64Array(9);
  private readonly p = { x: 0, y: 0, z: 0 };

  constructor(readonly vehicle: VehiclePose) {}

  update(): Solid {
    const v = this.vehicle;
    const bd = v.spec.body;
    const c = bodyToWorld(v, this.b, bd.centerX, 0, 0, this.p);
    const h = vehicleHeading(v, this.b);
    return this.solid.set(c.x, c.z, bd.halfLength, bd.halfWidth, h, v.py + bd.bottom, v.py + bd.top, false, v.spec.id);
  }

  solidsNear(x: number, z: number, r: number, out: Solid[]): void {
    const s = this.update();
    if (solidWithin(s, x, z, r)) out.push(s);
  }
}

/** a way in and out: where on the body it is, which side, and what it leads to */
export interface Door {
  name: string;
  /** body frame: along the body (x) and the side (−1 left, +1 right) */
  x: number;
  side: -1 | 1;
  /** height of the handle above the centre of gravity (body y) */
  y: number;
  /** 'seat': straight into a seat; 'onboard': onto the floor inside (vehicles one walks about in) */
  leads: 'seat' | 'onboard';
  /** the seat it leads to ('driver', 'passenger', …) or, for 'onboard', the walk-area point (x, z) */
  seat: string;
  inside?: { x: number; z: number };
}

/**
 * The doors of a vehicle from its spec: the driver's door on the driver's side, the passenger's
 * opposite; a vehicle one walks about in gets its walk area's door instead (the rectangle named
 * 'door', reached from the side it is on).
 */
export function doorsOf(spec: VehicleSpec, walk?: { areas: { x0: number; x1: number; z0: number; z1: number; name?: string }[] }): Door[] {
  const e = spec.eye;
  const side: -1 | 1 = e.z > 0 ? 1 : -1;
  const handle = e.y - 0.25;
  const doors: Door[] = [{ name: 'driver', x: e.x, side, y: handle, leads: 'seat', seat: 'driver' }];
  const dr = walk?.areas.find((r) => r.name === 'door');
  if (dr) {
    const cz = (dr.z0 + dr.z1) / 2;
    const ds: -1 | 1 = cz > 0 ? 1 : -1;
    doors.push({ name: 'door', x: (dr.x0 + dr.x1) / 2, side: ds, y: handle, leads: 'onboard', seat: '', inside: { x: (dr.x0 + dr.x1) / 2, z: cz } });
  } else {
    doors.push({ name: 'passenger', x: e.x, side: side === 1 ? -1 : 1, y: handle, leads: 'seat', seat: 'passenger' });
  }
  return doors;
}

/** fastest the vehicle may roll for someone to get out or in (km/h) */
export const EXIT_KMH = 6;

/** how far out from the body's side one stands after getting out (m, beyond the body's half width) */
export const DOOR_CLEAR = FOOT.radius + 0.25;

/**
 * Stand the walker beside a door, on free ground: first right outside it, then a little forward or
 * back along the side, then further out; failing all those, the nearest free spot anywhere around.
 * The walker faces away from the vehicle. Returns false only when no free spot was found at all.
 */
export function placeAtDoor(w: FootWalker, v: VehiclePose, door: Door): boolean {
  const b = new Float64Array(9);
  const p = { x: 0, y: 0, z: 0 };
  const hw = v.spec.body.halfWidth;
  const h = vehicleHeading(v, b);
  const face = h + (door.side > 0 ? Math.PI / 2 : -Math.PI / 2);
  for (const out of [0, 0.5, 1.1]) {
    for (const along of [0, -0.5, 0.5, -1.0, 1.0, -1.6]) {
      bodyToWorld(v, b, door.x + along, 0, door.side * (hw + DOOR_CLEAR + out), p);
      if (!w.freeAt(p.x, p.z)) continue;
      const g = w.landAt(p.x, p.z, Infinity);
      // not into deep water, and not down a drop
      w.place(p.x, p.z, face, 0);
      if (w.depth > FOOT.swimDepth * 0.8 || Math.abs(g - (v.py - v.spec.cgHeight)) > 1.2) continue;
      return true;
    }
  }
  bodyToWorld(v, b, door.x, 0, door.side * (hw + DOOR_CLEAR), p);
  return w.place(p.x, p.z, face, 8);
}

/** the door nearest to a body-frame point (a seat's eye, a point on the walk area) */
export function nearestDoor(doors: readonly Door[], x: number, z: number, v: VehiclePose): Door {
  const hw = v.spec.body.halfWidth;
  let best = doors[0];
  let bd = Infinity;
  for (const d of doors) {
    const dd = Math.hypot(d.x - x, d.side * hw - z);
    if (dd < bd) {
      bd = dd;
      best = d;
    }
  }
  return best;
}
