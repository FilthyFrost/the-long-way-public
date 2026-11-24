/**
 * The tapes and the tape deck (docs/ND/PLAN.md, ND4): as it is loaded the ND kinds go into the catalogue (the tapes
 * among them) and the tapes' cards say what is on them; installed, it is the system "nd-tape" (system.ts) that
 * works a vehicle's tape deck from a seat and plays what is in it. The tapes and the deck's numbers:
 * core/v3/nd/tapes.ts.
 */
import { registerNdItems } from '../../../../core/v3/nd/items';
import { TAPES } from '../../../../core/v3/nd/tapes';
import { registerItemCardLines } from '../../itemInfo';
import type { GameModule } from '../../kernel/modules';
import { songTitle } from '../../radio';
import { NdTape } from './system';

registerNdItems();

export const ndTape = new NdTape();

for (const t of TAPES) {
  registerItemCardLines({ item: t.id }, (_inst, card) => {
    card.rows.push({ value: songTitle(t.song), label: 'A 面' });
    if (ndTape.had.has(t.id)) card.notes.push({ text: `放过了 · 一共放过 ${ndTape.had.size} / ${TAPES.length} 盘`, tone: 'ok' });
    else card.notes.push({ text: '还没放过', tone: 'info' });
  });
}

export default {
  id: 'nd-tape',
  systems: [ndTape],
  slices: [ndTape.slice],
} satisfies GameModule;
