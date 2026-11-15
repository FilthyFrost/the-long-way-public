/**
 * The operations' inventory (ops.ts `Inventory`) on the real stores: the hands and backpacks of the
 * people doing the job, and any stores at hand (the cargo bay, an open container). Parts keep their
 * condition, vessels their litres (Stack.cond / Stack.fill, Hands.cond / Hands.fill).
 */
import { item } from '../../items/catalog';
import type { Carrier } from '../../items/carry';
import type { Inventory as ItemStore } from '../../items/inventory';
import { FOUND_COND, type Inventory, type ItemInstance } from './ops';

/**
 * A wheel carried about keeps whether its tyre is punctured. Tyres hold no fluid, so in the stores
 * (Stack.fill, Hands.fill, Loose.fill) the flag rides in the fill field: 1 = punctured.
 */
export function isTyre(id: string): boolean {
  return id.startsWith('tyre.');
}

export class CarrierStores implements Inventory {
  /**
   * @param carriers the people working (the first one receives what comes off first)
   * @param stores other stores within reach, searched after the carriers and filled when hands are full
   * @param overflow where a thing goes that fits nowhere (put down at the feet); without it, it is lost
   */
  constructor(
    readonly carriers: readonly Carrier[],
    readonly stores: readonly ItemStore[] = [],
    readonly overflow?: (it: ItemInstance) => void,
  ) {}

  count(id: string): number {
    let n = 0;
    for (const c of this.carriers) {
      if (c.hands.id === id) n++;
      n += c.pack.count(id);
    }
    for (const s of this.stores) n += s.count(id);
    return n;
  }

  /** the best-conditioned one (the fullest vessel): what is in the hands first, then packs, then the other stores */
  private pick(id: string): { inst: ItemInstance; remove: () => void } | null {
    let best: { score: number; inst: ItemInstance; remove: () => void } | null = null;
    const score = (cond: number | undefined, fill: number | undefined): number => (cond ?? FOUND_COND) + (fill ?? 0) * 0.001;
    const tyre = isTyre(id);
    const inst = (cond: number | undefined, fill: number | undefined): ItemInstance => {
      const it: ItemInstance = { id };
      if (cond !== undefined) it.cond = cond;
      if (tyre) {
        if (fill !== undefined && fill > 0) it.flat = true;
      } else if (fill !== undefined && fill > 0) it.litres = fill;
      return it;
    };
    for (const c of this.carriers) {
      const h = c.hands;
      if (h.id !== id) continue;
      const sc = score(h.cond, h.fill) + 1000; // what is in the hands is what one means
      if (!best || sc > best.score) best = { score: sc, inst: inst(h.cond, h.fill), remove: () => h.set(null) };
    }
    const fromStore = (s: ItemStore): void => {
      for (let i = 0; i < s.slots.length; i++) {
        const st = s.slots[i];
        if (!st || st.id !== id) continue;
        const sc = score(st.cond, st.fill);
        if (!best || sc > best.score) best = { score: sc, inst: inst(st.cond, st.fill), remove: () => void s.takeSlot(i, 1) };
      }
    };
    for (const c of this.carriers) fromStore(c.pack);
    for (const s of this.stores) fromStore(s);
    return best;
  }

  take(id: string): ItemInstance | undefined {
    const p = this.pick(id);
    if (!p) return undefined;
    p.remove();
    return p.inst;
  }

  peek(id: string): ItemInstance | undefined {
    return this.pick(id)?.inst;
  }

  give(it: ItemInstance): void {
    const fill = isTyre(it.id) ? (it.flat ? 1 : undefined) : it.litres;
    const extra = it.cond !== undefined || fill !== undefined ? { cond: it.cond, fill } : undefined;
    if (item(it.id).size === 'small') {
      for (const c of this.carriers) if (c.pack.add(it.id, 1, extra) === 0) return;
    } else {
      for (const c of this.carriers) {
        if (c.hands.empty) {
          c.hands.set(it.id, fill ?? 0, it.cond);
          return;
        }
      }
    }
    for (const s of this.stores) if (s.add(it.id, 1, extra) === 0) return;
    this.overflow?.(it);
  }
}
