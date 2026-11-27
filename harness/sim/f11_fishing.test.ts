/**
 * F11 (docs/V3/plan/finish.md §九): fishing in the journey — where the rod and the baits come from.
 *   - a tackle box has the cane and worms from the 75th kilometre, a spoon from the 95th;
 *   - a cool box on a jetty or under a lighthouse has river shrimp from the 110th and squid strips from the 150th —
 *     nowhere else, and not before; the baits are kept back until one has a rod (the fishing's set);
 *   - the better rods are made at the workbench from their sheets, each in its chapter; the Night Heron's sheet is not
 *     on the road (the third water's lord has it);
 *   - a bait is what its rarity's fish take: worm, spoon, shrimp, squid strip — one for each.
 */
import { describe, expect, it } from 'vitest';
import { BLUEPRINT_RECIPES, blueprintOf, nextBlueprint, RECIPES } from '../../src/core/modcar/crafting';
import { hasItem } from '../../src/core/modcar/items';
import { KITS } from '../../src/core/modcar/kits';
import { LOOT_V7, rollContainer, type Found } from '../../src/core/modcar/loot';
import { BAITS, RODS } from '../../src/core/v3/fishing/lite/gear';
import { baitOfItem, rodOfItem } from '../../src/core/v3/fishing/lite/items';
import '../../src/core/v3/nd/cards';
import.meta.glob('../../src/game/modcar/v3/*/index.ts', { eager: true });

const N = 1500;
const rolls = (kind: Parameters<typeof rollContainer>[0], s: number, siteKind: string): string[] => {
  const out: Found[] = [];
  for (let seed = 1; seed <= N; seed++) out.push(...rollContainer(kind, seed * 7919, s, siteKind, LOOT_V7, 'mild'));
  return out.flatMap((f) => ('item' in f ? [f.item] : []));
};
const share = (list: string[], id: string): number => list.filter((x) => x === id).length / N;

describe('F11: where the rod and the baits come from', () => {
  it('a tackle box: the cane and worms from the 75th kilometre, a spoon from the 95th', () => {
    expect(rolls('tacklebox', 70_000, 'jetty').some((id) => id === 'rod_willow' || id.startsWith('bait_'))).toBe(false);
    const at80 = rolls('tacklebox', 80_000, 'jetty');
    expect(share(at80, 'rod_willow')).toBeGreaterThan(0.1);
    expect(share(at80, 'bait_worm')).toBeGreaterThan(0.2);
    expect(at80.includes('bait_spoon')).toBe(false);
    expect(rolls('tacklebox', 94_000, 'jetty').includes('bait_spoon')).toBe(false);
    expect(share(rolls('tacklebox', 96_000, 'jetty'), 'bait_spoon')).toBeGreaterThan(0.05);
  });

  it('a cool box by the water: river shrimp from the 110th kilometre, squid strips from the 150th — on a jetty, under a lighthouse, nowhere else', () => {
    for (const where of ['jetty', 'lighthouse']) {
      expect(rolls('coolbox', 100_000, where).some((id) => id.startsWith('bait_'))).toBe(false);
      const at120 = rolls('coolbox', 120_000, where);
      expect(share(at120, 'bait_shrimp')).toBeGreaterThan(0.08);
      expect(at120.includes('bait_squid_strip')).toBe(false);
      const at160 = rolls('coolbox', 160_000, where);
      expect(share(at160, 'bait_shrimp')).toBeGreaterThan(0.06);
      expect(share(at160, 'bait_squid_strip')).toBeGreaterThan(0.04);
    }
    expect(rolls('coolbox', 200_000, 'camp').some((id) => id.startsWith('bait_'))).toBe(false);
  });

  it('the baits are the fishing set\'s, kept back until one has a rod; each is a thing there is', () => {
    const kit = KITS.find((k) => k.id === 'fishing')!;
    expect((kit.main as { item?: string }).item).toBe('rod_willow');
    for (const id of ['bait_worm', 'bait_spoon', 'bait_shrimp', 'bait_squid_strip']) {
      expect(kit.held, id).toContain(id);
      expect(hasItem(id), id).toBe(true);
      expect(baitOfItem(id), id).toBeGreaterThanOrEqual(0);
    }
    // (one bait for each rarity a rod fishes for: common, uncommon, rare, epic)
    expect(['worm', 'spoon', 'shrimp', 'squid_strip'].map((id) => BAITS.find((b) => b.id === id)!.tier)).toEqual([0, 1, 2, 3]);
  });

  it('the better rods are made from their sheets, each in its chapter; the Night Heron\'s sheet is not on the road', () => {
    const made = RECIPES.filter((r) => 'item' in r.makes && rodOfItem(r.makes.item) >= 0);
    expect(made.map((r) => r.id).sort()).toEqual(['rod_heron', 'rod_pro', 'rod_sea', 'rod_swift']);
    expect(made.map((r) => [r.id, r.chapter]).sort()).toEqual([
      ['rod_heron', 8],
      ['rod_pro', 7],
      ['rod_sea', 8],
      ['rod_swift', 6],
    ]);
    // (the cane is found, never made)
    expect(RODS.map((r) => r.id).filter((id) => !made.some((m) => 'item' in m.makes && m.makes.item === id))).toEqual(['rod_willow']);
    // (the road hands out the sheet of the next thing not learnt yet: with every other learnt, it has none left — the
    // Night Heron's is never its to give)
    const road = BLUEPRINT_RECIPES.filter((r) => !r.rare).map((r) => r.id);
    expect(road).toContain('rod_swift');
    expect(road).toContain('rod_pro');
    expect(road).toContain('rod_sea');
    expect(road).not.toContain('rod_heron');
    expect(nextBlueprint(8, new Set(road))).toBeNull();
    // (… and the sheet is a thing there is: the third water's lord has it)
    expect(hasItem(blueprintOf('rod_heron'))).toBe(true);
  });
});
