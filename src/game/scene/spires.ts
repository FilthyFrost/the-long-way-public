/**
 * The spires drawn (V5, docs/V3/nodes/V5-landforms.md; where they stand and how big: core/world/earth/spires.ts): a
 * pillar mountain's pillars, a karst's towers, a coast's sea stacks — rock the land's height field cannot hold.
 *
 * Each is turned on a lathe of its own, ring over ring a few metres apart, its section a rounded block (squarer in a
 * sandstone pillar, rounder in a karst tower) with a few lobes of its own; the joints of the rock cut down its sides
 * as grooves, some the whole way, some part of it; its bedding a ledge every ten or twenty metres where it steps in or
 * out; its foot spread into the scree, a stack's notched by the waves at the waterline, its top rounded off — a
 * pillar's and a stack's nearly flat, a tower's a dome. A hand's roughness over all of it, so no face is flat.
 * Painted as the stones are (render/materials.ts surfaceMaterial with its brush): the rock's own light and shade in the
 * place's light, each bed a little its own, the rain's dark streaks down from the ledges, moss on what is level, a
 * karst tower hung with green; a stack dark and wet low down with a band of salt over it. Trees on their tops and
 * along their ledges are the far woods' painted cards (render/materials.ts farWoodsMaterial), in the land's palette.
 * A stack's foot is ringed with the sea's white. A place's spires one mesh, their trees one draw, their surf another.
 */
import * as THREE from 'three';
import type { World } from '../../core/world/terrain';
import { TerrainPoint } from '../../core/world/terrain';
import { SpineSample } from '../../core/world/spine';
import { hasSpires, spiresOf, type Spire } from '../../core/world/earth/spires';
import { rock } from '../../core/earth/rocks';
import { BIOMES } from '../../core/world/biomes';
import { hexOf, stoneColour } from '../../core/world/earth/palette';
import type { RenderCore } from '../render/core';
import { farWoodsMaterial, surfaceMaterial } from '../render/materials';
import { GLSL_COMMON, GLSL_FRAGMENT_PARS, globals } from '../render/shaderlib';
import { buildWoodsCard } from './worldBuild';

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------------------------- the rock

interface Habit {
  /** the section's squareness (2 an ellipse … 4 a block with rounded corners) */
  square: readonly [number, number];
  /** its lobes: how far its section bulges in two, three and five (share of its radius) */
  lobes: readonly [number, number, number];
  /** splits: deep grooves the whole way down, as if it were two or three pillars grown into one */
  splits: readonly [number, number];
  splitDepth: readonly [number, number];
  /** grooves down its sides: how many, how deep (share of its radius) */
  grooves: readonly [number, number];
  grooveDepth: readonly [number, number];
  /** a ledge every so many metres, stepping in by so much (share); now and then one steps out under an overhang */
  bed: readonly [number, number];
  step: readonly [number, number];
  /** how far its foot spreads (share of its radius) and over how much of its height */
  flare: number;
  flareUp: number;
  /** how much of its height is the rounding of its top, and how round (2 a dome … 5 nearly flat) */
  cap: number;
  capRound: number;
  /** how much narrower it is at its top than at its waist */
  taper: number;
  /** how far its middle wanders as it rises (share of its radius) */
  lean: number;
  /** how much of its steep side the green hangs on, and how readily shrubs cling there */
  hung: number;
  cling: number;
}

const HABITS: Record<Spire['kind'], Habit> = {
  pillar: { square: [3.0, 4.4], lobes: [0.16, 0.1, 0.04], splits: [0, 2], splitDepth: [0.2, 0.36], grooves: [5, 9], grooveDepth: [0.08, 0.22], bed: [7, 17], step: [0.03, 0.1], flare: 0.3, flareUp: 0.1, cap: 0.05, capRound: 4.5, taper: 0.1, lean: 0.14, hung: 0.45, cling: 0.32 },
  tower: { square: [2.1, 2.7], lobes: [0.12, 0.08, 0.03], splits: [0, 1], splitDepth: [0.12, 0.2], grooves: [3, 6], grooveDepth: [0.05, 0.12], bed: [12, 26], step: [0.02, 0.06], flare: 0.85, flareUp: 0.3, cap: 0.3, capRound: 2.2, taper: 0.1, lean: 0.06, hung: 0.8, cling: 0.4 },
  stack: { square: [2.6, 4.0], lobes: [0.14, 0.08, 0.035], splits: [0, 1], splitDepth: [0.15, 0.3], grooves: [4, 7], grooveDepth: [0.06, 0.16], bed: [4, 9], step: [0.03, 0.08], flare: 0.22, flareUp: 0.2, cap: 0.06, capRound: 4, taper: 0.16, lean: 0.08, hung: 0.12, cling: 0.05 },
  // (V9: an arch is swept, not turned — its paint and its shrubs read this)
  arch: { square: [2.6, 3.4], lobes: [0.14, 0.08, 0.035], splits: [0, 0], splitDepth: [0, 0], grooves: [0, 0], grooveDepth: [0, 0], bed: [5, 9], step: [0.03, 0.06], flare: 0.3, flareUp: 0.2, cap: 0.06, capRound: 4, taper: 0, lean: 0, hung: 0.12, cling: 0.05 },
};

/**
 * (V9) A sea arch into the arrays: a tube of rock swept along a half circle from one leg's foot on the sea floor over
 * its crown to the other's, thick at its legs and thinner over its door, its section a rounded block with lobes of
 * its own and a hand's roughness, its legs notched by the waves; trees on its crown. Painted by paintSpires.
 */
function sweepArch(sp: Spire, paint: Paint, ax: number, ay: number, az: number, pos: number[], idx: number[], perches: Perch[], turned: Turned[]): void {
  const rnd = mulberry(Math.floor(sp.seed * 4294967295) ^ 0x2a7c);
  const span = sp.span ?? sp.r * 5;
  const M = 28;
  const N = 44;
  const cx = Math.cos(sp.yaw);
  const cz = Math.sin(sp.yaw);
  // (across the arch, level: its thickness; the arc lies in the upright plane along its turn)
  const nx = -cz;
  const nz = cx;
  const ph = [rnd() * 6.283, rnd() * 6.283, rnd() * 6.283];
  // (a wall of rock with its door, not a tube: a squared section, flat-topped and thick over the door)
  const square = 3.6 + 1.2 * rnd();
  const first = pos.length / 3;
  const ring: number[] = [];
  const foot = sp.foot - 3;
  const crown = sp.level + sp.h;
  const at = (t: number): [number, number, number] => {
    const th = Math.PI * t;
    // a half circle a little pinched at its crown, its legs going down into the sea floor
    const along = -Math.cos(th) * span * 0.5;
    // (its legs steep, its lintel nearly level: a door, not a hoop)
    const rise = Math.pow(Math.sin(th), 0.45);
    return [sp.x + cx * along, foot + (crown - foot) * rise, sp.z + cz * along];
  };
  for (let i = 0; i <= N; i++) {
    const t = -0.04 + (1.08 * i) / N;
    const [px, py, pz] = at(Math.min(1, Math.max(0, t)));
    // its tangent, and the up of its section (in the arc's plane, square to the tangent)
    const [qx, qy, qz] = at(Math.min(1, Math.max(0, t + 0.01)));
    const [rx, ry, rz] = at(Math.min(1, Math.max(0, t - 0.01)));
    let tx = qx - rx;
    let ty = qy - ry;
    let tz = qz - rz;
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl;
    ty /= tl;
    tz /= tl;
    // b = t × n (n the level cross direction)
    const bx = ty * nz;
    const by = tz * nx - tx * nz;
    const bz = -ty * nx;
    const edge = Math.abs(t - 0.5) * 2;
    // thick at its legs, thinner over its door; the waves' notch at the waterline
    let r = sp.r * (0.85 + 0.45 * Math.pow(edge, 1.8)) * (1 + 0.07 * Math.sin(t * 13 + ph[0]) + 0.05 * Math.sin(t * 29 + ph[1]));
    if (Math.abs(py - sp.level - 1.4) < 3) r *= 1 - 0.16 * Math.exp(-(((py - sp.level - 1.4) / 2.3) ** 2));
    for (let k = 0; k < M; k++) {
      const a = (k / M) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      let rs = Math.pow(Math.pow(Math.abs(ca), square) + Math.pow(Math.abs(sa), square), -1 / square);
      rs *= 1 + 0.1 * Math.sin(2 * a + ph[1] + t * 3) + 0.05 * Math.sin(3 * a + ph[2]);
      // (thicker up than across: over the door its lintel is deep; its top a little higher still)
      const up = sa > 0 ? 1.2 : 1.0;
      const ox = nx * ca * r * rs * sp.depth + bx * sa * r * rs * up;
      const oy = by * sa * r * rs * up;
      const oz = nz * ca * r * rs * sp.depth + bz * sa * r * rs * up;
      const wx = px + ox;
      const wy = py + oy;
      const wz = pz + oz;
      const rough = 1 + 0.06 * Math.sin(wx * 0.17 + wy * 0.13) * Math.sin(wz * 0.15 - wy * 0.11) + 0.025 * Math.sin(wx * 0.7 + wz * 0.6 + wy * 0.5);
      pos.push(px + ox * rough - ax, py + oy * rough - ay, pz + oz * rough - az);
      ring.push(k, i);
    }
  }
  for (let i = 0; i < N; i++)
    for (let k = 0; k < M; k++) {
      const a = first + i * M + k;
      const b = first + i * M + ((k + 1) % M);
      const c = a + M;
      const d = b + M;
      idx.push(a, b, c, b, d, c);
    }
  // its crown wooded where it is green
  if (sp.green > 0.05) {
    for (let i = 0; i < 3; i++) {
      const [px, py, pz] = at(0.4 + 0.1 * i);
      perches.push({ x: px + nx * (rnd() - 0.5) * sp.r * 0.6, y: py + sp.r * 0.75, z: pz + nz * (rnd() - 0.5) * sp.r * 0.6, size: 0.18 + 0.12 * rnd() * sp.green, sink: 1.2 });
    }
  }
  // (its beds: bands of their own tone up it, as a stack's)
  const ledges: { y: number; s: number }[] = [];
  for (let y = sp.level + 3 + 4 * rnd(); y < crown + sp.r; y += 4 + 5 * rnd()) ledges.push({ y, s: 0.05 });
  turned.push({ sp, first, count: pos.length / 3 - first, ring, ledges, M, streakPh: rnd() * 100, paint });
}

/** what the painter of a place's rock is given */
interface Paint {
  lit: THREE.Color;
  shade: THREE.Color;
  moss: THREE.Color;
  wood: THREE.Color;
  salt: THREE.Color;
}

/** where one of the woods' cards stands on a spire: its top, its ledges, the shrubs on its sides */
interface Perch {
  x: number;
  y: number;
  z: number;
  /** a card's size (a card is 38 m across at 1), and how far it is sunk (m) */
  size: number;
  sink: number;
}

/** what paintSpires needs of each spire turned into a geometry */
interface Turned {
  sp: Spire;
  first: number;
  count: number;
  /** each vertex's place round its ring (−1 the crown), and its ring */
  ring: number[];
  ledges: { y: number; s: number }[];
  M: number;
  streakPh: number;
  paint: Paint;
}

/** one spire into the arrays (vertices about (ax, ay, az)): its rings, and the trees of its top and ledges (its colours: paintSpires) */
function turnSpire(sp: Spire, paint: Paint, ax: number, ay: number, az: number, pos: number[], idx: number[], perches: Perch[], turned: Turned[]): void {
  const hb = HABITS[sp.kind];
  const rnd = mulberry(Math.floor(sp.seed * 4294967295) ^ 0x51f3);
  const lerp = (a: readonly [number, number], t: number): number => a[0] + (a[1] - a[0]) * t;
  const square = lerp(hb.square, rnd());
  const M = sp.kind === 'tower' ? 40 : 34;
  const ph = [rnd() * 6.283, rnd() * 6.283, rnd() * 6.283, rnd() * 6.283, rnd() * 6.283, rnd() * 6.283];
  const lobe = [hb.lobes[0] * (0.4 + 0.6 * rnd()), hb.lobes[1] * (0.4 + 0.6 * rnd()), hb.lobes[2] * (0.4 + 0.6 * rnd())];
  // the joints: grooves down its sides; the splits the deepest of them, the whole way down
  const grooves: { a: number; w: number; d: number; t0: number; t1: number }[] = [];
  const S = Math.round(lerp(hb.splits, rnd()));
  for (let k = 0; k < S; k++) grooves.push({ a: rnd() * 6.283, w: 0.13 + 0.09 * rnd(), d: lerp(hb.splitDepth, rnd()), t0: -0.3, t1: 0.85 + 0.4 * rnd() });
  const G = Math.round(lerp(hb.grooves, rnd()));
  for (let k = 0; k < G; k++) {
    const full = rnd() < 0.45;
    const t0 = full ? -0.2 : rnd() * 0.6;
    grooves.push({ a: rnd() * 6.283, w: 0.06 + 0.12 * rnd(), d: lerp(hb.grooveDepth, rnd()), t0, t1: full ? 1.2 : t0 + 0.2 + 0.6 * rnd() });
  }
  // the bedding: ledges up its height, each stepping in (or now and then out, under an overhang)
  const base = sp.kind === 'stack' ? sp.foot - 2 : sp.foot - 4;
  const top = sp.level + sp.h;
  const ledges: { y: number; s: number }[] = [];
  for (let y = sp.level + lerp(hb.bed, rnd()) * 0.7; y < top - sp.h * hb.cap - 3; y += lerp(hb.bed, rnd())) ledges.push({ y, s: lerp(hb.step, rnd()) * (rnd() < 0.22 ? -0.55 : 1) });
  // the rings' heights: every few metres, either side of each ledge, close together over its top
  const H = top - base;
  const ys: number[] = [];
  const step = Math.max(2.4, H / 44);
  for (let y = base; y < top - sp.h * hb.cap; y += step) ys.push(y);
  for (const l of ledges) ys.push(l.y - 0.5, l.y + 0.5);
  if (sp.kind === 'stack') ys.push(sp.level - 0.3, sp.level + 1.2, sp.level + 2.6, sp.level + 4.2);
  const capFrom = top - sp.h * hb.cap;
  for (const u of [0, 0.3, 0.55, 0.72, 0.84, 0.92, 0.965, 0.99]) ys.push(capFrom + u * sp.h * hb.cap);
  ys.sort((a, b) => a - b);
  for (let i = ys.length - 1; i > 0; i--) if (ys[i] - ys[i - 1] < 0.25) ys.splice(i, 1);
  const cy = Math.cos(sp.yaw);
  const syw = Math.sin(sp.yaw);
  const first = pos.length / 3;
  const ring: number[] = [];
  /** its middle as it rises: it leans and wanders a little (local, before its turn) */
  const mid = (t: number): [number, number] => [sp.r * hb.lean * (Math.sin(t * 3.1 + ph[4]) - Math.sin(ph[4])), sp.r * hb.lean * 0.8 * (Math.sin(t * 2.3 + ph[5]) - Math.sin(ph[5]))];
  /** its radius at a height (a share of sp.r, before its section's shape) */
  const profile = (y: number): number => {
    const t = (y - sp.level) / sp.h;
    let prof = 1 + hb.flare * (1 - smooth(-0.05, hb.flareUp, t)) ** 1.6;
    prof *= 1 - hb.taper * Math.max(0, t);
    prof *= 1 + 0.05 * Math.sin(t * 8.3 + ph[0]) + 0.03 * Math.sin(t * 21 + ph[1]);
    // (a stack's notch: the waves cut it in at the waterline)
    if (sp.kind === 'stack') prof *= 1 - 0.17 * Math.exp(-(((y - sp.level - 1.4) / 2.3) ** 2));
    for (const l of ledges) prof *= 1 - l.s * smooth(l.y - 0.5, l.y + 0.5, y);
    if (y > capFrom) {
      const u = Math.min(1, (y - capFrom) / (top - capFrom));
      prof *= Math.pow(Math.max(0, 1 - Math.pow(u, hb.capRound)), 1 / hb.capRound);
    }
    return prof;
  };
  /** its section at an angle (a share of the radius), at a height t */
  const section = (a: number, t: number): number => {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const tc = Math.min(1, Math.max(0, t));
    let r = Math.pow(Math.pow(Math.abs(ca), square) + Math.pow(Math.abs(sa), square), -1 / square);
    r *= 1 + lobe[0] * Math.sin(2 * a + ph[1] + 0.7 * tc) + lobe[1] * Math.sin(3 * a + ph[2] - 0.5 * tc) + lobe[2] * Math.sin(5 * a + ph[3]);
    for (const g of grooves) {
      let da = Math.abs(a - g.a);
      if (da > Math.PI) da = 2 * Math.PI - da;
      const v = Math.max(0, 1 - da / g.w);
      if (v > 0) r *= 1 - g.d * v ** 1.4 * smooth(g.t0, g.t0 + 0.06, t) * (1 - smooth(g.t1 - 0.06, g.t1, t));
    }
    return r;
  };
  const toWorld = (lx: number, lz: number): [number, number] => [sp.x + lx * cy + lz * syw, sp.z - lx * syw + lz * cy];
  for (let j = 0; j < ys.length; j++) {
    const y = ys[j];
    const t = (y - sp.level) / sp.h;
    const prof = profile(y);
    const [mx, mz] = mid(Math.max(0, t));
    for (let k = 0; k < M; k++) {
      const a = (k / M) * Math.PI * 2;
      const r = sp.r * prof * section(a, t);
      let lx = Math.cos(a) * r;
      let lz = Math.sin(a) * r * sp.depth;
      // a hand's roughness, in metres of the world
      const [wx0, wz0] = toWorld(lx, lz);
      const rough = 1 + 0.035 * Math.sin(wx0 * 0.29 + y * 0.21 + ph[0]) * Math.sin(wz0 * 0.31 - y * 0.17 + ph[2]) + 0.018 * Math.sin(wx0 * 0.9 + wz0 * 0.7 + y * 0.8);
      lx = lx * rough + mx;
      lz = lz * rough + mz;
      const [wx, wz] = toWorld(lx, lz);
      pos.push(wx - ax, y - ay, wz - az);
      ring.push(k, j);
    }
  }
  // the crown of its top: one vertex
  const apex = pos.length / 3;
  const [tx0, tz0] = mid(1);
  const [apx, apz] = toWorld(tx0, tz0);
  pos.push(apx - ax, top - ay + 0.4, apz - az);
  ring.push(-1, ys.length);
  for (let j = 0; j + 1 < ys.length; j++)
    for (let k = 0; k < M; k++) {
      const a = first + j * M + k;
      const b = first + j * M + ((k + 1) % M);
      const c = a + M;
      const d = b + M;
      idx.push(a, c, b, b, c, d);
    }
  const last = first + (ys.length - 1) * M;
  for (let k = 0; k < M; k++) idx.push(last + k, apex, last + ((k + 1) % M));
  // its trees: a crown of them round the rim of its top and a few within (a tower's dome grown over), and on its ledges
  if (sp.green > 0.05) {
    const rTop = sp.r * profile(capFrom) * 0.96;
    const nRim = sp.kind === 'tower' ? 6 + Math.floor(sp.r / 9) : 3 + Math.floor(rTop / 6);
    for (let i = 0; i < nRim; i++) {
      const a = ((i + 0.6 * rnd()) / nRim) * Math.PI * 2;
      const rr = rTop * section(a, 1) * (sp.kind === 'tower' ? 0.55 + 0.5 * rnd() : 0.72 + 0.26 * rnd());
      const [wx, wz] = toWorld(Math.cos(a) * rr + tx0, Math.sin(a) * rr * sp.depth + tz0);
      const drop = sp.kind === 'tower' ? sp.h * hb.cap * (1 - Math.pow(Math.max(0, 1 - Math.pow(rr / (rTop * 1.05), hb.capRound)), 1 / hb.capRound)) : 0;
      perches.push({ x: wx, y: top - drop, z: wz, size: (sp.kind === 'tower' ? 0.42 : 0.3) + 0.25 * rnd() * sp.green, sink: 2.2 });
    }
    for (let i = 0; i < (sp.kind === 'tower' ? 3 : 1 + Math.floor(rTop / 14)); i++) {
      const [wx, wz] = toWorld(tx0 + (rnd() - 0.5) * rTop * 0.6, tz0 + (rnd() - 0.5) * rTop * 0.6 * sp.depth);
      perches.push({ x: wx, y: top, z: wz, size: 0.4 + 0.3 * rnd(), sink: 3 });
    }
    for (const l of ledges) {
      if (l.s < 0.035) continue;
      const n = rnd() < sp.green * 0.9 ? 1 + Math.floor(rnd() * 2.6 * sp.green) : 0;
      for (let i = 0; i < n; i++) {
        const t = (l.y - sp.level) / sp.h;
        const a = rnd() * 6.283;
        const rr = sp.r * profile(l.y - 0.6) * section(a, t) * 0.97;
        const [mx, mz] = mid(Math.max(0, t));
        const [wx, wz] = toWorld(Math.cos(a) * rr + mx, Math.sin(a) * rr * sp.depth + mz);
        perches.push({ x: wx, y: l.y, z: wz, size: 0.16 + 0.16 * rnd(), sink: 1.2 });
      }
    }
  }
  turned.push({ sp, first, count: pos.length / 3 - first, ring, ledges, M, streakPh: rnd() * 100, paint });
}

/** the colours of the turned spires, once their normals are known; and the shrubs that cling to their steep sides */
function paintSpires(turned: readonly Turned[], pos: ArrayLike<number>, nrm: ArrayLike<number>, col: Float32Array, ax: number, ay: number, az: number, perches: Perch[]): void {
  const c = new THREE.Color();
  for (const s of turned) {
    const { sp, paint } = s;
    const hb = HABITS[sp.kind];
    const rnd = mulberry(Math.floor(sp.seed * 4294967295) ^ 0x7a11);
    for (let i = 0; i < s.count; i++) {
      const v = s.first + i;
      const y = pos[v * 3 + 1] + ay;
      const ny = nrm[v * 3 + 1];
      const k = s.ring[i * 2];
      const t = Math.min(1, Math.max(0, (y - sp.level) / sp.h));
      // the rock's own light and shade (the material lights it): darker low down, each bed a little its own
      let bedIx = 0;
      for (const l of s.ledges) if (y > l.y) bedIx++;
      const bedTone = 0.86 + 0.22 * Math.abs((Math.sin(bedIx * 12.9898 + sp.seed * 78.233) * 43758.5453) % 1);
      c.copy(paint.shade).lerp(paint.lit, 0.3 + 0.5 * smooth(0, 0.55, t));
      c.multiplyScalar(bedTone);
      // the rain's streaks: dark columns from each ledge down, a few pale ones where the water runs clean
      let patch = 0;
      if (k >= 0) {
        const a = k / s.M;
        const col0 = 0.5 + 0.5 * Math.sin(a * 6.283 * 5 + s.streakPh + 2.5 * Math.sin(a * 6.283 * 2 + s.streakPh * 0.3));
        const col1 = 0.5 + 0.5 * Math.sin(a * 6.283 * 13 + s.streakPh * 1.7);
        let below = 1;
        for (const l of s.ledges) if (l.y > y) below = Math.min(below, (l.y - y) / 26);
        const streak = smooth(0.5, 0.85, col0 * 0.65 + col1 * 0.35) * (1 - smooth(0.25, 1, below) * 0.5);
        c.multiplyScalar(1 - 0.42 * streak);
        const pale = smooth(0.8, 0.97, col1) * (1 - streak);
        c.lerp(paint.lit, 0.25 * pale);
        patch = 0.5 + 0.5 * Math.sin(k * 0.9 + y * 0.11 + sp.seed * 40) * Math.sin(k * 0.37 - y * 0.07 + sp.seed * 13);
      }
      // a stack: dark and wet low down, a band of salt above that
      if (sp.kind === 'stack' || sp.kind === 'arch') {
        const up = y - sp.level;
        if (up < 2.2) c.multiplyScalar(0.48 + (0.24 * Math.max(0, up)) / 2.2);
        else if (up < 5.5) c.lerp(paint.salt, 0.28 * (1 - Math.abs(up - 3.6) / 1.9));
      }
      // green: moss on what is level, the wood's green hung on its steep sides, its top grown over
      const level = smooth(0.4, 0.75, ny) * sp.green;
      const hung = hb.hung * sp.green * smooth(0.5, 0.75, patch + 0.2 * t) * smooth(0.04, 0.2, t);
      c.lerp(paint.moss, Math.min(1, level));
      c.lerp(paint.wood, Math.min(0.92, hung));
      col[v * 3] = c.r;
      col[v * 3 + 1] = c.g;
      col[v * 3 + 2] = c.b;
      // a shrub or a pine clinging where it is steep and the green hangs (a few of the vertices there, not every one)
      if (k >= 0 && ny < 0.55 && ny > -0.3 && t > 0.06 && t < 0.97 && rnd() < hb.cling * sp.green * (0.25 + hung) * 0.11) {
        const nx = nrm[v * 3];
        const nz = nrm[v * 3 + 2];
        perches.push({ x: pos[v * 3] + ax + nx * 1.4, y: y - 0.8, z: pos[v * 3 + 2] + az + nz * 1.4, size: 0.1 + 0.1 * rnd(), sink: 0.5 });
      }
    }
  }
}

function paintOf(region: number, rockId: Parameters<typeof rock>[0]): Paint {
  const rk = rock(rockId);
  const pal = BIOMES[region]?.earth?.palette;
  const lit = pal ? stoneColour(pal, rk.lit) : rk.lit;
  const shade = pal ? stoneColour(pal, rk.shade) : rk.shade;
  const moss = pal ? hexOf({ ...pal.grass, L: pal.grass.L * 0.82 }, pal.cast) : 0x6f8f45;
  const wood = pal ? hexOf({ ...pal.woods, L: pal.woods.L * 0.78 }, pal.cast) : 0x3d6b3a;
  const f = (h: number): THREE.Color => new THREE.Color(h).convertSRGBToLinear();
  return { lit: f(lit), shade: f(shade), moss: f(moss), wood: f(wood), salt: f(0xe9e5dc) };
}

/** a piece's spires as one mesh (about (ax, ay, az)), and where their trees stand */
function spireGeometry(spires: readonly Spire[], paint: Paint, ax: number, ay: number, az: number, perches: Perch[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const turned: Turned[] = [];
  for (const sp of spires) {
    if (sp.kind === 'arch') sweepArch(sp, paint, ax, ay, az, pos, idx, perches, turned);
    else turnSpire(sp, paint, ax, ay, az, pos, idx, perches, turned);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const col = new Float32Array(pos.length);
  paintSpires(turned, pos, g.getAttribute('normal').array, col, ax, ay, az, perches);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------------------------------------- the surf

const RINGS = 5;
const SEG = 48;

function surfGeometry(world: World, stacks: readonly Spire[], ax: number, ay: number, az: number): THREE.BufferGeometry {
  const st = new SpineSample();
  const pos: number[] = [];
  const ring: number[] = [];
  const idx: number[] = [];
  // (an arch's legs each ringed as a stack is)
  const legs: Spire[] = [];
  for (const s of stacks) {
    if (s.kind === 'stack') legs.push(s);
    else if (s.kind === 'arch' && s.span)
      for (const e of [-0.5, 0.5]) legs.push({ ...s, kind: 'stack', x: s.x + Math.cos(s.yaw) * s.span * e, z: s.z + Math.sin(s.yaw) * s.span * e, r: s.r * 0.9 });
  }
  for (const s of legs) {
    const base = pos.length / 3;
    const R0 = s.r * (1 + HABITS.stack.flare) * 0.92;
    // (the swell comes in off the open sea: the foam heaped on a stack's seaward side, its lee nearly still)
    world.spine.at(s.s, st);
    const seaward = Math.atan2(s.z - st.z, s.x - st.x);
    const cy = Math.cos(s.yaw);
    const sy = Math.sin(s.yaw);
    for (let j = 0; j <= RINGS; j++) {
      const rho = j / RINGS;
      for (let k = 0; k < SEG; k++) {
        const a = (k / SEG) * Math.PI * 2;
        const w = 1 + 0.12 * Math.sin(3 * a + s.seed * 30) + 0.06 * Math.sin(7 * a + s.seed * 70);
        const ux = Math.cos(a) * w;
        const uz = Math.sin(a) * w * s.depth;
        const wa = Math.atan2(-ux * sy + uz * cy, ux * cy + uz * sy);
        const face = 0.5 + 0.5 * Math.cos(wa - seaward);
        const R = R0 * (0.86 + 1.5 * rho * (0.55 + 0.9 * face));
        const lx = ux * R;
        const lz = uz * R;
        pos.push(s.x + lx * cy + lz * sy - ax, s.level - ay + 0.1, s.z - lx * sy + lz * cy - az);
        ring.push(rho, face, s.seed, a);
      }
    }
    for (let j = 0; j < RINGS; j++)
      for (let k = 0; k < SEG; k++) {
        const a = base + j * SEG + k;
        const b = base + j * SEG + ((k + 1) % SEG);
        // (wound to face up)
        idx.push(a, b, a + SEG, b, b + SEG, a + SEG);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aRing', new THREE.Float32BufferAttribute(ring, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function surfMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...globals },
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute vec4 aRing;
      varying vec3 vPos;
      varying vec3 vNormal;
      varying vec4 vRing;
      void main() {
        vRing = aRing;
        vNormal = vec3(0.0, 1.0, 0.0);
        vec4 w = modelMatrix * vec4(position, 1.0);
        vPos = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FRAGMENT_PARS}
      ${GLSL_COMMON}
      varying vec4 vRing;
      void main() {
        #include <logdepthbuf_fragment>
        vec2 w = rtWorldXZ(vPos);
        float rho = vRing.x;
        float seed = vRing.z;
        float n = rtNoiseAt(w + seed * 91.0 + vec2(uTime * 0.3, -uTime * 0.2), 7.0).r;
        float n2 = rtNoiseAt(w + seed * 37.0, 2.2).g;
        // the sea white against its foot, and the bands of a wave's wash running out from it, broken up as they go
        float face = vRing.y;
        float wash = (1.0 - smoothstep(0.03, 0.1 + 0.2 * face + 0.14 * n, rho)) * (0.45 + 0.55 * face);
        float band = smoothstep(0.55, 0.8, sin((rho * 3.2 - uTime * 0.35 + seed * 9.0) * 6.2832 + n * 4.0) * 0.5 + 0.5);
        float foam = max(wash, band * (1.0 - smoothstep(0.3, 1.0, rho)) * smoothstep(0.35, 0.65, n2 + 0.2 * n) * smoothstep(0.15, 0.75, face + 0.25 * (n - 0.5)));
        if (foam < 0.02) discard;
        vec3 col = vec3(0.93, 0.96, 0.98) * (uSkyColor * 0.75 + uSunColor * 0.45 * rtShadow(vPos, vec3(0.0, 1.0, 0.0)));
        col = rtFog(col, vPos, cameraPosition);
        gl_FragColor = vec4(col, foam * 0.92);
      }`,
  });
}

// ---------------------------------------------------------------------------------------------- the trees on them

/** the woods' cards standing on a piece's perches (about (ax, ay, az)) */
function treeCards(world: World, tp: TerrainPoint, spires: readonly Spire[], perches: readonly Perch[], ax: number, ay: number, az: number, template: THREE.BufferGeometry): THREE.InstancedBufferGeometry | null {
  if (!perches.length) return null;
  // (the land's palette slots at the spires: the cards are painted in the wood's colours beside them)
  world.shape(spires[0].x, spires[0].z, tp);
  const pair = (tp.ca & 3) + 4 * (tp.cb & 3);
  const share = tp.bt;
  const roots: number[] = [];
  const info: number[] = [];
  let i = 0;
  for (const p of perches) {
    const r = Math.abs((Math.sin(i * 12.9898 + p.x * 0.013) * 43758.5453) % 1);
    i++;
    roots.push(p.x - ax, p.y - ay - p.sink, p.z - az, p.size);
    info.push(pair, share, r, Math.floor(r * 4) % 4);
  }
  const geo = new THREE.InstancedBufferGeometry();
  for (const [name, attr] of Object.entries(template.attributes)) geo.setAttribute(name, (attr as THREE.BufferAttribute).clone());
  geo.setAttribute('aRoot', new THREE.InstancedBufferAttribute(new Float32Array(roots), 4));
  geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(new Float32Array(info), 4));
  geo.instanceCount = roots.length / 4;
  return geo;
}

// ---------------------------------------------------------------------------------------------- the view

interface Live {
  meshes: THREE.Mesh[];
  anchor: [number, number, number];
  spires: readonly Spire[];
}

/** the spires of the places near the road (ModGame updates it with the road's distance) */
export class SpireView {
  private readonly live = new Map<number, Live>();
  private readonly rockMat = surfaceMaterial({ vertexColors: true, brush: 0.7 });
  private readonly surfMat = surfMaterial();
  // (the far woods' cards, but from near too: a pillar's top is seen from a few hundred metres)
  private readonly woodsMat = farWoodsMaterial({ in: [0, 1], out: [5200, 6000] });
  private readonly card = buildWoodsCard();
  private readonly tp = new TerrainPoint();
  private readonly st = new SpineSample();
  private planS = NaN;
  /** how many spires are drawn, and their triangles (the harness asks) */
  spires = 0;
  triangles = 0;

  constructor(
    private readonly core: RenderCore,
    private readonly world: World,
  ) {
    core.onRebase(() => {
      for (const l of this.live.values()) for (const m of l.meshes) core.place(m, l.anchor[0], l.anchor[1], l.anchor[2]);
    });
  }

  /** the spires of the places in reach (the harness asks) */
  near(): Spire[] {
    const out: Spire[] = [];
    for (const l of this.live.values()) out.push(...l.spires);
    return out;
  }

  update(s: number): void {
    const earth = this.world.earth;
    if (!earth || Math.abs(s - this.planS) < 150) return;
    this.planS = s;
    const keep = new Set<number>();
    for (const p of earth.pieces) {
      if (p.end < s - 3000 || p.start > s + 7000 || !hasSpires(p)) continue;
      keep.add(p.index);
      if (this.live.has(p.index)) continue;
      const spires = spiresOf(this.world, p, this.tp, this.st);
      const meshes: THREE.Mesh[] = [];
      const anchor: [number, number, number] = spires.length ? [spires[0].x, spires[0].level, spires[0].z] : [0, 0, 0];
      if (spires.length && p.scene) {
        const paint = paintOf(p.region, p.scene.place.macro.rock);
        const perches: Perch[] = [];
        const geo = spireGeometry(spires, paint, anchor[0], anchor[1], anchor[2], perches);
        const rockMesh = new THREE.Mesh(geo, this.rockMat);
        rockMesh.name = 'spires:rock';
        meshes.push(rockMesh);
        if (spires.some((x) => x.kind === 'stack' || x.kind === 'arch')) {
          const surf = new THREE.Mesh(surfGeometry(this.world, spires, anchor[0], anchor[1], anchor[2]), this.surfMat);
          surf.name = 'spires:surf';
          surf.renderOrder = 4;
          meshes.push(surf);
        }
        const cards = treeCards(this.world, this.tp, spires, perches, anchor[0], anchor[1], anchor[2], this.card);
        if (cards) {
          const trees = new THREE.Mesh(cards, this.woodsMat);
          trees.name = 'spires:trees';
          trees.frustumCulled = false;
          meshes.push(trees);
        }
        for (const m of meshes) {
          this.core.place(m, anchor[0], anchor[1], anchor[2]);
          this.core.scene.add(m);
        }
      }
      this.live.set(p.index, { meshes, anchor, spires });
    }
    for (const [k, l] of this.live) {
      if (keep.has(k)) continue;
      for (const m of l.meshes) {
        this.core.scene.remove(m);
        m.geometry.dispose();
      }
      this.live.delete(k);
    }
    let n = 0;
    let tris = 0;
    for (const l of this.live.values()) {
      n += l.spires.length;
      for (const m of l.meshes) if (m.name === 'spires:rock') tris += (m.geometry.index?.count ?? 0) / 3;
    }
    this.spires = n;
    this.triangles = tris;
  }
}
