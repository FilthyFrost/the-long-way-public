/**
 * The motorcycle rack (docs/V3/plan/growth.md §六 2: 摩托车……能挂在车架上 — 摩托车架跟着摩托车出现; docs/ND/PLAN.md 定案 4:
 * 摩托车用现有那辆，加一个挂在房车后面的车架; Nomad Drive's motorcycle holder at the back of its campers — J9e):
 *
 *  - The rack is a part (moto_rack) in the hitch's place under the rear bumper, fitted from its blueprint (v3/blueprints):
 *    a receiver bar back to a tray across the vehicle, a mast with a strap arm. A rack or a hitch ball: one vehicle tows
 *    a trailer or carries the motorcycle, as a carrier in a tow bar's receiver does.
 *  - The Swallow (a frame with `balance`) standing beside the rack, nobody on it, both standing still: at the rack,
 *    长按 装上 燕子 — the left button held a second — and it goes up onto the tray across the back (lifted in 0.6 s, its
 *    front to the vehicle's right, its stand up, strapped). Pressed when it cannot, it says why (先停车, 把燕子骑到车架
 *    旁边, 燕子太重了).
 *  - On the rack it rides along: posed on the tray every frame as its carrier is drawn (its interpolated pose), never its
 *    own physics (ModVehicle.carriedBy), nobody gets on it (先从车架上卸下来); its weight on the carrier (CargoBay.extraLoads,
 *    at the tray), the chase view standing back a little over it.
 *  - At the rack, or at the motorcycle on it, 长按 卸下 燕子: it comes down beside the vehicle — by its right side at
 *    the rear wheel, else its left, else behind it — standing on its side stand, its stand down.
 *  - Kept: which motorcycle is on which vehicle's rack (the slice 'moto-rack').
 */
import * as THREE from 'three';
import type { SaveSlice } from '../../../../core/kernel/slices';
import type { System } from '../../../../core/kernel/systems';
import type { CargoMass } from '../../../../core/modcar/cargo';
import { MOTO_RACK, motoTray } from '../../../../core/modcar/motoRack';
import { partDef } from '../../../../core/modcar/parts';
import type { Text } from '../../../../core/modcar/types';
import type { GarageDevice } from '../../garageStub';
import type { GameContext } from '../../kernel/context';
import type { ModVehicle } from '../../vehicle';
import { modelToWorld } from '../tow/system';

/** the motorcycle across the tray: turned this far about the vertical from the carrier's heading (its front to the carrier's right) */
export const ACROSS = -Math.PI / 2;
/** the left button held this long (s); the lift up onto the tray and down off it (s) */
const HOLD_S = 1;
const LIFT_S = 0.6;
/** a motorcycle this near the tray is loaded (m, on the plan); this near, told to come closer */
const LOAD_REACH = 3.5;
const NEAR_REACH = 6;
/** the chase view stands back this much more over a motorcycle on the rack (m) */
const CHASE_BACK = 1.0;

const T = (zh: string, en: string): Text => ({ zh, en });

/** a pose as the sim keeps it */
interface PoseQ {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

/** a motorcycle on a rack, or going up onto it or down off it */
interface Ride {
  carrier: ModVehicle;
  /** 0 → 1 going up from `from`; going down: 0 → 1 towards `to` (its origin's pose on the ground) */
  t: number;
  phase: 'up' | 'on' | 'down';
  from: { o: THREE.Vector3; q: THREE.Quaternion };
  to: { o: THREE.Vector3; q: THREE.Quaternion } | null;
}

/** the rack on a vehicle: its hitch mount with a rack on it (null: none) */
export function rackMount(v: ModVehicle): { x: number; y: number; z: number } | null {
  const m = v.view.frame.mounts.find((x) => x.cat === 'hitch');
  if (!m || v.build.parts[m.id]?.part !== MOTO_RACK) return null;
  return m.pos;
}

/** where on a vehicle (its model space) a motorcycle stands on its rack (null: no rack on it): core/modcar/motoRack.ts motoTray */
export function traySpot(v: ModVehicle): { x: number; y: number; z: number } | null {
  const m = rackMount(v);
  if (!m) return null;
  const t = motoTray(v.view.frame.id);
  return { x: m.x + t.x, y: m.y + t.y, z: m.z + t.z };
}

/** the heaviest motorcycle a vehicle's rack carries (kg; 0: no rack) */
function rackKg(v: ModVehicle): number {
  const m = v.view.frame.mounts.find((x) => x.cat === 'hitch');
  const on = m ? v.build.parts[m.id] : undefined;
  return on?.part === MOTO_RACK ? (partDef(on.part).hitch?.motoKg ?? 0) : 0;
}

export class MotoRacks implements System<GameContext> {
  readonly id = 'moto-rack';
  readonly budget = { cpuMs: 0.1 };
  private ctx: GameContext | null = null;
  /** the motorcycles on the racks, by motorcycle */
  private readonly rides = new Map<ModVehicle, Ride>();
  /** saved links waiting for their vehicles (motorcycle build uid → carrier build uid) */
  private pending: [string, string][] = [];
  private readonly devices = new Map<ModVehicle, GarageDevice & { x: number; y: number; z: number }>();
  private readonly pose: PoseQ = { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 };
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly q1 = new THREE.Quaternion();
  private readonly q2 = new THREE.Quaternion();
  private readonly qAcross = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ACROSS);
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly ray = new THREE.Ray();
  private readonly box = new THREE.Box3();
  private readonly hitP = new THREE.Vector3();
  private readonly inv = new THREE.Matrix4();
  /** loads and unloads (the probes') */
  private loads = 0;
  private unloads = 0;

  readonly slice: SaveSlice<{ links: [string, string][] }> = {
    id: 'moto-rack',
    version: 1,
    snapshot: () => {
      const links: [string, string][] = [...this.rides].filter(([, r]) => r.phase !== 'down').map(([m, r]) => [m.build.uid, r.carrier.build.uid]);
      return links.length || this.pending.length ? { links: [...links, ...this.pending] } : undefined;
    },
    restore: (data) => {
      this.pending = [...(data.links ?? [])];
    },
    clear: () => {
      this.pending = [];
      for (const m of this.rides.keys()) m.carriedBy = null;
      this.rides.clear();
    },
  };

  init(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.interact.add({ near: (at, r, out) => this.near(at, r, out) });
    ctx.cargo.extraLoads.push((v) => this.loadsOn(v));
  }

  /** the motorcycle on this vehicle's rack (null: none) */
  motoOn(carrier: ModVehicle): ModVehicle | null {
    for (const [m, r] of this.rides) if (r.carrier === carrier && r.phase !== 'down') return m;
    return null;
  }

  /** the vehicle carrying this motorcycle (null: none) */
  carrierOf(moto: ModVehicle): ModVehicle | null {
    const r = this.rides.get(moto);
    return r && r.phase !== 'down' ? r.carrier : null;
  }

  // ------------------------------------------------------------------ poses

  /** the motorcycle's origin on the tray (world) and its turn, as the carrier is drawn now */
  private rackPose(carrier: ModVehicle, alpha: number, o: THREE.Vector3, q: THREE.Quaternion): boolean {
    const spot = traySpot(carrier);
    if (!spot) return false;
    carrier.sim.renderPose(this.pose as never, alpha);
    modelToWorld(carrier, this.pose, spot, o);
    q.set(this.pose.qx, this.pose.qy, this.pose.qz, this.pose.qw).multiply(this.qAcross);
    return true;
  }

  /** a motorcycle posed: its model's origin at o, turned by q (its sim at its centre of gravity, no interpolation) */
  private place(m: ModVehicle, o: THREE.Vector3, q: THREE.Quaternion): void {
    const s = m.sim;
    const cg = m.sys.derived.cg;
    const c = this.v2.set(cg.x, cg.y, cg.z).applyQuaternion(q);
    s.px = s.ppx = o.x + c.x;
    s.py = s.ppy = o.y + c.y;
    s.pz = s.ppz = o.z + c.z;
    s.qx = s.pqx = q.x;
    s.qy = s.pqy = q.y;
    s.qz = s.pqz = q.z;
    s.qw = s.pqw = q.w;
    s.vx = s.vy = s.vz = 0;
    s.speed = 0;
    s.lean = 0;
    m.awake = 2;
  }

  /** a motorcycle's model origin (world) and turn as it stands now */
  private poseOf(m: ModVehicle, o: THREE.Vector3, q: THREE.Quaternion): void {
    const s = m.sim;
    q.set(s.qx, s.qy, s.qz, s.qw);
    const cg = m.sys.derived.cg;
    o.set(s.px, s.py, s.pz).sub(this.v2.set(cg.x, cg.y, cg.z).applyQuaternion(q));
  }

  // ------------------------------------------------------------------ on and off

  /** onto the rack now (the harness's; the hold does the same, lifted): false when it cannot */
  load(moto: ModVehicle, carrier: ModVehicle, lift = true): boolean {
    const ctx = this.ctx;
    if (!ctx || !moto.view.frame.balance || !traySpot(carrier) || this.motoOn(carrier) || this.rides.has(moto) || moto === ctx.seated) return false;
    const from = { o: new THREE.Vector3(), q: new THREE.Quaternion() };
    this.poseOf(moto, from.o, from.q);
    this.rides.set(moto, { carrier, t: lift ? 0 : 1, phase: lift ? 'up' : 'on', from, to: null });
    moto.carriedBy = carrier;
    carrier.chaseBack = Math.max(carrier.chaseBack, CHASE_BACK);
    ctx.cargo.weigh(carrier);
    ctx.claimVehicle?.(moto);
    this.loads++;
    return true;
  }

  /** down off the rack, beside the vehicle (the harness's; the hold does the same): false when there is no room */
  unload(moto: ModVehicle, lift = true): boolean {
    const r = this.rides.get(moto);
    if (!r || r.phase === 'down') return false;
    const to = this.spotBeside(r.carrier);
    if (!to) return false;
    r.phase = 'down';
    r.t = lift ? 0 : 1;
    this.poseOf(moto, r.from.o, r.from.q);
    r.to = to;
    if (!lift) this.settle(moto, r);
    return true;
  }

  /** come down: standing on its side stand where it was put, its own again */
  private settle(moto: ModVehicle, r: Ride): void {
    const ctx = this.ctx!;
    this.rides.delete(moto);
    moto.carriedBy = null;
    if (r.carrier.chaseBack === CHASE_BACK) r.carrier.chaseBack = 0;
    ctx.cargo.weigh(r.carrier);
    const to = r.to;
    if (to) {
      // (its heading on the plan as the sim keeps it: +x turned towards −z)
      const f = this.v1.set(1, 0, 0).applyQuaternion(to.q);
      const yaw = Math.atan2(-f.z, f.x);
      const g = this.groundAt(to.o.x, to.o.z);
      moto.sim.reset(to.o.x, g, to.o.z, yaw);
    }
    moto.awake = 3;
    this.unloads++;
  }

  /** the ground's height (the world's land; 0 in the stand-in garage) */
  private groundAt(x: number, z: number): number {
    const w = this.ctx?.world;
    return w ? w.heightAt(x, z) : 0;
  }

  /**
   * Where a motorcycle is put down beside its carrier: by its right side at the rear wheel, parallel to it, else its
   * left, else behind it across — the first with room (the walker's measure along the bike, off the walker itself), its
   * ground not a step away from the carrier's. Null: none.
   */
  private spotBeside(carrier: ModVehicle): { o: THREE.Vector3; q: THREE.Quaternion } | null {
    const ctx = this.ctx!;
    const f = carrier.view.frame;
    const rear = f.mounts.filter((m) => m.cat === 'rim' && m.axle === 'rear');
    const rx = rear.length ? rear.reduce((a, m) => a + m.pos.x, 0) / rear.length : f.body.rear + 1;
    const out = f.body.halfWidth + 0.75;
    const spot = traySpot(carrier)!;
    const candidates: { x: number; z: number; across: boolean }[] = [
      { x: rx, z: out, across: false },
      { x: rx, z: -out, across: false },
      { x: spot.x - 1.4, z: 0, across: true },
    ];
    const p = this.pose;
    carrier.sim.renderPose(p as never, 1);
    const w = ctx.player.walker;
    // (level on the plan: the vehicle's heading only)
    const yaw = Math.atan2(-2 * (p.qx * p.qz - p.qw * p.qy), 1 - 2 * (p.qy * p.qy + p.qz * p.qz));
    const qLevel = new THREE.Quaternion().setFromAxisAngle(this.up, yaw);
    const ground0 = this.groundAt(carrier.sim.px, carrier.sim.pz);
    for (const c of candidates) {
      const o = modelToWorld(carrier, p, { x: c.x, y: 0, z: c.z }, new THREE.Vector3());
      const q = qLevel.clone();
      if (c.across) q.multiply(this.qAcross);
      const along = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
      const g = this.groundAt(o.x, o.z);
      if (Math.abs(g - ground0) > 0.6) continue;
      // (room along it: its front, its middle, its back; not on the walker; and nothing between it and the car — a fence
      // by the road is not stepped over with a motorcycle in the arms)
      let room = true;
      for (const k of [-0.75, 0, 0.75]) {
        const x = o.x + along.x * k;
        const z = o.z + along.z * k;
        if (!w.freeAt(x, z, 0.02) || Math.hypot(x - w.x, z - w.z) < 0.75) room = false;
      }
      const from = modelToWorld(carrier, p, c.across ? { x: spot.x - 0.45, y: 0, z: 0 } : { x: c.x, y: 0, z: Math.sign(c.z) * (f.body.halfWidth + 0.32) }, this.v1);
      const fx = from.x;
      const fz = from.z;
      for (let k = 0.25; k < 1 && room; k += 0.25) if (!w.freeAt(fx + (o.x - fx) * k, fz + (o.z - fz) * k, 0)) room = false;
      if (!room) continue;
      o.y = g;
      return { o, q };
    }
    return null;
  }

  // ------------------------------------------------------------------ every frame

  step(dt: number, ctx: GameContext): void {
    // (saved links back once both their vehicles are about: on the tray at once)
    if (this.pending.length) {
      this.pending = this.pending.filter(([mu, cu]) => {
        const m = ctx.vehicles.find((x) => x.build.uid === mu);
        const c = ctx.vehicles.find((x) => x.build.uid === cu);
        if (!m || !c) return true;
        this.load(m, c, false);
        return false;
      });
    }
    for (const [m, r] of this.rides) {
      // (the motorcycle gone from the world, or its carrier: what is left stands on its own)
      if (!ctx.vehicles.includes(m)) {
        this.rides.delete(m);
        m.carriedBy = null;
        if (r.carrier.chaseBack === CHASE_BACK) r.carrier.chaseBack = 0;
        ctx.cargo.weigh(r.carrier);
        continue;
      }
      if (r.phase !== 'down' && (!ctx.vehicles.includes(r.carrier) || !traySpot(r.carrier))) {
        // (the rack taken off, the carrier gone: down where it is, on the ground under it)
        this.poseOf(m, this.v1, this.q2);
        const yaw = Math.atan2(-2 * (this.q2.x * this.q2.z - this.q2.w * this.q2.y), 1 - 2 * (this.q2.y * this.q2.y + this.q2.z * this.q2.z));
        r.to = { o: this.v1.clone(), q: new THREE.Quaternion().setFromAxisAngle(this.up, yaw) };
        this.settle(m, r);
        continue;
      }
      const alpha = r.carrier === ctx.seated ? (ctx.renderAlpha ?? 1) : 1;
      const o = this.v1;
      const q = this.q1;
      if (r.phase === 'down') {
        r.t = Math.min(1, r.t + dt / LIFT_S);
        this.lerpPose(r.from, r.to!, r.t, o, q);
        this.place(m, o, q);
        if (r.t >= 1) this.settle(m, r);
        continue;
      }
      if (!this.rackPose(r.carrier, alpha, o, q)) continue;
      if (r.phase === 'up') {
        r.t = Math.min(1, r.t + dt / LIFT_S);
        const at = { o: o.clone(), q: q.clone() };
        this.lerpPose(r.from, at, r.t, o, q);
        if (r.t >= 1) r.phase = 'on';
      }
      this.place(m, o, q);
    }
  }

  /** from a to b at k (0 … 1): up in an arc over the tray's edge, turned on the way */
  private lerpPose(a: { o: THREE.Vector3; q: THREE.Quaternion }, b: { o: THREE.Vector3; q: THREE.Quaternion }, k: number, o: THREE.Vector3, q: THREE.Quaternion): void {
    const e = k * k * (3 - 2 * k);
    o.copy(a.o).lerp(b.o, e);
    o.y += Math.sin(Math.PI * e) * 0.35;
    q.copy(a.q).slerp(b.q, e);
  }

  /** what a motorcycle on this vehicle's rack weighs on it: all of it, at the tray (its centre of gravity over it) */
  private loadsOn(v: ModVehicle): readonly CargoMass[] {
    const m = this.motoOn(v);
    const spot = m ? traySpot(v) : null;
    if (!m || !spot) return [];
    return [{ m: m.sys.derived.mass, x: spot.x, y: spot.y + m.sys.derived.cg.y, z: spot.z }];
  }

  // ------------------------------------------------------------------ the rack, to load and unload at

  /** the nearest motorcycle that could go up onto this rack, or why none */
  private motoNear(carrier: ModVehicle): { m: ModVehicle } | { why: Text } | null {
    const ctx = this.ctx!;
    const spot = traySpot(carrier);
    if (!spot) return null;
    const at = modelToWorld(carrier, this.poseNow(carrier), spot, this.v2);
    let best: ModVehicle | null = null;
    let bd = Infinity;
    for (const v of ctx.vehicles) {
      if (!v.view.frame.balance || v.carriedBy || v === carrier) continue;
      const d = Math.hypot(v.sim.px - at.x, v.sim.pz - at.z);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    if (!best || bd > NEAR_REACH) return null;
    if (bd > LOAD_REACH) return { why: T(`把${best.view.frame.name.zh}骑到车架旁边`, `Ride the ${best.view.frame.name.en} up to the rack`) };
    if (Math.abs(carrier.sim.kmh) > 1.5 || best === ctx.seated) return { why: T('先停车', 'Stop it first') };
    if (Math.abs(best.sim.kmh) > 1) return { why: T(`${best.view.frame.name.zh}还在动`, `The ${best.view.frame.name.en} is moving`) };
    if (best.sys.derived.mass > rackKg(carrier)) return { why: T(`${best.view.frame.name.zh}太重了`, `The ${best.view.frame.name.en} is too heavy`) };
    return { m: best };
  }

  private poseNow(v: ModVehicle): PoseQ {
    const s = v.sim;
    const p = this.pose;
    p.x = s.px;
    p.y = s.py;
    p.z = s.pz;
    p.qx = s.qx;
    p.qy = s.qy;
    p.qz = s.qz;
    p.qw = s.qw;
    return p;
  }

  /** the racks near: each vehicle's with a rack on it, to load at or unload */
  private near(at: { x: number; z: number }, r: number, out: GarageDevice[]): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const v of ctx.vehicles) {
      const spot = traySpot(v);
      if (!spot) continue;
      const c = modelToWorld(v, this.poseNow(v), { x: spot.x, y: spot.y + 0.35, z: spot.z }, this.v1);
      if (Math.hypot(c.x - at.x, c.z - at.z) > r + 1.2) continue;
      let d = this.devices.get(v);
      if (!d) {
        d = this.deviceFor(v);
        this.devices.set(v, d);
      }
      d.x = c.x;
      d.y = c.y;
      d.z = c.z;
      out.push(d);
    }
  }

  private deviceFor(carrier: ModVehicle): GarageDevice & { x: number; y: number; z: number } {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return {
      id: `moto-rack:${carrier.build.uid}`,
      x: 0,
      y: 0,
      z: 0,
      radius: 0.4,
      get word(): Text {
        const m = self.motoOn(carrier);
        if (m) return T(`卸下 ${m.view.frame.name.zh}`, `Take the ${m.view.frame.name.en} down`);
        const n = self.motoNear(carrier);
        return n && 'm' in n ? T(`装上 ${n.m.view.frame.name.zh}`, `Load the ${n.m.view.frame.name.en}`) : T('装上', 'Load');
      },
      get why(): Text | null {
        const m = self.motoOn(carrier);
        if (m) return Math.abs(carrier.sim.kmh) > 1.5 ? T('先停车', 'Stop it first') : self.rides.get(m)?.phase !== 'on' ? T('还没放稳', 'Not settled yet') : null;
        const n = self.motoNear(carrier);
        return n && 'why' in n ? n.why : null;
      },
      get state(): Text {
        const m = self.motoOn(carrier);
        return m ? T(`驮着${m.view.frame.name.zh}`, `Carrying the ${m.view.frame.name.en}`) : T('空着', 'Empty');
      },
      holdS: HOLD_S,
      hit(ray: THREE.Ray, reach: number): number | null {
        return self.hitRack(carrier, ray, reach);
      },
      use(): void {
        const ctx = self.ctx;
        if (!ctx) return;
        const m = self.motoOn(carrier);
        if (m) {
          if (Math.abs(carrier.sim.kmh) > 1.5) return;
          if (!self.unload(m)) {
            ctx.player.flashWhy('旁边放不下');
            return;
          }
          ctx.sound('ratchet_done', 0.7);
          ctx.ui.say(`卸下了${m.view.frame.name.zh}`, 1.8);
          return;
        }
        const n = self.motoNear(carrier);
        if (!n || !('m' in n)) return;
        if (self.load(n.m, carrier)) {
          ctx.sound('ratchet_done', 0.9);
          ctx.ui.say(`装上了${n.m.view.frame.name.zh}`, 1.8);
        }
      },
    };
  }

  /**
   * Where the line of sight (render space) meets the rack (its tray and mast; with a motorcycle on it, the motorcycle
   * too) within reach; null: it misses — or the rack is empty with no motorcycle near, when it is only the part it is
   * (taken off with the left button held, as any)
   */
  private hitRack(carrier: ModVehicle, ray: THREE.Ray, reach: number): number | null {
    const spot = traySpot(carrier);
    if (!spot) return null;
    const loaded = !!this.motoOn(carrier);
    if (!loaded && !this.motoNear(carrier)) return null;
    const model = carrier.view.model;
    model.updateMatrixWorld();
    this.ray.copy(ray).applyMatrix4(this.inv.copy(model.matrixWorld).invert());
    // (the tray across the back and the mast; loaded, the motorcycle standing on it)
    this.box.min.set(spot.x - (loaded ? 0.42 : 0.28), spot.y - 0.16, spot.z - (loaded ? 1.12 : 1.02));
    this.box.max.set(spot.x + (loaded ? 0.42 : 0.3), spot.y + (loaded ? 1.25 : 0.95), spot.z + (loaded ? 1.12 : 1.02));
    const p = this.ray.intersectBox(this.box, this.hitP) ?? (this.box.containsPoint(this.ray.origin) ? this.ray.origin : null);
    if (!p) return null;
    const d = p.distanceTo(this.ray.origin);
    return d <= reach + 0.3 ? d : null;
  }

  telemetry(): Record<string, unknown> {
    return { rides: [...this.rides].map(([m, r]) => `${m.build.uid}>${r.carrier.build.uid}:${r.phase}`), pending: this.pending.length, loads: this.loads, unloads: this.unloads };
  }

  readonly harness = {
    /** the motorcycle on a vehicle's rack and how it sits there (its origin in the carrier's model space, its heading against the carrier's) */
    state: (vi: number): Record<string, unknown> | null => {
      const ctx = this.ctx;
      const c = ctx?.vehicles[vi];
      if (!ctx || !c) return null;
      const m = this.motoOn(c);
      const spot = traySpot(c);
      if (!m || !spot) return { rack: !!spot, moto: null };
      this.poseOf(m, this.v1, this.q1);
      const s = c.sim;
      const cg = c.sys.derived.cg;
      const local = this.v1.clone().sub(this.v2.set(s.px, s.py, s.pz)).applyQuaternion(this.q2.set(s.qx, s.qy, s.qz, s.qw).invert()).add(new THREE.Vector3(cg.x, cg.y, cg.z));
      let rel = m.sim.yaw - s.yaw;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      return { rack: true, moto: ctx.vehicles.indexOf(m), phase: this.rides.get(m)?.phase, at: [local.x, local.y, local.z].map((x) => +x.toFixed(3)), tray: [spot.x, spot.y, spot.z], rel: +rel.toFixed(3), chaseBack: c.chaseBack };
    },
  };
}
