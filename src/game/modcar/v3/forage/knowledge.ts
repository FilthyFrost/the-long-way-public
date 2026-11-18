/**
 * What the player knows of the forage kinds (node W3): which kinds go by their own name, which are still
 * "an unknown mushroom", and which toxic look-alike is taken for its edible twin. Knowledge is the player's,
 * not the thing's: an item is always its true kind, and only what it is called and what its card says change.
 *
 * A kind is known when the compendium says so (it was tasted, a page was read, the developer said so), or by
 * the skill: every common kind from level 3, uncommon from 6, rare from 9; legendary kinds only by taste or
 * page. A toxic look-alike (ForageKind.twin) is NOT learnt by its rarity: while it is not known and its
 * edible twin is, it goes by the twin's name — that is the trap — until it is tasted, a page names it, or the
 * perk forage_twins tells the two apart.
 *
 * Everything here is worked out from the Progress and kept (a state a kind, the cards of the plants) until
 * the Progress says it changed (api.ts progressRev): the veil is asked every frame for the thing in the
 * hands and the thing under the mark, and answers from an array.
 */
import { itemVeil } from '../../../../core/modcar/items';
import type { ItemInstance } from '../../../../core/modcar/items';
import type { Text } from '../../../../core/modcar/types';
import { FORAGE_KINDS } from '../../../../core/v3/forage/kinds';
import { FORAGE_CATS, type ForageCat, type ForageKind } from '../../../../core/v3/forage/types';
import type { ItemCard } from '../../itemInfo';
import { itemWordsChanged } from '../../itemInfo';
import { progress, progressRev } from '../progress/api';
import { FORAGE_DOMAIN, FORAGE_SKILL_ID, KNOWN_FROM, PERK_TWINS, UNKNOWN_BLURB, WORDS } from './content';

/** a kind's index in FORAGE_KINDS by its id (a Map: an id that is no kind answers undefined, whatever it is) */
export const KIND_INDEX: ReadonlyMap<string, number> = new Map(FORAGE_KINDS.map((k, i) => [k.id, i]));

/** every kind's id, in the catalogue's order (the compendium's field) */
export const KIND_IDS: readonly string[] = FORAGE_KINDS.map((k) => k.id);

/** the index of each kind's edible twin (−1: it has none) */
const TWIN = new Int16Array(FORAGE_KINDS.length).fill(-1);
for (let i = 0; i < FORAGE_KINDS.length; i++) {
  const t = FORAGE_KINDS[i].twin;
  if (t !== undefined) TWIN[i] = KIND_INDEX.get(t) ?? -1;
}

/** how a kind stands with the player */
export const KNOWN = 0;
export const UNKNOWN = 1;
/** a toxic look-alike taken for its edible twin */
export const MISTAKEN = 2;
export type Veil = typeof KNOWN | typeof UNKNOWN | typeof MISTAKEN;

const state = new Uint8Array(FORAGE_KINDS.length).fill(UNKNOWN);
/** the Progress's count of changes the states were worked out at (−1: never) */
let at = -1;

/** is a kind known, by the compendium or by the skill? (not asked every frame: it builds the compendium's key) */
function knownNow(k: ForageKind, level: number, twins: boolean): boolean {
  if (progress.knowledge(FORAGE_DOMAIN, k.id) === 2) return true;
  return k.twin !== undefined ? twins : level >= KNOWN_FROM[k.rarity];
}

/** the states brought up to the Progress, when it has changed since they were worked out */
function refresh(): void {
  const rev = progressRev();
  if (rev === at) return;
  at = rev;
  const level = progress.level(FORAGE_SKILL_ID);
  const twins = progress.hasPerk(PERK_TWINS);
  let changed = false;
  for (let i = 0; i < FORAGE_KINDS.length; i++) {
    const k = FORAGE_KINDS[i];
    let s: Veil = knownNow(k, level, twins) ? KNOWN : UNKNOWN;
    if (s === UNKNOWN && TWIN[i] >= 0 && knownNow(FORAGE_KINDS[TWIN[i]], level, twins)) s = MISTAKEN;
    if (state[i] !== s) {
      state[i] = s;
      changed = true;
    }
  }
  if (!changed) return;
  // (what things are called has changed for a reason that is not in the things: names and cards kept between
  // frames are made again, and the cards of the plants)
  pointCards.clear();
  pointWords.clear();
  itemWordsChanged();
}

/** how the kind of this index stands with the player now */
export function veilOf(index: number): Veil {
  refresh();
  return state[index] as Veil;
}

/** what the kind of this index is called now: its own name, its category's unknown name, or its edible twin's */
export function nameNow(index: number): Text {
  const s = veilOf(index);
  const k = FORAGE_KINDS[index];
  return s === KNOWN ? k.name : s === MISTAKEN ? FORAGE_KINDS[TWIN[index]].name : FORAGE_CATS[k.cat].unknown;
}

/**
 * The veil over the item catalogue (src/core/modcar/items.ts setItemVeil): the name a kind goes by while the
 * player does not know it; null when it is known, or is no forage kind. Allocates nothing.
 */
export function forageVeil(id: string): Text | null {
  const i = KIND_INDEX.get(id);
  if (i === undefined) return null;
  refresh();
  const s = state[i];
  if (s === KNOWN) return null;
  return s === MISTAKEN ? FORAGE_KINDS[TWIN[i]].name : FORAGE_CATS[FORAGE_KINDS[i].cat].unknown;
}

/** the kinds of one category, and of one rarity that the skill teaches (those without a twin) */
export function kindsOfCat(cat: ForageCat): string[] {
  return FORAGE_KINDS.filter((k) => k.cat === cat).map((k) => k.id);
}

export function kindsTaughtAt(level: number): string[] {
  return FORAGE_KINDS.filter((k) => k.twin === undefined && KNOWN_FROM[k.rarity] === level).map((k) => k.id);
}

/** the toxic look-alikes: what the perk forage_twins names */
export function twinKinds(): string[] {
  return FORAGE_KINDS.filter((k) => k.twin !== undefined).map((k) => k.id);
}

// ------------------------------------------------------------------ the cards

/** the note the item card puts on a kind whose `eat` makes one sick (itemInfo.ts): hidden while the kind is taken for its twin */
const SICK_NOTE = '吃了会闹肚子';

/**
 * A forage item's card, after the card's ordinary lines (registered for the ten categories). An unknown kind
 * shows its veiled name and one line, nothing else; a look-alike taken for its twin shows what the twin's
 * card would; a known kind adds where it grows and how many were picked so far.
 */
export function forageCardLines(inst: ItemInstance, card: ItemCard): void {
  const i = KIND_INDEX.get(inst.item);
  if (i === undefined) return;
  const s = veilOf(i);
  const k = FORAGE_KINDS[i];
  if (s === UNKNOWN) {
    card.stars = 0;
    card.blurb = UNKNOWN_BLURB;
    card.badges.length = 0;
    card.rows.length = 0;
    card.bars.length = 0;
    card.notes.length = 0;
    return;
  }
  const as = s === MISTAKEN ? FORAGE_KINDS[TWIN[i]] : k;
  if (s === MISTAKEN) {
    card.stars = as.item.stars;
    card.blurb = as.blurb;
    for (let n = card.notes.length - 1; n >= 0; n--) if (card.notes[n].text.startsWith(SICK_NOTE)) card.notes.splice(n, 1);
  }
  card.rows.push({ value: as.where.zh, label: WORDS.where.zh });
  card.rows.push({ value: `${progress.entry(FORAGE_DOMAIN, as.id)?.count ?? 0} 个`, label: WORDS.pickedSoFar.zh });
}

const pointCards = new Map<number, ItemCard>();
const pointWords = new Map<number, Text>();

const TOOL_HINT: Readonly<Record<NonNullable<ForageKind['tool']>, string>> = {
  knife: '带着小刀采：品质多一星',
  trowel: '带着小铲挖：多挖出一个',
  sickle: '带着镰刀割：一次双份',
};

/**
 * The card of a plant one can pick, as the mark shows it: kept by kind until what the player knows changes
 * (the same object every frame: the view does not look into it again).
 */
export function pointCard(index: number): ItemCard {
  refresh();
  let card = pointCards.get(index);
  if (card) return card;
  const s = state[index] as Veil;
  const k = FORAGE_KINDS[index];
  const as = s === MISTAKEN ? FORAGE_KINDS[TWIN[index]] : k;
  const known = s !== UNKNOWN;
  card = {
    key: `forage:${k.id}:${s}`,
    icon: k.cat === 'resource' ? 'box' : 'food',
    cat: FORAGE_CATS[k.cat].name.zh,
    name: nameNow(index).zh,
    stars: known ? as.item.stars : 0,
    badges: [],
    blurb: known ? as.blurb : UNKNOWN_BLURB,
    rows: known ? [{ value: as.where.zh, label: WORDS.where.zh }] : [],
    bars: [],
    notes: known && as.tool ? [{ text: TOOL_HINT[as.tool], tone: 'info' }] : [],
    foot: {},
    kept: true,
  };
  pointCards.set(index, card);
  return card;
}

/** the prompt's words for a plant of this kind ("采 <b>野莓</b>"), kept like its card */
export function pointWord(index: number): Text {
  refresh();
  let w = pointWords.get(index);
  if (!w) {
    const name = nameNow(index);
    w = { zh: `${WORDS.pick.zh} <b>${name.zh}</b>`, en: `${WORDS.pick.en} <b>${name.en}</b>` };
    pointWords.set(index, w);
  }
  return w;
}

/** (for the tests) the veil as the catalogue has it: forageVeil once the module has set it */
export function veiledName(id: string): Text | null {
  return itemVeil(id);
}
