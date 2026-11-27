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
import { dine } from '../../../../core/modcar/vitals';
import { firstTip, knownFail, meet, newBook, note, pinned, asksFor, type BookData } from '../../../../core/v3/kitchen/book';
import { POT_MAX } from '../../../../core/v3/kitchen/cook';
import { DISHES, WAYS, type DishDef, type Way } from '../../../../core/v3/kitchen/dishes';
import type { BuffId } from '../../../../core/v3/cooking/types';

/** what a dish leaves behind by how it was cooked */
const WAY_BUFF: Record<Way, BuffId> = { fry: 'vigor', boil: 'warm', mix: 'hydrated', grill: 'hearty', steam: 'hearty', bake: 'hearty', brew: 'hydrated' };
/** the dishes by their item */
const DISH_OF = new Map<string, DishDef>(DISHES.map((d) => [`dish_${d.id}`, d]));
import { BOARD, dishItem, GAS, GAS_FULL, itemOfPortion, SPICE, STOVE2, WAY_OF, type Portion } from '../../../../core/v3/kitchen/items';
import {
  addLack, addPortion, asksStir, boardLack, boardPut, boardTake, burnersOf, gasFeed, chop, CHOPS, dishUp, electric, fireOf, gasOf, hasCanister, isStove, kitKind, kitOf, loadCanister, nextSeasoning, phaseOf,
  potOf, putVessel, ready, removePortion, seasonPot, servingsLeft, setFire, steamLack, stir, stoveStep, takeCanister, takeVessel, toss, TOSSES, underOf, vesselOf, wayOf,
  type KitKind, type Missed, type Phase, type StoveTick,
} from '../../../../core/v3/kitchen/kit';
import { FOOD_LOOK } from '../../../../core/v3/kitchen/looks';
import { FOOD } from '../../../../core/v3/kitchen/pantry';
import { classOf, portionOfItem } from '../../../../core/v3/kitchen/standins';
import type { GarageDevice } from '../../garageStub';
import { itemCardKept, type ItemCard } from '../../itemInfo';
import { itemNow } from '../../itemTime';
import { powerOf, type GameContext } from '../../kernel/context';
import type { InteractSource, PlanPoint } from '../../kernel/interact';
import type { Loose } from '../../loose';
import { heldOf, type Held } from '../../player';
import { placeSlots, type SlotAim, type SlotSource } from '../nd-place/slots';

const T = (zh: string, en: string): Text => ({ zh, en });

/** how far from the eye a thing can be set down where one aims (m) */
const PLACE_REACH = 2.5;
/** how high the steamer stands over the burner on the pot of water it is set on: the pot's rim (cookware.py kit_pot) */
export const STEAMER_LIFT = 0.131;
/** the seasonings on the table reach a pot this near (m) */
const SPICE_REACH = 1.6;
/**
 * At the kitchen (docs/V3/plan/finish.md §八 6: 灶台视角): the mark resting on one of its things from within this (m),
 * for this long (s), draws the view in so far (things look a fifth bigger); it lets go this long after the mark has
 * left (s) — in over 0.15 s, out over 0.3. One of its things lying this low against the feet (m): one crouches to it.
 */
const LEAN_REACH = 1.3;
const LEAN_DWELL_S = 0.12;
const LEAN_ZOOM = 1.22;
const LEAN_HOLD_S = 0.3;
const LEAN_LOW = 0.5;
/** off: the view is never drawn in at the kitchen, nor does one crouch to it by oneself — as on 11-24 (docs/V3/plan/finish.md §十八, 界面恢复) */
const LEAN_ON = false;
/**
 * A lit stove warms the air round it (docs/V3/plan/finish.md §三 2): so many °C on a high flame (seven tenths of it on
 * a low one) within the first of these distances (m), none beyond the second
 */
const STOVE_WARM_C = 10;
const STOVE_WARM_M: readonly [number, number] = [1.6, 3.2];

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

/** a two-burner stove's halves: how far each burner's parts lie from the thing's middle along its width (m; the first to its left) */
const BURNER_DZ = 0.19;

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
  // (lifting a pot is on the pot's own words: only where the book is, which nothing on the screen shows — a page of the
  // Tab screen since the keys were made one: docs/V3/plan/finish.md §十三)
  start: '菜谱在 Tab 里',
  cut: '切过熟得快',
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
    this.id = `kitchen:${unit.key}:${part}`;
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

  /** what it waits for, pressed now (null: it does something) — docs/V3/plan/prompts.md §五 */
  get why(): Text | null {
    return this.sys.whyOf(this);
  }

  get alt(): { word: Text; use(): void } | null {
    return this.sys.altOf(this);
  }

  grabbable(): NonNullable<Held> | null {
    return this.sys.grabbableOf(this);
  }

  grab(): boolean {
    return this.sys.grabOf(this);
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

  /**
   * where the line of sight meets it: its own boxes (a stove's part), or its model's box, a hand's breadth more all
   * round — riding in a vehicle too, where it is met (appliances' hit says why)
   */
  hit(ray: THREE.Ray, reach: number): number | null {
    return this.along(ray, reach);
  }

  /** how far along the line of sight it is met, within reach (null: not) */
  along(ray: THREE.Ray, reach: number): number | null {
    const l = this.unit.loose;
    this.inv.copy(l.obj.matrixWorld).invert();
    this.lray.copy(ray).applyMatrix4(this.inv);
    let d = Infinity;
    if (this.part !== 'all') {
      const dz = this.unit.dz;
      for (const b of STOVE_BOXES[this.part]) {
        this.b3.min.set(b[0], b[2], b[4] + dz);
        this.b3.max.set(b[1], b[3], b[5] + dz);
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
    return d <= reach ? d : null;
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
    /** a two-burner stove's burner (0, 1), each a unit of its own; −1: the thing itself */
    readonly burner = -1,
  ) {
    this.kind = burner >= 0 ? 'stove' : kitKind(loose.item!.item)!;
    // (a hob has no bay: its plate and its knob)
    this.devices =
      this.kind === 'stove'
        ? electric(this.item)
          ? [new KitDevice(sys, this, 'top'), new KitDevice(sys, this, 'knob')]
          : [new KitDevice(sys, this, 'top'), new KitDevice(sys, this, 'knob'), new KitDevice(sys, this, 'bay')]
        : [new KitDevice(sys, this, 'all')];
  }

  /** the thing its state is on: its own, or (a two-burner stove's burner) the stove kept on that thing for it */
  get item(): ItemInstance {
    return this.burner >= 0 ? burnersOf(this.loose.item!)[this.burner] : this.loose.item!;
  }

  /** a name of its own among the units (a two-burner stove's two share a thing) */
  get key(): string {
    return this.burner >= 0 ? `${this.loose.uid}:b${this.burner}` : this.loose.uid;
  }

  /** how far its parts lie from the thing's middle along its width (m): a two-burner stove's halves */
  get dz(): number {
    return this.burner < 0 ? 0 : this.burner === 0 ? BURNER_DZ : -BURNER_DZ;
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
  book: BookData = newBook();
  /** the thing last seen in the hands (its uid): an ingredient is noted in the book as it comes into them */
  private metUid = '';
  /** the view drawn in at the kitchen: how far (0 … 1), how long the mark has rested on it, how long since it left, whether what it rests on is low */
  private lean = 0;
  private leanDwell = 0;
  private leanAway = 9;
  private leanLow = false;
  private readonly units = new Map<Loose, Unit>();
  readonly list: Unit[] = [];
  private rev = -1;
  /** a vessel with food in it is in the hands: the plates and bowls lying about are places to dish up onto then */
  private pourV = false;
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

  /** the warmth of the lit stoves told to the game (GameContext.warmers): once */
  private readonly warmer = (x: number, z: number): number => this.warmthAt(x, z);

  init(ctx: GameContext): void {
    this.game = ctx;
    if (!ctx.warmers.includes(this.warmer)) ctx.warmers.push(this.warmer);
    // (the burners are places a vessel held out to be placed goes onto: nd-place asks them)
    const slots = placeSlots(ctx);
    if (!slots.includes(this.burners)) slots.push(this.burners);
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
    if (kitKind(item) || item === STOVE2) return true;
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
      const double = it.item === STOVE2;
      const kind = double ? 'stove' : kitKind(it.item);
      // (a canister lying there is a thing to pick up, no more; a plate or a bowl too — but for a pot with food in
      // the hands, which dishes up onto it where it lies: docs/V3/plan/growth.md §一 4)
      if (!kind || kind === 'gas' || (kind === 'ware' && !this.pourV)) continue;
      seen.add(l);
      l.device = true;
      if (!this.units.has(l)) {
        // (a two-burner stove: a unit for each burner; the thing itself is found by its first)
        const us = double ? [new Unit(this, l, 0), new Unit(this, l, 1)] : [new Unit(this, l)];
        this.units.set(l, us[0]);
        for (const u of us) this.list.push(u);
      }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const u = this.list[i];
      if (seen.has(u.loose)) continue;
      // (a plate no longer a place for the pot: picked up as any thing lying about again)
      if (u.kind === 'ware') u.loose.device = false;
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
    // (a pot with food in the hands, or not: the plates lying about are found again as what they are to it)
    const inHand = ctx.player.held;
    const pv = inHand?.kind === 'item' && kitKind(inHand.item.item) === 'vessel' && (potOf(inHand.item)?.items.length ?? 0) > 0;
    if (pv !== this.pourV) {
      this.pourV = pv;
      this.rev = -1;
    }
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
    if (held?.kind === 'item' && isStove(held.item.item) && fireOf(held.item)) setFire(held.item, 0);
    if (held?.kind === 'item' && held.item.item === STOVE2) for (const b of burnersOf(held.item)) if (fireOf(b)) setFire(b, 0);
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
          ctx.ui.say('燃气罐空了', 2.4);
        }
      }
      if (!close || !t.after || t.after === t.before) {
        if (close && t.asked) this.sayAsk(ctx, u);
        continue;
      }
      if (t.after === 'right') {
        ctx.sound('clean_ding', 0.5);
        const w = wayOf(u.item);
        ctx.ui.say(w ? READY[w] : READY.fry, 2.2);
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
    ctx.ui.say(`${STIR[way].zh}！`, 2);
  }

  /**
   * An ingredient come into the hands is met (docs/V3/plan/finish.md §八 5): the first of its kind brings into the
   * recipe book the dishes not made yet that it completes, and that is said in a line
   */
  private meetHeld(ctx: GameContext): void {
    const h = ctx.player.held;
    const uid = h?.kind === 'item' ? h.item.uid : '';
    if (uid === this.metUid) return;
    this.metUid = uid;
    if (h?.kind !== 'item') return;
    const p = portionOfItem(h.item.item);
    const more = p ? meet(this.book, p.id) : [];
    if (more.length) ctx.ui.say(`菜谱里多了 ${more.length} 道没做过的菜`, 3.5);
  }

  /** how many °C the lit stoves add to the air at a point (GameContext.warmers): the warmest of them there, by how near it is and how high its flame */
  warmthAt(x: number, z: number): number {
    let warm = 0;
    for (const u of this.list) {
      if (u.kind !== 'stove') continue;
      const fire = fireOf(u.item);
      if (!fire) continue;
      const d = Math.hypot(u.loose.x - x, u.loose.z - z);
      if (d >= STOVE_WARM_M[1]) continue;
      const k = d <= STOVE_WARM_M[0] ? 1 : 1 - (d - STOVE_WARM_M[0]) / (STOVE_WARM_M[1] - STOVE_WARM_M[0]);
      warm = Math.max(warm, STOVE_WARM_C * k * (fire === 2 ? 1 : 0.7));
    }
    return warm;
  }

  /**
   * The view at the kitchen (docs/V3/plan/finish.md §八 6): the mark resting on one of its things from close by, the
   * view is drawn in a little — and, the thing on the ground, one crouches to it; it lets go a moment after the mark
   * has left. Told to the game every frame (GameContext.workZoom, workCrouch).
   */
  private leanIn(dt: number, ctx: GameContext): void {
    if (!LEAN_ON) {
      ctx.workZoom = 1;
      ctx.workCrouch = false;
      return;
    }
    const t = ctx.player.target;
    const dv = t?.kind === 'device' && t.device.id.startsWith('kitchen:') ? t.device : null;
    const w = ctx.player.walker;
    const at = !!dv && !ctx.seated && Math.hypot(dv.x - w.x, dv.z - w.z) < LEAN_REACH;
    if (at) {
      this.leanDwell += dt;
      this.leanAway = 0;
      this.leanLow = dv!.y - w.y < LEAN_LOW;
    } else {
      this.leanDwell = 0;
      this.leanAway += dt;
    }
    const on = (at && this.leanDwell >= LEAN_DWELL_S) || (this.lean > 0.01 && this.leanAway < LEAN_HOLD_S);
    this.lean += ((on ? 1 : 0) - this.lean) * (1 - Math.exp(-dt / (on ? 0.05 : 0.1)));
    if (this.lean < 0.002) this.lean = 0;
    const k = this.lean * this.lean * (3 - 2 * this.lean);
    ctx.workZoom = 1 + (LEAN_ZOOM - 1) * k;
    ctx.workCrouch = on && this.leanLow;
  }

  lateUpdate(dt: number, ctx: GameContext): void {
    this.refresh(ctx);
    this.meetHeld(ctx);
    this.leanIn(dt, ctx);
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
      // (a hob heats without a sound of its own)
      if (!electric(u.item)) flame = Math.max(flame, near * hot);
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

  /**
   * the recipe book opened or shut (a page of the Tab screen: D from the lists turns to it; the tests and the
   * developer's tab ask here) — through the game's Tab screen where there is one, so that it knows a page is open
   */
  showBook(open?: boolean): boolean {
    const ui = this.bookUi;
    if (!ui) return false;
    const want = open ?? !ui.open;
    const ctx = this.game;
    if (want && ctx?.openTab) ctx.openTab('recipes');
    else if (!want && ctx?.closeTab && ui.open) ctx.closeTab();
    else ui.toggle(want);
    return ui.open;
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
    if (u.busy > 0) return T('换罐', 'Changing the canister');
    if (d.part === 'knob' && electric(it)) return fireOf(it) ? T('关掉电炉', 'Switch the hotplate off') : T('打开电炉', 'Switch the hotplate on');
    if (d.part === 'knob') return fireOf(it) ? T('关火', 'Turn the flame off') : T('点火', 'Light it');
    if (d.part === 'bay') return hasCanister(it) ? T('取出燃气罐', 'Take the canister out') : T('装燃气罐', 'Put a canister in');
    if (u.kind === 'board') {
      const f = kitOf(it).food;
      if (!f) return T('放食材', 'Put food on it');
      if (f.cut) return T(`拿起 <b>${portionName(f)}</b>`, `Take the cut <b>${portionName(f, 'en')}</b>`);
      return T(`切 <b>${portionName(f)}</b>`, `Cut the <b>${portionName(f, 'en')}</b>`);
    }
    if (u.kind === 'spice') {
      const pot = this.potNear(u);
      const s = pot ? nextSeasoning(pot.item) : null;
      return s ? T(`撒 <b>${s.zh}</b>`, `A pinch of <b>${s.en.toLowerCase()}</b>`) : T('撒调料', 'Season');
    }
    if (u.kind === 'ware') return T('装盘', 'Dish it up');
    // the burner of a stove, or a vessel by itself: what to do, else how the pot is (a word)
    const v = vesselOf(it);
    if (!v) return T('放锅', 'Set a vessel on it');
    const pot = potOf(it);
    if (!pot) return T('放食材', 'Put food in');
    const way = WAY_OF[v];
    if (pot.out) return T('装盘', 'Dish it up');
    if (!WAYS[way].heats) return Math.round((pot.toss ?? 0) * TOSSES) >= TOSSES ? T('装盘', 'Dish it up') : T(STIR.mix.zh, STIR.mix.en);
    if (asksStir(it)) return T(`<b>${STIR[way].zh}！</b>`, `<b>${STIR[way].en}!</b>`);
    const ph = phaseOf(it);
    const lit = u.kind === 'stove' && fireOf(it) > 0;
    if (!lit && (pot.done ?? 0) <= 0.2) return T(`取回 <b>${portionName(pot.items[pot.items.length - 1])}</b>`, `Take the ${portionName(pot.items[pot.items.length - 1], 'en').toLowerCase()} back`);
    return ph === 'right' ? T(`<b>${PHASE.right.zh}</b>`, `<b>${PHASE.right.en}</b>`) : T(PHASE[ph].zh, PHASE[ph].en);
  }

  /** what a part waits for, pressed now (null: it does something) */
  whyOf(d: KitDevice): Text | null {
    const u = d.unit;
    const it = u.item;
    if (u.busy > 0) return T('正在换', 'Changing the canister');
    if (d.part === 'knob') {
      if (fireOf(it)) return null;
      if (electric(it)) {
        const p = this.game ? powerOf(this.game, u.loose) : null;
        return p === 'on' ? null : p === 'flat' ? T('没电了', 'The batteries are flat') : T('放到车里才有电', 'Only in a vehicle is there power');
      }
      // (a two-burner stove's burner lights from the other bay's canister too: gasFeed)
      const feed = gasFeed(it);
      if (!hasCanister(feed)) return T('先装燃气罐', 'It needs a canister');
      return gasOf(feed) <= 0 ? T('燃气罐空了', 'The canister is empty') : null;
    }
    if (d.part === 'bay') return hasCanister(it) ? null : T('拿着燃气罐', 'Bring a canister');
    if (u.kind === 'board') return kitOf(it).food ? null : T('拿着食材', 'Bring something to cut');
    if (u.kind === 'ware') return null;
    if (u.kind === 'spice') {
      const pot = this.potNear(u);
      if (!pot) return T('旁边没有锅', 'No pot near');
      return nextSeasoning(pot.item) ? null : T('都加过了', 'All six are in');
    }
    const v = vesselOf(it);
    if (!v) return T('拿着锅', 'Bring a vessel');
    const pot = potOf(it);
    if (!pot) return T('拿着食材', 'Bring some food');
    const way = WAY_OF[v];
    if (pot.out || (!WAYS[way].heats && Math.round((pot.toss ?? 0) * TOSSES) >= TOSSES)) return T('拿着盘子或碗', 'Bring a plate or a bowl');
    return null;
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
    return null;
  }

  /** a stand-in for a kind in the hands, to ask whether there is room for it (made once a kind) */
  private readonly proxies = new Map<string, NonNullable<Held>>();
  private proxy(id: string): NonNullable<Held> {
    let h = this.proxies.get(id);
    if (!h) this.proxies.set(id, (h = { kind: 'item', item: newItem(id) }));
    return h;
  }

  /**
   * What the left button held on a part of a unit takes up (docs/V3/plan/growth.md J1): the vessel standing on a
   * burner, what lies on the board — else the cookware itself. Null while it is being worked.
   */
  grabbableOf(d: KitDevice): NonNullable<Held> | null {
    const u = d.unit;
    if (u.busy > 0) return null;
    const it = u.item;
    if (d.part === 'top') {
      const v = vesselOf(it);
      if (v) return this.proxy(v);
    }
    if (u.kind === 'board') {
      const f = kitOf(it).food;
      if (f) return this.proxy(itemOfPortion(f));
    }
    return heldOf(u.loose);
  }

  /** …and takes it into the hands (true: taken) */
  grabOf(d: KitDevice): boolean {
    const u = d.unit;
    const ctx = this.game;
    if (!ctx || u.busy > 0) return false;
    if (d.part === 'top' && vesselOf(u.item)) {
      this.liftVessel(u);
      return !vesselOf(u.item);
    }
    if (u.kind === 'board' && kitOf(u.item).food) {
      this.offBoard(u);
      return !kitOf(u.item).food;
    }
    return ctx.player.takeLoose(u.loose);
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
      if (!f) return;
      if (f.cut) return this.offBoard(u);
      const n = chop(it);
      u.chopped++;
      ctx.sound('chop', 1);
      ctx.loose.touch(u.loose);
      if (n >= CHOPS) ctx.player.flashWhy('切好了');
      return;
    }
    if (u.kind === 'spice') {
      const pot = this.potNear(u);
      if (!pot) return;
      return this.pinch(pot);
    }
    if (u.kind === 'ware') return;
    const v = vesselOf(it);
    if (!v) return;
    const pot = potOf(it);
    if (!pot) return;
    const way = WAY_OF[v];
    if (pot.out) return;
    if (!WAYS[way].heats) {
      if (ready(it)) return;
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
    if (phaseOf(it) === 'right') ctx.ui.say('火候正好！', 2);
  }

  // ------------------------------------------------------------------ E with something in the hands

  takeOf(d: KitDevice, held: NonNullable<Held>): { ok: boolean; word: Text; keep?: boolean } | null {
    if (held.kind !== 'item') return null;
    const u = d.unit;
    const it = u.item;
    const id = held.item.item;
    const kind = kitKind(id);
    const no = (zh: string, en: string): { ok: boolean; word: Text } => ({ ok: false, word: T(zh, en) });
    if (u.busy > 0) return kind || portionOfItem(id) ? no('正在换', 'Changing the canister…') : null;
    // a plate or a bowl lying about, a pot with food in the hands: dished up where it lies
    if (u.kind === 'ware') {
      if (kind !== 'vessel') return null;
      const pot = potOf(held.item);
      if (!pot || !pot.items.length) return no('空的', 'There is nothing in it');
      if (!ready(held.item)) return no('还没拌好', 'Not tossed yet');
      return { ok: true, word: T('装盘', 'Dish it up'), keep: true };
    }
    if (u.kind === 'stove') {
      if (kind === 'gas') {
        const fresh = pct(gasOf(held.item));
        void fresh;
        if (!hasCanister(it)) return { ok: true, word: T('装燃气罐', 'Put the canister in') };
        return { ok: true, word: T('换燃气罐', 'Change the canister') };
      }
      // (the knob is the knob and the bay the bay, whatever else is in the hands: E turns the one and empties the other)
      if (d.part !== 'top') return null;
      if (kind === 'vessel') {
        if (!WAYS[WAY_OF[id]].heats) return no('不用火', 'A bowl needs no flame');
        // (the steamer stands on a pot of water, never on the flame)
        if (WAY_OF[id] === 'steam') {
          const lack = steamLack(it);
          if (lack === 'nopot') return no('先放汤锅', 'A steamer stands on a pot of water: set an empty pot on the burner first');
          if (lack === 'potfull') return no('汤锅里有东西：蒸笼要架在空汤锅上', 'The pot has food in it: the steamer goes on an empty one');
          if (lack === 'taken') return no(`炉头上已经有${nameOf(vesselOf(it)!)}了`, 'Something is on the burner');
          return { ok: true, word: T('架上蒸笼', 'Set the <b>steamer</b> on the pot') };
        }
        const on = vesselOf(it);
        // (one on it already: the one in the hands goes on, that one comes into them — not one with a steamer on it)
        if (on && underOf(it)) return no('先端走蒸笼', 'Take the steamer off first');
        if (on) return { ok: true, word: T('换锅', `Swap the ${nameOf(on, 'en').toLowerCase()} for the <b>${nameOf(id, 'en').toLowerCase()}</b>`) };
        return { ok: true, word: T('放上炉头', `Set the <b>${nameOf(id, 'en').toLowerCase()}</b> on the burner`) };
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
      return { ok: true, word: T('放上案板', `Put the <b>${portionName(p, 'en').toLowerCase()}</b> on the board`), keep: true };
    }
    if (u.kind === 'spice') return null;
    // into, onto and out of the vessel
    const v = vesselOf(it);
    const p = portionOfItem(id);
    // (it asks to be stirred: that is what E does now, whatever is in the hands — the plate and the next thing wait a press)
    if (v && asksStir(it) && (p || kind === 'ware' || kind === 'spice')) return null;
    if (p) {
      if (!v) return no('先放锅', 'Set a vessel on the burner first');
      const lack = addLack(it);
      if (lack === 'full') return no('满了', 'It is full');
      if (lack === 'served') return no('先装完剩下的', 'Dish up what is left first');
      if (lack === 'burnt') return no('焦了', 'It is burnt');
      const pot = potOf(it);
      const n = pot?.items.length ?? 0;
      const way = WAY_OF[v];
      // (these things, this way, came to nothing before: said before they go in)
      const failed = knownFail(this.book, way, [...(pot?.items.map((x) => x.id) ?? []), p.id]);
      const pin = pinned(this.book);
      const wanted = pin && pin.way === way && asksFor(pin, p.id) ? `「${pin.zh}」要 · ` : '';
      return {
        ok: true,
        // (a known failure, a pinned recipe asking for it: said with it, as it goes in — a hint where it counts)
        word: T(`${wanted}放进 <b>${portionName(p)}</b>${failed ? ' · <b>上次砸了</b>' : ''}`, `${WAYS[way].en}: add the <b>${portionName(p, 'en').toLowerCase()}</b> (${n + 1}/${POT_MAX})`),
        keep: true,
      };
    }
    if (kind === 'ware') {
      if (!v) return null;
      const pot = potOf(it);
      if (!pot) return no('空的', 'There is nothing in it');
      if (!ready(it)) return no('还没拌好', 'Not tossed yet');
      const ph = WAYS[WAY_OF[v]].heats ? phaseOf(it) : 'right';
      void ph;
      return { ok: true, word: T('装盘', 'Dish it up'), keep: true };
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
        ctx.player.flashWhy('换好了');
      } else ctx.player.flashWhy('装好了');
      return;
    }
    if (u.kind === 'ware') return this.serveOnto(u, held);
    if (u.kind === 'stove' && kind === 'vessel') {
      // (a vessel on the burner already, and the one in the hands no steamer: they change places)
      const old = WAY_OF[id] !== 'steam' && vesselOf(it) && !underOf(it) ? takeVessel(it) : null;
      if (!putVessel(it, held.item)) {
        if (old) putVessel(it, old);
        return void this.hand(ctx, held.item);
      }
      u.added++;
      ctx.sound('pan_place', 1);
      ctx.loose.touch(u.loose);
      if (old) {
        ctx.sound('pan_lift', 0.8);
        this.hand(ctx, old, true);
      }
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
    const hob = electric(u.item);
    const lack = setFire(u.item, level, hob ? powerOf(ctx, u.loose) : undefined);
    // (lit: the igniter and the gas catching; out: the burner's pop; up or down a notch, or nothing to light: the knob; a
    // hob's switch clicks)
    ctx.sound(lack || hob ? 'knob_click' : level === 0 ? (was ? 'flame_out' : 'knob_click') : was ? 'knob_click' : 'ignite', 1);
    if (lack === 'flat') ctx.player.flashWhy('没电了');
    else if (lack === 'nopower') ctx.player.flashWhy('放到车里才有电');
    if (lack) return;
    ctx.loose.touch(u.loose);
  }

  /** the canister out of the bay, into the hands */
  outCanister(u: Unit): void {
    const ctx = this.game;
    if (!ctx) return;
    if (!hasCanister(u.item)) return;
    if (ctx.player.roomFor({ kind: 'item', item: newItem(GAS) }) <= 0) return ctx.player.flashWhy('手满了');
    const can = takeCanister(u.item)!;
    u.swap = { old: true, put: false };
    u.busy = 1.3;
    ctx.loose.touch(u.loose);
    this.hand(ctx, can);
    ctx.player.flashWhy(gasOf(can) <= 0 ? '空罐' : `还剩 ${pct(gasOf(can))}%`);
  }

  /** the vessel off the burner, into the hands with what is in it */
  liftVessel(u: Unit): void {
    const ctx = this.game;
    if (!ctx) return;
    const v = vesselOf(u.item);
    if (!v) return;
    if (ctx.player.roomFor({ kind: 'item', item: newItem(v) }) <= 0) return ctx.player.flashWhy('手满了');
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
    if (ctx.player.roomFor({ kind: 'item', item }) <= 0) return ctx.player.flashWhy('手满了');
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
    if (!s || !seasonPot(u.item, s.id)) return ctx.player.flashWhy('都加过了');
    u.stirred++;
    ctx.sound('shake', 1);
    ctx.loose.touch(u.loose);
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
    u.served = { perfect: served.outcome.perfect, fail: !!served.outcome.fail, stars: served.outcome.stars };
    ctx.loose.touch(u.loose);
    this.hand(ctx, served.item, true);
    this.announce(served, u);
  }

  /**
   * A serving out of the vessel in the hands onto the plate or into the bowl lying about (docs/V3/plan/growth.md §一 4:
   * 端着锅对着盘子): the plate where it lies becomes the dish; of a stack, the top one does and the rest stays.
   */
  serveOnto(w: Unit, held: NonNullable<Held>): void {
    const ctx = this.game;
    if (!ctx || held.kind !== 'item') return;
    const l = w.loose;
    const ware = l.item!;
    const served = dishUp(held.item, ware.item, classOf);
    if (!served) return;
    if (countOf(ware) > 1) {
      splitStack(ware, 1);
      ctx.loose.touch(l);
      const d = ctx.loose.addItem(served.item, l.x, l.y + 0.03, l.z, l.yaw);
      ctx.loose.drop(d);
    } else {
      l.item = served.item;
      ctx.loose.retype(l);
      ctx.loose.touch(l);
    }
    this.announce(served, null);
  }

  /** a serving said: the book notes it, its card or its toast, its sounds */
  private announce(served: NonNullable<ReturnType<typeof dishUp>>, u: Unit | null): void {
    const ctx = this.game;
    if (!ctx) return;
    const o = served.outcome;
    const noted = note(this.book, served.way, served.items, o);
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
            ? '做不成菜 · 记下了'
            : '做不成菜'
          : o.fail === 'burnt'
            ? '火候过了'
            : '还没熟'
        : noted.firstPerfect && !noted.first
          ? '第一次完美！'
          : served.missed.length
            ? `差一点：${served.missed.map((m) => MISSED[m]).join('、')}`
            : '',
    };
    // (no page to draw the card on: its words in the toast)
    const say = (text: string): void => (this.bookUi ? this.bookUi.reveal(card) : ctx.ui.say(card.reason && !card.fail ? `${text} · ${card.reason}` : text, 3.6));
    if (o.fail) {
      ctx.sound('plate_clink', 0.8);
      this.soon('dish_fail', 1, 0.18);
      say(`做砸了：${o.zh}`);
    } else {
      // the clink of the china, the reveal by the dish's stars, a chime for a perfect one, the pencil for a new recipe
      ctx.sound('plate_clink', 1);
      this.soon(`loot_reveal_${Math.max(1, Math.min(5, o.stars))}`, 1, 0.22);
      if (o.perfect) this.soon('clean_ding', 0.7, 0.8);
      if (noted.first) this.soon('book_write', 1, 1.05);
      const head = o.perfect ? `完美的${o.zh}` : o.zh;
      say(`${noted.first ? '新菜谱！' : ''}${head} ${stars}`);
    }
    if (u) this.onServed?.(u, { zh: o.zh, stars: o.stars, perfect: o.perfect, fail: !!o.fail, first: noted.first });
  }

  // ------------------------------------------------------------------ the burners as places to put a vessel held out

  /**
   * A stove's burner as a place a vessel held out to be placed goes onto (nd-place's slots — Nomad Drive's cooking
   * zones, which take a pan or a pot onto their middle turned any way round, one at a time): the nearest stove's top
   * the line of sight meets within reach, its burner free, the vessel in the hands one that goes on a flame (the steamer
   * onto an empty pot of water standing there). Set down, it stands turned as it was held and cooks as any vessel set on.
   */
  private readonly burners: SlotSource = { aim: (h, ray, reach) => this.burnerAim(h, ray, reach) };
  private readonly slot: SlotAim = { dist: 0, pos: new THREE.Vector3(), q: new THREE.Quaternion(), yaw: 0, word: '', put: (turn) => this.setOnBurner(turn) };
  private slotUnit: Unit | null = null;
  private slotHeld: NonNullable<Held> | null = null;
  private readonly ax = new THREE.Vector3();

  private burnerAim(h: NonNullable<Held>, ray: THREE.Ray, reach: number): SlotAim | null {
    this.slotUnit = null;
    this.slotHeld = null;
    if (!this.game || h.kind !== 'item') return null;
    const id = h.item.item;
    const way = WAY_OF[id];
    if (kitKind(id) !== 'vessel' || !way || !WAYS[way].heats) return null;
    const far = Math.min(reach, PLACE_REACH);
    // (of the stoves whose top the line of sight goes into, the one whose burner's middle — its model's place for the
    // vessel, M_pot; a two-burner stove's second M_pot_B — it passes nearest: four hobs in a row along a worktop, looked
    // at slantwise, the line goes over the next one's top on its way to the one looked at)
    let best: Unit | null = null;
    let bd = Infinity;
    let bm = Infinity;
    for (let i = 0; i < this.list.length; i++) {
      const u = this.list[i];
      if (u.kind !== 'stove' || u.busy > 0 || u.loose.shut) continue;
      if (way === 'steam' ? steamLack(u.item) : vesselOf(u.item)) continue;
      const top = u.devices.find((d) => d.part === 'top');
      const d = top?.along(ray, far) ?? null;
      if (d === null) continue;
      const mark = u.loose.obj.getObjectByName(u.burner > 0 ? 'M_pot_B' : 'M_pot');
      if (!mark) continue;
      u.loose.obj.updateWorldMatrix(true, true);
      const m = ray.distanceToPoint(mark.getWorldPosition(this.ax));
      if (m < bm - 1e-4 || (m < bm + 1e-4 && d < bd)) {
        bm = m;
        bd = d;
        best = u;
      }
    }
    if (!best) return null;
    const obj = best.loose.obj;
    const s = this.slot;
    obj.getObjectByName(best.burner > 0 ? 'M_pot_B' : 'M_pot')!.getWorldPosition(s.pos);
    obj.getWorldQuaternion(s.q);
    if (way === 'steam') s.pos.addScaledVector(this.ax.set(0, 1, 0).applyQuaternion(s.q), STEAMER_LIFT);
    this.ax.set(1, 0, 0).applyQuaternion(s.q);
    s.yaw = Math.atan2(this.ax.z, this.ax.x);
    s.dist = bd;
    s.word = way === 'steam' ? '架上蒸笼' : '放上炉头';
    this.slotUnit = best;
    this.slotHeld = h;
    return s;
  }

  /** the vessel held out set on the burner aimed at, turned so about the stove's up (rad): the stove's now, out of the hands */
  private setOnBurner(turn: number): boolean {
    const ctx = this.game;
    const u = this.slotUnit;
    const h = this.slotHeld;
    if (!ctx || !u || !h || h.kind !== 'item' || u.busy > 0) return false;
    if (!putVessel(u.item, h.item, turn)) return false;
    this.spend(ctx, h);
    u.added++;
    ctx.sound('pan_place', 1);
    ctx.loose.touch(u.loose);
    return true;
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
      ctx.player.flashWhy('手满了');
      return;
    }
    const at = p.slots.indexOf(h);
    if (at >= 0 && (select || !p.held)) p.sel = at;
  }

  /** a meal eaten: it feeds what this serving says, and the plate or the bowl is back in the hands */
  ate(ctx: GameContext, item: ItemInstance): void {
    const meal = item.state?.meal;
    if (!meal) return;
    // (a good dish mends: health back, two a star — half again done just right — and life with it; and a buff by how
    // it was cooked. A tin only feeds — docs/V3/plan/finish.md §三.)
    const dish = FAILED.has(item.item) ? undefined : DISH_OF.get(item.item);
    const k = meal.perfect ? 1.5 : 1;
    dine(ctx.body, meal.food, dish ? Math.round(dish.stars * 2 * k) : 0);
    if (dish && ctx.buffs) ctx.buffs.add(WAY_BUFF[dish.way], dish.stars * 240 * k, dish.way === 'brew' ? 'drink' : 'meal');
    if (FAILED.has(item.item)) {
      ctx.sound('yuck', 1);
      ctx.ui.say(item.item === dishItem('burnt') ? '焦味……' : item.item === dishItem('raw') ? '还是生的……' : '说不上什么味道……', 2);
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
    // (held out to be placed, the thing itself shows where it goes — onto a burner too: no ghosts of the button's)
    if (p.placer?.placing) return;
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
    if (this.game) {
      const slots = placeSlots(this.game);
      const i = slots.indexOf(this.burners);
      if (i >= 0) slots.splice(i, 1);
    }
    this.view?.dispose();
    this.view = null;
    this.bookUi?.dispose();
    this.bookUi = null;
    this.units.clear();
    this.list.length = 0;
    this.game = null;
  }
}
