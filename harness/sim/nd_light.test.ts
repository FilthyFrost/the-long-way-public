// The ND flashlight's rules (docs/ND/PLAN.md ND3, core/v3/nd/flashlight.ts) at Nomad Drive's numbers: 100 of charge at
// 0.35 a second (285.7 s on), found three tenths to full, dimmer, warmer and flickering as it runs down, sputtering out
// spent, put away off and on again in the hands, its beam narrowing as it is focused.
import { describe, expect, it } from 'vitest';
import { newItem } from '../../src/core/modcar/items';
import { insertBattery } from '../../src/core/v3/nd/battery';
import { beamAt, drainLight, FLASHLIGHT, foundLight, isOn, kelvinAt, lightAt, lightCharge, lightLeftS, ND_FLASHLIGHT, sputterAt, stowLight, switchLight, unstowLight } from '../../src/core/v3/nd/flashlight';
import { registerNdItems } from '../../src/core/v3/nd/items';

registerNdItems();

describe('ND flashlight', () => {
  it('runs 285.7 s on its 100, held or not; spent, it is off and takes a battery', () => {
    const f = newItem(ND_FLASHLIGHT);
    f.state = { charge: 100 };
    expect(switchLight(f, true)).toBe(true);
    expect(lightLeftS(f)).toBeCloseTo(285.714, 2);
    let out = false;
    let t = 0;
    while (!out && t < 400) {
      out = drainLight(f, 0.1);
      t += 0.1;
    }
    expect(t).toBeCloseTo(285.8, 0);
    expect(isOn(f)).toBe(false);
    expect(lightCharge(f)).toBe(0);
    // (it will not come on; a battery goes in now)
    expect(switchLight(f, true)).toBe(false);
    expect(insertBattery(f, FLASHLIGHT.max)).toBe(true);
    expect(lightCharge(f)).toBe(100);
    // (and not on top of charge left)
    expect(insertBattery(f, FLASHLIGHT.max)).toBe(false);
  });

  it('is found three tenths to wholly charged, once', () => {
    for (let s = 0; s < 200; s++) {
      const f = newItem(ND_FLASHLIGHT);
      expect(foundLight(f, s)).toBe(true);
      expect(lightCharge(f)).toBeGreaterThanOrEqual(30 - 1e-9);
      expect(lightCharge(f)).toBeLessThanOrEqual(100 + 1e-9);
      expect(foundLight(f, s + 1)).toBe(false);
    }
  });

  it('dims, warms and flickers as it runs down (Nomad Drive\'s curves)', () => {
    expect(lightAt(1)).toEqual({ bright: 1, warm: 0, flicker: 0 });
    expect(lightAt(0).bright).toBeCloseTo(0.25, 6);
    expect(lightAt(0.45).bright).toBeCloseTo(0.88, 6);
    expect(lightAt(0.3).warm).toBeCloseTo(0.5, 6);
    // (no flicker above a quarter)
    expect(lightAt(0.25).flicker).toBe(0);
    expect(lightAt(0.5).flicker).toBe(0);
    expect(lightAt(0.06).flicker).toBeCloseTo(0.75, 6);
    expect(kelvinAt(1)).toBe(3200);
    expect(kelvinAt(0)).toBe(2300);
  });

  it('sputters out in three pulses over 0.6 s', () => {
    expect(sputterAt(0.05)).toBeCloseTo(0.03, 6);
    expect(sputterAt(0.15)).toBeCloseTo(0.8, 6);
    expect(sputterAt(0.35)).toBeCloseTo(0.533, 6);
    expect(sputterAt(0.55)).toBeCloseTo(0.267, 6);
    expect(sputterAt(0.61)).toBe(0);
  });

  it('put away it goes off, and comes on again in the hands', () => {
    const f = newItem(ND_FLASHLIGHT);
    f.state = { charge: 50 };
    switchLight(f, true);
    stowLight(f);
    expect(isOn(f)).toBe(false);
    expect(unstowLight(f)).toBe(true);
    expect(isOn(f)).toBe(true);
    // (switched off by hand: it stays off)
    switchLight(f, false);
    stowLight(f);
    expect(unstowLight(f)).toBe(false);
  });

  it('focused, its beam narrows from 55° to 20° and carries from 25 m to 45 m, 4.8 times as bright', () => {
    const w = beamAt(0);
    const n = beamAt(1);
    expect((w.half * 2 * 180) / Math.PI).toBeCloseTo(55, 6);
    expect((n.half * 2 * 180) / Math.PI).toBeCloseTo(20, 6);
    expect(w.reach).toBe(25);
    expect(n.reach).toBe(45);
    expect(n.gain).toBeCloseTo(4.8, 6);
  });
});
