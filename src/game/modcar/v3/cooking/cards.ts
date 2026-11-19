/**
 * What the item cards say of cooking's things (node C1): a dish by its own name — which dish it is lives on
 * the thing (ItemState.dish), the twelve kinds of item are only its bowl or plate — with what a serving gives,
 * its buff and how long, the line of its recipe; a piece of cookware with the ways of cooking it makes
 * possible. Registered with the card (itemInfo.ts registerItemCardLines) as the module is loaded.
 */
import type { ItemInstance } from '../../../../core/modcar/items';
import { BUFFS } from '../../../../core/v3/cooking/buffs';
import type { DishState } from '../../../../core/v3/cooking/items';
import { RECIPES } from '../../../../core/v3/cooking/recipes';
import { METHODS, type Method } from '../../../../core/v3/cooking/types';
import type { ItemCard } from '../../itemInfo';
import { STATION_GEAR } from './content';

const BLURB = new Map(RECIPES.map((r) => [r.id, r.blurb]));

/** a dish's card: its name, its stars, what a serving gives, its buff */
export function dishCardLines(inst: ItemInstance, card: ItemCard): void {
  const d = inst.state?.dish as DishState | undefined;
  if (!d) return;
  card.name = (inst.n ?? 1) > 1 ? `${d.zh} ×${inst.n}` : d.zh;
  card.icon = inst.item === 'dish_drink' ? 'drink' : 'food';
  if (inst.q !== undefined) card.stars = inst.q;
  card.blurb = d.r ? (BLURB.get(d.r) ?? '') : '自己随手做的一锅，没照哪本菜谱。';
  const each = (inst.n ?? 1) > 1 ? '（每份）' : '';
  if (d.food > 0) card.rows.push({ value: `+${d.food}`, label: `饱腹${each}`, tone: 'good' });
  if (d.water > 0) card.rows.push({ value: `+${d.water}`, label: `解渴${each}`, tone: 'good' });
  if (d.hp > 0) card.rows.push({ value: `+${d.hp}`, label: `生命${each}`, tone: 'good' });
  else if (d.hp < 0) card.rows.push({ value: `${d.hp}`, label: `生命${each}`, tone: 'bad' });
  if (d.buff && d.buffS) card.notes.push({ text: `吃完：${BUFFS[d.buff].name.zh} ${Math.round(d.buffS / 60)} 分钟 · ${BUFFS[d.buff].blurb.zh}`, tone: 'ok' });
  if (d.sick) card.notes.push({ text: '吃了会闹肚子：一阵子掉水分', tone: 'warn' });
}

/** the ways of cooking a piece of cookware makes possible (at a camp stove, or a fire ring for those it takes) */
export function cookwareCardLines(inst: ItemInstance, card: ItemCard): void {
  const id = inst.item.startsWith('cook_') ? inst.item.slice(5) : '';
  const ways = (Object.keys(METHODS) as Method[]).filter((m) => METHODS[m].cookware.includes(id)).map((m) => METHODS[m].name.zh);
  if (ways.length) card.rows.push({ value: ways.join('、'), label: '能做' });
  if (STATION_GEAR.fire.takes.includes(id)) card.notes.push({ text: '篝火上也能用', tone: 'info' });
  if (id === 'stove') card.notes.push({ text: '放在地上，对着灶头按 E 做饭：用快捷栏里的锅，或者放在旁边两米内的', tone: 'info' });
  if (id === 'rack' || id === 'smoker') card.notes.push({ text: '放在地上，对着它按 E：把东西挂上去，过几个游戏小时就好', tone: 'info' });
}
