/**
 * Walking about inside a vehicle (src/core/onboard/walker.ts): the walker never leaves the walk
 * area however it is pushed, every rectangle can be walked to, and the pace is right.
 */
import { describe, expect, it } from 'vitest';
import { EYE_HEIGHT, WALK_SPEED, Walker, connected, insideRect, passageWidth, type WalkArea } from '../../src/core/onboard/walker';
import { T3_RV } from '../../src/core/vehicle/spec';
import { buildVehicle } from '../../src/game/vehicle/models';

/** a small deterministic random generator */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const L: WalkArea = {
  headroom: 2,
  areas: [
    { x0: 0, x1: 3, z0: 0, z1: 0.8, floor: 0, name: 'aisle' },
    { x0: 2.4, x1: 3, z0: 0.8, z1: 3, floor: 0, name: 'aisle' },
    { x0: 3, x1: 4, z0: 2.5, z1: 3, floor: 0.2, name: 'step' },
  ],
};

const rv = buildVehicle(T3_RV).walk!;

/** walk to a rectangle: through the shared patches of the chain of rectangles that leads there */
function walkTo(w: Walker, area: WalkArea, target: number): boolean {
  const n = area.areas.length;
  const start = area.areas.findIndex((r) => insideRect(r, w.x, w.z));
  const prev = new Array<number>(n).fill(-1);
  const seen = new Set([start]);
  const q = [start];
  while (q.length) {
    const i = q.shift()!;
    for (let j = 0; j < n; j++) {
      if (!seen.has(j) && passageWidth(area.areas[i], area.areas[j]) >= 0.3) {
        seen.add(j);
        prev[j] = i;
        q.push(j);
      }
    }
  }
  if (!seen.has(target)) return false;
  const chain: number[] = [];
  for (let k = target; k !== -1; k = prev[k]) chain.unshift(k);
  const way: [number, number][] = [];
  for (let k = 1; k < chain.length; k++) {
    const a = area.areas[chain[k - 1]];
    const b = area.areas[chain[k]];
    // the middle of the patch the two share
    way.push([(Math.max(a.x0, b.x0) + Math.min(a.x1, b.x1)) / 2, (Math.max(a.z0, b.z0) + Math.min(a.z1, b.z1)) / 2]);
  }
  const t = area.areas[target];
  way.push([(t.x0 + t.x1) / 2, (t.z0 + t.z1) / 2]);
  for (const [x, z] of way) {
    for (let i = 0; i < 2000 && Math.hypot(x - w.x, z - w.z) > 0.02; i++) {
      w.yaw = Math.atan2(z - w.z, x - w.x);
      const d = Math.hypot(x - w.x, z - w.z);
      w.step(Math.min(1 / 60, d / WALK_SPEED), 1, 0);
    }
  }
  return insideRect(t, w.x, w.z);
}

for (const [label, area] of [['an L-shaped room', L], ['the motorhome', rv]] as [string, WalkArea][]) {
  describe(`walker · ${label}`, () => {
    it('the area is one piece', () => expect(connected(area)).toBe(true));

    it('never leaves the area in 10 000 random steps, and never moves faster than walking pace', () => {
      const w = new Walker(area);
      const r = rng(7);
      for (let i = 0; i < 10_000; i++) {
        if (r() < 0.1) w.yaw = r() * Math.PI * 2;
        const dt = r() * 0.1;
        const x = w.x;
        const z = w.z;
        const moved = w.step(dt, r() * 2 - 1, r() * 2 - 1);
        expect(w.inside(w.x, w.z), `step ${i} left the area at ${w.x.toFixed(3)}, ${w.z.toFixed(3)}`).toBe(true);
        expect(moved).toBeLessThanOrEqual(WALK_SPEED * dt + 1e-9);
        expect(Math.hypot(w.x - x, w.z - z)).toBeCloseTo(moved, 9);
      }
    });

    it('every rectangle can be walked to', () => {
      for (let t = 0; t < area.areas.length; t++) {
        const w = new Walker(area);
        expect(walkTo(w, area, t), `rectangle ${t} (${area.areas[t].name})`).toBe(true);
      }
    });

    it('stands with the eye 1.62 m over the floor under it', () => {
      const w = new Walker(area);
      for (const r of area.areas) {
        w.place((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
        expect(w.eye().y).toBeCloseTo(w.floorAt(w.x, w.z) + EYE_HEIGHT, 9);
      }
    });
  });
}

describe('walker · pace and sliding', () => {
  it('walks at 1.9 m/s, diagonals included', () => {
    const w = new Walker({ headroom: 2, areas: [{ x0: -10, x1: 10, z0: -10, z1: 10, floor: 0 }] });
    w.place(0, 0, 0);
    for (let i = 0; i < 60; i++) w.step(1 / 60, 1, 0);
    expect(w.x).toBeCloseTo(1.9, 6);
    w.place(0, 0, 0);
    for (let i = 0; i < 60; i++) w.step(1 / 60, 1, 1);
    expect(Math.hypot(w.x, w.z)).toBeCloseTo(1.9, 6);
    w.place(0, 0, Math.PI / 2); // facing right (+z): forward goes to +z
    w.step(1, 1, 0);
    expect(w.z).toBeCloseTo(1.9, 6);
    expect(w.x).toBeCloseTo(0, 6);
  });

  it('slides along a wall instead of stopping', () => {
    const w = new Walker({ headroom: 2, areas: [{ x0: 0, x1: 10, z0: 0, z1: 1, floor: 0 }] });
    w.place(1, 0.5, Math.PI / 4); // 45° into the wall at z = 1
    for (let i = 0; i < 60; i++) w.step(1 / 60, 1, 0);
    expect(w.z).toBeCloseTo(1, 9);
    expect(w.x).toBeGreaterThan(1 + 1.9 * Math.cos(Math.PI / 4) * 0.9);
  });

  it('places onto the nearest walkable point', () => {
    const w = new Walker(L);
    w.place(5, 5);
    expect(w.inside(w.x, w.z)).toBe(true);
    expect(w.x).toBeCloseTo(4, 9);
    expect(w.z).toBeCloseTo(3, 9);
  });
});
