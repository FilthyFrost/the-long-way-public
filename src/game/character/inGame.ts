// Her in the game (docs/V3/plan/character-pv.md §8): loaded once, placed every frame from what the game says the
// player is doing — on foot her feet under the walker and her body keeping to the view, in a seat her hips on the
// cushion and both hands on the steering wheel — and drawn as first person wants (no head, no hair, nothing of her
// within a hand's breadth of the eye) or whole for the view from behind her (V on foot) and the views of a vehicle
// from outside.

import * as THREE from 'three';
import type { RenderCore } from '../render/core';
import { type Drive, type HandTarget, Animator, handFrame, type BarGrip } from './animator';
import type { GripName, Hold } from './hands';
import { loadClips } from './clips';
import { DressView } from './dressView';
import { type HerRig, loadHer } from './her';
import { type Wear, WardrobeView } from './wardrobeView';
import { cleanLook, HELMETS, SKINS } from './looks';

export interface WalkerLike {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  heading: number; pitch: number;
  grounded: boolean; crouched: boolean;
}

export interface SeatLike {
  /** the driver's eye (world) and the vehicle's axes: forward, up (world) */
  eye: THREE.Vector3;
  fwd: THREE.Vector3;
  up: THREE.Vector3;
  /** where the view looks, relative to the vehicle (rad) */
  lookYaw: number;
  lookPitch: number;
  /** the steering wheel's holder (it turns about its x) and its radius; null on a vehicle without one (a motorcycle) */
  wheel: THREE.Object3D | null;
  wheelRadius: number;
  /** the steering part (its rim's size and dish are known per part) */
  wheelPart?: string;
  throttle: number;
  brake: number;
  /** a closed cab (its light is the cab's, not the open sky's) */
  cab: boolean;
  /** a motorcycle's handlebar (its holder turns about its y with the fork), how far it leans (rad, + right side down) and about where (world) */
  bar: THREE.Object3D | null;
  lean: number;
  leanPivot: THREE.Vector3;
}

const Y = new THREE.Vector3(0, 1, 0);

/** What she holds, as the game's held thing draws it (modcar/held.ts): its centred frame, size, and how it is carried. */
export interface HeldLike {
  frame: THREE.Object3D;
  size: THREE.Vector3;
  twoHanded: boolean;
  /** a tool's kind ('' for anything else) */
  kind: string;
  /** a handle's mark (M_grip) in the model's frame, already centred; null if none */
  grip: THREE.Vector3 | null;
}

/** steer_bar's grips in its own frame: the middle of the right one (the left mirrored in z) and its axis toward the end */
const BAR_GRIP = { x: -0.115, y: 0.13, z: 0.306, ax: -0.342, az: 0.94 };

/** the steering wheels' rims (measured on their models): the tube's radius about the hub, its own radius, how far it is dished toward the driver */
const WHEEL_RIMS: Record<string, { r: number; tube: number; dish: number }> = {
  steer_std: { r: 0.183, tube: 0.012, dish: 0.072 },
  steer_bad: { r: 0.183, tube: 0.012, dish: 0.072 },
  steer_sport: { r: 0.1625, tube: 0.0145, dish: 0.0855 },
  steer_ship: { r: 0.282, tube: 0.022, dish: 0.029 },
};

export class HerInGame {
  rig: HerRig | null = null;
  anim: Animator | null = null;
  dress: DressView | null = null;
  wardrobe: WardrobeView | null = null;
  ready = false;
  /** on foot: the view from behind her (V: the game's view key) */
  thirdPerson = false;
  /** the follow camera's distance and side offset */
  readonly follow = { dist: 2.6, side: 0.42, height: 1.32, cur: 2.6 };
  private readonly drive: Drive = { mode: 'foot', pos: new THREE.Vector3(), vel: new THREE.Vector3(), grounded: true, crouch: false, yaw: 0, pitch: 0, firstPerson: true };
  private readonly origin = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly m4 = new THREE.Matrix4();
  error = '';

  constructor(readonly core: RenderCore) {
    // (?her=0: the game without her, for measuring what she costs)
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('her') === '0') return;
    // (V, the view, is the game's key: ModGame turns thirdPerson — docs/V3/plan/finish.md §十三)
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const rig = await loadHer();
      const clips = await loadClips(rig);
      this.rig = rig;
      this.dressLook();
      this.anim = new Animator(rig, clips);
      rig.root.name = 'player:her';
      this.core.scene.add(rig.root);
      this.dress = new DressView(rig, rig.parts, rig.meta, this.core.scene);
      this.dress.group.name = 'player:dress';
      this.wardrobe = new WardrobeView(rig, this.dress);
      this.origin.set(this.core.origin.x, this.core.origin.y, this.core.origin.z);
      this.ready = true;
    } catch (e) {
      this.error = String(e);
      console.error('her: could not load', e);
    }
  }

  /** Her eye height standing (m): the first-person eye on foot is hers. */
  get eyeHeight(): number {
    return (this.rig?.meta.eyeHeight as number | undefined) ?? 1.497;
  }

  /**
   * After the camera is placed: pose her for the frame. `w` on foot, `seat` in a vehicle; `cam` is the view (its
   * position is used to keep her out of a first-person eye); `view` says which way the game is drawn.
   */
  /**
   * Her right hand reaching to what the left button works (docs/V3/plan/finish.md §十: 捡和放、开关车门、装拆零件、
   * 换挡、手刹、拧钥匙): the point (render space), how far gone (0 … 1), and whether a finger presses it (a button, a
   * key) or the hand goes to take hold. From her own eyes; on foot only with nothing in her hands (what is in them
   * is what they hold). The game says (ModGame.reachOut).
   */
  readonly reach = { at: new THREE.Vector3(), w: 0, press: false };
  private readonly reachBoth: { l?: HandTarget; r?: HandTarget } = {};
  private readonly reachHand: HandTarget = { pos: new THREE.Vector3(), rot: new THREE.Quaternion(), grip: 'relaxed', w: 0, pole: new THREE.Vector3(0.55, -1, 0).normalize() };
  private readonly rv = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

  /** the reach as a target for her right arm: the wrist a hand's length short of the point, the fingers toward it, the palm down */
  private reachTarget(cam: THREE.Camera): HandTarget {
    const [to, up, palm, eye] = this.rv;
    const e = cam.matrixWorld.elements;
    eye.set(e[12], e[13], e[14]);
    up.set(e[4], e[5], e[6]).normalize();
    to.copy(this.reach.at).sub(eye);
    const far = to.length();
    to.normalize();
    // (from below and to the right of the line of sight: the hand does not cover what it goes to)
    palm.copy(up).multiplyScalar(-0.85).addScaledVector(to, 0.3).normalize();
    const t = this.reachHand;
    t.pos.copy(this.reach.at).addScaledVector(to, -Math.min(0.09, far * 0.3)).addScaledVector(up, -0.035);
    t.rot!.copy(handFrame('r', to, palm, palm));
    t.grip = this.reach.press ? 'press' : 'open';
    t.w = this.reach.w;
    return t;
  }

  /** how she looks: her skin and her helmet (looks.ts), put on as she is loaded and whenever it is chosen */
  private look = { skin: 0, helmet: 0 };

  /** her skin and her helmet chosen (docs/V3/plan/finish.md §十: 捏人): indices into looks.ts, what is none of them the first */
  setLook(l: { skin?: number; helmet?: number } | null | undefined): void {
    this.look = cleanLook(l);
    this.dressLook();
  }

  private dressLook(): void {
    const rig = this.rig;
    if (!rig) return;
    const p = SKINS[this.look.skin].paint;
    for (const m of [rig.skin, rig.arms.l.material as THREE.ShaderMaterial]) {
      const u = m.uniforms;
      (u.uLit.value as THREE.Color).copy(p.lit);
      (u.uShade.value as THREE.Color).copy(p.shade);
      (u.uDeep.value as THREE.Color).copy(p.deep);
      (u.uPalmLit.value as THREE.Color).copy(p.palmLit);
      (u.uPalmShade.value as THREE.Color).copy(p.palmShade);
      (u.uBlush.value as THREE.Color).copy(p.blush);
    }
    const h = HELMETS[this.look.helmet];
    const hu = (rig.helmet?.material as THREE.ShaderMaterial | undefined)?.uniforms;
    if (hu) {
      (hu.uShellLit.value as THREE.Color).copy(h.shellLit);
      (hu.uShellShade.value as THREE.Color).copy(h.shellShade);
      (hu.uStripe.value as THREE.Color).copy(h.stripe);
    }
  }

  /**
   * Where her hands go on a thing a system draws in them by itself (the fishing's rod: v3/fishing), on foot from her
   * own eyes; null: nothing of the sort is in them now (what the game's own held thing says, or free)
   */
  handsFor: ((cam: THREE.Camera) => { l?: HandTarget; r?: HandTarget } | null) | null = null;

  update(dt: number, w: WalkerLike, seat: SeatLike | null, cam: THREE.Camera, view: 'first' | 'third' | 'outside', held: HeldLike | null = null, wear: Wear[] = []): void {
    if (!this.ready || !this.rig || !this.anim || !this.dress) return;
    const o = this.core.origin;
    // the world moved under the render (a rebase): the cloth moves with it
    if (o.x !== this.origin.x || o.y !== this.origin.y || o.z !== this.origin.z) {
      this.dress.shift(o.x - this.origin.x, o.y - this.origin.y, o.z - this.origin.z);
      this.origin.set(o.x, o.y, o.z);
    }
    this.wardrobe?.set(wear);
    const d = this.drive;
    d.firstPerson = view === 'first';
    d.hands = undefined;
    if (seat) {
      d.mode = 'seat';
      // the hip point: below and a little ahead of the eye, along the vehicle's own axes
      d.pos.copy(seat.eye).addScaledVector(seat.up, -0.69).addScaledVector(seat.fwd, 0.03).sub(this.tmp.set(o.x, o.y, o.z));
      d.seatYaw = Math.atan2(seat.fwd.z, seat.fwd.x);
      d.yaw = d.seatYaw - seat.lookYaw;
      d.pitch = seat.lookPitch;
      d.floorY = d.pos.y - 0.36;
      d.vel.set(0, 0, 0);
      d.grounded = true;
      d.crouch = false;
      d.throttle = seat.throttle;
      d.brake = seat.brake;
      d.wheel = undefined;
      if (seat.wheel) {
        const holder = seat.wheel;
        const mount = holder.parent ?? holder;
        mount.updateMatrixWorld(true);
        const e = mount.matrixWorld.elements;
        const ax = new THREE.Vector3(e[0], e[1], e[2]).normalize();
        const ay = new THREE.Vector3(e[4], e[5], e[6]).normalize();
        // the wheel turns about its x: its face toward her is whichever way x points back along the vehicle
        const normal = ax.dot(seat.fwd) > 0 ? ax.clone().negate() : ax.clone();
        const up = ay.addScaledVector(normal, -ay.dot(normal)).normalize();
        // the rim: dished toward her from the hub
        const rim = WHEEL_RIMS[seat.wheelPart ?? 'steer_std'] ?? WHEEL_RIMS.steer_std;
        // (the model's rim sits at its own x = -dish, whichever way its x points)
        holder.updateMatrixWorld(true);
        const center = holder.localToWorld(new THREE.Vector3(-rim.dish, 0, 0));
        // (the wheel's turn as she sees it: + to her left)
        const sign = ax.dot(seat.fwd) > 0 ? -1 : 1;
        d.wheel = { center, normal, up, radius: rim.r, tube: rim.tube, angle: holder.rotation.x * sign };
      }
      d.bars = undefined;
      d.seatRoll = 0;
      if (seat.bar) {
        // the grips on the bar (steer_bar's rubber, measured: its own z across, swept back toward the ends)
        const bar = seat.bar;
        bar.updateMatrixWorld(true);
        // the bar as it would be upright (the model is drawn leaning; she is posed upright and leant with it last)
        const pivot = seat.leanPivot.clone().sub(this.tmp.set(o.x, o.y, o.z));
        const unlean = new THREE.Quaternion().setFromAxisAngle(seat.fwd, -seat.lean);
        const grip = (z: number): BarGrip => {
          const c = bar.localToWorld(new THREE.Vector3(BAR_GRIP.x, BAR_GRIP.y, z * BAR_GRIP.z));
          const end = bar.localToWorld(new THREE.Vector3(BAR_GRIP.x + BAR_GRIP.ax * 0.1, BAR_GRIP.y, z * (BAR_GRIP.z + BAR_GRIP.az * 0.1)));
          c.sub(pivot).applyQuaternion(unlean).add(pivot);
          end.sub(pivot).applyQuaternion(unlean).add(pivot);
          return { c, out: end.sub(c).normalize() };
        };
        const l = grip(-1), r = grip(1);
        // (which end is her left: the one on her left as she faces forward)
        const left = new THREE.Vector3().crossVectors(seat.up, seat.fwd);
        d.bars = l.c.clone().sub(r.c).dot(left) > 0 ? { l, r } : { l: r, r: l };
        d.seatRoll = seat.lean;
        d.rollPivot = pivot;
        d.rollAxis = seat.fwd.clone();
        // a small rider sits up close behind the tank
        d.pos.addScaledVector(seat.fwd, 0.1);
      }
    } else {
      d.mode = 'foot';
      d.pos.set(w.x - o.x, w.y - o.y, w.z - o.z);
      d.vel.set(w.vx, w.vy, w.vz);
      d.grounded = w.grounded;
      d.crouch = w.crouched;
      d.yaw = w.heading;
      d.pitch = w.pitch;
      d.wheel = undefined;
      // (soles lift her)
      d.pos.y += this.wardrobe?.sole ?? 0;
      const footY = d.pos.y;
      d.ground = () => footY;
    }
    // first-person arms are kept for seated driving (wheel + dashboard reach), while on-foot held items float cleanly without hands/arms
    const first = view === 'first';
    const seatFirst = first && !!seat;
    if (this.reach.w > 0.02 && seatFirst) {
      this.reachBoth.r = this.reachTarget(cam);
      d.hands = this.reachBoth;
    }
    this.anim.update(dt, d);
    // in a seat, from her own eyes: the view is from where her eyes are as she sits (leaning over a tank, looking round)
    if (seat && view === 'first') this.eyeToHers(seat, cam);
    // (on foot, from her own eyes: the view is where her eyes are by the look alone — FOOT_VIEW, the walker's)
    this.swingHair(dt);
    this.dress.sitting = !!seat || d.crouch;
    this.dress.update(dt);
    // in a closed cab she is lit as the cab's inside is
    const inCab = seat?.cab ? 1 : 0;
    this.wardrobe?.update(first, seatFirst, inCab);
    for (const m of [this.rig.skin, this.rig.hairMat, this.dress.skinnedMat, this.dress.skirtMat]) m.uniforms.uInCab.value = inCab;
    if (this.rig.helmet) (this.rig.helmet.material as THREE.ShaderMaterial).uniforms.uInCab.value = inCab;
    // what is drawn: first person hides her head and hair; seated driving draws her finer arms on the wheel, while on-foot hides arms so held tools/items float cleanly
    const skin = this.rig.skin.uniforms;
    const fade = first && !seat ? 1 : 0;
    const rt = this.core.frame.rtScene;
    (skin.uHide.value as THREE.Vector4).set(first ? 1 : 0, first ? 1 : 0, first ? 1 : 0, seatFirst ? 1 : 0);
    this.dress.setHidden(seatFirst);
    for (const m of [this.rig.skin, this.dress.skinnedMat, this.dress.skirtMat]) (m.uniforms.uSeeView.value as THREE.Vector3).set(fade, rt.width, rt.height);
    this.wardrobe?.firstPersonBody(seatFirst, fade, rt.width, rt.height);
    this.rig.arms.l.visible = this.rig.arms.r.visible = seatFirst;
    const armMat = this.rig.arms.l.material as THREE.ShaderMaterial;
    armMat.uniforms.uInCab.value = inCab;
    this.rig.hairMat.uniforms.uHide.value = first ? 1 : 0;
    // (from her own eyes the hair and the mask are not drawn at all; the hair's shadow is)
    this.rig.hair.visible = !first && !this.rig.helmet && (this.rig.hair.geometry.attributes.position?.count ?? 0) > 0;
    if (this.rig.mask) this.rig.mask.visible = !first;
    // (the helmet too: her eye is inside it)
    if (this.rig.helmet) this.rig.helmet.visible = !first;
    void cam;
  }

  /**
   * Her hands on what she holds, read off where the game draws it in front of the eye: a small thing held from
   * below and to the right with the fingers round it, a bigger one on her right palm, a big one between both hands,
   * a tool by its handle. The thing goes where the game puts it (to her mouth, to a filler, onto a surface); the hands
   * follow it there.
   */
  private handsOn(h: HeldLike, cam: THREE.Camera): { l?: HandTarget; r?: HandTarget } {
    const f = h.frame;
    f.updateWorldMatrix(true, false);
    const c = f.getWorldPosition(new THREE.Vector3());
    const e = cam.matrixWorld.elements;
    const right = new THREE.Vector3(e[0], e[1], e[2]).normalize();
    const up = new THREE.Vector3(e[4], e[5], e[6]).normalize();
    const fwd = new THREE.Vector3(-e[8], -e[9], -e[10]).normalize();
    const sz = h.size;
    const big = Math.max(sz.x, sz.y, sz.z);
    // the thing's half-width as the eye sees it across, and its half-height
    const q = f.getWorldQuaternion(new THREE.Quaternion());
    const ext = (dir: THREE.Vector3) => {
      const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(q), ay = new THREE.Vector3(0, 1, 0).applyQuaternion(q), az = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      return (Math.abs(ax.dot(dir)) * sz.x + Math.abs(ay.dot(dir)) * sz.y + Math.abs(az.dot(dir)) * sz.z) / 2;
    };
    const hx = ext(right), hy = ext(up);
    const out: { l?: HandTarget; r?: HandTarget } = {};
    if (h.kind === 'jerrycan' || h.kind === 'oilcan') {
      // a can by the handle on its top: the fingers hooked through it, the back of the hand to the eye
      const top = c.clone().addScaledVector(up, hy * 0.92);
      const fingers = right.clone().multiplyScalar(-0.85).addScaledVector(fwd, 0.4).normalize();
      const palm = up.clone().multiplyScalar(-0.3).addScaledVector(fwd, 0.95).normalize();
      const wrist = top.clone().addScaledVector(fingers, -0.055).addScaledVector(palm, -0.03).addScaledVector(up, 0.01);
      out.r = { pos: wrist, rot: handFrame('r', fingers, palm, palm), grip: 'hook', w: 1, pole: new THREE.Vector3(0.5, -1, 0).normalize() };
      return out;
    }
    if (h.twoHanded) {
      // between both hands, palms in on its sides, a little below its middle
      for (const s of ['l', 'r'] as const) {
        const side = s === 'r' ? 1 : -1;
        const palm = right.clone().multiplyScalar(-side);
        const touch = c.clone().addScaledVector(right, side * hx).addScaledVector(up, -hy * 0.25);
        const wrist = touch.clone().addScaledVector(right, side * 0.028).addScaledVector(up, -0.05).addScaledVector(fwd, -0.04);
        const fingers = up.clone().multiplyScalar(0.55).addScaledVector(fwd, 0.8).normalize();
        out[s] = { pos: wrist, rot: handFrame(s, fingers, palm, palm), grip: 'flat', w: 1, pole: new THREE.Vector3(0, -1, 0).addScaledVector(right, side * 0.8).normalize() };
      }
      return out;
    }
    if (h.grip) {
      // a tool by its handle: the hand round it, the fingers across it
      const g = f.localToWorld(h.grip.clone());
      const along = new THREE.Vector3().subVectors(c, g).normalize();
      const palm = right.clone().multiplyScalar(-0.6).addScaledVector(up, 0.5).normalize();
      const fingers = new THREE.Vector3().crossVectors(along, palm).normalize();
      const wrist = g.clone().addScaledVector(palm, -0.028).addScaledVector(fingers, -0.045);
      // (the fingers close round the handle: a tool's grip of about three centimetres)
      out.r = { pos: wrist, rot: handFrame('r', fingers, palm, palm), grip: 'bar', w: 1, hold: { kind: 'cyl', c: g, axis: along, r: 0.014 } };
      return out;
    }
    // one hand. A tall thing (a can, a bottle, a spray) round its middle from the right: the palm on its side, the
    // fingers round its far side, the thumb round the near; the hand square to its length. Anything else: below and
    // to the right of it, the palm toward its middle, the fingers round its far side.
    const small = big < 0.13;
    const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)].map((v) => v.applyQuaternion(q));
    const dims = [sz.x, sz.y, sz.z];
    const pole = new THREE.Vector3(0.3, -1, -0.2).normalize();
    // a can's or a bottle's shape: one length well over the other two, those two alike, not too thick to get round
    const li = dims.indexOf(Math.max(...dims));
    const across = dims.filter((_, k) => k !== li);
    const round = Math.max(...across) < 1.3 * Math.min(...across);
    const tall = round && dims[li] > 1.35 * Math.max(...across) && Math.max(...across) < 0.13 && big < 0.4;
    if (tall) {
      const axis = axes[li].clone();
      if (axis.dot(up) < 0) axis.negate();
      const r = (across[0] + across[1]) / 4;
      const side = right.clone().addScaledVector(axis, -right.dot(axis)).normalize();
      const ahead = fwd.clone().addScaledVector(axis, -fwd.dot(axis)).addScaledVector(side, -fwd.dot(side)).normalize();
      // the hand turned a little into it about its length (its knuckles come round it, the heel of the hand lifts off)
      const turn = 0.35;
      const fingers = ahead.clone().multiplyScalar(Math.cos(turn)).addScaledVector(side, -Math.sin(turn)).addScaledVector(axis, 0.1).normalize();
      const palm = side.clone().multiplyScalar(-Math.cos(turn)).addScaledVector(ahead, -Math.sin(turn)).normalize();
      // the far part of the palm on its side a little below its middle; the wrist back along the hand from there
      const contact = c.clone().addScaledVector(side, r + 0.0125).addScaledVector(axis, -dims[li] * 0.1);
      const wrist = contact.addScaledVector(fingers, -0.06);
      out.r = { pos: wrist, rot: handFrame('r', fingers, palm, palm), grip: 'bottle', w: 1, pole, hold: { kind: 'cyl', c: c.clone(), axis, r } };
      return out;
    }
    const touch = c.clone().addScaledVector(right, hx * 0.8).addScaledVector(up, -hy * (small ? 0.3 : 0.55));
    const palm = new THREE.Vector3().subVectors(c, touch).normalize();
    const fingers = fwd.clone().multiplyScalar(0.75).addScaledVector(up, small ? 0.45 : 0.2).addScaledVector(right, -0.35).normalize();
    const wrist = touch.clone().addScaledVector(palm, -0.022).addScaledVector(fingers, -(small ? 0.05 : 0.06));
    const grip: GripName = big < 0.05 ? 'pinch' : small ? 'bottle' : big < 0.3 ? 'ball' : 'flat';
    // a roundish thing: the fingers close round it as round a ball (a flat or a long one: the grip alone)
    const ball = Math.max(...dims) < 1.6 * Math.min(...dims);
    const hold: Hold | undefined = ball && (grip === 'bottle' || grip === 'ball') ? { kind: 'ball', c: c.clone(), r: (dims[0] + dims[1] + dims[2]) / 6 } : undefined;
    out.r = { pos: wrist, rot: handFrame('r', fingers, palm, palm), grip, w: 1, pole, hold };
    return out;
  }

  /**
   * How far the view on foot stands ahead of her eyes (m): Nomad Drive's first-person view is 0.143 m ahead of its
   * character's eyes (theirs 1.66 m up, the view 1.60), here as far for hers (1.40 m up): out past her face, so that as
   * she walks or runs — leaning into it, her chest coming forward — the view stays ahead of her, and looking down it
   * sees the road and her feet, not the inside of her dress (2026-11-26: walking and looking down, her dress filled the
   * lower half of the screen; running, all of it).
   */
  static readonly EYE_AHEAD = 0.125;
  /** … and the point behind it the view turns about as she looks up and down (Nomad Drive's 0.0996, for her) */
  static readonly EYE_TURN = 0.087;

  /**
   * Where her eyes are from the walker's eye on foot (m; m a radian of looking down): 5 cm ahead of it and 10 cm below
   * looking level, 10 cm ahead and 21 cm below looking down at her feet — measured on her standing in the game
   * (2026-11-25, pitches 0 to −1.2: ahead 0.049, 0.070, 0.084, 0.097, 0.104; below 0.099, 0.128, 0.156, 0.186, 0.210).
   * The view on foot is put there by the look alone (Walker.view): it does not chase her head, which follows the look
   * a moment late — a view that came after the head drifted for half a second after the mouse had stopped, and the
   * mark with it. The view itself stands EYE_AHEAD further out and turns about EYE_TURN (below).
   */
  static readonly FOOT_VIEW = { ahead: 0.049 + HerInGame.EYE_AHEAD, aheadDown: 0.046, below: 0.099, belowDown: 0.0925, turn: HerInGame.EYE_TURN };
  /**
   * … and crouched: squatting she leans over her knees, and her eyes are a quarter of a metre ahead of her feet
   * (measured on her crouched in the game, 2026-11-26, pitches 0.3 to −1.2: ahead 0.223, 0.253, 0.279, 0.274, 0.269,
   * 0.276; below 0.041, 0.081, 0.131, 0.153, 0.182, 0.225). With the standing numbers the view stood 20 cm behind her
   * eyes, inside her: crouched and looking down, the screen was her own back.
   */
  static readonly CROUCH_VIEW = { ahead: 0.255 + HerInGame.EYE_AHEAD, aheadDown: 0.018, below: 0.083, belowDown: 0.125, turn: HerInGame.EYE_TURN };
  /** the view at the walker's own eye (she is not there to see from: ?her=0, not loaded yet) */
  static readonly NO_VIEW = { ahead: 0, aheadDown: 0, below: 0, belowDown: 0, turn: 0 };

  /**
   * Where the view on foot stands from her eyes: what is in her hands is drawn from her eyes (modcar/held.ts), the
   * view this far from them (render space, by the walker's heading and pitch) — a hand's breadth ahead, more and lower
   * looking down; nothing while she is not there to see from.
   */
  static eyeShift(heading: number, pitch: number, out: THREE.Vector3): THREE.Vector3 {
    const u = Math.max(-0.9, Math.min(1.1, -pitch));
    const a = HerInGame.EYE_AHEAD + HerInGame.EYE_TURN * (1 - Math.cos(u));
    return out.set(Math.cos(heading) * a, -HerInGame.EYE_TURN * Math.sin(u), Math.sin(heading) * a);
  }

  /**
   * Her body seen through in a box on the screen (material.ts SEE_GLSL): her hands on the wheel thinned where they
   * stand before the instruments. `k` how far (0: not at all), the box's middle and half size and the frame's height
   * in frame px. Every material of hers that can (her skin, her arms' own, what she wears).
   */
  seeThrough(k: number, x = 0, y = 0, hx = 1, hy = 1, frameH = 1): void {
    if (!this.rig || (k <= 0 && this.seeK <= 0)) return;
    this.seeK = k;
    this.rig.root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
      const u = m?.uniforms;
      if (!u?.uSeeK) return;
      (u.uSeeK.value as THREE.Vector2).set(k, frameH);
      (u.uSeeBox.value as THREE.Vector4).set(x, y, hx, hy);
    });
  }
  private seeK = 0;

  /** Move the first-person camera from the seat's eye point to her own eye, as she sits posed (the shake stays on top). */
  private eyeToHers(seat: SeatLike, cam: THREE.Camera): void {
    const rig = this.rig!;
    const o = this.core.origin;
    const hers = rig.bones.Head.localToWorld(rig.eyeLocal.clone());
    const game = seat.eye.clone().sub(this.tmp.set(o.x, o.y, o.z));
    if (seat.bar && seat.lean) {
      const pivot = seat.leanPivot.clone().sub(this.tmp.set(o.x, o.y, o.z));
      game.sub(pivot).applyQuaternion(new THREE.Quaternion().setFromAxisAngle(seat.fwd, seat.lean)).add(pivot);
    }
    const delta = hers.sub(game);
    if (delta.length() > 0.5) delta.setLength(0.5);
    cam.position.add(delta);
    cam.updateMatrixWorld(true);
  }

  private readonly hair = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), swing: new THREE.Vector3(), swingV: new THREE.Vector3(), started: false };
  /** Her hair lags her head: a damped spring in the head's own frame, pushed by how the head is speeding up. */
  private swingHair(dt: number): void {
    if (!this.rig || dt <= 0) return;
    const h = this.hair;
    const head = this.rig.bones.Head;
    const p = head.getWorldPosition(new THREE.Vector3());
    if (!h.started) { h.pos.copy(p); h.vel.set(0, 0, 0); h.started = true; }
    const vel = p.clone().sub(h.pos).divideScalar(dt);
    const acc = vel.clone().sub(h.vel).divideScalar(dt);
    h.pos.copy(p);
    h.vel.copy(vel);
    // a teleport or a seat change is no push
    if (acc.length() > 60) acc.set(0, 0, 0);
    const local = acc.applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()).invert());
    const target = local.multiplyScalar(-0.0022);
    if (target.length() > 0.04) target.setLength(0.04);
    // stiff and quick to settle (short hair)
    h.swingV.addScaledVector(target.sub(h.swing), 90 * dt).multiplyScalar(Math.exp(-9 * dt));
    h.swing.addScaledVector(h.swingV, dt);
    (this.rig.hairMat.uniforms.uSwing.value as THREE.Vector3).copy(h.swing);
    // a light breeze through it
    (this.rig.hairMat.uniforms.uHairWind.value as THREE.Vector4).set(0.004, 0.001, -0.003, 0.6);
  }

  /** The view from behind her on foot: over her shoulder, the way the game's view looks. */
  placeFollowCamera(cam: THREE.PerspectiveCamera, w: WalkerLike, dt: number, blocked?: (from: THREE.Vector3, dir: THREE.Vector3, far: number) => number | null): void {
    const o = this.core.origin;
    const f = this.follow;
    const yaw = w.heading, pitch = w.pitch;
    // the view's direction (the game's yaw faces cos, sin in x, z; + pitch looks up)
    const dir = new THREE.Vector3(Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch));
    const right = new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw));
    const pivot = new THREE.Vector3(w.x - o.x, w.y - o.y + f.height, w.z - o.z).addScaledVector(right, f.side);
    let want = f.dist;
    if (blocked) {
      const hit = blocked(pivot, dir.clone().negate(), f.dist + 0.3);
      if (hit != null) want = Math.max(0.6, hit - 0.25);
    }
    f.cur = want < f.cur ? want : f.cur + (want - f.cur) * Math.min(1, dt * 3);
    cam.position.copy(pivot).addScaledVector(dir, -f.cur);
    const floor = w.y - o.y + 0.25;
    if (cam.position.y < floor) cam.position.y = floor;
    cam.up.copy(Y);
    cam.lookAt(this.tmp.copy(cam.position).add(dir));
    cam.updateMatrixWorld(true);
    void this.m4;
  }
}
