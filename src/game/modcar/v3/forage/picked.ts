/**
 * The picked points of the forage system (node W3): for each plant that was picked and has not borne again,
 * the game day from which it bears again, by the point's key (src/core/v3/forage/field.ts pointKey: a whole
 * number that names the flora layer and cell, too large for a small integer).
 *
 * A table of its own and not a Map: the look-out asks it about every candidate point, a hundred or more at a
 * time, several times a second, and a Map asked with a number that large is handed the number on the heap
 * (16 bytes a question, measured). Here the keys lie in one typed array and a question allocates nothing.
 * Open addressing, linear probing; grown (when a point is picked, never when one is asked about) before it
 * is half full; entries are dropped all together when the day turns (`dropDue`), which packs it again.
 */

/** the day a point that is not in the table bears from: it bears now */
export const NOT_PICKED = -1;

const EMPTY = -1;

function hashOf(key: number, mask: number): number {
  // (the key's low 32 bits and what is above them, mixed: neighbouring cells differ by 1 and by 2^21)
  const lo = key % 4294967296;
  const hi = (key - lo) / 4294967296;
  let h = (lo ^ Math.imul(hi | 0, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  return h & mask;
}

export class PickedTable {
  private keys = new Float64Array(64).fill(EMPTY);
  private days = new Int32Array(64);
  private mask = 63;
  private n = 0;

  /** how many points are remembered */
  get size(): number {
    return this.n;
  }

  /** the day from which the point bears again; NOT_PICKED when it is not remembered. Allocates nothing. */
  get(key: number): number {
    const keys = this.keys;
    const mask = this.mask;
    let i = hashOf(key, mask);
    for (;;) {
      const k = keys[i];
      if (k === key) return this.days[i];
      if (k === EMPTY) return NOT_PICKED;
      i = (i + 1) & mask;
    }
  }

  /** remember a point as picked: it bears again from `day` */
  set(key: number, day: number): void {
    if (!(key >= 0) || !Number.isSafeInteger(key)) return;
    if ((this.n + 1) * 2 > this.keys.length) this.grow(this.keys.length * 2);
    this.put(key, day | 0);
  }

  private put(key: number, day: number): void {
    const keys = this.keys;
    const mask = this.mask;
    let i = hashOf(key, mask);
    while (keys[i] !== EMPTY && keys[i] !== key) i = (i + 1) & mask;
    if (keys[i] === EMPTY) this.n++;
    keys[i] = key;
    this.days[i] = day;
  }

  private grow(size: number): void {
    const keys = this.keys;
    const days = this.days;
    this.keys = new Float64Array(size).fill(EMPTY);
    this.days = new Int32Array(size);
    this.mask = size - 1;
    this.n = 0;
    for (let i = 0; i < keys.length; i++) if (keys[i] !== EMPTY) this.put(keys[i], days[i]);
  }

  /** every point that bears again by `today` is forgotten; returns how many were (the table is packed again) */
  dropDue(today: number): number {
    const keys = this.keys;
    const days = this.days;
    let gone = 0;
    for (let i = 0; i < keys.length; i++) if (keys[i] !== EMPTY && days[i] <= today) gone++;
    if (gone === 0) return 0;
    let size = 64;
    while ((this.n - gone) * 2 > size) size *= 2;
    this.keys = new Float64Array(size).fill(EMPTY);
    this.days = new Int32Array(size);
    this.mask = size - 1;
    this.n = 0;
    for (let i = 0; i < keys.length; i++) if (keys[i] !== EMPTY && days[i] > today) this.put(keys[i], days[i]);
    return gone;
  }

  clear(): void {
    if (this.keys.length !== 64) {
      this.keys = new Float64Array(64);
      this.days = new Int32Array(64);
      this.mask = 63;
    }
    this.keys.fill(EMPTY);
    this.n = 0;
  }

  /** for the save: key, day, key, day … in the order of the keys (the same table, the same text) */
  flat(): number[] {
    const at: number[] = [];
    for (let i = 0; i < this.keys.length; i++) if (this.keys[i] !== EMPTY) at.push(i);
    at.sort((a, b) => this.keys[a] - this.keys[b]);
    const out: number[] = [];
    for (const i of at) out.push(this.keys[i], this.days[i]);
    return out;
  }

  /** from the save: pairs that are not a key and a day are passed over */
  load(flat: unknown): void {
    this.clear();
    if (!Array.isArray(flat)) return;
    for (let i = 0; i + 1 < flat.length; i += 2) {
      const key = flat[i] as unknown;
      const day = flat[i + 1] as unknown;
      if (typeof key === 'number' && typeof day === 'number' && Number.isSafeInteger(key) && key >= 0 && Number.isFinite(day)) this.set(key, Math.floor(day));
    }
  }
}
