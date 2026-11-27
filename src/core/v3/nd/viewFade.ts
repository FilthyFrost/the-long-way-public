/**
 * Seeing through what is carried, as Nomad Drive does (its view fade, with its asset's numbers): the thing in the hands
 * is drawn alone, into a layer of its own with its own depth — only its nearest faces, nothing of its inside — and that
 * layer is laid over the frame, see-through in an oval window about the mark and whole again outside it, so that the
 * hold still reads. How see-through is the window: by how much of the middle of the view the thing blocks — rays
 * through 29 points of an oval 0.28 of the screen's height round the mark (half as wide again), the middle ones
 * weighing more (a bell, its spread half the radius), each asked whether it meets one of the thing's pieces' boxes
 * within 2.5 m of the eye. From 35% of that blocked it starts to fade, by 65% it is faded fully; it comes in over a
 * quarter of a second and goes in 0.35 s, evenly.
 *
 * Here the faces go nearly all the way (the player's ask, 2026-11-26: only the outermost outline of a fridge carried
 * is left, its inside as see-through as can be, the way ahead clear): Nomad Drive keeps 0.3 of them in the window and
 * all of them outside it; here 0.06 in it and a quarter outside, by as much as the fade has come. The thing's
 * outline — an inked edge and a band of its own colour inside it — stays (render/frame.ts draws both).
 *
 * Pure: no three, no DOM.
 */

export const VIEW_FADE = {
  /** the faces' opacity in the middle of the window, faded fully (Nomad Drive's 0.3: here nearly gone), and outside it (Nomad Drive's 1) */
  minOpacity: 0.06,
  edgeOpacity: 0.25,
  /** the window, in screen heights from the mark: faded fully within the first, as far as it goes outside by the second; half as wide again across */
  inner: 0.12,
  outer: 0.42,
  stretch: 1.4,
  /** seconds from whole to faded fully, and back */
  fadeInS: 0.25,
  fadeOutS: 0.35,
  /** the middle of the view measured: its radius (screen heights; an oval with the window's stretch), the grid's points a side */
  coverageRadius: 0.28,
  grid: 7,
  /** the weighted share of it blocked where the fade starts, and where it is full */
  start: 0.35,
  full: 0.65,
  /** only this near the eye (m) does the thing count as blocking */
  maxDistance: 2.5,
  /** the outline left: its opacity faded fully, its inked edge's and its band's width (px of a frame 1080 high) */
  lineOpacity: 0.95,
  inkPx: 1.4,
  bandPx: 3.2,
} as const;

/** a point of the middle of the view measured: where (screen heights from the mark, across already stretched), how much it weighs */
export interface FadeSample {
  x: number;
  y: number;
  w: number;
}

/**
 * The points measured (Nomad Drive's: a grid of n by n over the oval cut to it — 29 of 49 for seven — weighing by a
 * bell whose spread is half the radius)
 */
export function samplePattern(grid: number = VIEW_FADE.grid, radius: number = VIEW_FADE.coverageRadius, stretch: number = VIEW_FADE.stretch): FadeSample[] {
  const n = Math.max(3, Math.round(grid));
  const r = Math.max(0.01, radius);
  const s = Math.max(0.01, stretch);
  const sigma = r * 0.5;
  const den = 2 * sigma * sigma;
  const out: FadeSample[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const u = (j / (n - 1)) * 2 - 1;
      const v = (i / (n - 1)) * 2 - 1;
      if (u * u + v * v > 1.0001) continue;
      out.push({ x: u * r * s, y: v * r, w: Math.exp(-((u * u + v * v) * r * r) / den) });
    }
  }
  return out;
}

/** the weighted share of the points that meet the thing (0 … 1) */
export function coverageOf(samples: readonly FadeSample[], hit: (s: FadeSample, i: number) => boolean): number {
  let all = 0;
  let got = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    all += s.w;
    if (hit(s, i)) got += s.w;
  }
  return all > 0 ? got / all : 0;
}

/** how far it should be faded for so much of the middle blocked (its own scale on that: a compass is never faded) */
export function targetWeight(coverage: number, scale = 1): number {
  if (!(scale > 0)) return 0;
  const x = Math.min(1, Math.max(0, (coverage * scale - VIEW_FADE.start) / Math.max(1e-4, VIEW_FADE.full - VIEW_FADE.start)));
  return x * x * (3 - 2 * x);
}

/** the fade a frame on: evenly towards what it should be, a quarter of a second to come in, 0.35 s to go */
export function easeWeight(current: number, target: number, dt: number): number {
  const s = target > current ? VIEW_FADE.fadeInS : VIEW_FADE.fadeOutS;
  const step = Math.max(0, dt) / s;
  return target > current ? Math.min(target, current + step) : Math.max(target, current - step);
}

/**
 * The faces' opacity at a point of the frame: `x`, `y` how far from the mark (screen heights), the fade's `weight`
 * (0 … 1). Faded fully: within the window's inner radius the least, outside its outer one `edgeOpacity`; not faded,
 * whole. (Nomad Drive's: edgeOpacity 1, minOpacity 0.3.)
 */
export function windowOpacity(x: number, y: number, weight: number, minOpacity: number = VIEW_FADE.minOpacity, edgeOpacity: number = VIEW_FADE.edgeOpacity): number {
  const r = Math.hypot(x / VIEW_FADE.stretch, y);
  const t = Math.min(1, Math.max(0, (r - VIEW_FADE.inner) / (VIEW_FADE.outer - VIEW_FADE.inner)));
  const faded = edgeOpacity + (minOpacity - edgeOpacity) * (1 - t * t * (3 - 2 * t));
  const w = Math.min(1, Math.max(0, weight));
  return 1 + w * (faded - 1);
}

/** a thing's own scale on what it blocks (Nomad Drive's: the compass and the blueprints are never faded) */
export function viewFadeScale(item: string): number {
  return item === 'nd_compass' || item.startsWith('blueprint') ? 0 : 1;
}

/**
 * Does the segment from `o` along `d` (t 0 … 1) meet the box min … max (a piece's own frame)? Nomad Drive's slab test.
 * o, d, min, max: [x, y, z].
 */
export function segmentHitsBox(o: readonly number[], d: readonly number[], min: readonly number[], max: readonly number[]): boolean {
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 3; i++) {
    const oi = o[i];
    const di = d[i];
    if (Math.abs(di) < 1e-8) {
      if (oi < min[i] || oi > max[i]) return false;
      continue;
    }
    const inv = 1 / di;
    let a = (min[i] - oi) * inv;
    let b = (max[i] - oi) * inv;
    if (a > b) {
      const t = a;
      a = b;
      b = t;
    }
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return false;
  }
  return true;
}
