/**
 * The ND ladders (docs/ND/PLAN.md, ND6): installed, the system "nd-climb" (system.ts) — the ladders of the buildings
 * nd-build draws (a water tower's), taken hold of by walking into them, climbed with the walking keys, stepped off onto
 * the platform at their head.
 */
import type { GameModule } from '../../kernel/modules';
import { ndBuildings } from '../nd-build';
import { NdClimb } from './system';

export const ndClimb = new NdClimb(ndBuildings);

export default {
  id: 'nd-climb',
  systems: [ndClimb],
  slices: [],
} satisfies GameModule;
