/**
 * Gate for the generator of world version 2 as it runs in the real world (docs/V3/nodes/W1-worldgen.md,
 * W1.1 to W1.3): the dealer and the director through the real chapter plan, the anchored landforms through
 * the real road and water, the cross-section operators through the real height function, the twelve
 * regions through the road and land cards that version 1 is held to (specs/roadgen/default.json), what the
 * height function costs, and what a journey is made of. The pure functions have tests of their own
 * (v3_world_dealer.test.ts, v3_world_features.test.ts); that a world of version 2 is the same world
 * whatever is asked first, and in small bites, is held by its reference worlds (world_golden.test.ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { BIOMES } from '../../src/core/world/biomes';
import { cardsOf, dealProblems } from '../../src/core/world/dealer';
import { featureSlots, runAt } from '../../src/core/world/director';
import { CLEAR, MAX_SLOPE } from '../../src/core/world/features';
import { FunctionLand, GroundLand } from '../../src/core/onfoot/land';
import { FlatGround } from '../../src/core/world/ground';
import { GULLY_V2, LandParams } from '../../src/core/world/landform';
import { RoadSpine, SpineSample } from '../../src/core/world/spine';
import { TerrainPoint, World } from '../../src/core/world/terrain';
import { journey, journeySums } from './journey';
import { spineChecks, terrainChecks } from './roadgen';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const card = JSON.parse(fs.readFileSync(path.join(ROOT, 'specs/roadgen/default.json'), 'utf8')) as { metrics: Record<string, { min?: number; max?: number }> };
const SLOT = 1250;

describe('world v2 · the twelve regions', () => {
  it('are the registry, in the order they were added, with the cards the dealer was designed for', () => {
    expect(BIOMES.map((b) => b.id)).toEqual(['plains', 'desert', 'alpine', 'forest', 'lakes', 'maple', 'flower_fields', 'terraces', 'wetland', 'bamboo_sea', 'red_canyon', 'karst_peaks']);
    const cards = cardsOf(BIOMES.length);
    expect(cards.map((k) => `${k.id} ${k.intensity} ${k.palette} ${k.land} ${k.flora} ${k.climate}${k.sea ? ' sea' : ''}`)).toEqual([
      'plains calm green rolling meadow temperate',
      'desert calm sand mesa scrub dry',
      'alpine scenic snow mountain conifer cold',
      'forest calm deepgreen valley broadleaf temperate',
      'lakes calm green lakeland meadow temperate sea',
      'maple calm autumn hills maple temperate',
      'flower_fields calm bloom rolling flowers temperate',
      'terraces calm paddy terraced crops warm',
      'wetland calm marsh flat reeds temperate',
      'bamboo_sea scenic bamboo valley bamboo warm',
      'red_canyon scenic redrock canyon scrub dry',
      'karst_peaks scenic jade towers subtropical warm',
    ]);
    expect(cards.every((k) => k.weight === 1 && !k.surreal)).toBe(true);
    // what only worlds of version 2 read: terraces, dunes, landforms
    expect(BIOMES[7].land?.terrace).toEqual({ step: 4, strength: 1 });
    expect(BIOMES[1].land?.dune).toEqual({ amp: 7, len: 95 });
    expect(BIOMES[1].land?.odds).toBeUndefined();
    expect(BIOMES[10].featureSlots).toBe(3);
    expect(BIOMES[11].featureSlots).toBe(5);
    expect(BIOMES[11].farShape).toBe(3);
  });
});

describe('world v2 · the dealer and the director through the real chapter plan', () => {
  it('60 regions of 100 seeds break no rule of the pacing, and every region is six to eight whole stretches', () => {
    const cards = cardsOf(BIOMES.length);
    for (let seed = 1; seed <= 100; seed++) {
      const plan = new RoadSpine(seed * 7919 + 13, { worldVersion: 2 }).plan;
      plan.biomeOf(59);
      expect(dealProblems(cards, plan.biomes.slice(0, 60)), `seed ${seed}`).toEqual([]);
      for (let c = 0; c < 60; c++) {
        const stretches = (plan.starts[c + 1] - plan.starts[c]) / SLOT;
        expect(Number.isInteger(plan.starts[c] / SLOT) && Number.isInteger(stretches), `seed ${seed} chapter ${c}`).toBe(true);
        expect(stretches).toBeGreaterThanOrEqual(6);
        expect(stretches).toBeLessThanOrEqual(8);
      }
    }
  });

  it('every region after the first has its quiet run of two stretches, clear of its ends; the first has none', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const sp = new RoadSpine(seed, { worldVersion: 2, startBiome: BIOMES[seed % BIOMES.length].id });
      const plan = sp.plan;
      plan.biomeOf(59);
      for (let c = 0; c < 60; c++) {
        const k0 = plan.starts[c] / SLOT;
        const k1 = plan.starts[c + 1] / SLOT;
        const quiet: number[] = [];
        for (let k = k0; k < k1; k++) if (sp.rules.quiet(plan, sp.seed, k)) quiet.push(k);
        if (c === 0) expect(quiet).toEqual([]);
        else {
          expect(quiet.length, `seed ${seed} chapter ${c}`).toBe(2);
          expect(quiet[1]).toBe(quiet[0] + 1);
          expect(quiet[0]).toBeGreaterThan(k0);
          expect(quiet[1]).toBeLessThan(k1 - 1);
        }
      }
    }
  });

  it('a chapter scale packs the regions closer, in whole stretches and never fewer than two', () => {
    for (const scale of [0.1, 0.25, 0.4, 0.5, 2]) {
      const plan = new RoadSpine(5, { worldVersion: 2, chapterScale: scale }).plan;
      plan.biomeOf(30);
      for (let c = 0; c < 30; c++) {
        const stretches = (plan.starts[c + 1] - plan.starts[c]) / SLOT;
        expect(Number.isInteger(stretches)).toBe(true);
        expect(stretches).toBeGreaterThanOrEqual(Math.max(2, Math.round(6 * scale)));
        expect(stretches).toBeLessThanOrEqual(Math.max(2, Math.round(8 * scale)));
      }
    }
  });
});

describe('world v2 · anchored landforms in the real world', () => {
  const KM = 300;
  const worlds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((seed) => new World(seed, { worldVersion: 2, startBiome: seed % 3 === 0 ? 'karst_peaks' : seed % 3 === 1 ? 'red_canyon' : 'plains' }));

  it('laying them out never asks the land for a height, nor lays out a place', () => {
    const world = new World(77, { worldVersion: 2, startBiome: 'karst_peaks' });
    let asked = 0;
    const shape = world.shape.bind(world);
    world.shape = (x, z, o, coarse) => {
      asked++;
      shape(x, z, o, coarse);
    };
    let n = 0;
    for (let k = 0; k < 120; k++) n += world.features!.of(k).length;
    expect(n).toBeGreaterThan(50);
    expect(asked).toBe(0);
    expect(world.sites.ready(0)).toBe(false);
  });

  it('a world of version 1 has none', () => {
    expect(new World(1, {}).features).toBeNull();
    expect(new World(1, { regionCount: BIOMES.length, startBiome: 'karst_peaks' }).features).toBeNull();
  });

  it('the stretches the director gives to landforms hold a cluster, the quiet ones among them; the coast and regions without recipes hold none', () => {
    let given = 0;
    let held = 0;
    let landforms = 0;
    let quiet = 0;
    for (const world of worlds) {
      const plan = world.spine.plan;
      for (let k = 0; k < (KM * 1000) / SLOT; k++) {
        const run = runAt(plan, k);
        const region = BIOMES[plan.biomes[run.chapter]];
        const n = world.features!.of(k).length;
        const wanted = (region.featureSlots ?? 0) > 0 && featureSlots(world.seed, { ...run, features: region.featureSlots ?? 0 }).includes(k);
        if (!wanted || world.sea.near(k) || world.sea.along(k)) {
          expect(n, `stretch ${k} of ${region.id}`).toBe(0);
          continue;
        }
        given++;
        landforms += n;
        if (n > 0) held++;
        // (a quiet stretch has no place to stop, no lake and no bridge; it may well have towers to drive past)
        if (n > 0 && world.quiet(k)) quiet++;
        // (a region asks for more stretches than it has room for: the director gives what there is, never its first stretch)
        expect(k).toBeGreaterThan(run.k0);
        expect(n).toBeLessThanOrEqual(12);
      }
    }
    expect(given).toBeGreaterThan(250);
    // (measured: every one of them; with the water plan's boxes for a test of water, seven in ten)
    expect(held / given).toBeGreaterThan(0.97);
    expect(landforms / given).toBeGreaterThan(4);
    expect(quiet).toBeGreaterThan(40);
  });

  it('every foot is clear of the road by CLEAR, along all of the road, and of the water', () => {
    const st = new SpineSample();
    const tp = new TerrainPoint();
    let n = 0;
    let nearest = Infinity;
    for (const world of worlds) {
      const sp = world.spine;
      for (let k = 0; k < (KM * 1000) / SLOT; k++) {
        for (const f of world.features!.of(k)) {
          n++;
          const reach = f.r * f.stretch;
          const sx = sp.sAtX(f.x);
          for (let s = Math.max(0, sx - 3000); s < sx + 3000; s += 4) {
            sp.at(s, st);
            const gap = Math.hypot(st.x - f.x, st.z - f.z) - reach;
            if (gap < nearest) nearest = gap;
          }
          // its box lies over the three stretches its height is read from
          expect(Math.floor(sp.sAtX(f.xMin) / SLOT)).toBeGreaterThanOrEqual(k - 1);
          expect(Math.floor(sp.sAtX(f.xMax) / SLOT)).toBeLessThanOrEqual(k + 1);
          // no water at its middle nor round its foot (one landform in six is looked at: the land is asked, and the places with it)
          if (n % 6 === 0) {
            for (let a = 0; a < 6.2; a += 0.52) {
              world.shape(f.x + Math.cos(a) * reach * 1.04, f.z + Math.sin(a) * reach * 1.04, tp);
              expect(tp.wl, `water at the foot of a ${f.kind} in stretch ${k}`).toBe(-Infinity);
            }
          }
        }
      }
    }
    expect(n).toBeGreaterThan(1200);
    expect(nearest).toBeGreaterThanOrEqual(CLEAR);
  });

  it('they are part of the land near the road, far from it and in the coarse land alike, and leave the road\'s corridor alone', () => {
    const world = worlds[2];
    const tp = new TerrainPoint();
    const tq = new TerrainPoint();
    const st = new SpineSample();
    let seen = 0;
    for (let k = 1; k < 80 && seen < 40; k++) {
      for (const f of world.features!.of(k)) {
        seen++;
        const s0 = world.spine.sAtX(f.x);
        const add = world.features!.heightAt(f.x, f.z, s0);
        expect(add).toBeGreaterThanOrEqual(f.h - 1e-9);
        // the fine land and the coarse land both carry it (they differ by the near relief and by what water does, not by the landform)
        world.shape(f.x, f.z, tp);
        world.shape(f.x, f.z, tq, true);
        expect(Math.abs(tp.bed - tq.bed)).toBeLessThan(20);
        expect(tp.bed - tp.roadY).toBeGreaterThan(f.h * 0.5);
        // and both say how much of the height is the landform's (for whoever paints its flank as rock); the relief does not count it
        expect(tp.landform).toBe(add);
        expect(tq.landform).toBe(add);
        expect(tp.bed - tp.roadY - tp.relief).toBeGreaterThan(add - 60);
        // half way down its flank, in the near field or the far: the same number as the plan's
        const hx = f.x + f.ca * f.r * f.stretch * 0.5;
        const hz = f.z + f.sa * f.r * f.stretch * 0.5;
        world.shape(hx, hz, tp);
        expect(tp.landform).toBe(world.features!.heightAt(hx, hz, world.spine.sAtX(hx)));
        expect(tp.landform).toBeGreaterThan(0);
        expect(tp.landform).toBeLessThan(add + 1e-9);
      }
    }
    expect(seen).toBeGreaterThanOrEqual(40);
    // within CLEAR of the centre line no landform adds anything
    for (let s = 500; s < 100_000; s += 211) {
      world.spine.at(s, st);
      for (const d of [-33, -20, 0, 20, 33]) {
        const x = st.x - Math.sin(st.phi) * d;
        const z = st.z + Math.cos(st.phi) * d;
        expect(world.features!.heightAt(x, z, world.spine.sAtX(x))).toBe(0);
        world.shape(x, z, tp);
        expect(tp.landform).toBe(0);
      }
    }
  });

  it('a terrain point says 0 for the landform in a world of version 1, and under the lands that are not the world', () => {
    const tp = new TerrainPoint();
    const old = new World(3, { regionCount: BIOMES.length, startBiome: 'karst_peaks' });
    for (const [x, z, coarse] of [[900, 40, false], [5000, -300, false], [9000, 2500, false], [9000, 2500, true]] as const) {
      tp.landform = 7;
      old.shape(x, z, tp, coarse);
      expect(tp.landform).toBe(0);
    }
    for (const land of [new FunctionLand(() => 2), new GroundLand(new FlatGround())]) {
      tp.landform = 7;
      land.shape(10, 10, tp);
      expect(tp.landform).toBe(0);
    }
  });
});

describe('world v2 · the road and land cards hold in worlds begun in each of the twelve regions', () => {
  const ROAD = ['spine_curvature_violations', 'spine_max_grade_pct', 'spine_max_heading_deg', 'spine_min_forward_cos', 'spine_min_radius_m', 'spine_determinism_mismatches'];
  const LAND = ['terrain_road_surface_errors', 'terrain_projection_errors', 'terrain_road_seam_gap_cm', 'terrain_max_kink_m', 'terrain_max_step_near_m'];
  // (All twelve meet the card. Two did not at first, and what was changed for them is version 2's alone:
  // a canyon's side gullies cut a fifth of its wall's height, where version 1 cuts half — the desert's
  // step near the road was 1.23 to 1.41 m per half metre against the card's 1.15, now 0.92 — and the red
  // canyon's walls are 85 m and its mesas begin 340 m from the road: 1.60 and a kink of 1.62, now 1.00
  // and 0.42. Measured over 40 worlds a region, 250 walks each.)
  for (const region of BIOMES) {
    it(`${region.id}: the road's rules, and the land beside it within the region`, () => {
      const road = spineChecks({ seeds: 12, road: { worldVersion: 2, startBiome: region.id } });
      const land = terrainChecks({ seeds: 3, world: { worldVersion: 2, startBiome: region.id }, reach: (w) => w.spine.plan.starts[1] - 300, cost: false });
      const m = { ...road, ...land };
      for (const key of [...ROAD, ...LAND]) {
        const t = card.metrics[key];
        expect(Number.isFinite(m[key]), `${key} was measured`).toBe(true);
        if (t.min !== undefined) expect(m[key], `${key} in a world begun in ${region.id}`).toBeGreaterThanOrEqual(t.min);
        if (t.max !== undefined) expect(m[key], `${key} in a world begun in ${region.id}`).toBeLessThanOrEqual(t.max);
      }
    });
  }
});

describe('world v2 · terraces and dunes in the real land', () => {
  it('terraces are level: most of a terraced slope between 34 and 300 m from the road is bench, the rest risers no height field cannot hold', () => {
    const st = new SpineSample();
    const tp = new TerrainPoint();
    const lp = new LandParams();
    let n = 0;
    let level = 0;
    let steep = 0;
    let steepest = 0;
    for (const seed of [1, 2, 3]) {
      const world = new World(seed, { worldVersion: 2, startBiome: 'terraces', chapterScale: 3 });
      const end = world.spine.plan.starts[1] - 800;
      for (let k = 1; (k + 1) * SLOT < end; k++) {
        const kind = world.land.kindOf(k);
        if (kind !== 'hillside' && kind !== 'valley') continue;
        for (let s = k * SLOT + 300; s < (k + 1) * SLOT - 300; s += 41) {
          if (world.land.at(s, lp).terrace < 0.999) continue;
          expect(lp.step).toBe(4);
          world.spine.at(s, st);
          for (const side of [-1, 1]) {
            for (let d = 36; d < 300; d += 9.7) {
              const x = st.x - Math.sin(st.phi) * d * side;
              const z = st.z + Math.cos(st.phi) * d * side;
              world.shape(x, z, tp);
              if (tp.wl > -1e8 || tp.site > 0 || Math.abs(tp.d) < 34) continue;
              const h0 = tp.bed;
              world.shape(x + 1, z, tp);
              const hx = tp.bed - h0;
              world.shape(x, z + 1, tp);
              const slope = Math.hypot(hx, tp.bed - h0);
              n++;
              if (slope < 0.03) level++;
              if (slope > MAX_SLOPE) steep++;
              if (slope > steepest) steepest = slope;
            }
          }
        }
      }
    }
    expect(n).toBeGreaterThan(20000);
    // (measured: 57 % of a hillside and 58 % of a valley side is bench under 3 %; cut in the height above
    // the road instead of the land's own, 47 % and 52 %: such benches climb with the road)
    expect(level / n).toBeGreaterThan(0.52);
    // (measured: the steepest riser in 113,000 points 2.35 in 1, two points over two in one)
    expect(steep / n).toBeLessThan(0.0005);
    expect(steepest).toBeLessThan(2.6);
  });

  it('a world of version 1 that knows the same regions has neither terraces nor dunes, and its canyons keep their deep side gullies', () => {
    const lp = new LandParams();
    for (const start of ['terraces', 'desert']) {
      const world = new World(3, { regionCount: BIOMES.length, startBiome: start, chapterScale: 3 });
      const v2 = new World(3, { worldVersion: 2, startBiome: start, chapterScale: 3 });
      for (let k = 0; k < 16; k++) {
        world.land.at((k + 0.5) * SLOT, lp);
        expect(lp.terrace).toBe(0);
        expect(lp.dune).toBe(0);
        expect(lp.gully).toBe(0.5);
        expect(v2.land.at((k + 0.5) * SLOT, lp).gully).toBe(GULLY_V2);
      }
    }
    expect(GULLY_V2).toBeLessThan(0.5);
  });

  it('the desert\'s open stretches carry dunes in version 2: the land beside the road stands higher there, by no more than their height', () => {
    const lp = new LandParams();
    const st = new SpineSample();
    const tp = new TerrainPoint();
    const tq = new TerrainPoint();
    const dunes = new World(3, { worldVersion: 2, startBiome: 'desert', chapterScale: 3 });
    let open = 0;
    let top = 0;
    let sum = 0;
    let n = 0;
    const end = dunes.spine.plan.starts[1] - 800;
    for (let k = 1; (k + 1) * SLOT < end; k++) {
      dunes.land.at((k + 0.5) * SLOT, lp);
      if (dunes.land.kindOf(k) !== 'open') {
        expect(lp.dune).toBe(0);
        continue;
      }
      open++;
      expect(lp.dune).toBe(7);
      expect(lp.duneLen).toBe(95);
      // the coarse land is the fine land without its near relief and with the dunes' mean for the dunes
      for (let s = k * SLOT + 300; s < (k + 1) * SLOT - 300; s += 53) {
        dunes.spine.at(s, st);
        for (const d of [-700, -400, 400, 700]) {
          const x = st.x - Math.sin(st.phi) * d;
          const z = st.z + Math.cos(st.phi) * d;
          dunes.shape(x, z, tp);
          dunes.shape(x, z, tq, true);
          if (tp.wl > -1e8) continue;
          const over = tp.bed - tq.bed;
          sum += over;
          n++;
          if (over > top) top = over;
        }
        // on the pavement and the shoulder nothing has changed
        dunes.shape(st.x, st.z, tp);
        expect(tp.zone).toBe(1);
        expect(Math.abs(tp.h - st.y)).toBeLessThan(1e-6);
      }
    }
    expect(open).toBeGreaterThan(3);
    // (fine less coarse: the near relief, a few metres either way, and the dunes less their mean: within the dunes' height)
    expect(top).toBeLessThan(7 * 0.64 + 6);
    expect(Math.abs(sum / n)).toBeLessThan(1.5);
  });
});

describe('world v2 · what the height function costs', () => {
  it('no more than the design allows over version 1, where it does most: beside a terraced slope and among dunes', () => {
    const st = new SpineSample();
    const tp = new TerrainPoint();
    const N = 12000;
    const points = (world: World): Float64Array => {
      const end = world.spine.plan.starts[1] - 600;
      for (let s = 0; s < end; s += 60) {
        world.spine.at(s, st);
        world.shape(st.x, st.z + 30, tp);
      }
      const a = new Float64Array(N * 2);
      for (let i = 0; i < N; i++) {
        world.spine.at(1300 + ((i * 7919) % (end - 1300)), st);
        const d = (i & 1 ? 1 : -1) * (40 + ((i * 13) % 160));
        a[2 * i] = st.x - Math.sin(st.phi) * d;
        a[2 * i + 1] = st.z + Math.cos(st.phi) * d;
      }
      return a;
    };
    const time = (world: World, a: Float64Array): number => {
      const t0 = performance.now();
      let acc = 0;
      for (let i = 0; i < N; i++) {
        world.shape(a[2 * i], a[2 * i + 1], tp);
        acc += tp.h;
      }
      expect(Number.isFinite(acc)).toBe(true);
      return ((performance.now() - t0) * 1000) / N;
    };
    for (const start of ['terraces', 'desert', 'karst_peaks']) {
      // (the same region for both: a world of version 1 that knows the whole registry begins in any of them)
      const v1 = new World(4242, { regionCount: BIOMES.length, startBiome: start, chapterScale: 3 });
      const v2 = new World(4242, { worldVersion: 2, startBiome: start, chapterScale: 3 });
      const p1 = points(v1);
      const p2 = points(v2);
      // The design allows 0.3 µs a call. Measured on a quiet machine (µs a call, version 1 → version 2):
      // terraces 0.80 → 1.03 at 40 m from the road and 0.98 → 1.28 at 150 m, the desert's dunes
      // 0.66 → 0.83, karst 0.76 → 0.85. A busy machine makes every call slower by the same share, so the
      // limit is a share too (half as much again, where the worst measured is three tenths more), taken
      // from the best of many rounds of each in turn.
      let best1 = Infinity;
      let best2 = Infinity;
      for (let round = 0; round < 40; round++) {
        best1 = Math.min(best1, time(v1, p1));
        best2 = Math.min(best2, time(v2, p2));
        if (round >= 8 && best2 < best1 * 1.4) break;
      }
      expect(best2, `${start}: ${best1.toFixed(3)} µs in version 1, ${best2.toFixed(3)} µs in version 2`).toBeLessThan(best1 * 1.5);
    }
  });
});

describe('world v2 · a journey', () => {
  it('300 km of six seeds: every kind of country, a quiet run in every region, a filling station within a tank, towers in karst country', () => {
    const js = [1, 2, 3, 4, 5, 6].map((seed) => journey(seed, 300));
    const sums = journeySums(js);
    expect(sums.kindsMin).toBeGreaterThanOrEqual(11);
    expect(sums.regionsWithoutQuiet).toBe(0);
    // seven to nine and a half minutes a region at 65 km/h
    expect(sums.minutesMin).toBeGreaterThan(6.5);
    expect(sums.minutesMax).toBeLessThan(9.5);
    // mostly calm, about a third scenic (there is no highlight region yet)
    expect(sums.byIntensity.calm / sums.regions).toBeGreaterThan(0.55);
    expect(sums.byIntensity.scenic / sums.regions).toBeGreaterThan(0.25);
    // what version 1's cards ask of a journey holds here too
    expect(sums.firstStationKmMax).toBeLessThan(12);
    expect(sums.stationGapKmMax).toBeLessThan(30);
    expect((sums.places / sums.stretches) * 8).toBeGreaterThan(2.8);
    expect((sums.lakes / sums.stretches) * 8).toBeGreaterThan(1.0);
    expect((sums.rivers / sums.stretches) * 8).toBeGreaterThan(0.6);
    // clusters: as many stretches of a region as it asks for (karst country five, the red canyon three)
    const legs = js.flatMap((j) => j.legs);
    const karst = legs.filter((l) => l.id === 'karst_peaks');
    const canyon = legs.filter((l) => l.id === 'red_canyon');
    expect(karst.length).toBeGreaterThan(10);
    expect(canyon.length).toBeGreaterThan(10);
    for (const l of karst) expect(l.clusters, `karst region of ${l.stretches} stretches: ${l.programme}`).toBe(5);
    for (const l of canyon) expect(l.clusters, `red canyon of ${l.stretches} stretches: ${l.programme}`).toBe(3);
    expect(karst.reduce((a, l) => a + l.landforms, 0) / karst.length).toBeGreaterThan(30);
  });
});
