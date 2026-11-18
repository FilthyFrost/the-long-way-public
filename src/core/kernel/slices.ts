/**
 * The save slices of the V3 kernel (docs/V3/nodes/N0-foundation.md): each system keeps its own part of the save
 * under its own id and version, and one slice that cannot be read never costs the player the rest.
 *
 * In the save the slices are one record, `{ [id]: { v, d } }`: the version the slice had when it wrote, and
 * its data (anything JSON can hold). Reading it back is tolerant:
 *
 *   - a slice the record does not have is cleared (it starts as in a new game);
 *   - an older version goes through the slice's `migrate` first;
 *   - a NEWER version than this code knows, and an id nobody registered, are not read at all: the record is
 *     carried as it came into every later snapshot, so a save written with a system that is absent today (or
 *     by a later build) is not destroyed by playing on without it;
 *   - a slice whose `restore` (or `migrate`) throws is cleared, and the others are still read.
 *
 * Each of the last three is reported. Pure: no three, no DOM.
 */

export interface SaveSlice<T = unknown> {
  /** its key in the save: lower-case letters, digits, '_', '-', '.', ':'; never renamed once saves hold it */
  readonly id: string;
  /** a whole number from 1, raised whenever the shape of the data changes */
  readonly version: number;
  /** the data to keep (JSON only), undefined when there is nothing to keep; must not change anything */
  snapshot(): T | undefined;
  /** take the saved data back; fromVersion is the version it was written with (data from an older one has been through migrate) */
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
  /** not `{ v, d }` at all: the slice cleared */
  | 'malformed'
  /** migrate, restore, snapshot or clear threw */
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

function isSaved(x: unknown): x is SavedSlice {
  return typeof x === 'object' && x !== null && Number.isFinite((x as SavedSlice).v) && 'd' in x;
}

export class SaveSliceRegistry {
  /** told of each thing that went wrong, as it happens; null: nobody is told */
  onReport: ((r: SliceReport) => void) | null = null;
  /** what the last restore had to report */
  readonly reports: SliceReport[] = [];
  /** the slices in the order they were registered: the order they are restored and cleared in */
  private readonly list: SaveSlice[] = [];
  private readonly byId = new Map<string, SaveSlice>();
  /** records that are not this code's to read, carried into every snapshot as they came */
  private readonly carried = new Map<string, SavedSlice>();
  /** what each slice last wrote or was restored from: written again should its snapshot throw */
  private readonly last = new Map<string, SavedSlice>();

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

  get ids(): string[] {
    return this.list.map((s) => s.id);
  }

  /** the ids of the records carried unread */
  get carriedIds(): string[] {
    return [...this.carried.keys()].sort();
  }

  /**
   * Every slice's data, by id in alphabetical order (the same save text for the same state, whatever order the
   * slices were registered in), with the carried records among them as they came. Undefined when there is
   * nothing at all, so that a save with no slices has no key for them. A slice whose snapshot throws is
   * reported and written as it last was.
   */
  snapshot(): SliceRecord | undefined {
    const ids = [...this.byId.keys()];
    for (const id of this.carried.keys()) if (!this.byId.has(id)) ids.push(id);
    ids.sort();
    const out: SliceRecord = {};
    let n = 0;
    for (const id of ids) {
      const slice = this.byId.get(id);
      const kept = this.carried.get(id);
      let rec: SavedSlice | undefined;
      // (not this code's to read, an unknown id or a newer version: as it came)
      if (kept) rec = kept;
      else if (slice) {
        try {
          const d = slice.snapshot();
          if (d === undefined) this.last.delete(id);
          else {
            rec = { v: slice.version, d };
            this.last.set(id, rec);
          }
        } catch (error) {
          this.report({ id, what: 'snapshot', error });
          rec = this.last.get(id);
        }
      }
      if (rec) {
        out[id] = rec;
        n++;
      }
    }
    return n ? out : undefined;
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
    for (const slice of this.list) this.restoreOne(slice, Object.hasOwn(rec, slice.id) ? rec[slice.id] : undefined);
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
    let data = saved.d;
    if (saved.v < slice.version && slice.migrate) {
      try {
        data = slice.migrate(data, saved.v);
      } catch (error) {
        this.report({ id, what: 'migrate', v: saved.v, error });
        this.clearOne(slice);
        return;
      }
    }
    try {
      slice.restore(data, saved.v);
      this.last.set(id, saved);
    } catch (error) {
      this.report({ id, what: 'restore', v: saved.v, error });
      this.clearOne(slice);
    }
  }

  /** a new game: every slice cleared, nothing carried any more */
  clear(): void {
    this.reports.length = 0;
    this.carried.clear();
    this.last.clear();
    for (const slice of this.list) this.clearOne(slice);
  }

  private clearOne(slice: SaveSlice): void {
    try {
      slice.clear?.();
    } catch (error) {
      this.report({ id: slice.id, what: 'clear', error });
    }
  }

  /** the slices there are, the records carried unread, what the last restore reported (plain data) */
  telemetry(): { ids: string[]; carried: string[]; reports: { id: string; what: SliceTrouble; v?: number; error?: string }[] } {
    return {
      ids: this.ids,
      carried: this.carriedIds,
      reports: this.reports.map((r) => ({ id: r.id, what: r.what, ...(r.v !== undefined ? { v: r.v } : {}), ...(r.error !== undefined ? { error: r.error instanceof Error ? r.error.message : String(r.error) } : {}) })),
    };
  }

  private report(r: SliceReport): void {
    this.reports.push(r);
    this.onReport?.(r);
  }
}
