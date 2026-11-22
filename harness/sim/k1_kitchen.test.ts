// The kitchen, step 1 (docs/V3/plan/cooking.md): sixty ingredients and six seasonings, the dishes in three layers, and
// what a pot comes to — the most particular dish it makes, or a failed one.
import { describe, expect, it } from 'vitest';
import { cook, dishOf, dishesWith, potOf } from '../../src/core/v3/kitchen/cook';
import { DISHES, WAYS, type Way } from '../../src/core/v3/kitchen/dishes';
import { FOOD, FOODS, SEASONINGS } from '../../src/core/v3/kitchen/pantry';

const rng = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const pick = <T>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length)];
const of = (tag: string): string[] => FOODS.filter((f) => f.tags.includes(tag)).map((f) => f.id);

describe('the kitchen: its pantry and its dishes', () => {
  it('has sixty ingredients of one to five stars, each its own, and six seasonings', () => {
    expect(FOODS.length).toBe(60);
    expect(new Set(FOODS.map((f) => f.id)).size).toBe(60);
    for (const f of FOODS) {
      expect(f.star, f.id).toBeGreaterThanOrEqual(1);
      expect(f.star, f.id).toBeLessThanOrEqual(5);
      expect(f.food, f.id).toBeGreaterThan(0);
      expect(f.from.length, f.id).toBeGreaterThan(0);
    }
    expect(SEASONINGS.length).toBe(6);
    for (const s of [1, 2, 3, 4, 5]) expect(FOODS.filter((f) => f.star === s).length, `${s} stars`).toBeGreaterThanOrEqual(2);
  });

  it('writes every dish of things that are in the pantry, in its layer\'s stars', () => {
    expect(new Set(DISHES.map((d) => d.id)).size).toBe(DISHES.length);
    expect(DISHES.length).toBeGreaterThanOrEqual(120);
    for (const d of DISHES) {
      expect(d.need.length, d.id).toBeGreaterThanOrEqual(1);
      expect(d.need.length, d.id).toBeLessThanOrEqual(5);
      for (const t of [...d.need, ...d.extra]) expect(t.startsWith('@') ? of(t.slice(1)).length > 0 : !!FOOD[t], `${d.id}: ${t}`).toBe(true);
      if (d.layer === 'home') expect(d.stars, d.id).toBeLessThanOrEqual(2);
      if (d.layer === 'named') expect(d.stars >= 2 && d.stars <= 4, d.id).toBe(true);
      if (d.layer === 'feast') expect(d.stars, d.id).toBeGreaterThanOrEqual(4);
      // (what it names says how far one has travelled: a dish of a rare thing is no common dish)
      const rare = Math.max(0, ...d.need.filter((t) => !t.startsWith('@')).map((t) => FOOD[t].star));
      expect(d.stars, `${d.id}: names a ${rare}-star thing`).toBeGreaterThanOrEqual(rare - 1);
      if (rare >= 4) expect(d.stars, d.id).toBeGreaterThanOrEqual(4);
    }
    // (the first batch of cookware — a pan, a pot, a bowl — makes most of them)
    expect(DISHES.filter((d) => ['pan', 'pot', 'bowl'].includes(WAYS[d.way].cookware)).length).toBeGreaterThanOrEqual(80);
  });

  it('can make every dish: its own pot comes to it and to no other', () => {
    for (const d of DISHES) {
      const pot = potOf(d);
      expect(dishOf(d.way, pot)?.id, `${d.id}: ${pot.join(' ')}`).toBe(d.id);
      const out = cook({ way: d.way, items: pot });
      expect(out.fail, d.id).toBe(null);
      expect(out.stars, d.id).toBe(d.stars);
      expect(out.food, d.id).toBeGreaterThan(0);
    }
  });

  it('has every ingredient in a dish by its name, and in four dishes or more', () => {
    for (const f of FOODS) {
      const w = dishesWith(f.id);
      expect(w.named.length, `${f.zh}: by name`).toBeGreaterThanOrEqual(1);
      expect(w.named.length + w.kind.length, f.zh).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('the kitchen: what a pot comes to', () => {
  it('takes the most particular dish, and more of what it names', () => {
    expect(dishOf('fry', ['tomato', 'egg'])?.id).toBe('tomato_egg');
    expect(dishOf('fry', ['tomato', 'tomato', 'egg'])?.id).toBe('tomato_egg');
    expect(dishOf('fry', ['cabbage', 'egg'])?.id).toBe('veg_egg');
    expect(dishOf('fry', ['cabbage'])?.id).toBe('stir_veg');
    expect(dishOf('boil', ['tomato', 'egg'])?.id).toBe('egg_drop');
    expect(dishOf('boil', ['potato', 'beef', 'carrot'])?.id).toBe('potato_beef');
    expect(dishOf('boil', ['rice', 'shrimp', 'clam', 'tomato', 'chili'])?.id).toBe('paella');
  });

  it('fails what is no dish, what is burnt and what is not cooked through', () => {
    expect(cook({ way: 'fry', items: ['watermelon', 'tuna'] }).fail).toBe('mess');
    expect(cook({ way: 'boil', items: ['honey', 'beef', 'lemon'] }).fail).toBe('mess');
    expect(cook({ way: 'fry', items: ['tomato', 'egg'], done: 1.6 }).fail).toBe('burnt');
    expect(cook({ way: 'fry', items: ['beef'], done: 0.4 }).fail).toBe('raw');
    expect(cook({ way: 'fry', items: ['cabbage'], done: 0.4 }).fail).toBe(null);
    expect(cook({ way: 'mix', items: ['pork', 'lettuce'] }).fail).toBe('raw');
    expect(cook({ way: 'mix', items: ['salmon', 'lemon'] }).dish?.id).toBe('salmon_sashimi');
    expect(cook({ way: 'fry', items: [] }).fail).toBe('empty');
    expect(cook({ way: 'fry', items: ['a_stone'] }).fail).toBe('mess');
    for (const f of ['mess', 'burnt', 'raw'] as const) expect(cook({ way: 'fry', items: ['watermelon', 'tuna'], done: f === 'burnt' ? 2 : f === 'raw' ? 0.1 : 1 }).food).toBeLessThan(8);
  });

  it('calls perfect a pot cooked just right, cut and seasoned, and feeds a quarter more of it', () => {
    const plain = cook({ way: 'fry', items: ['tomato', 'egg'] });
    const fine = cook({ way: 'fry', items: ['tomato', 'egg'], done: 1, cut: 1, seasoned: true });
    expect(plain.perfect).toBe(false);
    expect(fine.perfect).toBe(true);
    expect(fine.stars).toBe(plain.stars);
    expect(fine.food / plain.food).toBeGreaterThan(1.15);
    expect(cook({ way: 'fry', items: ['tomato', 'egg'], done: 1.3, cut: 1, seasoned: true }).perfect).toBe(false);
  });

  it('lets what is none of the sixty stand in for its kind, never for a name', () => {
    const cls = (id: string): string | null => (id === 'bolete_wild' ? 'mushroom' : id === 'perch' ? 'fish' : null);
    expect(cook({ way: 'boil', items: ['bolete_wild'] }, cls).dish?.id).toBe('mushroom_soup');
    expect(cook({ way: 'boil', items: ['perch', 'tofu'] }, cls).dish?.id).toBe('fish_tofu');
    expect(cook({ way: 'fry', items: ['perch'], done: 0.3 }, cls).fail).toBe('raw');
  });

  it('makes a dish of most sensible pots and of few senseless ones', () => {
    const r = rng(20261122);
    const veg = [...of('veg'), ...of('green')];
    const protein = [...of('meat'), ...of('seafood'), ...of('egg'), 'tofu'];
    const shapes: (() => string[])[] = [
      () => [pick(r, veg)],
      () => [pick(r, veg), pick(r, veg)],
      () => [pick(r, veg), pick(r, of('aromatic'))],
      () => [pick(r, protein)],
      () => [pick(r, protein), pick(r, of('aromatic'))],
      () => [pick(r, protein), pick(r, veg)],
      () => [pick(r, protein), pick(r, veg), pick(r, of('aromatic'))],
      () => [pick(r, of('mushroom'))],
      () => [pick(r, of('mushroom')), pick(r, of('meat'))],
    ];
    let ok = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) if (!cook({ way: r() < 0.5 ? 'fry' : 'boil', items: pick(r, shapes)() }).fail) ok++;
    expect(ok / N).toBeGreaterThan(0.6);
    let odd = 0;
    const ways = Object.keys(WAYS) as Way[];
    for (let i = 0; i < N; i++) {
      const n = 3 + Math.floor(r() * 3);
      const items = Array.from({ length: n }, () => pick(r, FOODS).id);
      if (!cook({ way: pick(r, ways), items }).fail) odd++;
    }
    expect(odd / N).toBeLessThan(0.2);
  });
});
