// Milestone E2 (docs/V3/nodes/E2-earth-land.md): the emergent Earth's landforms on the land — every one of the
// director's landforms made of the land function's own forms (anchored forms beside the road, dune fields of four
// shapes, benches, the kinds of country, hills and valley walls, the mesas of the far field), within the limits the
// height field keeps; the salt pans white; a place's plants its own.
import { describe, expect, it } from 'vitest';
import type { Scene } from '../../src/core/earth/director';
import { EarthJourney, SCENE_LENGTH } from '../../src/core/earth/director';
import { LANDFORMS } from '../../src/core/earth/landforms';
import { BIOMES } from '../../src/core/world/biomes';
import { landOfPlace } from '../../src/core/world/earth/landform';
import { CLEAR, MAX_ASPECT, featureProfile } from '../../src/core/world/features';
import { FLORA, floraTableOf } from '../../src/core/world/floraTables';
import { duneMean, dunes, type DuneShape } from '../../src/core/world/operators';
import { World } from '../../src/core/world/terrain';

/** a place of a landform, as far as landOfPlace reads one */
const placeOf = (id: string, relief = 300): Scene => ({ macro: { relief }, look: { landform: LANDFORMS.find((l) => l.id === id)! } }) as unknown as Scene;

describe('the emergent Earth\'s landforms on the land', () => {
  it('makes every landform but the plain shapes of the land function\'s own forms, sized by the relief', () => {
    for (const l of LANDFORMS) {
      for (const relief of [40, 300, 1200]) {
        const land = landOfPlace(placeOf(l.id, relief));
        if (l.process === 'plain') {
          expect(land, l.id).toEqual({});
          continue;
        }
        expect(Object.keys(land).length, l.id).toBeGreaterThan(0);
        for (const f of land.features ?? []) {
          expect(f.aspect[1], `${l.id} ${f.kind}`).toBeLessThanOrEqual(MAX_ASPECT[f.kind]);
          expect(f.aspect[0]).toBeLessThanOrEqual(f.aspect[1]);
          expect(f.radius[0]).toBeGreaterThan(0);
          expect(f.radius[0]).toBeLessThanOrEqual(f.radius[1]);
          expect(f.count[0]).toBeLessThanOrEqual(f.count[1]);
          expect(f.near, l.id).toBeGreaterThanOrEqual(CLEAR);
          expect(f.far).toBeGreaterThan(f.near);
        }
        if (land.features) expect(land.featureSlots ?? 0, l.id).toBeGreaterThan(0);
        if (land.featureSlots) expect(land.featureSlots).toBeLessThanOrEqual(4);
        if (land.dune) {
          expect(land.dune.amp, l.id).toBeGreaterThan(0);
          expect(land.dune.len).toBeGreaterThan(50);
        }
        if (land.walls) expect(land.walls.height[0], l.id).toBeLessThanOrEqual(land.walls.height[1]);
      }
    }
  });

  it('shapes dunes four ways, each within its height and about its mean', () => {
    for (const shape of [0, 1, 2, 3] as DuneShape[]) {
      let sum = 0;
      let n = 0;
      let top = 0;
      for (let i = 0; i < 160; i++) {
        for (let j = 0; j < 160; j++) {
          const h = dunes(i * 23.7, j * 19.3, 99, 10, 220, shape);
          expect(h).toBeGreaterThanOrEqual(0);
          expect(h).toBeLessThanOrEqual(10.0001);
          sum += h;
          top = Math.max(top, h);
          n++;
        }
      }
      expect(Math.abs(sum / n / 10 - duneMean(shape)), `shape ${shape}: mean ${(sum / n / 10).toFixed(3)}`).toBeLessThan(0.1);
      expect(top).toBeGreaterThan(5);
    }
  });

  it('draws a dome as all curve: flat on top and at its foot', () => {
    expect(featureProfile('dome', 0)).toBe(1);
    expect(featureProfile('dome', 1)).toBe(0);
    let last = 1;
    for (let t = 0.01; t <= 1; t += 0.01) {
      const h = featureProfile('dome', t);
      expect(h).toBeLessThanOrEqual(last + 1e-9);
      // (no slope steeper than 1.5 in units of the height over the radius)
      expect(last - h).toBeLessThan(0.016);
      last = h;
    }
  });

  it('stands a place\'s anchored forms beside its road, in the stretches the director gives them', () => {
    // (the first place of yardangs, of tors, of a tower karst among some seeds)
    const want = new Set(['yardang', 'tors', 'tower_karst', 'cinder_cones', 'mesas_buttes']);
    let checked = 0;
    for (let seed = 1; seed <= 12 && want.size; seed++) {
      const j = new EarthJourney(seed);
      j.sceneAt(40 * SCENE_LENGTH);
      for (const sc of j.scenes.slice(2, 40)) {
        if (!want.has(sc.look.landform.id)) continue;
        want.delete(sc.look.landform.id);
        const w = new World(seed, { worldVersion: 4 });
        const plan = w.spine.plan;
        plan.biomeOf(sc.index + 2);
        const def = BIOMES[plan.biomeOf(sc.index)];
        expect(def.features?.length, `${seed}:${sc.index} ${sc.look.landform.id}`).toBeGreaterThan(0);
        const k0 = Math.round(plan.starts[sc.index] / w.rules.slot);
        let forms = 0;
        for (let k = k0; k < k0 + 4; k++) forms += w.features!.of(k).length;
        expect(forms, `${seed}:${sc.index} ${sc.look.landform.id}`).toBeGreaterThan(0);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(3);
  });

  it('paints a salt pan white and grows it nothing but what grows by water; keeps every place\'s own plants', () => {
    let salted = 0;
    for (let seed = 1; seed <= 60 && salted < 2; seed++) {
      const w = new World(seed, { worldVersion: 4 });
      const j = w.earth!;
      for (let c = 1; c < 50; c++) {
        const p = j.pieces[c] ?? (j.chapter(c), j.pieces[c]);
        const def = BIOMES[w.spine.plan.biomeOf(c)];
        const own = FLORA[def.id];
        // (its own plants: none taken out or put in for the forager)
        expect(floraTableOf(def.id, def.kin).trees).toEqual(own.trees);
        if (p.scene!.place.macro.rock !== 'salt') continue;
        salted++;
        expect(own.cover.bare).toBeGreaterThan(0.9);
        expect(own.eco.wood).toBe(0);
        const g = def.earth!.ground[1];
        const luma = (0.3 * ((g >> 16) & 255) + 0.59 * ((g >> 8) & 255) + 0.11 * (g & 255)) / 255;
        expect(luma, def.label).toBeGreaterThan(0.8);
      }
    }
    expect(salted).toBeGreaterThan(0);
  });
});
