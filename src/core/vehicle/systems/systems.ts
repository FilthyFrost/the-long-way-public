/**
 * Vehicle systems: parts and their condition, tyres per wheel, fuel, battery, cooling, ignition, lights,
 * wear, damage and quirks (docs/VEHICLE_SYSTEMS.md §6). Pure and deterministic: integer hashes for every
 * chance, no clocks, no Math.random. The state is a plain JSON object (save games, the network).
 *
 * Coupling to the physics is one way and narrow: `update()` reads what the simulation did (distance,
 * engine power, rpm, pedals, road feel, fuel burnt) and writes `sim.mods`, `sim.engineOn`, `sim.cranking`.
 * Call it with a fixed dt (the host's simulation step or a whole number of them).
 */
import { clamp, smoothstep } from '../../math/util';
import { hash3 } from '../../math/rng';
import { SURFACE_COUNT } from '../mods';
import { ANY_SIZE, Inventory as ItemStore, type Stack } from '../../items/inventory';
import type { VehicleSim } from '../sim';
import type { VehicleSpec } from '../spec';
import { catalogItem, TYRE_GRIP, type PartEffects, type SlotId, type TyreId } from './partsCatalog';
import { quirksFor, type QuirkDef } from './quirks';

export type Ignition = 'off' | 'acc' | 'on';
export type LightSwitch = 'off' | 'auto' | 'low' | 'high';
export type WiperSwitch = 'auto' | 'off' | 'slow' | 'fast';
/** relaxed: auto hold, S reverses, the handbrake lets go when you drive off, W starts a stopped engine. real: none of that */
export type Assist = 'relaxed' | 'real';

export interface PartState {
  id: string;
  cond: number;
}

export interface WheelState {
  tyre: TyreId;
  /** tread 0–100 */
  tread: number;
  flat: boolean;
  /** rim condition 0–100 (suffers when driven on a flat) */
  rim: number;
  chains: boolean;
  /** last 50 m segment of rolling checked for a puncture */
  seg: number;
  /** taken off the car: the corner stands on its hub (the other fields are kept for the record) */
  off?: boolean;
}

export interface SystemsState {
  v: 1;
  vehicle: string;
  seed: number;
  slots: Partial<Record<SlotId, PartState | null>>;
  /** FL, FR, RL, RR */
  wheels: WheelState[];
  spare: WheelState | null;
  fuelL: number;
  coolantC: number;
  /** coolant level 0–1 */
  coolant: number;
  /** battery charge (units; capacity from the battery part) */
  battery: number;
  odometerM: number;
  ignition: Ignition;
  running: boolean;
  lights: LightSwitch;
  wipers: WiperSwitch;
  hazard: boolean;
  heater: boolean;
  radio: boolean;
  cabinLight: boolean;
  /** extra electrical consumers (units per minute) registered by the interior: fridge, stove … */
  consumers: Record<string, number>;
  assist: Assist;
  /** multiplies puncture chances (settings: 0 = no punctures) */
  hazardScale: number;
  /**
   * The vehicle's own tool kit, stowed in it (a jack and a wheel wrench come with every vehicle): the
   * store `VehicleSystems.kit` is built from it and written back. Absent in older saves = the stock kit.
   */
  kit?: (Stack | null)[];
}

/** what every vehicle carries for changing a wheel */
export const STOCK_KIT: readonly string[] = ['tool.jack', 'tool.wrench'];
export const KIT_SLOTS = 4;

/** what the outside world tells the systems each update */
export interface SystemsEnv {
  /** air temperature (°C) */
  ambientC: number;
  /** it is dark (auto lights) */
  dark: boolean;
  /** rain 0–1 (auto wipers, quirks) */
  rain: number;
}

export type LampLevel = 0 | 1 | 2;
export const LAMPS = ['battery', 'fuel', 'temp', 'tyres', 'engine', 'brakes', 'handbrake'] as const;
export type LampId = (typeof LAMPS)[number];

/** Read-only telemetry for the dashboard (interior track) and the debug hooks. One object, reused. */
export interface Dashboard {
  speedKmh: number;
  rpm: number;
  /** what the gear indicator shows: P R N D, or D1…D5 / M1…M5 in manual mode */
  gearLabel: string;
  selector: 'P' | 'R' | 'N' | 'D';
  gear: number;
  manual: boolean;
  /** 0–1 needle positions */
  fuel: number;
  temp: number;
  battery: number;
  fuelL: number;
  tankL: number;
  coolantC: number;
  /** battery voltage for a gauge (11.6–14.4 V) */
  volts: number;
  odometerKm: number;
  ignition: Ignition;
  running: boolean;
  cranking: boolean;
  handbrake: boolean;
  lights: LightSwitch;
  lightsOn: boolean;
  highBeam: boolean;
  wipers: WiperSwitch;
  hazard: boolean;
  horn: boolean;
  limp: boolean;
  /** 0 off, 1 amber (warning), 2 red (stops you / needs attention) */
  lamps: Record<LampId, LampLevel>;
  /** ignition self-check: running for a moment after the key reaches ON; `step` = lamps lit so far */
  selfCheck: { active: boolean; step: number; results: { lamp: LampId; level: LampLevel }[] };
  /** one sentence for the radio's voice (5.6); '' = nothing to say */
  message: { zh: string; en: string; code: string };
  /** quirks showing right now (ids from quirks.ts) and whether one fired this update */
  quirks: string[];
  /** cosmetic signals for the sound and the props */
  idleWobbleRpm: number;
  headlightFlicker: boolean;
}

export interface SystemsEvents {
  starts: number;
  clicks: number;
  punctures: number;
  stalls: number;
}

/** what a vehicle comes with (docs/VEHICLE_SYSTEMS.md §6.1) */
const STOCK_TYRE: Record<string, TyreId> = { t0_truck: 'tyre.road', t1_van: 'tyre.road', t2_offroad: 'tyre.allterrain', t3_rv: 'tyre.road' };

export interface StockOptions {
  /** all conditions 100, full tank, full battery (tests) */
  fresh?: boolean;
  /** start condition for the parts (0–100), default: the worn starting truck */
  cond?: Partial<Record<SlotId | 'tread', number>>;
  fuelFrac?: number;
}

export function stockState(spec: VehicleSpec, seed = 1, o: StockOptions = {}): SystemsState {
  const f = o.fresh ? 100 : undefined;
  const c = (slot: SlotId | 'tread', d: number): number => o.cond?.[slot] ?? f ?? d;
  const tyre = STOCK_TYRE[spec.id] ?? 'tyre.road';
  const wheel = (): WheelState => ({ tyre, tread: c('tread', 62), flat: false, rim: 100, chains: false, seg: 0 });
  return {
    v: 1,
    vehicle: spec.id,
    seed,
    slots: {
      engine: { id: 'part.engine.1', cond: c('engine', 58) },
      cooling: { id: 'part.cooling.1', cond: c('cooling', 70) },
      battery: { id: 'part.battery.1', cond: c('battery', 80) },
      suspension: { id: 'part.suspension.1', cond: c('suspension', 66) },
      brakes: { id: 'part.brakes.1', cond: c('brakes', 72) },
      body: { id: 'part.body', cond: c('body', 55) },
      optA: null,
      optB: null,
      heater: null,
    },
    wheels: [wheel(), wheel(), wheel(), wheel()],
    spare: { ...wheel(), tread: c('tread', 80) },
    fuelL: (spec.fuel?.tankL ?? 0) * (o.fuelFrac ?? (o.fresh ? 1 : 0.72)),
    coolantC: 20,
    coolant: 1,
    battery: o.fresh ? 100 : 72,
    odometerM: 0,
    ignition: 'on',
    running: true,
    lights: 'auto',
    wipers: 'auto',
    hazard: false,
    heater: false,
    radio: false,
    cabinLight: false,
    consumers: {},
    assist: 'relaxed',
    hazardScale: 1,
    kit: [...STOCK_KIT.map((id) => ({ id, n: 1 })), null, null],
  };
}

// ---- tuning (docs/VEHICLE_SYSTEMS.md §6, all numbers in one place)
export const TUNE = {
  /** cooling: heat per unit load and at idle, time constant (°C, s); thermostat; warning and limp thresholds */
  heatLoad: 36,
  heatIdle: 4,
  heatTau: 150,
  thermoOpen: [80, 92] as const,
  fanOnC: 98,
  yellowC: 108,
  redC: 120,
  limpTorque: 0.6,
  /** electricity, units per minute (5.6) */
  alternator: 8,
  draw: { lights: 1.5, highBeam: 2.2, wipers: 0.5, hazard: 0.4, radio: 0.5, heater: 3, cabinLight: 1, ignition: 0.3, fan: 1 },
  starterPerS: 3,
  minCrankCharge: 8,
  /** wear per km at condition points */
  wearKm: { engine: 0.075, cooling: 0.03, suspension: 0.03, battery: 0.01, tread: 0.03, brakes: 0.012 },
  /** punctures per 100 km per wheel by surface (asphalt, gravel, dirt, grass, sand, snow, ice) */
  punctureP100: [0.12, 0.4, 0.3, 0.2, 0.1, 0.05, 0.05],
  /** tread wear multiplier by surface */
  treadSurface: [1, 2, 1.8, 1.4, 1.5, 0.8, 0.6],
  flat: { mu: 0.55, rr: 3.5, drop: 0.045, pull: 0.012, treadPerM: 0.3, rimPerM: 0.1 },
};

const KMH = 3.6;

/**
 * The vehicle as its suspension makes it (docs/VEHICLE_SYSTEMS.md §6.2): II stiffens the anti-roll bars,
 * III adds travel and lifts the body (the centre of gravity rises 60 % of the lift). Tier I = the spec.
 */
export function suspendedSpec(base: VehicleSpec, partId: string | null | undefined): VehicleSpec {
  const e = partId ? catalogItem(partId)?.effects : undefined;
  if (!e || (!e.rollStiffness && !e.extraTravel && !e.extraHeight)) return base;
  const roll = e.rollStiffness ?? 1;
  const travel = e.extraTravel ?? 0;
  const lift = e.extraHeight ?? 0;
  const axle = (a: VehicleSpec['front']): VehicleSpec['front'] => ({ ...a, antiRollRatio: a.antiRollRatio * roll, travel: a.travel + travel });
  // the body (measured from the centre of gravity) rises the other 40 % of the lift with it
  const up = lift * 0.4;
  return {
    ...base,
    cgHeight: base.cgHeight + lift * 0.6,
    front: axle(base.front),
    rear: axle(base.rear),
    body: { ...base.body, bottom: base.body.bottom + up, top: base.body.top + up },
    eye: { ...base.eye, y: base.eye.y + up },
  };
}

/** damage from hitting solids: condition points per m/s of closing speed above a threshold (docs/VEHICLE_SYSTEMS.md §6.5) */
export const HIT = { bodyFrom: 1.5, body: 2.4, frontFrom: 4, cooling: 1.4, engine: 0.9 };

export class VehicleSystems {
  state: SystemsState;
  readonly spec: VehicleSpec;
  sim: VehicleSim | null = null;
  readonly dash: Dashboard;
  readonly events: SystemsEvents = { starts: 0, clicks: 0, punctures: 0, stalls: 0 };
  /** quirks showing (recomputed when conditions change) */
  quirks: QuirkDef[] = [];
  /** starter held this update */
  private crankHeld = false;
  private autoCrank = 0;
  private crankT = 0;
  private selfCheckT = 99;
  private horn = false;
  private time = 0;
  private ambient = 20;
  private dark = false;
  private rain = 0;
  private lastOdo = 0;
  private readonly lastRolled = new Float64Array(4);
  private readonly lastSlid = new Float64Array(4);
  private lastThumps = 0;
  private lastBottoms = 0;
  private lastLandings = 0;
  private lastBodyHits = 0;
  private lastSolidHits = 0;
  private quirkCheckT = 0;
  private limp = false;
  private flicker = false;

  constructor(spec: VehicleSpec, state?: SystemsState) {
    this.spec = spec;
    this.state = state ?? stockState(spec);
    this.dash = {
      speedKmh: 0, rpm: 0, gearLabel: 'D', selector: 'D', gear: 1, manual: false, fuel: 0, temp: 0, battery: 0, fuelL: 0, tankL: 0, coolantC: 20, volts: 12.6,
      odometerKm: 0, ignition: 'on', running: true, cranking: false, handbrake: false, lights: 'auto', lightsOn: false, highBeam: false, wipers: 'auto', hazard: false, horn: false, limp: false,
      lamps: { battery: 0, fuel: 0, temp: 0, tyres: 0, engine: 0, brakes: 0, handbrake: 0 },
      selfCheck: { active: false, step: 0, results: [] },
      message: { zh: '', en: '', code: '' },
      quirks: [], idleWobbleRpm: 0, headlightFlicker: false,
    };
    this.refreshQuirks();
  }

  /** attach to a simulation: the tank and the engine state go across */
  bind(sim: VehicleSim): this {
    this.sim = sim;
    sim.fuelL = this.state.fuelL;
    sim.engineOn = this.state.running;
    sim.autoHold = sim.autoReverse = sim.autoRelease = this.state.assist === 'relaxed';
    this.lastOdo = sim.odometer;
    for (let i = 0; i < 4; i++) {
      this.lastRolled[i] = sim.wheels[i].rolled;
      this.lastSlid[i] = sim.wheels[i].slid;
    }
    this.lastThumps = sim.feel.thumps;
    this.lastBottoms = sim.feel.bottomOuts;
    this.lastLandings = sim.feel.landings;
    this.lastBodyHits = sim.feel.bodyHits;
    this.lastSolidHits = sim.hits;
    this.refreshSpec();
    this.applyMods();
    return this;
  }

  // ------------------------------------------------------------------ derived quantities

  part(slot: SlotId): PartState | null {
    return this.state.slots[slot] ?? null;
  }

  private eff(slot: SlotId): PartEffects {
    const p = this.part(slot);
    return (p ? catalogItem(p.id)?.effects : undefined) ?? {};
  }

  get tankL(): number {
    return (this.spec.fuel?.tankL ?? 0) * (1 + ((this.eff('optA').tankExtra as number) ?? 0));
  }

  get batteryCap(): number {
    const p = this.part('battery');
    if (!p) return 0;
    return ((this.eff('battery').batteryCap as number) ?? 100) * (0.5 + (0.5 * p.cond) / 100);
  }

  get coolingCap(): number {
    const p = this.part('cooling');
    if (!p) return 0.25; // no radiator: the block alone
    let cap = ((this.eff('cooling').cooling as number) ?? 1) * (0.5 + (0.5 * p.cond) / 100) * clamp(this.state.coolant / 0.5, 0.2, 1);
    for (const q of this.quirks) if (q.effect.coolingScale) cap *= q.effect.coolingScale;
    return cap;
  }

  /** what stops the engine from starting (code), '' = it can start */
  startProblem(): string {
    const s = this.state;
    if (!this.part('engine')) return 'no_engine';
    if (!this.part('battery') || s.battery < TUNE.minCrankCharge) return 'battery_flat';
    if (s.fuelL <= 0 && this.spec.fuel) return 'no_fuel';
    return '';
  }

  private crankNeed(): number {
    const preheat = !!this.eff('heater').preheat;
    let t = 0.7;
    if (this.ambient < 5 && !preheat) t += Math.min(2.2, (5 - this.ambient) * 0.12);
    const e = this.part('engine');
    if (e && e.cond < 40) t += 0.6;
    for (const q of this.quirks) if (q.effect.crankExtraS && (q.trigger !== 'cold' || this.ambient < 8)) t += q.effect.crankExtraS;
    if (this.state.battery < 30) t *= 1.5;
    return t;
  }

  private refreshQuirks(): void {
    const s = this.state;
    const out: QuirkDef[] = [];
    for (const slot of ['engine', 'cooling', 'battery', 'suspension', 'brakes', 'body'] as SlotId[]) {
      const p = s.slots[slot];
      if (!p) continue;
      out.push(...quirksFor(s.seed, slot, p.cond, slot === 'engine' && p.id === 'part.engine.1'));
    }
    this.quirks = out;
  }

  hasQuirk(id: string): boolean {
    return this.quirks.some((q) => q.id === id);
  }

  // ------------------------------------------------------------------ player operations (levers, keys, switches)

  /** turn the key to a position (the starter is `crank`) */
  turnKey(pos: Ignition): void {
    const s = this.state;
    if (pos === s.ignition) return;
    if (pos === 'on' && s.ignition !== 'on') this.selfCheckT = 0;
    if (pos !== 'on') {
      if (s.running) this.events.stalls++;
      s.running = false;
      this.crankT = 0;
      this.autoCrank = 0;
    }
    s.ignition = pos;
    // relaxed: switching off in D puts the lever in P (the car never rolls away by itself)
    if (pos === 'off' && s.assist === 'relaxed' && this.sim && this.sim.kmh < 3) this.sim.shift('P');
  }

  /** hold the key against the spring: the starter turns while this is true */
  crank(held: boolean): void {
    if (held && this.state.ignition !== 'on') this.turnKey('on');
    this.crankHeld = held;
    if (!held) this.crankT = 0;
  }

  /** the whole start in one go (relaxed controls and the robot): key on, self-check, crank up to 4 s */
  startEngine(): void {
    if (this.state.running) return;
    if (this.state.ignition !== 'on') this.turnKey('on');
    this.autoCrank = 4;
  }

  stopEngine(): void {
    this.turnKey('off');
  }

  setSelector(sel: 'P' | 'R' | 'N' | 'D'): boolean {
    return this.sim ? this.sim.shift(sel) : false;
  }

  /** the lever one notch: −1 forward (towards P; in manual mode = up a gear), +1 back (towards D; manual = down) */
  stepLever(delta: number): boolean {
    const sim = this.sim;
    if (!sim) return false;
    if (sim.manual && sim.selector === 'D') return delta < 0 ? sim.shiftUp() : sim.shiftDown();
    return sim.stepSelector(delta);
  }

  toggleManual(): boolean {
    const sim = this.sim;
    if (!sim) return false;
    if (sim.selector !== 'D') return false;
    sim.setManual(!sim.manual);
    return sim.manual;
  }

  setHandbrake(on: boolean): void {
    this.sim?.setParkBrake(on);
  }

  toggleHandbrake(): boolean {
    const sim = this.sim;
    if (!sim) return false;
    sim.setParkBrake(sim.parkBrake === 0);
    return sim.parkBrake > 0;
  }

  setLights(l: LightSwitch): void {
    this.state.lights = l;
  }

  /** L: off → auto → low → high → off */
  cycleLights(): LightSwitch {
    const order: LightSwitch[] = ['off', 'auto', 'low', 'high'];
    this.state.lights = order[(order.indexOf(this.state.lights) + 1) % order.length];
    return this.state.lights;
  }

  cycleWipers(): WiperSwitch {
    const order: WiperSwitch[] = ['auto', 'off', 'slow', 'fast'];
    this.state.wipers = order[(order.indexOf(this.state.wipers) + 1) % order.length];
    return this.state.wipers;
  }

  setHorn(on: boolean): void {
    this.horn = on;
  }

  toggleHazard(): boolean {
    this.state.hazard = !this.state.hazard;
    return this.state.hazard;
  }

  setHeater(on: boolean): void {
    this.state.heater = on;
  }

  setRadio(on: boolean): void {
    this.state.radio = on;
  }

  setCabinLight(on: boolean): void {
    this.state.cabinLight = on;
  }

  /** an interior consumer draws `perMin` battery units per minute while registered (0 removes it) */
  setConsumer(id: string, perMin: number): void {
    if (perMin > 0) this.state.consumers[id] = perMin;
    else delete this.state.consumers[id];
  }

  setAssist(a: Assist): void {
    this.state.assist = a;
    if (this.sim) this.sim.autoHold = this.sim.autoReverse = this.sim.autoRelease = a === 'relaxed';
  }

  /** headlights are lit (switch, or auto with the dark) */
  get lightsOn(): boolean {
    const l = this.state.lights;
    const powered = this.state.ignition !== 'off' && this.state.battery > 0.5;
    return powered && (l === 'low' || l === 'high' || (l === 'auto' && this.dark));
  }

  // ------------------------------------------------------------------ the update

  update(dt: number, env: SystemsEnv): void {
    const s = this.state;
    const sim = this.sim;
    this.time += dt;
    this.ambient = env.ambientC;
    this.dark = env.dark;
    this.rain = env.rain;
    if (sim && Number.isFinite(sim.fuelL)) s.fuelL = sim.fuelL;
    const speed = sim ? sim.speed : 0;

    // --- ignition and starter
    if (this.selfCheckT < 99) this.selfCheckT += dt;
    const wantCrank = this.crankHeld || this.autoCrank > 0;
    if (this.autoCrank > 0) this.autoCrank -= dt;
    let cranking = false;
    if (wantCrank && !s.running && s.ignition === 'on' && this.selfCheckT > 0.6) {
      if (!this.part('battery') || s.battery < TUNE.minCrankCharge) {
        if (this.crankT === 0) this.events.clicks++;
        this.crankT = 1e-6;
        this.autoCrank = 0;
      } else {
        cranking = true;
        this.crankT += dt;
        s.battery = Math.max(0, s.battery - TUNE.starterPerS * dt);
        const problem = this.startProblem();
        if (problem === '' && this.crankT >= this.crankNeed()) {
          s.running = true;
          this.events.starts++;
          this.crankT = 0;
          this.autoCrank = 0;
          this.crankHeld = false;
        }
      }
    }
    // out of fuel: the engine dies
    if (s.running && this.spec.fuel && s.fuelL <= 0) {
      s.running = false;
      this.events.stalls++;
    }
    if (s.running && !this.part('engine')) s.running = false;

    // --- heat
    const e = this.spec.engine;
    const kwMax = this.maxKw();
    const load = sim && s.running ? clamp(sim.engineKw / kwMax, 0, 1.2) : 0;
    const fanOn = s.running && s.coolantC > TUNE.fanOnC && s.battery > 1;
    const air = Math.max(fanOn ? 0.55 : 0.2, Math.min(1, speed / 22));
    const open = Math.max(0.08, smoothstep(TUNE.thermoOpen[0], TUNE.thermoOpen[1], s.coolantC));
    const heat = s.running ? TUNE.heatLoad * load + TUNE.heatIdle : 0;
    // a closed thermostat circulates only the block (a small loop): it warms up three times as fast
    const tau = TUNE.heatTau * (0.3 + 0.7 * smoothstep(TUNE.thermoOpen[0] - 6, TUNE.thermoOpen[1], s.coolantC));
    s.coolantC += ((heat - air * this.coolingCap * open * (s.coolantC - env.ambientC)) / tau) * dt;
    // leaks from a tired radiator
    const cool = this.part('cooling');
    if (cool && cool.cond < 30 && s.running) s.coolant = Math.max(0, s.coolant - (0.004 / 60) * dt * (30 - cool.cond));
    const red = s.coolantC >= TUNE.redC;

    // --- electricity
    const d = TUNE.draw;
    let draw = 0;
    if (s.ignition !== 'off') draw += d.ignition;
    if (this.lightsOn) draw += s.lights === 'high' ? d.highBeam : d.lights;
    if (s.ignition !== 'off' && (s.wipers === 'slow' || s.wipers === 'fast' || (s.wipers === 'auto' && env.rain > 0.05))) draw += d.wipers;
    if (s.hazard) draw += d.hazard;
    if (s.radio && s.ignition !== 'off') draw += d.radio;
    if (s.heater && s.ignition !== 'off') draw += d.heater;
    if (s.cabinLight) draw += d.cabinLight;
    if (fanOn) draw += d.fan;
    for (const v of Object.values(s.consumers)) draw += v;
    const charge = s.running && this.part('battery') ? TUNE.alternator : 0;
    s.battery = clamp(s.battery + ((charge - draw) / 60) * dt, 0, this.batteryCap);

    // --- wear and damage
    if (sim) this.wear(dt, sim, red);

    // --- quirks follow the conditions (checked twice a second; cheap)
    this.quirkCheckT += dt;
    if (this.quirkCheckT > 0.5) {
      this.quirkCheckT = 0;
      this.refreshQuirks();
    }
    if (sim && sim.feel.thumps !== this.lastThumps) this.flicker = this.hasQuirk('headlight_flicker');
    else if (sim && sim.feel.thump < 0.05) this.flicker = false;

    // --- limp mode: broken engine, or boiling
    const eng = this.part('engine');
    this.limp = !!eng && (eng.cond <= 0 || red);
    if (sim) {
      sim.engineOn = s.running;
      sim.cranking = cranking;
      if (sim.feel) {
        this.lastThumps = sim.feel.thumps;
        this.lastBottoms = sim.feel.bottomOuts;
        this.lastLandings = sim.feel.landings;
        this.lastBodyHits = sim.feel.bodyHits;
      }
      this.applyMods();
      if (Number.isFinite(sim.fuelL)) sim.fuelL = s.fuelL;
    }
    void e;
    this.updateDash(cranking);
  }

  private kwMaxCache = 0;
  private maxKw(): number {
    if (this.kwMaxCache > 0) return this.kwMaxCache;
    let best = 1;
    for (const [rpm, nm] of this.spec.engine.curve) best = Math.max(best, (rpm * nm * Math.PI) / 30000);
    this.kwMaxCache = best * ((this.eff('engine').torque as number) ?? 1);
    return this.kwMaxCache;
  }

  private wear(dt: number, sim: VehicleSim, red: boolean): void {
    const s = this.state;
    const T = TUNE;
    const km = Math.max(0, sim.odometer - this.lastOdo) / 1000;
    this.lastOdo = sim.odometer;
    s.odometerM += km * 1000;
    const hit = (slot: SlotId, amount: number): void => {
      const p = s.slots[slot];
      if (!p || amount <= 0) return;
      const w = (catalogItem(p.id)?.effects.wear as number | undefined) ?? 1;
      p.cond = clamp(p.cond - amount * w, 0, 100);
    };
    // engine: distance × load; the limiter and boiling hurt
    hit('engine', T.wearKm.engine * km * (0.5 + sim.throttle));
    if (s.running && sim.rpm > this.spec.engine.redline * sim.mods.rpmLimit * 0.97) hit('engine', 0.05 * dt);
    if (red && s.running) {
      hit('engine', 0.05 * dt);
      hit('cooling', 0.03 * dt);
    }
    hit('cooling', T.wearKm.cooling * km);
    hit('battery', T.wearKm.battery * km);
    if (s.battery < 3) hit('battery', 0.005 * dt);
    // suspension: distance, a busy road, bump-stop strikes and landings
    const f = sim.feel;
    hit('suspension', T.wearKm.suspension * km + Math.max(0, f.suspRms - 0.25) * 0.01 * dt);
    if (f.bottomOuts !== this.lastBottoms && f.lastBottomOut > 1) hit('suspension', (f.lastBottomOut - 1) * 1.5);
    if (f.landings !== this.lastLandings && f.lastLanding > 1.5) {
      hit('suspension', (f.lastLanding - 1.5) * 3);
      hit('body', (f.lastLanding - 1.5) * 1.5);
    }
    // brakes: work done braking
    // brake pads: a little with every kilometre (the robot driver too), more with the work of braking
    hit('brakes', T.wearKm.brakes * km + 0.0025 * sim.brake * sim.speed * dt * (this.spec.mass / 1500));
    // body: touching the ground, hard kerb strikes
    if (f.bodyHits !== this.lastBodyHits) hit('body', clamp(f.lastBodyHit / (this.spec.mass * 0.8), 0, 1) * 12);
    if (f.thumps !== this.lastThumps && f.lastThump > 5) hit('body', 0.5);
    // walls, posts, wrecks: the body takes the blow; head-on, the radiator and the engine behind it too
    if (sim.hits !== this.lastSolidHits) {
      this.lastSolidHits = sim.hits;
      const v = sim.lastHitSpeed;
      hit('body', Math.max(0, v - HIT.bodyFrom) * HIT.body);
      if (sim.lastHitFront) {
        hit('cooling', Math.max(0, v - HIT.frontFrom) * HIT.cooling);
        hit('engine', Math.max(0, v - HIT.frontFrom) * HIT.engine);
      }
    }

    // tyres
    for (let i = 0; i < 4; i++) {
      const w = sim.wheels[i];
      const ws = s.wheels[i];
      const dm = Math.max(0, w.rolled - this.lastRolled[i]);
      const slid = Math.max(0, w.slid - this.lastSlid[i]);
      this.lastRolled[i] = w.rolled;
      this.lastSlid[i] = w.slid;
      const surf = w.surface < SURFACE_COUNT ? w.surface : 0;
      const g = TYRE_GRIP[ws.chains ? 'chains' : ws.tyre];
      if (ws.flat) {
        ws.tread = Math.max(0, ws.tread - T.flat.treadPerM * dm);
        if (ws.tread <= 0) ws.rim = Math.max(0, ws.rim - T.flat.rimPerM * dm);
      } else if (!ws.chains) ws.tread = Math.max(0, ws.tread - T.wearKm.tread * (dm / 1000) * g.wear * T.treadSurface[surf] - 0.02 * slid);
      // punctures: one draw per 50 m rolled, from an integer hash of (seed, wheel, segment)
      const seg = Math.floor(w.rolled / 50);
      if (!ws.flat && seg > ws.seg) {
        const worn = 1 - ws.tread / 100;
        const p = (T.punctureP100[surf] / 100) * 0.05 * g.puncture * (1 + 3 * worn * worn) * s.hazardScale;
        for (let k = ws.seg + 1; k <= seg && !ws.flat; k++) if (hash3(s.seed, i, k, 0x7075) / 4294967296 < p) this.puncture(i);
        ws.seg = seg;
      } else if (seg > ws.seg) ws.seg = seg;
      // a hard hit on this wheel can pinch the tyre
      if (!ws.flat && f.thumps !== this.lastThumps && f.lastThumpWheel === i && f.lastThump > 3) {
        const p = Math.min(0.5, (f.lastThump - 3) / 6) * g.puncture * s.hazardScale;
        if (hash3(s.seed, i + 10, f.thumps, 0x70696e) / 4294967296 < p) this.puncture(i);
      }
    }
  }

  /** litres into (or, negative, out of) the tank; the sim's tank and the needle follow at once */
  addFuel(l: number): void {
    const s = this.state;
    s.fuelL = Math.min(this.tankL, Math.max(0, s.fuelL + l));
    if (this.sim && Number.isFinite(this.sim.fuelL)) this.sim.fuelL = s.fuelL;
    this.updateDash(false);
  }

  /** top up the coolant (share of a full radiator); cold water brings the temperature down a little */
  addCoolant(share: number): void {
    const s = this.state;
    const before = s.coolant;
    s.coolant = Math.min(1, Math.max(0, s.coolant + share));
    s.coolantC -= (s.coolantC - Math.min(this.ambient, 25)) * Math.min(0.5, (s.coolant - before) * 0.8);
    this.updateDash(false);
  }

  /** a tyre goes flat (also a debug hook) */
  puncture(i: number): void {
    const ws = this.state.wheels[i];
    if (!ws || ws.flat || ws.off) return;
    ws.flat = true;
    this.events.punctures++;
  }

  /** the suspension in its slot decides the vehicle's description: put it in force (after fitting one) */
  refreshSpec(): void {
    const sim = this.sim;
    if (!sim) return;
    const want = suspendedSpec(this.spec, this.state.slots.suspension?.id);
    if (want === this.spec ? sim.spec !== this.spec : JSON.stringify(want) !== JSON.stringify(sim.spec)) sim.applySpec(want);
  }

  /** write the multipliers the physics reads */
  applyMods(): void {
    const sim = this.sim;
    if (!sim) return;
    const s = this.state;
    const m = sim.mods;
    const eng = this.part('engine');
    let torque = 0;
    let rpmLimit = 1;
    if (eng) {
      torque = (this.eff('engine').torque as number) ?? 1;
      if (eng.cond <= 0) {
        torque *= 0.35;
        rpmLimit = 0.6;
      } else if (eng.cond < 40) torque *= 0.85 + (0.15 * eng.cond) / 40;
      if (s.coolantC >= TUNE.redC) torque *= TUNE.limpTorque;
      // misfire quirk: under heavy load, a short stumble about every 4 s (deterministic in time)
      if (this.hasQuirk('misfire_load') && sim.throttle > 0.8) {
        const k = Math.floor(this.time * 8);
        if (hash3(s.seed, k, 0x6d6973) % 32 === 0) torque *= 0.3;
      }
    }
    m.torque = torque;
    m.rpmLimit = rpmLimit;
    m.fuel = ((this.eff('engine').fuel as number) ?? 1) * (eng && eng.cond < 40 ? 1.08 : 1);
    m.engineCanRun = s.running;
    const br = this.part('brakes');
    const bk = br ? ((this.eff('brakes').brake as number) ?? 1) * (0.75 + (0.25 * br.cond) / 100) : 0.6;
    let bias = 0;
    for (const q of this.quirks) if (q.effect.brakeBias) bias = q.effect.brakeBias;
    m.brake[0] = m.brake[2] = bk * (1 + bias);
    m.brake[1] = m.brake[3] = bk * (1 - bias);
    let pull = 0;
    for (let i = 0; i < 4; i++) {
      const ws = s.wheels[i];
      const g = TYRE_GRIP[ws.chains ? 'chains' : ws.tyre];
      const tread = 0.85 + (0.15 * ws.tread) / 100;
      const flat = ws.flat ? TUNE.flat.mu : 1;
      for (let k = 0; k < SURFACE_COUNT; k++) {
        m.mu[i * SURFACE_COUNT + k] = g.mu[k] * tread * flat;
        m.rr[i * SURFACE_COUNT + k] = g.rr * (ws.flat ? TUNE.flat.rr : 1);
      }
      m.radiusDrop[i] = ws.flat ? TUNE.flat.drop * (ws.tread <= 0 ? 1.4 : 1) : 0;
      if (ws.flat && i < 2) pull += (i === 0 ? -1 : 1) * TUNE.flat.pull;
      if (ws.off) {
        // no wheel: the corner sits on its hub, which scrapes rather than rolls
        m.radiusDrop[i] = this.spec.wheelRadius * 0.55;
        for (let k = 0; k < SURFACE_COUNT; k++) {
          m.mu[i * SURFACE_COUNT + k] = 0.5;
          m.rr[i * SURFACE_COUNT + k] = 25;
        }
      }
    }
    let play = 0;
    for (const q of this.quirks) if (q.effect.steerPlayDeg) play += (q.effect.steerPlayDeg * Math.PI) / 180;
    const susp = this.part('suspension');
    if (susp && susp.cond < 20) play += (1 * Math.PI) / 180;
    m.steerPlay = play;
    m.steerPull = pull;
  }

  // ------------------------------------------------------------------ dashboard

  private lampLevels(): Record<LampId, LampLevel> {
    const s = this.state;
    const L: Record<LampId, LampLevel> = { battery: 0, fuel: 0, temp: 0, tyres: 0, engine: 0, brakes: 0, handbrake: 0 };
    const tank = this.tankL;
    if (this.spec.fuel) L.fuel = s.fuelL <= 0 ? 2 : s.fuelL < tank * 0.12 ? 1 : 0;
    const cap = this.batteryCap;
    L.battery = !this.part('battery') || s.battery < TUNE.minCrankCharge ? 2 : s.battery < cap * 0.25 || (s.ignition === 'on' && !s.running) ? 1 : 0;
    L.temp = s.coolantC >= TUNE.redC ? 2 : s.coolantC >= TUNE.yellowC || s.coolant < 0.5 ? 1 : 0;
    L.tyres = s.wheels.some((w) => w.flat || w.off) ? 2 : s.wheels.some((w) => w.tread < 20) ? 1 : 0;
    const eng = this.part('engine');
    L.engine = !eng || eng.cond <= 0 ? 2 : eng.cond < 40 ? 1 : 0;
    const br = this.part('brakes');
    L.brakes = !br || br.cond < 15 ? 2 : br.cond < 35 ? 1 : 0;
    L.handbrake = this.sim && this.sim.parkBrake > 0 ? 1 : 0;
    return L;
  }

  private messageFor(L: Record<LampId, LampLevel>): { zh: string; en: string; code: string } {
    const s = this.state;
    if (!this.part('engine')) return { code: 'no_engine', zh: '没装发动机。', en: 'There is no engine in it.' };
    if (L.battery === 2) return { code: 'battery_flat', zh: '电瓶没电了。', en: 'The battery is flat.' };
    if (L.fuel === 2) return { code: 'no_fuel', zh: '没油了。', en: 'We are out of fuel.' };
    if (L.temp === 2) return { code: 'overheat', zh: '水温太高了，歇一会儿再走。', en: 'It is boiling. Let it rest a while.' };
    if (s.wheels.some((w) => w.off)) return { code: 'wheel_off', zh: '少一只轮子。', en: 'A wheel is missing.' };
    if (L.tyres === 2) return { code: 'flat_tyre', zh: '有只轮胎瘪了。', en: 'One of the tyres is flat.' };
    if (L.engine === 2) return { code: 'engine_broken', zh: '发动机坏了，只能慢慢开。', en: 'The engine is broken. We can only crawl.' };
    if (L.brakes === 2) return { code: 'brakes_worn', zh: '刹车快磨没了。', en: 'The brakes are nearly gone.' };
    if (L.fuel === 1) return { code: 'low_fuel', zh: '油不多了。', en: 'Fuel is getting low.' };
    if (L.temp === 1) return { code: 'hot', zh: '水温有点高。', en: 'It is running hot.' };
    if (s.coolant < 0.5) return { code: 'low_coolant', zh: '水箱缺水了。', en: 'The radiator is low on water.' };
    return { code: '', zh: '', en: '' };
  }

  private updateDash(cranking: boolean): void {
    const s = this.state;
    const sim = this.sim;
    const d = this.dash;
    d.speedKmh = sim ? sim.kmh : 0;
    const idleQ = this.quirks.find((q) => q.effect.idleWobbleRpm);
    d.idleWobbleRpm = idleQ && s.running && sim && sim.throttle < 0.1 && sim.speed < 1 ? idleQ.effect.idleWobbleRpm ?? 0 : 0;
    d.rpm = sim ? (s.running ? sim.rpm : cranking ? 220 : 0) : 0;
    d.selector = sim ? sim.selector : 'D';
    d.gear = sim ? sim.gear : 1;
    d.manual = sim ? sim.manual : false;
    d.gearLabel = d.selector !== 'D' ? d.selector : d.manual ? `M${d.gear}` : `D${d.gear}`;
    d.tankL = this.tankL;
    d.fuelL = s.fuelL;
    d.fuel = d.tankL > 0 ? clamp(s.fuelL / d.tankL, 0, 1) : 0;
    d.coolantC = s.coolantC;
    d.temp = clamp((s.coolantC - 40) / 90, 0, 1);
    const cap = this.batteryCap;
    d.battery = cap > 0 ? clamp(s.battery / cap, 0, 1) : 0;
    d.volts = !this.part('battery') ? 0 : s.running ? 14.1 : cranking ? 10.2 + 1.2 * d.battery : 11.6 + 1.1 * d.battery;
    d.odometerKm = s.odometerM / 1000;
    d.ignition = s.ignition;
    d.running = s.running;
    d.cranking = cranking;
    d.handbrake = !!sim && sim.parkBrake > 0;
    d.lights = s.lights;
    d.lightsOn = this.lightsOn;
    d.highBeam = d.lightsOn && s.lights === 'high';
    d.wipers = s.wipers;
    d.hazard = s.hazard;
    d.horn = this.horn;
    d.limp = this.limp;
    const L = this.lampLevels();
    const sc = d.selfCheck;
    sc.active = this.selfCheckT < 1.2 && s.ignition === 'on';
    if (sc.active) {
      // lamps come on one after another (0.15 s apart), then each shows its verdict
      sc.step = Math.min(LAMPS.length, Math.floor(this.selfCheckT / 0.15) + 1);
      for (let i = 0; i < LAMPS.length; i++) d.lamps[LAMPS[i]] = i < sc.step ? (Math.max(1, L[LAMPS[i]]) as LampLevel) : 0;
    } else {
      sc.step = LAMPS.length;
      for (const k of LAMPS) d.lamps[k] = s.ignition === 'off' ? 0 : L[k];
    }
    sc.results = LAMPS.map((lamp) => ({ lamp, level: L[lamp] }));
    const msg = this.messageFor(L);
    d.message.zh = msg.zh;
    d.message.en = msg.en;
    d.message.code = msg.code;
    d.quirks = this.quirks.map((q) => q.id);
    d.headlightFlicker = this.flicker;
  }

  // ------------------------------------------------------------------ save / load

  /** the tool kit stowed in the vehicle (any size); operations reach it like the hands and packs */
  get kit(): ItemStore {
    if (!this.kitStore) {
      this.kitStore = new ItemStore(KIT_SLOTS, ANY_SIZE);
      this.kitStore.load(this.state.kit ?? STOCK_KIT.map((id) => ({ id, n: 1 })));
    }
    return this.kitStore;
  }
  private kitStore: ItemStore | null = null;

  toJSON(): SystemsState {
    if (this.kitStore) this.state.kit = this.kitStore.toJSON();
    return JSON.parse(JSON.stringify(this.state)) as SystemsState;
  }

  static fromJSON(spec: VehicleSpec, json: SystemsState): VehicleSystems {
    return new VehicleSystems(spec, JSON.parse(JSON.stringify(json)) as SystemsState);
  }

  /** current speed in km/h (helper for the operations) */
  get kmh(): number {
    return this.sim ? this.sim.speed * KMH : 0;
  }
}

/**
 * The operations a player can perform from the driver's seat, for the interior track to hang levers,
 * switches and gauges on. `method` names a method of VehicleSystems.
 */
export const VEHICLE_CONTROLS = [
  { id: 'ignition', zh: '钥匙', en: 'Ignition key', kind: 'lever', method: 'turnKey', key: 'K (tap: off / on; hold: start)' },
  { id: 'starter', zh: '打火', en: 'Starter', kind: 'hold', method: 'crank', key: 'K (hold)' },
  { id: 'selector', zh: '挡杆', en: 'Gear selector', kind: 'lever', method: 'stepLever', key: 'Q (towards P / up), Z (towards D / down)' },
  { id: 'manual', zh: '手动模式', en: 'Manual mode', kind: 'toggle', method: 'toggleManual', key: 'M' },
  { id: 'handbrake', zh: '手刹', en: 'Handbrake', kind: 'lever', method: 'toggleHandbrake', key: 'Space (hold = pull; held at a stop = latch; tap = release)' },
  { id: 'lights', zh: '车灯', en: 'Lights', kind: 'cycle', method: 'cycleLights', key: 'L' },
  { id: 'wipers', zh: '雨刷', en: 'Wipers', kind: 'cycle', method: 'cycleWipers', key: 'V' },
  { id: 'horn', zh: '喇叭', en: 'Horn', kind: 'hold', method: 'setHorn', key: 'H' },
  { id: 'hazard', zh: '双闪', en: 'Hazard lights', kind: 'toggle', method: 'toggleHazard', key: 'B' },
  { id: 'heater', zh: '暖风', en: 'Heater', kind: 'toggle', method: 'setHeater', key: '—' },
  { id: 'radio', zh: '收音机', en: 'Radio', kind: 'toggle', method: 'setRadio', key: '—' },
  { id: 'cabinLight', zh: '车内灯', en: 'Cabin light', kind: 'toggle', method: 'setCabinLight', key: '—' },
] as const;
