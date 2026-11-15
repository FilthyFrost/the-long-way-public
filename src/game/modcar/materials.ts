/**
 * The look of ModCar models in the game. The GLBs carry materials only by name (docs/MODCAR.md §6);
 * each name becomes one of our own cel materials here, shared between every mesh of that name and
 * paint colour, so a whole vehicle stays a handful of programs.
 *
 * This is the interim mapping onto surfaceMaterial (STYLE.md "赛璐璐 + 描线"); the anime car shading
 * (src/game/render/carMaterials.ts, the rendering line's work) replaces it behind the same interface.
 */
import * as THREE from 'three';
import { glassMaterial, surfaceMaterial } from '../render/materials';

/** base colours (sRGB) of the materials that do not take paint */
const BASE: Record<string, { color: number; spec?: number; cabin?: boolean; emissive?: number }> = {
  trim: { color: 0x2a2b2e, spec: 0.15 },
  chrome: { color: 0xe4e8ec, spec: 0.9 },
  steel: { color: 0x7a7f86, spec: 0.35 },
  alu: { color: 0xb4b8bc, spec: 0.45 },
  rubber: { color: 0x1d1d20, spec: 0.05 },
  fabric: { color: 0x7a5a44, cabin: true },
  leather: { color: 0x5a3424, spec: 0.2, cabin: true },
  wood: { color: 0x8a5a32, spec: 0.1 },
  plastic_int: { color: 0x3a3634, spec: 0.1, cabin: true },
  gauge: { color: 0xece6d4, cabin: true },
  ceramic: { color: 0xf3f2ec, spec: 0.7 },
  rust: { color: 0x8a4a26, spec: 0.05 },
  emit: { color: 0xfff0d0, emissive: 0xfff0d0 },
  lens_head: { color: 0xf2efe6, spec: 0.8 },
  lens_tail: { color: 0xa0221c, spec: 0.6 },
  lens_amber: { color: 0xd88a2a, spec: 0.6 },
};

export type LensKind = 'lens_head' | 'lens_tail' | 'lens_amber';

/** the materials of one vehicle (or of loose parts): lenses are per vehicle so its lamps light alone */
export class CarMaterials {
  private readonly byKey = new Map<string, THREE.Material>();
  readonly lenses: Record<LensKind, THREE.ShaderMaterial>;

  constructor() {
    this.lenses = {
      lens_head: surfaceMaterial({ color: BASE.lens_head.color, spec: 0.8, ink: true }),
      lens_tail: surfaceMaterial({ color: BASE.lens_tail.color, spec: 0.6, ink: true }),
      lens_amber: surfaceMaterial({ color: BASE.lens_amber.color, spec: 0.6, ink: true }),
    };
  }

  /** the material for a GLB material name, with a paint colour for paint / paint_b */
  get(name: string, paint: number, paint2: number, vertexAO: boolean): THREE.Material {
    const base = name.replace(/\.\d+$/, '');
    if (base === 'lens_head' || base === 'lens_tail' || base === 'lens_amber') return this.lenses[base];
    const color = base === 'paint' ? paint : base === 'paint_b' ? paint2 : (BASE[base]?.color ?? 0x8a8a8a);
    const key = `${base}|${color.toString(16)}|${vertexAO ? 1 : 0}`;
    let m = this.byKey.get(key);
    if (!m) {
      if (base === 'glass') m = glassMaterial(0xbfd6dc, 0.22);
      else if (base === 'glass_dark') m = glassMaterial(0x1e262c, 0.55);
      else {
        const b = BASE[base];
        m = surfaceMaterial({
          color,
          spec: b?.spec ?? (base.startsWith('paint') ? 0.55 : 0.2),
          ink: true,
          cabin: b?.cabin ?? false,
          vertexColors: vertexAO,
          emissive: b?.emissive,
        });
      }
      this.byKey.set(key, m);
    }
    return m;
  }

  /** lamps on or off (and the brake lights' extra) */
  setLamps(head: number, tail: number): void {
    (this.lenses.lens_head.uniforms.uEmissive.value as THREE.Color).setRGB(1.0, 0.86, 0.6).multiplyScalar(head);
    (this.lenses.lens_tail.uniforms.uEmissive.value as THREE.Color).setRGB(1.0, 0.16, 0.08).multiplyScalar(tail);
  }
}

/**
 * Swap every mesh material of a model for ours (vertex colour = baked AO when present). The GLB names
 * are kept in userData.mat, so a model can be painted again later.
 */
export function applyMaterials(root: THREE.Object3D, mats: CarMaterials, paint: number, paint2: number): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const ao = !!mesh.geometry.getAttribute('color');
    if (!mesh.userData.mat) {
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mesh.userData.mat = list.map((mt) => mt.name || 'steel');
    }
    const names = mesh.userData.mat as string[];
    const out = names.map((n) => mats.get(n, paint, paint2, ao));
    mesh.material = Array.isArray(mesh.material) ? out : out[0];
    mesh.castShadow = true;
  });
}

/** the GLB material names a mesh had */
export function matNames(mesh: THREE.Mesh): string[] {
  return (mesh.userData.mat as string[] | undefined) ?? (Array.isArray(mesh.material) ? mesh.material.map((m) => m.name) : [mesh.material.name]);
}
