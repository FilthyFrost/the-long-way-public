/**
 * The live part of a vehicle's dashboard (docs/VEHICLE_SYSTEMS.md §8, §11.1): a strip beside the
 * speedometer with the rev counter, the temperature and battery gauges, the seven warning lamps
 * and the P R N D window. It tells the truth from `systems.dash` and costs one draw call: one
 * texture (faces, dark lamp glyphs, lit glyphs, letters, a needle), one mesh of quads whose
 * corners are moved every frame (a needle turns, a lamp that is out folds to nothing).
 */
import * as THREE from 'three';
import type { Dashboard } from '../../core/vehicle/systems';
import { LAMPS } from '../../core/vehicle/systems';
import { surfaceMaterial } from '../render/materials';
import { facing } from './kit';

/** texture: 1024 × 384 px; row 0 = faces and dark glyphs, row 1 = lit lamps, row 2 = lit letters and the needle */
const TW = 1024;
const TH = 384;
const CELL = 64;
/** faces: rev counter, temperature, battery (centres in px on row 0) */
const FACES = [64, 192, 320];
const FACE_R = 56;
/** first dark lamp cell (x px), first letter cell */
const LAMP_X = 384;
const LETTER_X = 832;
const LETTERS = ['P', 'R', 'N', 'D'] as const;

type Ctx = CanvasRenderingContext2D;

/** a small pictogram per lamp, drawn in `col` inside a 64 px cell whose top-left is (x, y) */
function glyph(g: Ctx, lamp: string, x: number, y: number, col: string): void {
  g.save();
  g.translate(x + 32, y + 32);
  g.strokeStyle = col;
  g.fillStyle = col;
  g.lineWidth = 5;
  g.lineCap = 'round';
  const line = (pts: number[]): void => {
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.stroke();
  };
  if (lamp === 'battery') {
    g.strokeRect(-18, -10, 36, 24);
    g.fillRect(-12, -16, 7, 6);
    g.fillRect(5, -16, 7, 6);
    line([-12, 2, -4, 2]);
    line([4, 2, 12, 2, 8, 2, 8, -2, 8, 6]);
  } else if (lamp === 'fuel') {
    g.strokeRect(-14, -16, 20, 32);
    g.fillRect(-11, -12, 14, 9);
    line([6, -8, 14, -2, 14, 10, 10, 12]);
  } else if (lamp === 'temp') {
    line([0, -18, 0, 8]);
    g.beginPath();
    g.arc(0, 12, 7, 0, Math.PI * 2);
    g.fill();
    line([4, -12, 12, -12]);
    line([4, -4, 12, -4]);
    line([-16, 20, -8, 16, 0, 20, 8, 16, 16, 20]);
  } else if (lamp === 'tyres') {
    g.beginPath();
    g.arc(0, 0, 17, 0.35 * Math.PI, 2.65 * Math.PI);
    g.stroke();
    line([0, -9, 0, 3]);
    g.fillRect(-3, 7, 6, 6);
  } else if (lamp === 'engine') {
    line([-18, -6, -18, 10, 12, 10, 18, 2, 18, -6, 4, -6, 4, -12, -8, -12, -8, -6, -18, -6]);
    line([-24, 2, -18, 2]);
  } else if (lamp === 'brakes') {
    g.beginPath();
    g.arc(0, 0, 14, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, 22, -0.6, 0.6);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, 22, Math.PI - 0.6, Math.PI + 0.6);
    g.stroke();
    line([0, -7, 0, 2]);
    g.fillRect(-3, 5, 6, 5);
  } else {
    // handbrake: a P in a circle
    g.beginPath();
    g.arc(0, 0, 18, 0, Math.PI * 2);
    g.stroke();
    g.font = 'bold 26px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('P', 0, 1);
  }
  g.restore();
}

function face(g: Ctx, cx: number, label: string, ticks: number, red: [number, number] | null, ends: [string, string] | null): void {
  const cy = 64;
  g.beginPath();
  g.arc(cx, cy, FACE_R, 0, Math.PI * 2);
  g.fillStyle = '#efe6cf';
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = '#15171a';
  g.stroke();
  const sweep = ticks > 4 ? 120 : 60;
  if (red) {
    g.beginPath();
    g.strokeStyle = '#c9462f';
    g.lineWidth = 9;
    const a0 = ((-sweep + 2 * sweep * red[0]) * Math.PI) / 180 - Math.PI / 2;
    const a1 = ((-sweep + 2 * sweep * red[1]) * Math.PI) / 180 - Math.PI / 2;
    g.arc(cx, cy, FACE_R - 11, a0, a1);
    g.stroke();
  }
  g.strokeStyle = '#2a2622';
  g.fillStyle = '#2a2622';
  for (let i = 0; i <= ticks; i++) {
    const a = ((-sweep + (2 * sweep * i) / ticks) * Math.PI) / 180;
    const sx = Math.sin(a);
    const sy = -Math.cos(a);
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(cx + sx * (FACE_R - 6), cy + sy * (FACE_R - 6));
    g.lineTo(cx + sx * (FACE_R - 18), cy + sy * (FACE_R - 18));
    g.stroke();
    if (ticks > 4) {
      g.font = 'bold 15px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(i), cx + sx * (FACE_R - 30), cy + sy * (FACE_R - 30));
    }
  }
  g.font = 'bold 14px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, cx, cy + 30);
  if (ends) {
    g.font = 'bold 18px sans-serif';
    g.fillText(ends[0], cx - 34, cy - 14);
    g.fillText(ends[1], cx + 34, cy - 14);
  }
}

const AMBER = '#ffb347';
const RED = '#ff4b33';

/** the atlas (a 1-pixel stand-in outside a browser) */
function dashTexture(): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.DataTexture(new Uint8Array([239, 230, 207, 255]), 1, 1);
  const c = document.createElement('canvas');
  c.width = TW;
  c.height = TH;
  const g = c.getContext('2d')!;
  g.fillStyle = '#23262b';
  g.fillRect(0, 0, TW, TH);
  face(g, FACES[0], 'x1000', 6, [5 / 6, 1], null);
  face(g, FACES[1], '水温', 4, [0.8, 1], ['C', 'H']);
  face(g, FACES[2], '电瓶', 4, [0, 0.2], ['-', '+']);
  LAMPS.forEach((l, i) => {
    glyph(g, l, LAMP_X + i * CELL, 32, '#4a4d52');
    glyph(g, l, i * CELL, 128 + 32, AMBER);
    glyph(g, l, 448 + i * CELL, 128 + 32, RED);
  });
  g.font = 'bold 40px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  LETTERS.forEach((L, i) => {
    g.fillStyle = '#55595f';
    g.fillText(L, LETTER_X + i * 48 + 24, 64);
    g.fillStyle = L === 'P' || L === 'R' ? '#ffd9a0' : '#bff0c8';
    g.fillText(L, i * 48 + 24, 256 + 64);
  });
  // the needle sprite: a red bar
  g.fillStyle = '#e04a30';
  g.fillRect(224, 256 + 8, 16, 112);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** uv of a pixel rectangle on the atlas: [u0, v0, u1, v1] (v up) */
function uvRect(x0: number, y0: number, x1: number, y1: number): [number, number, number, number] {
  return [x0 / TW, 1 - y1 / TH, x1 / TW, 1 - y0 / TH];
}

export interface DashPanelOptions {
  /** centre of the strip (body frame), how far its face leans back (rad), its width (m) */
  pos: THREE.Vector3;
  tiltBack: number;
  width: number;
  /** the vehicle's redline (rpm), for the rev counter's scale */
  redline: number;
}

/** what the panel shows: drawn from `systems.dash` every frame */
export class DashPanel {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  /** what is lit now (tests and screenshots read it) */
  readonly lit: Record<string, number> = {};
  selector = '';
  needles = { rpm: 0, temp: 0, battery: 0 };
  private readonly pos: Float32Array;
  private readonly uv: Float32Array;
  private readonly w: number;
  private readonly h: number;
  private readonly scaleRpm: number;

  constructor(parent: THREE.Object3D, readonly o: DashPanelOptions) {
    this.w = o.width;
    this.h = o.width / 8;
    this.scaleRpm = Math.ceil(o.redline / 1000) * 1000;
    // quads: 0 = the face strip, 1–3 needles, 4–10 lamps, 11–14 letters
    const n = 15;
    this.pos = new Float32Array(n * 4 * 3);
    this.uv = new Float32Array(n * 4 * 2);
    const idx: number[] = [];
    for (let q = 0; q < n; q++) idx.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2));
    const nrm = new Float32Array(n * 4 * 3);
    for (let i = 0; i < n * 4; i++) nrm[i * 3 + 2] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setIndex(idx);
    this.material = surfaceMaterial({ map: dashTexture(), mapEmissive: 0.25, fog: false });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.name = 'dash';
    this.mesh.frustumCulled = false;
    this.mesh.position.copy(o.pos);
    this.mesh.quaternion.copy(facing(new THREE.Vector3(-Math.cos(o.tiltBack), Math.sin(o.tiltBack), 0)));
    // the face strip: row 0 of the atlas, the whole width
    this.quad(0, -this.w / 2, -this.h / 2, this.w / 2, this.h / 2, 0, uvRect(0, 0, TW, 128));
    parent.add(this.mesh);
    this.update(null, false);
  }

  /** atlas px on row 0 → panel metres (x right, y up) */
  private px(x: number, y: number): [number, number] {
    return [(x / TW - 0.5) * this.w, (0.5 - y / 128) * this.h];
  }

  private quad(q: number, x0: number, y0: number, x1: number, y1: number, z: number, uv: [number, number, number, number]): void {
    const p = this.pos;
    const o = q * 12;
    p.set([x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z], o);
    this.uv.set([uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]], q * 8);
  }

  private hide(q: number): void {
    this.pos.fill(0, q * 12, q * 12 + 12);
  }

  /** a needle on face f turned to a (rad, 0 = up, + = clockwise) */
  private needle(q: number, f: number, a: number): void {
    const [cx, cy] = this.px(FACES[f], 64);
    const len = (FACE_R - 10) / 128 * this.h;
    const wd = len * 0.09;
    const s = Math.sin(a);
    const c = Math.cos(a);
    // the bar from a little behind the centre to near the rim, turned by a
    const pt = (u: number, v: number): [number, number] => [cx + u * c + v * s, cy - u * s + v * c];
    const a0 = pt(-wd, -len * 0.18);
    const a1 = pt(wd, -len * 0.18);
    const a2 = pt(wd, len);
    const a3 = pt(-wd, len);
    const p = this.pos;
    const o = q * 12;
    const z = 0.002;
    p.set([a0[0], a0[1], z, a1[0], a1[1], z, a2[0], a2[1], z, a3[0], a3[1], z], o);
    const uv = uvRect(224, 256 + 8, 240, 256 + 120);
    this.uv.set([uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]], q * 8);
  }

  /** read the dashboard (null = everything off: a model in a test, the dash before the systems) */
  update(d: Dashboard | null, night: boolean): void {
    const sweepBig = (120 * Math.PI) / 180;
    const sweep = (60 * Math.PI) / 180;
    const rpm = d ? Math.min(1, d.rpm / this.scaleRpm) : 0;
    const temp = d ? d.temp : 0;
    const bat = d ? (d.ignition === 'off' ? 0 : d.battery) : 0;
    this.needles.rpm = rpm;
    this.needles.temp = temp;
    this.needles.battery = bat;
    this.needle(1, 0, -sweepBig + 2 * sweepBig * rpm);
    this.needle(2, 1, -sweep + 2 * sweep * temp);
    this.needle(3, 2, -sweep + 2 * sweep * bat);
    // lamps: lit during the self-check (amber, or the red it found), then as the systems say
    const sc = d?.selfCheck;
    LAMPS.forEach((l, i) => {
      let level = 0;
      if (d && d.ignition !== 'off') {
        if (sc?.active) {
          const r = sc.results.find((x) => x.lamp === l);
          level = i < sc.step ? Math.max(1, r?.level ?? 1) : 0;
        } else level = d.lamps[l] ?? 0;
      }
      this.lit[l] = level;
      const q = 4 + i;
      if (!level) this.hide(q);
      else {
        const [x0, y0] = this.px(LAMP_X + i * CELL + 4, 36);
        const [x1, y1] = this.px(LAMP_X + i * CELL + 60, 92);
        const cx = level === 2 ? 448 + i * CELL : i * CELL;
        this.quad(q, x0, y1, x1, y0, 0.001, uvRect(cx + 4, 128 + 36, cx + 60, 128 + 92));
      }
    });
    // the selector window: the letter the lever is in, lit
    this.selector = d && d.ignition !== 'off' ? d.selector : '';
    LETTERS.forEach((L, i) => {
      const q = 11 + i;
      if (this.selector !== L) this.hide(q);
      else {
        const [x0, y0] = this.px(LETTER_X + i * 48, 36);
        const [x1, y1] = this.px(LETTER_X + i * 48 + 48, 92);
        this.quad(q, x0, y1, x1, y0, 0.001, uvRect(i * 48, 256 + 36, i * 48 + 48, 256 + 92));
      }
    });
    const g = this.mesh.geometry;
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('uv') as THREE.BufferAttribute).needsUpdate = true;
    this.material.uniforms.uMapEmissive.value = night ? 0.45 : 0.25;
  }
}
