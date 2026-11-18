/**
 * The save slices of the V3 kernel (docs/V3/nodes/N0-foundation.md): each system keeps its own part of the save
 * under its own id and version, and one slice that cannot be read, or cannot be written, never costs the player
 * the rest.
 *
 * In the save the slices are one record, `{ [id]: { v, d } }`: the version the slice had when it wrote, and
 * its data (anything JSON can hold). Reading it back is tolerant:
 *
 *   - a slice the record does not have is cleared (it starts as in a new game);
 *   - an older version goes through the slice's `migrate` first;
 *   - a NEWER version than this code knows, and an id nobody registered, are not read at all: the record is
 *     carried as it came into every later snapshot, so a save written with a system that is absent today (or
 *     by a later build) is not destroyed by playing on without it;
 *   - a slice that was set aside (`hold`: the system it belongs to did not come up) is not read either, and
 *     its record is carried the same way;
 *   - a slice whose `restore` (or `migrate`) throws is cleared, and the others are still read; the record that
 *     would not read is carried under `<id>.unread`, so that the next save does not lose it.
 *
 * Writing is as careful. Every slice's data is taken through JSON here, as it is asked for: a slice whose data
 * JSON cannot hold (a circle between live objects, a BigInt, a `toJSON` that throws) is found at this point,
 * reported, and written as it last was — not found later by the save, which would then not be written at all.
 * What a snapshot hands out is therefore a copy: nothing in it is shared with a slice's own state.
 *
 * All of these but the first two are reported. Pure: no three, no DOM.
 */

export interface SaveSlice<T = unknown> {
  /** its key in the save: lower-case letters, digits, '_', '-', '.', ':'; never renamed once saves hold it */
  readonly id: string;
  /** a whole number from 1, raised whenever the shape of the data changes */
  readonly version: number;
  /**
   * The data to keep (JSON only), undefined when there is nothing to keep; must not change anything. It may be
   * the very object the slice works on: the registry copies it before this call's caller sees it.
   */
  snapshot(): T | undefined;
  /**
   * Take the saved data back; fromVersion is the version it was written with (data from an older one has been
   * through migrate). The data is the slice's from here on: it may keep it and change it.
   */
  restore(data: T, fromVersion: number): void;
  /** data written by an older version made into today's shape */
  migrate?(data: unknown, fromVersion: number): T;
  /** back to how a new game starts (also when a save has nothing of this slice, or its data would not read) */
  clear?(): void;
}

/** one slice as the save holds it */
export interface SavedSlice {
  v: number;
  d: unknown;
}

/** all of them, by id */
export type SliceRecord = Record<string, SavedSlice>;

/** what can be reported of a slice */
export type SliceTrouble =
  /** the save has a slice nobody registered: carried */
  | 'unknown'
  /** written by a newer version than this code knows: carried, the slice cleared */
  | 'newer'
  /** the slice is set aside (its system did not come up): its record carried, the slice left alone */
  | 'held'
  /** not `{ v, d }` at all: the slice cleared */
  | 'malformed'
  /** migrate, restore, snapshot or clear threw (snapshot: also when its data is not something JSON can hold) */
  | 'migrate'
  | 'restore'
  | 'snapshot'
  | 'clear';

export interface SliceReport {
  id: string;
  what: SliceTrouble;
  /** the version in the save */
  v?: number;
  error?: unknown;
}

const ID = /^[a-z][a-z0-9_.:-]*$/;

/** after a slice's id: the key its record is carried under when it would not read */
export const UNREAD = '.unread';

function isSaved(x: unknown): x is SavedSlice {
  return typeof x === 'object' && x !== null && Number.isFinite((x as SavedSlice).v) && 'd' in x;
}

/** a record as the save's text holds it; undefined when it is not something JSON can hold */
function asText(saved: SavedSlice): string | undefined {
  try {
    return JSON.stringify(saved);
  } catch {
    return undefined;
  }
}

export class SaveSliceRegistry {
  /** told of each thing that went wrong, as it happens; null: nobody is told */
  onReport: ((r: SliceReport) => void) | null = null;
  /**
   * What there is to report since the last restore (or new game): the restore's own findings, and whatever a
   * snapshot has run into since — of one slice and one kind of trouble only the latest, so that a slice which
   * fails at every save does not fill the list.
   */
  readonly reports: SliceReport[] = [];
  /** the slices in the order they were registered: the order they are restored and cleared in */
  private readonly list: SaveSlice[] = [];
  private readonly byId = new Map<string, SaveSlice>();
  /** records that are not this code's to read, carried into every snapshot as they came */
  private readonly carried = new Map<string, SavedSlice>();
  /**
   * What each slice last wrote or was restored from, written again should its snapshot throw. Kept as the
   * save's text, not as the object: a slice may hand out, or keep and change, the object itself.
   */
  private readonly last = new Map<string, string>();
  /** the slices set aside (hold) */
  private readonly held = new Set<string>();

  /**
   * Add a slice (a second one with the same id throws). Slices are registered before the save is restored; one
   * that comes afterwards and finds its record among the carried ones is restored from it there and then.
   */
  register<T>(slice: SaveSlice<T>): void {
    const s = slice as SaveSlice;
    if (typeof s.id !== 'string' || !ID.test(s.id)) throw new Error(`a save slice's id must be lower-case letters, digits and _ - . : beginning with a letter, not '${String(s.id)}'`);
    if (!Number.isInteger(s.version) || s.version < 1) throw new Error(`the save slice '${s.id}' needs a whole version number from 1, not ${String(s.version)}`);
    if (this.byId.has(s.id)) throw new Error(`a save slice with the id '${s.id}' is already registered`);
    this.list.push(s);
    this.byId.set(s.id, s);
    const waiting = this.carried.get(s.id);
    if (waiting) {
      this.carried.delete(s.id);
      this.restoreOne(s, waiting);
    }
  }

  /** the ids of the slices, in the order they were registered */
  get ids(): string[] {
    return this.list.map((s) => s.id);
  }

  /** the ids of the records carried unread */
  get carriedIds(): string[] {
    return [...this.carried.keys()].sort();
  }

  /** the ids of the slices set aside */
  get heldIds(): string[] {
    return [...this.held].sort();
  }

  /**
   * Set a slice aside: the system it belongs to did not come up, so it can neither take its state back nor
   * give it out. From now on the slice is not restored, not cleared and not asked for a snapshot, and what the
   * save has of it is carried as it came into every later snapshot, for the day the system runs again. (One
   * set aside after it was restored: carried is what it was restored from, or last wrote.) An id nobody
   * registered, or one set aside already, changes nothing.
   */
  hold(id: string): void {
    if (!this.byId.has(id) || this.held.has(id)) return;
    this.held.add(id);
    const text = this.last.get(id);
    this.last.delete(id);
    if (text !== undefined && !this.carried.has(id)) this.carried.set(id, JSON.parse(text) as SavedSlice);
  }

  /**
   * Every slice's data, by id in alphabetical order (the same save text for the same state, whatever order the
   * slices were registered in), with the carried records among them as they came. Undefined when there is
   * nothing at all, so that a save with no slices has no key for them. A slice whose snapshot throws, or hands
   * out what JSON cannot hold, is reported and written as it last was.
   */
  snapshot(): SliceRecord | undefined {
    const ids = [...this.byId.keys()];
    for (const id of this.carried.keys()) if (!this.byId.has(id)) ids.push(id);
    ids.sort();
    const out: SliceRecord = {};
    let n = 0;
    for (const id of ids) {
      const slice = this.byId.get(id);
      // (not this code's to read — an unknown id, a newer version, a slice set aside: as it came)
      const rec = this.carried.get(id) ?? (slice && !this.held.has(id) ? this.ask(slice) : undefined);
      if (rec) {
        out[id] = rec;
        n++;
      }
    }
    return n ? out : undefined;
  }

  /** one slice's data as the save will hold it; as it last was when the slice throws or its data is not JSON's */
  private ask(slice: SaveSlice): SavedSlice | undefined {
    const id = slice.id;
    try {
      const d = slice.snapshot();
      if (d === undefined) {
        this.last.delete(id);
        return undefined;
      }
      // (into the save's own format and back, here, where the slice at fault can be told from the others: the
      // save itself is one text, and one thing in it that JSON cannot hold would keep all of it from being written)
      const text = JSON.stringify(d);
      if (text === undefined) throw new Error('its data is not something JSON can hold');
      this.last.set(id, `{"v":${slice.version},"d":${text}}`);
      return { v: slice.version, d: JSON.parse(text) as unknown };
    } catch (error) {
      this.report({ id, what: 'snapshot', error });
      const text = this.last.get(id);
      return text === undefined ? undefined : (JSON.parse(text) as SavedSlice);
    }
  }

  /**
   * Read a save's record back (undefined, or anything that is not a record: a save from before there were
   * slices, in which every slice is cleared). See the top of the file for what happens to each slice.
   */
  restore(record: unknown): void {
    this.reports.length = 0;
    this.carried.clear();
    this.last.clear();
    const rec = typeof record === 'object' && record !== null && !Array.isArray(record) ? (record as Record<string, unknown>) : {};
    for (const id of Object.keys(rec)) {
      // (a key that would not be a plain one in the record written back)
      if (this.byId.has(id) || id === '__proto__') continue;
      const saved = rec[id];
      if (!isSaved(saved)) continue;
      this.carried.set(id, saved);
      this.report({ id, what: 'unknown', v: saved.v });
    }
    for (const slice of this.list) {
      const saved = Object.hasOwn(rec, slice.id) ? rec[slice.id] : undefined;
      if (this.held.has(slice.id)) {
        // (set aside: neither read nor cleared; what the save has of it goes on as it came)
        if (isSaved(saved)) {
          this.carried.set(slice.id, saved);
          this.report({ id: slice.id, what: 'held', v: saved.v });
        }
        continue;
      }
      this.restoreOne(slice, saved);
    }
  }

  private restoreOne(slice: SaveSlice, saved: unknown): void {
    const id = slice.id;
    if (saved === undefined) {
      this.clearOne(slice);
      return;
    }
    if (!isSaved(saved)) {
      this.report({ id, what: 'malformed' });
      this.clearOne(slice);
      return;
    }
    if (saved.v > slice.version) {
      this.carried.set(id, saved);
      this.report({ id, what: 'newer', v: saved.v });
      this.clearOne(slice);
      return;
    }
    // (the record as text, taken before the slice has the data in its hands: it may change what it is handed)
    const text = asText(saved);
    let data = saved.d;
    if (saved.v < slice.version && slice.migrate) {
      try {
        data = slice.migrate(data, saved.v);
      } catch (error) {
        this.report({ id, what: 'migrate', v: saved.v, error });
        this.keepUnread(id, text);
        this.clearOne(slice);
        return;
      }
    }
    try {
      slice.restore(data, saved.v);
      if (text !== undefined) this.last.set(id, text);
    } catch (error) {
      this.report({ id, what: 'restore', v: saved.v, error });
      this.keepUnread(id, text);
      this.clearOne(slice);
    }
  }

  /**
   * A record that would not read is kept beside its slice, under an id nobody reads, and so goes on from save
   * to save: a later build can register a slice under that id and take it back. The first one kept stays (a
   * slice that fails on every load must not push the record worth having out with the ones written since).
   */
  private keepUnread(id: string, text: string | undefined): void {
    const aside = id + UNREAD;
    if (text === undefined || this.byId.has(aside) || this.carried.has(aside)) return;
    this.carried.set(aside, JSON.parse(text) as SavedSlice);
  }

  /** a new game: every slice cleared, nothing carried any more (a slice set aside is left alone) */
  clear(): void {
    this.reports.length = 0;
    this.carried.clear();
    this.last.clear();
    for (const slice of this.list) if (!this.held.has(slice.id)) this.clearOne(slice);
  }

  private clearOne(slice: SaveSlice): void {
    try {
      slice.clear?.();
    } catch (error) {
      this.report({ id: slice.id, what: 'clear', error });
    }
  }

  /** the slices there are, the records carried unread, the slices set aside, what the last restore reported (plain data) */
  telemetry(): { ids: string[]; carried: string[]; held: string[]; reports: { id: string; what: SliceTrouble; v?: number; error?: string }[] } {
    return {
      ids: this.ids,
      carried: this.carriedIds,
      held: this.heldIds,
      reports: this.reports.map((r) => ({ id: r.id, what: r.what, ...(r.v !== undefined ? { v: r.v } : {}), ...(r.error !== undefined ? { error: words(r.error) } : {}) })),
    };
  }

  private report(r: SliceReport): void {
    const i = this.reports.findIndex((x) => x.id === r.id && x.what === r.what);
    if (i >= 0) this.reports[i] = r;
    else this.reports.push(r);
    this.onReport?.(r);
  }
}

/** what was thrown, in words (whatever it was) */
function words(error: unknown): string {
  try {
    return error instanceof Error ? error.message : String(error);
  } catch {
    return 'something that cannot be put into words';
  }
}
