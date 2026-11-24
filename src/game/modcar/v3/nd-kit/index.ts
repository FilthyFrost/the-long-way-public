/**
 * The ND compass and kits module (docs/ND/PLAN.md, ND3): as it is loaded the ND kinds go into the catalogue;
 * installed, it is the system "nd-kit" (system.ts): the compass's lid and needle in the hands, the engine and tyre
 * repair kits and the battery charger used up on what each is for.
 */
import { registerNdItems } from '../../../../core/v3/nd/items';
import type { GameModule } from '../../kernel/modules';
import { NdKits } from './system';

registerNdItems();

export const ndKits = new NdKits();

export default {
  id: 'nd-kit',
  systems: [ndKits],
} satisfies GameModule;
