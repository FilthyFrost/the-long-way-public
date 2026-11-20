/**
 * The starting garage (docs/MODCAR.md §9): a timber workshop with its big doors to the road, where
 * the first car is put together. The model and its layout come from tools/blender/garage (the GLB
 * public/models/modcar/garage/garage.glb and src/game/modcar/data/garage.json); this file brings
 * them to life: the light inside (the room's openings and lamps, shaderlib.ts), the sliding doors and
 * their button, the light switch, the battery charger, the walls that keep the walker and the cars
 * in (or out), the yard and the country round it (garageOutdoors.ts).
 *
 * World frame = the layout's: x towards the door and the road, y up, z right; floor at y = 0.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { partDef } from '../../core/modcar/parts';
import type { Text } from '../../core/modcar/types';
import { FunctionLand, type Land } from '../../core/onfoot/land';
import { Solid, type SolidSource } from '../../core/world/solids';
import { SURFACES, type Ground, type GroundSample } from '../../core/world/ground';
import type { RenderCore } from '../render/core';
import { globals, ROOM_LAMPS, ROOM_OPENINGS } from '../render/shaderlib';
import { LAYER_SHADOW_FAR, LAYER_SHADOW_NEAR } from '../render/shadow';
import { put3, put4 } from '../render/uniformArrays';
import layoutJson from './data/garage.json';
import type { GarageContext, GarageDevice, GarageScene } from './garageStub';
import { GarageLook } from './garageLook';
import { beamUniforms, buildBeams, buildDust } from './garageBeams';
import { Chalkboard } from './garageChalk';
import { Plates, Sign, YardLight } from './garageFront';
import { buildSmoke } from './garageSmoke';
import { Swallows } from './garageBirds';
import { Machines } from './garageMachines';
import { buildOutdoors, surfaceKind, visibleHeight, type Outdoors } from './garageOutdoors';
import type { ModVehicle } from './vehicle';

// ------------------------------------------------------------------ the layout file

type V3 = [number, number, number];
interface Opening {
  id: string;
  a: V3;
  u: V3;
  v: V3;
  sky: number;
}
interface Layout {
  room: { min: V3; max: V3; edge: number };
  openings: Opening[];
  door: { x: number; z: number; h: number };
  doors: { leaves: Record<string, number>; travel: number; width: number; x: number; height: number; open: Record<string, number> };
  /** [x, z, hx, hz, y0, y1, floor, yaw] */
  solids: number[][];
  surfaces: { x0: number; x1: number; z0: number; z1: number; y: number; name: string }[];
  spots: { x: number; y: number; z: number; yaw: number; where: string }[];
  devices: { id: string; x: number; y: number; z: number; radius: number }[];
  lamps: { pos: V3; colour: V3; reach: number; down: number; kind: string }[];
  carSpot: { x: number; z: number; yaw: number };
  bay2: { x: number; z: number; yaw: number };
  spawn: { x: number; z: number; heading: number };
  exitX: number;
  chalkboard?: { x: number; y: number; z: number; w: number; h: number };
  /** the stove's fire (in front of its door), the board over the doors, the lamp over them outside */
  stove?: { x: number; y: number; z: number };
  sign?: { x: number; y: number; z: number; w: number; h: number };
  outlamp?: { x: number; y: number; z: number };
  /** number plates nailed on the front wall (garageFront.ts paints them) */
  plates?: { x: number; y: number; z: number; rot: number; kind: number }[];
  /** the top of the stove's chimney, where its smoke comes out */
  chimney?: { x: number; y: number; z: number };
  /** where a car stands between the lift's posts */
  liftBay?: { x: number; z: number };
}

const LAYOUT = layoutJson as unknown as Layout;
const MODEL_URL = '/models/modcar/garage/garage.glb';

// ------------------------------------------------------------------ ground and walls

/** the garage stage's ground for the wheels: the slab, the yard, the road, the meadow round them */
class GarageGround implements Ground {
  sample(x: number, z: number, out: GroundSample): void {
    const e = 0.08;
    const h = visibleHeight(x, z);
    const hx = visibleHeight(x + e, z) - h;
    const hz = visibleHeight(x, z + e) - h;
    const inv = 1 / Math.sqrt(hx * hx + e * e + hz * hz);
    out.h = h;
    out.nx = -hx * inv;
    out.ny = e * inv;
    out.nz = -hz * inv;
    const s = surfaceKind(x, z);
    out.surface = s;
    out.mu = SURFACES[s].mu;
    out.rr = SURFACES[s].rr;
  }
}

class Boxes implements SolidSource {
  readonly list: Solid[] = [];
  add(x: number, z: number, hx: number, hz: number, y0: number, y1: number, floor = false, yaw = 0, tag = 'garage'): Solid {
    const s = new Solid().set(x, z, hx, hz, yaw, y0, y1, floor, tag);
    this.list.push(s);
    return s;
  }
  solidsNear(x: number, z: number, r: number, out: Solid[]): void {
    for (const s of this.list) {
      const reach = s.hz === 0 ? s.hx : Math.hypot(s.hx, s.hz);
      if (Math.abs(s.x - x) < reach + r + 0.1 && Math.abs(s.z - z) < reach + r + 0.1) out.push(s);
    }
  }
}

// ------------------------------------------------------------------ the garage

const text = (zh: string, en: string): Text => ({ zh, en });
const LAMP_ON = { r: 1.0, g: 1.0, b: 1.0 };
/** how strongly the pendants light the room (linear radiance × this at a metre, roughly) */
const LAMP_POWER = 5.0;
/** × each lamp's reach: a pool under each, the dark between them */
const LAMP_REACH = 0.85;
/** the wide shadow map's reach over the workshop (m round the room's middle): 2 cm texels */
const ROOM_SHADOW_REACH = 22;
/** how thick the air is with dust by day (garageBeams.ts) */
const BEAM_DENSITY = 0.1;
/** the stove's glow on the floor and the back wall (its colour × this; it flickers) */
const STOVE_POWER = 1.15;
const STOVE_COLOUR: V3 = [1.0, 0.42, 0.13];
/** the lamp over the doors outside, lit from dusk (a photocell) */
const OUTLAMP_POWER = 4.0;
const OUTLAMP_COLOUR: V3 = [1.0, 0.74, 0.45];
/** the lit room seen through the open doors at night, as it falls on the yard (× the lamps) */
const DOOR_SPILL: V3 = [4.0, 2.8, 1.5];

export function buildGarage(core: RenderCore): GarageScene {
  return new Garage(core);
}

class Garage implements GarageScene {
  readonly root = new THREE.Group();
  readonly solids = new Boxes();
  readonly ground: Ground = new GarageGround();
  readonly land: Land = new FunctionLand((x, z) => visibleHeight(x, z));
  readonly spawn = LAYOUT.spawn;
  readonly carSpot = LAYOUT.carSpot;
  readonly bay2 = LAYOUT.bay2;
  readonly spots = LAYOUT.spots.map((s) => ({ ...s, where: s.where as 'floor' | 'bench' | 'shelf' }));
  readonly exitX = LAYOUT.exitX;
  readonly devices: GarageDevice[] = [];
  readonly ready: Promise<void>;
  private readonly look = new GarageLook();
  /** (shadow casters draw with the shadow pass's own material: this one is never seen) */
  private readonly casterMat = new THREE.MeshBasicMaterial();
  private readonly outdoors: Outdoors;
  /** moving pieces of the model by name (DOOR_L, DOOR_R, CHG_NEEDLE, …) */
  private readonly movers = new Map<string, THREE.Object3D>();
  private readonly moverRest = new Map<string, THREE.Vector3>();
  /** the doors: how far each leaf is open (0 … 1), and where it is going */
  private readonly leaf: Record<string, { t: number; target: number; solid: Solid }> = {};
  private doorMoving = 0;
  lampsOn = true;
  /** the generator outside runs (workshop.ts): without it the lamps stay dark and the charger does not charge */
  power = true;
  private lampLevel = 1;
  private readonly moreSurfaces: { x0: number; x1: number; z0: number; z1: number; y: number }[] = [];
  private chargeShown = -1;
  private time = 0;
  private ctx: GarageContext | null = null;
  private disposed = false;
  private readonly machines: Machines;
  private readonly chalk: Chalkboard | null;
  private readonly sign: Sign | null;
  private readonly plates: Plates | null;
  private readonly smoke: THREE.Mesh | null;
  private readonly birds = new Swallows();
  /** dark enough out for the lamp over the doors, and for the swallows to roost */
  private night = false;
  private readonly yard = new YardLight();
  /** the lamp over the doors: how far it has warmed up (0 … 1) */
  private outLamp = 0;

  constructor(private readonly core: RenderCore) {
    this.root.name = 'garage';
    core.scene.add(this.root);
    core.place(this.root, 0, 0, 0);
    for (const s of LAYOUT.solids) this.solids.add(s[0], s[1], s[2], s[3], s[4], s[5], s[6] === 1, s[7] ?? 0);
    // the door leaves stand in the way while they are shut (moved with them)
    const d = LAYOUT.doors;
    for (const [name, side] of Object.entries(d.leaves)) {
      const solid = this.solids.add(d.x, (side * d.width) / 2, 0.06, d.width / 2, 0, d.height, false, 0, 'garage:door');
      const t = d.open[name] ?? 0;
      this.leaf[name] = { t, target: t, solid };
    }
    this.outdoors = buildOutdoors(this.root);
    // the sun's beams and the dust in them need the shadow maps (none at low quality)
    if (core.shadows) {
      this.root.add(buildBeams());
      this.root.add(buildDust(LAYOUT.room.min, LAYOUT.room.max));
    }
    this.makeDevices();
    this.machines = new Machines({
      movers: this.movers,
      rest: this.moverRest,
      look: this.look,
      device: (id) => LAYOUT.devices.find((d) => d.id === id) ?? null,
      surface: (name) => LAYOUT.surfaces.find((x) => x.name === name) ?? null,
      liftBay: LAYOUT.liftBay ?? null,
    });
    this.devices.push(...this.machines.devices);
    this.chalk = LAYOUT.chalkboard ? new Chalkboard(LAYOUT.chalkboard) : null;
    if (this.chalk) this.root.add(this.chalk.mesh);
    this.sign = LAYOUT.sign ? new Sign(LAYOUT.sign) : null;
    if (this.sign) this.root.add(this.sign.mesh);
    this.root.add(this.yard.mesh);
    this.plates = LAYOUT.plates?.length ? new Plates(LAYOUT.plates) : null;
    if (this.plates) this.root.add(this.plates.mesh);
    this.smoke = LAYOUT.chimney ? buildSmoke(LAYOUT.chimney) : null;
    if (this.smoke) this.root.add(this.smoke);
    this.root.add(this.birds.mesh);
    this.ready = this.load();
    this.placeLeaves();
  }

  // ------------------------------------------------------------------ the model

  private async load(): Promise<void> {
    const gltf = await new GLTFLoader().loadAsync(MODEL_URL).catch(() => null);
    if (this.disposed) return;
    if (!gltf) {
      console.warn('garage: no model at', MODEL_URL);
      return;
    }
    const shadowGeos: THREE.BufferGeometry[] = [];
    const statics: THREE.Mesh[] = [];
    gltf.scene.updateMatrixWorld(true);
    let caster: THREE.Mesh | null = null;
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      // the shadow caster: the big things without their bevels, only ever drawn into the shadow maps
      if (mesh.name === 'S_shadow') {
        caster = mesh;
        mesh.material = this.casterMat;
        mesh.layers.set(LAYER_SHADOW_FAR);
        mesh.layers.enable(LAYER_SHADOW_NEAR);
        mesh.frustumCulled = false;
        return;
      }
      // the corner colour is the tint (rgb) and the baked AO (alpha): our shaders read it as aTintAO
      const col = mesh.geometry.getAttribute('color');
      if (col) {
        mesh.geometry.setAttribute('aTintAO', col);
        mesh.geometry.deleteAttribute('color');
      } else mesh.geometry.setAttribute('aTintAO', new THREE.Float32BufferAttribute(new Float32Array(mesh.geometry.getAttribute('position').count * 4).fill(1), 4));
      const src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const name = src.name || 'prop';
      mesh.material = this.look.get(name);
      if (moverOf(mesh)) return;
      statics.push(mesh);
      // (an older model without a caster of its own: everything that stands still casts, merged)
      if (name !== 'win_glass' && name !== 'skylight' && name !== 'glass' && name !== 'bulb' && name !== 'floor') {
        const g = mesh.geometry.clone();
        g.applyMatrix4(mesh.matrixWorld);
        for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
        g.morphAttributes = {};
        shadowGeos.push(g.index ? g.toNonIndexed() : g);
      }
    });
    if (caster) {
      for (const g of shadowGeos) g.dispose();
      shadowGeos.length = 0;
    }
    // the movers: one group per piece (its meshes, one per material, share the piece's origin)
    const pieces: THREE.Object3D[] = [];
    gltf.scene.traverse((o) => {
      if (o !== gltf.scene && moverKey(o)) pieces.push(o);
    });
    for (const o of pieces) {
      const key = moverKey(o)!;
      let g = this.movers.get(key);
      if (!g) {
        g = new THREE.Group();
        g.name = key;
        g.position.copy(o.position);
        o.parent!.add(g);
        this.movers.set(key, g);
        this.moverRest.set(key, g.position.clone());
      }
      g.attach(o);
    }
    // the doors cast their shadows through one merged mesh each (the small movers cast none)
    for (const [key, g] of this.movers) {
      if (!key.startsWith('DOOR_')) continue;
      const geos: THREE.BufferGeometry[] = [];
      g.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
      g.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const geo = mesh.geometry.clone();
        geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld));
        for (const k of Object.keys(geo.attributes)) if (k !== 'position') geo.deleteAttribute(k);
        geos.push(geo.index ? geo.toNonIndexed() : geo);
      });
      const merged = geos.length ? mergeGeometries(geos, false) : null;
      for (const geo of geos) geo.dispose();
      if (!merged) continue;
      const caster = new THREE.Mesh(merged, this.casterMat);
      caster.name = `${key}:shadow`;
      caster.layers.set(LAYER_SHADOW_FAR);
      caster.layers.enable(LAYER_SHADOW_NEAR);
      g.add(caster);
    }
    this.root.add(gltf.scene);
    if (shadowGeos.length) {
      const merged = mergeGeometries(shadowGeos, false);
      for (const g of shadowGeos) g.dispose();
      if (merged) {
        const caster = new THREE.Mesh(merged, this.casterMat);
        caster.name = 'garage:shadow';
        caster.layers.set(LAYER_SHADOW_FAR);
        caster.layers.enable(LAYER_SHADOW_NEAR);
        caster.frustumCulled = false;
        this.root.add(caster);
      }
    }
    for (const m of statics) m.matrixAutoUpdate = false;
    this.placeLeaves();
  }

  // ------------------------------------------------------------------ devices

  private makeDevices(): void {
    const at = (id: string): { x: number; y: number; z: number; radius: number } => {
      const d = LAYOUT.devices.find((x) => x.id === id);
      if (!d) throw new Error(`garage layout: no device ${id}`);
      return d;
    };
    const self = this;
    const door = at('door');
    this.devices.push({
      id: 'door',
      x: door.x,
      y: door.y,
      z: door.z,
      radius: door.radius,
      get word(): Text {
        return self.doorsOpen() ? text('按下 · 关上大门', 'Press · close the big doors') : text('按下 · 打开大门', 'Press · open the big doors');
      },
      get state(): Text {
        return self.doorsOpen() ? text('大门开着：车能开出去', 'The doors are open') : text('大门关着', 'The doors are shut');
      },
      use: () => this.toggleDoors(),
    });
    const sw = at('lights');
    this.devices.push({
      id: 'lights',
      x: sw.x,
      y: sw.y,
      z: sw.z,
      radius: sw.radius,
      get word(): Text {
        if (!self.power) return self.lampsOn ? text('关灯 · 没电（门外的发电机没开）', 'Lights off · no power') : text('开灯 · 没电（门外的发电机没开）', 'Lights on · no power');
        return self.lampsOn ? text('关灯', 'Lights off') : text('开灯', 'Lights on');
      },
      get state(): Text {
        if (!self.power) return text('没电：去门外把发电机拉着', 'No power: start the generator outside');
        return self.lampsOn ? text('灯开着', 'The lights are on') : text('灯关着', 'The lights are off');
      },
      use: () => {
        this.lampsOn = !this.lampsOn;
        this.ctx?.sound('switch');
        if (!this.power) this.ctx?.ui.say('没电：门外的发电机没开。拉一下启动绳就有电了。', 2.6);
      },
    });
    const ch = at('charger');
    this.devices.push({
      id: 'charger',
      x: ch.x,
      y: ch.y,
      z: ch.z,
      radius: ch.radius,
      get word(): Text {
        const b = self.batteryOnCharger();
        if (!b) return text('充电器 · 把电瓶放到上面的托盘里', 'Charger · put a battery on the tray');
        const c = Math.round((b.part!.fluids.charge ?? 0) * 100);
        if (!self.power) return text(`充电器 · 没电（电瓶 ${c}%）：先开门外的发电机`, `Charger · no power (${c}%)`);
        return c >= 99 ? text(`充电器 · 电瓶已充满`, 'Charger · battery full') : text(`充电器 · 正在充电 ${c}%`, `Charger · charging ${c}%`);
      },
      use: () => {},
    });
  }

  doorsOpen(): boolean {
    return Object.values(this.leaf).every((l) => l.target >= 0.99);
  }

  /** the button: open both leaves all the way, or (when they are open) shut them */
  toggleDoors(): void {
    const open = !this.doorsOpen();
    for (const l of Object.values(this.leaf)) l.target = open ? 1 : 0;
    this.doorMoving = 1;
    this.ctx?.sound('switch');
    this.ctx?.ui.say(open ? '大门慢慢滑开了。' : '大门关上了。', 2);
  }

  /** the gap between the leaves across the door opening (z from … to), 0 wide when shut */
  doorGap(): [number, number] {
    const d = LAYOUT.doors;
    const half = LAYOUT.door.z;
    const l = this.leaf.DOOR_L?.t ?? 1;
    const r = this.leaf.DOOR_R?.t ?? 1;
    return [-Math.min(half, l * d.travel), Math.min(half, r * d.travel)];
  }

  private placeLeaves(): void {
    const d = LAYOUT.doors;
    for (const [name, side] of Object.entries(d.leaves)) {
      const l = this.leaf[name];
      const e = l.t * l.t * (3 - 2 * l.t);
      const off = side * e * d.travel;
      const node = this.movers.get(name);
      const rest = this.moverRest.get(name);
      if (node && rest) node.position.set(rest.x, rest.y, rest.z + off);
      l.solid.z = (side * d.width) / 2 + off;
    }
  }

  private batteryOnCharger(): import('./loose').Loose | null {
    const s = LAYOUT.surfaces.find((x) => x.name === 'charger');
    const loose = this.ctx?.loose;
    if (!s || !loose) return null;
    for (const l of loose.list) {
      if (!l.part || partDef(l.part.part).cat !== 'battery') continue;
      if (l.x > s.x0 - 0.05 && l.x < s.x1 + 0.05 && l.z > s.z0 - 0.05 && l.z < s.z1 + 0.05 && Math.abs(l.y - s.y) < 0.3) return l;
    }
    return null;
  }

  // ------------------------------------------------------------------ every frame

  update(dt: number, ctx: GarageContext): void {
    this.ctx = ctx;
    this.time += dt;
    this.frameDt = dt;
    // the doors run on their motor
    let moving = false;
    for (const l of Object.values(this.leaf)) {
      if (l.t === l.target) continue;
      const step = dt * 0.3;
      l.t = l.target > l.t ? Math.min(l.target, l.t + step) : Math.max(l.target, l.t - step);
      moving = true;
    }
    if (moving || this.doorMoving) this.placeLeaves();
    this.doorMoving = moving ? 1 : 0;
    // the charger: a battery on its tray takes charge (full from flat in two minutes)
    const bat = this.batteryOnCharger();
    let charging = false;
    if (bat?.part && this.power) {
      const f = bat.part.fluids;
      const c = f.charge ?? 0;
      if (c < 0.999) {
        f.charge = Math.min(1, c + dt / 120);
        charging = true;
      }
    }
    const needle = this.movers.get('CHG_NEEDLE');
    const amps = charging ? 0.25 + 0.6 * (1 - (bat?.part?.fluids.charge ?? 1)) : 0;
    this.chargeShown += (amps - this.chargeShown) * Math.min(1, dt * 3);
    if (needle) needle.rotation.z = 0.9 - this.chargeShown * 1.8;
    const blink = charging ? (Math.sin(this.time * 4) > 0 ? 1 : 0.15) : bat ? 0 : 0;
    if (charging) this.look.setGlow('led', 2.4 * blink, 1.1 * blink, 0.15 * blink);
    else if (bat) this.look.setGlow('led', 0.3, 1.8, 0.4);
    else this.look.setGlow('led', 0, 0, 0);
    // the light switch's lever
    const sw = this.movers.get('LIGHT_SWITCH');
    if (sw) sw.rotation.z = this.lampsOn ? -0.35 : 0.35;
    // (the lamps come on with the power with a little flicker, as tubes do)
    const lit = this.lampsOn && this.power ? (this.lampLevel < 0.6 && Math.sin(this.time * 47) > 0.3 ? 0.35 : 1) : 0;
    this.lampLevel += (lit - this.lampLevel) * Math.min(1, dt * 12);
    for (const v of ctx.vehicles) this.keepIn(v);
    this.machines.update(dt, ctx);
    this.chalk?.show('让「方糖」跑起来', ctx.checklist());
    this.light();
    this.birds.update(dt, this.night);
  }

  /**
   * A vehicle stays inside the walls (or outside them), and can only pass the front where the doors
   * are open. Its body's plan corners are pushed back out of the wall and the speed into it is taken off.
   */
  private keepIn(v: ModVehicle): void {
    const sim = v.sim;
    const b = this.basis;
    sim.basis(b);
    const body = sim.spec.body;
    const fx = b[0];
    const fz = b[2];
    const fl = Math.hypot(fx, fz) || 1;
    const ax = fx / fl;
    const az = fz / fl;
    // corners in the body frame (origin at the centre of gravity)
    const cx = body.centerX;
    const pts: [number, number][] = [];
    for (const lx of [cx + body.halfLength, cx - body.halfLength]) for (const lz of [body.halfWidth, -body.halfWidth]) pts.push([sim.px + ax * lx - az * lz, sim.pz + az * lx + ax * lz]);
    const room = LAYOUT.room;
    const inner = { x0: room.min[0] + 0.12, x1: room.max[0] - 0.12, z0: room.min[2] + 0.12, z1: room.max[2] - 0.12 };
    const outer = { x0: inner.x0 - 0.45, x1: inner.x1 + 0.45, z0: inner.z0 - 0.45, z1: inner.z1 + 0.45 };
    const [g0, g1] = this.doorGap();
    const inside = sim.px > outer.x0 && sim.px < inner.x1 + 0.2 && sim.pz > outer.z0 && sim.pz < outer.z1;
    let dx = 0;
    let dz = 0;
    for (const [px, pz] of pts) {
      const inGap = pz > g0 + 0.05 && pz < g1 - 0.05;
      if (inside) {
        if (px > inner.x1 && !inGap && px < outer.x1 + 0.6) dx = Math.min(dx, inner.x1 - px);
        if (px < inner.x0) dx = Math.max(dx, inner.x0 - px);
        if (px < inner.x1) {
          if (pz < inner.z0) dz = Math.max(dz, inner.z0 - pz);
          if (pz > inner.z1) dz = Math.min(dz, inner.z1 - pz);
        }
      } else if (px > outer.x0 && px < outer.x1 && pz > outer.z0 && pz < outer.z1 && !(inGap && px > inner.x1 - 0.5)) {
        // from outside: out the way it came (the nearest face)
        const opts = [outer.x0 - px, outer.x1 - px, outer.z0 - pz, outer.z1 - pz];
        let best = 0;
        for (let i = 1; i < 4; i++) if (Math.abs(opts[i]) < Math.abs(opts[best])) best = i;
        if (best < 2) dx = Math.abs(opts[best]) > Math.abs(dx) ? opts[best] : dx;
        else dz = Math.abs(opts[best]) > Math.abs(dz) ? opts[best] : dz;
      }
    }
    if (dx === 0 && dz === 0) return;
    sim.px += dx;
    sim.pz += dz;
    sim.ppx += dx;
    sim.ppz += dz;
    // the speed into the wall goes (and a little bounce)
    if (dx !== 0 && sim.vx * dx < 0) {
      if (Math.abs(sim.vx) > 1.5) this.bump(v, Math.abs(sim.vx));
      sim.vx = -sim.vx * 0.15;
    }
    if (dz !== 0 && sim.vz * dz < 0) {
      if (Math.abs(sim.vz) > 1.5) this.bump(v, Math.abs(sim.vz));
      sim.vz = -sim.vz * 0.15;
    }
  }

  private bumpT = 0;
  private bump(v: ModVehicle, speed: number): void {
    if (this.time - this.bumpT < 1.5) return;
    this.bumpT = this.time;
    this.ctx?.sound('grind', Math.min(1, speed / 6));
    const [g0, g1] = this.doorGap();
    if (v === this.ctx?.seated && g1 - g0 < 2.0) this.ctx?.ui.say('大门还关着——下车按门边的按钮。', 3);
  }

  private readonly basis = new Float64Array(9);

  // ------------------------------------------------------------------ the light inside

  private light(): void {
    const g = globals;
    const o = this.core.origin;
    const room = LAYOUT.room;
    const sky0 = g.uSkyColor.value;
    g.uRoomMin.value.set(room.min[0] - o.x, room.min[1] - o.y, room.min[2] - o.z, 1);
    beamUniforms.uBeamFloor.value = -o.y;
    // the wide shadow map stays over the workshop and its yard, sharp enough (2 cm) for every window's patch,
    // while the eye is about it; further off (out on the road) it goes with the eye again
    this.farFocus.set(1.5 - o.x, 1.0 - o.y, -o.z);
    const cam = this.core.camera.position;
    const away = Math.hypot(cam.x + o.x - 1.5, cam.z + o.z) > 60;
    this.core.shadows?.fixFar(away ? null : this.farFocus, ROOM_SHADOW_REACH);
    // (moonbeams are a faint thing beside the sun's)
    beamUniforms.uBeamDensity.value = BEAM_DENSITY * (0.3 + 0.7 * smooth(0.04, 0.2, (sky0.r + sky0.g + sky0.b) / 3));
    g.uRoomMax.value.set(room.max[0] - o.x, room.max[1] - o.y, room.max[2] - o.z, room.edge);
    const sky = g.uSkyColor.value;
    const sun = g.uSunColor.value;
    const sd = g.uSunDir.value;
    // what is seen through an opening: sky above, the sunlit yard and meadow below
    const sunOnGround = Math.max(0, sd.y);
    const groundL = (albedo: [number, number, number], out: THREE.Color): THREE.Color =>
      out.setRGB(albedo[0] * (sun.r * sunOnGround * 0.85 + sky.r * 0.9), albedo[1] * (sun.g * sunOnGround * 0.85 + sky.g * 0.9), albedo[2] * (sun.b * sunOnGround * 0.85 + sky.b * 0.9));
    const meadow = groundL([0.17, 0.32, 0.09], this.c1);
    const yard = groundL([0.34, 0.33, 0.3], this.c2);
    const [g0, g1] = this.doorGap();
    let n = 0;
    const put = (a: V3, u: V3, v: V3, r: number, gg: number, bb: number): void => {
      if (n >= ROOM_OPENINGS) return;
      put3(g.uRoomOpenA.value, n, a[0] - o.x, a[1] - o.y, a[2] - o.z);
      put3(g.uRoomOpenU.value, n, u[0], u[1], u[2]);
      put3(g.uRoomOpenV.value, n, v[0], v[1], v[2]);
      put3(g.uRoomOpenL.value, n, r, gg, bb);
      n++;
    };
    // the door: the open part of it, the yard's light filling its lower half
    if (g1 - g0 > 0.02) {
      const d = LAYOUT.door;
      const k = 0.42;
      put([d.x, 0, g0], [0, 0, g1 - g0], [0, d.h, 0], sky.r * k + yard.r * (1 - k), sky.g * k + yard.g * (1 - k), sky.b * k + yard.b * (1 - k));
    }
    for (const op of LAYOUT.openings) {
      const k = op.sky;
      const glass = op.id.startsWith('sky') ? 0.8 : 0.85;
      put(op.a, op.u, op.v, (sky.r * k + meadow.r * (1 - k)) * glass, (sky.g * k + meadow.g * (1 - k)) * glass, (sky.b * k + meadow.b * (1 - k)) * glass);
    }
    for (; n < ROOM_OPENINGS; n++) put3(g.uRoomOpenL.value, n, 0, 0, 0);
    // the room gives back a little of what comes in: warm off the boards, more with sun on the floor
    const skyLum = (sky.r + sky.g + sky.b) / 3;
    const sunLum = (sun.r + sun.g + sun.b) / 3;
    const doorShare = (g1 - g0) / (2 * LAYOUT.door.z);
    const sunIn = sunLum * sunOnGround * (0.25 + 0.75 * doorShare) * Math.max(0, sd.x * 0.8 + 0.2);
    const lamp = this.lampLevel;
    // daylight given back by the walls is the sky's colour a little warmed by the wood; sun on the
    // floor gives back warm light; the lamps' own bounce is warmer still
    // (what bounces in a room of wood comes back warm: the cool is in the light straight from the openings)
    const ks = skyLum * 0.085;
    const kw = sunIn * 0.032;
    // (at night the room is the lamps' pools and the dark between them: little of their light comes back)
    const kl = lamp * 0.012;
    g.uRoomAmb.value.setRGB(ks * 1.12 + kw * 1.15 + kl * 1.2, ks * 0.98 + kw * 0.95 + kl * 0.9, ks * 0.8 + kw * 0.7 + kl * 0.58);
    // the lamps
    const lamps = LAYOUT.lamps;
    let slot = 0;
    for (const L of lamps) {
      if (slot >= ROOM_LAMPS - 2) break;
      if (lamp < 0.01) {
        g.uRoomLampP.value[slot++ * 4 + 3] = 0;
        continue;
      }
      put4(g.uRoomLampP.value, slot, L.pos[0] - o.x, L.pos[1] - o.y, L.pos[2] - o.z, L.reach * LAMP_REACH);
      const p = LAMP_POWER * lamp;
      put4(g.uRoomLampC.value, slot++, L.colour[0] * LAMP_ON.r * p, L.colour[1] * LAMP_ON.g * p, L.colour[2] * LAMP_ON.b * p, L.down);
    }
    for (; slot < ROOM_LAMPS - 2; slot++) g.uRoomLampP.value[slot * 4 + 3] = 0;
    // the bulbs, and the inside of each shade glowing cream with its bulb (not lit by it: that would burn it
    // white), held at what they look like on screen whatever the eye's exposure (so never blown out close up)
    const ex = Math.max(0.5, this.core.exposure);
    this.look.setExposure(this.core.exposure);
    this.look.setGlow('bulb', (1.5 * lamp) / ex, (1.2 * lamp) / ex, (0.8 * lamp) / ex);
    this.look.setGlow('shade_in', (0.62 * lamp) / ex, (0.5 * lamp) / ex, (0.32 * lamp) / ex);
    // the stove: its fire flickers in the window of its door and on the floor before it
    const st = LAYOUT.stove;
    const t = this.time;
    const flick = 0.82 + 0.1 * Math.sin(t * 7.3) + 0.06 * Math.sin(t * 13.7 + 1.3) + 0.05 * Math.sin(t * 23.1 + 0.4) * Math.sin(t * 1.7);
    if (st) {
      // (the glow comes from the window in its door: a little out in front, so what stands beside it is not lit up)
      put4(g.uRoomLampP.value, slot, st.x + 0.4 - o.x, st.y - o.y, st.z - o.z, 3.4);
      const p = STOVE_POWER * flick;
      put4(g.uRoomLampC.value, slot, STOVE_COLOUR[0] * p, STOVE_COLOUR[1] * p, STOVE_COLOUR[2] * p, 0);
    } else g.uRoomLampP.value[slot * 4 + 3] = 0;
    slot++;
    this.look.setGlow('fire', 2.2 * flick, 0.8 * flick, 0.18 * flick);
    // the lamp over the doors outside comes on at dusk, warming up over a second or two
    const night = smooth(0.16, 0.07, skyLum);
    this.night = night > 0.5;
    // (already on, or off, when the garage is first seen)
    const outOn = night > 0.5 && this.power ? 1 : 0;
    this.outLamp = this.lit ? this.outLamp + (outOn - this.outLamp) * Math.min(1, this.frameDt * 1.5) : outOn;
    this.lit = true;
    const ol = LAYOUT.outlamp;
    const out = this.outLamp;
    if (ol && out > 0.005) {
      put4(g.uRoomLampP.value, slot, ol.x - o.x, ol.y - 0.08 - o.y, ol.z - o.z, 8.0);
      const p = OUTLAMP_POWER * out;
      // (2 + the shade's share: a lamp outside the room)
      put4(g.uRoomLampC.value, slot, OUTLAMP_COLOUR[0] * p, OUTLAMP_COLOUR[1] * p, OUTLAMP_COLOUR[2] * p, 3.0);
    } else g.uRoomLampP.value[slot * 4 + 3] = 0;
    this.look.setGlow('lamp_out', 7 * out, 5.4 * out, 3.4 * out);
    // and what it and the open doors throw on the yard
    const yu = this.yard.uniforms;
    const spill = lamp * night * (g1 - g0 > 0.05 ? 1 : 0);
    this.yard.mesh.visible = out > 0.005 || spill > 0.005;
    if (this.yard.mesh.visible) {
      if (ol) yu.uLampPos.value.set(ol.x - o.x, ol.y - 0.08 - o.y, ol.z - o.z);
      yu.uLampCol.value.setRGB(OUTLAMP_COLOUR[0] * OUTLAMP_POWER * out, OUTLAMP_COLOUR[1] * OUTLAMP_POWER * out, OUTLAMP_COLOUR[2] * OUTLAMP_POWER * out);
      const d = LAYOUT.door;
      // (wound so that the opening faces the yard)
      yu.uDoorA.value.set(d.x - o.x, -o.y, g1 - o.z);
      yu.uDoorU.value.set(0, 0, g0 - g1);
      yu.uDoorV.value.set(0, d.h, 0);
      yu.uDoorL.value.setRGB(DOOR_SPILL[0] * spill, DOOR_SPILL[1] * spill, DOOR_SPILL[2] * spill);
    }
  }

  private frameDt = 0;
  private lit = false;

  private readonly c1 = new THREE.Color();
  private readonly farFocus = new THREE.Vector3();
  private readonly c2 = new THREE.Color();

  indoors(x: number, z: number): boolean {
    const r = LAYOUT.room;
    return x > r.min[0] && x < r.max[0] && z > r.min[2] && z < r.max[2];
  }

  exposureAt(x: number, y: number, z: number): number {
    const r = LAYOUT.room;
    // inside the eye opens up; it eases in over the last metre and a half before the door
    const inX = smooth(r.max[0] + 1.0, r.max[0] - 1.5, x) * smooth(r.min[0] - 0.5, r.min[0] + 0.5, x);
    const inZ = smooth(r.min[2] - 0.5, r.min[2] + 0.8, z) * smooth(r.max[2] + 0.5, r.max[2] - 0.8, z);
    const inY = y < r.max[1] ? 1 : 0;
    const k = inX * inZ * inY;
    // by day the eye opens up indoors; at night the outdoor exposure is already up and the lamps rule
    // (and at night, used to the lamps, it sees the moonlit country outside as the dark it is)
    const sky = globals.uSkyColor.value;
    const day = smooth(0.08, 0.3, (sky.r + sky.g + sky.b) / 3);
    return 1 + k * (0.6 * day - 0.5 * (1 - day));
  }

  shadowFocus(x: number, z: number, heading: number, out: { x: number; y: number; z: number }): void {
    const r = LAYOUT.room;
    // inside: the fine map a few metres ahead of the eye, where one looks (kept in the room)
    const inside = x > r.min[0] - 0.5 && x < r.max[0] + 1.5 && z > r.min[2] - 0.5 && z < r.max[2] + 0.5;
    if (!inside) return;
    out.x = Math.min(r.max[0] - 2.5, Math.max(r.min[0] + 2.5, x + Math.cos(heading) * 3.0));
    out.y = 1.0;
    out.z = Math.min(r.max[2] - 2.0, Math.max(r.min[2] + 2.0, z + Math.sin(heading) * 3.0));
  }

  /** what the garage costs to draw: meshes and triangles (main pass), and what casts into the shadow maps */
  cost(): { meshes: number; triangles: number; casterTriangles: number; byName: Record<string, number> } {
    const byName: Record<string, number> = {};
    let meshes = 0;
    let triangles = 0;
    let casterTriangles = 0;
    const tris = (g: THREE.BufferGeometry): number => {
      const n = g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
      return n * ((g as THREE.InstancedBufferGeometry).isInstancedBufferGeometry ? (g as THREE.InstancedBufferGeometry).instanceCount : 1);
    };
    for (const root of [this.root]) {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const inst = (m as unknown as THREE.InstancedMesh).isInstancedMesh ? (m as unknown as THREE.InstancedMesh).count : 1;
        const t = tris(m.geometry) * inst;
        if (m.layers.isEnabled(0)) {
          meshes++;
          triangles += t;
          const key = m.name.replace(/\|.*/, '').replace(/:(shadow)$/, '');
          byName[key] = (byName[key] ?? 0) + Math.round(t);
        }
        if (m.layers.isEnabled(LAYER_SHADOW_FAR) || m.layers.isEnabled(LAYER_SHADOW_NEAR)) casterTriangles += t;
      });
    }
    return { meshes, triangles: Math.round(triangles), casterTriangles: Math.round(casterTriangles), byName };
  }

  radio(): { on: boolean; song: number; x: number; y: number; z: number } | null {
    return this.machines.radio();
  }

  telemetry(): Record<string, string | number | boolean> {
    const [g0, g1] = this.doorGap();
    return { garage: 'workshop', doorGap: Math.round((g1 - g0) * 100) / 100, doorsOpen: this.doorsOpen(), lamps: this.lampsOn, lit: Math.round(this.lampLevel * 100) / 100, power: this.power, ...this.machines.telemetry() };
  }

  surfaceAt(x: number, z: number, fromY: number): number {
    let best = visibleHeight(x, z);
    for (const list of [LAYOUT.surfaces, this.moreSurfaces])
      for (const s of list) {
        if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
        if (fromY >= s.y - 0.02 && s.y > best) best = s.y;
      }
    return best;
  }

  addSurface(x0: number, x1: number, z0: number, z1: number, y: number): void {
    // (the same place again: moved, not doubled)
    const was = this.moreSurfaces.find((s) => Math.abs(s.x0 - x0) < 1e-3 && Math.abs(s.z0 - z0) < 1e-3);
    if (was) Object.assign(was, { x1, z1, y });
    else this.moreSurfaces.push({ x0, x1, z0, z1, y });
  }

  dispose(): void {
    this.disposed = true;
    this.root.removeFromParent();
    this.outdoors.dispose();
    // every geometry and material of the garage's own (the look's, the boards' and the birds' among them)
    const mats = new Set<THREE.Material>();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh && !(o as THREE.Points).isPoints) return;
      m.geometry.dispose();
      for (const x of Array.isArray(m.material) ? m.material : [m.material]) mats.add(x);
    });
    for (const m of mats) m.dispose();
    this.look.dispose();
    this.chalk?.dispose();
    this.sign?.dispose();
    this.plates?.dispose();
    this.birds.dispose();
    this.yard.dispose();
    this.core.shadows?.fixFar(null);
    // the room goes with it: nothing else in the game is lit as indoors
    globals.uRoomMin.value.w = 0;
    for (let i = 0; i < ROOM_LAMPS; i++) globals.uRoomLampP.value[i * 4 + 3] = 0;
    globals.uRoomOpenL.value.fill(0);
  }
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** the moving piece a mesh belongs to (its node, or a parent, named DOOR_L, CHG_NEEDLE, … in the GLB) */
function moverOf(o: THREE.Object3D): THREE.Object3D | null {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (moverKey(p)) return p;
  return null;
}

function moverKey(o: THREE.Object3D): string | null {
  // the exporter names a mover's mesh "<MOVER>|<material>" (Blender object names)
  const m = /^([A-Z][A-Z0-9_]+)\|/.exec(o.name) ?? /^([A-Z][A-Z0-9_]+)$/.exec(o.name);
  if (!m || m[1] === 'S') return null;
  return m[1];
}
