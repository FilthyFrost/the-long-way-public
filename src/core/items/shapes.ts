/**
 * How big each painted stand-in is (m): half extents along, up (full height), across. The views
 * draw them at this size, the pick aims at their middle, and putting one down needs this much room.
 */
import { item, type ItemShape } from './catalog';

export interface ShapeSize {
  /** half length, height, half width */
  hx: number;
  h: number;
  hz: number;
}

export const SHAPE_SIZE: Readonly<Record<ItemShape, ShapeSize>> = {
  can: { hx: 0.04, h: 0.11, hz: 0.04 },
  jar: { hx: 0.045, h: 0.12, hz: 0.045 },
  bottle: { hx: 0.04, h: 0.26, hz: 0.04 },
  carton: { hx: 0.09, h: 0.06, hz: 0.06 },
  sack: { hx: 0.14, h: 0.2, hz: 0.1 },
  bundle: { hx: 0.3, h: 0.12, hz: 0.1 },
  coil: { hx: 0.12, h: 0.06, hz: 0.12 },
  roll: { hx: 0.1, h: 0.12, hz: 0.06 },
  jerrycan: { hx: 0.17, h: 0.44, hz: 0.08 },
  drum: { hx: 0.24, h: 0.62, hz: 0.24 },
  tyre: { hx: 0.33, h: 0.2, hz: 0.33 },
  battery: { hx: 0.14, h: 0.2, hz: 0.09 },
  machine: { hx: 0.24, h: 0.34, hz: 0.18 },
  tool: { hx: 0.13, h: 0.03, hz: 0.03 },
  case: { hx: 0.1, h: 0.06, hz: 0.07 },
  book: { hx: 0.1, h: 0.03, hz: 0.075 },
  tape: { hx: 0.05, h: 0.012, hz: 0.032 },
  paper: { hx: 0.1, h: 0.006, hz: 0.07 },
  fish: { hx: 0.15, h: 0.06, hz: 0.04 },
  bunch: { hx: 0.09, h: 0.07, hz: 0.06 },
  cap: { hx: 0.05, h: 0.08, hz: 0.05 },
  berry: { hx: 0.06, h: 0.05, hz: 0.06 },
  egg: { hx: 0.05, h: 0.04, hz: 0.05 },
  cut: { hx: 0.1, h: 0.05, hz: 0.07 },
  pelt: { hx: 0.25, h: 0.12, hz: 0.14 },
  tuber: { hx: 0.05, h: 0.05, hz: 0.04 },
};

/** a medium thing is drawn a little bigger than its shape if it is a whole animal or a big fish (pelt, fish) */
export function sizeOf(id: string): ShapeSize {
  const d = item(id);
  const s = SHAPE_SIZE[d.shape];
  if (d.size === 'small') return s;
  // bigger kinds of a small shape (a whole duck, a pike) are drawn bigger
  const k = d.size === 'large' && (d.shape === 'pelt' || d.shape === 'fish' || d.shape === 'roll') ? 3 : d.size === 'medium' && (d.shape === 'pelt' || d.shape === 'fish' || d.shape === 'case' || d.shape === 'machine' || d.shape === 'coil') ? 1.7 : 1;
  return k === 1 ? s : { hx: s.hx * k, h: s.h * k, hz: s.hz * k };
}

/** the radius the pick sees it with: generous for small things (they are hard to aim at) */
export function pickRadius(id: string): number {
  const s = sizeOf(id);
  return Math.max(0.12, Math.min(0.5, Math.max(s.hx, s.hz, s.h * 0.5) * 1.1));
}
