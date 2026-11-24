/**
 * The towing module (docs/V3/plan/growth.md §六 2, J9d): installed, it is the system "tow" (system.ts) — a trailer
 * hitched to a vehicle's tow hitch at its coupling and towed behind it, left standing on its jockey wheel when it is
 * not; which trailer is on which vehicle kept with the save (the slice 'tow').
 */
import type { GameModule } from '../../kernel/modules';
import { Towing } from './system';

export const towing = new Towing();

export default {
  id: 'tow',
  systems: [towing],
  slices: [towing.slice],
} satisfies GameModule;
