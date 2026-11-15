/**
 * The look of ModCar models in the game. The GLBs carry materials only by name (docs/MODCAR.md §6);
 * each name becomes one of the car materials of src/game/render/carMaterials.ts (the anime-industrial
 * car shading, specs/art/CAR_LOOK.md).
 *
 * A vehicle holds one CarLook per owner — the frame's body, each fitted part, each hinged panel — so
 * every part keeps its own paint, dirt and rust in uniforms that change without touching the meshes
 * (the road's dust settles a little every frame, the sponge takes it off, a spray can repaints one
 * door). The programs behind them are the same for all owners: more owners cost materials, not shaders.
 */
import * as THREE from 'three';
import { CarLook, carMaterialName, type CarLights } from '../render/carMaterials';
import { LAYER_SHADOW_FAR, LAYER_SHADOW_NEAR } from '../render/shadow';

/** what an owner looks like: paint and second paint (sRGB hex), and its wear 0…1 */
export interface LookOf {
  paint: number;
  paint2: number;
  dirt?: number;
  rust?: number;
  /** faded paint */
  wear?: number;
}

interface Owned {
  look: CarLook;
  paint: number;
  paint2: number;
}

/** the looks of one vehicle (or of the things lying about) */
export class CarMaterials {
  private readonly owned = new Map<string, Owned>();
  private readonly lights: CarLights = {};
  private lightsKey = '';
  private readonly frame = new THREE.Matrix4();
  private framed = false;
  private lit = '';

  /** the look of an owner, made on first use and brought in line with `of` */
  look(owner: string, of: LookOf): CarLook {
    let o = this.owned.get(owner);
    if (!o) {
      const look = new CarLook({ paint: of.paint, paint2: of.paint2, dirt: of.dirt ?? 0, rust: of.rust ?? 0, wear: of.wear ?? 0 });
      look.setLights(this.lights);
      if (this.framed) look.setCarFrame(this.frame);
      o = { look, paint: of.paint, paint2: of.paint2 };
      this.owned.set(owner, o);
      return look;
    }
    this.set(owner, of);
    return o.look;
  }

  has(owner: string): boolean {
    return this.owned.has(owner);
  }

  /** an owner's paint or wear changed (the spray can, the sponge, the dust of the road) */
  set(owner: string, of: LookOf): void {
    const o = this.owned.get(owner);
    if (!o) return;
    if (o.paint !== of.paint) {
      o.look.setPaint(of.paint);
      o.paint = of.paint;
    }
    if (o.paint2 !== of.paint2) {
      o.look.setPaint2(of.paint2);
      o.paint2 = of.paint2;
    }
    o.look.setWear({ dirt: of.dirt ?? 0, rust: of.rust ?? 0, wear: of.wear ?? 0 });
  }

  /** the owner is gone (a part taken off, a loose thing picked up): its materials go with it */
  drop(owner: string): void {
    const o = this.owned.get(owner);
    if (!o) return;
    o.look.dispose();
    this.owned.delete(owner);
    if (this.lit === owner) this.lit = '';
  }

  /** every owner whose name starts with `prefix` (all of them for '') */
  owners(prefix = ''): string[] {
    return [...this.owned.keys()].filter((k) => k.startsWith(prefix));
  }

  /** the lamps of the vehicle (every owner's lenses: the lamps are parts like any other) */
  setLights(l: CarLights): void {
    const key = JSON.stringify(l);
    if (key === this.lightsKey) return;
    this.lightsKey = key;
    Object.assign(this.lights, l);
    for (const o of this.owned.values()) o.look.setLights(this.lights);
  }

  /** the frame the dirt is measured in (the vehicle's model space: origin on the ground) */
  setCarFrame(matrixWorld: THREE.Matrix4): void {
    this.frame.copy(matrixWorld);
    this.framed = true;
    for (const o of this.owned.values()) o.look.setCarFrame(matrixWorld);
  }

  /** the frame of one owner and its own (`owner+…`) looks: a thing lying about is its own ground */
  setFrameOf(owner: string, matrixWorld: THREE.Matrix4): void {
    for (const [k, o] of this.owned) if (k === owner || k.startsWith(`${owner}+`)) o.look.setCarFrame(matrixWorld);
  }

  /** light up one owner's meshes and its own (`owner+…`: the tyre on a rim, the turbo on an engine); '' = none */
  highlight(owner: string): void {
    if (owner === this.lit) return;
    const each = (name: string, on: boolean): void => {
      for (const [k, o] of this.owned) if (k === name || k.startsWith(`${name}+`)) o.look.setHighlight(on ? -1 : null);
    };
    if (this.lit) each(this.lit, false);
    this.lit = owner;
    if (owner) each(owner, true);
  }

  /** how many looks and materials (telemetry) */
  get counts(): { looks: number; materials: number } {
    let materials = 0;
    for (const o of this.owned.values()) materials += o.look.materials.length;
    return { looks: this.owned.size, materials };
  }

  dispose(): void {
    for (const o of this.owned.values()) o.look.dispose();
    this.owned.clear();
  }
}

/**
 * Swap every mesh material of a model for the look's, by the GLB names (kept in userData.mat, so the
 * same model can be given another look later). Opaque meshes cast shadows; glass and lenses are drawn
 * after the rest and let the light through.
 */
export function applyMaterials(root: THREE.Object3D, look: CarLook): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!mesh.userData.mat) {
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mesh.userData.mat = list.map((mt) => mt.name || 'steel');
    }
    const g = mesh.geometry;
    const variant = { ao: g.hasAttribute('color'), vpaint: false, vwear: false, vpart: false };
    const out = (mesh.userData.mat as string[]).map((n) => look.material(carMaterialName(n) ?? 'plastic_int', variant));
    mesh.material = Array.isArray(mesh.material) ? out : out[0];
    const see = out.some((m) => m.transparent);
    mesh.renderOrder = see ? 9 : 0;
    if (see) {
      mesh.layers.disable(LAYER_SHADOW_FAR);
      mesh.layers.disable(LAYER_SHADOW_NEAR);
    } else {
      // the near map (a few metres round the player) takes everything; the far one (~90 m, a texel is
      // ~10 cm) only what is big enough to show there — a bolt-on mirror or a horn would cost a draw
      // call each for less than a texel
      if (!g.boundingSphere) g.computeBoundingSphere();
      const big = (g.boundingSphere?.radius ?? 1) > 0.22;
      mesh.layers.enable(LAYER_SHADOW_NEAR);
      if (big) mesh.layers.enable(LAYER_SHADOW_FAR);
      else mesh.layers.disable(LAYER_SHADOW_FAR);
    }
  });
}

/** the GLB material names a mesh had */
export function matNames(mesh: THREE.Mesh): string[] {
  return (mesh.userData.mat as string[] | undefined) ?? (Array.isArray(mesh.material) ? mesh.material.map((m) => m.name) : [mesh.material.name]);
}
