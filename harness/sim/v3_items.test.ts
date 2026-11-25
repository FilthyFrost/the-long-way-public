/**
 * The item model's V3 additions in full (src/core/modcar/items.ts, docs/V3/nodes/N0-items.md): the open
 * catalogue and every rule a registration is held to; the pin on today's world (what the containers by the
 * road and the wrecks' boots hold for a seed is the same whatever is registered afterwards); stacks, things
 * that hold things and freshness, each with its rules and with properties over seeded random sequences of
 * everything a game does to things (no count is ever lost or made, a box takes exactly what it says it has
 * room for, freshness is a function of the time alone); what settles into what; reading a thing back from a
 * save whatever the save holds; the uids; and that what the prompt asks every frame allocates nothing.
 *
 * The contract in brief is harness/sim/v3_items_smoke.test.ts; the save is harness/sim/v3_items_save.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/math/rng';
import {
  BASE_ITEMS,
  ITEMS,
  ITEM_CATS,
  MAX_COUNT,
  STACK_FRESH_TOL,
  accepts,
  canStack,
  cleanItem,
  countOf,
  forEachItem,
  freshNow,
  freshStage,
  hasItem,
  hasItemCat,
  hasTag,
  insideMass,
  itemCat,
  itemCatalogueProblems,
  itemCats,
  itemDef,
  itemMass,
  itemName,
  itemSig,
  itemsOf,
  mergeStacks,
  newItem,
  putInside,
  rebaseFresh,
  registerItemCat,
  registerItems,
  reserveItemUids,
  roomInside,
  salvageOf,
  setFreshRate,
  settleItem,
  splitStack,
  stackMax,
  stampFresh,
  takeInside,
  turned,
  type ItemCat,
  type ItemInstance,
  type ItemRow,
} from '../../src/core/modcar/items';
import { LOOT_TABLES, looseFound, rollContainer } from '../../src/core/modcar/loot';
import { rollWreck } from '../../src/core/modcar/wrecks';
import { ALLOCATES, HEAP_RUNS, heapGrowth } from './v3/heap';

const H = 3600;
const NINE = Object.keys(ITEM_CATS) as ItemCat[];

/** what must hold, asked thousands of times in the random sequences: put into words only when it does not */
function must(ok: boolean, why: () => string): void {
  if (!ok) throw new Error(why());
}

// ------------------------------------------------------------------ today's world, before anything is registered

const SEEDS = Array.from({ length: 50 }, (_, i) => (i * 2654435761) | 0);
const noUid = (v: unknown): string => JSON.stringify(v, (k, x: unknown) => (k === 'uid' ? undefined : x));

/** everything the old loot gives for fifty seeds: every kind of container near, far and very far down the road, what lies in plain sight, and what was left in a wreck of each size, stripped or not */
function world(): string[] {
  const out: string[] = [];
  for (const seed of SEEDS) {
    for (const kind of Object.keys(LOOT_TABLES) as (keyof typeof LOOT_TABLES)[]) {
      for (const [s, site] of [[0, 'house'], [8000, 'station'], [120_000, 'garage']] as const) out.push(`${kind} ${seed} ${s}: ${noUid(rollContainer(kind, seed, s, site))}`);
    }
    for (const old of ['food.can.beans', 'drink.soda', 'mat.plank', 'part.gear', 'tool.wrench']) out.push(`${old} ${seed}: ${noUid(looseFound(old, seed, 30_000, 'house'))}`);
    for (const type of [0, 1, 2, 3]) {
      for (const stripped of [false, true]) {
        const r = rollWreck(seed, type, stripped, 40_000 + 20_000 * type);
        out.push(`wreck ${type}${stripped ? ' stripped' : ''} ${seed}: ${r.items.join(',')} | ${noUid(r.tools)}`);
      }
    }
  }
  return out;
}

const BEFORE = world();
const BASE_COUNT = ITEMS.length;

// ------------------------------------------------------------------ what this file registers

const name = (en: string): { zh: string; en: string } => ({ zh: `试·${en}`, en });

registerItemCat({ id: 'tx', name: name('Trial') });
registerItems([
  // stacks to twelve, goes off in a day into mush, which goes off in its turn (and stays mush)
  { id: 'tx_berry', cat: 'tx', name: name('berry'), stars: 1, mass: 0.05, stack: 12, tags: ['forage', 'fruit'], perish: { hours: 24, into: 'tx_mush' }, salvage: { scrap: 1 } },
  { id: 'tx_mush', cat: 'tx', name: name('mush'), stars: 0, mass: 0.05, stack: 12, perish: { hours: 12 } },
  { id: 'tx_nut', cat: 'tx', name: name('nut'), stars: 1, mass: 0.01, stack: 20, tags: ['forage'] },
  { id: 'tx_jerky', cat: 'tx', name: name('jerky'), stars: 2, mass: 0.1, stack: 8, tags: ['meat'], salvage: { scrap: 2 } },
  // carries a state of its own
  { id: 'tx_page', cat: 'tx', name: name('page'), stars: 2, mass: 0.01, stack: 5 },
  // turns into a kind whose stacks are smaller: the catalogue says so, and nothing is lost when it happens
  { id: 'tx_fade', cat: 'tx', name: name('fade'), stars: 1, mass: 0.02, stack: 12, tags: ['forage'], perish: { hours: 10, into: 'tx_few' } },
  { id: 'tx_few', cat: 'tx', name: name('few'), stars: 0, mass: 0.02, stack: 5, tags: ['forage'] },
  // a drink that turns into another drink, with a smaller bottle
  { id: 'tx_milk', cat: 'tx', name: name('milk'), stars: 1, mass: 0.1, drink: { litres: 1, liquid: 'water', rate: 0.1 }, perish: { hours: 48, into: 'tx_sour' } },
  { id: 'tx_sour', cat: 'tx', name: name('sour milk'), stars: 0, mass: 0.1, drink: { litres: 0.5, liquid: 'water', rate: 0.1 } },
  // three boxes: by tag with a weight and a slower rate; by category and tag, any weight; anything at all, where nothing goes off
  { id: 'tx_basket', cat: 'tx', name: name('basket'), stars: 1, mass: 0.5, holds: { slots: 3, accepts: ['#forage'], maxKg: 1, decay: 0.5 } },
  { id: 'tx_sack', cat: 'tx', name: name('sack'), stars: 1, mass: 0.3, holds: { slots: 2, accepts: ['food', '#meat'] } },
  { id: 'tx_cool', cat: 'tx', name: name('cool box'), stars: 2, mass: 2, holds: { slots: 4, accepts: ['*'], maxKg: 5, decay: 0 } },
]);
// kinds registered INTO the nine old categories, of every grade and small enough for any roll: thirty foods,
// and five of each of the others
const INTO_OLD: ItemRow[] = [];
for (let i = 0; i < 30; i++) INTO_OLD.push({ id: `txo_food_${i}`, cat: 'food', name: name(`food ${i}`), stars: i % 6, mass: 0.1 });
for (const cat of NINE) if (cat !== 'food') for (let i = 0; i < 5; i++) INTO_OLD.push({ id: `txo_${cat}_${i}`, cat, name: name(`${cat} ${i}`), stars: i, mass: 0.2 });
registerItems(INTO_OLD);

const AFTER = world();

// ------------------------------------------------------------------ the catalogue

describe('items: the open catalogue', () => {
  it('keeps what was there: the nine categories first, the old kinds untouched and frozen as BASE_ITEMS', () => {
    expect(BASE_ITEMS.length).toBe(BASE_COUNT);
    expect(ITEMS.length).toBe(BASE_COUNT + 12 + INTO_OLD.length);
    expect(ITEMS.slice(0, BASE_COUNT)).toEqual([...BASE_ITEMS]);
    expect(Object.isFrozen(BASE_ITEMS)).toBe(true);
    expect(BASE_ITEMS.some((d) => d.id.startsWith('tx'))).toBe(false);
    expect(itemCats().slice(0, 9).map((c) => c.id)).toEqual(NINE);
    expect(itemCats().slice(0, 9).map((c) => c.order)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80]);
    expect(hasItemCat('tx')).toBe(true);
    expect(itemCat('tx').name.en).toBe('Trial');
    expect(() => itemCat('nope')).toThrow(/no item category nope/);
    expect(itemsOf('tx').map((d) => d.id)).toEqual(['tx_berry', 'tx_mush', 'tx_nut', 'tx_jerky', 'tx_page', 'tx_fade', 'tx_few', 'tx_milk', 'tx_sour', 'tx_basket', 'tx_sack', 'tx_cool']);
    // what the catalogue works out for a row that leaves it out
    expect(itemDef('tx_berry')).toMatchObject({ carry: 'small', model: 'tx_berry', paint: 0xd8c29a, paint2: 0xf4efe2, blurb: '' });
    expect(itemDef('tx_nut').salvage).toEqual({});
    expect(hasTag(itemDef('tx_berry'), 'fruit')).toBe(true);
    expect(hasTag(itemDef('tx_berry'), 'fru')).toBe(false);
    expect(hasTag(itemDef('tx_page'), 'fruit')).toBe(false);
  });

  it('a category: its id, its name, its place in the list', () => {
    const ids = (): string[] => itemCats().map((c) => c.id);
    const n = ids().length;
    for (const bad of ['', 'Tx', '1tx', 'tx-a', 'tx a', 'tx.a', '试验']) expect(() => registerItemCat({ id: bad, name: name('x') }), bad).toThrow(/an id is lower-case letters, digits and _/);
    expect(() => registerItemCat({ id: 7 as unknown as string, name: name('x') })).toThrow(/an id is/);
    expect(() => registerItemCat({ id: 'tx', name: name('again') })).toThrow(/registered already/);
    expect(() => registerItemCat({ id: 'food', name: name('again') })).toThrow(/registered already/);
    expect(() => registerItemCat({ id: 'tx_noname', name: { zh: '', en: 'x' } })).toThrow(/name in both languages/);
    expect(() => registerItemCat({ id: 'tx_noname', name: 'x' as unknown as { zh: string; en: string } })).toThrow(/name in both languages/);
    for (const order of [NaN, Infinity, '3' as unknown as number]) expect(() => registerItemCat({ id: 'tx_noorder', name: name('x'), order })).toThrow(/its order is a number/);
    // none of those is there
    expect(ids().length).toBe(n);
    expect(hasItemCat('tx_noname')).toBe(false);
    expect(hasItemCat('tx_noorder')).toBe(false);

    // an order of its own puts it among the nine; equal orders keep the order they were registered in;
    // without one it comes after everything that has one, in the order registered
    registerItemCat({ id: 'tx_late_a', name: name('late a') });
    registerItemCat({ id: 'tx_mid_b', name: name('mid b'), order: 35 });
    registerItemCat({ id: 'tx_first', name: name('first'), order: -1 });
    registerItemCat({ id: 'tx_mid_a', name: name('mid a'), order: 35 });
    registerItemCat({ id: 'tx_same_as_food', name: name('same'), order: 0 });
    registerItemCat({ id: 'tx_late_b', name: name('late b') });
    expect(ids()).toEqual(['tx_first', 'food', 'tx_same_as_food', 'drink', 'med', 'wear', 'tx_mid_b', 'tx_mid_a', 'pack', 'lamp', 'gear', 'junk', 'crate', 'tx', 'tx_late_a', 'tx_late_b']);
    // (a category with no kinds is a category all the same)
    expect(itemsOf('tx_first')).toEqual([]);
  });

  it('registers all the rows or none, and names every problem', () => {
    const n = ITEMS.length;
    const good: ItemRow = { id: 'tx_ok_1', cat: 'tx', name: name('ok'), stars: 0, mass: 0 };
    let said = '';
    try {
      registerItems([
        good,
        { id: 'tx_berry', cat: 'tx', name: name('taken'), stars: 1, mass: 1 },
        { id: 'tx_ok_2', cat: 'nowhere', name: name('no cat'), stars: 9, mass: -1 },
        { id: 'tx_ok_1', cat: 'tx', name: name('twice'), stars: 0, mass: 0 },
      ]);
    } catch (e) {
      said = (e as Error).message;
    }
    expect(said.split('; ')).toEqual(['item tx_berry: is registered already', 'item tx_ok_2: no category nowhere (register it first)', 'item tx_ok_2: stars are 0 to 5', 'item tx_ok_2: mass is a weight in kg', 'item tx_ok_1: is in this list twice']);
    expect(ITEMS.length).toBe(n);
    expect(hasItem('tx_ok_1')).toBe(false);
    expect(hasItem('tx_ok_2')).toBe(false);
    expect(() => newItem('tx_ok_1')).toThrow(/no item tx_ok_1/);
    // the good row alone goes in; an empty list is nothing
    registerItems([]);
    registerItems([good]);
    expect(ITEMS.length).toBe(n + 1);
    expect(ITEMS[n]).toMatchObject({ id: 'tx_ok_1', carry: 'small', salvage: {} });
    expect(() => registerItems([good])).toThrow(/registered already/);
    expect(() => registerItems({} as unknown as ItemRow[])).toThrow(/takes a list/);
    expect(ITEMS.length).toBe(n + 1);
  });

  it('holds a row to every rule', () => {
    const n = ITEMS.length;
    const row = (more: Record<string, unknown>): ItemRow => ({ id: 'tx_bad', cat: 'tx', name: name('bad'), stars: 1, mass: 0.1, ...more }) as unknown as ItemRow;
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ id: 'Tx_Bad' }, /an id is lower-case letters, digits and _/],
      [{ id: 'tx bad' }, /an id is/],
      [{ id: 5 }, /an id is/],
      [{ id: 'food_chips' }, /is registered already/],
      [{ cat: 'none' }, /no category none/],
      [{ cat: undefined }, /no category undefined/],
      [{ name: { zh: '只有中文' } }, /name in both languages/],
      [{ name: { zh: '', en: '' } }, /name in both languages/],
      [{ name: null }, /name in both languages/],
      [{ stars: 6 }, /stars are 0 to 5/],
      [{ stars: -1 }, /stars are/],
      [{ stars: 2.5 }, /stars are/],
      [{ stars: '3' }, /stars are/],
      [{ mass: -0.1 }, /mass is a weight in kg/],
      [{ mass: NaN }, /mass is/],
      [{ mass: Infinity }, /mass is/],
      [{ mass: '1' }, /mass is/],
      [{ carry: 'huge' }, /carry is small, medium or large/],
      [{ model: '' }, /model is the name of a model/],
      [{ blurb: 7 }, /blurb is a line of text/],
      [{ paint: -1 }, /paint and paint2 are colours/],
      [{ paint2: 0x1000000 }, /paint and paint2 are colours/],
      [{ salvage: [1] }, /salvage says how much of which material/],
      [{ salvage: { scrap: -2 } }, /salvage\.scrap is an amount from 0/],
      [{ salvage: { scrap: 'some' } }, /salvage\.scrap is an amount/],
      [{ tags: 'forage' }, /tags is a list of words/],
      [{ tags: ['ok', 'Not Ok'] }, /tag "Not Ok": lower-case letters, digits and _/],
      [{ tags: ['#forage'] }, /tag "#forage"/],
      [{ tags: [3] }, /tag "3"/],
      [{ stack: 0 }, /stack is a whole number from 1 to 9999/],
      [{ stack: 2.5 }, /stack is a whole number/],
      [{ stack: MAX_COUNT + 1 }, /stack is a whole number/],
      [{ stack: '12' }, /stack is a whole number/],
      [{ stack: 2, drink: { litres: 1, liquid: 'water', rate: 0.1 } }, /does not stack/],
      [{ stack: 2, gear: { kind: 'hammer', uses: 3 } }, /does not stack/],
      [{ stack: 2, gear: { kind: 'repair', points: 30 } }, /does not stack/],
      [{ stack: 2, pack: { slots: 2 } }, /does not stack/],
      [{ stack: 2, holds: { slots: 1, accepts: ['*'] } }, /does not stack/],
      [{ holds: 'everything' }, /holds says how many slots and what it accepts/],
      [{ holds: null }, /holds says how many slots/],
      [{ holds: { slots: 0, accepts: ['*'] } }, /holds\.slots is a whole number from 1/],
      [{ holds: { slots: 1.5, accepts: ['*'] } }, /holds\.slots is/],
      [{ holds: { slots: 2, accepts: [] } }, /holds\.accepts is a list of category ids, "#tag" or "\*", and not empty/],
      [{ holds: { slots: 2 } }, /holds\.accepts is a list/],
      [{ holds: { slots: 2, accepts: 'food' } }, /holds\.accepts is a list/],
      [{ holds: { slots: 2, accepts: ['Food'] } }, /holds\.accepts "Food": a category id, "#tag" or "\*"/],
      [{ holds: { slots: 2, accepts: ['#'] } }, /holds\.accepts "#"/],
      [{ holds: { slots: 2, accepts: ['**'] } }, /holds\.accepts "\*\*"/],
      [{ holds: { slots: 2, accepts: [4] } }, /holds\.accepts "4"/],
      [{ holds: { slots: 2, accepts: ['*'], maxKg: 0 } }, /holds\.maxKg is a weight in kg/],
      [{ holds: { slots: 2, accepts: ['*'], maxKg: Infinity } }, /holds\.maxKg is/],
      [{ holds: { slots: 2, accepts: ['*'], decay: -0.5 } }, /holds\.decay is a rate from 0/],
      [{ holds: { slots: 2, accepts: ['*'], decay: NaN } }, /holds\.decay is/],
      [{ holds: { slots: 2, accepts: ['*'] }, perish: { hours: 5 } }, /a thing that holds things does not go off/],
      [{ perish: { hours: 0 } }, /perish\.hours is a time in game hours/],
      [{ perish: { hours: Infinity } }, /perish\.hours is/],
      [{ perish: {} }, /perish\.hours is/],
      [{ perish: 24 }, /perish\.hours is/],
      [{ perish: { hours: 5, into: 'Not An Id' } }, /perish\.into is the id of a kind/],
      [{ perish: { hours: 5, into: 7 } }, /perish\.into is the id/],
      [{ perish: { hours: 5, into: 'tx_bad' } }, /turns into itself/],
    ];
    for (const [more, why] of cases) expect(() => registerItems([row(more)]), JSON.stringify(more) ?? String(more)).toThrow(why);
    expect(() => registerItems([null as unknown as ItemRow, 'berry' as unknown as ItemRow])).toThrow(/an item is an object.*; an item is an object/);
    expect(ITEMS.length).toBe(n);
    expect(hasItem('tx_bad')).toBe(false);
    // what is allowed at the edges: no weight, the largest stack, a box that keeps for ever, a kind that turns into one registered later
    registerItems([
      row({ id: 'tx_edge_1', mass: 0, stack: MAX_COUNT, tags: [] }),
      row({ id: 'tx_edge_2', holds: { slots: 1, accepts: ['*', 'tx', '#forage'], maxKg: 0.001, decay: 0 } }),
      row({ id: 'tx_edge_3', perish: { hours: 0.001, into: 'tx_edge_4' }, stack: 1 }),
    ]);
    expect(ITEMS.length).toBe(n + 3);
    expect(stackMax('tx_edge_1')).toBe(MAX_COUNT);
    expect(stackMax('tx_edge_2')).toBe(1);
    // … which the catalogue's own check then reports until it is there
    expect(itemCatalogueProblems()).toContain('item tx_edge_3: turns into tx_edge_4, which does not exist');
    registerItems([row({ id: 'tx_edge_4' })]);
    expect(itemCatalogueProblems().join()).not.toContain('tx_edge_3');
  });

  it('says what is wrong with the catalogue as a whole', () => {
    // what this file registered on purpose: a kind whose stacks are larger than those of what it turns into
    expect(itemCatalogueProblems()).toEqual(['item tx_fade: stacks to 12, but what it turns into (tx_few) stacks to 5']);
    registerItemCat({ id: 'tx_cp', name: name('catalogue problems') });
    registerItemCat({ id: 'tx_boxes_only', name: name('boxes only') });
    const row = (id: string, more: Record<string, unknown>): ItemRow => ({ id, cat: 'tx_cp', name: name(id), stars: 0, mass: 0.1, ...more }) as unknown as ItemRow;
    registerItems([
      row('tx_cp_a', { perish: { hours: 1, into: 'tx_cp_nowhere' } }),
      row('tx_cp_b', { perish: { hours: 1, into: 'tx_cp_c' } }),
      row('tx_cp_c', { perish: { hours: 1, into: 'tx_cp_d' } }),
      row('tx_cp_d', {}),
      // a box for a tag nothing carries, for a category that does not exist, and for one whose only kind is a box (boxes do not nest)
      row('tx_cp_box', { holds: { slots: 1, accepts: ['#tx_no_such_tag', 'tx_no_such_cat', 'tx_boxes_only', 'tx_cp', '#forage', '*'] } }),
      { ...row('tx_cp_inner', { holds: { slots: 1, accepts: ['*'] } }), cat: 'tx_boxes_only' },
    ]);
    expect(itemCatalogueProblems().filter((p) => p.includes('tx_cp'))).toEqual([
      'item tx_cp_a: turns into tx_cp_nowhere, which does not exist',
      'item tx_cp_b: turns into tx_cp_c, which turns into something again',
      'item tx_cp_box: accepts #tx_no_such_tag, which nothing is',
      'item tx_cp_box: accepts tx_no_such_cat, which nothing is',
      'item tx_cp_box: accepts tx_boxes_only, which nothing is',
    ]);
  });
});

// ------------------------------------------------------------------ the pin on today's world

describe('items: what a seed holds does not change when kinds are registered', () => {
  it('fifty seeds: every container by the road, what lies in plain sight and every wreck’s boot give what they gave', () => {
    expect(AFTER.length).toBe(BEFORE.length);
    for (let i = 0; i < BEFORE.length; i++) expect(AFTER[i]).toBe(BEFORE[i]);
    // and written down so that it could not pass by holding nothing: the rolls are full of the old kinds …
    const all = BEFORE.join('\n');
    const picked = (cat: ItemCat): number => BASE_ITEMS.filter((d) => d.cat === cat).reduce((n, d) => n + all.split(`"${d.id}"`).length - 1 + all.split(new RegExp(`[ ,]${d.id}(?=[, ])`)).length - 1, 0);
    for (const cat of NINE) expect(picked(cat), cat).toBeGreaterThan(20);
    expect(picked('food')).toBeGreaterThan(400);
    // … none of what was registered is in them …
    for (const d of ITEMS.slice(BASE_COUNT)) expect(AFTER.join('\n').includes(d.id), d.id).toBe(false);
    // … and every list a roll picks from would have been longer, at every grade, had it been drawn from the whole
    // catalogue: a pick is the list's (random × length)-th entry, so nearly every one of them would have changed
    for (const cat of NINE) {
      for (let top = 0; top <= 5; top++) {
        const fits = (d: (typeof ITEMS)[number]): boolean => d.cat === cat && d.stars <= top && d.carry !== 'large';
        expect(ITEMS.filter(fits).length, `${cat} ★${top}`).toBeGreaterThan(BASE_ITEMS.filter(fits).length);
      }
    }
  });
});

// ------------------------------------------------------------------ stacks

describe('items: stacks', () => {
  it('counts, weighs, names and recycles a stack as so many', () => {
    const a = newItem('tx_jerky', { n: 5 });
    expect(countOf(a)).toBe(5);
    expect(countOf(newItem('tx_jerky'))).toBe(1);
    expect(stackMax('tx_jerky')).toBe(8);
    expect(stackMax('food_chips')).toBe(1);
    expect(() => stackMax('nope')).toThrow(/no item nope/);
    expect(itemMass(a)).toBeCloseTo(0.5, 12);
    expect(salvageOf(a)).toEqual({ scrap: 10 });
    expect(itemName(a)).toBe('试·jerky ×5');
    expect(itemName(a, 'en')).toBe('jerky ×5');
    expect(itemName(newItem('tx_jerky'))).toBe('试·jerky');
    expect(itemSig(a)).toBe('tx_jerky*5');
    // a box weighs and recycles with what is in it, and its signature shows it
    const box = newItem('tx_cool');
    expect(putInside(box, a, 0)).toBe(0);
    expect(putInside(box, newItem('drink_water', { litres: 1.2 }), 0)).toBe(0);
    expect(itemMass(box)).toBeCloseTo(2 + 0.5 + 0.2 + 1.2, 12);
    expect(insideMass(box)).toBeCloseTo(0.5 + 0.2 + 1.2, 12);
    // (the box itself one — anything gives a little —, the five jerky two each, the bottle one: the water in it gives nothing)
    expect(salvageOf(box)).toEqual({ scrap: 1 + 10 + 1 });
    expect(itemSig(box)).toBe('tx_cool[tx_jerky*5,drink_water|l1.20]');
    const seen: string[] = [];
    forEachItem(box, (x, holder) => seen.push(`${x.item}${holder ? ` in ${holder.item}` : ''}`));
    expect(seen).toEqual(['tx_cool', 'tx_jerky in tx_cool', 'drink_water in tx_cool']);
  });

  it('says which two may be one stack', () => {
    const j = (o: Partial<ItemInstance> = {}): ItemInstance => newItem('tx_jerky', { n: 2, ...o });
    const b = (o: Partial<ItemInstance> = {}): ItemInstance => newItem('tx_berry', { n: 2, t0: 0, ...o });
    expect(canStack(j(), j(), 0)).toBe(true);
    // not with itself, not another kind, not a kind that does not stack
    const one = j();
    expect(canStack(one, one, 0)).toBe(false);
    expect(canStack(j(), newItem('tx_nut'), 0)).toBe(false);
    expect(canStack(newItem('food_chips'), newItem('food_chips'), 0)).toBe(false);
    // colour, quality, opened, state
    expect(canStack(j({ tint: 0xff0000 }), j(), 0)).toBe(false);
    expect(canStack(j({ tint: 0xff0000 }), j({ tint: 0xff0000 }), 0)).toBe(true);
    expect(canStack(j({ q: 3 }), j({ q: 4 }), 0)).toBe(false);
    expect(canStack(j({ q: 3 }), j(), 0)).toBe(false);
    expect(canStack(j({ q: 3 }), j({ q: 3 }), 0)).toBe(true);
    expect(canStack(j({ opened: true }), j(), 0)).toBe(false);
    expect(canStack(j({ opened: false }), j(), 0)).toBe(true);
    const st = (s: unknown): ItemInstance => newItem('tx_page', { n: 1, state: s as ItemInstance['state'] });
    expect(canStack(st({ page: 3, marks: [1, { deep: true }] }), st({ marks: [1, { deep: true }], page: 3 }), 0)).toBe(true);
    expect(canStack(st({ page: 3 }), st({ page: 4 }), 0)).toBe(false);
    expect(canStack(st({ page: 3 }), st({ page: 3, torn: true }), 0)).toBe(false);
    expect(canStack(st({ page: 3, torn: true }), st({ page: 3 }), 0)).toBe(false);
    expect(canStack(st({ marks: [1, 2] }), st({ marks: [1, 2, 3] }), 0)).toBe(false);
    expect(canStack(st({ marks: [1, 2] }), st({ marks: { 0: 1, 1: 2 } }), 0)).toBe(false);
    expect(canStack(st({ page: null }), st({ page: 0 }), 0)).toBe(false);
    // (no state, an empty one and one whose only key holds nothing are the same; so JSON has it too)
    expect(canStack(st({}), newItem('tx_page'), 0)).toBe(true);
    expect(canStack(st({ page: undefined }), st({}), 0)).toBe(true);
    expect(canStack(st({ a: { b: undefined } }), st({ a: {} }), 0)).toBe(true);
    // a level of its own, or things inside: one of a kind
    expect(canStack(j({ litres: 0.2 }), j({ litres: 0.2 }), 0)).toBe(false);
    expect(canStack(j({ uses: 1 }), j(), 0)).toBe(false);
    expect(canStack(j({ inside: [] }), j(), 0)).toBe(false);
    // freshness: about as fresh, at the same rate; a turned one only with turned ones; one that goes off not with one that carries no freshness
    expect(canStack(b(), b({ fresh: 1 - STACK_FRESH_TOL + 0.01 }), 0)).toBe(true);
    expect(canStack(b(), b({ fresh: 1 - STACK_FRESH_TOL - 0.01 }), 0)).toBe(false);
    expect(canStack(b(), b({ t0: -5 * H }), 0)).toBe(true);
    expect(canStack(b(), b({ t0: -7 * H }), 0)).toBe(false);
    expect(canStack(b({ fk: 0.5 }), b(), 0)).toBe(false);
    expect(canStack(b({ fk: 0.5 }), b({ fk: 0.5 }), 0)).toBe(true);
    expect(canStack(b({ fk: 1 }), b(), 0)).toBe(true);
    expect(canStack(b({ fresh: 0 }), b({ fresh: 0.1 }), 0)).toBe(false);
    expect(canStack(b({ fresh: 0 }), b({ t0: -30 * H }), 0)).toBe(true);
    const bare = b();
    delete bare.fresh;
    expect(canStack(bare, b(), 0)).toBe(false);
    // one not started stacks with one that has, read as it stands
    expect(canStack(newItem('tx_berry'), b(), 0)).toBe(true);
    // a stack used up is no stack
    expect(canStack(j({ n: 0 }), j(), 0)).toBe(false);
    expect(canStack(j(), j({ n: 0 }), 0)).toBe(false);
  });

  it('merges as many as fit and says how many are left', () => {
    const a = newItem('tx_jerky', { n: 6 });
    const b = newItem('tx_jerky', { n: 5 });
    expect(mergeStacks(a, b, 0)).toBe(3);
    expect([a.n, b.n]).toEqual([8, 3]);
    // full: nothing moves
    expect(mergeStacks(a, b, 0)).toBe(3);
    expect([a.n, b.n]).toEqual([8, 3]);
    // all of it: the one taken from reads 0, and one is written as no count at all
    const c = newItem('tx_jerky', { n: 2 });
    expect(mergeStacks(c, b, 0)).toBe(0);
    expect(countOf(b)).toBe(0);
    expect(b.n).toBe(0);
    expect(countOf(c)).toBe(5);
    const d = newItem('tx_jerky');
    const e = newItem('tx_jerky', { n: 2 });
    expect(mergeStacks(d, e, 0)).toBe(0);
    expect(d.n).toBe(3);
    // what does not stack does not move; a stack used up gives nothing and takes nothing
    const nut = newItem('tx_nut', { n: 3 });
    expect(mergeStacks(c, nut, 0)).toBe(3);
    expect([countOf(c), countOf(nut)]).toEqual([5, 3]);
    expect(mergeStacks(c, b, 0)).toBe(0);
    expect(countOf(c)).toBe(5);
    expect(mergeStacks(b, c, 0)).toBe(5);
    expect([countOf(b), countOf(c)]).toEqual([0, 5]);
    expect(mergeStacks(c, c, 0)).toBe(5);
    expect(countOf(c)).toBe(5);
    expect(mergeStacks(c, newItem('tx_jerky', { n: -4 }), 0)).toBe(0);
    expect(countOf(c)).toBe(5);
  });

  it('a merged stack is as fresh as the two were, by count, from now', () => {
    const a = newItem('tx_berry', { n: 3, t0: 0 });
    const b = newItem('tx_berry', { n: 9, t0: 2 * H });
    const now = 6 * H;
    const fa = freshNow(a, now);
    const fb = freshNow(b, now);
    expect([fa, fb]).toEqual([0.75, 1 - 4 / 24]);
    expect(mergeStacks(a, b, now)).toBe(0);
    expect(countOf(a)).toBe(12);
    expect(a.t0).toBe(now);
    expect(freshNow(a, now)).toBeCloseTo((3 * fa + 9 * fb) / 12, 12);
    expect(freshNow(a, now + 3 * H)).toBeCloseTo((3 * fa + 9 * fb) / 12 - 3 / 24, 12);
    // a part of it: what is left behind is as fresh as it was
    const c = newItem('tx_berry', { n: 10, t0: 0 });
    const d = newItem('tx_berry', { n: 10, t0: 3 * H });
    expect(mergeStacks(c, d, now)).toBe(8);
    expect([countOf(c), countOf(d)]).toEqual([12, 8]);
    expect(freshNow(c, now)).toBeCloseTo((10 * 0.75 + 2 * 0.875) / 12, 12);
    expect(freshNow(d, now)).toBe(0.875);
    expect(d.t0).toBe(3 * H);
    // two that have not started are one that has not started; one that has starts the other
    const e = newItem('tx_berry', { n: 2, fresh: 0.9 });
    const f = newItem('tx_berry', { n: 2, fresh: 0.7 });
    expect(mergeStacks(e, f, now)).toBe(0);
    expect(e.t0).toBeUndefined();
    expect(e.fresh).toBeCloseTo(0.8, 12);
    expect(freshNow(e, now + 100 * H)).toBeCloseTo(0.8, 12);
    const g = newItem('tx_berry', { n: 4, t0: now });
    expect(mergeStacks(e, g, now)).toBe(0);
    expect(e.t0).toBe(now);
    expect(freshNow(e, now)).toBeCloseTo(0.9, 12);
    // two turned ones are one turned one
    const h = newItem('tx_berry', { n: 2, t0: -99 * H });
    const i = newItem('tx_berry', { n: 2, fresh: 0 });
    expect(mergeStacks(h, i, now)).toBe(0);
    expect(freshNow(h, now)).toBe(0);
    expect(turned(h, now)).toBe(true);
  });

  it('splits a stack into two that are the same, and only so', () => {
    const a = newItem('tx_page', { n: 5, q: 4, tint: 0x112233, state: { page: 3, marks: [1] } as ItemInstance['state'] });
    for (const k of [0, -1, 5, 6, 2.5, NaN, Infinity]) expect(splitStack(a, k), String(k)).toBeNull();
    expect(countOf(a)).toBe(5);
    const b = splitStack(a, 2)!;
    expect([countOf(a), countOf(b)]).toEqual([3, 2]);
    expect(b.uid).not.toBe(a.uid);
    expect({ ...b, uid: '', n: 0 }).toEqual({ ...a, uid: '', n: 0 });
    // (its state is its own: changing one does not change the other)
    (b.state as { marks: number[] }).marks.push(2);
    expect((a.state as { marks: number[] }).marks).toEqual([1]);
    expect(canStack(a, b, 0)).toBe(false);
    (b.state as { marks: number[] }).marks.pop();
    expect(mergeStacks(a, b, 0)).toBe(0);
    expect(countOf(a)).toBe(5);
    // down to one each, and one cannot be split
    const c = newItem('tx_jerky', { n: 2 });
    const d = splitStack(c, 1)!;
    expect([c.n, d.n]).toEqual([undefined, undefined]);
    expect(splitStack(c, 1)).toBeNull();
    expect(splitStack(newItem('tx_jerky', { n: 0 }), 1)).toBeNull();
    // the two halves of a stack that goes off are as fresh as each other for ever after
    const e = newItem('tx_berry', { n: 6, t0: 0, fk: 0.5 });
    const f = splitStack(e, 4)!;
    expect(freshNow(f, 12 * H)).toBe(freshNow(e, 12 * H));
    expect(freshNow(f, 12 * H)).toBe(0.75);
    // a thing with things in it is one of a kind, whatever its count claims
    const box = newItem('tx_cool', { n: 3 });
    putInside(box, newItem('tx_nut', { n: 4 }), 0);
    expect(splitStack(box, 1)).toBeNull();
    expect(countOf(box)).toBe(3);
  });
});

// ------------------------------------------------------------------ things that hold things

describe('items: things that hold things', () => {
  it('takes a thing by its kind: a category, a tag, anything; never a box, never itself', () => {
    const basket = newItem('tx_basket');
    const sack = newItem('tx_sack');
    const cool = newItem('tx_cool');
    const takes = (box: ItemInstance, id: string): boolean => accepts(box, newItem(id));
    expect(['tx_berry', 'tx_nut', 'tx_few', 'tx_jerky', 'food_chips', 'tx_basket'].map((id) => takes(basket, id))).toEqual([true, true, true, false, false, false]);
    expect(['food_chips', 'txo_food_3', 'tx_jerky', 'tx_berry', 'drink_water', 'tx_sack'].map((id) => takes(sack, id))).toEqual([true, true, true, false, false, false]);
    expect(['food_chips', 'hammer_1', 'tx_berry', 'tx_basket', 'tx_cool', 'pack_old'].map((id) => takes(cool, id))).toEqual([true, true, true, false, false, true]);
    expect(accepts(cool, cool)).toBe(false);
    // a tag is the whole word (not its end, not its start)
    registerItems([
      { id: 'tx_tag_a', cat: 'tx', name: name('tag a'), stars: 0, mass: 0.1, tags: ['xforage', 'forag', 'forage_x'] },
      { id: 'tx_tag_b', cat: 'tx_late_b', name: name('tag b'), stars: 0, mass: 0.1, tags: ['food', 'tx'] },
    ]);
    expect(takes(basket, 'tx_tag_a')).toBe(false);
    // (and a tag is not a category: the sack takes the category food, not the tag)
    expect(takes(sack, 'tx_tag_b')).toBe(false);
    // what is no box takes nothing; a thing that has things in it goes into nothing
    expect(accepts(newItem('food_chips'), newItem('tx_nut'))).toBe(false);
    expect(roomInside(newItem('food_chips'), newItem('tx_nut'), 0)).toBe(0);
    expect(putInside(newItem('food_chips'), newItem('tx_nut', { n: 3 }), 0)).toBe(3);
    const odd = newItem('tx_nut', { inside: [newItem('tx_nut')] });
    expect(accepts(cool, odd)).toBe(false);
  });

  it('by slots: onto the stacks it joins first, then into a free slot', () => {
    const box = newItem('tx_basket');
    expect(putInside(box, newItem('tx_nut', { n: 15 }), 0)).toBe(0);
    expect(putInside(box, newItem('tx_nut', { n: 15 }), 0)).toBe(0);
    // (fifteen went onto the first as far as twenty, the other ten into a slot of their own)
    expect(box.inside!.map((x) => countOf(x))).toEqual([20, 10]);
    expect(putInside(box, newItem('tx_few', { n: 5 }), 0)).toBe(0);
    expect(box.inside!.map((x) => `${x.item}*${countOf(x)}`)).toEqual(['tx_nut*20', 'tx_nut*10', 'tx_few*5']);
    // no slot left: only what fits onto the stacks it joins
    const more = newItem('tx_nut', { n: 15 });
    expect(roomInside(box, more, 0)).toBe(10);
    expect(putInside(box, more, 0)).toBe(5);
    expect(countOf(more)).toBe(5);
    expect(box.inside!.map((x) => countOf(x))).toEqual([20, 20, 5]);
    expect(roomInside(box, more, 0)).toBe(0);
    expect(putInside(box, more, 0)).toBe(5);
    expect(roomInside(box, newItem('tx_berry'), 0)).toBe(0);
    // what is in it already is not put in again
    const first = box.inside![0];
    expect(roomInside(box, first, 0)).toBe(0);
    expect(putInside(box, first, 0)).toBe(20);
    expect(box.inside!.length).toBe(3);
    // a stack used up goes nowhere
    expect(putInside(box, newItem('tx_few', { n: 0 }), 0)).toBe(0);
    expect(box.inside!.length).toBe(3);
  });

  it('by weight: as many as the box still bears, the rest stays outside as it was', () => {
    const box = newItem('tx_basket');
    // 1 kg of berries at 50 g: twenty, in two slots of twelve and eight
    const a = newItem('tx_berry', { n: 12, t0: 0 });
    const b = newItem('tx_berry', { n: 12, t0: 0 });
    expect(roomInside(box, a, 0)).toBe(12);
    expect(putInside(box, a, 0)).toBe(0);
    expect(box.inside![0]).toBe(a);
    expect(roomInside(box, b, 0)).toBe(8);
    expect(putInside(box, b, 0)).toBe(4);
    expect(countOf(b)).toBe(4);
    expect(box.inside!.map((x) => countOf(x))).toEqual([12, 8]);
    expect(box.inside![1].uid).not.toBe(b.uid);
    expect(insideMass(box)).toBeCloseTo(1, 9);
    // (what stays outside goes off in the open air as before; what went in at the box's rate)
    expect(b.fk).toBeUndefined();
    expect(freshNow(b, 12 * H)).toBe(0.5);
    expect(box.inside![1].fk).toBe(0.5);
    expect(freshNow(box.inside![1], 12 * H)).toBe(0.75);
    // full by weight: not one nut more, though a slot is free
    expect(roomInside(box, newItem('tx_nut', { n: 3 }), 0)).toBe(0);
    // one stack out: room for fifty grams' worth again
    const out = takeInside(box, 1, 0)!;
    expect(countOf(out)).toBe(8);
    expect(roomInside(box, newItem('tx_nut', { n: 20 }), 0)).toBe(20);
    expect(roomInside(box, newItem('tx_nut', { n: 20, t0: 0 }), 0)).toBe(20);
    // a thing heavier than the box bears does not go in at all; one that weighs nothing always does
    const cool = newItem('tx_cool');
    expect(roomInside(cool, newItem('junk_tv'), 0)).toBe(0);
    expect(roomInside(cool, newItem('junk_chair'), 0)).toBe(1);
    expect(roomInside(cool, newItem('tx_edge_1', { n: 9000 }), 0)).toBe(9000);
  });

  it('takes a thing out, or some of a stack, and nothing for a wrong question', () => {
    const box = newItem('tx_basket');
    putInside(box, newItem('tx_nut', { n: 10 }), 0);
    putInside(box, newItem('tx_berry', { n: 6, t0: 0 }), 0);
    for (const [i, k] of [[-1, undefined], [2, undefined], [0.5, undefined], [NaN, undefined], [0, 0], [0, -2], [0, 1.5], [0, NaN]] as [number, number | undefined][]) expect(takeInside(box, i, 0, k), `${i} ${k}`).toBeNull();
    expect(box.inside!.map((x) => countOf(x))).toEqual([10, 6]);
    const three = takeInside(box, 0, 0, 3)!;
    expect([countOf(three), countOf(box.inside![0])]).toEqual([3, 7]);
    expect(three.uid).not.toBe(box.inside![0].uid);
    // all there is, or more than there is: the thing itself
    const rest = box.inside![0];
    expect(takeInside(box, 0, 0, 99)).toBe(rest);
    expect(box.inside!.length).toBe(1);
    const berries = box.inside![0];
    expect(takeInside(box, 0, 6 * H, 6)).toBe(berries);
    // (empty is written as no list at all)
    expect(box.inside).toBeUndefined();
    expect('inside' in box).toBe(false);
    expect(takeInside(box, 0, 0)).toBeNull();
    // out in the open air it goes off at the full rate from then
    expect(berries.fk).toBeUndefined();
    expect(freshNow(berries, 6 * H)).toBe(0.875);
    expect(freshNow(berries, 12 * H)).toBe(0.625);
  });

  it('never loses or makes one: random put, take, merge, split and settle', () => {
    const KINDS = ['tx_berry', 'tx_nut', 'tx_jerky', 'tx_fade', 'tx_page', 'tx_few', 'tx_mush', 'food_chips'];
    const LINE: Record<string, string> = { tx_berry: 'berry', tx_mush: 'berry', tx_fade: 'fade', tx_few: 'fade' };
    const line = (x: ItemInstance): string => LINE[x.item] ?? x.item;
    let puts = 0;
    let partial = 0;
    let refused = 0;
    let merges = 0;
    let settled = 0;
    let overMax = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const r = new Rng(seed * 7919);
      const free: ItemInstance[] = [];
      const boxes = [newItem('tx_basket'), newItem('tx_sack'), newItem('tx_cool'), newItem('tx_basket')];
      const made: Record<string, number> = {};
      let now = r.range(0, 5 * H);
      const all = (): ItemInstance[] => [...free, ...boxes.flatMap((b) => b.inside ?? [])];
      const totals = (): Record<string, number> => {
        const t: Record<string, number> = {};
        for (const x of all()) t[line(x)] = (t[line(x)] ?? 0) + countOf(x);
        return t;
      };
      const check = (what: string): void => {
        const where = (): string => `seed ${seed}, after ${what}`;
        const t = totals();
        for (const k of Object.keys(made)) must((t[k] ?? 0) === made[k], () => `${where()}: ${t[k] ?? 0} of ${k}, ${made[k]} were made`);
        const uids = new Set<string>();
        for (const x of all()) {
          must(Number.isInteger(countOf(x)) && countOf(x) >= 1, () => `${where()}: a count of ${x.n}`);
          must(x.n !== 1, () => `${where()}: one written as a count`);
          must(!uids.has(x.uid), () => `${where()}: ${x.uid} twice`);
          uids.add(x.uid);
        }
        for (const b of boxes) {
          const h = itemDef(b.item).holds!;
          if (b.inside === undefined) continue;
          must(b.inside.length > 0, () => `${where()}: an empty list kept`);
          must(b.inside.length <= h.slots, () => `${where()}: ${b.inside!.length} in ${h.slots} slots`);
          must(h.maxKg === undefined || insideMass(b) <= h.maxKg + 1e-9, () => `${where()}: ${insideMass(b)} kg in a box that bears ${h.maxKg}`);
          for (const x of b.inside) {
            // (what turned inside is what it has become, whether the box would take such a thing or not)
            must(x.item === 'tx_mush' || accepts(b, x), () => `${where()}: ${x.item} in ${b.item}`);
            must(x.fresh === undefined || (x.fk ?? 1) === (h.decay ?? 1), () => `${where()}: ${x.item} in ${b.item} goes off at ${x.fk ?? 1}`);
          }
        }
      };
      for (let step = 0; step < 400; step++) {
        const op = r.int(100);
        if (op < 22 || free.length < 2) {
          const id = r.pick(KINDS);
          const n = 1 + r.int(stackMax(id));
          const x = newItem(id, { ...(n > 1 ? { n } : {}), ...(itemDef(id).perish && r.chance(0.85) ? { t0: now, fresh: r.chance(0.5) ? 1 : r.range(0.2, 1) } : {}), ...(id === 'tx_page' ? { state: { page: r.int(2) } as ItemInstance['state'] } : {}) });
          free.push(x);
          made[line(x)] = (made[line(x)] ?? 0) + n;
          check(`making ${n} ${id}`);
        } else if (op < 40) {
          const a = r.pick(free);
          const b = r.pick(free);
          const [na, nb] = [countOf(a), countOf(b)];
          const could = canStack(a, b, now);
          const fresh0 = a.fresh !== undefined && could ? freshNow(a, now) * na + freshNow(b, now) * nb : -1;
          const left = mergeStacks(a, b, now);
          must(left === countOf(b), () => `seed ${seed}: merge says ${left} are left, there are ${countOf(b)}`);
          must(a === b || countOf(a) + countOf(b) === na + nb, () => `seed ${seed}: ${na} + ${nb} merged into ${countOf(a)} + ${countOf(b)}`);
          must(left === (could ? Math.max(0, nb - Math.max(0, stackMax(a.item) - na)) : nb), () => `seed ${seed}: ${nb} onto ${na} of ${a.item} left ${left}`);
          // (the freshness there is, by count, is what there was)
          if (fresh0 >= 0) must(Math.abs(freshNow(a, now) * countOf(a) + freshNow(b, now) * countOf(b) - fresh0) < 1e-9, () => `seed ${seed}: freshness made or lost in a merge`);
          if (left < nb) merges++;
          if (left === 0) free.splice(free.indexOf(b), 1);
          check('a merge');
        } else if (op < 50) {
          const a = r.pick(free);
          const n = countOf(a);
          const k = r.int(n + 2);
          const part = splitStack(a, k);
          must((part === null) === !(k >= 1 && k < n), () => `seed ${seed}: split ${k} of ${n}`);
          if (part) {
            must(countOf(part) === k && countOf(a) === n - k, () => `seed ${seed}: ${k} of ${n} split into ${countOf(part)} and ${countOf(a)}`);
            free.push(part);
          }
          check('a split');
        } else if (op < 72) {
          const box = r.pick(boxes);
          const x = r.pick(free);
          const n = countOf(x);
          const room = roomInside(box, x, now);
          const sig = itemSig(box);
          const left = putInside(box, x, now);
          const isIn = (box.inside ?? []).includes(x);
          // the box takes exactly what it said it had room for
          must(n - left === room, () => `seed ${seed}: room for ${room} of ${n} ${x.item}, ${n - left} went into ${sig}`);
          must(left === 0 || countOf(x) === left, () => `seed ${seed}: ${left} left outside, the thing counts ${countOf(x)}`);
          if (room === 0) {
            must(itemSig(box) === sig, () => `seed ${seed}: a box with no room changed`);
            refused++;
          } else puts++;
          if (left > 0 && left < n) partial++;
          // all in: it is the thing itself in the box, or it went onto stacks and reads 0; not all in: it stays outside
          must(left === 0 ? isIn !== (countOf(x) === 0) : !isIn, () => `seed ${seed}: ${left} left of ${n}, in the box: ${isIn}, counts ${countOf(x)}`);
          if (left === 0) free.splice(free.indexOf(x), 1);
          check('a put');
        } else if (op < 86) {
          const box = r.pick(boxes);
          const n = box.inside?.length ?? 0;
          const i = r.int(n + 2) - 1;
          const s = box.inside?.[i];
          const had = s ? countOf(s) : 0;
          const k = r.chance(0.5) ? undefined : r.int(had + 2);
          const out = takeInside(box, i, now, k);
          must((out === null) === (!s || k === 0), () => `seed ${seed}: take ${k} of #${i}`);
          if (out) {
            must(countOf(out) === (k === undefined ? had : Math.min(k, had)), () => `seed ${seed}: took ${countOf(out)}, asked ${k} of ${had}`);
            must(out.fk === undefined, () => `seed ${seed}: out of the box at the rate ${out.fk}`);
            free.push(out);
          }
          check('a take');
        } else if (op < 94) {
          const x = r.pick(all());
          const [n, was] = [countOf(x), x.item];
          const did = settleItem(x, now);
          must(countOf(x) === n && did === (x.item !== was), () => `seed ${seed}: ${n} ${was} settled into ${countOf(x)} ${x.item} (${did})`);
          if (did) {
            settled++;
            if (countOf(x) > stackMax(x.item)) overMax++;
          }
          check('settling');
        } else now += r.range(0, 9 * H);
      }
      // at the end, everything out of the boxes again: still every one of them
      for (const b of boxes) while (b.inside) free.push(takeInside(b, 0, now)!);
      check('emptying the boxes');
    }
    // (the sequences did what they were meant to try)
    expect(puts).toBeGreaterThan(500);
    expect(partial).toBeGreaterThan(50);
    expect(refused).toBeGreaterThan(200);
    expect(merges).toBeGreaterThan(100);
    expect(settled).toBeGreaterThan(100);
    expect(overMax).toBeGreaterThan(5);
  });

  it('a stack over its kind’s maximum (what it turned into stacks smaller) loses nothing', () => {
    const a = newItem('tx_fade', { n: 12, t0: 0 });
    expect(settleItem(a, 11 * H)).toBe(true);
    expect([a.item, countOf(a), stackMax(a.item)]).toEqual(['tx_few', 12, 5]);
    // nothing joins it, it gives what another has room for, and it can be taken apart
    const b = newItem('tx_few', { n: 2 });
    expect(mergeStacks(a, b, 11 * H)).toBe(2);
    expect(mergeStacks(b, a, 11 * H)).toBe(9);
    expect([countOf(a), countOf(b)]).toEqual([9, 5]);
    const c = splitStack(a, 4)!;
    expect([countOf(a), countOf(c)]).toEqual([5, 4]);
    // whole into a free slot, and nothing more onto it there
    const big = newItem('tx_fade', { n: 12, t0: 0 });
    settleItem(big, 11 * H);
    const box = newItem('tx_cool');
    expect(roomInside(box, big, 11 * H)).toBe(12);
    expect(putInside(box, big, 11 * H)).toBe(0);
    expect(putInside(box, newItem('tx_few', { n: 3 }), 11 * H)).toBe(0);
    expect(box.inside!.map((x) => countOf(x))).toEqual([12, 3]);
  });
});

// ------------------------------------------------------------------ freshness

describe('items: freshness', () => {
  it('is read, never stepped: a value at a time, at a rate', () => {
    const a = newItem('tx_berry');
    expect(a).toMatchObject({ fresh: 1 });
    expect(a.t0).toBeUndefined();
    // not started: as fresh as it was made, whatever the time
    expect(freshNow(a, 1e9)).toBe(1);
    expect(turned(a, 1e9)).toBe(false);
    stampFresh(a, 100);
    expect(a.t0).toBe(100);
    stampFresh(a, 500);
    expect(a.t0).toBe(100);
    expect(freshNow(a, 100 + 6 * H)).toBe(0.75);
    expect(freshNow(a, 100 + 24 * H)).toBe(0);
    expect(freshNow(a, 100 + 99 * H)).toBe(0);
    expect(turned(a, 100 + 24 * H)).toBe(true);
    // before its own time nothing has passed
    expect(freshNow(a, 0)).toBe(1);
    expect(freshNow(a, -1e9)).toBe(1);
    // a thing that does not go off is fresh, and has no freshness to start
    const chips = newItem('food_chips');
    stampFresh(chips, 5);
    expect(chips).toEqual({ uid: chips.uid, item: 'food_chips' });
    expect(freshNow(chips, 1e9)).toBe(1);
    expect(turned(chips, 1e9)).toBe(false);
    expect(settleItem(chips, 1e9)).toBe(false);
    // never more than fresh nor less than turned, whatever was written into it
    expect(freshNow(newItem('tx_berry', { fresh: 7, t0: 0 }), 6 * H)).toBe(0.75);
    expect(freshNow(newItem('tx_berry', { fresh: -3 }), 0)).toBe(0);
    expect(freshNow(newItem('tx_berry', { fresh: NaN, t0: 0 }), 12 * H)).toBe(0.5);
    // the card's word
    expect([1, 0.61, 0.6, 0.31, 0.3, 0.01, 0, -1].map(freshStage)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it('stamping starts what is in a box at the box’s rate', () => {
    const box = newItem('tx_basket', { inside: [newItem('tx_berry', { n: 3 }), newItem('tx_nut', { n: 2 }), newItem('tx_berry', { n: 2, fk: 0.25 }), newItem('tx_berry', { t0: 0 })] });
    stampFresh(box, 50);
    expect(box.inside!.map((x) => [x.t0, x.fk])).toEqual([[50, 0.5], [undefined, undefined], [50, 0.25], [0, undefined]]);
    expect(box.t0).toBeUndefined();
  });

  it('brought up to date any number of times, it says what it said: at one rate and through changes of rate', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const r = new Rng(seed * 104729);
      const start = r.range(0, 1e6);
      const f0 = r.range(0.05, 1);
      const once = newItem('tx_berry', { n: 3, t0: start, fresh: f0 });
      const often = newItem('tx_berry', { n: 3, t0: start, fresh: f0 });
      let now = start;
      let rate = 1;
      // what it ought to be, worked out apart: so much off for each stretch at its rate
      let want = f0;
      for (let step = 0; step < 300; step++) {
        const dt = r.range(0, 0.4 * H);
        now += dt;
        want = Math.max(0, want - (dt / (24 * H)) * rate);
        // the one is brought up to date all the time (and asked again at earlier times, which changes nothing) …
        for (let k = r.int(4); k > 0; k--) rebaseFresh(often, now);
        if (r.chance(0.2)) rebaseFresh(often, now - r.range(0, 5 * H));
        if (r.chance(0.2)) setFreshRate(often, now, rate);
        // … the other only when its rate changes
        if (r.chance(0.15)) {
          rate = r.pick([0, 0.25, 0.5, 1, 1, 2]);
          setFreshRate(once, now, rate);
          setFreshRate(often, now, rate);
        }
        expect(freshNow(often, now), `seed ${seed} step ${step}`).toBeCloseTo(want, 9);
        expect(freshNow(once, now), `seed ${seed} step ${step}`).toBeCloseTo(want, 9);
        expect((once.fk ?? 1) === rate && (often.fk ?? 1) === rate).toBe(true);
      }
      // (the rate of the open air is written as no rate at all)
      setFreshRate(once, now, 1);
      expect('fk' in once).toBe(false);
    }
  });

  it('the same through boxes, merges and splits as when every thing is brought up to date at every step', () => {
    // two worlds are put through the same things; in the second everything that has started is brought up
    // to date after every step. They must stay the same thing for thing, as fresh as each other.
    const KINDS = ['tx_berry', 'tx_berry', 'tx_fade', 'tx_mush', 'tx_nut'];
    let compared = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const run = (often: boolean): { things: ItemInstance[]; now: number } => {
        const r = new Rng(seed * 15485863);
        const free: ItemInstance[] = [];
        const boxes = [newItem('tx_basket'), newItem('tx_cool'), newItem('tx_basket')];
        let now = 1000;
        const all = (): ItemInstance[] => [...free, ...boxes.flatMap((b) => b.inside ?? [])];
        for (let step = 0; step < 300; step++) {
          const op = r.int(100);
          if (op < 20 || free.length < 2) {
            const id = r.pick(KINDS);
            const n = 1 + r.int(stackMax(id));
            free.push(newItem(id, { ...(n > 1 ? { n } : {}), ...(itemDef(id).perish ? { t0: now, fresh: r.range(0.3, 1) } : {}) }));
          } else if (op < 38) {
            const a = r.pick(free);
            const b = r.pick(free);
            if (mergeStacks(a, b, now) === 0) free.splice(free.indexOf(b), 1);
          } else if (op < 46) {
            const a = r.pick(free);
            const part = splitStack(a, 1 + r.int(countOf(a)));
            if (part) free.push(part);
          } else if (op < 66) {
            const x = r.pick(free);
            if (putInside(r.pick(boxes), x, now) === 0) free.splice(free.indexOf(x), 1);
          } else if (op < 80) {
            const box = r.pick(boxes);
            const out = takeInside(box, r.int((box.inside?.length ?? 0) + 1), now, r.chance(0.5) ? undefined : 1 + r.int(4));
            if (out) free.push(out);
          } else if (op < 86) settleItem(r.pick(all()), now);
          else now += r.range(0, 3 * H);
          if (often) for (const x of all()) if (x.t0 !== undefined) for (let k = 0; k < 2; k++) rebaseFresh(x, now);
        }
        return { things: all(), now };
      };
      const a = run(false);
      const b = run(true);
      expect(b.things.map((x) => itemSig(x)), `seed ${seed}`).toEqual(a.things.map((x) => itemSig(x)));
      for (let i = 0; i < a.things.length; i++) {
        for (const at of [a.now, a.now + 2 * H, a.now + 40 * H]) {
          expect(freshNow(b.things[i], at), `seed ${seed}: ${a.things[i].item} #${i}`).toBeCloseTo(freshNow(a.things[i], at), 9);
          compared++;
        }
        expect(b.things[i].fk).toBe(a.things[i].fk);
      }
    }
    expect(compared).toBeGreaterThan(1000);
  });

  it('in and out of boxes: so much off for every stretch at the rate of where it lay', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = new Rng(seed * 32452843);
      const boxes = [newItem('tx_basket'), newItem('tx_cool')];
      const rates = [0.5, 0];
      let x = newItem('tx_berry', { n: 4, t0: 0 });
      let where = -1;
      let now = 0;
      let want = 1;
      for (let step = 0; step < 60; step++) {
        const dt = r.range(0, 1.5 * H);
        now += dt;
        want = Math.max(0, want - (dt / (24 * H)) * (where < 0 ? 1 : rates[where]));
        if (where < 0 && r.chance(0.5)) {
          where = r.int(2);
          expect(putInside(boxes[where], x, now)).toBe(0);
        } else if (where >= 0 && r.chance(0.5)) {
          x = takeInside(boxes[where], 0, now)!;
          where = -1;
        }
        expect(freshNow(x, now), `seed ${seed} step ${step}`).toBeCloseTo(want, 9);
        expect(x.fk ?? 1).toBe(where < 0 ? 1 : rates[where]);
      }
    }
  });

  it('a turned thing becomes what its kind says, counted from the moment it turned, whenever one looks', () => {
    // berries that turned at 24 h, looked at at 30 h and at 33 h: the mush is as old either way
    const early = newItem('tx_berry', { n: 5, t0: 0, q: 4, tint: 0x334455, opened: true, state: { picked: 'by the road' } as ItemInstance['state'] });
    const late = newItem('tx_berry', { n: 5, t0: 0 });
    expect(settleItem(early, 23.9 * H)).toBe(false);
    expect(early.item).toBe('tx_berry');
    expect(settleItem(early, 30 * H)).toBe(true);
    // (the same thing, the same count, nothing else of what it was)
    expect(early).toEqual({ uid: early.uid, item: 'tx_mush', n: 5, fresh: 1, t0: 24 * H });
    expect(settleItem(early, 30 * H)).toBe(false);
    expect(settleItem(late, 33 * H)).toBe(true);
    expect(late.t0).toBe(24 * H);
    expect(freshNow(early, 33 * H)).toBe(freshNow(late, 33 * H));
    expect(freshNow(late, 33 * H)).toBe(0.25);
    // mush turns too, and stays mush
    expect(turned(late, 36 * H)).toBe(true);
    expect(settleItem(late, 99 * H)).toBe(false);
    expect(late.item).toBe('tx_mush');
    // in a box it goes on at the box's rate: turned at 48 h, and what it became has gone off at that rate since
    const box = newItem('tx_basket');
    const inBox = newItem('tx_berry', { n: 2, t0: 0 });
    putInside(box, inBox, 0);
    expect(settleItem(inBox, 47 * H)).toBe(false);
    expect(settleItem(inBox, 54 * H)).toBe(true);
    expect(inBox).toMatchObject({ item: 'tx_mush', t0: 48 * H, fk: 0.5 });
    expect(freshNow(inBox, 54 * H)).toBe(0.75);
    expect(itemSig(box)).toBe('tx_basket[tx_mush*2]');
    // where nothing goes off, nothing turns
    const cool = newItem('tx_cool');
    const kept = newItem('tx_berry', { t0: 0 });
    putInside(cool, kept, 0);
    expect(settleItem(kept, 1e9)).toBe(false);
    // one that was turned before it ever started has no moment: what it becomes has not started either
    const never = newItem('tx_berry', { fresh: 0 });
    expect(settleItem(never, 5 * H)).toBe(true);
    expect(never).toEqual({ uid: never.uid, item: 'tx_mush', fresh: 1 });
    // brought up to date after it turned, as often as one likes, in and out of a box: the moment it ran out stays
    const moved = newItem('tx_berry', { n: 3, t0: 0 });
    rebaseFresh(moved, 30 * H);
    expect(moved).toMatchObject({ fresh: 0, t0: 24 * H });
    rebaseFresh(moved, 31 * H);
    expect(putInside(cool, moved, 32 * H)).toBe(0);
    expect(takeInside(cool, 1, 35 * H)).toBe(moved);
    expect(moved).toMatchObject({ fresh: 0, t0: 24 * H });
    expect(settleItem(moved, 35 * H)).toBe(true);
    expect(moved).toEqual({ uid: moved.uid, item: 'tx_mush', n: 3, fresh: 1, t0: 24 * H });
    // two turned stacks made one ran out at the mean of their moments, by count: the same mush as when each
    // is settled first and the two are put together after
    const mergedFirst = newItem('tx_berry', { n: 2, t0: 0 });
    expect(mergeStacks(mergedFirst, newItem('tx_berry', { n: 6, t0: 2 * H }), 29 * H)).toBe(0);
    expect(mergedFirst).toMatchObject({ n: 8, fresh: 0, t0: 25.5 * H });
    expect(settleItem(mergedFirst, 30 * H)).toBe(true);
    const settledFirst = newItem('tx_berry', { n: 2, t0: 0 });
    const second = newItem('tx_berry', { n: 6, t0: 2 * H });
    expect([settleItem(settledFirst, 30 * H), settleItem(second, 30 * H)]).toEqual([true, true]);
    expect(mergeStacks(settledFirst, second, 30 * H)).toBe(0);
    for (const at of [30 * H, 33 * H]) expect(freshNow(mergedFirst, at)).toBeCloseTo(freshNow(settledFirst, at), 12);
    expect(freshNow(mergedFirst, 30 * H)).toBeCloseTo(0.625, 12);
    // a kind that says nothing stays what it is, turned
    const mush = newItem('tx_mush', { t0: 0 });
    expect(settleItem(mush, 99 * H)).toBe(false);
    expect(turned(mush, 99 * H)).toBe(true);
    // a level of its own only as the new kind has one: a drink stays as full as it was, up to its new bottle
    const milk = newItem('tx_milk', { t0: 0, litres: 0.3, opened: true });
    expect(settleItem(milk, 50 * H)).toBe(true);
    expect(milk).toEqual({ uid: milk.uid, item: 'tx_sour', litres: 0.3 });
    const full = newItem('tx_milk', { t0: 0 });
    settleItem(full, 50 * H);
    expect(full.litres).toBe(0.5);
    const odd = newItem('tx_berry', { t0: 0, litres: 2, uses: 3 });
    settleItem(odd, 50 * H);
    expect('litres' in odd || 'uses' in odd).toBe(false);
  });
});

// ------------------------------------------------------------------ reading a thing back

/** a thing as the rest of the code may take it for granted */
function soundness(x: ItemInstance, inner = false): string[] {
  const bad: string[] = [];
  const d = hasItem(x.item) ? itemDef(x.item) : null;
  if (!d) return [`kind ${x.item}`];
  if (typeof x.uid !== 'string') bad.push('uid');
  if (x.n !== undefined && !(Number.isInteger(x.n) && x.n >= 2 && x.n <= MAX_COUNT)) bad.push(`n ${x.n}`);
  if (x.n !== undefined && d.holds) bad.push('a box with a count');
  if (x.litres !== undefined && !(d.drink && x.litres >= 0 && x.litres <= d.drink.litres)) bad.push(`litres ${x.litres}`);
  const full = d.gear?.uses ?? d.gear?.points;
  if (x.uses !== undefined && !(full !== undefined && x.uses >= 0 && x.uses <= full)) bad.push(`uses ${x.uses}`);
  if (x.tint !== undefined && !(Number.isInteger(x.tint) && x.tint >= 0 && x.tint <= 0xffffff)) bad.push(`tint ${x.tint}`);
  if (x.opened !== undefined && typeof x.opened !== 'boolean') bad.push('opened');
  if (d.perish) {
    if (!(typeof x.fresh === 'number' && x.fresh >= 0 && x.fresh <= 1)) bad.push(`fresh ${x.fresh}`);
    if (x.t0 !== undefined && !Number.isFinite(x.t0)) bad.push(`t0 ${x.t0}`);
    if (x.fk !== undefined && !(Number.isFinite(x.fk) && x.fk >= 0 && x.fk !== 1)) bad.push(`fk ${x.fk}`);
  } else if (x.fresh !== undefined || x.t0 !== undefined || x.fk !== undefined) bad.push('freshness on a thing that does not go off');
  if (x.q !== undefined && !(Number.isInteger(x.q) && x.q >= 1 && x.q <= 5)) bad.push(`q ${x.q}`);
  if (x.state !== undefined && (x.state === null || typeof x.state !== 'object' || Array.isArray(x.state))) bad.push('state');
  if (x.inside !== undefined) {
    if (!d.holds || inner) bad.push('things in a thing that holds none');
    else if (!Array.isArray(x.inside) || !x.inside.length) bad.push('an empty or broken list');
    else for (const y of x.inside) bad.push(...soundness(y, true).map((b) => `inside: ${b}`));
  }
  return bad;
}

describe('items: reading a thing back from a save', () => {
  const clean = (raw: unknown): [ItemInstance | null, number] => {
    const loss = { unknown: 0 };
    return [cleanItem(raw, loss), loss.unknown];
  };

  it('leaves a sound thing exactly as it is', () => {
    const things = [
      newItem('food_chips'),
      newItem('drink_water', { litres: 0.75, opened: true }),
      newItem('hammer_2', { uses: 4 }),
      newItem('repair_1', { uses: 122.5 }),
      newItem('wear_jacket', { tint: 0x336699 }),
      newItem('tx_berry', { n: 7, t0: 1234.5, fresh: 0.6, fk: 0.5, q: 3 }),
      newItem('tx_page', { n: 2, state: { page: 3, marks: [1, { deep: [true, null] }] } as ItemInstance['state'] }),
      newItem('tx_basket', { inside: [newItem('tx_berry', { n: 12, t0: 0, fk: 0.5 }), newItem('tx_nut', { n: 20 })] }),
    ];
    for (const x of things) {
      const text = JSON.stringify(x);
      const [back, lost] = clean(JSON.parse(text));
      expect(JSON.stringify(back), x.item).toBe(text);
      expect(lost).toBe(0);
      expect(soundness(back!)).toEqual([]);
      // (and in place: what comes back is what went in)
      const [same] = clean(x);
      expect(same).toBe(x);
    }
  });

  it('a count: used up is gone, no number is one, a fraction is rounded down, too many is the most there may be', () => {
    const of = (n: unknown, item = 'tx_nut'): ItemInstance | null => clean({ uid: 'i1', item, n })[0];
    // a stack used up never comes back as one thing
    for (const n of [0, -1, -3.5, 0.5, 0.999, -Infinity, -0]) expect(of(n), String(n)).toBeNull();
    for (const n of [0, -1]) expect(clean({ uid: 'i1', item: 'tx_nut', n })[1]).toBe(0);
    // no number at all: one thing
    for (const n of ['5', null, true, {}, [3], NaN]) expect(of(n), String(n)).toEqual({ uid: 'i1', item: 'tx_nut' });
    expect(of(1)).toEqual({ uid: 'i1', item: 'tx_nut' });
    expect(of(2)!.n).toBe(2);
    expect(of(2.9)!.n).toBe(2);
    expect(of(1.9)).toEqual({ uid: 'i1', item: 'tx_nut' });
    expect(of(MAX_COUNT)!.n).toBe(MAX_COUNT);
    expect(of(MAX_COUNT + 1)!.n).toBe(MAX_COUNT);
    expect(of(1e300)!.n).toBe(MAX_COUNT);
    expect(of(Infinity)!.n).toBe(MAX_COUNT);
    // over its kind's maximum, and on a kind that does not stack: kept (a build may have changed the kind)
    expect(of(60)!.n).toBe(60);
    expect(of(4, 'food_chips')!.n).toBe(4);
    // a thing that holds things is one of a kind
    expect(of(4, 'tx_basket')).toEqual({ uid: 'i1', item: 'tx_basket' });
    // used up with things in it: gone, and what it claimed to hold is counted
    expect(clean({ uid: 'i1', item: 'tx_basket', n: 0, inside: [{ uid: 'i2', item: 'tx_nut', n: 3 }] })).toEqual([null, 3]);
  });

  it('brings every other field into what its kind has', () => {
    const of = (item: string, more: Record<string, unknown>): Record<string, unknown> => clean({ uid: 'i1', item, ...more })[0] as unknown as Record<string, unknown>;
    // litres: a drink's, between empty and full; on anything else, gone
    expect(of('drink_water', { litres: 1.5 }).litres).toBe(1.5);
    expect(of('drink_water', { litres: -1 }).litres).toBe(0);
    expect(of('drink_water', { litres: 99 }).litres).toBe(2);
    for (const l of ['2', null, NaN, Infinity]) expect('litres' in of('drink_water', { litres: l }), String(l)).toBe(false);
    expect('litres' in of('food_chips', { litres: 1 })).toBe(false);
    // uses: a hammer's blows, a repair kit's points; on anything else, gone
    expect(of('hammer_2', { uses: 4 }).uses).toBe(4);
    expect(of('hammer_2', { uses: 400 }).uses).toBe(10);
    expect(of('hammer_2', { uses: -4 }).uses).toBe(0);
    expect(of('repair_2', { uses: 1e9 }).uses).toBe(1000);
    expect('uses' in of('hammer_2', { uses: 'many' })).toBe(false);
    expect('uses' in of('food_chips', { uses: 2 })).toBe(false);
    expect('uses' in of('tx_nut', { uses: 2 })).toBe(false);
    // colour, opened, quality
    expect(of('wear_jacket', { tint: 0xabcdef }).tint).toBe(0xabcdef);
    for (const t of [-1, 0x1000000, 1.5, 'red', null]) expect('tint' in of('wear_jacket', { tint: t }), String(t)).toBe(false);
    expect(of('drink_soda', { opened: true }).opened).toBe(true);
    for (const o of [1, 'yes', null]) expect('opened' in of('drink_soda', { opened: o }), String(o)).toBe(false);
    for (const q of [1, 5]) expect(of('tx_nut', { q }).q).toBe(q);
    for (const q of [0, 6, 2.5, '3', null, NaN]) expect('q' in of('tx_nut', { q }), String(q)).toBe(false);
    // freshness: only on a thing that goes off, there always, between turned and fresh
    expect(of('food_chips', { fresh: 0.5, t0: 3, fk: 0.5 })).toEqual({ uid: 'i1', item: 'food_chips' });
    expect(of('tx_berry', {})).toEqual({ uid: 'i1', item: 'tx_berry', fresh: 1 });
    expect(of('tx_berry', { fresh: 7 }).fresh).toBe(1);
    expect(of('tx_berry', { fresh: -7 }).fresh).toBe(0);
    for (const f of ['0.5', null, NaN, Infinity, {}]) expect(of('tx_berry', { fresh: f }).fresh, String(f)).toBe(1);
    expect(of('tx_berry', { t0: -50.5 }).t0).toBe(-50.5);
    for (const t of ['0', null, NaN, Infinity, []]) expect('t0' in of('tx_berry', { t0: t }), String(t)).toBe(false);
    for (const k of [0, 0.25, 3]) expect(of('tx_berry', { fk: k }).fk).toBe(k);
    for (const k of [1, -0.5, '0.5', null, NaN, Infinity]) expect('fk' in of('tx_berry', { fk: k }), String(k)).toBe(false);
    // state: an object of JSON, not too deep
    expect(of('tx_page', { state: { page: 3 } }).state).toEqual({ page: 3 });
    for (const s of [null, 'page 3', 3, [1, 2], true]) expect('state' in of('tx_page', { state: s }), String(s)).toBe(false);
    let deep: unknown = 1;
    for (let i = 0; i < 11; i++) deep = { in: deep };
    expect('state' in of('tx_page', { state: { deep } })).toBe(true);
    for (let i = 0; i < 5000; i++) deep = [deep];
    expect('state' in of('tx_page', { state: { deep } })).toBe(false);
    // what it does not know of is left alone (a later build's field)
    expect(of('tx_nut', { later: { a: 1 } })).toEqual({ uid: 'i1', item: 'tx_nut', later: { a: 1 } });
  });

  it('what is not a thing is nothing; a kind this build does not have is dropped and counted, with what was in it', () => {
    for (const raw of [null, undefined, 0, 7, 'food_chips', true, [], [{ uid: 'i1', item: 'food_chips' }], {}, { uid: 'i1' }, { item: 'food_chips' }, { uid: 1, item: 'food_chips' }, { uid: 'i1', item: 7 }, { uid: 'i1', item: null }]) expect(clean(raw), JSON.stringify(raw)).toEqual([null, 0]);
    expect(clean({ uid: 'i1', item: 'gone' })).toEqual([null, 1]);
    expect(clean({ uid: 'i1', item: 'gone', n: 7 })).toEqual([null, 7]);
    expect(clean({ uid: 'i1', item: 'gone', n: 0 })).toEqual([null, 0]);
    expect(clean({ uid: 'i1', item: 'gone', n: 'x' })).toEqual([null, 1]);
    expect(clean({ uid: 'i1', item: 'gone', n: 1e9 })).toEqual([null, MAX_COUNT]);
    for (const item of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', '']) expect(clean({ uid: 'i1', item }), item).toEqual([null, 1]);
    // an unknown box: it and all that was in it (things only)
    expect(clean({ uid: 'i1', item: 'gone_box', inside: [{ uid: 'i2', item: 'tx_nut', n: 5 }, { uid: 'i3', item: 'gone', n: 2 }, 'junk', null, { uid: 'i4', item: 'food_chips' }] })).toEqual([null, 9]);
  });

  it('what is inside: cleaned the same way, one level deep, only in a thing that holds things', () => {
    // an unknown kind among the contents: dropped and counted, the rest stays
    const [box, lost] = clean({
      uid: 'i1',
      item: 'tx_basket',
      inside: [{ uid: 'i2', item: 'tx_berry', n: 3, fresh: 9 }, { uid: 'i3', item: 'gone', n: 4 }, 'junk', null, 7, { uid: 'i4', item: 'tx_nut', n: 0 }, { uid: 'i5', item: 'tx_nut', n: 2, q: 9 }],
    });
    expect(box).toEqual({ uid: 'i1', item: 'tx_basket', inside: [{ uid: 'i2', item: 'tx_berry', n: 3, fresh: 1 }, { uid: 'i5', item: 'tx_nut', n: 2 }] });
    expect(lost).toBe(4);
    // all of it unknown: no list is left
    expect(clean({ uid: 'i1', item: 'tx_basket', inside: [{ uid: 'i3', item: 'gone' }] })).toEqual([{ uid: 'i1', item: 'tx_basket' }, 1]);
    for (const inside of [[], 'berries', 5, null, {}]) expect(clean({ uid: 'i1', item: 'tx_basket', inside })[0], JSON.stringify(inside)).toEqual({ uid: 'i1', item: 'tx_basket' });
    // boxes do not nest: a box in a box stays, what was in it is counted as not read back
    const nested = clean({ uid: 'i1', item: 'tx_cool', inside: [{ uid: 'i2', item: 'tx_basket', inside: [{ uid: 'i3', item: 'tx_nut', n: 6 }, { uid: 'i4', item: 'tx_cool', inside: [{ uid: 'i5', item: 'gone', n: 2 }] }] }] });
    expect(nested).toEqual([{ uid: 'i1', item: 'tx_cool', inside: [{ uid: 'i2', item: 'tx_basket' }] }, 9]);
    // a kind that holds nothing (any more) keeps nothing, and that is counted
    expect(clean({ uid: 'i1', item: 'food_chips', inside: [{ uid: 'i2', item: 'tx_nut', n: 3 }, { uid: 'i3', item: 'gone' }] })).toEqual([{ uid: 'i1', item: 'food_chips' }, 4]);
    // more than its slots, heavier than it bears, what it would not accept now: kept (it can be taken out)
    const over = clean({ uid: 'i1', item: 'tx_basket', inside: [1, 2, 3, 4, 5].map((i) => ({ uid: `i${i + 1}`, item: 'junk_tv' })) })[0]!;
    expect(over.inside!.length).toBe(5);
    expect(roomInside(over, newItem('tx_nut'), 0)).toBe(0);
    expect(takeInside(over, 4, 0)!.item).toBe('junk_tv');
  });

  it('never throws, whatever it is handed, and what it gives back is sound and stays so', () => {
    const IDS = ['food_chips', 'drink_water', 'hammer_1', 'repair_1', 'wear_jacket', 'tx_berry', 'tx_mush', 'tx_nut', 'tx_page', 'tx_milk', 'tx_basket', 'tx_cool', 'tx_sack', 'gone', 'gone_too', '__proto__', 'constructor'];
    const r = new Rng(20261118);
    const odd = (): unknown => {
      const k = r.int(22);
      return [0, 1, -1, 2, 3, 0.5, 2.5, 12, 1e9, -1e9, NaN, Infinity, -Infinity, null, undefined, true, false, '', 'x', [], {}, [1, { a: 1 }]][k];
    };
    const thing = (depth: number): unknown => {
      if (r.chance(0.08)) return odd();
      const o: Record<string, unknown> = {};
      if (!r.chance(0.04)) o.uid = r.chance(0.05) ? odd() : `i${r.int(50).toString(36)}`;
      if (!r.chance(0.04)) o.item = r.chance(0.05) ? odd() : r.pick(IDS);
      for (const f of ['n', 'litres', 'uses', 'tint', 'opened', 'fresh', 't0', 'fk', 'q', 'state']) if (r.chance(0.4)) o[f] = r.chance(0.5) ? odd() : f === 'state' ? { page: r.int(3), more: r.chance(0.3) ? [odd(), { deep: odd() }] : undefined } : f === 'opened' ? r.chance(0.5) : f === 'n' ? r.int(30) : r.range(-0.5, 3);
      if (r.chance(depth < 4 ? 0.45 : 0)) o.inside = r.chance(0.1) ? odd() : Array.from({ length: r.int(5) }, () => thing(depth + 1));
      return o;
    };
    let kept = 0;
    let dropped = 0;
    let lostAll = 0;
    for (let i = 0; i < 6000; i++) {
      const raw = thing(0);
      // as a save's text gives it back, and as it stands (a NaN, an undefined)
      for (const form of [0, 1]) {
        let input: unknown = raw;
        if (form === 0) {
          const text = JSON.stringify(raw);
          input = text === undefined ? undefined : JSON.parse(text);
        }
        const loss = { unknown: 0 };
        let out: ItemInstance | null = null;
        expect(() => void (out = cleanItem(input, loss)), JSON.stringify(raw)).not.toThrow();
        expect(Number.isInteger(loss.unknown) && loss.unknown >= 0, `loss ${loss.unknown}`).toBe(true);
        lostAll += loss.unknown;
        const x = out as ItemInstance | null;
        if (!x) {
          dropped++;
          continue;
        }
        kept++;
        expect(soundness(x), JSON.stringify(raw)).toEqual([]);
        // sound things can be handled: none of this throws
        expect(() => {
          itemMass(x);
          salvageOf(x);
          itemName(x);
          itemSig(x);
          freshNow(x, 5000);
          stampFresh(x, 5000);
          settleItem(x, 1e7);
          forEachItem(x, (y) => void canStack(y, x, 5000));
          roomInside(x, newItem('tx_nut'), 0);
        }).not.toThrow();
        // cleaned again, written and read again: the same, and nothing more is lost
        const text = JSON.stringify(x);
        const again = { unknown: 0 };
        expect(JSON.stringify(cleanItem(JSON.parse(text), again))).toBe(text);
        expect(again.unknown).toBe(0);
      }
    }
    expect(kept).toBeGreaterThan(3000);
    expect(dropped).toBeGreaterThan(1000);
    expect(lostAll).toBeGreaterThan(1000);
  });

  it('stands what no save could hold: a thing that cannot be changed, a box that holds itself, a loss that is no count', () => {
    expect(clean(Object.freeze({ uid: 'i1', item: 'food_chips', fresh: 1 }))).toEqual([null, 0]);
    const self: Record<string, unknown> = { uid: 'i1', item: 'tx_cool' };
    self.inside = [self, { uid: 'i2', item: 'tx_nut', n: 2 }];
    const loss = { unknown: 0 };
    const out = cleanItem(self, loss)!;
    expect(out.inside!.map((x) => x.uid)).toEqual(['i2']);
    expect(() => itemMass(out)).not.toThrow();
    expect(() => cleanItem({ uid: 'i1', item: 'gone' }, null as unknown as { unknown: number })).not.toThrow();
    const getter = { uid: 'i1', item: 'tx_nut' };
    Object.defineProperty(getter, 'n', { get: () => { throw new Error('no'); }, enumerable: true });
    expect(() => cleanItem(getter, loss)).not.toThrow();
  });
});

// ------------------------------------------------------------------ uids

describe('items: uids', () => {
  const num = (x: ItemInstance): number => parseInt(x.uid.slice(1), 36);

  it('new things are numbered past everything reserved, and a split is a new thing', () => {
    const a = newItem('tx_nut', { n: 4 });
    expect(a.uid).toMatch(/^i[0-9a-z]+$/);
    const far = num(a) + 5000;
    reserveItemUids([`i${far.toString(36)}`, `i${(far - 7).toString(36)}`, 'i1', 'x999999', '', 'i', 'I9', 'i-5', 'i1.5', 7 as unknown as string]);
    const b = newItem('tx_nut');
    expect(num(b)).toBe(far + 1);
    const c = splitStack(a, 1)!;
    expect(num(c)).toBe(far + 2);
    // reserving what is behind changes nothing
    reserveItemUids(['i2', a.uid]);
    expect(num(newItem('tx_nut'))).toBe(far + 3);
  });

  it('a uid whose number no counter could reach is passed over: the counter goes on counting', () => {
    const before = num(newItem('tx_nut'));
    reserveItemUids(['izzzzzzzzzzzzzzzzzzzzzzzz', `i${'z'.repeat(400)}`, `i${(2 ** 53).toString(36)}`, `i${Number.MAX_SAFE_INTEGER.toString(36)}`]);
    const a = newItem('tx_nut');
    const b = newItem('tx_nut');
    expect(num(a)).toBe(before + 1);
    expect(num(b)).toBe(before + 2);
    expect(a.uid).not.toBe(b.uid);
  });
});

// ------------------------------------------------------------------ what the prompt asks every frame

// This test stands last on purpose: by now every function above has been handed things with every set of
// fields, in every order, some with fields deleted, as the game hands them things. It is the hard case.
describe('items: what is asked every frame allocates nothing of its own', () => {
  it('accepts, roomInside, canStack, freshNow, itemMass, countOf, stackMax, hasTag', () => {
    const sink = new Float64Array(2);
    const hits = new Int32Array(2);
    // the world's time as a caller holds it: in whole seconds (`clock`), and with a fraction (`frac`)
    const clock = { now: 5000 };
    const frac = { now: 5000.5 };
    const basket = newItem('tx_basket');
    putInside(basket, newItem('tx_berry', { n: 12, t0: 0 }), 0);
    putInside(basket, newItem('tx_nut', { n: 17 }), 0);
    const full = newItem('tx_basket');
    for (let i = 0; i < 3; i++) putInside(full, newItem('tx_nut', { n: 20 - i }), 0);
    // (three stacks too far apart in freshness to be one)
    const fullOfBerries = newItem('tx_basket');
    for (let i = 0; i < 3; i++) putInside(fullOfBerries, newItem('tx_berry', { n: 3, t0: 0, fresh: 1 - 0.3 * i }), 0);
    const cool = newItem('tx_cool');
    putInside(cool, newItem('tx_page', { n: 2, state: { page: 3, marks: [1, 2, { deep: true }] } as ItemInstance['state'] }), 0);
    for (const id of ['food_chips', 'tx_jerky', 'tx_nut']) putInside(cool, newItem(id), 0);
    const berries = newItem('tx_berry', { n: 5, t0: 100.25 });
    const others = newItem('tx_berry', { n: 3, t0: 2000.75 });
    const nuts = newItem('tx_nut', { n: 9 });
    const pageA = newItem('tx_page', { n: 2, state: { page: 3, marks: [1, 2, { deep: true }] } as ItemInstance['state'] });
    const pageB = newItem('tx_page', { n: 1, state: { marks: [1, 2, { deep: true }], page: 3 } as ItemInstance['state'] });
    const chips = newItem('food_chips');
    const berry = itemDef('tx_berry');
    // (the questions have answers: none of them is asked of nothing)
    expect([roomInside(basket, berries, 5000), roomInside(full, nuts, 5000), roomInside(fullOfBerries, berries, 5000), roomInside(cool, pageB, 5000)]).toEqual([4, 3, 5, 1]);
    expect([canStack(berries, others, 5000), canStack(pageA, pageB, 5000), accepts(basket, berries)]).toEqual([true, true, true]);

    /** bytes a call that a question leaves on the heap, asked at a time that moves on with every call */
    const left = (ask: () => void, tick: () => void): number =>
      heapGrowth(() => {
        tick();
        ask();
      }) / HEAP_RUNS;
    const whole = (): void => void (clock.now = (clock.now + 1) & 0xffff);
    const fraction = (): void => void (frac.now += 0.016);
    const said: string[] = [];

    // What reads no fraction out of a thing leaves nothing at all: kinds, tags, counts, states, weights (a
    // kind's weight is looked up beside the catalogue, sums are kept in a slot of an array).
    const nothing: [string, () => void][] = [
      ['accepts by tag', () => void (hits[0] += accepts(basket, berries) ? 1 : 0)],
      ['accepts refused', () => void (hits[0] += accepts(basket, chips) ? 1 : 0)],
      ['accepts anything', () => void (hits[0] += accepts(cool, chips) ? 1 : 0)],
      ['roomInside with a free slot and a weight', () => void (hits[1] += roomInside(basket, berries, clock.now))],
      ['roomInside onto stacks, no slot free', () => void (hits[1] += roomInside(full, nuts, clock.now))],
      ['roomInside of things with a state, no slot free', () => void (hits[1] += roomInside(cool, pageB, clock.now))],
      ['canStack of things with a state', () => void (hits[0] += canStack(pageA, pageB, clock.now) ? 1 : 0)],
      ['canStack refused', () => void (hits[0] += canStack(nuts, chips, clock.now) ? 1 : 0)],
      ['countOf and stackMax', () => void (hits[1] += countOf(nuts) + stackMax(nuts.item))],
      ['hasTag', () => void (hits[0] += hasTag(berry, 'fruit') ? 1 : 0)],
    ];
    for (const [what, ask] of nothing) {
      const bytes = left(ask, whole);
      said.push(`${what} ${Math.max(0, bytes).toFixed(0)}`);
      expect(bytes * HEAP_RUNS, what).toBeLessThan(ALLOCATES / 4);
    }

    // What reads or answers with a fraction leaves nothing of its own either, but the engine may: a fraction
    // that goes into or comes out of a call it has not folded into the caller is put on the heap (16 bytes:
    // "the door"), and so is a fractional field of a thing (fresh, t0, fk, litres) read at a place in the code
    // that has seen things of more than four shapes — which, in a game whose things carry different fields,
    // is every place. Each question is held to the numbers it reads, and what the first version left on top
    // of that (a number for every thing in a box weighed, a text for every state compared) would not pass.
    const NUMBER = 16;
    const numbers: [string, number, () => void, () => void][] = [
      ['itemMass of a stack', 1, () => void (sink[1] += itemMass(berries)), whole],
      ['itemMass of a box with things in it', 1, () => void (sink[1] += itemMass(full)), whole],
      ['insideMass', 1, () => void (sink[1] += insideMass(full)), whole],
      ['freshNow', 4, () => void (sink[0] += freshNow(berries, frac.now)), fraction],
      ['freshNow of what is in a box', 4, () => void (sink[0] += freshNow(basket.inside![0], frac.now)), fraction],
      ['canStack of things that go off', 6, () => void (hits[0] += canStack(berries, others, clock.now) ? 1 : 0), whole],
      ['canStack at a fraction of a second', 7, () => void (hits[0] += canStack(berries, others, frac.now) ? 1 : 0), fraction],
      ['roomInside onto three stacks that go off, no slot free', 18, () => void (hits[1] += roomInside(fullOfBerries, berries, clock.now)), whole],
      ['roomInside at a fraction of a second', 19, () => void (hits[1] += roomInside(fullOfBerries, berries, frac.now)), fraction],
    ];
    for (const [what, most, ask, tick] of numbers) {
      const bytes = left(ask, tick);
      said.push(`${what} ${Math.max(0, bytes).toFixed(0)}`);
      expect(bytes, what).toBeLessThan(most * NUMBER + 8);
    }
    console.log(`[v3 items] bytes a call left on the heap by what a frame asks, after things of every shape: ${said.join('; ')}`);

    // (and the measure does see an allocation where there is one: the recycler's sum is a new object every time)
    let keep: unknown = null;
    expect(heapGrowth(() => void (keep = salvageOf(nuts)))).toBeGreaterThan(ALLOCATES);
    void keep;
    expect(hits[0] + hits[1] + sink[0] + sink[1]).toBeGreaterThan(0);
  });
});
