/** One catalogue, real stores: the vehicle's items in the item catalogue and operations on hands and packs. */
import { describe, expect, it } from 'vitest';
import { hasItem, item } from '../../src/core/items/catalog';
import { Hands, newPack, type Carrier } from '../../src/core/items/carry';
import { Inventory as ItemStore, ANY_SIZE } from '../../src/core/items/inventory';
import { LOOT, lootTablesValid, rollLoot } from '../../src/core/items/loot';
import { VehicleSim } from '../../src/core/vehicle/sim';
import { T0_TRUCK } from '../../src/core/vehicle/spec';
import { applyOp, CarrierStores, FOUND_COND, PARTS_CATALOG, planOp, stockState, VehicleSystems } from '../../src/core/vehicle/systems';

function person(id: string): Carrier {
  return { id, hands: new Hands(), pack: newPack() };
}

function make() {
  const v = new VehicleSim(T0_TRUCK);
  v.reset(0, 0, 0, 0);
  const sys = new VehicleSystems(T0_TRUCK, stockState(T0_TRUCK, 1)).bind(v);
  return { v, sys };
}

describe('one catalogue', () => {
  it('every vehicle item is in the item catalogue, sized and graded by tier', () => {
    for (const it of PARTS_CATALOG) expect(hasItem(it.id), it.id).toBe(true);
    expect(item('part.engine.1').size).toBe('large');
    expect(item('part.engine.1').rarity).toBe(0);
    expect(item('part.engine.2').rarity).toBe(1);
    expect(item('part.engine.3').rarity).toBe(2);
    expect(item('tyre.snow').size).toBe('large');
    expect(item('part.brakes.1').stack).toBe(1);
    expect(hasItem('part.battery')).toBe(false);
    expect(hasItem('fluid.fuel.can')).toBe(false);
  });

  it('the loot tables name the vehicle parts and a garage gives them by tier', () => {
    expect(lootTablesValid()).toEqual([]);
    let parts = 0;
    let tier3 = 0;
    for (let seed = 1; seed <= 400; seed++)
      for (const s of rollLoot('garage', seed)) {
        if (s.id.startsWith('part.') || s.id.startsWith('tyre.')) parts += s.n;
        if (/\.3$/.test(s.id) || s.id === 'tyre.mud' || s.id === 'tyre.snow' || s.id === 'part.lights.bar') tier3 += s.n;
      }
    expect(parts).toBeGreaterThan(300);
    expect(tier3 / parts).toBeLessThan(0.15);
    expect(LOOT.toolbox.entries.some((e) => e.id === 'part.battery.1')).toBe(true);
  });
});

describe('operations on real stores', () => {
  it('a part comes off into the hands with its condition and goes back on with it', () => {
    const { sys } = make();
    sys.stopEngine();
    const a = person('a');
    const inv = new CarrierStores([a]);
    sys.state.slots.cooling!.cond = 47;
    expect(applyOp(sys, { kind: 'remove', slot: 'cooling' }, { inv }).ok).toBe(true);
    expect(a.hands.id).toBe('part.cooling.1');
    expect(a.hands.cond).toBe(47);
    expect(a.hands.toJSON()).toEqual({ id: 'part.cooling.1', fill: 0, cond: 47 });
    expect(applyOp(sys, { kind: 'install', item: 'part.cooling.1' }, { inv }).ok).toBe(true);
    expect(sys.state.slots.cooling).toEqual({ id: 'part.cooling.1', cond: 47 });
    expect(a.hands.empty).toBe(true);
  });

  it('a found part without a record is used, not new; the best one is taken first', () => {
    const { sys } = make();
    sys.stopEngine();
    sys.state.slots.brakes = null;
    const a = person('a');
    a.pack.add('part.brakes.1', 1);
    a.pack.add('part.brakes.1', 1, { cond: 90 });
    a.pack.add('tool.repairkit', 2);
    const inv = new CarrierStores([a]);
    applyOp(sys, { kind: 'install', item: 'part.brakes.1' }, { inv });
    expect(sys.state.slots.brakes!.cond).toBe(90);
    sys.state.slots.brakes = null;
    applyOp(sys, { kind: 'install', item: 'part.brakes.1' }, { inv });
    expect(sys.state.slots.brakes!.cond).toBe(FOUND_COND);
    expect(applyOp(sys, { kind: 'repair', slot: 'engine' }, { inv }).ok).toBe(true);
    expect(a.pack.count('tool.repairkit')).toBe(1);
  });

  it('tools are found in the pack, a second person speeds the job, a full pair of hands spills into the bay', () => {
    const { sys } = make();
    sys.puncture(1);
    sys.setHandbrake(true);
    const a = person('a');
    const b = person('b');
    a.pack.add('tool.wrench', 1);
    b.hands.set('tool.jack');
    const bay = new ItemStore(4, ANY_SIZE);
    const inv = new CarrierStores([a, b], [bay]);
    expect(planOp(sys, { kind: 'changeWheel', wheel: 1 }, { inv, people: 2 }).seconds).toBe(8);
    a.hands.set('fuel.jerrycan', 4);
    b.hands.set(null);
    b.pack.add('tool.jack', 0);
    // the jack in the bay counts too
    bay.add('tool.jack', 1);
    const inv2 = new CarrierStores([a, b], [bay]);
    expect(planOp(sys, { kind: 'fitTyre', wheel: 1, item: 'tyre.allterrain' }, { inv: inv2 }).reason?.code).toBe('missing_item');
    bay.add('tyre.allterrain', 1, { cond: 80 });
    expect(applyOp(sys, { kind: 'fitTyre', wheel: 1, item: 'tyre.allterrain' }, { inv: inv2 }).ok).toBe(true);
    expect(sys.state.wheels[1]).toMatchObject({ tyre: 'tyre.allterrain', tread: 80, flat: false });
    // the old tyre went to b's free hands (a holds a can)
    expect(b.hands.id).toBe('tyre.road');
    expect(b.hands.cond).toBe(0);
  });

  it('stores keep condition and litres through save and load', () => {
    const s = new ItemStore(3, ANY_SIZE);
    s.add('part.engine.2', 1, { cond: 33 });
    s.add('fuel.jerrycan', 1, { fill: 6.5 });
    const t = new ItemStore(3, ANY_SIZE).load(JSON.parse(JSON.stringify(s.toJSON())));
    expect(t.list()).toEqual([
      { id: 'part.engine.2', n: 1, cond: 33 },
      { id: 'fuel.jerrycan', n: 1, fill: 6.5 },
    ]);
  });
});
