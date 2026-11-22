/**
 * What a pot comes to (docs/V3/plan/cooking.md §3): the dish whose needs the pot fills and which allows everything else
 * in it — the most particular of those, a named dish before a dish by kinds — or, when there is none, a failed dish.
 * Three failures: a mess (no dish is made of this), burnt (left on too long), raw (meat, fish or egg not cooked through,
 * or tossed in a bowl uncooked). A dish's stars are its own; a pot cooked just right, cut and seasoned is perfect, and a
 * perfect dish feeds a quarter more.
 *
 * Pure: the same pot, the same dish.
 */
import { DISHES, WAYS, type DishDef, type Way } from './dishes';
import { FOOD, STAND_INS } from './pantry';

/** the most portions a pot takes */
export const POT_MAX = 5;
/** how done a pot is when it comes off: under this it is not cooked through, over that burnt; between these just right */
export const DONE_UNDER = 0.6;
export const DONE_BURNT = 1.4;
export const DONE_RIGHT: readonly [number, number] = [0.85, 1.15];
/** what a failed dish feeds */
const FAIL_FOOD = { mess: 4, burnt: 2, raw: 6, empty: 0 } as const;
/** the most a serving feeds */
export const FOOD_CAP = 95;

export interface Pot {
  readonly way: Way;
  /** one to five portions: an ingredient of the pantry by its id, or anything else edible by its own */
  readonly items: readonly string[];
  /** how done it was taken off (0 raw … 1 right … 2 burnt); a bowl has no heat (absent: just right) */
  readonly done?: number;
  /** how much of what went in was cut first, 0 … 1; whether a pinch of seasoning went over it */
  readonly cut?: number;
  readonly seasoned?: boolean;
}

export type Fail = 'mess' | 'burnt' | 'raw' | 'empty';

export interface Outcome {
  readonly dish: DishDef | null;
  readonly fail: Fail | null;
  readonly zh: string;
  readonly en: string;
  readonly stars: number;
  readonly perfect: boolean;
  /** per serving */
  readonly food: number;
  readonly servings: number;
}

/** the class of something that is none of the sixty (cooking/types.ts IngClass), or null: what stands in for a tag */
export type ClassOf = (item: string) => string | null;

interface Portion {
  id: string;
  tags: readonly string[];
  food: number;
  raw: boolean;
}

const UNCOOKED = new Set(['meat', 'seafood', 'egg', 'grain']);

function portionOf(id: string, classOf?: ClassOf): Portion | null {
  const f = FOOD[id];
  if (f) return { id, tags: f.tags, food: f.food, raw: f.raw };
  const cls = classOf?.(id);
  const tags = cls ? STAND_INS[cls] : undefined;
  if (!tags) return null;
  return { id, tags, food: 6, raw: !tags.some((t) => UNCOOKED.has(t)) };
}

const fits = (p: Portion, token: string): boolean => (token.startsWith('@') ? p.tags.includes(token.slice(1)) : p.id === token);

/** the portions a dish's needs take (their indices), or null: tried every way round, a pot is five things at the most */
function assign(need: readonly string[], pot: readonly Portion[], k = 0, used: boolean[] = pot.map(() => false)): boolean[] | null {
  if (k === need.length) return used.slice();
  for (let i = 0; i < pot.length; i++) {
    if (used[i] || !fits(pot[i], need[k])) continue;
    used[i] = true;
    const got = assign(need, pot, k + 1, used);
    used[i] = false;
    if (got) return got;
  }
  return null;
}

/** how many of the sixty are of a kind */
const KIND_SIZE = new Map<string, number>();
for (const f of Object.values(FOOD)) for (const t of f.tags) KIND_SIZE.set(t, (KIND_SIZE.get(t) ?? 0) + 1);

/**
 * How particular a dish is: a name counts for more than a kind, a narrow kind (any berry) for more than a wide one (any
 * fruit), a longer list for more than a shorter; then a named dish before a dish by kinds, a feast before both.
 */
function weight(d: DishDef): number {
  let w = 0;
  for (const t of d.need) w += t.startsWith('@') ? 4 + 4 / (KIND_SIZE.get(t.slice(1)) ?? 1) : 10;
  return w + 0.5 * d.stars + (d.layer === 'feast' ? 2 : d.layer === 'named' ? 1 : 0);
}

/** does the pot make this dish: its needs filled, and whatever is left over allowed in it (more of what it names always is) */
export function makes(d: DishDef, way: Way, pot: readonly Portion[]): boolean {
  if (d.way !== way || pot.length < d.need.length) return false;
  // (names first: a kind must not take the portion a name needs)
  const need = [...d.need].sort((a, b) => Number(a.startsWith('@')) - Number(b.startsWith('@')));
  const used = assign(need, pot);
  if (!used) return false;
  for (let i = 0; i < pot.length; i++) {
    if (used[i]) continue;
    const p = pot[i];
    if (d.need.includes(p.id)) continue;
    if (!d.extra.some((t) => fits(p, t))) return false;
  }
  return true;
}

/** the dish a pot of these things makes this way, whatever its heat (null: none) */
export function dishOf(way: Way, items: readonly string[], classOf?: ClassOf): DishDef | null {
  const pot: Portion[] = [];
  for (const id of items) {
    const p = portionOf(id, classOf);
    if (!p) return null;
    pot.push(p);
  }
  let best: DishDef | null = null;
  let bw = -1;
  for (const d of DISHES) {
    if (!makes(d, way, pot)) continue;
    const w = weight(d);
    if (w > bw) {
      best = d;
      bw = w;
    }
  }
  return best;
}

const FAILED: Readonly<Record<Fail, { zh: string; en: string }>> = {
  mess: { zh: '说不清的一团', en: 'Dubious mess' },
  burnt: { zh: '焦炭', en: 'Charred lump' },
  raw: { zh: '夹生的一锅', en: 'Half-raw pot' },
  empty: { zh: '空锅', en: 'Empty pot' },
};

function failed(fail: Fail): Outcome {
  return { dish: null, fail, zh: FAILED[fail].zh, en: FAILED[fail].en, stars: 0, perfect: false, food: FAIL_FOOD[fail], servings: 1 };
}

/** what comes out of the pot */
export function cook(pot: Pot, classOf?: ClassOf): Outcome {
  const items = pot.items.slice(0, POT_MAX);
  if (items.length === 0) return failed('empty');
  const way = WAYS[pot.way];
  const done = way.heats ? pot.done ?? 1 : 1;
  if (way.heats && done > DONE_BURNT) return failed('burnt');
  const portions = items.map((id) => portionOf(id, classOf));
  if (portions.some((p) => p === null)) return failed('mess');
  const ps = portions as Portion[];
  const dish = dishOf(pot.way, items, classOf);
  // not cooked through: what must be cooked, in a pot taken off too soon — or in a bowl, unless the dish is one of raw fish
  const uncooked = ps.filter((p) => !p.raw);
  if (way.heats ? done < DONE_UNDER && uncooked.length > 0 : uncooked.some((p) => !(dish?.raw && p.tags.includes('seafood')))) return failed('raw');
  if (!dish) return failed('mess');
  const right = !way.heats || (done >= DONE_RIGHT[0] && done <= DONE_RIGHT[1]);
  const perfect = right && (pot.cut ?? 0) >= 0.5 && !!pot.seasoned;
  const servings = items.length >= 4 ? 2 : 1;
  let food = 0;
  for (const p of ps) food += p.food;
  food = (food * way.gain * (0.9 + 0.1 * dish.stars) * (perfect ? 1.25 : 1)) / servings;
  return { dish, fail: null, zh: dish.zh, en: dish.en, stars: dish.stars, perfect, food: Math.min(FOOD_CAP, Math.round(food)), servings };
}

/**
 * A pot that makes a dish: each need by its name, or one of its kind — the commonest that leaves the pot this dish
 * and not a more particular one (any vegetable with an egg is eggs with vegetables, but a tomato makes it tomato and eggs).
 */
export function potOf(d: DishDef): string[] {
  const all = Object.values(FOOD);
  const choices = d.need.map((t) => (t.startsWith('@') ? all.filter((f) => f.tags.includes(t.slice(1))).sort((a, b) => a.star - b.star).map((f) => f.id) : [t]));
  const out: string[] = [];
  const walk = (k: number): boolean => {
    if (k === choices.length) return dishOf(d.way, out) === d;
    for (const id of choices[k]) {
      if (out.includes(id) && choices[k].length > 1) continue;
      out.push(id);
      if (walk(k + 1)) return true;
      out.pop();
    }
    return false;
  };
  if (walk(0)) return out.slice();
  return choices.map((c) => c[0]);
}

/** the dishes an ingredient may be part of: by its name, or by a kind it is */
export function dishesWith(id: string): { named: DishDef[]; kind: DishDef[] } {
  const f = FOOD[id];
  const named: DishDef[] = [];
  const kind: DishDef[] = [];
  if (!f) return { named, kind };
  for (const d of DISHES) {
    if (d.need.includes(id) || d.extra.includes(id)) named.push(d);
    else if ([...d.need, ...d.extra].some((t) => t.startsWith('@') && f.tags.includes(t.slice(1)))) kind.push(d);
  }
  return { named, kind };
}
