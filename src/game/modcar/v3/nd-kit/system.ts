/**
 * The ND compass and the one-use kits in the game (docs/ND/PLAN.md, ND3; Nomad Drive's Compass, repair kit,
 * engine repair kit, tire repair kit and battery charger as the game and its assets have them):
 *
 *  - The compass in the hands: its lid flips open (0.5 s, bouncing) and its needle swings round to the north, a tenth
 *    of a second behind, never faster than two turns a second. Put away, its lid shuts.
 *  - An engine repair kit, a tyre repair kit, a battery charger: in the hands and looked at what each is for (an
 *    engine, a tyre, a vehicle's battery — fitted or lying about), E held half a second mends it by half (+50) or
 *    charges it by 65 %, up to full, and the kit is used up. On anything else E does what it always does.
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
/** E held this long (s) */
const KIT_S = 0.5;
/** the compass's lid opens to this (rad) in this long (s); its needle's smoothing (s) and top speed (rad/s) */
const LID_OPEN = (110 * Math.PI) / 180;
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
  /** the kit's hold: how long so far (s), on what */
  private holdT = -1;
  private holdOn: PartInstance | null = null;
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
    press: (h, from) => {
      if (from !== 'key' || h.kind !== 'item') return false;
      const a = this.aim(h.item.item);
      if (!a) return false;
      this.holdT = 0;
      this.holdOn = a.inst;
      return true;
    },
    release: (_h, from) => {
      if (from !== 'key' || this.holdT < 0) return false;
      this.holdT = -1;
      this.holdOn = null;
      if (this.ctx) this.ctx.player.progress = 0;
      return true;
    },
    step: (h, dt) => this.kitStep(h, dt),
    words: (h) => this.kitWords(h),
    // (what it mends may be fitted to a vehicle: the mark reaches it)
    aimsParts: () => true,
    gone: () => {
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
    if (!k || !t) return null;
    const pick = (inst: PartInstance | null | undefined): PartInstance | null => {
      if (!inst) return null;
      if (partDef(inst.part).cat === k.cat) return inst;
      for (const s of Object.values(inst.sub ?? {})) if (partDef(s.part).cat === k.cat) return s;
      return null;
    };
    if (t.kind === 'part') {
      const inst = pick(t.v.build.parts[t.mount.id]);
      return inst ? { inst, v: t.v, loose: null } : null;
    }
    if (t.kind === 'loose' && t.loose.part) {
      const inst = pick(t.loose.part);
      return inst ? { inst, v: null, loose: t.loose } : null;
    }
    if (t.kind === 'looseSub' && t.loose.part) {
      const inst = pick(t.loose.part.sub?.[t.sub]);
      return inst ? { inst, v: null, loose: t.loose } : null;
    }
    return null;
  }

  /** how far along it is: a part's condition, a battery's charge (0 … 1) */
  private levelOf(cat: string, inst: PartInstance): number {
    // (a tyre: its tread, what wears and what one sees on its card)
    return cat === 'battery' ? (inst.fluids?.charge ?? 0) : cat === 'tire' ? (inst.tread ?? inst.cond) : inst.cond;
  }

  private kitStep(h: NonNullable<Held>, dt: number): void {
    const ctx = this.ctx!;
    if (this.holdT < 0 || h.kind !== 'item') return;
    const k = KITS[h.item.item];
    const a = this.aim(h.item.item);
    // (looked away, or let go: the hold is off)
    if (!a || a.inst !== this.holdOn || !ctx.player.primary) {
      this.holdT = -1;
      this.holdOn = null;
      ctx.player.progress = 0;
      return;
    }
    this.holdT += dt;
    ctx.player.progress = Math.min(1, this.holdT / KIT_S);
    if (this.holdT < KIT_S) return;
    // done: mended (charged) by its amount, up to full; the kit used up
    this.holdT = -1;
    this.holdOn = null;
    ctx.player.progress = 0;
    const was = this.levelOf(k.cat, a.inst);
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
    ctx.ui.say(`${k.what} ${Math.round(was * 100)}% → ${Math.round(now * 100)}%`, 2.2);
  }

  private kitWords(h: NonNullable<Held>): Action[] {
    if (h.kind !== 'item') return [];
    const k = KITS[h.item.item];
    const a = this.aim(h.item.item);
    if (!a) return [{ keys: ['LMB'], hold: true, text: k.cat === 'battery' ? '充电' : '修理', off: true, why: `对着${k.what}` }];
    const lv = Math.round(this.levelOf(k.cat, a.inst) * 100);
    void lv;
    return [{ keys: ['LMB'], hold: true, text: `${k.cat === 'battery' ? '充电' : '修理'} <b>${k.what}</b>` }];
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
