/**
 * A ModCar vehicle on screen: the frame's model with every fitted part at its mount, the wheels on
 * pivots that follow the simulation, hinged panels that open, the steering wheel, the gauge needles,
 * and the lamps. Kept in step with the build: after a fit or a removal call refresh().
 *
 * Spaces: `root` is the simulation's body frame (origin at the centre of gravity, placed at the
 * vehicle's pose); `model` inside it is the frame model space (origin on the ground under the middle
 * of the wheelbase), offset by the derived centre of gravity.
 */
import * as THREE from 'three';
import type { FillerKind } from './fillers';
import { frameDef, hubsOf } from '../../core/modcar/frames';
import type { Derived } from '../../core/modcar/derive';
import { paintHex } from '../../core/modcar/palette';
import { PAINTED_CATS, paintNow, takesPaint } from '../../core/modcar/paint';
import { partDef } from '../../core/modcar/parts';
import type { Dash } from '../../core/modcar/systems';
import type { Build, MountDef, PartInstance } from '../../core/modcar/types';
import { makePose, type Pose, type VehicleSim } from '../../core/vehicle/sim';
import type { RenderCore } from '../render/core';
import { measureCarShape, type CarLook } from '../render/carMaterials';
import { MergedCar, type PartLook } from '../render/carMerge';
import { castMesh } from '../render/triGrid';
import { glassName } from './grime';
import { partGeo } from '../../core/modcar/geo';
import { addonModel, cageFor, frameVariant, cloneModel, frameModel, panelAddOn, panelPaint, partModel, placeAddOn, seatTyres, standInFrame, stretchFit, type Model } from './assets';
import { applyMaterials, CarMaterials, matNames, type LookOf } from './materials';

const DEG = Math.PI / 180;
/**
 * Parts that move as a whole: never merged (the wheel turns with the steering). The cab's other
 * controls merge like any part — their moving pieces (LEVER, KEY, KNOB_, BUTTON, COVER) stay out of it
 * by name and are what the cockpit turns.
 */
const UNMERGED = new Set(['steering']);
/** what stays out of a merge inside the parts: hinged panels, needles, wipers, the parts' movers, ghosts */
const MOVES = /^(P_|PG_|pivot_|N_|WIPER_|FUEL_CAP|M_|LEVER|KEY|BUTTON|COVER|TAPE_DOOR|KNOB_|LID|FLAP_|FORK|SWINGARM|STAND|SHOCK_|ghost:)/;
/** how far the filler flap swings open (deg) */
const CAP_OPEN_DEG = 105;
/** how far a merged part's dirt or rust may drift before its vertices are written again */
const WEAR_STEP = 0.02;

/** categories that wear the body colour unless painted themselves (paint.ts: what a spray can takes) */
const BODY_COLOURED = PAINTED_CATS;
/** what an engine block, a seat frame or a lamp housing is painted at the factory */
const FACTORY_PART_PAINT = 0x8f3a2c;

interface PanelNode {
  mount: string;
  pivot: THREE.Group;
  /** rotation axis in the pivot's frame and the sign that swings it open (away from the body) */
  axis: THREE.Vector3;
  openRad: number;
  t: number;
  target: number;
  /** the panel's own meshes (skin, inner side) and its window glass */
  skin: THREE.Object3D[];
  glass: THREE.Object3D[];
  /** a wire cage drawn instead of the skin (style 'cage'), made on first use */
  cage: THREE.Object3D | null;
  /** an add-on on the skin that makes its style read (an armour plate riveted on, a fridge's handle) */
  overlay: THREE.Object3D | null;
  style: string;
}

interface Shown {
  key: string;
  holder: THREE.Group;
}

/** a part of a vehicle that can be cleaned (grime.ts): a look's meshes with MASK UVs, and whose they are */
export interface GrimePart {
  /** the look's owner (CarMaterials) */
  owner: string;
  /** the grime mask's key: the instance's uid, or the build's uid and ':body' */
  key: string;
  /** the part (null: the body) */
  inst: PartInstance | null;
  meshes: THREE.Mesh[];
  look: CarLook;
  /** the side of its mask */
  size: number;
  /** 1 the body (sides, windows), 0 a part */
  kind: 0 | 1;
  /** what to call it (the mount's name; the vehicle's for its body) */
  label: string;
}

/** owner names of the looks (CarMaterials): the body, a mount's part, a panel, a wheel (+tire, +turbo, +cage) */
const BODY = 'body';
const partOwner = (mount: string): string => `m:${mount}`;
const panelOwner = (mount: string): string => `p:${mount}`;
const wheelOwner = (i: number): string => `w:${i}`;

export class CarView {
  readonly root = new THREE.Group();
  /** a motorcycle leans about its tyres' contact line: this sits between root and the model */
  private readonly lean = new THREE.Group();
  private readonly leanInner = new THREE.Group();
  readonly model = new THREE.Group();
  readonly mats = new CarMaterials();
  readonly pose: Pose = makePose();
  private frameObj: THREE.Object3D | null = null;
  private readonly mountNodes = new Map<string, THREE.Group>();
  private readonly catOf = new Map<string, string>();
  private readonly shown = new Map<string, Shown>();
  private readonly panels = new Map<string, PanelNode>();
  /** riding on the fork or the swingarm (a motorcycle's): the wheel only spins, its place is the rig's */
  readonly wheels: { pivot: THREE.Group; spin: THREE.Group; holder: THREE.Group; key: string; ridden?: boolean }[] = [];
  readonly needles: Record<string, THREE.Object3D> = {};
  readonly wipers: THREE.Object3D[] = [];
  /** the fuel filler of the frame (where a jerrycan is held), model space */
  fuelCap: THREE.Object3D | null = null;
  readonly ready: Promise<void>;
  /** the frame model is a stand-in (its GLB is not there yet) */
  standIn = true;
  private needle = 0;
  private readonly local = { x: 0, y: 0, z: 0 };
  /** model loads in flight (parts appear when theirs arrive) */
  private readonly loads = new Set<Promise<unknown>>();
  /** past the first build: a part fitted from now on drops into place (and a wheel slides onto its hub) */
  private live = false;
  private readonly settling: { obj: THREE.Object3D; t: number; axis: 'y' | 'z'; from: number }[] = [];
  /**
   * The static parts merged into a mesh per material (docs/MODCAR.md §6 合批): built once the models of a
   * build are in and nothing is settling, thrown away at the next fit or removal (the originals show
   * meanwhile). Ids: 1 = the frame's body, then one per mount.
   */
  private merged: MergedCar | null = null;
  private mergedLook: CarLook | null = null;
  private mergeDirty = true;
  private readonly mergeIds = new Map<string, number>();
  /** what each merged part's vertices were last written with */
  private readonly mergedAs = new Map<number, { paint: number; paint2: number; dirt: number; rust: number; wear: number; crust: number }>();
  private litMerged = -1;
  /** the looks being cleaned (with grime masks): drawn on their own, never merged */
  private readonly grimeHeld = new Set<string>();
  /** the looks a spray can is on (their colour moving every frame, their flash): drawn on their own too */
  private readonly paintHeld = new Set<string>();
  private grimeCache: GrimePart[] | null = null;

  constructor(
    readonly build: Build,
    public derived: Derived,
  ) {
    this.root.name = `modcar:${build.uid}`;
    this.root.add(this.lean);
    this.lean.add(this.leanInner);
    this.leanInner.add(this.model);
    const frame = frameDef(build.frame);
    for (let i = 0; i < 4; i++) {
      const pivot = new THREE.Group();
      const spin = new THREE.Group();
      const holder = new THREE.Group();
      pivot.add(spin);
      spin.add(holder);
      this.leanInner.add(pivot);
      this.wheels.push({ pivot, spin, holder, key: '' });
    }
    for (const m of frame.mounts) {
      this.catOf.set(m.id, m.cat);
      if (m.cat === 'rim') continue;
      const n = new THREE.Group();
      n.name = `M_${m.id}`;
      n.position.set(m.pos.x, m.pos.y, m.pos.z);
      n.quaternion.set(m.quat[0], m.quat[1], m.quat[2], m.quat[3]);
      this.model.add(n);
      this.mountNodes.set(m.id, n);
    }
    this.placeModel();
    this.ready = this.loadFrame().then(() => this.refresh());
  }

  get frame() {
    return frameDef(this.build.frame);
  }

  private track<T>(p: Promise<T>): Promise<T> {
    this.loads.add(p);
    void p.finally(() => this.loads.delete(p));
    return p;
  }

  /** resolves once the frame and every part shown so far have their models in place */
  async settled(): Promise<void> {
    await this.ready;
    while (this.loads.size) await Promise.all([...this.loads]);
  }

  private placeModel(): void {
    const cg = this.derived.cg;
    this.model.position.set(-cg.x, -cg.y, -cg.z);
  }

  private async loadFrame(): Promise<void> {
    const frame = this.frame;
    const m: Model = await frameModel(frame.id, () => standInFrame(frame.body, frame.kind));
    this.standIn = m.standIn;
    const obj = cloneModel(m);
    obj.name = 'FRAME';
    applyMaterials(obj, this.mats.look(BODY, this.bodyLook()));
    this.model.add(obj);
    this.frameObj = obj;
    // hinged panels: P_<mountId>, re-hung on pivots so they swing about their hinges
    for (const mt of frame.mounts) {
      if (!mt.panel) continue;
      const p = obj.getObjectByName(mt.panel);
      if (!p) continue;
      this.hangPanel(mt, p);
    }
    for (const name of ['N_speed', 'N_rpm', 'N_fuel', 'N_temp']) {
      const n = obj.getObjectByName(name);
      if (n) this.needles[name] = n;
    }
    for (const name of ['WIPER_L', 'WIPER_R']) {
      const w = obj.getObjectByName(name);
      if (w) this.wipers.push(w);
    }
    this.fuelCap = obj.getObjectByName('FUEL_CAP') ?? null;
    if (this.fuelCap) this.hangCap(this.fuelCap);
    this.covers = null;
    this.rigBike(obj);
  }

  // ------------------------------------------------------------------ a motorcycle's moving frame

  /** the steering head's pivot (the FORK and what rides on it), the swingarm's, the stand's */
  private fork: { pivot: THREE.Group; axis: THREE.Vector3; rest: THREE.Quaternion; lower: THREE.Object3D | null; lowerRest: THREE.Vector3; lowerAxis: THREE.Vector3; travel: number; hubY: number } | null = null;
  private shocks: { upper: THREE.Group; lower: THREE.Group; upperRest: THREE.Vector3; lowerRest: THREE.Vector3; upperEye: THREE.Vector3; lowerEyeLocal: THREE.Vector3; upperEyeInSwing: THREE.Vector3 }[] = [];
  private swing: { pivot: THREE.Group; axis: THREE.Vector3; rest: THREE.Quaternion; hub: THREE.Vector3; sign: number; length: number } | null = null;
  private stand: { pivot: THREE.Group; axis: THREE.Vector3; rest: THREE.Quaternion; fold: number; t: number } | null = null;

  /** hang an object on a new pivot at `at` (model space), keeping where it is */
  private pivotFor(obj: THREE.Object3D, at: [number, number, number], name: string): THREE.Group {
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.position.set(at[0], at[1], at[2]);
    this.model.add(pivot);
    this.model.updateMatrixWorld(true);
    pivot.updateMatrixWorld(true);
    pivot.attach(obj);
    return pivot;
  }

  private rigBike(obj: THREE.Object3D): void {
    const rig = this.frame.rig;
    if (!rig) return;
    const fork = rig.fork ? obj.getObjectByName('FORK') : undefined;
    if (fork && rig.fork) {
      const pivot = this.pivotFor(fork, rig.fork.pivot, 'pivot_FORK');
      // the parts that ride on the fork (bar, lamp, mirrors, switch) go round with it
      for (const m of this.frame.mounts) {
        if (m.on !== 'FORK') continue;
        const node = this.mountNodes.get(m.id);
        if (node) pivot.attach(node);
      }
      // the lower legs slide on the stanchions with the front suspension, and carry the axle and what is on it
      const lower = rig.fork.lower ? (fork.getObjectByName(rig.fork.lower.object) ?? null) : null;
      if (lower) {
        for (const m of this.frame.mounts) {
          if (m.on !== rig.fork.lower!.object || m.cat === 'rim') continue;
          const node = this.mountNodes.get(m.id);
          if (node) lower.attach(node);
        }
      }
      const hubF = hubsOf(this.frame).fl;
      this.fork = {
        pivot,
        axis: new THREE.Vector3(...rig.fork.axis).normalize(),
        rest: pivot.quaternion.clone(),
        lower,
        lowerRest: lower ? lower.position.clone() : new THREE.Vector3(),
        lowerAxis: new THREE.Vector3(...(rig.fork.lower?.axis ?? rig.fork.axis)).normalize(),
        travel: rig.fork.lower?.travel ?? 0.12,
        hubY: hubF.pos.y,
      };
      // the front wheel rides in the fork (steering about its head, not about the vertical)
      if (hubF.on) this.rideWheel(0, lower ?? fork, hubF.pos);
    }
    const sw = rig.swingarm ? obj.getObjectByName('SWINGARM') : undefined;
    if (sw && rig.swingarm) {
      const pivot = this.pivotFor(sw, rig.swingarm.pivot, 'pivot_SWINGARM');
      const axis = new THREE.Vector3(...rig.swingarm.axis).normalize();
      // which way about the axis lifts the hub: try a small turn
      const hubMount = hubsOf(this.frame).rl;
      const hub = new THREE.Vector3(hubMount.pos.x, hubMount.pos.y, hubMount.pos.z).sub(pivot.position);
      const lifted = hub.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(axis, 0.05));
      this.swing = { pivot, axis, rest: pivot.quaternion.clone(), hub: new THREE.Vector3(hubMount.pos.x, hubMount.pos.y, hubMount.pos.z), sign: lifted.y > hub.y ? 1 : -1, length: Math.max(0.2, rig.swingarm.length) };
      if (hubMount.on) this.rideWheel(2, sw, hubMount.pos);
      // the shocks: each half turns about its own eye to keep pointing at the other's
      for (const k of rig.shocks ?? []) {
        const up = obj.getObjectByName(k.upper);
        const lo = sw.getObjectByName(k.lower);
        if (!up || !lo) continue;
        const ue = new THREE.Vector3(...k.upperEye);
        const le = new THREE.Vector3(...k.lowerEye);
        const upper = this.pivotFor(up, k.upperEye, `pivot_${k.upper}`);
        // the lower half's pivot hangs in the swingarm: its eye in the swingarm's frame
        const lower = new THREE.Group();
        lower.name = `pivot_${k.lower}`;
        sw.add(lower);
        this.model.updateMatrixWorld(true);
        const leW = this.model.localToWorld(le.clone());
        lower.position.copy(sw.worldToLocal(leW.clone()));
        lower.updateMatrixWorld(true);
        lower.attach(lo);
        const ueW = this.model.localToWorld(ue.clone());
        const ueInSwing = sw.worldToLocal(ueW.clone());
        this.shocks.push({ upper, lower, upperRest: le.clone().sub(ue).normalize(), lowerRest: ueInSwing.clone().sub(lower.position).normalize(), upperEye: ue, lowerEyeLocal: lower.position.clone(), upperEyeInSwing: ueInSwing });
      }
    }
    const st = rig.stand ? obj.getObjectByName('STAND') : undefined;
    if (st && rig.stand) {
      const pivot = this.pivotFor(st, rig.stand.pivot, 'pivot_STAND');
      this.stand = { pivot, axis: new THREE.Vector3(...rig.stand.axis).normalize(), rest: pivot.quaternion.clone(), fold: rig.stand.foldDeg * DEG, t: 0 };
    }
  }

  /**
   * Hang a wheel's pivot on the rig piece it rides on (a fork's lower legs, the swingarm), at the hub
   * (model space); from then on the piece places it and the wheel only spins.
   */
  private rideWheel(i: number, on: THREE.Object3D, hub: { x: number; y: number; z: number }): void {
    const w = this.wheels[i];
    this.model.updateMatrixWorld(true);
    const at = this.model.localToWorld(new THREE.Vector3(hub.x, hub.y, 0));
    w.pivot.position.copy(w.pivot.parent ? w.pivot.parent.worldToLocal(at.clone()) : at);
    w.pivot.rotation.set(0, 0, 0);
    w.pivot.updateMatrixWorld(true);
    on.attach(w.pivot);
    w.ridden = true;
  }

  /** whether someone rides it (the stand folds up) */
  ridden = false;
  private readonly qBike = new THREE.Quaternion();
  private readonly vBike = new THREE.Vector3();
  private readonly qShock = new THREE.Quaternion();
  private readonly vShock = new THREE.Vector3();

  private poseBike(dt: number, sim: VehicleSim): void {
    if (this.fork) {
      // as the front wheel turns about the vertical, the fork turns about its head (sign from its axis' up)
      const f = this.fork;
      f.pivot.quaternion.copy(f.rest).multiply(this.qBike.setFromAxisAngle(f.axis, -sim.steerAngle * Math.sign(f.axis.y || 1)));
      // the lower legs slide up the stanchions as the front wheel rises (along the raked axis)
      if (f.lower) {
        sim.wheelLocal(0, this.local);
        const dy = this.local.y + this.derived.cg.y - f.hubY;
        const s = Math.max(-f.travel, Math.min(f.travel, dy / Math.max(0.3, f.lowerAxis.y)));
        f.lower.position.copy(f.lowerRest).addScaledVector(f.lowerAxis, s);
      }
    }
    if (this.swing) {
      // the rear hub's height in model space against where it was modelled
      const s = this.swing;
      sim.wheelLocal(2, this.local);
      const cg = this.derived.cg;
      const dy = this.local.y + cg.y - s.hub.y;
      const a = Math.asin(Math.max(-0.9, Math.min(0.9, dy / s.length)));
      s.pivot.quaternion.copy(s.rest).multiply(this.qBike.setFromAxisAngle(s.axis, s.sign * a));
      // the shock halves keep pointing at each other's eye
      for (const k of this.shocks) {
        // where the lower eye is now (model space): the swingarm turned about its pivot
        const le = this.vBike.copy(k.lowerEyeLocal).applyQuaternion(s.pivot.quaternion).add(s.pivot.position);
        k.upper.quaternion.setFromUnitVectors(k.upperRest, le.sub(k.upperEye).normalize());
        // and the upper eye in the swingarm's frame
        const ue = this.vShock.copy(k.upperEye).sub(s.pivot.position).applyQuaternion(this.qShock.copy(s.pivot.quaternion).invert());
        k.lower.quaternion.setFromUnitVectors(k.lowerRest, ue.sub(k.lowerEyeLocal).normalize());
      }
    }
    if (this.stand) {
      const st = this.stand;
      const want = this.ridden || Math.abs(sim.kmh) > 3 ? 1 : 0;
      st.t += (want - st.t) * Math.min(1, dt * 6);
      st.pivot.quaternion.copy(st.rest).multiply(this.qBike.setFromAxisAngle(st.axis, st.t * st.fold));
    }
    void this.vBike;
  }

  private hangPanel(mt: MountDef, p: THREE.Object3D): void {
    const pivot = new THREE.Group();
    pivot.name = `pivot_${mt.id}`;
    // the panel's origin is on its hinge: the pivot takes its place, the panel sits at the pivot's origin
    pivot.position.copy(p.position);
    pivot.quaternion.copy(p.quaternion);
    p.parent?.add(pivot);
    p.position.set(0, 0, 0);
    p.quaternion.identity();
    pivot.add(p);
    const skin: THREE.Object3D[] = [];
    const glass: THREE.Object3D[] = [];
    p.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (matNames(mesh).some((n) => n.startsWith('glass'))) glass.push(mesh);
      else skin.push(mesh);
    });
    // the glass of a door may be a separate object PG_<mountId>
    const pg = this.frameObj?.getObjectByName(`PG_${mt.id}`);
    if (pg) {
      pivot.attach(pg);
      glass.push(pg);
    }
    const rig = this.frame.rig?.panels[p.name];
    let axis: THREE.Vector3;
    let openRad: number;
    if (rig) {
      // as modelled: a turn of openDeg about the hinge axis (frame space, right hand) opens it
      axis = new THREE.Vector3(...rig.axis).applyQuaternion(pivot.quaternion.clone().invert()).normalize();
      openRad = rig.openDeg * DEG;
    } else {
      // which way is open: Blender's hinge axis z (doors) is our y, its y (bonnets, lids) our z
      axis = mt.hinge === 'y' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
      const box = new THREE.Box3().setFromObject(p);
      const c = box.getCenter(new THREE.Vector3());
      pivot.worldToLocal(c);
      openRad = Math.abs(mt.openDeg ?? 70) * DEG;
      // try both ways: open = the panel's middle moves away from the body's middle
      const away = (sign: number): number => {
        const q = new THREE.Quaternion().setFromAxisAngle(axis, sign * openRad);
        const moved = c.clone().applyQuaternion(q).applyQuaternion(pivot.quaternion).add(pivot.position);
        return Math.abs(moved.z) * 2 + moved.y;
      };
      if (away(-1) > away(1)) axis.negate();
    }
    this.panels.set(mt.id, { mount: mt.id, pivot, axis, openRad, t: 0, target: 0, skin, glass, cage: null, overlay: null, style: 'stock' });
    pivot.visible = false;
  }

  /**
   * Open (1) or shut a panel; false if the frame has no such panel or nothing is fitted. A lid shut over a
   * part that stands taller than the room under it (a diesel six in the pickup) comes down onto it and
   * rests there, propped open as far as it takes.
   */
  setPanelOpen(mount: string, open: boolean): boolean {
    const p = this.panels.get(mount);
    if (!p || !this.build.parts[mount]) return false;
    p.target = open ? 1 : this.lidRest(mount).t;
    return true;
  }

  /**
   * Where a shut lid comes to rest: 0 when what is under it fits, else as far open as it takes to clear
   * the tallest part there (eased the way the lid swings), and that part.
   */
  lidRest(lid: string): { t: number; part: string | null } {
    const p = this.panels.get(lid);
    if (!p || p.openRad === 0) return { t: 0, part: null };
    this.shutOver('');
    let poke = 0;
    let part: string | null = null;
    for (const [mount, l] of this.covers ?? []) {
      if (l !== lid) continue;
      const inst = this.build.parts[mount];
      const m = this.frame.mounts.find((x) => x.id === mount);
      const top = inst ? partGeo(inst.part)?.bbox?.[1][1] : undefined;
      if (!inst || !m?.room || top === undefined) continue;
      // (a few centimetres under the skin are the lid's own room)
      const over = top - m.room.max.y - 0.04;
      if (over > poke) {
        poke = over;
        part = inst.part;
      }
    }
    if (!part) return { t: 0, part: null };
    // the lid turns about its hinge: the angle that lifts it by the overhang about half a metre out
    const a = Math.min(0.6, Math.atan2(poke + 0.03, 0.55) / Math.abs(p.openRad));
    // (its swing is eased: the fraction that gives that angle)
    return { t: 0.5 - Math.sin(Math.asin(1 - 2 * a) / 3), part };
  }

  panelOpen(mount: string): number {
    return this.panels.get(mount)?.t ?? 0;
  }

  hasPanel(mount: string): boolean {
    return this.panels.has(mount);
  }

  // ------------------------------------------------------------------ the fuel filler

  /** the filler flap's hinge (null: the frame has no flap — a motorcycle's filler is the cap on its tank) */
  private capPivot: THREE.Group | null = null;
  /** the neck and its screw cap behind the flap, seen while it stands open */
  private capNeck: THREE.Group | null = null;
  /** which side of the body the flap is on (+1 right, −1 left) */
  private capSide = 1;
  /** the flap's bounds in the model's frame, shut */
  private readonly capBox = new THREE.Box3();

  /**
   * The filler flap (FUEL_CAP of the frame) hung on its front edge, so that it swings out from the body, and
   * the neck with its screw cap put behind it.
   */
  private hangCap(cap: THREE.Object3D): void {
    const parent = cap.parent;
    if (!parent) return;
    this.model.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.model.matrixWorld).invert();
    const box = new THREE.Box3().setFromObject(cap).applyMatrix4(inv);
    if (box.isEmpty()) return;
    this.capBox.copy(box);
    const side = box.min.z + box.max.z >= 0 ? 1 : -1;
    this.capSide = side;
    // (a point of the model's frame in the parent's)
    const toParent = (x: number, y: number, z: number): THREE.Vector3 => parent.worldToLocal(this.model.localToWorld(new THREE.Vector3(x, y, z)));
    // the hinge: up the flap's front edge, on the body's skin
    const skin = side > 0 ? box.min.z : box.max.z;
    const pivot = new THREE.Group();
    pivot.name = 'pivot_FUEL_CAP';
    parent.add(pivot);
    pivot.position.copy(toParent(box.max.x, (box.min.y + box.max.y) / 2, skin));
    pivot.updateMatrixWorld(true);
    pivot.attach(cap);
    this.capPivot = pivot;
    // the neck: a dark round mouth on the skin and the screw cap in it
    const size = Math.min(box.max.x - box.min.x, box.max.y - box.min.y);
    const neck = new THREE.Group();
    neck.name = 'FUEL_CAP_neck';
    const disc = (r: number, proud: number, mat: string): void => {
      const m = new THREE.MeshStandardMaterial();
      m.name = mat;
      const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.004, 24), m);
      d.name = 'FUEL_CAP_neck_part';
      d.rotation.x = Math.PI / 2;
      d.position.z = side * proud;
      neck.add(d);
    };
    disc(size * 0.4, 0.002, 'rubber');
    disc(size * 0.23, 0.007, 'chrome');
    disc(size * 0.08, 0.011, 'trim');
    parent.add(neck);
    neck.position.copy(toParent((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, skin));
    neck.visible = false;
    applyMaterials(neck, this.mats.look(BODY, this.bodyLook()));
    this.capNeck = neck;
  }

  /** has it a filler one can pour fuel into: a flap on the body, or (a motorcycle) the cap on the tank */
  get hasFiller(): boolean {
    return !!this.capPivot || (this.frame.mounts.some((m) => m.cat === 'fuelTank') && !!this.build.parts.fuelTank);
  }

  /** has it a flap over its filler that opens and shuts (a car's on its body, a motorcycle's cap on its tank) */
  get hasFlap(): boolean {
    return !!this.capPivot || !!this.tankCap();
  }

  /** the hinged cap on a motorcycle's tank (fillers.ts), while its tank is fitted */
  private tankCap(): THREE.Object3D | null {
    if (this.capPivot) return null;
    const m = this.fillerMount('fuel');
    const n = m ? this.nodeOf(m) : null;
    return n?.getObjectByName('pivot_FILLER') ?? null;
  }

  /** how far the flap stands open, 0…1 */
  get capAmount(): number {
    return this.cap;
  }

  private readonly capRay = new THREE.Ray();
  private readonly capHitV = new THREE.Vector3();
  private readonly capBig = new THREE.Box3();

  /**
   * Where a ray (render space) meets the filler — the flap (shut where it closes, a little enlarged so it is
   * easy to aim at), or a motorcycle's tank — and how far along it; null when it misses or is further than max.
   */
  capHit(ray: THREE.Ray, max: number): number | null {
    if (this.capPivot) {
      this.model.updateMatrixWorld();
      const inv = new THREE.Matrix4().copy(this.model.matrixWorld).invert();
      const local = this.capRay.copy(ray).applyMatrix4(inv);
      // (towards the outside the flap swings out: the box reaches that far)
      this.capBig.copy(this.capBox).expandByScalar(0.07);
      if (this.capSide > 0) this.capBig.max.z += 0.12;
      else this.capBig.min.z -= 0.12;
      const p = local.intersectBox(this.capBig, this.capHitV);
      if (!p) return null;
      const d = p.distanceTo(local.origin);
      return d <= max ? d : null;
    }
    if (this.tankCap()) return this.fillerHit('fuel', ray, max);
    if (!this.hasFiller) return null;
    const b = this.boundsOf('fuelTank', this.capBig);
    if (!b) return null;
    const p = ray.intersectBox(b.expandByScalar(0.05), this.capHitV);
    if (!p) return null;
    const d = p.distanceTo(ray.origin);
    return d <= max ? d : null;
  }

  /** the filler's place (render space): the middle of the flap shut, or the top of a motorcycle's tank; null without one */
  capWorld(out: THREE.Vector3): THREE.Vector3 | null {
    if (this.capPivot) {
      this.model.updateMatrixWorld();
      return this.model.localToWorld(this.capBox.getCenter(out));
    }
    if (this.fillerMouth('fuel', out, this.fillN)) return out;
    const b = this.hasFiller ? this.boundsOf('fuelTank', this.capBig) : null;
    if (!b) return null;
    b.getCenter(out);
    out.y = b.max.y;
    return out;
  }

  /** where the filler is, in words ("车身右后侧") */
  get capWhere(): string {
    if (!this.capPivot) return '油箱上面';
    const c = this.capBox.getCenter(this.capHitV);
    const end = c.x < -0.3 ? '后' : c.x > 0.3 ? '前' : '中';
    return `车身${this.capSide > 0 ? '右' : '左'}${end}侧`;
  }

  // ------------------------------------------------------------------ the fillers: fuel, water, oil

  private readonly fillP = new THREE.Vector3();
  private readonly fillN = new THREE.Vector3();
  private readonly fillS = new THREE.Sphere();

  /** the mount of the part a filler is on (the tank, the radiator, the engine), when that part is fitted */
  fillerMount(kind: FillerKind): string | null {
    const cat = kind === 'fuel' ? 'fuelTank' : kind === 'water' ? 'radiator' : 'engine';
    return this.frame.mounts.find((m) => m.cat === cat && this.build.parts[m.id])?.id ?? null;
  }

  /** the FILLER marker on a fitted part (a motorcycle's tank cap, a radiator's cap, an engine's oil cap) */
  private fillerMarker(kind: FillerKind): THREE.Object3D | null {
    const m = this.fillerMount(kind);
    const n = m ? this.nodeOf(m) : null;
    const f = n?.getObjectByName('FILLER') ?? null;
    return f && f.userData.filler === kind ? f : null;
  }

  /**
   * A filler's mouth (render space) and the way out of it (a unit vector): the neck behind a car's flap
   * (out of the body's side), the top of a motorcycle's tank cap, a radiator's or an engine's cap (up).
   * False when there is none (the part is not fitted, or has no filler).
   */
  fillerMouth(kind: FillerKind, p: THREE.Vector3, n: THREE.Vector3): boolean {
    if (kind === 'fuel' && this.capPivot && this.capNeck) {
      this.model.updateMatrixWorld();
      this.capNeck.getWorldPosition(p);
      n.set(0, 0, this.capSide).transformDirection(this.model.matrixWorld);
      return true;
    }
    const f = this.fillerMarker(kind);
    if (!f) return false;
    f.updateWorldMatrix(true, false);
    f.getWorldPosition(p);
    n.set(0, 1, 0).transformDirection(f.matrixWorld);
    return true;
  }

  /** how far along a ray (render space) it meets a filler (a little enlarged, to be easy to aim at); null when it misses or is beyond max */
  fillerHit(kind: FillerKind, ray: THREE.Ray, max: number): number | null {
    if (kind === 'fuel' && this.capPivot) return this.capHit(ray, max);
    if (!this.fillerMouth(kind, this.fillP, this.fillN)) return null;
    const r = Math.max(0.11, (this.fillerMarker(kind)?.userData.radius ?? 0.03) * 4);
    this.fillS.set(this.fillP, r);
    const p = ray.intersectSphere(this.fillS, this.capHitV);
    if (!p) return null;
    const d = p.distanceTo(ray.origin);
    return d <= max ? d : null;
  }

  /** can liquid go in there now: fuel when the flap (or the tank's cap) is open; water and oil when no shut bonnet is over them */
  fillerOpen(kind: FillerKind): boolean {
    if (kind === 'fuel') return this.hasFlap ? this.capOpen : !!this.fillerMount('fuel');
    const m = this.fillerMount(kind);
    return !!m && !this.shutOver(m);
  }

  /**
   * Where one takes hold of a panel: on top of it, most of the way from its hinge to its free edge (a
   * bonnet's front, a door's back), world space (render); null without that panel.
   */
  panelGrip(mount: string, out = new THREE.Vector3()): THREE.Vector3 | null {
    const p = this.panels.get(mount);
    const box = this.panelBox(mount, this.gripBox);
    if (!p || !box) return null;
    box.getCenter(out);
    const hinge = p.pivot.getWorldPosition(this.gripV);
    const dx = out.x - hinge.x;
    const dz = out.z - hinge.z;
    out.x += 0.5 * dx;
    out.z += 0.5 * dz;
    out.y = box.max.y;
    return out;
  }
  private readonly gripBox = new THREE.Box3();

  /** the bounds of a panel's skin as it stands now (open or shut), world space (render); null without it */
  panelBox(mount: string, out = new THREE.Box3()): THREE.Box3 | null {
    const p = this.panels.get(mount);
    if (!p || !p.skin.length) return null;
    out.makeEmpty();
    for (const s of p.skin) out.expandByObject(s);
    return out.isEmpty() ? null : out;
  }
  private readonly gripV = new THREE.Vector3();

  /** mount → the lid (hood, trunk) over it, measured from the lids at rest */
  private covers: Map<string, string> | null = null;

  /**
   * The lid (hood or trunk) that is shut over a mount, or null: the parts under a closed bonnet can be
   * reached only once it is open or off. Found by where the lid lies at rest: a mount inside its outline
   * and below it.
   */
  shutOver(mount: string): string | null {
    if (!this.covers) {
      this.covers = new Map();
      const box = new THREE.Box3();
      const inv = new THREE.Matrix4();
      for (const [id, p] of this.panels) {
        const cat = this.catOf.get(id);
        if (cat !== 'hood' && cat !== 'trunk') continue;
        // (measured shut, whatever it is now)
        const q = p.pivot.quaternion.clone();
        p.pivot.quaternion.copy(this.restQuat(p));
        this.model.updateMatrixWorld(true);
        inv.copy(this.model.matrixWorld).invert();
        box.makeEmpty();
        for (const s of p.skin) box.expandByObject(s);
        p.pivot.quaternion.copy(q);
        if (box.isEmpty()) continue;
        box.applyMatrix4(inv);
        for (const m of this.frame.mounts) {
          if (m.panel || m.cat === 'rim' || m.cat === 'bumperFront' || m.cat === 'bumperRear' || m.cat === 'headlight' || m.cat === 'taillight') continue;
          const q = m.pos;
          if (q.x > box.min.x - 0.05 && q.x < box.max.x + 0.05 && q.z > box.min.z - 0.05 && q.z < box.max.z + 0.05 && q.y < box.max.y) this.covers.set(m.id, id);
        }
      }
    }
    const lid = this.covers.get(mount);
    if (!lid || !this.build.parts[lid] || this.panelOpen(lid) > 0.6) return null;
    return lid;
  }

  // ------------------------------------------------------------------ parts

  /** make the scene match the build (call after any fit, removal or repaint) */
  refresh(derived?: Derived): void {
    if (derived) this.derived = derived;
    this.placeModel();
    const frame = this.frame;
    this.mats.set(BODY, this.bodyLook());
    for (const m of frame.mounts) {
      const inst = this.build.parts[m.id] ?? null;
      if (m.cat === 'rim') continue;
      if (m.panel && this.panels.has(m.id)) this.setPanel(m, inst);
      else this.setPart(m, inst);
    }
    // a shut lid comes down onto what now stands under it (or the rest of the way, once it fits)
    for (const [id, p] of this.panels) {
      const cat = this.catOf.get(id);
      if ((cat !== 'hood' && cat !== 'trunk') || !this.build.parts[id] || p.target >= 0.7) continue;
      p.target = this.lidRest(id).t;
      // (built that way: it is already resting there)
      if (!this.live) this.swingPanel(p, p.target);
    }
    this.setWheels();
    this.live = true;
    this.shapeDirty = true;
    // a new build: the merge goes (the originals show) and is made again once the models are in
    this.unmerge();
    this.mergeDirty = true;
    this.grimeCache = null;
  }

  // ------------------------------------------------------------------ grime (grime.ts)

  /** the part (null: the body) a look's owner name stands for; undefined: none, or not one that is cleaned */
  instOfOwner(owner: string): PartInstance | null | undefined {
    if (owner === BODY) return null;
    const [base, sub] = owner.split('+');
    let inst: PartInstance | undefined;
    if (base.startsWith('m:') || base.startsWith('p:')) inst = this.build.parts[base.slice(2)];
    else if (base.startsWith('w:')) {
      const h = hubsOf(this.frame);
      inst = this.build.parts[[h.fl, h.fr, h.rl, h.rr][Number(base.slice(2))]?.id ?? ''];
    }
    if (!inst) return undefined;
    if (sub === 'turbo') return inst.sub.turbo;
    if (sub === 'tire') return inst.sub.tire;
    // (a cage, an add-on: not cleaned)
    return sub ? undefined : inst;
  }

  /** what a look's owner is called (its mount's name; the vehicle's for the body) */
  private ownerLabel(owner: string): string {
    if (owner === BODY) return this.frame.name.zh;
    const [base, sub] = owner.split('+');
    let mount = base.slice(2);
    if (base.startsWith('w:')) {
      const h = hubsOf(this.frame);
      mount = [h.fl, h.fr, h.rl, h.rr][Number(base.slice(2))]?.id ?? '';
    }
    const label = this.frame.mounts.find((m) => m.id === mount)?.label.zh ?? mount;
    return sub === 'tire' ? `${label}轮胎` : sub === 'turbo' ? '涡轮' : label;
  }

  /**
   * What of this vehicle can be cleaned: each look's meshes with MASK UVs (the body's with its windows, a part's,
   * a panel's with its glass, a wheel's rim, its tyre, a turbo), merged away or not.
   */
  grimeParts(): GrimePart[] {
    if (this.grimeCache) return this.grimeCache;
    const ownerOf = new Map<THREE.Material, string>();
    for (const owner of this.mats.owners()) {
      const look = this.mats.lookOf(owner);
      if (look) for (const m of look.materials) ownerOf.set(m, owner);
    }
    const parts = new Map<string, GrimePart>();
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry.hasAttribute('aMaskUv') || !mesh.userData.mask_px) return;
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const owner = ownerOf.get(mat);
      if (!owner || owner === 'merged') return;
      let g = parts.get(owner);
      if (!g) {
        const inst = this.instOfOwner(owner);
        const look = this.mats.lookOf(owner);
        if (inst === undefined || !look) return;
        g = { owner, key: inst ? inst.uid : `${this.build.uid}:body`, inst, meshes: [], look, size: mesh.userData.mask_px as number, kind: owner === BODY ? 1 : 0, label: this.ownerLabel(owner) };
        parts.set(owner, g);
      }
      g.meshes.push(mesh);
      g.size = Math.max(g.size, mesh.userData.mask_px as number);
    });
    this.grimeCache = [...parts.values()];
    return this.grimeCache;
  }

  /** the middle of the windscreen (render space): the body's glass that faces forward; null: none */
  windscreenAt(out: THREE.Vector3): THREE.Vector3 | null {
    if (!this.wsAt) {
      const body = this.grimeParts().find((p) => p.owner === BODY);
      if (!body) return null;
      this.model.updateMatrixWorld(true);
      const toModel = this.model.matrixWorld.clone().invert();
      const box = new THREE.Box3();
      const p = new THREE.Vector3();
      const n = new THREE.Vector3();
      for (const mesh of body.meshes) {
        if (!matNames(mesh).some((x) => glassName(x))) continue;
        const pos = mesh.geometry.getAttribute('position');
        const nor = mesh.geometry.getAttribute('normal');
        const m = toModel.clone().multiply(mesh.matrixWorld);
        for (let i = 0; i < pos.count; i++) {
          n.fromBufferAttribute(nor, i).transformDirection(m);
          if (Math.abs(n.x) < 0.3 || n.x < 0) continue;
          box.expandByPoint(p.fromBufferAttribute(pos, i).applyMatrix4(m));
        }
      }
      if (box.isEmpty()) return null;
      this.wsAt = box.getCenter(new THREE.Vector3());
    }
    this.model.updateMatrixWorld(true);
    return out.copy(this.wsAt).applyMatrix4(this.model.matrixWorld);
  }
  private wsAt: THREE.Vector3 | null = null;

  /** a look is being painted (a spray can on it) or not: the merge is made again without it, or with it */
  setPaintHeld(owner: string, on: boolean): void {
    if (this.paintHeld.has(owner) === on) return;
    if (on) this.paintHeld.add(owner);
    else this.paintHeld.delete(owner);
    this.unmerge();
    this.mergeDirty = true;
  }

  /**
   * What a look's owner is as a thing a spray can goes on (paint.ts): the body, or the part on a mount, and
   * whether it takes paint (a door, a bonnet, a boot lid, a bumper, a mirror); null: not this vehicle's
   */
  paintTarget(owner: string): { inst: PartInstance | null; mount: string | null; paintable: boolean; label: string } | null {
    if (owner === BODY) return { inst: null, mount: null, paintable: true, label: this.frame.name.zh };
    const [base, sub] = owner.split('+');
    if (!base.startsWith('m:') && !base.startsWith('p:') && !base.startsWith('w:')) return null;
    const inst = this.instOfOwner(owner);
    if (!inst) return null;
    const mount = base.startsWith('w:') ? null : base.slice(2);
    const cat = mount ? (this.catOf.get(mount) ?? '') : '';
    const label = sub ? partDef(inst.part).name.zh : this.ownerLabel(owner);
    return { inst, mount, paintable: !sub && !!mount && PAINTED_CATS.has(cat) && takesPaint(inst.part), label };
  }

  /** the look's owner of what is on a mount (null: the body): a door's, a lid's panel, else the part's */
  paintOwner(mount: string | null): string {
    return !mount ? BODY : this.panels.has(mount) ? panelOwner(mount) : partOwner(mount);
  }

  /** the colour a coat of paint on it starts from (sRGB hex): the body's, a part's, a door's under its style */
  paintBase(owner: string): number {
    if (owner === BODY) return paintNow(this.build, 0xd8d4c8);
    const t = this.paintTarget(owner);
    if (!t?.inst || !t.mount) return paintNow(this.build, 0xd8d4c8);
    if (owner.startsWith('p:')) {
      const style = partDef(t.inst.part).panel?.style ?? 'stock';
      if (t.inst.paint >= 0) return paintNow(t.inst, 0);
      return style === 'armor' || style === 'fridge' ? panelPaint(style, 0) : paintNow(this.build, 0xd8d4c8);
    }
    return this.paintOf(t.inst, this.catOf.get(t.mount) ?? '');
  }

  /** a look is being cleaned (its mask on) or not: the merge is made again without it, or with it */
  setGrimeHeld(owner: string, on: boolean): void {
    if (this.grimeHeld.has(owner) === on) return;
    if (on) this.grimeHeld.add(owner);
    else this.grimeHeld.delete(owner);
    this.unmerge();
    this.mergeDirty = true;
    this.grimeCache = null;
  }

  /** the point of a part that can be cleaned a world-space ray meets first, within far (m) */
  grimeCast(origin: THREE.Vector3, dir: THREE.Vector3, far: number): { part: GrimePart; point: THREE.Vector3; normal: THREE.Vector3; dist: number; glass: boolean } | null {
    let best: { part: GrimePart; point: THREE.Vector3; normal: THREE.Vector3; dist: number; glass: boolean } | null = null;
    for (const part of this.grimeParts()) {
      for (const mesh of part.meshes) {
        // (a part merged away still has its meshes, hidden: they are where it is)
        if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
        const h = castMesh(mesh, origin, dir, best ? best.dist : far);
        if (!h || (best && h.dist >= best.dist)) continue;
        best = { part, point: h.point, normal: h.normal, dist: h.dist, glass: matNames(mesh).some((n) => glassName(n)) };
      }
    }
    return best;
  }

  private unmerge(): void {
    if (!this.merged) return;
    this.merged.dispose();
    this.merged = null;
    this.mergeIds.clear();
    this.mergedAs.clear();
    this.litMerged = -1;
  }

  /** merge the static parts when the build has settled */
  private tryMerge(): void {
    if (!this.mergeDirty || this.loads.size || this.settling.length || !this.frameObj) return;
    this.mergeDirty = false;
    const entries: { id: number; object: THREE.Object3D; look: PartLook }[] = [];
    this.mergeIds.clear();
    this.mergedAs.clear();
    const add = (mount: string, object: THREE.Object3D, look: LookOf): void => {
      const id = entries.length + 1;
      this.mergeIds.set(mount, id);
      this.mergedAs.set(id, { paint: look.paint, paint2: look.paint2, dirt: look.dirt ?? 0, rust: look.rust ?? 0, wear: look.wear ?? 0, crust: look.crust ?? 0 });
      entries.push({ id, object, look: { paint: look.paint, paint2: look.paint2, dirt: look.dirt, rust: look.rust, wear: look.wear, crust: look.crust } });
    };
    // (a look being cleaned has its grime mask: drawn on its own)
    if (!this.grimeHeld.has(BODY) && !this.paintHeld.has(BODY)) add(BODY, this.frameObj, this.bodyLook());
    for (const [mount, sh] of this.shown) {
      const inst = this.build.parts[mount];
      const cat = this.catOf.get(mount) ?? '';
      // (what rides on a fork moves with it)
      if (!inst || UNMERGED.has(cat) || this.frame.mounts.find((m) => m.id === mount)?.on) continue;
      if (this.grimeHeld.has(partOwner(mount)) || this.grimeHeld.has(`${partOwner(mount)}+turbo`) || this.paintHeld.has(partOwner(mount))) continue;
      add(mount, sh.holder, this.partLook(inst, cat));
    }
    this.model.updateMatrixWorld(true);
    const merged = new MergedCar(this.model, entries, (o) => MOVES.test(o.name) || !!o.userData.mover);
    this.model.add(merged.group);
    this.grimeCache = null;
    // one look for the merged meshes: the colours and wear are in their vertices, the lamps and the car frame shared
    const look = this.mats.look('merged', { paint: paintNow(this.build, 0xd8d4c8), paint2: paintHex(this.build.paint2) });
    applyMaterials(merged.group, look, true);
    this.merged = merged;
    this.mergedLook = look;
  }

  /** a merged part's paint or wear moved on (the spray can, the sponge, the road's dust): write its vertices again */
  private syncMerged(mount: string, look: LookOf): void {
    const id = this.mergeIds.get(mount);
    const m = this.merged;
    if (!m || id === undefined) return;
    const was = this.mergedAs.get(id);
    if (!was) return;
    const dirt = look.dirt ?? 0;
    const rust = look.rust ?? 0;
    const wear = look.wear ?? 0;
    const paintMoved = was.paint !== look.paint || was.paint2 !== look.paint2;
    const crust = look.crust ?? 0;
    const wearMoved = Math.abs(was.dirt - dirt) > WEAR_STEP || Math.abs(was.rust - rust) > WEAR_STEP || Math.abs(was.wear - wear) > WEAR_STEP || Math.abs(was.crust - crust) > WEAR_STEP;
    if (!paintMoved && !wearMoved) return;
    m.updatePart(id, paintMoved && wearMoved ? { paint: look.paint, paint2: look.paint2, dirt, rust, wear, crust } : paintMoved ? { paint: look.paint, paint2: look.paint2 } : { dirt, rust, wear, crust });
    this.mergedAs.set(id, { paint: look.paint, paint2: look.paint2, dirt, rust, wear, crust });
  }

  /** the body's height and the cabin, measured again once the models of a new build are in */
  private shapeDirty = true;
  private measure(): void {
    if (!this.shapeDirty || this.loads.size) return;
    this.shapeDirty = false;
    this.mats.setShape(measureCarShape(this.model));
  }

  /** a part just fitted eases into its place from a few centimetres off */
  private settle(obj: THREE.Object3D, axis: 'y' | 'z', from: number): void {
    if (!this.live) return;
    obj.position[axis] = from;
    this.settling.push({ obj, t: 0, axis, from });
  }

  /** a part's colour now (a coat of paint going on: on its way there) */
  private paintOf(inst: PartInstance, cat: string): number {
    if (inst.paint >= 0) return paintNow(inst, FACTORY_PART_PAINT);
    return BODY_COLOURED.has(cat) ? paintNow(this.build, FACTORY_PART_PAINT) : FACTORY_PART_PAINT;
  }

  private bodyLook(): LookOf {
    const b = this.build;
    return { paint: paintNow(b, 0xd8d4c8), paint2: paintHex(b.paint2), dirt: b.dirt, rust: b.rust, wear: fade(b.cond), crust: b.crust ?? 0 };
  }

  /** a part's look: its own paint (or the body's / the factory's) and its own wear */
  private partLook(inst: PartInstance, cat: string): LookOf {
    return { paint: this.paintOf(inst, cat), paint2: paintHex(this.build.paint2), dirt: inst.dirt, rust: inst.rust, wear: fade(inst.cond), crust: inst.crust ?? 0 };
  }

  /** a panel's look: the frame's opening in the part's style */
  private panelLook(inst: PartInstance, style: string): LookOf {
    const own = inst.paint >= 0;
    const paint = panelPaint(style, own ? paintNow(inst, 0) : paintNow(this.build, 0xd8d4c8), own);
    return { paint, paint2: paintHex(this.build.paint2), dirt: inst.dirt, rust: style === 'rusty' ? Math.max(0.85, inst.rust) : inst.rust, wear: fade(inst.cond), crust: inst.crust ?? 0 };
  }

  private setPart(m: MountDef, inst: PartInstance | null): void {
    const sub = inst ? Object.entries(inst.sub).map(([k, v]) => `${k}:${v.part}`).join(',') : '';
    const key = inst ? `${inst.uid}|${inst.part}|${sub}` : '';
    const was = this.shown.get(m.id);
    if (was?.key === key) return;
    if (was) was.holder.removeFromParent();
    if (!inst) {
      this.shown.delete(m.id);
      this.mats.drop(partOwner(m.id));
      this.mats.drop(`${partOwner(m.id)}+turbo`);
      return;
    }
    const node = this.mountNodes.get(m.id);
    if (!node) return;
    const holder = new THREE.Group();
    holder.name = `part_${m.id}`;
    holder.userData.mount = m.id;
    node.add(holder);
    this.shown.set(m.id, { key, holder });
    this.settle(holder, 'y', 0.07);
    const def = partDef(inst.part);
    const look = this.mats.look(partOwner(m.id), this.partLook(inst, m.cat));
    void this.track(partModel(inst.part, frameVariant(inst.part, this.frame))).then((model) => {
      if (this.shown.get(m.id)?.holder !== holder) return;
      const obj = cloneModel(model);
      applyMaterials(obj, look);
      if (m.side > 0) obj.scale.z = -1;
      if (def.stretch && m.fit) {
        const s = stretchFit(model, m.fit);
        obj.scale.multiply(s.scale);
        obj.position.add(s.shift.multiply(new THREE.Vector3(1, 1, Math.sign(obj.scale.z))));
      }
      holder.add(obj);
      // a turbo rides on its engine's M_turbo
      const t = inst.sub.turbo;
      if (t) {
        const at = obj.getObjectByName('M_turbo') ?? obj;
        const tl = this.mats.look(`${partOwner(m.id)}+turbo`, this.partLook(t, 'turbo'));
        void this.track(partModel(t.part)).then((tm) => {
          if (this.shown.get(m.id)?.holder !== holder) return;
          const to = cloneModel(tm);
          applyMaterials(to, tl);
          at.add(to);
        });
      } else this.mats.drop(`${partOwner(m.id)}+turbo`);
    });
  }

  private setPanel(m: MountDef, inst: PartInstance | null): void {
    const p = this.panels.get(m.id)!;
    p.pivot.visible = inst !== null;
    if (!inst) {
      p.t = p.target = 0;
      this.setOverlay(p, m, '');
      return;
    }
    const style = partDef(inst.part).panel?.style ?? 'stock';
    const fresh = !this.mats.has(panelOwner(m.id));
    const look = this.mats.look(panelOwner(m.id), this.panelLook(inst, style));
    // (its glass too: the door's window is the door's, its grime mask the door's)
    if (fresh) for (const s of [...p.skin, ...p.glass]) applyMaterials(s, look);
    p.style = style;
    const showGlass = style !== 'cage' && style !== 'fridge';
    for (const g of p.glass) g.visible = showGlass;
    for (const s of p.skin) s.visible = style !== 'cage';
    if (style === 'cage') {
      if (!p.cage) {
        p.cage = cageFor(this.skinBox(p, false));
        applyMaterials(p.cage, this.mats.look(`${panelOwner(m.id)}+cage`, { paint: 0x3a3c40, paint2: 0x3a3c40 }));
        p.pivot.add(p.cage);
      }
      p.cage.visible = true;
    } else if (p.cage) p.cage.visible = false;
    // (the add-on goes with the part: a scoop bonnet's scoop)
    const addOn = `${style}:${inst.part}`;
    if (addOn !== p.overlay?.userData.style) this.setOverlay(p, m, style, inst.part);
  }

  /**
   * The add-on that makes a panel's style read on the car: an armour door or lid gets steel plates riveted
   * over its skin, a fridge door the fridge's handle. Placed from the skin's bounds in the hinge's frame.
   */
  /** the bounds of a panel's skin in its hinge's frame (shut: the open angle taken off, unless `asIs`) */
  private skinBox(p: PanelNode, asIs: boolean): THREE.Box3 {
    const box = new THREE.Box3();
    const q = p.pivot.quaternion.clone();
    if (!asIs) p.pivot.quaternion.identity();
    this.model.updateMatrixWorld(true);
    for (const s of p.skin) box.expandByObject(s);
    box.applyMatrix4(new THREE.Matrix4().copy(p.pivot.matrixWorld).invert());
    p.pivot.quaternion.copy(q);
    return box;
  }

  /**
   * A copy of a mount's panel as it hangs shut (its skin and glass, nothing added on) and what to hang it
   * from: the ghost of a panel to come is in the frame's own shape. Null where the frame has no panel there.
   */
  panelShape(mount: string): { node: THREE.Object3D; make: () => THREE.Object3D } | null {
    const p = this.panels.get(mount);
    const node = p?.pivot.parent;
    if (!p || !node) return null;
    return {
      node,
      make: () => {
        const g = new THREE.Group();
        g.position.copy(p.pivot.position);
        g.quaternion.copy(this.restQuat(p));
        this.model.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(p.pivot.matrixWorld).invert();
        for (const s of [...p.skin, ...p.glass]) {
          s.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (!mesh.isMesh || mesh.userData.ghostDepth || mesh.userData.ghostXray) return;
            const c = new THREE.Mesh(mesh.geometry, mesh.material);
            inv.clone().multiply(mesh.matrixWorld).decompose(c.position, c.quaternion, c.scale);
            g.add(c);
          });
        }
        return g;
      },
    };
  }

  private setOverlay(p: PanelNode, m: MountDef, style: string, part = ''): void {
    p.overlay?.removeFromParent();
    p.overlay = null;
    this.mats.drop(`${panelOwner(m.id)}+add`);
    const file = panelAddOn(style, part, m.cat);
    if (!file) return;
    const holder = new THREE.Group();
    holder.name = `overlay_${m.id}`;
    holder.userData.style = `${style}:${part}`;
    p.pivot.add(holder);
    p.overlay = holder;
    // (measured shut: the open angle taken off)
    const box = this.skinBox(p, false);
    if (box.isEmpty()) return;
    // (a scoop is the bonnet's own sheet: the car's paint; armour plates are bare steel)
    const scoop = file === 'hood_scoop_overlay';
    const look = this.mats.look(`${panelOwner(m.id)}+add`, scoop ? this.panelLook(this.build.parts[m.id]!, 'stock') : { paint: 0x5c6168, paint2: 0x5c6168, rust: 0.25 });
    void this.track(addonModel(file)).then((model) => {
      if (!model || p.overlay !== holder) return;
      const o = cloneModel(model);
      applyMaterials(o, look);
      // which way is out of the skin: a door's side, the top of a bonnet or a boot lid
      placeAddOn(o, file, box, m.cat, m.side > 0 ? 1 : -1);
      holder.add(o);
    });
  }

  private setWheels(): void {
    const frame = this.frame;
    const h = hubsOf(frame);
    const order = [h.fl, h.fr, h.rl, h.rr];
    const single = frame.balance === true;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      const hub = order[i];
      // a motorcycle's simulation has two wheels per axle on the centre line: draw one of each
      const drawn = !(single && (i === 1 || i === 3));
      const inst = drawn ? (this.build.parts[hub.id] ?? null) : null;
      const key = inst ? `${inst.uid}|${inst.part}|${inst.sub.tire?.part ?? ''}|${inst.sub.tire?.flat ? 1 : 0}` : '';
      if (w.key === key) continue;
      w.key = key;
      w.holder.clear();
      // the pivot stays: a ghost of a wheel to come hangs on it
      w.holder.visible = inst !== null;
      if (!inst) {
        this.mats.drop(wheelOwner(i));
        this.mats.drop(`${wheelOwner(i)}+tire`);
        continue;
      }
      const holder = w.holder;
      holder.scale.set(1, 1, hub.side > 0 ? -1 : 1);
      holder.position.set(0, 0, 0);
      // onto the hub along the axle, from outside
      this.settle(holder, 'z', (hub.side || 1) * 0.09);
      const rimDef = partDef(inst.part);
      const rimLook = this.mats.look(wheelOwner(i), this.wheelLook(inst));
      const rimLoad = this.track(partModel(inst.part));
      void rimLoad.then((rm) => {
        if (w.key !== key) return;
        const r = cloneModel(rm);
        applyMaterials(r, rimLook);
        holder.add(r);
      });
      const tire = inst.sub.tire;
      if (!tire) this.mats.drop(`${wheelOwner(i)}+tire`);
      if (tire && rimDef.rim?.tire) {
        const tireLook = this.mats.look(`${wheelOwner(i)}+tire`, this.tireLook(tire));
        void this.track(Promise.all([rimLoad, partModel(tire.part, inst.part)])).then(([rm, tm]) => {
          if (w.key !== key) return;
          // on the rim's tyre seats (two on a dually), stretched to this rim when made for another
          const t = seatTyres(rm, tm, rimDef.rim!.radius, partDef(tire.part).tire!.sidewall, !!tire.flat);
          applyMaterials(t, tireLook);
          holder.add(t);
        });
      }
    }
  }

  private wheelLook(inst: PartInstance): LookOf {
    const paint = inst.paint >= 0 ? paintHex(inst.paint) : 0xc8ccd0;
    return { paint, paint2: paint, dirt: inst.dirt, rust: inst.rust, wear: fade(inst.cond), crust: inst.crust ?? 0 };
  }

  private tireLook(t: PartInstance): LookOf {
    // the white of a whitewall is its second paint
    return { paint: 0x222222, paint2: 0xeeeeee, dirt: t.dirt, rust: 0, wear: 0, crust: t.crust ?? 0 };
  }

  /** keep every look in step with the build: paint, dust, rust (cheap: uniforms only) */
  private updateLooks(): void {
    const b = this.build;
    const body = this.bodyLook();
    this.mats.set(BODY, body);
    this.syncMerged(BODY, body);
    for (const mount of this.shown.keys()) {
      const inst = b.parts[mount];
      if (!inst) continue;
      const look = this.partLook(inst, this.catOf.get(mount) ?? '');
      this.mats.set(partOwner(mount), look);
      this.syncMerged(mount, look);
      const t = inst.sub.turbo;
      if (t) this.mats.set(`${partOwner(mount)}+turbo`, this.partLook(t, 'turbo'));
    }
    for (const [mount, p] of this.panels) {
      const inst = b.parts[mount];
      if (inst) this.mats.set(panelOwner(mount), this.panelLook(inst, p.style));
    }
    const h = hubsOf(this.frame);
    const order = [h.fl, h.fr, h.rl, h.rr];
    for (let i = 0; i < 4; i++) {
      const inst = this.wheels[i].key ? b.parts[order[i].id] : undefined;
      if (!inst) continue;
      this.mats.set(wheelOwner(i), this.wheelLook(inst));
      if (inst.sub.tire) this.mats.set(`${wheelOwner(i)}+tire`, this.tireLook(inst.sub.tire));
    }
  }

  /** light up what is on a mount (the part the mark is on, about to come off); null = nothing */
  highlight(mount: string | null): void {
    const id = mount ? (this.mergeIds.get(mount) ?? -1) : -1;
    if (id !== this.litMerged) {
      this.mergedLook?.setHighlight(id > 0 ? id : null);
      this.litMerged = id;
    }
    if (!mount || id > 0) {
      this.mats.highlight('');
      return;
    }
    if (this.panels.has(mount)) {
      this.mats.highlight(panelOwner(mount));
      return;
    }
    const h = hubsOf(this.frame);
    const i = [h.fl, h.fr, h.rl, h.rr].findIndex((m) => m.id === mount);
    this.mats.highlight(i >= 0 ? wheelOwner(i) : partOwner(mount));
  }

  // ------------------------------------------------------------------ every frame

  update(dt: number, sim: VehicleSim, dash: Dash | null, core: RenderCore, alpha?: number): void {
    sim.renderPose(this.pose, alpha);
    const pose = this.pose;
    core.place(this.root, pose.x, pose.y, pose.z);
    this.root.quaternion.set(pose.qx, pose.qy, pose.qz, pose.qw);
    // a motorcycle's lean (the simulation keeps the body upright and reports the lean it should show)
    // (about the line where the tyres meet the road: sim.leanPivotY, in the body frame)
    const leanRad = this.frame.balance ? sim.lean : 0;
    const pivot = this.frame.balance ? sim.leanPivotY : -sim.spec.cgHeight;
    this.lean.position.set(0, pivot, 0);
    this.leanInner.position.set(0, -pivot, 0);
    this.lean.rotation.x = this.frame.balance ? leanRad : 0;
    for (let i = 0; i < 4; i++) {
      const w = sim.wheels[i];
      const node = this.wheels[i];
      node.spin.rotation.z = -w.spin;
      if (node.ridden) continue;
      sim.wheelLocal(i, this.local);
      node.pivot.position.set(this.local.x, this.local.y, this.frame.balance ? 0 : this.local.z);
      node.pivot.rotation.y = -w.steer;
    }
    const steer = this.shown.get('steering')?.holder;
    if (steer) {
      const ratio = sim.spec.steering.ratio;
      const bar = partDef(this.build.parts.steering?.part ?? 'steer_std').steering?.bar;
      // a handlebar turns with the fork (on a modelled fork it rides on it); a wheel turns `ratio` times as far as the road wheels
      const onFork = !!this.fork && this.frame.mounts.find((m) => m.id === 'steering')?.on === 'FORK';
      if (bar) steer.rotation.y = onFork ? 0 : -sim.steerAngle;
      else steer.rotation.x = sim.steerAngle * ratio;
    }
    // the speedometer with a little lag, like a cable-driven gauge (0–180 km/h, 0–8000 rpm, fuel, 40–130 °C)
    this.needle += (sim.kmh - this.needle) * Math.min(1, dt * 9);
    const on = !!dash && dash.battery > 0.02;
    this.turnNeedle('N_speed', Math.min(1, Math.abs(this.needle) / 180));
    if (dash) {
      this.turnNeedle('N_rpm', Math.min(1, dash.rpm / 8000));
      this.turnNeedle('N_fuel', on ? Math.min(1, dash.fuel) : 0);
      this.turnNeedle('N_temp', on ? Math.min(1, Math.max(0, (dash.coolantC - 40) / 90)) : 0);
    }
    // the wipers sweep with the weather's wipers (0…1 of their sweep)
    for (const w of this.wipers) {
      const r = this.frame.rig?.wipers[w.name];
      if (!r) continue;
      const rest = (w.userData.rest as THREE.Quaternion | undefined) ?? (w.userData.rest = w.quaternion.clone());
      w.quaternion.copy(rest).premultiply(this.qTmp.setFromAxisAngle(this.vTmp.set(...r.axis), this.wiperAngle * r.sweepDeg * DEG));
    }
    // the filler flap swings out on its hinge while it is open (opened by hand, or by a can held to it)
    if (this.capPivot) {
      this.cap += ((this.capOpen ? 1 : 0) - this.cap) * Math.min(1, dt * 9);
      this.capPivot.rotation.y = this.capSide * this.cap * CAP_OPEN_DEG * DEG;
      if (this.capNeck) this.capNeck.visible = this.cap > 0.04;
    } else {
      // a motorcycle's tank cap flips up off its neck
      const tc = this.tankCap();
      if (tc) {
        this.cap += ((this.capOpen ? 1 : 0) - this.cap) * Math.min(1, dt * 9);
        tc.rotation.z = -this.cap * 100 * DEG;
        const neck = tc.parent?.getObjectByName('FLAP_FILLER_neck');
        if (neck) neck.visible = this.cap > 0.04;
      }
    }
    // the rain caps of side stacks ride on the exhaust: shut at rest, fluttering open under load
    for (const [mount, sh] of this.shown) {
      if (this.catOf.get(mount) !== 'exhaust') continue;
      const flaps = (sh.holder.userData.flaps as THREE.Object3D[] | undefined) ?? this.findFlaps(sh.holder);
      if (!flaps.length) continue;
      const flow = dash && dash.running ? Math.min(1, (dash.rpm / Math.max(1000, sim.spec.engine.redline)) * (0.35 + 0.65 * sim.throttle)) : 0;
      this.flap += (flow - this.flap) * Math.min(1, dt * 10);
      const flutter = flow > 0.05 ? 0.06 * Math.sin(this.flapT += dt * (18 + 40 * flow)) : 0;
      for (const f of flaps) f.rotation.z = Math.max(0, this.flap * 1.15 + flutter);
    }
    // lamps: dipped / main beam, tail lamps and brake lights (the brake lights need a battery)
    const lit = dash?.lightsOn ?? false;
    const brake = (sim.brake > 0.05 || sim.hold) && !!dash && dash.battery > 0.02 ? 1 : 0;
    // reversing lamps in reverse with the ignition on (the white segments of the tail lamps)
    const reverse = sim.dir < 0 && sim.selector === 'R' && !!dash && (dash.running || dash.battery > 0.02);
    // the hazard lights blink both amber lamps (with a battery)
    this.blinkT = this.hazard && on ? (this.blinkT + dt) % 0.75 : 0;
    const blink = this.hazard && on && this.blinkT < 0.4;
    this.mats.setLights({ head: lit ? (dash?.lights === 'high' ? 2 : 1) : 0, tail: lit, brake, reverse, dash: lit ? 1 : 0, turnLeft: blink, turnRight: blink });
    // dirt is measured up from the vehicle's own ground; colours and wear follow the build
    this.model.updateWorldMatrix(true, false);
    this.mats.setCarFrame(this.model.matrixWorld);
    this.updateLooks();
    this.measure();
    this.tryMerge();
    this.poseBike(dt, sim);
    // parts just fitted settle (a little past their place and back)
    for (let i = this.settling.length - 1; i >= 0; i--) {
      const st = this.settling[i];
      st.t = Math.min(1, st.t + dt / 0.22);
      const u = st.t - 1;
      const back = 1 + 2.2 * u * u * u + 1.2 * u * u;
      st.obj.position[st.axis] = st.from * (1 - back);
      if (st.t >= 1) {
        st.obj.position[st.axis] = 0;
        this.settling.splice(i, 1);
      }
    }
    // panels swing
    for (const p of this.panels.values()) {
      if (p.t === p.target) continue;
      const step = dt / 0.45;
      p.t = p.target > p.t ? Math.min(p.target, p.t + step) : Math.max(p.target, p.t - step);
      this.swingPanel(p, p.t);
    }
  }

  /** a panel to `t` of its way open (eased) */
  private swingPanel(p: PanelNode, t: number): void {
    p.t = t;
    const e = t * t * (3 - 2 * t);
    p.pivot.quaternion.copy(this.restQuat(p)).multiply(new THREE.Quaternion().setFromAxisAngle(p.axis, e * p.openRad));
  }

  private flap = 0;
  private flapT = 0;
  private cap = 0;
  /** the filler flap is open (the player opens and shuts it; a can held to it opens it) */
  capOpen = false;
  /** the hazard lights are on */
  hazard = false;
  private blinkT = 0;
  /** the hazard lights' lamps are lit this moment (for the relay's tick) */
  get blinking(): boolean {
    return this.hazard && this.blinkT > 0 && this.blinkT < 0.4;
  }
  /** the wipers' place in their sweep, 0…1 (the weather's wipers) */
  wiperAngle = 0;
  private readonly qTmp = new THREE.Quaternion();
  private readonly vTmp = new THREE.Vector3();

  /** a needle at `reading` (0…1 of its dial) about its modelled axis; a stand-in's about x */
  private turnNeedle(name: string, reading: number): void {
    const n = this.needles[name];
    if (!n) return;
    const r = this.frame.rig?.needles[name];
    if (!r) {
      n.rotation.x = -reading * (name === 'N_fuel' || name === 'N_temp' ? 90 : 240) * DEG;
      return;
    }
    const rest = (n.userData.rest as THREE.Quaternion | undefined) ?? (n.userData.rest = n.quaternion.clone());
    n.quaternion.copy(rest).premultiply(this.qTmp.setFromAxisAngle(this.vTmp.set(...r.axis), reading * r.fullDeg * DEG));
  }
  /** an exhaust's FLAP_ movers, found once its model is in (none yet: looked for again next time) */
  private findFlaps(holder: THREE.Object3D): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    holder.traverse((o) => {
      if (o.name.startsWith('FLAP_')) out.push(o);
    });
    if (out.length) holder.userData.flaps = out;
    return out;
  }

  private readonly rest = new Map<string, THREE.Quaternion>();
  private restQuat(p: PanelNode): THREE.Quaternion {
    let q = this.rest.get(p.mount);
    if (!q) {
      q = p.pivot.quaternion.clone();
      this.rest.set(p.mount, q);
    }
    return q;
  }

  // ------------------------------------------------------------------ for picking and ghosts

  /** the object standing for a mount: the part's holder, a panel's pivot, a wheel's holder */
  nodeOf(mount: string): THREE.Object3D | null {
    const s = this.shown.get(mount);
    if (s) return s.holder;
    const p = this.panels.get(mount);
    if (p) return p.pivot;
    const frame = this.frame;
    const h = hubsOf(frame);
    const order = [h.fl, h.fr, h.rl, h.rr];
    const i = order.findIndex((m) => m.id === mount);
    return i >= 0 ? this.wheels[i].holder : null;
  }

  /** the scene node at a mount: parts go in here (wheels: the pivot's spin group) */
  mountNode(mount: string): THREE.Object3D | null {
    const n = this.mountNodes.get(mount);
    if (n) return n;
    const h = hubsOf(this.frame);
    const order = [h.fl, h.fr, h.rl, h.rr];
    const i = order.findIndex((m) => m.id === mount);
    return i >= 0 ? this.wheels[i].spin : null;
  }

  /** world bounds of what is on a mount (render space); null when nothing is shown */
  boundsOf(mount: string, out: THREE.Box3): THREE.Box3 | null {
    const n = this.nodeOf(mount);
    if (!n || !n.visible) return null;
    out.makeEmpty();
    out.expandByObject(n);
    return out.isEmpty() ? null : out;
  }

  dispose(): void {
    this.unmerge();
    this.root.removeFromParent();
    this.mats.dispose();
  }
}

/** faded paint from a part's condition: like new above 70 %, chalky towards nothing */
function fade(cond: number): number {
  return Math.max(0, Math.min(1, (0.7 - cond) / 0.6));
}


