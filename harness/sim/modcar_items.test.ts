/**
 * The item cards and the liquids (docs/MODCAR.md §5.3, §5.5): every part, tool, vehicle and machine has its
 * grade and its line; every part's card can be made (an engine's has its torque curve, a tyre's its grip on
 * each ground, whatever holds liquid a bar of it); every engine that takes oil has an oil filler, every
 * radiator a water filler; pouring and drawing back out move the same litres both ways and keep to what a
 * can and a tank can hold.
 */
import { describe, expect, it } from 'vitest';
import { DEVICE_BLURB, FRAME_BLURB, PART_BLURB, TOOL_BLURB } from '../../src/core/modcar/blurbs';
import { newInstance, stockBuild } from '../../src/core/modcar/build';
import { FRAMES } from '../../src/core/modcar/frames';
import { PARTS, partDef } from '../../src/core/modcar/parts';
import { liquidOf, newTool, pour, siphon, siphonUse, TOOL_INFO, type ToolKind } from '../../src/core/modcar/tools';
import { FILLERS } from '../../src/game/modcar/fillers';
import { partCard, toolCard } from '../../src/game/modcar/itemInfo';

const tankL = (b: ReturnType<typeof stockBuild>): number => Object.values(b.parts.fuelTank?.fluids.fuel ?? {}).reduce((a, x) => a + (x ?? 0), 0);

describe('ModCar item cards', () => {
  it('every part has a grade of one to five stars and a line', () => {
    for (const p of PARTS) {
      const b = PART_BLURB[p.id];
      expect(b, p.id).toBeDefined();
      expect(b.stars, p.id).toBeGreaterThanOrEqual(1);
      expect(b.stars, p.id).toBeLessThanOrEqual(5);
      expect(b.zh.length, p.id).toBeGreaterThan(3);
    }
    // (and nothing for parts that are not in the catalogue)
    for (const id of Object.keys(PART_BLURB)) expect(PARTS.some((p) => p.id === id), id).toBe(true);
  });

  it('every tool, frame and workshop machine has its line', () => {
    for (const k of Object.keys(TOOL_INFO) as ToolKind[]) expect(TOOL_BLURB[k]?.zh.length, k).toBeGreaterThan(3);
    for (const f of FRAMES) expect(FRAME_BLURB[f.id]?.length, f.id).toBeGreaterThan(3);
    for (const id of ['door', 'lights', 'charger', 'lift', 'tyrechanger', 'radio', 'sink', 'paintbooth']) expect(DEVICE_BLURB[id]?.name, id).toBeTruthy();
  });

  it('every part makes a card: what it is, its numbers, what is in it', () => {
    for (const p of PARTS) {
      const inst = newInstance(p.id, { fuelL: 5, charge: 0.5 });
      const c = partCard(inst, { mount: '测试' });
      expect(c.name).toBe(p.name.zh);
      expect(c.cat.length).toBeGreaterThan(2);
      expect(c.stars).toBe(PART_BLURB[p.id].stars);
      expect(c.foot.mass!).toBeGreaterThanOrEqual(p.mass - 1e-9);
      if (p.engine) {
        expect(c.curve, p.id).toBeDefined();
        expect(c.curve!.points.length).toBeGreaterThan(8);
        expect(c.curve!.peak![1]).toBeGreaterThan(0);
        if (p.engine.oilL > 0) expect(c.bars.some((b) => b.label === '机油'), p.id).toBe(true);
      }
      if (p.tire) expect(c.columns?.items.length, p.id).toBe(7);
      if (p.radiator) expect(c.bars.some((b) => b.tone === 'water'), p.id).toBe(true);
      if (p.battery) expect(c.bars.some((b) => b.tone === 'charge'), p.id).toBe(true);
      if (p.fuelTank) expect(c.bars[0].max, p.id).toBe(p.fuelTank.litres);
      // (the numbers are numbers)
      for (const r of c.rows) expect(r.value, `${p.id} ${r.label}`).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  it('a can shows what is in it, by kind', () => {
    const c = toolCard(newTool('jerrycan', { fuel: 'diesel', litres: 7.5 }));
    expect(c.name).toContain('柴油');
    expect(c.bars[0].value).toBeCloseTo(7.5);
    expect(c.bars[0].max).toBe(TOOL_INFO.jerrycan.capacity);
    expect(c.bars[0].parts?.[0].tone).toBe('diesel');
    expect(toolCard(newTool('bottle', { litres: 2 })).bars[0].tone).toBe('water');
    expect(toolCard(newTool('oilcan', { litres: 1 })).bars[0].tone).toBe('oil');
  });
});

describe('ModCar fillers and liquids', () => {
  it('every engine that takes oil has an oil filler, every radiator a water filler, the motorcycle tank its cap', () => {
    for (const p of PARTS) {
      if (p.engine && p.engine.oilL > 0) expect(FILLERS[p.id]?.kind, p.id).toBe('oil');
      if (p.radiator) expect(FILLERS[p.id]?.kind, p.id).toBe('water');
    }
    expect(FILLERS.tank_moto.kind).toBe('fuel');
    for (const id of Object.keys(FILLERS)) expect(() => partDef(id)).not.toThrow();
  });

  it('each can carries its own liquid', () => {
    expect(liquidOf(newTool('jerrycan'))).toBe('fuel');
    expect(liquidOf(newTool('bottle'))).toBe('water');
    expect(liquidOf(newTool('oilcan'))).toBe('oil');
    expect(liquidOf(newTool('spray'))).toBe(null);
    expect(liquidOf(newTool('sponge'))).toBe(null);
  });

  it('fuel poured in comes back out the same, litre for litre', () => {
    const b = stockBuild('sedan', { fuel: 0 });
    const can = newTool('jerrycan', { fuel: 'petrol', litres: 20 });
    let moved = 0;
    for (let i = 0; i < 60; i++) moved += pour(can, b, 0.05);
    expect(moved).toBeCloseTo(TOOL_INFO.jerrycan.rate * 3, 5);
    expect(tankL(b)).toBeCloseTo(moved, 6);
    expect(can.litres).toBeCloseTo(20 - moved, 6);
    let back = 0;
    for (let i = 0; i < 40; i++) back += siphon(can, b, 0.05);
    expect(back).toBeGreaterThan(0.5);
    expect(tankL(b)).toBeCloseTo(moved - back, 6);
    expect(can.litres).toBeCloseTo(20 - moved + back, 6);
  });

  it('a can is never filled past what it holds, nor a tank drawn below empty', () => {
    const b = stockBuild('sedan', { fuel: 0 });
    b.parts.fuelTank.fluids.fuel = { petrol: 1 };
    const can = newTool('jerrycan', { fuel: 'petrol', litres: 19.5 });
    for (let i = 0; i < 200; i++) siphon(can, b, 0.05);
    expect(can.litres!).toBeLessThanOrEqual(TOOL_INFO.jerrycan.capacity + 1e-9);
    expect(can.litres).toBeCloseTo(20, 6);
    expect(tankL(b)).toBeCloseTo(0.5, 6);
    expect(siphonUse(can, b).can).toBe(false);
    const empty = newTool('jerrycan', { fuel: 'petrol', litres: 0 });
    for (let i = 0; i < 200; i++) siphon(empty, b, 0.05);
    expect(tankL(b)).toBeGreaterThanOrEqual(0);
    expect(tankL(b)).toBeCloseTo(0, 6);
    expect(siphonUse(newTool('jerrycan', { litres: 0 }), b).can).toBe(false);
  });

  it('an empty can takes the fuel there is most of; one with petrol in it will not draw diesel', () => {
    const b = stockBuild('pickup', { fuel: 0 });
    b.parts.fuelTank.fluids.fuel = { diesel: 6, petrol: 1 };
    const empty = newTool('jerrycan', { fuel: 'petrol', litres: 0 });
    siphon(empty, b, 0.5);
    expect(empty.fuel).toBe('diesel');
    expect(b.parts.fuelTank.fluids.fuel.petrol).toBeCloseTo(1, 9);
    const petrol = newTool('jerrycan', { fuel: 'petrol', litres: 5 });
    b.parts.fuelTank.fluids.fuel = { diesel: 6 };
    const use = siphonUse(petrol, b);
    expect(use.can).toBe(false);
    expect(use.why?.zh).toContain('汽油');
    expect(siphon(petrol, b, 1)).toBe(0);
  });

  it('water and oil go in and come back out', () => {
    const b = stockBuild('sedan', { fuel: 0 });
    const rad = b.parts.radiator;
    rad.fluids.coolantL = 1;
    const bottle = newTool('bottle', { litres: 4 });
    const w = pour(bottle, b, 1);
    expect(rad.fluids.coolantL).toBeCloseTo(1 + w, 9);
    const wb = siphon(bottle, b, 1);
    expect(wb).toBeGreaterThan(0);
    expect(rad.fluids.coolantL).toBeCloseTo(1 + w - wb, 9);
    const eng = b.parts.engine;
    eng.fluids.oilL = 2;
    const can = newTool('oilcan', { litres: 1 });
    const back = siphon(can, b, 1);
    expect(back).toBeGreaterThan(0);
    expect(eng.fluids.oilL).toBeCloseTo(2 - back, 9);
    expect(can.litres).toBeCloseTo(1 + back, 9);
  });
});
