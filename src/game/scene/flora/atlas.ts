/**
 * The foliage pictures of the plant toolkit (docs/V3/nodes/P2-flora.md): one atlas, a tile per kind of foliage,
 * painted as a background painter dabs foliage in (after Painted Valley, src/valley/trees.js leafTexture):
 * rounded strokes, never points (after the paint finish a point turns into a square: render/textures.ts), a
 * lighter tone where the light comes from. Red is how light a mark is painted (the crowns' material reads it as
 * the leaf's tone), green is where there is foliage at all.
 *
 *   0 spruce    a branchlet: a twig with its shoots hanging from it like a comb (the spruce's curtain)
 *   1 oak       lobed leaves with rounded lobes, fanned from short twigs
 *   2 birch     small leaves on fine hanging threads
 *   3 fern      a frond: paired pinnae along an arching stalk
 *   4 pine      long needles fanned up and out from the twigs' ends like brushes
 *   5 cherry    blossoms in clusters, five round petals about a dark eye, on short dark twigs
 *   6 cypress   sprigs of scale leaves rising from the foot like candle flames
 *   7 acacia    a flat feathery spray: rachises lined with rows of tiny leaflets
 *   8 round     plain rounded leaves fanned out (a shrub's, a baobab's, most broad-leaved things)
 *   9 bamboo    fans of narrow drooping leaves at the ends of fine twigs
 *  10 frond     a palm's frond: its rachis up the middle of the tile, leaflets on both sides leaning to its tip
 *  11 rosette   tufts of stiff sword leaves packed side by side (a dragon tree's crown, a yucca's)
 *  12 tussock   a fountain of fine blades arching over from the foot
 *  13 needle    stiff straight needles spiking up and out from the foot (needle grass, spinifex)
 *  14 heather   a mat of short shoots speckled along their tops with tiny bells
 *  15 herb      a herb's stems with narrow leaves along them (its flower is made apart)
 *
 * The atlas is painted once, in the browser (it needs a canvas); what the trees take from it (a tile's corner)
 * is DOM-free.
 */
import * as THREE from 'three';
import { maskCover } from '../crowns/crownAtlas';
import { mulberry } from '../vegetation';

/** the atlas is TILES × TILES */
export const FLORA_TILES = 4;
/** its side (px): what the crowns' material reads its coverage's blur by (render/materials.ts rtLeafCover) */
export const FLORA_ATLAS_PX = 2048;

export const T_SPRUCE = 0;
export const T_OAK = 1;
export const T_BIRCH = 2;
export const T_FERN = 3;
export const T_PINE = 4;
export const T_CHERRY = 5;
export const T_CYPRESS = 6;
export const T_ACACIA = 7;
export const T_ROUND = 8;
export const T_BAMBOO = 9;
export const T_FROND = 10;
export const T_ROSETTE = 11;
export const T_TUSSOCK = 12;
export const T_NEEDLE = 13;
export const T_HEATHER = 14;
export const T_HERB = 15;

/** a tile's corner in the atlas (uv; v runs up) */
export function tileOrigin(tile: number): [number, number] {
  return [(tile % FLORA_TILES) / FLORA_TILES, Math.floor(tile / FLORA_TILES) / FLORA_TILES];
}

/** a tile's uv rectangle, its edge left out by a hair so that its neighbour's marks never bleed in */
export function tileRect(tile: number): [number, number, number, number] {
  const [u, v] = tileOrigin(tile);
  const span = 1 / FLORA_TILES;
  return [u + span * 0.01, v + span * 0.01, u + span * 0.99, v + span * 0.99];
}

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const clampRed = (red: number): number => Math.round(Math.min(255, Math.max(40, red)));

/** a rounded stroke (a capsule) from (x0, y0) to (x1, y1), w wide, painted at a red tone */
function stroke(g: G, x0: number, y0: number, x1: number, y1: number, w: number, red: number): void {
  g.strokeStyle = `rgb(${clampRed(red)},255,0)`;
  g.lineCap = 'round';
  g.lineWidth = Math.max(1, w);
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
}

/** a filled ellipse, painted at a red tone */
function dab(g: G, x: number, y: number, rx: number, ry: number, turn: number, red: number): void {
  g.fillStyle = `rgb(${clampRed(red)},255,0)`;
  g.beginPath();
  g.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), turn, 0, TAU);
  g.fill();
}

/** a stroke along a path of points, tapering from w0 to w1, its tone running from red0 to red1 */
function trail(g: G, pts: readonly [number, number][], w0: number, w1: number, red0: number, red1: number): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    const t = i / Math.max(1, pts.length - 2);
    stroke(g, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w0 + (w1 - w0) * t, red0 + (red1 - red0) * t);
  }
}

// ---- the first round's five (docs/V3/nodes/M5-samples.md) ----

function spruce(g: G, s: number, rnd: () => number): void {
  const y0 = s * 0.3;
  for (let k = 0; k < 15; k++) {
    const u = 0.08 + (k / 14) * 0.84;
    const x = u * s;
    const y = y0 + Math.sin(u * Math.PI) * -s * 0.05 + (rnd() - 0.5) * s * 0.02;
    const len = s * (0.36 + 0.3 * Math.sin(u * Math.PI)) * (0.75 + 0.35 * rnd());
    const lean = (u - 0.5) * 0.5 + (rnd() - 0.5) * 0.25;
    const steps = 7;
    for (let j = 0; j < steps; j++) {
      const t0 = j / steps;
      const t1 = (j + 1) / steps;
      const w = s * 0.075 * (1 - 0.55 * t0) * (0.85 + 0.3 * rnd());
      stroke(g, x + Math.sin(lean) * len * t0, y + Math.cos(lean) * len * t0, x + Math.sin(lean) * len * t1, y + Math.cos(lean) * len * t1, w, 205 - 90 * t0 + 40 * (rnd() - 0.5));
    }
    stroke(g, x + Math.sin(lean) * len * 0.86, y + Math.cos(lean) * len * 0.86, x + Math.sin(lean) * len, y + Math.cos(lean) * len, s * 0.04, 235);
  }
  for (let k = 0; k < 22; k++) {
    const u = 0.04 + (k / 21) * 0.92;
    const x = u * s;
    const y = y0 + Math.sin(u * Math.PI) * -s * 0.05;
    stroke(g, x - s * 0.03, y - s * 0.012, x + s * 0.03, y + s * 0.01, s * 0.07, 225 + 25 * rnd());
  }
}

function oakLeaf(g: G, x: number, y: number, a: number, len: number, red: number, rnd: () => number): void {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.fillStyle = `rgb(${clampRed(red)},255,0)`;
  const lobes = 4;
  g.beginPath();
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < lobes; i++) {
      const t = (i + 0.6) / (lobes + 0.4);
      const w = len * (0.16 + 0.2 * Math.sin(Math.PI * Math.min(1, t * 1.15))) * (0.85 + 0.25 * rnd());
      g.moveTo(t * len + len * 0.13, side * w * 0.55);
      g.ellipse(t * len, side * w * 0.55, len * 0.13, w * 0.62, 0, 0, TAU);
    }
  }
  g.fill();
  g.beginPath();
  g.ellipse(len * 0.5, 0, len * 0.5, len * 0.14, 0, 0, TAU);
  g.moveTo(len * 1.04, 0);
  g.ellipse(len * 0.94, 0, len * 0.1, len * 0.09, 0, 0, TAU);
  g.fill();
  g.restore();
}

function oak(g: G, s: number, rnd: () => number): void {
  const cx = s * 0.5;
  const cy = s * 0.5;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + (rnd() - 0.5) * 0.5;
    const d = s * (0.04 + 0.12 * rnd());
    const len = s * (0.26 + 0.12 * rnd());
    const red = 150 + 80 * (0.5 - 0.5 * Math.sin(a)) + 25 * (rnd() - 0.5);
    oakLeaf(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, a, len, red, rnd);
  }
  for (let i = 0; i < 5; i++) oakLeaf(g, cx + (rnd() - 0.5) * s * 0.12, cy + (rnd() - 0.5) * s * 0.12, rnd() * TAU, s * 0.2, 230, rnd);
}

function birch(g: G, s: number, rnd: () => number): void {
  for (let k = 0; k < 9; k++) {
    const x0 = s * (0.12 + 0.76 * (k / 8)) + (rnd() - 0.5) * s * 0.05;
    const y0 = s * (0.08 + 0.1 * rnd());
    const len = s * (0.6 + 0.3 * rnd());
    const sway = (rnd() - 0.5) * s * 0.12;
    const n = 9 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const side = i % 2 === 0 ? -1 : 1;
      const r = s * (0.028 + 0.02 * (1 - t)) * (0.8 + 0.4 * rnd());
      dab(g, x0 + sway * t * t + side * r * 0.9, y0 + len * t, r, r * 0.72, side * 0.6, 160 + 80 * rnd() - 50 * t);
    }
  }
}

function fern(g: G, s: number, rnd: () => number): void {
  const n = 16;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = s * (0.5 + 0.08 * Math.sin(t * 2.2));
    const y = s * (0.95 - 0.88 * t);
    const len = s * 0.36 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.95)) * (0.9 + 0.2 * rnd());
    for (const side of [-1, 1]) {
      const a = side * (1.1 - 0.4 * t);
      for (let j = 0; j < 5; j++) {
        const u0 = j / 5;
        const u1 = (j + 1) / 5;
        stroke(g, x + Math.sin(a) * len * u0, y - Math.cos(a) * len * u0 * 0.35, x + Math.sin(a) * len * u1, y - Math.cos(a) * len * u1 * 0.35, s * 0.05 * (1 - 0.6 * u0), 150 + 90 * (1 - u0) * (0.6 + 0.4 * rnd()));
      }
    }
  }
}

function pine(g: G, s: number, rnd: () => number): void {
  const bunches: [number, number, number][] = [
    [0.5, 0.62, 1],
    [0.25, 0.52, 0.72],
    [0.75, 0.5, 0.76],
    [0.48, 0.33, 0.64],
  ];
  for (const [cx, cy, k] of bunches) {
    const x0 = cx * s;
    const y0 = cy * s;
    const n = Math.round(30 * k);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (rnd() - 0.5) * Math.PI * 1.5;
      const len = s * (0.2 + 0.1 * rnd()) * k;
      const shade = Math.max(0, Math.sin(a));
      for (let j = 0; j < 3; j++) {
        const t0 = j / 3;
        const t1 = (j + 1) / 3;
        stroke(g, x0 + Math.cos(a) * len * t0, y0 + Math.sin(a) * len * t0 + s * 0.03 * t0 * t0, x0 + Math.cos(a) * len * t1, y0 + Math.sin(a) * len * t1 + s * 0.03 * t1 * t1, s * 0.026 * (1 - 0.45 * t0), 130 + 100 * t1 * (0.6 + 0.4 * rnd()) - 45 * shade);
      }
    }
    stroke(g, x0, y0 + s * 0.05, x0, y0 - s * 0.01, s * 0.04, 90);
  }
}

// ---- the toolkit's new eleven ----

/** cherry blossom: clusters of five-petalled flowers on a few short dark twigs; few leaves yet */
function cherry(g: G, s: number, rnd: () => number): void {
  const twigs: [number, number, number, number][] = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + (rnd() - 0.5) * 0.6;
    const x0 = s * 0.5 + Math.cos(a) * s * 0.06;
    const y0 = s * 0.5 + Math.sin(a) * s * 0.06;
    const x1 = s * 0.5 + Math.cos(a) * s * (0.32 + 0.08 * rnd());
    const y1 = s * 0.5 + Math.sin(a) * s * (0.32 + 0.08 * rnd());
    twigs.push([x0, y0, x1, y1]);
    stroke(g, x0, y0, x1, y1, s * 0.012, 55);
  }
  for (let i = 0; i < 78; i++) {
    const [x0, y0, x1, y1] = twigs[i % twigs.length];
    const t = 0.15 + 0.9 * rnd();
    const x = x0 + (x1 - x0) * t + (rnd() - 0.5) * s * 0.12;
    const y = y0 + (y1 - y0) * t + (rnd() - 0.5) * s * 0.12;
    const rb = s * (0.03 + 0.014 * rnd());
    const rot = rnd() * TAU;
    // (the blossoms on the cluster's top catch the light)
    const lit = 0.5 - (y / s - 0.5) * 0.9;
    for (let k = 0; k < 5; k++) {
      const a = rot + (k / 5) * TAU;
      dab(g, x + Math.cos(a) * rb * 0.55, y + Math.sin(a) * rb * 0.55, rb * 0.5, rb * 0.4, a, 175 + 60 * lit + 30 * (rnd() - 0.5));
    }
    dab(g, x, y, rb * 0.24, rb * 0.24, 0, 105);
  }
}

/** cypress: sprigs of scale leaves rising from the foot, forking, lighter at their tips: a candle's flame */
function cypress(g: G, s: number, rnd: () => number): void {
  for (let i = 0; i < 30; i++) {
    const x0 = s * (0.5 + (rnd() - 0.5) * 0.62);
    const y0 = s * (0.96 - 0.08 * rnd());
    const len = s * (0.5 + 0.38 * rnd()) * (1 - Math.abs(x0 / s - 0.5) * 0.9);
    // each leans in towards the flame's middle, more at its top
    const lean = (0.5 - x0 / s) * 0.9;
    const pts: [number, number][] = [];
    for (let j = 0; j <= 8; j++) {
      const t = j / 8;
      pts.push([x0 + lean * len * t * t + Math.sin(t * 5 + i) * s * 0.008, y0 - len * t]);
    }
    trail(g, pts, s * 0.038, s * 0.016, 105, 225 + 25 * rnd());
    // a side sprig or two
    for (let k = 0; k < 2; k++) {
      const t = 0.3 + 0.45 * rnd();
      const [bx, by] = pts[Math.round(t * 8)];
      const side = rnd() < 0.5 ? -1 : 1;
      const l = len * (0.18 + 0.12 * rnd());
      trail(g, [[bx, by], [bx + side * l * 0.45, by - l * 0.6], [bx + side * l * 0.55, by - l]], s * 0.026, s * 0.014, 140, 230);
    }
  }
}

/** acacia: a flat feathery spray, rachises fanned from the twig's end, each lined with rows of tiny leaflets */
function acacia(g: G, s: number, rnd: () => number): void {
  const cx = s * 0.5;
  const cy = s * 0.52;
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU + (rnd() - 0.5) * 0.5;
    const len = s * (0.3 + 0.12 * rnd());
    stroke(g, cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len, s * 0.008, 80);
    for (let p = 1; p <= 6; p++) {
      const t = p / 6.5;
      const px = cx + Math.cos(a) * len * t;
      const py = cy + Math.sin(a) * len * t;
      const pl = s * 0.085 * (1 - 0.35 * t);
      for (const side of [-1, 1]) {
        const b = a + side * 1.25;
        for (let q = 1; q <= 6; q++) {
          const u = q / 6.5;
          const lx = px + Math.cos(b) * pl * u;
          const ly = py + Math.sin(b) * pl * u;
          const lit = 0.5 - Math.sin(b) * 0.5;
          dab(g, lx, ly, s * 0.017, s * 0.011, b, 150 + 80 * lit + 30 * (rnd() - 0.5));
        }
      }
    }
  }
}

/** plain rounded leaves fanned out: the toolkit's everyday broad leaf */
function round(g: G, s: number, rnd: () => number): void {
  for (let i = 0; i < 64; i++) {
    const a = rnd() * TAU;
    const d = Math.sqrt(rnd()) * s * 0.4;
    const r = s * (0.045 + 0.04 * rnd()) * (1.15 - 0.45 * (d / (s * 0.4)));
    const x = s * 0.5 + Math.cos(a) * d;
    const y = s * 0.5 + Math.sin(a) * d;
    const lit = 0.5 - (y / s - 0.5) * 0.8;
    dab(g, x, y, r, r * (0.6 + 0.25 * rnd()), a + (rnd() - 0.5) * 1.2, 130 + 95 * lit + 40 * (rnd() - 0.5));
  }
}

/** bamboo: fans of narrow drooping leaves at the ends of fine twigs */
function bamboo(g: G, s: number, rnd: () => number): void {
  for (let f = 0; f < 8; f++) {
    const x0 = s * (0.15 + 0.7 * rnd());
    const y0 = s * (0.1 + 0.35 * rnd());
    const a0 = Math.PI * (0.25 + 0.5 * rnd());
    const tl = s * (0.12 + 0.1 * rnd());
    const x1 = x0 + Math.cos(a0) * tl;
    const y1 = y0 + Math.sin(a0) * tl;
    stroke(g, x0, y0, x1, y1, s * 0.008, 70);
    const n = 5 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / (n - 1) - 0.5) * 1.9;
      const len = s * (0.2 + 0.09 * rnd());
      const pts: [number, number][] = [];
      for (let j = 0; j <= 6; j++) {
        const t = j / 6;
        // (each leaf droops under its own weight)
        pts.push([x1 + Math.cos(a) * len * t, y1 + Math.sin(a) * len * t + s * 0.06 * t * t]);
      }
      const lit = 0.5 - Math.sin(a) * 0.4;
      for (let j = 0; j + 1 < pts.length; j++) {
        const t = j / (pts.length - 2);
        stroke(g, pts[j][0], pts[j][1], pts[j + 1][0], pts[j + 1][1], s * 0.034 * Math.sin(Math.PI * Math.min(0.95, 0.12 + t * 0.88)) + s * 0.004, 140 + 90 * lit + 30 * t);
      }
    }
  }
}

/** a palm's frond: the rachis up the tile's middle, the leaflets on both sides leaning towards its tip */
function frond(g: G, s: number, rnd: () => number): void {
  const n = 30;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = s * 0.5 + Math.sin(t * 2.1) * s * 0.012;
    const y = s * (0.985 - 0.97 * t);
    const len = s * 0.47 * Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.92)) * (0.9 + 0.15 * rnd());
    for (const side of [-1, 1]) {
      // a leaflet goes out and forward (to the tile's top), drooping a little at its end
      const a = side * (0.95 - 0.35 * t);
      const pts: [number, number][] = [];
      for (let j = 0; j <= 5; j++) {
        const u = j / 5;
        pts.push([x + Math.sin(a) * len * u, y - Math.cos(a) * len * u * 0.55 + s * 0.035 * u * u]);
      }
      trail(g, pts, s * 0.03, s * 0.012, 120, 215 + 30 * rnd());
    }
  }
  stroke(g, s * 0.5, s * 0.99, s * 0.5, s * 0.02, s * 0.016, 70);
}

/** a dragon tree's crown, a yucca's: tufts of stiff sword leaves, each fanning up from its own foot */
function rosette(g: G, s: number, rnd: () => number): void {
  for (let k = 0; k < 16; k++) {
    const a0 = rnd() * TAU;
    const d = Math.sqrt(rnd()) * s * 0.3;
    const cx = s * 0.5 + Math.cos(a0) * d;
    const cy = s * 0.58 + Math.sin(a0) * d * 0.7;
    for (let i = 0; i < 12; i++) {
      const a = -Math.PI / 2 + (i / 11 - 0.5) * 2.5 + (rnd() - 0.5) * 0.15;
      const len = s * (0.11 + 0.06 * rnd()) * (1 - 0.3 * Math.abs(i / 11 - 0.5));
      trail(g, [[cx, cy], [cx + Math.cos(a) * len * 0.5, cy + Math.sin(a) * len * 0.5], [cx + Math.cos(a) * len, cy + Math.sin(a) * len + len * 0.08]], s * 0.024, s * 0.012, 100, 210 + 40 * rnd());
    }
  }
}

/** a tussock: a fountain of fine blades from the foot, arching over, lit along the arch's top */
function tussock(g: G, s: number, rnd: () => number): void {
  for (let i = 0; i < 110; i++) {
    const a = -Math.PI / 2 + (rnd() - 0.5) * 2.2;
    const len = s * (0.45 + 0.45 * rnd());
    const x0 = s * (0.5 + (rnd() - 0.5) * 0.14);
    const y0 = s * 0.98;
    const pts: [number, number][] = [];
    for (let j = 0; j <= 8; j++) {
      const t = j / 8;
      // up, then over: the blade's own weight bends its outer half down
      const out = Math.cos(a) * len * t * (0.6 + 0.6 * t);
      const up = Math.sin(a) * len * t + len * 0.55 * t * t * Math.abs(Math.cos(a));
      pts.push([x0 + out, y0 + up]);
    }
    trail(g, pts, s * 0.014, s * 0.006, 90, 200 + 45 * rnd());
  }
}

/** needle grass, spinifex: stiff straight needles spiking up and out from the foot, light at their tips */
function needle(g: G, s: number, rnd: () => number): void {
  for (let i = 0; i < 130; i++) {
    const a = -Math.PI / 2 + (rnd() - 0.5) * 2.7;
    const len = s * (0.32 + 0.3 * rnd()) * (1 - 0.25 * Math.abs(Math.cos(a)));
    const x0 = s * (0.5 + (rnd() - 0.5) * 0.12);
    const y0 = s * 0.97;
    trail(g, [[x0, y0], [x0 + Math.cos(a) * len * 0.5, y0 + Math.sin(a) * len * 0.5], [x0 + Math.cos(a) * len, y0 + Math.sin(a) * len]], s * 0.011, s * 0.006, 95, 215 + 40 * rnd());
  }
}

/** heather: a mat of short shoots speckled along their tops with tiny bells */
function heather(g: G, s: number, rnd: () => number): void {
  for (let i = 0; i < 46; i++) {
    const x0 = s * (0.06 + 0.88 * rnd());
    const y0 = s * (0.82 + 0.16 * rnd());
    const len = s * (0.3 + 0.25 * rnd()) * (1 - 0.6 * Math.abs(x0 / s - 0.5));
    const lean = (rnd() - 0.5) * 0.5;
    const x1 = x0 + Math.sin(lean) * len;
    const y1 = y0 - Math.cos(lean) * len;
    stroke(g, x0, y0, x1, y1, s * 0.013, 80);
    for (let k = 0; k < 9; k++) {
      const t = 0.45 + 0.55 * (k / 8);
      const side = k % 2 === 0 ? -1 : 1;
      dab(g, x0 + (x1 - x0) * t + side * s * 0.012, y0 + (y1 - y0) * t, s * 0.013, s * 0.011, 0, 170 + 70 * t + 20 * (rnd() - 0.5));
    }
  }
}

/** a herb: a few stems from the foot with narrow leaves along them, a rosette of leaves at the foot */
function herb(g: G, s: number, rnd: () => number): void {
  for (let k = 0; k < 3; k++) {
    const x0 = s * (0.5 + (k - 1) * 0.1 + (rnd() - 0.5) * 0.05);
    const top = s * (0.06 + 0.2 * rnd());
    const bend = (rnd() - 0.5) * s * 0.1;
    const at = (t: number): [number, number] => [x0 + bend * t * t, s * 0.98 - (s * 0.98 - top) * t];
    const pts: [number, number][] = [];
    for (let j = 0; j <= 6; j++) pts.push(at(j / 6));
    trail(g, pts, s * 0.016, s * 0.01, 110, 150);
    for (let l = 0; l < 4; l++) {
      const t = 0.25 + 0.17 * l;
      const [x, y] = at(t);
      const side = l % 2 === 0 ? -1 : 1;
      const len = s * (0.13 + 0.07 * rnd()) * (1 - 0.4 * t);
      trail(g, [[x, y], [x + side * len * 0.6, y - len * 0.45], [x + side * len, y - len * 0.65]], s * 0.034, s * 0.012, 140, 210);
    }
  }
  for (let l = 0; l < 6; l++) {
    const a = -Math.PI / 2 + (l / 5 - 0.5) * 2.6;
    const len = s * (0.16 + 0.06 * rnd());
    const x0 = s * 0.5;
    const y0 = s * 0.97;
    trail(g, [[x0, y0], [x0 + Math.cos(a) * len * 0.5, y0 + Math.sin(a) * len * 0.5], [x0 + Math.cos(a) * len, y0 + Math.sin(a) * len + len * 0.1]], s * 0.05, s * 0.016, 120, 200);
  }
}

const PAINTERS = [spruce, oak, birch, fern, pine, cherry, cypress, acacia, round, bamboo, frond, rosette, tussock, needle, heather, herb];

let atlas: THREE.Texture | null = null;

/** the toolkit's foliage atlas (painted once) */
export function floraAtlas(): THREE.Texture {
  if (atlas) return atlas;
  const size = FLORA_ATLAS_PX;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  const s = size / FLORA_TILES;
  PAINTERS.forEach((paint, tile) => {
    const [u, v] = tileOrigin(tile);
    g.save();
    // (a tile's v runs up the texture: canvas rows run down)
    g.translate(u * size, size - (v + 1 / FLORA_TILES) * size);
    g.beginPath();
    g.rect(0, 0, s, s);
    g.clip();
    paint(g, s, mulberry(101 + tile * 977));
    g.restore();
  });
  const t = new THREE.CanvasTexture(canvas);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 8;
  // (the clumps' cores read the pictures round about them as a shell: the atlas repeats for them)
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  atlas = t;
  return t;
}

let cover: Uint8Array | null = null;
/** the coverage mask's side (texels over the whole atlas) */
const COVER_PX = 512;

/**
 * Whether there is foliage at a point of the atlas (uv), as the far pictures' bake asks it of every spray
 * (scene/crowns/crownAtlas.ts): a coarse mask of the atlas, a texel kept where any of the finer ones under it has
 * foliage (the mip filter keeps a mark far off as the bake must).
 */
export function floraCover(): (u: number, v: number) => boolean {
  const m = floraCoverMask();
  return maskCover(m.mask, m.px);
}

/** the mask floraCover reads, itself: what the far pictures' worker is given (scene/crowns/crownBake.ts) */
export function floraCoverMask(): { mask: Uint8Array; px: number } {
  if (!cover) {
    const t = floraAtlas();
    const canvas = t.image as HTMLCanvasElement;
    const g = canvas.getContext('2d')!;
    const px = g.getImageData(0, 0, canvas.width, canvas.height).data;
    const step = canvas.width / COVER_PX;
    const mask = new Uint8Array(COVER_PX * COVER_PX);
    for (let y = 0; y < COVER_PX; y++) {
      for (let x = 0; x < COVER_PX; x++) {
        let on = 0;
        for (let j = 0; j < step && !on; j++) for (let i = 0; i < step && !on; i++) if (px[((y * step + j) * canvas.width + (x * step + i)) * 4 + 1] > 127) on = 1;
        // (the canvas's rows run down, a texture's v up)
        mask[(COVER_PX - 1 - y) * COVER_PX + x] = on;
      }
    }
    cover = mask;
  }
  return { mask: cover, px: COVER_PX };
}

/** the atlas as a picture (for the sample report): a data URL */
export function floraAtlasPicture(): string {
  const t = floraAtlas();
  return (t.image as HTMLCanvasElement).toDataURL('image/png');
}
