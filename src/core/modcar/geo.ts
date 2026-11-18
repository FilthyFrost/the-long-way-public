/**
 * What the part models say about their own geometry (data/parts_geo.json, written by the Blender
 * scripts in tools/blender/parts): bounds, the occupant's eye of a seat, the nominal box of a stretch
 * part, sub-mount transforms. Parts without a model yet have no entry; callers fall back to the
 * catalogue's numbers.
 */
import geoJson from './data/parts_geo.json';

export interface PartGeo {
  /** [[minx, miny, minz], [maxx, maxy, maxz]], part frame (x forward, y up, z right) */
  bbox?: [number[], number[]];
  triangles?: number;
  materials?: string[];
  eye?: number[];
  fit_nominal?: number[];
  radius?: number;
  inner_radius?: number;
  width?: number;
  sidewall?: number;
  mounts?: string[];
  mount_tf?: Record<string, { pos: number[]; quat: number[] }>;
}

const PARTS = ((geoJson as unknown as { parts?: Record<string, PartGeo> }).parts ?? {}) as Record<string, PartGeo>;

export function partGeo(id: string): PartGeo | undefined {
  return PARTS[id];
}

/**
 * The highest point of a fitted part above its origin, with what rides on it: a turbo on its engine's M_turbo
 * (a big one stands taller than the engine, and a shut bonnet comes down onto it)
 */
export function partTop(inst: { part: string; sub: Partial<Record<string, { part: string }>> }): number | undefined {
  const g = PARTS[inst.part];
  const b = g?.bbox;
  if (!b) return undefined;
  let top = b[1][1];
  const t = inst.sub.turbo;
  const at = g?.mount_tf?.M_turbo;
  const tb = t ? PARTS[t.part]?.bbox : undefined;
  if (at && tb) {
    const [qx, qy, qz, qw] = at.quat;
    for (const x of [tb[0][0], tb[1][0]])
      for (const y of [tb[0][1], tb[1][1]])
        for (const z of [tb[0][2], tb[1][2]]) {
          // (the corner turned by the mount: v + 2w(q × v) + 2q × (q × v), its height)
          const cx = qy * z - qz * y;
          const cy = qz * x - qx * z;
          const cz = qx * y - qy * x;
          const ry = y + 2 * qw * cy + 2 * (qz * cx - qx * cz);
          top = Math.max(top, at.pos[1] + ry);
        }
  }
  return top;
}

/** height of the middle of a part's bounds above its origin (its own centre of mass, roughly) */
export function midHeight(id: string): number | undefined {
  const b = PARTS[id]?.bbox;
  return b ? (b[0][1] + b[1][1]) / 2 : undefined;
}
