// Her fingers (docs/V3/plan/character-pv.md §5, §6): a library of grips, each a curl for every joint of every finger
// and the thumb's turn toward the palm, set from the pose she was modelled in about axes measured on her own hand
// (across each finger, palm-ward), blended in and out over a tenth of a second or so. The clips' own fingers (a loose
// fist walking) are what a grip at weight 0 leaves.

import { FINGER_RADII } from '../../core/character/body';
import * as THREE from 'three';
import type { HerRig } from './her';

export type GripName = 'open' | 'relaxed' | 'loose' | 'fist' | 'wheel' | 'bar' | 'bottle' | 'cup' | 'pinch' | 'point' | 'hook' | 'flat' | 'press' | 'phone' | 'ball';

/** [knuckle, middle, last] curl a finger (radians), and its fan (+ away from the middle finger). */
type F = [number, number, number, number];
/** thumb: [turn across the palm, root bend, middle bend, last bend] */
type T = [number, number, number, number];
export interface Grip { index: F; middle: F; ring: F; pinky: F; thumb: T }

const g = (index: F, middle: F, ring: F, pinky: F, thumb: T): Grip => ({ index, middle, ring, pinky, thumb });

/** The grips (her bind pose already has an easy curl of about 0.12/0.16/0.1 and a slight fan). */
export const GRIPS: Record<GripName, Grip> = {
  open: g([-0.1, -0.12, -0.08, 0.06], [-0.1, -0.12, -0.08, 0], [-0.08, -0.1, -0.06, 0.04], [-0.06, -0.08, -0.04, 0.1], [-0.15, 0, -0.05, -0.05]),
  relaxed: g([0.1, 0.2, 0.12, 0], [0.15, 0.25, 0.14, 0], [0.2, 0.3, 0.17, 0], [0.26, 0.34, 0.2, 0.02], [0.1, 0.08, 0.1, 0.1]),
  loose: g([0.45, 0.6, 0.35, -0.02], [0.55, 0.7, 0.4, 0], [0.62, 0.78, 0.45, 0], [0.7, 0.85, 0.5, 0], [0.3, 0.15, 0.2, 0.2]),
  fist: g([1.42, 1.78, 1.0, -0.04], [1.48, 1.82, 1.0, 0], [1.52, 1.82, 0.98, 0.02], [1.55, 1.78, 0.95, 0.05], [0.95, 0.45, 0.55, 0.6]),
  // a rim of 3 cm: fingers round it, the thumb along its far side
  wheel: g([1.05, 1.25, 0.65, -0.03], [1.1, 1.3, 0.65, 0], [1.12, 1.32, 0.66, 0.01], [1.15, 1.3, 0.6, 0.03], [0.55, 0.2, 0.3, 0.35]),
  // a bar or handle of 2.5–3 cm (a pan, a jerry can's grip, a lever)
  bar: g([1.15, 1.35, 0.7, -0.03], [1.2, 1.4, 0.7, 0], [1.22, 1.4, 0.7, 0.01], [1.25, 1.38, 0.66, 0.03], [0.65, 0.25, 0.35, 0.4]),
  // a bottle or can of 6–7 cm: round it, the thumb opposite
  bottle: g([0.62, 0.85, 0.45, -0.02], [0.66, 0.9, 0.45, 0], [0.7, 0.92, 0.46, 0.02], [0.76, 0.95, 0.46, 0.05], [0.7, 0.05, 0.2, 0.25]),
  // a mug's handle through the fingers
  cup: g([0.95, 1.2, 0.6, -0.02], [1.0, 1.25, 0.6, 0], [1.25, 1.45, 0.7, 0.02], [1.3, 1.45, 0.7, 0.04], [0.45, 0.15, 0.25, 0.4]),
  // a small thing between thumb and finger: the index and thumb tips meet
  pinch: g([0.55, 0.72, 0.38, 0.04], [0.75, 1.0, 0.55, 0], [0.95, 1.15, 0.6, 0], [1.05, 1.2, 0.62, 0.04], [0.85, 0.2, 0.25, 0.3]),
  point: g([0.02, 0.04, 0.02, 0.02], [1.35, 1.55, 0.85, 0], [1.4, 1.55, 0.85, 0.02], [1.42, 1.5, 0.8, 0.04], [0.65, 0.3, 0.4, 0.5]),
  // carrying by a handle: four fingers hooked, the thumb loose
  hook: g([1.0, 1.35, 0.75, -0.02], [1.05, 1.4, 0.75, 0], [1.08, 1.42, 0.75, 0.01], [1.1, 1.4, 0.72, 0.03], [0.2, 0.15, 0.2, 0.15]),
  // a hand laid flat on something (a box's side, a panel)
  flat: g([-0.06, -0.04, -0.02, 0.03], [-0.06, -0.04, -0.02, 0], [-0.05, -0.04, -0.02, 0.02], [-0.04, -0.03, -0.02, 0.05], [-0.05, 0.05, 0.05, 0.05]),
  // pressing a button with the index
  press: g([0.25, 0.25, 0.1, 0.02], [1.1, 1.3, 0.7, 0], [1.2, 1.4, 0.7, 0.02], [1.25, 1.4, 0.7, 0.04], [0.55, 0.25, 0.3, 0.35]),
  // a phone, a camera, a card: flat thing held between the fingers and the thumb
  phone: g([0.55, 0.45, 0.25, 0.02], [0.6, 0.5, 0.25, 0], [0.65, 0.55, 0.28, 0.02], [0.75, 0.6, 0.3, 0.04], [0.5, 0.0, 0.1, 0.1]),
  // a ball or a fruit cupped
  ball: g([0.42, 0.55, 0.35, 0.05], [0.45, 0.6, 0.35, 0], [0.5, 0.62, 0.36, 0.03], [0.56, 0.66, 0.36, 0.07], [0.55, 0.05, 0.15, 0.2]),
};

interface Joint { bone: THREE.Bone; bind: THREE.Quaternion; curl: THREE.Vector3; fan: THREE.Vector3; oppose: THREE.Vector3; next: THREE.Object3D }

/**
 * Something the fingers close round (render space): a cylinder (a handlebar's grip, a wheel's rim, a bottle, a
 * handle) about its axis through `c`, or a ball. Each finger joint then closes from open until that bone touches it,
 * the knuckle first, then the middle, then the last (as a hand closes on a thing): the fingers lie on its surface.
 */
export interface Hold { kind: 'cyl' | 'ball'; c: THREE.Vector3; axis?: THREE.Vector3; r: number }

/** her fingers' radii as they were sculpted (body.ts): at the knuckle, the middle joint, the last joint, the tip; the thumb's from its root */
// (her fingers' radii as she is sculpted: core/character/body.ts)
const FINGER_R: Record<string, readonly number[]> = FINGER_RADII;
/** how far each joint may close (and open) */
const CURL_LO = [-0.12, 0, 0];
const CURL_HI = [1.6, 1.95, 1.35];
const THUMB_LO = [-0.3, -0.1, -0.1];
const THUMB_HI = [1.3, 1.0, 1.2];
/** where in the closing each joint starts to turn (0: at once): the knuckle first */
const LEAD = [0, 0.18, 0.32];

export class Hands {
  private readonly joints: Record<'l' | 'r', Record<string, Joint[]>> = { l: {}, r: {} };
  /** the grip each hand is going to and how far it has got, and its weight over the clip's own fingers */
  readonly state: Record<'l' | 'r', { from: Grip; to: Grip; t: number; rate: number; weight: number; want: number }>;

  constructor(readonly rig: HerRig) {
    const root = rig.root;
    // measure on the bind pose
    const saved = rig.skeleton.bones.map((b) => b.quaternion.clone());
    for (const b of rig.skeleton.bones) b.quaternion.copy(rig.bind[b.name]);
    root.updateMatrixWorld(true);
    for (const s of ['l', 'r'] as const) {
      const hand = rig.bones[`hand_${s}`];
      const hq = hand.getWorldQuaternion(new THREE.Quaternion());
      const palmar = new THREE.Vector3(s === 'l' ? 1 : -1, 0, 0).applyQuaternion(hq);
      const thumbward = new THREE.Vector3(0, 0, 1).applyQuaternion(hq);
      const along = new THREE.Vector3(0, 1, 0).applyQuaternion(hq);
      // the thumb's pad faces the index finger and the palm, not the palm's front: it bends across the palm
      const thumbPad = palmar.clone().multiplyScalar(0.55).addScaledVector(thumbward, -0.85).normalize();
      for (const f of ['index', 'middle', 'ring', 'pinky', 'thumb']) {
        const list: Joint[] = [];
        for (let k = 1; k <= 3; k++) {
          const bone = rig.bones[`${f}_0${k}_${s}`];
          const child = rig.bones[k < 3 ? `${f}_0${k + 1}_${s}` : `${f}_04_leaf_${s}`];
          const a = bone.getWorldPosition(new THREE.Vector3()), b = child.getWorldPosition(new THREE.Vector3());
          const dir = b.sub(a).normalize();
          // a finger bends toward the palm; the thumb toward its own pad (across the palm, toward the little finger)
          const curlW = new THREE.Vector3().crossVectors(dir, f === 'thumb' ? thumbPad : palmar).normalize();
          const wq = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
          const curl = curlW.applyQuaternion(wq).normalize();
          const fan = palmar.clone().applyQuaternion(wq).normalize();
          // the thumb's root swings in front of the palm (opposition): about the hand's own length
          const oppose = along.clone().applyQuaternion(wq).normalize();
          list.push({ bone, bind: rig.bind[bone.name].clone(), curl, fan, oppose, next: child });
        }
        this.joints[s][f] = list;
      }
    }
    rig.skeleton.bones.forEach((b, i) => b.quaternion.copy(saved[i]));
    root.updateMatrixWorld(true);
    const st = () => ({ from: GRIPS.relaxed, to: GRIPS.relaxed, t: 1, rate: 8, weight: 0, want: 0 });
    this.state = { l: st(), r: st() };
  }

  /** what each hand closes round this frame (set by the arm's target; cleared after each update) */
  private readonly holds: Record<'l' | 'r', Hold | null> = { l: null, r: null };
  /** Close this hand's fingers round a thing this frame (its grip still sets the thumb's turn, the fan, and what is not touching). */
  hold(side: 'l' | 'r', h: Hold | null | undefined): void {
    this.holds[side] = h ?? null;
  }

  /** Go to a grip over `time` seconds (a new grip starts from wherever the hand is now). */
  grip(side: 'l' | 'r', name: GripName | Grip, weight = 1, time = 0.12): void {
    const st = this.state[side];
    const to = typeof name === 'string' ? GRIPS[name] : name;
    if (to !== st.to) {
      st.from = mixGrip(st.from, st.to, ease(st.t));
      st.to = to;
      st.t = 0;
      st.rate = 1 / Math.max(0.02, time);
    }
    st.want = weight;
  }

  /** Each frame after the clips: the fingers to their grips. */
  update(dt: number): void {
    const q = new THREE.Quaternion(), r = new THREE.Quaternion();
    for (const s of ['l', 'r'] as const) {
      const st = this.state[s];
      st.t = Math.min(1, st.t + dt * st.rate);
      st.weight += (st.want - st.weight) * Math.min(1, dt * 12);
      if (st.weight < 1e-3) continue;
      const gp = mixGrip(st.from, st.to, ease(st.t));
      for (const f of ['index', 'middle', 'ring', 'pinky', 'thumb'] as const) {
        const joints = this.joints[s][f];
        const v = gp[f];
        for (let k = 0; k < 3; k++) {
          const j = joints[k];
          q.copy(j.bind);
          if (f === 'thumb') {
            // the root swings in front of the palm (opposition), then each joint bends across it
            if (k === 0) q.multiply(r.setFromAxisAngle(j.oppose, v[0] * 0.75 * (s === 'l' ? 1 : -1)));
            q.multiply(r.setFromAxisAngle(j.curl, v[k + 1]));
          } else {
            if (k === 0 && v[3] !== 0) q.multiply(r.setFromAxisAngle(j.fan, v[3] * (s === 'l' ? 1 : -1) * (f === 'index' ? -1 : 1)));
            q.multiply(r.setFromAxisAngle(j.curl, v[k]));
          }
          j.bone.quaternion.slerp(q, st.weight);
        }
      }
      const h = this.holds[s];
      if (h && st.weight > 0.02) this.wrap(s, gp, h, st.weight);
      else this.closed[s] = null;
      this.holds[s] = null;
    }
  }

  // ------------------------------------------------------------------------------------------ closing on a thing
  private readonly tv = new THREE.Vector3();
  private readonly pw = new THREE.Vector3();

  /** The surface's signed distance (m) at a point. */
  private dist(h: Hold, p: THREE.Vector3): number {
    const d = this.tv.subVectors(p, h.c);
    if (h.kind === 'ball' || !h.axis) return d.length() - h.r;
    const along = d.dot(h.axis);
    return Math.sqrt(Math.max(0, d.lengthSq() - along * along)) - h.r;
  }

  /** a record of the last closing (set to [] to keep one) */
  debug: string[] | null = null;

  /**
   * The fingers close round the thing together, as a hand does: every joint of a finger turns from open toward fully
   * closed at once; when a bone would go into the thing, it and the joints nearer the palm stop where they were, the
   * joints beyond go on closing until their bones touch too (or are fully closed). A bone already in it at the start
   * (the hand placed a little into it) stays as open as it goes.
   */
  /** the last closing of each hand: what it closed on (in the hand's own frame) and every joint's turn */
  private readonly closed: Record<'l' | 'r', { c: THREE.Vector3; axis: THREE.Vector3; r: number; kind: string; grip: number; q: THREE.Quaternion[] } | null> = { l: null, r: null };

  private wrap(s: 'l' | 'r', gp: Grip, h: Hold, weight: number): void {
    const hand = this.rig.bones[`hand_${s}`];
    hand.updateMatrixWorld(true);
    // the same thing in the same place in the hand as last frame (a held wheel, a can carried): the same closing
    const inv = hand.matrixWorld.clone().invert();
    const cL = h.c.clone().applyMatrix4(inv);
    const aL = h.axis ? h.axis.clone().transformDirection(inv) : new THREE.Vector3();
    const sig = [gp.index, gp.middle, gp.ring, gp.pinky, gp.thumb].reduce((a, v) => a + v[0] + v[1] * 2 + v[2] * 3 + v[3] * 5, 0);
    const last = this.closed[s];
    if (last && last.kind === h.kind && Math.abs(last.r - h.r) < 1e-4 && Math.abs(last.grip - sig) < 1e-4 && last.c.distanceToSquared(cL) < 2.5e-7 && last.axis.distanceToSquared(aL) < 2.5e-5) {
      let n = 0;
      for (const f of ['index', 'middle', 'ring', 'pinky', 'thumb'] as const) for (const j of this.joints[s][f]) j.bone.quaternion.slerp(last.q[n++], weight);
      hand.updateMatrixWorld(true);
      return;
    }
    const keep: THREE.Quaternion[] = [];
    const r = new THREE.Quaternion();
    const pq = new THREE.Quaternion();
    const rot = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
    const pos = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const fanQ = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
    const off = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const th = [0, 0, 0], prev = [0, 0, 0];
    const locked = [false, false, false];
    const STEPS = 36;
    for (const f of ['index', 'middle', 'ring', 'pinky', 'thumb'] as const) {
      const joints = this.joints[s][f];
      const v = gp[f];
      const R = FINGER_R[f];
      const lo = f === 'thumb' ? THUMB_LO : CURL_LO, hi = f === 'thumb' ? THUMB_HI : CURL_HI;
      // each joint's rest turn with the grip's fan (a finger) or the thumb's turn across the palm; the bone's length
      const turnAcross = (o: number) => fanQ[0].copy(joints[0].bind).multiply(r.setFromAxisAngle(joints[0].oppose, o * (s === 'l' ? 1 : -1)));
      for (let k = 0; k < 3; k++) {
        const j = joints[k];
        fanQ[k].copy(j.bind);
        if (f === 'thumb') {
          if (k === 0) turnAcross(v[0] * 0.75);
        } else if (k === 0 && v[3] !== 0) fanQ[k].multiply(r.setFromAxisAngle(j.fan, v[3] * (s === 'l' ? 1 : -1) * (f === 'index' ? -1 : 1)));
        off[k].copy(j.next.position);
        if (k === 2) off[k].multiplyScalar(1 + 0.0035 / Math.max(1e-4, off[k].length()));
        th[k] = lo[k];
        locked[k] = false;
      }
      joints[0].bone.parent!.getWorldQuaternion(pq);
      joints[0].bone.getWorldPosition(pos[0]);
      // the chain's joints at these turns; how far bone k is from the thing (- inside)
      const place = () => {
        let q = pq;
        for (let k = 0; k < 3; k++) {
          rot[k].copy(q).multiply(fanQ[k]).multiply(r.setFromAxisAngle(joints[k].curl, th[k]));
          pos[k + 1].copy(off[k]).applyQuaternion(rot[k]).add(pos[k]);
          q = rot[k];
        }
      };
      const gapOf = (k: number) => {
        let m = Infinity;
        const rA = R[k] * 0.93, rB = R[k + 1] * 0.93;
        for (const t of [0.4, 0.7, 1]) {
          this.pw.lerpVectors(pos[k], pos[k + 1], t);
          m = Math.min(m, this.dist(h, this.pw) - (rA + (rB - rA) * t));
        }
        return m;
      };
      place();
      const inside = () => Math.min(gapOf(0), gapOf(1), gapOf(2));
      // the thumb round a cylinder: the other way round it from the fingers. Its first bone laid along the surface from
      // its root (as far round as its length reaches), its pad toward the middle; then its two bends close on it.
      let thumbSet = false;
      if (f === 'thumb' && h.kind === 'cyl' && h.axis) {
        const ax = h.axis;
        const cmc = pos[0];
        const rel = cmc.clone().sub(h.c);
        const height = rel.dot(ax);
        const radial = rel.addScaledVector(ax, -height);
        const rho0 = radial.length();
        const L0 = off[0].length();
        const rho = h.r + R[1] * 0.93;
        if (rho0 > 1e-4 && rho0 > rho * 0.8) {
          const e1 = radial.divideScalar(rho0);
          const e2 = new THREE.Vector3().crossVectors(ax, e1);
          const cosD = THREE.MathUtils.clamp((rho0 * rho0 + rho * rho - L0 * L0) / (2 * rho0 * rho), -1, 1);
          const D = Math.acos(cosD);
          // (the fingers are round the side the index knuckle is on: the thumb goes the other way)
          const kn = this.rig.bones[`index_01_${s}`].getWorldPosition(new THREE.Vector3()).sub(h.c);
          const sgn = kn.dot(e2) > 0 ? -1 : 1;
          const p1 = h.c.clone().addScaledVector(ax, height - 0.004).addScaledVector(e1, Math.cos(D) * rho).addScaledVector(e2, Math.sin(D) * sgn * rho);
          const dirW = p1.clone().sub(cmc).normalize();
          const midM = cmc.clone().add(p1).multiplyScalar(0.5);
          const toAxis = h.c.clone().addScaledVector(ax, midM.clone().sub(h.c).dot(ax)).sub(midM);
          const padW = toAxis.addScaledVector(dirW, -toAxis.dot(dirW)).normalize();
          const dirL = off[0].clone().normalize();
          const padL = new THREE.Vector3().crossVectors(joints[0].curl, dirL).normalize();
          const mw = new THREE.Matrix4().makeBasis(dirW, padW, new THREE.Vector3().crossVectors(dirW, padW));
          const ml = new THREE.Matrix4().makeBasis(dirL, padL, new THREE.Vector3().crossVectors(dirL, padL));
          const qw = new THREE.Quaternion().setFromRotationMatrix(mw).multiply(new THREE.Quaternion().setFromRotationMatrix(ml).invert());
          fanQ[0].copy(pq).invert().multiply(qw);
          th[0] = 0;
          th[1] = lo[1];
          th[2] = lo[2];
          locked[0] = true;
          thumbSet = true;
          place();
          if (this.debug) this.debug.push(`${s}thumbaim rho0 ${rho0.toFixed(3)} rho ${rho.toFixed(3)} L0 ${L0.toFixed(3)} D ${D.toFixed(2)} sgn ${sgn}`);
        }
      }
      // already in it, open: that bone (and the ones nearer the palm) stay open
      for (let k = 2; k >= 0; k--) if (gapOf(k) <= 0) { for (let i = 0; i <= k; i++) locked[i] = true; break; }
      void thumbSet;
      for (let step = 1; step <= STEPS && !(locked[0] && locked[1] && locked[2]); step++) {
        for (let k = 0; k < 3; k++) {
          prev[k] = th[k];
          // the knuckle leads, the middle joint follows, the last joint last (so the bones meet the thing in turn)
          const t = Math.min(1, Math.max(0, (step / STEPS - LEAD[k]) / (1 - LEAD[k])));
          if (!locked[k]) th[k] = lo[k] + (hi[k] - lo[k]) * t;
        }
        place();
        // the bone nearest the palm that went in: it and those before it stop; the ones beyond try again from there
        let hit = -1;
        for (let k = 0; k < 3; k++) if (!locked[k] && gapOf(k) <= 0) { hit = k; break; }
        if (hit < 0) continue;
        for (let k = 0; k < 3; k++) th[k] = prev[k];
        for (let k = 0; k <= hit; k++) locked[k] = true;
        place();
      }
      if (this.debug) this.debug.push(`${s}${f} ${th.map((x) => x.toFixed(2)).join(',')} ${locked.map((x) => (x ? 'L' : '-')).join('')} gaps ${[0, 1, 2].map(gapOf).map((x) => x.toFixed(3)).join(',')}`);
      for (let k = 0; k < 3; k++) {
        const j = joints[k];
        const want = fanQ[k].clone().multiply(r.setFromAxisAngle(j.curl, th[k]));
        keep.push(want);
        j.bone.quaternion.slerp(want, weight);
      }
      joints[0].bone.updateMatrixWorld(true);
    }
    this.closed[s] = { c: cL, axis: aL, r: h.r, kind: h.kind, grip: sig, q: keep };
  }
}

const ease = (t: number) => t * t * (3 - 2 * t);
const lerpA = <A extends number[]>(a: A, b: A, t: number): A => a.map((x, i) => x + (b[i] - x) * t) as A;
export function mixGrip(a: Grip, b: Grip, t: number): Grip {
  return { index: lerpA(a.index, b.index, t), middle: lerpA(a.middle, b.middle, t), ring: lerpA(a.ring, b.ring, t), pinky: lerpA(a.pinky, b.pinky, t), thumb: lerpA(a.thumb, b.thumb, t) };
}
