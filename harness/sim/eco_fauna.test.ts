import { describe, expect, it } from 'vitest';
import { FORAGE_KINDS } from '../../src/core/v3/forage/kinds';
import { ECO_PROFILES } from '../../src/core/world/data/ecoProfiles';
import {
  ROAD_ANIMALS, ROAD_CROPS, ROAD_FISH, ROAD_FOODS, ROAD_LIFE, type RoadLife,
} from '../../src/core/world/data/ecoFauna';

function checkMonths(months: readonly number[]) {
  expect(months.length).toBeGreaterThan(0);
  expect(new Set(months).size).toBe(months.length);
  expect(months.every(m => Number.isInteger(m) && m >= 1 && m <= 12)).toBe(true);
}

describe('roadside wildlife and agriculture references', () => {
  it('covers exactly the profile catalogue', () => {
    expect(Object.keys(ROAD_LIFE).sort()).toEqual(ECO_PROFILES.map(p => p.id).sort());
  });

  it('has valid calendar windows, group sizes and existing forage references', () => {
    const forage = new Set(FORAGE_KINDS.map(k => k.id));
    for (const a of Object.values(ROAD_ANIMALS)) {
      checkMonths(a.months);
      expect(a.visibleGroup[0]).toBeGreaterThan(0);
      expect(a.visibleGroup[1]).toBeGreaterThanOrEqual(a.visibleGroup[0]);
    }
    for (const f of Object.values(ROAD_FISH)) checkMonths(f.months);
    for (const c of Object.values(ROAD_CROPS)) {
      if (c.sowMonths) checkMonths(c.sowMonths);
      checkMonths(c.harvestMonths);
    }
    for (const f of Object.values(ROAD_FOODS)) {
      checkMonths(f.months);
      if (f.forageId !== null) expect(forage.has(f.forageId)).toBe(true);
    }
  });

  for (const p of ECO_PROFILES) {
    it(p.id, () => {
      const profile: RoadLife = ROAD_LIFE[p.id as keyof typeof ROAD_LIFE];
      expect(profile.animals.length).toBeGreaterThan(0);
      for (const animal of profile.animals) {
        expect(ROAD_ANIMALS[animal.kind]).toBeDefined();
        expect(animal.bands.length).toBeGreaterThan(0);
        for (const i of animal.bands) expect(p.bands[i]).toBeDefined();
        if (animal.months) checkMonths(animal.months);
      }
      for (const id of profile.fish) expect(ROAD_FISH[id]).toBeDefined();
      for (const id of profile.foods) expect(ROAD_FOODS[id]).toBeDefined();
      for (const id of profile.crops) expect(ROAD_CROPS[id]).toBeDefined();
    });
  }
});
