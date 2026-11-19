/**
 * The cooking module (node C1, docs/V3/nodes/C1-cooking.md): a few real actions at a fire or a stove — put
 * things in, cut, watch the flame, season, wait, plate — and a dish that feeds, quenches and leaves a buff.
 * Any pot gives a dish (at worst "a pot of something"); a pot that satisfies a recipe is that recipe, so
 * recipes are found by cooking as well as learnt from pages.
 *
 * As this file is loaded it brings the content into the game's catalogues, before a save is read: the two
 * item categories with the twelve kinds of dish, the spoiled dish and the cookware (the core's rows:
 * src/core/v3/cooking/items.ts), the cuts of meat and the eggs, the twelve recipe pages (content.ts), the
 * skill 烹饪 with its four perks, the compendium's field "dish" (a recipe not known yet is "？"), and the
 * lines on the cards of dishes and cookware (cards.ts).
 *
 * Installed, it is: the system "cooking" (system.ts: the stations, the pots on their flames, the buffs, eating
 * a dish, the jar, the robot cook for the scripts) with what is drawn of it (view.ts: the fire, the pot and what
 * is in it, steam and smoke; panel.ts: the cooking panel; buffHud.ts: the buffs by the vitals), the interactable
 * source the mark finds the stations through, the save slice "cooking", and the developer's tab 烹饪.
 *
 * It imports in plain Node and touches nothing of the page until the system is set up in a game that draws.
 *
 * To add a recipe: a row in src/core/v3/cooking/recipes.ts; nothing here changes. A new way of cooking or a
 * new piece of cookware: the core's types.ts and items.ts, and which station has or takes it (content.ts).
 */
import { registerItemCat, registerItems } from '../../../../core/modcar/items';
import { COOKWARE_CAT, cookingItemCats, cookingItemRows, DISH_CAT } from '../../../../core/v3/cooking/items';
import { RECIPES } from '../../../../core/v3/cooking/recipes';
import { registerSkill } from '../../../../core/v3/progress/progress';
import { registerItemCardLines } from '../../itemInfo';
import type { GameContext } from '../../kernel/context';
import type { GameModule } from '../../kernel/modules';
import { progress, registerDomain } from '../progress/api';
import { BuffHud } from './buffHud';
import { cookwareCardLines, dishCardLines } from './cards';
import { COOK_DOMAIN, COOK_SKILL, MEAT_ROWS, PAGE_ROWS, WORDS } from './content';
import { cookingTab } from './devTab';
import { CookPanel } from './panel';
import { Cooking } from './system';
import { CookView } from './view';

// ------------------------------------------------------------------ content, as the module is loaded

for (const c of cookingItemCats()) registerItemCat(c);
registerItems(cookingItemRows());
registerItems(MEAT_ROWS);
registerItems(PAGE_ROWS);
registerSkill(COOK_SKILL);
const RECIPE_IDS = RECIPES.map((r) => r.id);
const RECIPE_BY_ID = new Map(RECIPES.map((r) => [r.id, r]));
registerDomain({
  id: COOK_DOMAIN,
  name: { zh: '菜谱', en: 'Recipes' },
  ids: () => RECIPE_IDS,
  // (a recipe goes by its name once it was cooked or learnt; until then it is a question mark)
  nameOf: (id) => (progress.knowledge(COOK_DOMAIN, id) === 2 ? (RECIPE_BY_ID.get(id)?.name ?? WORDS.unknown) : WORDS.unknown),
});
registerItemCardLines({ cat: DISH_CAT }, dishCardLines);
registerItemCardLines({ cat: COOKWARE_CAT }, cookwareCardLines);

// ------------------------------------------------------------------ the module

/** the game's one cooking system */
export const cooking = new Cooking();
/** the game the module is installed in (for the developer's tab, which is built long after) */
let game: GameContext | null = null;

// (what is drawn: only in a game that draws — the tests' stand-in has no scene and no page)
cooking.makeView = (ctx, c) => (ctx.core.scene ? new CookView(ctx, c) : null);
cooking.makePanel = (ctx, c) => (ctx.core.scene && typeof document !== 'undefined' ? new CookPanel(ctx, c) : null);
cooking.makeHud = (ctx) => (ctx.core.scene && typeof document !== 'undefined' ? new BuffHud(ctx.ui.root) : null);

export default {
  id: 'cooking',
  systems: [cooking],
  slices: [cooking.slice],
  interact: [cooking],
  devTabs: [cookingTab(cooking, () => game)],
  setup: (ctx) => {
    game = ctx;
    ctx.events.on('body:ate', (e) => cooking.onAte(ctx, e.item));
  },
} satisfies GameModule;
