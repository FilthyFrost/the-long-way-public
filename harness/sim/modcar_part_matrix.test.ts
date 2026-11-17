/**
 * The handling lab's rule (docs/MODCAR.md §21): every part, put on its frame in place of the factory one, changes at
 * least one figure by 10 % or more — how the build drives (0–100, 60–100, top speed, braking, cornering, the step of
 * steering, the handbrake turn, climbing, fuel) for the parts that drive it, what it is (the shift, the seat's height
 * and comfort, protection, drag, weight, the tank, the cooling, the battery, the lamps) for the rest. A radio, a horn,
 * a key, the tail lamps and the mirrors are what they do and are not judged.
 */
import { describe, expect, it } from 'vitest';
import { stockBuild } from '../../src/core/modcar/build';
import { frameDef } from '../../src/core/modcar/frames';
import { PARTS } from '../../src/core/modcar/parts';
import { DRIVEN_CATS, EXEMPT_CATS, FIGURES, figuresOf, JUDGED, specFiguresOf, withPart, type Figures } from './modcar/part_matrix';

const base = new Map<string, Figures>();
const baseOf = (frame: string): Figures => {
  let f = base.get(frame);
  if (!f) {
    f = figuresOf(stockBuild(frame, { fuel: 0.5 }));
    base.set(frame, f);
  }
  return f;
};

/** the figure that moved most, and by how much */
function biggest(a: Partial<Figures>, b: Partial<Figures>): { key: string; change: number } {
  let best = { key: '', change: 0 };
  for (const k of JUDGED) {
    const x = a[k] as number | undefined;
    const y = b[k] as number | undefined;
    if (x === undefined || y === undefined) continue;
    let c: number;
    if (Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) > 1e-6) c = y / x - 1;
    // (from nothing to something — a scoop's air, a light bar's lamps — or able to where it was not)
    else if (Number.isFinite(x) && Number.isFinite(y) && Math.abs(y) > 1e-6) c = Infinity;
    else if (Number.isFinite(x) !== Number.isFinite(y)) c = Infinity;
    else continue;
    if (Math.abs(c) > Math.abs(best.change)) best = { key: k, change: c };
  }
  return best;
}

const judged = PARTS.filter((p) => !EXEMPT_CATS.has(p.cat));

describe('ModCar handling lab: every part makes a difference', () => {
  it('lists its figures', () => {
    expect(FIGURES.length).toBeGreaterThan(15);
  });

  for (const p of judged) {
    it(`${p.cat} ${p.id}`, { timeout: 60_000 }, () => {
      const b = withPart(p);
      if (!b) return;
      // (the factory part of its frame is the yardstick, not a part judged)
      const f = frameDef(b.frame);
      const stock = stockBuild(b.frame, { fuel: 0.5 });
      const same = f.mounts.every((m) => (b.parts[m.id]?.part ?? '') === (stock.parts[m.id]?.part ?? '') && (b.parts[m.id]?.sub.tire?.part ?? '') === (stock.parts[m.id]?.sub.tire?.part ?? '') && (b.parts[m.id]?.sub.turbo?.part ?? '') === (stock.parts[m.id]?.sub.turbo?.part ?? ''));
      if (same) return;
      const driven = DRIVEN_CATS.has(p.cat);
      const a = driven ? baseOf(b.frame) : specFiguresOf(stock);
      const after = driven ? figuresOf(b) : specFiguresOf(b);
      const big = biggest(a, after);
      expect(Math.abs(big.change), `${p.id} on the ${b.frame}: the most any figure moved is ${big.key} ${(big.change * 100).toFixed(1)} %`).toBeGreaterThanOrEqual(0.1);
    });
  }
});
