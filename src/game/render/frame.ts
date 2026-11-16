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
    ink: STYLE.pipeline.ink.strength,
    threshold: STYLE.pipeline.bloom.threshold,
  };
  exposure = 1;
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
  private readonly camera = new THREE.Camera();
  private readonly quad: THREE.Mesh;
  private readonly bloomFirst: THREE.ShaderMaterial;
  private readonly bloomDown: THREE.ShaderMaterial;
  private readonly bloomUp: THREE.ShaderMaterial;
  private readonly finalMat: THREE.ShaderMaterial;
  private width = 0;
  private height = 0;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    opts: FrameOptions,
  ) {
    this.paint = opts.paint;
    this.smaa = opts.smaa ?? false;
    // (made now: its two lookup images decode asynchronously, and the first shot must have them)
    if (this.smaa) this.makeSmaa();
    const hdr = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, colorSpace: THREE.NoColorSpace } as const;
    this.depth = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
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
      uniform float uNearM;
      uniform float uFarM;
      uniform float uKnee;
      uniform float uShoulder;
      uniform float uSat;
      uniform float uTime;
      uniform vec3 uInkColor;
      uniform float uInk;
      uniform vec3 uLitLine;
      uniform vec3 uShaft;       // xy: where the sun is on the screen (uv), z: strength
      uniform vec3 uShaftColor;
      uniform float uAspect;
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
        float away = exp2(d * uLogFar) - 1.0;
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
        vec2 d = vUv - 0.5;
        c *= 1.0 - uVignette * dot(d, d) * 1.6;
        c *= uExposure;
        // a painter's curve: below the knee the colour stays as mixed, only the brightest lights are eased in
        vec3 hi = max(c - uKnee, 0.0);
        c = min(c, uKnee) + uShoulder * (1.0 - exp(-hi / uShoulder));
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = toSrgb(max(mix(vec3(l), c, uSat), 0.0));
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
        uNearM: { value: p.paint.nearDepthM },
        uFarM: { value: p.paint.farDepthM },
        uKnee: { value: p.curve.knee },
        uShoulder: { value: p.curve.shoulder },
        uSat: { value: p.saturation },
        uTime: { value: 0 },
        uInkColor: { value: new THREE.Color(...p.ink.color) },
        uInk: { value: p.ink.strength },
        // the highlight's outline (linear, before exposure): the car materials' cyan-white
        uLitLine: { value: new THREE.Color(0.62, 1.0, 1.08) },
        uShaft: { value: new THREE.Vector3(0.5, 0.5, 0) },
        uShaftColor: { value: this.shaftColor },
        uAspect: { value: 16 / 9 },
      },
    );
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
    r.setRenderTarget(this.rtScene);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(scene, camera);

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
    const gr = this.grade;
    u.uVignette.value = gr.vignette;
    u.uKnee.value = gr.knee;
    u.uShoulder.value = Math.max(0.01, gr.shoulder);
    u.uSat.value = gr.saturation;
    u.uInk.value = gr.ink;
    this.bloomFirst.uniforms.uThreshold.value = gr.threshold;
    u.uPaint.value = this.paint;
    u.uPaintTexel.value.set(1 / size.x, 1 / size.y);
    u.uLogFar.value = Math.log2(camera.far + 1);
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
