/**
 * The models of the plants a world of version 2 grows (docs/V3/nodes/W2-flora.md) that the first renderer had no
 * template for: birch, poplar, willow, juniper, bamboo, fruit tree, baobab, the shrubs (berry bush, tea, sage,
 * agave, prickly pear, reeds, fern, vine, sunflowers, tall grass) and what lies on the ground (boulder, log,
 * stump, flower clump) — and the low models the trees and the larger shrubs are drawn with far off.
 *
 * They are built with the same vocabulary as the first templates (vegetation.ts: clumps of leaf cards on a dark
 * ball, specs/art/STYLE.md §5), so a new tree sits in the picture as the old ones do. Every vertex says what
 * part of the plant it is (its `aLeaf`):
 *   PART_WOOD    wood in its own colour (the vertex colour)
 *   PART_LEAF    foliage: painted in four tones of the plant's first colour, or of its region's woods
 *   PART_ACCENT  whatever the plant's second colour paints (a birch's bark, a cane, a plume, a flower head):
 *                the second colour times the vertex colour
 *   PART_FRUIT   the same, shown only on the plants that bear (fruit in a crown, berries on a bush)
 *   PART_ROCK    stone: flat facets in the region's two rock paints
 *
 * A model is built to a size of its own (a few metres); the registry (plantRegistry.ts) says which height and
 * which radius of it a plant's height and crown are measured against.
 */
import * as THREE from 'three';
import { PlantBuilder, TRUNK, WHITE, clump, mulberry, trunk } from './vegetation';

export const PART_WOOD = 0;
export const PART_LEAF = 1;
export const PART_ACCENT = 2;
export const PART_FRUIT = 3;
export const PART_ROCK = 4;

/** the rows a plant of tea is drawn as stand this far apart (m): the spacing of the terraces' crop rows (core/world/floraTables.ts) */
export const TEA_ROWS = 2.6;

const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const ONE = V(1, 1, 1);
const NO_TURN = new THREE.Quaternion();
const grey = (k: number): THREE.Color => new THREE.Color(k, k, k);
const CUT_WOOD = new THREE.Color(0x9a8260);
const BARK = new THREE.Color(0x4d3f33);

type Shade = (p: THREE.Vector3, n: THREE.Vector3) => number;

/** a tapered round length from a to c: a trunk, a limb, a cane, a log */
function tube(b: PlantBuilder, a: THREE.Vector3, c: THREE.Vector3, r0: number, r1: number, seg: number, color: THREE.Color, part = PART_WOOD, shade?: Shade, stacks = 1): void {
  const d = c.clone().sub(a);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, stacks, true);
  g.translate(0, len / 2, 0);
  b.solid(g, new THREE.Matrix4().compose(a, new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()), ONE), color, part, shade);
}

/** a rounded lump (twenty faces, or eight), stretched: the core of a plume, a pad, a fruit */
function blob(b: PlantBuilder, c: THREE.Vector3, sx: number, sy: number, sz: number, part: number, color: THREE.Color, shade?: Shade, faces: 8 | 20 | 4 = 20, turn: THREE.Quaternion = NO_TURN): void {
  const g = faces === 4 ? new THREE.TetrahedronGeometry(1, 0) : faces === 8 ? new THREE.OctahedronGeometry(1, 0) : new THREE.IcosahedronGeometry(1, 0);
  b.solid(g, new THREE.Matrix4().compose(c, turn, V(sx, sy, sz)), color, part, shade, c);
}

/** a blade: one triangle from a narrow foot to a point (grass, reed, a young frond); tones from foot to tip */
function blade(b: PlantBuilder, foot: THREE.Vector3, tip: THREE.Vector3, half: number, side: THREE.Vector3, part: number, k0: number, k1: number, color: THREE.Color = WHITE): void {
  const s = side.clone().normalize().multiplyScalar(half);
  const n = tip.clone().sub(foot).cross(s).normalize();
  // (shaded as the tuft's own soft mass: up and a little out, whichever way the flat of the blade happens to face)
  n.set(n.x * 0.35, 0.8, n.z * 0.35).normalize();
  b.tri(foot.clone().sub(s), foot.clone().add(s), tip, n, part, color, k0, k0, k1);
}

/** a flat four-cornered leaf from a to c, `half` wide at its middle (two triangles): a frond's length, an agave's blade, a diamond head */
function leaf(b: PlantBuilder, a: THREE.Vector3, c: THREE.Vector3, half: number, side: THREE.Vector3, lift: number, part: number, k0: number, k1: number, k2: number, color: THREE.Color = WHITE, at = 0.5): void {
  const s = side.clone().normalize().multiplyScalar(half);
  const mid = a.clone().lerp(c, at);
  mid.y += lift;
  const n = c.clone().sub(a).cross(s).normalize();
  if (n.y < 0) n.negate();
  n.lerp(UP, 0.35).normalize();
  const l = mid.clone().sub(s);
  const r = mid.clone().add(s);
  b.tri(a, r, l, n, part, color, k0, k1, k1);
  b.tri(l, r, c, n, part, color, k1, k1, k2);
}

/** a flat disc of `n` points round c facing `f` (alternate radii make a star: petals), as a fan */
function disc(b: PlantBuilder, c: THREE.Vector3, f: THREE.Vector3, r0: number, r1: number, n: number, part: number, color: THREE.Color, k = 1): void {
  const fn = f.clone().normalize();
  const a = Math.abs(fn.y) < 0.9 ? UP : V(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(a, fn).normalize();
  const w = new THREE.Vector3().crossVectors(fn, u).normalize();
  const at = (i: number): THREE.Vector3 => {
    const ang = (i / n) * Math.PI * 2;
    const r = i % 2 ? r1 : r0;
    return c.clone().addScaledVector(u, Math.cos(ang) * r).addScaledVector(w, Math.sin(ang) * r);
  };
  for (let i = 0; i < n; i++) b.tri(c, at(i), at(i + 1), fn, part, color, k, k, k);
}

/** a tuft of blades standing from one foot: reeds, tall grass; `heads` of its tallest carry a seed head of the second colour at their tip */
function tuft(b: PlantBuilder, rnd: () => number, x: number, z: number, blades: number, h: number, spread: number, half: number, heads: number, headLen: number, droop: number): void {
  for (let k = 0; k < blades; k++) {
    const a = (k / blades) * Math.PI * 2 + rnd() * 0.8;
    const out = 0.25 + 0.75 * rnd();
    const foot = V(x + Math.cos(a) * 0.06 * out, -0.08, z + Math.sin(a) * 0.06 * out);
    // (the first few stand tallest and straightest: the ones that carry a head)
    const head = k < heads;
    const hh = h * (head ? 0.98 + 0.14 * rnd() : 0.62 + 0.36 * rnd());
    const lean = head ? 0.35 : 1;
    const tip = V(x + Math.cos(a) * spread * out * lean, hh, z + Math.sin(a) * spread * out * lean);
    const side = V(-Math.sin(a), 0, Math.cos(a));
    // (light even at the foot: a stand of reeds is thin, the sky comes through it)
    blade(b, foot, tip, half * (0.7 + 0.6 * rnd()), side, PART_LEAF, 0.92, 1.12 + 0.12 * rnd());
    if (!head) continue;
    // the head: a narrow spindle on from the blade's tip, hanging a little where the plant's do
    const end = tip.clone().add(V(Math.cos(a) * headLen * (0.25 + droop), headLen * (1 - 1.5 * droop), Math.sin(a) * headLen * (0.25 + droop)));
    leaf(b, tip.clone().add(V(0, -0.05, 0)), end, half * 0.7, side, 0, PART_ACCENT, 0.86, 0.96, 1.02);
  }
}

/** leaf cards hanging from under a crown: a willow's curtain, a birch's twigs */
function curtain(b: PlantBuilder, rnd: () => number, n: number, r0: number, r1: number, top: number, wide: number, high: number, depth: number): void {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rnd() * 0.5;
    const r = r0 + (r1 - r0) * rnd();
    const out = V(Math.cos(a), 0, Math.sin(a));
    const hh = high * (0.75 + 0.4 * rnd());
    const c = V(out.x * r, top - hh / 2 + 0.3 * (rnd() - 0.5), out.z * r);
    b.spray(c, out.clone().add(V((rnd() - 0.5) * 0.5, 0.05, (rnd() - 0.5) * 0.5)), out.clone().multiplyScalar(0.7).add(V(0, 0.55, 0)).normalize(), wide * (0.8 + 0.4 * rnd()), hh, 0, depth + 0.08 * (rnd() - 0.5));
  }
}

/** the same lump of rock every time: a twenty-faced stone with its corners pushed about */
function stone(b: PlantBuilder, seed: number, c: THREE.Vector3, sx: number, sy: number, sz: number): void {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    // (a corner is shared by five faces: pushed by where it is, so that the faces still meet)
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453;
    const k = 0.78 + 0.4 * (h - Math.floor(h));
    p.setXYZ(i, x * k, y * (0.85 + 0.3 * (k - 0.78)), z * k);
  }
  g.computeVertexNormals();
  b.solid(g, new THREE.Matrix4().compose(c, NO_TURN, V(sx, sy, sz)), WHITE, PART_ROCK);
}

export interface PlantModels {
  [name: string]: THREE.BufferGeometry;
}

/** every model of this file, by name (the near models by their family's name, the far ones with `Far`) */
export function buildPlantModels(): PlantModels {
  const b = new PlantBuilder();
  const out: PlantModels = {};
  let rnd = mulberry(1);

  // ---- birch: a slender pale trunk shown for most of its height, a light crown of small clumps set apart, twigs hanging
  const birchTrunk = (seg: number): void => {
    const pts = [V(0, -0.5, 0), V(0.05, 2.2, 0.02), V(0.16, 4.4, -0.04), V(0.1, 6.3, 0.05)];
    const rr = [0.15, 0.12, 0.085, 0.035];
    for (let i = 0; i < 3; i++) tube(b, pts[i], pts[i + 1], rr[i], rr[i + 1], seg, WHITE, PART_ACCENT, (p) => 0.9 + 0.08 * Math.sin(p.y * 3.1));
  };
  rnd = mulberry(61);
  birchTrunk(6);
  // (the dark marks of the bark: collars a hand high)
  for (const [y, r, x] of [[0.55, 0.15, 0.01], [1.45, 0.135, 0.03], [2.7, 0.118, 0.07], [3.6, 0.1, 0.12]] as const) tube(b, V(x, y, 0), V(x, y + 0.1, 0), r * 1.07, r * 1.07, 5, grey(0.2), PART_ACCENT);
  let crown = V(0.1, 5.0, 0);
  for (const [x, y, z, r] of [[0.15, 6.3, 0, 0.85], [0.95, 5.3, 0.3, 0.75], [-0.85, 5.5, -0.3, 0.8], [0.1, 4.6, -0.95, 0.7], [-0.3, 4.3, 0.9, 0.7], [0.95, 4.0, -0.5, 0.55]] as const) {
    clump(b, rnd, V(x, y, z), r, Math.round(13 * r * r + 5), crown, 0.85, 0.5);
  }
  curtain(b, rnd, 7, 0.9, 1.5, 4.3, 0.42, 1.3, 0.95);
  out.birch = b.build();
  rnd = mulberry(62);
  birchTrunk(4);
  crown = V(0.1, 5.0, 0);
  clump(b, rnd, V(0.1, 5.5, 0), 1.3, 8, crown, 1.2, 0.55);
  clump(b, rnd, V(0.5, 4.3, 0.3), 0.9, 5, crown, 1.2, 0.55);
  out.birchFar = b.build();

  // ---- poplar: a tall narrow column of clumps on a short trunk
  rnd = mulberry(63);
  trunk(b, 1.6, 0.16, TRUNK, [], 6);
  crown = V(0, 4.6, 0);
  for (const [x, y, z, r] of [[0, 2.3, 0, 0.95], [0.12, 3.6, -0.08, 1.1], [-0.1, 5.0, 0.1, 1.05], [0.08, 6.4, 0.05, 0.9], [0, 7.6, -0.05, 0.7], [0, 8.5, 0, 0.45]] as const) {
    clump(b, rnd, V(x, y, z), r, Math.round(10 * r * r + 4), crown);
  }
  out.poplar = b.build();
  rnd = mulberry(64);
  trunk(b, 1.6, 0.16, TRUNK, [], 4);
  clump(b, rnd, V(0, 3.6, 0), 1.25, 6, crown, 1.3);
  clump(b, rnd, V(0, 6.4, 0), 1.05, 5, crown, 1.3);
  out.poplarFar = b.build();

  // ---- willow: a short thick leaning trunk, a broad dome, and curtains of leaves hanging from its rim
  const willowTrunk = (seg: number, limbs: boolean): void => {
    tube(b, V(0, -0.5, 0), V(0.15, 1.9, 0), 0.32, 0.24, seg, WHITE, PART_ACCENT, (p) => 0.85 + 0.1 * Math.sin(p.y * 4.0));
    if (!limbs) return;
    for (const [x, y, z] of [[1.3, 3.4, 0.3], [-1.2, 3.3, -0.5], [0.1, 3.6, 1.2]] as const) tube(b, V(0.15, 1.85, 0), V(x, y, z), 0.14, 0.07, 5, WHITE, PART_ACCENT, () => 0.82);
  };
  rnd = mulberry(65);
  willowTrunk(7, true);
  crown = V(0, 3.6, 0);
  for (const [x, y, z, r] of [[0, 4.9, 0, 1.35], [1.7, 4.2, 0.4, 1.15], [-1.6, 4.3, -0.5, 1.2], [0.3, 4.1, -1.7, 1.05], [-0.4, 4.0, 1.7, 1.1], [1.2, 4.6, -1.1, 0.85]] as const) {
    clump(b, rnd, V(x, y, z), r, Math.round(8 * r * r + 3), crown);
  }
  curtain(b, rnd, 22, 2.2, 3.2, 3.9, 1.0, 2.7, 0.93);
  out.willow = b.build();
  rnd = mulberry(66);
  willowTrunk(4, false);
  clump(b, rnd, V(0, 4.3, 0), 2.3, 8, crown, 1.2);
  curtain(b, rnd, 8, 2.2, 3.0, 3.9, 1.5, 2.5, 0.93);
  out.willowFar = b.build();

  // ---- juniper: low, the trunk twisted, a few dense dark clumps off to one side
  rnd = mulberry(67);
  tube(b, V(0, -0.4, 0), V(0.25, 0.9, 0.1), 0.2, 0.16, 5, WHITE, PART_ACCENT, () => 0.88);
  tube(b, V(0.25, 0.9, 0.1), V(-0.1, 1.7, 0.3), 0.16, 0.11, 5, WHITE, PART_ACCENT, () => 0.8);
  tube(b, V(-0.1, 1.7, 0.3), V(0.3, 2.4, 0), 0.11, 0.06, 5, WHITE, PART_ACCENT, () => 0.84);
  tube(b, V(0.25, 0.9, 0.1), V(1.0, 1.6, -0.3), 0.09, 0.05, 4, WHITE, PART_ACCENT, () => 0.8);
  crown = V(0.2, 1.9, 0);
  for (const [x, y, z, r] of [[0.3, 2.7, 0, 0.8], [1.1, 1.9, -0.3, 0.7], [-0.5, 2.1, 0.5, 0.75], [0.1, 1.6, -0.8, 0.6], [-0.9, 1.4, -0.1, 0.5]] as const) {
    clump(b, rnd, V(x, y, z), r, Math.round(12 * r * r + 3), crown, 0.8);
  }
  out.juniper = b.build();
  rnd = mulberry(68);
  tube(b, V(0, -0.4, 0), V(0.2, 1.6, 0.1), 0.2, 0.1, 4, WHITE, PART_ACCENT, () => 0.85);
  clump(b, rnd, V(0.3, 2.2, 0), 1.2, 6, crown, 1.2);
  out.juniperFar = b.build();

  // ---- bamboo: a clump of canes leaning out a little, bare for half their height, each arching over at the top
  // under full sprays of leaves that hang towards its tip; the canes are the plant's second colour
  const bamboo = (seed: number, canes: number, far: boolean): THREE.BufferGeometry => {
    const r = mulberry(seed);
    for (let k = 0; k < canes; k++) {
      const ang = k * 2.39996 + r() * 0.5;
      const rr = far ? 0.35 : 0.2 + 0.55 * r();
      const out3 = V(Math.cos(ang), 0, Math.sin(ang));
      const h = far ? 8.4 + 1.1 * r() : 7.0 + 2.5 * r();
      const lean = 0.06 + 0.1 * r();
      const base = V(out3.x * rr, -0.4, out3.z * rr);
      const top = V(base.x + out3.x * lean * h * 0.72, h * 0.72, base.z + out3.z * lean * h * 0.72);
      // (a shade darker at the foot, where the grove's own shadow lies, and ringed at a knot)
      const knot = (base.y + top.y) / 2;
      tube(b, base, top, far ? 0.11 : 0.078, far ? 0.07 : 0.05, far ? 3 : 4, WHITE, PART_ACCENT, (p) => 0.8 + 0.28 * Math.min(1, Math.max(0, p.y / (h * 0.72))) - (Math.abs(p.y - knot) < 0.2 ? 0.14 : 0), far ? 1 : 2);
      const n = far ? 4 : 5;
      for (let j = 0; j < n; j++) {
        const t = (j + 0.5) / n;
        // the top of the cane arches outwards and hangs: its sprays follow it, the outer ones tipped down
        const c = top.clone().addScaledVector(out3, 2.1 * t * t + 0.1).add(V((r() - 0.5) * 0.6, h * 0.28 * (t - 0.45 * t * t) + 0.15, (r() - 0.5) * 0.6));
        const face = out3.clone().multiplyScalar(0.3 + 0.8 * t).add(V(r() - 0.5, 0.9 - 0.5 * t, r() - 0.5));
        const sn = out3.clone().multiplyScalar(0.45).add(V(0, 0.9, 0)).normalize();
        b.spray(c, face, sn, (far ? 5.2 : 2.6) * (1 - 0.25 * t), far ? 3.6 : 1.8, r() * Math.PI, (far ? 0.98 : 0.9) + 0.24 * t + 0.06 * (r() - 0.5));
      }
      if (far) continue;
      // side sprays down the cane's upper half
      for (const f of [0.42, 0.53, 0.64]) {
        const c = base.clone().lerp(top, f / 0.72).addScaledVector(out3, 0.55).add(V((r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5));
        b.spray(c, out3.clone().add(V(r() - 0.5, 0.5, r() - 0.5)), out3.clone().multiplyScalar(0.7).add(V(0, 0.6, 0)).normalize(), 1.7, 1.15, r() * Math.PI, 0.8 + 0.12 * r());
      }
    }
    // (no dark core as a broadleaf's clump has: a bamboo's top is all light and air)
    return b.build();
  };
  out.bamboo = bamboo(71, 7, false);
  out.bambooFar = bamboo(72, 3, true);

  // ---- fruit tree: a small round broadleaf, fruit hanging in the outer crown of the ones that bear
  rnd = mulberry(73);
  trunk(b, 1.3, 0.16, TRUNK, [[0.5, 0.8, 1.0], [2.7, 0.85, 0.95], [4.6, 0.75, 0.9]]);
  crown = V(0, 2.6, 0);
  const fruitClumps = [[0, 3.2, 0, 1.15], [1.15, 2.6, 0.2, 0.95], [-1.05, 2.7, -0.35, 1.0], [0.2, 2.5, -1.1, 0.85], [-0.2, 2.4, 1.1, 0.9]] as const;
  for (const [x, y, z, r] of fruitClumps) clump(b, rnd, V(x, y, z), r, Math.round(12 * r * r + 4), crown);
  for (let k = 0; k < 16; k++) {
    const [x, y, z, r] = fruitClumps[k % fruitClumps.length];
    const a = rnd() * Math.PI * 2;
    const n = V(Math.cos(a) * 0.85, -0.3 + 0.55 * rnd(), Math.sin(a) * 0.85).normalize();
    // (on the outside of the crown: a clump's own far side from the trunk)
    if (n.x * x + n.z * z < 0) n.set(-n.x, n.y, -n.z);
    blob(b, V(x, y, z).addScaledVector(n, r * 0.95), 0.105, 0.105, 0.105, PART_FRUIT, WHITE, (p, nn) => 0.9 + 0.2 * nn.y, 8);
  }
  out.fruit_tree = b.build();

  // ---- baobab: a bottle of a trunk, a handful of stubby limbs, a thin flat crown
  const baobabTrunk = (seg: number): void => {
    const sh: Shade = (p) => 0.84 + 0.12 * Math.sin(p.y * 1.7 + p.x * 2.0);
    tube(b, V(0, -0.6, 0), V(0, 1.2, 0), 1.05, 1.12, seg, WHITE, PART_ACCENT, sh);
    tube(b, V(0, 1.2, 0), V(0, 3.4, 0), 1.12, 0.85, seg, WHITE, PART_ACCENT, sh);
    tube(b, V(0, 3.4, 0), V(0, 4.8, 0), 0.85, 0.5, seg, WHITE, PART_ACCENT, sh);
  };
  rnd = mulberry(75);
  baobabTrunk(8);
  crown = V(0, 5.2, 0);
  for (let k = 0; k < 6; k++) {
    const a = k * 1.047 + rnd() * 0.5;
    const r = 1.9 + 0.6 * rnd();
    const end = V(Math.cos(a) * r, 5.8 + 0.9 * rnd(), Math.sin(a) * r);
    tube(b, V(Math.cos(a) * 0.3, 4.5, Math.sin(a) * 0.3), end, 0.24, 0.09, 5, WHITE, PART_ACCENT, () => 0.8);
    const cr = 0.75 + 0.22 * rnd();
    clump(b, rnd, end.clone().add(V(Math.cos(a) * 0.3, 0.35, Math.sin(a) * 0.3)), cr, Math.round(8 * cr * cr + 3), crown);
  }
  out.baobab = b.build();
  rnd = mulberry(76);
  tube(b, V(0, -0.6, 0), V(0, 4.7, 0), 1.08, 0.5, 5, WHITE, PART_ACCENT, (p) => 0.84 + 0.1 * Math.sin(p.y * 1.7));
  clump(b, rnd, V(0.6, 6.2, 0.2), 1.7, 6, crown, 1.25);
  clump(b, rnd, V(-1.3, 5.8, -0.5), 1.25, 4, crown, 1.25);
  out.baobabFar = b.build();

  // ---- berry bush: three low clumps, berries on the outside of the ones that bear
  rnd = mulberry(77);
  crown = V(0, 0.4, 0);
  const berryClumps = [[0, 0.55, 0, 0.68], [0.5, 0.42, 0.25, 0.5], [-0.42, 0.4, -0.3, 0.5]] as const;
  for (const [x, y, z, r] of berryClumps) clump(b, rnd, V(x, y, z), r, Math.round(14 * r * r + 3), crown);
  for (let k = 0; k < 9; k++) {
    const [x, y, z, r] = berryClumps[k % 3];
    const a = rnd() * Math.PI * 2;
    const n = V(Math.cos(a), 0.15 + 0.7 * rnd(), Math.sin(a)).normalize();
    blob(b, V(x, y, z).addScaledVector(n, r * 0.92), 0.075, 0.075, 0.075, PART_FRUIT, WHITE, (p, nn) => 0.92 + 0.18 * nn.y, 4);
  }
  out.berry_bush = b.build();

  // ---- tea: a clipped hedge, one row of the plantation as long as a cell of the flora's grid (along x), new growth
  // lighter on its top. One plant of the catalogue is the tea of its whole 8 m cell: the scatter stands up to
  // three such rows for it, TEA_ROWS m apart (floraScatter.ts).
  const g = new THREE.SphereGeometry(1, 8, 2, 0, Math.PI * 2, 0, Math.PI / 2);
  b.solid(g, new THREE.Matrix4().compose(V(0, -0.12, 0), NO_TURN, V(4.1, 1.0, 0.72)), WHITE, PART_LEAF, (p) => 0.82 + 0.3 * Math.min(1, Math.max(0, p.y / 0.85)), V(0, -0.5, 0));
  rnd = mulberry(79);
  for (let k = 0; k < 6; k++) {
    const x = -3.0 + 1.2 * k + 0.3 * (rnd() - 0.5);
    b.leafCard(V(x, 0.86 - 0.012 * x * x, (rnd() - 0.5) * 0.4), V((rnd() - 0.5) * 0.4, 1, (rnd() - 0.5) * 0.4), V(0, 1, 0), 1.0, rnd() * Math.PI, 1.16 + 0.06 * rnd());
  }
  out.tea_bush = b.build();
  // (far off: a low ridge)
  for (const side of [-1, 1]) {
    const a = V(-4.0, -0.1, side * 0.7);
    const d = V(4.0, -0.1, side * 0.7);
    const t0 = V(-3.6, 0.85, 0);
    const t1 = V(3.6, 0.85, 0);
    const n = V(0, 0.9, side * 0.436);
    b.tri(a, t0, t1, n, PART_LEAF, WHITE, 0.84, 1.12, 1.12);
    b.tri(a, t1, d, n, PART_LEAF, WHITE, 0.84, 1.12, 0.84);
  }
  out.teaFar = b.build();

  // ---- sage: a low grey scrub of small leaves; the ones in flower carry spikes of the second colour
  rnd = mulberry(81);
  crown = V(0, 0.25, 0);
  for (const [x, y, z, r] of [[0, 0.38, 0, 0.5], [0.4, 0.3, 0.2, 0.4], [-0.35, 0.28, -0.25, 0.42], [0.05, 0.3, -0.45, 0.36]] as const) clump(b, rnd, V(x, y, z), r, Math.round(12 * r * r + 2), crown, 0.7);
  for (let k = 0; k < 6; k++) {
    const a = rnd() * Math.PI * 2;
    const r = 0.45 * rnd();
    blade(b, V(Math.cos(a) * r, 0.45, Math.sin(a) * r), V(Math.cos(a) * r * 1.25, 0.82 + 0.18 * rnd(), Math.sin(a) * r * 1.25), 0.035, V(-Math.sin(a), 0, Math.cos(a)), PART_FRUIT, 0.9, 1.08);
  }
  out.sage = b.build();

  // ---- agave: a rosette of thick pointed blades, the inner ones upright
  rnd = mulberry(83);
  for (let k = 0; k < 13; k++) {
    const inner = k >= 8;
    const a = (k / (inner ? 5 : 8)) * Math.PI * 2 + rnd() * 0.3;
    const o = V(Math.cos(a), 0, Math.sin(a));
    const reach = inner ? 0.42 : 0.95 + 0.1 * rnd();
    const rise = inner ? 0.95 + 0.15 * rnd() : 0.55 + 0.2 * rnd();
    leaf(b, V(o.x * 0.08, 0, o.z * 0.08), V(o.x * reach, rise, o.z * reach), 0.12, V(-o.z, 0, o.x), inner ? 0 : -0.08, PART_LEAF, 0.86, 1.06, 1.22, WHITE, 0.4);
  }
  out.agave = b.build();

  // ---- prickly pear: flat pads standing on one another, fruit on the rims of the ones that bear
  rnd = mulberry(85);
  const pads: [number, number, number, number, number][] = [[0, 0.3, 0, 0.36, 0.2], [0.34, 0.26, 0.2, 0.3, 1.2], [-0.3, 0.25, -0.18, 0.3, 2.3], [0.12, 0.72, 0.05, 0.3, 0.6], [0.52, 0.62, 0.3, 0.25, 1.6], [-0.42, 0.63, -0.25, 0.26, 2.7]];
  for (const [x, y, z, r, yaw] of pads) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.4, yaw, (rnd() - 0.5) * 0.4));
    blob(b, V(x, y, z), r * 0.85, r, 0.075, PART_LEAF, WHITE, (p, n) => 0.96 + 0.2 * Math.min(1, Math.max(0, p.y)) + 0.06 * n.y, 20, q);
  }
  for (let k = 0; k < 6; k++) {
    const [x, y, z, r, yaw] = pads[3 + (k % 3)];
    const t = (k < 3 ? -0.5 : 0.5) + 0.3 * (rnd() - 0.5);
    blob(b, V(x + Math.cos(yaw) * r * t * 0.8, y + r * (0.95 - 0.25 * Math.abs(t)), z - Math.sin(yaw) * r * t * 0.8), 0.06, 0.085, 0.06, PART_FRUIT, WHITE, (p, n) => 0.9 + 0.2 * n.y, 4);
  }
  out.prickly_pear = b.build();

  // ---- reeds: a patch of tall tufts, some with a plume: a bed of them along a shore
  // (a plant of reeds is the reeds of its whole 8 m cell of bank: tufts spread over most of it, so that cell
  // after cell they close into a bed)
  const reedAt: [number, number][] = [[0, 0], [2.3, 0.8], [-1.9, 1.6], [-1.1, -2.3], [2.0, -1.9], [0.4, 2.9], [-3.0, -0.4]];
  rnd = mulberry(87);
  for (const [x, z] of reedAt) tuft(b, rnd, x, z, 12, 2.15, 0.55, 0.065, 3, 0.28, 0.08);
  out.reed = b.build();
  rnd = mulberry(88);
  for (const [x, z] of reedAt) {
    const a = rnd() * Math.PI * 2;
    blade(b, V(x, -0.1, z), V(x + 0.3 * Math.cos(a), 1.9 + 0.3 * rnd(), z + 0.3 * Math.sin(a)), 0.5, V(-Math.sin(a), 0, Math.cos(a)), PART_LEAF, 0.92, 1.2);
    blade(b, V(x + 0.2, -0.1, z - 0.2), V(x + 0.2 - 0.3 * Math.sin(a), 1.6 + 0.3 * rnd(), z - 0.2 + 0.3 * Math.cos(a)), 0.45, V(Math.cos(a), 0, Math.sin(a)), PART_LEAF, 0.9, 1.14);
  }
  out.reedFar = b.build();

  // ---- fern: a rosette of arching fronds, a few young ones upright in its middle
  rnd = mulberry(89);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + rnd() * 0.4;
    const o = V(Math.cos(a), 0, Math.sin(a));
    const reach = 0.8 + 0.25 * rnd();
    leaf(b, V(o.x * 0.05, 0.02, o.z * 0.05), V(o.x * reach, 0.2 + 0.2 * rnd(), o.z * reach), 0.17, V(-o.z, 0, o.x), 0.36, PART_LEAF, 0.84, 1.04, 1.2, WHITE, 0.55);
  }
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + 0.4;
    blade(b, V(0, 0, 0), V(Math.cos(a) * 0.15, 0.6 + 0.12 * k, Math.sin(a) * 0.15), 0.06, V(-Math.sin(a), 0, Math.cos(a)), PART_LEAF, 0.8, 1.14);
  }
  out.fern = b.build();

  // ---- vine: big leaves sprawled over a low support, bunches hanging under the ones that bear
  rnd = mulberry(91);
  crown = V(0, 0.4, 0);
  const vineClumps = [[0, 0.7, 0, 0.75], [0.7, 0.45, 0.3, 0.6], [-0.6, 0.5, -0.4, 0.62]] as const;
  for (const [x, y, z, r] of vineClumps) clump(b, rnd, V(x, y, z), r, Math.round(8 * r * r + 3), crown, 1.15);
  tube(b, V(0.1, -0.1, 0), V(-0.1, 1.25, 0.1), 0.04, 0.025, 3, BARK);
  tube(b, V(0.5, -0.1, 0.3), V(0.9, 0.95, 0.5), 0.035, 0.02, 3, BARK);
  for (let k = 0; k < 5; k++) {
    const [x, y, z, r] = vineClumps[k % 3];
    const a = rnd() * Math.PI * 2;
    blob(b, V(x + Math.cos(a) * r * 0.85, y - r * 0.35, z + Math.sin(a) * r * 0.85), 0.085, 0.16, 0.085, PART_FRUIT, WHITE, (p, n) => 0.88 + 0.2 * n.y, 8);
  }
  out.vine = b.build();

  // ---- sunflowers: a stand of them, every head turned the same way (+z: where the sun stands at noon)
  const DISC = new THREE.Color(0x3e2a14);
  const sunflower = (x: number, z: number, h: number, far: boolean): void => {
    const foot = V(x, -0.08, z);
    const neck = V(x + 0.02, h, z + 0.05);
    const face = V(0, 0.38, 1).normalize();
    if (far) {
      blade(b, foot, neck, 0.05, V(1, 0, 0), PART_LEAF, 0.74, 0.92);
      disc(b, neck.clone().addScaledVector(face, 0.03), face, 0.27, 0.27, 4, PART_ACCENT, WHITE, 1);
      return;
    }
    tube(b, foot, neck, 0.024, 0.018, 3, WHITE, PART_LEAF, (p) => 0.72 + 0.16 * (p.y / h));
    for (const [f, a] of [[0.3, 0.4], [0.5, 2.6], [0.68, 4.6]] as const) {
      const at = foot.clone().lerp(neck, f);
      const o = V(Math.cos(a), 0, Math.sin(a));
      leaf(b, at, at.clone().addScaledVector(o, 0.42).add(V(0, 0.08, 0)), 0.13, V(-o.z, 0, o.x), 0.06, PART_LEAF, 0.84, 1.0, 1.08);
    }
    const c = neck.clone().addScaledVector(face, 0.03);
    disc(b, c, face, 0.24, 0.15, 14, PART_ACCENT, WHITE, 1);
    disc(b, c.clone().addScaledVector(face, 0.015), face, 0.095, 0.095, 6, PART_WOOD, DISC, 1);
  };
  const sunAt: [number, number, number][] = [[0, 0, 1.9], [0.7, 0.35, 1.65], [-0.6, 0.5, 1.75], [-0.35, -0.7, 1.55], [0.6, -0.6, 1.82]];
  for (const [x, z, h] of sunAt) sunflower(x, z, h, false);
  out.sunflower = b.build();
  for (const [x, z, h] of sunAt.slice(0, 3)) sunflower(x, z, h, true);
  out.sunflowerFar = b.build();

  // ---- tall grass (sorghum, wild rice, fibre grass): tufts of long blades, seed heads of the second colour nodding over them
  rnd = mulberry(93);
  // (a stand of it is its cell's: tufts over a few metres)
  for (const [x, z] of [[0, 0], [1.4, 0.5], [-1.1, 1.0], [-0.6, -1.4], [1.2, -1.1]] as const) tuft(b, rnd, x, z, 10, 1.45, 0.45, 0.05, 3, 0.3, 0.3);
  out.tall_grass = b.build();

  // ---- boulder: a big stone and a smaller one against it
  stone(b, 3.1, V(0, 0.45, 0), 1.45, 1.05, 1.2);
  stone(b, 7.7, V(1.3, 0.15, 0.55), 0.8, 0.6, 0.7);
  out.boulder = b.build();
  // (and the small rock of every stony place: one stone)
  stone(b, 5.3, V(0, 0.22, 0), 0.62, 0.5, 0.56);
  out.rock = b.build();

  // ---- a fallen log (lying along x): bark, pale cut ends, the stub of a limb, moss along its back
  rnd = mulberry(95);
  tube(b, V(-1.6, 0.2, 0), V(1.6, 0.25, 0.05), 0.24, 0.2, 6, BARK, PART_WOOD, (p, n) => 0.8 + 0.3 * Math.max(0, n.y) + 0.08 * Math.sin(p.x * 5));
  disc(b, V(-1.6, 0.2, 0), V(-1, 0.02, 0), 0.24, 0.24, 6, PART_WOOD, CUT_WOOD, 0.95);
  disc(b, V(1.6, 0.25, 0.05), V(1, 0.02, 0), 0.2, 0.2, 6, PART_WOOD, CUT_WOOD, 0.85);
  tube(b, V(0.45, 0.32, 0.05), V(0.62, 0.78, 0.36), 0.06, 0.03, 4, BARK);
  for (const x of [-0.9, -0.2, 0.9]) b.leafCard(V(x, 0.43, 0.02), V((rnd() - 0.5) * 0.3, 1, (rnd() - 0.5) * 0.3), UP, 0.55, rnd() * Math.PI, 0.98);
  out.log = b.build();

  // ---- a stump: a short butt with its roots spread, the cut pale
  tube(b, V(0, -0.3, 0), V(0, 0.5, 0), 0.42, 0.3, 7, BARK, PART_WOOD, (p, n) => 0.82 + 0.2 * Math.max(0, n.x * 0.5 + n.z * 0.5) + 0.12 * (p.y > 0.3 ? 1 : 0));
  disc(b, V(0, 0.5, 0), UP, 0.3, 0.3, 7, PART_WOOD, CUT_WOOD, 1);
  for (const a of [0.5, 2.5, 4.4]) tube(b, V(Math.cos(a) * 0.25, 0.22, Math.sin(a) * 0.25), V(Math.cos(a) * 0.75, -0.2, Math.sin(a) * 0.75), 0.11, 0.05, 4, BARK, PART_WOOD, () => 0.85);
  out.stump = b.build();

  // ---- a clump of meadow flowers: thin stalks, each a small head of the clump's colour
  rnd = mulberry(97);
  for (let k = 0; k < 10; k++) {
    const a = rnd() * Math.PI * 2;
    const r = 0.42 * Math.sqrt(rnd());
    const foot = V(Math.cos(a) * r * 0.5, -0.04, Math.sin(a) * r * 0.5);
    const top = V(Math.cos(a) * r, 0.26 + 0.2 * rnd(), Math.sin(a) * r);
    const side = V(-Math.sin(a), 0, Math.cos(a));
    blade(b, foot, top, 0.014, side, PART_LEAF, 0.78, 1.0);
    disc(b, top, V(Math.cos(a) * 0.4, 1, Math.sin(a) * 0.4), 0.062, 0.062, 5, PART_ACCENT, WHITE, 0.96 + 0.1 * rnd());
  }
  for (let k = 0; k < 6; k++) {
    const a = k * 1.05 + 0.3;
    blade(b, V(0, -0.04, 0), V(Math.cos(a) * 0.34, 0.16 + 0.1 * rnd(), Math.sin(a) * 0.34), 0.05, V(-Math.sin(a), 0, Math.cos(a)), PART_LEAF, 0.78, 1.06);
  }
  out.flower_clump = b.build();

  // ---- a cactus far off: its trunk and two arms, no more
  const cg: Shade = (p) => 0.8 + 0.28 * Math.min(1, Math.max(0, p.y / 3.2));
  tube(b, V(0, -0.2, 0), V(0, 3.05, 0), 0.26, 0.2, 5, WHITE, PART_LEAF, cg);
  tube(b, V(0.2, 1.2, 0), V(0.55, 1.25, 0), 0.13, 0.13, 4, WHITE, PART_LEAF, cg);
  tube(b, V(0.55, 1.15, 0), V(0.55, 2.3, 0), 0.14, 0.12, 4, WHITE, PART_LEAF, cg);
  tube(b, V(-0.2, 1.72, 0), V(-0.5, 1.75, 0), 0.12, 0.12, 4, WHITE, PART_LEAF, cg);
  tube(b, V(-0.5, 1.65, 0), V(-0.5, 2.55, 0), 0.13, 0.11, 4, WHITE, PART_LEAF, cg);
  out.cactusFar = b.build();

  // ---- the trees as they are drawn furthest off (some hundreds of metres: a tree is a few pixels): a stem, one
  // dark lump for the crown's body and a handful of large leaf cards — a kind's outline and no more
  const tiny = (seed: number, stem: [number, number, number, number] | null, accent: boolean, core: [number, number, number, number, number, number], cards: number, size: number, hang = 0): THREE.BufferGeometry => {
    const r = mulberry(seed);
    if (stem) tube(b, V(0, -0.4, 0), V(stem[0], stem[1], 0), stem[2], stem[3], 3, accent ? WHITE : TRUNK, accent ? PART_ACCENT : PART_WOOD, accent ? () => 0.88 : undefined);
    const c = V(core[0], core[1], core[2]);
    blob(b, c, core[3], core[4], core[5], PART_LEAF, WHITE, (p) => 0.64 + 0.22 * Math.min(1, Math.max(0, (p.y - c.y) / (core[4] * 2) + 0.5)), 8);
    for (let k = 0; k < cards; k++) {
      const a = (k / cards) * Math.PI * 2 + r() * 0.6;
      const up = k === 0 ? 1 : 0.15 + 0.5 * r();
      const n = V(Math.cos(a) * (1 - up * 0.6), up, Math.sin(a) * (1 - up * 0.6)).normalize();
      b.leafCard(V(c.x + n.x * core[3] * 0.75, c.y + n.y * core[4] * 0.75, c.z + n.z * core[5] * 0.75), n.clone().add(V(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(0.5)), n.clone().lerp(UP, 0.35).normalize(), size * (0.9 + 0.3 * r()), r() * Math.PI, 0.9 + 0.3 * (n.y * 0.5 + 0.5));
    }
    for (let k = 0; k < hang; k++) {
      const a = (k / hang) * Math.PI * 2 + 0.4;
      const o = V(Math.cos(a), 0, Math.sin(a));
      b.spray(V(o.x * core[3] * 1.05, c.y - 1.5, o.z * core[5] * 1.05), o, o.clone().multiplyScalar(0.7).add(V(0, 0.55, 0)).normalize(), 2.4, 2.8, 0, 0.93);
    }
    return b.build();
  };
  out.broadleafTiny = tiny(101, [0, 2.2, 0.2, 0.14], false, [0, 3.5, 0, 1.7, 1.5, 1.7], 5, 3.1);
  out.birchTiny = tiny(102, [0.1, 6.0, 0.15, 0.05], true, [0.1, 5.2, 0, 1.1, 1.3, 1.1], 4, 2.3);
  out.poplarTiny = tiny(103, [0, 1.8, 0.16, 0.12], false, [0, 5.0, 0, 1.0, 3.4, 1.0], 5, 2.3);
  out.willowTiny = tiny(104, [0.1, 2.0, 0.32, 0.24], true, [0, 4.4, 0, 2.2, 1.5, 2.2], 3, 3.8, 2);
  out.juniperTiny = tiny(105, [0.2, 1.6, 0.2, 0.1], true, [0.3, 2.3, 0, 1.2, 0.9, 1.2], 3, 1.9);
  // (the baobab's trunk is most of it: laid down first, the crown's lump and cards on top)
  tube(b, V(0, -0.6, 0), V(0, 4.9, 0), 1.08, 0.5, 4, WHITE, PART_ACCENT, (p) => 0.84 + 0.1 * Math.sin(p.y * 1.7));
  out.baobabTiny = tiny(106, null, true, [0, 6.3, 0, 2.5, 1.1, 2.5], 4, 3.2);
  // a fir: one ragged cone on its stem
  tube(b, V(0, -0.4, 0), V(0, 1.6, 0), 0.16, 0.12, 3, new THREE.Color(0x5a4638));
  b.solid(new THREE.CylinderGeometry(0.04, 1.5, 5.4, 5, 1, true), new THREE.Matrix4().makeTranslation(0, 3.7, 0), WHITE, PART_LEAF, (p) => 0.72 + 0.4 * Math.min(1, Math.max(0, (p.y - 1.2) / 5.2)));
  out.coniferTiny = b.build();
  // bamboo: two canes and the light of its top
  rnd = mulberry(107);
  for (const [x, z, h] of [[0.3, 0.1, 8.6], [-0.25, -0.2, 7.8]] as const) {
    blade(b, V(x, -0.4, z), V(x * 2.4, h * 0.74, z * 2.4), 0.11, V(1, 0, 0.3), PART_ACCENT, 0.86, 1.0);
    for (let j = 0; j < 3; j++) {
      const t = (j + 0.5) / 3;
      const o = V(x, 0, z).normalize();
      b.spray(V(x * 2.4 + o.x * (2.0 * t * t + 0.2), h * (0.76 + 0.2 * t), z * 2.4 + o.z * (2.0 * t * t + 0.2)), o.clone().multiplyScalar(0.4).add(V(rnd() - 0.5, 0.8, rnd() - 0.5)), o.clone().multiplyScalar(0.4).add(V(0, 0.9, 0)).normalize(), 5.4, 3.8, rnd() * Math.PI, 1.0 + 0.2 * t);
    }
  }
  out.bambooTiny = b.build();
  // a cactus: its trunk and one arm
  tube(b, V(0, -0.2, 0), V(0, 3.05, 0), 0.26, 0.2, 4, WHITE, PART_LEAF, cg);
  tube(b, V(0.2, 1.2, 0), V(0.55, 1.25, 0), 0.13, 0.13, 3, WHITE, PART_LEAF, cg);
  tube(b, V(0.55, 1.15, 0), V(0.55, 2.3, 0), 0.14, 0.12, 3, WHITE, PART_LEAF, cg);
  out.cactusTiny = b.build();

  return out;
}
