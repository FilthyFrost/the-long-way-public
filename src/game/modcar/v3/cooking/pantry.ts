/**
 * The ingredients at hand at a station (node C1): what the cooking panel lists and takes portions from — the
 * hotbar's slots, what is in a basket or a cool box in the hotbar, and what is in a jar, a cool box or a
 * basket set down within PANTRY_M of the station. Only things that go into a pot are listed (core/v3/cooking
 * ingredients.ts); a kind the player does not know yet goes by the name it goes by everywhere (the veil).
 *
 * A portion taken is one thing off a stack (ModPlayer.takeOne for a slot, takeInside for a box), so a stack
 * of five mushrooms gives five portions; a portion given back goes into the hands (ModPlayer.receive), and
 * what they do not take is set down by the feet.
 */
import { countOf, itemDef, itemVeil, takeInside, type ItemInstance } from '../../../../core/modcar/items';
import { ingredient } from '../../../../core/v3/cooking/ingredients';
import type { GameContext } from '../../kernel/context';
import type { Loose } from '../../loose';
import type { PantryRow } from './session';

/** a row with where its stack is, so that a portion can be taken from there */
export interface PantryPlace extends PantryRow {
  /** the hotbar's slot it is in, or the slot of the box it is in (−1: in a box set down) */
  readonly slot: number;
  /** the box it is in (null: the slot itself holds it) */
  readonly box: ItemInstance | null;
  /** the box set down, if it is one */
  readonly lying: Loose | null;
}

/** the rows at hand for a station at (x, z): the hands first, then what is in the boxes in them, then the boxes set down near */
export function pantryRows(ctx: GameContext, x: number, z: number, near: number): PantryPlace[] {
  const out: PantryPlace[] = [];
  const lang = ctx.ui.lang === 'en' ? 'en' : 'zh';
  const slots = ctx.player.slots;
  for (let i = 0; i < slots.length; i++) {
    const h = slots[i];
    if (h?.kind !== 'item') continue;
    if (ingredient(h.item.item)) out.push({ item: h.item, name: nameOf(h.item.item, lang), where: 'hand', slot: i, box: null, lying: null });
  }
  for (let i = 0; i < slots.length; i++) {
    const h = slots[i];
    if (h?.kind !== 'item' || !itemDef(h.item.item).holds || !h.item.inside) continue;
    for (const x of h.item.inside) if (ingredient(x.item)) out.push({ item: x, name: nameOf(x.item, lang), where: 'box', slot: i, box: h.item, lying: null });
  }
  const list = ctx.loose.list;
  const r2 = near * near;
  for (let i = 0; i < list.length; i++) {
    const l = list[i];
    const box = l.item;
    if (!box || !box.inside || !itemDef(box.item).holds || l.riding) continue;
    if ((l.x - x) * (l.x - x) + (l.z - z) * (l.z - z) > r2) continue;
    for (const x2 of box.inside) if (ingredient(x2.item)) out.push({ item: x2, name: nameOf(x2.item, lang), where: 'near', slot: -1, box, lying: l });
  }
  return out;
}

/** a kind's name as the lists give it, without a count (a kind the player does not know by the veil's) */
function nameOf(id: string, lang: 'zh' | 'en'): string {
  return (itemVeil(id) ?? itemDef(id).name)[lang];
}

/** one portion of a row out of where it is: one thing off its stack, or the last one itself (null: it is gone) */
export function takePortion(ctx: GameContext, row: PantryPlace, nowS: number): ItemInstance | null {
  if (row.box) {
    const ins = row.box.inside;
    const i = ins ? ins.indexOf(row.item) : -1;
    if (i < 0) return null;
    return takeInside(row.box, i, nowS, 1);
  }
  const h = ctx.player.slots[row.slot];
  if (h?.kind !== 'item' || h.item !== row.item) return null;
  return countOf(row.item) > 0 ? ctx.player.takeOne(row.slot) : null;
}

/** a thing into the hands; what they do not take is set down by the feet. True when all of it went into the hands */
export function intoHandsOrFeet(ctx: GameContext, item: ItemInstance): boolean {
  const rest = ctx.player.receive({ kind: 'item', item });
  if (rest <= 0) return true;
  const w = ctx.player.walker;
  const l = ctx.loose.addItem(item, w.x + Math.cos(w.heading) * 0.45, w.y + 0.9, w.z + Math.sin(w.heading) * 0.45, w.heading);
  ctx.loose.drop(l);
  return false;
}
