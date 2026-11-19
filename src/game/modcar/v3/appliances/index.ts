/**
 * The appliances module (node M2, docs/V3/nodes/M2-rv.md): the recyclables a motorhome is furnished with work —
 * the coffee maker brews (water, ground coffee, its pot), the clock radio and the record player play, the
 * television shows its channels, the desk lamp and the solar lamp light up (in a vehicle, its inside with them).
 * Wherever they are put down, with no power to find.
 *
 * As this file is loaded it brings its kinds into the catalogue (the kitchen, the coffee maker without its pot, the
 * pot, ground coffee: core/v3/appliances/items.ts) and among what houses, filling stations, shops and camps have
 * lying about, and puts the lines on the appliances' cards (what each is doing; the coffee maker's tank, filter and
 * pot). Installed, it is the system "appliances" (system.ts), which is also the source of the devices the mark
 * finds, and the developer's tab 电器 (devTab.ts). What they do is in core/v3/appliances.
 */
import { appOf, applianceOf, APPLIANCE_OF, channelOf, COFFEE, hasPot, stateWords } from '../../../../core/v3/appliances/appliances';
import { registerItemCat, registerItems } from '../../../../core/modcar/items';
import { addJunk } from '../../../../core/modcar/loot';
import { APPLIANCE_ITEMS, APPLIANCE_JUNK, KITCHEN_CAT } from '../../../../core/v3/appliances/items';
import { registerItemCardLines } from '../../itemInfo';
import type { GameContext } from '../../kernel/context';
import type { GameModule } from '../../kernel/modules';
import { SONGS } from '../../radio';
import { appliancesTab } from './devTab';
import { Appliances, TV_CHANNELS } from './system';

// ------------------------------------------------------------------ content, as the module is loaded

registerItemCat(KITCHEN_CAT);
registerItems(APPLIANCE_ITEMS);
for (const [kind, ids] of Object.entries(APPLIANCE_JUNK)) addJunk(kind, ids);

const songName = (ch: number): string => SONGS[((ch % SONGS.length) + SONGS.length) % SONGS.length].name;

for (const id of Object.keys(APPLIANCE_OF)) {
  registerItemCardLines({ item: id }, (inst, card) => {
    const s = appOf(inst);
    const kind = applianceOf(inst.item);
    if (kind === 'coffee') {
      const w = s.water ?? 0;
      card.bars.push({ label: '水箱', value: w, max: COFFEE.tank, text: `${w.toFixed(2)} / ${COFFEE.tank} L`, tone: 'water' });
      if (hasPot(inst)) {
        const c = s.coffee ?? 0;
        card.bars.push({ label: '壶里', value: c, max: COFFEE.pot, text: `${c.toFixed(2)} / ${COFFEE.pot} L 咖啡`, tone: 'oil' });
      }
      card.rows.push({ value: s.grounds ? '一份' : '没有', label: '滤网里的咖啡粉' });
      card.notes.push({ text: s.on ? '正在煮：水滴完了自己会停' : stateWords(inst, songName), tone: s.on ? 'ok' : 'info' });
      if (!s.on) card.notes.push({ text: '拿着一瓶水按 E 加水，拿着咖啡粉按 E 放一份，然后空手按 E 煮', tone: 'info' });
      return;
    }
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
