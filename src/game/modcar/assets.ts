/**
 * ModCar models: the GLBs the Blender scripts write (public/models/modcar/frames/<id>.glb and
 * parts/<id>.glb), loaded once and cloned per use. A model that is not there yet is replaced by a
 * simple stand-in of about the right size, so every part can be fitted and seen before its art exists.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { partDef } from '../../core/modcar/parts';
import type { Category, PartDef } from '../../core/modcar/types';

const BASE = '/models/modcar/';

export interface Model {
  /** the scene as loaded: clone it with cloneModel before adding it anywhere */
  scene: THREE.Group;
  /** true when the file did not exist and this is a stand-in */
  standIn: boolean;
  /** bounds of the scene in its own frame */
  box: THREE.Box3;
}

const loader = new GLTFLoader();
const cache = new Map<string, Promise<Model>>();

/** model files asked for and arrived (the loading card's bar) */
export const loadStats = { requested: 0, done: 0 };

function fetchGlb(url: string): Promise<THREE.Group | null> {
  loadStats.requested++;
  return new Promise<THREE.Group | null>((resolve) => {
    loader.load(
      url,
      (g) => {
        g.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) rgbColours(mesh.geometry);
        });
        mergeRigid(g.scene);
        resolve(g.scene);
      },
      undefined,
      () => resolve(null),
    );
  }).finally(() => {
    loadStats.done++;
  });
}

/**
 * The baked AO comes as an RGBA colour attribute; our cel shaders read colour as RGB. Keep three
 * components (and plain floats, so the shaders need no normalisation define).
 */
function rgbColours(g: THREE.BufferGeometry): void {
  const c = g.getAttribute('color') as THREE.BufferAttribute | undefined;
  if (!c || c.itemSize === 3) return;
  const n = c.count;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    out[i * 3] = c.getX(i);
    out[i * 3 + 1] = c.getY(i);
    out[i * 3 + 2] = c.getZ(i);
  }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3));
}

/**
 * Nodes that move or are looked up by name (docs/MODCAR.md §6): hinged panels and their glass, needles,
 * wipers, the filler cap, mount empties. Each is a rigid piece of its own; everything else in a model
 * stands still relative to the model's root.
 */
const RIGID = /^(P_|PG_|N_|WIPER_|FUEL_CAP|M_|LEVER|KEY|BUTTON|COVER|TAPE_DOOR|KNOB_|LID|FLAP_|FORK|SWINGARM|STAND|SHOCK_)/;
const KEEP = new Set(['position', 'normal', 'uv', 'color']);

/**
 * Merge every rigid piece of a loaded model (the model itself, and each node RIGID names) into one mesh per
 * material name: a part made of forty objects becomes a handful of meshes, and with them a handful of
 * draw calls in each pass (the shadow maps draw everything again). Materials keep their names, so the car
 * materials swap them as before.
 */
function mergeRigid(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const groups: THREE.Object3D[] = [root];
  root.traverse((o) => {
    if (o !== root && RIGID.test(o.name)) groups.push(o);
  });
  for (const g of groups) {
    const meshes: THREE.Mesh[] = [];
    const collect = (node: THREE.Object3D): void => {
      for (const c of node.children) {
        if (RIGID.test(c.name)) continue;
        const mesh = c as THREE.Mesh;
        if (mesh.isMesh && !Array.isArray(mesh.material) && !mesh.children.length) meshes.push(mesh);
        collect(c);
      }
    };
    collect(g);
    const buckets = new Map<string, THREE.Mesh[]>();
    for (const m of meshes) {
      const name = (m.material as THREE.Material).name;
      let list = buckets.get(name);
      if (!list) buckets.set(name, (list = []));
      list.push(m);
    }
    const toGroup = new THREE.Matrix4().copy(g.matrixWorld).invert();
    for (const [name, list] of buckets) {
      if (list.length < 2) continue;
      const geos: THREE.BufferGeometry[] = [];
      for (const m of list) geos.push(rigidCopy(m, toGroup));
      const merged = mergeGeometries(geos, false);
      for (const x of geos) x.dispose();
      if (!merged) continue;
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, list[0].material);
      mesh.name = `merged:${name}`;
      g.add(mesh);
      for (const m of list) m.removeFromParent();
    }
  }
}

/** a mesh's geometry in a group's frame, with the attributes every merged mesh has (missing ones neutral) */
function rigidCopy(m: THREE.Mesh, toGroup: THREE.Matrix4): THREE.BufferGeometry {
  const g = m.geometry.clone();
  const mat = new THREE.Matrix4().multiplyMatrices(toGroup, m.matrixWorld);
  g.applyMatrix4(mat);
  const n = g.getAttribute('position').count;
  if (!g.index) g.setIndex([...Array(n).keys()]);
  // a mirrored copy comes out inside out: turn its faces back
  if (mat.determinant() < 0) {
    const ix = g.index!;
    for (let i = 0; i < ix.count; i += 3) {
      const t = ix.getX(i + 1);
      ix.setX(i + 1, ix.getX(i + 2));
      ix.setX(i + 2, t);
    }
  }
  if (!g.hasAttribute('normal')) g.computeVertexNormals();
  if (!g.hasAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.hasAttribute('color')) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  for (const k of Object.keys(g.attributes)) if (!KEEP.has(k)) g.deleteAttribute(k);
  // (normalised or not, as the glTF brought it: merge needs one kind)
  for (const k of KEEP) {
    const a = g.getAttribute(k) as THREE.BufferAttribute;
    if (a && (a.normalized || !(a.array instanceof Float32Array))) {
      const f = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let j = 0; j < a.itemSize; j++) f[i * a.itemSize + j] = a.getComponent(i, j);
      g.setAttribute(k, new THREE.Float32BufferAttribute(f, a.itemSize));
    }
  }
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

/** a frame's model (a stand-in body box when the file is missing) */
export function frameModel(frameId: string, standIn: () => THREE.Group): Promise<Model> {
  const key = `frames/${frameId}`;
  let p = cache.get(key);
  if (!p) {
    p = fetchGlb(`${BASE}${key}.glb`).then((scene) => {
      const s = scene ?? standIn();
      return { scene: s, standIn: scene === null, box: new THREE.Box3().setFromObject(s) };
    });
    cache.set(key, p);
  }
  return p;
}

/** a part's model: parts/<model or id>.glb, or a stand-in shaped by its category */
export function partModel(partId: string, variant = ''): Promise<Model> {
  const def = partDef(partId);
  const file = variant ? `${def.model ?? `parts/${partId}`}@${variant}` : (def.model ?? `parts/${partId}`);
  let p = cache.get(file);
  if (!p) {
    p = fetchGlb(`${BASE}${file}.glb`).then((scene) => {
      if (!scene && variant) return partModel(partId);
      const s = scene ?? standInPart(def);
      return { scene: s, standIn: scene === null, box: new THREE.Box3().setFromObject(s) };
    });
    cache.set(file, p);
  }
  return p;
}

/**
 * The tyres on a rim, in the rim's own frame: a copy of the tyre model at each of the rim's tyre seats
 * (M_tire; a dually also M_tire2), its ring stretched to this rim when the model was made for another
 * (the sidewall kept), squashed when it is flat. Add the group next to the rim's clone.
 */
export function seatTyres(rim: Model, tyre: Model, rimRadius: number, sidewall: number, flat: boolean): THREE.Group {
  const g = new THREE.Group();
  g.name = 'tyres';
  rim.scene.updateMatrixWorld(true);
  const inv = rim.scene.matrixWorld.clone().invert();
  const seats: THREE.Matrix4[] = [];
  for (const n of ['M_tire', 'M_tire2']) {
    const o = rim.scene.getObjectByName(n);
    if (o) seats.push(inv.clone().multiply(o.matrixWorld));
  }
  if (!seats.length) seats.push(new THREE.Matrix4());
  const made = (tyre.box.max.y - tyre.box.min.y) / 2;
  const want = rimRadius + sidewall;
  const k = made > 0 && Math.abs(made - want) > 0.005 ? want / made : 1;
  for (const m of seats) {
    const t = cloneModel(tyre);
    m.decompose(t.position, t.quaternion, t.scale);
    t.scale.x *= k;
    t.scale.y *= k * (flat ? 0.92 : 1);
    g.add(t);
  }
  return g;
}

/** a copy to add to the scene; materials are shared until the car materials replace them */
export function cloneModel(m: Model): THREE.Group {
  return m.scene.clone(true);
}

const addons = new Map<string, Promise<Model | null>>();
/** a model that is no part of its own (an add-on of a panel's style: parts/<name>.glb), or null without one */
export function addonModel(name: string): Promise<Model | null> {
  let p = addons.get(name);
  if (!p) {
    p = fetchGlb(`${BASE}parts/${name}.glb`).then((scene) => (scene ? { scene, standIn: false, box: new THREE.Box3().setFromObject(scene) } : null));
    addons.set(name, p);
  }
  return p;
}

const tools = new Map<string, Promise<Model | null>>();
/**
 * A tool's own model (tools/<kind>.glb: the jerrycan, bottle, oil can, spray can, sponge), or null while
 * it has none (loose.ts toolModel draws a stand-in). Its body is the `paint` material: the look gives a
 * petrol can red, a diesel one green, a spray can its colour.
 */
export function toolGlb(kind: string): Promise<Model | null> {
  let p = tools.get(kind);
  if (!p) {
    p = fetchGlb(`${BASE}tools/${kind}.glb`).then((scene) => (scene ? { scene, standIn: false, box: new THREE.Box3().setFromObject(scene) } : null));
    tools.set(kind, p);
  }
  return p;
}

/**
 * How a stretch part takes a mount's fit box [length, width, height] (m) from the box it was modelled
 * for (its `fit_nominal`, else its bounds): along an axis it fills, it is scaled; a thing that holds only
 * a piece of its box there (a light bar on the front edge of a roof) keeps its size and moves with that
 * edge. Thin things keep their thickness (a bumper's depth, an armour plate's).
 * Apply as `obj.scale.multiply(scale)` and `obj.position.add(shift)` (shift in the holder's frame, so
 * mirror its z with the part).
 */
export function stretchFit(m: Model, fit: [number, number, number]): { scale: THREE.Vector3; shift: THREE.Vector3 } {
  let nominal: number[] | undefined;
  m.scene.traverse((o) => {
    nominal ??= o.userData.fit_nominal as number[] | undefined;
  });
  const size = m.box.getSize(new THREE.Vector3());
  const centre = m.box.getCenter(new THREE.Vector3());
  // model axes x, y, z against the fit's length, height, width
  const n = nominal ? [nominal[0], nominal[2], nominal[1]] : [size.x, size.y, size.z];
  const f = [fit[0], fit[2], fit[1]];
  const have = [size.x, size.y, size.z];
  const at = [centre.x, centre.y, centre.z];
  const scale = [1, 1, 1];
  const shift = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    if (n[i] <= 0.01) continue;
    // thin along the length or across: keeps its thickness
    if (i !== 1 && f[i] < 0.3) continue;
    const k = f[i] / n[i];
    // (upwards a part stands on its mount: it is always scaled)
    if (i === 1 || have[i] >= 0.5 * n[i]) scale[i] = k;
    else shift[i] = at[i] * (k - 1);
  }
  return { scale: new THREE.Vector3(...scale), shift: new THREE.Vector3(...shift) };
}

/** load everything a list of parts needs, ahead of time (the garage at the start) */
export function preload(partIds: Iterable<string>): Promise<unknown> {
  return Promise.all([...new Set(partIds)].map((id) => partModel(id)));
}

// ------------------------------------------------------------------ stand-ins

const mats = new Map<string, THREE.MeshStandardMaterial>();
/** a stand-in material named like the real ones, so the car materials treat it the same */
function m(name: string, color: number): THREE.MeshStandardMaterial {
  let mt = mats.get(name);
  if (!mt) {
    mt = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    mt.name = name;
    mats.set(name, mt);
  }
  return mt;
}

function box(x: number, y: number, z: number, mat: THREE.Material, cx = 0, cy = y / 2, cz = 0): THREE.Mesh {
  const g = new THREE.BoxGeometry(x, y, z);
  const mesh = new THREE.Mesh(g, mat);
  mesh.position.set(cx, cy, cz);
  return mesh;
}

function cyl(r: number, h: number, mat: THREE.Material, axis: 'x' | 'y' | 'z' = 'y', seg = 20): THREE.Mesh {
  const g = new THREE.CylinderGeometry(r, r, h, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  return new THREE.Mesh(g, mat);
}

/** a rough shape per category in the part's own frame (+x forward, +y up, +z right) */
export function standInPart(def: PartDef): THREE.Group {
  const g = new THREE.Group();
  g.name = 'PART';
  const steel = m('steel', 0x6e7277);
  const paint = m('paint', 0xb04a3a);
  const rubber = m('rubber', 0x1c1c1e);
  const trim = m('trim', 0x222326);
  const chrome = m('chrome', 0xd9dde2);
  const fabric = m('fabric', 0x6a4a36);
  const cat: Category = def.cat;
  if (cat === 'engine') {
    const e = def.engine!;
    const big = Math.cbrt(def.mass / 115);
    const len = (e.layout === 'v' ? 0.75 : e.layout === 'flat' ? 0.7 : 0.55) * big;
    const wid = (e.layout === 'flat' ? 0.85 : e.layout === 'v' ? 0.7 : 0.45) * big;
    const hgt = (e.layout === 'flat' ? 0.5 : 0.62) * big;
    g.add(box(len, hgt * 0.7, wid, steel));
    g.add(box(len * 0.9, hgt * 0.25, wid * 0.7, paint, 0, hgt * 0.82));
    const filt = cyl(0.12 * big, 0.06, chrome);
    filt.position.set(0, hgt * 1.0, 0);
    g.add(filt);
  } else if (cat === 'gearbox') g.add(box(0.5, 0.28, 0.3, m('alu', 0xa8acb0)));
  else if (cat === 'radiator') g.add(box(0.07, 0.45, 0.62, steel));
  else if (cat === 'battery') g.add(box(0.25, 0.2, 0.17, m('trim', 0x222326)));
  else if (cat === 'fuelTank') {
    const l = def.fuelTank!.litres;
    if (def.id === 'tank_drum') g.add(cyl(0.29, 0.88, m('paint_b', 0x2f5f8f)).translateY(0.44));
    else g.add(box(Math.cbrt(l / 45) * 0.8, 0.25, Math.cbrt(l / 45) * 0.6, steel));
  } else if (cat === 'exhaust') {
    const p = cyl(0.04, 1.4, steel, 'x');
    p.position.set(-0.7, 0, 0);
    g.add(p);
    const muff = cyl(0.09, 0.45, steel, 'x');
    muff.position.set(-1.1, 0, 0);
    g.add(muff);
  } else if (cat === 'turbo') g.add(cyl(0.11, 0.16, steel, 'z'));
  else if (cat === 'rim') {
    const r = def.rim!;
    const disc = cyl(r.radius, r.width, r.tire ? steel : m('rubber', 0x555555), 'z', 28);
    g.add(disc);
    const cap = cyl(r.radius * 0.35, r.width * 1.05, chrome, 'z');
    g.add(cap);
  } else if (cat === 'tire') {
    const t = def.tire!;
    const inner = 0.165;
    const tor = new THREE.Mesh(new THREE.TorusGeometry(inner + t.sidewall / 2, t.sidewall / 2, 10, 32), rubber);
    tor.scale.set(1, 1, t.width / t.sidewall);
    g.add(tor);
  } else if (cat === 'steering') {
    const s = def.steering!;
    if (s.bar) g.add(box(0.05, 0.05, 0.72, chrome));
    else {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(def.id === 'steer_ship' ? 0.3 : 0.19, 0.018, 8, 28), def.id === 'steer_ship' ? m('wood', 0x7a4f2a) : trim);
      ring.rotation.y = Math.PI / 2;
      g.add(ring);
    }
  } else if (cat === 'seat') {
    if (def.id === 'seat_toilet') {
      const cer = m('ceramic', 0xf2f2ee);
      g.add(cyl(0.2, 0.4, cer).translateY(0.2));
      g.add(box(0.18, 0.4, 0.42, cer, -0.25, 0.6));
    } else if (def.id === 'seat_saddle') g.add(box(0.6, 0.1, 0.28, m('leather', 0x3a2418), 0, 0.05));
    else {
      const w = def.id === 'seat_bench' ? 1.25 : def.id === 'seat_armchair' ? 0.8 : 0.5;
      g.add(box(0.5, 0.14, w, fabric, 0, 0.35));
      g.add(box(0.14, 0.6, w, fabric, -0.22, 0.7));
    }
  } else if (cat === 'bumperFront' || cat === 'bumperRear') {
    g.add(box(0.2, 0.18, 1.6, def.bumper!.ram > 0.5 ? steel : chrome));
    if (def.id === 'bf_ram') for (let i = -3; i <= 3; i++) g.add(cyl(0.03, 0.3, steel, 'x').translateZ(i * 0.22).translateX(0.2));
  } else if (cat === 'headlight') g.add(cyl(def.id === 'hl_spot' ? 0.12 : 0.08, 0.08, m('lens_head', 0xf7f3e0), 'x'));
  else if (cat === 'taillight') g.add(box(0.05, 0.1, 0.2, m('lens_tail', 0xb0201a)));
  else if (cat === 'mirror') g.add(box(0.05, 0.12, 0.18, trim, 0, 0.1, -0.12));
  else if (cat === 'roof') g.add(box(1.2, 0.08, 1.0, def.id === 'roof_solar' ? m('glass_dark', 0x1b2a3a) : steel, 0, 0.04));
  else if (cat === 'armor') g.add(box(2.0, 0.6, 0.02, def.id === 'arm_planks' ? m('wood', 0x7a4f2a) : steel, 0, 0));
  else if (cat === 'horn') g.add(cyl(0.05, 0.05, chrome, 'x'));
  else if (cat === 'radio') g.add(box(0.06, 0.06, 0.18, trim));
  else if (cat === 'handbrake' || cat === 'gearLever') g.add(box(0.04, 0.3, 0.04, trim, 0, 0.15));
  else if (cat === 'ignition') g.add(cyl(0.025, 0.03, chrome, 'x'));
  else g.add(box(0.4, 0.4, 0.4, steel));
  return g;
}

/** a stand-in frame: a body box with dark wheel arches, so the mounts can be seen in place */
export function standInFrame(body: { front: number; rear: number; halfWidth: number; bottom: number; top: number }, kind: string): THREE.Group {
  const g = new THREE.Group();
  const paint = m('paint', 0x3e8e87);
  const glass = m('glass', 0xbfd6dc);
  const L = body.front - body.rear;
  const cx = (body.front + body.rear) / 2;
  if (kind === 'moto') {
    const frame = box(1.2, 0.08, 0.08, m('steel', 0x6e7277), 0, 0.55);
    g.add(frame);
    return g;
  }
  const lower = box(L, (body.top - body.bottom) * 0.45, body.halfWidth * 2, paint, cx, body.bottom + (body.top - body.bottom) * 0.22);
  g.add(lower);
  const cab = box(L * 0.5, (body.top - body.bottom) * 0.45, body.halfWidth * 1.8, glass, cx - L * 0.05, body.bottom + (body.top - body.bottom) * 0.7);
  g.add(cab);
  return g;
}
