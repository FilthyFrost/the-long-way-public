/**
 * Grime masks (docs/MODCAR.md §15): what is left of the dirt, the crust and the rust over a part's surface,
 * texel by texel of its MASK UVs (tools/blender/lib/modcar.py mask_uv), so that a scraper or a sponge leaves a
 * clean band where it went and nowhere else.
 *
 * A part being cleaned (the body of a vehicle counts as one) has a mask: a render target of its own size
 * (mask_px), RGB what is left of dirt, crust and rust (absolute amounts, as the part's own figures), A the
 * wet the sponge left (1/255 dry; 0 where there is no surface: the shader's tap leaves those texels out, so the
 * islands' edges never show). The part's look reads it (CarLook.setGrime) in place of its figures. Every pass
 * draws the part's meshes into it at their MASK UVs, each texel where it lies on the part:
 *   fill    the figures as they are (a mask begins as the part looks)
 *   stroke  a tool moved over the surface from a to b: each texel within the blade's band and close to the
 *           surface loses what one pass takes off (subtractive blending; the next segment takes over where this
 *           one lets go, so a stroke takes one pass off whatever it is cut into), and the sponge wets it
 *   snap    a unit of the part come clean (92 %): its last specks go
 *   grow    dirt settled since (the road's dust), added everywhere
 *   dry     the wet gone (the look's wet fades first, all over)
 * and measure draws the part from the sides its units face, the rest of the vehicle in front of it, to say how
 * much of the dirt (and of the rust) it had is still there, unit by unit: a body has its front, back, sides,
 * top and windows, a part its paint and its glass.
 */
import * as THREE from 'three';
import { CarLook, carEnvUniforms, carMaterialName, meshCarMaterialName, type CarMaterialName } from '../render/carMaterials';
import { GLSL_FRAGMENT_PARS, GLSL_VERTEX_MAIN, GLSL_VERTEX_PARS } from '../render/shaderlib';

/** what a pass of a tool takes off, and how it is held */
export interface Stroke {
  /** the middle of the blade, from where it was to where it is (render space) */
  a: THREE.Vector3;
  b: THREE.Vector3;
  /** the surface's normal there, and the blade's line across the stroke (unit, render space) */
  normal: THREE.Vector3;
  side: THREE.Vector3;
  /** half the blade's width, and the soft edge round the band (m) */
  half: number;
  soft: number;
  /** how far off the surface it still works, either way (m): both faces of a pane, a panel's curve */
  depth: number;
  /** what one pass takes off: dirt, crust, rust (amounts) */
  take: [number, number, number];
  /** how wet it leaves the surface (the sponge) */
  wet: number;
}

/** a part as the masks see it */
export interface GrimeOwner {
  /** the mask's key: the part instance's uid, or the build's uid and ':body' */
  key: string;
  /** its meshes with MASK UVs, as they stand in the scene */
  meshes: THREE.Mesh[];
  /** its look (the measure draws with the look's measure twins) */
  look: CarLook;
  /** the side of its mask (mask_px) */
  size: number;
  /** 0 a part (its paint, its glass), 1 a body (front, back, sides, top, windows) */
  kind: 0 | 1;
  /** the frame the units face in: the vehicle's model root (the part itself when it lies about) */
  frame: THREE.Object3D;
  /** what may stand in front of it (the whole vehicle); its own meshes are left out of it */
  around?: THREE.Object3D;
  /** its figures without a mask: dirt, crust, rust */
  amounts: { dirt: number; crust: number; rust: number };
  /** a face pointing down in a loose part is its bottom (no unit): true for things lying about */
  loose?: boolean;
}

/** how much of a unit's dirt and rust is left (0…1; 0 = clean or there was none) */
export interface UnitLeft {
  unit: number;
  /** of the dirt and crust it had, how much is still there; and what it had (pixels' worth) */
  dirt: number;
  dirtWas: number;
  rust: number;
  rustWas: number;
}

export class GrimeMask {
  readonly rt: THREE.WebGLRenderTarget;
  /** the figures it was filled or grown to (grow adds what they rose since) */
  dirt = 0;
  crust = 0;
  rust = 0;
  /** the sponge's wet: how much is left of it (1 just wet; dries over WET_S) */
  wet = 0;
  /** units come clean already (dirt) and brushed clean (rust) */
  readonly doneDirt = new Set<number>();
  readonly doneRust = new Set<number>();
  /** changed since it was last kept */
  changed = false;

  constructor(
    readonly key: string,
    readonly size: number,
    readonly kind: 0 | 1,
  ) {
    this.rt = new THREE.WebGLRenderTarget(size, size, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    this.rt.texture.name = `grime:${key}`;
  }

  get texture(): THREE.Texture {
    return this.rt.texture;
  }

  dispose(): void {
    this.rt.dispose();
  }
}

/** how long the sponge's wet takes to dry (s) */
export const WET_S = 14;

/** the units of a body: front, back, left, right, top; windscreen, back window, left and right windows */
export const BODY_UNITS = 9;
export const BODY_UNIT_NAMES = ['车头', '车尾', '左侧', '右侧', '车顶', '前挡风玻璃', '后窗', '左车窗', '右车窗'];

/**
 * Which unit a point is in, by its normal in the vehicle's frame (+x forward, +y up, +z right), as the shaders
 * have it (carMaterials rtGrimeUnit): a part 0 (its paint) or 1 (its glass); a body 0…8 (BODY_UNIT_NAMES), 9 for
 * what faces down (no unit).
 */
export function unitAt(kind: 0 | 1, n: { x: number; y: number; z: number }, glass: boolean): number {
  if (kind === 0) return glass ? 1 : 0;
  if (glass) {
    if (Math.abs(n.x) > 0.3) return n.x > 0 ? 5 : 6;
    return n.z < 0 ? 7 : 8;
  }
  const ax = Math.abs(n.x);
  const ay = Math.abs(n.y);
  const az = Math.abs(n.z);
  if (ay >= ax && ay >= az) return n.y > 0 ? 4 : 9;
  if (ax >= az) return n.x > 0 ? 0 : 1;
  return n.z < 0 ? 2 : 3;
}

/** what a unit is called: a body's by its side or window, a part's its name (its glass: its window) */
export function unitName(kind: 0 | 1, unit: number, label: string): string {
  if (kind === 1) return BODY_UNIT_NAMES[unit] ?? label;
  return unit === 1 ? `${label}车窗` : label;
}

/** a view of the measure: from where (frame space), and which units it reads (paint, glass; −1 none) */
interface View {
  dir: THREE.Vector3;
  paint: number;
  glass: number;
}

const BODY_VIEWS: View[] = [
  { dir: new THREE.Vector3(1, 0, 0), paint: 0, glass: 5 },
  { dir: new THREE.Vector3(-1, 0, 0), paint: 1, glass: 6 },
  { dir: new THREE.Vector3(0, 0, -1), paint: 2, glass: 7 },
  { dir: new THREE.Vector3(0, 0, 1), paint: 3, glass: 8 },
  { dir: new THREE.Vector3(0, 1, 0), paint: 4, glass: -1 },
];
const PART_VIEWS: View[] = [
  { dir: new THREE.Vector3(1, 0, 0), paint: 0, glass: 1 },
  { dir: new THREE.Vector3(-1, 0, 0), paint: 0, glass: 1 },
  { dir: new THREE.Vector3(0, 0, -1), paint: 0, glass: 1 },
  { dir: new THREE.Vector3(0, 0, 1), paint: 0, glass: 1 },
  { dir: new THREE.Vector3(0, 1, 0), paint: 0, glass: 1 },
];

/** the side of the measure's pictures (px) */
const MEASURE_PX = 112;

// ------------------------------------------------------------------ the passes' shaders

const UV_VERTEX = /* glsl */ `
  attribute vec2 aMaskUv;
  varying vec3 vW;
  varying vec3 vN;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    // (a piece with no mask merged with ones that have it: −1, out of the picture)
    gl_Position = aMaskUv.x < -0.5 ? vec4(2.0, 2.0, 2.0, 1.0) : vec4(aMaskUv * 2.0 - 1.0, 0.0, 1.0);
  }
`;

const STROKE_FRAGMENT = /* glsl */ `
  uniform vec3 uA;
  uniform vec3 uB;
  uniform vec3 uN;
  uniform vec3 uS;
  uniform float uHalf;
  uniform float uSoft;
  uniform float uDepth;
  uniform float uFacing;
  uniform vec3 uTake;
  uniform float uWet;
  varying vec3 vW;
  varying vec3 vN;
  void main() {
    vec3 d = vW - uA;
    if (abs(dot(d, uN)) > uDepth) discard;
    // (the paint the blade is on, not the inside of the panel behind it; glass both faces)
    if (uFacing > 0.5 && dot(normalize(vN), uN) < 0.1) discard;
    vec3 ab = uB - uA;
    float len = length(ab);
    vec3 dir = len > 1e-6 ? ab / len : vec3(0.0);
    float s = dot(d, dir);
    float t = dot(d, uS);
    float k = 2.0 * uSoft;
    float along = clamp((s + uSoft) / k, 0.0, 1.0) - clamp((s - len + uSoft) / k, 0.0, 1.0);
    float across = 1.0 - smoothstep(uHalf - uSoft, uHalf + uSoft, abs(t));
    float w = along * across;
    if (w <= 0.0) discard;
    gl_FragColor = vec4(uTake * w, (1.0 + 254.0 * uWet * w) / 255.0);
  }
`;

const FILL_FRAGMENT = /* glsl */ `
  uniform vec4 uFill;
  void main() {
    gl_FragColor = uFill;
  }
`;

const SNAP_FRAGMENT = /* glsl */ `
  uniform mat3 uToFrame;
  uniform float uKind;
  uniform float uUnit;
  uniform float uGlass;
  uniform float uLoose;
  uniform vec3 uTake;
  varying vec3 vW;
  varying vec3 vN;
  float unitOf(vec3 nc, float glass) {
    if (uKind < 0.5) return (uLoose > 0.5 && nc.y < -0.7) ? 9.0 : glass;
    if (glass > 0.5) {
      if (abs(nc.x) > 0.3) return nc.x > 0.0 ? 5.0 : 6.0;
      return nc.z < 0.0 ? 7.0 : 8.0;
    }
    vec3 a = abs(nc);
    if (a.y >= a.x && a.y >= a.z) return nc.y > 0.0 ? 4.0 : 9.0;
    if (a.x >= a.z) return nc.x > 0.0 ? 0.0 : 1.0;
    return nc.z < 0.0 ? 2.0 : 3.0;
  }
  void main() {
    vec3 nc = normalize(uToFrame * normalize(vN));
    if (uUnit >= 0.0 && abs(unitOf(nc, uGlass) - uUnit) > 0.5) discard;
    gl_FragColor = vec4(uTake, 0.0);
  }
`;

/** the rest of the vehicle in the measure: it hides what is behind it and reads as nothing */
const HIDE_VERTEX = /* glsl */ `
  ${GLSL_VERTEX_PARS}
  void main() {
    vec3 transformed = position;
    vec3 objNormal = normal;
    ${GLSL_VERTEX_MAIN}
  }
`;
const HIDE_FRAGMENT = /* glsl */ `
  ${GLSL_FRAGMENT_PARS}
  void main() {
    #include <logdepthbuf_fragment>
    gl_FragColor = vec4(0.0);
  }
`;

function uvPass(fragment: string, uniforms: Record<string, THREE.IUniform>, blend: 'none' | 'sub' | 'add' | 'wetReset'): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({ uniforms, vertexShader: UV_VERTEX, fragmentShader: fragment, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  if (blend === 'none') m.blending = THREE.NoBlending;
  else {
    m.blending = THREE.CustomBlending;
    m.blendSrc = THREE.OneFactor;
    m.blendDst = THREE.OneFactor;
    m.blendSrcAlpha = THREE.OneFactor;
    m.blendDstAlpha = THREE.OneFactor;
    if (blend === 'sub') {
      // what is left loses what the pass takes (clamped at none); the wet is the most of the two
      m.blendEquation = THREE.ReverseSubtractEquation;
      m.blendEquationAlpha = THREE.MaxEquation;
    } else if (blend === 'add') {
      m.blendEquation = THREE.AddEquation;
      m.blendEquationAlpha = THREE.AddEquation;
    } else {
      // the colour kept, the alpha set (dry again)
      m.blendEquation = THREE.AddEquation;
      m.blendSrc = THREE.ZeroFactor;
      m.blendDst = THREE.OneFactor;
      m.blendEquationAlpha = THREE.AddEquation;
      m.blendSrcAlpha = THREE.OneFactor;
      m.blendDstAlpha = THREE.ZeroFactor;
    }
  }
  return m;
}

/** a mesh's material names, slot by slot (the GLB's, kept by applyMaterials) */
function namesOf(mesh: THREE.Mesh): (CarMaterialName | null)[] {
  const n = Array.isArray(mesh.material) ? mesh.material.length : 1;
  return Array.from({ length: n }, (_, i) => meshCarMaterialName(mesh, i));
}

const isGlass = (n: CarMaterialName | null): boolean => n === 'glass' || n === 'glass_dark';

/** the masks of everything being cleaned, and the passes that change and read them */
export class Grime {
  private readonly masks = new Map<string, GrimeMask>();
  private readonly scene = new THREE.Scene();
  private readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly mStroke: THREE.ShaderMaterial;
  private readonly mStrokeGlass: THREE.ShaderMaterial;
  private readonly mFill: THREE.ShaderMaterial;
  private readonly mGrow: THREE.ShaderMaterial;
  private readonly mDry: THREE.ShaderMaterial;
  private readonly mSnap: THREE.ShaderMaterial;
  private readonly mSnapGlass: THREE.ShaderMaterial;
  private readonly mHide: THREE.ShaderMaterial;
  private readonly measureRt: THREE.WebGLRenderTarget;
  private readonly px = new Uint8Array(MEASURE_PX * MEASURE_PX * 4);
  private readonly mcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 50);
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly box = new THREE.Box3();

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    const stroke = (facing: number): Record<string, THREE.IUniform> => ({
      uA: { value: new THREE.Vector3() },
      uB: { value: new THREE.Vector3() },
      uN: { value: new THREE.Vector3(0, 1, 0) },
      uS: { value: new THREE.Vector3(1, 0, 0) },
      uHalf: { value: 0.05 },
      uSoft: { value: 0.006 },
      uDepth: { value: 0.03 },
      uFacing: { value: facing },
      uTake: { value: new THREE.Vector3() },
      uWet: { value: 0 },
    });
    this.mStroke = uvPass(STROKE_FRAGMENT, stroke(1), 'sub');
    // (the glass: both its faces, as a window is dirty through)
    this.mStrokeGlass = uvPass(STROKE_FRAGMENT, { ...this.mStroke.uniforms, uFacing: { value: 0 } }, 'sub');
    this.mFill = uvPass(FILL_FRAGMENT, { uFill: { value: new THREE.Vector4() } }, 'none');
    this.mGrow = uvPass(FILL_FRAGMENT, { uFill: { value: new THREE.Vector4() } }, 'add');
    this.mDry = uvPass(FILL_FRAGMENT, { uFill: { value: new THREE.Vector4(0, 0, 0, 1 / 255) } }, 'wetReset');
    const snap = {
      uToFrame: { value: new THREE.Matrix3() },
      uKind: { value: 0 },
      uUnit: { value: -1 },
      uGlass: { value: 0 },
      uLoose: { value: 0 },
      uTake: { value: new THREE.Vector3(1, 1, 0) },
    };
    this.mSnap = uvPass(SNAP_FRAGMENT, snap, 'sub');
    this.mSnapGlass = uvPass(SNAP_FRAGMENT, { ...snap, uGlass: { value: 1 } }, 'sub');
    this.mHide = new THREE.ShaderMaterial({ vertexShader: HIDE_VERTEX, fragmentShader: HIDE_FRAGMENT, blending: THREE.NoBlending });
    this.measureRt = new THREE.WebGLRenderTarget(MEASURE_PX, MEASURE_PX, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: true, generateMipmaps: false });
    this.cam.position.set(0, 0, 0.5);
    this.cam.updateMatrixWorld();
  }

  get(key: string): GrimeMask | undefined {
    return this.masks.get(key);
  }

  get keys(): string[] {
    return [...this.masks.keys()];
  }

  /** how many texels of masks there are (telemetry) */
  get texels(): number {
    let n = 0;
    for (const m of this.masks.values()) n += m.size * m.size;
    return n;
  }

  /** the mask of a part, made and filled with its figures the first time (or from what was kept) */
  open(o: GrimeOwner, kept?: Uint8Array | null): GrimeMask {
    let m = this.masks.get(o.key);
    if (m && m.size === o.size) return m;
    m?.dispose();
    m = new GrimeMask(o.key, o.size, o.kind);
    this.masks.set(o.key, m);
    if (kept && kept.length === o.size * o.size * 4) {
      this.load(m, kept);
      // (kept with the save it had grown with its part's figures: they are where it stands)
      m.dirt = o.amounts.dirt;
      m.crust = o.amounts.crust;
      m.rust = o.amounts.rust;
    } else this.fill(m, o);
    o.look.setGrime({ texture: m.texture, size: m.size }, o.kind);
    return m;
  }

  /** no mask any more (the part came clean, or is gone): its look takes its figures again */
  close(key: string, look?: CarLook): void {
    const m = this.masks.get(key);
    if (!m) return;
    m.dispose();
    this.masks.delete(key);
    look?.setGrime(null);
  }

  /** a look made again (the part moved from the car to the floor) takes the mask it has */
  bind(key: string, look: CarLook): boolean {
    const m = this.masks.get(key);
    if (!m) return false;
    look.setGrime({ texture: m.texture, size: m.size }, m.kind);
    look.setGrimeWet(m.wet);
    return true;
  }

  // ------------------------------------------------------------------ passes

  private draw(rt: THREE.WebGLRenderTarget, meshes: THREE.Mesh[], pick: (name: CarMaterialName | null) => THREE.Material | null, clear?: THREE.Vector4): void {
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevAuto = r.autoClear;
    const prevColor = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    const proxies: THREE.Mesh[] = [];
    for (const src of meshes) {
      if (!src.geometry.hasAttribute('aMaskUv')) continue;
      const names = namesOf(src);
      // (a window's opaque twin is the same faces again: one pass over them)
      const twin = Array.isArray(src.material) ? src.material.map((m) => !!m.userData.crustCut) : [false];
      const mats = names.map((n, i) => (twin[i] ? null : pick(n)));
      if (mats.every((m) => !m)) continue;
      // (a slot that takes no part in this pass draws nothing)
      const list = mats.map((m) => m ?? this.mNone);
      const p = new THREE.Mesh(src.geometry, Array.isArray(src.material) ? list : list[0]);
      p.matrixAutoUpdate = false;
      src.updateWorldMatrix(true, false);
      p.matrix.copy(src.matrixWorld);
      p.matrixWorld.copy(src.matrixWorld);
      p.frustumCulled = false;
      proxies.push(p);
      this.scene.add(p);
    }
    r.setRenderTarget(rt);
    r.autoClear = false;
    if (clear) {
      r.setClearColor(new THREE.Color(clear.x, clear.y, clear.z), clear.w);
      r.clear(true, false, false);
    }
    if (proxies.length) r.render(this.scene, this.cam);
    for (const p of proxies) this.scene.remove(p);
    r.setRenderTarget(prevTarget);
    r.autoClear = prevAuto;
    r.setClearColor(prevColor, prevAlpha);
  }

  /** draws nothing (a slot left out of a pass) */
  private readonly mNone = (() => {
    const m = new THREE.ShaderMaterial({ vertexShader: 'void main() { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }', fragmentShader: 'void main() { discard; }' });
    m.colorWrite = false;
    return m;
  })();

  /** the figures as they are, over the whole surface (the rest of the square: no surface) */
  fill(m: GrimeMask, o: GrimeOwner): void {
    m.dirt = o.amounts.dirt;
    m.crust = o.amounts.crust;
    m.rust = o.amounts.rust;
    m.wet = 0;
    this.mFill.uniforms.uFill.value.set(m.dirt, m.crust, m.rust, 1 / 255);
    this.draw(m.rt, o.meshes, () => this.mFill, new THREE.Vector4(0, 0, 0, 0));
    m.changed = true;
  }

  /** a tool drawn over the part from s.a to s.b */
  stroke(m: GrimeMask, o: GrimeOwner, s: Stroke): void {
    const u = this.mStroke.uniforms;
    u.uA.value.copy(s.a);
    u.uB.value.copy(s.b);
    u.uN.value.copy(s.normal);
    u.uS.value.copy(s.side);
    u.uHalf.value = s.half;
    u.uSoft.value = s.soft;
    u.uDepth.value = s.depth;
    u.uTake.value.set(s.take[0], s.take[1], s.take[2]);
    u.uWet.value = s.wet;
    this.draw(m.rt, o.meshes, (n) => (isGlass(n) ? this.mStrokeGlass : this.mStroke));
    if (s.wet > 0) m.wet = 1;
    m.changed = true;
  }

  /** a unit come clean: its last specks of dirt and crust (layers 'dirt') or of rust go; unit −1: all of it */
  snap(m: GrimeMask, o: GrimeOwner, unit: number, layers: 'dirt' | 'rust' | 'all'): void {
    const take = layers === 'dirt' ? [1, 1, 0] : layers === 'rust' ? [0, 0, 1] : [1, 1, 1];
    const toFrame = new THREE.Matrix3().setFromMatrix4(o.frame.matrixWorld.clone().invert());
    for (const mat of [this.mSnap, this.mSnapGlass]) {
      const u = mat.uniforms;
      u.uToFrame.value.copy(toFrame);
      u.uKind.value = o.kind;
      u.uUnit.value = unit;
      u.uLoose.value = o.loose ? 1 : 0;
      u.uTake.value.set(take[0], take[1], take[2]);
    }
    this.draw(m.rt, o.meshes, (n) => (isGlass(n) ? this.mSnapGlass : this.mSnap));
    m.changed = true;
  }

  /** the part's figures rose (dirt settled on the road): what they rose by goes on everywhere */
  grow(m: GrimeMask, o: GrimeOwner): void {
    const dd = Math.max(0, o.amounts.dirt - m.dirt);
    const dc = Math.max(0, o.amounts.crust - m.crust);
    const dr = Math.max(0, o.amounts.rust - m.rust);
    // (an 8-bit mask moves in steps of 1/255: the figures wait until they have risen by one)
    const step = 1 / 255;
    if (dd < step && dc < step && dr < step) return;
    const q = (x: number): number => (x >= step ? Math.floor(x * 255) / 255 : 0);
    const a = q(dd);
    const b = q(dc);
    const c = q(dr);
    this.mGrow.uniforms.uFill.value.set(a, b, c, 0);
    this.draw(m.rt, o.meshes, () => this.mGrow);
    m.dirt += a;
    m.crust += b;
    m.rust += c;
    m.changed = true;
  }

  /** the wet dries: the look's wet fades over WET_S, then the mask is dry again */
  dry(m: GrimeMask, o: GrimeOwner, dt: number): void {
    if (m.wet <= 0) return;
    m.wet = Math.max(0, m.wet - dt / WET_S);
    o.look.setGrimeWet(m.wet);
    if (m.wet <= 0) {
      this.draw(m.rt, o.meshes, () => this.mDry);
      o.look.setGrimeWet(1);
    }
  }

  // ------------------------------------------------------------------ the measure

  /**
   * How much of each unit's dirt and rust is left: the part drawn from the sides its units face (the rest of the
   * vehicle hiding what it hides), with what its mask leaves beside what it had without one.
   */
  measure(o: GrimeOwner, only?: readonly number[]): UnitLeft[] {
    const r = this.renderer;
    // (while scrubbing a body only the side the tool is on: its view, one or two pictures)
    const views = (o.kind === 1 ? BODY_VIEWS : PART_VIEWS).filter((v) => !only || only.includes(v.paint) || only.includes(v.glass));
    const sums = new Map<number, UnitLeft>();
    const get = (unit: number): UnitLeft => {
      let u = sums.get(unit);
      if (!u) sums.set(unit, (u = { unit, dirt: 0, dirtWas: 0, rust: 0, rustWas: 0 }));
      return u;
    };
    // the part's measure twins, slot by slot
    const own = new Set(o.meshes);
    const scene = new THREE.Scene();
    const proxies: THREE.Mesh[] = [];
    for (const src of o.meshes) {
      const names = namesOf(src);
      const twin = Array.isArray(src.material) ? src.material.map((m) => !!m.userData.crustCut) : [false];
      const mats = names.map((n, i) =>
        twin[i] ? this.mNone : o.look.material((n ?? 'plastic_int') as CarMaterialName, {
          ao: src.geometry.hasAttribute('color'),
          vpaint: false,
          vwear: false,
          vpart: false,
          vmask: src.geometry.hasAttribute('aMaskUv'),
          measure: true,
        }),
      );
      const p = new THREE.Mesh(src.geometry, Array.isArray(src.material) ? mats : mats[0]);
      // (the render recomputes world matrices from these: the proxy's own matrix is where its mesh is)
      p.matrixAutoUpdate = false;
      src.updateWorldMatrix(true, false);
      p.matrix.copy(src.matrixWorld);
      p.matrixWorld.copy(src.matrixWorld);
      p.frustumCulled = false;
      proxies.push(p);
      scene.add(p);
    }
    // the rest of the vehicle, as far as it shows
    const hasGlass = o.meshes.some((m) => namesOf(m).some(isGlass));
    if (o.around) {
      o.around.updateWorldMatrix(true, true);
      o.around.traverseVisible((x) => {
        const mesh = x as THREE.Mesh;
        if (!mesh.isMesh || own.has(mesh) || mesh.userData.ghostDepth || mesh.userData.ghostXray) return;
        const p = new THREE.Mesh(mesh.geometry, this.mHide);
        p.matrixAutoUpdate = false;
        p.matrix.copy(mesh.matrixWorld);
        p.matrixWorld.copy(mesh.matrixWorld);
        p.frustumCulled = false;
        scene.add(p);
      });
    }
    // the part's box in the frame, for the pictures' bounds
    o.frame.updateWorldMatrix(true, false);
    const toFrame = o.frame.matrixWorld.clone().invert();
    this.box.makeEmpty();
    for (const src of o.meshes) {
      if (!src.geometry.boundingBox) src.geometry.computeBoundingBox();
      const b = src.geometry.boundingBox!.clone().applyMatrix4(toFrame.clone().multiply(src.matrixWorld));
      this.box.union(b);
    }
    if (this.box.isEmpty()) return [];
    const centre = this.box.getCenter(new THREE.Vector3());
    const radius = this.box.getSize(new THREE.Vector3()).length() * 0.5 + 0.05;
    const prevTarget = r.getRenderTarget();
    const prevAuto = r.autoClear;
    const prevColor = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    r.autoClear = false;
    r.setClearColor(0x000000, 0);
    const glassU = this.measureGlass;
    for (const v of views) {
      // the camera in the frame: looking back along the view's direction at the part
      const eyeF = this.v1.copy(v.dir).multiplyScalar(radius + 2).add(centre);
      const upF = Math.abs(v.dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const eye = eyeF.clone().applyMatrix4(o.frame.matrixWorld);
      const at = centre.clone().applyMatrix4(o.frame.matrixWorld);
      const up = upF.transformDirection(o.frame.matrixWorld);
      this.mcam.position.copy(eye);
      this.mcam.up.copy(up);
      this.mcam.lookAt(at);
      this.mcam.left = -radius;
      this.mcam.right = radius;
      this.mcam.top = radius;
      this.mcam.bottom = -radius;
      this.mcam.near = 0.01;
      this.mcam.far = radius * 2 + 4;
      this.mcam.updateProjectionMatrix();
      this.mcam.updateMatrixWorld();
      for (const glass of [false, true]) {
        const unit = glass ? v.glass : v.paint;
        if (unit < 0 || (glass && !hasGlass) || (only && !only.includes(unit))) continue;
        glassU.value = glass ? 1 : 0;
        r.setRenderTarget(this.measureRt);
        r.clear(true, true, false);
        r.render(scene, this.mcam);
        r.readRenderTargetPixels(this.measureRt, 0, 0, MEASURE_PX, MEASURE_PX, this.px);
        if (this.debug) this.debug.push(this.px.slice());
        const u = get(unit);
        const px = this.px;
        for (let i = 0; i < px.length; i += 4) {
          u.dirt += px[i];
          u.dirtWas += px[i + 1];
          u.rust += px[i + 2];
          u.rustWas += px[i + 3];
        }
      }
    }
    glassU.value = 0;
    r.setRenderTarget(prevTarget);
    r.autoClear = prevAuto;
    r.setClearColor(prevColor, prevAlpha);
    // (the proxies share the scene's geometry: only they go)
    scene.clear();
    return [...sums.values()].map((u) => ({
      unit: u.unit,
      dirt: u.dirtWas > 0 ? u.dirt / u.dirtWas : 0,
      dirtWas: u.dirtWas / 255,
      rust: u.rustWas > 0 ? u.rust / u.rustWas : 0,
      rustWas: u.rustWas / 255,
    }));
  }

  /** (for looking at what the measure sees: its pictures, view by view, while set) */
  debug: Uint8Array[] | null = null;

  /**
   * Get the measure's programs ready before they are needed (a cleaning tool picked up): the part's measure twins
   * compiled off the main thread where the browser can (the first measure would otherwise stall a frame).
   */
  async prewarm(o: GrimeOwner): Promise<void> {
    const scene = new THREE.Scene();
    for (const src of o.meshes) {
      const names = namesOf(src);
      const mats = names.map((n) =>
        o.look.material((n ?? 'plastic_int') as CarMaterialName, { ao: src.geometry.hasAttribute('color'), vpaint: false, vwear: false, vpart: false, vmask: src.geometry.hasAttribute('aMaskUv'), measure: true }),
      );
      const p = new THREE.Mesh(src.geometry, Array.isArray(src.material) ? mats : mats[0]);
      p.frustumCulled = false;
      scene.add(p);
    }
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), this.mHide));
    try {
      await this.renderer.compileAsync(scene, this.mcam);
    } catch {
      /* compiled on first use, then */
    }
    scene.clear();
  }

  /** the shared switch of the measure's glass pass (carMaterials carEnvUniforms) */
  private get measureGlass(): { value: number } {
    return carEnvUniforms.uMeasureGlass;
  }

  // ------------------------------------------------------------------ keeping

  /** the mask's texels as they are (for keeping it with the save) */
  read(m: GrimeMask): Uint8Array {
    const out = new Uint8Array(m.size * m.size * 4);
    this.renderer.readRenderTargetPixels(m.rt, 0, 0, m.size, m.size, out);
    return out;
  }

  /** texels kept put back */
  private load(m: GrimeMask, data: Uint8Array): void {
    const tex = new THREE.DataTexture(data, m.size, m.size, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.needsUpdate = true;
    const copy = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: tex } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D tSrc; varying vec2 vUv; void main() { gl_FragColor = texture2D(tSrc, vUv); }',
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    });
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.flipY = false;
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copy);
    quad.frustumCulled = false;
    const s = new THREE.Scene();
    s.add(quad);
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(m.rt);
    r.render(s, this.cam);
    r.setRenderTarget(prev);
    quad.geometry.dispose();
    copy.dispose();
    tex.dispose();
  }

  dispose(): void {
    for (const m of this.masks.values()) m.dispose();
    this.masks.clear();
    this.measureRt.dispose();
  }
}

/** is this a material name a window is made of */
export function glassName(n: string): boolean {
  return isGlass(carMaterialName(n));
}
