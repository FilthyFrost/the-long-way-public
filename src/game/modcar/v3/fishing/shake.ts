/**
 * The knocks a fish gives the view (docs/V3/plan/fishing-feel.md §4, the second step): the strike lurches it toward
 * the water and the fish and lets it settle with a shudder (the user's word of 2026-11-24), a turn or a run tugs it
 * toward the fish, a leap jolts it, the line parting jerks it back; and while the line is strained past the gold it
 * trembles, the more the nearer the breaking point. Springs on the view's pitch, heading and roll, kicked by impulses,
 * and one on the eye's place; laid on the camera after the game has placed it for the frame, before the rod is placed
 * by it (the hands go with the eye). The game places the camera afresh every frame: nothing builds up.
 */
import type * as THREE from 'three';

/** a damped spring (an angle, rad): pulled toward its target, kicked by impulses */
export class Spring {
  x = 0;
  v = 0;
  /** k: its stiffness (1/s²), c: its damping (1/s) */
  constructor(
    public k: number,
    public c: number,
  ) {}

  step(dt: number, target: number): number {
    // (sub-steps: a long frame does not throw it off)
    const n = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (this.k * (target - this.x) - this.c * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }

  reset(): void {
    this.x = this.v = 0;
  }
}

export class ViewShake {
  private readonly pitch = new Spring(110, 10);
  private readonly yaw = new Spring(90, 9.5);
  private readonly roll = new Spring(80, 8.5);
  /** the eye thrown after the fish at the strike (m along `surgeDir`, render space) */
  private readonly surge = new Spring(140, 12);
  private readonly surgeDir = { x: 0, y: 0, z: 0 };
  /** the shudder the view settles with after the strike: its size (rad) and its time since */
  private shudA = 0;
  private shudT = 0;
  private t = 0;
  /** a lean held while it lasts (rad, eased): the view drawn after the rod as the hands pull it over */
  private leanYaw = 0;
  private leanRoll = 0;
  /** the last frame's offsets (rad), for the tests */
  readonly now = { pitch: 0, yaw: 0, roll: 0 };

  /** a knock: rad a second on the pitch (+ up), the heading (+ to the left) and the roll (+ anticlockwise) */
  kick(pitch: number, yaw: number, roll: number): void {
    this.pitch.v += pitch;
    this.yaw.v += yaw;
    this.roll.v += roll;
  }

  /**
   * The strike: the view lurches toward the water and the fish at `at` (render space) — pitched forward, turned toward
   * it, rolled its way, the eye thrown a hand's breadth after it — then settles with a shudder; k how big the fish
   * (0.3 … 1.6)
   */
  strike(cam: THREE.Camera, at: { x: number; y: number; z: number }, k: number): void {
    const e = cam.matrixWorld.elements;
    const dx = at.x - e[12];
    const dy = at.y - e[13];
    const dz = at.z - e[14];
    // (the fish's bearing off the view's heading, on the level: + to the left)
    const fwd = -(dx * e[8] + dz * e[10]);
    const rgt = dx * e[0] + dz * e[2];
    const bearing = Math.atan2(-rgt, Math.max(1e-3, fwd));
    const side = bearing < 0 ? -1 : 1;
    this.kick(-(0.5 + 1.35 * k), side * (0.35 + 0.8 * Math.min(1, Math.abs(bearing) * 4)) * k, side * 0.5 * k);
    const d = Math.hypot(dx, dy, dz);
    if (d > 1e-3) {
      // (toward it on the level, a little down)
      const hl = Math.max(1e-3, Math.hypot(dx, dz));
      this.surgeDir.x = (dx / hl) * 0.92;
      this.surgeDir.y = -0.38;
      this.surgeDir.z = (dz / hl) * 0.92;
      this.surge.v += (0.08 + 0.07 * k) * 21;
    }
    this.shudA = Math.max(this.shudA, 0.004 + 0.006 * k);
    this.shudT = 0;
  }

  /** the lean wanted now (rad: the heading + to the left, the roll + anticlockwise), eased toward over dt */
  lean(yaw: number, roll: number, dt: number): void {
    const k = Math.min(1, dt * 4);
    this.leanYaw += (yaw - this.leanYaw) * k;
    this.leanRoll += (roll - this.leanRoll) * k;
  }

  /** one frame: the knocks dying away and the tremble (0 … 1) laid on the camera */
  apply(cam: THREE.Camera, dt: number, tremble: number): void {
    this.t += dt;
    const t = this.t;
    const n = Math.max(0, Math.min(1, tremble));
    let p = this.pitch.step(dt, 0) + n * 0.0045 * (Math.sin(t * 37) + 0.6 * Math.sin(t * 53 + 1));
    let y = this.yaw.step(dt, 0) + n * 0.0035 * (Math.sin(t * 41 + 2) + 0.5 * Math.sin(t * 67)) + this.leanYaw;
    let r = this.roll.step(dt, 0) + n * 0.003 * Math.sin(t * 29 + 4) + this.leanRoll;
    // (the strike's shudder: coming in as the lurch tops out, dying away over half a second)
    if (this.shudA > 0) {
      this.shudT += dt;
      const u = this.shudT;
      const env = this.shudA * Math.min(1, u / 0.07) * Math.exp(-u * 5.5);
      p += env * (Math.sin(u * 97 + 1) * 0.65 + Math.sin(u * 151) * 0.35);
      y += env * 0.7 * Math.sin(u * 113 + 2);
      r += env * 0.9 * Math.sin(u * 83 + 4);
      if (u > 1.2) this.shudA = 0;
    }
    const sg = this.surge.step(dt, 0);
    if (Math.abs(sg) > 1e-5) {
      cam.position.x += this.surgeDir.x * sg;
      cam.position.y += this.surgeDir.y * sg;
      cam.position.z += this.surgeDir.z * sg;
    }
    this.now.pitch = p;
    this.now.yaw = y;
    this.now.roll = r;
    if (Math.abs(p) + Math.abs(y) + Math.abs(r) < 1e-5) {
      if (Math.abs(sg) > 1e-5) cam.updateMatrixWorld();
      return;
    }
    cam.rotateY(y);
    cam.rotateX(p);
    cam.rotateZ(r);
    cam.updateMatrixWorld();
  }

  reset(): void {
    this.leanYaw = this.leanRoll = 0;
    this.shudA = this.shudT = 0;
    this.pitch.reset();
    this.yaw.reset();
    this.roll.reset();
    this.surge.reset();
  }
}
