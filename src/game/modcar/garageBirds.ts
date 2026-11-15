/**
 * Swallows over the yard (they nest under the eaves of every old barn): three of them, sweeping in
 * long loops over the apron and the meadow, flapping in bursts and gliding between, banking into the
 * turns. One small mesh rebuilt on the CPU each frame (a few dozen corners); gone to roost at night.
 *
 * World frame as the garage's: x towards the road, y up, z right.
 */
import * as THREE from 'three';
import { surfaceMaterial } from '../render/materials';

/** corners of one bird (local: nose to +x, up +y, right +z) — see shape() */
const CORNERS = 21;
const BIRDS = 3;

interface Flight {
  /** centre of its loop, radii, height, speed (rad/s) and phase */
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  y: number;
  w: number;
  phase: number;
  /** a second, slower wander laid over the loop */
  wobble: number;
}

const FLIGHTS: Flight[] = [
  { cx: 12, cz: 0.5, rx: 7, rz: 9, y: 4.2, w: 0.62, phase: 0, wobble: 0.37 },
  { cx: 10, cz: -2, rx: 9, rz: 6, y: 5.5, w: -0.55, phase: 2.1, wobble: 0.29 },
  { cx: 14, cz: 3, rx: 6, rz: 10, y: 3.4, w: 0.7, phase: 4.0, wobble: 0.43 },
];

export class Swallows {
  readonly mesh: THREE.Mesh;
  private readonly pos: Float32Array;
  private readonly geo = new THREE.BufferGeometry();
  private readonly mat: THREE.ShaderMaterial;
  private t = 0;
  private readonly tmp = new Float32Array(CORNERS * 3);
  private readonly prev: THREE.Vector3[] = FLIGHTS.map(() => new THREE.Vector3());

  constructor() {
    this.pos = new Float32Array(BIRDS * CORNERS * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    // flat little shapes, lit from above whichever side is seen
    const nrm = new Float32Array(BIRDS * CORNERS * 3);
    for (let i = 0; i < BIRDS * CORNERS; i++) nrm[i * 3 + 1] = 1;
    this.geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(12, 5, 0), 40);
    this.mat = surfaceMaterial({ color: 0x23293a, spec: 0, side: THREE.DoubleSide, ink: true });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.name = 'garage:swallows';
    this.update(0, false);
  }

  /** move the birds on (night: they are roosting, not drawn) */
  update(dt: number, night: boolean): void {
    this.mesh.visible = !night;
    if (night) return;
    this.t += dt;
    const t = this.t;
    FLIGHTS.forEach((f, b) => {
      const a = f.w * t + f.phase;
      const wob = Math.sin(t * f.wobble + b * 1.7);
      const x = f.cx + f.rx * Math.cos(a) + 2.5 * Math.sin(a * 2.3 + b);
      const z = f.cz + f.rz * Math.sin(a) * (0.85 + 0.15 * wob);
      const y = f.y + 1.2 * Math.sin(a * 1.6 + b * 2.0) + 0.6 * wob;
      // heading from the way it is going; banked into the turn
      const p = this.prev[b];
      let dx = x - p.x;
      let dz = z - p.z;
      const dl = Math.hypot(dx, dz);
      if (dl < 1e-5) {
        dx = 1;
        dz = 0;
      } else {
        dx /= dl;
        dz /= dl;
      }
      const turn = f.w > 0 ? 1 : -1;
      const bank = -0.55 * turn * (0.6 + 0.4 * Math.sin(a * 1.3));
      const pitch = (y - p.y) * 2.0;
      p.set(x, y, z);
      // bursts of flapping, then a glide
      const burst = Math.sin(t * 0.9 + b * 2.4) > -0.2;
      const flap = burst ? Math.sin(t * 16 + b) : 0.25;
      this.shape(flap);
      const cb = Math.cos(bank);
      const sb = Math.sin(bank);
      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);
      const base = b * CORNERS * 3;
      for (let i = 0; i < CORNERS; i++) {
        let lx = this.tmp[i * 3];
        let ly = this.tmp[i * 3 + 1];
        let lz = this.tmp[i * 3 + 2];
        // bank (about the nose), pitch (about the wings), then the heading
        const y1 = ly * cb - lz * sb;
        const z1 = ly * sb + lz * cb;
        ly = y1;
        lz = z1;
        const x2 = lx * cp - ly * sp;
        const y2 = lx * sp + ly * cp;
        lx = x2;
        ly = y2;
        this.pos[base + i * 3] = x + lx * dx - lz * dz;
        this.pos[base + i * 3 + 1] = y + ly;
        this.pos[base + i * 3 + 2] = z + lx * dz + lz * dx;
      }
    });
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** one bird's seven triangles (body, two wings, the forked tail) in this.tmp, wings at flap −1 … 1 */
  private shape(flap: number): void {
    const s = 1.35;
    const tip = 0.06 * flap;
    const v = [
      // body
      [0.09, 0, 0], [-0.06, 0, -0.016], [-0.06, 0, 0.016],
      // left wing, swept back
      [0.035, 0, -0.012], [-0.025, 0, -0.012], [-0.05, tip, -0.17],
      [0.035, 0, -0.012], [-0.05, tip, -0.17], [0.0, tip * 0.6, -0.11],
      // right wing
      [0.035, 0, 0.012], [-0.05, tip, 0.17], [-0.025, 0, 0.012],
      [0.035, 0, 0.012], [0.0, tip * 0.6, 0.11], [-0.05, tip, 0.17],
      // the forked tail
      [-0.05, 0, 0], [-0.17, 0, -0.045], [-0.11, 0, 0.0],
      [-0.05, 0, 0], [-0.11, 0, 0.0], [-0.17, 0, 0.045],
    ];
    for (let i = 0; i < CORNERS; i++) {
      const p = v[i] ?? v[0];
      this.tmp[i * 3] = p[0] * s;
      this.tmp[i * 3 + 1] = p[1] * s;
      this.tmp[i * 3 + 2] = p[2] * s;
    }
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
