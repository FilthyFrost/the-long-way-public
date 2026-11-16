/**
 * Things lying about (docs/MODCAR.md §5): parts taken off a vehicle or waiting on a shelf, and the
 * tools — a jerrycan, a bottle of water, an oil can, spray cans, a sponge. Put down, they drop onto
 * whatever surface is under them (the floor, a shelf, a bench) and stay there. Put down over a vehicle
 * (into a pickup's bed, onto a seat, a roof, a bonnet) they land on it and ride with it, tied down,
 * wherever it goes: the spare jerrycan on the road.
 */
import * as THREE from 'three';
import { partDef } from '../../core/modcar/parts';
import { paintHex } from '../../core/modcar/palette';
import type { Tool } from '../../core/modcar/tools';
import type { PartInstance } from '../../core/modcar/types';
import type { RenderCore } from '../render/core';
import type { CarLook } from '../render/carMaterials';
import { MergedCar } from '../render/carMerge';
import { cloneModel, panelPaint, partModel, seatTyres, toolGlb } from './assets';
import { applyMaterials, type CarMaterials, type LookOf } from './materials';

export interface Loose {
  uid: string;
  part: PartInstance | null;
  tool: Tool | null;
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
  /** where it will land as it falls: found once when it starts, the floor or a vehicle's surface */
  landing?: { y: number; on: Carrier | null };
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

function toolPaint(t: Tool): number {
  if (t.kind === 'jerrycan') return t.fuel === 'diesel' ? 0x2f6a3a : 0xb8302a;
  if (t.kind === 'oilcan') return 0xd8a531;
  if (t.kind === 'spray') return paintHex(t.colour ?? 0);
  return 0xe8d257;
}

let n = 0;

const ownerOf = (l: Loose): string => `l:${l.uid}`;

/** what an engine block, a seat frame or a lamp housing is painted at the factory (as on a vehicle; a panel by its style) */
export function partLook(inst: PartInstance): LookOf {
  const base = inst.paint >= 0 ? paintHex(inst.paint) : 0x8f3a2c;
  const style = partDef(inst.part).panel?.style;
  return {
    paint: style ? panelPaint(style, base) : base,
    paint2: 0xd8d4c8,
    dirt: inst.dirt,
    rust: style === 'rusty' ? Math.max(0.85, inst.rust) : inst.rust,
    wear: Math.max(0, Math.min(1, (0.7 - inst.cond) / 0.6)),
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
  private readonly mergedAs = new Map<number, { dirt: number; rust: number }>();
  private litId = -1;
  private readonly sphere = new THREE.Sphere();
  private readonly ray = new THREE.Ray();
  private readonly hit = new THREE.Vector3();

  /** the vehicles things can be put on (the game fills this in) */
  carriers: () => readonly Carrier[] = () => [];
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
        const tl = this.mats.look(`${ownerOf(l)}+tire`, { paint: 0x222222, paint2: 0xeeeeee, dirt: t.dirt });
        void this.track(partModel(t.part, inst.part)).then((tmodel) => {
          if (!this.list.includes(l)) return;
          const to = seatTyres(model, tmodel, def.rim!.radius, partDef(t.part).tire!.sidewall, !!t.flat);
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

  addTool(tool: Tool, x: number, y: number, z: number, yaw = 0): Loose {
    const l = this.make(null, tool, x, y, z, yaw);
    const look = this.mats.look(ownerOf(l), { paint: toolPaint(tool), paint2: toolPaint(tool) });
    const obj = toolModel(tool);
    applyMaterials(obj, look);
    l.obj.add(obj);
    this.mergeDirty = true;
    this.measure(l);
    // its own model, when there is one, takes the stand-in's place
    void this.track(toolGlb(tool.kind)).then((m) => {
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

  /** a tool's look changed (a spray can's colour) */
  repaintTool(l: Loose): void {
    if (!l.tool) return;
    this.mats.set(ownerOf(l), { paint: toolPaint(l.tool), paint2: toolPaint(l.tool) });
    this.unmerge();
  }

  /** light up the thing the mark is on (null = none) */
  highlight(l: Loose | null): void {
    const id = l ? (this.mergeIds.get(l.uid) ?? -1) : -1;
    if (id !== this.litId) {
      this.mergedLook?.setHighlight(id > 0 ? id : null);
      this.litId = id;
    }
    this.mats.highlight(l && id < 0 ? ownerOf(l) : '');
  }

  private unmerge(): void {
    this.mergeDirty = true;
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
    if (this.merged) this.unmerge();
    this.mergeDirty = false;
    const entries: { id: number; object: THREE.Object3D; look: { paint: number; paint2: number; dirt?: number; rust?: number; wear?: number } }[] = [];
    for (const l of this.list) {
      // (what rides on a vehicle moves with it: not merged)
      if (l.riding) continue;
      const id = entries.length + 1;
      const look: LookOf = l.part ? partLook(l.part) : { paint: toolPaint(l.tool!), paint2: toolPaint(l.tool!) };
      this.mergeIds.set(l.uid, id);
      this.mergedAs.set(id, { dirt: look.dirt ?? 0, rust: look.rust ?? 0 });
      entries.push({ id, object: l.obj, look });
    }
    if (!entries.length) return;
    this.root.updateMatrixWorld(true);
    const merged = new MergedCar(this.root, entries, (o) => MOVES.test(o.name) || !!o.userData.mover);
    this.root.add(merged.group);
    const look = this.mats.look('merged', { paint: 0x8f3a2c, paint2: 0xd8d4c8 });
    applyMaterials(merged.group, look, true);
    look.setCarFrame(this.root.matrixWorld);
    this.merged = merged;
    this.mergedLook = look;
  }

  private make(part: PartInstance | null, tool: Tool | null, x: number, y: number, z: number, yaw: number): Loose {
    n++;
    const obj = new THREE.Group();
    obj.name = `loose:${part?.part ?? tool?.kind}`;
    this.root.add(obj);
    const l: Loose = { uid: `l${n.toString(36)}`, part, tool, x, y, z, yaw, vy: 0, resting: false, obj, radius: 0.3, mid: 0.2 };
    this.list.push(l);
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
        if (this.merged && id !== undefined && was && (Math.abs(was.dirt - (look.dirt ?? 0)) > 0.02 || Math.abs(was.rust - (look.rust ?? 0)) > 0.02)) {
          this.merged.updatePart(id, { dirt: look.dirt, rust: look.rust });
          this.mergedAs.set(id, { dirt: look.dirt ?? 0, rust: look.rust ?? 0 });
        }
      }
      if (!l.riding) {
        l.obj.updateMatrixWorld();
        this.mats.setFrameOf(ownerOf(l), l.obj.matrixWorld);
      }
    }
    this.tryMerge();
    if (this.mergedLook) {
      this.root.updateMatrixWorld();
      this.mergedLook.setCarFrame(this.root.matrixWorld);
    }
  }

  /** the nearest thing the ray from eye along dir passes through, within maxDist (world coordinates) */
  pick(eye: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, maxDist: number, filter?: (l: Loose) => boolean): { loose: Loose; dist: number } | null {
    let best: Loose | null = null;
    let bd = maxDist;
    this.ray.origin.set(eye.x, eye.y, eye.z);
    this.ray.direction.set(dir.x, dir.y, dir.z).normalize();
    for (const l of this.list) {
      if (filter && !filter(l)) continue;
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
