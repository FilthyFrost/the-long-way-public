/**
 * Seedable gradient noise using only arithmetic + integer hashing (cross-engine deterministic).
 */
import { hash2 } from './rng';

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const R = 0.7071067811865476;
const GX = [1, R, 0, -R, -1, -R, 0, R];
const GY = [0, R, 1, R, 0, -R, -1, -R];

/** 2D simplex noise, roughly in [-1, 1] */
export function simplex2(x: number, y: number, seed: number): number {
  const s = (x + y) * F2;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const t = (i + j) * G2;
  const x0 = x - (i - t);
  const y0 = y - (j - t);
  const i1 = x0 > y0 ? 1 : 0;
  const j1 = 1 - i1;
  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;
  let n = 0;
  let a = 0.5 - x0 * x0 - y0 * y0;
  if (a > 0) {
    const h = hash2(i, j, seed) & 7;
    a *= a;
    n += a * a * (GX[h] * x0 + GY[h] * y0);
  }
  a = 0.5 - x1 * x1 - y1 * y1;
  if (a > 0) {
    const h = hash2(i + i1, j + j1, seed) & 7;
    a *= a;
    n += a * a * (GX[h] * x1 + GY[h] * y1);
  }
  a = 0.5 - x2 * x2 - y2 * y2;
  if (a > 0) {
    const h = hash2(i + 1, j + 1, seed) & 7;
    a *= a;
    n += a * a * (GX[h] * x2 + GY[h] * y2);
  }
  return 99 * n;
}

/** fractal sum of simplex octaves, normalised to roughly [-1, 1] */
export function fbm2(x: number, y: number, seed: number, octaves: number, lacunarity = 2, gain = 0.5): number {
  let amp = 1;
  let sum = 0;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let o = 0; o < octaves; o++) {
    sum += amp * simplex2(fx, fy, seed + o * 1013);
    norm += amp;
    amp *= gain;
    fx *= lacunarity;
    fy *= lacunarity;
  }
  return sum / norm;
}

/** ridged multifractal in [0, 1]: sharp crests, good for mountain ranges */
export function ridged2(x: number, y: number, seed: number, octaves: number, lacunarity = 2, gain = 0.5): number {
  let amp = 1;
  let sum = 0;
  let norm = 0;
  let fx = x;
  let fy = y;
  let prev = 1;
  for (let o = 0; o < octaves; o++) {
    let n = simplex2(fx, fy, seed + o * 1013);
    n = 1 - (n < 0 ? -n : n);
    n *= n;
    sum += amp * n * prev;
    norm += amp;
    prev = n;
    amp *= gain;
    fx *= lacunarity;
    fy *= lacunarity;
  }
  return sum / norm;
}

/** 1D gradient noise in roughly [-1, 1] with quintic interpolation (C2 continuous) */
export function gnoise1(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const g0 = (hash2(i, 0x3c6e, seed) / 4294967296) * 2 - 1;
  const g1 = (hash2(i + 1, 0x3c6e, seed) / 4294967296) * 2 - 1;
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  return (g0 * f * (1 - u) + g1 * (f - 1) * u) * 2;
}

export function fbm1(x: number, seed: number, octaves: number, gain = 0.5): number {
  let amp = 1;
  let sum = 0;
  let norm = 0;
  let fx = x;
  for (let o = 0; o < octaves; o++) {
    sum += amp * gnoise1(fx, seed + o * 733);
    norm += amp;
    amp *= gain;
    fx *= 2;
  }
  return sum / norm;
}
