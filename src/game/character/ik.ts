// Bending her joints toward targets (docs/V3/plan/character-pv.md §5): two-bone IK for an arm or a leg (the middle
// joint bending in a plane given by a pole, never turning inside out), turning a bone in world space, and the
// helpers the animator's layers share. Painted Valley's legIK (src/figure/animator.js) is the model.

import * as THREE from 'three';

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();

export const clamp = THREE.MathUtils.clamp;
export const damp = (a: number, b: number, rate: number, dt: number) => b + (a - b) * Math.exp(-rate * dt);

/** Turns a bone by a world rotation q (about its own joint). */
export function rotateWorldQ(bone: THREE.Object3D, q: THREE.Quaternion): void {
  const parentQ = bone.parent!.getWorldQuaternion(_q2);
  const worldQ = bone.getWorldQuaternion(_q);
  worldQ.premultiply(q);
  bone.quaternion.copy(parentQ.invert().multiply(worldQ));
  bone.updateMatrixWorld(true);
}

export function rotateWorld(bone: THREE.Object3D, axis: THREE.Vector3, angle: number): void {
  rotateWorldQ(bone, new THREE.Quaternion().setFromAxisAngle(axis, angle));
}

/** Sets a bone's world rotation. */
export function setWorldQ(bone: THREE.Object3D, q: THREE.Quaternion): void {
  const parentQ = bone.parent!.getWorldQuaternion(_q2);
  bone.quaternion.copy(parentQ.invert().multiply(q));
  bone.updateMatrixWorld(true);
}

/**
 * Two-bone IK: the end of `lower` (the joint `end`) goes to `target`, the middle joint bending toward `pole` (a world
 * direction from the root's joint). Blended by `w`. Returns how far the target was out of reach (m, 0 if reached).
 */
export function twoBone(upper: THREE.Bone, lower: THREE.Bone, end: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3, w = 1): number {
  if (w <= 0) return 0;
  const A = upper.getWorldPosition(new THREE.Vector3());
  const B = lower.getWorldPosition(new THREE.Vector3());
  const C = end.getWorldPosition(new THREE.Vector3());
  const l1 = A.distanceTo(B), l2 = B.distanceTo(C);
  const T = _v4.copy(C).lerp(target, w);
  const toT = _v1.subVectors(T, A);
  const want = toT.length();
  const d = clamp(want, Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
  const axis = toT.normalize();
  // the bend's plane: the pole made square to the reach
  const p = _v2.copy(pole).addScaledVector(axis, -pole.dot(axis));
  if (p.lengthSq() < 1e-8) p.copy(B).sub(A).addScaledVector(axis, -_v3.copy(B).sub(A).dot(axis));
  p.normalize();
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const newB = A.clone().addScaledVector(axis, l1 * cosA).addScaledVector(p, l1 * Math.sqrt(Math.max(0, 1 - cosA * cosA)));
  const q1 = new THREE.Quaternion().setFromUnitVectors(B.clone().sub(A).normalize(), newB.clone().sub(A).normalize());
  rotateWorldQ(upper, q1);
  const B2 = lower.getWorldPosition(new THREE.Vector3()), C2 = end.getWorldPosition(new THREE.Vector3());
  const goal = A.clone().addScaledVector(axis, d);
  const q2 = new THREE.Quaternion().setFromUnitVectors(C2.sub(B2).normalize(), goal.sub(B2).normalize());
  rotateWorldQ(lower, q2);
  return Math.max(0, want - (l1 + l2));
}

/** Copies the world rotations of a skeleton's bones into an array (to blend poses in world space). */
export function snapshotLocal(bones: THREE.Bone[], out: THREE.Quaternion[]): void {
  for (let i = 0; i < bones.length; i++) (out[i] ??= new THREE.Quaternion()).copy(bones[i].quaternion);
}
