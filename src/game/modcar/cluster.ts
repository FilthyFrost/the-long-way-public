/**
 * The instruments in the cab (docs/V3/plan/finish.md §五), built as Nomad Drive's are: a binnacle let into the
 * dashboard — a curved cowl reaching out over the dials, its cheeks sweeping back down its sides — and in it a dark
 * fascia with the dials sunk in it, each at the bottom of its own cup with a thin ring at the lip, behind a lens.
 *
 * The speedometer and the rev counter in their cups, and between them a recessed panel with the fuel and coolant
 * gauges (quarter dials, as Nomad Drive's), the display (the time, the air outside, the gear, the speed, the distance,
 * the four tyres) and the warning and indicator lamps; or four round dials across (the fuel and the coolant outside the
 * big two), as the older cars have them; a motorcycle's two clocks in the cans its frame already has. Faces, scales,
 * symbols and their meaning as a real cluster's (core/modcar/instruments.ts, clusterArt.ts).
 *
 * The binnacle's shell is the vehicle's own: drawn in the cab's own plastics (the car materials 'plastic_int', 'trim'
 * and 'alu'), it is put in the frame's model beside the cluster and merged with it like any of its parts. What moves
 * or lights — the faces, the needles, the lamps, the display, the lens — is the cluster's own node (CLUSTER_NODE),
 * never merged. The frame's own instrument pod and dials are cut out of its model where the binnacle goes (spec.cut).
 *
 * Footprint and anchoring (for the frames' dash panels to be shaped round it): the cluster's space has its origin at the
 * middle of the faces, x across to the driver's right, y up the faces and z out of them towards the driver's eye; it
 * is placed at the frame's own two big dials' midpoint (their needles' pivots) moved by spec.at, turned as their
 * plane is (the needles' axis out of it). `Cluster.footprint` gives its box in that space.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Dash } from '../../core/modcar/systems';
import { LAMP_HEX, LAMP_IDS, LAMP_INFO, type LampId, NEEDLE_TAU, type NeedleKind, needleAngle, needleFrac, type RpmScale, rpmScale, type SpeedScale, speedScale, Telltales } from '../../core/modcar/instruments';
import { GLSL_FRAGMENT_PARS, GLSL_VERTEX_MAIN, GLSL_VERTEX_PARS } from '../render/shaderlib';
import { maskPreservingBlend, surfaceMaterial } from '../render/materials';
import { ART, drawBigDial, drawIconSheet, drawLcd, drawScreen, drawSmallDial, roundRect, type ScreenData, type Sheet, symbol } from './clusterArt';

export type ClusterStyle = 'twin' | 'quad' | 'sport' | 'bike';

export interface ClusterSpec {
  style: ClusterStyle;
  /** the layout's size against its own (1: as drawn) */
  scale?: number;
  /**
   * The faces' middle from the frame's own two big dials' midpoint: across, up, out of their plane (m; default
   * 1.8 cm behind it, where the frame's own pod was)
   */
  at?: [number, number, number];
  /**
   * The faces turned about their own across axis from the frame's own dials' plane (degrees, the top towards the
   * driver): so that they face the driver's eye, as Nomad Drive's do (within a few degrees of the line to it)
   */
  tilt?: number;
  /**
   * What of the frame's own instruments is cut out of its model: boxes in its two big dials' space (x across, y up, z
   * out, about their midpoint; m) — x0, x1, y0, y1, z0, z1. A triangle wholly inside one goes. Only while the frame
   * still has its own dials (a 'gauge' face in its model).
   */
  cut?: [number, number, number, number, number, number][];
  /** how far the cowl reaches out over the faces (m at scale 1) */
  hood?: number;
  /**
   * Where the display goes in the panel between the big dials: 'low' under the fuel and coolant gauges (the twin's
   * default), 'high' just under the indicators (the quad's default) — whichever the wheel's rim leaves in sight
   */
  screen?: 'high' | 'low';
  /**
   * The row of warning lamps along the panel's top, just under the indicators, rather than along its foot (where the
   * wheel's hub or rim would hide it); on the quad a shorter panel, the display under the row and the fascia bare under it
   */
  warnTop?: boolean;
}

/** the cluster's node in the vehicle's model: left out of every merge (carView.ts) */
export const CLUSTER_NODE = 'cluster';
/** the binnacle's shell, merged with the frame */
export const BINNACLE_NODE = 'binnacle';

/** a big dial: its face's middle and radius (cm) */
export interface BigDial {
  kind: 'speed' | 'rpm';
  x: number;
  y: number;
  r: number;
}

/** a fuel or coolant gauge: a quarter dial about its pivot (r its arc's radius), or a round one about its middle (r its face's) */
export interface SmallDial {
  kind: 'fuel' | 'temp';
  form: 'quarter' | 'round';
  x: number;
  y: number;
  r: number;
}

/** a recess in the fascia: a round cup (w = h, its diameter) or a panel with rounded corners; its floor is a face */
export interface Well {
  x: number;
  y: number;
  w: number;
  h: number;
  round: boolean;
}

/** a lamp's symbol and its size (cm) */
export interface LampSpot {
  id: LampId;
  x: number;
  y: number;
  s: number;
}

/** a screen: the display between the dials ('tft'), or a motorcycle's little ones in its dials ('odo', 'gear') */
export interface ScreenSpot {
  kind: 'tft' | 'odo' | 'gear';
  x: number;
  y: number;
  w: number;
  h: number;
}

/** a cluster laid out, in centimetres about the faces' middle (x to the driver's right, y up) */
export interface Layout {
  /** the faces' rectangle */
  w: number;
  h: number;
  big: BigDial[];
  small: SmallDial[];
  wells: Well[];
  lamps: LampSpot[];
  screens: ScreenSpot[];
  bike: boolean;
}

/** how deep the cups are (cm: Nomad Drive's speedometer cup is 2.1 cm deep) and the flare at their lip */
const CUP_DEPTH = 2.2;
const CUP_FLARE = 0.3;
/** a cup's wall clear of its face (cm) */
const CUP_CLEAR = 0.2;

/**
 * A cluster's layout. `speedLeft`: the speedometer is the left of the two big dials (as the frame had its own);
 * `sep`: a motorcycle's two clocks this far apart (cm, its frame's own).
 */
export function layoutOf(style: ClusterStyle, speedLeft = true, sep = 14.1, screen?: 'high' | 'low', warnTop = false): Layout {
  if (style === 'bike') return bikeLayout(speedLeft, sep);
  return style === 'quad' ? quadLayout(speedLeft, (screen ?? 'high') === 'high', warnTop) : twinLayout(speedLeft, style === 'sport', screen === 'high', warnTop);
}

function cupOf(d: { x: number; y: number; r: number }): Well {
  const rw = d.r + CUP_CLEAR;
  return { x: d.x, y: d.y, w: 2 * rw, h: 2 * rw, round: true };
}

/**
 * The speedometer and the rev counter in their cups either side of a panel (Nomad Drive's Rv-C): along the panel's top
 * the indicators and the beams, under them the fuel and coolant quarter dials, then the display, then a row of the
 * warning lamps (or that row under the indicators, the gauges and the display under it: `warnTop`). 'sport': the rev
 * counter the bigger.
 */
function twinLayout(speedLeft: boolean, sport: boolean, screenHigh: boolean, warnTop = false): Layout {
  const rSpeed = sport ? 5.2 : 5.6;
  const rRpm = sport ? 6.0 : 5.6;
  const cw = 11.4;
  const gap = 0.55;
  const rL = (speedLeft ? rSpeed : rRpm) + CUP_CLEAR + CUP_FLARE;
  const rR = (speedLeft ? rRpm : rSpeed) + CUP_CLEAR + CUP_FLARE;
  const xL = -(cw / 2 + gap + rL);
  const xR = cw / 2 + gap + rR;
  const big: BigDial[] = [
    { kind: speedLeft ? 'speed' : 'rpm', x: xL, y: 0, r: rL - CUP_CLEAR - CUP_FLARE },
    { kind: speedLeft ? 'rpm' : 'speed', x: xR, y: 0, r: rR - CUP_CLEAR - CUP_FLARE },
  ];
  const ph = 10.8;
  const top = ph / 2;
  // (along the top the indicators, the beams and the parking brake — the lamp most asked after when the vehicle will
  // not move — where the wheel's rim leaves them in sight most often; the warnings along the foot)
  const lamps: LampSpot[] = [
    { id: 'turnL', x: -cw / 2 + 1.0, y: top - 0.9, s: 1.35 },
    { id: 'low', x: -2.0, y: top - 0.9, s: 1.2 },
    { id: 'high', x: 0, y: top - 0.9, s: 1.2 },
    { id: 'park', x: 2.0, y: top - 0.9, s: 1.25 },
    { id: 'turnR', x: cw / 2 - 1.0, y: top - 0.9, s: 1.35 },
  ];
  const row: LampId[] = ['brake', 'oil', 'charge', 'coolant', 'fuel', 'engine', 'tyre'];
  const pitch = (cw - 0.7) / row.length;
  row.forEach((id, i) => lamps.push({ id, x: -cw / 2 + 0.35 + pitch * (i + 0.5), y: warnTop ? top - 2.4 : -top + 0.8, s: 1.18 }));
  const rq = 2.75;
  // (the gauges under the indicators and the display under them, or the display there and the gauges under it; with
  // the warnings along the top all of it lower, into the room the foot's row leaves)
  const qy = screenHigh ? -top + 2.45 - (warnTop ? 1.25 : 0) : top - 1.85 - rq - (warnTop ? 1.45 : 0);
  const small: SmallDial[] = [
    { kind: 'fuel', form: 'quarter', x: -0.95, y: qy, r: rq },
    { kind: 'temp', form: 'quarter', x: cw / 2 - 1.15, y: qy, r: rq },
  ];
  const screens: ScreenSpot[] = [{ kind: 'tft', x: 0, y: screenHigh ? top - 1.75 - 1.55 - (warnTop ? 1.45 : 0) : -top + 1.6 + 1.55 - (warnTop ? 1.25 : 0), w: cw - 0.9, h: 3.1 }];
  const wells: Well[] = [cupOf(big[0]), cupOf(big[1]), { x: 0, y: 0, w: cw, h: ph, round: false }];
  return centred({ w: 0, h: 0, big, small, wells, lamps, screens, bike: false });
}

/**
 * Four round dials across, as the older cars have them: the fuel and the coolant outside the speedometer and the rev
 * counter, a panel between the big two with the indicators and the beams, the display and two rows of lamps — or
 * (`warnTop`) a shorter panel along the top between them, the indicators, one row of the warnings and the display, the
 * fascia bare under it where the wheel's hub would hide it.
 */
function quadLayout(speedLeft: boolean, screenHigh: boolean, warnTop = false): Layout {
  const R = 5.2;
  const rs = 2.45;
  const cw = 9.6;
  const gap = 0.5;
  const cup = R + CUP_CLEAR + CUP_FLARE;
  const scup = rs + CUP_CLEAR + CUP_FLARE;
  const xb = cw / 2 + gap + cup;
  const xs = xb + cup + gap + scup;
  const big: BigDial[] = [
    { kind: speedLeft ? 'speed' : 'rpm', x: -xb, y: 0, r: R },
    { kind: speedLeft ? 'rpm' : 'speed', x: xb, y: 0, r: R },
  ];
  const sy = 0.9;
  const small: SmallDial[] = [
    { kind: 'fuel', form: 'round', x: -xs, y: sy, r: rs },
    { kind: 'temp', form: 'round', x: xs, y: sy, r: rs },
  ];
  const ph = 10.4;
  const top = ph / 2;
  const lamps: LampSpot[] = [
    { id: 'turnL', x: -cw / 2 + 0.95, y: top - 0.85, s: 1.3 },
    { id: 'low', x: -1.75, y: top - 0.85, s: 1.15 },
    { id: 'high', x: 0, y: top - 0.85, s: 1.15 },
    { id: 'park', x: 1.75, y: top - 0.85, s: 1.2 },
    { id: 'turnR', x: cw / 2 - 0.95, y: top - 0.85, s: 1.3 },
  ];
  if (warnTop) {
    // (the panel 7.6 high from the same top: the indicators, the seven warnings in a row, the display)
    const row: LampId[] = ['brake', 'oil', 'charge', 'coolant', 'fuel', 'engine', 'tyre'];
    const p7 = (cw - 0.6) / row.length;
    row.forEach((id, i) => lamps.push({ id, x: -cw / 2 + 0.3 + p7 * (i + 0.5), y: top - 2.3, s: 1.12 }));
    const ph2 = 7.6;
    const screens2: ScreenSpot[] = [{ kind: 'tft', x: 0, y: top - 2.3 - 0.75 - 1.6, w: cw - 0.8, h: 3.2 }];
    const wells2: Well[] = [cupOf(big[0]), cupOf(big[1]), cupOf(small[0]), cupOf(small[1]), { x: 0, y: top - ph2 / 2, w: cw, h: ph2, round: false }];
    return centred({ w: 0, h: 0, big, small, wells: wells2, lamps, screens: screens2, bike: false });
  }
  const rows: LampId[][] = [
    ['brake', 'oil', 'charge', 'coolant'],
    ['fuel', 'engine', 'tyre'],
  ];
  const pitch = (cw - 0.8) / 4;
  // (two rows of lamps under the display, or under the indicators with the display under them)
  const rowY = (j: number): number => (screenHigh ? -top + 0.85 + (1 - j) * 1.75 : top - 2.55 - j * 1.75);
  rows.forEach((r, j) => r.forEach((id, i) => lamps.push({ id, x: -cw / 2 + 0.4 + pitch * (i + 0.5), y: rowY(j), s: 1.3 })));
  const screens: ScreenSpot[] = [{ kind: 'tft', x: 0, y: screenHigh ? top - 1.75 - 1.75 : -top + 0.4 + 1.75, w: cw - 0.8, h: 3.5 }];
  const wells: Well[] = [cupOf(big[0]), cupOf(big[1]), cupOf(small[0]), cupOf(small[1]), { x: 0, y: 0, w: cw, h: ph, round: false }];
  return centred({ w: 0, h: 0, big, small, wells, lamps, screens, bike: false });
}

/**
 * A motorcycle's two clocks, in the chrome cans of its frame: each face where the frame's own was, a little screen in
 * each (the distance and a fuel bar; the gear and a coolant bar) and three lamps along its foot.
 */
function bikeLayout(speedLeft: boolean, sep: number): Layout {
  const r = 3.6;
  const xs = (speedLeft ? -1 : 1) * (sep / 2);
  const xr = -xs;
  const big: BigDial[] = [
    { kind: 'speed', x: xs, y: 0, r },
    { kind: 'rpm', x: xr, y: 0, r },
  ];
  const ly = -r * 0.7;
  const lamps: LampSpot[] = [
    { id: 'turnL', x: xs - r * 0.36, y: ly, s: 0.78 },
    { id: 'high', x: xs, y: ly - 0.12, s: 0.72 },
    { id: 'fuel', x: xs + r * 0.36, y: ly, s: 0.72 },
    { id: 'oil', x: xr - r * 0.36, y: ly, s: 0.72 },
    { id: 'coolant', x: xr, y: ly - 0.12, s: 0.72 },
    { id: 'turnR', x: xr + r * 0.36, y: ly, s: 0.78 },
  ];
  const screens: ScreenSpot[] = [
    { kind: 'odo', x: xs, y: -r * 0.36, w: r * 0.95, h: r * 0.27 },
    { kind: 'gear', x: xr, y: -r * 0.36, w: r * 0.95, h: r * 0.27 },
  ];
  const wells: Well[] = big.map((d) => ({ x: d.x, y: d.y, w: 2 * d.r, h: 2 * d.r, round: true }));
  const l: Layout = { w: 0, h: 0, big, small: [], wells, lamps, screens, bike: true };
  const ext = extent(l);
  l.w = 2 * Math.max(Math.abs(ext.x0), Math.abs(ext.x1));
  l.h = 2 * Math.max(Math.abs(ext.y0), Math.abs(ext.y1));
  return l;
}

function extent(l: Layout): { x0: number; x1: number; y0: number; y1: number } {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const w of l.wells) {
    const fx = w.round ? CUP_FLARE : CUP_FLARE;
    x0 = Math.min(x0, w.x - w.w / 2 - fx);
    x1 = Math.max(x1, w.x + w.w / 2 + fx);
    y0 = Math.min(y0, w.y - w.h / 2 - fx);
    y1 = Math.max(y1, w.y + w.h / 2 + fx);
  }
  return { x0, x1, y0, y1 };
}

/** the layout moved so that its wells' extent is about its middle, and its size */
function centred(l: Layout): Layout {
  const e = extent(l);
  const ox = (e.x0 + e.x1) / 2;
  const oy = (e.y0 + e.y1) / 2;
  for (const a of [l.big, l.small, l.wells, l.lamps, l.screens] as { x: number; y: number }[][])
    for (const p of a) {
      p.x -= ox;
      p.y -= oy;
    }
  l.w = e.x1 - e.x0;
  l.h = e.y1 - e.y0;
  return l;
}

// ------------------------------------------------------------------ shapes (cm)

type P2 = THREE.Vector2;

/** a rounded rectangle's outline about (cx, cy), counter-clockwise, `n` points a corner */
export function roundRectLoop(cx: number, cy: number, w: number, h: number, r: number, n = 8): P2[] {
  const rr = Math.min(r, w / 2, h / 2);
  const pts: P2[] = [];
  const corners: [number, number, number][] = [
    [cx + w / 2 - rr, cy - h / 2 + rr, -Math.PI / 2],
    [cx + w / 2 - rr, cy + h / 2 - rr, 0],
    [cx - w / 2 + rr, cy + h / 2 - rr, Math.PI / 2],
    [cx - w / 2 + rr, cy - h / 2 + rr, Math.PI],
  ];
  for (const [x, y, a0] of corners) for (let i = 0; i <= n; i++) {
    const a = a0 + (Math.PI / 2) * (i / n);
    pts.push(new THREE.Vector2(x + Math.cos(a) * rr, y + Math.sin(a) * rr));
  }
  return pts;
}

function circleLoop(cx: number, cy: number, r: number, n: number): P2[] {
  const pts: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return pts;
}

/** a closed counter-clockwise outline pushed out by `d(i)` along its outward normals */
function offsetLoop(loop: P2[], d: (i: number) => number): P2[] {
  const n = loop.length;
  return loop.map((p, i) => {
    const a = loop[(i + n - 1) % n];
    const b = loop[(i + 1) % n];
    const t = new THREE.Vector2().subVectors(b, a).normalize();
    // (counter-clockwise: the outside is to the right of the way round)
    return new THREE.Vector2(p.x + t.y * d(i), p.y - t.x * d(i));
  });
}

function wellLoop(w: Well, grow = 0): P2[] {
  return w.round ? circleLoop(w.x, w.y, w.w / 2 + grow, 48) : roundRectLoop(w.x, w.y, w.w + 2 * grow, w.h + 2 * grow, 1.1 + grow, 6);
}

/**
 * A wall lofted through rings of points (each the same length, closed loops), `rings[k][i]` at depth `zs[k][i]`; its
 * faces turned towards `inward` (true: towards the loops' middle).
 */
function loft(rings: P2[][], zs: number[][], inward: boolean): THREE.BufferGeometry {
  const n = rings[0].length;
  const pos: number[] = [];
  for (let k = 0; k < rings.length; k++) for (let i = 0; i < n; i++) pos.push(rings[k][i].x, rings[k][i].y, zs[k][i]);
  const idx: number[] = [];
  for (let k = 0; k < rings.length - 1; k++)
    for (let i = 0; i < n; i++) {
      const a = k * n + i;
      const b = k * n + ((i + 1) % n);
      const c = (k + 1) * n + i;
      const d = (k + 1) * n + ((i + 1) % n);
      // (rings run from the back to the front: counter-clockwise loops face outward this way round)
      if (inward) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** a flat shape at depth z, its face towards +z (or −z) */
function flat(outer: P2[], holes: P2[][], z: number, back = false): THREE.BufferGeometry {
  const sh = new THREE.Shape(outer);
  for (const h of holes) sh.holes.push(new THREE.Path([...h].reverse()));
  const g = new THREE.ShapeGeometry(sh, 1);
  g.translate(0, 0, z);
  if (back) {
    const ix = g.getIndex()!;
    for (let i = 0; i < ix.count; i += 3) {
      const t = ix.getX(i + 1);
      ix.setX(i + 1, ix.getX(i + 2));
      ix.setX(i + 2, t);
    }
    const nm = g.getAttribute('normal');
    for (let i = 0; i < nm.count; i++) nm.setZ(i, -nm.getZ(i));
  }
  return g;
}

/** a placeholder material: the car's own takes its place by its name (materials.ts applyMaterials) */
function carMat(name: string): THREE.Material {
  return new THREE.MeshBasicMaterial({ name });
}

/** the binnacle's shell: what of it is in which of the cab's materials */
interface Shell {
  group: THREE.Group;
  /** its box in the cluster's space (cm) */
  box: THREE.Box3;
}

/**
 * The binnacle's shell (cm, in the cluster's space): the fascia with the cups and the panel sunk in it, each cup's
 * ring at its lip; round them the housing — its opening a rounded outline arched up along its top, its wall out to a
 * lip that reaches furthest over the top (the cowl) and least along the foot, rolled over and back to the dashboard,
 * closed behind.
 */
function buildShell(l: Layout, hood: number): Shell {
  const group = new THREE.Group();
  group.name = BINNACLE_NODE;
  const zF = CUP_DEPTH;
  const parts: Record<string, THREE.BufferGeometry[]> = { plastic_int: [], trim: [], alu: [] };
  // the wells: a wall from the face up to the fascia, flared at the lip, a ring round the lip
  for (const w of l.wells) {
    const inner = wellLoop(w);
    const lip = wellLoop(w, CUP_FLARE);
    const n = inner.length;
    const z0 = new Array(n).fill(-0.05);
    const z1 = new Array(n).fill(zF - CUP_FLARE);
    const z2 = new Array(n).fill(zF);
    parts.trim.push(loft([inner, inner], [z0, z1], true));
    parts.alu.push(loft([inner, lip], [z1, z2], true));
    // the ring: a little tube round the lip
    const ring: P2[][] = [];
    const rz: number[][] = [];
    const tube = 0.2;
    for (let k = 0; k <= 6; k++) {
      const a = Math.PI * (k / 6);
      ring.push(wellLoop(w, CUP_FLARE - tube * Math.cos(a)));
      rz.push(new Array(n).fill(zF + tube * Math.sin(a) * 0.9));
    }
    parts.alu.push(loft(ring, rz, false));
  }
  // the housing's opening: round the wells, its corners well rounded, its top arched up
  const e = extent(l);
  const m = 0.75;
  const ow = e.x1 - e.x0 + 2 * m;
  const oh = e.y1 - e.y0 + 2 * m;
  const cx = (e.x0 + e.x1) / 2;
  const cy = (e.y0 + e.y1) / 2;
  const arch = Math.min(1.6, oh * 0.13);
  const open = roundRectLoop(cx, cy, ow, oh, Math.min(oh * 0.42, 4.2), 10).map((p) => {
    const u = (p.x - cx) / (ow / 2);
    const up = Math.max(0, (p.y - cy) / (oh / 2));
    return new THREE.Vector2(p.x, p.y + arch * Math.max(0, 1 - u * u) * up);
  });
  // the fascia: the opening with the wells' lips cut out of it
  parts.trim.push(flat(open, l.wells.map((w) => wellLoop(w, CUP_FLARE)), zF));
  // the housing's wall: out from the fascia to the lip — the cowl over the top reaching `hood`, the foot a sill —
  // rolled over, and back along its outside to the dashboard
  const n = open.length;
  let yTop = -Infinity;
  let yBot = Infinity;
  for (const p of open) {
    yTop = Math.max(yTop, p.y);
    yBot = Math.min(yBot, p.y);
  }
  const sill = 0.5;
  const reach = open.map((p) => {
    const t = (p.y - yBot) / (yTop - yBot);
    const u = (p.x - cx) / (ow / 2);
    return zF + sill + (hood - sill) * Math.pow(t, 1.7) * (1 - 0.4 * u * u);
  });
  const thick = open.map((p) => {
    const t = (p.y - yBot) / (yTop - yBot);
    return 0.75 + 1.0 * Math.max(0, Math.min(1, (t - 0.45) / 0.55));
  });
  const outer = offsetLoop(open, (i) => thick[i]);
  const back = -4.6;
  const rings: P2[][] = [open, open];
  const zs: number[][] = [new Array(n).fill(zF - 0.05), reach];
  // the lip rolled over: half round, its middle a little forward
  for (let k = 1; k < 6; k++) {
    const a = Math.PI * (k / 6);
    const f = (1 - Math.cos(a)) / 2;
    rings.push(open.map((p, i) => new THREE.Vector2(p.x + (outer[i].x - p.x) * f, p.y + (outer[i].y - p.y) * f)));
    zs.push(reach.map((z, i) => z + Math.sin(a) * thick[i] * 0.45));
  }
  rings.push(outer, outer);
  zs.push(reach.slice(), new Array(n).fill(back));
  parts.plastic_int.push(loft(rings, zs, true));
  parts.plastic_int.push(flat(outer, [], back, true));
  const box = new THREE.Box3();
  for (const [name, list] of Object.entries(parts)) {
    if (!list.length) continue;
    const geo = mergeGeometries(
      list.map((g) => {
        const f = g.index ? g.toNonIndexed() : g;
        if (f.hasAttribute('uv')) f.deleteAttribute('uv');
        return f;
      }),
    )!;
    for (const g of list) g.dispose();
    geo.computeBoundingBox();
    box.union(geo.boundingBox!);
    const mesh = new THREE.Mesh(geo, carMat(name));
    mesh.name = `binnacle:${name}`;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return { group, box };
}

// ------------------------------------------------------------------ the cluster

/** px a centimetre of the faces' canvas, and of the screens' */
const FACE_PX = 36;
const SCREEN_PX = 64;
/** the icon sheet: px a cell */
const ICON_CELL = 96;
/** how bright the lit faces and needles are (their lighting switched on with the lamps) */
const FACE_GLOW = 0.85;
const NEEDLE_RGB = new THREE.Color('#ff4a1c');

/** what the cluster is told each frame */
export interface ClusterInput {
  /** the vehicle's dashboard data (null: none) */
  dash: Dash | null;
  /** the speed the speedometer is driven by (km/h) */
  kmh: number;
  /** the key on (core/modcar/instruments.ts LampInput) */
  power: boolean;
  /** the hazard lights' lamps lit this moment */
  blink: boolean;
  /** the instruments' lighting: switched on with the lamps */
  lit: boolean;
  /** the four tyres (FL, FR, RL, RR; front and rear on two wheels): −1 none, 0 … 3 how worn, 4 blown */
  tyres: readonly number[];
}

/** a needle: its dial, its node, where it stands (0 … 1) */
interface Needle {
  kind: NeedleKind;
  form: 'quarter' | 'round';
  node: THREE.Object3D;
  frac: number;
}

function tint(geo: THREE.BufferGeometry, hex: number | string): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = geo.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

/** a needle's blade along +y from its pivot: `len` out, a short tail, `w` wide at its root (cm), a lighter ridge down its middle */
function blade(len: number, tail: number, w: number): THREE.BufferGeometry {
  const half = (x0: number, x1: number, col: string): THREE.BufferGeometry => {
    const s = new THREE.Shape();
    s.moveTo(x0 * w, -tail);
    s.lineTo(x1 * w, -tail);
    s.lineTo(x1 * w * 0.22, len * 0.97);
    s.lineTo(0, len);
    s.lineTo(x0 * w * 0.22, len * 0.97);
    s.closePath();
    return tint(new THREE.ShapeGeometry(s), col);
  };
  const g = mergeGeometries([half(-0.5, 0, '#d8320f'), half(0, 0.5, '#ff6a3a')])!;
  return g;
}

/** a hub's cap (cm): dark, a satin ring round it */
function cap(r: number): THREE.BufferGeometry {
  const a = tint(new THREE.CircleGeometry(r * 0.8, 20), '#141518');
  const b = tint(new THREE.RingGeometry(r * 0.8, r, 20), '#5d6168');
  return mergeGeometries([a, b])!;
}

export class Cluster {
  /** what moves and lights: the faces, needles, lamps, screens, lens (never merged) */
  readonly group = new THREE.Group();
  /** the binnacle's shell (the cab's own materials; merged with the frame): null on a motorcycle (its cans are its frame's) */
  readonly shell: THREE.Group | null;
  readonly layout: Layout;
  /** the faces' size (m) */
  readonly width: number;
  readonly height: number;
  /** the cluster's box in its own space (m): the binnacle's shell and the faces */
  readonly footprint = new THREE.Box3();
  private readonly k: number;
  /** the faces' texture (shared: facesFor) and what it is printed for */
  private faceKey = '';
  private readonly faceBase: string;
  private readonly faceSize: [number, number];
  private readonly faceMat: THREE.ShaderMaterial;
  private readonly screenCanvas: HTMLCanvasElement;
  private readonly screenTex: THREE.CanvasTexture;
  private readonly screenMat: THREE.ShaderMaterial;
  private readonly needleMat: THREE.ShaderMaterial;
  private readonly capMat: THREE.ShaderMaterial;
  private readonly lampMat: THREE.ShaderMaterial | null = null;
  private readonly lensMat: THREE.ShaderMaterial | null = null;
  private iconKey = '';
  private readonly meshes: THREE.Mesh[] = [];
  private readonly needles: Needle[] = [];
  private readonly faces: THREE.Mesh;
  /** each screen's place in the screens' canvas (px) */
  private readonly screenAt: { s: ScreenSpot; x: number; y: number; w: number; h: number }[] = [];
  readonly telltales = new Telltales();
  /** the lamps each light uniform stands for */
  private readonly lampIds: LampId[] = [];
  private speed: SpeedScale = speedScale(160);
  private revs: RpmScale = rpmScale(6000);
  private shown = '';
  private glow = 0;
  private level: 0 | 1 | 2 = 0;
  /** the display's data, kept between frames */
  private readonly sd: ScreenData = { power: false, hour: 12, outC: 15, gear: 'N', kmh: 0, odoKm: 0, tyres: [-1, -1, -1, -1], blink: false, fuel: 0, coolantC: 20 };

  /**
   * @param spec        the frame's cluster
   * @param speedLeft   the speedometer the left of the two big dials (as the frame had its own)
   * @param fillerRight the fuel filler on the vehicle's right (the gauge's arrow points to it)
   * @param sep         a motorcycle's two clocks this far apart (m)
   */
  constructor(
    readonly spec: ClusterSpec,
    speedLeft = true,
    readonly fillerRight = false,
    sep = 0.141,
  ) {
    const l = (this.layout = layoutOf(spec.style, speedLeft, sep * 100, spec.screen, spec.warnTop));
    const k = (this.k = (spec.style === 'bike' ? 1 : (spec.scale ?? 1)) / 100);
    this.width = l.w * k;
    this.height = l.h * k;
    this.group.name = CLUSTER_NODE;
    // (it has its own textures and its needles turn: never merged into the vehicle's one mesh — render/carMerge.ts)
    this.group.userData.mover = true;
    const inner = new THREE.Group();
    inner.scale.setScalar(k);
    this.group.add(inner);
    // the shell, merged with the frame (its own node beside this one, placed the same)
    if (l.bike) this.shell = null;
    else {
      const sh = buildShell(l, (spec.hood ?? 0.045) * 100);
      this.shell = new THREE.Group();
      this.shell.name = BINNACLE_NODE;
      sh.group.scale.setScalar(k);
      this.shell.add(sh.group);
      this.footprint.copy(sh.box).applyMatrix4(new THREE.Matrix4().makeScale(k, k, k));
    }
    // the faces' canvas: the whole rectangle of the layout, a little margin round it (one texture for every cluster
    // printed the same: the road's wrecks of a frame share theirs)
    const W = l.w + 2;
    const H = l.h + 2;
    this.faceSize = [W, H];
    this.faceBase = `${spec.style}|${spec.screen ?? ''}|${spec.warnTop ? 'wt' : ''}|${speedLeft}|${fillerRight}|${l.bike ? sep.toFixed(4) : ''}`;
    this.faceKey = faceKeyOf(this.faceBase, this.speed, this.revs);
    this.faceMat = surfaceMaterial({ color: 0xffffff, map: facesFor(this.faceKey, l, W, H, this.speed, this.revs, fillerRight), mapEmissive: 0, spec: 0.04, cabin: true, ink: true, inkBase: true });
    // the faces: each well's floor (z 0), its uv into the canvas
    const floors: THREE.BufferGeometry[] = [];
    for (const w of l.wells) {
      const g = new THREE.ShapeGeometry(new THREE.Shape(wellLoop(w)), 1);
      const pos = g.getAttribute('position');
      const uv = g.getAttribute('uv');
      for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + W / 2) / W, (pos.getY(i) + H / 2) / H);
      floors.push(g);
    }
    this.faces = this.add(inner, mergeGeometries(floors)!, this.faceMat, 'cluster:faces');
    for (const g of floors) g.dispose();
    // the screens: their own canvas, a row each
    const rows = l.screens.map((s) => ({ s, w: Math.ceil(s.w * SCREEN_PX), h: Math.ceil(s.h * SCREEN_PX) }));
    this.screenCanvas = document.createElement('canvas');
    this.screenCanvas.width = Math.max(4, ...rows.map((r) => r.w));
    this.screenCanvas.height = Math.max(4, rows.reduce((a, r) => a + r.h + 2, 0));
    let y = 0;
    for (const r of rows) {
      this.screenAt.push({ s: r.s, x: 0, y, w: r.w, h: r.h });
      y += r.h + 2;
    }
    this.screenTex = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    this.screenTex.anisotropy = 4;
    this.screenMat = surfaceMaterial({ color: 0xffffff, map: this.screenTex, mapEmissive: 0, spec: 0.02, cabin: true, ink: true, inkBase: true });
    if (this.screenAt.length) {
      const quads: THREE.BufferGeometry[] = [];
      for (const a of this.screenAt) {
        const q = new THREE.PlaneGeometry(a.s.w, a.s.h).translate(a.s.x, a.s.y, 0.04);
        const uv = q.getAttribute('uv');
        const cw = this.screenCanvas.width;
        const ch = this.screenCanvas.height;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (a.x + uv.getX(i) * a.w) / cw, 1 - (a.y + (1 - uv.getY(i)) * a.h) / ch);
        quads.push(q);
      }
      this.add(inner, mergeGeometries(quads)!, this.screenMat, 'cluster:screens');
    }
    // the needles, each on its pivot; the caps over them, one mesh for all (round: they need not turn)
    this.needleMat = surfaceMaterial({ color: 0xffffff, vertexColors: true, spec: 0.2, cabin: true, ink: true, inkBase: true });
    this.capMat = surfaceMaterial({ color: 0xffffff, vertexColors: true, spec: 0.3, cabin: true, ink: true, inkBase: true });
    const caps: THREE.BufferGeometry[] = [];
    // (a motorcycle's faces lie deeper in their cans: its needles nearer them)
    const nz = l.bike ? 0.1 : 0.32;
    const pivot = (kind: NeedleKind, form: 'quarter' | 'round', x: number, y: number, len: number, w: number, capR: number): void => {
      const node = new THREE.Mesh(blade(len, len * 0.2, w), this.needleMat);
      node.name = `cluster:needle:${kind}`;
      node.position.set(x, y, nz);
      node.castShadow = false;
      inner.add(node);
      this.meshes.push(node);
      this.needles.push({ kind, form, node, frac: -1 });
      caps.push(cap(capR).translate(x, y, nz + (l.bike ? 0.07 : 0.18)));
    };
    for (const d of l.big) pivot(d.kind, 'round', d.x, d.y, d.r * 0.86, d.r * 0.075, d.r * 0.12);
    for (const d of l.small) pivot(d.kind, d.form, d.x, d.y, d.r * (d.form === 'quarter' ? 0.9 : 0.78), d.r * 0.09, d.r * (d.form === 'quarter' ? 0.16 : 0.14));
    this.add(inner, mergeGeometries(caps)!, this.capMat, 'cluster:caps');
    for (const g of caps) g.dispose();
    // the lamps: one quad each over its symbol, lit by its own light (an icon sheet, a light a lamp)
    if (l.lamps.length) {
      const ids = [...new Set(l.lamps.map((s) => s.id))];
      this.lampIds.push(...ids);
      this.iconKey = ids.join(',');
      const quads: THREE.BufferGeometry[] = [];
      for (const s of l.lamps) {
        const i = ids.indexOf(s.id);
        // (a symbol is drawn 0.8 of its cell: the quad is its cell, the symbol `s` across)
        const q = new THREE.PlaneGeometry(s.s / 0.8, s.s / 0.8).translate(s.x, s.y, 0.06);
        const uv = q.getAttribute('uv');
        for (let j = 0; j < uv.count; j++) uv.setX(j, (i + uv.getX(j)) / ids.length);
        const n = q.getAttribute('position').count;
        q.setAttribute('aLamp', new THREE.Float32BufferAttribute(new Array(n).fill(i), 1));
        const c = new THREE.Color(LAMP_HEX[LAMP_INFO[s.id].colour]);
        q.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n).fill(0).flatMap(() => [c.r, c.g, c.b]), 3));
        quads.push(q);
      }
      this.lampMat = lampMaterial(iconsFor(this.iconKey, ids), ids.length);
      const lm = this.add(inner, mergeGeometries(quads)!, this.lampMat, 'cluster:lamps');
      lm.renderOrder = 10;
    }
    // the lens over the fascia (not on a motorcycle's open cans)
    if (!l.bike) {
      const e = extent(l);
      const lens = new THREE.ShapeGeometry(new THREE.Shape(roundRectLoop((e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2, e.x1 - e.x0 + 1.4, e.y1 - e.y0 + 1.4, 3.6, 8)), 1);
      lens.translate(0, 0, CUP_DEPTH + 0.4);
      tint(lens, '#ffffff');
      const pos = lens.getAttribute('position');
      const col = lens.getAttribute('color');
      // (a faint sheen across its upper part, where the cabin's light falls on it)
      for (let i = 0; i < pos.count; i++) {
        const t = (pos.getY(i) - e.y0) / (e.y1 - e.y0);
        const v = 0.25 + 0.75 * t * t;
        col.setXYZ(i, v, v, v);
      }
      this.lensMat = surfaceMaterial({ color: 0xc8d6e0, vertexColors: true, opacity: 0.07, spec: 0.5, cabin: true });
      this.lensMat.depthWrite = false;
      const lm = this.add(inner, lens, this.lensMat, 'cluster:lens');
      lm.renderOrder = 11;
    }
  }

  private add(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, name: string): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.castShadow = false;
    m.receiveShadow = true;
    parent.add(m);
    this.meshes.push(m);
    return m;
  }

  /** the scales its faces are printed with: the vehicle's top speed in its tallest gear (km/h) and its red line (rpm) */
  setScales(topKmh: number, redline: number): void {
    const sp = speedScale(topKmh);
    const rp = rpmScale(redline);
    if (sp.max === this.speed.max && sp.step === this.speed.step && rp.max === this.revs.max && rp.red === this.revs.red) return;
    this.speed = sp;
    this.revs = rp;
    // (the faces printed for these scales: another shared texture)
    const key = faceKeyOf(this.faceBase, sp, rp);
    const tex = facesFor(key, this.layout, this.faceSize[0], this.faceSize[1], sp, rp, this.fillerRight);
    release(FACES, this.faceKey);
    this.faceKey = key;
    this.faceMat.uniforms.uMap.value = tex;
  }

  get speedScale(): SpeedScale {
    return this.speed;
  }
  get rpmScale(): RpmScale {
    return this.revs;
  }

  /**
   * The cluster put where the frame's own two big dials were: `mid` their midpoint, `right`, `up` and `out` (towards the
   * driver) their plane — all in the space they are modelled in. The shell goes the same way (its own node, the
   * caller puts it in the same parent).
   */
  place(mid: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, out: THREE.Vector3): void {
    const p = placement(this.spec, mid, right, up, out);
    for (const o of [this.group, this.shell]) {
      if (!o) continue;
      o.position.copy(p.position);
      o.quaternion.copy(p.quaternion);
      o.updateMatrix();
    }
  }

  /** the cluster as the vehicle's dashboard has it now */
  update(v: ClusterInput, dt: number): void {
    const d = v.dash;
    const power = !!d && v.power;
    const battery = d?.battery ?? 0;
    if (d) this.telltales.update(dt, d, power, v.blink, battery);
    else {
      for (const id of LAMP_IDS) this.telltales.out[id] = 0;
      this.telltales.supply = 0;
    }
    const supply = this.telltales.supply;
    // the needles: each after its reading, damped as its own kind is
    const reading = { kmh: v.kmh, rpm: d?.rpm ?? 0, fuel: d?.fuel ?? 0, coolantC: d?.coolantC ?? 20 };
    for (const n of this.needles) {
      const want = needleFrac(n.kind, reading, power, this.speed, this.revs);
      if (n.frac < 0 || !Number.isFinite(dt)) n.frac = want;
      else n.frac += (want - n.frac) * (1 - Math.exp(-dt / NEEDLE_TAU[n.kind]));
      n.node.rotation.z = -needleAngle(n.kind, n.frac, n.form);
    }
    // the lamps
    if (this.lampMat) {
      const u = this.lampMat.uniforms.uLight.value as number[];
      this.lampIds.forEach((id, i) => (u[i] = this.telltales.light(id)));
    }
    // the faces' lighting with the lamps, the screens lit with the key
    const want = v.lit && power ? supply : 0;
    this.glow += (want - this.glow) * Math.min(1, (Number.isFinite(dt) ? dt : 1) * 8);
    this.faceMat.uniforms.uMapEmissive.value = FACE_GLOW * this.glow;
    (this.needleMat.uniforms.uEmissive.value as THREE.Color).copy(NEEDLE_RGB).multiplyScalar(0.55 * this.glow);
    this.screenMat.uniforms.uMapEmissive.value = power ? 0.95 * Math.max(0.35, supply) : 0;
    // the screens, drawn again where what they show has changed
    if (this.screenAt.length && this.level === 0) {
      const sd = this.sd;
      sd.power = power;
      if (d) {
        sd.hour = d.hour;
        sd.outC = d.outC;
        sd.gear = d.gearLabel;
        sd.odoKm = d.odoKm;
        sd.fuel = d.fuel;
        sd.coolantC = d.coolantC;
      }
      sd.kmh = v.kmh;
      sd.tyres = v.tyres;
      const blown = v.tyres.some((t) => t >= 4);
      sd.blink = blown && Math.floor(performance.now() / 400) % 2 === 0;
      const key = power
        ? `${sd.gear}|${Math.round(Math.abs(sd.kmh))}|${Math.floor(sd.odoKm)}|${Math.floor(sd.hour * 60)}|${Math.round(sd.outC)}|${v.tyres.join(',')}|${sd.blink ? 1 : 0}|${Math.round(sd.fuel * 6)}|${Math.round((sd.coolantC - 50) / 13)}`
        : 'off';
      if (key !== this.shown) {
        this.shown = key;
        this.paintScreens();
      }
    }
  }

  private paintScreens(): void {
    const g = this.screenCanvas.getContext('2d')!;
    g.fillStyle = ART.screen;
    g.fillRect(0, 0, this.screenCanvas.width, this.screenCanvas.height);
    for (const a of this.screenAt) {
      const s: Sheet = { g, px: SCREEN_PX, ox: a.x + a.w / 2 - a.s.x * SCREEN_PX, oy: a.y + a.h / 2 + a.s.y * SCREEN_PX };
      const sd = this.sd;
      if (a.s.kind === 'tft') drawScreen(s, a.s.x, a.s.y, a.s.w, a.s.h, sd);
      else if (a.s.kind === 'odo') drawLcd(s, a.s.x, a.s.y, a.s.w, a.s.h, String(Math.floor(Math.max(0, Math.min(999999, sd.odoKm)))).padStart(6, '0'), sd.fuel, true, sd);
      else drawLcd(s, a.s.x, a.s.y, a.s.w, a.s.h, sd.gear, (sd.coolantC - 50) / 80, true, sd);
    }
    this.screenTex.needsUpdate = true;
  }

  /**
   * How much of it is drawn: 0 all of it, 1 the faces alone (the vehicle standing off with nobody at it: one draw), 2
   * nothing (far off). The shell is the frame's: drawn with it.
   */
  show(level: 0 | 1 | 2): void {
    this.level = level;
    this.group.visible = level < 2;
    for (const m of this.meshes) m.visible = level === 0 || m === this.faces;
  }

  /** where a needle stands (0 … 1 of its dial), for the tests */
  reading(kind: NeedleKind): number {
    return this.needles.find((n) => n.kind === kind)?.frac ?? -1;
  }

  /** a lamp's light now (0 … 1), for the tests */
  lamp(id: LampId): number {
    return this.telltales.light(id);
  }

  /** the lamps this cluster has */
  get lamps(): readonly LampId[] {
    return this.lampIds;
  }

  /** what its display shows now: the gear, the speed, the distance, the time, the air outside, the tyres (the walkthroughs read it) */
  get display(): Readonly<ScreenData> {
    return this.sd;
  }

  private readonly inv = new THREE.Matrix4();
  private readonly pa = new THREE.Vector3();
  private readonly pb = new THREE.Vector3();

  /** does a look from `eye` along `dir` (the world's) fall on the faces, or within `margin` of them? */
  aimed(eye: THREE.Vector3, dir: THREE.Vector3, margin = 0.01): boolean {
    this.group.updateWorldMatrix(true, false);
    const inv = this.inv.copy(this.group.matrixWorld).invert();
    const o = this.pa.copy(eye).applyMatrix4(inv);
    const d = this.pb.copy(dir).transformDirection(inv);
    if (o.z <= 0 || d.z > -1e-4) return false;
    const t = -o.z / d.z;
    return Math.abs(o.x + d.x * t) <= this.width / 2 + margin && Math.abs(o.y + d.y * t) <= this.height / 2 + margin;
  }

  /** the faces' box on the screen, in the px of a frame `w` by `h` counted from its lower left: its middle and half size into `out` */
  screenBox(cam: THREE.Camera, w: number, h: number, out: { x: number; y: number; hx: number; hy: number }): boolean {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    this.group.updateWorldMatrix(true, false);
    for (let i = 0; i < 4; i++) {
      const p = this.pa.set((i & 1 ? 0.5 : -0.5) * this.width, (i & 2 ? 0.5 : -0.5) * this.height, 0).applyMatrix4(this.group.matrixWorld).applyMatrix4(cam.matrixWorldInverse);
      if (p.z > -0.02) return false;
      p.applyMatrix4(cam.projectionMatrix);
      const x = (p.x * 0.5 + 0.5) * w;
      const y = (p.y * 0.5 + 0.5) * h;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    out.x = (x0 + x1) / 2;
    out.y = (y0 + y1) / 2;
    out.hx = (x1 - x0) / 2;
    out.hy = (y1 - y0) / 2;
    return true;
  }

  dispose(): void {
    for (const m of this.meshes) m.geometry.dispose();
    this.shell?.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    release(FACES, this.faceKey);
    if (this.iconKey) release(ICONS, this.iconKey);
    this.faceKey = this.iconKey = '';
    this.screenTex.dispose();
    for (const m of [this.faceMat, this.screenMat, this.needleMat, this.capMat, this.lampMat, this.lensMat]) m?.dispose();
  }
}

/**
 * Where a cluster goes against the frame's own two big dials (`mid` their midpoint; `right`, `up`, `out` their plane, out
 * towards the driver): moved by spec.at in that plane, turned by spec.tilt about its own across axis (the top towards
 * the driver).
 */
export function placement(spec: ClusterSpec, mid: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, out: THREE.Vector3): { position: THREE.Vector3; quaternion: THREE.Quaternion } {
  const at = spec.at ?? (spec.style === 'bike' ? [0, 0, 0.0024] : [0, 0, -0.018]);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, out));
  if (spec.tilt) quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (spec.tilt * Math.PI) / 180));
  const position = mid.clone().addScaledVector(right, at[0]).addScaledVector(up, at[1]).addScaledVector(out, at[2]);
  return { position, quaternion };
}

/** textures shared by every cluster that wants the same: the faces printed for a layout and its scales, the lamps' symbols */
interface Shared {
  tex: THREE.CanvasTexture;
  users: number;
}
const FACES = new Map<string, Shared>();
const ICONS = new Map<string, Shared>();

function faceKeyOf(base: string, sp: SpeedScale, rp: RpmScale): string {
  return `${base}|${sp.max}/${sp.step}|${rp.max}/${rp.red}`;
}

function release(pool: Map<string, Shared>, key: string): void {
  const e = pool.get(key);
  if (!e || --e.users > 0) return;
  e.tex.dispose();
  pool.delete(key);
}

function shared(pool: Map<string, Shared>, key: string, make: () => HTMLCanvasElement, anisotropy: number): THREE.CanvasTexture {
  let e = pool.get(key);
  if (!e) {
    const tex = new THREE.CanvasTexture(make());
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy;
    pool.set(key, (e = { tex, users: 0 }));
  }
  e.users++;
  return e.tex;
}

/** the faces printed: the dials, their symbols, the panel's lamps dark behind their lens (a W × H cm canvas about the layout's middle) */
function facesFor(key: string, l: Layout, W: number, H: number, sp: SpeedScale, rp: RpmScale, fillerRight: boolean): THREE.CanvasTexture {
  return shared(
    FACES,
    key,
    () => {
      const c = document.createElement('canvas');
      c.width = Math.round(W * FACE_PX);
      c.height = Math.round(H * FACE_PX);
      const g = c.getContext('2d')!;
      const s: Sheet = { g, px: FACE_PX, ox: c.width / 2, oy: c.height / 2 };
      g.fillStyle = ART.face;
      g.fillRect(0, 0, c.width, c.height);
      for (const w of l.wells) {
        if (w.round) continue;
        g.fillStyle = '#0b0c0e';
        roundRect(s, w.x, w.y, w.w, w.h, 1.1);
        g.fill();
      }
      for (const d of l.big) drawBigDial(s, d.kind, d.x, d.y, d.r, sp, rp);
      for (const d of l.small) drawSmallDial(s, d.kind, d.form, d.x, d.y, d.r, fillerRight);
      for (const p of l.lamps) symbol(s, p.id, p.x, p.y, p.s, ART.unlit);
      return c;
    },
    8,
  );
}

/** the lamps' symbols, a cell each, white on clear with their halo */
function iconsFor(key: string, ids: LampId[]): THREE.CanvasTexture {
  return shared(
    ICONS,
    key,
    () => {
      const c = document.createElement('canvas');
      c.width = ICON_CELL * ids.length;
      c.height = ICON_CELL;
      drawIconSheet(c.getContext('2d')!, ICON_CELL, ids);
      return c;
    },
    4,
  );
}

/**
 * The lamps' material: each quad its lamp's symbol from the icon sheet, in its colour, as bright as its light (a
 * uniform a lamp); dark where unlit (the symbol printed dark on the face shows through). Over the face it keeps the
 * face's own line id (render/materials.ts maskPreservingBlend): no ink round a lamp's square.
 */
function lampMaterial(icons: THREE.Texture, n: number): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    defines: { LAMPS: String(Math.max(1, n)) },
    vertexColors: true,
    uniforms: { uIcons: { value: icons }, uLight: { value: new Array(Math.max(1, n)).fill(0) } },
    vertexShader: /* glsl */ `
      ${GLSL_VERTEX_PARS}
      attribute float aLamp;
      uniform float uLight[LAMPS];
      varying vec2 vUv;
      varying vec3 vCol;
      varying float vLight;
      void main() {
        vec3 transformed = position;
        vec3 objNormal = normal;
        vUv = uv;
        vCol = color;
        int i = int(aLamp + 0.5);
        float l = 0.0;
        for (int k = 0; k < LAMPS; k++) if (k == i) l = uLight[k];
        vLight = l;
        ${GLSL_VERTEX_MAIN}
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FRAGMENT_PARS}
      uniform sampler2D uIcons;
      varying vec2 vUv;
      varying vec3 vCol;
      varying float vLight;
      void main() {
        #include <logdepthbuf_fragment>
        vec4 t = texture2D(uIcons, vUv);
        // (the symbol's core white-hot at full light, its halo in the lamp's colour)
        vec3 c = mix(vCol, vec3(1.0), 0.18 * t.a * t.a) * (1.4 + 1.6 * vLight);
        gl_FragColor = vec4(c, t.a * vLight);
      }`,
  });
  maskPreservingBlend(mat);
  mat.depthWrite = false;
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  mat.polygonOffsetUnits = -2;
  return mat;
}

/**
 * Each frame's cluster (docs/V3/plan/finish.md §五): its style and size, where its faces go against the frame's own
 * dials, and what of the frame's own pod is cut away for it (the boxes measured from the frames' own build scripts: the
 * pod in front of the dash, the shelf under it on the campers' and the vans'; over the Rhino's binnacle its old pod's
 * hood plate). Each placed from the driver's eye at its sitting height (0.65-0.75 m over the cushion; scanned: what of
 * each dial, lamp and the display the wheel's rim, spokes, horn ring and hub, her hands and the dash hide) so that it
 * is seen through the wheel's upper opening as Nomad Drive's are: the rim crossing the tops of the speedometer and the
 * rev counter (no more than 15 % of either hidden), the fuel and coolant gauges, every lamp and the display clear of
 * the rim, the horn ring and the hub — turned to face the eye (tilt), out of the frame's own fascia and pad (at's last,
 * towards the driver), moved up or down and across its plane, its display and warnings arranged and its size chosen to
 * that end: where the horn ring crosses the panel it passes between the gauges and the display under them, the warnings
 * along the panel's foot; the Sugar Cube's and the Wanderer's four dials at a real car's size (the speedometer 7.7 cm
 * across; Nomad Drive's are 7-8) so that the outer two are inside the rim; the Goat's two dials either side of a panel,
 * its rim leaving no room for four across. In the forward-control cabs (the Loaf, the Turtle, the Old Elephant) the eye
 * looks over the wheel: the binnacle's top 15-16° under the level line, the rim under the panel's foot.
 */
export const CLUSTERS: Readonly<Record<string, ClusterSpec>> = {
  sedan: { style: 'quad', scale: 0.74, screen: 'high', warnTop: true, at: [-0.01, -0.045, -0.014], cut: [[-0.25, 0.25, -0.085, 0.083, -0.046, 0.016]] },
  wagon: { style: 'quad', scale: 0.74, screen: 'high', warnTop: true, at: [-0.0125, -0.065, -0.014], cut: [[-0.254, 0.254, -0.087, 0.083, -0.046, 0.016]] },
  goat: { style: 'twin', scale: 0.74, screen: 'low', at: [0, 0.0014, -0.0051], tilt: 13, cut: [[-0.2, 0.2, -0.077, 0.069, -0.072, 0.016]] },
  rhino: { style: 'quad', scale: 0.9, screen: 'high', warnTop: true, at: [0, -0.0051, -0.0097], tilt: 4, cut: [[-0.22, 0.22, -0.081, 0.073, -0.072, 0.016], [-0.21, 0.21, 0.06, 0.125, -0.16, 0]] },
  rv: { style: 'twin', scale: 0.88, screen: 'low', at: [-0.01, -0.025, -0.006], cut: [[-0.262, 0.262, -0.088, 0.09, -0.051, 0.016]] },
  pickup: { style: 'twin', scale: 0.8, screen: 'low', at: [-0.005, -0.0046, -0.0031], tilt: 9, cut: [[-0.25, 0.25, -0.08, 0.087, -0.046, 0.016]] },
  buffalo: { style: 'twin', scale: 0.88, screen: 'high', warnTop: true, at: [-0.005, 0.0049, -0.0062], tilt: 7, cut: [[-0.25, 0.25, -0.08, 0.087, -0.046, 0.016]] },
  van: { style: 'twin', scale: 1.02, screen: 'low', warnTop: true, at: [0, 0.0275, -0.0172], tilt: 6, cut: [[-0.215, 0.215, -0.072, 0.072, -0.061, 0.016], [-0.226, 0.226, -0.089, -0.04, -0.068, 0.031]] },
  turtle: { style: 'twin', scale: 1.02, screen: 'low', warnTop: true, at: [0, 0.0275, -0.0173], tilt: 5, cut: [[-0.215, 0.215, -0.072, 0.072, -0.061, 0.016], [-0.226, 0.226, -0.089, -0.04, -0.068, 0.031]] },
  elephant: { style: 'twin', scale: 1.02, screen: 'low', warnTop: true, at: [0, 0.0379, -0.0164], tilt: 5, cut: [[-0.215, 0.215, -0.072, 0.072, -0.061, 0.016], [-0.226, 0.226, -0.089, -0.04, -0.068, 0.031]] },
  camel: { style: 'twin', scale: 0.82, screen: 'low', at: [-0.0075, -0.0419, -0.0193], tilt: 6, cut: [[-0.215, 0.215, -0.072, 0.072, -0.061, 0.016], [-0.226, 0.226, -0.089, -0.04, -0.068, 0.031]] },
  snail: { style: 'twin', scale: 0.92, screen: 'low', at: [-0.005, -0.002, -0.018], cut: [[-0.225, 0.225, -0.08, 0.076, -0.066, 0.016], [-0.236, 0.236, -0.097, -0.048, -0.073, 0.036]] },
  fox: { style: 'sport', scale: 0.95, screen: 'high', warnTop: true, at: [-0.071, -0.058, -0.008], cut: [[-0.27, 0.148, -0.081, 0.087, -0.047, 0.016]] },
  moto: { style: 'bike' },
};

/**
 * The frame's own instrument pod cut out of its model for the cluster (spec.cut): every triangle of its meshes wholly
 * inside one of the boxes goes — only while the frame still has its own dials (a 'gauge' face). `toDials` takes a
 * point in the frame model's space into its two big dials' space (x across, y up, z out). Each geometry is cut once
 * and shared by every vehicle of that frame.
 */
export function cutFramePod(frame: THREE.Object3D, spec: ClusterSpec, toDials: THREE.Matrix4): number {
  const boxes = spec.cut;
  if (!boxes?.length) return 0;
  let gauges = false;
  frame.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const names = (m.userData.mat as string[] | undefined) ?? (Array.isArray(m.material) ? m.material : [m.material]).map((x) => x.name);
    if (names.some((n) => n.replace(/\.\d+$/, '') === 'gauge')) gauges = true;
  });
  if (!gauges) return 0;
  frame.updateMatrixWorld(true);
  const toFrame = new THREE.Matrix4().copy(frame.matrixWorld).invert();
  let cut = 0;
  frame.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || /^(N_|P_|PG_|WIPER_|FUEL_CAP|KNUCKLE_)/.test(mesh.name) || /^(N_|P_|PG_|WIPER_)/.test(mesh.parent?.name ?? '')) return;
    const m = new THREE.Matrix4().multiplyMatrices(toDials, new THREE.Matrix4().multiplyMatrices(toFrame, mesh.matrixWorld));
    const key = `${m.elements.map((e) => e.toFixed(4)).join(',')}|${JSON.stringify(boxes)}`;
    const src = mesh.geometry;
    let memo = CUTS.get(src);
    if (!memo) CUTS.set(src, (memo = new Map()));
    let out = memo.get(key);
    if (out === undefined) {
      out = cutGeometry(src, m, boxes);
      memo.set(key, out);
    }
    if (out) {
      mesh.geometry = out.geo;
      cut += out.n;
    }
  });
  return cut;
}

const CUTS = new WeakMap<THREE.BufferGeometry, Map<string, { geo: THREE.BufferGeometry; n: number } | null>>();

/** the geometry without its triangles wholly inside a box (in the space `m` takes its points to); null: none inside */
export function cutGeometry(src: THREE.BufferGeometry, m: THREE.Matrix4, boxes: number[][]): { geo: THREE.BufferGeometry; n: number } | null {
  const pos = src.getAttribute('position');
  if (!pos) return null;
  const n = pos.count;
  // which box (bit) each point is in
  const inBox = new Uint8Array(n);
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(m);
    let bits = 0;
    boxes.forEach((b, k) => {
      if (p.x >= b[0] && p.x <= b[1] && p.y >= b[2] && p.y <= b[3] && p.z >= b[4] && p.z <= b[5]) bits |= 1 << k;
    });
    inBox[i] = bits;
  }
  const index = src.getIndex();
  const count = index ? index.count : n;
  const keep: number[] = [];
  let gone = 0;
  for (let t = 0; t < count; t += 3) {
    const a = index ? index.getX(t) : t;
    const b = index ? index.getX(t + 1) : t + 1;
    const c = index ? index.getX(t + 2) : t + 2;
    if (inBox[a] & inBox[b] & inBox[c]) {
      gone++;
      continue;
    }
    keep.push(a, b, c);
  }
  if (!gone) return null;
  const geo = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(src.attributes)) geo.setAttribute(name, attr);
  geo.setIndex(keep);
  // (groups by material: the kept triangles keep their order, so a group's range is counted again)
  if (src.groups.length) {
    let at = 0;
    for (const gr of src.groups) {
      let k = 0;
      for (let t = gr.start; t < gr.start + gr.count; t += 3) {
        const a = index ? index.getX(t) : t;
        const b = index ? index.getX(t + 1) : t + 1;
        const c = index ? index.getX(t + 2) : t + 2;
        if (!(inBox[a] & inBox[b] & inBox[c])) k += 3;
      }
      geo.addGroup(at, k, gr.materialIndex);
      at += k;
    }
  }
  geo.boundingBox = src.boundingBox?.clone() ?? null;
  geo.boundingSphere = src.boundingSphere?.clone() ?? null;
  geo.userData = { ...src.userData };
  return { geo, n: gone };
}
