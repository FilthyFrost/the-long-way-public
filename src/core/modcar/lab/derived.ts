/**
 * Derived ModCar builds measured on the physics line's feel harness (docs/MODCAR.md §10.4): the stock
 * frames and the swaps the spec says must feel different — a V8 in the motorcycle must lift its front.
 *
 *   npx tsx harness/sim/modcar/derived_feel.ts [build text …]
 */
import { decodeBuild } from '../build';
import { derive, SURFACE_N, type Derived } from '../derive';
import type { SimMods } from '../../vehicle/mods';
import type { VehicleSpec } from '../../vehicle/spec';
import { measureFeel, type ModcarFeel } from './feel';

/** the per-wheel grip, rolling resistance, size and fit a build's derive writes into the sim */
export function derivedMods(d: Derived): (m: SimMods) => void {
  return (m) => {
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
  };
}

export function feelOf(text: string): ModcarFeel {
  const d = derive(decodeBuild(text, { fuel: 0.5 }));
  return measureFeel(d.spec as VehicleSpec, { mods: derivedMods(d) });
}
