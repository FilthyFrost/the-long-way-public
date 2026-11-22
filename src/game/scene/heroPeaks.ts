/**
 * A place's hero peak drawn (V9, docs/V3/nodes/V9-heroes.md; where it stands: core/world/earth/heroPeaks.ts): far off
 * ahead, a volcano or a horn the size of a mountain, on a lathe of its own.
 *
 *   volcano  its flanks concave as a stratovolcano's are — long and gentle at the foot, steep under the summit — its
 *            crater's rim at the top and a bowl in it; ridges and gullies running down it all round, a little ragged;
 *   horn     four faces between four sharp ridges, one face steeper than the rest, to a point.
 *
 * Painted as the rock is, in the place's palette: its foot the far land's wooded blue-green, its rock above, its snow
 * from the summit down to its line — lower in the gullies, a ragged edge of streaks. The air's haze over it as over
 * the far land (the surface material's rtFog), so it stands as a pale shape with a bright cap. A volcano that breathes
 * has a plume of steam from its crater, the steam's own puffs (scene/geothermal.ts steamMaterial) at its scale.
 */
import * as THREE from 'three';
import type { World } from '../../core/world/terrain';
import { TerrainPoint } from '../../core/world/terrain';
import { SpineSample } from '../../core/world/spine';
import { hasHeroPeak, heroPeakOf, type HeroPeak } from '../../core/world/earth/heroPeaks';
import { rock } from '../../core/earth/rocks';
import { BIOMES } from '../../core/world/biomes';
import { hexOf, stoneColour } from '../../core/world/earth/palette';
import type { RenderCore } from '../render/core';
import { surfaceMaterial } from '../render/materials';
import { steamMaterial } from './geothermal';

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface Paint {
  rockLit: THREE.Color;
  rockShade: THREE.Color;
  foot: THREE.Color;
  snow: THREE.Color;
}

function paintOf(region: number, rockId: Parameters<typeof rock>[0]): Paint {
  const rk = rock(rockId);
  const pal = BIOMES[region]?.earth?.palette;
  const f = (h: number): THREE.Color => new THREE.Color(h).convertSRGBToLinear();
  return {
    rockLit: f(pal ? stoneColour(pal, rk.lit) : rk.lit).multiplyScalar(0.8),
    rockShade: f(pal ? stoneColour(pal, rk.shade) : rk.shade).multiplyScalar(0.75),
    foot: f(pal ? hexOf({ ...pal.woods, L: pal.woods.L * 0.8 }, pal.cast) : 0x3f6b4a),
    snow: f(0xf2f5fa),
  };
}

const RINGS = 60;
const SEG = 96;

/** a hero peak as one mesh about (ax, ay, az) */
function peakGeometry(pk: HeroPeak, paint: Paint, ax: number, ay: number, az: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const H = pk.top - pk.foot;
  const s = pk.seed * 100;
  const volcano = pk.kind === 'volcano';
  const rim = volcano ? pk.r * 0.035 : 0;
  const c = new THREE.Color();
  // rings denser toward the summit, where the shape turns fastest
  for (let j = 0; j <= RINGS; j++) {
    const v = j / RINGS;
    const u = 1 - (1 - v) * (1 - v) * 0.35 - (1 - v) * 0.65;
    const y = pk.foot + H * u;
    for (let k = 0; k < SEG; k++) {
      const a = (k / SEG) * Math.PI * 2;
      let r: number;
      let ridge = 0;
      if (volcano) {
        // (its flanks rising into its crater's rim without a neck)
        r = pk.r * Math.pow(1 - u, 1.75) + rim * u * u;
        // ridges and gullies down its flanks, ragged, gone at its foot and at its rim
        ridge = 0.045 * Math.sin(17 * a + s) + 0.025 * Math.sin(37 * a + s * 2.3 + u * 6) + 0.015 * Math.sin(71 * a + s * 0.7);
        r *= 1 + ridge * smooth(0.06, 0.35, u) * (1 - smooth(0.9, 0.99, u));
        // (a little lopsided: no volcano is turned on a lathe)
        r *= 1 + 0.05 * Math.sin(a + s) * (1 - u) + 0.03 * Math.sin(2 * a + s * 1.7);
      } else {
        // four faces between four ridges, one face steeper
        const p = 1.25;
        const t = a + pk.yaw;
        const rs = Math.pow(Math.pow(Math.abs(Math.cos(t)), p) + Math.pow(Math.abs(Math.sin(t)), p), -1 / p);
        r = pk.r * Math.pow(1 - u, 1.12) * rs * (1 - 0.18 * smooth(0.3, 1, Math.cos(t - 0.8)));
        ridge = (rs - 0.85) * 0.6 + 0.02 * Math.sin(23 * a + s);
        r *= 1 + 0.03 * Math.sin(29 * a + s + u * 9) * smooth(0.1, 0.4, u);
      }
      pos.push(pk.x + Math.cos(a) * r - ax, y - ay, pk.z + Math.sin(a) * r - az);
      // the paint: the far land's wooded foot, the rock, the snow down to its line, lower in the gullies
      const gully = -ridge;
      const line = 1 - pk.snow - 0.12 * gully / 0.05 - 0.05 * Math.sin(13 * a + s * 3) - 0.03 * Math.sin(41 * a + s);
      const snow = smooth(line - 0.015, line + 0.015, u);
      c.copy(paint.rockShade).lerp(paint.rockLit, 0.45 + 0.5 * smooth(0, 0.8, u) + 2 * ridge);
      c.lerp(paint.foot, 1 - smooth(0.04, 0.22, u + 0.04 * Math.sin(9 * a + s)));
      c.lerp(paint.snow, snow);
      col.push(c.r, c.g, c.b);
    }
  }
  const last = RINGS * SEG;
  // the summit: a volcano's crater (a bowl inside its rim), a horn's point
  const floorY = pk.top - (volcano ? H * 0.012 : -H * 0.004);
  const inner = pos.length / 3;
  if (volcano) {
    for (let k = 0; k < SEG; k++) {
      const a = (k / SEG) * Math.PI * 2;
      pos.push(pk.x + Math.cos(a) * rim * 0.55 - ax, floorY - ay, pk.z + Math.sin(a) * rim * 0.55 - az);
      c.copy(paint.rockShade).multiplyScalar(0.8).lerp(paint.snow, 0.5);
      col.push(c.r, c.g, c.b);
    }
  }
  const apex = pos.length / 3;
  pos.push(pk.x - ax, floorY - (volcano ? H * 0.004 : 0) - ay, pk.z - az);
  c.copy(volcano ? paint.rockShade : paint.snow);
  col.push(c.r, c.g, c.b);
  for (let j = 0; j < RINGS; j++)
    for (let k = 0; k < SEG; k++) {
      const a0 = j * SEG + k;
      const b0 = j * SEG + ((k + 1) % SEG);
      idx.push(a0, a0 + SEG, b0, b0, a0 + SEG, b0 + SEG);
    }
  if (volcano) {
    for (let k = 0; k < SEG; k++) {
      const a0 = last + k;
      const b0 = last + ((k + 1) % SEG);
      idx.push(a0, inner + k, b0, b0, inner + k, inner + ((k + 1) % SEG));
      idx.push(inner + k, apex, inner + ((k + 1) % SEG));
    }
  } else for (let k = 0; k < SEG; k++) idx.push(last + k, apex, last + ((k + 1) % SEG));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

const PUFFS = 48;

interface Live {
  peak: HeroPeak | null;
  mesh: THREE.Mesh | null;
  steam: THREE.Mesh | null;
  anchor: [number, number, number];
}

/** the hero peaks of the places near the road (ModGame updates it with the road's distance) */
export class HeroPeakView {
  private readonly live = new Map<number, Live>();
  private readonly mat = surfaceMaterial({ vertexColors: true, brush: 0.35 });
  private readonly steamMat = steamMaterial();
  private readonly tp = new TerrainPoint();
  private readonly st = new SpineSample();
  private planS = NaN;
  /** how many are drawn (the harness asks) */
  peaks = 0;

  constructor(
    private readonly core: RenderCore,
    private readonly world: World,
  ) {
    core.onRebase(() => {
      for (const l of this.live.values()) {
        if (l.mesh) core.place(l.mesh, l.anchor[0], l.anchor[1], l.anchor[2]);
      }
      (this.steamMat.uniforms.uOrigin.value as THREE.Vector3).copy(core.origin);
    });
    (this.steamMat.uniforms.uOrigin.value as THREE.Vector3).copy(core.origin);
  }

  /** the peaks in reach (the harness asks) */
  near(): HeroPeak[] {
    const out: HeroPeak[] = [];
    for (const l of this.live.values()) if (l.peak) out.push(l.peak);
    return out;
  }

  update(s: number): void {
    const earth = this.world.earth;
    if (!earth || Math.abs(s - this.planS) < 200) return;
    this.planS = s;
    const keep = new Set<number>();
    for (const p of earth.pieces) {
      if (p.end < s - 6000 || p.start > s + 12000 || !hasHeroPeak(p)) continue;
      keep.add(p.index);
      if (this.live.has(p.index)) continue;
      const peak = heroPeakOf(this.world, p, this.tp, this.st);
      let mesh: THREE.Mesh | null = null;
      let steam: THREE.Mesh | null = null;
      const anchor: [number, number, number] = peak ? [peak.x, peak.foot, peak.z] : [0, 0, 0];
      if (peak && p.scene) {
        mesh = new THREE.Mesh(peakGeometry(peak, paintOf(p.region, p.scene.place.macro.rock), anchor[0], anchor[1], anchor[2]), this.mat);
        mesh.name = 'hero:peak';
        mesh.frustumCulled = false;
        this.core.place(mesh, anchor[0], anchor[1], anchor[2]);
        this.core.scene.add(mesh);
        if (peak.steam) steam = this.plume(peak);
      }
      this.live.set(p.index, { peak, mesh, steam, anchor });
    }
    for (const [k, l] of this.live) {
      if (keep.has(k)) continue;
      for (const m of [l.mesh, l.steam]) {
        if (!m) continue;
        this.core.scene.remove(m);
        m.geometry.dispose();
      }
      this.live.delete(k);
    }
    let n = 0;
    for (const l of this.live.values()) if (l.mesh) n++;
    this.peaks = n;
  }

  /** a breathing volcano's plume: the steam's puffs at the scale of a mountain */
  private plume(pk: HeroPeak): THREE.Mesh {
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.setIndex(quad.index);
    geo.setAttribute('position', quad.getAttribute('position'));
    const V = new Float32Array(PUFFS * 4);
    const P = new Float32Array(PUFFS * 4);
    const M = new Float32Array(PUFFS * 4);
    for (let i = 0; i < PUFFS; i++) {
      const h = Math.sin(i * 12.9898 + pk.seed * 78.233) * 43758.5453;
      const r = h - Math.floor(h);
      // (a veil's spread, the crater's width: the plume rises out of all of it)
      V.set([pk.x, pk.top - 40, pk.z, 0], i * 4);
      P.set([(i + r) / PUFFS, 46 + 20 * r, 140 + 160 * r, 900], i * 4);
      M.set([0.42, 0, pk.seed, pk.r * 0.03], i * 4);
    }
    geo.setAttribute('aVent', new THREE.InstancedBufferAttribute(V, 4));
    geo.setAttribute('aPuff', new THREE.InstancedBufferAttribute(P, 4));
    geo.setAttribute('aMore', new THREE.InstancedBufferAttribute(M, 4));
    geo.instanceCount = PUFFS;
    const mesh = new THREE.Mesh(geo, this.steamMat);
    mesh.name = 'hero:plume';
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    this.core.scene.add(mesh);
    return mesh;
  }
}
