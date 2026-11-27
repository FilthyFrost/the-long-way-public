/**
 * R1 (docs/V3/plan/rv.md): the Turtle, a camper van with an elevating roof, and the beds.
 *   - the frame: a motorhome of its own, its roof an elevating shell lifted straight up (a pop-up driven by the roof, its
 *     bellows), no roof mount (no rack on the shell), its living space standing only with the roof up
 *   - its places for things inside its body: the floor and the decks at the back, under the shell's underside (an empty
 *     shell as Nomad Drive's camper van since docs/V3/plan/finish.md §十九 step 7: no bed, no bunk, no galley)
 *   - the beds: only the Whale's bunk over the cab, as Nomad Drive's class C keeps its own; any other bed is one put in
 *   - sleeping: six hours from nothing in a bed, eight in a seat, never under two; half again the health in a bed
 *   - the plan: at 50–70 km the Whale or the Turtle, about as often each
 */
import { describe, expect, it } from 'vitest';
import { aboardOf } from '../../src/core/modcar/aboard';
import { stockBuild } from '../../src/core/modcar/build';
import { zonesFor } from '../../src/core/modcar/cargo';
import rvBox from '../../src/core/modcar/data/mounts/rv.json';
import turtleBox from '../../src/core/modcar/data/mounts/turtle.json';
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
    // Turtle has a left-rear side ladder mount matching Nomad Drive's camper van (finish.md §19 step 5)
    expect(f.mounts.some((m) => m.cat === 'ladder')).toBe(true);
    // (the Loaf's parts on it: a stock build has its engine, its seats, its doors)
    const b = stockBuild('turtle');
    for (const m of ['engine', 'seat_driver', 'seat_pass', 'door_side', 'trunk', 'hood']) expect(b.parts[m], m).toBeTruthy();
    // (in only with the roof up)
    expect(aboardOf('turtle')?.roof).toBe(true);
    expect(aboardOf('rv')?.roof).toBeFalsy();
  });

  it('its places for things lie inside its body, under the shell: the floor, and the decks at the back above it — no bed, no galley', () => {
    const f = frameDef('turtle');
    const zones = zonesFor('turtle', stockBuild('turtle'));
    for (const id of ['cabin', 'nook', 'pass']) expect(zones.some((z) => z.id === id), id).toBe(true);
    for (const id of ['bed', 'galley']) expect(zones.some((z) => (z.id as string) === id), id).toBe(false);
    for (const z of zones) {
      expect(z.x[0], z.id).toBeGreaterThanOrEqual(f.body.rear);
      expect(z.x[1], z.id).toBeLessThanOrEqual(f.body.front);
      expect(Math.max(Math.abs(z.z[0]), Math.abs(z.z[1])), z.id).toBeLessThanOrEqual(f.body.halfWidth);
      // (the floor is drawn looking down from the zone's top: under the shell's underside with the roof down, 2.04)
      expect(z.top, z.id).toBeLessThan(2.0);
    }
    const by = (id: string) => zones.find((z) => z.id === id)!;
    // (the deck over the rear axle 38 cm over the floor, as Nomad Drive's camper van's; the engine's behind it higher:
    // the room's back, by the tailgate too)
    expect(by('nook').floor).toBeGreaterThan(by('cabin').floor + 0.3);
    expect(by('nook').x[1]).toBeCloseTo(by('cabin').x[0], 6);
    expect(by('nook').via).toContain('trunk');
  });

  it('the beds: only the Whale’s bunk over the cab, inside its body over its floor; the Turtle, the Old Elephant, the Camel none built in', () => {
    // (docs/V3/plan/finish.md §十九 step 7: the living spaces empty shells, as Nomad Drive's campers are — its class C keeps
    // its bed over the cab; a bed anywhere else is one the player puts in, a camp cot)
    const f = frameDef('rv');
    const a = aboardOf('rv')!;
    const box = (rvBox as never as { bbox: { min: number[]; max: number[] } }).bbox;
    expect(a.beds).toHaveLength(1);
    const b = a.beds![0];
    expect(b.x0).toBeLessThan(b.x1);
    expect(b.z0).toBeLessThan(b.z1);
    expect(b.x1 - b.x0, 'long enough to lie on').toBeGreaterThan(0.9);
    expect(b.x0).toBeGreaterThanOrEqual(box.min[0]);
    expect(b.x1).toBeLessThanOrEqual(box.max[0]);
    expect(Math.max(Math.abs(b.z0), Math.abs(b.z1))).toBeLessThanOrEqual(f.body.halfWidth);
    // (over the cab: ahead of the living space's floor, high over it)
    expect(b.x0).toBeGreaterThan(Math.max(...a.areas.map((r) => r.x1)));
    expect(b.top).toBeGreaterThan(Math.min(...a.areas.map((r) => r.floor)) + 1.2);
    expect(b.top).toBeLessThan(f.body.top);
    for (const id of ['turtle', 'elephant', 'camel', 'snail', 'trailer']) expect(aboardOf(id)!.beds ?? [], id).toHaveLength(0);
    // (the Turtle's room: inside its body, behind the front seats, ahead of the deck over its rear axle)
    const t = aboardOf('turtle')!;
    const room = t.areas[0];
    const deck = (turtleBox as never as { room: { deck: { x: number[] } } }).room.deck;
    expect(room.x1).toBeLessThan(frameDef('turtle').mounts.find((m) => m.id === 'seat_driver')!.pos.x);
    expect(room.x0).toBeGreaterThanOrEqual(deck.x[1] - 1e-9);
    expect(room.z1 - room.z0, 'wall to wall').toBeGreaterThan(1.9);
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
    // (what a sleep mends — health, the bar's length: two an hour in a seat, five in a bed)
    const a = newVitals();
    const b = newVitals();
    a.hp = b.hp = 40;
    a.cap = b.cap = 60;
    a.energy = b.energy = 10;
    sleep(a, 4, VITALS, 100, false);
    sleep(b, 4, VITALS, 100, true);
    expect(a.energy).toBe(100);
    expect(b.energy).toBe(100);
    expect(a.cap).toBe(68);
    expect(b.cap).toBe(80);
    // (life comes back as it does awake, never over one's health)
    expect(a.hp).toBe(68);
    expect(b.hp).toBeCloseTo(40 + 400 / 12, 6);
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
