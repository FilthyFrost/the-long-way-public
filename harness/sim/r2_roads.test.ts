// Milestone R2 (docs/V3/nodes/R2-roads.md): the scenic roads of world version 5 — the director of the roads gives each
// place a road of its own kind (a shelf over a valley, a skyline drive, a gorge, a cliff road over the sea, a lakeshore,
// a tunnel of trees, the grassland's swell …), never the same twice running, a road one remembers never far off; and
// the world builds each as it is: the shelf's fall and its far wall, the ridge's falls on both sides, the rim's canyon,
// the gorge's close walls, the cliff road's sea far below, the lakeshore's lakes by the road.
import { describe, expect, it } from 'vitest';
import { EarthJourney, SCENE_LENGTH } from '../../src/core/earth/director';
import { ROAD, ROADS, RoadDirector } from '../../src/core/earth/roads';
import { BIOMES } from '../../src/core/world/biomes';
import { SpineSample } from '../../src/core/world/spine';
import { TerrainPoint, World } from '../../src/core/world/terrain';

const SEEDS = [1, 2, 3, 7, 11, 99, 2026, 4242, 31337, 8, 77, 500];
const N = 80;

describe('the director of the roads', () => {
  it('drives a journey by a score of kinds of road, never the same twice running, a road one remembers never far off', () => {
    const met = new Set<string>();
    let total = 0;
    let twice = 0;
    for (const seed of SEEDS) {
      const j = new EarthJourney(seed, { drama: true });
      j.sceneAt(N * SCENE_LENGTH);
      const roads = new RoadDirector(j, seed).list(N);
      const kinds = new Set(roads.slice(1).map((r) => r.id));
      expect(kinds.size, `seed ${seed}`).toBeGreaterThanOrEqual(17);
      let gap = 0;
      for (let k = 1; k < N; k++) {
        met.add(roads[k].id);
        total++;
        if (roads[k].id === roads[k - 1].id) twice++;
        // (every road suits its place)
        expect(roads[k].fit(j.scenes[k]), `${seed}:${k} ${roads[k].id}`).toBeGreaterThan(0);
        gap = roads[k].wow ? 0 : gap + 1;
        expect(gap, `seed ${seed}: place ${k}, ${gap} places without a road one remembers`).toBeLessThanOrEqual(10);
      }
    }
    expect(twice / total).toBeLessThan(0.01);
    expect(met.size).toBe(ROADS.length);
  });

  it('leaves the journey of version 4 as it was: no sense of drama, the same places', () => {
    const a = new EarthJourney(7);
    const b = new EarthJourney(7, {});
    a.sceneAt(30 * SCENE_LENGTH);
    b.sceneAt(30 * SCENE_LENGTH);
    expect(a.scenes.map((s) => s.name)).toEqual(b.scenes.map((s) => s.name));
  });
});

describe('the scenic roads in the world (version 5)', () => {
  const q = new SpineSample();
  const tp = new TerrainPoint();
  /** the land's height above the road across it at arc length s, `d` metres to the right (negative: left) */
  const across = (w: World, s: number, d: number): number => {
    w.spine.at(s, q);
    w.shape(q.x - Math.sin(q.phi) * d, q.z + Math.cos(q.phi) * d, tp);
    return tp.h - q.y;
  };
  /** the first place of a kind of road among a world's first sixty */
  const placeOf = (w: World, id: string): { start: number; end: number; region: number } | null => {
    const j = w.earth!;
    for (let c = 1; c < 60; c++) {
      j.chapter(c);
      const p = j.pieces[c];
      if (p.scene?.road?.id === id) return p;
    }
    return null;
  };

  it('makes each place\'s region of its road: its winding, its grades, its kinds of country in their order', () => {
    const w = new World(2, { worldVersion: 5 });
    for (let c = 1; c < 30; c++) {
      w.earth!.chapter(c);
      const p = w.earth!.pieces[c];
      const road = p.scene!.road!;
      const def = BIOMES[p.region];
      expect(def.id.startsWith('earth5:'), def.id).toBe(true);
      expect(def.designKmh).toBe(road.align.kmh);
      expect(def.straightChance).toBe(road.align.straight);
      expect(def.turnMax).toBe(road.align.turn[1]);
      expect(def.gradeLen).toBe(road.grade.len);
      expect(p.scene!.tag.startsWith(road.zh)).toBe(true);
      // (its heart, the two stretches past its blends, the kinds its road asks for; a coast's or a lake's or a river's may have had their say)
      const k0 = Math.round(p.start / 1250);
      for (const i of [1, 2]) expect([road.land[i], 'open', 'hillside', 'valley', 'shelf'], `${def.label} ${road.id} stretch ${i}`).toContain(w.land.kindOf(k0 + i));
    }
  });

  it('builds a shelf road\'s fall and far wall, a skyline\'s falls on both sides, a rim\'s canyon, a gorge\'s walls', () => {
    let shelves = 0;
    let ridges = 0;
    let rims = 0;
    let gorges = 0;
    for (const seed of [1, 2, 7, 11]) {
      const w = new World(seed, { worldVersion: 5 });
      const shelf = placeOf(w, 'shelf');
      if (shelf) {
        const s = (shelf.start + shelf.end) / 2;
        const k = Math.floor(s / 1250);
        if (w.land.kindOf(k) === 'shelf') {
          shelves++;
          const high = w.land.sideOf(k);
          // (the low side falls a hundred metres within two hundred; the high side climbs over the road)
          expect(across(w, s, -high * 200)).toBeLessThan(-100);
          expect(across(w, s, high * 60)).toBeGreaterThan(25);
        }
      }
      const ridge = placeOf(w, 'skyline');
      if (ridge) {
        const s = ridge.start + 1.5 * 1250;
        if (w.land.kindOf(Math.floor(s / 1250)) === 'ridge') {
          ridges++;
          expect(across(w, s, 250)).toBeLessThan(-60);
          expect(across(w, s, -250)).toBeLessThan(-60);
        }
      }
      const rim = placeOf(w, 'rim');
      if (rim) {
        const s = rim.start + 1.5 * 1250;
        const k = Math.floor(s / 1250);
        if (w.land.kindOf(k) === 'rim') {
          rims++;
          const side = w.land.sideOf(k);
          expect(Math.min(across(w, s, side * 150), across(w, s, side * 250))).toBeLessThan(-80);
          expect(Math.abs(across(w, s, -side * 150))).toBeLessThan(30);
        }
      }
      const gorge = placeOf(w, 'gorge');
      if (gorge) {
        const s = gorge.start + 1.5 * 1250;
        if (w.land.kindOf(Math.floor(s / 1250)) === 'canyon') {
          gorges++;
          expect(across(w, s, 100)).toBeGreaterThan(40);
          expect(across(w, s, -100)).toBeGreaterThan(40);
        }
      }
    }
    expect(shelves + ridges + rims + gorges).toBeGreaterThanOrEqual(4);
  });

  it('lays a cliff road\'s sea far below it, and a lakeshore road\'s lakes by it', () => {
    let cliffs = 0;
    let shores = 0;
    for (const seed of [1, 2, 3, 7, 11, 99]) {
      const w = new World(seed, { worldVersion: 5 });
      const sea = (w as unknown as { sea: { seaOf(c: number): { level: number; runs: { k0: number; k1: number; cliff?: number }[] } | null } }).sea;
      const j = w.earth!;
      for (let c = 1; c < 40; c++) {
        j.chapter(c);
        const p = j.pieces[c];
        const id = p.scene?.road?.id;
        if (id === 'cliff_coast') {
          const coast = sea.seaOf(c);
          expect(coast, `${seed}:${c}`).not.toBeNull();
          const run = coast!.runs.find((r) => r.k0 * 1250 >= p.start && r.k1 * 1250 < p.end);
          if (run && (run.cliff ?? 0) > 0) {
            cliffs++;
            w.spine.at((run.k0 + 1) * 1250, q);
            expect(q.y - coast!.level, `${seed}:${c} the cliff`).toBeGreaterThan(35);
          }
        }
        if (id === 'lakeshore') {
          const water = (w as unknown as { water: { feature(k: number): { kind: string } | null } }).water;
          const k0 = Math.round(p.start / 1250);
          const lakes = [1, 2].filter((i) => water.feature(k0 + i)?.kind === 'lake').length;
          expect(lakes, `${seed}:${c} lakes by the lakeshore road`).toBeGreaterThanOrEqual(1);
          shores++;
        }
      }
    }
    expect(cliffs).toBeGreaterThan(0);
    expect(shores).toBeGreaterThan(0);
  });

  it('keeps a world of version 4 as it was: its regions its own, no road of the director\'s', () => {
    const w = new World(7, { worldVersion: 4 });
    for (let c = 1; c < 12; c++) {
      w.earth!.chapter(c);
      const p = w.earth!.pieces[c];
      expect(p.scene!.road).toBeUndefined();
      expect(BIOMES[p.region].id.startsWith('earth:')).toBe(true);
      expect(BIOMES[p.region].cliff).toBeUndefined();
    }
    expect(ROAD.shelf.land).toContain('shelf');
  });
});
