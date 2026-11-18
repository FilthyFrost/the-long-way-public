/**
 * What stands on the proving ground, drawn (docs/MODCAR.md §28; where and how big: core/modcar/proving/props.ts): the
 * control tower and the shed on the apron, the start gantry with its lights, the sections' signboards, the distance
 * boards down the straight, the tyre stacks and the windsock by the turning circle, the lamps, the posts at the
 * off-road course's features; and the cone (cones.ts), the logs across the loop. Modelled in code, flat-painted and
 * inked as the vehicles and the garage's things are (STYLE.md §2.3 the cel way); the buildings brushed as the
 * places by the road are. The words on the boards are painted on a canvas in the UI's own faces (ui.ts).
 */
import * as THREE from 'three';
import { CONE } from '../../core/modcar/proving/cones';
import { APRON, FEATURES, LANE_OUT, LOGS, STRAIGHT, type ProvingGround } from '../../core/modcar/proving/layout';

const APRON_X0 = APRON.x0;
import { BOARDS, GANTRY_HEIGHT, GANTRY_POST_Z, SHED, SIGNS, TOWER, type Prop } from '../../core/modcar/proving/props';
import { surfaceMaterial } from '../render/materials';
import type { globals } from '../render/shaderlib';
import { castShadows } from '../render/shadow';
import { PaintBuilder } from '../scene/paintBuilder';

// ------------------------------------------------------------------ paints

const WHITE = 0xf1ede2;
const CREAM = 0xe6dcc4;
const CREAM_D = 0xd2c6aa;
const ORANGE = 0xe0682a;
const RED = 0xc23b2c;
const STEEL = 0x8b959c;
const STEEL_D = 0x5d666d;
const DARK = 0x2c3136;
const GLASS = 0x3e5866;
const TYRE = 0x26272b;
const CONCRETE = 0xb3ad9f;
const YELLOW = 0xe8b43a;
const TEAL = 0x2f6468;
const SAGE = 0x8fb3a6;
const SAGE_D = 0x7fa396;
const ROOF = 0x6e7a80;
const ROOF_D = 0x5f6a70;

const shade = (hex: number, k: number): THREE.Color => new THREE.Color(hex).multiplyScalar(1 + k);

// ------------------------------------------------------------------ the cone

/**
 * The traffic cone: an orange body with two white reflective collars, its tip rounded, on a black octagonal base
 * (round enough that lying on its side it rests on the rim cones.ts has it resting on). Origin at the base's middle,
 * its axis up; CONE's size.
 */
export function coneGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const seg = 18;
  const y0 = 0.032;
  const yTop = CONE.h;
  const r0 = 0.135;
  const r1 = 0.02;
  const rAt = (y: number): number => r0 + ((r1 - r0) * (y - y0)) / (yTop - 0.012 - y0);
  const tri = (a: number[], b: number[], cc: number[], na: number[], nb: number[], nc: number[], hex: number): void => {
    c.set(hex);
    pos.push(...a, ...b, ...cc);
    nrm.push(...na, ...nb, ...nc);
    for (let i = 0; i < 3; i++) col.push(c.r, c.g, c.b);
  };
  // the body's bands: orange, a white collar, orange, a narrower white one, orange to the tip
  const bands: [number, number, number][] = [
    [y0, 0.205, ORANGE],
    [0.205, 0.27, 0xf4f2ec],
    [0.27, 0.315, ORANGE],
    [0.315, 0.36, 0xf4f2ec],
    [0.36, yTop - 0.012, ORANGE],
  ];
  const slope = (r0 - r1) / (yTop - 0.012 - y0);
  for (const [ya, yb, hex] of bands) {
    const ra = rAt(ya);
    const rb = rAt(yb);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const n0 = new THREE.Vector3(Math.cos(a0), slope, Math.sin(a0)).normalize().toArray();
      const n1 = new THREE.Vector3(Math.cos(a1), slope, Math.sin(a1)).normalize().toArray();
      const p00 = [Math.cos(a0) * ra, ya, Math.sin(a0) * ra];
      const p01 = [Math.cos(a1) * ra, ya, Math.sin(a1) * ra];
      const p10 = [Math.cos(a0) * rb, yb, Math.sin(a0) * rb];
      const p11 = [Math.cos(a1) * rb, yb, Math.sin(a1) * rb];
      tri(p00, p10, p11, n0, n0, n1, hex);
      tri(p00, p11, p01, n0, n1, n1, hex);
    }
  }
  // the rounded tip
  {
    const ya = yTop - 0.012;
    const ra = rAt(ya);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const p0 = [Math.cos(a0) * ra, ya, Math.sin(a0) * ra];
      const p1 = [Math.cos(a1) * ra, ya, Math.sin(a1) * ra];
      const n0 = new THREE.Vector3(Math.cos(a0), 0.8, Math.sin(a0)).normalize().toArray();
      const n1 = new THREE.Vector3(Math.cos(a1), 0.8, Math.sin(a1)).normalize().toArray();
      tri(p0, [0, yTop, 0], p1, n0, [0, 1, 0], n1, ORANGE);
    }
  }
  // the base: an octagon, its top edge chamfered, black rubber; its underside hollow (a ring and the dark inside)
  const oct = 8;
  const rb = CONE.r / Math.cos(Math.PI / oct);
  const ring = (r: number, y: number, i: number): number[] => {
    const a = ((i + 0.5) / oct) * Math.PI * 2;
    return [Math.cos(a) * r, y, Math.sin(a) * r];
  };
  const BASE = 0x1e1f22;
  const up = [0, 1, 0];
  const down = [0, -1, 0];
  // a flat face, wound to look the way it should (want): the base is seen from above standing, from below lying
  const flat = (a: number[], b: number[], cc: number[], hex: number, want: number[]): void => {
    const u = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const v = new THREE.Vector3(cc[0] - a[0], cc[1] - a[1], cc[2] - a[2]);
    const n = u.cross(v).normalize();
    if (n.x * want[0] + n.y * want[1] + n.z * want[2] < 0) {
      n.negate();
      const na = n.toArray();
      tri(a, cc, b, na, na, na, hex);
      return;
    }
    const na = n.toArray();
    tri(a, b, cc, na, na, na, hex);
  };
  for (let i = 0; i < oct; i++) {
    const j = (i + 1) % oct;
    const t0 = ring(rb - 0.02, y0, i);
    const t1 = ring(rb - 0.02, y0, j);
    const m0 = ring(rb, y0 - 0.01, i);
    const m1 = ring(rb, y0 - 0.01, j);
    const b0 = ring(rb, 0, i);
    const b1 = ring(rb, 0, j);
    const in0 = ring(r0 - 0.002, y0, i);
    const in1 = ring(r0 - 0.002, y0, j);
    const am = ((i + 1) / oct) * Math.PI * 2;
    const out = [Math.cos(am), 0, Math.sin(am)];
    const outUp = [Math.cos(am), 1, Math.sin(am)];
    // top (from the body's foot out to the chamfer), the chamfer, the side
    flat(in0, t0, t1, BASE, up);
    flat(in0, t1, in1, BASE, up);
    flat(t0, m0, m1, BASE, outUp);
    flat(t0, m1, t1, BASE, outUp);
    flat(m0, b0, b1, BASE, out);
    flat(m0, b1, m1, BASE, out);
    // underneath: the rim, and the hollow up inside the body
    const u0 = ring(rb - 0.03, 0, i);
    const u1 = ring(rb - 0.03, 0, j);
    flat(b0, u0, u1, BASE, down);
    flat(b0, u1, b1, BASE, down);
    flat(u0, [0, 0.03, 0], u1, 0x0d0d0f, down);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------ the logs

/** the logs lying across the loop: bark in ridges round them, their sawn ends ringed; heights as layout.ts LOGS has them */
export function logGeometry(list: { x: number; z: number; ax: number; az: number; at: number }[]): { geometry: THREE.BufferGeometry; wx: number; wz: number } {
  const b = new PaintBuilder();
  const wx = list[0].x;
  const wz = list[0].z;
  // (a log of radius r lying a hand into the gravel: its top a little over the bump the wheels feel, the gravel
  // heaped against its flanks)
  const r = 0.2;
  const cy = LOGS.h + 0.035 - r;
  const len = LOGS.half * 2 + 0.1;
  const seg = 11;
  const m = new THREE.Matrix4();
  list.forEach((l, li) => {
    // the log's axis across the loop: build it along x, turn it onto (ax, az)
    const yaw = Math.atan2(l.az, l.ax);
    m.makeRotationY(-yaw).setPosition(l.x - wx, 0, l.z - wz);
    b.within(m, () => {
      let s = 7 + li * 13;
      const rnd = (): number => {
        s = (s * 16807) % 2147483647;
        return s / 2147483647;
      };
      const half = len / 2 + (rnd() - 0.5) * 0.2;
      const bark = [0x6b5038, 0x3f2e22, 0x7d6045, 0x553f2e];
      // the bark: a ring of long faces, each its own shade, a little knobbly
      const ring: number[][] = [];
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const rr = r * (0.94 + 0.12 * (i === seg ? 0.5 : rnd()));
        ring.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      }
      ring[seg] = ring[0];
      for (let i = 0; i < seg; i++) {
        const [y0, z0] = ring[i];
        const [y1, z1] = ring[i + 1];
        b.hull(
          [
            [-half, cy + y0, z0],
            [half, cy + y0 * 0.97, z0 * 0.97],
            [-half, cy + y1, z1],
            [half, cy + y1 * 0.97, z1 * 0.97],
            [-half, cy, 0],
            [half, cy, 0],
          ],
          bark[(i + (rnd() < 0.3 ? 1 : 0)) % 4],
        );
      }
      // the bark in rings where it has grown thick, a knot or two, the stub of a branch sawn off
      for (let x = -half + 0.5 + rnd() * 0.4; x < half - 0.4; x += 0.7 + rnd() * 0.6) {
        b.cyl(x, cy, 0, r * 1.06, 0.07 + 0.06 * rnd(), bark[(li + Math.floor(x * 3)) & 1 ? 1 : 3], { rz: Math.PI / 2, segments: seg });
      }
      for (let k = 0; k < 3; k++) {
        const x = (rnd() - 0.5) * (half * 1.6);
        const a = (0.15 + rnd() * 0.7) * Math.PI;
        b.cyl(x, cy + Math.sin(a) * r * 0.98, Math.cos(a) * r * 0.98, 0.045, 0.05, 0x3f2e22, { rx: Math.PI / 2 - a, segments: 7 });
      }
      {
        const x = (rnd() - 0.5) * half;
        b.cyl(x, cy + r * 0.92, 0.05, 0.05, 0.22, bark[0], { rx: -0.35, rz: 0.5, segments: 7 });
        b.cyl(x + 0.05, cy + r * 0.92 + 0.11, 0.0, 0.047, 0.005, 0xd9b886, { rx: -0.35, rz: 0.5, segments: 7 });
      }
      // the sawn ends: pale wood, rings round the heart
      for (const sx of [-1, 1]) {
        const x = sx * (half + 0.004);
        for (let k = 0; k < 4; k++) {
          const rr = r * (1 - k * 0.24);
          b.cyl(x + sx * k * 0.002, cy, 0, rr, 0.004, k % 2 ? 0xc79f6b : 0xd9b886, { rz: Math.PI / 2, segments: seg });
        }
      }
    });
  });
  return { geometry: b.build(), wx, wz };
}

// ------------------------------------------------------------------ the boards' words

/** the sign atlas: every board's face, painted once */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const ATLAS_W = 2048;
const ATLAS_H = 1280;
const ZH = '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';
const NUM = '"Bahnschrift", "Arial Narrow", "Arial", sans-serif';

/** each section's colour and pictogram */
const ACCENT: Record<string, string> = { accel: '#d9662d', brake: '#c0392b', skidpad: '#2f7aa8', slalom: '#e0a52a', offroad: '#6b8a3a', hill: '#7a6a58' };

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

/** a section's pictogram in white, in a box of side S at (x, y) */
function pictogram(c: CanvasRenderingContext2D, id: string, x: number, y: number, S: number): void {
  c.save();
  c.translate(x, y);
  c.scale(S / 100, S / 100);
  c.strokeStyle = '#fff';
  c.fillStyle = '#fff';
  c.lineWidth = 7;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const car = (cx: number, cy: number, k = 1): void => {
    c.save();
    c.translate(cx, cy);
    c.scale(k, k);
    c.beginPath();
    c.moveTo(-26, 6);
    c.lineTo(-24, -6);
    c.lineTo(-12, -8);
    c.lineTo(-4, -18);
    c.lineTo(14, -18);
    c.lineTo(22, -8);
    c.lineTo(28, -6);
    c.lineTo(28, 6);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.0)';
    for (const wx of [-14, 16]) {
      c.beginPath();
      c.arc(wx, 7, 7, 0, Math.PI * 2);
      c.fillStyle = '#fff';
      c.fill();
    }
    c.restore();
  };
  switch (id) {
    case 'accel':
      car(56, 56, 1.1);
      for (const [yy, l] of [[38, 20], [52, 28], [66, 18]]) {
        c.beginPath();
        c.moveTo(10, yy);
        c.lineTo(10 + l, yy);
        c.stroke();
      }
      break;
    case 'brake':
      c.beginPath();
      c.arc(50, 50, 30, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.arc(50, 50, 9, 0, Math.PI * 2);
      c.fill();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        c.beginPath();
        c.arc(50 + Math.cos(a) * 19, 50 + Math.sin(a) * 19, 3.5, 0, Math.PI * 2);
        c.fill();
      }
      c.lineWidth = 12;
      c.beginPath();
      c.arc(50, 50, 40, -1.1, -0.2);
      c.stroke();
      break;
    case 'skidpad':
      c.lineWidth = 8;
      c.beginPath();
      c.arc(50, 52, 30, 0.35, Math.PI * 2 - 0.35);
      c.stroke();
      c.beginPath();
      c.moveTo(81, 58);
      c.lineTo(80, 36);
      c.lineTo(64, 48);
      c.closePath();
      c.fill();
      c.beginPath();
      c.arc(50, 52, 6, 0, Math.PI * 2);
      c.fill();
      break;
    case 'slalom':
      for (const [cx, cy] of [[22, 30], [50, 70], [78, 30]]) {
        c.beginPath();
        c.moveTo(cx - 8, cy + 10);
        c.lineTo(cx, cy - 12);
        c.lineTo(cx + 8, cy + 10);
        c.closePath();
        c.fill();
      }
      c.lineWidth = 6;
      c.beginPath();
      c.moveTo(8, 62);
      c.bezierCurveTo(26, 62, 30, 44, 38, 40);
      c.bezierCurveTo(48, 34, 56, 44, 62, 50);
      c.bezierCurveTo(70, 60, 76, 62, 90, 58);
      c.stroke();
      break;
    case 'offroad':
      c.beginPath();
      c.moveTo(6, 80);
      c.lineTo(34, 34);
      c.lineTo(48, 54);
      c.lineTo(64, 24);
      c.lineTo(94, 80);
      c.closePath();
      c.fill();
      c.fillStyle = ACCENT.offroad;
      c.beginPath();
      c.moveTo(58, 36);
      c.lineTo(64, 24);
      c.lineTo(70, 36);
      c.lineTo(66, 40);
      c.lineTo(62, 35);
      c.closePath();
      c.fill();
      break;
    case 'hill':
      c.beginPath();
      c.moveTo(6, 84);
      c.lineTo(94, 84);
      c.lineTo(94, 30);
      c.closePath();
      c.fill();
      c.save();
      c.translate(52, 50);
      c.rotate(-0.55);
      c.fillStyle = ACCENT.hill;
      car(0, 0, 0.75);
      c.restore();
      break;
  }
  c.restore();
}

/** a little chipped paint at a board's edges (seeded) */
function chips(c: CanvasRenderingContext2D, r: Rect, seed: number, n: number): void {
  let s = seed;
  const rnd = (): number => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < n; i++) {
    const edge = rnd() < 0.75;
    const x = edge ? (rnd() < 0.5 ? r.x + rnd() * 18 : r.x + r.w - rnd() * 18) : r.x + rnd() * r.w;
    const y = edge && rnd() < 0.5 ? (rnd() < 0.5 ? r.y + rnd() * 14 : r.y + r.h - rnd() * 14) : r.y + rnd() * r.h;
    const rr = 1 + rnd() * 2.6;
    c.fillStyle = `rgba(${130 + rnd() * 30},${130 + rnd() * 30},${128 + rnd() * 20},${0.45 + rnd() * 0.4})`;
    c.beginPath();
    c.ellipse(x, y, rr * (1 + rnd()), rr, rnd() * 3, 0, Math.PI * 2);
    c.fill();
  }
}

/** fit a line of text into a width: the font's size brought down until it fits */
function fitText(c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, px: number, face: string, weight = 'bold'): void {
  let size = px;
  c.font = `${weight} ${size}px ${face}`;
  while (c.measureText(text).width > maxW && size > 10) {
    size -= 2;
    c.font = `${weight} ${size}px ${face}`;
  }
  c.fillText(text, x, y);
}

/** the atlas: section signs, the special boards, the distance boards, the feature plates, the gantry's and the tower's names */
class SignAtlas {
  readonly texture: THREE.CanvasTexture;
  private readonly rects = new Map<string, Rect>();

  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = ATLAS_W;
    canvas.height = ATLAS_H;
    const c = canvas.getContext('2d')!;
    c.fillStyle = '#d8d4c8';
    c.fillRect(0, 0, ATLAS_W, ATLAS_H);
    // the section signs: 512 × 256 each, the first row and half the second
    SIGNS.forEach((s, i) => {
      const r = { x: (i % 4) * 512, y: Math.floor(i / 4) * 256, w: 512, h: 256 };
      this.rects.set(`sign:${s.id}`, r);
      this.section(c, r, s.id, s.zh, s.en, i);
    });
    // the quarter mile and the kilometre
    const q = { x: 1024, y: 256, w: 512, h: 256 };
    this.rects.set('board:1/4 英里', q);
    this.special(c, q, '1/4 英里', '402 米', 'quarter');
    const k = { x: 1536, y: 256, w: 512, h: 256 };
    this.rects.set('board:1 公里', k);
    this.special(c, k, '1 公里', '1000 米', 'km');
    // the hundreds: 256 squares, eight to a row, the last two at the start of the next
    BOARDS.filter((b) => !b.big).forEach((b, i) => {
      const r = { x: (i % 8) * 256, y: 512 + Math.floor(i / 8) * 256, w: 256, h: 256 };
      this.rects.set(`board:${b.text}`, r);
      this.hundred(c, r, b.text, i);
    });
    // the feature plates: 256 × 128, six to a row from x 512 on
    this.plates = 0;
    // the gantry's banner and the tower's name
    const g = { x: 0, y: 1024, w: 1024, h: 128 };
    this.rects.set('banner:gantry', g);
    this.banner(c, g, '起点', 'START', TEAL_CSS);
    const t = { x: 1024, y: 1024, w: 1024, h: 128 };
    this.rects.set('banner:tower', t);
    this.banner(c, t, '试车场', 'PROVING GROUND', '#2b3a44');
    const sh = { x: 0, y: 1152, w: 1024, h: 128 };
    this.rects.set('banner:shed', sh);
    this.banner(c, sh, '车间', 'WORKSHOP', '#5b4636');
    this.canvas = canvas;
    this.ctx = c;
    // (the features' plates now, so the atlas goes to the GPU once)
    for (const f of FEATURES) this.plate(f.zh);
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
  }

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private plates: number;

  /** a feature's plate (painted when first asked for) */
  plate(text: string): Rect {
    const key = `plate:${text}`;
    let r = this.rects.get(key);
    if (r) return r;
    const i = this.plates++;
    r = { x: 512 + (i % 6) * 256, y: 768 + Math.floor(i / 6) * 128, w: 256, h: 128 };
    this.rects.set(key, r);
    const c = this.ctx;
    c.fillStyle = '#f3efe4';
    c.fillRect(r.x, r.y, r.w, r.h);
    c.strokeStyle = '#2f5d3a';
    c.lineWidth = 10;
    c.strokeRect(r.x + 7, r.y + 7, r.w - 14, r.h - 14);
    c.fillStyle = '#1e2a24';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, text, r.x + r.w / 2, r.y + r.h / 2 + 3, r.w - 40, 70, ZH);
    chips(c, r, 31 + i * 7, 26);
    if (this.texture) this.texture.needsUpdate = true;
    return r;
  }

  rect(key: string): Rect {
    return this.rects.get(key) ?? { x: 0, y: 0, w: 8, h: 8 };
  }

  /** a rect's uv corners (the texture's v runs up) */
  uv(r: Rect): [number, number, number, number] {
    return [r.x / ATLAS_W, 1 - (r.y + r.h) / ATLAS_H, (r.x + r.w) / ATLAS_W, 1 - r.y / ATLAS_H];
  }

  private section(c: CanvasRenderingContext2D, r: Rect, id: string, zh: string, en: string, i: number): void {
    c.fillStyle = '#2b3036';
    c.fillRect(r.x, r.y, r.w, r.h);
    roundRect(c, r.x + 8, r.y + 8, r.w - 16, r.h - 16, 18);
    c.fillStyle = '#f4f1e8';
    c.fill();
    // the colour block with the pictogram
    roundRect(c, r.x + 20, r.y + 20, 176, r.h - 40, 12);
    c.fillStyle = ACCENT[id] ?? '#555';
    c.fill();
    pictogram(c, id, r.x + 36, r.y + 46, 144);
    c.fillStyle = '#1f2a33';
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    fitText(c, zh, r.x + 216, r.y + 140, r.w - 236, 104, ZH);
    c.fillStyle = '#56616b';
    fitText(c, en, r.x + 218, r.y + 206, r.w - 236, 46, NUM, '600');
    // a rule under the name in the section's colour
    c.fillStyle = ACCENT[id] ?? '#555';
    c.fillRect(r.x + 218, r.y + 158, r.w - 250, 6);
    chips(c, r, 11 + i * 17, 60);
  }

  private special(c: CanvasRenderingContext2D, r: Rect, big: string, small: string, kind: 'quarter' | 'km'): void {
    c.fillStyle = '#2b3036';
    c.fillRect(r.x, r.y, r.w, r.h);
    roundRect(c, r.x + 8, r.y + 8, r.w - 16, r.h - 16, 16);
    c.fillStyle = kind === 'quarter' ? '#efc23a' : '#f4f1e8';
    c.fill();
    if (kind === 'km') {
      // a chequered band over it, as the line on the asphalt
      const sq = 24;
      for (let yy = 0; yy < 2; yy++)
        for (let xx = 0; xx < Math.floor((r.w - 40) / sq); xx++) {
          c.fillStyle = (xx + yy) % 2 ? '#f4f1e8' : '#1d1f22';
          c.fillRect(r.x + 20 + xx * sq, r.y + 20 + yy * sq, sq, sq);
        }
    } else {
      c.fillStyle = '#1d1f22';
      c.fillRect(r.x + 20, r.y + 20, r.w - 40, 14);
    }
    c.fillStyle = '#1d1f22';
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    fitText(c, big, r.x + r.w / 2, r.y + 172, r.w - 60, 112, `${NUM}, ${ZH}`);
    c.fillStyle = '#3b4148';
    fitText(c, small, r.x + r.w / 2, r.y + 226, r.w - 60, 42, `${NUM}, ${ZH}`, '600');
    chips(c, r, kind === 'km' ? 77 : 53, 50);
  }

  private hundred(c: CanvasRenderingContext2D, r: Rect, text: string, i: number): void {
    c.fillStyle = '#2b3036';
    c.fillRect(r.x, r.y, r.w, r.h);
    c.fillStyle = '#f4f1e8';
    c.fillRect(r.x + 8, r.y + 8, r.w - 16, r.h - 16);
    c.strokeStyle = '#c23b2c';
    c.lineWidth = 12;
    c.strokeRect(r.x + 22, r.y + 22, r.w - 44, r.h - 44);
    c.fillStyle = '#1d1f22';
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    fitText(c, text, r.x + r.w / 2, r.y + 160, r.w - 64, 118, NUM);
    c.fillStyle = '#4b525a';
    fitText(c, '米', r.x + r.w / 2, r.y + 212, 80, 38, ZH);
    chips(c, r, 101 + i * 13, 30);
  }

  private banner(c: CanvasRenderingContext2D, r: Rect, zh: string, en: string, ground: string): void {
    c.fillStyle = ground;
    c.fillRect(r.x, r.y, r.w, r.h);
    c.strokeStyle = 'rgba(255,255,255,0.85)';
    c.lineWidth = 5;
    c.strokeRect(r.x + 9, r.y + 9, r.w - 18, r.h - 18);
    c.fillStyle = '#f4f1e8';
    c.textBaseline = 'alphabetic';
    c.textAlign = 'right';
    fitText(c, zh, r.x + r.w / 2 - 22, r.y + 92, r.w / 2 - 50, 76, ZH);
    c.textAlign = 'left';
    fitText(c, en, r.x + r.w / 2 + 22, r.y + 88, r.w / 2 - 50, 56, NUM, '600');
  }
}

const TEAL_CSS = '#26575e';

// ------------------------------------------------------------------ textured quads (the boards' faces)

/** quads with uvs into the sign atlas, in one geometry */
class FaceBuilder {
  private pos: number[] = [];
  private nrm: number[] = [];
  private uvs: number[] = [];
  private xf: THREE.Matrix4 | null = null;
  private readonly v = new THREE.Vector3();
  private readonly n = new THREE.Vector3();

  within(m: THREE.Matrix4, fn: () => void): void {
    const prev = this.xf;
    this.xf = prev ? prev.clone().multiply(m) : m.clone();
    try {
      fn();
    } finally {
      this.xf = prev;
    }
  }

  /**
   * A face in the local xy plane at z, w wide and h high about (cx, cy), looking to −z (its left edge at +x as one
   * stands before it), showing uv rect (u0, v0, u1, v1).
   */
  face(cx: number, cy: number, z: number, w: number, h: number, uv: [number, number, number, number]): void {
    const [u0, v0, u1, v1] = uv;
    const corners: [number, number, number, number][] = [
      [cx + w / 2, cy - h / 2, u0, v0],
      [cx - w / 2, cy - h / 2, u1, v0],
      [cx - w / 2, cy + h / 2, u1, v1],
      [cx + w / 2, cy + h / 2, u0, v1],
    ];
    this.n.set(0, 0, -1);
    if (this.xf) this.n.transformDirection(this.xf);
    const put = (k: number): void => {
      const [x, y, u, v] = corners[k];
      this.v.set(x, y, z);
      if (this.xf) this.v.applyMatrix4(this.xf);
      this.pos.push(this.v.x, this.v.y, this.v.z);
      this.nrm.push(this.n.x, this.n.y, this.n.z);
      this.uvs.push(u, v);
    };
    for (const k of [0, 1, 2, 0, 2, 3]) put(k);
  }

  get empty(): boolean {
    return this.pos.length === 0;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.computeBoundingSphere();
    return g;
  }
}

// ------------------------------------------------------------------ the pools of lamplight at dusk

function poolMaterial(): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uOn: { value: 0 }, uColor: { value: new THREE.Color(1.0, 0.72, 0.42) } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
        vFragDepth *= 0.9975;
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float uOn;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        #include <logdepthbuf_fragment>
        float r = length(vUv - 0.5) * 2.0;
        float a = exp(-r * r * 3.2) * (1.0 - smoothstep(0.8, 1.0, r));
        gl_FragColor = vec4(uColor * a * uOn * 0.26, 1.0);
      }`,
  });
  mat.transparent = true;
  mat.depthWrite = false;
  mat.blending = THREE.CustomBlending;
  mat.blendSrc = THREE.OneFactor;
  mat.blendDst = THREE.OneFactor;
  mat.blendSrcAlpha = THREE.ZeroFactor;
  mat.blendDstAlpha = THREE.OneFactor;
  return mat;
}

/** the windsock's sock: a striped cloth tube, its mouth on the ring; shaded as cloth in the light (both faces) */
function sockGeometry(): THREE.BufferGeometry {
  const b = new PaintBuilder();
  const n = 5;
  const L = 1.9;
  for (let i = 0; i < n; i++) {
    const x0 = (i / n) * L;
    const x1 = ((i + 1) / n) * L;
    const r0 = 0.27 - 0.14 * (i / n);
    const r1 = 0.27 - 0.14 * ((i + 1) / n);
    b.cyl((x0 + x1) / 2, 0, 0, r0, x1 - x0, i % 2 ? WHITE : ORANGE, { rz: -Math.PI / 2, radiusTop: r1, segments: 12 });
  }
  return b.build();
}

// ------------------------------------------------------------------ the kit

/** a group of props built together into one mesh per material: its key, its plan box, its build */
export interface PropGroup {
  key: string;
  box: { x0: number; z0: number; x1: number; z1: number };
  hideBeyond?: number;
  /** in slices: a prop at a time */
  build(): Generator<void, THREE.Object3D[], void>;
}

/** the lamps' state at the start (the timing the lead runs): 'off', 'ready' (red), 'set' (amber), 'go' (green) */
export type StartLights = 'off' | 'ready' | 'set' | 'go';

export class PropKit {
  /** the cel-painted, inked things */
  readonly paintMat = surfaceMaterial({ vertexColors: true, ink: true, snowCap: 0 });
  /** the buildings' walls and roofs: brushed, as the places by the road */
  readonly buildingMat = surfaceMaterial({ vertexColors: true, snowCap: 0, brush: 1 });
  /** the cones */
  readonly coneMaterial = surfaceMaterial({ vertexColors: true, ink: true, spec: 0.15 });
  /** the boards' faces */
  private readonly atlas = new SignAtlas();
  readonly signMat: THREE.ShaderMaterial;
  /** what glows at dusk: the tower's windows, the lamps' lenses, the gantry's lights (each its own colour) */
  private readonly windowMat = surfaceMaterial({ vertexColors: true, ink: true, inkBase: true, color: 0xffffff });
  private readonly lensMat = surfaceMaterial({ color: 0xe9e2cf, ink: true });
  private readonly startMats = [0xb43226, 0xd0921e, 0x3ea353].map((c) => surfaceMaterial({ color: c, ink: true, spec: 0.4 }));
  private readonly pool = poolMaterial();
  private readonly socks: THREE.Object3D[] = [];
  private readonly mats: THREE.Material[] = [];
  private sockTurn = 0;
  private sockLift = 0;
  /** the start lights (the timing may set them) */
  lights: StartLights = 'off';

  constructor(private readonly ground: ProvingGround) {
    this.signMat = surfaceMaterial({ color: 0xffffff, map: this.atlas.texture, ink: true, inkBase: true, spec: 0.08 });
    this.mats.push(this.paintMat, this.buildingMat, this.coneMaterial, this.signMat, this.windowMat, this.lensMat, ...this.startMats, this.pool);
  }

  /** the props in groups: the apron's buildings and things, the gantry, each sign, the boards, the turning circle's, the posts */
  groups(props: readonly Prop[]): PropGroup[] {
    const by = new Map<string, Prop[]>();
    const add = (k: string, p: Prop): void => {
      let a = by.get(k);
      if (!a) by.set(k, (a = []));
      a.push(p);
    };
    for (const p of props) {
      switch (p.kind) {
        case 'tower':
        case 'shed':
        case 'drums':
        case 'conestack':
          add('apron', p);
          break;
        case 'lamp':
          // (the apron's with the buildings, the one by the start with the gantry)
          add(p.x > APRON_X0 - 5 ? 'apron' : 'gantry', p);
          break;
        case 'gantry':
          add('gantry', p);
          break;
        case 'sign':
          add(`sign:${p.text}`, p);
          break;
        case 'board':
          add(`boards:${Math.floor((-985 - p.x) / 400)}`, p);
          break;
        case 'tyres':
        case 'windsock':
          add('turn', p);
          break;
        case 'post':
          add(`posts:${p.z < 150 ? 'out' : 'back'}`, p);
          break;
        default:
          add('misc', p);
      }
    }
    const out: PropGroup[] = [];
    for (const [key, list] of by) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const p of list) {
        const r = p.kind === 'tower' || p.kind === 'shed' ? 12 : p.kind === 'gantry' ? 16 : 3;
        x0 = Math.min(x0, p.x - r);
        x1 = Math.max(x1, p.x + r);
        z0 = Math.min(z0, p.z - r);
        z1 = Math.max(z1, p.z + r);
      }
      const small = key.startsWith('posts') || key === 'turn' || key.startsWith('boards') || key.startsWith('sign');
      out.push({ key, box: { x0, z0, x1, z1 }, hideBeyond: small ? 900 : undefined, build: () => this.buildGroup(list, (x0 + x1) / 2, (z0 + z1) / 2) });
    }
    return out;
  }

  /** a group's meshes: each prop drawn in its own frame, placed at its ground */
  private *buildGroup(list: readonly Prop[], ox: number, oz: number): Generator<void, THREE.Object3D[], void> {
    const level = this.ground.level;
    const paint = new PaintBuilder();
    const building = new PaintBuilder();
    const faces = new FaceBuilder();
    const windows = new PaintBuilder();
    const lens = new PaintBuilder();
    const starts = [new PaintBuilder(), new PaintBuilder(), new PaintBuilder()];
    const pools: THREE.Vector3[] = [];
    const out: THREE.Object3D[] = [];
    const m = new THREE.Matrix4();
    for (const p of list) {
      yield;
      const g = this.ground.heightAt(p.x, p.z) - level;
      // (the prop's frame: x along its heading, z across to its right, y up from its ground)
      m.makeRotationY(-p.yaw).setPosition(p.x - ox, g, p.z - oz);
      const draw = (fn: () => void): void => {
        paint.within(m, () => building.within(m, () => windows.within(m, () => lens.within(m, () => starts[0].within(m, () => starts[1].within(m, () => starts[2].within(m, fn)))))));
      };
      faces.within(m, () =>
        draw(() => {
          switch (p.kind) {
            case 'tower':
              this.tower(paint, building, windows, faces);
              break;
            case 'shed':
              this.shed(paint, building, faces);
              break;
            case 'gantry':
              this.gantry(paint, faces, starts);
              break;
            case 'sign':
              this.sign(paint, faces, p);
              break;
            case 'board':
              this.board(paint, faces, p);
              break;
            case 'tyres':
              this.tyres(paint, Number(p.text ?? 4), p.x * 7 + p.z);
              break;
            case 'windsock':
              this.windsockPole(paint);
              break;
            case 'lamp':
              this.lamp(paint, lens);
              pools.push(new THREE.Vector3(p.x - ox, g, p.z - oz));
              break;
            case 'post':
              this.post(paint, faces, p);
              break;
            case 'drums':
              this.drums(paint);
              break;
            case 'conestack':
              this.coneStack(paint);
              break;
          }
        }),
      );
      if (p.kind === 'windsock') {
        const sock = new THREE.Mesh(sockGeometry(), this.paintMat);
        sock.name = 'proving:sock';
        const pivot = new THREE.Group();
        pivot.add(sock);
        pivot.position.set(p.x - ox, g + 6.0, p.z - oz);
        castShadows(sock);
        this.socks.push(pivot);
        out.push(pivot);
      }
    }
    const meshOf = (b: PaintBuilder | FaceBuilder, mat: THREE.Material, name: string, cast = true): void => {
      if (b instanceof PaintBuilder ? b.triangles === 0 : b.empty) return;
      const mesh = new THREE.Mesh(b.build(), mat);
      mesh.name = name;
      if (cast) castShadows(mesh);
      out.push(mesh);
    };
    meshOf(paint, this.paintMat, 'proving:props');
    meshOf(building, this.buildingMat, 'proving:buildings');
    meshOf(faces, this.signMat, 'proving:boards');
    meshOf(windows, this.windowMat, 'proving:windows', false);
    meshOf(lens, this.lensMat, 'proving:lamps', false);
    starts.forEach((b, i) => meshOf(b, this.startMats[i], `proving:start${i}`, false));
    for (const at of pools) {
      const g = new THREE.PlaneGeometry(11, 11);
      g.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(g, this.pool);
      mesh.position.set(at.x + 1.6, at.y + 0.04, at.z);
      mesh.renderOrder = 2;
      mesh.name = 'proving:pool';
      out.push(mesh);
    }
    // every object in the group placed at the group's origin
    const holder = new THREE.Group();
    holder.name = 'proving:group';
    for (const o of out) holder.add(o);
    holder.userData.w = [ox, level, oz];
    return [holder];
  }

  // ---------------------------------------------------------------- the props

  /** the control tower: two plain storeys, a glazed cab looking down the straight, a flat roof, a mast */
  private tower(b: PaintBuilder, w: PaintBuilder, win: PaintBuilder, faces: FaceBuilder): void {
    const H = TOWER.half;
    // plinth, the storeys' walls (plaster, a shade apart storey to storey), the orange band
    w.span(-H - 0.1, H + 0.1, 0, 0.3, -H - 0.1, H + 0.1, CONCRETE);
    w.span(-H, H, 0.3, 3.4, -H, H, CREAM);
    w.span(-H - 0.04, H + 0.04, 3.2, 3.55, -H - 0.04, H + 0.04, ORANGE);
    w.span(-H, H, 3.55, 6.5, -H, H, CREAM_D);
    w.span(-H - 0.25, H + 0.25, 6.5, 6.75, -H - 0.25, H + 0.25, CONCRETE);
    // the windows of the storeys: dark glass in white frames, lit at dusk
    const winAt = (axis: 'x' | 'z', side: number, u: number, y: number, ww: number, hh: number): void => {
      const d = H + 0.02;
      if (axis === 'x') {
        b.span(side * d - 0.04, side * d + 0.04, y - hh / 2 - 0.08, y + hh / 2 + 0.08, u - ww / 2 - 0.08, u + ww / 2 + 0.08, WHITE);
        win.span(side * (d + 0.03) - 0.02, side * (d + 0.03) + 0.02, y - hh / 2, y + hh / 2, u - ww / 2, u + ww / 2, GLASS);
      } else {
        b.span(u - ww / 2 - 0.08, u + ww / 2 + 0.08, y - hh / 2 - 0.08, y + hh / 2 + 0.08, side * d - 0.04, side * d + 0.04, WHITE);
        win.span(u - ww / 2, u + ww / 2, y - hh / 2, y + hh / 2, side * (d + 0.03) - 0.02, side * (d + 0.03) + 0.02, GLASS);
      }
    };
    for (const y of [1.9, 5.0]) {
      winAt('x', -1, -1.3, y, 1.4, 1.1);
      winAt('x', -1, 1.3, y, 1.4, 1.1);
      winAt('z', 1, 0, y, 2.2, 1.1);
      winAt('z', -1, -1.2, y, 1.2, 1.1);
    }
    // the door, on the +x side (from the apron)
    b.span(H + 0.01, H + 0.08, 0.3, 2.45, -0.55, 0.55, TEAL);
    b.span(H + 0.06, H + 0.12, 1.2, 1.32, 0.3, 0.42, STEEL);
    b.span(H + 0.02, H + 0.6, 2.55, 2.65, -0.8, 0.8, DARK);
    // the name over the band, to the straight
    faces.within(new THREE.Matrix4().makeRotationY(Math.PI / 2), () => {
      faces.face(0, 4.15, -(H + 0.03), 5.2, 0.65, this.atlas.uv(this.atlas.rect('banner:tower')));
    });
    // the cab: glass all round, leaning out, posts at the corners, a deep roof
    const cy0 = 6.75;
    const cy1 = 9.45;
    const lean = 0.3;
    const C = H + 0.1;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.bar(sx * C, cy0, sz * C, sx * (C + lean), cy1, sz * (C + lean), 0.14, WHITE);
    b.span(-C, C, cy0, cy0 + 0.75, -C, C, CREAM);
    const glassSide = (sx: number, sz: number): void => {
      // a pane of the four sides: its bottom edge at cy0 + 0.75, its top leaning out
      const yb = cy0 + 0.78;
      const t = (yb - cy0) / (cy1 - cy0);
      const e0 = C + lean * t;
      const e1 = C + lean;
      const pts: number[][] = [];
      for (const [e, y] of [[e0, yb], [e1, cy1 - 0.05]] as [number, number][]) {
        if (sx !== 0) {
          pts.push([sx * e, y, -e + 0.1], [sx * e, y, e - 0.1], [sx * (e - 0.05), y, -e + 0.1], [sx * (e - 0.05), y, e - 0.1]);
        } else {
          pts.push([-e + 0.1, y, sz * e], [e - 0.1, y, sz * e], [-e + 0.1, y, sz * (e - 0.05)], [e - 0.1, y, sz * (e - 0.05)]);
        }
      }
      win.hull(pts, GLASS);
    };
    glassSide(-1, 0);
    glassSide(1, 0);
    glassSide(0, -1);
    glassSide(0, 1);
    // mullions on the side to the straight
    for (const zz of [-1.2, 0, 1.2]) b.bar(-(C + lean * 0.05) - 0.05, cy0 + 0.75, zz, -(C + lean) - 0.05, cy1, zz * 1.05, 0.07, WHITE);
    b.span(-C - lean - 0.55, C + lean + 0.55, cy1, cy1 + 0.35, -C - lean - 0.55, C + lean + 0.55, WHITE);
    b.span(-C - lean - 0.6, C + lean + 0.6, cy1 + 0.35, cy1 + 0.45, -C - lean - 0.6, C + lean + 0.6, ORANGE);
    // the walkway round the cab, its rail
    const R = H + 0.25;
    for (const [ax, az, bx, bz] of [[-R, -R, R, -R], [R, -R, R, R], [R, R, -R, R], [-R, R, -R, -R]]) {
      b.bar(ax, 7.75, az, bx, 7.75, bz, 0.05, WHITE);
      const n = 5;
      for (let i = 0; i <= n; i++) b.bar(ax + ((bx - ax) * i) / n, 6.75, az + ((bz - az) * i) / n, ax + ((bx - ax) * i) / n, 7.75, az + ((bz - az) * i) / n, 0.04, WHITE);
    }
    // the mast with its red light and an aerial
    b.bar(1.6, cy1 + 0.45, 1.6, 1.6, TOWER.height, 1.6, 0.08, STEEL);
    b.sphere(1.6, TOWER.height + 0.06, 1.6, 0.11, RED);
    b.bar(1.6, TOWER.height - 0.6, 1.6, 2.3, TOWER.height - 0.6, 1.6, 0.03, STEEL);
    b.bar(-1.2, cy1 + 0.45, -1.5, -1.2, cy1 + 1.3, -1.5, 0.05, STEEL);
    b.box(-1.2, cy1 + 1.3, -1.5, 0.5, 0.06, 0.06, STEEL_D);
    // a box of plant on the roof
    b.span(0.4, 1.4, cy1 + 0.45, cy1 + 0.95, -1.8, -0.6, STEEL_D);
    // the stair up the back: a frame of steel going up the +z side
    for (let i = 0; i < 9; i++) {
      const y = 0.3 + i * 0.7;
      b.span(-1.6 + i * 0.35, -1.25 + i * 0.35, y, y + 0.06, H + 0.05, H + 0.95, STEEL_D);
    }
    b.bar(-1.6, 1.3, H + 0.95, 1.55, 7.3, H + 0.95, 0.05, WHITE);
  }

  /** the shed: corrugated walls in sage green, a low gable roof, a roller door to the straight, windows down its sides */
  private shed(b: PaintBuilder, w: PaintBuilder, faces: FaceBuilder): void {
    const hx = (SHED.x1 - SHED.x0) / 2;
    const hz = (SHED.z1 - SHED.z0) / 2;
    const eave = 4.3;
    const ridge = SHED.height;
    w.span(-hx - 0.12, hx + 0.12, 0, 0.25, -hz - 0.12, hz + 0.12, CONCRETE);
    // the side walls: sheets standing in a run, a shade apart
    let s = 5;
    const rnd = (): number => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    const sheet = 0.9;
    for (const side of [-1, 1]) {
      for (let x = -hx; x < hx - 1e-6; x += sheet) {
        const col = shade(rnd() < 0.5 ? SAGE : SAGE_D, (rnd() - 0.5) * 0.08);
        w.span(x, Math.min(hx, x + sheet), 0.25, eave, side * hz - 0.06, side * hz + 0.06, col);
        // the ribs
        b.span(x + 0.02, x + 0.06, 0.25, eave, side * (hz + 0.06) - 0.02, side * (hz + 0.06) + 0.02, SAGE_D);
      }
      // windows along the side
      for (const x of [-4, 0, 4]) {
        b.span(x - 0.8, x + 0.8, 2.0, 3.2, side * (hz + 0.07) - 0.03, side * (hz + 0.07) + 0.03, WHITE);
        b.span(x - 0.7, x + 0.7, 2.1, 3.1, side * (hz + 0.1) - 0.02, side * (hz + 0.1) + 0.02, GLASS);
      }
    }
    // the gable ends: the back whole, the front round the door
    for (const end of [-1, 1]) {
      const x = end * hx;
      w.gable(x - 0.06, x + 0.06, -hz, hz, eave, ridge, SAGE_D);
      if (end > 0) {
        w.span(x - 0.06, x + 0.06, 0.25, eave, -hz, hz, SAGE);
      } else {
        // the roller door (5 m by 3.9), its box over it; the side door to its right
        w.span(x - 0.06, x + 0.06, 0.25, eave, -hz, -3.2, SAGE);
        w.span(x - 0.06, x + 0.06, 0.25, eave, 2.4, hz, SAGE);
        w.span(x - 0.06, x + 0.06, 4.05, eave, -3.2, 2.4, SAGE);
        for (let y = 0.3; y < 4.0; y += 0.2) b.span(x - 0.04, x + 0.02, y, y + 0.17, -3.1, 2.3, y < 0.5 ? DARK : 0xc9ccc6);
        b.span(x - 0.3, x + 0.02, 3.95, 4.3, -3.25, 2.45, 0xa9aeac);
        b.span(x - 0.08, x + 0.0, 0.25, 2.3, 3.3, 4.3, TEAL);
        b.span(x - 0.12, x - 0.06, 1.15, 1.25, 4.05, 4.2, STEEL);
      }
    }
    // the roof: two slopes of sheet, overhanging; the ridge cap; gutters and downpipes
    const over = 0.35;
    const rise = ridge - eave;
    for (const side of [-1, 1]) {
      const pts: number[][] = [];
      for (const xx of [-hx - over, hx + over]) {
        pts.push([xx, ridge + 0.08, 0], [xx, eave - 0.12 * (rise / hz), side * (hz + over)], [xx, ridge, 0], [xx, eave - 0.12 * (rise / hz) - 0.08, side * (hz + over)]);
      }
      b.hull(pts, side < 0 ? ROOF : ROOF_D);
      b.bar(-hx - over, eave - 0.1, side * (hz + over), hx + over, eave - 0.1, side * (hz + over), 0.12, STEEL_D);
      b.bar(hx + 0.1, eave - 0.1, side * (hz + over - 0.05), hx + 0.1, 0.25, side * (hz + 0.1), 0.09, STEEL_D);
    }
    b.bar(-hx - over, ridge + 0.1, 0, hx + over, ridge + 0.1, 0, 0.16, ROOF_D);
    // the name over the door
    faces.within(new THREE.Matrix4().makeRotationY(Math.PI / 2), () => {
      faces.face(0.4, eave + 0.45, -(hx + 0.1), 3.0, 0.38, this.atlas.uv(this.atlas.rect('banner:shed')));
    });
  }

  /** the start gantry: a white post either side, a yellow truss across, the name on it, the lights over the out lane */
  private gantry(b: PaintBuilder, faces: FaceBuilder, starts: PaintBuilder[]): void {
    const zs = [STRAIGHT.half + 1.8, GANTRY_POST_Z];
    const H = GANTRY_HEIGHT;
    for (const z of zs) {
      b.span(-0.4, 0.4, 0, 0.35, z - 0.4, z + 0.4, CONCRETE);
      b.cyl(0, 0.35 + (H - 0.35) / 2, z, 0.19, H - 0.35, WHITE, { segments: 12 });
      for (const y of [1.0, 2.0]) b.cyl(0, y, z, 0.2, 0.32, RED, { segments: 12 });
      b.cyl(0, H + 0.05, z, 0.24, 0.1, STEEL_D, { segments: 12 });
    }
    // the truss: two chords each side, braced
    const z0 = GANTRY_POST_Z - 0.2;
    const z1 = STRAIGHT.half + 2.0;
    const y0 = H - 1.1;
    const y1 = H - 0.1;
    for (const x of [-0.35, 0.35]) {
      b.bar(x, y0, z0, x, y0, z1, 0.12, YELLOW);
      b.bar(x, y1, z0, x, y1, z1, 0.12, YELLOW);
      const n = 14;
      for (let i = 0; i < n; i++) {
        const za = z0 + ((z1 - z0) * i) / n;
        const zb = z0 + ((z1 - z0) * (i + 1)) / n;
        b.bar(x, i % 2 ? y0 : y1, za, x, i % 2 ? y1 : y0, zb, 0.06, YELLOW);
      }
    }
    for (let i = 0; i <= 7; i++) {
      const z = z0 + ((z1 - z0) * i) / 7;
      b.bar(-0.35, y0, z, 0.35, y0, z, 0.06, YELLOW);
      b.bar(-0.35, y1, z, 0.35, y1, z, 0.06, YELLOW);
    }
    // the banner on the face the starters see (+x: they stand facing −x), over the back lane
    b.span(0.42, 0.5, y0 - 0.15, y1 + 0.15, 1.0, 9.6, DARK);
    faces.within(new THREE.Matrix4().makeRotationY(-Math.PI / 2), () => {
      faces.face(5.3, (y0 + y1) / 2, -0.52, 8.4, 1.05, this.atlas.uv(this.atlas.rect('banner:gantry')));
    });
    // the lights: a black box hung over the out lane, three lamps in a row facing the start box
    const lz = LANE_OUT;
    b.bar(0, y0, lz - 0.6, 0, y0 - 0.5, lz - 0.6, 0.05, STEEL_D);
    b.bar(0, y0, lz + 0.6, 0, y0 - 0.5, lz + 0.6, 0.05, STEEL_D);
    b.span(-0.2, 0.25, y0 - 1.05, y0 - 0.45, lz - 1.05, lz + 1.05, DARK);
    for (let i = 0; i < 3; i++) {
      const z = lz + 0.68 - i * 0.68;
      b.cyl(0.27, y0 - 0.75, z, 0.24, 0.06, 0x18191b, { rz: Math.PI / 2, segments: 14 });
      starts[i].cyl(0.31, y0 - 0.75, z, 0.18, 0.04, WHITE, { rz: Math.PI / 2, segments: 14 });
      // a hood over each
      b.box(0.36, y0 - 0.52, z, 0.2, 0.03, 0.42, DARK);
    }
  }

  /** a section's signboard: two posts, a board with its face to −z */
  private sign(b: PaintBuilder, faces: FaceBuilder, p: Prop): void {
    const id = SIGNS.find((s) => `${s.zh}|${s.en}` === p.text)?.id ?? 'accel';
    const W = 3.1;
    const Hh = 1.55;
    const y0 = 1.3;
    for (const x of [-1.35, 1.35]) {
      b.span(x - 0.06, x + 0.06, -0.3, y0 + Hh + 0.1, 0.02, 0.14, STEEL);
      b.span(x - 0.16, x + 0.16, 0, 0.12, -0.08, 0.24, CONCRETE);
    }
    b.span(-W / 2 - 0.04, W / 2 + 0.04, y0 - 0.04, y0 + Hh + 0.04, -0.02, 0.0, DARK);
    b.span(-W / 2 - 0.02, W / 2 + 0.02, y0 - 0.02, y0 + Hh + 0.02, 0.0, 0.03, STEEL);
    faces.face(0, y0 + Hh / 2, -0.025, W, Hh, this.atlas.uv(this.atlas.rect(`sign:${id}`)));
  }

  /** a distance board (or the quarter mile's, the kilometre's: bigger, higher) */
  private board(b: PaintBuilder, faces: FaceBuilder, p: Prop): void {
    const big = p.text === '1/4 英里' || p.text === '1 公里';
    if (big) {
      const W = 2.6;
      const Hh = 1.3;
      const y0 = 2.7;
      for (const x of [-1.05, 1.05]) b.span(x - 0.06, x + 0.06, -0.3, y0 + Hh, 0.02, 0.14, STEEL);
      b.span(-W / 2 - 0.04, W / 2 + 0.04, y0 - 0.04, y0 + Hh + 0.04, -0.02, 0.0, DARK);
      b.span(-W / 2 - 0.02, W / 2 + 0.02, y0 - 0.02, y0 + Hh + 0.02, 0.0, 0.03, STEEL);
      faces.face(0, y0 + Hh / 2, -0.025, W, Hh, this.atlas.uv(this.atlas.rect(`board:${p.text}`)));
    } else {
      const S = 1.15;
      const y0 = 1.0;
      b.span(-0.05, 0.05, -0.3, y0 + S, 0.02, 0.12, STEEL);
      b.span(-S / 2 - 0.03, S / 2 + 0.03, y0 - 0.03, y0 + S + 0.03, -0.02, 0.0, DARK);
      b.span(-S / 2 - 0.015, S / 2 + 0.015, y0 - 0.015, y0 + S + 0.015, 0.0, 0.025, STEEL);
      faces.face(0, y0 + S / 2, -0.025, S, S, this.atlas.uv(this.atlas.rect(`board:${p.text}`)));
    }
  }

  /** a stack of old tyres, one in three painted white */
  private tyres(b: PaintBuilder, n: number, seed: number): void {
    let s = Math.abs(Math.floor(seed)) % 2147483646 + 1;
    const rnd = (): number => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    for (let i = 0; i < n; i++) {
      const y = 0.105 + i * 0.21;
      const ox = (rnd() - 0.5) * 0.06;
      const oz = (rnd() - 0.5) * 0.06;
      const white = (i + Math.floor(seed)) % 3 === 0;
      b.cyl(ox, y, oz, 0.34, 0.2, white ? 0xe9e5da : TYRE, { segments: 14 });
      b.cyl(ox, y + 0.004, oz, 0.19, 0.205, 0x101113, { segments: 12 });
    }
  }

  /** the windsock's pole and its ring (the sock itself turns with the wind: update) */
  private windsockPole(b: PaintBuilder): void {
    b.span(-0.3, 0.3, 0, 0.25, -0.3, 0.3, CONCRETE);
    const H = 6.2;
    for (let i = 0; i < 6; i++) b.cyl(0, 0.25 + (i + 0.5) * ((H - 0.25) / 6), 0, 0.06, (H - 0.25) / 6, i % 2 ? WHITE : RED, { segments: 8 });
    b.cyl(0, 6.0, 0, 0.29, 0.03, STEEL, { segments: 14 });
  }

  /** a lamp post: a pole, an arm, the lamp (its lens lit at dusk) */
  private lamp(b: PaintBuilder, lens: PaintBuilder): void {
    b.span(-0.25, 0.25, 0, 0.3, -0.25, 0.25, CONCRETE);
    b.cyl(0, 3.6, 0, 0.09, 6.6, STEEL, { segments: 8, radiusTop: 0.06 });
    b.bar(0, 6.8, 0, 1.4, 7.0, 0, 0.07, STEEL);
    b.box(1.55, 6.98, 0, 0.7, 0.16, 0.34, STEEL_D);
    lens.box(1.55, 6.89, 0, 0.6, 0.03, 0.26, 0xffffff);
  }

  /** a post at a feature of the off-road course: its name on a plate facing the one coming, a reflector on top */
  private post(b: PaintBuilder, faces: FaceBuilder, p: Prop): void {
    b.span(-0.05, 0.05, -0.4, 1.7, -0.05, 0.05, WHITE);
    b.span(-0.055, 0.055, 1.62, 1.75, -0.055, 0.055, ORANGE);
    b.span(-0.5, 0.5, 1.12, 1.6, 0.05, 0.09, DARK);
    faces.face(0, 1.36, 0.045, 0.94, 0.44, this.atlas.uv(this.atlas.plate(p.text ?? '')));
  }

  /** three drums by the shed */
  private drums(b: PaintBuilder): void {
    for (const [x, z, c] of [[-0.45, 0, 0x3d6f9e], [0.2, 0.15, RED], [0.75, -0.2, YELLOW]] as [number, number, number][]) {
      b.cyl(x, 0.44, z, 0.29, 0.88, c, { segments: 14 });
      for (const y of [0.28, 0.6]) b.cyl(x, y, z, 0.3, 0.03, shade(c, -0.25), { segments: 14 });
      b.cyl(x, 0.885, z, 0.27, 0.01, shade(c, 0.15), { segments: 14 });
    }
  }

  /** spare cones, stacked */
  private coneStack(b: PaintBuilder): void {
    b.span(-0.2, 0.2, 0, 0.03, -0.2, 0.2, 0x1e1f22);
    for (let i = 0; i < 6; i++) b.cyl(0, 0.04 + i * 0.075 + 0.2, 0, 0.135 - i * 0.004, 0.42, i === 5 ? ORANGE : shade(ORANGE, -0.1 - (5 - i) * 0.02), { segments: 14, radiusTop: 0.022 });
    b.cyl(0, 0.62, 0, 0.11, 0.05, 0xf4f2ec, { segments: 14 });
  }

  // ---------------------------------------------------------------- every frame

  /** dusk: the lamps, the windows; the sock with the wind; the start lights as set */
  update(dt: number, g: typeof globals): void {
    const night = g.uWeather.value.w;
    const sunLow = 1 - Math.min(1, Math.max(0, (g.uSunDir.value.y - 0.02) / 0.18));
    const on = Math.min(1, Math.max(0, (Math.max(night, sunLow * 0.8) - 0.12) / 0.35));
    (this.windowMat.uniforms.uEmissive.value as THREE.Color).setRGB(0.95, 0.68, 0.36).multiplyScalar(on * 0.75);
    (this.lensMat.uniforms.uEmissive.value as THREE.Color).setRGB(3.2, 2.7, 2.0).multiplyScalar(on);
    this.pool.uniforms.uOn.value = on;
    const lit = this.lights === 'ready' ? 0 : this.lights === 'set' ? 1 : this.lights === 'go' ? 2 : -1;
    const glow = [new THREE.Color(3.4, 0.35, 0.2), new THREE.Color(3.2, 1.9, 0.25), new THREE.Color(0.35, 3.0, 0.7)];
    this.startMats.forEach((mat, i) => (mat.uniforms.uEmissive.value as THREE.Color).copy(glow[i]).multiplyScalar(i === lit ? 1 : 0));
    // the sock: down the wind, out as far as the wind is strong, swinging a little
    const wind = g.uWind.value;
    const strength = Math.min(1, Math.max(0, wind.z));
    const turn = Math.atan2(wind.y, wind.x);
    const t = performance.now() / 1000;
    this.sockTurn = turn + 0.12 * Math.sin(t * 0.9) * (0.4 + strength);
    this.sockLift += ((0.15 + 0.85 * Math.sqrt(strength)) - this.sockLift) * Math.min(1, dt * 2);
    for (const s of this.socks) {
      s.rotation.set(0, -this.sockTurn, -(1 - this.sockLift) * 1.25 + 0.05 * Math.sin(t * 2.3), 'YZX');
    }
  }

  dispose(): void {
    for (const m of this.mats) m.dispose();
    this.atlas.texture.dispose();
  }
}

