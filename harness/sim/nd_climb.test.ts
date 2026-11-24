import { describe, expect, it } from 'vitest';
import { CLIMB, climbAlong, takesHold } from '../../src/core/v3/nd/climb';

describe('ND6 ladders (core/v3/nd/climb.ts, as Nomad Drive\'s PlayerLadderClimb)', () => {
  it('two metres a second up and down; past its head by 5 cm it lets one off, at its foot walking back puts one down', () => {
    expect(CLIMB.speed).toBe(2);
    let r = climbAlong(1, 1, 0.5, 10);
    expect(r.s).toBeCloseTo(2, 6);
    expect(r.off).toBe(null);
    r = climbAlong(2, -0.5, 1, 10);
    expect(r.s).toBeCloseTo(1, 6);
    // (the water tower's 10.41 m at full speed: 5.2 s)
    let s = 0;
    let t = 0;
    for (; t < 10; t += 1 / 60) {
      const k = climbAlong(s, 1, 1 / 60, 10.41);
      s = k.s;
      if (k.off) {
        expect(k.off).toBe('head');
        break;
      }
    }
    expect(t).toBeGreaterThan(5.1);
    expect(t).toBeLessThan(5.3);
    // (at its foot: walking back off it at once; hanging still there is staying on it)
    expect(climbAlong(0, -1, 1 / 60, 10).off).toBe('foot');
    expect(climbAlong(0, 0, 1 / 60, 10).off).toBe(null);
    expect(climbAlong(0.5, -0.05, 1 / 60, 10).off).toBe(null);
  });

  it('taken hold of by walking into it facing it (within 60°), near its line; from above with one\'s back to it', () => {
    const base = { out: 0.4, side: 0, along: 0.5, len: 10.4, up: 0, top: 10.3, facing: 1, forward: 1 };
    expect(takesHold(base)).toBe('foot');
    // (not walking forward enough, turned away more than 60°, too far out, too far to the side)
    expect(takesHold({ ...base, forward: 0.4 })).toBe(null);
    expect(takesHold({ ...base, facing: 0.45 })).toBe(null);
    expect(takesHold({ ...base, facing: 0.55 })).toBe('foot');
    expect(takesHold({ ...base, out: 0.8 })).toBe(null);
    expect(takesHold({ ...base, side: 0.6 })).toBe(null);
    // (on the ground under a foot 0.61 m up, as the water tower's: taken hold of, lifted onto it; high up its side: not)
    expect(takesHold({ ...base, up: -0.62 })).toBe('foot');
    expect(takesHold({ ...base, up: 3.0 })).toBe(null);
    // (at its head: one's back to it takes hold of it from above; facing it there does not)
    const top = { ...base, up: 10.2, along: 10.3, out: -0.6, facing: -1 };
    // (standing well back on the platform, not yet near its edge: not)
    expect(takesHold({ ...top, out: -0.95 })).toBe(null);
    expect(takesHold(top)).toBe('head');
    expect(takesHold({ ...top, facing: 1 })).toBe(null);
    expect(takesHold({ ...top, facing: -0.45 })).toBe(null);
  });
});
