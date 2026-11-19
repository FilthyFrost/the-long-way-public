/**
 * The models of the ground plants one picks (node W3), one a family (src/core/world/plants.ts PlantDef.model:
 * cap_mushroom, cluster_mushroom, shelf_mushroom, truffle_mound, low_berry, tall_herb, rosette, grass_tuft,
 * water_plant, shoot, root_tuft, crust, kelp, shell_bed, crab, rock_nodule, hive, vine, flower_clump), built
 * by hand from a few simple solids in the painted style of the game's plants (specs/art/STYLE.md §5: shapes
 * that read as a silhouette, tone painted into the vertices, no texture), 50 to 150 triangles each.
 *
 * All of them lie in ONE geometry, so that every forage plant of the world is one instanced draw call: each
 * vertex says which family it is of, and the shader keeps, for an instance, only the vertices of its family
 * (material.ts). The last two triangles are the glint: a small square every instance keeps (its corners at
 * −1 … 1), turned to the camera and drawn as a star.
 *
 * A family is modelled in a box of its own: one unit to the edge of its clump on the ground, one unit tall.
 * The instance stretches that to the plant's own crown and height (PlantDef, times the plant's size), so one
 * model serves a porcini and a morel, a dandelion and a snow lotus. Plants of the water are modelled from the
 * water's surface up (their leaves float at height 0).
 *
 * Every vertex says how to paint it:
 *   color   a tone, white × how light (0.7 deep in the clump … 1.15 on top); on a part of a fixed colour, that colour
 *   aInfo.x which of the plant's two colours: 0 the main one … 1 the second; −1: the fixed colour in `color`
 *   aInfo.y how much it moves with the wind: 0 rooted … 1 a tip
 *   aInfo.z its family's number (FAMILY_INDEX); −1: the glint
 *
 * To add a family: a function below that fills the atlas, and its name in FAMILIES at the same place.
 */
import * as THREE from 'three';

/** the families, in the order of their numbers */
export const FAMILIES = [
  'cap_mushroom',
  'cluster_mushroom',
  'shelf_mushroom',
  'truffle_mound',
  'low_berry',
  'tall_herb',
  'rosette',
  'grass_tuft',
  'water_plant',
  'shoot',
  'root_tuft',
  'crust',
  'kelp',
  'shell_bed',
  'crab',
  'rock_nodule',
  'hive',
  'vine',
  'flower_clump',
] as const;

export type Family = (typeof FAMILIES)[number];

/** a family's number by its name */
export const FAMILY_INDEX: Readonly<Record<string, number>> = Object.fromEntries(FAMILIES.map((f, i) => [f, i]));

/** the families that float: modelled from the water's surface up */
export const FLOATS: ReadonlySet<string> = new Set(['water_plant']);

type Tone = number | ((p: THREE.Vector3, n: THREE.Vector3) => number);
type Vary = number | ((p: THREE.Vector3) => number);

interface Paint {
  /** which of the two colours (0 … 1), or a fixed colour */
  tint?: Vary;
  fixed?: number;
  tone?: Tone;
  sway?: Vary;
  /** shade as one soft mass about this point (the clump's way: specs/art/STYLE.md §5), not by the faces' own normals */
  round?: THREE.Vector3;
}

const v = new THREE.Vector3();
const nn = new THREE.Vector3();
const fixedColour = new THREE.Color();

/** a little number 0 … 1 from a whole one: the models are the same on every machine and every run */
function rnd(k: number): number {
  const s = Math.sin(k * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** a place, a turn about each axis, a size along each */
function at(x: number, y: number, z: number, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
}

class Atlas {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly col: number[] = [];
  readonly info: number[] = [];
  readonly idx: number[] = [];
  /** the family being built */
  fam = 0;
  /** triangles of each family, in order */
  readonly tris: number[] = [];

  private get vertices(): number {
    return this.pos.length / 3;
  }

  /** a solid of three's own making, set in place and painted */
  add(geo: THREE.BufferGeometry, m: THREE.Matrix4, paint: Paint): void {
    geo.applyMatrix4(m);
    const p = geo.getAttribute('position');
    const n = geo.getAttribute('normal');
    const base = this.vertices;
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i), p.getY(i), p.getZ(i));
      nn.set(n.getX(i), n.getY(i), n.getZ(i)).normalize();
      if (paint.round) nn.copy(v).sub(paint.round).normalize();
      // (a vertex no face gives a normal to — the pole of a cap whose rim was pulled about — looks up)
      if (nn.lengthSq() < 0.5) nn.set(0, 1, 0);
      this.vertex(v, nn, paint);
    }
    const ix = geo.getIndex();
    if (ix) for (let i = 0; i < ix.count; i++) this.idx.push(base + ix.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    this.tris[this.fam] = (this.tris[this.fam] ?? 0) + (ix ? ix.count : p.count) / 3;
    geo.dispose();
  }

  private vertex(p: THREE.Vector3, n: THREE.Vector3, paint: Paint): void {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    const tone = typeof paint.tone === 'function' ? paint.tone(p, n) : (paint.tone ?? 1);
    if (paint.fixed !== undefined) {
      fixedColour.setHex(paint.fixed);
      this.col.push(fixedColour.r * tone, fixedColour.g * tone, fixedColour.b * tone);
      this.info.push(-1);
    } else {
      this.col.push(tone, tone, tone);
      this.info.push(typeof paint.tint === 'function' ? paint.tint(p) : (paint.tint ?? 0));
    }
    this.info.push(typeof paint.sway === 'function' ? paint.sway(p) : (paint.sway ?? 0), this.fam);
  }

  /** a flat piece through points in order (a fan from the first): a leaf, a blade, a petal; it faces `up` */
  fan(points: readonly THREE.Vector3[], up: THREE.Vector3, paint: Paint): void {
    const base = this.vertices;
    for (const p of points) this.vertex(p, up, paint);
    for (let i = 1; i + 1 < points.length; i++) this.idx.push(base, base + i, base + i + 1);
    this.tris[this.fam] = (this.tris[this.fam] ?? 0) + points.length - 2;
  }

  /** a ribbon through pairs of points (left, right, left, right …) */
  strip(points: readonly THREE.Vector3[], up: THREE.Vector3, paint: Paint): void {
    const base = this.vertices;
    for (const p of points) this.vertex(p, up, paint);
    for (let i = 0; i + 3 < points.length; i += 2) this.idx.push(base + i, base + i + 1, base + i + 2, base + i + 1, base + i + 3, base + i + 2);
    this.tris[this.fam] = (this.tris[this.fam] ?? 0) + points.length - 2;
  }

  /** the glint's square: every instance keeps it */
  glint(): void {
    this.fam = -1;
    const base = this.vertices;
    const up = new THREE.Vector3(0, 1, 0);
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) this.vertex(v.set(x, y, 0), up, { tone: 1 });
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aInfo', new THREE.Float32BufferAttribute(this.info, 3));
    g.setIndex(this.idx);
    return g;
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const BARK = 0x5a4a3c;
const CUT_WOOD = 0x9a8262;
const DARK = 0x231a14;

/** a tone that rises with height between two heights */
const rise = (lo: number, hi: number, y0 = 0, y1 = 1): Tone => (p) => lo + (hi - lo) * THREE.MathUtils.clamp((p.y - y0) / (y1 - y0), 0, 1);
/** how much a part sways: none at the foot, all of `k` at height 1 */
const sways = (k: number): Vary => (p) => k * THREE.MathUtils.clamp(p.y, 0, 1.2);

/**
 * A leaf from `from` to `to`, `wide` across at its middle, its middle lifted by `arch`; four triangles with a
 * fold along the rib. Painted deeper at its foot and lighter at its tip (the tone it is given is its middle's):
 * a flat leaf would otherwise be one colour from end to end.
 */
function leaf(a: Atlas, from: THREE.Vector3, to: THREE.Vector3, wide: number, arch: number, given: Paint): void {
  const len = Math.max(1e-6, to.distanceTo(from));
  const tone = given.tone;
  const paint: Paint = { ...given, tone: (p, n) => (typeof tone === 'function' ? tone(p, n) : (tone ?? 1)) * (0.76 + 0.42 * Math.min(1, p.distanceTo(from) / len)) };
  const d = to.clone().sub(from);
  const side = new THREE.Vector3().crossVectors(UP, d).normalize().multiplyScalar(wide / 2);
  const mid = from.clone().addScaledVector(d, 0.5);
  mid.y += arch;
  const l = mid.clone().add(side);
  const r = mid.clone().sub(side);
  l.y -= arch * 0.35;
  r.y -= arch * 0.35;
  const up = new THREE.Vector3().crossVectors(d, side).normalize();
  if (up.y < 0) up.negate();
  a.fan([from, r, mid, l], up, paint);
  a.fan([to, l, mid, r], up, paint);
}

/** a thin stalk from `from` to `to` (two crossed blades: it shows from every side) */
function stalk(a: Atlas, from: THREE.Vector3, to: THREE.Vector3, wide: number, paint: Paint): void {
  const d = to.clone().sub(from).normalize();
  const sx = new THREE.Vector3().crossVectors(d, Math.abs(d.y) > 0.9 ? V(1, 0, 0) : UP).normalize().multiplyScalar(wide / 2);
  const sz = new THREE.Vector3().crossVectors(d, sx).normalize().multiplyScalar(wide / 2);
  a.fan([from.clone().sub(sx), from.clone().add(sx), to], sz.clone().normalize(), paint);
  a.fan([from.clone().sub(sz), from.clone().add(sz), to], sx.clone().normalize(), paint);
}

/** one mushroom with a domed cap: its foot at (x, 0, z), `s` of the family's full size, leaning by `lean` */
function capMushroom(a: Atlas, x: number, z: number, s: number, lean: number, fine: boolean): void {
  const m = at(x, 0, z, s, s, s, lean, x * 7 + z * 3, lean * 0.6);
  const seg = fine ? 8 : 6;
  a.add(new THREE.CylinderGeometry(0.1, 0.16, 0.62, fine ? 7 : 5, 1, true), at(0, 0.31, 0).premultiply(m), { tint: 1, tone: rise(0.82, 1.04, 0, 0.6 * s) });
  const centre = V(0, 0.52, 0).applyMatrix4(m);
  a.add(new THREE.SphereGeometry(0.46, seg, fine ? 3 : 2, 0, Math.PI * 2, 0, Math.PI / 2), at(0, 0.58, 0, 1, 0.9, 1).premultiply(m), { tint: 0, tone: (p) => 0.84 + 0.34 * THREE.MathUtils.clamp((p.y - centre.y) / (0.45 * s), 0, 1), round: centre });
  // the underside, pale and in its own shade
  a.add(new THREE.CircleGeometry(0.46, seg), at(0, 0.58, 0, 1, 1, 1, Math.PI / 2).premultiply(m), { tint: 1, tone: 0.72 });
}

function buildCapMushroom(a: Atlas): void {
  capMushroom(a, -0.12, 0.05, 1, 0.06, true);
  capMushroom(a, 0.5, -0.32, 0.66, -0.16, false);
  capMushroom(a, 0.12, 0.56, 0.44, 0.22, false);
}

/** a troop of little funnels */
function buildClusterMushroom(a: Atlas): void {
  const spots: [number, number, number][] = [[0, 0, 1], [0.42, 0.18, 0.78], [-0.38, 0.3, 0.86], [0.1, -0.46, 0.7], [-0.5, -0.24, 0.6], [0.56, -0.36, 0.55], [-0.08, 0.62, 0.62], [0.7, 0.34, 0.46]];
  spots.forEach(([x, z, s], i) => {
    const m = at(x, 0, z, s, s, s, (rnd(i) - 0.5) * 0.4, i * 1.7, (rnd(i + 9) - 0.5) * 0.4);
    // the stem opens into the funnel: the plant's second colour below, its main colour at the rim
    a.add(new THREE.CylinderGeometry(0.24, 0.05, 0.78, 6, 1, true), at(0, 0.39, 0).premultiply(m), { tint: (p) => 1 - THREE.MathUtils.clamp(p.y / (0.6 * s), 0, 1), tone: rise(0.8, 1.1, 0, 0.78 * s) });
    // the cap's hollow top, deeper towards its middle (one tone all over, a funnel seen from above is a flat
    // hexagon; and the glow of a glowing kind follows the tone, so its rims shine and its hollows less)
    const hollow = V(0, 0.72, 0).applyMatrix4(m);
    a.add(new THREE.ConeGeometry(0.24, 0.12, 6, 1, true), at(0, 0.72, 0, 1, 1, 1, Math.PI).premultiply(m), { tint: 0, tone: (p) => 0.84 + 0.3 * THREE.MathUtils.clamp(p.distanceTo(hollow) / (0.24 * s), 0, 1) });
  });
}

/** brackets on an old stump */
function buildShelfMushroom(a: Atlas): void {
  a.add(new THREE.CylinderGeometry(0.4, 0.5, 0.86, 8, 1, true), at(0, 0.43, 0, 1, 1, 1, 0, 0.3, 0.05), { fixed: BARK, tone: rise(0.8, 1.05) });
  a.add(new THREE.CircleGeometry(0.4, 8), at(0.02, 0.86, 0, 1, 1, 1, -Math.PI / 2, 0.3, 0.05), { fixed: CUT_WOOD, tone: 1 });
  const shelves: [number, number, number][] = [[0.3, 0.24, 1], [2.2, 0.44, 0.84], [4.0, 0.3, 0.7], [1.2, 0.66, 0.74], [3.2, 0.72, 0.6], [5.2, 0.6, 0.66]];
  for (const [ang, y, s] of shelves) {
    // a half disc standing out of the bark: the main colour on top, the second at the rim and beneath
    const m = at(Math.cos(ang) * 0.4, y, Math.sin(ang) * 0.4, s, s, s, 0, -ang + Math.PI / 2, 0);
    const centre = V(0, -0.04, 0).applyMatrix4(m);
    a.add(new THREE.CylinderGeometry(0.5, 0.42, 0.1, 7, 1, false, -Math.PI / 2, Math.PI), m, { tint: (p) => (p.y < centre.y + 0.02 ? 1 : THREE.MathUtils.clamp((Math.hypot(p.x - centre.x, p.z - centre.z) - 0.3 * s) / (0.2 * s), 0, 1) * 0.8), tone: (p, n) => (n.y > 0.5 ? 1.12 : n.y < -0.5 ? 0.72 : 0.95) });
  }
}

/** a low mound of turned earth with the dark knobs showing */
function buildTruffleMound(a: Atlas): void {
  const dome = new THREE.SphereGeometry(1, 9, 3, 0, Math.PI * 2, 0, Math.PI / 2);
  a.add(dome, at(0, 0, 0, 1, 0.62, 1), { tint: 0, tone: (p) => 0.86 + 0.26 * p.y + 0.1 * (rnd(Math.round(p.x * 31 + p.z * 17)) - 0.5) });
  a.add(new THREE.IcosahedronGeometry(0.24, 0), at(0.18, 0.5, 0.1, 1, 0.8, 1, 0.4, 0.7), { tint: 1, tone: rise(0.9, 1.25, 0.35, 0.75) });
  a.add(new THREE.IcosahedronGeometry(0.17, 0), at(-0.3, 0.42, -0.22, 1, 0.85, 1, 1.1, 0.2), { tint: 1, tone: rise(0.9, 1.25, 0.3, 0.6) });
  // crumbs thrown out by whatever dug here
  for (let i = 0; i < 5; i++) {
    const ang = i * 1.31 + 0.4;
    a.add(new THREE.TetrahedronGeometry(0.09 + 0.05 * rnd(i), 0), at(Math.cos(ang) * (0.78 + 0.16 * rnd(i + 3)), 0.07, Math.sin(ang) * (0.78 + 0.16 * rnd(i + 5)), 1, 1, 1, i, i * 2), { tint: 0.15, tone: 0.9 + 0.2 * rnd(i + 7) });
  }
}

/** a low mat of leaves with berries held over it */
function buildLowBerry(a: Atlas): void {
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + 0.2;
    const len = i % 2 ? 0.72 : 0.98;
    leaf(a, V(0, 0.08, 0), V(Math.cos(ang) * len, 0.14 + 0.1 * rnd(i), Math.sin(ang) * len), 0.46, 0.2, { tint: 0, tone: 0.86 + 0.24 * rnd(i + 2), sway: 0.3 });
  }
  const berries: [number, number, number][] = [[0.05, 0.86, 0.02], [0.4, 0.66, 0.24], [-0.36, 0.7, 0.3], [0.14, 0.62, -0.46], [-0.4, 0.58, -0.3], [0.52, 0.5, -0.2]];
  berries.forEach(([x, y, z], i) => {
    stalk(a, V(x * 0.3, 0.1, z * 0.3), V(x, y, z), 0.035, { tint: 0, tone: 0.72, sway: sways(0.5) });
    a.add(new THREE.IcosahedronGeometry(0.15, 0), at(x, y + 0.06, z, 1, 1, 1, i, i * 2), { tint: 1, tone: rise(0.86, 1.22, y - 0.1, y + 0.2), sway: 0.5, round: V(x, y + 0.06, z) });
  });
}

/** upright leafy stems with something at their tops */
function buildTallHerb(a: Atlas): void {
  const stems: [number, number, number, number][] = [[0, 0, 1, 0], [0.34, 0.2, 0.84, 0.22], [-0.3, 0.26, 0.9, -0.2], [0.06, -0.38, 0.7, 0.3]];
  stems.forEach(([x, z, h, lean], k) => {
    const top = V(x + lean * 0.5, h, z + lean * 0.3);
    const foot = V(x * 0.5, 0, z * 0.5);
    stalk(a, foot, top, 0.05, { tint: 0, tone: 0.7, sway: sways(1) });
    // (four pairs of leaves on the middle stem, two on the others: the round heads below are worth more triangles)
    const pairs = k === 0 ? 4 : 2;
    for (let i = 0; i < pairs; i++) {
      const t = 0.2 + (0.62 * i) / pairs;
      const c = foot.clone().lerp(top, t);
      const ang = k * 1.9 + i * 1.57;
      const reach = 0.42 * (1 - t * 0.5);
      for (const s of [1, -1]) {
        leaf(a, c, V(c.x + Math.cos(ang) * reach * s, c.y + 0.1, c.z + Math.sin(ang) * reach * s), 0.22, 0.05, { tint: 0, tone: 0.82 + 0.3 * t + 0.08 * rnd(k * 7 + i), sway: sways(1) });
      }
    }
    // what it bears, or flowers with, in the plant's second colour: a round head and a smaller one hung below it,
    // each shaded as one soft mass (with the faces' own normals they read as cut stones: a tomato, an umbel)
    const head = V(top.x, top.y - 0.02, top.z);
    a.add(new THREE.IcosahedronGeometry(0.1, 0), at(head.x, head.y, head.z, 1, 1.2, 1, 0, k), { tint: 1, tone: rise(0.9, 1.2, h - 0.15, h + 0.1), sway: sways(1), round: head });
    const bud = V(top.x - 0.12, top.y - 0.16, top.z + 0.08);
    a.add(new THREE.OctahedronGeometry(0.075, 0), at(bud.x, bud.y, bud.z, 1, 1.2, 1), { tint: 1, tone: 0.98, sway: sways(1), round: bud });
  });
}

/** leaves flat on the ground from one root, a few flowers stood among them */
function buildRosette(a: Atlas): void {
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2;
    const len = i % 2 ? 0.66 : 1;
    leaf(a, V(0, 0.04, 0), V(Math.cos(ang) * len, 0.1 + 0.08 * rnd(i), Math.sin(ang) * len), 0.3, 0.22, { tint: 0, tone: 0.84 + 0.26 * rnd(i + 4), sway: 0.25 });
  }
  const heads: [number, number, number][] = [[0.04, 1, 0.02], [0.3, 0.76, -0.18], [-0.22, 0.84, 0.26]];
  heads.forEach(([x, y, z], i) => {
    stalk(a, V(0, 0.05, 0), V(x, y - 0.08, z), 0.04, { tint: 0, tone: 0.74, sway: sways(0.8) });
    // a small flat head of petals, turned a little from the sky, over a bud
    a.add(new THREE.CircleGeometry(0.17, 7), at(x, y - 0.03, z, 1, 1, 1, -Math.PI / 2 + 0.3 + 0.2 * i, i * 2.1, 0), { tint: 1, tone: (p) => 0.94 + 0.28 * rnd(Math.round(p.x * 61 + p.z * 47 + i)), sway: sways(0.8) });
    a.add(new THREE.OctahedronGeometry(0.07, 0), at(x, y - 0.07, z, 1, 0.8, 1, 0, i), { tint: 1, tone: 0.8, sway: sways(0.8) });
  });
}

/** a tuft of narrow blades, pale where they leave the ground */
function buildGrassTuft(a: Atlas): void {
  for (let i = 0; i < 20; i++) {
    const ang = i * 2.39996;
    const out = 0.25 + 0.75 * rnd(i);
    const h = 0.55 + 0.45 * rnd(i + 11);
    const dx = Math.cos(ang);
    const dz = Math.sin(ang);
    const sx = -dz * 0.055;
    const sz = dx * 0.055;
    const foot = V(dx * 0.12, 0, dz * 0.12);
    const mid = V(dx * (0.12 + out * 0.3), h * 0.6, dz * (0.12 + out * 0.3));
    const tip = V(dx * (0.12 + out * 0.85), h * (1 - 0.25 * out), dz * (0.12 + out * 0.85));
    const face = V(dx, 0.5, dz).normalize();
    a.strip([V(foot.x - sx, 0, foot.z - sz), V(foot.x + sx, 0, foot.z + sz), V(mid.x - sx * 0.8, mid.y, mid.z - sz * 0.8), V(mid.x + sx * 0.8, mid.y, mid.z + sz * 0.8)], face, { tint: (p) => 1 - THREE.MathUtils.clamp(p.y / 0.3, 0, 1), tone: rise(0.86, 1.02, 0, 0.6), sway: sways(1) });
    a.fan([V(mid.x - sx * 0.8, mid.y, mid.z - sz * 0.8), V(mid.x + sx * 0.8, mid.y, mid.z + sz * 0.8), tip], face, { tint: 0, tone: rise(1.0, 1.16, 0.4, 1), sway: sways(1) });
  }
}

/** leaves lying on the water, a flower held over them (modelled from the water's surface up) */
function buildWaterPlant(a: Atlas): void {
  const pads: [number, number, number, number][] = [[0, 0, 0.5, 0.3], [0.56, 0.2, 0.38, 1.9], [-0.5, 0.34, 0.42, 3.4], [0.16, -0.58, 0.36, 4.6], [-0.44, -0.4, 0.3, 0.9], [0.62, -0.42, 0.26, 2.7]];
  pads.forEach(([x, z, r, turn], i) => {
    // (a pad with a notch cut into it, lying a finger above the water)
    a.add(new THREE.CircleGeometry(r, 9, 0, Math.PI * 1.82), at(x, 0.03 + 0.012 * i, z, 1, 1, 1, -Math.PI / 2, turn, 0), { tint: 0, tone: 0.88 + 0.24 * rnd(i + 1) });
  });
  // the flower: two rings of petals about a middle
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * Math.PI * 2;
    leaf(a, V(0.08, 0.1, 0.05), V(0.08 + Math.cos(ang) * 0.3, 0.52, 0.05 + Math.sin(ang) * 0.3), 0.2, 0.06, { tint: 1, tone: 0.95 + 0.2 * rnd(i), sway: 0.2 });
  }
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2 + 0.5;
    leaf(a, V(0.08, 0.14, 0.05), V(0.08 + Math.cos(ang) * 0.14, 0.78, 0.05 + Math.sin(ang) * 0.14), 0.16, 0.03, { tint: 1, tone: 1.16, sway: 0.2 });
  }
  a.add(new THREE.OctahedronGeometry(0.09, 0), at(0.08, 0.36, 0.05), { fixed: 0xe8c040, tone: 1 });
}

/** shoots breaking out of the ground, in their husks */
function buildShoot(a: Atlas): void {
  const shoots: [number, number, number, number][] = [[0, 0, 1, 0.04], [0.5, 0.2, 0.62, -0.2], [-0.4, 0.34, 0.44, 0.24]];
  shoots.forEach(([x, z, s, lean], k) => {
    // (three bands a shoot: each husk a tone of its own, the tip in the second colour)
    a.add(new THREE.ConeGeometry(0.36, 1, 7, 3, true), at(x, 0.5 * s, z, s, s, s, lean, k * 1.3, lean * 0.5), {
      tint: (p) => THREE.MathUtils.clamp((p.y / s - 0.6) / 0.4, 0, 1),
      tone: (p) => 0.8 + 0.34 * ((Math.floor((p.y / s) * 3 + 0.01) % 2) * 0.5 + 0.25 * (p.y / s)),
    });
  });
  // the earth they pushed up
  for (let i = 0; i < 4; i++) a.add(new THREE.TetrahedronGeometry(0.11, 0), at(Math.cos(i * 1.7) * 0.5, 0.06, Math.sin(i * 1.7) * 0.5 - 0.1, 1, 0.7, 1, i, i), { fixed: 0x5c4a38, tone: 0.9 + 0.2 * rnd(i) });
}

/** broad leaves from a root, a stalk with a head of berries or flowers */
function buildRootTuft(a: Atlas): void {
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * Math.PI * 2 + 0.3;
    const len = 0.78 + 0.22 * rnd(i);
    leaf(a, V(0, 0.05, 0), V(Math.cos(ang) * len, 0.3 + 0.2 * rnd(i + 3), Math.sin(ang) * len), 0.56, 0.3, { tint: 0, tone: 0.82 + 0.28 * rnd(i + 5), sway: sways(0.6) });
  }
  for (let i = 0; i < 3; i++) {
    const ang = i * 2.1 + 1;
    leaf(a, V(0, 0.1, 0), V(Math.cos(ang) * 0.4, 0.62, Math.sin(ang) * 0.4), 0.3, 0.12, { tint: 0, tone: 1.08, sway: sways(0.8) });
  }
  stalk(a, V(0, 0.05, 0), V(0.05, 0.92, 0.03), 0.05, { tint: 0, tone: 0.7, sway: sways(1) });
  for (let i = 0; i < 5; i++) {
    const ang = i * 1.2566;
    const r = i === 0 ? 0 : 0.13;
    a.add(new THREE.OctahedronGeometry(0.085, 0), at(0.05 + Math.cos(ang) * r, i === 0 ? 1.0 : 0.92, 0.03 + Math.sin(ang) * r), { tint: 1, tone: i === 0 ? 1.2 : 1.0, sway: sways(1) });
  }
}

/** a low crust on the ground: a patch with lumps or crystals standing on it */
function buildCrust(a: Atlas): void {
  const patch = new THREE.SphereGeometry(1, 11, 2, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = patch.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    // (a ragged edge: each spoke of the patch reaches a different way out)
    const ang = Math.atan2(p.getZ(i), p.getX(i));
    const k = 0.72 + 0.28 * rnd(Math.round(((ang + Math.PI) / (Math.PI * 2)) * 11) % 11);
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
  }
  patch.computeVertexNormals();
  a.add(patch, at(0, 0, 0, 1, 0.4, 1), { tint: 0, tone: (q) => 0.86 + 0.5 * q.y + 0.08 * (rnd(Math.round(q.x * 23 + q.z * 41)) - 0.5) });
  const lumps: [number, number, number][] = [[0.1, 0.05, 0.2], [0.46, -0.2, 0.15], [-0.4, 0.28, 0.16], [-0.2, -0.46, 0.13], [0.5, 0.4, 0.12], [-0.6, -0.1, 0.11], [0.2, 0.58, 0.1]];
  lumps.forEach(([x, z, r], i) => {
    const y = 0.4 * Math.sqrt(Math.max(0, 1 - (x * x + z * z))) * 0.8;
    a.add(new THREE.OctahedronGeometry(r, 0), at(x, y + r * 0.5, z, 1, 1.5, 1, i * 0.7, i * 1.3, i * 0.4), { tint: 1, tone: rise(0.9, 1.25, y, y + r * 1.6) });
  });
}

/** long ribbons thrown up on the sand */
function buildKelp(a: Atlas): void {
  for (let k = 0; k < 6; k++) {
    const ang = k * 1.05 + 0.3 * rnd(k);
    const len = 0.7 + 0.3 * rnd(k + 2);
    const dx = Math.cos(ang);
    const dz = Math.sin(ang);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      const wig = Math.sin(t * 5 + k) * 0.1;
      const w = 0.1 * (1 - t * 0.6);
      const cx = dx * t * len - dz * wig;
      const cz = dz * t * len + dx * wig;
      const y = 0.06 + 0.5 * Math.max(0, Math.sin(t * 6.3 + k * 2)) * (0.3 + 0.7 * rnd(k + i));
      pts.push(V(cx - dz * w, y, cz + dx * w), V(cx + dz * w, y * 0.8, cz - dx * w));
    }
    a.strip(pts, UP, { tint: (p) => THREE.MathUtils.clamp(Math.hypot(p.x, p.z) - 0.35, 0, 0.6) * 1.2, tone: (p) => 0.84 + 0.5 * p.y, sway: 0.15 });
  }
  a.add(new THREE.OctahedronGeometry(0.14, 0), at(0, 0.08, 0, 1, 0.7, 1), { fixed: DARK, tone: 1.4 });
}

/** how tall a shell stands against how wide it is, in the family's box */
const SHELL_UP = 3.2;

/** shells lying half in the sand */
function buildShellBed(a: Atlas): void {
  const shells: [number, number, number, number][] = [[0, 0, 0.3, 0.2], [0.5, 0.16, 0.24, 1.3], [-0.46, 0.3, 0.26, 2.6], [0.2, -0.5, 0.22, 3.9], [-0.3, -0.42, 0.25, 5.0], [0.66, -0.34, 0.2, 0.8]];
  shells.forEach(([x, z, r, turn], i) => {
    const m = at(x, 0, z, r, r, r, 0.5 * (rnd(i) - 0.5), turn, 0.6 * (rnd(i + 4) - 0.5));
    // a ribbed half shell: every other rib a shade lighter, the odd shell in the second colour. (A bed of shells
    // is a few centimetres high in all — PlantDef.height — so in the family's box of one unit the shells stand tall.)
    a.add(new THREE.SphereGeometry(1, 8, 2, 0, Math.PI * 2, 0, Math.PI / 2), at(0, 0, 0, 1, SHELL_UP, 0.74).premultiply(m), {
      tint: i % 3 === 2 ? 0.8 : 0.12 * (i % 2),
      tone: (p) => {
        const local = Math.atan2(p.z - z, p.x - x);
        return 0.7 + 0.14 * (Math.abs(Math.round((local / Math.PI) * 8)) % 2 ? 1 : 0) + 0.42 * (p.y / (r * SHELL_UP));
      },
    });
  });
}

/** a crab, claws up */
function buildCrab(a: Atlas): void {
  const body = V(0, 0.44, 0);
  a.add(new THREE.SphereGeometry(0.5, 8, 4), at(0, 0.44, 0, 1, 0.42, 0.74), { tint: 0, tone: rise(0.8, 1.2, 0.3, 0.62), round: body });
  for (const s of [1, -1]) {
    // an arm and a claw, open
    a.add(new THREE.CylinderGeometry(0.07, 0.09, 0.4, 4), at(0.36, 0.5, 0.36 * s, 1, 1, 1, 0.9 * s, 0, -0.9), { tint: 0.5, tone: 1 });
    a.add(new THREE.OctahedronGeometry(0.2, 0), at(0.62, 0.74, 0.52 * s, 1, 0.62, 0.7, 0, 0.3 * s, 0.5), { tint: 0.45, tone: rise(0.9, 1.22, 0.6, 0.9) });
    a.add(new THREE.OctahedronGeometry(0.11, 0), at(0.78, 0.9, 0.5 * s, 1.5, 0.5, 0.6, 0, 0.3 * s, 0.9), { tint: 0.7, tone: 1.15 });
    // three legs a side: up and out, then down to the sand
    for (let i = 0; i < 3; i++) {
      const z0 = (0.3 + 0.03 * i) * s;
      const x0 = -0.1 - 0.16 * i;
      const knee = V(x0 - 0.06, 0.66, z0 + 0.34 * s);
      const foot = V(x0 - 0.14 - 0.06 * i, 0, z0 + 0.62 * s);
      stalk(a, V(x0, 0.42, z0), knee, 0.07, { tint: 0.3, tone: 0.92 });
      stalk(a, knee, foot, 0.06, { tint: 0.3, tone: 0.8 });
    }
    // an eye on its stalk
    a.add(new THREE.OctahedronGeometry(0.05, 0), at(0.42, 0.7, 0.14 * s), { fixed: DARK, tone: 1 });
  }
}

/** a nodule of stone and the chips knocked off it */
function buildRockNodule(a: Atlas): void {
  const rock = (r: number, x: number, y: number, z: number, sy: number, turn: number, geo: THREE.BufferGeometry): void => {
    // (each face one flat colour: a face that looks up is a fresh break, in the lighter colour)
    a.add(geo, at(x, y, z, r, r * sy, r, turn, turn * 2, turn * 0.5), { tint: (p) => (rnd(Math.round(p.x * 37 + p.y * 91 + p.z * 53)) > 0.62 ? 0.85 : 0), tone: (p, n) => 0.82 + 0.3 * Math.max(0, n.y) + 0.08 * rnd(Math.round(p.x * 13 + p.z * 29)) });
  };
  rock(0.6, 0, 0.42, 0, 0.8, 0.4, new THREE.IcosahedronGeometry(1, 0));
  rock(0.32, 0.62, 0.2, 0.3, 0.75, 1.3, new THREE.IcosahedronGeometry(1, 0));
  rock(0.24, -0.56, 0.15, -0.38, 0.7, 2.2, new THREE.OctahedronGeometry(1, 0));
  rock(0.17, 0.2, 0.1, -0.7, 0.7, 3.1, new THREE.OctahedronGeometry(1, 0));
  rock(0.13, -0.3, 0.08, 0.68, 0.7, 0.9, new THREE.TetrahedronGeometry(1, 0));
}

/** a straw hive on a round of wood */
function buildHive(a: Atlas): void {
  a.add(new THREE.CylinderGeometry(0.74, 0.8, 0.2, 9), at(0, 0.1, 0), { fixed: BARK, tone: (p, n) => (n.y > 0.5 ? 1.5 : 0.95) });
  const dome = V(0, 0.2, 0);
  // coils of straw: every ring of the dome a tone of its own
  a.add(new THREE.SphereGeometry(0.66, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), at(0, 0.2, 0, 1, 1.2, 1), { tint: 0, tone: (p) => 0.84 + 0.14 * (Math.round(((p.y - 0.2) / 0.79) * 5) % 2) + 0.2 * ((p.y - 0.2) / 0.79), round: dome });
  // the way in, and the honey that has run from it
  a.add(new THREE.CircleGeometry(0.13, 7, 0, Math.PI), at(0.662, 0.26, 0, 1, 1.2, 1, 0, Math.PI / 2, 0), { fixed: DARK, tone: 1 });
  const drips: [number, number, number][] = [[0.66, 0.22, 0.2], [0.62, 0.3, -0.22], [0.74, 0.12, 0.05]];
  drips.forEach(([x, y, z]) => a.add(new THREE.OctahedronGeometry(0.07, 0), at(x, y, z, 1, 1.6, 1), { tint: 1, tone: 1.2 }));
  a.add(new THREE.ConeGeometry(0.1, 0.14, 6), at(0, 1.03, 0), { tint: 0, tone: 1.1 });
}

/** a vine wound up three sticks */
function buildVine(a: Atlas): void {
  const top = V(0, 1, 0);
  for (let i = 0; i < 3; i++) {
    const ang = i * 2.094 + 0.4;
    stalk(a, V(Math.cos(ang) * 0.5, 0, Math.sin(ang) * 0.5), top, 0.06, { fixed: 0x7a6248, tone: 1 });
  }
  for (let i = 0; i < 13; i++) {
    const t = i / 12;
    const ang = i * 1.9;
    const r = 0.5 * (1 - t) + 0.08;
    const c = V(Math.cos(ang) * r, 0.08 + t * 0.86, Math.sin(ang) * r);
    leaf(a, c, V(c.x + Math.cos(ang) * 0.34, c.y - 0.06, c.z + Math.sin(ang) * 0.34), 0.34, 0.08, { tint: 0, tone: 0.82 + 0.3 * rnd(i) + 0.12 * t, sway: sways(0.8) });
  }
  // what it is dug for shows at its foot; and the little ones in the leaf axils
  a.add(new THREE.IcosahedronGeometry(0.16, 0), at(0.16, 0.06, 0.1, 1.6, 0.7, 1, 0, 0.5), { tint: 1, tone: rise(0.86, 1.2, 0, 0.16) });
  for (let i = 0; i < 3; i++) a.add(new THREE.OctahedronGeometry(0.06, 0), at(Math.cos(i * 2.4) * 0.26, 0.4 + 0.18 * i, Math.sin(i * 2.4) * 0.26), { tint: 1, tone: 1.1, sway: sways(0.8) });
}

/** a clump of daisies */
function buildFlowerClump(a: Atlas): void {
  for (let i = 0; i < 6; i++) {
    const ang = i * 1.05 + 0.2;
    leaf(a, V(0, 0.03, 0), V(Math.cos(ang) * 0.6, 0.2 + 0.1 * rnd(i), Math.sin(ang) * 0.6), 0.24, 0.14, { tint: 0, tone: 0.84 + 0.22 * rnd(i + 2), sway: sways(0.6) });
  }
  const heads: [number, number, number][] = [[0.02, 1, 0.04], [0.44, 0.82, 0.14], [-0.4, 0.88, 0.2], [0.16, 0.72, -0.44], [-0.3, 0.66, -0.36], [0.56, 0.6, -0.3], [-0.1, 0.78, 0.52]];
  heads.forEach(([x, y, z], i) => {
    stalk(a, V(x * 0.25, 0.04, z * 0.25), V(x, y - 0.04, z), 0.04, { tint: 0, tone: 0.72, sway: sways(1) });
    // a flat head of petals turned a little from the sky, its middle a fixed gold
    const tilt = 0.35 + 0.3 * rnd(i);
    const turn = i * 1.9;
    a.add(new THREE.CircleGeometry(0.19, 8), at(x, y, z, 1, 1, 1, -Math.PI / 2 + tilt, turn, 0), { tint: 1, tone: (p) => 0.96 + 0.26 * rnd(Math.round(p.x * 71 + p.z * 53 + i)), sway: sways(1) });
    a.add(new THREE.TetrahedronGeometry(0.07, 0), at(x, y + 0.03, z, 1, 0.7, 1, 0, turn), { fixed: 0xc88a20, tone: 1, sway: sways(1) });
  });
}

const BUILDERS: Readonly<Record<Family, (a: Atlas) => void>> = {
  cap_mushroom: buildCapMushroom,
  cluster_mushroom: buildClusterMushroom,
  shelf_mushroom: buildShelfMushroom,
  truffle_mound: buildTruffleMound,
  low_berry: buildLowBerry,
  tall_herb: buildTallHerb,
  rosette: buildRosette,
  grass_tuft: buildGrassTuft,
  water_plant: buildWaterPlant,
  shoot: buildShoot,
  root_tuft: buildRootTuft,
  crust: buildCrust,
  kelp: buildKelp,
  shell_bed: buildShellBed,
  crab: buildCrab,
  rock_nodule: buildRockNodule,
  hive: buildHive,
  vine: buildVine,
  flower_clump: buildFlowerClump,
};

export interface ForageAtlas {
  readonly geometry: THREE.BufferGeometry;
  /** triangles of each family, by its number; and of them all with the glint's two */
  readonly triangles: readonly number[];
  readonly total: number;
  readonly vertices: number;
}

/** every family's model in one geometry, and the glint's square */
export function buildForageAtlas(): ForageAtlas {
  const a = new Atlas();
  FAMILIES.forEach((f, i) => {
    a.fam = i;
    BUILDERS[f](a);
  });
  a.glint();
  return { geometry: a.build(), triangles: a.tris.slice(), total: a.idx.length / 3, vertices: a.pos.length / 3 };
}
