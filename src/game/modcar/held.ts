/**
 * What is in the hands, drawn in first person (docs/MODCAR.md §5): the part or tool itself, low in
 * front of the eye — small things in the right hand, big ones carried in both arms in the middle —
 * swaying with the walk and trailing the view a little when one turns, more the heavier it is.
 *
 * Drawn at a fraction of its size close to the eye, so it reads as held without covering the mark
 * or the ghost it is about to go on; it casts no shadow.
 *
 * A can held to an open filler goes to it by itself (the way Arctic Drive does it): it leaves the hands
 * and, at its real size, lines its spout up with the filler's mouth, leaning in; with the button held it
 * tips over and pours. Off the filler it comes back to the hands. A cleaning tool being scrubbed with is
 * pinned to the surface the same way (pin): at its real size, its working face on the point the mouse is on.
 * A spray can being sprayed comes up before the eye, its nozzle turned to where the paint goes (aimSpray);
 * taken up, it is shaken (shake).
 */
import * as THREE from 'three';
import { itemDef, itemMass, itemPaint } from '../../core/modcar/items';
import { partDef } from '../../core/modcar/parts';
import { toolModelId } from '../../core/modcar/tools';
import type { RenderCore } from '../render/core';
import { LAYER_SHADOW_FAR, LAYER_SHADOW_NEAR } from '../render/shadow';
import { cloneModel, itemGlb, partModel, seatTyres, toolGlb } from './assets';
import { itemStandIn, partLook, toolLook, toolModel } from './loose';
import { applyMaterials, CarMaterials } from './materials';
import type { Held } from './player';


const OWNER = 'held';

/** where the spout's tip is on each can's model (its own frame, m: the spout end is +z, the top +y) */
const SPOUT: Partial<Record<string, [number, number, number]>> = {
  jerrycan: [0, 0.478, 0.13],
  bottle: [0, 0.363, 0],
  oilcan: [0, 0.293, 0.05],
};

/** where the nozzle's tip is on each spray can's model (its own frame, m: the nozzle points +x, the top +y) */
const NOZZLE: Partial<Record<string, [number, number, number]>> = {
  spray_s: [0.0122, 0.168, 0],
  spray: [0.0122, 0.212, 0],
  spray_l: [0.0122, 0.253, 0],
};
/** how long a spray can is shaken when it is taken up (s) */
const SHAKE_S = 0.8;

/** a filler a can is held to (render space) */
export interface Dock {
  /** its mouth, and the way out of it (a unit vector: out of the body's side, or up) */
  mouth: THREE.Vector3;
  out: THREE.Vector3;
  /** where one looks from: a cap on top is poured into from this side */
  eye: THREE.Vector3;
  /** 0 held up to it, 1 tipped over and pouring */
  pour: number;
}

/** how far the spout stays off the mouth (m): far enough to see the liquid go in */
const GAP_SIDE = 0.1;
const GAP_TOP = 0.12;
const DEG = Math.PI / 180;

export class HeldThing {
  readonly root = new THREE.Group();
  private readonly mats = new CarMaterials();
  private key = '';
  /** the model in its own frame, centred, scaled to be held */
  private readonly inner = new THREE.Group();
  private large = false;
  private mass = 0;
  /** the view the held thing trails behind (a soft follow of the camera's turn) */
  private readonly lagQ = new THREE.Quaternion();
  private lagInit = false;
  private readonly off = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  /** the model's scale under the hands and its centre (its own frame): the pose at a filler undoes them */
  private fitK = 1;
  private readonly fitC = new THREE.Vector3();
  private toolKind = '';
  /** the tool's model (a spray can's by its size) */
  private modelId = '';
  /** spraying: the point the nozzle turns to (render space), how far it has come up to it (0…1) */
  private sprayAt: THREE.Vector3 | null = null;
  private sprayB = 0;
  private readonly sprayPos = new THREE.Vector3();
  private readonly sprayQ = new THREE.Quaternion();
  /** being shaken: the time left (s) */
  private shakeT = 0;
  private readonly shakeQ = new THREE.Quaternion();
  /** 0 in the hands … 1 at the filler; how far tipped over (0…1) */
  private dockB = 0;
  private pourB = 0;
  private readonly dock = { mouth: new THREE.Vector3(), out: new THREE.Vector3(), eye: new THREE.Vector3(), ok: false };
  private readonly dp = new THREE.Vector3();
  private readonly dq = new THREE.Quaternion();
  private readonly m4 = new THREE.Matrix4();
  private readonly ax = new THREE.Vector3();
  private readonly ay = new THREE.Vector3();
  private readonly az = new THREE.Vector3();
  private readonly t0 = new THREE.Vector3();
  private readonly t1 = new THREE.Vector3();
  private readonly t2 = new THREE.Vector3();
  /** eating, drinking, a pill: how it goes up to the mouth (null: in the hands as usual) */
  private use: { kind: 'eat' | 'pill' | 'drink'; t: number } | null = null;
  /** 0 in the hands … 1 at the mouth, eased; the drink's tilt; what it went up for (the way down) */
  private mouthB = 0;
  private tiltB = 0;
  private mouthKind: 'eat' | 'pill' | 'drink' = 'eat';
  /** the model's height as held (its own up), and whether it lies flat (a packet, a tin) */
  private fitH = 0.19;
  private fitFlat = false;
  private readonly qHand = new THREE.Quaternion();
  private readonly qMouth = new THREE.Quaternion();
  private readonly mouthAt = new THREE.Vector3();
  /** the model's markers in its own frame (M_edge, M_face, M_grip: a tool's working edge, its face, its grip) */
  private readonly marks = new Map<string, THREE.Vector3>();
  /** pinned to a surface (a tool scrubbing it): the model's point `at` put on `pos`, its frame turned to `q` */
  private pinned: { pos: THREE.Vector3; q: THREE.Quaternion; at: THREE.Vector3 } | null = null;
  private pinB = 0;
  private readonly pp = new THREE.Vector3();

  /** what is being done with it (the player's use), every frame */
  setUse(u: { kind: 'eat' | 'pill' | 'drink'; t: number } | null): void {
    this.use = u;
  }

  constructor(core: RenderCore) {
    this.root.name = 'modcar:held';
    this.root.visible = false;
    this.root.add(this.inner);
    core.scene.add(this.root);
  }

  /** what to show (null = empty hands); a new thing loads its model */
  set(held: Held): void {
    const key = !held ? '' : held.kind === 'part' ? `p:${held.inst.uid}:${held.inst.part}:${held.inst.paint}:${held.inst.sub.tire?.part ?? ''}` : held.kind === 'item' ? `i:${held.item.uid}:${held.item.item}:${held.item.tint ?? ''}` : `t:${held.tool.kind}:${held.tool.colour ?? ''}:${held.tool.fuel ?? ''}:${held.tool.tier ?? ''}`;
    if (key === this.key) return;
    this.key = key;
    this.toolKind = held?.kind === 'tool' ? held.tool.kind : '';
    this.modelId = held?.kind === 'tool' ? toolModelId(held.tool) : '';
    this.sprayB = 0;
    this.shakeT = 0;
    this.dockB = 0;
    this.pourB = 0;
    this.inner.clear();
    this.mats.drop(OWNER);
    this.mats.drop(`${OWNER}+tire`);
    if (!held) return;
    if (held.kind === 'item') {
      const it = held.item;
      const d = itemDef(it.item);
      const look = this.mats.look(OWNER, itemPaint(it));
      const obj = itemStandIn(it);
      applyMaterials(obj, look);
      this.large = d.carry === 'large';
      this.mass = itemMass(it);
      this.fit(obj);
      const want = key;
      void itemGlb(d.model).then((m) => {
        if (!m || this.key !== want) return;
        this.inner.clear();
        const real = cloneModel(m);
        applyMaterials(real, look);
        this.fit(real);
      });
      return;
    }
    if (held.kind === 'tool') {
      const t = held.tool;
      const obj = toolModel(t);
      const look = this.mats.look(OWNER, toolLook(t));
      applyMaterials(obj, look);
      this.large = false;
      this.mass = t.kind === 'jerrycan' ? 4 + (t.litres ?? 0) * 0.75 : 1;
      this.fit(obj);
      // its own model, when there is one, in place of the stand-in
      const want = key;
      void toolGlb(toolModelId(t)).then((m) => {
        if (!m || this.key !== want) return;
        this.inner.clear();
        const real = cloneModel(m);
        applyMaterials(real, look);
        this.fit(real);
      });
      return;
    }
    const inst = held.inst;
    const def = partDef(inst.part);
    this.large = def.carry === 'large';
    this.mass = def.mass;
    const look = this.mats.look(OWNER, partLook(inst));
    const group = new THREE.Group();
    const want = key;
    void partModel(inst.part).then((m) => {
      if (this.key !== want) return;
      const obj = cloneModel(m);
      applyMaterials(obj, look);
      group.add(obj);
      const t = inst.sub.tire;
      if (t && def.rim?.tire) {
        void partModel(t.part, inst.part).then((tm) => {
          if (this.key !== want) return;
          const to = seatTyres(m, tm, def.rim!.radius, partDef(t.part).tire!.sidewall, !!t.flat);
          applyMaterials(to, this.mats.look(`${OWNER}+tire`, { paint: 0x222222, paint2: 0xeeeeee, dirt: t.dirt }));
          group.add(to);
          this.fit(group);
        });
      } else this.fit(group);
    });
  }

  /** centre the model, scale it to a held size, keep it out of the shadow maps */
  private fit(obj: THREE.Object3D): void {
    // measured on its own (in its own frame), then hung under the hands
    obj.removeFromParent();
    obj.position.set(0, 0, 0);
    obj.quaternion.identity();
    obj.scale.setScalar(1);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    this.marks.clear();
    obj.traverse((o) => {
      if (o.name === 'M_edge' || o.name === 'M_face' || o.name === 'M_grip') this.marks.set(o.name, o.getWorldPosition(new THREE.Vector3()));
    });
    const big = Math.max(size.x, size.y, size.z, 0.05);
    // how big it may look at arm's length close to the eye: a can fills a hand, an engine the arms
    const k = Math.min(1, (this.large ? 0.36 : 0.19) / big);
    obj.scale.setScalar(k);
    obj.position.set(-c.x * k, -c.y * k, -c.z * k);
    this.fitK = k;
    this.fitC.copy(c);
    this.fitH = size.y * k;
    this.fitFlat = size.y < 0.6 * Math.max(size.x, size.z);
    obj.traverse((o) => {
      o.layers.disable(LAYER_SHADOW_FAR);
      o.layers.disable(LAYER_SHADOW_NEAR);
      o.frustumCulled = false;
    });
    this.inner.add(obj);
  }

  /**
   * Place it in front of the camera (first person on foot only).
   * @param sway the walk's side-to-side (m), bob its up-and-down (m)
   */
  update(dt: number, cam: THREE.Camera, show: boolean, sway: number, bob: number, dock: Dock | null = null): void {
    this.root.visible = show && this.key !== '';
    if (!this.root.visible) {
      this.lagInit = false;
      this.dockB = 0;
      return;
    }
    // heavier things trail the turn of the view more
    if (!this.lagInit || dt <= 0) {
      this.lagQ.copy(cam.quaternion);
      this.lagInit = true;
    } else {
      const rate = 26 / (1 + this.mass / 40);
      this.lagQ.slerp(cam.quaternion, 1 - Math.exp(-dt * rate));
    }
    // camera space: +x right, +y up, −z ahead
    if (this.large) this.off.set(sway * 0.6, -0.44 + bob * 0.7, -0.8);
    else this.off.set(0.3 + sway, -0.27 + bob, -0.6);
    // seen three-quarters: carried across the arms (large), turned a little inward in the hand (small)
    this.e.set(this.large ? 0.32 : 0.15, this.large ? -0.65 : -0.9, this.large ? 0 : 0.08);
    this.qHand.setFromEuler(this.e);
    // eating and drinking (Arctic Drive's timing): up to the mouth in 0.7 s, bites, down again; a drink's
    // neck at the lips with the bottle rising away in front, tipping further while it flows; a pill tips once
    const u = this.use;
    let toMouth = 0;
    let tilt = 0;
    let bite = 0;
    if (u) {
      this.mouthKind = u.kind;
      if (u.kind === 'eat') {
        toMouth = u.t < 3.63 ? Math.min(1, u.t / 0.7) : Math.max(0, 1 - (u.t - 3.63) / 0.27);
        if (u.t > 1.07 && u.t < 3.63) bite = Math.max(0, Math.sin(((u.t - 1.07) / 0.45) * Math.PI * 2));
      } else if (u.kind === 'pill') {
        toMouth = u.t < 1.4 ? Math.min(1, u.t / 0.7) : Math.max(0, 1 - (u.t - 1.4) / 0.8);
        tilt = u.t > 0.7 && u.t < 1.4 ? 1 : 0;
      } else {
        toMouth = Math.min(1, u.t / 0.45);
        tilt = u.t > 0.4 ? 1 : 0;
      }
    }
    this.mouthB += (toMouth - this.mouthB) * (1 - Math.exp(-dt * 14));
    this.tiltB += (tilt - this.tiltB) * (1 - Math.exp(-dt * 8));
    const mb = this.mouthB * this.mouthB * (3 - 2 * this.mouthB);
    this.q.copy(this.qHand);
    if (mb > 0.001) {
      const m = this.mouthAt;
      if (this.mouthKind === 'drink') {
        // its top at the lips, a little below the eye; level at first, tipped up as it flows
        this.e.set(1.62 + 0.5 * this.tiltB, -0.4, 0.12);
        this.qMouth.setFromEuler(this.e);
        this.t1.set(0, 1, 0).applyQuaternion(this.qMouth);
        m.set(0.02, -0.09, -0.13).addScaledVector(this.t1, -this.fitH / 2);
      } else if (this.mouthKind === 'eat') {
        // held up before the mouth (a packet or a tin facing one), towards it with every bite
        this.e.set((this.fitFlat ? 1.15 : 0.4) + 0.25 * bite, -0.3, 0.1);
        this.qMouth.setFromEuler(this.e);
        m.set(0.02, -0.13 + 0.04 * bite, -0.31 + 0.1 * bite);
      } else {
        // the box up to the mouth, tipped once
        this.e.set((this.fitFlat ? 1.15 : 0.45) + 0.9 * this.tiltB, -0.3, 0.1);
        this.qMouth.setFromEuler(this.e);
        m.set(0.02, -0.12, -0.27);
      }
      this.off.lerp(m, mb);
      this.q.slerp(this.qMouth, mb);
    }
    this.off.applyQuaternion(this.lagQ).add(cam.position);
    this.root.position.copy(this.off);
    this.root.quaternion.copy(this.lagQ).multiply(this.q);
    this.root.scale.setScalar(1);
    // shaken when taken up: a few brisk strokes up and down, tipping, swelling and dying away
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      const e = Math.sin((this.shakeT / SHAKE_S) * Math.PI);
      const w = Math.sin(this.shakeT * 44) * e;
      this.t1.set(0, 1, 0).applyQuaternion(this.root.quaternion);
      this.root.position.addScaledVector(this.t1, w * 0.024);
      this.root.quaternion.multiply(this.shakeQ.setFromAxisAngle(this.t2.set(0, 0, 1), w * 0.14));
    }
    // spraying: the can up before the eye, a little in from where it is carried, its nozzle (+x) turned to the
    // point the paint goes to, its top to the view's up
    const sw = this.sprayAt && NOZZLE[this.modelId] ? 1 : 0;
    this.sprayB += (sw - this.sprayB) * (1 - Math.exp(-dt * (sw ? 14 : 9)));
    if (sw === 0 && this.sprayB < 0.002) this.sprayB = 0;
    if (this.sprayB > 0) {
      if (this.sprayAt) {
        this.sprayPos.set(0.21 + sway * 0.5, -0.2 + bob * 0.5, -0.5).applyQuaternion(this.lagQ).add(cam.position);
        this.ax.subVectors(this.sprayAt, this.sprayPos).normalize();
        this.t0.set(0, 1, 0).applyQuaternion(this.lagQ);
        this.az.crossVectors(this.ax, this.t0).normalize();
        this.ay.crossVectors(this.az, this.ax).normalize();
        this.m4.makeBasis(this.ax, this.ay, this.az);
        this.sprayQ.setFromRotationMatrix(this.m4);
      }
      const b = this.sprayB * this.sprayB * (3 - 2 * this.sprayB);
      this.root.position.lerp(this.sprayPos, b);
      this.root.quaternion.slerp(this.sprayQ, b);
    }
    // held to a filler: off to it, lined up, tipping over while it pours
    const spout = SPOUT[this.toolKind];
    if (dock && spout) {
      this.dock.mouth.copy(dock.mouth);
      this.dock.out.copy(dock.out);
      this.dock.eye.copy(dock.eye);
      this.dock.ok = true;
    }
    const want = dock && spout ? 1 : 0;
    this.dockB += (want - this.dockB) * (1 - Math.exp(-dt * (want ? 8 : 11)));
    if (want === 0 && this.dockB < 0.002) this.dockB = 0;
    this.pourB += ((dock?.pour ?? 0) - this.pourB) * (1 - Math.exp(-dt * 6));
    if (this.dockB > 0 && spout && this.dock.ok) {
      this.dockPose(spout, this.pourB);
      const b = this.dockB * this.dockB * (3 - 2 * this.dockB);
      this.root.position.lerp(this.dp, b);
      this.root.quaternion.slerp(this.dq, b);
      this.root.scale.setScalar(1 + (1 / this.fitK - 1) * b);
    }
    // pinned to a surface it scrubs: at its real size, its working point on the point
    const pw = this.pinned ? 1 : 0;
    this.pinB += (pw - this.pinB) * (1 - Math.exp(-dt * (pw ? 22 : 12)));
    if (pw === 0 && this.pinB < 0.002) this.pinB = 0;
    if (this.pinB > 0 && this.pinned) {
      const p = this.pinned;
      // (the model hangs centred under the root: its own point at goes to the root's at − centre)
      this.pp.subVectors(p.at, this.fitC).applyQuaternion(p.q);
      this.pp.subVectors(p.pos, this.pp);
      const b = this.pinB * this.pinB * (3 - 2 * this.pinB);
      this.root.position.lerp(this.pp, b);
      this.root.quaternion.slerp(p.q, b);
      this.root.scale.setScalar(1 + (1 / this.fitK - 1) * b);
    }
    this.root.updateMatrixWorld(true);
    this.mats.setFrameOf(OWNER, this.root.matrixWorld);
  }

  /** spraying: the point (render space) the can's nozzle turns to; null: back in the hands */
  aimSpray(p: THREE.Vector3 | null): void {
    this.sprayAt = p;
  }

  /** the can in the hands is shaken (taken up: the ball rattles in it) */
  shake(): void {
    this.shakeT = SHAKE_S;
  }

  /** where a spray can's nozzle is now and which way it points (render space); null: no spray can in the hands */
  nozzleWorld(out: THREE.Vector3, dir?: THREE.Vector3): THREE.Vector3 | null {
    const n = NOZZLE[this.modelId];
    const obj = this.inner.children[0];
    if (!n || !obj || !this.root.visible) return null;
    obj.updateWorldMatrix(true, false);
    obj.localToWorld(out.set(n[0], n[1], n[2]));
    if (dir) obj.localToWorld(dir.set(n[0] + 1, n[1], n[2])).sub(out).normalize();
    return out;
  }

  /** pin the held thing to a point of a surface (its own point `at` on `pos`, turned to `q`); null: back in the hands */
  pin(p: { pos: THREE.Vector3; q: THREE.Quaternion; at: THREE.Vector3 } | null): void {
    this.pinned = p;
  }

  /** a marker of the held model, in its own frame (null: it has none) */
  marker(name: 'M_edge' | 'M_face' | 'M_grip'): THREE.Vector3 | null {
    return this.marks.get(name) ?? null;
  }

  /** the look of what is in the hands (a part's: its grime mask binds to it) */
  get look(): import('../render/carMaterials').CarLook | undefined {
    return this.mats.lookOf(OWNER);
  }

  /** the held model's box centre, in its own frame */
  get centre(): THREE.Vector3 {
    return this.fitC;
  }

  /** at the filler (0…1 of the way there) */
  get docked(): number {
    return this.dockB;
  }

  /** how far tipped over (0…1) */
  get pouring(): number {
    return this.pourB;
  }

  /**
   * The can at the filler, at its real size: its spout a little off the mouth and turned into it, the
   * can leaning in from beside the line of sight — 45° held up to it, 100° pouring (a cap on top: 55° to
   * 125°). Sets dp, dq: the root's position and turn.
   */
  private dockPose(spout: [number, number, number], pour: number): void {
    const d = this.dock;
    const top = d.out.y > 0.6;
    // the can comes in from the right of the line of sight, so that the mouth and the liquid going into it
    // stay in view: z0, the way its spout end faces (level), from the right towards the mouth (a filler in
    // the body's side: and a little in towards the body); it stands top up, then tips over about x0
    this.az.subVectors(d.mouth, d.eye);
    this.az.y = 0;
    if (this.az.lengthSq() < 1e-6) this.az.set(1, 0, 0);
    this.az.normalize();
    // (the view's right, level)
    this.az.set(-this.az.z, 0, this.az.x);
    // (along the body's side, a touch in towards it: not between the eye and the mouth)
    if (!top) this.az.addScaledVector(this.t1.set(d.out.x, 0, d.out.z), -0.15);
    this.az.negate().normalize();
    const y0 = this.t0.set(0, 1, 0);
    this.ax.crossVectors(y0, this.az).normalize();
    const a0 = top ? 55 : 45;
    const a1 = top ? 125 : 100;
    const th = (a0 + (a1 - a0) * pour) * DEG;
    // y = y0 cos θ + z0 sin θ, z = z0 cos θ − y0 sin θ
    this.ay.copy(y0).multiplyScalar(Math.cos(th)).addScaledVector(this.az, Math.sin(th));
    const z = this.t1.copy(this.az).multiplyScalar(Math.cos(th)).addScaledVector(y0, -Math.sin(th));
    this.m4.makeBasis(this.ax, this.ay, z);
    this.dq.setFromRotationMatrix(this.m4);
    // the spout's tip just off the mouth; the model's origin from there, then the root (which carries the centring)
    const tip = this.t2.copy(d.mouth).addScaledVector(d.out, top ? GAP_TOP : GAP_SIDE);
    // (in the side of a body: a little above the mouth, the liquid falling into it)
    if (!top) tip.y += 0.07;
    const s = this.t1.set(spout[0], spout[1], spout[2]).applyQuaternion(this.dq);
    this.dp.copy(tip).sub(s);
    this.dp.add(this.t0.copy(this.fitC).applyQuaternion(this.dq));
  }

  /** where the spout's tip is now (render space); null when the thing in the hands has none */
  spoutWorld(out: THREE.Vector3): THREE.Vector3 | null {
    const spout = SPOUT[this.toolKind];
    const obj = this.inner.children[0];
    if (!spout || !obj || !this.root.visible) return null;
    obj.updateWorldMatrix(true, false);
    return obj.localToWorld(out.set(spout[0], spout[1], spout[2]));
  }
}
