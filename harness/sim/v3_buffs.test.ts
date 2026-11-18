/**
 * The table of timed buffs (src/core/v3/cooking/buffs.ts): two meals and a drink at once, the same buff never
 * twice, time running out, and the save's round trip.
 */
import { describe, expect, it } from 'vitest';
import { BUFFS, BUFF_WORTH, Buffs } from '../../src/core/v3/cooking/buffs';
import { RECIPES } from '../../src/core/v3/cooking/recipes';

describe('timed buffs', () => {
  it('every buff a recipe leaves is in the table, with a name and a line in both languages', () => {
    for (const r of RECIPES) expect(BUFFS[r.buff], r.id).toBeDefined();
    for (const b of Object.values(BUFFS)) {
      expect(b.name.zh.length).toBeGreaterThan(0);
      expect(b.name.en.length).toBeGreaterThan(0);
      expect(b.blurb.zh.length).toBeGreaterThan(2);
    }
    expect(BUFF_WORTH.hearty).toBeLessThan(1);
    expect(BUFF_WORTH.vigor).toBeGreaterThan(1);
  });

  it('two meals and one drink at a time: a third meal pushes out the one with the least time left', () => {
    const b = new Buffs();
    expect(b.add('hearty', 600, 'meal')).toBeNull();
    expect(b.add('warm', 300, 'meal')).toBeNull();
    expect(b.add('steady', 400, 'drink')).toBeNull();
    expect(b.count).toBe(3);
    expect(b.add('keen', 500, 'meal')).toBe('warm');
    expect(b.strength('warm')).toBe(0);
    expect(b.strength('hearty')).toBe(1);
    expect(b.add('cool', 200, 'drink')).toBe('steady');
    expect(b.add('lucky', 60, 'other')).toBeNull();
    expect(b.count).toBe(4);
  });

  it('the same buff again takes the longer time and the greater strength, and pushes nothing out', () => {
    const b = new Buffs();
    b.add('vigor', 300, 'meal');
    b.add('sturdy', 300, 'meal');
    expect(b.add('vigor', 200, 'meal', 1.5)).toBeNull();
    expect(b.left('vigor')).toBe(300);
    expect(b.strength('vigor')).toBe(1.5);
    expect(b.add('vigor', 700, 'meal')).toBeNull();
    expect(b.left('vigor')).toBe(700);
    expect(b.count).toBe(2);
    expect(b.add('vigor', 0, 'meal')).toBeNull();
    expect(b.add('vigor', NaN, 'meal')).toBeNull();
  });

  it('time runs out', () => {
    const b = new Buffs();
    b.add('hearty', 10, 'meal');
    b.add('cool', 4, 'drink');
    expect(b.step(3)).toBe(0);
    expect(b.left('cool')).toBeCloseTo(1, 9);
    expect(b.step(2)).toBe(1);
    expect(b.strength('cool')).toBe(0);
    expect(b.at(0)).toBe('hearty');
    expect(b.step(0)).toBe(0);
    expect(b.step(100)).toBe(1);
    expect(b.count).toBe(0);
  });

  it('goes through a save whole and takes back nothing unsound', () => {
    const b = new Buffs();
    expect(b.snapshot()).toBeUndefined();
    b.add('hearty', 123.44, 'meal');
    b.add('steady', 50, 'drink', 1.2);
    const s = JSON.parse(JSON.stringify(b.snapshot()));
    const c = new Buffs();
    c.restore(s);
    expect(c.left('hearty')).toBeCloseTo(123.4, 5);
    expect(c.strength('steady')).toBe(1.2);
    c.restore([null as never, { id: 'nope' as never, left: 5, k: 1, slot: 'meal' }, { id: 'warm', left: -1, k: 1, slot: 'meal' }, { id: 'cool', left: 9, k: NaN, slot: 'x' as never }]);
    expect(c.count).toBe(1);
    expect(c.strength('cool')).toBe(1);
    c.restore(undefined);
    expect(c.count).toBe(0);
  });
});

import { canStack, itemCatalogueProblems, itemDef, newItem, registerItemCat, registerItems } from '../../src/core/modcar/items';
import { forageItemCats, forageItemRows } from '../../src/core/v3/forage/items';
import { cookingItemCats, cookingItemRows, cookwareCosts, cookwareItemId, dishItem, dishItemId } from '../../src/core/v3/cooking/items';
import { cook } from '../../src/core/v3/cooking/rules';
import { METHODS } from '../../src/core/v3/cooking/types';

describe('cooking\'s things as items', () => {
  it('register: twelve kinds of dish, the cookware every way of cooking names, a jar and a cool box that hold things', () => {
    for (const c of forageItemCats()) registerItemCat(c);
    registerItems(forageItemRows());
    for (const c of cookingItemCats()) registerItemCat(c);
    registerItems(cookingItemRows());
    expect(itemCatalogueProblems()).toEqual([]);
    for (const cls of ['soup', 'stew', 'stirfry', 'roast', 'fry', 'steam', 'rice', 'salad', 'preserve', 'sweet', 'drink', 'camp'] as const) expect(itemDef(dishItemId(cls)).eat).toBeDefined();
    const costs = cookwareCosts();
    for (const m of Object.values(METHODS)) for (const c of m.cookware) if (c !== 'oven') expect(costs[cookwareItemId(c)], c).toBeDefined();
    expect(itemDef('cook_cooler').holds!.decay).toBe(0.25);
    expect(itemDef('cook_jar').holds!.decay).toBe(0);
  });

  it('a dish is an item with what it gives on itself; two servings of the same dish stack, different dishes do not', () => {
    const d = cook('soup', [{ item: 'porcini' }, { item: 'chanterelle' }], { heat: 0.9, knife: 0.9, season: 0.9 });
    const one = dishItem(d);
    expect(one.item).toBe('dish_soup');
    expect(one.state.dish.r).toBe('mushroom_soup');
    expect(one.state.dish.food).toBe(d.food);
    expect(one.state.dish.buff).toBe('keen');
    const a = newItem(one.item, { q: one.q, state: one.state, t0: 0 });
    const b = newItem(one.item, { q: one.q, state: JSON.parse(JSON.stringify(one.state)), t0: 0 });
    expect(canStack(a, b, 0)).toBe(true);
    const other = dishItem(cook('soup', [{ item: 'dandelion' }, { item: 'watercress' }], { heat: 0.9 }));
    const c = newItem(other.item, { q: other.q, state: other.state, t0: 0 });
    expect(canStack(a, c, 0)).toBe(false);
    expect(other.state.dish.r).toBeUndefined();
  });
});
