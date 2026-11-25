// Her head, sculpted on its own (docs/V3/plan/character-pv.md §3, the head round of 2026-11-24).
//
// An anime girl's skull as the turnaround draws it (refs/character/turnaround.png): a large round cranium with the
// back of the head swelling well behind the neck, a small face hung under its front — soft round cheeks, a jaw that
// runs in a V from under the ears to a small pointed chin — small ears at the line of the eyes, and a slender neck
// that leaves the skull under its back half. The face is not drawn yet: a mask (maskField) is laid on its smooth
// surface instead; its eyes and mouth are the mask's (game/character/maskMaterial.ts).
//
// Everything is in the Head bone's frame of the bind pose (x her left, y up the head, z out of the face), metres,
// from the Head joint; HEAD holds every number so the head can be turned to the reference a few at a time.

import { type Field, type Node, type Prim, add, compile, ellipsoid, frameAxes, hardMin, prim, roundCone, smooth } from './sdf';
import type { Skeleton } from './skeleton';
import { type V3, add3, norm, qrot, scale3 } from './qmath';

export const HEAD = {
  /** the cranium: its middle (y up, z forward) and half-sizes */
  cranium: { y: 0.12, z: -0.016, rx: 0.081, ry: 0.094, rz: 0.092 },
  /** the back of the head swelling behind the neck */
  occiput: { y: 0.092, z: -0.048, rx: 0.068, ry: 0.07, rz: 0.066 },
  /** the forehead's front, flattening it a little (so the face below it is not a ball) */
  brow: { y: 0.1, z: 0.035, rx: 0.068, ry: 0.06, rz: 0.06 },
  /** soft round cheeks */
  cheeks: { y: 0.043, z: 0.032, rx: 0.053, ry: 0.044, rz: 0.05 },
  /** the jaw: from under each ear down and in to the chin (radius at each end) */
  jaw: { from: [0.047, 0.028, -0.01] as V3, to: [0.0105, -0.0165, 0.05] as V3, r1: 0.016, r2: 0.0085 },
  /** a small pointed chin */
  chin: { y: -0.0175, z: 0.052, rx: 0.0115, ry: 0.0105, rz: 0.011 },
  /** under the jaw, between the jaw and the neck */
  underJaw: { y: 0.006, z: 0.014, rx: 0.04, ry: 0.026, rz: 0.04 },
  /** a small nose (under the mask) */
  nose: { y: 0.036, z: 0.079, rx: 0.0045, ry: 0.01, rz: 0.006 },
  /** small ears at the line of the eyes, a little back */
  ear: { x: 0.073, y: 0.056, z: -0.006, rx: 0.0065, ry: 0.0175, rz: 0.0115 },
  /** the neck: its radius at the shoulders and under the skull, how far back under the skull it meets it */
  neck: { r1: 0.036, r2: 0.0305, topY: 0.022, topZ: -0.02 },
  /** the eyes (the mask's eyes; the first-person eye is between them, a little in) */
  eye: { x: 0.029, y: 0.056, z: 0.073 },
  /** the mask: laid this far off the face, this thick; its outline an oval (middle y, half-width, half-height) cut square at the back */
  mask: { off: 0.0028, thick: 0.0022, y: 0.052, ax: 0.057, ay: 0.074, back: 0.008 },
};

export interface HeadSculpt {
  /** the neck and the head (skull, face, ears) */
  neckHead: Node;
  /** the neck alone, up into where the head would be (what goes into a helmet) */
  neckOnly: Node;
  /** the face's smooth surface (cranium, cheeks, jaw, chin: no nose, no ears): the mask is laid on it */
  face: Node;
  /** the Head bone's frame (bind pose): its origin and axes */
  o: V3;
  x: V3;
  y: V3;
  z: V3;
  /** a point in the head's frame, in the world (bind pose) */
  H: (x: number, y: number, z: number) => V3;
  named: Record<string, Prim>;
}

export function sculptHead(sk: Skeleton): HeadSculpt {
  const J = (n: string): V3 => sk.bindPos[sk.index[n]];
  const B = (n: string): number => sk.index[n];
  const q = sk.bindRot[sk.index.Head];
  const o = J('Head');
  const x = qrot(q, [1, 0, 0]), y = qrot(q, [0, 1, 0]), z = qrot(q, [0, 0, 1]);
  const H = (a: number, b: number, c: number): V3 => add3(add3(add3(o, scale3(x, a)), scale3(y, b)), scale3(z, c));
  const named: Record<string, Prim> = {};
  const P = (p: Prim): Node => {
    if (p.name) named[p.name] = p;
    return prim(p);
  };
  const HB = { bone: B('Head') };
  const F = (c: V3) => frameAxes(c, y, z);
  const E = (name: string, s: { y: number; z: number; rx: number; ry: number; rz: number }, xo = 0) =>
    P(ellipsoid(F(H(xo, s.y, s.z)), s.rx, s.ry, s.rz, { ...HB, name }));
  const h = HEAD;

  const cranium = E('cranium', h.cranium);
  const occiput = E('occiput', h.occiput);
  const brow = E('brow', h.brow);
  const cheeks = E('cheeks', h.cheeks);
  const underJaw = E('underjaw', h.underJaw);
  const chin = E('chin', h.chin);
  const jawParts: Node[] = [];
  for (const m of [1, -1]) {
    const a = h.jaw.from, b = h.jaw.to;
    jawParts.push(P(roundCone(H(m * a[0], a[1], a[2]), H(m * b[0], b[1], b[2]), h.jaw.r1, h.jaw.r2, { ...HB, name: `jaw_${m > 0 ? 'l' : 'r'}` })));
  }
  const skull = smooth(0.03, cranium, occiput, brow);
  const lower = smooth(0.016, ...jawParts, chin);
  const face = smooth(0.022, smooth(0.024, skull, cheeks, underJaw), lower);
  const nose = P(ellipsoid(frameAxes(H(0, h.nose.y, h.nose.z), norm(add3(y, scale3(z, -0.3))), z), h.nose.rx, h.nose.ry, h.nose.rz, { ...HB, name: 'nose' }));
  const ears: Node[] = [];
  for (const m of [1, -1]) {
    const e = h.ear;
    ears.push(P(ellipsoid(frameAxes(H(m * e.x, e.y, e.z), norm(add3(y, scale3(z, -0.25))), norm([m * x[0] + 0.3 * z[0], m * x[1] + 0.3 * z[1], m * x[2] + 0.3 * z[2]])), e.rx, e.ry, e.rz, { ...HB, name: `ear_${m > 0 ? 'l' : 'r'}` })));
  }
  const headNode = add(0.004, add(0.006, face, nose), hardMin(...ears));
  const neckTop = H(0, h.neck.topY, h.neck.topZ);
  const neckBottom = add3(J('neck_01'), [0, -0.03, -0.004]);
  const neck = P(roundCone(neckBottom, neckTop, h.neck.r1, h.neck.r2, {
    bone: B('neck_01'), boneA: B('spine_03'), atA: 0.0, bandA: 0.03, boneB: B('Head'), atB: 0.075, bandB: 0.02, name: 'neck',
  }, 1.0, 0.94));
  const neckHead = add(0.018, neck, headNode);
  // the neck alone, a little longer (its top hidden in the helmet)
  const neckUp = P(roundCone(neckBottom, H(0, h.neck.topY + 0.03, h.neck.topZ + 0.004), h.neck.r1, h.neck.r2 * 0.96, {
    bone: B('neck_01'), boneA: B('spine_03'), atA: 0.0, bandA: 0.03, boneB: B('Head'), atB: 0.075, bandB: 0.02, name: 'neck_up',
  }, 1.0, 0.94));
  return { neckHead, neckOnly: neckUp, face, o, x, y, z, H, named };
}

/**
 * The mask: a thin shell laid on the face (off its smooth surface by mask.off), inside an oval outline seen from the
 * front, the half of the head behind mask.back cut off. A field like any other (polygonize it on its own, finely).
 */
export function maskField(hs: HeadSculpt): Field {
  const f = compile(hs.face, 0.02);
  const m = HEAD.mask;
  const { o, x, y, z } = hs;
  return (px, py, pz) => {
    const wx = px - o[0], wy = py - o[1], wz = pz - o[2];
    const lx = wx * x[0] + wy * x[1] + wz * x[2];
    const ly = wx * y[0] + wy * y[1] + wz * y[2];
    const lz = wx * z[0] + wy * z[1] + wz * z[2];
    const d = f(px, py, pz);
    const shell = Math.abs(d - m.off - m.thick / 2) - m.thick / 2;
    const ex = lx / m.ax, ey = (ly - m.y) / m.ay;
    const oval = (Math.sqrt(ex * ex + ey * ey) - 1) * Math.min(m.ax, m.ay);
    return Math.max(shell, oval, m.back - lz);
  };
}

/** Where on the mask a point is (its x and y in the head's frame): for drawing its eyes and mouth. */
export function headLocal(hs: HeadSculpt, p: ArrayLike<number>, i: number): [number, number, number] {
  const { o, x, y, z } = hs;
  const wx = p[i] - o[0], wy = p[i + 1] - o[1], wz = p[i + 2] - o[2];
  return [wx * x[0] + wy * x[1] + wz * x[2], wx * y[0] + wy * y[1] + wz * y[2], wx * z[0] + wy * z[1] + wz * z[2]];
}
