// The ND digging's rules (docs/ND/PLAN.md ND3, core/v3/nd/dig.ts) at Nomad Drive's numbers: chests buried round a place
// three times in ten (a minor one) or two in three (a major one), out from its edge and off its road side, apart, the
// same every time; a key for each on its road side; four strokes to bring one up; the detector's beep from 0.9 s at
// 30 m to a steady tone over it; what a chest holds the first time it is opened.
import { describe, expect, it } from 'vitest';
import { itemDef } from '../../src/core/modcar/items';
import { beepFor, chestLoot, chestUnder, DETECT, DIG, treasuresOf, type FieldSite } from '../../src/core/v3/nd/dig';
import { registerNdItems } from '../../src/core/v3/nd/items';

registerNdItems();

/** a place by a road along +x, its building 8 x 6 m standing 10 m back from the road (z) */
const place = (seed: number, kind: string): FieldSite => ({
  id: `site${seed}`,
  seed,
  kind,
  x: 0,
  z: 0,
  e1x: 1,
  e1z: 0,
  e2x: 0,
  e2z: 1,
  halfL: 14,
  depth: 20,
  objects: [{ kind: 'building', x: 0, z: 10, w: 8, d: 6, yaw: 0 }],
});
const onRoad = (_x: number, z: number) => Math.abs(z) < 4.5;

describe('ND digging', () => {
  it('buries chests round three minor places in ten and two major in three, the same each time', () => {
    let minor = 0;
    let major = 0;
    let majorN = 0;
    for (let s = 0; s < 1000; s++) {
      const a = treasuresOf(place(s, 'camp'), 7, onRoad);
      const b = treasuresOf(place(s, 'house'), 7, onRoad);
      if (a.length) minor++;
      if (b.length) {
        major++;
        majorN += b.length;
      }
      expect(a.length).toBeLessThanOrEqual(1);
      expect(b.length).toBeLessThanOrEqual(2);
      expect(treasuresOf(place(s, 'house'), 7, onRoad)).toEqual(b);
    }
    expect(minor / 1000).toBeGreaterThan(0.25);
    expect(minor / 1000).toBeLessThan(0.35);
    expect(major / 1000).toBeGreaterThan(0.58);
    expect(major / 1000).toBeLessThan(0.72);
    expect(majorN / major).toBeGreaterThan(1.3);
  });

  it('lays them out from the edge, off the road side and apart; their keys on the road side', () => {
    for (let s = 0; s < 400; s++) {
      for (const kind of ['camp', 'house']) {
        const list = treasuresOf(place(s, kind), 3, onRoad);
        for (const t of list) {
          // (out of the building and off the road)
          expect(Math.abs(t.x) > 4 + 1 || Math.abs(t.z - 10) > 3 + 1).toBe(true);
          expect(onRoad(t.x, t.z)).toBe(false);
          // (a minor place's never on its road side: more than 100° from the way to the road)
          if (kind === 'camp') {
            const dx = t.x - 0;
            const dz = t.z - 10;
            const a = (Math.acos(-dz / Math.hypot(dx, dz)) * 180) / Math.PI;
            expect(a).toBeGreaterThanOrEqual(100 - 1e-6);
          }
          // (the key between the building and the road)
          expect(t.kz).toBeLessThan(10);
          expect(onRoad(t.kx, t.kz)).toBe(false);
          expect(itemDef(t.chest).holds).toBeTruthy();
        }
        if (list.length === 2) expect(Math.hypot(list[0].x - list[1].x, list[0].z - list[1].z)).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('a stroke finds the chest within half a metre that is not out yet', () => {
    const list = [
      { x: 0, z: 0, stage: 1 },
      { x: 3, z: 0, stage: 4 },
    ];
    expect(chestUnder(list, 0.3, 0.3)).toBe(0);
    expect(chestUnder(list, 0.6, 0)).toBe(-1);
    expect(chestUnder(list, 3, 0)).toBe(-1);
    expect(DIG.stages).toBe(4);
    expect(DIG.coolS).toBe(0.55);
  });

  it('the detector beeps every 0.9 s at 30 m, faster as it nears, a steady tone within 0.57 m', () => {
    expect(beepFor(31)).toBe(null);
    expect(beepFor(30)).toBeCloseTo(0.9, 6);
    expect(beepFor(10) as number).toBeCloseTo(0.343, 3);
    expect(beepFor(1) as number).toBeCloseTo(0.092, 3);
    expect(beepFor(0.5)).toBe('tone');
    expect(DETECT.range).toBe(30);
  });

  it('a chest holds three or four things the first time, all different', () => {
    for (let s = 0; s < 200; s++) {
      const l = chestLoot(s);
      expect(l.length).toBeGreaterThanOrEqual(3);
      expect(l.length).toBeLessThanOrEqual(4);
      expect(new Set(l).size).toBe(l.length);
      for (const id of l) expect(() => itemDef(id)).not.toThrow();
    }
  });
});
