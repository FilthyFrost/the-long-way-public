/**
 * The fish as things (docs/V3/plan/fishing.md): every fish caught is drawn with its own body, made in three.js as the
 * fish in the water are (fishModel.ts: lofted, its skin painted, in the props' cel look with its ink), lying on its
 * left side as a fish lies on the boards — the same model in the hands, on the ground, in the hotbar's picture.
 *
 * A model id is `fish_<id>` (its kind: drawn at a middle length), or `fish_<id>@<variant>.<medal>` for one caught:
 * its colour, and its length by its medal's band of weight (core/v3/fishing/lite/items.ts fishModelOf). Each is made
 * once (assets.ts registerItemModels keeps it); every thing drawn with it is a copy. Its meshes keep their own look
 * (`userData.ownLook`): the vehicles' materials are not put on them and they are never merged with what else lies about.
 * The tail's pivot is named `fish_tail`: the flop on the boards wags it.
 */
import * as THREE from 'three';
import { FISH, FISH_INDEX } from '../../../../core/v3/fishing/lite/fish';
import { MEDAL_AT, type Variant } from '../../../../core/v3/fishing/lite/types';
import { buildFish } from './fishModel';

/** the weight share a fish of each medal is drawn at: the middle of its band (none: under bronze) */
const MEDAL_Q: readonly number[] = [0.2, (MEDAL_AT[1] + MEDAL_AT[2]) / 2, (MEDAL_AT[2] + MEDAL_AT[3]) / 2, (MEDAL_AT[3] + MEDAL_AT[4]) / 2, 0.95];

const ID = /^fish_([a-z0-9_]+?)(?:@(\d)\.(\d))?$/;

/** is this model one of the fish */
export function isFishModel(model: string): boolean {
  return ID.test(model) && FISH_INDEX.has(ID.exec(model)![1]);
}

/** the length (m) a fish's model is drawn at */
export function modelLength(fish: number, medal: number): number {
  const def = FISH[fish];
  const cm = medal < 0 ? Math.sqrt(def.cm[0] * def.cm[1]) : def.cm[1] * Math.cbrt(MEDAL_Q[Math.max(0, Math.min(4, medal))]);
  return cm / 100;
}

/** the bodies made so far, by kind and colour: one of another size is a copy of it, scaled (a body takes ~20 ms to make) */
const BODIES = new Map<string, { group: THREE.Group }>();

/** a fish's own body as fishModel.ts makes it — upright, one unit long, its head at +x — made once and shared: what is kept of it is a copy (bend.ts FishBody makes its own) */
export function rawFish(i: number, variant: Variant): THREE.Group {
  const key = `${FISH[i].id}@${variant}`;
  let made = BODIES.get(key);
  if (!made) {
    const fm = buildFish(FISH[i], variant, 1);
    fm.tail.name = 'fish_tail';
    made = { group: fm.group };
    BODIES.set(key, made);
  }
  return made.group;
}

/** a fish's model, lying on its left side, resting on y = 0, its head along +x; null: no such fish */
export function fishItemModel(model: string): THREE.Group | null {
  const m = ID.exec(model);
  if (!m) return null;
  const i = FISH_INDEX.get(m[1]);
  if (i === undefined) return null;
  const variant = Math.max(0, Math.min(5, Number(m[2] ?? 0))) as Variant;
  const medal = m[3] === undefined ? -1 : Number(m[3]);
  const body = rawFish(i, variant).clone(true);
  // (the model's right side, +z, faces up: turned about its length)
  body.rotation.x = -Math.PI / 2;
  body.scale.setScalar(modelLength(i, medal));
  const root = new THREE.Group();
  root.name = 'PART';
  root.add(body);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  body.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.userData.ownLook = true;
    mesh.castShadow = true;
  });
  return root;
}
