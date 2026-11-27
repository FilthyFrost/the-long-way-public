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
import { itemDef, itemModelOf, itemPaint, settleItem, stampFresh, type ItemInstance } from '../../core/modcar/items';
import { keepInsideClean, partDef } from '../../core/modcar/parts';
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
import { footprint, rectsOverlap } from '../../core/v3/nd/place';
import type { Solid } from '../../core/world/solids';

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
  /**
   * Come to rest on a surface (docs/V3/plan/finish.md §十九 step 6): the height of what its lowest point lies on (world),
   * its box's lowest point as it was then, and how it came there — 'fell': let fall or thrown, the surface found under
   * it, and moved aside to the nearest place clear of everything where it came down in something's way; 'laid': laid by
   * a place on the ground, the surface found under it, never moved; 'given': laid on a height it was given (a counter, a
   * shelf of a place's). Its shape changing (its model come in, a system setting it straight) sets it on that surface
   * again. Absent: put where it is, just so, by whoever put it there (it stays exactly there).
   */
  seat?: number;
  seatLow?: number;
  seatHow?: 'fell' | 'laid' | 'given';
  /** the thing it lies on (a chest's lid, a table's top): taken away or let fall, this one comes down too */
  under?: Loose | null;
  /** seconds since it came to rest, for a little while (whoever drew it falling sets it straight as it lands: its shape is looked at again) */
  fresh?: number;
  /** thrown, flying (docs/V3/plan/finish.md §十九 step 6, Nomad Drive's throw): its velocity, its turn, how long it has flown and been still, the height it flew from */
  fly?: { vx: number; vy: number; vz: number; spin: number; t: number; still: number; fromY: number } | null;
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
  /** its body as one of the world's solids (a vehicle's: core/onfoot/vehicle.ts VehicleSolid) — what rides in it is inside it, not in its way */
  readonly solid?: { readonly solid: Solid };
  /** tag prefix of composite walkable solids owned by this carrier (VehicleWalkSolids.prefix) */
  readonly solidTag?: string;
}

/** what a thing comes down onto: the height of that surface (world), the vehicle it rides with there, the thing lying about it lies on */
export interface Support {
  y: number;
  on: Carrier | null;
  under: Loose | null;
}

/**
 * How far over what it lies on a thing comes to rest (m): Nomad Drive puts a thing dropped 1 mm over the surface its ray
 * meets (its drop settings' surface offset as the game has it, 0.001; the code's own default, 5 cm, is not what it uses).
 */
export const REST_GAP = 0.001;
/** a thing's box shrunk to this to be tested against what it would be in the way of (Nomad Drive's drop: 85 %) */
export const DROP_SHRINK = 0.85;
/** what is said when a thing may not be let go where it would come down (Nomad Drive's words) */
export const DROP_BLOCKED = '位置被挡住，无法在此丢弃';
/**
 * Nomad Drive's throw: a thing flying comes to rest once it is slower than 0.12 m/s and turns slower than 0.35 rad/s for
 * 0.35 s; flying longer than 8 s, or fallen 150 m below where it flew from (through the world), it is put on the surface
 * below it (above it) 2 cm over it; it turns 4 rad/s as it leaves the hand.
 */
export const THROW = { still: 0.12, stillSpin: 0.35, stillS: 0.35, maxS: 8, fallM: 150, gap: 0.02, spin: 4 } as const;
/** how long after it comes to rest a thing's shape is looked at again (s) */
const FRESH_S = 0.6;
/** a thing whose model is not in yet: a point */
const POINT: ThingBox = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
const DOWN = new THREE.Vector3(0, -1, 0);

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
  keepInsideClean(inst);
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

/** a place on a board of a piece of furniture for a thing held out: where its origin goes (world), what the piece rides, how far along the line of sight the board's space begins */
export interface BoardAim {
  ok: boolean;
  why: string;
  x: number;
  y: number;
  z: number;
  on: object | null;
  dist: number;
  /**
   * A board of a container's (v3/nd-store): the thing goes into what the container holds, at this place, and is no
   * thing lying about — how many of it did NOT go in (the rest stays in the hands), −1 none (it has said why).
   * Absent: it stands there as a thing lying about.
   */
  put?(thing: { kind: 'part'; inst: PartInstance } | { kind: 'tool'; tool: Tool } | { kind: 'item'; item: ItemInstance }): number;
}

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
  /** the things a system animates (keepApart): drawn on their own */
  private readonly apart = new Set<string>();
  private readonly sphere = new THREE.Sphere();
  private readonly ray = new THREE.Ray();
  private readonly hit = new THREE.Vector3();

  /** the vehicles things can be put on (the game fills this in) */
  carriers: () => readonly Carrier[] = () => [];
  /** the world's solids near (x, z) within r — walls, props, the vehicles' bodies: what a thing put down may be in the way of (the game fills this in) */
  solidsNear: ((x: number, z: number, r: number, out: Solid[]) => void) | null = null;
  private readonly near: Solid[] = [];
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
    /** the looks of the things lying about: a system that draws more on one of them (what is in a pan) paints it as they are painted */
    readonly mats: CarMaterials,
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
    void this.track(itemGlb(itemModelOf(item))).then((m) => {
      // (gone, or dressed again as another kind since: this model is not wanted any more)
      if (!m || !this.list.includes(l) || obj.parent !== l.obj) return;
      const real = cloneModel(m);
      applyMaterials(real, look);
      // (a model with a look of its own, made by a system — a fish — lies by itself, never merged)
      let own = false;
      real.traverse((o) => {
        if (o.userData.ownLook) own = true;
      });
      l.obj.userData.ownLook = own;
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
    const m = await itemGlb(itemModelOf(h.item));
    g.add(m ? cloneModel(m) : itemStandIn(h.item));
    return g;
  }

  /**
   * An item's model in its colours, to be shown somewhere — on a board of an open fridge: not a thing of the world
   * (nothing lies, is marked, weighed or saved by it). A stand-in at once, its own model when that is in; its box in
   * its own frame in userData.box (and `fitted` called whenever that changes). `owner`: its look's name, dropped
   * with dropShown.
   */
  shownItem(item: ItemInstance, owner: string, fitted: (g: THREE.Group) => void): THREE.Group {
    const g = new THREE.Group();
    const look = this.mats.look(owner, itemPaint(item));
    const obj = itemStandIn(item);
    applyMaterials(obj, look);
    g.add(obj);
    g.userData.box = new THREE.Box3().setFromObject(obj);
    fitted(g);
    void this.track(itemGlb(itemModelOf(item))).then((m) => {
      if (!m || obj.parent !== g) return;
      const real = cloneModel(m);
      applyMaterials(real, look);
      (g.userData.box as THREE.Box3).setFromObject(real);
      obj.removeFromParent();
      g.add(real);
      fitted(g);
    });
    return g;
  }

  /** a shown thing's look let go, and where a shown thing is drawn told to its look */
  dropShown(owner: string): void {
    this.mats.drop(owner);
  }

  placeShown(owner: string, g: THREE.Object3D): void {
    this.mats.setFrameOf(owner, g.matrixWorld);
  }

  /**
   * Where a thing held out would stand on a board of a piece of furniture the line of sight goes into (render space;
   * `box` the thing's own, `yaw` its heading; null: the line goes into none) — the home's to say (v3/nd-home
   * boardAim), the careful placing's to ask (v3/nd-place).
   */
  boards: ((eye: THREE.Vector3, dir: THREE.Vector3, box: ThingBox, yaw: number, grid: boolean, reach: number) => BoardAim | null) | null = null;

  /**
   * The piece of furniture a thing lying about stands in or hangs on, by name (null: none) — the home's to say
   * (v3/nd-home): the list of what a vehicle carries names it (docs/V3/plan/finish.md §十一 2).
   */
  keeper: ((l: Loose) => string | null) | null = null;

  /** a tool's look changed (a spray can's colour) */
  repaintTool(l: Loose): void {
    if (!l.tool) return;
    this.mats.set(ownerOf(l), toolLook(l.tool));
    this.unmerge();
  }

  private readonly outlineBuf: { root: THREE.Object3D; partId: number; extra: THREE.Object3D | null } = { root: this.root, partId: -1, extra: null };

  /** silhouette outline target for a loose item or specific device subtree (render/frame.ts; zero per-frame alloc) */
  outlineTarget(l: Loose | null, sub: THREE.Object3D | null = null): { root: THREE.Object3D; partId: number; extra: THREE.Object3D | null } | null {
    if (sub) {
      this.outlineBuf.root = sub;
      this.outlineBuf.partId = -1;
      this.outlineBuf.extra = null;
      return this.outlineBuf;
    }
    if (!l) return null;
    const id = this.mergeIds.get(l.uid) ?? -1;
    if (id > 0 && this.merged) {
      this.outlineBuf.root = this.merged.group;
      this.outlineBuf.partId = id;
      this.outlineBuf.extra = null;
      return this.outlineBuf;
    }
    for (const m of this.matteMerges.values()) {
      const mid = m.ids.get(l.uid) ?? -1;
      if (mid > 0) {
        this.outlineBuf.root = m.merged.group;
        this.outlineBuf.partId = mid;
        this.outlineBuf.extra = null;
        return this.outlineBuf;
      }
    }
    this.outlineBuf.root = l.obj;
    this.outlineBuf.partId = -1;
    this.outlineBuf.extra = null;
    return this.outlineBuf;
  }

  /** light up the thing the mark is on (null = none); or a look of a system's own (`owner`: a thing drawn in an open container, v3/nd-store) */
  highlight(l: Loose | null, owner = ''): void {
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
    this.mats.highlight(l && own ? ownerOf(l) : owner);
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
      if (l.riding || this.grimeHeld.has(l.uid) || this.paintHeld.has(l.uid) || this.apart.has(l.uid)) continue;
      // (a thing with a look of its own — a fish — is drawn by itself)
      if (l.obj.userData.ownLook) continue;
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
    // (its model came in: its box for the hand and for lying on things measured anew — the model took the stand-in's place, as many children as before)
    this.hitBoxes.delete(l.obj);
    const box = new THREE.Box3();
    l.obj.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(l.obj.matrixWorld).invert();
    box.setFromObject(l.obj);
    box.applyMatrix4(inv);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    l.radius = Math.max(0.12, Math.max(size.x, size.z, size.y) * 0.5);
    l.mid = (box.min.y + box.max.y) / 2;
    // (its model come in: lying on something, it lies on it as this shape)
    this.reshaped(l);
  }

  remove(l: Loose): void {
    this.unmerge();
    this.rev++;
    // (what lay on it comes down onto what is under it)
    this.dropAbove(l);
    const i = this.list.indexOf(l);
    if (i >= 0) this.list.splice(i, 1);
    l.obj.removeFromParent();
    this.mats.drop(ownerOf(l));
    this.mats.drop(`${ownerOf(l)}+tire`);
  }

  /** drop it from where it is: it falls onto the surface below (what lay on it comes down too) */
  drop(l: Loose): void {
    this.dropAbove(l);
    l.resting = false;
    l.vy = 0;
    l.riding = null;
    l.landing = undefined;
    l.fly = null;
    this.unseat(l);
    this.rev++;
    this.unmerge();
  }

  /**
   * Throw it from where it is (Nomad Drive's throw, the only time a thing flies): it flies with this velocity (m/s, world)
   * turning `spin` rad/s, bounces off walls and things, comes down, slides and stops — slower than 0.12 m/s for 0.35 s —
   * and lies there as a thing let fall does; 8 s in the air, or 150 m below, it is put on the surface there.
   */
  fling(l: Loose, v: { x: number; y: number; z: number }, spin: number = THROW.spin): void {
    this.drop(l);
    l.fly = { vx: v.x, vy: v.y, vz: v.z, spin, t: 0, still: 0, fromY: l.y };
  }

  /** how far a thing's lowest point is above its origin (m; below it: less than 0), as its model stands */
  bottomOf(l: Loose): number {
    this.hitBoxOf(l);
    return this.hitBoxes.get(l.obj)?.low ?? 0;
  }

  /** a thing's own box as its model stands (its own frame, snug: its meshes' and nothing more); null while it has no model nor stand-in */
  snugBoxOf(l: Loose): ThingBox | null {
    this.hitBoxOf(l);
    const r = this.hitBoxes.get(l.obj)?.raw;
    return r && !r.isEmpty() ? { minX: r.min.x, maxX: r.max.x, minY: r.min.y, maxY: r.max.y, minZ: r.min.z, maxZ: r.max.z } : null;
  }

  /** a thing's base footprint (the lowest 10 cm of its meshes, its own frame): what actually meets a sloped ground so an overhanging tabletop or side handles do not lift it */
  baseBoxOf(l: Loose): ThingBox | null {
    this.hitBoxOf(l);
    const b = this.hitBoxes.get(l.obj)?.base;
    return b && !b.isEmpty() ? { minX: b.min.x, maxX: b.max.x, minY: b.min.y, maxY: b.max.y, minZ: b.min.z, maxZ: b.max.z } : null;
  }

  /** it stays where it is now, at rest (put down just so: nothing to fall) */
  rest(l: Loose): void {
    l.resting = true;
    l.vy = 0;
    l.riding = null;
    l.landing = undefined;
    l.fly = null;
    this.unseat(l);
    this.rev++;
    this.unmerge();
    this.mergeDirty = true;
  }

  /**
   * It lies with its lowest point on this surface (world height) — a place laying what lies about in plain sight on its
   * ground (`ground`: the ground as drawn is found under it, as for a thing let fall — never moved aside) or on a counter,
   * a shelf, a pump of its own (the height kept); set on it again as its model comes in.
   */
  seat(l: Loose, y: number, ground = false): void {
    this.rest(l);
    const box = this.snugBoxOf(l) ?? POINT;
    if (ground) {
      this.settleOn(l, box, this.supportFor(box, l.x, l.z, l.yaw, y + 0.3, l), 'laid');
      return;
    }
    l.seat = y;
    l.seatLow = box.minY;
    l.seatHow = 'given';
    l.y = y + REST_GAP - box.minY;
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
    l.fly = null;
    this.mergeDirty = true;
    this.rev++;
  }

  // ------------------------------------------------------------------ coming to rest (docs/V3/plan/finish.md §十九 step 6)

  /**
   * What a thing with this box (its own frame), its base at (x, ·, z) turned `yaw`, comes down onto from `fromY` (world:
   * its lowest point as it starts): the ground as drawn and the floors under its middle and its four corners — the highest
   * of them, so that no corner sinks — a vehicle's surface under its middle, or the top of a thing lying about straight
   * under its middle (a chest's lid, a table's top, a chair's seat: as Nomad Drive puts a thing on the surface its ray
   * meets). `self`: the thing itself, not under itself.
   */
  supportFor(box: ThingBox, x: number, z: number, yaw: number, fromY: number, self: Loose | null = null): Support {
    const foot = (self ? this.baseBoxOf(self) : null) ?? box;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const cx = (foot.minX + foot.maxX) / 2;
    const cz = (foot.minZ + foot.maxZ) / 2;
    const mx = x + cx * c - cz * s;
    const mz = z + cx * s + cz * c;
    // (its base plan, a point every 30 cm or so, its edges and corners among them: the drawn ground is straight between
    // its points 2-8 m apart, with a crease along every triangle's edge — a table straddling one stood a leg 2 cm into it)
    const pts = this.footPoints(foot, x, z, c, s);
    let y = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      const g = this.surfaceAt(pts[i], pts[i + 1], fromY);
      if (g > y) y = g;
    }
    let on: Carrier | null = null;
    for (const cr of this.carriers()) {
      const v = cr.surfaceAt(mx, mz, fromY);
      if (v !== null && v > y) {
        y = v;
        on = cr;
      }
    }
    // a thing lying about straight under its middle: it lies on its top there, or on what of it (or of what else lies
    // there) stands a little higher under the rest of it — a chest's iron bands — but not on what rises well over it
    // there, a chair's back over its seat
    // — and only if it is under most of it (a chest's clasp under the middle of a seed packet held to its side is no
    // place to put it: it comes down beside the chest, in its way)
    let under: Loose | null = null;
    const t = this.topUnder(mx, mz, fromY, self);
    if (t && t.y > y) {
      const most = t.y + 0.08;
      let top = t.y;
      let hits = 0;
      const n = pts.length / 2 - 1;
      for (let i = 2; i < pts.length; i += 2) {
        const u = this.topUnder(pts[i], pts[i + 1], Math.min(fromY, most), self);
        if (!u || u.y < t.y - 0.15) continue;
        hits++;
        if (u.y > top) top = u.y;
      }
      if (hits * 2 >= n) {
        y = top;
        under = t.l;
        on = t.l.riding?.on ?? null;
      }
    }
    return { y, on, under };
  }

  private readonly feet: number[] = [];
  /** points over a thing's plan at its base (x, z) turned (c, s): its middle first, then a grid over it out to its edges and corners, 30 cm apart or closer (at most 6 a side) */
  private footPoints(box: ThingBox, x: number, z: number, c: number, s: number): number[] {
    const out = this.feet;
    out.length = 0;
    const cx = (box.minX + box.maxX) / 2;
    const cz = (box.minZ + box.maxZ) / 2;
    out.push(x + cx * c - cz * s, z + cx * s + cz * c);
    const w = box.maxX - box.minX;
    const d = box.maxZ - box.minZ;
    if (w <= 0 && d <= 0) return out;
    const nu = Math.min(6, Math.max(2, Math.ceil(w / 0.3) + 1));
    const nw = Math.min(6, Math.max(2, Math.ceil(d / 0.3) + 1));
    for (let i = 0; i < nu; i++) {
      const lx = box.minX + (w * i) / (nu - 1);
      for (let j = 0; j < nw; j++) {
        const lz = box.minZ + (d * j) / (nw - 1);
        out.push(x + lx * c - lz * s, z + lx * s + lz * c);
      }
    }
    return out;
  }

  /** the highest top of a thing lying about straight under (x, z) and not above fromY (world): a ray down onto its meshes */
  topUnder(x: number, z: number, fromY: number, self: Loose | null = null): { y: number; l: Loose } | null {
    const o = this.core.origin;
    const best = { y: -Infinity, l: null as Loose | null };
    const from = this.tuFrom.set(x - o.x, fromY + 1e-4 - o.y, z - o.z);
    for (const m of this.list) {
      if (m === self || m.shut || m.fly || !m.resting) continue;
      if (Math.abs(m.x - x) > m.radius * 1.5 + 0.1 || Math.abs(m.z - z) > m.radius * 1.5 + 0.1) continue;
      const b = this.snugBoxOf(m);
      if (!b || m.y + b.minY > fromY || m.y + b.maxY <= best.y) continue;
      // (not what lies on the thing itself: a stack is not turned upside down)
      if (self && this.onTopOf(m, self)) continue;
      m.obj.updateMatrixWorld(true);
      const far = fromY - (m.y + b.minY) + 0.01;
      m.obj.traverse((ob) => {
        const mesh = ob as THREE.Mesh;
        if (!mesh.isMesh) return;
        const h = castMesh(mesh, from, DOWN, far);
        if (!h) return;
        const y = h.point.y + o.y;
        if (y > best.y) {
          best.y = y;
          best.l = m;
        }
      });
    }
    return best.l ? { y: best.y, l: best.l } : null;
  }
  private readonly tuFrom = new THREE.Vector3();

  /** does m lie on `l`, or on what lies on it, and so on */
  private onTopOf(m: Loose, l: Loose): boolean {
    let u = m.under;
    for (let i = 0; u && i < 16; i++, u = u.under) if (u === l) return true;
    return false;
  }

  /**
   * What a thing with this box, its base at (x, y, z) turned `yaw`, would be in the way of: its box shrunk (to 85 %, as
   * Nomad Drive tests a drop) against the boxes of the things lying about and the world's solids — walls, props, a
   * vehicle's body — what it lies on (`under`) and the vehicle it rides (`on`) not counted. A word for what (for the
   * harness), or null: nothing.
   */
  blockerAt(box: ThingBox, x: number, y: number, z: number, yaw: number, self: Loose | null, under: Loose | null, on: Carrier | null, shrink: number = DROP_SHRINK): string | null {
    const kx = ((box.maxX - box.minX) * (1 - shrink)) / 2;
    const ky = ((box.maxY - box.minY) * (1 - shrink)) / 2;
    const kz = ((box.maxZ - box.minZ) * (1 - shrink)) / 2;
    const foot = footprint({ minX: box.minX + kx, maxX: box.maxX - kx, minY: 0, maxY: 0, minZ: box.minZ + kz, maxZ: box.maxZ - kz }, x, z, yaw);
    const y0 = y + box.minY + ky;
    const y1 = y + box.maxY - ky;
    const reach = Math.hypot(foot.hx, foot.hz);
    for (const m of this.list) {
      if (m === self || m === under || m.shut || m.fly) continue;
      if (Math.abs(m.x - foot.x) > m.radius * 1.5 + reach + 0.1 || Math.abs(m.z - foot.z) > m.radius * 1.5 + reach + 0.1) continue;
      const b = this.snugBoxOf(m);
      if (!b || m.y + b.maxY <= y0 || m.y + b.minY >= y1) continue;
      if (rectsOverlap(foot, footprint(b, m.x, m.z, m.yaw))) return `thing:${m.item?.item ?? m.part?.part ?? m.tool?.kind}`;
    }
    if (this.solidsNear) {
      const near = this.near;
      near.length = 0;
      this.solidsNear(foot.x, foot.z, reach + 0.5, near);
      const body = on?.solid?.solid;
      const ownTag = on?.solidTag ?? '';
      for (const b of near) {
        if (b === body || (ownTag && b.tag.startsWith(ownTag)) || b.y1 <= y0 + 0.02 || b.y0 >= y1 - 0.01) continue;
        if (rectsOverlap(foot, b)) return `solid:${b.tag}`;
      }
    }
    return null;
  }

  /**
   * Would a thing with this box, let go with its base at (x, y, z) turned `yaw`, come to rest in the way of something
   * (Nomad Drive refuses the drop then: 位置被挡住，无法在此丢弃)? Where it would lie, if it may.
   */
  dropPose(box: ThingBox, x: number, y: number, z: number, yaw: number): { ok: boolean; why: string; y: number; support: Support } {
    const sup = this.supportFor(box, x, z, yaw, y + box.minY + 0.05);
    if (!Number.isFinite(sup.y)) return { ok: false, why: 'no ground', y, support: sup };
    const at = sup.y + REST_GAP - box.minY;
    const why = this.blockerAt(box, x, at, z, yaw, null, sup.under, sup.on);
    return { ok: !why, why: why ?? '', y: at, support: sup };
  }

  /** the thing lies on this surface from now on (and rides with the vehicle it is on there); what it lies on is changed by it */
  private settleOn(l: Loose, box: ThingBox, sup: Support, how: 'fell' | 'laid' | 'given'): void {
    l.y = sup.y + REST_GAP - box.minY;
    l.vy = 0;
    l.resting = true;
    l.seat = sup.y;
    l.seatLow = box.minY;
    l.seatHow = how;
    l.under = sup.under;
    l.fresh = 0;
    l.fly = null;
    l.landing = undefined;
    this.mergeDirty = true;
    this.rev++;
    // (a place's table something was put on is one's own from then on, as a box something was put into is)
    if (sup.under) this.touch(sup.under);
    if (sup.on) this.ride(l, sup.on);
    else if (l.riding) l.riding = null;
  }

  private unseat(l: Loose): void {
    l.seat = undefined;
    l.seatLow = undefined;
    l.seatHow = undefined;
    l.under = null;
    l.fresh = undefined;
  }

  /** a thing let fall comes down where it is: on the surface under it; in the way of something there, moved to the nearest place within a metre clear of everything */
  private land(l: Loose, box: ThingBox, sup: Support): void {
    let s = sup;
    if (this.blockerAt(box, l.x, s.y + REST_GAP - box.minY, l.z, l.yaw, l, s.under, s.on)) {
      const free = this.freeSpot(l, box, l.x, l.z, l.y + box.minY + 0.05);
      if (free) {
        l.x = free.x;
        l.z = free.z;
        s = free.sup;
      }
    }
    this.settleOn(l, box, s, 'fell');
    this.reseatAbove(l);
  }

  /** the nearest place within a metre of (x, z) where the thing lies in nothing's way (Nomad Drive's placement correction), and what it lies on there */
  private freeSpot(l: Loose, box: ThingBox, x: number, z: number, fromY: number): { x: number; z: number; sup: Support } | null {
    for (let r = 0.1; r <= 1.0001; r += 0.1) {
      const n = Math.max(8, Math.min(24, Math.round((2 * Math.PI * r) / 0.1)));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 2 * Math.PI;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        const sup = this.supportFor(box, px, pz, l.yaw, fromY, l);
        if (!Number.isFinite(sup.y) || this.blockerAt(box, px, sup.y + REST_GAP - box.minY, pz, l.yaw, l, sup.under, sup.on)) continue;
        return { x: px, z: pz, sup };
      }
    }
    return null;
  }

  /** its shape changed (its model come in; set straight by whoever drew it falling): lying on something, it lies on it as this shape, and so does what lies on it */
  private reshaped(l: Loose): void {
    if (!l.resting || l.fly || l.seat === undefined) return;
    const box = this.snugBoxOf(l) ?? POINT;
    if (l.seatLow !== undefined && Math.abs(box.minY - l.seatLow) < 5e-4 && l.seatHow !== 'fell') return;
    this.reseat(l, box);
    if (l.seatHow === 'fell' && this.blockerAt(box, l.x, l.y, l.z, l.yaw, l, l.under ?? null, l.riding?.on ?? null)) this.land(l, box, this.supportFor(box, l.x, l.z, l.yaw, l.y + box.minY + 0.05, l));
    this.reseatAbove(l);
  }

  /** set on its surface again (found again under it — from `fromY` down, by default just over where it lay — unless it was given) */
  private reseat(l: Loose, box: ThingBox, fromY = l.seat! + 0.05): void {
    if (l.seatHow === 'given') {
      l.seatLow = box.minY;
      l.y = l.seat! + REST_GAP - box.minY;
      if (l.riding) this.ride(l, l.riding.on);
      return;
    }
    const sup = this.supportFor(box, l.x, l.z, l.yaw, fromY, l);
    if (!Number.isFinite(sup.y)) return;
    const fresh = l.fresh;
    this.settleOn(l, box, sup, l.seatHow ?? 'fell');
    l.fresh = fresh;
  }

  /** what lies on this thing is set on it again where it lies now */
  private reseatAbove(l: Loose, depth = 0): void {
    if (depth > 8) return;
    const lb = this.snugBoxOf(l);
    for (const m of this.list) {
      if (m === l || m.under !== l || !m.resting || m.fly) continue;
      this.reseat(m, this.snugBoxOf(m) ?? POINT, Math.max(m.seat ?? -Infinity, l.y + (lb ? lb.maxY : 0)) + 0.05);
      this.reseatAbove(m, depth + 1);
    }
  }

  /** what lies on this thing (it lies on it, or is found lying on its top) comes down */
  private dropAbove(l: Loose): void {
    const b = this.snugBoxOf(l);
    for (const m of [...this.list]) {
      if (m === l || !m.resting || m.fly) continue;
      let on = m.under === l;
      if (!on && b && m.under == null && !m.shut && Math.abs(m.x - l.x) < l.radius * 1.5 + 0.1 && Math.abs(m.z - l.z) < l.radius * 1.5 + 0.1) {
        // (put there by whoever put it, just so: lying on its top if its lowest point is on it)
        const mb = this.snugBoxOf(m);
        const low = m.y + (mb ? mb.minY : 0);
        if (low >= l.y + b.minY + 0.005 && low <= l.y + b.maxY + 0.03) {
          const t = this.topUnder(m.x, m.z, low + 0.02, m);
          on = !!t && t.l === l && low - t.y < 0.03;
        }
      }
      if (on) {
        m.under = null;
        this.drop(m);
      }
    }
  }

  /** a thing let fall, a step: down onto the surface under it */
  private fallStep(l: Loose, dt: number): void {
    const box = this.snugBoxOf(l) ?? POINT;
    const sup = this.supportFor(box, l.x, l.z, l.yaw, l.y + box.minY + 0.05, l);
    l.vy -= 9.81 * dt;
    l.y += l.vy * dt;
    if (l.y + box.minY <= sup.y + REST_GAP) this.land(l, box, sup);
  }

  /** a thing thrown, a step: flying, off walls and things, down onto what is under it, sliding, still */
  private flyStep(l: Loose, dt: number): void {
    const f = l.fly!;
    const box = this.snugBoxOf(l) ?? POINT;
    f.t += dt;
    // (Nomad Drive's nets: too long in the air, or fallen through the world — onto the surface below, above)
    if (f.t > THROW.maxS || l.y < f.fromY - THROW.fallM) {
      const through = l.y < f.fromY - THROW.fallM;
      const sup = this.supportFor(box, l.x, l.z, l.yaw, through ? l.y + box.maxY + 60 : l.y + box.minY + 0.05, l);
      if (Number.isFinite(sup.y)) {
        this.land(l, box, sup);
        l.y += THROW.gap - REST_GAP;
        if (l.riding) this.ride(l, l.riding.on);
      } else l.fly = null;
      return;
    }
    const speed = Math.hypot(f.vx, f.vy, f.vz);
    const n = Math.min(10, Math.max(1, Math.ceil((speed * dt) / 0.04)));
    const h = dt / n;
    let touching = false;
    let sup: Support = { y: -Infinity, on: null, under: null };
    for (let k = 0; k < n; k++) {
      f.vy -= 9.81 * h;
      // across: into a wall or a thing, it comes back off it, slower
      const nx = l.x + f.vx * h;
      const nz = l.z + f.vz * h;
      sup = this.supportFor(box, l.x, l.z, l.yaw, l.y + box.minY + 0.02, l);
      if (this.blockerAt(box, nx, l.y + 0.005, nz, l.yaw, l, sup.under, sup.on, 0.95)) {
        f.vx *= -0.3;
        f.vz *= -0.3;
      } else {
        l.x = nx;
        l.z = nz;
      }
      // down: onto what is under it, a bounce if it came down hard; it slides, and its turn dies, on what it lies on
      const ny = l.y + f.vy * h;
      sup = this.supportFor(box, l.x, l.z, l.yaw, l.y + box.minY + 0.02, l);
      if (ny + box.minY <= sup.y + REST_GAP) {
        l.y = sup.y + REST_GAP - box.minY;
        if (f.vy < -1.5) {
          f.vy = -f.vy * 0.25;
          f.vx *= 0.5;
          f.vz *= 0.5;
        } else f.vy = 0;
        const vh = Math.hypot(f.vx, f.vz);
        if (vh > 0) {
          const dv = Math.min(vh, 0.5 * 9.81 * h);
          f.vx -= (f.vx / vh) * dv;
          f.vz -= (f.vz / vh) * dv;
        }
        f.spin *= Math.max(0, 1 - 6 * h);
        touching = true;
      } else l.y = ny;
      l.yaw += f.spin * h;
    }
    if (touching && Math.hypot(f.vx, f.vy, f.vz) <= THROW.still && Math.abs(f.spin) <= THROW.stillSpin) f.still += dt;
    else f.still = 0;
    if (f.still >= THROW.stillS) this.land(l, box, sup);
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
      // thrown, flying; let fall, falling (onto the surface under it, as drawn: docs/V3/plan/finish.md §十九 step 6)
      if (l.fly) this.flyStep(l, dt);
      else if (!l.resting) this.fallStep(l, dt);
      else if (l.fresh !== undefined) {
        // (just come to rest: whoever drew it falling may set it straight now — its shape looked at again)
        l.fresh += dt;
        const was = this.snugBoxOf(l);
        this.hitBoxes.delete(l.obj);
        const box = this.snugBoxOf(l);
        if (box && was && (Math.abs(box.minY - was.minY) > 1e-3 || Math.abs(box.maxX - was.maxX) > 1e-3 || Math.abs(box.minX - was.minX) > 1e-3 || Math.abs(box.maxZ - was.maxZ) > 1e-3 || Math.abs(box.minZ - was.minZ) > 1e-3)) this.reshaped(l);
        if (l.fresh !== undefined && l.fresh > FRESH_S) l.fresh = undefined;
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

  /**
   * A system animates something of the thing's own model (docs/ND/PLAN.md: a coffee machine's lid, a fridge's door, a camera's print):
   * it is drawn on its own, never merged, while kept apart.
   */
  keepApart(uid: string, on: boolean): void {
    if (this.apart.has(uid) === on) return;
    if (on) this.apart.add(uid);
    else this.apart.delete(uid);
    this.unmerge();
  }

  /** a thing is being cleaned (its mask on) or not: the merge goes without it, or with it */
  setGrimeHeld(uid: string, on: boolean): void {
    if (this.grimeHeld.has(uid) === on) return;
    if (on) this.grimeHeld.add(uid);
    else this.grimeHeld.delete(uid);
    this.unmerge();
  }

  /** the thing whose dirt is lit now (looked at with a cleaning tool: docs/V3/plan/hands.md §五) */
  private shownHere = '';
  setShowHere(uid: string | null): void {
    const u = uid ?? '';
    if (u === this.shownHere) return;
    for (const l of this.list) {
      if (l.uid !== u && l.uid !== this.shownHere) continue;
      const own = ownerOf(l);
      this.mats.lookOf(own)?.setShowHere(l.uid === u);
      this.mats.lookOf(`${own}+tire`)?.setShowHere(l.uid === u);
    }
    this.shownHere = u;
  }

  /** a part's look as it is now (the masks bind to it) */
  lookOfOwner(owner: string): CarLook | undefined {
    return this.mats.lookOf(owner);
  }

  /** each thing's box as its model stands, in its own frame, and how many children it had when measured (a model come in: again) */
  private readonly hitBoxes = new WeakMap<THREE.Object3D, { box: THREE.Box3; n: number; low: number; raw: THREE.Box3; base: THREE.Box3 }>();
  private readonly hbInv = new THREE.Matrix4();
  private readonly hbRel = new THREE.Matrix4();
  private readonly hbBox = new THREE.Box3();
  private readonly hbRay = new THREE.Ray();
  private readonly hbP = new THREE.Vector3();
  private readonly hbA = new THREE.Vector3();
  private readonly hbB = new THREE.Vector3();
  private readonly hbC = new THREE.Vector3();
  private readonly hbSize = new THREE.Vector3();
  private readonly hbO = new THREE.Vector3();

  /** a thing's box for the hand's ray (its own frame): its model's, 1.5 cm larger all round, never under 8 cm a side; null: its model is not in yet */
  hitBoxOf(l: Loose): THREE.Box3 | null {
    const was = this.hitBoxes.get(l.obj);
    if (was && was.n === l.obj.children.length) return was.box.isEmpty() ? null : was.box;
    const box = new THREE.Box3();
    l.obj.updateMatrixWorld(true);
    this.hbInv.copy(l.obj.matrixWorld).invert();
    l.obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || o === l.obj) return;
      this.hbRel.multiplyMatrices(this.hbInv, mesh.matrixWorld);
      // (its points, not its geometry's box turned: a chest's lid, modelled turned, made its box 15 cm taller than the chest)
      const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
      if (pos && pos.count <= 40000) {
        for (let i = 0; i < pos.count; i++) box.expandByPoint(this.hbP.fromBufferAttribute(pos, i).applyMatrix4(this.hbRel));
        return;
      }
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      box.union(this.hbBox.copy(mesh.geometry.boundingBox!).applyMatrix4(this.hbRel));
    });
    const low = box.isEmpty() ? 0 : box.min.y;
    const raw = box.clone();
    // (its base footprint: the slab within 10 cm of its lowest point, clipping triangle edges crossing that plane —
    // so an overhanging tabletop or side handles do not lift a table's legs or a chest's bottom off a sloped verge)
    const base = new THREE.Box3();
    if (!raw.isEmpty() && raw.max.y - raw.min.y > 0.1) {
      const cut = low + 0.1;
      const edge = (p: THREE.Vector3, q: THREE.Vector3): void => {
        if ((p.y <= cut) === (q.y <= cut)) return;
        const t = (cut - p.y) / (q.y - p.y);
        this.hbP.set(p.x + (q.x - p.x) * t, cut, p.z + (q.z - p.z) * t);
        base.expandByPoint(this.hbP);
      };
      l.obj.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || o === l.obj) return;
        const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
        if (!pos || pos.count > 40000) return;
        this.hbRel.multiplyMatrices(this.hbInv, mesh.matrixWorld);
        const idx = mesh.geometry.getIndex();
        const n = idx ? idx.count : pos.count;
        for (let t = 0; t + 2 < n; t += 3) {
          const i0 = idx ? idx.getX(t) : t;
          const i1 = idx ? idx.getX(t + 1) : t + 1;
          const i2 = idx ? idx.getX(t + 2) : t + 2;
          this.hbA.fromBufferAttribute(pos, i0).applyMatrix4(this.hbRel);
          this.hbB.fromBufferAttribute(pos, i1).applyMatrix4(this.hbRel);
          this.hbC.fromBufferAttribute(pos, i2).applyMatrix4(this.hbRel);
          if (this.hbA.y > cut && this.hbB.y > cut && this.hbC.y > cut) continue;
          if (this.hbA.y <= cut) base.expandByPoint(this.hbA);
          if (this.hbB.y <= cut) base.expandByPoint(this.hbB);
          if (this.hbC.y <= cut) base.expandByPoint(this.hbC);
          edge(this.hbA, this.hbB);
          edge(this.hbB, this.hbC);
          edge(this.hbC, this.hbA);
        }
      });
    }
    if (base.isEmpty()) base.copy(raw);
    if (!box.isEmpty()) {
      box.expandByScalar(0.015);
      const c = box.getCenter(new THREE.Vector3());
      const s = box.getSize(new THREE.Vector3()).max(new THREE.Vector3(0.08, 0.08, 0.08)).multiplyScalar(0.5);
      box.min.copy(c).sub(s);
      box.max.copy(c).add(s);
    }
    this.hitBoxes.set(l.obj, { box, n: l.obj.children.length, low, raw, base });
    return box.isEmpty() ? null : box;
  }

  /**
   * The nearest thing the ray from eye along dir passes through, within maxDist (world coordinates): on its own
   * box as it lies (hitBoxOf; its sphere while its model is not in)
   */
  pick(eye: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, maxDist: number, filter?: (l: Loose) => boolean): { loose: Loose; dist: number } | null {
    let best: Loose | null = null;
    let bd = maxDist;
    this.ray.origin.set(eye.x, eye.y, eye.z);
    this.ray.direction.set(dir.x, dir.y, dir.z).normalize();
    const o = this.core.origin;
    for (const l of this.list) {
      // (one a system works as a device: its device is what the mark finds; one shut in a container: not reached)
      if (l.device || l.shut || (filter && !filter(l))) continue;
      // (the sphere round it first, a little larger than it)
      this.sphere.center.set(l.x, l.y + l.mid, l.z);
      this.sphere.radius = l.radius * 1.3 + 0.08;
      if (!this.ray.intersectsSphere(this.sphere)) continue;
      const box = this.hitBoxOf(l);
      let d: number;
      if (box) {
        // the ray into its own frame (render space: the things hang at their world positions under a root at the origin)
        this.hbInv.copy(l.obj.matrixWorld).invert();
        this.hbRay.origin.set(eye.x - o.x, eye.y - o.y, eye.z - o.z).applyMatrix4(this.hbInv);
        this.hbRay.direction.copy(this.ray.direction).transformDirection(this.hbInv);
        const p = this.hbRay.intersectBox(box, this.hbP);
        if (!p) continue;
        p.applyMatrix4(l.obj.matrixWorld);
        d = Math.hypot(p.x + o.x - eye.x, p.y + o.y - eye.y, p.z + o.z - eye.z);
        // (a big thing: its own meshes — its box would stick out through what it lies behind)
        const sz = box.getSize(this.hbSize);
        if (Math.max(sz.x, sz.y, sz.z) > 0.35) {
          const ro = this.hbO.set(eye.x - o.x, eye.y - o.y, eye.z - o.z);
          let md = Infinity;
          l.obj.traverse((ob) => {
            const mesh = ob as THREE.Mesh;
            if (!mesh.isMesh) return;
            const h = castMesh(mesh, ro, this.ray.direction, Math.min(bd, md));
            if (h && h.dist < md) md = h.dist;
          });
          if (!Number.isFinite(md)) continue;
          d = md;
        }
      } else {
        this.sphere.radius = l.radius * 0.85;
        const p = this.ray.intersectSphere(this.sphere, this.hit);
        if (!p) continue;
        d = p.distanceTo(this.ray.origin);
      }
      if (d < bd) {
        bd = d;
        best = l;
      }
    }
    return best ? { loose: best, dist: bd } : null;
  }
}
