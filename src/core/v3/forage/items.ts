/**
 * The forage kinds as items (docs/V3/nodes/W3-forage.md): the ten item categories and one item row per kind,
 * made from the table of kinds, for the game's module to register (src/core/modcar/items.ts registerItemCat,
 * registerItems). A forage kind and its item share one id, so "what was picked" needs no second table.
 * Pure data.
 */
import type { ItemRow } from '../../modcar/items';
import { FORAGE_KINDS } from './kinds';
import { FORAGE_CATS, type ForageCat } from './types';

/** the item category of a forage category */
export function forageItemCat(cat: ForageCat): string {
  return `forage_${cat}`;
}

/** what forage that has gone off becomes: good for the recycler's organics and nothing else */
export const SPOILED_FORAGE = 'forage_spoiled';

/** how long eating one portion takes (s): a mouthful, not a meal */
const EAT_S = 2.4;

const ORDER: readonly ForageCat[] = ['mushroom', 'fruit', 'greens', 'root', 'herb', 'nut', 'flower', 'medicinal', 'shore', 'resource'];

/** the ten categories, in the catalogue's order (their place among all item categories: after the game's own) */
export function forageItemCats(): { id: string; name: { zh: string; en: string }; order: number }[] {
  return ORDER.map((c, i) => ({ id: forageItemCat(c), name: FORAGE_CATS[c].name, order: 200 + i }));
}

/** one row per kind, and the one for what has gone off */
export function forageItemRows(): ItemRow[] {
  const rows: ItemRow[] = [
    {
      id: SPOILED_FORAGE,
      cat: 'junk',
      name: { zh: '烂掉的野货', en: 'Spoiled forage' },
      stars: 0,
      mass: 0.08,
      stack: 20,
      salvage: { organics: 1 },
      model: 'forage_lump',
      paint: 0x5b4636,
      paint2: 0x3a2f28,
      blurb: '放坏了的野菜野果。',
    },
  ];
  for (const k of FORAGE_KINDS) {
    const mineral = k.item.tags?.includes('stone') || k.item.tags?.includes('chemical') || k.id === 'salt' || k.id === 'clay';
    rows.push({
      id: k.id,
      cat: forageItemCat(k.cat),
      name: k.name,
      stars: k.item.stars,
      mass: k.item.mass,
      carry: 'small',
      stack: k.item.stack,
      tags: ['forage', k.cat, ...(k.item.tags ?? [])],
      ...(k.item.perishHours ? { perish: { hours: k.item.perishHours, into: SPOILED_FORAGE } } : {}),
      ...(k.item.eat ? { eat: { food: k.item.eat.food, hp: k.item.eat.hp, sec: EAT_S, ...(k.item.eat.effect ? { effect: k.item.eat.effect } : {}) } } : {}),
      salvage: mineral ? {} : { organics: 1 },
      model: `forage_${k.look.item}`,
      paint: k.look.colours[0],
      paint2: k.look.colours[1],
      blurb: k.blurb,
    });
  }
  return rows;
}
