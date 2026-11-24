/**
 * The kitchen's second batch and its guidance (docs/V3/plan/cooking.md §4, §5, steps 4 and 5).
 *
 * Freshness: the ingredients go off by what they are (fish in a day, meat in a day and a half, greens in two, most
 * vegetables and fruit in four, eggs and onions longer; rice, flour, noodles, beans, nuts and honey keep), a cut one
 * in a third of the time, into spoiled food that no pot takes; a dish keeps (its plate is in its state). The cooler
 * holds anything up to its weight and what is in it goes off at a quarter of the rate. The steamer stands on an empty
 * pot of water on the burner and nowhere else, and comes off it again leaving the pot; the kettle whistles once it
 * boils. The tips are said once in a book's life; a dish that came out but not perfect says what it missed; a failed
 * dish eaten says so. What a stove holds — a steamer on its pot, a half-cooked pot, its gas — comes back through the
 * save's cleaning as it was.
 */
import { describe, expect, it } from 'vitest';
import { cleanItem, freshNow, itemDef, newItem, putInside, settleItem, stampFresh } from '../../src/core/modcar/items';
import { cleanBook, firstTip, newBook } from '../../src/core/v3/kitchen/book';
import { COOLER, COOLER_DECAY, cutItem, dishItem, ingItem, keepHours, PLATE, SPOILED, STOVE, VESSEL } from '../../src/core/v3/kitchen/items';
import { addPortion, asksStir, dishUp, phaseOf, potOf, putVessel, setFire, steamLack, stir, stoveStep, takeVessel, underOf, vesselOf, wayOf, type StoveTick } from '../../src/core/v3/kitchen/kit';
import { portionOfItem } from '../../src/core/v3/kitchen/standins';
import { kitchen } from '../../src/game/modcar/v3/kitchen/index';
import { TIPS } from '../../src/game/modcar/v3/kitchen/system';
import { ALLOCATES, HEAP_RUNS, heapGrowth } from './v3/heap';
import { kitchenRig } from './v3/kitchenRig';

const H = 3600;
const tick = (): StoveTick => ({ burning: false, ranOut: false, before: null, after: null, asked: false });

/** a stove with a full canister and nothing on its burner */
function bareStove() {
  const s = newItem(STOVE, { state: { kit: { gas: 2400 } } });
  return s;
}

/** the stove brought to where its pot is just right, stirred when it asks */
function cookRight(stove: ReturnType<typeof bareStove>): void {
  const t = tick();
  setFire(stove, 2);
  for (let i = 0; i < 3000 && phaseOf(stove) !== 'right'; i++) {
    if (asksStir(stove)) stir(stove);
    stoveStep(stove, 0.05, t);
  }
}

describe('freshness and the cooler', () => {
  it('ingredients go off by what they are, a cut one sooner; what keeps keeps; a dish keeps', () => {
    expect(keepHours('salmon')).toBe(24);
    expect(keepHours('beef')).toBe(36);
    expect(keepHours('lettuce')).toBe(48);
    expect(keepHours('tomato')).toBe(96);
    expect(keepHours('potato')).toBe(336);
    for (const id of ['rice', 'flour', 'noodle', 'bean', 'walnut', 'honey']) expect(keepHours(id), id).toBeNull();
    expect(itemDef(ingItem('salmon')).perish).toEqual({ hours: 24, into: SPOILED });
    expect(itemDef(cutItem('salmon')).perish).toEqual({ hours: 8, into: SPOILED });
    expect(itemDef(ingItem('rice')).perish).toBeUndefined();
    expect(itemDef(dishItem('tomato_egg')).perish).toBeUndefined();
    expect(itemDef(dishItem('mess')).perish).toBeUndefined();
    // a salmon left out a day is spoiled food, and no pot takes it
    const fish = newItem(ingItem('salmon'));
    stampFresh(fish, 0);
    expect(freshNow(fish, 12 * H)).toBeCloseTo(0.5, 3);
    expect(settleItem(fish, 24.5 * H)).toBe(true);
    expect(fish.item).toBe(SPOILED);
    expect(portionOfItem(SPOILED)).toBeNull();
    expect(itemDef(SPOILED).perish).toBeUndefined();
  });

  it('the cooler holds anything up to its weight, and what is in it goes off at a quarter of the rate', () => {
    const d = itemDef(COOLER);
    expect(d.holds).toMatchObject({ accepts: ['*'], decay: COOLER_DECAY });
    expect(COOLER_DECAY).toBe(0.25);
    const box = newItem(COOLER);
    const kept = newItem(ingItem('salmon'), { n: 2 });
    expect(putInside(box, kept, 0)).toBe(0);
    const out = newItem(ingItem('salmon'));
    stampFresh(out, 0);
    // a day on: the one left out has turned, the two in the cooler are three quarters fresh
    expect(freshNow(out, 24 * H)).toBe(0);
    expect(freshNow(box.inside![0], 24 * H)).toBeCloseTo(0.75, 3);
    // a soda goes in too (it is a box), a cooked dish too
    expect(putInside(box, newItem('drink_soda'), 0)).toBe(0);
    expect(putInside(box, newItem(dishItem('tomato_egg'), { state: { meal: { food: 30, ware: PLATE } } }), 0)).toBe(0);
    expect(box.inside!.length).toBe(3);
  });
});

describe('the steamer and the kettle', () => {
  it('the steamer stands on an empty pot of water on the burner, and only there', () => {
    const stove = bareStove();
    expect(steamLack(stove)).toBe('nopot');
    expect(putVessel(stove, newItem(VESSEL.steam))).toBe(false);
    expect(putVessel(stove, newItem(VESSEL.boil))).toBe(true);
    expect(steamLack(stove)).toBeNull();
    // (a pot with food in it is a pot, not water)
    const full = bareStove();
    putVessel(full, newItem(VESSEL.boil));
    addPortion(full, { id: 'potato' });
    expect(steamLack(full)).toBe('potfull');
    expect(putVessel(full, newItem(VESSEL.steam))).toBe(false);
    // on the pot: the stove's vessel is the steamer, the pot under it; what goes in goes into the steamer
    expect(putVessel(stove, newItem(VESSEL.steam))).toBe(true);
    expect(vesselOf(stove)).toBe(VESSEL.steam);
    expect(underOf(stove)).toBe(VESSEL.boil);
    expect(wayOf(stove)).toBe('steam');
    expect(steamLack(stove)).toBe('taken');
    expect(putVessel(stove, newItem(VESSEL.fry))).toBe(false);
    addPortion(stove, { id: 'trout', cut: 1 });
    addPortion(stove, { id: 'ginger', cut: 1 });
    cookRight(stove);
    expect(phaseOf(stove)).toBe('right');
    // off again: the steamer with its fish, the pot stays on the burner (empty)
    const steamer = takeVessel(stove)!;
    expect(steamer.item).toBe(VESSEL.steam);
    expect(potOf(steamer)?.items.map((p) => p.id)).toEqual(['trout', 'ginger']);
    expect(vesselOf(stove)).toBe(VESSEL.boil);
    expect(underOf(stove)).toBeNull();
    expect(potOf(stove)).toBeUndefined();
    // and back on, with its fish: dished up, a steamed dish
    expect(putVessel(stove, steamer)).toBe(true);
    const served = dishUp(stove, PLATE)!;
    expect(served.way).toBe('steam');
    expect(served.outcome.fail).toBeNull();
  });

  it('in the game: the words and the ghost of a steamer, and the kettle whistling once it boils', async () => {
    kitchen.book = newBook();
    const rig = await kitchenRig();
    rig.button('摆一套厨房');
    rig.frames(2);
    const stove = rig.unit(STOVE);
    // the pan off: a steamer at the bare burner is refused, with why
    rig.empty();
    rig.aim(stove, 'top');
    rig.holdL();
    rig.empty();
    rig.give(newItem(VESSEL.steam));
    rig.aim(stove, 'top');
    expect(rig.word()).toBe('先放汤锅');
    expect(kitchen.ghosts.some((g) => g.unit === stove)).toBe(false);
    // a pot on the burner: now it goes, its ghost on the pot
    putVessel(stove.item, newItem(VESSEL.boil));
    rig.frames(2);
    rig.aim(stove, 'top');
    expect(rig.word()).toBe('架上蒸笼');
    expect(kitchen.ghosts.map((g) => `${g.slot}:${g.item}${g.focused ? '*' : ''}`)).toContain(`pot:${VESSEL.steam}*`);
    rig.pressE();
    expect(vesselOf(stove.item)).toBe(VESSEL.steam);
    expect(underOf(stove.item)).toBe(VESSEL.boil);
    // the left button held takes the steamer off, the pot stays
    rig.empty();
    rig.aim(stove, 'top');
    rig.holdL();
    expect(rig.held()?.item).toBe(VESSEL.steam);
    expect(vesselOf(stove.item)).toBe(VESSEL.boil);
    // the kettle: lemon and honey, lit, and once it boils it whistles
    rig.empty();
    takeVessel(stove.item);
    putVessel(stove.item, newItem(VESSEL.brew));
    for (const id of ['lemon', 'honey']) addPortion(stove.item, { id });
    rig.aim(stove, 'knob');
    rig.pressE();
    for (let t = 0; t < 900 && phaseOf(stove.item) !== 'right'; t++) {
      rig.frames(1, 1 / 30);
      if (asksStir(stove.item)) stir(stove.item);
    }
    expect(phaseOf(stove.item)).toBe('right');
    rig.frames(2);
    expect(rig.game.loops.get('kettle_whistle')).toBeGreaterThan(0.5);
    expect(rig.game.said.some((s) => s.startsWith('水开了，煮好了！'))).toBe(true);
    // off the flame: quiet
    rig.aim(stove, 'knob');
    rig.pressE();
    expect(rig.game.loops.has('kettle_whistle')).toBe(false);
  });
});

describe('what the kitchen costs', () => {
  it('a frame with a kitchen laid out and the stove alight allocates nothing and takes a few microseconds', async () => {
    kitchen.book = newBook();
    const rig = await kitchenRig();
    rig.button('摆一套厨房');
    rig.frames(2);
    // (an empty pan on a high flame: the gas burns, the flame's loop plays, every unit is looked at)
    setFire(rig.unit(STOVE).item, 2);
    rig.frames(2);
    expect(rig.game.loops.has('flame_gas')).toBe(true);
    const frame = (): void => rig.game.frame(1 / 60);
    const bytes = heapGrowth(frame);
    const t0 = performance.now();
    for (let i = 0; i < 4000; i++) frame();
    const us = ((performance.now() - t0) / 4000) * 1000;
    console.log(`[kitchen] a frame of the kitchen (nine pieces of cookware, a stove alight): ${us.toFixed(2)} µs, ${(bytes / HEAP_RUNS).toFixed(2)} bytes`);
    expect(bytes).toBeLessThan(ALLOCATES / 4);
    expect(us).toBeLessThan(60);
  });
});

describe('the guidance', () => {
  it('the tips are said once in a book’s life, and kept in the save', async () => {
    const b = newBook();
    expect(firstTip(b, 'start')).toBe(true);
    expect(firstTip(b, 'start')).toBe(false);
    expect(cleanBook(JSON.parse(JSON.stringify(b))).tips).toEqual(['start']);
    expect(cleanBook({ tips: [5, '', 'x'.repeat(50), 'cut', 'cut'] }).tips).toEqual(['cut']);
    kitchen.book = newBook();
    const rig = await kitchenRig();
    rig.button('摆一套厨房');
    rig.frames(4);
    expect(rig.game.said.filter((s) => s === TIPS.start).length).toBe(1);
    rig.frames(30);
    expect(rig.game.said.filter((s) => s === TIPS.start).length).toBe(1);
    // a potato into the hot pan whole: the board, once
    const stove = rig.unit(STOVE);
    rig.empty();
    rig.aim(stove, 'knob');
    rig.pressE();
    rig.give(newItem(ingItem('potato'), { n: 2 }));
    rig.aim(stove, 'top');
    rig.pressE();
    rig.frames(2);
    expect(rig.game.said.filter((s) => s === TIPS.cut).length).toBe(1);
    rig.aim(stove, 'top');
    rig.pressE();
    rig.frames(2);
    expect(rig.game.said.filter((s) => s === TIPS.cut).length).toBe(1);
    expect(kitchen.book.tips).toEqual(['start', 'cut']);
    // in the save
    const save = rig.game.saved();
    kitchen.book = newBook();
    await kitchenRig({ save });
    expect(kitchen.book.tips).toEqual(['start', 'cut']);
  });

  it('a dish that is not perfect says what it missed; a failed one eaten says so', async () => {
    // (the rules: uncut, unseasoned, taken off just right)
    const stove = bareStove();
    putVessel(stove, newItem(VESSEL.fry));
    addPortion(stove, { id: 'potato' });
    cookRight(stove);
    const served = dishUp(stove, PLATE)!;
    expect(served.outcome.perfect).toBe(false);
    expect(served.missed).toEqual(['cut', 'season']);
    // (cut and seasoned, but left on till it was a little over)
    const s2 = bareStove();
    putVessel(s2, newItem(VESSEL.fry));
    addPortion(s2, { id: 'potato', cut: 1 });
    const k = s2.state!.kit!;
    k.pot!.season = ['salt'];
    cookRight(s2);
    const t = tick();
    for (let i = 0; i < 400 && phaseOf(s2) !== 'over'; i++) stoveStep(s2, 0.05, t);
    expect(phaseOf(s2)).toBe('over');
    expect(dishUp(s2, PLATE)!.missed).toEqual(['over']);
    // in the game: the line under the dish, and a failed dish eaten
    kitchen.book = newBook();
    const rig = await kitchenRig();
    rig.button('摆一套厨房');
    rig.frames(2);
    const st = rig.unit(STOVE);
    rig.empty();
    rig.give(newItem(ingItem('potato')));
    rig.aim(st, 'top');
    rig.pressE();
    rig.aim(st, 'knob');
    rig.pressE();
    for (let i = 0; i < 900 && phaseOf(st.item) !== 'right'; i++) {
      rig.frames(1, 1 / 30);
      if (asksStir(st.item)) {
        rig.aim(st, 'top');
        rig.pressE();
      }
    }
    rig.give(newItem(PLATE));
    rig.aim(st, 'top');
    rig.pressE();
    expect(rig.game.said.at(-1)).toContain('差一点：切一切、撒点调料');
    rig.empty();
    rig.game.events.emit('body:ate', { item: newItem(dishItem('burnt'), { state: { meal: { food: 0, ware: PLATE } } }) });
    expect(rig.game.said.at(-1)).toBe('焦味……');
    expect(rig.held()?.item).toBe(PLATE);
  });

  it('what a stove holds comes back through the save’s cleaning as it was', () => {
    const stove = bareStove();
    putVessel(stove, newItem(VESSEL.boil));
    putVessel(stove, newItem(VESSEL.steam));
    addPortion(stove, { id: 'egg' });
    setFire(stove, 1);
    stoveStep(stove, 3, tick());
    const back = cleanItem(JSON.parse(JSON.stringify(stove)), { unknown: 0 })!;
    expect(back.state).toEqual(stove.state);
    expect(underOf(back)).toBe(VESSEL.boil);
    expect(potOf(back)?.done).toBeGreaterThan(0);
    // a stocked cooler too: its things and their rate
    const box = newItem(COOLER);
    putInside(box, newItem(ingItem('beef'), { n: 2 }), 100);
    const b2 = cleanItem(JSON.parse(JSON.stringify(box)), { unknown: 0 })!;
    expect(b2.inside?.[0]).toMatchObject({ item: ingItem('beef'), fk: COOLER_DECAY });
  });
});
