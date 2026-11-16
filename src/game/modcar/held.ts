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
 * tips over and pours. Off the filler it comes back to the hands.
 */
import * as THREE from 'three';
import { partDef } from '../../core/modcar/parts';
import { paintHex } from '../../core/modcar/palette';
import type { RenderCore } from '../render/core';
import { LAYER_SHADOW_FAR, LAYER_SHADOW_NEAR } from '../render/shadow';
import { cloneModel, partModel, seatTyres, toolGlb } from './assets';
import { partLook, toolModel } from './loose';
import { applyMaterials, CarMaterials } from './materials';
import type { Held } from './player';


const OWNER = 'held';

/** where the spout's tip is on each can's model (its own frame, m: the spout end is +z, the top +y) */
const SPOUT: Partial<Record<string, [number, number, number]>> = {
  jerrycan: [0, 0.478, 0.13],
  bottle: [0, 0.363, 0],
  oilcan: [0, 0.293, 0.05],
};

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

  constructor(core: RenderCore) {
    this.root.name = 'modcar:held';
    this.root.visible = false;
    this.root.add(this.inner);
    core.scene.add(this.root);
  }

  /** what to show (null = empty hands); a new thing loads its model */
  set(held: Held): void {
    const key = !held ? '' : held.kind === 'part' ? `p:${held.inst.uid}:${held.inst.part}:${held.inst.paint}:${held.inst.sub.tire?.part ?? ''}` : `t:${held.tool.kind}:${held.tool.colour ?? ''}:${held.tool.fuel ?? ''}`;
    if (key === this.key) return;
    this.key = key;
    this.toolKind = held?.kind === 'tool' ? held.tool.kind : '';
    this.dockB = 0;
    this.pourB = 0;
    this.inner.clear();
    this.mats.drop(OWNER);
    this.mats.drop(`${OWNER}+tire`);
    if (!held) return;
    if (held.kind === 'tool') {
      const t = held.tool;
      const obj = toolModel(t);
      const paint = t.kind === 'jerrycan' ? (t.fuel === 'diesel' ? 0x2f6a3a : 0xb8302a) : t.kind === 'oilcan' ? 0xd8a531 : t.kind === 'spray' ? paintHex(t.colour ?? 0) : 0xe8d257;
      const look = this.mats.look(OWNER, { paint, paint2: paint });
      applyMaterials(obj, look);
      this.large = false;
      this.mass = t.kind === 'jerrycan' ? 4 + (t.litres ?? 0) * 0.75 : 1;
      this.fit(obj);
      // its own model, when there is one, in place of the stand-in
      const want = key;
      void toolGlb(t.kind).then((m) => {
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
    const big = Math.max(size.x, size.y, size.z, 0.05);
    // how big it may look at arm's length close to the eye: a can fills a hand, an engine the arms
    const k = Math.min(1, (this.large ? 0.36 : 0.19) / big);
    obj.scale.setScalar(k);
    obj.position.set(-c.x * k, -c.y * k, -c.z * k);
    this.fitK = k;
    this.fitC.copy(c);
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
    this.off.applyQuaternion(this.lagQ).add(cam.position);
    this.root.position.copy(this.off);
    // seen three-quarters: carried across the arms (large), turned a little inward in the hand (small)
    this.e.set(this.large ? 0.32 : 0.15, this.large ? -0.65 : -0.9, this.large ? 0 : 0.08);
    this.q.setFromEuler(this.e);
    this.root.quaternion.copy(this.lagQ).multiply(this.q);
    this.root.scale.setScalar(1);
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
    this.root.updateMatrixWorld(true);
    this.mats.setFrameOf(OWNER, this.root.matrixWorld);
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
