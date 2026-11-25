// The clips she moves by (docs/V3/plan/character-pv.md §5): Painted Valley's, CC0 — the Universal Animation
// Library's walks, jogs, strafes, turns and jumps by Quaternius, and Patch's runs, sprints, starts and stops — played
// on her skeleton, which has his joints' frames. A rotation is the same on her; a position is not: the pelvis's
// height and sway are scaled to her legs, and every other bone keeps her own lengths. The root's travel is taken out
// (as Painted Valley's man.js does) and kept as each clip's speed, so the game moves her and plays a clip at the rate
// her real speed asks for.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { HerRig } from './her';

export interface Motion {
  /** metres a second over the ground (scaled to her), in her own frame +z forward */
  speed: number;
  velocity: THREE.Vector3;
  /** a turn in place: radians over the clip */
  yaw: number;
  duration: number;
}

export interface ClipSet {
  clips: Record<string, THREE.AnimationClip>;
  motion: Record<string, Motion>;
  /** her legs against his: what his strides are multiplied by */
  scale: number;
}

/** Painted Valley's pelvis offset (root frame) in his rest pose. */
const PV_PELVIS = new THREE.Vector3(0, 0.0537, 0.9829);

export async function loadClips(rig: HerRig, url = '/models/character/pv-clips.glb'): Promise<ClipSet> {
  const gltf = await new GLTFLoader().loadAsync(url);
  return retarget(rig, gltf.animations);
}

export function retarget(rig: HerRig, animations: THREE.AnimationClip[]): ClipSet {
  const ours = rig.offsets.pelvis;
  const scale = ours.length() / PV_PELVIS.length();
  const out: ClipSet = { clips: {}, motion: {}, scale };
  for (const clip of animations) {
    const motion: Motion = { speed: 0, velocity: new THREE.Vector3(), yaw: 0, duration: clip.duration };
    const tracks: THREE.KeyframeTrack[] = [];
    for (const tr of clip.tracks) {
      const [node, prop] = tr.name.split('.');
      if (node === 'root') {
        if (prop === 'position') {
          const v = tr.values, n = v.length;
          // root's parent is the armature (glTF y up): its travel is in her frame
          motion.velocity.set(v[n - 3] - v[0], 0, v[n - 1] - v[2]).multiplyScalar(scale / (clip.duration || 1));
          motion.speed = motion.velocity.length();
        } else if (prop === 'quaternion') {
          const v = tr.values, n = v.length;
          const q0 = new THREE.Quaternion().fromArray(v, 0), q1 = new THREE.Quaternion().fromArray(v, n - 4);
          const d = q1.multiply(q0.invert());
          motion.yaw = 2 * Math.atan2(d.y, d.w);
        }
        continue;
      }
      if (prop === 'scale') continue;
      if (prop === 'position') {
        if (node !== 'pelvis') continue;
        // his pelvis about its rest, scaled to her legs, about her rest
        const v = tr.values.slice();
        for (let i = 0; i < v.length; i += 3) {
          v[i] = ours.x + (v[i] - PV_PELVIS.x) * scale;
          v[i + 1] = ours.y + (v[i + 1] - PV_PELVIS.y) * scale;
          v[i + 2] = ours.z + (v[i + 2] - PV_PELVIS.z) * scale;
        }
        tracks.push(new THREE.VectorKeyframeTrack(tr.name, Array.from(tr.times), Array.from(v)));
        continue;
      }
      if (!rig.bones[node]) continue;
      tracks.push(tr);
    }
    out.clips[clip.name] = new THREE.AnimationClip(clip.name, clip.duration, tracks);
    out.motion[clip.name] = motion;
  }
  return out;
}
