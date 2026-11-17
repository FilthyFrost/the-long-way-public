/**
 * What a ModCar build feels like, measured headless: src/core/modcar/lab/feel.ts (in the game's source, for the
 * developer's panel too); this prints the four stock frames.
 *
 *   npx tsx harness/sim/modcar/feel.ts
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { measureFeel } from '../../../src/core/modcar/lab/feel';

export * from '../../../src/core/modcar/lab/feel';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { build } = await import('./specgen');
  for (const frame of ['sedan', 'pickup', 'moto', 'rv'] as const) {
    const m = measureFeel(build({ frame }));
    const f = (x: number, d = 1): string => (Number.isFinite(x) ? x.toFixed(d) : '—');
    console.log(
      `${frame.padEnd(7)} ${m.accelKind} ${f(m.accelS)} s · top ${f(m.topKmh, 0)} km/h · 100–0 ${f(m.brake100m)} m · 60–0 ${f(m.brake60m)} m · ` +
        `lat ${f(m.maxLatG, 2)} g · roll ${f(m.rollDegPerG, 2)} °/g · understeer ${f(m.understeerDegPerG, 2)} °/g · lean ${f(m.leanDegPerG, 1)} °/g · wheelie ${m.wheelie ? 'yes' : 'no'} ${f(m.wheelieMaxPitchDeg)}° · ` +
        `grade ${f(m.gradeAsphaltPct, 0)} / ${f(m.gradeGravelPct, 0)} % · fuel ${f(m.fuel60)} / ${f(m.fuel90)} L/100km · ${f(m.ms, 0)} ms`,
    );
  }
}
