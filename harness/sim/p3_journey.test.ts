// The journey's shuffle and joins (docs/V3/research/scenic-50.md §5): every round all fifty once, look-alikes kept
// apart, no long runs of thresholds, a gentle start, the same seed the same journey; and the fifty's cards sound.
import { describe, expect, it } from 'vitest';
import { FAMILY_GAP, Journey, MAX_THRESHOLDS, SCENE_LENGTH, joinKind, planJoin } from '../../src/core/world/journey/journey';
import { BUFFERS, SCENES } from '../../src/core/world/journey/scenes';

describe('the fifty scenic roads', () => {
  it('are fifty, numbered once each, each with a way in and a season', () => {
    expect(SCENES.length).toBe(50);
    expect(new Set(SCENES.map((s) => s.no)).size).toBe(50);
    expect(new Set(SCENES.map((s) => s.id)).size).toBe(50);
    for (const s of SCENES) {
      expect(s.doors.length, s.id).toBeGreaterThan(0);
      expect(s.month >= 1 && s.month <= 12, s.id).toBe(true);
      expect(s.wet >= 0 && s.wet <= 1 && s.alt >= 0 && s.alt <= 1, s.id).toBe(true);
    }
    // the six regions there were that six of them grow from (§6)
    expect(SCENES.filter((s) => s.region).map((s) => s.region).sort()).toEqual(['bamboo_sea', 'desert', 'karst_peaks', 'maple', 'red_canyon', 'terraces']);
    expect(SCENES.filter((s) => s.gentle).length).toBeGreaterThanOrEqual(8);
  });
});

describe('the journey', () => {
  it('deals every round all fifty once, the same seed the same order, another seed another', () => {
    const a = new Journey(7);
    const b = new Journey(7);
    for (let r = 0; r < 3; r++) {
      const ids = a.round(r).map((s) => s.id);
      expect(new Set(ids).size).toBe(50);
      expect(ids).toEqual(b.round(r).map((s) => s.id));
    }
    const c = new Journey(8).round(0).map((s) => s.id);
    const same = c.filter((id, i) => id === a.round(0)[i].id).length;
    expect(same).toBeLessThan(10);
    // a new round is a new order
    const r1 = a.round(1).map((s) => s.id);
    expect(r1.filter((id, i) => id === a.round(0)[i].id).length).toBeLessThan(10);
  });

  it('keeps its rules: a gentle start, look-alikes apart, no long runs of thresholds (bent seldom)', () => {
    let joins = 0;
    let next = 0;
    let close = 0;
    let runs = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const j = new Journey(seed);
      expect(j.scene(0).gentle, `seed ${seed}`).toBe(true);
      const order = [...j.round(0), ...j.round(1), ...j.round(2)];
      let run = 0;
      for (let i = 1; i < order.length; i++) {
        joins++;
        run = joinKind(order[i - 1], order[i]) === 'threshold' ? run + 1 : 0;
        if (run > MAX_THRESHOLDS) runs++;
        for (let g = 1; g <= FAMILY_GAP && g <= i; g++) {
          if (order[i - g].families.some((f) => order[i].families.includes(f))) {
            close++;
            if (g === 1) next++;
            break;
          }
        }
      }
    }
    expect(next / joins).toBeLessThan(0.001);
    expect(close / joins).toBeLessThan(0.005);
    expect(runs / joins).toBeLessThan(0.02);
  });

  it('joins every two with a gentle change, a quiet stretch or a threshold the two can be passed by', () => {
    const buffers = new Set(BUFFERS.map((b) => b.id));
    const kinds = { ecotone: 0, buffer: 0, threshold: 0 };
    for (let seed = 1; seed <= 40; seed++) {
      const j = new Journey(seed);
      for (let i = 0; i < 99; i++) {
        const a = j.scene(i);
        const b = j.scene(i + 1);
        const join = planJoin(a, b, seed, i);
        kinds[join.kind]++;
        expect(join.length).toBeGreaterThan(500);
        expect(join.length).toBeLessThanOrEqual(3000);
        if (join.buffer) expect(buffers.has(join.buffer)).toBe(true);
        if (join.kind === 'threshold') {
          const t = join.threshold!;
          expect(a.doors.includes(t) && b.doors.includes(t) || b.doors.includes(t) || t === 'tunnel' || t === 'fog').toBe(true);
        }
      }
    }
    const all = kinds.ecotone + kinds.buffer + kinds.threshold;
    // (every kind met; thresholds not the most of them: a reveal every few stretches, not at every one)
    expect(kinds.ecotone / all).toBeGreaterThan(0.03);
    expect(kinds.threshold / all).toBeLessThan(0.45);
    expect(kinds.buffer / all).toBeGreaterThan(0.3);
  });

  it('lays its chapters end to end: a scene of 5 to 7 km, then its join', () => {
    const j = new Journey(3);
    let at = 0;
    for (let c = 0; c < 120; c++) {
      const ch = j.chapter(c);
      expect(ch.start).toBe(at);
      expect(ch.kind).toBe(c % 2 === 0 ? 'scene' : 'join');
      if (ch.kind === 'scene') {
        expect(ch.length).toBeGreaterThanOrEqual(SCENE_LENGTH[0]);
        expect(ch.length).toBeLessThanOrEqual(SCENE_LENGTH[1]);
      }
      at += ch.length;
    }
    expect(j.at(at - 1)).toBe(j.chapter(119));
  });
});
