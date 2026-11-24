/**
 * J9c (docs/V3/plan/growth.md §六 2): the roof rack's blueprint and the roof as a place for things.
 *   - zonesFor: a vehicle's places for things as it is built — the roof one there only with a rack on the roof, over the
 *     roof mount's footprint, large things too, packed into last; none for the motorcycle
 *   - the plan: a blueprint in the first kilometres at a big place, another every 10–15 km
 */
import { describe, expect, it } from 'vitest';
import { fitPart, newInstance, stockBuild } from '../../src/core/modcar/build';
import { roofZoneOf, zonesFor, zonesOf } from '../../src/core/modcar/cargo';
import { frameDef } from '../../src/core/modcar/frames';
import { plan } from '../../src/core/modcar/schedule';

describe('J9c: the roof rack', () => {
  it('a rack on the roof makes it a place for things; without one, or on the motorcycle, there is none', () => {
    for (const frame of ['sedan', 'pickup', 'van', 'rv', 'goat', 'wagon', 'fox', 'snail', 'buffalo', 'rhino']) {
      const f = frameDef(frame);
      const roof = f.mounts.find((m) => m.cat === 'roof')!;
      const b = stockBuild(frame, { without: [roof.id] });
      expect(zonesFor(frame, b).some((z) => z.id === 'roof'), `${frame}: no rack, no roof zone`).toBe(false);
      expect(zonesFor(frame, b).length).toBe(zonesOf(frame).length);
      fitPart(b, roof.id, newInstance('roof_rack'));
      const zones = zonesFor(frame, b);
      const z = zones.find((x) => x.id === 'roof');
      expect(z, `${frame}: a rack, a roof zone`).toBeTruthy();
      // (over the roof mount, above it, large things, packed into last, reached without a panel)
      expect(z!.floor).toBeGreaterThan(roof.pos.y);
      expect(z!.top).toBeGreaterThan(z!.floor + 0.5);
      expect(z!.x[0]).toBeLessThan(roof.pos.x);
      expect(z!.x[1]).toBeGreaterThan(roof.pos.x);
      expect(z!.max).toBe('large');
      expect(z!.via).toBeUndefined();
      expect(Math.max(...zones.filter((x) => x.id !== 'roof' && x.id !== 'dash' && !x.wall).map((x) => x.order))).toBeLessThan(z!.order);
      // (another roof part — the motorhome's solar panel — is no rack)
      const b2 = stockBuild(frame, { without: [roof.id] });
      fitPart(b2, roof.id, newInstance('roof_solar'));
      expect(zonesFor(frame, b2).some((x) => x.id === 'roof')).toBe(false);
    }
    expect(roofZoneOf('moto')).toBeNull();
  });

  it('the plan: the blueprint in the first kilometres at a big place, then every 10–15 km', () => {
    for (const seed of [7, 1000, 8919]) {
      const bp = plan(seed, 100).filter((f) => f.entry === 'roof_rack');
      expect(bp[0].s / 1000).toBeLessThanOrEqual(4);
      expect(bp[0].themes).toContain('garage');
      for (let i = 1; i < bp.length; i++) {
        expect((bp[i].s - bp[i - 1].s) / 1000).toBeGreaterThanOrEqual(10 - 1e-6);
        expect((bp[i].s - bp[i - 1].s) / 1000).toBeLessThanOrEqual(15 + 1e-6);
      }
    }
  });
});
