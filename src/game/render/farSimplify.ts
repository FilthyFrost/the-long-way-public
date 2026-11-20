/**
 * Far models of the vehicles (docs/V3/nodes/P3-carfar.md): a parked vehicle's merged meshes (render/carMerge.ts)
 * reduced to a tenth or so of their triangles, for when it stands far off. meshoptimizer's simplifier (shipped
 * with three) collapses edges within an error bound, allowed across the seams of normals and uvs (from 45 m a
 * seam is not seen), small loose pieces pruned; where that cannot reach its share it is clustered sloppily.
 *
 * DOM-free: run in a worker (farWorker.ts) so that no frame waits for it; usable directly in tests.
 */
import { MeshoptSimplifier } from 'three/addons/libs/meshopt_simplifier.module.js';

/** the share of its triangles each kind of merged mesh keeps far off (render/carMaterials.ts names) */
export const FAR_SHARE: Record<string, number> = {
  paint: 0.1,
  paint_b: 0.1,
  trim: 0.1,
  chrome: 0.08,
  steel: 0.08,
  alu: 0.08,
  rubber: 0.15,
  rust: 0.12,
  // (glass and lamps are few triangles in thin loose panes: kept whole, or the cab looks empty and the lamps go)
  glass: 1,
  glass_dark: 1,
  lens_head: 1,
  lens_tail: 1,
  lens_amber: 1,
  ceramic: 0.1,
  emit: 1,
  wood: 0.1,
  cap_oil: 0.2,
  cap_water: 0.2,
};

/** the share each keeps in the middle distance (from some twenty metres): three times its far share, at most 60 % */
export const MID_SHARE = (name: string): number => Math.min(FAR_SHARE[name] === 1 ? 1 : 0.6, 3 * (FAR_SHARE[name] ?? 0.12));

/** what is not drawn at all far off: the inside of the cab, not to be seen from forty metres */
export const FAR_HIDDEN = new Set(['fabric', 'leather', 'plastic_int', 'gauge']);

/** the error allowed, as a share of the mesh's size (a car of 5 m: some 6 cm far off, 3 cm in the middle distance) */
export const FAR_ERROR = 0.012;
export const MID_ERROR = 0.0055;

export function simplifierReady(): Promise<void> {
  return MeshoptSimplifier.ready;
}

/**
 * A mesh's triangles (its index) reduced to about `share` of them; the simplifier must be ready. `prune`: small loose
 * pieces may go altogether (far off; in the middle distance a mirror or a handle is still seen).
 */
export function reduceIndex(positions: Float32Array, indices: Uint32Array, share: number, error = FAR_ERROR, prune = true): Uint32Array {
  const target = Math.max(3, Math.floor((indices.length * share) / 3) * 3);
  if (indices.length <= target) return indices;
  let [out] = MeshoptSimplifier.simplify(indices, positions, 3, target, error, prune ? ['Permissive', 'Prune'] : ['Permissive']);
  if (prune && out.length > target * 1.6) {
    // (an open shell of many small pieces will not collapse that far within the bound: clustered instead)
    const [sloppy] = MeshoptSimplifier.simplifySloppy(indices, positions, 3, null, target, error * 2);
    if (sloppy.length >= 3 && sloppy.length < out.length) out = sloppy;
  }
  return out;
}
