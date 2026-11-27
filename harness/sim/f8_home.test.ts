/**
 * F8 (docs/V3/plan/finish.md §十一 1), the rooms on wheels in numbers:
 *   - one walks about in the Tadpole's box and the Snail's, by their rear doors and no way from a seat; each living
 *     space has its room — a box from wall to wall holding every place one walks in — under its roof;
 *   - headroom 1.9 m at the least, the doorways 0.8 × 1.9 m at the least (the Turtle's sliding door, a small van's, as it was);
 *     the Whale, the Old Elephant and the Turtle walked on wall to wall, empty shells since §十九 step 7;
 *   - a save written before a vehicle's inside was made anew: what rode in it has its place there taken from it, to be put
 *     in again (SavedVehicle.room under the frame's roomRev); a part on a mount the frame has no more — the Whale's rear
 *     bench, its dinette's bench — is taken off the build and rides in it as a thing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ABOARD, aboardOf, roomOf, roomRev } from '../../src/core/modcar/aboard';
import { newInstance, stockBuild } from '../../src/core/modcar/build';
import { zonesOf } from '../../src/core/modcar/cargo';
import { frameDef } from '../../src/core/modcar/frames';
import { rollFound } from '../../src/core/modcar/wrecks';
import { loadSave, type SaveV1 } from '../../src/game/modcar/save';

const KEY = 'modcar.save.v1';

describe('F8: rooms on wheels', () => {
  it('the Tadpole and the Snail are walked into by their rear doors; no way into them from a seat; found in any colours still', () => {
    for (const id of ['trailer', 'snail']) {
      const a = aboardOf(id)!;
      expect(a, id).toBeTruthy();
      expect(a.aft, id).toBeUndefined();
      expect(a.doors).toHaveLength(1);
      expect(a.doors[0].mount).toBe('trunk');
      expect(a.headroom).toBeGreaterThanOrEqual(1.9);
      // (in by the back: the doorway behind the floor, one faces forward coming in)
      expect(a.doors[0].outside[0]).toBeLessThan(a.doors[0].inside[0]);
      expect(a.doors[0].inYaw).toBe(0);
      // (a room one can turn round in: three and a half square metres of floor to walk on at the least)
      expect(a.areas.reduce((s, r) => s + (r.x1 - r.x0) * (r.z1 - r.z0), 0)).toBeGreaterThan(3.5);
    }
    // (the Tadpole's box: 3.0 × 1.7 m, 1.9 m clear under its lining)
    const t = frameDef('trailer');
    expect(t.body.front - t.body.rear).toBeCloseTo(3.08, 1);
    expect(t.body.halfWidth * 2).toBeCloseTo(1.74, 1);
    // (… and things stand in it up to the rail along its walls, 1.63 m over the floor: a bookshelf, a fridge)
    const box = zonesOf('trailer').find((z) => z.id === 'cabin')!;
    expect(box.top - box.floor).toBeGreaterThan(1.6);
    // (its place for things is its walls' own rectangle, whole tenths of a metre: 3.0 by 1.7)
    expect(box.walls).toBe(true);
    expect(box.x[1] - box.x[0]).toBeCloseTo(3.0, 6);
    expect(box.z[1] - box.z[0]).toBeCloseTo(1.7, 6);
    const sn = zonesOf('snail').find((z) => z.id === 'cabin')!;
    expect(sn.walls).toBe(true);
    expect(sn.x[1] - sn.x[0]).toBeCloseTo(3.02, 6);
    expect(sn.z[1] - sn.z[0]).toBeCloseTo(1.8, 6);
    expect(zonesOf('trailer').some((z) => z.wall)).toBe(true);
    expect(zonesOf('snail').some((z) => z.wall)).toBe(true);
    // (the motorhomes are found in their own colours — a box van and a trailer in any, as ever: over many, more than one)
    const paints = new Set<number>();
    for (let seed = 1; seed <= 12; seed++) paints.add(rollFound('snail', seed, 2).build.paint);
    expect(paints.size).toBeGreaterThan(2);
    const own = new Set<number>();
    for (let seed = 1; seed <= 12; seed++) own.add(rollFound('elephant', seed, 2).build.paint);
    expect(own.size).toBe(1);
  });

  it('every living space has its room, a box under its roof that holds every place one walks in; its doorways let her through', () => {
    for (const id of Object.keys(ABOARD)) {
      const a = aboardOf(id)!;
      const f = frameDef(id);
      const room = roomOf(id)!;
      expect(room, id).toBeTruthy();
      for (const r of a.areas) {
        expect(r.x0, `${id} ${r.name}`).toBeGreaterThanOrEqual(room.lo[0]);
        expect(r.x1, `${id} ${r.name}`).toBeLessThanOrEqual(room.hi[0]);
        expect(r.z0, `${id} ${r.name}`).toBeGreaterThanOrEqual(room.lo[2]);
        expect(r.z1, `${id} ${r.name}`).toBeLessThanOrEqual(room.hi[2]);
        expect(r.floor).toBeGreaterThan(room.lo[1]);
      }
      // (about the body's width — it reaches a little past the walls' inner faces, as the place for things hung on them
      // does; over its floor to over one's head)
      expect(Math.max(Math.abs(room.lo[2]), Math.abs(room.hi[2])), id).toBeLessThanOrEqual(f.body.halfWidth + 0.06);
      expect(room.hi[1] - room.lo[1], id).toBeGreaterThan(1.9);
      expect(a.headroom, id).toBeGreaterThanOrEqual(1.9);
      for (const d of a.doors) {
        // (its width along the wall it is in: a side door's along the vehicle, a rear door's across it)
        const sideDoor = Math.abs(d.outside[1] - d.inside[1]) > Math.abs(d.outside[0] - d.inside[0]);
        const across = sideDoor ? d.box.hi[0] - d.box.lo[0] : d.box.hi[2] - d.box.lo[2];
        // (0.8 m at the least — the Camel's, a school bus's own 0.74, is as it was; she is 1.63 m: through any of them
        // without stooping but the Turtle's low sliding door, a small van's own)
        expect(across, `${id}: a doorway's width`).toBeGreaterThanOrEqual(id === 'camel' ? 0.74 : 0.8 - 1e-9);
        expect(d.box.hi[1] - d.box.lo[1], `${id}: a doorway's height`).toBeGreaterThanOrEqual(id === 'turtle' ? 1.2 : 1.65);
      }
    }
    // (the three that had their furniture built in walked on wall to wall since they were emptied — docs/V3/plan/finish.md
    // §十九 step 7 — where an aisle 0.76–0.86 m wide, then 1.1, ran between it)
    for (const id of ['rv', 'elephant', 'turtle']) {
      const a = aboardOf(id)!;
      expect(Math.max(...a.areas.map((r) => r.z1)) - Math.min(...a.areas.map((r) => r.z0)), id).toBeGreaterThan(1.9);
    }
    // (the Whale: no bench at its back, no dinette's bench — its seats the cab's two; its bunk over the cab its one bed;
    // the Turtle and the Old Elephant none)
    expect(frameDef('rv').mounts.some((m) => m.id === 'seat_rear' || m.id === 'seat_dinette')).toBe(false);
    expect(frameDef('rv').mounts.filter((m) => m.cat === 'seat').map((m) => m.id).sort()).toEqual(['seat_driver', 'seat_pass']);
    expect(aboardOf('rv')!.beds).toHaveLength(1);
    expect(aboardOf('turtle')!.beds ?? []).toHaveLength(0);
    expect(aboardOf('elephant')!.beds ?? []).toHaveLength(0);
  });
});

describe('F8: a save from before a vehicle was made anew inside', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('the frames made anew inside say so; the rest are as they were first made', () => {
    // (the Whale and the Old Elephant three times: opened up, then lengthened with the Camel and the Turtle — docs/V3/
    // plan/finish.md §18 — then emptied with the Turtle, §十九 step 7)
    for (const id of ['rv', 'elephant', 'turtle']) expect(roomRev(id), id).toBe(3);
    expect(roomRev('camel')).toBe(2);
    for (const id of ['trailer', 'snail']) expect(roomRev(id), id).toBe(1);
    for (const id of ['sedan', 'pickup', 'van', 'moto']) expect(roomRev(id), id).toBe(0);
  });

  it('a part on a mount the frame has no more — the Whale’s rear bench, its dinette’s bench — is taken off its build and rides in it, with no place: to be put in anew', () => {
    const whale = stockBuild('rv', { fuel: 0.5 });
    // (as a save of before has it: a bench at the back; and, as every save of before the living spaces were emptied, the
    // dinette's bench on its mount)
    const bench = newInstance('seat_bench');
    (whale.parts as Record<string, unknown>).seat_rear = bench;
    const dinette = newInstance('seat_bench');
    (whale.parts as Record<string, unknown>).seat_dinette = dinette;
    const kept = stockBuild('rv', { fuel: 0.2 });
    const bench2 = newInstance('seat_bench');
    (kept.parts as Record<string, unknown>).seat_rear = bench2;
    const s: SaveV1 = {
      v: 1,
      at: 1_794_000_000_000,
      place: 'garage',
      hour: 12,
      done: [],
      vehicles: [
        { build: stockBuild('sedan', { fuel: 0.3 }), x: 0, z: 0, yaw: 0 },
        { build: whale, x: 9, z: 3, yaw: 0 },
      ],
      loose: [],
      player: { x: -4, z: 0, heading: 0 },
      hands: [null, null],
      sel: 0,
      stock: { scrap: 0, components: 0 },
      wrecks: { kept: { w1: { build: kept, x: 100, z: 5, yaw: 0, loose: [] } }, gone: [] },
    } as unknown as SaveV1;
    store.set(KEY, JSON.stringify(s));
    const back = loadSave()!;
    expect(back).toBeTruthy();
    expect(back.vehicles[1].build.parts.seat_rear).toBeUndefined();
    expect((back.vehicles[1].build.parts as Record<string, unknown>).seat_dinette).toBeUndefined();
    for (const uid of [bench.uid, dinette.uid]) {
      const rider = back.loose.find((l) => l.part?.uid === uid)!;
      expect(rider).toBeTruthy();
      expect(rider.on).toBe(1);
      expect(rider.pos).toBeUndefined();
    }
    // (a save of before says nothing of the room: under the Whale's, 1)
    expect(back.vehicles[1].room ?? 0).toBeLessThan(roomRev('rv'));
    // (… and a wreck kept as it was left the same)
    const w = back.wrecks!.kept.w1;
    expect(w.build.parts.seat_rear).toBeUndefined();
    expect(w.loose.some((l) => l.part?.uid === bench2.uid && l.pos === undefined)).toBe(true);
    // (every other part where it was)
    expect(Object.keys(back.vehicles[1].build.parts).length).toBe(Object.keys(stockBuild('rv').parts).length);
  });
});
