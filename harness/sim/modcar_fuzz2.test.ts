/**
 * Extreme ModCar builds (docs/MODCAR.md §10.3), the second half of the random builds of
 * modcar_fuzz.test.ts (split so the two run side by side).
 */
import { describe, expect, it } from 'vitest';
import { FUZZ, fuzzRange } from './modcar/fuzz';

describe(`modcar · extreme builds ${Math.ceil(FUZZ.builds / 2)}–${FUZZ.builds - 1} of ${FUZZ.builds} × ${FUZZ.seconds} s`, () => {
  it('stay finite, below 300 km/h, spinning slower than 30 rad/s, out of the ground', () => {
    expect(fuzzRange(Math.ceil(FUZZ.builds / 2), FUZZ.builds)).toEqual([]);
  });
});
