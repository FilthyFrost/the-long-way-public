/**
 * What is in the hands, drawn in first person (docs/MODCAR.md §5): the part or tool itself, low in
 * front of the eye — small things in the right hand, big ones carried in both arms in the middle —
 * swaying with the walk and trailing the view a little when one turns, more the heavier it is.
 *
 * Drawn at a fraction of its size close to the eye, so it reads as held without covering the mark
 * or the ghost it is about to go on; it casts no shadow.
 */
import * as THREE from 'three';
import { partDef } from '../../core/modcar/parts';
import { paintHex } from '../../core/modcar/palette';
import type { RenderCore } from '../render/core';
import { LAYER_SHADOW_FAR, LAYER_SHADOW_NEAR } from '../render/shadow';
import { cloneModel, partModel, seatTyres, toolGlb } from './assets';
import { toolModel } from './loose';
import { applyMaterials, CarMaterials } from './materials';
import type { Held } from './player';


const OWNER = 'held';

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
    const look = this.mats.look(OWNER, { paint: inst.paint >= 0 ? paintHex(inst.paint) : 0x8f3a2c, paint2: 0xd8d4c8, dirt: inst.dirt, rust: inst.rust });
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
  update(dt: number, cam: THREE.Camera, show: boolean, sway: number, bob: number): void {
    this.root.visible = show && this.key !== '';
    if (!this.root.visible) {
      this.lagInit = false;
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
    this.mats.setFrameOf(OWNER, this.root.matrixWorld);
  }
}
