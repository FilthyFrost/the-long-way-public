// The ND water's rules (docs/ND/PLAN.md ND2, core/v3/nd/water.ts) at Nomad Drive's numbers: which way liquid runs
// between two vessels and at whose speed, what will not run where, a bucket and a mug filling in the rain, a hand pump's
// water as found and its handle's stroke, vessels found part full.
import { describe, expect, it } from 'vitest';
import { itemDef, newItem } from '../../src/core/modcar/items';
import { newTool } from '../../src/core/modcar/tools';
import { ND_MUG, registerNdItems } from '../../src/core/v3/nd/items';
import {
  catchRain,
  canFlow,
  flowWhy,
  foundFill,
  handleStep,
  intoHands,
  itemVessel,
  ND_BUCKET,
  ND_PUMP,
  ND_WATER_CAN,
  newCatcher,
  newHandle,
  pour,
  pourS,
  PUMP,
  pumpFound,
  pumpVessel,
  RAIN,
  toolVessel,
  type Vessel,
} from '../../src/core/v3/nd/water';

registerNdItems();

const can = (l: number) => {
  const c = newItem(ND_WATER_CAN);
  c.litres = l;
  c.state = { found: true };
  return c;
};
const bucket = (l: number, liquid?: 'alcohol' | 'energy') => {
  const b = newItem(ND_BUCKET);
  b.litres = l;
  b.state = { found: true, ...(liquid ? { liquid } : {}) };
  return b;
};

describe('ND water', () => {
  it('its kinds: a fifteen-litre water can, a ten-litre bucket, the pump; found empty until settled', () => {
    expect(itemDef(ND_WATER_CAN).drink?.litres).toBe(15);
    expect(itemDef(ND_BUCKET).drink?.litres).toBe(10);
    expect(itemDef(ND_PUMP).name.zh).toBe('手压水泵');
    expect(newItem(ND_WATER_CAN).litres).toBe(0);
  });

  it('runs out of the hands where it may, else into them; at the pouring one\'s own speed', () => {
    const held = itemVessel(can(7.5))!;
    const b = itemVessel(bucket(2))!;
    expect(intoHands(held, b)).toBe(false);
    // (a litre a second: 8 s fills the bucket's 8 L)
    expect(pourS(held, b)).toBeCloseTo(7.5, 6);
    expect(pour(held, b, 3)).toBeCloseTo(3, 6);
    expect(held.litres).toBeCloseTo(4.5, 6);
    expect(b.litres).toBeCloseTo(5, 6);
    // an empty can held to a bucket of water: it fills from it
    const empty = itemVessel(can(0))!;
    expect(intoHands(empty, b)).toBe(true);
    expect(pour(b, empty, 2)).toBeCloseTo(2, 6);
    // a mug (of rain: its own liquid, not the coffee it is for) pours a fifth of a litre a second
    const mug = newItem(ND_MUG);
    mug.litres = 0.3;
    mug.state = { liquid: 'water' };
    const mv = itemVessel(mug)!;
    expect(mv.flow).toBe(0.2);
    expect(pour(mv, b, 1)).toBeCloseTo(0.2, 6);
  });

  it('a pump only gives, a can takes water only, nothing onto another liquid; empty and full stop it', () => {
    let left = 9;
    const pump = pumpVessel(
      () => left,
      (l) => (left = l),
    );
    const held = itemVessel(can(14))!;
    expect(flowWhy(held, pump)).toBe('noIn');
    expect(intoHands(held, pump)).toBe(true);
    expect(pour(pump, held, 5)).toBeCloseTo(1, 6);
    expect(left).toBeCloseTo(8, 6);
    expect(flowWhy(pump, held)).toBe('full');
    const beer = itemVessel(bucket(4, 'alcohol'))!;
    expect(beer.liquid).toBe('alcohol');
    expect(flowWhy(beer, itemVessel(can(1))!)).toBe('other');
    expect(flowWhy(itemVessel(can(1))!, beer)).toBe('other');
    expect(canFlow(beer, itemVessel(bucket(0))!)).toBe(true);
    // a bucket emptied holds nothing: water goes in again
    const b = bucket(0.5, 'alcohol');
    const bv = itemVessel(b)!;
    pour(bv, itemVessel(bucket(0))!, 1);
    expect(bv.liquid).toBe(null);
    expect(b.state?.liquid).toBeUndefined();
    expect(flowWhy(itemVessel(can(3))!, bv)).toBe('ok');
  });

  it('the radiator\'s water bottle is a vessel of water too', () => {
    const t = newTool('bottle');
    t.litres = 0;
    const v = toolVessel(t)!;
    expect(v.holds).toBe(5);
    let left = 3;
    pour(
      pumpVessel(
        () => left,
        (l) => (left = l),
      ),
      v,
      10,
    );
    expect(t.litres).toBeCloseTo(3, 6);
  });

  it('a bucket left out fills from empty in four minutes of the heaviest rain, a mug in a minute and a half; the rain followed over 8 s', () => {
    const fill = (kind: 'bucket' | 'mug', min: number, rain: number, seconds: number): number => {
      const inst = kind === 'bucket' ? bucket(0) : newItem(ND_MUG);
      if (kind === 'mug') inst.litres = 0;
      const v = itemVessel(inst)!;
      const c = newCatcher(0);
      for (let t = 0; t < seconds; t += 0.1) catchRain(c, v, min, rain, 0.1, true, () => false);
      return v.litres;
    };
    // (steady: after the eight seconds' ease it runs at 10 L / 240 s; in all 4 minutes nearly full, short by the ease)
    const b4 = fill('bucket', 4, 1, 240);
    expect(b4).toBeGreaterThan(9.4);
    expect(b4).toBeLessThan(9.8);
    expect(fill('bucket', 4, 1, 300)).toBeCloseTo(10, 6);
    // light rain fills as much slower
    expect(fill('bucket', 4, 0.25, 240)).toBeCloseTo(b4 / 4, 1);
    const m = fill('mug', 1.5, 1, 90);
    expect(m).toBeGreaterThan(0.3);
    expect(m).toBeLessThanOrEqual(0.35);
    // not under a roof, not in the hands, nothing else in it
    const v = itemVessel(bucket(0))!;
    const c = newCatcher(0);
    for (let t = 0; t < 20; t += 0.1) catchRain(c, v, 4, 1, 0.1, true, () => true);
    expect(c.status).toBe('sheltered');
    expect(v.litres).toBe(0);
    for (let t = 0; t < 20; t += 0.1) catchRain(c, v, 4, 1, 0.1, false, () => false);
    expect(c.status).toBe('notOut');
    const beer = itemVessel(bucket(1, 'alcohol'))!;
    const c2 = newCatcher(0);
    for (let t = 0; t < 20; t += 0.1) catchRain(c2, beer, 4, 1, 0.1, true, () => false);
    expect(c2.status).toBe('other');
    // a look every two seconds (one a hundredth late: the next a hundredth sooner)
    const c3 = newCatcher(0);
    const v3 = itemVessel(bucket(0))!;
    catchRain(c3, v3, 4, 1, 0.01, true, () => false);
    expect(c3.next).toBeCloseTo(RAIN.tickS - 0.01, 6);
  });

  it('a pump is found a tenth to three fifths full, the same for the same pump; its handle rocks 30° every 0.9 s and falls back in 0.35 s', () => {
    for (let k = 0; k < 200; k++) {
      const l = pumpFound(7, k);
      expect(l).toBeGreaterThanOrEqual(PUMP.holds * 0.1 - 1e-9);
      expect(l).toBeLessThanOrEqual(PUMP.holds * 0.6 + 1e-9);
      expect(pumpFound(7, k)).toBe(l);
    }
    const h = newHandle();
    let top = 0;
    for (let t = 0; t < 0.9; t += 1 / 120) top = Math.max(top, handleStep(h, true, 1 / 120));
    expect(top).toBeGreaterThan(29.5);
    expect(top).toBeLessThanOrEqual(30 + 1e-9);
    // stopped at the bottom of a stroke: back at rest within 0.35 s
    const h2 = newHandle();
    for (let t = 0; t < 0.45; t += 1 / 120) handleStep(h2, true, 1 / 120);
    expect(h2.angle).toBeGreaterThan(25);
    for (let t = 0; t < 0.36; t += 1 / 120) handleStep(h2, false, 1 / 120);
    expect(h2.angle).toBe(0);
  });

  it('a water can or a bucket is found a quarter to wholly full, now and then a bucket of beer or an energy drink; once', () => {
    let rare = 0;
    for (let s = 0; s < 400; s++) {
      const b = newItem(ND_BUCKET);
      expect(foundFill(b, s)).toBe(true);
      expect(b.litres!).toBeGreaterThanOrEqual(2.5 - 1e-9);
      expect(b.litres!).toBeLessThanOrEqual(10 + 1e-9);
      if (b.state?.liquid) rare++;
      expect(foundFill(b, s + 1)).toBe(false);
      const c = newItem(ND_WATER_CAN);
      foundFill(c, s);
      expect(c.litres!).toBeGreaterThanOrEqual(3.75 - 1e-9);
      expect(c.state?.liquid).toBeUndefined();
    }
    // (15 % rare, a third of it coolant — water here: some 10 %)
    expect(rare).toBeGreaterThan(400 * 0.05);
    expect(rare).toBeLessThan(400 * 0.16);
    // the same seed: the same fill
    const a = newItem(ND_BUCKET);
    const b = newItem(ND_BUCKET);
    foundFill(a, 99);
    foundFill(b, 99);
    expect(a.litres).toBe(b.litres);
  });

  it('a vessel of its own liquid is drunk as that: a bucket of beer', () => {
    const b = bucket(2, 'alcohol');
    const v: Vessel = itemVessel(b)!;
    expect(v.liquid).toBe('alcohol');
    expect(b.state?.liquid).toBe('alcohol');
  });
});
