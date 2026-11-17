/**
 * The handling lab's tab (docs/MODCAR.md §21, src/game/modcar/devLab.ts): a part tried in place of what a vehicle has
 * goes on every mount of its kind (a tyre on every rim, a turbo on an engine that takes one) on a copy, the vehicle
 * itself untouched; the figure it moves most is found; a V8 in the sedan moves the acceleration a long way.
 */
import { describe, expect, it } from 'vitest';
import { encodeBuild, stockBuild } from '../../src/core/modcar/build';
import { changes, figuresOf } from '../../src/core/modcar/lab/figures';
import { biggest, tried } from '../../src/game/modcar/devLab';

describe('modcar · the handling lab', () => {
  it('a part tried goes on every mount of its kind, on a copy', () => {
    const b = stockBuild('sedan');
    const was = encodeBuild(b);
    const t = tried(b, 'tire_snow')!;
    expect(encodeBuild(b)).toBe(was);
    const tyres = Object.values(t.parts).map((i) => i.sub.tire?.part).filter(Boolean);
    expect(tyres.length).toBe(4);
    expect(new Set(tyres)).toEqual(new Set(['tire_snow']));
    const s = tried(b, 'susp_sport')!;
    expect(s.parts.susp_F.part).toBe('susp_sport');
    expect(s.parts.susp_R.part).toBe('susp_sport');
    // (a turbo on the engine, if it takes one; nowhere for a part the frame has no place for)
    expect(tried(b, 'turbo_small')!.parts.engine.sub.turbo?.part).toBe('turbo_small');
    expect(tried(stockBuild('moto'), 'turbo_small')).toBeNull();
  });

  it('the figure a part moves most: a V8 in the sedan, the acceleration', () => {
    const b = stockBuild('sedan', { fuel: 0.5 });
    const top = biggest(changes(figuresOf(b), figuresOf(tried(b, 'eng_v8')!)));
    expect(top).not.toBeNull();
    expect(['accelS', 't60to100', 'splitS']).toContain(top!.key);
    expect(Math.abs(top!.c)).toBeGreaterThan(0.3);
  });
});
