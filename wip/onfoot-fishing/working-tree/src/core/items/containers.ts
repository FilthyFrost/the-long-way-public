/**
 * Containers to search (docs/DESIGN_V2.md 8.1): a crate, a toolbox, a shelf, a glovebox. Held
 * open (1.5 s, the pull of a drawer); what is inside is rolled once from its kind and seed
 * (loot.ts), so it is the same for every player and every time; it then lies in the container on
 * its shelf points as things one takes one by one (E) — or all that fits at once (hold E).
 * What is put back in stays.
 *
 * Each container is also a solid (its box, tagged with its id) that keeps walkers out.
 */
import { item } from './catalog';
import { canTake, take, takeAll, takeWord, type Carrier } from './carry';
import { ANY_SIZE, Inventory, type Stack } from './inventory';
import { rollLoot, type ContainerKind } from './loot';
import { pickRadius, sizeOf } from './shapes';
import type { Actor, Interactable, InteractSource, LongUse, Vec3 } from '../interact/interact';
import { Solid, solidWithin, type SolidSource } from '../world/solids';
import { CellIndex } from './grid';
import { VEHICLES } from '../vehicle/spec';

export const OPEN_HOLD = 1.5;
export const TAKE_ALL_HOLD = 0.8;

export interface ContainerDef {
  /** stable id (a site's: `${siteId}:${n}`) */
  id: string;
  kind: ContainerKind;
  /** centre of its base on the plan, the ground under it, its heading (solids' convention) */
  x: number;
  y: number;
  z: number;
  heading: number;
  seed: number;
  /** half length, height, half width (m) */
  hx: number;
  h: number;
  hz: number;
  /** how many places inside (default 6) */
  slots?: number;
  /** height of the shelf the things lie on, above its base (default 0.72 × h) */
  shelf?: number;
  /** extra rare share when rolling (well rested: 0.03) */
  rareBonus?: number;
  /** false: only a place to search (by a wreck's door, behind its boot) — it keeps nobody out (world: sites) */
  solid?: boolean;
}

export class Container {
  opened = false;
  readonly store: Inventory;
  readonly solid = new Solid();

  constructor(readonly def: ContainerDef) {
    this.store = new Inventory(def.slots ?? 6, ANY_SIZE);
    this.solid.set(def.x, def.z, def.hx, def.hz, def.heading, def.y - 0.1, def.y + def.h, false, def.id);
  }

  get id(): string {
    return this.def.id;
  }

  /** open it: the first time, its things are rolled (and the same things every time from the same seed) */
  open(): boolean {
    if (this.opened) return false;
    this.opened = true;
    const roll = rollLoot(this.def.kind, this.def.seed, this.def.rareBonus ?? 0);
    for (const s of roll) this.store.add(s.id, s.n);
    return true;
  }

  /** the world point where slot i's things lie */
  shelfPoint(i: number, out: Vec3): Vec3 {
    const d = this.def;
    const n = this.store.slots.length;
    const cols = Math.max(1, Math.min(n, Math.round(Math.sqrt((n * d.hx) / Math.max(0.05, d.hz)))));
    const rows = Math.ceil(n / cols);
    const c = i % cols;
    const r = Math.floor(i / cols);
    const u = (-1 + (2 * (c + 0.5)) / cols) * d.hx * 0.72;
    const v = (-1 + (2 * (r + 0.5)) / rows) * d.hz * 0.6;
    const cs = Math.cos(d.heading);
    const sn = Math.sin(d.heading);
    out.x = d.x + u * cs - v * sn;
    out.z = d.z + u * sn + v * cs;
    out.y = d.y + (d.shelf ?? d.h * 0.72);
    return out;
  }

  /** take all that fits; returns how many things moved */
  takeAllInto(c: Carrier): number {
    const list: Stack[] = this.store.list();
    const before = list.map((s) => s.n);
    const moved = takeAll(c, list);
    list.forEach((s, i) => {
      const gone = before[i] - s.n;
      if (gone > 0) this.store.remove(s.id, gone);
    });
    return moved;
  }
}

/** opening it, or putting the thing in the hands into it */
class ContainerUse implements Interactable {
  constructor(readonly c: Container) {}
  get id(): string {
    return this.c.id;
  }
  get hold(): number {
    return this.c.opened ? 0 : OPEN_HOLD;
  }
  get radius(): number {
    return Math.min(0.6, Math.max(this.c.def.hx, this.c.def.hz) * 0.9);
  }
  aim(out: Vec3): void {
    const d = this.c.def;
    out.x = d.x;
    out.y = d.y + d.h * 0.85;
    out.z = d.z;
  }
  prompt(a: Actor): string | null {
    if (!this.c.opened) return '打开';
    const h = a.hands.id;
    return h && this.c.store.room(h) > 0 ? '放进' : null;
  }
  act(a: Actor): boolean {
    if (!this.c.opened) return this.c.open();
    const h = a.hands.id;
    if (!h || this.c.store.room(h) <= 0) return false;
    // vehicle systems: a part keeps its condition, a vessel its litres
    this.c.store.add(h, 1, a.hands.cond !== undefined || a.hands.fill > 0 ? { cond: a.hands.cond, fill: a.hands.fill > 0 ? a.hands.fill : undefined } : undefined);
    a.hands.set(null);
    return true;
  }
  get through(): string {
    return this.c.id;
  }
}

/** one slot's things lying in an open container */
class SlotUse implements Interactable {
  readonly hold = 0;
  readonly long: LongUse;
  constructor(
    readonly c: Container,
    readonly i: number,
  ) {
    this.long = {
      hold: TAKE_ALL_HOLD,
      prompt: (a: Actor) => (this.c.store.list().some((s) => canTake(a, s.id, s.n) > 0) ? '全拿' : null),
      act: (a: Actor) => this.c.takeAllInto(a) > 0,
    };
  }
  get id(): string {
    return `${this.c.id}#${this.i}`;
  }
  get radius(): number {
    const s = this.c.store.slots[this.i];
    return s ? Math.min(pickRadius(s.id), 0.2) : 0.1;
  }
  get through(): string {
    return this.c.id;
  }
  aim(out: Vec3): void {
    this.c.shelfPoint(this.i, out);
    const s = this.c.store.slots[this.i];
    if (s) out.y += sizeOf(s.id).h * 0.5;
  }
  prompt(a: Actor): string | null {
    const s = this.c.store.slots[this.i];
    return s && canTake(a, s.id, s.n) > 0 ? takeWord(s.id) : null;
  }
  act(a: Actor): boolean {
    const s = this.c.store.slots[this.i];
    if (!s) return false;
    const k = canTake(a, s.id, s.n);
    if (k <= 0) return false;
    const got = take(a, s.id, k, s.fill ?? 0, s.cond); // vehicle systems: condition and litres come along
    this.c.store.takeSlot(this.i, got);
    return got > 0;
  }
}

export interface ContainerState {
  id: string;
  opened: boolean;
  store: (Stack | null)[];
}

export class Containers implements InteractSource, SolidSource {
  private readonly list: Container[] = [];
  private readonly byId = new Map<string, Container>();
  private readonly grid = new CellIndex<Container>();
  private readonly uses = new Map<string, ContainerUse>();
  private readonly slotUses = new Map<string, SlotUse[]>();

  add(def: ContainerDef): Container {
    if (this.get(def.id)) throw new Error(`container ${def.id} is already there`);
    // a container on a vehicle (its id starts with the vehicle's: 't0_truck:glovebox') must not be a
    // solid: it would ride inside the car and the car would collide with it at every step
    if (def.solid !== false && VEHICLES[def.id.split(':')[0]]) throw new Error(`container ${def.id} is on a vehicle: give it solid: false`);
    const c = new Container(def);
    this.list.push(c);
    this.byId.set(def.id, c);
    this.grid.add(c, def.x, def.z, Math.hypot(def.hx, def.hz));
    this.uses.set(def.id, new ContainerUse(c));
    this.slotUses.set(
      def.id,
      c.store.slots.map((_, i) => new SlotUse(c, i)),
    );
    return c;
  }

  remove(id: string): void {
    const c = this.byId.get(id);
    if (c) {
      this.list.splice(this.list.indexOf(c), 1);
      this.byId.delete(id);
      this.grid.remove(c, c.def.x, c.def.z);
    }
    this.uses.delete(id);
    this.slotUses.delete(id);
  }

  get(id: string): Container | undefined {
    return this.byId.get(id);
  }

  all(): readonly Container[] {
    return this.list;
  }

  /** a sum that changes whenever anything is opened, taken or put in (the view redraws then) */
  get version(): number {
    let v = 0;
    for (const c of this.list) {
      if (!c.opened) continue;
      v += 1;
      c.store.slots.forEach((s, i) => (v += s ? (i + 1) * 131 + s.n * 7 + s.id.length : 0));
    }
    return v;
  }

  interactablesNear(x: number, z: number, r: number, out: Interactable[]): void {
    this.grid.each(x, z, r, (c) => {
      const dx = c.def.x - x;
      const dz = c.def.z - z;
      const rr = r + Math.max(c.def.hx, c.def.hz);
      if (dx * dx + dz * dz > rr * rr) return;
      out.push(this.uses.get(c.id)!);
      if (!c.opened) return;
      const su = this.slotUses.get(c.id)!;
      for (let i = 0; i < su.length; i++) if (c.store.slots[i]) out.push(su[i]);
    });
  }

  /** append the containers whose centre lies within r of (x, z) */
  near(x: number, z: number, r: number, out: Container[]): void {
    this.grid.each(x, z, r, (c) => {
      if ((c.def.x - x) ** 2 + (c.def.z - z) ** 2 <= r * r) out.push(c);
    });
  }

  solidsNear(x: number, z: number, r: number, out: Solid[]): void {
    this.grid.each(x, z, r, (c) => {
      if (c.def.solid !== false && solidWithin(c.solid, x, z, r)) out.push(c.solid);
    });
  }

  toJSON(): ContainerState[] {
    return this.list.map((c) => ({ id: c.id, opened: c.opened, store: c.store.toJSON() }));
  }

  /** restore what was opened and what is left in each (containers not in the save keep their state) */
  load(s: readonly ContainerState[]): this {
    for (const cs of s) {
      const c = this.get(cs.id);
      if (!c) continue;
      c.opened = cs.opened;
      c.store.load(cs.store);
    }
    return this;
  }
}

/** for the views: the item in a slot, its size class */
export function slotItem(c: Container, i: number): { id: string; n: number; large: boolean } | null {
  const s = c.store.slots[i];
  return s ? { id: s.id, n: s.n, large: item(s.id).size === 'large' } : null;
}
