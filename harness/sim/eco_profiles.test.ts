import { describe, expect, it } from 'vitest';
import { ECO_PROFILES, ECO_TREE_FAMILIES } from '../../src/core/world/data/ecoProfiles';

function checkMonths(months: readonly number[]) {
  expect(months.length).toBeGreaterThan(0);
  expect(new Set(months).size).toBe(months.length);
  for (const month of months) {
    expect(Number.isInteger(month) && month >= 1 && month <= 12).toBe(true);
  }
}

function checkShares(items: readonly { share: number }[]) {
  for (const item of items) expect(item.share).toBeGreaterThan(0);
  expect(items.reduce((sum, item) => sum + item.share, 0)).toBeCloseTo(1, 3);
}

describe('road ecology reference catalogue', () => {
  const ids = new Set(ECO_PROFILES.map(profile => profile.id));
  it('has distinct ids, known families and traceable road names', () => {
    expect(ids.size).toBe(ECO_PROFILES.length);
    expect(new Set(ECO_TREE_FAMILIES).size).toBe(ECO_TREE_FAMILIES.length);
    for (const profile of ECO_PROFILES) expect(profile.roads.length).toBeGreaterThan(0);
  });

  for (const profile of ECO_PROFILES) {
    it(profile.id, () => {
      const { climate, bands } = profile;
      for (const series of [climate.highC, climate.lowC, climate.precipMm, climate.snowCover]) {
        expect(series).toHaveLength(12);
        expect(series.every(Number.isFinite)).toBe(true);
      }
      for (let m = 0; m < 12; m++) {
        expect(climate.lowC[m]).toBeLessThanOrEqual(climate.highC[m]);
        expect(climate.precipMm[m]).toBeGreaterThanOrEqual(0);
        expect(climate.snowCover[m]).toBeGreaterThanOrEqual(0);
        expect(climate.snowCover[m]).toBeLessThanOrEqual(1);
      }
      for (const line of [profile.treelineM, profile.snowlineM]) {
        expect(line).toHaveLength(4);
        expect(line.every(value => value === null || Number.isFinite(value))).toBe(true);
      }
      expect(bands.length).toBeGreaterThan(0);
      for (const [i, band] of bands.entries()) {
        expect(band.toM).toBeGreaterThan(band.fromM);
        if (i > 0) expect(band.fromM).toBe(bands[i - 1].toM);
        if (band.trees.length > 0) checkShares(band.trees);
        for (const tree of band.trees) expect(ECO_TREE_FAMILIES).toContain(tree.family);
        for (const tree of band.pendingTrees ?? []) expect(profile.needsModel).toContain(tree);
        for (const flower of band.flowers) {
          expect(flower.colors.length).toBeGreaterThan(0);
          checkMonths(flower.bloomMonths);
        }
      }
      for (const insect of profile.insects) checkMonths(insect.months);
      checkShares(profile.rocks);
      expect(profile.transitions.length).toBeGreaterThan(0);
      for (const edge of profile.transitions) {
        expect(ids.has(edge.to)).toBe(true);
        expect(edge.widthM).toBeGreaterThan(0);
        expect(edge.reason.length).toBeGreaterThan(0);
      }
    });
  }
});
