import { describe, expect, it } from 'vitest';
import { ITEMS, item, registerItems } from '../../src/core/items/catalog';
import { BIG_ONLY, Inventory } from '../../src/core/items/inventory';
import { CONTAINER_KINDS, LOOT, lootTablesValid, rollLoot } from '../../src/core/items/loot';
import { Push, Solid, pushOut } from '../../src/core/world/solids';

describe('items', () => {
  it('every loot table names things that exist, in every rarity band it can roll', () => {
    expect(lootTablesValid()).toEqual([]);
    for (const k of CONTAINER_KINDS) expect(LOOT[k].entries.some((x) => item(x.id).rarity === 0)).toBe(true);
  });

  it('the catalogue holds the design’s materials and fish, sized as the carrying rules need', () => {
    expect([...ITEMS.keys()].filter((id) => id.startsWith('mat.')).length).toBeGreaterThanOrEqual(14);
    expect([...ITEMS.keys()].filter((id) => id.startsWith('fish.')).length).toBe(12);
    expect(item('fuel.jerrycan').size).toBe('medium');
    expect(item('fuel.jerrycan').holds).toEqual({ what: 'fuel', litres: 10 });
    expect(item('tyre.road').size).toBe('large');
    expect(item('tyre.road').stack).toBe(1);
  });

  it('another system can register its parts once, and not take an id that is in use', () => {
    registerItems([{ id: 'test.part', zh: '测试件', en: 'test part', cat: 'part', shape: 'machine', tint: 0x808080, size: 'medium' }]);
    registerItems([{ id: 'test.part', zh: '测试件', en: 'test part', cat: 'part', shape: 'machine', tint: 0x808080, size: 'medium' }]);
    expect(item('test.part').stack).toBe(1);
    expect(() => registerItems([{ id: 'mat.scrap', zh: '别的东西', en: 'x', cat: 'part', shape: 'machine', tint: 0 }])).toThrow();
  });

  it('a backpack stacks like things, refuses big ones and says what did not fit', () => {
    const b = new Inventory(2);
    expect(b.add('mat.scrap', 14)).toBe(0);
    expect(b.used).toBe(2);
    expect(b.add('mat.scrap', 7)).toBe(1);
    expect(b.count('mat.scrap')).toBe(20);
    expect(b.add('mat.wire')).toBe(1);
    expect(b.add('fuel.jerrycan')).toBe(1);
    expect(b.remove('mat.scrap', 12)).toBe(12);
    expect(b.used).toBe(1);
    expect(b.room('mat.wire')).toBe(10);
    const bay = new Inventory(4, BIG_ONLY);
    expect(bay.add('fuel.jerrycan', 2)).toBe(0);
    expect(bay.used).toBe(2);
    expect(bay.add('mat.scrap')).toBe(1);
  });

  it('pouring a crate into a backpack moves what fits and leaves the rest', () => {
    const crate = new Inventory(6);
    crate.add('mat.plank', 4);
    crate.add('food.can.beans', 3);
    crate.add('keep.tape', 2);
    const pack = new Inventory(3);
    expect(crate.pourInto(pack)).toBe(8);
    expect(crate.list()).toEqual([{ id: 'keep.tape', n: 1 }]);
    const copy = new Inventory(3).load(JSON.parse(JSON.stringify(pack)));
    expect(copy.list()).toEqual(pack.list());
  });

  it('a container always holds the same things, and the bands come out near 70 / 24 / 6', () => {
    expect(rollLoot('crate', 1234)).toEqual(rollLoot('crate', 1234));
    const share = [0, 0, 0];
    let total = 0;
    for (let seed = 1; seed <= 4000; seed++) {
      const got = rollLoot('crate', seed);
      expect(got.length).toBeGreaterThan(0);
      for (const s of got) {
        share[item(s.id).rarity]++;
        total++;
      }
    }
    expect(share[0] / total).toBeGreaterThan(0.62);
    expect(share[0] / total).toBeLessThan(0.78);
    expect(share[2] / total).toBeGreaterThan(0.03);
    expect(share[2] / total).toBeLessThan(0.1);
    // well rested: more of the rare band
    let rare = 0;
    let rareRested = 0;
    for (let seed = 1; seed <= 4000; seed++) {
      rare += rollLoot('crate', seed).filter((s) => item(s.id).rarity === 2).length;
      rareRested += rollLoot('crate', seed, 0.03).filter((s) => item(s.id).rarity === 2).length;
    }
    expect(rareRested).toBeGreaterThan(rare * 1.2);
  });
});

describe('solids', () => {
  it('a circle is pushed out of a turned box through the nearest face, and left alone outside', () => {
    const s = new Solid().set(10, 5, 3, 1, Math.PI / 2, 0, 2.5);
    const p = new Push();
    // the box's long axis now runs along z: 1 m either side in x, 3 m either side in z
    expect(pushOut(s, 12.5, 5, 0.3, p)).toBe(false);
    expect(pushOut(s, 11.1, 5, 0.3, p)).toBe(true);
    expect(p.x).toBeCloseTo(11.3, 6);
    expect(p.z).toBeCloseTo(5, 6);
    expect(p.nx).toBeCloseTo(1, 6);
    // from inside, out through the nearest face
    expect(pushOut(s, 9.4, 6, 0.3, p)).toBe(true);
    expect(p.x).toBeCloseTo(8.7, 6);
    expect(p.z).toBeCloseTo(6, 6);
    // at a corner the way out is diagonal and the circle ends up touching the corner
    expect(pushOut(s, 11.1, 8.1, 0.3, p)).toBe(true);
    expect(Math.hypot(p.x - 11, p.z - 8)).toBeCloseTo(0.3, 6);
  });

  it('a round post keeps a circle at the sum of the radii', () => {
    const s = new Solid().set(0, 0, 0.4, 0, 0, 0, 6);
    const p = new Push();
    expect(pushOut(s, 0.5, 0, 0.3, p)).toBe(true);
    expect(p.x).toBeCloseTo(0.7, 6);
    expect(pushOut(s, 0.8, 0, 0.3, p)).toBe(false);
  });
});
