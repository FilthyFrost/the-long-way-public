/**
 * A vehicle's ladder and its roof (docs/V3/plan/growth.md §六 2, J9e; Nomad Drive's vehicle ladder and
 * player vehicle surface attachment):
 *
 *  - A ladder is the part 'ladder' on a frame's ladder mount (fitted from its blueprint: v3/blueprints), or the frame's
 *    own (the Whale's, up its back). It is climbed as the buildings' are — the ND climbing (v3/nd-climb, its rules
 *    core/v3/nd/climb.ts): walking into it facing it on a vehicle standing still takes hold of it, W and S go up and
 *    down it, past its head one is drawn onto the roof and let go; on the roof with one's back to it, walking on over
 *    the edge takes hold of it from above; Space lets go. This system is the climbing's source of those ladders, each
 *    as it stands now (core/modcar/ladders.ts: its line, where one is let go).
 *  - Up there one stands and walks on the roof (the boxes core/modcar/ladders.ts roofFloors gives: the roof, a rack's
 *    slats where one is on it) as on any floor — the walker's own walk, things on the rack within reach, Q puts what is
 *    in the hands on it; the vehicle's body box is cut below the roof for the walker meanwhile (a box-van's or a
 *    truck's body stands taller than its cab roof) and walls keep one out of what is no floor (the Rhino's tilt). One
 *    walks off an edge as off any: down beside the vehicle (6 m or more hurts: no roof is that high). Drawn onto the
 *    roof, the walk waits for the forward key to be let go (at most a second): held on from the climb, it would walk
 *    one straight off the other side of a car's roof.
 *  - Nobody gets into the vehicle from up there (no 上车 on its body: one climbs down first), so nobody drives it off
 *    with one on its roof. Should it move all the same (rolling off its handbrake, knocked), one is carried with it as on
 *    a moving floor (Nomad Drive's: its new pose times what it turned, on one's feet), and once it goes faster than a
 *    walk or tips over, one is put down on the ground beside its ladder.
 */
import * as THREE from 'three';
import type { System } from '../../../../core/kernel/systems';
import { bodyCut, floorAt, ladderLine, ladderSpot, LADDER_PART, LADDER_SPOTS, roofFloors, type LadderFloor, type LadderSpot, type RoofAsBuilt } from '../../../../core/modcar/ladders';
import { CLIMB } from '../../../../core/v3/nd/climb';
import { Solid, solidWithin, type SolidSource } from '../../../../core/world/solids';
import type { Action } from '../../hudItems';
import type { GameContext } from '../../kernel/context';
import type { ModVehicle } from '../../vehicle';
import type { LadderNow, LadderSource, NdClimb } from '../nd-climb/system';

/** a ladder is taken hold of on a vehicle standing still (km/h) */
const STILL_KMH = 1.5;
/** the ladders of the vehicles this near the walker are offered (m, past the vehicle's own half length) */
const NEAR = 5;
/** up on a roof that goes faster than a walk (km/h), or tips over further (rad): put down beside it */
const PUT_DOWN_KMH = 8;
const PUT_DOWN_TILT = 0.45;
/** drawn onto the roof, the walk waits this long at most for the forward key to be let go (s) */
const SETTLE_S = 1.0;
/** each roofed frame's lowest floor up there (model space, m): worked out once */
const LOWEST: ReadonlyMap<string, number> = new Map(Object.entries(LADDER_SPOTS).map(([id, s]) => [id, Math.min(...s.floors.map((f) => f.top))]));
/** below the lowest floor by this, one is down off the roof again (m) */
const DOWN = 0.5;

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

function simPose(v: ModVehicle, out: PoseQ): PoseQ {
  const s = v.sim;
  out.x = s.px;
  out.y = s.py;
  out.z = s.pz;
  out.qx = s.qx;
  out.qy = s.qy;
  out.qz = s.qz;
  out.qw = s.qw;
  return out;
}

/** up on a vehicle's roof (or on its ladder, going up or coming down) */
interface Up {
  v: ModVehicle;
  spot: LadderSpot;
  /** what one stands on there as built (model space), the roof mount's part they were made for, the body's cut */
  floors: LadderFloor[];
  roofPart: string;
  cut: number;
  /** its pose last frame: what it moved since, one is carried by */
  was: PoseQ;
  /** its body's box out of the walker's way (put back when one is down) */
  solidOut: boolean;
  /** the solids offered for it: the body cut below the roof, the floors, the walls */
  solids: Solid[];
}

/** a ladder as the climbing is told of it, kept per vehicle and brought up to date */
interface Now {
  key: string;
  name: string;
  foot: { x: number; y: number; z: number };
  head: { x: number; y: number; z: number };
  exit: { x: number; y: number; z: number };
  face: number;
  wood?: boolean;
}

export class VehicleLadders implements System<GameContext>, LadderSource, SolidSource {
  readonly id = 'ladder';
  readonly after = ['nd-climb'];
  readonly budget = { cpuMs: 0.1 };
  private ctx: GameContext | null = null;
  private up: Up | null = null;
  /** the key of the vehicle ladder one is on (the climbing's), null: none */
  private climbing: string | null = null;
  /** drawn onto the roof: the walk held there until the forward key is let go (s left) */
  private settle = 0;
  private readonly settleWords: readonly Action[] = [];
  private readonly settlePin = { x: 0, y: 0, z: 0, eye: 1.62, words: this.settleWords };
  private readonly nows = new Map<string, Now>();
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly q1 = new THREE.Quaternion();
  private readonly q2 = new THREE.Quaternion();
  private readonly qp = new THREE.Quaternion();
  private readonly vp = new THREE.Vector3();
  /** climbs onto a roof, put down off one (the probes') */
  private ups = 0;
  private putDowns = 0;

  constructor(private readonly climb: NdClimb) {}

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.climb.sources.push(this);
    // (the roof's floors, the body cut below them, the walls: the walker's only — ctx.addSolids would hand them to the
    // vehicles' own driving too)
    ctx.player.addSolids(this);
  }

  // ------------------------------------------------------------------ which vehicles have one

  /** has this vehicle a ladder one may climb: its frame's own, or the part on its ladder mount */
  static hasLadder(v: ModVehicle): boolean {
    const s = ladderSpot(v.view.frame.id);
    if (!s) return false;
    if (s.builtin) return true;
    const m = v.view.frame.mounts.find((x) => x.cat === 'ladder');
    return !!m && v.build.parts[m.id]?.part === LADDER_PART;
  }

  /** the roof mount as built (what is on it: a rack lifts the floor to its slats) */
  private static roofOf(v: ModVehicle): RoofAsBuilt | null {
    const m = v.view.frame.mounts.find((x) => x.cat === 'roof');
    const on = m ? v.build.parts[m.id] : undefined;
    return m && on ? { part: on.part, mountY: m.pos.y, fitH: m.fit?.[2] ?? 0.15 } : null;
  }

  /** what one stands on up on this vehicle as it is built now (model space) */
  static floorsOf(v: ModVehicle): LadderFloor[] {
    const s = ladderSpot(v.view.frame.id);
    return s ? roofFloors(s, VehicleLadders.roofOf(v)) : [];
  }

  // ------------------------------------------------------------------ the climbing's source

  ladders(out: LadderNow[]): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = ctx.player.walker;
    for (const v of ctx.vehicles) {
      if (v === ctx.seated || v.carriedBy || Math.abs(v.sim.kmh) > STILL_KMH) continue;
      if (Math.hypot(v.sim.px - w.x, v.sim.pz - w.z) > NEAR + v.sim.spec.body.halfLength) continue;
      if (!VehicleLadders.hasLadder(v)) continue;
      out.push(this.lineOf(v));
    }
  }

  /** a vehicle's ladder in the world now (its key: the vehicle's build) */
  private lineOf(v: ModVehicle): Now {
    const key = `veh:${v.build.uid}`;
    const spot = ladderSpot(v.view.frame.id)!;
    const ln = ladderLine(spot, VehicleLadders.floorsOf(v));
    let n = this.nows.get(key);
    if (!n) {
      n = { key, name: '梯子', foot: { x: 0, y: 0, z: 0 }, head: { x: 0, y: 0, z: 0 }, exit: { x: 0, y: 0, z: 0 }, face: 0 };
      this.nows.set(key, n);
    }
    const put = (local: { x: number; y: number; z: number }, into: { x: number; y: number; z: number }): void => {
      const o = this.worldOf(v, local.x, local.y, local.z, this.v1);
      into.x = o.x;
      into.y = o.y;
      into.z = o.z;
    };
    put(ln.foot, n.foot);
    put(ln.head, n.head);
    put(ln.exit, n.exit);
    // (the way one faces it: into the body, turned with the vehicle — a walker's heading faces (cos h, sin h))
    const b = this.v2.set(ln.face.x, 0, ln.face.z).applyQuaternion(this.q1.set(v.sim.qx, v.sim.qy, v.sim.qz, v.sim.qw));
    n.face = Math.atan2(b.z, b.x);
    return n;
  }

  private byKey(key: string): ModVehicle | null {
    return this.ctx?.vehicles.find((v) => `veh:${v.build.uid}` === key) ?? null;
  }

  took(key: string): void {
    this.climbing = key;
    const v = this.byKey(key);
    if (v) this.goUp(v);
  }

  left(key: string, how: 'head' | 'foot' | 'jump' | 'gone'): void {
    if (this.climbing === key) this.climbing = null;
    if (how !== 'head' || !this.ctx) return;
    // drawn onto the roof: there until the forward key is let go
    const w = this.ctx.player.walker;
    this.settle = SETTLE_S;
    this.settlePin.x = w.x;
    this.settlePin.y = w.y;
    this.settlePin.z = w.z;
    const n = this.nows.get(key);
    if (n) {
      this.settlePin.x = n.exit.x;
      this.settlePin.y = n.exit.y;
      this.settlePin.z = n.exit.z;
    }
    this.ctx.player.pin = this.settlePin;
    this.ups++;
  }

  // ------------------------------------------------------------------ up and down

  /** up on (or onto) this vehicle's roof: its body's box out of the walker's way, the roof's floors in */
  private goUp(v: ModVehicle): void {
    const ctx = this.ctx!;
    if (this.up?.v === v) return;
    if (this.up) this.comeDown();
    const spot = ladderSpot(v.view.frame.id);
    if (!spot) return;
    const floors = VehicleLadders.floorsOf(v);
    const n = floors.length + (spot.walls?.length ?? 0) + 1;
    this.up = {
      v,
      spot,
      floors,
      roofPart: v.build.parts.roof?.part ?? '',
      cut: bodyCut(floors),
      was: simPose(v, { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 }),
      solidOut: true,
      solids: Array.from({ length: n }, () => new Solid()),
    };
    this.placeSolids(this.up);
    ctx.player.removeSolids(v.solid);
    ctx.player.onRoof = v;
  }

  /** down off it: its body's box back in the walker's way (a vehicle gone from the world took its own with it) */
  private comeDown(): void {
    const ctx = this.ctx;
    const up = this.up;
    this.up = null;
    if (!ctx || !up) return;
    if (up.solidOut && ctx.vehicles.includes(up.v)) ctx.player.addSolids(up.v.solid);
    if (ctx.player.onRoof === up.v) ctx.player.onRoof = null;
  }

  /** the walker's feet in a vehicle's model space */
  private feetIn(v: ModVehicle, out: THREE.Vector3): THREE.Vector3 {
    const w = this.ctx!.player.walker;
    const s = v.sim;
    const cg = v.sys.derived.cg;
    this.q2.set(s.qx, s.qy, s.qz, s.qw).invert();
    return out.set(w.x - s.px, w.y - s.py, w.z - s.pz).applyQuaternion(this.q2).add(this.v2.set(cg.x, cg.y, cg.z));
  }

  /** standing on a vehicle's roof without having climbed there (a save taken up there, put there by a script) */
  private roofUnder(): ModVehicle | null {
    const ctx = this.ctx!;
    const w = ctx.player.walker;
    for (const v of ctx.vehicles) {
      if (v.carriedBy || Math.hypot(v.sim.px - w.x, v.sim.pz - w.z) > v.sim.spec.body.halfLength + 1) continue;
      const s = ladderSpot(v.view.frame.id);
      if (!s) continue;
      const f = this.feetIn(v, this.v1);
      // (well below its roof: on the ground beside it, nothing more to ask)
      if (f.y < (LOWEST.get(v.view.frame.id) ?? 0) - 0.3) continue;
      const y = floorAt(VehicleLadders.floorsOf(v), f.x, f.z);
      if (y !== null && f.y > y - 0.25 && f.y < y + 0.6) return v;
    }
    return null;
  }

  /** what it moved since the last frame, the walker moved with it (the feet and the heading) */
  private carry(up: Up): void {
    const ctx = this.ctx!;
    const s = up.v.sim;
    const was = up.was;
    if (was.x === s.px && was.y === s.py && was.z === s.pz && was.qx === s.qx && was.qy === s.qy && was.qz === s.qz && was.qw === s.qw) return;
    const w = ctx.player.walker;
    const q0 = this.q1.set(was.qx, was.qy, was.qz, was.qw);
    const turn = this.q2.set(s.qx, s.qy, s.qz, s.qw).multiply(q0.invert());
    const p = this.v1.set(w.x - was.x, w.y - was.y, w.z - was.z).applyQuaternion(turn);
    w.x = s.px + p.x;
    w.y = s.py + p.y;
    w.z = s.pz + p.z;
    // (the heading only: the view is not tipped with the vehicle)
    const yaw0 = Math.atan2(-2 * (was.qx * was.qz - was.qw * was.qy), 1 - 2 * (was.qy * was.qy + was.qz * was.qz));
    ctx.input.lookYaw -= s.yaw - yaw0;
    simPose(up.v, was);
  }

  /** put down on the ground beside its ladder (it drove off, it tipped) */
  private putDown(up: Up): void {
    const ctx = this.ctx!;
    const ln = ladderLine(up.spot, up.floors);
    const p = this.worldOf(up.v, ln.foot.x, 0, ln.foot.z, this.v1);
    const w = ctx.player.walker;
    if (ctx.player.pin === this.settlePin) ctx.player.pin = null;
    this.settle = 0;
    w.place(p.x, p.z, w.heading, 4);
    this.comeDown();
    this.putDowns++;
    ctx.sound('land', 0.5);
  }

  // ------------------------------------------------------------------ every frame

  preStep(dt: number, ctx: GameContext): void {
    // (in a seat: off any roof)
    if (ctx.seated) {
      if (this.up) this.comeDown();
      this.climbing = null;
      if (ctx.player.pin === this.settlePin) ctx.player.pin = null;
      this.settle = 0;
      ctx.player.onRoof = null;
      return;
    }
    if (!this.up && !this.climbing) {
      const v = this.roofUnder();
      if (v) this.goUp(v);
    }
    const up = this.up;
    if (up) {
      // (gone from the world: its body's box went with it)
      if (!ctx.vehicles.includes(up.v)) {
        up.solidOut = false;
        this.comeDown();
      } else {
        // (the roof as built now: a rack fitted, taken off)
        const part = up.v.build.parts.roof?.part ?? '';
        if (part !== up.roofPart) {
          up.roofPart = part;
          up.floors = VehicleLadders.floorsOf(up.v);
          up.cut = bodyCut(up.floors);
        }
        if (!this.climbing) {
          this.carry(up);
          const s = up.v.sim;
          if (Math.abs(s.kmh) > PUT_DOWN_KMH || Math.abs(s.pitch) > PUT_DOWN_TILT || Math.abs(s.roll) > PUT_DOWN_TILT) this.putDown(up);
          else if (this.feetIn(up.v, this.v1).y < up.cut + 0.03 - DOWN) this.comeDown();
        } else simPose(up.v, up.was);
        if (this.up) this.placeSolids(this.up);
      }
    }
    ctx.player.onRoof = this.up?.v ?? null;
    // drawn onto the roof: held there until the forward key is let go (or a second has gone)
    if (this.settle > 0) {
      this.settle -= dt;
      if (ctx.player.pin !== this.settlePin) this.settle = 0;
      else if (this.settle <= 0 || ctx.input.walk.forward < 0.2) {
        this.settle = 0;
        ctx.player.pin = null;
      }
    }
  }

  // ------------------------------------------------------------------ the walker's solids while up there

  /** a point of a vehicle's model (frame model space) in the world, as it stands (its sim pose; allocates nothing) */
  private worldOf(v: ModVehicle, x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    const s = v.sim;
    const cg = v.sys.derived.cg;
    return out.set(x - cg.x, y - cg.y, z - cg.z).applyQuaternion(this.qp.set(s.qx, s.qy, s.qz, s.qw)).add(this.vp.set(s.px, s.py, s.pz));
  }

  /**
   * The solids up there, as the vehicle stands this frame (worked out once a frame, handed out to the walker as they are):
   * the body's box cut below what one stands on, the floors (from the cut up: what is between them and the body is solid),
   * the walls
   */
  private placeSolids(up: Up): void {
    const v = up.v;
    const sd = v.solid.update();
    const tag = v.sim.spec.id;
    let k = 0;
    const cutY = this.worldOf(v, 0, up.cut, 0, this.v1).y;
    up.solids[k++].set(sd.x, sd.z, sd.hx, sd.hz, sd.yaw, sd.y0, Math.max(sd.y0 + 0.05, cutY), false, tag);
    for (const f of up.floors) {
      const cx = (f.along[0] + f.along[1]) / 2;
      const cz = (f.across[0] + f.across[1]) / 2;
      const top = this.worldOf(v, cx, f.top, cz, this.v1);
      const bottom = this.worldOf(v, cx, up.cut, cz, this.v2).y;
      up.solids[k++].set(top.x, top.z, (f.along[1] - f.along[0]) / 2, (f.across[1] - f.across[0]) / 2, sd.yaw, Math.min(bottom, top.y - 0.05), top.y, true, tag);
    }
    for (const wl of up.spot.walls ?? []) {
      const cx = (wl.along[0] + wl.along[1]) / 2;
      const cz = (wl.across[0] + wl.across[1]) / 2;
      const lo = this.worldOf(v, cx, wl.height[0], cz, this.v1);
      const hi = this.worldOf(v, cx, wl.height[1], cz, this.v2).y;
      up.solids[k++].set(lo.x, lo.z, (wl.along[1] - wl.along[0]) / 2, (wl.across[1] - wl.across[0]) / 2, sd.yaw, lo.y, hi, false, tag);
    }
  }

  solidsNear(x: number, z: number, r: number, out: Solid[]): void {
    const up = this.up;
    if (!up) return;
    for (let i = 0; i < up.solids.length; i++) if (solidWithin(up.solids[i], x, z, r)) out.push(up.solids[i]);
  }

  // ------------------------------------------------------------------ the probes'

  telemetry(): Record<string, unknown> {
    return { up: this.up?.v.build.frame ?? null, climbing: this.climbing, ups: this.ups, putDowns: this.putDowns };
  }

  readonly harness = {
    /** up on a roof now: which, on its ladder, the feet in its model space, the floor under them, standing on it */
    state: (): Record<string, unknown> => {
      const ctx = this.ctx;
      const up = this.up;
      const w = ctx?.player.walker;
      const f = up && ctx ? this.feetIn(up.v, new THREE.Vector3()) : null;
      return {
        up: up?.v.build.frame ?? null,
        upIndex: up && ctx ? ctx.vehicles.indexOf(up.v) : -1,
        climbing: this.climbing,
        settle: this.settle,
        feet: f ? [+f.x.toFixed(3), +f.y.toFixed(3), +f.z.toFixed(3)] : null,
        floor: f && up ? floorAt(up.floors, f.x, f.z) : null,
        onFloor: !!w?.onFloor,
        floorTag: w?.floorTag ?? '',
        onRoof: ctx?.player.onRoof?.build.frame ?? null,
        ups: this.ups,
        putDowns: this.putDowns,
        stand: CLIMB.standOff,
      };
    },
    /** a vehicle's ladder in the world now (null: none to climb): the feet's line, where one is let go, the way one faces it */
    ladder: (vi: number): { foot: number[]; head: number[]; exit: number[]; face: number } | null => {
      const v = this.ctx?.vehicles[vi];
      if (!v || !VehicleLadders.hasLadder(v)) return null;
      const n = this.lineOf(v);
      return { foot: [n.foot.x, n.foot.y, n.foot.z], head: [n.head.x, n.head.y, n.head.z], exit: [n.exit.x, n.exit.y, n.exit.z], face: n.face };
    },
    /** what one stands on up on a vehicle as built (model space) */
    floors: (vi: number): LadderFloor[] => {
      const v = this.ctx?.vehicles[vi];
      return v ? VehicleLadders.floorsOf(v) : [];
    },
  };

  dispose(): void {
    const ctx = this.ctx;
    this.comeDown();
    if (ctx) {
      ctx.player.removeSolids(this);
      const i = this.climb.sources.indexOf(this);
      if (i >= 0) this.climb.sources.splice(i, 1);
    }
  }
}
