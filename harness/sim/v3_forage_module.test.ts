/**
 * The forage module in a stand-in game (src/game/modcar/v3/forage, node W3), with the real player on the real
 * land of a world of version 2: what the module brings into the catalogues; the look-out (on foot, at a walk,
 * never while driving, never in a world of version 1); a pick through the real mark and E — what the hands
 * get is what the core's pickResult says, the tools in the hotbar help, the basket takes it, what does not
 * go in lies by the feet; the point is gone until its days are over; the veil's three cases and the cards;
 * what the skill, a page and a taste teach, and that the toxic kinds hurt; the starter kit; rain and the
 * hour; the save slice's round trip and its pruning; the developer's tab; the robot forager.
 *
 * What the system costs in a step is v3_forage_module_cost.test.ts; what is drawn is v3_forage_module_view.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { countOf, hasItem, hasItemCat, itemCatalogueProblems, itemDef, itemName, itemVeil, newItem, type ItemInstance } from '../../src/core/modcar/items';
import { eat, has, newVitals, stepVitals } from '../../src/core/modcar/vitals';
import { ForagePoint } from '../../src/core/v3/forage/field';
import { FORAGE_INDEX, FORAGE_KINDS, forageKind } from '../../src/core/v3/forage/kinds';
import { NO_BONUS, pickResult, PICK_XP, FIRST_PICK_XP, type PickResult } from '../../src/core/v3/forage/rules';
import { FORAGE_CATS } from '../../src/core/v3/forage/types';
import { skillDef, xpForLevel } from '../../src/core/v3/progress/progress';
import { plantIndex } from '../../src/core/world/plants';
import { itemCard } from '../../src/game/modcar/itemInfo';
import { BASKET, KNIFE, pageId, SICKLE, TROWEL, UNKNOWN_BLURB } from '../../src/game/modcar/v3/forage/content';
import forageModule, { forage } from '../../src/game/modcar/v3/forage/index';
import { domains, gainXp, learn, progress, setSkillLevel } from '../../src/game/modcar/v3/progress/api';
import { forageRig, FOREST, passDays, V1_WORLD, WORLD } from './v3/forageRig';

const card = (it: ItemInstance): ReturnType<typeof itemCard> => itemCard(it, 0);

describe('forage module: what it brings', () => {
  it('ten categories, an item for each of the eighty kinds, the tools, the pages, the skill, the field of the compendium', () => {
    expect(forageModule.id).toBe('forage');
    expect(FORAGE_KINDS).toHaveLength(80);
    for (const c of Object.keys(FORAGE_CATS)) expect(hasItemCat(`forage_${c}`)).toBe(true);
    for (const k of FORAGE_KINDS) {
      const d = itemDef(k.id);
      expect(d.cat).toBe(`forage_${k.cat}`);
      expect(d.stack).toBe(k.item.stack);
      expect(d.model.startsWith('forage_')).toBe(true);
      expect(d.tags).toContain('forage');
    }
    expect(hasItem('forage_spoiled')).toBe(true);
    for (const id of [KNIFE, TROWEL, SICKLE]) expect(itemDef(id)).toMatchObject({ cat: 'gear', carry: 'small' });
    expect(itemDef(KNIFE).name.zh).toBe('小刀');
    expect(itemDef(TROWEL).name.zh).toBe('小铲');
    expect(itemDef(SICKLE).name.zh).toBe('镰刀');
    expect(itemDef(BASKET)).toMatchObject({ name: { zh: '采集篮' }, holds: { slots: 12, accepts: ['#forage'], maxKg: 6, decay: 0.5 } });
    for (const c of Object.keys(FORAGE_CATS)) expect(hasItem(pageId(c as keyof typeof FORAGE_CATS))).toBe(true);
    // (nothing of it gives scrap: the first build's checklist points at the nearest thing that does)
    for (const id of [KNIFE, TROWEL, SICKLE, BASKET]) expect(itemDef(id).salvage.scrap ?? 0).toBe(0);
    expect(itemCatalogueProblems()).toEqual([]);
    const skill = skillDef('forage');
    expect(skill.name.zh).toBe('采集');
    expect(skill.perks.map((p) => [p.id, p.level])).toEqual([['forage_glow', 5], ['forage_double', 10], ['forage_twins', 15], ['forage_star', 20]]);
    const field = domains().find((d) => d.id === 'forage');
    expect(field?.ids()).toHaveLength(80);
  });

  it('installed: the system with its budget, the slice, the source, the tab 采集', async () => {
    const { game } = await forageRig();
    expect(game.kernel.telemetry()).toMatchObject({ modules: ['forage', 'progress'], devTabs: ['forage', 'progress'], interact: 1, errors: 0 });
    expect(game.systems.telemetry().forage.budgetMs).toBe(0.2);
    expect(game.slices.ids).toEqual(['forage', 'progress']);
    expect(game.devTabs.get('forage')?.title).toBe('采集');
    expect(game.reports).toEqual([]);
  });
});

describe('forage module: looking about', () => {
  it('on foot in a forest of a version 2 world: points show, of several kinds, on the ground and on bushes and trees', async () => {
    const r = await forageRig();
    r.settle();
    const shown = r.shown();
    expect(shown.length).toBeGreaterThan(20);
    expect(new Set(shown.map((p) => p.kind)).size).toBeGreaterThanOrEqual(6);
    expect(new Set(shown.map((p) => p.layer))).toEqual(new Set(['ground', 'shrub', 'tree']));
    for (const p of shown) expect(p.dist).toBeLessThanOrEqual(70 + 6);
    // nearest first, each with a place to aim at over its own ground
    expect(shown[0].dist).toBeLessThanOrEqual(shown[shown.length - 1].dist);
    for (const p of shown) expect(p.aimY).toBeGreaterThan(p.y);
    expect(forage.telemetry()).toMatchObject({ shown: shown.length });
  });

  it('not in a world of version 1, not without a world', async () => {
    const old = await forageRig({ world: V1_WORLD });
    old.settle();
    expect(old.shown()).toEqual([]);
    expect(forage.telemetry()).toMatchObject({ found: 0, shown: 0 });
    const none = await forageRig({ world: null });
    none.settle();
    expect(none.shown()).toEqual([]);
    expect(old.game.reports).toEqual([]);
    expect(none.game.reports).toEqual([]);
  });

  it('never while driving; again at a walk, in the seat or out of it', async () => {
    const r = await forageRig();
    r.settle();
    expect(r.shown().length).toBeGreaterThan(0);
    const w = r.player.walker;
    r.game.seated = { sim: { kmh: 60, px: w.x, py: w.y, pz: w.z } } as never;
    r.frames(3);
    expect(r.shown()).toEqual([]);
    const near: unknown[] = [];
    r.game.interact.near({ x: w.x, z: w.z }, 80, near as never[]);
    expect(near).toEqual([]);
    r.game.seated = { sim: { kmh: 5, px: w.x, py: w.y, pz: w.z } } as never;
    r.settle();
    expect(r.shown().length).toBeGreaterThan(0);
    r.game.seated = null;
    r.settle();
    expect(r.shown().length).toBeGreaterThan(0);
  });

  it('the hour and the rain: what glows shows by night, the half that waits for rain shows for twelve hours after it', async () => {
    const r = await forageRig({ hour: 12 });
    r.settle();
    const noon = r.shown();
    expect(noon.some((p) => p.kind === 'glow_mushroom')).toBe(false);
    expect(noon.some((p) => p.hidden)).toBe(false);
    const porcini = noon.filter((p) => p.kind === 'porcini' || p.kind === 'chanterelle').length;
    // night: the glowing kind is there
    r.game.setHour(22);
    r.settle();
    expect(r.shown().some((p) => p.kind === 'glow_mushroom')).toBe(true);
    // rain: the hidden half of the after-rain kinds comes up
    r.weather.rain = 1;
    r.frames(2);
    r.weather.rain = 0;
    r.settle();
    const wet = r.shown();
    expect(wet.some((p) => p.hidden)).toBe(true);
    expect(wet.filter((p) => p.kind === 'porcini' || p.kind === 'chanterelle').length).toBeGreaterThan(porcini);
    expect(forage.telemetry().sinceRainH).toBeLessThan(0.01);
    // eleven hours on they are still there, fourteen hours on they are gone
    r.game.setHour(9);
    r.settle();
    expect(r.shown().some((p) => p.hidden)).toBe(true);
    r.game.setHour(12);
    r.settle();
    expect(r.shown().some((p) => p.hidden)).toBe(false);
    expect(forage.telemetry().sinceRainH).toBeGreaterThan(12);
  });
});

describe('forage module: the pick', () => {
  it('E on the point under the mark: at once what pickResult says, into the hands; the point is gone; said, heard, counted', async () => {
    const r = await forageRig();
    r.settle();
    const pt = r.shown().find((p) => p.layer === 'ground' && p.kind === 'wild_garlic')!;
    expect(pt).toBeTruthy();
    const kind = forageKind(pt.kind);
    const want = pickResult(kind, WORLD.seed, pt.key, r.ctx.clock.day, pt.vary, NO_BONUS, { n: 0, q: 0, xp: 0 });
    // the mark finds it, and the prompt names it as the player knows it: not at all yet
    expect(r.aim(pt)).toBe(`device:forage:${pt.key}`);
    expect(r.seen.acts.map((a) => a.text)).toContain('采 <b>不认识的香草</b>');
    expect(r.seen.aim).toMatchObject({ name: '不认识的香草', blurb: UNKNOWN_BLURB, stars: 0, rows: [] });
    const before = r.shown().length;
    r.pressE();
    const got = r.item(0)!;
    expect(got).toMatchObject({ item: 'wild_garlic', q: want.q, t0: r.ctx.clock.worldSeconds, fresh: 1 });
    expect(countOf(got)).toBe(want.n);
    expect(want.n).toBeGreaterThanOrEqual(kind.yield[0]);
    expect(want.n).toBeLessThanOrEqual(kind.yield[1]);
    expect(want.q).toBe(2);
    expect(r.heard).toEqual([`picked wild_garlic x${want.n} q${want.q} key ${pt.key}`, 'met forage/wild_garlic', `xp forage +${PICK_XP.common * FIRST_PICK_XP}`]);
    expect(r.game.said).toEqual([`+${want.n} 不认识的香草 · 第一次采到`]);
    expect(r.game.sounds).toEqual(['pickup']);
    expect(progress.entry('forage', 'wild_garlic')).toMatchObject({ state: 1, count: want.n });
    // gone from what shows, from under the mark, and remembered
    expect(r.shown().length).toBe(before - 1);
    expect(r.shown().some((p) => p.key === pt.key)).toBe(false);
    r.frames(1);
    expect(r.player.telemetry().target).toBe('');
    expect(forage.picked.size).toBe(1);
    expect(forage.picked.get(pt.key)).toBe(r.ctx.clock.day + kind.regrowDays);
    // E again does nothing more
    r.pressE();
    expect(countOf(r.item(0)!)).toBe(want.n);
    expect(r.game.reports).toEqual([]);
  });

  it('a second pick of the kind is worth the plain experience and says the plain line; the stack grows', async () => {
    const r = await forageRig();
    r.settle();
    const pts = r.shown().filter((p) => p.kind === 'pine_needle').slice(0, 2);
    expect(pts).toHaveLength(2);
    r.pick(pts[0]);
    const n0 = countOf(r.item(0)!);
    r.game.said.length = 0;
    r.heard.length = 0;
    r.pick(pts[1]);
    const n1 = countOf(r.item(0)!) - n0;
    expect(n1).toBeGreaterThan(0);
    expect(r.heard).toEqual([`picked pine_needle x${n1} q2 key ${pts[1].key}`, `xp forage +${PICK_XP.common}`]);
    expect(r.game.said).toEqual([]);
    // (the line waits its turn behind the first one, which is still up: no wall of them)
    r.frames(120);
    expect(r.game.said).toEqual([`+${n1} 不认识的香草`]);
    expect(r.player.slots[1]).toBeNull();
  });

  it('the tools in the hotbar help: the knife a star, the trowel one more, the sickle twice as many', async () => {
    const out: PickResult = { n: 0, q: 0, xp: 0 };
    const r = await forageRig({ pack: 4 });
    r.settle();
    const day = r.ctx.clock.day;
    const garlic = r.shown().find((p) => p.kind === 'wild_garlic')!;
    const burdock = r.shown().find((p) => p.kind === 'burdock')!;
    expect(forageKind('wild_garlic').tool).toBe('knife');
    expect(forageKind('burdock').tool).toBe('trowel');
    r.player.receive({ kind: 'item', item: newItem(KNIFE) });
    r.player.receive({ kind: 'item', item: newItem(TROWEL) });
    r.pick(garlic);
    r.pick(burdock);
    const g = r.held('wild_garlic')!;
    const b = r.held('burdock')!;
    expect(g.q).toBe(3);
    expect(countOf(g)).toBe(pickResult(forageKind('wild_garlic'), WORLD.seed, garlic.key, day, garlic.vary, { ...NO_BONUS, knife: true, trowel: true }, out).n);
    expect(b.q).toBe(2);
    expect(countOf(b)).toBe(pickResult(forageKind('burdock'), WORLD.seed, burdock.key, day, burdock.vary, NO_BONUS, out).n + 1);
    // the skill's perks are bonuses too: at level 20 the pick is the core's with both perks
    setSkillLevel(r.ctx, 'forage', 20);
    const next = r.shown().find((p) => p.kind === 'pine_needle')!;
    r.pick(next);
    const want = pickResult(forageKind('pine_needle'), WORLD.seed, next.key, day, next.vary, { knife: true, trowel: true, sickle: false, level: 20, double: true, star: true }, out);
    expect(countOf(r.held('pine_needle')!)).toBe(want.n);
    expect(r.held('pine_needle')!.q).toBe(want.q);
  });

  it('with the basket in a slot the picks go into it; with the hands full the pick lies by the feet', async () => {
    const r = await forageRig();
    r.settle();
    r.player.receive({ kind: 'item', item: newItem(BASKET) });
    const pts = r.shown().filter((p) => p.layer === 'ground' && !forageKind(p.kind).when).slice(0, 3);
    r.pick(pts[0]);
    r.pick(pts[1]);
    const basket = r.item(0)!;
    expect(basket.item).toBe(BASKET);
    expect(basket.inside!.map((x) => x.item).sort()).toEqual([pts[0].kind, pts[1].kind].sort());
    expect(r.player.slots[1]).toBeNull();
    expect(r.lying).toEqual([]);
    // (in the basket things go off at half the rate)
    expect(basket.inside![0].fk).toBe(0.5);
    // hands that take nothing: both slots hold things that neither stack nor hold
    const full = await forageRig();
    full.settle();
    full.player.receive({ kind: 'item', item: newItem(KNIFE) });
    full.player.receive({ kind: 'item', item: newItem(TROWEL) });
    const pt = full.shown().find((p) => p.kind === 'pine_needle')!;
    full.pick(pt);
    expect(full.lying).toHaveLength(1);
    expect(full.lying[0].item.item).toBe('pine_needle');
    expect(Math.hypot(full.lying[0].x - full.player.walker.x, full.lying[0].z - full.player.walker.z)).toBeLessThan(1);
    expect(full.game.said[0]).toMatch(/^\+\d 不认识的香草 · 第一次采到（拿不下的放在脚边了）$/);
    expect(forage.picked.size).toBe(1);
  });

  it('a pick larger than a stack comes as several stacks', async () => {
    const r = await forageRig({ pack: 4 });
    r.settle();
    setSkillLevel(r.ctx, 'forage', 20);
    r.player.receive({ kind: 'item', item: newItem(TROWEL) });
    // a potato plant (potatoes stack to 6; with the trowel and the perk's double a plant gives up to 10), one
    // whose dice fall on the double today
    const out: PickResult = { n: 0, q: 0, xp: 0 };
    const kind = forageKind('potato');
    const bonus = { knife: false, trowel: true, sickle: false, level: 20, double: true, star: true };
    const w = r.player.walker;
    const p = new ForagePoint();
    Object.assign(p, { kind: FORAGE_INDEX.potato, plant: plantIndex('potato_plant'), x: w.x + 1, y: w.y, z: w.z, vary: 0.9 });
    for (p.key = 1; pickResult(kind, WORLD.seed, p.key, r.ctx.clock.day, p.vary, bonus, out).n <= kind.item.stack; p.key++);
    const want = out.n;
    expect(want).toBeGreaterThan(6);
    expect(forage.pick(p)).toBe(true);
    const stacks = r.player.slots.filter((h) => h?.kind === 'item' && h.item.item === 'potato').map((h) => (h?.kind === 'item' ? h.item : null)!);
    expect(stacks.map((x) => countOf(x))).toEqual([6, want - 6]);
    expect(r.heard[0]).toBe(`picked potato x${want} q${out.q} key ${p.key}`);
    expect(forage.pick(p)).toBe(false);
  });

  it('a picked point bears again after its kind’s days, and the table lets go of it at that midnight', async () => {
    const r = await forageRig();
    r.settle();
    const pt = r.shown().find((p) => p.kind === 'wild_garlic')!;
    const days = forageKind('wild_garlic').regrowDays;
    expect(days).toBe(2);
    r.pick(pt);
    r.settle();
    expect(r.shown().some((p) => p.key === pt.key)).toBe(false);
    passDays(r.game, 1);
    r.settle();
    expect(r.shown().some((p) => p.key === pt.key)).toBe(false);
    expect(forage.picked.size).toBe(1);
    passDays(r.game, 1);
    r.settle();
    expect(r.shown().some((p) => p.key === pt.key)).toBe(true);
    expect(forage.picked.size).toBe(0);
    // and the next bearing is another throw of the dice, picked like the first
    r.heard.length = 0;
    r.pick(r.shown().find((p) => p.key === pt.key)!);
    expect(r.heard[0]).toMatch(/^picked wild_garlic x\d q2/);
  });
});

describe('forage module: what the player knows', () => {
  it('the veil’s three cases: unknown, a look-alike taken for its twin, known', async () => {
    const r = await forageRig();
    const agaric = newItem('fly_agaric', { n: 3 });
    const chanterelle = newItem('chanterelle');
    // unknown: the category's unknown name, wherever a name is asked
    expect(itemVeil('fly_agaric')).toEqual(FORAGE_CATS.mushroom.unknown);
    expect(itemName(agaric)).toBe('不认识的蘑菇 ×3');
    expect(itemName(agaric, 'en')).toBe('Unknown mushroom ×3');
    expect(itemName(chanterelle)).toBe('不认识的蘑菇');
    expect(itemVeil('food_chips')).toBeNull();
    expect(itemVeil(KNIFE)).toBeNull();
    // its edible twin known, itself not: it goes by the twin's name (the trap)
    learn(r.ctx, 'forage', 'chanterelle', 'taste', { quiet: true });
    expect(itemName(chanterelle)).toBe('鸡油菌');
    expect(itemName(agaric)).toBe('鸡油菌 ×3');
    expect(forage.harness.veil('fly_agaric')).toEqual({ state: 2, name: '鸡油菌' });
    // (the other look-alike is none of it: its own twin is not known)
    expect(itemName(newItem('death_cap'))).toBe('不认识的蘑菇');
    // known: its own name
    learn(r.ctx, 'forage', 'fly_agaric', 'page', { quiet: true });
    expect(itemVeil('fly_agaric')).toBeNull();
    expect(itemName(agaric)).toBe('毒蝇伞 ×3');
    expect(forage.harness.veil('fly_agaric')).toEqual({ state: 0, name: '毒蝇伞' });
  });

  it('the cards: an unknown kind shows its veiled name and one line; a mistaken one its twin’s card; a known one where it grows and how many were picked', async () => {
    const r = await forageRig();
    const agaric = newItem('fly_agaric', { n: 2, q: 2 });
    const unknown = card(agaric);
    expect(unknown).toMatchObject({ name: '不认识的蘑菇 ×2', blurb: UNKNOWN_BLURB, stars: 0, rows: [], bars: [], notes: [], badges: [] });
    learn(r.ctx, 'forage', 'chanterelle', 'taste', { quiet: true });
    const mistaken = card(agaric);
    expect(mistaken.name).toBe('鸡油菌 ×2');
    expect(mistaken.blurb).toBe(forageKind('chanterelle').blurb);
    expect(mistaken.stars).toBe(forageKind('chanterelle').item.stars);
    expect(mistaken.notes.some((n) => n.text.includes('闹肚子'))).toBe(false);
    expect(mistaken.rows.some((x) => x.label === '哪里找' && x.value === forageKind('chanterelle').where.zh)).toBe(true);
    learn(r.ctx, 'forage', 'fly_agaric', 'taste', { quiet: true });
    const known = card(agaric);
    expect(known.name).toBe('毒蝇伞 ×2');
    expect(known.blurb).toBe(forageKind('fly_agaric').blurb);
    expect(known.notes.some((n) => n.text.includes('闹肚子'))).toBe(true);
    expect(known.rows).toContainEqual({ value: forageKind('fly_agaric').where.zh, label: '哪里找' });
    expect(known.rows).toContainEqual({ value: '0 个', label: '一共采过' });
    // a basket's card names what is in it as the player knows it
    const basket = newItem(BASKET, { inside: [newItem('death_cap', { n: 2 }), newItem('fly_agaric')] });
    expect(card(basket).rows.slice(0, 2).map((x) => x.label)).toEqual(['不认识的蘑菇', '毒蝇伞']);
    // things that are no forage keep their cards
    expect(card(newItem(KNIFE)).blurb).toBe(itemDef(KNIFE).blurb);
  });

  it('the skill teaches by sight: common kinds from level 3, uncommon from 6, rare from 9, legendary never; the look-alikes only with the perk', async () => {
    const r = await forageRig();
    const known = (id: string): boolean => itemVeil(id) === null;
    expect(known('dandelion')).toBe(false);
    gainXp(r.ctx, 'forage', xpForLevel(3));
    expect(r.game.said).toEqual(['采集升到 3 级']);
    r.frames(400);
    expect(r.game.said).toEqual(['采集升到 3 级', '常见的野货，现在一眼就认得出了。']);
    expect(known('dandelion')).toBe(true);
    expect(known('chanterelle')).toBe(true);
    expect(known('morel')).toBe(false);
    expect(progress.entry('forage', 'dandelion')).toMatchObject({ state: 2, by: 'skill', count: 0 });
    // the trap is set now: the twin of a kind one knows goes by its name
    expect(itemName(newItem('fly_agaric'))).toBe('鸡油菌');
    expect(itemName(newItem('death_cap'))).toBe('平菇');
    setSkillLevel(r.ctx, 'forage', 6);
    expect(known('morel')).toBe(true);
    expect(known('matsutake')).toBe(false);
    expect(known('fly_agaric')).toBe(false);
    setSkillLevel(r.ctx, 'forage', 9);
    expect(known('matsutake')).toBe(true);
    expect(known('truffle')).toBe(false);
    setSkillLevel(r.ctx, 'forage', 14);
    expect(known('fly_agaric')).toBe(false);
    expect(known('death_cap')).toBe(false);
    setSkillLevel(r.ctx, 'forage', 15);
    expect(known('fly_agaric')).toBe(true);
    expect(known('death_cap')).toBe(true);
    setSkillLevel(r.ctx, 'forage', 20);
    for (const id of ['truffle', 'ginseng', 'snow_lotus', 'cordyceps']) expect(known(id)).toBe(false);
    expect(FORAGE_KINDS.filter((k) => !known(k.id)).map((k) => k.id)).toEqual(['truffle', 'ginseng', 'snow_lotus', 'cordyceps']);
    // a pick of a kind learnt by sight is still the first pick of it
    r.settle();
    const pt = r.shown().find((p) => p.kind === 'pine_needle')!;
    r.heard.length = 0;
    r.pick(pt);
    expect(r.heard).toContain('met forage/pine_needle');
    expect(r.heard).toContain(`xp forage +${PICK_XP.common * FIRST_PICK_XP}`);
  });

  it('a page of the compendium in the hands teaches every kind of its category, once', async () => {
    const r = await forageRig();
    expect(itemVeil('truffle')).not.toBeNull();
    r.player.receive({ kind: 'item', item: newItem(pageId('mushroom')) });
    r.frames(60);
    for (const k of FORAGE_KINDS.filter((x) => x.cat === 'mushroom')) expect(itemVeil(k.id)).toBeNull();
    expect(itemVeil('wild_berry')).not.toBeNull();
    expect(progress.entry('forage', 'truffle')).toMatchObject({ state: 2, by: 'page' });
    expect(r.game.said).toEqual(['翻了翻图鉴页：蘑菇与菌类里的 12 种，现在都认得了。']);
    r.frames(300);
    expect(r.game.said).toHaveLength(1);
  });

  it('tasting teaches, and says what it was; the toxic kinds hurt through their item’s own eat', async () => {
    const r = await forageRig();
    // an unknown one
    r.game.events.emit('body:ate', { item: newItem('wild_berry') });
    expect(itemVeil('wild_berry')).toBeNull();
    expect(progress.entry('forage', 'wild_berry')).toMatchObject({ state: 2, by: 'taste' });
    expect(r.game.said).toEqual(['尝出来了：是野莓。']);
    // a look-alike eaten for its twin
    learn(r.ctx, 'forage', 'oyster_mushroom', 'page', { quiet: true });
    expect(itemName(newItem('death_cap'))).toBe('平菇');
    r.frames(300);
    r.game.events.emit('body:ate', { item: newItem('death_cap') });
    expect(r.game.said[1]).toBe('尝出来了：这不是平菇，是鹅膏！肚子开始不对劲了……');
    expect(itemName(newItem('death_cap'))).toBe('鹅膏');
    // a known one: nothing more is said; a thing that is no forage: nothing at all
    r.frames(300);
    r.game.events.emit('body:ate', { item: newItem('wild_berry') });
    r.game.events.emit('body:ate', { item: newItem('food_chips') });
    expect(r.game.said).toHaveLength(2);
    // what the body makes of them (ModGame.consume hands the item's own eat to the vitals, which take it in over five seconds)
    const digest = (id: string): ReturnType<typeof newVitals> => {
      const e = itemDef(id).eat!;
      const body = newVitals();
      eat(body, e.food, e.hp, e.effect);
      for (let i = 0; i < 6 * 60; i++) stepVitals(body, { dt: 1 / 60, sprinting: false, jumped: false, ambientC: 22, warmth: 0, rain: false, peeing: false });
      return body;
    };
    const well = digest('wild_berry');
    expect(well.hp).toBe(100);
    expect(has(well, 'sick1') || has(well, 'sick2')).toBe(false);
    for (const [id, effect, least] of [['fly_agaric', 'sick1', 5], ['death_cap', 'sick2', 25]] as const) {
      expect(itemDef(id).eat).toMatchObject({ effect });
      const body = digest(id);
      expect(100 - body.hp).toBeGreaterThanOrEqual(least);
      expect(has(body, effect)).toBe(true);
    }
  });
});

describe('forage module: the starter kit', () => {
  it('a new game in the workshop: a knife and a basket lie a step ahead, once', async () => {
    const r = await forageRig({ start: 'garage' });
    expect(r.lying).toEqual([]);
    r.frames(2);
    expect(r.lying.map((l) => l.item.item).sort()).toEqual([BASKET, KNIFE]);
    const w = r.player.walker;
    for (const l of r.lying) {
      const d = Math.hypot(l.x - w.x, l.z - w.z);
      expect(d).toBeGreaterThan(1);
      expect(d).toBeLessThan(2.2);
    }
    expect(r.game.said).toEqual([]);
    expect(forage.telemetry()).toMatchObject({ kit: true });
    r.frames(200);
    expect(r.lying).toHaveLength(2);
    // the flag is in the save: the game taken up again gets no second kit
    const again = await forageRig({ start: 'garage', save: r.game.saved() });
    again.frames(10);
    expect(again.lying).toEqual([]);
  });

  it('a game taken up without it is given it once, with a line; a game on the road or in a version 1 world is not', async () => {
    const r = await forageRig({ save: { hour: 9, slices: {} } });
    r.frames(2);
    expect(r.lying.map((l) => l.item.item).sort()).toEqual([BASKET, KNIFE]);
    expect(r.game.said).toEqual(['脚边多了一把小刀和一个采集篮：采东西用得上。']);
    // (one that sits in a vehicle gets it when it gets out)
    const seated = await forageRig({ save: { hour: 9, slices: {} }, seated: true });
    seated.frames(5);
    expect(seated.lying).toEqual([]);
    seated.game.seated = null;
    seated.frames(2);
    expect(seated.lying).toHaveLength(2);
    const road = await forageRig({ start: 'road' });
    road.frames(5);
    expect(road.lying).toEqual([]);
    const old = await forageRig({ start: 'garage', world: V1_WORLD, version: 1 });
    old.frames(5);
    expect(old.lying).toEqual([]);
    const oldSave = await forageRig({ save: { hour: 9, slices: {} }, world: V1_WORLD, version: 1 });
    oldSave.frames(5);
    expect(oldSave.lying).toEqual([]);
  });
});

describe('forage module: the save', () => {
  it('picked points, the rain and the kit come back; picked points stay picked; a point is dropped when it bears again', async () => {
    const r = await forageRig({ start: 'garage' });
    r.settle();
    const pts = r.shown().filter((p) => p.layer === 'ground' && !forageKind(p.kind).when).slice(0, 3);
    for (const p of pts) r.pick(p);
    r.weather.rain = 1;
    r.frames(2);
    r.weather.rain = 0;
    const save = r.game.saved();
    const slice = save.slices!.forage as { v: number; d: { p: number[]; rain: number; kit: boolean } };
    expect(slice.v).toBe(1);
    expect(slice.d.kit).toBe(true);
    expect(slice.d.rain).toBe(Math.round(r.ctx.clock.worldSeconds));
    expect(slice.d.p).toHaveLength(6);
    const day = r.ctx.clock.day;
    const sorted = [...pts].sort((a, b) => a.key - b.key);
    expect(slice.d.p).toEqual(sorted.flatMap((p) => [p.key, day + forageKind(p.kind).regrowDays]));
    // (about twenty bytes a point)
    expect(JSON.stringify(slice.d.p).length / 3).toBeLessThan(26);

    const again = await forageRig({ save });
    again.settle();
    expect(forage.picked.size).toBe(3);
    for (const p of pts) expect(again.shown().some((q) => q.key === p.key)).toBe(false);
    expect(forage.telemetry()).toMatchObject({ kit: true });
    expect(forage.telemetry().sinceRainH).toBeLessThan(0.1);
    expect(again.game.saved().slices!.forage).toEqual(save.slices!.forage);
    expect(again.lying).toEqual([]);
    // days on: each is forgotten at the midnight it bears again from, and shows
    const longest = Math.max(...pts.map((p) => forageKind(p.kind).regrowDays));
    const shortest = Math.min(...pts.map((p) => forageKind(p.kind).regrowDays));
    passDays(again.game, shortest);
    expect(forage.picked.size).toBe(pts.filter((p) => forageKind(p.kind).regrowDays > shortest).length);
    passDays(again.game, longest - shortest);
    expect(forage.picked.size).toBe(0);
    again.settle();
    for (const p of pts) expect(again.shown().some((q) => q.key === p.key)).toBe(true);
    expect((again.game.saved().slices!.forage as { d: { p: number[] } }).d.p).toEqual([]);
  });

  it('a new game forgets it all; a slice that is rubbish is passed over', async () => {
    const r = await forageRig({ start: 'garage' });
    r.settle();
    r.pick(r.shown()[0]);
    expect(r.game.snapshot().slices?.forage).toBeDefined();
    r.game.newGame();
    expect(forage.picked.size).toBe(0);
    expect(r.game.snapshot().slices).toBeUndefined();
    const bad = await forageRig({ save: { hour: 9, slices: { forage: { v: 1, d: { p: [1, 'x', -4, 2, 12345, 7.9, 99], rain: 'wet', kit: 1 } } } } as never });
    expect(bad.game.reports).toEqual([]);
    expect(forage.picked.size).toBe(1);
    expect(forage.picked.get(12345)).toBe(7);
    expect(forage.telemetry()).toMatchObject({ kit: false, sinceRainH: null });
  });
});

describe('forage module: the developer and the scripts', () => {
  it('the tab: the eighty kinds by category, the tools and pages, a stack into the hands known or not, regrow, rain, the mark, the region’s kinds', async () => {
    const r = await forageRig({ pack: 4 });
    r.settle();
    const tab = r.game.openTab('forage')!;
    const headings = tab.made.filter((m) => m.startsWith('heading')).map((m) => m.slice(9));
    expect(headings.slice(0, 3)).toEqual(['现在', '动手', '工具与图鉴页']);
    for (const c of Object.values(FORAGE_CATS)) expect(headings).toContain(`${c.name.zh}（${c.count}）`);
    expect(headings[headings.length - 1]).toBe('这片区域长什么');
    const labels = tab.buttons.map((b) => b.label);
    for (const k of FORAGE_KINDS) expect(labels).toContain(k.name.zh);
    for (const id of [KNIFE, TROWEL, SICKLE, BASKET]) expect(labels).toContain(itemDef(id).name.zh);
    expect(labels.filter((l) => l.startsWith('页·'))).toHaveLength(10);
    const fake = { textContent: '' } as HTMLButtonElement;
    const press = (label: string): void => tab.buttons.find((b) => b.label === label)!.click(fake);
    // a full stack, and the kind known with it
    press('松露');
    expect(r.held('truffle')).toMatchObject({ item: 'truffle', n: itemDef('truffle').stack });
    expect(itemVeil('truffle')).toBeNull();
    expect(tab.message).toBe(`松露 ×${itemDef('truffle').stack} 到手了。`);
    // the switch off: the thing comes, the knowledge does not
    press('调出来的同时认得它：开');
    expect(fake.textContent).toBe('调出来的同时认得它：关');
    press('人参');
    expect(r.held('ginseng')).toBeTruthy();
    expect(itemVeil('ginseng')).not.toBeNull();
    expect(tab.message).toBe(`不认识的根茎 ×${itemDef('ginseng').stack} 到手了。`);
    press('小刀');
    press('页·野菜与叶菜');
    expect(r.held(KNIFE)).toBeTruthy();
    expect(r.held(pageId('greens'))).toBeTruthy();
    // regrow everything
    const pt = r.shown().find((p) => p.layer === 'ground')!;
    r.pick(pt);
    press('全部重新长出');
    expect(tab.message).toBe('1 个采过的点重新长出来了。');
    r.frames(2);
    expect(r.shown().some((p) => p.key === pt.key)).toBe(true);
    // rain, and the end of it
    press('下雨');
    expect(r.forced()).toBe('rain');
    expect(forage.telemetry().sinceRainH).toBe(0);
    press('雨停');
    expect(r.forced()).toBeNull();
    // every point within 150 m marked: the look-out reaches that far
    const before = r.shown().length;
    press('标出 150 米内的采集点：关');
    expect(fake.textContent).toBe('标出 150 米内的采集点：开');
    r.settle(600);
    expect(r.shown().length).toBeGreaterThan(before);
    expect(Math.max(...r.shown().map((p) => p.dist))).toBeGreaterThan(80);
    // what grows in the region one stands in, from its flora table
    const region = tab.made.filter((m) => m.startsWith('box')).pop()!;
    expect(region).toContain(`${FOREST.label}（`);
    for (const name of ['牛肝菌', '蓝莓', '松子', '松脂']) expect(region).toContain(name);
    expect(region).not.toContain('蛤蜊');
    // the status line
    const tick = r.game.devTabs.get('forage')!.tick!;
    tick();
    expect(tab.made.find((m) => m.startsWith('box'))).toContain('米内');
    expect(r.game.reports).toEqual([]);
  });

  it('the robot forager: to the nearest point within its stop and the pick, again and again, with what it took', async () => {
    const r = await forageRig({ pack: 6 });
    r.settle();
    r.player.receive({ kind: 'item', item: newItem(BASKET) });
    const w = r.player.walker;
    const here = { x: w.x, z: w.z };
    const within = r.shown().filter((p) => p.dist <= 25).length;
    expect(within).toBeGreaterThan(2);
    expect(forage.harness.robot(25)).toBe(true);
    let steps = 0;
    while (forage.harness.robotReport().on && steps < 60 * 600) {
      r.frames(1);
      steps++;
    }
    const report = forage.harness.robotReport();
    expect(report.done).toBe(true);
    // every point that showed within the stop was picked (and the few that came to show on the way)
    expect(report.picked).toBeGreaterThanOrEqual(within);
    expect(forage.picked.size).toBe(report.picked);
    expect(report.seconds).toBeCloseTo(steps / 60, 0);
    expect(report.perPoint).toBeGreaterThan(0.5);
    // (at a walk: the metres it walked take at least that long at 1.9 m/s)
    expect(report.walked / 1.9).toBeLessThanOrEqual(report.seconds + 0.1);
    expect(Math.hypot(w.x - here.x, w.z - here.z)).toBeLessThanOrEqual(25 + 2);
    console.log(`[v3 forage] the robot at a forest stop of 25 m: ${report.picked} points, ${report.portions} portions, ${report.seconds.toFixed(1)} game seconds (${report.perPoint.toFixed(1)} a point), ${report.walked.toFixed(0)} m walked`);
    expect(r.game.reports).toEqual([]);
  });
});
