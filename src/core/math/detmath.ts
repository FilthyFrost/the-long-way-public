/**
 * Deterministic trigonometry built from + − × ÷ and Math.floor only.
 * Math.sin/cos may differ in the last bits between JS engines; world generation that
 * every player must agree on (road spine, placement) uses these instead.
 */
import { HALF_PI, PI, TAU } from './util';

export function dsin(x: number): number {
  const k = Math.floor((x + PI) / TAU);
  let r = x - k * TAU; // [-PI, PI)
  if (r > HALF_PI) r = PI - r;
  else if (r < -HALF_PI) r = -PI - r;
  const r2 = r * r;
  return (
    r *
    (1 +
      r2 *
        (-1 / 6 +
          r2 *
            (1 / 120 +
              r2 * (-1 / 5040 + r2 * (1 / 362880 + r2 * (-1 / 39916800 + r2 * (1 / 6227020800 + r2 * (-1 / 1307674368000))))))))
  );
}

export function dcos(x: number): number {
  return dsin(x + HALF_PI);
}
