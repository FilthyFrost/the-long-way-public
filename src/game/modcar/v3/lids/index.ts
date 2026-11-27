/**
 * Lids (the player's ask, 2026-11-26): a cooler's lid opened and shut by a press on the lid, the box picked up by a
 * press anywhere else on it, as Nomad Drive tells the two apart (system.ts).
 */
import type { GameModule } from '../../kernel/modules';
import { Lids } from './system';

export const lids = new Lids();

export default {
  id: 'lids',
  systems: [lids],
} satisfies GameModule;
