/**
 * F6 (docs/V3/plan/finish.md §二 4–5): the robot traveller down three hundred kilometres of worlds of version 7, and
 * the plan's guarantees held to it —
 *   - never more than eight kilometres without petrol to be had (a can, a pump, a wreck's tank), but where the road has
 *     no place at all for longer: there a can stands at the last place before;
 *   - what there is to eat at least twice what one eats, to drink 1.8 times what one drinks, band by band of fifty
 *     kilometres; of what there is to eat, less and less ready to eat;
 *   - every set whole within fifteen kilometres of its main thing (the steps of its own chapter);
 *   - each chapter's new things within its kilometres;
 *   - no flood of new things: so many at most in any twenty minutes of play.
 * ROBOT_SEEDS=200 for the full count (the default: 6, to keep the suite quick).
 */
import { describe, expect, it } from 'vitest';
import '../../src/core/v3/nd/cards';
import.meta.glob('../../src/game/modcar/v3/*/index.ts', { eager: true });
import { KITS } from '../../src/core/modcar/kits';
import { SCHEDULE_V7 } from '../../src/core/modcar/schedule';
import { BIG_ONLY, CHAPTER_KM, EVERY, live7, PACE_KMH, PER_KM, travel7, type Journey7 } from './f6_journey';

const SEEDS = Array.from({ length: Number(process.env.ROBOT_SEEDS ?? 6) }, (_, k) => 1000 + k * 7919);
const KM = 300;
const BAND = 50;

const med = (a: number[]): number => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const low = (a: number[], q = 0.05): number => [...a].sort((x, y) => x - y)[Math.floor(a.length * q)];
const max = (a: number[]): number => a.reduce((x, y) => Math.max(x, y), -Infinity);
const f1 = (x: number): string => (Number.isFinite(x) ? x.toFixed(1) : '—');

// (the traveller who stops at every place, as the game plays — the places looking at what it is short of — and with
    // the places giving evenly: what the world offers, whoever comes)
let every: Journey7[] | null = null;
let even: Journey7[] | null = null;
const journeys = (): Journey7[] => (every ??= SEEDS.map((seed) => travel7(seed, KM, EVERY)));
const evenly = (): Journey7[] => (even ??= SEEDS.map((seed) => travel7(seed, KM, EVERY, false)));

describe('F6: the robot traveller down 300 km of worlds of version 7', () => {
  it('each chapter\'s new things within its kilometres, at the pace the plan sets', () => {
    const js = journeys();
    const rows: string[] = [];
    for (const e of SCHEDULE_V7) {
      if (e.chapter === undefined) continue;
      const at = js.map((j) => j.firsts.get(e.id) ?? Infinity);
      rows.push(`${e.id} ${f1(med(at))} (${f1(Math.min(...at))}–${f1(max(at))})`);
      for (const [i, km] of at.entries()) {
        expect(km, `seed ${SEEDS[i]}: ${e.id}`).toBeGreaterThanOrEqual(CHAPTER_KM[e.chapter]);
        expect(km, `seed ${SEEDS[i]}: ${e.id}`).toBeLessThanOrEqual(CHAPTER_KM[e.chapter + 1]);
      }
    }
    // how many new things (the plan's, a set's steps) in any twenty minutes of play
    const window = (PACE_KMH * 20) / 60;
    const most = js.map((j) => {
      // (a set's main thing is the plan's new thing itself: counted once)
      const at = j.news.filter((n) => !/^kit:[a-z]+:0$/.test(n.what)).map((n) => n.km).sort((a, b) => a - b);
      let m = 0;
      for (let i = 0, k = 0; i < at.length; i++) {
        while (at[i] - at[k] > window) k++;
        m = Math.max(m, i - k + 1);
      }
      return m;
    });
    console.info([`robot traveller over ${SEEDS.length} seeds, ${KM} km — where each chapter's new thing is first found (km: the median world, the earliest–the latest):`, `  ${rows.join(' · ')}`, `  new things in any twenty minutes of play (${window.toFixed(2)} km): ${med(most)} in the median world, ${max(most)} at most`].join('\n'));
    expect(max(most)).toBeLessThanOrEqual(5);
  }, 1_800_000);

  it('every set whole within fifteen kilometres of its main thing', () => {
    const js = journeys();
    const rows: string[] = [];
    const checks: (() => void)[] = [];
    for (const kit of KITS) {
      // (the steps of its own chapter: one that waits for a later kilometre comes when that comes)
      const core = kit.steps.map((s, i) => ({ s, i })).filter((x) => x.s.fromKm === undefined);
      const whole = js.map((j) => {
        const r = j.kits[kit.id];
        return max(core.map((x) => r.steps[x.i])) - r.main;
      });
      const main = js.map((j) => j.kits[kit.id].main);
      rows.push(`${kit.name.zh}: 主件 ${f1(med(main))} km，凑齐用了 ${f1(med(whole))} km（最多 ${f1(max(whole))}）`);
      checks.push(() => {
        for (const [i, d] of whole.entries()) {
          expect(Number.isFinite(d), `seed ${SEEDS[i]}: ${kit.id} is whole by ${KM} km (its main thing at ${f1(main[i])} km)`).toBe(true);
          expect(d, `seed ${SEEDS[i]}: ${kit.id}`).toBeLessThanOrEqual(15);
        }
      });
    }
    console.info([`the sets, over ${SEEDS.length} seeds:`, ...rows.map((r) => `  ${r}`)].join('\n'));
    for (const check of checks) check();
  }, 1_800_000);

  it('enough to eat, to drink and to burn all the way: band by band, and for one who lives off it', () => {
    // (what the world offers: the places giving evenly)
    const js = evenly();
    const bands = Array.from({ length: KM / BAND }, (_, b) => b);
    const ratio = (j: Journey7, b: number, key: 'food' | 'water' | 'petrol'): number => {
      const xs = j.stops.filter((x) => x.s >= b * BAND * 1000 && x.s < (b + 1) * BAND * 1000);
      const got = xs.reduce((a, x) => a + (key === 'food' ? x.ready + x.raw : key === 'water' ? x.water : x.petrol), 0);
      return got / (PER_KM[key] * BAND);
    };
    const readyShare = (j: Journey7, b: number): number => {
      const xs = j.stops.filter((x) => x.s >= b * BAND * 1000 && x.s < (b + 1) * BAND * 1000);
      const ready = xs.reduce((a, x) => a + x.ready, 0);
      const raw = xs.reduce((a, x) => a + x.raw, 0);
      return ready / Math.max(1e-9, ready + raw);
    };
    const junk = (j: Journey7, key: 'scrap' | 'components'): number => j.stops.reduce((a, x) => a + x[key], 0) / (KM / 10);
    const lines: string[] = [];
    for (const b of bands) {
      const food = js.map((j) => ratio(j, b, 'food'));
      const water = js.map((j) => ratio(j, b, 'water'));
      const petrol = js.map((j) => ratio(j, b, 'petrol'));
      const share = js.map((j) => readyShare(j, b));
      lines.push(`  ${b * BAND}–${(b + 1) * BAND} km: food ${med(food).toFixed(2)}× (worst in twenty ${low(food).toFixed(2)}×), ${(med(share) * 100).toFixed(0)} % of it ready to eat; water ${med(water).toFixed(2)}× (${low(water).toFixed(2)}×); petrol to carry ${med(petrol).toFixed(2)}× (${low(petrol).toFixed(2)}×)`);
    }
    // the longest way without petrol to be had; and the longest that has no can before it
    const gaps = js.map((j) => {
      let prev = 0;
      let longest = 0;
      let uncovered = 0;
      for (const s of j.petrolAt) {
        const gap = s - prev;
        longest = Math.max(longest, gap);
        // (a can put at the last place before a long way with none: lookahead.ts — picked up within the last three
        // kilometres before the way begins, the way is covered)
        if (!j.cansBefore.some((c) => c >= prev - 3000 && c <= prev + 1) || gap > 14_000) uncovered = Math.max(uncovered, gap);
        prev = s;
      }
      return { longest: longest / 1000, uncovered: uncovered / 1000 };
    });
    // (as the game plays: the places look at what one is short of)
    const played = journeys();
    const lives = played.map((j) => live7(j));
    const bigJ = SEEDS.map((seed) => travel7(seed, KM, BIG_ONLY));
    const big = bigJ.map((j) => live7(j));
    const bigEven = SEEDS.map((seed) => live7(travel7(seed, KM, BIG_ONLY, false)));
    const livesEven = js.map((j) => live7(j));
    const rescues = (list: Journey7[]): string => {
      const sum: Record<string, number> = {};
      for (const j of list) for (const [k, n] of Object.entries(j.rescues)) sum[k] = (sum[k] ?? 0) + n;
      return Object.keys(sum).length ? Object.entries(sum).map(([k, n]) => `${k.slice(5)} ${n}`).join(', ') : 'none';
    };
    const out = (list: ReturnType<typeof live7>[], key: 'starved' | 'parched' | 'dry'): string => `${list.filter((x) => x[key] < Infinity).length}/${list.length}${list.some((x) => x[key] < Infinity) ? ` (the soonest at ${Math.min(...list.map((x) => x[key])).toFixed(0)} km)` : ''}`;
    console.info(
      [
        `robot traveller over ${SEEDS.length} seeds, ${KM} km at ${PACE_KMH} km/h of play — what there is against what one uses:`,
        ...lines,
        `  petrol: at most ${max(gaps.map((g) => g.longest)).toFixed(1)} km without any to be had (the median world ${med(gaps.map((g) => g.longest)).toFixed(1)}); without a can put before it ${max(gaps.map((g) => g.uncovered)).toFixed(1)} km at most`,
        `  junk to recycle: ${med(js.map((j) => junk(j, 'scrap'))).toFixed(0)} scrap and ${med(js.map((j) => junk(j, 'components'))).toFixed(1)} components every 10 km (the median world); ${med(js.map((j) => j.sheets))} blueprints' places`,
        `  one who stops at every place ran out of food in ${out(lives, 'starved')} worlds, of water in ${out(lives, 'parched')}, of petrol in ${out(lives, 'dry')}; the least left in the pack after 10 km: ${med(lives.map((x) => x.packFood)).toFixed(0)} food points, ${med(lives.map((x) => x.packWater)).toFixed(0)} thirst points in the median world (the worst ${Math.min(...lives.map((x) => x.packFood)).toFixed(0)}, ${Math.min(...lives.map((x) => x.packWater)).toFixed(0)})`,
        `  one who stops only at the big places: food ${out(big, 'starved')}, water ${out(big, 'parched')}, petrol ${out(big, 'dry')}; the least in the pack ${med(big.map((x) => x.packFood)).toFixed(0)} food, ${med(big.map((x) => x.packWater)).toFixed(0)} thirst points (the worst ${Math.min(...big.map((x) => x.packFood)).toFixed(0)}, ${Math.min(...big.map((x) => x.packWater)).toFixed(0)})`,
        `  with the places giving evenly (no look at what one is short of): every place ${med(livesEven.map((x) => x.packFood)).toFixed(0)} food, ${med(livesEven.map((x) => x.packWater)).toFixed(0)} thirst points at the least (the worst ${Math.min(...livesEven.map((x) => x.packFood)).toFixed(0)}, ${Math.min(...livesEven.map((x) => x.packWater)).toFixed(0)}); the big places only ${med(bigEven.map((x) => x.packFood)).toFixed(0)}, ${med(bigEven.map((x) => x.packWater)).toFixed(0)} (the worst ${Math.min(...bigEven.map((x) => x.packFood)).toFixed(0)}, ${Math.min(...bigEven.map((x) => x.packWater)).toFixed(0)}), out of food in ${out(bigEven, 'starved')}, of water in ${out(bigEven, 'parched')}, of petrol in ${out(bigEven, 'dry')}`,
        `  asked for at the next place because all but out: every place — ${rescues(played)}; the big places only — ${rescues(bigJ)}`,
      ].join('\n'),
    );
    // (one who has plenty is given less — that is the rule — and carries less for it; what it is all but out of is at
    // the next place: seldom asked for, and nobody runs dry)
    const asked = (list: Journey7[]): number => list.reduce((a, j) => a + Object.values(j.rescues).reduce((x, y) => x + y, 0), 0) / list.length;
    expect(asked(played)).toBeLessThanOrEqual(0.5);
    expect(asked(bigJ)).toBeLessThanOrEqual(2);
    void bigEven;
    for (const b of bands) {
      expect(med(js.map((j) => ratio(j, b, 'food'))), `food, ${b * BAND}–${(b + 1) * BAND} km`).toBeGreaterThanOrEqual(2);
      expect(med(js.map((j) => ratio(j, b, 'water'))), `water, ${b * BAND}–${(b + 1) * BAND} km`).toBeGreaterThanOrEqual(1.8);
    }
    // (what is ready to eat: all of it at first, less and less after — the kitchen takes over)
    expect(med(js.map((j) => readyShare(j, 0)))).toBeGreaterThan(0.75);
    expect(med(js.map((j) => readyShare(j, 3)))).toBeLessThan(0.55);
    expect(max(gaps.map((g) => g.uncovered))).toBeLessThanOrEqual(8);
    const share = (list: ReturnType<typeof live7>[], key: 'starved' | 'parched' | 'dry'): number => list.filter((x) => x[key] < Infinity).length / list.length;
    expect(share(lives, 'starved') + share(lives, 'parched') + share(lives, 'dry')).toBe(0);
    expect(share(big, 'dry')).toBe(0);
    expect(share(big, 'starved')).toBeLessThan(0.2);
    expect(share(big, 'parched')).toBeLessThan(0.2);
  }, 3_600_000);
});
