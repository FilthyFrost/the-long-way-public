/**
 * What the forage system costs (src/game/modcar/v3/forage, node W3): its budget is 0.2 ms of a step, and
 * nothing in a step may be left on the heap. Measured in the stand-in game, in a forest with a hundred
 * bearing plants within the look-out's reach: standing (the list gone through three times a second), walking
 * (the field asked again every 6 m, its tiles asked for one at a time), the mark's question to the source
 * every frame, and the veil that every name on screen goes through.
 *
 * (Node on the development machine: none of this is a measurement on a GPU, and a step here has no drawing in it.)
 */
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { itemName, newItem } from '../../src/core/modcar/items';
import type { GarageDevice } from '../../src/game/modcar/garageStub';
import { forage } from '../../src/game/modcar/v3/forage/index';
import { PickedTable } from '../../src/game/modcar/v3/forage/picked';
import { setSkillLevel } from '../../src/game/modcar/v3/progress/api';
import { forageRig, forestSpot, WORLD } from './v3/forageRig';
import { ALLOCATES, HEAP_RUNS, heapGrowth } from './v3/heap';
import { SpineSample } from '../../src/core/world/spine';

describe('forage module: what a step costs', () => {
  it('standing among sixty or more points: far inside 0.2 ms, and nothing on the heap', async () => {
    const r = await forageRig({ at: forestSpot(WORLD, 41228, 220) });
    r.settle();
    const found = (forage.telemetry() as { found: number }).found;
    expect(found).toBeGreaterThan(60);
    const frame = (): void => r.game.frame(1 / 60);
    const bytes = heapGrowth(frame) / HEAP_RUNS;
    expect(heapGrowth(frame)).toBeLessThan(ALLOCATES / 4);
    let best = Infinity;
    const N = 60_000;
    for (let round = 0; round < 5; round++) {
      const t0 = performance.now();
      for (let i = 0; i < N; i++) frame();
      best = Math.min(best, (performance.now() - t0) / N);
    }
    console.log(`[v3 forage] a step standing among ${found} bearing plants (${r.shown().length} showing): ${(best * 1000).toFixed(2)} µs, ${bytes.toFixed(2)} bytes (both modules' hooks and the kernel's; the list is gone through three times a second)`);
    expect(best).toBeLessThan(0.05);
    expect(r.game.reports).toEqual([]);
  });

  it('walking through the wood: the field asked every 6 m, its tiles one at a time; the average far inside the budget', async () => {
    const r = await forageRig();
    r.settle();
    const w = r.player.walker;
    const p = new SpineSample();
    WORLD.spine.at(4000, p);
    // along the road, 40 m to its left, at the walker's own pace, there and back over 240 m
    const dx = Math.cos(p.phi) * (1.9 / 60);
    const dz = Math.sin(p.phi) * (1.9 / 60);
    const leg = Math.round(240 / (1.9 / 60));
    const at = new Int32Array(2);
    const walk = (): void => {
      const back = at[1] === 1;
      w.x += back ? -dx : dx;
      w.z += back ? -dz : dz;
      if (++at[0] >= leg) {
        at[0] = 0;
        at[1] = back ? 0 : 1;
      }
      r.game.frame(1 / 60);
    };
    // once there and back: every tile of the stretch is in the flora's cache from here on, and the slowest steps are seen
    let worst = 0;
    const slow: number[] = [];
    for (let i = 0; i < leg * 2; i++) {
      const t0 = performance.now();
      walk();
      const ms = performance.now() - t0;
      if (ms > worst) worst = ms;
      if (ms > 0.2) slow.push(ms);
    }
    const bytes = heapGrowth(walk) / HEAP_RUNS;
    let best = Infinity;
    const N = leg * 2;
    for (let round = 0; round < 3; round++) {
      const t0 = performance.now();
      for (let i = 0; i < N; i++) walk();
      best = Math.min(best, (performance.now() - t0) / N);
    }
    // The same walk with the two questions the system asks of the core answered by stand-ins that allocate
    // nothing: the field's, and the land's about the water over a plant of the water (half a kilobyte a call;
    // the system keeps the answer). What is left is the system's own code. (The field's question fills an
    // object a point with seven fractions. Asked in a tight loop the engine compiles it to leave next to
    // nothing, 0.2 KB a question; asked as seldom as the game asks it, once per 6 m walked, it leaves about
    // 80 bytes a point, 8 KB for a hundred points — measured here, and it is why the field is not asked
    // three times a second.)
    const inner = forage as unknown as { field: { near(x: number, z: number, r: number, out: unknown[]): number }; nFound: number };
    const field = inner.field;
    const shape = WORLD.shape;
    inner.field = { near: () => inner.nFound };
    WORLD.shape = (_x, _z, o) => void (o.wl = -Infinity);
    const own = heapGrowth(walk) / HEAP_RUNS;
    inner.field = field;
    WORLD.shape = shape;
    console.log(
      `[v3 forage] a step walking at 1.9 m/s: ${(best * 1000).toFixed(2)} µs on average; ${bytes.toFixed(1)} bytes a step, of which the system's own code ${own.toFixed(2)} ` +
        `(the rest is the core's field filling its points, once per 6 m walked: about ${Math.round((bytes - own) * (6 / (1.9 / 60)))} bytes a question). ` +
        `The first time through, ${slow.length} of ${leg * 2} steps took more than 0.2 ms, the slowest ${worst.toFixed(2)} ms: a tile of plants worked out for the first time.`,
    );
    // the budget is for the smoothed time of a step: a tile worked out for the first time is one step in hundreds
    expect(best).toBeLessThan(0.1);
    expect(slow.length).toBeLessThan(leg * 2 * 0.02);
    // the system's own code leaves nothing; with the core's two questions it stays small
    expect(own * HEAP_RUNS).toBeLessThan(ALLOCATES / 4);
    expect(bytes).toBeLessThan(120);
    expect(r.game.reports).toEqual([]);
  });

  it('the mark’s question every frame, with points within reach, allocates nothing', async () => {
    const r = await forageRig();
    r.settle();
    const pt = r.shown().find((p) => p.layer === 'ground')!;
    r.player.walker.place(pt.x - 0.8, pt.z, 0);
    r.frames(30);
    const out: GarageDevice[] = [];
    const eye = { x: r.player.walker.x, y: 1.6, z: r.player.walker.z };
    const ask = (): void => {
      while (out.length > 0) out.pop();
      r.game.interact.near(eye, 3.1, out);
    };
    ask();
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].id).toMatch(/^forage:\d+$/);
    const first = out[0];
    expect(heapGrowth(ask)).toBeLessThan(ALLOCATES / 4);
    // the same device for the same point from one frame to the next, with its words and its card kept
    expect(out[0]).toBe(first);
    const words = (): void => {
      void out[0].word.zh;
      void out[0].card;
    };
    expect(heapGrowth(words)).toBeLessThan(ALLOCATES / 4);
    expect(out[0].card).toBe(out[0].card);
  });

  it('the veil answers every name on screen without allocating; the table of picked points likewise', async () => {
    const r = await forageRig();
    const unknown = newItem('fly_agaric');
    const chips = newItem('food_chips');
    const names = (): void => {
      void itemName(unknown);
      void itemName(chips);
    };
    expect(itemName(unknown)).toBe('不认识的蘑菇');
    expect(heapGrowth(names)).toBeLessThan(ALLOCATES / 4);
    setSkillLevel(r.ctx, 'forage', 3);
    expect(heapGrowth(names)).toBeLessThan(ALLOCATES / 4);
    // keys as the field makes them: far too large for a small integer
    const table = new PickedTable();
    const keys = new Float64Array(500);
    for (let i = 0; i < keys.length; i++) {
      keys[i] = (2 * 2097152 + 1048576 + i * 7) * 2097152 + 1048576 - i * 13;
      table.set(keys[i], 3 + (i % 5));
    }
    expect(table.size).toBe(500);
    const sum = new Float64Array(1);
    const ask = (): void => {
      for (let i = 0; i < keys.length; i++) sum[0] += table.get(keys[i]) + table.get(keys[i] + 1);
    };
    ask();
    expect(sum[0]).toBe(keys.reduce((a, _k, i) => a + 3 + (i % 5) - 1, 0));
    expect(heapGrowth(ask) / 500).toBeLessThan(ALLOCATES / 4 / 500);
    expect(table.dropDue(4)).toBe(200);
    expect(table.size).toBe(300);
    expect(table.get(keys[0])).toBe(-1);
    expect(table.get(keys[2])).toBe(5);
    const flat = table.flat();
    const again = new PickedTable();
    again.load(flat);
    expect(again.flat()).toEqual(flat);
  });
});
