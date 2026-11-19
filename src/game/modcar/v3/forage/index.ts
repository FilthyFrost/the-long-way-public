/**
 * The forage module (node W3, docs/V3/nodes/W3-forage.md): the player stops, gets out, sees things growing
 * by the road and in the woods, aims and presses E and has them at once. Eighty kinds in ten categories,
 * growing where the world's flora says (a world of version 2: a world of version 1 has no foraging at all).
 *
 * As this file is loaded it brings the content into the game's catalogues, before a save is read: the ten
 * item categories and the item of every kind (the core's rows: src/core/v3/forage/items.ts), the four tools
 * and the ten pages of the compendium (content.ts), the skill 采集 with its four perks, the compendium's field
 * "forage", the veil over kinds the player does not know yet (knowledge.ts) and the lines on their cards.
 *
 * Installed, it is: the system "forage" (system.ts: looking about, the pick, the starter kit, the robot for
 * the scripts) with what is drawn of the points (view/), the interactable source the mark finds its points
 * through, the save slice "forage", and the developer's tab 采集 (devTab.ts).
 *
 * It imports in plain Node and touches nothing of the page until the system is set up in a game that draws.
 *
 * To add a kind: a row in src/core/v3/forage/kinds.ts, a plant that bears it in src/core/world/plants.ts and
 * where it grows in src/core/world/floraForage.ts (or a region's flora table); nothing here changes. A ground
 * plant of a new family of model needs that family in view/families.ts.
 */
import { registerItemCat, registerItems, setItemVeil } from '../../../../core/modcar/items';
import { forageItemCat, forageItemCats, forageItemRows } from '../../../../core/v3/forage/items';
import { registerSkill } from '../../../../core/v3/progress/progress';
import { registerItemCardLines } from '../../itemInfo';
import type { GameContext } from '../../kernel/context';
import type { GameModule } from '../../kernel/modules';
import { registerDomain } from '../progress/api';
import { FORAGE_CAT_ORDER, FORAGE_DOMAIN, FORAGE_SKILL, FORAGE_SKILL_ID, PAGE_ROWS, TOOL_ROWS } from './content';
import { forageTab } from './devTab';
import { forageCardLines, forageVeil, KIND_IDS, KIND_INDEX, nameNow } from './knowledge';
import { Forage } from './system';
import { ForageView } from './view/view';

// ------------------------------------------------------------------ content, as the module is loaded

for (const c of forageItemCats()) registerItemCat(c);
registerItems(forageItemRows());
registerItems(TOOL_ROWS);
registerItems(PAGE_ROWS);
registerSkill(FORAGE_SKILL);
registerDomain({ id: FORAGE_DOMAIN, name: { zh: '采集物', en: 'Forage' }, ids: () => KIND_IDS, nameOf: (id) => nameNow(KIND_INDEX.get(id) ?? 0) });
setItemVeil(forageVeil);
for (const c of FORAGE_CAT_ORDER) registerItemCardLines({ cat: forageItemCat(c) }, forageCardLines);

// ------------------------------------------------------------------ the module

/** the game's one forage system */
export const forage = new Forage();
/** the game the module is installed in (for the developer's tab, which is built long after) */
let game: GameContext | null = null;

// (what is drawn of the points: only in a game that draws — the tests' stand-in has no scene)
forage.makeView = (ctx) => (ctx.core.scene ? new ForageView(ctx.core) : null);

export default {
  id: 'forage',
  systems: [forage],
  slices: [forage.slice],
  interact: [forage],
  devTabs: [forageTab(forage, () => game)],
  setup: (ctx) => {
    game = ctx;
    ctx.events.on('game:new', () => forage.onNewGame(ctx));
    ctx.events.on('game:restored', () => forage.onRestored(ctx));
    ctx.events.on('clock:day', (e) => forage.onDay(e.day));
    ctx.events.on('body:ate', (e) => forage.onAte(ctx, e.item.item));
    ctx.events.on('skill:level', (e) => {
      if (e.skill === FORAGE_SKILL_ID) forage.onLevel(ctx, e.from, e.level);
    });
  },
} satisfies GameModule;
