/**
 * What the cab's instruments look like, drawn on canvases (cluster.ts lays them out and puts them in the cab): the dial
 * faces as a real cluster's are printed — a near-black face, warm white numerals and ticks, the rev counter's red past
 * the engine's red line, the fuel gauge E ½ F with the pump and the arrow to the filler's side, the coolant C – H
 * with its thermometer in the waves — the ISO 2575 symbols of the warning and indicator lamps, and the display between
 * the dials (the time, the air outside, the gear, the speed, the distance, the four tyres).
 *
 * Positions are in the face's centimetres (x to the right, y up, about the face's middle); a canvas has `px`
 * pixels a centimetre.
 */
import { BIG_SWEEP, LAMP_INFO, type LampId, type RpmScale, type SpeedScale, SMALL_SWEEP, TEMP_C, TEMP_H, TEMP_RED, tempFrac } from '../../core/modcar/instruments';

type Ctx = CanvasRenderingContext2D;

const DEG = Math.PI / 180;
/** the printing: warm white on a near-black face, red where harm is */
export const ART = {
  face: '#0d0e10',
  faceHi: '#191b1f',
  ink: '#f3efe6',
  dim: '#9b9fa6',
  red: '#ff3a2e',
  unlit: '#1f2124',
  screen: '#050607',
  lcd: '#f2eee4',
  amber: '#ffb12a',
};
/** the type: a narrow DIN face where the system has one (Bahnschrift on Windows), else a narrow sans */
export const FONT = '"Bahnschrift SemiBold SemiConden", "Bahnschrift", "DIN Alternate", "Roboto Condensed", "Arial Narrow", "Helvetica Neue", Arial, sans-serif';

/** a canvas's mapping: centimetres (y up, about `ox`, `oy`) to pixels */
export interface Sheet {
  g: Ctx;
  px: number;
  /** the canvas pixel of the face's (0, 0) */
  ox: number;
  oy: number;
}

function X(s: Sheet, x: number): number {
  return s.ox + x * s.px;
}
function Y(s: Sheet, y: number): number {
  return s.oy - y * s.px;
}

/** a point at clock angle `a` (rad, clockwise from straight up) and radius `r` about (cx, cy), in px */
function polar(s: Sheet, cx: number, cy: number, a: number, r: number): [number, number] {
  return [X(s, cx + Math.sin(a) * r), Y(s, cy + Math.cos(a) * r)];
}

function tick(s: Sheet, cx: number, cy: number, a: number, r0: number, r1: number, w: number, col: string): void {
  const [x0, y0] = polar(s, cx, cy, a, r0);
  const [x1, y1] = polar(s, cx, cy, a, r1);
  s.g.strokeStyle = col;
  s.g.lineWidth = w * s.px;
  s.g.lineCap = 'butt';
  s.g.beginPath();
  s.g.moveTo(x0, y0);
  s.g.lineTo(x1, y1);
  s.g.stroke();
}

function text(s: Sheet, t: string, x: number, y: number, size: number, col: string, align: CanvasTextAlign = 'center', weight = 600): void {
  const g = s.g;
  g.fillStyle = col;
  g.font = `${weight} ${size * s.px}px ${FONT}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(t, X(s, x), Y(s, y) + size * s.px * 0.05);
}

/** an arc band between radii r0 and r1 from clock angle a0 to a1 (rad) */
function band(s: Sheet, cx: number, cy: number, a0: number, a1: number, r0: number, r1: number, col: string): void {
  const g = s.g;
  g.fillStyle = col;
  g.beginPath();
  // (canvas angles: from +x, clockwise on screen; a clock angle a is canvas angle a − 90°)
  g.arc(X(s, cx), Y(s, cy), r1 * s.px, a0 - Math.PI / 2, a1 - Math.PI / 2);
  g.arc(X(s, cx), Y(s, cy), r0 * s.px, a1 - Math.PI / 2, a0 - Math.PI / 2, true);
  g.closePath();
  g.fill();
}

/** a round face's ground: a soft light at its middle, dark to its rim, a thin ring at its edge */
export function faceDisc(s: Sheet, cx: number, cy: number, r: number): void {
  const g = s.g;
  const gr = g.createRadialGradient(X(s, cx), Y(s, cy + r * 0.25), r * 0.05 * s.px, X(s, cx), Y(s, cy), r * s.px);
  gr.addColorStop(0, ART.faceHi);
  gr.addColorStop(1, ART.face);
  g.fillStyle = gr;
  g.beginPath();
  g.arc(X(s, cx), Y(s, cy), r * s.px, 0, Math.PI * 2);
  g.fill();
}

/**
 * A big dial's face: the speedometer (`speed`) or the rev counter (`rpm`). Ticks and numerals round 275°, the rev
 * counter's red from its engine's red line, the unit under the hub.
 */
export function drawBigDial(s: Sheet, kind: 'speed' | 'rpm', cx: number, cy: number, r: number, sp: SpeedScale, rp: RpmScale): void {
  faceDisc(s, cx, cy, r);
  const a0 = (-BIG_SWEEP / 2) * DEG;
  const span = BIG_SWEEP * DEG;
  const at = (f: number): number => a0 + span * f;
  // the outer ring the ticks hang from
  s.g.strokeStyle = 'rgba(243,239,230,0.55)';
  s.g.lineWidth = r * 0.012 * s.px;
  s.g.beginPath();
  s.g.arc(X(s, cx), Y(s, cy), r * 0.955 * s.px, at(0) - Math.PI / 2, at(1) - Math.PI / 2);
  s.g.stroke();
  if (kind === 'speed') {
    const minor = sp.step >= 40 ? 10 : 5;
    for (let v = 0; v <= sp.max + 1e-6; v += minor) {
      const f = v / sp.max;
      const major = v % sp.step === 0;
      const mid = !major && v % (sp.step / 2) === 0;
      const long = major ? 0.17 : mid ? 0.11 : 0.065;
      tick(s, cx, cy, at(f), r * (0.955 - long), r * 0.955, r * (major ? 0.04 : mid ? 0.026 : 0.016), ART.ink);
      if (major) text(s, String(v), cx + Math.sin(at(f)) * r * 0.62, cy + Math.cos(at(f)) * r * 0.62, r * (v >= 100 ? 0.165 : 0.18), ART.ink, 'center', 600);
    }
    text(s, 'km/h', cx, cy - r * 0.36, r * 0.12, ART.dim, 'center', 500);
  } else {
    const max = rp.max * 1000;
    const redF = rp.red / max;
    band(s, cx, cy, at(redF), at(1), r * 0.83, r * 0.955, ART.red);
    for (let v = 0; v <= max + 1e-6; v += 250) {
      const f = v / max;
      const major = v % 1000 === 0;
      const mid = !major && v % 500 === 0;
      const long = major ? 0.17 : mid ? 0.11 : 0.06;
      const col = v >= rp.red - 1e-6 ? '#ffd9d4' : ART.ink;
      tick(s, cx, cy, at(f), r * (0.955 - long), r * 0.955, r * (major ? 0.04 : mid ? 0.026 : 0.016), col);
      if (major) text(s, String(v / 1000), cx + Math.sin(at(f)) * r * 0.64, cy + Math.cos(at(f)) * r * 0.64, r * 0.2, v >= rp.red - 1e-6 ? ART.red : ART.ink, 'center', 600);
    }
    text(s, '×1000r/min', cx, cy - r * 0.36, r * 0.105, ART.dim, 'center', 500);
  }
}

/**
 * A fuel or coolant gauge: a quarter of a circle from pointing left (empty, cold) to pointing up (full, hot) about its
 * pivot (`form` 'quarter', as Nomad Drive's), or the top quarter of a round face about its middle ('round'). Its ends
 * lettered, its red where harm is, its symbol inside the arc; the fuel's with the arrow to the side its filler is on.
 */
export function drawSmallDial(s: Sheet, kind: 'fuel' | 'temp', form: 'quarter' | 'round', cx: number, cy: number, r: number, fillerRight: boolean): void {
  const a0 = form === 'quarter' ? -90 * DEG : -SMALL_SWEEP * 0.5 * DEG;
  const span = SMALL_SWEEP * DEG;
  const at = (f: number): number => a0 + span * f;
  if (form === 'round') faceDisc(s, cx, cy, r);
  // the scale's radius: the quarter's to its edge, the round one's well inside its rim
  const R = form === 'quarter' ? r : r * 0.86;
  s.g.strokeStyle = ART.ink;
  s.g.lineWidth = R * 0.025 * s.px;
  s.g.beginPath();
  s.g.arc(X(s, cx), Y(s, cy), R * s.px, at(0) - Math.PI / 2, at(1) - Math.PI / 2);
  s.g.stroke();
  if (kind === 'fuel') band(s, cx, cy, at(0), at(0.12), R * 0.8, R, ART.red);
  else band(s, cx, cy, at(tempFrac(TEMP_RED)), at(1), R * 0.8, R, ART.red);
  for (let i = 0; i <= 4; i++) {
    const f = i / 4;
    const major = i % 2 === 0;
    const red = kind === 'fuel' ? f < 0.12 : f >= tempFrac(TEMP_RED);
    tick(s, cx, cy, at(f), R * (major ? 0.72 : 0.8), R, R * (major ? 0.07 : 0.05), red ? ART.red : ART.ink);
  }
  const lab = kind === 'fuel' ? ['E', 'F'] : ['C', 'H'];
  const sz = R * 0.26;
  // (the letters just past the arc's ends: below the left end, beside the top end)
  const e0 = polar(s, cx, cy, at(0), R * 0.86);
  const e1 = polar(s, cx, cy, at(1), R * 0.86);
  const toCm = (p: [number, number]): [number, number] => [(p[0] - s.ox) / s.px, (s.oy - p[1]) / s.px];
  const [lx, ly] = toCm(e0);
  const [hx, hy] = toCm(e1);
  const along = form === 'quarter';
  text(s, lab[0], lx, ly - (along ? sz * 0.9 : sz * 0.95), sz, kind === 'fuel' ? ART.red : ART.ink, 'center', 700);
  text(s, lab[1], hx + (along ? sz * 0.85 : 0), hy - (along ? 0 : sz * 0.95), sz, kind === 'temp' ? ART.red : ART.ink, 'center', 700);
  if (kind === 'fuel') {
    const [mx, my] = toCm(polar(s, cx, cy, at(0.5), R * 0.92));
    text(s, '½', mx, my - sz * 0.75, sz * 0.8, ART.ink, 'center', 600);
  }
  // its symbol inside the arc, a third of the way out
  const ic = form === 'quarter' ? toCm(polar(s, cx, cy, at(0.5), R * 0.5)) : ([cx, cy + R * 0.28] as [number, number]);
  const isz = R * (form === 'quarter' ? 0.42 : 0.4);
  symbol(s, kind === 'fuel' ? 'fuel' : 'coolant', ic[0], ic[1], isz, ART.dim);
  if (kind === 'fuel') {
    // the filler's side: a little triangle beside the pump, pointing to it
    const tx = ic[0] + (fillerRight ? 1 : -1) * isz * 0.78;
    const g = s.g;
    g.fillStyle = ART.dim;
    g.beginPath();
    const d = fillerRight ? 1 : -1;
    g.moveTo(X(s, tx + d * isz * 0.2), Y(s, ic[1]));
    g.lineTo(X(s, tx - d * isz * 0.1), Y(s, ic[1] + isz * 0.18));
    g.lineTo(X(s, tx - d * isz * 0.1), Y(s, ic[1] - isz * 0.18));
    g.closePath();
    g.fill();
  }
  void TEMP_C;
  void TEMP_H;
}

/** a rounded rectangle's path, about (cx, cy) in cm */
export function roundRect(s: Sheet, cx: number, cy: number, w: number, h: number, r: number): void {
  s.g.beginPath();
  s.g.roundRect(X(s, cx - w / 2), Y(s, cy + h / 2), w * s.px, h * s.px, r * s.px);
}

/**
 * A lamp's symbol (ISO 2575), drawn in `col` filling a square of `size` cm about (x, y). The same drawing serves the
 * lamps (lit or dark) and the dials' own symbols.
 */
export function symbol(s: Sheet, id: LampId | 'coolantDial', x: number, y: number, size: number, col: string): void {
  const g = s.g;
  const k = (size * s.px) / 64;
  g.save();
  g.translate(X(s, x), Y(s, y));
  g.scale(k, k);
  g.strokeStyle = col;
  g.fillStyle = col;
  g.lineWidth = 5;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const line = (...pts: number[]): void => {
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.stroke();
  };
  const brackets = (): void => {
    // the two arcs either side of a brake's circle
    g.lineWidth = 4.5;
    g.beginPath();
    g.arc(0, 0, 27, -0.85, 0.85);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, 27, Math.PI - 0.85, Math.PI + 0.85);
    g.stroke();
    g.lineWidth = 5;
  };
  switch (id) {
    case 'turnL':
    case 'turnR': {
      const d = id === 'turnL' ? -1 : 1;
      g.beginPath();
      g.moveTo(d * 28, 0);
      g.lineTo(d * 4, -22);
      g.lineTo(d * 4, -10);
      g.lineTo(-d * 26, -10);
      g.lineTo(-d * 26, 10);
      g.lineTo(d * 4, 10);
      g.lineTo(d * 4, 22);
      g.closePath();
      g.fill();
      break;
    }
    case 'low':
    case 'high': {
      // the lamp: a lens round at its back (right), flat at its front (left), its beams out to the left
      g.beginPath();
      g.moveTo(2, -17);
      g.bezierCurveTo(30, -17, 30, 17, 2, 17);
      g.closePath();
      g.fill();
      g.lineWidth = 4.6;
      const dy = id === 'high' ? 0 : 7;
      for (const yy of [-14, -4.7, 4.7, 14]) line(-4, yy, -27, yy + dy);
      break;
    }
    case 'park': {
      g.beginPath();
      g.arc(0, 0, 19, 0, Math.PI * 2);
      g.stroke();
      brackets();
      g.font = `700 26px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('P', 0, 1.5);
      break;
    }
    case 'brake': {
      g.beginPath();
      g.arc(0, 0, 19, 0, Math.PI * 2);
      g.stroke();
      brackets();
      line(0, -10, 0, 3);
      g.beginPath();
      g.arc(0, 10, 2.8, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'oil': {
      // an oil can, its spout to the right, a drop falling from it
      g.lineWidth = 4.6;
      g.beginPath();
      g.moveTo(-26, -4);
      g.lineTo(-14, -1);
      g.lineTo(-8, -9);
      g.lineTo(10, -9);
      g.lineTo(26, -14);
      g.lineTo(13, 8);
      g.lineTo(-14, 8);
      g.lineTo(-14, -1);
      g.stroke();
      line(-1, -9, -1, -15);
      line(-7, -16, 5, -16);
      g.beginPath();
      g.moveTo(25, 0);
      g.quadraticCurveTo(29, 7, 25, 9.5);
      g.quadraticCurveTo(21, 7, 25, 0);
      g.fill();
      break;
    }
    case 'charge': {
      g.lineWidth = 4.6;
      g.strokeRect(-24, -12, 48, 30);
      g.fillRect(-18, -19, 10, 7);
      g.fillRect(8, -19, 10, 7);
      line(-17, 3, -7, 3);
      line(7, 3, 17, 3);
      line(12, -2, 12, 8);
      break;
    }
    case 'coolant':
    case 'coolantDial': {
      // a thermometer standing in waves
      line(0, -24, 0, 4);
      g.beginPath();
      g.arc(0, 8, 6, 0, Math.PI * 2);
      g.fill();
      line(3, -18, 11, -18);
      line(3, -10, 11, -10);
      line(3, -2, 9, -2);
      g.lineWidth = 4.2;
      for (const yy of [16, 25]) {
        g.beginPath();
        g.moveTo(-26, yy);
        for (let xx = -26; xx <= 26; xx += 2) g.lineTo(xx, yy + Math.sin((xx + 26) * 0.33) * 2.6);
        g.stroke();
      }
      break;
    }
    case 'fuel': {
      // a pump: its body with the window, the hose round to the nozzle on its right
      g.lineWidth = 4.6;
      g.strokeRect(-20, -22, 24, 44);
      g.fillRect(-15, -17, 14, 11);
      line(-25, 22, 9, 22);
      g.beginPath();
      g.moveTo(4, -10);
      g.lineTo(14, -10);
      g.lineTo(18, -4);
      g.lineTo(18, 12);
      g.quadraticCurveTo(18, 17, 13, 17);
      g.stroke();
      line(14, -10, 20, -17);
      break;
    }
    case 'engine': {
      // an engine block from the side: the block, the intake on top, the fan on the left, the gearbox's stub on the right
      g.lineWidth = 4.6;
      g.beginPath();
      g.moveTo(-17, -10);
      g.lineTo(13, -10);
      g.lineTo(19, -4);
      g.lineTo(26, -4);
      g.lineTo(26, 12);
      g.lineTo(19, 12);
      g.lineTo(13, 18);
      g.lineTo(-17, 18);
      g.lineTo(-17, 8);
      g.lineTo(-26, 8);
      g.lineTo(-26, -1);
      g.lineTo(-17, -1);
      g.closePath();
      g.stroke();
      line(-8, -10, -8, -17, 6, -17, 6, -10);
      line(-12, -20, 10, -20);
      break;
    }
    case 'tyre': {
      // a tyre's section, open at the top, its tread below, an exclamation mark in it
      g.lineWidth = 4.6;
      g.beginPath();
      g.moveTo(-22, -18);
      g.quadraticCurveTo(-28, 2, -20, 16);
      g.lineTo(20, 16);
      g.quadraticCurveTo(28, 2, 22, -18);
      g.stroke();
      for (const xx of [-14, -5, 4, 13]) line(xx, 16, xx + 3, 22);
      line(0, -12, 0, 3);
      g.beginPath();
      g.arc(0, 9, 2.6, 0, Math.PI * 2);
      g.fill();
      break;
    }
  }
  g.restore();
}

/** each lamp's symbol at its own size of a cell of the icon sheet (the lamps' quads read it): white on clear, a soft halo round it */
export function drawIconSheet(g: Ctx, cell: number, ids: readonly LampId[]): void {
  g.clearRect(0, 0, g.canvas.width, g.canvas.height);
  ids.forEach((id, i) => {
    const s: Sheet = { g, px: cell, ox: cell * (i + 0.5), oy: cell * 0.5 };
    // (the halo: the symbol blurred, as the light spreads in the lens; then the symbol sharp over it)
    g.save();
    g.filter = `blur(${(cell * 0.06).toFixed(1)}px)`;
    g.globalAlpha = 0.55;
    symbol(s, id, 0, 0, 0.8, '#ffffff');
    g.restore();
    symbol(s, id, 0, 0, 0.8, '#ffffff');
  });
}

/** what the display between the dials shows */
export interface ScreenData {
  power: boolean;
  /** the time of day (h) and the air outside (°C) */
  hour: number;
  outC: number;
  gear: string;
  kmh: number;
  odoKm: number;
  /** the four tyres (FL, FR, RL, RR; front and rear on two wheels): −1 none, 0 … 3 how worn, 4 blown */
  tyres: readonly number[];
  /** the blown one's blink is lit */
  blink: boolean;
  /** fuel 0 … 1 and the coolant (°C), for a motorcycle's bars */
  fuel: number;
  coolantC: number;
}

const TYRE_COL = ['#3fe06a', '#b9e04a', '#ffb12a', '#ff3a2e'];

/**
 * The display between the dials, a w × h cm screen about (cx, cy): the time and the air outside along its top (a
 * snowflake at 3 °C and under: ice on the road), the gear and the speed large across its middle, the four tyres and the
 * distance along its foot.
 */
export function drawScreen(s: Sheet, cx: number, cy: number, w: number, h: number, d: ScreenData): void {
  const g = s.g;
  g.fillStyle = ART.screen;
  g.fillRect(X(s, cx - w / 2), Y(s, cy + h / 2), w * s.px, h * s.px);
  if (!d.power) return;
  const top = cy + h / 2;
  const row = h / 4;
  const t = ((d.hour % 24) + 24) % 24;
  const hh = Math.floor(t);
  const mm = Math.floor((t - hh) * 60);
  text(s, `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, cx - w / 2 + w * 0.05, top - row * 0.55, row * 0.82, ART.lcd, 'left', 600);
  const cold = d.outC <= 3;
  text(s, `${Math.round(d.outC)}°C`, cx + w / 2 - w * (cold ? 0.13 : 0.05), top - row * 0.55, row * 0.82, cold ? ART.amber : ART.lcd, 'right', 600);
  if (cold) snowflake(s, cx + w / 2 - w * 0.065, top - row * 0.55, row * 0.7, ART.amber);
  // the gear in a box, the speed large
  const my = cy + h * 0.02;
  const gw = w * 0.2;
  const gx = cx - w / 2 + w * 0.05 + gw / 2;
  g.strokeStyle = ART.lcd;
  g.lineWidth = Math.max(1, row * 0.07 * s.px);
  roundRect(s, gx, my, gw, row * 1.7, row * 0.25);
  g.stroke();
  text(s, d.gear, gx, my, row * (d.gear.length > 2 ? 0.95 : 1.3), ART.lcd, 'center', 700);
  text(s, String(Math.round(Math.abs(d.kmh))), cx + w * 0.22, my, row * 1.75, ART.lcd, 'right', 700);
  text(s, 'km/h', cx + w * 0.24, my - row * 0.45, row * 0.62, ART.dim, 'left', 500);
  // the tyres from above, the distance
  const fy = cy - h / 2 + row * 0.62;
  tyresFromAbove(s, cx - w / 2 + w * 0.1, fy, row * 1.0, d.tyres, d.blink);
  const km = Math.max(0, Math.min(999999, Math.floor(d.odoKm)));
  text(s, `${String(km).padStart(6, '0')} km`, cx + w / 2 - w * 0.05, fy, row * 0.82, ART.lcd, 'right', 600);
}

/** a motorcycle's little screen in a dial: a number and a bar of six segments (the fuel's, the coolant's) */
export function drawLcd(s: Sheet, cx: number, cy: number, w: number, h: number, value: string, bar: number, barRed: boolean, d: ScreenData): void {
  const g = s.g;
  g.fillStyle = ART.screen;
  g.fillRect(X(s, cx - w / 2), Y(s, cy + h / 2), w * s.px, h * s.px);
  if (!d.power) return;
  text(s, value, cx - w / 2 + w * 0.06, cy + h * 0.12, h * 0.55, ART.lcd, 'left', 700);
  const n = 6;
  const on = Math.round(Math.min(1, Math.max(0, bar)) * n);
  const sw = (w * 0.42) / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = i < on ? (barRed && (i === 0 || i === n - 1) ? ART.red : ART.lcd) : '#1a1c1f';
    g.fillRect(X(s, cx + w * 0.04 + i * sw), Y(s, cy - h * 0.08 + h * 0.05 * i), sw * 0.78 * s.px, (h * 0.22 + h * 0.05 * i) * s.px);
  }
}

function snowflake(s: Sheet, x: number, y: number, size: number, col: string): void {
  const g = s.g;
  g.strokeStyle = col;
  g.lineWidth = Math.max(1, size * 0.12 * s.px);
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI) / 3;
    const dx = Math.cos(a) * size * 0.5;
    const dy = Math.sin(a) * size * 0.5;
    g.beginPath();
    g.moveTo(X(s, x - dx), Y(s, y - dy));
    g.lineTo(X(s, x + dx), Y(s, y + dy));
    g.stroke();
  }
}

/** the vehicle from above and a block at each wheel in its tyre's colour (green new … red worn through; a blown one blinks) */
function tyresFromAbove(s: Sheet, x: number, y: number, size: number, tyres: readonly number[], blink: boolean): void {
  const g = s.g;
  const two = tyres.length === 2;
  g.fillStyle = '#2b2e33';
  roundRect(s, x, y, size * (two ? 0.18 : 0.42), size * 0.95, size * 0.12);
  g.fill();
  const spots: [number, number][] = two
    ? [
        [x, y + size * 0.42],
        [x, y - size * 0.42],
      ]
    : [
        [x - size * 0.3, y + size * 0.3],
        [x + size * 0.3, y + size * 0.3],
        [x - size * 0.3, y - size * 0.3],
        [x + size * 0.3, y - size * 0.3],
      ];
  spots.forEach(([tx, ty], i) => {
    const st = tyres[i] ?? -1;
    if (st < 0) {
      g.strokeStyle = '#3a3d42';
      g.lineWidth = 1;
      roundRect(s, tx, ty, size * 0.16, size * 0.3, size * 0.04);
      g.stroke();
      return;
    }
    g.fillStyle = st >= 4 ? (blink ? ART.red : '#3a1210') : TYRE_COL[Math.min(3, st)];
    roundRect(s, tx, ty, size * 0.16, size * 0.3, size * 0.04);
    g.fill();
  });
}

/** what each lamp is called (the tests, the walkthroughs' notes) */
export function lampName(id: LampId): string {
  return LAMP_INFO[id].zh;
}
