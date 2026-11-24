/**
 * J7 (docs/V3/plan/growth.md §五): the car's wear, as rules.
 *   - the engine wears running, fourteen points an hour (the hard difficulty's 1.3 times); past 112 °C much faster;
 *     worn out it limps rather than seizing
 *   - it burns oil by how worn it is: a sound one hardly any, a worn one up to a litre an hour
 *   - the radiator loses water running, coolant three times slower; poured in, a mix
 *   - dirt by the ground (asphalt 0.024 a kilometre, soft ground 0.15); the rain washes some off
 *   - pushed with the engine off, a flat battery takes a little (enough to crank once)
 *   - the mending kits (Nomad Drive's): the engine +50, a tyre +50 with its flat fixed and tread back, the battery +65
 *   - a part's condition in four words
 */
import { describe, expect, it } from 'vitest';
import { decodeBuild, mendPart, newInstance, TYRE_KIT_TREAD } from '../../src/core/modcar/build';
import { ModSystems, type ModEnv } from '../../src/core/modcar/systems';
import type { Build } from '../../src/core/modcar/types';
import { VehicleSim, type VehicleInput } from '../../src/core/vehicle/sim';
import type { VehicleSpec } from '../../src/core/vehicle/spec';
import { FlatGround } from '../../src/core/world/ground';
import { newTool, pour } from '../../src/core/modcar/tools';
import { condWord } from '../../src/game/modcar/cards';

const ENV: ModEnv = { ambientC: 18, dark: false, rain: 0, sun: 1 };

function rig(build: Build): { sys: ModSystems; sim: VehicleSim; ground: FlatGround } {
  const sys = new ModSystems(build);
  const sim = new VehicleSim(sys.derived.spec as VehicleSpec);
  sim.reset(0, 0, 0, 0);
  sys.bind(sim);
  return { sys, sim, ground: new FlatGround() };
}

function run(r: ReturnType<typeof rig>, seconds: number, input: Partial<VehicleInput> = {}, env = ENV): void {
  const inp: VehicleInput = { steer: 0, throttle: 0, brake: 0, handbrake: 0, ...input };
  const n = Math.round(seconds * 120);
  for (let i = 0; i < n; i++) {
    r.sim.substep(inp, r.ground);
    if (i % 4 === 3) r.sys.update(4 / 120, env);
  }
}

function start(r: ReturnType<typeof rig>): void {
  r.sys.crank(true);
  run(r, 1.5);
  r.sys.crank(false);
}

describe('J7: the car wears', () => {
  it('the engine: fourteen points an hour idling, the hard difficulty faster; the oil it burns by how worn it is', () => {
    const r = rig(decodeBuild('stock:sedan', { fuel: 1 }));
    const eng = r.sys.build.parts.engine;
    eng.cond = 1;
    start(r);
    const oil0 = eng.fluids.oilL!;
    run(r, 600);
    // (ten minutes: 2.3 points; a sound engine burns 0.02 L an hour)
    expect(1 - eng.cond).toBeCloseTo(0.14 / 6, 3);
    expect(oil0 - eng.fluids.oilL!).toBeCloseTo(0.02 / 6 + (0.98 * 0.0117) / 6, 2);
    // a worn one: up to a litre an hour
    const w = rig(decodeBuild('stock:sedan', { fuel: 1 }));
    const we = w.sys.build.parts.engine;
    we.cond = 0.45;
    w.sys.wearK = 1.3;
    start(w);
    const o1 = we.fluids.oilL!;
    run(w, 600);
    expect(0.45 - we.cond).toBeCloseTo((0.14 / 6) * 1.3, 3);
    const burnt = o1 - we.fluids.oilL!;
    expect(burnt * 6).toBeGreaterThan(0.55 * 1.3 * 0.95);
    expect(burnt * 6).toBeLessThan(0.6 * 1.3 * 1.05);
  });

  it('the radiator: water goes running, coolant slower; pouring coolant makes a mix', () => {
    const r = rig(decodeBuild('stock:sedan', { fuel: 1 }));
    const rad = r.sys.build.parts.radiator;
    rad.fluids.coolantL = 5;
    start(r);
    run(r, 600);
    expect(5 - rad.fluids.coolantL!).toBeCloseTo(0.25 / 6, 3);
    // half the water out, coolant poured in: a mix
    rad.fluids.coolantL = 2.5;
    const jug = newTool('bottle', { litres: 5 });
    jug.coolant = true;
    let moved = 0;
    for (let i = 0; i < 200; i++) moved += pour(jug, r.sys.build, 0.05);
    expect(moved).toBeCloseTo(2.5, 6);
    expect(rad.fluids.coolantMix).toBeCloseTo(0.5, 6);
    const l = rad.fluids.coolantL!;
    run(r, 600);
    expect(l - rad.fluids.coolantL!).toBeCloseTo((0.25 * 0.5 + 0.08 * 0.5) / 6, 3);
  });

  it('dirt by the ground: 0.024 a kilometre on asphalt; the rain washes it', () => {
    const r = rig(decodeBuild('stock:sedan', { fuel: 1 }));
    r.sys.build.dirt = 0;
    start(r);
    r.sim.setParkBrake(false);
    const odo0 = r.sim.odometer;
    run(r, 60, { throttle: 0.6 }, { ...ENV, surface: 0 });
    const km = (r.sim.odometer - odo0) / 1000;
    expect(km).toBeGreaterThan(0.3);
    expect(r.sys.build.dirt / km).toBeCloseTo(0.024, 3);
    const d = r.sys.build.dirt;
    run(r, 60, { throttle: 0, brake: 1 }, { ...ENV, rain: 1, surface: 0 });
    expect(r.sys.build.dirt).toBeLessThan(d);
  });

  it('pushed with the engine off, a flat battery takes enough to crank once', () => {
    const r = rig(decodeBuild('stock:sedan', { fuel: 1 }));
    const bat = r.sys.build.parts.battery;
    bat.fluids.charge = 0;
    r.sim.setParkBrake(false);
    // (rolled 100 m: as one pushes it)
    for (let i = 0; i < 200; i++) {
      r.sim.vx = 3;
      run(r, 0.25);
    }
    expect(r.sim.odometer).toBeGreaterThan(80);
    expect(bat.fluids.charge).toBeGreaterThan(0.08);
    expect(bat.fluids.charge).toBeLessThanOrEqual(0.12);
  });

  it("the mending kits (Nomad Drive's): the engine +50, a tyre +50 and its flat fixed and tread back, the battery +65; nothing else", () => {
    const eng = newInstance('eng_i4', { cond: 0.3 });
    expect(mendPart(eng, 'engine', 0.5)).toBe(true);
    expect(eng.cond).toBeCloseTo(0.8, 6);
    mendPart(eng, 'engine', 0.5);
    expect(eng.cond).toBe(1);
    const tyre = newInstance('tire_road', { tread: 0.2, cond: 0.4 });
    tyre.flat = true;
    expect(mendPart(tyre, 'tire', 0.5)).toBe(true);
    expect(tyre.flat).toBe(false);
    expect(tyre.tread).toBeCloseTo(0.2 + TYRE_KIT_TREAD, 6);
    expect(tyre.cond).toBeCloseTo(0.9, 6);
    const bat = newInstance('bat_std', { charge: 0.1 });
    expect(mendPart(bat, 'battery', 0.65)).toBe(true);
    expect(bat.fluids.charge).toBeCloseTo(0.75, 6);
    expect(mendPart(newInstance('door_stock'), 'engine', 0.5)).toBe(false);
    expect(mendPart(newInstance('rim_steel13'), 'tire', 0.5)).toBe(false);
  });

  it("a part's condition in four words", () => {
    expect([0.1, 0.45, 0.7, 0.9].map(condWord)).toEqual(['差', '一般', '好', '很好']);
  });
});
