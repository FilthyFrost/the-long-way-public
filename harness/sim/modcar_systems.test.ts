/**
 * ModCar systems (docs/MODCAR.md §3): the key, fuel by type, heat, the battery, a missing gearbox, turbo
 * lag — what the parts that are fitted actually do once the vehicle is running.
 */
import { describe, expect, it } from 'vitest';
import { decodeBuild, fitPart, fitSub, newInstance, removePart, stockBuild } from '../../src/core/modcar/build';
import { ModSystems, type ModEnv } from '../../src/core/modcar/systems';
import type { Build } from '../../src/core/modcar/types';
import { VehicleSim, type VehicleInput } from '../../src/core/vehicle/sim';
import type { VehicleSpec } from '../../src/core/vehicle/spec';
import { FlatGround } from '../../src/core/world/ground';

const ENV: ModEnv = { ambientC: 18, dark: false, rain: 0, sun: 1 };

function rig(build: Build): { sys: ModSystems; sim: VehicleSim; ground: FlatGround } {
  const sys = new ModSystems(build);
  const sim = new VehicleSim(sys.derived.spec as VehicleSpec);
  sim.reset(0, 0, 0, 0);
  sys.bind(sim);
  return { sys, sim, ground: new FlatGround() };
}

/** run for `seconds` with fixed pedals; systems step every 4 physics steps like the game */
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

describe('ModCar systems', () => {
  it('a factory sedan starts on the key, drives, burns fuel and warms up', () => {
    const r = rig(stockBuild('sedan'));
    start(r);
    expect(r.sys.running).toBe(true);
    const fuel0 = r.sys.dash.fuel;
    r.sim.setParkBrake(false);
    run(r, 25, { throttle: 1 });
    expect(r.sim.kmh).toBeGreaterThan(70);
    expect(r.sys.dash.fuel).toBeLessThan(fuel0);
    run(r, 120, { throttle: 0.45 });
    expect(r.sys.coolantC).toBeGreaterThan(70);
    expect(r.sys.coolantC).toBeLessThan(108);
    expect(r.sys.dash.message).toBeNull();
  });

  it('no battery or a flat one: the starter will not turn and it says why', () => {
    const b = stockBuild('sedan');
    removePart(b, 'battery');
    const r = rig(b);
    r.sys.crank(true);
    run(r, 1);
    expect(r.sys.running).toBe(false);
    expect(r.sys.dash.message?.code).toBe('no_battery');
    const flat = stockBuild('sedan');
    flat.parts.battery.fluids.charge = 0.03;
    const r2 = rig(flat);
    r2.sys.crank(true);
    run(r2, 1);
    expect(r2.sys.running).toBe(false);
    expect(r2.sys.dash.message?.code).toBe('battery_flat');
  });

  it('diesel in a petrol engine catches, coughs and dies', () => {
    const b = stockBuild('sedan');
    b.parts.fuelTank.fluids.fuel = { diesel: 25 };
    const r = rig(b);
    r.sys.crank(true);
    run(r, 1.5);
    r.sys.crank(false);
    run(r, 4, { throttle: 0.3 });
    expect(r.sys.running).toBe(false);
  });

  it('a water-cooled V8 without a radiator boils and seizes; an air-cooled six does not care', () => {
    const r = rig(decodeBuild('stock:sedan;engine=eng_v8;-radiator', { fuel: 1 }));
    start(r);
    r.sim.setParkBrake(false);
    let maxC = 0;
    for (let t = 0; t < 240 && r.sys.running; t += 5) {
      run(r, 5, { throttle: 0.9 });
      maxC = Math.max(maxC, r.sys.coolantC);
    }
    expect(maxC).toBeGreaterThan(112);
    expect(r.sys.running).toBe(false);
    expect(r.sys.build.parts.engine.cond).toBe(0);

    const a = rig(decodeBuild('stock:sedan;engine=eng_flat6;-radiator', { fuel: 1 }));
    start(a);
    a.sim.setParkBrake(false);
    run(a, 120, { throttle: 0.6 });
    expect(a.sys.running).toBe(true);
    expect(a.sys.coolantC).toBeLessThan(112);
  });

  it('no gearbox: the engine revs and nothing moves', () => {
    const r = rig(decodeBuild('stock:sedan;-gearbox'));
    start(r);
    expect(r.sys.running).toBe(true);
    r.sim.setParkBrake(false);
    run(r, 5, { throttle: 1 });
    expect(r.sim.rpm).toBeGreaterThan(2500);
    expect(r.sim.kmh).toBeLessThan(1);
  });

  it('lamps drain a parked battery; the alternator puts it back', () => {
    const r = rig(stockBuild('sedan'));
    r.sys.lights = 'high';
    const c0 = r.sys.dash.battery || r.sys.build.parts.battery.fluids.charge!;
    run(r, 120);
    const c1 = r.sys.build.parts.battery.fluids.charge!;
    expect(c1).toBeLessThan(c0);
    r.sys.lights = 'off';
    start(r);
    run(r, 120, { throttle: 0.1 });
    expect(r.sys.build.parts.battery.fluids.charge!).toBeGreaterThan(c1);
  });

  it('a turbo takes its time to come in', () => {
    const r = rig(decodeBuild('stock:sedan;engine=eng_i4+turbo:turbo_small'));
    start(r);
    r.sim.setParkBrake(false);
    run(r, 6, { throttle: 1 });
    expect(r.sys.boost).toBeGreaterThan(0.6);
    // lift off and floor it again: the boost has to build up first
    run(r, 2, { throttle: 0 });
    run(r, 0.1, { throttle: 1 });
    expect(r.sys.boost).toBeLessThan(0.4);
  });

  it('fitting tractor tyres to a parked car does not launch it', () => {
    const r = rig(stockBuild('sedan'));
    run(r, 2);
    for (const hub of ['hub_FL', 'hub_FR', 'hub_RL', 'hub_RR']) {
      const rim = newInstance('rim_off16');
      fitSub(rim, 'tire', newInstance('tire_tractor'));
      fitPart(r.sys.build, hub, rim);
    }
    r.sys.rebuild();
    let maxV = 0;
    for (let i = 0; i < 6; i++) {
      run(r, 0.5);
      maxV = Math.max(maxV, Math.abs(r.sim.vy), r.sim.speed);
    }
    expect(r.sim.exploded).toBe(false);
    expect(maxV).toBeLessThan(3);
  });
});
