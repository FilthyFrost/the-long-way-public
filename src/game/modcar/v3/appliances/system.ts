/**
 * The appliances system (node M2, docs/V3/nodes/M2-rv.md): every appliance lying about or riding in a vehicle is a
 * device the mark finds — E switches it on and off (the coffee maker: brews), F let go at once does its second
 * thing (the next station, channel or record; the coffee maker's pot taken off), F held picks it up; water, a bag of
 * ground coffee or the pot in the hands go into the coffee maker with E. What it does is drawn over its model
 * (looks.ts), what plays is heard as a car radio is (GameContext.addRadios), and a lamp or a television on in a
 * vehicle lights its inside (the vehicle's own cabin lamp).
 *
 * Its state is the thing's own (ItemState.app: core/v3/appliances): nothing of it is kept here, so it has no
 * save slice. A thing that changes where a place had it lying is marked as touched, so the place lets it go and
 * it is saved as it is now (places.ts).
 */
import * as THREE from 'three';
import type { System } from '../../../../core/kernel/systems';
import { itemDef, type ItemInstance } from '../../../../core/modcar/items';
import type { Text } from '../../../../core/modcar/types';
import { addGrounds, appOf, applianceOf, brewLack, brewStep, channelOf, COFFEE, COFFEE_GROUNDS, COFFEE_POT, hasPot, nextChannel, pourWater, putPot, startBrew, takePot, toggle, type ApplianceKind } from '../../../../core/v3/appliances/appliances';
import type { GarageDevice } from '../../garageStub';
import { itemCardKept, type ItemCard } from '../../itemInfo';
import { itemNow } from '../../itemTime';
import type { GameContext, RadioSet } from '../../kernel/context';
import type { InteractSource, PlanPoint } from '../../kernel/interact';
import type { Loose } from '../../loose';
import { heldOf, type Held } from '../../player';
import type { ThingBox } from '../../../../core/modcar/cargo';
import { SONGS } from '../../radio';
import type { ModVehicle } from '../../vehicle';
import { CABIN_GLOW, glowOf, makeLook, type ApplianceLook, type LookNow } from './looks';
import { globals } from '../../../render/shaderlib';

/** what each kind is called on the mark */
const NAME: Record<ApplianceKind, string> = { coffee: '咖啡机', radio: '收音闹钟', record: '唱片机', tv: '电视', lamp: '台灯', solar: '太阳能灯' };
/** how loud each set plays, against a car radio's 1 */
const LOUD: Partial<Record<ApplianceKind, number>> = { radio: 0.7, record: 1.0, tv: 0.8 };
/** the television's channels (looks.ts draws them in this order) */
export const TV_CHANNELS = ['风景台', '测试卡', '雪花', '卡通台', '新闻台'];

const T = (zh: string, en: string): Text => ({ zh, en });

/** a song's name on the radio's dial */
function songName(ch: number): string {
  return SONGS[((ch % SONGS.length) + SONGS.length) % SONGS.length].name;
}

/** what a coffee maker takes from the hands: water from a bottle, a portion of ground coffee, its pot */
type Pour = { kind: 'water'; litres: number } | { kind: 'grounds' } | { kind: 'pot' };
function pourOf(h: NonNullable<Held>): Pour | null {
  if (h.kind === 'tool' && h.tool.kind === 'bottle') return { kind: 'water', litres: h.tool.litres ?? 0 };
  if (h.kind !== 'item') return null;
  if (h.item.item === 'drink_water') return { kind: 'water', litres: h.item.litres ?? 0 };
  if (h.item.item === COFFEE_GROUNDS) return { kind: 'grounds' };
  if (h.item.item === COFFEE_POT) return { kind: 'pot' };
  return null;
}

/** one appliance lying about or riding in a vehicle: the device the mark finds, and what is drawn of it */
class Unit implements GarageDevice {
  readonly id: string;
  look: ApplianceLook | null = null;
  /** how bright it is now, for a cabin's light (0 … 1) */
  glow = 0;
  private readonly ctr = new THREE.Vector3();
  private readonly sph = new THREE.Sphere();
  private readonly hitP = new THREE.Vector3();
  private readonly inv = new THREE.Matrix4();
  private readonly lray = new THREE.Ray();
  private readonly b3 = new THREE.Box3();

  constructor(
    private readonly sys: Appliances,
    readonly loose: Loose,
    /** a coffee pot on its own: drawn (the coffee in it), not a device */
    readonly potOnly: boolean,
  ) {
    this.id = `appliances:${loose.uid}`;
  }

  get item(): ItemInstance {
    return this.loose.item!;
  }

  get kind(): ApplianceKind {
    return applianceOf(this.item.item) ?? 'lamp';
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
  get radius(): number {
    return this.loose.radius;
  }

  /** what E does */
  get word(): Text {
    const it = this.item;
    const s = appOf(it);
    const name = NAME[this.kind];
    switch (this.kind) {
      case 'coffee': {
        if (s.on) return T(`关掉 <b>${name}</b>`, `Switch off the <b>coffee maker</b>`);
        const lack = brewLack(it);
        if (!lack) return T('煮咖啡', 'Brew coffee');
        if (lack === 'pot') return T('煮咖啡 · 先放上咖啡壶', 'Brew · put a pot on it first');
        if (lack === 'water') return T('煮咖啡 · 先加水', 'Brew · add water first');
        if (lack === 'grounds') return T('煮咖啡 · 先放咖啡粉', 'Brew · add ground coffee first');
        return T('煮咖啡 · 壶满了', 'Brew · the pot is full');
      }
      case 'record':
        return s.on ? T(`停下 <b>${name}</b>`, 'Stop the <b>record</b>') : T(`放唱片 · 「${songName(channelOf(it))}」`, 'Play the record');
      case 'lamp':
        return s.on ? T('关灯', 'Switch the lamp off') : T('开灯', 'Switch the lamp on');
      default:
        return s.on ? T(`关掉 <b>${name}</b>`, `Switch off`) : T(`打开 <b>${name}</b>`, `Switch on`);
    }
  }

  /** F pressed and let go at once */
  get alt(): { word: Text; use(): void } | null {
    const it = this.item;
    const s = appOf(it);
    switch (this.kind) {
      case 'coffee':
        if (!hasPot(it)) return null;
        return { word: (s.coffee ?? 0) > 0.01 ? T(`端起咖啡壶 · ${(s.coffee ?? 0).toFixed(2)} L`, 'Take the pot') : T('拿下咖啡壶', 'Take the pot off'), use: () => this.sys.takePotOff(this) };
      case 'radio':
        return s.on ? { word: T('换台', 'Next station'), use: () => this.sys.next(this) } : null;
      case 'record':
        return { word: T('换一张唱片', 'Another record'), use: () => this.sys.next(this) };
      case 'tv':
        return s.on ? { word: T(`换台 · 下一个是${TV_CHANNELS[(channelOf(it) + 1) % TV_CHANNELS.length]}`, 'Next channel'), use: () => this.sys.next(this) } : null;
      default:
        return null;
    }
  }

  get card(): ItemCard {
    return itemCardKept(this.item, itemNow(), this.sys.time);
  }

  use(): void {
    this.sys.press(this);
  }

  take(held: NonNullable<Held>): { ok: boolean; word: Text; keep?: boolean } | null {
    if (this.kind !== 'coffee') return null;
    const p = pourOf(held);
    if (!p) return null;
    const it = this.item;
    const s = appOf(it);
    if (s.on) return { ok: false, word: T('正在煮，等它煮完', 'It is brewing') };
    if (p.kind === 'water') {
      if (p.litres < 0.01) return { ok: false, word: T('加水 · 瓶子是空的', 'Add water · the bottle is empty') };
      if ((s.water ?? 0) >= COFFEE.tank - 0.01) return { ok: false, word: T('加水 · 水箱满了', 'Add water · the tank is full') };
      return { ok: true, word: T(`加水 · 倒进水箱（还能装 ${(COFFEE.tank - (s.water ?? 0)).toFixed(2)} L）`, 'Pour water in'), keep: true };
    }
    if (p.kind === 'grounds') {
      if (s.grounds) return { ok: false, word: T('放咖啡粉 · 滤网里已经有了', 'Add coffee · there is some in the filter') };
      return { ok: true, word: T('放一份咖啡粉进滤网', 'Put a portion of coffee in the filter'), keep: true };
    }
    // the pot: back onto a machine without one (one with its pot: E works the machine)
    if (hasPot(it)) return null;
    return { ok: true, word: T('放上咖啡壶', 'Put the pot on') };
  }

  useWith(held: NonNullable<Held>): void {
    this.sys.pourIn(this, held);
  }

  /**
   * Where the line of sight meets it: its model's box as it lies (a hand's breadth more all round), or until its
   * model is in the sphere a thing lying about is picked by. The box keeps a clock radio by a lamp its own.
   */
  hit(ray: THREE.Ray, reach: number): number | null {
    const l = this.loose;
    const box = this.sys.boxOf(l);
    let d: number;
    if (box) {
      this.inv.copy(l.obj.matrixWorld).invert();
      this.lray.copy(ray).applyMatrix4(this.inv);
      const m = 0.02;
      this.b3.min.set(box.minX - m, box.minY - m, box.minZ - m);
      this.b3.max.set(box.maxX + m, box.maxY + m, box.maxZ + m);
      const p = this.lray.intersectBox(this.b3, this.hitP);
      if (!p) return null;
      d = p.distanceTo(this.lray.origin);
    } else {
      const o = this.sys.origin();
      this.sph.center.set(l.x - o.x, l.y + l.mid - o.y, l.z - o.z);
      this.sph.radius = l.radius * 0.85;
      const p = ray.intersectSphere(this.sph, this.hitP);
      if (!p) return null;
      d = p.distanceTo(ray.origin);
    }
    if (d > reach) return null;
    // (riding in a vehicle: as a thing lying in it is offered, nearer than the vehicle's coarse body round it, and
    // among such things the nearest first)
    return l.riding ? Math.max(0, d - 1.2) + d * 0.001 : d;
  }

  /** where its middle is in render space (for the sounds' distance) */
  centre(): THREE.Vector3 {
    const o = this.sys.origin();
    return this.ctr.set(this.loose.x - o.x, this.loose.y + this.loose.mid - o.y, this.loose.z - o.z);
  }
}

export class Appliances implements System<GameContext>, InteractSource {
  readonly id = 'appliances';
  readonly budget = { cpuMs: 0.4 };
  /** the sets playing now (GameContext.addRadios: the game reads the list every frame) */
  readonly radios: RadioSet[] = [];
  private readonly pool: RadioSet[] = [];
  private ctx: GameContext | null = null;
  private readonly units = new Map<Loose, Unit>();
  private readonly list: Unit[] = [];
  private rev = -1;
  /** the system's own clock (s): the pictures, the cards kept */
  time = 0;
  /** what is drawn of them: only in a game that draws */
  private root: THREE.Group | null = null;
  private readonly now: LookNow = { on: false, ch: 0, hour: 12, coffee: -1, light: 1, exposure: 1, t: 0, dt: 0, onWall: false };
  private readonly lamps = new Map<ModVehicle, THREE.Color>();
  private readonly sum = new THREE.Color();
  private brewSound = 0;

  init(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.addRadios(this.radios);
    if (ctx.core.scene && ctx.loose.root) {
      this.root = new THREE.Group();
      this.root.name = 'appliances';
      ctx.loose.root.add(this.root);
    }
  }

  origin(): { x: number; y: number; z: number } {
    return this.ctx?.core.origin ?? { x: 0, y: 0, z: 0 };
  }

  /** a thing's model's box in its own frame (null: its model not in yet) */
  boxOf(l: Loose): ThingBox | null {
    return this.ctx?.cargo.boxOf?.(heldOf(l)) ?? null;
  }

  /** the appliances lying about now, in the order they were found (the harness) */
  get all(): readonly Unit[] {
    return this.list;
  }

  /** the units brought up to date with the things lying about (only when they have changed) */
  private refresh(ctx: GameContext): void {
    const loose = ctx.loose;
    if (loose.rev === this.rev) return;
    this.rev = loose.rev;
    const seen = new Set<Loose>();
    for (const l of loose.list) {
      const it = l.item;
      if (!it) continue;
      const kind = applianceOf(it.item);
      const pot = it.item === COFFEE_POT;
      if (!kind && !pot) continue;
      seen.add(l);
      // (an appliance is found by the mark as its device: E works it, F held picks it up)
      if (!pot) l.device = true;
      let u = this.units.get(l);
      // (a pot become a machine or the other way round: made again)
      if (u && u.potOnly !== pot) {
        this.drop(u);
        u = undefined;
      }
      if (!u) {
        u = new Unit(this, l, pot);
        this.units.set(l, u);
        this.list.push(u);
      }
    }
    for (const u of [...this.list]) if (!seen.has(u.loose)) this.drop(u);
  }

  private drop(u: Unit): void {
    u.look?.dispose();
    u.look = null;
    this.units.delete(u.loose);
    const i = this.list.indexOf(u);
    if (i >= 0) this.list.splice(i, 1);
  }

  step(dt: number, ctx: GameContext): void {
    this.time += dt;
    this.refresh(ctx);
    // the coffee makers that are on drip through into their pots
    for (const u of this.list) {
      if (u.potOnly || u.kind !== 'coffee' || !appOf(u.item).on) continue;
      const r = brewStep(u.item, dt);
      if (r.dripped > 0 && this.closeTo(u, 6)) {
        this.brewSound -= dt;
        if (this.brewSound <= 0) {
          ctx.sound('pour', 0.05);
          this.brewSound = 1.6 + Math.random() * 1.2;
        }
      }
      if (r.done) {
        ctx.loose.touch(u.loose);
        if (this.closeTo(u, 8)) {
          ctx.sound('clean_ding', 0.6);
          const c = appOf(u.item).coffee ?? 0;
          if (c > 0.01) ctx.ui.say(`咖啡煮好了：壶里 ${c.toFixed(2)} L。看着咖啡机按 F 端起来喝。`, 3);
        }
      }
    }
  }

  /** is the player within d of it (on foot, aboard, or in a seat) */
  private closeTo(u: Unit, d: number): boolean {
    const ctx = this.ctx;
    if (!ctx) return false;
    const w = ctx.player.walker;
    const px = ctx.seated ? ctx.seated.sim.px : w.x;
    const pz = ctx.seated ? ctx.seated.sim.pz : w.z;
    return Math.hypot(u.x - px, u.z - pz) < d;
  }

  lateUpdate(dt: number, ctx: GameContext): void {
    this.refresh(ctx);
    const n = this.now;
    n.dt = dt;
    n.t = this.time;
    n.hour = ctx.clock.hour;
    n.exposure = ctx.core.exposure ?? 1;
    const sky = globals.uSkyColor.value as THREE.Color;
    const sun = globals.uSunColor.value as THREE.Color;
    // (the light the sky and the sun give a thing, about 1 at noon)
    n.light = Math.min(1, ((sky.r + sky.g + sky.b) / 3) * 1.4 + ((sun.r + sun.g + sun.b) / 3) * 0.35);
    const night = ctx.env.sky?.night ?? 0;
    // the sets playing, the lamps in vehicles
    let sets = 0;
    for (const c of this.lamps.values()) c.setRGB(0, 0, 0);
    for (const u of this.list) {
      const it = u.item;
      const s = appOf(it);
      const kind = u.potOnly ? null : u.kind;
      const on = !!s.on && (kind !== 'solar' || night > 0.35);
      // what is drawn of it, where it lies
      if (this.root) {
        if (!u.look) {
          u.look = makeLook(u.potOnly ? 'pot' : u.kind);
          if (u.look) this.root.add(u.look.group);
        }
        const look = u.look;
        if (look) {
          const g = look.group;
          g.position.copy(u.loose.obj.position);
          g.quaternion.copy(u.loose.obj.quaternion);
          n.on = on;
          n.ch = channelOf(it);
          n.coffee = u.potOnly ? (it.litres ?? 0) / (itemDef(COFFEE_POT).drink?.litres ?? 1) : kind === 'coffee' && hasPot(it) ? (s.coffee ?? 0) / COFFEE.pot : -1;
          n.onWall = u.loose.stow === 'wall';
          look.update(n);
          u.glow = glowOf(look);
        }
      } else u.glow = on ? 1 : 0;
      if (!kind) continue;
      // playing: heard where it stands
      const loud = LOUD[kind];
      if (loud && s.on) {
        const r = (this.pool[sets] ??= { x: 0, y: 0, z: 0, song: 0, loud: 0, inside: null });
        r.x = u.x;
        r.y = u.y;
        r.z = u.z;
        r.song = channelOf(it);
        r.loud = loud;
        r.inside = (u.loose.riding?.on as ModVehicle | undefined) ?? null;
        this.radios[sets++] = r;
      }
      // a lamp, a television on in a vehicle: its inside lit
      const glow = CABIN_GLOW[kind];
      const v = u.loose.riding?.on as ModVehicle | undefined;
      if (glow && v && u.glow > 0.01) {
        let c = this.lamps.get(v);
        if (!c) this.lamps.set(v, (c = new THREE.Color(0, 0, 0)));
        const flick = kind === 'tv' ? 0.8 + 0.2 * Math.sin(this.time * 7.1) * Math.sin(this.time * 2.3 + 1.1) : 1;
        c.r += glow.r * u.glow * flick;
        c.g += glow.g * u.glow * flick;
        c.b += glow.b * u.glow * flick;
      }
    }
    this.radios.length = sets;
    for (const [v, c] of this.lamps) {
      if (!ctx.vehicles.includes(v)) {
        this.lamps.delete(v);
        continue;
      }
      v.view.mats.setCabinLamp(this.sum.copy(c));
    }
  }

  near(at: PlanPoint, r: number, out: GarageDevice[]): void {
    for (let i = 0; i < this.list.length; i++) {
      const u = this.list[i];
      if (u.potOnly) continue;
      const l = u.loose;
      const dx = l.x - at.x;
      const dz = l.z - at.z;
      const rr = r + l.radius;
      if (dx * dx + dz * dz <= rr * rr) out.push(u);
    }
  }

  // ------------------------------------------------------------------ what the buttons do

  /** E on it */
  press(u: Unit): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const it = u.item;
    if (u.kind === 'coffee') {
      if (appOf(it).on) {
        toggle(it, false);
        ctx.sound('switch', 0.7);
      } else if (startBrew(it)) {
        ctx.sound('switch', 0.7);
        ctx.ui.say('咖啡机开了：水滴下来要一会儿。', 2.2);
      } else {
        const lack = brewLack(it);
        ctx.ui.say(lack === 'pot' ? '没有咖啡壶：找一个放上去才能煮。' : lack === 'water' ? '水箱是空的：拿着一瓶水看着它按 E 加水。' : lack === 'grounds' ? '滤网里没有咖啡粉：拿着咖啡粉看着它按 E 放一份。' : '壶已经满了：按 F 端起来喝掉再煮。', 3);
        return;
      }
    } else {
      const on = toggle(it);
      if (u.kind === 'tv') ctx.sound(on ? 'power_on' : 'power_off', 0.5);
      else ctx.sound('switch', 0.6);
      if (on && (u.kind === 'radio' || u.kind === 'record')) ctx.ui.say(`${NAME[u.kind]}：「${songName(channelOf(it))}」`, 2.2);
      if (on && u.kind === 'tv') ctx.ui.say(`电视：${TV_CHANNELS[channelOf(it)]}`, 2);
      if (on && u.kind === 'solar' && (ctx.env.sky?.night ?? 0) <= 0.35) ctx.ui.say('太阳能灯开了：白天充电，天黑了才亮。', 2.6);
    }
    ctx.loose.touch(u.loose);
  }

  /** F let go at once: the next station, channel or record */
  next(u: Unit): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const ch = nextChannel(u.item);
    ctx.sound('switch', 0.4);
    if (u.kind === 'tv') ctx.ui.say(`电视：${TV_CHANNELS[ch]}`, 1.8);
    else ctx.ui.say(`${NAME[u.kind]}：「${songName(ch)}」`, 2);
    ctx.loose.touch(u.loose);
  }

  /** F let go at once on a coffee maker with its pot: the pot into the hands (with the coffee in it) */
  takePotOff(u: Unit): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const it = u.item;
    const pot = takePot(it);
    const h = { kind: 'item' as const, item: pot };
    const p = ctx.player;
    if (p.receive(h) > 0) {
      // (no room in the hands: the pot stays on)
      putPot(it, pot);
      ctx.ui.say('手上没地方了。', 2);
      return;
    }
    const at = p.slots.indexOf(h);
    if (at >= 0) p.sel = at;
    ctx.loose.retype(u.loose);
    ctx.loose.touch(u.loose);
    ctx.sound('pickup', 0.4);
    if ((pot.litres ?? 0) > 0.01) ctx.ui.say(`端起咖啡壶：${(pot.litres ?? 0).toFixed(2)} L 咖啡。按住 F 喝。`, 2.6);
  }

  /** E with water, ground coffee or the pot in the hands, on a coffee maker */
  pourIn(u: Unit, held: NonNullable<Held>): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const it = u.item;
    const p = pourOf(held);
    if (!p) return;
    if (p.kind === 'water') {
      const d = pourWater(it, p.litres);
      if (held.kind === 'tool') held.tool.litres = Math.max(0, (held.tool.litres ?? 0) - d);
      else if (held.kind === 'item') held.item.litres = Math.max(0, Math.round(((held.item.litres ?? 0) - d) * 1000) / 1000);
      ctx.sound('pour', Math.max(0.2, d));
      ctx.ui.say(`加了 ${d.toFixed(2)} L 水：水箱里 ${(appOf(it).water ?? 0).toFixed(2)} L。`, 2);
    } else if (p.kind === 'grounds' && held.kind === 'item') {
      if (addGrounds(it, held.item)) {
        ctx.sound('wrapper', 0.6);
        const left = held.item.uses ?? 0;
        // (the last portion: the bag is thrown away)
        if (left <= 0) {
          const pl = ctx.player;
          const i = pl.slots.indexOf(held);
          if (i >= 0) pl.slots[i] = null;
          ctx.ui.say('放了一份咖啡粉。袋子空了，扔掉了。', 2.4);
        } else ctx.ui.say(`放了一份咖啡粉（袋里还剩 ${left} 份）。`, 2);
      }
    } else if (p.kind === 'pot' && held.kind === 'item') {
      putPot(it, held.item);
      ctx.loose.retype(u.loose);
      ctx.sound('putdown', 0.4);
    }
    ctx.loose.touch(u.loose);
  }

  telemetry(): Record<string, unknown> {
    return {
      count: this.list.filter((u) => !u.potOnly).length,
      on: this.list.filter((u) => !u.potOnly && appOf(u.item).on).map((u) => u.item.item),
      playing: this.radios.map((r) => r.song),
    };
  }

  dispose(): void {
    for (const u of [...this.list]) this.drop(u);
    this.root?.removeFromParent();
    this.root = null;
  }
}
