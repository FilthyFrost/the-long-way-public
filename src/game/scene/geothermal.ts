/**
 * The geothermal ground (V5, docs/V3/nodes/V5-landforms.md): a place whose landform is a geothermal field has its hot
 * springs, its fumaroles, its mud pots and a geyser by the road — it had none, a meadow with "地热区" over it.
 *
 *   A hot spring is painted as the great prismatic ones are: a deep blue eye, turquoise, a pale ring where the water is
 *   shallow over the sinter, then the mats of what lives in it as the water cools outward — yellow, orange, rust — and a
 *   white apron of sinter going into the ground; a smaller one a turquoise or an emerald bowl. Its water takes the sky
 *   at a low angle and the sun's glint, a veil of steam over it.
 *   A fumarole is a vent in a mound of yellow sulphur and white sinter, a plume of steam twenty or thirty metres high.
 *   A mud pot a grey bowl whose mud heaves in slow rings.
 *   The geyser goes off every minute or so: a column of white water some thirty metres up for ten seconds, and a cloud of
 *   steam after it that drifts off on the wind.
 *
 * Where: along each such place's stretch of road every 170 m or so, now on one side, now the other, 24 to 134 m off it, on
 * level ground (no water, no place by the road); the vent nearest the middle of the stretch with room for it is the
 * geyser. All of it deterministic, by the world's seed and the place's index.
 *
 * Drawn: the aprons of a place's springs one mesh (the land's own height under each vertex, a hand above it); the steam
 * every puff of every vent in one instanced draw, each puff rising, swelling, drifting on the wind and thinning on a life
 * of its own in the vertex shader, painted with a lit side and a shade as the clouds are.
 */
import * as THREE from 'three';
import type { World } from '../../core/world/terrain';
import { TerrainPoint } from '../../core/world/terrain';
import { SpineSample } from '../../core/world/spine';
import { APRON, FUMAROLE, GEYSER, MUD, POOL, isGeothermal, ventsOf, type Vent } from '../../core/world/earth/geothermal';
import type { RenderCore } from '../render/core';
import { GLSL_COMMON, GLSL_FRAGMENT_PARS, globals } from '../render/shaderlib';

const hash = (a: number, b: number): number => {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x632be5ab, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};

// ---------------------------------------------------------------------------------------------- the springs' aprons

const RINGS = 10;
const SEG = 44;

/** one piece's aprons (springs, the geyser's bowl, the fumaroles' mounds, the mud pots) as one mesh, its vertices about (ax, ay, az) */
function apronGeometry(world: World, vents: readonly Vent[], ax: number, ay: number, az: number): THREE.BufferGeometry {
  const tp = new TerrainPoint();
  const pos: number[] = [];
  const rad: number[] = [];
  const idx: number[] = [];
  for (const v of vents) {
    const base = pos.length / 3;
    const s1 = v.seed * 40;
    const s2 = v.seed * 91;
    for (let j = 0; j <= RINGS; j++) {
      const rho = (j / RINGS) * APRON;
      for (let k = 0; k < SEG; k++) {
        const a = (k / SEG) * Math.PI * 2;
        // (an outline of its own: no spring is a circle)
        const w = v.r * (1 + 0.13 * Math.sin(2 * a + s1) + 0.07 * Math.sin(5 * a + s2));
        const x = v.x + Math.cos(a) * rho * w;
        const z = v.z + Math.sin(a) * rho * w;
        world.shape(x, z, tp);
        // (a hand and more above the land: the land's own mesh is planar between its vertices, a little above the land's
        // shape in a hollow)
        pos.push(x - ax, tp.bed - ay + 0.3 + 0.05 * (1 - rho / APRON), z - az);
        rad.push(rho, v.kind, v.seed, Math.atan2(Math.sin(a), Math.cos(a)));
      }
    }
    for (let j = 0; j < RINGS; j++) {
      for (let k = 0; k < SEG; k++) {
        const a = base + j * SEG + k;
        const b = base + j * SEG + ((k + 1) % SEG);
        const c = a + SEG;
        const d = b + SEG;
        // (wound to face up: the land's side is the back)
        idx.push(a, b, c, b, d, c);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aRad', new THREE.Float32BufferAttribute(rad, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function apronMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...globals },
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute vec4 aRad;
      varying vec3 vPos;
      varying vec3 vNormal;
      varying vec4 vRad;
      void main() {
        vRad = aRad;
        vNormal = vec3(0.0, 1.0, 0.0);
        vec4 w = modelMatrix * vec4(position, 1.0);
        vPos = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FRAGMENT_PARS}
      ${GLSL_COMMON}
      varying vec4 vRad;
      void main() {
        #include <logdepthbuf_fragment>
        vec2 w = rtWorldXZ(vPos);
        float kind = vRad.y;
        float seed = vRad.z;
        float n1 = rtNoiseAt(w + seed * 173.0, 11.0).r;
        float n2 = rtNoiseAt(w * 1.0 + seed * 59.0, 2.6).g;
        // (its rings, broken by the brush: the mats lie in lobes and tongues where the water runs off)
        float r = vRad.x + (n1 - 0.5) * 0.2 + (n2 - 0.5) * 0.07;
        // (sinter: a cream, greyer where it is old and dry)
        vec3 sinter = mix(vec3(0.8, 0.76, 0.66), vec3(0.66, 0.64, 0.6), smoothstep(0.45, 0.8, n1));
        vec3 col;
        float water = 0.0;
        if (kind < 0.5 || (kind > 1.5 && kind < 2.5)) {
          // a hot spring (the geyser's bowl: its sinter wider, its eye small)
          float eye = kind > 1.5 ? 0.3 : 0.58;
          float pal = fract(seed * 7.13);
          vec3 deep = pal < 0.55 ? vec3(0.012, 0.1, 0.36) : pal < 0.8 ? vec3(0.01, 0.24, 0.32) : vec3(0.02, 0.22, 0.12);
          vec3 turq = pal < 0.55 ? vec3(0.03, 0.42, 0.56) : pal < 0.8 ? vec3(0.08, 0.62, 0.6) : vec3(0.18, 0.5, 0.22);
          vec3 pale = vec3(0.5, 0.78, 0.74);
          vec3 gold = vec3(0.86, 0.66, 0.12);
          vec3 orange = vec3(0.82, 0.32, 0.06);
          vec3 rust = vec3(0.42, 0.15, 0.06);
          // (a small one: its mats thin, its sinter close)
          float mats = pal < 0.55 ? 1.0 : 0.45;
          col = mix(deep, turq, smoothstep(eye * 0.25, eye * 0.85, r));
          col = mix(col, pale, smoothstep(eye * 0.86, eye * 0.98, r));
          water = 1.0 - smoothstep(eye * 0.96, eye * 1.02, r);
          float ring = (r - eye) / (1.0 - eye);
          vec3 mat = mix(gold, orange, smoothstep(0.18, 0.42, ring));
          mat = mix(mat, rust, smoothstep(0.5, 0.72, ring));
          mat = mix(mat, sinter, smoothstep(0.7, 0.86, ring) * 0.8 + (1.0 - mats) * 0.6);
          col = mix(col, mat, smoothstep(eye, eye + 0.04, r));
          col = mix(col, sinter, smoothstep(0.86, 1.0, r));
        } else if (kind < 1.5) {
          // a fumarole's mound: a dark throat, sulphur round it, white sinter
          col = mix(vec3(0.08, 0.07, 0.06), vec3(0.88, 0.76, 0.14), smoothstep(0.08, 0.2, r));
          col = mix(col, vec3(0.95, 0.88, 0.42), smoothstep(0.3, 0.5, r) * 0.6);
          col = mix(col, sinter, smoothstep(0.5, 0.85, r));
        } else {
          // a mud pot: grey mud heaving in slow rings, a pale crust round it
          float heave = 0.5 + 0.5 * sin(r * 34.0 - uTime * 1.3 + seed * 20.0);
          col = mix(vec3(0.3, 0.28, 0.26), vec3(0.45, 0.42, 0.38), heave * (1.0 - smoothstep(0.5, 0.62, r)));
          col = mix(col, vec3(0.7, 0.66, 0.58), smoothstep(0.62, 0.8, r));
          water = (1.0 - smoothstep(0.55, 0.62, r)) * 0.4;
        }
        // the light: the ground's, as the land's paint has it
        float sh = rtShadow(vPos, vec3(0.0, 1.0, 0.0));
        vec3 lit = col * rtGroundLight(sh);
        if (water > 0.0) {
          // the water: the sky at a low angle, the sun's glint, the steam's ripples on it
          vec3 V = normalize(cameraPosition - vPos);
          float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);
          float rip = rtNoiseAt(w * 1.0 + vec2(uTime * 0.21, -uTime * 0.17), 3.1).b;
          vec3 Nw = normalize(vec3((rip - 0.5) * 0.18, 1.0, (n2 - 0.5) * 0.18));
          vec3 H = normalize(V + uSunDir);
          float glint = smoothstep(0.985, 0.998, dot(Nw, H)) * sh;
          vec3 skyCol = mix(uSkyColor * 1.4, uFogColor, 0.35);
          lit = mix(lit, skyCol, fres * 0.75 * water) + uSunColor * glint * 1.4 * water;
        }
        float alpha = 1.0 - smoothstep(1.06, ${APRON.toFixed(2)}, vRad.x + (n1 - 0.5) * 0.12);
        lit = rtFog(lit, vPos, cameraPosition);
        gl_FragColor = vec4(lit, alpha);
      }`,
  });
}

// ---------------------------------------------------------------------------------------------- the steam

const MOST_PUFFS = 2400;

/** a vent's puffs: (puff index within the vent, life s, size m, rise m, how thick, a puff of the geyser's eruption) */
function puffsOf(v: Vent, out: number[][]): void {
  const add = (n: number, life: number, size: number, rise: number, thick: number, burst: number): void => {
    for (let i = 0; i < n; i++) out.push([v.x, v.y, v.z, v.kind, (i + hash(v.seed * 1e6, i)) / n, life * (0.85 + 0.3 * hash(i, v.seed * 1e6 + 1)), size * (0.75 + 0.5 * hash(i, v.seed * 1e6 + 2)), rise, thick, burst, v.seed, v.r]);
  };
  // (a spring's steam a low veil over its water, drifting; a vent's a plume)
  if (v.kind === POOL) add(Math.round(12 + v.r * 1.4), 9, 3 + v.r * 0.3, 4 + v.r * 0.45, 0.34, 0);
  else if (v.kind === FUMAROLE) add(46, 13, 8, 50, 0.6, 0);
  else if (v.kind === MUD) add(6, 9, 2.6, 5, 0.3, 0);
  else {
    add(12, 11, 5, 16, 0.4, 0);
    // (the eruption: a column of water and spray, and the steam cloud after it)
    add(40, 3.8, 4.4, 38, 0.85, 1);
    add(30, 15, 13, 60, 0.6, 2);
  }
}

function steamMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    // (uOrigin: the render origin itself — the shared uOriginOffset is the origin wrapped to the noise's period, for
    // the textures, not where things are)
    uniforms: { ...globals, uOrigin: { value: new THREE.Vector3() } },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      uniform float uTime;
      uniform vec4 uWind;
      uniform vec3 uOrigin;
      attribute vec4 aVent;   // world x, y, z; kind
      attribute vec4 aPuff;   // phase, life, size, rise
      attribute vec4 aMore;   // thickness, burst (0 steam, 1 the column, 2 the cloud after), seed, the vent's radius
      varying vec3 vPos;
      varying vec3 vNormal;
      varying vec2 vUv;
      varying float vAlpha;
      varying float vSeed;
      varying float vWater;
      void main() {
        vNormal = vec3(0.0, 1.0, 0.0);
        float life = aPuff.y;
        float t = uTime + aMore.z * 997.0;
        float age = fract(t / life + aPuff.x);
        float burst = aMore.y;
        float alpha = aMore.x;
        float rise = aPuff.w;
        if (burst > 0.5) {
          // the geyser's eruption: every minute or so (55 … 85 s, its own), ten seconds of it; a puff only if it set off
          // while the geyser was going (its cloud's a little after)
          float period = 55.0 + 30.0 * fract(aMore.z * 13.7);
          float born = t - age * life;
          float k = fract(born / period);
          float open = burst < 1.5 ? 1.0 - smoothstep(0.13, 0.16, k) : 1.0 - smoothstep(0.17, 0.24, k);
          open *= burst < 1.5 ? smoothstep(0.0, 0.01, k) : smoothstep(0.02, 0.05, k);
          alpha *= open;
        }
        // rising, slowing, swelling, carried off on the wind and turned by its eddies
        float up = burst > 0.5 && burst < 1.5 ? rise * (2.0 * age - age * age) : rise * (1.0 - (1.0 - age) * (1.0 - age) * (1.0 - age));
        float wind = uWind.z * 18.0;
        vec2 drift = uWind.xy * wind * age * life * (burst > 0.5 && burst < 1.5 ? 0.12 : 0.45);
        float sway = (burst > 0.5 && burst < 1.5 ? 0.6 : 2.2) * age;
        vec2 eddy = vec2(sin(age * 5.0 + aMore.z * 31.0 + aPuff.x * 6.3), cos(age * 4.0 + aMore.z * 17.0 + aPuff.x * 9.1)) * sway;
        // (a spring's veil from all over its water, a vent's plume from its throat)
        float spread = aVent.w < 0.5 ? aMore.w * 0.55 : aVent.w > 2.5 ? aMore.w * 0.4 : 0.6;
        // (the geyser's column flares as it rises, a fountain at its top)
        float flare = burst > 0.5 && burst < 1.5 ? 0.6 + 6.0 * age * age : 1.0;
        vec2 from = vec2(cos(aPuff.x * 41.0), sin(aPuff.x * 41.0)) * spread * fract(aPuff.x * 7.7) * flare;
        vec3 c = aVent.xyz - uOrigin + vec3(from.x + drift.x + eddy.x, up + aPuff.z * (aVent.w < 0.5 ? 0.12 : 0.3), from.y + drift.y + eddy.y);
        float size = aPuff.z * (burst > 0.5 && burst < 1.5 ? 0.4 + 1.4 * age : 0.6 + 1.9 * age);
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 upv = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 p = c + (right * position.x + upv * position.y) * size;
        vPos = p;
        vUv = position.xy * 2.0;
        vSeed = aMore.z * 7.0 + aPuff.x * 13.0;
        vWater = burst > 0.5 && burst < 1.5 ? 1.0 : 0.0;
        // in, a while, and out: thinner as it swells
        vAlpha = alpha * smoothstep(0.0, 0.1, age) * (1.0 - smoothstep(0.45, 1.0, age));
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FRAGMENT_PARS}
      ${GLSL_COMMON}
      varying vec2 vUv;
      varying float vAlpha;
      varying float vSeed;
      varying float vWater;
      void main() {
        #include <logdepthbuf_fragment>
        if (vAlpha < 0.004) discard;
        float d = length(vUv);
        float n = texture2D(tNoise, vUv * 0.23 + vec2(vSeed * 0.37, vSeed * 0.21)).r;
        // (soft all the way in: the puffs of a plume run together into one body of steam)
        float body = (1.0 - smoothstep(0.15 + 0.35 * n, 1.0, d)) * (0.75 + 0.25 * n);
        if (body < 0.01) discard;
        // a ball's light: lit on its sun side, a soft lavender shade, the edge between them a brush's
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 upv = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 toCam = normalize(cameraPosition - vPos);
        vec3 N = normalize(right * vUv.x + upv * vUv.y + toCam * sqrt(max(0.0, 1.0 - min(d * d, 1.0))));
        float lit = smoothstep(-0.12, 0.2, dot(N, uSunDir) + (n - 0.5) * 0.35);
        vec3 shade = uSkyColor * 0.95 + uBounceColor * 0.25;
        vec3 light = uSunColor * 0.62 + uSkyColor * 0.55;
        vec3 col = mix(shade, light, lit) * mix(vec3(1.0), vec3(0.92, 0.96, 1.0), vWater);
        // seen against the sun, steam glows
        float through = pow(max(dot(-toCam, uSunDir), 0.0), 6.0);
        col += uSunColor * through * 0.5;
        col = rtFog(col, vPos, cameraPosition);
        gl_FragColor = vec4(col, body * vAlpha);
      }`,
  });
}

// ---------------------------------------------------------------------------------------------- the view

interface Live {
  vents: readonly Vent[];
  apron: THREE.Mesh | null;
  anchor: [number, number, number];
}

/** the geothermal places near the road drawn: their springs, vents and steam (ModGame updates it with the road's distance) */
export class GeothermalView {
  private readonly live = new Map<number, Live>();
  private readonly apronMat = apronMaterial();
  private readonly steamMat = steamMaterial();
  private readonly steam: THREE.Mesh;
  private readonly steamGeo: THREE.InstancedBufferGeometry;
  private readonly aVent = new THREE.InstancedBufferAttribute(new Float32Array(MOST_PUFFS * 4), 4);
  private readonly aPuff = new THREE.InstancedBufferAttribute(new Float32Array(MOST_PUFFS * 4), 4);
  private readonly aMore = new THREE.InstancedBufferAttribute(new Float32Array(MOST_PUFFS * 4), 4);
  private planS = NaN;
  private readonly tp = new TerrainPoint();
  private readonly st = new SpineSample();
  /** how many vents and puffs are drawn (the harness asks) */
  vents = 0;
  puffs = 0;

  constructor(
    private readonly core: RenderCore,
    private readonly world: World,
  ) {
    this.steamGeo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    this.steamGeo.setIndex(quad.index);
    this.steamGeo.setAttribute('position', quad.getAttribute('position'));
    this.steamGeo.setAttribute('aVent', this.aVent);
    this.steamGeo.setAttribute('aPuff', this.aPuff);
    this.steamGeo.setAttribute('aMore', this.aMore);
    this.steamGeo.instanceCount = 0;
    this.steam = new THREE.Mesh(this.steamGeo, this.steamMat);
    this.steam.name = 'geothermal:steam';
    this.steam.frustumCulled = false;
    this.steam.renderOrder = 5;
    this.steam.visible = false;
    core.scene.add(this.steam);
    core.onRebase(() => {
      for (const l of this.live.values()) if (l.apron) core.place(l.apron, l.anchor[0], l.anchor[1], l.anchor[2]);
      (this.steamMat.uniforms.uOrigin.value as THREE.Vector3).copy(core.origin);
    });
    (this.steamMat.uniforms.uOrigin.value as THREE.Vector3).copy(core.origin);
  }

  update(s: number): void {
    const earth = this.world.earth;
    if (!earth || Math.abs(s - this.planS) < 120) return;
    this.planS = s;
    const keep = new Set<number>();
    for (const p of earth.pieces) {
      if (p.end < s - 1800 || p.start > s + 4500 || !isGeothermal(p)) continue;
      keep.add(p.index);
      if (this.live.has(p.index)) continue;
      const vents = ventsOf(this.world, p, this.tp, this.st);
      let apron: THREE.Mesh | null = null;
      const anchor: [number, number, number] = vents.length ? [vents[0].x, vents[0].y, vents[0].z] : [0, 0, 0];
      if (vents.length) {
        apron = new THREE.Mesh(apronGeometry(this.world, vents, anchor[0], anchor[1], anchor[2]), this.apronMat);
        apron.name = 'geothermal:springs';
        apron.renderOrder = 4;
        this.core.place(apron, anchor[0], anchor[1], anchor[2]);
        this.core.scene.add(apron);
      }
      this.live.set(p.index, { vents, apron, anchor });
    }
    let changed = false;
    for (const [k, l] of this.live) {
      if (keep.has(k)) continue;
      if (l.apron) {
        this.core.scene.remove(l.apron);
        l.apron.geometry.dispose();
      }
      this.live.delete(k);
      changed = true;
    }
    if (changed || keep.size !== this.lastKept) this.refillSteam();
    this.lastKept = keep.size;
  }
  private lastKept = -1;

  private refillSteam(): void {
    const rows: number[][] = [];
    let vents = 0;
    for (const l of this.live.values()) {
      for (const v of l.vents) puffsOf(v, rows);
      vents += l.vents.length;
    }
    const n = Math.min(MOST_PUFFS, rows.length);
    const V = this.aVent.array as Float32Array;
    const P = this.aPuff.array as Float32Array;
    const M = this.aMore.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const r = rows[i];
      V.set([r[0], r[1], r[2], r[3]], i * 4);
      P.set([r[4], r[5], r[6], r[7]], i * 4);
      M.set([r[8], r[9], r[10], r[11]], i * 4);
    }
    for (const a of [this.aVent, this.aPuff, this.aMore]) a.needsUpdate = true;
    this.steamGeo.instanceCount = n;
    this.steam.visible = n > 0;
    this.vents = vents;
    this.puffs = n;
  }
}
