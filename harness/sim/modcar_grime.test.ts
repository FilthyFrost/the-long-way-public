/**
 * Cleaning (docs/MODCAR.md §15): the tools' passes (src/core/modcar/tools.ts CLEANERS: what one pass takes off,
 * how wide, how long a tool lasts), a worn-out tool, the units a body and a part split into (grime.ts unitAt,
 * as the shaders have them), and the ray against a part's triangles that aims the tool (render/triGrid.ts),
 * checked against three's own raycaster.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CLEANERS, cleanerOf, newTool, toolUse, wearCleaner } from '../../src/core/modcar/tools';
import { stockBuild } from '../../src/core/modcar/build';
import { BODY_UNIT_NAMES, unitAt, unitName } from '../../src/game/modcar/grime';
import { TriGrid } from '../../src/game/render/triGrid';

/** how many passes of a tool take an amount of a layer off (to under 0.03) */
const passes = (amount: number, take: number): number => {
  let n = 0;
  for (let a = amount; a > 0.03; a -= take) n++;
  return n;
};

describe('ModCar cleaning', () => {
  it('the sponge takes the dust in one pass and wets it, the crust hardly; the scrapers the crust in two or three; the brush the rust in three', () => {
    expect(passes(0.8, CLEANERS.sponge.take[0])).toBe(1);
    expect(CLEANERS.sponge.wet).toBe(1);
    expect(passes(0.6, CLEANERS.sponge.take[1])).toBeGreaterThan(8);
    // a barn find's crust (0.62): two passes of the plastic scraper (a thicker one, 0.85: three), of the brass one two
    expect(passes(0.62, CLEANERS.scraper_1.take[1])).toBe(2);
    expect(passes(0.85, CLEANERS.scraper_1.take[1])).toBe(3);
    expect(passes(0.62, CLEANERS.scraper_3.take[1])).toBe(2);
    expect(passes(0.8, CLEANERS.brush.take[2])).toBe(3);
    // (the scrapers hardly touch rust: that is the brush's)
    expect(passes(0.6, CLEANERS.scraper_2.take[2])).toBeGreaterThan(10);
  });

  it('the scrapers are 10, 22 and 25 cm wide (Arctic Drive), the wider the longer they last', () => {
    expect(cleanerOf(newTool('scraper', { tier: 1 }))!.width).toBeCloseTo(0.1);
    expect(cleanerOf(newTool('scraper', { tier: 2 }))!.width).toBeCloseTo(0.22);
    expect(cleanerOf(newTool('scraper', { tier: 3 }))!.width).toBeCloseTo(0.25);
    expect(CLEANERS.scraper_1.lasts).toBeLessThan(CLEANERS.scraper_2.lasts);
    expect(CLEANERS.scraper_2.lasts).toBeLessThan(CLEANERS.scraper_3.lasts);
    expect(cleanerOf(newTool('jerrycan'))).toBe(null);
  });

  it('a tool wears by the area it went over, and worn out it does not work (two cars with the plastic scraper)', () => {
    const t = newTool('scraper', { tier: 1 });
    expect(t.life).toBe(1);
    // a car's outside is about 12 m², its crust three passes: 36 m² of passes a car
    wearCleaner(t, 36);
    expect(t.life!).toBeGreaterThan(0.3);
    wearCleaner(t, 30);
    expect(t.life).toBe(0);
    const use = toolUse(t, stockBuild('sedan'));
    expect(use.can).toBe(false);
    expect(use.why?.zh).toContain('用坏了');
    // (a sponge lasts a car's dust, about)
    const s = newTool('sponge');
    wearCleaner(s, 12);
    expect(s.life!).toBeGreaterThan(0.4);
  });

  it('a body splits into its front, back, sides, top and windows; a part into its paint and its glass', () => {
    expect(unitAt(1, { x: 1, y: 0.2, z: 0 }, false)).toBe(0);
    expect(unitAt(1, { x: -1, y: 0.1, z: 0 }, false)).toBe(1);
    expect(unitAt(1, { x: 0.1, y: 0.2, z: -1 }, false)).toBe(2);
    expect(unitAt(1, { x: 0, y: 0.3, z: 1 }, false)).toBe(3);
    expect(unitAt(1, { x: 0.2, y: 0.9, z: 0.1 }, false)).toBe(4);
    expect(unitAt(1, { x: 0, y: -1, z: 0 }, false)).toBe(9);
    // a raked windscreen faces up as much as forward: still the windscreen
    expect(unitAt(1, { x: 0.45, y: 0.89, z: 0 }, true)).toBe(5);
    expect(unitAt(1, { x: -0.5, y: 0.86, z: 0 }, true)).toBe(6);
    expect(unitAt(1, { x: 0.05, y: 0.2, z: -0.98 }, true)).toBe(7);
    expect(unitAt(0, { x: 0, y: 0, z: -1 }, true)).toBe(1);
    expect(unitAt(0, { x: 0, y: 0, z: -1 }, false)).toBe(0);
    expect(BODY_UNIT_NAMES[5]).toBe('前挡风玻璃');
    expect(unitName(0, 1, '左前车门')).toBe('左前车门车窗');
    expect(unitName(1, 2, '方糖')).toBe('左侧');
  });

  it('the ray against the triangles meets the same point as three’s raycaster does', () => {
    const g = new THREE.TorusKnotGeometry(0.6, 0.18, 160, 24);
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const grid = new TriGrid(g);
    const rc = new THREE.Raycaster();
    let seed = 7;
    const rnd = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    let hits = 0;
    for (let i = 0; i < 300; i++) {
      const o = new THREE.Vector3(rnd() * 4 - 2, rnd() * 4 - 2, rnd() * 4 - 2).normalize().multiplyScalar(2.5);
      const d = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.8).sub(o).normalize();
      rc.set(o, d);
      const want = rc.intersectObject(mesh)[0];
      const got = grid.cast(o, d, 10);
      if (!want) {
        expect(got).toBe(null);
        continue;
      }
      hits++;
      expect(got).not.toBe(null);
      expect(got!.t).toBeCloseTo(want.distance, 4);
    }
    expect(hits).toBeGreaterThan(100);
  });
});
