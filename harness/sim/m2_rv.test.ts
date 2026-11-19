/**
 * Milestone M2, the motorhome lived in (docs/V3/nodes/M2-rv.md), in its plain data and maths: the living space one
 * walks about in (core/modcar/aboard.ts), the 10 cm grid things aimed into a vehicle keep to and the motorhome's
 * new places to put things (core/modcar/cargo.ts), the appliances' rules (core/v3/appliances: the coffee maker's
 * tank, filter, pot and brew; stations and records), coffee as a drink (vitals.ts), the coffee kinds in the
 * catalogue, and the appliances module in the tests' stand-in game.
 */
import { describe, expect, it } from 'vitest';
import { ABOARD, aboardOf } from '../../src/core/modcar/aboard';
import { findSpot, zonesOf, type HeightGrid } from '../../src/core/modcar/cargo';
import { itemDef, newItem } from '../../src/core/modcar/items';
import { connected, EYE_HEIGHT, Walker } from '../../src/core/onboard/walker';
import { drink, has, newVitals } from '../../src/core/modcar/vitals';
import { addGrounds, appOf, applianceOf, appState, brewLack, brewStep, channelOf, CHANNELS, COFFEE, COFFEE_GROUNDS, COFFEE_NO_POT, COFFEE_POT, COFFEE_WITH_POT, hasPot, nextChannel, pourWater, putPot, startBrew, takePot, toggle } from '../../src/core/v3/appliances/appliances';
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
    w.place(rv.aft[0], rv.aft[1], Math.PI);
    expect(w.inside(w.x, w.z)).toBe(true);
    // (the door's spot inside is on the floor, its spot outside is not)
    const door = rv.doors[0];
    expect(w.inside(door.inside[0], door.inside[1])).toBe(true);
    expect(w.inside(door.outside[0], door.outside[1])).toBe(false);
  });

  it('takes one aft along the aisle to the rear, and never through the galley', () => {
    const w = new Walker(rv);
    w.place(rv.aft[0], rv.aft[1], Math.PI);
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

  it('has the table, the galley, the floor by the door, the rear bench and the walls', () => {
    const ids = zonesOf('rv').map((z) => z.id);
    for (const id of ['lounge', 'table', 'galley', 'bench', 'wall']) expect(ids).toContain(id);
    expect(zonesOf('rv').find((z) => z.id === 'wall')?.wall).toBe(true);
  });

  it('keeps a thing aimed into a zone to the 10 cm grid', () => {
    const table = zonesOf('rv').find((z) => z.id === 'table')!;
    const g = flat(table, table.floor);
    const s = findSpot(table, g, box, 0, { x: 0.33, z: -0.62 }, [], 0.1)!;
    expect(s).not.toBeNull();
    expect(Math.abs(s.x * 10 - Math.round(s.x * 10))).toBeLessThan(1e-6);
    expect(Math.abs(s.z * 10 - Math.round(s.z * 10))).toBeLessThan(1e-6);
    expect(s.y).toBeCloseTo(table.floor, 5);
    // (without a grid it goes just where it is aimed)
    const free = findSpot(table, g, box, 0, { x: 0.33, z: -0.62 }, [], 0)!;
    expect(free.x).toBeCloseTo(0.33, 5);
    expect(free.z).toBeCloseTo(-0.62, 5);
  });
});

describe('the coffee maker', () => {
  const ready = (): ReturnType<typeof newItem> => {
    const m = newItem(COFFEE_WITH_POT);
    expect(pourWater(m, 2)).toBeCloseTo(COFFEE.tank, 6);
    const bag = newItem(COFFEE_GROUNDS);
    expect(addGrounds(m, bag)).toBe(true);
    return m;
  };

  it('says what it still needs, in order: its pot, water, ground coffee, room in the pot', () => {
    const bare = newItem(COFFEE_NO_POT);
    expect(brewLack(bare)).toBe('pot');
    const m = newItem(COFFEE_WITH_POT);
    expect(brewLack(m)).toBe('water');
    pourWater(m, 0.5);
    expect(brewLack(m)).toBe('grounds');
    appState(m).grounds = 1;
    expect(brewLack(m)).toBe('');
    appState(m).coffee = COFFEE.pot;
    expect(brewLack(m)).toBe('full');
    expect(startBrew(m)).toBe(false);
  });

  it('fills its tank to the brim and no more, and takes one portion of grounds from a bag at a time', () => {
    const m = newItem(COFFEE_WITH_POT);
    expect(pourWater(m, 0.4)).toBeCloseTo(0.4, 6);
    expect(pourWater(m, 5)).toBeCloseTo(COFFEE.tank - 0.4, 6);
    expect(pourWater(m, 1)).toBe(0);
    const bag = newItem(COFFEE_GROUNDS);
    expect(bag.uses).toBe(itemDef(COFFEE_GROUNDS).portions);
    expect(addGrounds(m, bag)).toBe(true);
    expect(bag.uses).toBe((itemDef(COFFEE_GROUNDS).portions ?? 0) - 1);
    expect(addGrounds(m, bag)).toBe(false);
    expect(bag.uses).toBe((itemDef(COFFEE_GROUNDS).portions ?? 0) - 1);
  });

  it('drips a full tank into its pot in some forty seconds, then switches itself off, the grounds spent', () => {
    const m = ready();
    expect(startBrew(m)).toBe(true);
    let t = 0;
    let done = 0;
    while (t < 120) {
      const r = brewStep(m, 1 / 60);
      t += 1 / 60;
      if (r.done) {
        done++;
        break;
      }
    }
    expect(done).toBe(1);
    expect(t).toBeGreaterThan(30);
    expect(t).toBeLessThan(50);
    const s = appOf(m);
    expect(s.on).toBeUndefined();
    expect(s.grounds).toBeUndefined();
    expect(s.coffee).toBeCloseTo(COFFEE.tank, 2);
    // (off, it drips no more)
    expect(brewStep(m, 1).dripped).toBe(0);
  });

  it('gives its pot with the coffee in it, and takes it back', () => {
    const m = ready();
    startBrew(m);
    for (let i = 0; i < 600; i++) brewStep(m, 1 / 60);
    const had = appOf(m).coffee ?? 0;
    expect(had).toBeGreaterThan(0.2);
    const pot = takePot(m);
    expect(m.item).toBe(COFFEE_NO_POT);
    expect(hasPot(m)).toBe(false);
    // (a brew going on stops with the pot taken off)
    expect(appOf(m).on).toBeUndefined();
    expect(pot.item).toBe(COFFEE_POT);
    expect(pot.litres).toBeCloseTo(had, 3);
    expect(brewLack(m)).toBe('pot');
    pot.litres = 0.25;
    putPot(m, pot);
    expect(m.item).toBe(COFFEE_WITH_POT);
    expect(appOf(m).coffee).toBeCloseTo(0.25, 6);
  });
});

describe('the other appliances', () => {
  it('are the clock radio, the record player, the television and the two lamps (the junk they always were)', () => {
    expect(applianceOf('junk_clockradio')).toBe('radio');
    expect(applianceOf('junk_record')).toBe('record');
    expect(applianceOf('junk_tv')).toBe('tv');
    expect(applianceOf('junk_lamp')).toBe('lamp');
    expect(applianceOf('junk_solar_lamp')).toBe('solar');
    expect(applianceOf(COFFEE_WITH_POT)).toBe('coffee');
    expect(applianceOf(COFFEE_NO_POT)).toBe('coffee');
    expect(applianceOf('junk_fax')).toBeNull();
    for (const id of ['junk_clockradio', 'junk_record', 'junk_tv', 'junk_lamp', 'junk_solar_lamp', COFFEE_NO_POT]) expect(itemDef(id).cat).toBe('junk');
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
  it('is a pot found empty and a bag of eight portions, in the kitchen', () => {
    const pot = newItem(COFFEE_POT);
    expect(pot.litres).toBe(0);
    expect(itemDef(COFFEE_POT).drink?.liquid).toBe('coffee');
    expect(itemDef(COFFEE_POT).cat).toBe('kitchen');
    expect(itemDef(COFFEE_GROUNDS).cat).toBe('kitchen');
    expect(newItem(COFFEE_GROUNDS).uses).toBe(8);
    // (any other drink still comes full)
    expect(newItem('drink_water').litres).toBe(2);
  });

  it('quenches a little, warms and wakes one up', () => {
    const v = newVitals();
    v.water = 50;
    drink(v, 'coffee', 0.1);
    expect(has(v, 'warm1')).toBe(true);
    expect(has(v, 'energy')).toBe(true);
    const g = v.gains[v.gains.length - 1];
    expect(g.water).toBeCloseTo(6, 6);
    expect(g.temp).toBeGreaterThan(0);
  });

  it('says on its cards what the machine holds and what it is doing', () => {
    const m = newItem(COFFEE_WITH_POT);
    Object.assign(appState(m), { water: 0.6, grounds: 1, coffee: 0.3 });
    const c = itemCard(m, 0);
    expect(c.bars.some((b) => b.label === '水箱')).toBe(true);
    expect(c.bars.some((b) => b.label === '壶里')).toBe(true);
    expect(c.rows.some((r) => r.label === '滤网里的咖啡粉' && r.value === '一份')).toBe(true);
    const tv = newItem('junk_tv');
    toggle(tv, true);
    expect(itemCard(tv, 0).notes.some((n) => n.text.startsWith('开着'))).toBe(true);
    const pot = newItem(COFFEE_POT, { litres: 0.5 });
    expect(itemCard(pot, 0).notes.some((n) => n.text.includes('提神暖身'))).toBe(true);
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
