/**
 * Tyre wear as Drive Beyond Horizons has it (src/core/modcar/tyres.ts, docs/MODCAR.md §18): four stages of a
 * quarter of a tyre's life each (a road tyre: 40 km of asphalt, ten a stage); rough ground wears a road tyre
 * faster and an off-road tyre slower; sliding six times as fast; in the last stage a tyre may blow, more readily
 * bald and on gravel, and it does: flat, its corner down, said so; a worn tyre in the wet keeps less of its grip.
 */
import { describe, expect, it } from 'vitest';
import { stockBuild } from '../../src/core/modcar/build';
import { partDef } from '../../src/core/modcar/parts';
import { ModSystems, type ModEnv } from '../../src/core/modcar/systems';
import { burstPerKm, kmLeft, SLIDE_WEAR, TYRE_STAGES, tyreStage, wearPerMetre, wetGrip } from '../../src/core/modcar/tyres';
import { SURFACE_N } from '../../src/core/modcar/derive';
import { VehicleSim, type VehicleInput } from '../../src/core/vehicle/sim';
import type { VehicleSpec } from '../../src/core/vehicle/spec';
import { FlatGround, Surface } from '../../src/core/world/ground';

const ENV: ModEnv = { ambientC: 18, dark: false, rain: 0, sun: 1 };

function rig(): { sys: ModSystems; sim: VehicleSim; ground: FlatGround } {
  const sys = new ModSystems(stockBuild('sedan'));
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

describe('ModCar tyre wear (Drive Beyond Horizons)', () => {
  it('has four stages, a quarter of the tread each: new, a little worn, very worn, good luck', () => {
    expect(TYRE_STAGES.map((s) => s.zh)).toEqual(['全新', '有点磨损', '很旧', '听天由命']);
    expect([1, 0.8, 0.76, 0.75, 0.6, 0.5, 0.3, 0.25, 0.1, 0].map(tyreStage)).toEqual([0, 0, 0, 1, 1, 2, 2, 3, 3, 3]);
  });

  it('a road tyre lasts 40 km of asphalt, ten a stage; rough ground wears it faster, an off-road tyre slower, a slick fastest', () => {
    const road = partDef('tire_road').tire!;
    const off = partDef('tire_offroad').tire!;
    const slick = partDef('tire_slick').tire!;
    expect(1 / (wearPerMetre(road, Surface.Asphalt) * 1000)).toBeCloseTo(40, 6);
    // (a stage is ten kilometres of asphalt)
    let tread = 1;
    let km = 0;
    const at: number[] = [];
    while (tread > 0) {
      tread -= wearPerMetre(road, Surface.Asphalt) * 100;
      km += 0.1;
      const st = tyreStage(tread);
      if (at.length < st) at.push(km);
    }
    expect(at.map((x) => Math.round(x))).toEqual([10, 20, 30]);
    expect(Math.round(km)).toBe(40);
    expect(wearPerMetre(road, Surface.Gravel)).toBeGreaterThan(wearPerMetre(road, Surface.Asphalt));
    expect(wearPerMetre(off, Surface.Gravel)).toBeLessThan(wearPerMetre(off, Surface.Asphalt));
    expect(wearPerMetre(off, Surface.Gravel)).toBeLessThan(wearPerMetre(road, Surface.Gravel) / 2);
    expect(wearPerMetre(slick, Surface.Asphalt)).toBeGreaterThan(2 * wearPerMetre(road, Surface.Asphalt));
    expect(SLIDE_WEAR).toBe(6);
    expect(kmLeft(road, 0.5)).toEqual({ bald: 20, lastStage: 10 });
  });

  it('only a tyre in its last stage may blow, the balder the likelier, more on rough ground', () => {
    expect(burstPerKm(0.3, Surface.Asphalt)).toBe(0);
    expect(burstPerKm(0.25, Surface.Asphalt)).toBeCloseTo(0.02, 6);
    expect(burstPerKm(0, Surface.Asphalt)).toBeCloseTo(0.15, 6);
    expect(burstPerKm(0.1, Surface.Asphalt)).toBeGreaterThan(burstPerKm(0.2, Surface.Asphalt));
    expect(burstPerKm(0.1, Surface.Gravel)).toBeCloseTo(burstPerKm(0.1, Surface.Asphalt) * 2.5, 6);
  });

  it('a worn tyre keeps less of its grip in the wet, on hard ground: a new one, or a dry road, no less', () => {
    expect(wetGrip(1, 1, Surface.Asphalt)).toBe(1);
    expect(wetGrip(0, 0, Surface.Asphalt)).toBe(1);
    expect(wetGrip(0, 1, Surface.Asphalt)).toBeCloseTo(0.65, 6);
    expect(wetGrip(0.5, 1, Surface.Asphalt)).toBeGreaterThan(0.85);
    expect(wetGrip(0, 1, Surface.Grass)).toBe(1);
  });

  it('driven on a bald tyre, sooner or later it blows: flat, its corner down, said so; the wet takes the worn tyres grip', () => {
    const r = rig();
    r.sys.crank(true);
    run(r, 1.5);
    r.sys.crank(false);
    r.sim.setParkBrake(false);
    const hubs = r.sys.derived.wheels;
    const tyre = r.sys.build.parts[hubs[0].hub].sub.tire!;
    tyre.tread = 0.02;
    const mu0 = r.sim.mods.mu[0 * SURFACE_N + Surface.Asphalt];
    run(r, 1, { throttle: 0.4 }, { ...ENV, wet: 1 });
    expect(r.sim.mods.mu[0 * SURFACE_N + Surface.Asphalt]).toBeLessThan(mu0 * 0.8);
    // (some kilometres at speed: at a seventh of a chance a kilometre, a blow-out is all but certain)
    for (let k = 0; k < 40 && !tyre.flat; k++) run(r, 30, { throttle: 0.6 });
    expect(tyre.flat).toBe(true);
    expect(r.sys.bursts).toBeGreaterThan(0);
    expect(r.sys.derived.radiusDrop[r.sys.burstWheel]).toBeGreaterThan(0);
    expect(r.sys.dash.tyres.some((t) => t.flat)).toBe(true);
  });
});
