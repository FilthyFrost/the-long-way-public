/**
 * Hands, backpack and the world's things (src/core/items: carry, loose, containers, fuel): the take
 * rules, round trips through save / load, containers that hold the same things every time, petrol
 * at the rates of docs/DESIGN_V2.md 5.6.
 */
import { describe, expect, it } from 'vitest';
import { UseDriver, InteractSet, Picker, type Actor, type Interactable } from '../../src/core/interact/interact';
import { canTake, Hands, loadCarrier, newPack, PACK_SLOTS, saveCarrier, take } from '../../src/core/items/carry';
import { Containers, OPEN_HOLD } from '../../src/core/items/containers';
import { FuelSources, SIPHON_RATE } from '../../src/core/items/fuel';
import { LooseItems } from '../../src/core/items/loose';
import { rollLoot } from '../../src/core/items/loot';
import { FunctionLand } from '../../src/core/onfoot/land';
import { buildYard, YARD_LOOSE } from '../../src/core/onfoot/testbed';

function actor(x = 0, z = 0): Actor & { eye: { x: number; y: number; z: number } } {
  return { id: 'p1', hands: new Hands(), pack: newPack(), eye: { x, y: 1.62, z }, heading: 0 };
}

const dt = 1 / 60;
function hold(d: UseDriver, it: Interactable, a: Actor, seconds: number): void {
  for (let t = 0; t < seconds; t += dt) d.update(dt, it, true, a);
  d.update(dt, it, false, a);
}
function find(src: { interactablesNear(x: number, z: number, r: number, out: Interactable[]): void }, id: string): Interactable {
  const out: Interactable[] = [];
  src.interactablesNear(0, 0, 50, out);
  const it = out.find((i) => i.id === id);
  if (!it) throw new Error(`no ${id}`);
  return it;
}

describe('hands and backpack', () => {
  it('small to the pack, medium to the hands, large lifted; one thing in the hands at a time', () => {
    const a = actor();
    expect(take(a, 'food.can.beans', 3)).toBe(3);
    expect(a.pack.count('food.can.beans')).toBe(3);
    expect(take(a, 'fuel.jerrycan')).toBe(1);
    expect(a.hands.id).toBe('fuel.jerrycan');
    expect(canTake(a, 'tyre.road')).toBe(0);
    expect(take(a, 'tyre.road')).toBe(0);
    a.hands.set(null);
    expect(take(a, 'tyre.road')).toBe(1);
    expect(a.hands.size).toBe('large');
  });
  it('the pack is 12 slots, like things stack by 10', () => {
    const a = actor();
    expect(PACK_SLOTS).toBe(12);
    expect(take(a, 'mat.scrap', 200)).toBe(120);
    expect(canTake(a, 'food.rice')).toBe(0);
  });
  it('round trip through save / load', () => {
    const a = actor();
    take(a, 'mat.rope', 4);
    take(a, 'fuel.jerrycan', 1, 6.5);
    const json = JSON.stringify(saveCarrier(a));
    const b = actor();
    loadCarrier(b, JSON.parse(json));
    expect(b.pack.list()).toEqual(a.pack.list());
    expect(b.hands.toJSON()).toEqual({ id: 'fuel.jerrycan', fill: 6.5 });
  });
});

describe('loose things', () => {
  it('are taken with E, whole stacks or what fits; gone ones are gone after save / load', () => {
    const reg = new LooseItems();
    reg.add('food.can.beans', 2, 1, 0, 0);
    reg.add('fuel.jerrycan', 1, 1.2, 0, 0.3, 0, 'site', 3);
    reg.add('tyre.road', 1, 1.4, 0, -0.4);
    const a = actor();
    const d = new UseDriver();
    const beans = find(reg, 'loose:1');
    expect(beans.prompt(a)).toBe('拿');
    d.update(dt, beans, true, a);
    d.update(dt, beans, false, a);
    expect(a.pack.count('food.can.beans')).toBe(2);
    expect(reg.get('loose:1')).toBeUndefined();
    const can = find(reg, 'loose:2');
    d.update(dt, can, true, a);
    d.update(dt, can, false, a);
    expect(a.hands.toJSON()).toEqual({ id: 'fuel.jerrycan', fill: 3 });
    const tyre = find(reg, 'loose:3');
    expect(tyre.prompt(a)).toBe(null); // the hands are full
    a.hands.set(null);
    expect(tyre.prompt(a)).toBe('抬');
    const saved = JSON.parse(JSON.stringify(reg.toJSON()));
    const again = new LooseItems().load(saved);
    expect(again.count).toBe(1);
    expect(again.get('loose:1')).toBeUndefined();
    // new things after a load do not reuse an old key
    expect(again.add('mat.rope', 1, 0, 0, 0).key).toBe('loose:4');
  });
  it('near() finds what is within reach', () => {
    const reg = new LooseItems();
    reg.add('mat.rope', 1, 0, 0, 0);
    reg.add('mat.rope', 1, 10, 0, 0);
    const out: { key: string }[] = [];
    reg.near(0, 0, 3, out as never);
    expect(out.map((l) => l.key)).toEqual(['loose:1']);
  });
});

describe('containers', () => {
  const def = { id: 'site7:crate1', kind: 'crate' as const, x: 1, y: 0, z: 0, heading: 0.3, seed: 991, hx: 0.45, h: 0.62, hz: 0.32 };
  it('opened by holding 1.5 s; the same things every time and for everyone', () => {
    const a = new Containers();
    const b = new Containers();
    const ca = a.add(def);
    b.add(def);
    const p = actor();
    const d = new UseDriver();
    const lid = find(a, def.id);
    expect(lid.prompt(p)).toBe('打开');
    expect(lid.hold).toBe(OPEN_HOLD);
    hold(d, lid, p, 1.0);
    expect(ca.opened).toBe(false);
    hold(d, lid, p, 1.6);
    expect(ca.opened).toBe(true);
    b.get(def.id)!.open();
    expect(ca.store.list()).toEqual(b.get(def.id)!.store.list());
    expect(ca.store.list().length).toBeGreaterThan(0);
    // opening again does not roll again
    const before = ca.store.list();
    expect(ca.open()).toBe(false);
    expect(ca.store.list()).toEqual(before);
    // and it is the loot table's roll
    const roll = rollLoot('crate', 991);
    expect(ca.store.list().map((s) => s.id).sort()).toEqual(roll.map((s) => s.id).sort());
  });
  it('things lie on its shelf: take one by one, or hold to take all that fits', () => {
    const c = new Containers();
    const box = c.add({ ...def, slots: 6 });
    box.opened = true;
    box.store.add('food.can.beans', 2);
    box.store.add('mat.rope', 1);
    box.store.add('keep.radio', 1);
    const p = actor();
    const d = new UseDriver();
    const s0 = find(c, `${def.id}#0`);
    // a tap takes that one
    d.update(dt, s0, true, p);
    d.update(dt, s0, false, p);
    expect(p.pack.count('food.can.beans')).toBe(2);
    expect(box.store.count('food.can.beans')).toBe(0);
    // the hold takes the rest: the rope to the pack, the radio into the hands
    const s1 = find(c, `${def.id}#1`);
    hold(d, s1, p, 1.0);
    expect(p.pack.count('mat.rope')).toBe(1);
    expect(p.hands.id).toBe('keep.radio');
    expect(box.store.empty).toBe(true);
    // put back in what is in the hands
    const lid = find(c, def.id);
    expect(lid.prompt(p)).toBe('放进');
    d.update(dt, lid, true, p);
    d.update(dt, lid, false, p);
    expect(box.store.count('keep.radio')).toBe(1);
    expect(p.hands.empty).toBe(true);
  });
  it('taken things stay taken after save / load', () => {
    const c = new Containers();
    const box = c.add(def);
    box.open();
    const p = actor();
    box.takeAllInto(p);
    const left = box.store.list();
    const saved = JSON.parse(JSON.stringify(c.toJSON()));
    const c2 = new Containers();
    c2.add(def);
    c2.load(saved);
    expect(c2.get(def.id)!.opened).toBe(true);
    expect(c2.get(def.id)!.store.list()).toEqual(left);
    // and opening it after the load gives nothing new
    expect(c2.get(def.id)!.open()).toBe(false);
  });
  it('the things inside are picked through the crate they lie in', () => {
    const c = new Containers();
    const box = c.add(def);
    box.opened = true;
    box.store.add('food.can.beans', 1);
    const p = actor(0, 0);
    const pt = { x: 0, y: 0, z: 0 };
    box.shelfPoint(0, pt);
    const dx = pt.x - p.eye.x;
    const dy = pt.y + 0.05 - p.eye.y;
    const dz = pt.z - p.eye.z;
    const l = Math.hypot(dx, dy, dz);
    const set = new InteractSet();
    set.add(c);
    const got = new Picker().pick(set, c, p, p.eye, { x: dx / l, y: dy / l, z: dz / l });
    expect(got?.id).toBe(`${def.id}#0`);
  });
});

describe('petrol', () => {
  it('a station tank gives 10 L in 15 s, a wreck 2 L in 5 s, into the jerrycan in the hands', () => {
    const f = new FuelSources();
    f.add('station', 'tank', 0, 1, 0, 25);
    f.add('wreck', 'wreck', 3, 0.5, 0, 6);
    const p = actor();
    const d = new UseDriver();
    const tap = find(f, 'station');
    expect(tap.prompt(p)).toBe(null); // nothing to put it in
    take(p, 'fuel.jerrycan', 1, 0);
    // the hose is needed, and the word says so
    expect(tap.prompt(p)).toBe('缺抽油管');
    for (let i = 0; i < 30; i++) d.update(dt, tap, true, p);
    d.update(dt, tap, false, p);
    expect(p.hands.fill).toBe(0);
    take(p, 'tool.siphon');
    expect(tap.prompt(p)).toBe('抽油');
    let t = 0;
    while (p.hands.fill < 10 - 1e-6 && t < 30) {
      d.update(dt, tap, true, p);
      t += dt;
    }
    expect(t).toBeCloseTo(15, 0);
    expect(f.get('station')!.litres).toBeCloseTo(15, 3);
    expect(tap.prompt(p)).toBe('满了');
    d.update(dt, tap, false, p);
    p.hands.fill = 0;
    hold(d, find(f, 'wreck'), p, 5);
    expect(p.hands.fill).toBeCloseTo(2, 1);
    expect(SIPHON_RATE.wreck * 5).toBeCloseTo(2, 6);
    const saved = JSON.parse(JSON.stringify(f.toJSON()));
    const f2 = new FuelSources();
    f2.add('station', 'tank', 0, 1, 0, 25);
    f2.add('wreck', 'wreck', 3, 0.5, 0, 6);
    f2.load(saved);
    expect(f2.get('wreck')!.litres).toBeCloseTo(4, 1);
  });
});

describe('the test yard registers everything a site would', () => {
  it('two containers, a fuel tank and every loose thing; things of every size', () => {
    const reg = { containers: new Containers(), loose: new LooseItems(), fuel: new FuelSources() };
    const y = buildYard(new FunctionLand(() => 0), { x: 0, z: 0, heading: 0.4 }, reg);
    expect(reg.containers.all().map((c) => c.id)).toEqual(['yard:crate', 'yard:toolbox']);
    expect(reg.fuel.all().length).toBe(1);
    expect(reg.loose.count).toBe(YARD_LOOSE.length);
    expect(y.solids.all.some((s) => s.floor)).toBe(true);
  });
});

describe('a road full of things: the spatial index', () => {
  it('near() and the interactables agree with a plain scan over 6000 things, and stay fast', () => {
    const reg = new LooseItems();
    const boxes = new Containers();
    let s = 99;
    const rnd = (): number => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 6000; i++) reg.add('mat.rope', 1, rnd() * 40000 - 20000, 0, rnd() * 400 - 200);
    for (let i = 0; i < 800; i++) boxes.add({ id: `c${i}`, kind: 'crate', x: rnd() * 40000 - 20000, y: 0, z: rnd() * 400 - 200, heading: 0, seed: i, hx: 0.5, h: 0.6, hz: 0.4 });
    // take a third away again
    for (let i = 1; i <= 6000; i += 3) reg.take(`loose:${i}`);
    for (const [x, z] of [
      [0, 0],
      [1234, 50],
      [-15000, -120],
    ]) {
      const got: { key: string }[] = [];
      reg.near(x, z, 300, got as never);
      const want = reg.all().filter((l) => Math.hypot(l.x - x, l.z - z) <= 300);
      expect(got.map((l) => l.key).sort()).toEqual(want.map((l) => l.key).sort());
      const sol: unknown[] = [];
      boxes.solidsNear(x, z, 300, sol as never);
      expect(sol.length).toBe(boxes.all().filter((c) => Math.hypot(c.def.x - x, c.def.z - z) < 300 + Math.hypot(0.5, 0.4)).length);
    }
    const t0 = performance.now();
    const out: Interactable[] = [];
    for (let i = 0; i < 2000; i++) {
      out.length = 0;
      reg.interactablesNear(i * 10 - 10000, 0, 3.2, out);
      boxes.interactablesNear(i * 10 - 10000, 0, 3.2, out);
    }
    expect((performance.now() - t0) / 2000).toBeLessThan(0.05);
    expect(reg.get('loose:2')?.key).toBe('loose:2');
    expect(reg.get('loose:1')).toBeUndefined();
  });
});

describe('containers on vehicles', () => {
  it('are refused as solids (they would ride inside the car)', () => {
    const c = new Containers();
    const def = { id: 't0_truck:glovebox', kind: 'glovebox' as const, x: 0, y: 0, z: 0, heading: 0, seed: 1, hx: 0.2, h: 0.1, hz: 0.1 };
    expect(() => c.add(def)).toThrow(/solid: false/);
    expect(c.add({ ...def, solid: false }).id).toBe('t0_truck:glovebox');
    const out: unknown[] = [];
    c.solidsNear(0, 0, 5, out as never);
    expect(out.length).toBe(0);
  });
});
