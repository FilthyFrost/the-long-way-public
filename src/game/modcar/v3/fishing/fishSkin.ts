/**
 * A fish's skin (fishModel.ts), painted once per kind and colour of catch on 512 × 256 texels — u along the body (0 the
 * tail's root … 1 the snout), v round it (θ / 2π: 0 the back's midline, ¼ the right side, ½ the belly) — in the manner
 * of a Ghibli film or Breath of the Wild: a clean back-to-belly gradient taken round the body, not by height; a cool,
 * darker band along the lower flank where the body turns from the light; the pattern drawn bold with clean edges (bars,
 * spots, scales, patches each antialiased over a texel, not smeared by noise); the gill cover's edge and the mouth's
 * line drawn where the model has them; then recoloured for the colour of the catch (shiny, albino, melanistic, golden,
 * prism).
 *
 * Painted into plain arrays (no canvas needed here), with an integer-hashed value noise: ~4 times the texels of the old
 * 256 × 128 skin in about the time it took.
 */
import * as THREE from 'three';
import type { Family, FishDef, Variant } from '../../../../core/v3/fishing/lite/types';

export const SKIN_W = 512;
export const SKIN_H = 256;

export type RGB = [number, number, number];

/** what the painter needs of the body it is painted for (fishModel.ts shapeOf / profile) */
export interface SkinShape {
  family: Family;
  /** the gill cover's edge at mid-height (u), curving forward above and below as the model's does */
  gill: number;
  /** the mouth's line round the section (cos θ) and its corner (u) */
  mouthC: number;
  mouthU: number;
  /** the body's girth against its length at a place along it: a step round it is this much of a step along it */
  girth: (u: number) => number;
  /** the eyes: their middles (u, cos θ), the side they are on (+1 the right, −1 the left) and their radius (in u) */
  eyes?: readonly SkinEye[];
  /** the fins' roots, each a short line on the skin (fishModel.ts lays the fins on them) */
  fins?: readonly SkinFin[];
}

export interface SkinEye {
  u: number;
  c: number;
  side: number;
  r: number;
}

/** a fin's root from (u0, cos θ0) to (u1, cos θ1) on one side (+1, −1), or along the back's or the belly's midline (0) */
export interface SkinFin {
  u0: number;
  c0: number;
  u1: number;
  c1: number;
  side: number;
}

// ------------------------------------------------------------------ small helpers (fishModel.ts uses them too)

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function rng(seed: number): () => number {
  let s = seed | 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const smooth = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const mixN = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t);

export function rgbOf(hex: number): RGB {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}
export function mixC(a: RGB, b: RGB, t: number): RGB {
  return [mixN(a[0], b[0], t), mixN(a[1], b[1], t), mixN(a[2], b[2], t)];
}
export function scaleC(a: RGB, k: number): RGB {
  return [a[0] * k, a[1] * k, a[2] * k];
}
export function lum(c: RGB): number {
  return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
}
export function hsl2rgb(h: number, s: number, l: number): RGB {
  const f = (n: number): number => {
    const k = (n + h * 12) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

/** an integer hash of a lattice point to 0…1 */
function hash2(seed: number, i: number, j: number): number {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** value noise on a lattice, periodic round the body (y) every `py` cells */
function vnoise(seed: number, x: number, y: number, py: number): number {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const j0 = ((j % py) + py) % py;
  const j1 = (j0 + 1) % py;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(seed, i, j0);
  const b = hash2(seed, i + 1, j0);
  const c = hash2(seed, i, j1);
  const d = hash2(seed, i + 1, j1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** coverage of a shape at a distance d from its middle, of radius r, antialiased over w (all in the same units) */
const cover = (d: number, r: number, w: number): number => clamp01((r - d) / w + 0.5);

/** which bodies wear scales (and any kind whose pattern is its scales) */
const SCALED: ReadonlySet<Family> = new Set<Family>(['fusiform', 'carp', 'perch', 'disc', 'pike', 'tetra']);

/**
 * The scale showing at u along the body and a round it (ga: half the girth, in steps along it), into `out`: its column
 * and row, how far out it is from where it comes from under the scale ahead of it (0) to its free edge (1: its rim, an
 * arc bowed toward the tail), the rows to a unit of length there, and how far the texel is from that rim (in rims, 0 on
 * it, > 0 behind it toward the tail). Each scale lies over the root of the one behind it: past a scale's rim it is the
 * one behind that shows, so the tones and the relief run on across the columns and break only at the rims. Rows of
 * `su` to the length at the head, half as many again at the tail's root: the scales smaller toward the tail, as tall
 * round the body as they are long.
 */
function scaleAt(u: number, a: number, ga: number, su: number, out: Float64Array): void {
  // (rows counted along: su (1 + 0.5 (1 − u)) of them to a unit of length here)
  const sx = su * (1.5 * u - 0.25 * u * u);
  const fl = su * (1.5 - 0.5 * u);
  const col = Math.floor(sx);
  const round = a * fl * ga;
  const sy = round + (col % 2) * 0.5;
  const fx = sx - col;
  const fy = sy - Math.floor(sy) - 0.5;
  // (each scale's middle at its cell's head end, its rim 0.86 from it)
  const arc = Math.sqrt((1 - fx) * (1 - fx) + fy * fy * 1.5);
  if (arc < 0.86) {
    out[0] = col;
    out[1] = Math.floor(sy);
    out[2] = arc / 0.86;
  } else {
    // (the scale behind it: its middle at this cell's tail end, its rows offset half a row)
    const sy2 = round + ((col + 1) % 2) * 0.5;
    const fy2 = sy2 - Math.floor(sy2) - 0.5;
    out[0] = col - 1;
    out[1] = Math.floor(sy2);
    out[2] = Math.min(1, Math.sqrt(fx * fx + fy2 * fy2 * 1.5) / 0.86);
  }
  out[3] = fl;
  out[4] = arc / 0.86 - 1;
}

/** a place round the body (cos θ) on a side (+1 the right, −1 the left, 0 the midline) as the skin's v */
function vOnSide(c: number, side: number): number {
  const t = Math.acos(Math.max(-1, Math.min(1, c))) / (Math.PI * 2);
  return side < 0 ? 1 - t : t;
}

/** the fins' roots and the eyes as places on the skin: [u0, v0, u1, v1] and [u, v, r] */
function finSegs(fins: readonly SkinFin[]): number[][] {
  return fins.map((f) => [f.u0, vOnSide(f.c0, f.side), f.u1, vOnSide(f.c1, f.side)]);
}
function eyeSpots(eyes: readonly SkinEye[]): number[][] {
  return eyes.map((e) => [e.u, vOnSide(e.c, e.side), e.r]);
}

/** distance (in steps along the body: a step round it g of a step along it) from (u, v) to a fin's root, v wrapped */
function finDist(f: number[], u: number, v: number, g: number): number {
  const px = u - f[0];
  let py = v - f[1];
  py = (py - Math.round(py)) * g;
  const sx = f[2] - f[0];
  let sy = f[3] - f[1];
  sy = (sy - Math.round(sy)) * g;
  const l2 = sx * sx + sy * sy;
  const t = l2 > 1e-12 ? clamp01((px * sx + py * sy) / l2) : 0;
  const ex = px - sx * t;
  const ey = py - sy * t;
  return Math.sqrt(ex * ex + ey * ey);
}

/** distance (in steps along the body) from (u, v) to an eye's middle */
function eyeDist(e: number[], u: number, v: number, g: number): number {
  let dv = v - e[1];
  dv = (dv - Math.round(dv)) * g;
  const dx = u - e[0];
  return Math.sqrt(dx * dx + dv * dv);
}

/** the mottling's warp is read from a grid this many texels apart */
const WARP_STEP = 8;

/** the three tones of the mottling: a darker, cooler one and a lighter, warmer one about the base (±8 %) */
const TONE_DARK: RGB = [0.91, 0.925, 0.955];
const TONE_LIGHT: RGB = [1.085, 1.075, 1.04];

// ------------------------------------------------------------------ the painter

/** the shade band's tint: the lower flank darker and cooler, as a painter lays the turn of a body away from the light */
const COOL: RGB = [0.7, 0.78, 0.95];
const COOL_ADD: RGB = [0.0, 0.012, 0.04];

/** a fish's skin in a colour of catch: RGBA bytes, SKIN_W × SKIN_H, row 0 at v = 0 */
export function paintSkin(def: FishDef, sh: SkinShape, variant: Variant): Uint8ClampedArray {
  const W = SKIN_W;
  const H = SKIN_H;
  const TAU = Math.PI * 2;
  const L = def.look;
  const feat = L.f ?? [];
  const p = L.p ?? 'plain';
  const n = L.n ?? 0;
  const fam = sh.family;
  const seed = hashStr(def.id);
  let back = rgbOf(L.c[0]);
  const flank = rgbOf(L.c[1]);
  let belly = rgbOf(L.c[2]);
  if (feat.includes('flipped')) [back, belly] = [belly, back];
  const pc = rgbOf(L.pc ?? L.c[0]);
  const buf = new Float32Array(W * H * 3);
  const du = 1 / W;
  const dv = 1 / H;
  // per column: the girth (round-to-along), the wobble of the countershade's lines
  const girth = new Float32Array(W);
  const w1 = new Float32Array(W);
  const w2 = new Float32Array(W);
  for (let px = 0; px < W; px++) {
    const u = (px + 0.5) / W;
    girth[px] = Math.max(0.04, sh.girth(u));
    w1[px] = (vnoise(seed ^ 0x51, u * 5, 0.5, 64) - 0.5) * 0.05;
    w2[px] = (vnoise(seed ^ 0x93, u * 4, 0.5, 64) - 0.5) * 0.05;
  }
  const mix3 = (i: number, c: RGB, t: number): void => {
    if (t <= 0) return;
    buf[i] += (c[0] - buf[i]) * t;
    buf[i + 1] += (c[1] - buf[i + 1]) * t;
    buf[i + 2] += (c[2] - buf[i + 2]) * t;
  };
  const scale3 = (i: number, k: number): void => {
    buf[i] *= k;
    buf[i + 1] *= k;
    buf[i + 2] *= k;
  };
  const greenHead = feat.includes('greenHead');
  const scaled = p === 'scales' || SCALED.has(fam);
  // (the scales about 0.4 strong: a little more where they are the pattern)
  const scaleK = p === 'scales' ? 0.46 : 0.4;
  const su = fam === 'carp' ? 24 : 34;
  const sc = new Float64Array(5);
  const lateral = fam !== 'eel' && fam !== 'flat' && fam !== 'round';
  const vMouth = Math.acos(sh.mouthC) / TAU;
  const eyes = eyeSpots(sh.eyes ?? []);
  const fins = finSegs(sh.fins ?? []);
  // the mottling's warp: slow noise on a coarse grid, every WARP_STEP texels (one more each way, for the last cells)
  const WGX = W / WARP_STEP + 1;
  const WGY = H / WARP_STEP + 1;
  const warpX = new Float32Array(WGX * WGY);
  const warpY = new Float32Array(WGX * WGY);
  for (let iy = 0; iy < WGY; iy++)
    for (let ix = 0; ix < WGX; ix++) {
      const u = (ix * WARP_STEP + 0.5) / W;
      const v = (iy * WARP_STEP + 0.5) / H;
      warpX[iy * WGX + ix] = vnoise(seed ^ 0x3c1, u * 4, v * 4, 4) - 0.5;
      warpY[iy * WGX + ix] = vnoise(seed ^ 0x7e3, u * 4 + 9.7, v * 4, 4) - 0.5;
    }
  for (let py = 0; py < H; py++) {
    const v = (py + 0.5) / H;
    const th = v * TAU;
    const c = Math.cos(th);
    // round the body: 0 the back's midline … 1 the belly's (the same on either side)
    const a = v <= 0.5 ? v * 2 : (1 - v) * 2;
    for (let px = 0; px < W; px++) {
      const u = (px + 0.5) / W;
      const i = (py * W + px) * 3;
      const g = girth[px];
      // (a step of a — half the way round — in steps along the body)
      const ga = g * 0.5;
      // (a texel round the body, in steps along it)
      const tv = dv * g;
      const aa = Math.max(du, tv);
      // ---- the gradient, round the body: the back darker toward its midline, a soft turn to the flank, a softer one to
      // the belly
      const e1 = smooth((a - 0.3 - w1[px]) / 0.13 + 0.5);
      const e2 = smooth((a - 0.68 - w2[px]) / 0.16 + 0.5);
      const kb = 0.83 + 0.17 * smooth(a / 0.42);
      buf[i] = back[0] * kb;
      buf[i + 1] = back[1] * kb;
      buf[i + 2] = back[2] * kb;
      mix3(i, flank, e1);
      mix3(i, belly, e2);
      // ---- mottling in three tones of the base (±8 %, the dark one cooler, the light one warmer): two layers of value
      // noise warped by a third, and a finer one; fainter down the belly
      {
        // (the warp is slow: read from its coarse grid)
        const gx = px / WARP_STEP;
        const gy = py / WARP_STEP;
        const ix = Math.floor(gx);
        const iy = Math.floor(gy);
        const fx = gx - ix;
        const fy = gy - iy;
        const j0 = iy * WGX + ix;
        const j1 = j0 + WGX;
        const wx = mixN(mixN(warpX[j0], warpX[j0 + 1], fx), mixN(warpX[j1], warpX[j1 + 1], fx), fy);
        const wy = mixN(mixN(warpY[j0], warpY[j0 + 1], fx), mixN(warpY[j1], warpY[j1 + 1], fx), fy);
        const m1 = vnoise(seed ^ 0x1f, u * 8 + wx * 2.4, v * 9 + wy * 2.4, 9);
        const m2 = vnoise(seed ^ 0x2b7, u * 21 + wy * 3.2, v * 24 + wx * 3.2, 24);
        const m = m1 * 0.62 + m2 * 0.38;
        const t = Math.max(-1, Math.min(1, (m - 0.5) * 3.6)) * (1 - 0.6 * smooth((a - 0.62) / 0.24));
        const tone = t < 0 ? TONE_DARK : TONE_LIGHT;
        const s = Math.abs(t);
        buf[i] *= 1 + (tone[0] - 1) * s;
        buf[i + 1] *= 1 + (tone[1] - 1) * s;
        buf[i + 2] *= 1 + (tone[2] - 1) * s;
      }
      // ---- the head a shade apart in front of the gill cover's edge
      const ug = sh.gill + 0.035 * c * c;
      const head = smooth((u - ug) / 0.02);
      if (greenHead) mix3(i, [0.23, 0.42, 0.29], head);
      else scale3(i, 1 + 0.05 * head * (1 - e2));
      // ---- the pattern
      let t = 0;
      switch (p) {
        case 'bars': {
          // n bars down the flanks from the back, leaning back a little, gone before the belly
          const k = n || 7;
          if (u > 0.04 && u < 0.84) {
            const f = ((u - 0.06) / 0.74) * k + 0.18 * (1 - c);
            const fr = Math.abs(f - Math.floor(f) - 0.5);
            const hw = 0.25 - 0.08 * a;
            t = cover(fr, hw, ((du * k) / 0.74) * 1.2) * (1 - smooth((a - 0.56) / 0.08)) * smooth((u - 0.04) / 0.03) * (1 - smooth((u - 0.8) / 0.04));
            t *= 0.85;
          }
          break;
        }
        case 'stripe': {
          // one clean stripe along the middle of the flank
          const d = Math.abs(a - 0.46 - 0.02 * Math.sin(u * 7));
          t = cover(d * ga, 0.022 + 0.01 * smooth((0.85 - u) / 0.6), aa) * (1 - 0.6 * smooth((u - 0.88) / 0.08)) * 0.9;
          break;
        }
        case 'neon': {
          const d = Math.abs(a - 0.42);
          mix3(i, flank, cover(d * ga, 0.03, aa));
          if (a > 0.5) mix3(i, belly, smooth((a - 0.5) / 0.08) * smooth((u - 0.05) / 0.15));
          break;
        }
        case 'tiger': {
          const f = u * 14 + Math.sin(c * 6 + u * 10) * 0.6;
          const fr = Math.abs(f - Math.floor(f) - 0.5);
          t = cover(fr, 0.16, du * 14 * 1.2) * (1 - smooth((a - 0.55) / 0.08)) * 0.9;
          break;
        }
        case 'waves': {
          const w = Math.abs(Math.sin(a * 22 + Math.sin(u * 14) * 1.8));
          t = cover(w, 0.22, 0.12) * 0.85 * (u < 0.9 ? 1 : 0.4);
          break;
        }
        case 'band': {
          t = cover(Math.abs(a - 0.58) * ga, 0.028, aa) * smooth((0.86 - u) / 0.06) * 0.92;
          break;
        }
        case 'parr': {
          // parr marks: ovals along the flank's middle
          if (u > 0.08 && u < 0.8) {
            const f = u * 9;
            const fr = f - Math.floor(f) - 0.5;
            const d = Math.hypot(fr / 0.3, (a - 0.45) / 0.14);
            t = cover(d, 1, 0.12) * 0.75;
          }
          break;
        }
        case 'koi': {
          // big clean patches of red, mostly over the back as on a kohaku, and a few small black ones (where they may lie
          // is folded into the noise's threshold, so every edge stays a clean line)
          const k = vnoise(seed, u * 4.5, v * 5, 5) * 0.75 + vnoise(seed ^ 7, u * 9, v * 10, 10) * 0.25 + 0.12 * (1 - smooth(a / 0.45)) - 0.6 * smooth((a - 0.5) / 0.16) - 0.6 * (1 - smooth((u - 0.05) / 0.08));
          mix3(i, pc, cover(0.58 - k, 0, 0.012));
          const ink = vnoise(seed ^ 0x2b, u * 6 + 30, v * 7, 7) - 0.5 * smooth((a - 0.38) / 0.14);
          mix3(i, [0.08, 0.07, 0.07], cover(0.79 - ink, 0, 0.01) * 0.92);
          break;
        }
        case 'moss': {
          // smaller tufts of moss over the back, thinning down the flanks
          const k = vnoise(seed, u * 12, v * 14, 14) * 0.7 + vnoise(seed ^ 3, u * 26, v * 28, 28) * 0.3;
          t = cover(0.53 - k, 0, 0.014) * (1 - smooth((a - 0.34) / 0.14)) * 0.85;
          break;
        }
        case 'blotch':
        case 'soot': {
          const k = vnoise(seed, u * 7, v * 8, 8) * 0.7 + vnoise(seed ^ 3, u * 16, v * 16, 16) * 0.3;
          const side = a < 0.62 ? 1 : 1 - smooth((a - 0.62) / 0.12);
          t = cover(0.57 - k, 0, 0.012) * side * (p === 'soot' ? 0.6 : 0.82);
          break;
        }
        case 'net': {
          const gx = Math.abs(((u * 18) % 1) - 0.5);
          const gy = Math.abs(((v * 24 + (Math.floor(u * 18) % 2) * 0.5) % 1) - 0.5);
          t = cover(Math.min(gx / 18, (gy / 24) * g), 0.0035, aa) * (a < 0.66 ? 1 : 0.3) * 0.75;
          break;
        }
        case 'worm': {
          const k = vnoise(seed, u * 20, v * 20, 20);
          t = cover(Math.abs(k - 0.5), 0.035, 0.02) * (1 - smooth((a - 0.45) / 0.1)) * 0.9;
          break;
        }
        case 'hex': {
          const hx = u * 22;
          const hy = v * 26 + (Math.floor(hx) % 2) * 0.5;
          const ex = Math.abs((hx % 1) - 0.5);
          const ey = Math.abs((hy % 1) - 0.5);
          const edge = Math.max(ex * 0.9 + ey * 0.5, ey);
          t = smooth((edge - 0.4) / 0.05) * 0.85;
          scale3(i, 0.93 + 0.14 * hash2(seed, Math.floor(hx), Math.floor(hy)));
          break;
        }
        case 'cracks': {
          const k = vnoise(seed, u * 14, v * 14, 14);
          t = cover(Math.abs(k - 0.5), 0.03, 0.015);
          break;
        }
        case 'glass': {
          t = Math.pow(Math.max(0, Math.sin(u * 9 + c * 3)), 18) * smooth((0.45 - a) / 0.2) * 0.8;
          break;
        }
        case 'bigScales': {
          const sx = u * 16;
          const sy = a * 16 * ga + (Math.floor(sx) % 2) * 0.5;
          const fx = sx % 1;
          const fy = (sy % 1) - 0.5;
          const arc = Math.sqrt((1 - fx) * (1 - fx) * 0.9 + fy * fy * 1.6);
          t = cover(Math.abs(arc - 0.74), 0.07, 0.05) * (u > 0.1 && u < sh.gill ? 0.85 : 0.3);
          if (!feat.includes('glow')) scale3(i, 1 + 0.08 * (1 - arc));
          break;
        }
        case 'crystal': {
          const k = vnoise(seed, u * 12, v * 12, 12);
          const facet = Math.floor(k * 6) / 6;
          mix3(i, hsl2rgb((facet + u * 0.4) % 1, 0.45, 0.82), 0.45);
          break;
        }
        case 'rainbow':
        case 'aurora':
        case 'gradient': {
          const hue = p === 'aurora' ? 0.38 + 0.35 * vnoise(seed, u * 3, v * 2, 2) : p === 'gradient' ? 0.02 + 0.1 * u : (u * 1.1 + 0.05) % 1;
          mix3(i, hsl2rgb(hue, p === 'gradient' ? 0.9 : 0.75, 0.66), (p === 'rainbow' ? 0.7 : 0.8) * (1 - smooth((a - 0.7) / 0.15)));
          break;
        }
        case 'galaxy': {
          const k = vnoise(seed, u * 5, v * 4, 4);
          mix3(i, mixC(back, [0.9, 0.55, 1], k), 0.6);
          break;
        }
        case 'lightning': {
          const k = Math.abs(vnoise(seed, u * 10, v * 6, 6) - 0.5);
          t = cover(k, 0.03, 0.015);
          break;
        }
        case 'folds': {
          const f = Math.abs(((u * 6 + a * 2) % 1) - 0.5);
          scale3(i, 0.9 + 0.12 * f);
          break;
        }
        default:
          break;
      }
      mix3(i, pc, t);
      // ---- scales: crescents in rows, smaller toward the tail, each scale a slight tone of its own and its middle a
      // touch lighter, fading out down the belly
      if (scaled && u > 0.05 && u < ug - 0.004) {
        scaleAt(u, a, ga, su, sc);
        const k = scaleK * smooth((u - 0.05) / 0.06) * (1 - smooth((a - 0.56) / 0.26));
        if (k > 0) {
          // (antialiased over a texel in the scale's own measure)
          const aw = Math.max(0.07, sc[3] * du * 1.2);
          const rim = cover(Math.abs(sc[4] * 0.86), 0.08, aw) * k;
          const t = sc[2];
          scale3(i, 1 + (0.16 * (hash2(seed ^ 0x5ca1, sc[0], sc[1]) - 0.5) + 0.24 * t * (1 - t)) * k);
          scale3(i, 1 - 0.36 * rim);
        }
      }
      // ---- the lateral line: a row of short dashes
      if (lateral && u > 0.06 && u < ug - 0.01) {
        const cl = 0.12 + 0.08 * Math.sin(u * 3);
        const al = Math.acos(cl) / Math.PI;
        const dash = cover(Math.abs(((u * 70) % 1) - 0.5), 0.26, 70 * du);
        scale3(i, 1 - 0.17 * dash * cover(Math.abs(a - al) * ga, 0.0026, aa));
      }
      // ---- the gill cover's edge: a dark line with the cover a shade lighter just in front of it, and the groove under
      // its lip shaded behind it
      if (c > -0.92 && c < 0.78) {
        const sg = u - ug;
        const k = smooth((0.75 - c) / 0.2) * smooth((c + 0.92) / 0.15);
        scale3(i, 1 + 0.07 * k * smooth(sg / 0.01) * (1 - smooth((sg - 0.012) / 0.04)));
        if (sg < 0) scale3(i, 1 - 0.26 * k * (1 - smooth(-sg / 0.024)));
        scale3(i, 1 - 0.5 * k * cover(Math.abs(sg - 0.0015), 0.0022, du));
      }
      // ---- the eye sockets shaded round (the socket itself is modelled), and the fins' roots and the tail's
      for (const e of eyes) {
        if (Math.abs(u - e[0]) > e[2] * 2.6) continue;
        const d = eyeDist(e, u, v, g);
        if (d < e[2] * 2.6) scale3(i, 1 - 0.3 * (1 - smooth((d - e[2] * 1.25) / (e[2] * 1.2))));
      }
      for (const f of fins) {
        if (u < Math.min(f[0], f[2]) - 0.03 || u > Math.max(f[0], f[2]) + 0.03) continue;
        const d = finDist(f, u, v, g);
        if (d < 0.03) scale3(i, 1 - 0.24 * (1 - smooth(d / 0.022)));
      }
      if (u < 0.05) scale3(i, 1 - 0.16 * (1 - smooth(u / 0.045)));
      // ---- the mouth's line from its corner to the snout, both sides, and the lips a little darker
      if (u > sh.mouthU - 0.01) {
        const dm = Math.min(Math.abs(v - vMouth), Math.abs(v - (1 - vMouth))) * g;
        const along = smooth((u - sh.mouthU) / 0.012);
        scale3(i, 1 - 0.62 * along * cover(dm, 0.0028 + 0.002 * smooth((u - sh.mouthU) / 0.05), aa));
        scale3(i, 1 - 0.12 * smooth((u - 0.975) / 0.02));
      }
      // ---- the cool shade band along the lower flank (fading out at the snout)
      const band = smooth((a - 0.5) / 0.06) * (1 - smooth((a - 0.66) / 0.1)) * (1 - smooth((u - 0.92) / 0.06));
      if (band > 0) {
        const s = 0.4 * band;
        buf[i] = mixN(buf[i], buf[i] * COOL[0] + COOL_ADD[0], s);
        buf[i + 1] = mixN(buf[i + 1], buf[i + 1] * COOL[1] + COOL_ADD[1], s);
        buf[i + 2] = mixN(buf[i + 2], buf[i + 2] * COOL[2] + COOL_ADD[2], s);
      }
    }
  }
  // ---- spots and specks, round on the body (both sides), placed apart
  const nSpots = p === 'spots' ? 40 : p === 'speck' ? 150 : p === 'dots' ? 60 : p === 'halo' ? 30 : p === 'leopard' ? 34 : p === 'pores' ? 90 : p === 'stars' ? 80 : p === 'embers' ? 60 : 0;
  if (nSpots) {
    const r = rng(seed);
    const placed: { u: number; v: number; r: number }[] = [];
    let tries = 0;
    while (placed.length < nSpots && tries++ < nSpots * 30) {
      const small = p === 'speck' || p === 'pores' || p === 'stars' || p === 'dots';
      const rad = small ? 0.0045 + 0.005 * r() : p === 'leopard' ? 0.018 + 0.012 * r() : 0.009 + 0.012 * r();
      const su = 0.05 + 0.85 * r();
      const sv = r();
      const sa = sv <= 0.5 ? sv * 2 : (1 - sv) * 2;
      // (on the back and flanks: not on the belly, except the fine specks)
      if (sa > (small ? 0.78 : 0.62)) continue;
      const g = Math.max(0.04, sh.girth(su));
      let ok = true;
      for (const q of placed) {
        let dvv = Math.abs(q.v - sv);
        dvv = Math.min(dvv, 1 - dvv);
        if (Math.hypot(q.u - su, dvv * g) < (q.r + rad) * 1.25) {
          ok = false;
          break;
        }
      }
      if (ok) placed.push({ u: su, v: sv, r: rad });
    }
    for (let si = 0; si < placed.length; si++) {
      const s = placed[si];
      const g = Math.max(0.04, sh.girth(s.u));
      const halo = p === 'halo' && si % 3 !== 0;
      const red = p === 'halo' && si % 3 === 0;
      const ring = p === 'leopard';
      const R = s.r * (halo ? 1.45 : 1);
      const ru = Math.ceil(R / du) + 2;
      const rv = Math.ceil(R / (dv * g)) + 2;
      const cx = s.u * W;
      const cy = s.v * H;
      for (let oy = -rv; oy <= rv; oy++) {
        const py = (((Math.floor(cy) + oy) % H) + H) % H;
        const vv = (py + 0.5) / H;
        let dvv = vv - s.v;
        if (dvv > 0.5) dvv -= 1;
        if (dvv < -0.5) dvv += 1;
        for (let ox = -ru; ox <= ru; ox++) {
          const px = Math.floor(cx) + ox;
          if (px < 0 || px >= W) continue;
          const d = Math.hypot((px + 0.5) / W - s.u, dvv * g);
          const i = (py * W + px) * 3;
          const aaw = Math.max(du, dv * g);
          if (halo) mix3(i, scaleC(belly, 1.04), cover(d, R, aaw) * 0.85);
          let k = cover(d, s.r, aaw);
          if (ring) k *= 1 - 0.65 * cover(d, s.r * 0.55, aaw);
          mix3(i, red ? [0.85, 0.22, 0.16] : pc, k * (p === 'speck' ? 0.85 : 0.95));
        }
      }
    }
  }
  // ---- an eyespot at the tail, a dark flap behind the gill, a third eye
  const dot = (u0: number, c0: number, rad: number, col: RGB, ringC?: RGB): void => {
    for (const v0 of [Math.acos(c0) / TAU, 1 - Math.acos(c0) / TAU]) {
      const g = Math.max(0.04, sh.girth(u0));
      const ru = Math.ceil(rad / du) + 2;
      const rv = Math.ceil(rad / (dv * g)) + 2;
      for (let oy = -rv; oy <= rv; oy++) {
        const py = Math.floor(v0 * H) + oy;
        if (py < 0 || py >= H) continue;
        for (let ox = -ru; ox <= ru; ox++) {
          const px = Math.floor(u0 * W) + ox;
          if (px < 0 || px >= W) continue;
          const d = Math.hypot((px + 0.5) / W - u0, ((py + 0.5) / H - v0) * g);
          const aaw = Math.max(du, dv * g);
          const i = (py * W + px) * 3;
          if (ringC) mix3(i, ringC, cover(d, rad, aaw));
          mix3(i, col, cover(d, ringC ? rad * 0.62 : rad, aaw));
        }
      }
    }
  };
  if (feat.includes('eyespot')) dot(0.06, 0.1, 0.035, [0.06, 0.05, 0.05], [0.95, 0.55, 0.15]);
  if (feat.includes('earFlap')) dot(sh.gill - 0.01, 0.2, 0.026, [0.08, 0.1, 0.16]);
  if (feat.includes('thirdEye')) dot(0.9, 0.85, 0.018, [0.95, 0.85, 0.3], [0.2, 0.1, 0.25]);
  // ---- the colour of the catch, and out to bytes
  const out = new Uint8ClampedArray(W * H * 4);
  const r = rng(seed ^ 0x77);
  for (let k = 0, i = 0; k < W * H; k++, i += 3) {
    let o: RGB = [buf[i], buf[i + 1], buf[i + 2]];
    if (variant !== 0) {
      const l = lum(o);
      switch (variant) {
        case 1: {
          // shiny: richer, a touch brighter
          const m = (o[0] + o[1] + o[2]) / 3;
          o = scaleC([m + (o[0] - m) * 1.35, m + (o[1] - m) * 1.35, m + (o[2] - m) * 1.35], 1.08);
          break;
        }
        case 2:
          o = mixC([0.98, 0.93, 0.9], [1, 0.78, 0.8], 0.35 * (1 - l));
          break;
        case 3:
          o = mixC([0.05, 0.05, 0.07], o, 0.12 + 0.12 * l);
          break;
        case 4:
          // (gold all over, its pattern only a shade deeper: not dark blotches on gold)
          o = mixC([0.55, 0.36, 0.08], [1, 0.86, 0.42], Math.min(1, 0.42 + l * 0.85));
          break;
        case 5: {
          const px = k % W;
          const py = Math.floor(k / W);
          o = mixC(hsl2rgb((px / W + (py / H) * 0.5) % 1, 0.75, 0.62), o, 0.25);
          break;
        }
      }
    }
    // (sparkles on the shiny, the golden and the prism: a few small clean ones)
    if ((variant === 1 || variant === 4 || variant === 5) && r() < 0.0012) o = [1, 1, 1];
    const j = k * 4;
    out[j] = 255 * o[0];
    out[j + 1] = 255 * o[1];
    out[j + 2] = 255 * o[2];
    out[j + 3] = 255;
  }
  return out;
}

// ------------------------------------------------------------------ the skin's relief

/**
 * The skin's relief and wetness (render/materials.ts detailMap) on the skin's own 512 × 256 texels: a height field —
 * the scales' domes and the grooves round them, the lateral line's groove, the gill cover standing a step proud of the
 * body behind it with fine lines fanning over it from its hinge, a ridge round each eye's socket — turned to
 * tangent-space normals by a Sobel filter (r toward +u, g toward +v, 0…1 for −1…1, measured in the body's own lengths
 * round and along), and in b how wet the skin is: wettest on the head, the back and the scales' middles, drier in the
 * scales' rims. RGBA bytes, alpha full (a canvas's premultiplied alpha would spoil them, so no canvas).
 */
export function paintDetail(def: FishDef, sh: SkinShape): Uint8Array {
  const W = SKIN_W;
  const H = SKIN_H;
  const du = 1 / W;
  const fam = sh.family;
  const p = def.look.p ?? 'plain';
  const hgt = new Float32Array(W * H);
  const wet = new Float32Array(W * H);
  const girth = new Float32Array(W);
  for (let px = 0; px < W; px++) girth[px] = Math.max(0.04, sh.girth((px + 0.5) / W));
  const scaled = p === 'scales' || SCALED.has(fam);
  const su = fam === 'carp' ? 24 : 34;
  const sc = new Float64Array(5);
  const lateral = fam !== 'eel' && fam !== 'flat' && fam !== 'round';
  const eyes = eyeSpots(sh.eyes ?? []);
  // (the gill cover's hinge, up and forward on it: its lines fan out from there back to its edge)
  const hu = sh.gill + 0.06;
  const ha = 0.36;
  for (let py = 0; py < H; py++) {
    const v = (py + 0.5) / H;
    const c = Math.cos(v * Math.PI * 2);
    const a = v <= 0.5 ? v * 2 : (1 - v) * 2;
    for (let px = 0; px < W; px++) {
      const u = (px + 0.5) / W;
      const k = py * W + px;
      const g = girth[px];
      const ga = g * 0.5;
      let z = 0;
      // wet all over, wetter on the back and the head
      const ug = sh.gill + 0.035 * c * c;
      const head = smooth((u - ug) / 0.02);
      let w = 0.6 + 0.22 * (1 - smooth(a / 0.5)) + 0.22 * head;
      // ---- the scales: each rising from under the one ahead of it to its free edge, a step down at its rim onto the one
      // behind and a groove there (heights in lengths of the scale)
      if (scaled && u > 0.05 && u < ug - 0.004) {
        scaleAt(u, a, ga, su, sc);
        const f = smooth((u - 0.05) / 0.06) * (1 - smooth((a - 0.56) / 0.26));
        if (f > 0) {
          const cell = 1 / sc[3];
          const t = sc[2];
          z += 0.05 * cell * (1 - (1 - t) * (1 - t)) * f;
          const gr = Math.exp(-(((sc[4] * 0.86 - 0.03) / 0.08) ** 2));
          z -= 0.02 * cell * gr * f;
          w += 0.48 * t * (1 - t) * f;
          w *= 1 - 0.55 * gr * f;
        }
      }
      // ---- the lateral line: a fine groove along the flank, its pores pricked along it
      if (lateral && u > 0.06 && u < ug - 0.01) {
        const cl = 0.12 + 0.08 * Math.sin(u * 3);
        const al = Math.acos(cl) / Math.PI;
        const d = (a - al) * ga;
        const line = Math.exp(-((d / 0.0026) ** 2));
        const pore = cover(Math.abs(((u * 70) % 1) - 0.5), 0.22, 70 * du);
        z -= (0.0005 + 0.0004 * pore) * line;
      }
      // ---- the gill cover: a step proud of the body behind its edge, fine lines fanning over it from its hinge
      if (c > -0.92 && c < 0.78) {
        const kg = smooth((0.75 - c) / 0.2) * smooth((c + 0.92) / 0.15);
        const sg = u - ug;
        z += 0.0016 * kg * smooth(sg / 0.004 + 0.5);
        if (sg > 0 && u < hu + 0.01) {
          const dx = hu - u;
          const dy = (a - ha) * ga;
          const rr = Math.hypot(dx, dy);
          const fan = Math.pow(0.5 + 0.5 * Math.cos(Math.atan2(dy, dx) * 30), 4);
          z += 0.0002 * fan * kg * smooth((rr - 0.012) / 0.012) * (1 - smooth((sg - 0.05) / 0.015)) * smooth(sg / 0.006);
        }
      }
      // ---- a ridge round each eye's socket
      for (const e of eyes) {
        if (Math.abs(u - e[0]) > e[2] * 2.4) continue;
        const d = eyeDist(e, u, v, g);
        if (d < e[2] * 2.4) z += 0.09 * e[2] * Math.exp(-(((d - e[2] * 1.55) / (e[2] * 0.24)) ** 2));
      }
      hgt[k] = z;
      wet[k] = w;
    }
  }
  // the heights' slopes by a Sobel filter (round the body wrapped, along it held at its ends), in the body's own
  // measure: a texel along it du long, one round it g / H
  const out = new Uint8Array(W * H * 4);
  for (let py = 0; py < H; py++) {
    const ym = ((py + H - 1) % H) * W;
    const y0 = py * W;
    const yp = ((py + 1) % H) * W;
    for (let px = 0; px < W; px++) {
      const xm = Math.max(0, px - 1);
      const xp = Math.min(W - 1, px + 1);
      const gx = (hgt[ym + xp] + 2 * hgt[y0 + xp] + hgt[yp + xp] - hgt[ym + xm] - 2 * hgt[y0 + xm] - hgt[yp + xm]) / 8;
      const gy = (hgt[yp + xm] + 2 * hgt[yp + px] + hgt[yp + xp] - hgt[ym + xm] - 2 * hgt[ym + px] - hgt[ym + xp]) / 8;
      const sx = -gx * W;
      const sy = (-gy * H) / girth[px];
      const l = Math.hypot(sx, sy, 1);
      const k = (y0 + px) * 4;
      out[k] = Math.round(255 * (0.5 + (0.5 * sx) / l));
      out[k + 1] = Math.round(255 * (0.5 + (0.5 * sy) / l));
      out[k + 2] = Math.round(255 * clamp01(wet[y0 + px]));
      out[k + 3] = 255;
    }
  }
  return out;
}

/** the skins' reliefs made so far, by kind and colour of catch */
const DETAILS = new Map<string, THREE.DataTexture>();

/** a fish's relief and wetness (paintDetail) as a linear texture, made once for each kind and colour of catch */
export function detailTexture(def: FishDef, sh: SkinShape, variant: Variant): THREE.DataTexture {
  const key = `${def.id}@${variant}`;
  let t = DETAILS.get(key);
  if (!t) {
    t = new THREE.DataTexture(paintDetail(def, sh), SKIN_W, SKIN_H, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.colorSpace = THREE.NoColorSpace;
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.needsUpdate = true;
    DETAILS.set(key, t);
  }
  return t;
}
