/**
 * Stage L1 of node L (docs/V3/nodes/L-landscape.md): the land of a world of version 2 is no longer flat. The
 * landscape probe (landscapeProbe.ts) measures it from the driver's seat — the skyline either side, the ridges
 * standing one behind the other, the land's height range within 0.3, 1 and 3 km — over worlds begun in each
 * region (a long first chapter, three seeds) and over journeys as dealt; the shares below are the stage's
 * minimum targets, set from what the report measured over six seeds (the node's design keeps the table).
 *
 *   mountains  (alpine) 1,000 m of land within 3 km on at least one side over most of the road; a skyline of
 *              15° on at least one side; three ridges behind one another on most rays at 60° from the heading;
 *              and never shut in by both sides above 25° over more than a fraction of the road.
 *   hills      (forest, maple, terraces, the bamboo sea) 60–250 m of land within 1 km; a skyline of 4–12°.
 *   plains     (plains, the flower fields, the marsh, the lake country) no more than 60 m within 1 km (the lake
 *              country's shores roll a little higher); ranges on the horizon: two ridges on many rays.
 *   dry        (the desert, the red canyon) mesas, buttes and walls of 80–300 m within 1 km.
 *   every one  no region both sides above 25° over more than two fifths of its road.
 */
import { describe, expect, it } from 'vitest';
import { BIOMES } from '../../src/core/world/biomes';
import { firstChapterSpots, journeySpots, quantile, sharesOf, type Spot } from './landscapeProbe';

const FIRST_SEEDS = [1, 2, 3];
const STEP = 400;

/** the spots of each region begun as the first chapter (three seeds) */
const first = new Map<string, Spot[]>();
function firstOf(id: string): Spot[] {
  let spots = first.get(id);
  if (!spots) {
    spots = [];
    for (const seed of FIRST_SEEDS) firstChapterSpots(seed, id, STEP, {}).forEach((p) => spots!.push(p));
    first.set(id, spots);
  }
  return spots;
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;

describe('world v2 · relief by kind of country (stage L1), as the driver sees it', () => {
  it('mountains: walls of a kilometre within 3 km, a skyline of 15° on one side, ridges behind ridges, never shut in on both sides for long', () => {
    const sh = sharesOf(firstOf('alpine'));
    console.log(`alpine: ${pct(sh.range3Over1000)} of the road with 1,000 m within 3 km, ${pct(sh.skyOver15)} with a skyline of 15° on a side, ${pct(sh.layers3At60)} of the rays at 60° with three ridges, ${pct(sh.bothOver25)} with both sides above 25° (${sh.spots} spots)`);
    // (measured over six seeds: 95 %, 100 %, 78 %, 8 %; the stage's targets: 70 %, 50 %, 50 %, at most 40 %)
    expect(sh.range3Over1000).toBeGreaterThanOrEqual(0.75);
    expect(sh.skyOver15).toBeGreaterThanOrEqual(0.8);
    expect(sh.layers3At60).toBeGreaterThanOrEqual(0.6);
    expect(sh.bothOver25).toBeLessThanOrEqual(0.25);
  });

  for (const id of ['forest', 'maple', 'terraces', 'bamboo_sea']) {
    it(`hills: ${id} has 60–250 m of land within 1 km and a skyline of 4–12° over most of its road`, () => {
      const spots = firstOf(id);
      const sh = sharesOf(spots);
      const sky = quantile(spots.map((p) => p.skyHi), 0.5);
      console.log(`${id}: ${pct(sh.range1Hills)} with 60–250 m within 1 km, ${pct(sh.skyHills)} with a skyline of 4–12° (median ${sky.toFixed(1)}°)`);
      // (measured over six seeds: 84–90 % and 69–80 %, the median skyline 8.7–9.8°; the first version 2 stood
      // at 13–17° from the massifs and giant peaks on the horizon, with 3 to 50 m of land within 300 m)
      expect(sh.range1Hills).toBeGreaterThanOrEqual(0.75);
      expect(sh.skyHills).toBeGreaterThanOrEqual(0.55);
      expect(sky).toBeGreaterThan(6);
      expect(sky).toBeLessThan(12);
    });
  }

  for (const id of ['plains', 'flower_fields', 'wetland', 'lakes']) {
    it(`plains: ${id} rolls gently within 1 km and has ranges on its horizon`, () => {
      const spots = firstOf(id);
      const sh = sharesOf(spots);
      const low = spots.filter((p) => p.rangeHi[1] <= (id === 'lakes' ? 100 : 60)).length / spots.length;
      console.log(`${id}: ${pct(low)} within ${id === 'lakes' ? 100 : 60} m of range within 1 km, ${pct(sh.layers2)} of the rays with two ridges`);
      // (measured over six seeds: the plains 78 % within 60 m, the flower fields 97 %, the marsh all; the lake
      // country's shores 98 % within 100 m; two ridges on 45–64 % of the rays, the target being 40 %)
      expect(low).toBeGreaterThanOrEqual(0.7);
      expect(sh.layers2).toBeGreaterThanOrEqual(0.4);
    });
  }

  for (const id of ['desert', 'red_canyon']) {
    it(`dry: ${id} has mesas, buttes and walls of 80–300 m within 1 km`, () => {
      const sh = sharesOf(firstOf(id));
      console.log(`${id}: ${pct(sh.range1Dry)} with 80–300 m within 1 km`);
      expect(sh.range1Dry).toBeGreaterThanOrEqual(0.6);
    });
  }

  it('no region is shut in by both sides above 25° over more than two fifths of its road, begun in it or as dealt', () => {
    const dealt = new Map<number, Spot[]>();
    for (const seed of [1, 2]) {
      for (const p of journeySpots(seed, 200, 500)) {
        let list = dealt.get(p.region);
        if (!list) dealt.set(p.region, (list = []));
        list.push(p);
      }
    }
    for (const region of BIOMES) {
      const sh = sharesOf(firstOf(region.id));
      expect(sh.bothOver25, `${region.id}, begun in it`).toBeLessThanOrEqual(0.4);
    }
    for (const [r, spots] of dealt) {
      const sh = sharesOf(spots);
      expect(sh.bothOver25, `${BIOMES[r].id}, as dealt`).toBeLessThanOrEqual(0.4);
      // (and the mountains as dealt: walls of a kilometre within 3 km over most of their road, entered from
      // whatever country lies before them)
      if (BIOMES[r].relief?.walls) expect(sh.range3Over1000, `${BIOMES[r].id}, as dealt`).toBeGreaterThanOrEqual(0.7);
    }
  });
});
