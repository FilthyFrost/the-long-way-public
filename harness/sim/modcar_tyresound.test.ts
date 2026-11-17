/**
 * The tyres heard by what they roll on (docs/MODCAR.md §23, src/game/modcar/tyreSound.ts): a roll follows its
 * wheel's speed, gravel crunches louder than asphalt at a crawl, wet asphalt hisses over its roll, two surfaces
 * share the sound as they share the wheels, asphalt squeals only past the tyre's grip (a locked-wheel stop: all
 * four; one wheel spinning: half as loud), the loose surfaces scatter as soon as a tread slides, a closed cab
 * muffles them (less with its doors open, stones sharper), and the shared road-noise bed is turned down under them.
 */
import { describe, expect, it } from 'vitest';
import { AudioMix, computeMix, type AudioInputs } from '../../src/core/audio/mix';
import { Surface } from '../../src/core/world/ground';
import { tyreLoops, type TyreWheel } from '../../src/game/modcar/tyreSound';

/** a wheel rolling at a speed (m/s) on a surface, its tread turning at `tread` (m/s; the speed when it rolls) */
const wheel = (surface: number, speed: number, tread = speed, alpha = 0, fit = 0): TyreWheel => ({ contact: true, surface, fit, omega: tread / 0.3, radius: 0.3, vLong: speed, vLat: 0, alpha });
const four = (w: TyreWheel): TyreWheel[] => [w, w, w, w];
const kmh = (v: number): number => v / 3.6;
const byName = (r: ReturnType<typeof tyreLoops>): Record<string, { gain: number; rate: number; cutoff?: number }> => Object.fromEntries(r.loops.map((l) => [l.name, l]));
const out = { wet: 0, near: 1, cabin: null };

describe('modcar · the tyres heard', () => {
  it('at fifty on dry asphalt: its roll at rate and gain one, no squeal; standing, nothing', () => {
    const r = byName(tyreLoops(four(wheel(Surface.Asphalt, kmh(50))), out));
    expect(Object.keys(r)).toEqual(['roll_asphalt']);
    expect(r.roll_asphalt.rate).toBeCloseTo(1, 6);
    expect(r.roll_asphalt.gain).toBeCloseTo(1, 6);
    expect(tyreLoops(four(wheel(Surface.Asphalt, 0)), out).loops).toEqual([]);
    // (rolling with the slip a tyre always has: still no squeal)
    expect(byName(tyreLoops(four(wheel(Surface.Asphalt, kmh(80), kmh(80) * 1.02, 0.03)), out)).skid_asphalt).toBeUndefined();
  });

  it('louder and brighter the faster; gravel crunching louder than asphalt at a crawl', () => {
    const slow = byName(tyreLoops(four(wheel(Surface.Asphalt, kmh(30))), out)).roll_asphalt;
    const fast = byName(tyreLoops(four(wheel(Surface.Asphalt, kmh(100))), out)).roll_asphalt;
    expect(fast.gain).toBeGreaterThan(slow.gain * 2);
    expect(fast.rate).toBeGreaterThan(slow.rate * 3);
    const crawlA = byName(tyreLoops(four(wheel(Surface.Asphalt, kmh(5))), out)).roll_asphalt;
    const crawlG = byName(tyreLoops(four(wheel(Surface.Gravel, kmh(5))), out)).roll_gravel;
    expect(crawlG.gain).toBeGreaterThan(crawlA.gain * 2);
  });

  it('wet asphalt hisses over its roll, as much as it is wet', () => {
    const damp = byName(tyreLoops(four(wheel(Surface.Asphalt, kmh(60))), { ...out, wet: 0.3 })).roll_wet;
    const soaked = byName(tyreLoops(four(wheel(Surface.Asphalt, kmh(60))), { ...out, wet: 1 })).roll_wet;
    expect(damp.gain).toBeGreaterThan(0);
    expect(soaked.gain / damp.gain).toBeCloseTo(1 / 0.3, 3);
    expect(byName(tyreLoops(four(wheel(Surface.Gravel, kmh(60))), { ...out, wet: 1 })).roll_wet).toBeUndefined();
  });

  it('two wheels on the asphalt and two on the gravel shoulder: each heard by its share', () => {
    const a = wheel(Surface.Asphalt, kmh(50));
    const g = wheel(Surface.Gravel, kmh(50));
    const r = byName(tyreLoops([a, g, a, g], out));
    expect(r.roll_asphalt.gain).toBeCloseTo(Math.SQRT1_2, 6);
    expect(r.roll_gravel.gain).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it('a locked-wheel stop squeals with all four; one wheel spinning, half as loud; the locked rolls go quiet', () => {
    const locked = byName(tyreLoops(four(wheel(Surface.Asphalt, kmh(70), 0)), out));
    expect(locked.roll_asphalt).toBeUndefined();
    expect(locked.skid_asphalt.gain).toBeCloseTo(1, 6);
    expect(locked.skid_asphalt.rate).toBe(2);
    const one = byName(tyreLoops([wheel(Surface.Asphalt, 2, 14), wheel(Surface.Asphalt, 2), wheel(Surface.Asphalt, 2), wheel(Surface.Asphalt, 2)], out));
    expect(one.skid_asphalt.gain).toBeCloseTo(0.5, 6);
  });

  it('on the loose surfaces a slide scatters as soon as it starts; on ice a hiss', () => {
    const gentle = byName(tyreLoops(four(wheel(Surface.Gravel, 10, 11.2)), out)).skid_gravel;
    expect(gentle.gain).toBeGreaterThan(0.1);
    const hard = byName(tyreLoops(four(wheel(Surface.Gravel, 10, 16)), out)).skid_gravel;
    expect(hard.gain).toBeGreaterThan(gentle.gain);
    expect(byName(tyreLoops(four(wheel(Surface.Ice, 10, 0)), out)).skid_ice.gain).toBeCloseTo(0.9, 6);
  });

  it('from inside a closed cab muffled, stones sharper; with the doors open clear; outside, as they are', () => {
    const shut = byName(tyreLoops(four(wheel(Surface.Asphalt, kmh(50))), { ...out, cabin: 0 })).roll_asphalt;
    const open = byName(tyreLoops(four(wheel(Surface.Asphalt, kmh(50))), { ...out, cabin: 1 })).roll_asphalt;
    const stones = byName(tyreLoops(four(wheel(Surface.Gravel, kmh(50))), { ...out, cabin: 0 })).roll_gravel;
    expect(shut.cutoff).toBe(1200);
    expect(open.cutoff).toBeCloseTo(8000, 6);
    expect(stones.cutoff).toBe(2000);
    expect(byName(tyreLoops(four(wheel(Surface.Asphalt, kmh(50))), out)).roll_asphalt.cutoff).toBeUndefined();
  });

  it('the shared road noise turned down under the loose surfaces; bare rims and empty hubs not heard here; out of earshot nothing', () => {
    expect(tyreLoops(four(wheel(Surface.Asphalt, 10)), out).road).toBeCloseTo(0.7, 6);
    expect(tyreLoops(four(wheel(Surface.Grass, 10)), out).road).toBeCloseTo(0.15, 6);
    const rims = tyreLoops(four(wheel(Surface.Asphalt, 10, 10, 0, 1)), out);
    expect(rims.loops).toEqual([]);
    expect(rims.road).toBe(1);
    expect(tyreLoops(four(wheel(Surface.Gravel, 20)), { ...out, near: 0 }).loops).toEqual([]);
  });

  it('the shared road-noise bed: as it was without a scale (the older game), turned down with one', () => {
    const at: AudioInputs = { rpm: 2500, idleRpm: 800, redline: 6000, cylinders: 4, throttle: 0.4, speed: 16, slip: 0, rough: 0.004, rain: 0, hail: 0, snow: 0, dust: 0, wind: 0, enclosed: 1 };
    const plain = computeMix(at, new AudioMix());
    const was = { ...plain };
    const scaled = computeMix({ ...at, roadScale: 0.45 }, new AudioMix());
    expect(computeMix({ ...at, roadScale: undefined }, new AudioMix())).toEqual(was);
    expect(scaled.roadGain).toBeCloseTo(plain.roadGain * 0.45, 9);
    expect({ ...scaled, roadGain: 0 }).toEqual({ ...plain, roadGain: 0 });
  });
});
