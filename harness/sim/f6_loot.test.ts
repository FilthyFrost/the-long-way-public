/**
 * F6 (docs/V3/plan/finish.md §二 4, 6): what is found, by the rules of the world's version.
 *   - 档次: a world of version 7 has its better things further out — out to the 250th kilometre, nothing over ★2 before
 *     the 20th, ★3 to the 60th, ★4 to the 120th; ingredients from the 35th, their ★3 from the 70th; thick clothes from
 *     the 60th;
 *   - 转型: what there is to eat is all ready to eat down to the 35th kilometre, then less and less of it — three parts
 *     in ten at the 150th — the rest an ingredient that keeps;
 *   - 主题: a place's refrigerator and a camp's cool box hold what wants the cold, a tackle box a rod and bait from the
 *     fishing's chapter on, a wardrobe what the road ahead asks for;
 *   - 看前方: a thick coat before the snow, a big bottle of water before the desert, a can of petrol before a long way
 *     with no place;
 *   - a world made before is as it was.
 */
import { describe, expect, it } from 'vitest';
import { partStars } from '../../src/core/modcar/crafting';
import { hasItem, itemDef } from '../../src/core/modcar/items';
import { AHEAD_COAT, AHEAD_WATER, BEFORE_BORDER_M, climateAhead, LONG_WAY_M, lookAheadFinds, regionsAlong, type RoadRegion } from '../../src/core/modcar/lookahead';
import { larder, LOOT_V6, LOOT_V7, lootRules, planBoxes, rollContainer, THICK_WARMTH, type Found } from '../../src/core/modcar/loot';
import { partDef } from '../../src/core/modcar/parts';
import type { PlanPlace } from '../../src/core/modcar/schedule';
import { findOdds, rollWreck } from '../../src/core/modcar/wrecks';
import type { Site } from '../../src/core/world/sites';
import { planPlaces } from '../../src/game/modcar/places';
import { modcarWorld } from '../../src/game/modcar/seamless';
import '../../src/core/v3/nd/cards';
// (the modules' own things, the kitchen's larder among them, registered as the game installs them)
import.meta.glob('../../src/game/modcar/v3/*/index.ts', { eager: true });

const N = 1500;
const rolls = (kind: Parameters<typeof rollContainer>[0], s: number, siteKind: string, rules = LOOT_V7, climate: 'mild' | 'cold' | 'hot' = 'mild'): Found[] => {
  const out: Found[] = [];
  for (let seed = 1; seed <= N; seed++) out.push(...rollContainer(kind, seed * 7919, s, siteKind, rules, climate));
  return out;
};
const items = (list: Found[]): string[] => list.flatMap((f) => ('item' in f ? [f.item] : []));
const isIng = (id: string): boolean => id.startsWith('ing_');

describe('F6: the rules of what is found, by the world\'s version', () => {
  it('a world made before version 7 is as it always was', () => {
    expect(lootRules(5)).toBe(LOOT_V6);
    expect(lootRules(6)).toBe(LOOT_V6);
    expect(lootRules(7)).toBe(LOOT_V7);
    // (a part is a new thing each time it is rolled: its own id aside)
    const plain = (list: Found[]): string => JSON.stringify(list).replace(/"uid":"[^"]*"/g, '"uid":""');
    for (const kind of ['crate', 'cupboard', 'shelf', 'wardrobe', 'garage', 'tacklebox', 'toolbox'] as const) {
      for (const seed of [3, 77, 4242]) {
        for (const s of [2000, 60_000, 180_000]) expect(plain(rollContainer(kind, seed, s, 'house', LOOT_V6)), `${kind} ${seed} ${s}`).toBe(plain(rollContainer(kind, seed, s, 'house')));
      }
    }
    // (everything to eat ready to eat, anything anywhere, no ingredient in a cupboard)
    expect(items(rolls('cupboard', 180_000, 'house', LOOT_V6)).some(isIng)).toBe(false);
    expect(findOdds(100_000)).toEqual(findOdds(300_000));
    const parts = (w: ReturnType<typeof rollWreck>): string => JSON.stringify([Object.entries(w.build.parts).map(([m, p]) => [m, p.part, p.cond, p.sub.tire?.part ?? null]), w.finds, w.items]);
    for (const seed of [5, 9, 31]) expect(parts(rollWreck(seed, seed & 3, false, 30_000, false, { farM: 100_000, top: () => 5 }))).toBe(parts(rollWreck(seed, seed & 3, false, 30_000)));
  });

  it('档次: better things out to the 250th kilometre, each grade from its own', () => {
    expect([0, 19_999, 20_000, 59_999, 60_000, 119_999, 120_000, 300_000].map((s) => LOOT_V7.top(s))).toEqual([2, 2, 3, 3, 4, 4, 5, 5]);
    expect([0, 34_999, 35_000, 69_999, 70_000, 119_999, 120_000, 169_999, 170_000].map((s) => LOOT_V7.larderTop(s))).toEqual([0, 0, 2, 2, 3, 3, 4, 4, 5]);
    // (the odds stretched: at the 100th kilometre a world of version 7 is where the others were at the 40th)
    expect(findOdds(100_000, LOOT_V7.farM)).toEqual(findOdds(40_000));
    expect(findOdds(250_000, LOOT_V7.farM)).toEqual(findOdds(100_000));
    // a workshop's shelves: the best part on them by how far down the road
    const best = (s: number): number => {
      const cap = LOOT_V7.top(s);
      let top = 0;
      for (const f of rolls('garage', s, 'garage')) {
        if (!('part' in f)) continue;
        const g = partStars(f.part.part);
        // (a sort of part with nothing so plain has its plainest: the rule is not broken by it)
        if (g > cap) expect(Math.min(...allOf(partDef(f.part.part).cat)), `${f.part.part} at ${s / 1000} km`).toBeGreaterThan(cap);
        else top = Math.max(top, g);
      }
      return top;
    };
    expect(best(10_000)).toBe(2);
    expect(best(40_000)).toBe(3);
    expect(best(90_000)).toBe(4);
    expect(best(220_000)).toBe(5);
  });

  it('a wreck by the road of a world of version 7: no find on it before the 20th kilometre, none better than the road allows after', () => {
    let early = 0;
    let later = 0;
    for (let seed = 1; seed <= 400; seed++) {
      early += rollWreck(seed, seed & 3, false, 10_000, false, LOOT_V7).finds.length;
      const w = rollWreck(seed, seed & 3, false, 40_000, false, LOOT_V7);
      later += w.finds.length;
      for (const f of w.finds) expect(partStars(f.part), f.part).toBeLessThanOrEqual(3);
    }
    expect(early).toBe(0);
    expect(later).toBeGreaterThan(20);
  });

  it('转型: all there is to eat ready to eat down to the 35th kilometre, three parts in ten of it at the 150th', () => {
    expect(larder().length).toBeGreaterThan(25);
    expect(LOOT_V7.ready(0)).toBe(1);
    expect(LOOT_V7.ready(35_000)).toBe(1);
    expect(LOOT_V7.ready(92_500)).toBeCloseTo(0.65, 6);
    expect(LOOT_V7.ready(150_000)).toBeCloseTo(0.3, 6);
    expect(LOOT_V7.ready(400_000)).toBeCloseTo(0.3, 6);
    const share = (s: number): { ready: number; n: number } => {
      const eat = items([...rolls('cupboard', s, 'house'), ...rolls('shelf', s, 'shop')]).filter((id) => isIng(id) || (hasItem(id) && itemDef(id).cat === 'food'));
      return { ready: eat.filter((id) => !isIng(id)).length / eat.length, n: eat.length };
    };
    expect(share(30_000).ready).toBe(1);
    expect(share(92_500).ready).toBeGreaterThan(0.6);
    expect(share(92_500).ready).toBeLessThan(0.7);
    expect(share(150_000).ready).toBeGreaterThan(0.26);
    expect(share(150_000).ready).toBeLessThan(0.34);
    // (as much of it as ever: a pick of food is a pick of food, ready or not — the dice fall a little otherwise)
    expect(Math.abs(share(150_000).n / share(30_000).n - 1)).toBeLessThan(0.05);
    // what is to cook in a cupboard is what keeps: rice, beans, an onion — nothing that wants the cold
    const dry = new Set(larder().filter((x) => x.shelf === 'dry').map((x) => x.item));
    for (const id of items(rolls('cupboard', 150_000, 'house')).filter(isIng)) expect(dry.has(id), id).toBe(true);
  });

  it('主题: a refrigerator and a cool box hold what wants the cold — from the kitchen\'s chapter on, the better meat from the 70th kilometre', () => {
    const fresh = new Set(larder().filter((x) => x.shelf !== 'dry').map((x) => x.item));
    const star = new Map(larder().map((x) => [x.item, x.star]));
    for (const kind of ['fridge', 'coolbox'] as const) {
      // (before the kitchen's chapter: drinks, a tin, no more)
      expect(items(rolls(kind, 20_000, 'house')).some(isIng), kind).toBe(false);
      const at50 = items(rolls(kind, 50_000, 'house')).filter(isIng);
      expect(at50.length, kind).toBeGreaterThan(N * 0.5);
      for (const id of at50) {
        expect(fresh.has(id), `${kind}: ${id}`).toBe(true);
        expect(star.get(id)!, `${kind}: ${id}`).toBeLessThanOrEqual(2);
      }
      const at80 = items(rolls(kind, 80_000, 'house')).filter(isIng);
      expect(at80.some((id) => star.get(id) === 3), kind).toBe(true);
      // (never a part, a tool, clothes)
      for (const f of rolls(kind, 80_000, 'house')) expect('item' in f, kind).toBe(true);
    }
    // the plan's finds never go in them
    const site = { containers: [{ kind: 'fridge' as const, seed: 1 }, { kind: 'coolbox' as const, seed: 2 }, { kind: 'cupboard' as const, seed: 3 }] };
    expect(planBoxes(site).map((c) => c.kind)).toEqual(['cupboard']);
  });

  it('主题: a tackle box has a rod and bait from the fishing\'s chapter on', () => {
    const early = items(rolls('tacklebox', 40_000, 'jetty'));
    expect(early.some((id) => id === 'rod_willow' || id.startsWith('bait_'))).toBe(false);
    const at80 = items(rolls('tacklebox', 80_000, 'jetty'));
    expect(at80.filter((id) => id === 'rod_willow').length).toBeGreaterThan(N * 0.1);
    expect(at80.filter((id) => id === 'bait_worm').length).toBeGreaterThan(N * 0.2);
    expect(at80.includes('bait_spoon')).toBe(false);
    expect(items(rolls('tacklebox', 110_000, 'jetty')).includes('bait_spoon')).toBe(true);
    // (a world made before: a broken rod and a tin, as ever)
    expect(items(rolls('tacklebox', 110_000, 'jetty', LOOT_V6)).some((id) => id === 'rod_willow' || id.startsWith('bait_'))).toBe(false);
  });

  it('主题: thick clothes from the 60th kilometre — but a wardrobe before the cold has them, and one before the heat the light ones', () => {
    const warmth = (list: string[]): number[] => list.filter((id) => hasItem(id) && itemDef(id).wear).map((id) => itemDef(id).wear!.warmth);
    const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
    const mild30 = warmth(items(rolls('wardrobe', 30_000, 'house')));
    expect(Math.max(...mild30)).toBeLessThan(THICK_WARMTH);
    expect(Math.max(...warmth(items(rolls('wardrobe', 90_000, 'house'))))).toBeGreaterThanOrEqual(THICK_WARMTH);
    const cold30 = warmth(items(rolls('wardrobe', 30_000, 'house', LOOT_V7, 'cold')));
    const hot30 = warmth(items(rolls('wardrobe', 30_000, 'house', LOOT_V7, 'hot')));
    expect(cold30.filter((w) => w >= THICK_WARMTH).length / cold30.length).toBeGreaterThan(0.4);
    expect(mean(cold30)).toBeGreaterThan(mean(mild30) + 1.5);
    expect(mean(hot30)).toBeLessThan(mean(mild30));
  });
});

/** the stars of every part of a category */
function allOf(cat: string): number[] {
  return PARTS_BY_CAT.get(cat) ?? [];
}
import { PARTS } from '../../src/core/modcar/parts';
const PARTS_BY_CAT = new Map<string, number[]>();
for (const p of PARTS) PARTS_BY_CAT.set(p.cat, [...(PARTS_BY_CAT.get(p.cat) ?? []), partStars(p.id)]);

describe('F6: looking down the road', () => {
  const R = (from: number, to: number, what: 'mild' | 'snow' | 'desert' | 'hot'): RoadRegion => ({ from, to, snow: what === 'snow', desert: what === 'desert' || what === 'hot', climate: what === 'snow' ? 'cold' : what === 'hot' ? 'hot' : 'mild' });
  const regions = [R(0, 20_000, 'mild'), R(20_000, 30_000, 'snow'), R(30_000, 40_000, 'mild'), R(40_000, 45_000, 'snow'), R(45_000, 60_000, 'mild'), R(60_000, 70_000, 'hot'), R(70_000, 90_000, 'mild'), R(90_000, 100_000, 'snow')];
  const P = (s: number, kind: PlanPlace['kind'], boxes = 2): PlanPlace => ({ s, kind, boxes });

  it('what the road is like from a place on: cold within ten kilometres of the snow, hot before the desert', () => {
    expect(climateAhead(regions, 5000)).toBe('mild');
    expect(climateAhead(regions, 10_500)).toBe('cold');
    expect(climateAhead(regions, 25_000)).toBe('cold');
    // (out of the snow, the next of it five kilometres on)
    expect(climateAhead(regions, 35_500)).toBe('cold');
    expect(climateAhead(regions, 48_000)).toBe('mild');
    expect(climateAhead(regions, 52_000)).toBe('hot');
    expect(climateAhead(regions, 72_000)).toBe('mild');
  });

  it('a thick coat within three kilometres before the snow, at a home\'s sort of place if there is one; not again for thirty kilometres', () => {
    const places = [P(15_000, 'house'), P(17_500, 'house'), P(18_600, 'garage'), P(19_400, 'roadside', 0), P(38_500, 'house'), P(86_000, 'shop'), P(88_000, 'garage'), P(89_500, 'roadside')];
    const coats = lookAheadFinds(7, regions, places).filter((f) => f.entry === 'ahead:coat');
    // (the house at 17.5: the last of a home's sort within three kilometres of the border at 20 — the workshop after it
    // is not one; before the border at 90 the shop is four kilometres off: the last place with a box within three, the
    // lay-by at 89.5; and the snow at 40 has none: its coat was at 17.5, not thirty kilometres back)
    expect(coats.map((f) => f.s)).toEqual([17_500 - 0.5, 89_500 - 0.5]);
    expect(coats[0].any).toBeUndefined();
    expect(coats[1].any).toBe(true);
    expect(coats.every((f) => 'item' in f.thing && f.thing.item === AHEAD_COAT && f.novelty === false)).toBe(true);
    // no place of a home's sort so near: the last with a box of its own there; none there at all: the last within eight kilometres
    expect(lookAheadFinds(7, regions, [P(15_000, 'house'), P(18_600, 'garage')]).filter((f) => f.entry === 'ahead:coat')[0]).toMatchObject({ s: 18_600 - 0.5 });
    expect(lookAheadFinds(7, regions, [P(13_000, 'house')]).filter((f) => f.entry === 'ahead:coat')[0]).toMatchObject({ s: 13_000 - 0.5 });
    expect(lookAheadFinds(7, regions, [P(9_000, 'house')]).filter((f) => f.entry === 'ahead:coat' && f.s < 20_000)).toEqual([]);
    expect(BEFORE_BORDER_M).toBe(3000);
  });

  it('a big bottle of water before the desert', () => {
    const water = lookAheadFinds(7, regions, [P(55_000, 'house'), P(58_200, 'station'), P(59_700, 'roadside')]).filter((f) => f.entry === 'ahead:water');
    expect(water.length).toBe(1);
    expect(water[0]).toMatchObject({ s: 58_200 - 0.5, thing: { item: AHEAD_WATER } });
  });

  it('a can of petrol at the last place before a long way with none', () => {
    const places = [P(2_000, 'house'), P(7_100, 'garage'), P(14_000, 'house'), P(16_000, 'roadside', 0), P(23_500, 'camp'), P(26_000, 'house'), { s: 28_000, kind: 'roadside' as const, boxes: 0, ground: true }, P(34_200, 'house'), P(37_900, 'house')];
    const cans = lookAheadFinds(7, regions, places).filter((f) => f.entry === 'ahead:fuel');
    // (2.0 → 7.1: five kilometres with nowhere a can could stand, in the first chapter too — one at the house at 2;
    // 7.1 → 14: at the workshop; 14 → 23.5: the lay-by at 16 has no box, the can at the house at 14; 28.0 → 34.2: the
    // wreck's ground at 28 takes it; 34.2 → 37.9: under four, none)
    expect(cans.map((f) => f.s)).toEqual([2_000 - 0.5, 7_100 - 0.5, 14_000 - 0.5, 28_000 - 0.5]);
    for (const c of cans) expect(c.thing).toMatchObject({ tool: 'jerrycan' });
    expect(LONG_WAY_M).toBe(4000);
    // the same every time
    expect(lookAheadFinds(7, regions, places)).toEqual(lookAheadFinds(7, regions, places));
  });

  it('over real worlds: where the road comes into the snow or the desert its thing is at a place before the border', () => {
    const seeds = [7, ...Array.from({ length: Number(process.env.ROBOT_SEEDS ?? 8) }, (_, k) => 1000 + k * 7919)];
    let coats = 0;
    let water = 0;
    let cans = 0;
    let near = 0;
    for (const seed of seeds) {
      const world = modcarWorld(seed, { worldVersion: 7 }).world;
      const regs = regionsAlong(world.spine.plan, 200_000);
      const places = planPlaces(world, 0, 200_000);
      const finds = lookAheadFinds(seed, regs, places);
      for (const f of finds) {
        if (f.entry === 'ahead:fuel') {
          cans++;
          continue;
        }
        const snow = f.entry === 'ahead:coat';
        if (snow) coats++;
        else water++;
        // the border it is for: the next of its sort after it
        const border = regs.find((r, i) => i > 0 && r.from > f.s && (snow ? r.snow && !regs[i - 1].snow : r.desert && !regs[i - 1].desert))!;
        expect(border, `seed ${seed}: ${f.entry} at ${(f.s / 1000).toFixed(1)} km`).toBeDefined();
        expect(border.from - f.s).toBeLessThanOrEqual(8000 + 1);
        if (border.from - f.s <= BEFORE_BORDER_M + 1) near++;
      }
      // (nothing of it in the first chapter: mild country)
      expect(finds.every((f) => f.s >= 12_000 - 3000 - 8000)).toBe(true);
    }
    console.info(`looking ahead over ${seeds.length} worlds, 200 km: ${coats} coats before the snow, ${water} bottles before the desert (${near} of the ${coats + water} within three kilometres of their border), ${cans} cans before a long way with no place`);
    expect(coats).toBeGreaterThan(0);
    expect(water).toBeGreaterThan(0);
    expect(near / (coats + water)).toBeGreaterThan(0.8);
  }, 600_000);
});

describe('F6: the places of a world of version 7 keep food cold', () => {
  const sitesOf = (seed: number, version: 6 | 7, toM = 120_000): Site[] => {
    const out: Site[] = [];
    modcarWorld(seed, { worldVersion: version }).world.sites.between(0, toM, out);
    return out;
  };

  it('a house has its refrigerator, a camp its cool box, a filling station\'s ice box is one; a world made before has none', () => {
    const count = { house: 0, houseFridge: 0, camp: 0, campBox: 0, station: 0, stationFridge: 0, prefabFridge: 0, looseFridge: 0 };
    for (const seed of [7, 1000, 8919, 16838, 24757]) {
      for (const s of sitesOf(seed, 7)) {
        const fridge = s.containers.some((c) => c.kind === 'fridge');
        if (s.prefab) {
          if (fridge) count.prefabFridge++;
          count.looseFridge += s.loose.filter((l) => l.item === 'nd_fridge').length;
        } else if (s.kind === 'house') {
          count.house++;
          if (fridge) count.houseFridge++;
        } else if (s.kind === 'camp') {
          count.camp++;
          if (s.containers.some((c) => c.kind === 'coolbox')) count.campBox++;
        } else if (s.kind === 'station') {
          count.station++;
          if (fridge) count.stationFridge++;
        }
        // (a refrigerator is a thing that stands there: the ice box it is drawn as)
        for (const c of s.containers) if (c.kind === 'fridge') expect(s.objects[c.obj]?.kind).toBe('icebox');
      }
      for (const s of sitesOf(seed, 6)) expect(s.containers.some((c) => c.kind === 'fridge' || c.kind === 'coolbox')).toBe(false);
    }
    console.info(`the places of five worlds of version 7, 120 km: ${JSON.stringify(count)}`);
    expect(count.houseFridge / count.house).toBeGreaterThan(0.55);
    expect(count.houseFridge / count.house).toBeLessThan(0.95);
    expect(count.campBox).toBeGreaterThan(0);
    expect(count.stationFridge).toBe(count.station);
    // (a prefab building's own refrigerator is the place's box, not a thing to carry off)
    expect(count.prefabFridge).toBeGreaterThan(0);
    expect(count.looseFridge).toBe(0);
  }, 300_000);
});
