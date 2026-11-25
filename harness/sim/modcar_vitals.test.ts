/**
 * The body (src/core/modcar/vitals.ts, docs/V3/plan/finish.md §三): one bar — life, and health its most — stamina
 * spent and back, hunger and thirst over time and what they take at the bottom, the cold and the heat and what one
 * wears, meals, drinks and medicine, what mends one, and dying.
 */
import { describe, expect, it } from 'vitest';
import { airLines, canSprint, drink, eat, feels, has, healthOf, medicate, mend, newVitals, poison, revive, sleep, speedFactor, stepVitals, VITALS, type Vitals, type VitalsInput } from '../../src/core/modcar/vitals';

const AIR: Omit<VitalsInput, 'dt'> = { sprinting: false, jumped: false, ambientC: 18, warmth: 9, rain: false };

/** run for `s` seconds in steps of 0.1 */
function run(v: Vitals, s: number, o: Partial<VitalsInput> = {}): { hurt: number; sapped: number; died: boolean; why: string } {
  let hurt = 0;
  let sapped = 0;
  let died = false;
  let why = '';
  for (let t = 0; t < s - 1e-9; t += 0.1) {
    const e = stepVitals(v, { ...AIR, ...o, dt: 0.1 });
    hurt += e.hurt;
    sapped += e.sapped;
    died ||= e.died;
    if (e.why) why = e.why;
  }
  return { hurt, sapped, died, why };
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

  it('food lasts about 76 minutes and water about 58; at nothing they take life: hunger 1 every 6 s (ten minutes), thirst 1 every 3 s (five)', () => {
    const v = newVitals();
    run(v, 600);
    expect(v.food).toBeCloseTo(100 - (100 / (76 * 60)) * 600, 1);
    expect(v.water).toBeCloseTo(100 - (100 / (58 * 60)) * 600, 1);
    v.food = 0;
    v.water = 50;
    expect(run(v, 30).hurt).toBe(5);
    v.food = 50;
    v.water = 0;
    expect(run(v, 30).hurt).toBe(10);
    // from full: thirst alone ends one in five minutes, not before
    const t = newVitals();
    t.water = 0;
    expect(run(t, 295).died).toBe(false);
    expect(run(t, 6).died).toBe(true);
    const h = newVitals();
    h.food = 0;
    h.water = 100;
    expect(run(h, 590).died).toBe(false);
    expect(run(h, 12).died).toBe(true);
    // health itself is untouched by them
    expect(healthOf(h)).toBe(100);
  });

  it("life comes back by itself, 1 every 12 s, when neither hungry nor thirsty — up to one's health and no further", () => {
    const v = newVitals();
    v.hp = 50;
    run(v, 120);
    expect(v.hp).toBeCloseTo(60, 1);
    // hungry (under a quarter): it does not
    const h = newVitals();
    h.hp = 50;
    h.food = 20;
    run(h, 120);
    expect(h.hp).toBe(50);
    // health is the most there is
    const c = newVitals();
    c.cap = 70;
    c.hp = 69;
    c.food = 50;
    c.water = 50;
    run(c, 120);
    expect(c.hp).toBe(70);
  });

  it('out in the cold, what one wears decides how fast one cools; under 32 °C one is frozen, slower, and it takes health — not life', () => {
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
    const r = run(v, 16, { ...cold, warmth: 9 });
    expect(has(v, 'hypo')).toBe(true);
    expect(feels(v)).toBe('frozen');
    expect(r.hurt).toBe(0);
    expect(r.sapped).toBe(2);
    expect(healthOf(v)).toBe(98);
    expect(v.hp).toBe(98);
    expect(v.capWhy).toBe('cold');
    expect(speedFactor(v)).toBeCloseTo(0.75, 5);
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

  it('the heat: above (34 − 0.4 × what one wears) the body warms, a coat in the desert the faster; over 39.5 °C heat-struck, and it takes health', () => {
    expect(airLines(4, false)).toEqual({ cold: 16, hot: 34 - 1.6 });
    expect(airLines(40, false).hot).toBeCloseTo(18, 9);
    // (wet through one is as good as bare to the cold; the heat's line does not move for it)
    expect(airLines(4, true)).toEqual({ cold: 41, hot: 34 - 1.6 });
    const desert = { ambientC: 38 };
    const light = newVitals();
    const coat = newVitals();
    run(light, 360, { ...desert, warmth: 4 });
    run(coat, 360, { ...desert, warmth: 40 });
    expect(light.temp).toBeCloseTo(37.5 + (38 - 32.4) * VITALS.heatGain * 360, 2);
    expect(coat.temp).toBeCloseTo(37.5 + (38 - 18) * VITALS.heatGain * 360, 2);
    expect(feels(light)).toBe('');
    expect(feels(coat)).toBe('heat');
    // lightly dressed in the desert at noon: a quarter of an hour and more before it does harm
    const t = newVitals();
    let s = 0;
    while (!has(t, 'heat') && s < 3600) {
      t.food = t.water = 100;
      stepVitals(t, { ...AIR, ...desert, warmth: 4, dt: 1 });
      s++;
    }
    expect(s).toBeGreaterThan(15 * 60);
    expect(s).toBeLessThan(20 * 60);
    // heat-struck: health off every 8 s, slower on one's feet
    const r = run(t, 16, { ...desert, warmth: 4 });
    expect(r.sapped).toBe(2);
    expect(t.capWhy).toBe('heat');
    expect(speedFactor(t)).toBeCloseTo(0.85, 5);
    // thirst comes half again as fast in it
    const a = newVitals();
    const b = newVitals();
    run(a, 100, { ambientC: 30, warmth: 4 });
    run(b, 100, { ...desert, warmth: 4 });
    expect((100 - b.water) / (100 - a.water)).toBeCloseTo(1.5, 2);
    // out of it (the shade, a cab): cool again in under a minute; water drunk cools too, 2 °C a litre
    const hot = newVitals();
    hot.temp = 39.6;
    run(hot, 45, { ambientC: 25 });
    expect(hot.temp).toBe(37.5);
    const w = newVitals();
    w.temp = 39.4;
    w.water = 20;
    drink(w, 'water', 0.5);
    run(w, 5.1, { ambientC: 33, warmth: 4 });
    expect(w.temp).toBeCloseTo(39.4 - 1 + (33 - 32.4) * VITALS.heatGain * 5.1, 1);
    // (a warming never heats a body that is not cold, nor does coffee)
    const c = newVitals();
    drink(c, 'coffee', 0.5);
    medicate(c, 0, 5);
    run(c, 70, { ambientC: 25 });
    expect(c.temp).toBe(37.5);
  });

  it('ill: health off 1 every 30 s (15 s badly), life down with it only when it is above it', () => {
    const v = newVitals();
    v.effects.sick1 = 240;
    v.hp = 60;
    const r = run(v, 240);
    expect(r.sapped).toBe(8);
    expect(r.hurt).toBe(0);
    expect(healthOf(v)).toBe(92);
    expect(v.capWhy).toBe('sick');
    expect(v.hp).toBeGreaterThanOrEqual(60);
    expect(v.hp).toBeLessThanOrEqual(92);
    const full = newVitals();
    full.effects.sick2 = 60;
    run(full, 60);
    expect(healthOf(full)).toBe(96);
    expect(full.hp).toBe(96);
  });

  it('what mends: a bed 5 an hour and a seat 2, a dish, a first-aid box, and being well — fed, watered, neither cold nor hot nor ill — 1 every four minutes', () => {
    const bed = newVitals();
    bed.cap = 50;
    bed.hp = 20;
    bed.energy = 0;
    sleep(bed, 6, VITALS, 100, true);
    expect(healthOf(bed)).toBe(80);
    expect(bed.hp).toBe(70);
    const seat = newVitals();
    seat.cap = 50;
    seat.hp = 20;
    sleep(seat, 8, VITALS, 100, false);
    expect(healthOf(seat)).toBe(66);
    expect(seat.hp).toBe(66);
    // a three-star dish (6) and a first-aid box (30): over five seconds, never over the whole
    const d = newVitals();
    d.cap = 60;
    d.hp = 60;
    mend(d, 6);
    run(d, 5.1);
    expect(healthOf(d)).toBeCloseTo(66, 1);
    mend(d, 30);
    mend(d, 30);
    run(d, 5.1);
    expect(healthOf(d)).toBe(100);
    // well: 1 every four minutes; not when hungry, not in the cold
    const well = newVitals();
    well.cap = 80;
    well.hp = 80;
    run(well, 480);
    expect(healthOf(well)).toBeCloseTo(82, 1);
    const poor = newVitals();
    poor.cap = 80;
    poor.hp = 80;
    poor.food = 50;
    run(poor, 480);
    expect(healthOf(poor)).toBe(80);
    const chilled = newVitals();
    chilled.cap = 80;
    chilled.hp = 80;
    run(chilled, 240, { ambientC: 5, warmth: 4 });
    expect(healthOf(chilled)).toBe(80);
  });

  it('a meal gives its food and life over five seconds; water quenches 10 a tenth of a litre', () => {
    const v = newVitals();
    v.food = 30;
    v.hp = 50;
    eat(v, 40, 4);
    run(v, 5.1);
    expect(v.food).toBeCloseTo(70 - (100 / (76 * 60)) * 5.1, 1);
    // (its four, and what came back by itself in the while)
    expect(v.hp).toBeCloseTo(54 + 5.1 / 12, 1);
    const w = newVitals();
    w.water = 20;
    drink(w, 'water', 0.33);
    run(w, 5.1);
    expect(w.water).toBeCloseTo(53 - 0.03 * 5.1, 1);
  });

  it("medicine: painkillers at once and never over one's health, a warming patch over five seconds", () => {
    const v = newVitals();
    v.hp = 40;
    medicate(v, 40, 0);
    expect(v.hp).toBe(80);
    v.cap = 90;
    medicate(v, 40, 0);
    expect(v.hp).toBe(90);
    v.temp = 31;
    medicate(v, 0, 5);
    run(v, 5.1, { ambientC: 0, warmth: 0 });
    expect(v.temp).toBeGreaterThan(35.5);
  });

  it('an energy drink makes one quick', () => {
    const v = newVitals();
    drink(v, 'energy', 0.1);
    expect(speedFactor(v)).toBeCloseTo(1.5, 5);
  });

  it('dead with no life left, or no health left; a first-aid box carried brings one up again', () => {
    const v = newVitals();
    v.food = 0;
    v.water = 0;
    v.hp = 3;
    const r = run(v, 10);
    expect(r.died).toBe(true);
    expect(r.why).toBe('thirst');
    expect(v.dead).toBe(true);
    revive(v, 30);
    expect(v.dead).toBe(false);
    expect(v.hp).toBe(30);
    expect(v.food).toBe(50);
    expect(v.water).toBe(50);
    // a deadly mushroom: ten of health at once — and the last of it is the end
    const p = newVitals();
    expect(poison(p, 10).sapped).toBe(10);
    expect(healthOf(p)).toBe(90);
    expect(p.hp).toBe(90);
    expect(p.capWhy).toBe('poison');
    p.cap = 8;
    p.hp = 8;
    expect(poison(p, 10).died).toBe(true);
    // frozen to the end: health runs out, and that is what it is put down to
    const f = newVitals();
    f.cap = 1;
    f.hp = 1;
    f.temp = 30;
    const e = run(f, 9, { ambientC: -20, warmth: 0 });
    expect(e.died).toBe(true);
    expect(e.why).toBe('cold');
    // up again from that with health for the life given
    revive(f, 30);
    expect(healthOf(f)).toBe(30);
    expect(f.temp).toBe(34);
    expect(has(f, 'hypo')).toBe(false);
  });

  it('an older save (no health kept, a bladder) reads as full health', () => {
    const old = { ...newVitals(), bladder: 40 } as Vitals & { bladder: number };
    delete old.cap;
    delete old.heatHold;
    delete old.ticks.heat;
    expect(healthOf(old)).toBe(100);
    old.effects.sick1 = 31;
    expect(run(old, 31).sapped).toBe(1);
    expect(old.cap).toBe(99);
  });
});
