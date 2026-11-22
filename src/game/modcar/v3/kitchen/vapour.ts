/**
 * Steam and smoke over a vessel, and the stove's glow at night (docs/V3/plan/cooking.md §5 "蒸汽和油烟").
 *
 * The vapour is a stream of soft puffs rising from where the food is, drawn as the garage's chimney smoke is
 * (garageSmoke.ts: a puff's brush-broken edge, lit by the sky and the sun, fogged, blended over the frame with its ink
 * ids left alone), its amount, colour and rise the cooking's: a pot coming to the boil steams more and more, white; a
 * pan frying sends up a pale haze that thickens and greys as it goes over, black once it burns. Less of it is fewer
 * puffs (each has its threshold), so a wisp is a wisp and not a faint cloud. Inside a vehicle it does not lean with
 * the wind.
 *
 * The glow is light added where the flame is — a soft halo round the burner, a pool of it on what the stove stands on —
 * a little by day, more as night falls (the night of the weather's uniform): the colour of a gas flame, warmed.
 */
import * as THREE from 'three';
import { GLSL_COMMON, globals } from '../../../render/shaderlib';

/** light added on top, the alpha under it (the ink ids) left as it was */
export function addLight<M extends THREE.Material>(m: M): M {
  m.transparent = true;
  m.depthWrite = false;
  m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.SrcAlphaFactor;
  m.blendDst = THREE.OneFactor;
  m.blendSrcAlpha = THREE.ZeroFactor;
  m.blendDstAlpha = THREE.OneFactor;
  return m;
}

/** seconds a puff lives */
const LIFE = 2.2;

export class Vapour {
  readonly mesh: THREE.Mesh;
  private readonly mat: THREE.ShaderMaterial;

  constructor(puffs = 20) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const seed = new Float32Array(puffs * 4);
    // (the thresholds spread evenly, so that half the amount is half the puffs, whichever they are)
    for (let i = 0; i < puffs; i++) {
      seed[i * 4] = i / puffs;
      seed[i * 4 + 1] = ((i * 7) % puffs) / puffs + 0.5 / puffs;
      seed[i * 4 + 2] = Math.random();
      seed[i * 4 + 3] = Math.random();
    }
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    g.instanceCount = puffs;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        ...globals,
        uLife: { value: LIFE },
        uAmount: { value: 0 },
        uDark: { value: 0 },
        uSteam: { value: 1 },
        uWindK: { value: 1 },
      },
      vertexShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        uniform float uTime;
        uniform vec4 uWind;
        uniform float uLife;
        uniform float uAmount;
        uniform float uSteam;
        uniform float uWindK;
        attribute vec4 aSeed;
        varying vec3 vPos;
        varying vec2 vUv;
        varying float vAge;
        varying float vSeed;
        void main() {
          float age = fract(uTime / uLife + aSeed.x);
          vAge = age;
          vSeed = aSeed.z;
          vUv = position.xy;
          // (beyond the amount: no puff)
          float on = step(aSeed.y, uAmount);
          // up from the food, slowing as it cools (steam quicker and higher), wandering, leaning with the wind out of doors
          float rise = mix(0.42, 0.5, uSteam) * (0.8 + 0.4 * aSeed.w) * (1.0 - pow(1.0 - age, 1.5));
          vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          c.y += rise;
          c.x += sin(age * 5.0 + aSeed.z * 6.3) * 0.05 * age;
          c.z += cos(age * 4.1 + aSeed.w * 6.3) * 0.05 * age;
          c.xz += uWind.xy * (0.35 + 1.4 * uWind.z) * age * age * 0.35 * uWindK;
          float size = on * (0.025 + mix(0.2, 0.17, uSteam) * pow(age, 0.75) * (0.7 + 0.6 * aSeed.z));
          vPos = c;
          vec4 mv = viewMatrix * vec4(c, 1.0);
          float a = aSeed.w * 6.283 + age * 0.9;
          mv.xy += mat2(cos(a), -sin(a), sin(a), cos(a)) * position.xy * size;
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        ${GLSL_COMMON}
        uniform float uAmount;
        uniform float uDark;
        uniform float uSteam;
        varying vec3 vPos;
        varying vec2 vUv;
        varying float vAge;
        varying float vSeed;
        void main() {
          #include <logdepthbuf_fragment>
          float d = length(vUv);
          float n = rtNoiseAt(vUv * 0.7 + vSeed * 13.0, 1.0).r;
          float a = 1.0 - smoothstep(0.3, 1.0, d + (n - 0.5) * 0.6);
          // thick where it leaves the food, thinning as it spreads; steam thinner than smoke, a burning pan's thickest
          a *= smoothstep(0.0, 0.07, vAge) * pow(1.0 - vAge, 1.4) * mix(0.5, 0.4, uSteam) * (0.65 + 0.35 * uAmount) * (1.0 + 0.7 * uDark);
          if (a < 0.004) discard;
          vec3 smoke = mix(vec3(0.74, 0.73, 0.72), vec3(0.1, 0.095, 0.09), uDark * (1.0 - 0.3 * vAge));
          vec3 base = mix(smoke, vec3(0.95, 0.96, 0.97), uSteam * (1.0 - uDark));
          float lit = 0.55 + 0.45 * clamp(dot(normalize(vec3(vUv, 0.6)), normalize(vec3(0.0, 0.6, 0.8))), 0.0, 1.0);
          vec3 col = base * (uSkyColor * 0.95 + uSunColor * 0.32 * lit);
          col = rtFog(col, vPos, cameraPosition);
          gl_FragColor = vec4(col, a);
        }`,
    });
    const m = this.mat;
    m.transparent = true;
    m.depthWrite = false;
    m.blending = THREE.CustomBlending;
    m.blendSrc = THREE.SrcAlphaFactor;
    m.blendDst = THREE.OneMinusSrcAlphaFactor;
    m.blendSrcAlpha = THREE.ZeroFactor;
    m.blendDstAlpha = THREE.OneFactor;
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.name = 'kitchen:vapour';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.visible = false;
  }

  /** this frame: how much (0 none … 1 a rolling boil, a burning pan), how sooty (0 … 1 black), how much of it is steam (0 … 1), the wind's share (0 indoors) */
  set(amount: number, dark: number, steam: number, wind: number): void {
    this.mesh.visible = amount > 0.02;
    const u = this.mat.uniforms;
    u.uAmount.value = amount;
    u.uDark.value = dark;
    u.uSteam.value = steam;
    u.uWindK.value = wind;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

/** a soft round spot of light, bright in its middle (a texture made once; none where no page draws) */
let spotTex: THREE.CanvasTexture | null = null;
export function spot(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  if (spotTex) return spotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  r.addColorStop(0.6, 'rgba(255,255,255,0.14)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  spotTex = new THREE.CanvasTexture(c);
  spotTex.colorSpace = THREE.SRGBColorSpace;
  return spotTex;
}

/** the stove's light: a halo round the flame, a pool of it on what the stove stands on (both only where a page draws) */
export class Glow {
  readonly halo: THREE.Sprite;
  readonly pool: THREE.Mesh;
  private readonly haloMat: THREE.SpriteMaterial;
  private readonly poolMat: THREE.MeshBasicMaterial;

  constructor() {
    const tex = spot();
    this.haloMat = addLight(new THREE.SpriteMaterial({ map: tex, color: 0x6fa8ff, toneMapped: false }));
    this.halo = new THREE.Sprite(this.haloMat);
    this.halo.name = 'kitchen:halo';
    this.halo.renderOrder = 12;
    this.poolMat = addLight(new THREE.MeshBasicMaterial({ map: tex, color: 0xffb070, toneMapped: false }));
    this.poolMat.polygonOffset = true;
    this.poolMat.polygonOffsetFactor = -2;
    this.poolMat.polygonOffsetUnits = -2;
    this.pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.poolMat);
    this.pool.name = 'kitchen:pool';
    this.pool.renderOrder = 6;
    this.halo.visible = this.pool.visible = false;
  }

  /**
   * How much light: the flame's level (0 … 1), the night (0 … 1), how far the eye is opened up (core.exposure: what
   * glows is divided by it, as the appliances' lamps are, so that it looks the same on screen whatever the hour), a
   * canister nearly empty (yellower, unsteady), the flicker of the moment. The colours go over 1: the bloom spreads them.
   */
  set(level: number, night: number, exposure: number, low: boolean, flick: number): void {
    const k = (level * flick) / Math.max(0.5, exposure);
    const h = k * (0.3 + 0.9 * night);
    const p = k * (0.05 + 0.75 * night);
    this.halo.visible = h > 0.01;
    this.pool.visible = p > 0.01;
    this.haloMat.opacity = 1;
    this.poolMat.opacity = 1;
    this.haloMat.color.setRGB(low ? 1 : 0.45, low ? 0.78 : 0.68, low ? 0.4 : 1).multiplyScalar(h);
    this.poolMat.color.setRGB(1, low ? 0.5 : 0.42, low ? 0.1 : 0.12).multiplyScalar(p);
  }

  dispose(): void {
    this.halo.removeFromParent();
    this.pool.removeFromParent();
    this.pool.geometry.dispose();
    this.haloMat.dispose();
    this.poolMat.dispose();
  }
}
