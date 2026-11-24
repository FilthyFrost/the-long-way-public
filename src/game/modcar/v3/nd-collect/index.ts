/**
 * The keepsakes (docs/ND/PLAN.md, ND4): as it is loaded the ND kinds go into the catalogue and the plates' and frames'
 * cards say what each one is; installed, it is the system "nd-collect" (system.ts): the bobbleheads nodding, the plates
 * rolled and painted, the frames' paintings, the walls' rules, the bobbleheads dealt to buried chests.
 */
import { registerNdItems } from '../../../../core/v3/nd/items';
import { BOBBLES } from '../../../../core/v3/nd/bobble';
import { GRADES, PATTERNS, plateText, REGIONS, TIERS } from '../../../../core/v3/nd/plates';
import { registerItemCardLines } from '../../itemInfo';
import type { GameModule } from '../../kernel/modules';
import { PICTURES } from '../../nd/canvasArt';
import { ND_FRAME, ND_PLATE, NdCollect } from './system';

registerNdItems();

export const ndCollect = new NdCollect();

registerItemCardLines({ item: ND_PLATE }, (inst, card) => {
  const p = inst.state?.plate;
  if (!p) return;
  card.rows.push({ value: plateText(p), label: '号码' });
  card.rows.push({ value: `${TIERS[p.tier].zh} · ${p.oneIn.toLocaleString('zh-CN')} 分之一`, label: '稀有' });
  card.rows.push({ value: GRADES[p.grade].zh, label: '成色' });
  card.rows.push({ value: REGIONS[p.region].name, label: '地方' });
  const odd = [p.foil ? '闪金' : '', p.vanity ? '定制字' : '', p.pattern ? (PATTERNS.find((x) => x.id === p.pattern)?.zh ?? '') : ''].filter(Boolean);
  if (odd.length) card.notes.push({ text: odd.join(' · '), tone: 'ok' });
});

registerItemCardLines({ item: ND_FRAME }, (inst, card) => {
  const k = inst.state?.picture;
  if (k !== undefined) card.rows.push({ value: `《${PICTURES[k]}》`, label: '画' });
});

for (const item of BOBBLES) registerItemCardLines({ item }, (_inst, card) => void card.notes.push({ text: '四个里的一个', tone: 'info' }));

export default {
  id: 'nd-collect',
  systems: [ndCollect],
  slices: [ndCollect.slice],
} satisfies GameModule;
