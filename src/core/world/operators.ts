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

/** the share of a bench's height band that is riser (the rest is the level bench), on ground gentle enough for it */
export const TERRACE_RISER = 0.26;
/**
 * The steepest a riser is made (rise over run). At four metres a step, a riser of 1.7 in 1 is the steepest
 * whose foot and brow are not a kink in the land (the land card's measure); the slope it is cut from is an
 * estimate, so the risers are made a little gentler than that.
 */
export const RISER_SLOPE = 1.5;

/**
 * A height (m, positive or negative) remapped into benches `step` m apart. Within each band of `step` the
 * first part is level and the last part — `riser` of it, a quarter where nothing else is said — rises
 * smoothly to the next bench, so height and slope stay continuous. `k` (0 … 1) mixes the benches in.
 *
 * The riser is steeper than the slope it replaces by 1.5 / riser: with a quarter of the band, a hillside
 * that climbs 0.3 m per metre gets risers of about 1.7 in 1, and one that climbs 0.6 would get risers no
 * height field can hold. So the caller that knows how steep the ground is hands in `riserFor(slope)`:
 * steeper ground has narrower benches and risers no steeper than RISER_SLOPE.
 */
export function terrace(h: number, step: number, k: number, riser = TERRACE_RISER): number {
  if (k <= 0 || step <= 0) return h;
  const u = h / step;
  const i = Math.floor(u);
  const f = u - i;
  const t = (i + smooth((f - (1 - riser)) / riser)) * step;
  return h + (t - h) * k;
}

/**
 * The share of a band the riser takes on ground that climbs `slope` m per metre, so that the riser is no
 * steeper than RISER_SLOPE: the more, the steeper the ground, until at two in three there is no bench left.
 * It has no least value of its own: the caller's measure of the slope has one (the land's slope and a
 * margin, joined smoothly, so that the share never turns a corner where the slope passes through nothing).
 */
export function riserFor(slope: number): number {
  const r = (1.5 / RISER_SLOPE) * slope;
  return r > 0.999 ? 0.999 : r;
}

/**
 * The height of a dune field taken over all of it, as a share of `amp` (measured: 0.357 to 0.367 over
 * fields of several sizes and seeds): what the far ring's coarse land, whose grid is wider than a dune, is
 * raised by instead of the dunes themselves.
 */
export const DUNE_MEAN = 0.36;

/**
 * The shapes of dune fields (docs/V3/nodes/E2-earth-land.md): transverse rows across the wind (0, the first
 * there was), linear ridges along it (1, the seif dunes of the red sand seas), star dunes where the wind turns
 * about (2: great pyramids of sand, three sets of rows crossing), barchans (3: crescents apart on flat ground)
 */
export type DuneShape = 0 | 1 | 2 | 3;

/** a dune field's mean height as a share of its `amp`, by its shape (what the far ring's coarse land is raised by) */
export function duneMean(shape: DuneShape): number {
  return shape === 1 ? 0.315 : shape === 2 ? 0.274 : shape === 3 ? 0.132 : DUNE_MEAN;
}

/** one set of rows: a saw with a long rise and a short fall (`rise`), its phase bent by a slow noise */
function rows(x: number, z: number, seed: number, len: number, ca: number, sa: number, rise: number): number {
  const bend = fbm2(x / (len * 5), z / (len * 5), seed + 0x1d1, 2);
  const p = (x * ca + z * sa) / len + 1.6 * bend;
  const f = p - Math.floor(p);
  return f < rise ? smooth(f / rise) : 1 - smooth((f - rise) / (1 - rise));
}

/**
 * The height (m) of a dune field at (x, z): 0 in the hollows, up to about `amp` on the crests. The rows lie
 * across the x axis turned by the field's own slow noise; `len` is the distance from crest to crest (m).
 * Shapes other than the first (DuneShape) are the emergent Earth's.
 */
export function dunes(x: number, z: number, seed: number, amp: number, len: number, shape: DuneShape = 0): number {
  if (amp <= 0) return 0;
  if (shape === 1) {
    // (long ridges along the wind, both flanks alike, standing on a sand floor between them)
    const ridge = rows(x, z, seed, len, 0.33, 0.94, 0.5);
    const tall = 0.7 + 0.3 * smooth(0.5 + 0.9 * fbm2(x / (len * 6), z / (len * 6), seed + 0x1d2, 2));
    return amp * ridge * ridge * tall;
  }
  if (shape === 2) {
    // (three sets of rows crossing: arms meeting in peaks, the peaks where the sand heaps highest)
    const a = rows(x, z, seed, len, 1, 0.12, 0.6);
    const b = rows(x, z, seed + 7, len, -0.42, 0.91, 0.6);
    const c = rows(x, z, seed + 13, len, -0.58, -0.81, 0.6);
    const heap = smooth(0.5 + 1.1 * fbm2(x / (len * 2.2), z / (len * 2.2), seed + 0x1d3, 2));
    return amp * Math.max(a * b, b * c, a * c) * (0.25 + 0.75 * heap);
  }
  if (shape === 3) {
    // (crescents apart on a hard flat floor: the rows broken up by a patchy noise)
    const cres = rows(x, z, seed, len, 1, 0.35, 0.72);
    const patch = smooth((fbm2(x / (len * 1.3), z / (len * 1.3), seed + 0x1d4, 2) - 0.12) / 0.35);
    return amp * cres * patch;
  }
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
