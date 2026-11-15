/**
 * Draws the places by the road (core/world/sites.ts) — one merged, flat-painted mesh per site.
 *
 * Everything is built from the description alone, so what is drawn is what is collided with:
 * each `SiteObject` is drawn in its own frame (x along its long axis, y up from the level it
 * stands on, z across, the front at −z). The look is the hand-painted one of specs/art/STYLE.md:
 * few colours, each surface broken into boards or sheets a shade apart, rust and moss laid on as
 * patches, grass coming up along every wall. Nothing here is new and nothing is square any more.
 */
import * as THREE from 'three';
import { Rng, hash2 } from '../../core/math/rng';
import { SIGN, shelfBoards, type Site, type SiteObject } from '../../core/world/sites';
import { PaintBuilder, type Paint } from './paintBuilder';
import type { Slices } from './worldBuild';

// ---------------------------------------------------------------------------------------------- paints

const CONCRETE = 0xb8b3a5;
const CONCRETE_D = 0x9c978b;
const STEEL = 0x77818a;
const STEEL_D = 0x59626a;
const RUST = 0x9d6540;
const RUST_D = 0x7a4a30;
const WOOD = 0x9a7b55;
const WOOD_D = 0x7a5f42;
const WOOD_L = 0xb89a70;
const TYRE = 0x2e2f33;
const GLASS = 0x9fb4b8;
const DARK = 0x30353a;
const WHITE = 0xece8dc;
const GRASS = 0x7da04f;
const GRASS_D = 0x5f8743;
const MOSS = 0x86a070;
const SOIL = 0x6b5a45;
const FLOOR = 0x8f8674;
const STONE = 0x8d8a82;
const CLOTHS = [0xd98a7a, 0xe6d9a8, 0x8fb7c4, 0xf2efe6, 0xb5a3c4];
const CAR_PAINTS = [0xb85c48, 0x5f9a94, 0xe0d7b8, 0xd9a23c, 0x6f87a8, 0x9fae8c];

interface Coat {
  wall: number;
  wall2: number;
  trim: number;
  roof: number;
  roof2: number;
  door: number;
  accent: number;
  /** width of a board or a sheet of the wall (m) */
  board: number;
}

/** how a building is painted: plaster, boards, sheet — each with the roof and the door that go with it */
const COATS: readonly Coat[] = [
  { wall: 0xe3d8bd, wall2: 0xd6c9aa, trim: 0xf2ecdc, roof: 0xa9553f, roof2: 0x934a37, door: 0x4f8a86, accent: 0xc9623f, board: 1.6 },
  { wall: 0x9dbdb3, wall2: 0x8eaea5, trim: 0xeef0e4, roof: 0x5f6f7c, roof2: 0x54636f, door: 0xb5563c, accent: 0xe0a23c, board: 0.42 },
  { wall: 0xb8604c, wall2: 0xa75544, trim: 0xe9e2d0, roof: 0x9aa1a0, roof2: 0x878f8f, door: 0xd9cdae, accent: 0x4f7f8a, board: 0.5 },
  { wall: 0xd9b469, wall2: 0xc9a45c, trim: 0xf0e8d2, roof: 0x6d8463, roof2: 0x5f7657, door: 0x5a6f8a, accent: 0xb5503c, board: 1.4 },
  { wall: 0xa98c68, wall2: 0x977b5a, trim: 0xc9b48e, roof: 0x8d9494, roof2: 0x7d8585, door: 0x7a6248, accent: 0x9b4a3a, board: 0.34 },
  { wall: 0xc9503c, wall2: 0xb84a38, trim: 0xf2efe6, roof: 0x4a4f55, roof2: 0x40454b, door: 0xe6dcc0, accent: 0xe0a23c, board: 0.3 },
];

const tmpC = new THREE.Color();
/** a paint a shade lighter or darker (k = ±0.1 is a board's difference) */
function shade(hex: number, k: number): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(1 + k);
}
/** between two paints */
function blend(a: number, b: number, t: number): THREE.Color {
  return new THREE.Color(a).lerp(tmpC.set(b), t);
}

// ---------------------------------------------------------------------------------------------- small helpers

/** grass coming up: a few blades in a clump */
function tuft(b: PaintBuilder, r: Rng, x: number, z: number, y = 0, s = 1): void {
  const n = 2 + r.int(3);
  for (let i = 0; i < n; i++) {
    const h = (0.28 + 0.4 * r.next()) * s;
    b.cyl(x + (r.next() - 0.5) * 0.3 * s, y + h / 2, z + (r.next() - 0.5) * 0.3 * s, 0.06 * s, h, r.next() < 0.5 ? GRASS : GRASS_D, { segments: 4, radiusTop: 0.008, rx: (r.next() - 0.5) * 0.5, rz: (r.next() - 0.5) * 0.5 });
  }
}

/** a wheel lying on its axle along z */
function wheel(b: PaintBuilder, x: number, y: number, z: number, rad: number, wide: number, hub = STEEL_D): void {
  b.cyl(x, y, z, rad, wide, TYRE, { segments: 10, rx: Math.PI / 2 });
  b.cyl(x, y, z, rad * 0.52, wide + 0.03, hub, { segments: 8, rx: Math.PI / 2 });
}

interface Opening {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * A wall running along x from x0 to x1, centred on z = 0, made of boards (or sheets, or panels of
 * plaster) a shade apart, with openings left out of it. `top` gives the height of the wall at x.
 */
function wall(b: PaintBuilder, r: Rng, x0: number, x1: number, thick: number, top: (x: number) => number, openings: readonly Opening[], coat: Coat, base = 0): void {
  const cuts = [x0, x1];
  for (const o of openings) {
    if (o.x0 > x0 && o.x0 < x1) cuts.push(o.x0);
    if (o.x1 > x0 && o.x1 < x1) cuts.push(o.x1);
  }
  cuts.sort((p, q) => p - q);
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i];
    const c = cuts[i + 1];
    if (c - a < 0.02) continue;
    const n = Math.max(1, Math.round((c - a) / coat.board));
    for (let j = 0; j < n; j++) {
      const p = a + ((c - a) * j) / n;
      const q = a + ((c - a) * (j + 1)) / n;
      const mid = (p + q) / 2;
      const h = Math.min(top(p), top(q));
      // what is left of this board above and below the openings it crosses
      let spans: [number, number][] = [[base, h]];
      for (const o of openings) {
        if (mid <= o.x0 || mid >= o.x1) continue;
        const next: [number, number][] = [];
        for (const [lo, hi] of spans) {
          if (o.y0 > lo) next.push([lo, Math.min(hi, o.y0)]);
          if (o.y1 < hi) next.push([Math.max(lo, o.y1), hi]);
        }
        spans = next;
      }
      const u = r.next();
      const col = blend(coat.wall, coat.wall2, u < 0.5 ? 0 : u < 0.85 ? 1 : 0.5).multiplyScalar(0.9 + 0.18 * r.next());
      for (const [lo, hi] of spans) if (hi - lo > 0.02) b.span(p, q, lo, hi, -thick / 2, thick / 2, col);
    }
  }
  // the weather has got at the foot of it
  for (let x = x0 + 0.4; x < x1 - 0.4; x += 1.1 + 1.4 * r.next()) {
    if (openings.some((o) => o.y0 < 0.3 && x > o.x0 - 0.3 && x < o.x1 + 0.3)) continue;
    b.span(x - 0.35 - 0.3 * r.next(), x + 0.35 + 0.3 * r.next(), base, base + 0.18 + 0.3 * r.next(), -thick / 2 - 0.012, thick / 2 + 0.012, r.next() < 0.6 ? blend(coat.wall2, MOSS, 0.55) : blend(coat.wall2, SOIL, 0.4));
  }
}

/** a window in a wall along x: frame, sill, a cross of glazing bars, and what glass is left */
function windowAt(b: PaintBuilder, r: Rng, o: Opening, thick: number, coat: Coat, shutters: boolean): void {
  const out = -thick / 2 - 0.03;
  const f = 0.07;
  b.span(o.x0 - f, o.x1 + f, o.y1, o.y1 + f, out, thick / 2, coat.trim);
  b.span(o.x0 - f, o.x1 + f, o.y0 - f, o.y0, out - 0.06, thick / 2, coat.trim);
  b.span(o.x0 - f, o.x0, o.y0, o.y1, out, thick / 2, coat.trim);
  b.span(o.x1, o.x1 + f, o.y0, o.y1, out, thick / 2, coat.trim);
  const mx = (o.x0 + o.x1) / 2;
  const my = (o.y0 + o.y1) / 2;
  b.span(mx - 0.025, mx + 0.025, o.y0, o.y1, -0.03, 0.03, coat.trim);
  if (o.x1 - o.x0 < 2) b.span(o.x0, o.x1, my - 0.025, my + 0.025, -0.03, 0.03, coat.trim);
  // glass: some panes are whole and dusty, most are gone (and one can see the shelves inside)
  for (const [a, c] of [[o.x0, mx - 0.025], [mx + 0.025, o.x1]] as const) {
    const u = r.next();
    if (u < 0.3) b.span(a, c, o.y0, o.y1, -0.012, 0.012, GLASS);
    else if (u < 0.5) b.span(a, c, o.y0, o.y0 + (o.y1 - o.y0) * (0.25 + 0.3 * r.next()), -0.012, 0.012, GLASS);
    else if (u < 0.62) b.box((a + c) / 2, my, out - 0.02, c - a + 0.2, 0.16, 0.03, WOOD_L, { rz: (r.next() - 0.5) * 0.7 });
  }
  if (shutters) {
    const sw = (o.x1 - o.x0) / 2;
    const col = shade(coat.door, -0.05);
    if (r.next() < 0.85) b.box(o.x0 - f - sw / 2, my, out - 0.03, sw, o.y1 - o.y0, 0.04, col, { rz: r.next() < 0.3 ? 0.12 : 0 });
    if (r.next() < 0.7) b.box(o.x1 + f + sw / 2, my - (r.next() < 0.25 ? 0.12 : 0), out - 0.03, sw, o.y1 - o.y0, 0.04, col, { rz: r.next() < 0.3 ? -0.16 : 0 });
  }
}

/** each kind of place has its colour, on its board by the road and over its door */
const SIGN_PAINT = [0x8d8a82, 0xc9503c, 0x4f7f8a, 0xd9a23c, 0x8a6a8f, 0x6d8463, 0x4a7fa8, 0x9a6a3c, 0x5f8f8a, 0xb9483a, 0x4f867e];

/** the pictogram of a place: centred on (x, y) in the board's plane, about 1 m across at s = 1 */
function pictogram(b: PaintBuilder, sign: number, x: number, y: number, z: number, s: number, ink: Paint, ground: Paint): void {
  const t = 0.03;
  const P = (cx: number, cy: number, w: number, h: number, rz = 0, col: Paint = ink): void => {
    b.box(x + cx * s, y + cy * s, z, w * s, h * s, t, col, { rz });
  };
  switch (sign) {
    case SIGN.fuel:
      P(-0.08, -0.02, 0.36, 0.62);
      P(-0.08, 0.14, 0.24, 0.16, 0, ground);
      P(-0.08, -0.36, 0.48, 0.08);
      P(0.22, 0.02, 0.06, 0.46);
      P(0.16, 0.26, 0.16, 0.06);
      break;
    case SIGN.wrench:
      P(0, 0, 0.14, 0.74, 0.78);
      P(0.25, 0.25, 0.3, 0.3, 0.78);
      P(0.33, 0.33, 0.1, 0.22, 0.78, ground);
      P(-0.25, -0.25, 0.26, 0.26, 0.78);
      break;
    case SIGN.shop:
      P(0, -0.08, 0.6, 0.38);
      P(0, 0.2, 0.7, 0.07);
      P(-0.18, 0.3, 0.06, 0.22, 0.4);
      P(0.18, 0.3, 0.06, 0.22, -0.4);
      P(0, -0.08, 0.44, 0.06, 0, ground);
      break;
    case SIGN.house:
      P(0, -0.14, 0.52, 0.4);
      P(-0.15, 0.15, 0.44, 0.1, 0.62);
      P(0.15, 0.15, 0.44, 0.1, -0.62);
      P(0, -0.2, 0.14, 0.26, 0, ground);
      break;
    case SIGN.camp:
      P(-0.16, -0.04, 0.62, 0.1, 1.02);
      P(0.16, -0.04, 0.62, 0.1, -1.02);
      P(0, -0.32, 0.74, 0.07);
      P(0, -0.14, 0.1, 0.3, 0, ink);
      break;
    case SIGN.fish:
      P(-0.06, 0, 0.5, 0.26);
      P(-0.06, 0.15, 0.34, 0.08);
      P(-0.06, -0.15, 0.34, 0.08);
      P(0.28, 0.08, 0.22, 0.1, 0.7);
      P(0.28, -0.08, 0.22, 0.1, -0.7);
      P(-0.2, 0.04, 0.06, 0.06, 0, ground);
      break;
    case SIGN.game:
      P(0.02, -0.02, 0.5, 0.22);
      P(-0.16, -0.26, 0.07, 0.3);
      P(0.2, -0.26, 0.07, 0.3);
      P(-0.26, 0.16, 0.1, 0.3, -0.3);
      P(-0.36, 0.36, 0.06, 0.24, 0.5);
      P(-0.22, 0.38, 0.06, 0.2, -0.4);
      break;
    case SIGN.works:
      // a valve wheel on its stem
      P(0, 0.12, 0.56, 0.1);
      P(0, 0.12, 0.1, 0.56);
      P(0, 0.12, 0.5, 0.09, 0.785);
      P(0, 0.12, 0.5, 0.09, -0.785);
      P(0, 0.12, 0.2, 0.2, 0, ground);
      P(0, -0.26, 0.12, 0.3);
      P(0, -0.42, 0.5, 0.09);
      break;
    case SIGN.light:
      // a tower with its lamp room and two beams
      P(0, -0.12, 0.2, 0.52);
      P(0, -0.4, 0.34, 0.08);
      P(0, 0.2, 0.3, 0.07);
      P(0, 0.3, 0.16, 0.16);
      P(-0.3, 0.34, 0.26, 0.05, -0.25);
      P(0.3, 0.34, 0.26, 0.05, 0.25);
      P(0, -0.1, 0.2, 0.09, 0, ground);
      break;
    case SIGN.view:
      P(-0.2, 0.02, 0.28, 0.28);
      P(0.2, 0.02, 0.28, 0.28);
      P(0, 0.06, 0.14, 0.08);
      P(-0.2, 0.02, 0.14, 0.14, 0, ground);
      P(0.2, 0.02, 0.14, 0.14, 0, ground);
      break;
    default:
      break;
  }
}

/**
 * A board in the place's colour with its pictogram in pale paint on both faces, lying in the xy
 * plane at z: a faded block of colour that reads from the road long before the picture does.
 */
function signBoard(b: PaintBuilder, r: Rng, sign: number, x: number, y: number, z: number, w: number, h: number): void {
  const col = blend(SIGN_PAINT[sign % SIGN_PAINT.length], 0xd8cdb4, 0.12 + 0.12 * r.next());
  b.box(x, y, z, w, h, 0.06, col);
  // a pale rim, worn through at one corner
  b.box(x, y + h / 2 - 0.04, z, w + 0.06, 0.08, 0.075, WHITE);
  b.box(x, y - h / 2 + 0.04, z, w + 0.06, 0.08, 0.075, WHITE);
  b.box(x - w / 2 + 0.01, y, z, 0.08, h, 0.075, WHITE);
  b.box(x + w / 2 - 0.01, y, z, 0.08, h, 0.075, WHITE);
  const s = Math.min(w, h) * 0.8;
  pictogram(b, sign, x, y, z - 0.035, s, WHITE, col);
  pictogram(b, sign, x, y, z + 0.035, s, WHITE, col);
  b.box(x + w * 0.3, y - h * 0.28, z - 0.04, w * 0.3, h * 0.22, 0.012, blend(RUST, 0xd8cdb4, 0.3));
}

// ---------------------------------------------------------------------------------------------- buildings

const ROT_SIDE = new THREE.Matrix4();

function building(b: PaintBuilder, o: SiteObject, r: Rng): void {
  const sp = o.b!;
  const coat = COATS[o.v % COATS.length];
  const w2 = o.w / 2;
  const d2 = o.d / 2;
  const H = o.h;
  const t = 0.24;
  const rise = sp.roof === 'gable' ? d2 * 0.62 : sp.roof === 'mono' ? o.d * 0.2 : 0;
  // ---- plinth and floor
  b.span(-w2 - 0.1, w2 + 0.1, -1.4, 0.0, -d2 - 0.1, d2 + 0.1, CONCRETE_D);
  b.span(-w2 + t, w2 - t, 0.0, 0.025, -d2 + t, d2 - t, FLOOR);
  for (let i = 0; i < 4; i++) b.box((r.next() - 0.5) * (o.w - 1.4), 0.03, (r.next() - 0.5) * (o.d - 1.4), 0.6 + r.next(), 0.012, 0.5 + r.next(), shade(FLOOR, -0.14 + 0.2 * r.next()), { ry: r.next() * 3 });
  // ---- the front wall, with its door (or gate) and windows
  const doorH = sp.gate ? Math.min(H - 0.45, 3.1) : 2.05;
  const front: Opening[] = [{ x0: sp.doorAt - sp.doorW / 2, x1: sp.doorAt + sp.doorW / 2, y0: 0, y1: doorH }];
  const sill = sp.windowW > 2 ? 0.75 : 0.95;
  const wTop = Math.min(H - 0.5, sill + (sp.windowW > 2 ? 1.6 : 1.15));
  for (const at of sp.windows) front.push({ x0: at - sp.windowW / 2, x1: at + sp.windowW / 2, y0: sill, y1: wTop });
  const frontTop = sp.roof === 'mono' ? H + rise : H;
  b.within(new THREE.Matrix4().makeTranslation(0, 0, -d2 + t / 2), () => {
    wall(b, r, -w2, w2, t, () => frontTop, front, coat);
    for (let i = 1; i < front.length; i++) windowAt(b, r, front[i], t, coat, sp.roof === 'gable' && !sp.gate && sp.windowW < 2);
    // door frame
    const d = front[0];
    b.span(d.x0 - 0.08, d.x0, 0, d.y1 + 0.08, -t / 2 - 0.03, t / 2, coat.trim);
    b.span(d.x1, d.x1 + 0.08, 0, d.y1 + 0.08, -t / 2 - 0.03, t / 2, coat.trim);
    b.span(d.x0, d.x1, d.y1, d.y1 + 0.08, -t / 2 - 0.03, t / 2, coat.trim);
    if (sp.gate) {
      // a shutter stuck part of the way up
      const open = 0.4 + 0.4 * r.next();
      const n = Math.max(2, Math.round((d.y1 * (1 - open)) / 0.22));
      for (let i = 0; i < n; i++) b.span(d.x0, d.x1, d.y1 - ((i + 1) * d.y1 * (1 - open)) / n, d.y1 - (i * d.y1 * (1 - open)) / n, -0.03, 0.03, shade(STEEL, i % 2 ? -0.08 : 0.04));
    } else {
      // the door stands open: nobody locked up
      const a = 1.0 + 0.6 * r.next();
      const hinge = r.next() < 0.5 ? d.x0 : d.x1;
      const dir = hinge === d.x0 ? 1 : -1;
      b.box(hinge + (dir * Math.cos(a) * sp.doorW) / 2, d.y1 / 2, (Math.sin(a) * sp.doorW) / 2, sp.doorW, d.y1, 0.05, coat.door, { ry: -a * dir });
    }
    if (sp.sign) signBoard(b, r, sp.sign, sp.doorAt, doorH + 0.5, -t / 2 - 0.07, sp.gate ? 1.7 : 1.5, 0.7);
    else if (!sp.gate && r.next() < 0.5) b.box(sp.doorAt + sp.doorW / 2 + 0.3, 1.5, -t / 2 - 0.05, 0.22, 0.3, 0.05, coat.accent);
  });
  // ---- the back wall
  const backWin: Opening[] = !sp.gate && o.w > 6 && r.next() < 0.6 ? [{ x0: -0.6, x1: 0.6, y0: 1.0, y1: Math.min(H - 0.5, 2.0) }] : [];
  b.within(new THREE.Matrix4().makeRotationY(Math.PI).setPosition(0, 0, d2 - t / 2), () => {
    wall(b, r, -w2, w2, t, () => H, backWin, coat);
    for (const wn of backWin) windowAt(b, r, wn, t, coat, false);
  });
  // ---- the end walls (they run along z; drawn in a frame turned a quarter)
  for (const side of [-1, 1]) {
    ROT_SIDE.makeRotationY(side < 0 ? Math.PI / 2 : -Math.PI / 2).setPosition(side * (w2 - t / 2), 0, 0);
    b.within(ROT_SIDE, () => {
      // in this frame x runs along the wall; its outside face is at −z. For side −1, x = +d2 is the front
      const zOf = (x: number): number => (side < 0 ? -x : x);
      const top = (x: number): number => (sp.roof === 'mono' ? H + rise * (0.5 - zOf(x) / o.d) : H);
      const wins: Opening[] = sp.sideWindows ? [{ x0: -0.55, x1: 0.55, y0: 0.95, y1: Math.min(H - 0.45, 2.0) }] : [];
      wall(b, r, -d2 + t, d2 - t, t, top, wins, coat);
      for (const wn of wins) windowAt(b, r, wn, t, coat, false);
    });
    if (sp.roof === 'gable') b.gable(side * w2 - (side > 0 ? t : 0), side * w2 + (side < 0 ? t : 0), -d2, d2, H, H + rise, shade(coat.wall2, -0.06));
  }
  // ---- inside: a pale ceiling under the roof, and pale lining boards up the walls (not in sheds)
  if (o.w > 5 && !sp.gate) {
    const lining: Coat = { ...coat, wall: 0xe6dfcc, wall2: 0xd9d1bb, board: 1.1 };
    b.span(-w2 + t, w2 - t, H - 0.06, H - 0.02, -d2 + t, d2 - t, 0xe9e4d6);
    b.within(new THREE.Matrix4().makeTranslation(0, 0, -d2 + t + 0.012), () => wall(b, r, -w2 + t, w2 - t, 0.02, () => H - 0.06, front, lining));
    b.within(new THREE.Matrix4().makeTranslation(0, 0, d2 - t - 0.012), () => wall(b, r, -w2 + t, w2 - t, 0.02, () => H - 0.06, backWin, lining));
    for (const side of [-1, 1]) {
      ROT_SIDE.makeRotationY(Math.PI / 2).setPosition(side * (w2 - t - 0.012), 0, 0);
      b.within(ROT_SIDE, () => wall(b, r, -d2 + t, d2 - t, 0.02, () => H - 0.06, sp.sideWindows ? [{ x0: -0.55, x1: 0.55, y0: 0.95, y1: Math.min(H - 0.45, 2.0) }] : [], lining));
    }
  }
  // ---- the roof, in sheets a shade apart
  const ovx = 0.35;
  const sheets = Math.max(3, Math.round((o.w + 2 * ovx) / 1.05));
  const sw = (o.w + 2 * ovx) / sheets;
  const sheetCol = (): THREE.Color => blend(coat.roof, coat.roof2, r.next() < 0.5 ? 0 : 1).multiplyScalar(0.94 + 0.12 * r.next());
  if (sp.roof === 'gable') {
    const ang = Math.atan2(rise, d2);
    const len = Math.hypot(rise, d2) + 0.45;
    for (const f of [-1, 1]) {
      for (let i = 0; i < sheets; i++) {
        // one sheet in fourteen has gone, and the rafters show
        if (r.next() < 0.07) {
          b.box(-w2 - ovx + (i + 0.5) * sw, H + rise / 2 - 0.1, (f * d2) / 2, 0.08, 0.1, len - 0.5, WOOD_D, { rx: f * ang });
          continue;
        }
        b.box(-w2 - ovx + (i + 0.5) * sw, H + rise / 2 + 0.02 - (0.2 * rise) / len, f * (d2 / 2 + 0.17), sw - 0.02, 0.07, len, sheetCol(), { rx: f * ang });
      }
      if (r.next() < 0.8) b.box((r.next() - 0.5) * o.w * 0.7, H + rise * 0.45 + 0.07, f * d2 * 0.55, 1.2 + r.next(), 0.05, 0.8 + 0.6 * r.next(), MOSS, { rx: f * ang });
    }
    b.box(0, H + rise + 0.05, 0, o.w + 2 * ovx + 0.1, 0.1, 0.3, shade(coat.roof2, -0.1));
  } else if (sp.roof === 'mono') {
    const ang = Math.atan2(rise, o.d);
    const len = Math.hypot(rise, o.d) + 0.7;
    for (let i = 0; i < sheets; i++) b.box(-w2 - ovx + (i + 0.5) * sw, H + rise / 2 + 0.06, 0, sw - 0.02, 0.07, len, sheetCol(), { rx: ang });
    if (r.next() < 0.7) b.box((r.next() - 0.5) * o.w * 0.6, H + rise * 0.3 + 0.11, d2 * 0.4, 1.3, 0.05, 1.0, MOSS, { rx: ang });
  } else {
    b.span(-w2 - 0.12, w2 + 0.12, H, H + 0.14, -d2 - 0.12, d2 + 0.12, shade(coat.roof, 0));
    b.span(-w2 - 0.12, w2 + 0.12, H + 0.14, H + 0.42, -d2 - 0.12, -d2 + 0.06, coat.trim);
    b.span(-w2 - 0.12, w2 + 0.12, H + 0.14, H + 0.36, d2 - 0.06, d2 + 0.12, coat.trim);
    b.span(-w2 - 0.12, -w2 + 0.06, H + 0.14, H + 0.36, -d2, d2, coat.trim);
    b.span(w2 - 0.06, w2 + 0.12, H + 0.14, H + 0.36, -d2, d2, coat.trim);
    // a coloured band along the front, and what was left on the roof
    b.span(-w2 - 0.13, w2 + 0.13, H - 0.36, H - 0.04, -d2 - 0.13, -d2 - 0.1, coat.accent);
    b.box(w2 * 0.4, H + 0.42, d2 * 0.2, 1.1, 0.56, 0.8, STEEL);
    if (r.next() < 0.6) b.cyl(-w2 * 0.5, H + 0.6, d2 * 0.3, 0.42, 0.9, blend(STEEL, RUST, 0.4), { segments: 10 });
    for (let i = 0; i < 3; i++) b.box((r.next() - 0.5) * o.w * 0.8, H + 0.15, (r.next() - 0.5) * o.d * 0.7, 0.9 + r.next(), 0.03, 0.7 + r.next(), MOSS, { ry: r.next() * 3 });
  }
  if (sp.chimney) {
    const cx = w2 * 0.45 * (r.next() < 0.5 ? 1 : -1);
    const top = H + rise + 0.75;
    b.span(cx - 0.28, cx + 0.28, H - 0.2, top, d2 * 0.25 - 0.28, d2 * 0.25 + 0.28, 0x9a5a48);
    b.span(cx - 0.34, cx + 0.34, top, top + 0.1, d2 * 0.25 - 0.34, d2 * 0.25 + 0.34, STONE);
  }
  // ---- porch or awning over the front
  if (sp.porch > 0) {
    const pz = -d2 - sp.porch / 2;
    const py = Math.min(H - 0.18, doorH + 0.75);
    const n = Math.max(3, Math.round(o.w / 1.05));
    for (let i = 0; i < n; i++) {
      if (!sp.porchPosts && r.next() < 0.12) continue;
      b.box(-w2 + ((i + 0.5) * o.w) / n, py - 0.08, pz, o.w / n - 0.02, 0.06, sp.porch + 0.1, sp.porchPosts ? sheetCol() : shade(i % 2 ? WHITE : coat.accent, -0.04), { rx: -0.16 });
    }
    if (sp.porchPosts) {
      for (const sx of [-1, 1]) b.span(sx * (w2 - 0.3) - 0.06, sx * (w2 - 0.3) + 0.06, -0.14, py - 0.2, -d2 - sp.porch + 0.09, -d2 - sp.porch + 0.21, coat.trim);
      // a deck of boards, and one step down to the ground
      const nb = Math.max(4, Math.round(o.w / 0.5));
      for (let i = 0; i < nb; i++) b.span(-w2 + (i * o.w) / nb + 0.01, -w2 + ((i + 1) * o.w) / nb - 0.01, -0.5, 0.0, -d2 - sp.porch, -d2, shade(WOOD, -0.08 + 0.16 * r.next()));
      b.span(sp.doorAt - 0.7, sp.doorAt + 0.7, -0.6, -0.16, -d2 - sp.porch - 0.34, -d2 - sp.porch, WOOD_D);
    }
  } else if (!sp.gate) {
    b.span(sp.doorAt - sp.doorW / 2 - 0.2, sp.doorAt + sp.doorW / 2 + 0.2, -0.6, -0.02, -d2 - 0.5, -d2 - 0.1, CONCRETE);
  }
  // ---- ivy up one corner, grass along every wall
  if (r.next() < 0.7) {
    const sx = r.next() < 0.5 ? -1 : 1;
    const hgt = H * (0.5 + 0.5 * r.next());
    for (let y = 0.1; y < hgt; y += 0.3) {
      const spread = 1.3 * (1 - y / (hgt + 0.6));
      b.box(sx * (w2 + 0.05), y + 0.15, d2 - 0.3 - spread * r.next(), 0.1, 0.36, 0.5 + 0.4 * r.next(), r.next() < 0.5 ? GRASS_D : MOSS, { rx: (r.next() - 0.5) * 0.5 });
      if (r.next() < 0.6) b.box(sx * (w2 - 0.3 - spread * r.next()), y + 0.15, d2 + 0.05, 0.5 + 0.3 * r.next(), 0.34, 0.1, r.next() < 0.5 ? GRASS_D : MOSS, { rz: (r.next() - 0.5) * 0.5 });
    }
  }
  const round = 2 * (o.w + o.d);
  for (let i = 0; i < round / 1.3; i++) {
    const p = r.next() * round;
    const off = 0.18 + 0.25 * r.next();
    if (p < o.w) {
      if (Math.abs(p - w2 - sp.doorAt) > sp.doorW / 2 + 0.3) tuft(b, r, p - w2, -d2 - (sp.porchPosts ? sp.porch : 0) - off, -0.14);
    } else if (p < o.w + o.d) tuft(b, r, w2 + off, p - o.w - d2, -0.14);
    else if (p < 2 * o.w + o.d) tuft(b, r, p - o.w - o.d - w2, d2 + off, -0.14);
    else tuft(b, r, -w2 - off, p - 2 * o.w - o.d - d2, -0.14);
  }
}

// ---------------------------------------------------------------------------------------------- wrecks

function rustOn(b: PaintBuilder, r: Rng, x: number, y: number, z: number, w: number, h: number, alongZ: boolean): void {
  if (alongZ) b.box(x, y, z, 0.02, h, w, r.next() < 0.6 ? RUST : RUST_D);
  else b.box(x, y, z, w, h, 0.02, r.next() < 0.6 ? RUST : RUST_D);
}

function wreck(b: PaintBuilder, o: SiteObject, r: Rng, biome: string): void {
  const L = o.w;
  const W = o.d;
  const H = o.h;
  const paint = CAR_PAINTS[r.int(CAR_PAINTS.length)];
  // one stripped long ago is mostly rust, its glass and most of its wheels gone
  const stripped = (o.v & 8) !== 0;
  const kind = o.v & 7;
  const body = blend(paint, RUST, stripped ? 0.5 + 0.25 * r.next() : 0.12 + 0.25 * r.next());
  const body2 = blend(paint, RUST_D, stripped ? 0.65 + 0.2 * r.next() : 0.3 + 0.3 * r.next());
  const glass = stripped ? 0x24292d : 0x3b4a4f;
  const bus = kind === 3;
  const rad = bus ? 0.45 : 0.31;
  const sill = bus ? 0.5 : 0.3;
  const wheelsAt = bus ? [0.33, -0.3] : [0.3, -0.3];
  for (const fx of wheelsAt) {
    for (const sz of [-1, 1]) {
      // some wheels are flat, some are gone
      const u = stripped ? r.next() * 0.5 : r.next();
      if (u < (stripped ? 0.32 : 0.2)) b.cyl(fx * L, rad * 0.7, sz * (W / 2 - 0.2), 0.12, 0.2, RUST_D, { segments: 6, rx: Math.PI / 2 });
      else wheel(b, fx * L, u < 0.55 ? rad * 0.82 : rad, sz * (W / 2 - 0.12), rad, bus ? 0.28 : 0.2, u < 0.6 ? RUST_D : STEEL_D);
    }
  }
  if (kind === 0) {
    // a saloon
    b.span(-L / 2, L / 2, sill, 0.8, -W / 2, W / 2, body);
    b.span(-L / 2 - 0.06, -L / 2, 0.36, 0.52, -W / 2 + 0.05, W / 2 - 0.05, STEEL_D);
    b.span(L / 2, L / 2 + 0.06, 0.36, 0.52, -W / 2 + 0.05, W / 2 - 0.05, STEEL_D);
    const z = W / 2 - 0.04;
    const zt = W / 2 - 0.2;
    b.hull([[-0.27 * L, 0.8, -z], [0.2 * L, 0.8, -z], [-0.27 * L, 0.8, z], [0.2 * L, 0.8, z], [-0.17 * L, H - 0.04, -zt], [0.08 * L, H - 0.04, -zt], [-0.17 * L, H - 0.04, zt], [0.08 * L, H - 0.04, zt]], glass);
    b.span(-0.175 * L, 0.085 * L, H - 0.045, H, -zt - 0.02, zt + 0.02, body2);
    for (const sz of [-1, 1]) {
      b.bar(0.2 * L, 0.8, sz * z, 0.08 * L, H - 0.03, sz * zt, 0.07, body);
      b.bar(-0.27 * L, 0.8, sz * z, -0.17 * L, H - 0.03, sz * zt, 0.08, body);
      b.bar(-0.03 * L, 0.8, sz * (z + 0.005), -0.04 * L, H - 0.03, sz * (zt + 0.005), 0.06, body);
    }
    if (stripped || r.next() < 0.35) b.box(0.36 * L, 1.12, 0, 0.26 * L, 0.04, W - 0.1, body2, { rz: 0.95 });
    else b.span(0.21 * L, L / 2 - 0.02, 0.8, 0.83, -W / 2 + 0.04, W / 2 - 0.04, body2);
  } else if (kind === 1) {
    // a pick-up
    b.span(-L / 2, L / 2, sill, 0.82, -W / 2, W / 2, body);
    b.span(L / 2, L / 2 + 0.07, 0.38, 0.56, -W / 2, W / 2, STEEL_D);
    const z = W / 2 - 0.04;
    const zt = W / 2 - 0.16;
    b.hull([[-0.02 * L, 0.82, -z], [0.27 * L, 0.82, -z], [-0.02 * L, 0.82, z], [0.27 * L, 0.82, z], [0.0 * L, H - 0.04, -zt], [0.17 * L, H - 0.04, -zt], [0.0 * L, H - 0.04, zt], [0.17 * L, H - 0.04, zt]], glass);
    b.span(-0.005 * L, 0.175 * L, H - 0.045, H, -zt - 0.02, zt + 0.02, body2);
    for (const sz of [-1, 1]) {
      b.bar(0.27 * L, 0.82, sz * z, 0.17 * L, H - 0.03, sz * zt, 0.07, body);
      b.bar(-0.02 * L, 0.82, sz * z, 0.0, H - 0.03, sz * zt, 0.09, body);
      b.span(-L / 2, -0.03 * L, 0.82, 1.2, sz * (W / 2 - 0.05), sz * (W / 2), body);
    }
    b.span(-L / 2, -L / 2 + 0.05, 0.82, 1.2, -W / 2, W / 2, r.next() < 0.5 ? body : body2);
    b.span(-L / 2 + 0.05, -0.03 * L, 0.82, 0.86, -W / 2 + 0.05, W / 2 - 0.05, shade(WOOD_D, 0));
    if (r.next() < 0.6) b.box(-0.28 * L, 1.1, 0.1, 0.8, 0.5, 0.65, shade(WOOD, -0.05), { ry: 0.3 });
    if (r.next() < 0.5) b.cyl(-0.38 * L, 1.0, -0.35, 0.3, 0.2, TYRE, { segments: 10 });
  } else if (kind === 2) {
    // a van
    b.span(-L / 2, 0.3 * L, sill, H, -W / 2, W / 2, body);
    const z = W / 2;
    b.hull([[0.3 * L, sill, -z], [0.3 * L, sill, z], [0.3 * L, H, -z], [0.3 * L, H, z], [L / 2, sill, -z], [L / 2, sill, z], [L / 2, 0.95, -z], [L / 2, 0.95, z], [0.36 * L, H - 0.05, -z + 0.06], [0.36 * L, H - 0.05, z - 0.06]], body);
    b.box(0.43 * L, (H + 0.95) / 2 + 0.06, 0, 0.03, H - 1.15, W - 0.3, glass, { rz: -Math.atan2(L / 2 - 0.36 * L, H - 1.0) });
    for (const sz of [-1, 1]) {
      b.span(0.06 * L, 0.28 * L, 1.05, H - 0.2, sz * (z + 0.012) - 0.01, sz * (z + 0.012) + 0.01, glass);
      b.span(-0.44 * L, -0.02 * L, sill + 0.1, H - 0.12, sz * (z + 0.008) - 0.008, sz * (z + 0.008) + 0.008, body2);
    }
    b.span(-L / 2 - 0.012, -L / 2 + 0.01, 1.05, H - 0.25, -W / 2 + 0.2, W / 2 - 0.2, glass);
    b.span(-L / 2 - 0.05, L / 2 + 0.03, 0.36, 0.5, -W / 2 - 0.02, W / 2 + 0.02, STEEL_D);
    if (r.next() < 0.4) for (const x of [-0.3, 0, 0.2]) b.span(x * L - 0.03, x * L + 0.03, H, H + 0.12, -W / 2 + 0.05, W / 2 - 0.05, STEEL_D);
  } else {
    // a bus: a long box with a band of windows, a stripe below them
    b.span(-L / 2, L / 2, sill, H, -W / 2, W / 2, body);
    b.span(-L / 2 - 0.01, L / 2 + 0.01, 1.05, 1.3, -W / 2 - 0.012, W / 2 + 0.012, blend(0xe6dcc0, RUST, 0.2));
    for (const sz of [-1, 1]) {
      const n = Math.round((L - 1.6) / 1.15);
      for (let i = 0; i < n; i++) {
        if (r.next() < 0.12) continue;
        const x0 = -L / 2 + 0.5 + i * 1.15;
        b.span(x0, x0 + 1.0, 1.5, 2.35, sz * (W / 2 + 0.01) - 0.012, sz * (W / 2 + 0.01) + 0.012, glass);
      }
    }
    b.span(L / 2 - 0.01, L / 2 + 0.014, 1.35, 2.45, -W / 2 + 0.15, W / 2 - 0.15, glass);
    b.span(L / 2 - 0.01, L / 2 + 0.016, 2.5, 2.78, -0.7, 0.7, WHITE);
    b.span(-L / 2 - 0.014, -L / 2 + 0.01, 1.5, 2.3, -W / 2 + 0.25, W / 2 - 0.25, glass);
    b.span(0.25 * L, 0.25 * L + 0.9, sill, 2.4, -W / 2 - 0.014, -W / 2 + 0.01, DARK);
    b.span(-L / 2 - 0.06, L / 2 + 0.06, 0.5, 0.68, -W / 2 - 0.02, W / 2 + 0.02, STEEL_D);
    b.span(-L / 2 + 0.3, L / 2 - 0.3, H, H + 0.06, -W / 2 + 0.25, W / 2 - 0.25, body2);
  }
  // rust in patches along the flanks
  const n = (bus ? 9 : 5) + (stripped ? 4 : 0);
  for (let i = 0; i < n; i++) {
    const sz = r.next() < 0.5 ? -1 : 1;
    rustOn(b, r, (r.next() - 0.5) * L * 0.9, sill + 0.1 + r.next() * (bus ? 0.9 : 0.35), sz * (W / 2 + 0.006), 0.3 + 0.6 * r.next(), 0.14 + 0.25 * r.next(), false);
  }
  // what has moved in: bushes through it in green country, sand against it in the dry, a drift of snow in the mountains
  const much = stripped ? 1 : 0.55;
  if (biome === 'desert') {
    // the wind has banked sand against the far side and round the nose (the near door and the boot stay
    // clear: that is where what is found in it gets laid out)
    const sand = [0xd6bd8a, 0xcdb27e, 0xdcc596];
    b.mound((r.next() - 0.5) * L * 0.2, 0.05, W / 2 + 0.35, L * (0.5 + 0.12 * much), 0.4 + 0.3 * much, 1.0 + 0.3 * much, sand[0]);
    b.mound(L * 0.47, 0.0, W * 0.25, 0.8 + 0.3 * much, 0.25 + 0.2 * much, W * 0.55, sand[2]);
    if (stripped) b.mound((r.next() - 0.5) * L * 0.4, sill + 0.05, 0, L * 0.25, 0.3, W * 0.42, sand[1]);
  } else if (biome === 'alpine') {
    b.mound((r.next() - 0.5) * L * 0.2, 0.04, W / 2 + 0.3, L * 0.5, 0.42, 0.9, 0xe4ecf4);
    b.mound(L * 0.46, 0.02, W * 0.2, 0.8, 0.3, W * 0.5, 0xdfe8f2);
  } else {
    const greens = [0x5f8a45, 0x4f7a45, 0x79a04f, 0x6a9450];
    const bushes = stripped ? 3 + r.int(3) : 1 + r.int(2);
    for (let i = 0; i < bushes; i++) {
      const a = r.next() * 6.283;
      const inThrough = stripped && i === 0;
      const rad = 0.42 + 0.4 * r.next();
      // (round the far side and the nose: the near door and the boot stay clear)
      b.mound(inThrough ? (r.next() - 0.5) * L * 0.3 : Math.abs(Math.cos(a)) * (L / 2 - 0.1) * (0.4 + 0.6 * r.next()), inThrough ? H * 0.85 : 0.3 + 0.3 * r.next(), inThrough ? 0 : Math.abs(Math.sin(a)) * (W / 2 + 0.05) + 0.1, rad * (1 + 0.4 * r.next()), rad * 0.8, rad, greens[r.int(greens.length)]);
    }
  }
  if (biome !== 'desert') {
    for (let i = 0; i < (bus ? 14 : 8); i++) {
      const a = r.next() * 6.283;
      tuft(b, r, Math.cos(a) * (L / 2 + 0.1) * (0.5 + 0.5 * r.next()), Math.sin(a) * (W / 2 + 0.25), 0, 1.1);
    }
  }
}

// ---------------------------------------------------------------------------------------------- everything else

function crate(b: PaintBuilder, o: SiteObject, r: Rng): void {
  const w = o.w / 2;
  const d = o.d / 2;
  const h = o.h;
  const col = shade(WOOD, -0.08 + 0.16 * r.next());
  // slatted sides, an open top with one board of the lid still across it
  const n = 3;
  for (let i = 0; i < n; i++) {
    const y0 = (h * i) / n + 0.01;
    const y1 = (h * (i + 1)) / n - 0.02;
    const c2 = shade(WOOD, -0.12 + 0.2 * r.next());
    b.span(-w, w, y0, y1, -d, -d + 0.03, c2);
    b.span(-w, w, y0, y1, d - 0.03, d, c2);
    b.span(-w, -w + 0.03, y0, y1, -d, d, c2);
    b.span(w - 0.03, w, y0, y1, -d, d, c2);
  }
  b.span(-w + 0.03, w - 0.03, 0.02, 0.06, -d + 0.03, d - 0.03, WOOD_D);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.span(sx * w - 0.03, sx * w + 0.03, 0, h + 0.01, sz * d - 0.03, sz * d + 0.03, WOOD_D);
  // its lid stands against one side
  if (r.next() < 0.7) b.box(w + 0.07, h * 0.45, (r.next() - 0.5) * 0.1, 0.03, h * 0.95, o.d * 0.9, col, { rz: -0.14 });
  if (o.v % 3 === 1) b.span(-w - 0.004, -w + 0.004, h * 0.3, h * 0.7, -d * 0.5, d * 0.5, 0xc9503c);
}

function shelves(b: PaintBuilder, o: SiteObject, r: Rng): void {
  const w = o.w / 2;
  const d = o.d / 2;
  b.span(-w, -w + 0.04, 0, o.h, -d, d, STEEL);
  b.span(w - 0.04, w, 0, o.h, -d, d, STEEL);
  const boards = shelfBoards(o.h);
  boards.forEach((y, i) => {
    b.span(-w, w, y - 0.03, y, -d, d, shade(WHITE, -0.08));
    // what is left on it: a few tins, a box (the board things are found on is left clear: core shelfOf)
    if (i === boards.length - 1 || Math.abs(y - 1.05) < 0.3) return;
    for (let x = -w + 0.2; x < w - 0.2; x += 0.22 + 0.5 * r.next()) {
      if (r.next() < 0.45) continue;
      const col = [0xb5503c, 0x5d7fa3, 0xe6c458, 0x6f8f5a, 0xe9e2cf][r.int(5)];
      if (r.next() < 0.6) b.cyl(x, y + 0.08, (r.next() - 0.5) * d, 0.055, 0.15, col, { segments: 6 });
      else b.box(x, y + 0.1, (r.next() - 0.5) * d, 0.18, 0.2, 0.14, col, { ry: r.next() });
    }
  });
}

/** a cupboard or a wardrobe: its doors stand open and one board runs across half way up (things found lie on it) */
function cabinet(b: PaintBuilder, o: SiteObject, r: Rng, col: number): void {
  const w = o.w / 2;
  const d = o.d / 2;
  const t = 0.035;
  b.span(-w, w, 0, o.h, d - t, d, shade(col, -0.06));
  b.span(-w, -w + t, 0, o.h, -d, d, shade(col, 0));
  b.span(w - t, w, 0, o.h, -d, d, shade(col, 0));
  b.span(-w, w, o.h - t, o.h, -d, d, shade(col, 0.04));
  b.span(-w, w, 0, 0.08, -d, d, shade(col, -0.1));
  b.span(-w + t, w - t, o.h * 0.5 - t, o.h * 0.5, -d + 0.02, d - t, shade(col, 0.06));
  // both doors swung wide, one further than the other
  const a1 = 1.7 + 0.5 * r.next();
  const a2 = 1.2 + 0.6 * r.next();
  b.box(-w - (Math.cos(a1) * w) / 2, o.h / 2, -d - (Math.sin(a1) * w) / 2, w, o.h - 0.1, 0.03, shade(col, 0.08), { ry: -a1 });
  b.box(w + (Math.cos(a2) * w) / 2, o.h / 2, -d - (Math.sin(a2) * w) / 2, w, o.h - 0.1, 0.03, shade(col, 0.08), { ry: a2 });
  if (o.kind === 'wardrobe') {
    // a rail with a coat or two still on it
    b.bar(-w + t, o.h - 0.25, 0, w - t, o.h - 0.25, 0, 0.03, STEEL_D);
    for (let x = -w + 0.25; x < w - 0.2; x += 0.3 + 0.3 * r.next()) if (r.next() < 0.6) b.box(x, o.h - 0.25 - 0.3, 0, 0.05, 0.55, o.d * 0.7, CLOTHS[r.int(CLOTHS.length)]);
  }
}

function picnicTable(b: PaintBuilder, o: SiteObject, r: Rng): void {
  const w = o.w / 2;
  for (let i = 0; i < 4; i++) b.span(-w, w, o.h - 0.05, o.h, -0.38 + i * 0.195, -0.38 + i * 0.195 + 0.18, shade(WOOD, -0.1 + 0.18 * r.next()));
  for (const sz of [-1, 1]) {
    b.span(-w, w, 0.42, 0.46, sz * 0.72 - 0.13, sz * 0.72 + 0.13, shade(WOOD, -0.12 + 0.16 * r.next()));
    for (const sx of [-1, 1]) b.bar(sx * (w - 0.3), o.h - 0.05, sz * 0.25, sx * (w - 0.3), 0, sz * 0.8, 0.07, WOOD_D);
  }
  for (const sx of [-1, 1]) b.span(sx * (w - 0.3) - 0.035, sx * (w - 0.3) + 0.035, 0.38, 0.44, -0.85, 0.85, WOOD_D);
}

function benchSeat(b: PaintBuilder, o: SiteObject, r: Rng): void {
  const w = o.w / 2;
  b.span(-w, w, o.h - 0.05, o.h, -o.d / 2, o.d / 2, shade(WOOD, -0.06 + 0.12 * r.next()));
  b.box(0, o.h + 0.32, o.d / 2 - 0.02, o.w, 0.3, 0.04, shade(WOOD, -0.1 + 0.12 * r.next()), { rx: -0.14 });
  for (const sx of [-1, 1]) {
    b.span(sx * (w - 0.15) - 0.03, sx * (w - 0.15) + 0.03, 0, o.h - 0.05, -o.d / 2 + 0.04, o.d / 2 - 0.04, STEEL_D);
    b.span(sx * (w - 0.15) - 0.03, sx * (w - 0.15) + 0.03, o.h, o.h + 0.5, o.d / 2 - 0.04, o.d / 2 + 0.02, STEEL_D);
  }
}

/** posts along a run, and rails between them: some down, some leaning */
function fenceRun(b: PaintBuilder, o: SiteObject, r: Rng, rails: number, col: number): void {
  const n = Math.max(2, Math.round(o.w / 1.9) + 1);
  for (let i = 0; i < n; i++) {
    const x = -o.w / 2 + (i * o.w) / (n - 1);
    b.box(x, o.h / 2 - 0.1, 0, 0.09, o.h + 0.2, 0.09, shade(col, -0.1 + 0.15 * r.next()), { rz: (r.next() - 0.5) * 0.14, rx: (r.next() - 0.5) * 0.14 });
    if (i === n - 1) break;
    const x1 = -o.w / 2 + ((i + 1) * o.w) / (n - 1);
    for (let k = 0; k < rails; k++) {
      const y = o.h - 0.1 - (k * (o.h - 0.3)) / Math.max(1, rails - 1 || 1) * (rails > 1 ? 1 : 0);
      if (r.next() < 0.14) b.bar(x, y, 0, x1 - 0.2, 0.06, 0.25, 0.06, shade(col, -0.05));
      else b.bar(x, y, 0, x1, y + (r.next() - 0.5) * 0.06, 0, 0.06, shade(col, -0.05 + 0.1 * r.next()));
    }
    if (r.next() < 0.5) tuft(b, r, (x + x1) / 2, 0.1, 0);
  }
}

// ---- the old works: what the reference facility is made of (refs/artstation-1NKWJK) — pale concrete
// with the weather on it, sea-green painted iron going to rust at its edges, ivy coming over the top

const CREAM = 0xe9e2cf;
const TEAL = 0x6aa79c;
const TEAL_D = 0x4f867e;
const TEAL_L = 0x93c4b8;
const IVY = 0x9cc24a;
const IVY_D = 0x6f9a3c;
const STENCIL = 0xd9c47a;

/** iron painted sea-green: here and there the paint has gone pale, and at the joints it is rust */
function teal(r: Rng): THREE.Color {
  const t = r.next();
  return t < 0.14 ? blend(TEAL, RUST, 0.55) : t < 0.34 ? blend(TEAL, TEAL_L, 0.7) : shade(TEAL, -0.06 + 0.1 * r.next());
}

/** a pipe from a to b with a flange at each end and one every few metres */
function pipe(b: PaintBuilder, r: Rng, ax: number, ay: number, az: number, bx: number, by: number, bz: number, rad: number): void {
  const len = Math.hypot(bx - ax, by - ay, bz - az);
  b.bar(ax, ay, az, bx, by, bz, rad * 1.72, teal(r));
  const n = Math.max(1, Math.round(len / 2.4));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const e = 0.07 / len;
    const t0 = Math.max(0, t - e);
    const t1 = Math.min(1, t + e);
    b.bar(ax + (bx - ax) * t0, ay + (by - ay) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, ay + (by - ay) * t1, az + (bz - az) * t1, rad * 2.25, r.next() < 0.4 ? blend(TEAL_D, RUST, 0.5) : TEAL_D);
  }
}

/** ivy over an edge at (x, y, z): a clump on top and strands hanging down the face on the −z side */
function ivy(b: PaintBuilder, r: Rng, x: number, y: number, z: number, drop: number): void {
  b.mound(x, y + 0.1, z, 0.55 + 0.35 * r.next(), 0.32, 0.4, blend(IVY_D, IVY, r.next()));
  const n = 2 + r.int(3);
  for (let i = 0; i < n; i++) {
    const sx = x + (r.next() - 0.5) * 1.1;
    const len = drop * (0.35 + 0.65 * r.next());
    b.bar(sx, y, z - 0.03, sx + (r.next() - 0.5) * 0.3, y - len, z - 0.05, 0.035, IVY_D);
    for (let q = 0.2; q < len; q += 0.32 + 0.2 * r.next()) b.box(sx + (r.next() - 0.5) * 0.24, y - q, z - 0.07, 0.24 + 0.16 * r.next(), 0.2 + 0.12 * r.next(), 0.03, blend(IVY_D, IVY, 0.2 + 0.8 * r.next()), { rz: (r.next() - 0.5) * 1.2 });
  }
}

/**
 * The works' long wall (its face is the −z side): concrete in pours of slightly different pale, a
 * buttress every few metres, a sea-green coping, a rack of pipes high on it that turns down to the
 * ground at one end, a louvred cabinet, the stencilled band along the foot.
 */
function wallRun(b: PaintBuilder, o: SiteObject, r: Rng): void {
  const w = o.w / 2;
  const h = o.h;
  const t = 0.22;
  // the pours
  const bays = Math.max(3, Math.round(o.w / 4.4));
  const bay = o.w / bays;
  for (let i = 0; i < bays; i++) {
    const x0 = -w + i * bay;
    const col = shade(CREAM, -0.05 + 0.07 * r.next());
    b.span(x0, x0 + bay, -0.4, h, -t, t, col);
    // weather: a darker foot, a pale scrubbed patch, the odd chip showing warm
    b.span(x0 + 0.05, x0 + bay - 0.05, 0, 0.5 + 0.5 * r.next(), -t - 0.012, -t, blend(CREAM, MOSS, 0.3 + 0.2 * r.next()));
    if (r.next() < 0.7) b.box(x0 + bay * (0.3 + 0.4 * r.next()), h * (0.35 + 0.4 * r.next()), -t - 0.008, bay * (0.3 + 0.3 * r.next()), 0.5 + 0.9 * r.next(), 0.016, shade(CREAM, 0.05), { rz: (r.next() - 0.5) * 0.2 });
    if (r.next() < 0.5) b.box(x0 + bay * r.next(), h - 0.25 - 0.4 * r.next(), -t - 0.01, 0.3 + 0.4 * r.next(), 0.18, 0.02, blend(RUST, CREAM, 0.35));
  }
  // buttresses: wide at the foot, with the narrow slot the reference's have
  for (let i = 0; i <= bays; i++) {
    const x = -w + i * bay;
    const hw = 0.38;
    b.hull([[x - hw, -0.4, -t], [x + hw, -0.4, -t], [x - hw, -0.4, -t - 1.0], [x + hw, -0.4, -t - 1.0], [x - hw, h * 0.34, -t - 0.72], [x + hw, h * 0.34, -t - 0.72], [x - hw, h + 0.25, -t - 0.42], [x + hw, h + 0.25, -t - 0.42], [x - hw, h + 0.25, -t], [x + hw, h + 0.25, -t]], shade(CREAM, 0.02 + 0.03 * r.next()));
    b.box(x, h * 0.72, -t - 0.5, 0.2, h * 0.3, 0.1, shade(CREAM, -0.16));
    if (r.next() < 0.6) b.box(x + (r.next() - 0.5) * 0.3, h + 0.16, -t - 0.3, 0.5, 0.2, 0.3, blend(RUST, CREAM, 0.3));
  }
  // the coping, and what grows over it
  b.span(-w - 0.1, w + 0.1, h, h + 0.16, -t - 0.12, t + 0.12, TEAL);
  for (let x = -w + 0.6; x < w; x += 1.6 + 2.2 * r.next()) b.box(x, h + 0.08, -t - 0.125, 0.5 + 0.7 * r.next(), 0.17, 0.02, r.next() < 0.5 ? blend(TEAL, RUST, 0.6) : TEAL_L);
  for (let k = 0; k < bays; k++) if (r.next() < 0.75) ivy(b, r, -w + (k + 0.2 + 0.6 * r.next()) * bay, h + 0.16, -t - 0.1, 1.2 + 2.6 * r.next());
  // the pipe rack: three on brackets, turning down at the +x end
  const x0 = -w + bay * 0.55;
  const x1 = w - bay * 0.5;
  const rows = [h - 0.85, h - 1.45, h - 2.05];
  rows.forEach((y, i) => {
    const z = -t - 0.62 - (i === 1 ? 0.18 : 0);
    const rad = i === 1 ? 0.2 : 0.16;
    pipe(b, r, x0 - (i === 2 ? 0 : 0.5), y, z, x1 - i * 0.55, y, z, rad);
    // … down to the ground
    pipe(b, r, x1 - i * 0.55, y, z, x1 - i * 0.55, 0.05, z, rad);
    b.sphere(x1 - i * 0.55, y, z, rad * 1.2, TEAL_D);
    // an open end with its grille on the short ones
    if (i < 2) b.cyl(x0 - 0.5, y, z, rad * 1.08, 0.06, DARK, { segments: 8, rz: Math.PI / 2 });
  });
  for (let x = x0 + 0.4; x < x1; x += 2.9) {
    b.box(x, h - 1.45, -t - 0.5, 0.09, 1.75, 0.09, STEEL_D);
    b.bar(x, h - 0.55, -t, x, h - 0.55, -t - 0.95, 0.08, STEEL_D);
    b.bar(x, h - 2.35, -t, x, h - 2.35, -t - 0.95, 0.08, STEEL_D);
    b.box(x, h - 2.9 - 0.4 * r.next(), -t - 0.014, 0.12, 0.9 + 0.8 * r.next(), 0.02, blend(RUST, CREAM, 0.45));
  }
  // the cabinet: two sea-green doors over a louvred foot
  const cx = -w + bay * 1.5;
  b.box(cx, 1.95, -t - 0.5, 2.9, 1.7, 1.0, teal(r));
  for (const sx of [-0.73, 0.73]) {
    b.box(cx + sx, 2.05, -t - 1.012, 1.34, 1.36, 0.03, blend(TEAL, TEAL_L, 0.55 + 0.3 * r.next()));
    b.box(cx + sx, 2.05, -t - 1.03, 1.42, 1.44, 0.02, TEAL_D);
  }
  b.box(cx, 1.0, -t - 0.5, 2.9, 0.34, 1.0, DARK);
  for (let i = 0; i < 4; i++) b.box(cx, 0.9 + i * 0.075, -t - 1.01, 2.8, 0.03, 0.04, STEEL_D, { rx: 0.5 });
  b.box(cx, 0.72, -t - 0.5, 3.0, 0.12, 1.06, blend(TEAL_D, RUST, 0.5));
  b.box(cx - 1.3, 0.36, -t - 0.5, 0.12, 0.72, 0.9, STEEL_D);
  b.box(cx + 1.3, 0.36, -t - 0.5, 0.12, 0.72, 0.9, STEEL_D);
  // the band along the foot: slanted strokes in faded green, a number in faded yellow
  for (let x = -w + bay * 2.4; x < w - bay * 0.8; x += 0.42) {
    if (r.next() < 0.18) continue;
    b.box(x, 0.86, -t - 0.012, 0.16, 0.34, 0.016, blend(TEAL, CREAM, 0.45 + 0.3 * r.next()), { rz: -0.6 });
  }
  const nx = w - bay * 0.5;
  for (let i = 0; i < 4; i++) b.box(nx - 2.2 + i * 0.5, h * 0.52, -t - 0.012, i === 1 ? 0.3 : 0.34, i === 1 ? 0.12 : 0.62, 0.016, blend(STENCIL, CREAM, 0.35 + 0.3 * r.next()));
  for (let k = 0; k < 6; k++) tuft(b, r, -w + r.next() * o.w, -t - 0.3 - 0.9 * r.next());
}

/** three pipes on concrete saddles across the yard, a valve wheel on the middle one */
function pipeRun(b: PaintBuilder, o: SiteObject, r: Rng): void {
  const w = o.w / 2;
  for (let x = -w + 0.7; x <= w - 0.6; x += (o.w - 1.3) / Math.max(1, Math.round(o.w / 3))) {
    b.hull([[x - 0.25, -0.2, -0.72], [x + 0.25, -0.2, -0.72], [x - 0.25, -0.2, 0.72], [x + 0.25, -0.2, 0.72], [x - 0.2, 0.42, -0.6], [x + 0.2, 0.42, -0.6], [x - 0.2, 0.42, 0.6], [x + 0.2, 0.42, 0.6]], shade(CREAM, -0.06 + 0.06 * r.next()));
    tuft(b, r, x + 0.3, 0.75);
  }
  [-0.42, 0, 0.42].forEach((z, i) => {
    const rad = i === 1 ? 0.2 : 0.16;
    const y = 0.42 + rad;
    pipe(b, r, -w, y, z, w, y, z, rad);
    // both ends turn into the ground
    for (const sx of [-1, 1]) {
      b.sphere(sx * w, y, z, rad * 1.2, TEAL_D);
      pipe(b, r, sx * w, y, z, sx * w, -0.3, z, rad);
    }
  });
  // the valve: a stem and a wheel, rust red
  const vx = -w * 0.3;
  b.cyl(vx, 0.98, 0, 0.05, 0.5, STEEL_D, { segments: 6 });
  b.cyl(vx, 1.24, 0, 0.26, 0.05, blend(0xb9483a, RUST, 0.4), { segments: 10 });
  b.cyl(vx, 1.25, 0, 0.17, 0.06, DARK, { segments: 10 });
  b.box(vx, 1.26, 0, 0.5, 0.04, 0.05, blend(0xb9483a, RUST, 0.4));
  b.box(vx, 1.26, 0, 0.05, 0.04, 0.5, blend(0xb9483a, RUST, 0.4));
  b.box(vx, 0.76, 0, 0.34, 0.3, 0.34, TEAL_D);
}

/** a round concrete tank: hoops, a ladder in its cage, a railed top, the weather down its sides */
function silo(b: PaintBuilder, o: SiteObject, r: Rng): void {
  const R = o.w / 2;
  const h = o.h;
  const seg = 14;
  b.cyl(0, -0.15, 0, R + 0.25, 0.7, shade(CREAM, -0.12), { segments: seg });
  // three lifts of concrete, each its own pale
  for (let i = 0; i < 3; i++) b.cyl(0, 0.2 + (h - 0.2) * ((i + 0.5) / 3), 0, R, (h - 0.2) / 3, shade(CREAM, -0.05 + 0.07 * r.next()), { segments: seg });
  for (const y of [h * 0.3, h * 0.62, h * 0.93]) b.cyl(0, y, 0, R + 0.035, 0.16, r.next() < 0.4 ? blend(TEAL, RUST, 0.45) : TEAL, { segments: seg });
  b.cyl(0, h + 0.08, 0, R + 0.12, 0.16, TEAL_D, { segments: seg });
  // weather
  for (let k = 0; k < 9; k++) {
    const a = r.next() * 6.283;
    const len = 0.8 + 2.4 * r.next();
    const y0 = [h * 0.3, h * 0.62, h * 0.93][r.int(3)];
    if (y0 - len < 0.2) continue;
    b.box(Math.cos(a) * (R + 0.012), y0 - len / 2, Math.sin(a) * (R + 0.012), 0.14 + 0.2 * r.next(), len, 0.03, blend(RUST, CREAM, 0.4), { ry: -a + Math.PI / 2 });
  }
  for (let k = 0; k < 8; k++) {
    const a = r.next() * 6.283;
    b.box(Math.cos(a) * (R + 0.012), 0.5 + 0.4 * r.next(), Math.sin(a) * (R + 0.012), 0.8 + r.next(), 0.7 + 0.6 * r.next(), 0.03, blend(CREAM, MOSS, 0.35 + 0.25 * r.next()), { ry: -a + Math.PI / 2 });
  }
  // the ladder on the yard side (−z), hooped from head height up, to a gap in the rail
  const lz = -R - 0.16;
  for (const sx of [-0.24, 0.24]) b.box(sx, h / 2 + 0.55, lz, 0.05, h + 1.1, 0.05, TEAL_D);
  for (let y = 0.4; y < h + 0.9; y += 0.32) b.box(0, y, lz, 0.48, 0.035, 0.035, STEEL_D);
  for (let y = 2.3; y < h + 0.2; y += 0.95) {
    b.box(-0.36, y, lz - 0.3, 0.04, 0.06, 0.62, TEAL);
    b.box(0.36, y, lz - 0.3, 0.04, 0.06, 0.62, TEAL);
    b.box(0, y, lz - 0.6, 0.76, 0.06, 0.04, TEAL);
  }
  for (const sx of [-0.36, 0.36, 0]) b.box(sx, (2.3 + h + 0.2) / 2, lz - 0.6 + (sx === 0 ? 0 : 0.0), 0.035, h - 2.1, 0.035, sx === 0 ? TEAL : TEAL_D);
  // the rail round the top
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * 6.283 - Math.PI / 2 + Math.PI / seg;
    const a1 = ((k + 1) / seg) * 6.283 - Math.PI / 2 + Math.PI / seg;
    const col = r.next() < 0.3 ? blend(TEAL, RUST, 0.45) : TEAL;
    b.bar(Math.cos(a0) * R, h + 0.1, Math.sin(a0) * R, Math.cos(a0) * R, h + 1.15, Math.sin(a0) * R, 0.06, col);
    // (the ladder comes up through the bay over it)
    if (k === seg - 1) continue;
    b.bar(Math.cos(a0) * R, h + 1.12, Math.sin(a0) * R, Math.cos(a1) * R, h + 1.12, Math.sin(a1) * R, 0.06, col);
    b.bar(Math.cos(a0) * R, h + 0.62, Math.sin(a0) * R, Math.cos(a1) * R, h + 0.62, Math.sin(a1) * R, 0.04, col);
  }
  // its number, stencilled
  for (let i = 0; i < 3; i++) b.box(-1.5 + i * 0.5, h * 0.47, -R * 0.94, 0.34, i === 1 ? 0.12 : 0.6, 0.03, blend(STENCIL, CREAM, 0.4));
  // ivy up the weather side and over the rim
  for (let k = 0; k < 10; k++) {
    const a = 0.3 + 1.3 * r.next();
    const y = h * r.next() * r.next() + 0.3;
    b.mound(Math.cos(a) * (R + 0.08), y, Math.sin(a) * (R + 0.08), 0.5 + 0.4 * r.next(), 0.4 + 0.3 * r.next(), 0.5 + 0.4 * r.next(), blend(IVY_D, IVY, r.next()));
  }
  for (let k = 0; k < 7; k++) {
    const a = r.next() * 6.283;
    tuft(b, r, Math.cos(a) * (R + 0.6), Math.sin(a) * (R + 0.6), -0.1);
  }
}

/** where the lamp of a lighthouse of height h stands above its foot: the middle of the lantern room (m) */
export function lampHeight(h: number): number {
  return h * 0.8 + 2.25;
}

/**
 * A lighthouse: a tapering tower in courses of old white with two red bands, a gallery with a
 * sea-green rail, the lantern room and its cap. Painted the way the reference facility is: pale
 * walls with the weather on them, green metal going to rust at the edges, ivy at the foot.
 */
function lighthouse(b: PaintBuilder, o: SiteObject, r: Rng): void {
  const R = o.w / 2;
  const H = o.h * 0.8;
  const RT = R * 0.6;
  const SEA_GREEN = 0x5f9f95;
  const RED = 0xb9483a;
  const seg = 12;
  // the plinth, down into whatever the ground does under it
  b.cyl(0, -0.9, 0, R + 0.55, 2.4, shade(STONE, -0.05), { segments: seg, radiusTop: R + 0.35 });
  b.cyl(0, 0.36, 0, R + 0.2, 0.2, shade(STONE, 0.08), { segments: seg });
  // the tower in eight courses: each its own shade of the same old paint, the third and the sixth red
  const N = 8;
  for (let i = 0; i < N; i++) {
    const y0 = 0.45 + ((H - 0.45) * i) / N;
    const y1 = 0.45 + ((H - 0.45) * (i + 1)) / N;
    const r0 = R + (RT - R) * (i / N);
    const r1 = R + (RT - R) * ((i + 1) / N);
    const red = i === 2 || i === 5;
    const col = red ? blend(RED, RUST, 0.12 + 0.2 * r.next()) : shade(WHITE, -0.07 + 0.09 * r.next() - (i === 0 ? 0.06 : 0));
    b.cyl(0, (y0 + y1) / 2, 0, r0, y1 - y0, col, { segments: seg, radiusTop: r1 });
  }
  // weather: rust runs under the gallery, damp at the foot
  for (let k = 0; k < 5; k++) {
    const a = r.next() * 6.283;
    const len = 1.2 + 2.6 * r.next();
    const rr = RT + (R - RT) * (len / 2 / H) + 0.03;
    b.box(Math.cos(a) * rr, H - len / 2 - 0.15, Math.sin(a) * rr, 0.16 + 0.2 * r.next(), len, 0.05, blend(RUST, 0xece8dc, 0.35), { ry: -a + Math.PI / 2 });
  }
  for (let k = 0; k < 7; k++) {
    const a = r.next() * 6.283;
    b.box(Math.cos(a) * (R + 0.02), 0.9 + 0.5 * r.next(), Math.sin(a) * (R + 0.02), 0.7 + 0.9 * r.next(), 0.9 + 0.8 * r.next(), 0.06, blend(MOSS, 0xece8dc, 0.3 + 0.3 * r.next()), { ry: -a + Math.PI / 2 });
  }
  // the door, to the yard (−z), and narrow windows winding up
  b.box(0, 1.55, -R + 0.12, 1.25, 2.3, 0.3, shade(STONE, 0.05));
  b.box(0, 1.5, -R + 0.02, 0.95, 2.1, 0.14, blend(SEA_GREEN, RUST_D, 0.25));
  b.box(0.3, 1.5, -R - 0.05, 0.06, 0.16, 0.04, RUST_D);
  for (let i = 1; i < 6; i++) {
    const a = -Math.PI / 2 + i * 1.9;
    const y = 0.45 + ((H - 0.45) * (i + 0.5)) / 6.6;
    const rr = R + (RT - R) * (y / H) + 0.02;
    b.box(Math.cos(a) * rr, y, Math.sin(a) * rr, 0.42, 0.95, 0.1, DARK, { ry: -a + Math.PI / 2 });
    b.box(Math.cos(a) * (rr + 0.03), y - 0.52, Math.sin(a) * (rr + 0.03), 0.6, 0.09, 0.12, shade(STONE, 0.1), { ry: -a + Math.PI / 2 });
  }
  // the gallery: brackets, the deck, a rail of sea-green iron
  const G = RT + 0.95;
  for (let k = 0; k < seg; k++) {
    const a = ((k + 0.5) / seg) * 6.283;
    b.bar(Math.cos(a) * RT * 0.98, H - 0.95, Math.sin(a) * RT * 0.98, Math.cos(a) * (G - 0.1), H - 0.08, Math.sin(a) * (G - 0.1), 0.12, STEEL_D);
  }
  b.cyl(0, H, 0, G, 0.16, shade(STONE, -0.12), { segments: seg });
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * 6.283;
    const a1 = ((k + 1) / seg) * 6.283;
    const col = r.next() < 0.3 ? blend(SEA_GREEN, RUST, 0.45) : SEA_GREEN;
    b.bar(Math.cos(a0) * (G - 0.08), H + 0.08, Math.sin(a0) * (G - 0.08), Math.cos(a0) * (G - 0.08), H + 1.1, Math.sin(a0) * (G - 0.08), 0.07, col);
    b.bar(Math.cos(a0) * (G - 0.08), H + 1.08, Math.sin(a0) * (G - 0.08), Math.cos(a1) * (G - 0.08), H + 1.08, Math.sin(a1) * (G - 0.08), 0.07, col);
    b.bar(Math.cos(a0) * (G - 0.08), H + 0.6, Math.sin(a0) * (G - 0.08), Math.cos(a1) * (G - 0.08), H + 0.6, Math.sin(a1) * (G - 0.08), 0.045, col);
  }
  // the lantern room: a low drum, glass between green mullions, the lamp, the cap and its vane
  const L = RT * 0.78;
  b.cyl(0, H + 0.55, 0, L + 0.06, 0.95, shade(WHITE, -0.04), { segments: seg });
  b.cyl(0, H + 2.25, 0, L - 0.04, 2.5, blend(GLASS, 0xf4e9b8, 0.35), { segments: seg });
  for (let k = 0; k < seg; k += 2) {
    const a = (k / seg) * 6.283;
    b.bar(Math.cos(a) * L, H + 1.0, Math.sin(a) * L, Math.cos(a) * L, H + 3.5, Math.sin(a) * L, 0.09, SEA_GREEN);
  }
  b.cyl(0, H + 2.25, 0, 0.42, 1.1, 0xfff1b0, { segments: 8 });
  b.cyl(0, H + 3.58, 0, L + 0.22, 0.2, blend(SEA_GREEN, RUST, 0.2), { segments: seg });
  b.cyl(0, H + 4.3, 0, L + 0.16, 1.3, blend(SEA_GREEN, RUST, 0.3), { segments: seg, radiusTop: 0.14 });
  b.sphere(0, H + 5.05, 0, 0.2, blend(SEA_GREEN, RUST, 0.5));
  b.bar(0, H + 5.1, 0, 0, H + 6.0, 0, 0.05, STEEL_D);
  b.box(0.22, H + 5.75, 0, 0.5, 0.2, 0.03, RUST_D);
  // ivy up the weather side, grass against the plinth
  for (let k = 0; k < 9; k++) {
    const a = 1.2 + 1.4 * r.next();
    const y = 0.5 + 4.2 * r.next() * r.next();
    const rr = R + (RT - R) * (y / H) + 0.06;
    b.sphere(Math.cos(a) * rr, y, Math.sin(a) * rr, 0.35 + 0.35 * r.next(), blend(GRASS_D, GRASS, r.next()));
  }
  for (let k = 0; k < 8; k++) {
    const a = r.next() * 6.283;
    tuft(b, r, Math.cos(a) * (R + 0.8), Math.sin(a) * (R + 0.8), -0.3);
  }
}

function draw(b: PaintBuilder, o: SiteObject, r: Rng, biome: string): void {
  const w = o.w / 2;
  const d = o.d / 2;
  const h = o.h;
  switch (o.kind) {
    case 'building':
      building(b, o, r);
      break;
    case 'wreck':
      wreck(b, o, r, biome);
      break;
    case 'canopy': {
      const coat = COATS[o.v % 4];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(sx * (w - 0.6), h / 2, sz * (d - 0.6), 0.14, h, shade(WHITE, -0.06), { segments: 8 });
      b.span(-w, w, h, h + 0.12, -d, d, shade(WHITE, -0.1));
      // the coloured band round the edge, one panel hanging
      b.span(-w - 0.04, w + 0.04, h - 0.05, h + 0.5, -d - 0.04, -d + 0.02, coat.accent);
      b.span(-w - 0.04, w + 0.04, h - 0.05, h + 0.5, d - 0.02, d + 0.04, coat.accent);
      b.span(-w - 0.04, -w + 0.02, h - 0.05, h + 0.5, -d, d, shade(coat.accent, -0.08));
      b.span(w - 0.02, w + 0.04, h - 0.05, h + 0.5, -d, d, shade(coat.accent, -0.08));
      b.span(-w - 0.05, w + 0.05, h + 0.36, h + 0.44, -d - 0.05, -d + 0.03, WHITE);
      b.box(w * 0.5, h - 0.35, -d + 0.4, 1.6, 0.04, 0.9, shade(WHITE, -0.12), { rx: 0.9 });
      for (let i = 0; i < 3; i++) b.box((r.next() - 0.5) * o.w * 0.8, h + 0.13, (r.next() - 0.5) * o.d * 0.7, 1 + r.next(), 0.03, 0.8 + r.next(), MOSS, { ry: r.next() * 3 });
      // the island the pumps stand on
      b.span(-w + 1.2, w - 1.2, 0, 0.16, -0.55, 0.55, CONCRETE);
      break;
    }
    case 'pump': {
      const coat = COATS[o.v % 4];
      b.span(-w, w, 0.16, h, -d, d, blend(coat.accent, RUST, 0.2));
      b.span(-w + 0.06, w - 0.06, h * 0.55, h - 0.12, -d - 0.012, d + 0.012, WHITE);
      b.span(-w + 0.12, w - 0.12, h * 0.68, h - 0.2, -d - 0.02, d + 0.02, DARK);
      b.span(-w - 0.03, w + 0.03, h, h + 0.08, -d - 0.03, d + 0.03, STEEL_D);
      b.box(0, h + 0.3, 0, 0.5, 0.36, 0.12, WHITE);
      // the hose, fallen
      b.bar(w + 0.02, h * 0.6, 0, w + 0.25, 0.4, 0.15, 0.04, DARK);
      b.bar(w + 0.25, 0.4, 0.15, w + 0.5, 0.2, 0.5, 0.04, DARK);
      rustOn(b, r, 0, 0.35, -d - 0.008, 0.5, 0.2, false);
      break;
    }
    case 'lid':
      b.cyl(0, 0.02, 0, 0.45, 0.04, STEEL_D, { segments: 10 });
      b.cyl(0, 0.03, 0, 0.32, 0.04, blend(STEEL, RUST, 0.5), { segments: 10 });
      b.span(-0.1, 0.1, 0.04, 0.07, -0.02, 0.02, DARK);
      break;
    case 'signpole': {
      b.cyl(0, h / 2, 0, 0.13, h, shade(WHITE, -0.12), { segments: 8 });
      b.cyl(0, 0.15, 0, 0.3, 0.3, CONCRETE, { segments: 8 });
      signBoard(b, r, o.v, 0, h - 1.0, 0, o.w, 1.9);
      // the price board below, hanging by one corner
      b.box(0.1, h - 2.5, 0, o.w * 0.8, 0.7, 0.05, WHITE, { rz: 0.18 });
      b.box(0.1, h - 2.5, 0.03, o.w * 0.6, 0.12, 0.02, DARK, { rz: 0.18 });
      b.box(0.1, h - 2.5, -0.03, o.w * 0.6, 0.12, 0.02, DARK, { rz: 0.18 });
      rustOn(b, r, 0.12, h * 0.4, 0, 0.4, 0.5, true);
      break;
    }
    case 'board':
      for (const sx of [-1, 1]) b.box(sx * (w - 0.06), h / 2, 0, 0.09, h, 0.09, shade(WOOD_D, 0), { rz: (r.next() - 0.5) * 0.06 });
      signBoard(b, r, o.v, 0, h - 0.6, 0, o.w + 0.1, 1.1);
      tuft(b, r, 0.2, 0.15, 0);
      break;
    case 'icebox':
      b.span(-w, w, 0, h, -d, d, shade(WHITE, -0.04));
      b.span(-w - 0.01, w + 0.01, h - 0.35, h - 0.05, -d - 0.012, -d + 0.01, 0x5d8fb0);
      b.box(-w + 0.25 - 0.1, h * 0.42, -d - 0.16, 0.5, h * 0.72, 0.04, shade(WHITE, 0.02), { ry: -0.7 });
      b.span(-w + 0.03, w - 0.03, 0.08, h - 0.4, -d + 0.02, -d + 0.03, DARK);
      rustOn(b, r, 0, 0.2, -d - 0.006, 0.5, 0.25, false);
      break;
    case 'crate':
      crate(b, o, r);
      break;
    case 'barrel':
      b.cyl(0, h / 2, 0, w, h, shade(WOOD, -0.1 + 0.1 * r.next()), { segments: 10, radiusTop: w * 0.9 });
      for (const y of [0.18, h - 0.18]) b.cyl(0, y, 0, w + 0.012, 0.05, STEEL_D, { segments: 10 });
      b.cyl(0, h - 0.03, 0, w * 0.82, 0.02, DARK, { segments: 10 });
      break;
    case 'drum': {
      const col = [0x3f6f8a, 0xb5402c, 0xd9a23c, 0x6d8463][o.v % 4];
      b.cyl(0, h / 2, 0, w, h, blend(col, RUST, 0.2 + 0.3 * r.next()), { segments: 10 });
      for (const y of [0.02, h / 2, h - 0.02]) b.cyl(0, y, 0, w + 0.015, 0.04, shade(col, -0.25), { segments: 10 });
      break;
    }
    case 'tyres': {
      const n = Math.max(1, Math.round(h / 0.21));
      for (let i = 0; i < n; i++) {
        b.cyl((r.next() - 0.5) * 0.08, 0.105 + i * 0.21, (r.next() - 0.5) * 0.08, 0.36, 0.2, shade(TYRE, i % 2 ? 0.25 : 0), { segments: 10 });
      }
      b.cyl(0, n * 0.21 + 0.002, 0, 0.2, 0.01, DARK, { segments: 8 });
      tuft(b, r, 0.4, 0.2, 0);
      break;
    }
    case 'toolbox':
      b.span(-w, w, 0, h * 0.72, -d, d, 0xb5402c);
      b.span(-w - 0.01, w + 0.01, h * 0.72, h * 0.92, -d - 0.01, d + 0.01, blend(0xb5402c, RUST_D, 0.4));
      b.span(-0.14, 0.14, h * 0.92, h, -0.02, 0.02, STEEL_D);
      b.span(-0.05, 0.05, h * 0.5, h * 0.72, -d - 0.02, -d, STEEL);
      break;
    case 'workbench':
      b.span(-w, w, h - 0.07, h, -d, d, shade(WOOD, -0.05));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.span(sx * (w - 0.08) - 0.04, sx * (w - 0.08) + 0.04, 0, h - 0.07, sz * (d - 0.08) - 0.04, sz * (d - 0.08) + 0.04, STEEL_D);
      b.span(-w + 0.05, w - 0.05, 0.22, 0.26, -d + 0.05, d - 0.05, WOOD_D);
      b.box(-w + 0.35, h + 0.1, d - 0.2, 0.22, 0.2, 0.16, STEEL_D);
      b.box(-w + 0.35, h + 0.22, d - 0.2, 0.3, 0.06, 0.1, STEEL);
      break;
    case 'lift':
      for (const sx of [-1, 1]) {
        b.span(sx * (w - 0.15) - 0.12, sx * (w - 0.15) + 0.12, 0, h, -0.14, 0.14, blend(0x5d7fa3, RUST, 0.3));
        b.span(sx * (w - 0.15) - 0.3, sx * (w - 0.15) + 0.3, 0, 0.04, -0.4, 0.4, STEEL_D);
        b.bar(sx * (w - 0.3), 0.5, 0, sx * 0.3, 0.5, 0.9, 0.08, STEEL_D);
        b.bar(sx * (w - 0.3), 0.5, 0, sx * 0.3, 0.5, -0.9, 0.08, STEEL_D);
      }
      break;
    case 'shelf':
      shelves(b, o, r);
      break;
    case 'counter':
      b.span(-w, w, 0, h - 0.05, -d, d, shade(WOOD, -0.02));
      b.span(-w - 0.03, w + 0.03, h - 0.05, h, -d - 0.04, d + 0.03, shade(WHITE, -0.06));
      b.span(-w + 0.05, w - 0.05, 0.1, h - 0.2, -d - 0.012, -d, shade(WOOD_L, 0));
      b.box(w - 0.5, h + 0.14, 0.05, 0.42, 0.28, 0.4, STEEL_D);
      b.box(w - 0.5, h + 0.32, 0.0, 0.34, 0.1, 0.2, DARK, { rx: -0.5 });
      break;
    case 'cupboard':
      cabinet(b, o, r, 0xd9cdae);
      break;
    case 'wardrobe':
      cabinet(b, o, r, 0x8a6a48);
      break;
    case 'desk':
    case 'cabinet':
      cabinet(b, o, r, 0x9aa3a6);
      break;
    case 'ktable':
      b.span(-w, w, h - 0.05, h, -d, d, shade(WOOD_L, 0));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.span(sx * (w - 0.07) - 0.03, sx * (w - 0.07) + 0.03, 0, h - 0.05, sz * (d - 0.07) - 0.03, sz * (d - 0.07) + 0.03, WOOD_D);
      // a chair pushed back, another on its side
      b.box(-w - 0.5, 0.23, 0.1, 0.4, 0.46, 0.4, WOOD, { ry: 0.3 });
      b.box(-w - 0.66, 0.68, 0.16, 0.05, 0.46, 0.4, WOOD, { ry: 0.3 });
      b.box(w + 0.5, 0.2, -0.2, 0.4, 0.4, 0.46, WOOD_D, { ry: -0.5 });
      break;
    case 'bed':
      b.span(-w, w, 0.12, 0.3, -d, d, WOOD_D);
      b.span(-w + 0.04, w - 0.04, 0.3, h, -d + 0.04, d - 0.04, 0xd9cdb8);
      b.span(-w, -w + 0.06, 0.12, 0.85, -d, d, WOOD_D);
      b.box(-w + 0.35, h + 0.06, 0, 0.42, 0.12, o.d * 0.6, 0xf2efe6, { ry: 0.1 });
      b.box(0.3, h + 0.02, 0.05, o.w * 0.5, 0.05, o.d * 0.9, 0x8fb7c4, { ry: 0.08 });
      break;
    case 'table':
      picnicTable(b, o, r);
      break;
    case 'bench':
      benchSeat(b, o, r);
      break;
    case 'firering':
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * 6.283 + r.next() * 0.3;
        b.box(Math.cos(a) * 0.58, 0.1, Math.sin(a) * 0.58, 0.28 + 0.1 * r.next(), 0.2 + 0.08 * r.next(), 0.24, shade(STONE, -0.1 + 0.2 * r.next()), { ry: -a + r.next() });
      }
      b.cyl(0, 0.02, 0, 0.45, 0.04, 0x3a3632, { segments: 8 });
      b.bar(-0.3, 0.08, -0.1, 0.3, 0.12, 0.15, 0.09, 0x2f2a26);
      b.bar(-0.1, 0.08, 0.3, 0.15, 0.14, -0.3, 0.08, 0x4a4038);
      break;
    case 'log':
      b.cyl(0, d, 0, d, o.w, shade(WOOD_D, 0.05), { segments: 8, rz: Math.PI / 2 });
      b.cyl(-w - 0.001, d, 0, d * 0.8, 0.01, WOOD_L, { segments: 8, rz: Math.PI / 2 });
      b.cyl(w + 0.001, d, 0, d * 0.8, 0.01, WOOD_L, { segments: 8, rz: Math.PI / 2 });
      break;
    case 'tent': {
      const col = [0xd98a3c, 0x6f9a8a, 0xc9503c, 0x8fa3c4][o.v % 4];
      // a ridge tent, one side sagging
      b.loft([[[-w, 0, -d], [-w, h, 0], [-w, 0, d]], [[w, 0, -d], [w, h * 0.86, 0.1], [w, 0, d]]], blend(col, 0xd8cdb4, 0.25));
      b.bar(-w, 0, 0, -w, h + 0.1, 0, 0.05, WOOD_D);
      b.bar(w, 0, 0.1, w, h * 0.9, 0.1, 0.05, WOOD_D);
      b.bar(-w, h, 0, -w - 0.9, 0, 0, 0.02, 0xd8cdb4);
      b.loft([[[-w - 0.01, 0, -d * 0.5], [-w - 0.01, h * 0.75, 0], [-w - 0.01, 0, 0]]].concat([[[-w - 0.02, 0, -d * 0.5], [-w - 0.02, h * 0.75, 0], [-w - 0.3, 0, 0.2]]]), shade(col, -0.12));
      tuft(b, r, w + 0.3, 0.4, 0);
      break;
    }
    case 'caravan': {
      const col = [0xe9e2cf, 0xbfd3c4, 0xe6d3a8, 0xc9d3dc][o.v % 4];
      const y0 = 0.55;
      b.hull([[-w, y0, -d], [w, y0, -d], [-w, y0, d], [w, y0, d], [-w + 0.25, h, -d + 0.1], [w - 0.4, h, -d + 0.1], [-w + 0.25, h, d - 0.1], [w - 0.4, h, d - 0.1], [-w - 0.05, y0 + 0.7, -d + 0.05], [-w - 0.05, y0 + 0.7, d - 0.05], [w + 0.05, y0 + 0.6, -d + 0.05], [w + 0.05, y0 + 0.6, d - 0.05]], blend(col, RUST, 0.08));
      b.span(-w - 0.02, w + 0.02, y0 + 0.35, y0 + 0.55, -d - 0.012, d + 0.012, [0x4f8a86, 0xc9623f, 0xe0a23c, 0x6f87a8][o.v % 4]);
      b.span(-w + 0.5, -w + 1.5, y0 + 0.8, y0 + 1.3, -d - 0.016, -d + 0.01, 0x3b4a4f);
      b.span(w - 1.5, w - 0.85, y0 + 0.05, h - 0.35, -d - 0.016, -d + 0.01, shade(col, -0.2));
      b.span(-0.3, 0.6, y0 + 0.8, y0 + 1.3, d - 0.01, d + 0.016, 0x3b4a4f);
      wheel(b, -0.2, 0.3, -d + 0.1, 0.3, 0.18, RUST_D);
      wheel(b, -0.2, 0.26, d - 0.1, 0.3, 0.18, RUST_D);
      b.bar(w, y0 + 0.05, 0, w + 1.1, 0.25, 0, 0.07, STEEL_D);
      b.span(w + 0.9, w + 1.05, 0, 0.3, -0.05, 0.05, STEEL_D);
      for (let i = 0; i < 6; i++) tuft(b, r, (r.next() - 0.5) * o.w, (r.next() < 0.5 ? -1 : 1) * (d + 0.15), 0, 1.1);
      rustOn(b, r, 0.5, y0 + 0.15, -d - 0.01, 0.9, 0.2, false);
      break;
    }
    case 'shelter': {
      const coat = COATS[4];
      // a back wall of boards, two posts in front, a roof falling to the back, a bench inside
      b.within(new THREE.Matrix4().makeRotationY(Math.PI).setPosition(0, 0, d - 0.06), () => wall(b, r, -w, w, 0.08, () => h - 0.25, [], coat));
      for (const sx of [-1, 1]) {
        b.span(sx * (w - 0.1) - 0.07, sx * (w - 0.1) + 0.07, 0, h, -d + 0.03, -d + 0.17, WOOD_D);
        b.span(sx * (w - 0.04) - 0.04, sx * (w - 0.04) + 0.04, 0, h - 0.2, -d + 0.1, d - 0.02, shade(coat.wall2, -0.05));
      }
      const n = Math.max(3, Math.round(o.w / 1.05));
      for (let i = 0; i < n; i++) b.box(-w + ((i + 0.5) * o.w) / n, h, 0, o.w / n - 0.02, 0.06, o.d + 0.7, blend(coat.roof, RUST, r.next() * 0.5), { rx: 0.1 });
      b.span(-w + 0.3, w - 0.3, 0.42, 0.47, d - 0.55, d - 0.12, WOOD);
      for (const sx of [-1, 1]) b.span(sx * (w - 0.6) - 0.03, sx * (w - 0.6) + 0.03, 0, 0.42, d - 0.5, d - 0.16, WOOD_D);
      b.box(0, h + 0.12, 0.3, 1.2, 0.04, 0.9, MOSS, { rx: 0.1 });
      for (let i = 0; i < 5; i++) tuft(b, r, (r.next() - 0.5) * o.w, d + 0.15, 0);
      break;
    }
    case 'fence':
      fenceRun(b, o, r, 2, WOOD);
      break;
    case 'rail':
      fenceRun(b, o, r, 2, 0xd9d3c6);
      break;
    case 'mailbox': {
      const col = COATS[o.v % 4].accent;
      b.box(0, h / 2 - 0.1, 0, 0.08, h, 0.08, WOOD_D, { rz: 0.08 });
      b.box(0.04, h + 0.02, 0, 0.3, 0.24, 0.45, blend(col, RUST, 0.25));
      b.box(0.2, h + 0.2, 0.1, 0.02, 0.16, 0.1, 0xc9503c);
      tuft(b, r, -0.15, 0.1, 0);
      break;
    }
    case 'tank': {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.bar(sx * (w - 0.1), 0, sz * (d - 0.1), sx * (w - 0.3), h - 1.3, sz * (d - 0.3), 0.1, blend(STEEL, RUST, 0.5));
      b.span(-w + 0.1, w - 0.1, h - 1.36, h - 1.28, -d + 0.1, d - 0.1, WOOD_D);
      b.cyl(0, h - 0.65, 0, w * 0.82, 1.26, blend(0x8fa7a4, RUST, 0.3), { segments: 12 });
      b.cyl(0, h + 0.06, 0, w * 0.86, 0.16, blend(STEEL, RUST, 0.6), { segments: 12, radiusTop: 0.05 });
      for (const y of [h - 1.1, h - 0.65, h - 0.2]) b.cyl(0, y, 0, w * 0.84, 0.05, STEEL_D, { segments: 12 });
      b.bar(w * 0.8, h - 1.2, 0, w * 0.85, 0.1, 0, 0.06, STEEL_D);
      break;
    }
    case 'woodpile':
      for (let row = 0; row < Math.round(h / 0.22); row++) {
        const n = Math.round(o.w / 0.24) - (row % 2);
        for (let i = 0; i < n; i++) {
          if (row > 2 && r.next() < 0.3) continue;
          b.cyl(-w + 0.14 + i * 0.24 + (row % 2) * 0.12, 0.11 + row * 0.2, 0, 0.11, o.d, shade(WOOD, -0.15 + 0.3 * r.next()), { segments: 6, rx: Math.PI / 2 });
        }
      }
      break;
    case 'line': {
      // a washing line with what was left on it
      for (const sx of [-1, 1]) b.box(sx * w, h / 2, 0, 0.08, h, 0.08, WOOD_D, { rz: sx * 0.05 });
      b.bar(-w, h - 0.05, 0, w, h - 0.05, 0, 0.02, 0xd8cdb4);
      for (let x = -w + 0.5; x < w - 0.6; x += 0.7 + 0.5 * r.next()) {
        if (r.next() < 0.3) continue;
        const cw = 0.4 + 0.4 * r.next();
        const ch = 0.5 + 0.5 * r.next();
        b.box(x + cw / 2, h - 0.07 - ch / 2, 0, cw, ch, 0.015, CLOTHS[(o.v + r.int(CLOTHS.length)) % CLOTHS.length], { rx: (r.next() - 0.5) * 0.3 });
      }
      break;
    }
    case 'patch':
      for (const sz of [-1, 1]) {
        b.span(-w, w, 0, h, sz * d * 0.55 - d * 0.4, sz * d * 0.55 + d * 0.4, SOIL);
        b.span(-w - 0.03, w + 0.03, 0, h + 0.03, sz * d * 0.55 - d * 0.4 - 0.04, sz * d * 0.55 - d * 0.4, WOOD_D);
        b.span(-w - 0.03, w + 0.03, 0, h + 0.03, sz * d * 0.55 + d * 0.4, sz * d * 0.55 + d * 0.4 + 0.04, WOOD_D);
        for (let x = -w + 0.3; x < w - 0.2; x += 0.45) if (r.next() < 0.75) tuft(b, r, x, sz * d * 0.55 + (r.next() - 0.5) * 0.4, h, 1.3);
      }
      break;
    case 'trolley':
      for (const sx of [-1, 1]) {
        b.bar(sx * w, 0.3, -d, sx * w, 0.3, d, 0.03, STEEL);
        b.bar(sx * w, 0.75, -d, sx * w, 0.75, d, 0.03, STEEL);
        b.bar(sx * w, 0.3, -d, sx * w, 0.75, -d, 0.03, STEEL);
        b.bar(sx * w, 0.3, d, sx * w, 0.75, d, 0.03, STEEL);
      }
      for (const sz of [-1, 0, 1]) b.bar(-w, 0.3, sz * d, w, 0.3, sz * d, 0.03, STEEL);
      b.bar(-w, 0.75, -d, w, 0.75, -d, 0.03, STEEL);
      b.bar(-w, 0.75, d, w, 0.75, d, 0.03, STEEL);
      b.bar(-w, 0.75, -d, -w - 0.25, h, -d, 0.03, STEEL_D);
      b.bar(-w, 0.75, d, -w - 0.25, h, d, 0.03, STEEL_D);
      b.bar(-w - 0.25, h, -d, -w - 0.25, h, d, 0.04, 0xc9503c);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(sx * (w - 0.08), 0.07, sz * (d - 0.05), 0.07, 0.04, DARK, { segments: 6, rx: Math.PI / 2 });
      break;
    case 'jetty': {
      // boards across, one gone; posts in pairs down into the water, a brace between each pair
      const nb = Math.round(o.w / 0.32);
      for (let i = 0; i < nb; i++) {
        if (i > 3 && r.next() < 0.07) continue;
        b.box(-w + (i + 0.5) * (o.w / nb), -0.04, (r.next() - 0.5) * 0.06, o.w / nb - 0.03, 0.06, o.d + (r.next() - 0.5) * 0.12, shade(WOOD_L, -0.2 + 0.25 * r.next()), { ry: (r.next() - 0.5) * 0.04 });
      }
      for (const sz of [-1, 1]) b.span(-w, w, -0.2, -0.07, sz * (d - 0.1) - 0.05, sz * (d - 0.1) + 0.05, WOOD_D);
      for (let x = -w + 0.4; x <= w; x += 2.2) {
        for (const sz of [-1, 1]) b.cyl(x, -h / 2 + 0.25, sz * (d - 0.05), 0.09, h + 0.9, shade(WOOD_D, -0.1), { segments: 6 });
        b.bar(x, -0.2, -d + 0.05, x, -h * 0.7, d - 0.05, 0.06, WOOD_D);
      }
      // mooring posts at the end; and at the landward end two tall ones with a pennant, to find it by from the road
      b.cyl(w - 0.2, 0.35, d - 0.05, 0.1, 0.9, WOOD_D, { segments: 6 });
      b.cyl(w - 0.2, 0.35, -d + 0.05, 0.1, 0.9, WOOD_D, { segments: 6 });
      b.box(-w + 0.2, 1.7, d + 0.1, 0.12, 4.2, 0.12, WOOD_D, { rx: 0.03 });
      b.box(-w + 0.2, 1.5, -d - 0.1, 0.12, 3.8, 0.12, WOOD_D, { rx: -0.04 });
      b.bar(-w + 0.2, 3.1, -d - 0.1, -w + 0.2, 3.25, d + 0.1, 0.07, WOOD);
      b.box(-w + 0.2, 3.45, d + 0.55, 0.02, 0.5, 0.8, 0x4a7fa8, { rx: 0.25 });
      b.box(-w + 0.2, 2.75, 0, 0.04, 0.5, 0.9, WHITE);
      b.box(-w + 0.17, 2.75, 0, 0.02, 0.2, 0.5, 0x4a7fa8);
      break;
    }
    case 'boat': {
      const col = [0x5f9a94, 0xc9503c, 0xe6dcc0][o.v % 3];
      // pulled up on the beach, heeled a little
      b.within(new THREE.Matrix4().makeRotationX(0.22), () => {
        b.hull([[-w, h, -d * 0.75], [-w, h, d * 0.75], [w * 0.35, h, -d], [w * 0.35, h, d], [w, h + 0.1, 0], [-w, 0.12, -d * 0.4], [-w, 0.12, d * 0.4], [w * 0.4, 0.02, -d * 0.45], [w * 0.4, 0.02, d * 0.45], [w * 0.85, 0.25, 0]], blend(col, 0xd8cdb4, 0.2));
        b.span(-w + 0.03, w * 0.5, h - 0.02, h + 0.02, -d * 0.7, d * 0.7, shade(WOOD_D, -0.2));
        for (const x of [-w * 0.5, w * 0.1]) b.span(x - 0.1, x + 0.1, h - 0.06, h + 0.03, -d * 0.85, d * 0.85, WOOD_L);
        b.bar(-w * 0.6, h + 0.08, d * 0.3, w * 0.7, h + 0.1, d * 0.9, 0.05, WOOD);
      });
      break;
    }
    case 'rack':
      for (const sx of [-1, 1]) {
        b.bar(sx * w, 0, -0.3, sx * w, h, 0, 0.07, WOOD_D);
        b.bar(sx * w, 0, 0.3, sx * w, h, 0, 0.07, WOOD_D);
      }
      b.bar(-w - 0.15, h - 0.04, 0, w + 0.15, h - 0.04, 0, 0.07, WOOD);
      if (o.v === 1) for (let x = -w + 0.3; x < w - 0.2; x += 0.35) if (r.next() < 0.7) b.box(x, h - 0.32, 0, 0.09, 0.42, 0.03, [0xb9c3c6, 0xa9a27a, 0xc9a08a][r.int(3)], { rz: (r.next() - 0.5) * 0.3 });
      break;
    case 'tacklebox':
      b.span(-w, w, 0, h * 0.7, -d, d, 0x5f8a6a);
      b.box(0, h * 0.85, -d * 0.6, o.w, 0.03, o.d, 0x4f7558, { rx: -0.7 });
      b.cyl(w + 0.25, 0.12, 0, 0.1, 0.24, 0xd9d3c6, { segments: 8 });
      break;
    case 'icehole':
      b.cyl(0, 0.012, 0, w, 0.02, 0x16303f, { segments: 10 });
      for (let i = 0; i < 6; i++) {
        const a = r.next() * 6.283;
        b.box(Math.cos(a) * (w + 0.15), 0.05, Math.sin(a) * (w + 0.15), 0.18, 0.1, 0.14, 0xe6f0f6, { ry: a });
      }
      break;
    case 'stand': {
      const coat = COATS[4];
      const deck = h;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) b.bar(sx * (w + 0.12), 0, sz * (d + 0.12), sx * (w - 0.12), deck + 2.0, sz * (d - 0.12), 0.12, WOOD_D);
        b.bar(sx * w, 0.3, -d, sx * w, deck - 0.2, d, 0.07, WOOD);
        b.bar(-w, 0.3, sx * d, w, deck - 0.2, sx * d, 0.07, WOOD);
      }
      const nb = Math.round(o.w / 0.3);
      for (let i = 0; i < nb; i++) b.span(-w + (i * o.w) / nb + 0.01, -w + ((i + 1) * o.w) / nb - 0.01, deck - 0.1, deck, -d, d, shade(WOOD_L, -0.2 + 0.25 * r.next()));
      // boarded to the waist on three sides, open to the front above; a roof of sheets
      b.within(new THREE.Matrix4().makeRotationY(Math.PI).setPosition(0, deck, d - 0.04), () => wall(b, r, -w, w, 0.06, () => 1.0, [], coat));
      for (const side of [-1, 1]) {
        ROT_SIDE.makeRotationY(side < 0 ? Math.PI / 2 : -Math.PI / 2).setPosition(side * (w - 0.04), deck, 0);
        b.within(ROT_SIDE, () => wall(b, r, -d, d, 0.06, () => 1.0, [], coat));
      }
      b.span(0.1, w, deck, deck + 1.0, -d, -d + 0.06, shade(coat.wall, -0.05));
      for (let i = 0; i < 3; i++) b.box(-w + (i + 0.5) * (o.w / 3), deck + 2.05, 0, o.w / 3 + 0.1, 0.06, o.d + 0.8, blend(coat.roof, RUST, r.next() * 0.5), { rx: 0.14 });
      // the stairs up the front, at the left
      const steps = Math.ceil(deck / 0.24);
      for (let i = 1; i < steps; i++) b.span(-w, -w + 1.0, (deck * i) / steps - 0.05, (deck * i) / steps, -d - (steps - i) * 0.28, -d - (steps - i) * 0.28 + 0.28, shade(WOOD, -0.1 + 0.15 * r.next()));
      b.bar(-w, 0, -d - (steps - 1) * 0.28, -w, deck - 0.1, -d, 0.08, WOOD_D);
      b.bar(-w + 1.0, 0, -d - (steps - 1) * 0.28, -w + 1.0, deck - 0.1, -d, 0.08, WOOD_D);
      b.bar(-w, 0.95, -d - (steps - 1) * 0.28, -w, deck + 0.95, -d, 0.05, WOOD);
      break;
    }
    case 'bag':
      b.sphere(0, h * 0.42, 0, h * 0.5, 0x8a7a58);
      b.cyl(0, h * 0.9, 0, 0.08, 0.14, 0x6f6146, { segments: 6 });
      break;
    case 'trough':
      b.span(-w, w, h - 0.22, h, -d, d, WOOD);
      b.span(-w + 0.05, w - 0.05, h - 0.05, h - 0.02, -d + 0.05, d - 0.05, 0x5a4a3c);
      for (const sx of [-1, 1]) {
        b.bar(sx * (w - 0.2), h - 0.2, 0, sx * (w - 0.1), 0, -d - 0.1, 0.07, WOOD_D);
        b.bar(sx * (w - 0.2), h - 0.2, 0, sx * (w - 0.1), 0, d + 0.1, 0.07, WOOD_D);
      }
      // the salt lick: a pale block on a post beside it
      b.box(w + 0.6, 0.45, 0.1, 0.1, 0.9, 0.1, WOOD_D);
      b.box(w + 0.6, 0.98, 0.1, 0.22, 0.2, 0.22, 0xf0ece0);
      break;
    case 'lighthouse':
      lighthouse(b, o, r);
      break;
    case 'wallrun':
      wallRun(b, o, r);
      break;
    case 'pipes':
      pipeRun(b, o, r);
      break;
    case 'silo':
      silo(b, o, r);
      break;
    case 'scope':
      b.cyl(0, 0.5, 0, 0.07, 1.0, STEEL_D, { segments: 8 });
      b.cyl(0, 0.03, 0, 0.2, 0.06, STEEL_D, { segments: 8 });
      b.box(0, 1.1, 0, 0.16, 0.22, 0.16, blend(0x4f7f8a, RUST, 0.2));
      b.cyl(0, 1.28, 0.05, 0.085, 0.5, blend(0x4f7f8a, RUST, 0.2), { segments: 8, rx: Math.PI / 2 - 0.12 });
      b.cyl(0, 1.31, 0.31, 0.07, 0.03, DARK, { segments: 8, rx: Math.PI / 2 - 0.12 });
      break;
    default:
      b.span(-w, w, 0, h, -d, d, CONCRETE);
  }
}

// ---------------------------------------------------------------------------------------------- one site

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const V = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);

/**
 * The mesh of one site, in pieces: a few objects at a time so that no frame waits for a whole
 * filling station. Geometry is relative to the site's anchor (site.x, site.y, site.z).
 */
export function* siteSlices(site: Site): Slices<THREE.BufferGeometry> {
  const b = new PaintBuilder();
  for (let i = 0; i < site.objects.length; i++) {
    const o = site.objects[i];
    // object frame → world: x along (cos yaw, sin yaw), z across; a wreck's lean on top
    E.set(o.roll, -o.yaw, o.pitch, 'YZX');
    Q.setFromEuler(E);
    M.compose(V.set(o.x - site.x, o.y - site.y, o.z - site.z), Q, ONE);
    b.within(M, () => draw(b, o, new Rng(hash2(site.seed, i, 0xd7a3)), site.biome));
    yield;
  }
  return b.build();
}

/** triangles of a built site (for the budget checks) */
export function siteTriangles(g: THREE.BufferGeometry): number {
  return g.getAttribute('position').count / 3;
}
