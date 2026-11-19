/**
 * The robot cook (src/game/modcar/v3/cooking/robot.ts, node C1) at the workshop's kitchen corner in the
 * stand-in game: it cooks each of a dozen recipes of every way of cooking through the panel's own keys (the
 * modal's), with hands of three skills. A heated dish takes one to three minutes; a salad or a drink may be
 * quicker; the stars rise with the skill of the hands. And what a step of the cooking system costs, with a
 * pot on the flame and a buff writing the body's mods: within its 0.2 ms, nothing left on the heap.
 *
 * (Node on the development machine: none of this is a measurement on a GPU, and a step here has no drawing in it.)
 */
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import type { GarageDevice } from '../../src/game/modcar/garageStub';
import { KITCHEN } from '../../src/game/modcar/v3/cooking/content';
import type { RobotHands } from '../../src/game/modcar/v3/cooking/robot';
import { cookRig } from './v3/cookRig';
import { ALLOCATES, HEAP_RUNS, heapGrowth } from './v3/heap';

/** recipes of every way of cooking, with what to hand the cook for each */
const DISHES: readonly [string, string[], boolean][] = [
  ['mushroom_soup', ['porcini', 'porcini', 'chanterelle'], true],
  ['mushroom_potato_stew', ['porcini', 'porcini', 'potato'], true],
  ['scallion_mushrooms', ['porcini', 'porcini', 'wild_scallion'], true],
  ['fried_lotus', ['lotus_root', 'lotus_root'], true],
  ['roast_potato', ['potato', 'potato'], true],
  ['steamed_yam', ['wild_yam', 'wild_yam'], true],
  ['wild_rice', ['wild_rice', 'wild_rice'], true],
  ['baked_apple', ['wild_apple', 'wild_apple'], true],
  ['pepper_rabbit', ['meat_rabbit', 'sichuan_pepper'], true],
  ['nettle_soup', ['nettle', 'nettle', 'potato'], true],
  ['purslane_salad', ['purslane', 'purslane'], false],
  ['chamomile_tea', ['chamomile', 'chamomile'], false],
];

const HANDS: Readonly<Record<string, RobotHands>> = {
  steady: { reaction: 0.3, error: 0.05 },
  fair: { reaction: 0.7, error: 0.35 },
  clumsy: { reaction: 1.3, error: 0.8 },
};

async function cookOne(recipe: string, items: readonly string[], hands: RobotHands, seed: number) {
  const r = await cookRig({ start: 'garage', at: { x: KITCHEN.x + 1.2, z: KITCHEN.z } });
  // (ingredients of three stars: what a forager with a knife brings home)
  for (const id of new Set(items)) r.give(id, items.filter((x) => x === id).length + 1, 3);
  expect(r.cooking.startRobot({ recipe, seed }, hands), recipe).toBe(true);
  for (let i = 0; i < 60 * 400; i++) {
    r.frames(1, 1 / 30);
    if (r.cooking.harness.robotReport()?.done) break;
  }
  const rep = r.cooking.harness.robotReport()!;
  expect(rep.why, recipe).toBe('');
  expect(rep.done, recipe).toBe(true);
  expect(rep.dish?.recipe, recipe).toBe(recipe);
  expect(r.held(`dish_${rep.dish ? '' : 'x'}`.slice(0, 5)) === null).toBe(true);
  return rep;
}

describe('the robot cook', () => {
  it('cooks a dozen recipes through the panel\'s keys: a heated dish in one to three minutes, stars rising with the hands', async () => {
    const stars: Record<string, number[]> = { steady: [], fair: [], clumsy: [] };
    const lines: string[] = [];
    for (const [recipe, items, heated] of DISHES) {
      const row: string[] = [];
      for (const [name, hands] of Object.entries(HANDS)) {
        const rep = await cookOne(recipe, items, hands, recipe.length);
        stars[name].push(rep.dish!.stars);
        row.push(`${name} ${rep.seconds.toFixed(0)} s ${rep.dish!.stars}*`);
        if (heated) {
          expect(rep.seconds, `${recipe} (${name})`).toBeGreaterThanOrEqual(60);
          expect(rep.seconds, `${recipe} (${name})`).toBeLessThanOrEqual(180);
        } else expect(rep.seconds, `${recipe} (${name})`).toBeLessThanOrEqual(120);
      }
      lines.push(`${recipe.padEnd(22)} ${row.join(' · ')}`);
    }
    const mean = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length;
    console.log(`[v3 cooking] the robot cook at the kitchen corner (game seconds, stars; ingredients of three stars):\n${lines.join('\n')}\nmean stars: steady ${mean(stars.steady).toFixed(2)}, fair ${mean(stars.fair).toFixed(2)}, clumsy ${mean(stars.clumsy).toFixed(2)}`);
    expect(mean(stars.steady)).toBeGreaterThanOrEqual(mean(stars.fair));
    expect(mean(stars.fair)).toBeGreaterThanOrEqual(mean(stars.clumsy));
    expect(mean(stars.steady)).toBeGreaterThan(mean(stars.clumsy) + 0.5);
  }, 120_000);
});

describe('cooking: what a step costs', () => {
  it('a stew on the flame, a buff on the body, the mark asking: far inside 0.2 ms, nothing on the heap', async () => {
    const r = await cookRig({ start: 'garage', at: { x: KITCHEN.x + 1.2, z: KITCHEN.z } });
    r.give('porcini', 3);
    r.give('potato', 2);
    r.cooking.harness.grant('hearty', 1e6);
    r.cooking.harness.grant('warm', 1e6);
    r.pressAt(KITCHEN.x, KITCHEN.hobY, KITCHEN.z);
    for (let i = 0; i < 12 && r.panel().method !== 'stew'; i++) r.key('KeyD');
    r.key('KeyE');
    r.key('KeyE');
    r.key('KeyS');
    r.key('KeyE');
    r.key('Space');
    for (let i = 0; i < 6; i++) {
      r.key('Space');
      r.frames(30);
    }
    r.key('Escape');
    expect(r.panel().open).toBeNull();
    const st = r.cooking.harness.stations().find((s) => s.kind === 'kitchen');
    expect(st?.pot?.lit).toBe(true);
    const near: GarageDevice[] = [];
    const eye = { x: KITCHEN.x + 1.1, z: KITCHEN.z };
    const frame = (): void => {
      r.game.frame(1 / 60);
      while (near.length > 0) near.pop();
      r.game.interact.near(eye, 3.1, near);
    };
    const bytes = heapGrowth(frame) / HEAP_RUNS;
    expect(heapGrowth(frame)).toBeLessThan(ALLOCATES / 4);
    let best = Infinity;
    const N = 40_000;
    for (let round = 0; round < 4; round++) {
      const t0 = performance.now();
      for (let i = 0; i < N; i++) frame();
      best = Math.min(best, (performance.now() - t0) / N);
    }
    console.log(`[v3 cooking] a step with a stew on the flame, two buffs and the mark asking: ${(best * 1000).toFixed(2)} µs, ${bytes.toFixed(2)} bytes (both modules' hooks and the kernel's)`);
    expect(best).toBeLessThan(0.05);
    expect(r.game.reports).toEqual([]);
  }, 120_000);
});
