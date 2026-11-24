// The ND food, drink and medicine (docs/ND/PLAN.md ND2) at Nomad Drive's numbers in ours: its food at four fifths
// (its crisps' 25 are our prawn crackers' 20), its water as it is (100 a litre in both); milk feeds; a mushroom upsets
// the stomach and pills or a first-aid box settle it; a carton of milk pours out but takes nothing.
import { describe, expect, it } from 'vitest';
import { itemCatalogueProblems, itemDef, newItem } from '../../src/core/modcar/items';
import { cure, drink, eat, has, newVitals, MILK_FOOD, MILK_WATER } from '../../src/core/modcar/vitals';
import { registerNdItems } from '../../src/core/v3/nd/items';
// (the foods both versions had are the kitchen's: its kinds into the catalogue — docs/V3/plan/growth.md §三)
import '../../src/game/modcar/v3/kitchen/index';
import { flowWhy, foundFill, itemVessel, ND_BUCKET } from '../../src/core/v3/nd/water';

registerNdItems();

describe('ND food', () => {
  it('is in the catalogue at four fifths of Nomad Drive\'s food', () => {
    expect(itemCatalogueProblems()).toEqual([]);
    const food = (id: string) => itemDef(id).eat?.food;
    // (Nomad Drive: baked beans, tuna, cereal 25; soup, peanut butter, mushrooms 20; chocolate 15; banana 8; orange 5)
    expect(food('nd_baked_beans')).toBe(20);
    expect(food('nd_tuna')).toBe(20);
    expect(food('nd_cereal')).toBe(20);
    expect(food('nd_tomato_soup')).toBe(16);
    expect(food('nd_peanut_butter')).toBe(16);
    expect(food('nd_mushroom')).toBe(16);
    // (the three chocolates were one: docs/V3/plan/growth.md §三)
    expect(food('nd_chocolate_1')).toBe(12);
    expect(food('ing_banana')).toBe(6);
    expect(food('ing_orange')).toBe(4);
    // (and their water as it is: an orange 5, a tomato 3, a watermelon 25)
    expect(itemDef('ing_orange').eat?.water).toBe(5);
    expect(itemDef('ing_tomato').eat?.water).toBe(3);
    expect(itemDef('ing_watermelon').eat?.water).toBe(25);
    expect(itemDef('nd_mushroom').eat?.effect).toBe('sick2');
  });

  it('milk feeds 24 and quenches 10 a litre (Nomad Drive\'s 30 and 10)', () => {
    expect(MILK_FOOD).toBe(24);
    expect(MILK_WATER).toBe(10);
    const v = newVitals();
    drink(v, 'milk', 0.5);
    const g = v.gains[v.gains.length - 1];
    expect(g.food).toBeCloseTo(12, 6);
    expect(g.water).toBeCloseTo(5, 6);
  });

  it('a mushroom upsets the stomach; pills settle it', () => {
    const v = newVitals();
    eat(v, 16, 0, 'sick2');
    expect(has(v, 'sick2')).toBe(true);
    cure(v);
    expect(has(v, 'sick2')).toBe(false);
    expect(itemDef('nd_pills').heal).toEqual({ hp: 15, cure: true });
    expect(itemDef('nd_first_aid').heal).toEqual({ hp: 50, cure: true });
  });

  it('a carton of milk is found a quarter to wholly full of milk, pours out, takes nothing', () => {
    const m = newItem('ing_milk');
    m.litres = 0;
    expect(foundFill(m, 3)).toBe(true);
    const v = itemVessel(m)!;
    expect(v.liquid).toBe('milk');
    expect(v.litres).toBeGreaterThanOrEqual(0.25 - 1e-9);
    const b = newItem(ND_BUCKET);
    b.litres = 0;
    b.state = { found: true };
    expect(flowWhy(v, itemVessel(b)!)).toBe('ok');
    expect(flowWhy(itemVessel(b)!, v)).toBe('noIn');
  });
});
