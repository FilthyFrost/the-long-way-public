/**
 * R1 (docs/V3/plan/rv.md): the Turtle, a camper van with an elevating roof, and the beds.
 *   - the frame: a motorhome of its own, its roof an elevating shell lifted straight up (a pop-up driven by the roof, its
 *     bellows), no roof mount (no rack on the shell), its living space standing only with the roof up
 *   - its places for things inside its body: the floor, the bed, the galley's worktop under the shell's underside
 *   - the beds: the Turtle's across the back, the Whale's over the cab, inside their bodies, over the floors
 *   - sleeping: six hours from nothing in a bed, eight in a seat, never under two; half again the health in a bed
 *   - the plan: at 50–70 km the Whale or the Turtle, about as often each
 */
import { describe, expect, it } from 'vitest';
import { aboardOf } from '../../src/core/modcar/aboard';
import { stockBuild } from '../../src/core/modcar/build';
import { zonesFor } from '../../src/core/modcar/cargo';
import { frameDef } from '../../src/core/modcar/frames';
import { vehiclePlan } from '../../src/core/modcar/schedule';
import { newVitals, sleep, sleepHours, VITALS } from '../../src/core/modcar/vitals';

describe('R1: the Turtle and the beds', () => {
  it('the Turtle: a motorhome with an elevating roof — lifted straight up on its bellows, no rack on it', () => {
    const f = frameDef('turtle');
    expect(f.kind).toBe('rv');
    const pops = Object.entries(f.rig?.popups ?? {});
    expect(pops.length).toBe(1);
    const [name, p] = pops[0];
    expect(name).toBe('POPUP_roof');
    expect(p.driver).toBe('roof');
    expect(p.lift?.[1]).toBeGreaterThan(0.5);
    expect(p.lift?.[1]).toBeLessThan(0.8);
    expect(p.bellows).toBe('POPUP_roof_bellows');
    // (its shell on the roof: at the top of the body)
    expect(p.pivot[1]).toBeGreaterThan(f.body.top - 0.2);
    expect(f.mounts.some((m) => m.cat === 'roof')).toBe(false);
    expect(f.mounts.some((m) => m.cat === 'ladder')).toBe(false);
    // (the Loaf's parts on it: a stock build has its engine, its seats, its doors)
    const b = stockBuild('turtle');
    for (const m of ['engine', 'seat_driver', 'seat_pass', 'door_side', 'trunk', 'hood']) expect(b.parts[m], m).toBeTruthy();
    // (in only with the roof up)
    expect(aboardOf('turtle')?.roof).toBe(true);
    expect(aboardOf('rv')?.roof).toBeFalsy();
  });

  it('its places for things lie inside its body, under the shell, the worktop and the bed above the floor', () => {
    const f = frameDef('turtle');
    const zones = zonesFor('turtle', stockBuild('turtle'));
    for (const id of ['cabin', 'bed', 'galley', 'pass']) expect(zones.some((z) => z.id === id), id).toBe(true);
    for (const z of zones) {
      expect(z.x[0], z.id).toBeGreaterThanOrEqual(f.body.rear);
      expect(z.x[1], z.id).toBeLessThanOrEqual(f.body.front);
      expect(Math.max(Math.abs(z.z[0]), Math.abs(z.z[1])), z.id).toBeLessThanOrEqual(f.body.halfWidth);
      // (the floor is drawn looking down from the zone's top: under the shell's underside with the roof down, 2.04)
      expect(z.top, z.id).toBeLessThan(2.0);
    }
    const by = (id: string) => zones.find((z) => z.id === id)!;
    expect(by('galley').floor).toBeGreaterThan(by('cabin').floor + 0.6);
    expect(by('bed').floor).toBeGreaterThan(by('cabin').floor + 0.4);
  });

  it('the beds: the Turtle’s across the back, the Whale’s over the cab, inside their bodies, over their floors', () => {
    for (const id of ['turtle', 'rv']) {
      const f = frameDef(id);
      const a = aboardOf(id)!;
      expect(a.beds?.length, id).toBeGreaterThanOrEqual(1);
      for (const b of a.beds!) {
        expect(b.x0).toBeLessThan(b.x1);
        expect(b.z0).toBeLessThan(b.z1);
        expect(b.x1 - b.x0, `${id}: long enough to lie on`).toBeGreaterThan(0.9);
        expect(b.x0).toBeGreaterThanOrEqual(f.body.rear);
        expect(b.x1).toBeLessThanOrEqual(f.body.front);
        expect(Math.max(Math.abs(b.z0), Math.abs(b.z1))).toBeLessThanOrEqual(f.body.halfWidth);
        expect(b.top).toBeGreaterThan(Math.min(...a.areas.map((r) => r.floor)));
        expect(b.top).toBeLessThan(f.body.top);
      }
    }
    // (the Turtle's room: inside its body, behind the front seats, in front of the bed)
    const t = aboardOf('turtle')!;
    const room = t.areas[0];
    expect(room.x1).toBeLessThan(frameDef('turtle').mounts.find((m) => m.id === 'seat_driver')!.pos.x);
    expect(room.x0).toBeGreaterThanOrEqual(t.beds![0].x1 - 1e-9);
  });

  it('sleeping: six hours from nothing in a bed, eight in a seat, never under two; half again the health in a bed', () => {
    const v = newVitals();
    v.energy = 0;
    expect(sleepHours(v)).toBe(8);
    expect(sleepHours(v, true)).toBe(6);
    v.energy = 50;
    expect(sleepHours(v)).toBe(4);
    expect(sleepHours(v, true)).toBe(3);
    v.energy = 90;
    expect(sleepHours(v)).toBe(2);
    expect(sleepHours(v, true)).toBe(2);
    const a = newVitals();
    const b = newVitals();
    a.hp = b.hp = 40;
    a.energy = b.energy = 10;
    sleep(a, 4, VITALS, 100, false);
    sleep(b, 4, VITALS, 100, true);
    expect(a.energy).toBe(100);
    expect(b.energy).toBe(100);
    expect(b.hp - 40).toBeCloseTo((a.hp - 40) * 1.5, 6);
  });

  it('the plan: at 50–70 km the Whale or the Turtle, about as often each', () => {
    let whale = 0;
    let turtle = 0;
    for (let k = 0; k < 400; k++) {
      const p = vehiclePlan(1000 + k * 7919, 120);
      const rv = p.find((x) => x.s >= 50_000 && x.s <= 70_000 + 1e-6 && (x.frame === 'rv' || x.frame === 'turtle'));
      expect(rv, `seed ${1000 + k * 7919}`).toBeTruthy();
      if (rv!.frame === 'rv') whale++;
      else turtle++;
    }
    expect(whale).toBeGreaterThan(140);
    expect(turtle).toBeGreaterThan(140);
  });
});
