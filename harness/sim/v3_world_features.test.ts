/**
 * Anchored landforms and cross-section operators of the second world version (src/core/world/features.ts,
 * operators.ts): the shapes keep to the slope a height field can hold, the clusters keep clear of the road
 * and of water, the layout is the same whatever is asked first, and the land's height is continuous.
 */
import { describe, expect, it } from 'vitest';
import { CLEAR, FeaturePlan, MAX_ASPECT, MAX_SLOPE, featureHeight, featureProfile, type FeatureKind, type FeatureRecipe, type LandFeature } from '../../src/core/world/features';
import { dunes, terrace } from '../../src/core/world/operators';
import { RoadSpine, SpineSample } from '../../src/core/world/spine';

const KINDS: FeatureKind[] = ['tower', 'butte', 'cone'];

/** the road, read the way the plan wants it */
function reader(spine: RoadSpine): { at(s: number, out: { x: number; z: number; cos: number; sin: number }): void } {
  const p = new SpineSample();
  return {
    at(s, out) {
      spine.at(s, p);
      out.x = p.x;
      out.z = p.z;
      out.cos = Math.cos(p.phi);
      out.sin = Math.sin(p.phi);
    },
  };
}

const KARST: FeatureRecipe[] = [{ kind: 'tower', count: [6, 12], radius: [45, 105], aspect: [0.8, 1.05], near: 70, far: 760, stretch: [1, 1.5] }];
const BUTTES: FeatureRecipe[] = [{ kind: 'butte', count: [2, 4], radius: [70, 150], aspect: [0.32, 0.5], near: 110, far: 900, stretch: [1, 2.4], oneSide: true }];
const CONES: FeatureRecipe[] = [{ kind: 'cone', count: [1, 2], radius: [140, 260], aspect: [0.5, 0.8], near: 220, far: 1100 }];

describe('the shapes of anchored landforms', () => {
  it('start at full height in the middle (a cone at its crater floor), end at nothing at the foot, with no slope there', () => {
    for (const k of KINDS) {
      expect(featureProfile(k, 1)).toBe(0);
      expect(featureProfile(k, 1.5)).toBe(0);
      expect(featureProfile(k, 0.999)).toBeLessThan(1e-4);
      expect(featureProfile(k, 0)).toBeGreaterThan(0.6);
      let top = 0;
      for (let t = 0; t <= 1; t += 0.001) top = Math.max(top, featureProfile(k, t));
      expect(top).toBeCloseTo(1, 6);
    }
    expect(featureProfile('cone', 0)).toBeCloseTo(0.67, 6);
  });

  it('are never steeper than two in one at the tallest each kind may stand', () => {
    for (const k of KINDS) {
      let steep = 0;
      const dt = 1e-4;
      for (let t = 0; t < 1; t += dt) steep = Math.max(steep, Math.abs(featureProfile(k, t + dt) - featureProfile(k, t)) / dt);
      // the slope of a landform of radius R and height aspect·R is `steep · aspect`
      expect(steep * MAX_ASPECT[k], k).toBeLessThanOrEqual(MAX_SLOPE + 1e-3);
      expect(steep * MAX_ASPECT[k], k).toBeGreaterThan(1.6);
    }
  });

  it('are continuous in height across the whole of one, a long one too', () => {
    const f: LandFeature = { kind: 'butte', x: 100, z: -40, r: 80, stretch: 2.2, h: 36, ca: Math.cos(0.5), sa: Math.sin(0.5), xMin: 100 - 176, xMax: 100 + 176, zMin: -40 - 176, zMax: -40 + 176 };
    let jump = 0;
    let top = 0;
    for (let x = -120; x <= 320; x += 0.5) {
      const a = featureHeight(f, x, -40 + 0.3 * (x - 100));
      const b = featureHeight(f, x + 0.5, -40 + 0.3 * (x + 0.5 - 100));
      jump = Math.max(jump, Math.abs(a - b));
      top = Math.max(top, a);
    }
    expect(top).toBeCloseTo(36, 3);
    // half a metre along the ground never changes the height by more than a metre (two in one)
    expect(jump).toBeLessThanOrEqual(0.5 * MAX_SLOPE + 1e-6);
  });
});

describe('clusters along the road', () => {
  const seeds = [1, 7, 20261119, 99991];

  it('keep every foot clear of the road, all along it', () => {
    for (const seed of seeds) {
      const spine = new RoadSpine(seed, {});
      const road = reader(spine);
      const plan = new FeaturePlan(road, seed, (k) => (k % 3 === 1 ? KARST : k % 3 === 2 ? BUTTES : CONES));
      const p = { x: 0, z: 0, cos: 1, sin: 0 };
      let n = 0;
      for (let k = 1; k < 40; k++) {
        for (const f of plan.of(k)) {
          n++;
          const reach = f.r * f.stretch;
          for (let s = Math.max(0, (k - 2) * 1250); s < (k + 3) * 1250; s += 4) {
            road.at(s, p);
            expect(Math.hypot(p.x - f.x, p.z - f.z), `seed ${seed} slot ${k}`).toBeGreaterThanOrEqual(reach + CLEAR - 1e-6);
          }
        }
      }
      expect(n).toBeGreaterThan(120);
    }
  });

  it('are the same whatever is asked first, and for the same seed', () => {
    const spine = new RoadSpine(7, {});
    const a = new FeaturePlan(reader(spine), 7, () => KARST);
    const b = new FeaturePlan(reader(new RoadSpine(7, {})), 7, () => KARST);
    b.of(30);
    b.heightAt(12000, 300, 12000);
    for (let k = 0; k < 30; k++) expect(a.of(k)).toEqual(b.of(k));
    const c = new FeaturePlan(reader(new RoadSpine(8, {})), 8, () => KARST);
    expect(c.of(5)).not.toEqual(a.of(5));
  });

  it('hold as many as the recipe asks when there is room, on one side when it says so, and none where no recipe is', () => {
    const spine = new RoadSpine(3, {});
    const road = reader(spine);
    const plan = new FeaturePlan(road, 3, (k) => (k % 2 ? KARST : k % 4 === 0 ? BUTTES : null));
    const p = { x: 0, z: 0, cos: 1, sin: 0 };
    let towers = 0;
    let slots = 0;
    for (let k = 1; k < 60; k++) {
      const fs = plan.of(k);
      if (k % 2) {
        slots++;
        towers += fs.length;
        expect(fs.length).toBeLessThanOrEqual(12);
      } else if (k % 4 === 0) {
        // one side: every butte of the stretch on the same side of the road
        const sides = new Set<number>();
        for (const f of fs) {
          road.at((k + 0.5) * 1250, p);
          sides.add(Math.sign((f.x - p.x) * -p.sin + (f.z - p.z) * p.cos));
        }
        expect(sides.size).toBeLessThanOrEqual(1);
      } else expect(fs.length).toBe(0);
    }
    // most of what a recipe asks finds a place (6 to 12 asked: 9 on average)
    expect(towers / slots).toBeGreaterThan(6.5);
    expect(plan.of(-3)).toEqual([]);
  });

  it('stand out of the water', () => {
    const spine = new RoadSpine(11, {});
    // a strip of water 200 to 420 m to the right of the x axis
    const wet = (_x: number, z: number): boolean => z > 200 && z < 420;
    const plan = new FeaturePlan(reader(spine), 11, () => KARST, wet);
    for (let k = 1; k < 30; k++) for (const f of plan.of(k)) expect(wet(f.x, f.z)).toBe(false);
  });

  it('add height only near themselves, the tallest where two lean on each other, and never a step', () => {
    const spine = new RoadSpine(5, {});
    const plan = new FeaturePlan(reader(spine), 5, (k) => (k === 4 || k === 5 ? KARST : null));
    const fs = [...plan.of(4), ...plan.of(5)];
    expect(fs.length).toBeGreaterThan(8);
    for (const f of fs) {
      const s = spine.sAtX(f.x);
      expect(plan.heightAt(f.x, f.z, s)).toBeGreaterThanOrEqual(f.h - 1e-9);
      // along a line through it: no jump
      let prev = plan.heightAt(f.x - 400, f.z, spine.sAtX(f.x - 400));
      for (let x = f.x - 400 + 0.5; x <= f.x + 400; x += 0.5) {
        const h = plan.heightAt(x, f.z, spine.sAtX(x));
        expect(Math.abs(h - prev)).toBeLessThanOrEqual(0.5 * MAX_SLOPE * 1.01);
        prev = h;
      }
    }
    expect(plan.heightAt(40000, 0, 40000)).toBe(0);
  });
});

describe('terraces and dunes', () => {
  it('terraces: level benches, continuous, the same at every bench as the slope they replace, and nothing at strength 0', () => {
    expect(terrace(13.7, 4, 0)).toBe(13.7);
    let prev = terrace(-20, 4, 1);
    let level = 0;
    let n = 0;
    for (let h = -20 + 0.01; h <= 40; h += 0.01) {
      const t = terrace(h, 4, 1);
      expect(t).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(t - prev).toBeLessThan(0.01 * 6);
      if (t - prev < 1e-9) level++;
      n++;
      prev = t;
    }
    // about three quarters of the way is level bench
    expect(level / n).toBeGreaterThan(0.7);
    expect(level / n).toBeLessThan(0.78);
    for (let i = -5; i <= 10; i++) expect(terrace(i * 4, 4, 1)).toBeCloseTo(i * 4, 9);
    // half strength lies half way
    expect(terrace(13, 4, 0.5)).toBeCloseTo((13 + terrace(13, 4, 1)) / 2, 9);
  });

  it('dunes: between nothing and the amplitude, continuous, the lee side the steep one and under two in one', () => {
    let lo = Infinity;
    let hi = -Infinity;
    let up = 0;
    let down = 0;
    for (let z = 0; z < 600; z += 37) {
      let prev = dunes(0, z, 9, 8, 90);
      for (let x = 0.25; x < 3000; x += 0.25) {
        const h = dunes(x, z, 9, 8, 90);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
        up = Math.max(up, (h - prev) / 0.25);
        down = Math.max(down, (prev - h) / 0.25);
        prev = h;
      }
    }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(8);
    expect(hi).toBeGreaterThan(6.5);
    expect(down).toBeGreaterThan(up);
    expect(down).toBeLessThan(MAX_SLOPE);
    expect(dunes(10, 10, 9, 0, 90)).toBe(0);
  });
});
