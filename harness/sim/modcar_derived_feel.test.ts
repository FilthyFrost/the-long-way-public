import { describe, expect, it } from 'vitest';
import { decodeBuild } from '../../src/core/modcar/build';
import { derive } from '../../src/core/modcar/derive';
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

  const all4 = (rim: string, tire: string): string => ['FL', 'FR', 'RL', 'RR'].map((h) => `hub_${h}=${rim}+tire:${tire}`).join(';');

  it('the stock sedan is a 1970s small car: 0–100 in 12–20 s, 130–155 km/h', () => {
    expect(stock.accelS).toBeGreaterThan(12);
    expect(stock.accelS).toBeLessThan(20);
    expect(stock.topKmh).toBeGreaterThan(130);
    expect(stock.topKmh).toBeLessThan(155);
  });

  it('slicks corner at least 12 % harder on asphalt; tractor tyres at least 15 % less, and lift the car 0.15 m', () => {
    const slick = feelOf(`stock:sedan;${all4('rim_steel13', 'tire_slick')}`);
    expect(slick.maxLatG).toBeGreaterThan(stock.maxLatG * 1.12);
    const tractor = feelOf(`stock:sedan;${all4('rim_off16', 'tire_tractor')}`);
    expect(tractor.maxLatG).toBeLessThan(stock.maxLatG * 0.85);
    const lift = derive(decodeBuild(`stock:sedan;${all4('rim_off16', 'tire_tractor')}`, { fuel: 0.5 })).lift;
    expect(lift).toBeGreaterThan(0.15);
  });

  it('armour and a ram: at least 8 % longer to stop', () => {
    const heavy = feelOf('stock:sedan;armor_L=arm_plates;armor_R=arm_plates;bumperFront=bf_ram');
    expect(heavy.brake100m).toBeGreaterThan(stock.brake100m * 1.08);
  });

  it('nothing blows up', () => {
    for (const b of ['stock:pickup', 'stock:rv', 'stock:moto;engine=eng_d6', 'stock:rv;engine=eng_mower']) expect(feelOf(b).exploded).toBe(false);
  });
});
