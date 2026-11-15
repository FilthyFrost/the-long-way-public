/**
 * Renders the hero landmarks around the player. Each kind is one merged, flat-shaded mesh:
 * big clean silhouettes first, detail second — haze does the rest.
 */
import * as THREE from 'three';
import { LANDMARK_SPACING, Landmark, landmarkAt, landmarkRange, type LandmarkKind } from '../../core/world/landmarks';
import type { World } from '../../core/world/terrain';
import type { RenderCore } from '../render/core';
import { surfaceMaterial } from '../render/materials';
import { ModelBuilder } from '../vehicle/builder';

const CONCRETE = 0xb8b3a5;
const CONCRETE_D = 0x9c978b;
const STEEL = 0x77818a;
const RUSTY = 0x99623f;
const PALE = 0xe2ded2;
const MOSS = 0x86a070;

function build(kind: LandmarkKind): THREE.BufferGeometry {
  const b = new ModelBuilder();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const place = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void => {
    e.set(rx, ry, rz);
    q.setFromEuler(e);
    b.transform(m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1)));
  };
  if (kind === 'ring') {
    // a broken ring standing half sunk in the ground, one arc fallen beside it
    place(0, -26, 0, 0, 0, 0.2);
    const R = 88;
    const N = 26;
    for (let i = 0; i < N; i++) {
      if (i >= 4 && i <= 6) continue; // the gap
      const a0 = (i / N) * Math.PI * 2;
      const a1 = ((i + 1) / N) * Math.PI * 2;
      const col = i % 7 === 2 ? 0xc5814c : i % 5 === 0 ? CONCRETE_D : CONCRETE;
      b.bar(Math.cos(a0) * R, Math.sin(a0) * R + R, 0, Math.cos(a1) * R, Math.sin(a1) * R + R, 0, 11, col);
    }
    for (const a of [-0.9, -0.3, 0.3, 0.9]) b.bar(Math.sin(a) * 30, 0, 24, Math.sin(a) * 76, 62 - Math.abs(a) * 20, 0, 3, STEEL);
    place(70, 2, 46, 1.3, 0.5, 0.1);
    b.bar(-18, 0, 0, 18, 6, 0, 11, CONCRETE_D);
  } else if (kind === 'hull') {
    // a warship run aground, heeled over, its waterline rusted
    place(0, -7, 0, 0.24, 0, 0.03);
    b.box(0, 11, 0, 210, 22, 30, 0x6e7980);
    b.box(0, 2.5, 0, 211, 6, 30.5, 0x8d4f3b);
    b.box(118, 12, 0, 46, 20, 20, 0x6e7980, { ry: 0 });
    b.box(140, 13, 0, 30, 16, 9, 0x66717a);
    b.box(-112, 12, 0, 22, 18, 26, 0x66717a);
    b.box(-10, 30, 0, 64, 16, 18, PALE);
    b.box(-4, 44, 0, 34, 12, 13, 0xd0ccc0);
    b.box(2, 55, 0, 14, 10, 9, PALE);
    b.cyl(-34, 46, 0, 5, 26, 0x5c666e, { segments: 10 });
    b.cyl(-52, 42, 0, 4.2, 20, 0x5c666e, { segments: 10 });
    b.bar(6, 60, 0, 6, 92, 0, 1.4, STEEL);
    b.bar(-2, 80, 0, 14, 80, 0, 0.9, STEEL);
    for (const x of [62, 84, -78]) {
      b.cyl(x, 25, 0, 8, 6, 0x66717a, { segments: 10 });
      b.bar(x + 4, 27, -2, x + 30, 31, -2, 1.6, 0x566068);
      b.bar(x + 4, 27, 2, x + 30, 31, 2, 1.6, 0x566068);
    }
    b.box(40, 22.5, 0, 150, 1, 30, 0x9a9588);
  } else if (kind === 'dish') {
    // a radio telescope left pointing at nothing
    // a stout concrete pedestal and splayed steel legs: it must read as standing on the ground
    b.cyl(0, 20, 0, 13, 52, CONCRETE_D, { segments: 12, radiusTop: 9 });
    b.cyl(0, 1, 0, 20, 6, MOSS, { segments: 12, radiusTop: 18 });
    for (const [x, z] of [[-24, -24], [24, -24], [-24, 24], [24, 24]] as const) b.bar(x, -4, z, x * 0.25, 48, z * 0.25, 5, STEEL);
    b.box(0, 46, 0, 24, 7, 24, CONCRETE_D);
    place(0, 52, 0, 0, 0, 0.62);
    const cap = new THREE.SphereGeometry(110, 20, 5, 0, Math.PI * 2, 0, 0.52);
    cap.rotateX(Math.PI);
    b.geo(cap, PALE, 0, 118, 0);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      b.bar(Math.cos(a) * 46, 22, Math.sin(a) * 46, 0, 62, 0, 1.2, STEEL);
    }
    b.box(0, 63, 0, 5, 5, 5, RUSTY);
  } else if (kind === 'viaduct') {
    // an elevated highway going nowhere: piers, a few surviving spans, one fallen
    const span = 58;
    for (let i = -3; i <= 3; i++) {
      const hgt = 52 + (i % 2 ? 4 : 0);
      b.box(i * span, hgt / 2 - 6, 0, 7, hgt + 12, 10, i % 3 === 0 ? CONCRETE_D : CONCRETE);
      b.box(i * span, 3, 0, 9, 10, 12, MOSS);
      b.box(i * span, hgt + 1.5, 0, 12, 3, 16, CONCRETE_D);
    }
    for (const i of [-3, -2, 0, 2]) b.box((i + 0.5) * span, 56.5, 0, span - 2, 3.4, 15, CONCRETE);
    place(-0.5 * span + 6, 26, 0, 0, 0, -0.98);
    b.box(0, 0, 0, span - 4, 3.4, 15, CONCRETE_D);
    place(1.5 * span, 2, 9, 0.1, 0.3, 0.05);
    b.box(0, 0, 0, span * 0.6, 3.4, 15, CONCRETE_D);
  } else if (kind === 'turbines') {
    // three giant wind turbines, long since stopped
    const blade = (x: number, z: number, ang: number, len: number): void => {
      b.bar(x, 112, z + 4, x + Math.cos(ang) * len, 112 + Math.sin(ang) * len, z + 4, 2.4, PALE);
    };
    [[-90, 10], [0, -20], [95, 30]].forEach(([x, z], i) => {
      b.cyl(x, 54, z, 3.6, 120, PALE, { segments: 10, radiusTop: 2.2 });
      b.box(x, 113, z + 1, 7, 6, 14, 0xcfcabd);
      b.box(x, 8, z, 9, 16, 9, i === 1 ? RUSTY : CONCRETE_D);
      blade(x, z, 1.4 + i, 52);
      blade(x, z, 1.4 + i + 2.1, 52);
      if (i !== 1) blade(x, z, 1.4 + i + 4.2, 52);
    });
    place(14, 3, 30, 0.2, 0.6, 0.12);
    b.bar(-26, 0, 0, 26, 9, 0, 2.4, PALE);
  } else {
    // cooling towers, one of them cracked open
    const tower = (x: number, z: number, hgt: number, broken: boolean): void => {
      b.cyl(x, hgt * 0.16, z, 44, hgt * 0.36, CONCRETE, { segments: 16, radiusTop: 33 });
      b.cyl(x, hgt * 0.5, z, 33, hgt * 0.34, CONCRETE_D, { segments: 16, radiusTop: 28 });
      b.cyl(x, hgt * (broken ? 0.76 : 0.83), z, 28, hgt * (broken ? 0.2 : 0.34), CONCRETE, { segments: 16, radiusTop: broken ? 29 : 32 });
      b.cyl(x, hgt * 0.02, z, 45, 6, MOSS, { segments: 16, radiusTop: 44 });
    };
    tower(-55, 0, 128, false);
    tower(62, 24, 118, true);
    place(96, 4, -10, 0.2, 0.4, 0.5);
    b.box(0, 0, 0, 30, 5, 22, CONCRETE_D);
    b.transform(null);
    b.box(4, 9, 60, 70, 18, 26, 0xa39d8f);
    b.cyl(4, 40, 60, 3, 46, RUSTY, { segments: 8, radiusTop: 2.4 });
  }
  b.transform(null);
  return b.build();
}

export class LandmarkView {
  private readonly geo = new Map<LandmarkKind, THREE.BufferGeometry>();
  private readonly live = new Map<number, THREE.Mesh>();
  private readonly mat = surfaceMaterial({ vertexColors: true, flat: true, snowCap: 0 });
  private readonly lm = new Landmark();
  private planS = NaN;
  /** closest landmark to the player (for telemetry) */
  nearestKind = '';
  nearestDist = Infinity;

  constructor(
    private readonly core: RenderCore,
    private readonly world: World,
  ) {
    core.onRebase(() => {
      for (const m of this.live.values()) {
        const w = m.userData.w as [number, number, number];
        core.place(m, w[0], w[1], w[2]);
      }
    });
  }

  update(s: number, px: number, pz: number): void {
    this.nearestDist = Infinity;
    for (const m of this.live.values()) {
      const w = m.userData.w as [number, number, number];
      const d = Math.hypot(w[0] - px, w[2] - pz);
      if (d < this.nearestDist) {
        this.nearestDist = d;
        this.nearestKind = m.userData.kind as string;
      }
    }
    if (Math.abs(s - this.planS) < 150) return;
    this.planS = s;
    const [k0, k1] = landmarkRange(s - 3500, s + 9000);
    for (const [k, m] of this.live) {
      if (k < k0 || k > k1) {
        this.core.scene.remove(m);
        this.live.delete(k);
      }
    }
    for (let k = k0; k <= k1; k++) {
      if (this.live.has(k)) continue;
      const lm = this.lm;
      landmarkAt(this.world, k, lm);
      if (lm.absent) continue;
      let g = this.geo.get(lm.kind);
      if (!g) {
        g = build(lm.kind);
        this.geo.set(lm.kind, g);
      }
      const mesh = new THREE.Mesh(g, this.mat);
      mesh.rotation.y = lm.yaw;
      mesh.scale.setScalar(lm.scale);
      mesh.userData.w = [lm.x, lm.y, lm.z];
      mesh.userData.kind = lm.kind;
      this.core.place(mesh, lm.x, lm.y, lm.z);
      this.core.scene.add(mesh);
      this.live.set(k, mesh);
    }
  }

  static readonly SPACING = LANDMARK_SPACING;
}
