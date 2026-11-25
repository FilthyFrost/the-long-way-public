/**
 * J6 (docs/V3/plan/growth.md §四, 定案 5): the body, as rules.
 *   - hunger and thirst at Nomad Drive's pace (76 and 58 minutes)
 *   - energy: an hour awake to sleepy; sitting still in a seat brings it back slowly; coffee 40 a mug at once and the
 *     loss halved for half an hour; a sleep fills it, gives back health (two an hour, five in a bed) and life with
 *     it, at half the hunger's pace
 *   - ill: health off every 30 s (15 badly), sick up every 90 s (60), four (eight) minutes; the stomach pills end it
 *   - hurt: a fall (nothing under 6 m, 5 to 100 by 25 m, the end beyond), a crash (1 at 6 m/s, 15 at 20), a thorn 3;
 *     over 8 one limps for five minutes; a bandage and painkillers end it
 *   - the five medicines (docs/V3/plan/finish.md §三.3) and the clothes in the catalogue
 */
import { describe, expect, it } from 'vitest';
import { COFFEE_ENERGY, crashDamage, cure, drink, fallDamage, has, healthOf, injure, newVitals, sleep, sleepHours, sleepy, speedFactor, stepVitals, THORN_HP, treat, VITALS, type VitalsInput } from '../../src/core/modcar/vitals';
import { cleanItem, hasItem, itemDef, ITEMS } from '../../src/core/modcar/items';
import '../../src/core/v3/nd/cards';
import { SPOILED_ITEM } from '../../src/core/v3/kitchen/items';

const AIR: VitalsInput = { dt: 1, sprinting: false, jumped: false, ambientC: 22, warmth: 9, rain: false };

function run(v: ReturnType<typeof newVitals>, seconds: number, more: Partial<VitalsInput> = {}, fed = false): { hurt: number; sapped: number; vomits: number } {
  let hurt = 0;
  let sapped = 0;
  let vomits = 0;
  for (let t = 0; t < seconds - 1e-9; t += 0.5) {
    // (fed and watered: an hour awake is not an hour without water)
    if (fed) {
      v.food = Math.max(v.food, 60);
      v.water = Math.max(v.water, 60);
    }
    const ev = stepVitals(v, { ...AIR, ...more, dt: 0.5 });
    hurt += ev.hurt;
    sapped += ev.sapped;
    if (ev.vomit) vomits++;
  }
  return { hurt, sapped, vomits };
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
    expect(speedFactor(v)).toBeCloseTo(0.9, 6);
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

  it('sleep: rested, health back two an hour in a seat and life with it, hunger and thirst at half their pace while it lasts', () => {
    const v = newVitals();
    v.energy = 0;
    v.hp = 30;
    v.cap = 70;
    expect(sleepHours(v)).toBe(8);
    sleep(v, 8, VITALS, 100);
    expect(v.energy).toBe(100);
    expect(healthOf(v)).toBe(86);
    // (life as it comes back awake, one every twelve seconds — 800 s of it —, and never over one's health)
    expect(v.hp).toBe(86);
    const low = newVitals();
    low.hp = 10;
    sleep(low, 2, VITALS, 100);
    expect(low.hp).toBeCloseTo(10 + 200 / 12, 6);
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
    expect(r.sapped).toBe(8);
    expect(r.hurt).toBe(0);
    expect(healthOf(v)).toBe(92);
    expect(r.vomits).toBe(2);
    expect(has(v, 'sick1')).toBe(false);
    expect(v.food).toBeLessThan(100 - 2 * VITALS.vomitFood + 1);
    const bad = newVitals();
    bad.effects.sick2 = 480;
    expect(run(bad, 60).sapped).toBe(4);
    cure(bad);
    expect(run(bad, 60).sapped).toBe(0);
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
    expect(speedFactor(v)).toBeCloseTo(0.85, 6);
    treat(v, 20);
    expect(has(v, 'hurt')).toBe(false);
    expect(v.hp).toBe(100);
    const end = newVitals();
    const ev = injure(end, fallDamage(30), 'fall');
    expect(ev.died).toBe(true);
    expect(ev.why).toBe('fall');
  });

  it('the medicine: five in all — a bandage, painkillers, stomach pills, a warming patch, a first-aid box; a save\'s others read as the nearest', () => {
    const meds = ITEMS.filter((d) => d.cat === 'med').map((d) => d.id).sort();
    expect(meds).toEqual(['med_bandage', 'med_pain_2', 'med_warm_2', 'nd_first_aid', 'nd_pills']);
    expect(itemDef('med_bandage')).toMatchObject({ name: { zh: '绷带' }, heal: { hp: 25, treat: true } });
    expect(itemDef('med_pain_2')).toMatchObject({ name: { zh: '止痛片' }, heal: { hp: 40, treat: true } });
    expect(itemDef('nd_pills')).toMatchObject({ name: { zh: '肠胃药' }, heal: { hp: 0, cure: true } });
    expect(itemDef('med_warm_2')).toMatchObject({ name: { zh: '暖身贴' }, heal: { hp: 0, warm: 5 } });
    // (the box: thirty of health back used by hand, or carried, one up again when one falls)
    expect(itemDef('nd_first_aid')).toMatchObject({ name: { zh: '急救箱' }, heal: { hp: 0, cap: 30 }, revive: { hp: 30 } });
    const was: Record<string, string> = { med_pain_1: 'med_pain_2', med_pain_3: 'med_pain_2', med_warm_1: 'med_warm_2', med_warm_3: 'med_warm_2', med_stomach: 'nd_pills', med_kit_1: 'nd_first_aid', med_kit_2: 'nd_first_aid', med_kit_3: 'nd_first_aid' };
    for (const [old, now] of Object.entries(was)) {
      expect(hasItem(old), old).toBe(false);
      expect(cleanItem({ item: old, uid: 'i1' }, { items: 0, parts: 0 } as never)?.item, old).toBe(now);
    }
    // spoiled food may be eaten, and makes one badly ill
    expect(SPOILED_ITEM.eat).toMatchObject({ effect: 'sick2' });
  });

  it('the clothes: the old jacket and shoes give what the nightdress lacks; each place has its warmest', () => {
    expect((itemDef('wear_jacket_torn').wear?.warmth ?? 0) + (itemDef('wear_shoes_torn').wear?.warmth ?? 0)).toBe(6);
    expect(itemDef('wear_down').wear).toMatchObject({ slot: 'jacket', warmth: 10 });
  });
});
