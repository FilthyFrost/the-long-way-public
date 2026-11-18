/**
 * The rules of a pick (src/core/v3/forage/rules.ts): when a point shows, how much it gives, when it bears
 * again, and the tide.
 */
import { describe, expect, it } from 'vitest';
import { forageKind } from '../../src/core/v3/forage/kinds';
import { doubleChance, forageShows, nextLowTide, NO_BONUS, PICK_XP, pickResult, regrown, tideAt, TIDE_S, type PickResult } from '../../src/core/v3/forage/rules';
import { LOW_TIDE } from '../../src/core/v3/forage/types';

const cond = (hour: number, sinceRainH = 99, tide = 1) => ({ hour, sinceRainH, tide });

describe('the tide', () => {
  it('swings smoothly between −1 and 1 twice in a little over a day, and is low for a good part of each swing', () => {
    let lo = 1;
    let hi = -1;
    let low = 0;
    let n = 0;
    let prev = tideAt(0);
    for (let t = 60; t <= TIDE_S * 4; t += 60) {
      const v = tideAt(t);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
      expect(Math.abs(v - prev)).toBeLessThan(0.02);
      prev = v;
      if (v <= LOW_TIDE) low++;
      n++;
    }
    expect(lo).toBeCloseTo(-1, 3);
    expect(hi).toBeCloseTo(1, 3);
    // low water lasts three to five hours of each tide
    expect((low / n) * 12.4).toBeGreaterThan(3);
    expect((low / n) * 12.4).toBeLessThan(5);
    expect(nextLowTide(0)).toBe(0);
    expect(nextLowTide(TIDE_S / 2)).toBeGreaterThan(0);
    expect(nextLowTide(TIDE_S / 2)).toBeLessThan(TIDE_S);
  });
});

describe('when a point shows', () => {
  it('always, for a kind with no conditions', () => {
    expect(forageShows(forageKind('wild_berry'), false, cond(3))).toBe(true);
  });
  it('the after-rain half of a mushroom only for twelve hours after rain; the other half always', () => {
    const k = forageKind('porcini');
    expect(forageShows(k, false, cond(12, 99))).toBe(true);
    expect(forageShows(k, true, cond(12, 99))).toBe(false);
    expect(forageShows(k, true, cond(12, 3))).toBe(true);
    expect(forageShows(k, true, cond(12, 12.5))).toBe(false);
  });
  it('at dawn only, by night only (through midnight), at low tide only', () => {
    expect(forageShows(forageKind('bamboo_fungus'), false, cond(6))).toBe(true);
    expect(forageShows(forageKind('bamboo_fungus'), false, cond(12))).toBe(false);
    expect(forageShows(forageKind('glow_mushroom'), false, cond(23))).toBe(true);
    expect(forageShows(forageKind('glow_mushroom'), false, cond(2))).toBe(true);
    expect(forageShows(forageKind('glow_mushroom'), false, cond(12))).toBe(false);
    expect(forageShows(forageKind('clam'), false, cond(12, 99, -0.8))).toBe(true);
    expect(forageShows(forageKind('clam'), false, cond(12, 99, 0.2))).toBe(false);
  });
});

describe('a pick', () => {
  const out: PickResult = { n: 0, q: 0, xp: 0 };
  it('gives within the plant\'s range, the same however often it is asked on the same day, and not the same every day', () => {
    const k = forageKind('wild_berry');
    const seen = new Set<number>();
    for (let key = 1; key < 400; key++) {
      const a = pickResult(k, 7, key, 3, (key % 97) / 97, NO_BONUS, out).n;
      expect(a).toBeGreaterThanOrEqual(k.yield[0]);
      expect(a).toBeLessThanOrEqual(k.yield[1]);
      expect(pickResult(k, 7, key, 3, (key % 97) / 97, NO_BONUS, out).n).toBe(a);
      seen.add(a);
    }
    expect(seen.size).toBe(k.yield[1] - k.yield[0] + 1);
    let differs = 0;
    for (let key = 1; key < 200; key++) if (pickResult(k, 7, key, 3, 0.5, NO_BONUS, out).n !== pickResult(k, 7, key, 9, 0.5, NO_BONUS, { n: 0, q: 0, xp: 0 }).n) differs++;
    expect(differs).toBeGreaterThan(20);
  });

  it('tools are bonuses: the trowel one more of a root, the sickle twice the reeds, the knife a star on a mushroom, and none of them on other things', () => {
    const base = (id: string) => ({ ...pickResult(forageKind(id), 1, 42, 1, 0.5, NO_BONUS, { n: 0, q: 0, xp: 0 }) });
    const with_ = (id: string, b: Partial<typeof NO_BONUS>) => ({ ...pickResult(forageKind(id), 1, 42, 1, 0.5, { ...NO_BONUS, ...b }, { n: 0, q: 0, xp: 0 }) });
    expect(with_('burdock', { trowel: true }).n).toBe(base('burdock').n + 1);
    expect(with_('reed', { sickle: true }).n).toBe(base('reed').n * 2);
    expect(with_('porcini', { knife: true }).q).toBe(3);
    expect(base('porcini').q).toBe(2);
    expect(with_('wild_berry', { knife: true, trowel: true, sickle: true })).toEqual(base('wild_berry'));
  });

  it('the perks: about a quarter of picks doubled, about a fifth a star better, quality never above four', () => {
    const k = forageKind('porcini');
    let doubled = 0;
    let starred = 0;
    const N = 4000;
    for (let key = 1; key <= N; key++) {
      const plain = pickResult(k, 3, key, 2, 0.4, NO_BONUS, { n: 0, q: 0, xp: 0 }).n;
      const r = pickResult(k, 3, key, 2, 0.4, { ...NO_BONUS, knife: true, level: 10, double: true, star: true }, out);
      if (r.n === plain * 2) doubled++;
      if (r.q === 4) starred++;
      expect(r.q).toBeLessThanOrEqual(4);
    }
    expect(doubled / N).toBeGreaterThan(0.2);
    expect(doubled / N).toBeLessThan(0.3);
    expect(starred / N).toBeGreaterThan(0.15);
    expect(starred / N).toBeLessThan(0.25);
    expect(doubleChance(20)).toBeCloseTo(0.35, 6);
  });

  it('is worth more proficiency the rarer the kind, and a plant bears again after its days', () => {
    expect(pickResult(forageKind('truffle'), 1, 1, 1, 0.5, NO_BONUS, out).xp).toBe(PICK_XP.legendary);
    expect(pickResult(forageKind('wild_berry'), 1, 1, 1, 0.5, NO_BONUS, out).xp).toBe(PICK_XP.common);
    const k = forageKind('wild_berry');
    expect(regrown(k, 5, 5 + k.regrowDays - 1)).toBe(false);
    expect(regrown(k, 5, 5 + k.regrowDays)).toBe(true);
  });
});
