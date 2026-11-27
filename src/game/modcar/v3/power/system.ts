/**
 * The power module's system (docs/V3/plan/rv.md R2: 用电). What the electric things riding in a vehicle draw, and from
 * what: its house battery (生活电瓶, the Old Elephant's) — or, with none, its starter battery down to the share it keeps
 * to crank on (core/modcar/systems.ts applianceLevel, drawAppliances). Every frame, for each vehicle with electric
 * things in it:
 *
 *  - the appliances switched on (a desk lamp, a television, a clock radio, a record player; a solar lamp has its own
 *    cell), a fridge (it runs all the time it is in there) and a hob at its heat draw together for the frame, at the
 *    game's electrical scale (WATTS);
 *  - when there is nothing there to draw on, the appliances go off, the hobs go out, a fridge keeps nothing cold (what is
 *    in it goes off as in the open air: ItemState.unpowered) — and 没电了 is said once, if one is in it or by it. Switched
 *    on again there they say 没电了 and stay off (the appliances' and the kitchen's presses ask powerOf); charged
 *    again, the fridge keeps things cold again;
 *  - out of a vehicle the appliances and a fridge work as they always have (power there is not the game's); a hob does
 *    not heat (放到车里才有电).
 *
 * The house battery is charged by the alternator while the engine runs and by a solar roof in the sun (systems.ts). The
 * card of an electric thing riding in a vehicle says how much there is to draw on (电); the battery's own card its charge.
 * Nothing of its own is saved: the charge is the battery's, what is on is the things'.
 */
import type { System } from '../../../../core/kernel/systems';
import { setUnpowered, type ItemInstance } from '../../../../core/modcar/items';
import { applianceOf, appOf, toggle, type ApplianceKind } from '../../../../core/v3/appliances/appliances';
import { HOB } from '../../../../core/v3/kitchen/items';
import { electric, fireOf, setFire } from '../../../../core/v3/kitchen/kit';
import { ND_FRIDGE } from '../../../../core/v3/nd/items';
import { itemNow } from '../../itemTime';
import type { GameContext } from '../../kernel/context';
import type { Loose } from '../../loose';
import type { ModVehicle } from '../../vehicle';

/** what each appliance draws switched on (W; the solar lamp its own cell's) */
export const APPLIANCE_W: Readonly<Record<ApplianceKind, number>> = { radio: 8, record: 20, tv: 80, lamp: 25, solar: 0 };
/** a fridge, running all the time it is in a vehicle (W) */
export const FRIDGE_W = 60;
/** a hob at each heat: off, low, high (W) */
export const HOB_W: readonly number[] = [0, 500, 1000];
/**
 * The ceiling lamps of a living space (docs/V3/plan/finish.md §十一 1): lit by themselves while one is in it after dark,
 * drawing this (W) on what its appliances draw on; they come up and go down in about this long (s). No switch: a
 * room one walks into at night is lit, as long as there is a battery to light it.
 */
export const CEILING_W = 15;
const CEILING_EASE_S = 0.35;
/** the night from which they light (env.sky.night, 0 day … 1 night) */
const CEILING_NIGHT = 0.35;

/** how near the vehicle one hears 没电了 said, standing by it (m) */
const SAY_NEAR = 9;

/** a thing that draws power in a vehicle: its card says what there is to draw on */
export function isElectric(id: string): boolean {
  const a = applianceOf(id);
  return (a !== null && a !== 'solar') || id === ND_FRIDGE || id === HOB;
}

/** what a thing draws now (W): an appliance switched on, a fridge, a lit hob; 0 for anything else */
export function wattsOf(inst: ItemInstance): number {
  const a = applianceOf(inst.item);
  if (a) return appOf(inst).on ? APPLIANCE_W[a] : 0;
  if (inst.item === ND_FRIDGE) return FRIDGE_W;
  if (electric(inst)) return HOB_W[fireOf(inst)] ?? 0;
  return 0;
}

/** has it a house battery on (its frame's mount for one, with the part on it) */
export function hasHouseBattery(v: ModVehicle): boolean {
  return v.view.frame.mounts.some((m) => m.cat === 'houseBattery' && !!v.build.parts[m.id]);
}

export class Power implements System<GameContext> {
  readonly id = 'power';
  readonly budget = { cpuMs: 0.2 };
  private ctx: GameContext | null = null;
  /** the vehicles whose batteries ran out with things on (said once, until there is power again) */
  private readonly flat = new Set<ModVehicle>();
  /** what each electric thing riding in a vehicle has to draw on (0 … 1; null: nothing at all), by its uid: its card's */
  readonly levelOf = new Map<string, number | null>();
  /** the watts drawn in each vehicle the last frame (telemetry, the harness) */
  private readonly drawn = new Map<ModVehicle, number>();
  private readonly byVehicle = new Map<ModVehicle, Loose[]>();
  /** what has happened (the harness's) */
  private runOuts = 0;
  /** how far each living space's ceiling lamps are lit (0 … 1) */
  private readonly ceiling = new Map<ModVehicle, number>();

  /** how far a vehicle's ceiling lamps are lit (0 … 1): the appliances' system adds their light to its cabin's */
  ceilingOf(v: ModVehicle): number {
    return this.ceiling.get(v) ?? 0;
  }

  /** unified vehicle interior dome/ceiling light: strictly driven by the driver's U toggle (v.domeOn), never auto-lit */
  private stepCeiling(dt: number, ctx: GameContext): void {
    for (let i = 0; i < ctx.vehicles.length; i++) {
      const v = ctx.vehicles[i];
      if (v.domeOn && !this.ceiling.has(v)) this.ceiling.set(v, 0);
    }
    for (const [v, k] of this.ceiling) {
      if (!ctx.vehicles.includes(v)) {
        this.ceiling.delete(v);
        continue;
      }
      let want = 0;
      if (v.domeOn) {
        const powered = dt > 0 ? v.sys.drawAppliances(CEILING_W / 1000, dt) : (v.sys.applianceLevel() ?? 0) > 0;
        want = powered || (v.sys.dash.battery ?? 0) > 0.02 ? 1 : 0;
      }
      const next = k + (want - k) * (1 - Math.exp(-Math.max(dt, 0) / CEILING_EASE_S));
      if (want === 0 && next < 0.004) this.ceiling.delete(v);
      else this.ceiling.set(v, next);
    }
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.powerAt?.push((l) => this.at(l));
  }

  /** the vehicle a thing rides in (null: none — lying about, in the hands) */
  vehicleOf(l: Loose): ModVehicle | null {
    const on = l.riding?.on;
    const ctx = this.ctx;
    if (!on || !ctx) return null;
    for (const v of ctx.vehicles) if ((v as unknown) === on) return v;
    return null;
  }

  /** what feeds a thing: in a vehicle 'on' or 'flat'; null out of one */
  at(l: Loose): 'on' | 'flat' | null {
    const v = this.vehicleOf(l);
    if (!v) return null;
    const lv = v.sys.applianceLevel();
    return lv !== null && lv > 0 ? 'on' : 'flat';
  }

  step(dt: number, ctx: GameContext): void {
    const now = itemNow();
    this.stepCeiling(dt, ctx);
    for (const list of this.byVehicle.values()) list.length = 0;
    this.levelOf.clear();
    for (const l of ctx.loose.list) {
      const it = l.item;
      if (!it || !isElectric(it.item)) continue;
      const v = this.vehicleOf(l);
      if (!v) {
        // (out of a vehicle a fridge keeps things cold as it always has)
        if (it.item === ND_FRIDGE && setUnpowered(it, now, false)) ctx.loose.touch(l);
        continue;
      }
      let list = this.byVehicle.get(v);
      if (!list) this.byVehicle.set(v, (list = []));
      list.push(l);
    }
    for (const [v, list] of this.byVehicle) {
      if (!list.length) {
        this.byVehicle.delete(v);
        this.drawn.delete(v);
        continue;
      }
      let w = 0;
      for (const l of list) w += wattsOf(l.item!);
      const ok = dt > 0 && w > 0 ? v.sys.drawAppliances(w / 1000, dt) : (v.sys.applianceLevel() ?? 0) > 0;
      this.drawn.set(v, ok ? w : 0);
      const level = v.sys.applianceLevel();
      for (const l of list) this.levelOf.set(l.item!.uid, level);
      if (ok) {
        this.flat.delete(v);
        for (const l of list) if (l.item!.item === ND_FRIDGE && setUnpowered(l.item!, now, false)) ctx.loose.touch(l);
        continue;
      }
      // nothing to draw on: everything in it stops
      let stopped = false;
      for (const l of list) {
        const it = l.item!;
        if (applianceOf(it.item) && appOf(it).on) {
          toggle(it, false);
          stopped = true;
          ctx.loose.touch(l);
        } else if (electric(it) && fireOf(it)) {
          setFire(it, 0);
          stopped = true;
          ctx.loose.touch(l);
        } else if (it.item === ND_FRIDGE && setUnpowered(it, now, true)) {
          stopped = true;
          ctx.loose.touch(l);
        }
      }
      if (stopped && !this.flat.has(v)) {
        this.flat.add(v);
        this.runOuts++;
        const here = ctx.player.aboard?.v === v || ctx.seated === v || Math.hypot(v.sim.px - ctx.player.walker.x, v.sim.pz - ctx.player.walker.z) < SAY_NEAR;
        if (here) {
          ctx.ui.say(hasHouseBattery(v) ? '生活电瓶没电了：电器都停了' : '电瓶没电了：电器都停了', 3.5);
          ctx.sound('power_off', 0.6);
        }
      }
    }
  }

  telemetry(): Record<string, unknown> {
    return {
      vehicles: [...this.drawn.entries()].map(([v, w]) => ({ frame: v.build.frame, watts: w, level: v.sys.applianceLevel() })),
      runOuts: this.runOuts,
    };
  }
}
