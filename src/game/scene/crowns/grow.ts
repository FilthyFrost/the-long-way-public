/**
 * Trees grown as a background painter paints them (docs/V3/nodes/L-landscape.md, the sample stretch;
 * specs/art/STYLE.md §5): a trunk and boughs grown by a few rules, and a crown in clumps — each clump a dark
 * ball the sprays of leaves stand on, lit as one ball: light on the sun's side, deep blue-green on the other,
 * so that from any distance a crown reads as a few big masses and, near, as brush marks.
 *
 * The broad-leaved grower follows the one of Painted Valley (src/valley/trees.js, Copyright (c) 2026 Patch,
 * MIT licence: see THIRD-PARTY-NOTICES.md), rewritten for a world that streams: one geometry holds a tree's
 * every part (its wood, the dark cores of its clumps, its sprays), the same tree is grown at three levels of
 * detail with the same boughs and clumps (only the sprays thin and grow, and the wood loses its sides), and a
 * few numbers more shape it (limbs that reach up, outer twigs that hang). Conifers are grown on the same
 * principle, which Painted Valley has no near ones of: a trunk and whorls of branches whose clumps hang outward
 * and down, narrowing to a leader.
 *
 * Every vertex carries what it is (aPart: 0 wood, 1 the core of a clump, 2 a spray), the normal it is lit by
 * (wood: its surface; a core or a spray: its clump's ball, from the clump's middle out), and aCrown: a tone of
 * its own, its clump's phase, how open it lies to the sky (0 deep inside and under the crown … 1 its sunny
 * skin), and its height in the tree (m: the wind takes hold of the crown and not of the foot). A spray's uv is
 * its corner of the leaf texture and aCard is 1 (the shadow pass cuts it out of the same texture); the wood's
 * uv is round its bark and along it (m).
 *
 * DOM-free and deterministic: a seed and a shape always grow the same tree.
 */
import * as THREE from 'three';
import { mulberry } from '../vegetation';

const TAU = Math.PI * 2;
const V3 = THREE.Vector3;

export const PART_WOOD = 0;
export const PART_CORE = 1;
export const PART_SPRAY = 2;

/** a broad-leaved tree's shape (m); the numbers of Painted Valley's grower, and two of the game's own */
export interface BroadleafShape {
  /** the height of the bole, and its radius at the foot */
  trunk: number;
  girth: number;
  /** the crown's radius and its height */
  crown: number;
  rise: number;
  /** how many limbs, the radius of a clump of leaves, clumps added on the crown's skin to round it out */
  limbs: number;
  clump: number;
  fill: number;
  /** sprays of leaves to a clump at the nearest level, and the size of one */
  cards: number;
  spray: number;
  /** 0: limbs spread (an oak) … 1: they reach up along the trunk (a poplar, a birch) */
  upright?: number;
  /** 0 … 1: the outer twigs hang (a birch's, a willow's): their clumps drop below their limbs' ends */
  weep?: number;
  /** a crown fuller to one side (0 none … 1 Painted Valley's) */
  lopsided?: number;
  /** false: the boughs are not drawn as wood (a shrub's are hidden in its leaves) */
  boughWood?: boolean;
  /** vertical thickness of a leaf mass (an umbrella crown lies flat) */
  clumpHeight?: number;
  fruit?: boolean;
}

/** a conifer's shape (m) */
export interface ConiferShape {
  /** the whole tree's height, where its lowest branches are (a share of it), the widest whorl's reach */
  height: number;
  base: number;
  radius: number;
  /** whorls of branches, and branches to a whorl (fewer towards the top) */
  tiers: number;
  branches: number;
  /** 0 … 1: how the branches hang (a spruce's skirts) */
  droop: number;
  /** the radius of a clump at the widest whorl, sprays to a clump, and the size of a spray */
  clump: number;
  cards: number;
  spray: number;
  /** the trunk's radius at the foot */
  girth: number;
  /** the outline from foot to tip: 1 a straight cone, below 1 a full dome (an old pine), above 1 a spire */
  taper: number;
  /** 0 … 1: how uneven the whorls are */
  ragged: number;
  /** 0 … 1: the crown is gathered in a few clouds high up (a pine), not whorl over whorl (a spruce) */
  clouds?: number;
  /** thickness of a whorl: cypress sprays rise tightly around the trunk */
  tierHeight?: number;
}

/** how a level of detail grows a tree: its sprays (a share of the nearest level's, each so much bigger), its wood and cores */
export interface CrownLevel {
  cards: number;
  spray: number;
  /** at least this many sprays to a clump */
  least: number;
  /** wood: sides round the bole, round a limb, round a bough, round a conifer's twig (0: not drawn), and rows along each */
  boleSides: number;
  limbSides: number;
  boughSides: number;
  twigSides: number;
  boleRows: number;
  rows: number;
  twigRows: number;
  /** the cores' ball: 1 forty-two corners (a big clump; a small one takes 0), 0 twelve, −1 six */
  core: -1 | 0 | 1;
  /** clumps whose middle lies deeper inside the crown than this (0 its axis … 1 its skin) are left out: the outer ones hide them */
  inner: number;
}

export const CROWN_LEVELS: readonly CrownLevel[] = [
  { cards: 1, spray: 1, least: 12, boleSides: 12, limbSides: 7, boughSides: 5, twigSides: 4, boleRows: 10, rows: 8, twigRows: 3, core: 1, inner: 0 },
  { cards: 0.4, spray: 1.6, least: 6, boleSides: 8, limbSides: 5, boughSides: 0, twigSides: 0, boleRows: 6, rows: 4, twigRows: 0, core: -1, inner: 0.3 },
  { cards: 0.16, spray: 2.5, least: 4, boleSides: 6, limbSides: 4, boughSides: 0, twigSides: 0, boleRows: 4, rows: 3, twigRows: 0, core: -1, inner: 0.45 },
];

/** a clump bigger than this (m) has the finer ball for its core at the nearest level */
const BIG_CLUMP = 1.3;

/** a tree grown: one geometry, and its measure */
export interface CrownModel {
  geometry: THREE.BufferGeometry;
  /** the highest point (m) and the widest reach of its crown from the trunk (m) */
  height: number;
  radius: number;
  /** where the middle of its crown is (m up) */
  crownY: number;
  /** its triangles and vertices */
  triangles: number;
  vertices: number;
}

interface Tube {
  curve: THREE.Curve<THREE.Vector3>;
  r0: number;
  r1: number;
  /** 0 the bole, 1 a limb, 2 a bough, 3 a conifer's twig */
  kind: 0 | 1 | 2 | 3 | 4;
}

interface Clump {
  c: THREE.Vector3;
  r: number;
  /** squash up/down, and stretch along `along` (a conifer's clump lies along its branch) */
  sy: number;
  stretch: number;
  along: THREE.Vector3 | null;
  /** how open it lies (0 … 1) */
  open: number;
  /** how far out in the crown its middle lies (0 the axis … 1 the skin) */
  depth: number;
}

/** the corners and faces of a sphere of 12 (detail 0) or 42 (detail 1) corners */
function icosphere(detail: 0 | 1): { pos: number[]; idx: number[] } {
  const t = (1 + Math.sqrt(5)) / 2;
  const pos: number[] = [];
  const push = (x: number, y: number, z: number): number => {
    const l = Math.hypot(x, y, z);
    pos.push(x / l, y / l, z / l);
    return pos.length / 3 - 1;
  };
  for (const [x, y, z] of [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ]) push(x, y, z);
  let faces = [
    0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
    3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
  ];
  if (detail === 1) {
    const mids = new Map<string, number>();
    const mid = (a: number, b: number): number => {
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      let m = mids.get(k);
      if (m === undefined) {
        m = push(pos[a * 3] + pos[b * 3], pos[a * 3 + 1] + pos[b * 3 + 1], pos[a * 3 + 2] + pos[b * 3 + 2]);
        mids.set(k, m);
      }
      return m;
    };
    const next: number[] = [];
    for (let f = 0; f < faces.length; f += 3) {
      const a = faces[f];
      const b = faces[f + 1];
      const c = faces[f + 2];
      const ab = mid(a, b);
      const bc = mid(b, c);
      const ca = mid(c, a);
      next.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
    }
    faces = next;
  }
  return { pos, idx: faces };
}

const SPHERES = [icosphere(0), icosphere(1)];
/** six corners: the core of a clump far off */
const OCTA = { pos: [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1], idx: [0, 2, 4, 2, 1, 4, 1, 3, 4, 3, 0, 4, 2, 0, 5, 1, 2, 5, 3, 1, 5, 0, 3, 5] };

/** the arrays a tree is written into */
export class Out {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly uv: number[] = [];
  readonly crown: number[] = [];
  readonly part: number[] = [];
  readonly card: number[] = [];
  readonly idx: number[] = [];
  top = 0;
  reach = 0;

  vertex(x: number, y0: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, tone: number, phase: number, open: number, h: number, part: number): number {
    // (leaves end at the ground: what of a low clump's ball would reach into it lies on it)
    const y = part === PART_WOOD ? y0 : Math.max(0.02, y0);
    this.pos.push(x, y, z);
    this.nrm.push(nx, ny, nz);
    this.uv.push(u, v);
    this.crown.push(tone, phase, open, h);
    this.part.push(part);
    this.card.push(part === PART_SPRAY ? 1 : 0);
    if (y > this.top) this.top = y;
    this.reach = Math.max(this.reach, Math.hypot(x, z));
    return this.pos.length / 3 - 1;
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aCrown', new THREE.Float32BufferAttribute(this.crown, 4));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 1));
    g.setAttribute('aCard', new THREE.Float32BufferAttribute(this.card, 1));
    const n = this.pos.length / 3;
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** the wood: tubes round curves, a bole that spreads into its roots and is never round */
function writeWood(out: Out, tubes: readonly Tube[], lv: CrownLevel, random: () => number): void {
  for (const tube of tubes) {
    const sides = tube.kind === 0 ? lv.boleSides : tube.kind === 1 ? lv.limbSides : tube.kind === 2 ? lv.boughSides : tube.kind === 4 ? 3 : lv.twigSides;
    if (sides < 3) continue;
    const rows = tube.kind === 0 ? lv.boleRows : tube.kind === 3 ? lv.twigRows : tube.kind === 4 ? 2 : lv.rows;
    const frames = tube.curve.computeFrenetFrames(rows, false);
    const first = out.pos.length / 3;
    const phase = random() * TAU;
    const along = tube.curve.getLength();
    const p = new V3();
    const n = new V3();
    for (let j = 0; j <= rows; j++) {
      const t = j / rows;
      tube.curve.getPoint(t, p);
      for (let i = 0; i <= sides; i++) {
        const a = (i / sides) * TAU;
        let r = tube.r0 + (tube.r1 - tube.r0) * t;
        if (tube.kind === 0) r *= 1 + 1.15 * Math.exp(-t * 7.5) * (0.62 + 0.38 * Math.sin(a * 5 + phase) * Math.sin(a * 2 + 1)) + 0.07 * Math.sin(a * 3 + t * 6 + phase);
        n.copy(frames.normals[j]).multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[j], Math.sin(a));
        out.vertex(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r, n.x, n.y, n.z, i / sides, t * along, 0.5, 0, 0, Math.max(0, p.y), PART_WOOD);
      }
    }
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < sides; i++) {
        const a = first + j * (sides + 1) + i;
        const b = a + sides + 1;
        out.idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
}

const tmpX = new V3();
const tmpY = new V3();
const tmpN = new V3();
const tmpD = new V3();
const tmpA = new V3();
const tmpS = new V3();

/**
 * A clump's core (a dark ball, lumpy and a little squashed, the sprays stand on so that a crown is a mass and
 * not lace) and its sprays (spread evenly over the ball, then shaken, each lying roughly on its skin).
 */
function writeClump(out: Out, k: Clump, cards: number, spray: number, lv: CrownLevel, random: () => number, light: (at: THREE.Vector3, dir: THREE.Vector3) => number): void {
  const phase = random();
  const sphere = lv.core < 0 ? OCTA : SPHERES[lv.core === 1 && k.r >= BIG_CLUMP ? 1 : 0];
  const first = out.pos.length / 3;
  const tone = random();
  const rc = k.r * 0.7;
  for (let i = 0; i < sphere.pos.length; i += 3) {
    const nx = sphere.pos[i];
    const ny = sphere.pos[i + 1];
    const nz = sphere.pos[i + 2];
    const lump = rc * (0.9 + 0.2 * Math.sin(nx * 5 + phase * 9) * Math.sin(nz * 4 + ny * 3));
    tmpD.set(nx * lump, ny * lump * k.sy, nz * lump);
    if (k.along) tmpD.addScaledVector(k.along, tmpD.dot(k.along) * (k.stretch - 1));
    out.vertex(k.c.x + tmpD.x, k.c.y + tmpD.y, k.c.z + tmpD.z, nx, ny, nz, 0.5, 0.5, tone, phase, k.open, k.c.y + tmpD.y, PART_CORE);
  }
  for (const f of sphere.idx) out.idx.push(first + f);
  for (let c = 0; c < cards; c++) {
    const up = 1 - (2 * (c + 0.5)) / cards;
    const ring = Math.sqrt(Math.max(0, 1 - up * up));
    const a = c * 2.39996 + phase * TAU;
    tmpD.set(Math.cos(a) * ring, up, Math.sin(a) * ring).add(tmpS.set(random() - 0.5, random() - 0.5, random() - 0.5).multiplyScalar(0.5)).normalize();
    const d = k.r * (0.62 + 0.42 * random());
    tmpA.set(tmpD.x * d, tmpD.y * d * k.sy, tmpD.z * d);
    if (k.along) tmpA.addScaledVector(k.along, tmpA.dot(k.along) * (k.stretch - 1));
    tmpA.add(k.c);
    tmpN.copy(tmpD).add(tmpS.set(random() - 0.5, random() - 0.5, random() - 0.5).multiplyScalar(1.1)).normalize();
    tmpX.set(random() - 0.5, random() - 0.5, random() - 0.5).cross(tmpN).normalize();
    tmpY.crossVectors(tmpN, tmpX);
    const size = spray * (0.75 + 0.6 * random());
    // (no spray reaches into the ground: a low one sits on it)
    if (tmpA.y - size * 0.5 < 0.05) tmpA.y = 0.05 + size * 0.5;
    const open = light(tmpA, tmpD);
    const t = random();
    const v0 = out.pos.length / 3;
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      out.vertex(
        tmpA.x + (tmpX.x * sx + tmpY.x * sy) * size * 0.5,
        tmpA.y + (tmpX.y * sx + tmpY.y * sy) * size * 0.5,
        tmpA.z + (tmpX.z * sx + tmpY.z * sy) * size * 0.5,
        tmpD.x,
        tmpD.y,
        tmpD.z,
        sx * 0.5 + 0.5,
        sy * 0.5 + 0.5,
        t,
        phase,
        open,
        tmpA.y,
        PART_SPRAY,
      );
    }
    out.idx.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
  }
}

const smooth = (x: number, a: number, b: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** a broad-leaved tree standing at the origin, at a level of detail (CROWN_LEVELS) */
export function growBroadleaf(seed: number, o: BroadleafShape, level = 0, bare = false): CrownModel {
  const lv = CROWN_LEVELS[level];
  // the tree's frame (its limbs and where its clumps are) from one stream, its finish from another:
  // every level of the same seed has the same boughs and the same clumps
  const random = mulberry(seed);
  const finish = mulberry(seed ^ 0x5bd1e995);
  const upright = o.upright ?? 0;
  const weep = o.weep ?? 0;
  const lop = o.lopsided ?? 1;
  const tubes: Tube[] = [];
  const clumps: Clump[] = [];
  // an old tree leans, and its crown is fuller on one side; a tree that reaches up keeps a stem through its crown
  const lean = random() * TAU;
  const stem = upright > 0.3 ? o.trunk + o.rise * 0.72 * upright : o.trunk;
  const top = new V3(Math.cos(lean) * o.trunk * 0.1, stem, Math.sin(lean) * o.trunk * 0.1);
  const bole = new THREE.CatmullRomCurve3([new V3(0, -0.8, 0), new V3(Math.cos(lean + 1) * o.girth * 0.25, stem * 0.45, Math.sin(lean + 1) * o.girth * 0.25), top]);
  tubes.push({ curve: bole, r0: o.girth, r1: o.girth * (upright > 0.3 ? 0.3 : 0.74), kind: 0 });
  const crownY = o.trunk + o.rise * 0.42;
  const full = lean + 2 + random() * 2;
  const reach = (a: number): number => o.crown * (0.82 + 0.26 * lop * Math.cos(a - full) + 0.1 * Math.sin(a * 3 + seed));
  const centre = new V3(0, crownY, 0);
  const openAt = (at: THREE.Vector3): number => {
    const e = Math.hypot((at.x - centre.x) / o.crown, (at.y - centre.y) / (o.rise * 0.5), (at.z - centre.z) / o.crown);
    const low = smooth((at.y - centre.y) / (o.rise * 0.5), -0.9, 0.2);
    return Math.min(1, Math.max(0, (0.22 + 0.78 * smooth(e, 0.4, 0.95)) * (0.55 + 0.45 * low)));
  };
  const depthAt = (at: THREE.Vector3): number => Math.hypot((at.x - centre.x) / o.crown, (at.y - centre.y) / (o.rise * 0.5), (at.z - centre.z) / o.crown);
  const clump = (c: THREE.Vector3, r: number): void => {
    // (a clump that would hang into the ground is held up above it)
    if (c.y - r * 0.95 < 0.35) c.y = 0.35 + r * 0.95;
    clumps.push({ c, r, sy: o.clumpHeight ?? 0.82, stretch: 1, along: null, open: openAt(c), depth: depthAt(c) });
  };
  for (let i = 0; i < o.limbs; i++) {
    const a = ((i + 0.15 + random() * 0.7) / o.limbs) * TAU;
    // (a tree that reaches up: its limbs leave the trunk steeply, and higher up it)
    const elev = 0.38 + upright * 0.62 + random() * (0.62 - upright * 0.3);
    const len = reach(a) * (0.62 + 0.26 * random()) * (1 + upright * 0.25);
    const dir = new V3(Math.cos(a) * Math.cos(elev), Math.sin(elev), Math.sin(a) * Math.cos(elev));
    const side = new V3(-Math.sin(a), 0, Math.cos(a));
    const bend = (random() - 0.5) * len * 0.3;
    // (from the top of the bole; up a stem, from along it, the lowest limbs where the bole ends)
    const along = upright > 0.3 ? (i + random()) / o.limbs : 1;
    const from = upright > 0.3 ? bole.getPoint((o.trunk + (stem - o.trunk) * along * 0.92 + 0.8) / (stem + 0.8)) : top.clone().add(new V3(0, -o.girth * 0.5, 0));
    const mid = from.clone().addScaledVector(dir, len * 0.5).addScaledVector(side, bend).add(new V3(0, -len * 0.07, 0));
    const end = from.clone().addScaledVector(dir, len).addScaledVector(side, bend * 0.4).add(new V3(0, len * (0.14 - weep * 0.22), 0));
    const q1 = from.clone().lerp(mid, 0.5).add(new V3((random() - 0.5) * len * 0.12, len * 0.05, (random() - 0.5) * len * 0.12));
    const q3 = mid.clone().lerp(end, 0.5).add(new V3((random() - 0.5) * len * 0.14, -len * 0.04, (random() - 0.5) * len * 0.14));
    const limb = new THREE.CatmullRomCurve3([from, q1, mid, q3, end]);
    // (a shrub's limbs are hidden in its leaves past the nearest level)
    if (o.boughWood !== false || level === 0) tubes.push({ curve: limb, r0: o.girth * (0.36 + 0.12 * random()), r1: o.girth * 0.1, kind: 1 });
    clump(end, o.clump * (0.85 + 0.4 * random()));
    const boughs = 2 + (random() < 0.5 ? 1 : 0);
    for (let j = 0; j < boughs; j++) {
      const at = limb.getPoint(0.4 + 0.45 * random());
      const a2 = a + (random() - 0.5) * 2.2;
      const e2 = 0.25 + upright * 0.4 + random() * 0.85 - weep * 0.9;
      const l2 = len * (0.34 + 0.26 * random());
      const d2 = new V3(Math.cos(a2) * Math.cos(e2), Math.sin(e2), Math.sin(a2) * Math.cos(e2));
      const end2 = at.clone().addScaledVector(d2, l2);
      const mid2 = at.clone().addScaledVector(d2, l2 * 0.5).add(new V3((random() - 0.5) * l2 * 0.2, l2 * 0.06, (random() - 0.5) * l2 * 0.2));
      if (o.boughWood !== false) tubes.push({ curve: new THREE.CatmullRomCurve3([at, mid2, end2]), r0: o.girth * 0.13, r1: o.girth * 0.035, kind: 2 });
      clump(end2, o.clump * (0.75 + 0.45 * random()));
    }
  }
  // The outer sunlit tufts still have a scaffold after leaf fall. Trace each back
  // to the nearest limb end, then split the terminal twig at its outer third.
  function support(c: THREE.Vector3): void {
    if (!bare && o.boughWood === false) return;
    let start = top;
    for (const tube of tubes) {
      const p = tube.curve.getPoint(1);
      if (p.distanceToSquared(c) < start.distanceToSquared(c)) start = p;
    }
    if (!bare && start.distanceTo(c) < o.clump * 0.65) return;
    const fork = start.clone().lerp(c, 0.62);
    fork.y -= start.distanceTo(c)*0.10;
    tubes.push({curve: new THREE.CatmullRomCurve3([start, fork, c]), r0:o.girth*0.19, r1:o.girth*0.035, kind:4});
  }
  // clumps on the skin of the crown, so its outline is a full, uneven dome and not a ring of branch ends
  for (let i = 0; i < o.fill; i++) {
    const a = random() * TAU;
    // (on a broad crown mostly its upper half; on a tall one the whole of it)
    const u = random();
    const up = Math.min(0.96, (-0.3 + 1.3 * u) * (1 - upright) + (-0.85 + 1.8 * u) * upright);
    const ring = Math.sqrt(1 - up * up);
    const r = reach(a) * 0.8;
    const tip = new V3(Math.cos(a) * ring * r, crownY + up * o.rise * 0.5, Math.sin(a) * ring * r);
    support(tip);
    clump(tip, o.clump * (0.8 + 0.5 * random()));
  }
  // a hanging tree's twigs: small clumps dropped below the outer ones
  if (weep > 0) {
    const outer = clumps.slice();
    for (const k of outer) {
      if (random() > weep) continue;
      const d = k.r * (0.9 + 0.8 * random());
      const hanging = k.c.clone().add(new V3((random() - 0.5) * k.r * 0.6, -d, (random() - 0.5) * k.r * 0.6));
      tubes.push({curve:new THREE.LineCurve3(k.c,hanging), r0:o.girth*0.075, r1:o.girth*0.018, kind:4});
      clump(hanging, k.r * (0.55 + 0.25 * random()));
    }
  }

  const out = new Out();
  writeWood(out, tubes, bare ? { ...lv, boughSides: Math.max(3, lv.boughSides), rows: level === 2 ? 2 : lv.rows } : lv, finish);
  const cards = Math.max(lv.least, Math.round(o.cards * lv.cards));
  const spray = o.spray * lv.spray;
  for (const k of clumps) if (!bare && k.depth >= lv.inner) writeClump(out, k, cards, spray, lv, finish, (at) => openAt(at));
  if (o.fruit && !bare && level < 2) {
    // Fruit hangs just outside the dark mass. The instance bearing flag controls visibility.
    for (const k of clumps.slice(0, level === 0 ? 14 : 5)) {
      const first = out.part.length;
      const r = 0.115 + finish() * 0.055;
      const phase = finish();
      for (let i = 0; i < OCTA.pos.length; i += 3) {
        const [x, y, z] = OCTA.pos.slice(i, i + 3);
        out.vertex(k.c.x + x*r, k.c.y - k.r*0.93 + y*r, k.c.z + z*r, x,y,z,0,0,0.5,phase,0.7,k.c.y,4);
      }
      for (const i of OCTA.idx) out.idx.push(first + i);
    }
  }
  const g = out.geometry();
  return { geometry: g, height: out.top, radius: out.reach, crownY, triangles: out.idx.length / 3, vertices: out.pos.length / 3 };
}

/** a conifer standing at the origin, at a level of detail (CROWN_LEVELS) */
export function growConifer(seed: number, o: ConiferShape, level = 0, bare = false): CrownModel {
  const lv = CROWN_LEVELS[level];
  const random = mulberry(seed);
  const finish = mulberry(seed ^ 0x5bd1e995);
  const clouds = o.clouds ?? 0;
  const tubes: Tube[] = [];
  const clumps: Clump[] = [];
  const H = o.height;
  const lean = random() * TAU;
  const tip = new V3(Math.cos(lean) * H * 0.012, H * 0.985, Math.sin(lean) * H * 0.012);
  tubes.push({ curve: new THREE.CatmullRomCurve3([new V3(0, -0.6, 0), new V3(Math.cos(lean + 2) * o.girth * 0.2, H * 0.4, Math.sin(lean + 2) * o.girth * 0.2), tip]), r0: o.girth, r1: o.girth * 0.12, kind: 0 });
  const y0 = H * o.base;
  const span = H * 0.94 - y0;
  // the outline: how far a whorl reaches at a share t of the way from the lowest whorl to the tip
  const envelope = (t: number): number => o.radius * Math.pow(Math.max(0, 1 - t), o.taper) * (0.62 + 0.38 * smooth(t, 0, 0.12 + clouds * 0.3));
  const openAt = (at: THREE.Vector3, out: number, t: number): number => {
    // the skin of the cone is open, its inside and its underside deep; the lowest whorls are in the tree's own shade
    const e = out / Math.max(0.3, envelope(t));
    return Math.min(1, Math.max(0, (0.2 + 0.8 * smooth(e, 0.35, 0.95)) * (0.5 + 0.5 * smooth(t, -0.1, 0.55)) + (at.y > H * 0.9 ? 0.2 : 0)));
  };
  let turn = random() * TAU;
  for (let i = 0; i < o.tiers; i++) {
    const t = (i + 0.3 * random()) / o.tiers;
    const y = y0 + t * span;
    const R = envelope(t) * (1 - o.ragged * 0.35 + o.ragged * 0.55 * random());
    // a pine's crown is a few clouds high up: its lower whorls are bare boughs or gone
    if (clouds > 0 && t < clouds * 0.5 && random() < clouds) continue;
    const n = Math.max(2, Math.round(o.branches * (0.55 + 0.45 * (1 - t)) + (random() - 0.5) * 2));
    turn += 2.39996;
    for (let b = 0; b < n; b++) {
      const a = turn + (b / n) * TAU + (random() - 0.5) * (TAU / n) * 0.7 * (0.4 + o.ragged);
      const hang = o.droop * (0.25 + 0.75 * (1 - t));
      const len = R * (0.82 + 0.3 * random());
      const out = new V3(Math.cos(a), 0, Math.sin(a));
      const dir = new V3(out.x, 0.25 - hang * 0.9, out.z).normalize();
      const from = new V3(tip.x * (y / H), y, tip.z * (y / H));
      const end = from.clone().addScaledVector(dir, len);
      // the branch sags in the middle and turns up a little at its tip (a spruce's skirt)
      const mid = from.clone().lerp(end, 0.5).add(new V3(0, -len * hang * 0.18, 0));
      end.y += len * hang * 0.12;
      const branch = new THREE.CatmullRomCurve3([from, mid, end]);
      if (bare || t < 0.6) tubes.push({ curve: branch, r0: o.girth * 0.16 * (1 - t * 0.7), r1: o.girth * 0.03, kind: bare ? 1 : 3 });
      // its clumps lie along it, pointing out and hanging down, the outer bigger than the inner
      const r = o.clump * (0.45 + 0.55 * (R / o.radius)) * (0.85 + 0.3 * random());
      const along = dir.clone();
      const steps = R > o.radius * 0.58 ? 2 : 1;
      for (let s = 0; s < steps; s++) {
        const u = steps === 1 ? 0.72 : s === 0 ? 0.48 : 0.9;
        const c = branch.getPoint(u).add(new V3(0, -r * 0.25, 0));
        // (the lowest whorl's clumps rest on the ground at most, not in it)
        if (c.y - r * 0.7 < 0.3) c.y = 0.3 + r * 0.7;
        const reachOut = Math.hypot(c.x, c.z);
        clumps.push({ c, r: r * (s === 0 && steps === 2 ? 0.85 : 1), sy: o.tierHeight ?? (0.55 + clouds * 0.25), stretch: 1.35 - clouds * 0.25, along, open: openAt(c, reachOut, t), depth: reachOut / Math.max(0.3, envelope(t)) });
      }
    }
  }
  // the leader: a few small clumps up the last of the trunk, narrowing to the tip
  const leader = 3 + Math.round(random() * 2);
  for (let k = 0; k < leader; k++) {
    const u = (k + 1) / (leader + 1);
    const y = H * (0.9 + 0.09 * u);
    const r = o.clump * (0.42 - 0.26 * u) * (1 - clouds * 0.4);
    clumps.push({ c: new V3(tip.x * u, y, tip.z * u), r, sy: 1.3, stretch: 1, along: null, open: 0.85, depth: 1 });
  }

  const out = new Out();
  writeWood(out, tubes, bare ? { ...lv, rows: [5,3,2][level], limbSides: [5,4,3][level] } : lv, finish);
  const cards = Math.max(lv.least, Math.round(o.cards * lv.cards));
  const spray = o.spray * lv.spray;
  for (const k of clumps) {
    if (bare || k.depth < lv.inner) continue;
    const t = Math.min(1, Math.max(0, (k.c.y - y0) / span));
    writeClump(out, k, cards, spray, lv, finish, (at) => openAt(at, Math.hypot(at.x, at.z), t));
  }
  const g = out.geometry();
  return { geometry: g, height: out.top, radius: out.reach, crownY: y0 + span * 0.4, triangles: out.idx.length / 3, vertices: out.pos.length / 3 };
}
