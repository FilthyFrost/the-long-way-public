/**
 * The kitchen module (docs/V3/plan/cooking.md): sixty ingredients, cookware one carries and sets down, a cassette
 * stove that burns canisters of gas, and what comes out of the pot.
 *
 * As this file is loaded it brings its kinds into the catalogue (core/v3/kitchen/items.ts: the ingredients whole and
 * cut, the cookware, every dish) and puts the lines on their cards: a stove's gas, flame and what stands on it, a
 * vessel's contents and how far along they are, a board's, a serving's food and whether it came out perfect, the
 * dishes an ingredient is known to go into. Installed, it is the system "kitchen" (system.ts: the devices the mark
 * finds, the ghosts of the thing in the hands, the cooking), the recipe book in the save (the slice "kitchen"), and
 * the developer's tab 厨房 (devTab.ts). The rules are in core/v3/kitchen.
 */
import type { SaveSlice } from '../../../../core/kernel/slices';
import { hasItemCat, itemDef, registerItemCat, registerItems, retireItem, type ItemInstance } from '../../../../core/modcar/items';
import { KITCHEN_CAT } from '../../../../core/v3/appliances/items';
import { asksFor, cleanBook, knows, newBook, pinned, type BookData } from '../../../../core/v3/kitchen/book';
import { dishesWith } from '../../../../core/v3/kitchen/cook';
import { WAYS } from '../../../../core/v3/kitchen/dishes';
import { BOARD, GAS, GAS_FULL, HOB, INGREDIENT_CAT, KITCHEN_ITEMS, MEAL_CAT, portionOf, STOVE, STOVE2, VESSEL, WAY_OF } from '../../../../core/v3/kitchen/items';
import { burnersOf, CHOPS, fireOf, gasOf, hasCanister, kitOf, phaseOf, potOf, TOSSES, vesselOf } from '../../../../core/v3/kitchen/kit';
import { FOOD, FOODS, GARDEN_BED, LARDER_SHELF, LIKES } from '../../../../core/v3/kitchen/pantry';
import { addLarder } from '../../../../core/modcar/loot';
import { registerItemCardLines, type ItemCard } from '../../itemInfo';
import type { GameContext } from '../../kernel/context';
import type { GameModule } from '../../kernel/modules';
import { kitchenTab } from './devTab';
import { Kitchen } from './system';
// (the cookware is listed with the appliances' kitchen things: their category is theirs to register, first)
import '../appliances';

// ------------------------------------------------------------------ content, as the module is loaded

// the doubles of Nomad Drive's kitchen (docs/V3/plan/growth.md §三): one in a save is read as the kitchen's own — its
// stoves are the cassette stove (what stood on them lost: its pans and its meat were its own), its pan and pot the
// kitchen's, its meat raw beef or chicken whatever it was cooked to, the foods of the same name the kitchen's
const plain = (into: string) => (r: Record<string, unknown>): void => {
  r.item = into;
  delete r.state;
};
for (const id of ['nd_stove_1', 'nd_stove_2', 'nd_stove_3']) retireItem(id, plain('kit_stove'));
retireItem('nd_pan', plain('kit_pan'));
retireItem('nd_cooking_pot', plain('kit_pot'));
for (const id of ['nd_steak', 'nd_steak_mid', 'nd_steak_well', 'nd_steak_burnt']) retireItem(id, plain('ing_beef'));
for (const id of ['nd_drumstick', 'nd_drumstick_mid', 'nd_drumstick_well', 'nd_drumstick_burnt']) retireItem(id, plain('ing_chicken'));
for (const id of ['apple', 'tomato', 'potato', 'watermelon', 'banana', 'orange']) retireItem(`nd_${id}`, `ing_${id}`);
retireItem('nd_milk', 'ing_milk');

if (!hasItemCat(KITCHEN_CAT.id)) registerItemCat(KITCHEN_CAT);
registerItemCat(INGREDIENT_CAT);
registerItemCat(MEAL_CAT);
registerItems(KITCHEN_ITEMS);
// (what of the pantry the places by the road keep, and on which shelf: a world of version 7's cupboards, refrigerators
// and cool boxes hold it — docs/V3/plan/finish.md §二 4, §八 1)
addLarder(FOODS.filter((f) => LARDER_SHELF[f.id]).map((f) => ({ item: `ing_${f.id}`, star: f.star, shelf: LARDER_SHELF[f.id], ...(LIKES[f.id] ? { likes: LIKES[f.id] } : {}) })));
// (and what still comes up in a garden's bed behind a house: docs/V3/plan/finish.md §八 1)
addLarder(GARDEN_BED.map((id) => ({ item: `ing_${id}`, star: FOOD[id].star, shelf: 'bed' as const, ...(LIKES[id] ? { likes: LIKES[id] } : {}) })));

/** the game's one kitchen */
export const kitchen = new Kitchen();
let game: GameContext | null = null;

const PHASE_ZH = { raw: '还是生的', cooking: '快好了', right: '正好', over: '有点过了', burnt: '焦了' } as const;
const portionName = (id: string): string => FOOD[id]?.zh ?? itemDef(id).name.zh;

/** a gas bar: how full, and how long that burns on a high flame */
function gasBar(card: ItemCard, gas: number): void {
  const min = gas / 60;
  card.bars.push({
    label: '燃气',
    value: gas,
    max: GAS_FULL,
    text: gas <= 0 ? '空了' : `${Math.round((gas / GAS_FULL) * 100)}% · 大火约 ${min >= 1 ? `${Math.round(min)} 分钟` : `${Math.round(gas)} 秒`}`,
    tone: gas <= 0 ? 'bad' : gas < GAS_FULL * 0.15 ? 'mid' : 'good',
  });
}

/** what is in a vessel, and how far along */
function potLines(card: ItemCard, inst: ItemInstance): void {
  const v = vesselOf(inst);
  if (!v) return;
  const way = WAY_OF[v];
  const pot = potOf(inst);
  if (!pot) {
    card.notes.push({ text: '空的', tone: 'info' });
    return;
  }
  card.rows.push({ value: `${pot.items.length} 样`, label: pot.items.map((p) => `${p.cut ? '切好的' : ''}${portionName(p.id)}`).join('、') });
  if (pot.season?.length) card.rows.push({ value: `${pot.season.length} 种`, label: '调料加过了' });
  if (pot.out) card.notes.push({ text: '锅里还有一份', tone: 'ok' });
  else if (!WAYS[way].heats) card.notes.push({ text: (pot.toss ?? 0) >= 1 ? '拌好了' : `拌 ${Math.round((pot.toss ?? 0) * TOSSES)}/${TOSSES}`, tone: (pot.toss ?? 0) >= 1 ? 'ok' : 'info' });
  else {
    const ph = phaseOf(inst);
    card.notes.push({ text: `火候：${PHASE_ZH[ph]}`, tone: ph === 'right' ? 'ok' : ph === 'over' || ph === 'burnt' ? 'warn' : 'info' });
  }
}

registerItemCardLines({ item: STOVE }, (inst, card) => {
  if (hasCanister(inst)) gasBar(card, gasOf(inst));
  else card.notes.push({ text: '没有燃气罐', tone: 'warn' });
  const f = fireOf(inst);
  card.rows.push({ value: f === 2 ? '大火' : f === 1 ? '小火' : '关着', label: '火' });
  const v = vesselOf(inst);
  card.rows.push({ value: v ? itemDef(v).name.zh : '空着', label: '炉头上' });
  potLines(card, inst);
});
// (the two-burner stove: each burner's canister, flame and vessel)
registerItemCardLines({ item: STOVE2 }, (inst, card) => {
  burnersOf(inst).forEach((b, i) => {
    const side = i === 0 ? '左' : '右';
    const f = fireOf(b);
    const v = vesselOf(b);
    card.rows.push({ value: `${hasCanister(b) ? `气 ${Math.round((gasOf(b) / GAS_FULL) * 100)}%` : '没有燃气罐'} · ${f === 2 ? '大火' : f === 1 ? '小火' : '关着'} · ${v ? itemDef(v).name.zh : '空着'}`, label: `${side}边的炉头` });
  });
});
// (the hob: its heat and what stands on it; the power it draws on is the power module's line)
registerItemCardLines({ item: HOB }, (inst, card) => {
  const f = fireOf(inst);
  card.rows.push({ value: f === 2 ? '大火' : f === 1 ? '小火' : '关着', label: '电炉' });
  const v = vesselOf(inst);
  card.rows.push({ value: v ? itemDef(v).name.zh : '空着', label: '炉盘上' });
  potLines(card, inst);
});
registerItemCardLines({ item: GAS }, (inst, card) => gasBar(card, gasOf(inst)));
for (const id of Object.values(VESSEL)) registerItemCardLines({ item: id }, (inst, card) => potLines(card, inst));
registerItemCardLines({ item: BOARD }, (inst, card) => {
  const f = kitOf(inst).food;
  if (!f) card.notes.push({ text: '空着', tone: 'info' });
  else card.rows.push({ value: f.cut ? '切好了' : `${f.chops ?? 0}/${CHOPS} 刀`, label: portionName(f.id) });
});
registerItemCardLines({ cat: MEAL_CAT.id }, (inst, card) => {
  const meal = inst.state?.meal;
  if (!meal) return;
  card.rows.push({ value: `+${meal.food}`, label: '饱腹', tone: 'good' });
  if (meal.perfect) card.badges.push({ text: '完美', tone: 'note' });
});
registerItemCardLines({ cat: INGREDIENT_CAT.id }, (inst, card) => {
  const p = portionOf(inst.item);
  if (!p) return;
  const b = kitchen.book;
  const { named } = dishesWith(p.id);
  const known = named.filter((d) => knows(b, d.id));
  if (named.length) card.rows.push({ value: `${known.length}/${named.length}`, label: '点名要它的菜，做出来过的' });
  if (known.length) card.notes.push({ text: `做过：${known.slice(0, 4).map((d) => d.zh).join('、')}${known.length > 4 ? '…' : ''}`, tone: 'info' });
  const pin = pinned(b);
  if (pin && asksFor(pin, p.id)) card.notes.push({ text: `钉住的「${pin.zh}」要它`, tone: 'ok' });
});

// ------------------------------------------------------------------ the recipe book in the save

const book: SaveSlice<BookData> = {
  id: 'kitchen',
  version: 1,
  snapshot: () => {
    const b = kitchen.book;
    return Object.keys(b.made).length || b.fails.length || b.pin || b.tips?.length ? b : undefined;
  },
  restore: (data) => {
    kitchen.book = cleanBook(data);
  },
  clear: () => {
    kitchen.book = newBook();
  },
};

// ------------------------------------------------------------------ the module

export default {
  id: 'kitchen',
  systems: [kitchen],
  slices: [book],
  interact: [kitchen],
  devTabs: [kitchenTab(kitchen, () => game)],
  setup: (ctx) => {
    game = ctx;
    // a meal eaten: what the serving feeds, and the plate back
    ctx.events.on('body:ate', (e) => kitchen.ate(ctx, e.item));
  },
} satisfies GameModule;
