/**
 * Ground query interface shared by vehicle physics, rendering and placement:
 * everything asks the same function, so what you see is what you drive on.
 */
export const Surface = {
  Asphalt: 0,
  Gravel: 1,
  Dirt: 2,
  Grass: 3,
  Sand: 4,
  Snow: 5,
  Ice: 6,
} as const;
export type SurfaceId = (typeof Surface)[keyof typeof Surface];

export interface SurfaceInfo {
  name: string;
  /** dry friction coefficient multiplier (tyre mu is multiplied by this) */
  mu: number;
  /** rolling resistance coefficient */
  rr: number;
  /** micro-roughness amplitude in metres (felt through suspension, not rendered) */
  rough: number;
}

export const SURFACES: readonly SurfaceInfo[] = [
  { name: 'asphalt', mu: 1.0, rr: 0.014, rough: 0.004 },
  { name: 'gravel', mu: 0.68, rr: 0.03, rough: 0.016 },
  { name: 'dirt', mu: 0.62, rr: 0.035, rough: 0.02 },
  { name: 'grass', mu: 0.55, rr: 0.06, rough: 0.022 },
  { name: 'sand', mu: 0.5, rr: 0.14, rough: 0.012 },
  { name: 'snow', mu: 0.34, rr: 0.07, rough: 0.01 },
  { name: 'ice', mu: 0.14, rr: 0.012, rough: 0.002 },
];

export class GroundSample {
  /** height */
  h = 0;
  /** unit normal */
  nx = 0;
  ny = 1;
  nz = 0;
  /** effective friction multiplier (surface × weather) */
  mu = 1;
  /** effective rolling resistance */
  rr = 0.014;
  surface: number = Surface.Asphalt;
}

export interface Ground {
  sample(x: number, z: number, out: GroundSample): void;
}

export interface FlatGroundOptions {
  surface?: number;
  /** overrides the surface friction */
  mu?: number;
  /** dh/dx and dh/dz of the plane */
  slopeX?: number;
  slopeZ?: number;
  /** optional extra relief (height offset in metres) */
  relief?: (x: number, z: number) => number;
}

/** Infinite plane with optional slope and relief: the proving ground. */
export class FlatGround implements Ground {
  constructor(public opts: FlatGroundOptions = {}) {}

  sample(x: number, z: number, out: GroundSample): void {
    const o = this.opts;
    const sx = o.slopeX ?? 0;
    const sz = o.slopeZ ?? 0;
    let h = sx * x + sz * z;
    let dhx = sx;
    let dhz = sz;
    if (o.relief) {
      const e = 0.05;
      const r0 = o.relief(x, z);
      h += r0;
      dhx += (o.relief(x + e, z) - r0) / e;
      dhz += (o.relief(x, z + e) - r0) / e;
    }
    const inv = 1 / Math.sqrt(dhx * dhx + 1 + dhz * dhz);
    out.h = h;
    out.nx = -dhx * inv;
    out.ny = inv;
    out.nz = -dhz * inv;
    const s = SURFACES[o.surface ?? Surface.Asphalt];
    out.surface = o.surface ?? Surface.Asphalt;
    out.mu = o.mu ?? s.mu;
    out.rr = s.rr;
  }
}
