/**
 * The casual fishing module's contract (node F2, docs/V3/nodes/F2-fishing-lite.md): one button, a stocked pond,
 * six rarities, sizes and colour variants. Types and the few tables every part reads. Pure: no three, no DOM.
 *
 * Units: metres, seconds, kilograms, centimetres for a fish's length. Angles in radians. Hours 0 … 24.
 */

/** a fish's rarity, by index: common, uncommon, rare, epic, legendary (the water's lord), celestial */
export type Tier = 0 | 1 | 2 | 3 | 4 | 5;

export interface TierDef {
  readonly id: string;
  readonly zh: string;
  readonly en: string;
  /** the colour it is shown in (sRGB hex, for the HUD and the "!" at the hook) */
  readonly color: string;
  /** what it is worth against a common fish (whichever waters the two came out of) */
  readonly value: number;
  /** experience against a common fish */
  readonly xp: number;
  /** its share of a day's stock (the lord and the celestial fish are stocked by their own rules) */
  readonly share: number;
  /** seconds one has to strike once it bites (before the hook's and the charms' help) */
  readonly window: number;
  /** how readily it comes to a bait against a common fish */
  readonly bold: number;
  /**
   * Its strength against the power of the rod its rarity is measured against (gear.ts REC_ROD, whichever water it lives
   * in; a lord's and a sky fish's: their own water's rod): from the smallest to the largest of its kind
   */
  readonly strength: readonly [number, number];
  /** how much work it takes to tire (seconds of the rod held hard against it, docs/V3/plan/fishing-fight.md §3) */
  readonly stamina: number;
  /** where it lives: its share of the near, middle and deep water */
  readonly zones: readonly [number, number, number];
}

export const TIERS: readonly TierDef[] = [
  { id: 'common', zh: '普通', en: 'Common', color: '#e9e4d6', value: 1, xp: 1, share: 0.55, window: 0.9, bold: 1, strength: [0.18, 0.42], stamina: 9.7, zones: [0.6, 0.4, 0] },
  { id: 'uncommon', zh: '优良', en: 'Uncommon', color: '#7fd16b', value: 2.5, xp: 2.2, share: 0.28, window: 0.82, bold: 0.85, strength: [0.42, 0.7], stamina: 11.5, zones: [0.3, 0.6, 0.1] },
  { id: 'rare', zh: '稀有', en: 'Rare', color: '#5aa8f0', value: 7, xp: 4.5, share: 0.13, window: 0.72, bold: 0.7, strength: [0.7, 0.95], stamina: 15, zones: [0.05, 0.55, 0.4] },
  { id: 'epic', zh: '史诗', en: 'Epic', color: '#b57cf2', value: 20, xp: 10, share: 0.04, window: 0.64, bold: 0.55, strength: [1.0, 1.25], stamina: 21, zones: [0, 0.2, 0.8] },
  { id: 'legendary', zh: '传说', en: 'Legendary', color: '#f2b53a', value: 80, xp: 40, share: 0, window: 0.58, bold: 0.6, strength: [1.5, 1.68], stamina: 28, zones: [0, 0, 1] },
  { id: 'celestial', zh: '天象', en: 'Celestial', color: '#ff8ad8', value: 250, xp: 60, share: 0, window: 0.52, bold: 0.7, strength: [1.3, 1.45], stamina: 21, zones: [0, 0.5, 0.5] },
];

/** a caught fish's colour: none, shiny, albino, melanistic, golden, prism */
export type Variant = 0 | 1 | 2 | 3 | 4 | 5;

export interface VariantDef {
  readonly id: string;
  readonly zh: string;
  readonly en: string;
  /** its chance per catch with a plain bait (before the bait's, the charms' and the streak's help) */
  readonly chance: number;
  readonly value: number;
  readonly xp: number;
}

export const VARIANTS: readonly VariantDef[] = [
  { id: 'none', zh: '寻常', en: 'Plain', chance: 0, value: 1, xp: 1 },
  { id: 'shiny', zh: '闪光', en: 'Shiny', chance: 0.045, value: 2, xp: 1.5 },
  { id: 'albino', zh: '白化', en: 'Albino', chance: 0.006, value: 4, xp: 2 },
  { id: 'melanistic', zh: '黑化', en: 'Melanistic', chance: 0.006, value: 4, xp: 2 },
  { id: 'golden', zh: '黄金', en: 'Golden', chance: 0.0025, value: 10, xp: 3 },
  { id: 'prism', zh: '幻彩', en: 'Prism', chance: 0.0005, value: 30, xp: 5 },
];

/** the medals a fish's weight earns against its kind's largest: none, bronze, silver, gold, diamond */
export type Medal = 0 | 1 | 2 | 3 | 4;
export const MEDAL_AT: readonly number[] = [0, 0.35, 0.55, 0.75, 0.9];
export const MEDAL_ZH: readonly string[] = ['', '铜牌', '银牌', '金牌', '钻石'];

/**
 * What a bait is: plants and dough (素), worms and meat (荤), things that move: lures and live fish (掠). It no longer
 * says which fish take it (its tier does, docs/V3/plan/fishing-feel.md §10): a lure is fished by winding it in.
 */
export type BaitKind = 'veg' | 'meat' | 'lure';
export const BAIT_KIND_ZH: Readonly<Record<BaitKind, string>> = { veg: '素', meat: '荤', lure: '掠' };

/** how a fish fights */
export type Temper = 'steady' | 'runner' | 'jumper' | 'diver' | 'brute' | 'trick';
export const TEMPER_ZH: Readonly<Record<Temper, string>> = { steady: '稳', runner: '窜', jumper: '跳', diver: '钻', brute: '蛮', trick: '诈' };

/** a lord's own move in a fight (and the electric eel's shock) */
export type Move = 'reedBore' | 'tripleRun' | 'leap' | 'tripleBore' | 'heavy' | 'breathe' | 'iceDive' | 'longRun' | 'surge' | 'eclipse' | 'zap';

/** the parts of the day: dawn 5–8, day 8–17, dusk 17–20, night 20–5 (a fish's hours are a mask of them) */
export const DAWN = 1;
export const DAY = 2;
export const DUSK = 4;
export const NIGHT = 8;
export const ANY_HOUR = 15;

/** a moment that has to be there for a fish to bite at all (a lord's hour aside) */
export type Cond =
  | 'rain'
  | 'clear'
  | 'fog'
  | 'storm'
  | 'snow'
  | 'rainbow'
  | 'sunshower'
  | 'afterglow'
  | 'meteor'
  | 'aurora'
  | 'ribbon'
  | 'fullmoon'
  | 'moonup'
  | 'dream';

/** the body a fish is drawn with (src/game/fishing/fishModel.ts) */
export type Family =
  | 'fusiform'
  | 'carp'
  | 'perch'
  | 'disc'
  | 'eel'
  | 'catfish'
  | 'pike'
  | 'flat'
  | 'ancient'
  | 'round'
  | 'squid'
  | 'octopus'
  | 'crayfish'
  | 'frog'
  | 'turtle'
  | 'tetra'
  | 'cube';

/** what a fish's skin looks like: four colours and a pattern (the view reads it; the rules do not) */
export interface Look {
  /** back, flank, belly, fins (sRGB hex) */
  readonly c: readonly [number, number, number, number];
  /** pattern: plain, bars (vertical), stripe (along), spots, speck (fine), net, blotch, koi, scales, leopard, rings, glow, clear */
  readonly p?: string;
  /** the pattern's colour, and how many (or how dense) */
  readonly pc?: number;
  readonly n?: number;
  /** body shape overrides: height and width against length, where the tallest point is, how pointed the head */
  readonly h?: number;
  readonly w?: number;
  /** features: whiskers, sail, eyespot, scutes, tusks, glow, lamps, horn, flatHead, upMouth, longTail, finRays … */
  readonly f?: readonly string[];
}

export interface FishDef {
  /** snake_case, unique; saved */
  readonly id: string;
  readonly zh: string;
  readonly en: string;
  /** which water (index into SPOTS) */
  readonly spot: number;
  readonly tier: Tier;
  /** lengths caught (cm): the smallest worth keeping and the largest there is */
  readonly cm: readonly [number, number];
  /** a mask of DAWN, DAY, DUSK, NIGHT */
  readonly hours: number;
  /** a lord's or a celestial fish's own hours (from, to; past midnight when from > to) instead of the mask */
  readonly span?: readonly [number, number];
  /** bites better in rain or in clear weather */
  readonly weather?: 'rain' | 'clear';
  /** bites only when this is so */
  readonly only?: Cond;
  /** what it eats best, and second best (its nature, for the roster: which bait it takes is the bait's tier's say) */
  readonly eats: BaitKind;
  readonly also?: BaitKind;
  /** a lord takes nothing but this fish of its water, alive */
  readonly live?: string;
  readonly temper: Temper;
  /** the hook slips out of it sooner (eels, loaches) */
  readonly slick?: boolean;
  /** a shy fish: it nibbles more and gives a shorter moment to strike */
  readonly wary?: boolean;
  readonly move?: Move;
  readonly family: Family;
  /** kilograms for a fish of length L cm: k · L³ (the family's own when absent) */
  readonly k?: number;
  readonly look: Look;
  /** one line for its card */
  readonly note: string;
  /** the kind of fish it is to the kitchen (src/core/v3/fishing/species.ts), when it is one of those */
  readonly kind?: string;
}

/** a place to fish: a real lake (or a sea pier) of the world, found by its world's seed and road slot */
export interface SpotDef {
  readonly id: string;
  readonly zh: string;
  readonly en: string;
  /** what the place is, in a line */
  readonly blurb: string;
  /** the world (version 5) and the slot of the road whose jetty or pier one stands on */
  readonly seed: number;
  readonly slot: number;
  /** which site's jetty (its id), and whether it is a sea pier */
  readonly site: string;
  readonly sea?: boolean;
  /** how many fish the reachable water holds when stocked */
  readonly capacity: number;
  /** the licence's price (0: open from the start) */
  readonly licence: number;
  /** the moment its celestial fish comes with, and how that moment is named */
  readonly event: Cond;
  readonly eventZh: string;
  /** the hours that moment is looked for in (from, to; past midnight when from > to) */
  readonly eventSpan: readonly [number, number];
  /** what the hut's board says the place is best at */
  readonly tip: string;
}

/** a rod: its power against a fish's strength, how far it casts, how fast it reels, how forgiving it is, its perk */
export interface RodDef {
  readonly id: string;
  readonly zh: string;
  readonly en: string;
  readonly power: number;
  /** metres */
  readonly cast: number;
  /** metres a second its reel winds at best (before the tackle box's reel) */
  readonly reel: number;
  /** 0 … 1: a tougher line, a longer moment in the red */
  readonly feel: number;
  readonly price: number;
  /** where it is sold (index into SPOTS), or −1: not sold (a reward) */
  readonly shop: number;
  /** window: half as long again to strike; night: bites come faster at night and slower by day (rules.ts) */
  readonly perk?: 'window' | 'night';
  /** how it is earned when not sold */
  readonly source?: string;
  readonly note: string;
}

export interface BaitDef {
  readonly id: string;
  readonly zh: string;
  readonly en: string;
  readonly kind: BaitKind;
  /** the one rarity it draws, every fish of it whatever it eats: 0 common … 3 epic; 5 the star bait (celestial fish, in their moment) */
  readonly tier: number;
  /** price of one (a lure: of the lure itself, kept until the line parts) */
  readonly price: number;
  /** a lure is not used up by a fish, only lost with the line */
  readonly lure?: boolean;
  /** how many come in one purchase */
  readonly pack: number;
  readonly note: string;
}

export type CharmEffect = 'none' | 'bell' | 'window' | 'night' | 'heavy' | 'damp' | 'double' | 'lamp' | 'clover' | 'magnet' | 'bigHook' | 'goldHook';

export interface CharmDef {
  readonly id: string;
  readonly zh: string;
  readonly en: string;
  readonly effect: CharmEffect;
  /** how it is had: a price at the hut (> 0) or a goal (journal species, medals, coins sold …) */
  readonly price?: number;
  readonly goal?: { readonly kind: 'species' | 'variants' | 'golds' | 'sold' | 'order' | 'crate'; readonly n: number };
  readonly note: string;
}

/** the five lines of the tackle box (levels 0 … 5) */
export type TackleLine = 'line' | 'reel' | 'hook' | 'net' | 'box';
export const TACKLE_LINES: readonly TackleLine[] = ['line', 'reel', 'hook', 'net', 'box'];

/** the weather and the sky at a moment, as the rules read them */
export interface Conditions {
  /** the world's day (since the journey began) and the hour */
  day: number;
  hour: number;
  rain: boolean;
  clear: boolean;
  fog: boolean;
  storm: boolean;
  snow: boolean;
  /** the moments that are there now (rainbow, meteor, aurora …) */
  events: ReadonlySet<Cond>;
}

/** what a catch is: which fish, how big, which colour, whether it is a record */
export interface Catch {
  fish: number;
  cm: number;
  kg: number;
  medal: Medal;
  variant: Variant;
  value: number;
  xp: number;
  /** the first of its kind, a new record of its kind, a first of this colour of its kind */
  first: boolean;
  record: boolean;
  newVariant: boolean;
  /** caught on a perfect strike */
  perfect: boolean;
  /** an extra small fish came up on the second hook */
  bonus?: number;
}

/** what can come up instead of a fish */
export type Junk = 'boot' | 'can' | 'bottle' | 'crate' | 'pearl';
