// The kitchen, step 2 (docs/V3/plan/cooking.md): its things in the catalogue — the sixty ingredients whole and cut, the
// cookware, every dish — each with a look, and every look's model there, with the pieces the game moves and the
// places it puts things at.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasItem, itemCatalogueProblems, itemDef, itemPaint, newItem } from '../../src/core/modcar/items';
import { DISHES } from '../../src/core/v3/kitchen/dishes';
import { BOARD, COOKWARE_ITEMS, cutItem, dishItem, DISH_ITEMS, GAS, ingItem, INGREDIENT_ITEMS, itemOfPortion, KITCHEN_ITEMS, PLATE, BOWL, portionOf, recipeLine, STOVE, VESSEL, WAY_OF } from '../../src/core/v3/kitchen/items';
import { DISH_LOOK, FAIL_LOOK, FOOD_LOOK, lookProblems, MEALS, PREPS } from '../../src/core/v3/kitchen/looks';
import { FOODS } from '../../src/core/v3/kitchen/pantry';
import kitchenModule from '../../src/game/modcar/v3/kitchen/index';

const MODELS = path.resolve(__dirname, '../../public/models/modcar/items');

/** what a GLB holds: its nodes' names and how many triangles */
function glb(model: string): { nodes: string[]; tris: number; mats: string[] } {
  const b = fs.readFileSync(path.join(MODELS, `${model}.glb`));
  const len = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + len).toString('utf8')) as {
    nodes?: { name: string }[];
    meshes?: { primitives: { indices: number; material: number }[] }[];
    accessors: { count: number }[];
    materials?: { name: string }[];
  };
  let tris = 0;
  for (const m of j.meshes ?? []) for (const p of m.primitives) tris += j.accessors[p.indices].count / 3;
  return { nodes: (j.nodes ?? []).map((n) => n.name), tris, mats: (j.materials ?? []).map((m) => m.name) };
}

describe('the kitchen: its things in the catalogue', () => {
  it('is a module that brings its kinds as it is loaded', () => {
    expect(kitchenModule.id).toBe('kitchen');
    for (const r of KITCHEN_ITEMS) expect(hasItem(r.id), r.id).toBe(true);
    expect(itemCatalogueProblems()).toEqual([]);
  });

  it('has each of the sixty whole, and cut where it is cut at all', () => {
    expect(lookProblems()).toEqual([]);
    let cut = 0;
    for (const f of FOODS) {
      const d = itemDef(ingItem(f.id));
      expect(d.name.zh).toBe(f.zh);
      expect(d.stars).toBe(f.star);
      expect(d.model).toBe(`food_${f.id}`);
      expect(d.blurb.length, f.id).toBeGreaterThan(4);
      // what is safe raw can be eaten as it is, and nothing else
      expect(!!d.eat, f.id).toBe(f.raw);
      const look = FOOD_LOOK[f.id];
      if (look.chop) {
        expect(look.prep, f.id).not.toBeNull();
        const c = itemDef(cutItem(f.id));
        expect(c.model).toBe(`prep_${look.prep}`);
        expect(c.paint).toBe(look.flesh);
        cut++;
      } else expect(hasItem(cutItem(f.id)), f.id).toBe(false);
    }
    expect(INGREDIENT_ITEMS.length).toBe(60 + cut);
    // most of them are cut; what is poured, cracked or dropped in whole is not
    expect(cut).toBeGreaterThanOrEqual(40);
    expect(cut).toBeLessThan(60);
  });

  it('tells a thing in the hands from the portion it is, and back', () => {
    expect(portionOf(ingItem('tomato'))).toEqual({ id: 'tomato' });
    expect(portionOf(cutItem('tomato'))).toEqual({ id: 'tomato', cut: 1 });
    expect(portionOf('junk_tv')).toBeNull();
    expect(itemOfPortion({ id: 'tomato' })).toBe(ingItem('tomato'));
    expect(itemOfPortion({ id: 'tomato', cut: 1 })).toBe(cutItem('tomato'));
    // (rice is never cut: a portion of it is the thing itself whatever it says)
    expect(itemOfPortion({ id: 'rice', cut: 1 })).toBe(ingItem('rice'));
    // (a stand-in is its own kind)
    expect(itemOfPortion({ id: 'forage_something' })).toBe('forage_something');
  });

  it('has a vessel for each way of cooking, the stove and what goes with it', () => {
    for (const [way, id] of Object.entries(VESSEL)) {
      expect(hasItem(id), id).toBe(true);
      expect(WAY_OF[id]).toBe(way);
    }
    for (const id of [STOVE, GAS, BOARD, PLATE, BOWL]) expect(hasItem(id), id).toBe(true);
    // (thirteen of the first batch, and the cooler of the second)
    expect(COOKWARE_ITEMS.length).toBe(14);
    // plates and bowls stack; what has a state of its own does not
    expect(itemDef(PLATE).stack).toBe(6);
    expect(itemDef(STOVE).stack).toBeUndefined();
    expect(itemDef(GAS).stack).toBeUndefined();
  });

  it('has every dish as a kind of its own, in a shape and two colours, and the three failures', () => {
    expect(DISH_ITEMS.length).toBe(DISHES.length + 3);
    const shapes = new Set<string>();
    for (const d of DISHES) {
      const it = itemDef(dishItem(d.id));
      const look = DISH_LOOK[d.id];
      expect(it.name.zh).toBe(d.zh);
      expect(it.stars).toBe(d.stars);
      expect(it.model).toBe(`meal_${look.meal}`);
      expect(MEALS).toContain(look.meal);
      expect(it.blurb).toBe(`${recipeLine(d)}。`);
      // what a serving gives is on the serving, not on the kind
      expect(it.eat?.food).toBe(0);
      shapes.add(look.meal);
    }
    for (const k of ['mess', 'burnt', 'raw'] as const) {
      expect(itemDef(dishItem(k)).stars).toBe(0);
      shapes.add(FAIL_LOOK[k].meal);
    }
    // every shape that was modelled is some dish's
    expect([...shapes].sort()).toEqual([...MEALS].sort());
    expect(recipeLine(DISHES.find((d) => d.id === 'tomato_egg')!)).toBe('番茄、任意蛋 · 煎炒');
  });

  it('paints food with little gloss: a tomato is no car', () => {
    const p = itemPaint(newItem(ingItem('tomato')));
    expect(p.matte).toBeGreaterThan(0);
    expect(p.matte).toBeLessThan(0.5);
    // (and what has none of its own says nothing)
    expect('matte' in itemPaint(newItem('food_chips'))).toBe(false);
  });
});

describe('the kitchen: its models', () => {
  it('has a model to every look, of a few hundred triangles', () => {
    const want = new Set<string>();
    for (const r of KITCHEN_ITEMS) want.add(itemDef(r.id).model);
    for (const p of PREPS) want.add(`prep_${p}`);
    let total = 0;
    for (const m of want) {
      expect(fs.existsSync(path.join(MODELS, `${m}.glb`)), m).toBe(true);
      const g = glb(m);
      expect(g.tris, m).toBeGreaterThan(20);
      expect(g.tris, m).toBeLessThanOrEqual(1400);
      total += g.tris;
    }
    // sixty ingredients, thirteen prepared shapes, fourteen pieces of cookware (the cooler of the second batch with them),
    // thirty-four dishes, and the lump spoiled food is (the forage's own: forage_lump)
    expect(want.size).toBe(60 + PREPS.length + 14 + MEALS.length + 1);
    expect(want.has('forage_lump')).toBe(true);
    expect(total / want.size).toBeLessThan(700);
  });

  it('keeps apart what moves on the cookware, and marks where things go', () => {
    const stove = glb(STOVE).nodes;
    for (const n of ['COVER', 'LEVER', 'KNOB_fire', 'M_pot', 'M_flame', 'M_can']) expect(stove, n).toContain(n);
    const board = glb(BOARD).nodes;
    for (const n of ['P_knife', 'M_food', 'M_knife']) expect(board, n).toContain(n);
    for (const id of Object.values(VESSEL)) expect(glb(id).nodes, id).toContain('M_food');
    for (const id of [VESSEL.boil, VESSEL.steam, VESSEL.bake, VESSEL.brew]) expect(glb(id).nodes, id).toContain('LID');
  });

  it('is made of the materials the game knows', () => {
    const known = new Set(['paint', 'paint_b', 'ceramic', 'steel', 'alu', 'chrome', 'trim', 'rubber', 'rust', 'fabric', 'leather', 'wood', 'plastic_int', 'glass', 'cap_oil', 'cap_water', 'emit']);
    for (const r of KITCHEN_ITEMS) for (const m of glb(itemDef(r.id).model).mats) expect(known.has(m), `${r.id}: ${m}`).toBe(true);
  });
});
