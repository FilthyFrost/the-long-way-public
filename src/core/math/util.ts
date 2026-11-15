export const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
export const saturate = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number): number => {
  const t = saturate((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const sign = (x: number): number => (x > 0 ? 1 : x < 0 ? -1 : 0);
export const TAU = 6.283185307179586;
export const PI = 3.141592653589793;
export const HALF_PI = 1.5707963267948966;
export const DEG = PI / 180;
