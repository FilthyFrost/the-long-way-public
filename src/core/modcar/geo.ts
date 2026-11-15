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

/** height of the middle of a part's bounds above its origin (its own centre of mass, roughly) */
export function midHeight(id: string): number | undefined {
  const b = PARTS[id]?.bbox;
  return b ? (b[0][1] + b[1][1]) / 2 : undefined;
}
