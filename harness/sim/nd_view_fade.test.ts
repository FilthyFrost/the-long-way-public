import { describe, expect, it } from 'vitest';
import { coverageOf, easeWeight, samplePattern, segmentHitsBox, targetWeight, VIEW_FADE, viewFadeScale, windowOpacity } from '../../src/core/v3/nd/viewFade';

describe('seeing through what is carried (core/v3/nd/viewFade.ts)', () => {
  it("Nomad Drive's numbers", () => {
    expect(VIEW_FADE.inner).toBe(0.12);
    expect(VIEW_FADE.outer).toBe(0.42);
    expect(VIEW_FADE.stretch).toBe(1.4);
    expect(VIEW_FADE.fadeInS).toBe(0.25);
    expect(VIEW_FADE.fadeOutS).toBe(0.35);
    expect(VIEW_FADE.coverageRadius).toBe(0.28);
    expect(VIEW_FADE.grid).toBe(7);
    expect(VIEW_FADE.start).toBe(0.35);
    expect(VIEW_FADE.full).toBe(0.65);
    expect(VIEW_FADE.maxDistance).toBe(2.5);
    // (the faces go further than its 0.3 — the player's ask: only the outline is left)
    expect(VIEW_FADE.minOpacity).toBeLessThan(0.3);
    expect(VIEW_FADE.edgeOpacity).toBeLessThan(1);
    expect(VIEW_FADE.lineOpacity).toBeGreaterThan(0.9);
  });

  it('the points measured: 29 of a 7 by 7 grid cut to the oval, the middle one weighing most', () => {
    const s = samplePattern();
    expect(s.length).toBe(29);
    const mid = s.find((p) => p.x === 0 && p.y === 0)!;
    expect(mid.w).toBeCloseTo(1, 9);
    // (half as wide again across: the widest point 0.28 × 1.4 out, the highest 0.28 up)
    expect(Math.max(...s.map((p) => p.x))).toBeCloseTo(0.28 * 1.4, 9);
    expect(Math.max(...s.map((p) => p.y))).toBeCloseTo(0.28, 9);
    // (a bell whose spread is half the radius: at the rim e^−2)
    const rim = s.find((p) => p.x === 0 && Math.abs(p.y - 0.28) < 1e-9)!;
    expect(rim.w).toBeCloseTo(Math.exp(-2), 6);
    for (const p of s) expect(p.w).toBeLessThanOrEqual(1);
  });

  it('how much of the middle is blocked, and how far it fades for that', () => {
    const s = samplePattern();
    expect(coverageOf(s, () => true)).toBeCloseTo(1, 9);
    expect(coverageOf(s, () => false)).toBe(0);
    // the middle point alone weighs more than a twenty-ninth
    const one = coverageOf(s, (p) => p.x === 0 && p.y === 0);
    expect(one).toBeGreaterThan(1 / 29);
    // the lower half of the oval (a thing held low): less than half, the middle row with it more than half
    const low = coverageOf(s, (p) => p.y < 0);
    expect(low).toBeGreaterThan(0.2);
    expect(low).toBeLessThan(0.5);
    expect(targetWeight(0.35)).toBe(0);
    expect(targetWeight(0.2)).toBe(0);
    expect(targetWeight(0.5)).toBeCloseTo(0.5, 9);
    expect(targetWeight(0.65)).toBe(1);
    expect(targetWeight(1)).toBe(1);
    // (its own scale: a compass is never faded)
    expect(targetWeight(1, 0)).toBe(0);
    expect(viewFadeScale('nd_compass')).toBe(0);
    expect(viewFadeScale('nd_fridge')).toBe(1);
  });

  it('it comes in evenly over a quarter of a second, and goes over 0.35 s', () => {
    let w = 0;
    for (let i = 0; i < 15; i++) w = easeWeight(w, 1, 1 / 60);
    expect(w).toBeCloseTo(1, 6);
    expect(easeWeight(0, 1, 0.125)).toBeCloseTo(0.5, 9);
    expect(easeWeight(1, 0, 0.175)).toBeCloseTo(0.5, 9);
    expect(easeWeight(0.4, 0.5, 1)).toBe(0.5);
    expect(easeWeight(0.6, 0.5, 1)).toBe(0.5);
  });

  it('the window: nearly gone about the mark, a quarter outside it, whole when not faded', () => {
    expect(windowOpacity(0, 0, 1)).toBeCloseTo(VIEW_FADE.minOpacity, 9);
    expect(windowOpacity(0, 0.1, 1)).toBeCloseTo(VIEW_FADE.minOpacity, 9);
    expect(windowOpacity(0, 0.5, 1)).toBeCloseTo(VIEW_FADE.edgeOpacity, 9);
    // (half as wide again across: 0.5 out across is within the window, 0.5 up is not)
    expect(windowOpacity(0.5, 0, 1)).toBeLessThan(windowOpacity(0, 0.5, 1));
    expect(windowOpacity(0, 0, 0)).toBe(1);
    expect(windowOpacity(0, 0.5, 0)).toBe(1);
    // half faded: half way to it
    expect(windowOpacity(0, 0, 0.5)).toBeCloseTo((1 + VIEW_FADE.minOpacity) / 2, 9);
    // Nomad Drive's own: 0.3 in the middle, whole outside
    expect(windowOpacity(0, 0, 1, 0.3, 1)).toBeCloseTo(0.3, 9);
    expect(windowOpacity(0, 0.5, 1, 0.3, 1)).toBe(1);
  });

  it("a ray's segment against a piece's box", () => {
    const min = [-0.5, -0.5, -0.5];
    const max = [0.5, 0.5, 0.5];
    expect(segmentHitsBox([0, 0, -2], [0, 0, 2.5], min, max)).toBe(true);
    // (too short to reach it: no)
    expect(segmentHitsBox([0, 0, -2], [0, 0, 1.4], min, max)).toBe(false);
    // (beside it, along an axis: no)
    expect(segmentHitsBox([0.6, 0, -2], [0, 0, 2.5], min, max)).toBe(false);
    // (from inside it: yes)
    expect(segmentHitsBox([0, 0, 0], [0, 0, 1], min, max)).toBe(true);
    // (away from it: no)
    expect(segmentHitsBox([0, 0, -2], [0, 0, -2.5], min, max)).toBe(false);
    expect(segmentHitsBox([-2, -2, 0], [3, 3, 0], min, max)).toBe(true);
  });
});
