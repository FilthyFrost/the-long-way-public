/**
 * The keepsakes (docs/ND/PLAN.md, ND4): Nomad Drive's bobbleheads, its licence plates, its picture frames, and what its
 * vehicles' walls take.
 *
 *  - A bobblehead's head nods on its spring with what it stands on (core/v3/nd/bobble.ts): on a dashboard, a table, a
 *    shelf, in the hands. There are four, one of each, only ever in buried chests: a world shuffles them and each
 *    chest first opened deals the next (this module's save counts them).
 *  - A plate is rolled the first time it is seen (core/v3/nd/plates.ts: its region, its number, its grade, how rare it
 *    is) and painted so (nd/canvasArt.ts); the first time it is in the hands a rare one is said; its card says what it is.
 *  - A frame holds one of six paintings, picked the first time it is seen.
 *  - A vehicle's walls take Nomad Drive's kinds as Nomad Drive's do: always a key, a print, a first-aid box, a plate, a
 *    wall cabinet; never a stove or a pot; else a tool, a kitchen thing or a piece of furniture up to 1.3 m across that
 *    stands out from the wall no more than 0.3 m (the game's own kinds as the game has it). There is no tool rack in
 *    Nomad Drive: the wall itself is it.
 */
import * as THREE from 'three';
import type { System } from '../../../../core/kernel/systems';
import type { SaveSlice } from '../../../../core/kernel/slices';
import { itemDef, type ItemInstance } from '../../../../core/modcar/items';
import { BOBBLES, bobbleDeck, Wobble, WOBBLE, type Axes } from '../../../../core/v3/nd/bobble';
import { hashStr, plateSayS, plateText, rollPlate, TIERS, type PlateRoll } from '../../../../core/v3/nd/plates';
import { surfaceMaterial } from '../../../render/materials';
import type { GameContext } from '../../kernel/context';
import type { Loose } from '../../loose';
import { chestDealers, modelOf } from '../../nd/kit';
import { pictureTexture, PICTURES, plateTexture } from '../../nd/canvasArt';

declare module '../../../../core/modcar/items' {
  interface ItemState {
    /** a licence plate as it was rolled the first time it was seen; found: it has been in the hands */
    plate?: PlateRoll & { found?: boolean };
    /** a picture frame's painting (0…5) */
    picture?: number;
  }
}

export const ND_PLATE = 'nd_plate';
export const ND_FRAME = 'nd_frame';
const BOBBLE = new Set<string>(BOBBLES);

/** Explicit wall-hanging whitelist: only genuine wall decor/cabinets/racks hang on RV walls (never tabletop appliances). */
const WALL_ALWAYS = new Set([
  'nd_key_1',
  'nd_key_2',
  'nd_photo',
  'nd_first_aid',
  ND_PLATE,
  ND_FRAME,
  'nd_top_cabinet',
  'nd_wall_cabinet',
  'kit_toolrack',
  'kit_rodrack',
  'junk_clock',
]);
const WALL_NEVER = new Set([
  'kit_stove',
  'kit_stove2',
  'kit_pot',
  'kit_pan',
  'nd_coffee_machine',
  'junk_lamp',
  'junk_tv',
  'junk_clockradio',
  'junk_record',
  'junk_fan',
]);

const AX: Axes = { fx: 1, fy: 0, fz: 0, ux: 0, uy: 1, uz: 0, rx: 0, ry: 0, rz: 1 };
const V = new THREE.Vector3();
const DEG = Math.PI / 180;

export class NdCollect implements System<GameContext> {
  readonly id = 'nd-collect';
  readonly budget = { cpuMs: 0.3 };
  private ctx: GameContext | null = null;
  /** each bobblehead's nod, by the thing's own uid (it keeps it from the hands to the dashboard) */
  private readonly wobbles = new Map<string, Wobble>();
  /** the bobbleheads dealt so far from the world's deck */
  dealt = 0;
  private rev = -1;
  /** the plates and frames painted, by the model they were painted on */
  private readonly painted = new WeakSet<THREE.Object3D>();
  private heldUid = '';
  private readonly eyeW = { x: 0, y: 0, z: 0 };

  readonly slice: SaveSlice<{ dealt?: number }> = {
    id: 'nd-collect',
    version: 1,
    snapshot: () => (this.dealt ? { dealt: this.dealt } : undefined),
    restore: (d) => {
      this.dealt = Math.max(0, Math.min(BOBBLES.length, d.dealt ?? 0));
    },
    clear: () => {
      this.dealt = 0;
    },
  };

  init(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.cargo.wallRules.push((h) => {
      if (h.kind !== 'item') return false;
      const id = h.item.item;
      if (WALL_NEVER.has(id)) return false;
      return WALL_ALWAYS.has(id);
    });
    chestDealers.push(() => this.dealBobble());
  }

  /** the next bobblehead of the world's deck (none once all four are dealt) */
  dealBobble(): string[] {
    const w = this.ctx?.world;
    const deck = bobbleDeck(w ? w.seed : (this.ctx?.params.seed ?? 1));
    if (this.dealt >= deck.length) return [];
    return [deck[this.dealt++]];
  }

  /** a plate rolled the first time it is seen (the world's seed and its own uid) */
  private plateOf(it: ItemInstance): PlateRoll & { found?: boolean } {
    const st = (it.state ??= {});
    if (!st.plate) {
      const seed = this.ctx?.world?.seed ?? this.ctx?.params.seed ?? 1;
      st.plate = rollPlate(seed, hashStr(it.uid));
    }
    return st.plate;
  }

  private pictureOf(it: ItemInstance): number {
    const st = (it.state ??= {});
    st.picture ??= Math.floor(Math.random() * PICTURES.length);
    return st.picture;
  }

  /** a plate's face or a frame's painting laid over its placeholder on a model (once a model) */
  private paint(model: THREE.Object3D, it: ItemInstance): void {
    if (this.painted.has(model)) return;
    const plate = it.item === ND_PLATE;
    const ph = model.getObjectByName(plate ? 'P_text' : 'P_pic');
    if (!ph?.parent) return;
    const tex = plate ? plateTexture(this.plateOf(it)) : pictureTexture(this.pictureOf(it));
    if (!tex) return;
    const box = new THREE.Box3();
    ph.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.computeBoundingBox();
      box.union(m.geometry.boundingBox!);
    });
    if (box.isEmpty()) return;
    this.painted.add(model);
    ph.visible = false;
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    // (a plane over the placeholder's face, facing +x as the model does: its width along −z, the viewer's right)
    const g = new THREE.PlaneGeometry(size.z, size.y);
    g.rotateY(Math.PI / 2);
    const mesh = new THREE.Mesh(g, surfaceMaterial({ map: tex, spec: plate ? 0.25 : 0.05, cabinLift: true }));
    mesh.name = 'nd:face';
    mesh.position.copy(ph.position).add(c);
    mesh.position.x += size.x / 2 + 0.0004;
    ph.parent.add(mesh);
  }

  lateUpdate(dt: number, ctx: GameContext): void {
    const loose = ctx.loose;
    const o = ctx.core.origin;
    // (where one looks from: the camera, seated or not)
    const cam = ctx.core.camera.position;
    const eye = this.eyeW;
    eye.x = cam.x + o.x;
    eye.y = cam.y + o.y;
    eye.z = cam.z + o.z;
    // the plates rolled and the frames' paintings picked as they come; their faces painted; the bobbleheads kept apart (their heads move)
    if (loose.rev !== this.rev) {
      this.rev = loose.rev;
      for (const l of loose.list) {
        const id = l.item?.item;
        if (id === ND_PLATE || id === ND_FRAME || (id && BOBBLE.has(id))) loose.keepApart(l.uid, true);
      }
    }
    for (const l of loose.list) {
      const it = l.item;
      if (!it) continue;
      if (it.item === ND_PLATE || it.item === ND_FRAME) {
        const m = modelOf(l);
        if (m) this.paint(m, it);
      } else if (BOBBLE.has(it.item)) this.nod(l.obj, modelOf(l), it.uid, dt, false, eye, o);
    }
    // what is in the hands
    const h = ctx.player.held;
    const hm = ctx.heldThing.model;
    if (h?.kind === 'item') {
      const it = h.item;
      if ((it.item === ND_PLATE || it.item === ND_FRAME) && hm) this.paint(hm, it);
      if (BOBBLE.has(it.item) && hm) this.nod(hm, hm, it.uid, dt, true, eye, o);
      // a plate in the hands the first time: found (a rare one said so)
      if (it.item === ND_PLATE && this.heldUid !== it.uid) {
        const p = this.plateOf(it);
        if (!p.found) {
          p.found = true;
          const s = plateSayS(p);
          if (s > 0) ctx.ui.say(`找到一块${TIERS[p.tier].zh}车牌：${plateText(p)} · ${p.oneIn.toLocaleString('zh-CN')} 分之一`, s);
        }
      }
      this.heldUid = it.uid;
    } else this.heldUid = '';
  }

  /** a bobblehead's head nodded for what its base did this frame (far off, or still: at rest) */
  private nod(base: THREE.Object3D, model: THREE.Object3D | null, uid: string, dt: number, held: boolean, eye: { x: number; y: number; z: number }, o: { x: number; y: number; z: number }): void {
    const head = model?.getObjectByName('N_head');
    if (!head) return;
    base.updateWorldMatrix(true, false);
    const m = base.matrixWorld.elements;
    const x = m[12] + o.x;
    const y = m[13] + o.y;
    const z = m[14] + o.z;
    let w = this.wobbles.get(uid);
    if (!w) {
      w = new Wobble(hashStr(uid) % 7);
      this.wobbles.set(uid, w);
    }
    if (!held && Math.hypot(x - eye.x, z - eye.z) > WOBBLE.farM) {
      w.reset();
      head.rotation.set(0, 0, 0);
      return;
    }
    // its frame: its front (+x), its up, its right (+z), from the base's matrix
    V.set(m[0], m[1], m[2]).normalize();
    AX.fx = V.x;
    AX.fy = V.y;
    AX.fz = V.z;
    V.set(m[4], m[5], m[6]).normalize();
    AX.ux = V.x;
    AX.uy = V.y;
    AX.uz = V.z;
    V.set(m[8], m[9], m[10]).normalize();
    AX.rx = V.x;
    AX.ry = V.y;
    AX.rz = V.z;
    w.step(dt, x, y, z, AX, held);
    // (nod + tips its face forward and down: about its right, −; lean + to its left: about its front, −)
    head.rotation.set(-w.roll * DEG, 0, -w.nod * DEG);
  }

  telemetry(): Record<string, unknown> {
    return { dealt: this.dealt, nodding: this.wobbles.size };
  }

  readonly harness = {
    /** a bobblehead's nod now (by its thing's uid) */
    nod: (uid: string): { nod: number; roll: number } | null => {
      const w = this.wobbles.get(uid);
      return w ? { nod: w.nod, roll: w.roll } : null;
    },
    /** every bobblehead nodding, by its kind */
    nods: (): { uid: string; item: string; nod: number; roll: number }[] => {
      const out: { uid: string; item: string; nod: number; roll: number }[] = [];
      for (const l of this.ctx?.loose.list ?? []) {
        if (!l.item || !BOBBLE.has(l.item.item)) continue;
        const w = this.wobbles.get(l.item.uid);
        out.push({ uid: l.uid, item: l.item.item, nod: w?.nod ?? 0, roll: w?.roll ?? 0 });
      }
      return out;
    },
    /** a plate as it was rolled (rolled now if it was not yet) */
    plate: (uid: string): (PlateRoll & { text: string }) | null => {
      const l = this.ctx?.loose.list.find((x) => x.uid === uid);
      if (!l?.item || l.item.item !== ND_PLATE) return null;
      const p = this.plateOf(l.item);
      return { ...p, text: plateText(p) };
    },
    dealt: (): number => this.dealt,
    deal: (): string[] => this.dealBobble(),
  };
}

export function isBobble(l: Loose): boolean {
  return !!l.item && BOBBLE.has(l.item.item);
}
