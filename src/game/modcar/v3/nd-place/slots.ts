/**
 * Places a thing held out to be placed snaps to, as Nomad Drive's snapping planes do: a stove's cooking zone takes a
 * pan or a pot onto its middle, turned any way round — Q and E turn it there a quarter at a time from the zone's own
 * square, the right button freely — and only one at a time. Offered by the systems that have them (the kitchen's
 * burners), asked by the careful placing before anything else the line of sight meets (system.ts).
 */
import type * as THREE from 'three';
import type { GameContext } from '../../kernel/context';
import type { Held } from '../../player';

/** a slot the line of sight meets, for the thing held out */
export interface SlotAim {
  /** how far along the line of sight (m) */
  dist: number;
  /** where the thing's own origin goes (render space), and the slot's own turn (render space): the thing is turned about the slot's up from that */
  pos: THREE.Vector3;
  q: THREE.Quaternion;
  /** the slot's heading on the plan (rad: its x axis (cos, sin) on x, z) — Q and E turn the thing to its squares */
  yaw: number;
  /** what the left button does there */
  word: string;
  /** put there, turned so about the slot's up (rad, the slot's own frame, three's way round); true: it is there, out of the hands */
  put(turn: number): boolean;
}

/** what offers slots: the one the line of sight meets for this thing (null: none) — `ray` render space, `reach` m */
export interface SlotSource {
  aim(h: NonNullable<Held>, ray: THREE.Ray, reach: number): SlotAim | null;
}

const SOURCES = new WeakMap<GameContext, SlotSource[]>();

/** the slots offered in a game (a system adds its own as it starts, takes it out as it goes) */
export function placeSlots(ctx: GameContext): SlotSource[] {
  let s = SOURCES.get(ctx);
  if (!s) SOURCES.set(ctx, (s = []));
  return s;
}

/** a thing's heading on the plan turned to the slot's: the turn about the slot's up (three's way round: + to the left seen from above) */
export function turnOnSlot(yaw: number, slotYaw: number): number {
  return Math.atan2(Math.sin(slotYaw - yaw), Math.cos(slotYaw - yaw));
}
