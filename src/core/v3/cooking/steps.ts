/**
 * The steps of cooking as numbers (node C1, docs/V3/nodes/C1-cooking.md "工序"): how a pot comes to be done
 * under the flame the cook sets, what happens to a stir-fry nobody stirs, what a cut's timing is worth, how
 * long each way of cooking takes, and what each step's score is. The game's cooking panel drives these; the
 * rule engine (rules.ts cook) takes the scores. Pure: a step is a function of the pot's state, what the cook
 * does and the seconds that passed.
 *
 * Doneness `d` runs from 0 (raw) up: about 1 is "just right". The five bands the player sees:
 *   raw (生) below 0.5, tender (嫩) to 0.85, just right (正好) to 1.15, overdone (过头) to 1.45, burnt (焦) beyond.
 */
import type { Method } from './types';

/** the flame: off, low, medium, high */
export type Heat = 0 | 1 | 2 | 3;

/** how fast each flame cooks, against medium */
export const HEAT_RATE: readonly number[] = [0, 0.55, 1, 1.7];

export const RAW_BELOW = 0.5;
export const TENDER_BELOW = 0.85;
export const RIGHT_BELOW = 1.15;
export const OVER_BELOW = 1.45;

/** the band of a doneness: 0 raw, 1 tender, 2 just right, 3 overdone, 4 burnt */
export function band(d: number): 0 | 1 | 2 | 3 | 4 {
  return d < RAW_BELOW ? 0 : d < TENDER_BELOW ? 1 : d < RIGHT_BELOW ? 2 : d < OVER_BELOW ? 3 : 4;
}

/** what a doneness is worth to the heat step, 0 … 1 (raw is worth less than rules.ts's 0.35, so raw meat stays unsafe) */
export function heatScore(d: number): number {
  if (d < RAW_BELOW) return 0.1 + 0.2 * (d / RAW_BELOW);
  if (d < TENDER_BELOW) return 0.55 + 0.3 * ((d - RAW_BELOW) / (TENDER_BELOW - RAW_BELOW));
  if (d < RIGHT_BELOW) return 1;
  if (d < OVER_BELOW) return 0.85 - 0.4 * ((d - RIGHT_BELOW) / (OVER_BELOW - RIGHT_BELOW));
  return 0.2;
}

/**
 * How each way of cooking goes: seconds to just right at a medium flame; whether it must be stirred (a
 * stir-fry) or turned once (a roast, a fry); a wait after it is done (soups, stews, rice and bakes keep
 * going by themselves at a low flame: one may walk away); whether there is a knife step and a seasoning step.
 * The three ways of keeping take game hours on their rack, in their smoke or their jar, not seconds at a pot.
 */
export const METHOD_STEPS: Readonly<Record<Method, { cookS: number; stir: 'stir' | 'turn' | 'none'; waitS: number; knife: boolean; season: boolean; keepH?: number }>> = {
  mix: { cookS: 0, stir: 'none', waitS: 0, knife: true, season: true },
  roast: { cookS: 60, stir: 'turn', waitS: 0, knife: false, season: true },
  fry: { cookS: 45, stir: 'turn', waitS: 0, knife: true, season: true },
  stirfry: { cookS: 35, stir: 'stir', waitS: 0, knife: true, season: true },
  steam: { cookS: 50, stir: 'none', waitS: 0, knife: true, season: false },
  soup: { cookS: 30, stir: 'none', waitS: 45, knife: true, season: true },
  stew: { cookS: 30, stir: 'none', waitS: 90, knife: true, season: true },
  rice: { cookS: 30, stir: 'none', waitS: 70, knife: false, season: false },
  bake: { cookS: 25, stir: 'none', waitS: 90, knife: false, season: false },
  brew: { cookS: 20, stir: 'none', waitS: 25, knife: false, season: false },
  dry: { cookS: 0, stir: 'none', waitS: 0, knife: true, season: false, keepH: 6 },
  smoke: { cookS: 0, stir: 'none', waitS: 0, knife: true, season: false, keepH: 4 },
  pickle: { cookS: 0, stir: 'none', waitS: 0, knife: true, season: true, keepH: 12 },
};

/** a stir-fry left unstirred longer than this (s) at a medium flame or more starts to catch */
export const STIR_GRACE = 1.5;
/** how fast it catches: extra doneness a second, for each step of flame above low */
export const SCORCH_RATE = 0.06;
/** a roast or a fry not turned by the time it is this done cooks on one side: its doneness counts this much less */
export const UNTURNED_AT = 0.7;
export const UNTURNED_COST = 0.25;

/** a pot on the flame */
export interface Pot {
  method: Method;
  /** doneness */
  d: number;
  /** seconds since it was last stirred */
  sinceStir: number;
  /** a roast or a fry: turned yet */
  turned: boolean;
  /** seconds it has had on the flame, and of its wait */
  t: number;
  waited: number;
}

export function newPot(method: Method): Pot {
  return { method, d: 0, sinceStir: 0, turned: false, t: 0, waited: 0 };
}

/**
 * Let dt seconds pass with the flame at `heat`; `stir` is true in a step in which the cook stirred or
 * turned it. Before it is done the flame cooks it; once in its wait (soups, stews …) a low flame holds it
 * just right and anything more takes it over slowly. Allocates nothing.
 */
export function stepPot(p: Pot, heat: Heat, stir: boolean, dt: number): Pot {
  if (!(dt > 0)) return p;
  const m = METHOD_STEPS[p.method];
  p.t += dt;
  if (stir) {
    p.sinceStir = 0;
    if (m.stir === 'turn' && p.d > 0.2) p.turned = true;
  } else p.sinceStir += dt;
  if (m.cookS <= 0) return p;
  if (m.waitS > 0 && p.d >= 1) {
    // in its wait: a low flame keeps it; a medium one drifts it a little over its wait, a high one takes it over
    p.waited += dt;
    if (heat >= 2) p.d += ((HEAT_RATE[heat] - HEAT_RATE[1]) / m.waitS) * (heat === 3 ? 0.6 : 0.3) * dt;
    return p;
  }
  let rate = HEAT_RATE[heat] / m.cookS;
  // a roast or a fry cooks only on one side until it is turned
  if (m.stir === 'turn' && !p.turned && p.d >= UNTURNED_AT) rate *= 1 - UNTURNED_COST;
  p.d += rate * dt;
  // a stir-fry nobody stirs catches
  if (m.stir === 'stir' && heat >= 2 && p.sinceStir > STIR_GRACE) p.d += SCORCH_RATE * (heat - 1) * dt;
  return p;
}

/** is the pot's waiting done? (a dish of a way with no wait is done when it is just right; a wait must have run its time) */
export function potDone(p: Pot): boolean {
  const m = METHOD_STEPS[p.method];
  if (m.cookS <= 0) return true;
  return p.d >= TENDER_BELOW && p.waited >= m.waitS;
}

/** the heat step's score of a pot taken off now (a roast or a fry never turned loses a quarter) */
export function potScore(p: Pot): number {
  const m = METHOD_STEPS[p.method];
  if (m.cookS <= 0) return 1;
  let s = heatScore(p.d);
  if (m.stir === 'turn' && !p.turned) s *= 0.75;
  if (m.waitS > 0 && p.waited < m.waitS) s *= 0.6 + 0.4 * (p.waited / m.waitS);
  return s;
}

/** cuts a portion takes, and the step's score from how far off each cut was (0 on the beat … 1 a miss) */
export const CUTS_PER_PORTION = 2;
export function knifeScore(errors: readonly number[]): number {
  if (errors.length === 0) return 0.5;
  let sum = 0;
  for (const e of errors) sum += e < 0 ? 0 : e > 1 ? 1 : e;
  const v = 1 - 0.95 * (sum / errors.length);
  return v < 0 ? 0 : v;
}

/** the seasoning a cook who switched on "season for me" gets */
export const AUTO_SEASON = 0.7;

/** how long the parts of cooking that are not the pot take a cook who knows what they are doing (s) */
export const STEP_S = { put: 3, cut: 1.5, season: 6, plate: 4 } as const;

/** how long one dish takes, all its steps, at a medium flame: for the robot cook's bounds and the panel's hint (s) */
export function dishSeconds(method: Method, portions: number): number {
  const m = METHOD_STEPS[method];
  let s = STEP_S.put * portions + STEP_S.plate;
  if (m.knife) s += STEP_S.cut * CUTS_PER_PORTION * portions;
  if (m.season) s += STEP_S.season;
  s += m.cookS + m.waitS;
  return s;
}
