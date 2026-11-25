/**
 * Stacks, things that hold things and freshness through the save (src/game/modcar/save.ts, restore.ts,
 * docs/V3/nodes/N0-items.md), with the game's real save functions — `writeSave`, `loadSave`, `pushRestore`,
 * `useRestore` run in Node as they are, the browser's storage stood in for by a map — and the stand-in game
 * (harness/sim/v3/fakeGame.ts) for the world's clock a save is written and read with.
 *
 * Wherever a save holds a thing (a slot of the hotbar, the backpack one has on, the floor, a vehicle, a wreck
 * kept as it was left, a place's container, a basket in any of them) it comes back as it was: its count, what
 * is in it, how fresh, its quality and state. A save from before any of this loads exactly as it did. A thing
 * of a kind this build does not have is left out and counted, at every holder and depth, and everything else
 * is read. No uid read back is given out again: a part's, a tool's, a thing's, a thing's in a basket. A stack
 * used up is never written, and writing changes nothing. The size of two hundred stacks is printed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newInstance, stockBuild } from '../../src/core/modcar/build';
import { countOf, freshNow, hasItem, itemSig, newItem, registerItemCat, registerItems, splitStack, type ItemInstance } from '../../src/core/modcar/items';
import { newTool, type Tool } from '../../src/core/modcar/tools';
import { itemNow } from '../../src/game/modcar/itemTime';
import { pushRestore, restorePoints, useRestore } from '../../src/game/modcar/restore';
import { backInTheWorld, forEachSavedItem, loadLoss, loadSave, lossWords, writableSave, writeSave, type SaveV1, type SavedLoose } from '../../src/game/modcar/save';
import { FakeGame } from './v3/fakeGame';

const KEY = 'modcar.save.v1';
const H = 3600;

registerItemCat({ id: 'ts', name: { zh: '存档试验', en: 'Save trial' } });
registerItems([
  { id: 'ts_berry', cat: 'ts', name: { zh: '莓', en: 'berry' }, stars: 1, mass: 0.05, stack: 12, tags: ['forage'], perish: { hours: 24, into: 'ts_mush' } },
  { id: 'ts_mush', cat: 'ts', name: { zh: '烂莓', en: 'mush' }, stars: 0, mass: 0.05, stack: 12 },
  { id: 'ts_jerky', cat: 'ts', name: { zh: '肉干', en: 'jerky' }, stars: 2, mass: 0.1, stack: 8, tags: ['forage'] },
  { id: 'ts_page', cat: 'ts', name: { zh: '图纸', en: 'page' }, stars: 2, mass: 0.01, stack: 5 },
  { id: 'ts_basket', cat: 'ts', name: { zh: '篮', en: 'basket' }, stars: 1, mass: 0.5, holds: { slots: 4, accepts: ['#forage'], maxKg: 3, decay: 0.5 } },
]);

/** the browser's storage, as much of it as save.ts uses */
function fakeStorage(): { store: Map<string, string>; api: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> } {
  const store = new Map<string, string>();
  return { store, api: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, String(v)), removeItem: (k) => void store.delete(k) } };
}

/** where a thing lies, as a save has it */
const at = (o: Partial<SavedLoose>, x = 1): SavedLoose => ({ x, y: 0, z: 2, yaw: 0.5, ...o });
/** a thing riding in the i-th vehicle */
const riding = (o: Partial<SavedLoose>, on: number): SavedLoose => at({ ...o, on, pos: [0.1, 0.6, -1.2], rot: [0, 0, 0, 1], zone: 'boot' });
/** a thing of a kind this build does not have, as another build wrote it */
const gone = (uid: string, more: Record<string, unknown> = {}): ItemInstance => ({ uid, item: 'gone_thing', ...more }) as unknown as ItemInstance;
/** a basket with things in it, as the game makes one (its contents at its own rate) */
const basketOf = (...inside: ItemInstance[]): ItemInstance => newItem('ts_basket', { inside: inside.map((x) => (hasItem(x.item) && x.fresh !== undefined ? { ...x, fk: 0.5 } : x)) });

/** a game in the yard as the game wrote it before any of this: no counts, nothing inside anything, no clock */
function oldSave(): SaveV1 {
  return {
    v: 1,
    at: 1_794_000_000_000,
    place: 'garage',
    hour: 14.25,
    done: ['hood', 'battery'],
    vehicles: [
      { build: stockBuild('sedan', { fuel: 0.3 }), x: 0.4, z: 0, yaw: 0, radioOn: false, radioSong: 0 },
      { build: stockBuild('pickup', { fuel: 0.1 }), x: 9, z: 3, yaw: 0 },
    ],
    loose: [
      at({ part: newInstance('bat_std', { charge: 0.85 }) }),
      at({ item: newItem('drink_water', { litres: 1.25, opened: true }) }, -2),
      at({ tool: newTool('jerrycan', { fuel: 'diesel', litres: 7.5 }) }, 3),
      riding({ item: newItem('hammer_2', { uses: 4 }) }, 1),
      riding({ item: newItem('crate_parts') }, 1),
    ],
    player: { x: -4.6, z: -0.4, heading: 0.15 },
    hands: [{ item: newItem('drink_soda') }, null, { tool: newTool('spray', { tier: 1, colour: 3 }) }, { part: newInstance('rim_steel13') }],
    sel: 2,
    pack: newItem('pack_old'),
    stock: { scrap: 12, components: 3 },
    wrecks: {
      kept: { 'w:12:0': { build: stockBuild('wagon', { fuel: 0 }), x: 400, z: -3, yaw: 1.2, loose: [riding({ item: newItem('food_fish_can') }, 0), riding({ tool: newTool('oilcan', { litres: 1.5 }) }, 0), riding({ part: newInstance('tire_road') }, 0)] } },
      gone: ['w:3:1'],
    },
    places: { searched: ['c:7', 'c:9'], left: { 'c:7': [{ item: newItem('med_pain_2') }, { tool: newTool('oilcan') }, { part: newInstance('bat_std') }] }, pumps: { 's:2': { petrol: 80, diesel: 40 } }, taken: ['t:1'] },
  };
}

/** every object in a save that looks like a thing one carries (its kind under `item`, a uid), wherever it sits; the systems' slices are theirs */
function thingsByShape(node: unknown, path = '', out: { uid: string; path: string }[] = []): { uid: string; path: string }[] {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((x, i) => thingsByShape(x, `${path}[${i}]`, out));
    return out;
  }
  const o = node as Record<string, unknown>;
  if (typeof o.item === 'string' && typeof o.uid === 'string') out.push({ uid: o.uid, path });
  for (const [k, v] of Object.entries(o)) if (!(path === '' && k === 'slices')) thingsByShape(v, path ? `${path}.${k}` : k, out);
  return out;
}

const num = (uid: string): number => parseInt(uid.slice(1), 36);

describe('things through the save', () => {
  let storage: ReturnType<typeof fakeStorage>;
  /** the save's text as written, read back as the page would */
  const through = (s: SaveV1): { text: string; back: SaveV1 | null } => {
    expect(writeSave(s)).toBe(true);
    const text = storage.store.get(KEY)!;
    return { text, back: loadSave() };
  };

  beforeEach(() => {
    storage = fakeStorage();
    vi.stubGlobal('localStorage', storage.api);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('a save from before stacks, baskets and freshness loads exactly as it did', () => {
    const s = oldSave();
    const { text, back } = through(s);
    expect(text).not.toMatch(/"n":|"inside":|"fresh":|"t0":|"fk":|"clock":/);
    expect(back).toEqual(JSON.parse(text));
    expect(loadLoss()).toEqual({ unknown: 0, kinds: [] });
    expect(storage.store.has(`${KEY}.unread`)).toBe(false);
    // written again it is the same text, to the letter
    expect(writeSave(back!)).toBe(true);
    expect(storage.store.get(KEY)).toBe(text);
  });

  it('stacks, contents, freshness, quality and state come back wherever a save holds a thing', async () => {
    // a journey on its third day: the world's clock is the stand-in game's, as the kernel writes it into a save
    const game = await new FakeGame([], null, { hour: 9.2 }).start();
    for (const h of [17.5, 3.25, 23.75, 6.5]) game.setHour(h);
    const now = itemNow();
    expect(now).toBe(game.clock.worldSeconds);
    expect(now).toBeCloseTo((2 * 24 + 6.5 - 9.2) * H, 6);
    const berries = (n: number, hoursAgo: number, more: Partial<ItemInstance> = {}): ItemInstance => newItem('ts_berry', { ...(n > 1 ? { n } : {}), t0: now - hoursAgo * H, ...more });
    const s: SaveV1 = {
      ...oldSave(),
      ...game.snapshot(),
      hands: [
        { item: berries(7, 5, { q: 4 }) },
        { item: basketOf(berries(12, 2), newItem('ts_jerky', { n: 3 })) },
        { tool: newTool('jerrycan', { litres: 3 }) },
        { item: newItem('ts_page', { n: 2, state: { page: 3, marks: [1, { deep: [true, null] }] } as ItemInstance['state'] }) },
        null,
        { item: newItem('wear_jacket', { tint: 0x336699 }) },
      ],
      sel: 1,
      pack: newItem('pack_hike'),
    };
    s.loose.push(at({ item: newItem('ts_jerky', { n: 8 }) }, 5), riding({ item: basketOf(berries(4, 20), berries(9, 1)) }, 0), at({ item: berries(1, 30) }, 6));
    s.wrecks!.kept['w:12:0'].loose.push(riding({ item: basketOf(newItem('ts_jerky', { n: 6 })) }, 0), riding({ item: berries(12, 3, { fk: 0.25 }) }, 0));
    s.places!.left['c:9'] = [{ item: berries(5, 6) }, { item: basketOf(berries(2, 0.5)) }, { item: newItem('ts_jerky', { n: 2, q: 5 }) }];

    const { text, back } = through(s);
    expect(back).toEqual(JSON.parse(text));
    expect(loadLoss().unknown).toBe(0);
    // the selected slot still holds the basket, with a full stack and three in it
    expect(itemSig(back!.hands![back!.sel!]!.item!)).toBe('ts_basket[ts_berry*12,ts_jerky*3]');
    // read by a game that takes the save up: its clock is the save's, and every thing is as fresh as it was
    const next = await new FakeGame([], back).start();
    expect(itemNow()).toBe(now);
    expect(next.clock.worldSeconds).toBe(now);
    const was: number[] = [];
    forEachSavedItem(s, (x) => void was.push(freshNow(x, now)));
    const is: number[] = [];
    forEachSavedItem(back!, (x) => void is.push(freshNow(x, itemNow())));
    expect(is).toEqual(was);
    expect(new Set(was).size).toBeGreaterThan(6);
    // (the berry of thirty hours ago has turned, and is still a berry: a save settles nothing)
    expect(back!.loose[back!.loose.length - 1].item).toMatchObject({ item: 'ts_berry' });
    expect(freshNow(back!.loose[back!.loose.length - 1].item!, now)).toBe(0);
    // written again: the same text
    expect(writeSave(back!)).toBe(true);
    expect(storage.store.get(KEY)).toBe(text);

    // every thing in the save's text is one the save's own walk finds: no holder is left out of it
    const found: string[] = [];
    forEachSavedItem(back!, (x) => void found.push(x.uid));
    const shaped = thingsByShape(JSON.parse(text));
    expect(shaped.map((t) => t.uid).sort()).toEqual([...found].sort());
    expect(found.length).toBe(24);
    expect(new Set(found).size).toBe(found.length);
    expect(new Set(shaped.map((t) => t.path.replace(/\[\d+\]/g, '[]').replace(/kept\.[^.]+\./, 'kept.*.').replace(/left\.[^.[]+/, 'left.*')))).toEqual(
      new Set(['loose[].item', 'loose[].item.inside[]', 'hands[].item', 'hands[].item.inside[]', 'pack', 'wrecks.kept.*.loose[].item', 'wrecks.kept.*.loose[].item.inside[]', 'places.left.*[].item', 'places.left.*[].item.inside[]']),
    );
  });

  it('a thing of a kind this build does not have is left out and counted, at every holder and depth; the rest is read', () => {
    const s = oldSave();
    const keptBasket = basketOf(newItem('ts_berry', { n: 3, t0: 0 }), gone('i9a', { n: 6, fresh: 0.5, t0: 77 }), newItem('ts_jerky', { n: 2 }));
    const emptied = basketOf(gone('i9b'), gone('i9c', { n: 2 }));
    // the hotbar: the selected slot, a basket with one of them in it, one in a slot of the backpack
    s.hands = [{ item: newItem('drink_soda') }, { item: gone('i91', { n: 4 }) }, { item: keptBasket }, { item: gone('i92') }];
    s.sel = 1;
    // on the floor, riding in one's own vehicle, a box of them with things of ours in it, and a basket left empty
    s.loose.push(at({ item: gone('i93', { n: 12, inside: 'nothing' }) }, 7), riding({ item: gone('i94') }, 1), at({ item: { uid: 'i95', item: 'gone_box', inside: [newItem('ts_jerky', { n: 5 }), gone('i96', { n: 3 })] } as unknown as ItemInstance }, 8), at({ item: emptied }, 9));
    // riding in a wreck kept as it was left, and in a basket there
    s.wrecks!.kept['w:12:0'].loose.push(riding({ item: gone('i97', { n: 2 }) }, 0), riding({ item: basketOf(gone('i98', { n: 7 }), newItem('ts_berry', { n: 2, t0: 0 })) }, 0));
    // left in a place's container
    s.places!.left['c:7'].unshift({ item: gone('i99', { n: 5 }) });
    s.places!.left['c:9'] = [{ item: gone('i9d') }];
    writeSave(s);
    const orig = JSON.parse(storage.store.get(KEY)!) as SaveV1;

    const back = loadSave()!;
    expect(back).not.toBeNull();
    // 4 + 6 + 1 in the hands, 12 + 1 + (1 + 5 + 3) + (1 + 2) lying about and riding, 2 + 7 in the wreck, 5 + 1 at the places
    expect(loadLoss()).toEqual({ unknown: 4 + 6 + 1 + 12 + 1 + 9 + 3 + 2 + 7 + 5 + 1, kinds: ['gone_box', 'gone_thing'] });
    expect(lossWords(loadLoss().unknown, loadLoss().kinds)).toEqual({ zh: '有 51 件认不出的东西没能读回来', en: '51 things of kinds this build does not have were not read back (gone_box, gone_thing)' });
    expect(lossWords(1)).toEqual({ zh: '有 1 件认不出的东西没能读回来', en: '1 thing of kinds this build does not have was not read back' });
    // what the save should be now: the same, without them
    const want = structuredClone(orig);
    want.hands![1] = null;
    want.hands![3] = null;
    want.hands![2]!.item!.inside!.splice(1, 1);
    want.loose.splice(5, 3);
    delete want.loose[5].item!.inside;
    want.wrecks!.kept['w:12:0'].loose.splice(3, 1);
    want.wrecks!.kept['w:12:0'].loose[3].item!.inside!.splice(0, 1);
    want.places!.left['c:7'].shift();
    want.places!.left['c:9'] = [];
    expect(back).toEqual(want);
    // the slot that was selected is selected still, and empty; the others are where they were
    expect(back.sel).toBe(1);
    expect(back.hands).toHaveLength(4);
    expect(back.hands![back.sel!]).toBeNull();
    expect(itemSig(back.hands![2]!.item!)).toBe('ts_basket[ts_berry*3,ts_jerky*2]');
    expect(JSON.stringify(back)).not.toContain('gone_');
    // the save was not set aside, and what is read is what the game goes on with: written again, they stay out
    expect(storage.store.has(`${KEY}.unread`)).toBe(false);
    writeSave(back);
    expect(loadSave()).toEqual(want);
    expect(loadLoss()).toEqual({ unknown: 0, kinds: [] });
  });

  it('the backpack one has on, of a kind this build does not have, is taken off and counted', () => {
    const s = oldSave();
    s.pack = { uid: 'i9p', item: 'gone_pack' } as ItemInstance;
    s.hands = [null, { item: newItem('drink_soda') }, { item: newItem('ts_jerky', { n: 3 }) }, null, { tool: newTool('oilcan') }];
    const back = through(s).back!;
    expect('pack' in back).toBe(false);
    expect(loadLoss()).toEqual({ unknown: 1, kinds: ['gone_pack'] });
    // (what was in its slots is still in the save's hotbar: the game puts down what it has no slot for)
    expect(back.hands!.map((h) => (h?.item ? h.item.item : h?.tool ? h.tool.kind : null))).toEqual([null, 'drink_soda', 'ts_jerky', null, 'oilcan']);
  });

  it('a part this build does not know still sets the whole save aside, wherever it is; a tool of no kind is left out like a thing', () => {
    const odd = (): { part: ReturnType<typeof newInstance> } => ({ part: { ...newInstance('bat_std'), part: 'a_part_from_another_build' } });
    const cases: [string, (s: SaveV1) => void][] = [
      ['lying about', (s) => void s.loose.push(at(odd()))],
      ['in the hands', (s) => void s.hands!.push(odd())],
      ['riding in a kept wreck', (s) => void s.wrecks!.kept['w:12:0'].loose.push(riding(odd(), 0))],
      ['left at a place', (s) => void s.places!.left['c:7'].push(odd())],
      ['on a kept wreck', (s) => void (s.wrecks!.kept['w:12:0'].build.frame = 'a_frame_from_another_build')],
    ];
    for (const [where, spoil] of cases) {
      storage.store.clear();
      const s = oldSave();
      spoil(s);
      writeSave(s);
      expect(loadSave(), where).toBeNull();
      expect(storage.store.has(KEY), where).toBe(false);
      expect(storage.store.get(`${KEY}.unread`), where).toContain('_from_another_build');
      expect(loadLoss().unknown).toBe(0);
    }
    // a tool: of a kind there is not, or no tool at all
    storage.store.clear();
    const s = oldSave();
    s.loose.push(at({ tool: { uid: 't9a', kind: 'chainsaw', litres: 1 } as unknown as Tool }), at({ tool: { kind: 'sponge' } as unknown as Tool }), at({ tool: 'sponge' as unknown as Tool }), at({ tool: { uid: 't9b', kind: 'toString' } as unknown as Tool }));
    s.hands![2] = { tool: { uid: 't9c', kind: 'hasOwnProperty' } as unknown as Tool };
    const before = s.loose.length - 4;
    const back = through(s).back!;
    expect(back.loose).toHaveLength(before);
    expect(back.hands![2]).toBeNull();
    expect(loadLoss()).toEqual({ unknown: 5, kinds: ['tool:chainsaw', 'tool:hasOwnProperty', 'tool:sponge', 'tool:toString', 'tool:undefined'] });
  });

  it('no uid read back is given out again: a part’s, a tool’s, a thing’s, a thing’s in a basket', () => {
    const s = oldSave();
    const far = 5_000_000;
    const uid = (p: string, n: number): string => `${p}${(far + n).toString(36)}`;
    // the highest numbers of the save sit in a basket in the hands, in a basket riding in a kept wreck, and in a place's container
    const inBasket = newItem('ts_jerky', { n: 4, uid: uid('i', 3) });
    s.hands![1] = { item: newItem('ts_basket', { uid: uid('i', 1), inside: [newItem('ts_berry', { n: 2, t0: 0, fk: 0.5, uid: uid('i', 2) }), inBasket] }) };
    s.wrecks!.kept['w:12:0'].loose.push(riding({ item: newItem('ts_basket', { uid: uid('i', 4), inside: [newItem('ts_jerky', { uid: uid('i', 6) })] }) }, 0));
    s.places!.left['c:7'].push({ item: newItem('ts_jerky', { n: 2, uid: uid('i', 5) }) });
    s.loose.push(at({ tool: newTool('sponge', { uid: uid('t', 2) }) }), at({ part: { ...newInstance('bat_std'), uid: uid('p', 8) } }));
    s.wrecks!.kept['w:12:0'].loose.push(riding({ tool: newTool('oilcan', { uid: uid('t', 9) }) }, 0));
    s.places!.left['c:7'].push({ tool: newTool('brush', { uid: uid('t', 7) }) });
    const back = through(s).back!;
    // made after the load: past every one of them
    expect(num(newItem('ts_jerky').uid)).toBe(far + 7);
    expect(num(splitStack(back.hands![1]!.item!.inside![1], 1)!.uid)).toBe(far + 8);
    expect(num(newTool('oilcan').uid)).toBe(far + 10);
    expect(num(newInstance('bat_std').uid)).toBeGreaterThan(far + 8);
    const all = new Set<string>();
    forEachSavedItem(back, (x) => void all.add(x.uid));
    expect(all.has(newItem('ts_berry').uid)).toBe(false);

    // a uid held twice is held once after the load (a tool's: older saves have them, nothing kept a tool's uid from
    // being given out again; a thing's, in a basket too): the first keeps it, the others get new ones
    const twice = oldSave();
    twice.loose.push(at({ tool: newTool('sponge', { uid: 't1' }) }), at({ tool: newTool('brush', { uid: 't1' }) }), at({ tool: newTool('oilcan', { uid: 't1' }) }));
    twice.hands = [{ item: newItem('ts_jerky', { n: 2, uid: 'i7' }) }, { item: newItem('ts_basket', { uid: 'i8', inside: [newItem('ts_jerky', { uid: 'i7' }), newItem('ts_berry', { t0: 0, uid: 'i8' })] }) }];
    twice.pack = newItem('pack_old', { uid: 'i7' });
    const again = through(twice).back!;
    const tools = again.loose.filter((l) => l.tool).map((l) => l.tool!.uid);
    expect(new Set(tools).size).toBe(tools.length);
    expect(tools.filter((u) => u === 't1')).toHaveLength(1);
    const things: string[] = [];
    forEachSavedItem(again, (x) => void things.push(x.uid));
    expect(new Set(things).size).toBe(things.length);
    expect(again.hands![0]!.item!.uid).toBe('i7');
    expect(again.hands![1]!.item!.uid).toBe('i8');
    // (and the new ones are new: nothing made afterwards has them)
    for (let i = 0; i < 5; i++) expect(things.includes(newItem('ts_jerky').uid) || tools.includes(newTool('oilcan').uid)).toBe(false);
  });

  it('what goes off without a time starts at the save’s own time, and nothing is written as of a later one', async () => {
    const game = await new FakeGame([], null, { hour: 6 }).start();
    game.setHour(18);
    const now = itemNow();
    expect(now).toBe(12 * H);
    const s: SaveV1 = { ...oldSave(), ...game.snapshot() };
    s.hands = [
      // never started (made, and saved before anything started it); started; in a basket made with berries in it, never put in
      { item: newItem('ts_berry', { n: 3 }) },
      { item: newItem('ts_berry', { n: 2, t0: 3 * H }) },
      { item: newItem('ts_basket', { inside: [newItem('ts_berry', { n: 4 }), newItem('ts_berry', { n: 1, t0: 5 * H, fk: 0.5 }), newItem('ts_jerky')] }) },
      // written as of a time the clock has not reached
      { item: newItem('ts_berry', { t0: 99 * H, fresh: 0.8 }) },
    ];
    s.wrecks!.kept['w:12:0'].loose.push(riding({ item: newItem('ts_berry') }, 0));
    s.places!.left['c:7'].push({ item: newItem('ts_berry', { fresh: 0.4 }) });
    const back = through(s).back!;
    const next = await new FakeGame([], back).start();
    expect(next.clock.worldSeconds).toBe(now);
    const h = back.hands!.map((x) => x!.item!);
    expect([h[0].t0, h[1].t0, h[3].t0]).toEqual([now, 3 * H, now]);
    expect(h[3].fresh).toBe(0.8);
    expect(h[2].inside!.map((x) => [x.t0, x.fk])).toEqual([[now, 0.5], [5 * H, 0.5], [undefined, undefined]]);
    expect(back.wrecks!.kept['w:12:0'].loose.at(-1)!.item).toMatchObject({ t0: now, fresh: 1 });
    expect(back.places!.left['c:7'].at(-1)!.item).toMatchObject({ t0: now, fresh: 0.4 });
    // from there they go off with the world's clock
    next.setHour(0);
    expect(itemNow()).toBe(18 * H);
    expect(freshNow(h[0], itemNow())).toBe(0.75);
    expect(freshNow(h[2].inside![0], itemNow())).toBe(0.875);
    // a thing kept in the session and handed back to the game later starts when it is handed back
    const late = backInTheWorld(newItem('ts_berry'));
    expect(late.t0).toBe(18 * H);
    expect(backInTheWorld(late).t0).toBe(18 * H);

    // a save whose clock does not read begins its clock again: nothing in it stays fresh until the clock catches up
    const lost: SaveV1 = { ...oldSave(), clock: { day: -1, hour: 99, start: 0 } };
    lost.hands = [{ item: newItem('ts_berry', { t0: 40 * H, fresh: 0.5 }) }];
    const again = through(lost).back!;
    expect(again.hands![0]!.item).toMatchObject({ t0: 0, fresh: 0.5 });
    const third = await new FakeGame([], again).start();
    expect(third.clock.worldSeconds).toBe(0);
  });

  it('a stack used up is never written, and writing changes nothing', () => {
    const s = oldSave();
    const dead = (): ItemInstance => newItem('ts_jerky', { n: 0 });
    const withDead = newItem('ts_basket', { inside: [dead(), newItem('ts_jerky', { n: 3 })] });
    const allDead = newItem('ts_basket', { inside: [dead(), dead()] });
    s.hands = [{ item: dead() }, { item: withDead }, { item: newItem('ts_jerky', { n: 2 }) }, { item: allDead }];
    s.sel = 0;
    s.loose.push(at({ item: dead() }, 7));
    s.wrecks!.kept['w:12:0'].loose.push(riding({ item: dead() }, 0));
    s.places!.left['c:7'].push({ item: dead() });
    s.pack = newItem('pack_old', { n: 0 });
    // (nothing used up: the save is written as it stands, no copy made)
    const sound = oldSave();
    expect(writableSave(sound)).toBe(sound);

    const live = JSON.stringify(s);
    const insideBefore = withDead.inside;
    const { text, back } = through(s);
    expect(text).not.toContain('"n":0');
    // the game's own things are as they were, to the last one
    expect(JSON.stringify(s)).toBe(live);
    expect(withDead.inside).toBe(insideBefore);
    expect(withDead.inside!.map((x) => countOf(x))).toEqual([0, 3]);
    // what was written: the same without them — the hotbar's slot emptied, the lists shorter, the baskets without them, no backpack
    expect(back!.hands!.map((h) => (h ? itemSig(h.item!) : null))).toEqual([null, 'ts_basket[ts_jerky*3]', 'ts_jerky*2', 'ts_basket']);
    expect(back!.loose).toHaveLength(oldSave().loose.length);
    expect(back!.wrecks!.kept['w:12:0'].loose).toHaveLength(3);
    expect(back!.places!.left['c:7']).toHaveLength(3);
    expect('pack' in back!).toBe(false);
    expect(loadLoss().unknown).toBe(0);
    // a restore point is written the same way
    pushRestore(s);
    expect(JSON.stringify(s)).toBe(live);
    expect(storage.store.get('modcar.restore.v1')).not.toContain('"n":0');
    expect(restorePoints()[0].save.hands!.map((h) => (h ? itemSig(h.item!) : null))).toEqual([null, 'ts_basket[ts_jerky*3]', 'ts_jerky*2', 'ts_basket']);
    // and one that slipped into a save's text all the same is not read back as one thing
    const raw = JSON.parse(text) as SaveV1;
    raw.hands![0] = { item: { uid: 'i9z', item: 'ts_jerky', n: 0 } as ItemInstance };
    raw.hands![1]!.item!.inside!.push({ uid: 'i9y', item: 'ts_jerky', n: 0 } as ItemInstance);
    storage.store.set(KEY, JSON.stringify(raw));
    const again = loadSave()!;
    expect(again.hands![0]).toBeNull();
    expect(itemSig(again.hands![1]!.item!)).toBe('ts_basket[ts_jerky*3]');
    expect(loadLoss().unknown).toBe(0);
  });

  it('restore points go the same way: one written by a build with more kinds is read tolerantly when it is gone on from', () => {
    const s = oldSave();
    s.hands = [{ item: newItem('ts_jerky', { n: 2 }) }, { item: basketOf(newItem('ts_berry', { n: 2, t0: 0 })) }];
    pushRestore(s);
    // (the same point as a build with one more kind wrote it)
    const points = restorePoints();
    points[0].save.hands![0] = { item: gone('i9r', { n: 3 }) };
    points[0].save.hands![1]!.item!.inside!.push(gone('i9s', { n: 2 }));
    storage.store.set('modcar.restore.v1', JSON.stringify(points));
    expect(useRestore(0)).toBe(true);
    const back = loadSave()!;
    expect(loadLoss()).toEqual({ unknown: 5, kinds: ['gone_thing'] });
    expect(back.hands!.map((h) => (h ? itemSig(h.item!) : null))).toEqual([null, 'ts_basket[ts_berry*2]']);
    expect(back.vehicles).toHaveLength(2);
  });

  it('holders that are not what they should be cost neither the save nor the game its footing', () => {
    const s = oldSave() as unknown as Record<string, unknown> & SaveV1;
    const good = (): ItemInstance => newItem('ts_jerky', { n: 2 });
    s.loose.push(
      null as unknown as SavedLoose,
      7 as unknown as SavedLoose,
      'food_chips' as unknown as SavedLoose,
      at({}),
      at({ item: 5 as unknown as ItemInstance }),
      at({ item: {} as ItemInstance }),
      at({ item: 'food_chips' as unknown as ItemInstance }),
      at({ item: { item: 'food_chips' } as ItemInstance }),
      at({ item: [good()] as unknown as ItemInstance }),
      at({ item: null as unknown as ItemInstance }),
      // two things in one slot: the game takes the first there is, and so does the save
      at({ part: newInstance('bat_std'), item: gone('i9t') }),
      at({ tool: newTool('oilcan'), item: good() }),
      at({ item: good() }),
    );
    const n = oldSave().loose.length;
    s.hands = [{}, 3, { item: {} }, null, { item: good() }] as unknown as SaveV1['hands'];
    s.pack = 5 as unknown as ItemInstance;
    (s.wrecks!.kept['w:12:0'] as unknown as Record<string, unknown>).loose = 'riders';
    (s.places!.left as Record<string, unknown>)['c:9'] = { 0: { item: good() } };
    (s.places!.left as Record<string, unknown>)['c:8'] = [null, { item: good() }, {}];
    const back = through(s).back!;
    expect(back).not.toBeNull();
    expect(storage.store.has(`${KEY}.unread`)).toBe(false);
    // what is left is what the game can take: every entry holds one thing, the hotbar's slots a thing or nothing
    expect(back.loose).toHaveLength(n + 3);
    for (const l of back.loose) expect([l.part, l.tool, l.item].filter((x) => x !== undefined)).toHaveLength(1);
    expect(back.loose.slice(n).map((l) => (l.part ? 'part' : l.tool ? 'tool' : itemSig(l.item!)))).toEqual(['part', 'tool', 'ts_jerky*2']);
    expect(back.hands!.map((h) => (h ? itemSig(h.item!) : null))).toEqual([null, null, null, null, 'ts_jerky*2']);
    expect('pack' in back).toBe(false);
    expect(back.wrecks!.kept['w:12:0'].loose).toEqual([]);
    expect(Object.keys(back.places!.left).sort()).toEqual(['c:7', 'c:8']);
    expect(back.places!.left['c:8'].map((t) => itemSig(t.item!))).toEqual(['ts_jerky*2']);
    // (nothing of a kind this build does not have was read: the one in a slot with a part was never the slot's thing)
    expect(loadLoss().unknown).toBe(0);
    // hands that are no list at all: none
    const none = oldSave() as unknown as Record<string, unknown> & SaveV1;
    none.hands = 'both' as unknown as SaveV1['hands'];
    expect('hands' in through(none).back!).toBe(false);
  });

  it('two hundred stacks in a save: its size', () => {
    const base = JSON.stringify(oldSave()).length;
    const now = 3 * 24 * H + 1234.5;
    const lying = oldSave();
    for (let i = 0; i < 200; i++) lying.loose.push({ item: newItem('ts_berry', { n: 1 + (i % 12), t0: Math.round(now - i * 97.3), fresh: Math.round((1 - i / 400) * 1000) / 1000 }), x: 1.5 + (i % 20) * 0.31, y: 0.02, z: -3.25 + Math.floor(i / 20) * 0.29, yaw: Math.round(i * 0.37 * 100) / 100 });
    const boxed = oldSave();
    for (let b = 0; b < 50; b++) boxed.hands!.push({ item: newItem('ts_basket', { inside: [0, 1, 2, 3].map((i) => newItem(i % 2 ? 'ts_jerky' : 'ts_berry', { n: 2 + ((b + i) % 6), ...(i % 2 ? {} : { t0: Math.round(now - b * 311), fresh: 0.9, fk: 0.5 }) })) }) });
    const sizes = [JSON.stringify(writableSave(lying)).length - base, JSON.stringify(writableSave(boxed)).length - base];
    console.log(`[v3 items] 200 stacks in a save: ${sizes[0]} bytes lying about (${(sizes[0] / 200).toFixed(0)} each, with where they lie), ${sizes[1]} bytes in 50 baskets in the hands (${(sizes[1] / 200).toFixed(0)} each, the baskets among them); the save without them is ${base} bytes`);
    expect(sizes[0]).toBeLessThan(200 * 160);
    expect(sizes[1]).toBeLessThan(200 * 100);
    // and they come back, every one
    let stacks = 0;
    forEachSavedItem(through(lying).back!, (x) => void (stacks += x.item === 'ts_berry' ? 1 : 0));
    expect(stacks).toBe(200);
    stacks = 0;
    forEachSavedItem(through(boxed).back!, (x, box) => void (stacks += box ? 1 : 0));
    expect(stacks).toBe(200);
  });
});
