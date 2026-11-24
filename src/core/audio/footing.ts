/**
 * What the feet fall on, for the footsteps' sounds (docs/V3/nodes/M4-audio.md, core/audio/cueSpec.ts `step:*`):
 * a motorhome's carpet, the workshop's concrete, a house's boards, a filling station's or a shop's tiled slab, a
 * jetty's or a lookout's planks; else the land under them by its surface (core/world/ground.ts): a road is hard
 * underfoot, gravel crunches, snow squeaks, grass and sand and earth are soft.
 */
import { Surface, type SurfaceId } from '../world/ground';

export type Footing = 'dirt' | 'gravel' | 'snow' | 'carpet' | 'wood' | 'concrete' | 'metal';

export interface FootingAt {
  /** walking about inside a vehicle's living space */
  aboard: boolean;
  /** inside the workshop (its slab) */
  workshop: boolean;
  /** the solid the feet stand on (FootWalker.floorTag: `<site id>:<object kind>`, `garage`, …; '' on the land) */
  floorTag: string;
  /** the kind of the place that floor belongs to (sites.ts SITE_KINDS), if it is a place's */
  siteKind: string | null;
  /** the land's surface under the feet */
  surface: SurfaceId;
}

/** the places whose buildings have a hard floor (a slab, tiles): the rest are boarded */
const HARD_FLOORS: ReadonlySet<string> = new Set(['station', 'shop', 'garage', 'works']);

export function footingOf(f: FootingAt): Footing {
  if (f.aboard) return 'carpet';
  if (f.workshop) return 'concrete';
  const tag = f.floorTag;
  if (tag) {
    // (a vehicle's own roof, stood on from its ladder: its spec's id — docs/V3/plan/growth.md §六 2, J9e)
    if (tag.startsWith('modcar:')) return 'metal';
    const kind = tag.slice(tag.lastIndexOf(':') + 1);
    if (kind === 'jetty' || kind === 'stand' || kind === 'porch') return 'wood';
    if (kind === 'lift' || kind === 'trailer' || kind === 'tank') return 'metal';
    if (kind === 'building') return f.siteKind && HARD_FLOORS.has(f.siteKind) ? 'concrete' : 'wood';
    if (tag === 'garage' || tag.startsWith('garage')) return 'concrete';
    return 'wood';
  }
  switch (f.surface) {
    case Surface.Asphalt:
    case Surface.Ice:
      return 'concrete';
    case Surface.Gravel:
      return 'gravel';
    case Surface.Snow:
      return 'snow';
    default:
      return 'dirt';
  }
}

/** how loud a footfall is on it, besides its recordings' own level (soft ground is quiet, a sprint is louder) */
export function footfallGain(on: Footing, speed: number, run: boolean): number {
  const soft = on === 'dirt' ? 0.8 : on === 'carpet' ? 0.75 : 1;
  const pace = Math.min(1.25, 0.55 + 0.3 * speed);
  return soft * pace * (run ? 1.15 : 1);
}
