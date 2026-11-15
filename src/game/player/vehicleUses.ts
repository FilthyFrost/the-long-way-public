/**
 * Things to use on the vehicle, from outside: its doors ("上车") and its filler cap ("加油" with a
 * jerrycan of petrol in the hands). This is the example for everything that sits on a vehicle's
 * frame — the cab's levers, its windows and lights, the radio — which the model track adds later:
 *
 *   1. give it a stable id: `${spec.id}:${name}`
 *   2. aim(out): a body-frame point turned into the world with bodyToWorld (no allocation)
 *   3. prompt(actor): the one word, or null when there is nothing to do with it now
 *   4. hold: 0 for a press (a lever), 0.6–2.5 s for a hold (a stuck door), or channel() for
 *      something that goes on while E is held (pouring petrol)
 *   5. through: the vehicle's solid tag (spec.id), so the vehicle's own body does not hide it
 *   6. offer it from an InteractSource registered with game.player.interact.add(…)
 */
import { bodyToWorld, EXIT_KMH, type Door } from '../../core/onfoot/vehicle';
import type { Actor, Interactable, InteractSource, Vec3 } from '../../core/interact/interact';
import type { FuelSource } from '../../core/items/fuel';
import { fillerChannel, fillerProgress, fillerQuery, FLOW, radiatorChannel, radiatorQuery, type FillerQuery } from '../../core/vehicle/systems/fluids';
import type { Player } from './player';

/** litres a second poured from a jerrycan into the tank (the systems' rate) */
export const POUR_RATE = FLOW.pour;

class DoorUse implements Interactable {
  readonly hold = 0;
  readonly radius = 0.32;
  private readonly b = new Float64Array(9);
  constructor(
    readonly player: Player,
    readonly door: Door,
  ) {}
  get id(): string {
    return `${this.player.game.sim.spec.id}:door:${this.door.name}`;
  }
  get through(): string {
    return this.player.game.sim.spec.id;
  }
  aim(out: Vec3): void {
    const sim = this.player.game.sim;
    bodyToWorld(sim, this.b, this.door.x, this.door.y, this.door.side * sim.spec.body.halfWidth, out);
  }
  prompt(a: Actor): string | null {
    if (Math.abs(this.player.game.sim.kmh) > EXIT_KMH) return null;
    // a big thing in the arms does not go in through a door (the cargo bay takes it)
    return a.hands.size === 'large' ? null : '上车';
  }
  act(_a: Actor): boolean {
    return this.player.getIn(this.door);
  }
}

// vehicle systems: the filler cap and the radiator are the systems' fluid path (fluids.ts) — durations,
// preconditions and the wrong-fluid case live there; this only finds the vessel, the siphon and the tank
/** how far from the filler cap a station tank can reach with its hose (m) */
export const PUMP_REACH = 4;

class FillerUse implements Interactable {
  readonly hold = 0;
  readonly radius = 0.22;
  private readonly b = new Float64Array(9);
  private readonly q: FillerQuery = { mode: null, word: null };
  private readonly p = { x: 0, y: 0, z: 0 };
  constructor(readonly player: Player) {}
  get id(): string {
    return `${this.player.game.sim.spec.id}:filler`;
  }
  get through(): string {
    return this.player.game.sim.spec.id;
  }
  aim(out: Vec3): void {
    const sim = this.player.game.sim;
    const bd = sim.spec.body;
    // behind the rear wheel on the driver's side, at the height of the body's waist
    const side = sim.spec.eye.z > 0 ? 1 : -1;
    bodyToWorld(sim, this.b, bd.centerX - bd.halfLength * 0.62, (bd.bottom + bd.top) * 0.35, side * bd.halfWidth, out);
  }
  /** the station tank whose hose reaches the filler, if any */
  private station(): FuelSource | null {
    this.aim(this.p);
    let best: FuelSource | null = null;
    let bd = PUMP_REACH * PUMP_REACH;
    for (const f of this.player.fuel.all()) {
      if (f.kind !== 'tank') continue;
      const d = (f.x - this.p.x) ** 2 + (f.z - this.p.z) ** 2;
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    return best;
  }
  private query(a: Actor): FillerQuery {
    return fillerQuery(this.player.game.systems, a.hands, a.pack.count('tool.siphon') > 0, this.station(), this.q);
  }
  prompt(a: Actor): string | null {
    return this.query(a).word;
  }
  act(_a: Actor): boolean {
    return false;
  }
  /** the mode is settled when E goes down and kept while it is held (a can being filled is not poured back) */
  private held: FillerQuery['mode'] = null;
  private heldAt = -1;
  channel(a: Actor, dt: number): boolean {
    const now = this.player.game.time;
    if (this.heldAt < 0 || now - this.heldAt > 0.25) this.held = this.query(a).mode;
    this.heldAt = now;
    const go = fillerChannel(this.player.game.systems, a.hands, this.held, this.station(), dt);
    if (!go) this.heldAt = -1;
    return go;
  }
  progress(a: Actor): number {
    return fillerProgress(this.player.game.systems, a.hands, this.held ?? this.q.mode, null);
  }
}

class RadiatorUse implements Interactable {
  readonly hold = 0;
  readonly radius = 0.25;
  private readonly b = new Float64Array(9);
  constructor(readonly player: Player) {}
  get id(): string {
    return `${this.player.game.sim.spec.id}:radiator`;
  }
  get through(): string {
    return this.player.game.sim.spec.id;
  }
  aim(out: Vec3): void {
    const sim = this.player.game.sim;
    const bd = sim.spec.body;
    // the nose, at the height of the bonnet
    bodyToWorld(sim, this.b, bd.centerX + bd.halfLength * 0.95, (bd.bottom + bd.top) * 0.45, 0, out);
  }
  prompt(a: Actor): string | null {
    return radiatorQuery(this.player.game.systems, a.hands);
  }
  act(_a: Actor): boolean {
    return false;
  }
  channel(a: Actor, dt: number): boolean {
    return radiatorChannel(this.player.game.systems, a.hands, dt);
  }
  progress(_a: Actor): number {
    return this.player.game.systems.state.coolant;
  }
}

/** the vehicle's own interactables, offered while one is on foot near it */
export class VehicleUses implements InteractSource {
  private doors: DoorUse[] = [];
  private readonly filler: FillerUse;
  private readonly radiator: RadiatorUse;
  private readonly p = { x: 0, y: 0, z: 0 };

  constructor(readonly player: Player) {
    this.filler = new FillerUse(player);
    this.radiator = new RadiatorUse(player);
    this.refresh();
  }

  /** after the vehicle changed (another model, a door added) */
  refresh(): void {
    this.doors = this.player.doors().map((d) => new DoorUse(this.player, d));
  }

  interactablesNear(x: number, z: number, r: number, out: Interactable[]): void {
    if (!this.player.onFoot) return;
    const sim = this.player.game.sim;
    const reach = r + sim.spec.body.halfLength + 1;
    if ((sim.px - x) ** 2 + (sim.pz - z) ** 2 > reach * reach) return;
    for (const d of this.doors) out.push(d);
    if (sim.spec.fuel) {
      this.filler.aim(this.p);
      out.push(this.filler);
    }
    out.push(this.radiator);
  }
}
