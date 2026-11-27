/**
 * The blueprints module (docs/V3/plan/finish.md §六 2): as it is loaded a sheet for every recipe that is learnt from
 * one goes into the catalogue (folded blue sheets, a darker blue the further down the road they belong); installed, it
 * is the system "blueprints" (system.ts): a sheet in the hands, the right button learns it — the sheet is used up, and
 * what it shows can be made at any bench from then on.
 */
import { BLUEPRINT_RECIPES, blueprintOf, type Cost } from '../../../../core/modcar/crafting';
import { hasItem, MATERIAL_IDS, MATERIALS, registerItems } from '../../../../core/modcar/items';
import type { GameModule } from '../../kernel/modules';
import { Blueprints } from './system';

/** what a making asks for, in words ("废料 30、元件 2") */
export function costWords(c: Cost): string {
  return MATERIAL_IDS.filter((m) => (c[m] ?? 0) > 0)
    .map((m) => `${MATERIALS[m].name.zh} ${c[m]}`)
    .join('、');
}

/** the sheets' blue, by the chapter they belong to (2 … 8) */
const BLUES = [0x3f8fd0, 0x3f8fd0, 0x3f8fd0, 0x3a86c2, 0x3378b4, 0x2f6fb5, 0x2a5fa0, 0x274f94, 0x1f3f7c];

for (const r of BLUEPRINT_RECIPES) {
  const id = blueprintOf(r.id);
  if (hasItem(id)) continue;
  registerItems([
    {
      id,
      cat: 'gear',
      name: { zh: `图纸：${r.name.zh}`, en: `Blueprint: ${r.name.en}` },
      stars: Math.max(1, Math.min(5, r.chapter - 2)),
      mass: 0.05,
      carry: 'small',
      tags: ['blueprint'],
      // (a sheet of paper: the recycler's one scrap for anything)
      salvage: {},
      // (a folded sheet: the photo's card, blue)
      model: 'nd_photo',
      paint: BLUES[Math.min(BLUES.length - 1, r.chapter)],
      paint2: 0xe8eef5,
      blurb: `一张${r.name.zh}的图纸。拿着它按 E 学会，图纸就用掉了；以后在哪张工作台上都能做，一个要${costWords(r.cost)}。`,
    },
  ]);
}

export const blueprints = new Blueprints();

export default {
  id: 'blueprints',
  systems: [blueprints],
} satisfies GameModule;
