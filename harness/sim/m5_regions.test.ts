import { expect, it } from 'vitest';
import { borderWidth } from '../../src/core/world/routeProfiles';
import { RoadSpine } from '../../src/core/world/spine';
import { ECO_PROFILES } from '../../src/core/world/data/ecoProfiles';
import { regionJourney } from './regionJourney';

it('uses the measured Sierra ascent width and keeps all three regions reachable in an early save', () => {
  const ascent = ECO_PROFILES.find(p => p.id === 'sierra-valley')!.transitions.find(e => e.to === 'sierra-high')!;
  expect(borderWidth('forest', 'alpine')).toBe(ascent.widthM);
  const plan = new RoadSpine(7, { worldVersion: 2, regionCount: 3, startBiome: 'alpine' }).plan;
  plan.biomeOf(60);
  expect(new Set(plan.biomes)).toEqual(new Set([0, 1, 2]));
});

for (const seed of [7, 31, 113, 2026]) {
  it(`paces 300 km of connected landscapes and changing road geometry, seed ${seed}`, () => {
    const { regions, changes, gaps, maxGrade, maxRadiusRatio } = regionJourney(seed);
    expect(regions.length).toBeGreaterThanOrEqual(30);
    expect(new Set(regions.map(r => r.id)).size).toBeGreaterThanOrEqual(11);
    for (const [i, r] of regions.entries()) {
      expect(r.end - r.start).toBeGreaterThanOrEqual(6000);
      expect(r.end - r.start).toBeLessThanOrEqual(15000);
      if (i > 0) expect(borderWidth(regions[i - 1].id, r.id)).toBeDefined();
    }
    gaps.sort((a, b) => a - b);
    expect(gaps[Math.floor(gaps.length * 0.90)]).toBeLessThanOrEqual(500);
    expect(changes.enclosure).toBeGreaterThan(30);
    expect(changes.grade).toBeGreaterThan(250);
    expect(changes.curve).toBeGreaterThan(1200);
    expect(maxGrade).toBeLessThanOrEqual(0.08);
    expect(maxRadiusRatio).toBeLessThanOrEqual(1.001);
  });
}
