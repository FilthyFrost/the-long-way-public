/**
 * The appliances system (node M2, docs/V3/nodes/M2-rv.md): every appliance lying about or riding in a vehicle is a
 * device the mark finds — the left button switches it on and off, the wheel does its second thing (the next
 * station, channel or record), the left button held picks it up; a coffee pot lying about is drawn with the coffee in
 * it (the coffee machine is Nomad Drive's: nd-coffee). What it does is drawn over its model
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
import { batteryCharge } from '../../../../core/modcar/rules';
import type { Text } from '../../../../core/modcar/types';
import { appOf, applianceOf, channelOf, COFFEE_POT, nextChannel, toggle, type ApplianceKind } from '../../../../core/v3/appliances/appliances';
import type { GarageDevice } from '../../garageStub';
import { itemCardKept, type ItemCard } from '../../itemInfo';
import { itemNow } from '../../itemTime';
import { powerOf, type GameContext, type RadioSet } from '../../kernel/context';
import type { InteractSource, PlanPoint } from '../../kernel/interact';
import type { Loose } from '../../loose';
import { heldOf, type Held } from '../../player';
import type { ThingBox } from '../../../../core/modcar/cargo';
import { stationLabel } from '../../radio';
import type { ModVehicle } from '../../vehicle';
import { CABIN_GLOW, glowOf, makeLook, type ApplianceLook, type LookNow } from './looks';
import { globals } from '../../../render/shaderlib';
import { castMesh } from '../../../render/triGrid';

/** what a living space's ceiling lamps give its cabin, fully lit: a warm room one can see to cook in (a table lamp gives 0.2 of its colour) */
const CEILING_GLOW = new THREE.Color(1.0, 0.74, 0.46).multiplyScalar(0.85);
/** what a vehicle's own cabin dome light (U) gives its interior when switched on */
const DOME_GLOW = new THREE.Color(1.0, 0.88, 0.72).multiplyScalar(0.75);

/** what each kind is called on the mark */
const NAME: Record<ApplianceKind, string> = { radio: '收音闹钟', record: '唱片机', tv: '电视', lamp: '台灯', solar: '太阳能灯' };
/** how loud each set plays, against a car radio's 1 */
const LOUD: Partial<Record<ApplianceKind, number>> = { radio: 0.7, record: 1.0, tv: 0.8 };
/** the television's channels (looks.ts draws them in this order) */
export const TV_CHANNELS = ['风景台', '测试卡', '雪花', '卡通台', '新闻台'];

const T = (zh: string, en: string): Text => ({ zh, en });

/** a song's name on the radio's dial */
function songName(ch: number): string {
  return stationLabel(ch);
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
      case 'record':
        return s.on ? T(`停下 <b>${name}</b>`, 'Stop the <b>record</b>') : T('放唱片', 'Play the record');
      case 'lamp':
        return s.on ? T('关灯', 'Switch the lamp off') : T('开灯', 'Switch the lamp on');
      default:
        return s.on ? T(`关掉 <b>${name}</b>`, `Switch off`) : T(`打开 <b>${name}</b>`, `Switch on`);
    }
  }

  /** the left button held: the thing itself is picked up */
  grabbable(): NonNullable<Held> | null {
    return heldOf(this.loose);
  }

  grab(): boolean {
    const ctx = this.sys.context;
    if (!ctx) return false;
    return ctx.player.takeLoose(this.loose);
  }

  /** its second thing, on the wheel while it is looked at (another station, channel, record) */
  get alt(): { word: Text; use(): void } | null {
    const it = this.item;
    const s = appOf(it);
    switch (this.kind) {
      case 'radio':
        return s.on ? { word: T('换台', 'Next station'), use: () => this.sys.next(this) } : null;
      case 'record':
        return { word: T('换唱片', 'Another record'), use: () => this.sys.next(this) };
      case 'tv':
        return s.on ? { word: T('换台', 'Next channel'), use: () => this.sys.next(this) } : null;
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

  /** nothing goes into an appliance from the hands */
  take(_held: NonNullable<Held>): { ok: boolean; word: Text; keep?: boolean } | null {
    return null;
  }

  /**
   * Where the line of sight meets it: its model's box as it lies (a hand's breadth more all round), or until its
   * model is in the sphere a thing lying about is picked by. The box keeps a clock radio by a lamp its own. Riding in a
   * vehicle it is met where it is met, as a thing lying there is: the vehicle's own meshes in front of it hide it (it
   * was offered 1.2 m nearer than it stood, from when the vehicle's body was a box round it — a can in front of it
   * lost to it, and from outside it was marked through the wall).
   */
  hit(ray: THREE.Ray, reach: number): number | null {
    const l = this.loose;
    const box = this.sys.boxOf(l);
    let d: number;
    if (box) {
      this.inv.copy(l.obj.matrixWorld).invert();
      this.lray.copy(ray).applyMatrix4(this.inv);
      const m = 0.005;
      this.b3.min.set(box.minX - m, box.minY - m, box.minZ - m);
      this.b3.max.set(box.maxX + m, box.maxY + m, box.maxZ + m);
      const p = this.lray.intersectBox(this.b3, this.hitP);
      if (!p) return null;
      d = p.distanceTo(this.lray.origin);
      // Test the appliance's actual meshes so empty space around a tapered shade or stem never steals rays from items beside it.
      let hasMesh = false;
      let md = Infinity;
      l.obj.traverse((ob) => {
        const mesh = ob as THREE.Mesh;
        if (!mesh.isMesh) return;
        hasMesh = true;
        const h = castMesh(mesh, ray.origin, ray.direction, Math.min(reach, md));
        if (h && h.dist < md) md = h.dist;
      });
      if (hasMesh) {
        if (!Number.isFinite(md)) return null;
        d = md;
      }
    } else {
      const o = this.sys.origin();
      this.sph.center.set(l.x - o.x, l.y + l.mid - o.y, l.z - o.z);
      this.sph.radius = l.radius * 0.85;
      const p = ray.intersectSphere(this.sph, this.hitP);
      if (!p) return null;
      d = p.distanceTo(ray.origin);
    }
    return d > reach ? null : d;
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

  /** the game, for the devices (null before init) */
  get context(): GameContext | null {
    return this.ctx;
  }

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
          n.coffee = u.potOnly ? (it.litres ?? 0) / (itemDef(COFFEE_POT).drink?.litres ?? 1) : -1;
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
    // (a living space's own ceiling lamps, lit by the power module when one is in it after dark: warm)
    const home = ctx.player.aboard?.v;
    const ceil = home ? (ctx.systems.get('power') as { ceilingOf?(v: ModVehicle): number } | undefined)?.ceilingOf?.(home) ?? 0 : 0;
    if (home && ceil > 0.004) {
      let c = this.lamps.get(home);
      if (!c) this.lamps.set(home, (c = new THREE.Color(0, 0, 0)));
      c.r += CEILING_GLOW.r * ceil;
      c.g += CEILING_GLOW.g * ceil;
      c.b += CEILING_GLOW.b * ceil;
    }
    // (each vehicle's own cabin dome light toggled with U)
    for (let i = 0; i < ctx.vehicles.length; i++) {
      const v = ctx.vehicles[i];
      if (!v.domeOn || batteryCharge(v.build) <= 0.02) continue;
      let c = this.lamps.get(v);
      if (!c) this.lamps.set(v, (c = new THREE.Color(0, 0, 0)));
      c.r += DOME_GLOW.r;
      c.g += DOME_GLOW.g;
      c.b += DOME_GLOW.b;
    }
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
    // (in a vehicle with nothing to draw on it does not come on: docs/V3/plan/rv.md R2, the power module)
    if (!appOf(it).on && u.kind !== 'solar' && powerOf(ctx, u.loose) === 'flat') {
      ctx.sound('switch', 0.6);
      ctx.player.flashWhy('没电了');
      return;
    }
    const on = toggle(it);
    if (u.kind === 'tv') ctx.sound(on ? 'power_on' : 'power_off', 0.5);
    else ctx.sound('switch', 0.6);
    if (on && (u.kind === 'radio' || u.kind === 'record')) ctx.ui.say(`${NAME[u.kind]}：「${songName(channelOf(it))}」`, 2.2);
    if (on && u.kind === 'tv') ctx.ui.say(`电视：${TV_CHANNELS[channelOf(it)]}`, 2);
    if (on && u.kind === 'solar' && (ctx.env.sky?.night ?? 0) <= 0.35) ctx.player.flashWhy('天黑了才亮');
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
