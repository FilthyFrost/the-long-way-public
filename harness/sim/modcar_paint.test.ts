/**
 * Spray paint as Arctic Drive has it (src/core/modcar/paint.ts, docs/MODCAR.md §16): three sizes of can, one
 * colour each, so much paint in it; a thing's coat goes over from its colour to the can's in 1 / speed seconds,
 * the can emptying one unit a second only while the coat is not yet whole; what is that colour already costs
 * nothing; a coat left half-done stays so, and another colour starts over from it; an empty can does nothing.
 */
import { describe, expect, it } from 'vitest';
import { newInstance, stockBuild } from '../../src/core/modcar/build';
import { RECIPES, recipeOpen, toolSalvage } from '../../src/core/modcar/crafting';
import { BASIC_PAINTS, PAINT_YELLOW, PALETTE, paintHex } from '../../src/core/modcar/palette';
import { coatOf, keepPartColours, mixHex, PAINTED_CATS, paintNow, paintTargets, SPRAY_DRAIN, SPRAY_TIERS, sprayColours, sprayFound, sprayLeft, spraySalvage, sprayStep, takesPaint } from '../../src/core/modcar/paint';
import { newTool, toolModelId, toolName, toolUse } from '../../src/core/modcar/tools';

/** spray at it for `seconds` at 60 frames a second: what each frame did */
function sprayFor(can: ReturnType<typeof newTool>, p: { paint: number; paintMix?: { from: number; t: number } }, seconds: number, from = 0x808080): ReturnType<typeof sprayStep>[] {
  const out: ReturnType<typeof sprayStep>[] = [];
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) out.push(sprayStep(can, p, paintNow(p, from), 1 / 60));
  return out;
}

describe('ModCar spray paint (Arctic Drive)', () => {
  it("has the three cans at Arctic Drive's figures: 10 units at 0.25, 50 at 0.35, 100 at 0.5; one unit a second", () => {
    expect([1, 2, 3].map((t) => SPRAY_TIERS[t as 1 | 2 | 3].capacity)).toEqual([10, 50, 100]);
    expect([1, 2, 3].map((t) => SPRAY_TIERS[t as 1 | 2 | 3].speed)).toEqual([0.25, 0.35, 0.5]);
    expect([1, 2, 3].map((t) => SPRAY_TIERS[t as 1 | 2 | 3].found)).toEqual([[2, 10], [15, 50], [50, 100]]);
    expect([1, 2, 3].map((t) => SPRAY_TIERS[t as 1 | 2 | 3].stars)).toEqual([1, 2, 4]);
    expect(SPRAY_DRAIN).toBe(1);
    expect(PALETTE.length).toBe(27);
    // the small in the eight plain colours, the medium in all 27, the large in the plain ones but the yellow (42 cans)
    expect(sprayColours(1)).toEqual(BASIC_PAINTS);
    expect(sprayColours(2).length).toBe(27);
    expect(sprayColours(3).length).toBe(7);
    expect(sprayColours(3)).not.toContain(PAINT_YELLOW);
    expect(sprayColours(1).length + sprayColours(2).length + sprayColours(3).length).toBe(42);
  });

  it("a door goes over from its colour to the can's evenly in 1 / speed seconds, and the can loses as many units", () => {
    for (const tier of [1, 2, 3] as const) {
      const can = newTool('spray', { tier, colour: 13 });
      const door = newInstance('door_stock', { paint: 4 });
      const T = 1 / SPRAY_TIERS[tier].speed;
      const half = sprayFor(can, door, T / 2, paintHex(4));
      // half-way: half the coat on, the colour half-way between
      expect(door.paint).toBe(13);
      expect(door.paintMix!.t).toBeCloseTo(0.5, 1);
      const mid = paintNow(door, 0);
      expect(mid).toBe(mixHex(paintHex(4), paintHex(13), door.paintMix!.t));
      expect(half.every((r) => !r.done && r.used > 0)).toBe(true);
      const rest = sprayFor(can, door, T / 2 + 0.1, paintHex(4));
      expect(rest.some((r) => r.done)).toBe(true);
      expect(door.paintMix).toBeUndefined();
      expect(paintNow(door, 0)).toBe(paintHex(13));
      // (used: a unit a second for the T seconds the coat took, the frame that finished it free)
      expect(SPRAY_TIERS[tier].capacity - sprayLeft(can)).toBeCloseTo(T, 1);
    }
  });

  it('what is that colour already costs nothing; a body of that colour is that colour for a door that wears it', () => {
    const can = newTool('spray', { tier: 2, colour: 3 });
    const door = newInstance('door_stock', { paint: 3 });
    const r = sprayFor(can, door, 2);
    expect(r.every((x) => x.already && x.used === 0)).toBe(true);
    expect(sprayLeft(can)).toBe(50);
    // a door wearing the body's colour (−1), the body teal: a teal can makes it teal at once, for nothing
    const own = newInstance('door_stock');
    const step = sprayStep(can, own, paintHex(3), 1 / 60);
    expect(step.already).toBe(true);
    expect(own.paint).toBe(3);
    expect(sprayLeft(can)).toBe(50);
  });

  it('a coat left half-done stays half-done and goes on from there; another colour starts over from the in-between', () => {
    const red = newTool('spray', { tier: 2, colour: 13 });
    const hood = newInstance('hood_stock', { paint: 23 });
    sprayFor(red, hood, 1.2, paintHex(23));
    const t = hood.paintMix!.t;
    expect(t).toBeCloseTo(1.2 * 0.35, 1);
    const between = paintNow(hood, 0);
    // let go and come back: it goes on from t
    sprayStep(red, hood, between, 1 / 60);
    expect(hood.paintMix!.t).toBeGreaterThan(t);
    expect(coatOf(hood, 13)).toBe(hood.paintMix!.t);
    // a blue can now: from the colour it shows, the coat at nothing
    const blue = newTool('spray', { tier: 2, colour: 26 });
    const now = paintNow(hood, 0);
    sprayStep(blue, hood, now, 1 / 60);
    expect(hood.paint).toBe(26);
    expect(hood.paintMix!.from).toBe(now);
    expect(hood.paintMix!.t).toBeLessThan(0.02);
    expect(coatOf(hood, 13)).toBe(0);
  });

  it('a can runs dry: the coat stops where it is, an empty can paints nothing and says so; it stays a can for the recycler', () => {
    const can = newTool('spray', { tier: 1, colour: 13, paint: 2 });
    const door = newInstance('door_stock', { paint: 4 });
    const r = sprayFor(can, door, 3, paintHex(4));
    expect(sprayLeft(can)).toBe(0);
    expect(r.some((x) => x.empty)).toBe(true);
    // two units of a small can: half a coat
    expect(door.paintMix!.t).toBeCloseTo(0.5, 1);
    const t = door.paintMix!.t;
    const again = sprayStep(can, door, paintNow(door, 0), 1 / 60);
    expect(again.empty).toBe(true);
    expect(again.used).toBe(0);
    expect(door.paintMix!.t).toBe(t);
    expect(toolUse(can, stockBuild('sedan')).can).toBe(false);
    expect(toolSalvage(can)).toEqual({ scrap: 1 });
  });

  it("found cans are part full (a whole number in the size's range); made ones and new ones are full", () => {
    expect(sprayFound(1, 0)).toBe(2);
    expect(sprayFound(1, 0.9999)).toBe(10);
    expect(sprayFound(2, 0)).toBe(15);
    expect(sprayFound(3, 0.9999)).toBe(100);
    for (let i = 0; i < 50; i++) {
      const n = sprayFound(2, i / 50);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(15);
      expect(n).toBeLessThanOrEqual(50);
    }
    expect(sprayLeft(newTool('spray'))).toBe(50);
    expect(sprayLeft(newTool('spray', { tier: 3 }))).toBe(100);
    // (an old save's can: no figure, full)
    expect(sprayLeft({ tier: 2 })).toBe(50);
  });

  it('names, models and the recycler: 小喷漆罐（樱桃红）, a model per size, 1 or 5 scrap by size and colour', () => {
    expect(toolName(newTool('spray', { tier: 1, colour: 13 }))).toBe('小喷漆罐（樱桃红）');
    expect(toolName(newTool('spray', { tier: 2, colour: 24 }))).toBe('喷漆罐（云杉绿）');
    expect(toolName(newTool('spray', { tier: 3, colour: 23 }))).toBe('大喷漆罐（白）');
    expect([1, 2, 3].map((tier) => toolModelId({ kind: 'spray', tier: tier as 1 | 2 | 3 }))).toEqual(['spray_s', 'spray', 'spray_l']);
    expect(spraySalvage({ tier: 1, colour: 13 })).toBe(1);
    expect(spraySalvage({ tier: 2, colour: 13 })).toBe(1);
    expect(spraySalvage({ tier: 2, colour: 24 })).toBe(5);
    expect(spraySalvage({ tier: 3, colour: 13 })).toBe(5);
    // the bench makes no paint any more (docs/V3/plan/finish.md §七: there is enough of it down the road)
    expect(RECIPES.some((r) => r.makes.kind === 'tool' && r.makes.tool === 'spray')).toBe(false);
  });

  it('what takes paint: the body and every door, lid, bumper and mirror on it (each on its own); not engines, seats, wheels', () => {
    const b = stockBuild('sedan');
    const t = paintTargets(b);
    expect(t[0].mount).toBeNull();
    expect(t.length).toBe(11);
    expect(t.slice(1).every((x) => takesPaint(b.parts[x.mount!].part))).toBe(true);
    expect([...PAINTED_CATS].sort()).toEqual(['bumperFront', 'bumperRear', 'door', 'hood', 'mirror', 'trunk']);
    expect(takesPaint('eng_i4')).toBe(false);
    expect(takesPaint('seat_bucket')).toBe(false);
    expect(takesPaint('rim_steel13')).toBe(false);
    expect(takesPaint('door_stock')).toBe(true);
    expect(paintTargets(stockBuild('moto')).length).toBe(3);
  });

  it('the body taking a coat of its own: the doors and lids that wore its colour keep theirs, the others keep their own', () => {
    const b = stockBuild('sedan');
    b.parts.door_FR.paint = 13;
    const was = b.paint;
    keepPartColours(b);
    expect(b.parts.door_FL.paint).toBe(was);
    expect(b.parts.hood.paint).toBe(was);
    expect(b.parts.bumperFront.paint).toBe(was);
    expect(b.parts.door_FR.paint).toBe(13);
    // (an engine is not the body's colour: untouched)
    expect(b.parts.engine.paint).toBe(-1);
    const can = newTool('spray', { tier: 2, colour: 26 });
    sprayFor(can, b, 3, paintHex(was));
    expect(b.paint).toBe(26);
    expect(paintNow(b.parts.door_FL, 0)).toBe(paintHex(was));
  });

  it('mixes colours channel by channel', () => {
    expect(mixHex(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(mixHex(0xff0000, 0x0000ff, 0)).toBe(0xff0000);
    expect(mixHex(0xff0000, 0x0000ff, 1)).toBe(0x0000ff);
    expect(mixHex(0x102030, 0x102030, 0.37)).toBe(0x102030);
  });
});
