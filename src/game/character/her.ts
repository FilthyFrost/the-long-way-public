// Her, in three.js (docs/V3/plan/character-pv.md §3): the meshes grown by tools/character/build.ts, put on a
// skeleton of three.js bones named and framed as Painted Valley's (so its clips play on her), each mesh skinned
// to it. The body is drawn in the main view; a depth-only twin of it throws her shadow into the game's own shadow
// maps (render/shadow.ts draws those with one plain material that knows nothing of skinning); the two finer arms
// are drawn instead of the body's own in first person.

import * as THREE from 'three';
import { type SkinnedData, unpackSkinned } from '../../core/character/mesh';
import { LAYER_SHADOW_NEAR } from '../render/shadow';
import { hairMaterial, shadowDepthMaterial, skinMaterial } from './material';
import { maskMaterial } from './maskMaterial';
import { helmetMaterial } from './helmetMaterial';

export interface HerRig {
  /** the object to place: her feet at its origin, facing +z */
  root: THREE.Group;
  skeleton: THREE.Skeleton;
  bones: Record<string, THREE.Bone>;
  body: THREE.SkinnedMesh;
  /** her shadow: the body again, depth only, on the shadow layers */
  shadow: THREE.SkinnedMesh;
  arms: { l: THREE.SkinnedMesh; r: THREE.SkinnedMesh };
  hair: THREE.SkinnedMesh;
  hairShadow: THREE.SkinnedMesh;
  /** the mask in place of her face (null in an older build without one) */
  mask: THREE.SkinnedMesh | null;
  /** the full-face helmet she wears in place of a head (null when she has her own head and hair) */
  helmet: THREE.SkinnedMesh | null;
  helmetShadow: THREE.SkinnedMesh | null;
  skin: THREE.ShaderMaterial;
  hairMat: THREE.ShaderMaterial;
  /** her eye point in the head bone's frame */
  eyeLocal: THREE.Vector3;
  /** the bind pose's local rotations, by bone */
  bind: Record<string, THREE.Quaternion>;
  /** her offsets (local positions), by bone: a clip's pelvis track is scaled to these */
  offsets: Record<string, THREE.Vector3>;
  meta: Record<string, unknown>;
  /** everything in the file, for the clothes' views */
  parts: Record<string, unknown>;
}

/** An attribute as packed (core/character/mesh.ts quantize): integers are read normalised where they were scaled so. */
export function attr(a: ArrayLike<number> & ArrayBufferView, size: number, normalized = !(a instanceof Float32Array)): THREE.BufferAttribute {
  return new THREE.BufferAttribute(a as unknown as THREE.TypedArray, size, normalized);
}

function geometryOf(d: SkinnedData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', attr(d.positions, 3));
  g.setAttribute('normal', attr(d.normals, 3));
  g.setAttribute('skinIndex', attr(d.skinIndex, 4, false));
  g.setAttribute('skinWeight', attr(d.skinWeight, 4));
  g.setAttribute('aSkin', attr(d.skin, 4));
  // (finger coordinates in thousandths: scaled back in the shader)
  if (d.finger) g.setAttribute('aFinger', attr(d.finger, 4, false));
  if (d.region) g.setAttribute('aRegion', attr(d.region, 1, false));
  g.setIndex(new THREE.BufferAttribute(d.indices as unknown as THREE.TypedArray, 1));
  g.computeBoundingSphere();
  return g;
}

export async function loadHer(url = '/models/character/her.bin'): Promise<HerRig> {
  const buf = await (await fetch(url)).arrayBuffer();
  return herFrom(buf);
}

export function herFrom(buf: ArrayBuffer): HerRig {
  const { meta, parts } = unpackSkinned(buf);
  const names = meta.bones as string[];
  const parents = meta.parents as number[];
  const t = meta.t as number[][];
  const bindQ = meta.bind as number[][];
  const bones: THREE.Bone[] = names.map((n, i) => {
    const b = new THREE.Bone();
    b.name = n;
    b.position.fromArray(t[i]);
    b.quaternion.fromArray(bindQ[i]);
    return b;
  });
  bones.forEach((b, i) => { if (parents[i] >= 0) bones[parents[i]].add(b); });
  const root = new THREE.Group();
  root.name = 'player:her';
  const boneRoot = bones[parents.indexOf(-1)];
  root.add(boneRoot);
  root.updateMatrixWorld(true);
  // the inverses taken in the bind pose, with her standing at the origin
  const skeleton = new THREE.Skeleton(bones);
  skeleton.calculateInverses();
  const skin = skinMaterial();
  const headIx = names.indexOf('Head');
  (skin.uniforms.uHead.value as THREE.Vector3).copy(bones[headIx].getWorldPosition(new THREE.Vector3()));
  const mk = (d: SkinnedData, name: string, mat: THREE.Material) => {
    const m = new THREE.SkinnedMesh(geometryOf(d), mat);
    m.name = name;
    m.bind(skeleton, new THREE.Matrix4());
    m.frustumCulled = false;
    root.add(m);
    return m;
  };
  const body = mk(parts.body, 'player:body', skin);
  const shadow = mk(parts.body, 'player:shadow', shadowDepthMaterial());
  shadow.layers.set(LAYER_SHADOW_NEAR);
  const armMat = skin.clone();
  armMat.name = 'player:arms';
  const arms = { l: mk(parts.arm_l, 'player:arm_l', armMat), r: mk(parts.arm_r, 'player:arm_r', armMat) };
  arms.l.visible = arms.r.visible = false;
  // the hair: every vertex on the head bone (it swings in its shader); under a helmet there is none (an empty mesh, not drawn)
  const hd = (parts.hair as unknown as { positions: Float32Array; normals: Int8Array; indices: Uint32Array | Uint16Array; hair: Float32Array } | undefined) ??
    { positions: new Float32Array(0), normals: new Int8Array(0), indices: new Uint16Array(0), hair: new Float32Array(0) };
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.BufferAttribute(hd.positions, 3));
  hg.setAttribute('normal', attr(hd.normals, 3));
  hg.setAttribute('aHair', new THREE.BufferAttribute(hd.hair, 4));
  const nv = hd.positions.length / 3;
  const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
  for (let i = 0; i < nv; i++) { si[i * 4] = headIx; sw[i * 4] = 1; }
  hg.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  hg.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  hg.setIndex(new THREE.BufferAttribute(hd.indices as unknown as THREE.TypedArray, 1));
  const hairMat = hairMaterial();
  (hairMat.uniforms.uHead.value as THREE.Vector3).copy(skin.uniforms.uHead.value as THREE.Vector3);
  // (the solid hair's clumps: as many as its edge has teeth, hairSdf.ts HAIR.teeth.count)
  hairMat.uniforms.uClumps.value = 17;
  const hairMesh = new THREE.SkinnedMesh(hg, hairMat);
  hairMesh.name = 'player:hair';
  hairMesh.bind(skeleton, new THREE.Matrix4());
  hairMesh.frustumCulled = false;
  root.add(hairMesh);
  const hairShadow = new THREE.SkinnedMesh(hg, shadowDepthMaterial());
  hairShadow.name = 'player:hair_shadow';
  hairShadow.bind(skeleton, new THREE.Matrix4());
  hairShadow.frustumCulled = false;
  hairShadow.layers.set(LAYER_SHADOW_NEAR);
  root.add(hairShadow);
  if (hd.positions.length === 0) hairMesh.visible = hairShadow.visible = false;
  // the helmet: every vertex on the head bone
  let helmet: THREE.SkinnedMesh | null = null, helmetShadow: THREE.SkinnedMesh | null = null;
  const hm = parts.helmet as unknown as { positions: Float32Array; normals: Int8Array; indices: Uint32Array | Uint16Array; helmet: Float32Array } | undefined;
  if (hm) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(hm.positions, 3));
    g.setAttribute('normal', attr(hm.normals, 3));
    g.setAttribute('aHelmet', new THREE.BufferAttribute(hm.helmet, 4));
    const n = hm.positions.length / 3;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = headIx; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    g.setIndex(new THREE.BufferAttribute(hm.indices as unknown as THREE.TypedArray, 1));
    helmet = new THREE.SkinnedMesh(g, helmetMaterial());
    helmet.name = 'player:helmet';
    helmet.bind(skeleton, new THREE.Matrix4());
    helmet.frustumCulled = false;
    root.add(helmet);
    helmetShadow = new THREE.SkinnedMesh(g, shadowDepthMaterial());
    helmetShadow.name = 'player:helmet_shadow';
    helmetShadow.bind(skeleton, new THREE.Matrix4());
    helmetShadow.frustumCulled = false;
    helmetShadow.layers.set(LAYER_SHADOW_NEAR);
    root.add(helmetShadow);
  }
  // the mask: every vertex on the head bone
  let mask: THREE.SkinnedMesh | null = null;
  const md = parts.mask as unknown as { positions: Float32Array; normals: Int8Array; indices: Uint32Array | Uint16Array; mask: Float32Array } | undefined;
  if (md) {
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(md.positions, 3));
    mg.setAttribute('normal', attr(md.normals, 3));
    mg.setAttribute('aMask', new THREE.BufferAttribute(md.mask, 2));
    const mn = md.positions.length / 3;
    const msi = new Uint16Array(mn * 4), msw = new Float32Array(mn * 4);
    for (let i = 0; i < mn; i++) { msi[i * 4] = headIx; msw[i * 4] = 1; }
    mg.setAttribute('skinIndex', new THREE.BufferAttribute(msi, 4));
    mg.setAttribute('skinWeight', new THREE.BufferAttribute(msw, 4));
    mg.setIndex(new THREE.BufferAttribute(md.indices as unknown as THREE.TypedArray, 1));
    mask = new THREE.SkinnedMesh(mg, maskMaterial());
    mask.name = 'player:mask';
    mask.bind(skeleton, new THREE.Matrix4());
    mask.frustumCulled = false;
    root.add(mask);
  }
  const byName: Record<string, THREE.Bone> = {};
  const bind: Record<string, THREE.Quaternion> = {};
  const offsets: Record<string, THREE.Vector3> = {};
  for (const b of bones) {
    byName[b.name] = b;
    bind[b.name] = b.quaternion.clone();
    offsets[b.name] = b.position.clone();
  }
  const eyeLocal = new THREE.Vector3().fromArray(meta.eyeLocal as number[]);
  return { root, skeleton, bones: byName, body, shadow, arms, hair: hairMesh, hairShadow, mask, helmet, helmetShadow, skin, hairMat, eyeLocal, bind, offsets, meta, parts: parts as unknown as Record<string, unknown> };
}

/** Puts every bone back in the pose she was modelled in. */
export function toBindPose(rig: HerRig): void {
  for (const [n, b] of Object.entries(rig.bones)) b.quaternion.copy(rig.bind[n]);
}
