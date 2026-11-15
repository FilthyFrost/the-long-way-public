/**
 * Petrol to be had (docs/DESIGN_V2.md 5.6, 8.1): a filling station's tank, a wreck's tank. Hold E
 * with a vessel in the hands and it fills — 10 L in 15 s from a station tank, 2 L in 5 s from a
 * wreck — until the vessel is full, the tank is dry, or E is let go.
 */
import type { Actor, Interactable, InteractSource, Vec3 } from '../interact/interact';
import { STATION_FUEL_L, WRECK_FUEL_L } from './loot';
import { Rng } from '../math/rng';

export type FuelKind = 'tank' | 'wreck';

/** litres per second while siphoning */
export const SIPHON_RATE: Readonly<Record<FuelKind, number>> = { tank: 10 / 15, wreck: 2 / 5 };

export interface FuelSource {
  readonly id: string;
  readonly kind: FuelKind;
  /** where the hose goes in (world) */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  litres: number;
}

/** the litres a source starts with, from its seed (11.4: a station 15–30 L, a wreck 2–6 L) */
export function fuelFor(kind: FuelKind, seed: number): number {
  const [lo, hi] = kind === 'tank' ? STATION_FUEL_L : WRECK_FUEL_L;
  return Math.round(lo + new Rng(seed).next() * (hi - lo));
}

class Siphon implements Interactable {
  readonly hold = 0;
  readonly radius = 0.3;
  constructor(readonly f: FuelSource) {}
  get id(): string {
    return this.f.id;
  }
  aim(out: Vec3): void {
    out.x = this.f.x;
    out.y = this.f.y;
    out.z = this.f.z;
  }
  prompt(a: Actor): string | null {
    const cap = a.hands.holds('fuel');
    if (cap <= 0) return null;
    if (this.f.litres <= 1e-6) return '空了';
    return a.hands.fill < cap - 1e-6 ? '抽油' : '满了';
  }
  act(_a: Actor): boolean {
    return false;
  }
  channel(a: Actor, dt: number): boolean {
    const cap = a.hands.holds('fuel');
    const room = cap - a.hands.fill;
    if (cap <= 0 || room <= 1e-9 || this.f.litres <= 1e-9) return false;
    const l = Math.min(SIPHON_RATE[this.f.kind] * dt, room, this.f.litres);
    a.hands.fill += l;
    this.f.litres -= l;
    return a.hands.fill < cap - 1e-9 && this.f.litres > 1e-9;
  }
  progress(a: Actor): number {
    const cap = a.hands.holds('fuel');
    return cap > 0 ? a.hands.fill / cap : 0;
  }
}

export class FuelSources implements InteractSource {
  private readonly list: FuelSource[] = [];
  private readonly uses = new Map<string, Siphon>();

  add(id: string, kind: FuelKind, x: number, y: number, z: number, litres: number): FuelSource {
    if (this.uses.has(id)) throw new Error(`fuel source ${id} is already there`);
    const f: FuelSource = { id, kind, x, y, z, litres };
    this.list.push(f);
    this.uses.set(id, new Siphon(f));
    return f;
  }

  get(id: string): FuelSource | undefined {
    return this.list.find((f) => f.id === id);
  }

  all(): readonly FuelSource[] {
    return this.list;
  }

  interactablesNear(x: number, z: number, r: number, out: Interactable[]): void {
    const r2 = r * r;
    for (const f of this.list) {
      const dx = f.x - x;
      const dz = f.z - z;
      if (dx * dx + dz * dz <= r2) out.push(this.uses.get(f.id)!);
    }
  }

  toJSON(): { id: string; litres: number }[] {
    return this.list.map((f) => ({ id: f.id, litres: f.litres }));
  }

  load(s: readonly { id: string; litres: number }[]): this {
    for (const x of s) {
      const f = this.get(x.id);
      if (f) f.litres = x.litres;
    }
    return this;
  }
}
