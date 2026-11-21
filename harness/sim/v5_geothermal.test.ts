// Milestone V5 (docs/V3/nodes/V5-landforms.md): a geothermal place of the emergent Earth has its hot springs,
// fumaroles, mud pots and a geyser by the road, the same whoever asks, off the road and its places, and the woods,
// the ground's plants and stones and the meadow keep clear of them.
import { describe, expect, it } from 'vitest';
import { FUMAROLE, GEYSER, MUD, POOL, inVentClearing, isGeothermal, ventsNear, ventsOf } from '../../src/core/world/earth/geothermal';
import { LAYER_TREE } from '../../src/core/world/flora';
import { ECO_TILE } from '../../src/core/world/ecotope';
import { groundField } from '../../src/core/world/groundField';
import { SpineSample } from '../../src/core/world/spine';
import { TerrainPoint, World } from '../../src/core/world/terrain';

/** the first geothermal place of a world of version 5 within its first sixty places, laid */
function firstGeothermal(w: World): number {
  const j = w.earth!;
  for (let k = 1; k < 60; k++) {
    while (j.pieces.length <= k + 1) j.chapter(j.chapters.length);
    if (isGeothermal(j.pieces[k])) return k;
  }
  return -1;
}

describe('a geothermal place (world version 5)', () => {
  const w = new World(7, { worldVersion: 5 });
  const k = firstGeothermal(w);
  const tp = new TerrainPoint();
  const st = new SpineSample();

  it('has its springs, vents and mud pots along its stretch of the road, and one geyser', () => {
    expect(k).toBeGreaterThan(0);
    const p = w.earth!.pieces[k];
    const vents = ventsOf(w, p, tp, st);
    expect(vents.length).toBeGreaterThan(8);
    expect(vents.filter((v) => v.kind === GEYSER).length).toBe(1);
    expect(vents.some((v) => v.kind === POOL)).toBe(true);
    expect(vents.some((v) => v.kind === FUMAROLE)).toBe(true);
    for (const v of vents) {
      expect([POOL, FUMAROLE, GEYSER, MUD]).toContain(v.kind);
      expect(v.s).toBeGreaterThanOrEqual(p.start);
      expect(v.s).toBeLessThanOrEqual(p.end);
      w.shape(v.x, v.z, tp);
      // (off the road and its verge, on dry land)
      expect(Math.abs(tp.d)).toBeGreaterThan(18);
      expect(tp.wl).toBeLessThan(tp.bed);
    }
    // the same whoever asks: a second world of the same seed plans the same
    const w2 = new World(7, { worldVersion: 5 });
    expect(firstGeothermal(w2)).toBe(k);
    const again = ventsOf(w2, w2.earth!.pieces[k], new TerrainPoint(), new SpineSample());
    expect(again.map((v) => [v.kind, Math.round(v.x), Math.round(v.z)])).toEqual(vents.map((v) => [v.kind, Math.round(v.x), Math.round(v.z)]));
  });

  it('keeps the woods and the ground\'s plants and stones off its springs', () => {
    const vents = ventsOf(w, w.earth!.pieces[k], tp, st);
    const flora = w.flora!;
    const field = groundField(w);
    let checked = 0;
    for (const v of vents.slice(0, 8)) {
      const tx = Math.floor(v.x / ECO_TILE);
      const tz = Math.floor(v.z / ECO_TILE);
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const t = flora.tile(LAYER_TREE, tx + dx, tz + dz);
          for (let i = 0; i < t.n; i++) expect(inVentClearing([v], t.x[i], t.z[i]), `a tree in the clearing of a vent at ${Math.round(v.x)}, ${Math.round(v.z)}`).toBe(false);
          for (const rocks of [false, true]) for (const c of field.tile(tx + dx, tz + dz, rocks)) expect(inVentClearing([v], c.x, c.z)).toBe(false);
          checked++;
        }
      w.shape(v.x, v.z, tp);
      expect(ventsNear(w, tp.s, v.x, v.z, 0, new TerrainPoint(), new SpineSample()).length).toBeGreaterThan(0);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('has none where the place is not geothermal', () => {
    const p = w.earth!.pieces[k - 1];
    if (!isGeothermal(p)) expect(ventsOf(w, p, tp, st)).toEqual([]);
  });
});
