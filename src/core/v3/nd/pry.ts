/**
 * Prying (docs/ND/PLAN.md, ND3; Nomad Drive's Crowbar, crowbar pry, pry lock state and its static doors and hinges as
 * the game and its assets have them): a door or a lid may be stuck, locked, or both — rolled for each
 * one from the world's seed, the same every time (a house's wooden door 5 % locked and 15 % stuck, a locker 25 %
 * locked, a container's door, a mailbox's lid or a trunk 25 % stuck). Without a crowbar a locked one only rattles and
 * a stuck one will not give; a key opens a locked one at a press (and stays in it). With a crowbar in the hands, E
 * held on it pries it open — 1.6 s a stuck one, 2.4 s a locked one, 3.2 s both — the bar biting two, three or four
 * times along the way, harder each time; then it swings open (in 45 % of its time) and stays open for good. A crowbar
 * is good for five; the fifth breaks it. Pure: no three, no DOM.
 */
import { hash2 } from '../../math/rng';
import type { ItemInstance } from '../../modcar/items';

export const ND_CROWBAR = 'nd_crowbar';

export const PRY = {
  /** E held this long (s) */
  stuckS: 1.6,
  lockedS: 2.4,
  bothS: 3.2,
  /** a crowbar's prying */
  uses: 5,
  /** a bite's kick of the door (°) and its strength at the first and the last bite */
  kickDeg: 2.5,
  bite0: 0.6,
  bite1: 1,
  /** a forced door swings open in this share of its time */
  fast: 0.45,
  /** a locked or stuck one rattled: how far (m), how long (s), how often (Hz) */
  shakeM: 0.02,
  shakeS: 0.25,
  shakeHz: 18,
} as const;

/** what a door or a lid is like: how likely locked and stuck (Nomad Drive's parts) */
export const PRY_KINDS = {
  /** a house's wooden door (Door-01) */
  house: { locked: 0.05, stuck: 0.15 },
  /** a metal locker's door */
  locker: { locked: 0.25, stuck: 0 },
  /** a shipping container's door, an electric box's, a privy's, a mailbox's lid, a trunk's */
  stuck: { locked: 0, stuck: 0.25 },
  /** never either */
  none: { locked: 0, stuck: 0 },
} as const;
export type PryKind = keyof typeof PRY_KINDS;

export interface PryState {
  locked: boolean;
  stuck: boolean;
}

/** a door's state as found: locked and stuck rolled apart, from the world's seed and the door's own id */
export function pryFound(worldSeed: number, id: string, kind: PryKind): PryState {
  const k = PRY_KINDS[kind];
  const h = hashStr(id);
  const roll = (salt: number) => (hash2(hash2(worldSeed | 0, h, 0x5051), salt, 0x7e1) >>> 0) / 0x100000000;
  return { locked: roll(1) < k.locked, stuck: roll(2) < k.stuck };
}

/** how long E is held to pry it (s); 0: it gives as it is */
export function pryS(s: PryState): number {
  if (s.locked && s.stuck) return PRY.bothS;
  if (s.locked) return PRY.lockedS;
  if (s.stuck) return PRY.stuckS;
  return 0;
}

/** the bites along a pry: at which shares of the hold, how hard */
export function pryBites(s: PryState): { at: number; strength: number }[] {
  const n = s.locked && s.stuck ? 4 : s.locked ? 3 : s.stuck ? 2 : 0;
  const out: { at: number; strength: number }[] = [];
  for (let i = 0; i < n; i++) out.push({ at: (i + 1) / (n + 1), strength: PRY.bite0 + ((PRY.bite1 - PRY.bite0) * i) / Math.max(1, n - 1) });
  return out;
}

/** a key turned in a locked one: no longer locked (still stuck if it was) */
export function unlockWithKey(s: PryState): PryState {
  return { locked: false, stuck: s.stuck };
}

declare module '../../modcar/items' {
  interface ItemState {
    /** a crowbar's prying left (docs/ND/PLAN.md) */
    pries?: number;
  }
}

/** a crowbar's prying left */
export function priesLeft(bar: ItemInstance): number {
  return bar.state?.pries ?? PRY.uses;
}

/** one prying spent; true when that was its last (it breaks) */
export function spendPry(bar: ItemInstance): boolean {
  bar.state ??= {};
  bar.state.pries = Math.max(0, priesLeft(bar) - 1);
  return bar.state.pries <= 0;
}

function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
}
