/**
 * Towing (docs/V3/plan/growth.md §六 2, J9d): a trailer (a frame with `towed`: the Tadpole) on a vehicle's tow hitch.
 *
 *  - Hitching: on foot at a trailer's coupling, a vehicle standing with its hitch ball within a metre of it, the left
 *    button held half a second — 长按 挂上 <the vehicle> — and it is on; held again there, 摘下挂车, and it stands on its
 *    jockey wheel where it is. Without a hitch on the vehicle near it, or none near, a press says why.
 *  - Towed, it follows: its coupling on the ball, its axle dragged along behind (the trailer's heading turns towards the
 *    ball, as a trailer's does: its axle cuts the corners), its wheels on the ground (the pitch from the ball's height,
 *    the roll from the ground under its two wheels), its wheels turning with the distance. It is posed, never driven:
 *    the vehicle feels its weight (CargoBay.extraLoads: a share at the hitch, the rest at its middle).
 *  - Left standing: on its jockey wheel, its coupling at its standing height, level with the ground under its wheels.
 *  - Kept: which trailer is on which vehicle (the save slice 'tow').
 */
import * as THREE from 'three';
import type { System } from '../../../../core/kernel/systems';
import type { SaveSlice } from '../../../../core/kernel/slices';
import type { CargoMass } from '../../../../core/modcar/cargo';
import { frameSize, HITCH_BALL } from '../../../../core/modcar/frames';
import type { Text } from '../../../../core/modcar/types';
import type { GameContext } from '../../kernel/context';
import type { GarageDevice } from '../../garageStub';
import type { ModVehicle } from '../../vehicle';

/** how near the hitch ball must be to the coupling to hitch (plan, m), and in height */
export const HITCH_REACH = 1.0;
const HITCH_RISE = 0.45;
/** the left button held this long (s) */
const HOLD_S = 0.5;
/** the share of a trailer's weight on the hitch (the rest carried as at the vehicle's middle) */
const TONGUE = 0.12;
/** the most a trailer pitches and rolls (rad) */
const MAX_TILT = 0.35;
/** the most it folds against what tows it (rad): its drawbar against the bumper — its box's corner would be next */
export const JACK = 1.05;

const T = (zh: string, en: string): Text => ({ zh, en });

/** a vehicle's hitch ball, in its frame (the hitch mount and the ball on it); null: no hitch on it */
export function hitchLocal(v: ModVehicle): THREE.Vector3 | null {
  const m = v.view.frame.mounts.find((x) => x.cat === 'hitch');
  if (!m || v.build.parts[m.id]?.part !== 'hitch_ball') return null;
  return new THREE.Vector3(m.pos.x + HITCH_BALL.x, m.pos.y + HITCH_BALL.y, m.pos.z + HITCH_BALL.z);
}

/** a pose (position, quaternion) as the sim keeps it */
interface PoseQ {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

/** a frame-space point to world through a pose */
function toWorld(p: PoseQ, local: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return out.copy(local).applyQuaternion(new THREE.Quaternion(p.qx, p.qy, p.qz, p.qw)).add(new THREE.Vector3(p.x, p.y, p.z));
}

/** a vehicle's sim pose as it stands now */
function simPose(v: ModVehicle): PoseQ {
  const s = v.sim;
  return { x: s.px, y: s.py, z: s.pz, qx: s.qx, qy: s.qy, qz: s.qz, qw: s.qw };
}

/**
 * A point of a vehicle's model (frame model space) in the world, through a sim pose: the simulation stands at the centre
 * of gravity, the model's origin −cg from it (carView placeModel)
 */
export function modelToWorld(v: ModVehicle, p: PoseQ, local: { x: number; y: number; z: number }, out: THREE.Vector3): THREE.Vector3 {
  const cg = v.sys.derived.cg;
  return toWorld(p, new THREE.Vector3(local.x - cg.x, local.y - cg.y, local.z - cg.z), out);
}

/**
 * The trailer's pose behind a hitch ball at H (world): its axle point A on the plan dragged along (kept: the follower,
 * `ax, az` its next; the pose's origin beside it by the coupling's lean on a camber),
 * its heading towards the ball, its height on the ground under its axle, its pitch so its coupling is on the ball, its
 * roll from the ground under its two wheels. Pure: `ground(x, z)` the ground's height.
 */
export function followPose(
  H: { x: number; y: number; z: number },
  A: { x: number; z: number },
  coupler: { x: number; y: number },
  track: number,
  ground: (x: number, z: number) => number,
): { ax: number; az: number; pose: PoseQ } {
  let dx = H.x - A.x;
  let dz = H.z - A.z;
  const d = Math.hypot(dx, dz) || 1;
  dx /= d;
  dz /= d;
  const L = coupler.x;
  // heading: the sim's yaw turns +x towards −z
  const yaw = Math.atan2(-dz, dx);
  // (on the plan right of the heading (dx, dz) is (−dz, dx): the sim's +z body axis)
  const rx = -dz;
  const rz = dx;
  // the ground under its axle (first guess: the coupler's length behind the ball) and under each wheel
  let ax = H.x - dx * L;
  let az = H.z - dz * L;
  const gy = ground(ax, az);
  const gR = ground(ax + rx * (track / 2), az + rz * (track / 2));
  const gL = ground(ax - rx * (track / 2), az - rz * (track / 2));
  const clamp = (x: number): number => Math.max(-MAX_TILT, Math.min(MAX_TILT, x));
  // (roll about its long axis: the right side down when it is positive)
  const roll = clamp(Math.atan2(gL - gR, track));
  // the pitch that puts its coupling at the ball's height: (L, h·cos roll) turned by it — L·sinθ + c·cosθ = the rise
  const c = coupler.y * Math.cos(roll);
  const R = Math.hypot(L, c);
  const pitch = clamp(Math.asin(Math.max(-1, Math.min(1, (H.y - gy) / R))) - Math.atan2(c, L));
  // where its coupling then comes from its axle: ahead by L·cosθ − c·sinθ, to the right by h·sin roll — its axle put
  // back from the ball by that (the follower's point by the first only: the lean fed back would walk it sideways, frame
  // after frame, across a camber)
  const along = L * Math.cos(pitch) - c * Math.sin(pitch);
  const side = coupler.y * Math.sin(roll);
  ax = H.x - dx * along;
  az = H.z - dz * along;
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), pitch));
  q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), roll));
  return { ax, az, pose: { x: ax - rx * side, y: gy, z: az - rz * side, qx: q.x, qy: q.y, qz: q.z, qw: q.w } };
}

/** where a vehicle's hitch ball is in the world now (null: no hitch on it) */
export function ballOf(v: ModVehicle): { x: number; y: number; z: number } | null {
  const h = hitchLocal(v);
  if (!h) return null;
  const p = modelToWorld(v, simPose(v), h, new THREE.Vector3());
  return { x: p.x, y: p.y, z: p.z };
}

/** where a vehicle's model origin (on the ground under the middle of its wheels; a trailer's: under its axle) is now */
export function originOf(v: ModVehicle): { x: number; y: number; z: number } {
  const p = modelToWorld(v, simPose(v), { x: 0, y: 0, z: 0 }, new THREE.Vector3());
  return { x: p.x, y: p.y, z: p.z };
}

/** where a trailer's coupling is in the world now (null: no trailer) */
export function couplerOf(t: ModVehicle): { x: number; y: number; z: number } | null {
  const f = t.view.frame.towed;
  if (!f) return null;
  const p = modelToWorld(t, simPose(t), { x: f.coupler.x, y: f.coupler.y, z: 0 }, new THREE.Vector3());
  return { x: p.x, y: p.y, z: p.z };
}

interface Link {
  tow: ModVehicle;
  /** the axle point on the plan (the follower's) */
  ax: number;
  az: number;
}

export class Towing implements System<GameContext> {
  readonly id = 'tow';
  readonly budget = { cpuMs: 0.15 };
  private ctx: GameContext | null = null;
  private readonly links = new Map<ModVehicle, Link>();
  /** the trailers stood on their jockey wheels already (posed once, then left alone) */
  private readonly stood = new Set<ModVehicle>();
  /** saved links waiting for their vehicles (trailer build uid → tow build uid) */
  private pending: [string, string][] = [];
  private readonly devices = new Map<ModVehicle, GarageDevice & { x: number; y: number; z: number }>();
  private readonly v = new THREE.Vector3();
  private readonly pose: PoseQ = { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 };

  readonly slice: SaveSlice<{ links: [string, string][] }> = {
    id: 'tow',
    version: 1,
    snapshot: () => {
      const links: [string, string][] = [...this.links].map(([t, l]) => [t.build.uid, l.tow.build.uid]);
      return links.length || this.pending.length ? { links: [...links, ...this.pending] } : undefined;
    },
    restore: (data) => {
      this.pending = [...(data.links ?? [])];
    },
    clear: () => {
      this.pending = [];
      this.links.clear();
    },
  };

  init(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.interact.add({ near: (at, r, out) => this.near(at, r, out) });
    ctx.cargo.extraLoads.push((v) => this.loadsOn(v));
  }

  /** is this trailer on a vehicle, and which */
  towOf(trailer: ModVehicle): ModVehicle | null {
    return this.links.get(trailer)?.tow ?? null;
  }

  /** the trailer on this vehicle, if any */
  trailerOf(tow: ModVehicle): ModVehicle | null {
    for (const [t, l] of this.links) if (l.tow === tow) return t;
    return null;
  }

  /** hitched now (the harness's; the hold does the same) */
  hitch(trailer: ModVehicle, tow: ModVehicle): boolean {
    if (!trailer.view.frame.towed || !hitchLocal(tow) || this.trailerOf(tow) || this.links.has(trailer)) return false;
    const o = modelToWorld(trailer, simPose(trailer), { x: 0, y: 0, z: 0 }, new THREE.Vector3());
    this.links.set(trailer, { tow, ax: o.x, az: o.z });
    this.stood.delete(trailer);
    // (the chase view stands back over it)
    tow.chaseBack = frameSize(trailer.build.frame).length;
    this.ctx?.cargo.weigh(tow);
    this.ctx?.claimVehicle?.(trailer);
    return true;
  }

  /** unhitched: it stands where it is */
  unhitch(trailer: ModVehicle): boolean {
    const l = this.links.get(trailer);
    if (!l) return false;
    this.links.delete(trailer);
    l.tow.chaseBack = 0;
    this.ctx?.cargo.weigh(l.tow);
    this.stand(trailer);
    return true;
  }

  step(dt: number, ctx: GameContext): void {
    // (saved links back once both their vehicles are about)
    if (this.pending.length) {
      this.pending = this.pending.filter(([tu, vu]) => {
        const t = ctx.vehicles.find((x) => x.build.uid === tu);
        const v = ctx.vehicles.find((x) => x.build.uid === vu);
        if (!t || !v) return true;
        this.hitch(t, v);
        return false;
      });
    }
    for (const t of ctx.vehicles) {
      const f = t.view.frame.towed;
      if (!f) continue;
      const l = this.links.get(t);
      if (!l || !ctx.vehicles.includes(l.tow) || !hitchLocal(l.tow)) {
        if (l) this.unhitch(t);
        else if (!this.stood.has(t)) this.stand(t);
        continue;
      }
      // the ball where the vehicle is drawn this frame (its interpolated pose, as its view will be)
      const alpha = l.tow === ctx.seated ? (ctx.renderAlpha ?? 1) : 1;
      l.tow.sim.renderPose(this.pose as never, alpha);
      const H = modelToWorld(l.tow, this.pose, hitchLocal(l.tow)!, this.v);
      const g = (x: number, z: number): number => ctx.world?.heightAt(x, z) ?? 0;
      const track = Math.abs(t.view.frame.mounts.filter((m) => m.cat === 'rim').reduce((a, m) => a + m.pos.z, 0)) || 1.39;
      const rims = t.view.frame.mounts.filter((m) => m.cat === 'rim');
      const tr = rims.length === 2 ? Math.abs(rims[0].pos.z - rims[1].pos.z) : track;
      const was = { x: l.ax, z: l.az };
      // (folded no further than its drawbar lets it: past JACK the follower turned back to it round the ball)
      const p = this.pose;
      const towYaw = Math.atan2(-2 * (p.qx * p.qz - p.qw * p.qy), 1 - 2 * (p.qy * p.qy + p.qz * p.qz));
      const ty = Math.atan2(-(H.z - l.az), H.x - l.ax);
      let rel = ty - towYaw;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      if (Math.abs(rel) > JACK) {
        const y = towYaw + Math.sign(rel) * JACK;
        const d = Math.hypot(H.x - l.ax, H.z - l.az);
        l.ax = H.x - Math.cos(y) * d;
        l.az = H.z + Math.sin(y) * d;
      }
      const fp = followPose(H, { x: l.ax, z: l.az }, f.coupler, tr, g);
      l.ax = fp.ax;
      l.az = fp.az;
      this.place(t, fp.pose, dt, Math.hypot(fp.ax - was.x, fp.az - was.z));

    }
  }

  /** set a trailer's sim to its model origin's pose (no interpolation: drawn as it is), its wheels turned by the distance it went */
  private place(t: ModVehicle, origin: PoseQ, dt: number, dist: number): void {
    const s = t.sim;
    // (the sim at the centre of gravity: the origin's pose moved by cg turned with it)
    const cg = t.sys.derived.cg;
    const c = toWorld({ ...origin, x: 0, y: 0, z: 0 }, new THREE.Vector3(cg.x, cg.y, cg.z), new THREE.Vector3());
    const p = { ...origin, x: origin.x + c.x, y: origin.y + c.y, z: origin.z + c.z };
    s.px = s.ppx = p.x;
    s.py = s.ppy = p.y;
    s.pz = s.ppz = p.z;
    s.qx = s.pqx = p.qx;
    s.qy = s.pqy = p.qy;
    s.qz = s.pqz = p.qz;
    s.qw = s.pqw = p.qw;
    s.vx = dt > 0 ? (dist / dt) * Math.cos(-Math.atan2(-2 * (p.qx * p.qz - p.qw * p.qy), 1 - 2 * (p.qy * p.qy + p.qz * p.qz))) : 0;
    s.speed = dt > 0 ? dist / dt : 0;
    for (const w of s.wheels) if (w.radius > 0.05) w.spin += dist / w.radius;
    t.awake = 2;
  }

  /** a trailer left standing: on its jockey wheel, its coupling at its standing height, its heading as it is */
  private stand(t: ModVehicle): void {
    const ctx = this.ctx;
    const f = t.view.frame.towed;
    if (!ctx?.world || !f) return;
    const yaw = t.sim.yaw;
    const dx = Math.cos(yaw);
    const dz = -Math.sin(yaw);
    // (its axle on the plan: the model's origin under it)
    const o = modelToWorld(t, simPose(t), { x: 0, y: 0, z: 0 }, new THREE.Vector3());
    const ax = o.x;
    const az = o.z;
    const hx = ax + dx * f.coupler.x;
    const hz = az + dz * f.coupler.x;
    const H = { x: hx, y: ctx.world.heightAt(hx, hz) + f.standY, z: hz };
    // (the follower from just behind: the heading kept)
    const fp = followPose(H, { x: ax, z: az }, f.coupler, 1.39, (x, z) => ctx.world!.heightAt(x, z));
    this.place(t, fp.pose, 0, 0);
    this.stood.add(t);
  }

  /** what a trailer on this vehicle weighs on it: a share at the hitch, the rest as at the vehicle's middle */
  private loadsOn(v: ModVehicle): readonly CargoMass[] {
    const t = this.trailerOf(v);
    const h = t ? hitchLocal(v) : null;
    if (!t || !h) return [];
    const m = t.sys.derived.mass;
    return [
      { m: m * TONGUE, x: h.x, y: h.y, z: h.z },
      { m: m * (1 - TONGUE), x: 0, y: 0.5, z: 0 },
    ];
  }

  /** the couplings near: each trailer's, to hitch or unhitch */
  private near(at: { x: number; z: number }, r: number, out: GarageDevice[]): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const t of ctx.vehicles) {
      const f = t.view.frame.towed;
      if (!f) continue;
      const c = modelToWorld(t, simPose(t), { x: f.coupler.x, y: f.coupler.y + 0.06, z: 0 }, new THREE.Vector3());
      if (Math.hypot(c.x - at.x, c.z - at.z) > r + 0.5) continue;
      let d = this.devices.get(t);
      if (!d) {
        d = this.deviceFor(t);
        this.devices.set(t, d);
      }
      d.x = c.x;
      d.y = c.y;
      d.z = c.z;
      out.push(d);
    }
  }

  /** the vehicle near a trailer's coupling with its ball in reach (null: none), or why not */
  private towNear(t: ModVehicle): { v: ModVehicle } | { why: Text } {
    const ctx = this.ctx!;
    const f = t.view.frame.towed!;
    const c = modelToWorld(t, simPose(t), { x: f.coupler.x, y: f.coupler.y, z: 0 }, new THREE.Vector3());
    let best: ModVehicle | null = null;
    let bestD = Infinity;
    let without = false;
    // (a motorcycle rack in the hitch's place: no ball to hitch to — v3/moto-rack, J9e)
    let racked = false;
    for (const v of ctx.vehicles) {
      if (v === t || v.view.frame.towed || v.view.frame.balance) continue;
      const near = Math.hypot(v.sim.px - c.x, v.sim.pz - c.z) < 7;
      if (!near) continue;
      const h = hitchLocal(v);
      if (!h) {
        without = true;
        if (v.build.parts[v.view.frame.mounts.find((m) => m.cat === 'hitch')?.id ?? '']?.part === 'moto_rack') racked = true;
        continue;
      }
      const H = modelToWorld(v, simPose(v), h, new THREE.Vector3());
      const dd = Math.hypot(H.x - c.x, H.z - c.z);
      if (dd < bestD && Math.abs(H.y - c.y) < HITCH_RISE) {
        bestD = dd;
        best = v;
      }
    }
    if (best && bestD <= HITCH_REACH) {
      if (Math.abs(best.sim.kmh) > 1.5) return { why: T('先停车', 'Stop it first') };
      if (this.trailerOf(best)) return { why: T('那辆车已经挂着一节了', 'That one tows one already') };
      return { v: best };
    }
    if (best) return { why: T('把车倒到挂钩对着这儿', 'Back its hitch up to here') };
    return { why: racked ? T('挂钩座上装着摩托车架', 'A motorcycle rack is in its hitch') : without ? T('车上没有挂钩', 'No hitch on the car') : T('旁边没有车', 'No car near') };
  }

  private deviceFor(t: ModVehicle): GarageDevice & { x: number; y: number; z: number } {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    let held = 0;
    return {
      id: `tow:${t.build.uid}`,
      x: 0,
      y: 0,
      z: 0,
      radius: 0.3,
      get word(): Text {
        const l = self.links.get(t);
        if (l) return T('摘下挂车', 'Unhitch');
        const n = self.towNear(t);
        return 'v' in n ? T(`挂上 ${n.v.view.frame.name.zh}`, `Hitch to the ${n.v.view.frame.name.en}`) : T('挂上', 'Hitch');
      },
      get why(): Text | null {
        if (self.links.get(t)) return null;
        const n = self.towNear(t);
        return 'why' in n ? n.why : null;
      },
      get state(): Text {
        const l = self.links.get(t);
        return l ? T(`挂在${l.tow.view.frame.name.zh}后面`, `On the ${l.tow.view.frame.name.en}`) : T('没挂着', 'Standing');
      },
      holdS: HOLD_S,
      holding(p: number): void {
        held = p;
      },
      use(): void {
        void held;
        if (self.links.get(t)) {
          self.unhitch(t);
          self.ctx?.sound('ratchet_done', 0.7);
          self.ctx?.ui.say('挂车摘下了', 1.8);
          return;
        }
        const n = self.towNear(t);
        if (!('v' in n)) return;
        if (self.hitch(t, n.v)) {
          self.ctx?.sound('ratchet_done', 0.9);
          self.ctx?.ui.say(`挂上了${n.v.view.frame.name.zh}`, 1.8);
        }
      },
    };
  }

  telemetry(): Record<string, unknown> {
    return { links: [...this.links].map(([t, l]) => `${t.build.uid}>${l.tow.build.uid}`), stood: this.stood.size, pending: this.pending.length };
  }
}
