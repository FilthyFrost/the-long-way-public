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
  // (the cab's inside, cut hard: a wreck without its door skins shows its door linings, and left out it stood with a hole)
  fabric: 0.06,
  leather: 0.06,
  plastic_int: 0.06,
  gauge: 0.1,
};

/** the share each keeps in the middle distance (from some twenty metres): three times its far share, at most 60 % */
export const MID_SHARE = (name: string): number => Math.min(FAR_SHARE[name] === 1 ? 1 : 0.6, 3 * (FAR_SHARE[name] ?? 0.12));

/**
 * What is not drawn at all far off: nothing now. (The cab's inside was left out, not to be seen from forty metres; but
 * a wreck without its door skins shows the door linings, and left out it stood with a hole in its middle.)
 */
export const FAR_HIDDEN = new Set<string>();

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
  const [out] = MeshoptSimplifier.simplify(indices, positions, 3, target, error, prune ? ['Permissive', 'Prune'] : ['Permissive']);
  // (where edge collapse cannot reach the share within the bound, the mesh keeps more: clustering it instead ate thin
  // panels — a door's skin — and a far wreck stood with a hole in its middle)
  return out;
}
