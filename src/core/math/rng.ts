/**
 * Deterministic hashing and PRNG. Integer math only (Math.imul, shifts), so every
 * JS engine produces exactly the same sequence — the basis for "same seed, same world".
 */
export function hash32(a: number): number {
  a |= 0;
  a = Math.imul(a ^ (a >>> 16), 0x7feb352d);
  a = Math.imul(a ^ (a >>> 15), 0x846ca68b);
  a ^= a >>> 16;
  return a >>> 0;
}

export function hash2(x: number, y: number, seed = 0): number {
  const h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  return hash32(h);
}

export function hash3(x: number, y: number, z: number, seed = 0): number {
  return hash32(hash2(x, y, seed) ^ Math.imul(z | 0, 0x85ebca6b));
}

/** uniform float in [0,1) from integer coordinates */
export function rand2(x: number, y: number, seed = 0): number {
  return hash2(x, y, seed) / 4294967296;
}

export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = hash32((seed | 0) ^ 0x6d2b79f5) | 0;
  }
  /** mulberry32 */
  nextU32(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }
  next(): number {
    return this.nextU32() / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }
  /** weighted pick: returns index */
  weighted(weights: readonly number[]): number {
    let total = 0;
    for (let i = 0; i < weights.length; i++) total += weights[i];
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return weights.length - 1;
  }
  /** independent stream derived from this seed and a tag (does not advance this stream) */
  fork(tag: number): Rng {
    return new Rng(hash2(this.s, tag, 0x51ed270b));
  }
}
