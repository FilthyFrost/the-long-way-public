/**
 * A first smoke test of the item model's V3 additions (stacks, things inside things, freshness, the open
 * catalogue, tolerant loading): the contract in brief. The full tests and properties are harness/sim/v3_items.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { BASE_ITEMS, ITEMS, accepts, canStack, cleanItem, countOf, freshNow, itemCatalogueProblems, itemCats, itemMass, itemName, itemSig, itemVeil, mergeStacks, newItem, putInside, registerItemCat, registerItems, roomInside, salvageOf, setItemVeil, settleItem, splitStack, stampFresh, takeInside } from '../../src/core/modcar/items';

registerItemCat({ id: 't_smoke', name: { zh: '试验', en: 'Test' } });
registerItems([
  { id: 't_berry', cat: 't_smoke', name: { zh: '试验莓', en: 'Test berry' }, stars: 1, mass: 0.02, stack: 10, tags: ['forage'], perish: { hours: 24, into: 't_mush' }, salvage: { organics: 1 } },
  { id: 't_mush', cat: 't_smoke', name: { zh: '烂莓', en: 'Mush' }, stars: 0, mass: 0.02, stack: 10 },
  { id: 't_basket', cat: 't_smoke', name: { zh: '试验篮', en: 'Test basket' }, stars: 1, mass: 0.5, holds: { slots: 2, accepts: ['#forage'], maxKg: 1, decay: 0.5 } },
]);

describe('item model, V3 additions (smoke)', () => {
  it('a veiled kind goes by the veil\'s name everywhere a name is asked, and by its own once the veil lifts', () => {
    const a = newItem('t_berry', { n: 3, t0: 0 });
    setItemVeil((id) => (id === 't_berry' ? { zh: '不认识的果子', en: 'Unknown fruit' } : null));
    expect(itemName(a)).toBe('不认识的果子 ×3');
    expect(itemName(a, 'en')).toBe('Unknown fruit ×3');
    expect(itemVeil('t_berry')).toEqual({ zh: '不认识的果子', en: 'Unknown fruit' });
    expect(itemVeil('t_basket')).toBeNull();
    expect(itemName(newItem('t_basket'))).toBe('试验篮');
    setItemVeil(null);
    expect(itemName(a)).toBe('试验莓 ×3');
    expect(itemVeil('t_berry')).toBeNull();
  });

  it('registers without touching what was there', () => {
    expect(BASE_ITEMS.length).toBe(ITEMS.length - 3);
    expect(itemCats().map((c) => c.id).slice(0, 9)).toEqual(['food', 'drink', 'med', 'wear', 'pack', 'lamp', 'gear', 'junk', 'crate']);
    expect(itemCatalogueProblems()).toEqual([]);
    expect(() => registerItems([{ id: 't_berry', cat: 't_smoke', name: { zh: 'x', en: 'x' }, stars: 1, mass: 1 }])).toThrow(/registered already/);
    expect(() => registerItemCat({ id: 'food', name: { zh: 'x', en: 'x' } })).toThrow();
  });

  it('stacks: merge, split, count, mass, salvage, name', () => {
    const a = newItem('t_berry', { n: 7, t0: 0 });
    const b = newItem('t_berry', { n: 6, t0: 0 });
    expect(canStack(a, b, 0)).toBe(true);
    expect(mergeStacks(a, b, 0)).toBe(3);
    expect(countOf(a)).toBe(10);
    expect(countOf(b)).toBe(3);
    expect(itemMass(a)).toBeCloseTo(0.2);
    expect(salvageOf(a)).toEqual({ organics: 10 });
    expect(itemName(a)).toBe('试验莓 ×10');
    const c = splitStack(a, 4)!;
    expect([countOf(a), countOf(c)]).toEqual([6, 4]);
    expect(c.uid).not.toBe(a.uid);
    expect(splitStack(a, 6)).toBeNull();
  });

  it('freshness is lazy, slows in a box, and a turned thing becomes what its kind says', () => {
    const a = newItem('t_berry', { n: 2, t0: 0 });
    expect(freshNow(a, 12 * 3600)).toBeCloseTo(0.5);
    const box = newItem('t_basket');
    expect(accepts(box, a)).toBe(true);
    expect(roomInside(box, a, 0)).toBe(2);
    expect(putInside(box, a, 0)).toBe(0);
    expect(freshNow(box.inside![0], 12 * 3600)).toBeCloseTo(0.75);
    expect(itemMass(box)).toBeCloseTo(0.54);
    const out = takeInside(box, 0, 12 * 3600)!;
    expect(box.inside).toBeUndefined();
    expect(freshNow(out, 24 * 3600)).toBeCloseTo(0.25);
    expect(settleItem(out, 24 * 3600)).toBe(false);
    expect(settleItem(out, 40 * 3600)).toBe(true);
    expect(out.item).toBe('t_mush');
    expect(countOf(out)).toBe(2);
    const late = newItem('t_berry');
    expect(freshNow(late, 1e9)).toBe(1);
    stampFresh(late, 100);
    expect(late.t0).toBe(100);
  });

  it('a box takes what fits: by kind, by slots, by weight', () => {
    const box = newItem('t_basket');
    expect(accepts(box, newItem('food_chips'))).toBe(false);
    expect(accepts(box, newItem('t_basket'))).toBe(false);
    expect(putInside(box, newItem('t_berry', { n: 10, t0: 0 }), 0)).toBe(0);
    expect(putInside(box, newItem('t_berry', { n: 10, t0: 0 }), 0)).toBe(0);
    // two slots full of ten: 0.4 kg; a third stack finds no slot and no room on the stacks
    const more = newItem('t_berry', { n: 5, t0: 0 });
    expect(roomInside(box, more, 0)).toBe(0);
    expect(putInside(box, more, 0)).toBe(5);
    expect(countOf(more)).toBe(5);
    expect(itemSig(box)).toBe('t_basket[t_berry*10,t_berry*10]');
  });

  it('loads tolerantly: an unknown kind is dropped and counted, bad numbers are brought into range', () => {
    const loss = { unknown: 0 };
    expect(cleanItem({ uid: 'i1', item: 'no_such_thing', n: 4 }, loss)).toBeNull();
    expect(loss.unknown).toBe(4);
    const box = cleanItem({ uid: 'i2', item: 't_basket', inside: [{ uid: 'i3', item: 't_berry', n: 3, fresh: 7 }, { uid: 'i4', item: 'gone', n: 2 }] }, loss)!;
    expect(loss.unknown).toBe(6);
    expect(box.inside!.length).toBe(1);
    expect(box.inside![0].fresh).toBe(1);
    expect(cleanItem({ uid: 'i5', item: 'food_chips', n: 'three', fresh: 0.5, q: 9 }, loss)).toEqual({ uid: 'i5', item: 'food_chips' });
    // a stack used up (its count reads 0, or less) is gone: it never comes back as one thing, and nothing is counted for it
    expect(cleanItem({ uid: 'i6', item: 't_berry', n: 0 }, loss)).toBeNull();
    expect(cleanItem({ uid: 'i7', item: 'food_chips', n: -3 }, loss)).toBeNull();
    expect(loss.unknown).toBe(6);
  });
});
