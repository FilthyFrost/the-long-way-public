/**
 * The table of forage kinds (src/core/v3/forage/kinds.ts) and its items (items.ts): the catalogue is whole,
 * the numbers hang together, the rows register as items, and what plants bear are kinds that exist.
 */
import { describe, expect, it } from 'vitest';
import { itemCatalogueProblems, itemDef, newItem, registerItemCat, registerItems, stackMax } from '../../src/core/modcar/items';
import { PLANTS } from '../../src/core/world/plants';
import { forageItemCat, forageItemCats, forageItemRows, SPOILED_FORAGE } from '../../src/core/v3/forage/items';
import { FORAGE_INDEX, FORAGE_KINDS, forageKind } from '../../src/core/v3/forage/kinds';
import { FORAGE_CATS, type ForageCat } from '../../src/core/v3/forage/types';

describe('the 89 kinds of forage', () => {
  it('are 89, as many of each category as the catalogue says, each with an id of its own and a name in both languages', () => {
    expect(FORAGE_KINDS.length).toBe(89);
    expect(new Set(FORAGE_KINDS.map((k) => k.id)).size).toBe(89);
    for (const cat of Object.keys(FORAGE_CATS) as ForageCat[]) expect(FORAGE_KINDS.filter((k) => k.cat === cat).length, cat).toBe(FORAGE_CATS[cat].count);
    for (const k of FORAGE_KINDS) {
      expect(k.id).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(k.name.zh.length).toBeGreaterThan(0);
      expect(k.name.en.length).toBeGreaterThan(0);
      expect(k.blurb.length).toBeGreaterThan(3);
      expect(k.where.zh.length).toBeGreaterThan(3);
      expect(k.where.en.length).toBeGreaterThan(3);
      expect(FORAGE_INDEX[k.id]).toBe(FORAGE_KINDS.indexOf(k));
    }
    expect(() => forageKind('no_such_kind')).toThrow();
  });

  it('numbers hang together: a raw portion is a snack, soft things go off, the rare are few and slow to come back', () => {
    for (const k of FORAGE_KINDS) {
      expect(k.yield[0]).toBeGreaterThanOrEqual(1);
      expect(k.yield[1]).toBeGreaterThanOrEqual(k.yield[0]);
      expect(k.yield[1]).toBeLessThanOrEqual(4);
      expect(k.regrowDays).toBeGreaterThanOrEqual(1);
      expect(k.item.mass).toBeGreaterThan(0);
      expect(k.item.stack).toBeGreaterThanOrEqual(3);
      if (k.item.eat) expect(k.item.eat.food).toBeLessThanOrEqual(14);
      if (k.rarity === 'legendary') {
        expect(k.yield[1]).toBe(1);
        expect(k.regrowDays).toBeGreaterThanOrEqual(10);
        expect(k.item.stars).toBe(5);
      }
      if (k.cat === 'resource' && k.id !== 'honeycomb') expect(k.item.eat).toBeUndefined();
      // what is soft goes off within a week; minerals never
      if (k.cat === 'mushroom' && k.id !== 'reishi' && k.id !== 'truffle') expect(k.item.perishHours).toBeLessThanOrEqual(48);
      if (k.item.tags?.includes('stone') || k.item.tags?.includes('chemical')) expect(k.item.perishHours).toBeUndefined();
    }
    expect(FORAGE_KINDS.filter((k) => k.rarity === 'legendary').map((k) => k.id).sort()).toEqual(['cordyceps', 'ginseng', 'snow_lotus', 'truffle']);
    // a stop's picking: fifteen portions of the commonest foods are about a region's driving (a region is about 21 food)
    const common = FORAGE_KINDS.filter((k) => k.rarity === 'common' && k.item.eat && k.item.eat.food > 0 && k.item.eat.hp >= 0);
    const mean = common.reduce((a, k) => a + k.item.eat!.food, 0) / common.length;
    expect(mean * 15).toBeGreaterThan(40);
    expect(mean * 15).toBeLessThan(110);
  });

  it('poisonous mushrooms make one ill (the death cap hurts at once too) and a documented double has an edible counterpart', () => {
    const toxic = FORAGE_KINDS.filter((k) => k.item.eat?.effect?.startsWith('sick'));
    expect(toxic.map((k) => k.id).sort()).toEqual(['death_cap', 'fly_agaric', 'glow_mushroom']);
    expect(FORAGE_KINDS.filter((k) => k.item.eat && k.item.eat.hp < 0).map((k) => k.id)).toEqual(['death_cap']);
    for (const k of toxic) {
      expect(k.item.eat!.effect).toMatch(/^sick/);
      expect(k.item.eat!.food).toBe(1);
      if (!k.twin) continue;
      const twin = forageKind(k.twin);
      expect(twin.cat).toBe('mushroom');
      expect(twin.item.eat!.hp).toBeGreaterThanOrEqual(0);
    }
    expect(forageKind('death_cap').item.eat!.hp).toBeLessThan(forageKind('fly_agaric').item.eat!.hp);
  });

  it('register as items: ten categories, 89 kinds and what the spoiled become, with nothing wrong in the catalogue', () => {
    for (const c of forageItemCats()) registerItemCat(c);
    registerItems(forageItemRows());
    expect(itemCatalogueProblems()).toEqual([]);
    for (const k of FORAGE_KINDS) {
      const d = itemDef(k.id);
      expect(d.cat).toBe(forageItemCat(k.cat));
      expect(stackMax(k.id)).toBe(k.item.stack);
      expect(d.tags).toContain('forage');
      if (k.item.perishHours) expect(d.perish).toEqual({ hours: k.item.perishHours, into: SPOILED_FORAGE });
      const one = newItem(k.id, { n: 2 });
      expect(one.n).toBe(2);
    }
    expect(itemDef(SPOILED_FORAGE).stack).toBeGreaterThanOrEqual(12);
  });

  it('what plants bear are kinds that exist; and the kinds no plant bears yet are listed', () => {
    const borne = new Set<string>();
    for (const p of PLANTS) {
      if (!p.bears) continue;
      expect(FORAGE_INDEX[p.bears.forage], `${p.id} bears ${p.bears.forage}`).toBeDefined();
      borne.add(p.bears.forage);
    }
    const missing = FORAGE_KINDS.filter((k) => !borne.has(k.id)).map((k) => k.id);
    // (node W3 adds a plant for each of these; this number only goes down)
    console.log(`kinds no plant bears yet: ${missing.length}`);
    expect(missing.length).toBeLessThanOrEqual(63);
  });
});
