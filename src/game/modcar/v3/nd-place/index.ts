/**
 * Placing things as Nomad Drive does (docs/ND/PLAN.md, ND4): the system "nd-place" (system.ts) — R holds out what is
 * in the hands, its ghost where it would come down, a vehicle's place for things taking it to its spot; Q and E turn
 * it a quarter round, the right button with the mouse, the wheel takes it nearer or further, the left button puts it
 * down. Its rules: core/v3/nd/place.ts.
 */
import type { GameModule } from '../../kernel/modules';
import { NdPlace } from './system';

export const ndPlace = new NdPlace();

export default {
  id: 'nd-place',
  systems: [ndPlace],
} satisfies GameModule;
