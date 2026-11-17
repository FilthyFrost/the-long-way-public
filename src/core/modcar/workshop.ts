/**
 * The workshop's machines as states and rules (docs/MODCAR.md §14), on Arctic Drive's numbers:
 *
 *   the diesel generator  its own tank (10 L); it burns the same whatever it powers (the garage's old one 0.001 L/s,
 *                         3 L for 50 minutes; the ones met down the road 0.005 L/s); pulled into life with its rope
 *                         (a cold engine may need a second pull, never more than three); petrol in it does what it
 *                         does in our diesels — from a 30 % share it coughs and dies, a little burns more
 *   the recycler          each thing glides over the hopper for the first 30 % of 2.4 s and is ground down 0.3 m for
 *                         the rest, shrinking away; several at once; its materials counted up as it goes; with the
 *                         power off what is in the hopper waits
 *   the bench             its hammer's blow: wind-up 0.3 s, the strike 0.1 s, back 0.22 s; the new thing there a
 *                         second after the last blow
 *
 * Pure data and maths, no three, no DOM.
 */
import { addTo, type Cost, type Stock } from './crafting';
import { MATERIAL_IDS } from './items';
import { tankLitres, type FuelTank } from './tools';
import type { FuelType, Text } from './types';

// ------------------------------------------------------------------ the generator

export interface GeneratorSpec {
  /** litres its tank holds */
  tankL: number;
  /** litres a second while it runs */
  burn: number;
}

/** the old one by the workshop (Arctic Drive's starting generator burns a fifth of the others') */
export const GARAGE_GENERATOR: GeneratorSpec = { tankL: 10, burn: 0.001 };
/** one met down the road */
export const ROADSIDE_GENERATOR: GeneratorSpec = { tankL: 10, burn: 0.005 };

export interface GeneratorState {
  tank: FuelTank;
  on: boolean;
  /** 0 warm … 1 cold: how likely a pull is to fail */
  cold: number;
  /** pulls since it last ran: the third always catches when it can */
  pulls: number;
}

export function newGenerator(spec: GeneratorSpec, litres = 0, fuel: FuelType = 'diesel'): GeneratorState {
  return { tank: { capacity: spec.tankL, fuel: litres > 0 ? { [fuel]: litres } : {} }, on: false, cold: 1, pulls: 0 };
}

/** how it gets on with what is in its tank: the wrong fuel's share, whether it runs at all, how much more it burns */
export function generatorFuel(g: GeneratorState): { empty: boolean; runs: boolean; wrong: number; burnK: number; why?: Text } {
  const total = tankLitres(g.tank);
  if (total <= 0.005) return { empty: true, runs: false, wrong: 0, burnK: 1, why: { zh: '油箱是空的：拿柴油桶来加', en: 'The tank is empty: bring the diesel can' } };
  const wrong = ((g.tank.fuel.petrol ?? 0) + (g.tank.fuel.mix2t ?? 0)) / total;
  if (wrong >= 0.3) return { empty: false, runs: false, wrong, burnK: 1, why: { zh: '柴油机里是汽油：突突两下就熄', en: 'Petrol in a diesel: it coughs twice and dies' } };
  // (Arctic Drive's mixtures: a little of the wrong one, a quarter more; more of it, half as much again)
  const burnK = wrong <= 0.1 ? 1 : wrong <= 0.2 ? 1.25 : 1.5;
  return { empty: false, runs: true, wrong, burnK };
}

/** one pull of the rope: it catches, it fires and dies (the wrong fuel), or it only turns over (no fuel) */
export function pullCord(g: GeneratorState, roll: number): 'caught' | 'cough' | 'turn' {
  if (g.on) return 'caught';
  const f = generatorFuel(g);
  if (f.empty) return 'turn';
  if (!f.runs) return 'cough';
  const chance = 1 - 0.65 * g.cold;
  if (g.pulls >= 2 || roll < chance) {
    g.on = true;
    g.pulls = 0;
    return 'caught';
  }
  g.pulls++;
  // (each pull that does not catch turns it over and warms it a little)
  g.cold = Math.max(0, g.cold - 0.3);
  return 'turn';
}

export function stopGenerator(g: GeneratorState): void {
  g.on = false;
  g.pulls = 0;
}

/** step it by dt: running, it burns its fuel (each kind by its share) and warms up; off, it cools. 'dry' when it ran out */
export function stepGenerator(g: GeneratorState, spec: GeneratorSpec, dt: number): '' | 'dry' | 'choked' {
  if (!g.on) {
    g.cold = Math.min(1, g.cold + dt / 1200);
    return '';
  }
  const f = generatorFuel(g);
  if (!f.runs) {
    g.on = false;
    return f.empty ? 'dry' : 'choked';
  }
  const total = tankLitres(g.tank);
  const burn = Math.min(total, spec.burn * f.burnK * dt);
  for (const k of Object.keys(g.tank.fuel) as FuelType[]) g.tank.fuel[k] = Math.max(0, (g.tank.fuel[k] ?? 0) - (burn * (g.tank.fuel[k] ?? 0)) / total);
  g.cold = Math.max(0, g.cold - dt / 60);
  if (tankLitres(g.tank) <= 0.005) {
    g.on = false;
    return 'dry';
  }
  return '';
}

/** how long it runs on what it has (s) */
export function generatorLeft(g: GeneratorState, spec: GeneratorSpec): number {
  const f = generatorFuel(g);
  return f.runs ? tankLitres(g.tank) / (spec.burn * f.burnK) : 0;
}

// ------------------------------------------------------------------ the recycler

export const RECYCLE = {
  /** seconds a thing takes to go in */
  ingestS: 2.4,
  /** the share of it spent gliding over the hopper (the rest: ground down) */
  glide: 0.3,
  /** how far down it is ground (m), and what is left of its size at the end */
  depth: 0.3,
  endScale: 0.04,
  /** how high over the hopper it glides (m) */
  hover: 0.06,
  /** the tally pops every so many units */
  tallyStep: 5,
};

/** a thing going into the recycler */
export interface Ingest {
  /** 0 … 1 of the way through */
  t: number;
  /** what it gives, and what of that has been counted so far */
  yield: Cost;
  paid: Cost;
}

export function newIngest(y: Cost): Ingest {
  return { t: 0, yield: { ...y }, paid: {} };
}

/** step what is going in by dt (nothing moves without power): the materials newly counted, and those finished */
export function stepIngests(list: Ingest[], dt: number, powered: boolean): { add: Cost; done: Ingest[] } {
  const add: Cost = {};
  const done: Ingest[] = [];
  if (!powered) return { add, done };
  for (const g of list) {
    g.t = Math.min(1, g.t + dt / RECYCLE.ingestS);
    // counted up as it is ground
    const k = Math.max(0, Math.min(1, (g.t - RECYCLE.glide) / (1 - RECYCLE.glide)));
    for (const m of MATERIAL_IDS) {
      const due = g.t >= 1 ? (g.yield[m] ?? 0) : Math.floor((g.yield[m] ?? 0) * k);
      const n = due - (g.paid[m] ?? 0);
      if (n > 0) {
        add[m] = (add[m] ?? 0) + n;
        g.paid[m] = due;
      }
    }
    if (g.t >= 1) done.push(g);
  }
  for (const g of done) list.splice(list.indexOf(g), 1);
  return { add, done };
}

/** the rest of what is going in, all at once (a save taken half way through) */
export function flushIngests(list: Ingest[], stock: Stock): void {
  for (const g of list) {
    const rest: Cost = {};
    for (const m of MATERIAL_IDS) rest[m] = (g.yield[m] ?? 0) - (g.paid[m] ?? 0);
    addTo(stock, rest);
  }
  list.length = 0;
}

/**
 * Where a thing going in is (relative to the hopper's mouth): over it while gliding (`toMouth` 0 … 1 of the way
 * from where it left the hands), then down into it and shrinking; a little wobble while it is ground.
 */
export function ingestPose(t: number, seed: number): { toMouth: number; down: number; scale: number; wobble: number; tilt: number } {
  const g = RECYCLE.glide;
  if (t < g) {
    const k = t / g;
    return { toMouth: k * k * (3 - 2 * k), down: -RECYCLE.hover, scale: 1, wobble: 0, tilt: 0 };
  }
  const k = (t - g) / (1 - g);
  // (Perlin-ish: two sines a seed apart)
  const w = Math.sin(t * 61 + seed) * 0.6 + Math.sin(t * 37 + seed * 2.3) * 0.4;
  return { toMouth: 1, down: -RECYCLE.hover + (RECYCLE.hover + RECYCLE.depth) * k, scale: 1 - (1 - RECYCLE.endScale) * k, wobble: 0.012 * w, tilt: ((5 * Math.PI) / 180) * w };
}

// ------------------------------------------------------------------ the bench's hammer

export const CRAFT = {
  /** the blow: winding up, striking, coming back (s) */
  windup: 0.3,
  impact: 0.1,
  recovery: 0.22,
  /** the new thing is there this long after the last blow (s) */
  completion: 1.0,
};

/** how long one blow takes */
export const BLOW_S = CRAFT.windup + CRAFT.impact + CRAFT.recovery;
