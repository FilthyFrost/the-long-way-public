/**
 * Repairs by hand at the car's places (places.ts): each place's word, preconditions and duration agree
 * with planOp; a roadside flat and a garage upgrade, scripted end to end through the places.
 */
import { describe, expect, it } from 'vitest';
import { Hands, newPack, type Carrier } from '../../src/core/items/carry';
import { VehicleSim, zeroInput } from '../../src/core/vehicle/sim';
import { T0_TRUCK, T1_VAN } from '../../src/core/vehicle/spec';
import { applyOp, CarrierStores, planOp, placeAction, PLACES, stockState, VehicleSystems, type ItemInstance, type PlaceCtx } from '../../src/core/vehicle/systems';
import { FlatGround } from '../../src/core/world/ground';

const ENV = { ambientC: 20, dark: false, rain: 0 };

function person(): Carrier {
  return { id: 'p', hands: new Hands(), pack: newPack() };
}

function make(spec = T0_TRUCK) {
  const v = new VehicleSim(spec);
  v.reset(0, 0, 0, 0);
  const sys = new VehicleSystems(spec, stockState(spec, 1)).bind(v);
  return { v, sys };
}

/** do what E at the place would do, the way the game does it: settle the action, wait it out, apply */
function useAt(sys: VehicleSystems, place: (typeof PLACES)[number], a: Carrier, ground: ItemInstance[], extra: Partial<PlaceCtx> = {}): { word: string | null; seconds: number; ok: boolean } {
  const inv = new CarrierStores([a], [sys.kit], (it) => ground.push(it));
  const act = placeAction(sys, place, { inv, hands: a.hands, ...extra });
  if (act.ok && act.req) expect(applyOp(sys, act.req, { inv, handsFree: a.hands.empty, people: extra.people }).ok).toBe(true);
  return { word: act.word, seconds: act.seconds, ok: act.ok };
}

function drive(v: VehicleSim, sys: VehicleSystems, seconds: number, throttle = 0.5): void {
  const g = new FlatGround();
  for (let i = 0; i < Math.round(seconds / v.h); i++) {
    v.substep({ ...zeroInput(), throttle }, g);
    if (i % 4 === 3) sys.update(v.h * 4, ENV);
  }
}

describe('places on the car', () => {
  it('every place says what planOp says: the word when it can be done, the missing thing when not, the same duration', () => {
    const { sys } = make();
    sys.stopEngine();
    sys.puncture(2);
    sys.state.slots.body!.cond = 50;
    for (const handsItem of [null, 'tyre.allterrain', 'part.cooling.2', 'acc.chains']) {
      for (const tools of [[], ['tool.repairkit', 'tool.tyreplug']]) {
        const toolsInKit = tools.length > 0;
        for (const secured of [false, true]) {
          sys.setHandbrake(secured);
          sys.sim!.shift(secured ? 'P' : 'D');
          const a = person();
          if (handsItem) a.hands.set(handsItem, 0, 80);
          for (const t of tools) a.pack.add(t, 1);
          for (const place of PLACES) {
            const inv = new CarrierStores([a], toolsInKit ? [sys.kit] : []);
            const act = placeAction(sys, place, { inv, hands: a.hands });
            if (!act.req) continue;
            const plan = planOp(sys, act.req, { inv, handsFree: a.hands.empty });
            expect(act.ok, `${place} ${handsItem} ${tools.length} ${secured}`).toBe(plan.ok);
            if (plan.ok) {
              expect(act.seconds).toBe(plan.seconds);
              expect(act.word).toBeTruthy();
            } else expect(act.word, `${place}: ${plan.reason?.code}`).toBeTruthy();
          }
        }
      }
    }
  });

  it('the one thing missing is named', () => {
    const { sys } = make();
    sys.puncture(0);
    sys.setHandbrake(true);
    const a = person();
    // the vehicle's kit lost its tools
    sys.kit.remove('tool.jack');
    sys.kit.remove('tool.wrench');
    expect(useAt(sys, 'wheel0', a, []).word).toBe('缺千斤顶');
    a.hands.set('tool.jack');
    expect(useAt(sys, 'wheel0', a, []).word).toBe('缺扳手');
    a.hands.set(null);
    sys.state.slots.battery = null;
    expect(useAt(sys, 'battery', a, []).word).toBe('缺电瓶');
    expect(useAt(sys, 'engine', a, [], { bonnetOpen: false }).word).toBe('开引擎盖');
    expect(useAt(sys, 'engine', a, []).word).toBe('先熄火');
  });

  it('a roadside flat: puncture, stop, jack, the wheel off into the hands, the spare on, drive on', () => {
    const { v, sys } = make();
    drive(v, sys, 8, 0.6);
    sys.puncture(1);
    // stop and pull the handbrake
    // (lifting off the brake once stopped, so the relaxed controls do not take S for reverse)
    for (let i = 0; i < 1500; i++) {
      v.substep({ ...zeroInput(), brake: v.speed > 0.3 ? 1 : 0 }, new FlatGround());
      if (i % 4 === 3) sys.update(v.h * 4, ENV);
    }
    sys.setHandbrake(true);
    // the jack and the wrench are in the vehicle's kit
    const a = person();
    const ground: ItemInstance[] = [];
    // with the spare on its carrier the wheel says 换备胎: the quick way, 20 s alone
    const off = placeAction(sys, 'wheel1', { inv: new CarrierStores([a], [sys.kit]), hands: a.hands });
    expect(off.word).toBe('换备胎');
    const r1 = useAt(sys, 'wheel1', a, ground);
    expect(r1.seconds).toBe(20);
    expect(sys.state.wheels[1].flat).toBe(false);
    expect(sys.state.spare?.flat).toBe(true);
    // now the long way on another wheel: off into the hands, put it down, spare from the carrier, on
    sys.puncture(3);
    const r2 = useAt(sys, 'wheel3', a, ground);
    expect(r2.word).toBe('拆轮');
    expect(r2.seconds).toBe(10);
    expect(sys.state.wheels[3].off).toBe(true);
    expect(a.hands.id).toBe('tyre.road');
    expect(a.hands.fill).toBe(1); // a punctured wheel
    // put the flat down on the ground and take the (patched) spare
    ground.push({ id: a.hands.id!, cond: a.hands.cond, flat: true });
    a.hands.set(null);
    a.pack.add('tool.tyreplug', 1);
    expect(useAt(sys, 'spare', a, ground).word).toBe('补胎');
    expect(useAt(sys, 'spare', a, ground).word).toBe('取备胎');
    expect(a.hands.id).toBe('tyre.road');
    sys.update(0.1, ENV);
    expect(sys.dash.message.code).toBe('wheel_off');
    const r3 = useAt(sys, 'wheel3', a, ground);
    expect(r3.word).toBe('装轮');
    expect(sys.state.wheels[3].off).toBeFalsy();
    expect(a.hands.empty).toBe(true);
    // drive on: straight (it may have swerved when the tyre went, so the heading is what must not change), nothing flat
    sys.setHandbrake(false);
    const yaw0 = v.yaw;
    drive(v, sys, 10, 0.5);
    expect(v.kmh).toBeGreaterThan(20);
    expect(Math.abs(v.yaw - yaw0) * (180 / Math.PI)).toBeLessThan(1.5);
    expect(sys.state.wheels.map((w) => [w.flat, !!w.off])).toEqual([[false, false], [false, false], [false, false], [false, false]]);
  });

  it('a garage upgrade: bonnet up, old radiator out, the better one in, the engine repaired to full at the bench', () => {
    const { v, sys } = make(T1_VAN);
    drive(v, sys, 1, 0);
    sys.stopEngine();
    sys.setHandbrake(true);
    const a = person();
    const ground: ItemInstance[] = [];
    const out = useAt(sys, 'cooling', a, ground);
    expect(out.word).toBe('拆下');
    expect(a.hands.id).toBe('part.cooling.1');
    // lay it on the shelf, take the new one
    const old = { id: a.hands.id!, cond: a.hands.cond };
    a.hands.set('part.cooling.2', 0, 100);
    expect(useAt(sys, 'cooling', a, ground).word).toBe('装上');
    expect(sys.state.slots.cooling).toEqual({ id: 'part.cooling.2', cond: 100 });
    expect(old.cond).toBe(70);
    a.pack.add('tool.repairkit', 1);
    const eng = sys.state.slots.engine!.cond;
    expect(eng).toBeLessThan(100);
    const rep = useAt(sys, 'engine', a, ground, { workbench: true });
    expect(rep.word).toBe('修理');
    expect(sys.state.slots.engine!.cond).toBe(100);
    sys.startEngine();
    drive(v, sys, 3, 0);
    expect(sys.state.running).toBe(true);
  });
});
