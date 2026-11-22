/**
 * The kitchen module (docs/V3/plan/cooking.md): sixty ingredients, cookware one carries and sets down, a cassette
 * stove that burns canisters of gas, and what comes out of the pot.
 *
 * As this file is loaded it brings its kinds into the catalogue (core/v3/kitchen/items.ts: the ingredients whole and
 * cut, the cookware, every dish).
 */
import { hasItemCat, registerItemCat, registerItems } from '../../../../core/modcar/items';
import { KITCHEN_CAT } from '../../../../core/v3/appliances/items';
import { INGREDIENT_CAT, KITCHEN_ITEMS, MEAL_CAT } from '../../../../core/v3/kitchen/items';
import type { GameModule } from '../../kernel/modules';
// (the cookware is listed with the appliances' kitchen things: their category is theirs to register, first)
import '../appliances';

// ------------------------------------------------------------------ content, as the module is loaded

if (!hasItemCat(KITCHEN_CAT.id)) registerItemCat(KITCHEN_CAT);
registerItemCat(INGREDIENT_CAT);
registerItemCat(MEAL_CAT);
registerItems(KITCHEN_ITEMS);

export default {
  id: 'kitchen',
} satisfies GameModule;
