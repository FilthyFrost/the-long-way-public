/**
 * The three places a game is kept in (docs/V3/plan/finish.md §十四: 三个存档位): which one the page goes on with, where
 * each one's save, its two older copies and its restore points lie in the browser, and the little that is shown of
 * each on its card — the day, how far, the car, how hard, how long played, a picture — kept beside the save so that
 * the cards are drawn without reading any save.
 *
 * The first place is where the one save always lay (`modcar.save.v1`): a game kept before there were three goes on
 * as the first of them.
 *
 * The browser's room is not endless: a save that will not go in makes room for itself first — the other places'
 * restore points and older copies go before one's own game goes unkept (makeRoom).
 */

export const SLOTS = 3;

const SLOT_KEY = 'modcar.slot';
const SAVE_KEY = 'modcar.save.v1';
const RESTORE_KEY = 'modcar.restore.v1';
const META_KEY = 'modcar.slot.meta';

/** what a place's card shows */
export interface SlotMeta {
  /** the day of the journey (1: the first), how far down the road (km), the car driven last */
  day: number;
  km: number;
  car: string;
  /** the difficulty's name */
  difficulty: string;
  /** minutes played */
  minutes: number;
  /** when it was last kept (ms since 1970) */
  at: number;
  /** a small picture of where one was (a data URL), when one could be taken */
  shot?: string;
}

const tail = (i: number): string => (i <= 0 ? '' : `.s${i + 1}`);
const ok = (i: number): boolean => Number.isInteger(i) && i >= 0 && i < SLOTS;

/** the place the page goes on with (0 … 2) */
export function activeSlot(): number {
  try {
    const i = Number(localStorage.getItem(SLOT_KEY) ?? 0);
    return ok(i) ? i : 0;
  } catch {
    return 0;
  }
}

export function setActiveSlot(i: number): void {
  if (!ok(i)) return;
  try {
    localStorage.setItem(SLOT_KEY, String(i));
  } catch {
    /* storage unavailable: the first place */
  }
}

/** where a place's save lies, its restore points, its older copies (n: 1 the newer, 2 the older) */
export const saveKeyOf = (i = activeSlot()): string => SAVE_KEY + tail(i);
export const restoreKeyOf = (i = activeSlot()): string => RESTORE_KEY + tail(i);
export const backupKeyOf = (n: 1 | 2, i = activeSlot()): string => `${SAVE_KEY}${tail(i)}.bak${n}`;
const metaKeyOf = (i: number): string => `${META_KEY}${tail(i)}`;

export function slotHasSave(i: number): boolean {
  try {
    return !!localStorage.getItem(saveKeyOf(i));
  } catch {
    return false;
  }
}

export function slotMeta(i: number): SlotMeta | null {
  try {
    const raw = localStorage.getItem(metaKeyOf(i));
    if (!raw) return null;
    const m = JSON.parse(raw) as Partial<SlotMeta>;
    if (typeof m?.at !== 'number') return null;
    return { day: Number(m.day) || 1, km: Number(m.km) || 0, car: String(m.car ?? ''), difficulty: String(m.difficulty ?? ''), minutes: Number(m.minutes) || 0, at: m.at, shot: typeof m.shot === 'string' ? m.shot : undefined };
  } catch {
    return null;
  }
}

export function writeSlotMeta(i: number, m: SlotMeta): void {
  try {
    localStorage.setItem(metaKeyOf(i), JSON.stringify(m));
  } catch {
    // (no room for the picture: the card without it)
    try {
      localStorage.setItem(metaKeyOf(i), JSON.stringify({ ...m, shot: undefined }));
    } catch {
      /* storage unavailable */
    }
  }
}

/** a place emptied: its save, its older copies, its restore points, its card */
export function clearSlot(i: number): void {
  try {
    for (const k of [saveKeyOf(i), backupKeyOf(1, i), backupKeyOf(2, i), restoreKeyOf(i), metaKeyOf(i), `${saveKeyOf(i)}.unread`]) localStorage.removeItem(k);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Room made in the browser's storage for the game being kept: the other places' restore points go first, then their
 * older copies, then this place's own restore points down to the newest, then its own older copies. True when
 * something went (worth trying the write again).
 */
export function makeRoom(i = activeSlot(), step = 0): boolean {
  try {
    const others = [0, 1, 2].filter((j) => j !== i);
    const tries: string[][] = [others.map((j) => restoreKeyOf(j)), others.flatMap((j) => [backupKeyOf(2, j), backupKeyOf(1, j)]), [restoreKeyOf(i)], [backupKeyOf(2, i), backupKeyOf(1, i)]];
    for (let s = step; s < tries.length; s++) {
      let went = false;
      for (const k of tries[s]) {
        if (localStorage.getItem(k) !== null) {
          localStorage.removeItem(k);
          went = true;
        }
      }
      if (went) return true;
    }
  } catch {
    /* storage unavailable */
  }
  return false;
}

/** a value put under a key, room made for it when the storage is full; false: it would not go in */
export function putKept(key: string, value: string, slot = activeSlot()): boolean {
  for (let n = 0; n < 6; n++) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      if (!makeRoom(slot)) return false;
    }
  }
  return false;
}

/**
 * The save's older copies moved on (docs/V3/plan/finish.md §十四: 每个存档位留两份轮换的备份): the newer becomes the
 * older, the save as it lies becomes the newer. Called when a night is slept through: a copy is a night old, and the
 * one before it two. No room for them: none are kept (the save itself comes first).
 */
export function rotateBackups(i = activeSlot()): void {
  try {
    const now = localStorage.getItem(saveKeyOf(i));
    if (!now) return;
    const b1 = localStorage.getItem(backupKeyOf(1, i));
    try {
      if (b1) localStorage.setItem(backupKeyOf(2, i), b1);
      localStorage.setItem(backupKeyOf(1, i), now);
    } catch {
      // (full: the older copy goes, the newer is tried once more)
      localStorage.removeItem(backupKeyOf(2, i));
      try {
        localStorage.setItem(backupKeyOf(1, i), now);
      } catch {
        localStorage.removeItem(backupKeyOf(1, i));
      }
    }
  } catch {
    /* storage unavailable */
  }
}

/** a place's game as a file's text (its save and its card): null when there is none */
export function exportSlot(i: number): string | null {
  try {
    const save = localStorage.getItem(saveKeyOf(i));
    if (!save) return null;
    return JSON.stringify({ kind: 'the-long-way-save', v: 1, meta: slotMeta(i), save: JSON.parse(save) as unknown });
  } catch {
    return null;
  }
}

/**
 * A file's text put into a place as its game (what lay there goes: its older copies and restore points with it).
 * Null when it went in; else why not, in a few words.
 */
export function importSlot(i: number, text: string): string | null {
  let data: { kind?: string; save?: { v?: number; vehicles?: unknown; loose?: unknown }; meta?: SlotMeta | null };
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    return '这不是一个存档文件';
  }
  const s = data?.kind === 'the-long-way-save' ? data.save : (data as unknown as typeof data.save);
  if (!s || s.v !== 1 || !Array.isArray(s.vehicles) || !Array.isArray(s.loose)) return '这不是一个存档文件';
  clearSlot(i);
  if (!putKept(saveKeyOf(i), JSON.stringify(s), i)) return '浏览器的存储满了，放不进去';
  const m = data.kind === 'the-long-way-save' ? data.meta : null;
  writeSlotMeta(i, m && typeof m.at === 'number' ? { ...m, at: Date.now() } : { day: 1, km: 0, car: '', difficulty: '', minutes: 0, at: Date.now() });
  return null;
}
