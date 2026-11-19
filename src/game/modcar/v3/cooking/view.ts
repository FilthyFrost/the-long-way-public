/**
 * What is drawn of the stations (node C1): the workshop's kitchen corner, the cookware of the pot on its
 * flame, what is in the pot, the steam that grows as it cooks and the smoke when it catches, and the fire —
 * flames over a lit fire ring with its glow, a ring of flame under a pot on a stove or the hob.
 *
 * The kitchen corner and the cookware are the items' own models (tools/blender/items/cooking.py), painted as
 * the things lying about are (materials.ts: the car shading's paint and paint_b take the item's two colours).
 * Everything else is three instanced batches, one draw call each, for every station at once:
 *   - what is in the pots: small rounded lumps in the colours of the things put in (each item's paint),
 *     browning with the doneness — golden when just right, brown when overdone, near black when burnt;
 *   - the puffs: soft rounds turned to the camera, white steam and grey smoke, rising and spreading;
 *   - the flames: tongues of fire turned to the camera, flickering in the shader, drawn adding light, and a
 *     wide soft glow where a fire ring burns (bright enough to carry the night).
 * The batches are written every frame in render space (world less the floating origin): a few dozen
 * instances, nothing allocated. Puffs are born by a counter of the view's own, not by any dice of the game's.
 */
import * as THREE from 'three';
import { itemDef } from '../../../../core/modcar/items';
import { band } from '../../../../core/v3/cooking/steps';
import type { Method } from '../../../../core/v3/cooking/types';
import { GLSL_COMMON, GLSL_FRAGMENT_PARS, GLSL_VERTEX_PARS, globals } from '../../../render/shaderlib';
import { cloneModel, itemGlb } from '../../assets';
import type { GameContext } from '../../kernel/context';
import { applyMaterials, CarMaterials } from '../../materials';
import { KITCHEN } from './content';
import type { Cooking, CookShow, Station } from './system';

/** the cookware a way of cooking shows on its flame */
const WARE: Readonly<Record<Method, string>> = { mix: 'cook_bowl', roast: 'cook_spit', fry: 'cook_pan', stirfry: 'cook_wok', steam: 'cook_steamer', soup: 'cook_pot', stew: 'cook_pot', rice: 'cook_pot', bake: 'cook_dutch_oven', brew: 'cook_kettle', dry: '', smoke: '', pickle: '' };
/** how high over its cookware's base what is in it shows (m), how wide it spreads, and whether a lid hides it */
const FILL: Readonly<Record<string, [number, number, boolean]>> = {
  cook_bowl: [0.06, 0.06, false],
  cook_spit: [0.0, 0.2, false],
  cook_grill: [0.05, 0.1, false],
  cook_pan: [0.02, 0.07, false],
  cook_wok: [0.05, 0.08, false],
  cook_pot: [0.12, 0.07, true],
  cook_steamer: [0.1, 0.06, true],
  cook_dutch_oven: [0.1, 0.08, true],
  cook_kettle: [0.1, 0.05, true],
};
/** where the base of the cookware stands against a station's point (the point the mark aims at), by station: on the stones of a fire ring, on a stove's pot rests, on the hob's ring */
const BASE: Readonly<Record<string, number>> = { fire: -0.14, stove: -0.11, kitchen: 0.03, rack: 0, smoker: 0 };

/** how far out the burner's flames stand under each piece of cookware (m): just at its foot, so that their tips show past it */
const RING: Readonly<Record<string, number>> = { cook_pot: 0.118, cook_pan: 0.11, cook_wok: 0.07, cook_kettle: 0.08, cook_steamer: 0.12, cook_dutch_oven: 0.13, cook_grill: 0.12 };

/** how far what is in the pot has gone towards a toasted brown, by the band of its doneness: over dry heat, and in water or steam */
const DRY_BROWN = [0, 0.12, 0.38, 0.62, 0.88];
const WET_BROWN = [0, 0, 0.1, 0.32, 0.8];

const LUMPS = 64;
const PUFFS = 96;
const FLAMES = 64;

/** a fixed number in [0, 1) from a counter (the puffs' and the flames' own: never the game's dice) */
function hash(n: number): number {
  const v = Math.sin(n * 12.9898 + 4.1414) * 43758.5453;
  return v - Math.floor(v);
}

function paintedMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...globals },
    vertexShader: /* glsl */ `
      ${GLSL_VERTEX_PARS}
      attribute vec3 iColor;
      varying vec3 vAlbedo;
      void main() {
        mat4 m = modelMatrix * instanceMatrix;
        vec4 w = m * vec4(position, 1.0);
        vPos = w.xyz;
        vNormal = normalize(mat3(m) * normal);
        vAlbedo = iColor;
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FRAGMENT_PARS}
      ${GLSL_COMMON}
      varying vec3 vAlbedo;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vNormal);
        vec3 L = normalize(vec3(uSunDir.x, max(uSunDir.y, 0.25), uSunDir.z));
        float facing = dot(n, L);
        float tone = 0.5 + 0.38 * facing + 0.12 * n.y;
        // three steps of its own colour, the shade leaning to the sky (the art bible's way with small things)
        vec3 shade = vAlbedo * vec3(0.55, 0.6, 0.75);
        vec3 light = min(vAlbedo * vec3(1.2, 1.12, 0.98) + 0.02, vec3(0.95));
        vec3 albedo = mix(shade, vAlbedo, smoothstep(0.32, 0.44, tone));
        albedo = mix(albedo, light, smoothstep(0.64, 0.76, tone));
        vec3 col = albedo * (uSkyColor * 0.85 + uBounceColor * 0.5 + uSunColor * mix(0.06, 0.34, smoothstep(-0.1, 0.45, facing)));
        // (the flame under it lights it from below at night)
        col += albedo * vec3(1.0, 0.55, 0.25) * 0.5 * uWeather.w;
        col = rtFog(col, vPos, cameraPosition);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/**
 * The blending of what is drawn over the frame without being a thing of it (steam, smoke, flames): the colour
 * as `add` says (adding light, or laid over), the frame's alpha left as it was — the paint finish reads that
 * alpha as which material a pixel is (render/frame.ts: the cel-painted things' small ids are inked where two
 * meet), and a puff over the kitchen corner would otherwise draw an ink line round itself.
 */
function overlay(m: THREE.ShaderMaterial, add: boolean): THREE.ShaderMaterial {
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = add ? THREE.OneFactor : THREE.SrcAlphaFactor;
  m.blendDst = add ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor;
  m.blendEquationAlpha = THREE.AddEquation;
  m.blendSrcAlpha = THREE.ZeroFactor;
  m.blendDstAlpha = THREE.OneFactor;
  return m;
}

/** soft rounds turned to the camera: steam (white) and smoke (grey), as their alpha and colour say */
function puffMaterial(): THREE.ShaderMaterial {
  return overlay(new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { ...globals },
    vertexShader: /* glsl */ `
      ${GLSL_VERTEX_PARS}
      attribute vec4 iPuff;
      attribute vec3 iColor;
      varying vec2 vUv;
      varying float vAlpha;
      varying vec3 vCol;
      void main() {
        vec3 at = (modelMatrix * vec4(iPuff.xyz, 1.0)).xyz;
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        float size = abs(iPuff.w);
        vec3 w = at + (right * position.x + up * position.y) * size;
        vPos = w;
        vNormal = vec3(0.0, 1.0, 0.0);
        vUv = position.xy;
        vAlpha = iColor.z;
        vCol = vec3(iColor.x);
        // (y: how warm it is: smoke is grey, steam white)
        vCol = mix(vec3(0.24, 0.22, 0.21), vec3(1.0, 1.0, 0.98), iColor.x) * (0.9 + 0.1 * iColor.y);
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        #include <logdepthbuf_vertex>
        if (size < 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FRAGMENT_PARS}
      ${GLSL_COMMON}
      varying vec2 vUv;
      varying float vAlpha;
      varying vec3 vCol;
      void main() {
        #include <logdepthbuf_fragment>
        float r = length(vUv);
        // a soft round, a little lumpy at its edge (not a disc), lighter on its upper side as the sky lights it
        float lump = 0.06 * sin(atan(vUv.y, vUv.x) * 5.0 + vPos.y * 7.0);
        float a = (1.0 - smoothstep(0.25 + lump, 1.0 + lump, r)) * vAlpha;
        if (a < 0.01) discard;
        float top = 0.88 + 0.12 * vUv.y;
        vec3 lit = vCol * top * (uSkyColor * 0.6 + uSunColor * 0.32 + 0.32);
        lit = rtFog(lit, vPos, cameraPosition);
        gl_FragColor = vec4(lit, a);
      }`,
  }), false);
}

/** tongues of flame and the glow of a fire, adding light (iFlame.w < 0: a glow; its size the magnitude) */
function flameMaterial(): THREE.ShaderMaterial {
  return overlay(new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { ...globals },
    vertexShader: /* glsl */ `
      ${GLSL_VERTEX_PARS}
      uniform float uTime;
      attribute vec4 iFlame;
      attribute vec2 iMore;
      varying vec2 vUv;
      varying float vGlow;
      varying float vHot;
      void main() {
        vec3 at = (modelMatrix * vec4(iFlame.xyz, 1.0)).xyz;
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(0.0, 1.0, 0.0);
        float size = abs(iFlame.w);
        vGlow = iFlame.w < 0.0 ? 1.0 : 0.0;
        vHot = iMore.y;
        float flick = 0.82 + 0.18 * sin(uTime * (9.0 + iMore.x * 5.0) + iMore.x * 30.0) + 0.08 * sin(uTime * 23.0 + iMore.x * 11.0);
        vec3 w;
        if (vGlow > 0.5) {
          vec3 up2 = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          w = at + (right * position.x + up2 * position.y) * size * (0.92 + 0.08 * flick);
        } else {
          // a tongue: its foot on the fire, its tip licking up and swaying
          float h = position.y * 0.5 + 0.5;
          float sway = sin(uTime * 3.1 + iMore.x * 17.0 + h * 2.5) * 0.18 * h;
          w = at + right * (position.x * 0.42 + sway) * size + up * (h * 1.6 * flick) * size;
        }
        vUv = position.xy;
        vPos = w;
        vNormal = vec3(0.0, 1.0, 0.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        #include <logdepthbuf_vertex>
        if (size < 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FRAGMENT_PARS}
      uniform vec4 uWeather;
      varying vec2 vUv;
      varying float vGlow;
      varying float vHot;
      void main() {
        #include <logdepthbuf_fragment>
        if (vGlow > 0.5) {
          float r = length(vUv);
          float g = pow(max(0.0, 1.0 - r), 2.2);
          // (by day a fire is a warm smudge; by night it lights the ground round it)
          gl_FragColor = vec4(vec3(1.0, 0.46, 0.15) * g * mix(0.14, 0.2, uWeather.w), 1.0);
          return;
        }
        // a teardrop: wide at the foot, drawn to a point
        float h = vUv.y * 0.5 + 0.5;
        float half_w = 0.75 * sqrt(max(0.0, 1.0 - h)) * (0.55 + 0.45 * smoothstep(0.0, 0.25, h));
        float edge = abs(vUv.x) / max(0.001, half_w);
        float body = (1.0 - smoothstep(0.6, 1.0, edge)) * (1.0 - smoothstep(0.85, 1.0, h));
        if (body < 0.01) discard;
        float core = (1.0 - smoothstep(0.0, 0.55, edge)) * (1.0 - smoothstep(0.1, 0.6, h));
        // a gas burner's blue at the foot (vHot 1), a wood fire's orange (0); a white-gold heart
        vec3 outer = mix(vec3(1.0, 0.36, 0.06), vec3(0.22, 0.42, 1.0), vHot * (1.0 - 0.55 * smoothstep(0.45, 0.95, h)));
        vec3 col = mix(outer, mix(vec3(1.0, 0.86, 0.45), vec3(0.6, 0.8, 1.0), vHot), core);
        gl_FragColor = vec4(col * body * mix(mix(1.0, 0.7, vHot), 0.95, uWeather.w), 1.0);
      }`,
  }), true);
}

/** a quad of two triangles, −1 … 1 */
function quad(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

function attr(mesh: THREE.InstancedMesh, name: string, n: number, size: number): Float32Array {
  const a = new Float32Array(n * size);
  const b = new THREE.InstancedBufferAttribute(a, size);
  b.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute(name, b);
  return a;
}

interface Ware {
  /** the model shown for this cookware id ('' none), and its object */
  id: string;
  obj: THREE.Group | null;
  /** a model being loaded for this id */
  want: string;
}

export class CookView implements CookShow {
  private readonly mats = new CarMaterials();
  private kitchen: THREE.Group | null = null;
  private readonly root = new THREE.Group();
  private readonly ware = new Map<Station, Ware>();
  private readonly lumps: THREE.InstancedMesh;
  private readonly lumpColor: Float32Array;
  private readonly puffs: THREE.InstancedMesh;
  private readonly puffData: Float32Array;
  private readonly puffColor: Float32Array;
  private readonly flames: THREE.InstancedMesh;
  private readonly flameData: Float32Array;
  private readonly flameMore: Float32Array;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();
  /** the puffs alive: where (world, relative to nothing: render space is written each frame), how old, how long they live, steam or smoke */
  private readonly px = new Float64Array(PUFFS);
  private readonly py = new Float64Array(PUFFS);
  private readonly pz = new Float64Array(PUFFS);
  private readonly age = new Float32Array(PUFFS).fill(1);
  private readonly life = new Float32Array(PUFFS).fill(1);
  private readonly kind = new Float32Array(PUFFS);
  private readonly drift = new Float32Array(PUFFS * 2);
  private next = 0;
  private born = 0;
  /** each station's share of a puff owed (fractions carried from frame to frame), by its place in the list */
  private readonly owe = new Float32Array(64);

  constructor(
    private readonly ctx: GameContext,
    c: Cooking,
  ) {
    void c;
    this.root.name = 'cooking';
    ctx.core.scene.add(this.root);
    // what is in the pots
    const lumpGeo = new THREE.IcosahedronGeometry(1, 1);
    this.lumps = new THREE.InstancedMesh(lumpGeo, paintedMaterial(), LUMPS);
    this.lumps.name = 'cooking:lumps';
    this.lumps.frustumCulled = false;
    this.lumps.count = 0;
    this.lumpColor = attr(this.lumps, 'iColor', LUMPS, 3);
    // the steam and the smoke
    this.puffs = new THREE.InstancedMesh(quad(), puffMaterial(), PUFFS);
    this.puffs.name = 'cooking:puffs';
    this.puffs.frustumCulled = false;
    this.puffs.count = 0;
    this.puffs.renderOrder = 8;
    this.puffData = attr(this.puffs, 'iPuff', PUFFS, 4);
    this.puffColor = attr(this.puffs, 'iColor', PUFFS, 3);
    // the fire
    this.flames = new THREE.InstancedMesh(quad(), flameMaterial(), FLAMES);
    this.flames.name = 'cooking:flames';
    this.flames.frustumCulled = false;
    this.flames.count = 0;
    this.flames.renderOrder = 9;
    this.flameData = attr(this.flames, 'iFlame', FLAMES, 4);
    this.flameMore = attr(this.flames, 'iMore', FLAMES, 2);
    for (const mesh of [this.lumps, this.puffs, this.flames]) {
      mesh.layers.disableAll();
      mesh.layers.enable(0);
      this.root.add(mesh);
    }
    // the kitchen corner, where a journey began at the workshop
    if (ctx.params.start === 'garage') {
      void itemGlb('kitchen_corner').then((m) => {
        if (!m || !this.root.parent) return;
        const g = cloneModel(m);
        applyMaterials(g, this.mats.look('cook:kitchen', { paint: 0x5d7d8c, paint2: 0x3a3330, matte: 0.6 }));
        g.rotation.y = -KITCHEN.heading;
        this.kitchen = g;
        this.root.add(g);
      });
    }
  }

  /** the cookware model a station shows now ('' none): a roast on a spit over a fire ring, on a grill anywhere else */
  private wareOf(st: Station): string {
    const p = st.pot;
    if (!p) return '';
    if (p.phase === 'pick' && p.items.length === 0) return '';
    if (p.method === 'roast' && st.kind !== 'fire') return 'cook_grill';
    return WARE[p.method];
  }

  private wareFor(st: Station, id: string): THREE.Group | null {
    let w = this.ware.get(st);
    if (!w) {
      w = { id: '', obj: null, want: '' };
      this.ware.set(st, w);
    }
    if (w.id === id) return w.obj;
    if (w.want === id) return null;
    w.want = id;
    if (w.obj) {
      w.obj.removeFromParent();
      w.obj = null;
      w.id = '';
    }
    if (!id) {
      w.id = '';
      return null;
    }
    const wanted = w;
    void itemGlb(itemDef(id).model).then((m) => {
      if (!m || wanted.want !== id || !this.root.parent) return;
      const g = cloneModel(m);
      const d = itemDef(id);
      applyMaterials(g, this.mats.look(`cook:${id}`, { paint: d.paint, paint2: d.paint2, matte: 0.5 }));
      wanted.obj = g;
      wanted.id = id;
      this.root.add(g);
    });
    return null;
  }

  update(dt: number, ctx: GameContext, c: Cooking): void {
    const core = ctx.core;
    const o = core.origin;
    let nl = 0;
    let nf = 0;
    if (this.kitchen) core.place(this.kitchen, KITCHEN.x, 0, KITCHEN.z);
    const list = c.stations;
    for (let i = 0; i < list.length; i++) {
      const st = list[i];
      const id = this.wareOf(st);
      const ware = this.wareFor(st, id);
      const baseY = st.y + (BASE[st.kind] ?? 0);
      const p = st.pot;
      if (ware) {
        ware.visible = true;
        core.place(ware, st.x, id === 'cook_spit' ? baseY + 0.42 : baseY, st.z);
        ware.rotation.y = -st.heading + (id === 'cook_spit' ? Math.PI / 2 : 0.6);
        if (id === 'cook_spit') this.standFor(ware);
      }
      // what is in the pot, browning as it cooks (a lidded pot hides it)
      const fill = FILL[id];
      if (p && fill && !fill[2] && ware) {
        const d = p.pot.d;
        const b = band(d);
        const dry = p.method === 'roast' || p.method === 'fry' || p.method === 'stirfry' || p.method === 'bake';
        const brown = (dry ? DRY_BROWN : WET_BROWN)[b];
        const n = p.items.length;
        for (let k = 0; k < n && nl < LUMPS; k++) {
          const it = p.items[k];
          const paint = itemDef(it.item).paint;
          this.c.setHex(paint);
          // (toward a toasted brown, then toward char)
          this.c.r += (0.32 - this.c.r) * brown;
          this.c.g += (0.16 - this.c.g) * brown;
          this.c.b += (0.07 - this.c.b) * brown;
          if (b === 4) this.c.multiplyScalar(0.45);
          const a = k * 2.39996 + i;
          const rr = id === 'cook_spit' ? 0 : fill[1] * (0.25 + 0.75 * ((k * 0.618) % 1));
          const along = id === 'cook_spit' ? (k - (n - 1) / 2) * 0.07 : 0;
          const cs = Math.cos(-st.heading + Math.PI / 2);
          const sn = Math.sin(-st.heading + Math.PI / 2);
          const lx = st.x + Math.cos(a) * rr + along * cs;
          const lz = st.z + Math.sin(a) * rr - along * sn;
          const ly = (id === 'cook_spit' ? baseY + 0.42 : baseY + fill[0]) + 0.012;
          const size = id === 'cook_spit' ? 0.042 : 0.024 + 0.006 * ((k * 0.37) % 1);
          this.v.set(lx - o.x, ly - o.y, lz - o.z);
          this.s.set(size * 1.15, size * (id === 'cook_spit' ? 1 : 0.75), size);
          this.q.identity();
          this.m.compose(this.v, this.q, this.s);
          this.lumps.setMatrixAt(nl, this.m);
          this.lumpColor[nl * 3] = this.c.r;
          this.lumpColor[nl * 3 + 1] = this.c.g;
          this.lumpColor[nl * 3 + 2] = this.c.b;
          nl++;
        }
      }
      // the fire: a ring's flames and its glow while it burns; a burner's ring of flame under a pot on it
      const ringLit = st.kind === 'fire' && st.fire > 0;
      const burner = (st.kind === 'stove' || st.kind === 'kitchen') && p?.lit === true && p.heat > 0;
      if (ringLit) {
        const fy = st.y - 0.24;
        const k0 = Math.min(1, st.fire / 20);
        for (let k = 0; k < 7 && nf < FLAMES - 1; k++) {
          const a = k * 0.8976 + 0.3;
          const r = k === 0 ? 0 : 0.13 + 0.04 * (k % 2);
          nf = this.flame(nf, st.x + Math.cos(a) * r - o.x, fy - o.y, st.z + Math.sin(a) * r - o.z, (k === 0 ? 0.3 : 0.2 + 0.04 * (k % 3)) * k0, i * 7 + k, 0);
        }
        nf = this.flame(nf, st.x - o.x, fy + 0.3 - o.y, st.z - o.z, -1.3 * k0, i, 0);
      } else if (burner && p) {
        // (round the foot of the pot, so that the tips show past it: a low flame a blue rim, a high one licking up its sides)
        const fy = baseY - 0.012;
        const size = 0.018 + 0.014 * p.heat;
        const r = RING[id] ?? 0.1;
        for (let k = 0; k < 12 && nf < FLAMES; k++) {
          const a = k * 0.5236 + i;
          nf = this.flame(nf, st.x + Math.cos(a) * r - o.x, fy - o.y, st.z + Math.sin(a) * r - o.z, size, i * 13 + k, 1);
        }
      }
      // steam as it cooks, more the nearer done; smoke once it catches
      if (p && p.lit && p.heat > 0 && i < this.owe.length) {
        const d = p.pot.d;
        const b = band(d);
        const steam = d > 0.2 ? (1.5 + 5 * Math.min(1, d)) * (0.5 + 0.25 * p.heat) * (b >= 4 ? 0.15 : 1) : 0;
        const smoke = b >= 4 ? 9 : b === 3 ? 3 : p.most >= 4 ? 2 : 0;
        this.owe[i] += (steam + smoke) * dt;
        const topY = baseY + (fill ? fill[0] + 0.08 : 0.2);
        while (this.owe[i] >= 1) {
          this.owe[i] -= 1;
          this.puff(st.x, topY, st.z, smoke > 0 && hash(this.born + 0.5) < smoke / (steam + smoke) ? 0 : 1);
        }
      } else if (i < this.owe.length) this.owe[i] = 0;
    }
    // the puffs: rising, spreading, thinning
    let np = 0;
    for (let k = 0; k < PUFFS; k++) {
      if (this.age[k] >= this.life[k]) continue;
      this.age[k] += dt;
      const t = this.age[k] / this.life[k];
      if (t >= 1) continue;
      const smoke = this.kind[k] === 0;
      const a = this.age[k];
      // (it rises quick off the pot and slows as it spreads; the drift carries it off sideways more and more)
      const rise = (smoke ? 0.42 : 0.5) * a * (1 - 0.35 * t);
      const x = this.px[k] + this.drift[k * 2] * a * (0.4 + t);
      const z = this.pz[k] + this.drift[k * 2 + 1] * a * (0.4 + t);
      const j = np * 4;
      this.puffData[j] = x - o.x;
      this.puffData[j + 1] = this.py[k] + rise - o.y;
      this.puffData[j + 2] = z - o.z;
      this.puffData[j + 3] = smoke ? 0.07 + 0.3 * t : 0.05 + 0.24 * t;
      this.puffColor[np * 3] = smoke ? 0 : 1;
      this.puffColor[np * 3 + 1] = 1 - t;
      // (it thickens over its first moments, then thins away: steam quickly, smoke slowly)
      const fade = smoke ? 1 - t : (1 - t) * (1 - t);
      this.puffColor[np * 3 + 2] = (smoke ? 0.62 : 0.3) * Math.min(1, t * (smoke ? 6 : 8)) * fade;
      np++;
    }
    this.lumps.count = nl;
    this.flames.count = nf;
    this.puffs.count = np;
    if (nl) {
      this.lumps.instanceMatrix.needsUpdate = true;
      (this.lumps.geometry.getAttribute('iColor') as THREE.InstancedBufferAttribute).needsUpdate = true;
    }
    if (nf) {
      (this.flames.geometry.getAttribute('iFlame') as THREE.InstancedBufferAttribute).needsUpdate = true;
      (this.flames.geometry.getAttribute('iMore') as THREE.InstancedBufferAttribute).needsUpdate = true;
    }
    if (np) {
      (this.puffs.geometry.getAttribute('iPuff') as THREE.InstancedBufferAttribute).needsUpdate = true;
      (this.puffs.geometry.getAttribute('iColor') as THREE.InstancedBufferAttribute).needsUpdate = true;
    }
    // the cookware of stations that are gone or have nothing on them (looked at now and then: the map's walk is no per-frame thing)
    if (++this.sweep >= 30) {
      this.sweep = 0;
      for (const [st, w] of this.ware) {
        if (list.includes(st) && this.wareOf(st)) continue;
        w.obj?.removeFromParent();
        this.ware.delete(st);
      }
    }
  }

  private sweep = 0;

  /** two forked sticks under a spit (made once, hung on the spit's own model so that they go where it goes) */
  private standFor(spit: THREE.Group): void {
    if (spit.userData.stand) return;
    spit.userData.stand = true;
    const g = new THREE.Group();
    const stick = new THREE.CylinderGeometry(0.014, 0.018, 0.62, 7);
    const fork = new THREE.CylinderGeometry(0.008, 0.011, 0.1, 6);
    const wood = new THREE.MeshBasicMaterial({ name: 'wood' });
    for (const x of [-0.27, 0.27]) {
      const s = new THREE.Mesh(stick, wood);
      s.position.set(x, -0.3, 0);
      g.add(s);
      for (const t of [-0.45, 0.45]) {
        const f = new THREE.Mesh(fork, wood);
        f.position.set(x + Math.sin(t) * 0.035, 0.03, 0);
        f.rotation.z = -t;
        g.add(f);
      }
    }
    applyMaterials(g, this.mats.look('cook:stand', { paint: 0x7a4a2a, paint2: 0x5a3a22, matte: 0.8 }));
    spit.add(g);
  }

  /** one flame (size < 0: a glow of that size) at a render-space point */
  private flame(n: number, x: number, y: number, z: number, size: number, seed: number, gas: number): number {
    const j = n * 4;
    this.flameData[j] = x;
    this.flameData[j + 1] = y;
    this.flameData[j + 2] = z;
    this.flameData[j + 3] = size;
    this.flameMore[n * 2] = hash(seed);
    this.flameMore[n * 2 + 1] = gas;
    return n + 1;
  }

  /** a puff born over a pot (world): 1 steam, 0 smoke */
  private puff(x: number, y: number, z: number, steam: number): void {
    const k = this.next;
    this.next = (this.next + 1) % PUFFS;
    this.born++;
    const h1 = hash(this.born);
    const h2 = hash(this.born + 0.37);
    this.px[k] = x + (h1 - 0.5) * 0.08;
    this.py[k] = y;
    this.pz[k] = z + (h2 - 0.5) * 0.08;
    this.age[k] = 0;
    this.life[k] = steam ? 1.1 + h1 * 0.7 : 2.4 + h2;
    this.kind[k] = steam;
    this.drift[k * 2] = (h2 - 0.5) * 0.3;
    this.drift[k * 2 + 1] = (h1 - 0.5) * 0.3;
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const mesh of [this.lumps, this.puffs, this.flames]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.mats.dispose();
    this.ware.clear();
  }
}
