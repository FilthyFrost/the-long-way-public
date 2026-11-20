/**
 * Uniform arrays of vec3 and vec4 held flat. three.js hands a flat array to the GPU as it is, but copies an array
 * of vectors out element by element into a scratch array every time a material that reads it is set up for a draw
 * (WebGLUniforms flatten): with the palettes and the room's light in nearly every material, some 0.7 ms of every
 * frame went on it (docs/V3/nodes/P3-terrain-batch.md). What the GPU is given is the same either way.
 */
export const vec3s = (n: number): Float32Array => new Float32Array(n * 3);
export const vec4s = (n: number): Float32Array => new Float32Array(n * 4);

/** element i of a flat vec3 array set to (x, y, z) */
export function put3(a: Float32Array, i: number, x: number, y: number, z: number): void {
  const o = i * 3;
  a[o] = x;
  a[o + 1] = y;
  a[o + 2] = z;
}

/** element i of a flat vec4 array set to (x, y, z, w) */
export function put4(a: Float32Array, i: number, x: number, y: number, z: number, w: number): void {
  const o = i * 4;
  a[o] = x;
  a[o + 1] = y;
  a[o + 2] = z;
  a[o + 3] = w;
}
