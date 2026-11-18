/**
 * The world's side of the item model with its real parts together, in Node (docs/V3/nodes/N0-items-world.md):
 * the real things lying about (loose.ts; only their models are left out: each stays its stand-in), the real
 * places (places.ts) on a world of one place, the real weighing of what a vehicle carries (cargo.ts), the real
 * hands (player.ts) and the list's sources (listSources.ts).
 *
 *  - A place's own thing lying in plain sight that changes where it lies is one's own from that moment: a box
 *    filled through its list, a stack partly picked up. It is saved with the things lying about at once (a save
 *    taken before the next frame holds it once), and the place never makes it again.
 *  - A thing riding in a vehicle that turns into a kind of another weight, or whose contents do, is weighed
 *    again: the vehicle's load and its list follow.
 */
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { countOf, itemSig, newItem, putInside, registerItemCat, registerItems, type ItemInstance } from '../../src/core/modcar/items';
import { FunctionLand } from '../../src/core/onfoot/land';
import { CargoBay } from '../../src/game/modcar/cargo';
import { setItemClock } from '../../src/game/modcar/itemTime';
import { boxSource, vehicleSource, type ListHost } from '../../src/game/modcar/listSources';
import { LooseThings, type Loose } from '../../src/game/modcar/loose';
import { CarMaterials } from '../../src/game/modcar/materials';
import { Places, type PlacesHost, type PlacesSave } from '../../src/game/modcar/places';
import { ModPlayer, type Held, type PlayerHost } from '../../src/game/modcar/player';

// (no model is fetched: every thing lying about stays the stand-in it starts as)
vi.mock('../../src/game/modcar/assets', async (original) => ({ ...(await original<typeof import('../../src/game/modcar/assets')>()), itemGlb: async () => null }));
// (what lies in plain sight at the test's place: a basket, and a stack of twelve berries as a Found with a count
// says it; every other name is what the game makes of it)
vi.mock('../../src/core/modcar/loot', async (original) => {
  const real = await original<typeof import('../../src/core/modcar/loot')>();
  return {
    ...real,
    looseFound: (old: string, seed: number, s: number, kind: string) => (old === 'test.basket' ? { item: 'tw_basket' } : old === 'test.berries' ? { item: 'tw_berry', n: 12 } : real.looseFound(old, seed, s, kind)),
  };
});

registerItemCat({ id: 'tw', name: { zh: '试验', en: 'Test' } });
registerItems([
  { id: 'tw_berry', cat: 'tw', name: { zh: '试验莓', en: 'Test berry' }, stars: 1, mass: 0.05, stack: 12, tags: ['tw'], perish: { hours: 24, into: 'tw_mush' } },
  { id: 'tw_mush', cat: 'tw', name: { zh: '烂莓', en: 'Mush' }, stars: 0, mass: 0.05, stack: 12, tags: ['tw'] },
  { id: 'tw_basket', cat: 'tw', name: { zh: '试验篮', en: 'Test basket' }, stars: 1, mass: 0.6, carry: 'small', holds: { slots: 4, accepts: ['#tw'], maxKg: 3, decay: 0.5 } },
  // (what it goes off into weighs a quarter of it)
  { id: 'tw_fish', cat: 'tw', name: { zh: '试验鱼', en: 'Test fish' }, stars: 1, mass: 0.4, tags: ['tw'], perish: { hours: 12, into: 'tw_bones' } },
  { id: 'tw_bones', cat: 'tw', name: { zh: '鱼骨', en: 'Fish bones' }, stars: 0, mass: 0.1, tags: ['tw'] },
]);

const HOUR = 3600;
const clock = { worldSeconds: 0 };
setItemClock(clock);
afterEach(() => {
  clock.worldSeconds = 0;
});

const item = (i: ItemInstance): NonNullable<Held> => ({ kind: 'item', item: i });
const berries = (k: number): ItemInstance => newItem('tw_berry', { n: k, t0: 0 });

/** the one place of the test's world: a basket, a stack of berries and a third thing lie in plain sight at it */
const SITE = {
  id: 'site1',
  kind: 'house',
  x: 0,
  z: 0,
  reach: 5,
  s: 0,
  seed: 7,
  containers: [],
  fuel: [],
  objects: [],
  loose: [
    { id: 'site1/l0', item: 'test.basket', n: 1, x: 1, y: 0, z: 0, yaw: 0 },
    { id: 'site1/l1', item: 'test.berries', n: 1, x: 1.5, y: 0, z: 0.5, yaw: 0 },
    { id: 'site1/l2', item: 'junk.thing', n: 1, x: 2, y: 0, z: -1, yaw: 0 },
  ],
};

/** a vehicle as the weighing and the vehicle's list need it */
function aVehicle() {
  const model = new THREE.Object3D();
  const v = { view: { model, root: model, frame: { id: 'sedan', name: { zh: '轿车' } } }, build: { cargo: [] as { m: number }[] }, sys: { rebuilds: 0, rebuild: () => void v.sys.rebuilds++ }, awake: 0, sim: { px: 0, pz: 0, kmh: 0, spec: { body: { halfLength: 2 } } }, frame: model, surfaceAt: () => null };
  return v;
}

/** the game's parts that keep things in the world, as they really are, round a place and a player; `save`: what the places were saved as */
function aWorld(save?: PlacesSave) {
  const core = { scene: new THREE.Scene(), origin: { x: 0, y: 0, z: 0 }, place: () => {} };
  const L = new LooseThings(core as never, new CarMaterials(), () => 0);
  const cargo = new CargoBay(core as never, L);
  const vehicles: ReturnType<typeof aVehicle>[] = [];
  const said: string[] = [];
  const placesHost = {
    world: { spine: { sAtX: (x: number) => x }, sites: { between: (_a: number, _b: number, out: unknown[]) => void out.push(SITE) } },
    origin: core.origin,
    loose: L,
    vehicles,
    play: () => {},
    loop: () => {},
    say: () => {},
    openContainer: () => {},
    fuelled: () => {},
  };
  const places = new Places(placesHost as unknown as PlacesHost, save);
  // the hands, with the mark on whichever thing the test says
  const mark = { on: null as Loose | null };
  const playerHost = {
    vehicles,
    devices: [],
    tanks: [],
    origin: core.origin,
    loose: {
      list: L.list,
      pick: (_e: unknown, _d: unknown, _r: number, filter?: (l: Loose) => boolean) => (mark.on && L.list.includes(mark.on) && (!filter || filter(mark.on)) ? { loose: mark.on, dist: 1 } : null),
      highlight: () => {},
      remove: (l: Loose) => L.remove(l),
      touch: (l?: Loose) => L.touch(l),
      addItem: (it: ItemInstance, x: number, y: number, z: number) => L.addItem(it, x, y, z),
      drop: (l: Loose) => L.drop(l),
    },
    ui: { lang: 'zh', say: () => {}, prompt: () => {}, items: { showActions: () => {}, showCards: () => {}, showKeys: () => {}, showTransfer: () => {}, showHotbar: () => {}, showDone: () => {} } },
    cargo: { showGhost: () => {}, aim: () => null },
    changed: () => {},
    enter: () => {},
    sound: () => {},
    iconOf: () => null,
    cargoChanged: (v: unknown) => cargo.weigh(v as never),
    consume: () => {},
    drank: () => {},
    camera: null,
    grimeCast: () => null,
    paintCast: () => null,
    listOpen: false,
  };
  const player = new ModPlayer(new FunctionLand(() => 0), playerHost as unknown as PlayerHost);
  const keys = { run: false, jump: false, drop: false, take: false, forward: 0, right: 0 };
  /** look at a thing lying about and press E, as the player does */
  const pickUp = (l: Loose): void => {
    mark.on = l;
    player.update(1 / 60, 0, 0, keys);
    player.press();
    player.update(1 / 60, 0, 0, keys);
    player.release();
    player.update(1 / 60, 0, 0, keys);
  };
  /** what the list's sources ask of the game */
  const host = { player, loose: L, cargo, vehicles, seated: null, places, ui: { say: (t: string) => void said.push(t) }, iconOf: () => 'pic', sound: () => {} } as unknown as ListHost;
  /** the things lying about as the game saves them: all but the places' own (ModGame.snapshot) */
  const saved = (): Loose[] => L.list.filter((l) => !places.owns(l));
  const of = (kind: string): Loose[] => L.list.filter((l) => l.item?.item === kind);
  return { L, cargo, places, player, pickUp, host, vehicles, saved, of, said };
}

const inSlot = (p: ModPlayer, i: number): ItemInstance | null => {
  const h = p.slots[i];
  return h?.kind === 'item' ? h.item : null;
};

describe("a place's own thing in plain sight that changes where it lies", () => {
  it('is the place’s while nothing is done to it: not saved with the things lying about, gone with the place, made again when one comes back', () => {
    const w = aWorld();
    w.places.update(1, 0, 0);
    expect(w.L.list.length).toBe(3);
    expect(w.of('tw_basket').length).toBe(1);
    expect(countOf(w.of('tw_berry')[0].item!)).toBe(12);
    expect(w.saved()).toEqual([]);
    expect(w.places.snapshot().taken).toEqual([]);
    w.places.update(1, 1000, 0);
    expect(w.L.list.length).toBe(0);
    w.places.update(1, 0, 0);
    expect(w.L.list.length).toBe(3);
  });

  it('a basket filled through its list is one’s own at once: saved with what is in it, and never made again', () => {
    const w = aWorld();
    w.places.update(1, 0, 0);
    const box = w.of('tw_basket')[0];
    expect(w.places.owns(box)).toBe(true);
    // Tab with the mark on it, and G with five berries in the hands
    w.player.slots[0] = item(berries(5));
    const src = boxSource(w.host, box.item!);
    expect(src.near()).toBe(true);
    expect(src.put!(w.player.slots[0]!)).toBe(0);
    expect(itemSig(box.item!)).toBe('tw_basket[tw_berry*5]');
    expect(box.touched).toBe(true);
    // before another frame has passed: the place has let it go, and a save taken now holds it, once, with the berries in it
    expect(w.places.owns(box)).toBe(false);
    const save = w.places.snapshot();
    expect(save.taken).toEqual(['site1/l0']);
    expect(w.saved()).toEqual([box]);
    // one goes on down the road: the place's other things go with it, the basket stays where it lies
    w.places.update(1, 1000, 0);
    expect(w.L.list).toEqual([box]);
    // and comes back: the others are there again, the basket is not made a second time
    w.places.update(1, 0, 0);
    expect(w.of('tw_basket')).toEqual([box]);
    expect(itemSig(box.item!)).toBe('tw_basket[tw_berry*5]');
    expect(w.L.list.length).toBe(3);
    // the game read back from that save (the basket among the things lying about, as the game restores them): the place makes the other two only
    const again = aWorld(JSON.parse(JSON.stringify(save)) as PlacesSave);
    again.L.addItem(JSON.parse(JSON.stringify(box.item)) as ItemInstance, box.x, box.y, box.z);
    again.places.update(1, 0, 0);
    expect(again.of('tw_basket').length).toBe(1);
    expect(itemSig(again.of('tw_basket')[0].item!)).toBe('tw_basket[tw_berry*5]');
    expect(again.L.list.length).toBe(3);
  });

  it('taking a thing out of such a basket lets it go likewise', () => {
    const w = aWorld();
    w.places.update(1, 0, 0);
    const box = w.of('tw_basket')[0];
    // (as if the place had put a basket with berries in it there)
    expect(putInside(box.item!, berries(3), 0)).toBe(0);
    expect(w.places.owns(box)).toBe(true);
    const src = boxSource(w.host, box.item!);
    src.rows();
    expect(src.takeAt(0)).toBe(true);
    expect(countOf(inSlot(w.player, 0)!)).toBe(3);
    expect(w.places.owns(box)).toBe(false);
    expect(w.places.snapshot().taken).toEqual(['site1/l0']);
  });

  it('a stack partly picked up is one’s own at once: what is left lies there once, saved, and is never made whole again', () => {
    const w = aWorld();
    w.places.update(1, 0, 0);
    const stack = w.of('tw_berry')[0];
    expect(countOf(stack.item!)).toBe(12);
    // ten berries in one hand, the other hand full: two of the twelve go onto the stack in the hand
    w.player.slots[0] = item(berries(10));
    w.player.slots[1] = item(newItem('food_chips'));
    w.pickUp(stack);
    expect(countOf(inSlot(w.player, 0)!)).toBe(12);
    expect(countOf(stack.item!)).toBe(10);
    expect(w.L.list.includes(stack)).toBe(true);
    expect(stack.touched).toBe(true);
    // before another frame of the places: let go, and a save taken now holds the ten that are left, once
    expect(w.places.owns(stack)).toBe(false);
    const save = w.places.snapshot();
    expect(save.taken).toEqual(['site1/l1']);
    expect(w.saved()).toEqual([stack]);
    // away and back: ten lie there, the same thing; twelve in the hands; twenty-two in all, as there were
    w.places.update(1, 1000, 0);
    expect(w.L.list).toEqual([stack]);
    w.places.update(1, 0, 0);
    expect(w.of('tw_berry')).toEqual([stack]);
    expect(countOf(stack.item!) + countOf(inSlot(w.player, 0)!)).toBe(22);
    // the game read back from that save: no second stack
    const again = aWorld(JSON.parse(JSON.stringify(save)) as PlacesSave);
    again.L.addItem(JSON.parse(JSON.stringify(stack.item)) as ItemInstance, stack.x, stack.y, stack.z);
    again.places.update(1, 0, 0);
    expect(again.of('tw_berry').map((l) => countOf(l.item!))).toEqual([10]);
  });

  it('a thing picked up whole or moved is let go as it always was, and now at once when a save asks', () => {
    const w = aWorld();
    w.places.update(1, 0, 0);
    const stack = w.of('tw_berry')[0];
    const box = w.of('tw_basket')[0];
    // picked up whole (both hands free): gone from the things lying about
    w.pickUp(stack);
    expect(w.L.list.includes(stack)).toBe(false);
    expect(inSlot(w.player, w.player.sel)).toBe(stack.item);
    // moved half a metre
    box.x += 0.5;
    expect(w.places.owns(box)).toBe(false);
    expect(w.places.snapshot().taken.sort()).toEqual(['site1/l0', 'site1/l1']);
    expect(w.saved()).toEqual([box]);
  });
});

describe('a thing riding in a vehicle that turns into another kind', () => {
  const at = { pos: new THREE.Vector3(0, 0.5, 0), rot: new THREE.Quaternion() };

  it('is weighed again as the things lying about are looked over, one a frame: the load is the new kind’s', () => {
    const w = aWorld();
    const car = aVehicle();
    w.vehicles.push(car);
    const fish = newItem('tw_fish', { t0: 0 });
    const l = w.L.addItem(fish, 0, 0.5, 0);
    w.L.ride(l, car as never, at);
    w.cargo.weigh(car as never);
    expect(w.cargo.loadOf(car as never)).toBeCloseTo(0.4);
    const rebuilds = car.sys.rebuilds;
    // half a day on it has turned; a frame or two and the game has seen it
    clock.worldSeconds = 13 * HOUR;
    for (let i = 0; i < 3; i++) w.L.update(1 / 60);
    expect(fish.item).toBe('tw_bones');
    expect([l.madeAs, l.obj.name, l.obj.children.length]).toEqual(['tw_bones', 'loose:tw_bones', 1]);
    expect(w.cargo.loadOf(car as never)).toBeCloseTo(0.1);
    expect(car.sys.rebuilds).toBe(rebuilds + 1);
    // (and it is left at that: nothing is weighed every frame)
    for (let i = 0; i < 5; i++) w.L.update(1 / 60);
    expect(car.sys.rebuilds).toBe(rebuilds + 1);
  });

  it('or as the vehicle’s list builds its rows: the row is the new kind and the load under the name the new weight', () => {
    const w = aWorld();
    const car = aVehicle();
    w.vehicles.push(car);
    const fish = newItem('tw_fish', { t0: 0 });
    w.L.ride(w.L.addItem(fish, 0, 0.5, 0), car as never, at);
    w.cargo.weigh(car as never);
    const src = vehicleSource(w.host, car as never);
    expect(src.rows().map((r) => [r.name, r.mass])).toEqual([['试验鱼', 0.4]]);
    expect(src.load!()).toBeCloseTo(0.4);
    const v0 = src.version();
    clock.worldSeconds = 12 * HOUR + 1;
    // the open list notices the time by itself
    expect(src.version()).not.toBe(v0);
    expect(src.rows().map((r) => [r.name, r.mass])).toEqual([['鱼骨', 0.1]]);
    expect(src.load!()).toBeCloseTo(0.1);
  });

  it('and a basket riding there whose contents turn weighs what they weigh now', () => {
    const w = aWorld();
    const car = aVehicle();
    w.vehicles.push(car);
    const box = newItem('tw_basket');
    expect(putInside(box, newItem('tw_fish', { t0: 0 }), 0)).toBe(0);
    const l = w.L.addItem(box, 0, 0.5, 0);
    w.L.ride(l, car as never, at);
    w.cargo.weigh(car as never);
    expect(w.cargo.loadOf(car as never)).toBeCloseTo(1.0);
    // in the basket it keeps twice as long: a day
    clock.worldSeconds = 13 * HOUR;
    for (let i = 0; i < 3; i++) w.L.update(1 / 60);
    expect(itemSig(box)).toBe('tw_basket[tw_fish]');
    expect(w.cargo.loadOf(car as never)).toBeCloseTo(1.0);
    clock.worldSeconds = 25 * HOUR;
    for (let i = 0; i < 3; i++) w.L.update(1 / 60);
    expect(itemSig(box)).toBe('tw_basket[tw_bones]');
    expect(w.cargo.loadOf(car as never)).toBeCloseTo(0.7);
    // (the basket itself did not change kind, nor was it touched by a hand: it is drawn as it was)
    expect([l.madeAs, l.touched]).toEqual(['tw_basket', undefined]);
  });
});
