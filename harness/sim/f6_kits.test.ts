/**
 * F6 (docs/V3/plan/finish.md §二): the journey in chapters, and the sets that come apart. The plan of a world of
 * version 7 puts each chapter's new things within its kilometres, a set's main thing by itself; what goes with it
 * comes after it has been picked up — two to five kilometres on, a step at a time — is kept back everywhere until
 * then, and comes again when it is driven past.
 */
import { describe, expect, it } from 'vitest';
import { CHAPTER_KM, chapterAt } from '../../src/core/modcar/crafting';
import { hasItem } from '../../src/core/modcar/items';
import { KIT_AFTER_KM, KIT_MISSED_M, kitBegun, kitDef, kitHeld, kitOf, kitPicked, KITS, kitsPassed, kitWanting, thingKey, type KitsState } from '../../src/core/modcar/kits';
import { hasPart } from '../../src/core/modcar/parts';
import { fitToPlaces, NOVELTY_GAP_KM, placesPlan, plan, SCHEDULE, SCHEDULE_V7, scheduleOf, SitePlanner, type PlannedFind, type PlanPlace } from '../../src/core/modcar/schedule';
import { planPlaces } from '../../src/game/modcar/places';
import { modcarWorld } from '../../src/game/modcar/seamless';
// (the modules' own things — the kitchen's, the fishing's — registered as the game installs them)
import.meta.glob('../../src/game/modcar/v3/*/index.ts', { eager: true });
import '../../src/core/v3/nd/cards';

const exists = (key: string): boolean => (key.startsWith('part:') ? hasPart(key.slice(5)) : hasItem(key));

describe('F6: the sets', () => {
  it('every thing of every set is a thing of the game, and of one set only', () => {
    const seen = new Map<string, string>();
    for (const k of KITS) {
      const all = [k.main, ...k.steps.flatMap((s) => s.things)].map(thingKey);
      for (const key of [...all, ...(k.held ?? [])]) {
        expect(exists(key), `${k.id}: ${key}`).toBe(true);
        expect(seen.get(key) ?? k.id, key).toBe(k.id);
        seen.set(key, k.id);
      }
      expect(k.steps.length).toBeGreaterThan(0);
      expect(kitOf(thingKey(k.main))).toMatchObject({ index: 0 });
    }
    expect(KITS.map((k) => k.id)).toEqual(['coffee', 'cooking', 'garden', 'fishing', 'treasure', 'refit', 'photo', 'music']);
  });

  it('the coffee: the machine picked up, its pot comes two to five kilometres on; the pot picked up, the beans; then it is whole', () => {
    const st: KitsState = {};
    // (the pot before the machine — come by some other way: not the set's doing)
    expect(kitPicked(st, 'coffee_pot', 30_000, 7)).toEqual([]);
    expect(st.coffee?.got ?? 0).toBe(0);
    const pot = kitPicked(st, 'nd_coffee_machine', 32_000, 7);
    expect(pot.map((f) => thingKey(f.thing))).toEqual(['coffee_pot']);
    expect(pot[0].s).toBeGreaterThanOrEqual(32_000 + KIT_AFTER_KM[0] * 1000);
    expect(pot[0].s).toBeLessThanOrEqual(32_000 + KIT_AFTER_KM[1] * 1000);
    expect(pot[0].themes).toContain('house');
    expect(pot[0].novelty).toBe(false);
    expect(st.coffee).toMatchObject({ got: 1, out: { step: 1, s: pot[0].s, n: 0 } });
    // another machine picked up changes nothing
    expect(kitPicked(st, 'nd_coffee_machine', 33_000, 7)).toEqual([]);
    const beans = kitPicked(st, 'coffee_pot', 35_500, 7);
    expect(beans.map((f) => thingKey(f.thing))).toEqual(['nd_coffee_pack']);
    expect(beans[0].s).toBeGreaterThanOrEqual(37_500);
    expect(beans[0].s).toBeLessThanOrEqual(40_500);
    expect(kitPicked(st, 'nd_coffee_pack', 39_000, 7)).toEqual([]);
    expect(st.coffee).toEqual({ got: 3, main: 32_000 });
    // the same game, the same places: the same every time
    const again: KitsState = {};
    expect(kitPicked(again, 'nd_coffee_machine', 32_000, 7)).toEqual(pot);
    // another game: another distance
    const other: KitsState = {};
    expect(kitPicked(other, 'nd_coffee_machine', 32_000, 8)[0].s).not.toBe(pot[0].s);
  });

  it('a step that belongs to a later chapter waits for it: the soup pot and the board not before the 50th km, the polisher not before the 105th', () => {
    const st: KitsState = {};
    kitPicked(st, 'kit_stove', 40_000, 7);
    kitPicked(st, 'kit_gas', 43_000, 7);
    // (the pan and the seasonings come together: either picked up is the step taken)
    const next = kitPicked(st, 'kit_spice', 44_000, 7);
    expect(next.map((f) => thingKey(f.thing)).sort()).toEqual(['kit_board', 'kit_pot']);
    expect(next[0].s).toBeGreaterThanOrEqual(50_000);
    expect(kitPicked(st, 'kit_pan', 44_100, 7)).toEqual([]);
    const refit: KitsState = {};
    kitPicked(refit, 'nd_grinder', 68_000, 7);
    const pol = kitPicked(refit, 'nd_battery', 70_000, 7);
    expect(thingKey(pol[0].thing)).toBe('nd_polisher');
    expect(pol[0].s).toBeGreaterThanOrEqual(105_000);
    expect(kitDef('refit').steps[1].fromKm).toBe(105);
  });

  it('kept back until the set has come that far — but never what one has other uses for', () => {
    const st: KitsState = {};
    for (const key of ['coffee_pot', 'nd_coffee_pack', 'kit_gas', 'kit_pan', 'kit_plate', 'nd_seeds_tomato', 'nd_seeds_apple', 'fishing_creel', 'bait_worm', 'nd_film_pack', 'nd_tape_01', 'nd_polisher', 'nd_key_1']) expect(kitHeld(st, key), key).toBe(true);
    // (a battery, a shovel, a bucket: the torch wants the one, a chest in the ground the other)
    for (const key of ['nd_battery', 'nd_shovel', 'nd_bucket']) expect(kitHeld(st, key), key).toBe(false);
    // the main things themselves, and what is of no set
    for (const key of ['nd_coffee_machine', 'kit_stove', 'rod_willow', 'part:radio_old', 'nd_crowbar', 'drink_water']) expect(kitHeld(st, key), key).toBe(false);
    kitPicked(st, 'nd_coffee_machine', 32_000, 7);
    expect(kitHeld(st, 'coffee_pot')).toBe(false);
    // (a step at a time: the beans wait for the pot)
    expect(kitHeld(st, 'nd_coffee_pack')).toBe(true);
    kitPicked(st, 'coffee_pot', 35_000, 7);
    expect(kitHeld(st, 'nd_coffee_pack')).toBe(false);
    // (another set's still kept back)
    expect(kitHeld(st, 'kit_gas')).toBe(true);
    // what it uses up, from when its main thing is one's own
    kitPicked(st, 'rod_willow', 78_000, 7);
    expect(kitHeld(st, 'bait_worm')).toBe(false);
  });

  it('a set begun: another of its main thing down the road is one too many', () => {
    const st: KitsState = {};
    expect(kitBegun(st, 'nd_coffee_machine')).toBe(false);
    kitPicked(st, 'nd_coffee_machine', 32_000, 7);
    expect(kitBegun(st, 'nd_coffee_machine')).toBe(true);
    expect(kitBegun(st, 'coffee_pot')).toBe(false);
    expect(kitBegun(st, 'kit_stove')).toBe(false);
    expect(kitBegun(st, 'nd_crowbar')).toBe(false);
  });

  it('a step driven past comes again further on', () => {
    const st: KitsState = {};
    const first = kitPicked(st, 'nd_plant_pot', 52_000, 7)[0];
    // (not yet: within three kilometres past where it was due one may still be about)
    expect(kitsPassed(st, first.s + KIT_MISSED_M - 1, 7)).toEqual([]);
    const again = kitsPassed(st, first.s + KIT_MISSED_M + 10, 7);
    expect(again.map((f) => thingKey(f.thing))).toEqual(['nd_seeds_tomato']);
    expect(again[0].s).toBeGreaterThanOrEqual(first.s + KIT_MISSED_M + 10 + 2000);
    expect(st.garden.out).toMatchObject({ step: 1, n: 1, s: again[0].s });
    // (and once more, if that one is driven past as well)
    expect(kitsPassed(st, again[0].s + KIT_MISSED_M + 10, 7).length).toBe(1);
    expect(st.garden.out?.n).toBe(2);
    // picked up at last: the next step, and nothing more is "passed"
    expect(kitPicked(st, 'nd_seeds_tomato', 70_000, 7).length).toBe(1);
    expect(kitsPassed(st, 70_500, 7)).toEqual([]);
  });

  it('driven past is by where the place that took it is: none yet (a long stretch without one) is not missed', () => {
    const st: KitsState = {};
    const first = kitPicked(st, 'nd_camera', 9_000, 7)[0];
    // no place has taken it, however far on one is
    expect(kitsPassed(st, first.s + 20_000, 7, () => undefined)).toEqual([]);
    // the place that took it 4 km past where it was due: missed three kilometres past that
    const place = first.s + 4000;
    expect(kitsPassed(st, place + KIT_MISSED_M - 1, 7, (kit, step) => (kit === 'photo' && step === 1 ? place : undefined))).toEqual([]);
    expect(kitsPassed(st, place + KIT_MISSED_M, 7, () => place).map((f) => thingKey(f.thing))).toEqual(['nd_film_pack']);
  });

  it('with the places ahead known, a step is put at one of its own sort within its kilometres — exactly there', () => {
    const places = [
      { s: 33_000, kind: 'house' as const },
      { s: 34_500, kind: 'house' as const },
      { s: 35_000, kind: 'garage' as const },
      { s: 36_200, kind: 'shop' as const },
      { s: 38_000, kind: 'house' as const },
    ];
    const ahead = (from: number, to: number): typeof places => places.filter((p) => p.s >= from && p.s <= to);
    const st: KitsState = {};
    const [pot] = kitPicked(st, 'nd_coffee_machine', 32_000, 7, ahead);
    // (two to five kilometres on: the house at 34.5 or the shop at 36.2 — not the house a kilometre on, nor the one six on)
    expect([34_500 - 0.5, 36_200 - 0.5]).toContain(pot.s);
    // every game of the world the same
    expect(kitPicked({}, 'nd_coffee_machine', 32_000, 7, ahead)[0].s).toBe(pot.s);
    // (places handed in from outside those kilometres are not looked at)
    expect([34_500 - 0.5, 36_200 - 0.5]).toContain(kitPicked({}, 'nd_coffee_machine', 32_000, 7, () => places)[0].s);
    // no place of its sort in those kilometres: the first place with a box in them, whatever its sort — it waits for none
    const none = kitPicked({}, 'nd_coffee_machine', 32_000, 7, () => [{ s: 35_000, kind: 'garage' as const }])[0];
    expect(none.s).toBe(35_000 - 0.5);
    expect(none.themes).toBeUndefined();
    expect(pot.themes).toBeDefined();
    // no place at all in them: the first after
    expect(kitPicked({}, 'nd_coffee_machine', 32_000, 7, () => [{ s: 38_200, kind: 'garage' as const }])[0].s).toBe(38_200 - 0.5);
    // the places not known: somewhere in those kilometres, for the first place that takes it
    const blind = kitPicked({}, 'nd_coffee_machine', 32_000, 7)[0];
    expect(blind.s).toBeGreaterThanOrEqual(34_000);
    expect(blind.s).toBeLessThanOrEqual(37_000);
    expect(blind.themes).toBeDefined();
    // a step of a later chapter: its kilometres counted from where the chapter begins
    const refit: KitsState = {};
    kitPicked(refit, 'nd_grinder', 68_000, 7);
    const far = [{ s: 104_000, kind: 'garage' as const }, { s: 106_500, kind: 'garage' as const }, { s: 109_000, kind: 'works' as const }];
    const [pol] = kitPicked(refit, 'nd_battery', 70_000, 7, (from, to) => far.filter((p) => p.s >= from && p.s <= to));
    expect(pol.s).toBe(106_500 - 0.5);
  });

  it('a set is whole within fifteen kilometres of its main thing, however bare the road: a step sooner, or at whatever place there is', () => {
    // (a bare road: the only places with a box at 33.2, 41.0 and 46.9 km — the machine picked up at 32)
    const bare = [
      { s: 33_200, kind: 'roadside' as const },
      { s: 41_000, kind: 'garage' as const },
      { s: 46_900, kind: 'house' as const },
      { s: 52_000, kind: 'house' as const },
    ];
    const ahead = (from: number, to: number): typeof bare => bare.filter((p) => p.s >= from && p.s <= to);
    const st: KitsState = {};
    const [pot] = kitPicked(st, 'nd_coffee_machine', 32_000, 7, ahead);
    // (none within two to five kilometres; the first after is at 41.0 — past its share of the way (32 + 7.25): the
    // lay-by a kilometre on has it, sooner than it should be)
    expect(pot.s).toBe(33_200 - 0.5);
    expect(pot.themes).toBeUndefined();
    const [beans] = kitPicked(st, 'coffee_pot', 33_200, 7, ahead);
    // (the beans: none within two to five of 33.2; the first after, the workshop at 41.0, is within fifteen of the machine)
    expect(beans.s).toBe(41_000 - 0.5);
    expect(beans.s - 32_000).toBeLessThanOrEqual(15_000);
    // one's own doing is no promise: the pot picked up late, the beans come as they come
    const late: KitsState = {};
    kitPicked(late, 'nd_coffee_machine', 20_000, 7, ahead);
    const [b2] = kitPicked(late, 'coffee_pot', 44_000, 7, ahead);
    expect(b2.s).toBe(46_900 - 0.5);
    // a step put out again after it was driven past: as the road has it
    const missed: KitsState = {};
    const [first] = kitPicked(missed, 'nd_coffee_machine', 32_000, 7, ahead);
    const [again] = kitsPassed(missed, 37_000, 7, () => first.s, ahead);
    expect(again.s).toBe(41_000 - 0.5);
  });

  it('what is still wanting of a set, for the card of any of its things', () => {
    const none = (): boolean => false;
    expect(kitWanting('nd_crowbar', none)).toBeNull();
    expect(kitWanting('nd_coffee_machine', none)?.wanting).toEqual(['nd_coffee_machine', 'coffee_pot', 'nd_coffee_pack']);
    expect(kitWanting('coffee_pot', (k) => k === 'nd_coffee_machine')?.wanting).toEqual(['coffee_pot', 'nd_coffee_pack']);
    expect(kitWanting('nd_coffee_pack', () => true)?.wanting).toEqual([]);
    expect(kitWanting('part:radio_old', (k) => k === 'part:radio_old')).toMatchObject({ kit: { id: 'music' }, wanting: ['nd_tape_01'] });
  });
});

describe('F6: the plan of a world of version 7', () => {
  const SEEDS = [7, 11, 1000, 8919, 31337, 424242, 2000, 9919, 17838, 25757];

  it('the plan before it for every world made before, this one from version 7 on', () => {
    expect(scheduleOf(5)).toBe(SCHEDULE);
    expect(scheduleOf(6)).toBe(SCHEDULE);
    expect(scheduleOf(7)).toBe(SCHEDULE_V7);
    // (the plan before it is as it was: its entries, their order)
    expect(SCHEDULE.map((e) => e.id).slice(0, 5)).toEqual(['crowbar', 'torch', 'engine_kit', 'charger', 'bandage']);
  });

  it('every entry names a thing of the game; an entry is of its chapter by where it first comes', () => {
    for (const e of SCHEDULE_V7) {
      if ('item' in e.thing) expect(hasItem(e.thing.item), e.id).toBe(true);
      if ('part' in e.thing) expect(hasPart(e.thing.part), e.id).toBe(true);
      for (const w of e.with ?? []) if ('item' in w.thing) expect(hasItem(w.thing.item), e.id).toBe(true);
      if (e.kit) expect(thingKey(kitDef(e.kit).main)).toBe(thingKey(e.thing));
      // (a new thing's first band lies within one chapter)
      if (e.novelty) expect(chapterAt(e.firstKm[0]), e.id).toBe(chapterAt(e.firstKm[1] - 1e-6));
    }
    // every set has its entry
    expect(SCHEDULE_V7.filter((e) => e.kit).map((e) => e.kit).sort()).toEqual(KITS.map((k) => k.id).sort());
  });

  it('each chapter\'s new things first turn up within its kilometres, never two within the pace\'s gap', () => {
    const chapter: Record<string, number> = { crowbar: 1, torch: 1, camera: 1, radio: 2, pack: 2, spray: 2, coffee: 3, stove: 3, cooler: 3, pot: 4, forage: 4, grinder: 4, rod: 5, detector: 5, spoon: 5, furniture: 6, shelves: 6, fridge: 6, kitchen2: 6 };
    for (const seed of SEEDS) {
      const p = plan(seed, 200, 'normal', SCHEDULE_V7);
      const firsts = new Map<string, number>();
      for (const f of p) if (f.novelty && !firsts.has(f.entry)) firsts.set(f.entry, f.s / 1000);
      for (const [id, c] of Object.entries(chapter)) {
        const km = firsts.get(id);
        expect(km, `seed ${seed}: ${id}`).toBeDefined();
        expect(km!, `seed ${seed}: ${id}`).toBeGreaterThanOrEqual(CHAPTER_KM[c]);
        expect(km!, `seed ${seed}: ${id}`).toBeLessThan(CHAPTER_KM[c + 1] ?? Infinity);
      }
      const late = [...firsts.entries()].filter(([id]) => (SCHEDULE_V7.find((e) => e.id === id)!.firstKm[1] ?? 0) > 3).map(([, km]) => km).sort((a, b) => a - b);
      for (let i = 1; i < late.length; i++) expect(late[i] - late[i - 1], `seed ${seed}`).toBeGreaterThanOrEqual(NOVELTY_GAP_KM - 1e-6);
    }
  });

  it('a set\'s main thing comes by itself, again every 22–30 km; what goes with it is not in the plan', () => {
    const later = new Set(KITS.flatMap((k) => k.steps.filter((s) => !s.free).flatMap((s) => s.things.map(thingKey))));
    for (const seed of SEEDS) {
      const p = plan(seed, 200, 'normal', SCHEDULE_V7);
      for (const f of p) {
        expect(later.has(thingKey(f.thing)), `seed ${seed}: ${f.entry} has ${thingKey(f.thing)}`).toBe(false);
        for (const w of f.with ?? []) expect(later.has(thingKey(w)), `seed ${seed}: ${f.entry} with ${thingKey(w)}`).toBe(false);
      }
      const coffee = p.filter((f) => f.entry === 'coffee');
      expect(coffee.length).toBeGreaterThanOrEqual(5);
      expect(coffee.every((f) => f.kit === 'coffee' && !f.with)).toBe(true);
      for (let i = 1; i < coffee.length; i++) {
        expect((coffee[i].s - coffee[i - 1].s) / 1000).toBeGreaterThanOrEqual(22 - 1e-6);
        expect((coffee[i].s - coffee[i - 1].s) / 1000).toBeLessThanOrEqual(30 + 1e-6);
      }
    }
  });
});

describe('F6: the plan fitted to a world\'s places', () => {
  const camera: PlannedFind = { entry: 'camera', thing: { item: 'nd_camera' }, s: 10_360, themes: ['house', 'lookout', 'lighthouse'], novelty: true, within: [0, 12_000] };
  // (the road of the world of seed 7: a house at 8.0 km, a camp at 9.6, a wreck by the road, then nothing with a box in it until 13.7)
  const road: (PlanPlace & { id: string })[] = [
    { id: 'a', s: 8_030, kind: 'house', boxes: 4 },
    { id: 'b', s: 9_620, kind: 'camp', boxes: 4 },
    { id: 'c', s: 9_920, kind: 'roadside', boxes: 0, ground: true },
    { id: 'd', s: 13_660, kind: 'roadside', boxes: 3 },
  ];
  const laid = (finds: PlannedFind[], places: (PlanPlace & { id: string })[]): string | undefined => {
    const planner = new SitePlanner(finds);
    planner.take(places);
    return places.find((p) => planner.findsAt(p.id).length)?.id;
  };

  it('a chapter\'s new thing the road would put beyond its chapter is due at the last place within it: one of its own sort', () => {
    expect(laid([camera], road)).toBe('d');
    const [fitted] = fitToPlaces([camera], road);
    expect(fitted.s).toBe(8_030 - 0.5);
    expect(fitted.themes).toEqual(camera.themes);
    expect(laid([fitted], road)).toBe('a');
  });

  it('no place of its sort in the chapter: the last with a box of its own, and it waits for no sort of place', () => {
    const bare = road.filter((p) => p.kind !== 'house');
    const [fitted] = fitToPlaces([camera], bare);
    expect(fitted.s).toBe(9_620 - 0.5);
    expect(fitted.themes).toBeUndefined();
    expect(laid([fitted], bare)).toBe('b');
  });

  it('what the road takes within its chapter, and what has no chapter, is as it was', () => {
    const early = { ...camera, s: 7_900 };
    expect(fitToPlaces([early], road)[0]).toBe(early);
    const { within: _w, ...free } = camera;
    expect(fitToPlaces([free], road)[0]).toBe(free);
    // (a chapter with no place with a box in it at all: nothing to be done)
    expect(fitToPlaces([camera], [road[3]])[0]).toBe(camera);
  });

  it('over real worlds: every chapter\'s new thing is laid within its chapter', () => {
    const seeds = Array.from({ length: Number(process.env.ROBOT_SEEDS ?? 6) }, (_, k) => 1000 + k * 7919);
    let moved = 0;
    for (const seed of [7, ...seeds]) {
      const world = modcarWorld(seed, { worldVersion: 7 }).world;
      const places = planPlaces(world, 0, 150_000);
      const raw = placesPlan(seed, 160, 'normal', SCHEDULE_V7);
      const finds = fitToPlaces(raw, places);
      moved += finds.filter((f, i) => f.within && !raw.includes(f)).length;
      const planner = new SitePlanner(finds);
      planner.take(places);
      for (const f of finds) {
        if (!f.within) continue;
        const at = planner.laidAt(f);
        expect(at, `seed ${seed}: ${f.entry}`).toBeDefined();
        expect(at!, `seed ${seed}: ${f.entry}`).toBeGreaterThanOrEqual(f.within[0]);
        expect(at!, `seed ${seed}: ${f.entry} due at ${(f.s / 1000).toFixed(1)} km`).toBeLessThanOrEqual(f.within[1]);
      }
    }
    console.info(`the plan fitted to ${seeds.length + 1} worlds: ${moved} of their chapters' new things moved back into their chapter`);
  }, 600_000);
});

describe('F6: finds added to the plan as the game goes', () => {
  const places: (PlanPlace & { id: string })[] = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, s: 30_000 + i * 700, kind: i % 3 === 0 ? 'house' : i % 3 === 1 ? 'garage' : 'camp', boxes: 2 }));
  const base: PlannedFind[] = [{ entry: 'coffee', thing: { item: 'nd_coffee_machine' }, s: 31_000, themes: ['house'], novelty: true, kit: 'coffee' }];

  it('laid at the first place of its sorts from where it is due — never at one come to already', () => {
    const planner = new SitePlanner(base);
    planner.take(places.slice(0, 4));
    const machineAt = places.slice(0, 4).find((p) => planner.findsAt(p.id).length)!;
    expect(machineAt.kind).toBe('house');
    // the machine picked up there: its pot put out
    const st: KitsState = {};
    const pot = kitPicked(st, 'nd_coffee_machine', machineAt.s, 7);
    planner.add(pot);
    planner.take(places);
    const where = places.find((p) => planner.findsAt(p.id).some((f) => f.entry === 'kit:coffee:1'))!;
    expect(where).toBeDefined();
    expect(where.s).toBeGreaterThanOrEqual(pot[0].s - 1);
    expect(where.s).toBeLessThanOrEqual(pot[0].s + 1400);
    expect(['house']).toContain(where.kind);
    // a planner made again with what was added (the game taken up): the same place
    const again = new SitePlanner(base);
    again.add(pot);
    again.take(places);
    expect(places.find((p) => again.findsAt(p.id).some((f) => f.entry === 'kit:coffee:1'))!.id).toBe(where.id);
  });

  it('one due behind where the places have been taken in to goes to the next place ahead', () => {
    const planner = new SitePlanner([]);
    planner.take(places.slice(0, 10));
    const late: PlannedFind = { entry: 'kit:coffee:1', thing: { item: 'coffee_pot' }, s: 31_000, themes: ['house'], novelty: false };
    const [added] = planner.add([late]);
    // (as it was added: due just beyond the last place taken in — what a game keeps)
    expect(added.s).toBe(places[9].s + 2);
    expect(planner.laidAt(added)).toBeUndefined();
    planner.take(places);
    const where = places.find((p) => planner.findsAt(p.id).length)!;
    expect(where.s).toBeGreaterThan(places[9].s);
    expect(planner.laidAt(added)).toBe(where.s);
    // a planner made again with it as it was added: the same place
    const again = new SitePlanner([]);
    expect(again.add([added])[0]).toBe(added);
    again.take(places);
    expect(places.find((p) => again.findsAt(p.id).length)!.id).toBe(where.id);
  });
});
