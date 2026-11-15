/**
 * ModCar materials (docs/MODCAR.md §6, specs/art/CAR_LOOK.md).
 *
 * The GLB models carry no shading of their own: every material is recognised by its NAME and swapped
 * for one of ours (`applyCarMaterials`). One `CarLook` holds the materials of one car — shared by all of
 * its meshes, so a car costs one draw call per mesh and material, never one material per part.
 *
 * Per-instance colour and wear come from uniforms (a part drawn on its own) AND from vertex attributes
 * (a merged mesh of many parts): `aPaint` (vec3, linear colour), `aWear` (vec3: dirt, rust, wear) and
 * `aPartId` (float, 1…; for the highlight of one part inside a merged mesh). See carMerge.ts.
 */
import * as THREE from 'three';
import { glassMaterial, surfaceMaterial } from './materials';
import { GLSL_COMMON, GLSL_FRAGMENT_PARS, GLSL_VERTEX_MAIN, GLSL_VERTEX_PARS, globals } from './shaderlib';

/** the conventional material names (tools/blender/lib/modcar.py MAT_NAMES) */
export const CAR_MATERIAL_NAMES = [
  'paint',
  'paint_b',
  'trim',
  'chrome',
  'steel',
  'alu',
  'rubber',
  'glass',
  'glass_dark',
  'lens_head',
  'lens_tail',
  'lens_amber',
  'fabric',
  'leather',
  'wood',
  'plastic_int',
  'gauge',
  'ceramic',
  'rust',
  'emit',
] as const;

export type CarMaterialName = (typeof CAR_MATERIAL_NAMES)[number];

const NAMES = new Set<string>(CAR_MATERIAL_NAMES);

/** 'paint.001' (Blender's duplicate) → 'paint'; anything that is not a conventional name → null */
export function carMaterialName(name: string): CarMaterialName | null {
  const n = name.trim().toLowerCase().replace(/\.\d+$/, '');
  return NAMES.has(n) ? (n as CarMaterialName) : null;
}

export interface CarLookOptions {
  /** main paint (paint) and second paint (paint_b), sRGB hex or THREE.Color */
  paint?: THREE.ColorRepresentation;
  paint2?: THREE.ColorRepresentation;
  /** 0…1 for the whole car (merged meshes add their own per vertex) */
  dirt?: number;
  rust?: number;
  wear?: number;
}

export interface CarLights {
  /** 0 off, 1 low beam, 2 high beam */
  head?: number;
  /** tail lamps on (with the head lamps) */
  tail?: boolean;
  /** brake lamps 0…1 */
  brake?: number;
  turnLeft?: boolean;
  turnRight?: boolean;
}

/** preview colours of the conventional names (linear), until each has its own shading */
const BASE: Record<CarMaterialName, [number, number, number]> = {
  paint: [0.62, 0.16, 0.12],
  paint_b: [0.85, 0.8, 0.7],
  trim: [0.03, 0.03, 0.035],
  chrome: [0.9, 0.9, 0.92],
  steel: [0.42, 0.43, 0.45],
  alu: [0.7, 0.71, 0.72],
  rubber: [0.025, 0.025, 0.028],
  glass: [0.75, 0.85, 0.9],
  glass_dark: [0.08, 0.1, 0.12],
  lens_head: [0.95, 0.95, 0.9],
  lens_tail: [0.7, 0.04, 0.03],
  lens_amber: [0.95, 0.5, 0.05],
  fabric: [0.35, 0.22, 0.16],
  leather: [0.25, 0.12, 0.07],
  wood: [0.45, 0.28, 0.14],
  plastic_int: [0.18, 0.16, 0.15],
  gauge: [0.9, 0.88, 0.8],
  ceramic: [0.95, 0.95, 0.93],
  rust: [0.45, 0.2, 0.08],
  emit: [1.0, 0.9, 0.7],
};

const INTERIOR = new Set<CarMaterialName>(['fabric', 'leather', 'wood', 'plastic_int', 'gauge']);

/** the materials of one car */
export class CarLook {
  private readonly mats = new Map<CarMaterialName, THREE.ShaderMaterial>();
  private readonly lights: Required<CarLights> = { head: 0, tail: false, brake: 0, turnLeft: false, turnRight: false };
  private readonly paint = new THREE.Color();
  private readonly paint2 = new THREE.Color();
  /** x dirt, y rust, z wear */
  private readonly wear = new THREE.Vector3();
  /** names met in the last apply() that are not conventional (drawn with a plain cel material) */
  readonly unknown = new Set<string>();

  constructor(opts: CarLookOptions = {}) {
    this.paint.set(opts.paint ?? 0x9e2f22);
    this.paint2.set(opts.paint2 ?? 0xe6dccb);
    this.wear.set(opts.dirt ?? 0, opts.rust ?? 0, opts.wear ?? 0);
  }

  /** the material for a conventional name (created on first use, then shared) */
  material(name: CarMaterialName): THREE.ShaderMaterial {
    let m = this.mats.get(name);
    if (m) return m;
    const c = BASE[name];
    const color = new THREE.Color(c[0], c[1], c[2]);
    if (name === 'paint') color.copy(this.paint);
    if (name === 'paint_b') color.copy(this.paint2);
    if (name === 'glass' || name === 'glass_dark') m = glassMaterial(name === 'glass' ? 0x24343e : 0x0c1216, name === 'glass' ? 0.42 : 0.78);
    else if (name === 'lens_head' || name === 'lens_tail' || name === 'lens_amber' || name === 'emit') m = surfaceMaterial({ color, emissive: color, emissiveIntensity: name === 'emit' ? 1 : 0, ink: true });
    else m = surfaceMaterial({ color, spec: name === 'chrome' || name === 'paint' || name === 'paint_b' || name === 'ceramic' ? 0.6 : 0.1, ink: true, cabin: INTERIOR.has(name) });
    m.name = `car:${name}`;
    this.mats.set(name, m);
    return m;
  }

  /** swap the materials of every mesh under root by their names */
  apply(root: THREE.Object3D): this {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const swap = (m: THREE.Material): THREE.Material => {
        const n = carMaterialName(m.name);
        if (!n) {
          this.unknown.add(m.name || '(unnamed)');
          return this.material('plastic_int');
        }
        return this.material(n);
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    });
    return this;
  }

  setPaint(c: THREE.ColorRepresentation): void {
    this.paint.set(c);
    this.mats.get('paint')?.uniforms.uColor.value.copy(this.paint);
  }

  setPaint2(c: THREE.ColorRepresentation): void {
    this.paint2.set(c);
    this.mats.get('paint_b')?.uniforms.uColor.value.copy(this.paint2);
  }

  /** wear of the whole car (merged meshes add their own per vertex): dirt, rust, faded paint, 0…1 */
  setWear(w: { dirt?: number; rust?: number; wear?: number }): void {
    if (w.dirt !== undefined) this.wear.x = w.dirt;
    if (w.rust !== undefined) this.wear.y = w.rust;
    if (w.wear !== undefined) this.wear.z = w.wear;
  }

  setLights(l: CarLights): void {
    Object.assign(this.lights, l);
    const head = this.mats.get('lens_head');
    if (head) head.uniforms.uEmissive.value.setRGB(1.0, 0.9, 0.7).multiplyScalar(this.lights.head > 0 ? 2.4 : 0);
    const tail = this.mats.get('lens_tail');
    if (tail) tail.uniforms.uEmissive.value.setRGB(1.0, 0.12, 0.06).multiplyScalar((this.lights.tail ? 0.6 : 0) + this.lights.brake * 1.6);
    const amber = this.mats.get('lens_amber');
    if (amber) amber.uniforms.uEmissive.value.setRGB(1.0, 0.5, 0.08).multiplyScalar(this.lights.turnLeft || this.lights.turnRight ? 1.6 : 0);
  }

  /** every material this car uses (for counting programs, disposing) */
  get materials(): THREE.ShaderMaterial[] {
    return [...this.mats.values()];
  }

  dispose(): void {
    for (const m of this.mats.values()) m.dispose();
    this.mats.clear();
  }
}

/** swap a loaded model's materials for the car materials (see CarLook) */
export function applyCarMaterials(root: THREE.Object3D, opts: CarLookOptions = {}): CarLook {
  return new CarLook(opts).apply(root);
}

// ------------------------------------------------------------------------------------------ ghosts

export type GhostKind = 'empty' | 'replace' | 'blocked';

const ghosts = new Map<GhostKind, THREE.ShaderMaterial>();

/**
 * The hologram of a part that can be installed (docs/MODCAR.md §5.2): cyan-white light added on top of
 * the frame, bright at the rim, horizontal scanlines drifting up, breathing slowly. 'replace' is fainter
 * (a part is already there), 'blocked' is orange-red. No depth write, never in the shadow maps.
 * One material per kind, shared by every ghost.
 */
export function ghostMaterial(kind: GhostKind): THREE.ShaderMaterial {
  let m = ghosts.get(kind);
  if (m) return m;
  const color = kind === 'blocked' ? new THREE.Color(1.0, 0.36, 0.16) : new THREE.Color(0.55, 0.92, 1.0);
  m = new THREE.ShaderMaterial({
    uniforms: { ...globals, uGhostColor: { value: color }, uGhostFill: { value: kind === 'replace' ? 0.35 : 1.0 }, uFocus: { value: 0 } },
    vertexShader: /* glsl */ `
      ${GLSL_VERTEX_PARS}
      void main() {
        vec3 transformed = position;
        vec3 objNormal = normal;
        ${GLSL_VERTEX_MAIN}
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FRAGMENT_PARS}
      ${GLSL_COMMON}
      uniform vec3 uGhostColor;
      uniform float uGhostFill;
      uniform float uFocus;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vNormal);
        vec3 v = normalize(cameraPosition - vPos);
        float rim = pow(1.0 - abs(dot(n, v)), 2.2);
        float breathe = 0.75 + 0.25 * sin(uTime * 2.4);
        float scan = smoothstep(0.35, 0.5, abs(fract(vPos.y * 22.0 - uTime * 0.6) - 0.5));
        float k = (0.12 * uGhostFill + 0.85 * rim + 0.1 * scan * uGhostFill) * breathe * (1.0 + uFocus);
        gl_FragColor = vec4(uGhostColor * k, 0.5);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    // alpha keeps the smaller of what is there and 0.5: the paint finish leaves the hologram alone, and
    // the ink ids of the car under it (< 0.23) survive
    blendEquationAlpha: THREE.MinEquation,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneFactor,
  });
  m.name = `ghost:${kind}`;
  ghosts.set(kind, m);
  return m;
}

/** draw a whole model as a ghost of the given kind (and keep it out of the shadow maps) */
export function applyGhost(root: THREE.Object3D, kind: GhostKind): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.material = ghostMaterial(kind);
      mesh.layers.set(0);
      mesh.renderOrder = 20;
    }
  });
}

