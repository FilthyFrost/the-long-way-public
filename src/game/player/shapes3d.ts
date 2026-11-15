/**
 * Painted stand-ins for the catalogue's item shapes (STYLE.md: cel-shaded props, inked): one small
 * low-poly geometry per ItemShape, standing on y = 0, centred, at the size of core/items/shapes.ts.
 *
 * Colour convention of the vertex colours: a pure grey (r = g = b) means "the item's tint × that
 * grey", anything else is a fixed colour (a can's tin rim, a jerrycan's cap). `bakeTinted` applies it.
 */
import * as THREE from 'three';
import type { ItemShape } from '../../core/items/catalog';
import { SHAPE_SIZE } from '../../core/items/shapes';
import { ModelBuilder } from '../vehicle/builder';

const T = 0xffffff; // tint
const TD = 0xb4b4b4; // tint, shaded
const TL = 0xffffff;
const TIN = 0xc9ced3;
const DARK = 0x3a3330;
const PAPER = 0xefe6d0;
const RUBBER = 0x2f3035;
const STEEL = 0x8d969b;

function build(shape: ItemShape): THREE.BufferGeometry {
  const s = SHAPE_SIZE[shape];
  const L = s.hx * 2;
  const H = s.h;
  const W = s.hz * 2;
  const b = new ModelBuilder();
  switch (shape) {
    case 'can':
      b.cyl(0, H / 2, 0, s.hx, H * 0.86, T, { segments: 10 });
      b.cyl(0, H * 0.965, 0, s.hx * 0.97, H * 0.07, TIN, { segments: 10 });
      b.cyl(0, H * 0.035, 0, s.hx * 0.97, H * 0.07, TIN, { segments: 10 });
      b.cyl(0, H * 0.5, 0, s.hx * 1.01, H * 0.36, PAPER, { segments: 10 });
      break;
    case 'jar':
      b.cyl(0, H * 0.42, 0, s.hx, H * 0.84, 0xd8e6e0, { segments: 9 });
      b.cyl(0, H * 0.4, 0, s.hx * 0.86, H * 0.7, T, { segments: 9 });
      b.cyl(0, H * 0.92, 0, s.hx * 0.9, H * 0.16, TIN, { segments: 9 });
      break;
    case 'bottle':
      b.cyl(0, H * 0.32, 0, s.hx, H * 0.64, T, { segments: 9 });
      b.cyl(0, H * 0.7, 0, s.hx * 0.38, H * 0.14, T, { segments: 9, radiusTop: s.hx * 0.38 });
      b.cyl(0, H * 0.67, 0, s.hx * 0.38, H * 0.08, T, { segments: 9, radiusTop: s.hx * 0.4 });
      b.cyl(0, H * 0.82, 0, s.hx * 0.36, H * 0.2, T, { segments: 8 });
      b.cyl(0, H * 0.95, 0, s.hx * 0.4, H * 0.08, DARK, { segments: 8 });
      b.cyl(0, H * 0.3, 0, s.hx * 1.02, H * 0.22, PAPER, { segments: 9 });
      break;
    case 'carton':
      b.box(0, H / 2, 0, L, H, W, T);
      b.box(0, H * 0.55, W / 2 + 0.002, L * 0.6, H * 0.4, 0.004, PAPER);
      break;
    case 'sack':
      b.hull([[-L / 2, 0, -W / 2], [L / 2, 0, -W / 2], [L / 2, 0, W / 2], [-L / 2, 0, W / 2], [-L * 0.42, H * 0.75, -W * 0.4], [L * 0.42, H * 0.75, -W * 0.4], [L * 0.42, H * 0.75, W * 0.4], [-L * 0.42, H * 0.75, W * 0.4], [0, H * 0.9, 0]], T);
      b.cyl(0, H * 0.93, 0, W * 0.18, H * 0.14, TD, { segments: 6 });
      break;
    case 'bundle':
      for (const [z, y] of [[-W * 0.25, H * 0.25], [W * 0.25, H * 0.25], [0, H * 0.72]]) b.cyl(0, y, z, H * 0.25, L, T, { rz: Math.PI / 2, segments: 6 });
      b.cyl(-L * 0.25, H * 0.45, 0, H * 0.58, 0.02, DARK, { rz: Math.PI / 2, segments: 8 });
      b.cyl(L * 0.25, H * 0.45, 0, H * 0.58, 0.02, DARK, { rz: Math.PI / 2, segments: 8 });
      break;
    case 'coil':
      b.torus(0, H / 2, 0, s.hx * 0.72, H * 0.42, T, { rx: Math.PI / 2 });
      b.torus(0, H * 0.75, 0, s.hx * 0.68, H * 0.22, TD, { rx: Math.PI / 2 });
      break;
    case 'roll':
      b.cyl(0, H / 2, 0, H / 2, L, T, { rz: Math.PI / 2, segments: 10 });
      b.cyl(0, H / 2, 0, H * 0.18, L * 1.04, TD, { rz: Math.PI / 2, segments: 8 });
      break;
    case 'jerrycan':
      b.box(0, H * 0.45, 0, L, H * 0.9, W, T);
      b.box(0, H * 0.45, W / 2 + 0.004, L * 0.8, H * 0.08, 0.008, TD);
      b.box(0, H * 0.45, -W / 2 - 0.004, L * 0.8, H * 0.08, 0.008, TD);
      b.box(-L * 0.12, H * 0.96, 0, L * 0.5, H * 0.08, W * 0.5, TD);
      b.cyl(L * 0.32, H * 0.95, 0, 0.025, H * 0.12, 0xd9b23c, { segments: 8 });
      break;
    case 'drum':
      b.cyl(0, H / 2, 0, s.hx, H, T, { segments: 14 });
      for (const y of [0.02, 0.33, 0.66, 0.98]) b.cyl(0, H * y, 0, s.hx * 1.03, 0.025, TD, { segments: 14 });
      b.cyl(s.hx * 0.5, H + 0.01, 0, 0.03, 0.02, STEEL, { segments: 8 });
      break;
    case 'tyre':
      b.torus(0, H / 2, 0, s.hx * 0.7, H * 0.5, RUBBER, { rx: Math.PI / 2 });
      b.cyl(0, H / 2, 0, s.hx * 0.5, H * 0.6, T, { segments: 12 });
      b.cyl(0, H / 2, 0, s.hx * 0.16, H * 0.66, STEEL, { segments: 8 });
      break;
    case 'battery':
      b.box(0, H * 0.45, 0, L, H * 0.9, W, T);
      b.box(0, H * 0.92, 0, L, H * 0.06, W, DARK);
      b.cyl(-L * 0.3, H, 0, 0.018, 0.04, 0xc23a2b, { segments: 6 });
      b.cyl(L * 0.3, H, 0, 0.018, 0.04, DARK, { segments: 6 });
      break;
    case 'machine':
      b.box(0, H * 0.4, 0, L, H * 0.7, W, T);
      b.box(0, H * 0.08, 0, L * 1.04, H * 0.16, W * 1.04, DARK);
      b.cyl(L * 0.18, H * 0.82, 0, W * 0.28, H * 0.22, STEEL, { segments: 8 });
      b.bar(-L * 0.45, H * 0.82, -W * 0.45, -L * 0.45, H * 0.82, W * 0.45, 0.025, DARK);
      break;
    case 'tool':
      b.box(-L * 0.2, H / 2, 0, L * 0.6, H * 0.8, W * 0.7, T);
      b.box(L * 0.3, H / 2, 0, L * 0.4, H * 0.6, W * 0.45, STEEL);
      b.box(L * 0.48, H / 2, 0, L * 0.06, H, W, STEEL);
      break;
    case 'case':
      b.box(0, H * 0.45, 0, L, H * 0.9, W, T);
      b.box(0, H * 0.93, 0, L * 1.02, H * 0.12, W * 1.02, TD);
      b.box(0, H * 0.6, W / 2 + 0.003, L * 0.16, H * 0.18, 0.006, TIN);
      break;
    case 'book':
      b.box(0, H / 2, 0, L, H, W, T);
      b.box(L * 0.02, H / 2, 0, L * 0.96, H * 0.8, W * 0.96 + 0.004, PAPER);
      b.box(-L / 2 + 0.006, H / 2, 0, 0.012, H * 1.02, W, TD);
      break;
    case 'tape':
      b.box(0, H / 2, 0, L, H, W, DARK);
      b.box(0, H + 0.001, 0, L * 0.86, 0.002, W * 0.62, T);
      break;
    case 'paper':
      b.box(0, H / 2, 0, L, H, W, T, { ry: 0.12 });
      b.box(0.01, H * 1.4, 0.005, L * 0.95, H * 0.8, W * 0.95, TL, { ry: -0.08 });
      break;
    case 'fish':
      b.hull([[-L * 0.3, H / 2, 0], [L * 0.38, H / 2, 0], [0, H, 0], [0, 0.005, 0], [0, H / 2, s.hz], [0, H / 2, -s.hz], [L * 0.2, H * 0.8, 0], [L * 0.2, H * 0.2, 0]], T);
      b.hull([[-L * 0.28, H / 2, 0], [-L / 2, H * 0.95, 0.004], [-L / 2, 0.01, 0.004], [-L / 2, H * 0.95, -0.004], [-L / 2, 0.01, -0.004]], TD);
      break;
    case 'bunch':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.bar(0, 0.01, 0, Math.cos(a) * L * 0.4, H * (0.6 + 0.4 * (i % 2)), Math.sin(a) * W * 0.35, 0.012, T);
        b.sphere(Math.cos(a) * L * 0.42, H * (0.6 + 0.4 * (i % 2)), Math.sin(a) * W * 0.38, 0.022, T, 0);
      }
      b.cyl(0, 0.015, 0, 0.012, 0.03, 0x8a6a48, { segments: 6 });
      break;
    case 'cap':
      b.cyl(0, H * 0.3, 0, s.hx * 0.35, H * 0.6, PAPER, { segments: 7 });
      b.hull([[-s.hx, H * 0.55, 0], [s.hx, H * 0.55, 0], [0, H * 0.55, -s.hz], [0, H * 0.55, s.hz], [0, H, 0], [s.hx * 0.7, H * 0.8, s.hz * 0.7], [-s.hx * 0.7, H * 0.8, -s.hz * 0.7], [s.hx * 0.7, H * 0.8, -s.hz * 0.7], [-s.hx * 0.7, H * 0.8, s.hz * 0.7]], T);
      break;
    case 'berry':
      b.cyl(0, H * 0.2, 0, s.hx, H * 0.4, 0xb89466, { segments: 8, radiusTop: s.hx * 1.1 });
      for (let i = 0; i < 6; i++) b.sphere(Math.cos(i * 1.05) * s.hx * 0.55, H * (0.45 + 0.15 * (i % 2)), Math.sin(i * 1.05) * s.hz * 0.55, 0.018, T, 0);
      break;
    case 'egg':
      for (let i = 0; i < 3; i++) b.sphere(Math.cos(i * 2.1) * 0.025, H * 0.45, Math.sin(i * 2.1) * 0.025, H * 0.45, T, 1);
      break;
    case 'cut':
      b.hull([[-L / 2, 0, -W * 0.3], [L / 2, 0, -W / 2], [L * 0.4, 0, W / 2], [-L * 0.45, 0, W * 0.4], [-L * 0.3, H, 0], [L * 0.3, H * 0.9, -W * 0.1], [0, H, W * 0.25]], T);
      b.cyl(L * 0.48, H * 0.4, 0, 0.012, 0.06, PAPER, { rz: Math.PI / 2, segments: 6 });
      break;
    case 'pelt':
      b.hull([[-L / 2, 0, -W * 0.4], [L / 2, 0, -W / 2], [L / 2, 0, W / 2], [-L / 2, 0, W * 0.4], [-L * 0.3, H, 0], [L * 0.3, H * 0.9, 0], [0, H * 0.7, W * 0.4], [0, H * 0.7, -W * 0.4]], T);
      b.sphere(L * 0.55, H * 0.4, 0, H * 0.4, TD, 0);
      break;
    case 'tuber':
      b.sphere(0, H / 2, 0, s.hx, T, 0);
      b.sphere(s.hx * 0.7, H * 0.4, s.hz * 0.4, s.hx * 0.65, TD, 0);
      break;
  }
  return b.build();
}

const cache = new Map<ItemShape, THREE.BufferGeometry>();

/** the shape's geometry (built once, shared) */
export function shapeGeometry(shape: ItemShape): THREE.BufferGeometry {
  let g = cache.get(shape);
  if (!g) cache.set(shape, (g = build(shape)));
  return g;
}

const tint = new THREE.Color();

/**
 * Write a shape into flat arrays at an offset: positions moved by `m`, normals turned, colours
 * tinted. Returns the number of vertices written.
 */
export function bakeTinted(shape: ItemShape, tintHex: number, m: THREE.Matrix4, pos: Float32Array, nor: Float32Array, col: Float32Array, at: number, scale = 1): number {
  const g = shapeGeometry(shape);
  const P = g.getAttribute('position') as THREE.BufferAttribute;
  const N = g.getAttribute('normal') as THREE.BufferAttribute;
  const C = g.getAttribute('color') as THREE.BufferAttribute;
  tint.setHex(tintHex);
  const e = m.elements;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i) * scale;
    const y = P.getY(i) * scale;
    const z = P.getZ(i) * scale;
    const k = (at + i) * 3;
    pos[k] = e[0] * x + e[4] * y + e[8] * z + e[12];
    pos[k + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
    pos[k + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    const nx = N.getX(i);
    const ny = N.getY(i);
    const nz = N.getZ(i);
    nor[k] = e[0] * nx + e[4] * ny + e[8] * nz;
    nor[k + 1] = e[1] * nx + e[5] * ny + e[9] * nz;
    nor[k + 2] = e[2] * nx + e[6] * ny + e[10] * nz;
    const r = C.getX(i);
    const gg = C.getY(i);
    const bb = C.getZ(i);
    if (r === gg && gg === bb) {
      col[k] = tint.r * r;
      col[k + 1] = tint.g * r;
      col[k + 2] = tint.b * r;
    } else {
      col[k] = r;
      col[k + 1] = gg;
      col[k + 2] = bb;
    }
  }
  return P.count;
}

export function vertexCount(shape: ItemShape): number {
  return shapeGeometry(shape).getAttribute('position').count;
}
