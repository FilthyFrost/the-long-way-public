/**
 * F6 (docs/V3/plan/finish.md §二 6: 汽车旅馆单列成一种地点): in a world of version 7 the motel is a sort of place of its
 * own — to the plan, to the junk about it, on its boxes' cards — while it stays a home to the dice (its ground, its
 * yard, where it stands). What the plan lays there is what a traveller leaves: medicines, tins and water, a pack, a
 * camera and its film, a tape, a key, a souvenir, a sheet; never what a household keeps — a stove and its pans, the
 * coffee machine, a flower pot, furniture. And its nightstands' drawers hold a small thing or two.
 * A world made before version 7 is the world it was: its motels are houses.
 * ROBOT_SEEDS=200 for the full count (the default: 6, to keep the suite quick).
 */
import { describe, expect, it } from 'vitest';
import '../../src/core/v3/nd/cards';
import.meta.glob('../../src/game/modcar/v3/*/index.ts', { eager: true });
import { hasItem, itemDef, itemMass, newItem, putInside } from '../../src/core/modcar/items';
import { kitPicked, type KitsState } from '../../src/core/modcar/kits';
import { insideFound, junkOf, LOOT_V6, LOOT_V7, PLACES_KEEP } from '../../src/core/modcar/loot';
import { fitToPlaces, OWN_SORTS, placeFinds, SitePlanner, takesSorts, type PlannedFind, type PlanPlace } from '../../src/core/modcar/schedule';
import type { Site } from '../../src/core/world/sites';
import { modcarWorld } from '../../src/game/modcar/seamless';
import { EVERY, travel7, type Journey7 } from './f6_journey';

const SEEDS = Array.from({ length: Number(process.env.ROBOT_SEEDS ?? 6) }, (_, k) => 1000 + k * 7919);
const KM = 300;

function sitesOf(seed: number, version: 6 | 7, km: number): Site[] {
  const out: Site[] = [];
  modcarWorld(seed, { worldVersion: version }).world.sites.between(0, km * 1000, out);
  return out;
}

let runs: Journey7[] | null = null;
const journeys = (): Journey7[] => (runs ??= SEEDS.map((seed) => travel7(seed, KM, EVERY)));

/** what the plan may lay at a motel, by its entry: what names it, and what names no sort of place */
const AT_A_MOTEL = /^(bandage|painkillers|stomach|water|food|pack|camera|bobble|bp\d+_\d+|bp8|moto_rack|fuel|torch\+|kit:(photo|music|treasure):\d+|ahead:(coat|water|fuel)|need:(fuel|food|water))$/;

describe('F6: the motel, a sort of place of its own', () => {
  it('a world of version 7: its motels are of the sort `motel` and still houses to the dice; every other place of its own kind — and in a world made before, every place', () => {
    let motels = 0;
    let before = 0;
    for (const seed of SEEDS.slice(0, 4)) {
      for (const site of sitesOf(seed, 7, 150)) {
        if (site.prefab === 'motel') {
          motels++;
          expect(site.sort, `seed ${seed}: ${site.id}`).toBe('motel');
          expect(site.kind).toBe('house');
        } else expect(site.sort, `seed ${seed}: ${site.id}`).toBe(site.kind);
      }
      for (const site of sitesOf(seed, 6, 150)) {
        if (site.prefab === 'motel') before++;
        expect(site.sort, `seed ${seed}, version 6: ${site.id}`).toBe(site.kind);
      }
    }
    expect(motels).toBeGreaterThan(0);
    expect(before, 'motels of version 6').toBeGreaterThan(0);
    expect([...OWN_SORTS]).toEqual(['motel']);
  });

  it('the plan keeps to it: what names its sorts is never laid at a motel it does not name, however long it has waited; what names the motel, or no sort, is', () => {
    const road: (PlanPlace & { id: string })[] = [
      { id: 'm', s: 40_100, kind: 'motel', boxes: 7 },
      { id: 'g', s: 41_500, kind: 'garage', boxes: 2 },
      { id: 'h', s: 43_000, kind: 'house', boxes: 3 },
    ];
    const laid = (f: PlannedFind): string | undefined => {
      const planner = new SitePlanner([f]);
      planner.take(road);
      const at = road.find((p) => planner.findsAt(p.id).length)?.id;
      // (laid all at once: the same place)
      const once = placeFinds([f], road);
      expect(once.size ? road[[...once.keys()][0]].id : undefined).toBe(at);
      return at;
    };
    // a stove, due a kilometre before the motel: no house within its 600 m — the motel is passed over, the workshop takes it
    const stove: PlannedFind = { entry: 'stove', thing: { item: 'kit_stove' }, s: 39_000, themes: ['house', 'camp', 'jetty'], novelty: true };
    expect(laid(stove)).toBe('g');
    // one that waits for no sort of place: still not the motel
    expect(laid({ ...stove, any: true })).toBe('g');
    // a medicine names the motel: there, at once
    expect(laid({ entry: 'painkillers', thing: { item: 'med_pain_2' }, s: 39_000, themes: ['house', 'shop', 'station', 'motel'], novelty: false })).toBe('m');
    // a can of petrol names no sort: there
    expect(laid({ entry: 'fuel', thing: { tool: 'jerrycan', litres: 1 }, s: 39_000, novelty: false })).toBe('m');
    // a chapter's new thing whose chapter has no box but a motel's stays where it was due (not fitted into the motel)
    const lone: PlanPlace[] = [{ s: 40_100, kind: 'motel', boxes: 7 }, { s: 52_000, kind: 'house', boxes: 3 }];
    const [fitted] = fitToPlaces([{ ...stove, s: 46_000, within: [30_000, 50_000] }], lone);
    expect(fitted.s).toBe(46_000);
    // … and the camera, which names the motel, is fitted to it
    const [cam] = fitToPlaces([{ entry: 'camera', thing: { item: 'nd_camera' }, s: 46_000, themes: ['house', 'lookout', 'lighthouse', 'motel'], novelty: true, within: [30_000, 50_000] }], lone);
    expect(cam.s).toBe(40_100 - 0.5);
    expect(takesSorts('motel', ['house'])).toBe(false);
    expect(takesSorts('motel', ['house', 'motel'])).toBe(true);
    expect(takesSorts('motel', undefined)).toBe(true);
    expect(takesSorts('garage', ['house'])).toBe(true);
  });

  it('a set\'s step is never put at a motel that is not of its sorts — the stove\'s gas goes on to the next place; a camera\'s film may be there', () => {
    const ahead = () => [{ s: 42_500, kind: 'motel' as const }, { s: 46_000, kind: 'garage' as const }];
    const st: KitsState = {};
    const [gas] = kitPicked(st, 'kit_stove', 40_000, 7, ahead);
    expect(gas.s).toBe(46_000 - 0.5);
    expect(gas.any).toBe(true);
    const [film] = kitPicked({}, 'nd_camera', 40_000, 7, ahead);
    expect(film.s).toBe(42_500 - 0.5);
    expect(film.themes).toContain('motel');
    expect(film.any).toBeUndefined();
  });

  it('down 300 km of worlds: what the plan lays at a motel is what a traveller leaves — never a stove, a pan, the coffee machine, a flower pot, furniture', () => {
    const seen = new Map<string, number>();
    let motels = 0;
    for (const j of journeys()) {
      for (const stop of j.stops) {
        if (stop.kind !== 'motel') continue;
        motels++;
        for (const e of stop.plan) {
          expect(e, `seed ${j.seed}: the motel at ${(stop.s / 1000).toFixed(1)} km`).toMatch(AT_A_MOTEL);
          seen.set(e.replace(/\d+_\d+$/, '').replace(/:\d+$/, ''), (seen.get(e.replace(/\d+_\d+$/, '').replace(/:\d+$/, '')) ?? 0) + 1);
        }
      }
    }
    console.info(`[F6 motel] ${SEEDS.length} worlds, ${KM} km: ${motels} motels (${(motels / SEEDS.length).toFixed(1)} a world); the plan's finds there: ${[...seen].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')}`);
    expect(motels).toBeGreaterThan(0);
    // (they are not passed over: medicines, something to eat or to drink turn up there)
    expect(['bandage', 'painkillers', 'stomach', 'food', 'water'].some((k) => seen.has(k))).toBe(true);
  });

  it('a nightstand\'s drawer: none, one or two small things by its seed, the same every time; a motel\'s only, from version 7 on', () => {
    const stand = itemDef('nd_nightstand').holds!;
    expect(stand).toMatchObject({ slots: 3, maxKg: 2.5, shut: true });
    const counts = [0, 0, 0];
    const kinds = new Map<string, number>();
    for (let seed = 1; seed <= 3000; seed++) {
      const found = insideFound('nd_nightstand', 'motel', seed, 60_000, LOOT_V7, 1)!;
      expect(found).toEqual(insideFound('nd_nightstand', 'motel', seed, 60_000, LOOT_V7, 1));
      expect(found.length).toBeLessThanOrEqual(2);
      counts[found.length]++;
      // (each goes into the drawer: its three slots, its two and a half kilograms)
      const box = newItem('nd_nightstand');
      for (const f of found) {
        expect('item' in f && hasItem(f.item), `seed ${seed}`).toBe(true);
        if (!('item' in f)) continue;
        kinds.set(f.item, (kinds.get(f.item) ?? 0) + 1);
        const inst = newItem(f.item);
        expect(itemMass(inst)).toBeLessThan(1.3);
        expect(putInside(box, inst, 0), `seed ${seed}: ${f.item}`).toBe(0);
      }
    }
    console.info(`[F6 motel] a nightstand's drawer over 3000: empty ${counts[0]}, one ${counts[1]}, two ${counts[2]}; ${[...kinds].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')}`);
    expect(counts[0] / 3000).toBeGreaterThan(0.25);
    expect(counts[0] / 3000).toBeLessThan(0.45);
    expect(counts[2]).toBeGreaterThan(300);
    for (const k of ['med_bandage', 'med_pain_2', 'nd_pills', 'nd_battery', 'nd_flashlight', 'nd_film_pack', 'nd_tape_01', 'nd_key_1', 'nd_compass', 'nd_chocolate_1']) expect(kinds.has(k), k).toBe(true);
    // kept back as a box's own: a set's piece before its main thing, a new thing before its first
    const held = (key: string): boolean => key === 'nd_film_pack' || key === 'nd_tape_01' || key === 'nd_key_1' || key === 'nd_flashlight';
    let less = 0;
    let all = 0;
    for (let seed = 1; seed <= 600; seed++) {
      const kept = insideFound('nd_nightstand', 'motel', seed, 60_000, LOOT_V7, 1, held)!;
      expect(kept.some((f) => 'item' in f && held(f.item))).toBe(false);
      // (what one lives on, mostly gone as from any box: the sweets)
      less += insideFound('nd_nightstand', 'motel', seed, 60_000, LOOT_V7, PLACES_KEEP)!.filter((f) => 'item' in f && itemDef(f.item).cat === 'food').length;
      all += insideFound('nd_nightstand', 'motel', seed, 60_000, LOOT_V7, 1)!.filter((f) => 'item' in f && itemDef(f.item).cat === 'food').length;
    }
    expect(less).toBeLessThan(all * 0.5);
    // a house's nightstand, any piece in a world made before, any other piece: nothing of its own inside
    expect(insideFound('nd_nightstand', 'house', 7, 60_000, LOOT_V7, 1)).toBeNull();
    expect(insideFound('nd_nightstand', 'motel', 7, 60_000, LOOT_V6, 1)).toBeNull();
    expect(insideFound('nd_cabinet', 'motel', 7, 60_000, LOOT_V7, 1)).toBeNull();
  });

  it('down 300 km: the drawers of the motels\' nightstands give a little — a medicine here, a battery there', () => {
    const got = new Map<string, number>();
    let motels = 0;
    for (const j of journeys()) {
      for (const stop of j.stops) {
        if (stop.kind !== 'motel') continue;
        motels++;
        for (const k of stop.inside) got.set(k, (got.get(k) ?? 0) + 1);
        // (eight rooms, a nightstand in most: never a hoard)
        expect(stop.inside.length, `seed ${j.seed}: the motel at ${(stop.s / 1000).toFixed(1)} km`).toBeLessThanOrEqual(16);
      }
      // (nothing inside any other place's furniture)
      for (const stop of j.stops) if (stop.kind !== 'motel') expect(stop.inside).toEqual([]);
    }
    const n = [...got.values()].reduce((a, b) => a + b, 0);
    console.info(`[F6 motel] in the nightstands of ${motels} motels: ${n} things (${(n / Math.max(1, motels)).toFixed(1)} a motel) — ${[...got].sort((a, b) => b[1] - a[1]).map(([k, c]) => `${k} ${c}`).join(', ')}`);
    expect(n).toBeGreaterThan(0);
  });

  it('the junk about a motel is its rooms\': pillows, a lamp, a clock radio — not a household\'s', () => {
    const junk = junkOf('motel');
    for (const k of ['junk_pillow', 'junk_lamp', 'junk_clockradio', 'junk_mug', 'junk_candle']) expect(junk).toContain(k);
    for (const k of junk) expect(hasItem(k), k).toBe(true);
    // (what the systems add to a house's junk — a coffee pot, ground coffee — is not added to it)
    expect(junk.some((k) => !k.startsWith('junk_'))).toBe(false);
    expect(junkOf('house')).not.toEqual(junk);
  });
});
