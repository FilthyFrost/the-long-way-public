/**
 * A ModCar build alive (docs/MODCAR.md §3, §5): the key and the starter, fuel by type, oil, coolant
 * temperature, the battery, lamps and horn, turbo lag, wear and dirt. Reads what the simulation did and
 * writes `sim.mods`, `sim.engineOn`, `sim.cranking` — the same narrow link as the old slot systems
 * (src/core/vehicle/systems), but everything comes from the parts that are actually fitted.
 *
 * Game scale: the world is compressed about five to one (VehicleSpec.fuel), so electricity and heat run
 * five times faster than in a real car as well.
 */
import type { VehicleSim } from '../vehicle/sim';
import { frameDef } from './frames';
import { derive, tankFuel, type Derived } from './derive';
import { partDef } from './parts';
import { batteryCharge, crankProblems, driveProblems, fuelQuality, runProblems, type Problem } from './rules';
import { applyToSim, applyWheelMods } from './simlink';
import type { Build, PartInstance, Text } from './types';

const GAME = 5;
/** how much tread a tyre loses before its grip is derived again (a fraction of new) */
const GRIP_TREAD_STEP = 0.005;
const AMBIENT_DEFAULT = 15;
/** heat capacity of block + coolant (kJ/K): how slowly the temperature moves */
const HEAT_CAP = 100;
/** heat runs a little faster than real time (a boil-over takes a minute, not five) */
const HEAT_TIME = 2;
const NORMAL_C = 90;
/** above this the engine loses power; past SEIZE_C for SEIZE_S seconds it seizes */
const HOT_C = 112;
const SEIZE_C = 128;
const SEIZE_S = 4;
/** starter draw at game scale (kW) and the alternator's charge while running (kW) */
const STARTER_KW = 1.6 * GAME;
const ALTERNATOR_KW = 0.35 * GAME;

export type LightSwitch = 'off' | 'low' | 'high';

export interface ModEnv {
  ambientC: number;
  dark: boolean;
  rain: number;
  /** 0 night … 1 full sun (solar panels) */
  sun: number;
  /** ground surface under the vehicle (src/core/world/ground.ts), for dirt */
  surface?: number;
}

export interface Dash {
  rpm: number;
  kmh: number;
  /** 0…1 of the tank (0 with no tank) */
  fuel: number;
  tankL: number;
  coolantC: number;
  battery: number;
  oil: number;
  running: boolean;
  cranking: boolean;
  gearLabel: string;
  handbrake: boolean;
  lights: LightSwitch;
  lightsOn: boolean;
  horn: boolean;
  hornSound: string;
  /** turbo boost 0…1 (for the gauge and the whistle) */
  boost: number;
  /** what the car is telling you right now (self-check, a stall, overheating) */
  message: { code: string; text: Text } | null;
  lamps: { battery: boolean; oil: boolean; temp: boolean; fuel: boolean; check: boolean };
}

export class ModSystems {
  derived: Derived;
  sim: VehicleSim | null = null;
  running = false;
  cranking = false;
  lights: LightSwitch = 'off';
  horn = false;
  /** the radio switched on (it draws its watts only then) */
  radioOn = false;
  /** assist: stopped, S drives backwards (else the gear lever has to go to R) */
  assistReverse = true;
  coolantC = AMBIENT_DEFAULT;
  /** turbo spool 0…1 */
  boost = 0;
  /** seconds the starter has turned; seconds over the seizing temperature */
  private crankT = 0;
  private hotT = 0;
  /** coughing on bad fuel: seconds until it dies */
  private sputter = -1;
  private message: Dash['message'] = null;
  private messageT = 0;
  private lastFuelUsed = 0;
  private readonly rolled = [0, 0, 0, 0];
  private readonly slid = [0, 0, 0, 0];
  /** the tread of each wheel's tyre when its grip was last put in force */
  private readonly gripTread = [1, 1, 1, 1];
  private lastOdo = 0;
  readonly dash: Dash = {
    rpm: 0,
    kmh: 0,
    fuel: 0,
    tankL: 0,
    coolantC: AMBIENT_DEFAULT,
    battery: 0,
    oil: 0,
    running: false,
    cranking: false,
    gearLabel: 'N',
    handbrake: false,
    lights: 'off',
    lightsOn: false,
    horn: false,
    hornSound: 'beep',
    boost: 0,
    message: null,
    lamps: { battery: false, oil: false, temp: false, fuel: false, check: false },
  };

  constructor(public build: Build) {
    this.derived = derive(build);
    this.noteGripTread();
  }

  /** take charge of a simulation made for this build (its spec is derived.spec) */
  bind(sim: VehicleSim): this {
    this.sim = sim;
    applyToSim(sim, this.derived, true);
    this.syncFuelIn();
    sim.engineOn = this.running;
    sim.cranking = false;
    this.lastFuelUsed = sim.fuelUsedL;
    this.lastOdo = sim.odometer;
    for (let i = 0; i < 4; i++) {
      this.rolled[i] = sim.wheels[i].rolled;
      this.slid[i] = sim.wheels[i].slid;
    }
    this.enforceGearbox();
    return this;
  }

  /**
   * After a part went on or came off: derive again and put the result in force in place (the vehicle
   * keeps its pose). Returns the new derived build.
   */
  rebuild(): Derived {
    this.derived = derive(this.build);
    this.noteGripTread();
    const sim = this.sim;
    if (sim) {
      this.syncFuelOut();
      applyToSim(sim, this.derived);
      this.syncFuelIn();
      this.enforceGearbox();
    }
    // an engine taken out, or its fuel or battery, stops it
    if (this.running && (crankProblems(this.build).some((p) => p.code === 'no_engine') || !this.derived.engine)) this.stop('');
    return this.derived;
  }

  /** remember the tread each wheel's grip was derived with */
  private noteGripTread(): void {
    const hubs = this.derived.wheels;
    for (let i = 0; i < 4; i++) this.gripTread[i] = this.build.parts[hubs[i]?.hub]?.sub.tire?.tread ?? 1;
  }

  // ------------------------------------------------------------------ the driver's controls

  /** key held: the starter turns while there is a battery to turn it */
  crank(on: boolean): void {
    if (!on) {
      this.cranking = false;
      this.crankT = 0;
      return;
    }
    if (this.running) return;
    const blocking = crankProblems(this.build);
    if (blocking.length) {
      this.say(blocking[0]);
      this.cranking = false;
      return;
    }
    this.cranking = true;
  }

  /** a running engine switched off with the key */
  stop(reason: string, text?: Text): void {
    this.running = false;
    this.cranking = false;
    this.sputter = -1;
    if (this.sim) this.sim.engineOn = false;
    if (reason && text) this.sayText(reason, text);
  }

  /** start straight away (tests, the robot driver, ?start=road): only if it could start */
  startNow(): boolean {
    if (crankProblems(this.build).length || runProblems(this.build).some((p) => p.severity === 'block')) return false;
    this.running = true;
    this.cranking = false;
    if (this.sim) this.sim.engineOn = true;
    return true;
  }

  cycleLights(): LightSwitch {
    this.lights = this.lights === 'off' ? 'low' : this.lights === 'low' ? 'high' : 'off';
    return this.lights;
  }

  setHorn(on: boolean): void {
    this.horn = on && this.hasPart('horn') && batteryCharge(this.build) > 0.02;
  }

  /**
   * The lever one step: −1 towards D / up a gear, +1 towards R / down (game.ts convention: Q up, Z down).
   * No gear lever: stuck in first; a gearbox without reverse refuses R; no gearbox: always neutral.
   */
  stepLever(delta: number): boolean {
    const sim = this.sim;
    if (!sim) return false;
    if (!this.derived.gearbox) return false;
    if (!this.hasPart('gearLever')) return false;
    if (sim.manual && sim.selector === 'D') {
      return delta < 0 ? sim.shiftUp() : sim.shiftDown();
    }
    const order = ['P', 'R', 'N', 'D'] as const;
    let i = order.indexOf(sim.selector) + (delta < 0 ? 1 : -1);
    i = Math.max(0, Math.min(order.length - 1, i));
    if (order[i] === 'R' && this.derived.gearbox.gearbox!.reverse <= 0) i += delta < 0 ? 1 : -1;
    i = Math.max(0, Math.min(order.length - 1, i));
    return sim.shift(order[i]);
  }

  // ------------------------------------------------------------------ queries

  hasPart(cat: string): boolean {
    const frame = frameDef(this.build.frame);
    return frame.mounts.some((m) => m.cat === cat && this.build.parts[m.id]);
  }

  get lightsOn(): boolean {
    return this.lights !== 'off' && batteryCharge(this.build) > 0.02 && this.hasPart('headlight');
  }

  /** what keeps it from going: the first blocking problem (for the self-check and the HUD) */
  firstProblem(): Problem | null {
    return crankProblems(this.build)[0] ?? runProblems(this.build).find((p) => p.severity === 'block') ?? driveProblems(this.build)[0] ?? null;
  }

  // ------------------------------------------------------------------ every step

  update(dt: number, env: ModEnv = { ambientC: AMBIENT_DEFAULT, dark: false, rain: 0, sun: 1 }): void {
    const sim = this.sim;
    const b = this.build;
    const d = this.derived;
    const eng = d.engine;
    if (this.messageT > 0) this.messageT -= dt;
    if (this.messageT <= 0) this.message = null;
    if (!sim) return;

    this.knocks(sim);

    // fuel the simulation burnt comes out of the tank, type by type
    const used = sim.fuelUsedL - this.lastFuelUsed;
    this.lastFuelUsed = sim.fuelUsedL;
    if (used > 0) this.burn(used);

    // starter: turns the engine over; it catches if it can run
    const bat = this.instOf('battery');
    if (this.cranking) {
      this.crankT += dt;
      this.drain(STARTER_KW * dt);
      if (!bat || (bat.fluids.charge ?? 0) < 0.02) {
        this.cranking = false;
        this.sayText('battery_flat', { zh: '电瓶没劲了：启动机转不动了。', en: 'The battery gave out: the starter stops turning.' });
      } else if (this.crankT > (this.coolantC < 5 ? 1.6 : 0.8)) {
        const run = runProblems(b).find((p) => p.severity === 'block');
        if (!run) {
          this.running = true;
          this.cranking = false;
          this.crankT = 0;
          const q = eng ? fuelQuality(eng, b) : null;
          this.sputter = q && q.wrong > 0.05 && !q.runs ? 1.8 : -1;
        } else if (this.crankT > 2.2) {
          // it would have caught by now: say why not
          this.say(run);
          this.cranking = false;
          this.crankT = 0;
        }
      }
    }

    // running: fuel, oil, the wrong fuel coughs it to death
    let torqueMul = 1;
    let canRun = this.running;
    if (this.running && eng) {
      const q = fuelQuality(eng, b);
      if (tankFuel(b).total <= 1e-4) {
        this.stop('no_fuel', { zh: '没油了。', en: 'Out of fuel.' });
        canRun = false;
      } else if (!q.runs) {
        if (this.sputter < 0) this.sputter = 1.8;
        this.sputter -= dt;
        torqueMul *= 0.25;
        if (this.sputter <= 0) {
          this.stop('wrong_fuel', { zh: '突突两下，熄火了：油不对。', en: 'It coughed and died: wrong fuel.' });
          canRun = false;
        }
      } else torqueMul *= q.power;
      const ei = this.instOf('engine');
      if (ei && q.wear > 0) ei.cond = Math.max(0, ei.cond - q.wear * dt * GAME / 3600);
      if (ei && eng.engine!.oilL > 0 && (ei.fluids.oilL ?? 0) < eng.engine!.oilL * 0.15) {
        ei.cond = Math.max(0, ei.cond - 0.02 * dt);
        if (ei.cond <= 0) {
          this.stop('seized', { zh: '没机油，发动机抱死了。', en: 'No oil: the engine seized.' });
          canRun = false;
        }
      }
      // a thin trickle of oil is used running
      if (ei && ei.fluids.oilL !== undefined) ei.fluids.oilL = Math.max(0, ei.fluids.oilL - 0.0004 * dt * GAME);
      if (ei) torqueMul *= 0.55 + 0.45 * ei.cond;
    }
    if (!eng) canRun = false;

    // heat: what the engine makes against what the radiator (or its own fins) sheds
    const amb = env.ambientC;
    const air = 0.35 + Math.min(1, sim.speed / 22);
    let shed = 0;
    if (eng?.engine) {
      const e = eng.engine;
      const scoop = this.hoodCooling();
      if (e.cooling === 'water') {
        const ri = this.instOf('radiator');
        if (ri) {
          const rs = partDef(ri.part).radiator!;
          const level = Math.min(1, (ri.fluids.coolantL ?? 0) / rs.coolantL);
          shed = rs.coolKw * air * (0.15 + 0.85 * level) * (1 + scoop);
          // a hot engine boils a little coolant off
          if (this.coolantC > 104) ri.fluids.coolantL = Math.max(0, (ri.fluids.coolantL ?? 0) - 0.002 * dt * GAME);
        } else shed = 4 * air;
      } else shed = (e.selfCoolKw ?? 20) * air * (1 + scoop);
    }
    // about half of the power turns into heat the coolant (or the fins) must carry; until the thermostat
    // opens only the small loop round the block warms, so a cold engine comes up to temperature quickly
    const heatIn = this.running && eng ? sim.engineKw * (eng.engine?.heat ?? 1) * 0.55 + 2.5 : 0;
    const k = Math.max(0, (this.coolantC - amb) / (NORMAL_C - amb));
    const open = this.coolantC >= NORMAL_C - 6;
    const cap = open ? HEAT_CAP : HEAT_CAP * 0.3;
    this.coolantC += ((heatIn - shed * k * (open ? 1 : 0.04)) / cap) * dt * HEAT_TIME;
    if (!this.running) this.coolantC += (amb - this.coolantC) * Math.min(1, dt / 240);
    this.coolantC = Math.max(amb - 5, Math.min(140, this.coolantC));
    if (this.coolantC > HOT_C) torqueMul *= Math.max(0.45, 1 - (this.coolantC - HOT_C) / 28);
    if (this.coolantC > SEIZE_C && this.running) {
      this.hotT += dt;
      if (this.hotT > SEIZE_S) {
        const ei = this.instOf('engine');
        if (ei) ei.cond = 0;
        this.stop('seized', { zh: '开锅太久，发动机拉缸了。', en: 'Boiled too long: the engine seized.' });
        canRun = false;
      } else if (this.messageT <= 0) this.sayText('overheat', { zh: '水温爆表了！快停车！', en: 'It is boiling over: stop now!' });
    } else this.hotT = 0;

    // turbo: boost follows the throttle and the revs with its lag
    const ti = this.instOf('engine')?.sub.turbo;
    if (ti && eng?.engine) {
      const t = partDef(ti.part).turbo!;
      const want = this.running ? sim.throttle * smooth(t.spoolRpm - 400, t.spoolRpm + 900, sim.rpm) : 0;
      this.boost += (want - this.boost) * Math.min(1, dt / Math.max(0.05, t.lag));
      // the derived curve already has full boost in it: take back what is not built yet
      const full = 1 + (t.boost - 1) * smooth(t.spoolRpm, t.spoolRpm + 1200, sim.rpm);
      torqueMul *= (1 + (t.boost - 1) * this.boost * smooth(t.spoolRpm, t.spoolRpm + 1200, sim.rpm)) / full;
    } else this.boost = 0;

    // electricity: lamps, radio, horn draw; the alternator and a solar roof give
    let loadKw = 0;
    if (this.lightsOn) {
      for (const m of d.frame.mounts) {
        if (m.cat !== 'headlight' && m.cat !== 'taillight' && m.cat !== 'roof') continue;
        const p = this.build.parts[m.id];
        if (!p) continue;
        const def = partDef(p.part);
        // (a roof light bar comes on with the high beam)
        loadKw += ((def.lamp?.watts ?? 0) * (this.lights === 'high' && m.cat === 'headlight' ? 1.3 : 1) + (this.lights === 'high' ? (def.roof?.lightW ?? 0) : 0)) / 1000;
      }
    }
    if (this.horn) loadKw += 0.06;
    const radio = this.instOf('radio');
    if (radio && this.radioOn) loadKw += (partDef(radio.part).radio?.watts ?? 0) / 1000;
    this.drain(loadKw * GAME * dt);
    if (this.running) this.drain(-ALTERNATOR_KW * dt);
    const roof = this.instOf('roof');
    const solar = roof ? (partDef(roof.part).roof?.solarW ?? 0) : 0;
    if (solar > 0) this.drain((-solar / 1000) * env.sun * GAME * dt);

    // what goes to the simulation
    const m = sim.mods;
    m.engineCanRun = canRun && this.running;
    m.torque = torqueMul;
    sim.engineOn = this.running;
    sim.cranking = this.cranking;
    if (Number.isFinite(sim.fuelL)) this.syncFuelIn();
    this.enforceGearbox();

    // wear and dirt from the road
    const odo = sim.odometer - this.lastOdo;
    this.lastOdo = sim.odometer;
    this.wear(odo, env);

    this.updateDash(env);
  }

  // ------------------------------------------------------------------ helpers

  /** hits against solids already answered for */
  private lastSolidHits = 0;

  /**
   * A knock against a wall, a post, a wreck: the parts at the end that took it lose condition by how fast
   * it was going (over 3 m/s), the bumper there first; a ram takes most of the blow off what is behind it,
   * armour some. Hard enough head-on, the radiator splits and its coolant runs out. Says what broke.
   */
  private knocks(sim: VehicleSim): void {
    if (sim.hits === this.lastSolidHits) return;
    this.lastSolidHits = sim.hits;
    const v = sim.lastHitSpeed;
    if (v < 3) return;
    const front = sim.lastHitFront;
    const b = this.build;
    const frame = this.derived.frame;
    const bumperId = front ? 'bumperFront' : 'bumperRear';
    const bumper = b.parts[bumperId];
    const ram = bumper ? (partDef(bumper.part).bumper?.ram ?? 0) : 0;
    const k = (v - 3) * 0.04;
    const broke: string[] = [];
    const hurt = (mount: string, amount: number): void => {
      const inst = b.parts[mount];
      if (!inst || amount <= 0) return;
      const was = inst.cond;
      inst.cond = Math.max(0, inst.cond - amount);
      if (was >= 0.35 && inst.cond < 0.35) broke.push(partDef(inst.part).name.zh);
    };
    hurt(bumperId, k * 1.2);
    // what is behind it at that end
    const through = k * (1 - 0.8 * ram) * (1 - 0.5 * this.derived.armor);
    const atEnd = (x: number): boolean => (front ? x > frame.body.front * 0.4 : x < frame.body.rear * 0.4);
    for (const m of frame.mounts) {
      if (m.id === bumperId || !atEnd(m.pos.x)) continue;
      if (m.cat === 'headlight' || m.cat === 'taillight') hurt(m.id, through * 1.6);
      else if (m.cat === 'hood' || m.cat === 'trunk' || m.cat === 'radiator' || m.cat === 'horn' || m.cat === 'exhaust') hurt(m.id, through);
      else if (m.cat === 'engine') hurt(m.id, through * 0.3);
    }
    const ri = this.instOf('radiator');
    if (front && ri && through > 0.12 && (ri.fluids.coolantL ?? 0) > 0) {
      ri.fluids.coolantL = (ri.fluids.coolantL ?? 0) * 0.3;
      broke.push('水箱（在漏水）');
    }
    if (broke.length) this.sayText('crash', { zh: `撞坏了：${broke.join('、')}。`, en: 'The crash broke something.' });
  }

  private instOf(cat: string): PartInstance | null {
    const frame = frameDef(this.build.frame);
    for (const mt of frame.mounts) if (mt.cat === cat && this.build.parts[mt.id]) return this.build.parts[mt.id];
    return null;
  }

  private hoodCooling(): number {
    const h = this.instOf('hood');
    return h ? (partDef(h.part).panel?.cooling ?? 0) : 0.05;
  }

  /** kWh out of the battery (negative = in) */
  private drain(kWh: number): void {
    const bi = this.instOf('battery');
    if (!bi) return;
    const cap = partDef(bi.part).battery!.kWh;
    bi.fluids.charge = Math.min(1, Math.max(0, (bi.fluids.charge ?? 0) - kWh / 3600 / cap));
  }

  private burn(litres: number): void {
    const ti = this.instOf('fuelTank');
    if (!ti?.fluids.fuel) return;
    const f = ti.fluids.fuel;
    const total = (f.petrol ?? 0) + (f.diesel ?? 0) + (f.mix2t ?? 0);
    if (total <= 0) return;
    const k = Math.max(0, 1 - litres / total);
    if (f.petrol) f.petrol *= k;
    if (f.diesel) f.diesel *= k;
    if (f.mix2t) f.mix2t *= k;
  }

  /** the simulation tracks one fuel number: the tank's total */
  private syncFuelIn(): void {
    if (!this.sim) return;
    this.sim.fuelL = this.derived.engine ? tankFuel(this.build).total : 0;
  }

  /** before a rebuild: what the simulation burnt since the last step is already in the tank (update) */
  private syncFuelOut(): void {
    if (!this.sim) return;
    const used = this.sim.fuelUsedL - this.lastFuelUsed;
    this.lastFuelUsed = this.sim.fuelUsedL;
    if (used > 0) this.burn(used);
  }

  /** no gearbox: neutral, always; no lever: first gear, no reverse */
  private enforceGearbox(): void {
    const sim = this.sim;
    if (!sim) return;
    // the simulation's convenience of picking R and D by itself needs a lever, a gearbox and a reverse gear
    const gb = this.derived.gearbox?.gearbox;
    sim.autoReverse = this.assistReverse && !!gb && gb.reverse > 0 && this.hasPart('gearLever');
    if (!this.derived.gearbox) {
      if (sim.selector !== 'N') sim.shift('N');
      return;
    }
    if (!this.hasPart('gearLever')) {
      if (sim.selector !== 'D') sim.shift('D');
      sim.setManual(true);
      sim.gear = 1;
    }
  }

  private wear(metres: number, env: ModEnv): void {
    const sim = this.sim!;
    if (metres <= 0) return;
    // tyres: tread per distance rolled, faster sliding
    const hubs = this.derived.wheels;
    let regrip = false;
    for (let i = 0; i < 4; i++) {
      const w = sim.wheels[i];
      const dr = w.rolled - this.rolled[i];
      const ds = w.slid - this.slid[i];
      this.rolled[i] = w.rolled;
      this.slid[i] = w.slid;
      const hub = this.build.parts[hubs[i].hub];
      const tyre = hub?.sub.tire;
      if (!tyre || tyre.tread === undefined) continue;
      const def = partDef(tyre.part).tire!;
      // motorcycles list each wheel twice: halve so a wheel is not worn twice as fast
      const share = this.derived.frame.balance ? 0.5 : 1;
      tyre.tread = Math.max(0, tyre.tread - share * ((def.wear * (dr + ds * 8)) / 100000));
      if (Math.abs(tyre.tread - this.gripTread[i]) > GRIP_TREAD_STEP) regrip = true;
    }
    // (a step of wear puts the grip it leaves in force: derive again, the wheels' facts only)
    if (regrip) {
      this.derived.wheels = derive(this.build).wheels;
      applyWheelMods(sim, this.derived);
      this.noteGripTread();
    }
    // dirt: dust and mud by the ground, faster in the rain on soft ground
    const soft = env.surface === undefined ? 0 : env.surface >= 1 && env.surface <= 4 ? 1 : env.surface === 5 ? 0.6 : 0.1;
    const rate = (0.004 + 0.03 * soft * (1 + 2 * env.rain)) / 1000;
    const add = rate * metres;
    this.build.dirt = Math.min(1, this.build.dirt + add);
    for (const inst of Object.values(this.build.parts)) inst.dirt = Math.min(1, inst.dirt + add * 0.8);
  }

  private say(p: Problem): void {
    this.sayText(p.code, p.text);
  }

  private sayText(code: string, text: Text): void {
    this.message = { code, text };
    this.messageT = 4;
  }

  private updateDash(env: ModEnv): void {
    const sim = this.sim!;
    const dd = this.dash;
    const t = tankFuel(this.build);
    dd.tankL = this.derived.fuelTankL;
    dd.fuel = dd.tankL > 0 ? Math.min(1, t.total / dd.tankL) : 0;
    dd.rpm = this.running || this.cranking ? sim.rpm : 0;
    dd.kmh = sim.kmh;
    dd.coolantC = this.coolantC;
    dd.battery = batteryCharge(this.build);
    const ei = this.instOf('engine');
    const e = this.derived.engine?.engine;
    dd.oil = ei && e && e.oilL > 0 ? Math.min(1, (ei.fluids.oilL ?? 0) / e.oilL) : e ? 1 : 0;
    dd.running = this.running;
    dd.cranking = this.cranking;
    dd.gearLabel = !this.derived.gearbox ? 'N' : sim.selector === 'D' ? (sim.manual ? `M${sim.gear}` : `D${sim.gear}`) : sim.selector;
    dd.handbrake = sim.parkBrake > 0;
    dd.lights = this.lights;
    dd.lightsOn = this.lightsOn;
    dd.horn = this.horn;
    const horn = this.instOf('horn');
    dd.hornSound = horn ? (partDef(horn.part).horn?.sound ?? 'beep') : '';
    dd.boost = this.boost;
    dd.message = this.message;
    const keyOn = this.running || this.cranking;
    dd.lamps.battery = keyOn && (!this.running || dd.battery < 0.15);
    dd.lamps.oil = keyOn && dd.oil < 0.2;
    dd.lamps.temp = this.coolantC > HOT_C - 4;
    dd.lamps.fuel = dd.fuel < 0.1;
    dd.lamps.check = keyOn && this.firstProblem() !== null;
    void env;
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export { applyWheelMods };
