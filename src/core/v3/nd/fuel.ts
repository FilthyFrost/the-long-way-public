/**
 * A filling station's pump as Nomad Drive has it (docs/ND/PLAN.md, ND5; its liquid transfer system: gas pump body,
 * gas pump nozzle, nozzle holster): one pump on its island, fifty litres in it when it is first come to — between 29.7 %
 * of that and full, by the place — never filled again, and given for nothing. Its nozzle is taken off the holster into
 * the hands, the hose after it (as long as it needs: never shorter than 2.1 m) as far as eight metres from where it
 * hangs; held to a vehicle's filler or a jerrycan it goes into it (a quarter of a second, a fifth back out), and the
 * second button held runs two litres a second. Let go of, put away or taken too far, it is back on its holster.
 *
 * (Nomad Drive's pumps give petrol alone; ModCar has diesel engines too: one station in three has a diesel pump.)
 */
import { hash2 } from '../../math/rng';
import type { FuelType } from '../../modcar/types';

export const ND_FUEL = {
  /** what a pump holds (L) */
  litres: 50,
  /** the least of it a pump is found with (a share of full) */
  low: 0.297,
  /** how fast it runs (L/s) */
  rate: 2,
  /** how far the nozzle goes from its holster before it is pulled back (m) */
  tether: 8,
  /** into a filler and back out again (s) */
  inS: 0.25,
  outS: 0.2,
  /** how near a filler or a can's mouth the nozzle goes into it (m, from the eye) */
  reach: 1.7,
  /** the hose's least length (m) */
  hoseMin: 2.1,
} as const;

/** what a station's pump has in it when it is first come to (L): the same every visit to the place */
export function pumpFound(siteSeed: number, worldSeed: number): number {
  const k = (hash2(siteSeed | 0, 0xf0e1, worldSeed | 0) >>> 0) / 4294967296;
  return Math.round(ND_FUEL.litres * (ND_FUEL.low + (1 - ND_FUEL.low) * k) * 10) / 10;
}

/** which fuel a station's pump gives: petrol, or at one station in three diesel */
export function pumpFuel(siteSeed: number, worldSeed: number): FuelType {
  return (hash2(siteSeed | 0, 0xd1e5, worldSeed | 0) >>> 0) % 3 === 2 ? 'diesel' : 'petrol';
}

/** how long the hose hangs between the pump and the nozzle `d` metres off (m) */
export function hoseLength(d: number): number {
  return Math.max(ND_FUEL.hoseMin, d + 0.12);
}

/** how much runs in dt seconds: as fast as it runs, no more than there is nor than there is room for */
export function runFor(dt: number, left: number, room: number): number {
  return Math.max(0, Math.min(ND_FUEL.rate * dt, left, room));
}
