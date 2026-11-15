/**
 * Shape helpers for closed bodies (van, off-roader): rounded rectangles for windows and doors,
 * wheel-arch arcs, round vertical corners, painted bands, and the cross-section of a roof whose
 * edges turn down into the walls. The motorhome (rv.ts) has its own copies of these and is left as
 * it was, so its picture cannot change.
 *
 * Coordinates are the body frame: +x forward, +y up, +z right. Outlines are [u, v] pairs in the
 * plane the builder's `prism` names.
 */
import type { ModelBuilder, Outline } from './builder';

/** a window or a panel on a side: x0…x1 along the body, h0…h1 above the ground */
export interface Win {
  x0: number;
  x1: number;
  h0: number;
  h1: number;
}

/** a rectangle with its corners cut by two short facets (u0…u1, v0…v1) */
export function roundRect(u0: number, u1: number, v0: number, v1: number, r: number): Outline {
  const k = r * 0.29;
  return [
    [u0 + r, v0], [u1 - r, v0], [u1 - k, v0 + k], [u1, v0 + r],
    [u1, v1 - r], [u1 - k, v1 - k], [u1 - r, v1],
    [u0 + r, v1], [u0 + k, v1 - k], [u0, v1 - r],
    [u0, v0 + r], [u0 + k, v0 + k],
  ];
}

/** the same window grown by d on every side */
export function grow(w: Win, d: number): Win {
  return { x0: w.x0 - d, x1: w.x1 + d, h0: w.h0 - d, h1: w.h1 + d };
}

/** points over a wheel arch, back to front: centre x, radius, centre height (body y) */
export function archPts(xa: number, r: number, yc: number, n = 8): Outline {
  const pts: Outline = [];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI - (i / n) * Math.PI;
    pts.push([xa + Math.cos(a) * r, yc + Math.sin(a) * r]);
  }
  return pts;
}

/**
 * Points round a vertical corner, centre (cx, cz) and radius r, from the side wall (α = 0) to the
 * end face (90°), as [x, z]; fx = +1 front / −1 back, s = +1 right / −1 left.
 */
export function cornerArc(cx: number, cz: number, r: number, fx: number, s: number, n = 3): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * (Math.PI / 2);
    pts.push([cx + fx * r * Math.sin(a), s * (cz + r * Math.cos(a))]);
  }
  return pts;
}

/** a solid round corner between two heights (body y), as hull points */
export function cornerSolid(arc: [number, number][], y0: number, y1: number): number[][] {
  return arc.flatMap(([x, z]) => [[x, y0, z], [x, y1, z]]);
}

/**
 * A painted band on a side wall between two height functions (body y of x), from x0 to x1, as a
 * thin prism standing `lift` off the wall at z = side·W.
 */
export function band(b: ModelBuilder, x0: number, x1: number, lo: (x: number) => number, hi: (x: number) => number, z0: number, side: number, color: number, lift = 0.004, step = 0.1): void {
  const n = Math.max(2, Math.ceil((x1 - x0) / step));
  const o: Outline = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    o.push([x, lo(x)]);
  }
  for (let i = n; i >= 0; i--) {
    const x = x0 + ((x1 - x0) * i) / n;
    o.push([x, hi(x)]);
  }
  b.prism('xy', o, [], z0, z0 + side * lift, color);
}

/**
 * The cross-section of a roof, left to right as [z, y]: up the shoulder in three facets from the wall
 * top (half width W at height `sh`), across the flat top (half width `flat` at height `top`), and
 * down again. Heights are body y.
 */
export function roofSection(W: number, top: number, sh: number, flat: number): number[][] {
  const d = top - sh;
  const k = W - flat;
  const half: number[][] = [[W, sh], [W - 0.12 * k, sh + 0.5 * d], [W - 0.45 * k, sh + 0.86 * d]];
  return [...half.map(([z, y]) => [-z, y]), [-flat, top], [flat, top], ...[...half].reverse()];
}

/** a section placed at x: [x, y, z] points */
export function at(x: number, sec: number[][]): number[][] {
  return sec.map(([z, y]) => [x, y, z]);
}

/** a box with bevelled top edges, as hull points */
export function cushionPts(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, bev: number): number[][] {
  return [
    [x0, y0, z0], [x1, y0, z0], [x0, y0, z1], [x1, y0, z1],
    [x0 + bev, y1, z0 + bev], [x1 - bev, y1, z0 + bev], [x0 + bev, y1, z1 - bev], [x1 - bev, y1, z1 - bev],
    [x0, y1 - bev, z0], [x1, y1 - bev, z0], [x0, y1 - bev, z1], [x1, y1 - bev, z1],
  ];
}

export function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}
