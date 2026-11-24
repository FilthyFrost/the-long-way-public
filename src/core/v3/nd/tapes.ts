/**
 * The tapes and the deck that plays them (docs/ND/PLAN.md, ND4; Nomad Drive's Cassette, vehicle radio and
 * radio cassette deck with their assets' values). Thirteen tapes, each one song — the local sound archive's (the
 * radio's stations' songs: core/audio/cueSpec.ts; read from the machine, never in the repository), or, without it,
 * one made up the way the radio makes its own (radio.ts). The deck is a vehicle's tape radio (the parts' radio_tape):
 * looked at from a seat its lid opens (80°, 0.25 s; 0.3 s shut); a tape in the hands goes in with the button held
 * 0.4 s (sliding in over 0.35 s), comes out again the same (into a free hand); the tape plays its song from its start
 * and over again when it ends, from where it was when it was left (the place is kept with the deck); the wheel turns
 * the volume, fifteen steps, starting at ten, a step at most every 0.13 s (the knob over 270°); silent with no
 * battery. Heard full within 4 m of it, nothing past 25 m; outside, through the body as the radio is. Which tapes
 * one has put in is kept (Nomad Drive's "Greatest Hits": all thirteen). Pure: no three, no DOM.
 */

export interface Tape {
  /** the kind's id (the catalogue's) */
  readonly id: string;
  /** what its label says (the song's name in Chinese) and the song's own */
  readonly title: string;
  /** the archive's station it is among, and its name there (the catalogue's, as the station lists it) */
  readonly station: number;
  readonly song: string;
  /** its shell and its label */
  readonly shell: number;
  readonly label: number;
  /** made up without the archive: the tempo, the key (MIDI), the way the guitar plays, the tune's voice */
  readonly synth: { bpm: number; key: number; style: 'pick' | 'waltz' | 'bounce' | 'slow'; lead: 'whistle' | 'harp'; seed: number };
}

const t = (n: number, title: string, station: number, song: string, shell: number, label: number, synth: Tape['synth']): Tape => ({ id: `nd_tape_${String(n).padStart(2, '0')}`, title, station, song, shell, label, synth });

/** the thirteen (as many as Nomad Drive's songs on its tapes), three or so from each of the radio's five stations */
export const TAPES: readonly Tape[] = [
  t(1, '心中的平原', 0, 'american-heartland-371219', 0xe9dcc0, 0xd8673a, { bpm: 96, key: 55, style: 'pick', lead: 'whistle', seed: 101 }),
  t(2, '风滚草', 0, 'ES_Tumbleweed - Roots and Recognition', 0x2f3236, 0xe8a23a, { bpm: 108, key: 52, style: 'bounce', lead: 'harp', seed: 102 }),
  t(3, '昨日的小路', 0, 'ES_Trails of Yesterday - Johan Glossner', 0x8a5a3c, 0xf1e6c8, { bpm: 84, key: 57, style: 'slow', lead: 'whistle', seed: 103 }),
  t(4, '清晨', 1, '1877_peer-gynt-suite-no-1-op-46-i-morning', 0xf3efe6, 0x6c8fae, { bpm: 72, key: 52, style: 'waltz', lead: 'whistle', seed: 104 }),
  t(5, '回家的路很长', 2, 'JMHBM - Long Way Home', 0x2f3236, 0xc8372f, { bpm: 120, key: 50, style: 'bounce', lead: 'harp', seed: 105 }),
  t(6, '病中蓝调', 2, "ES_Sick Man's Blues - Peter Crosby", 0x3e5f8f, 0xf0c23c, { bpm: 92, key: 52, style: 'pick', lead: 'harp', seed: 106 }),
  t(7, '一路向上', 2, 'Formation Sound - Upward Climb', 0xc8372f, 0xf3efe6, { bpm: 128, key: 55, style: 'bounce', lead: 'whistle', seed: 107 }),
  t(8, '1986 年的公路', 3, 'LMMS - 1986 Highway', 0x2b2d31, 0xe86ab0, { bpm: 118, key: 57, style: 'pick', lead: 'whistle', seed: 108 }),
  t(9, '海滨大道', 3, 'ULTRAWAVE - Oceandrive', 0x3d78b0, 0xf1ece0, { bpm: 110, key: 53, style: 'pick', lead: 'harp', seed: 109 }),
  t(10, '夜里冲浪', 3, 'ES_Night Surfing - OTE', 0x4a3a6b, 0x5ad8d0, { bpm: 104, key: 50, style: 'slow', lead: 'whistle', seed: 110 }),
  t(11, '凌晨两点', 4, 'ES_2AM - Ben Elson', 0x1f2430, 0x8fb0a6, { bpm: 80, key: 57, style: 'slow', lead: 'harp', seed: 111 }),
  t(12, '追梦', 4, 'ES_Dream Chasing - Mizlo', 0xe8a23a, 0x2f3236, { bpm: 88, key: 55, style: 'waltz', lead: 'whistle', seed: 112 }),
  t(13, '天亮的时候', 4, 'ES_At the Crack of Dawn - Emanuel Wilde', 0xf0cf4a, 0x3e7f96, { bpm: 76, key: 52, style: 'slow', lead: 'whistle', seed: 113 }),
];

const BY_ID = new Map(TAPES.map((x) => [x.id, x]));

/** a tape by its kind's id (null: not a tape) */
export function tapeOf(id: string): Tape | null {
  return BY_ID.get(id) ?? null;
}

export const DECK = {
  /** the lid: how far it opens (°), how quickly it opens and shuts (s) */
  lidDeg: 80,
  lidOpenS: 0.25,
  lidShutS: 0.3,
  /** the button held this long puts a tape in or takes it out (s); it slides in over this long */
  holdS: 0.4,
  slideS: 0.35,
  /** the volume's steps, where it starts, a step at most this often (s), the knob's turn over all of them (°) */
  steps: 15,
  start: 10,
  stepS: 0.13,
  knobDeg: 270,
  /** heard full within this of it, nothing past this (m) */
  fullM: 4,
  silentM: 25,
  /** the place in the song kept this often (s) */
  keepS: 0.5,
} as const;

/** how much of the deck's sound reaches one this far off it (1 within 4 m, falling away to nothing at 25 m) */
export function deckFalloff(d: number): number {
  if (d <= DECK.fullM) return 1;
  if (d >= DECK.silentM) return 0;
  // (a sound's fall with distance, brought down to nothing at the far end)
  const k = DECK.fullM / d;
  const end = DECK.fullM / DECK.silentM;
  return Math.max(0, (k - end) / (1 - end));
}

/** a volume step up (+1) or down, no sooner than `stepS` after the last (`last`: when that was, s); null: not yet */
export function volumeStep(vol: number, dir: 1 | -1, now: number, last: number): number | null {
  if (now - last < DECK.stepS) return null;
  return Math.max(0, Math.min(DECK.steps, vol + dir));
}

/** a time in a song as the deck shows it: 1:05 */
export function clock(s: number): string {
  const m = Math.floor(Math.max(0, s) / 60);
  const ss = Math.floor(Math.max(0, s) % 60);
  return `${m}:${String(ss).padStart(2, '0')}`;
}

/**
 * The tapes in the order a world deals them (Nomad Drive deals each one found so far no more: a new one each time,
 * until all are had): shuffled by the world's seed, the same every time.
 */
export function tapeDeck(worldSeed: number): string[] {
  const ids = TAPES.map((x) => x.id);
  let s = (worldSeed ^ 0x7a9e) >>> 0 || 1;
  for (let i = ids.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    const j = s % (i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

/** the next one a world deals: the first of its deck not had yet (none left: the first of the deck again) */
export function nextOf(deck: readonly string[], had: ReadonlySet<string>): string {
  return deck.find((id) => !had.has(id)) ?? deck[0];
}
