/**
 * The recipe book (docs/V3/plan/cooking.md §3): every dish made goes into it by itself — how often, and whether it
 * once came out perfect; a combination that came to nothing is noted too, so that the pot can say so the next time the
 * same things go in. A dish not yet made is a silhouette with its stars and a hint (the kinds of what it is made of,
 * never the names) — and it is in the book only once one has met what it is made of (docs/V3/plan/finish.md §八 5: 你见过
 * 哪些食材，本子上才出现用到它们的菜): every ingredient that comes into the hands is noted, and a new one brings the
 * dishes it completes. One dish may be pinned: what it needs is pointed out when it is in the hands.
 *
 * Pure data and rules; the game's module keeps a book in the save.
 */
import type { Outcome } from './cook';
import { DISH, DISHES, WAYS, type DishDef, type Way } from './dishes';
import { FOOD, TAG_NAME } from './pantry';

export interface BookData {
  /** dishes made, by id: how often, and whether once perfect */
  made: Record<string, { n: number; p?: 1 }>;
  /** combinations that came to nothing (comboKey), the latest last */
  fails: string[];
  /** the dish pinned */
  pin?: string;
  /** the kitchen's tips shown once already (game/modcar/v3/kitchen: TIPS) */
  tips?: string[];
  /**
   * the ingredients one has had in the hands (the pantry's ids). Absent in a book kept before they were noted: every
   * dish is in that book, as it always was
   */
  seen?: string[];
}

/** a tip not yet shown: shown now (true), and never again in this book */
export function firstTip(book: BookData, id: string): boolean {
  const t = (book.tips ??= []);
  if (t.includes(id)) return false;
  t.push(id);
  return true;
}

/** how many failed combinations are kept (the oldest forgotten first) */
export const FAILS_KEPT = 200;

export function newBook(): BookData {
  return { made: {}, fails: [], seen: [] };
}

/**
 * Is a dish in the book for one to see: made already — or one that could be made of what one has met, every thing it
 * needs by its name or of its kind (a book kept before the ingredients were noted: every dish)
 */
export function shown(book: BookData, d: DishDef): boolean {
  const seen = book.seen;
  if (!seen || book.made[d.id]) return true;
  return d.need.every((t) => (t.startsWith('@') ? seen.some((id) => FOOD[id]?.tags.includes(t.slice(1))) : seen.includes(t)));
}

/**
 * An ingredient has come into the hands: met for the first time, it is noted — the dishes not made yet that come into
 * the book with it (none: met before, no ingredient of the pantry's, or it completes nothing yet)
 */
export function meet(book: BookData, food: string): DishDef[] {
  const seen = book.seen;
  if (!seen || !FOOD[food] || seen.includes(food)) return [];
  const before = new Set(DISHES.filter((d) => shown(book, d)));
  seen.push(food);
  return DISHES.filter((d) => !before.has(d) && shown(book, d));
}

/** a combination's name: the way, and what went in, in no order */
export function comboKey(way: Way, items: readonly string[]): string {
  return `${way}:${[...items].sort().join('+')}`;
}

export interface Noted {
  /** the first time this dish was made */
  first: boolean;
  /** the first time it came out perfect */
  firstPerfect: boolean;
  /** a combination that comes to nothing, not met before */
  newFail: boolean;
}

/** what came out of a pot written into the book */
export function note(book: BookData, way: Way, items: readonly string[], outcome: Outcome): Noted {
  const out: Noted = { first: false, firstPerfect: false, newFail: false };
  if (outcome.dish) {
    const e = book.made[outcome.dish.id];
    if (!e) {
      book.made[outcome.dish.id] = outcome.perfect ? { n: 1, p: 1 } : { n: 1 };
      out.first = true;
      out.firstPerfect = outcome.perfect;
    } else {
      e.n++;
      if (outcome.perfect && !e.p) {
        e.p = 1;
        out.firstPerfect = true;
      }
    }
    return out;
  }
  // (burnt and raw are the heat's doing, not the combination's)
  if (outcome.fail !== 'mess') return out;
  const key = comboKey(way, items);
  if (book.fails.includes(key)) return out;
  book.fails.push(key);
  if (book.fails.length > FAILS_KEPT) book.fails.splice(0, book.fails.length - FAILS_KEPT);
  out.newFail = true;
  return out;
}

/** did these things, this way, come to nothing before */
export function knownFail(book: BookData, way: Way, items: readonly string[]): boolean {
  return items.length > 0 && book.fails.includes(comboKey(way, items));
}

export function knows(book: BookData, dish: string): boolean {
  return !!book.made[dish];
}

/** a dish not yet made, hinted at: the kinds of what it needs and the way — "某种蔬菜 + 某种蛋，煎炒" */
export function hintOf(d: DishDef, lang: 'zh' | 'en' = 'zh'): string {
  const seen = new Map<string, number>();
  for (const t of d.need) {
    const tag = t.startsWith('@') ? t.slice(1) : (FOOD[t]?.group ?? 'misc');
    const name = TAG_NAME[tag]?.[lang] ?? tag;
    seen.set(name, (seen.get(name) ?? 0) + 1);
  }
  const parts = [...seen].map(([name, n]) => (lang === 'zh' ? `某种${name}${n > 1 ? ` ×${n}` : ''}` : `some ${name}${n > 1 ? ` ×${n}` : ''}`));
  return lang === 'zh' ? `${parts.join(' + ')}，${WAYS[d.way].zh}` : `${parts.join(' + ')}, ${WAYS[d.way].en.toLowerCase()}`;
}

/** does a dish ask for this ingredient: by its name, or by a kind it is */
export function asksFor(d: DishDef, food: string): boolean {
  const f = FOOD[food];
  if (!f) return false;
  return d.need.some((t) => (t.startsWith('@') ? f.tags.includes(t.slice(1)) : t === food));
}

/** the pinned dish (null: none, or one that is no dish any more) */
export function pinned(book: BookData): DishDef | null {
  return book.pin ? (DISH[book.pin] ?? null) : null;
}

/** pin a dish, or with the one pinned already, let it go: what is pinned now */
export function togglePin(book: BookData, dish: string): DishDef | null {
  if (book.pin === dish || !DISH[dish]) delete book.pin;
  else book.pin = dish;
  return pinned(book);
}

/** how far the book has got: dishes made and perfect ones, of how many, and by stars */
export function tally(book: BookData): { made: number; perfect: number; total: number; stars: { made: number; total: number }[] } {
  const stars = [1, 2, 3, 4, 5].map(() => ({ made: 0, total: 0 }));
  let made = 0;
  let perfect = 0;
  for (const d of DISHES) {
    const s = stars[d.stars - 1];
    s.total++;
    const e = book.made[d.id];
    if (!e) continue;
    made++;
    s.made++;
    if (e.p) perfect++;
  }
  return { made, perfect, total: DISHES.length, stars };
}

/** every dish made once (the developer's panel): `perfect` marks them so too */
export function fillBook(book: BookData, perfect = false): void {
  for (const d of DISHES) {
    const e = (book.made[d.id] ??= { n: 1 });
    if (perfect) e.p = 1;
  }
}

/** a book read back from a save, made sound: what is no dish is dropped, counts are whole numbers from 1 */
export function cleanBook(raw: unknown): BookData {
  const out = newBook();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as { made?: unknown; fails?: unknown; pin?: unknown; tips?: unknown; seen?: unknown };
  // (a book kept before the ingredients were noted: it says nothing of them, and shows every dish as it did)
  if (Array.isArray(r.seen)) out.seen = [...new Set(r.seen.filter((id): id is string => typeof id === 'string' && !!FOOD[id]))];
  else delete out.seen;
  if (r.made && typeof r.made === 'object' && !Array.isArray(r.made)) {
    for (const [id, e] of Object.entries(r.made as Record<string, unknown>)) {
      if (!DISH[id] || !e || typeof e !== 'object') continue;
      const n = (e as { n?: unknown }).n;
      const count = typeof n === 'number' && Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1;
      out.made[id] = (e as { p?: unknown }).p ? { n: count, p: 1 } : { n: count };
    }
  }
  if (Array.isArray(r.fails)) for (const k of r.fails) if (typeof k === 'string' && k.length < 200 && !out.fails.includes(k)) out.fails.push(k);
  if (out.fails.length > FAILS_KEPT) out.fails.splice(0, out.fails.length - FAILS_KEPT);
  if (typeof r.pin === 'string' && DISH[r.pin]) out.pin = r.pin;
  if (Array.isArray(r.tips)) {
    const tips = r.tips.filter((t): t is string => typeof t === 'string' && t.length > 0 && t.length < 40).slice(0, 40);
    if (tips.length) out.tips = [...new Set(tips)];
  }
  return out;
}
