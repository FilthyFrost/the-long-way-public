/**
 * A place's glaciers drawn (V9, docs/V3/nodes/V9-heroes.md; where they lie: core/world/earth/glaciers.ts): each a
 * tongue of ice draped down the land from its source to its snout, thick in its middle and thin at its edges, wide
 * in the snow and narrowing as it comes down, its snout rounded and standing as a blue cliff.
 *
 * Painted (its own shader, lit as the land is): the snow white where it is fed, high up; below its line the ice —
 * pale blue-white, its crevasses dark blue lines across it, bowed down the middle as the ice flows fastest there (the
 * arcs a glacier wears), a dark medial moraine along it, its margins grey with the rock it carries; its snout's cliff
 * a deep blue. The sun's glint on the ice, the air's haze over it.
 */
import * as THREE from 'three';
import type { World } from '../../core/world/terrain';
import { TerrainPoint } from '../../core/world/terrain';
import { SpineSample } from '../../core/world/spine';
import { glaciersOf, hasGlaciers, type Glacier } from '../../core/world/earth/glaciers';
import type { RenderCore } from '../render/core';
import { GLSL_COMMON, GLSL_FRAGMENT_PARS, globals } from '../render/shaderlib';

const ACROSS = 18;

function resample(path: readonly number[], step: number): number[] {
  const pts: number[] = [];
  const n = path.length / 3;
  const seg: number[] = [];
  let total = 0;
  for (let i = 0; i + 1 < n; i++) {
    const d = Math.hypot(path[i * 3 + 3] - path[i * 3], path[i * 3 + 5] - path[i * 3 + 2]);
    seg.push(d);
    total += d;
  }
  const m = Math.max(2, Math.ceil(total / step));
  let i = 0;
  let acc = 0;
  for (let k = 0; k <= m; k++) {
    const want = (k / m) * total;
    while (i < seg.length - 1 && acc + seg[i] < want) acc += seg[i++];
    const t = seg[i] > 0 ? Math.min(1, (want - acc) / seg[i]) : 0;
    for (let c = 0; c < 3; c++) pts.push(path[i * 3 + c] + (path[i * 3 + 3 + c] - path[i * 3 + c]) * t);
  }
  return pts;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function glacierGeometry(world: World, gs: readonly Glacier[], ax: number, ay: number, az: number): THREE.BufferGeometry {
  const tp = new TerrainPoint();
  const pos: number[] = [];
  const ice: number[] = [];
  const idx: number[] = [];
  for (const gl of gs) {
    const pts = resample(gl.path, 22);
    const n = pts.length / 3;
    const base = pos.length / 3;
    let along = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) along += Math.hypot(pts[i * 3] - pts[i * 3 - 3], pts[i * 3 + 2] - pts[i * 3 - 1]);
      const t = i / (n - 1);
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(n - 1, i + 1);
      let tx = pts[i1 * 3] - pts[i0 * 3];
      let tz = pts[i1 * 3 + 2] - pts[i0 * 3 + 2];
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl;
      tz /= tl;
      // wide in the snow, narrowing down, its snout rounded
      let w = gl.w0 + (gl.w1 - gl.w0) * Math.pow(t, 0.8);
      w *= 1 + 0.12 * Math.sin(t * 7 + gl.seed * 20);
      if (t > 0.86) w *= Math.sqrt(Math.max(0.02, 1 - ((t - 0.86) / 0.14) ** 2));
      for (let j = 0; j <= ACROSS; j++) {
        const u = (j / ACROSS) * 2 - 1;
        const x = pts[i * 3] - tz * u * w * 0.5;
        const z = pts[i * 3 + 2] + tx * u * w * 0.5;
        world.shape(x, z, tp);
        // thick in the middle, thin at the edges; the source fed thin out of its snowfield; its snout a cliff
        // (its margins hug the land: no edge stands proud of it)
        let thick = (0.3 + 24 * Math.pow(Math.max(0, 1 - u * u), 1.1)) * smooth(0, 0.08, t);
        thick *= 1 - 0.85 * smooth(0.95, 1, t);
        pos.push(x - ax, tp.h + thick - ay, z - az);
        ice.push(u, along, t, gl.seed);
      }
    }
    for (let i = 0; i + 1 < n; i++)
      for (let j = 0; j < ACROSS; j++) {
        const a = base + i * (ACROSS + 1) + j;
        const b = a + 1;
        const c = a + ACROSS + 1;
        const d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aIce', new THREE.Float32BufferAttribute(ice, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

function glacierMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...globals },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute vec4 aIce;
      varying vec3 vPos;
      varying vec3 vNormal;
      varying vec4 vIce;
      void main() {
        vIce = aIce;
        vNormal = normalize(normal);
        vec4 w = modelMatrix * vec4(position, 1.0);
        vPos = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FRAGMENT_PARS}
      ${GLSL_COMMON}
      varying vec4 vIce;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vNormal);
        if (!gl_FrontFacing) n = -n;
        float u = vIce.x;
        float along = vIce.y;
        float t = vIce.z;
        float seed = vIce.w;
        vec2 w = rtWorldXZ(vPos);
        float n1 = rtNoiseAt(w + seed * 300.0, 60.0).r;
        float n2 = rtNoiseAt(w + seed * 77.0, 9.0).g;
        float dist = length(vPos - cameraPosition);
        // the snow where it is fed, the ice below its line
        float line = 0.34 + 0.12 * (n1 - 0.5) + 0.06 * u * u;
        float iceAmt = smoothstep(line - 0.03, line + 0.05, t);
        vec3 snow = vec3(0.9, 0.93, 0.97);
        vec3 iceLit = vec3(0.68, 0.84, 0.94);
        vec3 iceBlue = vec3(0.34, 0.6, 0.82);
        vec3 deep = vec3(0.05, 0.2, 0.42);
        vec3 col = mix(iceLit, iceBlue, smoothstep(0.35, 0.8, n2) * 0.5);
        // crevasses across it, bowed down the middle where it flows fastest; finer than a pixel far off, they fade
        float bow = along / 44.0 - (1.0 - u * u) * 1.6 + (n2 - 0.5) * 0.7;
        float cv = abs(fract(bow) - 0.5) * 2.0;
        float cw = 0.07 + 0.05 * n1;
        float crev = (1.0 - smoothstep(1.0 - cw - fwidth(bow) * 2.0, 1.0 - cw * 0.3, 1.0 - cv)) * smoothstep(0.08, 0.2, abs(u)) * (1.0 - smoothstep(900.0, 2400.0, dist));
        // (in runs, broken: no crevasse crosses the whole ice)
        crev *= smoothstep(0.55, 0.75, rtNoiseAt(w + 13.0, 70.0).b + 0.1 * n2);
        col = mix(col, deep, crev * 0.85);
        // a medial moraine down its middle, its margins grey with rock
        float med = 1.0 - smoothstep(0.03, 0.07 + 0.03 * n2, abs(u - 0.12 * sin(seed * 31.0) - 0.05 * (n1 - 0.5)));
        col = mix(col, vec3(0.3, 0.29, 0.28), med * 0.75);
        // (its margins grey with the rock it carries, ragged, the snow's white beyond: the lateral moraines)
        col = mix(col, vec3(0.45, 0.43, 0.4), smoothstep(0.7, 0.92, abs(u) + (n2 - 0.5) * 0.2 + (n1 - 0.5) * 0.15) * 0.85);
        vec3 albedo = mix(snow, col, iceAmt);
        // its snout's cliff, and any steep face of ice: a deep blue
        albedo = mix(albedo, mix(iceBlue, deep, 0.45), smoothstep(0.55, 0.25, n.y) * iceAmt);
        float sh = rtShadow(vPos, n);
        vec3 lit = rtCelAt(albedo, n, sh, vPos);
        // the sun's glint on wet ice
        vec3 V = normalize(cameraPosition - vPos);
        vec3 H = normalize(V + uSunDir);
        lit += uSunColor * 0.35 * smoothstep(0.96, 0.995, dot(n, H)) * sh * iceAmt;
        lit = rtFog(lit, vPos, cameraPosition);
        gl_FragColor = vec4(lit, 1.0);
      }`,
  });
}

interface Live {
  gs: readonly Glacier[];
  mesh: THREE.Mesh | null;
  anchor: [number, number, number];
}

/** the glaciers of the places near the road (ModGame updates it with the road's distance) */
export class GlacierView {
  private readonly live = new Map<number, Live>();
  private readonly mat = glacierMaterial();
  private readonly tp = new TerrainPoint();
  private readonly st = new SpineSample();
  private planS = NaN;
  /** how many are drawn (the harness asks) */
  glaciers = 0;

  constructor(
    private readonly core: RenderCore,
    private readonly world: World,
  ) {
    core.onRebase(() => {
      for (const l of this.live.values()) if (l.mesh) core.place(l.mesh, l.anchor[0], l.anchor[1], l.anchor[2]);
    });
  }

  near(): Glacier[] {
    const out: Glacier[] = [];
    for (const l of this.live.values()) out.push(...l.gs);
    return out;
  }

  update(s: number): void {
    const earth = this.world.earth;
    if (!earth || Math.abs(s - this.planS) < 150) return;
    this.planS = s;
    const keep = new Set<number>();
    for (const p of earth.pieces) {
      if (p.end < s - 3000 || p.start > s + 6000 || !hasGlaciers(p)) continue;
      keep.add(p.index);
      if (this.live.has(p.index)) continue;
      const gs = glaciersOf(this.world, p, this.tp, this.st);
      let mesh: THREE.Mesh | null = null;
      const anchor: [number, number, number] = gs.length ? [gs[0].path[0], gs[0].path[1], gs[0].path[2]] : [0, 0, 0];
      if (gs.length) {
        mesh = new THREE.Mesh(glacierGeometry(this.world, gs, anchor[0], anchor[1], anchor[2]), this.mat);
        mesh.name = 'glaciers:ice';
        this.core.place(mesh, anchor[0], anchor[1], anchor[2]);
        this.core.scene.add(mesh);
      }
      this.live.set(p.index, { gs, mesh, anchor });
    }
    for (const [k, l] of this.live) {
      if (keep.has(k)) continue;
      if (l.mesh) {
        this.core.scene.remove(l.mesh);
        l.mesh.geometry.dispose();
      }
      this.live.delete(k);
    }
    let n = 0;
    for (const l of this.live.values()) n += l.gs.length;
    this.glaciers = n;
  }
}
