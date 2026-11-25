/**
 * The casual fishing module's rules (src/core/v3/fishing/lite, docs/V3/nodes/F2-fishing-lite.md): the catalogue is
 * whole, the sizes and colours fall in their shares, the fight walked left and right climbs in difficulty with a fish's
 * strength for each of the three robot hands, the pond stocks, fills and remembers, a cast goes from the thumb to
 * the keepnet, and the angler's journal, orders, shop and clock keep their rules.
 */
import { describe, expect, it } from 'vitest';
import { AutoAngler } from '../../src/core/v3/fishing/lite/autoplay';
import { fightParams, landFight, LAND_AT, RED_AT, startFight, stepFight, type FightHands, type FightParams, type FightState } from '../../src/core/v3/fishing/lite/fight';
import { FISH, FISH_INDEX, fishOfSpot, fishOfTier, kgOf, kindWeight } from '../../src/core/v3/fishing/lite/fish';
import { BAITS, baitIndexOf, RODS, homePower, REC_ROD, rodIdNow, STAR_TIER } from '../../src/core/v3/fishing/lite/gear';
import { lordToday, Pond, roundLake } from '../../src/core/v3/fishing/lite/pond';
import { Angler, clockOf, fixSave, makeOrders, newSave, nextMoment, skyMoment, timeOf } from '../../src/core/v3/fishing/lite/progress';
import { EXPERT, NOVICE, ROBOTS, robotFight, USUAL } from '../../src/core/v3/fishing/lite/robot';
import { appetite, medalOf, rollLength, rollVariant, strengthOf, strikeWindow, valueOf, variantOdds, xpOf, type Rig } from '../../src/core/v3/fishing/lite/rules';
import { Session } from '../../src/core/v3/fishing/lite/session';
import { SPOTS } from '../../src/core/v3/fishing/lite/spots';
import { TIERS, type Conditions, type Cond, type Temper } from '../../src/core/v3/fishing/lite/types';
import { FISH_INDEX as KITCHEN } from '../../src/core/v3/fishing/species';

function cond(hour: number, o: Partial<Conditions> & { ev?: Cond[] } = {}): Conditions {
  return { day: o.day ?? 0, hour, rain: o.rain ?? false, clear: o.clear ?? !o.rain, fog: o.fog ?? false, storm: o.storm ?? false, snow: o.snow ?? false, events: new Set(o.ev ?? []) };
}

function rigOf(bait: string, rod = 'rod_willow'): Rig {
  const s = newSave();
  s.baits[bait] = 99;
  s.bait = bait;
  if (!s.rods.includes(rod)) s.rods.push(rod);
  s.rod = rod;
  return new Angler(s).rig();
}

describe('the catalogue', () => {
  it('holds 110 fish, eleven to a water: three common, three uncommon, two rare, an epic, a lord and a celestial fish', () => {
    expect(FISH.length).toBe(110);
    expect(new Set(FISH.map((f) => f.id)).size).toBe(110);
    for (let s = 0; s < SPOTS.length; s++) {
      const tiers = fishOfSpot(s).map((i) => FISH[i].tier);
      expect(tiers.length).toBe(11);
      expect([0, 1, 2, 3, 4, 5].map((t) => tiers.filter((x) => x === t).length)).toEqual([3, 3, 2, 1, 1, 1]);
    }
  });

  it('every lord takes a live fish of its own water that is no lord; every celestial fish has its moment; kitchen kinds exist', () => {
    for (const f of FISH) {
      if (f.tier === 4) {
        expect(f.live, f.id).toBeTruthy();
        const bait = FISH[FISH_INDEX.get(f.live!)!];
        expect(bait.spot, f.id).toBe(f.spot);
        expect(bait.tier, f.id).toBeLessThan(4);
        expect(f.span, f.id).toBeTruthy();
      }
      if (f.tier === 5) expect(f.only, f.id).toBeTruthy();
      if (f.kind) expect(KITCHEN[f.kind], `${f.id} → ${f.kind}`).toBeDefined();
      expect(f.cm[0]).toBeLessThan(f.cm[1]);
      expect(kgOf(f, f.cm[1])).toBeGreaterThan(0);
    }
  });

  it('every fish below a lord bites on some bait a hut sells, at some hour', () => {
    for (const f of FISH) {
      if (f.tier >= 4) continue;
      let ok = false;
      for (const b of BAITS) {
        if (b.tier === STAR_TIER) continue;
        const rig = rigOf(b.id);
        for (const h of [6, 12, 18, 23]) {
          const c = cond(h, { rain: f.weather === 'rain', ev: f.only ? [f.only] : [] });
          if (appetite(f, 0.5, rig, c) > 0) ok = true;
        }
      }
      expect(ok, f.id).toBe(true);
    }
  });

  it('a fish’s strength sits about the rod of its rarity, whichever water it lives in: the common well under the willow, the epic just over the sea rod; a lord far over its own water’s step', () => {
    expect(REC_ROD).toEqual([0, 1, 2, 3]);
    expect(REC_ROD.map((i) => RODS[i].id)).toEqual(['rod_willow', 'rod_swift', 'rod_pro', 'rod_sea']);
    for (const f of FISH) {
      const r = strengthOf(f, 0.5) / (f.tier <= 3 ? RODS[REC_ROD[f.tier]].power : homePower(f.spot));
      if (f.tier === 0) expect(r, f.id).toBeLessThan(0.5);
      if (f.tier === 3) expect(r, f.id).toBeGreaterThan(0.95);
      if (f.tier === 4) expect(r, f.id).toBeGreaterThan(1.4);
      // (on the rod of its rarity it is the fight its rarity was made for, the fight's table below: the middle of its
      // rarity's band, a brute a tenth over, a steady one a tenth under)
      const temper = f.temper === 'brute' ? 1.1 : f.temper === 'steady' ? 0.9 : 1;
      if (f.tier <= 3) expect(r, f.id).toBeCloseTo([0.3, 0.56, 0.825, 1.125][f.tier] * temper, 6);
    }
    // (the same rarity and temper, the same strength whichever water; worth and experience by rarity alone, lords too)
    const rig = { charms: [], rod: RODS[0] };
    for (let t = 0; t <= 5; t++) {
      const of = fishOfTier(t).map((i) => FISH[i]);
      for (const f of of) {
        expect(valueOf(f, 0.5, 0, rig), f.id).toBe(valueOf(of[0], 0.5, 0, rig));
        expect(xpOf(f, 0.5, 0, false), f.id).toBe(xpOf(of[0], 0.5, 0, false));
        const twin = of.find((g) => g.spot !== f.spot && g.temper === f.temper);
        if (t <= 3 && twin) expect(strengthOf(f, 0.5), `${f.id} ~ ${twin.id}`).toBeCloseTo(strengthOf(twin, 0.5), 9);
      }
    }
    for (let t = 1; t <= 5; t++) {
      expect(valueOf(FISH[fishOfTier(t)[0]], 0.5, 0, rig)).toBeGreaterThan(valueOf(FISH[fishOfTier(t - 1)[0]], 0.5, 0, rig));
      expect(xpOf(FISH[fishOfTier(t)[0]], 0.5, 0, false)).toBeGreaterThan(xpOf(FISH[fishOfTier(t - 1)[0]], 0.5, 0, false));
    }
  });

  it('five rods, each a different hand (docs/V3/plan/fishing-feel.md §11): the four sold one to each rarity, the night rod earned; the lords on a ladder from the willow to the sea rod', () => {
    expect(RODS.map((r) => r.id)).toEqual(['rod_willow', 'rod_swift', 'rod_pro', 'rod_sea', 'rod_heron']);
    const [willow, swift, pro, sea, heron] = RODS;
    // (the rarities' rods climb about 2.6 times each: a rod below a rarity's is hard work, two below all but hopeless)
    for (let t = 1; t < 4; t++) expect(RODS[REC_ROD[t]].power / RODS[REC_ROD[t - 1]].power).toBeGreaterThan(2.4);
    const uncommonOnWillow = strengthOf(FISH[fishOfTier(1)[0]], 0.5) / willow.power;
    expect(uncommonOnWillow).toBeGreaterThan(1.3);
    expect(strengthOf(FISH[fishOfTier(2)[0]], 0.5) / willow.power).toBeGreaterThan(3);
    // (each the most of something: the willow the widest feel and the only longer moment to strike; the carbon the
    // furthest cast and the fastest reel, the narrowest feel; the sea rod the most power, the slowest reel, the
    // shortest cast after the willow; the pro between them in all four; the night rod its night)
    const most = (k: 'power' | 'cast' | 'reel' | 'feel') => RODS.reduce((a, b) => (b[k] > a[k] ? b : a)).id;
    const least = (k: 'power' | 'cast' | 'reel' | 'feel') => RODS.reduce((a, b) => (b[k] < a[k] ? b : a)).id;
    expect([most('power'), most('cast'), most('reel'), most('feel')]).toEqual(['rod_sea', 'rod_swift', 'rod_swift', 'rod_willow']);
    expect([least('power'), least('reel'), least('feel')]).toEqual(['rod_willow', 'rod_sea', 'rod_swift']);
    expect(sea.cast).toBeLessThan(Math.min(swift.cast, pro.cast, heron.cast));
    for (const k of ['power', 'cast', 'reel', 'feel'] as const) {
      expect(pro[k], k).toBeLessThanOrEqual(Math.max(swift[k], sea[k]));
      expect(pro[k], k).toBeGreaterThanOrEqual(Math.min(swift[k], sea[k]));
    }
    expect(RODS.filter((r) => r.perk).map((r) => [r.id, r.perk])).toEqual([['rod_willow', 'window'], ['rod_heron', 'night']]);
    // (the willow's moment to strike half as long again; the night rod bitten quicker at night, slower by day)
    const carp = FISH[FISH_INDEX.get('crucian_carp')!];
    expect(strikeWindow(carp, rigOf('worm')) / strikeWindow(carp, rigOf('worm', 'rod_swift'))).toBeCloseTo(1.5, 6);
    expect(appetite(carp, 0.5, rigOf('worm', 'rod_heron'), cond(23)) / appetite(carp, 0.5, rigOf('worm', 'rod_pro'), cond(23))).toBeCloseTo(1.5, 6);
    expect(appetite(carp, 0.5, rigOf('worm', 'rod_heron'), cond(12)) / appetite(carp, 0.5, rigOf('worm', 'rod_pro'), cond(12))).toBeCloseTo(0.7, 6);
    // (the reel: the rod's own speed in the fight, the faster the quicker a fish is wound in)
    const p = (r: (typeof RODS)[number]) => fightParams({ ratio: 0.5, pool: 10, temper: 'steady', tier: 1, feel: r.feel, cast: r.cast, speed: r.reel, line: 0, reel: 0 });
    expect(p(swift).reel).toBeCloseTo(4.4, 6);
    expect(p(sea).reel).toBeLessThan(p(willow).reel);
    expect(p(willow).tough).toBeGreaterThan(p(swift).tough);
    // (the huts: the willow from the start, the carbon at the second water, the pro at the fifth, the sea rod at the sea
    // bay, each dearer; the night rod is earned)
    expect(RODS.map((r) => r.shop)).toEqual([0, 1, 4, 7, -1]);
    expect(swift.price).toBeLessThan(pro.price);
    expect(pro.price).toBeLessThan(sea.price);
    expect(SPOTS[sea.shop].sea).toBe(true);
    // (the lords: the first water's against the willow, the tenth's against the sea rod, about 1.37 times a water)
    expect(homePower(0)).toBe(willow.power);
    expect(homePower(9)).toBe(sea.power);
    expect(homePower(3)).toBeCloseTo(swift.power, -0.5);
    expect(homePower(6)).toBeCloseTo(pro.power, -0.5);
    for (let s = 1; s < SPOTS.length; s++) expect(homePower(s) / homePower(s - 1)).toBeCloseTo(Math.pow(17.2, 1 / 9), 1);
    // (each lord a hard fight on the rod of its step, an easy one on the next rod up)
    for (const [s, rod, up] of [[0, willow, swift], [3, swift, pro], [6, pro, sea]] as const) {
      const lord = FISH.find((f) => f.tier === 4 && f.spot === s)!;
      expect(strengthOf(lord, 0.5) / rod.power, lord.id).toBeGreaterThan(1.4);
      expect(strengthOf(lord, 0.5) / up.power, lord.id).toBeLessThan(0.75);
    }
  });

  it('a rod retired comes back from a save as the rod nearest it in power', () => {
    expect(rodIdNow('rod_reed')).toBe('rod_willow');
    expect(rodIdNow('rod_brook')).toBe('rod_swift');
    expect(rodIdNow('rod_mirror')).toBe('rod_pro');
    expect(rodIdNow('rod_mist')).toBe('rod_pro');
    expect(rodIdNow('rod_vine')).toBe('rod_heron');
    expect(rodIdNow('rod_frost')).toBe('rod_sea');
    expect(rodIdNow('rod_moon')).toBe('rod_sea');
    expect(rodIdNow('rod_old')).toBe('rod_willow');
    expect(rodIdNow('rod_gold')).toBe('rod_sea');
    expect(rodIdNow('rod_pro')).toBe('rod_pro');
    expect(rodIdNow('no_such_rod')).toBe('rod_willow');
    // (every retired one to the rod there is nearest its old power, against the ratio)
    const old: Record<string, number> = { rod_reed: 16, rod_old: 13, rod_brook: 26, rod_mirror: 42, rod_mist: 67, rod_thunder: 85, rod_vine: 107, rod_long: 130, rod_clover: 160, rod_frost: 172, rod_tide: 275, rod_ember: 440, rod_gold: 520, rod_moon: 700 };
    for (const [id, power] of Object.entries(old)) {
      const nearest = RODS.reduce((a, b) => (Math.abs(Math.log(b.power / power)) < Math.abs(Math.log(a.power / power)) ? b : a));
      expect(rodIdNow(id), id).toBe(nearest.id);
    }
    const back = fixSave({ ...newSave(), rods: ['rod_willow', 'rod_mirror', 'rod_mist', 'rod_moon', 'rod_gold'], rod: 'rod_moon' });
    expect(back.rods).toEqual(['rod_willow', 'rod_pro', 'rod_sea']);
    expect(back.rod).toBe('rod_sea');
    expect(new Angler(back).rig().rod.power).toBe(172);
    // (an old save without the willow gets it back; a rod held that is not one's own is put down)
    const bare = fixSave({ ...newSave(), rods: ['rod_brook'], rod: 'rod_tide' });
    expect(bare.rods).toEqual(['rod_willow', 'rod_swift']);
    expect(bare.rod).toBe('rod_willow');
  });
});

describe('sizes and colours', () => {
  it('the medals fall in their shares (the catches a size up): 28 % none, 34 % bronze, 22 % silver, 12 % gold, 4 % diamond', () => {
    const n = [0, 0, 0, 0, 0];
    const N = 20000;
    let k = 0;
    for (let i = 0; i < N; i++) {
      const f = FISH[i % 100];
      const u1 = ((i * 0.6180339887) % 1 + 1) % 1;
      const u2 = ((i * 0.7548776662 + 0.3) % 1 + 1) % 1;
      const s = rollLength(f, u1, u2);
      expect(s.cm).toBeLessThanOrEqual(f.cm[1] + 0.05);
      expect(s.cm).toBeGreaterThanOrEqual(f.cm[0] - 0.05);
      n[medalOf(s.q)]++;
      k++;
    }
    const share = n.map((x) => x / k);
    expect(share[0]).toBeGreaterThan(0.2);
    expect(share[0]).toBeLessThan(0.34);
    expect(share[1]).toBeGreaterThan(0.28);
    expect(share[2]).toBeGreaterThan(0.18);
    expect(share[3]).toBeGreaterThan(0.09);
    expect(share[4]).toBeGreaterThan(0.03);
    expect(share[4]).toBeLessThan(0.05);
  });

  it('about one catch in sixteen has a colour on a plain bait; better baits and clover raise it, never past three in ten', () => {
    const f = FISH[FISH_INDEX.get('crucian_carp')!];
    const plain = variantOdds(f, rigOf('spoon'));
    expect(1 - plain[0]).toBeGreaterThan(0.05);
    expect(1 - plain[0]).toBeLessThan(0.07);
    const best = variantOdds(f, rigOf('squid_strip'));
    expect(1 - best[0]).toBeGreaterThan(1 - plain[0]);
    expect(1 - best[0]).toBeLessThanOrEqual(0.3001);
    // the lords have no colours; the pity gives the fortieth plain catch one
    const lord = FISH[FISH_INDEX.get('old_pond_lord')!];
    expect(rollVariant(lord, rigOf('worm'), 0.0)).toBe(0);
    expect(rollVariant(f, { ...rigOf('worm'), pity: 39 }, 0.99)).toBe(1);
  });

  it('one bait to each tier, common to epic, and the star bait; a bait draws every fish of its tier and no other, whatever the fish eats; a lord only its own live fish; a celestial fish only the star bait in its moment', () => {
    expect(BAITS.map((b) => [b.id, b.tier])).toEqual([['worm', 0], ['spoon', 1], ['shrimp', 2], ['squid_strip', 3], ['stardust', STAR_TIER]]);
    // (the spoon the one lure: fished by winding it in)
    expect(BAITS.filter((b) => b.lure).map((b) => b.id)).toEqual(['spoon']);
    // (a rare fish that hunts takes the shrimp, and nothing else: what it eats is its nature, not the bait's say)
    const bass = FISH[FISH_INDEX.get('largemouth_bass')!];
    expect(bass.eats).toBe('lure');
    for (const b of ['worm', 'spoon', 'squid_strip', 'stardust']) expect(appetite(bass, 0.5, rigOf(b), cond(6)), b).toBe(0);
    expect(appetite(bass, 0.5, rigOf('shrimp'), cond(6))).toBeGreaterThan(0);
    // (every fish below the lords comes to every bait of its tier, and to no other)
    for (const f of FISH) {
      if (f.tier >= 4) continue;
      for (const b of BAITS) {
        const c = cond(12, { rain: f.weather === 'rain', ev: f.only ? [f.only] : [] });
        const a = appetite(f, 0.5, rigOf(b.id), c);
        if (b.tier === f.tier) expect(a, `${f.id} on ${b.id}`).toBeGreaterThan(0);
        else expect(a, `${f.id} on ${b.id}`).toBe(0);
      }
    }
    const lordI = FISH_INDEX.get('old_pond_lord')!;
    const lord = FISH[lordI];
    for (const b of BAITS) expect(appetite(lord, 0.5, rigOf(b.id), cond(18)), b.id).toBe(0);
    const s = newSave();
    s.live.bleak = 2;
    s.bait = 'live:bleak';
    expect(appetite(lord, 0.5, new Angler(s).rig(), cond(18))).toBeGreaterThan(0);
    expect(appetite(lord, 0.5, new Angler(s).rig(), cond(11))).toBe(0);
    // (a fish alive on the hook is the lords' bait: the rest leave it be)
    expect(appetite(FISH[FISH_INDEX.get('crucian_carp')!], 0.5, new Angler(s).rig(), cond(18))).toBe(0);
    const sky = FISH[FISH_INDEX.get('rainbow_fish')!];
    expect(appetite(sky, 0.5, rigOf('stardust'), cond(15))).toBe(0);
    expect(appetite(sky, 0.5, rigOf('stardust'), cond(15, { ev: ['rainbow'] }))).toBeGreaterThan(0);
  });

  it('a bait retired, or of no kind there is, comes back from a save as the bait of its tier there is', () => {
    const was: Record<string, number> = { dough: 0, worm: 0, corn: 1, cricket: 1, spoon: 1, malt: 2, shrimp: 2, spinner: 2, honey: 3, squid_strip: 3, softworm: 3, secret: 3, king_prawn: 3, feather: 3 };
    for (const [id, tier] of Object.entries(was)) expect(BAITS[baitIndexOf(id)], id).toBe(BAITS.find((b) => b.tier === tier));
    expect(BAITS[baitIndexOf('no_such_bait')].id).toBe('worm');
    expect(BAITS[baitIndexOf('stardust')].id).toBe('stardust');
    const back = fixSave({ ...newSave(), baits: { secret: 3, honey: 2, worm: 5, gone: 4, dough: 6, corn: 0, cricket: 2 }, bait: 'feather' });
    expect(back.baits).toEqual({ squid_strip: 5, worm: 15, spoon: 2 });
    expect(back.bait).toBe('squid_strip');
    expect(fixSave({ ...newSave(), bait: 'nothing' }).bait).toBe('worm');
    expect(fixSave({ ...newSave(), bait: 'live:bleak' }).bait).toBe('live:bleak');
    // (a rig made of a save's old bait is the bait it is now)
    expect(new Angler(fixSave({ ...newSave(), baits: { king_prawn: 2 }, bait: 'king_prawn' })).rig().bait.tier).toBe(3);
  });
});

describe('the fight', () => {
  const tempers: Temper[] = ['steady', 'runner', 'jumper', 'diver', 'brute', 'trick'];
  function params(ratio: number, tier: number, i = 0, cast = 20): FightParams {
    const q = 0.2 + 0.6 * ((i * 0.618) % 1);
    return fightParams({ ratio, pool: TIERS[tier].stamina * (0.75 + 0.5 * q), temper: tempers[i % 6], tier, feel: 0.7, cast, line: 0, reel: 0 });
  }
  function winRate(ratio: number, tier: number, robot: (typeof ROBOTS)[number], n = 150): { win: number; secs: number } {
    let won = 0;
    let secs = 0;
    for (let i = 0; i < n; i++) {
      const s = robotFight(params(ratio, tier, i), 10 + (i % 9), 4001 + i * 7919, robot);
      if (s.end === 'landed') {
        won++;
        secs += s.t;
      }
    }
    return { win: won / n, secs: won ? secs / won : 0 };
  }
  /** a fight played by fixed hands for so long; the state at the end */
  function hold(p: FightParams, hands: (s: FightState) => FightHands, secs: number, dist = 14, seed = 77): FightState {
    const s = startFight(dist, seed);
    for (let t = 0; t < secs && s.end === 'none'; t += 1 / 30) stepFight(s, p, hands(s), 1 / 30);
    return s;
  }

  it('anyone lands a common fish, in about ten seconds for a usual hand', () => {
    for (const r of ROBOTS) {
      const w = winRate(0.3, 0, r);
      expect(w.win, r.name).toBeGreaterThan(0.85);
      expect(w.secs, r.name).toBeLessThan(16);
    }
    const usual = winRate(0.3, 0, USUAL).secs;
    expect(usual).toBeGreaterThan(6);
    expect(usual).toBeLessThan(13);
  });

  it('the rarer, the longer; an epic fish a test, a lord on its own water’s rod a hard fight, and the better hand always does better', () => {
    const secs = [0, 1, 2, 3, 4].map((t) => winRate([0.3, 0.56, 0.82, 1.12, 1.6][t], t, USUAL, 90).secs);
    for (let t = 1; t < 5; t++) expect(secs[t], `tier ${t}`).toBeGreaterThan(secs[t - 1]);
    expect(secs[2]).toBeGreaterThan(18);
    expect(secs[2]).toBeLessThan(34);
    expect(secs[4]).toBeGreaterThan(50);
    expect(secs[4]).toBeLessThan(130);
    const epic = ROBOTS.map((r) => winRate(1.12, 3, r).win);
    const lord = ROBOTS.map((r) => winRate(1.6, 4, r).win);
    expect(epic[0]).toBeLessThan(epic[1] + 0.02);
    expect(epic[1]).toBeLessThan(epic[2] + 0.02);
    expect(lord[0]).toBeLessThan(lord[1]);
    expect(lord[1]).toBeLessThan(lord[2] + 0.02);
    expect(epic[1]).toBeGreaterThan(0.88);
    expect(lord[0]).toBeLessThan(0.45);
    // (a lord on its own water's rod is a hard fight: a usual hand loses about half; the user's word, 2026-11-24 — the
    // rod's tier tells)
    expect(lord[1]).toBeGreaterThan(0.3);
    expect(lord[1]).toBeLessThan(0.8);
    // the next water's rod (×1.6) makes a lord a fair fight for a usual hand
    expect(winRate(1.0, 4, USUAL).win).toBeGreaterThan(0.9);
  });

  it('only the rod against its run tires it: with it, or idle, it never tires', () => {
    const p = params(0.8, 2);
    // (the rod always against the way it swims, never reeling: it is spent)
    const against = hold(p, (s) => ({ reel: false, steer: -s.dir }), 60);
    expect(against.rounds).toBeGreaterThan(0);
    // (always with it, or in the middle)
    expect(hold(p, (s) => ({ reel: false, steer: s.dir }), 60).rounds).toBe(0);
    expect(hold(p, () => ({ reel: false, steer: 0 }), 60).rounds).toBe(0);
    expect(hold(p, () => ({ reel: false, steer: 0 }), 60).stamina).toBeGreaterThan(0.6);
  });

  it('spent is not landed: far out it lies still a moment, then fights another round; at one’s feet it can be landed', () => {
    const p = params(0.8, 2);
    // walked to a standstill out at 25 m, never reeled
    const s = startFight(25, 91);
    while (s.phase !== 'spent' && s.t < 90) stepFight(s, p, { reel: false, steer: -s.dir }, 1 / 30);
    expect(s.phase).toBe('spent');
    expect(s.landable).toBe(false);
    expect(landFight(s)).toBe(false);
    // (its window to be wound in: long enough to reel it from where it lies)
    for (let t = 0, w = p.spentFor + (0.8 * s.dist) / p.reel + 0.5; t < w; t += 1 / 30) stepFight(s, p, { reel: false, steer: 0 }, 1 / 30);
    expect(s.phase).not.toBe('spent');
    expect(s.stamina).toBeGreaterThan(0);
    // walked down and wound in: at the feet, spent, it comes up
    const u = startFight(14, 92);
    let landed = false;
    for (let t = 0; t < 120 && !landed; t += 1 / 30) {
      stepFight(u, p, { reel: u.phase === 'spent', steer: -u.dir }, 1 / 30);
      landed = landFight(u);
    }
    expect(landed).toBe(true);
    expect(u.end).toBe('landed');
    expect(u.dist).toBeLessThanOrEqual(LAND_AT);
  });

  it('it keeps its distance while it has its strength: wound in hard, it comes near only nearly spent (the user’s word, 2026-11-23)', () => {
    for (let i = 0; i < 9; i++) {
      const tier = i % 3;
      const p = params([0.3, 0.56, 0.82][tier], tier, i);
      const s = startFight(14, 500 + i);
      let nearAt = -1;
      let midway = 0;
      for (let t = 0; t < 150 && s.end === 'none'; t += 1 / 30) {
        // (DREADMOOR's way: the rod held over against it, wound in once spent)
        stepFight(s, p, { reel: s.phase === 'spent' || (s.dist > 0.7 * p.lineMax && s.tension < 0.4), steer: -s.dir }, 1 / 30);
        if (s.dist < 4 && nearAt < 0) nearAt = s.stamina;
        // (with half its strength left it is still well out)
        if (s.stamina > 0.45 && s.stamina < 0.55 && s.phase !== 'spent') midway = Math.max(midway, s.dist);
      }
      expect(nearAt, `tier ${tier}`).toBeGreaterThanOrEqual(0);
      expect(nearAt, `tier ${tier}`).toBeLessThan(0.5);
      expect(midway, `tier ${tier}`).toBeGreaterThan(5);
    }
    // (hooked at one's feet, it runs out at once to where it fights)
    const q = startFight(3, 9);
    for (let t = 0; t < 3; t += 1 / 30) stepFight(q, params(0.56, 1), { reel: false, steer: 0 }, 1 / 30);
    expect(q.dist).toBeGreaterThan(4);
  });

  it('left alone the line parts, a run takes line back even reeled against, and a rod far too weak all but loses the fish (the user’s word, 2026-11-24)', () => {
    // (never steered, never reeled: a rare fish parts the line within a minute)
    let parted = 0;
    for (let i = 0; i < 12; i++) if (hold(params(0.82, 2, i), () => ({ reel: false, steer: 0 }), 60, 14, 700 + i).end === 'snap') parted++;
    expect(parted).toBeGreaterThan(9);
    // (its first run, reeled against with the rod idle: it strips line all the same)
    const s = startFight(12, 31);
    const d0 = s.dist;
    for (let t = 0; t < 1; t += 1 / 30) stepFight(s, params(0.82, 2), { reel: true, steer: 0 }, 1 / 30);
    expect(s.dist).toBeGreaterThan(d0 + 0.2);
    // (a lord on a rod well below it: a usual hand all but always loses it to a parted line)
    expect(winRate(2.4, 4, USUAL, 60).win).toBeLessThan(0.35);
  });

  it('reeling against a fish that still pulls parts the line; let go, the strain falls', () => {
    const lord = params(1.6, 4);
    let snapped = 0;
    for (let i = 0; i < 20; i++) if (hold(lord, (s) => ({ reel: true, steer: -s.dir }), 60, 14, 300 + i).end === 'snap') snapped++;
    expect(snapped).toBeGreaterThan(15);
    // (never reeling, a common fish does not strain the line near the top for a while — DREADMOOR's rule: only reeling
    // and a fish let run far strain it; left alone long enough, it runs off and that parts it)
    const easy = hold(params(0.3, 0), (s) => ({ reel: false, steer: -s.dir }), 10);
    expect(easy.end).toBe('none');
    expect(easy.peak).toBeLessThan(RED_AT);
  });

  it('a strong move is told before it comes; a fish near the bank bolts once more', () => {
    // (a diver: its bores are told — its runs, its pulls left and right, are not)
    const p = params(1.1, 3, 3);
    const s = startFight(14, 5);
    let told = 0;
    let wasTell = false;
    let bolted = false;
    for (let t = 0; t < 200 && s.end === 'none'; t += 1 / 30) {
      stepFight(s, p, { reel: s.phase === 'spent' || (s.phase === 'swim' && s.tension < 0.6 && s.tell <= 0), steer: -s.dir }, 1 / 30);
      if (s.tell > 0 && !wasTell) told++;
      wasTell = s.tell > 0;
      if (s.bolted) bolted = true;
      if (landFight(s)) break;
    }
    expect(told).toBeGreaterThan(0);
    expect(bolted).toBe(true);
  });
});

describe('the pond', () => {
  it('stocks its capacity, by the shares, the same fish for the same day and others the next', () => {
    const p = new Pond(0, roundLake());
    p.stock(3);
    const cap = SPOTS[0].capacity;
    const lord = lordToday(0, 3) ? 1 : 0;
    expect(p.fish.length).toBe(cap + lord);
    const census = p.census();
    expect(census.tiers[0]).toBeGreaterThan(cap * 0.45);
    for (let t = 1; t <= 3; t++) expect(census.tiers[t], `tier ${t}`).toBeGreaterThanOrEqual(2);
    const a = p.fish.map((f) => `${f.f}:${f.cm}`).join();
    p.stock(3);
    expect(p.fish.map((f) => `${f.f}:${f.cm}`).join()).toBe(a);
    p.stock(4);
    expect(p.fish.map((f) => `${f.f}:${f.cm}`).join()).not.toBe(a);
  });

  it('every water is alike below its lord: the common to epic fish of all ten swim in each, every rarity there; the lord and the sky fish keep to their own', () => {
    expect([0, 1, 2, 3, 4, 5].map((t) => fishOfTier(t).length)).toEqual([30, 30, 20, 10, 10, 10]);
    for (let t = 0; t <= 5; t++) for (const i of fishOfTier(t)) expect(FISH[i].tier).toBe(t);
    expect(fishOfTier(6)).toEqual([]);
    for (let s = 0; s < SPOTS.length; s++) {
      const p = new Pond(s, roundLake());
      for (let day = 0; day < 4; day++) {
        p.stock(day);
        const tiers = p.census().tiers;
        for (let t = 0; t <= 3; t++) expect(tiers[t], `water ${s} day ${day} tier ${t}`).toBeGreaterThan(0);
        const waters = new Set(p.fish.filter((f) => FISH[f.f].tier <= 3).map((f) => FISH[f.f].spot));
        expect(waters.size, `water ${s} day ${day}`).toBeGreaterThan(3);
        for (const f of p.fish) if (FISH[f.f].tier >= 4) expect(FISH[f.f].spot).toBe(s);
      }
      expect(p.kindsOf(4).map((i) => FISH[i].spot)).toEqual([s]);
      expect(p.kindsOf(5).map((i) => FISH[i].spot)).toEqual([s]);
    }
  });

  it('which kind of a rarity a fish is, is chance: every kind comes in time, the first waters’ kinds the commonest (docs/V3/plan/fishing-feel.md §11)', () => {
    const seen = new Map<number, number>();
    const p = new Pond(4, roundLake());
    for (let day = 0; day < 120; day++) {
      p.stock(day);
      for (const f of p.fish) if (FISH[f.f].tier <= 3) seen.set(f.f, (seen.get(f.f) ?? 0) + 1);
    }
    for (let t = 0; t <= 3; t++) for (const i of fishOfTier(t)) expect(seen.get(i) ?? 0, FISH[i].id).toBeGreaterThan(0);
    const ofWater = (t: number, s: number) => fishOfTier(t).filter((i) => FISH[i].spot === s).reduce((a, i) => a + (seen.get(i) ?? 0), 0);
    expect(ofWater(0, 0)).toBeGreaterThan(1.4 * ofWater(0, 9));
    expect(ofWater(1, 0)).toBeGreaterThan(1.4 * ofWater(1, 9));
    // (a kind of the tenth water about half as common as one of the first)
    expect(kindWeight(FISH[fishOfSpot(9)[0]]) / kindWeight(FISH[fishOfSpot(0)[0]])).toBeCloseTo(1 / 2.08, 6);
  });

  it('a bait cast where no fish of its rarity is in reach has one brought in near the float: the pond’s own nearest, else one more of any water', () => {
    /**
     * A pond of the first water and a cast with this bait 12 m or so straight out; `ready` is done to the pond while the
     * float flies (where it comes down is known by then); the session waiting, and where its fish were before it landed.
     */
    const cast = (bait: string | Rig, ready: (p: Pond, to: { x: number; z: number }) => void = () => undefined) => {
      const pond = new Pond(0, roundLake(60, 5));
      pond.stock(2);
      const rig = typeof bait === 'string' ? rigOf(bait) : bait;
      const s = new Session(pond, { rig: () => rig, level: () => 1 }, 3);
      s.fan = false;
      s.aim = 0;
      const c = cond(12);
      s.press(true);
      for (let i = 0; i < 25; i++) s.step(1 / 30, c);
      s.press(false);
      expect(s.phase).toBe('flight');
      ready(pond, { x: s.float.toX, z: s.float.toZ });
      const before = pond.fish.map((f) => `${f.uid}:${f.x.toFixed(3)},${f.z.toFixed(3)}`);
      for (let i = 0; i < 90 && s.phase !== 'wait'; i++) s.step(1 / 30, c);
      expect(s.phase).toBe('wait');
      const near = (t: number) => pond.fish.filter((f) => FISH[f.f].tier === t && f.state === 'roam' && Math.hypot(f.x - s.float.x, f.z - s.float.z) <= 5.5);
      const now = pond.fish.map((f) => `${f.uid}:${f.x.toFixed(3)},${f.z.toFixed(3)}`);
      return { pond, before, now, near };
    };
    // (every fish of a rarity sent off to the far side of the water)
    const away = (t: number) => (p: Pond) => {
      for (const f of p.fish) if (FISH[f.f].tier === t) [f.x, f.z, f.hx, f.hz, f.tx, f.tz] = [-30, 30, -30, 30, -30, 30];
    };
    // worms, no common within reach: the nearest of the pond's commons is brought back near the float, none added
    const worms = cast('worm', away(0));
    expect(worms.near(0).length).toBe(1);
    expect(worms.now.length).toBe(worms.before.length);
    expect(worms.now.filter((x, i) => x !== worms.before[i]).length).toBe(1);
    // an epic bait with no epic fish left in the water at all: one more comes, of any water's epic kinds
    const honey = cast('squid_strip', (p) => {
      for (const f of p.fish.filter((x) => FISH[x.f].tier === 3)) p.land(f.uid);
    });
    expect(honey.near(3).length).toBe(1);
    expect(honey.now.length).toBe(honey.before.length + 1);
    expect(honey.near(3)[0].uid % 1000).toBeGreaterThanOrEqual(300);
    expect(fishOfTier(3)).toContain(honey.near(3)[0].f);
    // a common in reach already (put two metres from where the float comes down): nobody is brought
    const plain = cast('worm', (p, to) => {
      away(0)(p);
      const f = p.fish.find((x) => FISH[x.f].tier === 0)!;
      [f.x, f.z, f.hx, f.hz, f.tx, f.tz] = [to.x + 2, to.z, to.x + 2, to.z, to.x + 2, to.z];
    });
    expect(plain.near(0).length).toBe(1);
    expect(plain.now).toEqual(plain.before);
    // the star bait and a fish alive bring nobody: the sky's fish and the lords come by their own rules
    const star = cast('stardust', away(3));
    expect(star.now).toEqual(star.before);
    const save = newSave();
    save.live.bleak = 2;
    save.bait = 'live:bleak';
    const live = cast(new Angler(save).rig(), away(0));
    expect(live.now).toEqual(live.before);
  });

  it('a fish landed stays gone that day; the pond fills back while below half', () => {
    const p = new Pond(0, roundLake());
    p.stock(5);
    const n = p.fish.length;
    const uid = p.fish[0].uid;
    p.land(uid);
    p.stock(5, [...p.taken]);
    expect(p.fish.length).toBe(n - 1);
    expect(p.byUid(uid)).toBeNull();
    // empty it to under half and wait
    while (p.count() > SPOTS[0].capacity / 2 - 1) p.land(p.fish[0].uid);
    const before = p.count();
    for (let i = 0; i < 1600; i++) p.step(0.1, i * 0.1, 5, null, { active: false });
    expect(p.count()).toBeGreaterThan(before);
  });

  it('the lord is there most days and never away three days running', () => {
    for (let s = 0; s < SPOTS.length; s++) {
      let run = 0;
      let here = 0;
      for (let d = 0; d < 200; d++) {
        if (lordToday(s, d)) {
          here++;
          run = 0;
        } else run++;
        expect(run).toBeLessThan(3);
      }
      expect(here).toBeGreaterThan(110);
    }
  });
});

describe('a cast, from the thumb to the keepnet', () => {
  it('an auto-angler at the first pond catches fish all morning on the willow, all of them common as its worms are, of other waters too', () => {
    const angler = new Angler(newSave());
    const pond = new Pond(0, roundLake());
    pond.stock(0);
    const session = new Session(pond, { rig: () => angler.rig(), level: () => angler.level }, 1);
    const auto = new AutoAngler(session, angler, 7);
    const dt = 1 / 30;
    for (let t = 0; t < 900; t += dt) {
      const c = cond(8 + t / 60);
      pond.step(dt, t, 0, session.float.wet ? session.float : null, { active: false });
      session.step(dt, c);
      auto.step(dt, c, t);
    }
    // (a common fish of any water is a common fish's fight on the willow: hardly one lost)
    expect(auto.stats.catches).toBeGreaterThanOrEqual(15);
    expect(auto.stats.lost).toBeLessThan(auto.stats.catches / 5);
    expect(auto.stats.byTier[0]).toBe(auto.stats.catches);
    expect(angler.species()).toBeGreaterThanOrEqual(3);
    expect(new Set(Object.keys(angler.s.journal).map((id) => FISH[FISH_INDEX.get(id)!].spot)).size).toBeGreaterThan(1);
    expect(angler.s.net.length + angler.s.stats.released).toBeGreaterThan(0);
  });

  it('a bait of a tier only ever hooks fish of that tier, and fish of other waters come to it', () => {
    const baits = ['worm', 'spoon', 'shrimp', 'squid_strip'];
    const dt = 1 / 30;
    let strangers = 0;
    for (let k = 0; k <= 3; k++) {
      // (each tier at a water of its own, on the rod of its rarity, all day)
      const spot = k * 3;
      const save = newSave();
      save.baits[baits[k]] = 999;
      save.bait = baits[k];
      save.rods.push(RODS[REC_ROD[k]].id);
      save.rod = RODS[REC_ROD[k]].id;
      const angler = new Angler(save);
      const pond = new Pond(spot, roundLake());
      pond.stock(1);
      const session = new Session(pond, { rig: () => angler.rig(), level: () => angler.level }, 31 + k);
      const auto = new AutoAngler(session, angler, 17 + k);
      const hooked: number[] = [];
      let on = -1;
      for (let t = 0; t < 600; t += dt) {
        const c = cond(9 + t / 60, { day: 1 });
        pond.step(dt, t, 1, session.float.wet ? session.float : null, { active: false });
        session.step(dt, c);
        auto.step(dt, c, t);
        const h = session.hooked;
        if (h && h.uid !== on) {
          on = h.uid;
          hooked.push(h.f);
        }
      }
      expect(hooked.length, `tier ${k}`).toBeGreaterThanOrEqual(4);
      for (const f of hooked) expect(FISH[f].tier, `${baits[k]} hooked ${FISH[f].id}`).toBe(k);
      expect(auto.stats.byTier.reduce((a, b) => a + b, 0), `tier ${k}`).toBe(auto.stats.byTier[k]);
      strangers += hooked.filter((f) => FISH[f].spot !== spot).length;
    }
    expect(strangers).toBeGreaterThan(4);
  });

  it('the same thumb on the same water brings the same fish', () => {
    const run = (): string => {
      const angler = new Angler(newSave());
      const pond = new Pond(1, roundLake(50, 4));
      pond.stock(2);
      const session = new Session(pond, { rig: () => angler.rig(), level: () => angler.level }, 9);
      const auto = new AutoAngler(session, angler, 3);
      const got: string[] = [];
      const dt = 1 / 30;
      for (let t = 0; t < 300; t += dt) {
        const c = cond(7 + t / 60, { day: 2 });
        pond.step(dt, t, 2, session.float.wet ? session.float : null, { active: false });
        session.step(dt, c);
        const card = auto.step(dt, c, t);
        if (card) got.push(`${FISH[card.fish].id}:${card.cm}`);
      }
      return got.join();
    };
    const a = run();
    expect(a.length).toBeGreaterThan(0);
    expect(run()).toBe(a);
  });
});

describe('a lure, wound in; a still bait, kept still', () => {
  /** a session at the first pond with this on the hook, cast out 14 m; the hands each step; what it said */
  function fish(bait: string, hands: (s: Session, t: number) => void, secs: number, seed = 5): { events: string[]; s: Session } {
    const pond = new Pond(0, roundLake(60, 5));
    pond.stock(1);
    const rig = rigOf(bait);
    const s = new Session(pond, { rig: () => rig, level: () => 1 }, seed);
    s.fan = false;
    s.aim = 0;
    const c = cond(7);
    const dt = 1 / 30;
    s.press(true);
    for (let i = 0; i < 25; i++) s.step(dt, c);
    s.press(false);
    const events: string[] = [];
    for (let t = 0; t < secs; t += dt) {
      pond.step(dt, t, 1, s.phase === 'wait' && s.float.wet ? s.float : null, { active: false });
      hands(s, t);
      s.step(dt, c);
      for (const e of s.events) events.push(e.type === 'lostInterest' ? `lostInterest:${e.why}` : e.type);
      s.events.length = 0;
      if (s.phase === 'fight' || s.phase === 'idle') break;
    }
    return { events, s };
  }

  it('a lure lying still draws nothing; wound in at an even pace a hunter follows it and strikes; the hook is set by holding on', () => {
    // (left lying: nobody follows it)
    expect(fish('spoon', () => undefined, 20).events).not.toContain('follow');
    // (held a while, let go a moment: an even pace — over a few casts, a hunter follows and takes it)
    let hooked = 0;
    let followed = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const r = fish('spoon', (s, t) => s.press(s.committed?.state === 'bite' || t % 1.25 < 0.85), 40, seed);
      if (r.events.includes('follow')) followed++;
      if (r.events.includes('hook')) hooked++;
    }
    expect(followed).toBeGreaterThan(6);
    expect(hooked).toBeGreaterThan(4);
  });

  it('wound in too fast, the hunter is left behind; the lure comes in to one’s feet and the cast is over', () => {
    let fast = 0;
    for (let seed = 1; seed <= 12; seed++) {
      // (held down the whole way)
      const r = fish('spoon', (s) => s.press(true), 40, seed);
      if (r.events.includes('lostInterest:fast')) fast++;
      expect(r.events.includes('hook') && !r.events.includes('follow')).toBe(false);
      expect(r.s.phase === 'idle' || r.s.phase === 'retrieve' || r.s.phase === 'fight').toBe(true);
    }
    expect(fast).toBeGreaterThan(0);
  });

  it('a fish at a still bait is scared off by the view turned hard', () => {
    let spooked = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const r = fish('worm', (s) => {
        // (turning the view round as soon as one comes)
        s.jiggle = s.committed && (s.committed.state === 'come' || s.committed.state === 'nibble') ? 5 : 0;
      }, 40, seed);
      if (r.events.includes('spooked')) spooked++;
      expect(r.events).not.toContain('hook');
    }
    expect(spooked).toBeGreaterThan(5);
  });
});

describe('the angler', () => {
  it('a day begins at five; the clock and its inverse agree', () => {
    expect(clockOf(0).day).toBe(0);
    const t = timeOf(3, 4.5);
    expect(clockOf(t).day).toBe(3);
    expect(clockOf(t).hour).toBeCloseTo(4.5, 5);
    expect(clockOf(timeOf(3, 5.01)).day).toBe(3);
    expect(clockOf(timeOf(3, 23)).day).toBe(3);
  });

  it('the journal remembers the first, the records and the colours; the orders count and pay once', () => {
    const a = new Angler(newSave());
    const crucian = FISH_INDEX.get('crucian_carp')!;
    a.orders(0, 0);
    a.s.orders.list[0] = { kind: 'count', fish: crucian, n: 2, min: 0, have: 0, coins: 50, done: false };
    const c1 = a.finish({ uid: 1, fish: crucian, cm: 20, kg: 0.2, q: 0.3, perfect: true, secs: 9 }, false, 0, 0.5);
    expect(c1.first).toBe(true);
    const c2 = a.finish({ uid: 2, fish: crucian, cm: 25, kg: 0.3, q: 0.5, perfect: false, secs: 9 }, false, 0, 0.5);
    expect(c2.first).toBe(false);
    expect(c2.record).toBe(true);
    expect(a.s.journal.crucian_carp.n).toBe(2);
    const coins = a.s.coins;
    expect(a.claim().length).toBe(1);
    expect(a.s.coins).toBe(coins + 50);
    expect(a.claim().length).toBe(0);
    expect(a.unlocks().charms).toContain('bell');
  });

  it('the hut sells by its water, a licence needs the water before known, and a save survives being read back', () => {
    const a = new Angler(newSave());
    expect(a.baitsHere()).toContain('worm');
    expect(a.baitsHere()).not.toContain('shrimp');
    expect(a.canEnter(1).ok).toBe(false);
    for (const i of fishOfSpot(0).slice(0, 6)) a.s.journal[FISH[i].id] = { n: 1, cm: 1, kg: 1, medal: 0, vars: 1, day: 0 };
    a.s.coins = 5000;
    expect(a.buyLicence(1)).toBe(true);
    expect(a.travel(1)).toBe(true);
    expect(a.rodsHere()).toEqual(['rod_swift']);
    expect(a.buyRod('rod_pro')).toBe(false);
    expect(a.buyRod('rod_swift')).toBe(true);
    expect(a.rig().rod.power).toBe(26);
    const back = fixSave(JSON.parse(JSON.stringify(a.s)));
    expect(back.spot).toBe(1);
    expect(back.rods).toContain('rod_swift');
    expect(back.rod).toBe('rod_swift');
    // (the night rod is not sold: ten orders done earn it)
    expect(a.unlocks().rods).toEqual([]);
    a.s.stats.orders = 10;
    expect(a.unlocks().rods).toEqual(['rod_heron']);
  });

  it('each water’s moment comes every other day in its hours; the dream only after the other nine', () => {
    let seen = 0;
    for (let d = 0; d < 4; d++) for (let h = 0; h < 24; h += 0.5) if (skyMoment(0, d, h, () => false)) seen++;
    expect(seen).toBeGreaterThan(0);
    expect(skyMoment(9, 0, 22, () => false)).toBe(false);
    expect(skyMoment(9, 1, 22, () => true) || skyMoment(9, 0, 22, () => true)).toBe(true);
    const n = nextMoment(3, 0, 12);
    expect((n.day + 3) % 2).toBe(0);
    expect(makeOrders(2, 5).length).toBe(3);
    expect(makeOrders(2, 5)).toEqual(makeOrders(2, 5));
  });
});
