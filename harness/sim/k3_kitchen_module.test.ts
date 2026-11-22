/**
 * The kitchen module in the stand-in game (harness/sim/v3/kitchenRig.ts; docs/V3/plan/cooking.md §4–§6): installed
 * as the game installs it, with the real player — the mark finds the cookware through the kernel's sources, E and F
 * work it with what is in the hands, the hands take what comes out.
 *
 * The developer's tab lays a kitchen out and every piece of cookware is a unit the mark finds, a stove as three
 * (its burner, its knob, its canister bay). A meal goes the whole way: a tomato onto the board, three strokes, into
 * the pan with an egg, a pinch of salt, the flame lit, a toss when it asks, just right, onto a plate — a new recipe
 * in the book, which comes back from the save and is empty in a new game. E does what is asked first (a toss before
 * the plate, the knife before a second tomato); a thing that came to nothing is warned of at the pot; the canister is
 * changed and runs out; a stove carried off goes out; the thing in the hands has its ghosts where it can go, and is
 * set down where one aims; a meal eaten feeds and gives its plate back.
 */
import { describe, expect, it } from 'vitest';
import { countOf, hasItem, itemDef, newItem } from '../../src/core/modcar/items';
import { knows, newBook, pinned, togglePin } from '../../src/core/v3/kitchen/book';
import { BOARD, BOWL, cutItem, dishItem, GAS, GAS_FULL, ingItem, PLATE, SPICE, STOVE, VESSEL } from '../../src/core/v3/kitchen/items';
import { asksStir, canister, fireOf, gasOf, hasCanister, kitOf, phaseOf, potOf, vesselOf } from '../../src/core/v3/kitchen/kit';
import { itemCard } from '../../src/game/modcar/itemInfo';
import { kitchen } from '../../src/game/modcar/v3/kitchen/index';
import { kitchenRig } from './v3/kitchenRig';

type Rig = Awaited<ReturnType<typeof kitchenRig>>;

/** a rig with the tab's kitchen laid out before one and the hands empty */
async function laid(): Promise<Rig> {
  kitchen.book = newBook();
  const rig = await kitchenRig();
  expect(rig.button('摆一套厨房')).toMatch(/^摆好了 \d+ 样/);
  rig.frames(2);
  return rig;
}

/** the flame on and the pan brought to where it is just right, tossed when it asks: how many times it asked */
function cookRight(rig: Rig, most = 60): number {
  const stove = rig.unit(STOVE);
  let asked = 0;
  for (let t = 0; t < most * 30 && phaseOf(stove.item) !== 'right'; t++) {
    rig.frames(1, 1 / 30);
    if (asksStir(stove.item)) {
      rig.aim(stove, 'top');
      rig.pressE();
      asked++;
    }
  }
  return asked;
}

describe('the kitchen module in the game', () => {
  it('installs: its kinds are in the catalogue, its slice and its tab are the kernel’s', async () => {
    const rig = await kitchenRig();
    expect(rig.game.reports).toEqual([]);
    expect(rig.game.written).toEqual([]);
    for (const id of [STOVE, GAS, BOARD, PLATE, BOWL, SPICE, ...Object.values(VESSEL), ingItem('tomato'), cutItem('tomato'), dishItem('tomato_egg'), dishItem('mess')]) expect(hasItem(id), id).toBe(true);
    expect(rig.game.systems.get('kitchen')).toBe(kitchen);
    const tab = rig.game.openTab('kitchen')!;
    const labels = tab.buttons.map((b) => b.label);
    for (const l of ['摆一套厨房', '摆进房车', '炉子的气快烧完', '给一个空罐', '打开食谱本', '全部菜谱解锁', '全部做到完美', '清空食谱本', itemDef(STOVE).name.zh]) expect(labels, l).toContain(l);
    // (every ingredient has its button: sixty of them, each with its stars)
    expect(labels.filter((l) => /★+$/.test(l)).length).toBe(60);
  });

  it('a kitchen laid out by the tab: every piece of cookware is found by the mark, a stove as three', async () => {
    const rig = await laid();
    const kinds = kitchen.list.map((u) => u.item.item).sort();
    expect(kinds).toEqual([BOARD, SPICE, STOVE, VESSEL.bake, VESSEL.boil, VESSEL.brew, VESSEL.grill, VESSEL.mix, VESSEL.steam].sort());
    const stove = rig.unit(STOVE);
    expect(hasCanister(stove.item)).toBe(true);
    expect(gasOf(stove.item)).toBe(GAS_FULL);
    expect(vesselOf(stove.item)).toBe(VESSEL.fry);
    // (things the kitchen works are not picked up with E like things lying about)
    for (const u of kitchen.list) expect(u.loose.device).toBe(true);
    const uid = stove.loose.uid;
    expect(rig.aim(stove, 'knob')).toBe(`device:kitchen:${uid}:knob`);
    expect(rig.word()).toBe('点火');
    expect(rig.aim(stove, 'bay')).toBe(`device:kitchen:${uid}:bay`);
    expect(rig.word()).toBe('取出燃气罐 · 还剩 100%');
    expect(rig.aim(stove, 'top')).toBe(`device:kitchen:${uid}:top`);
    expect(rig.word()).toContain('空的平底锅');
    const board = rig.unit(BOARD);
    expect(rig.aim(board)).toBe(`device:kitchen:${board.loose.uid}:all`);
    expect(rig.word()).toContain('案板空着');
    // the card of a stove says what is in it
    const card = itemCard(stove.item);
    expect(card.bars.find((b) => b.label === '燃气')?.text).toContain('100%');
    expect(card.rows.find((r) => r.label === '炉头上')?.value).toBe('平底锅');
  });

  it('a meal the whole way: board, knife, pan, salt, flame, a toss, a plate — and a new recipe in the book', async () => {
    const rig = await laid();
    const stove = rig.unit(STOVE);
    const board = rig.unit(BOARD);
    // a tomato onto the board (one of three: two stay in the hands), cut with three strokes
    rig.empty();
    rig.give(newItem(ingItem('tomato'), { n: 3 }));
    rig.aim(board);
    expect(rig.word()).toBe('把<b>番茄</b>放到案板上');
    rig.pressE();
    expect(kitOf(board.item).food).toEqual({ id: 'tomato' });
    expect(countOf(rig.held()!)).toBe(2);
    // (with the other tomatoes still in the hands E is the knife's)
    expect(rig.word()).toBe('切<b>番茄</b>（0/3）');
    rig.pressE();
    rig.pressE();
    expect(kitOf(board.item).food).toMatchObject({ id: 'tomato', chops: 2 });
    rig.pressE();
    expect(kitOf(board.item).food).toMatchObject({ id: 'tomato', cut: 1 });
    expect(rig.game.said.at(-1)).toBe('番茄切好了。');
    expect(rig.word()).toBe('拿起切好的<b>番茄</b>');
    rig.pressE();
    expect(kitOf(board.item).food).toBeUndefined();
    expect(rig.item(1)?.item).toBe(cutItem('tomato'));
    // into the pan: the cut tomato, then an egg
    rig.player.sel = 1;
    rig.aim(stove, 'top');
    expect(rig.word()).toBe('煎炒：放进<b>番茄</b>（1/5）');
    rig.pressE();
    expect(potOf(stove.item)?.items).toEqual([{ id: 'tomato', cut: 1 }]);
    expect(rig.item(1)).toBeNull();
    rig.give(newItem(ingItem('egg')));
    rig.player.sel = 1;
    rig.aim(stove, 'top');
    rig.pressE();
    expect(potOf(stove.item)?.items.map((p) => p.id)).toEqual(['tomato', 'egg']);
    // a pinch from the caddy lying by the stove
    rig.empty();
    rig.aim(rig.unit(SPICE));
    expect(rig.word()).toBe('往平底锅里撒<b>盐</b>');
    rig.pressE();
    expect(potOf(stove.item)?.season).toEqual(['salt']);
    // the flame, and what the pot says as it goes
    rig.aim(stove, 'knob');
    rig.pressE();
    expect(fireOf(stove.item)).toBe(2);
    expect(rig.word()).toBe('关火');
    const asked = cookRight(rig);
    expect(asked).toBeGreaterThanOrEqual(1);
    expect(phaseOf(stove.item)).toBe('right');
    expect(rig.game.said.some((s) => s.startsWith('该翻炒一下了'))).toBe(true);
    expect(rig.game.said.some((s) => s.startsWith('火候正好！'))).toBe(true);
    expect(gasOf(stove.item)).toBeLessThan(GAS_FULL);
    // onto a plate: the dish in the hands, the recipe in the book
    rig.give(newItem(PLATE));
    rig.player.sel = 0;
    rig.aim(stove, 'top');
    expect(rig.word()).toBe('装盘');
    rig.pressE();
    const dish = rig.held()!;
    expect(dish.item).toBe(dishItem('tomato_egg'));
    expect(dish.state?.meal).toMatchObject({ perfect: 1, ware: PLATE });
    expect(rig.game.said.at(-1)).toMatch(/^新菜谱！完美的番茄炒蛋 ★★/);
    expect(knows(kitchen.book, 'tomato_egg')).toBe(true);
    expect(kitchen.book.made.tomato_egg).toEqual({ n: 1, p: 1 });
    expect(potOf(stove.item)).toBeUndefined();
    // (the flame still burns under an empty pan: the knob turns it off)
    rig.aim(stove, 'knob');
    rig.pressE();
    expect(fireOf(stove.item)).toBe(0);

    // the book is in the save and comes back; a new game has an empty one
    togglePin(kitchen.book, 'steak');
    const save = rig.game.saved();
    kitchen.book = newBook();
    const again = await kitchenRig({ save });
    expect(kitchen.book.made.tomato_egg).toEqual({ n: 1, p: 1 });
    expect(pinned(kitchen.book)?.id).toBe('steak');
    again.game.newGame();
    expect(kitchen.book).toEqual(newBook());
  });

  it('E does what is asked first: a toss before the plate or the next thing', async () => {
    const rig = await laid();
    const stove = rig.unit(STOVE);
    rig.empty();
    rig.give(newItem(ingItem('potato'), { n: 2 }));
    rig.aim(stove, 'top');
    rig.pressE();
    rig.aim(stove, 'knob');
    rig.pressE();
    for (let t = 0; t < 900 && !asksStir(stove.item); t++) rig.frames(1, 1 / 30);
    expect(asksStir(stove.item)).toBe(true);
    // with a potato in the hands, and with a plate: the word is the toss, and E tosses
    rig.aim(stove, 'top');
    expect(rig.word()).toMatch(/^<b>翻炒一下！<\/b>/);
    expect(kitchen.ghosts.filter((g) => g.unit === stove)).toEqual([]);
    rig.pressE();
    expect(asksStir(stove.item)).toBe(false);
    expect(potOf(stove.item)?.items.length).toBe(1);
    expect(potOf(stove.item)?.stirs).toBe(1);
    // (and now the potato in the hands is what E adds)
    expect(rig.word()).toContain('放进<b>土豆</b>（2/5）');
  });

  it('a pot that came to nothing is written down, and warned of the next time', async () => {
    const rig = await laid();
    const stove = rig.unit(STOVE);
    const fill = (): void => {
      for (const id of ['milk', 'salmon']) {
        rig.empty();
        rig.give(newItem(ingItem(id)));
        rig.aim(stove, 'top');
        rig.pressE();
      }
    };
    fill();
    rig.empty();
    rig.aim(stove, 'knob');
    rig.pressE();
    cookRight(rig);
    rig.give(newItem(PLATE));
    rig.aim(stove, 'top');
    rig.pressE();
    expect(rig.held()?.item).toBe(dishItem('mess'));
    expect(rig.game.said.at(-1)).toContain('这个搭配记进食谱本了');
    expect(kitchen.book.fails.length).toBe(1);
    // the same again: the second thing is warned of as it goes in
    rig.aim(stove, 'knob');
    rig.pressE();
    rig.empty();
    rig.give(newItem(ingItem('milk')));
    rig.aim(stove, 'top');
    expect(rig.word()).not.toContain('做砸了');
    rig.pressE();
    rig.empty();
    rig.give(newItem(ingItem('salmon')));
    rig.aim(stove, 'top');
    expect(rig.word()).toContain('上次这样做砸了');
  });

  it('the canister: taken out, a fresh one in, an empty one lights nothing, and the gas runs out under the pan', async () => {
    const rig = await laid();
    const stove = rig.unit(STOVE);
    rig.empty();
    // out with E on the bay: into the hands, the stove busy for the movement
    rig.aim(stove, 'bay');
    rig.pressE();
    expect(hasCanister(stove.item)).toBe(false);
    expect(rig.held()?.item).toBe(GAS);
    expect(stove.swap).toEqual({ old: true, put: false });
    expect(rig.word()).toBe('正在换燃气罐…');
    rig.pass(2);
    // no canister: the knob says so and nothing lights
    rig.empty();
    rig.aim(stove, 'knob');
    expect(rig.word()).toBe('点火 · 先装一罐燃气');
    rig.pressE();
    expect(fireOf(stove.item)).toBe(0);
    expect(rig.game.said.at(-1)).toContain('没有燃气罐');
    // an empty one goes in and lights nothing either
    rig.give(canister(0));
    rig.aim(stove, 'bay');
    expect(rig.word()).toBe('装上燃气罐（0%）');
    expect(kitchen.ghosts.map((g) => `${g.slot}:${g.item}`)).toContain(`can:${GAS}`);
    rig.pressE();
    expect(hasCanister(stove.item)).toBe(true);
    expect(rig.held()).toBeNull();
    rig.pass(2);
    rig.aim(stove, 'knob');
    expect(rig.word()).toBe('点火 · 燃气罐空了');
    rig.pressE();
    expect(fireOf(stove.item)).toBe(0);
    // a fresh one for it: the empty one comes out into the hands
    rig.give(newItem(GAS));
    rig.aim(stove, 'bay');
    expect(rig.word()).toBe('换上这罐燃气（100%） · 换下来的还剩 0%');
    rig.pressE();
    expect(gasOf(stove.item)).toBe(GAS_FULL);
    expect(rig.held()?.item).toBe(GAS);
    expect(gasOf(rig.held()!)).toBe(0);
    expect(rig.game.said.at(-1)).toBe('换好了。换下来的是空罐。');
    rig.pass(2.5);
    // the last seconds of a canister under a pan of potatoes: the flame goes out, what is in the pan stays as far as it got
    rig.empty();
    rig.give(newItem(ingItem('potato')));
    rig.aim(stove, 'top');
    rig.pressE();
    expect(rig.button('炉子的气快烧完')).toBe('1 个炉子只剩 20 秒的气了。');
    rig.aim(stove, 'knob');
    rig.pressE();
    expect(fireOf(stove.item)).toBe(2);
    rig.pass(4);
    // (F on the knob: the low flame burns less)
    rig.tapF();
    expect(fireOf(stove.item)).toBe(1);
    rig.tapF();
    expect(fireOf(stove.item)).toBe(2);
    rig.pass(18);
    expect(fireOf(stove.item)).toBe(0);
    expect(gasOf(stove.item)).toBe(0);
    expect(rig.game.said.some((s) => s.startsWith('火灭了：燃气罐空了'))).toBe(true);
    const done = potOf(stove.item)?.done ?? 0;
    expect(done).toBeGreaterThan(0.2);
    rig.pass(5);
    expect(potOf(stove.item)?.done).toBe(done);
  });

  it('the pan comes off with F and goes back on with E; a stove carried off alight goes out', async () => {
    const rig = await laid();
    const stove = rig.unit(STOVE);
    rig.empty();
    rig.give(newItem(ingItem('egg')));
    rig.aim(stove, 'top');
    rig.pressE();
    rig.tapF();
    expect(vesselOf(stove.item)).toBeNull();
    const pan = rig.held()!;
    expect(pan.item).toBe(VESSEL.fry);
    expect(potOf(pan)?.items).toEqual([{ id: 'egg' }]);
    // its ghost on the empty burner, and back on with E
    rig.aim(stove, 'top');
    expect(kitchen.ghosts.map((g) => `${g.slot}:${g.item}${g.focused ? '*' : ''}`)).toContain(`pot:${VESSEL.fry}*`);
    expect(rig.word()).toBe('把<b>平底锅</b>放到炉头上');
    rig.pressE();
    expect(vesselOf(stove.item)).toBe(VESSEL.fry);
    expect(potOf(stove.item)?.items).toEqual([{ id: 'egg' }]);
    expect(rig.held()).toBeNull();
    // a bowl needs no flame
    rig.give(newItem(VESSEL.mix));
    rig.tapF();
    rig.player.sel = 0;
    rig.aim(stove, 'top');
    expect(rig.word()).toBe('搅拌碗不用火：放在一边拌就行');
    // alight in the hands: out
    rig.empty();
    rig.give(newItem(PLATE));
    rig.empty();
    rig.aim(stove, 'knob');
    rig.pressE();
    expect(fireOf(stove.item)).toBe(2);
    rig.ctx.loose.remove(stove.loose);
    rig.give(stove.item);
    rig.frames(2);
    expect(fireOf(stove.item)).toBe(0);
    expect(kitchen.list.some((u) => u.item === stove.item)).toBe(false);
  });

  it('the thing in the hands shows where it can go, and is set down where one aims', async () => {
    const rig = await laid();
    const ghosts = (): string[] => kitchen.ghosts.map((g) => `${g.slot}:${g.item}${g.focused ? '*' : ''}`).sort();
    rig.empty();
    rig.lookAt(1, 1.6, -3);
    expect(ghosts()).toEqual([]);
    // a tomato: onto the board, into the pan on the stove, into the bowl (used where it stands) — not into the pots put away
    rig.give(newItem(ingItem('tomato')));
    rig.frames(2);
    expect(ghosts()).toEqual([`food:${ingItem('tomato')}`, `food:${ingItem('tomato')}`, `food:${ingItem('tomato')}`]);
    expect(kitchen.ghosts.map((g) => g.unit?.item.item).sort()).toEqual([BOARD, STOVE, VESSEL.mix].sort());
    // an egg is not cut: no ghost on the board
    rig.empty();
    rig.give(newItem(ingItem('egg')));
    rig.frames(2);
    expect(kitchen.ghosts.map((g) => g.unit?.item.item).sort()).toEqual([STOVE, VESSEL.mix].sort());
    // set down where one aims: a spot of bare ground to one's left
    rig.empty();
    rig.give(newItem(VESSEL.boil));
    const before = rig.lying.length;
    expect(rig.lookAt(0.9, 0, -1.3)).toBe('device:kitchen:place');
    expect(rig.word()).toBe('放下 <b>汤锅</b>');
    expect(ghosts()).toContain(`place:${VESSEL.boil}*`);
    rig.pressE();
    expect(rig.held()).toBeNull();
    expect(rig.lying.length).toBe(before + 1);
    const pot = rig.lying.at(-1)!;
    expect(pot.item?.item).toBe(VESSEL.boil);
    expect(Math.hypot(pot.x - 0.9, pot.z + 1.3)).toBeLessThan(0.12);
    // (facing the one who put it there)
    const w = rig.player.walker;
    expect(Math.cos(pot.yaw - Math.atan2(w.z - pot.z, w.x - pot.x))).toBeGreaterThan(0.99);
    rig.frames(2);
    expect(kitchen.list.some((u) => u.loose === pot)).toBe(true);
    // a stack is set down one at a time
    rig.give(newItem(PLATE, { n: 3 }));
    expect(rig.lookAt(0.5, 0, 1.4)).toBe('device:kitchen:place');
    rig.pressE();
    expect(countOf(rig.held()!)).toBe(2);
    expect(rig.lying.at(-1)!.item?.item).toBe(PLATE);
    // looking up at nothing: no place
    expect(rig.lookAt(2, 2.4, -4)).toBe('');
  });

  it('a bowl is tossed three times where it stands; a meal eaten feeds and gives its plate back', async () => {
    const rig = await laid();
    const bowl = rig.unit(VESSEL.mix);
    // (walk round to it: it stands in the second row)
    rig.player.walker.place(bowl.loose.x - 0.9, bowl.loose.z + 0.2, 0);
    for (const id of ['lettuce', 'tomato']) {
      rig.empty();
      rig.give(newItem(ingItem(id)));
      rig.aim(bowl);
      rig.pressE();
    }
    expect(potOf(bowl.item)?.items.length).toBe(2);
    rig.give(newItem(BOWL));
    rig.player.sel = 0;
    rig.aim(bowl);
    expect(rig.word()).toBe('还没拌好：对着搅拌碗按 E 拌 3 下');
    rig.empty();
    rig.aim(bowl);
    expect(rig.word()).toMatch(/^拌一拌（0\/3）/);
    rig.pressE();
    rig.pressE();
    rig.pressE();
    expect(rig.game.said.at(-1)).toBe('拌好了。');
    rig.give(newItem(BOWL));
    rig.aim(bowl);
    expect(rig.word()).toBe('装盘');
    rig.pressE();
    const salad = rig.held()!;
    expect(itemDef(salad.item).cat).toBe('meal');
    expect(salad.state?.meal?.ware).toBe(BOWL);
    const feeds = salad.state!.meal!.food;
    expect(feeds).toBeGreaterThan(0);
    // eaten: the body has it, the bowl is back in the hands
    const gains = rig.ctx.body.gains.length;
    rig.empty();
    rig.game.events.emit('body:ate', { item: salad });
    expect(rig.ctx.body.gains.length).toBe(gains + 1);
    expect(rig.ctx.body.gains.at(-1)).toMatchObject({ food: feeds });
    expect(rig.held()?.item).toBe(BOWL);
  });
});
