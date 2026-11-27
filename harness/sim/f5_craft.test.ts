/**
 * F5 (docs/V3/plan/finish.md §六): recycling and making. Two materials — scrap, which anything gives a little of, and
 * components, which only what has a motor or a board in it gives; what the recycler gives against the plan's table;
 * the bench's list, which is what one has learnt to make; blueprints learnt with the right button and used up; the
 * sheets' places down the road, each with the next sheet not learnt yet.
 */
import { describe, expect, it } from 'vitest';
import { newInstance } from '../../src/core/modcar/build';
import { BLUEPRINT_RECIPES, blueprintOf, chapterAt, CHAPTER_KM, itemSalvage, nextBlueprint, partSalvage, partStars, RECIPES, recipeDef, recipeOfBlueprint, recipeOpen, sheetAt, SHEET_KEPT_M, stockOf, toolSalvage, type Cost, type Makes } from '../../src/core/modcar/crafting';
import { hasItem, itemDef, ITEMS, MATERIAL_IDS, MATERIALS, newItem } from '../../src/core/modcar/items';
import { PARTS, partDef } from '../../src/core/modcar/parts';
import { plan } from '../../src/core/modcar/schedule';
import { newTool } from '../../src/core/modcar/tools';
import type { GameContext } from '../../src/game/modcar/kernel/context';
import type { HandsUse, Held } from '../../src/game/modcar/player';
import { costWords } from '../../src/game/modcar/v3/blueprints/index';
import { Blueprints } from '../../src/game/modcar/v3/blueprints/system';
// (the modules' own things — Nomad Drive's tools, the fishing's rods, the blueprints — registered as the game installs them)
import.meta.glob('../../src/game/modcar/v3/*/index.ts', { eager: true });

const salvageOfMade = (m: Makes): Cost => {
  if (m.kind === 'item') return itemSalvage(newItem(m.item));
  if (m.kind === 'tool') return toolSalvage(newTool(m.tool, { litres: 0, ...(m.tier ? { tier: m.tier } : {}) }));
  const out: Cost = { ...partSalvage(newInstance(m.part)) };
  if (m.tire) {
    const t = partSalvage(newInstance(m.tire));
    for (const k of MATERIAL_IDS) if (t[k]) out[k] = (out[k] ?? 0) + (t[k] ?? 0);
  }
  return out;
};

describe('F5: two materials', () => {
  it('scrap and components, and nothing else anywhere', () => {
    expect([...MATERIAL_IDS]).toEqual(['scrap', 'components']);
    expect(MATERIALS.scrap.name.zh).toBe('废料');
    expect(MATERIALS.components.name.zh).toBe('元件');
    for (const d of ITEMS) for (const k of Object.keys(d.salvage)) expect(MATERIAL_IDS, `${d.id}: ${k}`).toContain(k);
    for (const p of PARTS) for (const k of Object.keys(partSalvage(newInstance(p.id)))) expect(MATERIAL_IDS, `${p.id}: ${k}`).toContain(k);
  });

  it('a game kept before there were two: its chemicals are its components, one for one; its organics are gone', () => {
    expect(stockOf({ scrap: 12, organics: 30, chemicals: 7 })).toEqual({ scrap: 12, components: 7 });
    expect(stockOf({ scrap: 5, components: 2 })).toEqual({ scrap: 5, components: 2 });
    expect(stockOf({ scrap: 5, components: 2, chemicals: 3 })).toEqual({ scrap: 5, components: 5 });
    expect(stockOf(null)).toEqual({ scrap: 0, components: 0 });
    expect(stockOf({ scrap: -3, components: Number.NaN })).toEqual({ scrap: 0, components: 0 });
  });

  it('anything gives the recycler a little: one scrap at the least, a stack one for each; what is in a thing gives nothing more', () => {
    for (const d of ITEMS) {
      const s = itemSalvage(newItem(d.id));
      expect((s.scrap ?? 0) + (s.components ?? 0), d.id).toBeGreaterThanOrEqual(1);
    }
    expect(itemSalvage(newItem('food_chips'))).toEqual({ scrap: 1 });
    const water = newItem('drink_water');
    const full = itemSalvage(water);
    water.litres = 0;
    expect(itemSalvage(water)).toEqual(full);
    // (but what is made of nothing solid says so of itself: the start's board does not send one to the recycler with one's biscuits)
    expect(itemDef('food_chips').salvage).toEqual({});
    expect(itemDef('crate_parts').salvage).toEqual({ scrap: 20 });
  });
});

describe('F5: what the recycler gives (the plan\'s table)', () => {
  const range = (cat: string, key: 'scrap' | 'components'): [number, number] => {
    const vs = PARTS.filter((p) => p.cat === cat).map((p) => partSalvage(newInstance(p.id))[key] ?? 0);
    return [Math.min(...vs), Math.max(...vs)];
  };

  it('an engine 20–180 scrap and 2–16 components, a gearbox 10–60 and 1–7, a turbo 10–90 and 2–12, by its stars', () => {
    const within = (r: [number, number], lo: number, hi: number): void => {
      expect(r[0]).toBeGreaterThanOrEqual(lo);
      expect(r[1]).toBeLessThanOrEqual(hi);
    };
    within(range('engine', 'scrap'), 20, 180);
    within(range('engine', 'components'), 2, 16);
    within(range('gearbox', 'scrap'), 10, 60);
    within(range('gearbox', 'components'), 1, 7);
    within(range('turbo', 'scrap'), 10, 90);
    within(range('turbo', 'components'), 2, 12);
    // more stars, more of both
    const engines = PARTS.filter((p) => p.cat === 'engine').sort((a, b) => partStars(a.id) - partStars(b.id));
    const lo = partSalvage(newInstance(engines[0].id));
    const hi = partSalvage(newInstance(engines[engines.length - 1].id));
    expect(hi.scrap!).toBeGreaterThan(lo.scrap!);
    expect(hi.components!).toBeGreaterThan(lo.components!);
  });

  it('a tyre, a door, a bonnet: 2–30 scrap and no components', () => {
    for (const cat of ['tire', 'door', 'hood']) {
      const s = range(cat, 'scrap');
      expect(s[0]).toBeGreaterThanOrEqual(2);
      expect(s[1]).toBeLessThanOrEqual(30);
      expect(range(cat, 'components')).toEqual([0, 0]);
    }
  });

  it('components only from what has a motor or a board in it', () => {
    const cats = new Set(PARTS.filter((p) => (partSalvage(newInstance(p.id)).components ?? 0) > 0 && p.id !== 'roof_solar').map((p) => p.cat));
    expect([...cats].sort()).toEqual(['battery', 'engine', 'gearbox', 'houseBattery', 'radio', 'turbo']);
    const things = ITEMS.filter((d) => (d.salvage.components ?? 0) > 0)
      .map((d) => d.id)
      .sort();
    expect(things).toEqual(['crate_chem', 'crate_lye', 'junk_camera', 'junk_clockradio', 'junk_fax', 'junk_record', 'junk_solar_lamp', 'junk_transceiver', 'junk_tv', 'junk_tv_dead', 'nd_camera', 'nd_charger', 'nd_flashlight', 'nd_fridge', 'nd_grinder', 'nd_metal_detector', 'nd_polisher'].sort());
    // a television, a fax, a transceiver: ten or so and three or four; a fridge 18 and 6; a box of each sort
    for (const id of ['junk_tv', 'junk_fax', 'junk_transceiver']) {
      const s = itemDef(id).salvage;
      expect(s.scrap).toBeGreaterThanOrEqual(8);
      expect(s.scrap).toBeLessThanOrEqual(12);
      expect([3, 4]).toContain(s.components);
    }
    expect(itemDef('nd_fridge').salvage).toEqual({ scrap: 18, components: 6 });
    expect(itemDef('crate_parts').salvage).toEqual({ scrap: 20 });
    expect([10, 12]).toContain(itemDef('crate_chem').salvage.components);
    expect(itemDef('crate_chem').salvage.scrap).toBeUndefined();
  });
});

describe('F5: what the bench makes', () => {
  it('the list: the plastic scraper from the start, everything else from a sheet, chapter by chapter, at the plan\'s amounts', () => {
    expect(RECIPES.filter((r) => recipeOpen(r)).map((r) => r.id)).toEqual(['scraper_1']);
    expect(recipeDef('scraper_1').cost).toEqual({ scrap: 50 });
    const table: Record<string, [number, number, number]> = {
      crowbar: [2, 40, 0], jerrycan: [2, 60, 0], tire_kit: [2, 35, 0], roof_rack: [2, 70, 0], flashlight: [2, 30, 2],
      engine_kit: [3, 60, 3], charger: [3, 40, 4], ladder: [3, 45, 0], moto_rack: [3, 80, 0], wheel_road: [3, 80, 0], bat_std: [3, 40, 0], rad_std: [3, 60, 0],
      cot: [4, 70, 0], battery: [4, 20, 2], rain_bucket: [4, 50, 2],
      shovel: [5, 50, 0], creel: [5, 30, 0], spoon: [5, 15, 0], grill: [5, 25, 0], hitch_ball: [5, 40, 0],
      rod_swift: [6, 120, 6], grinder: [6, 90, 8], polisher: [6, 90, 8], wall_shelf: [6, 40, 0],
      // (a home on wheels' own, docs/V3/plan/finish.md §十一 2: 工具挂板、储物柜 40–90, 车载工作台 150 and 10; the rod rack with them)
      pegboard: [6, 40, 0], rod_rack: [6, 30, 0], locker: [6, 90, 0], van_bench: [6, 150, 10],
      metal_detector: [7, 110, 12], rod_pro: [7, 220, 14], bat_house: [7, 80, 10], roof_solar: [7, 120, 15],
      rod_sea: [8, 350, 24], rod_heron: [8, 280, 20],
    };
    expect(BLUEPRINT_RECIPES.map((r) => r.id)).toEqual(Object.keys(table));
    for (const r of BLUEPRINT_RECIPES) {
      const [chapter, scrap, comp] = table[r.id];
      expect(r.chapter, r.id).toBe(chapter);
      expect(r.cost, r.id).toEqual(comp ? { scrap, components: comp } : { scrap });
    }
    // in the order their sheets come: no chapter before an earlier one's
    for (let i = 1; i < BLUEPRINT_RECIPES.length; i++) expect(BLUEPRINT_RECIPES[i].chapter).toBeGreaterThanOrEqual(BLUEPRINT_RECIPES[i - 1].chapter);
    // (only the night rod's sheet is not found down the road)
    expect(BLUEPRINT_RECIPES.filter((r) => r.rare).map((r) => r.id)).toEqual(['rod_heron']);
  });

  it('makes no food, no medicine, no clothes and no paint any more (docs/V3/plan/finish.md §七)', () => {
    for (const r of RECIPES) {
      if (r.makes.kind === 'tool') expect(r.makes.tool, r.id).not.toBe('spray');
      if (r.makes.kind === 'item') expect(['food', 'drink', 'med', 'wear', 'pack'], r.id).not.toContain(itemDef(r.makes.item).cat);
    }
  });

  it('made, a thing is worth less to the recycler than it cost: half of each material at the most', () => {
    for (const r of RECIPES) {
      const back = salvageOfMade(r.makes);
      for (const m of MATERIAL_IDS) expect(back[m] ?? 0, `${r.id}: ${m}`).toBeLessThanOrEqual(Math.max(1, (r.cost[m] ?? 0) / 2));
    }
  });

  it('a sheet for every making that is learnt: called by what it makes, a thing of its own', () => {
    for (const r of BLUEPRINT_RECIPES) {
      const id = blueprintOf(r.id);
      expect(hasItem(id), id).toBe(true);
      const d = itemDef(id);
      expect(d.name.zh).toBe(`图纸：${r.name.zh}`);
      expect(d.tags).toContain('blueprint');
      expect(d.blurb).toContain('按右键学会');
      expect(d.blurb).toContain(costWords(r.cost));
      expect(recipeOfBlueprint(id)).toBe(r);
    }
    expect(costWords({ scrap: 30, components: 2 })).toBe('废料 30、元件 2');
    expect(blueprintOf('roof_rack')).toBe('bp_roof_rack');
    expect(recipeOfBlueprint('nd_crowbar')).toBeNull();
    expect(recipeOfBlueprint('bp_nothing')).toBeNull();
    expect(hasItem(blueprintOf('scraper_1'))).toBe(false);
    // (what the roof rack's, the ladder's and the motorcycle rack's make are parts, fitted as parts are)
    for (const id of ['roof_rack', 'ladder', 'moto_rack']) expect(partDef((recipeDef(id).makes as { part: string }).part).id).toBe(id);
  });
});

describe('F5: learning', () => {
  const rig = (): { learned: Set<string>; said: string[]; flashed: string[]; slots: (Held | null)[]; use: HandsUse } => {
    const learned = new Set<string>();
    const said: string[] = [];
    const flashed: string[] = [];
    const slots: (Held | null)[] = [{ kind: 'item', item: newItem('bp_roof_rack') }, null];
    const hands: HandsUse[] = [];
    const ctx = {
      player: { hands, slots, sel: 0, flashWhy: (w: string) => flashed.push(w) },
      learned,
      learn: (r: string) => (learned.has(r) ? false : (learned.add(r), true)),
      sound: () => undefined,
      ui: { say: (t: string) => said.push(t) },
    } as unknown as GameContext;
    new Blueprints().init(ctx);
    return { learned, said, flashed, slots, use: hands[0] };
  };

  it('a sheet in the hands: the right button learns it, the sheet is used up, and it is on the bench\'s list for good', () => {
    const r = rig();
    const h = r.slots[0]!;
    expect(r.use.claims(h)).toBe(true);
    expect(r.use.takesF?.(h)).toBe(true);
    expect(r.use.words?.(h)).toEqual([{ keys: ['RMB'], text: '学会 <b>车顶行李架</b>' }]);
    expect(recipeOpen(recipeDef('roof_rack'), r.learned)).toBe(false);
    // (the button held as the sheet came into the hands: nothing — it was down for something else)
    r.use.step?.(h, 1 / 60, true);
    expect(r.learned.size).toBe(0);
    r.use.step?.(h, 1 / 60, false);
    r.use.step?.(h, 1 / 60, true);
    expect([...r.learned]).toEqual(['roof_rack']);
    expect(r.slots[0]).toBeNull();
    expect(r.said[0]).toContain('学会了：车顶行李架');
    expect(recipeOpen(recipeDef('roof_rack'), r.learned)).toBe(true);
    // (a thing that is no sheet is not its business)
    expect(r.use.claims({ kind: 'item', item: newItem('nd_crowbar') })).toBe(false);
  });

  it('one known already says so and stays in the hands', () => {
    const r = rig();
    r.learned.add('roof_rack');
    const h = r.slots[0]!;
    expect(r.use.words?.(h)).toEqual([{ keys: ['RMB'], text: '学会 <b>车顶行李架</b>', off: true, why: '已经会做车顶行李架了' }]);
    r.use.step?.(h, 1 / 60, false);
    r.use.step?.(h, 1 / 60, true);
    expect(r.slots[0]).toBe(h);
    expect(r.flashed).toEqual(['已经会做车顶行李架了']);
    expect(r.said).toEqual([]);
  });
});

describe('F5: the sheets down the road', () => {
  it('the chapters by the kilometre: 12, 30, 50, 75, 105, 140, 190', () => {
    expect([0, 11.9, 12, 29.9, 30, 50, 75, 105, 140, 189.9, 190, 500].map(chapterAt)).toEqual([1, 1, 2, 2, 3, 4, 5, 6, 7, 7, 8, 8]);
    expect([...CHAPTER_KM].slice(2)).toEqual([12, 30, 50, 75, 105, 140, 190]);
  });

  it('the next sheet: the first not learnt, of a chapter one has come to; never the one a lake\'s master has', () => {
    const none = new Set<string>();
    expect(nextBlueprint(1, none)).toBeNull();
    expect(nextBlueprint(2, none)?.id).toBe('crowbar');
    expect(nextBlueprint(2, new Set(['crowbar']))?.id).toBe('jerrycan');
    expect(nextBlueprint(2, new Set(['crowbar', 'jerrycan', 'tire_kit', 'roof_rack', 'flashlight']))).toBeNull();
    expect(nextBlueprint(3, new Set(['crowbar', 'jerrycan', 'tire_kit', 'roof_rack', 'flashlight']))?.id).toBe('engine_kit');
    // (one in the hands, one lying at a place just passed: the one after)
    expect(nextBlueprint(2, none, (r) => r === 'crowbar' || r === 'jerrycan')?.id).toBe('tire_kit');
    const all = new Set(BLUEPRINT_RECIPES.filter((r) => !r.rare).map((r) => r.id));
    expect(nextBlueprint(8, all)).toBeNull();
  });

  it('a place keeps its sheet until it is learnt; the next place has another; a sheet missed comes again further on', () => {
    const learned = new Set<string>();
    const kept = new Map<string, { r: string; s: number }>();
    // two places of the second chapter, three kilometres apart
    expect(sheetAt('a', 2, 13_000, learned, kept)?.id).toBe('crowbar');
    expect(sheetAt('a', 2, 13_000, learned, kept)?.id).toBe('crowbar');
    expect(sheetAt('b', 2, 16_000, learned, kept)?.id).toBe('jerrycan');
    expect(kept.get('a')).toEqual({ r: 'crowbar', s: 13_000 });
    // the first one's learnt: asked again (one comes back), that place has the next one neither learnt nor at the other
    learned.add('crowbar');
    expect(sheetAt('a', 2, 13_000, learned, kept)?.id).toBe('tire_kit');
    // one in the hands is not given again
    expect(sheetAt('c', 2, 20_000, learned, kept, (r) => r === 'roof_rack')?.id).toBe('flashlight');
    // further on than SHEET_KEPT_M from where it lay, a sheet not learnt comes again: the jerrycan's, left at b
    expect(SHEET_KEPT_M).toBe(15_000);
    expect(sheetAt('d', 3, 16_000 + SHEET_KEPT_M + 500, learned, kept)?.id).toBe('jerrycan');
    // nothing left to learn so far: nothing (the place has something else), and the place is forgotten
    for (const r of BLUEPRINT_RECIPES) if (r.chapter <= 2) learned.add(r.id);
    kept.set('e', { r: 'crowbar', s: 28_000 });
    expect(sheetAt('e', 2, 28_000, learned, kept)).toBeNull();
    expect(kept.has('e')).toBe(false);
  });

  it('the plan: in each chapter as many places as it has sheets and one more, within its kilometres; from 190 km one every 12–16 km', () => {
    for (const seed of [7, 1000, 8919, 31337]) {
      const p = plan(seed, 330).filter((f) => 'blueprint' in f.thing);
      for (let c = 2; c <= 7; c++) {
        const here = p.filter((f) => 'blueprint' in f.thing && f.thing.blueprint === c);
        expect(here.length, `chapter ${c}`).toBe(BLUEPRINT_RECIPES.filter((r) => r.chapter === c && !r.rare).length + 1);
        for (const f of here) {
          expect(f.s / 1000).toBeGreaterThanOrEqual(CHAPTER_KM[c]);
          expect(f.s / 1000).toBeLessThanOrEqual(CHAPTER_KM[c + 1]);
        }
      }
      const far = p.filter((f) => 'blueprint' in f.thing && f.thing.blueprint === 8).map((f) => f.s / 1000);
      expect(far[0]).toBeGreaterThanOrEqual(190);
      expect(far[0]).toBeLessThanOrEqual(198);
      for (let i = 1; i < far.length; i++) {
        expect(far[i] - far[i - 1]).toBeGreaterThanOrEqual(12 - 1e-6);
        expect(far[i] - far[i - 1]).toBeLessThanOrEqual(16 + 1e-6);
      }
      // enough places for every sheet by 300 km, about one every eight to ten kilometres from the twelfth
      const by300 = p.filter((f) => f.s <= 300_000).length;
      expect(by300).toBeGreaterThanOrEqual(BLUEPRINT_RECIPES.filter((r) => !r.rare).length);
      expect((300 - 12) / by300).toBeLessThanOrEqual(10);
      expect((300 - 12) / by300).toBeGreaterThanOrEqual(6);
    }
  });

  it('driven: taking and learning every sheet as it comes, each is learnt in its chapter, in order, none twice', () => {
    for (const seed of [7, 1000, 8919]) {
      const learned = new Set<string>();
      const kept = new Map<string, { r: string; s: number }>();
      const order: string[] = [];
      plan(seed, 330)
        .filter((f) => 'blueprint' in f.thing)
        .forEach((f, i) => {
          const r = sheetAt(`p${i}`, (f.thing as { blueprint: number }).blueprint, f.s, learned, kept);
          if (!r) return;
          expect(learned.has(r.id)).toBe(false);
          // (never a sheet of a chapter one has not come to)
          expect(r.chapter).toBeLessThanOrEqual(chapterAt(f.s / 1000));
          learned.add(r.id);
          order.push(r.id);
        });
      expect(order).toEqual(BLUEPRINT_RECIPES.filter((r) => !r.rare).map((r) => r.id));
    }
  });

  it('driven past every other place: what was missed comes again — by 400 km everything of the first chapters is learnt, what is left is of the last ones', () => {
    const learned = new Set<string>();
    const kept = new Map<string, { r: string; s: number }>();
    plan(7, 400)
      .filter((f) => 'blueprint' in f.thing)
      .forEach((f, i) => {
        const r = sheetAt(`p${i}`, (f.thing as { blueprint: number }).blueprint, f.s, learned, kept);
        // (every other place is driven past: its sheet stays there)
        if (r && i % 2 === 0) learned.add(r.id);
      });
    // (half the places down 400 km: some twenty-five sheets of the twenty-nine. A sheet driven past comes again at the
    // first place fifteen kilometres on — which, the places twelve to sixteen kilometres apart from the 190th, may be
    // the next one driven past again: one of the sixth chapter's can stay behind so, the rest are the end of the list)
    const seq = BLUEPRINT_RECIPES.filter((r) => !r.rare);
    const left = seq.filter((r) => !learned.has(r.id));
    expect(learned.size).toBeGreaterThanOrEqual(24);
    expect(left.every((r) => r.chapter >= 6), left.map((r) => r.id).join(' ')).toBe(true);
    expect(seq.filter((r) => r.chapter <= 5).every((r) => learned.has(r.id))).toBe(true);
  });
});
