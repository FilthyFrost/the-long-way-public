// Milestone V5, its second round (docs/V3/nodes/V5-landforms.md): a pillar mountain has its pillars and a karst its
// towers standing off the road on dry land, a coast of sea stacks its stacks in the sea, a waterfall gorge its falls down
// its steep land beside the road; all of them the same whoever asks, and the spires solids that keep a car out of them.
import { describe, expect, it } from 'vitest';
import { SpireSolids, hasSpires, spiresOf } from '../../src/core/world/earth/spires';
import { fallsOf, hasFalls } from '../../src/core/world/earth/waterfalls';
import type { Solid } from '../../src/core/world/solids';
import { SpineSample } from '../../src/core/world/spine';
import { TerrainPoint, World } from '../../src/core/world/terrain';

/** the first place of a world of version 5 within its first sixty whose landform is one of `ids`, laid */
function first(w: World, ids: readonly string[]): number {
  const j = w.earth!;
  for (let k = 1; k < 60; k++) {
    while (j.pieces.length <= k + 1) j.chapter(j.chapters.length);
    const p = j.pieces[k];
    if (p.kind === 'scene' && p.scene && ids.includes(p.scene.place.look.landform.id)) return k;
  }
  return -1;
}

describe('the spires and the falls (world version 5)', () => {
  const tp = new TerrainPoint();
  const st = new SpineSample();

  it('a pillar mountain has its pillars off the road on dry land, the same whoever asks, and solid', () => {
    // (the first of some worlds that has one in its first sixty places: which world that is moves with the director)
    let w = new World(7, { worldVersion: 5 });
    let k = first(w, ['pillar_mountain']);
    for (const seed of [3, 1, 2, 5, 9, 11, 13, 17, 21, 4, 6, 8, 10, 12]) {
      if (k > 0) break;
      w = new World(seed, { worldVersion: 5 });
      k = first(w, ['pillar_mountain']);
    }
    expect(k).toBeGreaterThan(0);
    const p = w.earth!.pieces[k];
    expect(hasSpires(p)).toBe(true);
    const list = spiresOf(w, p, tp, st);
    expect(list.length).toBeGreaterThan(12);
    for (const sp of list) {
      expect(sp.kind).toBe('pillar');
      expect(sp.h).toBeGreaterThan(40);
      expect(sp.h / sp.r).toBeGreaterThan(2);
      w.shape(sp.x, sp.z, tp);
      expect(Math.abs(tp.d)).toBeGreaterThan(sp.r + 30);
      expect(tp.wl).toBeLessThan(tp.bed);
      expect(sp.foot).toBeLessThanOrEqual(sp.level + 1e-6);
    }
    // no two stand in each other
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) expect(Math.hypot(list[i].x - list[j].x, list[i].z - list[j].z)).toBeGreaterThan(list[i].r + list[j].r);
    // the same whoever asks
    const again = spiresOf(new World(w.seed, { worldVersion: 5 }), p, new TerrainPoint(), new SpineSample());
    expect(again.map((s) => [s.x, s.z, s.h])).toEqual(list.map((s) => [s.x, s.z, s.h]));
    // a solid post where each stands
    const solids = new SpireSolids(w, new TerrainPoint(), new SpineSample());
    const out: Solid[] = [];
    solids.solidsNear(list[0].x, list[0].z, 5, out);
    expect(out.some((s) => s.tag === 'spire:pillar' && Math.hypot(s.x - list[0].x, s.z - list[0].z) < 1e-6)).toBe(true);
  });

  it('a coast of sea stacks has its stacks in the sea', () => {
    const w = new World(1, { worldVersion: 5 });
    const k = first(w, ['sea_stacks']);
    expect(k).toBeGreaterThan(0);
    const list = spiresOf(w, w.earth!.pieces[k], tp, st);
    expect(list.length).toBeGreaterThan(5);
    for (const sp of list) {
      // (its stacks, and now and then its arch: V9)
      expect(['stack', 'arch']).toContain(sp.kind);
      w.shape(sp.x, sp.z, tp);
      expect(tp.wkind).toBe(3);
      expect(sp.level).toBeGreaterThan(sp.foot);
    }
  });

  it('a waterfall gorge has its falls down its steep land beside the road', () => {
    // (the first of some worlds whose gorge has its half dozen falls: which world that is moves with the director)
    let w = new World(3, { worldVersion: 5 });
    let k = first(w, ['waterfall_gorge']);
    for (const seed of [7, 1, 2, 5, 9, 11, 13, 17, 21]) {
      if (k > 0 && fallsOf(w, w.earth!.pieces[k], tp, st).length > 5) break;
      w = new World(seed, { worldVersion: 5 });
      k = first(w, ['waterfall_gorge']);
    }
    expect(k).toBeGreaterThan(0);
    const p = w.earth!.pieces[k];
    expect(hasFalls(p)).toBe(true);
    const falls = fallsOf(w, p, tp, st);
    expect(falls.length).toBeGreaterThan(5);
    for (const f of falls) {
      const n = f.path.length / 3;
      expect(n).toBeGreaterThan(3);
      // (it falls: its lip above its foot by its height, every step of the way down)
      expect(f.path[1] - f.path[(n - 1) * 3 + 1]).toBeCloseTo(f.h, 3);
      for (let i = 1; i < n; i++) expect(f.path[i * 3 + 1]).toBeLessThanOrEqual(f.path[i * 3 - 2] + 1e-6);
      expect(f.h).toBeGreaterThanOrEqual(28);
      expect(f.w).toBeGreaterThan(1);
      // (its foot off the road)
      w.shape(f.path[(n - 1) * 3], f.path[(n - 1) * 3 + 2], tp);
      expect(Math.abs(tp.d)).toBeGreaterThan(9);
    }
    const again = fallsOf(new World(w.seed, { worldVersion: 5 }), p, new TerrainPoint(), new SpineSample());
    expect(again.map((f) => f.path.slice(0, 3))).toEqual(falls.map((f) => f.path.slice(0, 3)));
  });
});
