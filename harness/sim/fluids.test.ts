/** Petrol and water into and out of the vehicle: one path whatever the vessel (fluids.ts). */
import { describe, expect, it } from 'vitest';
import { Hands } from '../../src/core/items/carry';
import { FuelSources } from '../../src/core/items/fuel';
import { VehicleSim } from '../../src/core/vehicle/sim';
import { T1_VAN } from '../../src/core/vehicle/spec';
import { fillerChannel, fillerQuery, FLOW, radiatorChannel, radiatorQuery, stockState, VehicleSystems } from '../../src/core/vehicle/systems';

function make(fuelFrac = 0.2) {
  const v = new VehicleSim(T1_VAN);
  v.reset(0, 0, 0, 0);
  const sys = new VehicleSystems(T1_VAN, stockState(T1_VAN, 1, { fuelFrac })).bind(v);
  return { v, sys };
}

function hold(sys: VehicleSystems, hands: Hands, siphon: boolean, station: { litres: number } | null, seconds: number, onStep?: () => void): number {
  let t = 0;
  const dt = 1 / 30;
  // the mode is settled when E goes down and kept while it is held
  const q = fillerQuery(sys, hands, siphon, station);
  for (; t < seconds; t += dt) {
    if (!fillerChannel(sys, hands, q.mode, station, dt)) break;
    onStep?.();
  }
  return t;
}

describe('fluids', () => {
  it('a jerrycan pours in at 10 L / 12 s and the needle moves while it does', () => {
    const { sys } = make();
    const hands = new Hands();
    hands.set('fuel.jerrycan', 10);
    const f0 = sys.state.fuelL;
    const needles: number[] = [];
    const t = hold(sys, hands, false, null, 30, () => needles.push(sys.dash.fuel));
    expect(t).toBeGreaterThan(11.5);
    expect(t).toBeLessThan(12.5);
    expect(sys.state.fuelL - f0).toBeCloseTo(10, 6);
    expect(sys.sim!.fuelL).toBeCloseTo(sys.state.fuelL, 9);
    expect(needles[needles.length - 1]).toBeGreaterThan(needles[0]);
    for (let i = 1; i < needles.length; i++) expect(needles[i]).toBeGreaterThanOrEqual(needles[i - 1]);
    expect(hands.fill).toBeCloseTo(0, 9);
  });

  it('a station tank within reach pumps at 10 L / 15 s and runs dry', () => {
    const { sys } = make(0);
    const src = new FuelSources().add('st:tank', 'tank', 0, 0, 0, 6);
    const hands = new Hands();
    expect(fillerQuery(sys, hands, false, src).word).toBe('加油');
    const t = hold(sys, hands, false, src, 60);
    expect(t).toBeCloseTo(6 / FLOW.pump, 0);
    expect(src.litres).toBeCloseTo(0, 6);
    expect(fillerQuery(sys, hands, false, src).word).toBe('油罐空了');
  });

  it('an empty can and a siphon take petrol back out; water is refused', () => {
    const { sys } = make(0.5);
    const hands = new Hands();
    hands.set('fuel.jerrycan', 0);
    expect(fillerQuery(sys, hands, false, null).word).toBeNull();
    expect(fillerQuery(sys, hands, true, null).word).toBe('抽油');
    const f0 = sys.state.fuelL;
    hold(sys, hands, true, null, 4);
    expect(hands.fill).toBeCloseTo(1, 1);
    expect(f0 - sys.state.fuelL).toBeCloseTo(hands.fill, 9);
    const water = new Hands();
    water.set('water.canister', 8);
    const q = fillerQuery(sys, water, true, null);
    expect(q.mode).toBe('wrong');
    expect(fillerChannel(sys, water, q.mode, null, 1)).toBe(false);
    expect(water.fill).toBe(8);
  });

  it('nothing pours while moving; in real mode not with the engine running', () => {
    const { v, sys } = make();
    const hands = new Hands();
    hands.set('fuel.jerrycan', 10);
    v.vx = 5;
    v.speed = 5;
    expect(fillerQuery(sys, hands, false, null).mode).toBe('moving');
    v.vx = 0;
    v.speed = 0;
    sys.setAssist('real');
    expect(fillerQuery(sys, hands, false, null).mode).toBe('running');
    sys.stopEngine();
    expect(fillerQuery(sys, hands, false, null).mode).toBe('pour');
  });

  it('water tops up the radiator and cools it a little', () => {
    const { sys } = make();
    sys.state.coolant = 0.4;
    sys.state.coolantC = 112;
    const hands = new Hands();
    hands.set('water.canister', 8);
    expect(radiatorQuery(sys, hands)).toBe('加水');
    let n = 0;
    while (radiatorChannel(sys, hands, 1 / 30) && n++ < 10000);
    expect(sys.state.coolant).toBeGreaterThan(0.99);
    expect(hands.fill).toBeCloseTo(8 - 0.6 * 6, 3);
    expect(sys.state.coolantC).toBeLessThan(112);
  });
});
