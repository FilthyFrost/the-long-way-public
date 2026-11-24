/**
 * The ND plant pot module (docs/ND/PLAN.md): as it is loaded the ND kinds go into the catalogue; installed, it is the
 * system "nd-garden" (system.ts): every plant pot a device that is sown and watered, that grows on its water while the
 * game runs, its plant drawn by the plant toolkit (crops.ts), its fruits picked one by one.
 */
import { registerNdItems } from '../../../../core/v3/nd/items';
import type { GameModule } from '../../kernel/modules';
import { NdGarden } from './system';

registerNdItems();

export const ndGarden = new NdGarden();

export default {
  id: 'nd-garden',
  systems: [ndGarden],
  interact: [ndGarden],
} satisfies GameModule;
