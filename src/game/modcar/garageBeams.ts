/**
 * Light in the air of the workshop (docs/MODCAR.md §9: "暖色吊灯 + 冷色窗光，灰尘和光柱"): the sun's
 * beams through the door, the windows and the skylights, and the dust that floats in them.
 *
 * Beams: one parallelepiped per opening of the room (the shared uRoomOpen* uniforms: corner A, edges U
 * and V; the third edge runs into the room against the sun), all in one mesh. Each fragment works out
 * the stretch of its view ray inside its beam and walks it, asking the shadow maps whether the sun
 * gets there — so the beams are cut by the muntins, the doors, the car standing in them, and stop on
 * the floor. Drawn added to the frame, its alpha (the ink ids) left alone.
 *
 * Dust: a few thousand motes drifting in the room, each shining only where the sun reaches it (the
 * same shadow test): they appear in the beams and nowhere else.
 */
import * as THREE from 'three';
import { GLSL_COMMON, globals, ROOM_OPENINGS } from '../render/shaderlib';

function additive(m: THREE.ShaderMaterial): THREE.ShaderMaterial {
  m.transparent = true;
  m.depthWrite = false;
  m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneFactor;
  m.blendSrcAlpha = THREE.ZeroFactor;
  m.blendDstAlpha = THREE.OneFactor;
  return m;
}

export const beamUniforms = {
  /** how far a beam reaches into the room (m) */
  uBeamLen: { value: 11.0 },
  /** how thick the air is with dust (brightness of a beam per metre of it) */
  uBeamDensity: { value: 0.07 },
  /** the room's floor height (render space): beams stop on it */
  uBeamFloor: { value: 0.0 },
};

export function beamMaterial(): THREE.ShaderMaterial {
  return additive(
    new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { ...globals, ...beamUniforms },
      vertexShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        ${GLSL_COMMON}
        uniform float uBeamLen;
        attribute vec4 aBeam;   // x: which opening; y, z, w: the corner (0/1 along U, V and into the room)
        varying vec3 vPos;
        flat varying int vIdx;
        void main() {
          int i = int(aBeam.x + 0.5);
          vIdx = i;
          vec3 A = uRoomOpenA[i];
          vec3 U = uRoomOpenU[i];
          vec3 V = uRoomOpenV[i];
          vec3 L = uRoomOpenL[i];
          vec3 n = normalize(cross(U, V));
          vec3 mid = A + 0.5 * (U + V);
          if (dot(n, mid - 0.5 * (uRoomMin.xyz + uRoomMax.xyz)) < 0.0) n = -n;
          vec3 W = -uSunDir * uBeamLen;
          vec3 p = A + U * aBeam.y + V * aBeam.z + W * aBeam.w;
          // no sun through this opening (it faces away, the sun is down, the opening is shut): nothing
          if (dot(uSunDir, n) < 0.03 || L.r + L.g + L.b < 1e-4 || uRoomMin.w < 0.5 || uSunDir.y < 0.0) p = A;
          vPos = p;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        ${GLSL_COMMON}
        uniform float uBeamLen;
        uniform float uBeamDensity;
        uniform float uBeamFloor;
        varying vec3 vPos;
        flat varying int vIdx;
        void main() {
          #include <logdepthbuf_fragment>
          vec3 A = uRoomOpenA[vIdx];
          vec3 U = uRoomOpenU[vIdx];
          vec3 V = uRoomOpenV[vIdx];
          vec3 W = -uSunDir * uBeamLen;
          vec3 ro = cameraPosition;
          vec3 rd = normalize(vPos - ro);
          // the ray in the beam's own frame (the unit cube), and its stretch inside
          mat3 Mi = inverse(mat3(U, V, W));
          vec3 o = Mi * (ro - A);
          vec3 d = Mi * rd;
          vec3 ds = d + vec3(1e-6);
          vec3 t0 = -o / ds;
          vec3 t1 = (vec3(1.0) - o) / ds;
          vec3 tn = min(t0, t1);
          vec3 tf = max(t0, t1);
          float tin = max(max(tn.x, tn.y), tn.z);
          float tout = min(min(tf.x, tf.y), tf.z);
          // each beam is walked once: from its near face, or (the eye inside it) from the eye at its far face
          bool eyeInside = tin < 0.0;
          if (gl_FrontFacing == eyeInside) discard;
          tin = max(tin, 0.0);
          // it stops on the floor and at the room's walls (and seen from outside, only what is in the room counts)
          if (rd.y < -1e-4) tout = min(tout, (uBeamFloor - ro.y) / rd.y);
          vec3 rs = rd + vec3(1e-6);
          vec3 ra = (uRoomMin.xyz - ro) / rs;
          vec3 rb = (uRoomMax.xyz - ro) / rs;
          vec3 rn = min(ra, rb);
          vec3 rf = max(ra, rb);
          float tEnter = max(max(rn.x, rn.y), rn.z);
          tin = max(tin, tEnter);
          tout = min(tout, min(min(rf.x, rf.y), rf.z));
          if (tout <= tin) discard;
          if (tEnter > 0.0) {
            // the eye is outside the room: a beam is seen only through an opening, not through the walls
            vec3 P = ro + rd * tEnter;
            bool through = false;
            for (int i = 0; i < ${ROOM_OPENINGS}; i++) {
              vec3 Li = uRoomOpenL[i];
              if (Li.r + Li.g + Li.b < 1e-4) continue;
              vec3 Ui = uRoomOpenU[i];
              vec3 Vi = uRoomOpenV[i];
              vec3 qi = P - uRoomOpenA[i];
              if (abs(dot(qi, normalize(cross(Ui, Vi)))) > 0.35) continue;
              float a = dot(qi, Ui) / dot(Ui, Ui);
              float b = dot(qi, Vi) / dot(Vi, Vi);
              if (a >= 0.0 && a <= 1.0 && b >= 0.0 && b <= 1.0) through = true;
            }
            if (!through) discard;
          }
          const int N = 14;
          float dt = (tout - tin) / float(N);
          float jit = rtHash(gl_FragCoord.xy + fract(uTime) * 61.0);
          float acc = 0.0;
          for (int k = 0; k < N; k++) {
            float t = tin + (float(k) + jit) * dt;
            vec3 p = ro + rd * t;
            vec3 q = o + d * t;
            // soft edges across the beam, fading as it goes into the room
            float edge = smoothstep(0.0, 0.14, q.x) * smoothstep(1.0, 0.86, q.x) * smoothstep(0.0, 0.14, q.y) * smoothstep(1.0, 0.86, q.y);
            float fade = 1.0 - smoothstep(0.25, 1.0, q.z);
            // dust is uneven: slow drifts of it
            vec2 w = rtWorldXZ(p) + vec2(p.y * 0.7, -p.y * 0.4);
            float dust = 0.55 + 0.9 * rtNoiseAt(w + vec2(uTime * 0.05, uTime * 0.03), 2.6).g;
            // (the air right at the eye is not seen as a beam: standing in one is not standing in fog)
            float seen = smoothstep(0.4, 2.8, t);
            acc += rtShadowMap(p, uSunDir) * edge * fade * dust * seen;
          }
          // brighter looking into the light (dust scatters forward)
          float phase = 0.5 + 1.6 * pow(max(dot(rd, uSunDir), 0.0), 5.0);
          // (the clear roof sheets are corrugated and milky: what comes through them is scattered, a faint shaft)
          float milky = abs(normalize(cross(U, V)).y) > 0.3 ? 0.22 : 1.0;
          // (the dust in a morning beam glows warm, the air's blue is in the room's own light)
          vec3 col = uSunColor * vec3(1.0, 0.9, 0.72) * acc * dt * uBeamDensity * phase * milky * rtCloudShade(ro);
          gl_FragColor = vec4(col, 0.0);
        }`,
    }),
  );
}

/** the beams: ROOM_OPENINGS parallelepipeds in one mesh (their corners come from the room's uniforms) */
export function buildBeams(): THREE.Mesh {
  const corners: number[] = [];
  const idx: number[] = [];
  // a unit cube's corners (a, b, c) and its faces (outward)
  const cube = [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 1, 1],
  ];
  const faces = [
    [0, 3, 2, 1],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
  ];
  for (let i = 0; i < ROOM_OPENINGS; i++) {
    const base = i * 8;
    for (const c of cube) corners.push(i, c[0], c[1], c[2]);
    for (const f of faces) idx.push(base + f[0], base + f[1], base + f[2], base + f[0], base + f[2], base + f[3]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('aBeam', new THREE.Float32BufferAttribute(corners, 4));
  // (three wants a position; the shader makes its own)
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(corners.length / 4 * 3), 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, beamMaterial());
  m.name = 'garage:beams';
  m.frustumCulled = false;
  m.renderOrder = 5;
  return m;
}

// ------------------------------------------------------------------ dust

export function dustMaterial(): THREE.ShaderMaterial {
  return additive(
    new THREE.ShaderMaterial({
      uniforms: { ...globals, uDustSize: { value: 1.25 } },
      vertexShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        ${GLSL_COMMON}
        uniform float uDustSize;
        attribute vec4 aDust;   // the mote's home (render space) and its own random number
        varying float vLit;
        void main() {
          float r = aDust.w;
          // drifting slowly round its home, sinking and lifting on the air
          float t = uTime * (0.05 + 0.08 * r);
          vec3 home = (modelMatrix * vec4(aDust.xyz, 1.0)).xyz;
          vec3 p = home + vec3(sin(t * 3.1 + r * 40.0), sin(t * 1.7 + r * 13.0) * 0.6, cos(t * 2.3 + r * 27.0)) * (0.25 + 0.35 * r);
          float inside = rtInRoom(p);
          vLit = rtShadowMap(p, uSunDir) * inside * step(0.0, uSunDir.y) * (0.6 + 0.8 * fract(r * 7.13));
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          // (none right at the eye: a mote there is a smear, not a speck of light)
          vLit *= smoothstep(1.2, 2.5, -mv.z);
          gl_PointSize = vLit > 0.01 ? uDustSize * (0.6 + r) * clamp(4.0 / -mv.z, 0.3, 1.4) : 0.0;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        ${GLSL_COMMON}
        varying float vLit;
        void main() {
          #include <logdepthbuf_fragment>
          vec2 c = gl_PointCoord - 0.5;
          float a = 1.0 - smoothstep(0.15, 0.5, length(c));
          gl_FragColor = vec4(uSunColor * vec3(0.2, 0.17, 0.12) * vLit * a, 0.0);
        }`,
    }),
  );
}

/** motes spread through the room's air (in the garage's own frame: add it under the garage's root) */
export function buildDust(min: [number, number, number], max: [number, number, number], count = 9000): THREE.Points {
  const data = new Float32Array(count * 4);
  let s = 12345;
  const rnd = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    data[i * 4] = min[0] + (max[0] - min[0]) * rnd();
    data[i * 4 + 1] = 0.15 + (Math.min(max[1], 4.2) - 0.15) * Math.pow(rnd(), 1.3);
    data[i * 4 + 2] = min[2] + (max[2] - min[2]) * rnd();
    data[i * 4 + 3] = rnd();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('aDust', new THREE.BufferAttribute(data, 4));
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const p = new THREE.Points(g, dustMaterial());
  p.name = 'garage:dust';
  p.frustumCulled = false;
  p.renderOrder = 6;
  return p;
}
