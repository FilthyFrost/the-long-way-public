/**
 * Batteries (docs/ND/PLAN.md, Nomad Drive's consumable battery and chargable direct held item as the game has
 * them): a battery is good for 100 and is used up whole. A battery tool (the grinder, the polisher, the flashlight)
 * runs on its charge until it is spent — then its battery is gone with it — and takes a new one only then: with the
 * battery in the hands, E held half a second on the tool where it lies; the battery's 100 go in, up to what the tool
 * holds (the grinder's 125: from empty, 100). One with charge left takes none (it is not topped up). Pure.
 */
import type { ItemInstance } from '../../modcar/items';

export const ND_BATTERY = 'nd_battery';

export const BATTERY = {
  /** what a battery is good for */
  charge: 100,
  /** E held this long on the tool to put it in (s) */
  insertS: 0.5,
} as const;

declare module '../../modcar/items' {
  interface ItemState {
    /** a battery tool's charge (its own units: the grinder's of 125); 0, its battery is spent and gone */
    charge?: number;
  }
}

/** a battery tool's charge now: as it was found (full) until it has been run */
export function chargeLeft(tool: ItemInstance, max: number): number {
  return tool.state?.charge ?? max;
}

/** it has a battery in it (one with charge: a spent one is gone) */
export function hasBattery(tool: ItemInstance, max: number): boolean {
  return chargeLeft(tool, max) > 1e-6;
}

/** a battery put into a tool whose own is spent: true when it went in (its charge then BATTERY.charge, up to max) */
export function insertBattery(tool: ItemInstance, max: number): boolean {
  if (hasBattery(tool, max)) return false;
  tool.state ??= {};
  tool.state.charge = Math.min(max, BATTERY.charge);
  return true;
}
