/**
 * The ND flashlight module (docs/ND/PLAN.md, ND3): as it is loaded the ND kinds go into the catalogue; installed, it
 * is the system "nd-light" (system.ts): the flashlight switched on and off with the left button, focused with F,
 * its light the world's beam, its charge running down, a battery put into it when it is spent.
 */
import { registerNdItems } from '../../../../core/v3/nd/items';
import type { GameModule } from '../../kernel/modules';
import { NdLight } from './system';

registerNdItems();

export const ndLight = new NdLight();

export default {
  id: 'nd-light',
  systems: [ndLight],
  interact: [ndLight],
} satisfies GameModule;
