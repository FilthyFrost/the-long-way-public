/**
 * Vehicle systems: determinism, save/load, the ignition and its self-check, operations with their
 * preconditions and durations, tyres × surfaces, quirks, punctures, the driver's controls on the sim.
 */
import { describe, expect, it } from 'vitest';
import { VehicleSim, zeroInput } from '../../src/core/vehicle/sim';
import { T0_TRUCK, T1_VAN, T2_OFFROAD, VEHICLES } from '../../src/core/vehicle/spec';
import {
  applyOp,
  PARTS_CATALOG,
  planOp,
  quirksFor,
  SimpleInventory,
  stockState,
  TYRE_GRIP,
  TYRE_IDS,
  VEHICLE_CONTROLS,
  VehicleSystems,
  type SystemsEnv,
} from '../../src/core/vehicle/systems';
import { FlatGround, Surface } from '../../src/core/world/ground';

const ENV: SystemsEnv = { ambientC: 20, dark: false, rain: 0 };

function make(spec = T0_TRUCK, seed = 3, fresh = false) {
  const v = new VehicleSim(spec);
  v.reset(0, 0, 0, 0);
  const sys = new VehicleSystems(spec, stockState(spec, seed, { fresh })).bind(v);
  return { v, sys };
}

function drive(v: VehicleSim, sys: VehicleSystems, seconds: number, throttle = 0.6, ground = new FlatGround({ surface: Surface.Gravel }), env = ENV): void {
  const inp = { ...zeroInput(), throttle };
  for (let i = 0; i < Math.round(seconds / v.h); i++) {
    v.substep(inp, ground);
    if (i % 4 === 3) sys.update(v.h * 4, env);
  }
}

describe('vehicle systems', () => {
  it('catalogue ids are unique and well formed', () => {
    const ids = PARTS_CATALOG.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const it of PARTS_CATALOG) {
      expect(it.id).toMatch(/^(part|tyre|acc|fluid|tool)\.[a-z0-9.]+$/);
      expect(it.zh.length).toBeGreaterThan(0);
      expect(it.en.length).toBeGreaterThan(0);
      if (it.kind === 'part') expect(it.slot).toBeTruthy();
    }
  });

  it('is deterministic and survives a save / load round trip', () => {
    const a = make(T0_TRUCK, 11);
    const b = make(T0_TRUCK, 11);
    drive(a.v, a.sys, 40);
    drive(b.v, b.sys, 40);
    expect(JSON.stringify(a.sys.toJSON())).toBe(JSON.stringify(b.sys.toJSON()));
    const saved = JSON.parse(JSON.stringify(a.sys.toJSON()));
    const c = VehicleSystems.fromJSON(T0_TRUCK, saved);
    expect(c.toJSON()).toEqual(a.sys.toJSON());
    // the sim's driver state goes into its own array
    const s = a.v.serialize();
    const w = new VehicleSim(T0_TRUCK);
    w.deserialize(s);
    expect(w.selector).toBe(a.v.selector);
    expect(w.odometer).toBe(a.v.odometer);
  });

  it('a stock system leaves the handling untouched on asphalt (road tyres)', () => {
    const plain = new VehicleSim(T0_TRUCK);
    plain.reset(0, 0, 0, 0);
    const { v, sys } = make(T0_TRUCK, 1, true);
    sys.update(0, ENV);
    const g = new FlatGround();
    const inp = { ...zeroInput(), throttle: 1 };
    for (let i = 0; i < 600; i++) {
      plain.substep(inp, g);
      v.substep(inp, g);
    }
    expect(Math.abs(v.px - plain.px)).toBeLessThan(1e-9);
  });

  it('the starter: flat battery clicks, a jump start gets it going, the self-check names the problem', () => {
    const { v, sys } = make(T1_VAN);
    sys.stopEngine();
    sys.state.battery = 3;
    sys.crank(true);
    drive(v, sys, 3, 0);
    expect(sys.state.running).toBe(false);
    expect(sys.events.clicks).toBeGreaterThan(0);
    expect(sys.dash.message.code).toBe('battery_flat');
    expect(sys.dash.lamps.battery).toBe(2);
    const inv = new SimpleInventory(['tool.jumppack']);
    expect(applyOp(sys, { kind: 'jumpStart', source: 'pack' }, { inv }).ok).toBe(true);
    sys.crank(false);
    sys.crank(true);
    drive(v, sys, 3, 0);
    expect(sys.state.running).toBe(true);
  });

  it('turning the key on runs the self-check lamp by lamp', () => {
    const { v, sys } = make();
    sys.stopEngine();
    sys.turnKey('on');
    sys.update(0.05, ENV);
    expect(sys.dash.selfCheck.active).toBe(true);
    const early = sys.dash.selfCheck.step;
    drive(v, sys, 0.6, 0);
    expect(sys.dash.selfCheck.step).toBeGreaterThan(early);
    drive(v, sys, 1, 0);
    expect(sys.dash.selfCheck.active).toBe(false);
  });

  it('running out of fuel stops the engine; a jerrycan and a start bring it back', () => {
    const { v, sys } = make();
    sys.state.fuelL = 0.02;
    v.fuelL = 0.02;
    drive(v, sys, 20, 1, new FlatGround());
    expect(sys.state.running).toBe(false);
    expect(sys.dash.message.code).toBe('no_fuel');
    // coast to a stop
    for (let i = 0; i < 1200; i++) v.substep({ ...zeroInput(), brake: 1 }, new FlatGround());
    const inv = new SimpleInventory([{ id: 'fuel.jerrycan', litres: 10 }]);
    const plan = planOp(sys, { kind: 'refuel', source: 'can' }, { inv });
    expect(plan.ok).toBe(true);
    expect(plan.seconds).toBeCloseTo(12, 5);
    applyOp(sys, { kind: 'refuel', source: 'can' }, { inv });
    expect(sys.state.fuelL).toBeCloseTo(10, 1);
    expect(inv.items).toEqual([{ id: 'fuel.jerrycan', litres: 0 }]);
    sys.startEngine();
    drive(v, sys, 3, 0, new FlatGround());
    expect(sys.state.running).toBe(true);
  });

  it('changing a wheel: needs a spare, tools and the vehicle secured; two people are faster', () => {
    const { v, sys } = make();
    sys.puncture(0);
    v.autoHold = false;
    v.hold = false;
    const inv = new SimpleInventory(['tool.jack', 'tool.wrench']);
    expect(planOp(sys, { kind: 'changeWheel', wheel: 0 }, { inv }).reason?.code).toBe('not_secured');
    sys.setHandbrake(true);
    expect(planOp(sys, { kind: 'changeWheel', wheel: 0 }, { inv: new SimpleInventory() }).reason?.code).toBe('no_jack');
    expect(planOp(sys, { kind: 'changeWheel', wheel: 0 }, { inv }).seconds).toBe(20);
    expect(planOp(sys, { kind: 'changeWheel', wheel: 0 }, { inv, people: 2 }).seconds).toBe(8);
    expect(applyOp(sys, { kind: 'changeWheel', wheel: 0 }, { inv }).ok).toBe(true);
    expect(sys.state.wheels[0].flat).toBe(false);
    expect(sys.state.spare?.flat).toBe(true);
    expect(planOp(sys, { kind: 'patchTyre', wheel: 'spare' }, { inv: new SimpleInventory(['tool.tyreplug']) }).ok).toBe(true);
  });

  it('parts: remove and install with preconditions, the part keeps its condition', () => {
    const { sys } = make();
    const inv = new SimpleInventory([{ id: 'part.engine.2', cond: 90 }]);
    expect(planOp(sys, { kind: 'install', item: 'part.engine.2' }, { inv }).reason?.code).toBe('slot_full');
    expect(planOp(sys, { kind: 'remove', slot: 'engine' }, { inv }).reason?.code).toBe('engine_running');
    sys.stopEngine();
    expect(applyOp(sys, { kind: 'remove', slot: 'engine' }, { inv }).ok).toBe(true);
    expect(inv.count('part.engine.1')).toBe(1);
    sys.update(0.1, ENV);
    expect(sys.startProblem()).toBe('no_engine');
    const p1 = planOp(sys, { kind: 'install', item: 'part.engine.2' }, { inv });
    const p2 = planOp(sys, { kind: 'install', item: 'part.engine.2' }, { inv, people: 2 });
    expect(p2.seconds).toBeLessThan(p1.seconds);
    applyOp(sys, { kind: 'install', item: 'part.engine.2' }, { inv });
    expect(sys.state.slots.engine).toEqual({ id: 'part.engine.2', cond: 90 });
    sys.applyMods();
    expect(sys.sim!.mods.torque).toBeCloseTo(1.1, 6);
    // a repair kit brings 50 back at the roadside
    sys.state.slots.engine!.cond = 30;
    applyOp(sys, { kind: 'repair', slot: 'engine' }, { inv: new SimpleInventory(['tool.repairkit']) });
    expect(sys.state.slots.engine!.cond).toBe(80);
  });

  it('tyres: every special tyre beats the road tyre on its own ground, chains on snow and ice', () => {
    const road = TYRE_GRIP['tyre.road'].mu;
    for (const id of TYRE_IDS) expect(TYRE_GRIP[id].mu.length).toBe(7);
    expect(TYRE_GRIP['tyre.mud'].mu[Surface.Grass]).toBeGreaterThan(road[Surface.Grass]);
    expect(TYRE_GRIP['tyre.allterrain'].mu[Surface.Gravel]).toBeGreaterThan(road[Surface.Gravel]);
    expect(TYRE_GRIP['tyre.snow'].mu[Surface.Snow]).toBeGreaterThan(road[Surface.Snow]);
    expect(TYRE_GRIP.chains.mu[Surface.Ice]).toBeGreaterThan(TYRE_GRIP['tyre.snow'].mu[Surface.Ice]);
    expect(road[Surface.Asphalt]).toBe(1);
  });

  it('quirks appear below condition 40, are seed-stable, and go with the repair', () => {
    expect(quirksFor(5, 'body', 80)).toHaveLength(0);
    expect(quirksFor(5, 'body', 30)).toHaveLength(1);
    expect(quirksFor(5, 'body', 10)).toHaveLength(2);
    expect(quirksFor(5, 'body', 30)[0].id).toBe(quirksFor(5, 'body', 30)[0].id);
    expect(quirksFor(5, 'engine', 90, true)).toHaveLength(1); // the stock engine's habit
    const seen = new Set<string>();
    for (let s = 1; s < 40; s++) seen.add(quirksFor(s, 'body', 30)[0].id);
    expect(seen.size).toBeGreaterThan(1);
  });

  it('punctures are deterministic and far more likely on gravel than on asphalt', () => {
    let asphalt = 0;
    let gravel = 0;
    for (let seed = 1; seed <= 6; seed++) {
      for (const [surface, add] of [
        [Surface.Asphalt, (n: number) => (asphalt += n)],
        [Surface.Gravel, (n: number) => (gravel += n)],
      ] as const) {
        const { v, sys } = make(T0_TRUCK, seed);
        sys.state.hazardScale = 25; // compress a long drive into a short one
        drive(v, sys, 60, 0.7, new FlatGround({ surface }));
        add(sys.events.punctures);
      }
    }
    expect(gravel).toBeGreaterThan(asphalt);
    const a = make(T0_TRUCK, 4);
    const b = make(T0_TRUCK, 4);
    a.sys.state.hazardScale = b.sys.state.hazardScale = 25;
    drive(a.v, a.sys, 60);
    drive(b.v, b.sys, 60);
    expect(a.sys.state.wheels.map((w) => w.flat)).toEqual(b.sys.state.wheels.map((w) => w.flat));
  });

  it('controls: the lever walks P R N D, manual mode shifts on Q / Z, handbrake latches', () => {
    const { v, sys } = make(T2_OFFROAD, 1, true);
    expect(v.selector).toBe('D');
    sys.stepLever(-1);
    expect(v.selector).toBe('N');
    sys.stepLever(-1);
    sys.stepLever(-1);
    expect(v.selector).toBe('P');
    sys.stepLever(1);
    sys.stepLever(1);
    sys.stepLever(1);
    expect(v.selector).toBe('D');
    expect(sys.toggleManual()).toBe(true);
    drive(v, sys, 6, 1, new FlatGround());
    expect(v.gear).toBe(1); // manual: it stays in first
    sys.stepLever(-1); // + : up
    drive(v, sys, 1, 1, new FlatGround());
    expect(v.gear).toBe(2);
    expect(sys.dash.gearLabel).toBe('M2');
    sys.toggleHandbrake();
    sys.update(0, ENV);
    expect(sys.dash.lamps.handbrake).toBe(1);
    expect(VEHICLE_CONTROLS.length).toBeGreaterThan(8);
  });

  it('an empty jump pack is refused; a used one still starts the car', () => {
    const { sys } = make(T1_VAN);
    sys.stopEngine();
    sys.state.battery = 2;
    expect(planOp(sys, { kind: 'jumpStart', source: 'pack' }, { inv: new SimpleInventory([{ id: 'tool.jumppack', cond: 0 }]) }).reason?.code).toBe('pack_empty');
    const inv = new SimpleInventory([{ id: 'tool.jumppack', cond: 30 }]);
    expect(applyOp(sys, { kind: 'jumpStart', source: 'pack' }, { inv }).ok).toBe(true);
    expect(planOp(sys, { kind: 'jumpStart', source: 'pack' }, { inv }).reason?.code).toBe('pack_empty');
  });

  it('a suspension fitted at the roadside is in the physics at once; taking it out goes back', () => {
    const { v, sys } = make(T0_TRUCK, 1, true);
    sys.stopEngine();
    const travel = v.wheels[0].travel;
    const inv = new SimpleInventory([{ id: 'part.suspension.3', cond: 100 }]);
    applyOp(sys, { kind: 'remove', slot: 'suspension' }, { inv });
    applyOp(sys, { kind: 'install', item: 'part.suspension.3' }, { inv });
    expect(v.wheels[0].travel).toBeCloseTo(travel + 0.04, 9);
    expect(v.spec.cgHeight).toBeCloseTo(T0_TRUCK.cgHeight + 0.03, 9);
    applyOp(sys, { kind: 'remove', slot: 'suspension' }, { inv });
    applyOp(sys, { kind: 'install', item: 'part.suspension.1' }, { inv });
    expect(v.spec).toBe(T0_TRUCK);
    expect(v.wheels[0].travel).toBe(travel);
  });

  it('two people push a dead car along in N; the handbrake keeps it', () => {
    const { v, sys } = make(T0_TRUCK, 1, true);
    sys.stopEngine();
    v.shift('N');
    const g = new FlatGround();
    for (let i = 0; i < 360; i++) {
      v.addPush(700, 0, v.px - 1.5, v.pz);
      v.substep(zeroInput(), g);
    }
    expect(v.vForward).toBeGreaterThan(1);
    v.setParkBrake(true);
    for (let i = 0; i < 240; i++) v.substep(zeroInput(), g);
    const x = v.px;
    for (let i = 0; i < 240; i++) {
      v.addPush(700, 0, v.px - 1.5, v.pz);
      v.substep(zeroInput(), g);
    }
    expect(Math.abs(v.px - x)).toBeLessThan(0.01);
  });

  it('every vehicle gets a stock state', () => {
    for (const spec of Object.values(VEHICLES)) {
      const st = stockState(spec);
      expect(st.wheels).toHaveLength(4);
      expect(st.fuelL).toBeGreaterThan(0);
    }
  });
});
