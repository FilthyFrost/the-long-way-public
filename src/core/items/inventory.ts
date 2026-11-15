/**
 * Slots that hold things: a backpack, a locker, a cold box, a cargo bay, the inside of a crate.
 * Like things share a slot up to the item's stack size; a slot never mixes kinds. No weights
 * (docs/DESIGN_V2.md 6.4): the number of slots is the only limit.
 */
import { item, type ItemDef, type ItemSize } from './catalog';

export interface Stack {
  id: string;
  n: number;
  /** vehicle systems: a part's condition (0–100); stacks only merge with the same condition */
  cond?: number;
  /** vehicle systems: litres in a vessel kept in a store */
  fill?: number;
}

/** the optional extras of a stack, copied (vehicle systems) */
function extras(s: Stack, out: Stack): Stack {
  if (s.cond !== undefined) out.cond = s.cond;
  if (s.fill !== undefined) out.fill = s.fill;
  return out;
}

/** what a store takes: a backpack only small things, a cargo bay the big ones */
export type Accepts = (d: ItemDef) => boolean;

export const SMALL_ONLY: Accepts = (d) => d.size === 'small';
export const BIG_ONLY: Accepts = (d) => d.size !== 'small';
export const ANY_SIZE: Accepts = () => true;
export const sizeIs =
  (...sizes: ItemSize[]): Accepts =>
  (d) =>
    sizes.includes(d.size);

export class Inventory {
  readonly slots: (Stack | null)[];

  constructor(
    size: number,
    readonly accepts: Accepts = SMALL_ONLY,
  ) {
    this.slots = new Array<Stack | null>(size).fill(null);
  }

  /**
   * put in as many as fit, filling started stacks first; returns how many were left over.
   * `extra` (vehicle systems): a condition or litres the things carry; they only join a stack with the same.
   */
  add(id: string, n = 1, extra?: { cond?: number; fill?: number }): number {
    const d = item(id);
    if (!this.accepts(d) || n <= 0) return n > 0 ? n : 0;
    const cond = extra?.cond;
    const fill = extra?.fill;
    for (const s of this.slots) {
      if (n === 0) break;
      if (s && s.id === id && s.n < d.stack && s.cond === cond && s.fill === fill) {
        const k = Math.min(n, d.stack - s.n);
        s.n += k;
        n -= k;
      }
    }
    for (let i = 0; i < this.slots.length && n > 0; i++) {
      if (this.slots[i]) continue;
      const k = Math.min(n, d.stack);
      const st: Stack = { id, n: k };
      if (cond !== undefined) st.cond = cond;
      if (fill !== undefined) st.fill = fill;
      this.slots[i] = st;
      n -= k;
    }
    return n;
  }

  /** how many more of this would fit */
  room(id: string): number {
    const d = item(id);
    if (!this.accepts(d)) return 0;
    let r = 0;
    for (const s of this.slots) {
      if (!s) r += d.stack;
      else if (s.id === id) r += d.stack - s.n;
    }
    return r;
  }

  count(id: string): number {
    let c = 0;
    for (const s of this.slots) if (s && s.id === id) c += s.n;
    return c;
  }

  /** take out up to n, from the last stacks first (so the first slots stay tidy); returns how many came out */
  remove(id: string, n = 1): number {
    let got = 0;
    for (let i = this.slots.length - 1; i >= 0 && got < n; i--) {
      const s = this.slots[i];
      if (!s || s.id !== id) continue;
      const k = Math.min(n - got, s.n);
      s.n -= k;
      got += k;
      if (s.n === 0) this.slots[i] = null;
    }
    return got;
  }

  /** take up to n out of one slot (all of it by default) */
  takeSlot(i: number, n = Infinity): Stack | null {
    const s = this.slots[i];
    if (!s) return null;
    const k = Math.min(n, s.n);
    s.n -= k;
    if (s.n === 0) this.slots[i] = null;
    return extras(s, { id: s.id, n: k });
  }

  /** move everything that fits into another store; returns how many things moved */
  pourInto(to: Inventory): number {
    let moved = 0;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (!s) continue;
      const left = to.add(s.id, s.n, s.cond !== undefined || s.fill !== undefined ? s : undefined);
      moved += s.n - left;
      if (left === 0) this.slots[i] = null;
      else s.n = left;
    }
    return moved;
  }

  get used(): number {
    let u = 0;
    for (const s of this.slots) if (s) u++;
    return u;
  }

  get empty(): boolean {
    return this.used === 0;
  }

  /** what is inside, slot by slot (empty slots left out) */
  list(): Stack[] {
    const out: Stack[] = [];
    for (const s of this.slots) if (s) out.push(extras(s, { id: s.id, n: s.n }));
    return out;
  }

  toJSON(): (Stack | null)[] {
    return this.slots.map((s) => (s ? extras(s, { id: s.id, n: s.n }) : null));
  }

  /** restore a saved store (slots beyond the saved length stay empty) */
  load(saved: readonly (Stack | null)[]): this {
    for (let i = 0; i < this.slots.length; i++) {
      const s = saved[i];
      this.slots[i] = s ? extras(s, { id: s.id, n: s.n }) : null;
    }
    return this;
  }
}
