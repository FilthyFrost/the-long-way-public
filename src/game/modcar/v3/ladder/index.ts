/**
 * The vehicles' ladders module (docs/V3/plan/growth.md §六 2, J9e): installed, it is the system "ladder" (system.ts) — a
 * vehicle's ladder (the part on its ladder mount, or the Whale's own) climbed as the ND ladders are (it is a source of
 * nd-climb's), its roof stood and walked on up there, one carried with it should it move, put down beside it once it
 * goes faster than a walk.
 */
import type { GameModule } from '../../kernel/modules';
import { ndClimb } from '../nd-climb';
import { VehicleLadders } from './system';

export const vehicleLadders = new VehicleLadders(ndClimb);

export default {
  id: 'ladder',
  systems: [vehicleLadders],
  slices: [],
} satisfies GameModule;
