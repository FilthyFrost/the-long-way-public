import { describe, expect, it } from 'vitest';
import { circleInRect, distToRect, firstBlocking, footprint, latticeShift, nearestQuarter, nextQuarter, outBack, outCubic, PLACE, pointInBlock, rectsOverlap, stepDistance, type Block } from '../../src/core/v3/nd/place';
import { SIT } from '../../src/game/modcar/v3/nd-home/sit';

describe('ND placing (core/v3/nd/place.ts)', () => {
  it('a box turned on the plan: its middle and its reach', () => {
    // a sofa's box (0.82 deep, 1.6 long), its base at the origin, turned a quarter round: its length lies along x
    const f = footprint({ minX: -0.41, maxX: 0.41, minY: 0, maxY: 0.8, minZ: -0.8, maxZ: 0.8 }, 0, 0, Math.PI / 2);
    expect(f.x).toBeCloseTo(0, 6);
    expect(f.hx).toBeCloseTo(0.41, 6);
    expect(f.hz).toBeCloseTo(0.8, 6);
    // (its box off its base: the middle goes round with the turn)
    const g = footprint({ minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 0 }, 2, 3, Math.PI / 2);
    expect(g.x).toBeCloseTo(2, 6);
    expect(g.z).toBeCloseTo(3.5, 6);
  });

  it('boxes on the plan overlap, touch, miss; a post is a circle', () => {
    const a = { x: 0, z: 0, hx: 1, hz: 0.5, yaw: 0 };
    expect(rectsOverlap(a, { x: 1.9, z: 0, hx: 1, hz: 0.5, yaw: 0 })).toBe(true);
    expect(rectsOverlap(a, { x: 2.1, z: 0, hx: 1, hz: 0.5, yaw: 0 })).toBe(false);
    // turned 45°, its corner reaches 0.707 · (1 + 0.5) further along x than its middle
    expect(rectsOverlap(a, { x: 2.0, z: 0, hx: 1, hz: 0.5, yaw: Math.PI / 4 })).toBe(true);
    expect(rectsOverlap(a, { x: 2.1, z: 1.6, hx: 1, hz: 0.5, yaw: Math.PI / 4 })).toBe(false);
    expect(rectsOverlap(a, { x: 0, z: 0.79, hx: 0.3, hz: 0, yaw: 0 })).toBe(true);
    expect(rectsOverlap(a, { x: 0, z: 0.81, hx: 0.3, hz: 0, yaw: 0 })).toBe(false);
    expect(circleInRect(1.2, 0.6, 0.3, a)).toBe(true);
    expect(circleInRect(1.3, 0.8, 0.3, a)).toBe(false);
  });

  it('what a thing would be put into: not what it stands on, not what is above it', () => {
    const foot = { x: 0, z: 0, hx: 0.3, hz: 0.3, yaw: 0 };
    const floor: Block = { x: 0, z: 0, hx: 3, hz: 3, yaw: 0, y0: -0.2, y1: 0 };
    const wall: Block = { x: 0.35, z: 0, hx: 0.1, hz: 3, yaw: 0, y0: 0, y1: 2.4 };
    const shelf: Block = { x: 0, z: 0, hx: 0.5, hz: 0.5, yaw: 0, y0: 1.5, y1: 1.55 };
    expect(firstBlocking(foot, 0, 0.8, [floor])).toBeNull();
    expect(firstBlocking(foot, 0, 0.8, [floor, wall])).toBe(wall);
    expect(firstBlocking(foot, 0, 0.8, [shelf])).toBeNull();
    expect(firstBlocking(foot, 0, 1.6, [shelf])).toBe(shelf);
    expect(pointInBlock(0.35, 1, 0, wall)).toBe(true);
    expect(pointInBlock(0.35, 2.5, 0, wall)).toBe(false);
  });

  it('Q and E: to the next square either way, from a frame of its own', () => {
    const q = Math.PI / 2;
    expect(nextQuarter(0, 1)).toBeCloseTo(q, 9);
    expect(nextQuarter(0, -1)).toBeCloseTo(-q, 9);
    expect(nextQuarter(0.3, 1)).toBeCloseTo(q, 9);
    expect(nextQuarter(0.3, -1)).toBeCloseTo(0, 9);
    expect(nextQuarter(q, 1)).toBeCloseTo(2 * q, 9);
    // a vehicle's squares: its own heading's
    expect(nextQuarter(0.2, 1, 0.1)).toBeCloseTo(0.1 + q, 9);
    expect(outCubic(0)).toBe(0);
    expect(outCubic(1)).toBe(1);
    expect(outCubic(0.5)).toBeCloseTo(0.875, 9);
    // (the pop overshoots a little and comes back)
    expect(outBack(0.6)).toBeGreaterThan(1);
    expect(outBack(1)).toBeCloseTo(1, 9);
  });

  it("the grid (docs/V3/plan/prompts.md §四): a footprint's edges onto its lines, a heading onto its squares, how far from a vehicle", () => {
    // 10 cm squares; a box's corners at u 0.23 … 0.63, w −0.18 … 0.12: its least edges go to 0.2 and −0.2
    const s = latticeShift([0.23, 0.63, 0.63, 0.23], [-0.18, -0.18, 0.12, 0.12], 0.1);
    expect(s.du).toBeCloseTo(-0.03, 9);
    expect(s.dw).toBeCloseTo(-0.02, 9);
    // (on a line already: it stays)
    const t = latticeShift([0.3, 0.7], [-0.1, 0.2], 0.1);
    expect(Math.abs(t.du)).toBeLessThan(1e-9);
    expect(Math.abs(t.dw)).toBeLessThan(1e-9);
    const q = Math.PI / 2;
    expect(nearestQuarter(0.3)).toBeCloseTo(0, 9);
    expect(nearestQuarter(1.0)).toBeCloseTo(q, 9);
    // (a vehicle's squares: its heading's)
    expect(nearestQuarter(0.5, 0.2)).toBeCloseTo(0.2, 9);
    expect(nearestQuarter(1.0, 0.2)).toBeCloseTo(0.2 + q, 9);
    // a motorhome 6 m by 2.2 m: behind it, 2 m off its back, is within its 3 m
    const rv = { x: 0, z: 0, hx: 3, hz: 1.1, yaw: 0 };
    expect(distToRect(0, 0, rv)).toBe(0);
    expect(distToRect(-5, 0, rv)).toBeCloseTo(2, 9);
    expect(distToRect(-5, 0, rv)).toBeLessThan(PLACE.nearVehicle);
    expect(distToRect(4, 2.1, rv)).toBeCloseTo(Math.SQRT2, 9);
    expect(PLACE.cell).toBe(0.1);
    expect(PLACE.nearVehicle).toBe(3);
  });

  it("the wheel's reach, and extended placement range", () => {
    // extended placement reach (0.6 to 5.0 m, from 1.2, 0.15 m per wheel notch)
    expect(stepDistance(0.6, -3, PLACE.dist)).toBe(0.6);
    expect(stepDistance(0.6, 3, PLACE.dist)).toBeCloseTo(1.05, 6);
    expect(stepDistance(4.9, 5, PLACE.dist)).toBe(5.0);
    expect(PLACE.dist.start).toBe(1.5);
    expect(PLACE.far.max).toBe(5.5);
    expect(PLACE.dropMax).toBe(8);
    expect(PLACE.planeReach).toBe(5.0);
    expect(PLACE.surfaceReach).toBe(5.5);
    expect(PLACE.stepS).toBe(0.2);
    expect(SIT.standS).toBe(0.35);
    expect(SIT.yawDeg).toBe(125);
    expect(SIT.maxKmh).toBe(15);
  });
});
