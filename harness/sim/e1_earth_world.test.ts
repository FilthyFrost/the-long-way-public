// Milestone E1 (docs/V3/nodes/E1-earth-world.md): the emergent Earth in the world — a world of version 4 lays the
// director's places on its road, one chapter to a place, each a region of its own made from the place (its height
// and relief, its water and sea, its lines of woods and snow, its plants, its colours), home first as the region the
// world was asked to begin in; the same world from the same seed whatever was made before it.
import { describe, expect, it } from 'vitest';
import { AUTHORED_REGIONS, BIOMES, BIOME_INDEX, isEarthRegion, regionSalt } from '../../src/core/world/biomes';
import { earthRegionId, templateOf } from '../../src/core/world/earth/region';
import { floraTableOf } from '../../src/core/world/floraTables';
import { RULES_V4, rulesFor } from '../../src/core/world/rules';
import { sceneMonth } from '../../src/core/world/sceneSeason';
import { sceneSnowLine } from '../../src/core/world/routeProfiles';
import { SpineSample } from '../../src/core/world/spine';
import { TerrainPoint, World } from '../../src/core/world/terrain';
import { PlaceNames } from '../../src/game/modcar/placeNames';
import { savedWorldOf } from '../../src/game/modcar/worldSave';

const at = new SpineSample();
const tp = new TerrainPoint();

/** the land's height at points beside the road (m), from s0 on every `step` m */
function heights(w: World, s0: number, s1: number, step: number, off = 160): number[] {
  const out: number[] = [];
  for (let s = s0; s < s1; s += step) {
    w.spine.at(s, at);
    w.shape(at.x + off, at.z - off * 0.3, tp);
    out.push(tp.h);
  }
  return out;
}

describe('the emergent Earth in the world (world version 4)', () => {
  it('deals home first, then one chapter to each of the director\'s places, each a region of its own', () => {
    const w = new World(7, { worldVersion: 4 });
    expect(w.rules.version).toBe(4);
    expect(w.rules.dealer).toBe(RULES_V4.dealer);
    const plan = w.spine.plan;
    const earth = w.earth!;
    expect(earth).not.toBeNull();
    expect(w.journey).toBe(earth);
    // (home: the region the world was asked to begin in, drawn as it always was)
    expect(BIOMES[plan.biomeOf(0)].id).toBe('plains');
    expect(earth.pieceAt(100).kind).toBe('home');
    for (let c = 1; c <= 24; c++) {
      const r = plan.biomeOf(c);
      expect(isEarthRegion(r), `chapter ${c}`).toBe(true);
      const def = BIOMES[r];
      expect(def.id).toBe(earthRegionId(7, c));
      const piece = earth.pieces[c];
      expect(piece.kind).toBe('scene');
      expect(def.label).toBe(piece.scene!.name);
      expect(piece.region).toBe(r);
      // (a place is four stretches of road; its blend with the one before most of its length, never more than the plan allows)
      expect(plan.starts[c + 1] - plan.starts[c]).toBe(4 * w.rules.slot);
      expect(plan.transitionAt(c)).toBeGreaterThan(0);
      expect(plan.transitionAt(c)).toBeLessThanOrEqual(w.rules.transition(1));
    }
  });

  it('is the same world from the same seed, whatever worlds were made before it', () => {
    const a = heights(new World(2026, { worldVersion: 4 }), 0, 90000, 997);
    // (other worlds put their regions into the registry in between)
    heights(new World(31337, { worldVersion: 4 }), 0, 60000, 1999);
    heights(new World(11, { worldVersion: 4 }), 0, 60000, 1999);
    const b = heights(new World(2026, { worldVersion: 4 }), 0, 90000, 997);
    expect(b).toEqual(a);
    // (its land's noise is its place's own, not its index)
    const w = new World(2026, { worldVersion: 4 });
    for (let c = 1; c < 12; c++) {
      const r = w.spine.plan.biomeOf(c);
      expect(regionSalt(r)).toBe(BIOMES[r].noise);
      expect(regionSalt(r)).not.toBe(r);
    }
  });

  it('leaves the worlds of versions 2 and 3 as they were: they know the regions written by hand and no more', () => {
    const before = heights(new World(7, { worldVersion: 3 }), 0, 60000, 1499);
    heights(new World(7, { worldVersion: 4 }), 0, 60000, 1499);
    expect(heights(new World(7, { worldVersion: 3 }), 0, 60000, 1499)).toEqual(before);
    expect(rulesFor(2).regionCount).toBe(AUTHORED_REGIONS);
    expect(rulesFor(3).regionCount).toBe(AUTHORED_REGIONS);
    expect(BIOMES.length).toBeGreaterThan(AUTHORED_REGIONS);
    const v2 = new World(7, { worldVersion: 2 });
    for (let c = 0; c < 30; c++) expect(v2.spine.plan.biomeOf(c)).toBeLessThan(AUTHORED_REGIONS);
  });

  it('lays the road at each place\'s height, the land rising about it as the place\'s relief', () => {
    for (const seed of [2331, 2026]) {
      const w = new World(seed, { worldVersion: 4 });
      const earth = w.earth!;
      let checked = 0;
      for (let c = 2; c < 60; c++) {
        const p = earth.pieces[c] ?? (earth.chapter(c), earth.pieces[c]);
        const place = p.scene!.place;
        const mid = (p.start + p.end) / 2;
        w.spine.at(mid, at);
        // (the road drifts to its country's height over kilometres: within a few hundred metres of it in a place's middle)
        expect(Math.abs(at.y - place.macro.base), `seed ${seed} place ${c} ${p.scene!.name}: road ${at.y.toFixed(0)} m, place ${place.macro.base.toFixed(0)} m`).toBeLessThan(Math.max(320, 0.25 * place.macro.base));
        checked++;
      }
      expect(checked).toBe(58);
    }
  });

  it('gives every place its own plants, month, snow line and colours', () => {
    const w = new World(2331, { worldVersion: 4 });
    const plan = w.spine.plan;
    const trees = new Set<string>();
    for (let c = 1; c < 40; c++) {
      const def = BIOMES[plan.biomeOf(c)];
      const place = w.earth!.pieces[c].scene!.place;
      const t = floraTableOf(def.id, def.kin);
      expect(t).not.toBe(floraTableOf(def.kin, def.kin));
      for (const r of t.trees) trees.add(r.plant);
      expect(sceneMonth(def.id)).toBe(place.macro.month);
      expect(sceneSnowLine(def.id)).toBe(def.relief!.snow);
      expect(def.earth!.month).toBe(place.macro.month);
      expect(def.earth!.ground.length).toBe(3);
      expect(def.relief!.base).toBe(Math.round(place.macro.base));
      expect(typeof templateOf(place)).toBe('string');
      expect(BIOME_INDEX[templateOf(place)]).toBeLessThan(AUTHORED_REGIONS);
    }
    // (a tropical journey's own trees: the rainforest's, the cloud forest's tree ferns, the palms)
    expect([...trees].some((p) => p === 'giant_broadleaf' || p === 'river_fig')).toBe(true);
    expect(trees.has('tree_fern')).toBe(true);
  });

  it('names a place on the screen as one drives into it, never home', () => {
    const w = new World(7, { worldVersion: 4 });
    const names = new PlaceNames();
    const shown: string[] = [];
    let now = 0;
    for (let s = 0; s < 40000; s += 50) {
      now += 2;
      const p = names.update(w.journey, s, now, 2);
      if (p) shown.push(p.name);
    }
    const expected = w.earth!.pieces.slice(1).filter((p) => p.start < 40000).map((p) => p.scene!.name);
    expect(shown).toEqual(expected);
  });

  it('is saved as a world of version 4, of the regions written by hand', () => {
    const w = new World(99, { worldVersion: 4 });
    const saved = savedWorldOf(w, 99);
    expect(saved.version).toBe(4);
    expect(saved.regionCount).toBe(AUTHORED_REGIONS);
    expect(() => rulesFor(4, { regionCount: saved.regionCount })).not.toThrow();
  });
});
