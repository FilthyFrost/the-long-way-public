/**
 * Cleaning (docs/MODCAR.md §15): the tools' passes (src/core/modcar/tools.ts CLEANERS: what one pass takes off,
 * how wide, how long a tool lasts), a worn-out tool, the units a body and a part split into (grime.ts unitAt,
 * as the shaders have them), and the ray against a part's triangles that aims the tool (render/triGrid.ts),
 * checked against three's own raycaster.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CLEANERS, cleanerOf, newTool, retireTool, toolUse, wearCleaner } from '../../src/core/modcar/tools';
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
  it('the plastic scraper does the grinder\'s work slowly: three or four passes for the dust, a barn find\'s crust, rust, paint that has set (docs/V3/plan/hands.md 定案 3)', () => {
    expect(passes(0.8, CLEANERS.scraper_1.take[0])).toBe(3);
    expect(passes(0.62, CLEANERS.scraper_1.take[1])).toBe(3);
    expect(passes(0.85, CLEANERS.scraper_1.take[1])).toBe(4);
    expect(passes(0.8, CLEANERS.scraper_1.take[2])).toBe(4);
    expect(passes(1, CLEANERS.scraper_1.coat!)).toBe(4);
  });

  it('one scraper, 10 cm wide; the retired tools — the sponge, the brush, the metal and golden scrapers — are plastic scrapers now', () => {
    expect(cleanerOf(newTool('scraper', { tier: 1 }))!.width).toBeCloseTo(0.1);
    expect(cleanerOf(newTool('jerrycan'))).toBe(null);
    for (const t of [newTool('sponge'), newTool('brush'), newTool('scraper', { tier: 2 }), newTool('scraper', { tier: 3 })]) {
      expect(retireTool(t)).toBe(true);
      expect([t.kind, t.tier, t.life]).toEqual(['scraper', 1, 1]);
      expect(cleanerOf(t)).toBe(CLEANERS.scraper_1);
    }
    expect(retireTool(newTool('scraper', { tier: 1 }))).toBe(false);
  });

  it('a tool wears by the area it went over, and worn out it does not work (two cars with the plastic scraper)', () => {
    const t = newTool('scraper', { tier: 1 });
    expect(t.life).toBe(1);
    // a car's outside is about 12 m², its dirt three passes: 36 m² of passes a car — about one car a scraper
    wearCleaner(t, 30);
    expect(t.life!).toBeGreaterThan(0.2);
    wearCleaner(t, 12);
    expect(t.life).toBe(0);
    const use = toolUse(t, stockBuild('sedan'));
    expect(use.can).toBe(false);
    expect(use.why?.zh).toContain('用坏了');
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
