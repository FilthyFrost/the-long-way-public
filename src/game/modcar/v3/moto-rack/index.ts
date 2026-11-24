/**
 * The motorcycle rack module (docs/V3/plan/growth.md §六 2, J9e): installed, it is the system "moto-rack" (system.ts) —
 * the Swallow loaded across the back of a vehicle with a motorcycle rack in its hitch's place, carried there, put down
 * standing beside it; which motorcycle is on which vehicle's rack kept with the save (the slice 'moto-rack').
 */
import type { GameModule } from '../../kernel/modules';
import { MotoRacks } from './system';

export const motoRacks = new MotoRacks();

export default {
  id: 'moto-rack',
  systems: [motoRacks],
  slices: [motoRacks.slice],
} satisfies GameModule;
