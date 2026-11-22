// The kitchen, step 3 (docs/V3/plan/cooking.md §4, §5), in its rules: a stove that burns a canister of gas, the vessel
// on it and what is in the vessel, the board, the seasonings, dishing up — and the recipe book.
import { describe, expect, it } from 'vitest';
import { itemDef, newItem, type ItemInstance } from '../../src/core/modcar/items';
import { asksFor, cleanBook, comboKey, FAILS_KEPT, fillBook, hintOf, knownFail, knows, newBook, note, pinned, tally, togglePin } from '../../src/core/v3/kitchen/book';
import { POT_MAX } from '../../src/core/v3/kitchen/cook';
import { DISH, DISHES } from '../../src/core/v3/kitchen/dishes';
import { BOARD, BOWL, dishItem, GAS, GAS_FULL, PLATE, SPICE, STOVE, VESSEL } from '../../src/core/v3/kitchen/items';
import {
  addLack, addPortion, asksStir, bandsOf, boardLack, boardPut, boardTake, canister, chop, CHOPS, COOK_S, cutShare, dishUp, emptyPot, fireOf, gasOf, GAS_LOW,
  hasCanister, kitKind, kitOf, loadCanister, nextSeasoning, outcomeOf, phaseOf, potOf, putVessel, ready, removePortion, seasonPot, servingsLeft, setFire,
  stir, stoveStep, takeCanister, takeVessel, toss, TOSSES, vesselOf, wayOf, type StoveTick,
} from '../../src/core/v3/kitchen/kit';
import { SEASONINGS } from '../../src/core/v3/kitchen/pantry';
import '../../src/game/modcar/v3/kitchen/index';

const tick = (): StoveTick => ({ burning: false, ranOut: false, before: null, after: null, asked: false });

/** a stove with a full canister and a vessel on it */
function stoveWith(vessel: string, ...ids: string[]): ItemInstance {
  const stove = newItem(STOVE);
  loadCanister(stove, newItem(GAS));
  putVessel(stove, newItem(vessel));
  for (const id of ids) addPortion(stove, id.startsWith('*') ? { id: id.slice(1), cut: 1 } : { id });
  return stove;
}

/** the flame on high for so many seconds, in frames */
function burn(stove: ItemInstance, seconds: number, level: 1 | 2 = 2): StoveTick[] {
  setFire(stove, level);
  const out: StoveTick[] = [];
  for (let t = 0; t < seconds - 1e-9; t += 1 / 30) out.push({ ...stoveStep(stove, 1 / 30, tick()) });
  return out;
}

describe('the kitchen: its things', () => {
  it('knows what each is', () => {
    expect(kitKind(STOVE)).toBe('stove');
    expect(kitKind(GAS)).toBe('gas');
    expect(kitKind(BOARD)).toBe('board');
    expect(kitKind(PLATE)).toBe('ware');
    expect(kitKind(BOWL)).toBe('ware');
    expect(kitKind(SPICE)).toBe('spice');
    for (const v of Object.values(VESSEL)) expect(kitKind(v), v).toBe('vessel');
    expect(kitKind('junk_tv')).toBeNull();
    expect(kitKind('ing_tomato')).toBeNull();
  });
});

describe('the stove and its gas', () => {
  it('lights only with gas in it', () => {
    const stove = newItem(STOVE);
    expect(hasCanister(stove)).toBe(false);
    expect(gasOf(stove)).toBe(-1);
    expect(setFire(stove, 2)).toBe('nocan');
    expect(fireOf(stove)).toBe(0);
    // (asked and refused: it is still a stove with nothing to say of itself)
    expect(stove.state).toBeUndefined();
    expect(loadCanister(stove, canister(0))).toBeNull();
    expect(setFire(stove, 2)).toBe('empty');
    const empty = loadCanister(stove, newItem(GAS));
    expect(empty && gasOf(empty)).toBe(0);
    expect(gasOf(stove)).toBe(GAS_FULL);
    expect(setFire(stove, 2)).toBeNull();
    expect(fireOf(stove)).toBe(2);
    expect(setFire(stove, 0)).toBeNull();
    expect(fireOf(stove)).toBe(0);
  });

  it('burns a canister in forty minutes of a high flame, eighty of a low one', () => {
    expect(GAS_FULL).toBe(2400);
    const stove = newItem(STOVE);
    loadCanister(stove, newItem(GAS));
    setFire(stove, 2);
    const t = tick();
    for (let i = 0; i < 600; i++) stoveStep(stove, 1, t);
    expect(gasOf(stove)).toBeCloseTo(GAS_FULL - 600, 6);
    setFire(stove, 1);
    for (let i = 0; i < 600; i++) stoveStep(stove, 1, t);
    expect(gasOf(stove)).toBeCloseTo(GAS_FULL - 900, 6);
    expect(t.burning).toBe(true);
  });

  it('goes out when the canister is empty, and gives the canister back as it is', () => {
    const stove = newItem(STOVE);
    loadCanister(stove, canister(3));
    setFire(stove, 2);
    const t = tick();
    let out = 0;
    for (let i = 0; i < 10; i++) if (stoveStep(stove, 0.5, t).ranOut) out++;
    expect(out).toBe(1);
    expect(fireOf(stove)).toBe(0);
    expect(gasOf(stove)).toBe(0);
    expect(GAS_LOW).toBeGreaterThan(10);
    const can = takeCanister(stove)!;
    expect(can.item).toBe(GAS);
    expect(gasOf(can)).toBe(0);
    expect(hasCanister(stove)).toBe(false);
    expect(takeCanister(stove)).toBeNull();
    // a full one taken out again is a new one: it says nothing of itself
    loadCanister(stove, newItem(GAS));
    expect(takeCanister(stove)!.state).toBeUndefined();
  });

  it('puts the flame out when the canister is changed', () => {
    const stove = stoveWith(VESSEL.fry, 'egg');
    setFire(stove, 2);
    const old = loadCanister(stove, canister(100))!;
    expect(gasOf(old)).toBe(GAS_FULL);
    expect(fireOf(stove)).toBe(0);
    expect(gasOf(stove)).toBe(100);
  });
});

describe('a vessel on the stove', () => {
  it('goes on and comes off with what is in it', () => {
    const pan = newItem(VESSEL.fry);
    addPortion(pan, { id: 'onion', cut: 1 });
    const stove = newItem(STOVE);
    expect(putVessel(stove, pan)).toBe(true);
    expect(vesselOf(stove)).toBe(VESSEL.fry);
    expect(wayOf(stove)).toBe('fry');
    expect(potOf(stove)?.items).toEqual([{ id: 'onion', cut: 1 }]);
    // one at a time
    expect(putVessel(stove, newItem(VESSEL.boil))).toBe(false);
    const off = takeVessel(stove)!;
    expect(off.item).toBe(VESSEL.fry);
    expect(potOf(off)?.items).toEqual([{ id: 'onion', cut: 1 }]);
    expect(vesselOf(stove)).toBeNull();
    expect(stove.state).toBeUndefined();
    expect(takeVessel(stove)).toBeNull();
  });

  it('is no place for a bowl, which has no use for a flame', () => {
    const stove = newItem(STOVE);
    expect(putVessel(stove, newItem(VESSEL.mix))).toBe(false);
    expect(putVessel(stove, newItem(PLATE))).toBe(false);
    for (const way of ['fry', 'boil', 'grill', 'steam', 'bake', 'brew'] as const) {
      const s = newItem(STOVE);
      expect(putVessel(s, newItem(VESSEL[way])), way).toBe(true);
      expect(wayOf(s)).toBe(way);
    }
  });

  it('takes five portions and no more, and gives the last back while it is raw', () => {
    const pan = newItem(VESSEL.fry);
    for (let i = 0; i < POT_MAX; i++) expect(addPortion(pan, { id: 'tomato' })).toBe(true);
    expect(addLack(pan)).toBe('full');
    expect(addPortion(pan, { id: 'egg' })).toBe(false);
    expect(removePortion(pan)).toEqual({ id: 'tomato' });
    expect(potOf(pan)?.items.length).toBe(POT_MAX - 1);
    expect(addLack(newItem(PLATE))).toBe('novessel');
    // emptied, it is a pan like any other
    emptyPot(pan);
    expect(pan.state).toBeUndefined();
    expect(removePortion(pan)).toBeNull();
    expect(pan.state).toBeUndefined();
  });
});

describe('cooking over the flame', () => {
  it('comes to just right in the vessel\'s own time on a high flame, twice that on a low one', () => {
    for (const way of ['fry', 'boil', 'grill', 'steam', 'bake', 'brew'] as const) {
      const hi = stoveWith(VESSEL[way], 'potato');
      burn(hi, COOK_S[way]);
      expect(potOf(hi)!.done, way).toBeCloseTo(1, 1);
      expect(phaseOf(hi), way).toBe('right');
      const lo = stoveWith(VESSEL[way], 'potato');
      burn(lo, COOK_S[way], 1);
      expect(potOf(lo)!.done, way).toBeCloseTo(0.5, 1);
    }
  });

  it('cooks what was cut a quarter faster, and a full pot a little slower', () => {
    const whole = stoveWith(VESSEL.fry, 'tomato');
    const cut = stoveWith(VESSEL.fry, '*tomato');
    const full = stoveWith(VESSEL.fry, 'tomato', 'tomato', 'tomato', 'tomato', 'tomato');
    for (const s of [whole, cut, full]) burn(s, 8);
    expect(potOf(cut)!.done! / potOf(whole)!.done!).toBeCloseTo(1.25, 2);
    expect(potOf(full)!.done! / potOf(whole)!.done!).toBeCloseTo(0.8, 2);
    expect(cutShare(potOf(cut)!)).toBe(1);
    expect(cutShare(potOf(whole)!)).toBe(0);
    // (what is never cut does not count against the cook: an egg and rice are as prepared as they get)
    const p = newItem(VESSEL.fry);
    addPortion(p, { id: 'egg' });
    addPortion(p, { id: 'rice' });
    expect(cutShare(potOf(p)!)).toBe(1);
    addPortion(p, { id: 'onion' });
    expect(cutShare(potOf(p)!)).toBe(0);
  });

  it('goes from raw through just right to burnt, and says when it passes from one to the next', () => {
    const stove = stoveWith(VESSEL.fry, 'potato');
    const ticks = burn(stove, 30);
    const seen: string[] = [];
    for (const t of ticks) if (t.after && seen[seen.length - 1] !== t.after) seen.push(t.after);
    expect(seen).toEqual(['raw', 'cooking', 'right', 'over', 'burnt']);
    expect(ticks.every((t) => t.burning)).toBe(true);
    expect(outcomeOf(stove).fail).toBe('burnt');
    // nothing more goes into a burnt pan
    expect(addLack(stove)).toBe('burnt');
  });

  it('asks a pan to be stirred half way, once; stirred, the band of just right is wider', () => {
    const stove = stoveWith(VESSEL.fry, 'potato');
    const narrow = bandsOf(stove);
    expect(asksStir(stove)).toBe(false);
    expect(stir(stove)).toBe(false);
    const ticks = burn(stove, 7);
    expect(ticks.filter((t) => t.asked).length).toBe(1);
    expect(asksStir(stove)).toBe(true);
    expect(stir(stove)).toBe(true);
    expect(asksStir(stove)).toBe(false);
    expect(stir(stove)).toBe(false);
    const widened = bandsOf(stove);
    expect(widened[1]).toBeLessThan(narrow[1]);
    expect(widened[2]).toBeGreaterThan(narrow[2]);
    expect(widened[3]).toBeGreaterThan(narrow[3]);
    // a pan left a fifth too long: over, had it not been stirred
    const a = stoveWith(VESSEL.fry, 'potato');
    const b = stoveWith(VESSEL.fry, 'potato');
    burn(b, 7);
    stir(b);
    burn(a, COOK_S.fry * 1.19);
    burn(b, COOK_S.fry * 1.19 - 7);
    expect(phaseOf(a)).toBe('over');
    expect(phaseOf(b)).toBe('right');
  });

  it('never asks a steamer, an oven or a kettle: under their lids they are as forgiving as a pan well stirred', () => {
    const stirred = stoveWith(VESSEL.fry, 'potato');
    burn(stirred, 7);
    stir(stirred);
    for (const way of ['steam', 'bake', 'brew'] as const) {
      const s = stoveWith(VESSEL[way], 'potato');
      const ticks = burn(s, COOK_S[way]);
      expect(ticks.some((t) => t.asked), way).toBe(false);
      expect(bandsOf(s), way).toEqual(bandsOf(stirred));
    }
  });

  it('cools when something more goes in: the doneness is shared out', () => {
    const stove = stoveWith(VESSEL.boil, 'potato');
    burn(stove, 11);
    const before = potOf(stove)!.done!;
    expect(addPortion(stove, { id: 'beef' })).toBe(true);
    expect(potOf(stove)!.done).toBeCloseTo(before / 2, 6);
    // (and only what is still raw comes out again)
    expect(removePortion(stove)).toBeNull();
  });

  it('heats nothing without a vessel, or with an empty one: only the gas goes', () => {
    const bare = newItem(STOVE);
    loadCanister(bare, newItem(GAS));
    const t = burn(bare, 5);
    expect(t[t.length - 1].before).toBeNull();
    expect(gasOf(bare)).toBeCloseTo(GAS_FULL - 5, 5);
    const empty = stoveWith(VESSEL.fry);
    burn(empty, 5);
    expect(potOf(empty)).toBeUndefined();
  });
});

describe('what comes out of the pot', () => {
  it('is the dish the things make, perfect when cut, seasoned and just right', () => {
    const plain = stoveWith(VESSEL.fry, 'tomato', 'egg');
    burn(plain, COOK_S.fry);
    const o = outcomeOf(plain);
    expect(o.dish?.id).toBe('tomato_egg');
    expect(o.perfect).toBe(false);
    const fine = stoveWith(VESSEL.fry, '*tomato', 'egg');
    expect(seasonPot(fine, 'salt')).toBe(true);
    expect(seasonPot(fine, 'salt')).toBe(false);
    expect(seasonPot(fine, 'ketchup')).toBe(false);
    burn(fine, COOK_S.fry / 1.25);
    const p = outcomeOf(fine);
    expect(p.dish?.id).toBe('tomato_egg');
    expect(p.perfect).toBe(true);
    expect(p.food).toBeGreaterThan(o.food);
  });

  it('is a failure when it is taken off too soon, left too long, or made of what no dish is made of', () => {
    const raw = stoveWith(VESSEL.fry, 'beef');
    burn(raw, 3);
    expect(outcomeOf(raw).fail).toBe('raw');
    const burnt = stoveWith(VESSEL.fry, 'beef');
    burn(burnt, 40);
    expect(outcomeOf(burnt).fail).toBe('burnt');
    const mess = stoveWith(VESSEL.fry, 'watermelon', 'tuna', 'honey');
    burn(mess, COOK_S.fry);
    expect(outcomeOf(mess).fail).toBe('mess');
  });

  it('is dished up onto a plate as a thing of its own, which says what it feeds and what it was served on', () => {
    const stove = stoveWith(VESSEL.fry, '*tomato', 'egg');
    seasonPot(stove, 'salt');
    burn(stove, COOK_S.fry / 1.25);
    expect(ready(stove)).toBe(true);
    expect(servingsLeft(stove)).toBe(1);
    const served = dishUp(stove, PLATE)!;
    expect(served.item.item).toBe(dishItem('tomato_egg'));
    expect(served.item.state?.meal).toEqual({ food: served.outcome.food, perfect: 1, ware: PLATE });
    expect(served.last).toBe(true);
    expect(served.way).toBe('fry');
    expect([...served.items].sort()).toEqual(['egg', 'tomato']);
    expect(itemDef(served.item.item).name.zh).toBe('番茄炒蛋');
    // the pan is empty and still on the stove
    expect(potOf(stove)).toBeUndefined();
    expect(vesselOf(stove)).toBe(VESSEL.fry);
    expect(dishUp(stove, PLATE)).toBeNull();
  });

  it('gives two servings from a pot of four portions or more, and nothing goes in between them', () => {
    const stove = stoveWith(VESSEL.boil, 'potato', 'beef', 'carrot', 'onion');
    burn(stove, COOK_S.boil);
    expect(servingsLeft(stove)).toBe(2);
    const a = dishUp(stove, BOWL)!;
    expect(a.outcome.dish?.id).toBe('potato_beef');
    expect(a.last).toBe(false);
    expect(servingsLeft(stove)).toBe(1);
    expect(addLack(stove)).toBe('served');
    expect(seasonPot(stove, 'salt')).toBe(false);
    const b = dishUp(stove, BOWL)!;
    expect(b.last).toBe(true);
    expect(b.item.state?.meal?.food).toBe(a.item.state?.meal?.food);
    expect(potOf(stove)).toBeUndefined();
  });

  it('gives a failed dish too: one serving, and it feeds next to nothing', () => {
    const stove = stoveWith(VESSEL.fry, 'watermelon', 'tuna', 'honey', 'rice');
    burn(stove, COOK_S.fry);
    const s = dishUp(stove, PLATE)!;
    expect(s.item.item).toBe(dishItem('mess'));
    expect(s.outcome.fail).toBe('mess');
    expect(s.last).toBe(true);
    expect(s.item.state?.meal?.food).toBeLessThan(10);
  });
});

describe('a bowl', () => {
  it('is tossed three times, with no flame, and then dished up', () => {
    const bowl = newItem(VESSEL.mix);
    expect(toss(bowl)).toBe(-1);
    expect(bowl.state).toBeUndefined();
    addPortion(bowl, { id: 'lettuce', cut: 1 });
    addPortion(bowl, { id: 'tomato', cut: 1 });
    expect(ready(bowl)).toBe(false);
    expect(dishUp(bowl, BOWL)).toBeNull();
    expect(phaseOf(bowl)).toBe('raw');
    let t = 0;
    for (let i = 0; i < TOSSES; i++) t = toss(bowl);
    expect(t).toBe(1);
    expect(ready(bowl)).toBe(true);
    const s = dishUp(bowl, BOWL)!;
    expect(s.outcome.dish?.id).toBe('salad');
    expect(bowl.state).toBeUndefined();
  });

  it('wants tossing again when something more goes in', () => {
    const bowl = newItem(VESSEL.mix);
    addPortion(bowl, { id: 'apple' });
    addPortion(bowl, { id: 'banana' });
    for (let i = 0; i < TOSSES; i++) toss(bowl);
    addPortion(bowl, { id: 'orange' });
    expect(ready(bowl)).toBe(false);
    toss(bowl);
    expect(ready(bowl)).toBe(true);
  });
});

describe('the board', () => {
  it('takes one thing that can be cut, and cuts it in three strokes', () => {
    const board = newItem(BOARD);
    expect(chop(board)).toBe(0);
    expect(board.state).toBeUndefined();
    expect(boardLack(board, { id: 'rice' })).toBe('nocut');
    expect(boardLack(board, { id: 'shrimp' })).toBe('nocut');
    expect(boardLack(board, { id: 'tomato', cut: 1 })).toBe('cutalready');
    expect(boardLack(board, { id: 'forage_whatever' })).toBe('nocut');
    expect(boardPut(board, { id: 'rice' })).toBe(false);
    expect(boardPut(board, { id: 'tomato' })).toBe(true);
    expect(boardLack(board, { id: 'onion' })).toBe('busy');
    expect(kitOf(board).food).toEqual({ id: 'tomato' });
    for (let i = 1; i < CHOPS; i++) expect(chop(board)).toBe(i);
    expect(kitOf(board).food?.cut).toBeUndefined();
    expect(chop(board)).toBe(CHOPS);
    expect(kitOf(board).food).toEqual({ id: 'tomato', cut: 1 });
    // (cut is cut)
    expect(chop(board)).toBe(0);
    expect(boardTake(board)).toEqual({ id: 'tomato', cut: 1 });
    expect(board.state).toBeUndefined();
    expect(boardTake(board)).toBeNull();
  });

  it('gives back whole what was not cut through', () => {
    const board = newItem(BOARD);
    boardPut(board, { id: 'carrot' });
    chop(board);
    expect(boardTake(board)).toEqual({ id: 'carrot' });
  });
});

describe('the seasonings', () => {
  it('are six, the next one to hand each time one has gone in', () => {
    const pan = newItem(VESSEL.fry);
    expect(nextSeasoning(pan)).toBeNull();
    addPortion(pan, { id: 'egg' });
    const seen: string[] = [];
    for (let s = nextSeasoning(pan); s; s = nextSeasoning(pan)) {
      seen.push(s.id);
      seasonPot(pan, s.id);
    }
    expect(seen).toEqual(SEASONINGS.map((s) => s.id));
    expect(itemDef(SPICE).name.zh).toBe('调料盒');
  });

  it('go over a pot once each, and not over an empty one', () => {
    const pan = newItem(VESSEL.fry);
    expect(seasonPot(pan, 'salt')).toBe(false);
    expect(pan.state).toBeUndefined();
    addPortion(pan, { id: 'egg' });
    for (const s of SEASONINGS) expect(seasonPot(pan, s.id), s.id).toBe(true);
    expect(potOf(pan)!.season?.length).toBe(6);
  });
});

describe('the recipe book', () => {
  const stove = (...ids: string[]): ReturnType<typeof dishUp> => {
    const s = stoveWith(VESSEL.fry, ...ids);
    seasonPot(s, 'salt');
    burn(s, COOK_S.fry / (1 + 0.25 * cutShare(potOf(s)!)));
    return dishUp(s, PLATE);
  };

  it('takes in what was made: the first time, the first perfect time, how often', () => {
    const book = newBook();
    const a = stove('tomato', 'egg')!;
    expect(note(book, a.way, a.items, a.outcome)).toEqual({ first: true, firstPerfect: false, newFail: false });
    const b = stove('*tomato', 'egg')!;
    expect(b.outcome.perfect).toBe(true);
    expect(note(book, b.way, b.items, b.outcome)).toEqual({ first: false, firstPerfect: true, newFail: false });
    expect(note(book, b.way, b.items, b.outcome)).toEqual({ first: false, firstPerfect: false, newFail: false });
    expect(book.made.tomato_egg).toEqual({ n: 3, p: 1 });
    expect(knows(book, 'tomato_egg')).toBe(true);
    expect(knows(book, 'steak')).toBe(false);
    const t = tally(book);
    expect(t.made).toBe(1);
    expect(t.perfect).toBe(1);
    expect(t.total).toBe(DISHES.length);
    expect(t.stars.reduce((s, x) => s + x.total, 0)).toBe(DISHES.length);
  });

  it('remembers a combination that came to nothing, whatever order it went in', () => {
    const book = newBook();
    const m = stove('watermelon', 'tuna', 'honey')!;
    expect(m.outcome.fail).toBe('mess');
    expect(note(book, m.way, m.items, m.outcome).newFail).toBe(true);
    expect(note(book, m.way, m.items, m.outcome).newFail).toBe(false);
    expect(knownFail(book, 'fry', ['honey', 'watermelon', 'tuna'])).toBe(true);
    expect(knownFail(book, 'boil', ['honey', 'watermelon', 'tuna'])).toBe(false);
    expect(knownFail(book, 'fry', ['honey', 'watermelon'])).toBe(false);
    expect(knownFail(book, 'fry', [])).toBe(false);
    expect(comboKey('fry', ['b', 'a'])).toBe('fry:a+b');
    // (a burnt pan is the heat's doing: nothing to remember of what was in it)
    const s = stoveWith(VESSEL.fry, 'tomato', 'egg');
    burn(s, 60);
    const burnt = dishUp(s, PLATE)!;
    expect(note(book, burnt.way, burnt.items, burnt.outcome).newFail).toBe(false);
    for (let i = 0; i < FAILS_KEPT + 20; i++) note(book, 'fry', [`x${i}`], m.outcome);
    expect(book.fails.length).toBe(FAILS_KEPT);
  });

  it('hints at a dish not yet made by the kinds of what it needs, never the names', () => {
    expect(hintOf(DISH.tomato_egg)).toBe('某种蔬菜 + 某种蛋，煎炒');
    expect(hintOf(DISH.fruit_salad)).toBe('某种水果 ×2，拌');
    for (const d of DISHES) {
      const h = hintOf(d);
      for (const t of d.need) if (!t.startsWith('@')) expect(h.includes(DISH[d.id].zh), d.id).toBe(false);
      expect(hintOf(d, 'en').length, d.id).toBeGreaterThan(5);
    }
  });

  it('pins one dish, and knows what that dish asks for', () => {
    const book = newBook();
    expect(pinned(book)).toBeNull();
    expect(togglePin(book, 'tomato_egg')?.id).toBe('tomato_egg');
    expect(asksFor(pinned(book)!, 'tomato')).toBe(true);
    expect(asksFor(pinned(book)!, 'wildegg')).toBe(true);
    expect(asksFor(pinned(book)!, 'beef')).toBe(false);
    expect(asksFor(pinned(book)!, 'forage_x')).toBe(false);
    expect(togglePin(book, 'steak')?.id).toBe('steak');
    expect(togglePin(book, 'steak')).toBeNull();
    expect(togglePin(book, 'no_such_dish')).toBeNull();
  });

  it('comes back sound from a save, whatever the save holds', () => {
    const book = newBook();
    fillBook(book);
    expect(tally(book).made).toBe(DISHES.length);
    expect(tally(book).perfect).toBe(0);
    fillBook(book, true);
    expect(tally(book).perfect).toBe(DISHES.length);
    togglePin(book, 'steak');
    book.fails.push('fry:a+b');
    const back = cleanBook(JSON.parse(JSON.stringify(book)));
    expect(back).toEqual(book);
    expect(cleanBook(null)).toEqual(newBook());
    expect(cleanBook({ made: { nope: { n: 3 }, steak: { n: -2 }, pizza: 'x' }, fails: [1, 'fry:x', 'fry:x'], pin: 'nope' })).toEqual({ made: { steak: { n: 1 } }, fails: ['fry:x'] });
  });
});
