/**
 * The sound archive's catalogue read into the game's cues (docs/V3/nodes/M4-audio.md): which recordings each cue
 * (cueSpec.ts) is, where they lie in the archive, how long they are. Made by the dev server from the catalogue
 * (vite.config.ts audioArchive) and handed to the game as one table; pure, so the tests read the real catalogue
 * the same way.
 */
import { CUE_SPEC, STATIONS, type CuePick, type StationSpec } from './cueSpec';

/** one recording as the archive's catalogue lists it (全部可用音频.json; the fields the game reads) */
export interface CatalogEntry {
  kind: string;
  game: string;
  name: string;
  /** where it lies, under the archive's folder, by the game's own name ("Arctic Drive/…") */
  file: string;
  duration_seconds?: number;
  sha256?: string;
}

export interface CueFile {
  /** where it lies under the archive's folder, as it is on the disk (A_lib/…, L_lib/…) */
  file: string;
  /** seconds */
  dur: number;
}

export interface StationTable {
  name: string;
  en: string;
  songs: Array<CueFile & { title: string }>;
}

export interface CueTable {
  cues: Record<string, CueFile[]>;
  stations: StationTable[];
  /** optional pre-measured loudness per file (bundled public/audio-archive/__cues.json) */
  loud?: Record<string, { rms: number; max: number; dur: number }>;
}

/** the folders the archive keeps each game's recordings in, as the catalogue names the games */
const FOLDER: Readonly<Record<string, string>> = { 'Arctic Drive': 'A_lib', 'Long Drive North': 'L_lib' };
const LIB: Readonly<Record<string, 'A' | 'L'>> = { 'Arctic Drive': 'A', 'Long Drive North': 'L' };

/** a recording's place on the disk from the catalogue's (its first folder the game's own: A_lib, L_lib) */
export function diskPath(file: string): string {
  const parts = file.replace(/\\/g, '/').split('/');
  const top = FOLDER[parts[0]];
  if (top) parts[0] = top;
  return parts.join('/');
}

/** a recording's name as the cues match it: the last part of the catalogue's, without its extension */
export function baseName(name: string): string {
  const last = name.replace(/\\/g, '/').split('/').pop() ?? name;
  return last.replace(/\.(wav|ogg|mp3|flac)$/i, '');
}

/** the recordings a list of picks finds, in the order of the picks (and the catalogue's within each), once each; `one`: only the first each pick finds (a song listed twice, under two of the catalogue's headings) */
function find(entries: readonly CatalogEntry[], picks: readonly CuePick[], one = false, seen = new Set<string>()): Array<CueFile & { title: string }> {
  const out: Array<CueFile & { title: string }> = [];
  for (const p of picks) {
    const re = new RegExp(`^(?:${p.name})$`);
    const fe = p.file ? new RegExp(`^(?:${p.file})$`) : null;
    const hits = entries
      .filter((e) => e.kind === 'source' && LIB[e.game] === p.lib && re.test(baseName(e.name)) && (!fe || fe.test(baseName(e.file))))
      .sort((a, b) => (baseName(a.name) < baseName(b.name) ? -1 : baseName(a.name) > baseName(b.name) ? 1 : 0));
    for (const e of hits) {
      // (the same recording listed twice, under two of the catalogue's headings: once)
      const id = e.sha256 ?? e.file;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ file: diskPath(e.file), dur: e.duration_seconds ?? 0, title: baseName(e.name) });
      if (one) break;
    }
  }
  return out;
}

/** the table of cues and stations the catalogue makes (a cue none of whose recordings are listed is left out) */
export function resolveCues(entries: readonly CatalogEntry[], spec: Readonly<Record<string, readonly CuePick[]>> = CUE_SPEC, stations: readonly StationSpec[] = STATIONS): CueTable {
  const cues: Record<string, CueFile[]> = {};
  for (const key of Object.keys(spec)) {
    const files = find(entries, spec[key]).map(({ file, dur }) => ({ file, dur }));
    if (files.length) cues[key] = files;
  }
  const st: StationTable[] = stations.map((s) => ({ name: s.name, en: s.en, songs: s.songs.flatMap((p) => find(entries, [p], true)) }));
  return { cues, stations: st };
}

/**
 * Where a station is on air at a time (s, any clock all sets share): which of its songs, and how far into it.
 * Its songs one after another round and round, a second's pause between them.
 */
export function onAir(songs: readonly CueFile[], t: number, gap = 1): { song: number; at: number } {
  let total = 0;
  for (const s of songs) total += Math.max(1, s.dur) + gap;
  if (!songs.length || !(total > 0)) return { song: -1, at: 0 };
  let x = ((t % total) + total) % total;
  for (let i = 0; i < songs.length; i++) {
    const len = Math.max(1, songs[i].dur) + gap;
    if (x < len) return { song: i, at: Math.min(x, Math.max(0, songs[i].dur - 0.05)) };
    x -= len;
  }
  return { song: 0, at: 0 };
}
