/**
 * The one material of the forage plants (node W3): every plant one picks, and the glint over every point,
 * drawn by one shader in one instanced batch (families.ts holds all the models in one geometry).
 *
 * The vertex shader keeps, for an instance, the vertices of its own family and puts the rest outside the
 * view; it stretches the family's unit model to the plant's size, lets it grow in between 45 and 35 m from
 * where one stands, lets a picked plant shrink away in a third of a second, and leans it with the wind as
 * the game's other plants lean (render/materials.ts). The glint is a square turned to the camera over the
 * point, as large as the point is near: nothing beyond the hint distance.
 *
 * The fragment shader paints the way the art bible asks of plants (specs/art/STYLE.md §2.3, §5): no light
 * falling off across a surface, but a tone — how the part faces the light, how deep it sits in its clump
 * (painted into the vertices), a dab of brushwork, the shadow that falls on it — choosing among three steps
 * of the plant's own colour, the shade step leaning to the sky's blue and never black. It writes alpha 0.7
 * like the leaves of trees, so the paint finish uses its finest brush on them. Kinds that glow are lit from
 * within by night. The glint is a small four-pointed star, bright enough to catch the bloom.
 *
 * Instance attributes (view.ts writes them):
 *   iTintA, iTintB  the plant's two colours (linear)
 *   iData           its family's number (−2: nothing but the glint), whether it glows (0/1), the moment it
 *                   appeared and the moment it was picked — both on the batch's own clock (uState.z), which the
 *                   view sets back to nothing whenever it writes the batch anew (long ago: −1e6; never: 1e6)
 *   iMore           how high over the point the glint stands (m), and a number 0 … 1 of the point's own
 */
import * as THREE from 'three';
import { GLSL_COMMON, GLSL_FRAGMENT_PARS, GLSL_VERTEX_PARS, globals } from '../../../../render/shaderlib';

/** where the plants grow in, from where one stands (m): gone beyond the first, whole within the second */
export const FADE_FAR = 45;
export const FADE_NEAR = 35;
/** how long a plant takes to grow in when it comes to show, and to shrink away when it is picked (s) */
export const GROW_S = 0.5;
export const SHRINK_S = 1 / 3;

export function forageMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    vertexColors: true,
    uniforms: {
      ...globals,
      /** where one stands (render space): the glint and the growing-in are measured from here, not from the camera */
      uEye: { value: new THREE.Vector3() },
      /**
       * x: how far off a point glints (m); y: the developer's mark (1: every point, however far); z: seconds
       * since the batch was last written. (One vector and not three numbers: a number written into a uniform's
       * `value` every frame is put on the heap by the engine, a vector's component is not.)
       */
      uState: { value: new THREE.Vector4(8, 0, 0, 0) },
      uFade: { value: new THREE.Vector2(FADE_NEAR, FADE_FAR) },
    },
    vertexShader: /* glsl */ `
      ${GLSL_VERTEX_PARS}
      uniform vec4 uWind;
      uniform float uTime;
      uniform vec3 uEye;
      uniform vec4 uState;
      uniform vec2 uFade;
      attribute vec3 aInfo;
      attribute vec3 iTintA;
      attribute vec3 iTintB;
      attribute vec4 iData;
      attribute vec2 iMore;
      varying vec3 vAlbedo;
      varying float vTone;
      varying float vGlow;
      varying vec3 vStar;
      void main() {
        float uHint = uState.x;
        float uMark = uState.y;
        float uSince = uState.z;
        mat4 rtModel = modelMatrix * instanceMatrix;
        vec3 at = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
        float dEye = distance(at, uEye);
        float pickedFor = uSince - iData.w;
        vec4 world;
        bool hide;
        vStar = vec3(0.0);
        vGlow = 0.0;
        vTone = 1.0;
        vAlbedo = vec3(1.0);
        if (aInfo.z < -0.5) {
          // the glint: a square over the point, turned to the camera; gone beyond the hint distance, and once picked
          float reach = max(uHint, uMark * 400.0);
          float near = 1.0 - smoothstep(reach * 0.75, reach, dEye);
          float vis = near * (1.0 - step(0.0, pickedFor));
          float twinkle = 0.72 + 0.28 * sin(uTime * 2.6 + iMore.y * 41.0);
          // (marked by the developer it keeps its size on the screen, so that it is seen from 150 m)
          float size = (0.085 + 0.035 * iMore.y) * twinkle * vis * mix(1.0, max(1.0, dEye * 0.1), uMark);
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          world = vec4(at + vec3(0.0, iMore.x, 0.0) + (right * position.x + up * position.y) * size, 1.0);
          vNormal = vec3(0.0, 1.0, 0.0);
          vStar = vec3(position.xy, vis);
          hide = vis < 0.004;
        } else {
          // a plant: only the vertices of this instance's own family
          float grow = (1.0 - smoothstep(uFade.x, uFade.y, dEye)) * clamp((uSince - iData.z) / ${GROW_S.toFixed(3)}, 0.0, 1.0) * (1.0 - clamp(pickedFor / ${SHRINK_S.toFixed(4)}, 0.0, 1.0));
          grow = grow * grow * (3.0 - 2.0 * grow);
          hide = abs(aInfo.z - iData.x) > 0.5 || grow < 0.004;
          vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          world = rtModel * vec4(position * grow, 1.0);
          // the wind: a slow lean with it and a quicker flutter, more the higher a part stands (in metres)
          float h = position.y * sc.y;
          float ph = uTime * (0.9 + 1.6 * uWind.z) + instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.29 + iMore.y * 6.0;
          float bend = aInfo.y * grow * (0.12 + uWind.z) * (0.02 + 0.2 * h);
          world.x += (sin(ph) * 0.6 + 0.8 * uWind.z) * uWind.x * bend + cos(ph * 0.8 + 1.3) * 0.5 * -uWind.y * bend;
          world.z += (sin(ph) * 0.6 + 0.8 * uWind.z) * uWind.y * bend + cos(ph * 0.8 + 1.3) * 0.5 * uWind.x * bend;
          // (the model is stretched differently along each axis: the normal is put right for that)
          vNormal = normalize(mat3(rtModel) * (normal / (sc * sc)));
          vAlbedo = aInfo.x < -0.5 ? color : mix(iTintA, iTintB, clamp(aInfo.x, 0.0, 1.0));
          vTone = aInfo.x < -0.5 ? 1.0 : dot(color, vec3(0.3333));
          vGlow = iData.y;
        }
        vPos = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
        #include <logdepthbuf_vertex>
        // (what is not this instance's is put outside the view: its triangles are never drawn)
        if (hide) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FRAGMENT_PARS}
      ${GLSL_COMMON}
      varying vec3 vAlbedo;
      varying float vTone;
      varying float vGlow;
      varying vec3 vStar;
      void main() {
        #include <logdepthbuf_fragment>
        if (vStar.z > 0.002) {
          // a four-pointed star: two thin arms and a soft middle
          vec2 q = abs(vStar.xy);
          float armX = (1.0 - q.x) * (1.0 - smoothstep(0.0, 0.02 + 0.1 * (1.0 - q.x), q.y));
          float armY = (1.0 - q.y) * (1.0 - smoothstep(0.0, 0.02 + 0.1 * (1.0 - q.y), q.x));
          float core = 1.0 - smoothstep(0.0, 0.3, length(q));
          float s = max(max(armX, armY), core);
          if (s < 0.3) discard;
          // (the night's exposure is raised: the star is held back there, or it would be a lamp)
          vec3 star = vec3(1.0, 0.92, 0.6) * (1.05 + 1.3 * core) * mix(1.0, 0.4, uWeather.w);
          gl_FragColor = vec4(star, 0.5);
          return;
        }
        vec3 n = normalize(vNormal);
        if (!gl_FrontFacing) n = -n;
        float sh = rtShadow(vPos, n);
        vec3 L = normalize(vec3(uSunDir.x, max(uSunDir.y, 0.25), uSunDir.z));
        float facing = dot(n, L);
        float dab = rtNoiseAt(rtWorldXZ(vPos) * 1.0 + vPos.y * vec2(0.71, -0.53), 0.9).r - 0.5;
        float tone = 0.5 + 0.36 * facing + (vTone - 1.0) * 1.1 + dab * 0.2 - (1.0 - sh) * 0.3;
        // three steps of the plant's own colour: a shade that leans to the sky, the colour, a light that leans to the sun
        vec3 shade = vAlbedo * vec3(0.5, 0.6, 0.78);
        vec3 light = min(vAlbedo * vec3(1.22, 1.15, 0.96) + 0.02, vec3(0.94));
        vec3 albedo = mix(shade, vAlbedo, smoothstep(0.3, 0.42, tone));
        albedo = mix(albedo, light, smoothstep(0.62, 0.74, tone));
        // snow lies on what looks up, where it lies on the country
        albedo = mix(albedo, vec3(0.88, 0.92, 0.97), smoothstep(0.35, 0.75, n.y) * uWeather.y * 0.8);
        float lit = smoothstep(-0.1, 0.45, facing) * sh;
        // (the light of the leaves of trees, a quarter less of it: these are the plants' own colours, not the
        // dark greens of a wood, and pale ones — a shell, a white cap — would stand whiter than the sand they lie on)
        vec3 col = albedo * (uSkyColor * 0.9 + uBounceColor * 0.5 + uSunColor * mix(0.05, 0.36, lit)) * 0.76;
        col += rtHeadlight(albedo, n, vPos);
        // kinds that glow: lit from within by night, a slow breath
        col += vAlbedo * vGlow * uWeather.w * (1.1 + 0.25 * sin(uTime * 1.3 + vPos.x * 3.0 + vPos.z * 2.0));
        col = rtFog(col, vPos, cameraPosition);
        gl_FragColor = vec4(col, 0.7);
      }`,
  });
}
