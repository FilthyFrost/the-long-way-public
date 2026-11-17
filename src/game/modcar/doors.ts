/**
 * The doors of the buildings by the road (docs/MODCAR.md §20): each building our kit draws (siteArt.ts) has its
 * door's leaf — a house's wooden one, a shop's glass one, a shed's two leaves of boards — hung on its hinge in the
 * opening the walls leave (buildingKit.ts), swinging inward with E, shut against the walker and the vehicles while
 * it is closed. Most are found shut; what one leaves open or shut stays so (the save's `doors`).
 */
import * as THREE from 'three';
import { hash2 } from '../../core/math/rng';
import { Solid, solidWithin, type SolidSource } from '../../core/world/solids';
import type { Site, SiteObject } from '../../core/world/sites';
import type { Text } from '../../core/modcar/types';
import type { RenderCore } from '../render/core';
import { cloneModel, type Model } from './assets';
import { buildingKit, type KitDoor } from './buildingKit';
import type { GarageDevice } from './garageStub';
import { applyMaterials, CarMaterials } from './materials';

/** how far a door swings open (rad), and how long it takes (s) */
const OPEN = 1.65;
const SWING_S = 0.55;

/** a door there now */
export interface LiveDoor {
  id: string;
  site: Site;
  o: SiteObject;
  k: KitDoor;
  /** its hinge (world, at the floor) */
  x: number;
  y: number;
  z: number;
  /** how far open (0 … 1) and where it is going */
  t: number;
  target: 0 | 1;
  pivot: THREE.Group;
  solid: Solid;
  device: GarageDevice;
}

/** the doors' solids (the shut ones keep the walker and the vehicles out) */
export class DoorSolids implements SolidSource {
  readonly list: { solid: Solid; door: LiveDoor }[] = [];
  solidsNear(x: number, z: number, r: number, out: Solid[]): void {
    for (const d of this.list) if (d.door.t < 0.18 && solidWithin(d.solid, x, z, r)) out.push(d.solid);
  }
}

/** what the doors need of the game */
export interface DoorHost {
  readonly core: RenderCore;
  readonly origin: { x: number; y: number; z: number };
  /** the leaf's model (the kit's door_wood, door_shop, door_shed), null while it is not there */
  model(name: string): Model | null;
  play(name: string): void;
}

const DOOR_LOOK: Record<KitDoor['name'], { paint: number; paint2: number }> = {
  door_wood: { paint: 0x8a6a48, paint2: 0x5a3a2b },
  door_shop: { paint: 0xb4b8b4, paint2: 0x6f7a82 },
  door_shed: { paint: 0x7a7f45, paint2: 0x5a3a2b },
};

export class Doors {
  readonly solids = new DoorSolids();
  private readonly live = new Map<string, LiveDoor[]>();
  private readonly mats = new CarMaterials();
  /** the doors one opened or shut (their state from then on) */
  private readonly state = new Map<string, 0 | 1>();
  private readonly box = new THREE.Box3();
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpInv = new THREE.Matrix4();
  private readonly tmpRay = new THREE.Ray();
  private readonly tmpHit = new THREE.Vector3();

  constructor(
    private readonly host: DoorHost,
    saved?: Record<string, 0 | 1>,
  ) {
    for (const [id, v] of Object.entries(saved ?? {})) this.state.set(id, v);
  }

  /** a place's doors, hung (its buildings the kit draws) */
  come(site: Site): GarageDevice[] {
    const out: LiveDoor[] = [];
    site.objects.forEach((o, bi) => {
      if (o.kind !== 'building' || !o.b) return;
      const { doors } = buildingKit(o, hash2(site.seed, bi, 0xb1d));
      doors.forEach((k, di) => {
        const model = this.host.model(k.name);
        if (!model) return;
        const id = `${site.id}/b${bi}/d${di}`;
        const c = Math.cos(o.yaw);
        const s = Math.sin(o.yaw);
        const x = o.x + c * k.hx - s * k.hz;
        const z = o.z + s * k.hx + c * k.hz;
        // (most are found shut; a shed's now and then left open)
        const found: 0 | 1 = (hash2(site.seed, bi * 8 + di, 0xd0) & 0xff) / 255 < (k.name === 'door_shed' ? 0.4 : 0.15) ? 1 : 0;
        const st = this.state.get(id) ?? found;
        const pivot = new THREE.Group();
        pivot.name = `door:${id}`;
        const leaf = cloneModel(model);
        const size = model.box.getSize(new THREE.Vector3());
        // (the leaf's own frame: along +X from the hinge, up Y; stretched to the opening)
        leaf.scale.set(size.x > 1e-3 ? k.width / size.x : 1, size.y > 1e-3 ? k.height / size.y : 1, 1);
        pivot.add(leaf);
        const look = this.mats.look(`door:${id}`, { ...DOOR_LOOK[k.name], dirt: 0.3 + 0.3 * ((hash2(site.seed, bi, di) & 0xff) / 255), rust: 0.08, wear: 0.35 });
        applyMaterials(leaf, look);
        this.host.core.scene.add(pivot);
        // the shut leaf's solid: the opening's width, thin, the door's height
        const cx = k.hx + (k.dir * k.width) / 2;
        const solid = new Solid().set(o.x + c * cx - s * k.hz, o.z + s * cx + c * k.hz, k.width / 2, 0.06, o.yaw, o.y, o.y + k.height, false, `${site.id}:door`);
        const door: LiveDoor = { id, site, o, k, x, y: o.y, z, t: st, target: st, pivot, solid, device: null as unknown as GarageDevice };
        door.device = this.device(door);
        this.solids.list.push({ solid, door });
        this.place(door);
        out.push(door);
      });
    });
    this.live.set(site.id, out);
    return out.map((d) => d.device);
  }

  /** a place's doors taken down (it is left behind) */
  go(site: Site): void {
    const list = this.live.get(site.id);
    if (!list) return;
    for (const d of list) {
      d.pivot.removeFromParent();
      this.mats.drop(`door:${d.id}`);
      const i = this.solids.list.findIndex((x) => x.door === d);
      if (i >= 0) this.solids.list.splice(i, 1);
    }
    this.live.delete(site.id);
  }

  private device(d: LiveDoor): GarageDevice {
    const self = this;
    const shop = d.k.name === 'door_shop';
    const c = Math.cos(d.o.yaw);
    const s = Math.sin(d.o.yaw);
    const cx = d.k.hx + (d.k.dir * d.k.width) / 2;
    const wx = d.o.x + c * cx - s * d.k.hz;
    const wz = d.o.z + s * cx + c * d.k.hz;
    return {
      id: `door:${d.id}`,
      x: wx,
      y: d.y + 1.1,
      z: wz,
      radius: 0.5,
      get word(): Text {
        return d.target ? { zh: '关上<b>门</b>', en: 'Shut the door' } : { zh: '打开<b>门</b>', en: 'Open the door' };
      },
      use: (): void => {
        d.target = d.target ? 0 : 1;
        self.state.set(d.id, d.target);
        self.host.play(d.target ? (shop ? 'door_shop_open' : 'door_house_open') : shop ? 'door_shop_close' : 'door_house_close');
      },
      hit: (ray: THREE.Ray, reach: number): number | null => {
        // (the opening: the door's width, its height, a little either side of the wall)
        const o = this.host.origin;
        this.tmpM.makeRotationY(-d.o.yaw).setPosition(wx - o.x, d.y - o.y, wz - o.z);
        this.tmpInv.copy(this.tmpM).invert();
        this.tmpRay.copy(ray).applyMatrix4(this.tmpInv);
        this.box.min.set(-d.k.width / 2, 0, -0.35);
        this.box.max.set(d.k.width / 2, d.k.height, 0.35);
        const p = this.tmpRay.intersectBox(this.box, this.tmpHit);
        if (!p) return null;
        const dist = p.distanceTo(this.tmpRay.origin);
        return dist <= reach ? dist : null;
      },
    };
  }

  /** every frame: the doors swing towards where they are going, and sit where the world's origin has them */
  update(dt: number): void {
    for (const list of this.live.values()) {
      for (const d of list) {
        if (d.t !== d.target) {
          const step = dt / SWING_S;
          d.t = d.target > d.t ? Math.min(d.target, d.t + step) : Math.max(d.target, d.t - step);
        }
        this.place(d);
      }
    }
  }

  private place(d: LiveDoor): void {
    // eased as a door swings: quick, slowing at the end
    const e = d.t * d.t * (3 - 2 * d.t);
    const a = OPEN * e;
    // (the building's turn, then the leaf's: along +x from the hinge, or −x; swinging inward, to +z)
    const turn = -d.o.yaw + (d.k.dir > 0 ? -a : Math.PI + a);
    this.host.core.place(d.pivot, d.x, d.y, d.z);
    d.pivot.rotation.set(0, turn, 0);
  }

  /** the doors opened or shut (for the save) */
  snapshot(): Record<string, 0 | 1> {
    return Object.fromEntries(this.state);
  }

  /** the doors there now (the probes') */
  telemetry(): { id: string; open: number }[] {
    return [...this.live.values()].flat().map((d) => ({ id: d.id, open: d.t }));
  }
}
