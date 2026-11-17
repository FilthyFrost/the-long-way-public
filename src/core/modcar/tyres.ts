/**
 * Tyre wear as Drive Beyond Horizons has it (docs/MODCAR.md §18): every tyre wears on its own, through four stages
 * — new, a little worn, very worn, "good luck" — each a quarter of its life (a road tyre's 40 km of asphalt: ten
 * kilometres each, half an hour's driving or so all told). In the last stage a tyre may blow at any moment, more
 * readily the balder it is and on rough ground. Sliding (a handbrake turn, a drift, a burnout, locked brakes)
 * wears it six times as fast as rolling; an off-road tyre takes rough ground better than a road tyre, a slick
 * worst of all. The grip falls with the tread (a bald tyre keeps three quarters of it: derive.ts), and in the wet
 * a worn tyre loses a good deal more on hard ground (aquaplaning, skating on the wet). Pure maths.
 */
import { Surface } from '../world/ground';
import type { Text, TireStats } from './types';

/** the four stages, from new (by the tread left: 3 · 2 · 1 · 0 quarters) */
export const TYRE_STAGES: readonly Text[] = [
  { zh: '全新', en: 'Brand new' },
  { zh: '有点磨损', en: 'A little worn' },
  { zh: '很旧', en: 'Very worn' },
  { zh: '听天由命', en: 'Good luck!' },
];

/** the stage of a tyre by its tread (1 new … 0 bald): 0 new … 3 "good luck" */
export function tyreStage(tread: number): 0 | 1 | 2 | 3 {
  return tread > 0.75 ? 0 : tread > 0.5 ? 1 : tread > 0.25 ? 2 : 3;
}

/** sliding wears a tyre this many times as fast as rolling the same distance */
export const SLIDE_WEAR = 6;

/** is a ground rough on tyres (gravel, dirt, sand): the off-road tyres' own */
function rough(surface: number): boolean {
  return surface === Surface.Gravel || surface === Surface.Dirt || surface === Surface.Sand;
}

/** tread lost per metre rolled on a ground (1 / its life in metres on asphalt, by how it takes that ground) */
export function wearPerMetre(t: TireStats, surface: number): number {
  const k = rough(surface) ? (t.roughWear ?? 1.3) : surface === Surface.Snow || surface === Surface.Ice ? 0.6 : surface === Surface.Grass ? 0.8 : 1;
  return k / (t.life * 1000);
}

/** about how far it goes on asphalt before it is bald, and before its last stage (km) */
export function kmLeft(t: TireStats, tread: number): { bald: number; lastStage: number } {
  return { bald: Math.max(0, tread) * t.life, lastStage: Math.max(0, tread - 0.25) * t.life };
}

/**
 * The chance a tyre in its last stage blows, per kilometre rolled: a little as it enters the stage, rising to
 * one in seven a kilometre bald (on asphalt; two and a half times that on rough ground). None before the stage.
 */
export function burstPerKm(tread: number, surface: number): number {
  if (tread > 0.25) return 0;
  const u = 1 - Math.max(0, tread) / 0.25;
  return (0.02 + 0.13 * u * u) * (rough(surface) ? 2.5 : 1);
}

/** a worn tyre in the wet on hard ground: what of its grip it keeps besides (1 new or dry … 0.65 bald and soaked) */
export function wetGrip(tread: number, wet: number, surface: number): number {
  if (wet <= 0 || (surface !== Surface.Asphalt && surface !== Surface.Gravel)) return 1;
  const bald = 1 - Math.max(0, Math.min(1, tread));
  return 1 - Math.min(1, wet) * 0.35 * Math.pow(bald, 1.5);
}
