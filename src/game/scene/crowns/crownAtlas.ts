/** Orthographic projections of the actual grown model. Store the first surface hit along
 * each ray, before lighting, so weather, season and time of day can change without a rebake. */
import * as THREE from 'three';
import { leafDabs } from '../../render/textures';

export const ATLAS_COLS = 4;
const SIDE = 64;
const WIDTH = SIDE * ATLAS_COLS;

// Sample a coarse mip of the spray. The distance-dependent alpha cut in the
// live shader keeps a texel if even part of a dab survives the mip filter.
const MASK = 32;
const spray = new Uint8Array(MASK * MASK);
leafDabs((cx, cy, rx, ry, turn) => {
  const c = Math.cos(turn), s = Math.sin(turn);
  for (let y = 0; y < MASK; y++) for (let x = 0; x < MASK; x++) {
    const dx = (x + 0.5) * 256 / MASK - cx, dy = (MASK - y - 0.5) * 256 / MASK - cy;
    if (((c * dx + s * dy) / (rx + 2)) ** 2 + ((c * dy - s * dx) / (ry + 2)) ** 2 < 1)
      spray[y * MASK + x] = 1;
  }
});
function covered(u: number, v: number): boolean {
  return spray[(Math.floor(v * MASK) & (MASK - 1)) * MASK + (Math.floor(u * MASK) & (MASK - 1))] !== 0;
}

/** `cover`: whether a spray's picture has foliage at a uv (default: the world's one round spray; the plant toolkit's atlas has its own) */
export function bakeCrown(g: THREE.BufferGeometry, cover: (u: number, v: number) => boolean = covered) {
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), uv = g.getAttribute('uv');
  const crown = g.getAttribute('aCrown'), part = g.getAttribute('aPart'), index = g.getIndex()!;
  let radius = 0, bottom = Infinity, top = -Infinity;
  for (let i = 0; i < p.count; i++) {
    radius = Math.max(radius, Math.hypot(p.getX(i), p.getZ(i)));
    bottom = Math.min(bottom, p.getY(i));
    top = Math.max(top, p.getY(i));
  }
  // Two clear texels around each view for the mip filter.
  radius *= SIDE / (SIDE - 4);
  const pad = (top - bottom) * 2 / (SIDE - 4);
  top += pad;
  bottom -= pad;
  const winter = Array.from(part.array).some(value => value > 0.5 && value < 2.5);
  const height = WIDTH * (winter ? 2 : 1);
  const normals = new Uint8Array(WIDTH * height * 4), paint = new Uint8Array(normals.length);
  const depths = new Float32Array(SIDE * SIDE);
  const x = new Float32Array(p.count), y = new Float32Array(p.count), z = new Float32Array(p.count);
  for (let view = 0; view < (winter ? 2 : 1) * ATLAS_COLS ** 2; view++) {
    const angle = view * Math.PI * 2 / ATLAS_COLS ** 2, c = Math.cos(angle), s = Math.sin(angle);
    depths.fill(-Infinity);
    for (let i = 0; i < p.count; i++) {
      x[i] = ((c * p.getX(i) - s * p.getZ(i)) / radius + 1) * SIDE / 2;
      y[i] = (p.getY(i) - bottom) * SIDE / (top - bottom);
      z[i] = s * p.getX(i) + c * p.getZ(i);
    }
    for (let tri = 0; tri < index.count; tri += 3) {
      const a = index.getX(tri), b = index.getX(tri + 1), d = index.getX(tri + 2);
      const bx = x[b] - x[a], by = y[b] - y[a], dx = x[d] - x[a], dy = y[d] - y[a];
      const area = bx * dy - by * dx;
      if (Math.abs(area) < 1e-5) continue;
      const x0 = Math.floor(Math.min(x[a], x[b], x[d])), x1 = Math.ceil(Math.max(x[a], x[b], x[d]));
      const y0 = Math.floor(Math.min(y[a], y[b], y[d])), y1 = Math.ceil(Math.max(y[a], y[b], y[d]));
      const material = part.getX(a);
      if (view >= ATLAS_COLS ** 2 && material > 0.5 && material < 2.5) continue;
      const leaf = material > 1.5 && material < 2.5;
      for (let row = y0; row < y1; row++) for (let col = x0; col < x1; col++) {
        const rx = col + 0.5 - x[a], ry = row + 0.5 - y[a];
        const v = (rx * dy - ry * dx) / area, w = (bx * ry - by * rx) / area, u = 1 - v - w;
        if (Math.min(u, v, w) < 0) continue;
        const depth = u * z[a] + v * z[b] + w * z[d], cell = row * SIDE + col;
        if (depth <= depths[cell]) continue;
        if (leaf) {
          const tx = u * uv.getX(a) + v * uv.getX(b) + w * uv.getX(d);
          const ty = u * uv.getY(a) + v * uv.getY(b) + w * uv.getY(d);
          if (!cover(tx, ty)) continue;
          if (material > 2.05 && material < 2.18) {
            const qx = (tx * 2 % 1) * 2 - 1, qy = (ty * 2 % 1) * 2 - 1;
            const width = (0.18 + 0.86 * (qy * 0.5 + 0.5)) * Math.sqrt(Math.max(0, 1 - qy * qy));
            if (Math.abs(qx) > width || qy > 0.99 - 0.22 * Math.exp(-qx * qx * 38)) continue;
          } else if (material >= 2.18) {
            const x = tx * 2 - 1, y = ty * 2 - 1, fold = (y - Math.abs(x) * 0.52) * 3;
            if (fold - Math.floor(fold) > 0.50 && Math.abs(x) > 0.05) continue;
          }
        }

        const dst = ((Math.floor(view / ATLAS_COLS) * SIDE + row) * WIDTH + view % ATLAS_COLS * SIDE + col) * 4;
        const nx = u * n.getX(a) + v * n.getX(b) + w * n.getX(d);
        const ny = u * n.getY(a) + v * n.getY(b) + w * n.getY(d);
        const nz = u * n.getZ(a) + v * n.getZ(b) + w * n.getZ(d);
        const norm = 127.5 / Math.max(0.0001, Math.hypot(nx, ny, nz));
        if (part.getX(a) === 1) {
          const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
          const tx = ay > Math.max(ax, az) ? nx : ax > az ? nz : nx;
          const ty = ay > Math.max(ax, az) ? nz : ny;
          const phase = crown.getY(a) * 7;
          if (!covered(tx * norm / 127.5 * 2.3 + phase, ty * norm / 127.5 * 2.3 + phase)) continue;
        }
        depths[cell] = depth;
        normals[dst] = nx * norm + 127.5;
        normals[dst + 1] = ny * norm + 127.5;
        normals[dst + 2] = nz * norm + 127.5;
        normals[dst + 3] = 255;
        paint[dst] = (depth / radius + 1) * 127.5;
        paint[dst + 1] = (u * crown.getZ(a) + v * crown.getZ(b) + w * crown.getZ(d)) * 255;
        paint[dst + 2] = Math.round(material) * 32;
        paint[dst + 3] = crown.getX(a) * 255;
      }
    }
  }
  return { normals, paint, width: WIDTH, height, radius, bottom, top };
}

export function atlasTexture(data: Uint8Array<ArrayBuffer>, width: number) {
  const t = new THREE.DataTexture(data, width, data.length / (width * 4));
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
