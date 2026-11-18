/**
 * The fight (node F1, docs/V3/nodes/F1-fishing.md): a fish on the line, stepped a tenth of a second at a
 * time. The fish runs and rests after its kind; the line pays out against the reel's drag when it pulls
 * harder than that; the tension tires it; the rod laid over against its run takes strain off the line and
 * laid the wrong way puts a spike on it; a line held over its strength for a third of a second parts. A pure
 * function of the state, the angler's hands and the fish's own dice.
 */
import { hash2 } from '../../math/rng';
import type { Fight } from './types';

/** how hard each temper pulls for its weight, how much of the time it runs, how long a run lasts (s) */
const TEMPER: Readonly<Record<Fight, { pull: number; runs: number; runS: number }>> = {
  steady: { pull: 1.6, runs: 0.35, runS: 2.2 },
  runner: { pull: 2.2, runs: 0.6, runS: 3.6 },
  diver: { pull: 1.9, runs: 0.5, runS: 2.8 },
  jumper: { pull: 1.8, runs: 0.5, runS: 2.4 },
  brute: { pull: 2.4, runs: 0.7, runS: 4.2 },
};

/** the hardest a fish of this weight and temper pulls (N): a kilo of trout about twenty, ten kilos of catfish about a hundred and thirty */
export function maxPull(kg: number, fight: Fight): number {
  return 9.8 * Math.pow(kg, 0.75) * TEMPER[fight].pull;
}

export const HOOKED = 0;
export const LANDED = 1;
export const SNAPPED = 2;
export const THROWN = 3;
export const SNAGGED = 4;

export interface FightState {
  kg: number;
  fight: Fight;
  /** 1 fresh … 0 spent */
  stamina: number;
  /** metres of line out */
  dist: number;
  /** N on the line now */
  tension: number;
  /** 0 resting, 1 running, 2 in the air (a jumper), 3 boring down (a diver) */
  phase: number;
  /** seconds left of the phase, and how many phases there have been (the dice's index) */
  phaseT: number;
  phases: number;
  /** seconds the line has been over its strength; seconds a diver has had its head */
  over: number;
  down: number;
  /** seconds since the hook went in */
  t: number;
  /** HOOKED, LANDED, SNAPPED, THROWN or SNAGGED */
  end: number;
}

/** what the angler's hands do */
export interface FightInput {
  /** how hard the reel is wound, 0 … 1 */
  reel: number;
  /** the drag the reel is set to (N) */
  drag: number;
  /** the rod laid over against the fish's run (1), upright (0) or the wrong way (−1) */
  side: number;
  /** the rod's tip lowered (slack taken out when a fish jumps) */
  low: boolean;
}

/** the tackle's part */
export interface FightTackle {
  /** the line's strength (N) */
  lineN: number;
  /** metres of line on the reel, and how fast it winds (m/s at full effort) */
  spool: number;
  wind: number;
}

export function startFight(kg: number, fight: Fight, dist: number): FightState {
  return { kg, fight, stamina: 1, dist, tension: 0, phase: 1, phaseT: TEMPER[fight].runS * 0.6, phases: 0, over: 0, down: 0, t: 0, end: HOOKED };
}

function dice(seed: number, n: number, k: number): number {
  return (hash2(n | 0, k, (seed | 0) ^ 0xf167) >>> 8) / 16777216;
}

/** one step of dt seconds; `seed` is the fish's own (one hooking) */
export function stepFight(s: FightState, input: FightInput, tackle: FightTackle, seed: number, dt: number): FightState {
  if (s.end !== HOOKED) return s;
  const T = TEMPER[s.fight];
  const top = maxPull(s.kg, s.fight);
  s.t += dt;
  // the fish's part: what it does next when a phase runs out
  s.phaseT -= dt;
  if (s.phaseT <= 0) {
    s.phases++;
    const u = dice(seed, s.phases, 1);
    const v = dice(seed, s.phases, 2);
    const runs = T.runs * (0.35 + 0.65 * s.stamina);
    if (u < runs) {
      s.phase = s.fight === 'jumper' && v < 0.4 ? 2 : s.fight === 'diver' && v < 0.5 ? 3 : 1;
      s.phaseT = s.phase === 2 ? 0.7 : T.runS * (0.6 + 0.8 * v);
    } else {
      s.phase = 0;
      s.phaseT = 1.2 + 2.2 * v;
    }
  }
  // how hard it pulls now
  const fresh = 0.3 + 0.7 * Math.sqrt(s.stamina);
  let pull = s.phase === 0 ? 0.22 * top * fresh : s.phase === 2 ? 0 : top * fresh;
  const drag = input.drag < 1 ? 1 : input.drag;
  let tension: number;
  if (s.phase === 2) {
    // in the air: the line goes slack; a tight line then is what throws the hook
    tension = input.low ? 0 : 0.2 * top;
    if (s.phaseT - dt <= 0 && dice(seed, s.phases, 3) < (input.low ? 0.04 : 0.24)) s.end = THROWN;
  } else if (pull > drag) {
    // it takes line against the drag
    s.dist += ((pull - drag) / top) * 4.5 * dt;
    tension = drag;
  } else {
    tension = pull;
    // winding gains line only while the fish is not out-pulling the drag
    const gain = input.reel * tackle.wind * (s.phase === 0 ? 1 : 0.35) * dt;
    s.dist -= gain;
    tension += input.reel * 0.15 * top;
  }
  // the rod's side: over against the run it shares the load, the wrong way it jars
  if (s.phase === 1 || s.phase === 3) tension *= input.side > 0 ? 0.8 : input.side < 0 ? 1.3 : 1;
  s.tension = tension;
  // a diver that is given its head finds the bottom
  if (s.phase === 3 && tension < 0.45 * pull) {
    s.down += dt;
    if (s.down > 2.6) s.end = SNAGGED;
  } else if (s.down > 0) s.down = Math.max(0, s.down - 2 * dt);
  // the strain tires it; resting it gets a little back
  const span = 16 + 7 * Math.log(1 + s.kg);
  s.stamina -= ((tension / top) * dt) / span;
  if (s.phase === 0) s.stamina += 0.012 * dt;
  s.stamina = s.stamina < 0 ? 0 : s.stamina > 1 ? 1 : s.stamina;
  // the line
  if (tension > tackle.lineN) {
    s.over += dt;
    if (s.over > 0.35) s.end = SNAPPED;
  } else s.over = Math.max(0, s.over - dt);
  if (s.dist >= tackle.spool) s.end = SNAPPED;
  if (s.dist <= 1.5) {
    s.dist = 1.5;
    if (s.stamina < 0.3 || s.kg < 0.4) s.end = LANDED;
  }
  return s;
}

/** an angler that plays by the book, with a reaction time and a share of mistakes: for the tests and the developer's panel */
export interface RobotAngler {
  /** seconds before it answers what the fish does */
  react: number;
  /** the share of moments it does the wrong thing */
  errs: number;
  /** the drag it sets, as a share of the line's strength */
  dragShare: number;
}

/** play one fish to the end; returns the state (its `end`, `t`) */
export function robotFight(kg: number, fight: Fight, tackle: FightTackle, seed: number, robot: RobotAngler): FightState {
  const s = startFight(kg, fight, 14);
  const input: FightInput = { reel: 0, drag: tackle.lineN * robot.dragShare, side: 0, low: false };
  let seen = s.phase;
  let since = 0;
  let step = 0;
  const dt = 0.1;
  while (s.end === HOOKED && s.t < 600) {
    step++;
    // it sees what the fish does a moment late
    if (s.phase !== seen) {
      since += dt;
      if (since >= robot.react) {
        seen = s.phase;
        since = 0;
      }
    }
    const wrong = dice(seed ^ 0x51, Math.floor(s.t * 2), 7) < robot.errs;
    input.side = seen === 1 || seen === 3 ? (wrong ? -1 : 1) : 0;
    input.low = seen === 2 && !wrong;
    input.reel = seen === 0 ? 1 : seen === 3 ? 0.6 : 0.2;
    // a diver must be held: a little more drag while it bores down
    input.drag = tackle.lineN * (seen === 3 ? Math.min(0.75, robot.dragShare + 0.25) : robot.dragShare);
    stepFight(s, input, tackle, seed, dt);
    if (step > 6000) break;
  }
  return s;
}
