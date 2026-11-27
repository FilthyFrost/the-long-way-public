/**
 * The ND plant pot module (docs/ND/PLAN.md): as it is loaded the ND kinds go into the catalogue; installed, it is the
 * system "nd-garden" (system.ts): every plant pot a device that is sown and watered, that grows on its water while the
 * game runs, its plant drawn by the plant toolkit (crops.ts), its fruits picked one by one.
 */
import { CROP_INFO, ND_PLANTER, ND_POT, registerNdItems } from '../../../../core/v3/nd/items';
import { fruitsLeft, grownOf, potOf, POT, stageOf } from '../../../../core/v3/nd/plants';
import { registerItemCardLines } from '../../itemInfo';
import type { GameModule } from '../../kernel/modules';
import { NdGarden } from './system';

registerNdItems();

// the pot's card (docs/V3/plan/finish.md §八 2): what grows in it and how far along, the water in its soil
registerItemCardLines({ item: ND_POT }, (inst, card) => {
  const s = potOf(inst);
  if (s.crop) {
    const ripe = stageOf(inst) >= 4;
    const n = fruitsLeft(inst).length;
    card.bars.push({ label: CROP_INFO[s.crop].zh, value: grownOf(inst), max: 1, text: ripe ? `熟了 · 还有 ${n} 个` : `长到 ${Math.round(grownOf(inst) * 100)}%`, tone: ripe ? 'good' : 'mid' });
  }
  const w = s.water ?? 0;
  card.bars.push({ label: '土里的水', value: w, max: POT.holds, text: w > 0.005 ? `${w.toFixed(2)} L` : '干了', tone: w > 0.005 ? 'water' : 'bad' });
  if (s.crop && stageOf(inst) < 4) card.notes.push({ text: w > 0.005 ? '白天晒着太阳才长' : '浇了水才接着长', tone: w > 0.005 ? 'info' : 'warn' });
});

// the planter box's: each of its three plants, and the water of the whole box
registerItemCardLines({ item: ND_PLANTER }, (inst, card) => {
  let w = 0;
  let waits = false;
  for (let b = 0; b < 3; b++) {
    const s = potOf(inst, b);
    w += s.water ?? 0;
    if (!s.crop) continue;
    const ripe = stageOf(inst, b) >= 4;
    const n = fruitsLeft(inst, b).length;
    if (!ripe) waits = true;
    card.bars.push({ label: CROP_INFO[s.crop].zh, value: grownOf(inst, b), max: 1, text: ripe ? `熟了 · 还有 ${n} 个` : `长到 ${Math.round(grownOf(inst, b) * 100)}%`, tone: ripe ? 'good' : 'mid' });
  }
  card.bars.push({ label: '土里的水', value: w, max: POT.holds * 3, text: w > 0.005 ? `${w.toFixed(2)} L` : '干了', tone: w > 0.005 ? 'water' : 'bad' });
  if (waits) card.notes.push({ text: w > 0.005 ? '白天晒着太阳才长' : '浇了水才接着长', tone: w > 0.005 ? 'info' : 'warn' });
});

export const ndGarden = new NdGarden();

export default {
  id: 'nd-garden',
  systems: [ndGarden],
  interact: [ndGarden],
} satisfies GameModule;
