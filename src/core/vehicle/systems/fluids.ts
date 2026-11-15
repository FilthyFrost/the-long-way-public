/**
 * Petrol and water into and out of the vehicle (docs/VEHICLE_SYSTEMS.md §7.1): one path whatever the
 * vessel. The player holds E at the filler cap or at the radiator; each frame `channel` moves what the
 * rate allows, and the dashboard follows (the needle moves while pouring).
 *
 *   filler cap, a vessel of petrol in the hands   → pour into the tank        10 L / 12 s
 *   filler cap, a station tank within reach        → pump into the tank        10 L / 15 s
 *   filler cap, an empty petrol vessel + a siphon  → siphon out of the tank    0.25 L / s
 *   filler cap, a vessel of water                  → refused: "这是水，不是汽油"
 *   radiator,   a vessel of water                  → top up the cooling        1 L / 4 s
 *
 * Pure: the vessel is anything with `holds(what)` and `fill` (the player's hands are one), the station
 * tank anything with `litres` (the player base's FuelSource).
 */
import type { VehicleSystems } from './systems';

export interface Vessel {
  readonly id: string | null;
  fill: number;
  /** its capacity for this fluid (0 = not a vessel for it) */
  holds(what: 'fuel' | 'water'): number;
}

export interface Tank {
  litres: number;
}

/** litres per second */
export const FLOW = { pour: 10 / 12, pump: 10 / 15, siphonOut: 0.25, water: 0.25 } as const;
/** a radiator holds this much (L): one "coolant level" of 1 */
export const RADIATOR_L = 6;

export type FillerMode = 'pour' | 'pump' | 'siphon' | 'wrong' | 'full' | 'empty' | 'moving' | 'running' | null;

export interface FillerQuery {
  mode: FillerMode;
  /** the one word under the crosshair (null = nothing to do here now) */
  word: string | null;
}

function stopped(sys: VehicleSystems): boolean {
  return !sys.sim || sys.sim.speed < 0.3;
}

/** room left in the tank (L) */
export function tankRoom(sys: VehicleSystems): number {
  return Math.max(0, sys.tankL - sys.state.fuelL);
}

/**
 * What holding E at the filler cap would do now. `hasSiphon` = a siphon hose in the pack;
 * `station` = a station tank within reach of the filler (null = none).
 */
export function fillerQuery(sys: VehicleSystems, v: Vessel, hasSiphon: boolean, station: Tank | null, out: FillerQuery = { mode: null, word: null }): FillerQuery {
  out.mode = null;
  out.word = null;
  if (!sys.spec.fuel) return out;
  const fuelCap = v.holds('fuel');
  const waterCap = v.holds('water');
  const set = (mode: FillerMode, word: string | null): FillerQuery => {
    out.mode = mode;
    out.word = word;
    return out;
  };
  if (waterCap > 0 && v.fill > 1e-6) return set('wrong', '这是水，不是汽油');
  const wantIn = (fuelCap > 0 && v.fill > 1e-6) || (fuelCap <= 0 && station !== null && station.litres > 1e-6) || (v.id === null && station !== null);
  if (!stopped(sys)) return wantIn || fuelCap > 0 ? set('moving', '先停车') : out;
  // real controls: the engine is off while petrol goes in (relaxed: nobody minds)
  if (sys.state.assist === 'real' && sys.state.running && (wantIn || fuelCap > 0)) return set('running', '先熄火');
  if (fuelCap > 0 && v.fill > 1e-6) return tankRoom(sys) > 0.05 ? set('pour', '加油') : set('full', '满了');
  if (fuelCap > 0 && v.fill < fuelCap - 1e-6 && hasSiphon) return sys.state.fuelL > 0.05 ? set('siphon', '抽油') : set('empty', '油箱空了');
  if (station && (v.id === null || fuelCap > 0)) {
    if (station.litres <= 1e-6) return set('empty', '油罐空了');
    return tankRoom(sys) > 0.05 ? set('pump', '加油') : set('full', '满了');
  }
  return out;
}

/** move fluid for dt seconds in the mode `fillerQuery` gave; returns false when it has finished */
export function fillerChannel(sys: VehicleSystems, v: Vessel, mode: FillerMode, station: Tank | null, dt: number): boolean {
  if (mode === 'pour') {
    const l = Math.min(FLOW.pour * dt, v.fill, tankRoom(sys));
    if (l <= 1e-9) return false;
    v.fill -= l;
    sys.addFuel(l);
    return v.fill > 1e-9 && tankRoom(sys) > 1e-9;
  }
  if (mode === 'pump' && station) {
    const l = Math.min(FLOW.pump * dt, station.litres, tankRoom(sys));
    if (l <= 1e-9) return false;
    station.litres -= l;
    sys.addFuel(l);
    return station.litres > 1e-9 && tankRoom(sys) > 1e-9;
  }
  if (mode === 'siphon') {
    const cap = v.holds('fuel');
    const l = Math.min(FLOW.siphonOut * dt, cap - v.fill, sys.state.fuelL);
    if (l <= 1e-9) return false;
    v.fill += l;
    sys.addFuel(-l);
    return v.fill < cap - 1e-9 && sys.state.fuelL > 1e-9;
  }
  return false;
}

export function fillerProgress(sys: VehicleSystems, v: Vessel, mode: FillerMode, station: Tank | null): number {
  if (mode === 'pour') {
    const cap = v.holds('fuel');
    return cap > 0 ? 1 - v.fill / cap : 0;
  }
  if (mode === 'siphon') {
    const cap = v.holds('fuel');
    return cap > 0 ? v.fill / cap : 0;
  }
  if (mode === 'pump') return sys.tankL > 0 ? sys.state.fuelL / sys.tankL : 0;
  void station;
  return 0;
}

/** the radiator: a vessel of water (or coolant) tops it up */
export function radiatorQuery(sys: VehicleSystems, v: Vessel): string | null {
  if (!sys.state.slots.cooling) return null;
  if (v.holds('water') <= 0 || v.fill <= 1e-6) return null;
  if (!stopped(sys)) return '先停车';
  return sys.state.coolant < 0.999 ? '加水' : '满了';
}

export function radiatorChannel(sys: VehicleSystems, v: Vessel, dt: number): boolean {
  const room = (1 - sys.state.coolant) * RADIATOR_L;
  const l = Math.min(FLOW.water * dt, v.fill, room);
  if (l <= 1e-9) return false;
  v.fill -= l;
  sys.addCoolant(l / RADIATOR_L);
  return v.fill > 1e-9 && sys.state.coolant < 0.999;
}
