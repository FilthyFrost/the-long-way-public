/**
 * Derived ModCar builds measured on the feel harness: src/core/modcar/lab/derived.ts; this prints a few builds.
 *
 *   npx tsx harness/sim/modcar/derived_feel.ts [build text …]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { feelOf } from '../../../src/core/modcar/lab/derived';

export * from '../../../src/core/modcar/lab/derived';

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
