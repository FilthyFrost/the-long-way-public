/**
 * The brakes' heat (docs/MODCAR.md §22): a brake turns the vehicle's speed into heat — its force times how fast its
 * wheel turns (a locked wheel's tyre takes it instead) — and sheds it into the air, the faster the vehicle goes the
 * faster. Past the heat its kind stands, its pads glaze and it bites less and less: a drum first (iron, shut in,
 * slow to cool), a plain disc next, a vented one and a cross-drilled sport disc last. A string of hard stops from
 * a hundred, or a long hill ridden down on the brakes, and it fades; a few minutes' driving and it bites again.
 *
 * Temperatures are above the air's (K). The game's hills are short (the world is compressed, VehicleSpec.fuel):
 * the heat a brake takes in counts BRAKE_GAME times, so they heat the brakes as long ones would.
 */

export type BrakeHeatKind = 'drum' | 'disc' | 'vented' | 'drilled' | 'moto';

export interface BrakeHeatSpec {
  /** how much heat it holds (kJ/K) */
  cap: number;
  /** what it sheds standing still (kW/K); at v m/s it sheds (1 + v / COOL_V) times that */
  cool: number;
  /** above the air (K): where it starts to fade, how many more until it has faded all it will, and how much it then loses (0 … 1) */
  fadeAt: number;
  fadeSpan: number;
  fadeMax: number;
}

export const BRAKE_HEAT: Record<BrakeHeatKind, BrakeHeatSpec> = {
  drum: { cap: 4.2, cool: 0.009, fadeAt: 140, fadeSpan: 150, fadeMax: 0.6 },
  disc: { cap: 3.4, cool: 0.0075, fadeAt: 270, fadeSpan: 220, fadeMax: 0.5 },
  vented: { cap: 3.8, cool: 0.011, fadeAt: 340, fadeSpan: 240, fadeMax: 0.42 },
  drilled: { cap: 3.6, cool: 0.013, fadeAt: 400, fadeSpan: 260, fadeMax: 0.36 },
  moto: { cap: 1.4, cool: 0.0055, fadeAt: 280, fadeSpan: 200, fadeMax: 0.5 },
};

/** the speed (m/s) at which a brake sheds twice what it does standing */
export const COOL_V = 14;
/** how many times the heat a brake takes in counts (the game's hills are a fifth as long) */
export const BRAKE_GAME = 3;

/** the brake's heat after dt seconds taking in `kw` (its own share, before BRAKE_GAME) at `speed` m/s */
export function stepBrakeHeat(t: number, s: BrakeHeatSpec, kw: number, speed: number, dt: number): number {
  const shed = s.cool * (1 + Math.abs(speed) / COOL_V);
  // (exact for constant input over the step: no overshoot however long the step)
  const eq = (kw * BRAKE_GAME) / shed;
  const k = Math.exp((-shed / s.cap) * dt);
  return Math.max(0, eq + (t - eq) * k);
}

/** how much a brake at this heat still bites (1 cold … 1 − fadeMax at its worst) */
export function brakeBite(s: BrakeHeatSpec, t: number): number {
  const x = Math.min(1, Math.max(0, (t - s.fadeAt) / s.fadeSpan));
  return 1 - s.fadeMax * x * x * (3 - 2 * x);
}

/** the kind of heat a brake part takes (its BrakeStats.kind; a motorcycle's small disc its own) */
export function heatKindOf(part: string, kind: 'drum' | 'disc' | 'vented' | 'drilled'): BrakeHeatKind {
  return part === 'brakes_moto' ? 'moto' : kind;
}
