/**
 * One walking about inside a vehicle's living space (docs/V3/nodes/M2-rv.md): the walk in the vehicle's own frame
 * (core/onboard/walker.ts, inside the rectangles of core/modcar/aboard.ts), carried with the vehicle wherever it
 * goes, the world walker's feet put where that is every frame so that everything that asks where one is — the
 * mark, the view, the weather — finds one inside. Only a vehicle standing still is boarded.
 */
import * as THREE from 'three';
import { aboardOf, type Aboardable, type BoardDoor } from '../../core/modcar/aboard';
import { Walker } from '../../core/onboard/walker';
import type { ModVehicle } from './vehicle';

type P3 = { x: number; y: number; z: number };

export class Aboard {
  readonly w: Walker;
  readonly def: Aboardable;
  private readonly b = new Float64Array(9);
  private readonly p = new THREE.Vector3();

  constructor(
    readonly v: ModVehicle,
    at: readonly [number, number],
    yaw: number,
  ) {
    const def = aboardOf(v.view.frame.id);
    if (!def) throw new Error(`no living space in a ${v.view.frame.id}`);
    this.def = def;
    this.w = new Walker(def);
    this.w.place(at[0], at[1], yaw);
  }

  /** the vehicle's heading on the plan (rad, as a walker's on foot: forward (cos h, sin h) in x, z) */
  heading(): number {
    this.v.sim.basis(this.b);
    return Math.atan2(this.b[2], this.b[0]);
  }

  /** the stick for dt seconds, the view's heading `lookYaw` (on the plan, as on foot) turned into the vehicle's frame */
  step(dt: number, forward: number, right: number, lookYaw: number): void {
    this.w.yaw = lookYaw - this.heading();
    this.w.step(dt, forward, right);
  }

  /** a point of the frame's model space in the world (the render origin added back) */
  toWorld(x: number, y: number, z: number, origin: P3, out: P3): P3 {
    const m = this.v.view.model;
    m.updateMatrixWorld();
    this.p.set(x, y, z).applyMatrix4(m.matrixWorld);
    out.x = this.p.x + origin.x;
    out.y = this.p.y + origin.y;
    out.z = this.p.z + origin.z;
    return out;
  }

  /** where one's feet are in the world */
  feet(origin: P3, out: P3): P3 {
    return this.toWorld(this.w.x, this.w.floorAt(this.w.x, this.w.z), this.w.z, origin, out);
  }
}

const inv = new THREE.Matrix4();
const ray = new THREE.Ray();
const box = new THREE.Box3();
const hit = new THREE.Vector3();

/**
 * The doorway of a vehicle one can walk into that a ray (render space) goes through within `reach` of its start:
 * its door and how far (null: none). The doorway's box is in the frame's model space: the ray is brought into it.
 */
export function doorwayHit(v: ModVehicle, r: THREE.Ray, reach: number): { door: BoardDoor; dist: number } | null {
  const def = aboardOf(v.view.frame.id);
  if (!def) return null;
  const m = v.view.model;
  m.updateMatrixWorld();
  inv.copy(m.matrixWorld).invert();
  ray.copy(r).applyMatrix4(inv);
  let best: { door: BoardDoor; dist: number } | null = null;
  for (const door of def.doors) {
    const b = door.box;
    box.min.set(b.lo[0], b.lo[1], b.lo[2]);
    box.max.set(b.hi[0], b.hi[1], b.hi[2]);
    const p = ray.intersectBox(box, hit) ?? (box.containsPoint(ray.origin) ? ray.origin : null);
    if (!p) continue;
    // (the model is not scaled: distances in it are the world's)
    const d = p.distanceTo(ray.origin);
    if (d <= reach && (!best || d < best.dist)) best = { door, dist: d };
  }
  return best;
}
