/**
 * The kinds the appliances module brings (node M2, docs/V3/nodes/M2-rv.md), registered as the module is loaded: the
 * kitchen as a category of its own, the coffee maker found without its pot (junk for the recycler, as the one with
 * its pot is), the pot alone (a drink, coffee, found empty) and a bag of ground coffee (eight portions, a pot's worth
 * each); and where they are found. Rows only: core/modcar/items.ts registerItems checks them.
 */
import type { ItemRow } from '../../modcar/items';
import { COFFEE_GROUNDS, COFFEE_NO_POT, COFFEE_POT } from './appliances';

/** the kitchen: after the drinks in the catalogue's order (the built-in categories go in tens) */
export const KITCHEN_CAT = { id: 'kitchen', name: { zh: '厨房', en: 'Kitchen' }, order: 15 } as const;

export const APPLIANCE_ITEMS: readonly ItemRow[] = [
  { id: COFFEE_NO_POT, cat: 'junk', name: { zh: '咖啡机（没有壶）', en: 'Coffee maker, no pot' }, stars: 0, mass: 1.6, salvage: { scrap: 5 }, blurb: '滴滤咖啡机，玻璃壶不知道哪去了：放上咖啡壶才能煮。', paint: 0x2f3236, paint2: 0xc8323a },
  { id: COFFEE_POT, cat: KITCHEN_CAT.id, name: { zh: '咖啡壶', en: 'Coffee pot' }, stars: 1, mass: 0.4, salvage: { scrap: 1 }, blurb: '滴滤咖啡机的玻璃壶。放上咖啡机煮好了，端起来就能喝：提神暖身。', paint: 0x2f3236, paint2: 0xc8323a, drink: { litres: 1, liquid: 'coffee', rate: 0.06, empty: true } },
  { id: COFFEE_GROUNDS, cat: KITCHEN_CAT.id, name: { zh: '咖啡粉', en: 'Ground coffee' }, stars: 2, mass: 0.25, salvage: { organics: 4 }, blurb: '一袋磨好的咖啡粉。拿着它看着咖啡机按 E，放一份进滤网，一份煮一壶。', paint: 0x6b4a33, paint2: 0xe9d8b4, portions: 8 },
];

/** the sorts of place that have them lying about (core/modcar/loot.ts addJunk) */
export const APPLIANCE_JUNK: Readonly<Record<string, readonly string[]>> = {
  house: [COFFEE_NO_POT, COFFEE_POT, COFFEE_GROUNDS],
  station: [COFFEE_POT, COFFEE_GROUNDS],
  shop: [COFFEE_GROUNDS, COFFEE_POT],
  camp: [COFFEE_GROUNDS],
};
