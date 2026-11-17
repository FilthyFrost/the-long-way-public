/**
 * Every part against the stock build: src/core/modcar/lab/figures.ts (the rule: a part swapped must change at least
 * one figure by 10 % or more); this prints the table.
 *
 *   npx tsx harness/sim/modcar/part_matrix.ts [category …]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeBuild, encodeBuild, stockBuild } from '../../../src/core/modcar/build';
import { changes, FIGURES, figuresOf, withPart, type Figures } from '../../../src/core/modcar/lab/figures';
import { PARTS } from '../../../src/core/modcar/parts';

export * from '../../../src/core/modcar/lab/figures';

const here = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === here) {
  const cats = process.argv.slice(2);
  const bases = new Map<string, Figures>();
  const baseOf = (frame: string): Figures => {
    let f = bases.get(frame);
    if (!f) {
      f = figuresOf(stockBuild(frame, { fuel: 0.5 }));
      bases.set(frame, f);
    }
    return f;
  };
  const rows: string[] = [];
  for (const p of PARTS) {
    if (cats.length && !cats.includes(p.cat)) continue;
    const b = withPart(p);
    if (!b) continue;
    const base = baseOf(b.frame);
    const fig = figuresOf(b);
    const ch = changes(base, fig);
    let best = '';
    let bestV = 0;
    for (const f of FIGURES) {
      const c = ch[f.key];
      if (!Number.isFinite(c) && c !== Infinity) continue;
      const mag = c === Infinity ? 9 : Math.abs(c);
      if (mag > bestV) {
        bestV = mag;
        best = `${f.zh} ${c === Infinity ? '能/不能' : `${c > 0 ? '+' : ''}${(c * 100).toFixed(0)}%`}`;
      }
    }
    const flag = bestV >= 0.1 ? '  ' : '!!';
    rows.push(`${flag} ${p.cat.padEnd(12)} ${p.id.padEnd(16)} ${b.frame.padEnd(6)} ${best.padEnd(18)} · accel ${fig.accelS.toFixed(1)} top ${fig.topKmh.toFixed(0)} brake ${fig.brake100m.toFixed(0)} lat ${fig.maxLatG.toFixed(2)} steer ${fig.steerT63.toFixed(2)}s/${fig.steerYaw.toFixed(1)} hb ${fig.hbSlip.toFixed(0)}°`);
    console.log(rows.at(-1));
  }
  void encodeBuild;
  void decodeBuild;
}
