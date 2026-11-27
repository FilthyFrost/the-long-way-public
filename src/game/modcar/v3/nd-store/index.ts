/**
 * What a container holds stands in it (the player's ask, 2026-11-26: the cooler, the fridge, a cupboard opened show
 * what is in them where it is, as Nomad Drive does, and no list comes up): system.ts; the boards and the rules,
 * core/v3/nd/store.ts.
 */
import type { GameModule } from '../../kernel/modules';
import { NdStore } from './system';

export const ndStore = new NdStore();

export default {
  id: 'nd-store',
  systems: [ndStore],
  interact: [ndStore],
} satisfies GameModule;
