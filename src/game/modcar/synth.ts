/**
 * Offline sample synthesis for the ModCar sounds: plain Float32Array maths, no Web Audio, so the
 * same recipes run in the browser (into AudioBuffers) and in Node tests. Deterministic: every
 * recipe takes its own seeded random source.
 */

/** xorshift32 in [0, 1) */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = (seed | 0) || 0x9e3779b9;
  }
  next(): number {
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x;
    return (x >>> 0) / 4294967296;
  }
  /** uniform in [a, b) */
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  /** roughly normal (sum of four uniforms), mean 0, sd 1 */
  gauss(): number {
    return (this.next() + this.next() + this.next() + this.next() - 2) * 1.732;
  }
}

/** RBJ biquad, direct form I, run in place over a buffer */
export type BiquadKind = 'lowpass' | 'highpass' | 'bandpass' | 'peaking' | 'lowshelf' | 'highshelf';

export function biquad(x: Float32Array, sr: number, kind: BiquadKind, f: number, q = 0.707, gainDb = 0): Float32Array {
  const w = (2 * Math.PI * Math.min(f, sr * 0.49)) / sr;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const alpha = sw / (2 * q);
  const A = Math.pow(10, gainDb / 40);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  switch (kind) {
    case 'lowpass':
      b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
      break;
    case 'highpass':
      b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
      break;
    case 'bandpass':
      b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
      break;
    case 'peaking':
      b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A;
      break;
    case 'lowshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 - (A - 1) * cw + s); b1 = 2 * A * (A - 1 - (A + 1) * cw); b2 = A * (A + 1 - (A - 1) * cw - s);
      a0 = A + 1 + (A - 1) * cw + s; a1 = -2 * (A - 1 + (A + 1) * cw); a2 = A + 1 + (A - 1) * cw - s;
      break;
    }
    case 'highshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 + (A - 1) * cw + s); b1 = -2 * A * (A - 1 + (A + 1) * cw); b2 = A * (A + 1 + (A - 1) * cw - s);
      a0 = A + 1 - (A - 1) * cw + s; a1 = 2 * (A - 1 - (A + 1) * cw); a2 = A + 1 - (A - 1) * cw - s;
      break;
    }
  }
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    x[i] = y0;
  }
  return x;
}

export function noise(n: number, rng: Rng): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rng.next() * 2 - 1;
  return out;
}

/** add src (times g) into dst starting at sample `at` (clipped to dst) */
export function mixInto(dst: Float32Array, src: Float32Array, at: number, g = 1): void {
  const a = Math.max(0, Math.floor(at));
  const n = Math.min(src.length, dst.length - a);
  for (let i = 0; i < n; i++) dst[a + i] += src[i] * g;
}

/** a decaying sinusoid (one mode of a struck object) added into dst */
export function ring(dst: Float32Array, sr: number, at: number, f: number, amp: number, decay: number, phase = 0): void {
  const a = Math.max(0, Math.floor(at));
  const n = Math.min(dst.length - a, Math.ceil(decay * 7 * sr));
  const w = (2 * Math.PI * f) / sr;
  const k = Math.exp(-1 / (decay * sr));
  let e = amp;
  for (let i = 0; i < n; i++) {
    dst[a + i] += e * Math.sin(w * i + phase);
    e *= k;
  }
}

/** a struck object: a handful of modes with jittered frequencies, decays and phases */
export function strike(dst: Float32Array, sr: number, at: number, modes: ReadonlyArray<readonly [number, number, number]>, amp: number, rng: Rng, jitter = 0.02): void {
  for (const [f, g, d] of modes) {
    ring(dst, sr, at, f * (1 + jitter * rng.gauss()), amp * g * (0.85 + 0.3 * rng.next()), d * (0.8 + 0.4 * rng.next()), rng.range(0, 6.283));
  }
}

/** a noise burst with an attack and an exponential decay, filtered, added into dst */
export function burst(dst: Float32Array, sr: number, at: number, len: number, amp: number, rng: Rng, opts: { attack?: number; decay?: number; filter?: [BiquadKind, number, number?][] } = {}): void {
  const n = Math.max(1, Math.floor(len * sr));
  const b = noise(n, rng);
  for (const [kind, f, q] of opts.filter ?? []) biquad(b, sr, kind, f, q ?? 0.707);
  const att = Math.max(1, Math.floor((opts.attack ?? 0.001) * sr));
  const dec = opts.decay ?? len / 4;
  for (let i = 0; i < n; i++) {
    const e = i < att ? i / att : Math.exp(-(i - att) / (dec * sr));
    b[i] *= e;
  }
  mixInto(dst, b, at, amp);
}

/** fade the first and last ms of a buffer to avoid clicks */
export function edges(x: Float32Array, sr: number, inMs = 1, outMs = 8): Float32Array {
  const a = Math.min(x.length, Math.floor((inMs / 1000) * sr));
  const b = Math.min(x.length, Math.floor((outMs / 1000) * sr));
  for (let i = 0; i < a; i++) x[i] *= i / a;
  for (let i = 0; i < b; i++) x[x.length - 1 - i] *= i / b;
  return x;
}

/** scale so the peak sits at `peak` */
export function normalize(x: Float32Array, peak = 0.9): Float32Array {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  if (m > 0) {
    const g = peak / m;
    for (let i = 0; i < x.length; i++) x[i] *= g;
  }
  return x;
}

/** soft clip (tanh-like), drive > 0 */
export function saturate(x: Float32Array, drive: number): Float32Array {
  const k = Math.tanh(drive);
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * drive) / k;
  return x;
}

/** in-place radix-2 FFT (re, im of a power-of-two length) */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const h = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < h; k++) {
        const a = i + k;
        const b = a + h;
        const vr = re[b] * cr - im[b] * ci;
        const vi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - vr;
        im[b] = im[a] - vi;
        re[a] += vr;
        im[a] += vi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** RMS, peak and spectral centroid of a buffer (for tests and the render harness) */
export function measure(x: Float32Array, sr: number): { rms: number; peak: number; centroid: number } {
  let s = 0;
  let peak = 0;
  for (let i = 0; i < x.length; i++) {
    s += x[i] * x[i];
    peak = Math.max(peak, Math.abs(x[i]));
  }
  const N = 2048;
  let num = 0;
  let den = 0;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let o = 0; o + N <= Math.max(N, x.length); o += N / 2) {
    re.fill(0);
    im.fill(0);
    for (let n = 0; n < N && o + n < x.length; n++) re[n] = x[o + n] * (0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N));
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const m = re[k] * re[k] + im[k] * im[k];
      num += m * ((k * sr) / N);
      den += m;
    }
  }
  return { rms: Math.sqrt(s / Math.max(1, x.length)), peak, centroid: den > 0 ? num / den : 0 };
}
