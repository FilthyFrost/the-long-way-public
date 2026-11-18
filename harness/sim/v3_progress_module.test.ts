/**
 * The progress module in a stand-in game (src/game/modcar/v3/progress, node W3): the one Progress changed
 * through the module's helpers, each change said on the event bus, counted and worded in one line; the lines
 * brought out one at a time and never while driving; the save slice's round trip; a new game; the developer's
 * tab; what the module costs in a frame.
 *
 * A skill and a field of the compendium of the test's own are registered here: the module itself brings none.
 */
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { registerSkill, xpForLevel } from '../../src/core/v3/progress/progress';
import type { GameContext } from '../../src/game/modcar/kernel/context';
import { announce, atWalkingPace, forgetDomain, gainXp, learn, learnMany, linesWaiting, meet, progress, progressRev, registerDomain, setSkillLevel, WALK_KMH } from '../../src/game/modcar/v3/progress/api';
import progressModule from '../../src/game/modcar/v3/progress/index';
import { FakeGame, type FakeSave } from './v3/fakeGame';
import { ALLOCATES, heapGrowth } from './v3/heap';

registerSkill({
  id: 'tp_cook',
  name: { zh: '试验厨艺', en: 'Test cooking' },
  perks: [
    { id: 'tp_cook_quick', level: 5, name: { zh: '手快', en: 'Quick hands' }, blurb: { zh: '切得快。', en: 'Chops faster.' } },
    { id: 'tp_cook_taste', level: 10, name: { zh: '舌头灵', en: 'Fine palate' }, blurb: { zh: '尝得出火候。', en: 'Tastes the heat.' } },
  ],
});

const DISHES: Record<string, { zh: string; en: string }> = {
  stew: { zh: '炖菜', en: 'Stew' },
  soup: { zh: '汤', en: 'Soup' },
  pie: { zh: '馅饼', en: 'Pie' },
};
/** while a dish is not known it goes by this */
const UNKNOWN = { zh: '没见过的菜', en: 'Unknown dish' };
registerDomain({ id: 'tp_dish', name: { zh: '试验菜', en: 'Test dishes' }, ids: () => Object.keys(DISHES), nameOf: (id) => (progress.knowledge('tp_dish', id) === 2 ? DISHES[id] : UNKNOWN) });

/** a game with the module in it, started; what the bus said is kept */
async function play(save: FakeSave | null = null): Promise<{ game: FakeGame; ctx: GameContext; heard: string[] }> {
  const game = await new FakeGame([progressModule], save).start();
  const heard: string[] = [];
  game.events.on('skill:xp', (e) => heard.push(`xp ${e.skill} +${e.gained} = ${e.xp} (level ${e.level})`));
  game.events.on('skill:level', (e) => heard.push(`level ${e.skill} ${e.from} -> ${e.level}`));
  game.events.on('compendium:met', (e) => heard.push(`met ${e.domain}/${e.id}`));
  game.events.on('compendium:learned', (e) => heard.push(`learned ${e.domain}/${e.id} by ${e.by}`));
  return { game, ctx: game.ctx, heard };
}

/** a vehicle one sits in, as far as the module looks at it: how fast it goes */
const seat = (kmh: number): GameContext['seated'] => ({ sim: { kmh } }) as GameContext['seated'];

describe('progress module: what it brings', () => {
  it('a system with a small budget, the slice "progress" and the tab 成长', async () => {
    const { game } = await play();
    expect(game.kernel.telemetry()).toMatchObject({ modules: ['progress'], devTabs: ['progress'], errors: 0 });
    expect(game.systems.ids()).toEqual(['progress']);
    expect(game.systems.telemetry().progress.budgetMs).toBeLessThanOrEqual(0.05);
    expect(game.slices.ids).toEqual(['progress']);
    expect(game.devTabs.get('progress')?.title).toBe('成长');
    expect(game.reports).toEqual([]);
  });
});

describe('progress module: skills', () => {
  it('experience is said every time; a level gained is said once, with a line that names the perk it grants', async () => {
    const { game, ctx, heard } = await play();
    expect(gainXp(ctx, 'tp_cook', 5)).toBe(0);
    expect(heard).toEqual(['xp tp_cook +5 = 5 (level 1)']);
    expect(game.said).toEqual([]);
    // from 5 to what level 5 takes: four levels at once, one event, one line, the perk named
    const before = progressRev();
    expect(gainXp(ctx, 'tp_cook', xpForLevel(5) - 5)).toBe(4);
    expect(progress.level('tp_cook')).toBe(5);
    expect(heard.slice(1)).toEqual([`xp tp_cook +${xpForLevel(5) - 5} = ${xpForLevel(5)} (level 5)`, 'level tp_cook 1 -> 5']);
    expect(game.said).toEqual(['试验厨艺升到 5 级 · 学会了「手快」']);
    expect(progress.hasPerk('tp_cook_quick')).toBe(true);
    expect(progress.hasPerk('tp_cook_taste')).toBe(false);
    expect(progressRev()).toBeGreaterThan(before);
    // nothing for nothing
    expect(gainXp(ctx, 'tp_cook', 0)).toBe(0);
    expect(gainXp(ctx, 'tp_cook', -3)).toBe(0);
    expect(heard).toHaveLength(3);
  });

  it('a level without a perk says the level alone, and a quiet gain says no line', async () => {
    const { game, ctx } = await play();
    gainXp(ctx, 'tp_cook', xpForLevel(2));
    expect(game.said).toEqual(['试验厨艺升到 2 级']);
    gainXp(ctx, 'tp_cook', xpForLevel(3) - xpForLevel(2), { quiet: true });
    expect(progress.level('tp_cook')).toBe(3);
    expect(game.said).toHaveLength(1);
  });
});

describe('progress module: the compendium', () => {
  it('a thing met is said the first time, by the name it goes by; learnt, by its own', async () => {
    const { game, ctx, heard } = await play();
    expect(meet(ctx, 'tp_dish', 'stew', 2)).toBe(true);
    expect(meet(ctx, 'tp_dish', 'stew', 3)).toBe(false);
    expect(progress.entry('tp_dish', 'stew')).toMatchObject({ state: 1, count: 5, firstDay: 0 });
    expect(heard).toEqual(['met tp_dish/stew']);
    expect(game.said).toEqual(['第一次见到：没见过的菜']);
    game.frame(3);
    expect(learn(ctx, 'tp_dish', 'stew', 'taste')).toBe(true);
    expect(learn(ctx, 'tp_dish', 'stew', 'page')).toBe(false);
    expect(heard).toEqual(['met tp_dish/stew', 'learned tp_dish/stew by taste']);
    expect(game.said).toEqual(['第一次见到：没见过的菜', '认出来了：炖菜']);
    expect(progress.entry('tp_dish', 'stew')).toMatchObject({ state: 2, by: 'taste', count: 5 });
  });

  it('a thing learnt before it was ever found is still to be met', async () => {
    const { ctx, heard } = await play();
    expect(learn(ctx, 'tp_dish', 'pie', 'page', { quiet: true })).toBe(true);
    expect(progress.entry('tp_dish', 'pie')).toMatchObject({ state: 2, count: 0 });
    expect(meet(ctx, 'tp_dish', 'pie', 1, { quiet: true })).toBe(true);
    expect(meet(ctx, 'tp_dish', 'pie', 1, { quiet: true })).toBe(false);
    expect(heard).toEqual(['learned tp_dish/pie by page', 'met tp_dish/pie']);
  });

  it('several learnt at once are each said on the bus and in no line: the caller has one for the lot', async () => {
    const { game, ctx, heard } = await play();
    learn(ctx, 'tp_dish', 'soup', 'taste', { quiet: true });
    expect(learnMany(ctx, 'tp_dish', ['stew', 'soup', 'pie'], 'page')).toBe(2);
    expect(heard).toEqual(['learned tp_dish/soup by taste', 'learned tp_dish/stew by page', 'learned tp_dish/pie by page']);
    expect(game.said).toEqual([]);
    expect(progress.tally('tp_dish')).toEqual({ met: 3, known: 3 });
  });
});

describe('progress module: lines', () => {
  it('one at a time: a line that comes while another is up waits its turn', async () => {
    const { game, ctx } = await play();
    announce(ctx, 'one', 2);
    announce(ctx, 'two', 1);
    announce(ctx, 'three', 1);
    expect(game.said).toEqual(['one']);
    expect(linesWaiting()).toBe(2);
    for (let i = 0; i < 60; i++) game.frame(1 / 60);
    expect(game.said).toEqual(['one']);
    for (let i = 0; i < 90; i++) game.frame(1 / 60);
    expect(game.said).toEqual(['one', 'two']);
    for (let i = 0; i < 90; i++) game.frame(1 / 60);
    expect(game.said).toEqual(['one', 'two', 'three']);
    expect(linesWaiting()).toBe(0);
    // (long after: the next one is said at once again)
    for (let i = 0; i < 120; i++) game.frame(1 / 60);
    announce(ctx, 'four', 1);
    expect(game.said).toEqual(['one', 'two', 'three', 'four']);
  });

  it('none while driving: lines wait until the vehicle is down to a walk, and only the last few are kept', async () => {
    const { game, ctx } = await play();
    game.seated = seat(60);
    expect(atWalkingPace(ctx)).toBe(false);
    for (let i = 0; i < 8; i++) announce(ctx, `line ${i}`, 1);
    for (let i = 0; i < 600; i++) game.frame(1 / 60);
    expect(game.said).toEqual([]);
    expect(linesWaiting()).toBe(5);
    game.seated = seat(WALK_KMH - 1);
    expect(atWalkingPace(ctx)).toBe(true);
    game.frame(1 / 60);
    expect(game.said).toEqual(['line 3']);
    for (let i = 0; i < 600; i++) game.frame(1 / 60);
    expect(game.said).toEqual(['line 3', 'line 4', 'line 5', 'line 6', 'line 7']);
    game.seated = null;
    expect(atWalkingPace(ctx)).toBe(true);
  });

  it('a new game begins with no line up and none waiting', async () => {
    const first = await play();
    announce(first.ctx, 'one', 5);
    announce(first.ctx, 'two', 5);
    expect(linesWaiting()).toBe(1);
    const { game, ctx } = await play();
    expect(linesWaiting()).toBe(0);
    announce(ctx, 'fresh', 1);
    expect(game.said).toEqual(['fresh']);
  });
});

describe('progress module: the save', () => {
  it('experience and entries come back from a save; a game without a save starts with nothing', async () => {
    const { game, ctx } = await play();
    gainXp(ctx, 'tp_cook', 123.5);
    meet(ctx, 'tp_dish', 'stew', 4);
    learn(ctx, 'tp_dish', 'soup', 'page');
    const save = game.saved();
    expect(save.slices?.progress).toEqual({ v: 1, d: { xp: { tp_cook: 123.5 }, entries: [{ d: 'tp_dish', id: 'soup', s: 2, n: 0, day: 0, by: 'page' }, { d: 'tp_dish', id: 'stew', s: 1, n: 4, day: 0 }] } });
    // a game of its own: nothing
    const fresh = await play();
    expect(progress.xp('tp_cook')).toBe(0);
    expect(progress.tally('tp_dish')).toEqual({ met: 0, known: 0 });
    expect(fresh.game.snapshot().slices).toBeUndefined();
    // the save taken up: all of it, and counted as a change
    const rev = progressRev();
    const again = await play(save);
    expect(progressRev()).toBeGreaterThan(rev);
    expect(progress.xp('tp_cook')).toBe(123.5);
    expect(progress.level('tp_cook')).toBeGreaterThan(1);
    expect(progress.knowledge('tp_dish', 'soup')).toBe(2);
    expect(progress.entry('tp_dish', 'stew')).toMatchObject({ state: 1, count: 4 });
    expect(again.game.saved().slices?.progress).toEqual(save.slices?.progress);
    expect(again.game.reports).toEqual([]);
  });

  it('a new game clears it', async () => {
    const { game, ctx } = await play();
    gainXp(ctx, 'tp_cook', 50);
    meet(ctx, 'tp_dish', 'stew');
    const rev = progressRev();
    game.newGame();
    expect(progress.xp('tp_cook')).toBe(0);
    expect(progress.tally('tp_dish').met).toBe(0);
    expect(progressRev()).toBeGreaterThan(rev);
    expect(game.snapshot().slices).toBeUndefined();
  });

  it('a slice that is rubbish is passed over, not thrown on', async () => {
    const { game } = await play({ hour: 9, slices: { progress: { v: 1, d: { xp: { tp_cook: 'much', other: -4 }, entries: [null, { d: 'tp_dish', id: 'pie', s: 7, n: -2 }, 3] } } } } as unknown as FakeSave);
    expect(game.reports).toEqual([]);
    expect(progress.xp('tp_cook')).toBe(0);
    expect(progress.entry('tp_dish', 'pie')).toMatchObject({ state: 1, count: 0 });
  });
});

describe('progress module: the developer', () => {
  it('sets a skill’s level, either way, and says the level on the bus', async () => {
    const { ctx, heard } = await play();
    expect(setSkillLevel(ctx, 'tp_cook', 10)).toBe(10);
    expect(progress.level('tp_cook')).toBe(10);
    expect(progress.xp('tp_cook')).toBe(xpForLevel(10));
    expect(progress.hasPerk('tp_cook_taste')).toBe(true);
    expect(setSkillLevel(ctx, 'tp_cook', 99)).toBe(20);
    expect(setSkillLevel(ctx, 'tp_cook', 1)).toBe(1);
    expect(progress.xp('tp_cook')).toBe(0);
    expect(setSkillLevel(ctx, 'tp_cook', 1)).toBe(1);
    expect(heard).toEqual(['level tp_cook 1 -> 10', 'level tp_cook 10 -> 20', 'level tp_cook 20 -> 1']);
  });

  it('the tab shows every skill and field, sets levels, learns and forgets everything of a field', async () => {
    const { game, ctx } = await play();
    meet(ctx, 'tp_dish', 'stew', 2, { quiet: true });
    const tab = game.openTab('progress')!;
    expect(tab.made.filter((m) => m.startsWith('heading'))).toEqual(['heading: 技能', 'heading: 图鉴']);
    expect(tab.made.some((m) => m.startsWith('box: 试验厨艺 · 1 级'))).toBe(true);
    expect(tab.made.some((m) => m.startsWith('box: 试验菜：共 3 种 · 见过或认得 1 种 · 认得 0 种'))).toBe(true);
    const press = (label: string): void => {
      const b = tab.buttons.find((x) => x.label === label);
      if (!b) throw new Error(`no button ${label}`);
      b.click({} as HTMLButtonElement);
    };
    press('5 级');
    expect(progress.level('tp_cook')).toBe(5);
    expect(tab.message).toBe('试验厨艺现在 5 级。');
    press('+1 级');
    press('+1 级');
    press('−1 级');
    expect(progress.level('tp_cook')).toBe(6);
    press('试验菜：全部认得');
    expect(progress.tally('tp_dish')).toEqual({ met: 3, known: 3 });
    expect(tab.message).toBe('试验菜：新认得 3 种。');
    expect(progress.entry('tp_dish', 'stew')).toMatchObject({ state: 2, count: 2, by: 'told' });
    press('试验菜：全部忘掉');
    expect(progress.tally('tp_dish')).toEqual({ met: 0, known: 0 });
    expect(progress.level('tp_cook')).toBe(6);
    expect(forgetDomain('tp_dish')).toBe(0);
    press('1 级');
    expect(progress.level('tp_cook')).toBe(1);
    // the harness, for the browser scripts
    expect(game.systems.harness('progress', 'setLevel', 'tp_cook', 3)).toBe(3);
    expect(game.systems.harness('progress', 'level', 'tp_cook')).toBe(3);
    expect(game.systems.harness('progress', 'learnAll', 'tp_dish')).toBe(3);
    expect(game.systems.harness('progress', 'tally', 'tp_dish')).toEqual({ met: 3, known: 3 });
    expect(game.systems.harness('progress', 'knowledge', 'tp_dish', 'pie')).toBe(2);
    expect(game.reports).toEqual([]);
  });
});

describe('progress module: what it costs', () => {
  it('a frame allocates nothing and takes next to no time, with lines waiting or without', async () => {
    const { game, ctx } = await play();
    const frame = (): void => game.frame(1 / 60);
    expect(heapGrowth(frame)).toBeLessThan(ALLOCATES / 4);
    // (a line held back because one drives: the queue is looked at every frame)
    game.seated = seat(60);
    announce(ctx, 'waits', 1);
    expect(heapGrowth(frame)).toBeLessThan(ALLOCATES / 4);
    let best = Infinity;
    const N = 200_000;
    for (let round = 0; round < 5; round++) {
      const t0 = performance.now();
      for (let i = 0; i < N; i++) frame();
      best = Math.min(best, (performance.now() - t0) / N);
    }
    console.log(`[v3 progress] a frame of the kernel with the progress module: ${(best * 1e6).toFixed(0)} ns`);
    // (the system's budget is 0.02 ms: the whole frame of the stand-in is far inside it)
    expect(best).toBeLessThan(0.02);
    game.seated = null;
  });
});
