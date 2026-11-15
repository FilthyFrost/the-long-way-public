/**
 * ModCar models: the GLBs the Blender scripts write (public/models/modcar/frames/<id>.glb and
 * parts/<id>.glb), loaded once and cloned per use. A model that is not there yet is replaced by a
 * simple stand-in of about the right size, so every part can be fitted and seen before its art exists.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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

function fetchGlb(url: string): Promise<THREE.Group | null> {
  return new Promise((resolve) => {
    loader.load(
      url,
      (g) => {
        g.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) rgbColours(mesh.geometry);
        });
        resolve(g.scene);
      },
      undefined,
      () => resolve(null),
    );
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

/** a copy to add to the scene; materials are shared until the car materials replace them */
export function cloneModel(m: Model): THREE.Group {
  return m.scene.clone(true);
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
