/**
 * The fishing module (docs/V3/plan/fishing.md): a rod, a bait, the water, and the fish one catches lying at one's
 * feet as things like any other. No screen of its own: what is said is said on the game's own cards, its line over
 * the hotbar, its ring round the mark and its one line at the top.
 *
 * As this file is loaded it brings its kinds into the catalogue (core/v3/fishing/lite/items.ts: 110 fish, five rods,
 * four baits and the star bait, the creel, what comes up instead of a fish; a bait or a rod retired since a save was
 * written is read back as the one there is now), the fish into the kitchen's larder (any fish in a
 * pot), its field of the compendium into the game's progression (content.ts; no skill); it says how a fish caught
 * is drawn (its colour, its size: models.ts, made in three.js), what each of its things does in the hands
 * (kernel/heldUse.ts: a rod casts, a bait goes onto the rod, a small fish onto the hook, a bottle opens), and the
 * lines on their cards. Installed, it is the system "fishing" (system.ts), what the angler has caught in the save
 * (the slice "fishing": log.ts), and the developer's tab 钓鱼 (devTab.ts). The rules are in core/v3/fishing/lite.
 */
import type { SaveSlice } from '../../../../core/kernel/slices';
import { itemDef, registerItemCat, registerItemModelOf, registerItems, registerRetiredItems } from '../../../../core/modcar/items';
import { registerIngredients } from '../../../../core/v3/cooking/ingredients';
import { FOOD } from '../../../../core/v3/kitchen/pantry';
import { addSameAs, sameAs } from '../../../../core/v3/kitchen/standins';
import { FISH } from '../../../../core/v3/fishing/lite/fish';
import { BAITS, REC_ROD, RODS, STAR_TIER } from '../../../../core/v3/fishing/lite/gear';
import {
  BAIT_CAT,
  baitItemNow,
  baitOfItem,
  BOTTLE,
  canGoLive,
  CREEL,
  FISH_CAT,
  FISH_INGREDIENTS,
  fishModelOf,
  fishOfItem,
  FISHING_ITEMS,
  FLOTSAM_CAT,
  ROD_CAT,
  rodItemNow,
  rodOfItem,
  TACKLE_CAT,
  TIER_STARS,
} from '../../../../core/v3/fishing/lite/items';
import { cleanLog, newLog, type FishLog } from '../../../../core/v3/fishing/lite/log';
import { SPOTS } from '../../../../core/v3/fishing/lite/spots';
import { MEDAL_ZH, TIERS, VARIANTS, type Tier } from '../../../../core/v3/fishing/lite/types';
import { registerItemModels } from '../../assets';
import { registerItemCardLines } from '../../itemInfo';
import type { GameContext } from '../../kernel/context';
import { registerHeldUse } from '../../kernel/heldUse';
import type { GameModule } from '../../kernel/modules';
import { registerDomain } from '../progress/api';
import { FISH_DOMAIN } from './content';
import { fishingTab } from './devTab';
import { fishItemModel, isFishModel } from './models';
import { fmtCm, Fishing } from './system';
// (a fish caught goes off into the kitchen's spoiled food: its kinds first)
import '../kitchen';

/** the kitchen's fish a fish off the rod is to the pot, by its rarity (0 common … 3 epic, 4 a water's lord, 5 a fish of the sky) */
const KITCHEN_FISH: readonly string[] = ['brookfish', 'trout', 'salmon', 'tuna', 'tuna', 'tuna'];

// ------------------------------------------------------------------ content, as the module is loaded

registerItemCat(FISH_CAT);
registerItemCat(ROD_CAT);
registerItemCat(BAIT_CAT);
registerItemCat(TACKLE_CAT);
registerItemCat(FLOTSAM_CAT);
registerItems(FISHING_ITEMS);
// (a bait retired, and a bait of no kind there is, in a save: as the bait of its rarity there is now; a rod retired: as
// the rod nearest it in power, docs/V3/plan/fishing-feel.md §11)
registerRetiredItems(baitItemNow);
registerRetiredItems(rodItemNow);
registerIngredients(FISH_INGREDIENTS);
// (to the pot each is the kitchen's fish of its rarity — docs/V3/plan/finish.md §八 4: a common one the brook fish, an
// uncommon one the trout, a rare one the salmon, an epic one, a lord or a fish of the sky the tuna; a crayfish the
// shrimp. A frog and a turtle stay what they are: meat of a kind.)
addSameAs(Object.fromEntries(FISH.filter((f) => f.family !== 'frog' && f.family !== 'turtle').map((f) => [`fish_${f.id}`, f.family === 'crayfish' ? 'shrimp' : KITCHEN_FISH[f.tier]])));
registerDomain({
  id: FISH_DOMAIN,
  name: { zh: '鱼', en: 'Fish' },
  ids: () => FISH.map((f) => f.id),
  nameOf: (id) => {
    const f = FISH.find((x) => x.id === id);
    return f ? { zh: f.zh, en: f.en } : { zh: id, en: id };
  },
});
// a fish caught is drawn in its own colour and at its own size, its body made in three.js
registerItemModelOf(fishModelOf);
registerItemModels(isFishModel, fishItemModel);

/** the game's one angler */
export const fishing = new Fishing();
let game: GameContext | null = null;

registerHeldUse({ cat: ROD_CAT.id }, fishing.rodUse);
registerHeldUse({ cat: BAIT_CAT.id }, fishing.baitUse);
registerHeldUse({ cat: FISH_CAT.id }, fishing.fishUse);
registerHeldUse({ item: BOTTLE }, fishing.bottleUse);

// ------------------------------------------------------------------ the lines on the cards

// a fish: its rarity, its length (its weight is the card's own, at its foot), its medal and colour, whether it is news
registerItemCardLines({ cat: FISH_CAT.id }, (inst, card) => {
  const i = fishOfItem(inst.item);
  if (i < 0) return;
  const def = FISH[i];
  card.cat = `鱼 · ${TIERS[def.tier].zh}`;
  // (what it is to the pot: the kitchen's fish of its rarity)
  const pot = sameAs(inst.item);
  if (pot && FOOD[pot]) card.rows.push({ value: FOOD[pot].zh, label: '下锅当' });
  const s = inst.state?.fish;
  if (!s) return;
  card.rows.unshift({ value: fmtCm(s.cm), label: '体长' });
  card.foot.mass = s.kg;
  if (s.v > 0) card.badges.push({ text: VARIANTS[s.v].zh, tone: 'meme' });
  if (s.m > 0) card.badges.push({ text: MEDAL_ZH[s.m], tone: s.m >= 3 ? 'meme' : 'stock' });
  if (s.first) card.badges.push({ text: '第一次钓到', tone: 'note' });
  else if (s.rec) card.badges.push({ text: '当时的纪录', tone: 'note' });
  if (canGoLive(i) && fishing.anyRodNow()) card.notes.push({ text: '能当活饵', tone: 'info' });
});

// a rod: the rarity it is for, its power, its reach, its reel and its feel, its perk, and what is on its hook (its bait
// is what is in it: the card's own rows say it)
registerItemCardLines({ cat: ROD_CAT.id }, (inst, card) => {
  const i = rodOfItem(inst.item);
  const r = RODS[i];
  if (!r) return;
  const t = REC_ROD.indexOf(i);
  if (t >= 0) card.rows.push({ value: `${TIERS[t].zh}的鱼`, label: '对付', stars: TIER_STARS[t as Tier] });
  card.rows.push(
    { value: String(r.power), label: '力量' },
    { value: `${r.cast} 米`, label: '最远抛多远' },
    { value: `${r.reel} 米/秒`, label: '收线' },
    { value: r.feel >= 0.95 ? '最宽' : r.feel >= 0.85 ? '宽' : r.feel >= 0.75 ? '较宽' : r.feel >= 0.6 ? '中' : '窄', label: '手感' },
  );
  if (r.perk === 'window') card.notes.push({ text: '咬口后提竿的时间多一半', tone: 'info' });
  else if (r.perk === 'night') card.notes.push({ text: '夜里咬口快五成，白天慢三成', tone: 'info' });
  const live = inst.state?.rod?.live;
  if (live) {
    const f = FISH.find((x) => x.id === live.f);
    card.rows.push({ value: f?.zh ?? live.f, label: '钩上的活饵' });
  } else if (!inst.inside?.length) card.notes.push({ text: '钩上没饵', tone: 'warn' });
});

// a bait: the one rarity it draws (how it goes on is the right button's line: a card says what a thing is, not how it is worked)
registerItemCardLines({ cat: BAIT_CAT.id }, (inst, card) => {
  const b = BAITS[baitOfItem(inst.item)];
  if (!b) return;
  if (b.tier === STAR_TIER) card.rows.push({ value: '只有天象鱼', label: '会来咬的' });
  else card.rows.push({ value: `${TIERS[b.tier].zh}的鱼，哪种都有`, label: '会来咬的', stars: TIER_STARS[b.tier as Tier] });
});

registerItemCardLines({ item: CREEL }, (_inst, card) => {
  card.notes.push({ text: '拿在快捷栏里，捡起来的鱼直接进篓', tone: 'info' });
});

registerItemCardLines({ cat: FLOTSAM_CAT.id }, (inst, card) => {
  if (inst.item === BOTTLE) {
    const s = inst.state?.bottle?.s;
    if (s !== undefined && SPOTS[s]) card.rows.push({ value: SPOTS[s].zh, label: '捞上来的地方' });
  }
  void itemDef;
});

// ------------------------------------------------------------------ what the angler has caught, in the save

const slice: SaveSlice<FishLog> = {
  id: 'fishing',
  version: 1,
  snapshot: () => (fishing.log.stats.casts || Object.keys(fishing.log.kinds).length ? fishing.log : undefined),
  restore: (data) => {
    fishing.log = cleanLog(data);
  },
  clear: () => {
    fishing.log = newLog();
  },
};

// ------------------------------------------------------------------ the module

export default {
  id: 'fishing',
  systems: [fishing],
  slices: [slice],
  devTabs: [fishingTab(fishing, () => game)],
  setup: (ctx) => {
    game = ctx;
    fishing.setup(ctx);
  },
} satisfies GameModule;
