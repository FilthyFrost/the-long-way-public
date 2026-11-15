/**
 * Where a player is: sitting in a seat, up and about inside the vehicle, or on foot in the world.
 * One small machine; every change of mode is an event (docs/DESIGN_V2.md 10.3: actions are events,
 * the state can be saved and sent).
 *
 *   seated  ──E (a vehicle with a walk area)──▶ onboard ──E at the door──▶ onfoot
 *   seated  ──E (no walk area)────────────────▶ onfoot   (beside the nearest door)
 *   onfoot  ──E on a door──▶ seated (its seat) or onboard (the motorhome's door)
 *   onboard ──E by a seat──▶ seated
 */
import type { FootState } from './walker';

export type Mode = 'seated' | 'onboard' | 'onfoot';

/** the moves the machine allows */
export const NEXT: Readonly<Record<Mode, readonly Mode[]>> = {
  seated: ['seated', 'onboard', 'onfoot'],
  onboard: ['seated', 'onfoot'],
  onfoot: ['seated', 'onboard'],
};

export interface ModeEvent {
  from: Mode;
  to: Mode;
  /** seat name for 'seated', door name for getting in or out */
  at: string;
}

export interface ModeState {
  mode: Mode;
  /** the seat when seated ('driver', 'passenger', a view key of the vehicle) */
  seat: string;
  /** body-frame spot inside the vehicle when on board */
  onboard: { x: number; z: number; yaw: number } | null;
  /** the walker's state when on foot */
  foot: FootState | null;
}

export class Modes {
  mode: Mode = 'seated';
  seat = 'driver';
  readonly log: ModeEvent[] = [];
  private readonly listeners: ((e: ModeEvent) => void)[] = [];

  on(fn: (e: ModeEvent) => void): void {
    this.listeners.push(fn);
  }

  can(to: Mode): boolean {
    return NEXT[this.mode].includes(to);
  }

  /** change mode; false when the move is not allowed (nothing changes) */
  go(to: Mode, at = ''): boolean {
    if (!this.can(to)) return false;
    const e: ModeEvent = { from: this.mode, to, at };
    this.mode = to;
    if (to === 'seated') this.seat = at || 'driver';
    this.log.push(e);
    if (this.log.length > 64) this.log.shift();
    for (const fn of this.listeners) fn(e);
    return true;
  }

  get onFoot(): boolean {
    return this.mode === 'onfoot';
  }
}
