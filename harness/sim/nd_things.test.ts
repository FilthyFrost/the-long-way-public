// The ND things' rules (docs/ND/PLAN.md, core/v3/nd): their rows go into the catalogue whole; the camera's prints, the
// coffee machine's brew and pour, the plant pot's growth on its water and its harvest, the grinder's battery — at
// Nomad Drive's numbers.
import { describe, expect, it } from 'vitest';
import { itemCatalogueProblems, itemDef, newItem } from '../../src/core/modcar/items';
import { CAMERA, filmOf, loadFilm, useFilm, zoomAt, ejected, developed } from '../../src/core/v3/nd/camera';
import { coffeeLack, coffeeOf, coffeeStep, ND_COFFEE, pourBag, putCup, startBrew, takeCup, takesBag } from '../../src/core/v3/nd/coffee';
import { BATTERY, hasBattery, insertBattery } from '../../src/core/v3/nd/battery';
import { chargeOf, drainGrinder, GRINDER, biteAt, runLeft } from '../../src/core/v3/nd/grinder';
import { CROP_IDS, CROP_INFO, ND_CAMERA, ND_COFFEE_MACHINE, ND_FRIDGE, ND_FRUIT, ND_GRINDER, ND_MUG, ND_POT, ND_SEEDS, registerNdItems } from '../../src/core/v3/nd/items';
import { cropOfSeeds, CROPS, fruitsLeft, grownOf, growSOf, pick, POT, potOf, potStep, sow, stageOf, uproot, waitsFor, water } from '../../src/core/v3/nd/plants';
import { FOOD } from '../../src/core/v3/kitchen/pantry';

registerNdItems();

describe('ND things', () => {
  it('are in the catalogue, whole, once', () => {
    registerNdItems();
    expect(itemDef(ND_CAMERA).name.zh).toBe('拍立得相机');
    expect(itemDef(ND_FRIDGE).holds?.decay).toBe(0.25);
    expect(itemDef(ND_SEEDS.apple).model).toBe('nd_seed_packet');
    expect(itemCatalogueProblems()).toEqual([]);
  });

  it('a camera has ten prints, a box of film ten more; its zoom goes to four times', () => {
    const cam = newItem(ND_CAMERA);
    expect(filmOf(cam)).toBe(CAMERA.films);
    for (let i = 0; i < CAMERA.films; i++) expect(useFilm(cam)).toBe(true);
    expect(useFilm(cam)).toBe(false);
    expect(loadFilm(cam)).toBe(CAMERA.pack);
    expect(zoomAt(0)).toBe(1);
    expect(zoomAt(1)).toBe(4);
    expect(zoomAt(0.5)).toBeCloseTo(2, 6);
    expect(ejected(0)).toBe(0);
    expect(ejected(CAMERA.ejectS)).toBe(1);
    expect(developed(6)).toBeCloseTo(0.5, 6);
  });

  it('the coffee machine: a bag (no lid to work: it opens as one looks), a mug, the switch; 7.5 s, then it runs in at 0.5 L/s', () => {
    const m = newItem(ND_COFFEE_MACHINE);
    const mug = newItem(ND_MUG);
    expect(coffeeLack(m)).toBe('cup');
    expect(takesBag(m)).toBe(true);
    expect(pourBag(m)).toBe(true);
    expect(pourBag(m)).toBe(false); // (the hopper is full)
    expect(putCup(m, mug)).toBe(true);
    expect(coffeeLack(m)).toBe('');
    expect(startBrew(m)).toBe(true);
    let t = 0;
    let done = false;
    let ranAt = -1;
    while (!done && t < 20) {
      const r = coffeeStep(m, 0.05);
      t += 0.05;
      if (r.ran > 0 && ranAt < 0) ranAt = t;
      done = r.done;
    }
    expect(ranAt).toBeGreaterThan(ND_COFFEE.brewS - 0.06);
    expect(ranAt).toBeLessThan(ND_COFFEE.brewS + 0.11);
    // the mug full (0.35 L), 0.7 s of flow, the hopper still good for 0.65 L
    expect(mug.litres).toBeCloseTo(0.35, 4);
    expect(t).toBeCloseTo(ND_COFFEE.brewS + 0.35 / ND_COFFEE.flow, 1);
    expect(coffeeOf(m).fill).toBeCloseTo(0.65, 4);
    expect(coffeeLack(m)).toBe('full');
    expect(takeCup(m)).toBe(mug);
    expect(coffeeLack(m)).toBe('cup');
    // (a bag tops a hopper that is not full up to full again)
    expect(takesBag(m)).toBe(true);
    expect(pourBag(m)).toBe(true);
    expect(coffeeOf(m).fill).toBe(ND_COFFEE.bag);
  });

  it('the plant pot grows by day on its water — a quick crop through twenty-one minutes of daylight on two waterings — waits dry and in the dark, bears, and bears again', () => {
    const p = newItem(ND_POT);
    expect(cropOfSeeds(ND_SEEDS.apple)).toBe('apple');
    expect(cropOfSeeds(ND_SEEDS.strawberry)).toBe('strawberry');
    expect(cropOfSeeds('nd_mug')).toBeNull();
    expect(stageOf(p)).toBe(-1);
    expect(sow(p, 'tomato')).toBe(true);
    // (something grows here: another crop only when it is sown over it — never the same one over itself)
    expect(sow(p, 'apple')).toBe(false);
    expect(sow(p, 'tomato', true)).toBe(false);
    // dry: nothing grows
    for (let i = 0; i < 100; i++) potStep(p, 1);
    expect(potOf(p).grown).toBe(0);
    expect(waitsFor(p)).toBe('water');
    // the soil's litre; in the dark nothing grows either
    expect(water(p, 5)).toBeCloseTo(1, 6);
    for (let i = 0; i < 100; i++) potStep(p, 1, 0);
    expect(potOf(p).grown).toBe(0);
    expect(waitsFor(p, 0)).toBe('sun');
    expect(waitsFor(p, 1)).toBeNull();
    // by day: a quarter of an hour of growing on that litre, then it waits for more
    for (let i = 0; i < 2000; i++) potStep(p, 1);
    expect(potOf(p).grown).toBeCloseTo(POT.lastsS, 3);
    expect(growSOf('tomato')).toBe(1260);
    expect(stageOf(p)).toBe(2);
    expect(waitsFor(p)).toBe('water');
    // watered again: the rest, and it is ripe
    water(p, 5);
    let ripe = false;
    let t = 0;
    while (!ripe && t < 5000) {
      ripe = potStep(p, 1);
      t += 1;
    }
    expect(t).toBeCloseTo(growSOf('tomato') - POT.lastsS, 0);
    expect(stageOf(p)).toBe(4);
    expect(waitsFor(p)).toBeNull();
    expect(fruitsLeft(p)).toEqual([0, 1, 2, 3]);
    // (the kitchen's own tomato: docs/V3/plan/growth.md §三)
    expect(pick(p, 2)).toBe('ing_tomato');
    expect(pick(p, 2)).toBeNull();
    for (const i of [0, 1, 3]) expect(pick(p, i)).toBe('ing_tomato');
    // picked bare it is half grown again, and bears once more after the other half
    expect(potOf(p).crop).toBe('tomato');
    expect(grownOf(p)).toBeCloseTo(POT.again, 6);
    expect(potOf(p).borne).toBe(1);
    expect(fruitsLeft(p)).toEqual([]);
    ripe = false;
    t = 0;
    while (!ripe && t < 5000) {
      water(p, 5);
      // (half the sun: half as fast)
      ripe = potStep(p, 1, 0.5);
      t += 1;
    }
    expect(t).toBeCloseTo(growSOf('tomato') * (1 - POT.again) * 2, -1);
    expect(fruitsLeft(p)).toEqual([0, 1, 2, 3]);
    // another crop sown over it takes its place; pulled up, the pot is empty and its soil keeps its water
    expect(sow(p, 'watermelon', true)).toBe(true);
    expect(potOf(p)).toMatchObject({ crop: 'watermelon', grown: 0 });
    expect(potOf(p).left).toBeUndefined();
    expect(uproot(p)).toBe(true);
    expect(stageOf(p)).toBe(-1);
    expect(potOf(p).water).toBeGreaterThan(0.5);
    expect(uproot(p)).toBe(false);
  });

  it('the seventeen crops: the garden\'s sixteen and the apple — each its packet of seeds, what it bears one of the kitchen\'s ingredients, a day or two of the game to grow', () => {
    expect(CROP_IDS.length).toBe(17);
    for (const id of ['tomato', 'potato', 'carrot', 'onion', 'cabbage', 'cucumber', 'corn', 'lettuce', 'pepper', 'eggplant', 'pumpkin', 'broccoli', 'chili', 'garlic', 'strawberry', 'watermelon', 'apple']) expect(CROP_IDS).toContain(id);
    for (const id of CROP_IDS) {
      const seeds = itemDef(ND_SEEDS[id]);
      expect(seeds.model, id).toBe('nd_seed_packet');
      expect(seeds.name.zh).toBe(`${CROP_INFO[id].zh}种子`);
      expect(seeds.stars).toBe(CROP_INFO[id].stars);
      expect(cropOfSeeds(ND_SEEDS[id])).toBe(id);
      // (what it bears: the pantry's ingredient of the same name)
      expect(ND_FRUIT[id]).toBe(`ing_${id}`);
      expect(FOOD[id], id).toBeDefined();
      expect(CROPS[id].n).toBe(CROP_INFO[id].bears);
      expect(CROPS[id].n).toBeGreaterThanOrEqual(1);
      expect(CROPS[id].n).toBeLessThanOrEqual(4);
      // (a day of the game is forty minutes, some half of it light: 21 to 40 minutes of daylight is one to two days)
      expect(growSOf(id)).toBeGreaterThanOrEqual(1200);
      expect(growSOf(id)).toBeLessThanOrEqual(2400);
      // a pot of it, grown: as many fruits as it bears
      const p = newItem(ND_POT);
      sow(p, id);
      for (let t = 0; t < 4000 && stageOf(p) < 4; t += 10) {
        water(p, 5);
        potStep(p, 10);
      }
      expect(fruitsLeft(p).length, id).toBe(CROP_INFO[id].bears);
    }
    // (the seeds one is likelier to find far down the road are the harder to come by)
    expect(CROP_IDS.filter((id) => CROP_INFO[id].stars === 1).length).toBeGreaterThanOrEqual(8);
    expect(CROP_INFO.watermelon.stars).toBe(3);
  });

  it('a battery goes into a grinder only once its own is spent, and puts 100 in of its 125', () => {
    const g = newItem(ND_GRINDER);
    expect(hasBattery(g, GRINDER.max)).toBe(true);
    expect(insertBattery(g, GRINDER.max)).toBe(false);
    for (let i = 0; i < 400; i++) drainGrinder(g, 1);
    expect(chargeOf(g)).toBe(0);
    expect(hasBattery(g, GRINDER.max)).toBe(false);
    expect(insertBattery(g, GRINDER.max)).toBe(true);
    expect(chargeOf(g)).toBe(BATTERY.charge);
    expect(runLeft(g)).toBeCloseTo(153.85, 1);
    expect(insertBattery(g, GRINDER.max)).toBe(false);
  });

  it('the grinder runs some 192 s on its charge; bites hardest held still', () => {
    const g = newItem(ND_GRINDER);
    expect(chargeOf(g)).toBe(GRINDER.max);
    expect(runLeft(g)).toBeCloseTo(192.3, 1);
    for (let i = 0; i < 100; i++) drainGrinder(g, 1);
    expect(chargeOf(g)).toBeCloseTo(GRINDER.max - 65, 6);
    // (a sweep takes it all: whole up to a metre a second, a third of it waved at 2.5 — docs/V3/plan/hands.md §五)
    expect(biteAt(0)).toBe(1);
    expect(biteAt(0.75)).toBe(1);
    expect(biteAt(1.75)).toBeCloseTo(0.65, 6);
    expect(biteAt(3)).toBeCloseTo(0.3, 6);
  });
});

// (ND frying is the kitchen's since J4: docs/V3/plan/growth.md §三 — its tests are the kitchen's, harness/sim/k3_*, j4_*)
