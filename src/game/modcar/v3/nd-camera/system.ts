/**
 * The instant camera in the game (docs/ND/PLAN.md; its rules: core/v3/nd/camera.ts, the pictures: store.ts). In the
 * hands: F (the right button) held raises it to the eye in 0.3 s — the view through its finder, framed as its print
 * is (0.8 of the screen's height, 1.068 as wide), the wheel zooming in up to four times — and the left button takes
 * the picture: what the eye sees in the frame, cut from the frame just drawn, 547 x 512, with a flash when it is dark
 * (no sooner than 2 s after the last, while it has prints). The print slides out of the slot at the camera's front
 * over 2 s and hangs there developing, 12 s from a grey blue to the picture; the next picture or the camera put away
 * pushes it out, and it falls, turning, where it is. A print lying about, in the hands or wherever it went is drawn
 * with its picture as far developed as its time says. A camera lying about takes a box of film from the hands with E.
 *
 * What a camera has and what a print is ride on the things (ItemState.camera, .photo); the pictures are in the
 * browser's store under their keys. This keeps nothing of its own in the save.
 */
import * as THREE from 'three';
import type { System } from '../../../../core/kernel/systems';
import { itemDef, itemPaint, newItem, type ItemInstance } from '../../../../core/modcar/items';
import type { Text } from '../../../../core/modcar/types';
import { CAMERA, developed, ejected, filmOf, loadFilm, newPhoto, photoKey, useFilm, zoomAt } from '../../../../core/v3/nd/camera';
import { ND_CAMERA, ND_FILM, ND_PHOTO } from '../../../../core/v3/nd/items';
import { cloneModel, itemGlb } from '../../assets';
import type { GarageDevice } from '../../garageStub';
import type { Action } from '../../hudItems';
import type { GameContext } from '../../kernel/context';
import type { InteractSource, PlanPoint } from '../../kernel/interact';
import type { Loose } from '../../loose';
import { applyMaterials, CarMaterials } from '../../materials';
import type { Held, HandsUse } from '../../player';
import { blip, markerOf, modelOf } from '../../nd/kit';
import { itemCardKept, type ItemCard } from '../../itemInfo';
import { itemNow } from '../../itemTime';
import { pictureMaterial, PhotoStore } from './store';
import type { SaveSlice } from '../../../../core/kernel/slices';
import { aimStick, PrintGhost, printTurn, thingUid, type StickAim, type StuckPrint } from './stick';

const T = (zh: string, en: string): Text => ({ zh, en });

/** the print's picture on its card (m), its middle off the card's (towards its top, +x) */
const PIC_W = CAMERA.picture[0];
const PIC_H = CAMERA.picture[1];
/** a print held up to look at: face on to the eye, its top up (the view's frame: its x up, its face, y, towards the eye) */
const PHOTO_FACE = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)));
/** the finder's frame: this much of the screen's height, the print's shape */
const FRAME_H = 0.8;
const ASPECT = CAMERA.px[0] / CAMERA.px[1];
/** below this mean brightness the flash goes off */
const DARK = 0.13;

type PicMat = ReturnType<typeof pictureMaterial>;

/** the picture's plane in a print's frame: up along +x, facing +y (its right along +z) */
function picturePlane(mat: THREE.Material): THREE.Mesh {
  const g = new THREE.PlaneGeometry(PIC_W, PIC_H);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)));
  const m = new THREE.Mesh(g, mat);
  m.name = 'nd:picture';
  return m;
}

/** a print's model as drawn (lying about, in the hands, out of the slot): its picture plane over its P_img, the material its own */
function dressPrint(model: THREE.Object3D, mat: PicMat): void {
  if (model.getObjectByName('nd:picture')) return;
  const img = model.getObjectByName('P_img');
  if (!img?.parent) return;
  // (beside its placeholder, which is hidden: the picture where it was, a hair above the card)
  img.visible = false;
  const p = picturePlane(mat);
  p.position.copy(img.position);
  p.position.y += 0.0004;
  p.quaternion.copy(img.quaternion);
  img.parent.add(p);
}

interface Hanging {
  item: ItemInstance;
  /** the group hung on the camera in the hands, and the print's model in it */
  obj: THREE.Group;
  mat: PicMat;
  /** world seconds at the shutter */
  at: number;
}

interface LyingPrint {
  mat: PicMat;
  model: THREE.Object3D | null;
  /** turning as it falls (rad/s), its tilt */
  spin: number;
  tilt: number;
}

/** a camera lying about: E picks it up, or with a box of film in the hands, E held half a second loads it (Nomad Drive's idle with film pack) */
class CameraThing implements GarageDevice {
  readonly id: string;
  readonly radius = 0.14;
  constructor(
    private readonly sys: NdCamera,
    readonly loose: Loose,
  ) {
    this.id = `nd-camera:${loose.uid}`;
  }
  get x(): number {
    return this.loose.x;
  }
  get y(): number {
    return this.loose.y + this.loose.mid;
  }
  get z(): number {
    return this.loose.z;
  }
  get word(): Text {
    const n = filmOf(this.loose.item!);
    void n;
    return this.sys.filmInHand() ? T('装上相纸', 'Load the film') : T('拿起 <b>拍立得相机</b>', 'Pick up the camera');
  }
  get holdS(): number | undefined {
    return this.sys.filmInHand() ? CAMERA.loadS : undefined;
  }
  get card(): ItemCard {
    return itemCardKept(this.loose.item!, itemNow(), this.sys.time);
  }
  readonly alt = null;
  use(): void {
    const pack = this.sys.filmInHand();
    if (pack) this.sys.loadFromHand(this.loose, pack);
    else this.sys.pickUp(this.loose);
  }
}

/** a box of film lying about: E picks it up, or with the camera in the hands, E held half a second loads it into that (Nomad Drive's idle camera in hand) */
class FilmThing implements GarageDevice {
  readonly id: string;
  readonly radius = 0.12;
  constructor(
    private readonly sys: NdCamera,
    readonly loose: Loose,
  ) {
    this.id = `nd-camera:film:${loose.uid}`;
  }
  get x(): number {
    return this.loose.x;
  }
  get y(): number {
    return this.loose.y + this.loose.mid;
  }
  get z(): number {
    return this.loose.z;
  }
  get word(): Text {
    const cam = this.sys.cameraInHand();
    return cam ? T('装上相纸', 'Load it into the camera') : T('拿起 <b>拍立得相纸</b>', 'Pick up the film');
  }
  get holdS(): number | undefined {
    return this.sys.cameraInHand() ? CAMERA.loadS : undefined;
  }
  get card(): ItemCard {
    return itemCardKept(this.loose.item!, itemNow(), this.sys.time);
  }
  readonly alt = null;
  use(): void {
    const cam = this.sys.cameraInHand();
    if (cam) this.sys.loadLying(cam, this.loose);
    else this.sys.pickUp(this.loose);
  }
}

export class NdCamera implements System<GameContext>, InteractSource {
  readonly id = 'nd-camera';
  readonly budget = { cpuMs: 0.3 };
  private ctx: GameContext | null = null;
  readonly store = new PhotoStore();
  private readonly mats = new CarMaterials();
  /** how far raised (0 … 1), the zoom's setting (0 … 1), the time till it may take another (s) */
  raise = 0;
  zoom = 0;
  private cool = 0;
  /** held raised by the harness (as F held) */
  forceRaise = false;
  private hanging: Hanging | null = null;
  /** the prints lying about, dressed */
  private readonly prints = new Map<Loose, LyingPrint>();
  private readonly things = new Map<Loose, CameraThing>();
  private readonly films = new Map<Loose, FilmThing>();
  private rev = -1;
  /** the print in the hands, dressed (its model, its material) */
  private heldPrint: { uid: string; model: THREE.Object3D; mat: PicMat } | null = null;
  private overlay: { root: HTMLDivElement; count: HTMLDivElement; zoom: HTMLDivElement; flash: HTMLDivElement } | null = null;
  private flashT = 0;
  /** pictures taken (the harness) */
  shots = 0;
  /** its own clock (s): the cards kept */
  time = 0;
  /** a print held up to look at (0 … 1) */
  private photoUp = 0;
  private photoForce = false;
  /** a print about to be stuck: where, turned how many quarters, its ghost */
  private stickAim: StickAim | null = null;
  private readonly aimBuf: StickAim = { point: new THREE.Vector3(), normal: new THREE.Vector3(), up: new THREE.Vector3(), on: null, thing: null };
  /** the things lying about by their own uid (for the prints stuck on them), and the loose list's revision it was made at */
  private readonly byUid = new Map<string, Loose>();
  private byUidRev = -1;
  private readonly pv = new THREE.Vector3();
  private readonly pq = new THREE.Quaternion();
  private roll = 0;
  private ghost: PrintGhost | null = null;
  /** the prints stuck in the world (not on a vehicle): kept in this module's save */
  private readonly stuck: { rec: StuckPrint; obj: THREE.Group; mat: PicMat; device: GarageDevice }[] = [];

  /** the save's part: the prints stuck in the world */
  readonly slice: SaveSlice<{ stuck?: StuckPrint[] }> = {
    id: 'nd-camera',
    version: 1,
    snapshot: () => (this.stuck.length ? { stuck: this.stuck.map((x) => x.rec) } : undefined),
    restore: (d) => {
      for (const x of [...this.stuck]) this.unstick(x);
      for (const r of d.stuck ?? []) this.addStuck(r);
    },
    clear: () => {
      for (const x of [...this.stuck]) this.unstick(x);
    },
  };

  /** a print's way in the hands: RMB held brings it up before the eye, face on */
  readonly photoHands: HandsUse = {
    id: 'nd-camera:print',
    claims: (h) => h.kind === 'item' && h.item.item === ND_PHOTO,
    takesRmb: () => true,
    step: (h, dt, _e, rmb) => {
      const ctx = this.ctx!;
      this.photoUp = rmb || this.photoForce ? Math.min(1, this.photoUp + dt / 0.25) : Math.max(0, this.photoUp - dt / 0.25);
      ctx.heldThing.liftTurn = PHOTO_FACE;
      ctx.heldThing.lift = 0.9 * this.photoUp;
      // (looked at, it is not being stuck; else the surface the mark is on shows it as a ghost)
      this.stickAim = this.photoUp < 0.1 ? aimStick(ctx, this.roll, this.aimBuf) : null;
      this.ghost ??= new PrintGhost(ctx.core.scene);
      this.ghost.show(this.stickAim, h.kind === 'item' ? this.store.texture(photoKey(h.item)) : null);
    },
    // (the left button, or a pad's use button: where it would stick the press is the print's — the door it is held to
    // is not opened by it)
    press: (h) => {
      if (!this.stickAim || h.kind !== 'item') return false;
      this.stick(h.item, this.stickAim);
      return true;
    },
    wheel: () => {
      if (!this.stickAim) return false;
      this.roll = (this.roll + 1) % 4;
      return true;
    },
    words: () => {
      const out: Action[] = [{ keys: ['RMB'], hold: true, text: '看' }];
      if (this.stickAim) out.push({ keys: ['LMB'], text: '贴上' }, { keys: ['Wheel'], text: '转 90°' });
      else out.push({ keys: ['LMB'], text: '贴上', off: true, why: '对着墙或车身' });
      return out;
    },
    aims: () => (this.stickAim ? [{ keys: ['LMB'], text: '贴上' }, { keys: ['Wheel'], text: '转 90°' }] : null),
    gone: () => {
      const ctx = this.ctx!;
      this.photoUp = 0;
      ctx.heldThing.lift = 0;
      ctx.heldThing.liftTurn = null;
      this.stickAim = null;
      this.ghost?.show(null, null);
    },
  };
  private readonly v = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();

  init(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.player.hands?.push(this.hands, this.photoHands);
  }

  // ------------------------------------------------------------------ in the hands (HandsUse)

  /** its way in the hands (player.ts HandsUse): E takes a photo, RMB raises the viewfinder */
  readonly hands: HandsUse = {
    id: 'nd-camera',
    claims: (h) => this.claims(h),
    takesF: () => true,
    takesRmb: () => true,
    press: (h, from) => this.press(h, from),
    release: () => false,
    wheel: (h, d) => this.wheel(h, d),
    step: (h, dt, e, rmb) => this.handStep(h, dt, e, !!rmb),
    words: (h) => this.words(h),
    gone: () => this.gone(),
  };

  private eWas = false;

  claims(held: NonNullable<Held>): boolean {
    return held.kind === 'item' && held.item.item === ND_CAMERA;
  }

  takesF(): boolean {
    return true;
  }

  press(held: NonNullable<Held>, from: 'key' | 'mouse'): boolean {
    if (from !== 'mouse' || held.kind !== 'item') return false;
    if (this.raise < 0.92) return false;
    this.shutter(held.item, false);
    return true;
  }

  release(): boolean {
    return false;
  }

  wheel(_held: NonNullable<Held>, delta: number): boolean {
    if (this.raise < 0.5) return false;
    this.zoom = Math.max(0, Math.min(1, this.zoom + (delta < 0 ? 0.1 : -0.1)));
    blip('tick', 0.5);
    return true;
  }

  handStep(held: NonNullable<Held>, dt: number, e: boolean, rmb = false): void {
    const ctx = this.ctx!;
    const eEdge = e && !this.eWas;
    this.eWas = e;
    const want = rmb || this.forceRaise ? 1 : 0;
    this.raise = want > this.raise ? Math.min(1, this.raise + dt / CAMERA.raiseS) : Math.max(0, this.raise - dt / CAMERA.raiseS);
    this.cool = Math.max(0, this.cool - dt);
    const k = this.raise * this.raise * (3 - 2 * this.raise);
    ctx.heldThing.lift = k;
    // (held with its lens ahead, as one carries it ready: the print comes out in front)
    ctx.heldThing.handTurn = 2.1;
    ctx.lookZoom = 1 + (zoomAt(this.zoom) - 1) * k;
    this.showFinder(this.raise > 0.92, held.kind === 'item' ? held.item : null);
    if (eEdge && held.kind === 'item') this.shutter(held.item, true);
    // (the print out of the slot follows the camera in the hands)
    if (this.hanging) this.poseHanging();
  }

  words(held: NonNullable<Held>): Action[] {
    const n = held.kind === 'item' ? filmOf(held.item) : 0;
    const up = this.raise > 0.92;
    const out: Action[] = [];
    if (n <= 0) out.push({ keys: ['E'], text: '拍照', off: true, why: '没有相纸了' });
    else out.push({ keys: ['E'], text: '拍照', off: this.cool > 0, why: '等一下' });
    out.push({ keys: ['RMB'], hold: true, text: '举起取景' });
    if (up) out.push({ keys: ['Wheel'], text: '变焦' });
    return out;
  }

  gone(): void {
    const ctx = this.ctx!;
    this.raise = 0;
    this.eWas = false;
    ctx.heldThing.lift = 0;
    ctx.heldThing.handTurn = null;
    ctx.lookZoom = 1;
    this.showFinder(false, null);
    this.release_print();
  }

  // ------------------------------------------------------------------ the shutter

  private shutter(cam: ItemInstance, direct = false): void {
    const ctx = this.ctx!;
    if (!direct && this.raise < 0.92) return void ctx.player.flashWhy('先按住右键举起');
    if (this.cool > 0) return void blip('tick', 0.6);
    if (filmOf(cam) <= 0) {
      blip('tick', 0.8);
      return void ctx.player.flashWhy('没有相纸了');
    }
    useFilm(cam);
    this.cool = CAMERA.coolS;
    this.shots++;
    blip('shutter', 1);
    blip('motor', 0.8);
    // the print before it is pushed out
    this.release_print();
    const key = `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    const w = ctx.world;
    const s = w ? w.spine.sAtX(ctx.player.walker.x) : undefined;
    const print = newItem(ND_PHOTO);
    print.state = { photo: newPhoto(key, ctx.clock.worldSeconds, s) };
    const mat = pictureMaterial();
    const obj = new THREE.Group();
    obj.name = 'nd:print-out';
    this.hanging = { item: print, obj, mat, at: ctx.clock.worldSeconds };
    this.dressNewPrint(print, obj, mat);
    ctx.heldThing.hang(obj);
    // the picture: what the frame just drawn has inside the finder
    ctx.core.afterFrame.push((canvas) => {
      const tex = this.cut(canvas, key);
      if (tex) mat.map = tex;
      mat.needsUpdate = true;
    });
  }

  /** the finder's part of the frame just drawn, as a print's picture; a flash when it is dark */
  private cut(canvas: HTMLCanvasElement, key: string): THREE.Texture | null {
    const out = document.createElement('canvas');
    out.width = CAMERA.px[0];
    out.height = CAMERA.px[1];
    const g = out.getContext('2d');
    if (!g) return null;
    const ch = Math.round(canvas.height * FRAME_H);
    const cw = Math.min(canvas.width, Math.round(ch * ASPECT));
    const sx = Math.round((canvas.width - cw) / 2);
    const sy = Math.round((canvas.height - ch) / 2);
    g.drawImage(canvas, sx, sy, cw, ch, 0, 0, out.width, out.height);
    // how bright it came out: dark, the flash lights it (and the screen blinks)
    const d = g.getImageData(0, 0, out.width, out.height).data;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 4 * 97) {
      sum += (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      n++;
    }
    const mean = sum / Math.max(1, n);
    if (mean < DARK) {
      const k = Math.min(3.2, DARK / Math.max(0.02, mean) * 1.4);
      g.filter = `brightness(${k.toFixed(2)}) contrast(1.1)`;
      g.drawImage(out, 0, 0);
      g.filter = 'none';
      this.flashT = 0.12;
    }
    // (a print's own look: a touch warm, the corners a little dark)
    const grad = g.createRadialGradient(out.width / 2, out.height / 2, out.height * 0.35, out.width / 2, out.height / 2, out.height * 0.78);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(30,20,10,0.28)');
    g.fillStyle = grad;
    g.fillRect(0, 0, out.width, out.height);
    return this.store.add(key, out);
  }

  /** the new print's model in its group, dressed with its picture */
  private dressNewPrint(print: ItemInstance, obj: THREE.Group, mat: PicMat): void {
    const look = this.mats.look(`nd-camera:print:${print.uid}`, itemPaint(print));
    void itemGlb(itemDef(ND_PHOTO).model).then((m) => {
      if (!m || this.hanging?.obj !== obj) return;
      const c = cloneModel(m);
      applyMaterials(c, look);
      dressPrint(c, mat);
      obj.add(c);
    });
  }

  /** the hanging print where the slot has pushed it so far, its picture as far developed */
  private poseHanging(): void {
    const h = this.hanging!;
    const ctx = this.ctx!;
    const t = ctx.clock.worldSeconds - h.at;
    const model = ctx.heldThing.model;
    const slot = markerOf(model, 'M_slot', this.v.set(0.066, 0.022, 0));
    // (its back edge stays a little in the slot: the print hangs out of it, its picture up and its top first)
    const e = ejected(t);
    h.obj.position.set(slot.x - 0.077 + CAMERA.ejectM * e, slot.y, slot.z);
    // (a little droop as it comes out)
    h.obj.rotation.set(0, 0, -0.12 * e);
    h.mat.userData.dev.value = developed(t);
  }

  /** the hanging print pushed out: it falls, turning, where it is */
  private release_print(): void {
    const h = this.hanging;
    if (!h) return;
    this.hanging = null;
    const ctx = this.ctx!;
    // where it was (render space → world: read before it is taken off the camera), the camera's heading
    h.obj.updateWorldMatrix(true, false);
    h.obj.getWorldPosition(this.v);
    ctx.heldThing.hang(null);
    const o = ctx.core.origin;
    const yaw = -ctx.player.walker.heading;
    const l = ctx.loose.addItem(h.item, this.v.x + o.x, this.v.y + o.y, this.v.z + o.z, yaw);
    ctx.loose.drop(l);
    this.prints.set(l, { mat: h.mat, model: null, spin: 6 + Math.random() * 6, tilt: 0 });
    ctx.loose.keepApart(l.uid, true);
    this.mats.drop(`nd-camera:print:${h.item.uid}`);
  }

  // ------------------------------------------------------------------ lying about, in the hands

  private refresh(ctx: GameContext): void {
    const loose = ctx.loose;
    if (loose.rev === this.rev) return;
    this.rev = loose.rev;
    const seenP = new Set<Loose>();
    const seenC = new Set<Loose>();
    const seenF = new Set<Loose>();
    for (const l of loose.list) {
      const it = l.item;
      if (!it) continue;
      if (it.item === ND_PHOTO) {
        seenP.add(l);
        if (!this.prints.has(l)) {
          this.prints.set(l, { mat: pictureMaterial(), model: null, spin: 0, tilt: 0 });
          loose.keepApart(l.uid, true);
        }
      } else if (it.item === ND_CAMERA) {
        seenC.add(l);
        l.device = true;
        if (!this.things.has(l)) this.things.set(l, new CameraThing(this, l));
      } else if (it.item === ND_FILM) {
        seenF.add(l);
        l.device = true;
        if (!this.films.has(l)) this.films.set(l, new FilmThing(this, l));
      }
    }
    for (const [l, p] of [...this.prints]) {
      if (seenP.has(l)) continue;
      loose.keepApart(l.uid, false);
      p.mat.dispose();
      this.prints.delete(l);
    }
    for (const l of [...this.things.keys()]) if (!seenC.has(l)) this.things.delete(l);
    for (const l of [...this.films.keys()]) if (!seenF.has(l)) this.films.delete(l);
  }

  lateUpdate(dt: number, ctx: GameContext): void {
    this.time += dt;
    this.refresh(ctx);
    const now = ctx.clock.worldSeconds;
    // the prints lying about: their pictures, as developed as they are; turning while they fall
    for (const [l, p] of this.prints) {
      const it = l.item!;
      const model = modelOf(l);
      if (model && p.model !== model) {
        p.model = model;
        dressPrint(model, p.mat);
      }
      const key = photoKey(it);
      if (!p.mat.map) {
        const t = this.store.texture(key);
        if (t) {
          p.mat.map = t;
          p.mat.needsUpdate = true;
        }
      }
      p.mat.userData.dev.value = developed(now - (it.state?.photo?.at ?? -1e9));
      if (p.model) {
        // (only a print pushed out of the camera turns as it falls: one let go from the hands comes down flat, and lies so)
        if (!l.resting && !l.riding) {
          if (p.spin) {
            p.tilt += p.spin * dt;
            p.model.rotation.set(0.35 * Math.sin(p.tilt * 0.7), p.tilt, 0.3 * Math.cos(p.tilt * 0.9));
          }
        } else if (p.spin) {
          p.spin = 0;
          p.model.rotation.set(0, p.model.rotation.y, 0);
        }
      }
    }
    // a print in the hands
    const h = ctx.player.held;
    if (h?.kind === 'item' && h.item.item === ND_PHOTO) {
      const model = ctx.heldThing.model;
      if (model && (!this.heldPrint || this.heldPrint.uid !== h.item.uid || this.heldPrint.model !== model)) {
        this.heldPrint?.mat.dispose();
        const mat = pictureMaterial();
        dressPrint(model, mat);
        this.heldPrint = { uid: h.item.uid, model, mat };
      }
      if (this.heldPrint) {
        const m = this.heldPrint.mat;
        if (!m.map) {
          const t = this.store.texture(photoKey(h.item));
          if (t) {
            m.map = t;
            m.needsUpdate = true;
          }
        }
        m.userData.dev.value = developed(now - (h.item.state?.photo?.at ?? -1e9));
      }
    } else if (this.heldPrint) {
      this.heldPrint.mat.dispose();
      this.heldPrint = null;
    }
    // the prints stuck in the world (on a thing: where the thing is now, unseen while it is not lying about)
    if (this.byUidRev !== ctx.loose.rev) {
      this.byUidRev = ctx.loose.rev;
      this.byUid.clear();
      for (const l of ctx.loose.list) {
        const u = thingUid(l);
        if (u) this.byUid.set(u, l);
      }
    }
    const o = ctx.core.origin;
    for (const x of this.stuck) {
      const on = x.rec.on;
      if (on) {
        const l = this.byUid.get(on.uid);
        x.obj.visible = !!l && l.obj.visible;
        if (!l || !x.obj.visible) continue;
        l.obj.updateMatrixWorld(true);
        const p = this.pv.set(on.pos[0], on.pos[1], on.pos[2]).applyMatrix4(l.obj.matrixWorld);
        x.obj.position.copy(p);
        x.obj.quaternion.copy(l.obj.getWorldQuaternion(this.pq)).multiply(this.pq.set(on.q[0], on.q[1], on.q[2], on.q[3]));
        x.rec.x = p.x + o.x;
        x.rec.y = p.y + o.y;
        x.rec.z = p.z + o.z;
        x.rec.q = [x.obj.quaternion.x, x.obj.quaternion.y, x.obj.quaternion.z, x.obj.quaternion.w];
      } else ctx.core.place(x.obj, x.rec.x, x.rec.y, x.rec.z);
      if (!x.mat.map) {
        const t = this.store.texture(photoKey(x.rec.item));
        if (t) {
          x.mat.map = t;
          x.mat.needsUpdate = true;
        }
      }
      x.mat.userData.dev.value = developed(now - (x.rec.item.state?.photo?.at ?? -1e9));
    }
    // the flash's blink
    if (this.overlay) {
      this.flashT = Math.max(0, this.flashT - dt);
      this.overlay.flash.style.opacity = this.flashT > 0 ? String(Math.min(1, this.flashT / 0.12) * 0.85) : '0';
    }
    // (put down or swapped while raised: the view comes back)
    const held = ctx.player.held;
    if (!(held?.kind === 'item' && held.item.item === ND_CAMERA) && (this.raise > 0 || ctx.lookZoom !== 1) && !this.hanging) {
      this.raise = 0;
      ctx.heldThing.lift = 0;
      ctx.lookZoom = 1;
      this.showFinder(false, null);
    }
  }

  // ------------------------------------------------------------------ stuck

  /** the print in the hands stuck where the ghost is: on a vehicle it rides with it, elsewhere it stays */
  private stick(item: ItemInstance, aim: StickAim): void {
    const ctx = this.ctx!;
    const pl = ctx.player;
    const i = pl.slots.findIndex((h) => h?.kind === 'item' && h.item === item);
    if (i >= 0) pl.slots[i] = null;
    const q = printTurn(aim.normal, aim.up, new THREE.Quaternion());
    const at = aim.point.clone().addScaledVector(aim.normal, 0.0015);
    const o = ctx.core.origin;
    if (aim.thing) {
      // on a thing: its place and turn in the thing's frame, so it goes where the thing goes
      const t = aim.thing.obj;
      t.updateMatrixWorld(true);
      const pos = t.worldToLocal(at.clone());
      const rot = t.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q);
      const uid = thingUid(aim.thing)!;
      this.addStuck({ item, x: at.x + o.x, y: at.y + o.y, z: at.z + o.z, q: [q.x, q.y, q.z, q.w], on: { uid, pos: [pos.x, pos.y, pos.z], q: [rot.x, rot.y, rot.z, rot.w] } });
    } else if (aim.on) {
      const f = aim.on.frame;
      f.updateMatrixWorld(true);
      const pos = f.worldToLocal(at.clone());
      const rot = f.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q);
      const l = ctx.loose.addItem(item, at.x + o.x, at.y + o.y, at.z + o.z, 0);
      ctx.loose.ride(l, aim.on, { pos, rot });
    } else {
      this.addStuck({ item, x: at.x + o.x, y: at.y + o.y, z: at.z + o.z, q: [q.x, q.y, q.z, q.w] });
    }
    this.stickAim = null;
    this.ghost?.show(null, null);
    blip('click', 0.5);
    ctx.sound('putdown', 0.25);
  }

  private addStuck(rec: StuckPrint): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const obj = new THREE.Group();
    obj.name = 'nd:print-stuck';
    obj.quaternion.set(rec.q[0], rec.q[1], rec.q[2], rec.q[3]);
    ctx.core.scene.add(obj);
    const mat = pictureMaterial();
    const look = this.mats.look('nd-camera:print:' + rec.item.uid, itemPaint(rec.item));
    void itemGlb(itemDef(ND_PHOTO).model).then((m) => {
      if (!m || !this.stuck.some((x) => x.obj === obj)) return;
      const c = cloneModel(m);
      applyMaterials(c, look);
      dressPrint(c, mat);
      obj.add(c);
    });
    const sys = this;
    const inv = new THREE.Matrix4();
    const ray = new THREE.Ray();
    const box = new THREE.Box3(new THREE.Vector3(-0.075, -0.01, -0.065), new THREE.Vector3(0.075, 0.015, 0.065));
    const hp = new THREE.Vector3();
    const entry = { rec, obj, mat, device: null as unknown as GarageDevice };
    entry.device = {
      id: 'nd-camera:stuck:' + rec.item.uid,
      get x() {
        return rec.x;
      },
      get y() {
        return rec.y;
      },
      get z() {
        return rec.z;
      },
      radius: 0.1,
      outline: obj,
      word: T('揭下照片', 'Take the photo down'),
      get card(): ItemCard {
        return itemCardKept(rec.item, itemNow(), sys.time);
      },
      use: () => sys.takeDown(entry),
      hit: (r: THREE.Ray, reach: number) => {
        obj.updateMatrixWorld(true);
        inv.copy(obj.matrixWorld).invert();
        ray.copy(r).applyMatrix4(inv);
        const pt = ray.intersectBox(box, hp);
        if (!pt) return null;
        const d = pt.applyMatrix4(obj.matrixWorld).distanceTo(r.origin);
        return d <= reach ? d : null;
      },
    };
    this.stuck.push(entry);
  }

  private unstick(x: { obj: THREE.Group; mat: PicMat; rec: StuckPrint }): void {
    x.obj.removeFromParent();
    x.mat.dispose();
    this.mats.drop('nd-camera:print:' + x.rec.item.uid);
    const i = this.stuck.findIndex((y) => y.obj === x.obj);
    if (i >= 0) this.stuck.splice(i, 1);
  }

  /** a stuck print taken back into the hands */
  private takeDown(x: { rec: StuckPrint; obj: THREE.Group; mat: PicMat }): void {
    const ctx = this.ctx!;
    const h = { kind: 'item' as const, item: x.rec.item };
    if (ctx.player.receive(h) > 0) return void ctx.player.flashWhy('手满了');
    const at = ctx.player.slots.indexOf(h);
    if (at >= 0) ctx.player.sel = at;
    this.unstick(x);
    ctx.sound('pickup', 0.3);
  }

  // ------------------------------------------------------------------ the finder

  private showFinder(on: boolean, cam: ItemInstance | null): void {
    if (!on && !this.overlay) return;
    if (typeof document === 'undefined') return;
    if (!this.overlay) {
      const root = document.createElement('div');
      root.id = 'nd-finder';
      root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:4;display:none';
      const frame = document.createElement('div');
      frame.style.cssText = `position:absolute;left:50%;top:50%;height:${FRAME_H * 100}vh;aspect-ratio:${ASPECT.toFixed(4)};transform:translate(-50%,-50%);border-radius:18px;box-shadow:inset 0 0 0 2px rgba(255,255,255,0.55), inset 0 0 60px rgba(0,0,0,0.35)`;
      const mk = (css: string) => {
        const d = document.createElement('div');
        d.style.cssText = css;
        frame.appendChild(d);
        return d;
      };
      // corner marks and the centre's cross
      for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        mk(`position:absolute;${x ? 'right' : 'left'}:18px;${y ? 'bottom' : 'top'}:18px;width:26px;height:26px;border-${x ? 'right' : 'left'}:2px solid rgba(255,255,255,0.8);border-${y ? 'bottom' : 'top'}:2px solid rgba(255,255,255,0.8)`);
      }
      mk('position:absolute;left:50%;top:50%;width:18px;height:1px;background:rgba(255,255,255,0.7);transform:translate(-50%,-50%)');
      mk('position:absolute;left:50%;top:50%;width:1px;height:18px;background:rgba(255,255,255,0.7);transform:translate(-50%,-50%)');
      const count = mk('position:absolute;right:22px;bottom:-34px;color:#f3efe6;font:600 15px/1 system-ui,sans-serif;text-shadow:0 1px 2px #000');
      const zoom = mk('position:absolute;left:22px;bottom:-34px;color:#f3efe6;font:600 15px/1 system-ui,sans-serif;text-shadow:0 1px 2px #000');
      // the dark round the frame: four bands (the frame is FRAME_H of the height, ASPECT as wide)
      const fh = FRAME_H * 100;
      const half = (fh * ASPECT) / 2;
      const shade = 'position:absolute;background:rgba(12,12,14,0.62)';
      for (const css of [
        `${shade};left:0;right:0;top:0;height:${(100 - fh) / 2}vh`,
        `${shade};left:0;right:0;bottom:0;height:${(100 - fh) / 2}vh`,
        `${shade};left:0;top:${(100 - fh) / 2}vh;height:${fh}vh;width:calc(50vw - ${half.toFixed(3)}vh)`,
        `${shade};right:0;top:${(100 - fh) / 2}vh;height:${fh}vh;width:calc(50vw - ${half.toFixed(3)}vh)`,
      ]) {
        const b = document.createElement('div');
        b.style.cssText = css;
        root.appendChild(b);
      }
      root.appendChild(frame);
      const flash = document.createElement('div');
      flash.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:5';
      document.body.appendChild(root);
      document.body.appendChild(flash);
      this.overlay = { root, count, zoom, flash };
    }
    const ov = this.overlay;
    ov.root.style.display = on ? 'block' : 'none';
    if (on && cam) {
      ov.count.textContent = `相纸 ${filmOf(cam)}`;
      ov.zoom.textContent = `${zoomAt(this.zoom).toFixed(1)}×`;
    }
  }

  // ------------------------------------------------------------------ a camera lying about

  pickUp(l: Loose): void {
    const ctx = this.ctx!;
    if (!ctx.player.takeLoose(l)) ctx.player.flashWhy('手满了');
  }

  /** the box of film in the hands, if that is what they hold */
  filmInHand(): ItemInstance | null {
    const h = this.ctx?.player.held;
    return h?.kind === 'item' && h.item.item === ND_FILM ? h.item : null;
  }

  /** the camera in the hands, if that is what they hold */
  cameraInHand(): ItemInstance | null {
    const h = this.ctx?.player.held;
    return h?.kind === 'item' && h.item.item === ND_CAMERA ? h.item : null;
  }

  /** a camera lying about loaded from the box of film in the hands (the box is used up) */
  loadFromHand(l: Loose, pack: ItemInstance): void {
    const ctx = this.ctx!;
    const p = ctx.player;
    const i = p.slots.findIndex((h) => h?.kind === 'item' && h.item === pack);
    if (i >= 0) p.slots[i] = null;
    this.loaded(loadFilm(l.item!));
    ctx.loose.touch(l);
  }

  /** the camera in the hands loaded from a box of film lying about (the box is used up) */
  loadLying(cam: ItemInstance, pack: Loose): void {
    const ctx = this.ctx!;
    ctx.loose.remove(pack);
    this.loaded(loadFilm(cam));
  }

  private loaded(n: number): void {
    const ctx = this.ctx!;
    ctx.sound('container_open', 0.5);
    blip('click', 0.7);
    ctx.player.flashWhy(`相纸 ${n} 张`);
  }

  near(at: PlanPoint, r: number, out: GarageDevice[]): void {
    for (const x of this.stuck) {
      if (!x.obj.visible) continue;
      const dx = x.rec.x - at.x;
      const dz = x.rec.z - at.z;
      if (dx * dx + dz * dz <= (r + 0.2) ** 2) out.push(x.device);
    }
    // (the two lists walked as they are: near() is asked every frame and should not allocate)
    for (const t of this.things.values()) {
      const dx = t.loose.x - at.x;
      const dz = t.loose.z - at.z;
      if (dx * dx + dz * dz <= (r + 0.3) ** 2) out.push(t);
    }
    for (const t of this.films.values()) {
      const dx = t.loose.x - at.x;
      const dz = t.loose.z - at.z;
      if (dx * dx + dz * dz <= (r + 0.3) ** 2) out.push(t);
    }
  }

  telemetry(): Record<string, unknown> {
    return { raise: this.raise, zoom: zoomAt(this.zoom), shots: this.shots, hanging: !!this.hanging, prints: this.prints.size, written: this.store.written };
  }

  readonly harness = {
    /** raise it (or lower it) at once, the zoom's setting */
    raise: (on: boolean, zoom = 0): void => {
      this.raise = on ? 1 : 0;
      this.forceRaise = on;
      this.zoom = zoom;
    },
    /** a print in the hands held up to look at (as F held) */
    lookPhoto: (on: boolean): void => {
      this.photoUp = on ? 1 : 0;
      this.photoForce = on;
    },
    /** the shutter, as the left button with it raised */
    shoot: (): boolean => {
      const h = this.ctx?.player.held;
      if (h?.kind !== 'item' || h.item.item !== ND_CAMERA) return false;
      this.raise = 1;
      this.shutter(h.item);
      return true;
    },
    /** the prints lying about: uid, where, how developed */
    /** the print in the hands stuck where the mark is (as E): where it went, null nowhere */
    stick: (): string | null => {
      const ctx = this.ctx;
      const h = ctx?.player.held;
      if (!ctx || h?.kind !== 'item' || h.item.item !== ND_PHOTO) return null;
      const aim = aimStick(ctx, this.roll, this.aimBuf);
      if (!aim) return null;
      const on = aim.on ? 'vehicle' : aim.thing ? 'thing' : 'world';
      this.stick(h.item, aim);
      return on;
    },
    stuck: (): { uid: string; x: number; y: number; z: number }[] => this.stuck.map((x) => ({ uid: x.rec.item.uid, x: x.rec.x, y: x.rec.y, z: x.rec.z })),
    prints: (): { uid: string; x: number; y: number; z: number; resting: boolean; dev: number; key: string }[] =>
      [...this.prints.keys()].map((l) => ({ uid: l.uid, x: l.x, y: l.y, z: l.z, resting: l.resting, dev: developed((this.ctx?.clock.worldSeconds ?? 0) - (l.item?.state?.photo?.at ?? 0)), key: photoKey(l.item!) })),
  };

  dispose(): void {
    this.ghost?.dispose();
    for (const x of [...this.stuck]) this.unstick(x);
    this.overlay?.root.remove();
    this.overlay?.flash.remove();
    this.store.dispose();
    this.mats.dispose();
  }
}
