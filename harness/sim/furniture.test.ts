/**
 * The road's edge furniture: the outside of a bend is the outside, bridges are railed up to their
 * spans, nothing stands on a place's ground or in the lane, and every player gets the same.
 */
import { describe, expect, it } from 'vitest';
import { Furniture, RAIL_AT, type RailRun, type RoadPost } from '../../src/core/world/furniture';
import type { Solid } from '../../src/core/world/solids';
import { SpineSample } from '../../src/core/world/spine';
import { DECK_PROUD, PIER_JOINT_DEPTH, TerrainPoint, World } from '../../src/core/world/terrain';
import type { River } from '../../src/core/world/water';
import { RobotDriver } from '../../src/core/driver/robot';
import { VehicleSim } from '../../src/core/vehicle/sim';
import { T0_TRUCK } from '../../src/core/vehicle/spec';

describe('road furniture', () => {
  const st = new SpineSample();
  const a = new SpineSample();
  const b = new SpineSample();
  const tp = new TerrainPoint();

  it('the outside of a bend is the side the road turns away from', () => {
    const world = new World(5, { startBiome: 'alpine' });
    let checked = 0;
    for (let s = 200; s < 6000; s += 7) {
      world.spine.at(s, st);
      if (Math.abs(st.kappa) < 1 / 150) continue;
      world.spine.at(s - 12, a);
      world.spine.at(s + 12, b);
      // on the outside the chord from before to after passes further from the point
      const side = Furniture.outer(st.kappa);
      const px = st.x - Math.sin(st.phi) * side * 5;
      const pz = st.z + Math.cos(st.phi) * side * 5;
      const qx = st.x + Math.sin(st.phi) * side * 5;
      const qz = st.z - Math.cos(st.phi) * side * 5;
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      expect(Math.hypot(px - mx, pz - mz)).toBeGreaterThan(Math.hypot(qx - mx, qz - mz));
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('rails lead up to every bridge, stand at the road edge, and keep off bridges and places; posts and stones come as planned', () => {
    let rails = 0;
    let delineators = 0;
    let chevrons = 0;
    let stones = 0;
    let km = 0;
    for (const [seed, biome] of [[3, 'plains'], [4, 'alpine'], [5, 'desert'], [6, 'forest']] as const) {
      const world = new World(seed, { startBiome: biome });
      const posts: RoadPost[] = [];
      const runs: RailRun[] = [];
      world.furniture.between(0, 16000, posts, runs);
      km += 16;
      for (const p of posts) {
        if (p.kind === 'delineator') delineators++;
        else if (p.kind === 'chevron') chevrons++;
        else stones++;
        world.shape(p.x, p.z, tp);
        expect(Math.abs(tp.d)).toBeGreaterThan(4.0);
        expect(tp.site).toBeLessThan(0.06);
      }
      for (const r of runs) {
        rails += r.s1 - r.s0;
        expect(r.s1 - r.s0).toBeGreaterThanOrEqual(4);
      }
      const probe = { river: null as unknown, mask: 0 };
      for (const f of world.water.between(0, 16000, [])) {
        if (f.kind !== 'river') continue;
        for (const side of [-1, 1]) {
          expect(runs.some((r) => r.side === side && r.s0 <= f.span0 - 14 && r.s1 >= f.span0 - 6)).toBe(true);
          expect(runs.some((r) => r.side === side && r.s0 <= f.span1 + 6 && r.s1 >= f.span1 + 14)).toBe(true);
        }
      }
      const solids: Solid[] = [];
      for (let s = 100; s < 16000; s += 40) {
        world.spine.at(s, st);
        solids.length = 0;
        world.furniture.solidsNear(st.x, st.z, 24, solids);
        for (const sd of solids) {
          world.shape(sd.x, sd.z, tp);
          if (sd.tag === 'road:rail') {
            expect(Math.abs(Math.abs(tp.d) - RAIL_AT)).toBeLessThan(0.35);
            world.water.bridgeAt(tp.s, probe as never);
            expect(probe.mask).toBeLessThan(0.97);
          }
          expect(tp.site).toBeLessThan(0.3);
        }
      }
    }
    // about forty delineators to the kilometre where nothing is missing; a stone every kilometre
    expect(delineators / km).toBeGreaterThan(14);
    expect(delineators / km).toBeLessThan(75);
    expect(stones).toBeGreaterThanOrEqual(km - 8);
    expect(chevrons).toBeGreaterThan(5);
    // rails along a part of the road, not all of it (both edges counted): none on the open plain,
    // one metre in twenty in the mountains
    expect(rails / (km * 2000)).toBeGreaterThan(0.012);
    expect(rails / (km * 2000)).toBeLessThan(0.45);
  });

  it('is the same road for everybody', () => {
    const one = new World(9, { startBiome: 'plains' });
    const two = new World(9, { startBiome: 'plains' });
    const p1: RoadPost[] = [];
    const r1: RailRun[] = [];
    const p2: RoadPost[] = [];
    const r2: RailRun[] = [];
    two.furniture.between(6000, 9000, [], []);
    one.furniture.between(0, 9000, p1, r1);
    two.furniture.between(0, 9000, p2, r2);
    expect(p1.map((p) => [p.kind, p.s, p.side, p.state])).toEqual(p2.map((p) => [p.kind, p.s, p.side, p.state]));
    expect(r1).toEqual(r2);
  });
  it('a bridge is felt: the deck stands proud at either end, a beam bridge has a joint over every pier, and none of it can pinch a tyre', () => {
    // one bridge of each kind, wherever the seeds have them
    const found = new Map<string, { world: World; f: River }>();
    for (let seed = 1; seed <= 40 && found.size < 3; seed++) {
      for (const biome of ['plains', 'alpine', 'forest'] as const) {
        const world = new World(seed, { startBiome: biome });
        for (const f of world.water.between(1500, 16000, [])) if (f.kind === 'river' && !found.has(f.bridge)) found.set(f.bridge, { world, f });
      }
    }
    expect([...found.keys()].sort()).toEqual(['arch', 'beam', 'truss']);
    for (const [kind, { world, f }] of found) {
      // the profile itself
      expect(World.deckJoints(f, f.span0 - 1)).toBe(0);
      expect(World.deckJoints(f, f.span1 + 1)).toBe(0);
      expect(World.deckJoints(f, f.span0 + 2)).toBeCloseTo(DECK_PROUD, 6);
      let lowest = Infinity;
      for (let q = f.span0 + 1; q < f.span1 - 1; q += 0.02) lowest = Math.min(lowest, World.deckJoints(f, q));
      if (kind === 'beam') expect(lowest).toBeCloseTo(DECK_PROUD - PIER_JOINT_DEPTH, 3);
      else expect(lowest).toBeCloseTo(DECK_PROUD, 6);
      // …and under the wheels at 60 km/h: thumps on the bridge that the road before it does not give
      const lane = 1.6;
      const start = f.span0 - 320;
      world.spine.at(start, st);
      const v = new VehicleSim(T0_TRUCK);
      v.reset(st.x - Math.sin(st.phi) * lane, st.y, st.z + Math.cos(st.phi) * lane, -st.phi);
      const robot = new RobotDriver({ cruise: 60 / 3.6, lane, latG: 0.28 });
      robot.s = start;
      let before = 0;
      let on = 0;
      let hardest = 0;
      let seen = v.feel.thumps;
      for (let t = 0; t < 90 && robot.s < f.span1 + 40; t += v.h) {
        v.substep(robot.update(v.h, v, world.spine), world);
        expect(v.exploded).toBe(false);
        if (v.feel.thumps !== seen) {
          seen = v.feel.thumps;
          if (robot.s > f.span0 - 12 && robot.s < f.span1 + 12) {
            on++;
            if (v.feel.lastThump > hardest) hardest = v.feel.lastThump;
          } else if (robot.s > f.span0 - 200 && robot.s < f.span0 - 12) before++;
        }
      }
      expect(robot.s).toBeGreaterThan(f.span1 + 30);
      // (both axles at both ends; a wheel may miss one when its step straddles the ramp)
      expect(on - before, `${kind} bridge: thumps on it ${on}, on the road before ${before}`).toBeGreaterThanOrEqual(kind === 'beam' ? 4 : 2);
      expect(hardest).toBeLessThan(3);
    }
  });
});
