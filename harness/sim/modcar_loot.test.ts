/**
 * What is found at the places by the road (src/core/modcar/loot.ts, docs/MODCAR.md §20): the same cupboard holds
 * the same things every time; a kitchen food and drink, a wardrobe clothes, a till snacks and oil, a toolbox spray
 * cans and small parts, a garage's shelves the big parts, better further down the road; what lies in plain sight is
 * a tyre, a jerrycan, food, junk to recycle; a filling station's pumps hold petrol and diesel.
 */
import { describe, expect, it } from 'vitest';
import { partStars } from '../../src/core/modcar/crafting';
import { itemDef } from '../../src/core/modcar/items';
import { CONTAINER_NAMES, LOOT_TABLES, looseFound, rollContainer, stationFuel, type Found } from '../../src/core/modcar/loot';
import { partDef } from '../../src/core/modcar/parts';

const SEEDS = Array.from({ length: 400 }, (_, i) => (i * 2654435761) | 0);
const kindOf = (f: Found): string => ('item' in f ? `item:${itemDef(f.item).cat}` : 'tool' in f ? `tool:${f.tool.kind}` : `part:${partDef(f.part.part).cat}`);
const strip = (f: Found): unknown => JSON.parse(JSON.stringify(f, (k, v) => (k === 'uid' ? undefined : v)));

describe('ModCar loot at the places by the road', () => {
  it('is the same for the same container, and every thing is a real one', () => {
    for (const kind of Object.keys(LOOT_TABLES) as (keyof typeof LOOT_TABLES)[]) {
      expect(CONTAINER_NAMES[kind]).toBeTruthy();
      for (const seed of SEEDS.slice(0, 60)) {
        const a = rollContainer(kind, seed, 8000, 'house');
        const b = rollContainer(kind, seed, 8000, 'house');
        expect(a.map(strip)).toEqual(b.map(strip));
        for (const f of a) {
          if ('item' in f) expect(itemDef(f.item).carry).not.toBe('large');
          if ('part' in f) expect(partDef(f.part.part)).toBeTruthy();
        }
      }
    }
  });

  it('holds what its kind holds: a kitchen food and drink, a wardrobe clothes, a garage’s shelves parts, a toolbox tools', () => {
    const share = (kind: keyof typeof LOOT_TABLES, test: (k: string) => boolean): number => {
      let n = 0;
      let hit = 0;
      for (const seed of SEEDS) {
        for (const f of rollContainer(kind, seed, 5000, 'house')) {
          n++;
          if (test(kindOf(f))) hit++;
        }
      }
      return hit / Math.max(1, n);
    };
    expect(share('cupboard', (k) => k === 'item:food' || k === 'item:drink' || k === 'item:junk')).toBeGreaterThan(0.85);
    expect(share('wardrobe', (k) => k === 'item:wear')).toBeGreaterThan(0.6);
    expect(share('garage', (k) => k.startsWith('part:'))).toBeGreaterThan(0.9);
    expect(share('toolbox', (k) => k.startsWith('tool:') || k.startsWith('part:') || k === 'item:crate' || k === 'item:gear')).toBeGreaterThan(0.85);
    expect(share('counter', (k) => k === 'item:food' || k === 'item:drink')).toBeGreaterThan(0.6);
    expect(share('medicine', (k) => k === 'item:med')).toBe(1);
    // (a wreck's glovebox and boot are the wreck's own in ModCar)
    expect(SEEDS.every((s) => rollContainer('glovebox', s, 0).length === 0)).toBe(true);
  });

  it('gives better parts further down the road, wheels with tyres, used but not wrecked', () => {
    const mean = (s: number): number => {
      let sum = 0;
      let n = 0;
      for (const seed of SEEDS) {
        for (const f of rollContainer('garage', seed, s, 'garage')) {
          if (!('part' in f)) continue;
          sum += partStars(f.part.part);
          n++;
          expect(f.part.cond).toBeGreaterThanOrEqual(0.35);
          if (partDef(f.part.part).rim?.tire) expect(f.part.sub.tire).toBeTruthy();
        }
      }
      return sum / n;
    };
    expect(mean(100_000)).toBeGreaterThan(mean(0) + 0.25);
  });

  it('turns what lies in plain sight into ModCar things: a tyre, a jerrycan, an oil can, food, junk; not bait', () => {
    const t = looseFound('tyre.road', 1, 0, 'roadside');
    expect(t && 'part' in t && t.part.part).toBe('tire_road');
    const j = looseFound('fuel.jerrycan', 2, 0, 'station');
    expect(j && 'tool' in j && j.tool.kind).toBe('jerrycan');
    const o = looseFound('fuel.oil', 3, 0, 'station');
    expect(o && 'tool' in o && o.tool.kind).toBe('oilcan');
    const f = looseFound('food.can.beans', 4, 0, 'house');
    expect(f && 'item' in f && itemDef(f.item).cat).toBe('food');
    const m = looseFound('mat.plank', 5, 0, 'house');
    expect(m && 'item' in m && itemDef(m.item).cat).toBe('junk');
    expect(looseFound('bait.worm', 6, 0, 'jetty')).toBeNull();
    expect(looseFound('mat.plank', 5, 0, 'house')).toEqual(looseFound('mat.plank', 5, 0, 'house'));
  });

  it('a filling station holds petrol and diesel: a tank of each and more', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const f = stationFuel(15 + (seed & 15), seed);
      expect(f.petrol).toBeGreaterThan(60);
      expect(f.petrol).toBeLessThan(220);
      expect(f.diesel).toBeGreaterThan(30);
    }
  });
});
