/**
 * Hands and backpack (docs/DESIGN_V2.md 6.4): small things go in the backpack (12 slots, like
 * things stack), one medium thing is carried in the hands, a large thing is lifted in both arms.
 * A vessel (jerrycan, water canister) carries its litres with it.
 */
import { item, type ItemDef, type ItemSize } from './catalog';
import { Inventory, SMALL_ONLY, type Stack } from './inventory';

export const PACK_SLOTS = 12;

export interface HandsState {
  id: string | null;
  fill: number;
  /** vehicle systems: a part's condition (absent = none recorded) */
  cond?: number;
}

/** what is in the hands: nothing, one medium thing, or one large thing lifted in both arms */
export class Hands {
  id: string | null = null;
  /** litres in it, when it is a vessel */
  fill = 0;
  /** vehicle systems: a part's condition, 0–100 (undefined = none recorded) */
  cond: number | undefined = undefined;

  get empty(): boolean {
    return this.id === null;
  }

  get def(): ItemDef | null {
    return this.id ? item(this.id) : null;
  }

  get size(): ItemSize | null {
    return this.id ? item(this.id).size : null;
  }

  /** the vessel's capacity for `what` (0 = not such a vessel) */
  holds(what: 'fuel' | 'water'): number {
    const d = this.def;
    return d && d.holds && d.holds.what === what ? d.holds.litres : 0;
  }

  set(id: string | null, fill = 0, cond?: number): void {
    this.id = id;
    this.fill = id ? fill : 0;
    this.cond = id ? cond : undefined;
  }

  toJSON(): HandsState {
    const s: HandsState = { id: this.id, fill: this.fill };
    if (this.cond !== undefined) s.cond = this.cond;
    return s;
  }

  load(s: HandsState): this {
    this.id = s.id;
    this.fill = s.fill;
    this.cond = s.cond;
    return this;
  }
}

/** anyone who can carry things: a player (later a robot traveller) */
export interface Carrier {
  readonly id: string;
  readonly hands: Hands;
  readonly pack: Inventory;
}

export function newPack(): Inventory {
  return new Inventory(PACK_SLOTS, SMALL_ONLY);
}

/** how many of n would be taken right now (small: what fits in the pack; else 1 if the hands are free) */
export function canTake(c: Carrier, id: string, n = 1): number {
  const d = item(id);
  if (d.size === 'small') return Math.min(n, c.pack.room(id));
  return c.hands.empty && n > 0 ? 1 : 0;
}

/** take up to n: small into the pack, medium or large into the hands; returns how many were taken */
export function take(c: Carrier, id: string, n = 1, fill = 0, cond?: number): number {
  const d = item(id);
  if (d.size === 'small') return n - c.pack.add(id, n, cond !== undefined ? { cond } : undefined);
  if (!c.hands.empty || n <= 0) return 0;
  c.hands.set(id, fill, cond);
  return 1;
}

/** take everything from a list of stacks that fits; the stacks are reduced in place; returns how many things moved */
export function takeAll(c: Carrier, stacks: Stack[]): number {
  let moved = 0;
  for (const s of stacks) {
    if (s.n <= 0) continue;
    const k = take(c, s.id, s.n, s.fill ?? 0, s.cond);
    s.n -= k;
    moved += k;
  }
  return moved;
}

/** the verb that taking it is: '拿' for what one picks up, '抬' for what one lifts */
export function takeWord(id: string): string {
  return item(id).size === 'large' ? '抬' : '拿';
}

export interface CarrierState {
  hands: HandsState;
  pack: (Stack | null)[];
}

export function saveCarrier(c: Carrier): CarrierState {
  return { hands: c.hands.toJSON(), pack: c.pack.toJSON() };
}

export function loadCarrier(c: Carrier, s: CarrierState): void {
  c.hands.load(s.hands);
  c.pack.load(s.pack);
}
