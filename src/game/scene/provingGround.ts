/**
 * Proving ground: a flat, measured test area for tuning how the vehicles feel.
 * Not part of the game world — a workshop.
 */
import * as THREE from 'three';
import { FlatGround, type Ground } from '../../core/world/ground';
import type { RenderCore } from '../render/core';
import { provingGroundMaterial, surfaceMaterial } from '../render/materials';
import { ModelBuilder } from '../vehicle/builder';

export class ProvingGround {
  readonly ground: Ground = new FlatGround();
  private readonly plane: THREE.Mesh;

  constructor(private readonly core: RenderCore) {
    const geo = new THREE.PlaneGeometry(24000, 24000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.plane = new THREE.Mesh(geo, provingGroundMaterial());
    this.plane.frustumCulled = false;
    core.scene.add(this.plane);

    // cones: a slalom along the straight and markers on the skid-pad circle
    const cb = new ModelBuilder();
    cb.cyl(0, 0.24, 0, 0.13, 0.46, 0xe2703a, { radiusTop: 0.03, segments: 10 });
    cb.box(0, 0.015, 0, 0.36, 0.03, 0.36, 0x2e3136);
    cb.cyl(0, 0.3, 0, 0.082, 0.07, 0xf1ead8, { radiusTop: 0.064, segments: 10 });
    const coneGeo = cb.build();
    const spots: [number, number][] = [];
    for (let i = 0; i < 10; i++) spots.push([60 + i * 18, i % 2 === 0 ? -1.2 : 1.2]);
    for (let i = 0; i < 24; i++) {
      const an = (i / 24) * Math.PI * 2;
      spots.push([Math.sin(an) * 33.5, -Math.cos(an) * 33.5]);
    }
    const cones = new THREE.InstancedMesh(coneGeo, surfaceMaterial({ vertexColors: true }), spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([x, z], i) => cones.setMatrixAt(i, m.makeTranslation(x, 0, z)));
    cones.instanceMatrix.needsUpdate = true;
    cones.frustumCulled = false;
    core.scene.add(cones);

    // things to judge scale, distance and haze against
    const sb = new ModelBuilder();
    // hangar by the start
    sb.span(-40, -10, 0, 7, 22, 46, 0xb9b3a2);
    sb.span(-42, -8, 7, 7.6, 20, 48, 0x8a5f48);
    sb.span(-10.2, -10, 0, 5, 28, 40, 0x4b4f55);
    // marker posts every 100 m along the straight
    for (let i = 1; i <= 20; i++) {
      sb.span(i * 100 - 0.08, i * 100 + 0.08, 0, 2.2, 7.9, 8.06, 0xf0e9d6);
      sb.span(i * 100 - 0.25, i * 100 + 0.25, 1.6, 2.2, 7.85, 8.11, i % 5 === 0 ? 0xd9573c : 0x3e86a8);
    }
    // a line of old pylons receding to the horizon, and two far towers
    for (let i = 0; i < 14; i++) {
      const x = 150 + i * 260;
      sb.bar(x, 0, -60, x, 26, -60, 0.9, 0x6f757b);
      sb.bar(x - 6, 22, -60, x + 6, 22, -60, 0.5, 0x6f757b);
    }
    sb.span(3800, 3880, 0, 260, -900, -820, 0x8f959c);
    sb.span(5200, 5320, 0, 420, 1400, 1520, 0x8f959c);
    // a gentle earth bank far to the side, to see silhouettes against the sky
    sb.span(-200, 2600, 0, 14, 320, 360, 0x7f9a66);
    const scenery = new THREE.Mesh(sb.build(), surfaceMaterial({ vertexColors: true, flat: true }));
    scenery.frustumCulled = false;
    core.scene.add(scenery);
  }

  /** keep the endless plane under the camera */
  update(camWorldX: number, camWorldZ: number): void {
    const snap = 1000;
    this.core.place(this.plane, Math.round(camWorldX / snap) * snap, 0, Math.round(camWorldZ / snap) * snap);
  }
}
