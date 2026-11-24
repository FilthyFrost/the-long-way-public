/**
 * The ND filling station's pump (docs/ND/PLAN.md, ND5): as it is loaded the ND kinds go into the catalogue (the
 * nozzle among them); installed, it is the system "nd-fuel" (system.ts) — the pump of each station nd-build draws, its
 * nozzle taken off the holster into the hands and its hose after it, the fuel run into a filler or a jerrycan, and
 * what each pump has left (its save slice).
 */
import { registerNdItems } from '../../../../core/v3/nd/items';
import type { GameModule } from '../../kernel/modules';
import { ndBuildings } from '../nd-build';
import { NdFuel } from './system';

registerNdItems();

export const ndFuel = new NdFuel(ndBuildings);

export default {
  id: 'nd-fuel',
  systems: [ndFuel],
  interact: [ndFuel],
  slices: [ndFuel.slice],
} satisfies GameModule;
