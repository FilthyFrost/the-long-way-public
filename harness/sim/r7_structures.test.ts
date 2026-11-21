// Milestone R7 (docs/V3/nodes/R7-wrapup.md): the scenic roads' structures and the river beside the road in world
// version 5 — viaducts over ravines, galleries, tunnels and avalanche sheds on the shelves, the river along the
// river roads and the valley roads — and the shelf's mountainside fading in across its blend; version 4 untouched.
import { describe, expect, it } from 'vitest';
import { BIOMES } from '../../src/core/world/biomes';
import { LandParams } from '../../src/core/world/landform';
import { SpineSample } from '../../src/core/world/spine';
import { TerrainPoint, World } from '../../src/core/world/terrain';
import { WaterPlan, type Stream } from '../../src/core/world/water';

const q = new SpineSample();
const tp = new TerrainPoint();
/** the land's height above the road across it at arc length s, `d` metres to the right (negative: left); the land drawn (bed) */
const across = (w: World, s: number, d: number): number => {
  w.spine.at(s, q);
  w.shape(q.x - Math.sin(q.phi) * d, q.z + Math.cos(q.phi) * d, tp);
  return tp.bed - q.y;
};

describe('the scenic roads\' structures (world version 5)', () => {
  it('crosses its ravines on viaducts: the stream tens of metres below the deck, the land meeting the road at each end', () => {
    let want = 0;
    let built = 0;
    for (const seed of [1, 2, 7]) {
      const w = new World(seed, { worldVersion: 5 });
      const j = w.earth!;
      for (let c = 1; c < 36; c++) {
        j.chapter(c);
        const p = j.pieces[c];
        const def = BIOMES[p.region];
        if (!def.viaducts) continue;
        want++;
        const f = w.water.feature(Math.round(p.start / 1250) + def.viaducts[0]);
        if (!f || f.kind !== 'river' || f.wall === undefined) continue;
        built++;
        expect(f.clear, `${seed}:${c}`).toBeGreaterThan(25);
        expect(['arch', 'beam']).toContain(f.bridge);
        // the stream far below the deck at the crossing, the land at the abutments level with the road
        expect(across(w, f.s, 0), `${seed}:${c} under the deck`).toBeLessThan(-20);
        for (const s of [f.span0 - 3, f.span1 + 3]) expect(Math.abs(across(w, s, 0)), `${seed}:${c} at ${Math.round(s - f.s)}`).toBeLessThan(1.5);
      }
    }
    expect(want).toBeGreaterThanOrEqual(6);
    expect(built / want).toBeGreaterThanOrEqual(0.8);
  });

  it('runs its shelves under the rock: a gallery, a tunnel or a shed, on a shelf, with no place and no chevron in it', () => {
    let want = 0;
    let built = 0;
    for (const seed of [1, 2, 7, 11]) {
      const w = new World(seed, { worldVersion: 5 });
      const j = w.earth!;
      for (let c = 1; c < 40; c++) {
        j.chapter(c);
        const p = j.pieces[c];
        const def = BIOMES[p.region];
        if (!def.galleries) continue;
        want++;
        const k = Math.round(p.start / 1250) + def.galleries[0];
        const g = w.galleries.at(k);
        if (!g) continue;
        built++;
        expect(w.land.kindOf(k)).toBe('shelf');
        expect(g.kind).toBe(def.gallery);
        expect(g.side).toBe(w.land.sideOf(k));
        expect(g.s1 - g.s0).toBeGreaterThan(100);
        const sites: { s: number }[] = [];
        w.sites.between(g.s0 - 200, g.s1 + 200, sites as never[]);
        for (const st of sites) expect(st.s < g.s0 - 20 || st.s > g.s1 + 20, `${seed}:${c} a place at ${Math.round(st.s)} in ${Math.round(g.s0)}–${Math.round(g.s1)}`).toBe(true);
        // its walls are solids on the road's edges
        const solids: { tag: string }[] = [];
        w.spine.at((g.s0 + g.s1) / 2, q);
        w.furniture.solidsNear(q.x, q.z, 12, solids as never[]);
        expect(solids.some((sd) => sd.tag === 'road:wall'), `${seed}:${c} its walls`).toBe(true);
      }
    }
    expect(want).toBeGreaterThanOrEqual(4);
    expect(built / want).toBeGreaterThanOrEqual(0.6);
  });

  it('runs a river beside the river roads and the valley roads: its water by the road, the road dry', () => {
    let want = 0;
    let built = 0;
    const sg = { g: 0, dg: 0 };
    for (const seed of [1, 2, 7]) {
      const w = new World(seed, { worldVersion: 5 });
      const j = w.earth!;
      for (let c = 1; c < 40; c++) {
        j.chapter(c);
        const p = j.pieces[c];
        const def = BIOMES[p.region];
        if (!def.streams) continue;
        for (const off of def.streams) {
          want++;
          const f = w.water.feature(Math.round(p.start / 1250) + off);
          if (!f || f.kind !== 'stream') continue;
          built++;
          const st = f as Stream;
          for (const s of [st.s0 + 150, st.s, st.s1 - 150]) {
            WaterPlan.streamGap(st, s, sg);
            const mid = st.side * (sg.g + WaterPlan.streamWidth(st, s) / 2);
            w.spine.at(s, q);
            w.shape(q.x - Math.sin(q.phi) * mid, q.z + Math.cos(q.phi) * mid, tp);
            expect(tp.wl - tp.bed, `${seed}:${c} its water at ${Math.round(s)}`).toBeGreaterThan(0.8);
            expect(sg.g).toBeGreaterThan(10);
            // the road and its shoulders stay dry and level
            w.shape(q.x, q.z, tp);
            expect(tp.wl > tp.h).toBe(false);
            expect(Math.abs(tp.h - q.y)).toBeLessThan(0.05);
          }
        }
      }
    }
    expect(want).toBeGreaterThanOrEqual(6);
    expect(built).toBe(want);
  });

  it('fades a shelf\'s mountainside in across its blend: no cliff where the blend begins', () => {
    let seen = 0;
    const lp = new LandParams();
    for (const seed of [1, 2, 7]) {
      const w = new World(seed, { worldVersion: 5 });
      for (let k = 2; k < 160 && seen < 6; k++) {
        if (w.land.kindOf(k) !== 'shelf' || w.land.kindOf(k - 1) === 'shelf') continue;
        seen++;
        const high = w.land.sideOf(k);
        // across the blend into the shelf, 400 m out on its high side, a few metres apart along the road: the land's
        // slope from one point to the next (rise over the run between them) never a cliff's
        let px = NaN;
        let pz = NaN;
        let ph = NaN;
        let worst = 0;
        for (let s = k * 1250 - 260; s <= k * 1250 + 260; s += 4) {
          w.land.at(s, lp);
          w.spine.at(s, q);
          const d = high * 400;
          const x = q.x - Math.sin(q.phi) * d;
          const z = q.z + Math.cos(q.phi) * d;
          w.shape(x, z, tp);
          if (ph === ph) {
            const run = Math.hypot(x - px, z - pz);
            if (run > 1) worst = Math.max(worst, Math.abs(tp.bed - ph) / run);
          }
          px = x;
          pz = z;
          ph = tp.bed;
        }
        expect(worst, `${seed} stretch ${k}`).toBeLessThan(2.6);
      }
    }
    expect(seen).toBeGreaterThanOrEqual(3);
  });

  it('leaves a world of version 4 as it was: no viaduct, no gallery, no river beside the road', () => {
    const w = new World(7, { worldVersion: 4 });
    const end = 30 * 5000;
    expect(w.galleries.between(0, end, [])).toEqual([]);
    for (const f of w.water.between(0, end, [])) {
      expect(f.kind).not.toBe('stream');
      if (f.kind === 'river') expect(f.wall).toBeUndefined();
    }
  });
});
