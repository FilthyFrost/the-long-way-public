/**
 * What makes one vehicle different from another, measured headless (docs/DESIGN_V2.md §5):
 * fuel at a steady cruise, the steepest loose or snowy slope it can climb from rest, and a robot
 * driver's record on generated roads (the same driver is the game's autopilot).
 */
import { AUTOPILOT } from '../../src/core/driver/autopilot';
import { clamp } from '../../src/core/math/util';
import { VehicleSim, zeroInput, type VehicleInput } from '../../src/core/vehicle/sim';
import type { VehicleSpec } from '../../src/core/vehicle/spec';
import { FlatGround, Surface } from '../../src/core/world/ground';
import { collectFeelMetrics } from './feel';
import { robotChecks } from './roadgen';
import { collectSystemsMetrics } from './systems';
import { collectCollideMetrics, solidsCostTest } from './collide';
import type { Metrics } from './scenarios';

const KMH = 1 / 3.6;

/** how the autopilot drives each vehicle (the table lives with the driver in src/core) */
export { AUTOPILOT };

/** Litres per 100 km at a steady 60 km/h on level asphalt (game-scale litres). */
export function fuelTest(spec: VehicleSpec): Metrics {
  if (!spec.fuel) return {};
  const ground = new FlatGround();
  const v = new VehicleSim(spec);
  v.reset(0, 0, 0, 0);
  const inp: VehicleInput = zeroInput();
  const target = 60 * KMH;
  let integ = 0;
  let steady = 0;
  let x0 = NaN;
  let f0 = 0;
  let t0 = 0;
  for (let t = 0; t < 600; t += v.h) {
    const err = target - v.vForward;
    integ = clamp(integ + err * 0.08 * v.h, 0, 0.9);
    inp.throttle = clamp(err * 0.5 + integ, 0, 1);
    v.substep(inp, ground);
    if (Number.isNaN(x0)) {
      steady = Math.abs(err) < 0.25 ? steady + v.h : 0;
      if (steady > 6) {
        x0 = v.px;
        f0 = v.fuelUsedL;
        t0 = v.time;
      }
    } else if (v.px - x0 >= 2000) {
      const km = (v.px - x0) / 1000;
      const used = v.fuelUsedL - f0;
      return { fuel_l_100km_cruise60: (used / km) * 100, fuel_range_km_cruise60: spec.fuel.tankL / (used / km), fuel_cruise_kmh: (km / (v.time - t0)) * 3600 };
    }
  }
  return { fuel_l_100km_cruise60: NaN, fuel_range_km_cruise60: NaN, fuel_cruise_kmh: NaN };
}

/** Steepest grade (%) the vehicle climbs from rest at full throttle: 20 m in 16 s and still moving. */
function maxClimb(spec: VehicleSpec, surface: number): number {
  let best = 0;
  for (let grade = 0.06; grade <= 0.8001; grade += 0.02) {
    const ground = new FlatGround({ slopeX: grade, surface });
    const v = new VehicleSim(spec);
    v.reset(0, 0, 0, 0);
    // stand it on the slope nose up (a level drop onto a steep slope throws the vehicle over)
    const th = Math.atan(grade);
    v.qz = v.pqz = Math.sin(th / 2);
    v.qw = v.pqw = Math.cos(th / 2);
    v.px = v.ppx = -Math.sin(th) * spec.cgHeight;
    v.py = v.ppy = Math.cos(th) * spec.cgHeight + 0.03;
    const hold = zeroInput();
    for (let t = 0; t < 6; t += v.h) v.substep(hold, ground);
    const x0 = v.px;
    const go: VehicleInput = { steer: 0, throttle: 1, brake: 0, handbrake: 0 };
    for (let t = 0; t < 16; t += v.h) v.substep(go, ground);
    if (v.px - x0 >= 20 && v.vForward > 0.5 && !v.exploded) best = grade;
    else break;
  }
  return best * 100;
}

export function climbTest(spec: VehicleSpec): Metrics {
  return { climb_gravel_max_pct: maxClimb(spec, Surface.Gravel), climb_snow_max_pct: maxClimb(spec, Surface.Snow) };
}

/** The autopilot's record with this vehicle on generated roads (dry). */
export function autopilotTest(spec: VehicleSpec): Metrics {
  const a = AUTOPILOT[spec.id] ?? AUTOPILOT.t0_truck;
  const m = robotChecks('auto', 0, 0, 8, { spec, cruiseKmh: a.cruiseKmh, latG: a.latG, km: 4 });
  return { auto_km: m.auto_km, auto_accidents_per_100km: m.auto_accidents_per_100km, auto_lane_rms_m: m.auto_lane_rms_m, auto_mean_kmh: m.auto_mean_kmh, auto_max_lat_g: m.auto_max_lat_g };
}

export function collectVehicleMetrics(spec: VehicleSpec): Metrics {
  return { ...fuelTest(spec), ...climbTest(spec), ...autopilotTest(spec), ...collectFeelMetrics(spec), ...collectSystemsMetrics(spec), ...collectCollideMetrics(spec), ...(spec.id === 't0_truck' ? solidsCostTest(spec) : {}) };
}
