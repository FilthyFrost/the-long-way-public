/**
 * The rules of cooking (src/core/v3/cooking): the table of ingredients, the recipes, and what comes out of a
 * pot. Every pot gives a dish; every recipe can be cooked from things that exist and is not hidden behind
 * another; the numbers stay within what the body's rules can bear.
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/math/rng';
import { ingredient, ingredients } from '../../src/core/v3/cooking/ingredients';
import { RECIPES, recipe } from '../../src/core/v3/cooking/recipes';
import { cook, recipeOf, seasonScore, servingsOf } from '../../src/core/v3/cooking/rules';
import { FOOD_CAP, FREE_STARS, METHODS, type IngClass, type Method, type PotItem, type Recipe, type Slot } from '../../src/core/v3/cooking/types';
import { FORAGE_KINDS } from '../../src/core/v3/forage/kinds';

const ALL = ingredients();
const METHOD_IDS = Object.keys(METHODS) as Method[];

/** the portions that could fill a need */
function fillers(s: Slot): string[] {
  // (fresh things before packed ones: a recipe is meant for what one picks and catches)
  const fit = ALL.filter((x) => (s.item !== undefined ? x.item === s.item : s.tag !== undefined ? x.tags.includes(s.tag) : s.cls!.includes(x.cls)));
  const out = [...fit.filter((x) => !x.processed), ...fit.filter((x) => x.processed)].map((x) => x.item);
  if (!out.length) throw new Error(`nothing fills ${JSON.stringify(s)}`);
  return out;
}

/**
 * The smallest pot that is a recipe: one portion for each unit of its needs. A need that names a class or a
 * tag can be filled by several things, and some of them make the pot another, more particular dish (chestnuts
 * and honey are a chestnut cake, not honey nuts): the fillers are tried until the pot is this recipe.
 */
function potOf(r: Recipe): PotItem[] {
  const choices = r.need.map((s) => fillers(s).slice(0, 8));
  const pick = new Array<number>(r.need.length).fill(0);
  const build = (): PotItem[] => {
    const pot: PotItem[] = [];
    r.need.forEach((s, i) => {
      for (let k = 0; k < s.n; k++) pot.push({ item: choices[i][pick[i]], q: 2 });
    });
    return pot;
  };
  for (let tries = 0; tries < 4096; tries++) {
    const pot = build();
    if (recipeOf(r.method, pot)?.id === r.id) return pot;
    // the next combination
    let i = 0;
    while (i < pick.length && ++pick[i] >= choices[i].length) pick[i++] = 0;
    if (i === pick.length) break;
  }
  pick.fill(0);
  return build();
}

const GOOD = { heat: 0.9, knife: 0.9, season: 0.9 };

describe('ingredients', () => {
  it('every edible kind of forage is one, and the packed foods; none twice; numbers in range', () => {
    expect(new Set(ALL.map((i) => i.item)).size).toBe(ALL.length);
    for (const k of FORAGE_KINDS) {
      if (k.cat === 'resource' && k.id !== 'salt' && k.id !== 'honeycomb') expect(ingredient(k.id), k.id).toBeNull();
      else expect(ingredient(k.id), k.id).not.toBeNull();
    }
    expect(ingredient('food_fish_can')!.tags).toContain('fish');
    expect(ingredient('spanner')).toBeNull();
    for (const i of ALL) {
      expect(i.food).toBeGreaterThanOrEqual(0);
      expect(i.food).toBeLessThanOrEqual(80);
      for (const t of i.taste) {
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(3);
      }
    }
    expect(ingredient('death_cap')!.sick).toBe(2);
    expect(ingredient('potato')!.raw).toBe(false);
  });
});

describe('recipes', () => {
  it('have ids of their own, needs that things exist for, and pots of five portions at most', () => {
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
    // the catalogue's 150, as many of each class as it says
    expect(RECIPES.length).toBe(150);
    const per: Record<string, number> = {};
    for (const r of RECIPES) per[r.cls] = (per[r.cls] ?? 0) + 1;
    expect(per).toEqual({ soup: 14, stew: 16, stirfry: 16, roast: 16, fry: 12, steam: 10, rice: 14, salad: 10, preserve: 12, sweet: 10, drink: 12, camp: 8 });
    for (const r of RECIPES) {
      const n = r.need.reduce((a, s) => a + s.n, 0);
      expect(n, r.id).toBeGreaterThanOrEqual(1);
      expect(n, r.id).toBeLessThanOrEqual(5);
      expect(() => potOf(r), r.id).not.toThrow();
      expect(r.buffS).toBeGreaterThanOrEqual(300);
      expect(r.buffS).toBeLessThanOrEqual(900);
      expect(recipe(r.id)).toBe(r);
    }
  });

  it('each is found by cooking its own needs: none is hidden behind a more particular one', () => {
    for (const r of RECIPES) {
      const pot = potOf(r);
      expect(recipeOf(r.method, pot)?.id, r.id).toBe(r.id);
    }
  });

  it('each makes a dish worth making: more than its portions eaten as they are, within what a serving may give', () => {
    for (const r of RECIPES) {
      const pot = potOf(r);
      const d = cook(r.method, pot, GOOD, 0);
      expect(d.recipe).toBe(r.id);
      expect(d.odd).toBe(false);
      expect(d.buff).toBe(r.buff);
      expect(d.stars, r.id).toBeGreaterThanOrEqual(3);
      expect(d.food, r.id).toBeLessThanOrEqual(FOOD_CAP);
      if (r.cls === 'drink') {
        expect(d.water, r.id).toBeGreaterThanOrEqual(28);
        expect(d.food, r.id).toBeLessThanOrEqual(22);
      } else {
        const raw = pot.reduce((a, p) => a + ingredient(p.item)!.food, 0);
        expect(d.food * d.servings, r.id).toBeGreaterThan(raw);
        expect(d.food, r.id).toBeGreaterThanOrEqual(14);
      }
      expect(d.buffS).toBeGreaterThan(200);
      expect(d.buffS).toBeLessThan(1300);
    }
  });

  it('a signature dish for most of the first twelve regions', () => {
    const regions = new Set(RECIPES.map((r) => r.region).filter(Boolean));
    for (const id of ['plains', 'forest', 'lakes', 'maple', 'desert', 'alpine', 'terraces', 'bamboo_sea', 'karst_peaks', 'flower_fields', 'wetland']) expect(regions.has(id), id).toBe(true);
  });
});

describe('what comes out of a pot', () => {
  it('always a dish: ten thousand pots of anything, any way, give something to eat and never a wrong number', () => {
    const rng = new Rng(20261119);
    const names = new Set<string>();
    let odd = 0;
    let named = 0;
    for (let n = 0; n < 10000; n++) {
      const method = METHOD_IDS[rng.int(METHOD_IDS.length)];
      const size = 1 + rng.int(5);
      const pot: PotItem[] = [];
      for (let k = 0; k < size; k++) pot.push({ item: ALL[rng.int(ALL.length)].item, q: 1 + rng.int(5), fresh: rng.int(3) as 0 | 1 | 2 });
      const steps = { heat: rng.next() };
      const d = cook(method, pot, steps, rng.int(20));
      expect(d.name.zh.length).toBeGreaterThan(0);
      expect(d.servings).toBe(servingsOf(size));
      expect(Number.isFinite(d.food) && d.food >= 0 && d.food <= FOOD_CAP).toBe(true);
      expect(Number.isFinite(d.water) && d.water >= 0 && d.water <= 60).toBe(true);
      expect(d.stars >= 1 && d.stars <= 5).toBe(true);
      if (!d.recipe) expect(d.stars).toBeLessThanOrEqual(FREE_STARS);
      if (d.odd) {
        odd++;
        expect(d.buff).toBeNull();
      }
      if (d.recipe) named++;
      names.add(d.name.zh);
      // the same pot the same way is the same dish
      expect(cook(method, pot, steps, 0).name).toEqual(d.name);
    }
    // random pots are mostly plain dishes, some odd, a few recipes by luck; and many different dishes come out
    expect(odd / 10000).toBeGreaterThan(0.15);
    expect(odd / 10000).toBeLessThan(0.75);
    expect(named).toBeGreaterThan(20);
    expect(names.size).toBeGreaterThan(60);
  });

  it('cooking forage is worth about two to three times eating it raw', () => {
    const pots: [Method, string[]][] = [
      ['soup', ['porcini', 'porcini', 'wild_scallion', 'wild_garlic']],
      ['stew', ['chanterelle', 'oyster_mushroom', 'potato']],
      ['roast', ['potato', 'potato']],
      ['mix', ['dandelion', 'watercress', 'purslane']],
      ['stirfry', ['fiddlehead', 'fiddlehead']],
    ];
    for (const [method, ids] of pots) {
      const pot = ids.map((item) => ({ item, q: 2 }));
      const raw = ids.reduce((a, id) => a + ingredient(id)!.food, 0);
      const d = cook(method, pot, GOOD, 0);
      const ratio = (d.food * d.servings) / raw;
      expect(ratio, `${method} ${ids.join('+')}`).toBeGreaterThan(1.7);
      expect(ratio, `${method} ${ids.join('+')}`).toBeLessThan(4.2);
    }
    // a tin gains little: it was cooked already
    const hash = cook('stew', [{ item: 'food_fish_can' }, { item: 'potato' }], GOOD, 0);
    expect(hash.recipe).toBe('tin_hash');
    expect(hash.food).toBeLessThanOrEqual(FOOD_CAP);
    expect(hash.food).toBeGreaterThan(75);
  });

  it('a pot nobody can name is still supper, worth less and with no buff', () => {
    const d = cook('soup', [{ item: 'wild_berry' }, { item: 'food_fish_can' }, { item: 'honeycomb' }], { heat: 0.8 });
    expect(d.odd).toBe(true);
    expect(d.name.zh).toBe('说不清的一锅');
    expect(d.buff).toBeNull();
    expect(d.food).toBeGreaterThan(20);
    expect(cook('brew', [{ item: 'potato' }], { heat: 0.8 }).odd).toBe(true);
    expect(cook('soup', [{ item: 'spanner' }], { heat: 0.8 }).odd).toBe(true);
    expect(cook('soup', [], { heat: 0.8 }).food).toBe(0);
  });

  it('carries what is toxic through any cooking, and what is not safe raw needs real heat', () => {
    expect(cook('soup', [{ item: 'porcini' }, { item: 'death_cap' }], GOOD).sick).toBe(2);
    expect(cook('roast', [{ item: 'fly_agaric' }, { item: 'fly_agaric' }], GOOD).sick).toBe(1);
    expect(cook('mix', [{ item: 'potato' }, { item: 'dandelion' }], GOOD).sick).toBe(1);
    expect(cook('roast', [{ item: 'potato' }, { item: 'potato' }], GOOD).sick).toBe(0);
    expect(cook('roast', [{ item: 'potato' }, { item: 'potato' }], { heat: 0.1 }).sick).toBe(1);
    expect(cook('soup', [{ item: 'porcini' }, { item: 'porcini' }], GOOD).sick).toBe(0);
  });

  it('stars: good things well cooked and often are five, poor things badly cooked one; stale portions cost; a plain pot is never above three', () => {
    const r = recipe('mushroom_soup');
    const best = cook('soup', [{ item: 'porcini', q: 5 }, { item: 'chanterelle', q: 5 }], { heat: 1, knife: 1, season: 1 }, 20);
    expect(best.stars).toBe(5);
    const worst = cook('soup', [{ item: 'porcini', q: 1 }, { item: 'chanterelle', q: 1 }], { heat: 0, knife: 0, season: 0 }, 0);
    expect(worst.stars).toBe(1);
    const fresh = cook('soup', [{ item: 'porcini', q: 3 }, { item: 'chanterelle', q: 3 }], GOOD, 3);
    const stale = cook('soup', [{ item: 'porcini', q: 3, fresh: 2 }, { item: 'chanterelle', q: 3, fresh: 2 }], GOOD, 3);
    expect(stale.stars).toBeLessThan(fresh.stars);
    expect(best.food).toBeGreaterThan(worst.food);
    expect(best.buffS).toBeGreaterThan(worst.buffS);
    expect(cook('soup', [{ item: 'dandelion', q: 5 }], { heat: 1 }).stars).toBeLessThanOrEqual(FREE_STARS);
    expect(seasonScore(r, [{ item: 'porcini' }, { item: 'chanterelle' }], [2, 0, 0, 0, 1])).toBeGreaterThan(seasonScore(r, [{ item: 'porcini' }, { item: 'chanterelle' }], [0, 3, 3, 0, 0]));
  });

  it('plain dishes are named for what is mostly in them, and a hot pot warms', () => {
    expect(cook('soup', [{ item: 'dandelion' }, { item: 'nettle' }], GOOD).recipe).toBeNull();
    expect(cook('soup', [{ item: 'dandelion' }, { item: 'watercress' }], GOOD).name.zh).toBe('野菜汤');
    expect(cook('roast', [{ item: 'dandelion' }, { item: 'nettle' }], GOOD).name.zh).toBe('烤蔬菜');
    // (a fish alone on the fire is a recipe of its own now)
    expect(cook('roast', [{ item: 'food_fish_can' }], GOOD).recipe).toBe('fish_on_stick');
    expect(cook('brew', [{ item: 'thyme' }], GOOD).name.zh).toBe('香草茶');
    const hot = cook('stirfry', [{ item: 'dandelion' }, { item: 'chili' }], GOOD);
    expect(hot.buff).toBe('warm');
    const classes = new Set<IngClass>(ALL.map((i) => i.cls));
    expect(classes.size).toBeGreaterThanOrEqual(11);
  });
});
