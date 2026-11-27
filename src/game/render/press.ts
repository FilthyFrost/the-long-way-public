/**
 * What presses the plants on the ground out of sight: the vehicles near the eye (ModGame.pressGrass), each a rectangle
 * on the plan — the meadow's blades (meadowMaterial.ts) and the plants of the flora (floraMaterial.ts: tufts, flowers,
 * shrubs) rooted under a vehicle's body do not come up through it (the player, 2026-11-26: on a lawn the grass stood up
 * through the car). Only what is rooted below the body's floor: a plant in a pot inside a camper is not pressed.
 */
import * as THREE from 'three';

/** how many rectangles press the plants at once */
export const PRESSED = 6;

export const pressUniforms = {
  /** each rectangle's middle (render space x, z) and half its length and width (0: none) */
  uPressA: { value: Array.from({ length: PRESSED }, () => new THREE.Vector4()) },
  /** which way its length lies (cos, sin) */
  uPressB: { value: Array.from({ length: PRESSED }, () => new THREE.Vector2(1, 0)) },
  /** the height (render space y) a root must be under to be pressed: the body's floor, near enough */
  uPressH: { value: new Array<number>(PRESSED).fill(-1e9) },
};

/** GLSL: the uniforms, and rtPressed — a plant rooted at p (render space) under a vehicle, below its floor */
export const GLSL_PRESS = /* glsl */ `
  uniform vec4 uPressA[${PRESSED}];
  uniform vec2 uPressB[${PRESSED}];
  uniform float uPressH[${PRESSED}];
  bool rtPressed(vec3 p) {
    for (int i = 0; i < ${PRESSED}; i++) {
      vec4 pa = uPressA[i];
      if (pa.z <= 0.0 || p.y > uPressH[i]) continue;
      vec2 pd = p.xz - pa.xy;
      vec2 pl = vec2(pd.x * uPressB[i].x + pd.y * uPressB[i].y, pd.y * uPressB[i].x - pd.x * uPressB[i].y);
      if (abs(pl.x) < pa.z && abs(pl.y) < pa.w) return true;
    }
    return false;
  }
`;
