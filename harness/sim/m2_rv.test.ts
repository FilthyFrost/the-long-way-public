/**
 * Milestone M2, the motorhome lived in (docs/V3/nodes/M2-rv.md), in its plain data and maths: the living space one
 * walks about in (core/modcar/aboard.ts), the 10 cm grid things aimed into a vehicle keep to and the motorhome's
 * new places to put things (core/modcar/cargo.ts), the appliances' rules (core/v3/appliances: stations and records),
 * coffee as a drink (vitals.ts), the coffee kinds in the catalogue (the drip coffee maker retired into the coffee
 * machine's: docs/V3/plan/growth.md §一 4), and the appliances module in the tests' stand-in game.
 */
import { describe, expect, it } from 'vitest';
import { ABOARD, aboardOf } from '../../src/core/modcar/aboard';
import { findSpot, zonesOf, type HeightGrid } from '../../src/core/modcar/cargo';
import { cleanItem, hasItem, itemDef, newItem, retiredKind } from '../../src/core/modcar/items';
import { connected, EYE_HEIGHT, Walker } from '../../src/core/onboard/walker';
import { drink, has, newVitals } from '../../src/core/modcar/vitals';
import { appOf, applianceOf, channelOf, CHANNELS, COFFEE_GROUNDS, COFFEE_NO_POT, COFFEE_POT, COFFEE_WITH_POT, nextChannel, toggle } from '../../src/core/v3/appliances/appliances';
import { coffeeOf, isCup } from '../../src/core/v3/nd/coffee';
import { registerNdItems } from '../../src/core/v3/nd/items';
import { itemVessel } from '../../src/core/v3/nd/water';
import { itemCard } from '../../src/game/modcar/itemInfo';
import appliancesModule, { appliances } from '../../src/game/modcar/v3/appliances/index';
import { FakeGame } from './v3/fakeGame';

describe('the motorhome one walks about in', () => {
  const rv = ABOARD.rv;

  it('is one connected floor, from behind the cab seats to the rear bench, with its side door', () => {
    expect(aboardOf('rv')).toBe(rv);
    expect(aboardOf('sedan')).toBeNull();
    expect(connected(rv)).toBe(true);
    const w = new Walker(rv);
    w.place(rv.aft![0], rv.aft![1], Math.PI);
    expect(w.inside(w.x, w.z)).toBe(true);
    // (the door's spot inside is on the floor, its spot outside is not)
    const door = rv.doors[0];
    expect(w.inside(door.inside[0], door.inside[1])).toBe(true);
    expect(w.inside(door.outside[0], door.outside[1])).toBe(false);
  });

  it('takes one aft along the aisle to the rear, and never through the galley', () => {
    const w = new Walker(rv);
    w.place(rv.aft![0], rv.aft![1], Math.PI);
    let minZ = Infinity;
    for (let t = 0; t < 3; t += 1 / 30) {
      w.step(1 / 30, 1, 0);
      if (w.x < -0.8 && w.x > -1.95) minZ = Math.min(minZ, w.z);
    }
    expect(w.x).toBeLessThan(-2.45);
    // the aisle is between the galley (z < −0.48) and the wardrobe
    expect(minZ).toBeGreaterThanOrEqual(-0.48 - 1e-6);
    expect(w.eye().y).toBeCloseTo(0.86 + EYE_HEIGHT, 5);
  });
});

describe('things put where one aims in the motorhome', () => {
  /** a flat floor at height h over a zone */
  const flat = (z: { x: readonly [number, number]; z: readonly [number, number] }, h: number): HeightGrid => {
    const cell = 0.02;
    const nx = Math.ceil((z.x[1] - z.x[0]) / cell);
    const nz = Math.ceil((z.z[1] - z.z[0]) / cell);
    return { x0: z.x[0], z0: z.z[0], cell, nx, nz, h: new Float32Array(nx * nz).fill(h) };
  };
  const box = { minX: -0.05, maxX: 0.05, minY: 0, maxY: 0.1, minZ: -0.05, maxZ: 0.05 };

  it('has the table, the galley, the floor by the door, the bed across the back, the open shelves, the cubby under the sink and the walls', () => {
    const ids = zonesOf('rv').map((z) => z.id);
    // (the rear bench is a bed, the lockers open shelves, since docs/V3/plan/finish.md §十一 1)
    for (const id of ['lounge', 'table', 'galley', 'bed', 'shelfL', 'shelfR', 'cubby', 'wall']) expect(ids).toContain(id);
    expect(ids).not.toContain('bench');
    expect(zonesOf('rv').find((z) => z.id === 'wall')?.wall).toBe(true);
  });

  it('keeps a thing aimed into a zone to the 10 cm grid', () => {
    const table = zonesOf('rv').find((z) => z.id === 'table')!;
    const g = flat(table, table.floor);
    const s = findSpot(table, g, box, 0, { x: -0.42, z: -0.62 }, [], 0.1)!;
    expect(s).not.toBeNull();
    expect(Math.abs(s.x * 10 - Math.round(s.x * 10))).toBeLessThan(1e-6);
    expect(Math.abs(s.z * 10 - Math.round(s.z * 10))).toBeLessThan(1e-6);
    expect(s.y).toBeCloseTo(table.floor, 5);
    // (without a grid it goes just where it is aimed)
    const free = findSpot(table, g, box, 0, { x: -0.42, z: -0.62 }, [], 0)!;
    expect(free.x).toBeCloseTo(-0.42, 5);
    expect(free.z).toBeCloseTo(-0.62, 5);
  });
});

describe('the other appliances', () => {
  it('are the clock radio, the record player, the television and the two lamps (the junk they always were)', () => {
    expect(applianceOf('junk_clockradio')).toBe('radio');
    expect(applianceOf('junk_record')).toBe('record');
    expect(applianceOf('junk_tv')).toBe('tv');
    expect(applianceOf('junk_lamp')).toBe('lamp');
    expect(applianceOf('junk_solar_lamp')).toBe('solar');
    // (the drip coffee maker is no more: the coffee machine is Nomad Drive's)
    expect(applianceOf(COFFEE_WITH_POT)).toBeNull();
    expect(applianceOf(COFFEE_NO_POT)).toBeNull();
    expect(applianceOf('junk_fax')).toBeNull();
    for (const id of ['junk_clockradio', 'junk_record', 'junk_tv', 'junk_lamp', 'junk_solar_lamp']) expect(itemDef(id).cat).toBe('junk');
  });

  it('switch on and off, and go round their stations, a record player found with a record of its own', () => {
    const r = newItem('junk_clockradio');
    expect(toggle(r)).toBe(true);
    expect(appOf(r).on).toBe(true);
    expect(toggle(r)).toBe(false);
    expect(appOf(r).on).toBeUndefined();
    const rec = newItem('junk_record');
    const first = channelOf(rec);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(CHANNELS);
    expect(channelOf(rec)).toBe(first);
    const seen = new Set<number>();
    for (let i = 0; i < CHANNELS; i++) seen.add(nextChannel(rec));
    expect(seen.size).toBe(CHANNELS);
  });
});

describe('coffee, and the kinds that go with it', () => {
  it('is a pot found empty, in the kitchen: the coffee machine takes it under its spout, and it pours into a mug', () => {
    registerNdItems();
    const pot = newItem(COFFEE_POT);
    expect(pot.litres).toBe(0);
    expect(itemDef(COFFEE_POT).drink?.liquid).toBe('coffee');
    expect(itemDef(COFFEE_POT).cat).toBe('kitchen');
    expect(isCup(pot)).toBe(true);
    expect(itemVessel(pot)?.holds).toBe(1);
    // (any other drink still comes full)
    expect(newItem('drink_water').litres).toBe(2);
  });

  it('a drip coffee maker in a save is the coffee machine with its pot, its ground coffee a bag of beans', () => {
    registerNdItems();
    for (const id of [COFFEE_WITH_POT, COFFEE_NO_POT, COFFEE_GROUNDS]) {
      expect(hasItem(id), id).toBe(false);
      expect(retiredKind(id), id).toBe(true);
    }
    const loss = { unknown: 0 };
    const m = cleanItem({ uid: 'i900', item: COFFEE_WITH_POT, state: { app: { water: 0.4, grounds: 1, coffee: 0.3 } } }, loss)!;
    expect(m.item).toBe('nd_coffee_machine');
    expect(coffeeOf(m).cup?.item).toBe(COFFEE_POT);
    expect(coffeeOf(m).cup?.litres).toBeCloseTo(0.3, 6);
    const bare = cleanItem({ uid: 'i901', item: COFFEE_NO_POT }, loss)!;
    expect(bare.item).toBe('nd_coffee_machine');
    expect(coffeeOf(bare).cup).toBeUndefined();
    const bag = cleanItem({ uid: 'i902', item: COFFEE_GROUNDS, uses: 5 }, loss)!;
    expect(bag.item).toBe('nd_coffee_pack');
    expect(itemDef(bag.item).name.zh).toBe('咖啡豆');
    expect(loss.unknown).toBe(0);
  });

  it('quenches a little, warms and wakes one up (J6: energy back, kept awake a while)', () => {
    const v = newVitals();
    v.water = 50;
    v.energy = 30;
    drink(v, 'coffee', 0.1);
    expect(has(v, 'warm1')).toBe(true);
    expect(has(v, 'awake')).toBe(true);
    expect(v.energy).toBeCloseTo(46, 6);
    const g = v.gains[v.gains.length - 1];
    expect(g.water).toBeCloseTo(6, 6);
    expect(g.temp).toBeGreaterThan(0);
  });

  it('says on its cards what an appliance is doing', () => {
    const tv = newItem('junk_tv');
    toggle(tv, true);
    expect(itemCard(tv, 0).notes.some((n) => n.text.startsWith('开着'))).toBe(true);
    expect(appOf(tv).on).toBe(true);
  });
});

describe('the appliances module', () => {
  it('installs its system as the source of devices, and finds none where nothing lies', async () => {
    const game = await new FakeGame([appliancesModule]).start();
    expect(game.systems.registered).toContain('appliances');
    const out: unknown[] = [];
    appliances.near({ x: 0, z: 0 }, 10, out as never[]);
    expect(out.length).toBe(0);
    // (nothing plays)
    expect(game.radioSets.some((s) => s.length > 0)).toBe(false);
    for (let i = 0; i < 10; i++) game.frame(1 / 60);
    expect(game.reports).toEqual([]);
  });
});
