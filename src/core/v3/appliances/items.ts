/**
 * The kinds the appliances module brings (node M2, docs/V3/nodes/M2-rv.md), registered as the module is loaded: the
 * kitchen as a category of its own; and where the coffee machine, its pot and its beans are found among the junk.
 * Rows only: core/modcar/items.ts registerItems checks them.
 */
import type { ItemRow } from '../../modcar/items';
import { COFFEE_POT } from './appliances';

/** the kitchen: after the drinks in the catalogue's order (the built-in categories go in tens) */
export const KITCHEN_CAT = { id: 'kitchen', name: { zh: '厨房', en: 'Kitchen' }, order: 15 } as const;

export const APPLIANCE_ITEMS: readonly ItemRow[] = [
  // (the coffee pot is the coffee machine's, with it among Nomad Drive's kinds: core/v3/nd/items.ts)
];

/** the sorts of place that have them lying about (core/modcar/loot.ts addJunk) */
export const APPLIANCE_JUNK: Readonly<Record<string, readonly string[]>> = {
  house: ['nd_coffee_machine', COFFEE_POT, 'nd_coffee_pack'],
  station: [COFFEE_POT, 'nd_coffee_pack'],
  shop: ['nd_coffee_pack', COFFEE_POT],
  camp: ['nd_coffee_pack'],
};
