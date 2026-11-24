/**
 * The ND water module (docs/ND/PLAN.md, ND2): as it is loaded the ND kinds go into the catalogue; installed, it is
 * the system "nd-water" (system.ts): water run between vessels with E and F held, the hand pump, rain caught in
 * what is left out, vessels found part full.
 */
import { registerNdItems } from '../../../../core/v3/nd/items';
import type { GameModule } from '../../kernel/modules';
import { NdWater } from './system';

registerNdItems();

export const ndWater = new NdWater();

export default {
  id: 'nd-water',
  systems: [ndWater],
  interact: [ndWater],
  slices: [ndWater.slice],
} satisfies GameModule;
