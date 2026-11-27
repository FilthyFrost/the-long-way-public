/**
 * What the cab's instruments show (core/modcar/instruments.ts, docs/V3/plan/finish.md §五): the dials' scales and where
 * each needle stands for a reading; which warning and indicator lamps are lit when, the bulb check at the turn of the
 * key, the bulbs' rise and fall and the light the cluster is given — as a real cluster's, with Nomad Drive's numbers.
 */
import { describe, expect, it } from 'vitest';
import { BULB, gearedTopKmh, LAMP_IDS, LAMP_INFO, lampsWanted, type LampId, needleAngle, needleFrac, rpmScale, speedScale, Telltales, tempFrac } from '../../src/core/modcar/instruments';
import { stockBuild } from '../../src/core/modcar/build';
import { FRAMES } from '../../src/core/modcar/frames';
import { ModSystems, type Dash } from '../../src/core/modcar/systems';
import type { VehicleSpec } from '../../src/core/vehicle/spec';

const DEG = 180 / Math.PI;

/** a dashboard's data as a vehicle standing with its engine running gives it */
function dash(over: Partial<Dash> = {}): Dash {
  return {
    rpm: 800,
    kmh: 0,
    fuel: 0.6,
    fuelL: 30,
    tankL: 50,
    odoKm: 1234.5,
    outC: 12,
    hour: 14.25,
    coolantC: 88,
    battery: 0.9,
    oil: 1,
    running: true,
    cranking: false,
    gearLabel: 'D1',
    handbrake: false,
    lights: 'off',
    lightsOn: false,
    horn: false,
    hornSound: 'beep',
    boost: 0,
    message: null,
    lamps: { battery: false, oil: false, temp: false, fuel: false, check: false },
    tyres: [0, 1, 2, 3].map(() => ({ tread: 1, flat: false })),
    brakes: [0, 1, 2, 3].map(() => ({ c: 15, bite: 1 })),
    ...over,
  };
}

function lit(d: Dash, power = true, blink = false): LampId[] {
  const w = lampsWanted(d, { power, blink });
  return LAMP_IDS.filter((id) => w[id]);
}

describe('the dials', () => {
  it('scales the speedometer to a little over what the vehicle does at its red line, in steps of 20 or 40', () => {
    expect(speedScale(100)).toEqual({ max: 120, step: 20 });
    expect(speedScale(150)).toEqual({ max: 180, step: 20 });
    expect(speedScale(200)).toEqual({ max: 240, step: 40 });
    expect(speedScale(400)).toEqual({ max: 280, step: 40 });
    // every stock vehicle's: from 120 to 280, its numerals at most eleven
    for (const f of FRAMES) {
      if (f.id === 'trailer') continue;
      const sys = new ModSystems(stockBuild(f.id));
      const top = gearedTopKmh(sys.derived.spec as VehicleSpec);
      const s = speedScale(top);
      expect(s.max, f.id).toBeGreaterThanOrEqual(120);
      expect(s.max, f.id).toBeLessThanOrEqual(280);
      expect(s.max / s.step + 1, f.id).toBeLessThanOrEqual(11);
      expect(s.max, f.id).toBeGreaterThanOrEqual(Math.min(260, top));
    }
  });

  it('scales the rev counter in thousands to the next whole one past the red line, its red from there', () => {
    expect(rpmScale(4500)).toEqual({ max: 5, red: 4500 });
    expect(rpmScale(6000)).toEqual({ max: 7, red: 6000 });
    expect(rpmScale(7400)).toEqual({ max: 8, red: 7400 });
    expect(rpmScale(12000).max).toBe(9);
  });

  it('turns the big needles through 275° and the small ones through a quarter, as Nomad Drive does', () => {
    expect(needleAngle('speed', 0) * DEG).toBeCloseTo(-137.5, 6);
    expect(needleAngle('speed', 1) * DEG).toBeCloseTo(137.5, 6);
    expect(needleAngle('rpm', 0.5) * DEG).toBeCloseTo(0, 6);
    // a quarter dial from pointing left (empty) to pointing up (full); a round one across its top
    expect(needleAngle('fuel', 0) * DEG).toBeCloseTo(-90, 6);
    expect(needleAngle('fuel', 1) * DEG).toBeCloseTo(0, 6);
    expect(needleAngle('temp', 0, 'round') * DEG).toBeCloseTo(-45, 6);
    expect(needleAngle('temp', 1, 'round') * DEG).toBeCloseTo(45, 6);
    // (past their stops they stay on them)
    expect(needleAngle('speed', 1.4)).toBe(needleAngle('speed', 1));
    expect(needleAngle('fuel', -0.2)).toBe(needleAngle('fuel', 0));
  });

  it('puts each needle where its reading is; with the key off the fuel and the coolant rest on their stops', () => {
    const sp = speedScale(150);
    const rp = rpmScale(6000);
    const r = { kmh: 90, rpm: 3500, fuel: 0.25, coolantC: 90 };
    expect(needleFrac('speed', r, true, sp, rp)).toBeCloseTo(90 / 180, 6);
    expect(needleFrac('rpm', r, true, sp, rp)).toBeCloseTo(3.5 / 7, 6);
    expect(needleFrac('fuel', r, true, sp, rp)).toBeCloseTo(0.25, 6);
    // a warm engine at the middle of its dial, its red from 112 °C, H at 130
    expect(needleFrac('temp', r, true, sp, rp)).toBeCloseTo(0.5, 6);
    expect(tempFrac(112)).toBeCloseTo(0.775, 6);
    expect(tempFrac(140)).toBe(1);
    expect(needleFrac('fuel', r, false, sp, rp)).toBe(0);
    expect(needleFrac('temp', r, false, sp, rp)).toBe(0);
    expect(needleFrac('rpm', r, false, sp, rp)).toBe(0);
    // (a vehicle rolling with its key off still turns its speedometer: it is driven by the wheels)
    expect(needleFrac('speed', r, false, sp, rp)).toBeCloseTo(0.5, 6);
    // backwards it reads the speed all the same
    expect(needleFrac('speed', { ...r, kmh: -10 }, true, sp, rp)).toBeCloseTo(10 / 180, 6);
  });
});

describe('the lamps', () => {
  it('lights each lamp only while its condition holds, and none with the key off', () => {
    expect(lit(dash())).toEqual([]);
    expect(lit(dash({ handbrake: true }))).toEqual(['park']);
    expect(lit(dash({ lightsOn: true, lights: 'low' }))).toEqual(['low']);
    // (main beam: the blue lamp, the dipped beam's green out, as Nomad Drive has them)
    expect(lit(dash({ lightsOn: true, lights: 'high' }))).toEqual(['high']);
    expect(lit(dash({ lamps: { battery: false, oil: false, temp: true, fuel: false, check: false } }))).toEqual(['coolant']);
    expect(lit(dash({ lamps: { battery: false, oil: false, temp: false, fuel: true, check: false } }))).toEqual(['fuel']);
    expect(lit(dash({ lamps: { battery: false, oil: false, temp: false, fuel: false, check: true } }))).toEqual(['engine']);
    expect(lit(dash({ lamps: { battery: false, oil: true, temp: false, fuel: false, check: false } }))).toEqual(['oil']);
    expect(lit(dash({ lamps: { battery: true, oil: false, temp: false, fuel: false, check: false } }))).toEqual(['charge']);
    // a blown tyre; brakes that have lost their bite
    const tyres = dash().tyres.map((t, i) => ({ ...t, flat: i === 2 }));
    expect(lit(dash({ tyres }))).toEqual(['tyre']);
    const brakes = dash().brakes.map((b, i) => ({ ...b, bite: i === 0 ? 0.7 : 1 }));
    expect(lit(dash({ brakes }))).toEqual(['brake']);
    // the indicators with the hazard lights' blink, both
    expect(lit(dash(), true, true)).toEqual(['turnL', 'turnR']);
    // the key on, the engine stopped: no oil pressure, no charge
    expect(lit(dash({ running: false, rpm: 0 }))).toEqual(['oil', 'charge']);
    // the key off: nothing, whatever holds
    expect(lit(dash({ handbrake: true, running: false, lightsOn: true, lights: 'low', tyres }), false, true)).toEqual([]);
  });

  it('gives every lamp its ISO colour: red danger, amber caution, green working, blue main beam', () => {
    const red: LampId[] = ['park', 'brake', 'oil', 'charge', 'coolant'];
    const amber: LampId[] = ['fuel', 'engine', 'tyre'];
    for (const id of LAMP_IDS) {
      const c = LAMP_INFO[id].colour;
      if (red.includes(id)) expect(c, id).toBe('red');
      else if (amber.includes(id)) expect(c, id).toBe('amber');
      else expect(c, id).toBe(id === 'high' ? 'blue' : 'green');
    }
  });

  it('checks its bulbs at the turn of the key: all lit, then out one after another', () => {
    const t = new Telltales();
    const stopped = dash({ running: false, rpm: 0 });
    // the key on, the engine stopped: oil and charge only
    t.update(Infinity, stopped, true, false, 0.9);
    expect(LAMP_IDS.filter((id) => t.out[id] > 0.5)).toEqual(['oil', 'charge']);
    // the key turned to start: every lamp up within a tenth of a second
    const cranking = { ...stopped, cranking: true };
    for (let i = 0; i < 6; i++) t.update(1 / 60, cranking, true, false, 0.9);
    for (const id of LAMP_IDS) expect(t.out[id], id).toBeGreaterThan(0.9);
    expect(t.checking).toBe(true);
    // the engine catches after 0.5 s: the check holds to 1.2 s from the key, then they go out a twentieth of a second apart
    let time = 0.1;
    const running = dash();
    const outAt: Partial<Record<LampId, number>> = {};
    while (time < 3) {
      const d = time < 0.5 ? cranking : running;
      t.update(1 / 120, d, true, false, 0.9);
      time += 1 / 120;
      for (const id of LAMP_IDS) if (outAt[id] === undefined && t.out[id] < 0.5) outAt[id] = time;
    }
    for (const id of LAMP_IDS) expect(outAt[id], id).toBeDefined();
    const first = outAt[LAMP_IDS[0]]!;
    expect(first).toBeGreaterThan(BULB.check);
    expect(first).toBeLessThan(BULB.check + 0.15);
    for (let i = 1; i < LAMP_IDS.length; i++) expect(outAt[LAMP_IDS[i]]! - outAt[LAMP_IDS[i - 1]]!).toBeCloseTo(BULB.stagger, 1);
    expect(t.checking).toBe(false);
    // and with the engine running nothing stays lit
    for (const id of LAMP_IDS) expect(t.out[id], id).toBe(0);
  });

  it('holds the check a quarter of a second past a long crank', () => {
    const t = new Telltales();
    const cranking = dash({ running: false, rpm: 200, cranking: true });
    let time = 0;
    for (; time < 2.5; time += 1 / 60) t.update(1 / 60, cranking, true, false, 0.9);
    expect(t.out.park).toBeGreaterThan(0.9);
    const running = dash();
    let out = -1;
    for (; time < 4; time += 1 / 120) {
      t.update(1 / 120, running, true, false, 0.9);
      if (out < 0 && t.out.turnL < 0.5) out = time;
    }
    expect(out).toBeGreaterThan(2.5 + BULB.checkPast - 0.02);
    expect(out).toBeLessThan(2.5 + BULB.checkPast + 0.15);
  });

  it('comes up in a few hundredths of a second and fades a little slower, as a filament does', () => {
    const t = new Telltales();
    t.update(Infinity, dash(), true, false, 0.9);
    const on = dash({ handbrake: true });
    t.update(BULB.attack, on, true, false, 0.9);
    expect(t.out.park).toBeCloseTo(1 - Math.exp(-1), 2);
    for (let i = 0; i < 10; i++) t.update(0.03, on, true, false, 0.9);
    expect(t.out.park).toBe(1);
    t.update(BULB.release, dash(), true, false, 0.9);
    expect(t.out.park).toBeCloseTo(Math.exp(-1), 2);
  });

  it('dims with the engine stopped, sags while the starter turns, and is dim on a flat battery', () => {
    const t = new Telltales();
    t.update(Infinity, dash(), true, false, 0.9);
    expect(t.supply).toBeCloseTo(1, 6);
    t.update(1 / 60, dash({ running: false }), true, false, 0.9);
    expect(t.supply).toBeCloseTo(BULB.engineOff, 6);
    let low = 1;
    for (let i = 0; i < 30; i++) {
      t.update(1 / 60, dash({ running: false, cranking: true }), true, false, 0.9);
      low = Math.min(low, t.supply);
    }
    expect(low).toBeLessThan(0.6);
    t.update(1 / 60, dash({ running: false }), true, false, 0.02);
    expect(t.supply).toBeLessThan(0.6);
    expect(t.supply).toBeGreaterThanOrEqual(BULB.weakFloor - 1e-6);
    t.update(1 / 60, dash(), false, false, 0.9);
    expect(t.supply).toBe(0);
    // a lamp's light is its bulb times the supply
    t.update(Infinity, dash({ handbrake: true, running: false }), true, false, 0.9);
    expect(t.light('park')).toBeCloseTo(BULB.engineOff, 6);
  });
});
