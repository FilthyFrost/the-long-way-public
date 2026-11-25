/**
 * The narrow link from a derived build to the simulation: the spec goes in through applySpec (in place —
 * the vehicle keeps its pose and speed), the per-wheel facts through SimMods. The ModCar systems
 * (systems.ts) add the live multipliers (temperature, fuel, turbo lag) on top every step.
 */
import type { VehicleSim } from '../vehicle/sim';
import type { VehicleSpec } from '../vehicle/spec';
import { SURFACE_N, type Derived } from './derive';

/** put a derived build in force on a simulation (first = the simulation was just made with this spec) */
export function applyToSim(sim: VehicleSim, d: Derived, first = false): void {
  if (!first) sim.applySpec(d.spec as VehicleSpec);
  applyWheelMods(sim, d);
  // (docs/V3/plan/finish.md §四.1: a built vehicle stays on its wheels — a tall one slides where it would have gone over)
  sim.rollGuard = true;
}

/** grip, rolling resistance and radius differences of each wheel, and the steering's free play */
export function applyWheelMods(sim: VehicleSim, d: Derived): void {
  const m = sim.mods;
  for (let i = 0; i < 4; i++) {
    const w = d.wheels[i];
    for (let k = 0; k < SURFACE_N; k++) {
      m.mu[i * SURFACE_N + k] = w.grip[k] ?? 1;
      m.rr[i * SURFACE_N + k] = w.rr;
    }
    m.radiusDrop[i] = d.radiusDrop[i];
    m.radiusOffset[i] = d.radiusOffset[i];
    m.wheelFit[i] = w.fit;
  }
  m.steerPlay = d.steerPlayRad;
}
