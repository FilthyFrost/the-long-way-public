/**
 * The coat of paint a spray can puts on a part (docs/V3/plan/growth.md §1.5, J3): where the spray lands and nowhere
 * else, as Nomad Drive paints into each panel's own texture — before this a can coloured a whole panel at once.
 *
 * A part being painted (the body of a vehicle counts as one) has two targets in its MASK UVs (as the grime masks,
 * grime.ts), half the side of its grime mask (at least 64) and smooth (the paint's edge is soft):
 *   dry  the paint that has set: its colour, premultiplied (rgb, sRGB), and how thick (a)
 *   wet  what was sprayed in the last minute, the same way: a sponge wipes it off; a minute after the last spray
 *        it sets — goes over the dry and is cleared
 * Every pass draws the part's painted meshes into a target at their MASK UVs, each texel where it lies on the part:
 *   spray   a disc of the nozzle's size round the point the can is aimed at, soft to its rim, over what is there
 *   strip   a tool's band (a stroke, as grime.ts has it) takes off so much of the coat, dry or wet or both
 *   set     the wet over the dry, the wet cleared
 *   fill    a kept coat drawn back (after a reload)
 * and measure tells how much of the part the coat covers.
 */
import * as THREE from 'three';
import { meshCarMaterialName, type CarLook, type CarMaterialName } from '../render/carMaterials';
import { UV_VERTEX, type GrimeOwner, type Stroke } from './grime';

/** how long a coat stays wet after the last spray on the part (s): a sponge wipes it off till then */
export const COAT_WET_S = 60;

/** a part's coat of paint */
export class Coat {
  readonly dry: THREE.WebGLRenderTarget;
  readonly wet: THREE.WebGLRenderTarget;
  /** when it was last sprayed (the game's seconds): it sets COAT_WET_S after */
  sprayedAt = -Infinity;
  /** anything wet on it now */
  wetNow = false;
  /** changed since it was last kept */
  changed = false;
  /** how much of the target is the part's surface (0…1: the rest of the square is outside its islands) */
  surface = 1;
  /** painted over rust that was never ground off (0…1, the rust it had then) and when: it comes back through with the days */
  rustUnder = 0;
  paintedAt = 0;

  constructor(
    readonly key: string,
    readonly size: number,
  ) {
    const opts = { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false } as const;
    this.dry = new THREE.WebGLRenderTarget(size, size, opts);
    this.wet = new THREE.WebGLRenderTarget(size, size, opts);
    this.dry.texture.name = `coat:${key}`;
    this.wet.texture.name = `coat-wet:${key}`;
  }

  dispose(): void {
    this.dry.dispose();
    this.wet.dispose();
  }
}

const SPRAY_FRAGMENT = /* glsl */ `
  uniform vec3 uC;
  uniform vec3 uN;
  uniform float uR;
  uniform float uDepth;
  uniform vec3 uColor;
  uniform float uK;
  varying vec3 vW;
  varying vec3 vN;
  void main() {
    vec3 d = vW - uC;
    float h = dot(d, uN);
    if (abs(h) > uDepth) discard;
    // (the face the can is turned to, not the inside of the panel behind it)
    if (dot(normalize(vN), uN) < 0.1) discard;
    float r = length(d - uN * h);
    // (soft to its rim, thickest in the middle: a spray's cone)
    float w = (1.0 - smoothstep(uR * 0.35, uR, r)) * uK;
    if (w <= 0.0) discard;
    gl_FragColor = vec4(uColor * w, w);
  }
`;

const STRIP_FRAGMENT = /* glsl */ `
  uniform vec3 uA;
  uniform vec3 uB;
  uniform vec3 uN;
  uniform vec3 uS;
  uniform float uHalf;
  uniform float uSoft;
  uniform float uDepth;
  uniform float uTake;
  varying vec3 vW;
  varying vec3 vN;
  void main() {
    vec3 d = vW - uA;
    if (abs(dot(d, uN)) > uDepth) discard;
    if (dot(normalize(vN), uN) < 0.1) discard;
    vec3 ab = uB - uA;
    float len = length(ab);
    vec3 dir = len > 1e-6 ? ab / len : vec3(0.0);
    float s = dot(d, dir);
    float t = dot(d, uS);
    float k = 2.0 * uSoft;
    float along = clamp((s + uSoft) / k, 0.0, 1.0) - clamp((s - len + uSoft) / k, 0.0, 1.0);
    float across = 1.0 - smoothstep(uHalf - uSoft, uHalf + uSoft, abs(t));
    float w = along * across * uTake;
    if (w <= 0.0) discard;
    gl_FragColor = vec4(0.0, 0.0, 0.0, w);
  }
`;

const SURFACE_FRAGMENT = /* glsl */ `
  void main() {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
  }
`;

const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** a texture drawn over the target as it is (premultiplied: over it) */
const COPY_FRAGMENT = /* glsl */ `
  uniform sampler2D tSrc;
  varying vec2 vUv;
  void main() {
    gl_FragColor = texture2D(tSrc, vUv);
  }
`;

/** a target's alpha averaged over squares of it (a box of taps each), for the measure */
const SHRINK_FRAGMENT = /* glsl */ `
  uniform sampler2D tSrc;
  uniform sampler2D tSrc2;
  uniform vec2 uStep;
  varying vec2 vUv;
  void main() {
    float a = 0.0;
    float b = 0.0;
    for (int j = 0; j < 4; j++) {
      for (int i = 0; i < 4; i++) {
        vec2 uv = vUv + (vec2(float(i), float(j)) - 1.5) * uStep;
        a += texture2D(tSrc, uv).a;
        b += texture2D(tSrc2, uv).a;
      }
    }
    gl_FragColor = vec4(a / 16.0, b / 16.0, 0.0, 1.0);
  }
`;

function uvMaterial(fragment: string, uniforms: Record<string, THREE.IUniform>, blend: 'over' | 'strip' | 'none'): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({ uniforms, vertexShader: UV_VERTEX, fragmentShader: fragment, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  setBlend(m, blend);
  return m;
}

function setBlend(m: THREE.Material, blend: 'over' | 'strip' | 'none'): void {
  if (blend === 'none') {
    m.blending = THREE.NoBlending;
    return;
  }
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendEquationAlpha = THREE.AddEquation;
  if (blend === 'over') {
    // (premultiplied over: the new paint on top of what is there, the thickness adding up towards whole)
    m.blendSrc = THREE.OneFactor;
    m.blendDst = THREE.OneMinusSrcAlphaFactor;
    m.blendSrcAlpha = THREE.OneFactor;
    m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  } else {
    // (what is there kept by one less what the pass takes: colour and thickness alike)
    m.blendSrc = THREE.ZeroFactor;
    m.blendDst = THREE.OneMinusSrcAlphaFactor;
    m.blendSrcAlpha = THREE.ZeroFactor;
    m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  }
}

/** the materials that take paint: the body colour and its second colour */
const PAINTED = (n: CarMaterialName | null): boolean => n === 'paint' || n === 'paint_b';

/** has a skin a coat goes on (the paint, its second colour): what has none (a bare steel bar, a lamp) takes no coat */
export function takesCoat(meshes: readonly THREE.Mesh[]): boolean {
  for (const m of meshes) {
    const n = Array.isArray(m.material) ? m.material.length : 1;
    for (let i = 0; i < n; i++) if (PAINTED(meshCarMaterialName(m, i))) return true;
  }
  return false;
}

/** the coats of everything painted, and the passes that change and read them */
export class Coats {
  private readonly coats = new Map<string, Coat>();
  private readonly scene = new THREE.Scene();
  private readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly uSpray = { uC: { value: new THREE.Vector3() }, uN: { value: new THREE.Vector3() }, uR: { value: 0.1 }, uDepth: { value: 0.06 }, uColor: { value: new THREE.Color() }, uK: { value: 0.3 } };
  private readonly mSpray = uvMaterial(SPRAY_FRAGMENT, this.uSpray, 'over');
  private readonly uStrip = { uA: { value: new THREE.Vector3() }, uB: { value: new THREE.Vector3() }, uN: { value: new THREE.Vector3() }, uS: { value: new THREE.Vector3() }, uHalf: { value: 0.05 }, uSoft: { value: 0.006 }, uDepth: { value: 0.05 }, uTake: { value: 0.3 } };
  private readonly mStrip = uvMaterial(STRIP_FRAGMENT, this.uStrip, 'strip');
  private readonly mSurface = uvMaterial(SURFACE_FRAGMENT, {}, 'none');
  private readonly mNone = (() => {
    const m = new THREE.ShaderMaterial({ vertexShader: 'void main() { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }', fragmentShader: 'void main() { discard; }' });
    m.colorWrite = false;
    return m;
  })();
  private readonly uCopy = { tSrc: { value: null as THREE.Texture | null } };
  private readonly mCopy = new THREE.ShaderMaterial({ uniforms: this.uCopy, vertexShader: QUAD_VERTEX, fragmentShader: COPY_FRAGMENT, depthTest: false, depthWrite: false });
  private readonly uShrink = { tSrc: { value: null as THREE.Texture | null }, tSrc2: { value: null as THREE.Texture | null }, uStep: { value: new THREE.Vector2() } };
  private readonly mShrink = new THREE.ShaderMaterial({ uniforms: this.uShrink, vertexShader: QUAD_VERTEX, fragmentShader: SHRINK_FRAGMENT, depthTest: false, depthWrite: false, blending: THREE.NoBlending });
  private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mCopy);
  private readonly quadScene = new THREE.Scene();
  /** the measure's small targets: a quarter, then 32 across */
  private readonly small = new THREE.WebGLRenderTarget(32, 32, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false, generateMipmaps: false });
  private readonly smallPx = new Uint8Array(32 * 32 * 4);

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  get keys(): string[] {
    return [...this.coats.keys()];
  }

  get(key: string): Coat | undefined {
    return this.coats.get(key);
  }

  /** the coat of a part, made the first time it is painted (or kept: drawn back from the store), its look shown with it */
  open(o: GrimeOwner, kept?: Uint8Array | null, size?: number): Coat {
    let c = this.coats.get(o.key);
    if (c) {
      o.look.setCoat(c);
      return c;
    }
    const side = size ?? Math.max(64, Math.floor(o.size / 2));
    c = new Coat(o.key, side);
    this.coats.set(o.key, c);
    // (how much of the square is its surface, for the measure: the islands drawn whole once, then cleared)
    this.draw(c.dry, o.meshes, (name) => (PAINTED(name) ? this.mSurface : null), new THREE.Vector4(0, 0, 0, 0));
    c.surface = Math.max(1e-3, this.shrink(c.dry.texture, c.dry.texture).a);
    this.clear(c.dry);
    this.clear(c.wet);
    if (kept && kept.length === side * side * 4) this.load(c, kept);
    o.look.setCoat(c);
    return c;
  }

  /** a part's coat gone (it went to the recycler, a wreck was left behind) */
  close(key: string, look?: CarLook): void {
    const c = this.coats.get(key);
    if (!c) return;
    look?.setCoat(null);
    c.dispose();
    this.coats.delete(key);
  }

  /** the spray of a can on the part: a disc round the point at (render space), facing n, of radius r, so thick (k of the way to whole) */
  spray(c: Coat, o: GrimeOwner, at: THREE.Vector3, n: THREE.Vector3, r: number, srgb: THREE.Color, k: number, now: number): void {
    const u = this.uSpray;
    u.uC.value.copy(at);
    u.uN.value.copy(n);
    u.uR.value = r;
    u.uDepth.value = Math.max(0.05, r * 0.5);
    u.uColor.value.copy(srgb);
    u.uK.value = Math.min(1, Math.max(0, k));
    this.draw(c.wet, o.meshes, (name) => (PAINTED(name) ? this.mSpray : null));
    c.sprayedAt = now;
    c.wetNow = true;
    c.changed = true;
  }

  /** a stroke of a tool over it takes off so much of the coat: of what has set (dry), of what is still wet */
  strip(c: Coat, o: GrimeOwner, s: Pick<Stroke, 'a' | 'b' | 'normal' | 'side' | 'half' | 'soft' | 'depth'>, dry: number, wet: number): void {
    const u = this.uStrip;
    u.uA.value.copy(s.a);
    u.uB.value.copy(s.b);
    u.uN.value.copy(s.normal);
    u.uS.value.copy(s.side);
    u.uHalf.value = s.half;
    u.uSoft.value = s.soft;
    u.uDepth.value = s.depth;
    if (dry > 0) {
      u.uTake.value = Math.min(1, dry);
      this.draw(c.dry, o.meshes, (name) => (PAINTED(name) ? this.mStrip : null));
      c.changed = true;
    }
    if (wet > 0 && c.wetNow) {
      u.uTake.value = Math.min(1, wet);
      this.draw(c.wet, o.meshes, (name) => (PAINTED(name) ? this.mStrip : null));
    }
  }

  /** the wet sets: over the dry, and cleared */
  set(c: Coat): void {
    if (!c.wetNow) return;
    this.uCopy.tSrc.value = c.wet.texture;
    setBlend(this.mCopy, 'over');
    this.mCopy.needsUpdate = true;
    this.quad.material = this.mCopy;
    this.blit(c.dry);
    this.clear(c.wet);
    c.wetNow = false;
    c.changed = true;
  }

  /** how much of the part the coat covers: what has set, and what is wet (0…1 of its surface) */
  measure(c: Coat): { dry: number; wet: number } {
    const s = this.shrink(c.dry.texture, c.wet.texture);
    return { dry: Math.min(1, s.a / c.surface), wet: Math.min(1, s.b / c.surface) };
  }

  /** the coat read back (to be kept): what has set, and what is still wet over it (a reload sets it) */
  read(c: Coat): Uint8Array {
    const out = new Uint8Array(c.size * c.size * 4);
    if (!c.wetNow) {
      this.renderer.readRenderTargetPixels(c.dry, 0, 0, c.size, c.size, out);
      return out;
    }
    const t = new THREE.WebGLRenderTarget(c.size, c.size, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false, generateMipmaps: false });
    this.quad.material = this.mCopy;
    this.uCopy.tSrc.value = c.dry.texture;
    setBlend(this.mCopy, 'none');
    this.mCopy.needsUpdate = true;
    this.blit(t);
    this.uCopy.tSrc.value = c.wet.texture;
    setBlend(this.mCopy, 'over');
    this.mCopy.needsUpdate = true;
    this.blit(t);
    this.renderer.readRenderTargetPixels(t, 0, 0, c.size, c.size, out);
    t.dispose();
    return out;
  }

  dispose(): void {
    for (const c of this.coats.values()) c.dispose();
    this.coats.clear();
    this.small.dispose();
  }

  // ------------------------------------------------------------------ the passes' plumbing

  private load(c: Coat, data: Uint8Array): void {
    const t = new THREE.DataTexture(data, c.size, c.size, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.needsUpdate = true;
    this.uCopy.tSrc.value = t;
    setBlend(this.mCopy, 'none');
    this.mCopy.needsUpdate = true;
    this.quad.material = this.mCopy;
    this.blit(c.dry);
    t.dispose();
  }

  private clear(rt: THREE.WebGLRenderTarget): void {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    const prevColor = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 0);
    r.clear(true, false, false);
    r.setRenderTarget(prev);
    r.setClearColor(prevColor, prevAlpha);
  }

  private blit(rt: THREE.WebGLRenderTarget): void {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    const prevAuto = r.autoClear;
    r.setRenderTarget(rt);
    r.autoClear = false;
    r.render(this.quadScene, this.cam);
    r.setRenderTarget(prev);
    r.autoClear = prevAuto;
  }

  /** two targets' alpha averaged over all of them (32 × 32 squares of 4 × 4 taps each, read back) */
  private shrink(a: THREE.Texture, b: THREE.Texture): { a: number; b: number } {
    const u = this.uShrink;
    u.tSrc.value = a;
    u.tSrc2.value = b;
    u.uStep.value.set(1 / 128, 1 / 128);
    this.quad.material = this.mShrink;
    const r = this.renderer;
    const prev = r.getRenderTarget();
    const prevAuto = r.autoClear;
    r.setRenderTarget(this.small);
    r.autoClear = false;
    r.render(this.quadScene, this.cam);
    r.readRenderTargetPixels(this.small, 0, 0, 32, 32, this.smallPx);
    r.setRenderTarget(prev);
    r.autoClear = prevAuto;
    let sa = 0;
    let sb = 0;
    const px = this.smallPx;
    for (let i = 0; i < px.length; i += 4) {
      sa += px[i];
      sb += px[i + 1];
    }
    const n = 32 * 32 * 255;
    return { a: sa / n, b: sb / n };
  }

  private draw(rt: THREE.WebGLRenderTarget, meshes: THREE.Mesh[], pick: (name: CarMaterialName | null) => THREE.Material | null, clear?: THREE.Vector4): void {
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevAuto = r.autoClear;
    const prevColor = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    const proxies: THREE.Mesh[] = [];
    for (const src of meshes) {
      if (!src.geometry.hasAttribute('aMaskUv')) continue;
      const n = Array.isArray(src.material) ? src.material.length : 1;
      const names = Array.from({ length: n }, (_, i) => meshCarMaterialName(src, i));
      const mats = names.map((nm) => pick(nm));
      if (mats.every((m) => !m)) continue;
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
}
