// The plant toolkit (docs/V3/nodes/P2-flora.md): every kind within its budget at both levels, whatever its seed;
// the same seed the same plant; and the budget the same as the one the performance gate holds the world to.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FLORA, FLORA_BUDGET, growFlora } from '../../src/game/scene/flora/catalog';

const SEEDS = [1, 7, 11, 23, 37, 51, 63, 77, 91, 105, 333, 9001];

describe('plant toolkit', () => {
  it('holds the budget docs/V3/perf-budget.json sets', () => {
    const budget = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../docs/V3/perf-budget.json'), 'utf8')).each;
    for (const [kind, levels] of Object.entries(FLORA_BUDGET)) {
      expect(budget[kind], kind).toBeDefined();
      expect(levels[0], kind).toBe(budget[kind][0]);
      if (budget[kind].length > 2) expect(levels[1], kind).toBe(budget[kind][1]);
    }
  });

  for (const kind of FLORA) {
    it(`${kind.id}: within ${kind.budget}'s budget near and in the middle distance, and grown the same from the same seed`, () => {
      for (const seed of SEEDS) {
        for (const level of [0, 1] as const) {
          const d = growFlora(kind, seed, level);
          expect(d.triangles, `${kind.id} seed ${seed} level ${level}`).toBeLessThanOrEqual(FLORA_BUDGET[kind.budget][level]);
          expect(d.triangles).toBeGreaterThan(0);
          expect(d.height).toBeGreaterThan(0.1);
          const pos = d.geometry.getAttribute('position').array as Float32Array;
          for (let i = 0; i < pos.length; i++) expect(Number.isFinite(pos[i])).toBe(true);
          if (seed === 7) {
            const again = growFlora(kind, seed, level);
            expect(Array.from(again.geometry.getAttribute('position').array as Float32Array)).toEqual(Array.from(pos));
            again.geometry.dispose();
          }
          d.geometry.dispose();
        }
      }
    });
  }

  it('grows a tree at its nearest level in a few milliseconds (so the nearest trees can each be their own)', () => {
    const t0 = performance.now();
    let n = 0;
    for (const kind of FLORA.filter((k) => k.family === 'tree')) {
      for (const seed of [3, 5]) {
        growFlora(kind, seed, 0).geometry.dispose();
        n++;
      }
    }
    expect((performance.now() - t0) / n).toBeLessThan(15);
  });
});
