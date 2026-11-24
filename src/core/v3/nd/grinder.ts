/**
 * The grinder's rules (docs/ND/PLAN.md, Nomad Drive's Tool-Grinder as the research measured it): its battery holds
 * 125 and running drains 0.65 a second whether or not it is grinding anything — some 192 s from full; its disc
 * comes up to speed in 0.8 s and runs down in 1.5 s; its stroke is 0.15 m across (0.1 × 1.5) and bites hardest
 * held still, less the faster it is swept, a fifth at 1.5 m/s and more. Its charge rides on it (ItemState.charge).
 * Pure: no three, no DOM.
 */
import type { ItemInstance } from '../../modcar/items';
import { chargeLeft } from './battery';

export const GRINDER = {
  /** what a full battery holds, what running drains a second */
  max: 125,
  drain: 0.65,
  /** what a battery from the shelf puts in */
  battery: 100,
  /** the disc's spin up and down (s) */
  upS: 0.8,
  downS: 1.5,
  /** its stroke's width (m) */
  width: 0.3,
  /** how hard it bites, held still and swept fast; the speed it is weakest from (m/s) */
  // (a sweep takes it all, docs/V3/plan/hands.md §五: whole up to a metre a second, a third of it waved at 2.5)
  bite: 1.0,
  biteFast: 0.3,
  fast: 2.5,
  /** up to this fast it bites whole (m/s) */
  steady: 1.0,
} as const;

/** its charge now (Nomad Drive's grinders are found full: its loot's charge is 1 … 1; spent, its battery is gone: battery.ts) */
export function chargeOf(g: ItemInstance): number {
  return chargeLeft(g, GRINDER.max);
}

/** run for dt: the charge it used (it stops at nothing) */
export function drainGrinder(g: ItemInstance, dt: number): number {
  const c = chargeOf(g);
  const use = Math.min(c, GRINDER.drain * Math.max(0, dt));
  g.state ??= {};
  g.state.charge = c - use;
  return use;
}

/** how long it still runs (s) */
export function runLeft(g: ItemInstance): number {
  return chargeOf(g) / GRINDER.drain;
}

/** how hard its stroke bites at this speed over the surface (m/s) */
export function biteAt(speed: number): number {
  const t = Math.max(0, Math.min(1, (speed - GRINDER.steady) / (GRINDER.fast - GRINDER.steady)));
  return GRINDER.bite + (GRINDER.biteFast - GRINDER.bite) * t;
}

/** the disc's speed (0 … 1) a step on, running or not */
export function spinStep(spin: number, on: boolean, dt: number): number {
  return on ? Math.min(1, spin + dt / GRINDER.upS) : Math.max(0, spin - dt / GRINDER.downS);
}
