/**
 * The doors of the buildings by the road (docs/MODCAR.md §20): each building our kit draws (siteArt.ts) has its
 * doorway's leaves — a house's wooden door, a shop's glass pair, a shed's two board doors — hung at their hinges in
 * the opening the walls leave (buildingKit.ts), swung into the room with E, shut against the walker and the vehicles
 * while they are closed. Most are found shut, a shed's now and then open; what one leaves open or shut stays so (the
 * places' save, `doors`).
 */
import * as THREE from 'three';
import { hash2 } from '../../core/math/rng';
import { Solid, solidWithin, type SolidSource } from '../../core/world/solids';
import type { Site, SiteObject } from '../../core/world/sites';
import type { Text } from '../../core/modcar/types';
import type { RenderCore } from '../render/core';
import { cloneModel, type Model } from './assets';
import { buildingKit, coatOf, kitSeed, leafMatrix, type KitLeaf, type KitOpening } from './buildingKit';
import type { GarageDevice } from './garageStub';
import { applyMaterials, CarMaterials } from './materials';
import { PLACE_GLOSS } from './siteArt';

/** how far a door swings open (rad), and how long it takes (s) */
const OPEN = 1.65;
const SWING_S = 0.55;
/** shut enough to keep one out */
const SHUT = 0.18;

/** a doorway there now */
interface LiveDoor {
  id: string;
  site: Site;
  o: SiteObject;
  op: KitOpening;
  /** how far open (0 … 1) and where it is going */
  t: number;
  target: 0 | 1;
  leaves: { l: KitLeaf; pivot: THREE.Group }[];
  /** the object's frame (world, metres) */
  frame: THREE.Matrix4;
  solid: Solid;
  device: GarageDevice;
}

/** the doors' solids (the shut ones keep the walker and the vehicles out) */
export class DoorSolids implements SolidSource {
  readonly list: { solid: Solid; door: LiveDoor }[] = [];
  solidsNear(x: number, z: number, r: number, out: Solid[]): void {
    for (const d of this.list) if (d.door.t < SHUT && solidWithin(d.solid, x, z, r)) out.push(d.solid);
  }
}

/** what the doors need of the game */
export interface DoorHost {
  readonly core: RenderCore;
  readonly origin: { x: number; y: number; z: number };
  /** a kit piece's model (kit/door_wood …), null while it is not there */
  model(name: string): Model | null;
  play(name: string): void;
}

const E = new THREE.Euler();
const Q = new THREE.Quaternion();
const ONE = new THREE.Vector3(1, 1, 1);

export class Doors {
  readonly solids = new DoorSolids();
  /** the doors' devices there now (the game's devices take them in) */
  devices: GarageDevice[] = [];
  private readonly live = new Map<string, LiveDoor[]>();
  private readonly mats = new CarMaterials();
  /** the doors one opened or shut (their state from then on) */
  private readonly state = new Map<string, 0 | 1>();
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpL = new THREE.Matrix4();
  private readonly tmpInv = new THREE.Matrix4();
  private readonly tmpRay = new THREE.Ray();
  private readonly tmpHit = new THREE.Vector3();
  private readonly box = new THREE.Box3();

  constructor(
    private readonly host: DoorHost,
    saved?: Record<string, 0 | 1>,
  ) {
    for (const [id, v] of Object.entries(saved ?? {})) this.state.set(id, v);
  }

  /** a place's doors hung (the buildings the kit draws); their devices */
  come(site: Site): GarageDevice[] {
    const out: LiveDoor[] = [];
    site.objects.forEach((o, bi) => {
      if (o.kind !== 'building' || !o.b) return;
      const { openings } = buildingKit(o, kitSeed(site.seed, bi));
      openings.forEach((op, di) => {
        const model = this.host.model(`kit/${op.name}`);
        if (!model) return;
        const id = `${site.id}/b${bi}/d${di}`;
        // (most are found shut; a shed's now and then left open)
        const found: 0 | 1 = (hash2(site.seed, bi * 8 + di, 0xd0) & 0xff) / 255 < (op.name === 'door_shed' ? 0.4 : 0.15) ? 1 : 0;
        const st = this.state.get(id) ?? found;
        E.set(o.roll, -o.yaw, o.pitch, 'YZX');
        Q.setFromEuler(E);
        const frame = new THREE.Matrix4().compose(new THREE.Vector3(o.x, o.y, o.z), Q.clone(), ONE);
        const coat = coatOf(o);
        const look = this.mats.look(`door:${id}`, { paint: coat.door, paint2: coat.trim, dirt: 0.25 + 0.3 * ((hash2(site.seed, bi, di) & 0xff) / 255), rust: 0.06, wear: 0.3, matte: PLACE_GLOSS });
        const leaves = op.leaves.map((l) => {
          const pivot = new THREE.Group();
          pivot.name = `door:${id}`;
          pivot.matrixAutoUpdate = false;
          const leaf = cloneModel(model);
          applyMaterials(leaf, look);
          pivot.add(leaf);
          this.host.core.scene.add(pivot);
          return { l, pivot };
        });
        // the shut leaves' solid: the opening's width, thin, the door's height
        const c = Math.cos(o.yaw);
        const s = Math.sin(o.yaw);
        const solid = new Solid().set(o.x + c * op.cx - s * op.cz, o.z + s * op.cx + c * op.cz, op.width / 2, 0.06, o.yaw, o.y, o.y + op.height, false, `${site.id}:door`);
        const door: LiveDoor = { id, site, o, op, t: st, target: st, leaves, frame, solid, device: null as unknown as GarageDevice };
        door.device = this.device(door);
        this.solids.list.push({ solid, door });
        this.place(door);
        out.push(door);
      });
    });
    this.live.set(site.id, out);
    this.devices = [...this.live.values()].flat().map((d) => d.device);
    return out.map((d) => d.device);
  }

  /** a place's doors taken down (it is left behind) */
  go(site: Site): void {
    const list = this.live.get(site.id);
    if (!list) return;
    for (const d of list) {
      for (const lf of d.leaves) lf.pivot.removeFromParent();
      this.mats.drop(`door:${d.id}`);
      const i = this.solids.list.findIndex((x) => x.door === d);
      if (i >= 0) this.solids.list.splice(i, 1);
    }
    this.live.delete(site.id);
    this.devices = [...this.live.values()].flat().map((d) => d.device);
  }

  private device(d: LiveDoor): GarageDevice {
    const self = this;
    const shop = d.op.name === 'door_shop';
    const c = Math.cos(d.o.yaw);
    const s = Math.sin(d.o.yaw);
    const wx = d.o.x + c * d.op.cx - s * d.op.cz;
    const wz = d.o.z + s * d.op.cx + c * d.op.cz;
    return {
      id: `door:${d.id}`,
      x: wx,
      y: d.o.y + 1.1,
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
        const o = self.host.origin;
        self.tmpM.makeRotationY(-d.o.yaw).setPosition(wx - o.x, d.o.y - o.y, wz - o.z);
        self.tmpInv.copy(self.tmpM).invert();
        self.tmpRay.copy(ray).applyMatrix4(self.tmpInv);
        self.box.min.set(-d.op.width / 2, 0, -0.35);
        self.box.max.set(d.op.width / 2, d.op.height, 0.35);
        const p = self.tmpRay.intersectBox(self.box, self.tmpHit);
        if (!p) return null;
        const dist = p.distanceTo(self.tmpRay.origin);
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
    const o = this.host.origin;
    for (const { l, pivot } of d.leaves) {
      leafMatrix(l, OPEN * e, this.tmpL);
      pivot.matrix.copy(d.frame).multiply(this.tmpL);
      // (the floating origin)
      pivot.matrix.elements[12] -= o.x;
      pivot.matrix.elements[13] -= o.y;
      pivot.matrix.elements[14] -= o.z;
      pivot.matrixWorldNeedsUpdate = true;
    }
  }

  /** the doors opened or shut (for the save) */
  snapshot(): Record<string, 0 | 1> {
    return Object.fromEntries(this.state);
  }

  /** the doors there now (the probes'): their ids, how far open, the doorway's middle (world) */
  telemetry(): { id: string; open: number; x: number; z: number; y: number; name: string }[] {
    return [...this.live.values()].flat().map((d) => ({ id: d.id, open: d.t, x: d.device.x, z: d.device.z, y: d.o.y, name: d.op.name }));
  }
}
