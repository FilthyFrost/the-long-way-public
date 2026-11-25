/**
 * F4 (docs/V3/plan/finish.md §五): the instruments in the cab. Each frame's plate laid out about its own two big
 * dials: nothing over anything else, nothing off the plate, the strip along the top with its eight lamps either side
 * of the gear; the bite out of the lower edge where a key must stay in sight; what the plate is told (the vehicle's
 * own distance, the air outside, the time of day) in the dashboard's data; and the corner of the screen off by
 * default.
 */
import { describe, expect, it } from 'vitest';
import { ASSIST_KEYS, ASSIST_KEY_NAMES, ASSIST_LABELS, DEFAULT_ASSISTS } from '../../src/game/modcar/assists';
import { CLUSTERS, layoutOf, outline } from '../../src/game/modcar/cluster';
import { stockBuild } from '../../src/core/modcar/build';
import { ModSystems, type ModEnv } from '../../src/core/modcar/systems';
import { VehicleSim, type VehicleInput } from '../../src/core/vehicle/sim';
import type { VehicleSpec } from '../../src/core/vehicle/spec';
import { FlatGround } from '../../src/core/world/ground';

/** how far apart each frame's own two big dials are (cm; measured from its own needles in the game, f4_gauges.mjs) */
const SEP: Record<string, number> = { sedan: 16.8, wagon: 16.8, goat: 13.2, rhino: 14.4, rv: 18.0, pickup: 21.6, buffalo: 21.6, van: 18.4, turtle: 18.4, elephant: 18.4, camel: 18.4, snail: 19.4, fox: 12.2, moto: 14.1 };

describe('F4: the instruments', () => {
  it('has a plate for each of the fourteen frames', () => {
    expect(Object.keys(CLUSTERS).sort()).toEqual(Object.keys(SEP).sort());
  });

  for (const [frame, spec] of Object.entries(CLUSTERS)) {
    it(`${frame}: its plate is laid out with nothing over anything else and nothing off it`, () => {
      const k = spec.scale ?? 1;
      const l = layoutOf(spec.style, SEP[frame] / k, true);
      const big = l.dials.filter((d) => d.kind === 'speed' || d.kind === 'rpm');
      expect(big.length).toBe(2);
      // the two big dials where the frame's own are (or as near as they fit beside each other), about the midpoint
      const apart = Math.abs(big[1].x - big[0].x);
      expect(apart).toBeGreaterThanOrEqual(SEP[frame] / k - 1e-6);
      expect(apart).toBeLessThan(SEP[frame] / k + 2.5);
      expect((big[0].x + big[1].x) / 2).toBeCloseTo(l.midX, 6);
      // every dial on the plate, under the strip, clear of every other
      const stripBottom = l.stripY - l.stripH / 2;
      for (const d of l.dials) {
        expect(d.x - d.r, `${d.kind} left`).toBeGreaterThanOrEqual(-l.w / 2 + 0.5);
        expect(d.x + d.r, `${d.kind} right`).toBeLessThanOrEqual(l.w / 2 - 0.5);
        expect(d.y - d.r, `${d.kind} bottom`).toBeGreaterThanOrEqual(-l.h / 2 + 0.5);
        expect(d.y + d.r, `${d.kind} top`).toBeLessThanOrEqual(stripBottom - 0.3);
      }
      for (let i = 0; i < l.dials.length; i++)
        for (let j = i + 1; j < l.dials.length; j++) {
          const a = l.dials[i];
          const b = l.dials[j];
          expect(Math.hypot(a.x - b.x, a.y - b.y), `${a.kind} and ${b.kind}`).toBeGreaterThanOrEqual(a.r + b.r);
        }
      // the strip: on the plate, its cells in their order and apart, eight lamps either side of the gear, the tyres
      expect(l.stripY + l.stripH / 2).toBeLessThanOrEqual(l.h / 2 - 0.5);
      let x = -l.w / 2 + 0.7;
      for (const c of l.cells) {
        expect(c.x, c.kind).toBeGreaterThanOrEqual(x);
        expect(c.w).toBeGreaterThan(2);
        x = c.x + c.w + 0.3;
      }
      expect(x).toBeLessThanOrEqual(l.w / 2 - 0.4 + 0.3);
      const kinds = l.cells.map((c) => c.kind);
      expect(kinds).toEqual([l.bike ? 'air' : 'clock', 'lamps', 'gear', 'lamps', 'tyres']);
      const lamps = l.cells.flatMap((c) => c.lamps ?? []);
      expect([...lamps].sort()).toEqual(['battery', 'engine', 'fuel', 'handbrake', 'high', 'lights', 'oil', 'temp']);
      // (the handbrake's lamp beside the gear: the first thing asked when the vehicle will not move)
      expect(l.cells[3].lamps?.[0]).toBe('handbrake');
      // a lamp big enough to be known for what it is: 1.3 cm of real plate and more
      expect((l.cells[1].w / 4) * k).toBeGreaterThanOrEqual(1.3);
      // the plate itself: no wider than a dashboard has room for, the speedometer 8 cm across and more
      expect(l.w * k).toBeLessThan(50);
      expect(l.h * k).toBeLessThan(17.5);
      expect(2 * l.dials.find((d) => d.kind === 'speed')!.r * k).toBeGreaterThanOrEqual(7.9);
      // what a plate shows: fuel on every one; water, battery and the air outside as dials on four wheels
      const small = l.dials.map((d) => d.kind).filter((s) => s !== 'speed' && s !== 'rpm').sort();
      expect(small).toEqual(l.bike ? ['fuel'] : ['air', 'batt', 'fuel', 'temp']);
    });
  }

  it('puts the speedometer on the side the frame has its own', () => {
    const left = layoutOf('sport', 14, true);
    const right = layoutOf('sport', 14, false);
    const sx = (l: ReturnType<typeof layoutOf>): number => l.dials.find((d) => d.kind === 'speed')!.x - l.dials.find((d) => d.kind === 'rpm')!.x;
    expect(sx(left)).toBeLessThan(0);
    expect(sx(right)).toBeGreaterThan(0);
  });

  it('puts the small dials outside the big ones where there is no room between them', () => {
    // (a long strip wants its two big dials 27 cm apart and more)
    const far = layoutOf('stack', 30, true);
    const near = layoutOf('stack', 20, true);
    const between = (l: ReturnType<typeof layoutOf>): boolean => {
      const s = l.dials.find((d) => d.kind === 'speed')!;
      const r = l.dials.find((d) => d.kind === 'rpm')!;
      const f = l.dials.find((d) => d.kind === 'fuel')!;
      return f.x > Math.min(s.x, r.x) && f.x < Math.max(s.x, r.x);
    };
    expect(between(far)).toBe(true);
    expect(between(near)).toBe(false);
  });

  it('bites a round-topped piece out of the lower edge where a key must stay in sight', () => {
    const area = (pts: { x: number; y: number }[]): number => {
      let a = 0;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const q = pts[(i + 1) % pts.length];
        a += p.x * q.y - q.x * p.y;
      }
      return a / 2;
    };
    const w = 0.26;
    const h = 0.14;
    const whole = outline(w, h, 0, null);
    expect(whole.length).toBe(4);
    expect(area(whole)).toBeCloseTo(w * h, 9);
    // 5.8 cm wide, 4.2 cm up: 1.3 cm of straight sides and a half circle of 2.9 cm over them
    const bite = { x: 0, half: 0.029, h: 0.042 };
    const bitten = outline(w, h, 0, bite);
    const gone = 0.058 * 0.013 + (Math.PI * 0.029 * 0.029) / 2;
    expect(area(bitten)).toBeGreaterThan(0);
    expect(w * h - area(bitten)).toBeGreaterThan(gone * 0.97);
    expect(w * h - area(bitten)).toBeLessThan(gone * 1.01);
    for (const p of bitten) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(w / 2 + 1e-9);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(h / 2 + 1e-9);
    }
    // its top where it was asked for
    expect(Math.max(...bitten.filter((p) => Math.abs(p.x) < 0.001).map((p) => p.y))).toBeCloseTo(-h / 2 + 0.042, 6);
    // the case's wall round it: outside the plate everywhere, the bite the smaller by it
    const wall = outline(w, h, 0.008, bite);
    expect(area(wall)).toBeGreaterThan(area(bitten));
    expect(Math.max(...wall.filter((p) => Math.abs(p.x) < 0.001).map((p) => p.y))).toBeCloseTo(-h / 2 + 0.042 - 0.008, 6);
    // a shallow bite is all round: no straight sides, no point under the edge
    const shallow = outline(w, h, 0, { x: 0.04, half: 0.035, h: 0.02 });
    expect(Math.min(...shallow.map((p) => p.y))).toBeGreaterThanOrEqual(-h / 2 - 1e-9);
    expect(w * h - area(shallow)).toBeGreaterThan(0.0005);
  });

  it("tells the plate the vehicle's own distance, the air outside and the time of day", () => {
    const sys = new ModSystems(stockBuild('sedan'));
    const sim = new VehicleSim(sys.derived.spec as VehicleSpec);
    sim.reset(0, 0, 0, 0);
    sys.bind(sim);
    const ground = new FlatGround();
    const env: ModEnv = { ambientC: -7, dark: false, rain: 0, sun: 1, hour: 17.5 };
    const run = (seconds: number, input: Partial<VehicleInput>): void => {
      const inp: VehicleInput = { steer: 0, throttle: 0, brake: 0, handbrake: 0, ...input };
      for (let i = 0; i < Math.round(seconds * 120); i++) {
        sim.substep(inp, ground);
        if (i % 4 === 3) sys.update(4 / 120, env);
      }
    };
    sys.crank(true);
    run(1.5, {});
    sys.crank(false);
    expect(sys.dash.odoKm).toBeLessThan(0.001);
    // (standing, it has gone nowhere: its build is as it was — a wreck by the road is not "touched" by settling)
    expect(sys.build.odo).toBeUndefined();
    expect(sys.dash.outC).toBe(-7);
    expect(sys.dash.hour).toBe(17.5);
    sim.setParkBrake(false);
    run(20, { throttle: 0.6 });
    // what it has gone on its own wheels, kept with the build (it is saved with it)
    expect(sim.odometer).toBeGreaterThan(100);
    expect(sys.dash.odoKm).toBeCloseTo(sim.odometer / 1000, 2);
    // (kept in whole metres)
    expect(Number.isInteger(sys.build.odo)).toBe(true);
    expect(sim.odometer - (sys.build.odo ?? 0)).toBeGreaterThanOrEqual(0);
    expect(sim.odometer - (sys.build.odo ?? 0)).toBeLessThan(1.001);
    // another set of systems on the same build (the game loaded again): the distance is still there
    const again = new ModSystems(sys.build);
    const sim2 = new VehicleSim(again.derived.spec as VehicleSpec);
    sim2.reset(0, 0, 0, 0);
    again.bind(sim2);
    again.update(1 / 30, env);
    expect(again.dash.odoKm).toBeCloseTo(sim.odometer / 1000, 2);
  });

  it('leaves the corner of the screen empty by default, with a switch for it', () => {
    expect(DEFAULT_ASSISTS.screenDash).toBe(false);
    expect(ASSIST_LABELS.some(([k]) => k === 'screenDash')).toBe(true);
    // a key for every assist on the card
    expect(ASSIST_KEYS.length).toBeGreaterThanOrEqual(ASSIST_LABELS.length);
    expect(ASSIST_KEY_NAMES.length).toBe(ASSIST_KEYS.length);
  });
});
