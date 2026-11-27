/**
 * Physical 12-inch vinyl records (Playtest Round 2 #28):
 * All 51 songs from the archive stations (derived 1-to-1 from core/v3/nd/tapes.ts TAPES) are pressed onto
 * individual physical vinyl records (nd_vinyl_01 .. nd_vinyl_51). The portable turntable (junk_record) requires a
 * physical vinyl placed onto its platter before playing that exact track.
 * Pure: no three, no DOM.
 */
import { STATION_GENRES, TAPES, type Tape } from './tapes';

export interface Vinyl {
  /** catalogue item id: nd_vinyl_01 .. nd_vinyl_51 */
  readonly id: string;
  /** Chinese track title */
  readonly title: string;
  /** station index (0..4) and genre label */
  readonly station: number;
  readonly genre: string;
  /** exact archive song name in cueSpec.ts */
  readonly song: string;
  /** center label colour (paint) and inner accent ring colour (paint2) */
  readonly label: number;
  readonly accent: number;
  /** procedural fallback when the local archive is absent */
  readonly synth: Tape['synth'];
}

export const VINYLS: readonly Vinyl[] = TAPES.map((t, i): Vinyl => ({
  id: `nd_vinyl_${String(i + 1).padStart(2, '0')}`,
  title: t.title,
  station: t.station,
  genre: STATION_GENRES[t.station] ?? '金曲',
  song: t.song,
  label: t.label,
  accent: t.shell,
  synth: t.synth,
}));

const BY_ID = new Map(VINYLS.map((v) => [v.id, v]));

/** look up a physical vinyl by its item id (null if not a vinyl record) */
export function vinylOf(id: string): Vinyl | null {
  return BY_ID.get(id) ?? null;
}

/** shuffled world order across all 51 vinyl records */
export function vinylDeck(worldSeed: number): string[] {
  const ids = VINYLS.map((v) => v.id);
  let s = (worldSeed ^ 0x5c3b1) >>> 0 || 1;
  for (let i = ids.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    const j = s % (i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}
