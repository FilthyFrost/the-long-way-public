/**
 * The cab kit: what every vehicle is assembled from — instrument cluster, steering wheel, wheels,
 * wipers, lamps, glass, mirrors, and the description of the room behind the seats (seats to sit in,
 * slots for the home's fixtures, doors that open). Each vehicle file (truck.ts, van.ts, offroad.ts,
 * rv.ts) builds its own body and room and takes these parts from here.
 *
 * Model space = vehicle body frame: +x forward, +y up, +z right, origin at the centre of gravity.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WalkArea } from '../../core/onboard/walker';
import type { VehicleSpec } from '../../core/vehicle/spec';
import { glassMaterial, mirrorMaterial, surfaceMaterial, windscreenMaterial, type WipeShape } from '../render/materials';
import { ModelBuilder } from './builder';
import type { DashPanel } from './dash';

/** a place to sit or stand in or on the vehicle (body frame), and the way one looks from it by default */
export interface VehicleViewpoint {
  x: number;
  y: number;
  z: number;
  /** radians: 0 = forward, + = to the right */
  yaw: number;
  /** radians, + = up */
  pitch: number;
  label: string;
  /** a seat one can take in play; false = a camera position for pictures of the room */
  seat: boolean;
  /** the seat turns with this mover about a vertical axis through (x, z): t = 1 is half a turn */
  swivel?: { mover: string; x: number; z: number };
  /** only there while this slot is installed (a bunk, a bench) */
  needs?: string;
  /** movers that must stand open for this place to exist (a roof tent unfolded) */
  open?: string[];
}

/** a fixed slot for one of the home's fixtures (docs/DESIGN_V2.md §5.4) */
export interface VehicleSlot {
  id: string;
  /** stove, cooler, storage, bed, workbench, map, board, hobby, sofa, roof, rear, … */
  kind: string;
  label: string;
  /** shown while nothing is installed: a wooden frame with the blueprint tag (body frame) */
  empty: THREE.BufferGeometry;
  /** the fixture itself (body frame) */
  built: THREE.BufferGeometry;
  installed: boolean;
  /** goes with the cutaway (roof slots) */
  cut: boolean;
  /**
   * parts of the slot that a mover carries (a drawer kitchen pulled out, a roof tent unfolding):
   * drawn with the slot's state (`built` = with the fixture, else with the empty frame), placed by
   * `pose(t)` of their mover; null = not shown at that t
   */
  moving?: SlotMovingPart[];
}

export interface SlotMovingPart {
  mover: string;
  built: boolean;
  geo: THREE.BufferGeometry;
  pose: (t: number) => THREE.Matrix4 | null;
}

/**
 * Every slot of a vehicle drawn as ONE mesh: each slot keeps both of its geometries and the visible
 * ones are merged again whenever a slot changes (rare: an install, a cutaway).
 */
export class SlotMesh {
  readonly mesh: THREE.Mesh;
  /** leave out the slots that go with the cutaway */
  private cutaway = false;
  /** where the movers that carry slot parts stand (0 … 1) */
  private readonly moverT: Record<string, number> = {};

  constructor(readonly slots: VehicleSlot[], material: THREE.Material) {
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this.mesh.name = 'slots';
    this.rebuild();
  }

  get(id: string): VehicleSlot | undefined {
    return this.slots.find((s) => s.id === id);
  }

  /** install or remove one slot's fixture */
  set(id: string, installed: boolean): void {
    const s = this.get(id);
    if (!s || s.installed === installed) return;
    s.installed = installed;
    this.rebuild();
  }

  /** many at once: ids to install (everything else is emptied) */
  setInstalled(ids: Iterable<string>): void {
    const on = new Set(ids);
    for (const s of this.slots) s.installed = on.has(s.id);
    this.rebuild();
  }

  setCutaway(on: boolean): void {
    if (on === this.cutaway) return;
    this.cutaway = on;
    this.rebuild();
  }

  /** a mover that carries slot parts has moved (no-op for movers no slot part follows) */
  setMover(name: string, t: number): void {
    if (!this.slots.some((s) => s.moving?.some((m) => m.mover === name))) return;
    if (this.moverT[name] === t) return;
    this.moverT[name] = t;
    this.rebuild();
  }

  rebuild(): void {
    const parts: THREE.BufferGeometry[] = [];
    const temp: THREE.BufferGeometry[] = [];
    for (const s of this.slots) {
      if (this.cutaway && s.cut) continue;
      parts.push(s.installed ? s.built : s.empty);
      for (const m of s.moving ?? []) {
        if (m.built !== s.installed) continue;
        const xf = m.pose(this.moverT[m.mover] ?? 0);
        if (xf) {
          const g = m.geo.clone().applyMatrix4(xf);
          parts.push(g);
          temp.push(g);
        }
      }
    }
    for (let i = parts.length - 1; i >= 0; i--) if (parts[i].getAttribute('position').count === 0) parts.splice(i, 1);
    const old = this.mesh.geometry;
    const g = parts.length ? mergeGeometries(parts, false) : new THREE.BufferGeometry();
    if (!parts.length) g.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    this.mesh.geometry = g;
    old.dispose();
    for (const t of temp) t.dispose();
  }
}

/** something that opens: a tailgate, a sliding door, an awning. t = 0 shut … 1 open */
export interface VehicleMover {
  label: string;
  set(t: number): void;
}

export interface VehicleParts {
  root: THREE.Group;
  wheels: { pivot: THREE.Group; spin: THREE.Group }[];
  /** rotate about local z for the steering wheel */
  steeringWheel: THREE.Group;
  /** rotate about local z: speedometer needle */
  speedNeedle: THREE.Group;
  fuelNeedle: THREE.Group;
  /** hangs from the mirror; swing it about local z (fore-aft) and x (sideways) */
  charm: THREE.Group;
  wipers: THREE.Group[];
  windscreen: THREE.Mesh;
  headlights: THREE.ShaderMaterial;
  taillights: THREE.ShaderMaterial;
  dialGlow: THREE.ShaderMaterial;
  /** lamp shades inside: they glow when the cabin light is on (closed vehicles) */
  cabinLamps?: THREE.ShaderMaterial;
  /**
   * room materials that only see part of the cabin lamp (the cab in front of the curtain): the view
   * gives each its own lamp colour
   */
  cabMaterials?: THREE.ShaderMaterial[];
  /** speedometer, fuel gauge and their hood (the driver may see the road over them, not through them) */
  cluster?: THREE.Object3D;
  /** places to sit and to look from besides the driver's seat */
  views: Record<string, VehicleViewpoint>;
  slots: VehicleSlot[];
  /** all slots in one mesh (vehicles that have slots) */
  slotMesh?: SlotMesh;
  movers: Record<string, VehicleMover>;
  /** where one can walk inside (body frame): rectangles with the height of their floor, and room to the ceiling */
  walk?: WalkArea;
  /** hidden for the cutaway picture: right wall, right glass, roof and what stands on it */
  cut?: THREE.Object3D;
  /** big solid parts that cast shadows (into the room too) */
  casters?: THREE.Object3D[];
  /** painted body, faintly lit at night by the dash */
  body?: THREE.Mesh;
  /** the outer hull alone (no mirrors, no roof load): what the body's dimensions are checked against */
  hull?: THREE.Box3;
  /** where the headlight beam starts (body frame: ahead of and above the centre of gravity) */
  beam: { x: number; y: number };
  /** size of the patch of shade under the vehicle (m) */
  footprint: { length: number; width: number };
  /** the chase camera: how far behind, how high, and the height it looks at */
  chase: { dist: number; height: number; look: number };
  /** how much of a room the cab is: 0 = open to the weather, 1 = closed (sound, rain, lamp) */
  enclosed: number;
  /** the movers that open when camp is set up (default: door and awning) */
  camp?: string[];
  /**
   * The things in and on the vehicle one operates (levers, switches, doors, windows, the radio):
   * where each is (body frame), how big to the eye, and from where it can be reached. The meaning
   * of each id lives in controls.ts; a part that moves is posed by the mover `ctl:<id>` or by the
   * vehicle mover of the same name (doors, windows, lids).
   */
  controls?: Record<string, ControlPoint>;
  /** the live strip of the dashboard: rev counter, temperature, battery, lamps, P R N D */
  dashPanel?: DashPanel;
  /** small things on the dash and shelves that hop on a bump (moved as one) */
  jumpers?: THREE.Object3D;
  /** the glovebox: a small container (body frame: centre of its floor, half length, height, half width) */
  glovebox?: { x: number; y: number; z: number; hx: number; h: number; hz: number };
  /**
   * Where the places under the `bonnet` mover sit (body frame), for the systems' repair places
   * (src/game/systems/carPlaces.ts): the engine, the radiator, the battery, the cold kit.
   */
  bay?: Record<'engine' | 'cooling' | 'battery' | 'heater', { x: number; y: number; z: number }>;
  /** the hubs (brake drums) shown where a wheel has been taken off */
  hubs?: WheelHubs;
}

/**
 * The hub and brake drum of each wheel, drawn where a wheel is off the car (vehicle systems:
 * `state.wheels[i].off`). One mesh for the four; hidden (no draw call) while every wheel is on.
 */
export class WheelHubs {
  readonly mesh: THREE.Mesh;
  private readonly one: THREE.BufferGeometry;
  private readonly n: number;
  private readonly key: string[] = ['', '', '', ''];

  constructor(root: THREE.Group, spec: VehicleSpec, material: THREE.Material) {
    const r = spec.wheelRadius;
    const b = new ModelBuilder();
    b.cyl(0, 0, 0, r * 0.46, 0.09, 0x4a4d52, { rx: Math.PI / 2, segments: 14 }); // the drum
    b.cyl(0, 0, 0, r * 0.5, 0.025, 0x9a5d3e, { rx: Math.PI / 2, segments: 14 }); // its rusty lip
    b.cyl(0, 0, 0, r * 0.18, 0.13, 0x8e969b, { rx: Math.PI / 2, segments: 8 }); // the hub
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      b.cyl(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3, 0, 0.012, 0.15, 0xb9c0c4, { rx: Math.PI / 2, segments: 5 }); // studs
    }
    this.one = b.build();
    this.n = this.one.getAttribute('position').count;
    const g = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'color']) {
      const src = this.one.getAttribute(name) as THREE.BufferAttribute;
      const arr = new Float32Array(src.array.length * 4);
      for (let k = 0; k < 4; k++) arr.set(src.array as Float32Array, k * src.array.length);
      g.setAttribute(name, new THREE.BufferAttribute(arr, 3));
    }
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.name = 'hubs';
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    root.add(this.mesh);
  }

  /** every frame: the drums go where the wheels' pivots are, for the wheels that are off */
  update(wheels: VehicleParts['wheels'], off: (i: number) => boolean): void {
    let any = false;
    const pos = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const nrm = this.mesh.geometry.getAttribute('normal') as THREE.BufferAttribute;
    const p0 = this.one.getAttribute('position');
    const n0 = this.one.getAttribute('normal');
    const v = new THREE.Vector3();
    const nm = new THREE.Matrix3();
    let changed = false;
    for (let k = 0; k < 4; k++) {
      const w = wheels[k];
      const isOff = !!w && off(k);
      any ||= isOff;
      w?.pivot.updateMatrix();
      const key = isOff && w ? w.pivot.matrix.elements.map((e) => e.toFixed(4)).join(',') : 'off';
      if (key === this.key[k]) continue;
      this.key[k] = key;
      changed = true;
      for (let i = 0; i < this.n; i++) {
        const j = k * this.n + i;
        if (!isOff || !w) {
          pos.setXYZ(j, 0, 0, 0);
          continue;
        }
        v.fromBufferAttribute(p0, i).applyMatrix4(w.pivot.matrix);
        pos.setXYZ(j, v.x, v.y, v.z);
        nm.getNormalMatrix(w.pivot.matrix);
        v.fromBufferAttribute(n0, i).applyMatrix3(nm).normalize();
        nrm.setXYZ(j, v.x, v.y, v.z);
      }
    }
    if (changed) {
      pos.needsUpdate = true;
      nrm.needsUpdate = true;
      this.mesh.geometry.computeBoundingSphere();
    }
    this.mesh.visible = any;
  }
}

/** who can reach a control: the driver, the front passenger, anyone seated, anyone standing on board, from outside */
export type Reach = 'driver' | 'passenger' | 'seated' | 'onboard' | 'outside';

export interface ControlPoint {
  x: number;
  y: number;
  z: number;
  /** how big it is to the eye (m) */
  r: number;
  from: Reach[];
  /** only there while this mover stands open (the drawer behind the rear door) */
  needsOpen?: string;
}

/** a piece of a mesh that a mover carries: placed by `pose(t)` (null = hidden at that t) */
export interface PosedPart {
  mover: string;
  geo: THREE.BufferGeometry;
  /** where it is at t of its mover; `all` = every mover's t (a window rides in its door) */
  pose: (t: number, all: Record<string, number>) => THREE.Matrix4 | null;
  /** other movers that move it too (the door a window sits in) */
  follows?: string[];
}

/**
 * One mesh holding fixed geometry and the parts movers carry (a door, a tailgate, a folding bench):
 * when a mover moves, the mesh is merged again with its parts in their new place. Movers change
 * rarely, and this keeps every door and lid out of the draw-call count.
 */
export class PoseMesh {
  readonly mesh: THREE.Mesh;
  private readonly t: Record<string, number> = {};

  constructor(private readonly base: THREE.BufferGeometry, private readonly parts: PosedPart[], material: THREE.Material, name: string) {
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this.mesh.name = name;
    this.rebuild();
  }

  /** does a part of this mesh follow the mover? */
  has(mover: string): boolean {
    return this.parts.some((p) => p.mover === mover || p.follows?.includes(mover));
  }

  /** parts built after the mesh (a mover made later) join it */
  add(...parts: PosedPart[]): void {
    this.parts.push(...parts);
    this.rebuild();
  }

  set(mover: string, t: number): void {
    if (!this.has(mover) || this.t[mover] === t) return;
    this.t[mover] = t;
    this.rebuild();
  }

  rebuild(): void {
    const geos = [this.base];
    for (const p of this.parts) {
      const xf = p.pose(this.t[p.mover] ?? 0, this.t);
      if (xf) geos.push(p.geo.clone().applyMatrix4(xf));
    }
    const live = geos.filter((g) => g.getAttribute('position').count > 0);
    const old = this.mesh.geometry;
    const g = live.length > 1 ? mergeGeometries(live, false) : (live[0] ?? this.base).clone();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    this.mesh.geometry = g;
    for (const x of geos.slice(1)) x.dispose();
    old.dispose();
  }
}

/** window panes as a plain geometry (position + normal, no index): see `buildGlass` */
export function paneGeometry(panes: number[][]): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const p of panes) {
    const v = (k: number): number[] => [p[k * 3], p[k * 3 + 1], p[k * 3 + 2]];
    pos.push(...v(0), ...v(1), ...v(2), ...v(0), ...v(2), ...v(3));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** a translation, a turn about an axis through a point, both as one matrix */
export function turnAbout(px: number, py: number, pz: number, axis: THREE.Vector3, angle: number, dx = 0, dy = 0, dz = 0): THREE.Matrix4 {
  const r = new THREE.Matrix4().makeRotationAxis(axis.clone().normalize(), angle);
  const m = new THREE.Matrix4().makeTranslation(px + dx, py + dy, pz + dz).multiply(r).multiply(new THREE.Matrix4().makeTranslation(-px, -py, -pz));
  return m;
}

/** speedometer geometry shared by the texture and the needle */
export const SPEEDO = { minDeg: -120, maxDeg: 120, maxKmh: 120 };

export function dialTexture(): THREE.Texture {
  // outside a browser (model tests in Node) there is nothing to draw on: a plain face will do
  if (typeof document === 'undefined') return new THREE.DataTexture(new Uint8Array([239, 230, 207, 255]), 1, 1);
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#23262b';
  g.fillRect(0, 0, 512, 256);
  const face = (cx: number, cy: number, R: number): void => {
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fillStyle = '#efe6cf';
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = '#15171a';
    g.stroke();
  };
  // speedometer (left)
  const cx = 150;
  const cy = 128;
  const R = 108;
  face(cx, cy, R);
  g.fillStyle = '#2a2622';
  g.strokeStyle = '#2a2622';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'bold 22px sans-serif';
  for (let v = 0; v <= SPEEDO.maxKmh; v += 10) {
    const a = ((SPEEDO.minDeg + ((SPEEDO.maxDeg - SPEEDO.minDeg) * v) / SPEEDO.maxKmh) * Math.PI) / 180;
    const sx = Math.sin(a);
    const sy = -Math.cos(a);
    const major = v % 20 === 0;
    g.lineWidth = major ? 5 : 2.5;
    g.beginPath();
    g.moveTo(cx + sx * (R - 8), cy + sy * (R - 8));
    g.lineTo(cx + sx * (R - (major ? 26 : 18)), cy + sy * (R - (major ? 26 : 18)));
    g.stroke();
    if (major) g.fillText(String(v), cx + sx * (R - 46), cy + sy * (R - 46));
  }
  g.font = '15px sans-serif';
  g.fillText('km/h', cx, cy + 46);
  // fuel gauge (right)
  const fx = 386;
  const fy = 140;
  const FR = 78;
  face(fx, fy, FR);
  g.fillStyle = '#2a2622';
  g.font = 'bold 22px sans-serif';
  for (let i = 0; i <= 4; i++) {
    const a = ((-60 + 30 * i) * Math.PI) / 180;
    const sx = Math.sin(a);
    const sy = -Math.cos(a);
    g.lineWidth = i % 2 === 0 ? 5 : 2.5;
    g.beginPath();
    g.moveTo(fx + sx * (FR - 8), fy + sy * (FR - 8));
    g.lineTo(fx + sx * (FR - 24), fy + sy * (FR - 24));
    g.stroke();
  }
  g.fillText('E', fx - 40, fy - 12);
  g.fillText('F', fx + 40, fy - 12);
  g.fillStyle = '#b5482f';
  g.fillRect(fx - 52, fy - 54, 12, 12);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** frame whose +z points at `toward` and whose +x is the vehicle's right: for wheel, dials */
export function facing(toward: THREE.Vector3): THREE.Quaternion {
  const z = toward.clone().normalize();
  const x = new THREE.Vector3(0, 0, 1);
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  x.crossVectors(y, z).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}


export interface WheelLook {
  width: number;
  tyre: THREE.ColorRepresentation;
  hub: THREE.ColorRepresentation;
  cap: THREE.ColorRepresentation;
  /** hub disc and cap as fractions of the wheel radius; bolt circle */
  hubR?: number;
  capR?: number;
  boltR?: number;
  /** chunky tread blocks on the shoulders (off-road tyres) */
  knobs?: boolean;
  /** twin rear wheels are not modelled; a deeper dish reads as a truck wheel */
  dish?: boolean;
}

/** four wheels: pivots are placed every frame from the simulation */
export function buildWheels(root: THREE.Group, spec: VehicleSpec, look: WheelLook): VehicleParts['wheels'] {
  const wb = new ModelBuilder();
  const r = spec.wheelRadius;
  const w = look.width;
  wb.cyl(0, 0, 0, r, w, look.tyre, { rx: Math.PI / 2, segments: 20 });
  wb.cyl(0, 0, 0, r * (look.hubR ?? 0.62), w + 0.006, look.hub, { rx: Math.PI / 2, segments: 16 });
  wb.cyl(0, 0, 0, r * (look.capR ?? 0.2), w + 0.03, look.cap, { rx: Math.PI / 2, segments: 8 });
  if (look.dish) wb.cyl(0, 0, 0, r * 0.44, w + 0.016, look.cap, { rx: Math.PI / 2, segments: 12 });
  for (let i = 0; i < 5; i++) {
    const an = (i / 5) * Math.PI * 2;
    const br = r * (look.boltR ?? 0.38);
    wb.cyl(Math.cos(an) * br, Math.sin(an) * br, 0, 0.016, w + 0.015, 0x393d45, { rx: Math.PI / 2, segments: 6 });
  }
  if (look.knobs) {
    for (let i = 0; i < 16; i++) {
      const an = (i / 16) * Math.PI * 2;
      for (const s of [-1, 1]) wb.box(Math.cos(an) * (r + 0.002), Math.sin(an) * (r + 0.002), s * w * 0.36, 0.045, 0.034, w * 0.3, look.tyre, { rz: an + Math.PI / 2 });
    }
  }
  const geo = wb.build();
  const mat = surfaceMaterial({ vertexColors: true, ink: true });
  const wheels: VehicleParts['wheels'] = [];
  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group();
    const spin = new THREE.Group();
    spin.add(new THREE.Mesh(geo, mat));
    pivot.add(spin);
    root.add(pivot);
    wheels.push({ pivot, spin });
  }
  return wheels;
}

export interface SteeringLook {
  /** angle of the wheel's axis above horizontal (rad): 0.66 a car, 1.1 a bus */
  tilt: number;
  radius: number;
  /** thickness of the rim (m) */
  grip: number;
  rim: THREE.ColorRepresentation;
  hub: THREE.ColorRepresentation;
  marker?: THREE.ColorRepresentation;
  /** how the spokes are laid: 'T' two across and one down, 'Y' three evenly, 'bus' two across only */
  spokes?: 'T' | 'Y' | 'bus';
  cabin?: boolean;
  /** length of column drawn below the wheel (m) */
  column?: number;
}

/** steering wheel on its column */
export function buildSteering(root: THREE.Group, centre: THREE.Vector3, look: SteeringLook): THREE.Group {
  const column = new THREE.Group();
  column.position.copy(centre);
  column.quaternion.copy(facing(new THREE.Vector3(-Math.cos(look.tilt), Math.sin(look.tilt), 0)));
  const steeringWheel = new THREE.Group();
  const sb = new ModelBuilder();
  const R = look.radius;
  const spoke = look.grip * 1.5;
  sb.torus(0, 0, 0, R, look.grip / 2, look.rim);
  sb.cyl(0, 0, 0.005, R * 0.23, 0.035, look.hub, { rx: Math.PI / 2, segments: 10 });
  const kind = look.spokes ?? 'T';
  if (kind === 'Y') {
    for (const a of [Math.PI / 6, (5 * Math.PI) / 6, -Math.PI / 2]) sb.bar(0, 0, 0, Math.cos(a) * R * 0.97, Math.sin(a) * R * 0.97, 0, spoke, look.rim);
  } else {
    sb.bar(-R * 0.97, 0, 0, R * 0.97, 0, 0, spoke, look.rim);
    if (kind === 'T') sb.bar(0, 0, 0, 0, -R * 0.97, 0, spoke, look.rim);
  }
  sb.box(0, R + look.grip * 0.2, 0, 0.03, 0.012, 0.03, look.marker ?? 0xe8dec4); // top-centre marker: makes rotation readable
  steeringWheel.add(new THREE.Mesh(sb.build(), surfaceMaterial({ vertexColors: true, ink: true, cabin: look.cabin })));
  column.add(steeringWheel);
  if (look.column) {
    const cb = new ModelBuilder();
    cb.bar(0, 0, -0.01, 0, 0, -look.column, 0.045, 0x393d45);
    column.add(new THREE.Mesh(cb.build(), surfaceMaterial({ vertexColors: true, ink: true, cabin: look.cabin })));
  }
  root.add(column);
  return steeringWheel;
}

/** speedometer and fuel gauge facing the driver; `tiltBack` = how far the face leans back (rad) */
export function buildCluster(root: THREE.Group, pos: THREE.Vector3, tiltBack = 0.22, width = 0.34): { dialGlow: THREE.ShaderMaterial; speedNeedle: THREE.Group; fuelNeedle: THREE.Group } {
  const dialGlow = surfaceMaterial({ map: dialTexture(), mapEmissive: 0.0, fog: false });
  const cluster = new THREE.Group();
  cluster.position.copy(pos);
  cluster.quaternion.copy(facing(new THREE.Vector3(-Math.cos(tiltBack), Math.sin(tiltBack), 0)));
  const k = width / 0.34;
  cluster.add(new THREE.Mesh(new THREE.PlaneGeometry(width, width / 2), dialGlow));
  const needleGeo = new THREE.BoxGeometry(0.006 * k, 0.058 * k, 0.003);
  needleGeo.translate(0, 0.022 * k, 0);
  const needleMat = surfaceMaterial({ color: 0xc9462f, emissive: 0xc9462f, emissiveIntensity: 0.15, fog: false });
  const speedNeedle = new THREE.Group();
  speedNeedle.position.set(-0.0704 * k, 0, 0.004); // dial centre: (150 - 256) / 512 × width
  speedNeedle.add(new THREE.Mesh(needleGeo, needleMat));
  cluster.add(speedNeedle);
  const fuelNeedle = new THREE.Group();
  fuelNeedle.position.set(0.0863 * k, -0.008 * k, 0.004);
  const fn = new THREE.Mesh(needleGeo, needleMat);
  fn.scale.set(1, 0.75, 1);
  fuelNeedle.add(fn);
  cluster.add(fuelNeedle);
  root.add(cluster);
  return { dialGlow, speedNeedle, fuelNeedle };
}

/** a flat pane from four corners (bottom-left, bottom-right, top-right, top-left as seen from inside) */
export function quadGeometry(p: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return g;
}

export interface Screen {
  windscreen: THREE.Mesh;
  wipers: THREE.Group[];
}

/**
 * The windscreen and its two wipers. Corners: bottom-left, bottom-right, top-right, top-left as the
 * driver sees it (left = −z). `pivots` = where the wipers are hinged along the foot of the glass
 * (z in the body frame); they sweep up and to the left from lying along the foot, pointing right.
 */
export function buildScreen(root: THREE.Group, corners: number[], pivots: [number, number], blade: number): Screen {
  const bl = new THREE.Vector3(corners[0], corners[1], corners[2]);
  const br = new THREE.Vector3(corners[3], corners[4], corners[5]);
  const tl = new THREE.Vector3(corners[9], corners[10], corners[11]);
  const width = bl.distanceTo(br);
  const height = bl.distanceTo(tl);
  const wipe: WipeShape = { width, height, pivots: [pivots[0] - bl.z, pivots[1] - bl.z], blade: blade + 0.01 };
  const windscreen = new THREE.Mesh(quadGeometry(corners), windscreenMaterial(0xc4dade, 0.1, wipe));
  windscreen.name = 'windscreen';
  windscreen.renderOrder = 10;
  root.add(windscreen);
  // the glass normal that points into the cab
  const up = tl.clone().sub(bl).normalize();
  const inward = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 0, 1)).normalize();
  if (inward.x > 0) inward.negate();
  const mat = surfaceMaterial({ color: 0x393d45, ink: true });
  const wipers: THREE.Group[] = [];
  for (const z of pivots) {
    const g = new THREE.Group();
    // a finger's width above the foot of the glass and just off its surface
    g.position.copy(bl).addScaledVector(up, 0.015).addScaledVector(inward, 0.006);
    g.position.z = z;
    g.quaternion.copy(facing(inward));
    const arm = new THREE.Mesh(new THREE.BoxGeometry(blade, 0.012, 0.008), mat);
    arm.position.set(blade / 2, 0.012, 0.012);
    g.add(arm);
    root.add(g);
    wipers.push(g);
  }
  return { windscreen, wipers };
}

/** every other window of the vehicle in one mesh; each pane = four corners in order round its edge */
export function buildGlass(parent: THREE.Object3D, panes: number[][], tint: THREE.ColorRepresentation = 0xbfd6dc, opacity = 0.14): THREE.Mesh | null {
  if (panes.length === 0) return null;
  const pos: number[] = [];
  const idx: number[] = [];
  panes.forEach((p, k) => {
    pos.push(...p);
    idx.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, glassMaterial(tint, opacity));
  m.name = 'glass';
  m.renderOrder = 9;
  parent.add(m);
  return m;
}

/** a side window: a pane in the plane z = const between x0…x1 and y0…y1 */
export function sidePane(x0: number, x1: number, y0: number, y1: number, z: number): number[] {
  return [x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z];
}

/** a window across the vehicle: a pane in the plane x = const */
export function crossPane(x: number, y0: number, y1: number, z0: number, z1: number): number[] {
  return [x, y0, z0, x, y0, z1, x, y1, z1, x, y1, z0];
}

/** the charm hanging from the mirror */
export function buildCharm(root: THREE.Group, pos: THREE.Vector3, bead: THREE.ColorRepresentation = 0xd3553e): THREE.Group {
  const charm = new THREE.Group();
  charm.position.copy(pos);
  const cb = new ModelBuilder();
  cb.bar(0, 0, 0, 0, -0.085, 0, 0.004, 0x40362c);
  cb.sphere(0, -0.1, 0, 0.02, bead, 1);
  cb.cyl(0, -0.128, 0, 0.004, 0.035, 0xe9d7a5, { segments: 5, radiusTop: 0.016 });
  charm.add(new THREE.Mesh(cb.build(), surfaceMaterial({ vertexColors: true, flat: true, ink: true })));
  root.add(charm);
  return charm;
}

/** head and tail lamps: positions in the body frame */
export function buildLamps(root: THREE.Group, heads: THREE.Vector3[], tails: THREE.Vector3[], headRadius = 0.085, tailSize: [number, number] = [0.1, 0.1]): { headlights: THREE.ShaderMaterial; taillights: THREE.ShaderMaterial } {
  // one mesh for the heads and one for the tails
  const headlights = surfaceMaterial({ color: 0xf2ead2, emissive: 0xffe2a8, emissiveIntensity: 0.0 });
  const hgs = heads.map((h) => new THREE.CylinderGeometry(headRadius, headRadius, 0.03, 16).rotateZ(Math.PI / 2).translate(h.x, h.y, h.z));
  const hm = new THREE.Mesh(mergeGeometries(hgs, false), headlights);
  hm.name = 'headlights';
  root.add(hm);
  const taillights = surfaceMaterial({ color: 0x8c2f25, emissive: 0xff3a22, emissiveIntensity: 0.0 });
  const tgs = tails.map((t) => new THREE.BoxGeometry(0.02, tailSize[0], tailSize[1]).translate(t.x, t.y, t.z));
  const tm = new THREE.Mesh(mergeGeometries(tgs, false), taillights);
  tm.name = 'taillights';
  root.add(tm);
  return { headlights, taillights };
}

/** mirror faces (a painted view until real reflections arrive): [x, y, z, width, height, yaw] */
export function buildMirrors(root: THREE.Group, faces: [number, number, number, number, number, number][]): THREE.Mesh {
  // all faces in one mesh
  const gs = faces.map(([x, y, z, w, h, yaw]) => new THREE.PlaneGeometry(w, h).rotateY(yaw).translate(x, y, z));
  const m = new THREE.Mesh(mergeGeometries(gs, false), mirrorMaterial());
  m.name = 'mirrors';
  root.add(m);
  return m;
}

/** the paint a closed vehicle is drawn with: the shell outside, the room inside */
export function vehicleMaterials(): { body: THREE.ShaderMaterial; cabin: THREE.ShaderMaterial; lamps: THREE.ShaderMaterial } {
  return {
    body: surfaceMaterial({ vertexColors: true, flat: true, spec: 0.12, ink: true }),
    cabin: surfaceMaterial({ vertexColors: true, flat: true, ink: true, cabin: true }),
    lamps: surfaceMaterial({ color: 0xf3e6c4, emissive: 0xffd9a0, emissiveIntensity: 0.0, cabin: true }),
  };
}

/** a slot: an empty frame and the fixture (drawn later by a SlotMesh, merged with the others) */
export function makeSlot(id: string, kind: string, label: string, empty: ModelBuilder, built: ModelBuilder, installed: boolean, cut = false, moving?: SlotMovingPart[]): VehicleSlot {
  const s: VehicleSlot = { id, kind, label, empty: empty.build(), built: built.build(), installed, cut };
  if (moving?.length) s.moving = moving;
  return s;
}
