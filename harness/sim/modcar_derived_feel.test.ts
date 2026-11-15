import { describe, expect, it } from 'vitest';
import { feelOf } from './modcar/derived_feel';

// docs/MODCAR.md §10.4: every swap must feel different in the full simulation, not only on the card
describe('modcar · derived builds on the feel harness', () => {
  const stock = feelOf('stock:sedan');

  it('a V8 makes the sedan much quicker; a mower engine never gets it to 100', () => {
    const v8 = feelOf('stock:sedan;engine=eng_v8');
    expect(stock.accelKind).toBe('0-100');
    expect(v8.accelS).toBeLessThan(stock.accelS * 0.7);
    const mower = feelOf('stock:sedan;engine=eng_mower');
    expect(mower.accelKind).not.toBe('0-100');
    expect(mower.topKmh).toBeLessThan(60);
  });

  it('a V8 in the motorcycle lifts its front wheel', () => {
    const bike = feelOf('stock:moto');
    expect(bike.wheelie).toBe(false);
    const v8 = feelOf('stock:moto;engine=eng_v8');
    expect(v8.wheelie).toBe(true);
  });

  it('tractor tyres on the sedan: slower off the line and less grip on asphalt', () => {
    const t = feelOf('stock:sedan;hub_FL=rim_off16+tire:tire_tractor;hub_FR=rim_off16+tire:tire_tractor;hub_RL=rim_off16+tire:tire_tractor;hub_RR=rim_off16+tire:tire_tractor');
    expect(t.accelS).toBeGreaterThan(stock.accelS * 1.2);
    expect(t.maxLatG).toBeLessThan(stock.maxLatG - 0.08);
  });

  it('nothing blows up', () => {
    for (const b of ['stock:pickup', 'stock:rv', 'stock:moto;engine=eng_d6', 'stock:rv;engine=eng_mower']) expect(feelOf(b).exploded).toBe(false);
  });
});
