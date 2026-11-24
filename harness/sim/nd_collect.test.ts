import { describe, expect, it } from 'vitest';
import { bobbleDeck, BOBBLES, Wobble, WOBBLE, type Axes } from '../../src/core/v3/nd/bobble';
import { GRADES, oneIn, patternOf, PLATE, plateSayS, plateText, REGIONS, rollPlate, tierOf, TIERS } from '../../src/core/v3/nd/plates';
import { clock, DECK, deckFalloff, nextOf, tapeDeck, tapeOf, TAPES, volumeStep } from '../../src/core/v3/nd/tapes';

const LEVEL: Axes = { fx: 1, fy: 0, fz: 0, ux: 0, uy: 1, uz: 0, rx: 0, ry: 0, rz: 1 };

describe('ND bobbleheads (core/v3/nd/bobble.ts)', () => {
  it('pulling away nods the head back, it swings and settles, never past 28°', () => {
    const w = new Wobble();
    let x = 0;
    let v = 0;
    let least = 0;
    let most = 0;
    // standing still, then 3 m/s² forward for a second, then cruising
    for (let i = 0; i < 360; i++) {
      const dt = 1 / 60;
      if (i >= 30 && i < 90) v += 3 * dt;
      x += v * dt;
      w.step(dt, x, 0, 0, LEVEL);
      least = Math.min(least, w.nod);
      most = Math.max(most, w.nod);
      expect(Math.abs(w.nod)).toBeLessThanOrEqual(WOBBLE.maxDeg + 1e-9);
      expect(Math.abs(w.roll)).toBeLessThanOrEqual(WOBBLE.maxDeg + 1e-9);
    }
    // (back while it is pushed, over the other way as it lets go)
    expect(least).toBeLessThan(-3);
    expect(most).toBeGreaterThan(0.5);
  });

  it('a push sideways leans it; in the hands it nods less; a jump sets it back', () => {
    const run = (held: boolean): number => {
      const w = new Wobble();
      let z = 0;
      let vz = 0;
      let peak = 0;
      for (let i = 0; i < 120; i++) {
        const dt = 1 / 60;
        if (i >= 10 && i < 40) vz += 2 * dt;
        z += vz * dt;
        w.step(dt, 0, 0, z, LEVEL, held);
        peak = Math.max(peak, Math.abs(w.roll));
      }
      return peak;
    };
    const free = run(false);
    expect(free).toBeGreaterThan(2);
    expect(run(true)).toBeLessThan(free);
    const w = new Wobble();
    w.step(1 / 60, 0, 0, 0, LEVEL);
    w.nod = 10;
    w.step(1 / 60, 50, 0, 0, LEVEL);
    expect(Math.abs(w.nod)).toBeLessThan(1);
  });

  it("a world's deck: the four, shuffled by its seed, the same every time", () => {
    const a = bobbleDeck(7);
    expect([...a].sort()).toEqual([...BOBBLES].sort());
    expect(bobbleDeck(7)).toEqual(a);
    const seen = new Set([1, 2, 3, 4, 5, 6, 8, 9].map((s) => bobbleDeck(s).join()));
    expect(seen.size).toBeGreaterThan(2);
  });
});

describe('ND licence plates (core/v3/nd/plates.ts)', () => {
  it('the same plate for the same seed and thing; the regions as often as their weights say', () => {
    expect(rollPlate(7, 123)).toEqual(rollPlate(7, 123));
    const n = 20000;
    const count = new Array(REGIONS.length).fill(0);
    let foil = 0;
    let vanity = 0;
    const grades = new Array(GRADES.length).fill(0);
    for (let i = 0; i < n; i++) {
      const p = rollPlate(7, i * 2654435761);
      count[p.region]++;
      if (p.foil) foil++;
      if (p.vanity) vanity++;
      grades[p.grade]++;
      expect(p.tier).toBe(tierOf(p.oneIn));
      expect(plateText(p).startsWith(REGIONS[p.region].ch)).toBe(true);
    }
    const total = REGIONS.reduce((s, r) => s + r.weight, 0);
    expect(count[0] / n).toBeCloseTo(REGIONS[0].weight / total, 1);
    expect(count[0]).toBeGreaterThan(count[5]);
    expect(foil / n).toBeCloseTo(PLATE.foil, 2);
    expect(vanity / n).toBeLessThan(0.006);
    expect(grades[4] / n).toBeCloseTo(0.03, 1);
  });

  it('the numbers of a kind, the best one counting', () => {
    const r = REGIONS[0];
    expect(patternOf('77777', r)).toBe('solid');
    expect(patternOf('12345', r)).toBe('straight');
    expect(patternOf('54321', r)).toBe('straight');
    expect(patternOf('A7777', r)).toBe('four');
    expect(patternOf('1777B', r)).toBe('sevens');
    expect(patternOf('12321', r)).toBe('palindrome');
    expect(patternOf('5QC12', r)).toBe('initials');
    expect(patternOf('ABCDE', r)).toBe('letters');
    expect(patternOf('31200', r)).toBe('hundreds');
    expect(patternOf('4B888', r)).toBe('three');
    expect(patternOf('AA3BB', r)).toBe('pairs');
    expect(patternOf('3K66A', r)).toBe('lucky');
    expect(patternOf('38152', r)).toBe('digits');
    expect(patternOf('3K15A', r)).toBeNull();
  });

  it('how rare: the region, the number, the foil and the grade multiplied; the tiers; what is said', () => {
    const base = { region: 0, vanity: false, foil: false, grade: 0, pattern: null };
    expect(oneIn(base)).toBe(1);
    expect(oneIn({ ...base, foil: true })).toBe(50);
    expect(oneIn({ ...base, grade: 4 })).toBe(57);
    expect(oneIn({ ...base, foil: true, grade: 4 })).toBe(2850);
    expect(oneIn({ ...base, region: REGIONS.length - 1 })).toBeGreaterThan(80);
    expect(TIERS.map((t) => t.from)).toEqual([1, 11, 33, 125, 855, 25200]);
    expect(tierOf(1)).toBe(0);
    expect(tierOf(33)).toBe(2);
    expect(tierOf(30000)).toBe(5);
    expect(plateSayS({ ...rollPlate(7, 1), tier: 1 })).toBe(0);
    expect(plateSayS({ ...rollPlate(7, 1), tier: 2 })).toBe(2);
    expect(plateSayS({ ...rollPlate(7, 1), tier: 5 })).toBe(4);
  });
});

describe('ND tapes and the deck (core/v3/nd/tapes.ts)', () => {
  it('thirteen tapes, each a song of the radio stations; a world deals each once before any twice', () => {
    expect(TAPES.length).toBe(13);
    expect(new Set(TAPES.map((t) => t.id)).size).toBe(13);
    expect(tapeOf('nd_tape_07')?.title).toBe(TAPES[6].title);
    expect(tapeOf('nd_tape_99')).toBeNull();
    const deck = tapeDeck(7);
    expect([...deck].sort()).toEqual(TAPES.map((t) => t.id).sort());
    expect(tapeDeck(7)).toEqual(deck);
    const had = new Set<string>();
    for (let i = 0; i < 13; i++) had.add(nextOf(deck, had));
    expect(had.size).toBe(13);
    expect(nextOf(deck, had)).toBe(deck[0]);
  });

  it("the deck's sound: full within 4 m, nothing past 25; the volume a step at a time; its numbers", () => {
    expect(deckFalloff(2)).toBe(1);
    expect(deckFalloff(4)).toBe(1);
    expect(deckFalloff(25)).toBe(0);
    expect(deckFalloff(10)).toBeGreaterThan(deckFalloff(15));
    expect(deckFalloff(10)).toBeLessThan(1);
    expect(volumeStep(10, 1, 1, 0.9)).toBeNull();
    expect(volumeStep(10, 1, 1, 0.8)).toBe(11);
    expect(volumeStep(15, 1, 2, 0)).toBe(15);
    expect(volumeStep(0, -1, 2, 0)).toBe(0);
    expect(clock(65.4)).toBe('1:05');
    expect(DECK.steps).toBe(15);
    expect(DECK.start).toBe(10);
    expect(DECK.holdS).toBe(0.4);
    expect(DECK.lidDeg).toBe(80);
  });
});
