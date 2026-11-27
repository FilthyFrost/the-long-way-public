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
import { aboardOf, type DoorSteps, doorSteps, roomOf } from '../../core/modcar/aboard';
import { zonesOf } from '../../core/modcar/cargo';
import { frameDef, hubsOf } from '../../core/modcar/frames';
import type { Derived } from '../../core/modcar/derive';
import { paintHex } from '../../core/modcar/palette';
import { PAINTED_CATS, paintNow, takesPaint } from '../../core/modcar/paint';
import { INSIDE_CATS, partDef } from '../../core/modcar/parts';
import type { Dash } from '../../core/modcar/systems';
import type { Build, MountDef, PartInstance } from '../../core/modcar/types';
import { makePose, type Pose, type VehicleSim } from '../../core/vehicle/sim';
import type { RenderCore } from '../render/core';
import { measureCarShape, meshCarMaterialName, type CarLook, type CarMaterialName, type WiperArc } from '../render/carMaterials';
import { MergedCar, type PartLook } from '../render/carMerge';
import { LAYER_SHADOW_FAR, LAYER_SHADOW_NEAR } from '../render/shadow';
import { castMesh } from '../render/triGrid';
import { meshBoxHit } from './aim';
import { glassName } from './grime';
import { partGeo, partTop } from '../../core/modcar/geo';
import { addonModel, cageFor, frameVariant, cloneModel, frameModel, panelAddOn, panelPaint, partModel, placeAddOn, seatTyres, standInFrame, stretchFit, type Model } from './assets';
import { applyMaterials, CarMaterials, matNames, type LookOf } from './materials';
import { Cluster, CLUSTERS, CLUSTER_NODE, cutFramePod } from './cluster';
import { gearedTopKmh } from '../../core/modcar/instruments';
import { tyreStage } from '../../core/modcar/tyres';

const DEG = Math.PI / 180;
/**
 * Parts that move as a whole: never merged (the wheel turns with the steering). The cab's other
 * controls merge like any part — their moving pieces (LEVER, KEY, KNOB_, BUTTON, COVER) stay out of it
 * by name and are what the cockpit turns.
 */
const UNMERGED = new Set(['steering']);
/** the vehicles' merges come at least this far apart (ms), the one ridden in excepted; when the last one was */
const MERGE_GAP_MS = 60;
let lastMergeAt = -Infinity;
/** a parked vehicle's merge is made over frames, this much of a frame each (ms), one vehicle at a time */
const MERGE_SLICE_MS = 3;
let mergingNow: CarView | null = null;
/** what stays out of a merge inside the parts: hinged panels, needles, wipers, the parts' movers, ghosts */
const MOVES = /^(P_|PG_|pivot_|N_|WIPER_|FUEL_CAP|M_|LEVER|KEY|BUTTON|COVER|TAPE_DOOR|KNOB_|LID|FLAP_|FORK|SWINGARM|STAND|SHOCK_|KNUCKLE_|POPUP_|ghost:)/;
/** what of a vehicle throws no shadow into the near map (carView.ts tryMerge): the knuckles under it, the wipers, levers, keys, knobs and needles */
const UNDER_OR_SMALL = /^(KNUCKLE_|WIPER_|LEVER|KEY|KNOB_|BUTTON|N_)/;
/** how far the filler flap swings open (deg) */
const CAP_OPEN_DEG = 105;
/**
 * the steering wheel as Nomad Drive turns it: at most its 45° of road wheel times 1.5 either way, and no faster than its
 * 60° a second times 1.5 (rad, rad/s)
 */
const WHEEL_TURN_MAX = 67.5 * DEG;
const WHEEL_TURN_RATE = 90 * DEG;
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
  /** an axle's part (its struts, its brakes): one at each of its wheels, riding with them */
  units?: THREE.Group[];
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

/**
 * Each living space in its own colours (docs/V3/plan/finish.md §十一 1 内饰): the lining of its walls and ceiling, the
 * covering of its floor (sRGB; the materials 'lining' and 'lino' of the frame's own model — and its wood, where that
 * is not the usual warm one: the Old Elephant's dark).
 * The Whale warm wood with cream, the Old Elephant dark wood with camel, the Camel a school bus's pale lining over its
 * grey rubber floor, the Turtle a pale green; the trailer's and the box van's a workshop's off-white.
 */
const INTERIORS: Readonly<Record<string, Partial<Record<CarMaterialName, number>>>> = {
  rv: { lining: 0xefe6d0, lino: 0x8a6a4c },
  elephant: { lining: 0xc9a878, lino: 0x5a4636, wood: 0x6a4630 },
  camel: { lining: 0xe9e6dc, lino: 0x8b8e90 },
  turtle: { lining: 0xe4e8d6, lino: 0x7d8a82 },
  trailer: { lining: 0xe8e2d2, lino: 0x8b8e90 },
  snail: { lining: 0xe8e2d2, lino: 0x8b8e90 },
};
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
  /** the steering wheel's turn as shown (rad): after the road wheels' angle times its ratio, within its limits */
  private wheelTurn = 0;
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
  /** every mesh a hand's ray can meet, with the owner of its look (targetCast) */
  private targetCache: { mesh: THREE.Mesh; owner: string }[] | null = null;

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
    // (a model in: the meshes a hand's ray can meet are listed again — after the model is put in place, a step on)
    void p.finally(() => {
      this.loads.delete(p);
      queueMicrotask(() => (this.targetCache = null));
    });
    return p;
  }

  /** resolves once the frame and every part shown so far have their models in place */
  async settled(): Promise<void> {
    await this.ready;
    while (this.loads.size) await Promise.all([...this.loads]);
  }

  /** the cab's instruments (cluster.ts): the binnacle where the frame's own dials were; null where the frame has none to put it by */
  cluster: Cluster | null = null;
  /** someone at the wheel (ModGame sets it each frame): the key is on, the instruments lit by the battery with the engine stopped */
  atWheel = false;
  /** the four tyres as the cluster's display shows them (FL, FR, RL, RR; a motorcycle's front and rear) */
  private readonly clusterTyres: number[] = [-1, -1, -1, -1];

  /**
   * The instruments (docs/V3/plan/finish.md §五) put where the frame's own two big dials are, in the space they are
   * modelled in — the fork's, on a motorcycle: it turns with the bars. Their plane from the needles' axis (towards the
   * driver), across the body, and up it. The frame's own pod is cut out of its model for the binnacle (cluster.ts
   * cutFramePod), its needles hidden; the binnacle's shell goes in the frame's model beside the cluster, in the cab's
   * own materials, and is merged with it.
   */
  private fitCluster(): void {
    if (this.cluster) {
      this.cluster.group.removeFromParent();
      this.cluster.shell?.removeFromParent();
      this.cluster.dispose();
      this.cluster = null;
    }
    const spec = CLUSTERS[this.frame.id];
    const ns = this.needles.N_speed;
    const nr = this.needles.N_rpm;
    const obj = this.frameObj;
    if (!spec || !ns || !nr || !ns.parent || ns.parent !== nr.parent || !obj) return;
    const axis = this.frame.rig?.needles.N_speed?.axis;
    const out = new THREE.Vector3(...(axis ?? [-1, 0.3, 0])).normalize();
    if (out.x > 0) out.negate();
    const right = new THREE.Vector3(0, 0, 1).addScaledVector(out, -out.z).normalize();
    const up = new THREE.Vector3().crossVectors(out, right).normalize();
    const mid = ns.position.clone().add(nr.position).multiplyScalar(0.5);
    // (the frame's own pod out of its model: the dials' space from the space its needles are modelled in)
    if (ns.parent === obj) cutFramePod(obj, spec, new THREE.Matrix4().makeBasis(right, up, out).setPosition(mid).invert());
    // (which of its two big dials is the speedometer, how far apart they are, the filler's side for the fuel gauge's arrow)
    const across = nr.position.clone().sub(ns.position).dot(right);
    const cap = obj.getObjectByName('FUEL_CAP');
    obj.updateMatrixWorld(true);
    const fillerRight = !!cap && cap.getWorldPosition(new THREE.Vector3()).applyMatrix4(obj.matrixWorld.clone().invert()).z > 0;
    const c = new Cluster(spec, across >= 0, fillerRight, Math.abs(across));
    c.place(mid, right, up, out);
    ns.parent.add(c.group);
    if (c.shell) {
      ns.parent.add(c.shell);
      applyMaterials(c.shell, this.mats.look(BODY, this.bodyLook()));
    }
    for (const n of Object.values(this.needles)) n.visible = false;
    this.cluster = c;
    c.show(this.clusterLevel());
    this.mergeDirty = true;
    this.targetCache = null;
  }

  /**
   * The wheel (its column with it) seen through in a box on the screen: the instruments behind it are being looked at
   * (docs/V3/plan/finish.md §五). `k` how far (0: not at all), the frame's size and the box's middle and half size in
   * frame px. Its blended programs are compiled ahead, in the background, while one sits at it.
   */
  wheelSeeThrough(k: number, w: number, h: number, box: { x: number; y: number; hx: number; hy: number } | null, renderer: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera): void {
    const look = this.mats.lookOf(partOwner('steering'));
    if (!look) return;
    look.warmSeeThrough(renderer, scene, cam);
    look.setSeeThrough(box ? k : 0, w, h, box ?? undefined);
  }

  /** how much of the instruments is drawn: all of it at the vehicle, the plate alone while it stands off, nothing far off */
  private clusterLevel(): 0 | 1 | 2 {
    return !this.parked ? 0 : this.farLevel ? 2 : 1;
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
    this.buildSteps();
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
    this.fitCluster();
    for (const name of ['WIPER_L', 'WIPER_R']) {
      const w = obj.getObjectByName(name);
      if (w) this.wipers.push(w);
    }
    this.fuelCap = obj.getObjectByName('FUEL_CAP') ?? null;
    if (this.fuelCap) this.hangCap(this.fuelCap);
    this.covers = null;
    this.rigBike(obj);
    this.rigPopups(obj);
    this.hangKnuckles(obj);
  }

  /**
   * Each hub's carrier (the frame's KNUCKLE_<hub>: its flange, studs, spindle and arm: tools/blender/frames) on its
   * wheel's pivot, as the struts and the brakes are (pairUp): it rides and steers with its wheel, and with the
   * wheel off it is what the brake sits behind. (Its origin is the hub's: where the pivot's is at rest.)
   */
  private hangKnuckles(obj: THREE.Object3D): void {
    const h = hubsOf(this.frame);
    [h.fl, h.fr, h.rl, h.rr].forEach((m, i) => {
      const k = m ? obj.getObjectByName(`KNUCKLE_${m.id}`) : undefined;
      if (!k) return;
      k.removeFromParent();
      k.position.set(0, 0, 0);
      k.quaternion.identity();
      this.wheels[i].pivot.add(k);
    });
  }

  // ------------------------------------------------------------------ pop-up headlamps

  /**
   * each pod on its hinge, how far it turns up, and how far up it is (0 shut … 1 up); an elevating roof's lifted
   * instead (lift: its rest and how far), its bellows stretched up under it, driven by roofUp, not the lamps
   */
  private readonly popups: { pivot: THREE.Group; axis: THREE.Vector3; openRad: number; t: number; lift: THREE.Vector3 | null; rest: THREE.Vector3; bellows: THREE.Object3D | null; roof: boolean }[] = [];
  /** the elevating roof wanted up (the camper system's; a frame with one: the Turtle) */
  roofUp = false;
  /** how far up the elevating roof is (0 down … 1 up; none: 0) */
  get roofT(): number {
    for (const p of this.popups) if (p.roof) return p.t;
    return 0;
  }

  /** the pods hung on their hinges, with what rides on them (the lamps) */
  private rigPopups(obj: THREE.Object3D): void {
    for (const [name, p] of Object.entries(this.frame.rig?.popups ?? {})) {
      const pod = obj.getObjectByName(name);
      if (!pod) continue;
      const pivot = this.pivotFor(pod, p.pivot, `pivot_${name}`);
      for (const m of this.frame.mounts) {
        if (m.on !== name) continue;
        const node = this.mountNodes.get(m.id);
        if (node) pivot.attach(node);
      }
      // (an elevating roof's bellows: folded flat under it as built, stretched up as it lifts)
      const bellows = p.bellows ? (obj.getObjectByName(p.bellows) ?? null) : null;
      this.popups.push({ pivot, axis: new THREE.Vector3(...p.axis).normalize(), openRad: p.openDeg * DEG, t: 0, lift: p.lift ? new THREE.Vector3(...p.lift) : null, rest: pivot.position.clone(), bellows, roof: p.driver === 'roof' });
    }
  }

  /** how far up the pop-up lamps are (0 … 1; none: 0) */
  get popupsUp(): number {
    return this.popups.length ? this.popups[0].t : 0;
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
      // (what else rides on the swingarm: the rear brake)
      for (const m of this.frame.mounts) {
        if (m.on !== 'SWINGARM' || m.cat === 'rim') continue;
        const node = this.mountNodes.get(m.id);
        if (node) sw.attach(node);
      }
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
    if (this.uprightLids.has(lid)) return { t: 0, part: null };
    let poke = 0;
    let part: string | null = null;
    for (const [mount, l] of this.covers ?? []) {
      if (l !== lid) continue;
      const inst = this.build.parts[mount];
      const m = this.frame.mounts.find((x) => x.id === mount);
      // (an engine's turbo with it: a big one stands up out of the bay)
      const top = inst ? partTop(inst) : undefined;
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

  // ------------------------------------------------------------------ the steps up into a living space

  /**
   * each doorway's steps outside the body (frame model space: core/modcar/aboard.ts doorSteps), how far they are slid out,
   * and how far back in and up under the body they are stowed
   */
  private readonly steps: { mount: string; st: DoorSteps; group: THREE.Group; out: number; back: number; lift: number }[] = [];

  /**
   * The steps outside a living space's doorways (the player's ask, 2026-11-26: as handsome as Nomad Drive's, part of the
   * camper — the stairwell inside the door is the frame's own): a tread for each rise, a black ribbed rubber mat in a
   * black steel tray with a bright aluminium nosing along its outer edge, on two slim arms that run back in under the
   * body; a ladder of them (a box van's, a trailer's) between two slim aluminium stringers. They slide out from under the
   * body as its door opens and back in and up under it as it shuts.
   */
  private buildSteps(): void {
    const def = aboardOf(this.frame.id);
    if (!def || this.steps.length) return;
    for (const door of def.doors) {
      const st = doorSteps(def, door);
      const o = st.out;
      if (!o) continue;
      const n = o.tops.length;
      const g = new THREE.Group();
      g.name = `STEPS_${door.mount}`;
      // (its own frame: +x the way out, +y up, +z across, from the body's face under the doorway's middle)
      g.rotation.y = Math.atan2(-st.uz, st.ux);
      const w = o.width;
      const trim = new THREE.MeshStandardMaterial({ name: 'trim' });
      const rubber = new THREE.MeshStandardMaterial({ name: 'rubber' });
      const alu = new THREE.MeshStandardMaterial({ name: 'alu' });
      const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, m: THREE.Material, rz = 0): void => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
        b.position.set(x, y, z);
        b.rotation.z = rz;
        b.castShadow = true;
        g.add(b);
      };
      for (let j = 0; j < n; j++) {
        // (the highest against the body's face, the lowest furthest out)
        const top = o.tops[n - 1 - j];
        const s0 = j * o.depth;
        const c = s0 + o.depth / 2;
        box(o.depth - 0.01, 0.024, w, c, top - 0.018, 0, trim);
        box(o.depth - 0.05, 0.006, w - 0.04, c - 0.012, top - 0.003, 0, rubber);
        for (let r = 0; r < 5; r++) box(0.01, 0.004, w - 0.06, s0 + 0.035 + (r * (o.depth - 0.1)) / 4, top + 0.001, 0, rubber);
        box(0.032, 0.03, w + 0.004, s0 + o.depth - 0.021, top - 0.013, 0, alu);
      }
      // two arms under the top tread, back in under the body
      const yArm = o.tops[n - 1] - 0.05;
      for (const side of [-1, 1]) box(o.depth + 0.22, 0.03, 0.03, (o.depth - 0.22) / 2 - 0.02, yArm, side * (w / 2 - 0.09), trim);
      // a ladder's stringers: a flat bar down each side from the top tread's inner edge to the lowest's outer foot
      if (n > 1) {
        const y0 = o.tops[n - 1] - 0.01;
        const y1 = o.tops[0] - 0.05;
        const ds = n * o.depth;
        const len = Math.hypot(ds, y1 - y0);
        for (const side of [-1, 1]) box(len, 0.06, 0.012, ds / 2, (y0 + y1) / 2, side * (w / 2 + 0.008), alu, Math.atan2(y1 - y0, ds));
      }
      // (stowed: drawn back in by its depth, and a single step up under the stairwell or the body's floor)
      const back = n * o.depth + 0.02;
      const under = door.well ? door.well.tops[0] - 0.045 : Math.min(st.floor - 0.1, o.tops[n - 1] + 0.1);
      const lift = n === 1 ? Math.max(0, under - 0.035 - o.tops[0]) : 0;
      g.visible = false;
      applyMaterials(g, this.mats.look(BODY, this.bodyLook()));
      this.model.add(g);
      this.steps.push({ mount: door.mount, st, group: g, out: 0, back, lift });
    }
  }

  /** the steps slid out with their doors (a little after the door starts to open, back in before it shuts) */
  private foldSteps(dt: number): void {
    for (const sp of this.steps) {
      const want = this.panelOpen(sp.mount) > 0.35 ? 1 : 0;
      sp.out += Math.sign(want - sp.out) * Math.min(Math.abs(want - sp.out), dt * 2.8);
      const g = sp.group;
      g.visible = sp.out > 0.01;
      if (!g.visible) continue;
      const e = sp.out * sp.out * (3 - 2 * sp.out);
      // (out and down together, as a step on its linkage swings)
      const st = sp.st;
      const ax = -st.uz;
      const az = st.ux;
      const across = (st.mid[0] - st.inside[0]) * ax + (st.mid[1] - st.inside[1]) * az;
      const sill = st.sill - (1 - e) * sp.back;
      g.position.set(st.inside[0] + st.ux * sill + ax * across, (1 - e) * sp.lift, st.inside[1] + st.uz * sill + az * across);
    }
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
  /** the engine lids that stand up across the body at rest (a rear-engined van's): what they close over is behind them, and nothing comes down onto it */
  private readonly uprightLids = new Set<string>();

  /** the middle of what a mount holds (its room's, else the mount itself), in the model's frame */
  private roomMid(m: MountDef, out: THREE.Vector3): THREE.Vector3 {
    out.set(m.pos.x, m.pos.y, m.pos.z);
    if (!m.room) return out;
    const c = this.roomV.set((m.room.min.x + m.room.max.x) / 2, (m.room.min.y + m.room.max.y) / 2, (m.room.min.z + m.room.max.z) / 2);
    return out.add(c.applyQuaternion(this.roomQ.set(m.quat[0], m.quat[1], m.quat[2], m.quat[3])));
  }
  private readonly coverV = new THREE.Vector3();
  private readonly roomV = new THREE.Vector3();
  private readonly roomQ = new THREE.Quaternion();

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
        // (an engine lid standing up across the body — a rear engine's — closes over what lies behind it, as far
        // as a hand reaches in; a lid lying down, over what is under its outline)
        const upright = cat === 'hood' && box.max.y - box.min.y > 1.5 * (box.max.x - box.min.x);
        if (upright) this.uprightLids.add(id);
        const inward = (box.min.x + box.max.x) / 2 < 0 ? 1 : -1;
        const edge = inward > 0 ? box.min.x : box.max.x;
        for (const m of this.frame.mounts) {
          // (an axle's parts are got at from under the car and through the wheel arches)
          if (m.panel || m.cat === 'rim' || m.cat === 'bumperFront' || m.cat === 'bumperRear' || m.cat === 'headlight' || m.cat === 'taillight' || m.cat === 'suspension' || m.cat === 'brakes' || m.cat === 'diff') continue;
          const q = m.pos;
          if (upright) {
            const c = this.roomMid(m, this.coverV);
            const d = (c.x - edge) * inward;
            if (d > 0 && d < 1.2 && c.z > box.min.z - 0.05 && c.z < box.max.z + 0.05 && c.y > box.min.y - 0.15 && c.y < box.max.y + 0.05) this.covers.set(m.id, id);
          } else if (q.x > box.min.x - 0.05 && q.x < box.max.x + 0.05 && q.z > box.min.z - 0.05 && q.z < box.max.z + 0.05 && q.y < box.max.y) this.covers.set(m.id, id);
        }
      }
    }
    const lid = this.covers.get(mount);
    if (!lid || !this.build.parts[lid] || this.panelOpen(lid) > 0.6) return null;
    return lid;
  }

  /** the mounts under a lid (hood or trunk), whether it is shut or not */
  under(lid: string): string[] {
    this.shutOver('');
    const out: string[] = [];
    for (const [m, l] of this.covers ?? []) if (l === lid) out.push(m);
    return out;
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
    this.targetCache = null;
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
    this.targetCache = null;
  }

  /** every mesh of the vehicle a hand's ray can meet (not its merge, not a ghost), with the owner of its look ('body' for the frame's own) */
  private targetMeshes(): { mesh: THREE.Mesh; owner: string }[] {
    if (this.targetCache) return this.targetCache;
    const ownerOf = new Map<THREE.Material, string>();
    for (const owner of this.mats.owners()) {
      const look = this.mats.lookOf(owner);
      if (look) for (const m of look.materials) ownerOf.set(m, owner);
    }
    const out: { mesh: THREE.Mesh; owner: string }[] = [];
    const walk = (o: THREE.Object3D): void => {
      // (the merge, its hull and far twins, a ghost in the hands' way: not the vehicle as it stands)
      if (o.name.startsWith('merged') || o.name.startsWith('ghost:')) return;
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && !mesh.userData.ghostDepth && !mesh.userData.ghostXray) {
        const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        const owner = ownerOf.get(mat) ?? BODY;
        if (owner !== 'merged') out.push({ mesh, owner });
      }
      for (const c of o.children) walk(c);
    };
    walk(this.root);
    this.targetCache = out;
    return out;
  }

  /** (castShown's: a ray's origin carried on) */
  private readonly csFrom = new THREE.Vector3();

  /**
   * What of the vehicle as it stands a ray (render space) meets first within far, over the same meshes and triangle
   * grids as targetCast (a hundred times quicker than three's ray over every face: a motorhome's 490 000 triangles took
   * it 11 ms a ray — docs/V3/plan/prompts.md §一), but only what is shown: a part hidden is passed over, one hidden
   * because the merge draws it is not (its shape is the merge's). minUp: only a face turned up at least so much
   * (its normal's y) is met, the steeper ones passed through — a thing put down lands on the bed, not the bed's side.
   */
  castShown(origin: THREE.Vector3, dir: THREE.Vector3, far: number, minUp = -2): { owner: string; dist: number; point: THREE.Vector3; normal: THREE.Vector3 } | null {
    let best: { owner: string; dist: number; point: THREE.Vector3; normal: THREE.Vector3 } | null = null;
    this.tcRay.origin.copy(origin);
    this.tcRay.direction.copy(dir);
    for (const { mesh, owner } of this.targetMeshes()) {
      if (!this.shownHere(mesh)) continue;
      const g = mesh.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      mesh.updateWorldMatrix(true, false);
      this.tcSphere.copy(g.boundingSphere!).applyMatrix4(mesh.matrixWorld);
      if (this.tcRay.distanceSqToPoint(this.tcSphere.center) > this.tcSphere.radius * this.tcSphere.radius) continue;
      const along = this.csFrom.copy(this.tcSphere.center).sub(origin).dot(dir);
      if (along + this.tcSphere.radius < 0 || along - this.tcSphere.radius > (best ? best.dist : far)) continue;
      // (a face too steep is passed through: the ray goes on from just beyond it, a few times at most)
      let from = 0;
      for (let k = 0; k < 6; k++) {
        const limit = (best ? best.dist : far) - from;
        if (limit <= 0) break;
        const o = from > 0 ? this.csFrom.copy(origin).addScaledVector(dir, from) : origin;
        const h = castMesh(mesh, o, dir, limit);
        if (!h) break;
        const d = from + h.dist;
        if (h.normal.y >= minUp) {
          if (!best || d < best.dist) best = { owner, dist: d, point: h.point, normal: h.normal };
          break;
        }
        from = d + 1e-3;
      }
    }
    return best;
  }

  /** shown as it stands: itself and all above it to the root visible, or hidden only because the merge draws it */
  private shownHere(mesh: THREE.Object3D): boolean {
    for (let p: THREE.Object3D | null = mesh; p && p !== this.root.parent; p = p.parent) {
      if (!p.visible && !(p === mesh && this.merged?.hides(mesh))) return false;
    }
    return true;
  }

  /** what of a mount's node a ray may meet: its meshes as they stand (no ghost, no merge of its own), each once */
  private aimMeshes(mount: string, out: THREE.Mesh[]): THREE.Object3D | null {
    out.length = 0;
    const n = this.nodeOf(mount);
    if (!n) return null;
    const walk = (o: THREE.Object3D): void => {
      if (o.name.startsWith('merged') || o.name.startsWith('ghost:')) return;
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && !mesh.userData.ghostDepth && !mesh.userData.ghostXray && this.shownHere(mesh)) out.push(mesh);
      for (const c of o.children) walk(c);
    };
    walk(n);
    return n;
  }

  private readonly amList: THREE.Mesh[] = [];

  /**
   * Where a ray (render space) first meets what stands on a mount, by its own meshes as they are drawn (a part's, a
   * panel's skin and glass, a wheel's; a part hidden is passed over, one hidden because the merge draws it is not),
   * within far; null: it misses. The cab's seats, doors and wheel are aimed at so, as Nomad Drive's are by colliders
   * of their own shapes.
   */
  castOn(mount: string, origin: THREE.Vector3, dir: THREE.Vector3, far: number): number | null {
    if (!this.aimMeshes(mount, this.amList)) return null;
    let best = far;
    let hit = false;
    this.tcRay.origin.copy(origin);
    this.tcRay.direction.copy(dir);
    for (const mesh of this.amList) {
      const g = mesh.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      mesh.updateWorldMatrix(true, false);
      this.tcSphere.copy(g.boundingSphere!).applyMatrix4(mesh.matrixWorld);
      if (this.tcRay.distanceSqToPoint(this.tcSphere.center) > this.tcSphere.radius * this.tcSphere.radius) continue;
      const h = castMesh(mesh, origin, dir, best);
      if (h && h.dist <= best) {
        best = h.dist;
        hit = true;
      }
    }
    this.amList.length = 0;
    return hit ? best : null;
  }

  /**
   * Where a ray (render space) first meets the boxes of what stands on a mount as it is drawn now (a lever pulled, a
   * key turned): each of its meshes' own box, in that mesh's own frame — turned with it, so a lever's is the lever's
   * and not the world's box round its sweep — `pad` larger all round; null: it misses within far. The cab's small
   * controls are aimed at so: a box of their own a little larger than they are, as Nomad Drive gives each of its own
   * (its key's 5 cm, a stalk's 3 by 14, a handbrake's socket and lever one each).
   */
  boxCast(mount: string, origin: THREE.Vector3, dir: THREE.Vector3, pad: number, far: number): number | null {
    if (!this.aimMeshes(mount, this.amList)) return null;
    let best = Infinity;
    for (const mesh of this.amList) {
      const d = meshBoxHit(mesh, origin, dir, pad);
      if (d !== null && d < best) best = d;
    }
    this.amList.length = 0;
    return best <= far ? best : null;
  }

  private readonly tcSphere = new THREE.Sphere();
  private readonly tcRay = new THREE.Ray();

  /**
   * What of the vehicle a ray (render space) meets first, within far: from its real meshes, the owner of the look
   * it is (a part 'm:<mount>', a panel 'p:<mount>', a wheel 'w:<i>', a tyre or turbo '+tire' / '+turbo' on it, the
   * body) — docs/V3/plan/hands.md §二: one ray over real shapes, not boxes round them
   */
  targetCast(origin: THREE.Vector3, dir: THREE.Vector3, far: number): { owner: string; dist: number; point: THREE.Vector3; normal: THREE.Vector3; mesh: THREE.Mesh } | null {
    let best: { owner: string; dist: number; point: THREE.Vector3; normal: THREE.Vector3; mesh: THREE.Mesh } | null = null;
    this.tcRay.origin.copy(origin);
    this.tcRay.direction.copy(dir);
    for (const { mesh, owner } of this.targetMeshes()) {
      const g = mesh.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      mesh.updateWorldMatrix(true, false);
      // (the sphere round it first: most of the vehicle is nowhere near the ray)
      this.tcSphere.copy(g.boundingSphere!).applyMatrix4(mesh.matrixWorld);
      const near = this.tcRay.distanceSqToPoint(this.tcSphere.center);
      if (near > this.tcSphere.radius * this.tcSphere.radius) continue;
      const along = this.tcSphere.center.clone().sub(origin).dot(dir);
      if (along + this.tcSphere.radius < 0 || along - this.tcSphere.radius > (best ? best.dist : far)) continue;
      const h = castMesh(mesh, origin, dir, best ? best.dist : far);
      if (!h || (best && h.dist >= best.dist)) continue;
      best = { owner, dist: h.dist, point: h.point, normal: h.normal, mesh };
    }
    return best;
  }

  /** the mount a look's owner stands on ('m:door_FL', 'p:door_FL', 'w:2+tire' …); null: the body, or none */
  mountOfOwner(owner: string): string | null {
    if (owner === BODY) return null;
    const base = owner.split('+')[0];
    if (base.startsWith('m:') || base.startsWith('p:')) return base.slice(2);
    if (base.startsWith('w:')) {
      const h = hubsOf(this.frame);
      return [h.fl, h.fr, h.rl, h.rr][Number(base.slice(2))]?.id ?? null;
    }
    return null;
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

  /** a parked vehicle's merge being made, a step a frame (MergedCar sliced), and whether it was begun parked */
  private merging: { car: MergedCar; parked: boolean } | null = null;

  /** a merge being made given up (the vehicle comes near, a part changes, it goes) */
  private dropMerging(): void {
    if (!this.merging) return;
    this.merging.car.dispose();
    this.merging = null;
    if (mergingNow === this) mergingNow = null;
  }

  /** the merge being made, made on a step; drawn merged once it is whole */
  private stepMerge(): void {
    const m = this.merging;
    if (!m) return;
    if (!m.car.step(MERGE_SLICE_MS)) return;
    this.merging = null;
    if (mergingNow === this) mergingNow = null;
    this.finishMerge(m.car, m.parked);
  }

  private unmerge(): void {
    this.dropMerging();
    if (!this.merged) return;
    this.merged.dispose();
    this.merged = null;
    this.mergeIds.clear();
    this.mergedAs.clear();
    this.litMerged = -1;
  }

  /**
   * Parked: standing well away from the player with nobody at it (ModGame sets it each frame, with some slack): every
   * part merged, the moving ones too in the pose they stand in, so that the whole vehicle costs a handful of draws in
   * each pass (docs/V3/perf-budget.json). Coming near it again, it is taken apart as it was before anything is touched.
   */
  private parked = false;
  get isParked(): boolean {
    return this.parked;
  }
  setParked(on: boolean): void {
    if (on === this.parked) return;
    this.parked = on;
    this.unmerge();
    this.mergeDirty = true;
    this.cluster?.show(this.clusterLevel());
  }

  /**
   * How far off it is drawn (ModGame sets it each frame, with some slack; parked vehicles only): 0 in full, 1 the
   * middle distance (the merged meshes' twins with a third of their triangles), 2 far off (a tenth, the inside of
   * the cab left out): render/carMerge.ts prepareFar, docs/V3/nodes/P3-carfar.md.
   */
  private farLevel: 0 | 1 | 2 = 0;
  get detail(): 0 | 1 | 2 {
    return this.farLevel;
  }
  setDetail(level: 0 | 1 | 2): void {
    if (level === this.farLevel) return;
    this.farLevel = level;
    this.merged?.setLevel(level);
    this.cluster?.show(this.clusterLevel());
  }

  /** merge the static parts when the build has settled */
  private tryMerge(): void {
    if (!this.mergeDirty || this.loads.size || this.settling.length || !this.frameObj) return;
    // (a parked vehicle's merge is made a step a frame, one vehicle at a time: the others wait their turn)
    if (mergingNow && mergingNow !== this && this.parked && !this.ridden) return;
    this.dropMerging();
    // (one vehicle merged at a time, the next a few frames later: three wrecks come in at once by the road)
    const now = performance.now();
    if (now - lastMergeAt < MERGE_GAP_MS && !this.ridden) return;
    lastMergeAt = now;
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
    const parked = this.parked;
    for (const [mount, sh] of this.shown) {
      const inst = this.build.parts[mount];
      const cat = this.catOf.get(mount) ?? '';
      if (!inst) continue;
      // (what rides on a fork moves with it; parked, nothing moves: every part merged where it stands)
      if (!parked && (UNMERGED.has(cat) || sh.units || this.frame.mounts.find((m) => m.id === mount)?.on)) continue;
      if (this.grimeHeld.has(partOwner(mount)) || this.grimeHeld.has(`${partOwner(mount)}+turbo`) || this.paintHeld.has(partOwner(mount))) continue;
      const look = this.partLook(inst, cat);
      if (parked && sh.units) for (const u of sh.units) add(mount, u, look);
      else add(mount, sh.holder, look);
    }
    this.model.updateMatrixWorld(true);
    // (parked, the doors, the bonnet, the wipers and the levers merge too, as they stand; only a held part's ghost stays out)
    // (the instruments have their own texture: never merged, the plate alone drawn while it stands off — cluster.ts)
    const skip = parked ? (o: THREE.Object3D) => o.name.startsWith('ghost:') || o.name === CLUSTER_NODE : (o: THREE.Object3D) => MOVES.test(o.name) || !!o.userData.mover;
    // (a parked vehicle's merge over frames: the road's wrecks are merged as they come into view, a few at a time)
    if (parked && !this.ridden) {
      this.merging = { car: new MergedCar(this.model, entries, skip, true), parked };
      mergingNow = this;
      this.stepMerge();
      return;
    }
    this.finishMerge(new MergedCar(this.model, entries, skip), parked);
  }

  /** a merge made whole: drawn merged, its look given, its far models asked for, its shadow through its hull */
  private finishMerge(merged: MergedCar, parked: boolean): void {
    this.model.add(merged.group);
    this.grimeCache = null;
    this.targetCache = null;
    // one look for the merged meshes: the colours and wear are in their vertices, the lamps and the car frame shared
    const look = this.mats.look('merged', { paint: paintNow(this.build, 0xd8d4c8), paint2: paintHex(this.build.paint2), ...(INTERIORS[this.frame.id] ? { bases: INTERIORS[this.frame.id] } : {}) });
    applyMaterials(merged.group, look, true);
    // (far off the car is one mesh in the paint's material, made once its far twins are in: render/carMerge.ts)
    merged.onFarOne = (mesh) => applyMaterials(mesh, look, true);
    this.merged = merged;
    this.mergedLook = look;
    // (a parked vehicle's far model made at once, in a worker: it is ready by the time the vehicle is far off)
    if (parked) merged.prepareFar();
    if (this.farLevel) merged.setLevel(this.farLevel);
    // (its shadow through one hull, one draw a shadow map — render/carMerge.ts castThroughHull; what rides on the wheels
    // under the body, the knuckles, wipers, levers, keys and needles throw none into the near map: under the body or too
    // small to be seen there)
    // (parked: the hull made from the far twins once they are in — its merged meshes throw their shadows till then)
    if (parked) merged.hullFromTwins();
    else merged.castThroughHull(false);
    if (!parked) {
      for (const sh of this.shown.values()) if (sh.units) for (const u of sh.units) u.traverse((o) => (o as THREE.Mesh).isMesh && o.layers.disable(LAYER_SHADOW_NEAR));
      this.model.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && UNDER_OR_SMALL.test(o.name)) {
          o.layers.disable(LAYER_SHADOW_NEAR);
          o.layers.disable(LAYER_SHADOW_FAR);
        }
      });
    }
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
    // (and the boot: what is in it never gets dirty — its zones' box, docs/V3/plan/hands.md §五)
    let boot: THREE.Box3 | null = null;
    for (const z of zonesOf(this.frame.id)) {
      if (z.wall || (z.id !== 'trunk' && z.id !== 'cabin')) continue;
      const b = new THREE.Box3(new THREE.Vector3(z.x[0], z.floor - 0.08, z.z[0]), new THREE.Vector3(z.x[1], z.top, z.z[1]));
      boot = boot ? boot.union(b) : b;
    }
    const shape = measureCarShape(this.model);
    // (a living space one walks about in is indoors from wall to wall, whether or not a seat or a dial stands in it —
    // docs/V3/plan/finish.md §十一 1: a trailer's box, a bus emptied of its seats; kept under the roof's skin)
    const room = roomOf(this.frame.id);
    if (room) {
      const top = Math.min(room.hi[1], shape.bodyHeight - 0.03);
      const b = new THREE.Box3(new THREE.Vector3(room.lo[0], room.lo[1], room.lo[2]), new THREE.Vector3(room.hi[0], top, room.hi[2]));
      shape.cabin = shape.cabin ? shape.cabin.union(b) : b;
    }
    this.mats.setShape({ ...shape, boot });
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
    const bases = INTERIORS[this.frame.id];
    return { paint: paintNow(b, 0xd8d4c8), paint2: paintHex(b.paint2), dirt: b.dirt, rust: b.rust, wear: fade(b.cond) * (1 - (b.polish ?? 0)), crust: b.crust ?? 0, ...(bases ? { bases } : {}) };
  }

  /** a part's look: its own paint (or the body's / the factory's) and its own wear */
  private partLook(inst: PartInstance, cat: string): LookOf {
    // (what goes inside the car shows no dirt: docs/V3/plan/hands.md §五)
    const inside = INSIDE_CATS.has(cat);
    return { paint: this.paintOf(inst, cat), paint2: paintHex(this.build.paint2), dirt: inside ? 0 : inst.dirt, rust: inside ? 0 : inst.rust, wear: fade(inst.cond) * (1 - (inst.polish ?? 0)), crust: inside ? 0 : (inst.crust ?? 0) };
  }

  /** a panel's look: the frame's opening in the part's style */
  private panelLook(inst: PartInstance, style: string): LookOf {
    const own = inst.paint >= 0;
    const paint = panelPaint(style, own ? paintNow(inst, 0) : paintNow(this.build, 0xd8d4c8), own);
    return { paint, paint2: paintHex(this.build.paint2), dirt: inst.dirt, rust: style === 'rusty' ? Math.max(0.85, inst.rust) : inst.rust, wear: fade(inst.cond) * (1 - (inst.polish ?? 0)), crust: inst.crust ?? 0 };
  }

  private setPart(m: MountDef, inst: PartInstance | null): void {
    const sub = inst ? Object.entries(inst.sub).map(([k, v]) => `${k}:${v.part}`).join(',') : '';
    const key = inst ? `${inst.uid}|${inst.part}|${sub}` : '';
    const was = this.shown.get(m.id);
    if (was?.key === key) return;
    if (was) {
      was.holder.removeFromParent();
      for (const u of was.units ?? []) u.removeFromParent();
    }
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
    const shown: Shown = { key, holder };
    this.shown.set(m.id, shown);
    this.settle(holder, 'y', 0.07);
    const def = partDef(inst.part);
    const look = this.mats.look(partOwner(m.id), this.partLook(inst, m.cat));
    void this.track(partModel(inst.part, frameVariant(inst.part, this.frame))).then((model) => {
      if (this.shown.get(m.id)?.holder !== holder) return;
      const obj = cloneModel(model);
      applyMaterials(obj, look);
      if (m.pair !== undefined) {
        this.pairUp(m, obj, model, look, shown);
        return;
      }
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

  /**
   * An axle's part at each of its wheels (docs/MODCAR.md §22): the left one as modelled, the right one mirrored, each
   * on its wheel's pivot — up and down with the suspension and round with the steering, but not spinning
   */
  private pairUp(m: MountDef, obj: THREE.Group, model: Model, look: CarLook, shown: Shown): void {
    const h = hubsOf(this.frame);
    const ends = m.axle === 'front' ? [h.fl, h.fr] : [h.rl, h.rr];
    const at = m.axle === 'front' ? 0 : 2;
    shown.units = [];
    for (let s = 0; s < 2; s++) {
      const hub = ends[s];
      const u = new THREE.Group();
      u.name = `part_${m.id}_${s ? 'R' : 'L'}`;
      u.userData.mount = m.id;
      const o = s === 0 ? obj : cloneModel(model);
      if (s === 1) {
        applyMaterials(o, look);
        o.scale.z = -1;
      }
      // (in from the hub's face by what the mount leaves: towards the middle of the car)
      const inward = Math.abs(hub.pos.z) - (m.pair ?? 0);
      u.position.set(m.pos.x - hub.pos.x, m.pos.y - hub.pos.y, s === 0 ? inward : -inward);
      u.add(o);
      this.wheels[at + s].pivot.add(u);
      shown.units.push(u);
    }
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
  /** is a face of a door (its normal, render space) its inside, as the door stands now — turned into the car when shut (docs/V3/plan/hands.md §五) */
  panelFacesIn(mount: string, n: THREE.Vector3): boolean {
    const p = this.panels.get(mount);
    const m = this.frame.mounts.find((mm) => mm.id === mount);
    // (a door's side: its own, else the side of the car it is on)
    const side = m ? m.side || Math.sign(m.pos.z) : 0;
    if (!p || !m || !side || !p.pivot.parent) return false;
    p.pivot.updateWorldMatrix(true, false);
    // (the door's swing: its pivot now against its pivot at rest; the outward of its side turned by it)
    const now = p.pivot.getWorldQuaternion(new THREE.Quaternion());
    const rest = p.pivot.parent.getWorldQuaternion(new THREE.Quaternion()).multiply(this.restQuat(p));
    const swing = now.multiply(rest.invert());
    const out = new THREE.Vector3(0, 0, m.side).applyQuaternion(this.model.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(swing);
    return n.dot(out) < 0.1;
  }

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
          const t = seatTyres(rm, tm, rimDef.rim!, partDef(tire.part).tire!.sidewall, !!tire.flat);
          applyMaterials(t, tireLook);
          holder.add(t);
        });
      }
    }
  }

  private wheelLook(inst: PartInstance): LookOf {
    const paint = inst.paint >= 0 ? paintHex(inst.paint) : 0xc8ccd0;
    return { paint, paint2: paint, dirt: inst.dirt, rust: inst.rust, wear: fade(inst.cond) * (1 - (inst.polish ?? 0)), crust: inst.crust ?? 0 };
  }

  private tireLook(t: PartInstance): LookOf {
    // the white of a whitewall is its second paint; its wear is the tread gone (a bald one shines: carMaterials)
    return { paint: 0x222222, paint2: 0xeeeeee, dirt: t.dirt, rust: 0, wear: 1 - (t.tread ?? 1), crust: t.crust ?? 0 };
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

  private readonly outlineBuf: { root: THREE.Object3D; partId: number; extra: THREE.Object3D | null } = { root: this.root, partId: -1, extra: null };

  /** silhouette outline target for a mounted part (render/frame.ts; zero per-frame alloc) */
  outlineTarget(mount: string | null): { root: THREE.Object3D; partId: number; extra: THREE.Object3D | null } | null {
    if (!mount) return null;
    const id = this.mergeIds.get(mount) ?? -1;
    if (id > 0 && this.merged) {
      this.outlineBuf.root = this.merged.group;
      this.outlineBuf.partId = id;
      this.outlineBuf.extra = this.shown.get(mount)?.holder ?? null;
      return this.outlineBuf;
    }
    const panel = this.panels.get(mount);
    if (panel) {
      this.outlineBuf.root = panel.pivot;
      this.outlineBuf.partId = -1;
      this.outlineBuf.extra = null;
      return this.outlineBuf;
    }
    const h = hubsOf(this.frame);
    const i = [h.fl, h.fr, h.rl, h.rr].findIndex((m) => m.id === mount);
    if (i >= 0) {
      this.outlineBuf.root = this.wheels[i].spin;
      this.outlineBuf.partId = -1;
      this.outlineBuf.extra = null;
      return this.outlineBuf;
    }
    const node = this.shown.get(mount)?.holder ?? this.mountNodes.get(mount) ?? null;
    if (!node) return null;
    this.outlineBuf.root = node;
    this.outlineBuf.partId = -1;
    this.outlineBuf.extra = null;
    return this.outlineBuf;
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
    if (this.steps.length) this.foldSteps(dt);
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
      // a handlebar turns with the fork (on a modelled fork it rides on it); a wheel turns `ratio` times as far as the road
      // wheels, as Nomad Drive's does, never past WHEEL_TURN_MAX nor faster than WHEEL_TURN_RATE: a held key turns it
      // smoothly to a modest angle and it comes back the same way, the hands staying where they hold it
      const onFork = !!this.fork && this.frame.mounts.find((m) => m.id === 'steering')?.on === 'FORK';
      if (bar) steer.rotation.y = onFork ? 0 : -sim.steerAngle;
      else {
        const want = Math.max(-WHEEL_TURN_MAX, Math.min(WHEEL_TURN_MAX, sim.steerAngle * ratio));
        const step = WHEEL_TURN_RATE * Math.max(0, dt);
        this.wheelTurn += Math.max(-step, Math.min(step, want - this.wheelTurn));
        steer.rotation.x = this.wheelTurn;
      }
    }
    // the speedometer with a little lag, like a cable-driven gauge (0–180 km/h, 0–8000 rpm, fuel, 40–130 °C): the frame's
    // own needles, where it has no cluster of its own
    const on = !!dash && dash.battery > 0.02;
    if (!this.cluster) {
      this.needle += (sim.kmh - this.needle) * Math.min(1, dt * 9);
      this.turnNeedle('N_speed', Math.min(1, Math.abs(this.needle) / 180));
      if (dash) {
        this.turnNeedle('N_rpm', Math.min(1, dash.rpm / 8000));
        this.turnNeedle('N_fuel', on ? Math.min(1, dash.fuel) : 0);
        this.turnNeedle('N_temp', on ? Math.min(1, Math.max(0, (dash.coolantC - 40) / 90)) : 0);
      }
    }
    // the instruments: what the dashboard data says, as it is — the key on with someone at the wheel or the engine running
    const c = this.cluster;
    if (c) {
      c.setScales(gearedTopKmh(sim.spec), sim.spec.engine.redline);
      const t = this.clusterTyres;
      if (dash) {
        // (a motorcycle's two wheels are each twice in the simulation: its display has the front and the back once)
        const two = !!this.frame.balance;
        t.length = two ? 2 : 4;
        for (let i = 0; i < t.length; i++) {
          const ty = two ? dash.tyres[i * 2] : dash.tyres[i];
          t[i] = !ty || ty.tread < 0 ? -1 : ty.flat ? 4 : tyreStage(ty.tread);
        }
      }
      const power = on && !!dash && (dash.running || dash.cranking || this.atWheel);
      c.update({ dash, kmh: sim.kmh, power, blink: this.hazard && on && this.blinkT > 0 && this.blinkT < 0.4, lit: !!dash?.lightsOn, tyres: t }, dt);
    }
    // the wipers sweep with the weather's wipers (0…1 of their sweep)
    const arcs: WiperArc[] = [];
    for (const w of this.wipers) {
      const r = this.frame.rig?.wipers[w.name];
      if (!r) continue;
      const rest = (w.userData.rest as THREE.Quaternion | undefined) ?? (w.userData.rest = w.quaternion.clone());
      // (its arc of the windscreen, measured once, at rest)
      const arc = (w.userData.arc as WiperArc | null | undefined) ?? (w.userData.arc = this.wiperArc(w, r, rest));
      if (arc) arcs.push(arc);
      w.quaternion.copy(rest).premultiply(this.qTmp.setFromAxisAngle(this.vTmp.set(...r.axis), this.wiperAngle * r.sweepDeg * DEG));
    }
    // the glass they go over: clear where they went, the rain beading on it again behind them
    const wp = this.wipe;
    for (const look of [this.mats.lookOf(BODY), this.mergedLook]) {
      if (!look) continue;
      look.setWipers(arcs);
      look.setWipe(wp.phase, wp.period, wp.regrow, wp.wiped);
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
    // (pop-up lamps come up while the lamps are on, in about half a second, eased)
    for (const pp of this.popups) {
      // (an elevating roof goes up and down in a second and a half, on its own word; the lamps' pods with the lamps)
      const want = pp.roof ? this.roofUp : lit;
      const time = pp.roof ? 1.5 : 0.45;
      pp.t = want ? Math.min(1, pp.t + dt / time) : Math.max(0, pp.t - dt / time);
      const e = pp.t * pp.t * (3 - 2 * pp.t);
      if (pp.lift) {
        pp.pivot.position.copy(pp.rest).addScaledVector(pp.lift, e);
        if (pp.bellows) pp.bellows.scale.y = Math.max(0.02, e);
      } else pp.pivot.quaternion.setFromAxisAngle(pp.axis, e * pp.openRad);
    }
    const brake = (sim.brake > 0.05 || sim.hold) && !!dash && dash.battery > 0.02 ? 1 : 0;
    // reversing lamps in reverse with the ignition on (the white segments of the tail lamps)
    const reverse = sim.dir < 0 && sim.selector === 'R' && !!dash && (dash.running || dash.battery > 0.02);
    // the hazard lights blink both amber lamps (with a battery)
    this.blinkT = this.hazard && on ? (this.blinkT + dt) % 0.75 : 0;
    const blink = this.hazard && on && this.blinkT < 0.4;
    // (what its lamps at the back show now: a trailer on its ball shows the same — it has no battery of its own)
    const now = this.lampsNow;
    now.tail = lit;
    now.brake = brake;
    now.reverse = reverse;
    now.blink = blink;
    const as = this.lampsAs;
    if (as) this.mats.setLights({ head: 0, tail: as.tail, brake: as.brake, reverse: as.reverse, dash: 0, turnLeft: as.blink, turnRight: as.blink });
    else this.mats.setLights({ head: lit ? (dash?.lights === 'high' ? 2 : 1) : 0, tail: lit, brake, reverse, dash: lit ? 1 : 0, turnLeft: blink, turnRight: blink });
    // dirt is measured up from the vehicle's own ground; colours and wear follow the build
    this.model.updateWorldMatrix(true, false);
    this.mats.setCarFrame(this.model.matrixWorld);
    this.updateLooks();
    this.measure();
    // (a merge being made goes on a step; a new one is begun only once nothing is being merged)
    this.stepMerge();
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
  /** what the lamps at its back show now: the tail lamps, the brake lights, the reversing lamps, the hazards' blink */
  readonly lampsNow = { tail: false, brake: 0, reverse: false, blink: false };
  /** a trailer on a vehicle's ball: that vehicle's lamps (its lampsNow), shown by its own; null: its own switches */
  lampsAs: { tail: boolean; brake: number; reverse: boolean; blink: boolean } | null = null;
  /** the hazard lights' lamps are lit this moment (for the relay's tick) */
  get blinking(): boolean {
    return this.hazard && this.blinkT > 0 && this.blinkT < 0.4;
  }
  /** the wipers' place in their sweep, 0…1 (the weather's wipers) */
  wiperAngle = 0;
  /**
   * The wipers on the glass: where they are in their cycle (0…1, the weather's), the seconds a cycle (0: parked),
   * the seconds the rain takes to bead again behind a blade, and the dust they took off their arcs of the windscreen
   */
  readonly wipe = { phase: 0, period: 0, regrow: 1.5, wiped: 0 };

  /** a wiper's arc of the windscreen (the model's frame), from where it rests and its blade's reach; null: none */
  private wiperArc(w: THREE.Object3D, r: { axis: [number, number, number]; sweepDeg: number }, rest: THREE.Quaternion): WiperArc | null {
    const parent = w.parent;
    if (!parent) return null;
    this.model.updateWorldMatrix(true, false);
    w.updateWorldMatrix(true, true);
    const toModel = new THREE.Matrix4().copy(this.model.matrixWorld).invert().multiply(parent.matrixWorld);
    const rot = new THREE.Matrix3().setFromMatrix4(toModel);
    const pivot = w.position.clone().applyMatrix4(toModel);
    const axis = new THREE.Vector3(...r.axis).applyMatrix3(rot).normalize();
    // (the arm lies along the wiper's own +x)
    const arm = new THREE.Vector3(1, 0, 0).applyQuaternion(rest).applyMatrix3(rot);
    arm.addScaledVector(axis, -arm.dot(axis));
    if (arm.lengthSq() < 1e-8) return null;
    arm.normalize();
    // the blade's reach along the arm (its own frame): its rubber's, else most of the arm's
    const inv = new THREE.Matrix4().copy(w.matrixWorld).invert();
    const m = new THREE.Matrix4();
    const v = new THREE.Vector3();
    let r1 = 0;
    let r0 = Infinity;
    w.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const pos = mesh.geometry.getAttribute('position');
      if (!pos) return;
      m.multiplyMatrices(inv, mesh.matrixWorld);
      const groups = mesh.geometry.groups.length && Array.isArray(mesh.material) ? mesh.geometry.groups : [{ start: 0, count: Infinity, materialIndex: 0 }];
      const index = mesh.geometry.getIndex();
      for (const g of groups) {
        const rubber = meshCarMaterialName(mesh, g.materialIndex ?? 0) === 'rubber';
        const n = index ? Math.min(index.count, g.start + g.count) : Math.min(pos.count, g.start + g.count);
        for (let k = g.start; k < n; k++) {
          v.fromBufferAttribute(pos, index ? index.getX(k) : k).applyMatrix4(m);
          r1 = Math.max(r1, v.x);
          if (rubber) r0 = Math.min(r0, v.x);
        }
      }
    });
    if (r1 <= 0.05) return null;
    if (!Number.isFinite(r0) || r0 >= r1) r0 = 0.15 * r1;
    return { pivot, axis, rest: arm, r0: Math.max(0.02, r0), r1, sweep: r.sweepDeg * DEG };
  }
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
    const units = this.shown.get(mount)?.units;
    if (units) {
      out.makeEmpty();
      for (const u of units) out.expandByObject(u);
      return out.isEmpty() ? null : out;
    }
    const n = this.nodeOf(mount);
    if (!n || !n.visible) return null;
    out.makeEmpty();
    out.expandByObject(n);
    return out.isEmpty() ? null : out;
  }

  /** the world bounds of each of what is on a mount (an axle's part: one at each wheel) into `boxes`: how many */
  boundsEach(mount: string, boxes: THREE.Box3[]): number {
    const units = this.shown.get(mount)?.units;
    if (!units) return this.boundsOf(mount, boxes[0]) ? 1 : 0;
    let n = 0;
    for (const u of units) {
      const b = boxes[n];
      b.makeEmpty();
      b.expandByObject(u);
      if (!b.isEmpty()) n++;
    }
    return n;
  }

  dispose(): void {
    this.unmerge();
    this.root.removeFromParent();
    this.cluster?.dispose();
    this.cluster = null;
    this.mats.dispose();
  }
}

/** faded paint from a part's condition: like new above 70 %, chalky towards nothing */
function fade(cond: number): number {
  return Math.max(0, Math.min(1, (0.7 - cond) / 0.6));
}


