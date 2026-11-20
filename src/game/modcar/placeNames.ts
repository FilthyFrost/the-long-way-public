/**
 * The name of a scenic stretch on the screen as one drives into it (docs/V3/nodes/P3-1-journey-world.md; approval A,
 * docs/V3/research/scenic-50.md §8: two or three characters, and a line under them — 北烛原 · 极光冻原).
 *
 * Named each time the traveller comes into a scene other than the one last named, and once when a session begins
 * inside one (after a moment: the world comes in first). A scene named within the last minute is not named again:
 * driving back and forth over its border names it once. Home and the quiet stretches between two scenes have no
 * name of their own.
 *
 * Pure: the journey, where along the road the traveller is, and the clock. DOM-free.
 */
import type { JourneyRoad } from '../../core/world/journey/road';
import type { SceneCard } from '../../core/world/journey/scenes';

/** a session's first naming waits this long (s) */
const FIRST_WAIT = 2.5;
/** a scene named within this long (s) is not named again */
const AGAIN_AFTER = 60;

export class PlaceNames {
  /** the journey's index of the scene last named, and when each was (the clock's seconds) */
  private named = Number.NaN;
  private readonly when = new Map<number, number>();
  private wait = FIRST_WAIT;

  /** the scene to name now, if one is to be (`s`: how far along the road the traveller is, m; `now`: the clock, s) */
  update(journey: JourneyRoad | null, s: number, now: number, dt: number): SceneCard | null {
    if (!journey || !Number.isFinite(s)) return null;
    if (this.wait > 0) {
      this.wait -= dt;
      return null;
    }
    const piece = journey.pieceAt(s);
    if (piece.kind !== 'scene' || !piece.scene || piece.index === this.named) return null;
    this.named = piece.index;
    const last = this.when.get(piece.index);
    this.when.set(piece.index, now);
    if (last !== undefined && now - last < AGAIN_AFTER) return null;
    return piece.scene;
  }
}
