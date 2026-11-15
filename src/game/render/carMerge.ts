/**
 * Merge a car's static parts into one mesh per material (docs/MODCAR.md §6 "合批"): every part keeps its own
 * colour, wear and id in vertex attributes that the car materials read (carMaterials.ts):
 *   aPaint  (vec3)  linear colour of the part's paint (paint faces) or second paint (paint_b faces)
 *   aWear   (vec3)  the part's dirt, rust, faded paint (added to the car's own uniform)
 *   aPartId (float) 1…; CarLook.setHighlight(id) lights up that part inside the merged mesh
 * Parts that move (doors, lids, wheels, the steering wheel, needles) stay out and are drawn on their own.
 *
 * The result is a Group of plain meshes whose materials carry only the conventional names: hand it to
 * CarLook.apply() like a loaded GLB. Geometry is in the frame's space, so dirt height and patterns match.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { carMaterialName, type CarMaterialName } from './carMaterials';

export interface MergePart {
  /** the part as placed on the car (a loaded GLB scene, or any object whose meshes carry conventional material names) */
  object: THREE.Object3D;
  /** its paint and second paint (sRGB hex or THREE.Color); default: the defaults below */
  paint?: THREE.ColorRepresentation;
  paint2?: THREE.ColorRepresentation;
  /** 0…1 */
  dirt?: number;
  rust?: number;
  wear?: number;
  /** 1… (0 = no id) */
  id?: number;
}

export interface MergeOptions {
  paint?: THREE.ColorRepresentation;
  paint2?: THREE.ColorRepresentation;
}

/** attributes every merged geometry carries (missing ones are filled with neutral values) */
const KEEP = ['position', 'normal', 'uv', 'color', 'aPaint', 'aWear', 'aPartId'] as const;

function prepared(src: THREE.BufferGeometry, m: THREE.Matrix4, paint: THREE.Color | null, wear: THREE.Vector3, id: number): THREE.BufferGeometry {
  const g = src.clone();
  g.applyMatrix4(m);
  // a mirrored part (the right-hand twin of a left part) comes out inside out: turn its faces back
  if (m.determinant() < 0) {
    if (!g.index) g.setIndex([...Array(g.getAttribute('position').count).keys()]);
    const ix = g.index!.array as ArrayLike<number> & { [i: number]: number };
    for (let i = 0; i < ix.length; i += 3) {
      const t = ix[i + 1];
      ix[i + 1] = ix[i + 2];
      ix[i + 2] = t;
    }
    g.index!.needsUpdate = true;
  }
  const n = g.getAttribute('position').count;
  if (!g.index) g.setIndex([...Array(n).keys()]);
  if (!g.hasAttribute('normal')) g.computeVertexNormals();
  if (!g.hasAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  // baked AO as plain floats (glTF brings normalized shorts, 3 or 4 wide); none = unoccluded
  const ao = new Float32Array(n * 4).fill(1);
  const c = g.getAttribute('color') as THREE.BufferAttribute | undefined;
  if (c) for (let i = 0; i < n; i++) ao[i * 4] = ao[i * 4 + 1] = ao[i * 4 + 2] = c.getX(i);
  g.setAttribute('color', new THREE.Float32BufferAttribute(ao, 4));
  // (only paint meshes carry a colour: chrome, glass, cloth … are what their name says)
  if (paint) {
    const pa = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pa.set([paint.r, paint.g, paint.b], i * 3);
    g.setAttribute('aPaint', new THREE.Float32BufferAttribute(pa, 3));
  }
  const wa = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) wa.set([wear.x, wear.y, wear.z], i * 3);
  g.setAttribute('aWear', new THREE.Float32BufferAttribute(wa, 3));
  g.setAttribute('aPartId', new THREE.Float32BufferAttribute(new Float32Array(n).fill(id), 1));
  for (const name of Object.keys(g.attributes)) if (!(KEEP as readonly string[]).includes(name)) g.deleteAttribute(name);
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

/**
 * Merge parts into one mesh per conventional material name. `frame` is the car's root: geometry ends up in
 * its space (parts must already be placed under it, or at least in the same world).
 */
export function mergeCarParts(parts: MergePart[], frame: THREE.Object3D, opts: MergeOptions = {}): THREE.Group {
  frame.updateMatrixWorld(true);
  const toFrame = frame.matrixWorld.clone().invert();
  const buckets = new Map<string, THREE.BufferGeometry[]>();
  const defPaint = new THREE.Color(opts.paint ?? 0x9e2f22);
  const defPaint2 = new THREE.Color(opts.paint2 ?? 0xe6dccb);
  for (const p of parts) {
    p.object.updateMatrixWorld(true);
    const paint = p.paint !== undefined ? new THREE.Color(p.paint) : defPaint;
    const paint2 = p.paint2 !== undefined ? new THREE.Color(p.paint2) : defPaint2;
    const wear = new THREE.Vector3(p.dirt ?? 0, p.rust ?? 0, p.wear ?? 0);
    p.object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const name: CarMaterialName | string = carMaterialName(mat.name) ?? mat.name;
      const m = toFrame.clone().multiply(mesh.matrixWorld);
      const g = prepared(mesh.geometry, m, name === 'paint_b' ? paint2 : name === 'paint' ? paint : null, wear, p.id ?? 0);
      let list = buckets.get(name);
      if (!list) buckets.set(name, (list = []));
      list.push(g);
    });
  }
  const group = new THREE.Group();
  group.name = 'merged';
  for (const [name, list] of buckets) {
    const g = list.length === 1 ? list[0] : mergeGeometries(list, false);
    if (!g) throw new Error(`could not merge the ${name} geometry`);
    for (const x of list) if (x !== g) x.dispose();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    const placeholder = new THREE.MeshBasicMaterial();
    placeholder.name = name;
    const mesh = new THREE.Mesh(g, placeholder);
    mesh.name = `merged:${name}`;
    group.add(mesh);
  }
  return group;
}
