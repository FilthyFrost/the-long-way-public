/**
 * Things lying about (docs/MODCAR.md §5): parts taken off a vehicle or waiting on a shelf, and the
 * tools — a jerrycan, a bottle of water, an oil can, spray cans, a sponge. Put down, they drop onto
 * whatever surface is under them (the floor, a shelf, a bench) and stay there.
 */
import * as THREE from 'three';
import { partDef } from '../../core/modcar/parts';
import { paintHex } from '../../core/modcar/palette';
import type { Tool } from '../../core/modcar/tools';
import type { PartInstance } from '../../core/modcar/types';
import type { RenderCore } from '../render/core';
import { cloneModel, partModel } from './assets';
import { applyMaterials, type CarMaterials } from './materials';

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
}

/** where a dropped thing comes to rest: the highest surface at (x, z) not above `fromY` */
export type SurfaceAt = (x: number, z: number, fromY: number) => number;

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

export class LooseThings {
  readonly root = new THREE.Group();
  readonly list: Loose[] = [];
  private readonly loads = new Set<Promise<unknown>>();
  private readonly sphere = new THREE.Sphere();
  private readonly ray = new THREE.Ray();
  private readonly hit = new THREE.Vector3();

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
    void this.track(partModel(inst.part)).then((model) => {
      if (!this.list.includes(l)) return;
      const obj = cloneModel(model);
      applyMaterials(obj, this.mats, inst.paint >= 0 ? paintHex(inst.paint) : 0x8f3a2c, 0xd8d4c8);
      // a wheel lies on its side
      if (def.cat === 'rim' || def.cat === 'tire') {
        obj.rotation.x = Math.PI / 2;
        const r = def.rim?.radius ?? (0.165 + (def.tire?.sidewall ?? 0.1));
        const w = def.rim?.width ?? def.tire?.width ?? 0.15;
        obj.position.y = w / 2;
        void r;
      }
      l.obj.add(obj);
      const t = inst.sub.tire;
      if (t && def.cat === 'rim') {
        void this.track(partModel(t.part, inst.part)).then((tmodel) => {
          if (!this.list.includes(l)) return;
          const to = cloneModel(tmodel);
          applyMaterials(to, this.mats, 0x222222, 0xeeeeee);
          to.rotation.x = Math.PI / 2;
          to.position.y = (def.rim?.width ?? 0.15) / 2;
          l.obj.add(to);
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
    const obj = toolModel(tool);
    applyMaterials(obj, this.mats, toolPaint(tool), toolPaint(tool));
    l.obj.add(obj);
    this.measure(l);
    return l;
  }

  /** a tool's look changed (a spray can's colour) */
  repaintTool(l: Loose): void {
    if (!l.tool) return;
    applyMaterials(l.obj, this.mats, toolPaint(l.tool), toolPaint(l.tool));
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
    const i = this.list.indexOf(l);
    if (i >= 0) this.list.splice(i, 1);
    l.obj.removeFromParent();
  }

  /** drop it from where it is: it falls onto the surface below */
  drop(l: Loose): void {
    l.resting = false;
    l.vy = 0;
  }

  update(dt: number): void {
    for (const l of this.list) {
      if (!l.resting) {
        const floor = this.surfaceAt(l.x, l.z, l.y + 0.05);
        l.vy -= 9.81 * dt;
        l.y += l.vy * dt;
        if (l.y <= floor) {
          l.y = floor;
          l.vy = 0;
          l.resting = true;
        }
      }
      this.core.place(l.obj, l.x, l.y, l.z);
      l.obj.rotation.y = -l.yaw;
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
