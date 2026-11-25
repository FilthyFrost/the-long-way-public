/**
 * F6 (docs/V3/plan/finish.md §二 4: 看需要; §五: 永远不困死): what one is short of, and what the next places do about
 * it — more of it still there and the plan's supply a little thicker for one with less than twenty minutes' worth,
 * less and thinner for one with more than two hours' worth, never by more than 0.7 to 1.4; and what one is all but
 * out of at the next place for certain, asked for once.
 */
import { describe, expect, it } from 'vitest';
import { thinOut, looseKept, type Found } from '../../src/core/modcar/loot';
import { EVEN, NEED_HIGH, NEED_LOW, needOf, needOfEntry, rescueFinds, stockOf, SUPPLY_LEAST, SUPPLY_MOST, supplyCount, supplyFactor, supplyFactors, type RescueState, type Stocks } from '../../src/core/modcar/needs';
import { newTool } from '../../src/core/modcar/tools';
import '../../src/core/v3/nd/cards';
import.meta.glob('../../src/game/modcar/v3/*/index.ts', { eager: true });

const I = (item: string, n = 1): Found => ({ item, n });

describe('F6: what one is short of', () => {
  it('the supply scaled by what one has: 1.4 with twenty minutes\' worth and under, 0.7 with two hours\' worth and over, 1 between', () => {
    for (const need of ['food', 'water', 'petrol', 'tyres', 'meds'] as const) {
      expect(supplyFactor(need, 0)).toBe(SUPPLY_MOST);
      expect(supplyFactor(need, NEED_LOW[need])).toBe(SUPPLY_MOST);
      expect(supplyFactor(need, NEED_HIGH[need])).toBe(SUPPLY_LEAST);
      expect(supplyFactor(need, NEED_HIGH[need] * 10)).toBe(SUPPLY_LEAST);
      expect(supplyFactor(need, Math.sqrt(NEED_LOW[need] * NEED_HIGH[need]))).toBeCloseTo(1, 6);
      // never more for one who has more
      let last = Infinity;
      for (let k = 0; k <= 60; k++) {
        const f = supplyFactor(need, (NEED_HIGH[need] * 1.2 * k) / 60);
        expect(f).toBeLessThanOrEqual(last + 1e-12);
        expect(f).toBeGreaterThanOrEqual(SUPPLY_LEAST);
        expect(f).toBeLessThanOrEqual(SUPPLY_MOST);
        last = f;
      }
    }
    // (twenty minutes of play: a full stomach gone in 76 minutes; of driving: 20 km at 27 L a hundred)
    expect(NEED_LOW.food).toBeCloseTo((20 / 76) * 100, 0);
    expect(NEED_LOW.petrol).toBeCloseTo(20 * 0.27, 6);
    expect(supplyFactors({ food: 0, water: 500, petrol: 13, tyres: 0, meds: 9 })).toMatchObject({ food: 1.4, water: 0.7, tyres: 1.4, meds: 0.7 });
  });

  it('what a found thing answers, and what it adds to what one has', () => {
    expect(needOf(I('nd_baked_beans'))).toBe('food');
    expect(needOf(I('ing_rice'))).toBe('food');
    expect(needOf(I('drink_water'))).toBe('water');
    expect(needOf(I('drink_beer'))).toBeNull();
    expect(needOf(I('nd_tire_kit'))).toBe('tyres');
    expect(needOf(I('med_bandage'))).toBe('meds');
    expect(needOf(I('crate_parts'))).toBeNull();
    expect(needOf({ tool: newTool('jerrycan', { fuel: 'petrol', litres: 8 }) })).toBe('petrol');
    expect(needOf({ tool: newTool('jerrycan', { fuel: 'diesel', litres: 8 }) })).toBeNull();
    expect(stockOf(I('nd_baked_beans', 2))).toEqual({ food: 40 });
    expect(stockOf(I('drink_water'))).toEqual({ water: 200 });
    // (what is to cook: as it is worth cooked — its portion's food, 1.6 times)
    expect(stockOf(I('ing_rice', 2), () => 12).food).toBeCloseTo(12 * 1.6 * 2, 6);
    expect(stockOf({ tool: newTool('jerrycan', { fuel: 'petrol', litres: 8 }) })).toEqual({ petrol: 8 });
    expect(needOfEntry('fuel')).toBe('petrol');
    expect(needOfEntry('food')).toBe('food');
    expect(needOfEntry('coffee')).toBeNull();
  });

  it('a place\'s own: more of it still there for one who is short, less for one who has plenty; evenly as it always was', () => {
    const box: Found[] = Array.from({ length: 400 }, (_, i) => (i % 4 === 0 ? I('nd_baked_beans') : i % 4 === 1 ? I('drink_water') : i % 4 === 2 ? I('nd_tire_kit') : I('crate_parts')));
    const count = (list: Found[], item: string): number => list.filter((f) => 'item' in f && f.item === item).length;
    const even = thinOut(box, 7, 0.27);
    expect(thinOut(box, 7, 0.27, EVEN).map((f) => ('item' in f ? f.item : '')).join()).toBe(even.map((f) => ('item' in f ? f.item : '')).join());
    const short: Stocks = { food: 1.4, water: 1.4, petrol: 1.4, tyres: 1.4, meds: 1.4 };
    const rich: Stocks = { food: 0.7, water: 0.7, petrol: 0.7, tyres: 0.7, meds: 0.7 };
    const a = thinOut(box, 7, 0.27, short);
    const b = thinOut(box, 7, 0.27, rich);
    // (27 in a hundred of a hundred tins: about 38 for one who is short, about 19 for one who has plenty)
    expect(count(a, 'nd_baked_beans')).toBeGreaterThan(count(even, 'nd_baked_beans'));
    expect(count(b, 'nd_baked_beans')).toBeLessThan(count(even, 'nd_baked_beans'));
    expect(count(a, 'nd_baked_beans') / count(even, 'nd_baked_beans')).toBeLessThan(1.75);
    expect(count(b, 'nd_baked_beans') / count(even, 'nd_baked_beans')).toBeGreaterThan(0.5);
    // every tin one who has plenty finds, one who is short finds too
    expect(count(even, 'nd_baked_beans')).toBeGreaterThanOrEqual(count(b, 'nd_baked_beans'));
    // (a tyre kit was never thinned: all of them for one who is short, seven in ten for one who has plenty; junk as ever)
    expect(count(a, 'nd_tire_kit')).toBe(100);
    expect(count(b, 'nd_tire_kit')).toBeGreaterThan(55);
    expect(count(b, 'nd_tire_kit')).toBeLessThan(85);
    expect(count(b, 'crate_parts')).toBe(100);
    // a thing lying about, likewise
    let kept = { even: 0, short: 0, rich: 0 };
    for (let seed = 1; seed <= 600; seed++) {
      if (looseKept(I('nd_baked_beans'), seed, 0.27)) kept.even++;
      if (looseKept(I('nd_baked_beans'), seed, 0.27, short)) kept.short++;
      if (looseKept(I('nd_baked_beans'), seed, 0.27, rich)) kept.rich++;
    }
    expect(kept.short).toBeGreaterThan(kept.even);
    expect(kept.rich).toBeLessThan(kept.even);
  });

  it('the plan\'s supplies: none now and then for one who has plenty, two now and then for one who is short', () => {
    const tally = (k: number): number[] => {
      const n = [0, 0, 0];
      for (let seed = 1; seed <= 2000; seed++) n[supplyCount({ entry: 'fuel' }, { ...EVEN, petrol: k }, seed * 131)]++;
      return n;
    };
    expect(tally(1)).toEqual([0, 2000, 0]);
    const rich = tally(0.7);
    expect(rich[2]).toBe(0);
    expect(rich[0] / 2000).toBeGreaterThan(0.26);
    expect(rich[0] / 2000).toBeLessThan(0.34);
    const short = tally(1.4);
    expect(short[0]).toBe(0);
    expect(short[2] / 2000).toBeGreaterThan(0.36);
    expect(short[2] / 2000).toBeLessThan(0.44);
    // (what is no supply — a coffee machine, a blueprint — is as the plan has it)
    for (let seed = 1; seed <= 50; seed++) expect(supplyCount({ entry: 'coffee' }, { food: 0.7, water: 0.7, petrol: 0.7, tyres: 0.7, meds: 0.7 }, seed)).toBe(1);
  });

  it('all but out: the next place has it for certain, asked for once', () => {
    const st: RescueState = {};
    const fine = { tankFrac: 0.6, cansL: 0, food: 120, water: 150 };
    expect(rescueFinds(st, 40_000, fine)).toEqual([]);
    // the tank under fifteen in a hundred, no can aboard
    const low = rescueFinds(st, 40_000, { ...fine, tankFrac: 0.12 });
    expect(low.length).toBe(1);
    expect(low[0]).toMatchObject({ entry: 'need:fuel', thing: { tool: 'jerrycan' }, novelty: false });
    expect(low[0].s).toBeGreaterThan(40_000);
    expect(low[0].s).toBeLessThan(40_100);
    // (not again while it is out: the same want)
    expect(rescueFinds(st, 41_000, { ...fine, tankFrac: 0.08 })).toEqual([]);
    // filled up, then low again: asked for again
    expect(rescueFinds(st, 44_000, { ...fine, tankFrac: 0.5 })).toEqual([]);
    expect(rescueFinds(st, 90_000, { ...fine, tankFrac: 0.1 }).length).toBe(1);
    // a can of petrol aboard: it is not out
    expect(rescueFinds({}, 40_000, { ...fine, tankFrac: 0.05, cansL: 6 })).toEqual([]);
    // next to nothing to eat, to drink
    const hungry = rescueFinds({}, 40_000, { ...fine, food: 5, water: 3 });
    expect(hungry.map((f) => f.entry).sort()).toEqual(['need:food', 'need:food', 'need:water']);
  });
});
