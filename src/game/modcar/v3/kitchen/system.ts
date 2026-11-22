/**
 * The kitchen system (docs/V3/plan/cooking.md §4, §5): every piece of cookware lying about or riding in a vehicle is
 * something the mark finds and E works — the stove's knob, its canister bay and the vessel on its burner each on
 * their own; a pan or a bowl standing by itself; the board; the seasonings — and whatever is in the hands goes where
 * it can go with E: a canister into the stove, a pan onto the burner, a tomato onto the board or into the pan, a pinch
 * of salt over it, a plate under what is done. Where that is, the thing's own ghost shows (view.ts); where one aims
 * at the ground or a table with a kitchen thing in the hands, it is set down there, facing one.
 *
 * What the things hold is their own state (core/v3/kitchen/kit.ts): nothing of it is kept here. The recipe book is
 * the module's slice (book.ts).
 */
import * as THREE from 'three';
import type { System } from '../../../../core/kernel/systems';
import type { ThingBox } from '../../../../core/modcar/cargo';
import { countOf, itemDef, newItem, splitStack, type ItemInstance } from '../../../../core/modcar/items';
import type { Text } from '../../../../core/modcar/types';
import { eat } from '../../../../core/modcar/vitals';
import { firstTip, knownFail, note, pinned, asksFor, type BookData } from '../../../../core/v3/kitchen/book';
import { POT_MAX } from '../../../../core/v3/kitchen/cook';
import { WAYS, type Way } from '../../../../core/v3/kitchen/dishes';
import { BOARD, dishItem, GAS, GAS_FULL, itemOfPortion, SPICE, STOVE, WAY_OF, type Portion } from '../../../../core/v3/kitchen/items';
import {
  addLack, addPortion, asksStir, boardLack, boardPut, boardTake, chop, CHOPS, dishUp, fireOf, gasOf, hasCanister, kitKind, kitOf, loadCanister, nextSeasoning, phaseOf,
  potOf, putVessel, ready, removePortion, seasonPot, servingsLeft, setFire, steamLack, stir, stoveStep, takeCanister, takeVessel, toss, TOSSES, underOf, vesselOf, wayOf,
  type KitKind, type Missed, type Phase, type StoveTick,
} from '../../../../core/v3/kitchen/kit';
import { FOOD_LOOK } from '../../../../core/v3/kitchen/looks';
import { FOOD } from '../../../../core/v3/kitchen/pantry';
import { classOf, portionOfItem } from '../../../../core/v3/kitchen/standins';
import type { GarageDevice } from '../../garageStub';
import { itemCardKept, type ItemCard } from '../../itemInfo';
import { itemNow } from '../../itemTime';
import type { GameContext } from '../../kernel/context';
import type { InteractSource, PlanPoint } from '../../kernel/interact';
import type { Loose } from '../../loose';
import { heldOf, type Held } from '../../player';

const T = (zh: string, en: string): Text => ({ zh, en });

/** how far from the eye a thing can be set down where one aims (m) */
const PLACE_REACH = 2.5;
/** the seasonings on the table reach a pot this near (m) */
const SPICE_REACH = 1.6;

/** which of a thing's parts a device is: a stove has three, the rest are one */
export type Part = 'all' | 'top' | 'knob' | 'bay';

/** a stove's parts, each a box or two in the stove's own frame (m: x its front, y up, z its left) */
const STOVE_BOXES: Readonly<Record<Exclude<Part, 'all'>, readonly [number, number, number, number, number, number][]>> = {
  // minX, maxX, minY, maxY, minZ, maxZ
  knob: [[0.09, 0.2, -0.01, 0.092, -0.075, 0.02]],
  bay: [[-0.14, 0.2, -0.01, 0.13, -0.195, -0.075]],
  top: [
    [-0.16, 0.16, 0.085, 0.29, -0.075, 0.2],
    [-0.14, 0.09, -0.01, 0.086, -0.075, 0.195],
    [0.09, 0.14, -0.01, 0.086, 0.02, 0.195],
  ],
};

/** what each phase of a pot is called */
const PHASE: Readonly<Record<Phase, Text>> = {
  raw: T('还是生的', 'still raw'),
  cooking: T('快好了', 'nearly there'),
  right: T('正好！', 'just right!'),
  over: T('有点过了', 'a little over'),
  burnt: T('焦了', 'burnt'),
};

/** what stirring is called, each way */
const STIR: Readonly<Record<Way, Text>> = {
  fry: T('翻炒一下', 'Toss it'),
  boil: T('搅一搅', 'Stir it'),
  grill: T('翻个面', 'Turn it'),
  steam: T('', ''),
  bake: T('', ''),
  brew: T('', ''),
  mix: T('拌一拌', 'Toss it'),
};

/** the failed dishes (core/v3/kitchen/looks.ts FAIL_LOOK): eaten, a grunt */
const FAILED: ReadonlySet<string> = new Set(['mess', 'burnt', 'raw'].map(dishItem));

/** the kitchen's sounds (foley.ts), made ready the first time cookware is near: the first stroke of the knife is then heard */
const SOUNDS: readonly string[] = [
  'chop', 'sizzle_in', 'plop', 'toss', 'toss_dry', 'stir', 'shake', 'ignite', 'knob_click', 'flame_out', 'pan_place', 'pan_lift',
  'stove_cover_open', 'stove_cover_close', 'canister_in', 'canister_out', 'plate_clink', 'dish_fail', 'book_write', 'flame_gas', 'sizzle', 'boil', 'kettle_whistle', 'yuck',
];

/**
 * The kitchen's tips, each said once in a book's life (BookData.tips): the first time cookware is near, the first time
 * something that could be cut goes into a hot vessel whole.
 */
export const TIPS = {
  start: '做饭：手里的东西能放哪，哪里就有它的影子，按 E 放下；F 端走，按住 F 拿起。J 是食谱本。',
  cut: '小提示：先放到案板上切三刀再下锅，熟得快，也更容易做到完美。',
} as const;

/** what is said as a pot comes to just right, each way */
const READY: Readonly<Record<Way, string>> = { fry: '火候正好！', grill: '烤好了！', boil: '炖好了！', steam: '蒸好了！', bake: '出炉了！', brew: '水开了，煮好了！', mix: '拌好了！' };

/** what kept a dish from perfect, said on its card */
const MISSED: Readonly<Record<Missed, string>> = { cut: '切一切', season: '撒点调料', under: '火候再足一点', over: '早一点出锅' };

/** how much of a sound at the stove reaches one d metres off (full within arm's reach, nothing past 8 m) */
const hearAt = (d: number): number => (d <= 1.2 ? 1 : Math.pow(Math.max(0, 1 - (d - 1.2) / 6.8), 1.6));

/** the sound of turning what is in a vessel: a spoon round a pot of water, the pan tossed */
const stirSound = (way: Way | null): string => (way === 'boil' || way === 'steam' || way === 'brew' ? 'stir' : 'toss');

/** a distance in the plane, or in space (Math.hypot puts its arguments on the heap on every call: not every frame) */
const dist2 = (dx: number, dz: number): number => Math.sqrt(dx * dx + dz * dz);
const dist3 = (dx: number, dy: number, dz: number): number => Math.sqrt(dx * dx + dy * dy + dz * dz);

const nameOf = (item: string, lang: 'zh' | 'en' = 'zh'): string => itemDef(item).name[lang];
/** a portion's name: the ingredient's, or the stand-in's own */
const portionName = (p: Portion, lang: 'zh' | 'en' = 'zh'): string => FOOD[p.id]?.[lang] ?? itemDef(p.id).name[lang];
const pct = (gas: number): number => Math.max(0, Math.min(100, Math.round((gas / GAS_FULL) * 100)));

/** one thing the mark finds: a piece of cookware, or one of a stove's three parts */
export class KitDevice implements GarageDevice {
  readonly id: string;
  private readonly inv = new THREE.Matrix4();
  private readonly lray = new THREE.Ray();
  private readonly b3 = new THREE.Box3();
  private readonly hitP = new THREE.Vector3();
  private readonly sph = new THREE.Sphere();

  constructor(
    private readonly sys: Kitchen,
    readonly unit: Unit,
    readonly part: Part,
  ) {
    this.id = `kitchen:${unit.loose.uid}:${part}`;
  }

  get loose(): Loose {
    return this.unit.loose;
  }
  get x(): number {
    return this.unit.loose.x;
  }
  get y(): number {
    return this.unit.loose.y + this.unit.loose.mid;
  }
  get z(): number {
    return this.unit.loose.z;
  }
  get radius(): number {
    return this.unit.loose.radius;
  }

  get word(): Text {
    return this.sys.wordOf(this);
  }

  get alt(): { word: Text; use(): void } | null {
    return this.sys.altOf(this);
  }

  get card(): ItemCard {
    return itemCardKept(this.unit.item, itemNow(), this.sys.time);
  }

  use(): void {
    this.sys.press(this);
  }

  take(held: NonNullable<Held>): { ok: boolean; word: Text; keep?: boolean } | null {
    return this.sys.takeOf(this, held);
  }

  useWith(held: NonNullable<Held>): void {
    this.sys.give(this, held);
  }

  /** where the line of sight meets it: its own boxes (a stove's part), or its model's box, a hand's breadth more all round */
  hit(ray: THREE.Ray, reach: number): number | null {
    const l = this.unit.loose;
    this.inv.copy(l.obj.matrixWorld).invert();
    this.lray.copy(ray).applyMatrix4(this.inv);
    let d = Infinity;
    if (this.part !== 'all') {
      for (const b of STOVE_BOXES[this.part]) {
        this.b3.min.set(b[0], b[2], b[4]);
        this.b3.max.set(b[1], b[3], b[5]);
        const p = this.lray.intersectBox(this.b3, this.hitP);
        if (p) d = Math.min(d, p.distanceTo(this.lray.origin));
      }
    } else {
      const box = this.sys.boxOf(l);
      if (box) {
        const m = 0.025;
        // (what stands in a vessel or lies on the board is part of it: the box is taller by that)
        this.b3.min.set(box.minX - m, box.minY - m, box.minZ - m);
        this.b3.max.set(box.maxX + m, box.maxY + (this.unit.kind === 'board' ? 0.1 : 0.05), box.maxZ + m);
        const p = this.lray.intersectBox(this.b3, this.hitP);
        if (p) d = p.distanceTo(this.lray.origin);
      } else {
        const o = this.sys.origin();
        this.sph.center.set(l.x - o.x, l.y + l.mid - o.y, l.z - o.z);
        this.sph.radius = l.radius * 0.85;
        const p = ray.intersectSphere(this.sph, this.hitP);
        if (p) d = p.distanceTo(ray.origin);
      }
    }
    if (!(d <= reach)) return null;
    return l.riding ? Math.max(0, d - 1.2) + d * 0.001 : d;
  }
}

/** one piece of cookware lying about or riding in a vehicle */
export class Unit {
  readonly kind: KitKind;
  readonly devices: KitDevice[];
  /** seconds a movement holds it (the canister being changed): nothing else is done with it meanwhile */
  busy = 0;
  // ---- what just happened, for the view (each read and cleared by it)
  /** the canister was changed (old: one came out; put: one went in) */
  swap: { old: boolean; put: boolean } | null = null;
  /** a stroke of the knife; a toss or a stir; something went in; a serving came out */
  chopped = 0;
  stirred = 0;
  added = 0;
  served: { perfect: boolean; fail: boolean; stars: number } | null = null;

  constructor(
    sys: Kitchen,
    readonly loose: Loose,
  ) {
    this.kind = kitKind(loose.item!.item)!;
    this.devices = this.kind === 'stove' ? [new KitDevice(sys, this, 'top'), new KitDevice(sys, this, 'knob'), new KitDevice(sys, this, 'bay')] : [new KitDevice(sys, this, 'all')];
  }

  get item(): ItemInstance {
    return this.loose.item!;
  }
}

/** a dish just served, for its card on screen (bookUi.ts reveal) */
export interface Reveal {
  /** the dish (core/v3/kitchen/dishes.ts), or '' for a failure */
  dish: string;
  fail: 'mess' | 'burnt' | 'raw' | null;
  zh: string;
  stars: number;
  perfect: boolean;
  /** the first time it was made: a new recipe */
  first: boolean;
  /** what a serving feeds */
  food: number;
  /** a serving is left in the pot */
  more: boolean;
  /** a line under the name: why it failed; the first time it came out perfect */
  reason: string;
}

/** where the thing in the hands would be set down: found by the line of sight, read by the view for its ghost */
export interface PlaceAt {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** "set it down where one aims": no thing of its own, only the place the line of sight meets a surface */
class PlaceDevice implements GarageDevice {
  readonly id = 'kitchen:place';
  x = 0;
  y = 0;
  z = 0;
  radius = 0;
  /** where it would go (world), as the last look found it; null: nowhere */
  at: PlaceAt | null = null;
  /** the frame the place was found in (a place found longer ago is no place) */
  seen = -1;
  private readonly spot: PlaceAt = { x: 0, y: 0, z: 0, yaw: 0 };
  /** the last look: its line of sight, the render origin and the things' revision it was taken with, its answer, its frame */
  private readonly last = { ox: NaN, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0, rx: 0, rz: 0, rev: -1, frame: -99, d: null as number | null };
  /** the point of the line of sight at t (world), and the surface under it: a scratch */
  private readonly p = { x: 0, y: 0, z: 0, s: 0 };
  // (a vehicle's body box, the line of sight in its frame: scratches)
  private readonly box = new THREE.Box3();
  private readonly lray = new THREE.Ray();
  private readonly hitP = new THREE.Vector3();

  constructor(private readonly sys: Kitchen) {}

  readonly word: Text = T('', '');

  use(): void {
    // (nothing in the hands that is set down this way: E does nothing here)
  }

  take(held: NonNullable<Held>): { ok: boolean; word: Text; keep?: boolean } | null {
    if (held.kind !== 'item' || !this.sys.places(held.item.item)) return null;
    const name = nameOf(held.item.item);
    return { ok: true, word: T(`放下 <b>${name}</b>`, `Set down the <b>${nameOf(held.item.item, 'en')}</b>`), keep: true };
  }

  useWith(held: NonNullable<Held>): void {
    if (this.at) this.sys.setDown(held, this.at);
  }

  /**
   * The point of the line of sight t metres along it (world), and the highest surface under it: the ground, a table, a
   * place's floor (LooseThings.surfaceAt). Never a vehicle's: that is looked up by casting into its whole model
   * (vehicle.ts surfaceAt, ~10 ms in a motorhome — once as a thing starts to fall, never every frame); on and in a
   * vehicle the game's own stowing puts a thing down where one aims (cargo.ts), and a vehicle in the way stops the look.
   */
  private sample(ray: THREE.Ray, t: number, o: { x: number; y: number; z: number }, loose: GameContext['loose']): { x: number; y: number; z: number; s: number } {
    const p = this.p;
    p.x = ray.origin.x + ray.direction.x * t + o.x;
    p.y = ray.origin.y + ray.direction.y * t + o.y;
    p.z = ray.origin.z + ray.direction.z * t + o.z;
    p.s = loose.surfaceAt(p.x, p.z, p.y + 0.3);
    return p;
  }

  /** how far along the line of sight it enters the body of a vehicle (null: none in the way within `far`) */
  private vehicleIn(ctx: GameContext, ray: THREE.Ray, far: number): number | null {
    const o = ctx.core.origin;
    const ex = ray.origin.x + o.x;
    const ez = ray.origin.z + o.z;
    let best: number | null = null;
    for (const v of ctx.vehicles) {
      const s = v.sim;
      if (dist2(s.px - ex, s.pz - ez) > far + s.spec.body.halfLength + 1) continue;
      const sd = v.solid.update();
      // (its box turned to its heading: the line of sight in its frame)
      const cos = Math.cos(-sd.yaw);
      const sin = Math.sin(-sd.yaw);
      const cy = (sd.y0 + sd.y1) / 2 - o.y;
      const ox = ray.origin.x - (sd.x - o.x);
      const oz = ray.origin.z - (sd.z - o.z);
      this.lray.origin.set(ox * cos - oz * sin, ray.origin.y - cy, ox * sin + oz * cos);
      this.lray.direction.set(ray.direction.x * cos - ray.direction.z * sin, ray.direction.y, ray.direction.x * sin + ray.direction.z * cos);
      this.box.min.set(-sd.hx, -(sd.y1 - sd.y0) / 2, -sd.hz);
      this.box.max.set(sd.hx, (sd.y1 - sd.y0) / 2, sd.hz);
      const h = this.lray.intersectBox(this.box, this.hitP);
      if (!h) continue;
      const d = h.distanceTo(this.lray.origin);
      if (best === null || d < best) best = d;
    }
    return best;
  }

  /**
   * The line of sight walked until it goes under a surface (the ground, a table, a vehicle's floor): in strides of 10 cm,
   * then halved five times between the last point over a surface and the first under one (to 3 mm). The same line of
   * sight as a moment ago, nothing moved since: the same answer, without asking the surfaces again (one stands still
   * at the stove with a plate in the hands for long stretches).
   */
  hit(ray: THREE.Ray, reach: number): number | null {
    const ctx = this.sys.game;
    if (!ctx || ray.direction.y > -0.08) {
      this.at = null;
      return null;
    }
    const o = ctx.core.origin;
    const loose = ctx.loose;
    const L = this.last;
    const frame = this.sys.frames;
    if (
      frame - L.frame < 15 && L.rev === loose.rev && L.rx === o.x && L.rz === o.z &&
      Math.abs(L.ox - ray.origin.x) < 1e-4 && Math.abs(L.oy - ray.origin.y) < 1e-4 && Math.abs(L.oz - ray.origin.z) < 1e-4 &&
      Math.abs(L.dx - ray.direction.x) < 1e-5 && Math.abs(L.dy - ray.direction.y) < 1e-5 && Math.abs(L.dz - ray.direction.z) < 1e-5
    ) {
      if (this.at) this.seen = frame;
      return L.d;
    }
    L.ox = ray.origin.x;
    L.oy = ray.origin.y;
    L.oz = ray.origin.z;
    L.dx = ray.direction.x;
    L.dy = ray.direction.y;
    L.dz = ray.direction.z;
    L.rx = o.x;
    L.rz = o.z;
    L.rev = loose.rev;
    L.frame = frame;
    L.d = this.walk(ray, reach, o, loose);
    return L.d;
  }

  private walk(ray: THREE.Ray, reach: number, o: { x: number; y: number; z: number }, loose: GameContext['loose']): number | null {
    this.at = null;
    const ctx = this.sys.game!;
    const far = Math.min(reach, PLACE_REACH);
    // (a vehicle in the way: the look stops at its body)
    const wall = this.vehicleIn(ctx, ray, far);
    const under = (t: number): boolean => {
      const p = this.sample(ray, t, o, loose);
      return p.y <= p.s + 0.004;
    };
    let lo = -1;
    let hi = -1;
    for (let t = 0.45; t <= far + 1e-6; t += 0.1) {
      if (under(t)) {
        hi = t;
        break;
      }
      lo = t;
    }
    if (hi < 0 || (wall !== null && wall < hi)) return null;
    if (lo >= 0) {
      for (let k = 0; k < 5; k++) {
        const m = (lo + hi) / 2;
        if (under(m)) hi = m;
        else lo = m;
      }
    }
    const p = this.sample(ray, hi, o, loose);
    // (a step up met from the side — a kerb, a table's edge: not a place)
    if (p.s - p.y > 0.2) return null;
    const at = this.spot;
    at.x = p.x;
    at.y = p.s;
    at.z = p.z;
    at.yaw = Math.atan2(ray.origin.z + o.z - p.z, ray.origin.x + o.x - p.x);
    this.at = at;
    this.seen = this.sys.frames;
    this.x = p.x;
    this.y = p.s;
    this.z = p.z;
    // (whatever real thing the mark could be on instead is nearer by this much)
    return hi + 0.25;
  }
}

/** a ghost the view draws: the thing in the hands where it would go */
export interface GhostAt {
  /** on a piece of cookware (at one of its places), or set down in the world */
  unit: Unit | null;
  /** 'can' in a stove's bay, 'pot' on its burner, 'food' in a vessel or on a board; 'place' in the world */
  slot: 'can' | 'pot' | 'food' | 'place';
  /** the model and its two colours */
  item: string;
  /** the mark is on it: E puts it there */
  focused: boolean;
  /** in the world: where */
  at: PlaceAt | null;
}

export class Kitchen implements System<GameContext>, InteractSource {
  readonly id = 'kitchen';
  readonly budget = { cpuMs: 0.5 };
  game: GameContext | null = null;
  /** the system's own clock (s) and its frames */
  time = 0;
  frames = 0;
  /** the recipe book (the module's slice holds this very object) */
  book: BookData = { made: {}, fails: [] };
  private readonly units = new Map<Loose, Unit>();
  readonly list: Unit[] = [];
  private rev = -1;
  private readonly placer = new PlaceDevice(this);
  private readonly tick: StoveTick = { burning: false, ranOut: false, before: null, after: null, asked: false };
  /** the ghosts to draw this frame (the view reads them; the objects are used again) */
  readonly ghosts: GhostAt[] = [];
  private readonly ghostPool: GhostAt[] = [];
  /** told of what happens in the kitchen, for the book's page (null: nobody) */
  onServed: ((unit: Unit, served: { zh: string; stars: number; perfect: boolean; fail: boolean; first: boolean }) => void) | null = null;
  /** what is drawn of it: only in a game that draws (view.ts, loaded then) */
  private view: { update(dt: number): void; dispose(): void } | null = null;
  /** sounds that come a moment after what set them off (at: s of the system's clock) */
  private readonly later: { at: number; name: string; gain: number; say: string }[] = [];
  /** the kitchen's sounds asked to be made ready (once a session, when cookware is first near) */
  private warmed = false;
  /** the recipe book on screen (bookUi.ts): only on a page */
  private bookUi: { update(): void; dispose(): void; toggle(open?: boolean): void; reveal(r: Reveal): void; readonly open: boolean } | null = null;

  init(ctx: GameContext): void {
    this.game = ctx;
    this.units.clear();
    this.list.length = 0;
    this.rev = -1;
    this.later.length = 0;
    this.warmed = false;
    if (ctx.core.scene && ctx.loose.root) {
      void import('./view').then(({ KitchenView }) => {
        if (this.game === ctx && !this.view) this.view = new KitchenView(ctx, this);
      });
      if (typeof document !== 'undefined' && ctx.ui.root) {
        void import('./bookUi').then(({ BookUi }) => {
          if (this.game === ctx && !this.bookUi) this.bookUi = new BookUi(ctx, this);
        });
      }
    }
  }

  origin(): { x: number; y: number; z: number } {
    return this.game?.core.origin ?? { x: 0, y: 0, z: 0 };
  }

  boxOf(l: Loose): ThingBox | null {
    return this.game?.cargo.boxOf?.(heldOf(l)) ?? null;
  }

  /** is this a thing E sets down where one aims: the kitchen's own — cookware, ingredients, dishes */
  places(item: string): boolean {
    if (kitKind(item)) return true;
    const cat = itemDef(item).cat;
    return cat === 'ingredient' || cat === 'meal';
  }

  // ------------------------------------------------------------------ the units

  private refresh(ctx: GameContext): void {
    const loose = ctx.loose;
    if (loose.rev === this.rev) return;
    this.rev = loose.rev;
    const seen = new Set<Loose>();
    for (const l of loose.list) {
      const it = l.item;
      if (!it) continue;
      const kind = kitKind(it.item);
      // (a canister, a plate, a bowl lying there are things to pick up, no more)
      if (!kind || kind === 'gas' || kind === 'ware') continue;
      seen.add(l);
      l.device = true;
      if (!this.units.has(l)) {
        const u = new Unit(this, l);
        this.units.set(l, u);
        this.list.push(u);
      }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const u = this.list[i];
      if (seen.has(u.loose)) continue;
      this.units.delete(u.loose);
      this.list.splice(i, 1);
    }
  }

  unitOf(l: Loose): Unit | null {
    return this.units.get(l) ?? null;
  }

  // ------------------------------------------------------------------ the frame

  step(dt: number, ctx: GameContext): void {
    this.time += dt;
    this.frames++;
    this.refresh(ctx);
    for (let i = this.later.length - 1; i >= 0; i--) {
      const s = this.later[i];
      if (s.at > this.time) continue;
      this.later.splice(i, 1);
      if (s.name) ctx.sound(s.name, s.gain);
      if (s.say) ctx.ui.say(s.say, 4.5);
    }
    // a stove carried off alight goes out: the flame is the thing's, and nothing steps it in the hands
    const held = ctx.player.held;
    if (held?.kind === 'item' && held.item.item === STOVE && fireOf(held.item)) setFire(held.item, 0);
    for (let i = 0; i < this.list.length; i++) {
      const u = this.list[i];
      if (u.busy > 0) u.busy = Math.max(0, u.busy - dt);
      if (u.kind !== 'stove' || !fireOf(u.item)) continue;
      const t = stoveStep(u.item, dt, this.tick);
      const close = this.closeTo(u, 9);
      if (t.ranOut) {
        ctx.loose.touch(u.loose);
        if (close) {
          ctx.sound('flame_out', 0.8);
          ctx.ui.say('火灭了：燃气罐空了。换一罐，锅里的进度还在。', 3.2);
        }
      }
      if (!close || !t.after || t.after === t.before) {
        if (close && t.asked) this.sayAsk(ctx, u);
        continue;
      }
      if (t.after === 'right') {
        ctx.sound('clean_ding', 0.5);
        const w = wayOf(u.item);
        ctx.ui.say(`${w ? READY[w] : READY.fry}拿着盘子或碗对着它按 E 装盘，或者先关火。`, 2.6);
      } else if (t.after === 'over') ctx.ui.say('有点过了，快出锅！', 2);
      else if (t.after === 'burnt') {
        ctx.sound('sizzle_in', 0.6);
        ctx.ui.say('焦了……', 2);
      }
      if (t.asked) this.sayAsk(ctx, u);
    }
  }

  private sayAsk(ctx: GameContext, u: Unit): void {
    const way = wayOf(u.item);
    if (!way) return;
    ctx.sound('highlight_ping', 0.5);
    ctx.ui.say(`该${STIR[way].zh}了：对着锅按 E。`, 2.4);
  }

  lateUpdate(dt: number, ctx: GameContext): void {
    this.refresh(ctx);
    this.findGhosts(ctx);
    this.loops(ctx);
    this.view?.update(dt);
    this.bookUi?.update();
  }

  /** a sound a moment from now (s); or a line to say then */
  private soon(name: string, gain: number, delay: number, say = ''): void {
    this.later.push({ at: this.time + delay, name, gain, say });
  }

  /**
   * The kitchen's loops this frame: of the stoves alight near one, the loudest flame, pan frying and pot on the boil, each by
   * how near it is and how hot (a pan spits harder as it goes over, hardly at all once it is burnt; a pot comes to the boil).
   * The first time cookware is near, its sounds are made ready.
   */
  private loops(ctx: GameContext): void {
    if (ctx.seated) return;
    const w = ctx.player.walker;
    let flame = 0;
    let sizzle = 0;
    let boil = 0;
    let whistle = 0;
    for (let i = 0; i < this.list.length; i++) {
      const u = this.list[i];
      const d = dist2(u.loose.x - w.x, u.loose.z - w.z);
      if (!this.warmed && d < 14) {
        this.warmed = true;
        for (const s of SOUNDS) ctx.warmSound(s);
      }
      // (the first time cookware is within reach: how the kitchen is worked, once)
      if (d < 2.6 && !u.loose.shut && firstTip(this.book, 'start')) ctx.ui.say(TIPS.start, 6);
      if (u.kind !== 'stove') continue;
      const fire = fireOf(u.item);
      const near = fire ? hearAt(d) : 0;
      if (near <= 0) continue;
      const hot = fire === 2 ? 1 : 0.62;
      flame = Math.max(flame, near * hot);
      const pot = potOf(u.item);
      const way = wayOf(u.item);
      if (!pot?.items.length || !way || pot.out) continue;
      const ph = phaseOf(u.item);
      if (way === 'fry' || way === 'grill') sizzle = Math.max(sizzle, near * hot * (ph === 'raw' ? 0.75 : ph === 'over' ? 1.15 : ph === 'burnt' ? 0.5 : 1));
      else if (WAYS[way].heats) boil = Math.max(boil, near * hot * (0.35 + 0.65 * Math.min(1, (pot.done ?? 0) / 0.5)));
      // (a kettle that has come to the boil whistles, the more shrilly the longer it is left)
      if (way === 'brew' && (ph === 'right' || ph === 'over' || ph === 'burnt')) whistle = Math.max(whistle, near * hot * (ph === 'right' ? 0.75 : 1));
    }
    if (flame > 0.01) ctx.loop('flame_gas', flame);
    if (sizzle > 0.01) ctx.loop('sizzle', sizzle);
    if (boil > 0.01) ctx.loop('boil', boil);
    if (whistle > 0.01) ctx.loop('kettle_whistle', whistle);
  }

  /** the recipe book opened or shut (J does this on a page; the tests and the developer's tab ask here) */
  showBook(open?: boolean): boolean {
    this.bookUi?.toggle(open);
    return this.bookUi?.open ?? false;
  }

  private closeTo(u: Unit, d: number): boolean {
    const ctx = this.game;
    if (!ctx) return false;
    const w = ctx.player.walker;
    const px = ctx.seated ? ctx.seated.sim.px : w.x;
    const pz = ctx.seated ? ctx.seated.sim.pz : w.z;
    return dist2(u.loose.x - px, u.loose.z - pz) < d;
  }

  near(at: PlanPoint, r: number, out: GarageDevice[]): void {
    for (let i = 0; i < this.list.length; i++) {
      const u = this.list[i];
      const l = u.loose;
      // (behind a cupboard's doors: there, and not reached)
      if (l.shut) continue;
      const dx = l.x - at.x;
      const dz = l.z - at.z;
      const rr = r + l.radius;
      if (dx * dx + dz * dz > rr * rr) continue;
      for (let k = 0; k < u.devices.length; k++) out.push(u.devices[k]);
    }
    // set down where one aims: on foot out of doors (aboard a vehicle the game's own stowing does it, its ghost and its turn with it)
    const ctx = this.game;
    const held = ctx?.player.held;
    if (held?.kind === 'item' && this.places(held.item.item) && !ctx!.player.aboard && !ctx!.seated) out.push(this.placer);
  }

  // ------------------------------------------------------------------ the words on the mark

  /** the vessel a unit is or carries, by name */
  private vesselName(u: Unit, lang: 'zh' | 'en' = 'zh'): string {
    const v = vesselOf(u.item);
    return v ? nameOf(v, lang) : '';
  }

  /** what is in the vessel, in a line: "番茄、鸡蛋" */
  private potLine(u: Unit): string {
    const pot = potOf(u.item);
    if (!pot) return '';
    return pot.items.map((p) => portionName(p)).join('、');
  }

  wordOf(d: KitDevice): Text {
    const u = d.unit;
    const it = u.item;
    if (u.busy > 0) return T('正在换燃气罐…', 'Changing the canister…');
    if (d.part === 'knob') {
      if (fireOf(it)) return T('关火', 'Turn the flame off');
      if (!hasCanister(it)) return T('点火 · 先装一罐燃气', 'Light it · it needs a canister');
      if (gasOf(it) <= 0) return T('点火 · 燃气罐空了', 'Light it · the canister is empty');
      return T('点火', 'Light it');
    }
    if (d.part === 'bay') {
      if (!hasCanister(it)) return T('罐仓空着 · 拿着燃气罐按 E 装上', 'No canister · put one in with E');
      return T(`取出燃气罐 · 还剩 ${pct(gasOf(it))}%`, `Take the canister out · ${pct(gasOf(it))}% left`);
    }
    if (u.kind === 'board') {
      const f = kitOf(it).food;
      if (!f) return T('案板空着 · 拿着食材按 E 放上来', 'An empty board · put something on it with E');
      if (f.cut) return T(`拿起切好的<b>${portionName(f)}</b>`, `Take the cut <b>${portionName(f, 'en')}</b>`);
      return T(`切<b>${portionName(f)}</b>（${f.chops ?? 0}/${CHOPS}）`, `Cut the <b>${portionName(f, 'en')}</b> (${f.chops ?? 0}/${CHOPS})`);
    }
    if (u.kind === 'spice') {
      const pot = this.potNear(u);
      const s = pot ? nextSeasoning(pot.item) : null;
      if (!pot) return T('撒调料 · 旁边没有下了料的锅', 'Season · no pot with anything in it near');
      if (!s) return T('六种调料都加过了', 'All six are in');
      return T(`往${this.vesselName(pot)}里撒<b>${s.zh}</b>`, `A pinch of <b>${s.en.toLowerCase()}</b> over the ${this.vesselName(pot, 'en').toLowerCase()}`);
    }
    // the burner of a stove, or a vessel by itself
    const v = vesselOf(it);
    if (!v) return T('炉头空着 · 拿着锅按 E 放上来', 'An empty burner · set a vessel on it with E');
    const pot = potOf(it);
    const name = nameOf(v);
    if (!pot) return T(`空的${name} · 拿着食材按 E 放进去`, `An empty ${nameOf(v, 'en').toLowerCase()} · put food in with E`);
    const way = WAY_OF[v];
    const line = this.potLine(u);
    if (pot.out) return T(`还有 ${servingsLeft(it, classOf)} 份 · 拿着盘子或碗按 E 装盘`, `${servingsLeft(it, classOf)} serving left · dish it up with E`);
    if (!WAYS[way].heats) {
      const k = Math.round((pot.toss ?? 0) * TOSSES);
      if (k >= TOSSES) return T(`${line} · 拌好了：拿着盘子或碗按 E 装盘`, `${line} · tossed: dish it up with E`);
      return T(`${STIR.mix.zh}（${k}/${TOSSES}） · ${line}`, `${STIR.mix.en} (${k}/${TOSSES})`);
    }
    if (asksStir(it)) return T(`<b>${STIR[way].zh}！</b> · ${line}`, `<b>${STIR[way].en}!</b>`);
    const ph = phaseOf(it);
    const lit = u.kind === 'stove' && fireOf(it) > 0;
    if (!lit && (pot.done ?? 0) <= 0.2) return T(`取回${portionName(pot.items[pot.items.length - 1])} · ${line}（${pot.items.length}/${POT_MAX}）`, `Take the ${portionName(pot.items[pot.items.length - 1], 'en').toLowerCase()} back`);
    if (ph === 'right') return T(`${line} · <b>${PHASE.right.zh}</b>拿着盘子或碗按 E 装盘`, `${line} · <b>${PHASE.right.en}</b> dish it up with E`);
    return T(`${line} · ${PHASE[ph].zh}`, `${line} · ${PHASE[ph].en}`);
  }

  altOf(d: KitDevice): { word: Text; use(): void } | null {
    const u = d.unit;
    const it = u.item;
    if (u.busy > 0) return null;
    if (d.part === 'knob') {
      const f = fireOf(it);
      if (!f) return null;
      return f === 2 ? { word: T('调成小火', 'Turn it down'), use: () => this.flame(u, 1) } : { word: T('调成大火', 'Turn it up'), use: () => this.flame(u, 2) };
    }
    if (d.part === 'top') {
      const v = vesselOf(it);
      return v ? { word: T(`端走${nameOf(v)}`, `Take the ${nameOf(v, 'en').toLowerCase()} off`), use: () => this.liftVessel(u) } : null;
    }
    if (u.kind === 'board') {
      const f = kitOf(it).food;
      return f && !f.cut ? { word: T(`拿回${portionName(f)}`, `Take the ${portionName(f, 'en').toLowerCase()} back`), use: () => this.offBoard(u) } : null;
    }
    return null;
  }

  // ------------------------------------------------------------------ E with empty hands (or with what the thing has no use for)

  press(d: KitDevice): void {
    const ctx = this.game;
    const u = d.unit;
    if (!ctx || u.busy > 0) return;
    const it = u.item;
    if (d.part === 'knob') return this.flame(u, fireOf(it) ? 0 : 2);
    if (d.part === 'bay') return this.outCanister(u);
    if (u.kind === 'board') {
      const f = kitOf(it).food;
      if (!f) return ctx.ui.say('案板上没有东西：拿着要切的食材对着它按 E。', 2.4);
      if (f.cut) return this.offBoard(u);
      const n = chop(it);
      u.chopped++;
      ctx.sound('chop', 1);
      ctx.loose.touch(u.loose);
      if (n >= CHOPS) ctx.ui.say(`${portionName(f)}切好了。`, 1.6);
      return;
    }
    if (u.kind === 'spice') {
      const pot = this.potNear(u);
      if (!pot) return ctx.ui.say('旁边没有下了料的锅：把调料盒放在锅边上。', 2.4);
      return this.pinch(pot);
    }
    const v = vesselOf(it);
    if (!v) return ctx.ui.say('炉头上没有锅：拿着平底锅或汤锅对着它按 E。', 2.4);
    const pot = potOf(it);
    if (!pot) return ctx.ui.say(`${nameOf(v)}是空的：拿着食材对着它按 E 放进去。`, 2.4);
    const way = WAY_OF[v];
    if (pot.out) return ctx.ui.say('拿着盘子或碗对着它按 E，把剩下的一份装出来。', 2.4);
    if (!WAYS[way].heats) {
      if (ready(it)) return ctx.ui.say('拌好了：拿着盘子或碗对着它按 E 装盘。', 2.4);
      toss(it);
      u.stirred++;
      ctx.sound('toss_dry', 0.9);
      ctx.loose.touch(u.loose);
      if (ready(it)) ctx.ui.say('拌好了。', 1.4);
      return;
    }
    if (asksStir(it)) {
      stir(it);
      u.stirred++;
      ctx.sound(stirSound(way), 1);
      ctx.loose.touch(u.loose);
      ctx.ui.say('好：这下不容易糊了。', 1.6);
      return;
    }
    const lit = u.kind === 'stove' && fireOf(it) > 0;
    if (!lit && (pot.done ?? 0) <= 0.2) {
      const p = removePortion(it);
      if (p) this.hand(ctx, newItem(itemOfPortion(p)));
      ctx.loose.touch(u.loose);
      return;
    }
    // (a turn of the spoon for the pleasure of it)
    u.stirred++;
    ctx.sound(stirSound(way), 0.55);
    if (phaseOf(it) === 'right') ctx.ui.say('火候正好：拿着盘子或碗对着它按 E 装盘。', 2.2);
  }

  // ------------------------------------------------------------------ E with something in the hands

  takeOf(d: KitDevice, held: NonNullable<Held>): { ok: boolean; word: Text; keep?: boolean } | null {
    if (held.kind !== 'item') return null;
    const u = d.unit;
    const it = u.item;
    const id = held.item.item;
    const kind = kitKind(id);
    const no = (zh: string, en: string): { ok: boolean; word: Text } => ({ ok: false, word: T(zh, en) });
    if (u.busy > 0) return kind || portionOfItem(id) ? no('正在换燃气罐…', 'Changing the canister…') : null;
    if (u.kind === 'stove') {
      if (kind === 'gas') {
        const fresh = pct(gasOf(held.item));
        if (!hasCanister(it)) return { ok: true, word: T(`装上燃气罐（${fresh}%）`, `Put the canister in (${fresh}%)`) };
        return { ok: true, word: T(`换上这罐燃气（${fresh}%） · 换下来的还剩 ${pct(gasOf(it))}%`, `Change the canister (${fresh}% for ${pct(gasOf(it))}%)`) };
      }
      // (the knob is the knob and the bay the bay, whatever else is in the hands: E turns the one and empties the other)
      if (d.part !== 'top') return null;
      if (kind === 'vessel') {
        if (!WAYS[WAY_OF[id]].heats) return no(`${nameOf(id)}不用火：放在一边拌就行`, 'A bowl needs no flame');
        // (the steamer stands on a pot of water, never on the flame)
        if (WAY_OF[id] === 'steam') {
          const lack = steamLack(it);
          if (lack === 'nopot') return no('蒸笼要架在汤锅上：先在炉头上放一口空汤锅（锅里是水）', 'A steamer stands on a pot of water: set an empty pot on the burner first');
          if (lack === 'potfull') return no('汤锅里有东西：蒸笼要架在空汤锅上', 'The pot has food in it: the steamer goes on an empty one');
          if (lack === 'taken') return no(`炉头上已经有${nameOf(vesselOf(it)!)}了`, 'Something is on the burner');
          return { ok: true, word: T('把<b>蒸笼</b>架到汤锅上', 'Set the <b>steamer</b> on the pot') };
        }
        const on = vesselOf(it);
        if (on) return no(`炉头上已经有${nameOf(on)}了`, `The ${nameOf(on, 'en').toLowerCase()} is on it`);
        return { ok: true, word: T(`把<b>${nameOf(id)}</b>放到炉头上`, `Set the <b>${nameOf(id, 'en').toLowerCase()}</b> on the burner`) };
      }
    }
    if (u.kind === 'board') {
      const p = portionOfItem(id);
      if (!p) return null;
      const lack = boardLack(it, p);
      // (something lies on it already: E is the knife's, or takes what is cut — whatever is in the hands)
      if (lack === 'busy') return null;
      if (lack === 'nocut') return no(`${portionName(p)}不用切，直接下锅`, 'This needs no cutting');
      if (lack === 'cutalready') return no('已经切好了', 'It is cut already');
      return { ok: true, word: T(`把<b>${portionName(p)}</b>放到案板上`, `Put the <b>${portionName(p, 'en').toLowerCase()}</b> on the board`), keep: true };
    }
    if (u.kind === 'spice') return null;
    // into, onto and out of the vessel
    const v = vesselOf(it);
    const p = portionOfItem(id);
    // (it asks to be stirred: that is what E does now, whatever is in the hands — the plate and the next thing wait a press)
    if (v && asksStir(it) && (p || kind === 'ware' || kind === 'spice')) return null;
    if (p) {
      if (!v) return no('先在炉头上放一口锅', 'Set a vessel on the burner first');
      const lack = addLack(it);
      if (lack === 'full') return no(`${nameOf(v)}满了（${POT_MAX}/${POT_MAX}）`, 'It is full');
      if (lack === 'served') return no('已经出过锅了：先把剩下的装完', 'Dish up what is left first');
      if (lack === 'burnt') return no('已经焦了：装出来，再重新做', 'It is burnt');
      const pot = potOf(it);
      const n = pot?.items.length ?? 0;
      const way = WAY_OF[v];
      // (these things, this way, came to nothing before: said before they go in)
      const failed = knownFail(this.book, way, [...(pot?.items.map((x) => x.id) ?? []), p.id]);
      const pin = pinned(this.book);
      const wanted = pin && pin.way === way && asksFor(pin, p.id) ? `「${pin.zh}」要它 · ` : '';
      return {
        ok: true,
        word: T(`${wanted}${WAYS[way].zh}：放进<b>${portionName(p)}</b>（${n + 1}/${POT_MAX}）${failed ? ' · <b>上次这样做砸了</b>' : ''}`, `${WAYS[way].en}: add the <b>${portionName(p, 'en').toLowerCase()}</b> (${n + 1}/${POT_MAX})`),
        keep: true,
      };
    }
    if (kind === 'ware') {
      if (!v) return null;
      const pot = potOf(it);
      if (!pot) return no(`${nameOf(v)}里什么都没有`, 'There is nothing in it');
      if (!ready(it)) return no(`还没拌好：对着${nameOf(v)}按 E 拌 ${TOSSES} 下`, 'Not tossed yet');
      const ph = WAYS[WAY_OF[v]].heats ? phaseOf(it) : 'right';
      return { ok: true, word: T(`装盘${ph === 'right' ? '' : ` · <b>${PHASE[ph].zh}</b>`}`, `Dish it up${ph === 'right' ? '' : ` · <b>${PHASE[ph].en}</b>`}`), keep: true };
    }
    if (kind === 'spice') {
      if (!v) return null;
      if (!potOf(it)) return no(`${nameOf(v)}里还没有东西`, 'There is nothing to season');
      const s = nextSeasoning(it);
      if (!s) return no('六种调料都加过了', 'All six are in');
      return { ok: true, word: T(`撒<b>${s.zh}</b>`, `A pinch of <b>${s.en.toLowerCase()}</b>`), keep: true };
    }
    return null;
  }

  give(d: KitDevice, held: NonNullable<Held>): void {
    const ctx = this.game;
    if (!ctx || held.kind !== 'item') return;
    const u = d.unit;
    const it = u.item;
    const id = held.item.item;
    const kind = kitKind(id);
    if (u.kind === 'stove' && kind === 'gas') {
      // (the canister left the hands as E was pressed: it is the stove's now, and the one that was in it comes out)
      const had = hasCanister(it);
      const old = loadCanister(it, held.item);
      u.swap = { old: had, put: true };
      // (its sounds go with the movement: view.ts)
      u.busy = had ? 2.3 : 1.6;
      ctx.loose.touch(u.loose);
      if (old) {
        this.hand(ctx, old);
        ctx.ui.say(gasOf(old) <= 0 ? '换好了。换下来的是空罐。' : `换好了。换下来的那罐还剩 ${pct(gasOf(old))}%。`, 2.6);
      } else ctx.ui.say('燃气罐装好了：对着旋钮按 E 点火。', 2.4);
      return;
    }
    if (u.kind === 'stove' && kind === 'vessel') {
      if (!putVessel(it, held.item)) return void this.hand(ctx, held.item);
      u.added++;
      ctx.sound('pan_place', 1);
      ctx.loose.touch(u.loose);
      return;
    }
    if (u.kind === 'board') {
      const p = portionOfItem(id);
      if (!p || !boardPut(it, p)) return;
      this.spend(ctx, held);
      u.added++;
      ctx.sound('putdown', 0.3);
      ctx.loose.touch(u.loose);
      return;
    }
    const p = portionOfItem(id);
    if (p) {
      if (!addPortion(it, p)) return;
      this.spend(ctx, held);
      u.added++;
      // (something that could have been cut, into a hot vessel whole: the board, once)
      const w = wayOf(it);
      if (!p.cut && FOOD_LOOK[p.id]?.chop && w && WAYS[w].heats && this.list.some((x) => x.kind === 'board') && firstTip(this.book, 'cut')) this.soon('', 0, 0, TIPS.cut);
      // (into hot oil it flares; into a pot it plops; into a cold pan or the bowl it is just put down)
      const way = wayOf(it);
      const hot = u.kind === 'stove' && fireOf(it) > 0;
      if (way === 'fry' || way === 'grill') ctx.sound(hot ? 'sizzle_in' : 'putdown', hot ? 1 : 0.3);
      else if (way && WAYS[way].heats) ctx.sound('plop', hot ? 1 : 0.7);
      else ctx.sound('putdown', 0.25);
      ctx.loose.touch(u.loose);
      return;
    }
    if (kind === 'ware') return this.serve(u, held);
    if (kind === 'spice') return this.pinch(u);
  }

  // ------------------------------------------------------------------ what the buttons come to

  /** the knob: 0 off, 1 low, 2 high */
  flame(u: Unit, level: 0 | 1 | 2): void {
    const ctx = this.game;
    if (!ctx) return;
    const was = fireOf(u.item);
    const lack = setFire(u.item, level);
    // (lit: the igniter and the gas catching; out: the burner's pop; up or down a notch, or nothing to light: the knob)
    ctx.sound(lack ? 'knob_click' : level === 0 ? (was ? 'flame_out' : 'knob_click') : was ? 'knob_click' : 'ignite', 1);
    if (lack) return ctx.ui.say(lack === 'nocan' ? '炉子里没有燃气罐：拿着一罐对着炉子按 E 装上。' : '燃气罐空了：换一罐。', 2.8);
    ctx.loose.touch(u.loose);
    if (level === 2 && !vesselOf(u.item)) ctx.ui.say('火点着了。炉头上还没有锅。', 2);
  }

  /** the canister out of the bay, into the hands */
  outCanister(u: Unit): void {
    const ctx = this.game;
    if (!ctx) return;
    if (!hasCanister(u.item)) return ctx.ui.say('罐仓是空的：拿着燃气罐对着炉子按 E 装上。', 2.4);
    if (ctx.player.roomFor({ kind: 'item', item: newItem(GAS) }) <= 0) return ctx.ui.say('手上没地方了。', 2);
    const can = takeCanister(u.item)!;
    u.swap = { old: true, put: false };
    u.busy = 1.3;
    ctx.loose.touch(u.loose);
    this.hand(ctx, can);
    ctx.ui.say(gasOf(can) <= 0 ? '取出来了：是空罐。' : `取出来了：还剩 ${pct(gasOf(can))}%。`, 2.2);
  }

  /** the vessel off the burner, into the hands with what is in it */
  liftVessel(u: Unit): void {
    const ctx = this.game;
    if (!ctx) return;
    const v = vesselOf(u.item);
    if (!v) return;
    if (ctx.player.roomFor({ kind: 'item', item: newItem(v) }) <= 0) return ctx.ui.say('手上没地方了。', 2);
    const vessel = takeVessel(u.item)!;
    ctx.sound('pan_lift', 1);
    ctx.loose.touch(u.loose);
    this.hand(ctx, vessel);
  }

  /** what lies on the board into the hands: cut, or whole as it went on */
  offBoard(u: Unit): void {
    const ctx = this.game;
    if (!ctx) return;
    const f = kitOf(u.item).food;
    if (!f) return;
    const item = newItem(itemOfPortion(f));
    if (ctx.player.roomFor({ kind: 'item', item }) <= 0) return ctx.ui.say('手上没地方了。', 2);
    boardTake(u.item);
    ctx.sound('pickup', 0.3);
    ctx.loose.touch(u.loose);
    this.hand(ctx, item);
  }

  /** a pinch of the next seasoning over a unit's pot */
  pinch(u: Unit): void {
    const ctx = this.game;
    if (!ctx) return;
    const s = nextSeasoning(u.item);
    if (!s || !seasonPot(u.item, s.id)) return ctx.ui.say('没有什么可加的了。', 1.8);
    u.stirred++;
    ctx.sound('shake', 1);
    ctx.loose.touch(u.loose);
    ctx.ui.say(`撒了${s.zh}。`, 1.4);
  }

  /** the pot with something in it nearest a caddy lying there (null: none within reach) */
  potNear(caddy: Unit): Unit | null {
    let best: Unit | null = null;
    let bd = SPICE_REACH;
    for (let i = 0; i < this.list.length; i++) {
      const u = this.list[i];
      if (u === caddy || !potOf(u.item)?.items.length) continue;
      const d = dist3(u.loose.x - caddy.loose.x, u.loose.y - caddy.loose.y, u.loose.z - caddy.loose.z);
      if (d < bd) {
        bd = d;
        best = u;
      }
    }
    return best;
  }

  /** a serving out of a unit's vessel onto the plate or into the bowl in the hands */
  serve(u: Unit, held: NonNullable<Held>): void {
    const ctx = this.game;
    if (!ctx || held.kind !== 'item') return;
    const served = dishUp(u.item, held.item.item, classOf);
    if (!served) return;
    this.spend(ctx, held);
    const o = served.outcome;
    const noted = note(this.book, served.way, served.items, o);
    u.served = { perfect: o.perfect, fail: !!o.fail, stars: o.stars };
    ctx.loose.touch(u.loose);
    this.hand(ctx, served.item, true);
    const stars = '★'.repeat(o.stars);
    // (where there is a page, the dish's card says it: bookUi.ts reveal; else the toast)
    const card: Reveal = {
      dish: o.dish?.id ?? '',
      // (an empty pot is never dished up: as a mess, if it were)
      fail: o.fail === 'empty' ? 'mess' : (o.fail ?? null),
      zh: o.zh,
      stars: o.stars,
      perfect: o.perfect,
      first: noted.first,
      food: served.item.state?.meal?.food ?? 0,
      more: !served.last,
      reason: o.fail
        ? o.fail === 'mess'
          ? noted.newFail
            ? '这个搭配做不成菜，记进食谱本了，下次下锅时会提醒。'
            : '这个搭配做不成菜。'
          : o.fail === 'burnt'
            ? '火候过了，下次早点出锅。'
            : '还没熟：肉、鱼和蛋要多煮一会儿。'
        : noted.firstPerfect && !noted.first
          ? '第一次做到完美！'
          : served.missed.length
            ? `差一点完美：下次${served.missed.map((m) => MISSED[m]).join('、')}。`
            : '',
    };
    // (no page to draw the card on: its words in the toast)
    const say = (text: string): void => (this.bookUi ? this.bookUi.reveal(card) : ctx.ui.say(card.reason && !card.fail ? `${text} · ${card.reason}` : text, 3.6));
    if (o.fail) {
      ctx.sound('plate_clink', 0.8);
      this.soon('dish_fail', 1, 0.18);
      say(o.fail === 'mess' ? `做砸了：${o.zh}。${noted.newFail ? '这个搭配记进食谱本了，下次锅上会提醒。' : ''}` : o.fail === 'burnt' ? `做砸了：${o.zh}。下次早点出锅。` : `做砸了：${o.zh}。肉、鱼和蛋要多煮一会儿。`);
    } else {
      // the clink of the china, the reveal by the dish's stars, a chime for a perfect one, the pencil for a new recipe
      ctx.sound('plate_clink', 1);
      this.soon(`loot_reveal_${Math.max(1, Math.min(5, o.stars))}`, 1, 0.22);
      if (o.perfect) this.soon('clean_ding', 0.7, 0.8);
      if (noted.first) this.soon('book_write', 1, 1.05);
      const head = o.perfect ? `完美的${o.zh}` : o.zh;
      say(`${noted.first ? '新菜谱！' : ''}${head} ${stars}${noted.firstPerfect && !noted.first ? ' · 第一次做到完美' : ''}${served.last ? '' : ' · 锅里还有一份'}`);
    }
    this.onServed?.(u, { zh: o.zh, stars: o.stars, perfect: o.perfect, fail: !!o.fail, first: noted.first });
  }

  /** the thing in the hands set down at a place, facing the one who puts it there (a stack: one of it) */
  setDown(held: NonNullable<Held>, at: PlaceAt): void {
    const ctx = this.game;
    if (!ctx || held.kind !== 'item') return;
    const item = this.spend(ctx, held);
    const l = ctx.loose.addItem(item, at.x, at.y + 0.012, at.z, at.yaw);
    ctx.loose.drop(l);
    ctx.sound('putdown', itemDef(item.item).mass);
  }

  // ------------------------------------------------------------------ the hands

  /** one of what is in the hands used up: one off its stack (a new thing), or the thing itself, out of its slot */
  private spend(ctx: GameContext, held: NonNullable<Held>): ItemInstance {
    if (held.kind !== 'item') throw new Error('only things are spent');
    const it = held.item;
    if (countOf(it) > 1) {
      const one = splitStack(it, 1);
      if (one) return one;
    }
    const p = ctx.player;
    const i = p.slots.indexOf(held);
    if (i >= 0) p.slots[i] = null;
    return it;
  }

  /** a thing into the hands (select: into the hand itself when it gets a slot of its own); with no room, at one's feet */
  private hand(ctx: GameContext, item: ItemInstance, select = false): void {
    const p = ctx.player;
    const h = { kind: 'item' as const, item };
    if (p.receive(h) > 0) {
      const w = p.walker;
      ctx.loose.drop(ctx.loose.addItem(item, w.x + Math.cos(w.heading) * 0.6, w.y + 0.9, w.z + Math.sin(w.heading) * 0.6, w.heading));
      ctx.ui.say('手上没地方了：放在脚边了。', 2);
      return;
    }
    const at = p.slots.indexOf(h);
    if (at >= 0 && (select || !p.held)) p.sel = at;
  }

  /** a meal eaten: it feeds what this serving says, and the plate or the bowl is back in the hands */
  ate(ctx: GameContext, item: ItemInstance): void {
    const meal = item.state?.meal;
    if (!meal) return;
    if (meal.food > 0) eat(ctx.body, meal.food, 0);
    if (FAILED.has(item.item)) {
      ctx.sound('yuck', 1);
      ctx.ui.say(item.item === dishItem('burnt') ? '一股焦味……总算填了点肚子。' : item.item === dishItem('raw') ? '还是生的……下次多煮一会儿。' : '说不上是什么味道……总算填了点肚子。', 2.6);
    }
    if (meal.ware) this.hand(ctx, newItem(meal.ware));
  }

  // ------------------------------------------------------------------ ghosts: where the thing in the hands can go

  private ghost(unit: Unit | null, slot: GhostAt['slot'], item: string, focused: boolean, at: PlaceAt | null): void {
    const g = (this.ghostPool[this.ghosts.length] ??= { unit: null, slot: 'place', item: '', focused: false, at: null });
    g.unit = unit;
    g.slot = slot;
    g.item = item;
    g.focused = focused;
    g.at = at;
    this.ghosts.push(g);
  }

  private findGhosts(ctx: GameContext): void {
    while (this.ghosts.length > 0) this.ghosts.pop();
    const p = ctx.player;
    const held = ctx.seated ? null : p.held;
    if (held?.kind !== 'item') return;
    const id = held.item.item;
    const kind = kitKind(id);
    const portion = portionOfItem(id);
    const t = p.target;
    const on = t?.kind === 'device' ? t.device : null;
    if (kind || portion) {
      const w = p.walker;
      for (let i = 0; i < this.list.length; i++) {
        const u = this.list[i];
        if (u.busy > 0 || u.loose.shut || dist2(u.loose.x - w.x, u.loose.z - w.z) > 3.4) continue;
        const it = u.item;
        const dv = on instanceof KitDevice && on.unit === u ? on : null;
        // (on a stove the burner is where things go: the mark on its knob or its bay is not on them — a canister goes in from anywhere)
        const focused = !!dv && (dv.part === 'all' || dv.part === 'top' || kind === 'gas');
        if (u.kind === 'stove' && kind === 'gas') this.ghost(u, 'can', id, focused, null);
        else if (u.kind === 'stove' && kind === 'vessel' && WAYS[WAY_OF[id]].heats && (WAY_OF[id] === 'steam' ? !steamLack(it) : !vesselOf(it))) this.ghost(u, 'pot', id, focused, null);
        else if (portion && u.kind === 'board' && !boardLack(it, portion)) this.ghost(u, 'food', id, focused, null);
        // (a vessel standing about empty is a thing put away: its ghost only when the mark is on it — a bowl is used where it stands)
        else if (portion && (u.kind === 'vessel' || u.kind === 'stove') && vesselOf(it) && !addLack(it) && !asksStir(it) && (focused || u.kind === 'stove' || !!potOf(it) || !WAYS[WAY_OF[vesselOf(it)!]].heats)) this.ghost(u, 'food', id, focused, null);
      }
    }
    // set down in the world: when that is what E would do now
    if (on === this.placer && this.placer.at && this.placer.seen >= this.frames - 2) this.ghost(null, 'place', id, true, this.placer.at);
  }

  // ------------------------------------------------------------------ for the tests and the developer's tab

  telemetry(): Record<string, unknown> {
    return {
      units: this.list.map((u) => ({
        item: u.item.item,
        kit: JSON.parse(JSON.stringify(kitOf(u.item))) as unknown,
        phase: u.kind === 'stove' || u.kind === 'vessel' ? phaseOf(u.item) : undefined,
        x: Math.round(u.loose.x * 100) / 100,
        z: Math.round(u.loose.z * 100) / 100,
        riding: !!u.loose.riding,
      })),
      ghosts: this.ghosts.map((g) => `${g.slot}:${g.item}${g.focused ? '*' : ''}`),
      made: Object.keys(this.book.made).length,
      fails: this.book.fails.length,
    };
  }

  dispose(): void {
    this.view?.dispose();
    this.view = null;
    this.bookUi?.dispose();
    this.bookUi = null;
    this.units.clear();
    this.list.length = 0;
    this.game = null;
  }
}
