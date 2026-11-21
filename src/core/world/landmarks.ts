/**
 * Hero landmarks: colossal remains placed beside the road every few kilometres, far enough
 * out to be seen for minutes — first as a shape on the horizon, then towering past, then in
 * the mirror. Placement is a pure function of the seed, so every player sees the same ones.
 */
import { hash2 } from '../math/rng';
import { BIOMES, regionRow, type RegionDef } from './biomes';
import { LAND_SLOT } from './landform';
import { BiomeBlend, SpineSample } from './spine';
import { TerrainPoint, type World } from './terrain';

export const LANDMARK_KINDS = ['ring', 'hull', 'dish', 'viaduct', 'turbines', 'towers'] as const;
export type LandmarkKind = (typeof LANDMARK_KINDS)[number];

/** which remains each biome tends to hold */
const BY_BIOME: Record<string, LandmarkKind[]> = {
  plains: ['ring', 'viaduct', 'turbines', 'towers', 'dish'],
  desert: ['hull', 'dish', 'ring', 'towers', 'hull'],
  alpine: ['viaduct', 'dish', 'ring', 'turbines', 'viaduct'],
  forest: ['dish', 'viaduct', 'towers', 'ring', 'turbines'],
  lakes: ['hull', 'turbines', 'ring', 'viaduct', 'hull'],
  maple: ['viaduct', 'ring', 'towers', 'dish', 'turbines'],
};

/** the remains a region tends to hold: the row under its id, else its kin's */
export function landmarkKindsOf(region: RegionDef): readonly LandmarkKind[] {
  return regionRow(BY_BIOME, region);
}

/** average spacing along the road (m) */
export const LANDMARK_SPACING = 2700;

export class Landmark {
  index = 0;
  /** distance along the road of the closest approach, and lateral offset (+ = right) */
  s = 0;
  d = 0;
  kind: LandmarkKind = 'ring';
  yaw = 0;
  scale = 1;
  x = 0;
  y = 0;
  z = 0;
  /** it is not there: its place on the road is one of the journey's quiet stretches (quiet.ts) */
  absent = false;
}

const st = new SpineSample();
const bl = new BiomeBlend();
const tp = new TerrainPoint();

export function landmarkAt(world: World, k: number, out: Landmark): void {
  const h = hash2(k, 0x1a4d, world.seed);
  const r = (n: number): number => ((h >>> n) & 255) / 255;
  out.index = k;
  out.s = 1500 + k * LANDMARK_SPACING + r(0) * 900;
  const side = h & 0x100 ? 1 : -1;
  out.d = side * (300 + 380 * r(9));
  const sp = world.spine;
  sp.at(out.s, st);
  out.x = st.x - Math.sin(st.phi) * out.d;
  out.z = st.z + Math.cos(st.phi) * out.d;
  world.shape(out.x, out.z, tp);
  out.y = tp.h;
  sp.biomeAt(out.s, bl);
  const kinds = landmarkKindsOf(BIOMES[bl.t < 0.5 ? bl.a : bl.b]);
  out.kind = kinds[(h >>> 17) % kinds.length];
  // out at sea it is a ship aground in the shallows or turbines standing in the water: they sit at the
  // surface, not on the bed fourteen metres down
  if (tp.wkind === 3 && tp.wl > tp.bed) {
    out.kind = h & 0x2000000 ? 'hull' : 'turbines';
    out.y = tp.wl - (out.kind === 'hull' ? 4.5 : 1);
  }
  out.yaw = r(20) * Math.PI * 2;
  out.scale = 0.85 + 0.45 * r(4);
  // (not in the scenic world of version 5: the old placeholder remains — a concrete ring, a colonnade — stood flat and
  // grey in its painted country, a wet karst's forest among them; its wonders are to be its own: V2)
  out.absent = world.quiet(Math.floor(out.s / LAND_SLOT)) || world.rules.version >= 5;
}

/** index range of landmarks whose closest approach lies within [sMin, sMax] */
export function landmarkRange(sMin: number, sMax: number): [number, number] {
  return [Math.max(0, Math.floor((sMin - 2400) / LANDMARK_SPACING)), Math.max(0, Math.ceil((sMax - 1500) / LANDMARK_SPACING))];
}
