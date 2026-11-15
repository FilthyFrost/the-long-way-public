/**
 * Derived ModCar builds measured on the physics line's feel harness (docs/MODCAR.md §10.4): the stock
 * frames and the swaps the spec says must feel different — a V8 in the motorcycle must lift its front.
 *
 *   npx tsx harness/sim/modcar/derived_feel.ts [build text …]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeBuild } from '../../../src/core/modcar/build';
import { derive, SURFACE_N, type Derived } from '../../../src/core/modcar/derive';
import type { SimMods } from '../../../src/core/vehicle/mods';
import type { VehicleSpec } from '../../../src/core/vehicle/spec';
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

const here = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === here) {
  const builds = process.argv.slice(2);
  const list = builds.length
    ? builds
    : ['stock:sedan', 'stock:sedan;engine=eng_v8', 'stock:sedan;engine=eng_mower', 'stock:pickup', 'stock:moto', 'stock:moto;engine=eng_v8', 'stock:rv', 'stock:sedan;hub_FL=rim_off16+tire:tire_tractor;hub_FR=rim_off16+tire:tire_tractor;hub_RL=rim_off16+tire:tire_tractor;hub_RR=rim_off16+tire:tire_tractor'];
  for (const b of list) {
    const f = feelOf(b);
    const accel = f.accelKind === 'none' ? 'never' : `${f.accelKind} ${f.accelS.toFixed(1)} s`;
    console.log(`${b.padEnd(48).slice(0, 48)} ${accel.padEnd(12)} top ${f.topKmh.toFixed(0).padStart(3)} · 100–0 ${f.brake100m.toFixed(0)} m · lat ${f.maxLatG.toFixed(2)} g · wheelie ${f.wheelie ? `YES ${f.wheelieMaxPitchDeg.toFixed(0)}°` : 'no'} · fuel90 ${f.fuel90.toFixed(0)}`);
  }
}
