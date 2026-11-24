/**
 * The ND digging module (docs/ND/PLAN.md, ND3): as it is loaded the ND kinds go into the catalogue; installed, it is
 * the system "nd-dig" (system.ts): chests buried round the places and their keys lying by them, the shovel, the
 * metal detector, the chests' padlocks and lids.
 */
import { registerNdItems } from '../../../../core/v3/nd/items';
import type { GameModule } from '../../kernel/modules';
import { NdDig } from './system';

registerNdItems();

export const ndDig = new NdDig();

export default {
  id: 'nd-dig',
  systems: [ndDig],
  interact: [ndDig],
  slices: [ndDig.slice],
} satisfies GameModule;
