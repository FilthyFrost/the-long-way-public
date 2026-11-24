/**
 * The body (src/core/modcar/vitals.ts, docs/MODCAR.md §13): stamina spent and back, hunger and thirst over
 * time and what they do at the bottom, the cold and what one wears, meals, drinks and medicine, the bladder,
 * and dying.
 */
import { describe, expect, it } from 'vitest';
import { canSprint, drink, eat, has, medicate, newVitals, revive, speedFactor, stepVitals, VITALS, type Vitals, type VitalsInput } from '../../src/core/modcar/vitals';

const AIR: Omit<VitalsInput, 'dt'> = { sprinting: false, jumped: false, ambientC: 18, warmth: 9, rain: false, peeing: false };

/** run for `s` seconds in steps of 0.1 */
function run(v: Vitals, s: number, o: Partial<VitalsInput> = {}): { hurt: number; died: boolean } {
  let hurt = 0;
  let died = false;
  for (let t = 0; t < s - 1e-9; t += 0.1) {
    const e = stepVitals(v, { ...AIR, ...o, dt: 0.1 });
    hurt += e.hurt;
    died ||= e.died;
  }
  return { hurt, died };
}

describe('ModCar vitals', () => {
  it('sprinting spends stamina at 6 a second, gone in under 17 s; it comes back two seconds after, at 7.5 a second', () => {
    const v = newVitals();
    run(v, 10, { sprinting: true });
    expect(v.stamina).toBeCloseTo(40, 3);
    run(v, 7, { sprinting: true });
    expect(v.stamina).toBe(0);
    expect(canSprint(v)).toBe(false);
    run(v, 1.9);
    expect(v.stamina).toBe(0);
    // (0.1 s more of waiting, then 3.9 s of it coming back)
    run(v, 4);
    expect(v.stamina).toBeGreaterThan(27);
    expect(v.stamina).toBeLessThan(31);
    const j = newVitals();
    stepVitals(j, { ...AIR, dt: 0.1, jumped: true });
    expect(j.stamina).toBeCloseTo(88, 5);
  });

  it('food lasts about 76 minutes and water about 58 (Nomad Drive\'s); at the bottom they hurt: hunger 2 every 10 s, thirst 3 every 3 s', () => {
    const v = newVitals();
    run(v, 600);
    expect(v.food).toBeCloseTo(100 - (100 / (76 * 60)) * 600, 1);
    expect(v.water).toBeCloseTo(100 - (100 / (58 * 60)) * 600, 1);
    v.food = 0;
    v.water = 50;
    expect(run(v, 30).hurt).toBe(6);
    v.food = 50;
    v.water = 0;
    expect(run(v, 30).hurt).toBe(30);
  });

  it('out in the cold, what one wears decides how fast one cools; under 32 °C one is frozen, slower, and it hurts', () => {
    const cold = { ambientC: -20 };
    const bare = newVitals();
    const dressed = newVitals();
    run(bare, 120, { ...cold, warmth: 0 });
    run(dressed, 120, { ...cold, warmth: 37 });
    // (40 degrees short of comfort cools 0.02 °C a second, 3 degrees short 0.0015)
    expect(bare.temp).toBeCloseTo(37.5 - 40 * 0.0005 * 120, 1);
    expect(dressed.temp).toBeGreaterThan(37.2);
    const v = newVitals();
    v.temp = 31.9;
    const r = run(v, 10, { ...cold, warmth: 9 });
    expect(has(v, 'hypo')).toBe(true);
    expect(r.hurt).toBe(2);
    expect(speedFactor(v, false)).toBeCloseTo(0.75, 5);
    // warm again: it climbs 0.3 a second, and the frost lingers half a minute after 32
    run(v, 20, { ambientC: 25 });
    expect(v.temp).toBeGreaterThan(32);
    expect(has(v, 'hypo')).toBe(true);
    run(v, 31, { ambientC: 25 });
    expect(has(v, 'hypo')).toBe(false);
    // drunk, one does not feel the cold
    const d = newVitals();
    drink(d, 'alcohol', 0.1);
    run(d, 20, { ...cold, warmth: 0 });
    expect(d.temp).toBeCloseTo(37.5, 5);
  });

  it('a meal gives its food and health over five seconds; water quenches 10 a tenth of a litre and fills the bladder as much', () => {
    const v = newVitals();
    v.food = 30;
    v.hp = 50;
    eat(v, 40, 4);
    run(v, 5.1);
    expect(v.food).toBeCloseTo(70 - (100 / (76 * 60)) * 5.1, 1);
    expect(v.hp).toBeCloseTo(54, 3);
    const w = newVitals();
    w.water = 20;
    drink(w, 'water', 0.33);
    expect(w.bladder).toBeCloseTo(33, 3);
    run(w, 5.1);
    expect(w.water).toBeCloseTo(53 - 0.03 * 5.1, 1);
  });

  it('medicine: painkillers at once, a warming pill over five seconds, a side effect only within its chance', () => {
    const v = newVitals();
    v.hp = 40;
    expect(medicate(v, 35, 0, 0, 0.5)).toBeNull();
    expect(v.hp).toBe(75);
    v.temp = 31;
    expect(medicate(v, 0, 5, 0.5, 0.9)).toBeNull();
    run(v, 5.1, { ambientC: 0, warmth: 0 });
    expect(v.temp).toBeGreaterThan(35.5);
    expect(medicate(v, 0, 5, 0.5, 0.1)).not.toBeNull();
  });

  it('an energy drink makes one quick; the bladder empties with P held and goes by itself when full', () => {
    const v = newVitals();
    drink(v, 'energy', 0.1);
    expect(speedFactor(v, false)).toBeCloseTo(1.5, 5);
    expect(speedFactor(v, true)).toBeCloseTo(0.35, 5);
    v.bladder = 50;
    run(v, 2, { peeing: true });
    expect(v.bladder).toBeCloseTo(50 - VITALS.peeRate * 2 + 0.1 * 2, 0);
    v.bladder = 99.99;
    expect(stepVitals(v, { ...AIR, dt: 0.5 }).wet).toBe(true);
  });

  it('at no health one dies; a first-aid kit brings one up again half fed and half watered', () => {
    const v = newVitals();
    v.food = 0;
    v.water = 0;
    v.hp = 5;
    expect(run(v, 10).died).toBe(true);
    expect(v.dead).toBe(true);
    revive(v, 25);
    expect(v.dead).toBe(false);
    expect(v.hp).toBe(25);
    expect(v.food).toBe(50);
    expect(v.water).toBe(50);
  });
});
