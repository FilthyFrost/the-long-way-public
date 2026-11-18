/**
 * Cross-section operators of the second world version (docs/V3/nodes/W1-worldgen.md): ways of reshaping the
 * land beside the road that a whole stretch takes on, with a strength that blends from one stretch into the
 * next like the other numbers of a cross-section (landform.ts LandParams).
 *
 *   terraces  a slope remapped into level benches with short risers between them: the terraced hillsides of
 *             farming country. Strength 0 leaves the slope as it was; 1 is all benches.
 *   dunes     ridges added to open ground: a long gentle windward side, a short lee side, in rows across the
 *             wind, breaking up and joining again as dunes do.
 *
 * Both are arithmetic on what they are handed and hashed noise: no trigonometry of the engine, nothing of the
 * land function. Both leave the road's corridor alone (the caller fades them in beyond it) and neither makes a
 * slope steeper than two in one for the strengths the regions use (the tests measure it).
 */
import { fbm2 } from '../math/noise';

function smooth(t: number): number {
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
}

/** the share of a bench's height band that is riser (the rest is the level bench) */
export const TERRACE_RISER = 0.26;

/**
 * A height (m, measured from the road's level, positive or negative) remapped into benches `step` m apart.
 * Within each band of `step` the first three quarters are level and the last quarter rises smoothly to the
 * next bench, so height and slope stay continuous. `k` (0 … 1) mixes the benches in.
 *
 * The riser is steeper than the slope it replaces by 1.5 / TERRACE_RISER: a hillside that climbs 0.3 m per
 * metre gets risers of about 1.7 in 1.
 */
export function terrace(h: number, step: number, k: number): number {
  if (k <= 0 || step <= 0) return h;
  const u = h / step;
  const i = Math.floor(u);
  const f = u - i;
  const t = (i + smooth((f - (1 - TERRACE_RISER)) / TERRACE_RISER)) * step;
  return h + (t - h) * k;
}

/**
 * The height (m) of a dune field at (x, z): 0 in the hollows, up to about `amp` on the crests. The rows lie
 * across the x axis turned by the field's own slow noise; `len` is the distance from crest to crest (m).
 */
export function dunes(x: number, z: number, seed: number, amp: number, len: number): number {
  if (amp <= 0) return 0;
  // the rows bend: the phase along the wind is pushed about by a slow noise
  const bend = fbm2(x / (len * 5), z / (len * 5), seed + 0x1d1, 2);
  const p = (x + 0.35 * z) / len + 1.6 * bend;
  const f = p - Math.floor(p);
  // a saw with a long rise (the windward side, 72 % of the way) and a short fall (the lee side), both eased
  const rise = 0.72;
  const saw = f < rise ? smooth(f / rise) : 1 - smooth((f - rise) / (1 - rise));
  // dunes stand taller here and die away there
  const tall = 0.45 + 0.55 * smooth(0.5 + 0.9 * fbm2(x / (len * 3.1), z / (len * 3.1), seed + 0x1d2, 2));
  return amp * saw * tall;
}
