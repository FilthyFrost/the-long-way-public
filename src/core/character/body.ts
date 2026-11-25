// Her body, sculpted on her bones and muscles (docs/V3/plan/character-pv.md §3, §16).
//
// The trunk, the neck and each limb are lofts (sdf.ts loft): at each level where a body is measured, a cross-section
// given as eight radii round its bone — so a calf is widest behind and to the inside, a forearm flat near the wrist,
// a thigh full at the top outside — sized from a slim young woman's measurements at 1.63 m (the tables below). On them
// lies what shows through the skin of a slim body: the collarbones and the notch between them, the bony top of the
// shoulder, the shoulder blades, the furrow of the spine and the two dimples over the pelvis, the points of the hip
// bones, the navel; the olecranon and the two epicondyles at the elbow, the head of the ulna at the wrist; the kneecap,
// its tendon and the bump it pulls on, the ankle bones (the inner higher and further forward), the Achilles tendon;
// and the breasts and the buttocks, soft, and the cleft and folds between them and the thighs.
//
// A limb's sections are written as a body is described — medial, anterior, lateral, posterior and between — one table
// for both sides (mirrored). The trunk is one profile cut into overlapping pieces, each moving with its own bone of
// the spine; where they overlap they are one surface.
//
// The hands and feet keep their own solids (palm, knuckles, fingers; heel, arch, toes), joined to the lofts.

import {
  type LoftSection, type Node, type Prim, Tag, add, addNear, carve, ellipsoid, frameAlong, frameAxes, halfSpace, hardMin,
  loft, prim, roundCone, shared, smooth, sphere,
} from './sdf';
import type { Skeleton } from './skeleton';
import { sculptHead } from './head';
import { type V3, add3, cross, dot, norm, qrot, scale3, sub3 } from './qmath';

export interface Sculpt {
  tree: Node;
  /** the trunk alone (no limbs, no head): what the dress is fitted to */
  torso: Node;
  /** each leg alone (hip to toes), for what is worn on the legs */
  legs: Record<'l' | 'r', Node>;
  /** the neck and head */
  neckHead: Node;
  /** each arm without its hand, each hand, each leg without its foot, each foot: what clothes are grown from */
  armOnly: Record<'l' | 'r', Node>;
  handOnly: Record<'l' | 'r', Node>;
  legOnly: Record<'l' | 'r', Node>;
  footOnly: Record<'l' | 'r', Node>;
  /** solids by name, for tests and for clothes that follow a part */
  named: Record<string, Prim>;
  /** where each hand is, for the finer first-person meshes (wrist, along, thumb-ward, palm-ward) */
  hands: Record<'l' | 'r', { wrist: V3; along: V3; thumbward: V3; palmar: V3 }>;
}

/** what is on her shoulders: her own head (head.ts) or a full-face helmet (helmet.ts) */
export const HEADWEAR: 'head' | 'helmet' = 'helmet';

const SIDES = ['l', 'r'] as const;
const FINGERS = ['index', 'middle', 'ring', 'pinky'] as const;

// ------------------------------------------------------------------------------------------------ her measurements
//
// A slim young woman of 1.63 m (girths about the 30th percentile of women's surveys, ANSUR II; lengths from her
// skeleton). Metres.

/**
 * Her trunk, level by level: height, half its width, how far its front and its back are from the trunk's line (z = 0),
 * and how full it is between the side and the front, the side and the back (1: an ellipse's quarter; more: squarer).
 */
export type TrunkRow = [y: number, w: number, f: number, b: number, kf: number, kb: number];
export const TRUNK: TrunkRow[] = [
  // (an anime girl's, as the turnaround draws her: hips as wide as her shoulders with the thighs below them, a waist
  // two-thirds of that, 20 cm across; the chest 23 cm across and, with the small breasts, 17 deep)
  // below the crotch (inside the thighs' tops)
  [0.755, 0.070, 0.026, 0.055, 1.0, 1.0],
  // the crotch and the buttocks' lower curve
  [0.790, 0.115, 0.044, 0.084, 1.04, 1.08],
  // the hips, their widest with the thighs' tops beside them
  [0.830, 0.140, 0.055, 0.098, 1.05, 1.1],
  [0.865, 0.143, 0.060, 0.102, 1.05, 1.09],
  // from the hip bones up the waist draws in
  [0.900, 0.135, 0.064, 0.092, 1.05, 1.06],
  [0.935, 0.122, 0.066, 0.080, 1.05, 1.05],
  // the navel
  [0.970, 0.109, 0.066, 0.070, 1.06, 1.04],
  [1.005, 0.107, 0.064, 0.066, 1.07, 1.04],
  // the waist, narrowest (soft: a girl's, not a pin-up's)
  [1.045, 0.105, 0.062, 0.066, 1.07, 1.04],
  // the lower ribs, the rib cage widening to under the breasts
  [1.085, 0.108, 0.062, 0.071, 1.05, 1.04],
  [1.120, 0.110, 0.064, 0.077, 1.03, 1.05],
  [1.160, 0.115, 0.066, 0.081, 1.02, 1.05],
  // the breasts' level (the breasts are solids of their own), the armpits; the shoulder blades a little fuller behind
  [1.200, 0.117, 0.067, 0.083, 1.02, 1.06],
  [1.240, 0.115, 0.066, 0.083, 1.03, 1.06],
  // the upper chest under the collarbones
  [1.275, 0.106, 0.059, 0.078, 1.03, 1.05],
  [1.305, 0.087, 0.050, 0.068, 1.0, 1.02],
  // the root of the neck
  [1.335, 0.058, 0.040, 0.054, 1.0, 1.0],
];

/** her neck (in the same terms; its top goes up into the helmet): about 31 cm round */
export const NECK: TrunkRow[] = [
  // (slender: 8.8 cm across)
  [1.290, 0.064, 0.046, 0.06, 1.0, 1.0],
  [1.330, 0.048, 0.040, 0.050, 1.03, 1.02],
  [1.360, 0.044, 0.039, 0.046, 1.03, 1.0],
  [1.400, 0.043, 0.038, 0.045, 1.02, 1.0],
  [1.460, 0.043, 0.037, 0.046, 1.0, 1.0],
];

/**
 * A section of a limb round its bone: where (a share of the bone's length from the joint above), the radius
 * medially, antero-medially, anteriorly, antero-laterally, laterally, postero-laterally, posteriorly, postero-medially,
 * and the middle's shift medially and anteriorly (m). (The foot's "anterior" is up, its "posterior" the sole.)
 */
export type LimbSec = [t: number, m: number, ma: number, a: number, la: number, l: number, lp: number, p: number, mp: number, cm?: number, ca?: number];

/** the upper arm: the deltoid's cap over the shoulder, its insertion a third of the way down where the outside dips,
 *  the biceps in front and the triceps behind, flattening to the epicondyles' width at the elbow (about 24 cm round) */
export const UPPERARM: LimbSec[] = [
  // (a slim straight tube, 5 cm across: the shoulder a small round cap set into the chest)
  [-0.12, 0.015, 0.02, 0.025, 0.028, 0.028, 0.026, 0.023, 0.017, -0.004, 0],
  [0.00, 0.023, 0.028, 0.032, 0.034, 0.034, 0.033, 0.031, 0.025, -0.003, 0],
  [0.15, 0.024, 0.028, 0.031, 0.032, 0.031, 0.031, 0.031, 0.026, -0.001, 0],
  [0.40, 0.025, 0.027, 0.030, 0.028, 0.026, 0.028, 0.031, 0.027, 0, 0],
  [0.62, 0.025, 0.027, 0.029, 0.026, 0.024, 0.027, 0.030, 0.027, 0, 0.001],
  [0.82, 0.023, 0.025, 0.026, 0.024, 0.023, 0.025, 0.026, 0.024, 0, 0],
  [1.00, 0.023, 0.022, 0.021, 0.021, 0.022, 0.022, 0.022, 0.022, 0, -0.002],
];

/** the forearm (the hand turned palm to thigh, thumb forward): widest a fifth of the way down — the flexors inside,
 *  brachioradialis and the extensors' wad in front and outside, the ulna's edge behind — then tendons, flat, to a wrist
 *  wider across (thumb to little finger) than through, the ulna's head behind and outside (about 22 cm, then 15) */
export const FOREARM: LimbSec[] = [
  // (the turnaround's: 5.5–6 cm at its widest a quarter of the way down, a wrist 3.8 across and 3.3 through)
  [0.00, 0.023, 0.022, 0.021, 0.021, 0.022, 0.022, 0.022, 0.022, 0, -0.002],
  [0.22, 0.029, 0.029, 0.029, 0.029, 0.027, 0.026, 0.025, 0.027, 0, 0],
  [0.45, 0.024, 0.025, 0.026, 0.025, 0.022, 0.022, 0.022, 0.022, 0, 0],
  [0.70, 0.018, 0.020, 0.021, 0.019, 0.017, 0.019, 0.020, 0.017, 0, 0],
  [0.88, 0.0165, 0.018, 0.019, 0.018, 0.0165, 0.018, 0.019, 0.017, 0, 0],
  [1.00, 0.016, 0.017, 0.019, 0.017, 0.016, 0.018, 0.019, 0.016, 0, 0],
];

/** the thigh, from the hip joint: full at the top outside (the trochanter and vastus lateralis) and inside (the
 *  adductors), its line drawing in toward the knee; vastus medialis' teardrop over the inside of the knee (about 52 cm
 *  round under the buttock, 46 at the middle, 36 at the knee) */
export const THIGH: LimbSec[] = [
  // (the turnaround's: 14 cm across at the crotch, 12 at the dress's hem, 9.4 above the knee, the knee 7.5)
  [0.00, 0.040, 0.044, 0.048, 0.052, 0.058, 0.060, 0.062, 0.048, -0.004, 0],
  [0.14, 0.066, 0.06, 0.054, 0.064, 0.074, 0.074, 0.072, 0.068, -0.002, -0.002],
  [0.25, 0.069, 0.066, 0.062, 0.067, 0.072, 0.071, 0.069, 0.067, 0, 0.001],
  [0.43, 0.056, 0.060, 0.062, 0.061, 0.062, 0.060, 0.059, 0.056, 0.003, 0.003],
  [0.62, 0.046, 0.050, 0.051, 0.050, 0.049, 0.048, 0.048, 0.046, 0.006, 0.002],
  [0.82, 0.041, 0.043, 0.043, 0.042, 0.041, 0.041, 0.041, 0.041, 0.008, 0],
  [1.00, 0.039, 0.040, 0.041, 0.039, 0.039, 0.038, 0.038, 0.038, 0.009, -0.002],
];

/** the lower leg, from the knee: the calf's two heads behind (the inner lower and larger), the shin's flat inner face
 *  and its edge in front, tibialis anterior beside it outside; narrowing to the Achilles tendon over the ankle (about
 *  34 cm round at the calf, 20 above the ankle) */
export const SHIN: LimbSec[] = [
  // (the turnaround's: the calf full high, just under the knee — 8.8 cm across, 9 deep — then one long taper to an
  // ankle 4.2 across)
  [0.00, 0.039, 0.040, 0.041, 0.039, 0.039, 0.038, 0.038, 0.038, 0.009, -0.002],
  [0.08, 0.041, 0.039, 0.036, 0.040, 0.043, 0.046, 0.047, 0.045, 0.008, -0.004],
  [0.18, 0.044, 0.038, 0.034, 0.040, 0.044, 0.050, 0.055, 0.053, 0.007, -0.006],
  [0.28, 0.041, 0.034, 0.031, 0.036, 0.041, 0.046, 0.051, 0.049, 0.006, -0.006],
  [0.40, 0.033, 0.029, 0.028, 0.030, 0.033, 0.037, 0.041, 0.039, 0.005, -0.006],
  [0.52, 0.026, 0.025, 0.025, 0.025, 0.027, 0.029, 0.033, 0.030, 0.004, -0.006],
  [0.64, 0.0235, 0.023, 0.024, 0.023, 0.0235, 0.026, 0.029, 0.026, 0.004, -0.006],
  [0.72, 0.0225, 0.022, 0.023, 0.022, 0.0225, 0.024, 0.028, 0.024, 0.004, -0.006],
  [1.00, 0.025, 0.025, 0.026, 0.025, 0.025, 0.026, 0.028, 0.026, 0.003, -0.004],
];

/** the foot from the back of the heel (m along it, not a share): the heel round, the instep rising over the ankle to
 *  the navicular, the inner arch lifted off the floor, the outer edge on it, the ball wide (her foot 23.5 cm long, 8.6
 *  across the ball) */
export const FOOT: LimbSec[] = [
  [0.000, 0.011, 0.011, 0.011, 0.011, 0.011, 0.013, 0.015, 0.013, 0, 0.002],
  [0.013, 0.022, 0.024, 0.024, 0.024, 0.022, 0.027, 0.03, 0.027, 0, 0.002],
  [0.035, 0.024, 0.027, 0.033, 0.027, 0.024, 0.029, 0.031, 0.028, 0, 0.003],
  [0.062, 0.025, 0.031, 0.035, 0.03, 0.026, 0.029, 0.032, 0.025, 0, 0.005],
  [0.094, 0.029, 0.033, 0.029, 0.028, 0.031, 0.033, 0.032, 0.022, 0.001, 0],
  [0.125, 0.034, 0.029, 0.023, 0.024, 0.035, 0.031, 0.028, 0.024, 0.002, -0.004],
  [0.152, 0.039, 0.024, 0.018, 0.019, 0.037, 0.026, 0.022, 0.024, 0.003, -0.011],
  [0.175, 0.041, 0.02, 0.014, 0.017, 0.037, 0.02, 0.016, 0.022, 0.004, -0.017],
  [0.19, 0.037, 0.016, 0.01, 0.013, 0.031, 0.015, 0.013, 0.018, 0.005, -0.019],
];

/**
 * The palm, from the wrist joint (m along the hand), round the hand's axis: toward the little finger, the palm, the
 * thumb and the back (and between: [t, ulnar, ulnar-palmar, palmar, radial-palmar, radial, radial-dorsal, dorsal,
 * ulnar-dorsal, shift ulnar, shift palmar]). The back is a low arch over the metacarpals; the palm a hollow between its
 * heel (the little finger's pad, along the outside) and the ball of the thumb; past the knuckles the palm side goes on
 * as the pads under the fingers' roots and the webs between them, the back stops.
 */
export const PALM: LimbSec[] = [
  [0.000, 0.0195, 0.018, 0.0145, 0.018, 0.0205, 0.017, 0.0135, 0.016, 0, 0],
  [0.016, 0.0245, 0.022, 0.016, 0.0235, 0.027, 0.0175, 0.011, 0.017, 0, 0.001],
  [0.036, 0.028, 0.0238, 0.0145, 0.0245, 0.0298, 0.0185, 0.0102, 0.0195, 0.001, 0.001],
  [0.056, 0.0298, 0.0212, 0.012, 0.0196, 0.0298, 0.0185, 0.0102, 0.0205, 0.001, 0],
  [0.0715, 0.0272, 0.022, 0.0145, 0.0205, 0.0298, 0.0162, 0.011, 0.0187, 0.001, 0.001],
  [0.0835, 0.0212, 0.0162, 0.011, 0.0154, 0.0238, 0.0077, 0.0052, 0.0094, 0.002, 0.0035],
];

/** each finger's radius at its root, its middle joint, its last joint and its tip (the thumb: its base in the ball of
 *  the hand, its knuckle, its one joint, its tip); a finger keeps its width to the last joint, then the tip narrows a
 *  little (Hands closes a grip round these) */
export const FINGER_RADII: Record<'index' | 'middle' | 'ring' | 'pinky' | 'thumb', [number, number, number, number]> = {
  // (an anime girl's hand: small, the fingers long for it and slender)
  index: [0.0074, 0.007, 0.0062, 0.0056],
  middle: [0.0076, 0.0071, 0.0063, 0.0057],
  ring: [0.0072, 0.0068, 0.006, 0.0054],
  pinky: [0.0065, 0.0061, 0.0054, 0.0049],
  thumb: [0.0102, 0.0089, 0.0081, 0.0071],
};

/** her toes, from the big one out: [inward of the ball joint, then forward of it the root, the middle knuckle and the
 *  tip, the radius at the root and at the tip, how far the middle knuckle rises] (the big toe 2.3 cm wide) */
export const TOES: [number, number, number, number, number, number, number][] = [
  [0.0215, 0.004, 0.029, 0.05, 0.0106, 0.0092, 0],
  [0.0043, 0.005, 0.03, 0.048, 0.0069, 0.0059, 0.0036],
  [-0.0086, 0.003, 0.026, 0.043, 0.0066, 0.0056, 0.0036],
  [-0.0207, -0.002, 0.021, 0.036, 0.0062, 0.0053, 0.0031],
  [-0.0322, -0.008, 0.013, 0.026, 0.0057, 0.0049, 0.0027],
];

const r45 = (a: number, b: number) => 1 / Math.sqrt(0.5 / (a * a) + 0.5 / (b * b));

/** a trunk table as a loft's sections up a vertical axis from height y0 */
function trunkSections(rows: TrunkRow[], y0: number, scale = 1): LoftSection[] {
  return rows.map(([y, w, f, b, kf, kb]) => {
    const fl = r45(w, f) * kf, bl = r45(w, b) * kb;
    return { t: y - y0, r: [w, fl, f, fl, w, bl, b, bl].map((v) => v * scale) };
  });
}

/**
 * A limb table as a loft's sections for one side. The loft's local +x is medial on the left (frameAlong with the
 * anterior as its front), lateral on the right: the right's radii are the left's mirrored.
 */
function limbSections(rows: LimbSec[], side: 'l' | 'r', length: number): LoftSection[] {
  return rows.map(([t, m, ma, a, la, l, lp, p, mp, cm = 0, ca = 0]) => side === 'l'
    ? { t: t * length, r: [m, ma, a, la, l, lp, p, mp], cx: cm, cz: ca }
    : { t: t * length, r: [l, la, a, ma, m, mp, p, lp], cx: -cm, cz: ca });
}

/** the trunk's back (−z) and front at a height, from the table (linear between rows) */
function trunkAt(y: number, k: 'f' | 'b' | 'w'): number {
  const col = k === 'w' ? 1 : k === 'f' ? 2 : 3;
  for (let i = 0; i < TRUNK.length - 1; i++) {
    const a = TRUNK[i], b = TRUNK[i + 1];
    if (y <= b[0] || i === TRUNK.length - 2) {
      const u = Math.min(1, Math.max(0, (y - a[0]) / (b[0] - a[0])));
      return a[col] + (b[col] - a[col]) * u;
    }
  }
  return TRUNK[0][col];
}

export function sculptBody(sk: Skeleton): Sculpt {
  const J = (n: string): V3 => {
    const v = sk.bindPos[sk.index[n]];
    if (!v) throw new Error(`no joint ${n}`);
    return v;
  };
  const B = (n: string): number => sk.index[n];
  const axes = (n: string): [V3, V3, V3] => {
    const q = sk.bindRot[sk.index[n]];
    return [qrot(q, [1, 0, 0]), qrot(q, [0, 1, 0]), qrot(q, [0, 0, 1])];
  };
  const named: Record<string, Prim> = {};
  const P = (p: Prim): Node => {
    if (p.name) named[p.name] = p;
    return prim(p);
  };
  const at = (o: V3, ...terms: [V3, number][]): V3 => {
    let r: V3 = [o[0], o[1], o[2]];
    for (const [d, s] of terms) r = add3(r, scale3(d, s));
    return r;
  };
  /** a direction made square to an axis (its part along the axis taken out) */
  const across = (v: V3, axis: V3): V3 => norm(sub3(v, scale3(axis, dot(v, axis))));
  const up: V3 = [0, 1, 0], fwd: V3 = [0, 0, 1];
  const worldFrame = (o: V3) => frameAxes(o, up, fwd);
  /** a solid that only shapes (a carving tool): it claims none of her skin for its bone */
  const tool = { claim: 0 };

  // ---------------------------------------------------------------------------------------------- neck
  const hs = sculptHead(sk);
  Object.assign(named, hs.named);
  let neckHead: Node;
  if (HEADWEAR === 'helmet') {
    // the neck alone, up into the helmet: a loft of her neck's measured sections, leaning a little forward
    const y0 = NECK[0][0], y1 = NECK[NECK.length - 1][0];
    neckHead = P(loft([0, y0, -0.008], [0, y1, -0.002], trunkSections(NECK, y0), {
      bone: B('neck_01'), boneA: B('spine_03'), atA: 0.03, bandA: 0.03, boneB: B('Head'), atB: 0.12, bandB: 0.03, name: 'neck',
    }));
  } else neckHead = hs.neckHead;

  // ---------------------------------------------------------------------------------------------- trunk
  const ty0 = TRUNK[0][0], ty1 = TRUNK[TRUNK.length - 1][0];
  const trunkSecs = trunkSections(TRUNK, ty0);
  const trunkA: V3 = [0, ty0, 0], trunkB: V3 = [0, ty1, 0];
  const piece = (name: string, from: number, to: number, spec: { bone: number; boneA?: number; atA?: number; bandA?: number; boneB?: number; atB?: number; bandB?: number }) =>
    P(loft(trunkA, trunkB, trunkSecs, { ...spec, atA: spec.atA !== undefined ? spec.atA - ty0 : undefined, atB: spec.atB !== undefined ? spec.atB - ty0 : undefined, name }, fwd, [from - ty0, to - ty0]));
  // one profile in four pieces up the spine (a hard minimum: where they overlap they are the same surface)
  const trunk = hardMin(
    piece('trunk_pelvis', ty0, 0.99, { bone: B('pelvis'), boneB: B('spine_01'), atB: 0.965, bandB: 0.03 }),
    piece('trunk_belly', 0.93, 1.12, { bone: B('spine_01'), boneA: B('pelvis'), atA: 0.955, bandA: 0.03, boneB: B('spine_02'), atB: 1.09, bandB: 0.03 }),
    piece('trunk_chest', 1.06, 1.26, { bone: B('spine_02'), boneA: B('spine_01'), atA: 1.08, bandA: 0.03, boneB: B('spine_03'), atB: 1.2, bandB: 0.035 }),
    piece('trunk_upper', 1.17, ty1, { bone: B('spine_03'), boneA: B('spine_02'), atA: 1.19, bandA: 0.035 }),
  );
  const torsoParts: Node[] = [trunk];
  const shoulderTop: Record<string, V3> = {};
  const clavicles: Node[] = [];
  const breasts: Node[] = [];
  for (const s of SIDES) {
    const m = s === 'l' ? 1 : -1;
    const X = (x: number, y: number, z: number): V3 => [m * x, y, z];
    const sh = J(`upperarm_${s}`);
    shoulderTop[s] = sh;
    const clav = B(`clavicle_${s}`);
    // the trapezius' slope from the neck to the top of the shoulder, thicker behind
    torsoParts.push(P(roundCone(X(0.04, 1.344, -0.022), X(0.138, 1.314, -0.016), 0.026, 0.018, {
      bone: clav, boneA: B('spine_03'), atA: 0.025, bandA: 0.03, name: `trap_${s}`,
    }, 1.0, 0.78, up)));
    // the breasts: small, a little apart and turned out, the lower curve fuller than the upper
    breasts.push(P(ellipsoid(frameAxes(X(0.056, 1.18, 0.05), norm([m * 0.05, 1, 0.22]), norm([m * 0.36, -0.18, 1])), 0.05, 0.046, 0.035, {
      bone: B('spine_03'), boneA: B('spine_02'), atA: -0.03, bandA: 0.03, name: `breast_${s}`,
    })));
    // the buttocks: gluteus maximus under its fat, round and a little apart
    torsoParts.push(P(ellipsoid(frameAxes(X(0.052, 0.83, -0.066), norm([m * 0.06, 1, 0.08]), norm([m * 0.22, -0.12, -1])), 0.06, 0.068, 0.05, {
      bone: B('pelvis'), boneA: B(`thigh_${s}`), atA: -0.035, bandA: 0.04, name: `buttock_${s}`,
    })));
    // the collarbones: from the notch at the top of the breastbone, out and forward, then back to the acromion
    const c0 = X(0.016, 1.311, 0.035), c1 = X(0.066, 1.317, 0.04), c2 = X(0.136, 1.318, -0.006);
    clavicles.push(P(sphere(X(0.016, 1.309, 0.033), 0.0068, { bone: clav, boneA: B('spine_03'), claim: 0.6, name: `sternoclav_${s}` })));
    clavicles.push(P(roundCone(c0, c1, 0.0046, 0.004, { bone: clav, claim: 0.6, name: `clavicle1_${s}` })));
    clavicles.push(P(roundCone(c1, c2, 0.004, 0.0046, { bone: clav, claim: 0.6, name: `clavicle2_${s}` })));
  }
  // (no fillet wider than 3.5 cm: the field is exact only that near a small solid's bounds, compile's band)
  let torsoNode: Node = add(0.02, add(0.034, smooth(0.034, ...torsoParts), hardMin(...breasts)), hardMin(...clavicles));
  // carved: the notch between the collarbones, the furrow of the spine, the dimples over the pelvis, the navel, the
  // cleft between the buttocks
  torsoNode = carve(0.01, torsoNode, P(sphere([0, 1.32, 0.046], 0.011, { bone: B('spine_03'), ...tool, name: 'jugular' })));
  {
    const ys = [1.315, 1.25, 1.18, 1.11, 1.04, 0.975, 0.93];
    const furrow: Node[] = [];
    for (let i = 0; i + 1 < ys.length; i++) {
      // shallow over the ribs, deeper in the small of the back between its long muscles
      const z = (y: number) => -trunkAt(y, 'b') - (y < 1.08 ? 0.0138 : 0.0156);
      furrow.push(P(roundCone([0, ys[i], z(ys[i])], [0, ys[i + 1], z(ys[i + 1])], 0.016, 0.016, { bone: B('spine_02'), ...tool, name: `furrow${i}` })));
    }
    torsoNode = carve(0.009, torsoNode, hardMin(...furrow));
  }
  for (const m of [1, -1]) {
    const y = 0.926;
    torsoNode = carve(0.006, torsoNode, P(sphere([m * 0.033, y, -trunkAt(y, 'b') - 0.0058], 0.007, { bone: B('pelvis'), ...tool, name: `dimple_${m > 0 ? 'l' : 'r'}` })));
  }
  torsoNode = carve(0.004, torsoNode, P(ellipsoid(worldFrame([0, 0.972, trunkAt(0.972, 'f') + 0.0012]), 0.0045, 0.006, 0.0065, { bone: B('pelvis'), ...tool, name: 'navel' })));
  torsoNode = carve(0.008, torsoNode, P(ellipsoid(worldFrame([0, 0.82, -0.118]), 0.005, 0.062, 0.036, { bone: B('pelvis'), ...tool, name: 'cleft' })));
  const torso = shared(torsoNode);

  // ---------------------------------------------------------------------------------------------- arms and hands
  const arms: Record<string, Node> = {};
  const armOnly = {} as Record<'l' | 'r', Node>, handOnly = {} as Record<'l' | 'r', Node>;
  const legOnly = {} as Record<'l' | 'r', Node>, footOnly = {} as Record<'l' | 'r', Node>;
  const hands = {} as Sculpt['hands'];
  for (const s of SIDES) {
    const m = s === 'l' ? 1 : -1;
    const sh = J(`upperarm_${s}`), el = J(`lowerarm_${s}`), wr = J(`hand_${s}`);
    const armDir = norm(sub3(el, sh)), foreDir = norm(sub3(wr, el));
    const [hX, hY, hZ] = axes(`hand_${s}`);
    const along = hY, thumbward = hZ, palmar = scale3(hX, m); // the right hand's frame is mirrored: its +x is the back
    hands[s] = { wrist: wr, along, thumbward, palmar };
    // the upper arm's sides: anterior (the biceps), medial (toward her side)
    const antUA = across(fwd, armDir);
    const medUA = norm(cross(armDir, antUA));
    const medialUA: V3 = m > 0 ? medUA : scale3(medUA, -1);
    const LU = Math.hypot(...sub3(el, sh)), LF = Math.hypot(...sub3(wr, el));
    const upperarm = P(loft(sh, el, limbSections(UPPERARM, s, LU), {
      bone: B(`upperarm_${s}`), boneA: B(`clavicle_${s}`), atA: -0.012, bandA: 0.03, boneB: B(`lowerarm_${s}`), atB: LU, bandB: 0.03, name: `upperarm_${s}`,
    }, antUA, [UPPERARM[0][0] * LU, LU], true));
    // the forearm's front is the thumb's side (the hand hangs palm to thigh)
    const antFA = across(thumbward, foreDir);
    const forearm = P(loft(el, wr, limbSections(FOREARM, s, LF), {
      bone: B(`lowerarm_${s}`), boneA: B(`upperarm_${s}`), atA: 0.004, bandA: 0.03, boneB: B(`hand_${s}`), atB: LF - 0.002, bandB: 0.016, name: `forearm_${s}`,
    }, antFA, [0, LF], true));
    // the elbow's bones: the olecranon behind, the inner epicondyle (the larger), the outer
    const back = scale3(antUA, -1);
    const elbowBones = hardMin(
      P(sphere(at(el, [back, 0.0155], [armDir, -0.004]), 0.0078, { bone: B(`lowerarm_${s}`), boneA: B(`upperarm_${s}`), claim: 0.6, name: `elbow_${s}` })),
      P(sphere(at(el, [medialUA, 0.0175], [armDir, -0.008], [back, 0.003]), 0.0062, { bone: B(`upperarm_${s}`), claim: 0.6, name: `elbowM_${s}` })),
      P(sphere(at(el, [medialUA, -0.0165], [armDir, -0.006]), 0.0048, { bone: B(`upperarm_${s}`), claim: 0.6, name: `elbowL_${s}` })),
    );
    // the wrist's bones: the ulna's head behind on the little finger's side, the radius' end at the thumb's
    const dorsal = scale3(palmar, -1), ulnar = scale3(thumbward, -1);
    const wristBones = hardMin(
      P(sphere(at(wr, [along, -0.012], [ulnar, 0.0145], [dorsal, 0.006]), 0.0058, { bone: B(`lowerarm_${s}`), boneB: B(`hand_${s}`), claim: 0.5, name: `ulnahead_${s}` })),
      P(sphere(at(wr, [along, -0.008], [thumbward, 0.0165], [palmar, 0.002]), 0.0056, { bone: B(`lowerarm_${s}`), boneB: B(`hand_${s}`), claim: 0.5, name: `radiusend_${s}` })),
    );
    const wrist = P(ellipsoid(frameAxes(at(wr, [along, 0.006]), along, palmar), 0.0195, 0.012, 0.0152, {
      bone: B(`hand_${s}`), boneA: B(`lowerarm_${s}`), atA: -0.004, bandA: 0.012, name: `wrist_${s}`,
    }));
    // (no elbow or wrist bones showing: an anime arm is a smooth tube)
    void elbowBones; void wristBones;
    const armNode = add(0.008, hardMin(upperarm, forearm), wrist);

    // ---- the hand
    // the palm: a loft from the wrist (its arch, its hollow, the pads; see PALM), and on it the ball of the thumb, the
    // knuckles, and on the back the extensor tendons fanning from the wrist to them
    const handB = B(`hand_${s}`);
    const palmEnd = PALM[PALM.length - 1][0];
    const dorsalH = scale3(palmar, -1);
    const palmParts: Node[] = [
      P(loft(wr, at(wr, [along, palmEnd]), limbSections(PALM, s, 1), {
        bone: handB, boneA: B(`lowerarm_${s}`), atA: 0.003, bandA: 0.01, name: `palm_${s}`,
      }, palmar, [0, palmEnd], true)),
    ];
    const t1 = J(`thumb_01_${s}`), t2 = J(`thumb_02_${s}`);
    const thumbDir = norm(sub3(t2, t1));
    // the ball of the thumb over its metacarpal, moving with it
    palmParts.push(P(ellipsoid(frameAxes(at(t1, [thumbDir, 0.0105], [palmar, 0.007], [along, -0.002]), thumbDir, palmar), 0.0125, 0.019, 0.009, {
      bone: B(`thumb_01_${s}`), boneA: handB, atA: -0.008, bandA: 0.012, name: `thenar_${s}`,
    })));
    const knuckleR: Record<string, number> = { index: 0.005, middle: 0.0052, ring: 0.0048, pinky: 0.0043 };
    const tendons: Node[] = [];
    for (const f of FINGERS) {
      const j1 = J(`${f}_01_${s}`);
      palmParts.push(P(sphere(at(j1, [palmar, -0.0037], [along, -0.0026]), knuckleR[f], {
        ...{ bone: handB }, tag: Tag.Knuckle, claim: 0.6, name: `knuckle_${f}_${s}`,
      })));
      // (a slim hand's tendons just show: from the middle of the wrist's back out to each knuckle)
      const across0 = dot(sub3(j1, wr), thumbward) * 0.3;
      tendons.push(P(roundCone(at(wr, [along, 0.014], [dorsalH, 0.009], [thumbward, across0]), at(j1, [dorsalH, 0.0074], [along, -0.005]), 0.0014, 0.0017, {
        bone: handB, claim: 0.3, name: `palmtendon_${f}_${s}`,
      }, 1.4, 0.8, palmar)));
    }
    // (no tendons on the back of an anime hand)
    void tendons;
    const palm = shared(smooth(0.011, ...palmParts));

    const fingerNodes: Node[] = [];
    for (const f of FINGERS) {
      const j1 = J(`${f}_01_${s}`), j2 = J(`${f}_02_${s}`), j3 = J(`${f}_03_${s}`), j4 = J(`${f}_04_leaf_${s}`);
      const tipDir = norm(sub3(j4, j3));
      const tip = at(j4, [tipDir, 0.004]);
      const r = FINGER_RADII[f];
      const b1 = B(`${f}_01_${s}`), b2 = B(`${f}_02_${s}`), b3 = B(`${f}_03_${s}`);
      // the three bones' skin: a little wider than deep, flatter on the back
      const p1 = P(roundCone(j1, j2, r[0], r[1], { bone: b1, boneA: handB, atA: 0.002, bandA: 0.006, boneB: b2, bandB: 0.0045, name: `${f}1_${s}` }, 1.06, 0.9, palmar));
      const p2 = P(roundCone(j2, j3, r[1], r[2], { bone: b2, boneA: b1, atA: 0, bandA: 0.0045, boneB: b3, bandB: 0.004, name: `${f}2_${s}` }, 1.06, 0.9, palmar));
      const p3 = P(roundCone(j3, tip, r[2], r[3], { bone: b3, boneA: b2, atA: 0, bandA: 0.004, name: `${f}3_${s}` }, 1.08, 0.86, palmar));
      // the pads under each bone: the first's long and soft, the tip's round and full past the nail
      const pad = (a: V3, b: V3, k: number, rr: number, len: number, at0: number, out: number, bone: number) => {
        const d = norm(sub3(b, a));
        const c = at(a, [sub3(b, a), at0], [palmar, rr * out]);
        return P(ellipsoid(frameAxes(c, d, palmar), rr * 0.82, Math.hypot(...sub3(b, a)) * len, rr * 0.7, { bone, claim: 0.5, name: `${f}pad${k}_${s}` }));
      };
      const pads = hardMin(
        pad(j1, j2, 1, r[0], 0.38, 0.55, 0.24, b1),
        pad(j2, j3, 2, r[1], 0.36, 0.5, 0.22, b2),
        pad(j3, tip, 3, r[2], 0.33, 0.58, 0.3, b3),
      );
      const finger = add(0.0045, smooth(0.005, p1, p2, p3), pads);
      fingerNodes.push(addNear(0.007, 0.0025, j1, 0.016, palm, finger));
    }
    {
      const t3 = J(`thumb_03_${s}`), t4 = J(`thumb_04_leaf_${s}`);
      const tip = at(t4, [norm(sub3(t4, t3)), 0.004]);
      const r = FINGER_RADII.thumb;
      const b1 = B(`thumb_01_${s}`), b2 = B(`thumb_02_${s}`), b3 = B(`thumb_03_${s}`);
      const meta = P(roundCone(t1, t2, r[0], r[1], { bone: b1, boneA: handB, atA: 0.004, bandA: 0.01, boneB: b2, bandB: 0.005, name: `thumb1_${s}` }));
      const prox = P(roundCone(t2, t3, r[1], r[2], { bone: b2, boneA: b1, atA: 0, bandA: 0.005, boneB: b3, bandB: 0.0045, name: `thumb2_${s}` }, 1.07, 0.9, palmar));
      const dist = P(roundCone(t3, tip, r[2], r[3], { bone: b3, boneA: b2, atA: 0, bandA: 0.0045, name: `thumb3_${s}` }, 1.12, 0.84, palmar));
      const tdir = norm(sub3(tip, t3));
      const pad = P(ellipsoid(frameAxes(at(t3, [sub3(tip, t3), 0.56], [palmar, 0.0019]), tdir, palmar), 0.0059, 0.008, 0.0048, { bone: b3, claim: 0.5, name: `thumbpad3_${s}` }));
      // the web between the thumb and the index finger, and over it on the back the muscle that fills it
      const indexSide = at(wr, [along, 0.048], [thumbward, 0.018], [dorsalH, 0.0017]);
      const web = P(roundCone(indexSide, at(t2, [dorsalH, 0.001], [thumbDir, -0.0035]), 0.0062, 0.0058, {
        bone: b1, boneA: handB, atA: 0.012, bandA: 0.014, claim: 0.7, name: `thumbweb_${s}`,
      }, 1.35, 0.62, palmar));
      const thumb = add(0.004, add(0.006, smooth(0.0055, meta, prox, dist), web), pad);
      fingerNodes.push(add(0.009, palm, thumb));
    }
    const hand = hardMin(...fingerNodes);
    armOnly[s] = armNode;
    handOnly[s] = add(0.012, wrist, hand);
    arms[s] = add(0.012, armNode, hand);
  }

  // ---------------------------------------------------------------------------------------------- legs and feet
  const legs: Record<string, Node> = {};
  for (const s of SIDES) {
    const m = s === 'l' ? 1 : -1;
    const hip = J(`thigh_${s}`), knee = J(`calf_${s}`), ankle = J(`foot_${s}`), ball = J(`ball_${s}`);
    const inward: V3 = [-m, 0, 0];
    const thighB = B(`thigh_${s}`), calfB = B(`calf_${s}`), footB = B(`foot_${s}`), ballB = B(`ball_${s}`);
    const LT = Math.hypot(...sub3(knee, hip)), LS = Math.hypot(...sub3(ankle, knee));
    const thigh = P(loft(hip, knee, limbSections(THIGH, s, LT), {
      bone: thighB, boneA: B('pelvis'), atA: 0.02, bandA: 0.05, boneB: calfB, atB: LT, bandB: 0.035, name: `thigh_${s}`,
    }, fwd, [0, LT], true));
    const shin = P(loft(knee, ankle, limbSections(SHIN, s, LS), {
      bone: calfB, boneA: thighB, atA: 0.0, bandA: 0.035, boneB: footB, atB: LS - 0.01, bandB: 0.025, name: `shin_${s}`,
    }, fwd, [0, LS], true));
    // the knee: the kneecap, its tendon down to the bump on the shin it pulls on, the fat either side of the tendon
    const kneeParts = P(ellipsoid(worldFrame(at(knee, [up, -0.01], [fwd, 0.031])), 0.016, 0.019, 0.0068, { bone: calfB, boneA: thighB, atA: 0.004, bandA: 0.02, tag: Tag.Knuckle, name: `patella_${s}` }));
    // the ankle bones (the leg's: they stay with it as the foot bends), the inner higher and further forward
    const malM = P(sphere(at(ankle, [inward, 0.0145], [up, -0.006], [fwd, 0.003]), 0.0094, { bone: calfB, boneB: footB, claim: 0.5, name: `malM_${s}` }));
    const malL = P(sphere(at(ankle, [inward, -0.016], [up, -0.015], [fwd, -0.007]), 0.009, { bone: calfB, boneB: footB, claim: 0.5, name: `malL_${s}` }));
    const achilles = P(roundCone(at(ankle, [up, 0.1], [fwd, -0.03]), at(ankle, [up, -0.03], [fwd, -0.04]), 0.0072, 0.009, { bone: calfB, boneB: footB, atB: 0.1, bandB: 0.03, name: `achilles_${s}` }));
    // (no kneecap: an anime knee is smooth; the loft's sections make it)
    void kneeParts;
    const legNode = hardMin(thigh, shin);

    // the foot: a loft from the back of the heel to the ball, its sole flat on the floor, the toes on it
    const heelBack: V3 = at(ankle, [fwd, -0.056], [up, -0.047]);
    const ballFront: V3 = [ball[0], heelBack[1], ball[2] + 0.014];
    const LFt = FOOT[FOOT.length - 1][0];
    const footAxisEnd = at(heelBack, [norm(sub3(ballFront, heelBack)), LFt]);
    const footLoft = P(loft(heelBack, footAxisEnd, limbSections(FOOT, s, 1), {
      bone: footB, boneB: ballB, atB: LFt - 0.004, bandB: 0.012, name: `foot_${s}`,
    }, up));
    const footCore = shared(carve(0.006, add(0.007, add(0.009, footLoft, hardMin(malM, malL)), achilles), P(halfSpace([0, 0, 0], [0, 1, 0], 0.4, { bone: footB, name: `floor_${s}` }))));
    // the toes, from the big one out, side by side and just touching: each from inside the ball of the foot to its tip,
    // the big toe flat with its tip a little up, the others rising a little at their middle knuckle and coming down to
    // their pads on the floor
    const toeNodes: Node[] = [];
    TOES.forEach(([dx, zb, zm, zt, r0, r1, lift], k) => {
      const x = ball[0] - m * dx;
      const base: V3 = [x, 0.016, ball[2] + zb];
      const mid: V3 = [x - m * dx * 0.02, r0 * 0.95 + 0.003 + lift, ball[2] + zm];
      const tip: V3 = [x - m * dx * 0.035, k === 0 ? r1 + 0.0012 : r1 * 0.88 + 0.001, ball[2] + zt];
      const a = P(roundCone(base, mid, r0, r0 * 0.95, { bone: ballB, boneA: footB, atA: 0.004, bandA: 0.008, name: `toe${k}a_${s}` }, 1.1, 0.86, up));
      const b = P(roundCone(mid, tip, r0 * 0.95, r1, { bone: ballB, name: `toe${k}b_${s}` }, 1.1, 0.84, up));
      toeNodes.push(add(0.006, footCore, smooth(0.004, a, b)));
    });
    const foot = hardMin(...toeNodes);
    legOnly[s] = legNode;
    footOnly[s] = foot;
    legs[s] = add(0.024, legNode, foot);
  }

  // ---------------------------------------------------------------------------------------------- the whole
  const tree = hardMin(
    add(0.02, torso, neckHead),
    addNear(0.03, 0.007, shoulderTop.l, 0.11, torso, arms.l),
    addNear(0.03, 0.007, shoulderTop.r, 0.11, torso, arms.r),
    addNear(0.04, 0.012, at(J('thigh_l'), [up, -0.04]), 0.14, torso, legs.l),
    addNear(0.04, 0.012, at(J('thigh_r'), [up, -0.04]), 0.14, torso, legs.r),
  );
  return { tree, torso, legs: { l: legs.l, r: legs.r }, neckHead, armOnly, handOnly, legOnly, footOnly, named, hands };
}

/** A frame for one bone's solid from its joint to the next (the y axis along). */
export const alongBone = (a: V3, b: V3, front: V3 = [0, 0, 1]) => frameAlong(a, b, front);
export const crossV = cross;
