/**
 * Wrecks by the road as loot (src/core/modcar/wrecks.ts, docs/MODCAR.md §19): one of our frames with what is
 * left of it, the same for the same wreck every time; most panels and lamps on, a wheel more often than not,
 * three to eight of the rest (fewer on one stripped long ago); the grades better the further down the road; a
 * motorcycle's own never on a car or a car's on a motorcycle; tyres worn, some flat; the dregs in the tank of the
 * engine's own fuel; a few things in the boot (none on a motorcycle). And it drives like any build, if it can.
 */
import { describe, expect, it } from 'vitest';
import { partStars } from '../../src/core/modcar/crafting';
import { derive } from '../../src/core/modcar/derive';
import { frameDef } from '../../src/core/modcar/frames';
import { itemDef } from '../../src/core/modcar/items';
import { partDef } from '../../src/core/modcar/parts';
import { ModSystems } from '../../src/core/modcar/systems';
import type { Build } from '../../src/core/modcar/types';
import { findOdds, foundWeight, gradesOn, isRare, rollWreck, wreckFrame } from '../../src/core/modcar/wrecks';

/** a build as text without its ids (two rolls of one wreck are the same wreck) */
function sig(b: Build): string {
  return JSON.stringify(b, (k, v) => (k === 'uid' ? undefined : v));
}

const SEEDS = Array.from({ length: 600 }, (_, i) => (i * 2654435761) | 0);

describe('ModCar wrecks by the road (Drive Beyond Horizons, Arctic Drive)', () => {
  it('is the same wreck every time its seed is rolled', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const a = rollWreck(seed, seed & 3, (seed & 8) !== 0, 5000);
      const b = rollWreck(seed, seed & 3, (seed & 8) !== 0, 5000);
      expect(sig(a.build)).toBe(sig(b.build));
      expect(a.items).toEqual(b.items);
      expect(a.tools.map((t) => [t.kind, t.tier, t.colour, t.paint, t.litres])).toEqual(b.tools.map((t) => [t.kind, t.tier, t.colour, t.paint, t.litres]));
      expect(a.build.frame).toBe(wreckFrame(seed & 3, seed));
    }
  });

  it('has its finds: about one wreck in four by the workshop (a ★5 one in a hundred), most of them a hundred kilometres on', () => {
    const near = findOdds(0);
    const far = findOdds(100_000);
    expect(near.grades.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(far.grades.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(findOdds(300_000)).toEqual(far);
    expect(far.mean).toBeGreaterThan(4 * near.mean);
    const stats = (s: number): { find: number; rare: number; five: number } => {
      let find = 0;
      let rare = 0;
      let five = 0;
      const n = 1500;
      for (let i = 0; i < n; i++) {
        const seed = (i * 2654435761) | 0;
        const w = rollWreck(seed, i & 3, i % 5 < 3, s);
        const all = gradesOn(w.build).filter((g) => isRare(w.build.frame, g.part));
        if (w.finds.length) find++;
        if (all.length) rare++;
        if (all.some((g) => g.star >= 5)) five++;
        // (every find is on it: the part on its mount, or the tyre or the turbo on the part there)
        for (const f of w.finds) {
          const inst = w.build.parts[f.mount];
          expect(f.sub ? inst.sub[f.sub]?.part : inst.part, `${f.part} on ${f.mount}`).toBe(f.part);
          expect(partStars(f.part)).toBeGreaterThanOrEqual(3);
        }
      }
      return { find: find / n, rare: rare / n, five: five / n };
    };
    const a = stats(0);
    const b = stats(100_000);
    expect(a.find).toBeGreaterThan(0.17);
    expect(a.find).toBeLessThan(0.3);
    expect(a.rare).toBeLessThan(0.14);
    expect(a.five).toBeGreaterThan(0.002);
    expect(a.five).toBeLessThan(0.02);
    expect(b.find).toBeGreaterThan(0.55);
    expect(b.rare).toBeGreaterThan(3 * a.rare);
    expect(b.five).toBeGreaterThan(0.04);
  });

  it('keeps most of the shell and some of the works, fewer on one stripped long ago; every part fits where it is', () => {
    let kept = 0;
    let keptStripped = 0;
    let wheels = 0;
    let hubs = 0;
    for (const seed of SEEDS) {
      for (const stripped of [false, true]) {
        const w = rollWreck(seed, seed & 3, stripped, 20_000);
        const f = frameDef(w.build.frame);
        const n = Object.keys(w.build.parts).length;
        if (stripped) keptStripped += n;
        else kept += n;
        for (const [mount, inst] of Object.entries(w.build.parts)) {
          const m = f.mounts.find((x) => x.id === mount)!;
          expect(m, mount).toBeTruthy();
          const p = partDef(inst.part);
          expect(foundWeight(f, m, p), `${p.id} on ${f.id}.${mount}`).toBeGreaterThan(0);
          if (m.cat === 'rim' && !stripped) wheels++;
        }
        if (!stripped) hubs += f.mounts.filter((m) => m.cat === 'rim').length;
      }
    }
    expect(keptStripped).toBeLessThan(kept * 0.7);
    // (a wheel more often than not)
    expect(wheels / hubs).toBeGreaterThan(0.5);
    expect(wheels / hubs).toBeLessThan(0.7);
  });

  it('a motorcycle has only a motorcycle’s own wheels, bars and saddle; a car none of them; a twin rim only where one was', () => {
    const moto = frameDef('moto');
    const sedan = frameDef('sedan');
    const rv = frameDef('rv');
    const m = (f: typeof moto, id: string) => f.mounts.find((x) => x.id === id)!;
    expect(foundWeight(moto, m(moto, 'steering'), partDef('steer_std'))).toBe(0);
    expect(foundWeight(moto, m(moto, 'steering'), partDef('steer_bar'))).toBeGreaterThan(0);
    expect(foundWeight(sedan, m(sedan, 'steering'), partDef('steer_bar'))).toBe(0);
    expect(foundWeight(sedan, m(sedan, 'hub_FL'), partDef('rim_moto18'))).toBe(0);
    expect(foundWeight(sedan, m(sedan, 'hub_RL'), partDef('rim_dually'))).toBe(0);
    expect(foundWeight(rv, m(rv, 'hub_RL'), partDef('rim_dually'))).toBeGreaterThan(0);
    expect(foundWeight(rv, m(rv, 'hub_FL'), partDef('rim_dually'))).toBe(0);
    // (another car's own is as good as the aftermarket's, a lawnmower's engine seldom)
    expect(foundWeight(sedan, m(sedan, 'engine'), partDef('eng_i4d'))).toBe(1);
    expect(foundWeight(sedan, m(sedan, 'engine'), partDef('eng_i4'))).toBe(2);
    expect(foundWeight(sedan, m(sedan, 'engine'), partDef('eng_mower'))).toBeLessThan(0.5);
  });

  it('tyres worn, some flat; a little oil, the battery nearly flat; the dregs in the tank of its own engine’s fuel', () => {
    let tyres = 0;
    let flat = 0;
    let fuelled = 0;
    let tanks = 0;
    for (const seed of SEEDS) {
      const w = rollWreck(seed, seed & 3, false, 1000);
      for (const inst of Object.values(w.build.parts)) {
        const d = partDef(inst.part);
        const t = inst.sub.tire;
        if (t) {
          tyres++;
          if (t.flat) flat++;
          expect(t.tread).toBeGreaterThanOrEqual(0.05);
          expect(t.tread).toBeLessThanOrEqual(0.7);
        }
        if (d.engine && d.engine.oilL > 0) expect(inst.fluids.oilL!).toBeLessThan(d.engine.oilL * 0.71);
        if (d.battery) expect(inst.fluids.charge!).toBeLessThan(0.41);
        if (d.fuelTank) {
          tanks++;
          const fuel = Object.entries(inst.fluids.fuel ?? {});
          if (fuel.length) {
            fuelled++;
            expect(fuel.length).toBe(1);
            expect(fuel[0][1]!).toBeLessThanOrEqual(Math.min(8, d.fuelTank.litres));
            const eng = Object.values(w.build.parts).find((x) => partDef(x.part).engine);
            if (eng) expect(fuel[0][0]).toBe(partDef(eng.part).engine!.fuel);
          }
        }
        expect(inst.cond).toBeLessThanOrEqual(0.85);
        expect(inst.dirt).toBeGreaterThanOrEqual(0.5);
      }
    }
    expect(flat / tyres).toBeGreaterThan(0.18);
    expect(flat / tyres).toBeLessThan(0.38);
    expect(fuelled / tanks).toBeGreaterThan(0.3);
    expect(fuelled / tanks).toBeLessThan(0.5);
  });

  it('leaves a few things in the boot (none on a motorcycle), a spray can now and then; better things further on', () => {
    let n = 0;
    let cans = 0;
    let moto = 0;
    let starsNear = 0;
    let starsFar = 0;
    let countNear = 0;
    let countFar = 0;
    for (const seed of SEEDS) {
      const w = rollWreck(seed, 0, false, 0);
      if (w.build.frame === 'moto') {
        moto++;
        expect(w.items).toEqual([]);
        expect(w.tools).toEqual([]);
        continue;
      }
      n += w.items.length;
      cans += w.tools.filter((t) => t.kind === 'spray').length;
      for (const id of w.items) {
        const it = itemDef(id);
        expect(it.carry).not.toBe('large');
        starsNear += it.stars;
        countNear++;
      }
      for (const id of rollWreck(seed, 0, false, 100_000).items) {
        starsFar += itemDef(id).stars;
        countFar++;
      }
    }
    expect(moto).toBeGreaterThan(20);
    expect(n / (SEEDS.length - moto)).toBeGreaterThan(0.9);
    expect(n / (SEEDS.length - moto)).toBeLessThan(2.2);
    expect(cans).toBeGreaterThan(30);
    expect(starsFar / countFar).toBeGreaterThan(starsNear / countNear);
  });

  it('every wreck is a build like any other: it derives, its systems run', () => {
    for (const seed of SEEDS.slice(0, 120)) {
      const w = rollWreck(seed, seed & 3, (seed & 4) !== 0, 50_000);
      expect(() => derive(w.build)).not.toThrow();
      const sys = new ModSystems(w.build);
      expect(sys.derived.spec).toBeTruthy();
      for (const g of gradesOn(w.build)) expect(g.star).toBe(partStars(g.part));
    }
  });
});
