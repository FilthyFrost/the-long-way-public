/**
 * The plant toolkit's parts (docs/V3/nodes/P2-flora.md): what every plant of it is made of, and the fitter that
 * holds each to its triangle budget (docs/V3/perf-budget.json `each`).
 *
 * A plant is first planned, the same at every level of detail: its wood (tubes round curves, by class: the bole,
 * limbs, boughs, twigs), its foliage (clumps: a dark lumpy core the sprays stand on, so that a crown is a mass and
 * not lace, every spray lit by its clump's ball normal, after Painted Valley's src/valley/trees.js), and what else
 * it is made of (a palm's fronds, a cactus's ribs, flowers): its extras. Then it is drawn at a level, near or in
 * the middle distance (far off a tree is a picture: scene/crowns/crownAtlas.ts), against its budget:
 *
 *   1. the wood at the level's sides and rows by class (the middle distance draws no boughs or twigs);
 *   2. the cores: a twelve-cornered ball for a big clump near, a six-cornered one for the rest, none for the
 *      smallest in the middle distance;
 *   3. the extras, at their own detail for the level;
 *   4. what is left over goes to sprays, two triangles each, shared among the clumps by their size, and each
 *      spray is made bigger by as much as there are fewer of them than the plan wanted, so that a crown keeps its
 *      fullness as it thins.
 *
 * If wood, cores and extras alone are over, the cores go first, then the smallest wood. The plant drawn is always
 * within its budget (harness/sim/p2_flora.test.ts holds every sample to it at every level).
 *
 * Geometry is the crowns' (scene/crowns/grow.ts Out: aPart 0 wood, 1 a core, 2 a spray, 3 a solid with its own
 * outline, 3.75 a flower; aCrown tone, phase, how open, height; uv), so the crowns' material paints it. DOM-free
 * and deterministic: a plan and a seed always draw the same plant.
 */
import * as THREE from 'three';
import { Out, PART_CORE, PART_SPRAY, PART_WOOD, type CrownModel } from '../crowns/grow';
import { mulberry } from '../vegetation';
import { tileRect } from './atlas';

export const TAU = Math.PI * 2;
export const V3 = THREE.Vector3;
export type V3 = THREE.Vector3;

/** a solid with its own outline (a frond's blade, a cactus's ribs): lit by its own normal, in the crown's colours */
export const PART_SOLID = 3;
/** a flower: painted in the plant's second colour, drawn if the plant bears, gone between 25 and 66 m */
export const PART_BLOOM = 3.75;

/** 0 near, 1 the middle distance (far off: the crowns' pictures) */
export type Level = 0 | 1;

/** the classes of wood */
export const BOLE = 0;
export const LIMB = 1;
export const BOUGH = 2;
export const TWIG = 3;

/** sides round a tube and rows along it, by class (bole, limb, bough, twig), at each level; 0 sides: not drawn */
const SIDES: readonly (readonly number[])[] = [
  [9, 6, 4, 3],
  [5, 4, 0, 0],
];
const ROWS: readonly (readonly number[])[] = [
  [7, 5, 3, 2],
  [3, 2, 0, 0],
];

export const smooth = (x: number, a: number, b: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface Tube {
  curve: THREE.Curve<THREE.Vector3>;
  r0: number;
  r1: number;
  cls: 0 | 1 | 2 | 3;
  /** it spreads into its roots at the foot, by so much (0 … 1.2) */
  flare?: number;
  /** how deeply its bark is furrowed (0 smooth … 1 an old oak's) */
  furrow?: number;
  /** its radius along it, as a share of the straight taper (a baobab's bottle) */
  profile?: (t: number) => number;
  /** more sides than its class (a great bole) */
  extraSides?: number;
  /** its own sides and rows, near and in the middle distance, instead of its class's (a bamboo's culm, a palm's stem) */
  sidesAt?: [number, number];
  rowsAt?: [number, number];
}

export interface Clump {
  c: V3;
  r: number;
  /** its squash up/down; its stretch along `along` */
  sy: number;
  stretch: number;
  along: V3 | null;
  /** its sprays lit as a shelf, from above (a conifer's tier, an acacia's table), 0 … 1 */
  shelf: number;
  /** a share of its sprays hang from its outer edge (a spruce's branchlets), 0 … 1 */
  curtain: number;
  /** which way is out from the tree (for the curtain) */
  out: V3;
  /** how open it lies to the sky, 0 … 1 (the fitter sets it from the plan's openAt) */
  open: number;
  /** its own tile of the atlas (else the plan's) */
  tile?: number;
  /** its sprays lie flat, faces up (an acacia's), 0 … 1 */
  flat?: number;
  /** a share of its sprays hang beneath it (a birch's threads, a willow's), 0 … 1 */
  droop?: number;
  /** no core (a thin clump: a birch's, a heather's) */
  bare?: boolean;
}

/** a plant's plan: the same at every level */
export interface Plan {
  tubes: Tube[];
  clumps: Clump[];
  /** the atlas tile its sprays are cut from */
  tile: number;
  /** a spray's size at the nearest level (m), and how many to a clump of radius rRef there */
  spray: number;
  cards: number;
  rRef: number;
  /** how open a point of its crown lies, facing n (0 deep inside and under … 1 its sunny skin) */
  openAt: (at: V3, n: V3) => number;
  /** its other parts, written for a level; and their triangles there (for the fitter) */
  extra?: (out: Out, level: Level, random: () => number) => void;
  extraTris?: (level: Level) => number;
  /** where the middle of its crown is (m up) */
  crownY: number;
  /** the fewest sprays a clump keeps, near and in the middle distance */
  least?: [number, number];
}

// ---- wood ----

function sidesOf(t: Tube, level: Level): number {
  if (t.sidesAt) return t.sidesAt[level];
  const base = SIDES[level][t.cls];
  return base < 3 ? 0 : base + (t.extraSides ?? 0);
}

function rowsOf(t: Tube, level: Level): number {
  return t.rowsAt ? t.rowsAt[level] : ROWS[level][t.cls];
}

function tubeTris(t: Tube, level: Level): number {
  const sides = sidesOf(t, level);
  return sides < 3 ? 0 : sides * rowsOf(t, level) * 2;
}

/** tubes round curves: the wood */
function writeTubes(out: Out, tubes: readonly Tube[], level: Level, random: () => number): void {
  const p = new V3();
  const n = new V3();
  for (const tube of tubes) {
    const sides = sidesOf(tube, level);
    if (sides < 3) continue;
    const rows = rowsOf(tube, level);
    const frames = tube.curve.computeFrenetFrames(rows, false);
    const first = out.pos.length / 3;
    const phase = random() * TAU;
    const along = tube.curve.getLength();
    const furrow = tube.furrow ?? 0;
    const flare = tube.flare ?? 0;
    for (let j = 0; j <= rows; j++) {
      // (a flared foot gets its rows close together, where its roots spread)
      const t = flare > 0 ? Math.pow(j / rows, 1.5) : j / rows;
      tube.curve.getPoint(t, p);
      const frame = Math.min(rows, Math.round(t * rows));
      for (let i = 0; i <= sides; i++) {
        const a = (i / sides) * TAU;
        let r = (tube.r0 + (tube.r1 - tube.r0) * Math.pow(t, 0.8)) * (tube.profile ? tube.profile(t) : 1);
        if (flare > 0) r *= 1 + flare * Math.exp(-t * 9) * (0.6 + 0.4 * Math.sin(a * 5 + phase) * Math.sin(a * 2 + 1)) + 0.05 * Math.sin(a * 3 + t * 6 + phase);
        r *= 1 - furrow * 0.06 * (0.5 + 0.5 * Math.sin(a * 11 + Math.sin(t * 7 + phase) * 1.4));
        n.copy(frames.normals[frame]).multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[frame], Math.sin(a));
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

// ---- cores ----

/** the corners and faces of the two balls a core is made of: twelve corners (20 faces) and six (8 faces) */
const BALLS = (() => {
  const t = (1 + Math.sqrt(5)) / 2;
  const ico = [-1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, 0, 0, -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, t, 0, -1, t, 0, 1, -t, 0, -1, -t, 0, 1];
  for (let i = 0; i < ico.length; i += 3) {
    const l = Math.hypot(ico[i], ico[i + 1], ico[i + 2]);
    ico[i] /= l;
    ico[i + 1] /= l;
    ico[i + 2] /= l;
  }
  const icoIdx = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
  const oct = [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1];
  const octIdx = [0, 2, 4, 4, 2, 1, 1, 2, 5, 5, 2, 0, 0, 4, 3, 4, 1, 3, 1, 5, 3, 5, 0, 3];
  return [
    { pos: ico, idx: icoIdx },
    { pos: oct, idx: octIdx },
  ];
})();

/** a core's ball at a level: 0 the twelve-cornered, 1 the six-cornered, −1 none */
function coreOf(k: Clump, level: Level, big: number): -1 | 0 | 1 {
  if (k.bare) return -1;
  if (level === 0) return k.r >= big ? 0 : 1;
  return k.r >= big * 0.6 ? 1 : -1;
}

const tD = new V3();
const tA = new V3();
const tN = new V3();
const tX = new V3();
const tY = new V3();
const tS = new V3();
const tL = new V3();
const UP = new V3(0, 1, 0);

function writeCore(out: Out, k: Clump, ball: 0 | 1, random: () => number): void {
  const phase = random();
  const tone = random();
  const b = BALLS[ball];
  const first = out.pos.length / 3;
  const rc = k.r * 0.66;
  for (let i = 0; i < b.pos.length; i += 3) {
    const nx = b.pos[i];
    const ny = b.pos[i + 1];
    const nz = b.pos[i + 2];
    const lump = rc * (0.86 + 0.24 * Math.sin(nx * 5 + phase * 9) * Math.sin(nz * 4 + ny * 3));
    tD.set(nx * lump, ny * lump * k.sy, nz * lump);
    if (k.along) tD.addScaledVector(k.along, tD.dot(k.along) * (k.stretch - 1));
    tL.set(nx, ny, nz).lerp(UP, k.shelf * 0.5).normalize();
    out.vertex(k.c.x + tD.x, k.c.y + tD.y, k.c.z + tD.z, tL.x, tL.y, tL.z, 0.5, 0.5, tone, phase, k.open * 0.8, k.c.y + tD.y, PART_CORE);
  }
  for (const f of b.idx) out.idx.push(first + f);
}

// ---- sprays ----

/**
 * A clump's sprays: spread over its ball and shaken, or laid as a shelf with a curtain hanging from its outer
 * edge, or lying flat (faces up), or hanging beneath it; each lit by its clump's ball normal bent towards up.
 */
function writeSprays(out: Out, k: Clump, tile: number, cards: number, size0: number, random: () => number, openAt: (at: V3, n: V3) => number): void {
  if (cards <= 0) return;
  const phase = random();
  const [u0, v0, u1, v1] = tileRect(tile);
  const flat = k.flat ?? 0;
  const droop = k.droop ?? 0;
  for (let c = 0; c < cards; c++) {
    const roll = random();
    const hang = roll < k.curtain;
    const under = !hang && roll < k.curtain + droop;
    const up = 1 - (2 * (c + 0.5)) / cards;
    const ring = Math.sqrt(Math.max(0, 1 - up * up));
    const a = c * 2.39996 + phase * TAU;
    let size = size0 * (0.75 + 0.6 * random());
    let hangs = false;
    if (hang) {
      // a branchlet hanging from the shelf's outer edge, facing out, its twig along the edge
      const side = (random() - 0.5) * 2;
      tD.copy(k.out).multiplyScalar(0.85).add(tS.set(0, -0.15, 0)).normalize();
      tA.copy(k.c).addScaledVector(k.out, k.r * (0.55 + 0.3 * random()));
      if (k.along) tA.addScaledVector(k.along, side * k.r * k.stretch * 0.5);
      tA.y -= k.r * k.sy * 0.25 + size * 0.3;
      tN.copy(k.out).add(tS.set((random() - 0.5) * 0.5, 0.25, (random() - 0.5) * 0.5)).normalize();
      tX.set(-tN.z, 0, tN.x).normalize();
      tY.crossVectors(tN, tX).normalize();
      if (tY.y < 0) tY.negate();
      size *= 1.15;
      hangs = true;
    } else if (under) {
      // a thread hanging beneath the clump, facing any way round, its top at the clump's underside
      const b = random() * TAU;
      const d = k.r * (0.25 + 0.6 * random());
      tD.set(Math.cos(b), -0.6, Math.sin(b)).normalize();
      tA.set(k.c.x + Math.cos(b) * d, k.c.y - k.r * k.sy * (0.35 + 0.3 * random()) - size * 0.3, k.c.z + Math.sin(b) * d);
      tN.set(Math.cos(b), 0.15, Math.sin(b)).normalize();
      tX.set(-tN.z, 0, tN.x).normalize();
      tY.set(0, 1, 0);
      hangs = true;
    } else if (flat > 0 && random() < flat) {
      // lying on the table's top, faces up a little shaken
      const b = random() * TAU;
      const d = Math.sqrt(random()) * k.r * 0.95;
      tD.set(Math.cos(b) * d / k.r, 0.55, Math.sin(b) * d / k.r).normalize();
      tA.set(k.c.x + Math.cos(b) * d, k.c.y + k.r * k.sy * (0.2 + 0.5 * random()), k.c.z + Math.sin(b) * d);
      if (k.along) tA.addScaledVector(k.along, (tA.x - k.c.x) * k.along.x * (k.stretch - 1) + (tA.z - k.c.z) * k.along.z * (k.stretch - 1));
      tN.set((random() - 0.5) * 0.5, 1, (random() - 0.5) * 0.5).normalize();
      tX.set(random() - 0.5, 0, random() - 0.5).cross(tN).normalize();
      tY.crossVectors(tN, tX);
    } else {
      tD.set(Math.cos(a) * ring, up, Math.sin(a) * ring).add(tS.set(random() - 0.5, random() - 0.5, random() - 0.5).multiplyScalar(0.5)).normalize();
      // (a shelf's sprays lie on its top and its rim, few under it)
      if (k.shelf > 0 && tD.y < -0.2 && random() < k.shelf) tD.y = -tD.y * 0.4;
      const d = k.r * (0.6 + 0.42 * random());
      tA.set(tD.x * d, tD.y * d * k.sy, tD.z * d);
      if (k.along) tA.addScaledVector(k.along, tA.dot(k.along) * (k.stretch - 1));
      tA.add(k.c);
      tN.copy(tD).add(tS.set(random() - 0.5, random() - 0.5, random() - 0.5)).normalize();
      if (k.shelf > 0) tN.lerp(UP, k.shelf * 0.6).normalize();
      tX.set(random() - 0.5, random() - 0.5, random() - 0.5).cross(tN).normalize();
      tY.crossVectors(tN, tX);
    }
    if (tA.y - size * 0.5 < 0.04) tA.y = 0.04 + size * 0.5;
    tL.copy(tD).lerp(UP, k.shelf * 0.55).normalize();
    const open = openAt(tA, tL);
    const t = random();
    const first = out.pos.length / 3;
    for (const [sx, sy] of CORNERS) {
      // (a hanging spray's picture: its twig at the top edge, so the card hangs from it)
      const oy = hangs ? sy * 0.5 - 0.35 : sy * 0.5;
      out.vertex(tA.x + (tX.x * sx * 0.5 + tY.x * oy) * size, tA.y + (tX.y * sx * 0.5 + tY.y * oy) * size, tA.z + (tX.z * sx * 0.5 + tY.z * oy) * size, tL.x, tL.y, tL.z, sx < 0 ? u0 : u1, sy < 0 ? v0 : v1, t, phase, open, tA.y, PART_SPRAY);
    }
    out.idx.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
}

const CORNERS: readonly [number, number][] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

// ---- the fitter ----

/** what a plant comes to at a level: its triangles by what they are */
export interface Drawn extends CrownModel {
  wood: number;
  cores: number;
  sprays: number;
  extras: number;
  /** milliseconds to grow it */
  ms: number;
}

/**
 * Draw a plan at a level within `budget` triangles. `seed` gives the finish (the sprays' scatter), the same at
 * every level, so the same plant thins as it goes away and does not change.
 */
export function draw(plan: Plan, level: Level, budget: number, seed: number): Drawn {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const finish = mulberry(seed ^ 0x5bd1e995);
  // (only a clump as big as the plan's measure or bigger gets the finer ball)
  const big = plan.rRef;
  // what each clump would have near, as the plan wants it: by its area
  const want = plan.clumps.map((k) => plan.cards * Math.min(2.2, (k.r / plan.rRef) ** 2));
  let tubes = plan.tubes.filter((t) => tubeTris(t, level) > 0);
  const woodOf = (ts: readonly Tube[]): number => ts.reduce((s, t) => s + tubeTris(t, level), 0);
  let cores = plan.clumps.map((k) => coreOf(k, level, big));
  const coreTris = (): number => cores.reduce((s: number, c) => s + (c === 0 ? 20 : c === 1 ? 8 : 0), 0);
  const extra = plan.extraTris ? plan.extraTris(level) : 0;
  const [leastNear, leastMid] = plan.least ?? [5, 3];
  const least = level === 0 ? leastNear : leastMid;
  // in the middle distance the clumps deep in the crown are hidden by the outer ones: sprays only for the open
  for (const k of plan.clumps) k.open = plan.openAt(k.c, UP);
  const shows = plan.clumps.map((k) => (level === 0 ? true : k.open > 0.22));
  const minSprays = (): number => plan.clumps.reduce((s, _k, i) => s + (shows[i] ? least : 0), 0) * 2;
  // over with sprays at their fewest: the cores go first (to the smaller ball, then none), then the smallest wood
  let wood = woodOf(tubes);
  if (wood + coreTris() + extra + minSprays() > budget) cores = cores.map((c) => (c === 0 ? 1 : c));
  if (wood + coreTris() + extra + minSprays() > budget) cores = cores.map(() => -1 as const);
  if (wood + coreTris() + extra + minSprays() > budget) {
    const order = [...tubes].sort((a, b) => b.cls - a.cls || a.r0 - b.r0);
    while (order.length && wood + coreTris() + extra + minSprays() > budget && order[0].cls > BOLE) {
      const gone = order.shift()!;
      tubes = tubes.filter((t) => t !== gone);
      wood = woodOf(tubes);
    }
  }
  // the rest to sprays, by the clumps' share of what the plan wanted
  const total = Math.max(0, Math.floor((budget - wood - coreTris() - extra) / 2));
  const wanted = want.reduce((s, w, i) => s + (shows[i] ? w : 0), 0);
  const scale = wanted > 0 ? Math.min(1, total / wanted) : 0;
  const counts = want.map((w, i) => (shows[i] ? Math.max(least, Math.round(w * scale)) : 0));
  let sum = counts.reduce((s, c) => s + c, 0);
  // (rounding up to the fewest can run over: take back from the fullest)
  while (sum > total) {
    let at = -1;
    for (let i = 0; i < counts.length; i++) if (counts[i] > (shows[i] ? 1 : 0) && (at < 0 || counts[i] > counts[at])) at = i;
    if (at < 0) break;
    counts[at]--;
    sum--;
  }
  const out = new Out();
  writeTubes(out, tubes, level, finish);
  const woodDone = out.idx.length / 3;
  plan.clumps.forEach((k, i) => {
    const c = cores[i];
    if (c >= 0) writeCore(out, k, c as 0 | 1, finish);
  });
  const coresDone = out.idx.length / 3;
  plan.clumps.forEach((k, i) => {
    if (!counts[i]) return;
    // fewer sprays than wanted: each bigger, so the clump keeps its fullness
    const grow = Math.min(2.8, Math.max(1, Math.sqrt(want[i] / counts[i])));
    writeSprays(out, k, k.tile ?? plan.tile, counts[i], plan.spray * grow * Math.min(1.25, 0.6 + k.r / (plan.rRef * 1.6)), finish, plan.openAt);
  });
  const spraysDone = out.idx.length / 3;
  if (plan.extra) plan.extra(out, level, finish);
  const g = out.geometry();
  const triangles = out.idx.length / 3;
  return {
    geometry: g,
    height: out.top,
    radius: out.reach,
    crownY: plan.crownY,
    triangles,
    vertices: out.pos.length / 3,
    wood: woodDone,
    cores: coresDone - woodDone,
    sprays: spraysDone - coresDone,
    extras: triangles - spraysDone,
    ms: (typeof performance !== 'undefined' ? performance.now() : 0) - t0,
  };
}

// ---- extras: blades, ribs and flowers ----

/**
 * A frond or a blade: a ribbon along a curve, cut from an atlas tile (its rachis up the tile's middle), folded
 * along its midrib into a V by `fold` (rad, each half lifted so much). Its light is its own face bent towards the
 * ball of the crown it is part of (from `centre`), so a palm's head reads as one mass. 4 triangles a segment.
 */
export function writeFrond(out: Out, curve: THREE.Curve<THREE.Vector3>, width: (t: number) => number, segs: number, fold: number, tile: number, centre: V3, open: number, random: () => number, part = PART_SPRAY): void {
  const [u0, v0, u1, v1] = tileRect(tile);
  const um = (u0 + u1) / 2;
  const tone = random();
  const phase = random();
  const p = new V3();
  const tan = new V3();
  const side = new V3();
  const lift = new V3();
  const ball = new V3();
  const first = out.pos.length / 3;
  for (let j = 0; j <= segs; j++) {
    const t = j / segs;
    curve.getPoint(t, p);
    curve.getTangent(t, tan);
    // its flat side: across the rachis, level
    side.set(-tan.z, 0, tan.x);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    lift.crossVectors(side, tan).normalize();
    if (lift.y < 0) lift.negate();
    const w = width(t);
    ball.copy(p).sub(centre).normalize();
    const v = v0 + (v1 - v0) * t;
    for (const s of [-1, 0, 1]) {
      // each half lifted into the V
      const x = p.x + (side.x * Math.cos(fold) * s + lift.x * Math.sin(fold) * Math.abs(s)) * w;
      const y = p.y + (side.y * Math.cos(fold) * s + lift.y * Math.sin(fold) * Math.abs(s)) * w;
      const z = p.z + (side.z * Math.cos(fold) * s + lift.z * Math.sin(fold) * Math.abs(s)) * w;
      tN.copy(lift).multiplyScalar(0.55).add(ball).normalize();
      out.vertex(x, y, z, tN.x, tN.y, tN.z, s < 0 ? u0 : s > 0 ? u1 : um, v, tone, phase, open, y, part);
    }
  }
  for (let j = 0; j < segs; j++) {
    const a = first + j * 3;
    const b = a + 3;
    out.idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
  }
}

/**
 * Ribs round an axis (a cactus's): `ribs` ridges, each ridge and furrow a corner, lit by its own normal, the top
 * closed in a dome. 4 × ribs × rows triangles.
 */
export function writeRibbed(out: Out, axis: (t: number) => V3, radius: (t: number) => number, ribs: number, rows: number, part = PART_SOLID): void {
  const count = ribs * 2;
  const first = out.pos.length / 3;
  const tan = new V3();
  const a0 = new V3();
  const a1 = new V3();
  const side = new V3();
  const other = new V3();
  const nrm = new V3();
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    const p = axis(t);
    a0.copy(axis(Math.max(0, t - 0.01)));
    a1.copy(axis(Math.min(1, t + 0.01)));
    tan.copy(a1).sub(a0).normalize();
    side.set(1, 0, 0);
    if (Math.abs(tan.dot(side)) > 0.85) side.set(0, 0, 1);
    other.crossVectors(tan, side).normalize();
    side.crossVectors(other, tan).normalize();
    const r = radius(t);
    for (let i = 0; i <= count; i++) {
      const a = (i / count) * TAU;
      const ridge = i % 2 === 0;
      nrm.copy(side).multiplyScalar(Math.cos(a)).addScaledVector(other, Math.sin(a));
      const rr = r * (ridge ? 1 : 0.8);
      const x = p.x + nrm.x * rr;
      const y = p.y + nrm.y * rr;
      const z = p.z + nrm.z * rr;
      // (towards the dome the light turns up)
      nrm.addScaledVector(tan, Math.max(0, (t - 0.86) * 7)).normalize();
      out.vertex(x, y, z, nrm.x, nrm.y, nrm.z, i / count, t, ridge ? 0.9 : 0.15, 0.5, 0.8, y, part);
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < count; i++) {
      const a = first + j * (count + 1) + i;
      const b = a + count + 1;
      out.idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
}

/**
 * A flower's head (PART_BLOOM: the plant's second colour): `petals` petals round its face, each a quad cupped up
 * by `cup` (0 a flat daisy … 1 a closed tulip), facing `face`; 2 triangles a petal.
 */
export function writeBloom(out: Out, at: V3, face: V3, r: number, petals: number, cup: number, random: () => number): void {
  const f = face.clone().normalize();
  const x = new V3(1, 0, 0);
  if (Math.abs(f.dot(x)) > 0.9) x.set(0, 0, 1);
  const y = new V3().crossVectors(f, x).normalize();
  x.crossVectors(y, f).normalize();
  const tone = random();
  const turn = random() * TAU;
  // (each flower goes at its own distance, so a meadow's thin out and do not all go at once)
  const fade = random() * 0.9;
  const q = new V3();
  for (let k = 0; k < petals; k++) {
    const a = turn + (k / petals) * TAU;
    const half = (Math.PI / petals) * 0.9;
    const first = out.pos.length / 3;
    // the petal's foot at the eye, its two shoulders, its tip: cupped up towards the face
    const pts: [number, number, number][] = [
      [0, 0, 0],
      [Math.cos(a - half) * 0.6, Math.sin(a - half) * 0.6, cup * 0.35],
      [Math.cos(a) * 1, Math.sin(a) * 1, cup * 0.75],
      [Math.cos(a + half) * 0.6, Math.sin(a + half) * 0.6, cup * 0.35],
    ];
    for (const [px, py, pz] of pts) {
      q.copy(at).addScaledVector(x, px * r).addScaledVector(y, py * r).addScaledVector(f, pz * r);
      tN.copy(f).multiplyScalar(0.7).addScaledVector(x, px * 0.3).addScaledVector(y, py * 0.3).normalize();
      out.vertex(q.x, q.y, q.z, tN.x, tN.y, tN.z, 0.5, 0.5, tone + 0.25 * Math.hypot(px, py), fade, 0.9, q.y, PART_BLOOM);
    }
    out.idx.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
}

/** a plan's clumps' total sprays near (for reports) */
export function plannedSprays(plan: Plan): number {
  return plan.clumps.reduce((s, k) => s + plan.cards * Math.min(2.2, (k.r / plan.rRef) ** 2), 0);
}
