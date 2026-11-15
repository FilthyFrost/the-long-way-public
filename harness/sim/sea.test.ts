/**
 * The sea: a chapter of lake country may have it along one side. Where the road runs on the shore
 * the water is always below it, the beach meets the tide exactly and the sea bed goes down to the
 * deep; elsewhere the coast lies kilometres off and the sea beyond it runs to the horizon; nothing
 * else wet is put where it would have to share the sea's level; and the shore comes and goes without
 * a step in the land.
 */
import { describe, expect, it } from 'vitest';
import { LAND_SLOT } from '../../src/core/world/landform';
import { COAST_FADE, SEA_DEPTH, SEA_END, SeaPlan, type Coast } from '../../src/core/world/sea';
import type { Site } from '../../src/core/world/sites';
import { SpineSample } from '../../src/core/world/spine';
import { TerrainPoint, World } from '../../src/core/world/terrain';

const OPTS = { chapterScale: 2.5, startBiome: 'lakes' } as const;

function seas(): { world: World; c: Coast }[] {
  const out: { world: World; c: Coast }[] = [];
  for (let seed = 1; seed <= 40 && out.length < 6; seed++) {
    const world = new World(seed, OPTS);
    for (const c of world.sea.between(0, 24000, [])) out.push({ world, c });
  }
  return out;
}

describe('sea', () => {
  const found = seas();
  const st = new SpineSample();
  const tp = new TerrainPoint();
  /** the land `L` metres out to sea from the road point at s (asked by x, as the plan measures) */
  const at = (world: World, c: Coast, s: number, L: number, coarse = false): TerrainPoint => {
    world.spine.at(s, st);
    world.shape(st.x, st.z + (c.side * L) / Math.cos(st.phi), tp, coarse);
    return tp;
  };

  it('a sea has one or two runs of two to four stretches, apart from each other, never at the very start', () => {
    expect(found.length).toBeGreaterThanOrEqual(4);
    let two = 0;
    for (const { c } of found) {
      expect(c.runs.length).toBeGreaterThanOrEqual(1);
      expect(c.runs.length).toBeLessThanOrEqual(2);
      if (c.runs.length === 2) two++;
      for (const r of c.runs) {
        expect(r.k1 - r.k0 + 1).toBeGreaterThanOrEqual(2);
        expect(r.k1 - r.k0 + 1).toBeLessThanOrEqual(4);
        expect(r.k0).toBeGreaterThanOrEqual(3);
        expect(r.s0).toBeGreaterThan(c.s0);
        expect(r.s1).toBeLessThan(c.s1);
      }
      if (c.runs.length === 2) expect(c.runs[1].k0 - c.runs[0].k1).toBeGreaterThanOrEqual(3);
    }
    expect(two).toBeGreaterThanOrEqual(1);
  });

  it('the road looks down on the water along every run; no lake by a run, no river along a sea', () => {
    for (const { world, c } of found) {
      for (const r of c.runs) {
        for (let s = r.s0; s <= r.s1; s += 25) {
          world.spine.at(s, st);
          expect(st.y - c.level).toBeGreaterThan(4.9);
        }
        for (let k = r.k0 - 1; k <= r.k1 + 1; k++) expect(world.water.feature(k)).toBeNull();
      }
      for (let k = Math.floor(c.s0 / LAND_SLOT); k <= Math.floor(c.s1 / LAND_SLOT); k++) expect(world.water.feature(k)?.kind).not.toBe('river');
    }
  });

  it('along a run: beach, waterline, shelf and deep lie where the plan says, on the sea side only, and the strip is kept open', () => {
    for (const { world, c } of found) {
      for (const r of c.runs) {
        for (let s = r.s0 + COAST_FADE + 20; s <= r.s1 - COAST_FADE - 20; s += 90) {
          const D = SeaPlan.shoreAt(c, s);
          expect(D).toBeGreaterThan(45);
          expect(D).toBeLessThan(260);
          expect(at(world, c, s, D - 12).bed).toBeGreaterThan(c.level);
          expect(at(world, c, s, D - 12).bed).toBeLessThan(c.level + 2.6);
          // between the road and the beach the land never dips under the tide
          for (let L = 20; L < D - 2; L += 9) expect(at(world, c, s, L).bed).toBeGreaterThan(c.level);
          expect(at(world, c, s, D + 60).bed).toBeLessThan(c.level - 1.2);
          expect(at(world, c, s, D + 60).wkind).toBe(3);
          expect(at(world, c, s, D + 60).wl).toBe(c.level);
          expect(at(world, c, s, D + 700).bed).toBeCloseTo(c.level - SEA_DEPTH, 1);
          // the far ring's coarse land agrees: the sea runs to the horizon
          expect(at(world, c, s, 9000, true).bed).toBeCloseTo(c.level - SEA_DEPTH, 1);
          expect(tp.wl).toBe(c.level);
          // the other side of the road knows nothing of it
          expect(at(world, c, s, -200).wkind).not.toBe(3);
          expect(world.sea.open(s, c.side * 40)).toBe(1);
          expect(world.sea.open(s, -c.side * 40)).toBe(0);
        }
      }
    }
  });

  it('away from the runs the coast lies kilometres off, the land between is left as it was, and the sea beyond runs to the horizon', () => {
    let checked = 0;
    for (const { world, c } of found) {
      for (let s = c.s0 + SEA_END; s <= c.s1 - SEA_END; s += 130) {
        if (SeaPlan.weight(c, s) > 0) continue;
        const D = SeaPlan.shoreAt(c, s);
        expect(D).toBeGreaterThan(1200);
        expect(D).toBeLessThan(3600);
        expect(world.sea.open(s, c.side * 40)).toBe(0);
        // near the road: no sea, and the height is what the land alone gives
        expect(at(world, c, s, 300).wkind).not.toBe(3);
        expect(at(world, c, s, D - 900).wl).toBe(-Infinity);
        // the last of the land stands above the tide, the water beyond is the sea
        expect(at(world, c, s, D - 15).bed).toBeGreaterThan(c.level);
        expect(at(world, c, s, D + 80).wkind).toBe(3);
        expect(at(world, c, s, D + 80).bed).toBeLessThan(c.level - 1.2);
        expect(at(world, c, s, D + 900).bed).toBeCloseTo(c.level - SEA_DEPTH, 1);
        expect(at(world, c, s, 15000, true).bed).toBeCloseTo(c.level - SEA_DEPTH, 1);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('the land comes down to a far coast as a slope, not a wall', () => {
    for (const { world, c } of found) {
      for (let s = c.s0 + 600; s <= c.s1 - 600; s += 170) {
        const D = SeaPlan.shoreAt(c, s);
        if (D < 600 || D > 9000) continue;
        let prev = NaN;
        for (let L = D - 260; L <= D + 80; L += 3) {
          const h = at(world, c, s, L).bed;
          if (prev === prev) expect(Math.abs(h - prev), `s = ${s}, L = ${L.toFixed(0)}`).toBeLessThan(6.6);
          prev = h;
        }
      }
    }
  });

  it('the shore comes in to the road and leaves it without a step in the land', () => {
    for (const { world, c } of found) {
      for (const L of [60, 150, 400]) {
        let prev = NaN;
        let worst = 0;
        for (let s = c.s0 - 300; s <= c.s1 + 300; s += 2) {
          world.spine.at(s, st);
          world.shape(st.x, st.z + (c.side * L) / Math.cos(st.phi), tp);
          if (prev === prev) worst = Math.max(worst, Math.abs(tp.bed - prev));
          prev = tp.bed;
        }
        // two metres along the road: a bluff may be steep, a wall it is not
        expect(worst, `L = ${L}`).toBeLessThan(3.2);
      }
    }
  });

  it('every coast run has its lighthouse on the sea side: a cottage to search, the tower above the tide, a pier out to water deep enough to fish', () => {
    let n = 0;
    for (const { world, c } of found) {
      for (const r of c.runs) {
        const sites: Site[] = world.sites.between(r.s0, r.s1, []);
        const lights = sites.filter((q) => q.kind === 'lighthouse');
        expect(lights.length, `run ${r.k0}–${r.k1}`).toBe(1);
        const site = lights[0];
        n++;
        expect(site.side).toBe(c.side);
        // where the shore is fully at the road
        expect(SeaPlan.weight(c, site.s)).toBeGreaterThan(0.98);
        const tower = site.objects.find((o) => o.kind === 'lighthouse')!;
        const pier = site.objects.find((o) => o.kind === 'jetty')!;
        expect(tower).toBeDefined();
        expect(pier).toBeDefined();
        expect(tower.y - c.level).toBeGreaterThan(2);
        expect(tower.h).toBeGreaterThanOrEqual(19);
        // nobody drives or walks through it
        expect(site.solids.some((sd) => sd.round && Math.hypot(sd.x - tower.x, sd.z - tower.z) < 0.01 && sd.hx > 2.5)).toBe(true);
        // the pier: its deck clear of the water, its seaward end over a fathom of it, its landward end ashore
        expect(pier.y - c.level).toBeCloseTo(0.8, 5);
        const ex = Math.cos(pier.yaw);
        const ez = Math.sin(pier.yaw);
        world.shape(pier.x + ex * (pier.w / 2 - 0.5), pier.z + ez * (pier.w / 2 - 0.5), tp);
        expect(tp.wkind).toBe(3);
        expect(tp.wl - tp.bed).toBeGreaterThan(0.75);
        world.shape(pier.x - ex * (pier.w / 2 + 0.6), pier.z - ez * (pier.w / 2 + 0.6), tp);
        expect(tp.bed).toBeGreaterThan(c.level - 0.05);
        // the fishing ground beyond its end is the sea
        world.shape(site.zoneX, site.zoneZ, tp);
        expect(tp.wkind).toBe(3);
        expect(tp.wl - tp.bed).toBeGreaterThan(0.9);
        expect(site.zoneR).toBeGreaterThan(10);
        expect(site.containers.length).toBeGreaterThanOrEqual(4);
        expect(site.objects.filter((o) => o.kind === 'building').length).toBe(1);
      }
    }
    expect(n).toBeGreaterThanOrEqual(4);
  });

  it('is the same sea whoever asks first', () => {
    const a = new World(found[0].world.seed, OPTS);
    a.heightAt(90000, 0);
    const again = a.sea.between(0, 24000, []);
    const sig = (c: Coast): unknown[] => [c.chapter, c.side, c.level, c.s0, c.s1, c.runs.map((r) => [r.k0, r.k1])];
    expect(again.map(sig)).toContainEqual(sig(found[0].c));
  });
});
