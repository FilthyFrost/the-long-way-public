/**
 * A pot at a station (node C1): what is in it and how its cooking stands — plain data a station keeps while
 * one is away and the save keeps — and the pure functions of it: begin the cooking, let time pass on the
 * flame, take it off, and plate (the core's rules.ts cook, with the perks of the skill).
 *
 * The steps follow the way of cooking (src/core/v3/cooking/steps.ts METHOD_STEPS): the knife, the flame,
 * seasoning, the wait, plating. A pot that is a recipe has every step its way has; a pot of no recipe has the
 * flame (and the wait) and nothing else — free cooking has only the heat. Soups, stews, rice, bakes and drinks
 * go into their wait by themselves once they are done at the flame: one may walk away, and the pot keeps
 * cooking at its flame (a low one holds it; a high one takes it over). A roast, a fry or a stir-fry is taken
 * off the flame by the cook. The ways of keeping (a drying rack, a smoker) keep for game hours instead.
 *
 * Nothing here touches the game: the system steps the pots that are on a flame (stepCook allocates nothing),
 * the panel and the robot cook change them through the session (session.ts).
 */
import { freshNow, freshStage, type ItemInstance } from '../../../../core/modcar/items';
import { recipeOf } from '../../../../core/v3/cooking/rules';
import { cook, seasonScore } from '../../../../core/v3/cooking/rules';
import { AUTO_SEASON, band, METHOD_STEPS, newPot, potDone, potScore, stepPot, type Heat, type Pot } from '../../../../core/v3/cooking/steps';
import { recipe as recipeById } from '../../../../core/v3/cooking/recipes';
import { FOOD_CAP, FREE_STARS, type Dish, type Method, type PotItem } from '../../../../core/v3/cooking/types';

/** where a pot's cooking stands: being filled, cut, on the flame, seasoned, in its wait, keeping on a rack, ready to plate */
export type Phase = 'pick' | 'knife' | 'heat' | 'season' | 'wait' | 'keep' | 'plate';

export interface PotState {
  method: Method;
  /** the portions in it, each one thing, as they went in */
  items: ItemInstance[];
  phase: Phase;
  /** the recipe it is, fixed as the cooking began (null: a pot of no recipe) */
  recipe: string | null;
  /** the steps this cooking has (as it began) */
  knife: boolean;
  season: boolean;
  /** the core's pot: doneness, since stirred, turned, seconds on the flame and of the wait */
  pot: Pot;
  heat: Heat;
  /** on the flame: the system steps it */
  lit: boolean;
  /** stirred or turned since it was last stepped */
  stir: boolean;
  /** how far off each cut was (0 on the beat … 1) */
  cuts: number[];
  /** the pinches of the five tastes added */
  added: number[];
  /** "season for me" */
  auto: boolean;
  /** a rack's or a smoker's: the world's second the keeping began (−1: not yet) */
  keepFrom: number;
  /** the hottest band it reached: what the view shows (smoke when it caught) */
  most: number;
}

export function newPotState(method: Method): PotState {
  return { method, items: [], phase: 'pick', recipe: null, knife: false, season: false, pot: newPot(method), heat: 0, lit: false, stir: false, cuts: [], added: [0, 0, 0, 0, 0], auto: false, keepFrom: -1, most: 0 };
}

/** is this a way of keeping (game hours on a rack, in smoke, in a jar) */
export function keeps(m: Method): boolean {
  return METHOD_STEPS[m].keepH !== undefined;
}

/** the pot's portions as the rules take them: the item, its stars, how fresh (a thing that has turned counts as going off) */
export function potItems(s: PotState, nowS: number): PotItem[] {
  const out: PotItem[] = [];
  for (const it of s.items) {
    const st = it.fresh === undefined ? 0 : freshStage(freshNow(it, nowS));
    out.push({ item: it.item, ...(it.q !== undefined ? { q: it.q } : {}), fresh: st >= 2 ? 2 : (st as 0 | 1) });
  }
  return out;
}

/** cuts the knife step asks: so many a portion */
export function cutsWanted(s: PotState, perPortion: number): number {
  return s.knife ? perPortion * s.items.length : 0;
}

/**
 * The cooking begins (the panel's "go"): what the pot is is fixed, and with it its steps; the first of them
 * follows. A way with a flame starts at a medium one.
 */
export function beginCooking(s: PotState, nowS: number): void {
  const m = METHOD_STEPS[s.method];
  const r = s.items.length ? recipeOf(s.method, potItems(s, nowS)) : null;
  s.recipe = r ? r.id : null;
  s.knife = !!r && m.knife;
  s.season = !!r && m.season;
  s.pot = newPot(s.method);
  s.cuts.length = 0;
  for (let k = 0; k < 5; k++) s.added[k] = 0;
  s.most = 0;
  s.keepFrom = -1;
  // (the knife comes first: nothing is on the flame while one cuts)
  s.lit = false;
  if (s.knife) s.phase = 'knife';
  else afterKnife(s, nowS);
}

/** the knife done (or there was none): onto the flame, onto the rack, or straight to seasoning */
export function afterKnife(s: PotState, nowS: number): void {
  const m = METHOD_STEPS[s.method];
  if (m.keepH !== undefined) {
    s.phase = 'keep';
    s.keepFrom = nowS;
    return;
  }
  if (m.cookS > 0) {
    s.phase = 'heat';
    s.lit = true;
    if (s.heat === 0) s.heat = 2;
    return;
  }
  s.phase = s.season && !s.auto ? 'season' : 'plate';
}

/** off the flame (a roast, a fry, a stir-fry when the cook says so; any pot taken off early): seasoning or the plate next */
export function takeOff(s: PotState): void {
  s.lit = false;
  s.heat = 0;
  s.phase = s.season && !s.auto ? 'season' : 'plate';
}

/** the seasoning done: a pot in its wait waits on, anything else is ready */
export function seasoned(s: PotState): void {
  if (s.phase !== 'season') return;
  s.phase = s.lit && !potDone(s.pot) ? 'wait' : 'plate';
}

/**
 * Let dt seconds pass for a pot on its flame: it cooks (a stir that came since the last step counts once),
 * goes into its wait by itself when it is done at the flame, and is ready to plate when the wait is through.
 * Allocates nothing.
 */
export function stepCook(s: PotState, dt: number): void {
  if (!s.lit || !(dt > 0)) return;
  // (a stir that came since the last step counts in this one)
  stepPot(s.pot, s.heat, s.stir, dt);
  s.stir = false;
  const b = band(s.pot.d);
  if (b > s.most) s.most = b;
  const m = METHOD_STEPS[s.method];
  if (s.phase === 'heat' && m.waitS > 0 && s.pot.d >= 1) s.phase = s.season && !s.auto ? 'season' : 'wait';
  if (s.phase === 'wait' && potDone(s.pot)) s.phase = 'plate';
}

/** has a rack's or a smoker's keeping run its game hours? */
export function keptEnough(s: PotState, nowS: number): boolean {
  const h = METHOD_STEPS[s.method].keepH;
  return h !== undefined && s.keepFrom >= 0 && nowS - s.keepFrom >= h * 3600;
}

/** what the perks of the skill change about a dish */
export interface PlatePerks {
  /** cook_taste: the seasoning's score has a wider window */
  taste: boolean;
  /** cook_master: a pot of no recipe may reach four stars */
  master: boolean;
  /** cook_extra rolled lucky: one more serving */
  extra: boolean;
}

/** the seasoning's score as the pot stands (0 … 1), with the perk's wider window */
export function seasonNow(s: PotState, nowS: number, wide: boolean): number {
  if (s.auto || !s.recipe) return AUTO_SEASON;
  const v = seasonScore(recipeById(s.recipe), potItems(s, nowS), s.added);
  return wide ? 1 - (1 - v) * 0.6 : v;
}

/**
 * Plate the pot: the dish it is (rules.ts cook) with the scores of its steps and how often this recipe was
 * cooked before, the perks applied. The pot is not changed: the caller empties the station.
 */
export function platePot(s: PotState, nowS: number, times: number, perks: PlatePerks, knifeScore: (errors: readonly number[]) => number): Dish {
  const items = potItems(s, nowS);
  const heat = keeps(s.method) ? 1 : potScore(s.pot);
  const steps = { heat, ...(s.knife ? { knife: knifeScore(s.cuts) } : {}), ...(s.season ? { season: seasonNow(s, nowS, perks.taste) } : {}) };
  const d = cook(s.method, items, steps, times);
  // a master's pot of no recipe: the stars the rules would give it without the cap of three, up to four
  if (perks.master && !d.recipe && !d.odd && d.stars >= FREE_STARS) {
    let q = 0;
    let stale = 0;
    for (const p of items) {
      q += Math.min(5, Math.max(1, p.q ?? 2));
      if (p.fresh === 2) stale++;
    }
    const qIn = items.length ? (q / items.length - 1) / 4 : 0;
    const stars = Math.min(4, Math.round(1 + 4 * (0.5 * qIn + 0.5 * heat) - 0.5 * stale));
    if (stars > d.stars) {
      // (a serving's food and the buff's time follow the stars as the rules have them)
      d.food = Math.min(FOOD_CAP, Math.round((d.food * (0.8 + 0.1 * stars)) / (0.8 + 0.1 * d.stars)));
      if (d.buff) d.buffS = Math.round((d.buffS * (0.55 + 0.15 * stars)) / (0.55 + 0.15 * d.stars));
      d.stars = stars;
    }
  }
  if (perks.extra) d.servings += 1;
  return d;
}
