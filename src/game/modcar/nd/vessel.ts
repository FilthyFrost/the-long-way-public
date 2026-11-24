/**
 * What the ND water things share in the game (docs/ND/PLAN.md, ND2; the rules: core/v3/nd/water.ts): the vessel in
 * the hands or lying about as the rules see it, what each liquid looks like and is called, and a vessel's openings
 * in its model's frame (where it pours from, where things go in, its bottom).
 */
import * as THREE from 'three';
import type { DrinkLiquid } from '../../../core/modcar/items';
import { itemVessel, toolVessel, type Vessel } from '../../../core/v3/nd/water';
import type { Loose } from '../loose';
import type { Held } from '../player';

/** the vessel in the hands, null: none (a view of it: what is poured changes it) */
export function heldVessel(h: Held | null | undefined): Vessel | null {
  if (!h) return null;
  if (h.kind === 'item') return itemVessel(h.item);
  if (h.kind === 'tool') return toolVessel(h.tool);
  return null;
}

/** the vessel a thing lying about is, null: none */
export function looseVessel(l: Loose): Vessel | null {
  if (l.item) return itemVessel(l.item);
  if (l.tool) return toolVessel(l.tool);
  return null;
}

/** what each liquid is called, and its colour in a vessel (sRGB) */
export const LIQUID: Record<DrinkLiquid, { zh: string; hex: number }> = {
  water: { zh: '水', hex: 0x5f9fbe },
  alcohol: { zh: '啤酒', hex: 0xc9902f },
  energy: { zh: '能量饮料', hex: 0x86c241 },
  coffee: { zh: '咖啡', hex: 0x5a3a24 },
  milk: { zh: '牛奶', hex: 0xf3efe6 },
};

/** a vessel's openings (its model's frame, the game's: x forward, y up): where it pours from, where things go in, its inside's bottom and radius there and at the top */
export interface Openings {
  spout: THREE.Vector3;
  mouth: THREE.Vector3;
  bottom: number;
  rBottom: number;
  rTop: number;
  /** how far its mouth's middle may stand forward of a stream falling into it (m: a bucket's wide, a can's neck none) */
  catchOff: number;
  /** drawn with its level showing (an open top) */
  open: boolean;
}

const OPEN: Record<string, Openings> = {
  nd_bucket: { spout: new THREE.Vector3(0.136, 0.27, 0), mouth: new THREE.Vector3(0, 0.266, 0), bottom: 0.014, rBottom: 0.1, rTop: 0.135, catchOff: 0.1, open: true },
  nd_water_can: { spout: new THREE.Vector3(0.135, 0.465, 0), mouth: new THREE.Vector3(0.135, 0.465, 0), bottom: 0.02, rBottom: 0, rTop: 0, catchOff: 0, open: false },
  nd_mug: { spout: new THREE.Vector3(0.04, 0.092, 0), mouth: new THREE.Vector3(0, 0.084, 0), bottom: 0.008, rBottom: 0.039, rTop: 0.04, catchOff: 0.005, open: true },
  drink_water: { spout: new THREE.Vector3(0, 0.34, 0), mouth: new THREE.Vector3(0, 0.34, 0), bottom: 0.01, rBottom: 0, rTop: 0, catchOff: 0, open: false },
  ing_milk: { spout: new THREE.Vector3(0.026, 0.214, 0), mouth: new THREE.Vector3(0.026, 0.214, 0), bottom: 0.01, rBottom: 0, rTop: 0, catchOff: 0, open: false },
  'tool:bottle': { spout: new THREE.Vector3(0, 0.37, 0), mouth: new THREE.Vector3(0, 0.37, 0), bottom: 0.01, rBottom: 0, rTop: 0, catchOff: 0, open: false },
};
const NONE: Openings = { spout: new THREE.Vector3(0, 0.2, 0), mouth: new THREE.Vector3(0, 0.2, 0), bottom: 0, rBottom: 0, rTop: 0, catchOff: 0, open: false };

/** the openings of the vessel a held thing or a thing lying about is */
export function openingsOf(h: Held | Loose | null | undefined): Openings {
  if (!h) return NONE;
  const tool = 'kind' in h ? (h.kind === 'tool' ? h.tool : null) : h.tool;
  const item = 'kind' in h ? (h.kind === 'item' ? h.item : null) : h.item;
  if (tool) return OPEN[`tool:${tool.kind}`] ?? NONE;
  return (item && OPEN[item.item]) ?? NONE;
}
