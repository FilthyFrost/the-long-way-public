/**
 * The motorcycle rack (docs/V3/plan/growth.md §六 2, J9e): a part in the hitch's place under the rear bumper — a tray
 * across the back the Swallow stands in — and where on each frame the motorcycle stands on it (data/moto_racks.json:
 * further back where the body stands out behind its bumper). Frame model space. Pure data.
 */
import table from './data/moto_racks.json';
import type { V3 } from './types';

/** the part */
export const MOTO_RACK = 'moto_rack';

/** the frames whose rack is made in a shape of their own (a longer bar back to the tray: parts/moto_rack@<frame>) */
export const MOTO_RACK_SHAPES: ReadonlySet<string> = new Set(Object.keys(table.frames));

/** where the motorcycle stands on a frame's rack (its model origin, the middle under its wheels), from the hitch mount */
export function motoTray(frameId: string): V3 {
  const x = (table.frames as Record<string, number>)[frameId] ?? table.tray[0];
  return { x, y: table.tray[1], z: 0 };
}
