// Her bones (docs/V3/plan/character-pv.md §2).
//
// The skeleton is Painted Valley's starter man's — the Universal Animation Library's — joint for joint: the same
// names, the same parents, the same rest frames (each bone's own axes in the T-pose he was rigged in, every bone
// along its own +y). Only the lengths are hers. A clip made for him sets each bone's rotation in its own frame, so
// played on her it bends her joints by the same angles: his walk is her walk, at her size.
//
// She is not modelled in the T-pose but in an A-pose (arms down and a little forward, fingers easy), which bends
// her shoulders less in the poses she spends her time in; the bind pose is that, the rest frames stay his.
//
// Extra bones of hers, after his: the forearm and upper-arm twist bones (the twist of the hand shared along the
// forearm so the wrist does not wring like a sweet wrapper), driven after the clips, which know nothing of them.

import { type Q, type V3, add3, compose, len3, norm, qaxis, qconj, qmirror, qmul, qnorm, qrot, sub3 } from './qmath';

/** Painted Valley's rest skeleton (CC0): name, parent, local offset, local rotation. */
export const PV_JOINTS: [string, string | null, V3, Q][] = [
  ['root', null, [0, 0, 0], [-0.7071, 0, 0, 0.7071]],
  ['pelvis', 'root', [0, 0.0537, 0.9829], [0.7905, 0, 0, 0.6125]],
  ['spine_01', 'pelvis', [0, 0.116, -0.0011], [-0.0647, 0, 0, 0.9979]],
  ['spine_02', 'spine_01', [0, 0.1383, 0], [-0.0773, 0, 0, 0.997]],
  ['spine_03', 'spine_02', [0, 0.1576, 0], [-0.0003, 0, 0, 1]],
  ['neck_01', 'spine_03', [0, 0.1928, 0], [0.111, 0, 0, 0.9938]],
  ['Head', 'neck_01', [0, 0.1037, 0], [-0.0787, 0, 0, 0.9969]],
  ['clavicle_l', 'spine_03', [0.0237, 0.1171, 0.0203], [-0.604, -0.3451, -0.3567, 0.6236]],
  ['upperarm_l', 'clavicle_l', [0.0172, 0.1827, 0.0009], [0.1803, 0.6839, -0.1798, 0.6837]],
  ['lowerarm_l', 'upperarm_l', [0, 0.2639, 0], [0.0172, 0, 0, 0.9999]],
  ['hand_l', 'lowerarm_l', [0, 0.2692, 0], [-0.0086, 0, 0, 1]],
  ['index_01_l', 'hand_l', [0.0052, 0.1152, 0.0342], [0, 0.7071, 0, 0.7071]],
  ['index_02_l', 'index_01_l', [0, 0.0294, 0], [0, 0, 0, 1]],
  ['index_03_l', 'index_02_l', [0, 0.0266, 0], [0, 0, 0, 1]],
  ['index_04_leaf_l', 'index_03_l', [0, 0.0297, 0], [0, 1, 0, 0]],
  ['middle_01_l', 'hand_l', [-0.0004, 0.1157, 0.0049], [-0.0167, 0.7069, -0.0167, 0.7069]],
  ['middle_02_l', 'middle_01_l', [0, 0.0387, 0], [0, 0, 0.0015, 1]],
  ['middle_03_l', 'middle_02_l', [0, 0.0307, 0], [0, 0, -0.0011, 1]],
  ['middle_04_leaf_l', 'middle_03_l', [0, 0.0303, 0], [0, 1, 0, 0]],
  ['pinky_01_l', 'hand_l', [0.0049, 0.0999, -0.0387], [-0.0237, 0.7067, -0.0237, 0.7067]],
  ['pinky_02_l', 'pinky_01_l', [0, 0.024, 0], [0, 0, -0.0008, 1]],
  ['pinky_03_l', 'pinky_02_l', [0, 0.0177, 0], [0, 0, 0.0006, 1]],
  ['pinky_04_leaf_l', 'pinky_03_l', [0, 0.0224, 0], [0, 1, 0, 0]],
  ['ring_01_l', 'hand_l', [-0.001, 0.1097, -0.0173], [-0.0126, 0.707, -0.0126, 0.707]],
  ['ring_02_l', 'ring_01_l', [0, 0.0339, 0], [0, 0, 0, 1]],
  ['ring_03_l', 'ring_02_l', [0, 0.028, 0], [0, 0, -0.0011, 1]],
  ['ring_04_leaf_l', 'ring_03_l', [0, 0.0299, 0], [0, 1, 0, 0]],
  ['thumb_01_l', 'hand_l', [0.0036, 0.0415, 0.0293], [0.2474, 0.9458, 0.2034, 0.0536]],
  ['thumb_02_l', 'thumb_01_l', [0, 0.035, 0], [-0.0001, -0.0001, 0, 1]],
  ['thumb_03_l', 'thumb_02_l', [0, 0.0415, 0], [0.0002, 0.0001, -0.0005, 1]],
  ['thumb_04_leaf_l', 'thumb_03_l', [0, 0.0311, 0], [0, 0.5062, 0, 0.8624]],
  ['clavicle_r', 'spine_03', [-0.0237, 0.1171, 0.0203], [-0.604, 0.3451, 0.3567, 0.6236]],
  ['upperarm_r', 'clavicle_r', [-0.0172, 0.1827, 0.0009], [0.1803, -0.6839, 0.1798, 0.6837]],
  ['lowerarm_r', 'upperarm_r', [0, 0.2639, 0], [0.0172, 0, 0, 0.9999]],
  ['hand_r', 'lowerarm_r', [0, 0.2692, 0], [-0.0086, 0, 0, 1]],
  ['index_01_r', 'hand_r', [-0.0052, 0.1152, 0.0342], [0, -0.7071, 0, 0.7071]],
  ['index_02_r', 'index_01_r', [0, 0.0294, 0], [0, 0, 0, 1]],
  ['index_03_r', 'index_02_r', [0, 0.0266, 0], [0, 0, 0, 1]],
  ['index_04_leaf_r', 'index_03_r', [0, 0.0297, 0], [0, -1, 0, 0]],
  ['middle_01_r', 'hand_r', [0.0004, 0.1157, 0.0049], [-0.0167, -0.7069, 0.0167, 0.7069]],
  ['middle_02_r', 'middle_01_r', [0, 0.0387, 0], [0, 0, -0.0015, 1]],
  ['middle_03_r', 'middle_02_r', [0, 0.0307, 0], [0, 0, 0.0011, 1]],
  ['middle_04_leaf_r', 'middle_03_r', [0, 0.0303, 0], [0, -1, 0, 0]],
  ['pinky_01_r', 'hand_r', [-0.0049, 0.0999, -0.0387], [-0.0237, -0.7067, 0.0237, 0.7067]],
  ['pinky_02_r', 'pinky_01_r', [0, 0.024, 0], [0, 0, 0.0008, 1]],
  ['pinky_03_r', 'pinky_02_r', [0, 0.0177, 0], [0, 0, -0.0006, 1]],
  ['pinky_04_leaf_r', 'pinky_03_r', [0, 0.0224, 0], [0, -1, 0, 0]],
  ['ring_01_r', 'hand_r', [0.001, 0.1097, -0.0173], [-0.0126, -0.707, 0.0126, 0.707]],
  ['ring_02_r', 'ring_01_r', [0, 0.0339, 0], [0, 0, 0, 1]],
  ['ring_03_r', 'ring_02_r', [0, 0.028, 0], [0, 0, 0.0011, 1]],
  ['ring_04_leaf_r', 'ring_03_r', [0, 0.0299, 0], [0, -1, 0, 0]],
  ['thumb_01_r', 'hand_r', [-0.0036, 0.0415, 0.0293], [0.2474, -0.9458, -0.2034, 0.0536]],
  ['thumb_02_r', 'thumb_01_r', [0, 0.035, 0], [-0.0001, 0.0001, 0, 1]],
  ['thumb_03_r', 'thumb_02_r', [0, 0.0415, 0], [0.0002, -0.0001, 0.0005, 1]],
  ['thumb_04_leaf_r', 'thumb_03_r', [0, 0.0311, 0], [0, -0.5062, 0, 0.8624]],
  ['thigh_l', 'pelvis', [0.113, 0.0285, 0.0442], [0.9925, 0, 0, 0.1224]],
  ['calf_l', 'thigh_l', [0, 0.454, 0], [0.0366, -0.0001, 0, 0.9993]],
  ['foot_l', 'calf_l', [0, 0.4544, 0], [-0.5291, -0.0003, 0.0003, 0.8486]],
  ['ball_l', 'foot_l', [0.0029, 0.1479, -0.0108], [0.0001, -0.9643, 0.2648, 0.0005]],
  ['ball_leaf_l', 'ball_l', [0.0043, 0.0747, 0.0061], [0, 0, 0, 1]],
  ['thigh_r', 'pelvis', [-0.113, 0.0285, 0.0442], [0.9925, 0, 0, 0.1224]],
  ['calf_r', 'thigh_r', [0, 0.454, 0], [0.0366, -0.0001, 0, 0.9993]],
  ['foot_r', 'calf_r', [0, 0.4544, 0], [-0.5291, -0.0003, 0.0003, 0.8486]],
  ['ball_r', 'foot_r', [-0.0029, 0.1479, -0.0108], [0.0001, -0.9643, 0.2648, 0.0005]],
  ['ball_leaf_r', 'ball_r', [-0.0043, 0.0747, 0.0061], [0, 0, 0, 1]],
];

/** Her proportions. Lengths in metres; every one of them may be changed and the body regrown from them. */
export interface Proportions {
  /** pelvis bone above the floor (and how far behind the ankle line) */
  pelvisY: number;
  pelvisZ: number;
  /** the hip joints: half the width between them, height above the pelvis bone, forward of it */
  hipHalf: number;
  hipUp: number;
  hipFwd: number;
  thigh: number;
  calf: number;
  /** ankle to the ball of the foot, ball to the toes' tips */
  foot: number;
  toes: number;
  /** pelvis → spine_01 → spine_02 → spine_03 → neck_01 → Head */
  spine: [number, number, number, number, number];
  /** the collarbone's root off the spine (half-width, up, forward) and its length */
  clavRoot: V3;
  clavicle: number;
  upperarm: number;
  lowerarm: number;
  /** knuckles in the hand's frame (x palm-ward, y along the hand, z thumb-ward), and each finger's three bones */
  knuckles: Record<'index' | 'middle' | 'ring' | 'pinky' | 'thumb', V3>;
  fingers: Record<'index' | 'middle' | 'ring' | 'pinky' | 'thumb', [number, number, number]>;
}

/** The girl of the turnaround: about 1.63 m to the crown, six and a half heads, legs long, shoulders narrow. */
export const HER: Proportions = {
  pelvisY: 0.862,
  pelvisZ: -0.03,
  hipHalf: 0.079,
  hipUp: 0.012,
  hipFwd: 0.03,
  thigh: 0.405,
  calf: 0.388,
  // (small feet, as the turnaround draws them: 21 cm)
  foot: 0.116,
  toes: 0.043,
  // (the neck short and the head low on it, as the turnaround draws her: eyes 1.44 m, chin 1.36 m)
  spine: [0.092, 0.11, 0.122, 0.12, 0.078],
  clavRoot: [0.016, 0.09, 0.018],
  // (her shoulders 31 cm across the deltoids, as the turnaround draws them: an anime girl's, narrow and sloping)
  clavicle: 0.122,
  upperarm: 0.252,
  lowerarm: 0.228,
  // (a small hand, as the turnaround draws it: 15 cm from the wrist to the middle finger's tip, 6.5 across the
  // knuckles; the knuckles in an arc, the middle finger's furthest; each finger's bones in a real hand's proportions,
  // the first longest, about 1 : 0.6 : 0.42, not the even thirds a rig's are often given)
  knuckles: {
    index: [0.003, 0.073, 0.0224],
    middle: [0.0005, 0.075, 0.0053],
    ring: [0.0013, 0.0718, -0.0108],
    pinky: [0.0041, 0.0654, -0.0256],
    thumb: [0.0073, 0.024, 0.0168],
  },
  fingers: {
    index: [0.032, 0.018, 0.0138],
    middle: [0.0353, 0.0215, 0.0146],
    ring: [0.0336, 0.0207, 0.0146],
    pinky: [0.0258, 0.0146, 0.0129],
    thumb: [0.0345, 0.025, 0.018],
  },
};

export interface Skeleton {
  names: string[];
  parents: number[];
  index: Record<string, number>;
  /** local offsets (hers) and rest rotations (Painted Valley's): the frames the clips are written in */
  t: V3[];
  rest: Q[];
  /** the pose she is modelled in: local rotations */
  bind: Q[];
  /** world positions and rotations in the bind pose */
  bindPos: V3[];
  bindRot: Q[];
  /** world positions and rotations in the rest (T) pose */
  restPos: V3[];
  restRot: Q[];
  /** the eye point's height in the bind pose, and where the eyes are in the head's frame */
  eyeLocal: V3;
  eyeHeight: number;
}

/** Extra bones: [name, parent, the bone whose twist it shares] */
export const TWIST_BONES: [string, string][] = [
  ['lowerarm_twist_l', 'lowerarm_l'],
  ['lowerarm_twist_r', 'lowerarm_r'],
  ['upperarm_twist_l', 'upperarm_l'],
  ['upperarm_twist_r', 'upperarm_r'],
];

const SIDES = ['l', 'r'] as const;

export function buildSkeleton(p: Proportions = HER): Skeleton {
  const names: string[] = [];
  const parents: number[] = [];
  const index: Record<string, number> = {};
  const t: V3[] = [];
  const rest: Q[] = [];
  for (const [name, parent, pvT, pvR] of PV_JOINTS) {
    index[name] = names.length;
    names.push(name);
    parents.push(parent ? index[parent] : -1);
    t.push([pvT[0], pvT[1], pvT[2]]);
    rest.push(qnorm(pvR));
  }
  for (const [name, parent] of TWIST_BONES) {
    index[name] = names.length;
    names.push(name);
    parents.push(index[parent]);
    t.push([0, 0, 0]);
    rest.push([0, 0, 0, 1]);
  }
  const n = names.length;

  // world rotations of the rest pose (lengths do not touch them)
  const restRot: Q[] = new Array(n);
  for (let i = 0; i < n; i++) restRot[i] = parents[i] < 0 ? rest[i] : qmul(restRot[parents[i]], rest[i]);

  // lengths: a chain bone keeps his direction and takes her length; a branch (a bone sitting off its parent's
  // axis) is placed where hers is, given in the parent's frame or in the world
  const setLen = (name: string, L: number) => {
    const i = index[name];
    const d = norm(t[i]);
    t[i] = [d[0] * L, d[1] * L, d[2] * L];
  };
  const setWorldOffset = (name: string, worldDelta: V3) => {
    const i = index[name];
    t[i] = qrot(qconj(restRot[parents[i]]), worldDelta);
  };
  setWorldOffset('pelvis', [0, p.pelvisY, p.pelvisZ]);
  const names5 = ['spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head'];
  names5.forEach((nm, k) => setLen(nm, p.spine[k]));
  for (const s of SIDES) {
    const m = s === 'l' ? 1 : -1;
    setWorldOffset(`thigh_${s}`, [m * p.hipHalf, p.hipUp, p.hipFwd]);
    setLen(`calf_${s}`, p.thigh);
    setLen(`foot_${s}`, p.calf);
    setLen(`ball_${s}`, p.foot);
    setLen(`ball_leaf_${s}`, p.toes);
    setWorldOffset(`clavicle_${s}`, [m * p.clavRoot[0], p.clavRoot[1], p.clavRoot[2]]);
    setLen(`upperarm_${s}`, p.clavicle);
    setLen(`lowerarm_${s}`, p.upperarm);
    setLen(`hand_${s}`, p.lowerarm);
    for (const f of ['index', 'middle', 'ring', 'pinky', 'thumb'] as const) {
      const k = p.knuckles[f];
      // the hand's frame: x palm-ward, y along, z thumb-ward; mirrored on the right, the thumb-ward axis flips with x
      t[index[`${f}_01_${s}`]] = [m * k[0], k[1], k[2]];
      const L = p.fingers[f];
      setLen(`${f}_02_${s}`, L[0]);
      setLen(`${f}_03_${s}`, L[1]);
      setLen(`${f}_04_leaf_${s}`, L[2]);
    }
  }
  // the twist bones sit halfway down the forearm and the upper arm
  for (const s of SIDES) {
    t[index[`lowerarm_twist_${s}`]] = [0, p.lowerarm * 0.5, 0];
    t[index[`upperarm_twist_${s}`]] = [0, p.upperarm * 0.5, 0];
  }

  const restPos: V3[] = new Array(n);
  for (let i = 0; i < n; i++) restPos[i] = parents[i] < 0 ? t[i] : add3(restPos[parents[i]], qrot(restRot[parents[i]], t[i]));

  // --- the bind pose: world-space turns on the rest pose, left side given, the right its mirror
  const bind = rest.map((q) => [q[0], q[1], q[2], q[3]] as Q);
  const bindTurn: Record<string, Q> = {
    // arms down to about 45° below level and a little forward
    upperarm_l: qmul(qaxis([0, 1, 0], -0.16), qaxis([0, 0, 1], -0.78)),
    // the elbow eased, the palm turned a little toward the thigh
    lowerarm_l: qaxis([0, 1, 0], -0.12),
    hand_l: qaxis([0, 0, 1], -0.06),
  };
  // fingers: an easy curl and a little fan, applied in each finger's own frame below
  const worldRot: Q[] = new Array(n);
  const worldPos: V3[] = new Array(n);
  const applyBind = () => {
    for (let i = 0; i < n; i++) {
      const parent = parents[i];
      const pr = parent < 0 ? ([0, 0, 0, 1] as Q) : worldRot[parent];
      worldRot[i] = qmul(pr, bind[i]);
      worldPos[i] = parent < 0 ? t[i] : add3(worldPos[parent], qrot(pr, t[i]));
    }
  };
  applyBind();
  // turns are applied root-down so each is a world turn of the bone as it stands then
  const order = Object.keys(bindTurn);
  for (const name of order) {
    for (const s of SIDES) {
      const nm = name.replace(/_l$/, `_${s}`);
      const turn = s === 'l' ? bindTurn[name] : qmirror(bindTurn[name]);
      const i = index[nm];
      const pr = parents[i] < 0 ? ([0, 0, 0, 1] as Q) : worldRot[parents[i]];
      const w = qmul(turn, worldRot[i]);
      bind[i] = qmul(qconj(pr), w);
      applyBind();
    }
  }
  // fingers curled a little at every joint (about the axis across the finger, palm-ward), the thumb toward the palm
  for (const s of SIDES) {
    const hand = index[`hand_${s}`];
    // the left hand's +x looks out of the palm; the right's frame is the left's mirror image, its +x out of the back
    const palmar = qrot(worldRot[hand], [s === 'l' ? 1 : -1, 0, 0]);
    const fan: Record<string, number> = { index: 0.07, middle: 0.0, ring: -0.06, pinky: -0.13 };
    for (const f of ['index', 'middle', 'ring', 'pinky']) {
      const curls = [0.12, 0.16, 0.1];
      for (let k = 0; k < 3; k++) {
        const i = index[`${f}_0${k + 1}_${s}`];
        const along = norm(sub3(worldPos[index[k < 2 ? `${f}_0${k + 2}_${s}` : `${f}_04_leaf_${s}`]], worldPos[i]));
        const across = norm(crossv(along, palmar));
        let turn = qaxis(across, curls[k]);
        if (k === 0) {
          // the fan: about the palm's normal, away from the middle finger
          const thumbward = qrot(worldRot[hand], [0, 0, 1]);
          turn = qmul(qaxis(palmar, fan[f] * (dotv(crossv(palmar, along), thumbward) > 0 ? 1 : -1)), turn);
        }
        const pr = worldRot[parents[i]];
        bind[i] = qmul(qconj(pr), qmul(turn, worldRot[i]));
        applyBind();
      }
    }
  }

  // the eyes: between them, in the head's frame (forward of and above the Head bone)
  const eyeLocal: V3 = [0, 0.056, 0.066];
  const head = index.Head;
  const eyeW = add3(worldPos[head], qrot(worldRot[head], eyeLocal));
  return {
    names, parents, index, t, rest, bind,
    bindPos: worldPos.map((v) => [v[0], v[1], v[2]] as V3),
    bindRot: worldRot.map((q) => [q[0], q[1], q[2], q[3]] as Q),
    restPos, restRot, eyeLocal, eyeHeight: eyeW[1],
  };
}

const crossv = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dotv = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** World matrices (column-major) of a pose given as local rotations, with the skeleton's offsets. */
export function worldMatrices(sk: Skeleton, local: Q[], rootPos: V3 = [0, 0, 0]): Float64Array[] {
  const n = sk.names.length;
  const rot: Q[] = new Array(n);
  const pos: V3[] = new Array(n);
  const out: Float64Array[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = sk.parents[i];
    if (p < 0) {
      rot[i] = local[i];
      pos[i] = add3(rootPos, sk.t[i]);
    } else {
      rot[i] = qmul(rot[p], local[i]);
      pos[i] = add3(pos[p], qrot(rot[p], sk.t[i]));
    }
    out[i] = compose(rot[i], pos[i], new Float64Array(16)) as Float64Array;
  }
  return out;
}

/** Bone length to its first child (for drawing and checks). */
export function boneLength(sk: Skeleton, name: string): number {
  const i = sk.index[name];
  const c = sk.parents.indexOf(i);
  return c < 0 ? 0 : len3(sk.t[c]);
}
