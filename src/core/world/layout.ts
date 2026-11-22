/**
 * How the things of a place are set out (G3, docs/V3/nodes/G-ghibli.md): the few shapes every scatter of the world is
 * composed from, so that a wood is a wood of one kind with an edge, a thicket is a thicket, the stones of a slope lie
 * together where its rock comes through, and the flowers of a meadow are a drift of one colour — and between them the
 * country is open. Nothing here is dice thrown cell by cell: a cell asks which stand, which clump it lies in.
 *
 *   A stand    one of the patches a wood is made of, some 150–250 m across, each with a number of its own: a stand
 *              is of one kind of tree (and a companion), the next stand of another (standAt).
 *   A clump    a round patch with a ragged outline at one in so many of the squares of a grid: a copse in a meadow,
 *              a thicket, an outcrop, a drift of flowers. A point is told how deep in a clump it lies, and whose
 *              (clumpAt).
 *   A spacing  plants that keep their distance, each its own ground's water: a savanna's trees, a desert's shrubs —
 *              one to a square of the grid, each somewhere in its square (spacedAt).
 *
 * Pure, DOM-free, deterministic for a seed whatever is asked first.
 */
import { fbm2 } from '../math/noise';
import { hash2 } from '../math/rng';

/** the clump a point lies in (clumpAt fills one) */
export class Clump {
  /** how deep in it: 1 at its middle, 0 at its edge and beyond */
  k = 0;
  /** a number of its own, 0 … 1 (what kind it is of, its colour) */
  id = 0;
  /** its middle and its radius (m) */
  x = 0;
  z = 0;
  r = 0;
}

/**
 * The clump at (x, z), of the clumps of one kind: one in `share` of the squares `every` m a side holds one, its
 * middle anywhere in the square's inner part, its radius r0 … r1 m (kept within the squares next to its own), its
 * outline ragged. Returns how deep in it the point lies (0: in none), and fills `out` when given.
 */
export function clumpAt(x: number, z: number, every: number, share: number, r0: number, r1: number, seed: number, out?: Clump): number {
  const i0 = Math.floor(x / every);
  const j0 = Math.floor(z / every);
  const most = every * 0.85;
  let best = 0;
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const i = i0 + di;
      const j = j0 + dj;
      const h = hash2(i, j, seed);
      if ((h & 0xffff) / 65536 >= share) continue;
      const h2 = hash2(j, i, seed + 0x51);
      const cx = (i + 0.18 + 0.64 * (((h >>> 16) & 0xff) / 255)) * every;
      const cz = (j + 0.18 + 0.64 * (((h >>> 24) & 0xff) / 255)) * every;
      let r = r0 + (r1 - r0) * ((h2 & 0xff) / 255);
      if (r > most) r = most;
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      // (its outline: up to a third in and out of its radius, by the bearing from its middle)
      if (d2 > r * r * 1.8) continue;
      const a = Math.atan2(dz, dx);
      const ph = ((h2 >>> 8) & 0xff) * 0.0246;
      const rr = r * (1 + 0.2 * Math.sin(3 * a + ph) + 0.12 * Math.sin(5 * a + ph * 2.3 + 1));
      const k = 1 - Math.sqrt(d2) / rr;
      if (k > best) {
        best = k;
        if (out) {
          out.id = ((h2 >>> 16) & 0xffff) / 65536;
          out.x = cx;
          out.z = cz;
          out.r = rr;
        }
      }
    }
  }
  if (out) out.k = best;
  return best;
}

/**
 * A meadow's flowers in drifts: what its flowers are multiplied by at (x, z) — many times over inside a drift, thick
 * toward its middle, hardly one between the drifts — and into `out` the drift (its `id` is its colour's number,
 * driftHue). The core's cover (flora.ts), the ground field's flowers (groundField.ts) and the grass the renderer builds
 * (scene/worldBuild.ts) read the same drifts.
 */
export function driftFactor(x: number, z: number, seed: number, out: Clump): number {
  const k = clumpAt(x, z, 52, 0.5, 10, 24, seed + 0x5b1, out);
  return k > 0 ? 1.5 + 6 * Math.min(1, k * 2.5) : 0.1;
}
/** the most driftFactor comes to */
export const DRIFT_MOST = 7.5;
/** a drift's hue as a number for a list of hues (0 … 1 its middle; the list's first and last take what falls outside) */
export function driftHue(id: number): number {
  return 0.5 + 0.8 * (((id * 2.5) % 2.5) - 1.25);
}

/**
 * The stand (x, z) lies in, as its own number 0 … 1: the country cut into patches some `scale` m across with wandering
 * edges (the nearest of the grid's points, the place asked a little off its own by a slow noise).
 */
export function standAt(x: number, z: number, scale: number, seed: number): number {
  const wx = x + 0.3 * scale * fbm2(x / (scale * 0.8), z / (scale * 0.8), seed + 0x3a1, 2);
  const wz = z + 0.3 * scale * fbm2(z / (scale * 0.8), x / (scale * 0.8), seed + 0x3a2, 2);
  const i0 = Math.floor(wx / scale);
  const j0 = Math.floor(wz / scale);
  let best = 1e30;
  let id = 0;
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const i = i0 + di;
      const j = j0 + dj;
      const h = hash2(i, j, seed + 0x3a3);
      const dx = wx - (i + (h & 0xff) / 255) * scale;
      const dz = wz - (j + ((h >>> 8) & 0xff) / 255) * scale;
      const d2 = dx * dx + dz * dz;
      if (d2 < best) {
        best = d2;
        id = ((h >>> 16) & 0xffff) / 65536;
      }
    }
  }
  return id;
}

/**
 * Is cell (cx, cz) of a grid of `cell` m the one of its square that a plant keeping `spacing` m from its neighbours
 * stands in? The grid is cut into squares of n × n cells (n the spacing in cells); in each, one cell by the square's
 * own dice, kept off the square's rim where n allows (two plants of neighbouring squares are never side by side).
 */
export function spacedAt(cx: number, cz: number, cell: number, spacing: number, seed: number): boolean {
  const n = Math.max(1, Math.round(spacing / cell));
  if (n === 1) return true;
  const qx = Math.floor(cx / n);
  const qz = Math.floor(cz / n);
  const h = hash2(qx, qz, seed + 0x5b7);
  // (of the n cells along a side, the inner ones when there are three or more)
  const m = n >= 3 ? n - 1 : n;
  const ix = (h & 0xffff) % m;
  const iz = ((h >>> 16) & 0xffff) % m;
  return cx - qx * n === ix && cz - qz * n === iz;
}
