// Milestone E0 (docs/V3/nodes/E0-earth-rules.md): the emergent Earth's rules — the slow knobs of a stretch of road,
// the physics that turns them into a place (warmth by height, the mountains' rain and cloud, the year's swing, the
// treeline and the ice), the IUCN ecosystem cards and the landforms that fit it, and the director that chooses
// which way the road goes so that a journey meets the whole Earth, a new place every five minutes, each step a
// natural one.
import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/math/rng';
import {
  LAPSE,
  PATCH_HOLD,
  cloudAt,
  ecosystemAt,
  growingAt,
  landformFit,
  patchesAt,
  rawFit,
  summerAt,
  swingOf,
  warmthAt,
  wetnessAt,
  type Macro,
} from '../../src/core/earth/climate';
import { EarthJourney, SCENE_LENGTH, tourWarmth, tourWetness } from '../../src/core/earth/director';
import { EFGS, LAND_EFGS, WATER_EFGS, efgByCode } from '../../src/core/earth/efg';
import type { Context, Trap, WaterKind } from '../../src/core/earth/kinds';
import { LANDFORMS, landform, landformById } from '../../src/core/earth/landforms';
import { BEST_MONTHS, distance } from '../../src/core/earth/look';
import { ROCKS, rockById, type RockId } from '../../src/core/earth/rocks';

const base: Macro = { tSea: 12, wet: 0.65, cont: 0.5, month: 6, base: 200, relief: 80, context: 'hills', rock: 'limestone', water: 'none', windward: 0, disturb: 'none', landform: null };
const at = (o: Partial<Macro>): Macro => ({ ...base, ...o });
const ordered = (b: Trap | undefined): boolean => !b || (b[0] <= b[1] && b[1] <= b[2] && b[2] <= b[3]);

/** the places of a journey, laid as far as n */
function journey(seed: number, n = 80) {
  const j = new EarthJourney(seed);
  j.sceneAt((n - 1) * SCENE_LENGTH + 1);
  return { j, scenes: j.scenes.slice(0, n) };
}

const SEEDS = [3, 7, 11, 99, 2026, 4242, 31337, 8, 77, 500, 1234, 65535];
const TROPICAL = new Set(['T1.1', 'T1.2', 'T1.3', 'T1.4', 'T3.1', 'T4.1', 'T4.2', 'T4.3', 'T6.5']);

describe('the emergent Earth: its tables', () => {
  it('has seventy ecosystem cards, each unique, each band in order, every rock and landform it names known', () => {
    expect(EFGS.length).toBe(70);
    expect(new Set(EFGS.map((e) => e.code)).size).toBe(EFGS.length);
    expect(LAND_EFGS.length + WATER_EFGS.length).toBe(EFGS.length);
    for (const e of EFGS) {
      for (const b of [e.t, e.m, e.g, e.summer]) expect(ordered(b), e.code).toBe(true);
      for (const r of [...(e.needs?.rocks ?? []), ...(e.needs?.avoid ?? [])]) expect(rockById.has(r), `${e.code} ${r}`).toBe(true);
      for (const l of e.needs?.landforms ?? []) expect(landformById.has(l), `${e.code} ${l}`).toBe(true);
      expect(e.name.length, e.code).toBeGreaterThan(0);
      expect(e.signature.length, e.code).toBeGreaterThan(0);
      expect(e.cover).toBeGreaterThanOrEqual(0);
      expect(e.cover).toBeLessThanOrEqual(1);
    }
    for (const code of Object.keys(BEST_MONTHS)) expect(efgByCode.has(code), code).toBe(true);
  });

  it('has fifty-five landforms and eighteen rocks, each unique, every band and span in order', () => {
    expect(LANDFORMS.length).toBe(55);
    expect(new Set(LANDFORMS.map((l) => l.id)).size).toBe(LANDFORMS.length);
    expect(ROCKS.length).toBe(18);
    expect(new Set(ROCKS.map((r) => r.id)).size).toBe(ROCKS.length);
    for (const l of LANDFORMS) {
      for (const b of [l.t, l.m, l.top]) expect(ordered(b), l.id).toBe(true);
      if (l.span) expect(l.span[0], l.id).toBeLessThanOrEqual(l.span[1]);
      for (const r of l.rocks ?? []) expect(rockById.has(r), `${l.id} ${r}`).toBe(true);
    }
  });

  it('gives every card and every landform a place on the Earth: some stretch of road it fits', () => {
    // (forty thousand stretches drawn over the knobs' whole range — a shore's lie of the land most often a coast's,
    // the relief as often low, middling and high: each card is the one a place shows, or may be its patch,
    // somewhere; each landform can stand somewhere)
    const r = new Rng(0xe0);
    const contexts: Context[] = ['plain', 'hills', 'mountain', 'plateau', 'basin', 'valley', 'coast'];
    const waters: WaterKind[] = ['none', 'river', 'lake', 'wetland', 'coast', 'oasis', 'salt'];
    const land = new Set<string>();
    const water = new Set<string>();
    const forms = new Set<string>();
    for (let k = 0; k < 40000; k++) {
      const wat = r.pick(waters);
      const m: Macro = {
        tSea: r.range(-14, 29),
        wet: r.range(0, 1),
        cont: r.range(0, 1),
        month: 1 + Math.floor(r.range(0, 12)),
        base: r.chance(0.5) ? r.range(0, 400) : r.range(0, 4500),
        relief: r.pick([() => r.range(2, 60), () => r.range(60, 400), () => r.range(400, 2500)])(),
        context: wat === 'coast' && r.chance(0.7) ? 'coast' : r.pick(contexts),
        rock: r.pick(ROCKS).id as RockId,
        water: wat,
        windward: r.range(-1, 1),
        disturb: 'none',
        landform: r.pick(LANDFORMS).id,
      };
      for (const p of patchesAt(m, m.base)) land.add(p.efg.code);
      for (const p of patchesAt(m, m.base, true)) water.add(p.efg.code);
      for (const l of LANDFORMS) if (landformFit(l, m) > 0) forms.add(l.id);
    }
    expect(LAND_EFGS.filter((e) => !land.has(e.code)).map((e) => e.code)).toEqual([]);
    expect(WATER_EFGS.filter((e) => !water.has(e.code)).map((e) => e.code)).toEqual([]);
    expect(LANDFORMS.filter((l) => !forms.has(l.id)).map((l) => l.id)).toEqual([]);
  });
});

describe('the emergent Earth: its physics', () => {
  it('cools with height by the lapse rate, rains on the windward side and dries in the lee', () => {
    const m = at({ tSea: 20, relief: 1500, windward: 1 });
    expect(warmthAt(m, 1000)).toBeCloseTo(20 - 1000 * LAPSE, 6);
    expect(wetnessAt(m, m.base + 1200)).toBeGreaterThan(wetnessAt(m, m.base));
    const lee = at({ tSea: 20, relief: 1500, windward: -1 });
    expect(wetnessAt(lee, lee.base)).toBeLessThan(lee.wet);
  });

  it('swings the year a degree in the tropics, six or more by a temperate sea, thirty in a continent\'s cold heart', () => {
    expect(swingOf(at({ tSea: 27, cont: 0.3 }))).toBeLessThan(1.5);
    const london = swingOf(at({ tSea: 11.5, cont: 0.15 }));
    expect(london).toBeGreaterThan(5);
    expect(london).toBeLessThan(9);
    expect(swingOf(at({ tSea: -8, cont: 1 }))).toBeGreaterThan(24);
  });

  it('draws the treeline where the growing season falls below 6.4 °C, and the ice where no month thaws', () => {
    // an Alpine range (Davos: the year 3.4 °C at 1,560 m, the treeline near 2,000 m)
    const alps = at({ tSea: 13.5, cont: 0.5, relief: 2500, context: 'mountain', rock: 'granite', wet: 0.7 });
    const treeline = alps.tSea / LAPSE - (6.4 - 0.6 * swingOf(alps)) / LAPSE;
    expect(treeline).toBeGreaterThan(1800);
    expect(treeline).toBeLessThan(2300);
    expect(['T2.1', 'T2.2']).toContain(ecosystemAt(alps, 1500).efg.code);
    expect(['T6.4', 'T6.2']).toContain(ecosystemAt(alps, 2600).efg.code);
    expect(growingAt(alps, 1500)).toBeGreaterThan(6.4);
    expect(growingAt(alps, 2600)).toBeLessThan(6.4);
    // an ice cap: the warmest month below freezing
    const cap = at({ tSea: -14, cont: 0.05, wet: 0.5, relief: 100 });
    expect(summerAt(cap, 300)).toBeLessThan(0);
    expect(ecosystemAt(cap, 300).efg.code).toBe('T6.1');
    // the Siberian taiga: a cold year, a warm summer — forest, not tundra
    const taiga = at({ tSea: -8, cont: 0.95, wet: 0.5, relief: 60 });
    expect(ecosystemAt(taiga, 150).efg.code).toBe('T2.1');
  });

  it('climbs a wet tropical range through the rainforest, the cloud forest and the páramo', () => {
    const range = at({ tSea: 26.5, wet: 0.85, cont: 0.2, relief: 3600, context: 'mountain', windward: 0.8, rock: 'granite' });
    expect(ecosystemAt(range, 150).efg.code).toBe('T1.1');
    expect(cloudAt(range, 2000)).toBeGreaterThan(0.5);
    expect(ecosystemAt(range, 2000).efg.code).toBe('T1.3');
    expect(ecosystemAt(range, 3600).efg.code).toBe('T6.5');
    // (no cloud forest down by the sea, however warm and wet: the cloud is above the condensation level)
    expect(cloudAt(range, 150)).toBe(0);
  });

  it('holds a place\'s patch where it fits nearly as well as the best, and blends it into the best at its edge', () => {
    const m = at({ tSea: 12, wet: 0.6, relief: 60, context: 'plain' });
    const best = ecosystemAt(m, m.base).efg;
    const cands = patchesAt(m, m.base);
    expect(cands[0].efg).toBe(best);
    const other = cands.find((c) => c.efg !== best);
    expect(other).toBeDefined();
    const top = Math.max(...cands.map((c) => c.raw));
    expect(other!.raw).toBeGreaterThanOrEqual(PATCH_HOLD * top);
    const withPatch: Macro = { ...m, efg: other!.efg.code };
    expect(ecosystemAt(withPatch, m.base).efg).toBe(other!.efg);
    // (where the patch no longer fits, the best again; the blend toward the other side never jumps)
    let lastBlend = -1;
    for (let h = m.base; h < m.base + 4000; h += 50) {
      const p = ecosystemAt(withPatch, h);
      expect(p.blend).toBeGreaterThanOrEqual(0);
      expect(p.blend).toBeLessThanOrEqual(0.5);
      if (lastBlend >= 0) expect(Math.abs(p.blend - lastBlend)).toBeLessThan(0.3);
      lastBlend = p.blend;
      if (rawFit(other!.efg, withPatch, h) === 0) expect(p.efg).not.toBe(other!.efg);
    }
  });
});

describe('the emergent Earth: its director', () => {
  it('lays the same journey for the same seed, another for another', () => {
    const a = journey(2026, 40).scenes.map((s) => `${s.name}|${s.look.efg.code}|${s.macro.landform}`);
    const b = journey(2026, 40).scenes.map((s) => `${s.name}|${s.look.efg.code}|${s.macro.landform}`);
    const c = journey(2027, 40).scenes.map((s) => `${s.name}|${s.look.efg.code}|${s.macro.landform}`);
    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
  });

  it('starts every journey in the workshop\'s gentle temperate country', () => {
    for (const seed of SEEDS) {
      const s0 = journey(seed, 1).scenes[0];
      expect(s0.macro.tSea).toBeGreaterThan(9);
      expect(s0.macro.tSea).toBeLessThan(14);
      expect(s0.look.sig.struct).not.toBe('desert');
      expect(s0.look.sig.struct).not.toBe('ice');
    }
  });

  it('makes every place a natural one: its ecosystem fits it, its landform can stand in it, its road below the snowline', () => {
    for (const seed of SEEDS) {
      for (const s of journey(seed).scenes) {
        const m = s.macro;
        expect(ecosystemAt(m, m.base).fit, `${seed} ${s.index} ${s.name}`).toBeGreaterThan(0);
        if (m.landform) expect(landformFit(landform(m.landform), m), `${seed} ${s.index} ${m.landform}`).toBeGreaterThan(0);
        expect(s.look.efg.code, `${seed} ${s.index}`).not.toBe('T6.1');
        expect(growingAt(m, m.base), `${seed} ${s.index}`).toBeGreaterThan(-0.5);
        expect(m.month).toBeGreaterThanOrEqual(1);
        expect(m.month).toBeLessThanOrEqual(12);
      }
    }
  });

  it('changes step by step: the warmth a few degrees a place, the month two at most, never the tropics beside the tundra', () => {
    for (const seed of SEEDS) {
      const sc = journey(seed).scenes;
      for (let k = 1; k < sc.length; k++) {
        const a = sc[k - 1];
        const b = sc[k];
        expect(Math.abs(warmthAt(b.macro, b.macro.base) - warmthAt(a.macro, a.macro.base)), `${seed} ${k}`).toBeLessThan(6);
        const dm = Math.abs(b.macro.month - a.macro.month);
        expect(Math.min(dm, 12 - dm), `${seed} ${k}`).toBeLessThanOrEqual(2);
        const pair = [a.look.efg.code, b.look.efg.code];
        expect(pair.some((c) => TROPICAL.has(c)) && pair.includes('T6.3'), `${seed} ${k} ${pair}`).toBe(false);
      }
    }
  });

  it('meets the whole Earth: some twenty ecosystems and as many landforms every 400 km, seldom two places alike', () => {
    let eco = 0;
    let forms = 0;
    let alike = 0;
    let all = 0;
    for (const seed of SEEDS) {
      const sc = journey(seed).scenes;
      const e = new Set(sc.map((s) => s.look.efg.code));
      const l = new Set(sc.map((s) => s.look.landform.id));
      expect(e.size, `${seed}`).toBeGreaterThanOrEqual(12);
      expect(l.size, `${seed}`).toBeGreaterThanOrEqual(16);
      eco += e.size;
      forms += l.size;
      let run = 0;
      for (let k = 1; k < sc.length; k++) {
        all++;
        if (distance(sc[k - 1].look.sig, sc[k].look.sig) < 0.25) {
          alike++;
          run++;
          expect(run, `${seed} ${k}`).toBeLessThanOrEqual(3);
        } else run = 0;
      }
    }
    expect(eco / SEEDS.length).toBeGreaterThanOrEqual(18);
    expect(forms / SEEDS.length).toBeGreaterThanOrEqual(22);
    expect(alike / all).toBeLessThan(0.1);
  });

  it('names every place of a journey once, in two or three characters, and says what it is', () => {
    for (const seed of SEEDS) {
      const sc = journey(seed).scenes;
      expect(new Set(sc.map((s) => s.name)).size, `${seed}`).toBe(sc.length);
      for (const s of sc) {
        expect(s.name.length, s.name).toBeGreaterThanOrEqual(2);
        expect(s.name.length, s.name).toBeLessThanOrEqual(3);
        expect(s.tag.length).toBeGreaterThan(0);
        expect(s.moment.length).toBeGreaterThan(0);
      }
    }
  });

  it('gives the world a place\'s own knobs all through it, and eases the numbers across its border', () => {
    const { j, scenes } = journey(11, 20);
    for (const s of scenes) {
      for (const u of [0.05, 0.5, 0.95]) {
        const m = j.macroAt(s.s0 + u * (s.s1 - s.s0));
        expect(m.landform).toBe(s.macro.landform);
        expect(m.rock).toBe(s.macro.rock);
        expect(m.water).toBe(s.macro.water);
        expect(m.efg ?? null).toBe(s.macro.efg ?? null);
        expect(m.month).toBe(s.macro.month);
      }
    }
    // (the numbers ease: a metre's step changes the road's height by centimetres at most)
    let worst = 0;
    for (let s = 0; s < 20 * SCENE_LENGTH - 10; s += 97) worst = Math.max(worst, Math.abs(j.macroAt(s + 1).base - j.macroAt(s).base));
    expect(worst).toBeLessThan(0.25);
  });

  it('tours the Earth: its warmth from the polar to the equatorial and its wetness from the deserts to the always-wet', () => {
    for (const seed of SEEDS) {
      const t: number[] = [];
      const w: number[] = [];
      for (let s = 0; s < 400000; s += 2000) {
        t.push(tourWarmth(seed, s));
        w.push(tourWetness(seed, s));
      }
      expect(Math.min(...t)).toBeLessThan(0);
      expect(Math.max(...t)).toBeGreaterThan(24);
      expect(Math.min(...w)).toBeLessThan(0.2);
      expect(Math.max(...w)).toBeGreaterThan(0.75);
    }
  });
});
