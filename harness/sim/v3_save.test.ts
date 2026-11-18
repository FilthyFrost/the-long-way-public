/**
 * The save with the V3 kernel's two new parts in it (src/game/modcar/save.ts: `slices` and `clock`,
 * docs/V3/nodes/N0-foundation.md), through the game's real save functions — `writeSave` and `loadSave` run in
 * Node as they are, with the browser's storage stood in for by a map — and the kernel's registries: a save
 * from before there were slices loads as it always did; a save with slices comes back the same, a slice of a
 * system that is absent, a slice from a newer build and a slice that will not read among them, and none of
 * the three costs the player the save or the other slices.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorldClock } from '../../src/core/kernel/clock';
import { SaveSliceRegistry, type SaveSlice, type SliceReport } from '../../src/core/kernel/slices';
import { newInstance, stockBuild } from '../../src/core/modcar/build';
import { newItem } from '../../src/core/modcar/items';
import { clearSave, loadSave, writeSave, type SaveV1 } from '../../src/game/modcar/save';

const KEY = 'modcar.save.v1';

/** the browser's storage, as much of it as save.ts uses */
function fakeStorage(): { store: Map<string, string>; api: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> } {
  const store = new Map<string, string>();
  return {
    store,
    api: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, String(v)),
      removeItem: (k) => void store.delete(k),
    },
  };
}

/** a game in the yard as the game writes it today, without the kernel's parts: two vehicles, things lying about, something in the hands */
function plainSave(): SaveV1 {
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
      { part: newInstance('bat_std', { charge: 0.85 }), x: 1, y: 0, z: 2, yaw: 0.5 },
      { item: newItem('drink_water'), x: -2, y: 0.9, z: -4, yaw: 0 },
    ],
    player: { x: -4.6, z: -0.4, heading: 0.15 },
    hands: [{ item: newItem('drink_soda') }, null],
    sel: 0,
    stock: { scrap: 12, organics: 3, chemicals: 0 },
  };
}

/** a slice that keeps one value and writes down what was done to it */
function slice<T>(id: string, version: number, first: T, more: Partial<SaveSlice<T>> = {}): SaveSlice<T> & { value: T; log: string[] } {
  const s = {
    id,
    version,
    value: first,
    log: [] as string[],
    snapshot: (): T | undefined => s.value,
    restore: (data: T, from: number): void => {
      s.value = data;
      s.log.push(`restore v${from}`);
    },
    clear: (): void => {
      s.value = first;
      s.log.push('clear');
    },
    ...more,
  };
  return s;
}

describe('the save with slices and the world clock, through save.ts', () => {
  let storage: ReturnType<typeof fakeStorage>;

  beforeEach(() => {
    storage = fakeStorage();
    vi.stubGlobal('localStorage', storage.api);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('a save from before there were slices loads as it always did, and has no key for them', () => {
    const s = plainSave();
    writeSave(s);
    const text = storage.store.get(KEY)!;
    expect(text).not.toContain('"slices"');
    expect(text).not.toContain('"clock"');
    const back = loadSave();
    expect(back).toEqual(JSON.parse(JSON.stringify(s)));
    expect(back && 'slices' in back).toBe(false);
    // the kernel reading it: every slice as a new game starts, the journey's clock beginning at the saved hour
    const reg = new SaveSliceRegistry();
    const forage = slice('forage', 1, { known: [] as string[] });
    forage.value = { known: ['left over from before the load'] };
    reg.register(forage);
    reg.restore(back!.slices);
    expect(forage.value).toEqual({ known: [] });
    expect(reg.reports).toEqual([]);
    const clock = new WorldClock();
    clock.begin(back!.hour);
    expect(back!.clock).toBeUndefined();
    expect(clock.snapshot()).toEqual({ day: 0, hour: 14.25, start: 14.25 });
    expect(storage.store.has(`${KEY}.unread`)).toBe(false);
  });

  it('a save with slices and a clock, written by the kernel, comes back the same', () => {
    // a game played: two systems with something to keep, one with nothing, the clock on its third day
    const reg = new SaveSliceRegistry();
    const forage = slice('forage', 2, { known: ['dandelion', 'morel'], picked: { 'n:17': 2 } as Record<string, number> });
    const skills = slice('skills', 1, [120, 0, 35]);
    const idle = slice<undefined>('idle', 1, undefined);
    for (const x of [skills, forage, idle]) reg.register(x as SaveSlice);
    const clock = new WorldClock();
    clock.begin(9.2);
    const hand = { hour: 0 };
    for (const h of [17.5, 3.25, 23.75, 6.5]) {
      hand.hour = h;
      clock.sync(hand);
    }
    const s = plainSave();
    const slices = reg.snapshot();
    if (slices) s.slices = slices;
    s.clock = clock.snapshot();
    writeSave(s);
    expect(storage.store.get(KEY)).toContain('"slices":{"forage":{"v":2,"d":{"known":["dandelion","morel"],"picked":{"n:17":2}}},"skills":{"v":1,"d":[120,0,35]}},"clock":{"day":2,"hour":6.5,"start":9.2}}');
    // the page opened again
    const back = loadSave()!;
    expect(back).toEqual(JSON.parse(JSON.stringify(s)));
    const reg2 = new SaveSliceRegistry();
    const forage2 = slice('forage', 2, { known: [] as string[], picked: {} as Record<string, number> });
    const skills2 = slice('skills', 1, [0, 0, 0]);
    const idle2 = slice<undefined>('idle', 1, undefined);
    for (const x of [idle2, forage2, skills2]) reg2.register(x as SaveSlice);
    reg2.restore(back.slices);
    expect(forage2.value).toEqual(forage.value);
    expect(skills2.value).toEqual([120, 0, 35]);
    expect(idle2.log).toEqual(['clear']);
    expect(reg2.reports).toEqual([]);
    const clock2 = new WorldClock();
    clock2.begin(back.hour);
    expect(clock2.restore(back.clock)).toBe(true);
    expect([clock2.worldSeconds, clock2.day, clock2.hour]).toEqual([clock.worldSeconds, 2, 6.5]);
    // and written again it is the same text, whatever order the slices were registered in this time
    const s2 = { ...back };
    s2.slices = reg2.snapshot();
    s2.clock = clock2.snapshot();
    writeSave(s2);
    const first = JSON.stringify(s);
    expect(storage.store.get(KEY)).toBe(first);
  });

  it('a slice of a system that is absent, one from a newer build and one that will not read cost neither the save nor the other slices', () => {
    const s = plainSave();
    const hunting = { v: 3, d: { herds: [{ at: [1200.5, -40.25], n: 6, wary: 0.3 }], pressure: { 'c:4:1': 0.6 } } };
    const cookingNewer = { v: 9, d: { known: ['stew'], pantry: [{ dish: 'stew', q: 4, born: 86_400 }] } };
    s.slices = {
      cooking: cookingNewer,
      forage: { v: 1, d: ['dandelion'] },
      fishing: { v: 1, d: { caught: 'not what this version wrote' } },
      hunting,
      skills: { v: 1, d: [1, 2, 3] },
    };
    s.clock = { day: 4, hour: 21.5, start: 9.2 };
    writeSave(s);

    // (the save itself is read whole: slices are not what loadSave checks)
    const back = loadSave()!;
    expect(back).not.toBeNull();
    expect(storage.store.has(`${KEY}.unread`)).toBe(false);
    expect(back.vehicles).toHaveLength(2);

    const told: SliceReport[] = [];
    const reg = new SaveSliceRegistry();
    reg.onReport = (r) => told.push(r);
    const cooking = slice('cooking', 2, { known: [] as string[] });
    // (version 1 kept a plain list of what one knows)
    const forage = slice<{ known: string[] }>('forage', 2, { known: [] }, { migrate: (d) => ({ known: d as string[] }) });
    const fishing = slice('fishing', 1, { caught: [] as string[] }, {
      restore: (d) => {
        if (!Array.isArray((d as { caught: unknown }).caught)) throw new Error('caught is not a list');
      },
    });
    const skills = slice('skills', 1, [0, 0, 0]);
    for (const x of [cooking, forage, fishing, skills]) reg.register(x as SaveSlice);
    reg.restore(back.slices);

    // the two that read
    expect(forage.value).toEqual({ known: ['dandelion'] });
    expect(forage.log).toEqual(['restore v1']);
    expect(skills.value).toEqual([1, 2, 3]);
    // the newer one: not read, the system starts as new, its record kept
    expect(cooking.log).toEqual(['clear']);
    // the one that throws: reported, cleared
    expect(fishing.log).toEqual(['clear']);
    expect(told.map((r) => `${r.id}:${r.what}:${r.v}`)).toEqual(['hunting:unknown:3', 'cooking:newer:9', 'fishing:restore:1']);
    expect((told[2].error as Error).message).toBe('caught is not a list');
    expect(reg.carriedIds).toEqual(['cooking', 'hunting']);

    // played on and saved: the absent system's slice and the newer one are in the save exactly as they came
    cooking.value = { known: ['what this older build cooked meanwhile'] };
    skills.value = [1, 2, 4];
    const next: SaveV1 = { ...back, slices: reg.snapshot(), clock: back.clock };
    writeSave(next);
    const again = loadSave()!;
    expect(again.slices!.hunting).toEqual(hunting);
    expect(again.slices!.cooking).toEqual(cookingNewer);
    expect(again.slices!.forage).toEqual({ v: 2, d: { known: ['dandelion'] } });
    expect(again.slices!.fishing).toEqual({ v: 1, d: { caught: [] } });
    expect(again.slices!.skills).toEqual({ v: 1, d: [1, 2, 4] });
    expect(Object.keys(again.slices!)).toEqual(['cooking', 'fishing', 'forage', 'hunting', 'skills']);
    expect(again.clock).toEqual({ day: 4, hour: 21.5, start: 9.2 });

    // the build that knows them all reads every one of them
    const full = new SaveSliceRegistry();
    const cooking9 = slice('cooking', 9, { known: [] as string[], pantry: [] as unknown[] });
    const hunting3 = slice('hunting', 3, {} as unknown);
    full.register(cooking9);
    full.register(hunting3);
    full.restore(again.slices);
    expect(cooking9.value).toEqual(cookingNewer.d);
    expect(hunting3.value).toEqual(hunting.d);
  });

  it('slices and a clock that are not what they should be never set the save aside', () => {
    for (const [slices, clock] of [
      ['garbage', 'noon'],
      [[1, 2, 3], { day: -3, hour: 99, start: 0 }],
      [null, null],
      [{ forage: 7, skills: { v: 'one', d: 1 } }, 42],
    ] as [unknown, unknown][]) {
      // (as a save's text could hold them: anything at all)
      const s = plainSave() as unknown as Record<string, unknown>;
      s.slices = slices;
      s.clock = clock;
      storage.store.set(KEY, JSON.stringify(s));
      const back = loadSave();
      expect(back).not.toBeNull();
      expect(storage.store.has(`${KEY}.unread`)).toBe(false);
      const reg = new SaveSliceRegistry();
      const forage = slice('forage', 1, 'fresh');
      const skills = slice('skills', 1, 'fresh');
      reg.register(forage);
      reg.register(skills);
      expect(() => reg.restore(back!.slices)).not.toThrow();
      expect([forage.value, skills.value]).toEqual(['fresh', 'fresh']);
      const c = new WorldClock();
      c.begin(back!.hour);
      expect(c.restore(back!.clock)).toBe(false);
      expect(c.snapshot()).toEqual({ day: 0, hour: 14.25, start: 14.25 });
    }
  });

  it('the save’s own check is as it was: a part this build does not know still sets the whole save aside', () => {
    const s = plainSave();
    s.slices = { forage: { v: 1, d: 1 } };
    s.loose.push({ part: { ...newInstance('bat_std'), part: 'a_part_from_another_build' }, x: 0, y: 0, z: 0, yaw: 0 });
    writeSave(s);
    expect(loadSave()).toBeNull();
    expect(storage.store.has(KEY)).toBe(false);
    expect(storage.store.get(`${KEY}.unread`)).toContain('a_part_from_another_build');
    clearSave();
    expect(loadSave()).toBeNull();
  });
});
