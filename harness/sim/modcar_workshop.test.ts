/**
 * The workshop (src/core/modcar/crafting.ts, workshop.ts; docs/MODCAR.md §14): what the recycler gives for parts,
 * tools and items, the bench's recipes and its hammer, the materials taken and given, the generator's burn, its
 * starter rope and wrong fuel, and things going into the recycler.
 */
import { describe, expect, it } from 'vitest';
import { addTo, canAfford, costTotal, hits, itemSalvage, newStock, partSalvage, partStars, RECIPES, recipeDef, recipeOpen, shortOf, spend, toolSalvage } from '../../src/core/modcar/crafting';
import { hasItem, itemDef, newItem } from '../../src/core/modcar/items';
import { hasPart, partDef } from '../../src/core/modcar/parts';
import { fitSub, newInstance } from '../../src/core/modcar/build';
// (the modules' own things — Nomad Drive's tools, the fishing's rods — registered as the game installs them)
import.meta.glob('../../src/game/modcar/v3/*/index.ts', { eager: true });
import { newTool, pourTank, siphonTank, tankLitres } from '../../src/core/modcar/tools';
import { flushIngests, GARAGE_GENERATOR, generatorFuel, generatorLeft, ingestPose, newGenerator, newIngest, pullCord, RECYCLE, ROADSIDE_GENERATOR, stepGenerator, stepIngests, stopGenerator } from '../../src/core/modcar/workshop';

describe('ModCar workshop', () => {
  it('the recycler gives scrap for every part — an old engine 20, a V8 180; a wheel its rim and its tyre — and components for those with a motor or a board in them; the liquids in a part give nothing', () => {
    expect(partSalvage(newInstance('eng_mower'))).toEqual({ scrap: 20, components: 2 });
    expect(partSalvage(newInstance('eng_v8'))).toEqual({ scrap: 180, components: 16 });
    const rim = newInstance('rim_steel13');
    const bare = partSalvage(rim).scrap ?? 0;
    fitSub(rim, 'tire', newInstance('tire_road'));
    expect(partSalvage(rim).scrap).toBeGreaterThan(bare);
    expect(partSalvage(rim).components).toBeUndefined();
    // 4.5 L of oil in it: the same as dry
    const eng = newInstance('eng_i4');
    const dry = partSalvage(eng);
    eng.fluids.oilL = 4.5;
    expect(partSalvage(eng)).toEqual(dry);
    for (const id of ['door_stock', 'seat_bucket', 'steer_std']) {
      expect(partSalvage(newInstance(id)).scrap).toBeGreaterThan(0);
      expect(partSalvage(newInstance(id)).components).toBeUndefined();
    }
    // (a battery, a radio, a house battery, a solar panel: a few)
    expect(partSalvage(newInstance('bat_std')).components).toBeGreaterThan(0);
    expect(partSalvage(newInstance('bat_house')).components).toBeGreaterThan(0);
    expect(partSalvage(newInstance('roof_solar')).components).toBe(5);
    expect(partStars('eng_v8')).toBe(5);
  });

  it('tools and items: a jerrycan 3 scrap, full or empty; the scrapers 3 / 7 / 10; a box of old components 20 scrap, a box of electrical ones 12 components; anything at all one scrap', () => {
    expect(toolSalvage(newTool('jerrycan', { litres: 0 }))).toEqual({ scrap: 3 });
    expect(toolSalvage(newTool('jerrycan', { litres: 20 }))).toEqual({ scrap: 3 });
    expect([1, 2, 3].map((t) => toolSalvage(newTool('scraper', { tier: t as 1 | 2 | 3 })).scrap)).toEqual([3, 7, 10]);
    expect(toolSalvage(newTool('sponge'))).toEqual({ scrap: 1 });
    expect(itemSalvage(newItem('crate_parts'))).toEqual({ scrap: 20 });
    expect(itemSalvage(newItem('crate_chem'))).toEqual({ components: 12 });
    expect(itemDef('crate_chem').name.zh).toBe('元件箱');
    expect(itemSalvage(newItem('crate_lye'))).toEqual({ components: 10 });
    // a big bottle of water, full: one scrap (what is in it gives nothing)
    expect(itemSalvage(newItem('drink_water'))).toEqual({ scrap: 1 });
    // what has a board in it: a television 10 and 3, a fax 8 and 3, a transceiver 12 and 4, a fridge 18 and 6
    expect(itemSalvage(newItem('junk_tv'))).toEqual({ scrap: 10, components: 3 });
    expect(itemSalvage(newItem('junk_fax'))).toEqual({ scrap: 8, components: 3 });
    expect(itemSalvage(newItem('junk_transceiver'))).toEqual({ scrap: 12, components: 4 });
    expect(itemSalvage(newItem('nd_fridge'))).toEqual({ scrap: 18, components: 6 });
  });

  it('every recipe makes a thing that exists; only the plastic scraper is known from the start; the hammer strikes once for every 25, one to three times', () => {
    for (const r of RECIPES) {
      if (r.makes.kind === 'part') {
        expect(hasPart(r.makes.part)).toBe(true);
        if (r.makes.tire) expect(partDef(r.makes.tire).cat).toBe('tire');
      }
      if (r.makes.kind === 'item') expect(hasItem(r.makes.item)).toBe(true);
      expect(costTotal(r.cost)).toBeGreaterThan(0);
    }
    expect(RECIPES.filter((r) => recipeOpen(r)).map((r) => r.id)).toEqual(['scraper_1']);
    // (the metal and golden scrapers are retired: docs/V3/plan/hands.md §五)
    expect(RECIPES.some((r) => r.id === 'scraper_2' || r.id === 'scraper_3')).toBe(false);
    expect(hits({ scrap: 20 })).toBe(1);
    expect(hits({ scrap: 70 })).toBe(3);
    expect(hits({ scrap: 40 })).toBe(2);
    expect(hits({ scrap: 450 })).toBe(3);
    expect(itemDef('lamp_old').cat).toBe('lamp');
  });

  it('materials: what a recipe costs is taken all at once, or not at all; short of it says by how much', () => {
    const s = newStock();
    const scraper = recipeDef('scraper_1').cost;
    expect(canAfford(s, scraper)).toBe(false);
    // (the plastic scraper's 50: the start's two boxes and the dead television, docs/V3/plan/growth.md §一 1)
    addTo(s, { scrap: 30 });
    expect(shortOf(s, scraper)).toEqual({ mat: 'scrap', n: 20 });
    expect(spend(s, scraper)).toBe(false);
    expect(s.scrap).toBe(30);
    addTo(s, { scrap: 30, components: 5 });
    expect(spend(s, scraper)).toBe(true);
    expect(s).toEqual({ scrap: 10, components: 5 });
    // (a thing that asks for components: short of those says so)
    const torch = recipeDef('flashlight').cost;
    expect(shortOf({ scrap: 100, components: 1 }, torch)).toEqual({ mat: 'components', n: 1 });
  });

  it('the generator: the garage one runs 50 minutes on 3 L of diesel, a roadside one 10 minutes; it stops when dry', () => {
    const g = newGenerator(GARAGE_GENERATOR, 3);
    g.on = true;
    expect(generatorLeft(g, GARAGE_GENERATOR)).toBeCloseTo(3000, 0);
    for (let t = 0; t < 2990; t += 1) expect(stepGenerator(g, GARAGE_GENERATOR, 1)).toBe('');
    expect(g.on).toBe(true);
    let end = '';
    for (let t = 0; t < 20 && !end; t += 1) end = stepGenerator(g, GARAGE_GENERATOR, 1);
    expect(end).toBe('dry');
    expect(g.on).toBe(false);
    const r = newGenerator(ROADSIDE_GENERATOR, 3);
    r.on = true;
    expect(generatorLeft(r, ROADSIDE_GENERATOR)).toBeCloseTo(600, 0);
  });

  it('pulling the rope: a cold one may need more than one pull, never more than three; no fuel only turns it over; petrol coughs', () => {
    for (const seed of [0.99, 0.9, 0.8]) {
      const g = newGenerator(GARAGE_GENERATOR, 3);
      let pulls = 0;
      while (!g.on && pulls < 5) {
        pullCord(g, seed);
        pulls++;
      }
      expect(g.on).toBe(true);
      expect(pulls).toBeLessThanOrEqual(3);
    }
    const warm = newGenerator(GARAGE_GENERATOR, 3);
    warm.cold = 0;
    expect(pullCord(warm, 0.99)).toBe('caught');
    const dry = newGenerator(GARAGE_GENERATOR, 0);
    expect(pullCord(dry, 0)).toBe('turn');
    expect(dry.on).toBe(false);
    const wrong = newGenerator(GARAGE_GENERATOR, 2, 'petrol');
    expect(pullCord(wrong, 0)).toBe('cough');
    expect(generatorFuel(wrong).runs).toBe(false);
    // a little petrol in the diesel: it runs, and burns a quarter more
    const mixed = newGenerator(GARAGE_GENERATOR, 9);
    mixed.tank.fuel.petrol = 1.5;
    expect(generatorFuel(mixed).runs).toBe(true);
    expect(generatorFuel(mixed).burnK).toBe(1.25);
    stopGenerator(mixed);
    expect(mixed.on).toBe(false);
  });

  it('its tank takes a jerrycan like a vehicle\'s: 2 L a second in, drawn back slower, no more than it holds', () => {
    const g = newGenerator(GARAGE_GENERATOR, 0);
    const can = newTool('jerrycan', { fuel: 'diesel', litres: 20 });
    for (let t = 0; t < 10; t += 0.1) pourTank(can, g.tank, 0.1);
    expect(tankLitres(g.tank)).toBeCloseTo(10, 5);
    expect(can.litres).toBeCloseTo(10, 5);
    const empty = newTool('jerrycan', { fuel: 'petrol', litres: 0 });
    const moved = siphonTank(empty, g.tank, 1);
    expect(moved).toBeCloseTo(1.4, 5);
    expect(empty.fuel).toBe('diesel');
  });

  it('the recycler: 2.4 s a thing, counted up while it is ground, several at once; nothing moves without power', () => {
    const list = [newIngest({ scrap: 20 }), newIngest({ components: 9 })];
    let scrap = 0;
    let organics = 0;
    const off = stepIngests(list, 1, false);
    expect(off.done.length).toBe(0);
    expect(list[0].t).toBe(0);
    let halfway = 0;
    for (let t = 0; t < 2.4 + 1e-6; t += 0.05) {
      const r = stepIngests(list, 0.05, true);
      scrap += r.add.scrap ?? 0;
      organics += r.add.components ?? 0;
      if (Math.abs(t - 1.6) < 0.026) halfway = scrap;
    }
    expect(list.length).toBe(0);
    expect(scrap).toBe(20);
    expect(organics).toBe(9);
    expect(halfway).toBeGreaterThan(5);
    expect(halfway).toBeLessThan(20);
    // gliding over the hopper first, then down and away to almost nothing
    expect(ingestPose(0.1, 1).scale).toBe(1);
    expect(ingestPose(1, 1).scale).toBeCloseTo(RECYCLE.endScale, 5);
    expect(ingestPose(1, 1).down).toBeCloseTo(RECYCLE.depth, 5);
    // a save taken half way: the rest at once
    const s = newStock();
    const one = [newIngest({ scrap: 8 })];
    stepIngests(one, 1.8, true);
    const counted = one[0].paid.scrap ?? 0;
    flushIngests(one, s);
    expect(counted + s.scrap).toBe(8);
  });
});
