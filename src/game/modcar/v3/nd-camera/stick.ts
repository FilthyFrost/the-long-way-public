/**
 * A print stuck somewhere (docs/ND/PLAN.md; Nomad Drive places a print by its placement mode, on a wall by the print's
 * wall rule: its back to the wall, its top up the wall): with a print in the hands, the mark on a surface within 2 m —
 * a building's wall, a vehicle's body or its inside, a piece of furniture — shows the print there as a ghost, flat on
 * the surface, its top up the wall (or, on a table or a floor, away from one); the wheel turns it a quarter round; E
 * sticks it. Stuck on a vehicle, it rides with it as anything put in it does (the vehicle's save keeps it, turned as
 * it was stuck); stuck on a thing lying about (a piece of furniture, a box), it goes where that goes — moved, stowed
 * in a vehicle and riding there, picked up and put down again (while the thing is in the hands or a bag it is not
 * seen, and back on it when it is down again); anywhere else it stays where it was stuck (this module's save keeps
 * both). E on a stuck print takes it back into the hands.
 */
import * as THREE from 'three';
import type { ItemInstance } from '../../../../core/modcar/items';
import { CAMERA } from '../../../../core/v3/nd/camera';
import { ND_PHOTO } from '../../../../core/v3/nd/items';
import type { GameContext } from '../../kernel/context';
import type { Loose } from '../../loose';
import { heldOf } from '../../player';
import type { ModVehicle } from '../../vehicle';

/** how far one reaches to stick a print (m: Nomad Drive's placement at most 2 m off) */
export const STICK_REACH = 2.0;

/** where a print would go: the point (render space), the surface's normal, the vehicle it is on (null: the world) */
export interface StickAim {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  /** the print's top's direction along the surface */
  up: THREE.Vector3;
  on: ModVehicle | null;
  /** the thing lying about (or riding in a vehicle) it is on: the print goes with it */
  thing: Loose | null;
}

/** where a print stuck on a thing is on it: the thing's own (its item's, its part's, its tool's) uid, the print's place and turn in its frame */
export interface StuckOn {
  uid: string;
  pos: [number, number, number];
  q: [number, number, number, number];
}

/** the uid a thing lying about keeps through being picked up and put down (the lying-about record's own is new each time) */
export function thingUid(l: Loose): string | null {
  return l.item?.uid ?? l.part?.uid ?? l.tool?.uid ?? null;
}

/** a print stuck in the world (not on a vehicle): its thing, where (world), turned how */
export interface StuckPrint {
  item: ItemInstance;
  x: number;
  y: number;
  z: number;
  q: [number, number, number, number];
  /** on a thing: where it is on it (x, y, z and q follow it) */
  on?: StuckOn;
}

const RAY = new THREE.Raycaster();
const UP = new THREE.Vector3(0, 1, 0);
const TMP = new THREE.Vector3();
const M = new THREE.Matrix4();

/** what moves on its own and is no surface to stick on (a building's door, a cupboard's door or drawer, a print, a ghost) */
function movable(o: THREE.Object3D | null): boolean {
  for (let n = o; n; n = n.parent) {
    const name = n.name;
    if (name === 'DOOR' || /^P_(door|drawer)/.test(name) || name.startsWith('nd:') || name === 'modcar:held') return true;
    if (name.startsWith('nd-build:')) return false;
  }
  return false;
}

/** the thing lying about a hit belongs to, if any */
function thingOf(o: THREE.Object3D, things: Map<THREE.Object3D, Loose>): Loose | null {
  for (let n: THREE.Object3D | null = o; n; n = n.parent) {
    const l = things.get(n);
    if (l) return l;
  }
  return null;
}

const INV = new THREE.Matrix4();
const BOX = new THREE.Box3();
const LP = new THREE.Vector3();

/**
 * The thing lying about a point (render space) is on, by the things' boxes: a thing at rest is drawn merged with the
 * others near it (loose.ts), so what the line of sight meets there is the merged mesh, not the thing's own.
 */
function thingAt(ctx: GameContext, p: THREE.Vector3, things: Map<THREE.Object3D, Loose>): Loose | null {
  for (const l of things.values()) {
    const b = l.box ?? ctx.cargo.boxOf(heldOf(l));
    l.obj.updateMatrixWorld(true);
    // (its box not measured yet: the one round its model as it stands)
    if (!b) {
      if (BOX.setFromObject(l.obj).expandByScalar(0.02).containsPoint(p)) return l;
      continue;
    }
    LP.copy(p).applyMatrix4(INV.copy(l.obj.matrixWorld).invert());
    const e = 0.02;
    if (LP.x >= b.minX - e && LP.x <= b.maxX + e && LP.y >= b.minY - e && LP.y <= b.maxY + e && LP.z >= b.minZ - e && LP.z <= b.maxZ + e) return l;
  }
  return null;
}

/** the vehicle a hit belongs to, if any */
function vehicleOf(o: THREE.Object3D, roots: Map<THREE.Object3D, ModVehicle>): ModVehicle | null {
  for (let n: THREE.Object3D | null = o; n; n = n.parent) {
    const v = roots.get(n);
    if (v) return v;
  }
  return null;
}

/** the print's turn for a stick: its face (+y) out of the surface, its top (+x) along `up` (the model: tools/blender/items/nd_things.py nd_photo) */
export function printTurn(normal: THREE.Vector3, up: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  const x = TMP.copy(up).normalize();
  const z = new THREE.Vector3().crossVectors(x, normal).normalize();
  M.makeBasis(x, normal, z);
  return out.setFromRotationMatrix(M);
}

/**
 * Where the line of sight meets a surface a print can go on (within reach): the buildings of the ND module, the
 * vehicles near, the things lying about near (their own, not a print or a ghost); null: nothing.
 */
export function aimStick(ctx: GameContext, roll: number, out: StickAim): StickAim | null {
  const p = ctx.player;
  const o = ctx.core.origin;
  RAY.set(new THREE.Vector3(p.eye.x - o.x, p.eye.y - o.y, p.eye.z - o.z), new THREE.Vector3(p.dir.x, p.dir.y, p.dir.z).normalize());
  RAY.near = 0.05;
  RAY.far = STICK_REACH;
  const targets: THREE.Object3D[] = [];
  const roots = new Map<THREE.Object3D, ModVehicle>();
  const things = new Map<THREE.Object3D, Loose>();
  for (const c of ctx.core.scene.children) if (c.name.startsWith('nd-build:')) targets.push(c);
  for (const v of ctx.vehicles) {
    if ((v.sim.px - p.eye.x) ** 2 + (v.sim.pz - p.eye.z) ** 2 > 100) continue;
    targets.push(v.view.root);
    roots.set(v.view.root, v);
  }
  // (the things lying about and the ones riding in a vehicle: both keep to the loose things' own root, not the vehicle's)
  for (const l of ctx.loose.list) {
    if (l.item?.item === ND_PHOTO || !thingUid(l)) continue;
    if ((l.x - p.eye.x) ** 2 + (l.z - p.eye.z) ** 2 > 9) continue;
    targets.push(l.obj);
    things.set(l.obj, l);
  }
  if (!targets.length) return null;
  const hits = RAY.intersectObjects(targets, true);
  for (const h of hits) {
    const mesh = h.object as THREE.Mesh;
    if (!mesh.isMesh || !h.face || movable(mesh)) continue;
    // (seen: every parent drawn — a thing lying still has its own meshes hidden, drawn merged with the others: it is there all the same)
    const own = thingOf(mesh, things);
    let shown = true;
    for (let n: THREE.Object3D | null = own ? mesh.parent : mesh; n; n = n.parent) if (!n.visible) shown = false;
    if (!shown) continue;
    const n = out.normal.copy(h.face.normal).transformDirection(mesh.matrixWorld);
    if (n.dot(RAY.ray.direction) > 0) n.negate();
    out.point.copy(h.point);
    // its top up the wall; on a table or a floor, away from the one sticking it
    const u = out.up.copy(UP).addScaledVector(n, -UP.dot(n));
    if (u.lengthSq() < 0.05) u.copy(RAY.ray.direction).addScaledVector(n, -RAY.ray.direction.dot(n));
    u.normalize();
    if (roll) u.applyAxisAngle(n, (roll * Math.PI) / 2);
    out.on = vehicleOf(mesh, roots);
    out.thing = out.on ? null : (thingOf(mesh, things) ?? thingAt(ctx, h.point, things));
    return out;
  }
  return null;
}

/** the ghost of a print about to be stuck: its card, its picture (the texture of the print in the hands) */
export class PrintGhost {
  readonly group = new THREE.Group();
  private readonly pic: THREE.MeshBasicMaterial;
  constructor(scene: THREE.Scene) {
    this.group.name = 'nd:print-ghost';
    this.group.visible = false;
    const card = new THREE.Mesh(new THREE.BoxGeometry(CAMERA.card[1], 0.0015, CAMERA.card[0]), new THREE.MeshBasicMaterial({ color: 0xfaf6ec, transparent: true, opacity: 0.55, depthWrite: false }));
    card.position.set(0.0, 0.00075, 0.0);
    this.group.add(card);
    this.pic = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false });
    const g = new THREE.PlaneGeometry(CAMERA.picture[0], CAMERA.picture[1]);
    g.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)));
    const pm = new THREE.Mesh(g, this.pic);
    pm.position.set(0.012, 0.0018, 0.0);
    this.group.add(pm);
    scene.add(this.group);
  }
  show(aim: StickAim | null, tex: THREE.Texture | null): void {
    this.group.visible = !!aim;
    if (!aim) return;
    if (this.pic.map !== tex) {
      this.pic.map = tex;
      this.pic.needsUpdate = true;
    }
    this.group.position.copy(aim.point).addScaledVector(aim.normal, 0.002);
    printTurn(aim.normal, aim.up, this.group.quaternion);
  }
  dispose(): void {
    this.group.removeFromParent();
  }
}
