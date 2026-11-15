/**
 * Extreme ModCar builds (docs/MODCAR.md §10.3): 1000 random plausible specs across what the parts allow
 * — 120–8000 kg, 3–500 kW and up to 1200 N·m, wheels of 0.06–0.75 m with mismatches, bare rims and
 * empty hubs, CG height 0.3–1.6 m, cdA 0.3–8, missing parts, motorcycles — each driven through a
 * mixed program on level asphalt and rough dirt, then flat out for its top speed. Everything stays
 * finite and bounded and nothing sinks through the ground.
 *
 * MODCAR_FUZZ=<builds> and MODCAR_FUZZ_SECONDS=<seconds each> run a longer search (defaults 1000, 30).
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/math/rng';
import { feel } from './modcar/feel';
import { fuzzBuild, swapFuzz } from './modcar/fuzz';
import { randomBuild } from './modcar/specgen';

const N = Number(process.env.MODCAR_FUZZ ?? 1000);
const SECONDS = Number(process.env.MODCAR_FUZZ_SECONDS ?? 30);
const SEED = Number(process.env.MODCAR_FUZZ_SEED ?? 2026);

describe(`modcar · ${N} extreme builds × ${SECONDS} s`, () => {
  it('stay finite, below 300 km/h, spinning slower than 30 rad/s, out of the ground', () => {
    const rng = new Rng(SEED);
    const bad: string[] = [];
    let worstSink = 0;
    let worstKmh = 0;
    let flips = 0;
    for (let i = 0; i < N; i++) {
      const b = randomBuild(rng);
      const s = fuzzBuild(b, SECONDS, SEED * 7 + i);
      const top = feel.launch(b.spec, { mods: b.setup });
      worstSink = Math.max(worstSink, s.maxSink);
      worstKmh = Math.max(worstKmh, s.maxKmh, top.top);
      flips += s.flips;
      const why: string[] = [];
      if (s.exploded || top.exploded) why.push('exploded');
      if (s.maxKmh > 300 || top.top > 300) why.push(`speed ${Math.max(s.maxKmh, top.top).toFixed(0)} km/h`);
      if (s.maxSpin > 30) why.push(`spin ${s.maxSpin.toFixed(1)} rad/s`);
      if (s.maxSink > 0.3) why.push(`body ${s.maxSink.toFixed(2)} m in the ground`);
      if (s.minCgClear < 0.05) why.push(`centre of gravity ${s.minCgClear.toFixed(2)} m over the ground`);
      if (why.length > 0) bad.push(`#${i} ${why.join(', ')}: ${b.note}`);
    }
    if (bad.length > 0) console.log(bad.slice(0, 20).join('\n'));
    console.log(`modcar fuzz: ${N} builds, worst body sink ${worstSink.toFixed(3)} m, fastest ${worstKmh.toFixed(0)} km/h, ${flips} roll-overs put right`);
    expect(bad).toEqual([]);
  });

  it('parts swapped while driving (applySpec and the wheels) never break it', () => {
    const rng = new Rng(SEED + 1);
    const bad: string[] = [];
    const runs = Math.max(20, Math.round(N / 10));
    for (let i = 0; i < runs; i++) {
      const s = swapFuzz(rng, randomBuild, Math.min(30, SECONDS));
      if (s.exploded || s.maxKmh > 300 || s.maxSpin > 30 || s.minCgClear < 0.05) bad.push(`#${i} ${JSON.stringify(s)}`);
    }
    expect(bad).toEqual([]);
  });
});
