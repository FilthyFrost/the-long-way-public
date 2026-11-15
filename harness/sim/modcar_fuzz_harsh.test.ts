/**
 * Extreme ModCar builds in harder places (docs/MODCAR.md §10.3): steep hills flat out and a field of
 * walls and posts at full throttle, and parts swapped while driving. MODCAR_FUZZ scales the runs.
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/math/rng';
import { FUZZ, harshFuzz, swapFuzz } from './modcar/fuzz';
import { randomBuild } from './modcar/specgen';

const runs = Math.max(20, Math.round(FUZZ.builds / 10));

describe(`modcar · ${runs} extreme builds on steep hills, into walls, swapping parts`, () => {
  it('steep hills flat out and a field of walls and posts at full throttle', () => {
    const rng = new Rng(FUZZ.seed + 2);
    const bad: string[] = [];
    for (let i = 0; i < runs; i++) {
      const b = randomBuild(rng);
      const s = harshFuzz(b, rng, Math.min(25, FUZZ.seconds));
      const why: string[] = [];
      if (s.exploded) why.push('exploded');
      // (a light bike rolling down a 30 % hill like a log turns 20–30 rad/s)
      if (s.maxSpin > 40) why.push(`spin ${s.maxSpin.toFixed(1)} rad/s`);
      // (on its roof across a slope the centre of gravity can come within centimetres of the hill: under it, never)
      if (s.minCgClear < 0) why.push(`centre of gravity ${s.minCgClear.toFixed(2)} m over the hill`);
      // (the shared collision overlaps a wall by up to about one step of travel: a legacy vehicle 0.2 m
      // at 60 km/h and 0.23 m at 180; these hit at up to 240 km/h — none goes through)
      if (s.maxWallPenetration > 0.45) why.push(`${s.maxWallPenetration.toFixed(2)} m into a wall`);
      if (why.length > 0) bad.push(`#${i} ${why.join(', ')}: ${b.note}`);
    }
    expect(bad).toEqual([]);
  });

  it('parts swapped while driving (applySpec and the wheels) never break it', () => {
    const rng = new Rng(FUZZ.seed + 1);
    const bad: string[] = [];
    for (let i = 0; i < runs; i++) {
      const s = swapFuzz(rng, randomBuild, Math.min(30, FUZZ.seconds));
      if (s.exploded || s.maxKmh > 300 || s.maxSpin > 30 || s.minCgClear < 0.05) bad.push(`#${i} ${JSON.stringify(s)}`);
    }
    expect(bad).toEqual([]);
  });
});
