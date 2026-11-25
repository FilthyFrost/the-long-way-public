/**
 * What the water shows of the fish under it (docs/V3/nodes/F2-fishing-lite.md §12): near the jetty their shadows, a
 * dark shape of their body's kind that swims, turns and wags; further out only the rings of a fish turning at the
 * surface, the splash of one jumping. Rings and splashes also come from the float, a strike, a fish fighting. A
 * boiling shoal is a patch of splashes; a hungry rare fish wears rings of gold.
 *
 * A fish on the line is read by the white water it throws (docs/V3/plan/fishing-feel.md §4, as DREADMOOR shows it): a
 * wake of white streaks behind it as it runs, a V of them where it turns, and crowns of spray — white sheets thrown
 * up round it — where it turns hard, leaps or comes out; drawn crisp, a white with a cool edge, so they read on the
 * bright water among the water's own foam.
 *
 * The strike tears the water open where the fish is (the user's word of 2026-11-24): a tall plume, a wide crown flung
 * outward, a fast shock ring and a slower one, a dark swirl where it turned, foam, a burst of drops, and drops flung
 * off the line as it rips taut (strike()).
 *
 * Seven instanced meshes (shadows, rings, splashes, streaks, sheets, mist, swirls), their attributes rewritten every
 * frame (a few dozen each).
 */
import * as THREE from 'three';
import { maskPreservingBlend } from '../../../render/materials';
import { GLSL_COMMON, GLSL_FRAGMENT_PARS, GLSL_VERTEX_PARS, globals } from '../../../render/shaderlib';
import type { Family } from '../../../../core/v3/fishing/lite/types';

const MAX_SHADOWS = 64;
const MAX_RINGS = 96;
const MAX_DROPS = 512;
const MAX_FOAM = 192;
const MAX_SHEETS = 120;
const MAX_MIST = 48;
const MAX_SWIRLS = 8;

/** which silhouette of the atlas a body is drawn with */
export function shapeOf(f: Family): number {
  switch (f) {
    case 'carp':
    case 'perch':
    case 'disc':
    case 'tetra':
      return 1;
    case 'eel':
      return 2;
    case 'flat':
      return 3;
    case 'round':
    case 'cube':
    case 'turtle':
      return 4;
    case 'squid':
    case 'octopus':
    case 'crayfish':
    case 'frog':
      return 5;
    default:
      return 0;
  }
}

function atlas(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = S * 6;
  cv.height = S;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, cv.width, cv.height);
  g.filter = 'blur(4px)';
  g.fillStyle = '#fff';
  const ell = (cx: number, cy: number, rx: number, ry: number): void => {
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  };
  // the head at +x (right) in each cell, the tail at −x
  // 0 spindle with a forked tail
  ell(70, 64, 42, 13);
  g.beginPath();
  g.moveTo(32, 64);
  g.lineTo(10, 48);
  g.lineTo(18, 64);
  g.lineTo(10, 80);
  g.closePath();
  g.fill();
  // 1 deep body
  ell(S + 66, 64, 40, 19);
  g.beginPath();
  g.moveTo(S + 30, 64);
  g.lineTo(S + 10, 46);
  g.lineTo(S + 16, 64);
  g.lineTo(S + 10, 82);
  g.closePath();
  g.fill();
  // 2 eel
  g.lineWidth = 9;
  g.strokeStyle = '#fff';
  g.beginPath();
  g.moveTo(2 * S + 12, 64);
  g.bezierCurveTo(2 * S + 40, 50, 2 * S + 80, 78, 2 * S + 116, 64);
  g.stroke();
  // 3 flat: a broad round leaf
  ell(3 * S + 64, 64, 40, 30);
  g.beginPath();
  g.moveTo(3 * S + 26, 64);
  g.lineTo(3 * S + 10, 54);
  g.lineTo(3 * S + 10, 74);
  g.closePath();
  g.fill();
  // 4 round
  ell(4 * S + 64, 64, 30, 26);
  // 5 a body with legs
  ell(5 * S + 64, 64, 26, 16);
  g.lineWidth = 6;
  for (const a of [-0.9, -0.4, 0.4, 0.9]) {
    g.beginPath();
    g.moveTo(5 * S + 64, 64);
    g.lineTo(5 * S + 64 + Math.cos(a) * 44, 64 + Math.sin(a) * 34);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export interface ShadowSpec {
  x: number;
  y: number;
  z: number;
  heading: number;
  /** length and width (m) */
  len: number;
  wid: number;
  alpha: number;
  shape: number;
  /** how fast its tail beats (0 still) and its own phase */
  wag: number;
  phase: number;
  /** a rare one's faint glitter, 0 … 1 */
  shimmer: number;
}

export class WaterSigns {
  readonly group = new THREE.Group();
  private readonly shadows: THREE.InstancedMesh;
  private readonly sPos: THREE.InstancedBufferAttribute;
  private readonly sDir: THREE.InstancedBufferAttribute;
  private readonly sDat: THREE.InstancedBufferAttribute;
  private readonly rings: THREE.InstancedMesh;
  private readonly rPos: THREE.InstancedBufferAttribute;
  private readonly rDat: THREE.InstancedBufferAttribute;
  private readonly drops: THREE.InstancedMesh;
  private readonly dPos: THREE.InstancedBufferAttribute;
  private readonly dDat: THREE.InstancedBufferAttribute;
  /** rings alive: render-space centre, age, life, size, tint (0 white, 1 gold, 2…7 a rarity's colour), bold (1: a shock ring) */
  private readonly ringList: { x: number; y: number; z: number; age: number; life: number; size: number; tint: number; bold: number }[] = [];
  private readonly dropList: { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; size: number }[] = [];
  private readonly foams: THREE.InstancedMesh;
  private readonly fPos: THREE.InstancedBufferAttribute;
  private readonly fDir: THREE.InstancedBufferAttribute;
  private readonly sheets: THREE.InstancedMesh;
  private readonly hPos: THREE.InstancedBufferAttribute;
  private readonly hDir: THREE.InstancedBufferAttribute;
  /** each sheet's flare: how far it arcs outward (1 a crown's stroke, near 0 a plume's column) */
  private readonly hFl: THREE.InstancedBufferAttribute;
  /** streaks on the water alive: centre, heading, length, width, how they drift, age, life */
  private readonly foamList: { x: number; y: number; z: number; a: number; len: number; wid: number; vx: number; vz: number; age: number; life: number }[] = [];
  /** sheets of spray alive: base, which way out, height, width, age, life, a seed for its ragged top */
  private readonly sheetList: { x: number; y: number; z: number; a: number; h: number; w: number; age: number; life: number; seed: number; shed?: boolean; fl?: number }[] = [];
  /** dark swirls where a struck fish turned: centre, size, age, life, its turn over its life (rad, signed), a seed */
  private readonly swirls: THREE.InstancedMesh;
  private readonly wPos: THREE.InstancedBufferAttribute;
  private readonly wDat: THREE.InstancedBufferAttribute;
  private readonly swirlList: { x: number; y: number; z: number; size: number; age: number; life: number; spin: number; seed: number }[] = [];
  /** soft puffs of mist over a big splash: where, how big, age, life */
  private readonly mists: THREE.InstancedMesh;
  private readonly mPos: THREE.InstancedBufferAttribute;
  private readonly mDat: THREE.InstancedBufferAttribute;
  private readonly mistList: { x: number; y: number; z: number; size: number; age: number; life: number }[] = [];

  constructor() {
    const tex = atlas();
    // ---- shadows
    const quad = new THREE.PlaneGeometry(1, 1);
    quad.rotateX(-Math.PI / 2);
    const sg = new THREE.InstancedBufferGeometry();
    sg.index = quad.index;
    sg.setAttribute('position', quad.getAttribute('position'));
    sg.setAttribute('uv', quad.getAttribute('uv'));
    this.sPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHADOWS * 3), 3);
    this.sDir = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHADOWS * 4), 4);
    this.sDat = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHADOWS * 4), 4);
    sg.setAttribute('iPos', this.sPos);
    sg.setAttribute('iDir', this.sDir);
    sg.setAttribute('iDat', this.sDat);
    const sm = new THREE.ShaderMaterial({
      uniforms: { ...globals, uAtlas: { value: tex } },
      vertexShader: /* glsl */ `
        ${GLSL_VERTEX_PARS}
        attribute vec3 iPos;
        attribute vec4 iDir; // heading cos, sin, length, width
        attribute vec4 iDat; // alpha, shape, wag (< 0: a patch of water, flat and still), phase
        uniform float uTime;
        varying vec2 vUv;
        varying float vAlpha;
        varying float vShape;
        void main() {
          vUv = uv;
          vAlpha = iDat.x;
          vShape = iDat.y;
          // the tail half wags
          vec3 p = position;
          float tailw = clamp(0.5 - uv.x, 0.0, 1.0);
          float wag = max(0.0, iDat.z);
          p.z += step(0.0, iDat.z) * sin(uTime * (4.0 + wag * 6.0) + iDat.w) * 0.16 * tailw * tailw * min(1.0, wag + 0.15);
          vec2 xz = vec2(p.x * iDir.z, p.z * iDir.w);
          vec2 r = vec2(xz.x * iDir.x - xz.y * iDir.y, xz.x * iDir.y + xz.y * iDir.x);
          // seen from a jetty the water is seen at a slant: the shape leans toward the eye (its far side sinks) so it
          // keeps its outline instead of thinning to a sliver
          vec2 toEye = cameraPosition.xz - iPos.xz;
          float de = max(length(toEye), 1e-3);
          float lean = step(0.0, iDat.z) * -dot(r, toEye / de) * clamp(1.8 - de * 0.02, 0.6, 1.6);
          vec4 w = vec4(iPos.x + r.x, iPos.y + min(0.0, lean), iPos.z + r.y, 1.0);
          vPos = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `
        ${GLSL_FRAGMENT_PARS}
        ${GLSL_COMMON}
        uniform sampler2D uAtlas;
        varying vec2 vUv;
        varying float vAlpha;
        varying float vShape;
        void main() {
          #include <logdepthbuf_fragment>
          vec2 a = vec2((vShape + vUv.x) / 6.0, vUv.y);
          float m = texture2D(uAtlas, a).r;
          if (m < 0.02) discard;
          vec3 col = vec3(0.012, 0.03, 0.038) * rtGroundLight(0.6);
          gl_FragColor = vec4(col, m * vAlpha);
        }`,
    });
    maskPreservingBlend(sm);
    sm.depthTest = true;
    this.shadows = new THREE.InstancedMesh(sg, sm, MAX_SHADOWS);
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = 6;
    this.shadows.count = 0;
    this.group.add(this.shadows);
    // ---- rings
    const rq = new THREE.PlaneGeometry(1, 1);
    rq.rotateX(-Math.PI / 2);
    const rgeo = new THREE.InstancedBufferGeometry();
    rgeo.index = rq.index;
    rgeo.setAttribute('position', rq.getAttribute('position'));
    rgeo.setAttribute('uv', rq.getAttribute('uv'));
    this.rPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX_RINGS * 4), 4);
    this.rDat = new THREE.InstancedBufferAttribute(new Float32Array(MAX_RINGS * 4), 4);
    rgeo.setAttribute('iPos', this.rPos);
    rgeo.setAttribute('iDat', this.rDat);
    const rm = new THREE.ShaderMaterial({
      uniforms: { ...globals },
      vertexShader: /* glsl */ `
        ${GLSL_VERTEX_PARS}
        attribute vec4 iPos; // x y z, size
        attribute vec4 iDat; // age 0…1, tint, bold (1: a shock ring), -
        varying vec2 vUv;
        varying vec3 vDat;
        void main() {
          vUv = uv;
          vDat = iDat.xyz;
          float s = iPos.w * (0.25 + 0.75 * sqrt(iDat.x));
          vec4 w = vec4(iPos.x + position.x * s, iPos.y, iPos.z + position.z * s, 1.0);
          vPos = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `
        ${GLSL_FRAGMENT_PARS}
        ${GLSL_COMMON}
        varying vec2 vUv;
        varying vec3 vDat;
        vec3 tintOf(float t) {
          if (t < 0.5) return vec3(1.0);
          if (t < 1.5) return vec3(1.6, 1.15, 0.35);
          if (t < 2.5) return vec3(0.95, 0.92, 0.85);
          if (t < 3.5) return vec3(0.55, 1.0, 0.45);
          if (t < 4.5) return vec3(0.4, 0.7, 1.2);
          if (t < 5.5) return vec3(0.85, 0.5, 1.2);
          if (t < 6.5) return vec3(1.4, 1.0, 0.3);
          return vec3(1.3, 0.6, 1.1);
        }
        void main() {
          #include <logdepthbuf_fragment>
          float d = length(vUv - 0.5) * 2.0;
          if (vDat.z > 0.5) {
            // a shock ring: a broad hard band of white with a dark trough of lifted water just inside it, gone at once
            float fade = 1.0 - vDat.x;
            float aw = smoothstep(0.7, 0.8, d) * (1.0 - smoothstep(0.9, 1.0, d)) * fade;
            float ad = smoothstep(0.42, 0.62, d) * (1.0 - smoothstep(0.62, 0.74, d)) * fade * 0.45;
            float sa = aw + ad * (1.0 - aw);
            if (sa < 0.01) discard;
            vec3 white = uSunColor * 0.36 + uSkyColor * 1.3 + vec3(0.2);
            vec3 dark = vec3(0.02, 0.12, 0.16) * (0.4 + 0.6 * min(1.0, dot(uSkyColor, vec3(0.6))));
            gl_FragColor = vec4(mix(dark, white, aw / max(sa, 1e-3)), sa);
            return;
          }
          float ring = smoothstep(0.78, 0.9, d) * (1.0 - smoothstep(0.9, 1.0, d));
          float inner = smoothstep(0.5, 0.6, d) * (1.0 - smoothstep(0.6, 0.68, d)) * 0.5;
          float a = (ring + inner) * (1.0 - vDat.x) * 0.75;
          if (a < 0.01) discard;
          vec3 col = (uSunColor * 0.32 + uSkyColor * 0.9) * tintOf(vDat.y);
          gl_FragColor = vec4(col, a);
        }`,
    });
    maskPreservingBlend(rm);
    this.rings = new THREE.InstancedMesh(rgeo, rm, MAX_RINGS);
    this.rings.frustumCulled = false;
    this.rings.renderOrder = 7;
    this.rings.count = 0;
    this.group.add(this.rings);
    // ---- splashes: billboarded drops
    const dq = new THREE.PlaneGeometry(1, 1);
    const dgeo = new THREE.InstancedBufferGeometry();
    dgeo.index = dq.index;
    dgeo.setAttribute('position', dq.getAttribute('position'));
    dgeo.setAttribute('uv', dq.getAttribute('uv'));
    this.dPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DROPS * 4), 4);
    this.dDat = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DROPS * 4), 4);
    dgeo.setAttribute('iPos', this.dPos);
    dgeo.setAttribute('iDat', this.dDat);
    const dm = new THREE.ShaderMaterial({
      uniforms: { ...globals },
      vertexShader: /* glsl */ `
        ${GLSL_VERTEX_PARS}
        attribute vec4 iPos; // x y z size
        attribute vec4 iDat; // age 0…1, its velocity
        varying vec2 vUv;
        varying float vAge;
        void main() {
          vUv = uv;
          vAge = iDat.x;
          vec4 c = viewMatrix * vec4(iPos.xyz, 1.0);
          // (drawn out along the way it flies, the faster the longer: a drop, not a dot)
          vec3 v = mat3(viewMatrix) * iDat.yzw;
          float sp = length(v.xy);
          vec2 along = sp > 1e-4 ? v.xy / sp : vec2(0.0, 1.0);
          vec2 across = vec2(-along.y, along.x);
          float stretch = 1.0 + min(4.5, sp * 0.05 / max(iPos.w, 0.01));
          c.xy += across * position.x * iPos.w + along * position.y * iPos.w * stretch;
          vPos = iPos.xyz;
          gl_Position = projectionMatrix * c;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `
        ${GLSL_FRAGMENT_PARS}
        ${GLSL_COMMON}
        varying vec2 vUv;
        varying float vAge;
        void main() {
          #include <logdepthbuf_fragment>
          vec2 q = vUv * 2.0 - 1.0;
          float d = length(q);
          // (its head full and bright with a glint of the sky, its tail thinning out behind it)
          float a = (1.0 - smoothstep(0.78, 0.96, d)) * (1.0 - vAge * vAge) * (0.5 + 0.5 * smoothstep(-1.0, 0.3, q.y));
          if (a < 0.02) discard;
          vec3 col = mix(uSunColor * 0.45 + uSkyColor * 1.2 + vec3(0.12), uSkyColor * 0.8 + vec3(0.04, 0.1, 0.12), smoothstep(0.55, 0.85, d));
          col += vec3(0.32) * (1.0 - smoothstep(0.0, 0.3, length(q - vec2(-0.2, 0.45))));
          gl_FragColor = vec4(col, a * 0.95);
        }`,
    });
    maskPreservingBlend(dm);
    this.drops = new THREE.InstancedMesh(dgeo, dm, MAX_DROPS);
    this.drops.frustumCulled = false;
    this.drops.renderOrder = 8;
    this.drops.count = 0;
    this.group.add(this.drops);
    // ---- streaks of white water on the surface: a lozenge drawn along its heading, crisp, a cool edge round it
    const fq = new THREE.PlaneGeometry(1, 1);
    fq.rotateX(-Math.PI / 2);
    const fgeo = new THREE.InstancedBufferGeometry();
    fgeo.index = fq.index;
    fgeo.setAttribute('position', fq.getAttribute('position'));
    fgeo.setAttribute('uv', fq.getAttribute('uv'));
    this.fPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FOAM * 4), 4);
    this.fDir = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FOAM * 4), 4);
    fgeo.setAttribute('iPos', this.fPos);
    fgeo.setAttribute('iDir', this.fDir);
    const fm = new THREE.ShaderMaterial({
      uniforms: { ...globals },
      vertexShader: /* glsl */ `
        ${GLSL_VERTEX_PARS}
        attribute vec4 iPos; // x y z, length
        attribute vec4 iDir; // heading cos, sin, width, age 0…1
        varying vec2 vUv;
        varying float vAge;
        void main() {
          vUv = uv;
          vAge = iDir.w;
          // (it opens out as it ages: longer, a little wider)
          float grow = 0.55 + 0.45 * sqrt(iDir.w);
          vec2 xz = vec2(position.x * iPos.w * grow, position.z * iDir.z * (0.8 + 0.5 * iDir.w));
          vec2 r = vec2(xz.x * iDir.x - xz.y * iDir.y, xz.x * iDir.y + xz.y * iDir.x);
          vec4 w = vec4(iPos.x + r.x, iPos.y + 0.02, iPos.z + r.y, 1.0);
          vPos = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `
        ${GLSL_FRAGMENT_PARS}
        ${GLSL_COMMON}
        varying vec2 vUv;
        varying float vAge;
        void main() {
          #include <logdepthbuf_fragment>
          // a lozenge along x (the head end fuller), its half-width at each place along it
          vec2 q = vUv * 2.0 - 1.0;
          float hw = pow(max(0.0, 1.0 - q.x * q.x), 0.75) * (1.0 + 0.25 * q.x);
          float d = abs(q.y) / max(hw, 1e-3);
          if (d > 1.0) discard;
          float edge = smoothstep(0.6, 0.74, d);
          vec3 white = uSunColor * 0.34 + uSkyColor * 1.25 + vec3(0.18);
          // (inked round in a deep teal, the cel look: white water stands off the bright lake and its own foam)
          vec3 cool = vec3(0.02, 0.17, 0.22) * (0.35 + 0.65 * min(1.0, dot(uSkyColor, vec3(0.6))));
          float a = (1.0 - vAge * vAge) * 0.95;
          gl_FragColor = vec4(mix(white, cool, edge), a);
        }`,
    });
    maskPreservingBlend(fm);
    this.foams = new THREE.InstancedMesh(fgeo, fm, MAX_FOAM);
    this.foams.frustumCulled = false;
    this.foams.renderOrder = 7;
    this.foams.count = 0;
    this.group.add(this.foams);
    // ---- sheets of spray: blades stood up out of the water, leaning out, turned to the eye; ragged at the top
    const hq = new THREE.PlaneGeometry(1, 1);
    const hgeo = new THREE.InstancedBufferGeometry();
    hgeo.index = hq.index;
    hgeo.setAttribute('position', hq.getAttribute('position'));
    hgeo.setAttribute('uv', hq.getAttribute('uv'));
    this.hPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHEETS * 4), 4);
    this.hDir = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHEETS * 4), 4);
    this.hFl = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHEETS), 1);
    hgeo.setAttribute('iPos', this.hPos);
    hgeo.setAttribute('iDir', this.hDir);
    hgeo.setAttribute('iFlare', this.hFl);
    const hm = new THREE.ShaderMaterial({
      uniforms: { ...globals },
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        ${GLSL_VERTEX_PARS}
        attribute vec4 iPos; // base x y z, height at its full
        attribute vec4 iDir; // out: cos, sin; width; age 0…1 (+ the seed, a whole number)
        attribute float iFlare; // how far it arcs outward: 1 a crown's stroke, near 0 a plume's column
        varying vec2 vUv;
        varying float vAge;
        varying float vSeed;
        void main() {
          vUv = uv;
          float age = fract(iDir.w);
          vAge = age;
          vSeed = floor(iDir.w);
          // up fast, then down under its own weight
          float up = sin(min(1.0, age * 2.4) * 1.5708);
          float h = iPos.w * up * (1.0 - age * age * age);
          vec3 out3 = vec3(iDir.x, 0.0, iDir.y);
          vec3 right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
          float y = uv.y;
          float lean = (fract(vSeed * 0.618) - 0.5) * 1.1 * min(1.0, iFlare + 0.3);
          // (a stroke of water flung out: it arcs over outward the higher it goes, and swells a little in its middle)
          float swell = 0.75 + 0.5 * sin(y * 3.1416);
          vec3 p = iPos.xyz + vec3(0.0, y * h, 0.0) + out3 * (y * y * h * 0.8 + age * iPos.w * 0.35) * iFlare + right * ((uv.x - 0.5) * iDir.z * swell + lean * y * y * h);
          vec4 w = vec4(p, 1.0);
          vPos = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `
        ${GLSL_FRAGMENT_PARS}
        ${GLSL_COMMON}
        varying vec2 vUv;
        varying float vAge;
        varying float vSeed;
        void main() {
          #include <logdepthbuf_fragment>
          // a stroke of water: pointed at its tip, its foot thinning into the water; as it falls its top breaks up
          float q = abs(vUv.x - 0.5) * 2.0;
          float top = 1.0 - 0.3 * vAge;
          if (vUv.y > top) discard;
          float u = vUv.y / top;
          float hw = pow(max(0.0, 1.0 - u), 0.6) * smoothstep(0.0, 0.22, u + 0.06);
          float d = q / max(hw, 1e-3);
          if (d > 1.0) discard;
          // (broken into drops toward its tip as it ages)
          float bits = fract(sin(floor(vUv.y * 26.0) * 12.9898 + vSeed * 78.233) * 43758.5453);
          if (u > 0.55 && bits < (u - 0.55) * 2.2 * (0.25 + vAge)) discard;
          float edge = smoothstep(0.62, 0.86, d);
          vec3 white = uSunColor * 0.36 + uSkyColor * 1.3 + vec3(0.2);
          vec3 cool = vec3(0.02, 0.17, 0.22) * (0.35 + 0.65 * min(1.0, dot(uSkyColor, vec3(0.6))));
          vec3 col = mix(mix(white, uSkyColor * 0.9 + vec3(0.08, 0.16, 0.18), 0.3 * (1.0 - u)), cool, edge * 0.8);
          // (a bright core up its middle, faint strands of water along it)
          col += vec3(0.16) * (1.0 - smoothstep(0.0, 0.42, d)) * (1.0 - 0.5 * u);
          col *= 0.94 + 0.06 * sin(vUv.x * 41.0 + vSeed * 3.0 + u * 5.0);
          // (its foot melting into the water, no hard line where it stands)
          float a = (1.0 - smoothstep(0.5, 1.0, vAge)) * 0.95 * smoothstep(0.0, 0.14, u);
          gl_FragColor = vec4(col, a);
        }`,
    });
    maskPreservingBlend(hm);
    this.sheets = new THREE.InstancedMesh(hgeo, hm, MAX_SHEETS);
    this.sheets.frustumCulled = false;
    this.sheets.renderOrder = 9;
    this.sheets.count = 0;
    this.group.add(this.sheets);
    // ---- mist: soft puffs over a big splash, swelling and thinning away
    const mq = new THREE.PlaneGeometry(1, 1);
    const mgeo = new THREE.InstancedBufferGeometry();
    mgeo.index = mq.index;
    mgeo.setAttribute('position', mq.getAttribute('position'));
    mgeo.setAttribute('uv', mq.getAttribute('uv'));
    this.mPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX_MIST * 4), 4);
    this.mDat = new THREE.InstancedBufferAttribute(new Float32Array(MAX_MIST), 1);
    mgeo.setAttribute('iPos', this.mPos);
    mgeo.setAttribute('iDat', this.mDat);
    const mm = new THREE.ShaderMaterial({
      uniforms: { ...globals },
      vertexShader: /* glsl */ `
        ${GLSL_VERTEX_PARS}
        attribute vec4 iPos; // x y z size
        attribute float iDat; // age 0…1
        varying vec2 vUv;
        varying float vAge;
        void main() {
          vUv = uv;
          vAge = iDat;
          vec4 c = viewMatrix * vec4(iPos.xyz + vec3(0.0, 0.35 * iDat * iPos.w, 0.0), 1.0);
          c.xy += position.xy * iPos.w * (0.55 + 0.9 * sqrt(iDat));
          vPos = iPos.xyz;
          gl_Position = projectionMatrix * c;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `
        ${GLSL_FRAGMENT_PARS}
        ${GLSL_COMMON}
        varying vec2 vUv;
        varying float vAge;
        void main() {
          #include <logdepthbuf_fragment>
          float d = length(vUv - 0.5) * 2.0;
          float f = max(0.0, 1.0 - d * d);
          float a = f * f * 0.26 * (1.0 - vAge) * (1.0 - vAge) * smoothstep(0.0, 0.12, vAge);
          if (a < 0.01) discard;
          gl_FragColor = vec4(uSunColor * 0.28 + uSkyColor * 1.05 + vec3(0.08), a);
        }`,
    });
    maskPreservingBlend(mm);
    this.mists = new THREE.InstancedMesh(mgeo, mm, MAX_MIST);
    this.mists.frustumCulled = false;
    this.mists.renderOrder = 10;
    this.mists.count = 0;
    this.group.add(this.mists);
    // ---- swirls: a dark disc of water turned over where a struck fish wrenched round, two arms wound into it, a thin
    // foam on their crests; it turns, spreads and is gone in about a second
    const wq = new THREE.PlaneGeometry(1, 1);
    wq.rotateX(-Math.PI / 2);
    const wgeo = new THREE.InstancedBufferGeometry();
    wgeo.index = wq.index;
    wgeo.setAttribute('position', wq.getAttribute('position'));
    wgeo.setAttribute('uv', wq.getAttribute('uv'));
    this.wPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SWIRLS * 4), 4);
    this.wDat = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SWIRLS * 4), 4);
    wgeo.setAttribute('iPos', this.wPos);
    wgeo.setAttribute('iDat', this.wDat);
    const wm = new THREE.ShaderMaterial({
      uniforms: { ...globals },
      vertexShader: /* glsl */ `
        ${GLSL_VERTEX_PARS}
        attribute vec4 iPos; // x y z, size
        attribute vec4 iDat; // age 0…1, its turn over its life (rad, signed), seed, -
        varying vec2 vUv;
        varying vec3 vDat;
        void main() {
          vUv = uv;
          vDat = iDat.xyz;
          float s = iPos.w * (0.75 + 0.45 * sqrt(iDat.x));
          vec4 w = vec4(iPos.x + position.x * s, iPos.y + 0.012, iPos.z + position.z * s, 1.0);
          vPos = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `
        ${GLSL_FRAGMENT_PARS}
        ${GLSL_COMMON}
        varying vec2 vUv;
        varying vec3 vDat;
        void main() {
          #include <logdepthbuf_fragment>
          vec2 q = vUv * 2.0 - 1.0;
          float r = length(q);
          if (r > 1.0) discard;
          float age = vDat.x;
          // (it turns quick at first, slowing)
          float turn = vDat.y * (1.0 - (1.0 - age) * (1.0 - age));
          float arm = 0.5 + 0.5 * sin(2.0 * (atan(q.y, q.x) + turn) - sign(vDat.y) * r * 8.0 + vDat.z);
          float env = smoothstep(0.0, 0.06, age) * (1.0 - age * age);
          float disc = 1.0 - smoothstep(0.35, 1.0, r);
          float crest = smoothstep(0.84, 0.97, arm) * smoothstep(0.12, 0.35, r) * (1.0 - smoothstep(0.65, 0.95, r));
          vec3 dark = vec3(0.008, 0.04, 0.055) * rtGroundLight(0.6);
          vec3 white = uSunColor * 0.3 + uSkyColor * 1.2 + vec3(0.15);
          float a = max(disc * (0.5 + 0.38 * (1.0 - arm)), crest * 0.8) * env;
          if (a < 0.01) discard;
          gl_FragColor = vec4(mix(dark, white, crest * 0.85), a);
        }`,
    });
    maskPreservingBlend(wm);
    this.swirls = new THREE.InstancedMesh(wgeo, wm, MAX_SWIRLS);
    this.swirls.frustumCulled = false;
    this.swirls.renderOrder = 6;
    this.swirls.count = 0;
    this.group.add(this.swirls);
  }

  /** a dark swirl on the water (render space) where a fish wrenched round: its size across, life, its turn (rad, signed) */
  swirl(x: number, y: number, z: number, size: number, life = 1.1, spin = 3): void {
    if (this.swirlList.length >= MAX_SWIRLS) this.swirlList.shift();
    this.swirlList.push({ x, y, z, size, age: 0, life, spin, seed: Math.random() * 6.28 });
  }

  /**
   * The strike, where the fish is (render space; the user's word of 2026-11-24: the water must answer the hook going
   * home): a tall plume up its middle and a wide crown flung outward round it, a fast shock ring and a slower one after
   * it, a dark swirl where it turned, foam lying round, a burst of drops, and drops flung off the line as it rips taut
   * toward `tip` (the rod's tip, render space). `k` how big the fish (0.3 … 1.6); `size` the crown's width and `h` the
   * plume's height (m), kept to a share of the view by the caller, clear of the gauges
   */
  strike(x: number, y: number, z: number, k: number, size: number, h: number, tip: { x: number; y: number; z: number } | null): void {
    this.plume(x, y, z, h, k);
    // the crown: strokes of water round a wide circle, flung hard outward
    const n = Math.round(12 + 10 * k);
    const off = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      if (this.sheetList.length >= MAX_SHEETS) this.sheetList.shift();
      const a = off + (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const rr = size * (0.28 + 0.22 * Math.random());
      this.sheetList.push({ x: x + Math.cos(a) * rr, y: y + 0.01, z: z + Math.sin(a) * rr, a, h: size * (0.45 + 0.55 * Math.random()), w: size * (0.07 + 0.07 * Math.random()), age: 0, life: 0.7 + 0.25 * Math.random(), seed: Math.floor(Math.random() * 9), fl: 1.6 });
    }
    // a shock ring gone in half a second, a slower one spreading after it
    this.ring(x, y, z, size * 3.4, 0.5, 0, 1);
    this.ring(x, y, z, size * 5.8, 2.1);
    // where it wrenched round: a dark swirl
    this.swirl(x, y, z, size * 2, 1.3 + 0.4 * k, (Math.random() < 0.5 ? -1 : 1) * (2.4 + 1.2 * k));
    // foam lying round it, drifting out
    const nf = Math.round(8 + 8 * k);
    for (let i = 0; i < nf; i++) {
      const a = (i / nf) * Math.PI * 2 + Math.random() * 0.6;
      const r = size * (0.35 + 0.5 * Math.random());
      this.streak(x + Math.cos(a) * r, y, z + Math.sin(a) * r, a + Math.PI / 2, size * (0.35 + 0.35 * Math.random()), size * (0.06 + 0.05 * Math.random()), 1.5 + 0.8 * Math.random(), -(0.3 + 0.5 * Math.random()) * k);
    }
    // a burst of drops thrown up and out
    const nd = Math.round(26 + 40 * k);
    for (let i = 0; i < nd; i++) {
      if (this.dropList.length >= MAX_DROPS) this.dropList.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = (0.8 + 2.2 * Math.random()) * (0.6 + 0.5 * k);
      this.dropList.push({ x: x + Math.cos(a) * size * 0.15, y: y + 0.03, z: z + Math.sin(a) * size * 0.15, vx: Math.cos(a) * sp, vy: (2 + 3.5 * Math.random()) * (0.7 + 0.4 * k), vz: Math.sin(a) * sp, age: 0, life: 0.7 + 0.5 * Math.random(), size: (0.03 + 0.05 * Math.random()) * (0.6 + 0.4 * k) });
    }
    if (tip) this.lineSpray(x, y, z, tip, k);
  }

  /**
   * Drops flung off the line as it rips taut out of the water (render space): from the fish (x, y, z) up along the line
   * toward `tip`, the most near the water, thrown up and across it; and a white cut on the water where it tore up toward
   * the angler; k how hard
   */
  lineSpray(x: number, y: number, z: number, tip: { x: number; y: number; z: number }, k: number): void {
    const lx = tip.x - x;
    const ly = tip.y - y;
    const lz = tip.z - z;
    const len = Math.hypot(lx, ly, lz);
    const hl = Math.hypot(lx, lz);
    if (len < 0.5 || hl < 0.3) return;
    // (across the line, on the level)
    const cx = -lz / hl;
    const cz = lx / hl;
    const n = Math.round(24 + 36 * k);
    for (let i = 0; i < n; i++) {
      if (this.dropList.length >= MAX_DROPS) this.dropList.shift();
      const t = 0.03 + 0.72 * Math.pow(Math.random(), 1.4);
      const side = (Math.random() - 0.5) * 2;
      const along = 0.5 + 1.2 * Math.random();
      this.dropList.push({
        x: x + lx * t,
        y: y + ly * t + 0.02,
        z: z + lz * t,
        vx: cx * side * 0.9 + (lx / len) * along,
        vy: (1.2 + 2.2 * Math.random()) * (0.6 + 0.4 * k) * (1 - 0.5 * t),
        vz: cz * side * 0.9 + (lz / len) * along,
        age: 0,
        life: 0.55 + 0.45 * Math.random(),
        // (bigger far out, where they are small to the eye; fine near the tip)
        size: (0.03 + 0.035 * Math.random()) * (1.5 - 1.1 * t) * (0.7 + 0.3 * k),
      });
    }
    // (the cut across the water, a few metres of it toward the angler: a white streak, low blades of spray stood up
    // across it as the line tears out)
    const head = Math.atan2(lz, lx);
    const run = Math.min(hl * 0.35, 1.2 + 2.2 * k);
    for (let j = 0; j < 3; j++) {
      const u = ((j + 0.5) / 3) * run;
      this.streak(x + Math.cos(head) * u, y, z + Math.sin(head) * u, head, (run / 3) * 1.2, 0.05 + 0.04 * k, 0.55 + 0.15 * j, (Math.random() - 0.5) * 0.3);
    }
    const nb = Math.round(3 + 2 * k);
    for (let j = 0; j < nb; j++) {
      if (this.sheetList.length >= MAX_SHEETS) this.sheetList.shift();
      const u = ((j + 0.3 + 0.4 * Math.random()) / nb) * run;
      const a = head + (j % 2 ? 1 : -1) * Math.PI * 0.5;
      this.sheetList.push({ x: x + Math.cos(head) * u, y: y + 0.01, z: z + Math.sin(head) * u, a, h: (0.25 + 0.25 * Math.random()) * (0.6 + 0.4 * k) * (1 - (0.5 * u) / Math.max(run, 1e-3)), w: 0.06 + 0.05 * k, age: 0, life: 0.4 + 0.15 * Math.random(), seed: Math.floor(Math.random() * 9), fl: 0.7 });
    }
  }

  /** a streak of white water (render space): its centre, heading (rad, as the world's: +x is 0, toward +z), length, width, life */
  streak(x: number, y: number, z: number, heading: number, len: number, wid: number, life = 0.9, drift = 0): void {
    if (this.foamList.length >= MAX_FOAM) this.foamList.shift();
    this.foamList.push({ x, y, z, a: heading, len, wid, vx: Math.cos(heading + Math.PI / 2) * drift, vz: Math.sin(heading + Math.PI / 2) * drift, age: 0, life });
  }

  /**
   * The wake behind a fish running at the surface (render space): a V whose point is at its head, two thin streaks
   * running back and out from there and opening as they age — the way it goes is where the V points, as DREADMOOR's
   * wake shows it (docs/V3/plan/fishing-feel.md §7); `k` how hard it goes (0 … 1.5), `len` its length (m)
   */
  wake(x: number, y: number, z: number, heading: number, len: number, k: number): void {
    const sl = (1.1 + 1.9 * len) * (0.7 + 0.5 * k);
    const sw = (0.05 + 0.08 * len) * (0.8 + 0.4 * k);
    const hx = x + Math.cos(heading) * len * 0.35;
    const hz = z + Math.sin(heading) * len * 0.35;
    for (const sgn of [-1, 1]) {
      const back = heading + Math.PI + sgn * (0.42 + 0.08 * k);
      // (the streak's fuller end at the head)
      this.streak(hx + Math.cos(back) * sl * 0.5, y, hz + Math.sin(back) * sl * 0.5, back + Math.PI, sl, sw, 0.8 + 0.35 * k, sgn * (0.2 + 0.25 * k));
    }
  }

  /** the white water churned up round a fish fighting at the surface (render space): a few short streaks about it */
  churn(x: number, y: number, z: number, len: number, k: number): void {
    const n = k > 0.8 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = len * (0.25 + 0.4 * Math.random());
      this.streak(x + Math.cos(a) * r, y, z + Math.sin(a) * r, a + Math.PI / 2 + (Math.random() - 0.5), (0.5 + 1.3 * len) * (0.7 + 0.4 * k), 0.07 + 0.12 * len, 0.55 + 0.25 * Math.random(), 0.3);
    }
  }

  /**
   * A plume of water shot straight up where the line jerks the fish at the strike (render space), `h` high: a column of
   * tall strokes close together standing nearly upright, drops shot up its middle as high and falling back round it,
   * mist hanging at its head; k how big the fish
   */
  plume(x: number, y: number, z: number, h: number, k = 1): void {
    const n = Math.round(6 + 5 * k);
    const off = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      if (this.sheetList.length >= MAX_SHEETS) this.sheetList.shift();
      const a = off + (i / n) * Math.PI * 2;
      const r = h * 0.03 * Math.random();
      this.sheetList.push({ x: x + Math.cos(a) * r, y: y + 0.01, z: z + Math.sin(a) * r, a, h: h * (0.6 + 0.45 * Math.random()), w: h * (0.06 + 0.05 * Math.random()), age: 0, life: 0.8 + 0.3 * Math.random(), seed: Math.floor(Math.random() * 9), fl: 0.1 + 0.15 * Math.random() });
    }
    const vt = Math.sqrt(2 * 9.8 * h);
    const nd = Math.round(18 + 22 * k);
    for (let i = 0; i < nd; i++) {
      if (this.dropList.length >= MAX_DROPS) this.dropList.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = 0.2 + 0.9 * Math.random();
      this.dropList.push({ x, y: y + 0.05, z, vx: Math.cos(a) * sp, vy: vt * (0.55 + 0.5 * Math.random()), vz: Math.sin(a) * sp, age: 0, life: 0.9 + 0.5 * Math.random(), size: 0.04 + 0.06 * Math.random() * (0.5 + 0.5 * k) });
    }
    this.mist(x, y + h * 0.5, z, h * 0.7, 3 + Math.round(2 * k), 1.3);
  }

  /** soft puffs of mist over a splash (render space): n of them about a point, `size` across */
  mist(x: number, y: number, z: number, size: number, n = 3, life = 0.9): void {
    for (let i = 0; i < n; i++) {
      if (this.mistList.length >= MAX_MIST) this.mistList.shift();
      const a = Math.random() * Math.PI * 2;
      const r = size * 0.3 * Math.random();
      this.mistList.push({ x: x + Math.cos(a) * r, y: y + size * 0.15 * Math.random(), z: z + Math.sin(a) * r, size: size * (0.7 + 0.6 * Math.random()), age: 0, life: life * (0.8 + 0.4 * Math.random()) });
    }
  }

  /** drops alone, thrown up from a point (render space): water streaming off a fish in the air */
  spray(x: number, y: number, z: number, n: number, speed: number): void {
    for (let i = 0; i < n; i++) {
      if (this.dropList.length >= MAX_DROPS) this.dropList.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.3 + Math.random());
      this.dropList.push({ x, y, z, vx: Math.cos(a) * sp * 0.5, vy: sp * 0.6, vz: Math.sin(a) * sp * 0.5, age: 0, life: 0.5 + Math.random() * 0.4, size: 0.04 + 0.05 * Math.random() });
    }
  }

  /**
   * A crown of spray thrown up (render space): about n streaks of water round a circle `size` across, up to about `size`
   * high — thin as brush strokes, flung out and up like petals, as DREADMOOR's are (docs/V3/plan/fishing-feel.md §7),
   * not broad sheets. Given a heading (`toward`, as the world's), a fan flung that way instead of a ring: a fish
   * surging off, turning, bolting throws its water the way it goes
   */
  crown(x: number, y: number, z: number, size: number, n = 7, life = 0.75, toward = NaN): void {
    const r = size * 0.22;
    const fan = !Number.isNaN(toward);
    const off = fan ? toward : Math.random() * Math.PI * 2;
    n = Math.round(n * 1.3);
    for (let i = 0; i < n; i++) {
      if (this.sheetList.length >= MAX_SHEETS) this.sheetList.shift();
      const a = fan ? toward + (Math.random() - 0.5) * 1.8 : off + (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.9;
      const rr = r * (0.5 + Math.random());
      this.sheetList.push({
        x: x + Math.cos(a) * rr,
        y: y + 0.01,
        z: z + Math.sin(a) * rr,
        a,
        h: size * (0.4 + 1.05 * Math.random() * Math.random() + 0.25 * Math.random()),
        w: size * (0.08 + 0.1 * Math.random()),
        age: 0,
        life: life * (0.85 + 0.3 * Math.random()),
        seed: Math.floor(Math.random() * 9),
      });
    }
    // (a big one hangs a little mist over it)
    if (size >= 0.6) this.mist(x, y + size * 0.4, z, size * 0.9, fan ? 2 : 3, life * 1.2);
    // (and its foam, lying round where it fell)
    for (let i = 0; i < Math.max(3, Math.round(n * 0.6)); i++) {
      const a = fan ? toward + (Math.random() - 0.5) * 1.8 : off + (i / n) * Math.PI * 2;
      this.streak(x + Math.cos(a) * r * 1.6, y, z + Math.sin(a) * r * 1.6, a + Math.PI / 2, size * 0.7, size * 0.12, 1.1, 0.4);
    }
  }

  /** set this frame's shadows (render space) */
  setShadows(list: readonly ShadowSpec[]): void {
    const n = Math.min(MAX_SHADOWS, list.length);
    const p = this.sPos.array as Float32Array;
    const d = this.sDir.array as Float32Array;
    const a = this.sDat.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const s = list[i];
      p[i * 3] = s.x;
      p[i * 3 + 1] = s.y;
      p[i * 3 + 2] = s.z;
      // (the atlas's head is at +x: the heading turns +x onto the fish's way)
      d[i * 4] = Math.cos(s.heading);
      d[i * 4 + 1] = Math.sin(s.heading);
      d[i * 4 + 2] = s.len;
      d[i * 4 + 3] = s.wid;
      a[i * 4] = s.alpha;
      a[i * 4 + 1] = s.shape;
      a[i * 4 + 2] = s.wag;
      a[i * 4 + 3] = s.phase;
    }
    this.sPos.needsUpdate = true;
    this.sDir.needsUpdate = true;
    this.sDat.needsUpdate = true;
    this.shadows.count = n;
  }

  /** a ring on the water (render space); bold 1: a shock ring, a broad band of white with a dark trough inside it */
  ring(x: number, y: number, z: number, size: number, life = 1.6, tint = 0, bold = 0): void {
    if (this.ringList.length >= MAX_RINGS) this.ringList.shift();
    this.ringList.push({ x, y, z, age: 0, life, size, tint, bold });
  }

  /** a splash: drops thrown up and a ring or two */
  splash(x: number, y: number, z: number, k: number, tint = 0): void {
    const n = Math.round(10 + 26 * k);
    for (let i = 0; i < n; i++) {
      if (this.dropList.length >= MAX_DROPS) this.dropList.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = (0.4 + Math.random() * 1.4) * (0.6 + k);
      this.dropList.push({ x, y: y + 0.02, z, vx: Math.cos(a) * sp * 0.6, vy: 1.2 + Math.random() * 2.2 * (0.5 + k), vz: Math.sin(a) * sp * 0.6, age: 0, life: 0.6 + Math.random() * 0.5, size: 0.03 + 0.05 * Math.random() * (0.5 + k) });
    }
    this.ring(x, y, z, 0.8 + 1.8 * k, 1.4, tint);
    if (k > 0.5) this.ring(x, y, z, 1.4 + 2.4 * k, 2.2, tint);
  }

  update(dt: number): void {
    // rings
    let n = 0;
    const rp = this.rPos.array as Float32Array;
    const rd = this.rDat.array as Float32Array;
    for (let i = this.ringList.length - 1; i >= 0; i--) {
      const r = this.ringList[i];
      r.age += dt / r.life;
      if (r.age >= 1) {
        this.ringList.splice(i, 1);
        continue;
      }
    }
    for (const r of this.ringList) {
      rp[n * 4] = r.x;
      rp[n * 4 + 1] = r.y + 0.015;
      rp[n * 4 + 2] = r.z;
      rp[n * 4 + 3] = r.size;
      rd[n * 4] = r.age;
      rd[n * 4 + 1] = r.tint;
      rd[n * 4 + 2] = r.bold;
      n++;
    }
    this.rPos.needsUpdate = true;
    this.rDat.needsUpdate = true;
    this.rings.count = n;
    // drops
    let m = 0;
    const dp = this.dPos.array as Float32Array;
    const dd = this.dDat.array as Float32Array;
    for (let i = this.dropList.length - 1; i >= 0; i--) {
      const d = this.dropList[i];
      d.age += dt / d.life;
      d.vy -= 9.8 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      if (d.age >= 1) this.dropList.splice(i, 1);
    }
    for (const d of this.dropList) {
      dp[m * 4] = d.x;
      dp[m * 4 + 1] = d.y;
      dp[m * 4 + 2] = d.z;
      dp[m * 4 + 3] = d.size;
      dd[m * 4] = d.age;
      dd[m * 4 + 1] = d.vx;
      dd[m * 4 + 2] = d.vy;
      dd[m * 4 + 3] = d.vz;
      m++;
    }
    this.dPos.needsUpdate = true;
    this.dDat.needsUpdate = true;
    this.drops.count = m;
    // streaks: they drift apart and fade
    let k = 0;
    const fp = this.fPos.array as Float32Array;
    const fd = this.fDir.array as Float32Array;
    for (let i = this.foamList.length - 1; i >= 0; i--) {
      const f = this.foamList[i];
      f.age += dt / f.life;
      f.x += f.vx * dt;
      f.z += f.vz * dt;
      if (f.age >= 1) this.foamList.splice(i, 1);
    }
    for (const f of this.foamList) {
      fp[k * 4] = f.x;
      fp[k * 4 + 1] = f.y;
      fp[k * 4 + 2] = f.z;
      fp[k * 4 + 3] = f.len;
      fd[k * 4] = Math.cos(f.a);
      fd[k * 4 + 1] = Math.sin(f.a);
      fd[k * 4 + 2] = f.wid;
      fd[k * 4 + 3] = f.age;
      k++;
    }
    this.fPos.needsUpdate = true;
    this.fDir.needsUpdate = true;
    this.foams.count = k;
    // sheets of spray: up and back down
    let h = 0;
    const hp = this.hPos.array as Float32Array;
    const hd = this.hDir.array as Float32Array;
    const hf = this.hFl.array as Float32Array;
    for (let i = this.sheetList.length - 1; i >= 0; i--) {
      const sh = this.sheetList[i];
      sh.age += dt / sh.life;
      // (as it turns over to fall its tip breaks into drops, flung on out)
      if (!sh.shed && sh.age > 0.42) {
        sh.shed = true;
        const ca = Math.cos(sh.a);
        const sa = Math.sin(sh.a);
        const out = sh.h * 0.95;
        for (let j = 0; j < 2; j++) {
          if (this.dropList.length >= MAX_DROPS) this.dropList.shift();
          const sp = 0.8 + 1.4 * Math.random();
          this.dropList.push({ x: sh.x + ca * out, y: sh.y + sh.h * 0.9, z: sh.z + sa * out, vx: ca * sp + (Math.random() - 0.5) * 0.6, vy: 0.4 + Math.random(), vz: sa * sp + (Math.random() - 0.5) * 0.6, age: 0, life: 0.45 + 0.3 * Math.random(), size: Math.min(0.07, 0.02 + sh.w * 0.18) });
        }
      }
      if (sh.age >= 1) this.sheetList.splice(i, 1);
    }
    for (const sh of this.sheetList) {
      hp[h * 4] = sh.x;
      hp[h * 4 + 1] = sh.y;
      hp[h * 4 + 2] = sh.z;
      hp[h * 4 + 3] = sh.h;
      hd[h * 4] = Math.cos(sh.a);
      hd[h * 4 + 1] = Math.sin(sh.a);
      hd[h * 4 + 2] = sh.w;
      hd[h * 4 + 3] = Math.min(0.999, sh.age) + sh.seed;
      hf[h] = sh.fl ?? 1;
      h++;
    }
    this.hPos.needsUpdate = true;
    this.hDir.needsUpdate = true;
    this.hFl.needsUpdate = true;
    this.sheets.count = h;
    // swirls: turning, spreading, gone
    let sw = 0;
    const wp = this.wPos.array as Float32Array;
    const wd = this.wDat.array as Float32Array;
    for (let i = this.swirlList.length - 1; i >= 0; i--) {
      const s = this.swirlList[i];
      s.age += dt / s.life;
      if (s.age >= 1) this.swirlList.splice(i, 1);
    }
    for (const s of this.swirlList) {
      wp[sw * 4] = s.x;
      wp[sw * 4 + 1] = s.y;
      wp[sw * 4 + 2] = s.z;
      wp[sw * 4 + 3] = s.size;
      wd[sw * 4] = s.age;
      wd[sw * 4 + 1] = s.spin;
      wd[sw * 4 + 2] = s.seed;
      sw++;
    }
    this.wPos.needsUpdate = true;
    this.wDat.needsUpdate = true;
    this.swirls.count = sw;
    // mist: swelling, rising a little, thinning away
    let q = 0;
    const mp = this.mPos.array as Float32Array;
    const md = this.mDat.array as Float32Array;
    for (let i = this.mistList.length - 1; i >= 0; i--) {
      const mi = this.mistList[i];
      mi.age += dt / mi.life;
      if (mi.age >= 1) this.mistList.splice(i, 1);
    }
    for (const mi of this.mistList) {
      mp[q * 4] = mi.x;
      mp[q * 4 + 1] = mi.y;
      mp[q * 4 + 2] = mi.z;
      mp[q * 4 + 3] = mi.size;
      md[q] = mi.age;
      q++;
    }
    this.mPos.needsUpdate = true;
    this.mDat.needsUpdate = true;
    this.mists.count = q;
  }

  /** the render origin moved by (dx, dy, dz): what is alive moves with it */
  rebase(dx: number, dy: number, dz: number): void {
    for (const r of this.ringList) {
      r.x -= dx;
      r.y -= dy;
      r.z -= dz;
    }
    for (const d of this.dropList) {
      d.x -= dx;
      d.y -= dy;
      d.z -= dz;
    }
    for (const f of this.foamList) {
      f.x -= dx;
      f.y -= dy;
      f.z -= dz;
    }
    for (const sh of this.sheetList) {
      sh.x -= dx;
      sh.y -= dy;
      sh.z -= dz;
    }
    for (const mi of this.mistList) {
      mi.x -= dx;
      mi.y -= dy;
      mi.z -= dz;
    }
    for (const s of this.swirlList) {
      s.x -= dx;
      s.y -= dy;
      s.z -= dz;
    }
  }
}
