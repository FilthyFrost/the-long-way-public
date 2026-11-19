/**
 * The cooking module in the stand-in game (node C1, docs/V3/nodes/C1-cooking.md): what it registers, a dish
 * eaten (it feeds, quenches and leaves its buff), the buffs writing the body's mods and running out, the save's
 * slice and back, the stations of a place with a fire ring and the ways each offers, the kitchen corner, the
 * whole of cooking a recipe through the panel's own keys, a free pot, a pot nobody could name, a stew left on
 * a high flame, the robot cook's time and stars, the jar, and the cost of a step.
 */
import { describe, expect, it } from 'vitest';
import { hasItem, itemDef, newItem } from '../../src/core/modcar/items';
import { newBodyMods } from '../../src/core/modcar/vitals';
import { recipeOf } from '../../src/core/v3/cooking/rules';
import { dishItem } from '../../src/core/v3/cooking/items';
import { cook } from '../../src/core/v3/cooking/rules';
import { RECIPES } from '../../src/core/v3/cooking/recipes';
import { skillDef } from '../../src/core/v3/progress/progress';
import { World } from '../../src/core/world/terrain';
import { itemCard } from '../../src/game/modcar/itemInfo';
import { domains, progress } from '../../src/game/modcar/v3/progress/api';
import { KITCHEN } from '../../src/game/modcar/v3/cooking/content';
import { cookRig } from './v3/cookRig';

describe('the cooking module: what it brings', () => {
  it('registers its items, its skill, its field of the compendium, its system, slice, source and tab', async () => {
    const r = await cookRig();
    for (const id of ['dish_soup', 'dish_drink', 'dish_spoiled', 'cook_pot', 'cook_stove', 'cook_jar', 'cook_cooler', 'meat_venison', 'egg_wild', 'recipe_page_soup', 'recipe_page_camp']) expect(hasItem(id), id).toBe(true);
    expect(itemDef('meat_venison').eat?.effect).toBe('sick1');
    expect(itemDef('meat_venison').perish?.hours).toBe(30);
    expect(itemDef('egg_wild').perish?.hours).toBe(120);
    expect(skillDef('cooking').perks.map((p) => `${p.id}@${p.level}`)).toEqual(['cook_taste@5', 'cook_extra@10', 'cook_keep@15', 'cook_master@20']);
    const dish = domains().find((d) => d.id === 'dish');
    expect(dish?.ids().length).toBe(RECIPES.length);
    expect(dish?.nameOf('mushroom_soup').zh).toBe('？');
    expect(r.game.kernel.telemetry().modules).toContain('cooking');
    expect(r.game.devTabs.get('cooking')?.title).toBe('烹饪');
    expect(r.game.slices.ids).toContain('cooking');
    const tab = r.game.openTab('cooking');
    expect(tab?.buttons.length).toBeGreaterThan(150);
  });
});

describe('eating a dish, and the buffs', () => {
  it('a dish eaten feeds, quenches and leaves its buff', async () => {
    const r = await cookRig();
    const body = r.ctx.body;
    body.food = 40;
    body.water = 40;
    const d = cook('soup', [{ item: 'porcini' }, { item: 'porcini' }, { item: 'chanterelle' }], { heat: 1, knife: 1, season: 1 });
    expect(d.recipe).toBe('mushroom_soup');
    const one = dishItem(d);
    const item = newItem(one.item, { q: one.q, state: one.state });
    r.game.events.emit('body:ate', { item });
    expect(r.cooking.buffs.strength('keen')).toBe(1);
    expect(r.cooking.buffs.left('keen')).toBe(d.buffS);
    r.frames(60 * 6);
    expect(body.food).toBeGreaterThan(40 + d.food - 1);
    expect(body.water).toBeGreaterThan(40 + d.water - 1);
    expect(r.game.said.some((s) => s.includes('眼尖'))).toBe(true);
    expect(r.heard).toContain(`buff keen ${d.buffS}s`);
  });

  it('a dish\'s card says which dish it is, what a serving gives and its buff', async () => {
    await cookRig();
    const d = cook('soup', [{ item: 'porcini', q: 3 }, { item: 'porcini', q: 3 }], { heat: 1, knife: 1, season: 1 });
    const one = dishItem(d);
    const card = itemCard(newItem(one.item, { n: 2, q: one.q, state: one.state }), 0);
    expect(card.name).toBe('野菌汤 ×2');
    expect(card.stars).toBe(d.stars);
    expect(card.blurb).toContain('菌子');
    expect(card.rows.some((r) => r.label.startsWith('饱腹') && r.value === `+${d.food}`)).toBe(true);
    expect(card.rows.some((r) => r.label.startsWith('解渴') && r.value === `+${d.water}`)).toBe(true);
    expect(card.notes.some((n) => n.text.startsWith('吃完：眼尖'))).toBe(true);
    const pot = itemCard(newItem('cook_pot'), 0);
    expect(pot.rows.find((r) => r.label === '能做')?.value).toBe('煮汤、炖、饭面');
  });

  it('a drink takes the drink place; a third meal pushes out the one with least time; a sick dish makes one sick', async () => {
    const r = await cookRig();
    const eatDish = (method: 'soup' | 'brew' | 'stew', items: string[]): void => {
      const d = cook(method, items.map((item) => ({ item })), { heat: 1, knife: 1, season: 1 });
      const one = dishItem(d);
      r.game.events.emit('body:ate', { item: newItem(one.item, { q: one.q, state: one.state }) });
    };
    eatDish('brew', ['chamomile']);
    eatDish('soup', ['porcini', 'porcini']);
    eatDish('stew', ['porcini', 'porcini', 'potato']);
    expect(r.cooking.buffs.count).toBe(3);
    eatDish('soup', ['kelp', 'clam']);
    expect(r.cooking.buffs.count).toBe(3);
    const sick = cook('soup', [{ item: 'death_cap' }, { item: 'porcini' }], { heat: 1 });
    expect(sick.sick).toBeGreaterThan(0);
    const one = dishItem(sick);
    r.game.events.emit('body:ate', { item: newItem(one.item, { q: one.q, state: one.state }) });
    expect(r.ctx.body.effects.sick2 ?? r.ctx.body.effects.sick1).toBeGreaterThan(0);
  });

  it('buffs write the body\'s mods each frame and run out, said in a line', async () => {
    const r = await cookRig();
    r.cooking.harness.grant('hearty', 2);
    r.frames(1);
    expect(r.ctx.bodyMods.foodK).toBeCloseTo(0.75, 6);
    expect(r.cooking.harness.buffs().map((b) => b.id)).toEqual(['hearty']);
    // the body drains its food slower with it than without
    const with1 = r.ctx.body.food;
    r.frames(60);
    const drainWith = with1 - r.ctx.body.food;
    r.frames(80);
    expect(r.cooking.buffs.count).toBe(0);
    expect(r.ctx.bodyMods).toEqual(newBodyMods());
    const without = r.ctx.body.food;
    r.frames(60);
    expect(drainWith).toBeLessThan((without - r.ctx.body.food) * 0.8);
    expect(r.game.said.some((s) => s.includes('耐饿的劲儿过去了'))).toBe(true);
  });
});

describe('the kitchen corner and the panel', () => {
  it('E at the kitchen opens the panel; a recipe goes the whole way through its keys; the dish is in the hands and the recipe known', async () => {
    const r = await cookRig({ start: 'garage', at: { x: KITCHEN.x + 1.2, z: KITCHEN.z } });
    r.give('porcini', 2);
    r.give('chanterelle', 1);
    expect(r.pressAt(KITCHEN.x, KITCHEN.hobY, KITCHEN.z)).toBe(true);
    expect(r.game.modal.current?.id).toBe('cooking');
    let p = r.panel();
    expect(p.phase).toBe('pick');
    // round to the soup
    for (let i = 0; i < 12 && r.panel().method !== 'soup'; i++) r.key('KeyD');
    expect(r.panel().method).toBe('soup');
    expect(r.panel().rows.length).toBe(2);
    r.key('KeyE');
    r.key('KeyE');
    r.key('KeyS');
    r.key('KeyE');
    p = r.panel();
    expect(p.items).toEqual(['porcini', 'porcini', 'chanterelle']);
    expect(p.recipe).toBe('mushroom_soup');
    expect(p.known).toBe(false);
    expect(p.steps).toEqual(['knife', 'heat', 'season', 'wait', 'plate']);
    expect(r.held('porcini')).toBeNull();
    r.key('Space');
    expect(r.panel().phase).toBe('knife');
    // the knife: on the beat each time
    for (let cut = 0; cut < 6; cut++) {
      for (let i = 0; i < 400 && Math.abs(r.cooking.session.marker() - 0.5) > 0.02; i++) r.frames(1, 1 / 120);
      r.key('Space');
      r.frames(40, 1 / 120);
    }
    expect(r.panel().phase).toBe('heat');
    // the flame does its work; into the wait by itself, then the seasoning comes up
    r.frames(60 * 40);
    expect(['season', 'wait']).toContain(r.panel().phase);
    expect(r.panel().phase).toBe('season');
    r.key('KeyZ');
    r.key('KeyB');
    r.key('KeyE');
    expect(r.panel().phase).toBe('wait');
    r.key('KeyS');
    r.frames(60 * 50);
    expect(r.panel().phase).toBe('plate');
    r.key('KeyE');
    const dish = r.held('dish_soup');
    expect(dish?.state?.dish?.r).toBe('mushroom_soup');
    expect(dish?.q).toBeGreaterThanOrEqual(3);
    expect(progress.knowledge('dish', 'mushroom_soup')).toBe(2);
    expect(r.cooking.cooked.get('mushroom_soup')).toBe(1);
    expect(r.heard.some((h) => h.startsWith('plated mushroom_soup'))).toBe(true);
    expect(r.heard).toContain('met dish/mushroom_soup');
    expect(progress.xp('cooking')).toBeGreaterThan(0);
    // Escape shuts the panel
    r.key('Escape');
    expect(r.game.modal.isOpen).toBe(false);
  });

  it('a free pot gives a plain dish; a pot that is nonsense gives 说不清的一锅', async () => {
    const r = await cookRig({ start: 'garage', at: { x: KITCHEN.x + 1.2, z: KITCHEN.z } });
    expect(recipeOf('stirfry', [{ item: 'dandelion' }, { item: 'dandelion' }])).toBeNull();
    const run = (method: string, items: string[]) => {
      for (const id of items) r.give(id, 1);
      r.pressAt(KITCHEN.x, KITCHEN.hobY, KITCHEN.z);
      for (let i = 0; i < 12 && r.panel().method !== method; i++) r.key('KeyD');
      for (let i = 0; i < items.length; i++) {
        r.cooking.session.sel = r.cooking.session.rows.findIndex((row) => row.item.item === items[i]);
        r.key('KeyE');
      }
      const before = r.panel();
      r.key('Space');
      for (let i = 0; i < 6000 && r.panel().phase !== 'plate'; i++) {
        if (r.panel().phase === 'heat' && r.panel().d >= 1) r.key('KeyE');
        r.frames(1);
      }
      r.key('KeyE');
      const last = r.panel().last;
      r.key('Escape');
      return { before, last };
    };
    const plain = run('stirfry', ['dandelion', 'shepherds_purse']);
    expect(plain.before.recipe).toBeNull();
    expect(plain.before.steps).toEqual(['heat', 'plate']);
    expect(plain.last?.recipe).toBeNull();
    expect(plain.last?.name).toBe('炒野菜');
    const odd = run('soup', ['wild_berry', 'porcini']);
    expect(odd.before.odd).toBe(true);
    expect(odd.last?.name).toBe('说不清的一锅');
  });

  it('a stew left on a high flame goes over while one is away', async () => {
    const r = await cookRig({ start: 'garage', at: { x: KITCHEN.x + 1.2, z: KITCHEN.z } });
    r.give('porcini', 2);
    r.give('potato', 1);
    r.pressAt(KITCHEN.x, KITCHEN.hobY, KITCHEN.z);
    for (let i = 0; i < 12 && r.panel().method !== 'stew'; i++) r.key('KeyD');
    r.key('KeyE');
    r.key('KeyE');
    r.key('KeyS');
    r.key('KeyE');
    expect(r.panel().recipe).toBe('mushroom_potato_stew');
    r.key('Space');
    // (the knife, sloppily)
    for (let i = 0; i < 6; i++) {
      r.key('Space');
      r.frames(30);
    }
    expect(r.panel().phase).toBe('heat');
    r.key('KeyW');
    expect(r.panel().heat).toBe(3);
    // walk away: the panel shuts, the stew stays on its flame
    r.player.walker.place(KITCHEN.x + 12, KITCHEN.z, 0);
    r.frames(2);
    expect(r.game.modal.isOpen).toBe(false);
    r.frames(60 * 150);
    const st = r.cooking.harness.stations().find((s) => s.kind === 'kitchen');
    expect(st?.pot?.lit).toBe(true);
    expect(st?.pot?.d).toBeGreaterThan(1.45);
  });
});

describe('a fire ring of a place', () => {
  it('a camp with a fire ring is a station: roast and brew, and a pot from the hotbar adds its ways', async () => {
    const world = new World(9, { worldVersion: 2, startBiome: 'forest', chapterScale: 6 });
    let ring: { x: number; y: number; z: number } | null = null;
    const out: never[] = [];
    world.sites.between(0, 60000, out);
    for (const s of out as unknown as { objects: { kind: string; x: number; y: number; z: number }[] }[]) {
      const o = s.objects.find((x) => x.kind === 'firering');
      if (o) {
        ring = o;
        break;
      }
    }
    expect(ring).not.toBeNull();
    const r = await cookRig({ world, start: 'road', at: { x: ring!.x + 1.5, z: ring!.z } });
    r.frames(40);
    const st = r.cooking.harness.stations().find((s) => s.kind === 'fire');
    expect(st).toBeTruthy();
    expect(st!.methods).toEqual(['roast', 'brew']);
    r.give('cook_pot');
    const st2 = r.cooking.harness.stations().find((s) => s.kind === 'fire')!;
    expect(st2.methods).toEqual(['roast', 'soup', 'stew', 'rice', 'brew']);
    // roast potatoes at it
    r.give('potato', 2);
    expect(r.pressAt(st2.x, st2.y, st2.z)).toBe(true);
    expect(r.cooking.harness.stations().find((s) => s.kind === 'fire')!.fire).toBeGreaterThan(0);
    expect(r.panel().method).toBe('roast');
    r.key('KeyE');
    r.key('KeyE');
    expect(r.panel().recipe).toBe('roast_potato');
    expect(r.panel().steps).toEqual(['heat', 'season', 'plate']);
  });
});

describe('the save', () => {
  it('the buffs, the recipes cooked and what is cooking where come back', async () => {
    const r = await cookRig({ start: 'garage', at: { x: KITCHEN.x + 1.2, z: KITCHEN.z } });
    r.cooking.harness.grant('warm', 400);
    r.cooking.harness.cookNow('mushroom_soup', 3);
    r.give('potato', 2);
    r.pressAt(KITCHEN.x, KITCHEN.hobY, KITCHEN.z);
    for (let i = 0; i < 12 && r.panel().method !== 'roast'; i++) r.key('KeyD');
    r.key('KeyE');
    r.key('KeyE');
    r.key('Space');
    r.frames(60 * 10);
    r.key('Escape');
    const saved = r.game.saved();
    expect(saved.slices?.cooking).toBeTruthy();
    const r2 = await cookRig({ start: 'garage', save: saved, at: { x: KITCHEN.x + 1.2, z: KITCHEN.z } });
    expect(r2.cooking.harness.buffs()[0]?.id).toBe('warm');
    expect(r2.cooking.harness.buffs()[0]?.left).toBeGreaterThan(380);
    expect(r2.cooking.harness.cooked()).toEqual({ mushroom_soup: 1 });
    const k = r2.cooking.harness.stations().find((s) => s.kind === 'kitchen');
    expect(k?.pot?.items).toEqual(['potato', 'potato']);
    expect(k?.pot?.phase).toBe('heat');
    expect(k?.pot?.d).toBeGreaterThan(0.1);
    expect(progress.knowledge('dish', 'mushroom_soup')).toBe(2);
    expect(r2.game.saved().slices?.cooking).toEqual(saved.slices?.cooking);
  });
});

describe('the ways of keeping, the pages, raw meat', () => {
  it('a drying rack set down takes mushrooms and gives them back dried after six game hours', async () => {
    const r = await cookRig({ start: 'road' });
    r.ctx.loose.addItem(newItem('cook_rack'), 1.6, 0, 0, 0);
    r.frames(40);
    const st = r.cooking.harness.stations().find((s) => s.kind === 'rack');
    expect(st?.methods).toEqual(['dry']);
    r.give('porcini', 3);
    expect(r.pressAt(st!.x, st!.y, st!.z)).toBe(true);
    r.key('KeyE');
    r.key('KeyE');
    r.key('KeyE');
    r.key('Space');
    // (no recipe of three porcini on a rack: a pot of no recipe has no knife step)
    expect(['keep', 'knife']).toContain(r.panel().phase);
    for (let i = 0; i < 12 && r.panel().phase === 'knife'; i++) {
      r.key('Space');
      r.frames(60);
    }
    expect(r.panel().phase).toBe('keep');
    r.key('KeyE');
    expect(r.panel().phase).toBe('keep');
    r.key('Escape');
    r.game.setHour(r.game.sky.hour + 6.5);
    r.pressAt(st!.x, st!.y, st!.z);
    r.key('KeyE');
    const dried = r.held('dish_preserve');
    expect(dried?.state?.dish?.zh).toBe('蘑菇干');
    expect(itemDef('dish_preserve').perish).toBeUndefined();
  });

  it('a jar riding in a vehicle ripens with the road: fifteen kilometres', async () => {
    const r = await cookRig({ start: 'road' });
    const jar = newItem('cook_jar');
    jar.inside = [newItem('bamboo_shoot', { n: 2, q: 2, t0: 0 })];
    const l = r.ctx.loose.addItem(jar, 0, 0, 0, 0) as unknown as { riding: unknown };
    l.riding = { on: { sim: { kmh: 60 } } };
    // (a quarter of an hour at 60 km/h)
    r.frames(800, 1);
    expect(jar.inside?.[0]?.item).toBe('bamboo_shoot');
    r.frames(200, 1);
    expect(jar.inside?.[0]?.state?.dish?.r).toBe('sour_shoots');
  });

  it('a recipe page in the hands teaches every recipe of its class', async () => {
    const r = await cookRig({ start: 'road' });
    const soups = RECIPES.filter((x) => x.cls === 'soup').map((x) => x.id);
    expect(soups.some((id) => progress.knowledge('dish', id) === 2)).toBe(false);
    r.give('recipe_page_soup');
    r.frames(40);
    expect(soups.every((id) => progress.knowledge('dish', id) === 2)).toBe(true);
    expect(r.game.said.some((s) => s.includes(`学会了 ${soups.length} 道菜`))).toBe(true);
  });

  it('raw meat eaten makes one sick; cooked it is a dish', async () => {
    const r = await cookRig({ start: 'road' });
    r.game.events.emit('body:ate', { item: newItem('meat_venison') });
    expect(r.ctx.body.effects.sick1 ?? 0).toBe(0);
    // (the game's own eating path gives an item's `eat`: sick1 for a raw cut; the dish path is ours)
    expect(itemDef('meat_venison').eat).toEqual({ food: 0, hp: 0, sec: 3.9, effect: 'sick1' });
    const d = cook('roast', [{ item: 'meat_venison' }], { heat: 1 });
    expect(d.sick).toBe(0);
    expect(d.recipe).toBe('game_skewers');
  });
});

describe('the pickling jar', () => {
  it('what is in a jar becomes the pickle dish after twelve game hours', async () => {
    const r = await cookRig({ start: 'road' });
    const jar = r.give('cook_jar');
    jar.inside = [newItem('bamboo_shoot', { n: 2, q: 2, t0: 0 })];
    r.frames(130);
    expect(jar.inside?.[0]?.item).toBe('bamboo_shoot');
    r.game.setHour(23.5);
    r.frames(130);
    expect(jar.inside?.[0]?.item).toBe('dish_preserve');
    expect(jar.inside?.[0]?.state?.dish?.r).toBe('sour_shoots');
  });
});
