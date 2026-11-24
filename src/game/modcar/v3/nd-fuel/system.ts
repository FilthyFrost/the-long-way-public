/**
 * The ND filling station's pump in the game (docs/ND/PLAN.md, ND5; its rules: core/v3/nd/fuel.ts, as Nomad Drive's
 * gas pump body, gas pump nozzle and nozzle holster have them):
 *
 *  - A station's pump (drawn by nd-build: tools/blender/nd/station.py) is a device the mark finds. With a hand free, E
 *    takes its nozzle off the holster into it (the item nd_nozzle, its hose drawn after it from the pump); with the
 *    nozzle in the hands, E on the pump hangs it back.
 *  - Held to a vehicle's filler (its flap opens) or to a jerrycan lying about, the nozzle goes into it; the right
 *    button held runs the pump's fuel into it, two litres a second, for nothing, as long as there is any and there is
 *    room. A vehicle that burns the other fuel is not given it (a can takes either, empty).
 *  - Put down, put away, swapped for the other hand, taken into a vehicle's seat or more than eight metres from its
 *    holster, the nozzle is back on its holster (a nozzle found anywhere it should not be goes back too).
 *  - What each pump has left is kept (the save's slice `nd-fuel`): fifty litres at most, never filled again.
 */
import * as THREE from 'three';
import type { System } from '../../../../core/kernel/systems';
import type { SaveSlice } from '../../../../core/kernel/slices';
import type { FuelType, Text } from '../../../../core/modcar/types';
import { pumpInto, tankRoomOf, TOOL_INFO } from '../../../../core/modcar/tools';
import { ND_BUILDINGS } from '../../../../core/v3/nd/cards';
import { ND_FUEL, hoseLength, pumpFound, pumpFuel, runFor } from '../../../../core/v3/nd/fuel';
import { ND_NOZZLE } from '../../../../core/v3/nd/items';
import type { Site } from '../../../../core/world/sites';
import type { GarageDevice } from '../../garageStub';
import type { Action } from '../../hudItems';
import type { GameContext } from '../../kernel/context';
import type { InteractSource, PlanPoint } from '../../kernel/interact';
import type { Loose } from '../../loose';
import type { HandsUse, Held } from '../../player';
import type { ModVehicle } from '../../vehicle';
import { boxHit, markerOf, modelOf, type PartBox } from '../../nd/kit';
import type { BuildingWatch, NdBuildings } from '../nd-build/system';

const T = (zh: string, en: string): Text => ({ zh, en });
const FUEL_ZH: Record<FuelType, string> = { petrol: '汽油', diesel: '柴油', mix2t: '混合油' };
const UP = new THREE.Vector3(0, 1, 0);
/** a jerrycan lying about: the box the mark finds it by and its mouth (its model's frame, as held.ts has its spout) */
const CAN_BOX: PartBox = { min: [-0.11, 0, -0.22], max: [0.11, 0.52, 0.22] };
const CAN_MOUTH = new THREE.Vector3(0, 0.478, 0.13);
/** where on the held nozzle's model its tip and its hose's end are, if its markers are not found (its own frame) */
const SPOUT_AT = new THREE.Vector3(0.223, 0.072, 0);
const HOSE_AT = new THREE.Vector3(-0.21, 0.086, 0);
/** the fuel run into a vehicle is told to it this often while it runs (its systems rebuilt: the gauge moves) (s) */
const TELL_S = 0.5;

interface Pump {
  site: Site;
  root: THREE.Group;
  /** the nozzle on its holster (the model's N_nozzle): hidden while it is out */
  nozzle: THREE.Object3D | null;
  /** the holster, the hose's root at the pump, the hanging nozzle's hose end (the building's frame) */
  rest: THREE.Vector3;
  root0: THREE.Vector3;
  hangEnd: THREE.Vector3;
  /** the forecourt's level under it (the building's frame) */
  floor: number;
  /** the pump's own box for the mark (the building's frame) */
  box: PartBox;
  fuel: FuelType;
  device: GarageDevice;
  /** the hose: its material (the model's own rubber), its mesh, whether it is drawn hanging as it is, its ends as last drawn */
  hoseMat: THREE.Material | null;
  hoseMask: boolean;
  tube: THREE.Mesh | null;
  hung: boolean;
  ends: THREE.Vector3[];
}

type Into = { kind: 'filler'; v: ModVehicle } | { kind: 'can'; l: Loose };

interface Out {
  pump: Pump;
  uid: string;
  into: Into | null;
  /** litres run since the button went down; whether it was down last frame; till the vehicle is told */
  run: number;
  running: boolean;
  tell: number;
}

interface Saved {
  /** what each pump has left (L), by its place */
  pumps?: Record<string, number>;
}

export class NdFuel implements System<GameContext>, InteractSource, BuildingWatch {
  readonly id = 'nd-fuel';
  readonly budget = { cpuMs: 0.2 };
  private ctx: GameContext | null = null;
  private readonly pumps = new Map<string, Pump>();
  /** what the pumps one has drawn from have left (L) */
  private readonly left = new Map<string, number>();
  private out: Out | null = null;
  /** all run so far (the probes') */
  private given = 0;
  private sweepT = 0;
  /** swept every frame for a while after the nozzle went back (a thing put down lands after it has left the hands) */
  private sweepSoon = 0;
  private readonly ray = new THREE.Ray();
  private readonly va = new THREE.Vector3();
  private readonly vb = new THREE.Vector3();
  private readonly vc = new THREE.Vector3();
  private readonly mouth = new THREE.Vector3();
  private readonly outN = new THREE.Vector3();
  private readonly qa = new THREE.Quaternion();
  private readonly ma = new THREE.Matrix4();
  private readonly pinPos = new THREE.Vector3();
  private readonly pinQ = new THREE.Quaternion();
  private pinned = false;

  constructor(private readonly buildings: NdBuildings) {
    buildings.watchers.push(this);
  }

  readonly slice: SaveSlice<Saved> = {
    id: 'nd-fuel',
    version: 1,
    snapshot: () => {
      if (!this.left.size) return undefined;
      const pumps: Record<string, number> = {};
      for (const [k, v] of [...this.left].sort((x, y) => (x[0] < y[0] ? -1 : 1))) pumps[k] = Math.round(v * 1000) / 1000;
      return { pumps };
    },
    restore: (d) => {
      this.left.clear();
      for (const [k, v] of Object.entries(d.pumps ?? {})) if (typeof v === 'number' && Number.isFinite(v)) this.left.set(k, Math.max(0, Math.min(ND_FUEL.litres, v)));
    },
    clear: () => this.left.clear(),
  };

  /** the nozzle in the hands: held to a filler, the right button runs the pump */
  readonly hands: HandsUse = {
    id: 'nd-fuel',
    claims: (h) => isNozzle(h),
    takesF: (h) => isNozzle(h),
    press: (h, from) => this.press(h, from),
    step: (h, dt, f) => this.handStep(h, dt, f),
    words: (h) => this.words(h),
    gone: () => this.hang('gone'),
  };

  init(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.player.hands?.push(this.hands);
  }

  // ------------------------------------------------------------------ the stations, as nd-build draws them

  dressed(site: Site, model: THREE.Object3D, root: THREE.Group): void {
    const nozzle = model.getObjectByName('N_nozzle') ?? null;
    const holster = model.getObjectByName('M_holster');
    if (!holster) return;
    const at = (name: string, fb: THREE.Vector3): THREE.Vector3 => {
      const o = model.getObjectByName(name);
      if (!o) return fb.clone();
      root.updateMatrixWorld(true);
      return root.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
    };
    const rest = at('M_holster', new THREE.Vector3());
    const root0 = at('M_hose', rest.clone().add(new THREE.Vector3(0, 0.2, 0)));
    const hangEnd = at('M_hosein', rest.clone().add(new THREE.Vector3(0, 0.2, 0)));
    // (the pump's cabinet behind its holster, the nozzle hanging on it: Blender's +Y is the building's -z)
    const c = { x: rest.x, y: rest.y - 0.32, z: rest.z + 0.305 };
    const box: PartBox = { min: [c.x - 0.36, c.y - 0.84, c.z - 0.5], max: [c.x + 0.36, c.y + 0.84, c.z + 0.32] };
    // (the hose drawn in the model's own rubber, as the nozzle's end of it is)
    let hoseMat: THREE.Material | null = null;
    let hoseMask = false;
    nozzle?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (hoseMat || !m.isMesh) return;
      const names = (m.userData.mat as string[] | undefined) ?? [];
      const k = names.indexOf('rubber');
      if (k < 0) return;
      hoseMat = Array.isArray(m.material) ? m.material[k] : m.material;
      hoseMask = m.geometry.hasAttribute('aMaskUv');
    });
    const ws = this.ctx?.world?.seed ?? 0;
    const p: Pump = {
      site,
      root,
      nozzle,
      rest,
      root0,
      hangEnd,
      // (the forecourt: its plinth under the shop's floor, the building's frame's zero)
      floor: -(ND_BUILDINGS[site.prefab]?.geo.plinth ?? 0),
      box,
      fuel: pumpFuel(site.seed, ws),
      device: null as unknown as GarageDevice,
      hoseMat,
      hoseMask,
      tube: null,
      hung: false,
      ends: [new THREE.Vector3(Infinity, 0, 0), new THREE.Vector3()],
    };
    p.device = this.pumpDevice(p);
    this.pumps.set(site.id, p);
    // (a nozzle out when its station comes back into view: it was this one's)
    if (this.out?.pump.site.id === site.id) this.out.pump = p;
    if (nozzle) nozzle.visible = this.out?.pump.site.id !== site.id;
  }

  dropped(site: string): void {
    const p = this.pumps.get(site);
    if (!p) return;
    if (this.out?.pump === p) this.hang('far');
    p.tube?.geometry.dispose();
    p.tube?.removeFromParent();
    this.pumps.delete(site);
  }

  /** what a pump has left (L) */
  private litres(p: Pump): number {
    return this.left.get(p.site.id) ?? pumpFound(p.site.seed, this.ctx?.world?.seed ?? 0);
  }

  private pumpDevice(p: Pump): GarageDevice {
    const sys = this;
    const world = (): THREE.Vector3 => {
      p.root.updateMatrixWorld(true);
      const o = sys.ctx!.core.origin;
      return p.root.localToWorld(sys.vc.copy(p.rest)).add(sys.va.set(o.x, o.y, o.z));
    };
    const w0 = world();
    return {
      id: `nd-fuel:${p.site.id}`,
      x: w0.x,
      y: w0.y,
      z: w0.z,
      radius: 0.6,
      get word(): Text {
        const l = sys.litres(p);
        void l;
        return T('拿起油枪', 'Take the nozzle');
      },
      // (pressing does nothing: why, said when pressed)
      get why(): Text | null {
        if (sys.out?.pump === p) return T('油枪在你手上', 'The nozzle is in your hand');
        return sys.litres(p) > 0.05 ? null : T('没油了', 'The pump is dry');
      },
      get state(): Text {
        return T(`${FUEL_ZH[p.fuel]} ${sys.litres(p).toFixed(1)} / ${ND_FUEL.litres} L`, `${sys.litres(p).toFixed(1)} / ${ND_FUEL.litres} L of ${p.fuel}`);
      },
      use: () => sys.take(p),
      take: (held) => (isNozzle(held) && sys.out?.pump === p ? { ok: true, word: T('挂回油枪', 'Hang the nozzle back'), keep: true } : isNozzle(held) ? null : { ok: false, word: T('先空出一只手', 'A hand free to take the nozzle') }),
      useWith: (held) => {
        if (isNozzle(held)) sys.hang('back');
      },
      hit: (ray, reach) => boxHit(p.root, ray, p.box, reach),
    };
  }

  near(at: PlanPoint, r: number, out: GarageDevice[]): void {
    for (const p of this.pumps.values()) {
      const d = p.device;
      const dx = d.x - at.x;
      const dz = d.z - at.z;
      const rr = r + 1.2;
      if (dx * dx + dz * dz <= rr * rr) out.push(d);
    }
  }

  // ------------------------------------------------------------------ the nozzle off its holster and back

  /** E on the pump with a hand free: its nozzle into it */
  private take(p: Pump): void {
    const ctx = this.ctx!;
    if (this.out) return;
    if (ctx.player.held) {
      ctx.player.flashWhy('先空出一只手');
      return;
    }
    const uid = `nd-nozzle-${p.site.id}`;
    const left = ctx.player.receive({ kind: 'item', item: { uid, item: ND_NOZZLE } });
    if (left > 0) {
      ctx.player.flashWhy('手满了');
      return;
    }
    this.out = { pump: p, uid, into: null, run: 0, running: false, tell: 0 };
    if (p.nozzle) p.nozzle.visible = false;
    p.hung = false;
    ctx.sound('pump_lift');
  }

  /** the nozzle back on its holster, from wherever it went (the hands, the ground, a vehicle) */
  private hang(why: 'back' | 'gone' | 'far' | 'seat'): void {
    const o = this.out;
    if (!o) return;
    const ctx = this.ctx!;
    this.out = null;
    this.unpin();
    this.finishRun(o);
    this.sweep(o.uid);
    if (o.pump.nozzle) o.pump.nozzle.visible = true;
    o.pump.hung = false;
    this.sweepSoon = 1;
    ctx.sound('pump_hang');
    if (why === 'far') ctx.player.flashWhy('油管够不着了');
  }

  /** a nozzle out of its place: out of the hands' slots and off the ground (the one out now spared) */
  private sweep(uid: string | null, keep: string | null = null): void {
    const ctx = this.ctx!;
    const pl = ctx.player as unknown as { slots: Held[] };
    for (let i = 0; i < pl.slots.length; i++) {
      const h = pl.slots[i];
      if (h?.kind === 'item' && h.item.item === ND_NOZZLE && h.item.uid !== keep && (uid === null || h.item.uid === uid)) pl.slots[i] = null;
    }
    for (const l of [...ctx.loose.list]) if (l.item?.item === ND_NOZZLE && l.item.uid !== keep && (uid === null || l.item.uid === uid)) ctx.loose.remove(l);
  }

  // ------------------------------------------------------------------ the nozzle in the hands

  private press(h: NonNullable<Held>, from: 'key' | 'mouse'): boolean {
    if (!isNozzle(h)) return false;
    // (the left button does nothing with it; E is the game's — the pump's device hangs it back — but not while it is
    // in a filler: it would put the nozzle away into the vehicle it is in)
    return from === 'mouse' || !!this.out?.into;
  }

  private handStep(h: NonNullable<Held>, dt: number, f: boolean): void {
    const ctx = this.ctx!;
    const o = this.out;
    if (!o || h.kind !== 'item' || h.item.uid !== o.uid) {
      // (a nozzle that is no pump's: back where it came from)
      this.sweep(h.kind === 'item' ? h.item.uid : null, o?.uid ?? null);
      return;
    }
    const p = o.pump;
    // too far from its holster: pulled back onto it
    p.root.updateMatrixWorld(true);
    const org = ctx.core.origin;
    const hw = p.root.localToWorld(this.va.copy(p.rest));
    const eye = ctx.player.eye;
    const ex = eye.x - org.x;
    const ez = eye.z - org.z;
    if (Math.hypot(ex - hw.x, ez - hw.z) > ND_FUEL.tether) {
      this.hang('far');
      return;
    }
    // what it is held to: a vehicle's filler, a jerrycan's mouth
    this.ray.origin.set(ex, eye.y - org.y, ez);
    this.ray.direction.set(ctx.player.dir.x, ctx.player.dir.y, ctx.player.dir.z).normalize();
    const into = this.aim(o.into);
    if (!sameInto(into, o.into)) {
      this.finishRun(o);
      if (into) ctx.sound('pump_lift', 0.5);
    }
    o.into = into;
    if (into && this.mouthOf(into, this.mouth, this.outN)) {
      if (into.kind === 'filler') into.v.view.capOpen = true;
      this.pinTo(this.mouth, this.outN);
    } else this.unpin();
    // the right button held: it runs
    const can = into ? this.canRun(p, into) : { ok: false };
    if (f && into && can.ok) {
      const room = this.room(into);
      const l = runFor(dt, this.litres(p), room);
      if (l > 0) {
        this.give(into, p.fuel, l);
        this.left.set(p.site.id, Math.max(0, this.litres(p) - l));
        o.run += l;
        this.given += l;
        o.tell += dt;
        if (o.tell >= TELL_S && into.kind === 'filler') {
          o.tell = 0;
          into.v.sys.rebuild();
          into.v.awake = 1;
        }
        ctx.sound('pump_run');
        o.running = true;
        if (this.litres(p) <= 0.01) {
          ctx.sound('pump_dry');
          this.finishRun(o, '加油机没油了');
        } else if (this.room(into) <= 0.01) {
          ctx.sound('pump_click');
          this.finishRun(o, into.kind === 'filler' ? '加满了' : '油桶满了');
        }
      }
    } else if (o.running) {
      ctx.sound('pump_click');
      this.finishRun(o);
    }
  }

  /** a run over: told to the vehicle, said how much went in */
  private finishRun(o: Out, why = ''): void {
    if (!o.running && o.run <= 0) return;
    if (o.into?.kind === 'filler') {
      o.into.v.sys.rebuild();
      o.into.v.awake = 1;
    }
    if (o.run > 0.05) this.ctx?.ui.say(`加了 ${o.run.toFixed(1)} L${why ? ` · ${why}` : ''}`, 2.2);
    o.run = 0;
    o.running = false;
    o.tell = 0;
  }

  /** the filler or the can the line of sight meets within reach (the one held to kept a little further) */
  private aim(was: Into | null): Into | null {
    const ctx = this.ctx!;
    let best: Into | null = null;
    let bd = Infinity;
    const org = ctx.core.origin;
    const ex = ctx.player.eye.x;
    const ez = ctx.player.eye.z;
    for (const v of ctx.vehicles) {
      if (Math.hypot(v.sim.px - ex, v.sim.pz - ez) > 8) continue;
      const keep = was?.kind === 'filler' && was.v === v ? 0.35 : 0;
      const d = v.view.fillerHit('fuel', this.ray, ND_FUEL.reach + keep);
      if (d !== null && d < bd) {
        bd = d;
        best = { kind: 'filler', v };
      }
    }
    for (const l of ctx.loose.list) {
      if (l.tool?.kind !== 'jerrycan' || l.riding) continue;
      void org;
      if (Math.hypot(l.x - ex, l.z - ez) > 3) continue;
      const keep = was?.kind === 'can' && was.l === l ? 0.35 : 0;
      const obj = modelOf(l) ?? l.obj;
      obj.updateWorldMatrix(true, false);
      const d = boxHit(obj, this.ray, CAN_BOX, ND_FUEL.reach + 0.4 + keep);
      if (d !== null && d < bd) {
        bd = d;
        best = { kind: 'can', l };
      }
    }
    return best;
  }

  /** the mouth it goes into and the way out of it (render space) */
  private mouthOf(into: Into, m: THREE.Vector3, n: THREE.Vector3): boolean {
    if (into.kind === 'filler') return into.v.view.fillerMouth('fuel', m, n);
    const obj = modelOf(into.l) ?? into.l.obj;
    obj.updateWorldMatrix(true, false);
    obj.localToWorld(m.copy(CAN_MOUTH));
    n.copy(UP).transformDirection(obj.matrixWorld);
    return true;
  }

  /** whether it can run into it now, and why not */
  private canRun(p: Pump, into: Into): { ok: boolean; why?: string } {
    if (this.litres(p) <= 0.01) return { ok: false, why: '加油机没油了' };
    if (into.kind === 'filler') {
      const burns = into.v.sys.derived.engine?.engine?.fuel as FuelType | undefined;
      if (burns && burns !== p.fuel) return { ok: false, why: `这车烧${FUEL_ZH[burns]}` };
      if (this.room(into) <= 0.01) return { ok: false, why: '油箱满了' };
      return { ok: true };
    }
    const t = into.l.tool!;
    if ((t.litres ?? 0) > 0.01 && (t.fuel ?? 'petrol') !== p.fuel) return { ok: false, why: `桶里是${FUEL_ZH[t.fuel ?? 'petrol']}` };
    if (this.room(into) <= 0.01) return { ok: false, why: '油桶满了' };
    return { ok: true };
  }

  private room(into: Into): number {
    if (into.kind === 'filler') return tankRoomOf(into.v.build) ?? 0;
    return Math.max(0, TOOL_INFO.jerrycan.capacity - (into.l.tool!.litres ?? 0));
  }

  private give(into: Into, fuel: FuelType, l: number): void {
    if (into.kind === 'filler') {
      pumpInto(into.v.build, fuel, l);
      return;
    }
    const t = into.l.tool!;
    t.fuel = fuel;
    t.litres = Math.min(TOOL_INFO.jerrycan.capacity, (t.litres ?? 0) + l);
  }

  /** the nozzle in the hands put into a mouth: its tip a little way in, its spout along the way in, its grip up */
  private pinTo(mouth: THREE.Vector3, out: THREE.Vector3): void {
    const ctx = this.ctx!;
    const model = ctx.heldThing.model;
    const at = markerOf(model, 'M_spout', SPOUT_AT);
    const into = this.vb.copy(out).normalize().negate();
    // (its grip up: the world's up off the way in; into a mouth that faces up, back towards the one holding it)
    const up = this.vc.copy(UP);
    if (Math.abs(into.dot(up)) > 0.85) up.set(-ctx.player.dir.x, 0, -ctx.player.dir.z).normalize();
    up.addScaledVector(into, -up.dot(into)).normalize();
    const side = this.va.crossVectors(into, up).normalize();
    this.ma.makeBasis(into, up, side);
    this.pinQ.setFromRotationMatrix(this.ma);
    this.pinPos.copy(mouth).addScaledVector(into, 0.03);
    ctx.heldThing.pinFor({ pos: this.pinPos, q: this.pinQ, at });
    this.pinned = true;
  }

  private unpin(): void {
    if (!this.pinned) return;
    this.ctx?.heldThing.pinFor(null);
    this.pinned = false;
  }

  private words(h: NonNullable<Held>): Action[] {
    const o = this.out;
    const F: Action['keys'] = ['F', 'RMB'];
    if (!o || h.kind !== 'item' || h.item.uid !== o.uid) return [{ keys: ['Q'], text: '挂回去', off: true, why: '挂回加油机' }];
    const p = o.pump;
    const left = this.litres(p);
    const acts: Action[] = [];
    void left;
    if (!o.into) acts.push({ keys: F, hold: true, text: '加油', off: true, why: '对着加油口' });
    else {
      const can = this.canRun(p, o.into);
      const what = o.into.kind === 'filler' ? o.into.v.view.frame.name.zh : '油桶';
      const room = this.room(o.into);
      void room;
      if (!can.ok) acts.push({ keys: F, hold: true, text: '加油', off: true, why: can.why ?? '加不进去' });
      else acts.push({ keys: F, hold: true, text: `加${FUEL_ZH[p.fuel]} <b>${what}</b>` });
    }
    acts.push({ keys: ['Q'], text: '挂回去' });
    return acts;
  }

  // ------------------------------------------------------------------ the frame: the nozzle where it should be, the hoses

  lateUpdate(dt: number, ctx: GameContext): void {
    const o = this.out;
    if (o) {
      const held = ctx.player.held;
      // (taken into a seat, or out of the hands any other way: back on its holster)
      if (ctx.seated) this.hang('seat');
      else if (!held || held.kind !== 'item' || held.item.uid !== o.uid) this.hang('gone');
    }
    // (a nozzle somewhere it should not be — a save made with one in the hands — goes back)
    this.sweepSoon = Math.max(0, this.sweepSoon - dt);
    if ((this.sweepT -= dt) <= 0 || this.sweepSoon > 0) {
      this.sweepT = 1;
      this.sweep(null, this.out?.uid ?? null);
    }
    for (const p of this.pumps.values()) this.drawHose(p, ctx);
  }

  /** a pump's hose: hanging to its nozzle on the holster, or after it to the hands, sagging as long as it is */
  private drawHose(p: Pump, ctx: GameContext): void {
    const out = this.out?.pump === p;
    if (!out && p.hung) return;
    p.root.updateMatrixWorld(true);
    const a = p.root.localToWorld(this.va.copy(p.root0));
    let b: THREE.Vector3;
    if (out) {
      const model = ctx.heldThing.model;
      if (!model) return;
      model.updateWorldMatrix(true, false);
      b = model.localToWorld(markerOf(model, 'M_hosein', HOSE_AT));
    } else b = p.root.localToWorld(this.vb.copy(p.hangEnd));
    // (drawn again only when an end has moved: in the building's frame, as the floating origin moves the world)
    const la = p.root.worldToLocal(a.clone());
    const lb = p.root.worldToLocal(b.clone());
    if (p.ends[0].distanceToSquared(la) < 1e-5 && p.ends[1].distanceToSquared(lb) < 1e-5) {
      p.hung = !out;
      return;
    }
    p.ends[0].copy(la);
    p.ends[1].copy(lb);
    const floor = p.root.localToWorld(this.vc.set(p.rest.x, p.floor + 0.03, p.rest.z)).y;
    const d = a.distanceTo(b);
    const len = hoseLength(d);
    // (a parabola as long as the hose: sag s over a span d has length about d + 8s²/3d)
    const s = Math.sqrt(Math.max(0, (3 * d * (len - d)) / 8));
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const q = new THREE.Vector3().lerpVectors(a, b, t);
      q.y = Math.max(floor, q.y - s * 4 * t * (1 - t));
      pts.push(q);
    }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, 0.016, 6, false);
    // (the attributes the place's materials read: no baked shadow, no grime mask)
    const n = geo.getAttribute('position').count;
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    if (p.hoseMask) geo.setAttribute('aMaskUv', new THREE.Float32BufferAttribute(new Float32Array(n * 2).fill(-1), 2));
    // (in the building's frame, under its root)
    const inv = this.ma.copy(p.root.matrixWorld).invert();
    geo.applyMatrix4(inv);
    if (!p.tube) {
      p.tube = new THREE.Mesh(geo, p.hoseMat ?? new THREE.MeshBasicMaterial({ color: 0x232427 }));
      p.tube.name = 'nd-fuel:hose';
      p.tube.frustumCulled = false;
      p.root.add(p.tube);
    } else {
      p.tube.geometry.dispose();
      p.tube.geometry = geo;
    }
    p.hung = !out;
  }

  // ------------------------------------------------------------------ the probes'

  telemetry(): Record<string, unknown> {
    return { pumps: this.pumps.size, out: this.out ? this.out.pump.site.id : null, into: this.out?.into?.kind ?? null, given: Math.round(this.given * 100) / 100 };
  }

  readonly harness = {
    /** the pumps drawn: their place, their fuel, what is left, the holster (world) */
    pumps: (): { site: string; fuel: FuelType; litres: number; x: number; y: number; z: number }[] =>
      [...this.pumps.values()].map((p) => {
        p.root.updateMatrixWorld(true);
        const o = this.ctx!.core.origin;
        const w = p.root.localToWorld(p.rest.clone());
        return { site: p.site.id, fuel: p.fuel, litres: this.litres(p), x: w.x + o.x, y: w.y + o.y, z: w.z + o.z };
      }),
    /** the nozzle taken off a pump into the hands (as E on it does) */
    take: (site: string): boolean => {
      const p = this.pumps.get(site);
      if (!p) return false;
      this.take(p);
      return this.out?.pump === p;
    },
    /** the nozzle out: its pump, what it is in, what has run since the button went down */
    state: (): { out: string | null; into: string | null; run: number; given: number; pinned: boolean } => ({
      out: this.out?.pump.site.id ?? null,
      into: this.out?.into ? (this.out.into.kind === 'filler' ? `filler:${this.out.into.v.view.frame.name.zh}` : `can:${this.out.into.l.uid}`) : null,
      run: this.out?.run ?? 0,
      given: this.given,
      pinned: this.pinned,
    }),
    /** a pump's fuel set (a test): how much is left, and which fuel it gives */
    setPump: (site: string, litres: number, fuel?: FuelType): void => {
      this.left.set(site, litres);
      const p = this.pumps.get(site);
      if (p && fuel) p.fuel = fuel;
    },
  };

  dispose(): void {
    this.unpin();
    for (const p of this.pumps.values()) {
      p.tube?.geometry.dispose();
      p.tube?.removeFromParent();
    }
    this.pumps.clear();
    const i = this.buildings.watchers.indexOf(this);
    if (i >= 0) this.buildings.watchers.splice(i, 1);
  }
}

function isNozzle(h: Held): boolean {
  return h?.kind === 'item' && h.item.item === ND_NOZZLE;
}

function sameInto(a: Into | null, b: Into | null): boolean {
  if (!a || !b) return a === b;
  if (a.kind === 'filler' && b.kind === 'filler') return a.v === b.v;
  if (a.kind === 'can' && b.kind === 'can') return a.l === b.l;
  return false;
}
