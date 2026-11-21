/**
 * The toolkit's ground plants (docs/V3/nodes/P2-flora.md): the three families the fifty roads' ground is dressed
 * with (docs/V3/research/scenic-50.md §7) — grass in tufts, flowers, shrubs — each within its budget
 * (docs/V3/perf-budget.json `each`: a tuft 12 triangles, a flower 40, a shrub 800 near and 200 in the middle
 * distance). Drawn by the kit (kit.ts) as the trees are, and painted by the crowns' material.
 *
 *   tufts    meadow   a soft green tuft, knee-high blades arching over
 *            tussock  a big golden fountain of fine blades (the steppe's, the lupin basin's)
 *            needle   stiff straw-gold needles spiking up (the high plateau's needle grass)
 *            spinifex a low blue-grey dome of spines, wider than tall (the red outback's)
 *   flowers  poppy, golden poppy, tulip, daisy, lupin: a herb's stems and leaves as two crossed pictures, the
 *            flower heads as petals in the plant's second colour
 *   shrubs   round    a rounded bush of a few leafy masses on short stems
 *            heather  a low purple mat
 *            sage     an open silver-grey shrub, its twigs showing between small tufts
 *            lavender a grey-green dome bristling with purple spikes
 *            protea   stiff-leaved stems holding up a few big pink flower heads
 */
import type { Out } from '../crowns/grow';
import { mulberry } from '../vegetation';
import { T_FROND, T_HEATHER, T_HERB, T_NEEDLE, T_ROSETTE, T_ROUND, T_TUSSOCK, tileRect } from './atlas';
import { PART_BLOOM, TAU, TWIG, V3, smooth, writeBloom, writeFrond, type Clump, type Level, type Plan, type Tube } from './kit';
import { PART_SPRAY } from '../crowns/grow';
import * as THREE from 'three';

export type TuftKind = 'meadow' | 'tussock' | 'needle' | 'spinifex' | 'tall';
export type FlowerKind = 'poppy' | 'goldpoppy' | 'tulip' | 'daisy' | 'lupin';
export type ShrubKind = 'round' | 'heather' | 'sage' | 'lavender' | 'protea' | 'cushion' | 'saltbush';

/**
 * Standing cards round a foot: each a picture from a tile standing up from the ground, leaning out by `lean`
 * (rad), lit as the dome they make together (its normals from a point below the foot), the tops open, the feet
 * deep. 2 triangles a card.
 */
function writeStanding(out: Out, foot: V3, cards: number, h: number, w: number, lean: number, tile: number, random: () => number, turn = random() * TAU): void {
  const [u0, v0, u1, v1] = tileRect(tile);
  const below = new V3(foot.x, foot.y - h * 0.7, foot.z);
  const p = new V3();
  const n = new V3();
  const phase = random();
  for (let c = 0; c < cards; c++) {
    const a = turn + (c / cards) * Math.PI + (random() - 0.5) * 0.3;
    // a card faces across its turn; it leans out towards its face's side, so the tuft opens like a fountain
    const fx = Math.cos(a);
    const fz = Math.sin(a);
    const side = c % 2 === 0 ? 1 : -1;
    const lx = -fz * side * Math.sin(lean);
    const lz = fx * side * Math.sin(lean);
    const tone = random();
    const first = out.pos.length / 3;
    for (const [sx, sy] of [
      [-1, 0],
      [1, 0],
      [1, 1],
      [-1, 1],
    ]) {
      const up = sy * h;
      p.set(foot.x + fx * sx * w * 0.5 + lx * up, foot.y + up * Math.cos(lean) - 0.02, foot.z + fz * sx * w * 0.5 + lz * up);
      n.copy(p).sub(below).normalize();
      out.vertex(p.x, p.y, p.z, n.x, n.y, n.z, sx < 0 ? u0 : u1, sy === 0 ? v0 : v1, tone, phase, 0.35 + 0.6 * sy, Math.max(0, p.y - foot.y), PART_SPRAY);
    }
    out.idx.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
}

/** a spike of flowers (lavender's): two crossed quads in the plant's second colour, 4 triangles */
function writeSpike(out: Out, foot: V3, dir: V3, len: number, w: number, random: () => number): void {
  const d = dir.clone().normalize();
  const fade = random() * 0.9;
  const tone = random();
  const across = [new V3(1, 0, 0), new V3(0, 0, 1)];
  for (const x0 of across) {
    const x = x0.clone().sub(d.clone().multiplyScalar(x0.dot(d))).normalize();
    const n = new V3().crossVectors(x, d).normalize();
    if (n.y < 0) n.negate();
    n.add(new V3(0, 0.6, 0)).normalize();
    const first = out.pos.length / 3;
    for (const [sx, sy] of [
      [-1, 0],
      [1, 0],
      [1, 1],
      [-1, 1],
    ]) {
      // (a spike is narrow at its tip)
      const half = w * 0.5 * (sy ? 0.45 : 1);
      const px = foot.x + x.x * sx * half + d.x * len * sy;
      const py = foot.y + x.y * sx * half + d.y * len * sy;
      const pz = foot.z + x.z * sx * half + d.z * len * sy;
      out.vertex(px, py, pz, n.x, n.y, n.z, 0.5, 0.5, tone + 0.3 * sy, fade, 0.9, py, PART_BLOOM);
    }
    out.idx.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
}

const extraOnly = (extra: (out: Out, level: Level, random: () => number) => void, tris: number, crownY: number): Plan => ({
  tubes: [],
  clumps: [],
  tile: T_ROUND,
  spray: 1,
  cards: 0,
  rRef: 1,
  openAt: () => 0.8,
  crownY,
  extra,
  extraTris: () => tris,
  least: [0, 0],
});

// ---- tufts ----

const TUFTS: Record<TuftKind, { h: number; w: number; cards: number; lean: number; tile: number }> = {
  meadow: { h: 0.6, w: 0.6, cards: 3, lean: 0.12, tile: T_TUSSOCK },
  tussock: { h: 1.0, w: 1.2, cards: 4, lean: 0.18, tile: T_TUSSOCK },
  needle: { h: 0.85, w: 0.8, cards: 3, lean: 0.1, tile: T_NEEDLE },
  spinifex: { h: 0.6, w: 1.4, cards: 6, lean: 0.55, tile: T_NEEDLE },
  // (docs/V3/nodes/R5-ground.md: the savanna's elephant grass, head-high)
  tall: { h: 1.9, w: 1.0, cards: 6, lean: 0.14, tile: T_TUSSOCK },
};

export function planTuft(seed: number, kind: TuftKind): Plan {
  const random = mulberry(seed);
  const t = TUFTS[kind];
  const s = 0.8 + 0.4 * random();
  const turn = random() * TAU;
  return extraOnly((out, _level, rnd) => writeStanding(out, new V3(0, 0, 0), t.cards, t.h * s, t.w * s, t.lean, t.tile, rnd, turn), t.cards * 2, t.h * s * 0.5);
}

// ---- flowers ----

const FLOWERS: Record<FlowerKind, { h: number; heads: number; petals: number; cup: number; r: number; spike?: number }> = {
  // (the heads drawn larger than life, as a painter does: a flower of life size is a speck from the road)
  poppy: { h: 0.8, heads: 1, petals: 4, cup: 0.45, r: 0.14 },
  goldpoppy: { h: 0.5, heads: 1, petals: 4, cup: 0.6, r: 0.1 },
  tulip: { h: 0.6, heads: 1, petals: 6, cup: 0.95, r: 0.11 },
  daisy: { h: 0.65, heads: 2, petals: 8, cup: 0.05, r: 0.09 },
  lupin: { h: 1.1, heads: 5, petals: 3, cup: 0.7, r: 0.075, spike: 0.38 },
};

export function planFlower(seed: number, kind: FlowerKind): Plan {
  const random = mulberry(seed);
  const f = FLOWERS[kind];
  const s = 0.8 + 0.4 * random();
  const h = f.h * s;
  const turn = random() * TAU;
  const tris = 4 + f.heads * f.petals * 2;
  return extraOnly(
    (out, _level, rnd) => {
      writeStanding(out, new V3(0, 0, 0), 2, h * (f.spike ? 0.75 : 0.9), h * 0.5, 0.08, T_HERB, rnd, turn);
      for (let k = 0; k < f.heads; k++) {
        if (f.spike) {
          // a spike: whorls of small flowers up the top of the stem, smaller towards its tip
          const t = k / (f.heads - 1);
          const at = new V3(0, h * (1 - f.spike + f.spike * t), 0);
          writeBloom(out, at, new V3(Math.cos(turn + k * 2.4) * 0.6, 1, Math.sin(turn + k * 2.4) * 0.6), f.r * (1.2 - 0.6 * t) * s, f.petals, f.cup, rnd);
        } else {
          const a = turn + k * 2.4;
          const lean = f.heads > 1 ? 0.12 : 0.04;
          const at = new V3(Math.cos(a) * h * lean, h * (1 - 0.12 * k), Math.sin(a) * h * lean);
          // a head faces up and a little to the sun's side
          writeBloom(out, at, new V3(Math.cos(a) * 0.35, 1, Math.sin(a) * 0.35), f.r * s, f.petals, f.cup, rnd);
        }
      }
    },
    tris,
    h * 0.6,
  );
}

// ---- the rainforest's understory (docs/V3/nodes/R5-ground.md) ----

/**
 * A clump of the understory's great leaves (a heliconia's, a wild banana's, an elephant ear's): five to eight paddles
 * on their stalks out of one root, arching out and drooping at their tips, each a broad blade of the frond tile.
 */
export function planBigleaf(seed: number, height = 1.8): Plan {
  const random = mulberry(seed);
  const H = height * (0.8 + 0.4 * random());
  const n = 5 + Math.floor(random() * 4);
  const spec: { a: number; el: number; len: number }[] = [];
  for (let k = 0; k < n; k++) spec.push({ a: random() * TAU, el: 0.7 + 0.6 * random(), len: H * (0.8 + 0.35 * random()) });
  const head = new V3(0, 0.05, 0);
  const segsAt = [6, 3];
  const extra = (out: Out, level: Level, rnd: () => number): void => {
    for (const f of spec) {
      const d = new V3(Math.cos(f.a) * Math.cos(f.el), Math.sin(f.el), Math.sin(f.a) * Math.cos(f.el));
      const p1 = head.clone().addScaledVector(d, f.len * 0.55);
      const p2 = head.clone().addScaledVector(new V3(d.x, 0, d.z).normalize(), f.len * 0.75).add(new V3(0, f.len * (Math.sin(f.el) * 0.7 - 0.12), 0));
      const c = new THREE.QuadraticBezierCurve3(head.clone(), p1, p2);
      // (a bare stalk, then the blade: broad in its middle, round at its tip)
      writeFrond(out, c, (t) => (t < 0.35 ? 0.03 : f.len * 0.2 * Math.sin(Math.PI * Math.min(1, (t - 0.35) / 0.65))), segsAt[level], 0.15, T_FROND, new V3(0, H * 0.5, 0), 0.8, rnd);
    }
  };
  return extraOnly(extra, n * segsAt[0] * 2 + 8, H * 0.5);
}

// ---- shrubs ----

export function planShrub(seed: number, kind: ShrubKind): Plan {
  const random = mulberry(seed);
  const s = 0.85 + 0.3 * random();
  const dims: Record<ShrubKind, { h: number; w: number; clumps: number; tile: number; stems: number; sy: number; bare: boolean }> = {
    round: { h: 1.3, w: 0.8, clumps: 6, tile: T_ROUND, stems: 3, sy: 0.85, bare: false },
    heather: { h: 0.42, w: 0.6, clumps: 5, tile: T_HEATHER, stems: 0, sy: 0.5, bare: false },
    sage: { h: 1.0, w: 0.65, clumps: 8, tile: T_NEEDLE, stems: 6, sy: 0.8, bare: true },
    lavender: { h: 0.55, w: 0.5, clumps: 3, tile: T_NEEDLE, stems: 0, sy: 0.7, bare: false },
    protea: { h: 1.25, w: 0.6, clumps: 6, tile: T_ROSETTE, stems: 4, sy: 0.9, bare: false },
    // (docs/V3/nodes/R5-ground.md: the tundra's and the high country's tight cushions; the salt desert's grey saltbush)
    cushion: { h: 0.3, w: 0.7, clumps: 5, tile: T_HEATHER, stems: 0, sy: 0.42, bare: false },
    saltbush: { h: 0.8, w: 0.85, clumps: 7, tile: T_NEEDLE, stems: 4, sy: 0.72, bare: false },
  };
  const d = dims[kind];
  const H = d.h * s;
  const W = d.w * s;
  const tubes: Tube[] = [];
  const clumps: Clump[] = [];
  const centre = new V3(0, H * 0.5, 0);
  const openAt = (at: V3, n: V3): number => Math.min(1, Math.max(0, (0.25 + 0.75 * smooth(Math.hypot(at.x / W, (at.y - centre.y) / (H * 0.55), at.z / W), 0.3, 0.95)) * (0.55 + 0.45 * smooth(n.y, -0.6, 0.6))));
  const turn = random() * TAU;
  for (let i = 0; i < d.clumps; i++) {
    // the masses on a dome: one on top, the rest round its shoulders
    const a = turn + i * 2.39996;
    const top = i === 0;
    const ring = top ? 0 : W * (0.45 + 0.3 * random());
    const c = new V3(Math.cos(a) * ring, top ? H * 0.68 : H * (0.32 + 0.25 * random()), Math.sin(a) * ring);
    const r = (kind === 'sage' ? 0.36 : 0.5) * W * (0.8 + 0.4 * random());
    clumps.push({ c, r, sy: d.sy, stretch: 1, along: null, shelf: kind === 'heather' ? 0.5 : 0.1, curtain: 0, out: new V3(Math.cos(a), 0, Math.sin(a)), open: 0, bare: d.bare && !top });
    if (i < d.stems) {
      const foot = new V3(Math.cos(a) * W * 0.08, -0.1, Math.sin(a) * W * 0.08);
      tubes.push({ curve: new THREE.CatmullRomCurve3([foot, foot.clone().lerp(c, 0.5).add(new V3(0, H * 0.05, 0)), c.clone()]), r0: H * 0.03, r1: H * 0.012, cls: TWIG });
    }
  }
  const blooms: { at: V3; dir: V3 }[] = [];
  if (kind === 'lavender') {
    for (let k = 0; k < 22; k++) {
      const a = random() * TAU;
      const r = Math.sqrt(random()) * W * 0.85;
      blooms.push({ at: new V3(Math.cos(a) * r, H * (0.55 + 0.35 * (1 - r / W)), Math.sin(a) * r), dir: new V3(Math.cos(a) * r * 0.6, H, Math.sin(a) * r * 0.6) });
    }
  } else if (kind === 'protea') {
    for (let k = 0; k < 4; k++) {
      const c = clumps[k].c;
      blooms.push({ at: c.clone().add(new V3(0, clumps[k].r * 0.6, 0)), dir: new V3(c.x * 0.5, 1, c.z * 0.5) });
    }
  }
  const bloomTris = kind === 'lavender' ? blooms.length * 4 : blooms.length * 12 * 2;
  const extra =
    blooms.length > 0
      ? (out: Out, level: Level, rnd: () => number): void => {
          if (level > 0) return;
          for (const b of blooms) {
            if (kind === 'lavender') writeSpike(out, b.at, b.dir, H * 0.38, 0.045 * s, rnd);
            else writeBloom(out, b.at, b.dir, 0.17 * s, 12, 0.75, rnd);
          }
        }
      : undefined;
  return {
    tubes,
    clumps,
    tile: d.tile,
    spray: W * (kind === 'heather' ? 0.55 : 0.42),
    cards: kind === 'sage' ? 22 : 30,
    rRef: W * 0.5,
    openAt,
    crownY: H * 0.5,
    extra,
    extraTris: (level) => (level === 0 ? bloomTris : 0),
    least: [5, 2],
  };
}
