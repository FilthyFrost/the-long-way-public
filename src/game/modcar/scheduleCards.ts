/**
 * What comes in a set says so on its card (docs/V3/plan/growth.md §六 5: 成套的东西拆开给): the stove its gas and its
 * pan, the coffee machine its beans and a mug, the camera its film, the flower pot its seeds, the metal detector its
 * shovel, the grinder and the torch a battery — a line 配套 with them, from the plan's own entries (schedule.ts).
 */
import { itemDef, hasItem } from '../../core/modcar/items';
import { SCHEDULE, type ScheduledThing } from '../../core/modcar/schedule';
import { registerItemCardLines } from './itemInfo';

const nameOf = (t: ScheduledThing): string | null => ('item' in t && hasItem(t.item) ? itemDef(t.item).name.zh : null);

for (const e of SCHEDULE) {
  if (!('item' in e.thing) || !e.novelty) continue;
  const things = [...(e.with ?? []).map((w) => w.thing), ...(e.after ?? []).map((a) => a.thing)];
  if (!things.length) continue;
  // (the names looked up as the card is made: the systems' own kinds are in the catalogue by then, not all as this loads)
  let value: string | null = null;
  registerItemCardLines({ item: e.thing.item }, (_inst, card) => {
    value ??= [...new Set(things.map(nameOf).filter((n): n is string => !!n))].join('、');
    if (value) card.rows.push({ label: '配套', value });
  });
}
