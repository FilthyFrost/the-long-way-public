/**
 * The emergent Earth's shared measures (docs/V3/plan/emergent-earth.md): a fuzzy band (a trapezoid over a
 * quantity — nothing below its foot, all of it between its shoulders, nothing beyond its other foot) and the
 * kinds the other tables speak of. Pure, DOM-free.
 */

/** a trapezoid [foot, shoulder, shoulder, foot]: 0 outside the feet, 1 between the shoulders, linear between */
export type Trap = readonly [number, number, number, number];

/** how far a value is inside a band, 0 … 1 (no band: 1) */
export function fit(v: number, b: Trap | undefined): number {
  if (!b) return 1;
  const [a, s0, s1, z] = b;
  if (v <= a || v >= z) return v === a && a === s0 ? 1 : v === z && z === s1 ? 1 : 0;
  if (v < s0) return (v - a) / (s0 - a);
  if (v > s1) return (z - v) / (z - s1);
  return 1;
}

/** a band from a range with soft edges `soft` wide on each side */
export const band = (lo: number, hi: number, soft: number): Trap => [lo - soft, lo, hi, hi + soft];

/**
 * How a place's year goes: always wet and warm (the equatorial), a wet and a dry season (the monsoon's, the
 * savanna's), a wet winter and a dry summer (the Mediterranean's), warm summers and cold winters (the
 * continental), mild and wet all year (the oceanic), long dark winters (the polar).
 */
export type SeasonType = 'equatorial' | 'monsoon' | 'mediterranean' | 'continental' | 'oceanic' | 'polar';

/** what water a place has about the road */
export type WaterKind = 'none' | 'river' | 'lake' | 'wetland' | 'coast' | 'oasis' | 'salt';

/** what has happened to a place lately */
export type Disturb = 'none' | 'fire' | 'lava' | 'deglaciated' | 'flood';

/** the lie of the land the road runs through */
export type Context = 'plain' | 'hills' | 'mountain' | 'plateau' | 'basin' | 'valley' | 'coast';

export const SEASON_ZH: Readonly<Record<SeasonType, string>> = {
  equatorial: '终年湿热',
  monsoon: '雨季旱季',
  mediterranean: '冬雨夏干',
  continental: '冬冷夏热',
  oceanic: '温和多雨',
  polar: '长冬',
};
