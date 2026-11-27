/**
 * The ND compass and the one-use kits in the game (docs/ND/PLAN.md, ND3; Nomad Drive's Compass, repair kit,
 * engine repair kit, tire repair kit and battery charger as the game and its assets have them):
 *
 *  - The compass in the hands: its lid flips open (0.5 s, bouncing) and its needle swings round to the north, a tenth
 *    of a second behind, never faster than two turns a second. Put away, its lid shuts.
 *  - An engine repair kit, a tyre repair kit, a battery charger: in the hands and looked at what each is for (an
 *    engine, a tyre, a vehicle's battery — fitted or lying about), that thing offers nothing but the mending: the left
 *    button held half a second mends it by half (+50) or charges it by 65 %, up to full, and the kit is used up (it is
 *    neither picked up nor taken off). On anything else the left button does what it always does.
 */
import * as THREE from 'three';
import type { System } from '../../../../core/kernel/systems';
import { partDef } from '../../../../core/modcar/parts';
import { mendPart } from '../../../../core/modcar/build';
import type { PartInstance } from '../../../../core/modcar/types';
import type { Text } from '../../../../core/modcar/types';
import type { GameContext } from '../../kernel/context';
import type { Action } from '../../hudItems';
import type { HandsUse, Held } from '../../player';
import type { ModVehicle } from '../../vehicle';
import { blip } from '../../nd/kit';

export const ND_COMPASS = 'nd_compass';

/** what each kit mends, and by how much (of the part's condition, or of a battery's charge) */
export const KITS: Readonly<Record<string, { cat: 'engine' | 'tire' | 'battery'; amount: number; name: string; what: string }>> = {
  nd_engine_kit: { cat: 'engine', amount: 0.5, name: '引擎修理包', what: '发动机' },
  nd_tire_kit: { cat: 'tire', amount: 0.5, name: '轮胎修理包', what: '轮胎' },
  nd_charger: { cat: 'battery', amount: 0.65, name: '电瓶充电器', what: '电瓶' },
};
/** the left button held this long (s); the mark may stray off what it mends this long meanwhile (s) */
const KIT_S = 0.5;
const KIT_GRACE_S = 0.2;
/** the compass's lid opens upward and away from the dial (-118 deg about +Z from +X hinge) in this long (s) */
const LID_OPEN = (-118 * Math.PI) / 180;
const LID_S = 0.5;
const NEEDLE_S = 0.1;
const NEEDLE_MAX = Math.PI * 4;
/** the world's north, on the plan */
const NORTH = new THREE.Vector3(0, 0, -1);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

const T = (zh: string, en: string): Text => ({ zh, en });
void T;

/** a bounce at the end (Robert Penner's out-bounce) */
function outBounce(t: number): number {
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}

/** the part a kit would mend: what the mark is on (fitted to a vehicle or lying about), or its tyre */
interface KitAim {
  inst: PartInstance;
  v: ModVehicle | null;
  loose: import('../../loose').Loose | null;
}

export class NdKits implements System<GameContext> {
  readonly id = 'nd-kit';
  readonly budget = { cpuMs: 0.1 };
  private ctx: GameContext | null = null;
  private time = 0;
  /** the kit's hold: how long so far (s), on what; how long the mark has been off it (s); the button still down */
  private holdT = -1;
  private holdOn: PartInstance | null = null;
  private offT = 0;
  private down = false;
  /** the compass in the hands: its lid (0 … 1 open), its needle's angle and speed */
  private lidT = 0;
  private needle = 0;
  needleV = 0;
  private compassModel: THREE.Object3D | null = null;
  private lidObj: THREE.Object3D | null = null;
  private needleObj: THREE.Object3D | null = null;
  private readonly lidQ0 = new THREE.Quaternion();
  private readonly needleQ0 = new THREE.Quaternion();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();

  readonly kits: HandsUse = {
    id: 'nd-kit',
    claims: (h) => h.kind === 'item' && !!KITS[h.item.item],
    // (the left button, or a pad's use button: on what it mends the press is the kit's, and the button held mends it —
    // nothing else is done with that press, as in Nomad Drive: what a kit is looked at with is not picked up nor taken off)
    press: (h) => {
      if (h.kind !== 'item') return false;
      const a = this.aim(h.item.item);
      if (!a) return false;
      this.holdT = 0;
      this.offT = 0;
      this.holdOn = a.inst;
      this.down = true;
      return true;
    },
    release: () => {
      this.down = false;
      if (this.holdT < 0) return false;
      this.stopHold();
      return true;
    },
    step: (h, dt) => this.kitStep(h, dt),
    words: (h) => this.kitWords(h),
    aims: (h) => this.kitAims(h),
    ring: () => (this.holdT >= 0 ? Math.min(1, this.holdT / KIT_S) : -1),
    // (what it mends may be fitted to a vehicle: the mark reaches it)
    aimsParts: () => true,
    gone: () => {
      this.down = false;
      this.holdT = -1;
      this.holdOn = null;
    },
  };

  readonly compass: HandsUse = {
    id: 'nd-kit:compass',
    claims: (h) => h.kind === 'item' && h.item.item === ND_COMPASS,
    step: (_h, dt) => this.compassStep(dt),
    words: () => [{ keys: [], text: this.heading() }],
    gone: () => {
      this.lidT = 0;
      this.compassModel = null;
    },
  };

  init(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.player.hands?.push(this.kits, this.compass);
  }

  // ------------------------------------------------------------------ the kits

  /** what the mark is on that this kit mends, if anything */
  private aim(kit: string): KitAim | null {
    const k = KITS[kit];
    const t = this.ctx?.player.target;
    if (!k) return null;
    const pick = (inst: PartInstance | null | undefined): PartInstance | null => {
      if (!inst) return null;
      if (partDef(inst.part).cat === k.cat) return inst;
      for (const s of Object.values(inst.sub ?? {})) if (partDef(s.part).cat === k.cat) return s;
      return null;
    };
    if (t?.kind === 'part') {
      const inst = pick(t.v.build.parts[t.mount.id]);
      if (inst) return { inst, v: t.v, loose: null };
    }
    if (t?.kind === 'loose' && t.loose.part) {
      const inst = pick(t.loose.part);
      if (inst) return { inst, v: null, loose: t.loose };
    }
    if (t?.kind === 'looseSub' && t.loose.part) {
      const inst = pick(t.loose.part.sub?.[t.sub]);
      if (inst) return { inst, v: null, loose: t.loose };
    }
    // Generous assist under an open hood (or near loose parts): aiming within 14 deg / 2.4 m of the matching engine/battery snaps cleanly.
    const ctx = this.ctx;
    if (!ctx || (k.cat !== 'engine' && k.cat !== 'battery')) return null;
    const eye = ctx.player.eye;
    const dir = ctx.player.dir;
    const o = ctx.core.origin;
    const box = new THREE.Box3();
    const ctr = new THREE.Vector3();
    let best: { kit: KitAim; score: number } | null = null;
    for (const v of ctx.vehicles) {
      if (Math.hypot(v.sim.px - eye.x, v.sim.pz - eye.z) > 6) continue;
      for (const m of v.view.frame.mounts) {
        if (m.cat !== k.cat) continue;
        const inst = v.build.parts[m.id];
        if (!inst || v.view.shutOver(m.id)) continue;
        if (!v.view.boundsOf(m.id, box)) continue;
        box.getCenter(ctr);
        const dx = ctr.x + o.x - eye.x;
        const dy = ctr.y + o.y - eye.y;
        const dz = ctr.z + o.z - eye.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > 2.5 || d < 0.05) continue;
        const cos = (dx * dir.x + dy * dir.y + dz * dir.z) / d;
        if (cos < 0.96) continue; // ~16 deg cone
        const score = d * (2 - cos);
        if (!best || score < best.score) best = { kit: { inst, v, loose: null }, score };
      }
    }
    return best ? best.kit : null;
  }

  /** how far along it is: a part's condition (the card's state line), a battery's charge (0 … 1) */
  private levelOf(cat: string, inst: PartInstance): number {
    return cat === 'battery' ? (inst.fluids?.charge ?? 0) : inst.cond;
  }

  private stopHold(): void {
    this.holdT = -1;
    this.holdOn = null;
  }

  private kitStep(h: NonNullable<Held>, dt: number): void {
    const ctx = this.ctx!;
    if (this.holdT < 0 || h.kind !== 'item') return;
    // (its ring round the mark is its own: HandsUse.ring)
    const k = KITS[h.item.item];
    const a = this.aim(h.item.item);
    // (let go: the hold is off; looked away from it longer than the mark's jitter, as Nomad Drive's grace of 0.2 s)
    if (!this.down) return this.stopHold();
    if (!a || a.inst !== this.holdOn) {
      this.offT += dt;
      if (this.offT > KIT_GRACE_S) this.stopHold();
      return;
    }
    this.offT = 0;
    this.holdT += dt;
    if (this.holdT < KIT_S) return;
    // done: mended (charged) by its amount, up to full; the kit used up
    this.stopHold();
    const was = this.levelOf(k.cat, a.inst);
    const treadWas = a.inst.tread ?? 1;
    a.inst.fluids ??= {};
    mendPart(a.inst, k.cat, k.amount);
    const now = this.levelOf(k.cat, a.inst);
    ctx.player.slots[ctx.player.sel] = null;
    // (the button still down is spent: held on, the empty hands must not take the part it mended off)
    ctx.player.spent = true;
    if (a.v) a.v.changed();
    if (a.loose) ctx.loose.touch(a.loose);
    blip('click', 1);
    ctx.sound(k.cat === 'battery' ? 'switch' : 'part_install', 0.6);
    const pct = (x: number): string => `${Math.round(x * 100)}%`;
    // (a tyre's tread comes back too — ours wear it: the line says both, as its card shows both)
    const tread = k.cat === 'tire' ? `，胎纹 ${pct(treadWas)} → ${pct(a.inst.tread ?? 1)}` : '';
    ctx.ui.say(`${k.what}${k.cat === 'battery' ? '电量' : ''} ${pct(was)} → ${pct(now)}${tread}`, 2.2);
  }

  /** the one line, down the right and under the mark alike, for the kit on what it mends */
  private kitLine(kit: string, a: KitAim | null): Action {
    const k = KITS[kit];
    const verb = k.cat === 'battery' ? '充电' : '修理';
    return a ? { keys: ['LMB'], hold: true, text: `${verb} <b>${k.what}</b>` } : { keys: ['LMB'], hold: true, text: verb, off: true, why: `对着${k.what}` };
  }

  private kitWords(h: NonNullable<Held>): Action[] {
    if (h.kind !== 'item') return [];
    return [this.kitLine(h.item.item, this.aim(h.item.item))];
  }

  private kitAims(h: NonNullable<Held>): Action[] | null {
    if (h.kind !== 'item') return null;
    const a = this.aim(h.item.item);
    return a ? [this.kitLine(h.item.item, a)] : null;
  }

  // ------------------------------------------------------------------ the compass

  private compassStep(dt: number): void {
    const ctx = this.ctx!;
    const model = ctx.heldThing.model;
    if (model !== this.compassModel) {
      this.compassModel = model;
      this.lidObj = model?.getObjectByName('LID') ?? null;
      this.needleObj = model?.getObjectByName('KNOB_needle') ?? null;
      if (this.lidObj) this.lidQ0.copy(this.lidObj.quaternion);
      if (this.needleObj) this.needleQ0.copy(this.needleObj.quaternion);
      this.lidT = 0;
    }
    if (!model) return;
    this.time += dt;
    // the lid flipping open
    this.lidT = Math.min(1, this.lidT + dt / LID_S);
    if (this.lidObj) {
      this.q.setFromAxisAngle(Z, LID_OPEN * outBounce(this.lidT));
      this.lidObj.quaternion.copy(this.lidQ0).multiply(this.q);
    }
    // the needle to the north: the north in the compass's own frame, the needle after it (Unity's SmoothDampAngle)
    model.updateWorldMatrix(true, false);
    const wq = model.getWorldQuaternion(this.q).invert();
    this.v.copy(NORTH).applyQuaternion(wq);
    const want = Math.atan2(-this.v.z, this.v.x);
    let d = want - this.needle;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const target = this.needle + d;
    this.needle = smoothDamp(this.needle, target, this, NEEDLE_S, NEEDLE_MAX, dt);
    if (this.needleObj) {
      this.q.setFromAxisAngle(Y, this.needle);
      this.needleObj.quaternion.copy(this.needleQ0).multiply(this.q);
    }
  }

  /** the way one faces, in words */
  private heading(): string {
    const p = this.ctx?.player.dir;
    if (!p) return '';
    // (north −z, east +x)
    const deg = ((Math.atan2(p.x, -p.z) * 180) / Math.PI + 360) % 360;
    const names = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
    return `${names[Math.round(deg / 45) % 8]} ${Math.round(deg)}°`;
  }

  readonly harness = {
    /** the compass in the hands: its lid, its needle, which way north is in its frame */
    compass: (): { lid: number; needle: number } => ({ lid: this.lidT, needle: this.needle }),
  };
}

/** Unity's SmoothDamp, its velocity kept on `s.needleV` */
function smoothDamp(current: number, target: number, s: { needleV: number }, smoothTime: number, maxSpeed: number, dt: number): number {
  const st = Math.max(0.0001, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let change = current - target;
  const maxChange = maxSpeed * st;
  change = Math.max(-maxChange, Math.min(maxChange, change));
  const tgt = current - change;
  const temp = (s.needleV + omega * change) * dt;
  s.needleV = (s.needleV - omega * temp) * exp;
  let out = tgt + (change + temp) * exp;
  if (target - current > 0 === out > target) {
    out = target;
    s.needleV = (out - target) / Math.max(dt, 1e-6);
  }
  return out;
}
