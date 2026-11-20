// Milestones E5–E6 (docs/V3/nodes/E5-earth-director.md): the director's highlights — never a long stretch of the
// journey without one of the places one remembers (the ice's valleys, the volcanoes, the karst's towers, the great
// dunes, the tables and canyons, the granite domes, the sea's cliffs, the salt mirrors, the cloud forest, the
// páramo, the terraces, the passes) — and every place's weather its own: its sky by its wetness, its showers rain
// or snow by its month, the fog lying all day in a cloud forest, the dust in a hot desert's air, its storms
// blizzards in the snow, sand walls in the sand seas, thunder in the wet tropics.
import { describe, expect, it } from 'vitest';
import { EarthJourney, SCENE_LENGTH, isHighlight, type Scene } from '../../src/core/earth/director';
import { cloudAt, snowAt, wetnessAt } from '../../src/core/earth/climate';
import { WeatherState, WeatherSystem, calmOf } from '../../src/core/env/weather';
import { BIOMES } from '../../src/core/world/biomes';
import { weatherOfPlace } from '../../src/core/world/earth/weather';
import { World } from '../../src/core/world/terrain';

const SEEDS = [3, 7, 11, 99, 2026, 4242, 31337, 8, 77, 500, 1234, 65535];

function places(seed: number, n = 80): Scene[] {
  const j = new EarthJourney(seed);
  j.sceneAt((n - 1) * SCENE_LENGTH + 1);
  return j.scenes.slice(0, n);
}

describe('the emergent Earth\'s director: its highlights', () => {
  it('never goes long without one of the places one remembers, and comes to the first within the first hour', () => {
    let all = 0;
    for (const seed of SEEDS) {
      const sc = places(seed);
      let last = 0;
      let first = -1;
      let n = 0;
      sc.forEach((s, k) => {
        if (!(isHighlight(s.look) || s.moment.startsWith('翻过山口'))) return;
        n++;
        if (first < 0) first = k;
        expect(k - last, `seed ${seed}: places ${last} to ${k} without a highlight`).toBeLessThanOrEqual(16);
        last = k;
      });
      expect(80 - last, `seed ${seed}: the last stretch`).toBeLessThanOrEqual(16);
      expect(first, `seed ${seed}`).toBeLessThanOrEqual(12);
      expect(n, `seed ${seed}`).toBeGreaterThanOrEqual(12);
      all += n;
    }
    expect(all / SEEDS.length).toBeGreaterThanOrEqual(20);
  });
});

describe('the emergent Earth\'s weather', () => {
  const ALL = SEEDS.slice(0, 6).flatMap((s) => places(s, 60));

  it('gives every place a sky of its wetness, its month\'s showers, its fog and dust and storms', () => {
    let fogged = 0;
    let dusty = 0;
    for (const sc of ALL) {
      const m = sc.macro;
      const { calm, kinds } = weatherOfPlace(sc);
      const w = wetnessAt(m, m.base);
      expect(calm.cloud).toBeGreaterThan(0);
      expect(calm.cloud).toBeLessThanOrEqual(1);
      expect(kinds[kinds.length - 1][0]).toBe(1);
      for (let k = 1; k < kinds.length; k++) expect(kinds[k][0]).toBeGreaterThan(kinds[k - 1][0]);
      if (snowAt(m, m.base, m.month)) {
        expect(calm.rain, sc.name).toBe(0);
        expect(calm.snow, sc.name).toBeGreaterThan(0);
        expect(kinds.some(([, k]) => k === 'blizzard' || k === 'snow'), sc.name).toBe(true);
      } else expect(calm.snow, sc.name).toBe(0);
      if (w < 0.18) expect(calm.rain, sc.name).toBe(0);
      if (w < 0.25 && !snowAt(m, m.base, m.month)) expect(kinds.some(([, k]) => k === 'sandstorm'), sc.name).toBe(true);
      if (cloudAt(m, m.base) > 0.3) {
        fogged++;
        expect(calm.haze ?? 0, sc.name).toBeGreaterThanOrEqual(0.3);
      }
      if ((calm.dust ?? 0) > 0) dusty++;
    }
    expect(dusty).toBeGreaterThan(0);
    expect(fogged + dusty).toBeGreaterThan(0);
  });

  it('lays the fog of a place lying in its mountain\'s cloud all day, and puts each place\'s weather on its region', () => {
    // (a world whose journey goes through a cloud belt, or failing that any foggy place)
    for (const seed of [6987, 2331, 1, 2, 3]) {
      const w = new World(seed, { worldVersion: 4 });
      for (let c = 1; c < 60; c++) {
        const def = BIOMES[w.spine.plan.biomeOf(c)];
        const calm = calmOf(def);
        const sc = w.earth!.pieces[c].scene!.place;
        expect(calm).toEqual(weatherOfPlace(sc).calm);
        if ((calm.haze ?? 0) < 0.3) continue;
        const ws = new WeatherSystem(seed);
        const out = new WeatherState();
        for (const hour of [6, 10, 14, 18]) {
          ws.targets(hour * 100, hour, 1, w.spine.plan.biomeOf(c), w.spine.plan.biomeOf(c), 0, out);
          expect(out.fog, `${def.label} at ${hour}h`).toBeGreaterThanOrEqual((calm.haze ?? 0) - 1e-9);
        }
        return;
      }
    }
    throw new Error('no place in a cloud belt among the seeds tried');
  });
});
