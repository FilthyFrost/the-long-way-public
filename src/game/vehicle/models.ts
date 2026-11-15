/**
 * Which model draws which vehicle. Vehicles without a model of their own yet are drawn with the
 * truck's (one console warning per vehicle), so every spec can already be driven.
 */
import { T0_TRUCK, VEHICLES, type VehicleSpec } from '../../core/vehicle/spec';
import type { VehicleParts } from './kit';
import { buildOffroad } from './offroad';
import { buildRV } from './rv';
import { buildTruck } from './truck';
import { buildVan } from './van';

export const MODELS: Record<string, (spec: VehicleSpec) => VehicleParts> = {
  t0_truck: buildTruck,
  t1_van: buildVan,
  t2_offroad: buildOffroad,
  t3_rv: buildRV,
};

/** short names accepted in the URL (?vehicle=rv) */
export const VEHICLE_ALIASES: Record<string, string> = {
  truck: 't0_truck',
  van: 't1_van',
  offroad: 't2_offroad',
  rv: 't3_rv',
};

/** the vehicle spec for a name from the URL (id or alias); unknown or empty = the truck */
export function vehicleSpecFor(name: string | null | undefined): VehicleSpec {
  if (!name) return T0_TRUCK;
  const id = VEHICLE_ALIASES[name] ?? name;
  const spec = VEHICLES[id];
  if (!spec) {
    console.warn(`unknown vehicle "${name}": using the truck`);
    return T0_TRUCK;
  }
  return spec;
}

export function isModelled(id: string): boolean {
  return id in MODELS;
}

const warned = new Set<string>();

/** the model for a vehicle spec (the truck's model for vehicles not modelled yet) */
export function buildVehicle(spec: VehicleSpec): VehicleParts {
  const build = MODELS[spec.id];
  if (build) return build(spec);
  if (!warned.has(spec.id)) {
    warned.add(spec.id);
    console.warn(`vehicle ${spec.id} has no model yet: drawn with the truck's`);
  }
  return buildTruck(spec);
}
