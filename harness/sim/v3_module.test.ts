/// <reference types="vite/types/importMeta.d.ts" />
/**
 * The V3 kernel's game-side seams (src/game/modcar/kernel, docs/V3/nodes/N0-foundation.md) and the proof that
 * a system can be written against them alone: how modules are found and installed, the set of interactable
 * sources, the registry of developer tabs, and an example module (harness/sim/v3/example) that uses every seam
 * and is played here from a new game to a save, a reload, a midnight and a new game again by a stand-in for
 * the game (harness/sim/v3/fakeGame.ts) that drives the kernel in the real game's order.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { System } from '../../src/core/kernel/systems';
import type { GarageDevice } from '../../src/game/modcar/garageStub';
import type { GameContext } from '../../src/game/modcar/kernel/context';
import { BUILT_IN_DEV_TABS, DevTabs, type DevTab } from '../../src/game/modcar/kernel/devTabs';
import { InteractSources, type InteractSource } from '../../src/game/modcar/kernel/interact';
import { collectModules, installModules, MODULES, type GameModule } from '../../src/game/modcar/kernel/modules';
import { exampleModule, type BerriesSavedV1 } from './v3/example';
import { FakeGame } from './v3/fakeGame';
import { ALLOCATES, heapGrowth } from './v3/heap';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ------------------------------------------------------------------ finding and installing modules

describe('kernel: modules', () => {
  it('the game itself has no V3 module yet: it runs as it did', () => {
    expect(MODULES).toEqual([]);
    expect(fs.existsSync(path.join(ROOT, 'src/game/modcar/v3'))).toBe(false);
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
    // … nor the pick's question to the sources, with the list the player keeps for the answer
    const near: GarageDevice[] = [];
    const ask = (): void => {
      while (near.length > 0) near.pop();
      game.interact.near(berries.bushes[3].x - 1, berries.bushes[3].z, 3.1, near);
    };
    expect(heapGrowth(ask)).toBeLessThan(ALLOCATES / 4);
    expect(near.map((d) => d.id)).toEqual(['example:3']);
  });
});
