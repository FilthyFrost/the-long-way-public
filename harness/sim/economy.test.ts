/**
 * The robot traveller's machinery on a short run (the 550 km figures are measured by
 * `npm run measure` and gated by specs/economy): deterministic, it stops, it finds, it burns.
 */
import { describe, expect, it } from 'vitest';
import { T0_TRUCK } from '../../src/core/vehicle/spec';
import { travel } from './traveller';

describe('robot traveller', () => {
  it('drives three stretches, stops at places, finds petrol and things, and does it the same way twice', () => {
    const a = travel(T0_TRUCK, 11, 'plains', 3);
    const b = travel(T0_TRUCK, 11, 'plains', 3);
    expect(a).toEqual(b);
    expect(a.km).toBeGreaterThan(32);
    expect(a.burntL).toBeGreaterThan(4);
    expect(a.stops).toBeGreaterThan(2);
    expect(a.partsFound + a.kitsFound + a.plugsFound).toBeGreaterThan(0);
    expect(a.accidents).toBe(0);
  });
});
