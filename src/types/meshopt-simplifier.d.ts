// The simplifier's module as shipped with three (examples/jsm/libs), which @types/three has no declaration for.
declare module 'three/addons/libs/meshopt_simplifier.module.js' {
  type Flag = 'LockBorder' | 'Sparse' | 'ErrorAbsolute' | 'Prune' | 'Regularize' | 'Permissive' | 'RegularizeLight';
  export const MeshoptSimplifier: {
    ready: Promise<void>;
    supported: boolean;
    simplify(indices: Uint32Array, positions: Float32Array, stride: number, targetIndexCount: number, targetError: number, flags?: Flag[]): [Uint32Array, number];
    simplifySloppy(indices: Uint32Array, positions: Float32Array, stride: number, lock: Uint8Array | null, targetIndexCount: number, targetError: number): [Uint32Array, number];
  };
}
