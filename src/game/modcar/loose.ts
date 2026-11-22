/**
 * Things lying about (docs/MODCAR.md §5): parts taken off a vehicle or waiting on a shelf, and the
 * tools — a jerrycan, a bottle of water, an oil can, spray cans, a sponge. Put down, they drop onto
 * whatever surface is under them (the floor, a shelf, a bench) and stay there. Put down over a vehicle
 * (into a pickup's bed, onto a seat, a roof, a bonnet) they land on it and ride with it, tied down,
 * wherever it goes: the spare jerrycan on the road.
 *
 * A stack of things (items.ts: one instance with a count) lies about as ONE thing, drawn as one of its kind;
 * nothing joins up by itself on the ground. A thing that goes off starts doing so, at the latest, as it comes
 * to lie here, and when it has turned into another kind it is drawn again as that (settle).
 */
import * as THREE from 'three';
import { itemDef, itemPaint, settleItem, stampFresh, type ItemInstance } from '../../core/modcar/items';
import { partDef } from '../../core/modcar/parts';
import { paintHex } from '../../core/modcar/palette';
import { paintNow, sprayTier } from '../../core/modcar/paint';
import { toolModelId, type Tool } from '../../core/modcar/tools';
import type { ThingBox } from '../../core/modcar/cargo';
import type { PartInstance } from '../../core/modcar/types';
import type { RenderCore } from '../render/core';
import type { CarLook } from '../render/carMaterials';
import { MergedCar } from '../render/carMerge';
import { cloneModel, itemGlb, panelPaint, partModel, seatTyres, toolGlb } from './assets';
import { itemNow } from './itemTime';
import { applyMaterials, matNames, type CarMaterials, type LookOf } from './materials';
import { castMesh } from '../render/triGrid';
import { glassName } from './grime';

/** a part lying about that can be cleaned (grime.ts): its look's meshes with MASK UVs (a wheel: its rim, its tyre) */
export interface LooseGrime {
  loose: Loose;
  /** the look's owner (CarMaterials), the part (the rim's, or its tyre's) */
  owner: string;
  inst: PartInstance;
  meshes: THREE.Mesh[];
  size: number;
  label: string;
}

export interface Loose {
  uid: string;
  part: PartInstance | null;
  tool: Tool | null;
  /** food, a drink, clothes, junk, a box of components (items.ts) */
  item: ItemInstance | null;
  /** world position of its base, and its heading */
  x: number;
  y: number;
  z: number;
  yaw: number;
  vy: number;
  resting: boolean;
  obj: THREE.Group;
  /** pick sphere radius and the height of its middle above the base (m) */
  radius: number;
  mid: number;
  /** lying on a vehicle, riding with it */
  riding?: Riding | null;
  /** stowed in one of the vehicle's zones (cargo.ts: 'trunk', 'bed' …) */
  stow?: string;
  /** its box as it lies, in its own frame (for packing round it) */
  box?: ThingBox;
  /** stowed on its side (too tall to stand where it went) */
  lie?: 'z' | 'x';
  /** where it will land as it falls: found once when it starts, the floor or a vehicle's surface */
  landing?: { y: number; on: Carrier | null };
  /** an item: the kind its model was made for (one that has gone off is another kind now: its model is made again) */
  madeAs?: string;
  /**
   * A system works it as a device (an appliance: docs/V3/nodes/M2-rv.md): the mark finds it through that device —
   * E uses it, F held picks it up there — and not as a thing lying about to pick up with E.
   */
  device?: boolean;
  /**
   * Inside a container that is shut (docs/V3/nodes/M3-loot.md: behind a cupboard's doors, in a drawer, under a
   * crate's lid): there, but not seen and not reached until it is opened.
   */
  shut?: boolean;
  /**
   * It has changed in itself where it lies (some taken off its stack, a thing put into it or taken out of it:
   * LooseThings.touch). A place that had it lying in plain sight lets it go then, as it does a thing that was
   * moved: it is one's own from there on, and saved (places.ts).
   */
  touched?: boolean;
}

/** where a dropped thing comes to rest: the highest surface at (x, z) not above `fromY` */
export type SurfaceAt = (x: number, z: number, fromY: number) => number;

/** something that things can lie on and ride with (a vehicle) */
export interface Carrier {
  /** the highest surface of it at world (x, z) not above `fromY`; null where none of it is under that point */
  surfaceAt(x: number, z: number, fromY: number): number | null;
  /** the group the things on it ride in (render space, moving with it) */
  readonly frame: THREE.Object3D;
}

/** where a thing lies in its carrier's frame (render metres and turn) */
export interface Riding {
  on: Carrier;
  pos: THREE.Vector3;
  rot: THREE.Quaternion;
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);

const toolMats = new Map<string, THREE.MeshStandardMaterial>();
function tm(name: string): THREE.MeshStandardMaterial {
  let m = toolMats.get(name);
  if (!m) {
    m = new THREE.MeshStandardMaterial();
    m.name = name;
    toolMats.set(name, m);
  }
  return m;
}

/** the tools' own little models (their GLBs can replace these later) */
export function toolModel(t: Tool): THREE.Group {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: string, x = 0, y = 0, z = 0): THREE.Mesh => {
    const m = new THREE.Mesh(geo, tm(mat));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  if (t.kind === 'jerrycan') {
    add(new THREE.BoxGeometry(0.17, 0.46, 0.34), t.fuel === 'diesel' ? 'paint_b' : 'paint', 0, 0.23, 0);
    add(new THREE.BoxGeometry(0.05, 0.05, 0.22), 'steel', 0, 0.49, -0.02);
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 10), 'steel', 0, 0.48, 0.13);
  } else if (t.kind === 'bottle') {
    add(new THREE.CylinderGeometry(0.09, 0.1, 0.32, 16), 'glass', 0, 0.16, 0);
    add(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 10), 'trim', 0, 0.34, 0);
  } else if (t.kind === 'oilcan') {
    add(new THREE.BoxGeometry(0.1, 0.26, 0.2), 'paint', 0, 0.13, 0);
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 8), 'trim', 0, 0.29, 0.05);
  } else if (t.kind === 'spray') {
    add(new THREE.CylinderGeometry(0.033, 0.033, 0.19, 14), 'paint', 0, 0.095, 0);
    add(new THREE.CylinderGeometry(0.02, 0.025, 0.03, 10), 'chrome', 0, 0.205, 0);
  } else {
    add(new THREE.BoxGeometry(0.14, 0.06, 0.09), 'paint', 0, 0.03, 0);
  }
  return g;
}

/** an item without its model yet: a box about its size (by how it is carried) */
export function itemStandIn(inst: ItemInstance): THREE.Group {
  const d = itemDef(inst.item);
  const g = new THREE.Group();
  const [w, h, l] = d.carry === 'large' ? [0.5, 0.6, 0.5] : d.carry === 'medium' ? [0.32, 0.28, 0.26] : [0.14, 0.12, 0.1];
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), tm('paint'));
  m.position.y = h / 2;
  g.add(m);
  const band = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, h * 0.3, l * 1.02), tm('paint_b'));
  band.position.y = h / 2;
  g.add(band);
  return g;
}

/** the colours a tool's model is painted: a petrol can red, a diesel can green, a spray can its colour, a scraper by its tier */
export function toolLook(t: Tool): { paint: number; paint2: number } {
  if (t.kind === 'jerrycan') {
    const c = t.fuel === 'diesel' ? 0x2f6a3a : 0xb8302a;
    return { paint: c, paint2: c };
  }
  if (t.kind === 'oilcan') return { paint: 0xd8a531, paint2: 0xd8a531 };
  // (a spray can in its paint's colour, its label's stripes ivory: charcoal on a pale can; the large can's gold)
  if (t.kind === 'spray') {
    const c = paintHex(t.colour ?? 0);
    const pale = ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11 > 190;
    return { paint: c, paint2: pale ? 0x2f3236 : sprayTier(t) === 3 ? 0xe6c46a : 0xf4efe2 };
  }
  if (t.kind === 'scraper') return t.tier === 3 ? { paint: 0xd4a53b, paint2: 0x6b3d24 } : t.tier === 2 ? { paint: 0xc8323a, paint2: 0x2f3236 } : { paint: 0x3e8ec7, paint2: 0xf0c23c };
  // (the wire brush's painted band)
  if (t.kind === 'brush') return { paint: 0xc8473a, paint2: 0xc8473a };
  return { paint: 0xe8d257, paint2: 0xe8d257 };
}

let n = 0;

const ownerOf = (l: Loose): string => `l:${l.uid}`;

/** the colour a coat of paint on a part lying about starts from (sRGB hex): its own, else its factory's (a panel's style's) */
export function paintBaseOf(inst: PartInstance): number {
  if (inst.paint >= 0) return paintNow(inst, 0x8f3a2c);
  const style = partDef(inst.part).panel?.style;
  return style === 'armor' || style === 'fridge' ? panelPaint(style, 0) : 0x8f3a2c;
}

/** what an engine block, a seat frame or a lamp housing is painted at the factory (as on a vehicle; a panel by its style) */
export function partLook(inst: PartInstance): LookOf {
  const own = inst.paint >= 0;
  const base = own ? paintNow(inst, 0x8f3a2c) : 0x8f3a2c;
  const style = partDef(inst.part).panel?.style;
  return {
    paint: style ? panelPaint(style, base, own) : base,
    paint2: 0xd8d4c8,
    dirt: inst.dirt,
    rust: style === 'rusty' ? Math.max(0.85, inst.rust) : inst.rust,
    wear: Math.max(0, Math.min(1, (0.7 - inst.cond) / 0.6)),
    crust: inst.crust ?? 0,
  };
}

/** the movers inside a part stay out of a merge (render/carMerge default rule plus the parts' movers) */
const MOVES = /^(P_|PG_|pivot_|N_|WIPER_|FUEL_CAP|M_|LEVER|KEY|BUTTON|COVER|TAPE_DOOR|KNOB_|LID|FLAP_)/;

export class LooseThings {
  /** placed at the world's origin (render space): the things in it, and their merge, are in world metres */
  readonly root = new THREE.Group();
  readonly list: Loose[] = [];
  private readonly loads = new Set<Promise<unknown>>();
  /**
   * Everything lying still, merged into a mesh per material (the garage's thirty-odd parts and tools would
   * be a hundred and more draw calls in every pass): made again whenever something is picked up, put
   * down or lands. Ids: one per thing.
   */
  private merged: MergedCar | null = null;
  private mergedLook: CarLook | null = null;
  private mergeDirty = true;
  private readonly mergeIds = new Map<string, number>();
  private readonly mergedAs = new Map<number, { dirt: number; rust: number; paint: number }>();
  private litId = -1;
  /**
   * The things whose paint is no car's (items with a gloss of their own, items.ts `matte`: a tomato, a loaf of bread):
   * merged apart from the rest, a lot to each gloss, for a merged mesh has one gloss. `ids`: each thing's id in its lot.
   */
  private readonly matteMerges = new Map<number, { merged: MergedCar; look: CarLook; ids: Map<string, number>; lit: number }>();
  /** things being cleaned (with grime masks): drawn on their own, never merged */
  private readonly grimeHeld = new Set<string>();
  /** the things a spray can is on (their colour moving every frame, their flash): drawn on their own */
  private readonly paintHeld = new Set<string>();
  private readonly sphere = new THREE.Sphere();
  private readonly ray = new THREE.Ray();
  private readonly hit = new THREE.Vector3();

  /** the vehicles things can be put on (the game fills this in) */
  carriers: () => readonly Carrier[] = () => [];
  /**
   * Goes up whenever the things lying about change: one comes or goes, lands or is lifted, becomes another
   * kind, or is said to have changed in itself (touch). A list of them is built again only when it has moved.
   */
  rev = 0;
  /** which thing is looked at next for having gone off (one a frame) */
  private settleAt = 0;
  /**
   * Told when a thing riding on a carrier has come to weigh something else by itself (it, or a thing in it,
   * turned into another kind): whoever weighs what a vehicle carries weighs it again (cargo.ts sets this).
   */
  weightChanged: ((on: Carrier) => void) | null = null;
  private readonly qa = new THREE.Quaternion();
  private readonly va = new THREE.Vector3();

  constructor(
    private readonly core: RenderCore,
    private readonly mats: CarMaterials,
    public surfaceAt: SurfaceAt,
  ) {
    this.root.name = 'modcar:loose';
    core.scene.add(this.root);
  }

  addPart(inst: PartInstance, x: number, y: number, z: number, yaw = 0): Loose {
    const l = this.make(inst, null, x, y, z, yaw);
    const def = partDef(inst.part);
    const look = this.mats.look(ownerOf(l), partLook(inst));
    void this.track(partModel(inst.part)).then((model) => {
      if (!this.list.includes(l)) return;
      const obj = cloneModel(model);
      applyMaterials(obj, look);
      // a wheel lies on its side
      if (def.cat === 'rim' || def.cat === 'tire') {
        obj.rotation.x = Math.PI / 2;
        const r = def.rim?.radius ?? (0.165 + (def.tire?.sidewall ?? 0.1));
        const w = def.rim?.width ?? def.tire?.width ?? 0.15;
        obj.position.y = w / 2;
        void r;
      }
      l.obj.add(obj);
      this.mergeDirty = true;
      const t = inst.sub.tire;
      if (t && def.cat === 'rim') {
        const tl = this.mats.look(`${ownerOf(l)}+tire`, { paint: 0x222222, paint2: 0xeeeeee, dirt: t.dirt, wear: 1 - (t.tread ?? 1), crust: t.crust ?? 0 });
        void this.track(partModel(t.part, inst.part)).then((tmodel) => {
          if (!this.list.includes(l)) return;
          const to = seatTyres(model, tmodel, def.rim!, partDef(t.part).tire!.sidewall, !!t.flat);
          applyMaterials(to, tl);
          // lying on its side like the rim
          const wrap = new THREE.Group();
          wrap.add(to);
          wrap.rotation.x = Math.PI / 2;
          wrap.position.y = (def.rim?.width ?? 0.15) / 2;
          l.obj.add(wrap);
          this.mergeDirty = true;
          this.measure(l);
        });
      }
      this.measure(l);
    });
    return l;
  }

  private track<T>(p: Promise<T>): Promise<T> {
    this.loads.add(p);
    void p.finally(() => this.loads.delete(p));
    return p;
  }

  /** resolves once every thing put down so far has its model */
  async settled(): Promise<void> {
    while (this.loads.size) await Promise.all([...this.loads]);
  }

  addItem(item: ItemInstance, x: number, y: number, z: number, yaw = 0): Loose {
    // (a thing that goes off and has not started yet starts now: it is in the world)
    stampFresh(item, itemNow());
    const l = this.make(null, null, x, y, z, yaw, item);
    this.dressItem(l, item);
    return l;
  }

  /** an item's model in its colours: a stand-in at once, its own model when that is in. A stack is one thing: one model of its kind. */
  private dressItem(l: Loose, item: ItemInstance): void {
    l.madeAs = item.item;
    const look = this.mats.look(ownerOf(l), itemPaint(item));
    const obj = itemStandIn(item);
    applyMaterials(obj, look);
    l.obj.add(obj);
    this.mergeDirty = true;
    this.measure(l);
    void this.track(itemGlb(itemDef(item.item).model)).then((m) => {
      // (gone, or dressed again as another kind since: this model is not wanted any more)
      if (!m || !this.list.includes(l) || obj.parent !== l.obj) return;
      const real = cloneModel(m);
      applyMaterials(real, look);
      obj.removeFromParent();
      l.obj.add(real);
      this.unmerge();
      this.measure(l);
    });
  }

  /**
   * A thing lying about that has turned becomes what its kind goes off into (items.ts settleItem), where it
   * lies, and is drawn again as that; and so do the things in it, if it holds any. True when anything changed:
   * lists of the things lying about are built again then, and a vehicle the thing rides in is told that its
   * weight may be another (weightChanged). update looks at one thing a frame; whoever lists a thing or hands
   * it over asks at once.
   */
  settle(l: Loose, nowS: number): boolean {
    const it = l.item;
    if (!it) return false;
    let inside = false;
    const ins = it.inside;
    if (ins) for (let i = 0; i < ins.length; i++) if (settleItem(ins[i], nowS)) inside = true;
    if (settleItem(it, nowS)) {
      this.redress(l);
      return true;
    }
    if (!inside) return false;
    this.rev++;
    if (l.riding) this.weightChanged?.(l.riding.on);
    return true;
  }

  /**
   * A thing lying about was made another kind where it lies by a system (the coffee maker's pot taken off: docs/V3/nodes/M2-rv.md):
   * drawn again as that at once, not when the round of the things comes to it
   */
  retype(l: Loose): void {
    if (l.item && l.madeAs !== l.item.item) this.redress(l);
  }

  /** an item's model made again (it is another kind now) */
  private redress(l: Loose): void {
    const item = l.item!;
    l.obj.clear();
    l.obj.name = `loose:${item.item}`;
    // (its box for packing is its model's)
    l.box = undefined;
    this.unmerge();
    this.dressItem(l, item);
    this.rev++;
    // (another kind, another weight perhaps: what it rides in carries that now)
    if (l.riding) this.weightChanged?.(l.riding.on);
  }

  /**
   * A thing lying about changed in itself (some taken off a stack, a thing put into a box or taken out of it):
   * lists of the things lying about are built again, and the thing, when it is said which, is marked as
   * touched, so that a place it belonged to lets it go and it is saved from then on (places.ts).
   */
  touch(l?: Loose): void {
    this.rev++;
    if (l) l.touched = true;
  }

  addTool(tool: Tool, x: number, y: number, z: number, yaw = 0): Loose {
    const l = this.make(null, tool, x, y, z, yaw);
    const look = this.mats.look(ownerOf(l), toolLook(tool));
    const obj = toolModel(tool);
    applyMaterials(obj, look);
    l.obj.add(obj);
    this.mergeDirty = true;
    this.measure(l);
    // its own model, when there is one, takes the stand-in's place
    void this.track(toolGlb(toolModelId(tool))).then((m) => {
      if (!m || !this.list.includes(l)) return;
      const real = cloneModel(m);
      applyMaterials(real, look);
      obj.removeFromParent();
      l.obj.add(real);
      this.unmerge();
      this.measure(l);
    });
    return l;
  }

  /**
   * The thing as it would lie, its models loaded (no materials: for its box, and for a ghost): a wheel on
   * its side with its tyre, a tool's or an item's own model or its stand-in.
   */
  async objectFor(h: { kind: 'part'; inst: PartInstance } | { kind: 'tool'; tool: Tool } | { kind: 'item'; item: ItemInstance }): Promise<THREE.Object3D> {
    const g = new THREE.Group();
    if (h.kind === 'part') {
      const inst = h.inst;
      const def = partDef(inst.part);
      const model = await partModel(inst.part);
      const obj = cloneModel(model);
      const flat = def.cat === 'rim' || def.cat === 'tire';
      if (flat) {
        obj.rotation.x = Math.PI / 2;
        obj.position.y = (def.rim?.width ?? def.tire?.width ?? 0.15) / 2;
      }
      g.add(obj);
      const t = inst.sub.tire;
      if (t && def.cat === 'rim') {
        const to = seatTyres(model, await partModel(t.part, inst.part), def.rim!, partDef(t.part).tire!.sidewall, !!t.flat);
        const wrap = new THREE.Group();
        wrap.add(to);
        wrap.rotation.x = Math.PI / 2;
        wrap.position.y = (def.rim?.width ?? 0.15) / 2;
        g.add(wrap);
      }
      return g;
    }
    if (h.kind === 'tool') {
      const m = await toolGlb(toolModelId(h.tool));
      g.add(m ? cloneModel(m) : toolModel(h.tool));
      return g;
    }
    const m = await itemGlb(itemDef(h.item.item).model);
    g.add(m ? cloneModel(m) : itemStandIn(h.item));
    return g;
  }

  /** a tool's look changed (a spray can's colour) */
  repaintTool(l: Loose): void {
    if (!l.tool) return;
    this.mats.set(ownerOf(l), toolLook(l.tool));
    this.unmerge();
  }

  /** light up the thing the mark is on (null = none) */
  highlight(l: Loose | null): void {
    const id = l ? (this.mergeIds.get(l.uid) ?? -1) : -1;
    if (id !== this.litId) {
      this.mergedLook?.setHighlight(id > 0 ? id : null);
      this.litId = id;
    }
    let own = !!l && id < 0;
    for (const m of this.matteMerges.values()) {
      const mid = l ? (m.ids.get(l.uid) ?? -1) : -1;
      if (mid > 0) own = false;
      if (mid !== m.lit) {
        m.look.setHighlight(mid > 0 ? mid : null);
        m.lit = mid;
      }
    }
    this.mats.highlight(l && own ? ownerOf(l) : '');
  }

  private unmerge(): void {
    this.mergeDirty = true;
    for (const m of this.matteMerges.values()) {
      if (m.lit > 0) m.look.setHighlight(null);
      m.merged.dispose();
    }
    this.matteMerges.clear();
    if (!this.merged) return;
    this.merged.dispose();
    this.merged = null;
    this.mergeIds.clear();
    this.mergedAs.clear();
    if (this.litId > 0) this.mergedLook?.setHighlight(null);
    this.litId = -1;
  }

  /** merge what lies still, once every model is in and nothing is falling */
  private tryMerge(): void {
    if (!this.mergeDirty || this.loads.size || this.list.some((l) => !l.resting)) return;
    this.mergeDirty = false;
    if (this.merged || this.matteMerges.size) this.unmerge();
    this.mergeDirty = false;
    type Entry = { id: number; uid: string; object: THREE.Object3D; look: { paint: number; paint2: number; dirt?: number; rust?: number; wear?: number } };
    const entries: Entry[] = [];
    const matte = new Map<number, Entry[]>();
    for (const l of this.list) {
      // (what rides on a vehicle moves with it: not merged; what is being cleaned has its mask)
      if (l.riding || this.grimeHeld.has(l.uid) || this.paintHeld.has(l.uid)) continue;
      const look: LookOf = l.part ? partLook(l.part) : l.item ? itemPaint(l.item) : toolLook(l.tool!);
      // (a gloss of its own: with the others of that gloss)
      if (look.matte !== undefined) {
        let lot = matte.get(look.matte);
        if (!lot) matte.set(look.matte, (lot = []));
        lot.push({ id: lot.length + 1, uid: l.uid, object: l.obj, look });
        continue;
      }
      const id = entries.length + 1;
      this.mergeIds.set(l.uid, id);
      this.mergedAs.set(id, { dirt: look.dirt ?? 0, rust: look.rust ?? 0, paint: look.paint });
      entries.push({ id, uid: l.uid, object: l.obj, look });
    }
    if (!entries.length && !matte.size) return;
    this.root.updateMatrixWorld(true);
    const moves = (o: THREE.Object3D): boolean => MOVES.test(o.name) || !!o.userData.mover;
    if (entries.length) {
      const merged = new MergedCar(this.root, entries, moves);
      this.root.add(merged.group);
      const look = this.mats.look('merged', { paint: 0x8f3a2c, paint2: 0xd8d4c8 });
      applyMaterials(merged.group, look, true);
      look.setCarFrame(this.root.matrixWorld);
      this.merged = merged;
      this.mergedLook = look;
    }
    for (const [gloss, lot] of matte) {
      const merged = new MergedCar(this.root, lot, moves);
      this.root.add(merged.group);
      const look = this.mats.look(`merged:matte:${gloss}`, { paint: 0x8f3a2c, paint2: 0xd8d4c8, matte: gloss });
      applyMaterials(merged.group, look, true);
      look.setCarFrame(this.root.matrixWorld);
      this.matteMerges.set(gloss, { merged, look, ids: new Map(lot.map((e) => [e.uid, e.id])), lit: -1 });
    }
  }

  private make(part: PartInstance | null, tool: Tool | null, x: number, y: number, z: number, yaw: number, item: ItemInstance | null = null): Loose {
    n++;
    const obj = new THREE.Group();
    obj.name = `loose:${part?.part ?? tool?.kind ?? item?.item}`;
    this.root.add(obj);
    const l: Loose = { uid: `l${n.toString(36)}`, part, tool, item, x, y, z, yaw, vy: 0, resting: false, obj, radius: 0.3, mid: 0.2 };
    this.list.push(l);
    this.rev++;
    return l;
  }

  private measure(l: Loose): void {
    const box = new THREE.Box3();
    l.obj.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(l.obj.matrixWorld).invert();
    box.setFromObject(l.obj);
    box.applyMatrix4(inv);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    l.radius = Math.max(0.12, Math.max(size.x, size.z, size.y) * 0.5);
    l.mid = (box.min.y + box.max.y) / 2;
  }

  remove(l: Loose): void {
    this.unmerge();
    this.rev++;
    const i = this.list.indexOf(l);
    if (i >= 0) this.list.splice(i, 1);
    l.obj.removeFromParent();
    this.mats.drop(ownerOf(l));
    this.mats.drop(`${ownerOf(l)}+tire`);
  }

  /** drop it from where it is: it falls onto the surface below */
  drop(l: Loose): void {
    l.resting = false;
    l.vy = 0;
    l.riding = null;
    l.landing = undefined;
    this.rev++;
    this.unmerge();
  }

  /** where a thing starting to fall at (x, y, z) lands: the floor, or a vehicle under it if that is higher */
  private landingOf(l: Loose): { y: number; on: Carrier | null } {
    let y = this.surfaceAt(l.x, l.z, l.y + 0.05);
    let on: Carrier | null = null;
    for (const c of this.carriers()) {
      const s = c.surfaceAt(l.x, l.z, l.y + 0.05);
      if (s !== null && s > y) {
        y = s;
        on = c;
      }
    }
    return { y, on };
  }

  /** it lies on a carrier from now on, where it is (or at a place in the carrier's frame already known) */
  ride(l: Loose, on: Carrier, at?: { pos: THREE.Vector3; rot: THREE.Quaternion }): void {
    if (at) {
      l.riding = { on, pos: at.pos.clone(), rot: at.rot.clone() };
    } else {
      on.frame.updateMatrixWorld(true);
      const o = this.core.origin;
      const pos = on.frame.worldToLocal(this.va.set(l.x - o.x, l.y - o.y, l.z - o.z)).clone();
      // its turn relative to the carrier's
      const q = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, -l.yaw);
      const rot = on.frame.getWorldQuaternion(this.qa).invert().multiply(q);
      l.riding = { on, pos, rot };
    }
    l.resting = true;
    this.mergeDirty = true;
    this.rev++;
  }

  /** what rides on a carrier */
  ridersOf(on: Carrier): Loose[] {
    return this.list.filter((l) => l.riding?.on === on);
  }

  /**
   * The things riding on vehicles go where their vehicles went this frame (call after the vehicles'
   * views are placed).
   */
  follow(): void {
    const o = this.core.origin;
    // (the floating origin may have moved since update)
    this.core.place(this.root, 0, 0, 0);
    this.root.updateMatrixWorld();
    for (const l of this.list) {
      const r = l.riding;
      if (!r) continue;
      r.on.frame.updateMatrixWorld();
      const p = r.on.frame.localToWorld(this.va.copy(r.pos));
      l.x = p.x + o.x;
      l.y = p.y + o.y;
      l.z = p.z + o.z;
      const q = r.on.frame.getWorldQuaternion(this.qa).multiply(r.rot);
      l.obj.position.set(l.x, l.y, l.z);
      l.obj.quaternion.copy(q);
      // (its heading, for whoever puts it down again)
      const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
      l.yaw = -e.y;
      l.obj.updateMatrixWorld();
      this.mats.setFrameOf(ownerOf(l), l.obj.matrixWorld);
    }
  }

  update(dt: number): void {
    // the root sits at the world's origin, the things at their world positions under it
    this.core.place(this.root, 0, 0, 0);
    for (const l of this.list) {
      if (!l.resting) {
        l.landing ??= this.landingOf(l);
        const floor = l.landing.y;
        l.vy -= 9.81 * dt;
        l.y += l.vy * dt;
        if (l.y <= floor) {
          l.y = floor;
          l.vy = 0;
          l.resting = true;
          this.mergeDirty = true;
          if (l.landing.on) this.ride(l, l.landing.on);
          l.landing = undefined;
        }
      }
      if (!l.riding) {
        l.obj.position.set(l.x, l.y, l.z);
        l.obj.rotation.set(0, -l.yaw, 0);
      }
      // a part's wear follows it (the sponge works on things lying about too); its dirt rises from its base
      if (l.part) {
        const look = partLook(l.part);
        this.mats.set(ownerOf(l), look);
        const id = this.mergeIds.get(l.uid);
        const was = id !== undefined ? this.mergedAs.get(id) : undefined;
        if (this.merged && id !== undefined && was && (Math.abs(was.dirt - (look.dirt ?? 0)) > 0.02 || Math.abs(was.rust - (look.rust ?? 0)) > 0.02 || was.paint !== look.paint)) {
          this.merged.updatePart(id, { paint: look.paint, dirt: look.dirt, rust: look.rust, crust: look.crust });
          this.mergedAs.set(id, { dirt: look.dirt ?? 0, rust: look.rust ?? 0, paint: look.paint });
        }
      }
      if (!l.riding) {
        l.obj.updateMatrixWorld();
        this.mats.setFrameOf(ownerOf(l), l.obj.matrixWorld);
      }
    }
    // one thing a frame: an item that goes off, or holds things that may, has it (have they) turned into what
    // their kinds become? (and one that whoever looked at it last has settled already is drawn as what it is now)
    if (this.list.length) {
      this.settleAt = (this.settleAt + 1) % this.list.length;
      const l = this.list[this.settleAt];
      const it = l.item;
      if (it) {
        if (it.fresh !== undefined || it.inside !== undefined) this.settle(l, itemNow());
        if (l.madeAs !== undefined && l.madeAs !== it.item) this.redress(l);
      }
    }
    this.tryMerge();
    if (this.mergedLook || this.matteMerges.size) {
      this.root.updateMatrixWorld();
      this.mergedLook?.setCarFrame(this.root.matrixWorld);
      for (const m of this.matteMerges.values()) m.look.setCarFrame(this.root.matrixWorld);
    }
  }

  // ------------------------------------------------------------------ grime (grime.ts)

  /** what of a part lying about can be cleaned: the part's meshes with MASK UVs, and its tyre's */
  grimeParts(l: Loose): LooseGrime[] {
    if (!l.part) return [];
    const out: LooseGrime[] = [];
    const own = this.mats.lookOf(ownerOf(l));
    const tire = this.mats.lookOf(`${ownerOf(l)}+tire`);
    const mine: THREE.Mesh[] = [];
    const tires: THREE.Mesh[] = [];
    let size = 0;
    let tsize = 0;
    l.obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.geometry.hasAttribute('aMaskUv') || !m.userData.mask_px) return;
      const mat = Array.isArray(m.material) ? m.material[0] : m.material;
      if (tire && tire.materials.includes(mat as never)) {
        tires.push(m);
        tsize = Math.max(tsize, m.userData.mask_px as number);
      } else if (own && own.materials.includes(mat as never)) {
        mine.push(m);
        size = Math.max(size, m.userData.mask_px as number);
      }
    });
    const name = partDef(l.part.part).name.zh;
    if (mine.length) out.push({ loose: l, owner: ownerOf(l), inst: l.part, meshes: mine, size, label: name });
    const t = l.part.sub.tire;
    if (t && tires.length) out.push({ loose: l, owner: `${ownerOf(l)}+tire`, inst: t, meshes: tires, size: tsize, label: partDef(t.part).name.zh });
    return out;
  }

  /** the point of a part lying about that can be cleaned a ray (render space) meets first, within far */
  grimeCast(origin: THREE.Vector3, dir: THREE.Vector3, far: number): { part: LooseGrime; point: THREE.Vector3; normal: THREE.Vector3; dist: number; glass: boolean } | null {
    let best: { part: LooseGrime; point: THREE.Vector3; normal: THREE.Vector3; dist: number; glass: boolean } | null = null;
    const o = this.core.origin;
    this.ray.origin.copy(origin);
    this.ray.direction.copy(dir);
    for (const l of this.list) {
      if (!l.part) continue;
      // (the sphere round it first: render space)
      this.sphere.center.set(l.x - o.x, l.y + l.mid - o.y, l.z - o.z);
      this.sphere.radius = l.radius * 1.3 + 0.05;
      if (!this.ray.intersectsSphere(this.sphere)) continue;
      for (const part of this.grimeParts(l)) {
        for (const mesh of part.meshes) {
          const h = castMesh(mesh, origin, dir, best ? best.dist : far);
          if (!h || (best && h.dist >= best.dist)) continue;
          best = { part, point: h.point, normal: h.normal, dist: h.dist, glass: matNames(mesh).some((n) => glassName(n)) };
        }
      }
    }
    return best;
  }

  /** a thing is being painted (a spray can on it) or not: the merge goes without it, or with it */
  setPaintHeld(uid: string, on: boolean): void {
    if (this.paintHeld.has(uid) === on) return;
    if (on) this.paintHeld.add(uid);
    else this.paintHeld.delete(uid);
    this.unmerge();
  }

  /** a thing is being cleaned (its mask on) or not: the merge goes without it, or with it */
  setGrimeHeld(uid: string, on: boolean): void {
    if (this.grimeHeld.has(uid) === on) return;
    if (on) this.grimeHeld.add(uid);
    else this.grimeHeld.delete(uid);
    this.unmerge();
  }

  /** a part's look as it is now (the masks bind to it) */
  lookOfOwner(owner: string): CarLook | undefined {
    return this.mats.lookOf(owner);
  }

  /** the nearest thing the ray from eye along dir passes through, within maxDist (world coordinates) */
  pick(eye: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, maxDist: number, filter?: (l: Loose) => boolean): { loose: Loose; dist: number } | null {
    let best: Loose | null = null;
    let bd = maxDist;
    this.ray.origin.set(eye.x, eye.y, eye.z);
    this.ray.direction.set(dir.x, dir.y, dir.z).normalize();
    for (const l of this.list) {
      // (one a system works as a device: its device is what the mark finds; one shut in a container: not reached)
      if (l.device || l.shut || (filter && !filter(l))) continue;
      this.sphere.center.set(l.x, l.y + l.mid, l.z);
      this.sphere.radius = l.radius * 0.85;
      const p = this.ray.intersectSphere(this.sphere, this.hit);
      if (!p) continue;
      const d = p.distanceTo(this.ray.origin);
      if (d < bd) {
        bd = d;
        best = l;
      }
    }
    return best ? { loose: best, dist: bd } : null;
  }
}
