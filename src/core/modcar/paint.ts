/**
 * Spray paint as Arctic Drive has it (docs/MODCAR.md §16). A can is one colour, in one of three sizes, and
 * holds so much paint. Held on something that takes paint — a vehicle's body (one thing, windows and all), or
 * one of its doors, its bonnet, its boot lid, a bumper, a mirror (each a thing of its own, on the vehicle or
 * lying about) — with the button down, that thing's colour goes over evenly from what it was to the can's,
 * in 2 to 4 seconds by the size of the can, and the can empties by one unit a second while it does. A thing
 * already that colour costs nothing; one left half-done keeps its in-between colour and goes on from there;
 * a different colour starts over from the colour it is now. An empty can stays in the hand (the recycler
 * takes it). Engines, seats, wheels, lamps take no paint.
 *
 * The paint is the thing's colour, not a layer: the dust, the crust and the rust lie on top of it as before,
 * so a dirty part painted is a dirty part of another colour (scrape it clean first).
 */
import { frameDef } from './frames';
import { BASIC_PAINTS, PAINT_YELLOW, PALETTE, paintHex } from './palette';
import { partDef } from './parts';
import type { Tool } from './tools';
import type { Build, PaintMix, Text } from './types';

export type SprayTier = 1 | 2 | 3;

export interface SprayTierDef {
  /** public/models/modcar/tools/<model>.glb */
  model: string;
  name: Text;
  /** units of paint a full can holds */
  capacity: number;
  /** what a can found lying about has in it: a whole number of units in [min, max] */
  found: [number, number];
  /** how much of a coat goes on a second (1/s): one thing takes 1 / speed seconds, and as many units */
  speed: number;
  stars: number;
  /** kg */
  mass: number;
}

/** Arctic Drive's three cans (Lv1 / Lv2 / Lv3): 10 units at 0.25, 50 at 0.35, 100 at 0.5 */
export const SPRAY_TIERS: Record<SprayTier, SprayTierDef> = {
  1: { model: 'spray_s', name: { zh: '小喷漆罐', en: 'Small spray can' }, capacity: 10, found: [2, 10], speed: 0.25, stars: 1, mass: 0.35 },
  2: { model: 'spray', name: { zh: '喷漆罐', en: 'Spray can' }, capacity: 50, found: [15, 50], speed: 0.35, stars: 2, mass: 0.35 },
  3: { model: 'spray_l', name: { zh: '大喷漆罐', en: 'Large spray can' }, capacity: 100, found: [50, 100], speed: 0.5, stars: 4, mass: 0.4 },
};

/** units a can uses a second while the coat is still going on */
export const SPRAY_DRAIN = 1;

/**
 * The nozzles a can is sprayed through (docs/V3/plan/growth.md §1.5, J3; the wheel goes through them, as Nomad
 * Drive's seven steps do): how wide the spray lands (its radius, m), how fast it covers what is under its middle
 * (1/s: a steady pass leaves about seven tenths of a coat, two or three a whole one), and the paint it uses a
 * second while the button is down, on something or not.
 */
export interface Nozzle {
  zh: string;
  r: number;
  rate: number;
  use: number;
}
export const NOZZLES: readonly Nozzle[] = [
  // (Nomad Drive's seven, 9 to 72 cm across, the wheel a size a notch; the paint by the area: docs/V3/plan/hands.md §六)
  { zh: '9 厘米', r: 0.045, rate: 6, use: 0.19 },
  { zh: '18 厘米', r: 0.09, rate: 6, use: 0.75 },
  { zh: '27 厘米', r: 0.135, rate: 6, use: 1.7 },
  { zh: '36 厘米', r: 0.18, rate: 6, use: 3 },
  { zh: '48 厘米', r: 0.24, rate: 6, use: 5.3 },
  { zh: '60 厘米', r: 0.3, rate: 6, use: 8.3 },
  { zh: '72 厘米', r: 0.36, rate: 6, use: 12 },
  // (the garage's paint gun hooked to the can: wider still, twice as fast, half the paint for the area)
  { zh: '喷枪 90 厘米', r: 0.45, rate: 12, use: 9.4 },
];

/** the nozzles a can has of its own (the gun's is the garage's) */
export const CAN_NOZZLES = 7;

/** the gun's nozzle, while the can is hooked to it */
export const GUN_NOZZLE = 7;

/** a can's nozzle as it comes: 36 cm */
export const DEFAULT_NOZZLE = 3;

/** the nozzle a can is set to */
export function nozzleOf(t: Pick<Tool, 'nozzle'>): Nozzle {
  return NOZZLES[Math.max(0, Math.min(NOZZLES.length - 1, t.nozzle ?? DEFAULT_NOZZLE))];
}

/** so many seconds of the button down: the paint it takes from the can (units; less when there is less) */
export function sprayUse(can: Tool, dt: number): number {
  const left = sprayLeft(can);
  const used = Math.min(left, nozzleOf(can).use * dt);
  can.paint = left - used;
  return used;
}

/** the categories that take paint (and wear the body's colour until painted on their own) */
export const PAINTED_CATS: ReadonlySet<string> = new Set(['door', 'hood', 'trunk', 'bumperFront', 'bumperRear', 'mirror']);

/** a door, a bonnet, a boot lid of these styles is not the body's colour (armour plate, a fridge's door) or has no skin (a cage) */
const OWN_FINISH: ReadonlySet<string> = new Set(['armor', 'fridge', 'cage']);

/** does a part take paint (a cage door has nothing to paint) */
export function takesPaint(partId: string): boolean {
  const d = partDef(partId);
  return PAINTED_CATS.has(d.cat) && d.panel?.style !== 'cage';
}

/** the colours each size comes in: the small in the eight plain ones, the medium in every colour, the large in the plain ones but the yellow */
export function sprayColours(tier: SprayTier): readonly number[] {
  if (tier === 2) return PALETTE.map((_, i) => i);
  return tier === 1 ? BASIC_PAINTS : BASIC_PAINTS.filter((i) => i !== PAINT_YELLOW);
}

export function sprayTier(t: Pick<Tool, 'tier'>): SprayTier {
  return t.tier ?? 2;
}

/** the paint left in a can (units; a can without the figure is full) */
export function sprayLeft(t: Pick<Tool, 'tier' | 'paint'>): number {
  return Math.max(0, t.paint ?? SPRAY_TIERS[sprayTier(t)].capacity);
}

/** a can found lying about: a whole number of units in its size's range, r (0…1) the draw */
export function sprayFound(tier: SprayTier, r: number): number {
  const [a, b] = SPRAY_TIERS[tier].found;
  return Math.min(b, a + Math.floor(Math.max(0, Math.min(0.999999, r)) * (b - a + 1)));
}

/** what the recycler gives for a can: 1 scrap for a small one or a medium in a plain colour, 5 for a large one or a medium in another colour (Arctic Drive's) */
export function spraySalvage(t: Pick<Tool, 'tier' | 'colour'>): number {
  const tier = sprayTier(t);
  if (tier === 1) return 1;
  if (tier === 3) return 5;
  return BASIC_PAINTS.includes(t.colour ?? 0) ? 1 : 5;
}

/** two sRGB hex colours mixed, channel by channel (t = 0: a, 1: b) */
export function mixHex(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const ch = (s: number): number => {
    const x = (a >> s) & 255;
    const y = (b >> s) & 255;
    return Math.round(x + (y - x) * k);
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** what takes paint: its palette index (−1: its own finish) and the coat going on */
export interface Paintable {
  paint: number;
  paintMix?: PaintMix;
}

/** the colour it shows now (sRGB hex): its paint, or on its way there from where it started; `own` = what −1 shows */
export function paintNow(p: Paintable, own: number): number {
  const to = p.paint >= 0 ? paintHex(p.paint, own) : own;
  const m = p.paintMix;
  return m && m.t < 1 ? mixHex(m.from, to, m.t) : to;
}

/** how far along the coat of a colour is on it (1: it is that colour) */
export function coatOf(p: Paintable, colour: number): number {
  return p.paint !== colour ? 0 : p.paintMix ? p.paintMix.t : 1;
}

/** what a moment of spraying did */
export interface SprayResult {
  /** how far along the coat is (0…1) */
  t: number;
  /** units of paint it took */
  used: number;
  /** the coat came whole this moment */
  done: boolean;
  /** nothing to do: it is the can's colour already */
  already: boolean;
  /** the can is empty (it was, or it ran dry now) */
  empty: boolean;
}

/**
 * A can sprayed at something for dt seconds (Arctic Drive's order: the coat goes on first, then the can is
 * drawn on, but only while the coat is not yet whole — the moment it comes whole costs nothing). `now`: the
 * colour it shows now (sRGB hex), where a new coat starts from. `rate`: how many times as fast (a spray gun),
 * the paint going as much faster.
 */
export function sprayStep(can: Tool, p: Paintable, now: number, dt: number, rate = 1): SprayResult {
  const colour = can.colour ?? 0;
  const left = sprayLeft(can);
  if (p.paint === colour && !p.paintMix) return { t: 1, used: 0, done: false, already: true, empty: left <= 0 };
  if (left <= 0) return { t: coatOf(p, colour), used: 0, done: false, already: false, empty: true };
  if (p.paint !== colour) {
    p.paint = colour;
    // (it shows that colour already, its own finish: then it simply is it)
    if (now === paintHex(colour)) {
      delete p.paintMix;
      return { t: 1, used: 0, done: false, already: true, empty: false };
    }
    p.paintMix = { from: now, t: 0 };
  }
  const m = p.paintMix!;
  m.t = Math.min(1, m.t + dt * rate * SPRAY_TIERS[sprayTier(can)].speed);
  let used = 0;
  if (m.t < 1) {
    used = Math.min(left, dt * rate * SPRAY_DRAIN);
    can.paint = left - used;
  } else {
    delete p.paintMix;
    if (can.paint === undefined) can.paint = left;
  }
  return { t: m.t, used, done: m.t >= 1, already: false, empty: sprayLeft(can) <= 1e-9 };
}

/**
 * Before the body takes a coat of its own: the doors, the lids, the bumpers and the mirrors that wear its
 * colour (−1) keep the colour they have now — each is painted on its own (a door of another style keeps its finish).
 */
export function keepPartColours(build: Build): void {
  for (const m of frameDef(build.frame).mounts) {
    const inst = build.parts[m.id];
    if (!inst || inst.paint >= 0 || !PAINTED_CATS.has(m.cat)) continue;
    const style = partDef(inst.part).panel?.style;
    if (style && OWN_FINISH.has(style)) continue;
    inst.paint = build.paint;
    if (build.paintMix) inst.paintMix = { ...build.paintMix };
  }
}

/** how many things of a vehicle take paint: the body and every painted part on it */
export function paintTargets(build: Build): { mount: string | null }[] {
  const out: { mount: string | null }[] = [{ mount: null }];
  for (const m of frameDef(build.frame).mounts) {
    const inst = build.parts[m.id];
    if (inst && PAINTED_CATS.has(m.cat) && takesPaint(inst.part)) out.push({ mount: m.id });
  }
  return out;
}
