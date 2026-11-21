/**
 * Cumulus painted the way a background artist paints them (STYLE.md §7): a few big masses with
 * bright tops, a clean edge to their blue shade, and flat, deeper bases.
 *
 * Each cloud is a heap of spheres, smoothly merged; three sizes of round lumps push its skin
 * about and its base is cut level. A ray marcher draws them into a cube map around the player,
 * a strip at a time, so the sky itself is one lookup. Clouds stand on a world grid (same seed →
 * same sky) and drift with the wind; the cube is re-centred on the player every few hundred metres.
 */
import * as THREE from 'three';
import { hash2 } from '../../core/math/rng';
import { smoothstep } from '../../core/math/util';

export const MAX_CLOUDS = 20;
export const PER_CLOUD = 16;
const CELL = 5200;
const REACH = 26000;

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tiling 3D texture of round lumps at three sizes (r, g, a) and a smooth field (b). */
function billowTexture(size = 32): THREE.Data3DTexture {
  const rnd = mulberry(90210);
  const grid = (f: number): Float32Array => {
    const p = new Float32Array(f * f * f * 3);
    for (let i = 0; i < p.length; i++) p[i] = rnd();
    return p;
  };
  const lumps = (pts: Float32Array, f: number, x: number, y: number, z: number): number => {
    const px = x * f;
    const py = y * f;
    const pz = z * f;
    const ix = Math.floor(px);
    const iy = Math.floor(py);
    const iz = Math.floor(pz);
    let best = 9;
    for (let dz = -1; dz <= 1; dz++) {
      const cz = (iz + dz + f) % f;
      for (let dy = -1; dy <= 1; dy++) {
        const cy = (iy + dy + f) % f;
        for (let dx = -1; dx <= 1; dx++) {
          const cx = (ix + dx + f) % f;
          const k = (cx + (cy + cz * f) * f) * 3;
          const ex = ix + dx + pts[k] - px;
          const ey = iy + dy + pts[k + 1] - py;
          const ez = iz + dz + pts[k + 2] - pz;
          const d = ex * ex + ey * ey + ez * ez;
          if (d < best) best = d;
        }
      }
    }
    return Math.sqrt(Math.max(0, 1 - best * 1.5));
  };
  const lat = (f: number): Float32Array => {
    const p = new Float32Array(f * f * f);
    for (let i = 0; i < p.length; i++) p[i] = rnd();
    return p;
  };
  const value = (l: Float32Array, f: number, x: number, y: number, z: number): number => {
    const px = x * f;
    const py = y * f;
    const pz = z * f;
    const ix = Math.floor(px);
    const iy = Math.floor(py);
    const iz = Math.floor(pz);
    const s = (t: number): number => t * t * (3 - 2 * t);
    const fx = s(px - ix);
    const fy = s(py - iy);
    const fz = s(pz - iz);
    const at = (i: number, j: number, k: number): number => l[((ix + i) % f) + (((iy + j) % f) + ((iz + k) % f) * f) * f];
    const x00 = at(0, 0, 0) + (at(1, 0, 0) - at(0, 0, 0)) * fx;
    const x10 = at(0, 1, 0) + (at(1, 1, 0) - at(0, 1, 0)) * fx;
    const x01 = at(0, 0, 1) + (at(1, 0, 1) - at(0, 0, 1)) * fx;
    const x11 = at(0, 1, 1) + (at(1, 1, 1) - at(0, 1, 1)) * fx;
    const y0 = x00 + (x10 - x00) * fy;
    const y1 = x01 + (x11 - x01) * fy;
    return y0 + (y1 - y0) * fz;
  };
  const w = [grid(3), grid(6), grid(12), grid(24)];
  const v = [lat(4), lat(8), lat(16)];
  const data = new Uint8Array(size * size * size * 4);
  let k = 0;
  for (let zi = 0; zi < size; zi++) {
    const z = (zi + 0.5) / size;
    for (let yi = 0; yi < size; yi++) {
      const y = (yi + 0.5) / size;
      for (let xi = 0; xi < size; xi++) {
        const x = (xi + 0.5) / size;
        const a = lumps(w[0], 3, x, y, z);
        const b = lumps(w[1], 6, x, y, z);
        const c = lumps(w[2], 12, x, y, z);
        const d = lumps(w[3], 24, x, y, z);
        data[k++] = Math.round(255 * Math.min(1, a * 0.6 + b * 0.28 + c * 0.12));
        data[k++] = Math.round(255 * Math.min(1, b * 0.55 + c * 0.3 + d * 0.15));
        data[k++] = Math.round(255 * (value(v[0], 4, x, y, z) * 0.57 + value(v[1], 8, x, y, z) * 0.29 + value(v[2], 16, x, y, z) * 0.14));
        data[k++] = Math.round(255 * Math.min(1, c * 0.6 + d * 0.4));
      }
    }
  }
  const t = new THREE.Data3DTexture(data, size, size, size);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

interface CloudDef {
  puffs: [number, number, number, number][];
  base: number;
  scale: number;
}

/**
 * The clouds standing around (cx, cz), relative to it: from a grid of world cells so the same
 * place always has the same sky. `cover` 0..1 decides how many cells hold a cloud and how big.
 */
function layout(seed: number, cx: number, cz: number, cover: number, base0 = 1150, towers = 0, time = 0): CloudDef[] {
  const found: { d: number; def: CloudDef }[] = [];
  const i0 = Math.floor((cx - REACH) / CELL);
  const i1 = Math.floor((cx + REACH) / CELL);
  const j0 = Math.floor((cz - REACH) / CELL);
  const j1 = Math.floor((cz + REACH) / CELL);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const h = hash2(i, j, seed + 0xc10d);
      const p = (h & 0xffff) / 65536;
      // (V1b: a fair sky's few clouds few — a clear day has a handful of small heaps, a full one its towers)
      if (p > 0.03 + 0.25 * cover + 0.95 * cover * cover) continue;
      const rnd = mulberry(h);
      // its life (V1b): it grows, stands, and dissolves on a cycle of its own, and another forms in its cell as it goes
      const period = 480 + 480 * rnd();
      const phase = rnd();
      const life = Math.sin(Math.PI * ((time / period + phase) % 1));
      if (life < 0.18) continue;
      const grown = 0.45 + 0.55 * smoothstep(0.18, 0.75, life);
      const wx = (i + 0.15 + 0.7 * rnd()) * CELL - cx;
      const wz = (j + 0.15 + 0.7 * rnd()) * CELL - cz;
      const d = Math.hypot(wx, wz);
      // nothing straight overhead: from below a heap is only its flat base; seen off to the side it is a cloud
      if (d > REACH || d < 4000) continue;
      // fair weather is all heaps, rounded and taller than they are flat; towers only build as the sky fills
      // (and the wet tropics' afternoons tower whatever the cover: V1b)
      const tower = rnd() < Math.max(0, cover - 0.5) * 0.9 + towers * 0.45;
      // nearer heaps are smaller: no single cloud should fill a quarter of the sky. Their kinds by the cover (V1b): a
      // thin sky's heaps small and flat (humilis), a fuller one's rounder and taller (mediocris), towers as it fills
      const kind = rnd();
      const humble = !tower && kind < 0.8 - 1.3 * cover;
      const width = (tower ? 6500 + 6000 * rnd() : humble ? 1500 + 2400 * rnd() : 2800 + 4200 * rnd() * (0.6 + cover)) * (0.62 + 0.38 * smoothstep(4000, 11000, d)) * grown;
      const height = tower ? width * (0.55 + 0.25 * rnd()) : humble ? width * (0.32 + 0.22 * rnd()) : width * (0.6 + 0.3 * rnd());
      const heads = tower ? 2 + Math.floor(rnd() * 2) : rnd() < 0.4 ? 1 : 0;
      const base = base0 + 700 * (rnd() - 0.35);
      const puffs: [number, number, number, number][] = [];
      const heap = (x: number, y: number, z: number, w: number, hh: number, n: number): void => {
        for (let k = 0; k < n; k++) {
          const a = rnd() * Math.PI * 2;
          const up = -0.15 + 1.15 * rnd();
          const out = Math.sqrt(Math.max(0, 1 - up * up)) * (0.35 + 0.65 * Math.sqrt(rnd()));
          // (each puff bubbling on a beat of its own: a minute or two)
          const beat = 0.9 + 0.1 * Math.sin(time / (60 + 70 * rnd()) + rnd() * 6.283);
          const r = Math.min(w * 0.3, hh * 0.62) * (0.72 + 0.5 * rnd()) * beat;
          puffs.push([x + Math.cos(a) * out * (w * 0.5 - r * 0.6), y + up * (hh - r * 0.7), z + Math.sin(a) * out * (w * 0.5 - r * 0.6) * 0.85, r]);
        }
      };
      const each = Math.max(4, Math.floor(PER_CLOUD / (heads + 1.6)));
      const first = heads ? height * 0.42 : height;
      heap(wx, base + first * 0.1, wz, width, first, Math.round(each * 1.6));
      const lean = rnd() * Math.PI * 2;
      let x = wx;
      let z = wz;
      let y = base + first * 0.55;
      let ww = width;
      for (let k = 0; k < heads; k++) {
        ww *= 0.66 + 0.12 * rnd();
        const ang = lean + (rnd() - 0.5) * 1.6;
        x += Math.cos(ang) * ww * 0.2;
        z += Math.sin(ang) * ww * 0.2;
        const hh = ((height - first * 0.55) / heads) * 1.25;
        heap(x, y, z, ww, hh, each);
        y += hh * 0.72;
      }
      found.push({ d: d - width * 0.5, def: { puffs: puffs.slice(0, PER_CLOUD), base, scale: width * 0.07 } });
    }
  }
  found.sort((a, b) => a.d - b.d);
  return found.slice(0, MAX_CLOUDS).map((f) => f.def);
}

const vertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fragment = /* glsl */ `
precision highp float;
precision highp sampler3D;
varying vec2 vUv;
uniform sampler3D tBillow;
// puffs of cloud c in row c (x, y, z, radius): a texture, not uniforms, so the shader stays well inside
// the 224 uniform vectors every WebGL2 device must offer
uniform highp sampler2D tPuffs;
uniform vec4 uClouds[${MAX_CLOUDS}];
uniform vec4 uCloudInfo[${MAX_CLOUDS}];
uniform int uCount;
uniform int uFace;
uniform vec3 uSunDir;
uniform vec3 uLit;
uniform vec3 uMid;
uniform vec3 uShade;
uniform vec3 uUnder;
uniform vec3 uHaze;
uniform int uSteps;
uniform float uTexel;

vec4 billow(vec3 q) {
  q = q * 32.0 + 0.5;
  vec3 i = floor(q);
  vec3 f = q - i;
  f = f * f * (3.0 - 2.0 * f);
  return texture(tBillow, (i + f - 0.5) / 32.0);
}
float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
// signed distance to the clouds, about; base and scale of the nearest one come back
float map(vec3 p, float fine, out float base, out float scale) {
  float d = 1e9;
  base = 1200.0;
  scale = 300.0;
  for (int c = 0; c < ${MAX_CLOUDS}; c++) {
    if (c >= uCount) break;
    vec4 cl = uClouds[c];
    float db = length(p - cl.xyz) - cl.w;
    if (db > 0.0) {
      d = min(d, db + 150.0);
      continue;
    }
    vec4 info = uCloudInfo[c];
    int n = int(info.y);
    float dc = 1e9;
    for (int i = 0; i < ${PER_CLOUD}; i++) {
      if (i >= n) break;
      vec4 s = texelFetch(tPuffs, ivec2(i, c), 0);
      dc = smin(dc, length(p - s.xyz) - s.w, s.w * 0.55);
    }
    float sc = info.w;
    vec3 q = p / (sc * 7.5) + float(c) * 0.37;
    float lump = (0.55 - billow(q).r) * 2.4;
    if (fine > 0.0) lump += (0.55 - billow(q * 2.7 + 0.3).r) * 1.0 + (0.55 - billow(q * 7.3 + 0.7).r) * 0.36;
    dc += sc * lump;
    // a level base, gently uneven, rounded into the sides
    // (nearly flat: seen from below at a slant, ripples in the base read as stripes)
    float under = info.z - p.y + sc * (0.18 * sin(p.x / (sc * 2.3) + float(c)) * sin(p.z / (sc * 1.9) + 1.7) + 0.08 * sin(p.x / (sc * 0.9) + p.z / (sc * 1.2)));
    float kk = sc * 1.3;
    float hh = max(kk - abs(dc - under), 0.0) / kk;
    dc = max(dc, under) + hh * hh * kk * 0.25;
    if (dc < d) {
      d = dc;
      base = info.z;
      scale = sc;
    }
  }
  return d;
}
// the colour of the skin at p, as a painter has it: white where the heaps face the light with a
// clean edge to the pale shade beside them, a deeper tone in the folds and underneath
vec3 paint(vec3 p, float base, float scale) {
  float b2, s2;
  const vec3 k1 = vec3(1.0, -1.0, -1.0);
  const vec3 k2 = vec3(-1.0, -1.0, 1.0);
  const vec3 k3 = vec3(-1.0, 1.0, -1.0);
  const vec3 k4 = vec3(1.0, 1.0, 1.0);
  float e = scale * 1.2;
  vec3 Ns = normalize(k1 * map(p + k1 * e, 0.0, b2, s2) + k2 * map(p + k2 * e, 0.0, b2, s2) + k3 * map(p + k3 * e, 0.0, b2, s2) + k4 * map(p + k4 * e, 0.0, b2, s2));
  e = scale * 0.65;
  vec3 Nf = normalize(k1 * map(p + k1 * e, 1.0, b2, s2) + k2 * map(p + k2 * e, 1.0, b2, s2) + k3 * map(p + k3 * e, 1.0, b2, s2) + k4 * map(p + k4 * e, 1.0, b2, s2));
  vec3 N = normalize(Ns * 0.8 + Nf);
  // a painter keeps a cloud mostly white: its light comes from the sun's side, raised, and turned towards the viewer
  vec3 L = normalize(uSunDir + vec3(0.0, 0.35, 0.0) - normalize(vec3(p.x, 0.0, p.z)) * 0.12);
  float shadow = clamp(-map(p + L * scale * 2.6, 0.0, b2, s2) / (scale * 0.8), 0.0, 1.0) * 0.5;
  shadow += clamp(-map(p + L * scale * 6.5, 0.0, b2, s2) / (scale * 1.4), 0.0, 1.0) * 0.7;
  float open = clamp(map(p + Nf * scale * 1.2, 1.0, b2, s2) / (scale * 1.2), 0.0, 1.0);
  float up = smoothstep(0.0, scale * 7.0, p.y - base);
  // the painter's convention: the tops of the domes catch the light, the lower half is in the blue shade
  float light = (dot(N, L) * 0.5 + 0.5) * exp(-shadow * 1.4) + 0.2 * up - 0.07 + 0.04 * (open - 0.5) + 0.14 * N.y;
  float broad = (dot(Ns, L) * 0.5 + 0.5) * exp(-shadow) + 0.25 * up + 0.1 * Ns.y + 0.34 * (billow(p / (scale * 16.0) + 0.3).b - 0.5);
  vec3 inShade = mix(uShade, uMid, smoothstep(0.25, 0.85, broad));
  inShade *= 1.0 - 0.07 * (1.0 - smoothstep(0.1, 0.18, open));
  // white only where the heap really turns to the sun (about a third of it), with a clean edge
  vec3 col = mix(inShade, uLit, smoothstep(0.575, 0.605, light));
  // the flat base in one calm tone
  return mix(uUnder, col, smoothstep(-0.05, 0.35, (p.y - base) / (scale * 2.2) + light * 0.6 + N.y * 0.15 + 0.15));
}
vec3 faceDir(vec2 st) {
  if (uFace == 0) return vec3(1.0, -st.y, -st.x);
  if (uFace == 1) return vec3(-1.0, -st.y, st.x);
  if (uFace == 2) return vec3(st.x, 1.0, st.y);
  if (uFace == 3) return vec3(st.x, -1.0, -st.y);
  if (uFace == 4) return vec3(st.x, -st.y, 1.0);
  return vec3(-st.x, -st.y, -1.0);
}
void main() {
  vec3 rd = normalize(faceDir(vUv));
  gl_FragColor = vec4(0.0);
  if (rd.y < 0.012) return;
  vec3 ro = vec3(0.0, 0.0, 0.0);
  float t = 520.0 / rd.y;
  float tEnd = min(14500.0 / rd.y, 56000.0);
  float base, scale;
  float before = t;
  float near = 1e9;
  float tNear = t;
  bool hit = false;
  for (int i = 0; i < 260; i++) {
    if (i >= uSteps || t > tEnd) break;
    float d = map(ro + rd * t, 1.0, base, scale);
    if (d <= 0.0) { hit = true; break; }
    if (d < near * t) { near = d / t; tNear = t; }
    before = t;
    t += max(d * 0.5, 30.0);
  }
  float alpha = 0.0;
  if (hit) {
    float lo = before;
    float hi = t;
    for (int k = 0; k < 9; k++) {
      float mid = 0.5 * (lo + hi);
      if (map(ro + rd * mid, 1.0, base, scale) > 0.0) lo = mid; else hi = mid;
    }
    t = hi;
    alpha = 1.0;
  } else if (near < uTexel) {
    t = tNear;
    alpha = 1.0 - near / uTexel;
  }
  if (alpha <= 0.0) return;
  vec3 p = ro + rd * t;
  map(p, 1.0, base, scale);
  vec3 col = paint(p, base, scale);
  // far clouds sink into the haze
  float haze = (1.0 - exp(-t / 46000.0)) * mix(1.0, 0.45, smoothstep(0.03, 0.35, rd.y));
  gl_FragColor = vec4(mix(col, uHaze, haze) * alpha, alpha);
}
`;

export interface CloudLight {
  sunDir: THREE.Vector3;
  lit: THREE.Color;
  mid: THREE.Color;
  shade: THREE.Color;
  under: THREE.Color;
  haze: THREE.Color;
}

export class Clouds {
  readonly texture: THREE.CubeTexture;
  /** world position (x, z) the cube was drawn around */
  readonly centre = new THREE.Vector2(NaN, NaN);
  private readonly target: THREE.WebGLCubeRenderTarget;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly scene = new THREE.Scene();
  // (a plain camera: marked as drawn for a reversed depth buffer already, it has no projection to update)
  private readonly camera = Object.assign(new THREE.Camera(), { _reversedDepth: true });
  private readonly mesh: THREE.Mesh;
  private unit = 0;
  private cover = -1;
  private base = 1150;
  private towers = 0;
  private readonly size: number;
  private static readonly FACES = [0, 1, 2, 4, 5];
  private static readonly STRIPS = 8;
  /** a full redraw of every face is pending (after a re-centre or a change of cover) */
  private cycle = false;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly seed: number,
    opts: { size: number; steps: number },
  ) {
    this.size = opts.size;
    this.target = new THREE.WebGLCubeRenderTarget(opts.size, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, generateMipmaps: false });
    this.target.texture.minFilter = this.target.texture.magFilter = THREE.LinearFilter;
    this.texture = this.target.texture;
    const puffs = new THREE.DataTexture(new Float32Array(PER_CLOUD * MAX_CLOUDS * 4), PER_CLOUD, MAX_CLOUDS, THREE.RGBAFormat, THREE.FloatType);
    puffs.minFilter = puffs.magFilter = THREE.NearestFilter;
    puffs.generateMipmaps = false;
    puffs.needsUpdate = true;
    const spheres: THREE.Vector4[] = [];
    const info: THREE.Vector4[] = [];
    for (let i = 0; i < MAX_CLOUDS; i++) {
      spheres.push(new THREE.Vector4());
      info.push(new THREE.Vector4());
    }
    this.uniforms = {
      tBillow: { value: billowTexture() },
      tPuffs: { value: puffs },
      uClouds: { value: spheres },
      uCloudInfo: { value: info },
      uCount: { value: 0 },
      uFace: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uLit: { value: new THREE.Color(1.24, 1.22, 1.16) },
      uMid: { value: new THREE.Color(0.62, 0.74, 0.86) },
      uShade: { value: new THREE.Color(0.37, 0.51, 0.7) },
      uUnder: { value: new THREE.Color(0.3, 0.44, 0.64) },
      uHaze: { value: new THREE.Color(0.4, 0.67, 0.85) },
      uSteps: { value: opts.steps },
      uTexel: { value: 3 / opts.size },
    };
    const material = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms: this.uniforms, depthTest: false, depthWrite: false });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.mesh = new THREE.Mesh(tri, material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  /** lay the clouds out around world (x, z) for a cover 0..1 (drift = how far the wind has carried them) */
  private relayout(x: number, z: number, cover: number, driftX: number, driftZ: number, base = 1150, towers = 0, time = 0): void {
    const defs = layout(this.seed, x - driftX, z - driftZ, cover, base, towers, time);
    this.base = base;
    this.towers = towers;
    const tex = this.uniforms.tPuffs.value as THREE.DataTexture;
    const data = tex.image.data as Float32Array;
    const spheres = this.uniforms.uClouds.value as THREE.Vector4[];
    const info = this.uniforms.uCloudInfo.value as THREE.Vector4[];
    defs.forEach((c, i) => {
      const box = new THREE.Box3();
      c.puffs.forEach((p, k) => {
        data.set(p, (i * PER_CLOUD + k) * 4);
        box.expandByPoint(new THREE.Vector3(p[0] - p[3], p[1] - p[3], p[2] - p[3]));
        box.expandByPoint(new THREE.Vector3(p[0] + p[3], p[1] + p[3], p[2] + p[3]));
      });
      const s = box.getBoundingSphere(new THREE.Sphere());
      spheres[i].set(s.center.x, s.center.y, s.center.z, s.radius + c.scale * 4);
      info[i].set(0, c.puffs.length, c.base, c.scale);
    });
    tex.needsUpdate = true;
    this.uniforms.uCount.value = defs.length;
    this.centre.set(x, z);
    this.cover = cover;
  }

  setLight(l: CloudLight): void {
    (this.uniforms.uSunDir.value as THREE.Vector3).copy(l.sunDir).normalize();
    (this.uniforms.uLit.value as THREE.Color).copy(l.lit);
    (this.uniforms.uMid.value as THREE.Color).copy(l.mid);
    (this.uniforms.uShade.value as THREE.Color).copy(l.shade);
    (this.uniforms.uUnder.value as THREE.Color).copy(l.under);
    (this.uniforms.uHaze.value as THREE.Color).copy(l.haze);
  }

  private draw(face: number, strip: number): void {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    const h = this.size / Clouds.STRIPS;
    this.target.scissorTest = strip >= 0;
    if (strip >= 0) this.target.scissor.set(0, strip * h, this.size, h);
    this.uniforms.uFace.value = face;
    r.setRenderTarget(this.target, face);
    r.render(this.scene, this.camera);
    this.target.scissorTest = false;
    r.setRenderTarget(prev);
  }

  /** every face now (start-up, screenshots) */
  drawAll(x: number, z: number, cover: number, driftX = 0, driftZ = 0, base = 1150, towers = 0, time = 0): void {
    this.relayout(x, z, cover, driftX, driftZ, base, towers, time);
    for (const f of Clouds.FACES) this.draw(f, -1);
    this.unit = 0;
    this.cycle = false;
  }

  /**
   * One strip a frame. Re-centres (and lays the clouds out again) when the player has moved
   * `recentre` metres or the cover has changed noticeably; the new layout then fills in strip by strip.
   */
  update(x: number, z: number, cover: number, recentre: number, driftX = 0, driftZ = 0, base = 1150, towers = 0, time = 0): void {
    if (Number.isNaN(this.centre.x)) {
      this.drawAll(x, z, cover, driftX, driftZ, base, towers, time);
      return;
    }
    // (V1b: a new layout every cycle — the clouds' lives and the wind's carrying go on — not only after a re-centre)
    if (!this.cycle) {
      this.relayout(x, z, cover, driftX, driftZ, base, towers, time);
      this.cycle = true;
      this.unit = 0;
    }
    const total = Clouds.FACES.length * Clouds.STRIPS;
    this.draw(Clouds.FACES[Math.floor(this.unit / Clouds.STRIPS)], this.unit % Clouds.STRIPS);
    this.unit = (this.unit + 1) % total;
    if (this.unit === 0) this.cycle = false;
  }
}
