/**
 * Things stowed in vehicles (docs/MODCAR.md §5.6), the game's side of core/modcar/cargo.ts:
 *
 *  - each zone's floor, drawn once from above (an orthographic view of the vehicle alone just under the
 *    zone's top — under a shut boot lid — its heights packed into the colour and read back), so a seat
 *    taken out or a wheel arch in a bed is where the model has it;
 *  - where the thing in the hands would go as one aims into a boot, a bed or onto a seat (its ghost there:
 *    cyan when it fits, red when not), turned in steps with the wheel;
 *  - putting it in (it rides in the vehicle from then on, never falls out) and packing in without aiming
 *    (the lowest free spot from the back, the zones in order, a shut lid opened for it);
 *  - what the load weighs on the vehicle (the build's cargo: the derived mass and centre of gravity).
 */
import * as THREE from 'three';
import { findSpot, gridAt, latticeOrigin, LIDLESS_WHY, lieBox, restAt, zoneLidless, zonesFor, zoneTakes, type CargoMass, type CargoZone, type HeightGrid, type Lie, type Placed, type Spot, type ThingBox } from '../../core/modcar/cargo';
import { itemDef, itemMass } from '../../core/modcar/items';
import { partDef } from '../../core/modcar/parts';
import type { RenderCore } from '../render/core';
import { applyGhost } from '../render/carMaterials';
import type { Loose, LooseThings } from './loose';
import { heldOf, type Held } from './player';
import type { ModVehicle } from './vehicle';

/** the floor grid's cell (m) */
const CELL = 0.02;
/** the layer the vehicle alone is drawn on, for its floors */
const FLOOR_LAYER = 7;
/** how far a zone may be from the eye to aim into (m) */
const AIM_REACH = 3.2;
/** where a thing is aimed into a vehicle it keeps to a grid of this step (m: docs/V3/nodes/M2-rv.md) */
const AIM_GRID = 0.1;

const VS = /* glsl */ `
uniform mat4 uInv;
varying float vY;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vY = (uInv * w).y;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FS = /* glsl */ `
uniform float uTop;
uniform float uRange;
varying float vY;
void main() {
  float t = clamp((uTop - vY) / uRange, 0.0, 1.0);
  float v = floor(t * 65535.0 + 0.5);
  gl_FragColor = vec4(floor(v / 256.0) / 255.0, mod(v, 256.0) / 255.0, 0.0, 1.0);
}`;

/** how a thing in the hands is carried (a zone takes things up to a size) */
export function carryOf(h: NonNullable<Held>): 'small' | 'medium' | 'large' {
  if (h.kind === 'part') return partDef(h.inst.part).carry;
  if (h.kind === 'item') return itemDef(h.item.item).carry;
  return h.tool.kind === 'jerrycan' ? 'medium' : 'small';
}

/** what a thing weighs (kg), with what is in it */
export function massOf(h: NonNullable<Held>): number {
  if (h.kind === 'part') {
    const p = partDef(h.inst.part);
    let kg = p.mass;
    for (const s of Object.values(h.inst.sub)) kg += partDef(s.part).mass;
    const f = h.inst.fluids;
    kg += Object.values(f.fuel ?? {}).reduce((a, b) => a + (b ?? 0) * 0.75, 0) + (f.oilL ?? 0) * 0.9 + (f.coolantL ?? 0);
    return kg;
  }
  if (h.kind === 'item') return itemMass(h.item);
  return h.tool.kind === 'jerrycan' ? 4 + (h.tool.litres ?? 0) * 0.75 : h.tool.kind === 'bottle' || h.tool.kind === 'oilcan' ? 0.5 + (h.tool.litres ?? 0) : 0.4;
}

/** a key per kind of model (its box is the same) */
function boxKey(h: NonNullable<Held>): string {
  if (h.kind === 'part') return `p:${h.inst.part}:${h.inst.sub.tire?.part ?? ''}`;
  if (h.kind === 'item') return `i:${itemDef(h.item.item).model}`;
  return `t:${h.tool.kind}`;
}

/** where the held thing would go: the vehicle, the zone, the spot (null: no room), and why not */
export interface StowAim {
  v: ModVehicle;
  zone: CargoZone;
  spot: Spot | null;
  why: string;
  dist: number;
}

export class CargoBay {
  private readonly grids = new Map<ModVehicle, Map<string, HeightGrid>>();
  private readonly boxes = new Map<string, ThingBox | null>();
  private readonly targets = new Map<string, THREE.WebGLRenderTarget>();
  private readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, side: THREE.DoubleSide, uniforms: { uInv: { value: new THREE.Matrix4() }, uTop: { value: 0 }, uRange: { value: 1 } } });
  private readonly m4 = new THREE.Matrix4();
  private readonly m4b = new THREE.Matrix4();
  private readonly v3 = new THREE.Vector3();
  private readonly v3b = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  /** the held thing's ghost where it would go */
  private ghost: { key: string; group: THREE.Group; kind: 'empty' | 'blocked' } | null = null;
  private ghostToken = 0;
  /** (debugging: the last floor as read back) */
  lastRaw: { w: number; h: number; buf: Uint8Array } | null = null;

  constructor(
    private readonly core: RenderCore,
    private readonly loose: LooseThings,
  ) {
    this.mat.toneMapped = false;
    this.cam.matrixAutoUpdate = false;
    // a thing riding in a vehicle that came to weigh something else by itself (it, or a thing in it, turned into
    // another kind: loose.ts settle): the vehicle is weighed again (what things ride on are the vehicles)
    loose.weightChanged = (on) => this.weigh(on as ModVehicle);
  }

  // ------------------------------------------------------------------ floors

  /** a vehicle's floors are drawn again (a part went on or came off: a seat, a bed liner) */
  invalidate(v: ModVehicle): void {
    this.grids.delete(v);
  }

  forget(v: ModVehicle): void {
    this.grids.delete(v);
  }

  /** the floor of a zone of a vehicle (drawn from above once, then kept) */
  grid(v: ModVehicle, zone: CargoZone): HeightGrid {
    let per = this.grids.get(v);
    if (!per) {
      per = new Map();
      this.grids.set(v, per);
    }
    let g = per.get(zone.id);
    if (!g) {
      g = this.drawFloor(v, zone);
      per.set(zone.id, g);
    }
    return g;
  }

  private drawFloor(v: ModVehicle, zone: CargoZone): HeightGrid {
    // (whole cells, each with its middle inside the place: a strip under half a cell left over at the far edge is
    // read as the last cell — core cargo.ts gridAt; a cell half in a wall would read the wall's top)
    const nx = Math.max(1, Math.round((zone.x[1] - zone.x[0]) / CELL));
    const nz = Math.max(1, Math.round((zone.z[1] - zone.z[0]) / CELL));
    const x0 = zone.x[0];
    const z0 = zone.z[0];
    const h = new Float32Array(nx * nz).fill(NaN);
    const grid: HeightGrid = { x0, z0, cell: CELL, nx, nz, h };
    const r = this.core.renderer;
    const scene = this.core.scene;
    const model = v.view.model;
    model.updateMatrixWorld(true);
    // the vehicle alone, on a layer of its own
    const meshes: THREE.Object3D[] = [];
    v.view.root.traverse((o) => {
      // (a dashboard's: the windscreen over it is no floor)
      if (zone.glassOver && isGlass(o)) return;
      if ((o as THREE.Mesh).isMesh && o.visible && !o.name.startsWith('ghost:')) {
        meshes.push(o);
        o.layers.enable(FLOOR_LAYER);
      }
    });
    // looking straight down from just under the zone's top: image x = model +z, image y = model +x
    const range = zone.top - zone.floor + 0.6;
    const cx = x0 + (nx * CELL) / 2;
    const cz = z0 + (nz * CELL) / 2;
    this.m4b.makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)).setPosition(cx, zone.top, cz);
    this.cam.matrix.multiplyMatrices(model.matrixWorld, this.m4b);
    this.cam.left = -(nz * CELL) / 2;
    this.cam.right = (nz * CELL) / 2;
    this.cam.bottom = -(nx * CELL) / 2;
    this.cam.top = (nx * CELL) / 2;
    this.cam.near = 0;
    this.cam.far = range;
    this.cam.updateProjectionMatrix();
    // (its matrix set by hand: the world matrix and its inverse from it now, the renderer leaves them)
    this.cam.matrixWorldNeedsUpdate = true;
    this.cam.updateMatrixWorld(true);
    this.cam.layers.set(FLOOR_LAYER);
    this.mat.uniforms.uInv.value.copy(model.matrixWorld).invert();
    this.mat.uniforms.uTop.value = zone.top;
    this.mat.uniforms.uRange.value = range;
    const key = `${nz}x${nx}`;
    let rt = this.targets.get(key);
    if (!rt) {
      rt = new THREE.WebGLRenderTarget(nz, nx, { depthBuffer: true });
      this.targets.set(key, rt);
    }
    const prevTarget = r.getRenderTarget();
    const prevClear = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    const prevOverride = scene.overrideMaterial;
    const prevBg = scene.background;
    const prevAuto = r.autoClear;
    const buf = new Uint8Array(nx * nz * 4);
    try {
      scene.overrideMaterial = this.mat;
      scene.background = null;
      r.setRenderTarget(rt);
      r.setClearColor(0xffffff, 1);
      r.autoClear = true;
      r.render(scene, this.cam);
      r.readRenderTargetPixels(rt, 0, 0, nz, nx, buf);
      this.lastRaw = { w: nz, h: nx, buf };
    } finally {
      scene.overrideMaterial = prevOverride;
      scene.background = prevBg;
      r.setRenderTarget(prevTarget);
      r.setClearColor(prevClear, prevAlpha);
      r.autoClear = prevAuto;
      for (const o of meshes) o.layers.disable(FLOOR_LAYER);
    }
    for (let py = 0; py < nx; py++) {
      for (let px = 0; px < nz; px++) {
        const k = (py * nz + px) * 4;
        const t = (buf[k] * 256 + buf[k + 1]) / 65535;
        // (cleared: nothing under it)
        if (t >= 0.9999) continue;
        h[px * nx + py] = zone.top - t * range;
      }
    }
    // Roof racks have thin crossbars with ~93% open gaps: ensure every cell inside the rack footprint has a flat deck at zone.floor.
    if (zone.id === 'roof') {
      for (let i = 0; i < h.length; i++) {
        if (Number.isNaN(h[i]) || h[i] < zone.floor) h[i] = zone.floor;
      }
    }
    // (a room's walls: the cells along its edges are the walls' own feet — a door's sill, the slot under a lining, a
    // kick plate, the wall's very face where it stands on the cell's edge, a window's ledge over it: no floor, and
    // nothing a cupboard stood against the wall stands on. Each reads as the cell next to it inside.)
    if (zone.walls && nx > 2 && nz > 2) {
      for (let px = 0; px < nz; px++) {
        h[px * nx] = h[px * nx + 1];
        h[px * nx + nx - 1] = h[px * nx + nx - 2];
      }
      for (let py = 0; py < nx; py++) {
        h[py] = h[nx + py];
        h[(nz - 1) * nx + py] = h[(nz - 2) * nx + py];
      }
    }
    if (zone.holes?.length) {
      for (let py = 0; py < nx; py++) {
        const wx = x0 + (py + 0.5) * CELL;
        for (let px = 0; px < nz; px++) {
          const wz = z0 + (px + 0.5) * CELL;
          for (const hole of zone.holes) {
            if (wx > hole.x[0] && wx < hole.x[1] && wz > hole.z[0] && wz < hole.z[1]) {
              h[px * nx + py] = NaN;
              break;
            }
          }
        }
      }
    }
    return grid;
  }

  // ------------------------------------------------------------------ the things in a vehicle

  /** what rides in a zone of a vehicle, as boxes where they are (frame model space) */
  placedIn(v: ModVehicle, zone: string): Placed[] {
    const out: Placed[] = [];
    const mergeLegacy = zone === 'cabin' && !zonesFor(v.view.frame.id, v.build).some((z) => z.id === 'fore' || z.id === 'lounge');
    for (const l of this.loose.list) {
      if (l.riding?.on !== v) continue;
      if (l.stow !== zone && !(mergeLegacy && (l.stow === 'fore' || l.stow === 'lounge'))) continue;
      if (mergeLegacy && (l.stow === 'fore' || l.stow === 'lounge')) l.stow = 'cabin';
      const p = this.inModel(v, l);
      if (p) out.push(p);
    }
    return out;
  }

  /** a thing riding a vehicle, in the frame's model space (its box from the model it has) */
  private inModel(v: ModVehicle, l: Loose): Placed | null {
    const r = l.riding;
    if (!r) return null;
    l.box ??= this.boxOf(heldOf(l)) ?? undefined;
    if (!l.box) return null;
    const box = lieBox(l.box, l.lie);
    // the carrier frame (view.root) → the model inside it
    v.view.model.updateMatrix();
    const inv = new THREE.Matrix4().copy(v.view.model.matrix).invert();
    const p = new THREE.Vector3().copy(r.pos).applyMatrix4(inv);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeRotationFromQuaternion(r.rot).premultiply(inv));
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    return { box, x: p.x, y: p.y, z: p.z, yaw: e.y };
  }

  /** everything riding in a vehicle, in its zones and elsewhere on it */
  ridersOf(v: ModVehicle): Loose[] {
    return this.loose.list.filter((l) => l.riding?.on === v);
  }

  /**
   * The load into the build (the derived mass and centre of gravity take it), derived again. Each thing at
   * its whole weight (massOf: all of a stack, a box with what is in it): weigh again when a thing comes or
   * goes, and also when one that rides here changes in itself (some taken off a stack, a thing put into a box).
   */
  /** the systems' own loads on a vehicle (a trailer on its hitch: the tow system), weighed with what rides in it */
  readonly extraLoads: ((v: ModVehicle) => readonly CargoMass[])[] = [];

  weigh(v: ModVehicle): void {
    const cargo: CargoMass[] = [];
    for (const f of this.extraLoads) cargo.push(...f(v));
    v.view.model.updateMatrix();
    const inv = new THREE.Matrix4().copy(v.view.model.matrix).invert();
    for (const l of this.ridersOf(v)) {
      const p = new THREE.Vector3().copy(l.riding!.pos).applyMatrix4(inv);
      cargo.push({ m: massOf(heldOf(l)), x: p.x, y: p.y + (l.mid ?? 0.1), z: p.z });
    }
    const was = v.build.cargo ?? [];
    const same = was.length === cargo.length && was.every((c, i) => Math.abs(c.m - cargo[i].m) < 0.01 && Math.abs(c.x - cargo[i].x) < 0.01);
    if (same) return;
    v.build.cargo = cargo;
    v.sys.rebuild();
    v.awake = Math.max(v.awake, 1);
  }

  /** what the load weighs (kg), as last weighed (asked every frame its list is open: nothing is allocated) */
  loadOf(v: ModVehicle): number {
    const cargo = v.build.cargo;
    let kg = 0;
    if (cargo) for (let i = 0; i < cargo.length; i++) kg += cargo[i].m;
    return kg;
  }

  // ------------------------------------------------------------------ the box of a thing

  /** a thing's box as it lies (its model's bounds, wheels on their side); null while the model loads */
  /** a thing's box once its model is in (boxOf: null until then) */
  async measured(h: NonNullable<Held>): Promise<ThingBox | null> {
    const now = this.boxOf(h);
    if (now) return now;
    const obj = await this.loose.objectFor(h);
    obj.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(obj);
    if (b.isEmpty()) return null;
    const box = { minX: b.min.x, maxX: b.max.x, minY: b.min.y, maxY: b.max.y, minZ: b.min.z, maxZ: b.max.z };
    this.boxes.set(boxKey(h), box);
    return box;
  }

  boxOf(h: NonNullable<Held>): ThingBox | null {
    const key = boxKey(h);
    if (this.boxes.has(key)) return this.boxes.get(key) ?? null;
    this.boxes.set(key, null);
    void this.loose.objectFor(h).then((obj) => {
      obj.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(obj);
      if (b.isEmpty()) return;
      this.boxes.set(key, { minX: b.min.x, maxX: b.max.x, minY: b.min.y, maxY: b.max.y, minZ: b.min.z, maxZ: b.max.z });
    });
    return null;
  }

  // ------------------------------------------------------------------ aiming into a zone

  /**
   * The zone of a vehicle near the line of sight (render space ray) and where the held thing would go
   * in it: under the point one looks at on its floor, or the nearest spot round it it fits. yaw: the turn
   * asked for (the wheel), relative to the vehicle.
   */
  aim(vehicles: readonly ModVehicle[], ray: THREE.Ray, held: NonNullable<Held>, yaw: number, reach = AIM_REACH, inside: ModVehicle | null = null, exact?: { grid: number }): StowAim | null {
    let best: StowAim | null = null;
    const box = this.boxOf(held);
    const carry = carryOf(held);
    for (const v of vehicles) {
      const zones = zonesFor(v.view.frame.id, v.build);
      if (!zones.length) continue;
      const model = v.view.model;
      model.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
      const o = new THREE.Vector3().copy(ray.origin).applyMatrix4(inv);
      const d = new THREE.Vector3().copy(ray.direction).transformDirection(inv);
      for (const zone of zones) {
        // (a living space's walls: hung on, not stood on — wallAim)
        if (zone.wall) continue;
        // the ray into the zone's box
        const t = slab(o, d, zone);
        if (!t || t[0] > reach) continue;
        if (best && t[0] >= best.dist) continue;
        const g = this.grid(v, zone);
        // the first point along it that is at or below the floor there: what one looks at
        let near: { x: number; z: number } | null = null;
        // (how far along the ray it lands: the zone it lands in first is the one aimed at, not the first one it
        // enters — one may stand inside a living space's zone)
        let land = Infinity;
        const t1 = Math.min(t[1], reach + 1);
        for (let s = Math.max(0, t[0]); s <= t1; s += 0.02) {
          const x = o.x + d.x * s;
          const y = o.y + d.y * s;
          const z = o.z + d.z * s;
          const f = gridAt(g, x, z);
          if (!Number.isNaN(f) && y <= f + 0.02) {
            near = { x, z };
            land = s;
            break;
          }
        }
        if (!near) {
          const s = Math.min(t[1], reach);
          near = { x: clamp(o.x + d.x * s, zone.x[0], zone.x[1]), z: clamp(o.z + d.z * s, zone.z[0], zone.z[1]) };
          land = 100 + Math.max(t[0], s);
        }
        if (best && land >= best.dist) continue;
        let spot: Spot | null = null;
        let why = '';
        if (zoneLidless(v.view.frame.id, zone, v.build)) why = LIDLESS_WHY;
        else if (!zoneTakes(zone, carry)) why = '太大了';
        else if (!box) why = '放不下';
        else {
          spot = exact ? findSpot(zone, g, box, yaw, near, this.placedIn(v, zone.id), exact.grid, true) : findSpot(zone, g, box, yaw, near, this.placedIn(v, zone.id), zone.grid ?? AIM_GRID);
          if (!spot) why = exact ? '挡住了' : '放不下';
        }
        best = { v, zone, spot, why, dist: land };
      }
      // the walls of a living space one stands in, when the mark is on one nearer than any floor
      const wall = v === inside ? this.wallAim(v, ray, held, reach) : null;
      if (wall && (!best || wall.dist < best.dist)) best = wall;
    }
    return best;
  }

  /** the systems' rules for what hangs on a living space's walls (true: it does, false: it does not, null: the game's own rule) */
  readonly wallRules: ((held: NonNullable<Held>, box: ThingBox) => boolean | null)[] = [];

  /**
   * Placing just so (docs/V3/plan/prompts.md §四): where the line of sight (render space ray) lands on the floor of one of
   * the vehicles' places for things within reach — the zone, the point of its floor (frame model space) and how far along
   * the ray — the nearest of them, not one behind what of the vehicle the line of sight meets first (`los`, render metres:
   * a motorhome's back shut, its rear bench behind it is not aimed at); or, standing in a living space, the spot on its
   * wall it meets (wallAim). Null: none. Not where the ray only passes through a zone's box without coming down on its floor.
   */
  landing(vehicles: readonly ModVehicle[], ray: THREE.Ray, held: NonNullable<Held>, reach: number, inside: ModVehicle | null, los: number): { v: ModVehicle; zone: CargoZone; x: number; z: number; dist: number } | StowAim | null {
    let best: { v: ModVehicle; zone: CargoZone; x: number; z: number; dist: number } | StowAim | null = null;
    const o = this.v3;
    const d = this.v3b;
    for (const v of vehicles) {
      const zones = zonesFor(v.view.frame.id, v.build);
      if (!zones.length) continue;
      const model = v.view.model;
      model.updateMatrixWorld(true);
      this.m4.copy(model.matrixWorld).invert();
      o.copy(ray.origin).applyMatrix4(this.m4);
      d.copy(ray.direction).transformDirection(this.m4);
      for (const zone of zones) {
        if (zone.wall) continue;
        const t = slab(o, d, zone);
        if (!t || t[0] > reach) continue;
        if (best && t[0] >= best.dist) continue;
        const g = this.grid(v, zone);
        const t1 = Math.min(t[1], reach + 1);
        let hitRoof = false;
        for (let s = Math.max(0, t[0]); s <= t1; s += 0.02) {
          const x = o.x + d.x * s;
          const y = o.y + d.y * s;
          const z = o.z + d.z * s;
          const f = gridAt(g, x, z);
          if (Number.isNaN(f) || y > f + 0.02) continue;
          // (behind the vehicle's own wall or seat back: not this one)
          if (s <= los + 0.06 && (!best || s < best.dist)) {
            best = { v, zone, x, z, dist: s };
            hitRoof = true;
          }
          break;
        }
        // Standing beside a car looking across/up at its roof rack (eye <= rack height): land directly on the rack deck.
        if (!hitRoof && zone.id === 'roof') {
          const sHit = Math.abs(d.y) > 1e-4 ? (zone.floor - o.y) / d.y : (t[0] + t1) * 0.5;
          const sUse = sHit >= Math.max(0, t[0] - 0.15) && sHit <= t1 ? sHit : Math.max(0, t[0] + Math.min(0.35, (t1 - t[0]) * 0.5));
          if (sUse <= reach && (!best || sUse < best.dist)) {
            const rx = Math.max(zone.x[0], Math.min(zone.x[1], o.x + d.x * sUse));
            const rz = Math.max(zone.z[0], Math.min(zone.z[1], o.z + d.z * sUse));
            best = { v, zone, x: rx, z: rz, dist: sUse };
          }
        }
      }
      const wall = v === inside ? this.wallAim(v, ray, held, reach) : null;
      if (wall && wall.dist <= los + 0.06 && (!best || wall.dist < best.dist)) best = wall;
    }
    return best;
  }

  /** the height a thing would rest at in a zone with its origin at (x, z) turned yaw (frame model space), clear of what is there; null: it does not fit */
  restIn(v: ModVehicle, zone: CargoZone, held: NonNullable<Held>, x: number, z: number, yaw: number): number | null {
    const box = this.boxOf(held);
    if (!box || !zoneTakes(zone, carryOf(held))) return null;
    return restAt(zone, this.grid(v, zone), box, x, z, yaw, this.placedIn(v, zone.id));
  }

  private readonly wallRay = new THREE.Raycaster();
  /**
   * The last cast into a living space's frame and what it hit: the cast is the costly part of wallAim (every face of the
   * frame's merged meshes, ~2.7 ms in a motorhome), and one standing at a worktop with something in the hands looks the
   * same way frame after frame — the same line of sight (to a tenth of a millimetre), the frame where it was: the same hit.
   */
  private readonly wallMemo = { frame: null as THREE.Object3D | null, o: new THREE.Vector3(NaN, 0, 0), d: new THREE.Vector3(), far: 0, m: new THREE.Matrix4(), hit: undefined as THREE.Intersection | undefined };
  /** the frame where it was a moment ago: a vehicle standing still settles by micrometres every step (within a twentieth of a millimetre) */
  private static stillAs(a: THREE.Matrix4, b: THREE.Matrix4): boolean {
    const x = a.elements;
    const y = b.elements;
    for (let i = 0; i < 16; i++) if (Math.abs(x[i] - y[i]) > 5e-5) return false;
    return true;
  }
  private readonly wallInv = new THREE.Matrix4();
  private readonly wallN = new THREE.Vector3();
  private readonly wallP = new THREE.Vector3();
  /**
   * Where a thing would hang on the wall of a vehicle's living space the ray meets (docs/V3/nodes/M2-rv.md): the
   * first face of its inside the ray hits within reach, if it stands upright and within the walls' zone; the thing
   * with its back to it (things face +x), at the height aimed at, to the 10 cm grid; not over another hung there.
   */
  private wallAim(v: ModVehicle, ray: THREE.Ray, held: NonNullable<Held>, reach: number): StowAim | null {
    const zone = zonesFor(v.view.frame.id, v.build).find((z) => z.wall);
    // (the frame's own meshes as drawn — its body and its inside, merged by material: carMerge.ts)
    const frame = zone ? v.view.root.getObjectByName('FRAME') : null;
    if (!zone || !frame) return null;
    const box = this.boxOf(held);
    if (!box) return null;
    // (a system's rule for its own kinds first: docs/ND/PLAN.md, Nomad Drive's walls; else the game's: nothing large, nothing a metre tall)
    let takes: boolean | null = null;
    for (const rule of this.wallRules) {
      takes = rule(held, box);
      if (takes !== null) break;
    }
    if (!takes) return null;
    const rc = this.wallRay;
    rc.ray.copy(ray);
    rc.far = reach;
    // (the first face of the frame the mark is on, glass passed over: nothing is hung on a window)
    let hit: THREE.Intersection | undefined;
    const M = this.wallMemo;
    frame.updateMatrixWorld(true);
    if (M.frame === frame && M.far === reach && M.o.distanceToSquared(ray.origin) < 1e-8 && M.d.distanceToSquared(ray.direction) < 1e-10 && CargoBay.stillAs(M.m, frame.matrixWorld)) hit = M.hit;
    else {
      for (const h of rc.intersectObject(frame, true)) {
        const mat = (h.object as THREE.Mesh).material as THREE.Material | undefined;
        if (h.object.name.includes('glass') || mat?.name?.includes('glass')) continue;
        hit = h;
        break;
      }
      M.frame = frame;
      M.far = reach;
      M.o.copy(ray.origin);
      M.d.copy(ray.direction);
      M.m.copy(frame.matrixWorld);
      M.hit = hit;
    }
    if (!hit?.face) return null;
    const model = v.view.model;
    model.updateMatrixWorld(true);
    this.wallInv.copy(model.matrixWorld).invert();
    const n = this.wallN.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).transformDirection(this.wallInv);
    // (facing the one who aims: the face's own normal may point either way)
    if (n.dot(this.wallP.copy(ray.direction).transformDirection(this.wallInv)) > 0) n.negate();
    if (Math.abs(n.y) > 0.35) return null;
    n.y = 0;
    n.normalize();
    const p = this.wallP.copy(hit.point).applyMatrix4(this.wallInv);
    if (p.x < zone.x[0] || p.x > zone.x[1] || p.z < zone.z[0] || p.z > zone.z[1]) return null;
    const snap = (u: number): number => Math.round(u / AIM_GRID) * AIM_GRID;
    // the height to the grid, kept within the zone's band; along the wall to the grid — the room's own squares: its
    // floor's, from its rear left corner (docs/V3/plan/finish.md §十一 3.5; core cargo.ts latticeOrigin)
    const at = latticeOrigin(v.view.frame.id);
    const hy = Math.min(zone.top - (box.maxY - box.minY) / 2, Math.max(zone.floor + (box.maxY - box.minY) / 2, snap(p.y)));
    const yaw = Math.atan2(-n.z, n.x);
    const out = -box.minX + 0.01;
    const sx = Math.abs(n.x) > 0.7 ? p.x : snap(p.x - at.x) + at.x;
    const sz = Math.abs(n.z) > 0.7 ? p.z : snap(p.z - at.z) + at.z;
    const spot: Spot = { x: sx + n.x * out, y: hy - (box.minY + box.maxY) / 2, z: sz + n.z * out, yaw };
    // (not over another thing hung there)
    let why = '';
    const r = Math.max(box.maxX - box.minX, box.maxZ - box.minZ, box.maxY - box.minY) / 2;
    for (const q of this.placedIn(v, zone.id)) {
      const qr = Math.max(q.box.maxX - q.box.minX, q.box.maxZ - q.box.minZ, q.box.maxY - q.box.minY) / 2;
      if (Math.hypot(q.x - spot.x, q.y - spot.y, q.z - spot.z) < (r + qr) * 0.85) {
        why = '挂不下';
        break;
      }
    }
    return { v, zone, spot: why ? null : spot, why, dist: hit.distance };
  }

  /** packed in without aiming: the first zone in order with room (null: none) */
  packSpot(v: ModVehicle, held: NonNullable<Held>): { zone: CargoZone; spot: Spot } | null {
    // (its model not measured yet: a box about its size, on the safe side)
    const box = this.boxOf(held) ?? roughBox(carryOf(held));
    const carry = carryOf(held);
    const zones = [...zonesFor(v.view.frame.id, v.build)].sort((a, b) => a.order - b.order);
    for (const zone of zones) {
      if (zone.wall || !zoneTakes(zone, carry) || zoneLidless(v.view.frame.id, zone, v.build)) continue;
      const spot = findSpot(zone, this.grid(v, zone), box, 0, null, this.placedIn(v, zone.id));
      if (spot) return { zone, spot };
    }
    return null;
  }

  /**
   * Where a thing would go in one zone of a vehicle (null: no room there, or no such zone): near a point of it (frame
   * model space) turned by yaw, as aiming puts it (to its grid; 0: just there), or packed in as packSpot packs. The developer's tabs.
   */
  spotIn(v: ModVehicle, zoneId: string, held: NonNullable<Held>, near: { x: number; z: number } | null = null, yaw = 0, grid?: number): { zone: CargoZone; spot: Spot } | null {
    const zs = zonesFor(v.view.frame.id, v.build);
    let zone = zs.find((z) => z.id === zoneId);
    if (!zone && (zoneId === 'fore' || zoneId === 'lounge')) zone = zs.find((z) => z.id === 'cabin');
    grid ??= zone?.grid ?? AIM_GRID;
    if (!zone || zone.wall || !zoneTakes(zone, carryOf(held)) || zoneLidless(v.view.frame.id, zone, v.build)) return null;
    const box = this.boxOf(held) ?? roughBox(carryOf(held));
    const spot = findSpot(zone, this.grid(v, zone), box, yaw, near, this.placedIn(v, zone.id), near ? grid : 0);
    return spot ? { zone, spot } : null;
  }

  /** put the held thing at a spot of a zone: a loose thing riding the vehicle from now on */
  stow(v: ModVehicle, zone: CargoZone, spot: Spot, held: NonNullable<Held>): Loose {
    const model = v.view.model;
    model.updateMatrixWorld(true);
    v.view.root.updateMatrixWorld(true);
    // the spot (model space) → the carrier's frame (view.root); laid on its side if it must
    const local = this.m4b.makeRotationY(spot.yaw).multiply(lieMatrix(spot.lie)).setPosition(spot.x, spot.y, spot.z);
    model.updateMatrix();
    const inRoot = new THREE.Matrix4().multiplyMatrices(model.matrix, local);
    const pos = new THREE.Vector3();
    const rot = new THREE.Quaternion();
    inRoot.decompose(pos, rot, new THREE.Vector3());
    const w = new THREE.Vector3().copy(pos).applyMatrix4(v.view.root.matrixWorld);
    const o = this.core.origin;
    const l = held.kind === 'part' ? this.loose.addPart(held.inst, w.x + o.x, w.y + o.y, w.z + o.z) : held.kind === 'item' ? this.loose.addItem(held.item, w.x + o.x, w.y + o.y, w.z + o.z) : this.loose.addTool(held.tool, w.x + o.x, w.y + o.y, w.z + o.z);
    this.loose.ride(l, v, { pos, rot });
    l.stow = zone.id;
    l.lie = spot.lie;
    l.box = this.boxOf(held) ?? undefined;
    this.weigh(v);
    return l;
  }

  // ------------------------------------------------------------------ the ghost

  /** show the held thing where it would go (null: hide it) */
  showGhost(aim: StowAim | null, held: Held): void {
    const want = aim && held ? `${boxKey(held)}` : '';
    if (!want) {
      if (this.ghost) this.ghost.group.visible = false;
      return;
    }
    if (!this.ghost || this.ghost.key !== want) {
      this.ghost?.group.removeFromParent();
      const group = new THREE.Group();
      group.name = 'ghost:stow';
      group.visible = false;
      this.core.scene.add(group);
      const g = { key: want, group, kind: 'empty' as 'empty' | 'blocked' };
      this.ghost = g;
      const token = ++this.ghostToken;
      void this.loose.objectFor(held!).then((obj) => {
        if (this.ghostToken !== token || this.ghost !== g) return;
        applyGhost(obj, g.kind, true);
        group.add(obj);
      });
    }
    const g = this.ghost;
    const spot = aim!.spot;
    const kind = spot ? 'empty' : 'blocked';
    if (kind !== g.kind && g.group.children[0]) applyGhost(g.group.children[0], kind, true);
    g.kind = kind;
    if (!spot) {
      g.group.visible = false;
      return;
    }
    const model = aim!.v.view.model;
    model.updateMatrixWorld(true);
    const m = this.m4b.makeRotationY(spot.yaw).multiply(lieMatrix(spot.lie)).setPosition(spot.x, spot.y, spot.z).premultiply(model.matrixWorld);
    m.decompose(g.group.position, g.group.quaternion, g.group.scale);
    g.group.visible = true;
  }
}

/** the turn that lays a thing on its side (cargo.ts lieBox) */
function lieMatrix(lie: Lie | undefined): THREE.Matrix4 {
  if (lie === 'z') return new THREE.Matrix4().makeRotationZ(Math.PI / 2);
  if (lie === 'x') return new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  return new THREE.Matrix4();
}

/** a mesh of glass (by its name or its material's, as the frame's merge names them) */
function isGlass(o: THREE.Object3D): boolean {
  const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
  const mat = Array.isArray(m) ? m[0] : m;
  return o.name.includes('glass') || !!mat?.name?.includes('glass');
}

/** a box on the safe side for a thing whose model is not measured yet */
function roughBox(carry: 'small' | 'medium' | 'large'): ThingBox {
  const [w, h] = carry === 'large' ? [0.7, 0.6] : carry === 'medium' ? [0.45, 0.45] : [0.3, 0.3];
  return { minX: -w / 2, maxX: w / 2, minY: 0, maxY: h, minZ: -w / 2, maxZ: w / 2 };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** where a ray (model space) enters and leaves a zone's box: [tIn, tOut], or null */
function slab(o: THREE.Vector3, d: THREE.Vector3, zone: CargoZone): [number, number] | null {
  let t0 = -Infinity;
  let t1 = Infinity;
  const lo = [zone.x[0], zone.floor - 0.25, zone.z[0]];
  const hi = [zone.x[1], zone.top, zone.z[1]];
  const os = [o.x, o.y, o.z];
  const ds = [d.x, d.y, d.z];
  for (let k = 0; k < 3; k++) {
    if (Math.abs(ds[k]) < 1e-9) {
      if (os[k] < lo[k] || os[k] > hi[k]) return null;
      continue;
    }
    let a = (lo[k] - os[k]) / ds[k];
    let b = (hi[k] - os[k]) / ds[k];
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  if (t1 < 0) return null;
  return [t0, t1];
}
