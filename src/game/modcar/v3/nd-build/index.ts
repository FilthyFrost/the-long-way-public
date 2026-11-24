/**
 * The ND buildings module (docs/ND/PLAN.md): as it is loaded its cards go into the world's registry of prefabs
 * (core/v3/nd/cards.ts → core/world/prefabs.ts: a world asked for them with ?nd= lays them along its road);
 * installed, it is the system "nd-build" (system.ts) that draws them, hangs their doors and works their lamps, the
 * source of those devices, and the keeper of what one left open or switched on (its save slice).
 */
import '../../../../core/v3/nd/cards';
import type { GameModule } from '../../kernel/modules';
import { NdBuildings } from './system';

export const ndBuildings = new NdBuildings();

export default {
  id: 'nd-build',
  systems: [ndBuildings],
  interact: [ndBuildings],
  slices: [ndBuildings.slice],
} satisfies GameModule;
