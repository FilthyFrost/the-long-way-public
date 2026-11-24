/**
 * The ND furniture module (docs/ND/PLAN.md): as it is loaded the ND kinds go into the catalogue; installed, it is
 * the system "nd-home" (system.ts) that makes every piece of ND furniture lying about a device with its doors and
 * drawers as devices of their own, and swings and slides them.
 */
import { registerNdItems } from '../../../../core/v3/nd/items';
import type { GameModule } from '../../kernel/modules';
import { NdHome } from './system';

registerNdItems();

export const ndHome = new NdHome();

export default {
  id: 'nd-home',
  systems: [ndHome],
  interact: [ndHome],
} satisfies GameModule;
