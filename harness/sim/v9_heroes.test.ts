// V9 (docs/V3/nodes/V9-heroes.md): a stratovolcano's and a horn's hero peak stands far off ahead of its place, over its
// ranges; a glacier place's tongues of ice come down its land toward the road; a coast of sea stacks now and then has
// its arch in the sea, solid at its legs — all of it the same whoever asks.
import { describe, expect, it } from 'vitest';
import { heroPeakOf } from '../../src/core/world/earth/heroPeaks';
import { glaciersOf } from '../../src/core/world/earth/glaciers';
import { SpireSolids, spiresOf } from '../../src/core/world/earth/spires';
import type { Solid } from '../../src/core/world/solids';
import { SpineSample } from '../../src/core/world/spine';
import { TerrainPoint, World } from '../../src/core/world/terrain';

function first(w: World, ids: readonly string[], from = 1, to = 80): number {
  const j = w.earth!;
  for (let k = from; k < to; k++) {
    while (j.pieces.length <= k + 1) j.chapter(j.chapters.length);
    const p = j.pieces[k];
    if (p.kind === 'scene' && p.scene && ids.includes(p.scene.place.look.landform.id)) return k;
  }
  return -1;
}

describe('the heroes of V9 (world version 5)', () => {
  const tp = new TerrainPoint();
  const st = new SpineSample();

  it('a stratovolcano has its volcano far off ahead, over its ranges, snow on its top', () => {
    const w = new World(3, { worldVersion: 5 });
    const k = first(w, ['stratovolcano']);
    expect(k).toBeGreaterThan(0);
    const p = w.earth!.pieces[k];
    const pk = heroPeakOf(w, p, tp, st)!;
    expect(pk.kind).toBe('volcano');
    w.spine.at(p.end, st);
    expect(Math.hypot(pk.x - st.x, pk.z - st.z)).toBeGreaterThan(9000);
    const sc = p.scene!.place;
    expect(pk.top - sc.macro.base).toBeGreaterThan(Math.max(2000, sc.macro.relief * 1.4));
    expect(pk.foot).toBeLessThan(sc.macro.base);
    expect(pk.snow).toBeGreaterThanOrEqual(0.2);
    // the same whoever asks
    const again = heroPeakOf(new World(3, { worldVersion: 5 }), p, new TerrainPoint(), new SpineSample())!;
    expect([again.x, again.z, again.top]).toEqual([pk.x, pk.z, pk.top]);
  });

  it('a glacier place has its tongues of ice coming down toward the road', () => {
    const w = new World(19, { worldVersion: 5 });
    const k = first(w, ['glacier']);
    expect(k).toBeGreaterThan(0);
    const gs = glaciersOf(w, w.earth!.pieces[k], tp, st);
    expect(gs.length).toBeGreaterThan(0);
    for (const g of gs) {
      const n = g.path.length / 3;
      expect(n).toBeGreaterThan(20);
      // (its source above its snout, a long way)
      expect(g.path[1] - g.path[(n - 1) * 3 + 1]).toBeGreaterThan(100);
      expect(g.w0).toBeGreaterThan(g.w1);
    }
  });

  it('a coast of sea stacks may have its arch, in the sea, solid at its legs', () => {
    let found = 0;
    for (const seed of [1, 3, 7, 11, 19, 23, 29]) {
      const w = new World(seed, { worldVersion: 5 });
      const k = first(w, ['sea_stacks'], 1, 60);
      if (k < 0) continue;
      const arch = spiresOf(w, w.earth!.pieces[k], tp, st).find((s) => s.kind === 'arch');
      if (!arch) continue;
      found++;
      w.shape(arch.x, arch.z, tp);
      expect(tp.wkind).toBe(3);
      expect(arch.span).toBeGreaterThan(30);
      const out: Solid[] = [];
      new SpireSolids(w, new TerrainPoint(), new SpineSample()).solidsNear(arch.x + Math.cos(arch.yaw) * arch.span! * 0.5, arch.z + Math.sin(arch.yaw) * arch.span! * 0.5, 2, out);
      expect(out.some((s) => s.tag === 'spire:arch')).toBe(true);
    }
    expect(found).toBeGreaterThan(0);
  });
});
