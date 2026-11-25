// A small software rasterizer for looking at her without a browser: orthographic or perspective views of a
// triangle mesh with two-tone shading and an inked outline (depth and part breaks), written to PNG. Used by the
// generator's checks and the side-by-side with the turnaround (tools/character/compare.ts).
import fs from 'node:fs';
import { PNG } from 'pngjs';

export interface ViewMesh {
  positions: ArrayLike<number>;
  normals: ArrayLike<number>;
  indices: ArrayLike<number>;
  /** rgb 0..1 per vertex, or one colour */
  colors?: ArrayLike<number>;
  color?: [number, number, number];
  /** a number per vertex: a line is drawn where it changes across a pixel step (like the game's ink ids) */
  ids?: ArrayLike<number>;
}

export interface Cam {
  /** where the eye is and what it looks at */
  eye: [number, number, number];
  target: [number, number, number];
  up?: [number, number, number];
  /** orthographic: metres across the picture's height; perspective: vertical field of view in degrees */
  ortho?: number;
  fov?: number;
}

export interface Picture {
  w: number;
  h: number;
  rgb: Float32Array;
  depth: Float32Array;
  id: Float32Array;
}

export function newPicture(w: number, h: number, bg: [number, number, number] = [1, 1, 1]): Picture {
  const rgb = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) { rgb[i * 3] = bg[0]; rgb[i * 3 + 1] = bg[1]; rgb[i * 3 + 2] = bg[2]; }
  return { w, h, rgb, depth: new Float32Array(w * h).fill(Infinity), id: new Float32Array(w * h).fill(-1) };
}

const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const crossp = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normp = (a: number[]) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dotp = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export interface Light { dir: [number, number, number]; lit: [number, number, number]; shade: [number, number, number] }

/** Draws a mesh into a picture. Light: two tones, a hard turn at N·L = 0 (cel). */
export function draw(pic: Picture, m: ViewMesh, cam: Cam, light: Light = { dir: [0.4, 0.75, 0.55], lit: [1, 1, 1], shade: [0.62, 0.6, 0.72] }, idBase = 0): void {
  const { w, h } = pic;
  const f = normp(sub(cam.target, cam.eye));
  const upv = cam.up ?? [0, 1, 0];
  const r = normp(crossp(f, upv));
  const u = crossp(r, f);
  const L = normp(light.dir);
  const aspect = w / h;
  const n = m.positions.length / 3;
  const sx = new Float32Array(n), sy = new Float32Array(n), sz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = [m.positions[i * 3] - cam.eye[0], m.positions[i * 3 + 1] - cam.eye[1], m.positions[i * 3 + 2] - cam.eye[2]];
    const x = dotp(p, r), y = dotp(p, u), z = dotp(p, f);
    let px: number, py: number;
    if (cam.ortho) {
      const half = cam.ortho / 2;
      px = x / (half * aspect);
      py = y / half;
    } else {
      const t = Math.tan(((cam.fov ?? 40) * Math.PI) / 360);
      px = x / (z * t * aspect);
      py = y / (z * t);
    }
    sx[i] = (px * 0.5 + 0.5) * w;
    sy[i] = (0.5 - py * 0.5) * h;
    sz[i] = z;
  }
  const idx = m.indices;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (sz[a] <= 0.01 || sz[b] <= 0.01 || sz[c] <= 0.01) continue;
    const minX = Math.max(0, Math.floor(Math.min(sx[a], sx[b], sx[c]))), maxX = Math.min(w - 1, Math.ceil(Math.max(sx[a], sx[b], sx[c])));
    const minY = Math.max(0, Math.floor(Math.min(sy[a], sy[b], sy[c]))), maxY = Math.min(h - 1, Math.ceil(Math.max(sy[a], sy[b], sy[c])));
    const area = (sx[b] - sx[a]) * (sy[c] - sy[a]) - (sx[c] - sx[a]) * (sy[b] - sy[a]);
    if (Math.abs(area) < 1e-12) continue;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((sx[b] - px) * (sy[c] - py) - (sx[c] - px) * (sy[b] - py)) / area;
        const w1 = ((sx[c] - px) * (sy[a] - py) - (sx[a] - px) * (sy[c] - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * sz[a] + w1 * sz[b] + w2 * sz[c];
        const k = y * w + x;
        if (z >= pic.depth[k]) continue;
        pic.depth[k] = z;
        const nx = w0 * m.normals[a * 3] + w1 * m.normals[b * 3] + w2 * m.normals[c * 3];
        const ny = w0 * m.normals[a * 3 + 1] + w1 * m.normals[b * 3 + 1] + w2 * m.normals[c * 3 + 1];
        const nz = w0 * m.normals[a * 3 + 2] + w1 * m.normals[b * 3 + 2] + w2 * m.normals[c * 3 + 2];
        const nl = (nx * L[0] + ny * L[1] + nz * L[2]) / (Math.hypot(nx, ny, nz) || 1);
        const lit = nl > 0.02 ? 1 : nl > -0.02 ? (nl + 0.02) / 0.04 : 0;
        let cr: number, cg: number, cb: number;
        if (m.colors) {
          cr = w0 * m.colors[a * 3] + w1 * m.colors[b * 3] + w2 * m.colors[c * 3];
          cg = w0 * m.colors[a * 3 + 1] + w1 * m.colors[b * 3 + 1] + w2 * m.colors[c * 3 + 1];
          cb = w0 * m.colors[a * 3 + 2] + w1 * m.colors[b * 3 + 2] + w2 * m.colors[c * 3 + 2];
        } else [cr, cg, cb] = m.color ?? [0.8, 0.8, 0.8];
        pic.rgb[k * 3] = cr * (light.shade[0] + (light.lit[0] - light.shade[0]) * lit);
        pic.rgb[k * 3 + 1] = cg * (light.shade[1] + (light.lit[1] - light.shade[1]) * lit);
        pic.rgb[k * 3 + 2] = cb * (light.shade[2] + (light.lit[2] - light.shade[2]) * lit);
        pic.id[k] = idBase + (m.ids ? w0 * m.ids[a] + w1 * m.ids[b] + w2 * m.ids[c] : 0);
      }
    }
  }
}

/** Inks the picture: where depth jumps (by more than `jump` relative) or the id changes, a dark line. */
export function ink(pic: Picture, jump = 0.02, idStep = 0.5, color: [number, number, number] = [0.2, 0.14, 0.15]): void {
  const { w, h } = pic;
  const out = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const k = y * w + x;
      const d = pic.depth[k];
      for (const o of [1, -1, w, -w]) {
        const e = pic.depth[k + o];
        const near = Math.min(d, e);
        if (!isFinite(near)) { if (isFinite(d) !== isFinite(e)) out[k] = 1; continue; }
        if (d > e && (d - e) / e > jump) out[k] = 1;
        if (Math.abs(pic.id[k] - pic.id[k + o]) > idStep && d <= e) out[k] = 1;
      }
    }
  }
  for (let k = 0; k < w * h; k++) {
    if (!out[k]) continue;
    pic.rgb[k * 3] *= color[0];
    pic.rgb[k * 3 + 1] *= color[1];
    pic.rgb[k * 3 + 2] *= color[2];
  }
}

export function save(pic: Picture, file: string): void {
  const png = new PNG({ width: pic.w, height: pic.h });
  for (let i = 0; i < pic.w * pic.h; i++) {
    const g = (v: number) => Math.max(0, Math.min(255, Math.round(Math.pow(Math.max(0, v), 1 / 2.2) * 255)));
    png.data[i * 4] = g(pic.rgb[i * 3]);
    png.data[i * 4 + 1] = g(pic.rgb[i * 3 + 1]);
    png.data[i * 4 + 2] = g(pic.rgb[i * 3 + 2]);
    png.data[i * 4 + 3] = 255;
  }
  fs.writeFileSync(file, PNG.sync.write(png));
}

/** Puts pictures side by side (same height). */
export function row(pics: Picture[]): Picture {
  const h = Math.max(...pics.map((p) => p.h));
  const w = pics.reduce((s, p) => s + p.w, 0);
  const out = newPicture(w, h);
  let ox = 0;
  for (const p of pics) {
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const s = (y * p.w + x) * 3, d = (y * w + x + ox) * 3;
      out.rgb[d] = p.rgb[s]; out.rgb[d + 1] = p.rgb[s + 1]; out.rgb[d + 2] = p.rgb[s + 2];
    }
    ox += p.w;
  }
  return out;
}

/** Reads a PNG into a picture (linear colour), cropping (x, y, w, h) and scaling to height `toH`. */
export function load(file: string, crop?: [number, number, number, number], toH?: number): Picture {
  const png = PNG.sync.read(fs.readFileSync(file));
  const [cx, cy, cw, ch] = crop ?? [0, 0, png.width, png.height];
  const s = toH ? ch / toH : 1;
  const W = Math.round(cw / s), H = Math.round(ch / s);
  const pic = newPicture(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = Math.min(png.width - 1, Math.floor(cx + x * s)), sy = Math.min(png.height - 1, Math.floor(cy + y * s));
    const i = (sy * png.width + sx) * 4, k = (y * W + x) * 3;
    pic.rgb[k] = Math.pow(png.data[i] / 255, 2.2);
    pic.rgb[k + 1] = Math.pow(png.data[i + 1] / 255, 2.2);
    pic.rgb[k + 2] = Math.pow(png.data[i + 2] / 255, 2.2);
  }
  return pic;
}
