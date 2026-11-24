/**
 * The ND grinder in the game (docs/ND/PLAN.md; its rules: core/v3/nd/grinder.ts). In the hands, the left button held
 * runs it: its disc comes up to speed in 0.8 s (and runs down in 1.5 s when let go), its motor whines and drains its
 * battery, 0.65 a second of 125, whether or not it touches anything. Brought within reach of a vehicle's body or a
 * part (the line of sight on it), it goes to the surface at its real size, the disc on the point, and grinds: the
 * rust, the crust and the dirt come off in a stroke 0.3 m across, harder held still than swept fast, the flecks
 * flying. Its charge is the grinder's own (ItemState.charge); spent, its battery is gone, and a grinder lying about
 * takes a new one (Nomad Drive's way: a battery in the hands, E held half a second on it; core/v3/nd/battery.ts) —
 * only then, never on top of charge left.
 *
 * The polisher (Nomad Drive's polish tool) is the same tool another way: the same battery and drain, the same way to
 * the surface, its pad on it; it takes the paint's fading off what it is held to (PartInstance.polish, the body's
 * polish: the car's look shows it at once), hardest held still (0.7) and weaker swept fast (0.3 from 2 m/s); and
 * the grinder takes that shine off again, as it takes the rust.
 */
import * as THREE from 'three';
import type { System } from '../../../../core/kernel/systems';
import type { ItemInstance } from '../../../../core/modcar/items';
import type { Cleaner, Tool } from '../../../../core/modcar/tools';
import { biteAt, chargeOf, drainGrinder, GRINDER, runLeft, spinStep } from '../../../../core/v3/nd/grinder';
import { ND_GRINDER } from '../../../../core/v3/nd/items';
import { BATTERY, hasBattery, insertBattery, ND_BATTERY } from '../../../../core/v3/nd/battery';
import type { Text } from '../../../../core/modcar/types';
import type { GarageDevice } from '../../garageStub';
import type { InteractSource, PlanPoint } from '../../kernel/interact';
import type { Loose } from '../../loose';
import { itemCardKept, type ItemCard } from '../../itemInfo';
import { itemNow } from '../../itemTime';
import type { Action } from '../../hudItems';
import type { GameContext } from '../../kernel/context';
import type { HandsUse, Held, ScrubHit } from '../../player';
import { markerOf, Whine } from '../../nd/kit';

/** the one tool or the other: what it is, its working face and the child that spins, what it does to the surface */
export interface SurfaceToolCfg {
  readonly id: string;
  readonly item: string;
  readonly name: string;
  readonly marker: string;
  readonly spinner: string;
  readonly at: readonly [number, number, number];
  readonly work: 'grind' | 'polish';
}

export const GRINDER_CFG: SurfaceToolCfg = { id: 'nd-grinder', item: ND_GRINDER, name: '打磨机', marker: 'M_disc', spinner: 'KNOB_disc', at: [0.145, 0.013, 0], work: 'grind' };
export const POLISHER_CFG: SurfaceToolCfg = { id: 'nd-polisher', item: 'nd_polisher', name: '抛光机', marker: 'M_pad', spinner: 'KNOB_pad', at: [0.15, 0.019, 0], work: 'polish' };

/** the polisher's bite: 0.7 held still, down to 0.3 by 2 m/s (Nomad Drive's) */
function polishBite(speed: number): number {
  return 0.7 - 0.4 * Math.min(1, Math.max(0, speed / 2));
}
/** how much of the fading a second at full bite takes off a part, and off a whole body (a body is so much bigger) */
const POLISH_PART = 0.12;
const POLISH_BODY = 0.02;

/** how far it reaches a surface (m) */
const REACH = 1.6;
/** what a full-strength stroke takes of dirt, crust, rust (the game's masks: core/modcar/tools.ts CLEANERS for scale) */
const TAKE: [number, number, number] = [1, 1, 1];
/** what a full-strength stroke takes of a coat of paint that has set */
const COAT_TAKE = 1;
/** the disc's turns at full speed (rad/s, drawn) */
const DISC_W = 70;
/** the stroke's own tool for the game's flecks (rust bits) */
const AS_TOOL = { kind: 'brush', life: 1 } as unknown as Tool;

const Y = new THREE.Vector3(0, 1, 0);
const T = (zh: string, en: string): Text => ({ zh, en });

/** a grinder lying about: E picks it up; with a battery in the hands and its own spent, E held half a second puts it in */
class GrinderThing implements GarageDevice {
  readonly id: string;
  readonly radius = 0.2;
  constructor(
    readonly sys: NdGrinder,
    readonly loose: Loose,
  ) {
    this.id = `${sys.cfg.id}:${loose.uid}`;
  }
  get x(): number {
    return this.loose.x;
  }
  get y(): number {
    return this.loose.y + this.loose.mid;
  }
  get z(): number {
    return this.loose.z;
  }
  private get item(): ItemInstance {
    return this.loose.item!;
  }
  get word(): Text {
    const pct = Math.round((chargeOf(this.item) / GRINDER.max) * 100);
    if (this.sys.batteryInHand() && !hasBattery(this.item, GRINDER.max)) return T('装上电池', 'Put the battery in');
    const name = this.sys.cfg.name;
    void pct;
    return T(`拿起 <b>${name}</b>`, 'Pick it up');
  }
  get holdS(): number | undefined {
    return this.sys.batteryInHand() && !hasBattery(this.item, GRINDER.max) ? BATTERY.insertS : undefined;
  }
  get card(): ItemCard {
    return itemCardKept(this.item, itemNow(), this.sys.time);
  }
  readonly alt = null;
  use(): void {
    const b = this.sys.batteryInHand();
    if (b && !hasBattery(this.item, GRINDER.max)) this.sys.insert(this.loose, b);
    else this.sys.pickUp(this.loose);
  }
}

export class NdGrinder implements System<GameContext>, InteractSource {
  readonly id: string;
  constructor(readonly cfg: SurfaceToolCfg = GRINDER_CFG) {
    this.id = cfg.id;
    this.atDisc.set(cfg.at[0], cfg.at[1], cfg.at[2]);
    this.hands = this.makeHands();
  }
  readonly budget = { cpuMs: 0.2 };
  private ctx: GameContext | null = null;
  /** the button held, the disc's speed (0 … 1) */
  private on = false;
  spin = 0;
  /** the surface it is on, and where it was last frame (render space) */
  private hit: ScrubHit | null = null;
  private last = new THREE.Vector3();
  private lastKey = '';
  private readonly whine = new Whine();
  private readonly o = new THREE.Vector3();
  private readonly d = new THREE.Vector3();
  private readonly t = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly m = new THREE.Matrix4();
  private readonly pinQ = new THREE.Quaternion();
  private readonly pinP = new THREE.Vector3();
  private readonly spinQ = new THREE.Quaternion();
  private readonly sb = new THREE.Vector3();
  private readonly sd = new THREE.Vector3();
  private readonly atDisc = new THREE.Vector3(0.145, 0.013, 0);
  private disc: { obj: THREE.Object3D; q0: THREE.Quaternion; model: THREE.Object3D; a: number } | null = null;
  /** the grinders lying about, as devices */
  private readonly lying = new Map<Loose, GrinderThing>();
  private rev = -1;
  /** its own clock (s): the cards kept */
  time = 0;
  /** ground (or polished) so far (the harness): strokes, metres, the fading taken off */
  strokes = 0;
  metres = 0;
  polished = 0;

  readonly hands: HandsUse;

  private makeHands(): HandsUse {
    return {
      id: this.cfg.id,
      claims: (h) => h.kind === 'item' && h.item.item === this.cfg.item,
      press: (h, from) => {
        if (from !== 'mouse' || h.kind !== 'item') return false;
        if (chargeOf(h.item) <= 0) {
          this.ctx?.player.flashWhy('没电了');
          return true;
        }
        this.on = true;
        return true;
      },
      release: (_h, from) => {
        if (from !== 'mouse') return false;
        this.on = false;
        return true;
      },
      step: (h, dt) => this.handStep(h, dt),
      words: (h) => this.words(h),
      gone: () => this.stop(),
    };
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.player.hands?.push(this.hands);
  }

  private words(h: NonNullable<Held>): Action[] {
    if (h.kind !== 'item') return [];
    const c = chargeOf(h.item);
    const pct = Math.round((c / GRINDER.max) * 100);
    void pct;
    if (c <= 0) return [{ keys: ['LMB'], hold: true, text: '开机', off: true, why: '没电了' }];
    return [{ keys: ['LMB'], hold: true, text: this.cfg.work === 'grind' ? (this.hit ? '打磨' : '开机') : this.hit ? '抛光' : '开机' }];
  }

  private handStep(h: NonNullable<Held>, dt: number): void {
    const ctx = this.ctx!;
    if (h.kind !== 'item') return;
    const it = h.item;
    const running = this.on && chargeOf(it) > 0;
    if (running) drainGrinder(it, dt);
    if (this.on && chargeOf(it) <= 0) {
      // (its battery spent and gone: a new one goes in where it lies)
      this.on = false;
      ctx.sound('power_on', 0.2);
      ctx.player.flashWhy('没电了');
    }
    this.spin = spinStep(this.spin, running, dt);
    // the disc turning on the model in the hands
    this.turnDisc(dt);
    // the surface within reach along the line of sight (render space)
    const p = ctx.player;
    const org = ctx.core.origin;
    this.o.set(p.eye.x - org.x, p.eye.y - org.y, p.eye.z - org.z);
    this.d.set(p.dir.x, p.dir.y, p.dir.z).normalize();
    const hit = this.spin > 0.02 || this.on ? ctx.grimeCast(this.o, this.d, REACH) : null;
    let load = 0;
    if (hit && (this.spin > 0.02 || this.on)) {
      // to the surface: the disc's underside on the point, the tool's nose up the surface
      const n = hit.normal;
      this.t.copy(Y).addScaledVector(n, -Y.dot(n));
      if (this.t.lengthSq() < 1e-4) this.t.set(this.d.x, 0, this.d.z).addScaledVector(n, -n.dot(this.d));
      this.t.normalize();
      const z = this.side.crossVectors(this.t, n).normalize();
      this.m.makeBasis(this.t, n, z);
      this.pinQ.setFromRotationMatrix(this.m);
      this.pinP.copy(hit.point).addScaledVector(n, 0.004);
      const model = ctx.heldThing.model;
      const at = this.atDisc.copy(markerOf(model, this.cfg.marker, this.atDisc));
      ctx.heldThing.pinFor({ pos: this.pinP, q: this.pinQ, at });
      // the polisher: the fading taken off what it is on, harder held still than swept fast
      if (this.cfg.work === 'polish' && this.spin > 0.3) {
        const same = this.lastKey === hit.key && this.hit;
        const speed = same && dt > 0 ? this.last.distanceTo(hit.point) / dt : 0;
        const k = polishBite(speed) * this.spin * dt;
        if (hit.inst) hit.inst.polish = Math.min(1, (hit.inst.polish ?? 0) + POLISH_PART * k);
        else if (hit.v) hit.v.build.polish = Math.min(1, (hit.v.build.polish ?? 0) + POLISH_BODY * k);
        this.polished += k;
        this.metres += speed * dt;
        load = 0.4;
      }
      // the stroke from where it was: harder held still than swept fast
      if (this.cfg.work === 'grind' && this.spin > 0.3) {
        // (the grinder takes a polish off with the rust)
        if (hit.inst) hit.inst.polish = 0;
        else if (hit.v) hit.v.build.polish = 0;
        const same = this.lastKey === hit.key && this.hit;
        const a = same ? this.last : hit.point;
        const len = a.distanceTo(hit.point);
        const speed = dt > 0 ? len / dt : 0;
        const k = biteAt(speed) * this.spin;
        // (and a coat of paint down to the metal, faster than any scraper: docs/V3/plan/growth.md §1.5)
        const cleaner: Cleaner = { width: GRINDER.width, take: [TAKE[0] * k, TAKE[1] * k, TAKE[2] * k], depth: 0.03, wet: 0, lasts: 1e9, word: { zh: '打磨', en: 'Grind' }, coat: COAT_TAKE * k };
        // (held still: a dab, a hair along the surface; the stroke's own vectors, not the pin's)
        const b = len < 0.002 ? this.sb.copy(hit.point).addScaledVector(this.t, 0.003) : this.sb.copy(hit.point);
        this.side.crossVectors(n, this.sd.subVectors(b, a).normalize()).normalize();
        ctx.scrubStroke(hit, a.clone(), b.clone(), this.side.clone(), AS_TOOL, cleaner, dt);
        this.strokes++;
        this.metres += len;
        load = 1;
      }
      if (this.lastKey && this.lastKey !== hit.key) ctx.scrubEnd(this.hit, AS_TOOL);
      this.hit = hit;
      this.lastKey = hit.key;
      this.last.copy(hit.point);
    } else {
      if (this.hit) ctx.scrubEnd(this.hit, AS_TOOL);
      this.hit = null;
      this.lastKey = '';
      ctx.heldThing.pinFor(null);
    }
    this.whine.set(this.spin, load);
  }

  private turnDisc(dt: number): void {
    const model = this.ctx!.heldThing.model;
    if (!model) return;
    if (!this.disc || this.disc.model !== model) {
      const obj = model.getObjectByName(this.cfg.spinner);
      this.disc = obj ? { obj, q0: obj.quaternion.clone(), model, a: 0 } : null;
    }
    if (!this.disc) return;
    this.disc.a = (this.disc.a + this.spin * DISC_W * dt) % (Math.PI * 2);
    this.spinQ.setFromAxisAngle(Y, this.disc.a);
    this.disc.obj.quaternion.copy(this.disc.q0).multiply(this.spinQ);
  }

  private stop(): void {
    const ctx = this.ctx!;
    this.on = false;
    this.spin = 0;
    if (this.hit) ctx.scrubEnd(this.hit, AS_TOOL);
    this.hit = null;
    this.lastKey = '';
    ctx.heldThing.pinFor(null);
    this.whine.stop();
  }

  // ------------------------------------------------------------------ lying about

  /** the battery in the hands, if that is what they hold */
  batteryInHand(): ItemInstance | null {
    const h = this.ctx?.player.held;
    return h?.kind === 'item' && h.item.item === ND_BATTERY ? h.item : null;
  }

  /** a battery from the hands into a grinder lying about whose own is spent (the battery is used up) */
  insert(l: Loose, battery: ItemInstance): void {
    const ctx = this.ctx!;
    if (!insertBattery(l.item!, GRINDER.max)) return;
    const p = ctx.player;
    const i = p.slots.findIndex((h) => h?.kind === 'item' && h.item === battery);
    if (i >= 0) p.slots[i] = null;
    ctx.loose.touch(l);
    ctx.sound('latch', 0.6);
    ctx.player.flashWhy('换上了电池');
  }

  pickUp(l: Loose): void {
    const ctx = this.ctx!;
    if (!ctx.player.takeLoose(l)) ctx.player.flashWhy('手满了');
  }

  step(dt: number, ctx: GameContext): void {
    this.time += dt;
    const loose = ctx.loose;
    if (loose.rev === this.rev) return;
    this.rev = loose.rev;
    const seen = new Set<Loose>();
    for (const l of loose.list) {
      if (l.item?.item !== this.cfg.item) continue;
      seen.add(l);
      l.device = true;
      if (!this.lying.has(l)) this.lying.set(l, new GrinderThing(this, l));
    }
    for (const l of [...this.lying.keys()]) if (!seen.has(l)) this.lying.delete(l);
  }

  near(at: PlanPoint, r: number, out: GarageDevice[]): void {
    for (const t of this.lying.values()) {
      const dx = t.loose.x - at.x;
      const dz = t.loose.z - at.z;
      if (dx * dx + dz * dz <= (r + 0.3) ** 2) out.push(t);
    }
  }

  telemetry(): Record<string, unknown> {
    return { on: this.on, spin: this.spin, on_surface: !!this.hit, strokes: this.strokes, metres: this.metres };
  }

  readonly harness = {
    /** the button held (or let go), as the left button */
    run: (on: boolean): boolean => {
      const h = this.ctx?.player.held;
      if (h?.kind !== 'item' || h.item.item !== this.cfg.item) return false;
      this.on = on && chargeOf(h.item) > 0;
      return this.on;
    },
    /** a grinder lying about: uid, where, its charge */
    lying: (): { uid: string; x: number; y: number; z: number; charge: number }[] => [...this.lying.keys()].map((l) => ({ uid: l.uid, x: l.x, y: l.y, z: l.z, charge: chargeOf(l.item!) })),
    /** a grinder lying about run flat (its battery spent) */
    spend: (uid: string): boolean => {
      const l = [...this.lying.keys()].find((x) => x.uid === uid);
      if (!l) return false;
      l.item!.state = { ...(l.item!.state ?? {}), charge: 0 };
      return true;
    },
    charge: (): number => {
      const h = this.ctx?.player.held;
      return h?.kind === 'item' && h.item.item === this.cfg.item ? chargeOf(h.item as ItemInstance) : -1;
    },
    /** the shine on what it is on now (0 … 1), and polished so far */
    shine: (): { on: number; polished: number } => ({ on: this.hit ? this.shineOf(this.hit) : -1, polished: this.polished }),
  };

  /** how much of its fading is off what a stroke is on */
  private shineOf(hit: ScrubHit): number {
    return hit.inst ? (hit.inst.polish ?? 0) : (hit.v?.build.polish ?? 0);
  }

  dispose(): void {
    this.whine.stop();
  }
}
