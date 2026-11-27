/**
 * The fishing module as the game has it (docs/V3/plan/fishing.md), in plain Node: its things in the catalogue (every
 * fish a thing, the rods holding their bait, the creel its fish, the fish in the kitchen's larder), the module
 * installed into the stand-in game with its slice, what the angler has caught worked out and kept (log.ts), the
 * session cast from wherever one stands, and the fish's models named by their colour and size. The browser side —
 * a cast, a bite, a fish swung onto the boards and picked up, the hands' own uses, a lord on its live bait, a sky
 * fish in its moment, all ten waters — is harness/shots/fishing.mjs.
 */
import { describe, expect, it } from 'vitest';
import { cleanItem, hasItem, itemCatalogueProblems, itemDef, itemIdNow, itemModelOf, newItem } from '../../src/core/modcar/items';
import { ingredient } from '../../src/core/v3/cooking/ingredients';
import { FISH } from '../../src/core/v3/fishing/lite/fish';
import { BAITS, RODS } from '../../src/core/v3/fishing/lite/gear';
import { BAIT_TAG, canGoLive, CREEL, fishItem, fishModelOf, fishOfItem, FISHING_ITEMS, PANTRY_BAIT, rodOfItem } from '../../src/core/v3/fishing/lite/items';
import { bottleNote, cleanLog, crateContents, newLog, rigOf, settle } from '../../src/core/v3/fishing/lite/log';
import { Pond, roundLake } from '../../src/core/v3/fishing/lite/pond';
import { Session, type SessionHost } from '../../src/core/v3/fishing/lite/session';
import type { Conditions } from '../../src/core/v3/fishing/lite/types';
import { registerSkill, skills, xpForLevel } from '../../src/core/v3/progress/progress';
import fishingModule, { fishing } from '../../src/game/modcar/v3/fishing/index';
import { isFishModel, modelLength } from '../../src/game/modcar/v3/fishing/models';
import { gainXp, progress } from '../../src/game/modcar/v3/progress/api';
import progressModule from '../../src/game/modcar/v3/progress/index';
import { FakeGame } from './v3/fakeGame';

// (a skill of the test's own, standing for the game's other skills)
registerSkill({ id: 'tf_forage', name: { zh: '试验采集', en: 'Test foraging' }, perks: [{ id: 'tf_forage_glow', level: 5, name: { zh: '发光', en: 'Glow' }, blurb: { zh: '亮。', en: 'Bright.' } }] });

const NOON: Conditions = { day: 3, hour: 12, rain: false, clear: true, fog: false, storm: false, snow: false, events: new Set() };

describe('the fishing module: its things', () => {
  it('every fish, rod and bait is a thing of the catalogue, and the catalogue is sound', () => {
    for (let i = 0; i < FISH.length; i++) expect(hasItem(fishItem(i)), FISH[i].id).toBe(true);
    for (const r of RODS) expect(hasItem(r.id), r.id).toBe(true);
    for (const b of BAITS) expect(hasItem(`bait_${b.id}`), b.id).toBe(true);
    // (and the two baits out of the larder: a loaf and a cob pulled apart — docs/V3/plan/finish.md §九)
    expect(FISHING_ITEMS.length).toBe(FISH.length + RODS.length + BAITS.length + Object.keys(PANTRY_BAIT).length + 6);
    const ours = itemCatalogueProblems().filter((p) => /fish_|rod_|bait_|fishing_/.test(p));
    expect(ours).toEqual([]);
  });

  it('a bait of a save retired since, or of no kind there is, is read back as the bait of its tier there is (on a rod too)', () => {
    const loss = { unknown: 0 };
    const old = cleanItem({ uid: 'i9001', item: 'bait_secret', n: 4 }, loss)!;
    expect(old.item).toBe('bait_squid_strip');
    expect(old.n).toBe(4);
    expect(cleanItem({ uid: 'i9002', item: 'bait_no_such_bait', n: 7 }, loss)!.item).toBe('bait_worm');
    const rod = cleanItem({ uid: 'i9003', item: 'rod_willow', inside: [{ uid: 'i9004', item: 'bait_feather' }] }, loss)!;
    expect(rod.inside?.map((x) => x.item)).toEqual(['bait_squid_strip']);
    expect(itemIdNow('bait_king_prawn')).toBe('bait_squid_strip');
    expect(itemIdNow('bait_dough')).toBe('bait_worm');
    expect(itemIdNow('bait_corn')).toBe('bait_spoon');
    expect(itemIdNow('bait_cricket')).toBe('bait_spoon');
    expect(itemIdNow('bait_malt')).toBe('bait_shrimp');
    expect(itemIdNow('bait_spinner')).toBe('bait_shrimp');
    expect(itemIdNow('bait_honey')).toBe('bait_squid_strip');
    expect(itemIdNow('bait_softworm')).toBe('bait_squid_strip');
    // (what is no bait is no business of the fishing's)
    expect(cleanItem({ uid: 'i9005', item: 'no_such_thing' }, loss)).toBeNull();
    expect(loss.unknown).toBe(1);
  });

  it('a rod of a save retired since is read back as the rod nearest it in power, its bait on it too; a rod of no kind there ever was is no thing', () => {
    const loss = { unknown: 0 };
    const rod = cleanItem({ uid: 'i9011', item: 'rod_mirror', inside: [{ uid: 'i9012', item: 'bait_corn', n: 9 }] }, loss)!;
    expect(rod.item).toBe('rod_pro');
    expect(rod.inside?.map((x) => `${x.item}x${x.n}`)).toEqual(['bait_spoonx9']);
    const moon = cleanItem({ uid: 'i9013', item: 'rod_moon', state: { rod: { live: { f: 'bleak', cm: 11, kg: 0.012, q: 0.3, v: 0 } } } }, loss)!;
    expect(moon.item).toBe('rod_sea');
    expect(moon.state?.rod?.live?.f).toBe('bleak');
    expect(itemIdNow('rod_reed')).toBe('rod_willow');
    expect(itemIdNow('rod_brook')).toBe('rod_swift');
    expect(itemIdNow('rod_vine')).toBe('rod_heron');
    expect(itemIdNow('rod_frost')).toBe('rod_sea');
    expect(itemIdNow('rod_heron')).toBe('rod_heron');
    expect(cleanItem({ uid: 'i9014', item: 'rod_no_such_rod' }, loss)).toBeNull();
    expect(loss.unknown).toBe(1);
  });

  it('a rod holds one stack of bait, the creel holds fish, a fish goes off into the kitchen\'s spoiled food', () => {
    for (const r of RODS) {
      const h = itemDef(r.id).holds!;
      expect(h.slots).toBe(1);
      expect(h.accepts).toEqual([`#${BAIT_TAG}`]);
    }
    expect(itemDef(CREEL).holds!.accepts).toEqual(['fish']);
    for (let i = 0; i < FISH.length; i++) {
      const d = itemDef(fishItem(i));
      expect(d.perish?.into).toBe('ing_spoiled');
      expect(d.stack ?? 1).toBe(1);
    }
    // (the lords' own live fish can always go onto a hook)
    for (const f of FISH) if (f.live) expect(canGoLive(FISH.findIndex((x) => x.id === f.live)), f.live).toBe(true);
  });

  it('a fish caught goes into a pot: every one is an ingredient of the kitchen', () => {
    for (let i = 0; i < FISH.length; i++) {
      const ing = ingredient(fishItem(i));
      expect(ing, FISH[i].id).not.toBeNull();
      expect(ing!.raw).toBe(false);
    }
    expect(ingredient('fish_crayfish')?.cls).toBe('shellfish');
  });

  it('a fish caught is drawn in its colour and at its size; its kind\'s model otherwise', () => {
    const plain = newItem('fish_carp');
    expect(itemModelOf(plain)).toBe('fish_carp');
    const gold = newItem('fish_carp', { state: { fish: { cm: 70, kg: 5, q: 0.8, v: 4, m: 3 } } });
    expect(fishModelOf(gold)).toBe('fish_carp@4.3');
    expect(itemModelOf(gold)).toBe('fish_carp@4.3');
    expect(isFishModel('fish_carp@4.3')).toBe(true);
    expect(isFishModel('fish_nothing@1.1')).toBe(false);
    const i = fishOfItem('fish_carp');
    for (let m = 1; m <= 4; m++) expect(modelLength(i, m)).toBeGreaterThan(modelLength(i, m - 1));
    expect(itemModelOf(newItem('rod_willow'))).toBe('rod_cane');
    expect(itemModelOf(newItem('rod_sea'))).toBe('rod_heavy');
    expect(rodOfItem('rod_sea')).toBe(3);
    expect(rodOfItem('rod_moon')).toBe(-1);
  });
});

describe('the fishing module in the game', () => {
  it('installs: its system, its slice and its tab; what it keeps comes back from the save', async () => {
    const game = await new FakeGame([fishingModule]).start();
    expect(game.reports).toEqual([]);
    expect(game.systems.get('fishing')).toBe(fishing);
    expect(game.slices.ids).toContain('fishing');
    // nothing caught: nothing saved
    fishing.log = newLog();
    const slice = (fishingModule.slices ?? []).find((s) => s.id === 'fishing')!;
    expect(slice.snapshot()).toBeUndefined();
    fishing.log.kinds.carp = { n: 2, cm: 61, kg: 3.1, medal: 2, vars: 1 };
    fishing.log.stats.casts = 5;
    const saved = JSON.parse(JSON.stringify(slice.snapshot()));
    slice.clear?.();
    expect(fishing.log.stats.casts).toBe(0);
    slice.restore(saved, 1);
    expect(fishing.log.kinds.carp.n).toBe(2);
    expect(fishing.log.stats.casts).toBe(5);
  });

  it('has no skill (the user\'s word, 2026-11-24): a save with fishing\'s old experience still loads, the other skills keep theirs', async () => {
    expect(skills().map((s) => s.id)).not.toContain('fishing');
    const save = { hour: 9, slices: { progress: { v: 1, d: { xp: { fishing: 2400, tf_forage: xpForLevel(5) }, entries: [{ d: 'fish', id: 'carp', s: 1, n: 3 }] } } } };
    const game = await new FakeGame([progressModule, fishingModule], save).start();
    expect(game.reports).toEqual([]);
    expect(progress.level('tf_forage')).toBe(5);
    expect(progress.hasPerk('tf_forage_glow')).toBe(true);
    expect(progress.entry('fish', 'carp')?.count).toBe(3);
    // (another skill still grows and says so; what the save held under fishing's name is kept, and read by nothing)
    expect(gainXp(game.ctx, 'tf_forage', xpForLevel(6) - xpForLevel(5))).toBe(1);
    expect(game.saved().slices?.progress).toMatchObject({ d: { xp: { fishing: 2400, tf_forage: xpForLevel(6) } } });
  });
});

describe('what the angler has caught', () => {
  it('a first catch, then a record; the streak of perfect strikes; no experience', () => {
    const log = newLog();
    const carp = FISH.findIndex((f) => f.id === 'carp');
    const rig = rigOf(0, { kind: 'bait', bait: 0 }, log);
    const a = settle(log, { uid: 1, fish: carp, cm: 50, kg: 2, q: 0.3, perfect: true, secs: 9 }, rig, 0.99);
    expect(a.first).toBe(true);
    expect(a.record).toBe(false);
    expect(a.state.first).toBe(1);
    expect(a.state.p).toBe(1);
    expect(log.streak).toBe(1);
    const b = settle(log, { uid: 2, fish: carp, cm: 62, kg: 3.5, q: 0.55, perfect: false, secs: 11 }, rig, 0.99);
    expect(b.first).toBe(false);
    expect(b.record).toBe(true);
    expect(log.streak).toBe(0);
    expect(log.kinds.carp.n).toBe(2);
    expect(log.kinds.carp.cm).toBe(62);
    expect(b.state.m).toBe(2);
    // (fishing has no levels: a catch comes to the fish and its news, nothing to learn from it)
    expect(a).not.toHaveProperty('xp');
    expect(b).not.toHaveProperty('xp');
  });

  it('a save of any shape comes back as a sound log; a bottle names its water\'s lord; a crate holds something', () => {
    expect(cleanLog(null)).toEqual(newLog());
    const junk = cleanLog({ kinds: { carp: { n: 'x' }, nothing: { n: 3 } }, ponds: { sakura_pond: { day: 2, taken: [900, 'a', 5] }, elsewhere: {} }, streak: -3, clues: ['old_pond_lord', 'who'] });
    expect(junk.kinds.carp.n).toBe(0);
    expect(junk.kinds.nothing).toBeUndefined();
    expect(junk.ponds.sakura_pond.taken).toEqual([900, 5]);
    expect(junk.ponds.elsewhere).toBeUndefined();
    expect(junk.streak).toBe(0);
    expect(junk.clues).toEqual(['old_pond_lord']);
    // (the bait last fished with: a retired one comes back as the one it went into, one of no kind there is as the worm)
    expect(cleanLog({ lastBait: 'shrimp' }).lastBait).toBe('shrimp');
    expect(cleanLog({ lastBait: 'corn' }).lastBait).toBe('spoon');
    expect(cleanLog({ lastBait: 'feather' }).lastBait).toBe('squid_strip');
    expect(cleanLog({ lastBait: 'no_such_bait' }).lastBait).toBe('worm');
    expect(cleanLog({ lastBait: 7 }).lastBait).toBeUndefined();
    expect(bottleNote(0, 0.3).lord).toBe('old_pond_lord');
    expect(bottleNote(0, 0.3).text).toContain('白条');
    for (let s = 0; s < 10; s++) expect(crateContents(s, 0.42).length).toBeGreaterThan(0);
  });
});

describe('a cast from wherever one stands', () => {
  it('goes out from the angler along the aim, and comes back to the angler; abort ends it at once', () => {
    const pond = new Pond(0, roundLake(70, 5));
    const log = newLog();
    const rig = rigOf(1, { kind: 'bait', bait: 0 }, log);
    const s = new Session(pond, { rig: () => rig, level: () => 1 }, 7);
    s.fan = false;
    s.angler.x = 6;
    s.angler.z = 4;
    s.aim = 0.4;
    s.press(true);
    for (let i = 0; i < 70; i++) s.step(1 / 60, NOON);
    s.press(false);
    for (let i = 0; i < 120; i++) s.step(1 / 60, NOON);
    expect(s.phase).toBe('wait');
    const reach = Session.reach(rig.rod.cast, 1);
    const fx = s.float.x - 6;
    const fz = s.float.z - 4;
    expect(Math.abs(Math.hypot(fx, fz) - reach)).toBeLessThan(1.5);
    expect(Math.abs(Math.atan2(fx, fz) - 0.4)).toBeLessThan(0.12);
    s.abort();
    expect(s.phase).toBe('idle');
    expect(s.float.wet).toBe(false);
  });

  it('a tap while the bait waits twitches it from the first cast: the game hands the session no level', () => {
    const rig = rigOf(1, { kind: 'bait', bait: 0 }, newLog());
    const twitches = (host: SessionHost): boolean => {
      const s = new Session(new Pond(0, roundLake(70, 5)), host, 7);
      s.fan = false;
      s.press(true);
      for (let i = 0; i < 70; i++) s.step(1 / 60, NOON);
      s.press(false);
      for (let i = 0; i < 120; i++) s.step(1 / 60, NOON);
      expect(s.phase).toBe('wait');
      expect(s.committed).toBeNull();
      s.events.length = 0;
      s.press(true);
      s.press(false);
      return s.events.some((e) => e.type === 'twitch');
    };
    expect(twitches({ rig: () => rig })).toBe(true);
    // (the first build's angler, which keeps a level, has it from 3 as it did)
    expect(twitches({ rig: () => rig, level: () => 1 })).toBe(false);
  });
});
