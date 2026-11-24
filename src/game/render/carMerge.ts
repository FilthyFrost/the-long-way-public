/**
 * Merge a car's static parts into one mesh per material (docs/MODCAR.md §6 "合批"): every part keeps its own
 * colour, wear and id in vertex attributes that the car materials read (carMaterials.ts):
 *   aPaint  (vec3)  linear colour of the part's paint (paint faces) or second paint (paint_b faces)
 *   aWear   (vec4)  the part's dirt, rust, faded paint, crust (added to the car's own uniform: road dust that
 *                   settles on everything evenly belongs there, the sponge or a rusty find on the part)
 * (a part being cleaned — one with a grime mask, src/game/modcar/grime.ts — is drawn on its own: the caller
 * leaves it out)
 *   aPartId (float) 1…; CarLook.setHighlight(id) lights up that part inside the merged mesh
 * Parts that move (panels, wheels, the steering wheel, levers, the key, needles) stay out and are drawn on
 * their own.
 *
 *   MergedCar          the car's holder tree (frame + parts at their mounts) merged and kept: the originals
 *                      are hidden, updatePart() rewrites one part's paint and wear in place (a spray can, a
 *                      sponge), partAt() / pick() say which part a ray meets, dispose() puts things back
 *   mergeCarParts()    the same, once, as a plain Group (the viewer's ?merge=)
 *
 * Merged meshes carry only the conventional material names: give them a look with CarLook.apply(), or
 * look.material(name, { ao: true, vpaint: true, vwear: true, vpart: true }). Geometry is in the frame's space,
 * so dirt height and patterns match the parts drawn on their own.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { carMaterialBase, carMaterialName, meshCarMaterialName } from './carMaterials';
import { reduceLater } from './carFar';
import { FAR_ERROR, FAR_HIDDEN, FAR_SHARE, MID_ERROR, MID_SHARE } from './farSimplify';
import { LAYER_SHADOW_FAR, LAYER_SHADOW_NEAR } from './shadow';

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
  crust?: number;
  /** 1… (0 = no id) */
  id?: number;
}

export interface MergeOptions {
  paint?: THREE.ColorRepresentation;
  paint2?: THREE.ColorRepresentation;
  /** subtrees left out (moving pieces); default: see MOVES */
  skip?: (o: THREE.Object3D) => boolean;
}

/** a part's look as the merged mesh keeps it */
export interface PartLook {
  paint: THREE.ColorRepresentation;
  paint2?: THREE.ColorRepresentation;
  dirt?: number;
  rust?: number;
  wear?: number;
  crust?: number;
}

/**
 * What moves in a frame or part model and so is never merged (docs/MODCAR.md §6 and the game's CarView):
 * hinged panels and their glass, panel pivots, gauge needles, wipers, the fuel cap, mount and hinge empties.
 */
export const MOVES = /^(P_|PG_|pivot_|N_|WIPER_|FUEL_CAP|M_)/;

/** attributes every merged geometry carries (missing ones are filled with neutral values) */
const KEEP = ['position', 'normal', 'uv', 'color', 'aPaint', 'aWear', 'aPartId'] as const;

/** an index 0, 1, 2 … n − 1 (a typed array: an unindexed piece of a car can have tens of thousands of corners) */
function ordinal(n: number): THREE.BufferAttribute {
  const ix = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
  for (let i = 0; i < n; i++) ix[i] = i;
  return new THREE.BufferAttribute(ix, 1);
}

function prepared(src: THREE.BufferGeometry, m: THREE.Matrix4, paint: THREE.Color | null, wear: THREE.Vector4, id: number): THREE.BufferGeometry {
  const g = src.clone();
  g.applyMatrix4(m);
  // a mirrored part (the right-hand twin of a left part) comes out inside out: turn its faces back
  if (m.determinant() < 0) {
    if (!g.index) g.setIndex(ordinal(g.getAttribute('position').count));
    const ix = g.index!.array as ArrayLike<number> & { [i: number]: number };
    for (let i = 0; i < ix.length; i += 3) {
      const t = ix[i + 1];
      ix[i + 1] = ix[i + 2];
      ix[i + 2] = t;
    }
    g.index!.needsUpdate = true;
  }
  const n = g.getAttribute('position').count;
  if (!g.index) g.setIndex(ordinal(n));
  if (!g.hasAttribute('normal')) g.computeVertexNormals();
  if (!g.hasAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  // baked AO as plain floats (glTF brings normalized shorts, 3 or 4 wide); none = unoccluded
  const ao = new Float32Array(n * 4).fill(1);
  const c = g.getAttribute('color') as THREE.BufferAttribute | undefined;
  if (c) for (let i = 0; i < n; i++) ao[i * 4] = ao[i * 4 + 1] = ao[i * 4 + 2] = c.getX(i);
  g.setAttribute('color', new THREE.Float32BufferAttribute(ao, 4));
  // (only paint meshes carry a colour: chrome, glass, cloth … are what their name says)
  // (written straight in, corner by corner: a car is some hundred thousand of them, merged in a frame)
  if (paint) {
    const pa = new Float32Array(n * 3);
    for (let i = 0, k = 0; i < n; i++, k += 3) {
      pa[k] = paint.r;
      pa[k + 1] = paint.g;
      pa[k + 2] = paint.b;
    }
    g.setAttribute('aPaint', new THREE.Float32BufferAttribute(pa, 3));
  }
  const wa = new Float32Array(n * 4);
  for (let i = 0, k = 0; i < n; i++, k += 4) {
    wa[k] = wear.x;
    wa[k + 1] = wear.y;
    wa[k + 2] = wear.z;
    wa[k + 3] = wear.w;
  }
  g.setAttribute('aWear', new THREE.Float32BufferAttribute(wa, 4));
  g.setAttribute('aPartId', new THREE.Float32BufferAttribute(new Float32Array(n).fill(id), 1));
  for (const name of Object.keys(g.attributes)) if (!(KEEP as readonly string[]).includes(name)) g.deleteAttribute(name);
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

/** a mesh's geometry per material: one piece, or one per group of a multi-material mesh */
function pieces(mesh: THREE.Mesh): { geo: THREE.BufferGeometry; slot: number; temp: boolean }[] {
  const g = mesh.geometry;
  if (!Array.isArray(mesh.material) || g.groups.length === 0) return [{ geo: g, slot: 0, temp: false }];
  // (a window's opaque twin is the same faces again: merged once, as glass; the merged glass gets its own twin)
  if (g.userData.crustGroups) return [{ geo: g, slot: 0, temp: false }];
  const out: { geo: THREE.BufferGeometry; slot: number; temp: boolean }[] = [];
  for (const grp of g.groups) {
    const sub = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(g.attributes)) sub.setAttribute(k, a);
    const src = g.index ? (g.index.array as ArrayLike<number>) : null;
    const ix: number[] = [];
    for (let i = grp.start; i < grp.start + grp.count; i++) ix.push(src ? src[i] : i);
    sub.setIndex(ix);
    out.push({ geo: sub, slot: grp.materialIndex ?? 0, temp: true });
  }
  return out;
}

/** every mesh under `root` worth merging: visible all the way up, not under a skipped node */
function meshesOf(root: THREE.Object3D, skip: (o: THREE.Object3D) => boolean): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const walk = (o: THREE.Object3D): void => {
    if (!o.visible || (o !== root && skip(o))) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.userData.ghostDepth && !m.userData.ghostXray) out.push(m);
    for (const c of o.children) walk(c);
  };
  walk(root);
  return out;
}

const defaultSkip = (o: THREE.Object3D): boolean => MOVES.test(o.name) || !!o.userData.mover;

interface Range {
  mesh: THREE.Mesh;
  /** first vertex and vertex count of the part in the merged geometry */
  start: number;
  count: number;
  /** the bucket's material: paint or paint_b take the part's colours */
  paint: 0 | 1 | 2;
}

interface Collected {
  name: string;
  geo: THREE.BufferGeometry;
  id: number;
}

function collect(
  parts: { object: THREE.Object3D; id: number; paint: THREE.Color; paint2: THREE.Color; wear: THREE.Vector4 }[],
  toFrame: THREE.Matrix4,
  skip: (o: THREE.Object3D) => boolean,
  boxes?: Map<number, THREE.Box3>,
  sources?: THREE.Mesh[],
): Map<string, Collected[]> {
  const buckets = new Map<string, Collected[]>();
  const steps = collectSteps(parts, toFrame, skip, buckets, boxes, sources);
  while (!steps.next().done);
  return buckets;
}

/** collect, a source mesh at a time (a yield after each: MergedCar's merge made over several frames) */
function* collectSteps(
  parts: { object: THREE.Object3D; id: number; paint: THREE.Color; paint2: THREE.Color; wear: THREE.Vector4 }[],
  toFrame: THREE.Matrix4,
  skip: (o: THREE.Object3D) => boolean,
  buckets: Map<string, Collected[]>,
  boxes?: Map<number, THREE.Box3>,
  sources?: THREE.Mesh[],
): Generator<void> {
  for (const p of parts) {
    p.object.updateMatrixWorld(true);
    for (const mesh of meshesOf(p.object, skip)) {
      const m = toFrame.clone().multiply(mesh.matrixWorld);
      for (const piece of pieces(mesh)) {
        const name = meshCarMaterialName(mesh, piece.slot) ?? (Array.isArray(mesh.material) ? mesh.material[piece.slot] : mesh.material)?.name ?? 'plastic_int';
        const g = prepared(piece.geo, m, name === 'paint_b' ? p.paint2 : name === 'paint' ? p.paint : null, p.wear, p.id);
        if (piece.temp) piece.geo.dispose();
        let list = buckets.get(name);
        if (!list) buckets.set(name, (list = []));
        list.push({ name, geo: g, id: p.id });
        if (boxes) {
          g.computeBoundingBox();
          let b = boxes.get(p.id);
          if (!b) boxes.set(p.id, (b = new THREE.Box3()));
          b.union(g.boundingBox!);
        }
      }
      sources?.push(mesh);
      yield;
    }
  }
}

function meshOf(name: string, list: Collected[]): THREE.Mesh {
  const g = list.length === 1 ? list[0].geo : mergeGeometries(list.map((c) => c.geo), false);
  if (!g) throw new Error(`could not merge the ${name} geometry`);
  for (const c of list) if (c.geo !== g) c.geo.dispose();
  g.computeBoundingSphere();
  g.computeBoundingBox();
  const placeholder = new THREE.MeshBasicMaterial();
  placeholder.name = name;
  const mesh = new THREE.Mesh(g, placeholder);
  mesh.name = `merged:${name}`;
  return mesh;
}

/**
 * Merge parts into one mesh per conventional material name. `frame` is the car's root: geometry ends up in
 * its space (parts must already be placed under it, or at least in the same world).
 */
export function mergeCarParts(parts: MergePart[], frame: THREE.Object3D, opts: MergeOptions = {}): THREE.Group {
  frame.updateMatrixWorld(true);
  const toFrame = frame.matrixWorld.clone().invert();
  const defPaint = new THREE.Color(opts.paint ?? 0x9e2f22);
  const defPaint2 = new THREE.Color(opts.paint2 ?? 0xe6dccb);
  const list = parts.map((p) => ({
    object: p.object,
    id: p.id ?? 0,
    paint: p.paint !== undefined ? new THREE.Color(p.paint) : defPaint,
    paint2: p.paint2 !== undefined ? new THREE.Color(p.paint2) : defPaint2,
    wear: new THREE.Vector4(p.dirt ?? 0, p.rust ?? 0, p.wear ?? 0, p.crust ?? 0),
  }));
  const group = new THREE.Group();
  group.name = 'merged';
  for (const [name, l] of collect(list, toFrame, opts.skip ?? (() => false))) group.add(meshOf(name, l));
  return group;
}

/** one part to merge: its id (1…), the subtree standing for it on the car, and its look */
export interface MergeEntry {
  id: number;
  object: THREE.Object3D;
  look: PartLook;
}

/**
 * A car's static parts merged into one mesh per material and kept up to date (the game's CarView: the frame's
 * body under `model`, each mount's `part_<mount>` holder, … — panels, wheels and the cockpit's moving
 * controls are not given, or are left out by `skip`).
 *
 *   const merged = new MergedCar(view.model, [{ id: 1, object: frameObj, look: bodyLook }, …]);
 *   view.model.add(merged.group);        // hides the originals; give merged.group a CarLook (apply)
 *   merged.updatePart(3, { paint: 0x2f5f8a });   // the spray can on part 3: a few hundred floats re-sent
 *   const id = merged.partAt(raycaster.intersectObject(merged.group, true)[0]);
 *   merged.dispose();                    // before a fit or a removal: merge again after it
 *
 * Shadows: opaque merged meshes are put in both shadow maps (glass and lenses in neither).
 */
export class MergedCar {
  readonly group = new THREE.Group();
  private readonly ranges = new Map<number, Range[]>();
  private readonly boxes = new Map<number, THREE.Box3>();
  private readonly looks = new Map<number, { paint: THREE.Color; paint2: THREE.Color; wear: THREE.Vector4 }>();
  private readonly hidden: THREE.Mesh[] = [];
  /** the same, to ask of one (hides) */
  private readonly hiddenSet = new Set<THREE.Object3D>();
  private readonly tmpBox = new THREE.Box3();
  private readonly tmpRay = new THREE.Ray();
  private readonly tmpHit = new THREE.Vector3();

  /** a source mesh this merge hid (it is drawn in the merge: its shape is still the vehicle's) */
  hides(o: THREE.Object3D): boolean {
    return this.hiddenSet.has(o);
  }

  /**
   * @param frame   the car's model space (origin on the ground): the merged geometry is in it, and the
   *                group belongs under it
   * @param entries the parts, each with a distinct id ≥ 1
   * @param skip    subtrees left out inside the given objects (default: MOVES and userData.mover)
   */
  constructor(
    readonly frame: THREE.Object3D,
    entries: MergeEntry[],
    skip: (o: THREE.Object3D) => boolean = defaultSkip,
    sliced = false,
  ) {
    this.group.name = 'merged';
    const steps = this.assemble(entries, skip);
    if (sliced) this.steps = steps;
    else while (!steps.next().done);
  }

  /** the merge still to be made (`sliced`: made a step at a time, step) */
  private steps: Generator<void> | null = null;

  /**
   * A merge begun `sliced` made on for about `budgetMs` (a source mesh, then a material, at a time): true once it is
   * whole — only then is the car drawn merged (its group filled, its sources hidden). A whole car's merge is some
   * tens of milliseconds: in one frame it was a frame of forty to sixty each time a wreck by the road was merged.
   */
  step(budgetMs: number): boolean {
    if (!this.steps) return true;
    const t = performance.now();
    do {
      if (this.steps.next().done) {
        this.steps = null;
        return true;
      }
    } while (performance.now() - t < budgetMs);
    return false;
  }

  private *assemble(entries: MergeEntry[], skip: (o: THREE.Object3D) => boolean): Generator<void> {
    const frame = this.frame;
    frame.updateMatrixWorld(true);
    const toFrame = frame.matrixWorld.clone().invert();
    const list = entries.map((e) => {
      const look = {
        paint: new THREE.Color(e.look.paint),
        paint2: new THREE.Color(e.look.paint2 ?? e.look.paint),
        wear: new THREE.Vector4(e.look.dirt ?? 0, e.look.rust ?? 0, e.look.wear ?? 0, e.look.crust ?? 0),
      };
      this.looks.set(e.id, look);
      return { object: e.object, id: e.id, ...look };
    });
    const sources: THREE.Mesh[] = [];
    const buckets = new Map<string, Collected[]>();
    yield* collectSteps(list, toFrame, skip, buckets, this.boxes, sources);
    for (const [name, l] of buckets) {
      // where each part's vertices land: the pieces are laid end to end in the order given
      const counts = l.map((c) => c.geo.getAttribute('position').count);
      const mesh = meshOf(name, l);
      let at = 0;
      const paint = name === 'paint' ? 1 : name === 'paint_b' ? 2 : 0;
      l.forEach((c, i) => {
        let r = this.ranges.get(c.id);
        if (!r) this.ranges.set(c.id, (r = []));
        const last = r[r.length - 1];
        if (last && last.mesh === mesh && last.start + last.count === at) last.count += counts[i];
        else r.push({ mesh, start: at, count: counts[i], paint });
        at += counts[i];
      });
      const see = name.startsWith('glass') || name.startsWith('lens');
      if (!see) {
        mesh.layers.enable(LAYER_SHADOW_FAR);
        mesh.layers.enable(LAYER_SHADOW_NEAR);
      }
      this.group.add(mesh);
      yield;
    }
    for (const m of sources) {
      if (!m.visible) continue;
      m.visible = false;
      this.hidden.push(m);
      this.hiddenSet.add(m);
    }
  }

  /** draw calls the merged car costs on the screen now (one per material; one far off) */
  get calls(): number {
    return this.group.children.filter((c) => c.visible && c !== this.hull).length;
  }

  /** the ids merged */
  get ids(): number[] {
    return [...this.ranges.keys()];
  }

  /**
   * A part's look changed (the spray can, the sponge, a rusty find put on): only its stretch of the vertex
   * attributes is rewritten and sent again. Fields left out keep their value.
   */
  updatePart(id: number, look: Partial<PartLook>): void {
    const cur = this.looks.get(id);
    const ranges = this.ranges.get(id);
    if (!cur || !ranges) return;
    // (the far one holds its own copy of the colours: it is made again after the change, below)
    const remake = this.farOne !== null;
    if (this.farOne) {
      this.farOne.removeFromParent();
      this.farOne.geometry.dispose();
      this.farOne = null;
    }
    if (look.paint !== undefined) cur.paint.set(look.paint);
    if (look.paint2 !== undefined) cur.paint2.set(look.paint2);
    if (look.dirt !== undefined) cur.wear.x = look.dirt;
    if (look.rust !== undefined) cur.wear.y = look.rust;
    if (look.wear !== undefined) cur.wear.z = look.wear;
    if (look.crust !== undefined) cur.wear.w = look.crust;
    const paintChanged = look.paint !== undefined || look.paint2 !== undefined;
    const wearChanged = look.dirt !== undefined || look.rust !== undefined || look.wear !== undefined || look.crust !== undefined;
    for (const r of ranges) {
      const g = r.mesh.geometry;
      if (paintChanged && r.paint) {
        const a = g.getAttribute('aPaint') as THREE.BufferAttribute | undefined;
        if (a) {
          const c = r.paint === 1 ? cur.paint : cur.paint2;
          const arr = a.array as Float32Array;
          for (let i = r.start; i < r.start + r.count; i++) {
            arr[i * 3] = c.r;
            arr[i * 3 + 1] = c.g;
            arr[i * 3 + 2] = c.b;
          }
          a.addUpdateRange(r.start * 3, r.count * 3);
          a.needsUpdate = true;
        }
      }
      if (wearChanged) {
        const a = g.getAttribute('aWear') as THREE.BufferAttribute;
        const arr = a.array as Float32Array;
        for (let i = r.start; i < r.start + r.count; i++) {
          arr[i * 4] = cur.wear.x;
          arr[i * 4 + 1] = cur.wear.y;
          arr[i * 4 + 2] = cur.wear.z;
          arr[i * 4 + 3] = cur.wear.w;
        }
        a.addUpdateRange(r.start * 4, r.count * 4);
        a.needsUpdate = true;
      }
    }
    if (remake) {
      this.makeFarOne();
      this.applyLevel();
    }
  }

  /** a part's box in the frame's space (for picking it, for a highlight's card) */
  boxOf(id: number): THREE.Box3 | undefined {
    return this.boxes.get(id);
  }

  /** the part a raycast against the merged meshes hit (its face's aPartId), or null */
  partAt(hit: THREE.Intersection | undefined): number | null {
    if (!hit || !hit.face) return null;
    const mesh = hit.object as THREE.Mesh;
    if (mesh.parent !== this.group) return null;
    const a = mesh.geometry.getAttribute('aPartId');
    return a ? Math.round(a.getX(hit.face.a)) : null;
  }

  /** the part whose box a world-space ray meets first (cheap: boxes, no triangles), within `far` metres */
  pick(ray: THREE.Ray, far = Infinity): { id: number; distance: number } | null {
    this.frame.updateMatrixWorld(true);
    const inv = this.frame.matrixWorld.clone().invert();
    const local = this.tmpRay.copy(ray).applyMatrix4(inv);
    const scale = this.frame.matrixWorld.getMaxScaleOnAxis();
    let best: { id: number; distance: number } | null = null;
    for (const [id, box] of this.boxes) {
      const p = local.intersectBox(this.tmpBox.copy(box), this.tmpHit);
      if (!p) continue;
      const d = p.distanceTo(local.origin) * scale;
      if (d <= far && (!best || d < best.distance)) best = { id, distance: d };
    }
    return best;
  }

  /** put the originals back, free the merged geometry (merge again after a fit or a removal) */
  dispose(): void {
    this.gone = true;
    if (this.farOne) {
      this.farOne.removeFromParent();
      this.farOne.geometry.dispose();
      this.farOne = null;
    }
    if (this.hull) {
      this.hull.removeFromParent();
      this.hull.geometry.dispose();
      this.hull = null;
    }
    for (const m of this.hidden) m.visible = true;
    this.hidden.length = 0;
    this.hiddenSet.clear();
    // (the twins share the near meshes' attributes: the near ones back in place first, every twin freed after)
    for (const [mesh, near] of this.nearOf) mesh.geometry = near;
    for (const c of this.group.children) (c as THREE.Mesh).geometry.dispose();
    for (const level of this.twins) if (level) for (const g of level.values()) g?.dispose();
    this.twins = [null, null];
    this.nearOf.clear();
    this.group.removeFromParent();
    this.group.clear();
    this.ranges.clear();
    this.boxes.clear();
  }

  // ---- the middle distance and far off (docs/V3/nodes/P3-carfar.md) ----

  /**
   * Each merged mesh's reduced twins: [the middle distance's, far off's] (null: not drawn at that level; absent: not
   * ready yet).
   */
  private twins: [Map<THREE.Mesh, THREE.BufferGeometry | null> | null, Map<THREE.Mesh, THREE.BufferGeometry | null> | null] = [null, null];
  private readonly nearOf = new Map<THREE.Mesh, THREE.BufferGeometry>();
  private level: 0 | 1 | 2 = 0;
  private gone = false;
  private pending = 0;

  /** twins still being made in the worker */
  get reducing(): boolean {
    return this.pending > 0;
  }

  /**
   * Make the reduced twins: each merged mesh cut to its share of its triangles (render/farSimplify.ts FAR_SHARE far
   * off, MID_SHARE in the middle distance) in a worker (render/carFar.ts), so that no frame waits; far off the
   * inside of the cab is dropped. A twin shares its mesh's attributes (paint and wear written to one are written to
   * all) and is swapped in once it is ready.
   */
  prepareFar(): void {
    if (this.twins[0] || this.gone) return;
    const made: [Map<THREE.Mesh, THREE.BufferGeometry | null>, Map<THREE.Mesh, THREE.BufferGeometry | null>] = [new Map(), new Map()];
    this.twins = made;
    for (const c of this.group.children) {
      const mesh = c as THREE.Mesh;
      const name = mesh.name.replace(/^merged:/, '');
      this.nearOf.set(mesh, mesh.geometry);
      for (const lv of [0, 1] as const) {
        if (lv === 1 && FAR_HIDDEN.has(name)) {
          made[1].set(mesh, null);
          continue;
        }
        if (mesh === this.hull) continue;
        const share = lv === 0 ? MID_SHARE(name) : (FAR_SHARE[name] ?? 0.12);
        // (a mesh kept whole at a level has no twin there: the near one is drawn)
        this.pending++;
        void reduceLater(mesh.geometry, share, lv === 0 ? MID_ERROR : FAR_ERROR, lv === 1).then((ix) => {
          this.pending--;
          if (this.gone || this.twins[lv] !== made[lv] || !ix) return;
          const near = this.nearOf.get(mesh)!;
          const g = new THREE.BufferGeometry();
          for (const [k, a] of Object.entries(near.attributes)) g.setAttribute(k, a);
          g.setIndex(new THREE.BufferAttribute(ix, 1));
          g.boundingSphere = near.boundingSphere ? near.boundingSphere.clone() : null;
          g.boundingBox = near.boundingBox ? near.boundingBox.clone() : null;
          made[lv].set(mesh, g);
          // (once every twin is in: far off the car as one mesh in one material, and a lean hull of the far twins)
          if (this.pending === 0) {
            this.makeFarOne();
            if (this.hullLean) this.castThroughHull(true);
          }
          this.applyLevel();
        });
      }
    }
    this.applyLevel();
  }

  /** drawn in full (0), as its middle-distance twins (1) or its far ones (2), each where it is ready */
  setLevel(level: 0 | 1 | 2): void {
    if (level === this.level || this.gone) return;
    this.level = level;
    if (level > 0) this.prepareFar();
    this.applyLevel();
  }

  get detail(): 0 | 1 | 2 {
    return this.level;
  }

  /** the triangles the merged car draws now (on the screen) */
  get triangles(): number {
    let n = 0;
    for (const c of this.group.children) {
      const m = c as THREE.Mesh;
      if (!m.visible || m === this.hull) continue;
      n += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
    }
    return n;
  }

  // ---- the shadow hull ----

  private hull: THREE.Mesh | null = null;
  private hullLean = false;

  /**
   * Throw the merged car's shadow through one hull: the faces of every merged mesh that throws a shadow, gathered into
   * one geometry (positions only) drawn into the shadow maps and nowhere else, and the meshes taken out of the shadow
   * maps — one draw a map instead of one a material. `lean` (a parked car): the far twins' faces where they are made
   * (the wide map's texel is some ten centimetres), and into the wide map only (the near one is round the player).
   * Called after the meshes have their materials (carView.ts tryMerge: applyMaterials sets who throws a shadow).
   */
  /**
   * A parked car's shadow hull left to its far twins (prepareFar: made when the last of them is in, from a tenth of
   * the triangles): until then its merged meshes throw their own shadows. Made now from the near meshes it was a
   * frame's ten milliseconds, to be made again a moment later.
   */
  hullFromTwins(): void {
    this.hullLean = true;
  }

  castThroughHull(lean = false): void {
    if (this.gone) return;
    this.hullLean = lean;
    const members: { mesh: THREE.Mesh; geo: THREE.BufferGeometry }[] = [];
    for (const c of this.group.children) {
      const mesh = c as THREE.Mesh;
      if (mesh === this.hull) continue;
      const near = this.nearOf.get(mesh) ?? mesh.geometry;
      if (!mesh.layers.isEnabled(LAYER_SHADOW_FAR) && !mesh.layers.isEnabled(LAYER_SHADOW_NEAR) && !this.hull) continue;
      if (this.hull && mesh.userData.hulled !== true) continue;
      const far = lean ? this.twins[1]?.get(mesh) : undefined;
      if (far === null) continue;
      members.push({ mesh, geo: far ?? near });
    }
    if (!members.length) return;
    // only the corners the faces use, laid end to end
    let corners = 0;
    let faces = 0;
    const maps: Int32Array[] = [];
    for (const m of members) {
      const ix = m.geo.getIndex()!.array as ArrayLike<number>;
      const map = new Int32Array(m.geo.getAttribute('position').count).fill(-1);
      for (let i = 0; i < ix.length; i++) if (map[ix[i]] < 0) map[ix[i]] = corners++;
      maps.push(map);
      faces += ix.length;
    }
    const pos = new Float32Array(corners * 3);
    const index = corners > 65535 ? new Uint32Array(faces) : new Uint16Array(faces);
    let at = 0;
    members.forEach((m, k) => {
      const src = m.geo.getAttribute('position').array as ArrayLike<number>;
      const map = maps[k];
      for (let v = 0; v < map.length; v++) {
        const to = map[v];
        if (to < 0) continue;
        pos[to * 3] = src[v * 3];
        pos[to * 3 + 1] = src[v * 3 + 1];
        pos[to * 3 + 2] = src[v * 3 + 2];
      }
      const ix = m.geo.getIndex()!.array as ArrayLike<number>;
      for (let i = 0; i < ix.length; i++) index[at++] = map[ix[i]];
      m.mesh.layers.disable(LAYER_SHADOW_FAR);
      m.mesh.layers.disable(LAYER_SHADOW_NEAR);
      m.mesh.userData.hulled = true;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.computeBoundingSphere();
    if (this.hull) {
      this.hull.geometry.dispose();
      this.hull.geometry = g;
    } else {
      this.hull = new THREE.Mesh(g, HULL_MATERIAL);
      this.hull.name = 'merged:shadow-hull';
      this.group.add(this.hull);
    }
    this.hull.layers.set(LAYER_SHADOW_FAR);
    if (!lean) this.hull.layers.enable(LAYER_SHADOW_NEAR);
  }

  // ---- far off in one draw ----

  private farOne: THREE.Mesh | null = null;
  /** a far car's one mesh made (CarView gives it its material) */
  onFarOne: ((mesh: THREE.Mesh) => void) | null = null;

  /**
   * Far off, the car as one mesh: every far twin's faces in one geometry, each corner coloured as its material is
   * (a paint's corners their part's paint, the rest their material's own colour: render/carMaterials.ts
   * carMaterialBase), drawn in the paint's material: one draw where there were a dozen and more. From forty-five
   * metres chrome and steel are their colours; glass is dark.
   */
  private makeFarOne(): void {
    if (this.farOne || this.gone || !this.twins[1]) return;
    const parts: { geo: THREE.BufferGeometry; name: string }[] = [];
    for (const [mesh, near] of this.nearOf) {
      if (mesh === this.hull) continue;
      const g = this.twins[1].get(mesh);
      // (left out far off: the cab's inside; kept whole, with no twin: glass and lamps, a few faces, drawn as they are)
      if (g === null) continue;
      parts.push({ geo: g ?? near, name: mesh.name.replace(/^merged:/, '') });
    }
    if (!parts.length) return;
    let corners = 0;
    let faces = 0;
    const maps: Int32Array[] = [];
    const counts: number[] = [];
    for (const p of parts) {
      const ix = p.geo.getIndex()!.array as ArrayLike<number>;
      const map = new Int32Array(p.geo.getAttribute('position').count).fill(-1);
      let n = 0;
      for (let i = 0; i < ix.length; i++) if (map[ix[i]] < 0) map[ix[i]] = n++;
      maps.push(map);
      counts.push(n);
      corners += n;
      faces += ix.length;
    }
    const pos = new Float32Array(corners * 3);
    const nrm = new Float32Array(corners * 3);
    const uv = new Float32Array(corners * 2);
    const ao = new Float32Array(corners * 4);
    const paint = new Float32Array(corners * 3);
    const wear = new Float32Array(corners * 4);
    const id = new Float32Array(corners);
    const index = corners > 65535 ? new Uint32Array(faces) : new Uint16Array(faces);
    let base = 0;
    let at = 0;
    parts.forEach((p, k) => {
      const map = maps[k];
      const g = p.geo;
      const P = g.getAttribute('position').array as ArrayLike<number>;
      const N = g.getAttribute('normal')?.array as ArrayLike<number> | undefined;
      const U = g.getAttribute('uv')?.array as ArrayLike<number> | undefined;
      const C = g.getAttribute('color')?.array as ArrayLike<number> | undefined;
      const A = g.getAttribute('aPaint')?.array as ArrayLike<number> | undefined;
      const W = g.getAttribute('aWear')?.array as ArrayLike<number> | undefined;
      const I = g.getAttribute('aPartId')?.array as ArrayLike<number> | undefined;
      const own = carMaterialBase(p.name);
      for (let v = 0; v < map.length; v++) {
        if (map[v] < 0) continue;
        const o = base + map[v];
        for (let c = 0; c < 3; c++) {
          pos[o * 3 + c] = P[v * 3 + c];
          nrm[o * 3 + c] = N ? N[v * 3 + c] : c === 1 ? 1 : 0;
          paint[o * 3 + c] = A ? A[v * 3 + c] : own[c];
        }
        uv[o * 2] = U ? U[v * 2] : 0;
        uv[o * 2 + 1] = U ? U[v * 2 + 1] : 0;
        for (let c = 0; c < 4; c++) {
          ao[o * 4 + c] = C ? C[v * 4 + c] : 1;
          wear[o * 4 + c] = W ? W[v * 4 + c] : 0;
        }
        id[o] = I ? I[v] : 0;
      }
      const ix = g.getIndex()!.array as ArrayLike<number>;
      for (let i = 0; i < ix.length; i++) index[at++] = base + map[ix[i]];
      base += counts[k];
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(ao, 4));
    geo.setAttribute('aPaint', new THREE.BufferAttribute(paint, 3));
    geo.setAttribute('aWear', new THREE.BufferAttribute(wear, 4));
    geo.setAttribute('aPartId', new THREE.BufferAttribute(id, 1));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    const placeholder = new THREE.MeshBasicMaterial();
    placeholder.name = 'paint';
    const mesh = new THREE.Mesh(geo, placeholder);
    mesh.name = 'merged:far-one';
    mesh.visible = false;
    this.farOne = mesh;
    this.group.add(mesh);
    this.onFarOne?.(mesh);
    // (its shadow is the hull's)
    mesh.layers.disable(LAYER_SHADOW_FAR);
    mesh.layers.disable(LAYER_SHADOW_NEAR);
  }

  private applyLevel(): void {
    const one = this.level === 2 && this.farOne !== null;
    if (this.farOne) this.farOne.visible = one;
    for (const [mesh, near] of this.nearOf) {
      if (mesh === this.hull) continue;
      if (one) {
        mesh.visible = false;
        continue;
      }
      const mid = this.twins[0]?.get(mesh);
      const far = this.twins[1]?.get(mesh);
      if (this.level === 2 && far === null) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      // (far off and its far twin not ready yet: the middle one meanwhile)
      mesh.geometry = this.level === 2 ? (far ?? mid ?? near) : this.level === 1 ? (mid ?? near) : near;
    }
  }
}

/** the shadow hull's material: never seen (the shadow maps draw it with their own) */
const HULL_MATERIAL = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
HULL_MATERIAL.name = 'shadow-hull';

/** a mesh's conventional material name (for code that only has the merged mesh) */
export function mergedMaterialName(mesh: THREE.Mesh): string {
  return carMaterialName(mesh.name.replace(/^merged:/, '')) ?? 'plastic_int';
}
