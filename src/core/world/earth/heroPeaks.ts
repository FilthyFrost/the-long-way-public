/**
 * A place's hero peak far off (V9, docs/V3/nodes/V9-heroes.md): a stratovolcano's "远处一座完美对称的雪顶火山" and a
 * horn's "金字塔一样的雪峰". The land's own cone of a stratovolcano is 1.4 to 2.4 km across its foot and must lie within
 * the three stretches of road about it (core/world/features.ts layout): it found a place in two of eight such places,
 * and where it did it stood off to one side. So the peak a place is named for stands of itself on the horizon, ahead:
 * along the way its road runs across the place, 9 to 14 km beyond its end and a little to one side, so that the whole
 * stretch is driven toward it. Too far to be reached and too far for the land under it to matter: its foot is sunk
 * well under the land there (game/scene/heroPeaks.ts draws it).
 */
import type { SpineSample } from '../spine';
import type { TerrainPoint, World } from '../terrain';
import type { EarthPiece } from './road';

export interface HeroPeak {
  kind: 'volcano' | 'horn';
  x: number;
  z: number;
  /** its foot (sunk under the land) and its summit (world m), and its radius at the foot (m) */
  foot: number;
  top: number;
  r: number;
  /** how far down its snow reaches, as a share of its height from the summit (0 none … 1 all) */
  snow: number;
  /** does it breathe steam */
  steam: boolean;
  yaw: number;
  seed: number;
}

const hash = (a: number, b: number): number => {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x5bd1e995, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};

function kindOf(p: EarthPiece): HeroPeak['kind'] | null {
  if (p.kind !== 'scene' || !p.scene) return null;
  const lf = p.scene.place.look.landform.id;
  return lf === 'stratovolcano' ? 'volcano' : lf === 'horn_arete' ? 'horn' : null;
}

const cache = new WeakMap<World, Map<number, HeroPeak | null>>();

/** a place's hero peak (null where it has none), the same whoever asks */
export function heroPeakOf(world: World, p: EarthPiece, tp: TerrainPoint, st: SpineSample): HeroPeak | null {
  const kind = kindOf(p);
  if (!kind) return null;
  let m = cache.get(world);
  if (!m) cache.set(world, (m = new Map()));
  if (m.has(p.index)) return m.get(p.index)!;
  const q = (j: number): number => hash((world.seed | 0) ^ Math.imul(p.index + 13, 0x2545f491), j);
  world.spine.at(p.start, st);
  const ax = st.x;
  const az = st.z;
  world.spine.at(p.end, st);
  let dx = st.x - ax;
  let dz = st.z - az;
  const L = Math.hypot(dx, dz) || 1;
  dx /= L;
  dz /= L;
  // (far enough to stand some ten degrees over the horizon from the place, as a great volcano does over its plain)
  // (a horn nearer and taller for its narrow foot: it must stand over the ridges in front of it)
  const D = kind === 'horn' ? 7000 + 3000 * q(1) : 10000 + 4000 * q(1);
  const lat = (q(2) < 0.5 ? -1 : 1) * (800 + 1700 * q(3));
  const x = st.x + dx * D - dz * lat;
  const z = st.z + dz * D + dx * lat;
  world.shape(x, z, tp);
  const sc = p.scene!.place;
  const ground = Math.min(tp.h, sc.macro.base);
  // (and always over the place's own ranges by half again: it stands out of them, not among them)
  const R = Math.max(200, sc.macro.relief);
  const H = kind === 'volcano' ? Math.max(2400 + 900 * q(4), R * 1.5) : Math.max(2200 + 1000 * q(4), R * 1.6);
  // (its summit over the place's base by H; its foot well under the land there)
  const top = sc.macro.base + H;
  const foot = ground - 500;
  // (snow: by how cold its summit is — the place's warmth at sea level, cooled 6.5° a kilometre)
  const summitT = sc.macro.tSea - 0.0065 * top;
  const snow = Math.min(0.75, Math.max(0, (2 - summitT) / 26));
  const peak: HeroPeak = {
    kind,
    x,
    z,
    foot,
    top,
    r: kind === 'volcano' ? H * (2.6 + 0.8 * q(5)) : H * (1.3 + 0.4 * q(5)),
    // (its cap at least a fifth of it, at most half: below the snow its dark rock and its gullies)
    snow: kind === 'horn' ? Math.min(0.6, Math.max(0.3, snow)) : Math.min(0.5, Math.max(0.2, snow)),
    steam: kind === 'volcano' && q(6) < 0.35,
    yaw: q(7) * Math.PI * 2,
    seed: q(8),
  };
  m.set(p.index, peak);
  return peak;
}

/** does a place have a hero peak */
export function hasHeroPeak(p: EarthPiece): boolean {
  return kindOf(p) !== null;
}
