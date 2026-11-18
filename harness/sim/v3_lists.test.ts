/**
 * The list's sources (src/game/modcar/listSources.ts) and a found thing coming into the world (places.ts
 * heldOfFound), without the game: a stand-in for the hands and for what the sources ask of the game.
 *
 * The hands are tried in two makes, because the sources must hold for both: the plain ones (a thing goes into a
 * free slot, whole, or not at all) and ones that stack (onto a stack in a slot, into a box in a slot, else a
 * free slot), which is what makes taking a thing out of a box one is holding the case to get right: it must
 * not go straight back into that box.
 */
import { describe, expect, it } from 'vitest';
import { accepts, countOf, itemSig, mergeStacks, newItem, putInside, registerItemCat, registerItems, roomInside, stackMax, type ItemInstance } from '../../src/core/modcar/items';
import { setItemClock } from '../../src/game/modcar/itemTime';
import { boxSource, guardedSource, placeSource, vehicleSource, type ListHost, type ListSource } from '../../src/game/modcar/listSources';
import type { Loose } from '../../src/game/modcar/loose';
import { heldOfFound, PlaceContainer } from '../../src/game/modcar/places';
import type { Held } from '../../src/game/modcar/player';
import { ALLOCATES, heapGrowth } from './v3/heap';

registerItemCat({ id: 'tl', name: { zh: '试验', en: 'Test' } });
registerItems([
  { id: 'tl_berry', cat: 'tl', name: { zh: '试验莓', en: 'Test berry' }, stars: 1, mass: 0.05, stack: 12, tags: ['tl'], perish: { hours: 24, into: 'tl_mush' }, salvage: { organics: 1 } },
  { id: 'tl_mush', cat: 'tl', name: { zh: '烂莓', en: 'Mush' }, stars: 0, mass: 0.05, stack: 12 },
  { id: 'tl_basket', cat: 'tl', name: { zh: '试验篮', en: 'Test basket' }, stars: 1, mass: 0.6, carry: 'small', holds: { slots: 2, accepts: ['#tl'], maxKg: 1, decay: 0.5 } },
]);

type Thing = NonNullable<Held>;
const item = (i: ItemInstance): Thing => ({ kind: 'item', item: i });
const n = (h: Thing): number => (h.kind === 'item' ? countOf(h.item) : 1);

/** the hands as they were before stacks: a free slot (the selected one first) takes the thing whole, or nothing does */
class PlainHands {
  slots: Held[] = [null, null];
  sel = 0;
  pack: ItemInstance | null = null;
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

/** hands that stack: onto a stack in a slot, into a box in a slot, else a free slot */
class StackHands extends PlainHands {
  override roomFor(h: Thing): number {
    if (h.kind !== 'item') return super.roomFor(h);
    let room = this.freeSlot() >= 0 ? stackMax(h.item.item) : 0;
    for (const s of this.slots) {
      if (s?.kind !== 'item') continue;
      if (s.item.item === h.item.item && !s.item.inside) room += stackMax(s.item.item) - countOf(s.item);
      else if (accepts(s.item, h.item)) room += roomInside(s.item, h.item, 0);
    }
    return Math.min(countOf(h.item), room);
  }
  override receive(h: Thing): number {
    if (h.kind !== 'item') return super.receive(h);
    for (const s of this.slots) if (s?.kind === 'item' && mergeStacks(s.item, h.item, 0) === 0) return 0;
    for (const s of this.slots) if (s?.kind === 'item' && accepts(s.item, h.item) && putInside(s.item, h.item, 0) === 0) return 0;
    return super.receive(h);
  }
}

function hostOf(hands: PlainHands): { host: ListHost; said: string[]; loose: Loose[]; weighed: unknown[] } {
  const said: string[] = [];
  const loose: Loose[] = [];
  const weighed: unknown[] = [];
  const L = {
    list: loose,
    rev: 0,
    touch(): void {
      this.rev++;
    },
    remove(l: Loose): void {
      loose.splice(loose.indexOf(l), 1);
      this.rev++;
    },
    settle: (): boolean => false,
    addItem(): never {
      throw new Error('a thing was put down at the feet: it found no way back into its box');
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
    iconOf: () => null,
    sound: () => {},
  };
  return { host: host as unknown as ListHost, said, loose, weighed };
}

const lying = (i: ItemInstance, x: number, on?: unknown): Loose => ({ uid: `l${i.uid}`, part: null, tool: null, item: i, x, y: 0, z: 0, yaw: 0, vy: 0, resting: true, radius: 0.2, mid: 0.1, riding: on ? { on } : null }) as unknown as Loose;

const berries = (k: number): ItemInstance => newItem('tl_berry', { n: k, t0: 0 });

/** a basket with these stacks in it (a number: so many plain berries) */
function basketWith(...stacks: (number | ItemInstance)[]): ItemInstance {
  const box = newItem('tl_basket');
  for (const k of stacks) expect(putInside(box, typeof k === 'number' ? berries(k) : k, 0)).toBe(0);
  return box;
}

describe.each([
  ['plain hands', (): PlainHands => new PlainHands()],
  ['hands that stack', (): PlainHands => new StackHands()],
])('a box as a list source, with %s', (_name, hands) => {
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
    expect(p.slots[0]).toEqual(item(box));
    expect(p.slots[1]?.kind === 'item' && p.slots[1].item.item).toBe('tl_berry');
    expect(p.slots[1]?.kind === 'item' && countOf(p.slots[1].item)).toBe(5);
    // (the thing taken out is in the hands: its slot is the one selected)
    expect(p.sel).toBe(1);
    expect(said).toEqual([]);
  });

  it('leaves the box as it was when no hand is free', () => {
    const p = hands();
    const { host, said } = hostOf(p);
    // (two rows: stacks of another quality do not join)
    const box = basketWith(5, newItem('tl_berry', { n: 12, t0: 0, q: 2 }));
    p.slots[0] = item(box);
    p.slots[1] = item(newItem('food_chips'));
    const src = boxSource(host, box);
    src.rows();
    const sig = itemSig(box);
    const uids = box.inside!.map((x) => x.uid);
    const v0 = src.version();
    expect(src.takeAt(0)).toBe(false);
    expect(itemSig(box)).toBe(sig);
    expect(box.inside!.map((x) => x.uid)).toEqual(uids);
    expect(src.version()).toBe(v0);
    expect(p.slots[0]).toEqual(item(box));
    expect(said.length).toBe(1);
  });

  it('takes from a box lying within reach, and shuts when one has walked away from it or it is gone', () => {
    const p = hands();
    const { host, loose, weighed } = hostOf(p);
    const box = basketWith(4);
    const car = {};
    (host.vehicles as unknown[]).push(car);
    const l = lying(box, 1.5, car);
    loose.push(l);
    host.loose.touch();
    const src = boxSource(host, box);
    expect(src.near()).toBe(true);
    src.rows();
    expect(src.takeAt(0)).toBe(true);
    expect(box.inside).toBeUndefined();
    expect(countOf((p.slots[p.sel] as { item: ItemInstance }).item)).toBe(4);
    // (it rides in a vehicle: lighter by four berries, weighed again)
    expect(weighed).toEqual([car]);
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
    expect(src.put!(five)).toBe(0);
    expect(itemSig(box)).toBe('tl_basket[tl_berry*12,tl_berry*3]');
    const eight = item(berries(8));
    expect(src.room!(eight)).toBe(5);
    // (asked again with nothing changed: the same answer, which the box source does not work out twice)
    expect(src.room!(eight)).toBe(5);
    expect(src.put!(eight)).toBe(3);
    expect(countOf((eight as { item: ItemInstance }).item)).toBe(3);
    expect(itemSig(box)).toBe('tl_basket[tl_berry*12,tl_berry*8]');
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

describe('a box as a list source, with hands that stack', () => {
  it('gives what the hands have room for and keeps the rest in its row', () => {
    const p = new StackHands();
    const { host } = hostOf(p);
    const box = basketWith(5, newItem('tl_berry', { n: 7, t0: 0, q: 2 }));
    p.slots[0] = item(box);
    p.slots[1] = item(berries(10));
    const src = boxSource(host, box);
    src.rows();
    const first = box.inside![0].uid;
    expect(src.takeAt(0)).toBe(true);
    // two onto the stack in the other hand; three stay, in the same row
    expect(countOf((p.slots[1] as { item: ItemInstance }).item)).toBe(12);
    expect(itemSig(box)).toBe('tl_basket[tl_berry*3,tl_berry*7|q2]');
    expect(box.inside![0].uid).toBe(first);
    expect(p.slots[0]).toEqual(item(box));
    // the stack in the hand is full now: nothing more comes out, and the box is as it was
    const sig = itemSig(box);
    expect(src.takeAt(0)).toBe(false);
    expect(itemSig(box)).toBe(sig);
    expect(box.inside![0].uid).toBe(first);
  });
});

describe('the lists of a vehicle and of a place with hands that stack', () => {
  it('a stack only partly taken stays where it was, fewer, and is weighed again', () => {
    const p = new StackHands();
    const { host, loose, weighed } = hostOf(p);
    p.slots[0] = item(berries(10));
    p.slots[1] = item(newItem('food_chips'));
    const car = { view: { frame: { id: 'sedan', name: { zh: '轿车' } } }, sim: { px: 0, pz: 0, kmh: 0, spec: { body: { halfLength: 2 } } } };
    (host.vehicles as unknown[]).push(car);
    const stack = berries(5);
    loose.push(lying(stack, 0, car));
    const src = vehicleSource(host, car as never);
    expect(src.rows().map((r) => r.name)).toEqual(['试验莓 ×5']);
    expect(src.takeAt(0)).toBe(true);
    expect(countOf(stack)).toBe(3);
    expect(loose.length).toBe(1);
    expect(weighed).toEqual([car]);
    expect(src.rows().map((r) => r.name)).toEqual(['试验莓 ×3']);
    // the hands are full: nothing goes, the thing stays
    expect(src.takeAt(0)).toBe(false);
    expect(loose.length).toBe(1);
  });

  it('the same in a cupboard: what is left is kept as it stands', () => {
    const p = new StackHands();
    const { host } = hostOf(p);
    p.slots[0] = item(berries(11));
    p.slots[1] = item(newItem('food_chips'));
    const pc = new PlaceContainer({ id: 'c1', x: 0, z: 0, hx: 0.4, hz: 0.3 } as never, {} as never, '橱柜');
    pc.contents = [item(berries(4)), item(newItem('junk_mug'))];
    const src = placeSource(host, pc);
    expect(src.rows().length).toBe(2);
    const rev = pc.rev;
    expect(src.takeAt(0)).toBe(true);
    expect(pc.contents.length).toBe(2);
    expect(countOf((pc.contents[0] as { item: ItemInstance }).item)).toBe(3);
    expect(pc.rev).toBeGreaterThan(rev);
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
    const car = { view: { frame: { id: 'sedan', name: { zh: '轿车' } } }, sim: { px: 0, pz: 0, kmh: 0, spec: { body: { halfLength: 2 } } } };
    (host.vehicles as unknown[]).push(car);
    const inCar = vehicleSource(host, car as never);
    const pc = new PlaceContainer({ id: 'c1', x: 0, z: 0, hx: 0.4, hz: 0.3 } as never, {} as never, '橱柜');
    pc.contents = [item(berries(4))];
    const inCupboard = placeSource(host, pc);
    const all = [inHand, onGround, inCar, inCupboard];
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
    // and the same asked as the game asks it, through the guard that catches what a source throws
    const told: string[] = [];
    const guarded = all.map((src) => guardedSource(src, (title, asked) => void told.push(`${title} ${asked}`)));
    const gHand = guarded[0];
    const gCar = guarded[2];
    const askGuarded = (): void => {
      for (let i = 0; i < guarded.length; i++) {
        if (guarded[i].near()) sum++;
        if (guarded[i].version() === 0) sum++;
        if (guarded[i].title === '') sum++;
      }
      sum += gHand.room!(held) + gCar.load!();
    };
    expect(gHand.room!(held)).toBe(4);
    expect(heapGrowth(askGuarded)).toBeLessThan(ALLOCATES / 4);
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
    const plain = guardedSource(placeSource(hostOf(p).host, new PlaceContainer({ id: 'c1', x: 0, z: 0, hx: 0.4, hz: 0.3 } as never, {} as never, '橱柜')), () => {});
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

describe('a found thing coming into the world', () => {
  it('is one plain thing as it always was, or the stack, quality and state its Found says, its freshness starting now', () => {
    setItemClock({ worldSeconds: 7200 });
    try {
      const plain = heldOfFound({ item: 'food_chips' }) as { kind: 'item'; item: ItemInstance };
      expect(Object.keys(plain.item).sort()).toEqual(['item', 'uid']);
      const state = { marked: true };
      const f = heldOfFound({ item: 'tl_berry', n: 5, q: 3, state: state as never }) as { kind: 'item'; item: ItemInstance };
      expect(f.item).toMatchObject({ item: 'tl_berry', n: 5, q: 3, fresh: 1, t0: 7200, state: { marked: true } });
      expect(f.item.state).not.toBe(state);
      // never more than one stack of it
      expect(countOf((heldOfFound({ item: 'tl_berry', n: 99 }) as { item: ItemInstance }).item)).toBe(12);
      expect((heldOfFound({ item: 'tl_berry', n: 1 }) as { item: ItemInstance }).item.n).toBeUndefined();
    } finally {
      setItemClock(null);
    }
  });
});
