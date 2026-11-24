/**
 * The appliances module (node M2, docs/V3/nodes/M2-rv.md): the recyclables a motorhome is furnished with work —
 * the clock radio and the record player play, the television shows its channels, the desk lamp and the solar lamp
 * light up (in a vehicle, its inside with them). Wherever they are put down, with no power to find.
 *
 * As this file is loaded it brings its kinds into the catalogue (the kitchen, the coffee machine's pot:
 * core/v3/appliances/items.ts) and among what houses, filling stations, shops and camps have lying about, retires the
 * drip coffee maker's kinds into the coffee machine's (docs/V3/plan/growth.md §一 4), and puts the lines on the
 * appliances' cards (what each is doing). Installed, it is the system "appliances" (system.ts), which is also the
 * source of the devices the mark finds, and the developer's tab 电器 (devTab.ts). What they do is in
 * core/v3/appliances.
 */
import { appOf, applianceOf, APPLIANCE_OF, channelOf, COFFEE_GROUNDS, COFFEE_NO_POT, COFFEE_POT, COFFEE_WITH_POT, stateWords } from '../../../../core/v3/appliances/appliances';
import { registerItemCat, registerItems, retireItem } from '../../../../core/modcar/items';
import { addJunk } from '../../../../core/modcar/loot';
import { APPLIANCE_ITEMS, APPLIANCE_JUNK, KITCHEN_CAT } from '../../../../core/v3/appliances/items';
import { registerItemCardLines } from '../../itemInfo';
import type { GameContext } from '../../kernel/context';
import type { GameModule } from '../../kernel/modules';
import { stationLabel } from '../../radio';
import { appliancesTab } from './devTab';
import { Appliances, TV_CHANNELS } from './system';

// ------------------------------------------------------------------ content, as the module is loaded

registerItemCat(KITCHEN_CAT);
registerItems(APPLIANCE_ITEMS);
for (const [kind, ids] of Object.entries(APPLIANCE_JUNK)) addJunk(kind, ids);

// the drip coffee maker retired (docs/V3/plan/growth.md §一 4: one coffee machine): one in a save is the coffee machine,
// its pot under the spout with the coffee that was in it; a bag of ground coffee is a bag of beans
const asMachine = (r: Record<string, unknown>, pot: boolean): void => {
  const app = ((r.state as Record<string, unknown> | undefined)?.app ?? {}) as { coffee?: number };
  r.item = 'nd_coffee_machine';
  delete r.state;
  if (pot) r.state = { ndCoffee: { cup: { uid: `${String(r.uid)}p`, item: COFFEE_POT, ...(app.coffee ? { litres: Math.min(1, app.coffee) } : {}) } } };
};
retireItem(COFFEE_WITH_POT, (r) => asMachine(r, true));
retireItem(COFFEE_NO_POT, (r) => asMachine(r, false));
retireItem(COFFEE_GROUNDS, (r) => {
  r.item = 'nd_coffee_pack';
  delete r.uses;
});

const songName = (ch: number): string => stationLabel(ch);

for (const id of Object.keys(APPLIANCE_OF)) {
  registerItemCardLines({ item: id }, (inst, card) => {
    const s = appOf(inst);
    const kind = applianceOf(inst.item);
    const words = kind === 'tv' && s.on ? `开着 · ${TV_CHANNELS[channelOf(inst) % TV_CHANNELS.length]}` : stateWords(inst, songName);
    card.notes.push({ text: words, tone: s.on ? 'ok' : 'info' });
  });
}

// ------------------------------------------------------------------ the module

/** the game's one appliances system */
export const appliances = new Appliances();
let game: GameContext | null = null;

export default {
  id: 'appliances',
  systems: [appliances],
  interact: [appliances],
  devTabs: [appliancesTab(appliances, () => game)],
  setup: (ctx) => {
    game = ctx;
  },
} satisfies GameModule;
