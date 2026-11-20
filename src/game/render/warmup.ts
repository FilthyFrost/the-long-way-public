/**
 * Shaders compiled ahead (docs/V3/nodes/P0-perf.md). A material's program is otherwise compiled the first time it is
 * drawn: for the car materials a wreck by the road brings in, 0.3–1.5 s at a time in the middle of a drive (measured:
 * harness/shots/p0_drive_profile.mjs). Every variant the vehicles' materials can take — each conventional material,
 * merged or not, with a grime mask or not, with vertex colours or without, a window's opaque twin — is put on a tiny
 * mesh once, at the start, together with the materials the world's view keeps for what streams in later (places,
 * bridges, poles), and compiled in the background (KHR_parallel_shader_compile where the browser has it), so that
 * whatever comes into view finds its program ready.
 */
import * as THREE from 'three';
import { CAR_MATERIAL_NAMES, CarLook, type Variant } from './carMaterials';

/** the variants the vehicles' meshes take (modcar/materials.ts applyMaterials) */
const VARIANTS: readonly Variant[] = [
  { ao: true, vpaint: false, vwear: false, vpart: false },
  { ao: false, vpaint: false, vwear: false, vpart: false },
  { ao: true, vpaint: false, vwear: false, vpart: false, vmask: true },
  { ao: false, vpaint: false, vwear: false, vpart: false, vmask: true },
  // (merged: paint, wear and the part's id in the vertices)
  { ao: true, vpaint: true, vwear: true, vpart: true },
  { ao: false, vpaint: true, vwear: true, vpart: true },
];

/**
 * Compile the vehicles' every material variant and `extra` materials, in the background; resolves with how many
 * meshes were compiled once the programs are ready. `scene` is the scene they will be drawn in (its fog and its
 * environment are part of a program).
 */
export async function warmShaders(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, extra: readonly THREE.Material[] = []): Promise<number> {
  const group = new THREE.Group();
  group.name = 'warmup';
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.001, 0, 0, 0, 0.001, 0], 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1], 3));
  const look = new CarLook({});
  const add = (m: THREE.Material): void => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.frustumCulled = false;
    group.add(mesh);
  };
  for (const name of CAR_MATERIAL_NAMES) {
    for (const v of VARIANTS) {
      add(look.material(name, v));
      // (a window's opaque twin, where the crust is thick)
      if (name === 'glass' || name === 'glass_dark') add(look.material(name, { ...v, vpaint: false, crustCut: true }));
    }
  }
  for (const m of extra) add(m);
  // (in front of the eye, out of the way: compiled as they would be drawn there, never drawn)
  group.position.copy(camera.position);
  scene.add(group);
  try {
    await renderer.compileAsync(group, camera, scene);
  } finally {
    scene.remove(group);
    geo.dispose();
  }
  return group.children.length;
}

/** the materials an object keeps as its own fields (a view's for what it will stream in) */
export function materialsOf(owner: object | null | undefined): THREE.Material[] {
  if (!owner) return [];
  const out: THREE.Material[] = [];
  for (const v of Object.values(owner)) if (v instanceof THREE.Material) out.push(v);
  return out;
}
