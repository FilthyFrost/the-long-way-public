/**
 * The ND coffee machine module (docs/ND/PLAN.md): as it is loaded the ND kinds go into the catalogue (core/v3/nd/
 * items.ts); installed, it is the system "nd-coffee" (system.ts) that makes every coffee machine lying about a set of
 * devices — its lid, its switch, the place under its spout — and draws what it is doing.
 */
import { registerNdItems } from '../../../../core/v3/nd/items';
import type { GameModule } from '../../kernel/modules';
import { NdCoffee } from './system';

registerNdItems();

export const ndCoffee = new NdCoffee();

export default {
  id: 'nd-coffee',
  systems: [ndCoffee],
  interact: [ndCoffee],
} satisfies GameModule;
