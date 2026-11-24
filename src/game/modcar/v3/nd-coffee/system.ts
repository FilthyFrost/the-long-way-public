/**
 * The ND coffee machine in the game (docs/ND/PLAN.md; its rules: core/v3/nd/coffee.ts, after Nomad Drive's
 * coffee machine and coffee refill area): each one lying about or riding in a vehicle offers its parts to the mark as
 * devices of their own — its hopper (its lid swings open by itself while the mark is on it and shuts after; with a
 * bag of coffee in the hands, E held a second pours the bag in, whenever the hopper is not full), its switch (E brews:
 * 7.5 s, its lamp lit, then the coffee runs from the spout into the cup; what it lacks is said, and it stays off),
 * the place under its spout (E with a mug or a coffee pot in the hands puts it there; E with empty hands takes it,
 * full or not) — and F held picks the whole machine up, the cup on it. Its lid swings on its hinge, the cup stands
 * under the spout with its coffee in it, a stream runs while it pours. Its state is the machine's own
 * (ItemState.ndCoffee): this keeps nothing, and has no save slice.
 */
import * as THREE from 'three';
import type { System } from '../../../../core/kernel/systems';
import { itemDef, itemPaint, type ItemInstance } from '../../../../core/modcar/items';
import type { Text } from '../../../../core/modcar/types';
import { coffeeLack, coffeeOf, coffeeStep, cupRoom, isCup, ND_COFFEE, pourBag, putCup, startBrew, takeCup, takesBag, working } from '../../../../core/v3/nd/coffee';
import { ND_COFFEE_MACHINE, ND_COFFEE_PACK } from '../../../../core/v3/nd/items';
import { cloneModel, itemGlb, type Model } from '../../assets';
import type { GarageDevice } from '../../garageStub';
import type { GameContext } from '../../kernel/context';
import type { InteractSource, PlanPoint } from '../../kernel/interact';
import type { Loose } from '../../loose';
import { applyMaterials, CarMaterials } from '../../materials';
import type { Held } from '../../player';
import { itemCardKept, type ItemCard } from '../../itemInfo';
import { itemNow } from '../../itemTime';
import { blenderBox, blip, boxHit, extraOf, FaceTheHand, markerOf, modelOf, type PartBox } from '../../nd/kit';

const T = (zh: string, en: string): Text => ({ zh, en });

/** how far its lid opens (rad, about the model's z: its front edge up — Nomad Drive's 100°), how quickly (s) */
const LID_OPEN = (100 * Math.PI) / 180;
const LID_S = 0.35;

/** its parts' boxes in the model's frame (tools/blender/items/nd_things.py nd_coffee_machine) */
const BOX_HOPPER = blenderBox(-0.04, 0.0, 0.398, 0.15, 0.19, 0.05);
const BOX_SWITCH = blenderBox(0.024, 0.066, 0.15, 0.04, 0.05, 0.05);
const BOX_CUP = blenderBox(0.082, 0.0, 0.12, 0.1, 0.08, 0.12);
const BOX_ALL = blenderBox(0.0, 0.0, 0.21, 0.28, 0.25, 0.42);

const COFFEE_COLOUR = 0x4a2a14;
/** the first seconds of a brew are the beans being ground (foley.ts coffee_grind) */
const GRIND_S = 2.2;

type PartKind = 'hopper' | 'switch' | 'cup' | 'body';

/** the bag of coffee in the hands, if that is what they hold */
function bagIn(h: Held): ItemInstance | null {
  return h?.kind === 'item' && h.item.item === ND_COFFEE_PACK ? h.item : null;
}

class Part implements GarageDevice {
  readonly id: string;
  constructor(
    private readonly m: Machine,
    readonly kind: PartKind,
    private readonly box: PartBox,
  ) {
    this.id = `nd-coffee:${m.l.uid}:${kind}`;
  }
  get loose(): Loose {
    return this.m.l;
  }
  get x(): number {
    return this.m.l.x;
  }
  get y(): number {
    return this.m.l.y + 0.2;
  }
  get z(): number {
    return this.m.l.z;
  }
  readonly radius = 0.3;
  get word(): Text {
    return this.m.sys.word(this.m, this.kind);
  }
  /** what it waits for (pressed: said), null: it does something */
  get why(): Text | null {
    return this.m.sys.why(this.m, this.kind);
  }
  get card(): ItemCard {
    return itemCardKept(this.m.item, itemNow(), this.m.sys.time);
  }
  /** the hopper with a bag in the hands: E held a second pours it in */
  get holdS(): number | undefined {
    return this.kind === 'hopper' && bagIn(this.m.sys.held()) && takesBag(this.m.item) ? ND_COFFEE.pourS : undefined;
  }
  holding(p: number): void {
    this.m.pouring = p;
    this.m.pourAt = this.m.sys.time;
  }
  readonly alt = null;
  use(): void {
    this.m.sys.use(this.m, this.kind);
  }
  take(held: NonNullable<Held>): { ok: boolean; word: Text; keep?: boolean } | null {
    return this.m.sys.take(this.m, this.kind, held);
  }
  useWith(held: NonNullable<Held>): void {
    this.m.sys.useWith(this.m, held);
  }
  hit(ray: THREE.Ray, reach: number): number | null {
    const d = boxHit(this.m.l.obj, ray, this.box, reach);
    // (the whole machine only where none of its parts is: a little further than they are)
    return d === null ? null : this.kind === 'body' ? d + 0.08 : d;
  }
}

/** one coffee machine lying about or riding in a vehicle */
class Machine {
  readonly parts: Part[];
  lidT = 0;
  /** the mark is on its hopper (its lid opens); a bag being poured in (the hold's progress, 0 none) */
  looked = false;
  pouring = 0;
  pourAt = -1;
  /** drawn: its lid and rocker, the cup, the coffee in it, the stream, the lamp */
  lid: THREE.Object3D | null = null;
  lidQ0 = new THREE.Quaternion();
  rocker: THREE.Object3D | null = null;
  rockQ0 = new THREE.Quaternion();
  cup: { uid: string; kind: string; obj: THREE.Object3D; model: Model | null } | null = null;
  level: THREE.Mesh | null = null;
  stream: THREE.Mesh | null = null;
  glow: THREE.Mesh | null = null;
  bag: THREE.Mesh | null = null;
  dressedFor: THREE.Object3D | null = null;
  readonly cupAt = new THREE.Vector3(0.07, 0.063, 0);
  readonly spoutAt = new THREE.Vector3(0.07, 0.252, 0);
  readonly lampAt = new THREE.Vector3(0.02, 0.175, -0.06);
  readonly hopperAt = new THREE.Vector3(-0.04, 0.39, 0);
  brewSound = 0;

  constructor(
    readonly sys: NdCoffee,
    readonly l: Loose,
  ) {
    this.parts = [new Part(this, 'hopper', BOX_HOPPER), new Part(this, 'switch', BOX_SWITCH), new Part(this, 'cup', BOX_CUP), new Part(this, 'body', BOX_ALL)];
  }

  get item(): ItemInstance {
    return this.l.item!;
  }
}

const UP_Z = new THREE.Vector3(0, 0, 1);

export class NdCoffee implements System<GameContext>, InteractSource {
  readonly id = 'nd-coffee';
  readonly budget = { cpuMs: 0.2 };
  private ctx: GameContext | null = null;
  /** its own clock (s): the cards kept */
  time = 0;
  private readonly units = new Map<Loose, Machine>();
  private readonly list: Machine[] = [];
  private rev = -1;
  private readonly mats = new CarMaterials();
  private readonly q = new THREE.Quaternion();
  private readonly ray = new THREE.Ray();
  private readonly facing = new FaceTheHand();
  private brownMat: THREE.MeshBasicMaterial | null = null;
  private glowMat: THREE.MeshBasicMaterial | null = null;

  init(ctx: GameContext): void {
    this.ctx = ctx;
  }

  /** what is in the hands now */
  held(): Held {
    return this.ctx?.player.held ?? null;
  }

  private refresh(ctx: GameContext): void {
    const loose = ctx.loose;
    if (loose.rev === this.rev) return;
    this.rev = loose.rev;
    const seen = new Set<Loose>();
    for (const l of loose.list) {
      if (l.item?.item !== ND_COFFEE_MACHINE) continue;
      seen.add(l);
      l.device = true;
      if (!this.units.has(l)) {
        this.facing.face(l, this.time);
        const m = new Machine(this, l);
        this.units.set(l, m);
        this.list.push(m);
        loose.keepApart(l.uid, true);
      }
    }
    for (const m of [...this.list]) if (!seen.has(m.l)) this.forget(m);
  }

  private forget(m: Machine): void {
    this.ctx?.loose.keepApart(m.l.uid, false);
    m.cup?.obj.removeFromParent();
    m.level?.removeFromParent();
    m.stream?.removeFromParent();
    m.glow?.removeFromParent();
    m.bag?.removeFromParent();
    this.mats.drop(`nd-coffee:cup:${m.l.uid}`);
    this.units.delete(m.l);
    this.list.splice(this.list.indexOf(m), 1);
  }

  // ------------------------------------------------------------------ what E does

  word(m: Machine, kind: PartKind): Text {
    const s = coffeeOf(m.item);
    if (kind === 'hopper') return T('倒进咖啡豆', 'Pour the beans in');
    if (kind === 'cup') return s.cup ? T(`拿起 <b>${itemDef(s.cup.item).name.zh}</b>`, 'Take the cup') : T('放壶或杯子', 'A pot or a cup goes here');
    return T('煮咖啡', 'Brew coffee');
  }

  /** what a part waits for, pressed now (null: it does something) — docs/V3/plan/prompts.md §五 */
  why(m: Machine, kind: PartKind): Text | null {
    const s = coffeeOf(m.item);
    if (kind === 'hopper') {
      if (bagIn(this.held())) return takesBag(m.item) ? null : T('满了', 'The hopper is full');
      return T('拿着咖啡豆', 'Bring a bag of beans');
    }
    if (kind === 'cup') {
      if (s.cup) return s.pour !== undefined ? T('正在流', 'The coffee is running') : null;
      return this.held() ? null : T('拿着壶或杯子', 'Bring a pot or a cup');
    }
    // (the beans ground first, then brewed: docs/V3/plan/growth.md §一 4)
    if (s.brew !== undefined) return s.brew < GRIND_S ? T('正在磨豆', 'Grinding') : T('正在煮', 'Brewing');
    if (s.pour !== undefined) return T('正在流', 'The coffee is running');
    switch (coffeeLack(m.item)) {
      case 'cup':
        return T('先放壶或杯子', 'No pot or cup under the spout');
      case 'coffee':
        return T('没有咖啡豆', 'The hopper is empty');
      case 'full':
        return T('杯子满了', 'The cup is full');
      default:
        return null;
    }
  }

  use(m: Machine, kind: PartKind): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const it = m.item;
    const s = coffeeOf(it);
    if (kind === 'hopper') {
      // E held a second with a bag in the hands: in it goes, the hopper full, the bag gone
      const bag = bagIn(this.held());
      if (!bag || !pourBag(it)) return;
      const p = ctx.player;
      const i = p.slots.findIndex((h) => h?.kind === 'item' && h.item === bag);
      if (i >= 0) p.slots[i] = null;
      ctx.sound('wrapper', 0.5);
      ctx.loose.touch(m.l);
      return;
    }
    if (kind === 'cup') {
      if (!s.cup || s.pour !== undefined) return;
      const cup = takeCup(it)!;
      const h = { kind: 'item' as const, item: cup };
      const p = ctx.player;
      if (p.receive(h) > 0) {
        putCup(it, cup);
        return void ctx.player.flashWhy('手满了');
      }
      const at = p.slots.indexOf(h);
      if (at >= 0) p.sel = at;
      ctx.sound('pickup', 0.4);
      ctx.loose.touch(m.l);
      return;
    }
    // the switch (and the machine anywhere else): on, or what it lacks said, and it stays off
    if (working(it)) return;
    blip('click', 0.8);
    const lack = coffeeLack(it);
    if (lack) return void ctx.player.flashWhy(lack === 'cup' ? '先放壶或杯子' : lack === 'coffee' ? '没有咖啡豆' : '杯子满了');
    startBrew(it);
    // (the beans ground first: the grinder, then the brewing's glugs)
    ctx.sound('coffee_grind', 0.9);
    ctx.loose.touch(m.l);
  }

  take(m: Machine, kind: PartKind, held: NonNullable<Held>): { ok: boolean; word: Text; keep?: boolean } | null {
    if (held.kind !== 'item') return null;
    const it = m.item;
    const s = coffeeOf(it);
    // (a bag goes in with E held on the hopper: its holdS)
    if (held.item.item === ND_COFFEE_PACK) return null;
    if (isCup(held.item)) {
      if (kind === 'hopper') return null;
      if (s.cup) return { ok: false, word: T('有杯子了', 'There is a cup there') };
      if (working(it)) return { ok: false, word: T('正在煮', 'It is brewing') };
      return { ok: true, word: T(`放上 <b>${itemDef(held.item.item).name.zh}</b>`, 'Put it under the spout') };
    }
    return null;
  }

  useWith(m: Machine, held: NonNullable<Held>): void {
    const ctx = this.ctx;
    if (!ctx || held.kind !== 'item') return;
    if (putCup(m.item, held.item)) {
      ctx.sound('putdown', 0.4);
      ctx.loose.touch(m.l);
    }
  }

  // ------------------------------------------------------------------ the frame

  step(dt: number, ctx: GameContext): void {
    this.time += dt;
    this.refresh(ctx);
    for (const m of this.list) {
      const it = m.item;
      if (!working(it)) continue;
      const r = coffeeStep(it, dt);
      const near = this.near2(m) < 64;
      // (the grinder's own sound while the beans are ground: the glugs after)
      if ((coffeeOf(it).brew ?? -1) >= GRIND_S && near) {
        m.brewSound -= dt;
        if (m.brewSound <= 0) {
          ctx.sound('glug', 0.12);
          m.brewSound = 0.8 + Math.random() * 0.5;
        }
      }
      if (r.poured && near) ctx.sound('pour', 0.3);
      if (r.done) {
        ctx.loose.touch(m.l);
        const c = coffeeOf(it).cup;
        if (near) {
          ctx.sound('clean_ding', 0.5);
          if (c) ctx.ui.say('咖啡好了', 2.2);
        }
      }
    }
  }

  private near2(m: Machine): number {
    const ctx = this.ctx!;
    const w = ctx.player.walker;
    return (m.l.x - w.x) ** 2 + (m.l.z - w.z) ** 2;
  }

  lateUpdate(dt: number, ctx: GameContext): void {
    this.refresh(ctx);
    const hh = ctx.player.held;
    this.facing.saw(hh?.kind === 'item' && hh.item.item === ND_COFFEE_MACHINE ? hh.item.uid : '', this.time);
    // (the line of sight, render space: a hopper looked at opens its lid, as Nomad Drive's does on hover)
    const p = ctx.player;
    const o = ctx.core.origin;
    this.ray.origin.set(p.eye.x - o.x, p.eye.y - o.y, p.eye.z - o.z);
    this.ray.direction.set(p.dir.x, p.dir.y, p.dir.z).normalize();
    const onFoot = !ctx.seated;
    for (const m of this.list) {
      m.looked = onFoot && (m.l.x - p.eye.x) ** 2 + (m.l.z - p.eye.z) ** 2 < 9 && boxHit(m.l.obj, this.ray, BOX_HOPPER, 2.6) !== null;
      this.draw(m, dt);
    }
  }

  /** its lid and rocker as they are, the cup under its spout and the coffee in it, the stream, its lamp */
  private draw(m: Machine, dt: number): void {
    const model = modelOf(m.l);
    if (model && m.dressedFor !== model) {
      m.dressedFor = model;
      m.lid = model.getObjectByName('LID') ?? null;
      if (m.lid) m.lidQ0.copy(m.lid.quaternion);
      m.rocker = model.getObjectByName('BUTTON_power') ?? null;
      if (m.rocker) m.rockQ0.copy(m.rocker.quaternion);
      m.cupAt.copy(markerOf(model, 'M_cup', m.cupAt));
      m.spoutAt.copy(markerOf(model, 'M_spout', m.spoutAt));
      m.lampAt.copy(markerOf(model, 'M_lamp', m.lampAt));
      m.hopperAt.copy(markerOf(model, 'M_hopper', m.hopperAt));
    }
    const it = m.item;
    const s = coffeeOf(it);
    // the lid: open while the hopper is looked at (and while a bag goes in)
    const bagging = this.time - m.pourAt < 0.12;
    const want = m.looked || bagging ? 1 : 0;
    if (m.lidT !== want) m.lidT = want > m.lidT ? Math.min(1, m.lidT + dt / LID_S) : Math.max(0, m.lidT - dt / LID_S);
    if (m.lid) {
      const k = m.lidT * m.lidT * (3 - 2 * m.lidT);
      this.q.setFromAxisAngle(UP_Z, LID_OPEN * k);
      m.lid.quaternion.copy(m.lidQ0).multiply(this.q);
    }
    if (m.rocker) {
      this.q.setFromAxisAngle(UP_Z, working(it) ? -0.3 : 0);
      m.rocker.quaternion.copy(m.rockQ0).multiply(this.q);
    }
    const g = extraOf(m.l);
    this.brownMat ??= new THREE.MeshBasicMaterial({ color: COFFEE_COLOUR });
    this.glowMat ??= new THREE.MeshBasicMaterial({ color: 0xffb648, toneMapped: false });
    // the cup under the spout
    const cup = s.cup ?? null;
    if (!cup && m.cup) {
      m.cup.obj.removeFromParent();
      m.cup = null;
    }
    if (cup && (!m.cup || m.cup.uid !== cup.uid || m.cup.kind !== cup.item)) {
      m.cup?.obj.removeFromParent();
      const holder = new THREE.Group();
      holder.position.copy(m.cupAt);
      g.add(holder);
      const entry = { uid: cup.uid, kind: cup.item, obj: holder as THREE.Object3D, model: null as Model | null };
      m.cup = entry;
      const look = this.mats.look(`nd-coffee:cup:${m.l.uid}`, itemPaint(cup));
      void itemGlb(itemDef(cup.item).model).then((md) => {
        if (!md || m.cup !== entry) return;
        const c = cloneModel(md);
        applyMaterials(c, look);
        holder.add(c);
        entry.model = md;
      });
    }
    // the coffee in it: a disc at its level
    if (cup && m.cup?.model) {
      const b = m.cup.model.box;
      const d = itemDef(cup.item).drink!;
      const k = Math.min(1, (cup.litres ?? 0) / d.litres);
      if (!m.level) {
        const r = Math.min(b.max.x - b.min.x, b.max.z - b.min.z) * 0.44;
        m.level = new THREE.Mesh(new THREE.CircleGeometry(Math.max(0.01, Math.min(r, 0.06)), 20).rotateX(-Math.PI / 2), this.brownMat);
        g.add(m.level);
      }
      m.level.visible = k > 0.01;
      m.level.position.set(m.cupAt.x, m.cupAt.y + b.min.y + 0.008 + (b.max.y - b.min.y - 0.012) * k * 0.92, m.cupAt.z);
    } else if (m.level) m.level.visible = false;
    // the stream while it pours
    const pouring = s.pour !== undefined;
    if (pouring && !m.stream) {
      m.stream = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0045, 1, 6, 1, true).translate(0, -0.5, 0), this.brownMat);
      g.add(m.stream);
    }
    if (m.stream) {
      m.stream.visible = pouring;
      if (pouring) {
        const bottom = m.level?.visible ? m.level.position.y : m.cupAt.y + 0.01;
        const len = Math.max(0.01, m.spoutAt.y - bottom);
        m.stream.position.copy(m.spoutAt);
        m.stream.scale.set(1, len, 1);
      }
    }
    // the bag poured in: a stream of grounds into the hopper for its second
    if (bagging && !m.bag) {
      m.bag = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 0.12, 6, 1, true).translate(0, 0.06, 0), this.brownMat);
      g.add(m.bag);
    }
    if (m.bag) {
      m.bag.visible = bagging;
      m.bag.position.copy(m.hopperAt);
    }
    // the lamp while it works
    if (!m.glow) {
      m.glow = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 6), this.glowMat);
      g.add(m.glow);
    }
    m.glow.visible = working(it);
    m.glow.position.copy(m.lampAt);
  }

  // ------------------------------------------------------------------ what the mark finds

  near(at: PlanPoint, r: number, out: GarageDevice[]): void {
    for (const m of this.list) {
      const dx = m.l.x - at.x;
      const dz = m.l.z - at.z;
      if (dx * dx + dz * dz > (r + 0.5) ** 2) continue;
      for (const p of m.parts) out.push(p);
    }
  }

  telemetry(): Record<string, unknown> {
    return {
      machines: this.list.map((m) => {
        const s = coffeeOf(m.item);
        return { uid: m.l.uid, looked: m.looked, fill: s.fill ?? 0, cup: s.cup ? { item: s.cup.item, litres: s.cup.litres ?? 0, room: cupRoom(s.cup) } : null, brew: s.brew ?? null, pour: s.pour ?? null, lack: coffeeLack(m.item) };
      }),
    };
  }

  readonly harness = {
    /** the machines lying about: uid, where */
    machines: (): { uid: string; x: number; y: number; z: number }[] => this.list.map((m) => ({ uid: m.l.uid, x: m.l.x, y: m.l.y, z: m.l.z })),
    /** a part's device id (for __rt.useDevice) */
    part: (uid: string, kind: PartKind): string => `nd-coffee:${uid}:${kind}`,
    /** whether the mark has a machine's hopper (its lid open) */
    looked: (uid: string): boolean => !!this.list.find((x) => x.l.uid === uid)?.looked,
    /** where a part of a machine is (world), and the side its front faces (rad from +x towards +z) */
    partAt: (uid: string, kind: PartKind): { x: number; y: number; z: number; from: number } | null => {
      const m = this.list.find((x) => x.l.uid === uid);
      if (!m || !this.ctx) return null;
      const b = { hopper: BOX_HOPPER, switch: BOX_SWITCH, cup: BOX_CUP, body: BOX_ALL }[kind];
      m.l.obj.updateWorldMatrix(true, false);
      const v = new THREE.Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2).applyMatrix4(m.l.obj.matrixWorld);
      const f = new THREE.Vector3(1, 0, 0).transformDirection(m.l.obj.matrixWorld);
      const o = this.ctx.core.origin;
      return { x: v.x + o.x, y: v.y + o.y, z: v.z + o.z, from: Math.atan2(f.z, f.x) };
    },
  };

  dispose(): void {
    for (const m of [...this.list]) this.forget(m);
    this.mats.dispose();
    this.brownMat?.dispose();
    this.glowMat?.dispose();
  }
}
