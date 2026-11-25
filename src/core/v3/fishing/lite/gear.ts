/**
 * The tackle of the casual fishing module (docs/V3/nodes/F2-fishing-lite.md §7–9, docs/V3/plan/fishing-feel.md §11):
 * five rods, each a different hand; four baits, one to each rarity, and the star bait; charms (one effect each) and
 * the tackle box's five lines.
 *
 * The four rods the huts sell are one to each rarity (REC_ROD), each about 2.6 times the power of the one before: a
 * fish's strength is its rarity's share (types.ts TIERS.strength) of its rarity's rod's power, whichever water it swims
 * in — the willow lands the common fish, the carbon the uncommon, the pro the rare, the sea rod the epic. They differ in
 * more than power: the willow is the forgiving one (the toughest feel, half as long again to strike), the carbon casts
 * furthest and reels fastest with the narrowest feel, the pro is even in everything, the sea rod is the strongest, the
 * slowest and casts short. The fifth, the night rod, is earned: strong, and quick to be bitten at night only. A lord
 * (and a sky fish) is measured against its water's step of a ladder from the willow to the sea rod (homePower).
 *
 * A bait has one tier, the rarity it draws (docs/V3/plan/fishing-feel.md §10–11): the worm draws every common fish and
 * no other, the spoon (a lure, wound in) every uncommon one, the shrimp every rare one, the squid strip every epic one,
 * whatever they eat; which of them comes is chance (pond.ts, fish.ts kindWeight). The star bait is the sky's fish's
 * (their tier, 5), in their moment; a lord takes nothing but its own live fish.
 */
import type { BaitDef, CharmDef, RodDef, TackleLine } from './types';

export const RODS: readonly RodDef[] = [
  // the four the huts sell, one to each rarity (REC_ROD)
  { id: 'rod_willow', zh: '「柳枝」竹竿', en: 'Willow cane', power: 10, cast: 14, reel: 2.6, feel: 1, price: 0, shop: 0, perk: 'window', note: '力气小，抛得近，可手感最宽，咬口后提竿的时间多一半。对付普通的鱼。' },
  { id: 'rod_swift', zh: '「飞燕」碳素竿', en: 'Swift carbon', power: 26, cast: 40, reel: 4.4, feel: 0.45, price: 2400, shop: 1, note: '又轻又快：抛得最远，收线最快；力气一般，手感最窄。对付优良的鱼。' },
  { id: 'rod_pro', zh: '「镜心」专业竿', en: 'Mirrorheart pro', power: 67, cast: 30, reel: 3.4, feel: 0.65, price: 14000, shop: 4, note: '样样都匀：力气、远近、收线、手感都不差。对付稀有的鱼。' },
  { id: 'rod_sea', zh: '「镇海」海竿', en: 'Sea Anchor boat rod', power: 172, cast: 20, reel: 2.2, feel: 0.8, price: 48000, shop: 7, note: '又粗又沉：力气最大，线粗经得住拉；可抛得近，收线最慢。对付史诗的鱼和湖主。' },
  // the one earned
  { id: 'rod_heron', zh: '「夜鹭」夜钓竿', en: 'Night Heron', power: 100, cast: 26, reel: 3, feel: 0.9, price: 0, shop: -1, perk: 'night', source: '湖主的箱子', note: '夜里咬口快五成，白天慢三成；力气在专业竿和海竿之间，手感宽。' },
];

export const ROD_INDEX: ReadonlyMap<string, number> = new Map(RODS.map((r, i) => [r.id, i]));

/**
 * Rods there are no more (saves hold them, docs/V3/plan/fishing-feel.md §11): each read back as the rod there is
 * nearest it in power (the old powers in the comments; "nearest" against the ratio, the willow 10, the carbon 26,
 * the pro 67, the night rod 100, the sea rod 172).
 */
export const ROD_RETIRED: ReadonlyMap<string, string> = new Map([
  ['rod_reed', 'rod_willow'], // 16
  ['rod_old', 'rod_willow'], // 13
  ['rod_brook', 'rod_swift'], // 26
  ['rod_mirror', 'rod_pro'], // 42
  ['rod_mist', 'rod_pro'], // 67
  ['rod_thunder', 'rod_heron'], // 85
  ['rod_vine', 'rod_heron'], // 107
  ['rod_long', 'rod_heron'], // 130
  ['rod_clover', 'rod_sea'], // 160
  ['rod_frost', 'rod_sea'], // 172
  ['rod_tide', 'rod_sea'], // 275
  ['rod_ember', 'rod_sea'], // 440
  ['rod_gold', 'rod_sea'], // 520
  ['rod_moon', 'rod_sea'], // 700
]);

/** the rod an id from a save is now: its own, the one it is read back as, else the willow */
export function rodIdNow(id: string): string {
  return ROD_INDEX.has(id) ? id : (ROD_RETIRED.get(id) ?? 'rod_willow');
}

/**
 * The rod each rarity below the lords is measured against (index into RODS), wherever the fish lives: a common fish is
 * an easy fight on the willow, an uncommon one a fair fight on the carbon, a rare one on the pro, an epic one on the
 * sea rod. A rod below a rarity's is hard work (an uncommon fish on the willow pulls about one and a half times its
 * power), two below all but hopeless.
 */
export const REC_ROD: readonly number[] = [0, 1, 2, 3];

/**
 * What a water's lord and its sky fish are measured against: a ladder from the willow's power (the first water) to the
 * sea rod's (the tenth), about 1.37 times a water. The first lord is a hard fight on the willow, the fourth on the
 * carbon, the seventh on the pro, the tenth on the sea rod, and the next rod up makes each an easy one; the lords
 * between pull from about 0.85 to 1.3 times the power of the rod above their step: a fair fight to a stiff one.
 */
export function homePower(spot: number): number {
  const s = Math.max(0, Math.min(9, spot));
  const lo = RODS[REC_ROD[0]].power;
  const hi = RODS[REC_ROD[3]].power;
  return Math.round(lo * Math.pow(hi / lo, s / 9) * 10) / 10;
}

/** the power a fish of a rarity is measured against: its rarity's rod; a lord's and a sky fish's, their own water's step */
export function measurePower(tier: number, spot: number): number {
  return tier >= 0 && tier < REC_ROD.length ? RODS[REC_ROD[tier]].power : homePower(spot);
}

/** the star bait's tier: the sky's fish's own (types.ts TIERS[5]) */
export const STAR_TIER = 5;

export const BAITS: readonly BaitDef[] = [
  { id: 'worm', zh: '蚯蚓', en: 'Worm', kind: 'meat', tier: 0, price: 1, pack: 20, note: '哪一种普通的鱼都会来咬，来的是哪种看运气。' },
  { id: 'spoon', zh: '亮片', en: 'Spoon', kind: 'lure', tier: 1, price: 60, pack: 1, lure: true, note: '按住收线、收一下停一下地拖，哪一种优良的鱼都会追着咬，来的是哪种看运气。' },
  { id: 'shrimp', zh: '河虾', en: 'River shrimp', kind: 'meat', tier: 2, price: 16, pack: 10, note: '哪一种稀有的鱼都会来咬，来的是哪种看运气。' },
  { id: 'squid_strip', zh: '鱿鱼条', en: 'Squid strip', kind: 'meat', tier: 3, price: 50, pack: 10, note: '哪一种史诗的鱼都会来咬，来的是哪种看运气。' },
  // the sky's fish's, in their moment
  { id: 'stardust', zh: '星屑饵', en: 'Stardust bait', kind: 'lure', tier: STAR_TIER, price: 0, pack: 1, note: '只有天象鱼会咬。漂流瓶和沉船木箱里偶尔有。' },
];

export const BAIT_INDEX: ReadonlyMap<string, number> = new Map(BAITS.map((b, i) => [b.id, i]));

/** baits there are no more (saves hold them): each read back as the bait of its tier (the old fifth tier's as the epic one) */
export const BAIT_RETIRED: ReadonlyMap<string, string> = new Map([
  ['dough', 'worm'],
  ['corn', 'spoon'],
  ['cricket', 'spoon'],
  ['malt', 'shrimp'],
  ['spinner', 'shrimp'],
  ['honey', 'squid_strip'],
  ['softworm', 'squid_strip'],
  ['secret', 'squid_strip'],
  ['king_prawn', 'squid_strip'],
  ['feather', 'squid_strip'],
]);

/** the bait (index into BAITS) an id from a save is now: its own, the one of its tier it is read back as, else the worm */
export function baitIndexOf(id: string): number {
  return BAIT_INDEX.get(id) ?? BAIT_INDEX.get(BAIT_RETIRED.get(id) ?? '') ?? BAIT_INDEX.get('worm')!;
}

/** how much a bait of this tier raises a catch's chance of a colour */
export function variantBoost(baitTier: number): number {
  return baitTier >= 0 && baitTier <= 3 ? [0.6, 1, 1.3, 1.6][baitTier] : 1;
}

export const CHARMS: readonly CharmDef[] = [
  { id: 'float', zh: '红白浮漂', en: 'Red-and-white float', effect: 'none', note: '最普通的浮漂。' },
  { id: 'bell', zh: '小铃铛', en: 'Little bell', effect: 'bell', note: '真咬时响铃并自动提竿（不会是完美提竿）。想边聊边钓时挂它。' },
  { id: 'quick', zh: '灵敏漂', en: 'Quick float', effect: 'window', goal: { kind: 'species', n: 10 }, note: '提竿的时间多四成。' },
  { id: 'glow', zh: '夜光漂', en: 'Glow float', effect: 'night', goal: { kind: 'species', n: 20 }, note: '夜里咬口快四分之一。' },
  { id: 'sinker', zh: '铅坠', en: 'Sinker', effect: 'heavy', goal: { kind: 'species', n: 30 }, note: '更容易引来大个体，小鱼少了。' },
  { id: 'damper', zh: '配重', en: 'Counterweight', effect: 'damp', goal: { kind: 'species', n: 45 }, note: '张力变化慢两成，更好控。' },
  { id: 'twin', zh: '双钩', en: 'Twin hook', effect: 'double', goal: { kind: 'species', n: 60 }, note: '12% 的机会多带上来一条小鱼。' },
  { id: 'lamp', zh: '诱鱼灯', en: 'Lure lamp', effect: 'lamp', goal: { kind: 'species', n: 75 }, note: '把更远处的鱼也引过来。' },
  { id: 'clover', zh: '幸运草', en: 'Clover', effect: 'clover', goal: { kind: 'order', n: 10 }, note: '品相的机会 1.5 倍。' },
  { id: 'magnet', zh: '磁铁', en: 'Magnet', effect: 'magnet', goal: { kind: 'crate', n: 3 }, note: '漂流瓶和木箱多三倍。' },
  { id: 'bighook', zh: '大物钩', en: 'Trophy hook', effect: 'bigHook', goal: { kind: 'golds', n: 10 }, note: '上来的鱼整体偏大，咬口慢一成半。' },
  { id: 'goldhook', zh: '金钩', en: 'Golden hook', effect: 'goldHook', goal: { kind: 'sold', n: 100000 }, note: '鱼卖得贵一成半。' },
];

export const CHARM_INDEX: ReadonlyMap<string, number> = new Map(CHARMS.map((c, i) => [c.id, i]));

/** the tackle box: what each level of a line does, and what it costs */
export const TACKLE: Readonly<Record<TackleLine, { zh: string; per: string; cost: number }>> = {
  line: { zh: '鱼线', per: '红区里多撑 0.1 秒', cost: 1 },
  reel: { zh: '卷线器', per: '收线快 8%', cost: 1.25 },
  hook: { zh: '鱼钩', per: '提竿时间多一成，脱钩慢一成', cost: 0.9 },
  net: { zh: '鱼护', per: '多装几条鱼', cost: 0.7 },
  box: { zh: '饵盒', per: '6% 的机会不耗饵', cost: 1.4 },
};
export const TACKLE_MAX = 5;
const TACKLE_BASE = [500, 2200, 9000, 36000, 140000];

/** the price of the next level of a line (level: the line's level now) */
export function tacklePrice(line: TackleLine, level: number): number {
  if (level >= TACKLE_MAX) return Infinity;
  return Math.round((TACKLE_BASE[level] * TACKLE[line].cost) / 10) * 10;
}

/** how many fish the keepnet holds at a level of its line */
export const NET_SIZE: readonly number[] = [12, 16, 22, 30, 40, 50];
