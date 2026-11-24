/**
 * The hands and the V3 item model (docs/V3/nodes/N0-items-hands.md): the real ModPlayer in Node, on a flat
 * land with a stand-in for the game behind it (things lying about are a plain list, the mark is on whichever
 * the test says), taking up things that stack, hold things and go off — where a thing goes (onto a stack,
 * into a basket, into a free slot), what stays lying when only part of it goes, eating one off a stack, a
 * thing that turns in the hands — and the item card with its counts, freshness, quality, contents and the
 * lines a system adds. The same in the real game with the real keys: harness/shots/v3_items_hands.mjs.
 */
import { describe, expect, it } from 'vitest';
import { countOf, freshNow, itemSig, newItem, registerItemCat, registerItems, takeInside, type ItemInstance } from '../../src/core/modcar/items';
import { FunctionLand } from '../../src/core/onfoot/land';
import { newTool } from '../../src/core/modcar/tools';
import { cardHtml } from '../../src/game/modcar/cards';
import type { Action, SlotView } from '../../src/game/modcar/hudItems';
import { FRESH_WORD, itemCard, itemCardKept, itemLabel, itemLabelPlain, itemWordsChanged, registerItemCardLines, type ItemCard } from '../../src/game/modcar/itemInfo';
import { setItemClock } from '../../src/game/modcar/itemTime';
import type { Loose } from '../../src/game/modcar/loose';
import { ModPlayer, heldName, type Held, type PlayerHost } from '../../src/game/modcar/player';
import { ALLOCATES, heapGrowth } from './v3/heap';

registerItemCat({ id: 'h_t', name: { zh: '试验品', en: 'Test things' } });
registerItems([
  { id: 'h_berry', cat: 'h_t', name: { zh: '试验莓', en: 'Test berry' }, stars: 1, mass: 0.05, stack: 12, tags: ['h_t'], perish: { hours: 24, into: 'h_mush' }, eat: { food: 6, hp: 0, sec: 1.5 }, salvage: { organics: 1 } },
  { id: 'h_mush', cat: 'h_t', name: { zh: '烂莓', en: 'Mush' }, stars: 0, mass: 0.05, stack: 12 },
  { id: 'h_jerky', cat: 'h_t', name: { zh: '试验肉干', en: 'Test jerky' }, stars: 2, mass: 0.1, stack: 8, tags: ['h_t'], eat: { food: 15, hp: 1, sec: 2 } },
  { id: 'h_basket', cat: 'h_t', name: { zh: '试验篮', en: 'Test basket' }, stars: 1, mass: 0.6, carry: 'small', holds: { slots: 4, accepts: ['#h_t'], maxKg: 3, decay: 0.5 } },
]);

const HOUR = 3600;

/** the world's time, moved by the tests */
const world = { worldSeconds: 0 };
setItemClock(world);

/** a player on a flat floor, with what the game behind it was told */
function hands() {
  const lying: Loose[] = [];
  const ate: ItemInstance[] = [];
  const sounds: [string, number | undefined][] = [];
  const seen = { acts: [] as Action[], keys: [] as Action[], held: null as ItemCard | null, aim: null as ItemCard | null, slots: [] as SlotView[] };
  /** what the game says of itself to the hands: whether a list is open */
  const game = { listOpen: false };
  /** the thing lying about the mark is on (null: on nothing) */
  const mark = { on: null as Loose | null };
  /** a vehicle far off (nothing of it is near enough to be looked at) that a thing may ride in, and the vehicles weighed again */
  const truck = { sim: { px: 1e6, pz: 0, kmh: 0, spec: { body: { halfLength: 2 } } } };
  const weighed: unknown[] = [];
  let n = 0;
  const add = (item: ItemInstance): Loose => {
    const l = { uid: `l${++n}`, part: null, tool: null, item, x: 1, y: 0, z: 0, yaw: 0, vy: 0, resting: true, obj: null, radius: 0.2, mid: 0.1 } as unknown as Loose;
    lying.push(l);
    return l;
  };
  const host = {
    vehicles: [truck],
    devices: [],
    tanks: [],
    origin: { x: 0, y: 0, z: 0 },
    loose: {
      list: lying,
      pick: (_e: unknown, _d: unknown, _r: number, filter?: (l: Loose) => boolean) => (mark.on && lying.includes(mark.on) && (!filter || filter(mark.on)) ? { loose: mark.on, dist: 1 } : null),
      highlight: () => {},
      remove: (l: Loose) => void lying.splice(lying.indexOf(l), 1),
      touch: () => {},
      addItem: (item: ItemInstance) => add(item),
      drop: () => {},
    },
    ui: {
      lang: 'zh',
      say: () => {},
      prompt: () => {},
      items: {
        showActions: (a: Action[]) => void (seen.acts = a),
        showCards: (h: ItemCard | null, a: ItemCard | null) => {
          seen.held = h;
          seen.aim = a;
        },
        showKeys: (a: Action[]) => void (seen.keys = a),
        showTransfer: () => {},
        showHotbar: (s: SlotView[]) => void (seen.slots = s),
        showDone: () => {},
      },
    },
    cargo: { showGhost: () => {}, aim: () => null },
    changed: () => {},
    enter: () => {},
    sound: (name: string, gain?: number) => void sounds.push([name, gain]),
    iconOf: () => null,
    cargoChanged: (v: unknown) => void weighed.push(v),
    consume: (item: ItemInstance) => void ate.push(item),
    drank: () => {},
    camera: null,
    grimeCast: () => null,
    paintCast: () => null,
    get listOpen() {
      return game.listOpen;
    },
  } as unknown as PlayerHost;
  const player = new ModPlayer(new FunctionLand(() => 0), host);
  const keys = { run: false, jump: false, drop: false, take: false, forward: 0, right: 0 };
  /** frames of the game on foot (60 a second) */
  const frames = (k = 1, more: Partial<typeof keys> = {}): void => {
    for (let i = 0; i < k; i++) player.update(1 / 60, 0, 0, { ...keys, ...more });
  };
  /** look at a thing lying about and press E */
  const pickUp = (l: Loose): void => {
    mark.on = l;
    frames(1);
    player.press();
    frames(1);
    player.release();
    frames(1);
  };
  const item = (i: number): ItemInstance | null => {
    const h = player.slots[i];
    return h?.kind === 'item' ? h.item : null;
  };
  const say = (): string => seen.acts.map((a) => a.text).join(' | ');
  return { player, lying, ate, sounds, seen, mark, game, truck, weighed, add, frames, pickUp, item, say };
}

const berry = (n = 1, o: Partial<ItemInstance> = {}): ItemInstance => newItem('h_berry', { ...(n > 1 ? { n } : {}), ...o });
const held = (it: ItemInstance): NonNullable<Held> => ({ kind: 'item', item: it });

// (first in the file: measured before the tests below have put things of every shape through the same code, after
// which the engine no longer compiles it as tightly and puts the fractions it computes on the heap)
describe('what the hands ask every frame', () => {
  it('allocates nothing: the room, the look at the hands, the pick-up line, the name, the kept card', () => {
    world.worldSeconds = 0;
    const { player } = hands();
    const stack = berry(5);
    player.receive(held(stack));
    player.receive(held(newItem('h_basket', { inside: [berry(12, { fk: 0.5, t0: 0 }), newItem('h_jerky', { n: 3 })] })));
    const lying = held(berry(9));
    const chips = held(newItem('food_chips'));
    const inner = player as unknown as { settleHands(): void; pickWords(name: string, held: boolean, part: number): string };
    expect(player.roomFor(lying)).toBe(9);
    // (one verb and the name since docs/V3/plan/prompts.md §五: where it goes is the hotbar's to show)
    expect(inner.pickWords(heldName(lying), true, 0)).toBe('拿起 <b>试验莓 ×9</b>');
    expect(heapGrowth(() => void player.roomFor(lying))).toBeLessThan(ALLOCATES);
    expect(heapGrowth(() => void player.roomFor(chips))).toBeLessThan(ALLOCATES);
    expect(heapGrowth(() => inner.settleHands())).toBeLessThan(ALLOCATES);
    // (each measured by itself: put together in one function the engine no longer folds the core's sums into
    // the caller, and the weights they return are then numbers on the heap, which nothing here can help)
    expect(heapGrowth(() => void heldName(lying))).toBeLessThan(ALLOCATES);
    const name = heldName(lying);
    player.roomFor(lying);
    expect(heapGrowth(() => void inner.pickWords(name, true, 0))).toBeLessThan(ALLOCATES);
    expect(heapGrowth(() => void itemLabel(stack))).toBeLessThan(ALLOCATES);
    expect(heapGrowth(() => void player.cardOf(player.slots[0]!))).toBeLessThan(ALLOCATES);
    expect(heapGrowth(() => void player.cardOf(player.slots[1]!))).toBeLessThan(ALLOCATES);
    // (the measure sees an allocation where there is one: the card made anew every time)
    expect(heapGrowth(() => void itemCard(stack, 0))).toBeGreaterThan(ALLOCATES);
  });
});

describe('the hands take things that stack and hold things', () => {
  it('receive: onto the stack of its sort, then into the basket, then into a free slot; what does not go in stays the caller\'s', () => {
    world.worldSeconds = 0;
    const { player, item } = hands();
    const a = berry(5);
    expect(player.roomFor(held(a))).toBe(5);
    expect(player.receive(held(a))).toBe(0);
    expect([item(0), player.sel]).toEqual([a, 0]);
    expect(a.t0).toBe(0);
    // more of the same: onto the stack, the selection where it was; the thing handed over is used up
    const b = berry(4);
    expect(player.roomFor(held(b))).toBe(4);
    expect(player.receive(held(b))).toBe(0);
    expect([countOf(a), countOf(b), item(1)]).toEqual([9, 0, null]);
    // a stack fills up, the rest goes into the free slot; which slot is selected is the caller's to say
    const c = berry(8);
    expect(player.roomFor(held(c))).toBe(8);
    expect(player.receive(held(c))).toBe(0);
    expect([countOf(a), item(1), countOf(c), player.sel]).toEqual([12, c, 5, 0]);
    // both slots taken: only what the stacks have room for goes in, the rest stays with its count
    const d = berry(10);
    expect(player.roomFor(held(d))).toBe(7);
    expect(player.receive(held(d))).toBe(3);
    expect([countOf(a), countOf(c), countOf(d)]).toEqual([12, 12, 3]);
    // (what stays outside was not started by the attempt)
    expect(d.t0).toBeUndefined();
    expect(player.roomFor(held(d))).toBe(0);
    expect(player.receive(held(d))).toBe(3);
    // a thing that does not stack with anything there, a part, a tool: a free slot or nothing
    expect(player.roomFor(held(newItem('food_chips')))).toBe(0);
    expect(player.roomFor({ kind: 'tool', tool: newTool('bottle') })).toBe(0);
    expect(player.receive({ kind: 'tool', tool: newTool('bottle') })).toBe(1);
    expect(player.telemetry()).toMatchObject({ held: 'item:h_berry', heldN: 12, slot1N: 12, slot2N: 12, counts: '12,12' });
  });

  it('receive: a basket in a slot takes what it holds before a free slot does, and not what it is told to leave out', () => {
    world.worldSeconds = 0;
    const { player, item } = hands();
    const basket = newItem('h_basket');
    player.receive(held(basket));
    expect(player.sel).toBe(0);
    const a = berry(3);
    expect(player.receive(held(a))).toBe(0);
    expect([item(1), basket.inside?.length, countOf(basket.inside![0])]).toEqual([null, 1, 3]);
    // in the basket it goes off at the basket's rate
    expect(basket.inside![0].fk).toBe(0.5);
    // a thing the basket does not hold goes into the free slot
    const chips = newItem('food_chips');
    expect(player.receive(held(chips))).toBe(0);
    expect([item(1), player.sel]).toEqual([chips, 0]);
    // both slots taken: berries still go into the basket, chips nowhere
    expect(player.roomFor(held(berry(2)))).toBe(2);
    expect(player.roomFor(held(newItem('food_chips')))).toBe(0);
    // taken out of the basket by a list: not straight back into it
    const out = berry(2);
    expect(player.roomFor(held(out), basket)).toBe(0);
    expect(player.receive(held(out), basket)).toBe(2);
    expect(countOf(basket.inside![0])).toBe(3);
    // the basket has four slots: with the berries in one, three stacks of eight jerky go in; a fourth finds no
    // slot in it and no stack of jerky with room, and goes into the free slot of the hands whole
    player.slots[1] = null;
    player.sel = 0;
    const j = newItem('h_jerky', { n: 8 });
    expect(player.receive(held(j))).toBe(0);
    expect(basket.inside!.length).toBe(2);
    expect(player.slots[1]).toBeNull();
    for (const k of [8, 8]) expect(player.receive(held(newItem('h_jerky', { n: k })))).toBe(0);
    expect(basket.inside!.map((x) => `${x.item}*${countOf(x)}`)).toEqual(['h_berry*3', 'h_jerky*8', 'h_jerky*8', 'h_jerky*8']);
    const last = newItem('h_jerky', { n: 8 });
    // (2.55 kg in it: room for four more by weight, but no slot and no stack of jerky with room)
    expect(player.roomFor(held(last))).toBe(8);
    expect(player.receive(held(last))).toBe(0);
    expect([item(1), countOf(last), player.sel]).toEqual([last, 8, 0]);
    // by weight: an empty basket (3 kg) takes three stacks of jerky and six of a fourth; the two left over go into the free slot
    const { player: p2, item: item2 } = hands();
    const b2 = newItem('h_basket');
    p2.receive(held(b2));
    for (let i = 0; i < 3; i++) p2.receive(held(newItem('h_jerky', { n: 8 })));
    const split = newItem('h_jerky', { n: 8 });
    expect(p2.roomFor(held(split))).toBe(8);
    expect(p2.receive(held(split))).toBe(0);
    expect(b2.inside!.map((x) => countOf(x))).toEqual([8, 8, 8, 6]);
    expect([item2(1), countOf(split)]).toEqual([split, 2]);
    // and with no slot free the two stay the caller's
    const { player: p3 } = hands();
    const b3 = newItem('h_basket');
    p3.receive(held(b3));
    p3.receive(held(newItem('food_chips')));
    for (let i = 0; i < 3; i++) p3.receive(held(newItem('h_jerky', { n: 8 })));
    const rest = newItem('h_jerky', { n: 8 });
    expect(p3.roomFor(held(rest))).toBe(6);
    expect(p3.receive(held(rest))).toBe(2);
    expect([countOf(rest), b3.inside!.map((x) => countOf(x))]).toEqual([2, [8, 8, 8, 6]]);
  });

  it('a list taking a thing out of a basket in the hands lets the basket step out of its slot: nothing about the slots is remembered', () => {
    world.worldSeconds = 0;
    const { player, item } = hands();
    const basket = newItem('h_basket', { inside: [berry(5, { fk: 0.5, t0: 0 })] });
    player.receive(held(basket));
    player.receive(held(newItem('food_chips')));
    player.sel = 1;
    // the row taken out of the basket: with the basket in its slot the berries would go straight back into it
    const row = takeInside(basket, 0, 0)!;
    expect([countOf(row), basket.inside, player.roomFor(held(row))]).toEqual([5, undefined, 5]);
    // stepped out, its own slot, empty meanwhile, counts as free to whoever asks then (the list moves what lands there)
    const box = player.slots[0];
    player.slots[0] = null;
    expect(player.roomFor(held(row))).toBe(5);
    // with something else there: no slot is free and nothing else takes berries, so there is no room, and none go
    player.slots[0] = { kind: 'tool', tool: newTool('bottle') };
    expect(player.roomFor(held(row))).toBe(0);
    expect(player.receive(held(row))).toBe(5);
    // back in its slot, it is asked again as it stands, and the selection never moved
    player.slots[0] = box;
    expect([player.roomFor(held(row)), player.roomFor(held(berry(3))), player.sel, item(0)]).toEqual([5, 3, 1, basket]);
    // the same with a stack of the same sort in the other hand: out of the basket onto the stack
    const { player: p2 } = hands();
    const b2 = newItem('h_basket', { inside: [berry(5, { t0: 0 })] });
    p2.receive(held(b2));
    const stack = berry(4, { t0: 0 });
    // (put there by hand: handed to the hands it would have gone into the basket)
    p2.slots[1] = held(stack);
    const mine = p2.slots[0];
    p2.slots[0] = null;
    const out = b2.inside!.pop()!;
    delete b2.inside;
    expect(p2.receive(held(out))).toBe(0);
    p2.slots[0] = mine;
    expect([countOf(stack), countOf(out), b2.inside, p2.sel]).toEqual([9, 0, undefined, 0]);
  });

  it('Q is not offered for putting down while a list is open; a basket in a slot shows how full it is under it', () => {
    world.worldSeconds = 0;
    const { player, frames, seen, game } = hands();
    player.receive(held(newItem('h_basket', { inside: [berry(12, { fk: 0.5, t0: 0 }), newItem('h_jerky', { n: 2 })] })));
    frames(1);
    const g = (): string[] => seen.keys.filter((a) => a.keys.includes('Q') && !a.hold).map((a) => a.text);
    // (one word since docs/V3/plan/prompts.md §五; said the first three times a thing is in the hands)
    expect(g()).toEqual(['放下']);
    game.listOpen = true;
    frames(1);
    expect(g()).toEqual([]);
    game.listOpen = false;
    frames(1);
    expect(g().length).toBe(1);
    // two of its four slots taken, 0.8 of its 3 kg: half full; the bar is the same object from frame to frame
    const fill = seen.slots[0].fill;
    expect([fill?.value, fill?.max, fill?.tone, seen.slots[0].count]).toEqual([0.5, 1, 'mid', 1]);
    frames(1);
    expect(seen.slots[0].fill).toBe(fill);
    expect(seen.slots[1].fill).toBeUndefined();
  });

  it('roomFor says what receive then does, whatever is in the hands', () => {
    world.worldSeconds = 0;
    const cases: (() => ItemInstance | null)[][] = [
      [() => null, () => null],
      [() => berry(7), () => null],
      [() => berry(12), () => berry(11)],
      [() => newItem('h_basket'), () => berry(12)],
      [() => newItem('h_basket', { inside: [berry(12, { fk: 0.5, t0: 0 }), berry(12, { fk: 0.5, t0: 0 }), berry(12, { fk: 0.5, t0: 0 }), berry(10, { fk: 0.5, t0: 0 })] }), () => newItem('food_chips')],
      [() => newItem('h_jerky', { n: 8 }), () => newItem('h_basket')],
      [() => newItem('food_chips'), () => newItem('drink_water')],
    ];
    const things: (() => ItemInstance)[] = [() => berry(1), () => berry(5), () => berry(12), () => newItem('h_jerky', { n: 8 }), () => newItem('food_chips'), () => newItem('h_basket'), () => newItem('h_mush', { n: 3 })];
    for (const c of cases) {
      for (const make of things) {
        const { player } = hands();
        c.forEach((f, i) => {
          const it = f();
          player.slots[i] = it ? held(it) : null;
        });
        const it = make();
        const all = countOf(it);
        const before = player.slots.map((h) => (h?.kind === 'item' ? itemSig(h.item) : ''));
        const room = player.roomFor(held(it));
        // asking changes nothing
        expect(player.slots.map((h) => (h?.kind === 'item' ? itemSig(h.item) : ''))).toEqual(before);
        expect(countOf(it)).toBe(all);
        const left = player.receive(held(it));
        expect(all - left).toBe(room);
        // nothing is lost or doubled: what is in the hands now and what is left outside is what there was
        const total = (id: string): number => player.slots.reduce((s, h) => s + (h?.kind === 'item' ? (h.item.item === id ? countOf(h.item) : 0) + (h.item.inside ?? []).reduce((k, x) => k + (x.item === id ? countOf(x) : 0), 0) : 0), 0);
        const had = c.reduce((s, f) => {
          const x = f();
          return s + (x ? (x.item === it.item ? countOf(x) : 0) + (x.inside ?? []).reduce((k, y) => k + (y.item === it.item ? countOf(y) : 0), 0) : 0);
        }, 0);
        const inHands = player.slots.some((h) => h?.kind === 'item' && (h.item === it || !!h.item.inside?.includes(it)));
        expect(total(it.item) + (inHands ? 0 : left)).toBe(had + all);
      }
    }
  });

  it('E on things lying about: three berries apart end as one slot of three; a thirteenth takes a new slot; a stack too big leaves the rest lying', () => {
    world.worldSeconds = 0;
    const { player, lying, add, pickUp, item, say, seen, mark, frames } = hands();
    const three = [add(berry()), add(berry()), add(berry())];
    mark.on = three[0];
    frames(1);
    expect(say()).toContain('拿起 <b>试验莓</b>');
    expect(say()).not.toContain('快捷栏');
    pickUp(three[0]);
    mark.on = three[1];
    frames(1);
    expect(say()).toContain('拿起 <b>试验莓</b>');
    expect(say()).not.toContain('（');
    pickUp(three[1]);
    pickUp(three[2]);
    expect([lying.length, countOf(item(0)!), item(1), player.sel]).toEqual([0, 3, null, 0]);
    expect(seen.slots[0].count).toBe(3);
    expect(seen.slots[0].name).toBe('试验莓');
    expect(heldName(player.held!)).toBe('试验莓 ×3');
    // a full stack: the next one takes the other slot, and is the one in the hands
    item(0)!.n = 12;
    const more = add(berry());
    mark.on = more;
    frames(1);
    expect(say()).toContain('拿起 <b>试验莓</b>');
    pickUp(more);
    expect([countOf(item(0)!), countOf(item(1)!), player.sel, lying.length]).toEqual([12, 1, 1, 0]);
    // ten lying there with room for eleven on the second stack: all go; then five more with room for one
    pickUp(add(berry(10)));
    expect([countOf(item(1)!), lying.length]).toEqual([11, 0]);
    const five = add(berry(5));
    mark.on = five;
    frames(1);
    expect(say()).toContain('拿起 <b>试验莓 ×5</b>');
    pickUp(five);
    expect([countOf(item(1)!), lying.length, countOf(five.item!)]).toEqual([12, 1, 4]);
    expect(lying[0]).toBe(five);
    // no room for any of it now: the mark is not on it, E does nothing
    mark.on = five;
    frames(1);
    expect(player.target).toBeNull();
    pickUp(five);
    expect(countOf(five.item!)).toBe(4);
  });

  it('E on a stack riding in a vehicle: the vehicle is weighed again, whether all of the stack is taken or part of it', () => {
    world.worldSeconds = 0;
    const { player, lying, add, pickUp, item, truck, weighed } = hands();
    player.receive(held(berry(12)));
    player.slots[1] = held(berry(10));
    const stowed = add(berry(5));
    stowed.riding = { on: truck } as unknown as Loose['riding'];
    // room for two of the five: they go, the rest rides on, and what the vehicle carries is weighed again
    pickUp(stowed);
    expect([countOf(item(1)!), lying.length, countOf(stowed.item!), weighed]).toEqual([12, 1, 3, [truck]]);
    // a slot freed: the rest is taken whole, and the vehicle is weighed again
    player.slots[0] = null;
    pickUp(stowed);
    expect([lying.length, countOf(item(0)!), weighed, player.sel]).toEqual([0, 3, [truck, truck], 0]);
    // a thing that rode in nothing: nothing is weighed
    pickUp(add(berry(2)));
    expect([countOf(item(0)!), weighed.length]).toEqual([5, 2]);
  });

  it('E with a basket in a slot: the pick goes into the basket, and the words say so', () => {
    world.worldSeconds = 0;
    const { player, lying, add, pickUp, item, say, mark, frames } = hands();
    const basket = newItem('h_basket');
    player.receive(held(basket));
    const b = add(berry(2));
    mark.on = b;
    frames(1);
    expect(say()).toContain('拿起 <b>试验莓 ×2</b>');
    pickUp(b);
    expect([lying.length, item(1), basket.inside!.map((x) => `${x.item}*${countOf(x)}`)]).toEqual([0, null, ['h_berry*2']]);
    expect(player.sel).toBe(0);
  });

  it('eating takes one off a stack, and what was eaten is one', () => {
    world.worldSeconds = 0;
    const { player, ate, frames, item } = hands();
    const stack = berry(3);
    player.receive(held(stack));
    frames(1, { take: true });
    expect(player.use?.kind).toBe('eat');
    frames(100, { take: true });
    expect(ate.length).toBe(1);
    expect([countOf(ate[0]), ate[0].item, ate[0].uid === stack.uid]).toEqual([1, 'h_berry', false]);
    expect([item(0), countOf(stack)]).toEqual([stack, 2]);
    // the button held on does not eat another: a press each
    frames(200, { take: true });
    expect(ate.length).toBe(1);
    frames(1);
    frames(100, { take: true });
    frames(1);
    frames(100, { take: true });
    // the last one: the thing itself, and the slot is empty
    expect(ate.length).toBe(3);
    expect([ate[2], countOf(ate[2]), item(0)]).toEqual([stack, 1, null]);
  });

  it('G puts the whole stack down as one thing, and E takes it up again', () => {
    world.worldSeconds = 0;
    const { player, lying, pickUp, item } = hands();
    const stack = berry(7);
    player.receive(held(stack));
    expect(player.putDown()).toBe(true);
    expect([item(0), lying.length, lying[0].item, countOf(lying[0].item!)]).toEqual([null, 1, stack, 7]);
    pickUp(lying[0]);
    expect([item(0), countOf(stack), lying.length]).toEqual([stack, 7, 0]);
  });

  it('a thing that turns in the hands becomes what its kind says, and a bite of it under way stops', () => {
    world.worldSeconds = 0;
    const { player, ate, frames, item, seen } = hands();
    const stack = berry(4);
    player.receive(held(stack));
    frames(1);
    expect(seen.held?.name).toBe('试验莓 ×4');
    world.worldSeconds = 23.9 * HOUR;
    frames(1, { take: true });
    expect(player.use?.kind).toBe('eat');
    world.worldSeconds = 24.1 * HOUR;
    frames(1, { take: true });
    expect(player.use).toBeNull();
    expect([item(0), stack.item, countOf(stack), ate.length]).toEqual([stack, 'h_mush', 4, 0]);
    expect(seen.held?.name).toBe('烂莓 ×4');
    expect(heldName(player.held!)).toBe('烂莓 ×4');
    // what a basket in the hands holds turns too, and the basket's card says what is in it now
    world.worldSeconds = 0;
    const { player: p2, frames: f2, seen: s2 } = hands();
    const basket = newItem('h_basket');
    p2.receive(held(basket));
    p2.receive(held(berry(2)));
    f2(1);
    expect(s2.held?.rows.map((r) => `${r.value} ${r.label}`)).toContain('×2 试验莓');
    // (half as fast in the basket: gone after two days, not one)
    world.worldSeconds = 30 * HOUR;
    f2(30);
    expect(basket.inside![0].item).toBe('h_berry');
    world.worldSeconds = 49 * HOUR;
    f2(30);
    expect(basket.inside![0].item).toBe('h_mush');
    expect(s2.held?.rows.map((r) => `${r.value} ${r.label}`)).toContain('×2 烂莓');
    world.worldSeconds = 0;
  });

  it('a thing lying about that has turned is what it turned into once the mark is on it; it is not started by a look', () => {
    world.worldSeconds = 0;
    const { add, frames, mark, seen, pickUp, item } = hands();
    const fresh = add(berry(2));
    const old = add(berry(2, { t0: 0 }));
    world.worldSeconds = 30 * HOUR;
    mark.on = fresh;
    frames(1);
    expect([fresh.item!.item, fresh.item!.t0, seen.aim?.name]).toEqual(['h_berry', undefined, '试验莓 ×2']);
    mark.on = old;
    // (from one thing to another the mark settles over two frames: docs/V3/plan/hands.md §二.1)
    frames(2);
    expect([old.item!.item, seen.aim?.name]).toEqual(['h_mush', '烂莓 ×2']);
    // picked up, the one never started starts now
    pickUp(fresh);
    expect([item(0)!.t0, freshNow(item(0)!, world.worldSeconds)]).toEqual([30 * HOUR, 1]);
    world.worldSeconds = 0;
  });
});

describe('the item card', () => {
  it('says how many, how fresh, how good, and what is inside', () => {
    world.worldSeconds = 0;
    const b = berry(3, { t0: 0, q: 4 });
    let c = itemCard(b, 0);
    expect(c.name).toBe('试验莓 ×3');
    expect(c.rows.map((r) => `${r.value} ${r.label}`)).toEqual(['3 个 一叠（最多 12 个）', '4 星 品质', '+6 饱腹（每个）', '3 有机物 回收能得']);
    expect(c.rows[1].stars).toBe(4);
    expect(c.bars.map((x) => [x.label, x.text, x.tone])).toEqual([['新鲜程度', '新鲜 · 还能放约 24 小时', 'good']]);
    expect(c.foot.mass).toBeCloseTo(0.15);
    const words = [0, 12, 20, 23.5, 30].map((h) => itemCard(b, h * HOUR).bars[0].text);
    expect(words).toEqual(['新鲜 · 还能放约 24 小时', '还行 · 还能放约 12 小时', '快坏了 · 还能放约 4 小时', '快坏了 · 还能放不到 1 小时', '坏了']);
    expect(FRESH_WORD.map((w) => w.zh)).toEqual(['新鲜', '还行', '快坏了', '坏了']);
    // the stars of a quality are drawn, the words are its title
    expect(cardHtml(c)).toContain('data-q="4"');
    // one of a kind that stacks says so; a thing that does neither says nothing new
    expect(itemCard(newItem('h_jerky'), 0).rows[0]).toEqual({ value: '1 个', label: '一叠（最多 8 个）' });
    const chips = itemCard(newItem('food_chips'), 0);
    expect([chips.name, chips.bars.length, chips.rows.some((r) => /一叠|品质/.test(r.label)), chips.rows.some((r) => r.label === '饱腹')]).toEqual(['虾片', 0, false, true]);
    // a basket: how full by slots and by weight, each thing in it, how it keeps things
    const basket = newItem('h_basket', { inside: [berry(12, { t0: 0, fk: 0.5 }), newItem('h_jerky', { n: 2 })] });
    c = itemCard(basket, 0);
    expect(c.bars.map((x) => [x.label, x.text])).toEqual([['装着', '2 / 4 格 · 0.80 / 3 kg']]);
    expect(c.rows.map((r) => `${r.value} ${r.label}`)).toEqual(['×12 试验莓', '×2 试验肉干', '12 有机物 回收能得']);
    expect(c.notes.map((x) => x.text)).toEqual(['里面坏得慢 · 50%']);
    expect(c.foot.mass).toBeCloseTo(1.4);
    expect(itemCard(basket, 40 * HOUR).rows[0]).toMatchObject({ value: '×12', label: '试验莓（快坏了）', tone: 'bad' });
    expect(itemCard(newItem('h_basket'), 0).notes[0].text).toBe('空的');
    // in the basket a berry keeps twice as long
    expect(itemCard(basket.inside![0], 0).bars[0].text).toBe('新鲜 · 还能放约 2 天');
  });

  it('takes a system\'s own lines, by kind and by category, and is shown without lines that throw', () => {
    registerItemCardLines({ cat: 'h_t' }, (inst, card) => void card.notes.push({ text: `类：${inst.item}`, tone: 'info' }));
    registerItemCardLines({ item: 'h_jerky' }, (inst, card, now) => void card.rows.push({ value: `${countOf(inst)}@${now}`, label: '肉干自己的一行' }));
    const j = itemCard(newItem('h_jerky', { n: 2 }), 7);
    expect(j.notes.at(-1)?.text).toBe('类：h_jerky');
    expect(j.rows.at(-1)).toEqual({ value: '2@7', label: '肉干自己的一行' });
    expect(itemCard(berry(), 0).rows.some((r) => r.label === '肉干自己的一行')).toBe(false);
    expect(itemCard(newItem('food_chips'), 0).notes.some((x) => x.text.startsWith('类：'))).toBe(false);
    const errors: string[] = [];
    const was = console.error;
    console.error = (m: unknown) => void errors.push(String(m));
    try {
      registerItemCardLines({ item: 'h_mush' }, () => {
        throw new Error('boom');
      });
      const m = itemCard(newItem('h_mush'), 0);
      itemCard(newItem('h_mush'), 0);
      expect(m.name).toBe('烂莓');
      expect(errors).toEqual(['item card lines (h_mush): Error: boom']);
    } finally {
      console.error = was;
    }
  });

  it('is kept between frames: the same card until its thing changes, and not for long', () => {
    const b = berry(3, { t0: 0 });
    const a = itemCardKept(b, 0, 10);
    expect(a.kept).toBe(true);
    expect(itemCardKept(b, 0, 10.1)).toBe(a);
    // a count that changes shows at once
    b.n = 2;
    const c = itemCardKept(b, 0, 10.1);
    expect([c === a, c.name]).toEqual([false, '试验莓 ×2']);
    // so does freshness, by fiftieths; and the card is made again after a quarter of a second whatever happened
    expect(itemCardKept(b, 60, 10.15)).toBe(c);
    const d = itemCardKept(b, HOUR, 10.15);
    expect(d).not.toBe(c);
    expect(itemCardKept(b, HOUR, 10.39)).toBe(d);
    expect(itemCardKept(b, HOUR, 10.41)).not.toBe(d);
    // what is put into a basket shows at once
    const basket = newItem('h_basket');
    const e = itemCardKept(basket, 0, 20);
    basket.inside = [berry(2)];
    expect(itemCardKept(basket, 0, 20).rows.map((r) => r.label)).toContain('试验莓');
    expect(e.rows.map((r) => r.label)).not.toContain('试验莓');
  });

  it('names a stack with its count, the same string until the count changes', () => {
    const b = berry(3);
    const s = itemLabel(b);
    expect(s).toBe('试验莓 ×3');
    expect(itemLabel(b)).toBe(s);
    b.n = 2;
    expect(itemLabel(b)).toBe('试验莓 ×2');
    expect([itemLabelPlain(b), itemLabelPlain(b) === itemLabelPlain(b)]).toEqual(['试验莓', true]);
    delete b.n;
    expect([itemLabel(b), itemLabelPlain(b)]).toEqual(['试验莓', '试验莓']);
    const water = newItem('drink_water', { litres: 0.5 });
    expect(itemLabel(water)).toMatch(/（0\.50 L）$/);
    expect(itemLabelPlain(water)).toBe(itemLabel(water));
    // what things are called changed for a reason not in them: the kept names and cards are made again
    const c = berry(4, { t0: 0 });
    const [name, card] = [itemLabel(c), itemCardKept(c, 0, 5)];
    expect([itemLabel(c) === name, itemCardKept(c, 0, 5) === card]).toEqual([true, true]);
    itemWordsChanged();
    expect(itemCardKept(c, 0, 5)).not.toBe(card);
    expect(itemLabel(c)).toBe('试验莓 ×4');
  });
});
