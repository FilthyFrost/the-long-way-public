/**
 * Restore points (docs/MODCAR.md §13, as Arctic Drive keeps them): the game as it was every five minutes,
 * the last six kept in the browser beside the save. After one dies one picks where to go on from — or
 * begins again. Kept apart from the save itself, which goes on being written every half minute.
 *
 * A point is a save and goes the save's way in both directions: it is written as a save is (never with a
 * stack used up in it), and going on from one makes it the save, which the page then reads as it reads any
 * save — tolerantly, a thing of a kind this build does not have left out and counted (save.ts).
 */
import { writableSave, writeSave, type SaveV1 } from './save';
import { restoreKeyOf } from './slots';

/** where the points lie: the place's the page goes on with (slots.ts) */
const key = (): string => restoreKeyOf();
const KEEP = 6;

export interface RestorePoint {
  /** when (ms since 1970) */
  at: number;
  /** where one was: the workshop, the road */
  place: string;
  save: SaveV1;
}

export function restorePoints(): RestorePoint[] {
  try {
    const raw = localStorage.getItem(key());
    const list = raw ? (JSON.parse(raw) as RestorePoint[]) : [];
    return Array.isArray(list) ? list.filter((p) => p && p.save && typeof p.at === 'number') : [];
  } catch {
    return [];
  }
}

/** keep the game as it is now as the newest point (the oldest beyond six goes) */
export function pushRestore(s: SaveV1): void {
  let save = s;
  try {
    save = writableSave(s);
  } catch {
    // (kept as it stands: reading it back leaves out what should not have been written)
  }
  const list = [{ at: s.at, place: s.place, save }, ...restorePoints()].slice(0, KEEP);
  // (storage full: fewer points rather than none)
  for (let n = list.length; n > 0; n--) {
    try {
      localStorage.setItem(key(), JSON.stringify(list.slice(0, n)));
      return;
    } catch {
      // try with one fewer
    }
  }
}

/** go on from a point: it becomes the save (the page is opened again by the caller) */
export function useRestore(i: number): boolean {
  const p = restorePoints()[i];
  if (!p) return false;
  writeSave(p.save);
  return true;
}

export function clearRestores(): void {
  try {
    localStorage.removeItem(key());
  } catch {
    // storage unavailable
  }
}

/** how long ago, in words */
export function agoText(at: number, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - at) / 60000));
  if (m < 1) return '刚才';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  return `${h} 小时 ${m % 60} 分钟前`;
}
