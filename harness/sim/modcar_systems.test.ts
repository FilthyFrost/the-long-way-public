/**
 * ModCar systems (docs/MODCAR.md §3): the key, fuel by type, heat, the battery, a missing gearbox, turbo
 * lag — what the parts that are fitted actually do once the vehicle is running.
 */
import { describe, expect, it } from 'vitest';
import { decodeBuild, fitPart, fitSub, newInstance, removePart, stockBuild } from '../../src/core/modcar/build';
import { installSeconds, PARTS, partDef, TYRE_SWAP_S } from '../../src/core/modcar/parts';
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

  it('a water-cooled V8 without a radiator boils and wears itself out, then limps (J7: it does not seize); an air-cooled six does not care', () => {
    const r = rig(decodeBuild('stock:sedan;engine=eng_v8;-radiator', { fuel: 1 }));
    start(r);
    r.sim.setParkBrake(false);
    let maxC = 0;
    for (let t = 0; t < 600 && r.sys.build.parts.engine.cond > 0; t += 5) {
      run(r, 5, { throttle: 0.9 });
      maxC = Math.max(maxC, r.sys.coolantC);
    }
    expect(maxC).toBeGreaterThan(112);
    expect(r.sys.build.parts.engine.cond).toBe(0);
    // worn out, it still runs — a limp, no faster than 38 km/h
    expect(r.sys.running).toBe(true);
    run(r, 25, { throttle: 0, brake: 1 });
    run(r, 40, { throttle: 1 });
    expect(r.sim.kmh).toBeGreaterThan(10);
    expect(r.sim.kmh).toBeLessThan(42);

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

  it('a crash hurts what is at that end, a ram takes most of it, and a head-on split lets the coolant go', () => {
    const knock = (text: string, speed: number) => {
      const r = rig(decodeBuild(text));
      const rad = r.sys.build.parts.radiator;
      const coolant = rad?.fluids.coolantL ?? 0;
      r.sim.hits++;
      r.sim.lastHitSpeed = speed;
      r.sim.lastHitFront = true;
      r.sys.update(1 / 30, ENV);
      const p = r.sys.build.parts;
      return { bumper: p.bumperFront?.cond ?? 1, lamp: p.headlight_L.cond, rear: p.taillight_L.cond, coolant: rad?.fluids.coolantL ?? 0, coolant0: coolant, said: r.sys.dash.message?.code };
    };
    // a nudge does nothing
    const soft = knock('stock:sedan', 2);
    expect(soft.bumper).toBe(1);
    expect(soft.lamp).toBe(1);
    // into a wall at 50 km/h: the bumper and the lamps are wrecked, the boot end untouched, the radiator split
    const hard = knock('stock:sedan', 14);
    expect(hard.bumper).toBeLessThan(0.6);
    expect(hard.lamp).toBeLessThan(0.5);
    expect(hard.rear).toBe(1);
    expect(hard.coolant).toBeLessThan(hard.coolant0 * 0.5);
    expect(hard.said).toBe('crash');
    // the same with a spiked ram on the front: the lamps behind it keep most of their condition
    const rammed = knock('stock:sedan;bumperFront=bf_ram', 14);
    expect(rammed.lamp).toBeGreaterThan(hard.lamp + 0.3);
  });
});


describe('ModCar hands and wear', () => {
  it('every part goes on and comes off within a second (an engine by its weight, the big diesel the longest)', () => {
    for (const p of PARTS) {
      const s = installSeconds(p);
      expect(s, p.id).toBeGreaterThan(0);
      expect(s, p.id).toBeLessThanOrEqual(1);
    }
    expect(installSeconds(partDef('eng_d6'))).toBe(1);
    expect(installSeconds(partDef('eng_i4'))).toBeLessThan(installSeconds(partDef('eng_v8')));
    expect(TYRE_SWAP_S).toBeLessThanOrEqual(1);
  });

  it('a tyre worn down slides as it wears, not only after the next part goes on', () => {
    const r = rig(stockBuild('sedan'));
    start(r);
    r.sim.setParkBrake(false);
    run(r, 2, { throttle: 0.5 });
    const tyre = r.sys.build.parts[r.sys.derived.wheels[0].hub].sub.tire!;
    const mu0 = r.sim.mods.mu[0];
    // (as if the miles had worn it: the next stretch of road puts the grip it has left in force)
    tyre.tread = 0.2;
    run(r, 1, { throttle: 0.5 });
    expect(r.sim.mods.mu[0]).toBeCloseTo((mu0 * (0.75 + 0.25 * tyre.tread)) / (0.75 + 0.25 * 1), 3);
  });
});

describe('the fuel gauge keeps a reserve under its bottom (docs/V3/plan/finish.md §四.2)', () => {
  it('two litres in the tank: the needle at the bottom, the lamp on, and it still starts and drives — some kilometres yet', async () => {
    const { fuelReserve } = await import('../../src/core/modcar/systems');
    const { tankFuel } = await import('../../src/core/modcar/derive');
    const full = rig(stockBuild('sedan', { fuel: 1 }));
    run(full, 0.1);
    expect(full.sys.dash.fuel).toBe(1);
    expect(full.sys.dash.lamps.fuel).toBe(false);
    const tank = full.sys.dash.tankL;
    expect(fuelReserve(tank)).toBe(2);
    // (a small tank: an eighth of it)
    expect(fuelReserve(8)).toBe(1);
    // half a tank reads a little under the half (the reserve is below the scale)
    const half = rig(stockBuild('sedan', { fuel: 0.5 }));
    run(half, 0.1);
    expect(half.sys.dash.fuel).toBeCloseTo((tank * 0.5 - 2) / (tank - 2), 6);
    // down to the reserve: the lamp came on before (at a tenth of the tank), the needle is at the bottom
    const low = rig(stockBuild('sedan', { fuel: 2 / tank }));
    run(low, 0.1);
    expect(low.sys.dash.fuelL).toBeCloseTo(2, 6);
    expect(low.sys.dash.fuel).toBe(0);
    expect(low.sys.dash.lamps.fuel).toBe(true);
    start(low);
    expect(low.sys.running).toBe(true);
    low.sim.setParkBrake(false);
    const x0 = low.sim.px;
    run(low, 60, { throttle: 0.5 });
    // (a minute at half throttle on the reserve: still running, a kilometre on)
    expect(low.sys.running).toBe(true);
    expect(low.sim.px - x0).toBeGreaterThan(800);
    expect(tankFuel(low.sys.build).total).toBeGreaterThan(0);
    const lamp = rig(stockBuild('sedan', { fuel: 0.09 }));
    run(lamp, 0.1);
    expect(lamp.sys.dash.lamps.fuel).toBe(true);
    expect(lamp.sys.dash.fuel).toBeGreaterThan(0);
  });
});
