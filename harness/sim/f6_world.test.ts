/**
 * F6 (docs/V3/plan/finish.md §二 6): the world of version 7. Its journey begins gently — the first twelve kilometres of
 * its road run through mild, green country, neither the snow's nor the desert's, in no month colder than a spring day
 * (one drives them in a car without its doors) — and from there on it is the scenic roads' journey as it always was:
 * the deserts and the snow come. A world made before is the world it was.
 * And the ten waters with a lord of their own lie down its road from the 78th kilometre on, in order, each at a jetty
 * out over its lake or at the pier under a lighthouse.
 * ROBOT_SEEDS=200 for the full count (the default: 12, to keep the suite quick).
 */
import { describe, expect, it } from 'vitest';
import { EarthJourney, GENTLE_MONTH, homeOf, isMild } from '../../src/core/earth/director';
import { monthWarmthAt } from '../../src/core/earth/climate';
import { BIOMES } from '../../src/core/world/biomes';
import { GENTLE_M } from '../../src/core/world/earth/road';
import { NEWEST_WORLD, rulesFor } from '../../src/core/world/rules';
import { LORD_APART_LATE, LORD_EVERY_M, LORD_FROM_M, LORD_WATERS, SITE_SLOT, type Site } from '../../src/core/world/sites';
import { modcarWorld } from '../../src/game/modcar/seamless';
import { savedWorldOf } from '../../src/game/modcar/worldSave';
import '../../src/core/v3/nd/cards';

const SEEDS = [7, ...Array.from({ length: Number(process.env.ROBOT_SEEDS ?? 12) }, (_, k) => 1000 + k * 7919)];

/** the regions of a world's road that begin before `to` (m), each with where it begins */
function regionsTo(seed: number, version: 6 | 7, to: number): { id: string; kin: string; day: number; night: number; from: number }[] {
  const plan = modcarWorld(seed, { worldVersion: version }).world.spine.plan;
  plan.chapterAt(to);
  const out: { id: string; kin: string; day: number; night: number; from: number }[] = [];
  for (let c = 0; plan.starts[c] < to; c++) {
    const b = BIOMES[plan.biomeOf(c)];
    out.push({ id: b.id, kin: b.kin, day: b.tempDay, night: b.tempNight, from: plan.starts[c] });
  }
  return out;
}

describe('F6: a new game\'s world', () => {
  it('is of version 7; a game gone on with keeps the world it was made in — version 6\'s its version, one from before there were versions its seed alone', () => {
    expect(NEWEST_WORLD).toBe(7);
    expect(rulesFor(NEWEST_WORLD).version).toBe(7);
    // (what a save says of its world: entry.ts makes the world again from this, whatever the newest is)
    expect(savedWorldOf(modcarWorld(7, { worldVersion: 7 }).world, 7)).toMatchObject({ seed: 7, version: 7 });
    expect(savedWorldOf(modcarWorld(7, { worldVersion: 6 }).world, 7)).toMatchObject({ seed: 7, version: 6 });
    expect(savedWorldOf(modcarWorld(7, {}).world, 7)).toEqual({ seed: 7 });
  });
});

describe('F6: the world of version 7 begins gently', () => {
  it('a mild place: green country, neither chill nor hot, well clear of the dry', () => {
    for (const seed of SEEDS) expect(isMild(homeOf(seed)), `home of ${seed}`).toBe(true);
    const home = homeOf(7);
    // (the far north: its summer too short and too cool — a continental country a little south of it has a warm one, and the journey is there in it)
    expect(isMild({ ...home, tSea: -8 })).toBe(false);
    expect(isMild({ ...home, tSea: 27 })).toBe(false);
    expect(isMild({ ...home, wet: 0.2 })).toBe(false);
    // (high up: the same latitude under its treeline no more)
    expect(isMild({ ...home, base: 2600 })).toBe(false);
    expect(GENTLE_M).toBe(12_000);
  });

  it('the journey: every place that begins within twelve kilometres is a mild one, in a month no colder than a spring day', () => {
    for (const seed of SEEDS) {
      const j = new EarthJourney(seed, { drama: true, gentle: GENTLE_M });
      for (const s of [1, 5001, 10001]) {
        const sc = j.sceneAt(s);
        expect(sc.look.sig.snow, `seed ${seed}, ${s} m`).toBeFalsy();
        expect(['T5'].includes(sc.look.efg.group) || sc.look.efg.struct === 'desert', `seed ${seed}, ${s} m: ${sc.look.efg.code}`).toBe(false);
        expect(monthWarmthAt(sc.macro, sc.macro.base, sc.macro.month), `seed ${seed}, ${s} m`).toBeGreaterThanOrEqual(GENTLE_MONTH - 1e-9);
      }
      // the same journey every time
      expect(new EarthJourney(seed, { drama: true, gentle: GENTLE_M }).sceneAt(40_001).name).toBe(j.sceneAt(40_001).name);
    }
  });

  it('the world: its regions down the first twelve kilometres are green and warm enough; beyond them the deserts and the snow come as ever', () => {
    const day: number[] = [];
    const night: number[] = [];
    const later: Record<string, number> = {};
    let harsh6 = 0;
    for (const seed of SEEDS) {
      for (const r of regionsTo(seed, 7, GENTLE_M)) {
        expect(r.kin, `seed ${seed}: ${r.id} from ${(r.from / 1000).toFixed(1)} km`).toBe('plains');
        day.push(r.day);
        night.push(r.night);
      }
      for (const r of regionsTo(seed, 7, 150_000)) if (r.from >= GENTLE_M) later[r.kin] = (later[r.kin] ?? 0) + 1;
      if (regionsTo(seed, 6, GENTLE_M).some((r) => r.kin !== 'plains')) harsh6++;
    }
    const lo = (a: number[]): number => Math.min(...a);
    const hi = (a: number[]): number => Math.max(...a);
    console.info(`the first twelve kilometres of ${SEEDS.length} worlds of version 7: by day ${lo(day)}–${hi(day)} °C, by night ${lo(night)}–${hi(night)} °C; from there to 150 km their regions are ${JSON.stringify(later)}; of the same worlds of version 6, ${harsh6} had the desert or the snow within twelve kilometres`);
    expect(lo(day)).toBeGreaterThanOrEqual(12);
    expect(hi(day)).toBeLessThanOrEqual(30);
    expect(lo(night)).toBeGreaterThanOrEqual(3);
    // (the journey is not made bland: the dry and the cold are still met down the road)
    expect(later.desert ?? 0).toBeGreaterThan(0);
    expect(later.alpine ?? 0).toBeGreaterThan(0);
  }, 600_000);

  it('a world made before is the world it was: its own journey, its own regions', () => {
    const six = regionsTo(7, 6, 30_000);
    const seven = regionsTo(7, 7, 30_000);
    expect(six.slice(1).every((r) => r.id.startsWith('earth5:'))).toBe(true);
    expect(seven.slice(1).every((r) => r.id.startsWith('earth7:'))).toBe(true);
    // (home is home in both)
    expect(seven[0].id).toBe(six[0].id);
    expect(rulesFor(7).dealer).not.toBe(rulesFor(6).dealer);
    expect(rulesFor(7).slot).toBe(rulesFor(6).slot);
  });
});

/** the places of a world's road with a lord's water, to `to` (m), in road order */
function lordsTo(seed: number, version: 6 | 7, to: number): Site[] {
  const sites: Site[] = [];
  modcarWorld(seed, { worldVersion: version }).world.sites.between(0, to, sites);
  return sites.filter((s) => s.lord >= 0 && s.s <= to).sort((a, b) => a.s - b.s);
}

describe('F6: the ten waters with a lord of their own', () => {
  it('down the road from the 78th kilometre, in order, each at a jetty or under a lighthouse, never two in neighbouring stretches', () => {
    const by300: number[] = [];
    const at: number[][] = Array.from({ length: LORD_WATERS }, () => []);
    let sea = 0;
    for (const seed of SEEDS) {
      const lords = lordsTo(seed, 7, 360_000);
      expect(lords.length, `seed ${seed}: by the 360th kilometre`).toBe(LORD_WATERS);
      lords.forEach((site, j) => {
        const where = `seed ${seed}: water ${j} at ${(site.s / 1000).toFixed(1)} km`;
        expect(site.lord, where).toBe(j);
        expect(['jetty', 'lighthouse'], where).toContain(site.kind);
        // (it has the jetty one stands on to fish it)
        expect(site.objects.some((o) => o.kind === 'jetty'), where).toBe(true);
        // (each from its own kilometre on: the first is no earlier than the fishing's chapter, the others a chapter's worth apart at the soonest)
        expect(site.s, where).toBeGreaterThanOrEqual(LORD_FROM_M + j * LORD_EVERY_M);
        if (j > 0) expect(Math.floor(site.s / SITE_SLOT) - Math.floor(lords[j - 1].s / SITE_SLOT), where).toBeGreaterThanOrEqual(LORD_APART_LATE);
        at[j].push(site.s / 1000);
        if (site.kind === 'lighthouse') sea++;
      });
      by300.push(lords.filter((s) => s.s <= 300_000).length);
    }
    const mid = (a: number[]): number => [...a].sort((x, y) => x - y)[a.length >> 1];
    console.info(
      `the ten waters of ${SEEDS.length} worlds: all ten by the 300th kilometre in ${by300.filter((n) => n === LORD_WATERS).length}, the fewest by then ${Math.min(...by300)}; ${sea} of ${SEEDS.length * LORD_WATERS} under a lighthouse; where each is (km: middle, soonest–latest): ` +
        at.map((a, j) => `${j + 1}: ${mid(a).toFixed(0)} (${Math.min(...a).toFixed(0)}–${Math.max(...a).toFixed(0)})`).join(' · '),
    );
    // (lakes come in districts: a world may be a water or four behind at the 300th kilometre — most are not)
    expect(Math.min(...by300)).toBeGreaterThanOrEqual(5);
    expect(by300.filter((n) => n === LORD_WATERS).length).toBeGreaterThanOrEqual(SEEDS.length * 0.75);
    // (the first is met in the fishing's own chapter, 75–105 km, as a rule)
    expect(mid(at[0])).toBeLessThan(105);
  }, 600_000);

  it('the same waters every time; a world made before has none', () => {
    const a = lordsTo(7, 7, 200_000).map((s) => `${s.id}:${s.lord}`);
    expect(lordsTo(7, 7, 200_000).map((s) => `${s.id}:${s.lord}`)).toEqual(a);
    expect(a.length).toBeGreaterThan(0);
    expect(lordsTo(7, 6, 200_000)).toEqual([]);
  }, 600_000);
});
