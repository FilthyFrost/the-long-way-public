/**
 * The spires drawn (V5, docs/V3/nodes/V5-landforms.md; where they stand and how big: core/world/earth/spires.ts): a
 * pillar mountain's pillars, a karst's towers, a coast's sea stacks — rock the land's height field cannot hold.
 *
 * Each is turned on a lathe of its own, ring over ring a few metres apart, its section a rounded block (squarer in a
 * sandstone pillar, rounder in a karst tower) with a few lobes of its own; the joints of the rock cut down its sides
 * as grooves, some the whole way, some part of it; its bedding a ledge every ten or twenty metres where it steps in or
 * out; its foot spread into the scree, a stack's notched by the waves at the waterline, its top rounded off — a
 * pillar's and a stack's nearly flat, a tower's a dome. A hand's roughness over all of it, so no face is flat.
 * Painted as the stones are (render/materials.ts surfaceMaterial with its brush): the rock's own light and shade in the
 * place's light, each bed a little its own, the rain's dark streaks down from the ledges, moss on what is level, a
 * karst tower hung with green; a stack dark and wet low down with a band of salt over it. Trees on their tops and
 * along their ledges are the far woods' painted cards (render/materials.ts farWoodsMaterial), in the land's palette.
 * A stack's foot is ringed with the sea's white. A place's spires one mesh, their trees one draw, their surf another.
 */
import * as THREE from 'three';
import type { World } from '../../core/world/terrain';
import { TerrainPoint } from '../../core/world/terrain';
import { SpineSample } from '../../core/world/spine';
import { hasSpires, spiresOf, type Spire } from '../../core/world/earth/spires';
import { rock } from '../../core/earth/rocks';
import { BIOMES } from '../../core/world/biomes';
import { hexOf, stoneColour } from '../../core/world/earth/palette';
import type { RenderCore } from '../render/core';
import { farWoodsMaterial } from '../render/materials';
import { rockMaterial, type RockPaint } from '../render/rockMaterial';
import { carveArch, carveSpire, strewBlocks, type RockOut, type RockPerch } from './rockForms';
import { GLSL_COMMON, GLSL_FRAGMENT_PARS, globals } from '../render/shaderlib';
import { buildWoodsCard } from './worldBuild';

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------------------------- the rock

/** where one of the woods' cards stands on a spire: its top, its ledges */
interface Perch {
  x: number;
  y: number;
  z: number;
  /** a card's size (a card is 38 m across at 1), and how far it is sunk (m) */
  size: number;
  sink: number;
}

/** how its rock is painted (render/rockMaterial.ts): its rock's two tones in the place's light, the place's turf and woods */
function paintOf(region: number, rockId: Parameters<typeof rock>[0], sea: boolean): RockPaint {
  const rk = rock(rockId);
  const pal = BIOMES[region]?.earth?.palette;
  const lit = pal ? stoneColour(pal, rk.lit) : rk.lit;
  const shade = pal ? stoneColour(pal, rk.shade) : rk.shade;
  const moss = pal ? hexOf({ ...pal.grass, L: pal.grass.L * 0.86 }, pal.cast) : 0x6f8f45;
  const wood = pal ? hexOf({ ...pal.woods, L: pal.woods.L * 0.92 }, pal.cast) : 0x3d6b3a;
  const f = (h: number): THREE.Color => new THREE.Color(h).convertSRGBToLinear();
  const bedded = rockId === 'sandstone_red' || rockId === 'sandstone_pale' || rockId === 'limestone' || rockId === 'dolomite' || rockId === 'shale' || rockId === 'schist';
  return { lit: f(lit), shade: f(shade), moss: f(moss), wood: f(wood), sea: sea ? 1 : 0, beds: bedded ? 1 : rockId === 'granite' ? 0.35 : 0.6 };
}

/**
 * A piece's spires as one mesh (about (ax, ay, az)) — each carved in beds and blocks, fallen blocks round its foot
 * (scene/rockForms.ts) — and where their trees stand. `ground`: the land's height at a place (a stack's: its sea floor).
 */
function spireGeometry(spires: readonly Spire[], ax: number, ay: number, az: number, perches: Perch[], ground: (x: number, z: number) => number): THREE.BufferGeometry {
  const out: RockOut = { pos: [], idx: [], rock: [] };
  const found: RockPerch[] = [];
  for (const sp of spires) {
    const from = found.length;
    const rnd = mulberry(Math.floor(sp.seed * 4294967295) ^ 0x7a11);
    if (sp.kind === 'arch') {
      const span = sp.span ?? sp.r * 5;
      carveArch({ ...sp, span, foot: sp.foot - 3 }, out, ax, ay, az, found);
      for (const e of [-0.5, 0.5]) strewBlocks(sp.x + Math.cos(sp.yaw) * span * e, sp.z + Math.sin(sp.yaw) * span * e, sp.r * 1.5, sp.level, 12, sp.seed + e, true, sp.green, out, ax, ay, az, ground);
    } else {
      carveSpire({ form: sp.kind, x: sp.x, z: sp.z, level: sp.level, foot: sp.kind === 'stack' ? sp.foot - 2 : sp.foot - 4, h: sp.h, r: sp.r, depth: sp.depth, yaw: sp.yaw, green: sp.green, seed: sp.seed }, out, ax, ay, az, found);
      strewBlocks(sp.x, sp.z, sp.r * (sp.kind === 'tower' ? 1.25 : 1.15), sp.level, sp.kind === 'tower' ? 10 : 9 + Math.floor(sp.r / 3), sp.seed, sp.kind === 'stack', sp.green, out, ax, ay, az, ground);
    }
    if (sp.green <= 0.05) continue;
    // its trees: on a karst's tower a wood over its dome and on every ledge; on a pillar pines on its top and its
    // ledges; on a sea's rock low scrub on its turf and hardly any on its sides
    const wooded = sp.kind === 'tower' ? 1 : sp.kind === 'pillar' ? 0.75 : 0.3;
    for (let i = from; i < found.length; i++) {
      const p = found[i];
      if (p.top) {
        const n = Math.round((sp.kind === 'tower' ? 5 + p.room / 5 : 1 + p.room / 5) * (0.5 + 0.7 * sp.green) * (sp.kind === 'stack' || sp.kind === 'arch' ? 0.6 : 1));
        for (let k = 0; k < n; k++) {
          const a = rnd() * 6.283;
          const d = p.room * (sp.kind === 'tower' ? 0.2 + 1.3 * rnd() : 0.75 * Math.sqrt(rnd()));
          // (a tower's wood comes down over the shoulders of its dome)
          const drop = sp.kind === 'tower' ? sp.h * 0.3 * Math.pow(Math.min(1, d / (p.room * 1.7)), 2) : 0;
          perches.push({ x: p.x + Math.cos(a) * d, y: p.y - drop, z: p.z + Math.sin(a) * d * sp.depth, size: (0.16 + 0.22 * rnd()) * (0.6 + 0.5 * wooded) * Math.min(1.5, 0.7 + p.room / 26), sink: 1.6 });
        }
      } else if (rnd() < wooded * sp.green * 1.2) {
        perches.push({ x: p.x, y: p.y, z: p.z, size: Math.min(0.26, 0.07 + 0.045 * p.room) * (0.7 + 0.6 * rnd()), sink: 0.5 });
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  g.setAttribute('aRock', new THREE.Float32BufferAttribute(out.rock, 4));
  g.setIndex(out.idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------------------------------------- the surf

const RINGS = 5;
const SEG = 48;

function surfGeometry(world: World, stacks: readonly Spire[], ax: number, ay: number, az: number): THREE.BufferGeometry {
  const st = new SpineSample();
  const pos: number[] = [];
  const ring: number[] = [];
  const idx: number[] = [];
  // (an arch's legs each ringed as a stack is)
  const legs: Spire[] = [];
  for (const s of stacks) {
    if (s.kind === 'stack') legs.push(s);
    else if (s.kind === 'arch' && s.span)
      for (const e of [-0.5, 0.5]) legs.push({ ...s, kind: 'stack', x: s.x + Math.cos(s.yaw) * s.span * e, z: s.z + Math.sin(s.yaw) * s.span * e, r: s.r * 0.9 });
  }
  for (const s of legs) {
    const base = pos.length / 3;
    const R0 = s.r * 1.22 * 0.92;
    // (the swell comes in off the open sea: the foam heaped on a stack's seaward side, its lee nearly still)
    world.spine.at(s.s, st);
    const seaward = Math.atan2(s.z - st.z, s.x - st.x);
    const cy = Math.cos(s.yaw);
    const sy = Math.sin(s.yaw);
    for (let j = 0; j <= RINGS; j++) {
      const rho = j / RINGS;
      for (let k = 0; k < SEG; k++) {
        const a = (k / SEG) * Math.PI * 2;
        const w = 1 + 0.12 * Math.sin(3 * a + s.seed * 30) + 0.06 * Math.sin(7 * a + s.seed * 70);
        const ux = Math.cos(a) * w;
        const uz = Math.sin(a) * w * s.depth;
        const wa = Math.atan2(-ux * sy + uz * cy, ux * cy + uz * sy);
        const face = 0.5 + 0.5 * Math.cos(wa - seaward);
        const R = R0 * (0.86 + 1.5 * rho * (0.55 + 0.9 * face));
        const lx = ux * R;
        const lz = uz * R;
        pos.push(s.x + lx * cy + lz * sy - ax, s.level - ay + 0.1, s.z - lx * sy + lz * cy - az);
        ring.push(rho, face, s.seed, a);
      }
    }
    for (let j = 0; j < RINGS; j++)
      for (let k = 0; k < SEG; k++) {
        const a = base + j * SEG + k;
        const b = base + j * SEG + ((k + 1) % SEG);
        // (wound to face up)
        idx.push(a, b, a + SEG, b, b + SEG, a + SEG);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aRing', new THREE.Float32BufferAttribute(ring, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function surfMaterial(): THREE.ShaderMaterial {
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
      attribute vec4 aRing;
      varying vec3 vPos;
      varying vec3 vNormal;
      varying vec4 vRing;
      void main() {
        vRing = aRing;
        vNormal = vec3(0.0, 1.0, 0.0);
        vec4 w = modelMatrix * vec4(position, 1.0);
        vPos = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FRAGMENT_PARS}
      ${GLSL_COMMON}
      varying vec4 vRing;
      void main() {
        #include <logdepthbuf_fragment>
        vec2 w = rtWorldXZ(vPos);
        float rho = vRing.x;
        float seed = vRing.z;
        float n = rtNoiseAt(w + seed * 91.0 + vec2(uTime * 0.3, -uTime * 0.2), 7.0).r;
        float n2 = rtNoiseAt(w + seed * 37.0, 2.2).g;
        // the sea white against its foot, and the bands of a wave's wash running out from it, broken up as they go
        float face = vRing.y;
        float wash = (1.0 - smoothstep(0.03, 0.1 + 0.2 * face + 0.14 * n, rho)) * (0.45 + 0.55 * face);
        float band = smoothstep(0.55, 0.8, sin((rho * 3.2 - uTime * 0.35 + seed * 9.0) * 6.2832 + n * 4.0) * 0.5 + 0.5);
        float foam = max(wash, band * (1.0 - smoothstep(0.3, 1.0, rho)) * smoothstep(0.35, 0.65, n2 + 0.2 * n) * smoothstep(0.15, 0.75, face + 0.25 * (n - 0.5)));
        if (foam < 0.02) discard;
        vec3 col = vec3(0.93, 0.96, 0.98) * (uSkyColor * 0.75 + uSunColor * 0.45 * rtShadow(vPos, vec3(0.0, 1.0, 0.0)));
        col = rtFog(col, vPos, cameraPosition);
        gl_FragColor = vec4(col, foam * 0.92);
      }`,
  });
}

// ---------------------------------------------------------------------------------------------- the trees on them

/** the woods' cards standing on a piece's perches (about (ax, ay, az)) */
function treeCards(world: World, tp: TerrainPoint, spires: readonly Spire[], perches: readonly Perch[], ax: number, ay: number, az: number, template: THREE.BufferGeometry): THREE.InstancedBufferGeometry | null {
  if (!perches.length) return null;
  // (the land's palette slots at the spires: the cards are painted in the wood's colours beside them)
  world.shape(spires[0].x, spires[0].z, tp);
  const pair = (tp.ca & 3) + 4 * (tp.cb & 3);
  const share = tp.bt;
  const roots: number[] = [];
  const info: number[] = [];
  let i = 0;
  for (const p of perches) {
    const r = Math.abs((Math.sin(i * 12.9898 + p.x * 0.013) * 43758.5453) % 1);
    i++;
    roots.push(p.x - ax, p.y - ay - p.sink, p.z - az, p.size);
    info.push(pair, share, r, Math.floor(r * 4) % 4);
  }
  const geo = new THREE.InstancedBufferGeometry();
  for (const [name, attr] of Object.entries(template.attributes)) geo.setAttribute(name, (attr as THREE.BufferAttribute).clone());
  geo.setAttribute('aRoot', new THREE.InstancedBufferAttribute(new Float32Array(roots), 4));
  geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(new Float32Array(info), 4));
  geo.instanceCount = roots.length / 4;
  return geo;
}

// ---------------------------------------------------------------------------------------------- the view

interface Live {
  meshes: THREE.Mesh[];
  anchor: [number, number, number];
  spires: readonly Spire[];
}

/** the spires of the places near the road (ModGame updates it with the road's distance) */
export class SpireView {
  private readonly live = new Map<number, Live>();
  private readonly surfMat = surfMaterial();
  // (the far woods' cards, but from near too: a pillar's top is seen from a few hundred metres)
  private readonly woodsMat = farWoodsMaterial({ in: [0, 1], out: [5200, 6000] });
  private readonly card = buildWoodsCard();
  private readonly tp = new TerrainPoint();
  private readonly st = new SpineSample();
  private planS = NaN;
  /** how many spires are drawn, and their triangles (the harness asks) */
  spires = 0;
  triangles = 0;

  constructor(
    private readonly core: RenderCore,
    private readonly world: World,
  ) {
    core.onRebase(() => {
      for (const l of this.live.values()) for (const m of l.meshes) core.place(m, l.anchor[0], l.anchor[1], l.anchor[2]);
    });
  }

  /** the spires of the places in reach (the harness asks) */
  near(): Spire[] {
    const out: Spire[] = [];
    for (const l of this.live.values()) out.push(...l.spires);
    return out;
  }

  update(s: number): void {
    const earth = this.world.earth;
    if (!earth || Math.abs(s - this.planS) < 150) return;
    this.planS = s;
    const keep = new Set<number>();
    for (const p of earth.pieces) {
      if (p.end < s - 3000 || p.start > s + 7000 || !hasSpires(p)) continue;
      keep.add(p.index);
      if (this.live.has(p.index)) continue;
      const spires = spiresOf(this.world, p, this.tp, this.st);
      const meshes: THREE.Mesh[] = [];
      const anchor: [number, number, number] = spires.length ? [spires[0].x, spires[0].level, spires[0].z] : [0, 0, 0];
      if (spires.length && p.scene) {
        const sea = spires.some((x) => x.kind === 'stack' || x.kind === 'arch');
        const perches: Perch[] = [];
        const tp = this.tp;
        const geo = spireGeometry(spires, anchor[0], anchor[1], anchor[2], perches, (x, z) => (this.world.shape(x, z, tp), tp.bed));
        // (a material of its own: its rock's and its place's colours)
        const rockMesh = new THREE.Mesh(geo, rockMaterial(paintOf(p.region, p.scene.place.macro.rock, sea)));
        rockMesh.name = 'spires:rock';
        meshes.push(rockMesh);
        if (spires.some((x) => x.kind === 'stack' || x.kind === 'arch')) {
          const surf = new THREE.Mesh(surfGeometry(this.world, spires, anchor[0], anchor[1], anchor[2]), this.surfMat);
          surf.name = 'spires:surf';
          surf.renderOrder = 4;
          meshes.push(surf);
        }
        const cards = treeCards(this.world, this.tp, spires, perches, anchor[0], anchor[1], anchor[2], this.card);
        if (cards) {
          const trees = new THREE.Mesh(cards, this.woodsMat);
          trees.name = 'spires:trees';
          trees.frustumCulled = false;
          meshes.push(trees);
        }
        for (const m of meshes) {
          this.core.place(m, anchor[0], anchor[1], anchor[2]);
          this.core.scene.add(m);
        }
      }
      this.live.set(p.index, { meshes, anchor, spires });
    }
    for (const [k, l] of this.live) {
      if (keep.has(k)) continue;
      for (const m of l.meshes) {
        this.core.scene.remove(m);
        m.geometry.dispose();
        if (m.name === 'spires:rock') (m.material as THREE.Material).dispose();
      }
      this.live.delete(k);
    }
    let n = 0;
    let tris = 0;
    for (const l of this.live.values()) {
      n += l.spires.length;
      for (const m of l.meshes) if (m.name === 'spires:rock') tris += (m.geometry.index?.count ?? 0) / 3;
    }
    this.spires = n;
    this.triangles = tris;
  }
}
