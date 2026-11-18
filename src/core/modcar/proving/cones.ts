/**
 * The proving ground's cones (docs/MODCAR.md §28): round the skid pad's inside, down the slalom and at its gates,
 * at the ends of the lines across the straight and the off-road course. A cone is no wall: a vehicle whose body
 * comes onto one knocks it flying — it hops, tumbles and comes to rest on its side where it lands — and the run
 * counts it (runs.ts). Set up again at the start of a run.
 */
import { GRAVITY } from '../../vehicle/sim';
import {
  BRAKE_U,
  LOOP,
  OFFROAD_FINISH,
  OFFROAD_START,
  SKIDPAD,
  SLALOM,
  SLALOM_OUT,
  START_X,
  STOP_END_U,
  STRAIGHT,
  loopAt,
  type ProvingGround,
} from './layout';

export type ConeGroup = 'skidpad' | 'slalom' | 'gate' | 'straight' | 'offroad';

/** a cone's size: its base's half width, its height, and its middle of mass over the base */
export const CONE = { r: 0.18, h: 0.46, com: 0.14 } as const;

export class Cone {
  /** where it stands when set up (its base's middle) */
  readonly hx: number;
  readonly hz: number;
  hy = 0;
  /** its base's middle and its turn (a quaternion: its up axis is the cone's) */
  x: number;
  y = 0;
  z: number;
  qx = 0;
  qy = 0;
  qz = 0;
  qw = 1;
  /** while it flies: its middle of mass's velocity and its spin (world frame) */
  vx = 0;
  vy = 0;
  vz = 0;
  wx = 0;
  wy = 0;
  wz = 0;
  /** knocked over (and when, the field's clock); come to rest */
  down = false;
  at = -1;
  still = true;

  constructor(
    x: number,
    z: number,
    readonly group: ConeGroup,
  ) {
    this.hx = this.x = x;
    this.hz = this.z = z;
  }
}

/** a vehicle's body on the plan, as the cones see it */
export interface ConeBody {
  /** its middle and velocity (world), its yaw rate (rad/s about +y) */
  x: number;
  z: number;
  vx: number;
  vz: number;
  yawRate: number;
  /** its heading on the plan: forward (fx, fz), unit */
  fx: number;
  fz: number;
  /** the body box along its heading (front > 0 > rear) and its half width; its underside's height above the ground */
  front: number;
  rear: number;
  halfWidth: number;
  bottom: number;
}

/** every cone of the proving ground, standing */
export function coneSpots(): { x: number; z: number; group: ConeGroup }[] {
  const out: { x: number; z: number; group: ConeGroup }[] = [];
  // round the skid pad's inside, every 15°
  const ri = SKIDPAD.r - SKIDPAD.lane - 0.5;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    out.push({ x: SKIDPAD.x + Math.cos(a) * ri, z: SKIDPAD.z + Math.sin(a) * ri, group: 'skidpad' });
  }
  for (let i = 0; i < SLALOM.cones; i++) out.push({ x: SLALOM.first - SLALOM.gap * i, z: SLALOM.z, group: 'slalom' });
  for (const x of [SLALOM.gateIn, SLALOM_OUT]) for (const s of [-1, 1]) out.push({ x, z: SLALOM.z + s * 4, group: 'gate' });
  // the ends of the start line, the brake line and the stopping zone's end
  for (const u of [0, BRAKE_U, STOP_END_U]) for (const s of [-1, 1]) out.push({ x: START_X - u, z: s * (STRAIGHT.half - 0.4), group: 'straight' });
  // the off-road course's start and finish, either side of the gravel
  const p = { x: 0, z: 0, tx: 0, tz: 0, kappa: 0 };
  for (const s of [OFFROAD_START, OFFROAD_FINISH]) {
    loopAt(s, p);
    for (const k of [-1, 1]) out.push({ x: p.x - p.tz * k * (LOOP.half + 0.6), z: p.z + p.tx * k * (LOOP.half + 0.6), group: 'offroad' });
  }
  return out;
}

export class ConeField {
  readonly cones: Cone[];
  /** the field's clock (s) */
  time = 0;
  /** how many have been knocked over since the field was made (the probes) */
  knocked = 0;

  constructor(private readonly ground: ProvingGround) {
    this.cones = coneSpots().map((s) => new Cone(s.x, s.z, s.group));
    for (const c of this.cones) c.hy = c.y = ground.heightAt(c.hx, c.hz);
  }

  /** set the cones up again where they stand (a group's, or all) */
  reset(group?: ConeGroup | ConeGroup[]): void {
    const gs = group === undefined ? null : Array.isArray(group) ? group : [group];
    for (const c of this.cones) {
      if (gs && !gs.includes(c.group)) continue;
      c.x = c.hx;
      c.y = c.hy;
      c.z = c.hz;
      c.qx = c.qy = c.qz = 0;
      c.qw = 1;
      c.vx = c.vy = c.vz = c.wx = c.wy = c.wz = 0;
      c.down = false;
      c.at = -1;
      c.still = true;
    }
  }

  /** the cones of a group knocked over since `since` (the field's clock) */
  downSince(groups: readonly ConeGroup[], since: number): number {
    let n = 0;
    for (const c of this.cones) if (c.down && c.at >= since && groups.includes(c.group)) n++;
    return n;
  }

  /** a step: the bodies against the standing cones (those they come onto fly), the flying ones on */
  step(dt: number, bodies: readonly ConeBody[]): void {
    this.time += dt;
    for (const c of this.cones) {
      if (!c.down) {
        for (const b of bodies) if (this.hits(b, c)) this.knock(b, c);
        continue;
      }
      if (!c.still) this.fly(c, dt);
    }
  }

  private hits(b: ConeBody, c: Cone): boolean {
    const dx = c.x - b.x;
    const dz = c.z - b.z;
    if (dx * dx + dz * dz > 64) return false;
    // (a body standing higher than a cone passes over it)
    if (b.bottom > CONE.h) return false;
    const along = dx * b.fx + dz * b.fz;
    const side = -dx * b.fz + dz * b.fx;
    return along < b.front + CONE.r && along > b.rear - CONE.r && Math.abs(side) < b.halfWidth + CONE.r;
  }

  /** knocked: it takes the body's speed where it was struck, hops and tumbles away from it */
  private knock(b: ConeBody, c: Cone): void {
    const rx = c.x - b.x;
    const rz = c.z - b.z;
    // (the body's velocity at the point: v + ω × r, ω about +y)
    const px = b.vx + b.yawRate * rz;
    const pz = b.vz - b.yawRate * rx;
    const sp = Math.hypot(px, pz);
    const rl = Math.hypot(rx, rz) || 1;
    // (and out of its way)
    const out = 0.25 * sp + 0.3;
    c.vx = px * 1.1 + (rx / rl) * out;
    c.vz = pz * 1.1 + (rz / rl) * out;
    c.vy = 0.8 + 0.12 * sp;
    // tumbling over the way it goes: about the level axis across it
    const hx = c.vx;
    const hz = c.vz;
    const hl = Math.hypot(hx, hz) || 1;
    const spin = Math.min(22, 2 + sp * 2.2);
    c.wx = (hz / hl) * spin;
    c.wz = (-hx / hl) * spin;
    c.wy = ((c.hx * 7.3 + c.hz * 3.1) % 2) - 1;
    // (its middle of mass, not its base, flies)
    c.y += CONE.com;
    c.down = true;
    c.at = this.time;
    c.still = false;
    this.knocked++;
  }

  private fly(c: Cone, dt: number): void {
    c.vy -= GRAVITY * dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.z += c.vz * dt;
    // turn by ω dt
    const wl = Math.hypot(c.wx, c.wy, c.wz);
    if (wl > 1e-6) {
      const a = wl * dt * 0.5;
      const s = Math.sin(a) / wl;
      const dx = c.wx * s;
      const dy = c.wy * s;
      const dz = c.wz * s;
      const dw = Math.cos(a);
      const { qx, qy, qz, qw } = c;
      c.qx = dw * qx + dx * qw + dy * qz - dz * qy;
      c.qy = dw * qy - dx * qz + dy * qw + dz * qx;
      c.qz = dw * qz + dx * qy - dy * qx + dz * qw;
      c.qw = dw * qw - dx * qx - dy * qy - dz * qz;
      const n = Math.hypot(c.qx, c.qy, c.qz, c.qw);
      c.qx /= n;
      c.qy /= n;
      c.qz /= n;
      c.qw /= n;
    }
    const g = this.ground.heightAt(c.x, c.z);
    // (lying on its side its middle is a little lower than standing)
    const floor = g + 0.1;
    if (c.y < floor) {
      c.y = floor;
      if (c.vy < 0) c.vy = -c.vy * 0.28;
      const k = Math.max(0, 1 - 7 * dt);
      c.vx *= k;
      c.vz *= k;
      c.wx *= 0.8;
      c.wy *= 0.8;
      c.wz *= 0.8;
      if (Math.hypot(c.vx, c.vz) < 0.25 && Math.abs(c.vy) < 0.4) this.lieDown(c, g);
    }
  }

  /** come to rest on its side: its axis level but for the tilt its base and its tip rest it at, turned as it fell */
  private lieDown(c: Cone, g: number): void {
    // (its up axis now: q × (0, 1, 0))
    const { qx, qy, qz, qw } = c;
    let ax = 2 * (qx * qy - qw * qz);
    let az = 2 * (qy * qz + qw * qx);
    const l = Math.hypot(ax, az);
    if (l < 1e-4) {
      ax = 1;
      az = 0;
    } else {
      ax /= l;
      az /= l;
    }
    // the base's rim and the tip on the ground: the axis down by atan(r / h) from level, towards the tip
    const tilt = Math.atan2(CONE.r, CONE.h);
    const ux = ax * Math.cos(tilt);
    const uy = -Math.sin(tilt);
    const uz = az * Math.cos(tilt);
    // the turn taking (0, 1, 0) to u: about (0,1,0) × u
    const cx = uz;
    const cz = -ux;
    const cl = Math.hypot(cx, cz) || 1;
    const ang = Math.acos(Math.max(-1, Math.min(1, uy)));
    const s = Math.sin(ang / 2);
    c.qx = (cx / cl) * s;
    c.qy = 0;
    c.qz = (cz / cl) * s;
    c.qw = Math.cos(ang / 2);
    // its base's middle: lifted by the rim it rests on, back from the middle of mass along the axis
    c.x -= ux * CONE.com;
    c.z -= uz * CONE.com;
    c.y = g + CONE.r * Math.cos(tilt);
    c.vx = c.vy = c.vz = c.wx = c.wy = c.wz = 0;
    c.still = true;
  }

  /** a cone's base's middle while it flies (its model's origin): from its middle of mass, back down its axis */
  static base(c: Cone, out: { x: number; y: number; z: number }): void {
    if (!c.down || c.still) {
      out.x = c.x;
      out.y = c.y;
      out.z = c.z;
      return;
    }
    const { qx, qy, qz, qw } = c;
    out.x = c.x - 2 * (qx * qy - qw * qz) * CONE.com;
    out.y = c.y - (1 - 2 * (qx * qx + qz * qz)) * CONE.com;
    out.z = c.z - 2 * (qy * qz + qw * qx) * CONE.com;
  }
}
