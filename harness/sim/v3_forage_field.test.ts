/**
 * The forage points of a world (src/core/v3/forage/field.ts): they are the bearing plants of the flora field,
 * each with a key of its own that names its cell again, the same whatever was asked first.
 */
import { describe, expect, it } from 'vitest';
import { ForageField, ForagePoint, keyCell, pointKey } from '../../src/core/v3/forage/field';
import { FORAGE_KINDS } from '../../src/core/v3/forage/kinds';
import { LAYER_CELL, type FloraLayer } from '../../src/core/world/flora';
import { bearsAt, PLANTS } from '../../src/core/world/plants';
import { SpineSample } from '../../src/core/world/spine';
import { World } from '../../src/core/world/terrain';

function world(seed: number, startBiome: string): World {
  return new World(seed, { worldVersion: 2, startBiome, chapterScale: 6 });
}

describe('a key', () => {
  it('names its layer and cell again, for cells far out and behind the origin', () => {
    const out = { layer: 0, cx: 0, cz: 0 };
    for (const layer of [0, 1, 2] as FloraLayer[]) {
      for (const [cx, cz] of [[0, 0], [1, -1], [-5, 7], [250000, -3000], [-1000, 999999]]) {
        const k = pointKey(layer, cx, cz);
        expect(Number.isSafeInteger(k)).toBe(true);
        keyCell(k, out);
        expect(out).toEqual({ layer, cx, cz });
      }
    }
    expect(pointKey(0, 3, 4)).not.toBe(pointKey(1, 3, 4));
    expect(pointKey(2, 3, 4)).not.toBe(pointKey(2, 4, 3));
  });
});

describe('the forage points of a world', () => {
  it('are bearing plants near the asked place, each with its own key, the same whatever was asked first', () => {
    const a = world(9, 'forest');
    const b = world(9, 'forest');
    const fa = new ForageField(a.flora!);
    const fb = new ForageField(b.flora!);
    const p = new SpineSample();
    const outA: ForagePoint[] = [];
    const outB: ForagePoint[] = [];
    // (the other world is asked somewhere else first)
    fb.near(40000, 300, 60, outB);
    let total = 0;
    const kinds = new Set<string>();
    for (let s = 3000; s < 9000; s += 400) {
      a.spine.at(s, p);
      const x = p.x - Math.sin(p.phi) * 40;
      const z = p.z + Math.cos(p.phi) * 40;
      const n = fa.near(x, z, 60, outA);
      const m = fb.near(x, z, 60, outB);
      expect(m).toBe(n);
      const keys = new Set<number>();
      for (let i = 0; i < n; i++) {
        const q = outA[i];
        expect({ ...outB[i] }).toEqual({ ...q });
        expect(Math.hypot(q.x - x, q.z - z)).toBeLessThanOrEqual(60 + 1e-9);
        expect(bearsAt(PLANTS[q.plant], q.vary)).toBe(FORAGE_KINDS[q.kind].id);
        keys.add(q.key);
        kinds.add(FORAGE_KINDS[q.kind].id);
        // the key is the cell the plant stands in
        const cell = { layer: 0, cx: 0, cz: 0 };
        keyCell(q.key, cell);
        const C = LAYER_CELL[cell.layer];
        expect(Math.floor(q.x / C)).toBe(cell.cx);
        expect(Math.floor(q.z / C)).toBe(cell.cz);
      }
      expect(keys.size).toBe(n);
      total += n;
    }
    // a forest: things to pick at every stop, of several kinds
    expect(total).toBeGreaterThan(60);
    expect(kinds.size).toBeGreaterThanOrEqual(6);
  });

  it('about half of an after-rain kind are of the hidden half, and no other kind has any', () => {
    const w = world(5, 'forest');
    const f = new ForageField(w.flora!);
    const out: ForagePoint[] = [];
    const p = new SpineSample();
    let rain = 0;
    let hidden = 0;
    for (let s = 2000; s < 30000; s += 300) {
      w.spine.at(s, p);
      const n = f.near(p.x, p.z + 60, 90, out);
      for (let i = 0; i < n; i++) {
        const k = FORAGE_KINDS[out[i].kind];
        if (k.when?.afterRain) {
          rain++;
          if (out[i].hidden) hidden++;
        } else expect(out[i].hidden).toBe(false);
      }
    }
    expect(rain).toBeGreaterThan(40);
    expect(hidden / rain).toBeGreaterThan(0.3);
    expect(hidden / rain).toBeLessThan(0.7);
  });

  it('asks nothing new of the heap once its tiles are there', () => {
    const w = world(3, 'plains');
    const f = new ForageField(w.flora!);
    const out: ForagePoint[] = [];
    f.near(5000, 80, 70, out);
    const before = out.length;
    for (let i = 0; i < 50; i++) f.near(5000 + (i % 5), 80, 70, out);
    expect(out.length).toBe(before);
  });
});
