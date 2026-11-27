/**
 * Wrecks by the road as loot (docs/MODCAR.md §19: Drive Beyond Horizons' crashed cars, Arctic Drive's
 * abandoned ones). Every wreck the world lays out by the road (core/world/sites.ts: where it is, which way it
 * faces, whether it was stripped long ago) is one of our frames with what is left of it, rolled from its id so
 * that it is the same at every visit:
 *
 *  - what is still on it: most of its panels and lamps, a wheel more often than not, three to eight of the rest
 *    (one to four on one stripped long ago);
 *  - what each is: mostly what the works put on, now and then something worse (a rusty door, a three-speed box)
 *    or another car's of the same grade;
 *  - and its finds, the parts worth stopping for: ★3 to ★5 in place of the plain ones, about one wreck in four
 *    by the workshop (a ★5 one wreck in a hundred), one a wreck or so a hundred kilometres on (a ★5 one in
 *    fifteen); one wreck in twelve was something special and has two more;
 *  - in what state (worn, dirty, rusty, caked over), in what colours (each panel its own often enough: a found
 *    car is a patchwork), the dregs in the tank now and then, and a few things left in the boot.
 *
 * Pure data and maths.
 */
import { Rng, hash2 } from '../math/rng';
import { fitSub, newInstance, newUid, removePart, stockBuild, stockPartFor, stockTireFor } from './build';
import { partStars } from './crafting';
import { frameDef } from './frames';
import { BASE_ITEMS, type ItemCat } from './items';
import { BASIC_PAINTS, PALETTE } from './palette';
import { aboardOf } from './aboard';
import { sprayFound } from './paint';
import { keepInsideClean, partDef, PARTS } from './parts';
import { newTool, type Tool } from './tools';
import type { Build, FrameDef, MountDef, PartDef, PartInstance } from './types';

/** the panels and the lamps: most of them still on a wreck */
const SHELL: ReadonlySet<string> = new Set(['door', 'hood', 'trunk', 'bumperFront', 'bumperRear', 'mirror', 'headlight', 'taillight']);

/** how likely each of the shell is still on (one not stripped long ago; one that was, about half as likely) */
const SHELL_KEEP: Record<string, number> = { door: 0.8, hood: 0.88, trunk: 0.82, bumperFront: 0.62, bumperRear: 0.66, mirror: 0.45, headlight: 0.55, taillight: 0.6 };

/** the axles' parts (docs/MODCAR.md §22): still on a wreck, mostly — hard to get at, nobody's first pick */
const CHASSIS_KEEP: Record<string, number> = { suspension: 0.92, brakes: 0.85, diff: 0.88 };

/** a wheel left on a hub (one stripped long ago: on blocks, mostly) */
const WHEEL_KEEP = 0.6;
const WHEEL_KEEP_STRIPPED = 0.22;

/** what only a motorcycle's own fits a motorcycle (its wheels, bars, saddle, box, lever, tank), and a car's nothing of these of a motorcycle's */
const MOTO_OWN: ReadonlySet<string> = new Set(['rim', 'tire', 'steering', 'seat', 'gearbox', 'gearLever', 'fuelTank', 'brakes']);

const FOUR_WHEELS = ['sedan', 'pickup', 'rv', 'rhino', 'buffalo', 'snail', 'fox', 'wagon', 'goat', 'van', 'turtle', 'elephant', 'camel'];

/** the grade of a plain part's roll (★1 … ★3): the works' part, a worse one, another car's */
const PLAIN = [0.28, 0.57, 0.15];

/** what a find goes to, by category: an engine most of all, the wheels, a turbo, the seats … */
const FIND_ON: Partial<Record<string, number>> = {
  engine: 3,
  turbo: 1.6,
  rim: 2,
  tire: 1.8,
  gearbox: 1.4,
  exhaust: 1,
  suspension: 0.9,
  brakes: 0.8,
  diff: 0.7,
  seat: 1,
  steering: 1,
  hood: 1,
  roof: 0.9,
  bumperFront: 0.8,
  radiator: 0.8,
  handbrake: 0.6,
  gearLever: 0.6,
  battery: 0.6,
  headlight: 0.6,
  door: 0.5,
  trunk: 0.4,
  fuelTank: 0.5,
  ignition: 0.5,
  horn: 0.5,
  armor: 0.4,
};

/**
 * The finds of a wreck s metres down the road: how many on average (a few by the workshop, one or two a
 * hundred kilometres on), and the odds of each one's grade (★3, ★4, ★5) — as far as `farM`, where "better the
 * further on" runs out (a hundred kilometres; a world of version 7's two hundred and fifty: loot.ts LootRules)
 */
export function findOdds(s: number, farM = 100_000): { mean: number; grades: [number, number, number] } {
  const k = Math.max(0, Math.min(1, s / farM));
  const lerp = (a: number, b: number): number => a + (b - a) * k;
  return { mean: lerp(0.2, 1.1), grades: [lerp(0.7, 0.42), lerp(0.26, 0.5), lerp(0.04, 0.08)] };
}

/**
 * How good what is found may be, by how far down the road (loot.ts LootRules has the rest): where "better the further
 * on" runs out (m), and the best grade a part may have at s
 */
export interface FindRules {
  readonly farM: number;
  top(s: number): number;
}

/** as it always was: to a hundred kilometres, anything anywhere */
export const FIND_RULES: FindRules = { farM: 100_000, top: () => 5 };

/** a count with this mean (Poisson's, Knuth's way) */
function countOf(r: Rng, mean: number): number {
  const l = Math.exp(-mean);
  let k = 0;
  let p = r.next();
  while (p > l && k < 6) {
    k++;
    p *= r.next();
  }
  return k;
}

/** the frames a part came on from the works (its stock: tags), or is made for (for:, a motorcycle's knobbly tyre) */
function stockFrames(p: PartDef): string[] {
  return (p.tags ?? []).filter((t) => t.startsWith('stock:') || t.startsWith('for:')).map((t) => t.slice(t.indexOf(':') + 1));
}

/**
 * How likely a part is to be found on a mount of a found vehicle (0: never): its own factory part most, a
 * plain one of the aftermarket's or another car's as often, the odd things (a toilet for a seat) seldom, the
 * armour of the bad years now and then. A motorcycle's own never on a car, a car's never on a motorcycle's
 * wheels, bars or saddle; a twin rim only where one was.
 */
export function foundWeight(frame: FrameDef, mount: MountDef, p: PartDef): number {
  if (p.cat !== mount.cat) return 0;
  const from = stockFrames(p);
  const own = from.includes(frame.id);
  if (frame.balance) {
    if (!own && (from.length > 0 || MOTO_OWN.has(p.cat))) return 0;
  } else if (!own && from.length > 0 && !from.some((f) => FOUR_WHEELS.includes(f))) return 0;
  if (p.rim?.dual) {
    const stock = stockPartFor(frame, mount);
    if (!stock || !partDef(stock).rim?.dual) return 0;
  }
  if (own) return 2;
  if (p.tags?.includes('meme')) return 0.15;
  if (p.tags?.includes('apoc')) return 0.5;
  return 1;
}

/** the same for a tyre on a found wheel of this frame */
export function tyreWeight(frame: FrameDef, p: PartDef): number {
  if (p.cat !== 'tire') return 0;
  const from = stockFrames(p);
  const own = from.includes(frame.id);
  if (frame.balance) return own ? 1 : 0;
  if (!own && from.length > 0 && !from.some((f) => FOUR_WHEELS.includes(f))) return 0;
  if (own) return 2;
  if (p.tags?.includes('meme')) return 0.15;
  return 1;
}

type Cand = { id: string; w: number };

/**
 * A part of a grade among weighted ones: the grade asked for, else the nearest to it (below first). A grade
 * offering only odd things is passed over as often as it is odd (a ★1 engine is a lawnmower's: one in seven
 * of those rolls only).
 */
function pickOfGrade(r: Rng, star: number, cands: readonly Cand[]): string | null {
  const order = [star];
  for (let d = 1; d < 5; d++) order.push(star - d, star + d);
  let fallback: string | null = null;
  for (const s of order) {
    if (s < 1 || s > 5) continue;
    const at = cands.filter((c) => partStars(c.id) === s);
    const w = at.reduce((a, c) => a + c.w, 0);
    if (w <= 0) continue;
    const pick = at[r.weighted(at.map((c) => c.w))].id;
    fallback ??= pick;
    if (w >= 1 || r.chance(w)) return pick;
  }
  return fallback;
}

/** one of these (of one grade), weighted; the odd things only as often as they are odd, or none */
function pickExact(r: Rng, cands: readonly Cand[]): string | null {
  const w = cands.reduce((a, c) => a + c.w, 0);
  if (w <= 0 || (w < 1 && !r.chance(w))) return null;
  return cands[r.weighted(cands.map((c) => c.w))].id;
}

/**
 * A plain part on a mount in place of its factory part, for a roll of grade g: the factory part mostly when
 * the roll is its grade (another of that grade the rest of the time), half the time when it is below (a worse
 * part the other half), another of the roll's grade when it is above
 */
function plainPart(r: Rng, g: number, stock: string, cands: () => readonly Cand[]): string {
  const ss = partStars(stock);
  if (g === ss && r.chance(0.75)) return stock;
  if (g < ss && r.chance(0.5)) return stock;
  return pickOfGrade(r, g, cands()) ?? stock;
}

/** what a wreck has on it (its build), and what was left in it: things (item ids) and tools */
export interface WreckRoll {
  build: Build;
  items: string[];
  tools: Tool[];
  /** something special: two more finds */
  special: boolean;
  /** the finds: where, and what (sub: on a wheel or an engine) */
  finds: { mount: string; part: string; sub?: string }[];
}

/** the frames a wreck of each of the world's kinds may be, and how often (0 a saloon's size, 1 a pick-up's, 2 a tall van's, 3 a bus's) */
const WRECK_FRAMES: Record<number, readonly (readonly [string, number])[]> = {
  0: [['moto', 0.1], ['sedan', 0.9], ['wagon', 0.18], ['fox', 0.12]],
  1: [['pickup', 1], ['goat', 0.4], ['buffalo', 0.3]],
  2: [['sedan', 0.55], ['pickup', 0.45], ['van', 0.5]],
  3: [['rv', 1], ['snail', 0.5], ['rhino', 0.35]],
};

/** which frame a wreck of the world's kind is (0 a saloon's size, 1 a pick-up's, 2 a tall van's, 3 a bus's) */
export function wreckFrame(type: number, seed: number): string {
  const u = (hash2(seed | 0, 0xf4a3e, 0x3c) & 0xffff) / 65536;
  const list = WRECK_FRAMES[type] ?? WRECK_FRAMES[0];
  const sum = list.reduce((a, [, w]) => a + w, 0);
  let acc = 0;
  for (const [id, w] of list) {
    acc += w / sum;
    if (u < acc) return id;
  }
  return list[list.length - 1][0];
}

/** the fuel a found vehicle's tank has the dregs of: its engine's, or its frame's factory engine's */
function dregsType(b: Build): 'petrol' | 'diesel' | 'mix2t' {
  for (const inst of Object.values(b.parts)) {
    const e = partDef(inst.part).engine;
    if (e) return e.fuel;
  }
  const f = frameDef(b.frame);
  const m = f.mounts.find((x) => x.cat === 'engine');
  const id = m ? stockPartFor(f, m) : null;
  return id ? (partDef(id).engine?.fuel ?? 'petrol') : 'petrol';
}

/** a found part's state: worn, dirty, rusty, caked over */
function weatherPart(inst: PartInstance, r: Rng): void {
  inst.cond = 0.25 + 0.6 * r.next();
  inst.dirt = 0.5 + 0.45 * r.next();
  inst.rust = 0.15 + 0.55 * r.next();
  inst.crust = 0.1 + 0.45 * r.next();
  // (what goes inside a car is clean however it was found: docs/V3/plan/hands.md §五)
  keepInsideClean(inst);
}

/** a new part in place of what is on a mount (a panel takes the frame's shape; a wheel keeps its tyre) */
function swapIn(b: Build, f: FrameDef, mount: string, id: string): PartInstance {
  const was = b.parts[mount];
  if (was?.part === id) return was;
  const inst = newInstance(id);
  const m = f.mounts.find((x) => x.id === mount)!;
  if (m.cat === 'door' || m.cat === 'hood' || m.cat === 'trunk') inst.shapeOf = f.id;
  if (was?.sub.tire && partDef(id).rim?.tire) fitSub(inst, 'tire', was.sub.tire);
  if (was?.sub.turbo && partDef(id).engine?.turbo) fitSub(inst, 'turbo', was.sub.turbo);
  b.parts[mount] = inst;
  return inst;
}

/**
 * The wreck with this seed (its id's hash), of the world's kind `type`, stripped long ago or not, lying `s`
 * metres down the road (its finds). A vehicle to find (`find`: one of the plan's, docs/V3/plan/growth.md §六 2) keeps its
 * driver's seat — one gets into it to make it one's own — and is otherwise the same.
 */
export function rollWreck(seed: number, type: number, stripped: boolean, s: number, find = false, rules: FindRules = FIND_RULES): WreckRoll {
  const r = new Rng(hash2(seed | 0, 0x5eed, 0x3c));
  // (the best a part may be this far down the road: a world of version 7 has no ★3 before its 20th kilometre)
  const cap = rules.top(s);
  const frameId = wreckFrame(type, seed);
  const f = frameDef(frameId);
  const b = stockBuild(frameId, { fuel: 0 });
  b.uid = newUid('b');
  const special = r.chance(0.08);
  const plain = (): number => Math.min(Math.max(1, cap), 1 + r.weighted(PLAIN));
  // ---- what is still on it: most of the shell, a wheel more often than not, three to eight of the rest
  const works: string[] = [];
  for (const m of f.mounts) {
    if (!b.parts[m.id]) continue;
    if (SHELL.has(m.cat)) {
      if (!r.chance((SHELL_KEEP[m.cat] ?? 0.6) * (stripped ? 0.5 : 1))) removePart(b, m.id);
    } else if (m.cat === 'rim') {
      if (!r.chance(stripped ? WHEEL_KEEP_STRIPPED : WHEEL_KEEP)) removePart(b, m.id);
    } else if (CHASSIS_KEEP[m.cat] !== undefined) {
      if (!r.chance(CHASSIS_KEEP[m.cat] * (stripped ? 0.6 : 1))) removePart(b, m.id);
    } else works.push(m.id);
  }
  const keep = stripped ? 1 + r.int(4) : 3 + r.int(6);
  for (let i = works.length - 1; i > 0; i--) {
    const j = r.int(i + 1);
    [works[i], works[j]] = [works[j], works[i]];
  }
  for (const id of works.slice(keep)) removePart(b, id);
  // ---- what each is: mostly the works' own (a car's wheels a set: one choice for an axle's rims, one for the tyres)
  b.paint = r.int(PALETTE.length);
  b.paint2 = r.int(PALETTE.length);
  const candsOf = (m: MountDef): Cand[] => PARTS.map((p) => ({ id: p.id, w: foundWeight(f, m, p) })).filter((c) => c.w > 0);
  const tyres: Cand[] = PARTS.map((p) => ({ id: p.id, w: tyreWeight(f, p) })).filter((c) => c.w > 0);
  const rimFor = new Map<string, string>();
  const stockTyre = stockTireFor(f) ?? 'tire_road';
  const carTyre = plainPart(r, plain(), stockTyre, () => tyres);
  for (const m of f.mounts) {
    const was = b.parts[m.id];
    if (!was) continue;
    const stock = stockPartFor(f, m);
    let id = was.part;
    if (stock && m.cat === 'rim') {
      id = rimFor.get(stock) ?? plainPart(r, plain(), stock, () => candsOf(m));
      rimFor.set(stock, id);
    } else if (stock && (!SHELL.has(m.cat) || r.chance(0.4))) id = plainPart(r, plain(), stock, () => candsOf(m));
    const inst = swapIn(b, f, m.id, id);
    if (partDef(inst.part).rim?.tire) {
      // (now and then a spare of another kind on one wheel)
      const tid = r.chance(0.12) ? (pickOfGrade(r, plain(), tyres) ?? carTyre) : carTyre;
      if (tid !== inst.sub.tire?.part) fitSub(inst, 'tire', newInstance(tid));
    }
  }
  // ---- its finds: the parts worth stopping for, in place of plain ones (a whole set of wheels at once)
  const fo = findOdds(s, rules.farM);
  const n = cap >= 3 ? countOf(r, fo.mean) + (special ? 2 : 0) : 0;
  const finds: WreckRoll['finds'] = [];
  /** a find of grade g somewhere on it: a part on it, a set of tyres, a turbo, the roof or armour it came without */
  const placeFind = (g: number): boolean => {
    const spots: { mount: string; sub?: 'tire' | 'turbo'; w: number }[] = [];
    for (const m of f.mounts) {
      const inst = b.parts[m.id];
      if (inst) {
        spots.push({ mount: m.id, w: FIND_ON[m.cat] ?? 0.3 });
        const d = partDef(inst.part);
        if (d.rim?.tire) spots.push({ mount: m.id, sub: 'tire', w: (FIND_ON.tire ?? 1) / 2 });
        if (d.engine?.turbo && !inst.sub.turbo) spots.push({ mount: m.id, sub: 'turbo', w: FIND_ON.turbo ?? 1 });
      } else if ((m.cat === 'roof' || m.cat === 'armor') && !stockPartFor(f, m) && !f.balance) spots.push({ mount: m.id, w: (FIND_ON[m.cat] ?? 0.3) / 2 });
    }
    if (!spots.length) return true;
    const at = spots[r.weighted(spots.map((x) => x.w))];
    const m = f.mounts.find((x) => x.id === at.mount)!;
    const inst = b.parts[m.id];
    if (at.sub === 'turbo') {
      if (partStars('turbo_small') !== g) return false;
      fitSub(inst, 'turbo', newInstance('turbo_small'));
      finds.push({ mount: m.id, part: 'turbo_small', sub: 'turbo' });
      return true;
    }
    if (at.sub === 'tire') {
      // (a set of better tyres on every wheel)
      const tid = pickExact(r, tyres.filter((c) => partStars(c.id) === g));
      if (!tid) return false;
      let on = '';
      for (const w of f.mounts) {
        const wi = b.parts[w.id];
        if (!wi || !partDef(wi.part).rim?.tire || partStars(wi.sub.tire?.part ?? '') >= g) continue;
        fitSub(wi, 'tire', newInstance(tid));
        on ||= w.id;
      }
      if (!on) return false;
      finds.push({ mount: on, part: tid, sub: 'tire' });
      return true;
    }
    const id = pickExact(r, candsOf(m).filter((c) => partStars(c.id) === g && (!inst || g > partStars(inst.part))));
    if (!id) return false;
    if (m.cat === 'rim') {
      // (the whole set: every hub that had the same wheel and takes this one — twin rims only where twins were)
      const old = inst.part;
      const pd = partDef(id);
      for (const w of f.mounts) if (b.parts[w.id]?.part === old && foundWeight(f, w, pd) > 0) swapIn(b, f, w.id, id);
    } else swapIn(b, f, m.id, id);
    finds.push({ mount: m.id, part: id });
    return true;
  };
  for (let i = 0; i < n; i++) {
    // (its grade first; then a spot that has something of that grade: a ★3 bonnet there is not)
    const g = Math.min(cap, 3 + r.weighted(fo.grades));
    for (let tries = 0; tries < 6; tries++) if (placeFind(g)) break;
  }
  // (a find a later one took the place of is not one any more)
  const found = finds.filter((x, i) => (x.sub ? b.parts[x.mount]?.sub[x.sub]?.part : b.parts[x.mount]?.part) === x.part && finds.findIndex((y) => y.mount === x.mount && y.sub === x.sub && y.part === x.part) === i);
  // ---- in what state, what colours, what is left in it
  for (const m of f.mounts) {
    const inst = b.parts[m.id];
    if (!inst) continue;
    weatherPart(inst, r);
    const d = partDef(inst.part);
    const t = inst.sub.tire;
    if (t) {
      weatherPart(t, r);
      t.tread = 0.05 + 0.65 * r.next();
      t.flat = r.chance(0.28);
    }
    if (inst.sub.turbo) weatherPart(inst.sub.turbo, r);
    if (SHELL.has(m.cat) && r.chance(0.5)) inst.paint = r.int(PALETTE.length);
    if (d.engine && d.engine.oilL > 0) inst.fluids.oilL = d.engine.oilL * (0.1 + 0.6 * r.next());
    if (d.radiator) inst.fluids.coolantL = d.radiator.coolantL * 0.5 * r.next();
    if (d.battery) inst.fluids.charge = 0.02 + 0.38 * r.next();
  }
  // (the dregs in the tank, four times in ten)
  for (const inst of Object.values(b.parts)) {
    const t = partDef(inst.part).fuelTank;
    if (t) inst.fluids.fuel = r.chance(0.4) ? { [dregsType(b)]: Math.min(t.litres, Math.round((1 + 7 * r.next()) * 10) / 10) } : {};
  }
  b.cond = 0.3 + 0.5 * r.next();
  b.dirt = 0.55 + 0.4 * r.next();
  b.rust = 0.25 + 0.45 * r.next();
  b.crust = 0.15 + 0.4 * r.next();
  // ---- what was left in it (a motorcycle has nowhere to leave anything)
  const items: string[] = [];
  const tools: Tool[] = [];
  if (!f.balance) {
    const k = r.chance(stripped ? 0.6 : 0.3) ? 0 : 1 + r.int(stripped ? 1 : 3);
    const cats: ItemCat[] = ['food', 'drink', 'med', 'junk', 'crate', 'wear', 'gear', 'pack', 'lamp'];
    const w = [3, 3, 1.4, 1.6, 2.2, 1.2, 0.45, 0.25, 0.3];
    for (let i = 0; i < k; i++) {
      const cat = cats[r.weighted(w)];
      // (the better things further on, like the parts)
      const top = r.chance(fo.mean / 3) ? 3 + r.weighted(fo.grades) : plain();
      const list = BASE_ITEMS.filter((it) => it.cat === cat && it.stars <= top && it.carry !== 'large');
      if (list.length) items.push(r.pick(list).id);
    }
    // a spray can rolled under a seat, a jerrycan with a drop in it
    if (r.chance(0.14)) {
      const tier = r.chance(0.8) ? 1 : 2;
      const colour = tier === 1 ? r.pick(BASIC_PAINTS) : r.int(PALETTE.length);
      tools.push(newTool('spray', { tier, colour, paint: sprayFound(tier, r.next()) }));
    }
    if (r.chance(0.08)) tools.push(newTool('jerrycan', { fuel: dregsType(b) === 'diesel' ? 'diesel' : 'petrol', litres: Math.round(4 * r.next() * 10) / 10 }));
  }
  // (a vehicle to find: its driver's seat back in if it went, worn as the rest — nothing else of it changed)
  if (find) {
    const dm = f.mounts.find((m) => m.driver);
    const stock = dm ? stockPartFor(f, dm) : null;
    if (dm && stock && !b.parts[dm.id]) weatherPart(swapIn(b, f, dm.id, stock), new Rng(hash2(seed | 0, 0x5ea7, 0x1d)));
  }
  return { build: b, items, tools, special, finds: found };
}

/**
 * A vehicle to find (docs/V3/plan/growth.md §六 2): a bare frame standing in a big place's yard. On it what is under its
 * floor, its seats and controls, and each panel of its body seven times in ten — the ones gone come down the road after
 * it (`missing`: the plan puts each 2–6 km on: schedule.ts vehicleExtras); beside it a set of parts to put in it, of
 * the plan's tier (2: used, 3: good): its engine, its radiator, its battery, its wheels (`beside`). No radio: that is
 * found. Old, all of it, as one finds things; the same for the same seed.
 */
export interface FoundRoll {
  build: Build;
  beside: { mount: string; inst: PartInstance }[];
  missing: { mount: string; part: string }[];
}

/** what of a found frame lies beside it rather than on it */
const BESIDE: ReadonlySet<string> = new Set(['engine', 'radiator', 'battery', 'rim']);

/** what of a found frame is on it, beside it and missing — the roll's first draws (cheap: no parts made) */
export function foundLayout(frameId: string, seed: number): { r: Rng; without: string[]; beside: { mount: string; id: string }[]; missing: { mount: string; part: string }[] } {
  const r = new Rng(hash2(seed | 0, 0xf07d, 0x2));
  const f = frameDef(frameId);
  const without: string[] = [];
  const beside: { mount: string; id: string }[] = [];
  const missing: { mount: string; part: string }[] = [];
  // (a trailer is found whole: its wheels and its door on it — nothing to put on it but what goes in it)
  if (f.towed) return { r, without, beside, missing };
  for (const m of f.mounts) {
    const id = stockPartFor(f, m);
    if (!id) continue;
    if (m.cat === 'radio') without.push(m.id);
    else if (BESIDE.has(m.cat)) {
      without.push(m.id);
      beside.push({ mount: m.id, id });
    } else if (SHELL.has(m.cat) && !r.chance(0.7)) {
      without.push(m.id);
      missing.push({ mount: m.id, part: id });
    }
  }
  return { r, without, beside, missing };
}

export function rollFound(frameId: string, seed: number, tier: number): FoundRoll {
  const { r, without, beside, missing } = foundLayout(frameId, seed);
  const f = frameDef(frameId);
  const b = stockBuild(frameId, { fuel: 0, without });
  b.uid = newUid('b');
  // (the frame and what is on it: worn as a wreck's, a little less)
  for (const inst of Object.values(b.parts)) {
    weatherPart(inst, r);
    inst.cond = Math.max(inst.cond, 0.4 + 0.3 * r.next());
  }
  // (any two colours — but a motorhome is found in its own: the Turtle's teal and cream, the Old Elephant's tan and
  // ivory, the Camel's school-bus yellow are what they are known by. The two are rolled all the same, so the rest
  // of the roll is as it was.)
  const paint = r.int(PALETTE.length);
  const paint2 = r.int(PALETTE.length);
  // (the motorhomes: a frame with a living space and a way into it from its seats — not a truck's box or a trailer's,
  // rooms one walks into since docs/V3/plan/finish.md §十一 1, found in any colours as ever)
  if (!aboardOf(frameId)?.aft) {
    b.paint = paint;
    b.paint2 = paint2;
  }
  b.cond = 0.4 + 0.4 * r.next();
  b.dirt = 0.45 + 0.4 * r.next();
  b.rust = 0.2 + 0.4 * r.next();
  b.crust = 0.1 + 0.3 * r.next();
  // (what lies beside it: the tier's — 2 used, 3 good — the wheels with tyres on, the engine with some oil in it)
  const lo = tier >= 3 ? 0.7 : 0.55;
  const span = tier >= 3 ? 0.25 : 0.25;
  const tyre = stockTireFor(f) ?? 'tire_road';
  const parts = beside.map(({ mount, id }) => {
    const d = partDef(id);
    const inst = newInstance(id, { charge: d.battery ? 0.3 + 0.3 * r.next() : undefined, oil: d.engine ? 0.6 + 0.3 * r.next() : undefined, coolant: 0 });
    inst.cond = lo + span * r.next();
    inst.dirt = 0.2 + 0.4 * r.next();
    if (d.rim?.tire) {
      const t = newInstance(tyre);
      t.tread = tier >= 3 ? 0.75 + 0.2 * r.next() : 0.55 + 0.3 * r.next();
      t.cond = lo + span * r.next();
      fitSub(inst, 'tire', t);
    }
    keepInsideClean(inst);
    return { mount, inst };
  });
  return { build: b, beside: parts, missing };
}

/** the grades on a build (its parts and what is on them), best first, where: for a glint, for the reveal */
export function gradesOn(b: Build, mounts?: readonly string[]): { mount: string; part: string; star: number }[] {
  const out: { mount: string; part: string; star: number }[] = [];
  for (const [mount, inst] of Object.entries(b.parts)) {
    if (mounts && !mounts.includes(mount)) continue;
    out.push({ mount, part: inst.part, star: partStars(inst.part) });
    for (const sub of Object.values(inst.sub)) out.push({ mount, part: sub.part, star: partStars(sub.part) });
  }
  return out.sort((a, c) => c.star - a.star);
}

/** a part worth stopping for on a vehicle of this frame: ★4 or better and not what the works put on it */
export function isRare(frame: string, part: string): boolean {
  return partStars(part) >= 4 && !partDef(part).tags?.includes(`stock:${frame}`);
}
