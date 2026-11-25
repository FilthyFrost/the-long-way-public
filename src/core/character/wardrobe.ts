// Her clothes beyond the nightdress (docs/V3/plan/character-pv.md §7): one pattern for each kind of garment, grown
// from her own body so it fits whatever her proportions are. A jacket is her trunk and arms pushed out by its
// thickness (a down jacket puffed out between its stitched baffles), cut at its hem, cuffs and collar; trousers her
// hips and legs pushed out, cut at the waist and the ankles; boots her feet with a sole; gloves her hands, the fingers
// of a fingerless pair cut off at the middle joint; hats and packs are shapes laid on her head and back. Each is a
// shell of cloth a few millimetres thick (so a hem or a cuff shows its edge), skinned to her bones, and says which of
// her skin and which of the nightdress it hides. The game's item says which pattern and its two colours.

import { type Field, compile, hardMin, addNear, add, smooth, prim, roundCone, ellipsoid, frameAxes, type Prim, Kind, primsOf } from './sdf';
import { decimate } from './decimate';
import { polygonize } from './polygonize';
import type { Sculpt } from './body';
import type { Skeleton } from './skeleton';
import { skinWeights } from './mesh';
import type { GarmentMesh } from './dress';
import { type V3, add3, norm, scale3, sub3 } from './qmath';

export type Slot = 'hat' | 'jacket' | 'pants' | 'shoes' | 'gloves' | 'pack';
export type Pattern = 'jacket' | 'sweater' | 'padded' | 'down' | 'pants' | 'pants_snow' | 'shoes' | 'boots' | 'gloves' | 'gloves_fingerless' | 'gloves_ski' | 'cap' | 'beanie' | 'trapper' | 'pack' | 'pack_big';

/** Her body's regions, for hiding the skin under clothes (mesh.ts skinRegion). */
export const REGIONS = ['torso', 'upperarm', 'forearm', 'hand', 'thigh', 'shin', 'foot', 'neck', 'head'] as const;
export type Region = (typeof REGIONS)[number];

export interface PatternDef {
  slot: Slot;
  covers: Region[];
  /** what of the nightdress comes off under it (no layer shows through another): its top (cups, ribbons, the tie),
   *  its skirt, what is under the skirt (the lace shorts and the bandage on her thigh) */
  dress?: { top?: boolean; skirt?: boolean; under?: boolean };
  /** the hair under a hat: hidden within this polar angle of the crown (rad) */
  hatCut?: number;
  /** her feet are raised by a sole this thick (m) */
  sole?: number;
  /** how the shader paints it (clothMaterial.ts) */
  stuff: number;
}

export const PATTERNS: Record<Pattern, PatternDef> = {
  jacket: { slot: 'jacket', covers: ['torso', 'upperarm', 'forearm'], dress: { top: true, skirt: true }, stuff: 10 },
  sweater: { slot: 'jacket', covers: ['torso', 'upperarm', 'forearm'], dress: { top: true, skirt: true }, stuff: 11 },
  padded: { slot: 'jacket', covers: ['torso', 'upperarm', 'forearm'], dress: { top: true, skirt: true }, stuff: 12 },
  down: { slot: 'jacket', covers: ['torso', 'upperarm', 'forearm'], dress: { top: true, skirt: true }, stuff: 13 },
  pants: { slot: 'pants', covers: ['thigh', 'shin'], dress: { skirt: true, under: true }, stuff: 14 },
  pants_snow: { slot: 'pants', covers: ['thigh', 'shin'], dress: { skirt: true, under: true }, stuff: 15 },
  shoes: { slot: 'shoes', covers: ['foot'], sole: 0.012, stuff: 16 },
  boots: { slot: 'shoes', covers: ['foot'], sole: 0.014, stuff: 16 },
  gloves: { slot: 'gloves', covers: ['hand'], stuff: 17 },
  gloves_fingerless: { slot: 'gloves', covers: [], stuff: 17 },
  gloves_ski: { slot: 'gloves', covers: ['hand'], stuff: 17 },
  cap: { slot: 'hat', covers: [], hatCut: 0.95, stuff: 18 },
  beanie: { slot: 'hat', covers: [], hatCut: 1.2, stuff: 18 },
  trapper: { slot: 'hat', covers: [], hatCut: 1.25, stuff: 18 },
  pack: { slot: 'pack', covers: [], stuff: 19 },
  pack_big: { slot: 'pack', covers: [], stuff: 19 },
};

/** The game's wearable items (core/modcar/items.ts) and the pattern each is made in. */
export const ITEM_PATTERN: Record<string, Pattern> = {
  wear_cap: 'cap', wear_beanie: 'beanie', wear_trapper: 'trapper',
  wear_jacket_torn: 'jacket', wear_sweater_torn: 'sweater', wear_jacket: 'jacket', wear_padded: 'padded', wear_down: 'down',
  wear_pants_torn: 'pants', wear_pants: 'pants', wear_pants_lined: 'pants', wear_pants_snow: 'pants_snow',
  wear_shoes_torn: 'shoes', wear_shoes: 'boots',
  wear_gloves_torn: 'gloves_fingerless', wear_gloves: 'gloves', wear_gloves_wool: 'gloves', wear_gloves_ski: 'gloves_ski',
  pack_old: 'pack', pack_std: 'pack', pack_hike: 'pack_big',
};

const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A shell `thick` deep whose outside is `inner` pushed out by `out(p)`, kept where `keep(p)` ≤ 0. */
function shell(inner: Field, out: (x: number, y: number, z: number) => number, thick: number, keep: Field): Field {
  return (x, y, z) => {
    const d = inner(x, y, z);
    const t = out(x, y, z);
    return Math.max(Math.max(d - t, -(d - (t - thick))), keep(x, y, z));
  };
}

interface Grown { f: Field; min: V3; max: V3; h: number; target: number }

export function growGarment(sk: Skeleton, sc: Sculpt, pattern: Pattern, fine = false): GarmentMesh | null {
  const J = (n: string) => sk.bindPos[sk.index[n]];
  const prims = primsOf(sc.tree).filter((p: Prim) => p.kind !== Kind.Plane && p.claim > 0);
  let g: Grown | null = null;
  const stuff = PATTERNS[pattern].stuff;
  if (pattern === 'jacket' || pattern === 'sweater' || pattern === 'padded' || pattern === 'down') g = jacket(sk, sc, pattern, fine);
  else if (pattern === 'pants' || pattern === 'pants_snow') g = pants(sk, sc, pattern);
  else if (pattern === 'shoes' || pattern === 'boots') g = shoes(sk, sc, pattern);
  else if (pattern.startsWith('gloves')) g = gloves(sk, sc, pattern, fine);
  if (g) {
    const raw = polygonize(g.f, { h: g.h, min: g.min, max: g.max, project: 3 });
    if (raw.indices.length === 0) return null;
    const dec = decimate(raw.positions, raw.indices, { target: g.target, maxEdge: fine ? 0.012 : 0.03 });
    const positions = new Float32Array(dec.positions);
    const normals = new Float32Array(positions.length);
    const e = g.h * 0.5;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i], y = positions[i + 1], z = positions[i + 2];
      const gx = g.f(x + e, y, z) - g.f(x - e, y, z), gy = g.f(x, y + e, z) - g.f(x, y - e, z), gz = g.f(x, y, z + e) - g.f(x, y, z - e);
      const l = Math.hypot(gx, gy, gz) || 1;
      normals[i] = gx / l; normals[i + 1] = gy / l; normals[i + 2] = gz / l;
    }
    const w = skinWeights(sk, prims, positions, 0.006);
    const cloth = new Float32Array(positions.length / 3 * 4);
    // x: height (m), y: how far in from the nearest cut edge is not known here (9), z: the stuff, w: across (x of the bind pose)
    for (let i = 0; i < positions.length / 3; i++) cloth.set([positions[i * 3 + 1], 9, stuff, positions[i * 3]], i * 4);
    return { positions, normals, indices: dec.indices, skinIndex: w.skinIndex, skinWeight: w.skinWeight, cloth };
  }
  if (pattern === 'cap' || pattern === 'beanie' || pattern === 'trapper') return hat(sk, prims, pattern);
  if (pattern === 'pack' || pattern === 'pack_big') return pack(sk, sc, prims, pattern);
  void J;
  return null;
}

// --------------------------------------------------------------------------------------------- jackets

function jacket(sk: Skeleton, sc: Sculpt, pattern: Pattern, fine: boolean): Grown {
  const J = (n: string) => sk.bindPos[sk.index[n]];
  const shL = J('upperarm_l'), shR = J('upperarm_r');
  // a jacket hangs straight from the chest: the trunk's hollows filled by a column from the hips to the chest
  const col = prim(roundCone([0, 0.84, -0.012], [0, 1.2, 0.0], 0.13, 0.112, { bone: sk.index.spine_02, name: 'jacketcol' }, 1.0, 0.72));
  const trunk = smooth(0.05, sc.torso, col);
  const body = compile(hardMin(addNear(0.04, 0.01, shL, 0.12, trunk, sc.armOnly.l), addNear(0.04, 0.01, shR, 0.12, trunk, sc.armOnly.r)), 0.06);
  const base = pattern === 'down' ? 0.016 : pattern === 'padded' ? 0.012 : pattern === 'sweater' ? 0.006 : 0.007;
  const puff = pattern === 'down' ? 0.011 : pattern === 'padded' ? 0.004 : 0;
  const period = pattern === 'down' ? 0.075 : 0.11;
  const hem = pattern === 'down' ? 0.79 : pattern === 'padded' ? 0.82 : pattern === 'sweater' ? 0.86 : 0.83;
  const thick = Math.max(0.006, base * 0.6);
  // along each arm from its shoulder: the sleeve's own baffles
  const arm = (s: 'l' | 'r') => {
    const a = J(`upperarm_${s}`), b = J(`hand_${s}`);
    const d = norm(sub3(b, a));
    return { a, d, len: Math.hypot(...sub3(b, a)) };
  };
  const arms = { l: arm('l'), r: arm('r') };
  const out = (x: number, y: number, z: number) => {
    if (puff === 0) return base;
    const s = x >= 0 ? arms.l : arms.r;
    const u = (x - s.a[0]) * s.d[0] + (y - s.a[1]) * s.d[1] + (z - s.a[2]) * s.d[2];
    const armness = sm(Math.abs(shL[0]) - 0.01, Math.abs(shL[0]) + 0.05, Math.abs(x)) * sm(-0.02, 0.04, u);
    const t = armness > 0.5 ? u / period : (y - 0.78) / period;
    const band = 0.5 + 0.5 * Math.cos(t * Math.PI * 2);
    return base + puff * Math.pow(band, 0.6);
  };
  // the cuffs a little short of the wrist; the collar's top under the jaw; the hem
  const keep: Field = (x, y, z) => {
    let k = Math.max(hem - y, y - 1.395);
    for (const s of ['l', 'r'] as const) {
      const w = J(`hand_${s}`), e = J(`lowerarm_${s}`);
      const d = norm(sub3(w, e));
      const cut = (x - w[0]) * d[0] + (y - w[1]) * d[1] + (z - w[2]) * d[2] + 0.012;
      // only near that arm (the trunk is never cut by a cuff)
      if ((s === 'l' ? x : -x) > 0.2) k = Math.max(k, cut);
    }
    return k;
  };
  const f = shell(body, out, thick, keep);
  if (fine) {
    // the sleeves alone, finer, for first person: from below the elbow to the cuff
    return { f: (x, y, z) => Math.max(f(x, y, z), 0.24 - Math.abs(x)), min: [-0.62, 0.78, -0.16], max: [0.62, 1.2, 0.2], h: 0.0018, target: 12000 };
  }
  return { f, min: [-0.62, hem - 0.02, -0.22], max: [0.62, 1.42, 0.24], h: 0.0034, target: 14000 };
}

// --------------------------------------------------------------------------------------------- trousers

function pants(sk: Skeleton, sc: Sculpt, pattern: Pattern): Grown {
  const J = (n: string) => sk.bindPos[sk.index[n]];
  const hipL = J('thigh_l'), hipR = J('thigh_r');
  const body = compile(hardMin(addNear(0.05, 0.012, add3(hipL, [0, -0.04, 0]), 0.14, sc.torso, sc.legOnly.l), addNear(0.05, 0.012, add3(hipR, [0, -0.04, 0]), 0.14, sc.torso, sc.legOnly.r)), 0.06);
  const snow = pattern === 'pants_snow';
  const base = snow ? 0.014 : 0.006;
  const out = (_x: number, y: number) => base + (snow ? 0.004 * (0.5 + 0.5 * Math.cos(((y - 0.1) / 0.12) * Math.PI * 2)) : 0) + 0.008 * sm(0.5, 0.15, y);
  const keep: Field = (_x, y) => Math.max(y - 0.99, 0.095 - y);
  return { f: shell(body, out, Math.max(0.006, base * 0.6), keep), min: [-0.26, 0.07, -0.2], max: [0.26, 1.02, 0.18], h: 0.0035, target: 11000 };
}

// --------------------------------------------------------------------------------------------- shoes

function shoes(sk: Skeleton, sc: Sculpt, pattern: Pattern): Grown {
  const top = pattern === 'boots' ? 0.17 : 0.105;
  const feet = compile(hardMin(add(0.02, sc.footOnly.l, sc.legOnly.l), add(0.02, sc.footOnly.r, sc.legOnly.r)), 0.05);
  // a sole: the foot's outline pushed down and out a little
  const f: Field = (x, y, z) => {
    const d = feet(x, y, z);
    const upper = d - 0.007;
    // the sole: everything under the foot within its outline, from 0.014 down to −0.002 (her root is raised by it)
    const outline = feet(x, 0.012, z) - 0.009;
    const sole = Math.max(outline, Math.max(y - 0.012, -0.002 - y));
    const shoe = Math.min(upper, sole);
    return Math.max(shoe, Math.max(y - top, -(d - 0.0015) - (y > 0.012 ? 0 : 1)));
  };
  return { f, min: [-0.17, -0.01, -0.13], max: [0.17, top + 0.01, 0.17], h: 0.0022, target: 7000 };
}

// --------------------------------------------------------------------------------------------- gloves

function gloves(sk: Skeleton, sc: Sculpt, pattern: Pattern, fine: boolean): Grown {
  const J = (n: string) => sk.bindPos[sk.index[n]];
  const hands = compile(hardMin(sc.handOnly.l, sc.handOnly.r), 0.03);
  const ski = pattern === 'gloves_ski';
  const base = ski ? 0.0045 : 0.0022;
  const fingerless = pattern === 'gloves_fingerless';
  // the fingers' bones, for cutting a fingerless glove at the middle joint
  const fingers: { a: V3; b: V3; side: 'l' | 'r' }[] = [];
  for (const s of ['l', 'r'] as const) for (const f of ['index', 'middle', 'ring', 'pinky', 'thumb']) {
    const a = J(`${f}_0${f === 'thumb' ? 3 : 2}_${s}`), b = J(`${f}_04_leaf_${s}`);
    fingers.push({ a, b, side: s });
  }
  const keep: Field = (x, y, z) => {
    // the cuff a few centimetres up the forearm
    let k = -1;
    for (const s of ['l', 'r'] as const) {
      const w = J(`hand_${s}`), e = J(`lowerarm_${s}`);
      const d = norm(sub3(w, e));
      if ((s === 'l' ? x : -x) > 0.25) k = Math.max(k, -((x - w[0]) * d[0] + (y - w[1]) * d[1] + (z - w[2]) * d[2]) - (ski ? 0.06 : 0.035));
    }
    if (fingerless) {
      // past the middle of a finger's middle bone (the thumb's last): bare
      for (const fg of fingers) {
        const d = sub3(fg.b, fg.a);
        const L2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
        const t = ((x - fg.a[0]) * d[0] + (y - fg.a[1]) * d[1] + (z - fg.a[2]) * d[2]) / L2;
        const q = add3(fg.a, scale3(d, Math.min(1, Math.max(0, t))));
        const r = Math.hypot(x - q[0], y - q[1], z - q[2]);
        if (r < 0.013 && t > -0.15) k = Math.max(k, 0.01);
      }
    }
    return k;
  };
  const f = shell(hands, () => base, Math.max(0.0016, base * 0.6), keep);
  return { f, min: [-0.66, 0.72, -0.1], max: [0.66, 1.0, 0.16], h: fine ? 0.0011 : 0.0018, target: fine ? 14000 : 9000 };
}

// --------------------------------------------------------------------------------------------- hats

function hat(sk: Skeleton, prims: Prim[], pattern: Pattern): GarmentMesh {
  const head = sk.bindPos[sk.index.Head];
  // laid on her hair's volume (hairSdf.ts): an egg round the head of hair, a little inside its fullest (it presses the hair)
  const c: V3 = [head[0], head[1] + 0.12, head[2] - 0.02];
  const R: V3 = [0.134, 0.152, 0.136];
  const pos: number[] = [], nrm: number[] = [], idx: number[] = [], cl: number[] = [];
  const NA = 48, NP = 18;
  // where the hat's edge comes down to: front, sides, back
  const edge = (az: number) => {
    const f = Math.cos(az);
    if (pattern === 'cap') return (f > 0 ? 62 : 74 - f * 4) * (Math.PI / 180);
    if (pattern === 'trapper') return (f > 0 ? 70 : 92) * (Math.PI / 180) + Math.max(0, Math.abs(Math.sin(az)) - 0.5) * 0.9;
    return (f > 0 ? 66 + (1 - f) * 14 : 86 - f * 8) * (Math.PI / 180);
  };
  const grid = (rOff: (az: number, pol: number) => number, polFrom: (az: number) => number, polTo: (az: number) => number, stuffV: number) => {
    const base = pos.length / 3;
    for (let i = 0; i <= NA; i++) {
      const az = (i / NA) * Math.PI * 2;
      for (let j = 0; j <= NP; j++) {
        const pol = polFrom(az) + (polTo(az) - polFrom(az)) * (j / NP);
        const d: V3 = [Math.sin(pol) * Math.sin(az), Math.cos(pol), Math.sin(pol) * Math.cos(az)];
        const k = 1 + rOff(az, pol);
        const p: V3 = [c[0] + R[0] * d[0] * k, c[1] + R[1] * d[1] * k, c[2] + R[2] * d[2] * k];
        pos.push(p[0], p[1], p[2]);
        const n = norm([(p[0] - c[0]) / (R[0] * R[0]), (p[1] - c[1]) / (R[1] * R[1]), (p[2] - c[2]) / (R[2] * R[2])]);
        nrm.push(n[0], n[1], n[2]);
        cl.push(pol, polTo(az) - pol, 18, stuffV);
      }
    }
    for (let i = 0; i < NA; i++) for (let j = 0; j < NP; j++) {
      const a = base + i * (NP + 1) + j, b = a + 1, c2 = a + NP + 1, d = c2 + 1;
      idx.push(a, b, c2, b, d, c2);
    }
  };
  const slouch = pattern === 'beanie' ? 0.06 : 0.02;
  grid((_az, pol) => 0.03 + slouch * Math.cos(pol) ** 4, () => 0, edge, 0);
  if (pattern === 'beanie') {
    // the turned-up band round the bottom
    grid(() => 0.075, (az) => edge(az) - 0.32, edge, 1);
  }
  if (pattern === 'cap') {
    // the brim: a curved plate out over the brow
    const base = pos.length / 3;
    for (let i = 0; i <= 16; i++) {
      const az = (-60 + (i / 16) * 120) * (Math.PI / 180);
      for (let j = 0; j <= 4; j++) {
        const pol = edge(az) + 0.02;
        const out = 1.03 + (j / 4) * 0.62 * Math.cos(az * 0.8);
        const d: V3 = [Math.sin(pol) * Math.sin(az), Math.cos(pol), Math.sin(pol) * Math.cos(az)];
        const p: V3 = [c[0] + R[0] * d[0] * out, c[1] + R[1] * d[1] * 1.03 - (j / 4) * 0.012, c[2] + R[2] * d[2] * out];
        pos.push(p[0], p[1], p[2]);
        nrm.push(0, 1, 0.15);
        cl.push(pol, 9, 18, 1);
      }
    }
    for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) {
      const a = base + i * 5 + j, b = a + 1, c2 = a + 5, d = c2 + 1;
      idx.push(a, c2, b, b, c2, d);
    }
  }
  if (pattern === 'trapper') {
    // the fur band round the face
    grid(() => 0.06, (az) => edge(az) - 0.2, edge, 1);
  }
  const positions = new Float32Array(pos);
  const w = skinWeights(sk, prims, positions);
  // a hat moves with the head alone
  const hi = sk.index.Head;
  for (let i = 0; i < positions.length / 3; i++) { w.skinIndex.set([hi, 0, 0, 0], i * 4); w.skinWeight.set([1, 0, 0, 0], i * 4); }
  return { positions, normals: new Float32Array(nrm), indices: new Uint32Array(idx), skinIndex: w.skinIndex, skinWeight: w.skinWeight, cloth: new Float32Array(cl) };
}

// --------------------------------------------------------------------------------------------- packs

function pack(sk: Skeleton, sc: Sculpt, prims: Prim[], pattern: Pattern): GarmentMesh {
  const big = pattern === 'pack_big';
  const P = prim(ellipsoid(frameAxes([0, big ? 1.08 : 1.11, big ? -0.19 : -0.165], [0, 1, 0], [0, 0, 1]), big ? 0.15 : 0.13, big ? 0.25 : 0.18, big ? 0.11 : 0.085, { bone: sk.index.spine_03, name: 'pack' }));
  // a rounded bag: the ellipsoid squared off (a round box's corners)
  const bag = compile(P, 0.05);
  const box: Field = (x, y, z) => {
    const b = bag(x, y, z);
    const yc = big ? 1.08 : 1.11, zc = big ? -0.19 : -0.165;
    const hx = big ? 0.15 : 0.13, hy = big ? 0.25 : 0.18, hz = big ? 0.1 : 0.08;
    const qx = Math.abs(x) - hx + 0.04, qy = Math.abs(y - yc) - hy + 0.05, qz = Math.abs(z - zc) - hz + 0.03;
    const rb = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - 0.035;
    return Math.max(rb, b - 0.03);
  };
  const raw = polygonize(box, { h: 0.006, min: [-0.2, 0.75, -0.34], max: [0.2, 1.4, -0.04], project: 2 });
  const dec = decimate(raw.positions, raw.indices, { target: 2500 });
  const positions: number[] = Array.from(dec.positions);
  const idx: number[] = Array.from(dec.indices);
  const cl: number[] = [];
  for (let i = 0; i < positions.length / 3; i++) cl.push(positions[i * 3 + 1], 9, 19, 0);
  // the shoulder straps: from the bag's top over each shoulder and down the front to its bottom corners
  const torso = compile(sc.torso, 0.05);
  const castOut = (x: number, y: number, zFrom: number, dir: number): V3 => {
    let z = zFrom;
    for (let i = 0; i < 60 && torso(x, y, z) < 0.004; i++) z += dir * 0.004;
    return [x, y, z];
  };
  for (const s of [1, -1]) {
    const path: V3[] = [];
    const sx = s * 0.075;
    for (let k = 0; k <= 16; k++) {
      const t = k / 16;
      // over the shoulder: up the back from the bag, across the top, down the front
      const ang = t * Math.PI;
      const y = 1.24 + Math.sin(ang) * 0.09 - (t > 0.5 ? (t - 0.5) * 0.24 : 0);
      const x = sx + s * 0.02 * Math.sin(ang);
      const z = -0.05 + Math.cos(ang) * -0.1;
      const p = castOut(x, y, z, Math.cos(ang) > 0 ? -1 : 1);
      path.push(t < 0.5 ? [p[0], p[1], Math.min(p[2], -0.06) - 0.004] : [p[0], p[1] + 0.003, p[2] + 0.006]);
    }
    const base = positions.length / 3;
    for (let k = 0; k < path.length; k++) {
      const p = path[k];
      for (const side of [-1, 1]) {
        positions.push(p[0] + side * 0.02, p[1], p[2]);
        cl.push(p[1], 9, 19, 1);
      }
    }
    for (let k = 0; k < path.length - 1; k++) {
      const a = base + k * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const pos = new Float32Array(positions);
  const normals = new Float32Array(pos.length);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const u = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]], v = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const i of [a, b, c]) { normals[i] += n[0]; normals[i + 1] += n[1]; normals[i + 2] += n[2]; }
  }
  for (let i = 0; i < normals.length; i += 3) { const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1; normals[i] /= l; normals[i + 1] /= l; normals[i + 2] /= l; }
  const w = skinWeights(sk, prims, pos);
  // the bag rides on the upper back
  for (let i = 0; i < pos.length / 3; i++) { w.skinIndex.set([sk.index.spine_03, sk.index.spine_02, 0, 0], i * 4); w.skinWeight.set([0.7, 0.3, 0, 0], i * 4); }
  void add; void roundCone; void scale3;
  return { positions: pos, normals, indices: new Uint32Array(idx), skinIndex: w.skinIndex, skinWeight: w.skinWeight, cloth: new Float32Array(cl) };
}
