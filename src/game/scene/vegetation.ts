/**
 * Plant models for the painted look (specs/art/STYLE.md §5): crowns made of clumps, each a dark
 * inner ball wrapped in cards of painted leaves, the way a background painter builds a tree from
 * leaf masses. Every vertex says how to paint it:
 *   color   trunk colour on wood; on foliage white × how deep in the crown it sits (0.7 inside … 1.15 on top)
 *   normal  for foliage, the normal of the clump's ball (the whole clump shades as one soft mass)
 *   aLeaf   1 on foliage (painted in the biome's four greens), 0 on wood
 *   aCard   1 on leaf cards (alpha-tested with the leaf texture), 0 on solid parts
 */
import * as THREE from 'three';

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class PlantBuilder {
  private pos: number[] = [];
  private nrm: number[] = [];
  private col: number[] = [];
  private uv: number[] = [];
  private leaf: number[] = [];
  private card: number[] = [];

  /** a solid part from any geometry (indexed or not) */
  solid(geo: THREE.BufferGeometry, m: THREE.Matrix4, color: THREE.Color, leaf: number, shade?: (p: THREE.Vector3, n: THREE.Vector3) => number, roundFrom?: THREE.Vector3): void {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.applyMatrix4(m);
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const v = new THREE.Vector3();
    const nn = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i), p.getY(i), p.getZ(i));
      nn.set(n.getX(i), n.getY(i), n.getZ(i));
      if (roundFrom) nn.copy(v).sub(roundFrom).normalize();
      const k = shade ? shade(v, nn) : 1;
      this.pos.push(v.x, v.y, v.z);
      this.nrm.push(nn.x, nn.y, nn.z);
      this.col.push(color.r * k, color.g * k, color.b * k);
      this.uv.push(0, 0);
      this.leaf.push(leaf);
      this.card.push(0);
    }
  }

  /** one card of leaves: centre, the way it faces, the normal it shades with, size, turn, depth tone */
  leafCard(c: THREE.Vector3, facing: THREE.Vector3, shadeN: THREE.Vector3, size: number, turn: number, depth: number): void {
    this.spray(c, facing, shadeN, size, size, turn, depth);
  }

  /** a card of leaves wider or taller than it is square (a hanging spray, a plume): `wide` across, `high` along its own up, after the turn */
  spray(c: THREE.Vector3, facing: THREE.Vector3, shadeN: THREE.Vector3, wide: number, high: number, turn: number, depth: number): void {
    const f = facing.clone().normalize();
    const a = Math.abs(f.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(a, f).normalize();
    const w = new THREE.Vector3().crossVectors(f, u).normalize();
    const cu = Math.cos(turn);
    const su = Math.sin(turn);
    const U = u.clone().multiplyScalar(cu).addScaledVector(w, su).multiplyScalar(wide / 2);
    const V = w.clone().multiplyScalar(cu).addScaledVector(u, -su).multiplyScalar(high / 2);
    const corners = [
      [-1, -1, 0, 0],
      [1, -1, 1, 0],
      [1, 1, 1, 1],
      [-1, -1, 0, 0],
      [1, 1, 1, 1],
      [-1, 1, 0, 1],
    ];
    for (const [x, y, s, t] of corners) {
      this.pos.push(c.x + U.x * x + V.x * y, c.y + U.y * x + V.y * y, c.z + U.z * x + V.z * y);
      this.nrm.push(shadeN.x, shadeN.y, shadeN.z);
      this.col.push(depth, depth, depth);
      this.uv.push(s, t);
      this.leaf.push(1);
      this.card.push(1);
    }
  }

  /**
   * One flat triangle of a solid part (a blade, a petal, a facet): three corners, the normal it shades with,
   * the part it is of (as `solid`'s leaf: 0 wood, 1 foliage, …) and the colour or depth tone of each corner.
   */
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, n: THREE.Vector3, part: number, color: THREE.Color, ka = 1, kb = ka, kc = kb): void {
    const ks = [ka, kb, kc];
    [a, b, c].forEach((p, i) => {
      this.pos.push(p.x, p.y, p.z);
      this.nrm.push(n.x, n.y, n.z);
      this.col.push(color.r * ks[i], color.g * ks[i], color.b * ks[i]);
      this.uv.push(0, 0);
      this.leaf.push(part);
      this.card.push(0);
    });
  }

  /** how many triangles have been added since the last build */
  get triangles(): number {
    return this.pos.length / 9;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aLeaf', new THREE.Float32BufferAttribute(this.leaf, 1));
    g.setAttribute('aCard', new THREE.Float32BufferAttribute(this.card, 1));
    g.computeBoundingSphere();
    this.pos = [];
    this.nrm = [];
    this.col = [];
    this.uv = [];
    this.leaf = [];
    this.card = [];
    return g;
  }
}

export const WHITE = new THREE.Color(1, 1, 1);
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();

export function place(x: number, y: number, z: number, rx = 0, rz = 0, s = 1): THREE.Matrix4 {
  e.set(rx, 0, rz);
  q.setFromEuler(e);
  return m4.clone().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s));
}

/** trunk and a couple of limbs reaching into the crown */
export function trunk(b: PlantBuilder, h: number, r: number, color: THREE.Color, limbs: [number, number, number][], seg = 6): void {
  b.solid(new THREE.CylinderGeometry(r * 0.62, r, h, seg, 1, true), place(0, h / 2, 0), color, 0);
  for (const [ang, tilt, len] of limbs) {
    const g = new THREE.CylinderGeometry(r * 0.25, r * 0.5, len, 5, 1, true);
    g.translate(0, len / 2, 0);
    const mm = new THREE.Matrix4().makeRotationZ(tilt).premultiply(new THREE.Matrix4().makeRotationY(ang)).premultiply(new THREE.Matrix4().makeTranslation(0, h * 0.82, 0));
    b.solid(g, mm, color, 0);
  }
}

/**
 * A clump: a dark ball with cards of leaves around it, more on top. `crown` is the centre of the
 * whole crown: the clumps lean their shading normals away from it, so the crown reads as one mass.
 */
export function clump(b: PlantBuilder, rnd: () => number, c: THREE.Vector3, r: number, cards: number, crown: THREE.Vector3, cardScale = 1): void {
  const ball = new THREE.IcosahedronGeometry(r * 0.8, 0);
  b.solid(ball, place(c.x, c.y, c.z), WHITE, 1, (p) => 0.62 + 0.22 * THREE.MathUtils.clamp((p.y - crown.y) / (r * 2.5) + 0.5, 0, 1), c);
  const out = new THREE.Vector3();
  const n = new THREE.Vector3();
  const sn = new THREE.Vector3();
  const face = new THREE.Vector3();
  for (let k = 0; k < cards; k++) {
    // directions spread evenly (spiral), lifted a little: more leaves face the sky than the ground
    const t = (k + 0.5) / cards;
    const y = 1 - 2 * t;
    const rr = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = k * 2.39996 + rnd() * 0.6;
    n.set(Math.cos(phi) * rr, y * 0.85 + 0.15, Math.sin(phi) * rr).normalize();
    out.copy(c).addScaledVector(n, r * (0.6 + 0.32 * rnd()));
    sn.copy(out).sub(crown).normalize().multiplyScalar(0.35).addScaledVector(n, 0.65).normalize();
    face.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(1.6).add(n).normalize();
    const depth = 0.84 + 0.3 * (n.y * 0.5 + 0.5) + 0.06 * (rnd() - 0.5);
    b.leafCard(out, face, sn, r * (0.95 + 0.45 * rnd()) * cardScale, rnd() * Math.PI * 2, depth);
  }
}

/** a cone tier of a conifer with a ragged rim (needles hang in points) */
export function coneTier(b: PlantBuilder, rnd: () => number, x: number, y: number, z: number, r: number, h: number, yTop: number, yBottom: number): void {
  const seg = 11;
  const g = new THREE.CylinderGeometry(0.04, r, h, seg, 2, false);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const py = p.getY(i);
    if (py < -h / 2 + 1e-3) {
      // rim: alternate long and short points
      const a = Math.atan2(p.getZ(i), p.getX(i));
      const k = 1 + 0.22 * Math.sin(a * 5.5 + rnd() * 0.3) + 0.1 * (rnd() - 0.5);
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * k);
      p.setY(i, py - 0.12 * r * (k - 0.9));
    }
  }
  g.computeVertexNormals();
  b.solid(g, place(x, y, z, (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.08), WHITE, 1, (pp) => 0.72 + 0.4 * THREE.MathUtils.clamp((pp.y - yBottom) / (yTop - yBottom), 0, 1));
}

export interface PlantKinds {
  broadleaf: THREE.BufferGeometry;
  broadleaf2: THREE.BufferGeometry;
  broadleaf3: THREE.BufferGeometry;
  broadleafFar: THREE.BufferGeometry;
  conifer: THREE.BufferGeometry;
  conifer2: THREE.BufferGeometry;
  coniferFar: THREE.BufferGeometry;
  bush: THREE.BufferGeometry;
  bushFar: THREE.BufferGeometry;
  cactus: THREE.BufferGeometry;
}

export const TRUNK = new THREE.Color(0x5a4a3c);
const PINE_TRUNK = new THREE.Color(0x5a4638);

export function buildPlants(): PlantKinds {
  const b = new PlantBuilder();
  const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

  // Crowns are wider than they are tall and sit low: the trunk shows for a quarter of the height at most.
  // ---- broadleaf A: a round crown of seven clumps
  let rnd = mulberry(11);
  trunk(b, 2.0, 0.21, TRUNK, [[0.4, 0.7, 1.2], [2.6, 0.75, 1.1], [4.4, 0.65, 1.0]]);
  let crown = V(0, 3.1, 0);
  for (const [x, y, z, r] of [[0, 3.6, 0, 1.5], [1.4, 3.0, 0.3, 1.2], [-1.3, 3.1, -0.4, 1.25], [0.3, 2.9, -1.35, 1.05], [-0.3, 4.4, 0.4, 1.0], [0.6, 2.7, 1.3, 0.95], [-0.9, 2.6, 1.0, 0.85]] as const) {
    clump(b, rnd, V(x, y - 0.2, z), r, Math.round(12 * r * r + 4), crown);
  }
  const broadleaf = b.build();

  // ---- broadleaf B: taller, lopsided, a gap in the crown
  rnd = mulberry(23);
  trunk(b, 2.6, 0.22, TRUNK, [[1.0, 0.55, 1.4], [3.6, 0.8, 1.3]]);
  crown = V(0.2, 4.0, 0);
  for (const [x, y, z, r] of [[0.3, 4.6, 0.2, 1.35], [1.5, 3.8, -0.2, 1.15], [-1.1, 3.6, 0.5, 1.2], [0.1, 3.3, -1.25, 1.0], [-0.2, 5.6, -0.3, 0.85], [1.7, 3.0, 0.9, 0.8]] as const) {
    clump(b, rnd, V(x, y, z), r, Math.round(12 * r * r + 4), crown);
  }
  const broadleaf2 = b.build();

  // ---- broadleaf C: an old spreading tree, low and broad
  rnd = mulberry(29);
  trunk(b, 1.7, 0.26, TRUNK, [[0.2, 0.95, 1.9], [2.3, 1.0, 1.8], [4.3, 0.9, 1.7]]);
  crown = V(0, 2.9, 0);
  for (const [x, y, z, r] of [[0, 3.3, 0, 1.45], [1.9, 2.7, 0.4, 1.2], [-1.8, 2.8, -0.3, 1.25], [0.4, 2.6, -1.8, 1.1], [-0.5, 2.5, 1.8, 1.05], [1.2, 3.6, -0.9, 0.95], [-1.1, 3.7, 0.8, 0.9], [2.4, 2.3, -1.0, 0.8]] as const) {
    clump(b, rnd, V(x, y, z), r, Math.round(12 * r * r + 4), crown);
  }
  const broadleaf3 = b.build();

  // ---- broadleaf far: two clumps, few large cards
  rnd = mulberry(37);
  trunk(b, 2.0, 0.2, TRUNK, [], 4);
  crown = V(0, 3.1, 0);
  clump(b, rnd, V(0, 3.3, 0), 2.0, 9, crown, 1.25);
  clump(b, rnd, V(1.0, 2.7, 0.6), 1.3, 5, crown, 1.25);
  const broadleafFar = b.build();

  // ---- bush: three low clumps
  rnd = mulberry(41);
  crown = V(0, 0.4, 0);
  for (const [x, y, z, r] of [[0, 0.55, 0, 0.72], [0.55, 0.4, 0.25, 0.52], [-0.4, 0.38, -0.3, 0.5]] as const) {
    clump(b, rnd, V(x, y, z), r, Math.round(16 * r * r + 4), crown);
  }
  const bush = b.build();
  rnd = mulberry(43);
  clump(b, rnd, V(0, 0.5, 0), 0.8, 7, V(0, 0.3, 0), 1.3);
  const bushFar = b.build();

  // ---- conifers: ragged tiers
  const conifer = (seed: number, tiers: [number, number, number][], trunkH: number): THREE.BufferGeometry => {
    const r2 = mulberry(seed);
    trunk(b, trunkH, 0.16, PINE_TRUNK, [], 5);
    const top = tiers[tiers.length - 1][0] + tiers[tiers.length - 1][2] / 2;
    tiers.forEach(([y, r, h], i) => coneTier(b, r2, i % 2 ? 0.08 : -0.06, y, i % 2 ? -0.05 : 0.07, r, h, top, trunkH));
    return b.build();
  };
  const coniferA = conifer(51, [[2.2, 1.65, 2.2], [3.3, 1.35, 2.0], [4.4, 1.05, 1.9], [5.5, 0.66, 1.8]], 1.7);
  const coniferB = conifer(53, [[2.6, 1.3, 2.6], [4.0, 1.05, 2.4], [5.4, 0.78, 2.3], [6.8, 0.48, 2.2]], 2.0);
  rnd = mulberry(55);
  trunk(b, 1.6, 0.16, PINE_TRUNK, [], 4);
  coneTier(b, rnd, 0, 3.7, 0, 1.5, 5.4, 6.4, 1.2);
  const coniferFar = b.build();

  // ---- cactus: solid, painted like the rest of the desert's plants
  const cg = (r: number, h: number, x: number, y: number, z: number, rz = 0): void =>
    b.solid(new THREE.CylinderGeometry(r * 0.85, r, h, 14, 1, false), place(x, y, z, 0, rz), WHITE, 1, (p) => 0.78 + 0.3 * THREE.MathUtils.clamp(p.y / 3.2, 0, 1));
  cg(0.26, 3.0, 0, 1.5, 0);
  b.solid(new THREE.SphereGeometry(0.23, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), place(0, 3.0, 0), WHITE, 1, () => 1.08);
  cg(0.15, 1.2, 0.55, 1.7, 0);
  cg(0.14, 0.55, 0.36, 1.2, 0, Math.PI / 2);
  cg(0.14, 0.9, -0.5, 2.1, 0);
  cg(0.13, 0.5, -0.32, 1.72, 0, Math.PI / 2);
  const cactus = b.build();

  return { broadleaf, broadleaf2, broadleaf3, broadleafFar, conifer: coniferA, conifer2: coniferB, coniferFar, bush, bushFar, cactus };
}
