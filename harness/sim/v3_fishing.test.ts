/**
 * Fishing's rules (src/core/v3/fishing): the table of fish, who bites, and the fight. The catalogue is whole;
 * changing the bait or the hour changes what comes; a robot angler lands most fish on sound tackle in well
 * under two minutes and loses more the thinner the line and the bigger the fish.
 */
import { describe, expect, it } from 'vitest';
import { biteTable, biteWeight, castBite, DIETS, hookMax, meanWait, medalOf, rollKg, type Bite } from '../../src/core/v3/fishing/bite';
import { LANDED, maxPull, robotFight, SNAPPED, type FightTackle } from '../../src/core/v3/fishing/fight';
import { FISH, FISH_INDEX, fishKind, fishOf } from '../../src/core/v3/fishing/species';
import { BAITS, WATERS_TODAY, type Bait, type FishCond, type Rig, type WaterClass } from '../../src/core/v3/fishing/types';

const rig = (bait: Bait, style: Rig['style'] = 'float', hook = 3, lineSeen = 0.4): Rig => ({ bait, style, hook, lineN: 60, lineSeen });
const cond = (hour: number, spot = 0.6, raining = false, ice = false): FishCond => ({ hour, raining, ice, spot });

describe('the ninety kinds of fish', () => {
  it('are ninety, as many in each water as the catalogue says, with ids and names of their own and weights in order', () => {
    expect(FISH.length).toBe(90);
    expect(new Set(FISH.map((k) => k.id)).size).toBe(90);
    const per: Record<string, number> = {};
    for (const k of FISH) {
      per[k.water + (k.ice ? '_ice' : '')] = (per[k.water + (k.ice ? '_ice' : '')] ?? 0) + 1;
      expect(k.id).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(k.name.zh.length).toBeGreaterThan(0);
      expect(k.name.en.length).toBeGreaterThan(0);
      expect(k.kg[0]).toBeLessThan(k.kg[1]);
      expect(k.kg[1]).toBeLessThan(k.kg[2]);
      expect(k.food).toBeGreaterThanOrEqual(10);
      expect(k.food).toBeLessThanOrEqual(14);
      expect(k.wary).toBeGreaterThanOrEqual(0);
      expect(k.wary).toBeLessThanOrEqual(1);
      expect(DIETS[k.diet]).toBeDefined();
      expect(FISH_INDEX[k.id]).toBe(FISH.indexOf(k));
    }
    expect(per).toEqual({ pond: 12, lake: 10, river: 10, tarn: 6, marsh: 7, oasis: 3, tarn_ice: 5, hotspring: 3, sea: 14, reef: 8, city: 5, surreal: 7 });
    expect(FISH.filter((k) => WATERS_TODAY.includes(k.water)).length).toBe(67);
    expect(() => fishKind('no_such_fish')).toThrow();
  });

  it('a legend in each of the big waters, larger than anything else there', () => {
    for (const [water, ice] of [['lake', false], ['river', false], ['tarn', false], ['marsh', false], ['tarn', true], ['reef', false]] as [WaterClass, boolean][]) {
      const kinds = fishOf(water, ice);
      const legend = kinds.filter((k) => k.rarity === 'legendary');
      expect(legend.length, water).toBe(1);
      for (const k of kinds) if (k !== legend[0]) expect(k.kg[1]).toBeLessThan(legend[0].kg[1]);
    }
  });

  it('every bait draws something in today\'s waters, and every kind of today\'s waters takes at least two baits', () => {
    for (const b of BAITS) {
      let draws = 0;
      for (const k of FISH) if (WATERS_TODAY.includes(k.water) && (DIETS[k.diet][b] ?? 0) > 0) draws++;
      expect(draws, b).toBeGreaterThan(2);
    }
    for (const k of FISH) expect(Object.keys(DIETS[k.diet]).length, k.id).toBeGreaterThanOrEqual(2);
  });
});

describe('who bites', () => {
  it('changing the bait changes the catch: dough brings carp, a minnow brings the hunters', () => {
    const share = (bait: Bait, style: Rig['style'], id: string): number => {
      const t = biteTable('pond', rig(bait, style), cond(18));
      return t.total > 0 ? t.w[t.kinds.findIndex((k) => k.id === id)] / t.total : 0;
    };
    expect(share('dough', 'bottom', 'carp')).toBeGreaterThan(0.25);
    expect(share('dough', 'bottom', 'largemouth_bass')).toBe(0);
    expect(share('minnow', 'lure', 'largemouth_bass')).toBeGreaterThan(0.3);
    expect(share('minnow', 'lure', 'carp')).toBe(0);
  });

  it('changing the hour changes the catch: catfish by night, bleak by day', () => {
    const w = (id: string, hour: number, bait: Bait, style: Rig['style']) => biteWeight(fishKind(id), rig(bait, style), cond(hour));
    expect(w('catfish', 23, 'worm', 'bottom')).toBeGreaterThan(4 * w('catfish', 12, 'worm', 'bottom'));
    expect(w('bleak', 12, 'worm', 'float')).toBeGreaterThan(4 * w('bleak', 23, 'worm', 'float'));
    // (a loach takes only the smallest hooks: on a size 3 it does not bite at all)
    expect(w('loach', 12, 'worm', 'bottom')).toBe(0);
    expect(biteWeight(fishKind('loach'), rig('worm', 'bottom', 1), cond(12))).toBeGreaterThan(0);
  });

  it('a wary fish wants a line it cannot see, a big hook catches no small fish, a legend keeps to the best spot', () => {
    const trout = fishKind('brown_trout');
    expect(biteWeight(trout, rig('fly', 'lure', 3, 0.1), cond(6))).toBeGreaterThan(2 * biteWeight(trout, rig('fly', 'lure', 3, 0.9), cond(6)));
    expect(hookMax(fishKind('bleak'))).toBeLessThanOrEqual(2);
    expect(hookMax(fishKind('wels'))).toBeGreaterThanOrEqual(6);
    expect(biteWeight(fishKind('bleak'), rig('worm', 'float', 6), cond(12))).toBe(0);
    expect(biteWeight(fishKind('wels'), rig('cut', 'bottom', 2), cond(23))).toBeGreaterThan(0);
    const king = fishKind('lake_king');
    expect(biteWeight(king, rig('minnow', 'bottom', 7, 0.1), cond(6, 0.8))).toBe(0);
    expect(biteWeight(king, rig('minnow', 'bottom', 7, 0.1), cond(6, 1))).toBeGreaterThan(0);
    // through the ice only the fish of the ice, and they not in open water
    expect(biteWeight(fishKind('smelt'), rig('worm', 'float', 1), cond(12, 0.6, false, false))).toBe(0);
    expect(biteWeight(fishKind('smelt'), rig('worm', 'float', 1), cond(12, 0.6, false, true))).toBeGreaterThan(0);
  });

  it('the wait: a rig that suits the water waits a quarter of a minute or so, one that suits nothing waits for ever', () => {
    const good = biteTable('pond', rig('worm', 'float', 2), cond(12, 0.7));
    expect(meanWait(good.total)).toBeGreaterThanOrEqual(8);
    expect(meanWait(good.total)).toBeLessThan(30);
    const poor = biteTable('pond', rig('squid', 'float', 8), cond(12, 0.2));
    expect(meanWait(poor.total)).toBe(Infinity);
    expect(meanWait(0.2)).toBeLessThanOrEqual(75);
  });

  it('casts into one water bring fish in an order of their own, the same for the same seed, mostly the common', () => {
    const out: Bite = { fish: -1, wait: 0, nibbles: 0, window: 0, kg: 0 };
    const seen = new Map<string, number>();
    const first: number[] = [];
    let waits = 0;
    for (let c = 0; c < 600; c++) {
      castBite(7, 3, c, 'pond', rig('worm', 'float', 2), cond(12, 0.7), out);
      expect(out.fish).toBeGreaterThanOrEqual(0);
      const k = FISH[out.fish];
      seen.set(k.id, (seen.get(k.id) ?? 0) + 1);
      expect(out.kg).toBeGreaterThanOrEqual(k.kg[0]);
      expect(out.kg).toBeLessThanOrEqual(k.kg[2]);
      expect(out.window).toBeGreaterThan(0.55);
      expect(out.nibbles).toBeGreaterThanOrEqual(1);
      waits += out.wait;
      if (c < 20) first.push(out.fish);
    }
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(waits / 600).toBeGreaterThan(6);
    expect(waits / 600).toBeLessThan(40);
    const again: number[] = [];
    for (let c = 0; c < 20; c++) again.push(castBite(7, 3, c, 'pond', rig('worm', 'float', 2), cond(12, 0.7), { fish: -1, wait: 0, nibbles: 0, window: 0, kg: 0 }).fish);
    expect(again).toEqual(first);
    const other: number[] = [];
    for (let c = 0; c < 20; c++) other.push(castBite(7, 4, c, 'pond', rig('worm', 'float', 2), cond(12, 0.7), { fish: -1, wait: 0, nibbles: 0, window: 0, kg: 0 }).fish);
    expect(other).not.toEqual(first);
  });

  it('weights gather about the usual, seldom reach a medal, and a better spot helps a little', () => {
    const k = fishKind('carp');
    let medals = 0;
    let sum = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const kg = rollKg(k, ((i * 7919) % 1000) / 1000, ((i * 104729) % 1000) / 1000, ((i * 1299709) % 1000) / 1000, 0.5);
      sum += kg;
      if (medalOf(k, kg) >= 1) medals++;
    }
    expect(sum / N).toBeGreaterThan(k.kg[1] * 0.8);
    expect(sum / N).toBeLessThan(k.kg[1] * 2.2);
    expect(medals / N).toBeLessThan(0.2);
    expect(medals).toBeGreaterThan(0);
    expect(rollKg(k, 0.5, 0.5, 0.5, 1)).toBeGreaterThan(rollKg(k, 0.5, 0.5, 0.5, 0));
    expect(medalOf(k, k.kg[2])).toBe(4);
  });
});

describe('the fight', () => {
  const robot = { react: 0.35, errs: 0.08, dragShare: 0.3 };
  const tackle = (lineN: number): FightTackle => ({ lineN, spool: 120, wind: 1.6 });
  const play = (kg: number, fight: 'steady' | 'runner' | 'diver' | 'jumper' | 'brute', lineN: number, n = 60) => {
    let landed = 0;
    let snapped = 0;
    let t = 0;
    for (let seed = 1; seed <= n; seed++) {
      const s = robotFight(kg, fight, tackle(lineN), seed * 977, robot);
      if (s.end === LANDED) {
        landed++;
        t += s.t;
      } else if (s.end === SNAPPED) snapped++;
    }
    return { landed: landed / n, snapped: snapped / n, secs: landed ? t / landed : 0 };
  };

  it('a kilo of trout pulls about twenty newtons, ten kilos of catfish well over a hundred', () => {
    expect(maxPull(1, 'runner')).toBeGreaterThan(15);
    expect(maxPull(1, 'runner')).toBeLessThan(30);
    expect(maxPull(10, 'brute')).toBeGreaterThan(100);
    expect(maxPull(10, 'brute')).toBeLessThan(180);
  });

  it('on sound tackle a robot lands most fish, a small one in seconds, a big one in a minute or two', () => {
    const small = play(0.3, 'steady', 40);
    expect(small.landed).toBeGreaterThan(0.9);
    expect(small.secs).toBeLessThan(25);
    const trout = play(1.2, 'runner', 60);
    expect(trout.landed).toBeGreaterThan(0.8);
    expect(trout.secs).toBeGreaterThan(8);
    expect(trout.secs).toBeLessThan(90);
    const big = play(12, 'brute', 300);
    expect(big.landed).toBeGreaterThan(0.6);
    expect(big.secs).toBeGreaterThan(30);
    expect(big.secs).toBeLessThan(200);
  });

  it('the thinner the line and the bigger the fish, the more are lost to a parted line', () => {
    const thick = play(6, 'runner', 200);
    const thin = play(6, 'runner', 45);
    expect(thin.snapped).toBeGreaterThan(thick.snapped);
    expect(thick.snapped).toBeLessThan(0.15);
    const bigger = play(20, 'runner', 45);
    expect(bigger.snapped).toBeGreaterThanOrEqual(thin.snapped);
    // a line far too thin for the fish parts nearly every time when the drag is set near its strength
    let parts = 0;
    for (let seed = 1; seed <= 40; seed++) if (robotFight(20, 'brute', tackle(30), seed, { react: 0.35, errs: 0.3, dragShare: 0.95 }).end === SNAPPED) parts++;
    expect(parts).toBeGreaterThan(25);
  });

  it('a clumsy hand loses more than a deft one, and the same fish played the same way ends the same', () => {
    let deft = 0;
    let clumsy = 0;
    for (let seed = 1; seed <= 80; seed++) {
      if (robotFight(2.5, 'jumper', tackle(60), seed, { react: 0.2, errs: 0.02, dragShare: 0.3 }).end === LANDED) deft++;
      if (robotFight(2.5, 'jumper', tackle(60), seed, { react: 0.9, errs: 0.5, dragShare: 0.3 }).end === LANDED) clumsy++;
    }
    expect(deft).toBeGreaterThan(clumsy);
    const a = robotFight(3, 'diver', tackle(80), 42, robot);
    const b = robotFight(3, 'diver', tackle(80), 42, robot);
    expect(b).toEqual(a);
  });
});
