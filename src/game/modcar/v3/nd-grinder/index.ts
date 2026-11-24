/**
 * The ND grinder and polisher module (docs/ND/PLAN.md): as it is loaded the ND kinds go into the catalogue; installed,
 * it is the systems "nd-grinder" and "nd-polisher" (system.ts, one tool two ways): run with the left button, its disc
 * or its pad spinning up and down, its battery draining — grinding the rust off what it is put to, or polishing the
 * fading out of its paint. Their cards show their charge.
 */
import { registerNdItems } from '../../../../core/v3/nd/items';
import { GRINDER } from '../../../../core/v3/nd/grinder';
import { registerItemCardLines } from '../../itemInfo';
import type { GameModule } from '../../kernel/modules';
import { GRINDER_CFG, NdGrinder, POLISHER_CFG } from './system';

registerNdItems();

export const ndGrinder = new NdGrinder(GRINDER_CFG);
export const ndPolisher = new NdGrinder(POLISHER_CFG);

for (const item of [GRINDER_CFG.item, POLISHER_CFG.item]) {
  registerItemCardLines({ item }, (inst, card) => {
    const c = inst.state?.charge ?? GRINDER.max;
    card.bars.push({ label: '电量', value: c, max: GRINDER.max, text: `${Math.round((c / GRINDER.max) * 100)}%`, tone: 'charge' });
  });
}

export default {
  id: 'nd-grinder',
  systems: [ndGrinder, ndPolisher],
  interact: [ndGrinder, ndPolisher],
} satisfies GameModule;
