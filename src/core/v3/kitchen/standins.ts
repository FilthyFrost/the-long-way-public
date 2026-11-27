/**
 * What else goes into the pot (docs/V3/plan/cooking.md §2): the world's other food — what one forages, what one
 * catches — beside the sixty of the pantry.
 *
 * A wild thing that IS one of the sixty is that one (a porcino picked in the woods is the pantry's porcini: a dish
 * that names porcini is made of it). Anything else edible stands in for its kind (a morel is "any mushroom", a carp
 * "any fish"): it fills a dish's kind and never a name. What its class is, the first cooking module's table of
 * ingredients knows (core/v3/cooking/ingredients.ts); packed food and drink are not put into a pot.
 */
import { ingredient } from '../cooking/ingredients';
import type { ClassOf } from './cook';
import { portionOf, type Portion } from './items';
import { STAND_INS } from './pantry';

/** a forage kind, a fish: the ingredient of the pantry it is */
export const SAME_AS: Readonly<Record<string, string>> = {
  // mushrooms
  porcini: 'porcini', chanterelle: 'chanterelle', matsutake: 'matsutake', truffle: 'truffle', oyster_mushroom: 'oyster',
  // fruit: every small wild berry is "wild berries"
  wild_berry: 'berry', blueberry: 'berry', cranberry: 'berry', cloudberry: 'berry', evergreen_huckleberry: 'berry', bilberry: 'berry', lingonberry: 'berry',
  native_raspberry: 'berry', serviceberry: 'berry', wild_tomato: 'tomato', wild_apple: 'apple',
  // greens, roots, herbs
  shepherds_purse: 'shepherds', wild_scallion: 'scallion', bamboo_shoot: 'bamboo', potato: 'potato', mint: 'mint', chili: 'chili', wild_garlic: 'garlic',
  // nuts, grain, the shore, the hive
  walnut: 'walnut', wild_rice: 'rice', clam: 'clam', crab: 'crab', sea_crab: 'crab', honeycomb: 'honey',
  // fish
  tuna: 'tuna', lake_trout: 'trout', brook_trout: 'trout', rainbow_trout: 'trout', brown_trout: 'trout', alpine_trout: 'trout', golden_trout: 'trout',
  crater_trout: 'trout', ice_salmon: 'salmon', bleak: 'brookfish', chub: 'brookfish', loach: 'brookfish', sand_loach: 'brookfish', sculpin: 'brookfish',
  smelt: 'brookfish', crayfish: 'shrimp',
};

/** what the modules add to it as they are loaded (addSameAs): an item's id → the ingredient of the pantry it is */
const ALSO_SAME: Record<string, string> = {};

/**
 * A module's own things that are one of the sixty to the pot (docs/V3/plan/finish.md §八 4: the rod's fish, each the
 * kitchen's fish of its rarity): an item's id → the pantry's ingredient. As the module is loaded.
 */
export function addSameAs(map: Readonly<Record<string, string>>): void {
  Object.assign(ALSO_SAME, map);
}

/** the pantry's ingredient a thing is to the pot though it is not that ingredient's own item (a wild thing, a fish off the rod); null: none */
export function sameAs(item: string): string | null {
  return SAME_AS[item] ?? ALSO_SAME[item] ?? null;
}

/** the class of a thing that is none of the sixty and stands in for a kind; null: it is no ingredient */
export const classOf: ClassOf = (item) => {
  const i = ingredient(item);
  if (!i || i.processed) return null;
  return STAND_INS[i.cls] ? i.cls : null;
};

/** what a thing in the hands is to the pot: one of the sixty (whole or cut, or a wild thing that is one), a stand-in by its own kind, or null */
export function portionOfItem(item: string): Portion | null {
  const p = portionOf(item);
  if (p) return p;
  const same = sameAs(item);
  if (same) return { id: same };
  return classOf(item) ? { id: item } : null;
}
