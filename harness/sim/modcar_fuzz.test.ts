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
import { FUZZ, fuzzRange } from './modcar/fuzz';

// (the builds are split over modcar_fuzz.test.ts and modcar_fuzz2.test.ts, which run side by side)
describe(`modcar · extreme builds ${0}–${Math.ceil(FUZZ.builds / 2) - 1} of ${FUZZ.builds} × ${FUZZ.seconds} s`, () => {
  it('stay finite, below 300 km/h, spinning slower than 30 rad/s, out of the ground', () => {
    expect(fuzzRange(0, Math.ceil(FUZZ.builds / 2))).toEqual([]);
  });
});
