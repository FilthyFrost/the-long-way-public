/**
 * The camper module (docs/V3/plan/rv.md, R1): installed, it is the system "camper" (system.ts) — the Turtle's elevating
 * roof raised and lowered from outside (the engine does not start with it up), the beds of the living spaces slept in;
 * which roofs are up kept with the save (the slice 'camper').
 */
import type { GameModule } from '../../kernel/modules';
import { Camper } from './system';

export const camper = new Camper();

export default {
  id: 'camper',
  systems: [camper],
  slices: [camper.slice],
} satisfies GameModule;
