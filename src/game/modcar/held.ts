/**
 * What is in the hands, drawn in first person (docs/MODCAR.md §5): the part or tool itself, low in
 * front of the eye — small things in the right hand, big ones carried in both arms in the middle —
 * swaying with the walk and trailing the view a little when one turns, more the heavier it is.
 *
 * At its own size (docs/V3/plan/growth.md §1.7, J2: it was shrunk to 19 cm, 36 cm for a big thing): further out and
 * lower the bigger it is, drawn back from a wall in front (Nomad Drive's, at most 0.45 m), and where it stands over
 * the middle of the view it is seen through, carried or held out to be placed (as Nomad Drive does — core/v3/nd/
 * viewFade.ts: rays through 29 points round the mark asked against its pieces' boxes within 2.5 m; from 35% of them
 * blocked it fades, by 65% fully). Seen through, it is drawn alone into a layer laid over the frame (render/frame.ts
 * SeeLayer): only its nearest faces, nearly gone within 0.12 of the screen's height of the mark and a quarter of
 * them left from 0.42 out, its outline kept (the player's ask, 2026-11-26: the fridge carried with only its outermost
 * outline, the way ahead clear). It casts no shadow.
 *
 * A can held to an open filler goes to it by itself (the way Arctic Drive does it): it leaves the hands
 * and, at its real size, lines its spout up with the filler's mouth, leaning in; with the button held it
 * tips over and pours. Off the filler it comes back to the hands. A cleaning tool being scrubbed with is
 * pinned to the surface the same way (pin): at its real size, its working face on the point the mouse is on.
 * A spray can being sprayed comes up before the eye, its nozzle turned to where the paint goes (aimSpray);
 * taken up, it is shaken (shake).
 */
import * as THREE from 'three';
import { itemDef, itemMass, itemModelOf, itemPaint, type ItemInstance } from '../../core/modcar/items';
import { partDef } from '../../core/modcar/parts';
import { toolModelId } from '../../core/modcar/tools';
import { coverageOf, easeWeight, samplePattern, segmentHitsBox, targetWeight, VIEW_FADE, viewFadeScale } from '../../core/v3/nd/viewFade';
import type { RenderCore } from '../render/core';
import type { SeeLayer } from '../render/frame';
import { surfaceMaterial } from '../render/materials';
import { LAYER_SHADOW_FAR, LAYER_SHADOW_NEAR } from '../render/shadow';
import { cloneModel, itemGlb, partModel, seatTyres, toolGlb } from './assets';
import { itemStandIn, partLook, toolLook, toolModel } from './loose';
import { applyMaterials, CarMaterials } from './materials';
import { LIQUID } from './nd/vessel';
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

/** the points round the mark asked whether the held thing blocks them (Nomad Drive's: a 7 × 7 grid cut to the oval, 29), the middle ones weighing more */
const SEE_POINTS = samplePattern();

/** a piece of the held model: its box in its own frame, what is asked of it */
interface Piece {
  mesh: THREE.Mesh;
  min: [number, number, number];
  max: [number, number, number];
}

/** a material the scene's lights light (three's own): drawn alone, without them, it would be dark */
function litByLights(m: THREE.Material): boolean {
  const x = m as THREE.Material & { isMeshStandardMaterial?: boolean; isMeshLambertMaterial?: boolean; isMeshPhongMaterial?: boolean; isMeshToonMaterial?: boolean; isShaderMaterial?: boolean; lights?: boolean };
  return !!(x.isMeshStandardMaterial || x.isMeshLambertMaterial || x.isMeshPhongMaterial || x.isMeshToonMaterial || (x.isShaderMaterial && x.lights));
}

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
  /** currently held item instance (for live liquid level rendering and per-item carry orientation) */
  private heldItem: ItemInstance | null = null;
  private itemId = '';
  private liquidMesh: THREE.Mesh | null = null;
  private readonly liquidOff = new THREE.Vector3();
  private readonly liquidMats = new Map<string, THREE.Material>();
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
  /** its size (its own frame, m) and its largest side: how it is held, how far out */
  private readonly sizeV = new THREE.Vector3(0.1, 0.1, 0.1);
  private big = 0.1;
  /** how far one can reach ahead before something solid (m; set each frame by the game) */
  room = Infinity;
  /** how far it is seen through now (0…1: the fade), how far it should be, the frame drawn into (px) */
  private seeK = 0;
  private seeWant = 0;
  private frameW = 1;
  private frameH = 1;
  /** how much of the middle of the view it blocked last (0…1, by its own scale: the harness) */
  covered = 0;
  /** its own scale on what it blocks (a compass: 0, never seen through) */
  private seeScale = 1;
  /** its pieces' boxes, measured as its model comes in (stale: measured again); a piece three's lights light (not seen through then) */
  private pieces: Piece[] = [];
  private piecesStale = true;
  private litPieces = false;
  /** the layer it is drawn into while seen through (render/frame.ts), given to the frame then */
  private readonly layer: SeeLayer = {
    root: this.root,
    weight: 0,
    minOpacity: VIEW_FADE.minOpacity,
    edgeOpacity: VIEW_FADE.edgeOpacity,
    inner: VIEW_FADE.inner,
    outer: VIEW_FADE.outer,
    stretch: VIEW_FADE.stretch,
    lineOpacity: VIEW_FADE.lineOpacity,
    inkPx: VIEW_FADE.inkPx,
    bandPx: VIEW_FADE.bandPx,
  };
  private readonly rayO = new THREE.Vector3();
  private readonly rayDirs: THREE.Vector3[] = SEE_POINTS.map(() => new THREE.Vector3());
  private readonly inv = new THREE.Matrix4();
  private readonly lo: [number, number, number] = [0, 0, 0];
  private readonly ld: [number, number, number] = [0, 0, 0];
  private readonly hits: boolean[] = SEE_POINTS.map(() => false);
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
  /**
   * a system's tool on a surface (docs/ND/PLAN.md: the grinder), pinned as the game's scrub is; the game's own goes
   * first. `see`: held out where it is to be placed (nd-place) — seen through as it is when carried
   */
  private pinBy: { pos: THREE.Vector3; q: THREE.Quaternion; at: THREE.Vector3; see?: boolean } | null = null;
  private pinB = 0;
  /** the last system's pin was a thing held out to be placed (kept while it comes back to the hands) */
  private pinSee = false;
  private readonly pp = new THREE.Vector3();
  /**
   * Raised before the eye by a system (a camera looked through: docs/ND/PLAN.md): 0 in the hands … 1 at the eye,
   * where it is no longer drawn (one looks through it). Eased on its way.
   */
  lift = 0;
  /** how a small thing is turned in the hand (rad about the view's up; null: a little inward, as usual) — a camera held with its lens ahead */
  handTurn: number | null = null;
  /** how it is turned before the eye when raised (the view's frame; null: its front ahead, its top up) — a print held face on */
  liftTurn: THREE.Quaternion | null = null;
  private liftB = 0;
  private readonly liftQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  private readonly liftR = new THREE.Quaternion();
  private readonly liftP = new THREE.Vector3();
  /** what a system hangs on the model, in the model's own frame (a photo coming out of a camera's slot) */
  private hung: THREE.Object3D | null = null;

  /** what is being done with it (the player's use), every frame */
  setUse(u: { kind: 'eat' | 'pill' | 'drink'; t: number } | null): void {
    this.use = u;
  }

  /** sync cabin lamp light onto held items and R-mode placement previews so they never render black indoors */
  setCabinLamp(c: THREE.Color): void {
    this.mats.setCabinLamp(c);
  }

  constructor(private readonly core: RenderCore) {
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
    this.heldItem = held?.kind === 'item' ? held.item : null;
    this.itemId = held?.kind === 'item' ? held.item.item : '';
    if (this.liquidMesh) {
      this.liquidMesh.removeFromParent();
      this.liquidMesh.geometry.dispose();
      this.liquidMesh = null;
    }
    // (another thing: whole at first, as Nomad Drive's comes into the hands; its pieces measured as its model comes in)
    // Never fade long hand tools (shovel, scraper, brush) or the compass dial into ghost-transparency
    this.seeScale =
      this.itemId === 'nd_shovel' || this.itemId === 'nd_compass' || this.toolKind === 'scraper' || this.toolKind === 'brush'
        ? 0
        : held?.kind === 'item'
          ? viewFadeScale(held.item.item)
          : 1;
    this.seeK = 0;
    this.piecesStale = true;
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
      void itemGlb(itemModelOf(it)).then((m) => {
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
          const to = seatTyres(m, tm, def.rim!, partDef(t.part).tire!.sidewall, !!t.flat);
          applyMaterials(to, this.mats.look(`${OWNER}+tire`, { paint: 0x222222, paint2: 0xeeeeee, dirt: t.dirt, wear: 1 - (t.tread ?? 1) }));
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
    // at its own size (it was cut down to 19 cm, 36 cm for a big thing: the user's "原始大小")
    const k = 1;
    this.big = big;
    this.sizeV.copy(size);
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
    if (this.hung) obj.add(this.hung);
    this.attachLiquid(obj);
    this.piecesStale = true;
  }

  /** build live liquid fill geometry inside held open/glass vessels (coffee pot, mug, bucket) */
  private attachLiquid(obj: THREE.Object3D): void {
    if (this.liquidMesh) {
      this.liquidMesh.removeFromParent();
      this.liquidMesh.geometry.dispose();
      this.liquidMesh = null;
    }
    const id = this.itemId;
    if (id !== 'coffee_pot' && id !== 'nd_mug' && id !== 'nd_bucket') return;
    this.liquidOff.set(0, 0, 0);
    const brim = obj.getObjectByName('M_brim');
    if (brim) {
      obj.updateMatrixWorld(true);
      brim.getWorldPosition(this.liquidOff);
      obj.worldToLocal(this.liquidOff);
    }
    const mat = this.liquidMatOf('coffee');
    const geo =
      id === 'coffee_pot'
        ? new THREE.CylinderGeometry(0.055, 0.054, 1, 20).translate(0, 0.5, 0)
        : id === 'nd_mug'
          ? new THREE.CylinderGeometry(0.039, 0.038, 1, 24).translate(0, 0.5, 0)
          : new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'held:liquid';
    mesh.layers.disable(LAYER_SHADOW_FAR);
    mesh.layers.disable(LAYER_SHADOW_NEAR);
    mesh.frustumCulled = false;
    mesh.visible = false;
    obj.add(mesh);
    this.liquidMesh = mesh;
  }

  private liquidMatOf(q: string): THREE.Material {
    let m = this.liquidMats.get(q);
    if (!m) {
      const hex = LIQUID[q as keyof typeof LIQUID]?.hex ?? LIQUID.coffee.hex;
      // Low spec prevents flat top surfaces from washing out to solid white under noon sunlight
      m = surfaceMaterial({ color: hex, spec: 0.12, side: THREE.DoubleSide, cabinLift: true });
      this.liquidMats.set(q, m);
    }
    return m;
  }

  /** sync held vessel liquid fill height and colour with the live item state */
  private updateLiquid(): void {
    const mesh = this.liquidMesh;
    const it = this.heldItem;
    if (!mesh || !it) return;
    const d = itemDef(it.item).drink;
    if (!d || d.litres <= 0) {
      mesh.visible = false;
      return;
    }
    const fill = Math.max(0, Math.min(1, (it.litres ?? 0) / d.litres));
    if (fill < 0.005) {
      mesh.visible = false;
      return;
    }
    const q = it.state?.liquid ?? d.liquid;
    mesh.material = this.liquidMatOf(q);
    mesh.visible = true;
    if (it.item === 'coffee_pot') {
      mesh.position.set(this.liquidOff.x, 0.008, this.liquidOff.z);
      mesh.scale.set(1, Math.max(0.004, fill * 0.092), 1);
    } else if (it.item === 'nd_mug') {
      const topY = this.liquidOff.y > 0.03 ? this.liquidOff.y : 0.084;
      mesh.position.set(this.liquidOff.x, 0.01, this.liquidOff.z);
      mesh.scale.set(1, Math.max(0.004, fill * (topY - 0.012)), 1);
    } else if (it.item === 'nd_bucket') {
      const r = 0.1 + 0.034 * fill;
      mesh.position.set(this.liquidOff.x, 0.015 + fill * 0.24, this.liquidOff.z);
      mesh.scale.set(r, 1, r);
    }
  }

  /**
   * Place it in front of the camera (first person on foot only).
   * @param sway the walk's side-to-side (m), bob its up-and-down (m)
   */
  update(dt: number, cam: THREE.Camera, show: boolean, sway: number, bob: number, dock: Dock | null = null): void {
    // (her eyes: the view stands a hand's breadth ahead of them — eyeShift — and what she holds is held from them)
    this.base.copy(cam.position).sub(this.eyeShift);
    this.root.visible = show && this.key !== '' && this.liftB < 0.97;
    if (!this.root.visible) this.liftB += (this.lift - this.liftB) * (1 - Math.exp(-dt * 18));
    if (!this.root.visible) {
      this.lagInit = false;
      this.dockB = 0;
      // (not drawn: whole again at once, as Nomad Drive's is when the view is not its own)
      this.seeK = 0;
      this.useLayer(false);
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
    // camera space: +x right, +y up, -z ahead. Anchored directly to cam.position so small items, food, meds,
    // fish and tools stay clearly framed in the foreground regardless of stance or pitch.
    const bg = this.big;
    const isScraper = this.toolKind === 'scraper' || this.toolKind === 'brush';
    const isShovel = this.itemId === 'nd_shovel';
    const isCompass = this.itemId === 'nd_compass';
    const isFish = this.itemId.startsWith('fish_') || this.itemId === 'ing_fish';
    const isMug = this.itemId === 'nd_mug';
    if (isShovel) {
      this.off.set(0.34 + sway * 0.6, -0.32 + bob * 0.7, -0.72);
    } else if (isCompass) {
      // held right in front of the player's lower-center-right view so the circular dial and red North needle read directly face-on
      this.off.set(0.14 + sway * 0.5, -0.13 + bob * 0.5, -0.28);
    } else if (isScraper) {
      this.off.set(0.2 + sway, -0.17 + bob, -0.45);
    } else if (isFish) {
      this.off.set(0.01 + sway * 0.8, -0.22 - bg * 0.04 + bob * 0.8, -0.58 - bg * 0.44);
    } else if (isMug) {
      this.off.set(0.2 + sway, -0.17 + bob, -0.44);
    } else if (this.large || bg > 0.7) {
      this.off.set(sway * 0.6, -0.3 - bg * 0.14 + bob * 0.7, -0.46 - bg * 0.24);
    } else if (bg > 0.3) {
      this.off.set(0.22 + sway * 0.8, -0.18 - bg * 0.08 + bob * 0.8, -0.46 - bg * 0.32);
    } else {
      this.off.set(0.18 + sway, -0.14 + bob, -0.42 - bg * 0.32);
    }
    // a wall in front: drawn back so its front stays this side of it (at most 0.45 m)
    const front = -this.off.z + bg * 0.5;
    this.off.z += Math.min(0.45, Math.max(0, front - (this.room - 0.05)));
    // carry orientation: blade/working edge (+X) points forward (-Z) for scrapers/shovels; compass dial tilted face-on; fish upright side profile; mugs tilted to show liquid
    if (isShovel) {
      this.e.set(0.34, 1.52, -0.62);
    } else if (isCompass) {
      this.e.set(0.95, Math.PI / 2, 0);
    } else if (isScraper) {
      this.e.set(-0.14, 1.88, 0.16);
    } else if (isFish) {
      this.e.set(0.22, -0.38, 0.16);
    } else if (isMug) {
      this.e.set(0.52, this.handTurn ?? -0.65, 0.08);
    } else if (this.large) {
      this.e.set(0.32, -0.65, 0);
    } else {
      this.e.set(0.18, this.handTurn ?? -0.75, 0.06);
    }
    this.qHand.setFromEuler(this.e);
    this.updateLiquid();
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
        const openCup = this.itemId === 'nd_mug' || this.itemId === 'coffee_pot' || this.itemId === 'nd_bucket';
        if (openCup) {
          // open cup/carafe: gentle sipping tilt in view so the coffee/drink inside stays clearly visible
          this.e.set(0.58 + 0.34 * this.tiltB, -0.35, 0.08);
          this.qMouth.setFromEuler(this.e);
          m.set(0.03, -0.12, -0.29);
        } else {
          // bottle or can: neck angled toward lips, clearly visible in front of the lens
          this.e.set(1.22 + 0.42 * this.tiltB, -0.38, 0.1);
          this.qMouth.setFromEuler(this.e);
          this.t1.set(0, 1, 0).applyQuaternion(this.qMouth);
          m.set(0.03, -0.1, -0.25).addScaledVector(this.t1, -this.fitH * 0.45);
        }
      } else if (this.mouthKind === 'eat') {
        // held up before the mouth (a packet or a tin facing one), towards it with every bite
        this.e.set((this.fitFlat ? 1.05 : 0.35) + 0.25 * bite, -0.25, 0.08);
        this.qMouth.setFromEuler(this.e);
        m.set(0.03, -0.12 + 0.04 * bite, -0.36 + 0.09 * bite);
      } else {
        // the medicine box up in clear view, tipped once
        this.e.set((this.fitFlat ? 1.05 : 0.4) + 0.75 * this.tiltB, -0.25, 0.08);
        this.qMouth.setFromEuler(this.e);
        m.set(0.03, -0.11, -0.33);
      }
      this.off.lerp(m, mb);
      this.q.slerp(this.qMouth, mb);
    }
    // anchor all held items directly to cam.position so small food/meds/fish/tools never sink behind the lens
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
    // raised before the eye (a camera looked through): centred, its front (+x) ahead, not drawn once it is there
    this.liftB += (this.lift - this.liftB) * (1 - Math.exp(-dt * 18));
    if (this.liftB > 0.001) {
      const b = this.liftB * this.liftB * (3 - 2 * this.liftB);
      this.liftP.set(0, -0.03, -0.24).applyQuaternion(cam.quaternion).add(cam.position);
      this.root.position.lerp(this.liftP, b);
      this.liftR.copy(cam.quaternion).multiply(this.liftTurn ?? this.liftQ);
      this.root.quaternion.slerp(this.liftR, b);
    }
    // spraying: the can up before the eye, a little in from where it is carried, its nozzle (+x) turned to the
    // point the paint goes to, its top to the view's up
    const sw = this.sprayAt && NOZZLE[this.modelId] ? 1 : 0;
    this.sprayB += (sw - this.sprayB) * (1 - Math.exp(-dt * (sw ? 14 : 9)));
    if (sw === 0 && this.sprayB < 0.002) this.sprayB = 0;
    if (this.sprayB > 0) {
      if (this.sprayAt) {
        this.sprayPos.set(0.21 + sway * 0.5, -0.2 + bob * 0.5, -0.5).applyQuaternion(this.lagQ).add(this.base);
        // (up to the surface, square to it: 0.37 m off, 0.30 m spraying — no further out than an arm, a metre)
        const n = this.sprayN;
        if (n) {
          const off = this.sprayClose ? 0.3 : 0.37;
          this.sprayEye.copy(this.sprayAt).addScaledVector(n, off);
          const d = this.sprayEye.distanceTo(cam.position);
          if (d < 1.0) this.sprayPos.copy(this.sprayEye);
          else this.sprayPos.lerp(this.sprayEye, Math.max(0, Math.min(1, (1.6 - d) / 0.6)));
        }
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
    // (the game's own scrub, else a system's tool on a surface: pinFor)
    const pn = this.pinned ?? this.pinBy;
    const pw = pn ? 1 : 0;
    this.pinB += (pw - this.pinB) * (1 - Math.exp(-dt * (pw ? 22 : 12)));
    if (pw === 0 && this.pinB < 0.002) this.pinB = 0;
    if (this.pinB > 0 && pn) {
      const p = pn;
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
    this.seeThrough(dt, cam);
  }

  /**
   * Where the view stands from her eyes (render space; HerInGame.eyeShift), set each frame by the game: what is in
   * her hands is placed from her eyes, so that it stays where her arms hold it however far ahead the view is
   */
  readonly eyeShift = new THREE.Vector3();
  private readonly base = new THREE.Vector3();

  /** the frame the scene is drawn into (px): the faded middle is measured in it */
  frameSize(w: number, h: number): void {
    this.frameW = Math.max(1, w);
    this.frameH = Math.max(1, h);
  }

  /**
   * How much of the middle of the view it blocks (Nomad Drive's: a ray through each of 29 points of an oval round the
   * mark, 0.28 of the screen's height, half as wide again, asked whether it meets one of its pieces' boxes within
   * 2.5 m of the eye; the middle ones weigh more), and so how far it is seen through — evenly, in a quarter of a second,
   * back in 0.35 s. Carried, or held out to be placed; not at a filler, at a tool's work on a surface, before the eye,
   * at the mouth, spraying: there it is meant to be seen whole.
   */
  private seeThrough(dt: number, cam: THREE.Camera): void {
    let cover = 0;
    const placing = this.pinSee && !this.pinned;
    const busy = this.dockB > 0.05 || (this.pinB > 0.05 && !placing) || this.liftB > 0.05 || this.mouthB > 0.05 || this.sprayB > 0.05;
    if (this.piecesStale) this.measurePieces();
    if (!busy && this.pieces.length && this.seeScale > 0 && !this.litPieces) cover = this.blocked(cam) * this.seeScale;
    this.covered = cover;
    this.seeWant = busy ? 0 : targetWeight(cover);
    this.seeK = easeWeight(this.seeK, this.seeWant, dt);
    this.useLayer(this.seeK > 0);
  }

  /** drawn alone into its layer, laid over the frame (on), or with the scene as always */
  private useLayer(on: boolean): void {
    const frame = this.core.frame;
    this.layer.weight = this.seeK;
    if (on) frame.overlay = this.layer;
    else if (frame.overlay === this.layer) frame.overlay = null;
    for (const o of this.mats.owners(OWNER)) this.mats.lookOf(o)?.drawnAlone(on);
  }

  /** its pieces: each mesh's own box (made once a model), and whether any is lit by three's lights */
  private measurePieces(): void {
    this.piecesStale = false;
    this.pieces = [];
    this.litPieces = false;
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const g = mesh.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      const b = g.boundingBox!;
      if (b.isEmpty()) return;
      this.pieces.push({ mesh, min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] });
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (litByLights(m)) this.litPieces = true;
    });
  }

  /** the weighted share of the points round the mark whose rays meet one of its pieces within 2.5 m of the eye */
  private blocked(cam: THREE.Camera): number {
    const c = cam as THREE.PerspectiveCamera;
    // (the camera as it is this frame: its matrices are brought up to date only as a frame is drawn)
    c.updateMatrixWorld();
    const o = this.rayO.setFromMatrixPosition(c.matrixWorld);
    const aspect = this.frameW / this.frameH;
    for (let i = 0; i < SEE_POINTS.length; i++) {
      const s = SEE_POINTS[i];
      // (the point's place on the screen: x and y in screen heights from the mark, to the device's −1 … 1)
      this.rayDirs[i].set((2 * s.x) / aspect, 2 * s.y, 0.5).unproject(c).sub(o).normalize().multiplyScalar(VIEW_FADE.maxDistance);
      this.hits[i] = false;
    }
    const lo = this.lo;
    const ld = this.ld;
    for (const p of this.pieces) {
      if (!p.mesh.visible) continue;
      this.inv.copy(p.mesh.matrixWorld).invert();
      const e = this.inv.elements;
      lo[0] = e[0] * o.x + e[4] * o.y + e[8] * o.z + e[12];
      lo[1] = e[1] * o.x + e[5] * o.y + e[9] * o.z + e[13];
      lo[2] = e[2] * o.x + e[6] * o.y + e[10] * o.z + e[14];
      for (let i = 0; i < SEE_POINTS.length; i++) {
        if (this.hits[i]) continue;
        const d = this.rayDirs[i];
        ld[0] = e[0] * d.x + e[4] * d.y + e[8] * d.z;
        ld[1] = e[1] * d.x + e[5] * d.y + e[9] * d.z;
        ld[2] = e[2] * d.x + e[6] * d.y + e[10] * d.z;
        if (segmentHitsBox(lo, ld, p.min, p.max)) this.hits[i] = true;
      }
    }
    return coverageOf(SEE_POINTS, (_s, i) => this.hits[i]);
  }

  /** how far it is seen through now, should be, and how much of the middle of the view it blocks (the harness) */
  get fade(): { weight: number; want: number; covered: number; layer: boolean } {
    return { weight: +this.seeK.toFixed(3), want: +this.seeWant.toFixed(3), covered: +this.covered.toFixed(3), layer: this.core.frame.overlay === this.layer };
  }

  /** a system's tool put to a surface (its model's point at on pos, its frame turned to q), null: back in the hands; see: a thing held out to be placed */
  pinFor(p: { pos: THREE.Vector3; q: THREE.Quaternion; at: THREE.Vector3; see?: boolean } | null): void {
    this.pinBy = p;
    if (p) this.pinSee = !!p.see;
  }

  /** hang something on the thing in the hands, in its model's own frame (null: take it off again) */
  hang(o: THREE.Object3D | null): void {
    if (this.hung === o) return;
    this.hung?.removeFromParent();
    this.hung = o;
    const m = this.inner.children[0];
    if (o && m) m.add(o);
  }

  /** the model in the hands as drawn (its own frame under it), null: nothing in them or not in yet */
  get model(): THREE.Object3D | null {
    return this.inner.children[0] ?? null;
  }

  /** spraying: the point (render space) the can's nozzle turns to; null: back in the hands */
  aimSpray(p: THREE.Vector3 | null, n: THREE.Vector3 | null = null, spraying = false): void {
    this.sprayAt = p;
    this.sprayN = n;
    this.sprayClose = spraying;
  }

  /** the surface's normal at the spray's point, and whether the button is down (closer) */
  private sprayN: THREE.Vector3 | null = null;
  private sprayClose = false;
  private readonly sprayEye = new THREE.Vector3();

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

  /** for her hands (character/inGame.ts): the frame the model is centred in, its size, whether it is carried in both arms, whether it is drawn */
  get handFrame(): THREE.Object3D {
    return this.inner;
  }

  get size(): THREE.Vector3 {
    return this.sizeV;
  }

  get twoHanded(): boolean {
    return this.large || this.big > 0.42;
  }

  get shown(): boolean {
    return this.root.visible;
  }

  /** what kind of thing it is: a tool's kind, else '' */
  get kind(): string {
    return this.toolKind;
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
