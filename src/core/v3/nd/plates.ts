/**
 * A licence plate (docs/ND/PLAN.md, ND4; Nomad Drive's Plate and plate config, its asset's numbers): one kind of thing,
 * every one rolled as it is first found — the world's seed and the thing's own — so each is its own: a region (ten,
 * from the common to the very rare), a number in that region's way (the region's character, a letter, five more), now
 * and then something rarer: a foil plate (2 %), a word in place of the number (0.2 %), a number of a kind (all one
 * figure, a run, a palindrome …: only the best one counts), and the state it is in (five grades, mint the rarest).
 * How rare it is, as "one in N": the region's × the number's × the foil's (50) × the grade's; six tiers from it (1,
 * 11, 33, 125, 855, 25 200). Found the first time, a rare one is said so (2, 3, 4 s), a legendary one with a start.
 * The regions and their colours are this game's own (Nomad Drive's are its towns). Pure: no three, no DOM.
 */

export interface Region {
  /** its character on the plate, its name, how often it turns up (Nomad Drive's town weights, 280 down to 3) */
  readonly ch: string;
  readonly name: string;
  readonly weight: number;
  /** the plate's ground and its letters */
  readonly ground: number;
  readonly ink: number;
  /** its initials in letters (a plate that has them is rarer) */
  readonly initials: string;
}

export const REGIONS: readonly Region[] = [
  { ch: '青', name: '青川', weight: 280, ground: 0x2f5fa8, ink: 0xf5f2e8, initials: 'QC' },
  { ch: '岚', name: '岚州', weight: 200, ground: 0xf3efe2, ink: 0x1f2430, initials: 'LZ' },
  { ch: '禾', name: '禾原', weight: 150, ground: 0xf0c23c, ink: 0x1f2430, initials: 'HY' },
  { ch: '枫', name: '枫桥', weight: 100, ground: 0xc8372f, ink: 0xf5f2e8, initials: 'FQ' },
  { ch: '沙', name: '沙洲', weight: 70, ground: 0xe6d3a8, ink: 0x6b3a1f, initials: 'SZ' },
  { ch: '雾', name: '雾岭', weight: 45, ground: 0x4f7a5a, ink: 0xf5f2e8, initials: 'WL' },
  { ch: '霞', name: '霞湾', weight: 25, ground: 0xe8907a, ink: 0x2b2d31, initials: 'XW' },
  { ch: '烛', name: '北烛', weight: 12, ground: 0x2b2d31, ink: 0xf0c23c, initials: 'BZ' },
  { ch: '鲸', name: '鲸港', weight: 6, ground: 0x3d78b0, ink: 0xf0cf4a, initials: 'JG' },
  { ch: '星', name: '星落', weight: 3, ground: 0x1d1f3a, ink: 0xc8d8ff, initials: 'XL' },
];

const TOTAL = REGIONS.reduce((s, r) => s + r.weight, 0);

/** the grades, worst to best: how likely, how much rarer it makes the plate */
export const GRADES = [
  { id: 'rusted', zh: '锈透了', p: 0.35, k: 1 },
  { id: 'worn', zh: '旧', p: 0.3, k: 1 },
  { id: 'fair', zh: '还行', p: 0.2, k: 2 },
  { id: 'good', zh: '挺新', p: 0.12, k: 6 },
  { id: 'mint', zh: '崭新', p: 0.03, k: 57 },
] as const;

/** the words a plate may say instead of its number (0.2 %) */
export const VANITY = ['HOME', 'SLOW', 'ROAD', 'DRIVE', 'SUNNY', 'MOON', 'CAMP', 'WEST', 'TRIP', 'NAPS', 'TEA4U', 'GO4IT'] as const;

/** the numbers of a kind, best first: how much rarer each makes the plate (one in this many) */
export const PATTERNS = [
  { id: 'solid', zh: '豹子号', k: 100000 },
  { id: 'initials', zh: '地名缩写', k: 17548 },
  { id: 'straight', zh: '顺子', k: 20000 },
  { id: 'four', zh: '四连号', k: 3000 },
  { id: 'letters', zh: '全是字母', k: 733 },
  { id: 'sevens', zh: '三个七', k: 600 },
  { id: 'palindrome', zh: '回文号', k: 400 },
  { id: 'hundreds', zh: '整百', k: 80 },
  { id: 'three', zh: '三连号', k: 60 },
  { id: 'pairs', zh: '两对', k: 30 },
  { id: 'lucky', zh: '吉利号', k: 12 },
  { id: 'digits', zh: '全是数字', k: 4 },
] as const;
export type PatternId = (typeof PATTERNS)[number]['id'];

export const TIERS = [
  { id: 'common', zh: '普通', from: 1 },
  { id: 'uncommon', zh: '少见', from: 11 },
  { id: 'rare', zh: '稀有', from: 33 },
  { id: 'precious', zh: '珍贵', from: 125 },
  { id: 'legendary', zh: '传说', from: 855 },
  { id: 'mythic', zh: '神话', from: 25200 },
] as const;

export const PLATE = {
  foil: 0.02,
  foilK: 50,
  vanity: 0.002,
  vanityK: 500,
  /** a letter in the five, against a figure */
  letter: 0.25,
  /** the found plate's words: this long for a rare one, a precious one, a legendary or better (s) */
  sayS: [2, 3, 4] as const,
} as const;

/** a plate as it was rolled (ItemState.plate) */
export interface PlateRoll {
  region: number;
  /** the letter after the region's character, and the five after the dot (or the word) */
  letter: string;
  tail: string;
  vanity: boolean;
  foil: boolean;
  grade: number;
  pattern: PatternId | null;
  /** one in this many */
  oneIn: number;
  tier: number;
}

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '0123456789';

/** a small fast random from a seed (mulberry32) */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** a string's hash (for the thing's own part of the seed) */
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** the best kind of number a plate's five are (null: none) */
export function patternOf(tail: string, region: Region): PatternId | null {
  const t = tail;
  const all = (re: RegExp): boolean => [...t].every((c) => re.test(c));
  const digits = all(/[0-9]/);
  const runs = (n: number): boolean => {
    for (let i = 0; i + n <= t.length; i++) if (t.slice(i, i + n).split('').every((c) => c === t[i])) return true;
    return false;
  };
  const straight = (): boolean => {
    if (!digits) return false;
    const d = [...t].map(Number);
    const up = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
    const down = d.every((x, i) => i === 0 || x === d[i - 1] - 1);
    return up || down;
  };
  const found: Record<PatternId, boolean> = {
    solid: runs(t.length),
    initials: t.includes(region.initials),
    straight: straight(),
    four: runs(4),
    letters: all(/[A-Z]/),
    sevens: t.includes('777'),
    palindrome: t === [...t].reverse().join('') && !runs(t.length),
    hundreds: digits && t.endsWith('00'),
    three: runs(3),
    pairs: /(.)\1.*(.)\2/.test(t),
    lucky: /88|66|99/.test(t),
    digits,
  };
  for (const p of PATTERNS) if (found[p.id]) return p.id;
  return null;
}

/** how rare a plate is: one in this many */
export function oneIn(p: Pick<PlateRoll, 'region' | 'vanity' | 'foil' | 'grade' | 'pattern'>): number {
  const r = REGIONS[p.region];
  let n = TOTAL / r.weight / (TOTAL / REGIONS[0].weight);
  if (p.vanity) n *= PLATE.vanityK;
  else if (p.pattern) n *= PATTERNS.find((x) => x.id === p.pattern)!.k;
  if (p.foil) n *= PLATE.foilK;
  n *= GRADES[p.grade].k;
  return Math.max(1, Math.round(n));
}

/** the tier of one in n */
export function tierOf(n: number): number {
  let t = 0;
  for (let i = 0; i < TIERS.length; i++) if (n >= TIERS[i].from) t = i;
  return t;
}

/** a plate rolled from the world's seed and the thing's own */
export function rollPlate(worldSeed: number, own: number): PlateRoll {
  const r = rng((worldSeed * 0x9e3779b1) ^ own ^ 0x1a7e);
  let w = r() * TOTAL;
  let region = 0;
  for (let i = 0; i < REGIONS.length; i++) {
    w -= REGIONS[i].weight;
    if (w < 0) {
      region = i;
      break;
    }
  }
  const letter = LETTERS[Math.floor(r() * LETTERS.length)];
  const vanity = r() < PLATE.vanity;
  let tail = '';
  if (vanity) tail = VANITY[Math.floor(r() * VANITY.length)];
  else for (let i = 0; i < 5; i++) tail += r() < PLATE.letter ? LETTERS[Math.floor(r() * LETTERS.length)] : DIGITS[Math.floor(r() * 10)];
  const foil = r() < PLATE.foil;
  let g = r();
  let grade = 0;
  for (let i = 0; i < GRADES.length; i++) {
    g -= GRADES[i].p;
    if (g < 0) {
      grade = i;
      break;
    }
    grade = i;
  }
  const pattern = vanity ? null : patternOf(tail, REGIONS[region]);
  const n = oneIn({ region, vanity, foil, grade, pattern });
  return { region, letter, tail, vanity, foil, grade, pattern, oneIn: n, tier: tierOf(n) };
}

/** what the plate reads: 青A·7K382 (a word: 青A·HOME) */
export function plateText(p: PlateRoll): string {
  return `${REGIONS[p.region].ch}${p.letter}·${p.tail}`;
}

/** how long a found plate is said for (s; 0: not said, it is nothing special) */
export function plateSayS(p: PlateRoll): number {
  if (p.tier < 2) return 0;
  return p.tier === 2 ? PLATE.sayS[0] : p.tier === 3 ? PLATE.sayS[1] : PLATE.sayS[2];
}
