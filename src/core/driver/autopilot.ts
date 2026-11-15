/**
 * How the autopilot (the radio on the dash, docs/DESIGN_V2.md §5.7) drives each vehicle: cruise
 * speed (km/h) and planned cornering (g). The game's robot driver and the headless vehicle tests
 * read the same table.
 */
export const AUTOPILOT: Record<string, { cruiseKmh: number; latG: number }> = {
  t0_truck: { cruiseKmh: 62, latG: 0.28 },
  t1_van: { cruiseKmh: 60, latG: 0.24 },
  t2_offroad: { cruiseKmh: 66, latG: 0.28 },
  t3_rv: { cruiseKmh: 55, latG: 0.19 },
};

export function autopilotFor(id: string): { cruiseKmh: number; latG: number } {
  return AUTOPILOT[id] ?? AUTOPILOT.t0_truck;
}
