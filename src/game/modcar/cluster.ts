/**
 * The instruments in the cab (docs/V3/plan/finish.md §五): one plate where the frame's own dials are, a third bigger
 * than a real car's so that the screen can be read — the speedometer (the odometer in its face) and the rev counter
 * with their numbers, each where the frame had its own; fuel (its red is the reserve), water temperature (with its
 * red), the battery and the air outside as small dials; and along the top, where the wheel's spokes do not hide it, a
 * strip: a clock, the warning lamps (main beam, lamps, engine, fuel | handbrake, oil, battery, temperature) either
 * side of the gear, and the four tyres as four lamps round a little car (green, amber, red, blinking when one is
 * blown).
 *
 * One texture drawn once (the faces, the numbers, the dark lamps) and drawn into again where something it shows has
 * changed (a lamp, the gear, a digit of the odometer, the minute); the needles are thin meshes over it, turned every
 * frame; a dark case round it, with a brow where it stands on the dashboard. It tells what the vehicle's own
 * dashboard data says (core/modcar/systems.ts Dash), nothing else.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { surfaceMaterial } from '../render/materials';

/**
 * How the instruments are laid out about the two big dials: the small ones outside them ('round'), between them
 * ('stack': a long strip, where the frame's own two are far enough apart), beside them ('sport'), or two clocks on the
 * bars with the fuel between ('bike').
 */
export type ClusterStyle = 'round' | 'stack' | 'sport' | 'bike';

export interface ClusterSpec {
  style: ClusterStyle;
  /** the plate's size against the layout's own (1: as drawn) */
  scale?: number;
  /** the plate's top edge above the line of the frame's own two big dials (m), and how far it stands out of their plane towards the driver (m; 1.2 cm by itself) */
  top?: number;
  out?: number;
  /** a brow over it: it stands on the dashboard, not under its cowl */
  brow?: boolean;
  /**
   * A bite out of its lower edge, round-topped, where something of the cab's own must stay in sight (the key between a
   * motorcycle's clocks, on a pickup's column): its middle across from the midpoint of the two big dials, its width,
   * and how far up from the lower edge it goes (m).
   */
  notch?: { x: number; w: number; h: number };
}

/** what the plate shows now */
export interface ClusterValues {
  /** the key on (or the engine running): the needles live, the lamps test */
  on: boolean;
  /** the instruments' lighting (the lamps switched on): the plate glows */
  lit: boolean;
  kmh: number;
  rpm: number;
  redline: number;
  /** the fuel needle 0…1, the water (°C), the battery 0…1, the air outside (°C) */
  fuel: number;
  tempC: number;
  battery: number;
  outC: number;
  gear: string;
  /** the vehicle's own distance (km) */
  odoKm: number;
  /** the time of day (h, 0…24) */
  hour: number;
  lamps: { handbrake: boolean; lights: boolean; high: boolean; oil: boolean; battery: boolean; temp: boolean; fuel: boolean; engine: boolean };
  /** FL, FR, RL, RR (front, rear on two wheels): −1 none, 0…3 how worn (tyres.ts tyreStage), 4 blown */
  tyres: readonly number[];
}

/** the plate's node in the vehicle's model: left out of every merge (carView.ts) */
export const CLUSTER_NODE = 'cluster';

/** px a centimetre of plate */
const PX = 22;
const INK = '#17120f';
const FACE = '#efe6d2';
const PLATE = '#1c1a19';
const RED = '#c8372f';
const DEG = Math.PI / 180;

type Ctx = CanvasRenderingContext2D;
type LampId = keyof ClusterValues['lamps'];

export interface DialDef {
  kind: 'speed' | 'rpm' | 'fuel' | 'temp' | 'batt' | 'air';
  x: number;
  y: number;
  r: number;
}

/** a cell of the strip: its left edge and its width (cm) */
export interface Cell {
  kind: 'clock' | 'air' | 'lamps' | 'gear' | 'tyres';
  x: number;
  w: number;
  lamps?: readonly LampId[];
}

/** a plate, in centimetres about its middle (x to the driver's right, y up) */
export interface Layout {
  w: number;
  h: number;
  dials: DialDef[];
  /** the strip along the top: its middle line and its height */
  stripY: number;
  stripH: number;
  cells: Cell[];
  /** where the midpoint of the two big dials is, across the plate */
  midX: number;
  bike: boolean;
}

/** the sweep of each dial (clock angles from straight up, °) */
const SWEEP: Record<DialDef['kind'], [number, number]> = {
  speed: [-125, 125],
  rpm: [-125, 125],
  fuel: [-55, 55],
  temp: [-55, 55],
  batt: [-55, 55],
  air: [-55, 55],
};

/** the lamps either side of the gear: what tells of the lamps and the engine to its left, what must be seen at once (red) to its right */
const LEFT_LAMPS: readonly LampId[] = ['high', 'lights', 'engine', 'fuel'];
const RIGHT_LAMPS: readonly LampId[] = ['handbrake', 'oil', 'battery', 'temp'];

/**
 * A plate for a frame whose own two big dials are `sep` cm apart (in the plate's own centimetres), the speedometer
 * the left of the two or the right: each big dial where the frame had its own, the small ones about them as the style
 * has it, the strip along the top.
 */
export function layoutOf(style: ClusterStyle, sep: number, speedLeft: boolean): Layout {
  const bike = style === 'bike';
  const rS = bike ? 5.9 : 7.2;
  const rR = bike ? 5.9 : 6.6;
  const rs = bike ? 2.3 : style === 'round' ? 3.3 : 3.1;
  const M = 0.8;
  const stripH = bike ? 2.6 : 3.2;
  const rowH = 2 * Math.max(rS, rR);
  const h = 0.6 + stripH + 0.5 + rowH + 0.7;
  const yc = h / 2 - (0.6 + stripH + 0.5 + rowH / 2);
  const rL = speedLeft ? rS : rR;
  const rRt = speedLeft ? rR : rS;
  // (the small dials between the two big ones want room there: the frame's own are that far apart, or they go outside)
  let st = style;
  if (st === 'stack' && sep < rL + rRt + 4 * rs + 1.3) st = 'round';
  const least = rL + rRt + (st === 'stack' ? 4 * rs + 1.3 : st === 'bike' ? 2.0 : 0.4);
  const d = Math.min(least + 22, Math.max(least, sep));
  const xL = -d / 2;
  const xR = d / 2;
  const dials: DialDef[] = [
    { kind: speedLeft ? 'speed' : 'rpm', x: xL, y: yc, r: rL },
    { kind: speedLeft ? 'rpm' : 'speed', x: xR, y: yc, r: rRt },
  ];
  let left = xL - rL - M;
  let right = xR + rRt + M;
  const up = rs + 0.15;
  if (st === 'round') {
    const x1 = xL - rL - 0.5 - rs;
    const x2 = xR + rRt + 0.5 + rs;
    dials.push({ kind: 'fuel', x: x1, y: yc + up, r: rs }, { kind: 'batt', x: x1, y: yc - up, r: rs }, { kind: 'temp', x: x2, y: yc + up, r: rs }, { kind: 'air', x: x2, y: yc - up, r: rs });
    left = x1 - rs - M;
    right = x2 + rs + M;
  } else if (st === 'stack' || st === 'sport') {
    // four in a square: between the two big ones, or outside the left one
    const xc = st === 'stack' ? (xL + rL + xR - rRt) / 2 : xL - rL - 0.5 - 2 * rs - 0.15;
    dials.push({ kind: 'fuel', x: xc - up, y: yc + up, r: rs }, { kind: 'temp', x: xc + up, y: yc + up, r: rs }, { kind: 'batt', x: xc - up, y: yc - up, r: rs }, { kind: 'air', x: xc + up, y: yc - up, r: rs });
    if (st === 'sport') left = xc - up - rs - M;
  } else {
    // (two clocks, the fuel between them up by the strip: under it the bars' own key keeps its place)
    const xc = (xL + rL + xR - rRt) / 2;
    dials.push({ kind: 'fuel', x: xc, y: yc + rowH / 2 - rs, r: rs });
  }
  const off = (left + right) / 2;
  for (const dl of dials) dl.x -= off;
  const w = right - left;
  // the strip, about the plate's middle: [clock] [four lamps] [gear] [four lamps] [tyres] (two clocks: the air
  // outside as a number where the clock would be)
  const gap = bike ? 0.4 : 0.5;
  const clockW = bike ? 3.4 : 5.6;
  const gearW = bike ? 2.6 : 3.4;
  const tyreW = bike ? 2.4 : 4.2;
  const fixed = clockW + gearW + tyreW + gap * 4;
  const lampW = Math.min(bike ? 2.2 : 2.7, (w - 2 * M - fixed) / 8);
  const cells: Cell[] = [];
  let x = -(fixed + lampW * 8) / 2;
  const put = (kind: Cell['kind'], cw: number, lamps?: readonly LampId[]): void => {
    if (cw <= 0) return;
    cells.push({ kind, x, w: cw, lamps });
    x += cw + gap;
  };
  put(bike ? 'air' : 'clock', clockW);
  put('lamps', lampW * 4, LEFT_LAMPS);
  put('gear', gearW);
  put('lamps', lampW * 4, RIGHT_LAMPS);
  put('tyres', tyreW);
  return { w, h, dials, stripY: h / 2 - 0.6 - stripH / 2, stripH, cells, midX: -off, bike };
}

/** the lamps, in the order they are told in (`shown`), and what each is lit in */
const LAMPS: readonly { id: LampId; col: string }[] = [
  { id: 'handbrake', col: '#ff5a4a' },
  { id: 'oil', col: '#ff5a4a' },
  { id: 'battery', col: '#ff5a4a' },
  { id: 'temp', col: '#ff5a4a' },
  { id: 'fuel', col: '#ffb23a' },
  { id: 'engine', col: '#ffb23a' },
  { id: 'lights', col: '#6fe08a' },
  { id: 'high', col: '#6fb4ff' },
];
const LAMP_COL = Object.fromEntries(LAMPS.map((l) => [l.id, l.col])) as Record<LampId, string>;

/** a lamp's pictogram, drawn in `col` in a square of `s` px about (x, y) */
function glyph(g: Ctx, lamp: string, x: number, y: number, s: number, col: string): void {
  const k = s / 64;
  g.save();
  g.translate(x, y);
  g.scale(k, k);
  g.strokeStyle = col;
  g.fillStyle = col;
  g.lineWidth = 5.5;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const line = (pts: number[]): void => {
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.stroke();
  };
  if (lamp === 'battery') {
    g.strokeRect(-19, -10, 38, 25);
    g.fillRect(-13, -17, 8, 7);
    g.fillRect(5, -17, 8, 7);
    line([-13, 3, -5, 3]);
    line([5, 3, 13, 3]);
    line([9, -1, 9, 7]);
  } else if (lamp === 'fuel') {
    g.strokeRect(-15, -17, 21, 34);
    g.fillRect(-11, -13, 13, 10);
    line([6, -9, 15, -2, 15, 11, 10, 13]);
  } else if (lamp === 'temp') {
    line([0, -19, 0, 7]);
    g.beginPath();
    g.arc(0, 12, 7.5, 0, Math.PI * 2);
    g.fill();
    line([4, -13, 12, -13]);
    line([4, -5, 12, -5]);
    line([-18, 22, -9, 18, 0, 22, 9, 18, 18, 22]);
  } else if (lamp === 'oil') {
    // an oil can: its body, its spout, a drop
    line([-18, 2, -6, -4, 10, -4, 10, 8, -18, 8, -18, 2]);
    line([10, -1, 21, -7]);
    line([-10, -4, -10, -11, -2, -11]);
    g.beginPath();
    g.arc(22, 5, 3.4, 0, Math.PI * 2);
    g.fill();
  } else if (lamp === 'engine') {
    // an engine block: the block, the fan's hub, the intake on top
    line([-14, -8, 10, -8, 10, -2, 18, -2, 18, 12, 10, 12, 10, 16, -14, 16, -14, 8, -21, 8, -21, -2, -14, -2, -14, -8]);
    line([-6, -8, -6, -16, 4, -16, 4, -8]);
  } else if (lamp === 'handbrake') {
    g.beginPath();
    g.arc(0, 0, 14, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, 22, -0.75, 0.75);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, 22, Math.PI - 0.75, Math.PI + 0.75);
    g.stroke();
    line([0, -7, 0, 2]);
    g.beginPath();
    g.arc(0, 8, 2.6, 0, Math.PI * 2);
    g.fill();
  } else if (lamp === 'lights' || lamp === 'high') {
    // a lamp's lens, and its beam: dipped slanting down, main straight out
    g.beginPath();
    g.moveTo(-2, -15);
    g.quadraticCurveTo(-24, 0, -2, 15);
    g.closePath();
    g.stroke();
    const dy = lamp === 'high' ? 0 : 5;
    for (const yy of [-10, -3, 4, 11]) line([4, yy, 20, yy + dy]);
  }
  g.restore();
}

function px(l: Layout, x: number): number {
  return (x + l.w / 2) * PX;
}
function py(l: Layout, y: number): number {
  return (l.h / 2 - y) * PX;
}

/** a point of a dial at clock angle a (°) and radius r (cm), in canvas px */
function at(l: Layout, d: DialDef, a: number, r: number): [number, number] {
  return [px(l, d.x + Math.sin(a * DEG) * r), py(l, d.y + Math.cos(a * DEG) * r)];
}

/** the odometer's window in the speedometer's face, under its hub (canvas px) */
function odoBox(l: Layout, d: DialDef): { x: number; y: number; w: number; h: number } {
  const k = d.r / 7.2;
  const w = 6.0 * k * PX;
  const h = 1.6 * k * PX;
  return { x: px(l, d.x) - w / 2, y: py(l, d.y - 3.3 * k) - h / 2, w, h };
}

/** a window: a dark glass in a light frame */
function windowBox(g: Ctx, x: number, y: number, w: number, h: number): void {
  g.fillStyle = INK;
  g.fillRect(x - 2, y - 2, w + 4, h + 4);
  g.fillStyle = '#8fa3ae';
  g.fillRect(x, y, w, h);
  g.fillStyle = '#12100f';
  g.fillRect(x + 2.5, y + 2.5, w - 5, h - 5);
}

/** a dial's face, as it never changes: its bezel, its ticks, its numbers, its red */
function drawDial(g: Ctx, l: Layout, d: DialDef, redline: number): void {
  const cx = px(l, d.x);
  const cy = py(l, d.y);
  const R = d.r * PX;
  const big = d.kind === 'speed' || d.kind === 'rpm';
  const [a0, a1] = SWEEP[d.kind];
  // the bezel: a chrome ring with an ink line each side
  g.fillStyle = INK;
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fill();
  const ring = g.createLinearGradient(cx, cy - R, cx, cy + R);
  ring.addColorStop(0, '#e6eef2');
  ring.addColorStop(0.45, '#9fb2bd');
  ring.addColorStop(0.55, '#7d919d');
  ring.addColorStop(1, '#c4d2da');
  g.fillStyle = ring;
  g.beginPath();
  g.arc(cx, cy, R - 2.5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = INK;
  g.beginPath();
  g.arc(cx, cy, R * (big ? 0.905 : 0.86) + 2, 0, Math.PI * 2);
  g.fill();
  const rf = R * (big ? 0.905 : 0.86);
  g.fillStyle = FACE;
  g.beginPath();
  g.arc(cx, cy, rf, 0, Math.PI * 2);
  g.fill();
  const arc = (from: number, to: number, r0: number, r1: number, col: string): void => {
    g.fillStyle = col;
    g.beginPath();
    g.arc(cx, cy, r1, (from - 90) * DEG, (to - 90) * DEG);
    g.arc(cx, cy, r0, (to - 90) * DEG, (from - 90) * DEG, true);
    g.closePath();
    g.fill();
  };
  const tick = (a: number, r0: number, r1: number, w: number, col = INK): void => {
    const p0 = at(l, d, a, r0);
    const p1 = at(l, d, a, r1);
    g.strokeStyle = col;
    g.lineWidth = w;
    g.lineCap = 'butt';
    g.beginPath();
    g.moveTo(p0[0], p0[1]);
    g.lineTo(p1[0], p1[1]);
    g.stroke();
  };
  const text = (s: string, a: number, r: number, size: number, col = INK, weight = 700): void => {
    const p = at(l, d, a, r);
    g.fillStyle = col;
    g.font = `${weight} ${size}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(s, p[0], p[1] + size * 0.04);
  };
  const rr = rf / PX;
  if (d.kind === 'speed') {
    // 0…180 km/h: a number every 20, a long tick every 10, a short one every 5
    for (let v = 0; v <= 180; v += 5) {
      const a = a0 + ((a1 - a0) * v) / 180;
      const long = v % 20 === 0;
      tick(a, rr * (long ? 0.8 : v % 10 === 0 ? 0.85 : 0.9), rr * 0.97, long ? 3.2 : v % 10 === 0 ? 2.2 : 1.4);
      if (long) text(String(v), a, rr * 0.62, R * 0.165);
    }
    text('km/h', 0, rr * 0.3, R * 0.11, '#5a4f45', 600);
    // (its odometer's window, under the hub: the digits are drawn as they turn)
    const o = odoBox(l, d);
    windowBox(g, o.x, o.y, o.w, o.h);
  } else if (d.kind === 'rpm') {
    // 0…8 thousand a minute; the red from where this engine's ends
    const red = Math.max(2, Math.min(7.8, redline / 1000));
    arc(a0 + ((a1 - a0) * red) / 8, a1, rf * 0.86, rf * 0.97, RED);
    for (let v = 0; v <= 16; v++) {
      const a = a0 + ((a1 - a0) * v) / 16;
      const long = v % 2 === 0;
      tick(a, rr * (long ? 0.8 : 0.88), rr * 0.97, long ? 3.2 : 1.8, v / 2 >= red ? '#fff' : INK);
      if (long) text(String(v / 2), a, rr * 0.63, R * 0.19);
    }
    text('×1000', 0, rr * 0.3, R * 0.11, '#5a4f45', 600);
  } else {
    // a small one: a quarter-and-a-bit of a circle, its ends lettered, its red where harm is
    const red: [number, number] | null = d.kind === 'fuel' ? [0, 0.12] : d.kind === 'temp' ? [0.78, 1] : d.kind === 'batt' ? [0, 0.18] : null;
    if (red) arc(a0 + (a1 - a0) * red[0], a0 + (a1 - a0) * red[1], rf * 0.78, rf * 0.95, RED);
    if (d.kind === 'air') {
      // (−30…50 °C: blue under freezing)
      arc(a0, a0 + ((a1 - a0) * 30) / 80, rf * 0.78, rf * 0.95, '#6fb4ff');
    }
    for (let i = 0; i <= 4; i++) tick(a0 + ((a1 - a0) * i) / 4, rr * (i % 2 === 0 ? 0.7 : 0.8), rr * 0.95, i % 2 === 0 ? 2.6 : 1.6);
    const ends = d.kind === 'fuel' ? ['E', 'F'] : d.kind === 'temp' ? ['C', 'H'] : d.kind === 'batt' ? ['−', '+'] : ['−30', '50'];
    const size = R * (d.kind === 'air' ? 0.24 : 0.34);
    text(ends[0], a0 - 4, rr * 0.5, size);
    text(ends[1], a1 + 4, rr * 0.5, size);
    // its pictogram under the needle's hub
    const gy = cy + rf * 0.52;
    if (d.kind === 'air') {
      g.fillStyle = '#5a4f45';
      g.font = `700 ${R * 0.34}px Arial, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('°C', cx, gy);
    } else glyph(g, d.kind === 'batt' ? 'battery' : d.kind, cx, gy, R * 0.62, '#5a4f45');
  }
}

/** a bite out of the plate's lower edge, in the plate's own space (m): its middle across, its half width, how far up it goes */
export interface Bite {
  x: number;
  half: number;
  h: number;
}

/**
 * The plate's outline (m, about its middle), `b` outside it (its case's wall): a rectangle, and where it has a bite
 * out of its lower edge, round-topped, the bite's own outline — smaller by the wall. Counter-clockwise.
 */
export function outline(w: number, h: number, b: number, bite: Bite | null): THREE.Vector2[] {
  const x0 = -w / 2 - b;
  const x1 = w / 2 + b;
  const y0 = -h / 2 - b;
  const y1 = h / 2 + b;
  const pts = [new THREE.Vector2(x0, y0)];
  if (bite) {
    const r = Math.max(0.002, bite.half - b);
    const top = -h / 2 + bite.h - b;
    // (round-topped: straight up to where the round begins, or all round where the bite is shallow)
    const cy = Math.max(top - r, y0 - r * 0.999);
    const rr = top - cy;
    const dy = y0 - cy;
    const a = dy > 0 ? Math.asin(Math.min(1, dy / rr)) : 0;
    const dx = dy > 0 ? Math.sqrt(Math.max(0, rr * rr - dy * dy)) : rr;
    pts.push(new THREE.Vector2(bite.x - dx, y0));
    const N = 16;
    for (let i = 0; i <= N; i++) {
      const t = Math.PI - a - ((Math.PI - 2 * a) * i) / N;
      pts.push(new THREE.Vector2(bite.x + rr * Math.cos(t), cy + rr * Math.sin(t)));
    }
    pts.push(new THREE.Vector2(bite.x + dx, y0));
  }
  pts.push(new THREE.Vector2(x1, y0), new THREE.Vector2(x1, y1), new THREE.Vector2(x0, y1));
  return pts;
}

/** the plate: its outline filled, the texture across the whole rectangle */
function plateGeometry(w: number, h: number, bite: Bite | null): THREE.BufferGeometry {
  const geo = new THREE.ShapeGeometry(new THREE.Shape(outline(w, h, 0, bite)));
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  uv.needsUpdate = true;
  return geo;
}

/** the case round the plate (m, in the plate's own space): a rim standing a little proud of it, its sides back to the dashboard, its back; a brow over it */
function caseGeometry(w: number, h: number, depth: number, brow: boolean, bite: Bite | null): THREE.BufferGeometry {
  const b = 0.008;
  const proud = 0.005;
  const ring = new THREE.Shape(outline(w, h, b, bite));
  ring.holes.push(new THREE.Path(outline(w, h, 0, bite)));
  const parts: THREE.BufferGeometry[] = [
    new THREE.ExtrudeGeometry(ring, { depth: proud + depth, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -depth),
    new THREE.ExtrudeGeometry(new THREE.Shape(outline(w, h, b, bite)), { depth: 0.003, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -depth),
  ];
  if (brow) parts.push(new THREE.BoxGeometry(w + 2 * b + 0.012, 0.006, 0.03).translate(0, h / 2 + b + 0.003, proud + 0.011).toNonIndexed());
  const geo = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return geo;
}

export class Cluster {
  readonly group = new THREE.Group();
  /** the plate's size (m) */
  readonly width: number;
  readonly height: number;
  private readonly layout: Layout;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: Ctx;
  private readonly tex: THREE.CanvasTexture;
  private readonly mat: THREE.ShaderMaterial;
  private readonly needleMat: THREE.ShaderMaterial;
  private readonly caseMat: THREE.ShaderMaterial;
  private readonly needles: { d: DialDef; pivot: THREE.Mesh; value: number }[] = [];
  private readonly plate: THREE.Mesh;
  private readonly box: THREE.Mesh;
  private redline = 0;
  private shown = '';
  private blinkT = 0;
  private glow = 0;

  /**
   * @param sep        how far apart the frame's own two big dials are (m)
   * @param speedLeft  its speedometer is the left of the two
   */
  constructor(
    readonly spec: ClusterSpec,
    sep = 0.17,
    speedLeft = true,
  ) {
    const k = (spec.scale ?? 1) / 100;
    const l = (this.layout = layoutOf(spec.style, sep / k, speedLeft));
    this.width = l.w * k;
    this.height = l.h * k;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(l.w * PX);
    this.canvas.height = Math.round(l.h * PX);
    this.g = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.tex.generateMipmaps = true;
    this.mat = surfaceMaterial({ color: 0xffffff, map: this.tex, mapEmissive: 0, spec: 0.05, cabin: true });
    // (a bite out of its lower edge, where the cab's own key must stay in sight)
    const bite: Bite | null = spec.notch ? { x: l.midX * k + spec.notch.x, half: spec.notch.w / 2, h: spec.notch.h } : null;
    this.plate = new THREE.Mesh(plateGeometry(this.width, this.height, bite), this.mat);
    this.plate.name = 'cluster:plate';
    this.plate.castShadow = false;
    this.group.add(this.plate);
    this.group.name = CLUSTER_NODE;
    // (it has its own texture and its needles turn: never merged into the vehicle's one mesh — render/carMerge.ts)
    this.group.userData.mover = true;
    // its case: dark, drawn round with the same line as the cab's own trim
    this.caseMat = surfaceMaterial({ color: 0x211e1d, spec: 0.1, cabin: true, ink: true });
    this.box = new THREE.Mesh(caseGeometry(this.width, this.height, (spec.out ?? 0.012) + 0.02, !!spec.brow, bite), this.caseMat);
    this.box.name = 'cluster:case';
    this.box.castShadow = false;
    this.group.add(this.box);
    // (a needle is not lit from within: at night it is the dark hand over the glowing face)
    this.needleMat = surfaceMaterial({ color: 0xffffff, vertexColors: true, cabin: true });
    const tint = (geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry => {
      const c = new THREE.Color(hex);
      const n = geo.getAttribute('position').count;
      const a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
      return geo;
    };
    // a needle: a long taper from its hub to its tip and a short tail, a few millimetres off the face, its cap over
    // it — one mesh, coloured in its vertices
    for (const d of l.dials) {
      const big = d.kind === 'speed' || d.kind === 'rpm';
      const r = d.r * k * (big ? 0.8 : 0.72);
      const w = d.r * k * (big ? 0.045 : 0.075);
      const shape = new THREE.Shape();
      shape.moveTo(-w, -r * 0.2);
      shape.lineTo(w, -r * 0.2);
      shape.lineTo(w * 0.35, r);
      shape.lineTo(-w * 0.35, r);
      shape.closePath();
      const blade = tint(new THREE.ShapeGeometry(shape), 0xe8482c);
      const cap = tint(new THREE.CircleGeometry(d.r * k * 0.13, 20).translate(0, 0, 0.001), 0x1b1715);
      const pivot = new THREE.Mesh(mergeGeometries([blade, cap])!, this.needleMat);
      blade.dispose();
      cap.dispose();
      pivot.name = `cluster:needle:${d.kind}`;
      pivot.castShadow = false;
      pivot.position.set(d.x * k, d.y * k, 0.003);
      this.group.add(pivot);
      this.needles.push({ d, pivot, value: -1 });
    }
  }

  /**
   * The plate put where the frame's own two big dials are: `mid` the middle between them, `right`, `up` and `out`
   * (towards the driver) the plane they lie in — all in the space those dials are modelled in. Its own two big dials
   * come across where they were; its top edge `spec.top` above their line; it stands `spec.out` out of their plane,
   * and hides them.
   */
  place(mid: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, out: THREE.Vector3): void {
    const k = (this.spec.scale ?? 1) / 100;
    const g = this.group;
    g.position
      .copy(mid)
      .addScaledVector(right, -this.layout.midX * k)
      .addScaledVector(up, (this.spec.top ?? this.height / 2) - this.height / 2)
      .addScaledVector(out, this.spec.out ?? 0.012);
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, out));
    g.updateMatrix();
  }

  /** the plate drawn afresh: all that never changes (again when the engine's red line is another) */
  private paintBase(redline: number): void {
    const l = this.layout;
    const g = this.g;
    const W = this.canvas.width;
    const H = this.canvas.height;
    g.clearRect(0, 0, W, H);
    // the plate: charcoal, a lighter rim, an ink line round it
    g.fillStyle = INK;
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#3a3633';
    g.fillRect(3, 3, W - 6, H - 6);
    g.fillStyle = PLATE;
    g.fillRect(8, 8, W - 16, H - 16);
    for (const d of l.dials) drawDial(g, l, d, redline);
    this.redline = redline;
    this.shown = '';
  }

  /** what changes, drawn where it changed: the strip (clock, lamps, gear, tyres) and the odometer's digits */
  private paintLive(v: ClusterValues, blink: boolean): void {
    const l = this.layout;
    const g = this.g;
    const y0 = py(l, l.stripY + l.stripH / 2);
    const h = l.stripH * PX;
    const cy = y0 + h / 2;
    // the strip's ground
    g.fillStyle = PLATE;
    g.fillRect(8, y0 - 3, this.canvas.width - 16, h + 6);
    const digits = (s: string, bx: number, bw: number, col: string, size: number): void => {
      g.fillStyle = col;
      g.font = `700 ${h * size}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(s, bx + bw / 2, cy + h * 0.03);
    };
    for (const c of l.cells) {
      const x0 = px(l, c.x);
      const w = c.w * PX;
      if (c.kind === 'lamps' && c.lamps) {
        // the lamps: dark tiles, the lit ones in their colour with the pictogram dark on them
        const lw = w / c.lamps.length;
        const s = Math.min(lw, h) - 5;
        c.lamps.forEach((id, i) => {
          const on = v.on && v.lamps[id];
          const cx = x0 + lw * (i + 0.5);
          g.fillStyle = on ? LAMP_COL[id] : '#262321';
          g.beginPath();
          g.roundRect(cx - s / 2, cy - s / 2, s, s, s * 0.2);
          g.fill();
          glyph(g, id, cx, cy, s * 0.78, on ? '#1a1310' : '#5d554f');
        });
      } else if (c.kind === 'gear') {
        windowBox(g, x0, y0, w, h);
        digits(v.on ? v.gear : '', x0, w, '#ffd36a', v.gear.length > 1 ? 0.56 : 0.7);
      } else if (c.kind === 'air') {
        windowBox(g, x0, y0, w, h);
        digits(`${Math.round(v.outC)}°`, x0, w, '#9fd2ff', 0.56);
      } else if (c.kind === 'clock') {
        windowBox(g, x0, y0, w, h);
        const t = ((v.hour % 24) + 24) % 24;
        const hh = Math.floor(t);
        const mm = Math.floor((t - hh) * 60);
        digits(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, x0, w, '#9fe3b0', 0.6);
      } else if (c.kind === 'tyres') {
        // the tyres: the vehicle from above, a lamp at each wheel
        g.fillStyle = INK;
        g.fillRect(x0 - 2, y0 - 2, w + 4, h + 4);
        g.fillStyle = '#12100f';
        g.fillRect(x0, y0, w, h);
        g.fillStyle = '#5c6a72';
        const bw = w * (l.bike ? 0.16 : 0.3);
        g.beginPath();
        g.roundRect(x0 + w / 2 - bw / 2, y0 + h * (l.bike ? 0.3 : 0.12), bw, h * (l.bike ? 0.4 : 0.76), bw * 0.3);
        g.fill();
        const COL = ['#55cf6a', '#b9d94f', '#f0b43a', '#ff5a4a'];
        // (four wheels: at its corners; two: one before the other)
        const at4 = (i: number): [number, number, number, number] =>
          l.bike ? [x0 + w / 2, y0 + (i === 0 ? h * 0.18 : h * 0.82), w * 0.42, h * 0.2] : [x0 + (i % 2 === 0 ? w * 0.16 : w * 0.84), y0 + (i < 2 ? h * 0.27 : h * 0.73), w * 0.17, h * 0.3];
        for (let i = 0; i < (l.bike ? 2 : 4); i++) {
          const st = v.tyres[i] ?? -1;
          const [lx, ly, lw, lh] = at4(i);
          if (st < 0) {
            g.strokeStyle = '#5a5450';
            g.lineWidth = 1.5;
            g.strokeRect(lx - lw / 2, ly - lh / 2, lw, lh);
            continue;
          }
          // (blown: it blinks)
          g.fillStyle = st >= 4 ? (blink ? COL[3] : '#3a1512') : v.on ? COL[st] : '#3d4a40';
          g.fillRect(lx - lw / 2, ly - lh / 2, lw, lh);
        }
      }
    }
    // the odometer in the speedometer's face: six wheels of digits and a tenth in red
    const sp = l.dials.find((d) => d.kind === 'speed');
    if (sp) {
      const o = odoBox(l, sp);
      const km = Math.max(0, Math.min(999999.9, v.odoKm));
      const whole = Math.floor(km);
      const tenth = Math.floor((km - whole) * 10 + 1e-6);
      const s = String(whole).padStart(6, '0');
      const cw = (o.w - 7) / 7;
      for (let i = 0; i < 7; i++) {
        const bx = o.x + 3.5 + i * cw;
        g.fillStyle = i === 6 ? '#e9e2d2' : '#0b0a09';
        g.fillRect(bx + 0.75, o.y + 3.5, cw - 1.5, o.h - 7);
        g.fillStyle = i === 6 ? RED : '#f2efe8';
        g.font = `700 ${o.h * 0.66}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(i === 6 ? String(tenth) : s[i], bx + cw / 2, o.y + o.h / 2 + o.h * 0.04);
      }
    }
    this.tex.needsUpdate = true;
  }

  /** the plate as the vehicle's dashboard has it now */
  update(v: ClusterValues, dt: number): void {
    if (this.redline !== v.redline) this.paintBase(v.redline);
    this.blinkT = (this.blinkT + dt) % 0.8;
    const blink = this.blinkT < 0.4;
    const flat = v.tyres.some((t) => t >= 4);
    const km = Math.floor(v.odoKm * 10);
    const min = Math.floor(v.hour * 60);
    const key = `${v.on ? 1 : 0}|${LAMPS.map((l) => (v.lamps[l.id] ? 1 : 0)).join('')}|${v.gear}|${km}|${min}|${v.tyres.join(',')}|${flat && blink ? 1 : 0}|${this.layout.bike ? Math.round(v.outC) : ''}`;
    if (key !== this.shown) {
      this.shown = key;
      this.paintLive(v, blink);
    }
    // the needles, each a little behind what it shows (a cable, a bimetal strip)
    const lag = 1 - Math.exp(-dt * 9);
    const slow = 1 - Math.exp(-dt * 2.2);
    for (const n of this.needles) {
      const k = n.d.kind;
      const want = !v.on && k !== 'speed' && k !== 'air'
        ? 0
        : k === 'speed'
          ? Math.min(1, Math.abs(v.kmh) / 180)
          : k === 'rpm'
            ? Math.min(1, v.rpm / 8000)
            : k === 'fuel'
              ? Math.min(1, Math.max(0, v.fuel))
              : k === 'temp'
                ? Math.min(1, Math.max(0, (v.tempC - 40) / 90))
                : k === 'batt'
                  ? Math.min(1, Math.max(0, v.battery))
                  : Math.min(1, Math.max(0, (v.outC + 30) / 80));
      n.value = n.value < 0 ? want : n.value + (want - n.value) * (k === 'speed' || k === 'rpm' ? lag : slow);
      const [a0, a1] = SWEEP[k];
      n.pivot.rotation.z = -(a0 + (a1 - a0) * n.value) * DEG;
    }
    // lit: the faces glow
    this.glow += ((v.lit ? 1 : 0) - this.glow) * Math.min(1, dt * 6);
    this.mat.uniforms.uMapEmissive.value = GLOW * this.glow;
  }

  /**
   * How much of it is drawn: 0 all of it, 1 the plate alone (the vehicle standing off with nobody at it: one draw), 2
   * nothing (far off, where the dials are a few pixels behind the glass).
   */
  show(level: 0 | 1 | 2): void {
    this.group.visible = level < 2;
    this.box.visible = level === 0;
    for (const n of this.needles) n.pivot.visible = level === 0;
  }

  /** what a needle shows (0…1 of its dial), for the tests */
  reading(kind: DialDef['kind']): number {
    return this.needles.find((n) => n.d.kind === kind)?.value ?? -1;
  }

  private readonly inv = new THREE.Matrix4();
  private readonly pa = new THREE.Vector3();
  private readonly pb = new THREE.Vector3();

  /** does a look from `eye` along `dir` (the world's) fall on the plate, or within `margin` of it? */
  aimed(eye: THREE.Vector3, dir: THREE.Vector3, margin = 0.01): boolean {
    // (where the vehicle is now: its world matrix is otherwise the last frame drawn's, a third of a metre back at speed)
    this.group.updateWorldMatrix(true, false);
    const inv = this.inv.copy(this.group.matrixWorld).invert();
    const o = this.pa.copy(eye).applyMatrix4(inv);
    const d = this.pb.copy(dir).transformDirection(inv);
    // (from in front of it, towards it)
    if (o.z <= 0 || d.z > -1e-4) return false;
    const t = -o.z / d.z;
    return Math.abs(o.x + d.x * t) <= this.width / 2 + margin && Math.abs(o.y + d.y * t) <= this.height / 2 + margin;
  }

  /**
   * The plate's box on the screen, in the px of a frame `w` by `h` counted from its lower left (as a fragment has
   * them): its middle and half size into `out`. False where a corner of it is behind the eye.
   */
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
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    out.x = (x0 + x1) / 2;
    out.y = (y0 + y1) / 2;
    out.hx = (x1 - x0) / 2;
    out.hy = (y1 - y0) / 2;
    return true;
  }

  dispose(): void {
    this.plate.geometry.dispose();
    this.box.geometry.dispose();
    for (const n of this.needles) n.pivot.geometry.dispose();
    this.tex.dispose();
    this.mat.dispose();
    this.needleMat.dispose();
    this.caseMat.dispose();
  }
}

/** how bright the lit plate is (the texture drawn again by its own light) */
const GLOW = 0.6;

/**
 * Each frame's plate (docs/V3/plan/finish.md §五: fourteen cabs, one set of instruments, each laid out its own way):
 * its size and where it sits by what its dashboard leaves open to the driver's eye — under the cowl, over the lip
 * below the dials, clear of the steering column.
 */
export const CLUSTERS: Readonly<Record<string, ClusterSpec>> = {
  sedan: { style: 'round', scale: 0.86, top: 0.043, out: 0.03 },
  wagon: { style: 'round', scale: 0.86, top: 0.043, out: 0.03 },
  goat: { style: 'round', scale: 0.55, top: 0.052, out: 0.03 },
  rhino: { style: 'round', scale: 0.8, top: 0.09, out: 0.03, brow: true },
  rv: { style: 'round', scale: 0.78, top: 0.052, out: 0.03 },
  pickup: { style: 'round', scale: 0.66, top: 0.047, out: 0.03, notch: { x: 0.042, w: 0.07, h: 0.036 } },
  buffalo: { style: 'stack', scale: 0.62, top: 0.06, out: 0.03 },
  van: { style: 'stack', scale: 0.66, top: 0.07, out: 0.03, brow: true },
  turtle: { style: 'stack', scale: 0.66, top: 0.07, out: 0.03, brow: true },
  elephant: { style: 'stack', scale: 0.66, top: 0.07, out: 0.03, brow: true },
  camel: { style: 'stack', scale: 0.66, top: 0.07, out: 0.03, brow: true },
  snail: { style: 'round', scale: 0.86, top: 0.09, out: 0.03, brow: true },
  fox: { style: 'sport', scale: 0.86, top: 0.075 },
  moto: { style: 'bike', scale: 0.86, top: 0.125, out: 0.03, notch: { x: 0, w: 0.058, h: 0.042 } },
};
