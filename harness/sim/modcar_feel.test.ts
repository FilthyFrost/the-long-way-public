/**
 * The ModCar feel measurements (harness/sim/modcar/feel.ts) and the differences part swaps must make
 * at the physics level (docs/MODCAR.md §10.4): every figure is measured, sensible and quick, and a
 * bigger engine, bigger wheels or more weight change it the way they should.
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/math/rng';
import { measureFeel, type ModcarFeel } from './modcar/feel';
import { build, randomBuild, type FrameId } from './modcar/specgen';

const stock: Partial<Record<FrameId, ModcarFeel>> = {};
const of = (f: FrameId): ModcarFeel => (stock[f] ??= measureFeel(build({ frame: f })));

describe('modcar · feel measurements', () => {
  it('measures every figure of the stock sedan, in the range of its class', () => {
    const m = of('sedan');
    expect(m.exploded).toBe(false);
    expect(m.accelKind).toBe('0-100');
    // docs/MODCAR.md §10.4: the stock sedan does 0–100 in 12–20 s and 130–155 km/h
    expect(m.t0to100).toBeGreaterThan(12);
    expect(m.t0to100).toBeLessThan(20);
    expect(m.topKmh).toBeGreaterThan(130);
    expect(m.topKmh).toBeLessThan(155);
    expect(m.t0to60).toBeLessThan(m.t0to100);
    expect(m.brake100m).toBeGreaterThan(30);
    expect(m.brake100m).toBeLessThan(70);
    // braking distance goes with the square of the speed
    expect(m.brake100m / m.brake60m).toBeGreaterThan(2.3);
    expect(m.brake100m / m.brake60m).toBeLessThan(3.2);
    expect(m.maxLatG).toBeGreaterThan(0.6);
    expect(m.maxLatG).toBeLessThan(0.95);
    expect(m.rollDegPerG).toBeGreaterThan(1.5);
    expect(m.rollDegPerG).toBeLessThan(9);
    expect(m.leanDegPerG).toBe(0);
    expect(m.wheelie).toBe(false);
    expect(m.gradeAsphaltPct).toBeGreaterThan(m.gradeGravelPct);
    expect(m.gradeGravelPct).toBeGreaterThan(10);
    expect(m.fuel90).toBeGreaterThan(m.fuel60);
  });

  it('a motorcycle leans instead of rolling', () => {
    const m = of('moto');
    expect(Math.abs(m.rollDegPerG)).toBeLessThan(0.5);
    // atan(a/g) between 0.15 and 0.5 g: about 52°/g
    expect(m.leanDegPerG).toBeGreaterThan(45);
    expect(m.leanDegPerG).toBeLessThan(58);
  });

  it('each spec is measured in well under two seconds, the extreme ones too', () => {
    const rng = new Rng(77);
    const specs = [build({ frame: 'rv', kW: 3, nm: 20, mass: 7000 }), build({ frame: 'moto', kW: 500, nm: 1200, mass: 700 })];
    for (let i = 0; i < 4; i++) specs.push(randomBuild(rng).spec);
    for (const f of ['sedan', 'pickup', 'moto', 'rv'] as const) expect(of(f).ms).toBeLessThan(2000);
    for (const s of specs) {
      const m = measureFeel(s);
      expect(m.ms).toBeLessThan(2000);
      expect(m.exploded).toBe(false);
    }
  });

  it('a slow build is described by its 0–60', () => {
    const m = measureFeel(build({ frame: 'rv', kW: 50, nm: 250, mass: 4000 }));
    expect(m.accelKind).toBe('0-60');
    expect(Number.isFinite(m.t0to60)).toBe(true);
    expect(m.accelS).toBe(m.t0to60);
    expect(Number.isNaN(m.t0to100)).toBe(true);
    // one that never makes 60 has no acceleration figure, only a top speed
    const crawl = measureFeel(build({ frame: 'rv', kW: 25, nm: 160, mass: 4200 }));
    expect(crawl.accelKind).toBe('none');
    expect(crawl.topKmh).toBeGreaterThan(30);
    expect(crawl.topKmh).toBeLessThan(60);
  });
});

describe('modcar · what a part swap changes (physics level)', () => {
  it('i4 → V8 in the sedan: 0–100 at least 30 % quicker', () => {
    const i4 = of('sedan');
    const v8 = measureFeel(build({ frame: 'sedan', kW: 190, nm: 400, mass: 1180, weightFront: 0.57 }));
    expect(v8.t0to100).toBeLessThan(i4.t0to100 * 0.7);
  });

  it('wheels 0.15 m bigger in radius: the car rides 0.15 m higher and tops out faster', () => {
    const tall = measureFeel(build({ frame: 'sedan', radius: [0.435, 0.435] }));
    expect(tall.topKmh).toBeGreaterThan(of('sedan').topKmh);
    // (ride height: modcar_wheels.test.ts measures the body; here the climb gets harder on the tall gearing)
    expect(tall.gradeAsphaltPct).toBeLessThan(of('sedan').gradeAsphaltPct);
  });

  it('more grip: a higher cornering limit; less grip: lower', () => {
    const slick = measureFeel(build({ frame: 'sedan', mu: 1.0 }));
    const hard = measureFeel(build({ frame: 'sedan', mu: 0.7 }));
    expect(slick.maxLatG).toBeGreaterThan(of('sedan').maxLatG * 1.08);
    expect(hard.maxLatG).toBeLessThan(of('sedan').maxLatG * 0.9);
  });

  it('armour and a ram (+300 kg on the same brakes): braking distance at least 8 % longer', () => {
    const armoured = measureFeel(build({ frame: 'sedan', mass: 1300, weightFront: 0.56, cdA: 1.0 }));
    expect(armoured.brake100m).toBeGreaterThan(of('sedan').brake100m * 1.08);
  });
});
