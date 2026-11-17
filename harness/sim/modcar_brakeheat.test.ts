/**
 * The brakes' heat (docs/MODCAR.md §22, src/core/modcar/brakeHeat.ts and systems.ts): cold they bite fully; a
 * string of hard stops from a hundred heats them until they fade and the stops grow longer — a drum's first, a
 * plain disc's next, a sport disc's hardly; a long hill ridden down on the brakes fades a drum and not a vented
 * disc; a few minutes' driving and they bite again; a new brake comes on cold; the car says so once; no brakes,
 * no heat.
 */
import { describe, expect, it } from 'vitest';
import { BRAKE_HEAT, brakeBite, stepBrakeHeat } from '../../src/core/modcar/brakeHeat';
import { fitPart, newInstance, removePart, stockBuild } from '../../src/core/modcar/build';
import { ModSystems, type ModEnv } from '../../src/core/modcar/systems';
import { VehicleSim, type VehicleInput } from '../../src/core/vehicle/sim';
import type { VehicleSpec } from '../../src/core/vehicle/spec';
import { FlatGround } from '../../src/core/world/ground';

const ENV: ModEnv = { ambientC: 18, dark: false, rain: 0, sun: 1 };

function rig(brakes: string | null, slope = 0): { sys: ModSystems; sim: VehicleSim; ground: FlatGround } {
  const b = stockBuild('sedan');
  for (const m of ['brakes_F', 'brakes_R']) {
    if (brakes) fitPart(b, m, newInstance(brakes));
    else removePart(b, m);
  }
  const sys = new ModSystems(b);
  const sim = new VehicleSim(sys.derived.spec as VehicleSpec);
  const ground = new FlatGround({ slopeX: slope });
  sim.reset(0, 0.05, 0, 0, ground);
  sys.bind(sim);
  return { sys, sim, ground };
}

/** four physics steps and one of the systems', as the game does */
function step(r: ReturnType<typeof rig>, input: Partial<VehicleInput>): void {
  const inp: VehicleInput = { steer: 0, throttle: 0, brake: 0, handbrake: 0, ...input };
  for (let i = 0; i < 4; i++) r.sim.substep(inp, r.ground);
  r.sys.update(4 / 120, ENV);
}

function start(r: ReturnType<typeof rig>): void {
  r.sys.crank(true);
  for (let i = 0; i < 45; i++) step(r, {});
  r.sys.crank(false);
  r.sim.setParkBrake(false);
}

/** stops from 100 km/h, one after another: each one's length (m) and how much the front brakes still bite after it */
function stops(r: ReturnType<typeof rig>, n: number): { m: number; bite: number }[] {
  const out: { m: number; bite: number }[] = [];
  for (let k = 0; k < n; k++) {
    for (let t = 0; r.sim.kmh < 100 && t < 60; t += 4 / 120) step(r, { throttle: 1 });
    const x0 = r.sim.px;
    while (r.sim.kmh > 3) step(r, { brake: 1 });
    out.push({ m: r.sim.px - x0, bite: r.sim.mods.brake[0] });
  }
  return out;
}

/** ridden down a hill at 60 km/h on the brakes for `seconds`: how much the front brakes still bite */
function hill(r: ReturnType<typeof rig>, seconds: number): number {
  for (let t = 0; t < seconds; t += 4 / 120) {
    const v = r.sim.kmh;
    step(r, { brake: Math.min(1, Math.max(0, (v - 60) * 0.12)), throttle: v < 50 ? 0.3 : 0 });
  }
  return r.sim.mods.brake[0];
}

describe('modcar · the brakes heat up and fade', () => {
  it('the model: heat goes in and comes out, never below the air; a brake bites fully until its heat', () => {
    const s = BRAKE_HEAT.disc;
    expect(brakeBite(s, 0)).toBe(1);
    expect(brakeBite(s, s.fadeAt)).toBe(1);
    expect(brakeBite(s, s.fadeAt + s.fadeSpan)).toBeCloseTo(1 - s.fadeMax, 9);
    expect(brakeBite(s, 10000)).toBeCloseTo(1 - s.fadeMax, 9);
    let t = 0;
    for (let i = 0; i < 100; i++) t = stepBrakeHeat(t, s, 20, 10, 0.1);
    expect(t).toBeGreaterThan(100);
    const hot = t;
    for (let i = 0; i < 100; i++) t = stepBrakeHeat(t, s, 0, 20, 0.1);
    expect(t).toBeLessThan(hot);
    expect(t).toBeGreaterThan(0);
    // (a long step does not overshoot the heat it is heading for)
    expect(stepBrakeHeat(0, s, 5, 10, 1e6)).toBeCloseTo(stepBrakeHeat(0, s, 5, 10, 1e7), 6);
  });

  it('cold, a factory sedan stops as it always did', () => {
    const r = rig('brakes_disc');
    start(r);
    const [first] = stops(r, 1);
    expect(first.bite).toBe(1);
    expect(first.m).toBeGreaterThan(35);
    expect(first.m).toBeLessThan(60);
  });

  it('hard stops one after another: drums fade first, then plain discs; sport discs hardly', () => {
    const fadeAt = (s: { bite: number }[]): number => s.findIndex((x) => x.bite < 0.9);
    const drum = stops((() => { const r = rig('brakes_drum'); start(r); return r; })(), 6);
    const disc = stops((() => { const r = rig('brakes_disc'); start(r); return r; })(), 6);
    const sport = stops((() => { const r = rig('brakes_sport'); start(r); return r; })(), 6);
    expect(fadeAt(drum)).toBeGreaterThanOrEqual(1);
    expect(fadeAt(drum)).toBeLessThan(fadeAt(disc));
    expect(fadeAt(disc)).toBeGreaterThanOrEqual(2);
    // (and the stops grow: a drum's last half as long again as its first; a sport disc's barely)
    expect(drum[5].m).toBeGreaterThan(drum[0].m * 1.5);
    expect(disc[5].m).toBeGreaterThan(disc[0].m * 1.2);
    expect(sport[5].m).toBeLessThan(sport[0].m * 1.1);
  });

  it('a long hill on the brakes fades a drum, not a vented disc; driving on, they bite again', () => {
    const drum = rig('brakes_drum', -0.08);
    start(drum);
    expect(hill(drum, 200)).toBeLessThan(0.85);
    const vented = rig('brakes_vented', -0.08);
    start(vented);
    expect(hill(vented, 200)).toBe(1);
    // (on the flat at 60 km/h, four minutes later)
    drum.ground.opts.slopeX = 0;
    for (let t = 0; t < 240; t += 4 / 120) step(drum, { throttle: drum.sim.kmh < 60 ? 0.6 : 0.15 });
    expect(drum.sim.mods.brake[0]).toBeGreaterThan(0.95);
  });

  it('says so once when they fade; a new brake comes on cold; no brakes, no heat', () => {
    const r = rig('brakes_drum');
    start(r);
    // (every message as it comes up, once each time it does)
    const said: string[] = [];
    let was = '';
    const watch = (input: Partial<VehicleInput>): void => {
      step(r, input);
      const m = r.sys.dash.message?.code ?? '';
      if (m && m !== was) said.push(m);
      was = m;
    };
    for (let k = 0; k < 5; k++) {
      for (let t = 0; r.sim.kmh < 100 && t < 60; t += 4 / 120) watch({ throttle: 1 });
      while (r.sim.kmh > 3) watch({ brake: 1 });
    }
    expect(said.filter((c) => c === 'brakes_hot')).toHaveLength(1);
    expect(r.sys.brakeHeat[0]).toBeGreaterThan(BRAKE_HEAT.drum.fadeAt);
    expect(r.sys.dash.brakes[0].c).toBeCloseTo(18 + r.sys.brakeHeat[0], 6);
    fitPart(r.sys.build, 'brakes_F', newInstance('brakes_disc'));
    r.sys.rebuild();
    expect(r.sys.brakeHeat[0]).toBe(0);
    expect(r.sys.brakeHeat[2]).toBeGreaterThan(0);
    const none = rig(null);
    start(none);
    for (let i = 0; i < 200; i++) step(none, { throttle: 1, brake: 1 });
    expect(none.sys.brakeHeat).toEqual([0, 0, 0, 0]);
    expect([...none.sim.mods.brake]).toEqual([1, 1, 1, 1]);
  });
});
