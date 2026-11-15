// Prints the stat-card numbers of a few builds (quick look while tuning the catalogue).
import { decodeBuild } from '../../../src/core/modcar/build';
import { derive } from '../../../src/core/modcar/derive';
import { quickPerf } from '../../../src/core/modcar/stats';

const builds = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      'stock:sedan',
      'stock:sedan;engine=eng_v8',
      'stock:sedan;engine=eng_v8+turbo:turbo_small;gearbox=gb_5',
      'stock:sedan;engine=eng_mower',
      'stock:sedan;engine=eng_d6',
      'stock:pickup',
      'stock:pickup;engine=eng_v8',
      'stock:moto',
      'stock:moto;engine=eng_v8;radiator=rad_std',
      'stock:moto;engine=eng_2t',
      'stock:rv',
      'stock:rv;engine=eng_i4',
    ];
for (const t of builds) {
  const d = derive(decodeBuild(t));
  const p = quickPerf(d);
  const s = d.spec;
  console.log(
    `${t.padEnd(58)} m=${p.mass.toFixed(0).padStart(5)}kg wf=${s.weightFront.toFixed(2)} cg=${s.cgHeight.toFixed(2)} r=${s.wheelRadius.toFixed(3)} P=${p.power.toFixed(0).padStart(3)}kW 0-100=${p.t100 === null ? '  —  ' : p.t100.toFixed(1).padStart(5)}s vmax=${p.vmax.toFixed(0).padStart(3)} fuel=${p.fuel.toFixed(1)} grip=${p.grip.toFixed(2)} hand=${p.handling.toFixed(0)} brake=${s.brakes.maxG.toFixed(2)}g cdA=${s.aero.cdA.toFixed(2)} hzF=${s.front.springHz.toFixed(2)}`,
  );
}
