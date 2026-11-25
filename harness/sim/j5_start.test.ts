/**
 * J5 (docs/V3/plan/growth.md §一 1–3, 定案 1, 7): a new game's start and its difficulty, as data.
 *   - the difficulties: the normal one is the body's rules as they are; the comfortable one slower to hunger, thirst
 *     and cold and gentler when they hurt, the hard one quicker and harder; the road's supply 1.4 / 1 / 0.7
 *   - the Sugar Cube a bare shell: what is under its floor on it (old), the tank dry; twenty-nine parts about the
 *     workshop, each old, the engine at 45 %, the worn steering wheel, no radio; every one of them goes on a place the
 *     shell has empty, and every empty place has its part
 *   - the board: its car steps ask for exactly those places; the start's junk is the plastic scraper's cost exactly
 */
import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, DIFFICULTY, difficultyOf, vitalsRules } from '../../src/core/modcar/difficulty';
import { VITALS } from '../../src/core/modcar/vitals';
import { bareShell, KEPT_ON, KIT_STEPS, START_ENGINE_COND, START_JUNK, startParts } from '../../src/core/modcar/startKit';
import { frameDef } from '../../src/core/modcar/frames';
import { partDef } from '../../src/core/modcar/parts';
import { itemDef } from '../../src/core/modcar/items';
import { recipeDef } from '../../src/core/modcar/crafting';

import { crankProblems } from '../../src/core/modcar/rules';

describe('J5: the difficulties', () => {
  it('normal is the rules as they are; comfortable gentler, hard harder; an unknown word is normal', () => {
    expect(vitalsRules('normal')).toBe(VITALS);
    const easy = vitalsRules('easy');
    const hard = vitalsRules('hard');
    for (const k of ['foodDrain', 'waterDrain', 'tempLoss', 'heatGain', 'starveHp', 'thirstHp', 'hypoHp'] as const) {
      expect(easy[k]).toBeLessThan(VITALS[k]);
      expect(hard[k]).toBeGreaterThan(VITALS[k]);
    }
    // (what is not about hunger, thirst, cold or heat stays: stamina, how life comes back)
    expect(hard.sprintCost).toBe(VITALS.sprintCost);
    expect(easy.regenEvery).toBe(VITALS.regenEvery);
    expect(DIFFICULTIES.map((d) => DIFFICULTY[d].supply)).toEqual([1.4, 1, 0.7]);
    expect(DIFFICULTIES.map((d) => DIFFICULTY[d].name.zh)).toEqual(['舒适', '普通', '艰苦']);
    expect(difficultyOf('hard')).toBe('hard');
    expect(difficultyOf(undefined)).toBe('normal');
    expect(difficultyOf('nightmare')).toBe('normal');
    // a normal game's food lasts Nomad Drive's 76 minutes (J6)
    expect(Math.round(100 / vitalsRules('normal').foodDrain / 60)).toBe(76);
  });
});

describe('J5: the Sugar Cube from a bare shell', () => {
  it('the shell has what is under its floor, old, and an empty tank', () => {
    const b = bareShell();
    expect(Object.keys(b.parts).sort()).toEqual([...KEPT_ON].sort());
    expect(b.parts.gearbox.cond).toBe(0.5);
    expect(b.parts.exhaust.cond).toBe(0.5);
    const fuel = Object.values(b.parts.fuelTank.fluids.fuel ?? {}).reduce((a, c) => a + (c ?? 0), 0);
    expect(fuel).toBe(0);
    // it will not crank: no battery, no key, no engine
    expect(crankProblems(b).map((p) => p.code).sort()).toEqual(['no_battery', 'no_engine', 'no_ignition']);
  });

  it('twenty-nine old parts, each for a place the shell has empty, every empty place given one; no radio', () => {
    const b = bareShell();
    const parts = startParts();
    expect(parts.length).toBe(29);
    const f = frameDef('sedan');
    const empty = f.mounts.filter((m) => !b.parts[m.id] && m.id !== 'radio' && !['armor_L', 'armor_R', 'roof', 'hitch', 'ladder'].includes(m.id)).map((m) => m.id);
    expect(parts.map((p) => p.mount).sort()).toEqual(empty.sort());
    for (const p of parts) {
      const m = f.mounts.find((x) => x.id === p.mount)!;
      expect(partDef(p.inst.part).cat).toBe(m.cat);
      expect(p.inst.cond).toBeGreaterThanOrEqual(0.4);
      expect(p.inst.cond).toBeLessThanOrEqual(0.7);
    }
    expect(parts.some((p) => p.mount === 'radio')).toBe(false);
    const eng = parts.find((p) => p.mount === 'engine')!;
    expect(eng.inst.part).toBe('eng_i4');
    expect(eng.inst.cond).toBe(START_ENGINE_COND);
    expect(eng.inst.fluids.oilL).toBeGreaterThan(0);
    expect(parts.find((p) => p.mount === 'steering')!.inst.part).toBe('steer_bad');
    // the radiator dry (the board asks for water), the battery half charged, the tyres with most of their tread (J7: they wear fast on gravel)
    expect(parts.find((p) => p.mount === 'radiator')!.inst.fluids.coolantL).toBe(0);
    expect(parts.find((p) => p.mount === 'battery')!.inst.fluids.charge).toBe(0.5);
    for (const w of parts.filter((p) => p.mount.startsWith('hub_'))) {
      expect(w.inst.sub.tire?.tread).toBeGreaterThanOrEqual(0.8);
      expect(w.inst.sub.tire?.tread).toBeLessThanOrEqual(0.95);
    }
    // the same every new game
    expect(startParts().map((p) => `${p.mount}:${p.inst.cond}`)).toEqual(parts.map((p) => `${p.mount}:${p.inst.cond}`));
  });

  it("the board's car steps ask for exactly the parts' places; the key with the ones to start", () => {
    const asked = KIT_STEPS.flatMap((s) => s.mounts ?? []);
    expect(new Set(asked).size).toBe(asked.length);
    expect(asked.sort()).toEqual(startParts().map((p) => p.mount).sort());
    expect(KIT_STEPS.find((s) => s.id === 'ignition')!.group).toBe('start');
    expect(KIT_STEPS.filter((s) => s.group === 'start').map((s) => s.id)).toEqual(['engine', 'battery', 'ignition', 'radiator', 'water', 'fuel']);
    expect(KIT_STEPS.filter((s) => s.group === 'drive').map((s) => s.id)).toEqual(['wheels', 'steering', 'driverSeat', 'gearLever', 'handbrake']);
    // (to drive: what driveProblems and crankProblems ask for is all in the first two groups)
    const firstTwo = new Set(KIT_STEPS.filter((s) => s.group !== 'car').flatMap((s) => s.mounts ?? []));
    for (const cat of ['battery', 'ignition', 'engine'] as const) expect(firstTwo.has(frameDef('sedan').mounts.find((m) => m.cat === cat)!.id)).toBe(true);
  });

  it("the start's junk gives the plastic scraper's cost exactly: two boxes and a dead television, picked up with a press", () => {
    const scrap = START_JUNK.reduce((a, id) => a + (itemDef(id).salvage.scrap ?? 0), 0);
    expect(scrap).toBe(50);
    expect(recipeDef('scraper_1').cost.scrap).toBe(50);
    expect(itemDef('junk_tv_dead').cat).toBe('junk');
  });
});
