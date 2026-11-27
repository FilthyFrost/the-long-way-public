/**
 * The frame: the scene into a half-float target in linear light, then the finish
 * (specs/art/STYLE.md §9): bloom → paint (soft-weighted Kuwahara, finer near and far) →
 * vignette → exposure → painter's curve → saturation → sRGB → dither.
 *
 * Alpha written by materials steers the paint: < 0.6 means "already painted, leave alone"
 * (the sky, the far country).
 */
import * as THREE from 'three';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { globals } from './shaderlib';
import { STYLE } from './style';

const fullscreenVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export interface FrameOptions {
  samples: number;
  /** paint radius (0 = off) */
  paint: number;
  /** SMAA over the finished frame (the ink lines and what MSAA leaves) */
  smaa?: boolean;
  /** the depth buffer is reversed and floating (render/core.ts), not logarithmic: how the paint reads distance from it */
  reversed?: boolean;
}

/**
 * A thing drawn alone and laid over the frame, seen through about the mark (the thing carried: modcar/held.ts, as
 * Nomad Drive does — core/v3/nd/viewFade.ts). It is kept out of the scene's own pass and drawn into a layer of its own
 * with its own depth, so that only its nearest faces are there (nothing of its inside, its shelves, its doors); laid
 * over the scene where it stands in front of it (her hands on it, a wall it is pushed into, stay over it), its faces
 * see-through in an oval about the mark — at full fade to `minOpacity` within `inner` screen heights of it, to
 * `edgeOpacity` from `outer` on — and its outline left: an inked edge and a band of its own colour inside it, as
 * opaque as `lineOpacity` (widths in pixels of a frame 1080 high).
 */
export interface SeeLayer {
  readonly root: THREE.Object3D;
  /** how far it is seen through (0 … 1) */
  weight: number;
  minOpacity: number;
  edgeOpacity: number;
  inner: number;
  outer: number;
  stretch: number;
  lineOpacity: number;
  inkPx: number;
  bandPx: number;
}

/**
 * Target outlined with a 4.6 px pure-white through-occluder silhouette contour
 * (Nomad Drive style: zero interior tint/fill, always visible through intervening geometry).
 */
export interface OutlineTarget {
  readonly root: THREE.Object3D;
  /** when root contains a merged mesh with aPartId, only vertices matching partId (> 0) are outlined */
  readonly partId?: number;
  /** optional companion subtree outlined into the same mask (e.g. moving lever/key of a merged control) */
  readonly extra?: THREE.Object3D | null;
}

export class Frame {
  readonly rtScene: THREE.WebGLRenderTarget;
  bloom = STYLE.pipeline.bloom.strength;
  /** the finish (specs/art/style.json pipeline), read every frame: the developer's dials move it */
  readonly grade = {
    vignette: STYLE.pipeline.vignette,
    knee: STYLE.pipeline.curve.knee,
    shoulder: STYLE.pipeline.curve.shoulder,
    saturation: STYLE.pipeline.saturation,
    contrast: STYLE.pipeline.contrast ?? 1,
    ink: STYLE.pipeline.ink.strength,
    threshold: STYLE.pipeline.bloom.threshold,
  };
  exposure = 1;
  /** (G7) the place's own finish against the style's */
  placeContrast = 1;
  placeSaturation = 1;
  /** the night's eye (V1): how far the land is seen as by night — darker hues gone to blue and grey, the sky left as painted (0 day … 1 deep night) */
  night = 0;
  /** shafts of light from a low sun through haze and between whatever stands before it: strength 0…1 and colour */
  shafts = 0;
  readonly shaftColor = new THREE.Color(1, 0.9, 0.7);
  /** SMAA over the finished frame: the ink is drawn after the MSAA resolve, so only this smooths its steps */
  smaa: boolean;
  private smaaPass: SMAAPass | null = null;
  private rtFinal: THREE.WebGLRenderTarget | null = null;
  private readonly sunScreen = new THREE.Vector3();
  paint: number;
  private readonly depth: THREE.DepthTexture;
  private readonly rtDown: THREE.WebGLRenderTarget[] = [];
  private readonly rtUp: THREE.WebGLRenderTarget[] = [];
  private readonly scene = new THREE.Scene();
  // (a plain camera: marked as drawn for a reversed depth buffer already, it has no projection to update)
  private readonly camera = Object.assign(new THREE.Camera(), { _reversedDepth: true });
  private readonly quad: THREE.Mesh;
  private readonly bloomFirst: THREE.ShaderMaterial;
  private readonly bloomDown: THREE.ShaderMaterial;
  private readonly bloomUp: THREE.ShaderMaterial;
  private readonly finalMat: THREE.ShaderMaterial;
  private width = 0;
  private height = 0;
  /** the thing laid over the frame this frame (null: none) — set by whoever draws it, each frame */
  overlay: SeeLayer | null = null;
  /** the aimed target outlined with a 4.6 px solid white through-occluder contour (null: none) */
  outline: OutlineTarget | null = null;
  /** its layer (made the first time one is laid over), and the frame's MSAA and depth for it */
  private rtLayer: THREE.WebGLRenderTarget | null = null;
  /** silhouette mask for the aimed target (made on first use; pooled proxy meshes for zero per-frame alloc) */
  private rtOutline: THREE.WebGLRenderTarget | null = null;
  private readonly outlineScene = new THREE.Scene();
  private readonly outlinePool: THREE.Mesh[] = [];
  private readonly outlineStack: THREE.Object3D[] = [];
  private outlineMat: THREE.ShaderMaterial | null = null;
  private outlinePartMat: THREE.ShaderMaterial | null = null;
  private readonly samples: number;
  private readonly reversed: boolean;
  /** (bound in its place while there is no layer) */
  private readonly noLayer = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    opts: FrameOptions,
  ) {
    this.paint = opts.paint;
    this.smaa = opts.smaa ?? false;
    this.samples = opts.samples;
    this.reversed = !!opts.reversed;
    this.noLayer.needsUpdate = true;
    // (made now: its two lookup images decode asynchronously, and the first shot must have them)
    if (this.smaa) this.makeSmaa();
    const hdr = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, colorSpace: THREE.NoColorSpace } as const;
    this.depth = new THREE.DepthTexture(1, 1, opts.reversed ? THREE.FloatType : THREE.UnsignedIntType);
    this.depth.minFilter = this.depth.magFilter = THREE.NearestFilter;
    this.rtScene = new THREE.WebGLRenderTarget(1, 1, { ...hdr, samples: opts.samples, depthBuffer: true, stencilBuffer: false, depthTexture: this.depth });
    for (let i = 0; i < STYLE.pipeline.bloom.levels; i++) {
      this.rtDown.push(new THREE.WebGLRenderTarget(1, 1, { ...hdr, depthBuffer: false }));
      this.rtUp.push(new THREE.WebGLRenderTarget(1, 1, { ...hdr, depthBuffer: false }));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad = new THREE.Mesh(geo);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    const fs = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial =>
      new THREE.ShaderMaterial({ vertexShader: fullscreenVertex, fragmentShader, uniforms, depthTest: false, depthWrite: false, blending: THREE.NoBlending });

    this.bloomFirst = fs(
      /* glsl */ `
      uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold;
      varying vec2 vUv;
      vec3 pick(vec3 c) { float m = max(c.r, max(c.g, c.b)); float k = smoothstep(uThreshold * 0.7, uThreshold * 1.6, m); return min(c, vec3(14.0)) * k; }
      void main() {
        vec3 c = pick(texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb) + pick(texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb)
          + pick(texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb) + pick(texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb);
        gl_FragColor = vec4(c * 0.25, 1.0);
      }`,
      { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: STYLE.pipeline.bloom.threshold } },
    );
    this.bloomDown = fs(
      /* glsl */ `
      uniform sampler2D tSrc; uniform vec2 uTexel;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
        c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb
          + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
        gl_FragColor = vec4(c / 8.0, 1.0);
      }`,
      { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
    );
    this.bloomUp = fs(
      /* glsl */ `
      uniform sampler2D tSrc; uniform sampler2D tPrev; uniform vec2 uTexel; uniform float uMix;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tPrev, vUv + uTexel * vec2(-1.0, 0.0)).rgb + texture2D(tPrev, vUv + uTexel * vec2(1.0, 0.0)).rgb
          + texture2D(tPrev, vUv + uTexel * vec2(0.0, -1.0)).rgb + texture2D(tPrev, vUv + uTexel * vec2(0.0, 1.0)).rgb;
        c += (texture2D(tPrev, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tPrev, vUv + uTexel * vec2(1.0, -1.0)).rgb
          + texture2D(tPrev, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tPrev, vUv + uTexel * vec2(1.0, 1.0)).rgb) * 0.5;
        gl_FragColor = vec4(c / 6.0 * uMix + texture2D(tSrc, vUv).rgb, 1.0);
      }`,
      { tSrc: { value: null }, tPrev: { value: null }, uTexel: { value: new THREE.Vector2() }, uMix: { value: 0.85 } },
    );
    const p = STYLE.pipeline;
    this.finalMat = fs(
      /* glsl */ `
      uniform sampler2D tHdr;
      uniform sampler2D tBloom;
      uniform sampler2D tDepth;
      uniform float uBloom;
      uniform float uExposure;
      uniform float uVignette;
      uniform float uPaint;
      uniform vec2 uPaintTexel;
      uniform float uLogFar;
      uniform vec2 uCamRange;
      uniform float uNearM;
      uniform float uFarM;
      uniform float uKnee;
      uniform float uShoulder;
      uniform float uSat;
      uniform float uContrast;
      uniform float uTime;
      uniform vec3 uInkColor;
      uniform float uInk;
      uniform vec3 uLitLine;
      uniform vec3 uShaft;       // xy: where the sun is on the screen (uv), z: strength
      uniform vec3 uShaftColor;
      uniform float uAspect;
      uniform float uNight;
      uniform sampler2D tLayer;      // the thing laid over the frame (SeeLayer): its colour by how much of the pixel it covers, that in alpha
      uniform sampler2D tLayerDepth;
      uniform vec4 uLayer;           // x how far it is seen through (0: no layer), y its faces' least opacity, z its outline's, w its band's width (px)
      uniform vec4 uLayerWin;        // x, y the window's inner and outer radius (screen heights), z its stretch across, w the inked edge's width (px)
      uniform float uLayerEdge;      // its faces' opacity outside the window at full fade
      uniform sampler2D tOutline;    // silhouette mask of the aimed target (r=1 inside, depthTest off)
      uniform float uOutline;        // 1 when an aimed target outline is active
      varying vec2 vUv;

      // The inked line of a cel-painted thing (the vehicle): its parts write small alphas of their own
      // (0.04…0.23, one per colour); where one of those meets a different alpha there is a line (x). A part
      // being looked at (carMaterials.ts, its highlight) writes its own under all of them, in 0.004…0.036:
      // where it meets anything else, its outline is drawn in light instead (y). (Under them, so the MSAA blend
      // of two other ids along an edge never lands in it; and it has to run on for a second pixel, behind a
      // or beyond b, so a blend at the part's own edge does not either.)
      float litBand(float x) {
        return step(0.004, x) * step(x, 0.036);
      }
      // One neighbour b of the pixel a, with c the pixel behind a and e the one beyond b. Something one pixel
      // thin is not inked: a sliver at b (beyond it the same id as a again: a door's gap at ten metres, a grass
      // blade in front, a crack) or a spike at a — inking those draws a dotted line that crawls as the car
      // moves. Across a real boundary the line is as strong as the two sides differ, even where the pixel on
      // it is an MSAA blend of the two.
      vec2 inkPair(float a, float b, float c, float e) {
        if (min(a, b) >= 0.23) return vec2(0.0);
        if (abs(e - a) < 0.004 || abs(c - b) < 0.004) return vec2(0.0);
        float d = smoothstep(0.004, 0.02, max(max(abs(a - b), abs(a - e)), abs(c - b)));
        float ia = litBand(a);
        float ib = litBand(b);
        float lit = 0.0;
        if (ia > 0.5 && ib < 0.5) lit = litBand(c);
        else if (ib > 0.5 && ia < 0.5) lit = litBand(e);
        return lit > 0.5 ? vec2(0.0, d) : vec2(d, 0.0);
      }
      vec2 inkAt(vec2 uv) {
        float a = texture2D(tHdr, uv).a;
        vec2 w = uPaintTexel * max(1.0, 1.0 / (uPaintTexel.y * 1080.0));
        vec2 dx = vec2(w.x, 0.0);
        vec2 dy = vec2(0.0, w.y);
        float r = texture2D(tHdr, uv + dx).a;
        float l = texture2D(tHdr, uv - dx).a;
        float u = texture2D(tHdr, uv + dy).a;
        float d = texture2D(tHdr, uv - dy).a;
        float r2 = texture2D(tHdr, uv + 2.0 * dx).a;
        float l2 = texture2D(tHdr, uv - 2.0 * dx).a;
        float u2 = texture2D(tHdr, uv + 2.0 * dy).a;
        float d2 = texture2D(tHdr, uv - 2.0 * dy).a;
        return max(max(inkPair(a, r, l, r2), inkPair(a, l, r, l2)), max(inkPair(a, u, d, u2), inkPair(a, d, u, d2)));
      }

      // The frame as paint: round each point four overlapping patches; the calmest gives its colour,
      // softly weighted (a hard choice flickers). Edges stay; everything between goes flat.
      vec3 painted(vec2 uv) {
        vec4 c0 = texture2D(tHdr, uv);
        if (c0.a < ${p.paint.skipAlphaBelow.toFixed(2)}) return c0.rgb;
        float d = texture2D(tDepth, uv).r;
        #ifdef USE_REVERSED_DEPTH_BUFFER
        // (reversed: the near plane at 1, the far at 0 — d = n (f − z) / (z (f − n)))
        float away = uCamRange.x * uCamRange.y / (d * (uCamRange.y - uCamRange.x) + uCamRange.x);
        #else
        float away = exp2(d * uLogFar) - 1.0;
        #endif
        int r = int(uPaint + 0.5);
        r = min(r, 2);
        if (away < uNearM || away > uFarM) r = min(r, 1);
        // foliage writes 0.6–0.8: the finest brush, so leaf dabs stay round
        if (c0.a < 0.8) r = min(r, 1);
        if (r <= 0) return c0.rgb;
        vec3 m0 = vec3(0.0); vec3 m1 = vec3(0.0); vec3 m2 = vec3(0.0); vec3 m3 = vec3(0.0);
        vec3 s0 = vec3(0.0); vec3 s1 = vec3(0.0); vec3 s2 = vec3(0.0); vec3 s3 = vec3(0.0);
        for (int j = -2; j <= 2; j++) {
          for (int i = -2; i <= 2; i++) {
            if (i < -r || i > r || j < -r || j > r) continue;
            vec3 c = texture2D(tHdr, uv + vec2(float(i), float(j)) * uPaintTexel).rgb;
            c = c / (1.0 + c);
            vec3 cc = c * c;
            if (i <= 0 && j <= 0) { m0 += c; s0 += cc; }
            if (i >= 0 && j <= 0) { m1 += c; s1 += cc; }
            if (i <= 0 && j >= 0) { m2 += c; s2 += cc; }
            if (i >= 0 && j >= 0) { m3 += c; s3 += cc; }
          }
        }
        float n = float((r + 1) * (r + 1));
        vec3 sum = vec3(0.0);
        float total = 0.0;
        vec3 mean; vec3 var3; float v; float w;
        mean = m0 / n; var3 = abs(s0 / n - mean * mean); v = var3.r + var3.g + var3.b; w = 1.0 / (1e-7 + v * v * v * v * 1e12); sum += mean * w; total += w;
        mean = m1 / n; var3 = abs(s1 / n - mean * mean); v = var3.r + var3.g + var3.b; w = 1.0 / (1e-7 + v * v * v * v * 1e12); sum += mean * w; total += w;
        mean = m2 / n; var3 = abs(s2 / n - mean * mean); v = var3.r + var3.g + var3.b; w = 1.0 / (1e-7 + v * v * v * v * 1e12); sum += mean * w; total += w;
        mean = m3 / n; var3 = abs(s3 / n - mean * mean); v = var3.r + var3.g + var3.b; w = 1.0 / (1e-7 + v * v * v * v * 1e12); sum += mean * w; total += w;
        vec3 o = sum / total;
        return o / (1.0 - min(o, vec3(0.985)));
      }
      vec3 toSrgb(vec3 c) {
        return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
      }
      // How much of the pixel the thing laid over covers, where it stands in front of the scene (SeeLayer)
      float layerCover = 0.0;
      // The thing laid over the frame (SeeLayer; Nomad Drive's view fade): its faces see-through in the window about the
      // mark, as far as the fade goes; its outline kept — an inked edge where it ends and a band of its own colour inside
      // that, so that its shape still reads with its inside gone.
      vec3 overLayer(vec3 c) {
        vec4 L = texture2D(tLayer, vUv);
        if (L.a <= 0.002) return c;
        // (behind what the scene has in front of it — her hand on it, a wall it is pushed into: the scene's)
        float dl = texture2D(tLayerDepth, vUv).r;
        float ds = texture2D(tDepth, vUv).r;
        #ifdef USE_REVERSED_DEPTH_BUFFER
        if (dl > 0.0 && dl < ds) return c;
        #else
        if (dl < 1.0 && dl > ds) return c;
        #endif
        vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
        q.x /= max(uLayerWin.z, 0.01);
        float t = clamp((length(q) - uLayerWin.x) / max(uLayerWin.y - uLayerWin.x, 1e-4), 0.0, 1.0);
        float face = mix(1.0, mix(uLayerEdge, uLayer.y, 1.0 - t * t * (3.0 - 2.0 * t)), clamp(uLayer.x, 0.0, 1.0));
        // where it ends: the least of its cover round the pixel, a hair out (the ink) and a band's width out
        vec2 px = uPaintTexel * max(1.0, 1.0 / (uPaintTexel.y * 1080.0));
        float m1 = 1.0;
        float m2 = 1.0;
        for (int i = 0; i < 8; i++) {
          float a = float(i) * 0.7853982;
          vec2 d = vec2(cos(a), sin(a)) * px;
          m1 = min(m1, texture2D(tLayer, vUv + d * uLayerWin.w).a);
          m2 = min(m2, texture2D(tLayer, vUv + d * uLayer.w).a);
        }
        float ink = clamp((L.a - m1) * 1.6, 0.0, 1.0);
        float band = clamp((L.a - m2) * 1.6, 0.0, 1.0);
        float o = max(face, band * uLayer.z);
        layerCover = L.a * o;
        // (its colour is drawn by how much of the pixel it covers: its own, over the scene by the opacity there; the
        // band lifted to a grey where its own is too dark to be seen — more so by night)
        vec3 rim = max(L.rgb, L.a * vec3(mix(0.06, 0.2, uNight) / max(uExposure, 0.1)));
        c = c * (1.0 - L.a * o) + mix(L.rgb, rim, band) * o;
        return mix(c, c * uInkColor, uInk * ink * max(face, uLayer.z));
      }
      void main() {
        vec3 c = (uPaint > 0.5 ? painted(vUv) : texture2D(tHdr, vUv).rgb) + texture2D(tBloom, vUv).rgb * uBloom;
        vec2 ink = inkAt(vUv);
        c = mix(c, c * uInkColor, uInk * ink.x);
        // the outline of what is being looked at, in light, breathing (the same on screen at any exposure)
        c = mix(c, uLitLine / max(uExposure, 0.1), ink.y * (0.78 + 0.22 * sin(uTime * 3.0)));
        // shafts of light: walk towards the sun and gather the open sky on the way (the sky writes alpha
        // 0.25, nothing else does): where a tree or a pillar stands between, the walk comes up short — a shadow in the air
        if (uShaft.z > 0.002) {
          vec2 dir = uShaft.xy - vUv;
          float acc = 0.0;
          for (int i = 1; i <= 12; i++) {
            vec4 s = texture2D(tHdr, vUv + dir * (float(i) / 12.0) * 0.92);
            acc += step(abs(s.a - 0.25), 0.05) * min(dot(s.rgb, vec3(0.3333)), 3.0);
          }
          vec2 q = dir * vec2(uAspect, 1.0);
          c += uShaftColor * (acc / 12.0) * uShaft.z * exp(-dot(q, q) * 2.4);
        }
        // the thing carried, laid over what is behind it
        if (uLayer.x > 0.0) c = overLayer(c);
        vec2 d = vUv - 0.5;
        c *= 1.0 - uVignette * dot(d, d) * 1.6;
        c *= uExposure;
        // the night's eye: what is dim goes to a blue grey (the eye's rods), the lights and the painted sky keep their colours
        if (uNight > 0.01) {
          float a0 = texture2D(tHdr, vUv).a;
          float ln = dot(c, vec3(0.2126, 0.7152, 0.0722));
          float kn = uNight * (1.0 - smoothstep(0.06, 0.45, ln)) * (1.0 - step(abs(a0 - 0.25), 0.05) * (1.0 - layerCover)) * 0.7;
          c = mix(c, vec3(ln) * vec3(0.6, 0.82, 1.3), kn);
        }
        // a painter's curve: below the knee the colour stays as mixed, only the brightest lights are eased in
        vec3 hi = max(c - uKnee, 0.0);
        c = min(c, uKnee) + uShoulder * (1.0 - exp(-hi / uShoulder));
        // (contrast about mid grey: the darks a little deeper, the lights a little brighter — V1)
        c = pow(max(c, 0.0) / 0.18, vec3(uContrast)) * 0.18;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = toSrgb(max(mix(vec3(l), c, uSat), 0.0));
        // Aimed target silhouette contour: 4.6 px (at 1080p) pure solid white, visible through occluders, zero interior tint
        if (uOutline > 0.5) {
          float c0 = texture2D(tOutline, vUv).r;
          if (c0 < 0.5) {
            vec2 px = uPaintTexel * (4.6 * max(0.5, 1.0 / (uPaintTexel.y * 1080.0)));
            float m = 0.0;
            for (int i = 0; i < 16; i++) {
              float a = float(i) * 0.3926991;
              vec2 off = vec2(cos(a), sin(a)) * px;
              m = max(m, texture2D(tOutline, vUv + off).r);
              m = max(m, texture2D(tOutline, vUv + off * 0.5).r);
            }
            float edge = smoothstep(0.15, 0.55, m) * (1.0 - smoothstep(0.3, 0.7, c0));
            c = mix(c, vec3(1.0), edge);
          }
        }
        float nz = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)) + fract(uTime * 7.1) * 0.618));
        gl_FragColor = vec4(c + (nz - 0.5) / 255.0, 1.0);
      }`,
      {
        tHdr: { value: this.rtScene.texture },
        tBloom: { value: this.rtUp[0].texture },
        tDepth: { value: this.depth },
        uBloom: { value: this.bloom },
        uExposure: { value: 1 },
        uVignette: { value: p.vignette },
        uPaint: { value: this.paint },
        uPaintTexel: { value: new THREE.Vector2(1, 1) },
        uLogFar: { value: Math.log2(30001) },
        uCamRange: { value: new THREE.Vector2(0.06, 130000) },
        uNearM: { value: p.paint.nearDepthM },
        uFarM: { value: p.paint.farDepthM },
        uKnee: { value: p.curve.knee },
        uShoulder: { value: p.curve.shoulder },
        uSat: { value: p.saturation },
        uContrast: { value: p.contrast ?? 1 },
        uTime: { value: 0 },
        uInkColor: { value: new THREE.Color(...p.ink.color) },
        uInk: { value: p.ink.strength },
        // the highlight's outline (pure white)
        uLitLine: { value: new THREE.Color(1.0, 1.0, 1.0) },
        uShaft: { value: new THREE.Vector3(0.5, 0.5, 0) },
        uShaftColor: { value: this.shaftColor },
        uAspect: { value: 16 / 9 },
        uNight: { value: 0 },
        tLayer: { value: this.noLayer },
        tLayerDepth: { value: this.noLayer },
        uLayer: { value: new THREE.Vector4(0, 1, 1, 3) },
        uLayerWin: { value: new THREE.Vector4(0.12, 0.42, 1.4, 1.4) },
        uLayerEdge: { value: 1 },
        tOutline: { value: this.noLayer },
        uOutline: { value: 0 },
      },
    );
  }

  /**
   * The layer the thing laid over the frame is drawn into: the scene's size and kind of depth, two samples at most (its
   * edge is under the outline; the scene's four would double the frame's largest target for it) — made once
   */
  private layerTarget(w: number, h: number): THREE.WebGLRenderTarget {
    let rt = this.rtLayer;
    if (!rt) {
      const depth = new THREE.DepthTexture(1, 1, this.reversed ? THREE.FloatType : THREE.UnsignedIntType);
      depth.minFilter = depth.magFilter = THREE.NearestFilter;
      rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, colorSpace: THREE.NoColorSpace, samples: Math.min(2, this.samples), depthBuffer: true, stencilBuffer: false, depthTexture: depth });
      this.rtLayer = rt;
    }
    if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
    return rt;
  }

  /**
   * The thing laid over the frame (SeeLayer), drawn alone into its layer: cleared to nothing, its own depth, its
   * materials writing how much of each pixel they cover (carMaterials.ts drawnAlone) — the final pass lays it over
   */
  private drawLayer(lay: SeeLayer, camera: THREE.PerspectiveCamera, w: number, h: number): void {
    const r = this.renderer;
    const rt = this.layerTarget(w, h);
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 0);
    r.clear();
    const auto = r.autoClear;
    r.autoClear = false;
    try {
      r.render(lay.root, camera);
    } finally {
      r.autoClear = auto;
    }
  }

  private ensureOutline(w: number, h: number): THREE.WebGLRenderTarget {
    if (!this.rtOutline) {
      this.rtOutline = new THREE.WebGLRenderTarget(1, 1, {
        type: THREE.UnsignedByteType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: false,
        depthBuffer: false,
        stencilBuffer: false,
        colorSpace: THREE.NoColorSpace,
      });
    }
    if (this.rtOutline.width !== w || this.rtOutline.height !== h) this.rtOutline.setSize(w, h);
    if (!this.outlineMat) {
      this.outlineMat = new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
          void main() {
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          void main() {
            gl_FragColor = vec4(1.0);
          }`,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
      });
      this.outlinePartMat = new THREE.ShaderMaterial({
        uniforms: { uPartId: { value: -1 } },
        vertexShader: /* glsl */ `
          attribute float aPartId;
          varying float vPartId;
          void main() {
            vPartId = aPartId;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uPartId;
          varying float vPartId;
          void main() {
            if (abs(vPartId - uPartId) > 0.5) discard;
            gl_FragColor = vec4(1.0);
          }`,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
      });
    }
    return this.rtOutline;
  }

  /** Render the aimed target's solid silhouette mask using pooled proxy meshes (zero per-frame alloc). */
  private drawOutline(out: OutlineTarget, camera: THREE.PerspectiveCamera, w: number, h: number): boolean {
    const rt = this.ensureOutline(w, h);
    const partId = out.partId ?? -1;
    const partMat = this.outlinePartMat!;
    const plainMat = this.outlineMat!;
    partMat.uniforms.uPartId.value = partId;
    const stack = this.outlineStack;
    let count = 0;
    const collect = (root: THREE.Object3D, filterPart: boolean): void => {
      stack.length = 0;
      stack.push(root);
      while (stack.length > 0) {
        const o = stack.pop()!;
        if (!o.visible) continue;
        if (o.userData.ghostDepth || o.userData.ghostXray || o.name === 'nd:light-glow') continue;
        const m = o as THREE.Mesh;
        if (m.isMesh && m.geometry) {
          let proxy = this.outlinePool[count];
          if (!proxy) {
            proxy = new THREE.Mesh();
            proxy.matrixAutoUpdate = false;
            proxy.frustumCulled = false;
            this.outlinePool.push(proxy);
            this.outlineScene.add(proxy);
          }
          proxy.geometry = m.geometry;
          proxy.material = filterPart && partId > 0 && m.geometry.hasAttribute('aPartId') ? partMat : plainMat;
          proxy.matrix.copy(m.matrixWorld);
          proxy.matrixWorld.copy(m.matrixWorld);
          proxy.visible = true;
          count++;
        }
        const ch = o.children;
        for (let i = ch.length - 1; i >= 0; i--) stack.push(ch[i]);
      }
    };
    collect(out.root, partId > 0);
    if (out.extra) collect(out.extra, false);
    for (let i = count; i < this.outlinePool.length; i++) this.outlinePool[i].visible = false;
    if (count === 0) return false;
    const r = this.renderer;
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 0);
    r.clear();
    const auto = r.autoClear;
    r.autoClear = false;
    try {
      r.render(this.outlineScene, camera);
    } finally {
      r.autoClear = auto;
    }
    return true;
  }

  private makeSmaa(): void {
    this.smaaPass = new SMAAPass();
    this.smaaPass.renderToScreen = true;
    // the finished frame, already in sRGB: SMAA finds its edges in what the eye sees
    this.rtFinal = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: false, colorSpace: THREE.NoColorSpace });
    this.width = -1;
  }

  private fit(w: number, h: number): void {
    if (this.smaa && !this.smaaPass) this.makeSmaa();
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.rtScene.setSize(w, h);
    this.rtFinal?.setSize(w, h);
    this.smaaPass?.setSize(w, h);
    let bw = w;
    let bh = h;
    for (let i = 0; i < this.rtDown.length; i++) {
      bw = Math.max(1, bw >> 1);
      bh = Math.max(1, bh >> 1);
      this.rtDown[i].setSize(bw, bh);
      this.rtUp[i].setSize(bw, bh);
    }
  }

  private pass(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, time: number): void {
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    this.fit(size.x, size.y);
    // (the thing laid over the frame, if it is to be drawn at all: kept out of the scene's pass, drawn alone after it)
    const ov = this.overlay;
    const lay = ov && ov.weight > 0 && ov.root.visible ? ov : null;
    if (lay) lay.root.visible = false;
    r.setRenderTarget(this.rtScene);
    r.setClearColor(0x000000, 0);
    r.clear();
    try {
      r.render(scene, camera);
    } finally {
      if (lay) lay.root.visible = true;
    }
    if (lay) this.drawLayer(lay, camera, size.x, size.y);
    const outOn = !!this.outline && this.drawOutline(this.outline, camera, size.x, size.y);
    const ul = this.finalMat.uniforms;
    if (lay && this.rtLayer) {
      ul.tLayer.value = this.rtLayer.texture;
      ul.tLayerDepth.value = this.rtLayer.depthTexture;
      (ul.uLayer.value as THREE.Vector4).set(Math.min(1, lay.weight), lay.minOpacity, lay.lineOpacity, lay.bandPx);
      (ul.uLayerWin.value as THREE.Vector4).set(lay.inner, lay.outer, lay.stretch, lay.inkPx);
      ul.uLayerEdge.value = lay.edgeOpacity;
    } else {
      ul.tLayer.value = this.noLayer;
      ul.tLayerDepth.value = this.noLayer;
      (ul.uLayer.value as THREE.Vector4).x = 0;
    }
    ul.tOutline.value = outOn && this.rtOutline ? this.rtOutline.texture : this.noLayer;
    ul.uOutline.value = outOn ? 1 : 0;

    // bloom chain
    let src: THREE.WebGLRenderTarget = this.rtScene;
    for (let i = 0; i < this.rtDown.length; i++) {
      const m = i === 0 ? this.bloomFirst : this.bloomDown;
      m.uniforms.tSrc.value = src.texture;
      m.uniforms.uTexel.value.set(0.5 / this.rtDown[i].width, 0.5 / this.rtDown[i].height);
      this.pass(m, this.rtDown[i]);
      src = this.rtDown[i];
    }
    let prev = this.rtDown[this.rtDown.length - 1];
    for (let i = this.rtDown.length - 2; i >= 0; i--) {
      this.bloomUp.uniforms.tSrc.value = this.rtDown[i].texture;
      this.bloomUp.uniforms.tPrev.value = prev.texture;
      this.bloomUp.uniforms.uTexel.value.set(0.5 / prev.width, 0.5 / prev.height);
      this.pass(this.bloomUp, this.rtUp[i]);
      prev = this.rtUp[i];
    }

    const u = this.finalMat.uniforms;
    u.uBloom.value = this.bloom;
    u.uExposure.value = this.exposure;
    u.uNight.value = this.night;
    const gr = this.grade;
    u.uVignette.value = gr.vignette;
    u.uKnee.value = gr.knee;
    u.uShoulder.value = Math.max(0.01, gr.shoulder);
    u.uSat.value = gr.saturation * this.placeSaturation;
    u.uContrast.value = gr.contrast * this.placeContrast;
    u.uInk.value = gr.ink;
    this.bloomFirst.uniforms.uThreshold.value = gr.threshold;
    u.uPaint.value = this.paint;
    u.uPaintTexel.value.set(1 / size.x, 1 / size.y);
    u.uLogFar.value = Math.log2(camera.far + 1);
    (u.uCamRange.value as THREE.Vector2).set(camera.near, camera.far);
    u.uTime.value = time;
    // where the key light stands on the screen; no shafts when it is behind the eye or far off to the side
    const sv = this.sunScreen.copy(globals.uSunDir.value).multiplyScalar(1000).add(camera.position);
    const ahead = sv.clone().applyMatrix4(camera.matrixWorldInverse).z < 0;
    sv.project(camera);
    const off = Math.max(Math.abs(sv.x), Math.abs(sv.y));
    (u.uShaft.value as THREE.Vector3).set(sv.x * 0.5 + 0.5, sv.y * 0.5 + 0.5, ahead ? this.shafts * (1 - THREE.MathUtils.smoothstep(off, 1.0, 1.7)) : 0);
    u.uAspect.value = size.x / size.y;
    if (this.smaa && this.smaaPass && this.rtFinal) {
      this.pass(this.finalMat, this.rtFinal);
      this.smaaPass.render(r, null as unknown as THREE.WebGLRenderTarget, this.rtFinal, 0, false);
    } else this.pass(this.finalMat, null);
  }
}
