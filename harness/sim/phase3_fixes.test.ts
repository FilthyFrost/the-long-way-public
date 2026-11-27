import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FOOD_LOOK, MEALS, PREPS } from '../../src/core/v3/kitchen/looks';
import { FOODS } from '../../src/core/v3/kitchen/pantry';

const ITEM_DIR = path.resolve(process.cwd(), 'public/models/modcar/items');

describe('Playtest Round 2 Phase 3 regressions (#29 food, cut states, and dishes)', () => {
  it('maps beef, lamb, and venison to dedicated prep_beef_slices with marbled fat contrast', () => {
    expect(PREPS).toContain('beef_slices');
    for (const id of ['beef', 'lamb', 'venison']) {
      expect(FOOD_LOOK[id]?.prep, id).toBe('beef_slices');
      expect(FOOD_LOOK[id]?.skin, `${id} fat contrast`).not.toBe(FOOD_LOOK[id]?.flesh);
    }
  });

  it('exports all 60 food_*.glb, 14 prep_*.glb (incl. prep_beef_slices), and 34 meal_*.glb models on disk', () => {
    for (const f of FOODS) {
      const p = path.join(ITEM_DIR, `food_${f.id}.glb`);
      expect(fs.existsSync(p), p).toBe(true);
      expect(fs.statSync(p).size, p).toBeGreaterThan(2000);
    }
    for (const pr of PREPS) {
      const p = path.join(ITEM_DIR, `prep_${pr}.glb`);
      expect(fs.existsSync(p), p).toBe(true);
      expect(fs.statSync(p).size, p).toBeGreaterThan(2000);
    }
    for (const m of MEALS) {
      const p = path.join(ITEM_DIR, `meal_${m}.glb`);
      expect(fs.existsSync(p), p).toBe(true);
      expect(fs.statSync(p).size, p).toBeGreaterThan(2000);
    }
  });
});
