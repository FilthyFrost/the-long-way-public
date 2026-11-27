/**
 * Physical cassette tapes and tape-deck rules (Playtest Round 2 #28):
 * All 51 songs from the five archive stations (core/audio/cueSpec.ts STATIONS) are burned onto individual physical
 * cassettes (nd_tape_01 .. nd_tape_51). The first 13 preserve their original IDs for save compatibility.
 * Pure: no three, no DOM.
 */

export interface Tape {
  /** the kind's id (the catalogue's) */
  readonly id: string;
  /** what its label says (the song's name in Chinese) */
  readonly title: string;
  /** the archive's station it belongs to (0..4), and its exact song title in cueSpec.ts */
  readonly station: number;
  readonly song: string;
  /** its shell and its label (sRGB hex) */
  readonly shell: number;
  readonly label: number;
  /** procedural fallback when the local audio archive is absent */
  readonly synth: { bpm: number; key: number; style: 'pick' | 'waltz' | 'bounce' | 'slow'; lead: 'whistle' | 'harp'; seed: number };
}

export const STATION_GENRES: readonly string[] = ['乡村之声', '古典音乐', '公路摇滚', '霓虹电台', '深夜频道'];

const t = (n: number, title: string, station: number, song: string, shell: number, label: number, synth: Tape['synth']): Tape => ({
  id: `nd_tape_${String(n).padStart(2, '0')}`,
  title,
  station,
  song,
  shell,
  label,
  synth,
});

/** All 51 songs across all five stations burned onto individual physical cassettes */
export const TAPES: readonly Tape[] = [
  // Original 13 (preserved IDs)
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
  // Country remaining 10 (14..23)
  t(14, '欢快的乡间', 0, 'Philip Ravenel - Joyful Countryside', 0xd89a4a, 0xf4ebd2, { bpm: 106, key: 57, style: 'bounce', lead: 'whistle', seed: 114 }),
  t(15, '乡间小道', 0, 'backroads-country-music-381194', 0x7c5a3a, 0xe8c47a, { bpm: 98, key: 55, style: 'pick', lead: 'harp', seed: 115 }),
  t(16, '西部荒野', 0, 'cinematic-country-loop-western-theme-266525', 0x6b3f2b, 0xe08e3e, { bpm: 86, key: 50, style: 'slow', lead: 'whistle', seed: 116 }),
  t(17, '田园风光', 0, 'legacyAlli - RF Country Landscape', 0x5f8556, 0xf1e6c8, { bpm: 94, key: 53, style: 'waltz', lead: 'whistle', seed: 117 }),
  t(18, '旧日乡村', 0, 'country-music-347561', 0xc87a42, 0xf5ecd6, { bpm: 102, key: 55, style: 'pick', lead: 'harp', seed: 118 }),
  t(19, '小镇闲谈', 0, 'ES_Small Town Talk (Instrumental Version) - Northside', 0x9c6e44, 0xd8a64c, { bpm: 100, key: 52, style: 'pick', lead: 'whistle', seed: 119 }),
  t(20, '公路小馆', 0, 'country-on-the-menu-111330', 0xb84a36, 0xf3e4c4, { bpm: 112, key: 57, style: 'bounce', lead: 'harp', seed: 120 }),
  t(21, '夏日蜻蜓', 0, 'ES_Dragonfly - Roots and Recognition', 0x688f68, 0xe9d69c, { bpm: 92, key: 53, style: 'pick', lead: 'whistle', seed: 121 }),
  t(22, '尘土摇滚', 0, 'country-rock-349183', 0x423a35, 0xd86b34, { bpm: 118, key: 50, style: 'bounce', lead: 'harp', seed: 122 }),
  t(23, '荒原旅人', 0, 'ES_Greatness on Me (Instrumental Version) - Witchitaw Slim', 0x8d5236, 0xf0cf74, { bpm: 90, key: 52, style: 'slow', lead: 'harp', seed: 123 }),
  // Classical remaining 8 (24..31)
  t(24, '夜曲 Op.9 No.2', 1, '245_aya-higuchi-nocturne-op-9-no-2-pd', 0xefe9dc, 0x3b4e6b, { bpm: 68, key: 55, style: 'waltz', lead: 'whistle', seed: 124 }),
  t(25, '天鹅湖·第二幕', 1, 'Tchaikovsky-SwanLake-Op20-Act-II-Pt1', 0xf6f3eb, 0x4c6f91, { bpm: 78, key: 50, style: 'waltz', lead: 'whistle', seed: 125 }),
  t(26, '安妮特拉之舞', 1, '1877_peer-gynt-suite-no-1-op-46-iii-anitras-dream', 0xe7dec8, 0x9c6b3a, { bpm: 104, key: 57, style: 'waltz', lead: 'harp', seed: 126 }),
  t(27, 'G小调第四十交响曲', 1, 'Symphony-No-40-in-G-Minor-K-550-IV-Allegro-assai', 0x2c3442, 0xe6d3a3, { bpm: 124, key: 55, style: 'bounce', lead: 'whistle', seed: 127 }),
  t(28, '花之圆舞曲', 1, 'Tchaikovsky-TheNutcrackerSuite-ActI-No8-WaltzOfTheFlowers', 0xf3e5dc, 0xc86472, { bpm: 96, key: 53, style: 'waltz', lead: 'whistle', seed: 128 }),
  t(29, '山魔王的宫殿', 1, '1877_peer-gynt-suite-no-1-op-46-iv-in-the-hall-of-the-mountain-king', 0x282b30, 0xc4973f, { bpm: 116, key: 50, style: 'bounce', lead: 'harp', seed: 129 }),
  t(30, '冬日敬畏', 1, 'AweofWinter-SleddersMainTheme', 0xdde7ef, 0x4a6b8a, { bpm: 74, key: 52, style: 'slow', lead: 'whistle', seed: 130 }),
  t(31, '女武神幻想曲', 1, 'Wagner-GrandFantasieFromDieWalkurie', 0x5c2c2c, 0xe8c776, { bpm: 112, key: 57, style: 'bounce', lead: 'harp', seed: 131 }),
  // Road rock remaining 7 (32..38)
  t(32, '人生学院', 2, "ES_School of Life - Rockin' For Decades", 0xb8322a, 0xf2c94c, { bpm: 126, key: 52, style: 'bounce', lead: 'harp', seed: 132 }),
  t(33, '重机引擎', 2, 'JMHBM - Harley Davidson', 0x26282b, 0xe87b2a, { bpm: 122, key: 50, style: 'bounce', lead: 'harp', seed: 133 }),
  t(34, '荒漠无情', 2, "ES_Ain't No Mercy Here - Def Lev", 0x3b2c2a, 0xd84434, { bpm: 116, key: 55, style: 'pick', lead: 'harp', seed: 134 }),
  t(35, '公路甜心', 2, 'JMHBM - Baby Girl', 0xc94f3d, 0xf3e6c8, { bpm: 114, key: 57, style: 'pick', lead: 'whistle', seed: 135 }),
  t(36, '晴日硬摇', 2, 'Positive Instrumental Rock Music by Wayne John Bradley', 0xd48e2e, 0x2a2d32, { bpm: 128, key: 55, style: 'bounce', lead: 'whistle', seed: 136 }),
  t(37, '铁骑狂奔', 2, 'JMHBM - Stampede', 0x2f353d, 0xd9382e, { bpm: 132, key: 50, style: 'bounce', lead: 'harp', seed: 137 }),
  t(38, '沉重呼吸', 2, 'ES_Heavy Lungs - Non-State Actor', 0x454a52, 0xe8b23a, { bpm: 108, key: 52, style: 'pick', lead: 'harp', seed: 138 }),
  // Neon FM remaining 6 (39..44)
  t(39, '粉色漩涡', 3, 'ES_Pink Vortex - ELFL', 0x322645, 0xf06eb4, { bpm: 116, key: 57, style: 'pick', lead: 'whistle', seed: 139 }),
  t(40, '代托纳迷梦', 3, 'ES_Daytona Dystopia - Dylan Sitts', 0x22293a, 0x4ed4d0, { bpm: 112, key: 53, style: 'bounce', lead: 'whistle', seed: 140 }),
  t(41, '午夜电音', 3, 'Jol3x - Electro House 2017', 0x1d2638, 0xf0b83e, { bpm: 126, key: 55, style: 'bounce', lead: 'harp', seed: 141 }),
  t(42, '重归平稳', 3, 'Punch Deck - Restabilized', 0x293b52, 0x6ce0b8, { bpm: 108, key: 50, style: 'pick', lead: 'whistle', seed: 142 }),
  t(43, '跨夜航线', 3, 'ES_LAX2DUBAI - Ballpoint', 0x3c2c5a, 0xf08c5c, { bpm: 102, key: 52, style: 'slow', lead: 'harp', seed: 143 }),
  t(44, '终于降落', 3, 'HOME - We’re Finally Landing', 0x2c3e5e, 0xf4a261, { bpm: 98, key: 55, style: 'slow', lead: 'whistle', seed: 144 }),
  // Late night remaining 7 (45..51)
  t(45, '低保真午夜', 4, 'HoliznaPATREON - LoFidelty Drama5', 0x242938, 0xc8a47c, { bpm: 78, key: 53, style: 'slow', lead: 'harp', seed: 145 }),
  t(46, '天鹅绒之夜', 4, 'ES_Velvet - Dylan Sitts', 0x3b263c, 0xe8b498, { bpm: 84, key: 50, style: 'slow', lead: 'whistle', seed: 146 }),
  t(47, '冰镇节拍', 4, 'ES_2 iced out! (Instrumental Version) - Enophi', 0x263848, 0x9ad4e0, { bpm: 92, key: 57, style: 'pick', lead: 'harp', seed: 147 }),
  t(48, '未知来由', 4, 'Ketsa - Unkown Causes', 0x2d3238, 0x9db09a, { bpm: 82, key: 52, style: 'slow', lead: 'whistle', seed: 148 }),
  t(49, '夜色降临', 4, 'ES_take down (Instrumental Version) - Relyae', 0x1d222c, 0xd87a6a, { bpm: 88, key: 55, style: 'pick', lead: 'harp', seed: 149 }),
  t(50, '心满意足', 4, "ES_Satisfied (Instrumental Version) - I'MIN", 0x32403a, 0xe8cf8e, { bpm: 86, key: 53, style: 'waltz', lead: 'whistle', seed: 150 }),
  t(51, '静夜祈愿', 4, 'Alex Productions - PRAY', 0x1e2536, 0xb8a8d8, { bpm: 74, key: 50, style: 'slow', lead: 'whistle', seed: 151 }),
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
 * The tapes in the order a world deals them: shuffled by the world's seed so all 51 tracks appear without repeats
 * until every cassette has been dealt.
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
