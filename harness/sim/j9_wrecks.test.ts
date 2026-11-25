/**
 * J9 (docs/V3/plan/growth.md §六 2, 定案 2): the wrecks by the road are for their parts; the vehicles one finds come by
 * the plan's table — a bare frame of the planned sort at a big place, a set of parts beside it, its missing panels down
 * the road after it.
 *   - takeableWreck: a big place's, from 12 km; never a verge's lay-by nor a hide, never before
 *   - the plan: a Loaf or a Mule between 12 and 20 km, the Swallow 25–40, a Buffalo, Wanderer, Goat or Fox 30–45, the
 *     Whale 50–70, the Tadpole trailer 75–100 (J9d; each at least 5 km after the one before), then one every 15–20 km
 *     from the 100th kilometre — the Rhino and the Snail first — never the same sort twice running
 *   - a found frame: what is under its floor, its seats and controls on it (one gets in), each panel seven times in ten;
 *     beside it its engine, radiator, battery and wheels, of the plan's tier; its missing panels each 2–6 km after it
 *   - over real worlds: each find at a big place, on its levelled ground clear of what is there, the first by 25 km
 */
import { describe, expect, it } from 'vitest';
import { stockPartFor } from '../../src/core/modcar/build';
import { frameDef, frameSize } from '../../src/core/modcar/frames';
import { partDef } from '../../src/core/modcar/parts';
import { vehicleExtras, vehiclePlan, VEHICLE_PLACES } from '../../src/core/modcar/schedule';
import { rollFound } from '../../src/core/modcar/wrecks';
import type { Site } from '../../src/core/world/sites';
import { TAKE_FROM_M, takeableWreck, VehicleFinds, wreckSpots } from '../../src/game/modcar/wrecks';
import { modcarWorld } from '../../src/game/modcar/seamless';
import { NEWEST_WORLD } from '../../src/core/world/rules';
// (a new game's world lays Nomad Drive's buildings: their cards registered)
import '../../src/core/v3/nd/cards';

const SEEDS = [7, 1000, 8919, 16838, 24757, 20261113];

describe('J9: wrecks for their parts, vehicles found by the plan', () => {
  it('a big place from the 12th kilometre: one may take it; a verge or a hide never, nor before', () => {
    expect(takeableWreck({ siteKind: 'garage', s: TAKE_FROM_M })).toBe(true);
    expect(takeableWreck({ siteKind: 'works', s: 30_000 })).toBe(true);
    expect(takeableWreck({ siteKind: 'station', s: 50_000 })).toBe(true);
    expect(takeableWreck({ siteKind: 'garage', s: TAKE_FROM_M - 1 })).toBe(false);
    expect(takeableWreck({ siteKind: 'roadside', s: 50_000 })).toBe(false);
    expect(takeableWreck({ siteKind: 'hide', s: 50_000 })).toBe(false);
  });

  it('the plan: the table’s five by the 100th kilometre, then one every 15–20 km, never the same twice running', () => {
    for (let k = 0; k < 200; k++) {
      const seed = 1000 + k * 7919;
      const p = vehiclePlan(seed, 300);
      expect(vehiclePlan(seed, 300)).toEqual(p);
      const km = p.map((v) => v.s / 1000);
      expect(['van', 'pickup']).toContain(p[0].frame);
      expect(km[0]).toBeGreaterThanOrEqual(12);
      expect(km[0]).toBeLessThanOrEqual(20);
      expect(p[1].frame).toBe('moto');
      expect(km[1]).toBeGreaterThanOrEqual(25);
      expect(['buffalo', 'wagon', 'goat', 'fox']).toContain(p[2].frame);
      // (the Whale or the Turtle: docs/V3/plan/rv.md)
      expect(['rv', 'turtle']).toContain(p[3].frame);
      expect(p[3].tier).toBe(3);
      expect(km[3]).toBeGreaterThanOrEqual(50);
      expect(p[4].frame).toBe('trailer');
      expect(km[4]).toBeGreaterThanOrEqual(75);
      for (let i = 1; i < 5; i++) expect(km[i] - km[i - 1]).toBeGreaterThanOrEqual(5 - 1e-9);
      // (the five before the 100th kilometre — the Whale by 70, the trailer 5 km after it at least; the later ones from it)
      expect(km.filter((x) => x < 100).length).toBe(5);
      expect(km[4]).toBeLessThan(100);
      expect(p[5].frame).toBe('rhino');
      expect(p[6].frame).toBe('snail');
      expect(km[5]).toBeGreaterThanOrEqual(100);
      for (let i = 6; i < p.length; i++) {
        expect(km[i] - km[i - 1]).toBeGreaterThanOrEqual(15 - 1e-9);
        expect(km[i] - km[i - 1]).toBeLessThanOrEqual(20 + 1e-9);
        expect(p[i].frame).not.toBe(p[i - 1].frame);
      }
      for (const v of p) expect(v.themes).toEqual(VEHICLE_PLACES);
    }
  });

  it('a found frame: its floor, seats and controls on it, its engine, radiator, battery and wheels beside it, a panel in three gone', () => {
    let panels = 0;
    let gone = 0;
    for (const frame of ['van', 'pickup', 'moto', 'buffalo', 'wagon', 'goat', 'fox', 'rv', 'rhino', 'snail']) {
      const f = frameDef(frame);
      for (let k = 0; k < 20; k++) {
        const r = rollFound(frame, 77 + k * 131, k % 2 ? 3 : 2);
        const again = rollFound(frame, 77 + k * 131, k % 2 ? 3 : 2);
        expect(Object.keys(again.build.parts).sort()).toEqual(Object.keys(r.build.parts).sort());
        const driver = f.mounts.find((m) => m.driver)!;
        expect(r.build.parts[driver.id], `${frame}: the driver's seat`).toBeTruthy();
        for (const m of f.mounts) {
          if ((m.cat === 'engine' || m.cat === 'radiator' || m.cat === 'battery' || m.cat === 'rim') && stockPartFor(f, m)) {
            expect(r.build.parts[m.id], `${frame} ${m.id} not on it`).toBeFalsy();
            if (r.beside.length) expect(r.beside.some((b) => b.mount === m.id), `${frame} ${m.id} beside it`).toBe(true);
          }
          if (m.cat === 'gearbox' || m.cat === 'steering') expect(r.build.parts[m.id], `${frame} ${m.id}`).toBeTruthy();
        }
        // (the wheels beside it with their tyres on; the tier's better ones better)
        for (const b of r.beside) {
          if (partDef(b.inst.part).rim?.tire) expect(b.inst.sub.tire).toBeTruthy();
          expect(b.inst.cond).toBeGreaterThanOrEqual(k % 2 ? 0.7 : 0.55);
        }
        for (const m of r.missing) {
          expect(r.build.parts[m.mount]).toBeFalsy();
          gone++;
        }
        panels += r.missing.length + f.mounts.filter((m) => ['door', 'hood', 'trunk', 'bumperFront', 'bumperRear', 'mirror', 'headlight', 'taillight'].includes(m.cat) && r.build.parts[m.id]).length;
      }
    }
    // (seven in ten on it)
    expect(gone / panels).toBeGreaterThan(0.2);
    expect(gone / panels).toBeLessThan(0.4);
  });

  it('the panels missing from a find come 2–6 km after it, shaped for its frame', () => {
    for (const seed of SEEDS) {
      const vs = vehiclePlan(seed, 200);
      const extras = vehicleExtras(seed, 200);
      let n = 0;
      for (const v of vs) {
        const missing = rollFound(v.frame, v.seed, v.tier).missing;
        n += missing.length;
        for (const m of missing) {
          const e = extras.find((x) => 'part' in x.thing && x.thing.part === m.part && x.s >= v.s + 2000 - 1e-6 && x.s <= v.s + 6000 + 1e-6);
          expect(e, `${v.frame} ${m.mount}`).toBeTruthy();
          if (e && 'part' in e.thing) expect(e.thing.shapeOf).toBe(v.frame);
        }
      }
      // (and a trailer's hitch ball, 3–8 km before it at a workshop or a filling station)
      const trailers = vs.filter((v) => v.frame === 'trailer');
      for (const v of trailers) {
        const e = extras.find((x) => 'part' in x.thing && x.thing.part === 'hitch_ball');
        expect(e, 'the hitch ball').toBeTruthy();
        expect(e!.s).toBeGreaterThanOrEqual(v.s - 8000 - 1e-6);
        expect(e!.s).toBeLessThanOrEqual(v.s - 3000 + 1e-6);
        expect(e!.themes).toEqual(['garage', 'works', 'station']);
      }
      // (and the motorcycle rack's blueprint 2–5 km after the motorcycle: J9e)
      const motos = vs.filter((v) => v.frame === 'moto');
      for (const v of motos) {
        const e = extras.find((x) => x.entry === 'moto_rack' && x.s >= v.s + 2000 - 1e-6 && x.s <= v.s + 5000 + 1e-6);
        expect(e, `the moto rack blueprint after the motorcycle at ${(v.s / 1000).toFixed(1)} km`).toBeTruthy();
        expect(e!.thing).toEqual({ item: 'bp_moto_rack' });
      }
      expect(extras.length).toBe(n + trailers.length + motos.length);
    }
  });

  it('a trailer is found whole: its wheels and its door on it, nothing beside it, nothing missing', () => {
    const f = frameDef('trailer');
    for (let k = 0; k < 20; k++) {
      const r = rollFound('trailer', 91 + k * 37, 2);
      expect(r.beside.length).toBe(0);
      expect(r.missing.length).toBe(0);
      for (const m of f.mounts) if (stockPartFor(f, m)) expect(r.build.parts[m.id], m.id).toBeTruthy();
    }
  });

  // (a world of version 5 — a save's from before Nomad Drive's buildings came in — and a new game's, with them: a
  // vehicle to find at one of theirs stands in its yard, clear of its footprint and of what of it stands low)
  for (const version of [5, NEWEST_WORLD] as const) it(`over real worlds of version ${version}: each find of the plan at a big place, on its levelled ground clear of what is there; the wrecks by the road for their parts`, () => {
    const firsts: number[] = [];
    let finds = 0;
    let wrecks = 0;
    let atNd = 0;
    const sorts: Record<string, number> = {};
    for (const seed of SEEDS) {
      const w = modcarWorld(seed, { worldVersion: version }).world;
      const finder = new VehicleFinds(w);
      const spots = finder.extraSpots(0, 150_000);
      // (the world's own wrecks: none of them takeable)
      const own = wreckSpots(w, 0, 150_000);
      wrecks += own.length;
      expect(own.filter((x) => finder.has(x)).length).toBe(0);
      const plan = vehiclePlan(seed, 150);
      finds += spots.length;
      firsts.push(spots.length ? spots[0].s / 1000 : Infinity);
      // (in the plan's order: each find the next planned sort)
      expect(spots.map((x) => x.find!.frame)).toEqual(plan.slice(0, spots.length).map((v) => v.frame));
      const sites: Site[] = [];
      w.sites.between(0, 150_000, sites);
      for (const x of spots) {
        expect(finder.has(x)).toBe(true);
        sorts[x.find!.frame] = (sorts[x.find!.frame] ?? 0) + 1;
        const site = sites.find((y) => x.id.startsWith(`${y.id}/`))!;
        expect(VEHICLE_PLACES).toContain(site.kind);
        const clear = frameSize(x.find!.frame).length / 2 + 1.2;
        // (a box in its own frame, as near as `clear`: a prefab's footprint, its low solids)
        const off = (cx: number, cz: number, yaw: number, hx: number, hz: number): number => {
          const u = (x.x - cx) * Math.cos(yaw) + (x.z - cz) * Math.sin(yaw);
          const v = -(x.x - cx) * Math.sin(yaw) + (x.z - cz) * Math.cos(yaw);
          return Math.hypot(Math.max(0, Math.abs(u) - hx), Math.max(0, Math.abs(v) - hz));
        };
        for (const o of site.objects) {
          if (o.kind === 'line' || o.kind === 'patch') continue;
          if (o.kind === 'prefab') {
            atNd++;
            expect(off(o.x, o.z, o.yaw, o.w / 2, o.d / 2)).toBeGreaterThan(clear - 0.01);
            for (const sd of site.solids) if (sd.y0 < o.y + 2.6) expect(off(sd.x, sd.z, sd.yaw, sd.hx, sd.hz || sd.hx)).toBeGreaterThan(clear - 0.01);
          } else expect(Math.hypot(o.x - x.x, o.z - x.z)).toBeGreaterThan(Math.max(o.w, o.d) / 2 + clear - 0.01);
        }
        for (const l of site.loose) expect(Math.hypot(l.x - x.x, l.z - x.z)).toBeGreaterThan(clear - 0.01);
        const b = (x.x - site.x) * site.e2x + (x.z - site.z) * site.e2z;
        expect(b).toBeGreaterThan(4.5);
        expect(b).toBeLessThanOrEqual(site.depth);
      }
    }
    console.info(`six worlds of version ${version}, 150 km each: ${finds} vehicles to find (${JSON.stringify(sorts)}; ${atNd} at Nomad Drive's buildings), ${wrecks} wrecks for their parts; the first find at ${firsts.map((k) => k.toFixed(1)).join(', ')} km`);
    for (const k of firsts) {
      expect(k).toBeGreaterThanOrEqual(12);
      expect(k).toBeLessThan(25);
    }
    // (five by the 100th kilometre, two or three after it in 150 km; the trailer in each)
    expect(finds).toBeGreaterThanOrEqual(SEEDS.length * 6);
    expect(finds).toBeLessThanOrEqual(SEEDS.length * 9);
    expect(sorts.trailer).toBe(SEEDS.length);
  });
});

describe('a motorhome found on the road is in its own colours', () => {
  it('the four with a living space keep their factory two tones; a car is any two', async () => {
    const { FACTORY_PAINT } = await import('../../src/core/modcar/palette');
    for (const frame of ['rv', 'turtle', 'elephant', 'camel']) {
      for (let k = 0; k < 6; k++) {
        const b = rollFound(frame, 5 + k * 97, 3).build;
        expect([b.paint, b.paint2], `${frame} #${k}`).toEqual(FACTORY_PAINT[frame]);
      }
    }
    const seen = new Set<string>();
    for (let k = 0; k < 12; k++) {
      const b = rollFound('sedan', 5 + k * 97, 2).build;
      seen.add(`${b.paint}/${b.paint2}`);
    }
    expect(seen.size).toBeGreaterThan(6);
  });
});
