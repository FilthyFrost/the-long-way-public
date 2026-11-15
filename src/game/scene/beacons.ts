/**
 * The lamps of the lighthouses (docs/DESIGN_V2.md 4.6): a glow in the lantern room and two beams
 * going round, lit from dusk to dawn and in thick weather. The towers themselves belong to their
 * places (siteBuild.ts); this is only the light, which moves.
 */
import * as THREE from 'three';
import type { Site } from '../../core/world/sites';
import type { World } from '../../core/world/terrain';
import type { RenderCore } from '../render/core';
import { lampHeight } from './siteBuild';

/** how far a beam is drawn (m), how wide it has grown by then, and seconds to a turn */
const REACH = 300;
const SPREAD = 6.5;
const TURN_S = 11;

interface Lamp {
  group: THREE.Group;
  arm: THREE.Object3D;
  w: [number, number, number];
  phase: number;
}

function beamGeometry(): THREE.BufferGeometry {
  // a four-sided horn along +x: bright at the lamp, gone by the far end
  const pos: number[] = [];
  const col: number[] = [];
  const N = 8;
  for (let i = 0; i < N; i++) {
    const t0 = i / N;
    const t1 = (i + 1) / N;
    const x0 = t0 * t0 * REACH;
    const x1 = t1 * t1 * REACH;
    const r0 = 0.5 + (SPREAD * x0) / REACH;
    const r1 = 0.5 + (SPREAD * x1) / REACH;
    // (bright only close to the lamp: seen from the side a beam is a short blade of light, not a bar across the sky)
    const c0 = (1 - t0) ** 3.2;
    const c1 = (1 - t1) ** 3.2;
    for (let k = 0; k < 4; k++) {
      const a0 = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const a1 = ((k + 1) / 4) * Math.PI * 2 + Math.PI / 4;
      const p = (x: number, r: number, a: number, c: number): void => {
        pos.push(x, Math.sin(a) * r * 0.55, Math.cos(a) * r);
        col.push(c, c, c);
      };
      p(x0, r0, a0, c0);
      p(x1, r1, a0, c1);
      p(x1, r1, a1, c1);
      p(x0, r0, a0, c0);
      p(x1, r1, a1, c1);
      p(x0, r0, a1, c0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  g.computeBoundingSphere();
  return g;
}

export class BeaconView {
  private readonly lamps = new Map<string, Lamp>();
  private readonly beamGeo = beamGeometry();
  private readonly glowGeo = new THREE.SphereGeometry(0.75, 10, 8);
  private readonly beamMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0, vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  private readonly glowMat = new THREE.MeshBasicMaterial({ color: 0xfff1b0, fog: false });
  private readonly list: Site[] = [];
  private planS = NaN;
  /** how many lamps are lit (telemetry) */
  lit = 0;

  constructor(
    private readonly core: RenderCore,
    private readonly world: World,
  ) {
    core.onRebase(() => {
      for (const l of this.lamps.values()) core.place(l.group, l.w[0], l.w[1], l.w[2]);
    });
  }

  /**
   * @param s where along the road the camera is
   * @param time seconds of game time (the beams turn by it: every player sees them at the same bearing)
   * @param dark 0 broad day … 1 night or thick weather
   */
  update(s: number, time: number, dark: number): void {
    if (!(Math.abs(s - this.planS) < 200)) {
      this.planS = s;
      const seen = new Set<string>();
      for (const site of this.world.sites.between(s - 5000, s + 9000, this.list)) {
        if (site.kind !== 'lighthouse') continue;
        const o = site.objects.find((q) => q.kind === 'lighthouse');
        if (!o) continue;
        seen.add(site.id);
        if (this.lamps.has(site.id)) continue;
        const group = new THREE.Group();
        const arm = new THREE.Object3D();
        for (const turn of [0, Math.PI]) {
          const beam = new THREE.Mesh(this.beamGeo, this.beamMat);
          beam.rotation.y = turn;
          // (a little below the level: the beam sweeps the water, not the sky)
          beam.rotation.z = -0.018;
          beam.renderOrder = 5;
          beam.frustumCulled = false;
          arm.add(beam);
        }
        group.add(arm);
        group.add(new THREE.Mesh(this.glowGeo, this.glowMat));
        const w: [number, number, number] = [o.x, o.y + lampHeight(o.h), o.z];
        this.core.place(group, w[0], w[1], w[2]);
        this.core.scene.add(group);
        this.lamps.set(site.id, { group, arm, w, phase: ((site.seed >>> 4) & 0xff) / 255 });
      }
      for (const [id, l] of this.lamps) {
        if (seen.has(id)) continue;
        this.core.scene.remove(l.group);
        this.lamps.delete(id);
      }
    }
    const on = dark > 0.02;
    this.lit = on ? this.lamps.size : 0;
    this.beamMat.opacity = 0.26 * dark;
    // (the lamp itself outshines the dusk well before the beams show)
    this.glowMat.color.setRGB(1.0 + 3.2 * dark, 0.95 + 2.6 * dark, 0.69 + 1.2 * dark);
    for (const l of this.lamps.values()) {
      l.arm.visible = on;
      l.arm.rotation.y = (time / TURN_S + l.phase) * Math.PI * 2;
    }
  }
}
