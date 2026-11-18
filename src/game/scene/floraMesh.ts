/**
 * One draw of flora as a mesh (scene/floraScatter.ts gathers its plants; render/floraMaterial.ts draws them).
 * The mesh has no vertices of its own: its vertices are in the plants' atlas, and what it carries for
 * positions only says how many of them to draw for each plant. Everything else is per instance.
 */
import * as THREE from 'three';
import { LAYER_SHADOW_FLORA } from '../render/shadow';
import type { FloraBatch } from './floraScatter';

/**
 * @param span the side of the square the plants stand in, from the mesh's origin (m): what the mesh is culled by
 */
export function floraMesh(b: FloraBatch, material: THREE.Material, span: number): THREE.Mesh {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Uint8Array(b.verts), 1));
  geo.setAttribute('aPlace', new THREE.InstancedBufferAttribute(b.place, 4));
  geo.setAttribute('aShape', new THREE.InstancedBufferAttribute(b.shape, 4));
  geo.setAttribute('aLook', new THREE.InstancedBufferAttribute(b.look, 4));
  geo.setAttribute('aLie', new THREE.InstancedBufferAttribute(b.lie, 4));
  geo.instanceCount = b.count;
  const mid = (b.minY + b.maxY) / 2;
  // (plants reach over the square's edge by their crowns: a quarter of its side to spare)
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(span / 2, mid, span / 2), Math.hypot(span * 0.75, (b.maxY - b.minY) / 2));
  return new THREE.Mesh(geo, material);
}

/** have a mesh of flora throw its shadow (into the wide shadow map: render/shadow.ts); `only`: and be drawn nowhere else */
export function floraShadows(mesh: THREE.Object3D, only = false): void {
  if (only) mesh.layers.set(LAYER_SHADOW_FLORA);
  else mesh.layers.enable(LAYER_SHADOW_FLORA);
}
