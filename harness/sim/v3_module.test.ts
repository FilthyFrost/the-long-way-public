/// <reference types="vite/types/importMeta.d.ts" />
/**
 * The V3 kernel's game-side seams (src/game/modcar/kernel, docs/V3/nodes/N0-foundation.md) and the proof that
 * a system can be written against them alone: how modules are found and installed, the set of interactable
 * sources, the registry of developer tabs, and an example module (harness/sim/v3/example) that uses every seam
 * and is played here from a new game to a save, a reload, a midnight and a new game again by a stand-in for
 * the game (harness/sim/v3/fakeGame.ts) that holds the kernel the real game holds (kernel/kernel.ts) and calls
 * it at the real game's moments.
 *
 * Nothing here depends on which modules the game itself has: the tests hold with none (today) and with any.
 */
import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DayClock } from '../../src/core/env/time';
import type { System } from '../../src/core/kernel/systems';
import type { GarageDevice } from '../../src/game/modcar/garageStub';
import type { GameContext } from '../../src/game/modcar/kernel/context';
import { BUILT_IN_DEV_TABS, DevTabs, type DevTab } from '../../src/game/modcar/kernel/devTabs';
import { InteractSources, type InteractSource } from '../../src/game/modcar/kernel/interact';
import { collectModules, installModules, type GameModule } from '../../src/game/modcar/kernel/modules';
import { exampleModule, type BerriesSaved, type BerriesSavedV1 } from './v3/example';
import { FakeGame } from './v3/fakeGame';
import { ALLOCATES, HEAP_RUNS, heapGrowth } from './v3/heap';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** every .ts file under a folder of the repository */
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...sources(rel));
    else if (e.name.endsWith('.ts')) out.push(rel);
  }
  return out;
}

// ------------------------------------------------------------------ finding and installing modules

describe('kernel: modules', () => {
  it('the game finds one module for every folder under src/game/modcar/v3 that has an index.ts, in the order of their ids', async () => {
    const dir = path.join(ROOT, 'src/game/modcar/v3');
    const folders = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'index.ts'))) : [];
    // (imported here and not at the top of the file: this evaluates every real module with all it imports, and
    // one that cannot be imported in Node then fails this one test, by name)
    const found = await import('../../src/game/modcar/kernel/discovery').catch((e: unknown) => {
      throw new Error(`a V3 module could not be imported in Node (nothing at a module's top level may touch the page): ${e instanceof Error ? e.message : String(e)}`);
    });
    const ids = found.MODULES.map((m) => m.id);
    expect(ids).toHaveLength(folders.length);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9_-]*$/);
  });

  it('only the page’s entry imports the discovery, and nothing else in the kernel needs the bundler', () => {
    // (whatever imports kernel/discovery.ts cannot run in plain Node and evaluates every real module: the game's
    // other files and the tests' stand-in must not; this file imports it inside the one test above)
    const importers = [...sources('src'), ...sources('harness/sim')].filter((f) => /from '[^']*kernel\/discovery'/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    expect(importers).toEqual(['src/game/modcar/entry.ts']);
    const globbing = [...sources('src/game/modcar/kernel'), ...sources('src/core/kernel'), ...sources('harness/sim/v3')].filter((f) => /import\.meta\.glob\(/.test(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^\s*(\/\/|\*).*$/gm, '')));
    expect(globbing).toEqual(['src/game/modcar/kernel/discovery.ts']);
  });

  it('finds every folder with an index.ts whose default export is a module (here: the example, by the same glob the game uses)', () => {
    const found = collectModules(import.meta.glob('./v3/*/index.ts', { eager: true }));
    expect(found.map((m) => m.id)).toEqual(['example']);
    expect(found[0].systems?.[0].id).toBe('example');
  });

  it('takes the modules in the order of their ids, whatever order the files come in', () => {
    const mod = (id: string): { default: GameModule } => ({ default: { id } });
    const a = collectModules({ '../v3/zebra/index.ts': mod('zebra'), '../v3/apple/index.ts': mod('apple'), '../v3/mango/index.ts': mod('mango') });
    const b = collectModules({ '../v3/mango/index.ts': mod('mango'), '../v3/zebra/index.ts': mod('zebra'), '../v3/apple/index.ts': mod('apple') });
    expect(a.map((m) => m.id)).toEqual(['apple', 'mango', 'zebra']);
    expect(b.map((m) => m.id)).toEqual(['apple', 'mango', 'zebra']);
    // (the id counts, not the folder's name)
    expect(collectModules({ '../v3/a/index.ts': mod('second'), '../v3/b/index.ts': mod('first') }).map((m) => m.id)).toEqual(['first', 'second']);
    expect(collectModules({})).toEqual([]);
  });

  it('refuses two modules with one id, and a file that exports no module, naming the files', () => {
    const mod = (id: string): { default: GameModule } => ({ default: { id } });
    expect(() => collectModules({ '../v3/one/index.ts': mod('forage'), '../v3/two/index.ts': mod('forage') })).toThrow("two modules have the id 'forage': ../v3/one/index.ts and ../v3/two/index.ts");
    expect(() => collectModules({ '../v3/empty/index.ts': {} })).toThrow(/^\.\.\/v3\/empty\/index\.ts must export a GameModule as its default/);
    expect(() => collectModules({ '../v3/named/index.ts': { module: { id: 'named' } } })).toThrow(/must export a GameModule/);
    expect(() => collectModules({ '../v3/bad/index.ts': { default: { id: 'Bad Id' } } })).toThrow(/must export a GameModule/);
  });

  it('installs what each module brings, then calls its setup; a module that throws is reported and the next still installed', () => {
    const game = new FakeGame([]);
    const log: string[] = [];
    const sys: System<GameContext> = { id: 'one' };
    const source: InteractSource = { near: () => {} };
    const tab: DevTab = { id: 'one', title: '一', build: () => {} };
    const failed: string[] = [];
    installModules(
      [
        { id: 'broken', systems: [{ id: 'before-the-throw' }], setup: () => { throw new Error('no table'); } },
        {
          id: 'one',
          systems: [sys],
          slices: [{ id: 'one', version: 1, snapshot: () => 1, restore: () => {} }],
          interact: [source],
          devTabs: [tab],
          setup: (ctx) => {
            // (the lists above are in before setup runs)
            log.push(`setup sees: ${ctx.systems.get('one') === sys}, ${ctx.slices.ids.join()}, ${ctx.interact.size}, ${ctx.devTabs.get('one') === tab}`);
          },
        },
      ],
      game.ctx,
      (id, e) => failed.push(`${id}: ${(e as Error).message}`),
    );
    expect(failed).toEqual(['broken: no table']);
    expect(log).toEqual(['setup sees: true, one, 1, true']);
    expect(game.systems.ids()).toEqual(['before-the-throw', 'one']);
  });

  it('says what each module brought: its lists, and what its setup registered by hand', () => {
    const game = new FakeGame([]);
    const parts = installModules(
      [
        { id: 'plain', systems: [{ id: 'plain' }], slices: [{ id: 'plain', version: 1, snapshot: () => 1, restore: () => {} }] },
        { id: 'nothing' },
        {
          id: 'by-hand',
          systems: [{ id: 'listed' }],
          setup: (ctx) => {
            ctx.systems.add({ id: 'added-in-setup' });
            ctx.slices.register({ id: 'registered-in-setup', version: 1, snapshot: () => 1, restore: () => {} });
          },
        },
        { id: 'half', slices: [{ id: 'half', version: 1, snapshot: () => 1, restore: () => {} }], setup: () => { throw new Error('stops here'); } },
      ],
      game.ctx,
      () => {},
    );
    expect(parts).toEqual([
      { id: 'plain', systems: ['plain'], slices: ['plain'] },
      { id: 'nothing', systems: [], slices: [] },
      { id: 'by-hand', systems: ['listed', 'added-in-setup'], slices: ['registered-in-setup'] },
      { id: 'half', systems: [], slices: ['half'] },
    ]);
  });
});

// ------------------------------------------------------------------ interactable sources

describe('kernel: interactable sources', () => {
  const device = (id: string, x: number, z: number): GarageDevice => ({ id, x, y: 1, z, radius: 0.3, word: { zh: id, en: id }, use: () => {} });

  it('asks every source for what is near and appends it all; with none there is nothing to ask', () => {
    const set = new InteractSources();
    expect(set.empty).toBe(true);
    const out: GarageDevice[] = [];
    set.near(0, 0, 3, out);
    expect(out).toEqual([]);
    const a = device('a', 1, 0);
    const b = device('b', 0, 2);
    const far = device('far', 50, 0);
    const within = (list: GarageDevice[]): InteractSource => ({ near: (x, z, r, o) => void o.push(...list.filter((d) => Math.hypot(d.x - x, d.z - z) <= r)) });
    const offA = set.add(within([a, far]));
    const second = within([b]);
    set.add(second);
    set.add(second);
    expect(set.size).toBe(2);
    expect(set.empty).toBe(false);
    const kept = device('already there', 0, 0);
    out.push(kept);
    set.near(0, 0, 3, out);
    expect(out).toEqual([kept, a, b]);
    offA();
    out.length = 0;
    set.near(0, 0, 3, out);
    expect(out).toEqual([b]);
    set.remove(second);
    expect(set.empty).toBe(true);
  });

  it('a source that throws is reported and left out, with what it had appended; the others are still asked', () => {
    const set = new InteractSources();
    const errors: string[] = [];
    set.onError = (e) => errors.push((e as Error).message);
    const good = device('good', 0, 1);
    set.add({ near: (_x, _z, _r, o) => void o.push(good) });
    set.add({
      near: (_x, _z, _r, o) => {
        o.push(device('half', 0, 0));
        throw new Error('index gone');
      },
    });
    set.add({ near: (_x, _z, _r, o) => void o.push(good) });
    const out: GarageDevice[] = [];
    set.near(0, 0, 3, out);
    expect(out).toEqual([good, good]);
    expect(errors).toEqual(['index gone']);
  });

  it('allocates nothing when it is asked', () => {
    const set = new InteractSources();
    const out: GarageDevice[] = [];
    // (the list emptied the way the player's pick empties its own: by popping)
    const ask = (): void => {
      while (out.length > 0) out.pop();
      set.near(1, 2, 3.1, out);
    };
    expect(heapGrowth(ask)).toBeLessThan(ALLOCATES / 4);
    const here = device('here', 1, 2);
    set.add({ near: (_x, _z, _r, o) => void o.push(here) });
    expect(heapGrowth(ask)).toBeLessThan(ALLOCATES / 4);
    expect(out).toEqual([here]);
  });

  it('a list cut to nothing with length = 0 does allocate when it is filled again (why the pick pops)', () => {
    const set = new InteractSources();
    const here = device('here', 1, 2);
    set.add({ near: (_x, _z, _r, o) => void o.push(here) });
    const out: GarageDevice[] = [];
    expect(
      heapGrowth(() => {
        out.length = 0;
        set.near(1, 2, 3.1, out);
      }),
    ).toBeGreaterThan(ALLOCATES);
  });
});

// ------------------------------------------------------------------ developer tabs

describe('kernel: developer tabs', () => {
  const tab = (id: string, order?: number): DevTab => ({ id, title: id, order, build: () => {} });

  it('keeps the registered tabs in order: by their order, then by id', () => {
    const tabs = new DevTabs();
    tabs.add(tab('weapons', 30));
    tabs.add(tab('forage', 10));
    tabs.add(tab('zz-no-order'));
    tabs.add(tab('cooking', 30));
    tabs.add(tab('aa-no-order'));
    expect(tabs.list().map((t) => t.id)).toEqual(['forage', 'cooking', 'weapons', 'aa-no-order', 'zz-no-order']);
    expect(tabs.size).toBe(5);
    expect(tabs.get('forage')?.order).toBe(10);
    expect(tabs.get('nobody')).toBeUndefined();
  });

  it('refuses a second tab with the same id, a bad id, and the ids of the panel’s own tabs', () => {
    const tabs = new DevTabs();
    tabs.add(tab('forage'));
    expect(() => tabs.add(tab('forage'))).toThrow(/'forage' is already registered/);
    expect(() => tabs.add(tab('For Age'))).toThrow(/id must be/);
    for (const own of BUILT_IN_DEV_TABS) expect(() => tabs.add(tab(own))).toThrow(/one of the developer panel's own tabs/);
  });

  it('knows the panel’s own tabs as devPanel.ts has them', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/game/modcar/devPanel.ts'), 'utf8');
    const table = /const TABS: \[TabId, string\]\[\] = \[([\s\S]*?)\];/.exec(src);
    expect(table).not.toBeNull();
    const ids = [...table![1].matchAll(/\['([a-z]+)',/g)].map((m) => m[1]);
    expect(ids).toHaveLength(8);
    expect([...BUILT_IN_DEV_TABS].sort()).toEqual([...ids].sort());
  });

  it('tells whoever watches of a tab added later, and takes a tab out again', () => {
    const tabs = new DevTabs();
    const seen: string[] = [];
    const stop = tabs.onAdd((t) => seen.push(t.id));
    const remove = tabs.add(tab('first'));
    tabs.add(tab('second'));
    stop();
    tabs.add(tab('unseen'));
    expect(seen).toEqual(['first', 'second']);
    remove();
    remove();
    expect(tabs.list().map((t) => t.id)).toEqual(['second', 'unseen']);
    // (free again)
    tabs.add(tab('first'));
    expect(tabs.size).toBe(3);
  });
});

// ------------------------------------------------------------------ the example module, played

/** a game with the example module, begun anew or taken up from a save */
async function play(restore: ConstructorParameters<typeof FakeGame>[1] = null, opts: { seed?: number; hour?: number } = {}): Promise<{ game: FakeGame; berries: ReturnType<typeof exampleModule>['berries'] }> {
  const m = exampleModule();
  const game = await new FakeGame([m], restore, opts).start();
  return { game, berries: m.berries };
}

describe('kernel: an example module against the interfaces alone', () => {
  it('is installed and set up: its system, slice, source and tab are in, and a new game is announced', async () => {
    const { game, berries } = await play();
    expect(game.systems.ids()).toEqual(['example']);
    expect(game.slices.ids).toEqual(['example']);
    expect(game.interact.size).toBe(1);
    expect(game.devTabs.list().map((t) => t.title)).toEqual(['浆果']);
    expect(berries.ran.init).toBe(1);
    expect(berries.began).toBe('new');
    expect(berries.bushes).toHaveLength(24);
    expect(game.reports).toEqual([]);
  });

  it('lays its content out from the seed: the same seed the same bushes, another seed others', async () => {
    const a = (await play(null, { seed: 4242 })).berries.bushes.map((b) => [b.x, b.z, b.berries, b.thorny]);
    const b = (await play(null, { seed: 4242 })).berries.bushes.map((b) => [b.x, b.z, b.berries, b.thorny]);
    const c = (await play(null, { seed: 4243 })).berries.bushes.map((b) => [b.x, b.z, b.berries, b.thorny]);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('runs its three hooks once a frame, in order, with the frame’s seconds — and stands frames of no seconds', async () => {
    const { game, berries } = await play();
    for (let i = 0; i < 60; i++) game.frame(1 / 60);
    expect(berries.ran).toMatchObject({ init: 1, pre: 60, step: 60, late: 60, dispose: 0 });
    expect(berries.ran.seconds).toBeCloseTo(1, 9);
    // (the test hook's simulate(0): two steps of no seconds)
    game.frame(0);
    game.frame(0);
    expect(berries.ran).toMatchObject({ pre: 62, step: 62, late: 62 });
    expect(berries.ran.seconds).toBeCloseTo(1, 9);
    // preStep reads where one is, step finds the nearest bush, lateUpdate places it by the floating origin
    const b5 = berries.bushes[5];
    game.walker.x = b5.x - 2;
    game.walker.z = b5.z;
    game.origin.x = 256;
    game.frame();
    expect(berries.at).toEqual({ x: b5.x - 2, z: b5.z });
    expect(berries.nearest).toBe(5);
    expect(berries.shown).toEqual({ x: b5.x - 256, y: b5.y, z: b5.z });
    // … and from a seat it is the vehicle that counts
    game.seated = { sim: { px: berries.bushes[9].x, pz: berries.bushes[9].z } } as GameContext['seated'];
    game.frame();
    expect(berries.nearest).toBe(9);
  });

  it('puts things under the mark that E works: a press picks a bush, the event is heard, the bush is no longer offered', async () => {
    const { game, berries } = await play();
    const heard: { bush: number; berries: number }[] = [];
    game.events.on('example:picked', (e) => heard.push({ ...e }));
    const bush = berries.bushes.find((b) => !b.thorny)!;
    // far from any bush the mark is on nothing
    expect(game.mark()).toBeNull();
    game.standBefore(bush.x, bush.y, bush.z);
    const dv = game.mark();
    expect(dv?.id).toBe(`example:${bush.index}`);
    expect(dv?.word).toEqual({ zh: '摘浆果', en: 'Pick the berries' });
    expect(dv?.holdS).toBeUndefined();
    // looking away from it: nothing
    game.walker.heading = Math.PI / 2;
    expect(game.mark()).toBeNull();
    game.walker.heading = 0;
    expect(game.pressE()).toBe(true);
    expect(heard).toEqual([{ bush: bush.index, berries: bush.berries }]);
    expect(berries.picked).toBe(bush.berries);
    expect(game.said).toEqual([`摘了 ${bush.berries} 颗浆果。`]);
    expect(game.mark()).toBeNull();
    expect(game.pressE()).toBe(false);
  });

  it('a device that wants E held is told the hold’s progress and used only when it is full', async () => {
    const { game, berries } = await play();
    const thorny = berries.bushes.find((b) => b.thorny)!;
    game.standBefore(thorny.x, thorny.y, thorny.z);
    expect(game.mark()?.holdS).toBe(0.6);
    expect(game.mark()?.word.zh).toBe('小心地摘浆果');
    expect(game.pressE(0.3)).toBe(false);
    expect(thorny.held).toBeCloseTo(0.5, 1);
    expect(berries.picked).toBe(0);
    expect(game.pressE(0.7)).toBe(true);
    expect(berries.picked).toBe(thorny.berries);
  });

  it('keeps its state in its slice: saved, read back by a new page, and the game says it was restored', async () => {
    const { game, berries } = await play(null, { seed: 9 });
    expect(game.snapshot().slices).toBeUndefined();
    berries.harness.pick(3);
    berries.harness.pick(11);
    const save = game.saved();
    expect(save.slices).toEqual({ example: { v: 2, d: { bare: { 3: 0, 11: 0 }, picked: berries.bushes[3].berries + berries.bushes[11].berries } } });
    const again = await play(save, { seed: 9 });
    expect(again.berries.began).toBe('restored');
    expect(again.berries.bare()).toEqual([3, 11]);
    expect(again.berries.picked).toBe(berries.picked);
    expect(again.game.reports).toEqual([]);
    // and the save it writes is the same save
    expect(again.game.saved()).toEqual(save);
  });

  it('reads a slice written by its older version through its migration', async () => {
    const old: BerriesSavedV1 = [2, 7, 8];
    const { game, berries } = await play({ hour: 14, slices: { example: { v: 1, d: old } } });
    expect(berries.bare()).toEqual([2, 7, 8]);
    expect(berries.picked).toBe(9);
    expect(game.reports).toEqual([]);
    // written again in today's shape
    expect(game.saved().slices).toEqual({ example: { v: 2, d: { bare: { 2: 0, 7: 0, 8: 0 }, picked: 9 } } });
    // a version it has no way from: reported, cleared, the game goes on
    const lost = await play({ hour: 14, slices: { example: { v: 0, d: 'what' } } });
    expect(lost.game.reports).toEqual(['save slice example (migrate): berries: no way from version 0']);
    expect(lost.berries.bare()).toEqual([]);
  });

  it('hears the world’s clock: a bush picked today bears again after midnight, and the clock goes on from the save', async () => {
    const { game, berries } = await play(null, { hour: 21 });
    const days: number[] = [];
    game.events.on('clock:day', (e) => days.push(e.day));
    berries.harness.pick(1);
    // the evening goes by, a frame at a time
    for (let h = 21; h < 23.9; h += 0.05) {
      game.sky.hour = h;
      game.frame();
    }
    expect(berries.bare()).toEqual([1]);
    expect(game.ctx.clock.day).toBe(0);
    game.sky.hour = 0.02;
    game.frame();
    expect(days).toEqual([1]);
    expect(berries.bare()).toEqual([]);
    expect(game.ctx.clock.worldSeconds).toBeCloseTo((24 + 0.02 - 21) * 3600, 6);
    // picked on day 1, saved, taken up again: still day 1, the same seconds; the next midnight is day 2
    berries.harness.pick(4);
    const save = game.saved();
    expect(save.clock).toEqual({ day: 1, hour: 0.02, start: 21 });
    const again = await play(save);
    expect(again.game.ctx.clock.day).toBe(1);
    expect(again.game.ctx.clock.worldSeconds).toBe(game.ctx.clock.worldSeconds);
    again.game.frame();
    expect(again.game.ctx.clock.worldSeconds).toBe(game.ctx.clock.worldSeconds);
    expect(again.berries.bare()).toEqual([4]);
    again.game.setHour(23);
    expect(again.berries.bare()).toEqual([4]);
    // the hour set back by hand is the next day: the bush bears
    again.game.setHour(6);
    expect(again.game.ctx.clock.day).toBe(2);
    expect(again.berries.bare()).toEqual([]);
  });

  it('a save from before there were slices, or before the clock, is taken up as it always was: every slice as a new game starts', async () => {
    const { game, berries } = await play({ hour: 16.5 });
    expect(berries.began).toBe('restored');
    expect(berries.bare()).toEqual([]);
    expect(berries.picked).toBe(0);
    // (its clock begins at the hour it was saved at)
    expect(game.clock.snapshot()).toEqual({ day: 0, hour: 16.5, start: 16.5 });
    expect(game.reports).toEqual([]);
  });

  it('carries a slice of a system that is not there through the game, untouched', async () => {
    const hunting = { v: 3, d: { herds: [[1, 2, 3]], pressure: 0.4 } };
    const { game, berries } = await play({ hour: 10, slices: { hunting, example: { v: 2, d: { bare: { 5: 0 }, picked: 4 } } } });
    expect(berries.bare()).toEqual([5]);
    expect(game.slices.carriedIds).toEqual(['hunting']);
    for (let i = 0; i < 10; i++) game.frame();
    berries.harness.pick(6);
    const save = game.saved();
    expect(save.slices!.hunting).toEqual(hunting);
    expect(Object.keys(save.slices!)).toEqual(['example', 'hunting']);
    // (not an error: the game runs clean)
    expect(game.reports).toEqual([]);
  });

  it('a save written while the page is still loading keeps the parts it was loaded with', async () => {
    const hunting = { v: 3, d: { herds: [[1, 2, 3]] } };
    const save = { hour: 10, slices: { hunting, example: { v: 2, d: { bare: { 5: 0 }, picked: 4 } } }, clock: { day: 2, hour: 10, start: 9 } };
    const m = exampleModule();
    const game = new FakeGame([m], save);
    // (the systems are not set up yet, the slices not read: what the page would write now if it were hidden)
    expect(m.berries.bare()).toEqual([]);
    const early = game.saved();
    expect(early.slices).toEqual(save.slices);
    expect(early.clock).toEqual(save.clock);
    await game.start();
    expect(m.berries.bare()).toEqual([5]);
    expect(game.saved().slices).toEqual(save.slices);
    // a new game not yet set up has nothing to write
    expect(new FakeGame([exampleModule()]).snapshot().slices).toBeUndefined();
  });

  it('has a developer tab built from the panel’s pieces, whose buttons work the system', async () => {
    const { game, berries } = await play();
    berries.harness.pick(0);
    berries.harness.pick(1);
    const tab = game.openTab('example')!;
    expect(tab.made).toEqual(['heading: 现在的情况', 'box: ', 'heading: 动手', 'buttons: 全部重新长出 | 摘最近的一丛', 'note: 浆果丛按世界种子排在路边；摘过的第二天重新结果。']);
    expect(tab.box?.textContent).toBe(`24 丛，其中 2 丛摘过了 · 一共摘了 ${berries.picked} 颗`);
    tab.buttons[0].click({} as HTMLButtonElement);
    expect(tab.message).toBe('2 丛重新结果了。');
    expect(berries.bare()).toEqual([]);
    game.devTabs.get('example')!.tick!();
    expect(tab.box?.textContent).toBe(`24 丛，其中 0 丛摘过了 · 一共摘了 ${berries.picked} 颗`);
    expect(game.openTab('nobody')).toBeNull();
  });

  it('is timed against the budget it declared, and reachable by name from a test script', async () => {
    const m = exampleModule();
    // (a second system of the test's own, which takes longer than it said it would)
    let slow = 0.25;
    const game = new FakeGame([m, { id: 'greedy', systems: [{ id: 'greedy', budget: { cpuMs: 0.1 }, step: () => game.passes(slow) }] }]);
    await game.start();
    for (let i = 0; i < 100; i++) game.frame();
    const t = game.systems.telemetry();
    expect(Object.keys(t)).toEqual(['example', 'greedy']);
    expect(t.example.budgetMs).toBe(0.05);
    expect(t.example.over).toBe(false);
    expect(t.example.ms.total).toBe(0);
    // (the first bush stands within thirty metres of where the walker starts)
    expect(t.example.own).toEqual({ bushes: 24, bare: 0, picked: 0, nearest: 0 });
    expect(t.greedy.ms.step).toBeCloseTo(0.25, 9);
    expect(t.greedy.over).toBe(true);
    expect(t.greedy.overFrames).toBe(100);
    slow = 0.01;
    for (let i = 0; i < 300; i++) game.frame();
    expect(game.systems.telemetry().greedy.over).toBe(false);
    expect(game.systems.harness('example', 'pick', 2)).toBe(true);
    expect(game.systems.harness('example', 'pick', 2)).toBe(false);
    expect(game.systems.harness('example', 'bare')).toEqual([2]);
  });

  it('hears what the game says of the body', async () => {
    const { game, berries } = await play();
    // (as ModGame.consume says it)
    game.events.emit('body:ate', { item: { uid: 'i1', item: 'food_can' } as never });
    game.events.emit('body:ate', { item: { uid: 'i2', item: 'food_can' } as never });
    expect(berries.eaten).toBe(2);
  });

  it('goes on when another module’s system throws every frame, and the throw is reported', async () => {
    const m = exampleModule();
    const game = await new FakeGame([{ id: 'aaa-broken', systems: [{ id: 'broken', step: () => { throw new Error('nil herd'); } }] }, m]).start();
    for (let i = 0; i < 3; i++) game.frame();
    expect(m.berries.ran).toMatchObject({ pre: 3, step: 3, late: 3 });
    expect(game.reports).toEqual(['system broken (step): nil herd', 'system broken (step): nil herd', 'system broken (step): nil herd']);
    expect(game.systems.telemetry().broken.errors).toBe(3);
    // (written out once, and the player told once)
    expect(game.written).toEqual(['error: [kernel] system broken (step)']);
    expect(game.said).toEqual(['出了个小错，已跳过，游戏继续。']);
  });

  it('writes a fault out and says it once per kind, however many hooks throw and for however long', async () => {
    const boom = (phase: string) => (): void => {
      throw new Error(`nil herd in ${phase}`);
    };
    const m = exampleModule();
    const game = await new FakeGame([{ id: 'aaa-broken', systems: [{ id: 'broken', preStep: boom('pre'), step: boom('step'), lateUpdate: boom('late') }] }, m]).start();
    // (ten seconds of a system with broken state: it throws in each of its three hooks, every frame)
    for (let i = 0; i < 600; i++) game.frame();
    expect(game.reports).toHaveLength(1800);
    expect(game.kernel.log).toEqual({ last: 'system broken (lateUpdate): nil herd in late', count: 1800 });
    expect(game.written).toEqual(['error: [kernel] system broken (preStep)', 'error: [kernel] system broken (step)', 'error: [kernel] system broken (lateUpdate)']);
    expect(game.said).toEqual(['出了个小错，已跳过，游戏继续。', '出了个小错，已跳过，游戏继续。', '出了个小错，已跳过，游戏继续。']);
    expect(m.berries.ran).toMatchObject({ pre: 600, step: 600, late: 600 });
    // a fault whose words change every time is a new kind every time: two dozen are written and said, the rest counted
    let n = 0;
    const counting = await new FakeGame([{ id: 'counting', systems: [{ id: 'counting', step: () => { throw new Error(`bush ${n++} is gone`); } }] }]).start();
    for (let i = 0; i < 500; i++) counting.frame();
    expect(counting.reports).toHaveLength(500);
    expect(counting.written.filter((w) => w.startsWith('error: '))).toHaveLength(24);
    expect(counting.written.at(-1)).toBe('warn: [kernel] 24 kinds of fault so far: further kinds are only counted');
    expect(counting.said).toHaveLength(24);
    expect(counting.kernel.telemetry()).toMatchObject({ lastError: 'system counting (step): bush 499 is gone', errors: 500 });
    // (whatever was thrown, the report itself does not throw)
    expect(() => counting.kernel.report('odd', Object.create(null))).not.toThrow();
    expect(counting.kernel.log.last).toBe('odd: something that cannot be put into words');
  });

  it('a system that does not come up keeps what the save has of it: its slice is set aside, not emptied', async () => {
    // the first page: three bushes picked, saved
    const first = await play(null, { seed: 9 });
    for (const i of [0, 3, 5]) first.berries.harness.pick(i);
    const save1 = first.game.saved();
    const record = save1.slices!.example;
    expect(Object.keys((record.d as BerriesSaved).bare)).toEqual(['0', '3', '5']);
    // the second page: the system's init fails (a model would not load, this once)
    const m = exampleModule();
    (m.berries as { init: unknown }).init = (): void => {
      throw new Error('a model would not load');
    };
    const second = await new FakeGame([m], save1, { seed: 9 }).start();
    expect(second.reports).toEqual(['system example (init): a model would not load']);
    expect(second.systems.telemetry().example.failed).toBe(true);
    expect(second.slices.heldIds).toEqual(['example']);
    expect(second.written).toEqual(['error: [kernel] system example (init)', 'warn: [kernel] save slice example (version 2) is kept unread: its system is not running']);
    // (nothing was handed to a system that never laid its bushes out)
    expect([m.berries.picked, m.berries.bushes.length]).toEqual([0, 0]);
    for (let i = 0; i < 5; i++) second.frame();
    expect(m.berries.ran).toMatchObject({ pre: 0, step: 0, late: 0 });
    // its next autosave: the record as it came
    const save2 = second.saved();
    expect(save2.slices!.example).toEqual(record);
    // the third page, on which the model loads: everything is there
    const third = await play(save2, { seed: 9 });
    expect(third.berries.bare()).toEqual([0, 3, 5]);
    expect(third.berries.picked).toBe(first.berries.picked);
    expect(third.game.reports).toEqual([]);
    // (a new game on a page whose system is down: nothing to keep, nothing written, nothing asked of it)
    const down = exampleModule();
    (down.berries as { init: unknown }).init = (): void => {
      throw new Error('a model would not load');
    };
    const fresh = await new FakeGame([down]).start();
    expect(fresh.snapshot().slices).toBeUndefined();
    expect(down.berries.began).toBe('new');
  });

  it('when the systems cannot be ordered none runs and none of their slices is read: every record goes on as it came', async () => {
    const save = { hour: 10, slices: { example: { v: 2, d: { bare: { 5: 0 }, picked: 4 } }, lone: { v: 1, d: 'of a module without a system' } } };
    const m = exampleModule();
    const lone = { value: '' };
    const game = await new FakeGame(
      [m, { id: 'needy', systems: [{ id: 'needy', after: ['nobody'] }] }, { id: 'lone', slices: [{ id: 'lone', version: 1, snapshot: () => lone.value, restore: (d: string) => void (lone.value = d) }] }],
      save,
    ).start();
    expect(game.reports).toEqual(["systems: the system 'needy' is to come after 'nobody', but no system with that id is registered (there are: example, needy)"]);
    expect(m.berries.ran.init).toBe(0);
    // (the slice of the module whose system is not up is set aside; the one of a module with no system is read)
    expect(game.slices.heldIds).toEqual(['example']);
    expect(lone.value).toBe('of a module without a system');
    game.frame();
    expect(game.saved().slices).toEqual(save.slices);
    // the game itself goes on, and says how it began
    expect(m.berries.began).toBe('restored');
  });

  it('a slice that will not read starts as new, and the record it could not read is kept beside it', async () => {
    const bad = { v: 2, d: { bare: null, picked: 30 } };
    const { game, berries } = await play({ hour: 10, slices: { example: bad } });
    expect(game.reports).toHaveLength(1);
    expect(game.reports[0]).toMatch(/^save slice example \(restore\): /);
    expect([berries.picked, berries.bare()]).toEqual([0, []]);
    berries.harness.pick(2);
    const save = game.saved();
    expect(save.slices).toEqual({ example: { v: 2, d: { bare: { 2: 0 }, picked: berries.bushes[2].berries } }, 'example.unread': bad });
  });

  it('a first frame of negative seconds: the hooks are handed none, the world’s clock waits, and a save written then is taken up without a day gone by', async () => {
    /** a step as the game makes it: the session's time goes on, and the environment shows the hour at that time */
    const step = (g: FakeGame, clock: DayClock, dt: number): void => {
      g.sky.hour = clock.hourAt(g.time + dt);
      g.frame(dt);
    };
    const day = new DayClock();
    day.setHour(9.2, 0);
    const { game, berries } = await play(null, { hour: day.hourAt(0) });
    const days: number[] = [];
    game.events.on('clock:day', (e) => days.push(e.day));
    // (the game's loop can hand its first frame a step of negative seconds: the whole game goes back by it, once)
    step(game, day, -0.3);
    expect(berries.ran).toMatchObject({ pre: 1, step: 1, late: 1, seconds: 0 });
    expect(game.sky.hour).toBeLessThan(game.clock.hour);
    expect(game.clock.waiting).toBe(true);
    // the page is hidden there and then, and writes its save
    const save = game.saved();
    expect(save.hour).toBeLessThan(save.clock!.hour);
    for (let i = 0; i < 120; i++) step(game, day, 1 / 60);
    expect([game.clock.day, days, game.clock.waiting]).toEqual([0, [], false]);
    expect(game.clock.worldSeconds).toBeGreaterThan(0);
    // the page that takes that save up
    const day2 = new DayClock();
    day2.setHour(save.hour, 0);
    const again = await play(save);
    again.game.events.on('clock:day', (e) => days.push(e.day));
    for (let i = 0; i < 120; i++) step(again.game, day2, 1 / 60);
    expect([again.game.clock.day, days, again.game.clock.waiting]).toEqual([0, [], false]);
    expect(again.game.clock.worldSeconds).toBeGreaterThan(0);
    expect(again.game.clock.worldSeconds).toBeLessThan(120);
  });

  it('says of itself what the test hook shows: the modules, the systems, the slices, the clock, the last fault', async () => {
    const { game } = await play({ hour: 10, slices: { hunting: { v: 1, d: 1 } }, clock: { day: 3, hour: 10, start: 9 } });
    game.frame();
    const t = game.kernel.telemetry();
    expect(Object.keys(t)).toEqual(['modules', 'systems', 'slices', 'clock', 'interact', 'devTabs', 'lastError', 'errors']);
    expect(t).toMatchObject({
      modules: ['example'],
      slices: { ids: ['example'], carried: ['hunting'], held: [], reports: [{ id: 'hunting', what: 'unknown', v: 1 }] },
      clock: { worldSeconds: (3 * 24 + 1) * 3600, day: 3, hour: 10, startHour: 9, waiting: false },
      interact: 1,
      devTabs: ['example'],
      lastError: '',
      errors: 0,
    });
    expect(Object.keys(t.systems as object)).toEqual(['example']);
    expect(JSON.parse(JSON.stringify(t))).toEqual(t);
  });

  it('a new game clears its slice, says so, and takes the systems down', async () => {
    const { game, berries } = await play({ hour: 12, slices: { example: { v: 2, d: { bare: { 3: 0 }, picked: 5 } }, hunting: { v: 1, d: 1 } }, clock: { day: 6, hour: 12, start: 9 } });
    expect(berries.began).toBe('restored');
    expect(game.ctx.clock.day).toBe(6);
    game.frame();
    game.newGame();
    expect(berries.began).toBe('new');
    expect(berries.bare()).toEqual([]);
    expect(berries.picked).toBe(0);
    expect(game.clock.snapshot()).toEqual({ day: 0, hour: 12, start: 12 });
    expect(game.snapshot().slices).toBeUndefined();
    expect(berries.ran.dispose).toBe(1);
    const before = { ...berries.ran };
    game.frame();
    expect(berries.ran).toEqual(before);
  });

  it('allocates nothing in a frame: the kernel and the example’s hooks together', async () => {
    const { game, berries } = await play();
    game.walker.x = berries.bushes[3].x - 1;
    const frame = (): void => game.frame(0);
    expect(heapGrowth(frame)).toBeLessThan(ALLOCATES / 4);
  });

  it('the pick’s question to the sources: the set and the source allocate nothing; a fraction for a coordinate costs what the engine makes of it', async () => {
    const { game, berries } = await play();
    const bush = berries.bushes[3];
    // (the list the player keeps for the answer, emptied the way the pick empties it)
    const near: GarageDevice[] = [];
    // Whole numbers for the coordinates first. The engine never puts those on the heap, however the call is
    // made, so this measures the set's and the source's own code and nothing else — whatever other sources
    // there are in the process (what the engine folds into what depends on that, see below).
    const x = Math.round(bush.x - 1) | 0;
    const z = Math.round(bush.z) | 0;
    const whole = (): void => {
      while (near.length > 0) near.pop();
      game.interact.near(x, z, 3, near);
    };
    expect(heapGrowth(whole)).toBeLessThan(ALLOCATES / 4);
    expect(near).toHaveLength(1);
    expect(near[0]).toBe(bush);
    // Fractions, as the player's eye has them. A fraction handed to a function the engine has not folded into
    // its caller is put on the heap first, 16 bytes of it; and whether the engine folds a source's `near` in
    // depends on how many kinds of source it has seen, not on this source. So: nothing when it is folded in,
    // 16 bytes for each of the two coordinates when it is not, and never more — the source adds none of its own.
    const eye = { x: bush.x - 1.25, z: bush.z + 0.125 };
    const fractions = (): void => {
      while (near.length > 0) near.pop();
      game.interact.near(eye.x, eye.z, 3.1, near);
    };
    const bytes = Math.max(0, heapGrowth(fractions) / HEAP_RUNS);
    console.log(`[v3 kernel] the pick's question to one source, fractions for coordinates: ${bytes.toFixed(1)} bytes a call (0 when the engine folds the call in, 16 for each coordinate it puts on the heap)`);
    expect(bytes).toBeLessThan(40);
    expect(near[0]).toBe(bush);
  });

  it('with no module the kernel’s part of a frame costs a few nanoseconds and allocates nothing', async () => {
    // (how the game runs until the first system is in: the three hooks and the world's clock, through the kernel the game holds)
    const game = await new FakeGame([]).start();
    const hours = new Float64Array(4096);
    for (let i = 0; i < hours.length; i++) hours[i] = 9.2 + i * 0.000001;
    const at = new Int32Array(1);
    const frame = (): void => {
      at[0] = (at[0] + 1) & 4095;
      game.sky.hour = hours[at[0]];
      game.frame(0.016);
    };
    expect(heapGrowth(frame)).toBeLessThan(ALLOCATES / 4);
    let best = Infinity;
    const N = 1_000_000;
    for (let round = 0; round < 5; round++) {
      const t0 = performance.now();
      for (let i = 0; i < N; i++) frame();
      best = Math.min(best, ((performance.now() - t0) / N) * 1e6);
    }
    console.log(`[v3 kernel] the kernel's part of a frame with no module: ${best.toFixed(1)} ns, no allocation (three hooks and the world clock through kernel.ts; Node ${process.version})`);
    expect(best).toBeLessThan(1000);
    expect(game.kernel.telemetry()).toMatchObject({ modules: [], systems: {}, errors: 0 });
  });
});
