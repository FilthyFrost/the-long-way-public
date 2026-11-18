/**
 * The list's sources and the open list's own work (src/game/modcar/listSources.ts), and a found thing coming
 * into the world (places.ts heldOfFound), without the game: the hands are the real ones (ModPlayer on a flat
 * floor with nothing behind it) or the plainest stand-in there could be (a free slot takes a thing whole, or
 * nothing does), since a source must hold for whatever hands it hands things to; what the sources ask of the
 * game is a stand-in, with the things lying about a plain list that marks and settles as the real ones do.
 *
 * The things lying about, the places and the weighing of a vehicle's load as they really are, together:
 * harness/sim/v3_world.test.ts. The same in the real game with the real keys: harness/shots/v3_items_world.mjs.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { countOf, itemSig, newItem, putInside, registerItemCat, registerItems, turned, type ItemInstance } from '../../src/core/modcar/items';
import { FunctionLand } from '../../src/core/onfoot/land';
import type { CargoRow } from '../../src/game/modcar/cargoList';
import { setItemClock } from '../../src/game/modcar/itemTime';
import { boxSource, guardedSource, HANDS_FULL, intoHands, Listing, placeSource, vehicleSource, type ListHost, type ListSource } from '../../src/game/modcar/listSources';
import { LooseThings, type Loose } from '../../src/game/modcar/loose';
import { heldOfFound, PlaceContainer } from '../../src/game/modcar/places';
import { ModPlayer, type Held, type PlayerHost } from '../../src/game/modcar/player';
import { ALLOCATES, heapGrowth } from './v3/heap';

registerItemCat({ id: 'tl', name: { zh: '试验', en: 'Test' } });
registerItems([
  { id: 'tl_berry', cat: 'tl', name: { zh: '试验莓', en: 'Test berry' }, stars: 1, mass: 0.05, stack: 12, tags: ['tl'], perish: { hours: 24, into: 'tl_mush' }, salvage: { organics: 1 } },
  { id: 'tl_mush', cat: 'tl', name: { zh: '烂莓', en: 'Mush' }, stars: 0, mass: 0.05, stack: 12, tags: ['tl'] },
  { id: 'tl_basket', cat: 'tl', name: { zh: '试验篮', en: 'Test basket' }, stars: 1, mass: 0.6, carry: 'small', holds: { slots: 2, accepts: ['#tl'], maxKg: 1, decay: 0.5 } },
]);

const HOUR = 3600;

/** the world's time, moved by the tests that need it and put back after each */
const world = { worldSeconds: 0 };
setItemClock(world);
afterEach(() => {
  world.worldSeconds = 0;
});

type Thing = NonNullable<Held>;
const item = (i: ItemInstance): Thing => ({ kind: 'item', item: i });
const n = (h: Thing): number => (h.kind === 'item' ? countOf(h.item) : 1);
const inSlot = (p: Hands, i: number): ItemInstance | null => {
  const h = p.slots[i];
  return h?.kind === 'item' ? h.item : null;
};

/** the plainest hands: a free slot (the selected one first) takes the thing whole, or nothing does */
class PlainHands {
  slots: Held[] = [null, null];
  sel = 0;
  pack: ItemInstance | null = null;
  use: object | null = null;
  walker = { x: 0, z: 0 };
  eye = { x: 0, y: 1.6, z: 0 };
  dir = { x: 1, y: 0, z: 0 };
  get held(): Held {
    return this.slots[this.sel];
  }
  set held(h: Held) {
    this.slots[this.sel] = h;
  }
  freeSlot(): number {
    if (!this.slots[this.sel]) return this.sel;
    return this.slots.findIndex((h) => !h);
  }
  roomFor(h: Thing): number {
    return this.freeSlot() >= 0 ? n(h) : 0;
  }
  receive(h: Thing): number {
    const slot = this.freeSlot();
    if (slot < 0) return n(h);
    this.slots[slot] = h;
    return 0;
  }
}

type Hands = PlainHands | ModPlayer;

/** the real hands: onto a stack in a slot, into a thing in a slot that holds its sort, else a free slot */
const realHands = (): ModPlayer => new ModPlayer(new FunctionLand(() => 0), {} as PlayerHost);

function hostOf(hands: Hands): { host: ListHost; said: string[]; loose: Loose[]; weighed: unknown[]; sounds: [string, number | undefined][] } {
  const said: string[] = [];
  const loose: Loose[] = [];
  const weighed: unknown[] = [];
  const sounds: [string, number | undefined][] = [];
  // the things lying about: a plain list, marked and settled by the real ones' own code (loose.ts); only the
  // drawing of a thing that became another kind is left out
  const L = {
    list: loose,
    rev: 0,
    weightChanged: null as ((on: unknown) => void) | null,
    touch: LooseThings.prototype.touch,
    settle: LooseThings.prototype.settle,
    redress(l: Loose): void {
      this.rev++;
      if (l.riding) this.weightChanged?.(l.riding.on);
    },
    remove(l: Loose): void {
      loose.splice(loose.indexOf(l), 1);
      this.rev++;
    },
    addItem(): never {
      throw new Error('a thing was put down at the feet: it found no way back to where it came from');
    },
  };
  const host = {
    player: hands,
    loose: L,
    cargo: { ridersOf: (v: unknown) => loose.filter((l) => l.riding?.on === v), weigh: (v: unknown) => void weighed.push(v), loadOf: () => 0 },
    vehicles: [] as unknown[],
    seated: null,
    places: { kept: (pc: PlaceContainer) => void pc.rev++ },
    ui: { say: (t: string) => void said.push(t) },
    // (every picture is there already: a list that waits for one asks its source again now and then, which is tried on its own below)
    iconOf: () => 'pic',
    sound: (name: string, gain?: number) => void sounds.push([name, gain]),
  };
  L.weightChanged = (on) => host.cargo.weigh(on);
  return { host: host as unknown as ListHost, said, loose, weighed, sounds };
}

const lying = (i: ItemInstance, x: number, on?: unknown): Loose => ({ uid: `l${i.uid}`, part: null, tool: null, item: i, x, y: 0, z: 0, yaw: 0, vy: 0, resting: true, radius: 0.2, mid: 0.1, riding: on ? { on } : null }) as unknown as Loose;

const berries = (k: number, o: Partial<ItemInstance> = {}): ItemInstance => newItem('tl_berry', { n: k, t0: 0, ...o });

/** a basket with these stacks in it (a number: so many plain berries) */
function basketWith(...stacks: (number | ItemInstance)[]): ItemInstance {
  const box = newItem('tl_basket');
  for (const k of stacks) expect(putInside(box, typeof k === 'number' ? berries(k) : k, 0)).toBe(0);
  return box;
}

const aCar = (): { view: { frame: { id: string; name: { zh: string } } }; sim: { px: number; pz: number; kmh: number; spec: { body: { halfLength: number } } } } => ({ view: { frame: { id: 'sedan', name: { zh: '轿车' } } }, sim: { px: 0, pz: 0, kmh: 0, spec: { body: { halfLength: 2 } } } });
const aCupboard = (): PlaceContainer => new PlaceContainer({ id: 'c1', x: 0, z: 0, hx: 0.4, hz: 0.3 } as never, {} as never, '橱柜');

const MAKES: [string, () => Hands][] = [
  ['the plainest hands', () => new PlainHands()],
  ['the real hands', realHands],
];

describe.each(MAKES)('a box as a list source, with %s', (_name, hands) => {
  it('gives a row out of the box in the hands into the other hand, never back into the box', () => {
    const p = hands();
    const { host, said } = hostOf(p);
    const box = basketWith(5);
    p.slots[0] = item(box);
    const src = boxSource(host, box);
    expect(src.near()).toBe(true);
    expect(src.rows().map((r) => r.name)).toEqual(['试验莓 ×5']);
    const v0 = src.version();
    expect(src.takeAt(0)).toBe(true);
    expect(src.version()).not.toBe(v0);
    expect(box.inside).toBeUndefined();
    expect(inSlot(p, 0)).toBe(box);
    expect(inSlot(p, 1)?.item).toBe('tl_berry');
    expect(countOf(inSlot(p, 1)!)).toBe(5);
    // out of the box it goes off as in the open air again
    expect(inSlot(p, 1)!.fk).toBeUndefined();
    // (the thing taken out is in the hands: its slot is the one selected)
    expect(p.sel).toBe(1);
    expect(said).toEqual([]);
  });

  it('leaves the box as it was, and the hands as they were, when no hand is free', () => {
    const p = hands();
    const { host, said, sounds } = hostOf(p);
    // (two rows: stacks of another quality do not join)
    const box = basketWith(5, newItem('tl_berry', { n: 12, t0: 0, q: 2 }));
    p.slots[0] = item(box);
    p.slots[1] = item(newItem('food_chips'));
    const src = boxSource(host, box);
    src.rows();
    const sig = itemSig(box);
    const uids = box.inside!.map((x) => x.uid);
    const rates = box.inside!.map((x) => x.fk);
    const v0 = src.version();
    for (const sel of [0, 1]) {
      p.sel = sel;
      expect(src.takeAt(0)).toBe(false);
      expect(p.sel).toBe(sel);
    }
    expect(itemSig(box)).toBe(sig);
    expect(box.inside!.map((x) => x.uid)).toEqual(uids);
    expect(box.inside!.map((x) => x.fk)).toEqual(rates);
    expect(src.version()).toBe(v0);
    expect(inSlot(p, 0)).toBe(box);
    expect(inSlot(p, 1)?.item).toBe('food_chips');
    expect(said).toEqual([HANDS_FULL, HANDS_FULL]);
    expect(sounds).toEqual([]);
  });

  it('takes from a box lying within reach (which is touched by it), and shuts when one has walked away from it or it is gone', () => {
    const p = hands();
    const { host, loose, weighed } = hostOf(p);
    const box = basketWith(4);
    const car = {};
    (host.vehicles as unknown[]).push(car);
    const l = lying(box, 1.5, car);
    loose.push(l);
    const src = boxSource(host, box);
    expect(src.near()).toBe(true);
    src.rows();
    expect(l.touched).toBeUndefined();
    expect(src.takeAt(0)).toBe(true);
    expect(box.inside).toBeUndefined();
    expect(countOf(inSlot(p, p.sel)!)).toBe(4);
    // (it rides in a vehicle: lighter by four berries, weighed again; and it has changed where it lies)
    expect(weighed).toEqual([car]);
    expect(l.touched).toBe(true);
    p.walker.x = -5;
    expect(src.near()).toBe(false);
    p.walker.x = 0;
    expect(src.near()).toBe(true);
    host.loose.remove(l);
    expect(src.near()).toBe(false);
  });

  it('takes the thing in the hands in: as much as goes, never itself, never what it does not hold', () => {
    const p = hands();
    const { host, said } = hostOf(p);
    const box = basketWith(10);
    p.slots[0] = item(box);
    const src = boxSource(host, box);
    const five = item(berries(5));
    // (0.5 kg in it, 1 kg at most: ten more berries by weight, two onto the stack and the rest into the free slot)
    expect(src.room!(five)).toBe(5);
    const v0 = src.version();
    expect(src.put!(five)).toBe(0);
    expect(itemSig(box)).toBe('tl_basket[tl_berry*12,tl_berry*3]');
    expect(src.version()).not.toBe(v0);
    const eight = item(berries(8));
    expect(src.room!(eight)).toBe(5);
    // (asked again with nothing changed: the same answer, which the box source does not work out twice)
    expect(src.room!(eight)).toBe(5);
    const v1 = src.version();
    expect(src.put!(eight)).toBe(3);
    expect(countOf((eight as { item: ItemInstance }).item)).toBe(3);
    expect(itemSig(box)).toBe('tl_basket[tl_berry*12,tl_berry*8]');
    // (the same things in it, more of one: its version says so)
    expect(src.version()).not.toBe(v1);
    // the same thing, fewer of it, the box fuller: asked afresh, and now none would go
    expect(src.room!(eight)).toBe(0);
    // itself (said: bring the thing to put in into the hands first), and a kind it does not hold (said too)
    expect(src.room!(item(box))).toBe(0);
    expect(src.put!(item(box))).toBe(1);
    const chips = item(newItem('food_chips'));
    expect(src.room!(chips)).toBe(0);
    expect(src.put!(chips)).toBe(1);
    expect(said.length).toBe(2);
    expect(itemSig(box)).toBe('tl_basket[tl_berry*12,tl_berry*8]');
  });
});

describe('a box as a list source: what it says of itself from frame to frame', () => {
  it('its room for the held thing is asked afresh when the thing is fewer or has become another kind, with the box as it was', () => {
    const p = new PlainHands();
    const { host } = hostOf(p);
    // (two slots, both taken; 0.75 kg of the one it bears)
    const box = basketWith(12, 3);
    p.slots[0] = item(box);
    const src = boxSource(host, box);
    const stack = berries(8);
    const held = item(stack);
    // five more by weight, onto the stack of three
    expect(src.room!(held)).toBe(5);
    // three of the eight eaten meanwhile: no more than there are
    stack.n = 3;
    expect(src.room!(held)).toBe(3);
    // the box fuller by another way (four more onto its stack of three: 0.95 kg): one more is all it bears
    box.inside![1].n = 7;
    expect(src.room!(held)).toBe(1);
    box.inside![1].n = 3;
    expect(src.room!(held)).toBe(3);
    // and those three gone off in the hand: mush joins no stack of berries, and no slot is free
    stack.item = 'tl_mush';
    delete stack.fresh;
    delete stack.t0;
    expect(src.room!(held)).toBe(0);
  });

  it('its version is another when a thing in it has become another kind under it, whoever settled it', () => {
    const p = new PlainHands();
    const { host } = hostOf(p);
    const box = basketWith(5);
    p.slots[0] = item(box);
    const src = boxSource(host, box);
    expect(src.rows().map((r) => r.name)).toEqual(['试验莓 ×5']);
    const v0 = src.version();
    expect(src.version()).toBe(v0);
    // (as the hands do every frame to what they hold: the same instance, the same count, another kind)
    const x = box.inside![0];
    x.item = 'tl_mush';
    delete x.fresh;
    delete x.t0;
    delete x.fk;
    expect(src.version()).not.toBe(v0);
    expect(src.rows().map((r) => r.name)).toEqual(['烂莓 ×5']);
    // and when a thing in it is another thing that reads the same (as many of the same kind: picked at another time, it turns at another)
    const v1 = src.version();
    box.inside![0] = newItem('tl_mush', { n: 5 });
    expect(src.version()).not.toBe(v1);
  });
});

describe('a box as a list source, with the real hands', () => {
  it('gives what the hands have room for and keeps the rest in its row', () => {
    const p = realHands();
    const { host, sounds } = hostOf(p);
    const box = basketWith(5, newItem('tl_berry', { n: 7, t0: 0, q: 2 }));
    p.slots[0] = item(box);
    p.slots[1] = item(berries(10));
    const src = boxSource(host, box);
    src.rows();
    const first = box.inside![0].uid;
    expect(src.takeAt(0)).toBe(true);
    // two onto the stack in the other hand (out of the box they go off as it does, and join it); three stay, in the same row, at the box's rate
    expect(countOf(inSlot(p, 1)!)).toBe(12);
    expect(itemSig(box)).toBe('tl_basket[tl_berry*3,tl_berry*7|q2]');
    expect(box.inside![0].uid).toBe(first);
    expect(box.inside![0].fk).toBe(0.5);
    expect(inSlot(p, 0)).toBe(box);
    // (what was picked up weighs two berries; nothing came to sit in a slot of its own: the hands are as they were)
    expect(sounds).toEqual([['pickup', expect.closeTo(0.1, 9)]]);
    expect(p.sel).toBe(0);
    // the stack in the hand is full now: nothing more comes out, and the box is as it was
    const sig = itemSig(box);
    expect(src.takeAt(0)).toBe(false);
    expect(itemSig(box)).toBe(sig);
    expect(box.inside![0].uid).toBe(first);
    expect(box.inside![0].fk).toBe(0.5);
  });

  it('never leaves a thing nowhere: hands that throw with it out of the box find it back in its row, and the fault goes on up', () => {
    const p = realHands();
    const { host } = hostOf(p);
    const box = basketWith(5, newItem('tl_berry', { n: 7, t0: 0, q: 2 }));
    p.slots[0] = item(box);
    const src = boxSource(host, box);
    src.rows();
    const sig = itemSig(box);
    const uids = box.inside!.map((x) => x.uid);
    p.receive = () => {
      throw new Error('the hands broke');
    };
    expect(() => src.takeAt(1)).toThrow('the hands broke');
    expect(itemSig(box)).toBe(sig);
    expect(box.inside!.map((x) => x.uid)).toEqual(uids);
    expect(box.inside!.map((x) => x.fk)).toEqual([0.5, 0.5]);
    expect(p.slots[1]).toBeNull();
    // through the guard, as the game asks: reported, and the list shuts
    const told: string[] = [];
    const g = guardedSource(src, (title, asked) => void told.push(`${title} ${asked}`));
    expect(g.takeAt(0)).toBe(false);
    expect(told).toEqual(['试验篮 takeAt']);
    expect(g.near()).toBe(false);
    expect(itemSig(box)).toBe(sig);
  });
});

describe.each(MAKES)('the lists of a vehicle and of a place, with %s', (_name, hands) => {
  it('a whole take from a vehicle: the thing is in the hands, selected, and no longer rides in it', () => {
    const p = hands();
    const { host, loose, weighed, sounds, said } = hostOf(p);
    p.slots[0] = item(newItem('food_chips'));
    const car = aCar();
    (host.vehicles as unknown[]).push(car);
    const mug = newItem('junk_mug');
    const stack = berries(5);
    loose.push(lying(mug, 0, car), lying(stack, 0, car), lying(newItem('junk_mug'), 3));
    const src = vehicleSource(host, car as never);
    expect(src.near()).toBe(true);
    const names = src.rows().map((r) => r.name);
    expect(names.length).toBe(2);
    const v0 = src.version();
    const at = names.indexOf('试验莓 ×5');
    expect(src.takeAt(at)).toBe(true);
    expect(inSlot(p, 1)).toBe(stack);
    expect(countOf(stack)).toBe(5);
    expect(p.sel).toBe(1);
    // gone from the vehicle (the other thing rides on, the one lying elsewhere lies on), weighed again, and the list knows
    expect(loose.map((l) => l.item!.item)).toEqual(['junk_mug', 'junk_mug']);
    expect(weighed).toEqual([car]);
    expect(src.version()).not.toBe(v0);
    expect(src.rows().length).toBe(1);
    expect(sounds).toEqual([['pickup', expect.closeTo(0.25, 9)]]);
    // both hands full now: the other thing stays where it rides, and it is said
    expect(src.takeAt(0)).toBe(false);
    expect(loose.length).toBe(2);
    expect(said).toEqual([HANDS_FULL]);
    expect(p.sel).toBe(1);
  });

  it('a whole take from a cupboard: the thing is in the hands, selected, and no longer in it; what is left is kept', () => {
    const p = hands();
    const { host, sounds } = hostOf(p);
    const pc = aCupboard();
    const mug = newItem('junk_mug');
    const stack = berries(4);
    pc.contents = [item(mug), item(stack)];
    const src = placeSource(host, pc);
    expect(src.near()).toBe(true);
    expect(src.rows().map((r) => r.name)).toEqual([expect.any(String), '试验莓 ×4']);
    const rev = pc.rev;
    const v0 = src.version();
    expect(src.takeAt(1)).toBe(true);
    expect(inSlot(p, 0)).toBe(stack);
    expect(p.sel).toBe(0);
    expect(pc.contents.map((h) => (h.kind === 'item' ? h.item : null))).toEqual([mug]);
    expect(pc.rev).toBeGreaterThan(rev);
    expect(src.version()).not.toBe(v0);
    expect(sounds).toEqual([['pickup', expect.closeTo(0.2, 9)]]);
    // out of reach of it: the list would shut
    p.walker.x = 5;
    expect(src.near()).toBe(false);
  });
});

describe('the lists of a vehicle and of a place, with the real hands', () => {
  it('a stack only partly taken stays where it was, fewer, is weighed again and is touched by it', () => {
    const p = realHands();
    const { host, loose, weighed } = hostOf(p);
    p.slots[0] = item(berries(10));
    p.slots[1] = item(newItem('food_chips'));
    const car = aCar();
    (host.vehicles as unknown[]).push(car);
    const stack = berries(5);
    const l = lying(stack, 0, car);
    loose.push(l);
    const src = vehicleSource(host, car as never);
    expect(src.rows().map((r) => r.name)).toEqual(['试验莓 ×5']);
    expect(src.takeAt(0)).toBe(true);
    expect(countOf(stack)).toBe(3);
    expect(countOf(inSlot(p, 0)!)).toBe(12);
    expect(loose.length).toBe(1);
    expect(weighed).toEqual([car]);
    expect(l.touched).toBe(true);
    expect(src.rows().map((r) => r.name)).toEqual(['试验莓 ×3']);
    // the hands are full: nothing goes, the thing stays
    expect(src.takeAt(0)).toBe(false);
    expect(loose.length).toBe(1);
    expect(countOf(stack)).toBe(3);
  });

  it('the same in a cupboard: what is left is kept as it stands', () => {
    const p = realHands();
    const { host } = hostOf(p);
    p.slots[0] = item(berries(11));
    p.slots[1] = item(newItem('food_chips'));
    const pc = aCupboard();
    pc.contents = [item(berries(4)), item(newItem('junk_mug'))];
    const src = placeSource(host, pc);
    expect(src.rows().length).toBe(2);
    const rev = pc.rev;
    expect(src.takeAt(0)).toBe(true);
    expect(pc.contents.length).toBe(2);
    expect(countOf((pc.contents[0] as { item: ItemInstance }).item)).toBe(3);
    expect(pc.rev).toBeGreaterThan(rev);
  });

  it('the hand-over a source of any make uses: how many did not go, said when none did, the slot selected when all did', () => {
    const p = realHands();
    const { host, said } = hostOf(p);
    p.slots[0] = item(berries(10));
    const more = item(berries(5));
    // two onto the stack, the other three into the free slot with the instance itself: all of it went, and its slot is the one selected
    expect(intoHands(host, more)).toBe(0);
    expect(countOf(inSlot(p, 0)!)).toBe(12);
    expect(inSlot(p, 1)).toBe((more as { item: ItemInstance }).item);
    expect(p.sel).toBe(1);
    const none = item(newItem('junk_mug'));
    expect(intoHands(host, none)).toBe(1);
    expect(said).toEqual([HANDS_FULL]);
    expect(p.sel).toBe(1);
  });
});

describe('an open list and the time', () => {
  it('a row that has turned is another kind in the list before it is handed over: in a box, in a vehicle, in a cupboard', () => {
    const p = realHands();
    const { host, loose, weighed } = hostOf(p);
    // in a basket the berries keep twice as long: two days; in the open air one
    const box = basketWith(5);
    p.slots[0] = item(box);
    const car = aCar();
    (host.vehicles as unknown[]).push(car);
    const riding = berries(3);
    loose.push(lying(riding, 0, car));
    const pc = aCupboard();
    const shelved = berries(2);
    pc.contents = [item(shelved)];
    const sources: [ListSource, ItemInstance, number][] = [
      [boxSource(host, box), box.inside![0], 48 * HOUR],
      [vehicleSource(host, car as never), riding, 24 * HOUR],
      [placeSource(host, pc), shelved, 24 * HOUR],
    ];
    for (const [src, thing, at] of sources) {
      world.worldSeconds = 0;
      const list = new Listing();
      expect(list.rows(src)[0].name).toContain('试验莓');
      const rev = list.view.rev;
      // an hour, a day less a second (in the basket: two days less a second): still berries, and nothing is built again
      for (const t of [HOUR, at - 1]) {
        world.worldSeconds = t;
        expect(turned(thing, t)).toBe(false);
        expect(list.rows(src)[0].name).toContain('试验莓');
        expect(list.view.rev).toBe(rev);
      }
      // a second past: the list notices by itself, the row is what the berries have become, with their count
      world.worldSeconds = at + 1;
      expect(turned(thing, at + 1)).toBe(true);
      expect(list.rows(src)[0].name).toBe(`烂莓 ×${countOf(thing)}`);
      expect(thing.item).toBe('tl_mush');
      expect(list.view.rev).toBe(rev + 1);
      // and there it rests: nothing more to notice
      world.worldSeconds = at + 2 * HOUR;
      list.rows(src);
      expect(list.view.rev).toBe(rev + 1);
    }
    // (the thing riding in the vehicle became another kind: the vehicle was weighed again)
    expect(weighed).toEqual([car]);
  });
});

describe('what the list asks of its source every frame it is open', () => {
  it('allocates nothing: whether it is still within reach, whether what is in it has changed, how much of the thing in the hands would go in', () => {
    const p = new PlainHands();
    const { host, loose } = hostOf(p);
    const box = basketWith(5, newItem('tl_berry', { n: 7, t0: 0, q: 2 }));
    p.slots[0] = item(box);
    const held = item(berries(4));
    p.slots[1] = held;
    const inHand = boxSource(host, box);
    const other = basketWith(3);
    loose.push(lying(other, 1));
    const onGround = boxSource(host, other);
    const car = aCar();
    (host.vehicles as unknown[]).push(car);
    loose.push(lying(berries(2), 0, car));
    const inCar = vehicleSource(host, car as never);
    const pc = aCupboard();
    pc.contents = [item(berries(4))];
    const inCupboard = placeSource(host, pc);
    const all = [inHand, onGround, inCar, inCupboard];
    // (nothing stands at a whole number of metres in the game)
    p.walker.x = 0.3;
    p.walker.z = -0.7;
    car.sim.px = 1.9;
    car.sim.pz = 0.45;
    car.sim.kmh = 0.02;
    loose[0].x = 1.25;
    loose[0].z = 0.6;
    // (the rows built once, as the list does on opening: from then on each source knows when its first row turns,
    // and reads the clock, here at a time that is a fraction)
    for (const src of all) expect(src.rows().length).toBeGreaterThan(0);
    world.worldSeconds = 1234.5678;
    let sum = 0;
    const ask = (): void => {
      for (let i = 0; i < all.length; i++) {
        if (all[i].near()) sum++;
        if (all[i].version() === 0) sum++;
      }
      sum += inHand.room!(held) + inCar.load!();
    };
    expect(inHand.near() && onGround.near() && inCar.near() && inCupboard.near()).toBe(true);
    expect(inHand.room!(held)).toBe(4);
    expect(heapGrowth(ask)).toBeLessThan(ALLOCATES / 4);
    expect(sum).toBeGreaterThan(0);
    // and the same asked as the game asks it: through the guard that catches what a source throws, by the open list's own frame
    const told: string[] = [];
    const guarded = all.map((src) => guardedSource(src, (title, asked) => void told.push(`${title} ${asked}`)));
    const lists = guarded.map(() => new Listing());
    const frame = (): void => {
      for (let i = 0; i < guarded.length; i++) sum += lists[i].frame(guarded[i], 0, held);
    };
    frame();
    expect(lists[0].view.put).toBe('试验莓 ×4');
    expect(lists.map((l) => l.view.rows.length)).toEqual([2, 1, 1, 1]);
    expect(heapGrowth(frame)).toBeLessThan(ALLOCATES / 4);
    expect(told).toEqual([]);
  });
});

describe('a source that throws', () => {
  /** a source that works, with every member the list may ask */
  const sound = (): ListSource => ({
    title: '冰箱',
    head: '冰箱里的东西',
    empty: '空的',
    takeWord: '拿出来',
    near: () => true,
    version: () => 7,
    rows: () => [{ zone: '冰箱', name: '试验莓 ×5', mass: 0.25, icon: null }],
    load: () => 0.25,
    takeAt: () => true,
    room: () => 3,
    put: () => 0,
  });
  const boom = (): never => {
    throw new Error('boom');
  };

  it('is asked through as it is while it throws nothing, with what it leaves out left out', () => {
    const told: string[] = [];
    const src = sound();
    const g = guardedSource(src, (title, asked) => void told.push(`${title} ${asked}`));
    expect([g.title, g.head, g.empty, g.takeWord, g.shutEmpty, g.cap]).toEqual(['冰箱', '冰箱里的东西', '空的', '拿出来', undefined, undefined]);
    expect([g.near(), g.version(), g.rows().length, g.load!(), g.takeAt(0), g.room!(item(berries(2))), g.put!(item(berries(2)))]).toEqual([true, 7, 1, 0.25, true, 3, 0]);
    // (the three old lists take nothing in: neither does what guards them)
    const p = new PlainHands();
    const plain = guardedSource(placeSource(hostOf(p).host, aCupboard()), () => {});
    expect([plain.put, plain.room, plain.load]).toEqual([undefined, undefined, undefined]);
    expect(plain.shutEmpty).toBe(true);
    expect(told).toEqual([]);
  });

  it.each(['near', 'version', 'rows', 'load', 'takeAt', 'room', 'put'] as const)('in %s: the throw is told once, the source is out of reach from then on and answers harmlessly', (member) => {
    const told: string[] = [];
    const src = { ...sound(), [member]: boom } as ListSource;
    const g = guardedSource(src, (title, asked, e) => void told.push(`${title} ${asked}: ${(e as Error).message}`));
    const held = item(berries(4));
    const askAll = (): unknown[] => [g.near(), g.version(), g.rows().length, g.load!(), g.takeAt(0), g.room!(held), g.put!(held), g.title];
    // (nothing escapes, whichever is asked first; what comes before the one that throws still answers)
    const first = askAll();
    expect(told).toEqual([`冰箱 ${member}: boom`]);
    expect(g.near()).toBe(false);
    // from then on: no rows, nothing taken, none of the held thing put in, and its name still there for the list's last frame
    expect(askAll()).toEqual([false, 0, 0, 0, false, 0, 4, '冰箱']);
    expect(told.length).toBe(1);
    expect(first.length).toBe(8);
    expect(countOf((held as { item: ItemInstance }).item)).toBe(4);
  });

  it('a put that throws says that none of the held thing went in: the hand keeps it', () => {
    const told: string[] = [];
    const g = guardedSource({ ...sound(), put: boom } as ListSource, (title, asked) => void told.push(`${title} ${asked}`));
    const stack = berries(4);
    // (asked first of all, with the source still sound: what the throw itself answers)
    expect(g.put!(item(stack))).toBe(4);
    expect(g.put!(item(newItem('junk_mug')))).toBe(1);
    expect(told).toEqual(['冰箱 put']);
    // and through the open list's own G: the hand is not emptied
    const hands = { held: item(stack) as Held, use: null };
    const again = guardedSource({ ...sound(), put: boom } as ListSource, () => {});
    expect(new Listing().put(again, hands)).toBe(false);
    expect(hands.held).toEqual(item(stack));
  });

  it('in what it is called, or in telling it apart: nothing escapes either', () => {
    const told: string[] = [];
    const nameless = guardedSource(
      {
        ...sound(),
        get title(): string {
          throw new Error('no name');
        },
      } as ListSource,
      (title, asked) => void told.push(`${title} ${asked}`),
    );
    expect(nameless.title).toBe('');
    expect(nameless.near()).toBe(false);
    expect(told).toEqual(['? title']);
    // whoever is told throws as well
    const loud = guardedSource({ ...sound(), near: boom } as ListSource, boom);
    expect(loud.near()).toBe(false);
    expect(loud.rows()).toEqual([]);
  });
});

describe('the open list (what the game keeps of it from frame to frame)', () => {
  const row = (name: string, icon: string | null = 'pic'): CargoRow => ({ zone: '箱', name, mass: 1, icon });
  /** a source of plain rows that counts how often it is asked for them */
  function counted(names: string[]): ListSource & { built: number; names: string[]; ver: number; icons: (string | null)[]; shutEmpty?: boolean; reach: boolean } {
    const src = {
      title: '箱',
      head: '箱里的东西',
      empty: '空的',
      takeWord: '拿出来',
      names,
      ver: 0,
      built: 0,
      reach: true,
      icons: [] as (string | null)[],
      shutEmpty: undefined as boolean | undefined,
      near: () => src.reach,
      version: () => src.ver,
      rows: () => {
        src.built++;
        return src.names.map((nm, i) => row(nm, src.icons[i] === undefined ? 'pic' : src.icons[i]));
      },
      takeAt: (i: number) => {
        if (src.names[i] === 'stuck') return false;
        src.names.splice(i, 1);
        src.ver++;
        return true;
      },
    };
    return src;
  }

  it('builds the rows only when the source says that what is in it has changed, and says when what it draws differs', () => {
    const src = counted(['a', 'b']);
    const list = new Listing();
    expect(list.rows(src).map((r) => r.name)).toEqual(['a', 'b']);
    expect([src.built, list.view.rev]).toEqual([1, 1]);
    for (let i = 0; i < 10; i++) list.rows(src);
    expect([src.built, list.view.rev]).toEqual([1, 1]);
    src.names.push('c');
    src.ver++;
    expect(list.rows(src).length).toBe(3);
    expect([src.built, list.view.rev]).toEqual([2, 2]);
    // another source: its rows, whatever its version says
    const other = counted(['z']);
    expect(list.rows(other).map((r) => r.name)).toEqual(['z']);
    expect([other.built, list.view.rev]).toEqual([1, 3]);
    // shut and opened again on the same source: built again
    list.reset();
    list.rows(other);
    expect(other.built).toBe(2);
  });

  it('asks again now and then while a picture is still being drawn, and draws again only when one has come', () => {
    const src = counted(['a', 'b']);
    src.icons = ['pic', null];
    const list = new Listing();
    list.rows(src);
    expect([src.built, list.view.rev]).toEqual([1, 1]);
    // the third frame after: asked again; the picture has not come: nothing to draw again
    list.rows(src);
    list.rows(src);
    expect(src.built).toBe(1);
    list.rows(src);
    expect([src.built, list.view.rev]).toEqual([2, 1]);
    // it comes: three frames on the rows are built with it, and drawn; after that nothing is asked any more
    src.icons = ['pic', 'pic2'];
    for (let i = 0; i < 3; i++) list.rows(src);
    expect([src.built, list.view.rev]).toEqual([3, 2]);
    for (let i = 0; i < 10; i++) list.rows(src);
    expect(src.built).toBe(3);
  });

  it('moves the row picked round the ends, and not at all with no rows', () => {
    const list = new Listing();
    const src = counted(['a', 'b', 'c']);
    expect([list.move(src, 0, 1), list.move(src, 2, 1), list.move(src, 0, -1), list.move(src, 1, -1)]).toEqual([1, 0, 2, 0]);
    expect(list.move(counted(['a']), 0, 1)).toBe(0);
    expect(list.move(counted([]), 0, 1)).toBe(-1);
  });

  it('takes the row picked: the one under it is picked next, the last one after the last, and a list that shuts when empty shuts', () => {
    const list = new Listing();
    const src = counted(['a', 'b', 'c']);
    // the middle one: the row that moved up into its place is picked
    expect(list.take(src, 1)).toBe(1);
    expect(src.names).toEqual(['a', 'c']);
    // the last one: the last one left
    expect(list.take(src, 1)).toBe(0);
    expect(src.names).toEqual(['a']);
    // a row picked beyond the end (the rows shrank under it) takes the last
    const more = counted(['a', 'b']);
    expect(list.take(more, 7)).toBe(0);
    expect(more.names).toEqual(['a']);
    // nothing goes (the hands are full): the row picked stays, nothing shuts
    const stuck = counted(['x', 'stuck']);
    stuck.shutEmpty = true;
    expect(list.take(stuck, 1)).toBe(1);
    expect(stuck.names).toEqual(['x', 'stuck']);
    // the last thing out of a source that shuts when empty: the list shuts; out of one that does not: it stays, empty
    stuck.names = ['x'];
    stuck.ver++;
    expect(list.take(stuck, 0)).toBe(-1);
    expect(list.take(src, 0)).toBe(0);
    expect(src.names).toEqual([]);
    // and with no rows at all nothing is asked of the source
    expect(list.take(src, 0)).toBe(0);
  });

  it('G puts the held thing in: the hand is emptied only when all of it went, and what was being eaten is let be', () => {
    const list = new Listing();
    const stack = berries(5);
    const went: Thing[] = [];
    const taking = (left: number): ListSource => ({ ...counted([]), put: (h: Thing) => (went.push(h), left) });
    const hands = { held: item(stack) as Held, use: { kind: 'eat' } as object | null };
    expect(list.put(taking(2), hands)).toBe(false);
    expect([hands.held, hands.use]).toEqual([item(stack), null]);
    expect(list.put(taking(0), hands)).toBe(true);
    expect(hands.held).toBeNull();
    expect(went.length).toBe(2);
    // empty hands, or a source that takes nothing in: nothing is asked, nothing stops
    hands.use = { kind: 'eat' };
    expect(list.put(taking(0), hands)).toBe(false);
    hands.held = item(stack);
    expect(list.put(counted([]), hands)).toBe(false);
    expect([hands.held, hands.use]).toEqual([item(stack), { kind: 'eat' }]);
    expect(went.length).toBe(2);
  });

  it('every frame: out of reach shuts it; the row picked is kept within the rows; G is offered only while the held thing would go in, by its name and kind as they are now', () => {
    const p = realHands();
    const { host } = hostOf(p);
    const box = basketWith(10);
    p.slots[0] = item(box);
    const src = boxSource(host, box);
    const list = new Listing();
    // the box itself in the hands: nothing to put in
    expect(list.frame(src, 5, p.slots[0])).toBe(0);
    expect(list.view).toMatchObject({ title: '试验篮', head: '试验篮里的东西', take: '拿出来', sel: 0, put: '', cap: { slots: 2, maxKg: 1 } });
    expect(list.view.rows.map((r) => r.name)).toEqual(['试验莓 ×10']);
    expect(list.view.load).toBeCloseTo(0.5);
    // berries in the hands: all of them would go; more than would go: said how many
    const five = item(berries(5));
    list.frame(src, 0, five);
    expect(list.view.put).toBe('试验莓 ×5');
    const twelve = item(berries(12));
    list.frame(src, 0, twelve);
    expect(list.view.put).toBe('试验莓 ×12（放得下 10 个）');
    // a thing it does not hold, and empty hands: no line
    list.frame(src, 0, item(newItem('food_chips')));
    expect(list.view.put).toBe('');
    list.frame(src, 0, null);
    expect(list.view.put).toBe('');
    // the held thing turns in the hands (the same thing in the same slot, another kind: the hands settle it where it is): the line says what it is now
    const old = berries(3);
    const held = item(old);
    list.frame(src, 0, held);
    expect(list.view.put).toBe('试验莓 ×3');
    old.item = 'tl_mush';
    delete old.fresh;
    delete old.t0;
    list.frame(src, 0, held);
    expect(list.view.put).toBe('烂莓 ×3');
    // out of reach: the list shuts
    p.slots[0] = null;
    expect(list.frame(src, 0, held)).toBe(-1);
  });
});

describe('a found thing coming into the world', () => {
  it('is one plain thing as it always was, or the stack, quality and state its Found says, its freshness starting now', () => {
    world.worldSeconds = 7200;
    const plain = heldOfFound({ item: 'food_chips' }) as { kind: 'item'; item: ItemInstance };
    expect(Object.keys(plain.item).sort()).toEqual(['item', 'uid']);
    const state = { marked: true };
    const f = heldOfFound({ item: 'tl_berry', n: 5, q: 3, state: state as never }) as { kind: 'item'; item: ItemInstance };
    expect(f.item).toMatchObject({ item: 'tl_berry', n: 5, q: 3, fresh: 1, t0: 7200, state: { marked: true } });
    expect(f.item.state).not.toBe(state);
    // never more than one stack of it
    expect(countOf((heldOfFound({ item: 'tl_berry', n: 99 }) as { item: ItemInstance }).item)).toBe(12);
    expect((heldOfFound({ item: 'tl_berry', n: 1 }) as { item: ItemInstance }).item.n).toBeUndefined();
  });
});
