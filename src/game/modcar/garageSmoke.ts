/**
 * A wisp of wood smoke from the stove's chimney (the stove in the back corner is always lit): a few
 * dozen soft puffs rising from the rain cap, leaning with the wind, growing and thinning out. Lit by
 * the sky and the sun like everything else; blended over the frame with its alpha (the ink ids) left alone.
 */
import * as THREE from 'three';
import { GLSL_COMMON, globals } from '../render/shaderlib';

const PUFFS = 26;
/** seconds a puff lives */
const LIFE = 9;

export function buildSmoke(at: { x: number; y: number; z: number }): THREE.Mesh {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const seed = new Float32Array(PUFFS * 4);
  for (let i = 0; i < PUFFS; i++) {
    seed[i * 4] = i / PUFFS;
    seed[i * 4 + 1] = Math.random();
    seed[i * 4 + 2] = Math.random();
    seed[i * 4 + 3] = Math.random();
  }
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  g.instanceCount = PUFFS;
  const m = new THREE.ShaderMaterial({
    uniforms: { ...globals, uLife: { value: LIFE }, uSmokeAt: { value: new THREE.Vector3(at.x, at.y, at.z) } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      uniform float uTime;
      uniform vec4 uWind;
      uniform float uLife;
      uniform vec3 uSmokeAt;
      attribute vec4 aSeed;
      varying vec3 vPos;
      varying vec2 vUv;
      varying float vAge;
      varying float vSeed;
      void main() {
        float age = fract(uTime / uLife + aSeed.x);
        vAge = age;
        vSeed = aSeed.y;
        vUv = position.xy;
        // up from the cap, slowing as it cools; leaning with the wind more the higher it goes
        vec2 wind = uWind.xy * (0.35 + 1.4 * uWind.z);
        float rise = 3.4 * (1.0 - pow(1.0 - age, 1.6));
        vec3 c = (modelMatrix * vec4(uSmokeAt, 1.0)).xyz;
        c.y += rise;
        c.xz += wind * age * age * 3.2;
        // and it wanders
        c.x += sin(age * 5.0 + aSeed.z * 6.3) * 0.18 * age;
        c.z += cos(age * 4.1 + aSeed.w * 6.3) * 0.18 * age;
        float size = 0.14 + 0.85 * pow(age, 0.8) * (0.8 + 0.4 * aSeed.z);
        vPos = c;
        vec4 mv = viewMatrix * vec4(c, 1.0);
        // turned a little each, so no two puffs are the same shape
        float a = aSeed.w * 6.283 + age * 0.8;
        vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * position.xy;
        mv.xy += q * size;
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${GLSL_COMMON}
      varying vec3 vPos;
      varying vec2 vUv;
      varying float vAge;
      varying float vSeed;
      void main() {
        #include <logdepthbuf_fragment>
        // a soft round puff, its edge broken like a brush's
        float d = length(vUv);
        float n = rtNoiseAt(vUv * 0.7 + vSeed * 13.0, 1.0).r;
        float a = 1.0 - smoothstep(0.35, 1.0, d + (n - 0.5) * 0.55);
        // born thick from the cap, thinning out as it spreads
        a *= smoothstep(0.0, 0.05, vAge) * pow(1.0 - vAge, 1.5) * 0.62;
        if (a < 0.004) discard;
        // pale grey lit by the sky, warmed on the sun's side
        vec3 base = mix(vec3(0.7, 0.7, 0.72), vec3(0.86, 0.85, 0.84), vAge);
        float lit = 0.55 + 0.45 * clamp(dot(normalize(vec3(vUv, 0.6)), normalize(vec3(0.0, 0.6, 0.8))), 0.0, 1.0);
        vec3 col = base * (uSkyColor * 0.95 + uSunColor * 0.32 * lit);
        col = rtFog(col, vPos, cameraPosition);
        gl_FragColor = vec4(col, a);
      }`,
  });
  m.transparent = true;
  m.depthWrite = false;
  m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.SrcAlphaFactor;
  m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = THREE.ZeroFactor;
  m.blendDstAlpha = THREE.OneFactor;
  const mesh = new THREE.Mesh(g, m);
  mesh.name = 'garage:smoke';
  mesh.frustumCulled = false;
  mesh.renderOrder = 7;
  return mesh;
}
