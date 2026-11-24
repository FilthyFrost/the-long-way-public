/**
 * Pictures the ND keepsakes carry, painted on a canvas the first time they are wanted (docs/ND/PLAN.md, ND4): a licence
 * plate's face — its region's colours, its number pressed into it, its region's name, the wear of its grade, a foil's
 * shimmer — and the six paintings a picture frame may hold (Nomad Drive has six of its own; these are ours: a lake under
 * the mountains at dawn, a road through the wheat at sundown, a lighthouse on its cliff, flowers in a jug, a red barn
 * under summer clouds, the moon over the pines), in the look of the game: flat shapes in soft light, a little grain.
 * Each canvas is made once and kept.
 */
import * as THREE from 'three';
import { plateText, REGIONS, type PlateRoll } from '../../../core/v3/nd/plates';

const css = (hex: number, a = 1): string => `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`;

/** a small seeded random, so a picture is the same each time it is painted */
function rand(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a ^= a << 13;
    a ^= a >>> 17;
    a ^= a << 5;
    return (a >>> 0) / 4294967296;
  };
}

function canvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  return g ? { c, g } : null;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** a fine grain over a canvas (paint, or a pressed plate's surface) */
function grain(g: CanvasRenderingContext2D, w: number, h: number, a: number, seed: number): void {
  const r = rand(seed);
  for (let i = 0; i < (w * h) / 60; i++) {
    g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${a * r()})` : `rgba(0,0,0,${a * r()})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}

const textures = new Map<string, THREE.CanvasTexture>();

function kept(key: string, paint: () => HTMLCanvasElement | null): THREE.CanvasTexture | null {
  let t = textures.get(key);
  if (t) return t;
  const c = paint();
  if (!c) return null;
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  textures.set(key, t);
  return t;
}

// ------------------------------------------------------------------ the plate

/** a plate's face as a texture (its number, its region's colours, its wear) */
export function plateTexture(p: PlateRoll): THREE.CanvasTexture | null {
  const key = `plate:${plateText(p)}:${p.foil ? 1 : 0}:${p.grade}`;
  return kept(key, () => paintPlate(p));
}

function paintPlate(p: PlateRoll): HTMLCanvasElement | null {
  const W = 1024;
  const H = 360;
  const cv = canvas(W, H);
  if (!cv) return null;
  const { c, g } = cv;
  const reg = REGIONS[p.region];
  const r = rand(p.region * 7919 + p.grade * 131 + p.tail.charCodeAt(0) * 17 + (p.foil ? 5 : 0));
  // the ground: the region's colour, a foil's sheen of gold over it
  g.fillStyle = css(reg.ground);
  g.fillRect(0, 0, W, H);
  if (p.foil) {
    const sh = g.createLinearGradient(0, 0, W, H);
    sh.addColorStop(0, 'rgba(255,236,170,0.55)');
    sh.addColorStop(0.35, 'rgba(255,255,255,0.15)');
    sh.addColorStop(0.5, 'rgba(255,214,110,0.6)');
    sh.addColorStop(0.65, 'rgba(255,255,255,0.12)');
    sh.addColorStop(1, 'rgba(230,180,80,0.55)');
    g.fillStyle = sh;
    g.fillRect(0, 0, W, H);
  }
  // a soft light across it (pressed steel)
  const lt = g.createLinearGradient(0, 0, 0, H);
  lt.addColorStop(0, 'rgba(255,255,255,0.18)');
  lt.addColorStop(0.5, 'rgba(255,255,255,0)');
  lt.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = lt;
  g.fillRect(0, 0, W, H);
  // the pressed border
  g.lineWidth = 10;
  g.strokeStyle = css(reg.ink, 0.92);
  roundRect(g, 26, 22, W - 52, H - 44, 26);
  g.stroke();
  // its region's name over the number, and a sticker
  g.fillStyle = css(reg.ink, 0.9);
  g.font = '600 46px "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(reg.name, W / 2, 74);
  g.fillStyle = css(0xf0c23c);
  roundRect(g, W - 150, 46, 92, 52, 10);
  g.fill();
  g.fillStyle = css(0x2b2d31);
  g.font = '700 34px "Arial Black", "Arial", sans-serif';
  g.fillText('26', W - 104, 73);
  // the number, pressed: its shadow under it, a light edge over it
  const text = plateText(p);
  g.font = '900 150px "Microsoft YaHei", "PingFang SC", "Arial Black", sans-serif';
  const fit = Math.min(1, (W - 120) / g.measureText(text).width);
  g.save();
  g.translate(W / 2, 214);
  g.scale(fit, 1);
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.fillText(text, 4, 6);
  g.fillStyle = css(reg.ink);
  g.fillText(text, 0, 0);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillText(text, -2, -3);
  g.restore();
  // its wear: the worse its grade, the more rust, scratches and fading
  const wear = [1, 0.65, 0.35, 0.12, 0][p.grade];
  if (wear > 0) {
    g.fillStyle = `rgba(240,236,224,${0.22 * wear})`;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 40 * wear; i++) {
      g.strokeStyle = `rgba(255,255,255,${0.25 + 0.3 * r()})`;
      g.lineWidth = 1 + r() * 2;
      const x = r() * W;
      const y = r() * H;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 160, y + (r() - 0.5) * 30);
      g.stroke();
    }
    for (let i = 0; i < 26 * wear * wear + (p.grade === 0 ? 10 : 0); i++) {
      const x = r() < 0.6 ? (r() < 0.5 ? r() * 90 : W - r() * 90) : r() * W;
      const y = r() < 0.6 ? (r() < 0.5 ? r() * 60 : H - r() * 60) : r() * H;
      const rr = 6 + r() * 26 * wear;
      const rg = g.createRadialGradient(x, y, 0, x, y, rr);
      rg.addColorStop(0, 'rgba(122,62,28,0.85)');
      rg.addColorStop(0.6, 'rgba(150,84,40,0.5)');
      rg.addColorStop(1, 'rgba(150,84,40,0)');
      g.fillStyle = rg;
      g.beginPath();
      g.ellipse(x, y, rr, rr * (0.6 + r() * 0.5), r() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
  } else {
    // mint: a clean shine across it
    const sh = g.createLinearGradient(W * 0.2, 0, W * 0.45, H);
    sh.addColorStop(0, 'rgba(255,255,255,0)');
    sh.addColorStop(0.5, 'rgba(255,255,255,0.22)');
    sh.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sh;
    g.fillRect(0, 0, W, H);
  }
  grain(g, W, H, 0.08, p.region * 31 + 7);
  return c;
}

// ------------------------------------------------------------------ the paintings

export const PICTURES = ['湖边的山', '麦田里的路', '崖上的灯塔', '罐子里的花', '红谷仓', '松林上的月亮'] as const;

/** one of the six paintings as a texture */
export function pictureTexture(k: number): THREE.CanvasTexture | null {
  const i = ((Math.round(k) % PICTURES.length) + PICTURES.length) % PICTURES.length;
  return kept(`picture:${i}`, () => paintPicture(i));
}

function sky(g: CanvasRenderingContext2D, S: number, stops: [number, number][]): void {
  const s = g.createLinearGradient(0, 0, 0, S);
  for (const [t, c] of stops) s.addColorStop(t, css(c));
  g.fillStyle = s;
  g.fillRect(0, 0, S, S);
}

/** a ridge of hills or mountains across the picture, its top line from a seed */
function ridge(g: CanvasRenderingContext2D, S: number, y: number, amp: number, n: number, color: number, seed: number, sharp = false): void {
  const r = rand(seed);
  g.fillStyle = css(color);
  g.beginPath();
  g.moveTo(0, S);
  const k = 2 + Math.floor(r() * 3);
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * S;
    const t = i / n;
    let h = Math.sin(t * Math.PI * k + r() * 0.4 + seed) * 0.5 + Math.sin(t * Math.PI * (k * 2.3) + seed * 2) * 0.25;
    if (sharp) h = Math.abs(h) * 1.6 - 0.3;
    g.lineTo(x, y - h * amp - r() * amp * 0.15);
  }
  g.lineTo(S, S);
  g.closePath();
  g.fill();
}

function cloud(g: CanvasRenderingContext2D, x: number, y: number, s: number, light: string, shade: string): void {
  const puffs: [number, number, number][] = [[0, 0, 1], [-0.9, 0.25, 0.7], [0.9, 0.2, 0.75], [-0.45, -0.35, 0.65], [0.45, -0.4, 0.7], [1.5, 0.35, 0.5], [-1.5, 0.4, 0.45]];
  g.fillStyle = shade;
  for (const [dx, dy, r] of puffs) {
    g.beginPath();
    g.arc(x + dx * s, y + dy * s + s * 0.12, r * s, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = light;
  for (const [dx, dy, r] of puffs) {
    g.beginPath();
    g.arc(x + dx * s - s * 0.05, y + dy * s - s * 0.05, r * s * 0.9, 0, Math.PI * 2);
    g.fill();
  }
}

function pine(g: CanvasRenderingContext2D, x: number, base: number, h: number, color: string): void {
  g.fillStyle = color;
  for (let k = 0; k < 4; k++) {
    const y0 = base - h * (k / 4.2);
    const w = h * (0.32 - k * 0.06);
    g.beginPath();
    g.moveTo(x - w, y0);
    g.lineTo(x + w, y0);
    g.lineTo(x, y0 - h * 0.38);
    g.closePath();
    g.fill();
  }
  g.fillRect(x - h * 0.03, base - h * 0.08, h * 0.06, h * 0.1);
}

function paintPicture(i: number): HTMLCanvasElement | null {
  const S = 512;
  const cv = canvas(S, S);
  if (!cv) return null;
  const { c, g } = cv;
  const r = rand(1000 + i * 77);
  switch (i) {
    case 0: {
      // a lake under the mountains at dawn
      sky(g, S, [[0, 0x8fb8de], [0.45, 0xf6d6b8], [0.62, 0xf3b98f]]);
      g.fillStyle = 'rgba(255,240,210,0.9)';
      g.beginPath();
      g.arc(S * 0.68, S * 0.5, 30, 0, Math.PI * 2);
      g.fill();
      ridge(g, S, S * 0.48, 90, 40, 0x8f9cc4, 3, true);
      ridge(g, S, S * 0.56, 60, 40, 0x6f7fae, 9, true);
      // the lake and its glints
      const lake = g.createLinearGradient(0, S * 0.6, 0, S);
      lake.addColorStop(0, css(0xf0c8a8));
      lake.addColorStop(0.4, css(0x8fb0d0));
      lake.addColorStop(1, css(0x4f6f9a));
      g.fillStyle = lake;
      g.fillRect(0, S * 0.6, S, S * 0.4);
      for (let k = 0; k < 40; k++) {
        g.fillStyle = `rgba(255,245,225,${0.25 + r() * 0.4})`;
        g.fillRect(S * 0.55 + (r() - 0.5) * 140, S * 0.62 + r() * 120, 10 + r() * 30, 2);
      }
      for (let k = 0; k < 9; k++) pine(g, k < 5 ? 20 + k * 34 : S - 40 - (k - 5) * 30, S * 0.68 + r() * 10, 70 + r() * 50, css(0x2f4a3a));
      break;
    }
    case 1: {
      // a road through the wheat at sundown
      sky(g, S, [[0, 0x6f8fc8], [0.4, 0xf3a87a], [0.58, 0xf8d68a]]);
      g.fillStyle = 'rgba(255,230,160,0.95)';
      g.beginPath();
      g.arc(S * 0.5, S * 0.56, 46, Math.PI, 0);
      g.fill();
      cloud(g, S * 0.25, S * 0.2, 26, 'rgba(255,214,190,0.9)', 'rgba(220,140,120,0.7)');
      cloud(g, S * 0.78, S * 0.3, 20, 'rgba(255,214,190,0.9)', 'rgba(220,140,120,0.7)');
      g.fillStyle = css(0xd8a648);
      g.fillRect(0, S * 0.56, S, S * 0.44);
      for (let k = 0; k < 220; k++) {
        g.strokeStyle = `rgba(${200 + r() * 55},${150 + r() * 60},${60 + r() * 30},0.8)`;
        g.lineWidth = 1.5;
        const x = r() * S;
        const y = S * 0.58 + r() * S * 0.42;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 6, y - 8 - r() * 10);
        g.stroke();
      }
      g.fillStyle = css(0x6f6a72);
      g.beginPath();
      g.moveTo(S * 0.5 - 6, S * 0.56);
      g.lineTo(S * 0.5 + 6, S * 0.56);
      g.lineTo(S * 0.72, S);
      g.lineTo(S * 0.28, S);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(255,240,200,0.85)';
      g.setLineDash([18, 22]);
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(S * 0.5, S * 0.57);
      g.lineTo(S * 0.5, S);
      g.stroke();
      g.setLineDash([]);
      for (let k = 0; k < 5; k++) {
        const t = k / 5;
        const x = S * (0.55 + 0.4 * t * t);
        const y = S * (0.56 + 0.42 * t);
        g.fillStyle = css(0x4a3a30);
        g.fillRect(x, y - 60 * (0.3 + t), 4 + 4 * t, 60 * (0.3 + t));
      }
      break;
    }
    case 2: {
      // a lighthouse on its cliff
      sky(g, S, [[0, 0x6fa8d8], [0.6, 0xbfe0ee]]);
      cloud(g, S * 0.3, S * 0.22, 30, 'rgba(255,255,255,0.95)', 'rgba(180,200,225,0.8)');
      cloud(g, S * 0.8, S * 0.14, 20, 'rgba(255,255,255,0.95)', 'rgba(180,200,225,0.8)');
      g.fillStyle = css(0x3f8fb0);
      g.fillRect(0, S * 0.58, S, S * 0.42);
      for (let k = 0; k < 50; k++) {
        g.fillStyle = 'rgba(255,255,255,0.7)';
        g.fillRect(r() * S * 0.6, S * 0.6 + r() * S * 0.38, 12 + r() * 20, 2);
      }
      g.fillStyle = css(0x7a9a52);
      g.beginPath();
      g.moveTo(S * 0.45, S);
      g.lineTo(S * 0.52, S * 0.66);
      g.quadraticCurveTo(S * 0.75, S * 0.56, S, S * 0.58);
      g.lineTo(S, S);
      g.closePath();
      g.fill();
      g.fillStyle = css(0x8a7a66);
      g.beginPath();
      g.moveTo(S * 0.45, S);
      g.lineTo(S * 0.52, S * 0.66);
      g.lineTo(S * 0.58, S * 0.7);
      g.lineTo(S * 0.55, S);
      g.closePath();
      g.fill();
      const lx = S * 0.76;
      const ly = S * 0.58;
      for (let k = 0; k < 4; k++) {
        g.fillStyle = k % 2 ? css(0xf3efe6) : css(0xc8372f);
        g.beginPath();
        g.moveTo(lx - 26 + k * 2, ly - k * 36);
        g.lineTo(lx + 26 - k * 2, ly - k * 36);
        g.lineTo(lx + 24 - k * 2, ly - (k + 1) * 36);
        g.lineTo(lx - 24 + k * 2, ly - (k + 1) * 36);
        g.closePath();
        g.fill();
      }
      g.fillStyle = css(0xf6e7a0);
      g.fillRect(lx - 16, ly - 172, 32, 26);
      g.fillStyle = css(0x2b2d31);
      g.beginPath();
      g.moveTo(lx - 22, ly - 172);
      g.lineTo(lx + 22, ly - 172);
      g.lineTo(lx, ly - 196);
      g.closePath();
      g.fill();
      break;
    }
    case 3: {
      // flowers in a jug on a table by a wall
      g.fillStyle = css(0xe8dcc0);
      g.fillRect(0, 0, S, S);
      g.fillStyle = css(0xd8c8a4);
      for (let k = 0; k < 12; k++) g.fillRect(k * 44 + 8, 0, 3, S * 0.68);
      g.fillStyle = css(0x8a5a3c);
      g.fillRect(0, S * 0.68, S, S * 0.32);
      g.fillStyle = css(0x6b4a2f);
      g.fillRect(0, S * 0.68, S, 10);
      // the jug
      g.fillStyle = css(0x3e6f9a);
      g.beginPath();
      g.moveTo(S * 0.4, S * 0.82);
      g.quadraticCurveTo(S * 0.36, S * 0.62, S * 0.44, S * 0.52);
      g.lineTo(S * 0.56, S * 0.52);
      g.quadraticCurveTo(S * 0.64, S * 0.62, S * 0.6, S * 0.82);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(S * 0.43, S * 0.56, 8, S * 0.2);
      // the stems and the flowers
      const fl = [0xc8372f, 0xf0c23c, 0xf3efe6, 0xe86ab0, 0xe8a23a, 0xc8372f, 0xf0c23c];
      for (let k = 0; k < 7; k++) {
        const a = -0.9 + (k / 6) * 1.8;
        const x = S * 0.5 + Math.sin(a) * S * 0.2;
        const y = S * 0.32 - Math.cos(a) * S * 0.08 + r() * 20;
        g.strokeStyle = css(0x4f7a3a);
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(S * 0.5, S * 0.54);
        g.quadraticCurveTo(S * 0.5 + Math.sin(a) * S * 0.05, S * 0.42, x, y);
        g.stroke();
        for (let p = 0; p < 8; p++) {
          const pa = (p / 8) * Math.PI * 2;
          g.fillStyle = css(fl[k]);
          g.beginPath();
          g.ellipse(x + Math.cos(pa) * 13, y + Math.sin(pa) * 13, 10, 6, pa, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = css(0x6b4a2f);
        g.beginPath();
        g.arc(x, y, 7, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 4: {
      // a red barn under summer clouds
      sky(g, S, [[0, 0x4f8fd0], [0.7, 0xa8d0ee]]);
      cloud(g, S * 0.3, S * 0.25, 46, 'rgba(255,255,255,0.97)', 'rgba(190,205,230,0.85)');
      cloud(g, S * 0.75, S * 0.18, 34, 'rgba(255,255,255,0.97)', 'rgba(190,205,230,0.85)');
      ridge(g, S, S * 0.66, 30, 30, 0x7fb04a, 5);
      ridge(g, S, S * 0.76, 20, 30, 0x5f9a3a, 11);
      const bx = S * 0.38;
      const by = S * 0.74;
      g.fillStyle = css(0xb8372f);
      g.fillRect(bx - 80, by - 110, 160, 110);
      g.beginPath();
      g.moveTo(bx - 96, by - 106);
      g.lineTo(bx, by - 180);
      g.lineTo(bx + 96, by - 106);
      g.closePath();
      g.fill();
      g.fillStyle = css(0x5a3a30);
      g.beginPath();
      g.moveTo(bx - 100, by - 104);
      g.lineTo(bx, by - 184);
      g.lineTo(bx + 100, by - 104);
      g.lineTo(bx + 90, by - 100);
      g.lineTo(bx, by - 172);
      g.lineTo(bx - 90, by - 100);
      g.closePath();
      g.fill();
      g.strokeStyle = css(0xf3efe6);
      g.lineWidth = 6;
      g.strokeRect(bx - 34, by - 74, 68, 74);
      g.beginPath();
      g.moveTo(bx - 34, by - 74);
      g.lineTo(bx + 34, by);
      g.moveTo(bx + 34, by - 74);
      g.lineTo(bx - 34, by);
      g.stroke();
      g.fillStyle = css(0x2f5a2a);
      g.beginPath();
      g.arc(S * 0.78, S * 0.6, 52, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = css(0x4f8a3a);
      g.beginPath();
      g.arc(S * 0.76, S * 0.58, 40, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = css(0x5a3a30);
      g.fillRect(S * 0.77, S * 0.64, 10, 46);
      break;
    }
    default: {
      // the moon over the pines
      sky(g, S, [[0, 0x0f1838], [0.6, 0x24346a], [1, 0x3a4a7a]]);
      for (let k = 0; k < 90; k++) {
        g.fillStyle = `rgba(255,250,230,${0.4 + r() * 0.6})`;
        g.fillRect(r() * S, r() * S * 0.6, 1.5 + r() * 2, 1.5 + r() * 2);
      }
      const halo = g.createRadialGradient(S * 0.68, S * 0.26, 10, S * 0.68, S * 0.26, 120);
      halo.addColorStop(0, 'rgba(255,248,220,0.5)');
      halo.addColorStop(1, 'rgba(255,248,220,0)');
      g.fillStyle = halo;
      g.fillRect(0, 0, S, S);
      g.fillStyle = css(0xfff3d0);
      g.beginPath();
      g.arc(S * 0.68, S * 0.26, 44, 0, Math.PI * 2);
      g.fill();
      ridge(g, S, S * 0.72, 30, 30, 0x1a2a3a, 2);
      for (let k = 0; k < 12; k++) pine(g, k * 46 + r() * 20, S * 0.86 + r() * 20, 90 + r() * 80, css(0x0f1a26));
      g.fillStyle = css(0x2a2420);
      g.fillRect(S * 0.2, S * 0.78, 60, 40);
      g.fillStyle = css(0xf6c870);
      g.fillRect(S * 0.22 + 10, S * 0.78 + 10, 16, 14);
      break;
    }
  }
  // the paint's grain and a soft vignette
  grain(g, S, S, 0.06, 300 + i);
  const v = g.createRadialGradient(S / 2, S / 2, S * 0.35, S / 2, S / 2, S * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(40,24,10,0.25)');
  g.fillStyle = v;
  g.fillRect(0, 0, S, S);
  return c;
}
