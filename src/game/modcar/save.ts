/**
 * The game in progress kept in the browser (localStorage), so a reload or a closed tab goes on where it
 * stopped: the vehicles as built (every part's wear, paint and fluids, the fuel in the tank), the things
 * lying about in the workshop and the one in the hands, the checklist, where one stands, the hour; on the
 * road, the vehicle and how far along the road it is. Written every half minute and when the page goes
 * out of sight. A save that no longer reads (a part renamed in a newer build) is set aside, not deleted,
 * and a new game begins.
 */
import { reserveUids } from '../../core/modcar/build';
import { frameDef } from '../../core/modcar/frames';
import { partDef } from '../../core/modcar/parts';
import type { Tool } from '../../core/modcar/tools';
import type { Build, PartInstance } from '../../core/modcar/types';

export interface SavedVehicle {
  build: Build;
  x: number;
  z: number;
  yaw: number;
  radioOn?: boolean;
  radioSong?: number;
}

export interface SavedLoose {
  part?: PartInstance;
  tool?: Tool;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface SaveV1 {
  v: 1;
  /** when it was written (ms since 1970) */
  at: number;
  place: 'garage' | 'road';
  /** the clock's hour */
  hour: number;
  /** the checklist's steps done */
  done: string[];
  vehicles: SavedVehicle[];
  loose: SavedLoose[];
  player: { x: number; z: number; heading: number };
  /** on the road: how far along it the vehicle is (m), on which road (the world's seed) */
  road?: { s: number; seed: number };
}

const KEY = 'modcar.save.v1';

/** every frame and part it names still exists (throws otherwise) */
function check(s: SaveV1): void {
  const inst = (i: PartInstance): void => {
    partDef(i.part);
    for (const sub of Object.values(i.sub ?? {})) inst(sub);
  };
  for (const v of s.vehicles) {
    frameDef(v.build.frame);
    for (const i of Object.values(v.build.parts)) inst(i);
  }
  for (const l of s.loose) if (l.part) inst(l.part);
}

export function loadSave(): SaveV1 | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SaveV1;
    if (s?.v !== 1 || !Array.isArray(s.vehicles) || !s.vehicles.length || !Array.isArray(s.loose)) throw new Error('not a save');
    check(s);
    // (parts made from now on get ids past the ones read back)
    const ids: string[] = [];
    const inst = (i: PartInstance): void => {
      ids.push(i.uid);
      for (const sub of Object.values(i.sub ?? {})) inst(sub);
    };
    for (const v of s.vehicles) {
      ids.push(v.build.uid);
      for (const i of Object.values(v.build.parts)) inst(i);
    }
    for (const l of s.loose) if (l.part) inst(l.part);
    reserveUids(ids);
    return s;
  } catch {
    // (put aside: a later build may read it again)
    try {
      if (raw) localStorage.setItem(`${KEY}.unread`, raw);
      localStorage.removeItem(KEY);
    } catch {
      // storage unavailable
    }
    return null;
  }
}

export function writeSave(s: SaveV1): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage full or unavailable: the game goes on unsaved
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // storage unavailable
  }
}
