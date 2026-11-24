/**
 * The power module (docs/V3/plan/rv.md R2: 用电): installed, it is the system "power" (system.ts) — the electric things
 * riding in a vehicle drawn from its house battery (or the starter's above what it keeps to crank on), stopped when
 * there is nothing to draw on (没电了), a fridge keeping nothing cold then — and it puts on their cards how much there is
 * to draw on (电: 还剩 …), on a vehicle's what its house battery has.
 */
import { ND_FRIDGE } from '../../../../core/v3/nd/items';
import { HOB } from '../../../../core/v3/kitchen/items';
import { APPLIANCE_OF } from '../../../../core/v3/appliances/appliances';
import { registerItemCardLines, type ItemCard } from '../../itemInfo';
import type { GameModule } from '../../kernel/modules';
import { Power } from './system';

export const power = new Power();

/** the bar of what there is to draw on, for a thing riding in a vehicle (none out of one) */
function powerBar(uid: string, card: ItemCard): void {
  if (!power.levelOf.has(uid)) return;
  const lv = power.levelOf.get(uid);
  if (lv === null || lv === undefined || lv <= 0) {
    card.bars.push({ label: '电', value: 0, max: 1, text: '没电了', tone: 'bad' });
    return;
  }
  card.bars.push({ label: '电', value: lv, max: 1, text: `还剩 ${Math.round(lv * 100)}%`, tone: 'charge' });
}

for (const id of [...Object.keys(APPLIANCE_OF).filter((k) => APPLIANCE_OF[k] !== 'solar'), ND_FRIDGE, HOB]) registerItemCardLines({ item: id }, (inst, card) => powerBar(inst.uid, card));

export default {
  id: 'power',
  systems: [power],
} satisfies GameModule;
