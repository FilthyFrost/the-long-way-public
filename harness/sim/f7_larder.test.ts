/**
 * F7 (docs/V3/plan/finish.md §八 1): where the ingredients come from, in a world of version 7 —
 *   - what is hunted is in a hunter's bag at his stand, from the garden's chapter on (venison);
 *   - what the shore gives is in the cool box on a jetty or under a lighthouse, from the fishing's chapter on
 *     (shrimp, clams, a crab; a lobster far down the road), and in no other place's;
 *   - the bed of the garden behind a house still has a vegetable or two coming up in it, from the garden's chapter on;
 *   - by the country: a warm one has more of what likes the warmth (a chilli, an aubergine, maize), a cold one more
 *     potatoes, cabbage, onions;
 *   - an ingredient lying at a place is not there before the road allows one so hard to come by (a cabin's steak
 *     waits for the 70th kilometre, as a refrigerator's does).
 * A world made before version 7 is as it was.
 */
import { describe, expect, it } from 'vitest';
import '../../src/core/v3/nd/cards';
import.meta.glob('../../src/game/modcar/v3/*/index.ts', { eager: true });
import { itemDef } from '../../src/core/modcar/items';
import { BED_FROM_M, larder, looseFound, LOOT_V6, LOOT_V7, rollContainer, type Found } from '../../src/core/modcar/loot';
import { FOOD, GARDEN_BED, LARDER_SHELF, LIKES } from '../../src/core/v3/kitchen/pantry';
import type { Site } from '../../src/core/world/sites';
import { modcarWorld } from '../../src/game/modcar/seamless';

const items = (fs: readonly Found[]): string[] => fs.flatMap((f) => ('item' in f ? [f.item] : []));
const count = (n: number, roll: (seed: number) => readonly (Found | null)[], test: (item: string) => boolean): number => {
  let c = 0;
  for (let seed = 1; seed <= n; seed++) for (const f of roll(seed)) if (f && 'item' in f && test(f.item)) c++;
  return c;
};

describe('F7: where the ingredients come from', () => {
  it('the larder\'s shelves: every one of the sixty that a place may keep is on one, the garden\'s bed besides', () => {
    const rows = larder();
    for (const [id, shelf] of Object.entries(LARDER_SHELF)) expect(rows.some((r) => r.item === `ing_${id}` && r.shelf === shelf), id).toBe(true);
    for (const id of GARDEN_BED) expect(rows.some((r) => r.item === `ing_${id}` && r.shelf === 'bed'), id).toBe(true);
    expect(GARDEN_BED).toEqual(expect.arrayContaining(['tomato', 'potato', 'carrot', 'onion', 'cabbage', 'cucumber', 'corn', 'lettuce', 'pepper', 'eggplant', 'pumpkin', 'broccoli', 'garlic', 'chili']));
    for (const id of Object.keys(LIKES)) expect(FOOD[id], id).toBeDefined();
    expect(LARDER_SHELF.venison).toBe('game');
    for (const id of ['shrimp', 'clam', 'crab', 'lobster']) expect(LARDER_SHELF[id]).toBe('sea');
  });

  it('venison: in a hunter\'s bag from the garden\'s chapter on, never before, never in a world made before', () => {
    const at = (s: number, rules = LOOT_V7): number => count(1500, (seed) => rollContainer('gamebag', seed, s, 'hide', rules), (i) => i === 'ing_venison');
    expect(at(40_000)).toBe(0);
    expect(at(80_000)).toBeGreaterThan(60);
    expect(at(80_000, LOOT_V6)).toBe(0);
    // (before its kilometres the bag holds as many things as it always did: the joint is not in the table yet)
    for (let seed = 1; seed <= 200; seed++) expect(rollContainer('gamebag', seed, 30_000, 'hide', LOOT_V7).length).toBe(rollContainer('gamebag', seed, 30_000, 'hide', LOOT_V6).length);
  });

  it('shellfish: in the cool box on a jetty or under a lighthouse from the fishing\'s chapter on; a lobster far down the road; in no camp\'s', () => {
    const sea = (i: string): boolean => ['ing_shrimp', 'ing_clam', 'ing_crab', 'ing_lobster'].includes(i);
    const at = (s: number, sort: string, test = sea): number => count(1500, (seed) => rollContainer('coolbox', seed, s, sort, LOOT_V7), test);
    expect(at(60_000, 'jetty')).toBe(0);
    expect(at(90_000, 'jetty')).toBeGreaterThan(300);
    expect(at(90_000, 'lighthouse')).toBeGreaterThan(300);
    expect(at(90_000, 'camp')).toBe(0);
    expect(at(260_000, 'camp')).toBe(0);
    expect(at(90_000, 'jetty', (i) => i === 'ing_lobster')).toBe(0);
    expect(at(200_000, 'jetty', (i) => i === 'ing_lobster')).toBeGreaterThan(0);
    // (a camp's cool box: what it held before, roll for roll)
    for (let seed = 1; seed <= 200; seed++) expect(items(rollContainer('coolbox', seed, 90_000, 'camp', LOOT_V7)).every((i) => !sea(i))).toBe(true);
  });

  it('a garden\'s bed behind a house: a vegetable or two of the garden\'s from the 50th kilometre on, by the seed; nothing before, nothing in a world made before', () => {
    expect(BED_FROM_M).toBe(50_000);
    const bed = new Set(GARDEN_BED.map((id) => `ing_${id}`));
    let n = 0;
    for (let seed = 1; seed <= 600; seed++) {
      const f = looseFound('plot.bed', seed, 60_000, 'house', LOOT_V7);
      expect(f).toEqual(looseFound('plot.bed', seed, 60_000, 'house', LOOT_V7));
      expect(looseFound('plot.bed', seed, 40_000, 'house', LOOT_V7)).toBeNull();
      expect(looseFound('plot.bed', seed, 60_000, 'house', LOOT_V6)).toBeNull();
      if (!f || !('item' in f)) continue;
      n++;
      expect(bed.has(f.item), f.item).toBe(true);
      expect(f.n ?? 1).toBeLessThanOrEqual(3);
      // (no better than the road allows this far: ★2 to the 70th kilometre)
      expect(itemDef(f.item).stars).toBeLessThanOrEqual(2);
    }
    expect(n).toBe(600);
    // the potatoes the old game left on the bed: a vegetable of the bed's from there on; before, and in a world made before, what they were
    const old = looseFound('food.potato', 9, 60_000, 'house', LOOT_V7)!;
    expect('item' in old && bed.has(old.item)).toBe(true);
    const early = looseFound('food.potato', 9, 40_000, 'house', LOOT_V7)!;
    expect('item' in early && !bed.has(early.item)).toBe(true);
    const before = looseFound('food.potato', 9, 60_000, 'house', LOOT_V6)!;
    expect('item' in before && !before.item.startsWith('ing_')).toBe(true);
  });

  it('by the country: a warm one has more of what likes the warmth, a cold one more of what keeps through a winter', () => {
    const warm = (i: string): boolean => LIKES[i.slice(4)] === 'hot';
    const cold = (i: string): boolean => LIKES[i.slice(4)] === 'cold';
    const bed = (climate: 'hot' | 'cold' | 'mild', test: (i: string) => boolean): number => count(3000, (seed) => [looseFound('plot.bed', seed, 130_000, 'house', LOOT_V7, climate)], test);
    expect(bed('hot', warm)).toBeGreaterThan(2.5 * bed('cold', warm));
    expect(bed('cold', cold)).toBeGreaterThan(2.5 * bed('hot', cold));
    expect(bed('mild', warm)).toBeGreaterThan(bed('cold', warm));
    expect(bed('mild', warm)).toBeLessThan(bed('hot', warm));
    // a refrigerator's too: bananas and oranges in the warm, butter and cheese in the cold
    const fridge = (climate: 'hot' | 'cold', test: (i: string) => boolean): number => count(3000, (seed) => rollContainer('fridge', seed, 130_000, 'house', LOOT_V7, climate), test);
    expect(fridge('hot', warm)).toBeGreaterThan(2 * fridge('cold', warm));
    expect(fridge('cold', cold)).toBeGreaterThan(2 * fridge('hot', cold));
  });

  it('an ingredient lying at a place waits for the road to allow one so hard to come by; in a world made before it lies there as it did', () => {
    // (a cabin's steak, ★3: from the 70th kilometre; its milk, ★2: from the 35th)
    expect(looseFound('ing_beef', 1, 20_000, 'house', LOOT_V7)).toBeNull();
    expect(looseFound('ing_beef', 1, 60_000, 'house', LOOT_V7)).toBeNull();
    expect(looseFound('ing_beef', 1, 80_000, 'house', LOOT_V7)).toEqual({ item: 'ing_beef' });
    expect(looseFound('ing_milk', 1, 20_000, 'house', LOOT_V7)).toBeNull();
    expect(looseFound('ing_milk', 1, 40_000, 'house', LOOT_V7)).toEqual({ item: 'ing_milk' });
    expect(looseFound('ing_beef', 1, 20_000, 'house', LOOT_V6)).toEqual({ item: 'ing_beef' });
    // (what is no ingredient is there as ever)
    expect(looseFound('nd_baked_beans', 1, 5_000, 'house', LOOT_V7)).toEqual({ item: 'nd_baked_beans' });
  });

  it('down real worlds of version 7: a house of ours has two to four things in its garden\'s bed, on the bed; a world made before has none', () => {
    let houses = 0;
    let packets = 0;
    for (const seed of [7, 8919, 16838]) {
      const sites: Site[] = [];
      modcarWorld(seed, { worldVersion: 7 }).world.sites.between(0, 120_000, sites);
      for (const site of sites) {
        const beds = site.loose.filter((l) => l.item === 'plot.bed');
        if (site.kind !== 'house' || site.prefab) {
          expect(beds.length, `${site.id} (${site.kind})`).toBe(0);
          continue;
        }
        houses++;
        const patch = site.objects.find((o) => o.kind === 'patch')!;
        expect(beds.length).toBeGreaterThanOrEqual(2);
        expect(beds.length).toBeLessThanOrEqual(4);
        for (const l of beds) {
          expect(Math.hypot(l.x - patch.x, l.z - patch.z)).toBeLessThan(Math.hypot(patch.w, patch.d) / 2);
          expect(l.y).toBeCloseTo(patch.y + patch.h, 5);
        }
        // (laid after all the rest: the last of the place's things — and a packet of seeds on its mailbox, two houses in five)
        const seeds = site.loose.filter((l) => l.item === 'plot.seeds');
        expect(seeds.length).toBeLessThanOrEqual(1);
        packets += seeds.length;
        expect(site.loose.slice(-(beds.length + seeds.length)).every((l) => l.item === 'plot.bed' || l.item === 'plot.seeds')).toBe(true);
        const box = site.objects.find((o) => o.kind === 'mailbox')!;
        for (const l of seeds) expect(Math.hypot(l.x - box.x, l.z - box.z)).toBeLessThan(0.05);
      }
      const before: Site[] = [];
      modcarWorld(seed, { worldVersion: 6 }).world.sites.between(0, 120_000, before);
      expect(before.some((s) => s.loose.some((l) => l.item === 'plot.bed'))).toBe(false);
    }
    expect(houses).toBeGreaterThan(10);
    expect(packets / houses).toBeGreaterThan(0.2);
    expect(packets / houses).toBeLessThan(0.6);
  });
});

describe('F7: the garden\'s seeds', () => {
  it('every packet is of the garden\'s set: kept back until the pot is one\'s own, the tomato\'s and the potato\'s its steps', async () => {
    const { CROP_IDS, ND_SEEDS } = await import('../../src/core/v3/nd/items');
    const { kitHeld, kitOf, kitPicked } = await import('../../src/core/modcar/kits');
    const st = {};
    for (const id of CROP_IDS) {
      expect(kitOf(ND_SEEDS[id])?.kit.id, id).toBe('garden');
      expect(kitHeld(st, ND_SEEDS[id]), id).toBe(true);
    }
    kitPicked(st, 'nd_plant_pot', 52_000, 7);
    // (the pot one's own: every packet may be found — but the potato's, the set's third step, after the tomato's)
    for (const id of CROP_IDS) expect(kitHeld(st, ND_SEEDS[id]), id).toBe(id === 'potato');
  });

  it('a packet now and then in a kitchen\'s cupboard and a desk\'s drawer from the garden\'s chapter on — one thing more, not one of its picks; the plainer ones first', async () => {
    const { CROP_INFO } = await import('../../src/core/v3/nd/items');
    const seeds = (i: string): boolean => i.startsWith('nd_seeds_');
    const stars = (i: string): number => CROP_INFO[i.slice(9) as keyof typeof CROP_INFO].stars;
    for (const kind of ['cupboard', 'desk'] as const) {
      const at = (s: number, rules = LOOT_V7): string[] => {
        const out: string[] = [];
        for (let seed = 1; seed <= 2500; seed++) out.push(...items(rollContainer(kind, seed, s, 'house', rules)).filter(seeds));
        return out;
      };
      expect(at(40_000).length, kind).toBe(0);
      expect(at(80_000, LOOT_V6).length, kind).toBe(0);
      const near = at(60_000);
      const far = at(240_000);
      expect(near.length, kind).toBeGreaterThan(150);
      expect(near.length, kind).toBeLessThan(700);
      const mean = (l: string[]): number => l.reduce((a, i) => a + stars(i), 0) / l.length;
      expect(mean(far)).toBeGreaterThan(mean(near));
      // (what it held besides is what it held: its picks as they were before the packet)
      for (let seed = 1; seed <= 300; seed++) {
        const before = items(rollContainer(kind, seed, 40_000, 'house', LOOT_V7));
        expect(before.some(seeds)).toBe(false);
      }
    }
  });

  it('a packet left on a house\'s mailbox: seeds of the garden\'s from the 50th kilometre on, the same every time; none before, none in a world made before', () => {
    let n = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const f = looseFound('plot.seeds', seed, 70_000, 'house', LOOT_V7);
      expect(f).toEqual(looseFound('plot.seeds', seed, 70_000, 'house', LOOT_V7));
      expect(looseFound('plot.seeds', seed, 30_000, 'house', LOOT_V7)).toBeNull();
      expect(looseFound('plot.seeds', seed, 70_000, 'house', LOOT_V6)).toBeNull();
      if (f && 'item' in f && f.item.startsWith('nd_seeds_')) n++;
    }
    expect(n).toBe(300);
  });
});
