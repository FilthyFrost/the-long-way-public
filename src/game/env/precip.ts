/**
 * Rain, snow, hail and blowing sand: particles in a box that travels with the camera.
 * Positions are a pure function of a per-particle seed and an accumulated offset, so the GPU
 * does all the motion. Streaks follow velocity relative to the camera: drive faster and the
 * rain slants towards you.
 */
import * as THREE from 'three';
import { maskPreservingBlend } from '../render/materials';
import { GLSL_COMMON, globals } from '../render/shaderlib';

export type PrecipKind = 'rain' | 'snow' | 'hail' | 'dust' | 'leaf' | 'gust';

interface LayerDef {
  box: number;
  count: number;
  width: number;
  /** streak length = clamp(relative speed × exposure, min, max) */
  exposure: number;
  minLen: number;
  maxLen: number;
  flutter: number;
  alpha: number;
  color: number;
  /** fall speed (m/s, positive down) and how much of the wind it takes */
  fall: number;
  drift: number;
}

/** the layers' looks (read every frame: the developer's dials write into them) */
export const PRECIP_DEFS: Record<PrecipKind, LayerDef> = {
  rain: { box: 22, count: 7000, width: 0.014, exposure: 0.03, minLen: 0.2, maxLen: 1.1, flutter: 0, alpha: 0.5, color: 0xcfe0ee, fall: 9.5, drift: 0.6 },
  snow: { box: 18, count: 6000, width: 0.036, exposure: 0.012, minLen: 0.036, maxLen: 0.3, flutter: 0.12, alpha: 0.9, color: 0xffffff, fall: 1.4, drift: 0.9 },
  hail: { box: 16, count: 1600, width: 0.03, exposure: 0.012, minLen: 0.05, maxLen: 0.3, flutter: 0, alpha: 0.95, color: 0xf4f8ff, fall: 17, drift: 0.3 },
  dust: { box: 34, count: 3600, width: 0.75, exposure: 0.16, minLen: 1.4, maxLen: 6.0, flutter: 0.3, alpha: 0.16, color: 0xeec28a, fall: 0.15, drift: 1.0 },
  // the wind made visible: leaves and petals torn loose and carried across the road …
  leaf: { box: 30, count: 420, width: 0.075, exposure: 0.004, minLen: 0.07, maxLen: 0.16, flutter: 0.6, alpha: 0.95, color: 0xa9c46a, fall: 0.5, drift: 0.9 },
  // … and long pale lines where a gust runs through the air
  gust: { box: 46, count: 70, width: 0.035, exposure: 0.3, minLen: 2.5, maxLen: 7.0, flutter: 0.15, alpha: 0.22, color: 0xf4f8fb, fall: 0.0, drift: 1.25 },
};

/**
 * How many times its usual number of particles a layer holds: the extra stay hidden until the weather (or the
 * developer's dial for the number of drops) asks for more than a full fall.
 */
const HEADROOM: Record<PrecipKind, number> = { rain: 3, snow: 3, hail: 3, dust: 2, leaf: 1, gust: 1 };

class Layer {
  readonly mesh: THREE.InstancedMesh;
  readonly mat: THREE.ShaderMaterial;
  readonly offset = new THREE.Vector3();
  constructor(
    readonly def: LayerDef,
    density: number,
    readonly headroom: number,
  ) {
    const count = Math.max(200, Math.round(def.count * density * headroom));
    const geo = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    const seed = new Float32Array(count * 3);
    const rand = new Float32Array(count);
    let s = 12345;
    const rnd = (): number => {
      s = (Math.imul(s, 1664525) + 1013904223) | 0;
      return (s >>> 8) / 16777216;
    };
    for (let i = 0; i < count; i++) {
      seed[i * 3] = rnd();
      seed[i * 3 + 1] = rnd();
      seed[i * 3 + 2] = rnd();
      rand[i] = (i + 0.5) / count;
    }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 3));
    geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(rand, 1));
    geo.instanceCount = count;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        ...globals,
        uOffset: { value: this.offset },
        uRelDir: { value: new THREE.Vector3(0, -1, 0) },
        uBox: { value: def.box },
        uAmount: { value: 0 },
        uSize: { value: new THREE.Vector2(def.width, def.minLen) },
        uFlutter: { value: def.flutter },
        uAlpha: { value: def.alpha },
        uColor: { value: new THREE.Color(def.color) },
        uCabInv: { value: new THREE.Matrix4() },
        uCabMin: { value: new THREE.Vector3() },
        uCabMax: { value: new THREE.Vector3() },
        uCabOn: { value: 0 },
      },
      vertexShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute vec3 aSeed;
        attribute float aRand;
        uniform vec3 uOffset;
        uniform vec3 uRelDir;
        uniform float uBox;
        uniform float uAmount;
        uniform vec2 uSize;
        uniform float uFlutter;
        uniform float uTime;
        uniform mat4 uCabInv;
        uniform vec3 uCabMin;
        uniform vec3 uCabMax;
        uniform float uCabOn;
        uniform vec3 uHeadPos;
        uniform vec3 uHeadDir;
        uniform vec3 uHeadColor;
        uniform vec4 uRoomMin;
        uniform vec4 uRoomMax;
        varying vec2 vQ;
        varying float vFade;
        varying vec3 vLamp;
        void main() {
          vec3 p = (fract(aSeed + uOffset) - 0.5) * uBox;
          p.xz += uFlutter * vec2(sin(uTime * 1.7 + aRand * 40.0), cos(uTime * 1.3 + aRand * 31.0));
          vec3 center = cameraPosition + p;
          vec3 toCam = normalize(-p);
          vec3 side = normalize(cross(uRelDir, toCam) + vec3(1e-5));
          vec3 wp = center + uRelDir * (position.y * uSize.y) + side * (position.x * uSize.x);
          bool hidden = aRand > uAmount;
          if (uCabOn > 0.5) {
            vec3 lp = (uCabInv * vec4(center, 1.0)).xyz;
            if (all(greaterThan(lp, uCabMin)) && all(lessThan(lp, uCabMax))) hidden = true;
          }
          // nothing falls in a room of the world's (the starting garage)
          if (uRoomMin.w > 0.5 && all(greaterThan(center, uRoomMin.xyz)) && all(lessThan(center, uRoomMax.xyz))) hidden = true;
          gl_Position = hidden ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(wp, 1.0);
          #include <logdepthbuf_vertex>
          vQ = position.xy * 2.0;
          vec3 a = abs(p) / (uBox * 0.5);
          vFade = (1.0 - smoothstep(0.72, 1.0, max(a.x, max(a.y, a.z)))) * smoothstep(0.35, 1.3, length(p));
          // caught in the headlights
          vec3 L = center - uHeadPos;
          float d = length(L);
          float c = dot(L / max(d, 1e-3), uHeadDir);
          vLamp = uHeadColor * smoothstep(uHeadCone.x, uHeadCone.y, c) / (1.0 + d * d / max(uHeadReach * 0.4, 90.0));
        }`,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        ${GLSL_COMMON}
        uniform vec3 uColor;
        uniform float uAlpha;
        varying vec2 vQ;
        varying float vFade;
        varying vec3 vLamp;
        void main() {
          #include <logdepthbuf_fragment>
          float a = (1.0 - smoothstep(0.35, 1.0, abs(vQ.x))) * (1.0 - smoothstep(0.55, 1.0, abs(vQ.y))) * vFade * uAlpha;
          vec3 col = uColor * (uSkyColor * 1.1 + uSunColor * 0.16 + uBounceColor * 0.5) + uColor * vLamp * 0.9;
          gl_FragColor = vec4(col, a);
        }`,
    });
    maskPreservingBlend(this.mat);
    this.mesh = new THREE.InstancedMesh(geo, this.mat, count);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.mesh.visible = false;
  }
}

const rel = new THREE.Vector3();

export class Precipitation {
  private readonly layers: Record<PrecipKind, Layer>;
  /** how many particles a layer shows for a given amount (1 = as designed; up to its headroom) */
  readonly count: Record<PrecipKind, number> = { rain: 1, snow: 1, hail: 1, dust: 1, leaf: 1, gust: 1 };
  /** how long the streaks are drawn (1 = as designed) */
  readonly length: Record<PrecipKind, number> = { rain: 1, snow: 1, hail: 1, dust: 1, leaf: 1, gust: 1 };

  constructor(scene: THREE.Scene, density: number) {
    const D = PRECIP_DEFS;
    this.layers = {
      rain: new Layer(D.rain, density, HEADROOM.rain),
      snow: new Layer(D.snow, density, HEADROOM.snow),
      hail: new Layer(D.hail, density, HEADROOM.hail),
      dust: new Layer(D.dust, density, HEADROOM.dust),
      leaf: new Layer(D.leaf, density, HEADROOM.leaf),
      gust: new Layer(D.gust, 1, HEADROOM.gust),
    };
    for (const l of Object.values(this.layers)) scene.add(l.mesh);
  }

  /**
   * @param amounts  intensity 0…1 per kind
   * @param wind     wind velocity (world, m/s)
   * @param camVel   camera velocity (world, m/s)
   */
  update(dt: number, amounts: Record<PrecipKind, number>, wind: THREE.Vector3, camVel: THREE.Vector3): void {
    for (const kind of Object.keys(this.layers) as PrecipKind[]) {
      const l = this.layers[kind];
      const amt = amounts[kind];
      l.mesh.visible = amt > 0.004;
      const d = l.def;
      // particle velocity relative to the camera
      rel.set(wind.x * d.drift - camVel.x, -d.fall - camVel.y, wind.z * d.drift - camVel.z);
      const speed = rel.length();
      l.offset.addScaledVector(rel, dt / d.box);
      l.offset.set(l.offset.x - Math.floor(l.offset.x), l.offset.y - Math.floor(l.offset.y), l.offset.z - Math.floor(l.offset.z));
      if (!l.mesh.visible) continue;
      const u = l.mat.uniforms;
      (u.uRelDir.value as THREE.Vector3).copy(rel).divideScalar(Math.max(speed, 1e-3));
      // (the layer holds `headroom` times its particles: a full fall shows its usual share of them)
      u.uAmount.value = Math.min(1, (amt * this.count[kind]) / l.headroom);
      (u.uSize.value as THREE.Vector2).set(d.width, THREE.MathUtils.clamp(speed * d.exposure, d.minLen, d.maxLen) * this.length[kind]);
      u.uBox.value = d.box;
      u.uFlutter.value = d.flutter;
      u.uAlpha.value = d.alpha;
    }
  }

  /** what the wind carries here: leaves in green country, petals, nothing over sand or snow */
  setLeafColor(c: THREE.Color): void {
    (this.layers.leaf.mat.uniforms.uColor.value as THREE.Color).copy(c);
  }

  /** keep particles out of a closed cabin: box given in the vehicle's local frame */
  setCabin(worldToVehicle: THREE.Matrix4 | null, min?: THREE.Vector3, max?: THREE.Vector3): void {
    for (const l of Object.values(this.layers)) {
      const u = l.mat.uniforms;
      u.uCabOn.value = worldToVehicle ? 1 : 0;
      if (worldToVehicle && min && max) {
        (u.uCabInv.value as THREE.Matrix4).copy(worldToVehicle);
        (u.uCabMin.value as THREE.Vector3).copy(min);
        (u.uCabMax.value as THREE.Vector3).copy(max);
      }
    }
  }
}
