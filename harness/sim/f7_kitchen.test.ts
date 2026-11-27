/**
 * F7 (docs/V3/plan/finish.md §八 3, 5): what a dish is worth, and what the recipe book shows —
 *   - a dish to eat feeds at least 1.6 times what went into it eaten raw (a drink is no dish to fill one), whichever
 *     way it is made; nothing eaten raw feeds more than its own portion does in a pot;
 *   - the recipe book of a new game has no dish in it: a dish not made yet is there once one has met everything it is
 *     made of — by its name, or one of its kind — and each new ingredient that comes into the hands brings the dishes
 *     it completes; a dish made is there whatever one has met; a book kept before the ingredients were noted shows
 *     every dish, as it always did.
 */
import { describe, expect, it } from 'vitest';
import '../../src/core/v3/nd/cards';
import.meta.glob('../../src/game/modcar/v3/*/index.ts', { eager: true });
import { itemDef } from '../../src/core/modcar/items';
import { cleanBook, meet, newBook, note, shown, tally, type BookData } from '../../src/core/v3/kitchen/book';
import { cook, potOf } from '../../src/core/v3/kitchen/cook';
import { DISH, DISHES, WAYS } from '../../src/core/v3/kitchen/dishes';
import { FOOD, FOODS } from '../../src/core/v3/kitchen/pantry';

/** what an ingredient feeds eaten as it is (0: it is not eaten raw) */
const rawFood = (id: string): number => itemDef(`ing_${id}`).eat?.food ?? 0;

describe('F7: a dish is worth making', () => {
  it('nothing eaten raw feeds more than its own portion does in a pot', () => {
    for (const f of FOODS) expect(rawFood(f.id), f.id).toBeLessThanOrEqual(f.food);
    // (what must be cooked — meat, fish, an egg — feeds half as much raw, and makes one ill)
    expect(rawFood('beef')).toBe(8);
    expect(itemDef('ing_beef').eat?.effect).toBe('sick1');
    expect(rawFood('potato')).toBe(0);
  });

  it('every way of making a dish to eat gains at least 1.6; every dish feeds at least 1.6 times what went into it eaten raw', () => {
    for (const [way, w] of Object.entries(WAYS)) if (way !== 'brew') expect(w.gain, way).toBeGreaterThanOrEqual(1.6);
    let least = Infinity;
    let leastOf = '';
    let n = 0;
    for (const d of DISHES) {
      if (d.way === 'brew') continue;
      const pot = potOf(d);
      const o = cook({ way: d.way, items: pot, done: 1 });
      expect(o.dish?.id, `${d.id}: ${pot.join('+')}`).toBe(d.id);
      const fed = o.food * o.servings;
      const raw = pot.reduce((a, id) => a + rawFood(id), 0);
      // (a serving's food is a whole number: half a point either way a serving)
      expect(fed, `${d.zh} (${pot.join('+')}): ${fed} against ${raw} raw`).toBeGreaterThanOrEqual(1.6 * raw - 0.5 * o.servings);
      if (raw > 0 && fed / raw < least) {
        least = fed / raw;
        leastOf = `${d.zh} ${fed}/${raw}`;
      }
      n++;
    }
    console.info(`[F7 kitchen] ${n} dishes to eat: the least any feeds against its ingredients eaten raw is ${least.toFixed(2)}× (${leastOf}); a tin of beans feeds ${itemDef('nd_baked_beans').eat?.food}, eggs and tomatoes fried ${cook({ way: 'fry', items: ['tomato', 'egg'], done: 1 }).food}, a potato and beef stew ${cook({ way: 'boil', items: ['potato', 'beef', 'onion'], done: 1 }).food}`);
    expect(least).toBeGreaterThanOrEqual(1.55);
    // cut, seasoned and done just right: a quarter more again
    const plain = cook({ way: 'fry', items: ['tomato', 'egg'], done: 1 });
    const perfect = cook({ way: 'fry', items: ['tomato', 'egg'], done: 1, cut: 1, seasoned: true });
    expect(perfect.perfect).toBe(true);
    expect(perfect.food).toBeGreaterThan(plain.food * 1.2);
  });
});

describe('F7: the recipe book shows what one could make of what one has met', () => {
  it('a new game\'s book has no dish in it; each ingredient met brings the dishes it completes', () => {
    const book = newBook();
    expect(book.seen).toEqual([]);
    expect(DISHES.filter((d) => shown(book, d)).length).toBe(0);
    // an egg alone: the dishes of an egg and nothing else
    const egg = meet(book, 'egg');
    expect(egg.length).toBeGreaterThan(0);
    for (const d of egg) expect(d.need.every((t) => t === 'egg' || (t.startsWith('@') && FOOD.egg.tags.includes(t.slice(1)))), d.id).toBe(true);
    // met again: nothing new
    expect(meet(book, 'egg')).toEqual([]);
    // a tomato: its own dishes, and the ones of the two together
    const tomato = meet(book, 'tomato');
    expect(tomato.some((d) => d.need.includes('tomato') && d.need.some((t) => t === 'egg' || t === '@egg'))).toBe(true);
    const now = DISHES.filter((d) => shown(book, d));
    expect(now.length).toBe(egg.length + tomato.length);
    // (every one of them could be made of the two)
    for (const d of now) expect(d.need.every((t) => (t.startsWith('@') ? ['egg', 'tomato'].some((id) => FOOD[id].tags.includes(t.slice(1))) : t === 'egg' || t === 'tomato')), d.id).toBe(true);
    // what is no ingredient of the pantry's is not noted
    expect(meet(book, 'nd_baked_beans')).toEqual([]);
    expect(book.seen).toEqual(['egg', 'tomato']);
    // the whole pantry met: every dish
    for (const f of FOODS) meet(book, f.id);
    expect(DISHES.every((d) => shown(book, d))).toBe(true);
  });

  it('a dish made is in the book whatever one has met; the count of dishes is of all there are', () => {
    const book = newBook();
    const d = DISHES.find((x) => x.way === 'fry')!;
    expect(shown(book, d)).toBe(false);
    note(book, d.way, potOf(d), cook({ way: d.way, items: potOf(d), done: 1 }));
    expect(shown(book, d)).toBe(true);
    expect(tally(book).total).toBe(DISHES.length);
    expect(tally(book).made).toBe(1);
  });

  it('a book kept before the ingredients were noted shows every dish, as it did; one kept since keeps what was met', () => {
    const old = cleanBook({ made: {}, fails: [] });
    expect(old.seen).toBeUndefined();
    expect(DISHES.every((d) => shown(old, d))).toBe(true);
    expect(meet(old, 'egg')).toEqual([]);
    const kept = cleanBook({ made: {}, fails: [], seen: ['egg', 'egg', 'no_such_food', 7, 'rice'] } as unknown as BookData);
    expect(kept.seen).toEqual(['egg', 'rice']);
    expect(DISHES.some((d) => !shown(kept, d))).toBe(true);
    // (no book at all — a new game: an empty one, nothing met)
    expect(cleanBook(null).seen).toEqual([]);
    expect(DISH).toBeDefined();
  });
});

describe('F7: a fish off the rod in the pot', () => {
  it('each is the kitchen\'s fish of its rarity: a common one the brook fish, an uncommon one the trout, a rare one the salmon, an epic one the tuna; a crayfish the shrimp', async () => {
    const { FISH } = await import('../../src/core/v3/fishing/lite/fish');
    const { portionOfItem } = await import('../../src/core/v3/kitchen/standins');
    const want = ['brookfish', 'trout', 'salmon', 'tuna', 'tuna', 'tuna'];
    let n = 0;
    for (const f of FISH) {
      const p = portionOfItem(`fish_${f.id}`);
      expect(p, f.id).not.toBeNull();
      if (f.family === 'frog' || f.family === 'turtle') expect(p!.id, f.id).toBe(`fish_${f.id}`);
      else if (f.family === 'crayfish') expect(p!.id, f.id).toBe('shrimp');
      else {
        expect(p!.id, f.id).toBe(want[f.tier]);
        n++;
      }
    }
    expect(n).toBeGreaterThan(90);
    // so a better fish makes a better dish: the same pan, a lemon and butter beside it
    const common = FISH.find((f) => f.tier === 0 && f.family !== 'crayfish')!;
    const rare = FISH.find((f) => f.tier === 2 && f.family !== 'frog' && f.family !== 'turtle' && f.family !== 'crayfish')!;
    const id = (f: { id: string }): string => portionOfItem(`fish_${f.id}`)!.id;
    const plain = cook({ way: 'fry', items: [id(common), 'butter', 'lemon'], done: 1 });
    const fine = cook({ way: 'fry', items: [id(rare), 'butter', 'lemon'], done: 1 });
    expect(fine.dish?.id).toBe('salmon_steak');
    expect(fine.stars).toBe(4);
    expect(fine.stars).toBeGreaterThan(plain.stars);
    // any of them is "any fish" still
    expect(cook({ way: 'boil', items: [id(common)], done: 1 }).dish?.id).toBe('fish_soup');
  });
});
