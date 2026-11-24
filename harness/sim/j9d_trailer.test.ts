/**
 * J9d (docs/V3/plan/growth.md §六 2): towing a trailer — the follower's pose behind a hitch ball (followPose).
 *   - its coupling exactly on the ball: on the flat, up a slope, across a camber, the ball above or below its stand
 *   - pulled straight it comes in line behind (a trailer's tractrix: the angle halves in under a coupler's length or two)
 *   - round a circle its axle runs inside the ball's (it cuts the corner: √(R² − L²))
 *   - the frame: the Tadpole is towed (its coupler from its model), the hitch ball a part for every frame's hitch mount
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { stockBuild } from '../../src/core/modcar/build';
import { FRAMES, frameDef } from '../../src/core/modcar/frames';
import { partDef } from '../../src/core/modcar/parts';
import { followPose } from '../../src/game/modcar/v3/tow/system';

const COUPLER = { x: 2.13, y: 0.445 };
const TRACK = 1.39;

/** where a pose puts the coupling (the model's point (L, h, 0) turned and moved) */
function couplingOf(p: { x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number }): THREE.Vector3 {
  return new THREE.Vector3(COUPLER.x, COUPLER.y, 0).applyQuaternion(new THREE.Quaternion(p.qx, p.qy, p.qz, p.qw)).add(new THREE.Vector3(p.x, p.y, p.z));
}

/** the yaw of a pose (the sim's: +x towards −z) */
function yawOf(p: { qx: number; qy: number; qz: number; qw: number }): number {
  const f = new THREE.Vector3(1, 0, 0).applyQuaternion(new THREE.Quaternion(p.qx, p.qy, p.qz, p.qw));
  return Math.atan2(-f.z, f.x);
}

describe('J9d: towing', () => {
  it('its coupling comes on the ball: on the flat, up a slope, across a camber, the ball high or low', () => {
    const grounds: [string, (x: number, z: number) => number][] = [
      ['flat', () => 0],
      ['a 12% slope', (x) => 0.12 * x],
      ['a camber', (_x, z) => 0.08 * z],
      ['both', (x, z) => 0.1 * x - 0.06 * z + 0.02 * Math.sin(x * 3)],
    ];
    for (const [name, g] of grounds) {
      for (const lift of [0.3, 0.445, 0.6]) {
        for (const toward of [0, 0.7, -1.9, 3.0]) {
          const H = { x: 5 + Math.cos(toward) * 0.0, y: 0, z: 1 };
          H.y = g(H.x, H.z) + lift;
          const A = { x: H.x - Math.cos(toward) * 2.2, z: H.z + Math.sin(toward) * 2.2 };
          const { pose, ax, az } = followPose(H, A, COUPLER, TRACK, g);
          const c = couplingOf(pose);
          expect(Math.hypot(c.x - H.x, c.y - H.y, c.z - H.z), `${name}, the ball ${lift} m up, heading ${toward}`).toBeLessThan(0.004);
          // (its axle on the ground, the follower's point by it: beside it only by the coupling's lean on a camber —
          // standing across the 12% slope, 0.445 · sin 0.12 ≈ 5 cm)
          expect(Math.abs(pose.y - g(ax, az))).toBeLessThan(0.02);
          expect(Math.hypot(pose.x - ax, pose.z - az)).toBeLessThan(0.07);
        }
      }
    }
  });

  it('pulled straight it comes in line behind the ball, across a camber too', () => {
    for (const g of [(): number => 0, (_x: number, z: number): number => 0.06 * z, (_x: number, z: number): number => -0.04 * z + 0.01 * Math.sin(_x)]) {
    // (the ball going along +x; the trailer's axle a metre off the line to start with)
    let A = { x: -2.0, z: 0.9 };
    let travelled = 0;
    let firstHalf = -1;
    const y0 = Math.abs(Math.atan2(0.9, 2.0));
    for (let i = 1; i <= 400; i++) {
      const H = { x: i * 0.05, y: 0.445, z: 0 };
      const fp = followPose(H, A, COUPLER, TRACK, g);
      A = { x: fp.ax, z: fp.az };
      travelled += 0.05;
      const yaw = Math.abs(yawOf(fp.pose));
      if (firstHalf < 0 && yaw < y0 / 2) firstHalf = travelled;
    }
    // (a tractrix: the angle halves in about L·ln 2 ≈ 1.5 m; after 20 m it is in line)
    expect(firstHalf).toBeGreaterThan(0.5);
    expect(firstHalf).toBeLessThan(2.5);
    expect(Math.abs(A.z)).toBeLessThan(0.01);
    }
  });

  it('round a circle its axle runs inside the ball (it cuts the corner)', () => {
    const g = (): number => 0;
    const R = 8;
    let A = { x: R - 0.1, z: -2.13 };
    let r = 0;
    for (let i = 0; i <= 2000; i++) {
      const t = i * 0.01;
      const H = { x: R * Math.cos(t), y: 0.445, z: -R * Math.sin(t) };
      const fp = followPose(H, A, COUPLER, TRACK, g);
      A = { x: fp.ax, z: fp.az };
      r = Math.hypot(A.x, A.z);
    }
    expect(r).toBeCloseTo(Math.sqrt(R * R - COUPLER.x * COUPLER.x), 1);
  });

  it('the Tadpole is towed; every other frame takes a hitch ball', () => {
    const t = frameDef('trailer');
    expect(t.towed).toBeTruthy();
    expect(t.towed!.coupler.x).toBeCloseTo(2.13, 2);
    expect(t.towed!.standY).toBeGreaterThan(0.3);
    // (no engine, nothing to drive it: only a box on two wheels)
    const b = stockBuild('trailer');
    expect(Object.values(b.parts).some((p) => p && partDef(p.part).cat === 'engine')).toBe(false);
    expect(t.mounts.filter((m) => m.cat === 'rim').length).toBe(2);
    expect(t.mounts.some((m) => m.cat === 'hitch')).toBe(false);
    for (const f of FRAMES) {
      // (a trailer tows nothing; nor does the motorcycle)
      if (f.towed || f.balance) continue;
      const m = f.mounts.find((x) => x.cat === 'hitch');
      expect(m, `${f.id}: a hitch mount`).toBeTruthy();
      // (at its back, low: under its bumper)
      expect(m!.pos.x).toBeLessThan(0);
      expect(m!.pos.y).toBeLessThan(0.8);
      expect(Math.abs(m!.pos.z)).toBeLessThan(0.01);
    }
    expect(partDef('hitch_ball').cat).toBe('hitch');
    expect(partDef('hitch_ball').hitch!.maxKg).toBeGreaterThan(500);
  });
});
