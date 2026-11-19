/**
 * The steps of cooking as numbers (src/core/v3/cooking/steps.ts): a pot comes to be done under the flame,
 * a stir-fry nobody stirs catches, a roast not turned cooks on one side, a stew holds in its wait at a low
 * flame, and a dish takes about a minute to three.
 */
import { describe, expect, it } from 'vitest';
import { band, dishSeconds, heatScore, knifeScore, METHOD_STEPS, newPot, potDone, potScore, stepPot, STIR_GRACE, type Heat } from '../../src/core/v3/cooking/steps';
import { METHODS, type Method } from '../../src/core/v3/cooking/types';

/** cook at one flame, stirring every `every` seconds (0: never), until it is just right or for `max` seconds */
function cookAt(method: Method, heat: Heat, every: number, max = 400, stopAtRight = true) {
  const p = newPot(method);
  const dt = 0.1;
  let since = 0;
  for (let t = 0; t < max; t += dt) {
    since += dt;
    const stir = every > 0 && since >= every;
    if (stir) since = 0;
    stepPot(p, heat, stir, dt);
    if (stopAtRight && band(p.d) === 2 && potDone(p)) break;
  }
  return p;
}

describe('doneness', () => {
  it('five bands, and what each is worth; raw stays under what makes meat safe', () => {
    expect([0.2, 0.6, 1, 1.3, 2].map(band)).toEqual([0, 1, 2, 3, 4]);
    expect(heatScore(0.2)).toBeLessThan(0.35);
    expect(heatScore(1)).toBe(1);
    expect(heatScore(0.7)).toBeGreaterThan(heatScore(0.55));
    expect(heatScore(1.2)).toBeGreaterThan(heatScore(1.4));
    expect(heatScore(2)).toBeLessThan(heatScore(1.4));
  });

  it('every way of cooking has its steps, and the ways of keeping take hours, not seconds', () => {
    for (const m of Object.keys(METHODS) as Method[]) expect(METHOD_STEPS[m]).toBeDefined();
    expect(METHOD_STEPS.dry.keepH).toBeGreaterThan(0);
    expect(METHOD_STEPS.stirfry.stir).toBe('stir');
  });
});

describe('a pot on the flame', () => {
  it('a medium flame brings it to just right in its own time; low is slower, high faster', () => {
    for (const m of ['stirfry', 'fry', 'roast', 'steam'] as Method[]) {
      const mid = cookAt(m, 2, METHOD_STEPS[m].stir === 'stir' ? 1 : METHOD_STEPS[m].stir === 'turn' ? 15 : 0);
      expect(band(mid.d), m).toBe(2);
      expect(mid.t, m).toBeGreaterThan(METHOD_STEPS[m].cookS * 0.8);
      expect(mid.t, m).toBeLessThan(METHOD_STEPS[m].cookS * 1.3);
      const low = cookAt(m, 1, 1);
      const high = cookAt(m, 3, 1);
      expect(low.t).toBeGreaterThan(mid.t);
      expect(high.t).toBeLessThan(mid.t);
    }
  });

  it('a stir-fry nobody stirs catches and burns; one stirred every second does not', () => {
    const stirred = cookAt('stirfry', 3, 1, 25, false);
    const left = cookAt('stirfry', 3, 0, 25, false);
    expect(left.d).toBeGreaterThan(stirred.d);
    expect(band(cookAt('stirfry', 3, 0, 40, false).d)).toBe(4);
    expect(STIR_GRACE).toBeGreaterThan(0.5);
  });

  it('a roast never turned scores a quarter less, and gets there slower', () => {
    const turned = cookAt('roast', 2, 20);
    const not = cookAt('roast', 2, 0);
    expect(turned.turned).toBe(true);
    expect(not.turned).toBe(false);
    expect(not.t).toBeGreaterThan(turned.t);
    expect(potScore(not)).toBeCloseTo(potScore(turned) * 0.75, 6);
  });

  it('a stew is done only after its wait; a low flame holds it there, a high one takes it over', () => {
    const p = cookAt('stew', 2, 0, 400);
    expect(potDone(p)).toBe(true);
    expect(p.waited).toBeGreaterThanOrEqual(METHOD_STEPS.stew.waitS);
    const held = cookAt('stew', 1, 0, 600, false);
    expect(band(held.d)).toBe(2);
    const boiled = cookAt('stew', 3, 0, 600, false);
    expect(band(boiled.d)).toBeGreaterThanOrEqual(3);
    // taken off early, its wait not run, it is worth less
    const early = newPot('stew');
    for (let i = 0; i < 400; i++) stepPot(early, 2, false, 0.1);
    expect(potScore(early)).toBeLessThan(potScore(p));
  });
});

describe('the knife and the clock', () => {
  it('cuts on the beat are worth full marks, misses little', () => {
    expect(knifeScore([0, 0, 0])).toBe(1);
    expect(knifeScore([1, 1])).toBeCloseTo(0.05, 6);
    expect(knifeScore([0.2, 0.4])).toBeGreaterThan(knifeScore([0.5, 0.9]));
    expect(knifeScore([])).toBe(0.5);
  });

  it('a heated dish takes about one to three minutes; a salad or a drink less', () => {
    for (const m of ['stirfry', 'fry', 'roast', 'steam', 'soup', 'stew', 'rice', 'bake'] as Method[]) {
      for (const n of [2, 3, 4, 5]) {
        const s = dishSeconds(m, n);
        expect(s, `${m} ${n}`).toBeGreaterThanOrEqual(55);
        expect(s, `${m} ${n}`).toBeLessThanOrEqual(185);
      }
    }
    expect(dishSeconds('mix', 3)).toBeLessThan(60);
    expect(dishSeconds('brew', 2)).toBeLessThan(70);
  });
});
