/**
 * The journey as the developer's panel reads it off a world (src/game/modcar/devJourney.ts): the regions that
 * come next with how much each asks of the traveller, and where the next chapter of a given region begins —
 * on the game's own worlds of both versions, without laying out any road.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { BIOMES, BIOME_INDEX, registerRegion } from '../../src/core/world/biomes';
import { INTENSITIES, INTENSITY_ZH, REGION_ENTRY, intensityOf, journeyFrom, journeyTotals, nextChapterOf, worldKnows } from '../../src/game/modcar/devJourney';
import { modcarWorld } from '../../src/game/modcar/seamless';

const undo: (() => void)[] = [];
afterEach(() => {
  while (undo.length) undo.pop()!();
});

describe('the journey ahead', () => {
  it('is the chapters as the plan deals them: in order, end to end, the first the region the journey begins in', () => {
    for (const worldVersion of [1, 2] as const) {
      const w = modcarWorld(31, { worldVersion }).world;
      const stops = journeyFrom(w, 0, 60);
      expect(stops).toHaveLength(60);
      expect(stops[0]).toMatchObject({ chapter: 0, start: 0, id: 'plains', region: BIOME_INDEX.plains, label: BIOMES[BIOME_INDEX.plains].label });
      for (let i = 0; i < stops.length; i++) {
        const x = stops[i];
        expect(x.chapter).toBe(i);
        expect(x.length).toBeGreaterThan(0);
        expect(x.region).toBe(w.spine.plan.biomeOf(i));
        expect(x.id).toBe(BIOMES[x.region].id);
        expect(x.intensity).toBe(BIOMES[x.region].intensity ?? 'calm');
        expect(worldKnows(w, x.region)).toBe(true);
        if (i > 0) expect(x.start).toBeCloseTo(stops[i - 1].start + stops[i - 1].length, 6);
      }
      // (a region of version 2 is whole stretches of the road)
      if (worldVersion === 2) for (const x of stops) expect((x.length / w.rules.slot) % 1).toBe(0);
    }
  });

  it('begins with the chapter one is in', () => {
    const w = modcarWorld(31, { worldVersion: 2 }).world;
    const all = journeyFrom(w, 0, 8);
    const from = journeyFrom(w, all[3].start + 10, 4);
    expect(from.map((x) => x.chapter)).toEqual([3, 4, 5, 6]);
    expect(journeyFrom(w, all[4].start - 1, 1)[0].chapter).toBe(3);
    // (behind the road's start: the first chapter)
    expect(journeyFrom(w, -500, 1)[0].chapter).toBe(0);
  });

  it('is counted by intensity, every chapter once', () => {
    const w = modcarWorld(31, { worldVersion: 2 }).world;
    const stops = journeyFrom(w, 0, 60);
    const t = journeyTotals(stops);
    expect(t.calm + t.scenic + t.highlight).toBe(60);
    for (const k of INTENSITIES) expect(t[k]).toBe(stops.filter((x) => x.intensity === k).length);
    expect(Object.keys(INTENSITY_ZH).sort()).toEqual([...INTENSITIES].sort());
    // a region that does not say how much it asks is calm; so is an index the registry does not hold
    undo.push(registerRegion({ ...BIOMES[0], id: 'test_plain', intensity: undefined }));
    expect(intensityOf(BIOMES.length - 1)).toBe('calm');
    expect(intensityOf(9999)).toBe('calm');
  });

  it('lays out no road: the plan is dealt, nothing else is asked', () => {
    const w = modcarWorld(77, { worldVersion: 2 }).world;
    const laid = w.spine.count;
    journeyFrom(w, 0, 60);
    for (let r = 0; r < BIOMES.length; r++) nextChapterOf(w, r, 0);
    expect(w.spine.count).toBe(laid);
    expect(w.sites.ready(40)).toBe(false);
  });
});

describe('the next chapter of a region', () => {
  it('is the first of that region after the chapter one is in, and none of the chapters before it is', () => {
    for (const worldVersion of [1, 2] as const) {
      const w = modcarWorld(4242, { worldVersion }).world;
      const plan = w.spine.plan;
      let found = 0;
      for (let r = 0; r < BIOMES.length; r++) {
        for (const s of [0, 20_000, 123_456]) {
          const here = plan.chapterAt(s);
          const stop = nextChapterOf(w, r, s);
          if (!worldKnows(w, r)) {
            expect(stop).toBeNull();
            continue;
          }
          if (!stop) {
            for (let c = here + 1; c <= here + 400; c++) expect(plan.biomeOf(c)).not.toBe(r);
            continue;
          }
          found++;
          expect(stop.region).toBe(r);
          expect(stop.chapter).toBeGreaterThan(here);
          expect(stop.start).toBe(plan.starts[stop.chapter]);
          for (let c = here + 1; c < stop.chapter; c++) expect(plan.biomeOf(c)).not.toBe(r);
          // where the developer is set down: in that chapter, the nearer region of the two that blend there
          const at = stop.start + REGION_ENTRY;
          expect(plan.chapterAt(at)).toBe(stop.chapter);
          const bl = { a: 0, b: 0, t: 0, ia: 0, ib: 0 };
          plan.blend(at, bl as never);
          expect(bl.t > 0.5 ? bl.b : bl.a).toBe(r);
        }
      }
      // (every region the world knows comes on a long journey; at least most of the questions had an answer)
      expect(found).toBeGreaterThanOrEqual(w.rules.regionCount * 2);
    }
  });

  it('a version 2 world finds every region it knows within the chapters searched, from its start', () => {
    for (const seed of [1, 7, 20261113]) {
      const w = modcarWorld(seed, { worldVersion: 2 }).world;
      for (let r = 0; r < w.rules.regionCount; r++) expect(nextChapterOf(w, r, 0), `region ${BIOMES[r].id} of seed ${seed}`).not.toBeNull();
    }
  });

  it('is none for a region the world does not know: one added after the world was begun, or beyond a version 1 world\'s six', () => {
    undo.push(registerRegion({ ...BIOMES[BIOME_INDEX.desert], id: 'test_late', label: '后来的区域', kin: 'desert' }));
    const late = BIOMES.length - 1;
    const one = modcarWorld(5, {}).world;
    expect(worldKnows(one, late)).toBe(false);
    expect(nextChapterOf(one, late, 0)).toBeNull();
    // a version 2 world begun when the registry was one shorter
    const two = modcarWorld(5, { worldVersion: 2, regionCount: late }).world;
    expect(worldKnows(two, late)).toBe(false);
    expect(worldKnows(two, late - 1)).toBe(true);
    expect(nextChapterOf(two, late, 0)).toBeNull();
    expect(worldKnows(two, -1)).toBe(false);
  });
});
