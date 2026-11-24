/**
 * J6 (docs/V3/plan/growth.md §四, 定案 5): the body, as rules.
 *   - hunger and thirst at Nomad Drive's pace (76 and 58 minutes)
 *   - energy: an hour awake to sleepy; sitting still in a seat brings it back slowly; coffee 40 a mug at once and the
 *     loss halved for half an hour; a sleep fills it, gives back four health an hour, at half the hunger's pace
 *   - ill: health off every 30 s (15 badly), sick up every 90 s (60), four (eight) minutes; the stomach pills end it
 *   - hurt: a fall (nothing under 6 m, 5 to 100 by 25 m, the end beyond), a crash (1 at 6 m/s, 15 at 20), a thorn 3;
 *     over 8 one limps for five minutes; painkillers and the first-aid pack end it
 *   - the medicine and the clothes in the catalogue
 */
import { describe, expect, it } from 'vitest';
import { COFFEE_ENERGY, crashDamage, cure, drink, fallDamage, has, injure, newVitals, sleep, sleepHours, sleepy, speedFactor, stepVitals, THORN_HP, treat, VITALS, type VitalsInput } from '../../src/core/modcar/vitals';
import { itemDef } from '../../src/core/modcar/items';
import { SPOILED_ITEM } from '../../src/core/v3/kitchen/items';

const AIR: VitalsInput = { dt: 1, sprinting: false, jumped: false, ambientC: 22, warmth: 9, rain: false, peeing: false };

function run(v: ReturnType<typeof newVitals>, seconds: number, more: Partial<VitalsInput> = {}, fed = false): { hurt: number; vomits: number } {
  let hurt = 0;
  let vomits = 0;
  for (let t = 0; t < seconds - 1e-9; t += 0.5) {
    // (fed and watered: an hour awake is not an hour without water)
    if (fed) {
      v.food = Math.max(v.food, 60);
      v.water = Math.max(v.water, 60);
    }
    const ev = stepVitals(v, { ...AIR, ...more, dt: 0.5 });
    hurt += ev.hurt;
    if (ev.vomit) vomits++;
  }
  return { hurt, vomits };
}

describe('J6: the body', () => {
  it("hunger and thirst at Nomad Drive's pace", () => {
    expect(100 / VITALS.foodDrain / 60).toBeCloseTo(76, 6);
    expect(100 / VITALS.waterDrain / 60).toBeCloseTo(58, 6);
  });

  it('energy: an hour awake to sleepy, back slowly sitting in a seat; coffee wakes one up', () => {
    const v = newVitals();
    expect(v.energy).toBe(100);
    run(v, 59 * 60, {}, true);
    expect(sleepy(v)).toBe(false);
    run(v, 2 * 60, {}, true);
    expect(sleepy(v)).toBe(true);
    expect(speedFactor(v, false)).toBeCloseTo(0.9, 6);
    // sitting still: back, slowly (a little faster than it goes)
    const e0 = v.energy!;
    run(v, 600, { resting: true }, true);
    expect(v.energy!).toBeGreaterThan(e0 + 4);
    expect(v.energy!).toBeLessThan(e0 + 6);
    // a mug of coffee (a quarter litre): 40 at once, then the loss halved
    const c = newVitals();
    c.energy = 30;
    drink(c, 'coffee', 0.25);
    expect(c.energy).toBeCloseTo(30 + 0.25 * COFFEE_ENERGY, 6);
    expect(COFFEE_ENERGY * 0.25).toBe(40);
    expect(has(c, 'awake')).toBe(true);
    const a = c.energy!;
    run(c, 600, {}, true);
    expect(a - c.energy!).toBeCloseTo(VITALS.energyDrain * 0.5 * 600, 4);
  });

  it('sleep: rested, health back four an hour, hunger and thirst at half their pace while it lasts', () => {
    const v = newVitals();
    v.energy = 0;
    v.hp = 60;
    expect(sleepHours(v)).toBe(8);
    sleep(v, 8, VITALS, 100);
    expect(v.energy).toBe(100);
    expect(v.hp).toBe(92);
    expect(v.food).toBeCloseTo(100 - VITALS.foodDrain * 0.5 * 800, 6);
    expect(v.water).toBeCloseTo(100 - VITALS.waterDrain * 0.5 * 800, 6);
    const half = newVitals();
    half.energy = 70;
    expect(sleepHours(half)).toBe(2);
  });

  it('ill: health off now and then, sick up the odd time, for a while; the stomach pills end it', () => {
    const v = newVitals();
    v.effects.sick1 = 240;
    const r = run(v, 240);
    expect(r.hurt).toBe(8);
    expect(r.vomits).toBe(2);
    expect(has(v, 'sick1')).toBe(false);
    expect(v.food).toBeLessThan(100 - 2 * VITALS.vomitFood + 1);
    const bad = newVitals();
    bad.effects.sick2 = 480;
    expect(run(bad, 60).hurt).toBe(4);
    cure(bad);
    expect(run(bad, 60).hurt).toBe(0);
  });

  it('hurt: a fall, a crash, a thorn; over 8 a limp; the painkillers end it', () => {
    expect(fallDamage(5.9)).toBe(0);
    expect(fallDamage(6)).toBe(5);
    expect(fallDamage(15.5)).toBeCloseTo(52.5, 6);
    expect(fallDamage(25)).toBeGreaterThanOrEqual(1000);
    expect(crashDamage(5)).toBe(0);
    expect(crashDamage(6)).toBe(1);
    expect(crashDamage(20)).toBe(15);
    expect(crashDamage(24)).toBeGreaterThan(15);
    const v = newVitals();
    const thorn = injure(v, THORN_HP, 'thorn');
    expect(thorn.hurt).toBe(3);
    expect(has(v, 'hurt')).toBe(false);
    injure(v, 12, 'fall');
    expect(v.hp).toBe(85);
    expect(has(v, 'hurt')).toBe(true);
    expect(speedFactor(v, false)).toBeCloseTo(0.85, 6);
    treat(v, 20);
    expect(has(v, 'hurt')).toBe(false);
    expect(v.hp).toBe(100);
    const end = newVitals();
    const ev = injure(end, fallDamage(30), 'fall');
    expect(ev.died).toBe(true);
    expect(ev.why).toBe('fall');
  });

  it('the medicine: stomach pills cure, the first-aid pack and painkillers treat; the revive kits are 急救箱', () => {
    expect(itemDef('med_stomach').heal).toMatchObject({ cure: true });
    expect(itemDef('med_bandage').heal).toMatchObject({ hp: 50, treat: true });
    expect(itemDef('med_bandage').name.zh).toBe('急救包');
    for (const id of ['med_pain_1', 'med_pain_2', 'med_pain_3']) expect(itemDef(id).heal?.treat).toBe(true);
    for (const id of ['med_kit_1', 'med_kit_2', 'med_kit_3']) {
      expect(itemDef(id).name.zh).toMatch(/急救箱$/);
      expect(itemDef(id).revive).toBeTruthy();
    }
    // spoiled food may be eaten, and makes one badly ill
    expect(SPOILED_ITEM.eat).toMatchObject({ effect: 'sick2' });
  });

  it('the clothes: the old jacket and shoes give what the nightdress lacks; each place has its warmest', () => {
    expect((itemDef('wear_jacket_torn').wear?.warmth ?? 0) + (itemDef('wear_shoes_torn').wear?.warmth ?? 0)).toBe(6);
    expect(itemDef('wear_down').wear).toMatchObject({ slot: 'jacket', warmth: 10 });
  });
});
