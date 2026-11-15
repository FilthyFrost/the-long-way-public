/**
 * Things lying about in the world (docs/DESIGN_V2.md 6.1, 8.1): a can on a counter, a tyre by a
 * wreck, a jerrycan someone put down. Each is an item id and a count at a place; taking it is a
 * press of E (small → backpack, medium → hands, large → lifted).
 *
 * Keys are stable: given in order by this registry ('loose:1', 'loose:2', …), or chosen by the
 * site that places the thing ('site42:can3'), so a saved game and every player agree on them.
 */
import { item } from './catalog';
import { canTake, take, takeWord, type Carrier } from './carry';
import { pickRadius, sizeOf } from './shapes';
import type { Actor, Interactable, InteractSource, Vec3 } from '../interact/interact';

export interface Loose {
  readonly key: string;
  readonly id: string;
  n: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  /** who placed it: a site id, a player id ('' = the world) */
  owner: string;
  /** litres in a vessel */
  fill: number;
  /** vehicle systems: a part's condition (absent = none recorded) */
  cond?: number;
}

/** the use of one loose thing (made once per thing, reused every frame) */
class LooseUse implements Interactable {
  readonly hold = 0;
  readonly radius: number;
  constructor(
    readonly reg: LooseItems,
    readonly l: Loose,
  ) {
    this.radius = pickRadius(l.id);
  }
  get id(): string {
    return this.l.key;
  }
  aim(out: Vec3): void {
    out.x = this.l.x;
    out.y = this.l.y + sizeOf(this.l.id).h * 0.5;
    out.z = this.l.z;
  }
  prompt(a: Actor): string | null {
    return this.l.n > 0 && canTake(a, this.l.id, this.l.n) > 0 ? takeWord(this.l.id) : null;
  }
  act(a: Actor): boolean {
    return this.reg.takeInto(this.l.key, a) > 0;
  }
}

export interface LooseState {
  next: number;
  items: Loose[];
}

export class LooseItems implements InteractSource {
  private readonly items: Loose[] = [];
  private readonly uses = new Map<string, LooseUse>();
  private next = 1;
  /** goes up whenever something is added, taken or moved (the view redraws then) */
  version = 0;

  /** put a thing down; returns it (its key is `key` or the next free 'loose:n') */
  add(id: string, n: number, x: number, y: number, z: number, heading = 0, owner = '', fill = 0, key?: string, cond?: number): Loose {
    item(id); // unknown ids fail here, not later in a view
    const k = key ?? `loose:${this.next++}`;
    if (this.get(k)) throw new Error(`loose thing ${k} is already there`);
    const l: Loose = { key: k, id, n, x, y, z, heading, owner, fill };
    if (cond !== undefined) l.cond = cond;
    this.items.push(l);
    this.version++;
    return l;
  }

  get(key: string): Loose | undefined {
    for (const l of this.items) if (l.key === key) return l;
    return undefined;
  }

  /** take up to n away (all by default); returns what was taken, or null */
  take(key: string, n = Infinity): { id: string; n: number; fill: number; cond?: number } | null {
    const i = this.items.findIndex((l) => l.key === key);
    if (i < 0) return null;
    const l = this.items[i];
    const k = Math.min(n, l.n);
    l.n -= k;
    if (l.n <= 0) {
      this.items.splice(i, 1);
      this.uses.delete(key);
    }
    this.version++;
    return l.cond !== undefined ? { id: l.id, n: k, fill: l.fill, cond: l.cond } : { id: l.id, n: k, fill: l.fill };
  }

  /** a carrier takes what it can of a thing; returns how many it took */
  takeInto(key: string, c: Carrier): number {
    const l = this.get(key);
    if (!l) return 0;
    const k = canTake(c, l.id, l.n);
    if (k <= 0) return 0;
    const got = take(c, l.id, k, l.fill, l.cond);
    if (got > 0) this.take(key, got);
    return got;
  }

  /** append the things within r of (x, z) */
  near(x: number, z: number, r: number, out: Loose[]): void {
    const r2 = r * r;
    for (const l of this.items) {
      const dx = l.x - x;
      const dz = l.z - z;
      if (dx * dx + dz * dz <= r2) out.push(l);
    }
  }

  all(): readonly Loose[] {
    return this.items;
  }

  get count(): number {
    return this.items.length;
  }

  interactablesNear(x: number, z: number, r: number, out: Interactable[]): void {
    const r2 = r * r;
    for (const l of this.items) {
      const dx = l.x - x;
      const dz = l.z - z;
      if (dx * dx + dz * dz > r2) continue;
      let u = this.uses.get(l.key);
      if (!u) this.uses.set(l.key, (u = new LooseUse(this, l)));
      out.push(u);
    }
  }

  toJSON(): LooseState {
    return { next: this.next, items: this.items.map((l) => ({ ...l })) };
  }

  load(s: LooseState): this {
    this.items.length = 0;
    this.uses.clear();
    for (const l of s.items) this.items.push({ ...l });
    this.next = s.next;
    this.version++;
    return this;
  }
}
