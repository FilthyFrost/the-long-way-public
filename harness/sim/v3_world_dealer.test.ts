/**
 * The dealer and the director of the second world version (src/core/world/dealer.ts, director.ts): the rules
 * of the journey's pacing hold for every seed, the shares by intensity come out as aimed at, every kind of
 * country is met on a long drive, and a region's quiet run and landform stretches lie where they may.
 */
import { describe, expect, it } from 'vitest';
import { contrast, dealProblems, dealRegion, HIGHLIGHT_GAP, type Intensity, type RegionCard } from '../../src/core/world/dealer';
import { featureSlots, isQuiet, quietStart, type RegionRun } from '../../src/core/world/director';

function card(index: number, id: string, intensity: Intensity, palette: string, land: string, flora: string, climate: RegionCard['climate'], o: Partial<RegionCard> = {}): RegionCard {
  return { index, id, intensity, palette, land, flora, climate, sea: false, surreal: false, weight: 1, ...o };
}

/** the six regions of today and the six of the first new batch, as the registry will hold them */
const TWELVE: RegionCard[] = [
  card(0, 'plains', 'calm', 'green', 'rolling', 'meadow', 'temperate'),
  card(1, 'desert', 'calm', 'sand', 'mesa', 'scrub', 'dry'),
  card(2, 'alpine', 'scenic', 'snow', 'mountain', 'conifer', 'cold'),
  card(3, 'forest', 'calm', 'deepgreen', 'valley', 'broadleaf', 'temperate'),
  card(4, 'lakes', 'calm', 'green', 'lakeland', 'meadow', 'temperate', { sea: true }),
  card(5, 'maple', 'calm', 'autumn', 'hills', 'maple', 'temperate'),
  card(6, 'flower_fields', 'calm', 'bloom', 'rolling', 'flowers', 'temperate'),
  card(7, 'terraces', 'calm', 'paddy', 'terraced', 'crops', 'warm'),
  card(8, 'wetland', 'calm', 'marsh', 'flat', 'reeds', 'temperate'),
  card(9, 'bamboo_sea', 'scenic', 'bamboo', 'valley', 'bamboo', 'warm'),
  card(10, 'red_canyon', 'scenic', 'redrock', 'canyon', 'scrub', 'dry'),
  card(11, 'karst_peaks', 'scenic', 'jade', 'towers', 'subtropical', 'warm'),
];

/** the same with what later nodes add: highlights, a surreal pair, a second region by the sea */
const FULL: RegionCard[] = [
  ...TWELVE,
  card(12, 'alpine_meadow', 'highlight', 'ice', 'pass', 'alpine', 'cold'),
  card(13, 'giant_mushrooms', 'highlight', 'glow', 'grove', 'fungi', 'temperate', { surreal: true }),
  card(14, 'crystal_waste', 'highlight', 'prism', 'shards', 'bare', 'dry', { surreal: true }),
  card(15, 'sea_cliffs', 'scenic', 'chalk', 'cliffs', 'heath', 'temperate', { sea: true }),
];

function journey(seed: number, cards: readonly RegionCard[], n: number, first = 0): { dealt: number[]; slots: number[] } {
  const dealt = [first];
  const slots = [7];
  for (let c = 1; c < n; c++) {
    const d = dealRegion(seed, c, cards, dealt);
    dealt.push(d.region);
    slots.push(d.slots);
  }
  return { dealt, slots };
}

describe('the dealer (world version 2)', () => {
  it('breaks no rule in 60 regions of 300 seeds, with the first batch and with the full set', () => {
    for (const cards of [TWELVE, FULL]) {
      for (let seed = 1; seed <= 300; seed++) {
        const { dealt } = journey(seed * 7919 + 13, cards, 60);
        expect(dealProblems(cards, dealt), `seed ${seed}`).toEqual([]);
      }
    }
  });

  it('is the same for the same seed, and a chapter does not depend on anything but what came before it', () => {
    const a = journey(20261119, FULL, 40);
    const b = journey(20261119, FULL, 40);
    expect(a).toEqual(b);
    // dealt one at a time from the same past: the same region
    for (let c = 1; c < 40; c++) expect(dealRegion(20261119, c, FULL, a.dealt.slice(0, c)).region).toBe(a.dealt[c]);
    expect(journey(20261120, FULL, 40).dealt).not.toEqual(a.dealt);
  });

  it('keeps the shares aimed at: mostly calm, a third scenic, a highlight about one in ten', () => {
    const count: Record<Intensity, number> = { calm: 0, scenic: 0, highlight: 0 };
    let total = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const { dealt } = journey(seed * 104729 + 7, FULL, 60);
      for (const i of dealt) {
        count[FULL[i].intensity]++;
        total++;
      }
    }
    const share = { calm: count.calm / total, scenic: count.scenic / total, highlight: count.highlight / total };
    expect(share.calm).toBeGreaterThan(0.52);
    expect(share.calm).toBeLessThan(0.68);
    expect(share.scenic).toBeGreaterThan(0.24);
    expect(share.scenic).toBeLessThan(0.38);
    expect(share.highlight).toBeGreaterThan(0.05);
    expect(share.highlight).toBeLessThan(0.13);
  });

  it('without any highlight region the journey is calm and scenic, about two to one', () => {
    let calm = 0;
    let total = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const { dealt } = journey(seed * 31 + 5, TWELVE, 60);
      for (const i of dealt) {
        if (TWELVE[i].intensity === 'calm') calm++;
        total++;
      }
    }
    expect(calm / total).toBeGreaterThan(0.58);
    expect(calm / total).toBeLessThan(0.72);
  });

  it('meets every calm and scenic kind of country on a long drive, a first highlight within the first hours, and none far more often than its fellows', () => {
    const seen = new Array<number>(FULL.length).fill(0);
    let missed = 0;
    const firstHigh: number[] = [];
    for (let seed = 1; seed <= 200; seed++) {
      const { dealt } = journey(seed * 613 + 1, FULL, 60);
      const here = new Set(dealt);
      // (sixty regions hold about six highlights: not every kind of highlight can be among them)
      if (FULL.some((k) => k.intensity !== 'highlight' && !here.has(k.index))) missed++;
      for (const i of dealt) seen[i]++;
      const at = dealt.findIndex((i) => FULL[i].intensity === 'highlight');
      firstHigh.push(at < 0 ? 99 : at);
    }
    expect(missed).toBeLessThan(3);
    firstHigh.sort((a, b) => a - b);
    // the first highlight: after the gentle beginning, for half the seeds within the first eleven regions, for nearly all within twenty
    expect(firstHigh[0]).toBeGreaterThanOrEqual(3);
    expect(firstHigh[100]).toBeLessThanOrEqual(11);
    expect(firstHigh[189]).toBeLessThanOrEqual(20);
    for (const cls of ['calm', 'scenic', 'highlight'] as const) {
      const n = FULL.filter((k) => k.intensity === cls).map((k) => seen[k.index]);
      expect(Math.max(...n) / Math.min(...n), cls).toBeLessThan(1.6);
    }
  });

  it('gives neighbours that look different, and seldom the desert next to the snow', () => {
    let alike = 0;
    let jolt = 0;
    let pairs = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const { dealt } = journey(seed * 257 + 3, FULL, 60);
      for (let c = 1; c < dealt.length; c++) {
        const a = FULL[dealt[c - 1]];
        const b = FULL[dealt[c]];
        pairs++;
        if (contrast(a, b) < 2) alike++;
        if ((a.climate === 'dry' && b.climate === 'cold') || (a.climate === 'cold' && b.climate === 'dry')) jolt++;
      }
    }
    expect(alike / pairs).toBeLessThan(0.03);
    expect(jolt / pairs).toBeLessThan(0.02);
  });

  it('lengths: six to eight stretches, a highlight six', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { dealt, slots } = journey(seed, FULL, 60);
      for (let c = 1; c < dealt.length; c++) {
        expect(slots[c]).toBeGreaterThanOrEqual(6);
        expect(slots[c]).toBeLessThanOrEqual(8);
        if (FULL[dealt[c]].intensity === 'highlight') expect(slots[c]).toBe(6);
      }
    }
  });

  it('a world that knows only its first six regions deals only those, whatever is registered after', () => {
    const six = FULL.slice(0, 6);
    for (let seed = 1; seed <= 40; seed++) {
      const { dealt } = journey(seed, six, 40);
      for (const i of dealt) expect(i).toBeLessThan(6);
    }
  });

  it('a world of one region or of calm regions only still gets a region every time', () => {
    const one = [TWELVE[0]];
    expect(journey(5, one, 10).dealt).toEqual(new Array(10).fill(0));
    const calm = TWELVE.filter((k) => k.intensity === 'calm');
    const j = journey(9, calm, 30).dealt;
    for (let c = 1; c < j.length; c++) expect(j[c]).not.toBe(j[c - 1]);
    expect(HIGHLIGHT_GAP).toBeGreaterThan(0);
  });
});

describe('the director (world version 2)', () => {
  const runs: RegionRun[] = [];
  for (let n = 6; n <= 8; n++) for (let c = 1; c < 40; c++) runs.push({ chapter: c, k0: c * 10, k1: c * 10 + n, features: c % 4 });

  it('gives every region after the first one quiet run of two stretches, clear of its ends', () => {
    for (let seed = 1; seed <= 50; seed++) {
      for (const r of runs) {
        const q = quietStart(seed, r);
        expect(q).toBeGreaterThanOrEqual(r.k0 + 1);
        expect(q + 1).toBeLessThanOrEqual(r.k1 - 2);
        let n = 0;
        for (let k = r.k0; k < r.k1; k++) if (isQuiet(seed, r, k)) n++;
        expect(n).toBe(2);
      }
      expect(quietStart(seed, { chapter: 0, k0: 0, k1: 7, features: 0 })).toBe(-1);
    }
  });

  it('puts the quiet run in every place it may be, over many regions', () => {
    const at = new Set<number>();
    for (let c = 1; c < 400; c++) at.add(quietStart(77, { chapter: c, k0: 0, k1: 8, features: 0 }));
    expect([...at].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('puts the landform stretches clear of the quiet run and of the first stretch, as many as asked, apart when there is room', () => {
    for (let seed = 1; seed <= 50; seed++) {
      for (const r of runs) {
        const f = featureSlots(seed, r);
        expect(f.length).toBe(r.features);
        for (const k of f) {
          expect(k).toBeGreaterThan(r.k0);
          expect(k).toBeLessThan(r.k1);
          expect(isQuiet(seed, r, k)).toBe(false);
        }
        expect(new Set(f).size).toBe(f.length);
        if (r.features === 2 && r.k1 - r.k0 >= 7) expect(f[1] - f[0]).toBeGreaterThan(1);
        expect(featureSlots(seed, r)).toEqual(f);
      }
    }
  });
});
