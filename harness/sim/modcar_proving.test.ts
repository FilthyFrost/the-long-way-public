/**
 * The proving ground (src/core/modcar/proving/layout.ts, docs/MODCAR.md §28): levelled out of the land behind the
 * workshop; what is drawn over the land meets it at its edges and the land never stands through it; the features
 * are what they say (the twister lifts one side as it drops the other, the ramps climb at their grades); the
 * surfaces; the grass grows between the drawn ground and not through it.
 */
import { describe, expect, it } from 'vitest';
import { GroundSample, Surface } from '../../src/core/world/ground';
import { TerrainPoint } from '../../src/core/world/terrain';
import {
  HILL,
  KM_U,
  LOGS,
  LOOP,
  LOOP_CORRIDOR,
  LOOP_LEN,
  loopAt,
  loopProject,
  PAD,
  PG,
  ProvingGround,
  provingAt,
  ProvingPoint,
  SECTIONS,
  SKIDPAD,
  SLALOM,
  START_X,
  STRAIGHT,
  TURN,
} from '../../src/core/modcar/proving/layout';
import { modcarWorld } from '../../src/game/modcar/seamless';

const made = modcarWorld(4242, {});
const world = made.world;
const pg = new ProvingGround(made.level, world);
const gs = new GroundSample();
const tp = new TerrainPoint();
const at = (x: number, z: number): GroundSample => {
  pg.sample(x, z, gs);
  return gs;
};
const land = (x: number, z: number): number => {
  world.shape(x, z, tp);
  return tp.h;
};

describe('modcar · the proving ground', () => {
  it('is levelled at the height of the land it is cut out of', () => {
    for (const seed of [7, 1234, 98765, 4242]) {
      const m = modcarWorld(seed, {});
      // (well inside: the land there is the level, give or take the unevenness the wheels feel)
      const g = new ProvingGround(m.level, m.world);
      expect(Math.abs(g.heightAt(-1700, 0) - m.level)).toBeLessThan(1e-6);
      expect(Math.abs(g.heightAt(-1700, -150) - m.level)).toBeLessThan(1e-6);
    }
    expect(Number.isFinite(made.level)).toBe(true);
  });

  it('what is drawn meets the land at its edges, and the land never stands through it', () => {
    const steps: [number, number, number, number][] = [
      // (x, z, across x, across z): out of the straight's +z edge, the pad's far edge, the apron, the turning circle
      [-1700, STRAIGHT.half, 0, 1],
      [-1200, PAD.z0, 0, -1],
      [PAD.x0, -100, -1, 0],
      [TURN.x - TURN.r, 0, -1, 0],
      // (out of the loop's corridor, both sides of a leg, and on the far arc)
      [-1200, LOOP.zOut + LOOP_CORRIDOR, 0, 1],
      [-1200, LOOP.zOut - LOOP_CORRIDOR, 0, -1],
      [LOOP.xFar - (LOOP.zBack - LOOP.zOut) / 2 - LOOP_CORRIDOR, (LOOP.zBack + LOOP.zOut) / 2, -1, 0],
    ];
    for (const [x, z, ax, az] of steps) {
      // (the drawn ground's height just inside, the land's just outside: what the meshes are made to)
      const inside = pg.heightAt(x - ax * 0.02, z - az * 0.02);
      const outside = land(x + ax * 0.02, z + az * 0.02);
      expect(Math.abs(inside - outside), `${x}, ${z}`).toBeLessThan(0.01);
    }
    // the land under the drawn ground lies under it (down to a hand under, never above)
    let worst = -Infinity;
    for (let x = PG.x0 + 20; x < PG.x1 - 20; x += 7.3) {
      for (let z = PG.z0 + 20; z < PG.z1 - 20; z += 5.9) {
        const d = land(x, z) - pg.heightAt(x, z);
        if (d > worst) worst = d;
      }
    }
    expect(worst).toBeLessThan(0.005);
  });

  it('the asphalt is level and asphalt, the loop gravel, its way back sand and mud', () => {
    const p = new ProvingPoint();
    for (const [x, z] of [
      [START_X - 500, 0],
      [SKIDPAD.x, SKIDPAD.z - SKIDPAD.r],
      [SLALOM.first, SLALOM.z],
      [TURN.x, TURN.z],
    ]) {
      expect(provingAt(x, z, p).surface).toBe(Surface.Asphalt);
      expect(p.h).toBe(0);
      expect(at(x, z).ny).toBeGreaterThan(0.9999);
    }
    // the gravel between the features, out and back
    expect(provingAt(LOOP.xNear - 5, LOOP.zOut, p).surface).toBe(Surface.Gravel);
    const q = { x: 0, z: 0, tx: 0, tz: 0, kappa: 0 };
    loopAt(760, q);
    expect(provingAt(q.x, q.z, p).surface).toBe(Surface.Sand);
    loopAt(850, q);
    expect(provingAt(q.x, q.z, p).surface).toBe(Surface.Dirt);
    expect(at(q.x, q.z).mu).toBeLessThan(0.5);
    expect(p.h).toBeLessThan(-0.08);
    // (between the drawn ground: the land's own, level)
    expect(provingAt(-1300, 40, p).surface).toBe(-1);
    expect(at(-1300, 40).surface).toBe(world.surfaceOf((world.shape(-1300, 40, tp), tp)));
  });

  it('the loop: s along it and back again', () => {
    const q = { x: 0, z: 0, tx: 0, tz: 0, kappa: 0 };
    const lp = { s: 0, d: 0 };
    for (let s = 3; s < LOOP_LEN; s += 37) {
      loopAt(s, q);
      // (a point 2 m right of the line: (−tz, tx))
      loopProject(q.x - q.tz * 2, q.z + q.tx * 2, lp);
      expect(lp.s).toBeCloseTo(s, 4);
      expect(lp.d).toBeCloseTo(2, 4);
    }
  });

  it('the features: the twister lifts one side as it drops the other, the logs and the whoops stand up', () => {
    const p = new ProvingPoint();
    const q = { x: 0, z: 0, tx: 0, tz: 0, kappa: 0 };
    const side = (s: number, d: number): number => {
      loopAt(s, q);
      return provingAt(q.x - q.tz * d, q.z + q.tx * d, p).h;
    };
    // (a quarter wave into the twister: one wheel track up, the other down)
    const s = 165 + 8 * 1.25;
    expect(side(s, 0.8)).toBeGreaterThan(0.12);
    expect(side(s, -0.8)).toBeLessThan(-0.12);
    // the whoops' tops and the logs
    expect(side(85 + 8, 0)).toBeCloseTo(0.45, 2);
    for (const l of LOGS.at) expect(side(l, 1)).toBeCloseTo(LOGS.h, 3);
    // the side slope leans the way out: its right side high
    expect(side(310, 3) - side(310, -3)).toBeGreaterThan(1.2);
  });

  it('the hill climbs at its grades to its top and comes down again', () => {
    for (const r of HILL.ramps) {
      const up = HILL.rise / r.grade;
      // (along the lane's middle, between the rounded changes of grade)
      const h1 = pg.heightAt(HILL.x0 - up * 0.3, r.z);
      const h2 = pg.heightAt(HILL.x0 - up * 0.7, r.z);
      expect((h2 - h1) / (up * 0.4)).toBeCloseTo(r.grade, 2);
      expect(pg.heightAt(HILL.x0 - up - HILL.top / 2, r.z) - made.level).toBeCloseTo(HILL.rise, 3);
      expect(provingAt(HILL.x0 - up * 0.5, r.z, new ProvingPoint()).surface).toBe(Surface.Asphalt);
    }
  });

  it('the grass grows between the drawn ground, not through it', () => {
    expect(world.plotBare(START_X - 300, 0)).toBe(true);
    expect(world.plotBare(-1300, 40)).toBe(false);
    expect(world.plotBare(LOOP.xNear - 100, LOOP.zOut)).toBe(true);
  });

  it('every section sets a vehicle down on its own ground, facing its way', () => {
    for (const s of SECTIONS) {
      const g = at(s.x, s.z);
      expect(g.surface, s.id).not.toBe(-1);
      expect(Number.isFinite(s.yaw)).toBe(true);
    }
    expect(KM_U).toBe(1000);
  });
});
