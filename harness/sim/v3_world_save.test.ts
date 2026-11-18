/**
 * A save and the world it was made in (src/game/modcar/save.ts SavedWorld, worldSave.ts; docs/V3/nodes/
 * W1-worldgen.md step W1.3), through the game's real save functions with the browser's storage stood in for
 * by a map: which world the game's own factory makes (seamless.ts), what a save of each version says of its
 * world, that a save of a world this build cannot make is set aside with a line saying why, and what is done
 * with a version 2 save written under another revision of the generator — its vehicles back on the road at
 * the arc length they had reached, the walker with them, what lay about down on the land or beside the road,
 * the places' and the wrecks' memory kept only where the place is still the place it was.
 *
 * "Another revision" is played here by a world of another seed: the save's positions were taken on its road
 * and mean nothing on the road of the world the save is read into, which is all a revision does to a save.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newInstance, stockBuild } from '../../src/core/modcar/build';
import { frameDef } from '../../src/core/modcar/frames';
import { newItem } from '../../src/core/modcar/items';
import { newTool } from '../../src/core/modcar/tools';
import { BIOMES } from '../../src/core/world/biomes';
import { RULES_V1, WORLD_REV } from '../../src/core/world/rules';
import type { Site } from '../../src/core/world/sites';
import { pushOut, Push } from '../../src/core/world/solids';
import { SpineSample } from '../../src/core/world/spine';
import { TerrainPoint, type World } from '../../src/core/world/terrain';
import { loadRefusal, loadSave, worldOfSave, writeSave, type SaveV1 } from '../../src/game/modcar/save';
import { modcarWorld, modcarWorldOptions } from '../../src/game/modcar/seamless';
import { rehome, savedWorldOf, stampWorld, WORLD_CHANGED, worldMoved } from '../../src/game/modcar/worldSave';

const KEY = 'modcar.save.v1';
const SEED = 4711;

/** the world the save is read into: the game's own, version 2, as this build makes it */
const now = modcarWorld(SEED, { worldVersion: 2 }).world;
/** the world the save was written in, "under another revision": another road through other land */
const then = modcarWorld(SEED + 1, { worldVersion: 2 }).world;

const tp = new TerrainPoint();
const st = new SpineSample();

/** a place in a world's lane at arc length s, as a vehicle saved there has it */
function inLane(w: World, s: number, d = 1.6): { x: number; z: number; yaw: number; s: number } {
  w.spine.at(s, st);
  return { x: st.x - Math.sin(st.phi) * d, z: st.z + Math.cos(st.phi) * d, yaw: -st.phi, s };
}

/** where a point lies by a world's road: its arc length, how far off the centre line, the land there */
function byRoad(w: World, x: number, z: number): { s: number; d: number; h: number; wl: number; zone: number } {
  w.shape(x, z, tp);
  return { s: tp.s, d: tp.d, h: tp.h, wl: tp.wl, zone: tp.zone };
}

/** a game of a version 2 world as the game writes it: the car down the road with the walker by it, the pickup in the yard */
function roadSave(more: Partial<SaveV1> = {}): SaveV1 {
  const car = inLane(then, 12_345);
  return {
    v: 1,
    at: 1_794_000_000_000,
    place: 'road',
    hour: 14.25,
    done: [],
    vehicles: [
      { build: stockBuild('sedan', { fuel: 0.3 }), x: car.x, z: car.z, yaw: car.yaw, s: car.s },
      { build: stockBuild('pickup', { fuel: 0.1 }), x: 9, z: 3, yaw: 0.4 },
    ],
    loose: [],
    player: { x: car.x + 2, z: car.z + 2, heading: 1, s: car.s },
    hands: [null, null],
    sel: 0,
    world: { seed: SEED, version: 2, regionCount: BIOMES.length, rev: WORLD_REV - 1 },
    ...more,
  };
}

/** the places of a world along its first kilometres */
function sitesOf(w: World, to = 30_000): Site[] {
  const out: Site[] = [];
  w.sites.between(0, to, out);
  return out;
}

describe('which world the game makes', () => {
  it('the factory makes a world of version 1 unless it is asked for another, and hands on the region count', () => {
    expect(modcarWorld(7, {}).world.rules).toBe(RULES_V1);
    expect(modcarWorldOptions({}).worldVersion).toBeUndefined();
    const two = modcarWorld(7, { worldVersion: 2 }).world;
    expect(two.rules.version).toBe(2);
    expect(two.rules.regionCount).toBe(BIOMES.length);
    const six = modcarWorld(7, { worldVersion: 2, regionCount: 6 }).world;
    expect(six.rules.version).toBe(2);
    expect(six.rules.regionCount).toBe(6);
    // (the proving ground behind the workshop is cut out of the same world: one version, one count, for both makes)
    expect(modcarWorld(7, { worldVersion: 2, regionCount: 6 }).level).toBe(modcarWorld(7, { worldVersion: 2, regionCount: 6 }).level);
  });

  it('a save of a version 1 world names its seed alone, as saves always did; one of version 2 its version, count and revision', () => {
    expect(savedWorldOf(modcarWorld(7, {}).world, 7)).toEqual({ seed: 7 });
    expect(savedWorldOf(now, SEED)).toEqual({ seed: SEED, version: 2, regionCount: BIOMES.length, rev: WORLD_REV });
    expect(savedWorldOf(modcarWorld(7, { worldVersion: 2, regionCount: 6 }).world, 7)).toEqual({ seed: 7, version: 2, regionCount: 6, rev: WORLD_REV });
    // (a version 1 world asked to know fewer regions than its six says so)
    expect(savedWorldOf(modcarWorld(7, { regionCount: 4 }).world, 7)).toEqual({ seed: 7, regionCount: 4 });
  });
});

describe('a save and its world, through save.ts', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('a save from before there were versions is of version 1 and never counts as moved', () => {
    const s = roadSave({ world: { seed: SEED } });
    writeSave(s);
    const back = loadSave()!;
    expect(back.world).toEqual({ seed: SEED });
    expect(worldOfSave(back)?.version ?? 1).toBe(1);
    expect(worldMoved(back)).toBe(false);
    // (nor does a revision written into a version 1 save by mistake make it one that moves)
    expect(worldMoved(roadSave({ world: { seed: SEED, rev: 99 } }))).toBe(false);
    expect(worldMoved(roadSave({ world: undefined, road: { seed: SEED, s: 400 } }))).toBe(false);
    expect(loadRefusal()).toBeNull();
  });

  it('a version 2 save of this revision is gone on with as it is; of another revision, or of none, it has moved', () => {
    const same = roadSave({ world: { seed: SEED, version: 2, regionCount: BIOMES.length, rev: WORLD_REV } });
    writeSave(same);
    const back = loadSave()!;
    expect(back.world).toEqual({ seed: SEED, version: 2, regionCount: BIOMES.length, rev: WORLD_REV });
    expect(worldMoved(back)).toBe(false);
    expect(worldMoved(roadSave())).toBe(true);
    expect(worldMoved(roadSave({ world: { seed: SEED, version: 2, regionCount: BIOMES.length, rev: WORLD_REV + 1 } }))).toBe(true);
    expect(worldMoved(roadSave({ world: { seed: SEED, version: 2, regionCount: BIOMES.length } }))).toBe(true);
    // (the road form of a save says the same of its world)
    expect(worldMoved(roadSave({ world: undefined, road: { seed: SEED, version: 2, regionCount: BIOMES.length, rev: WORLD_REV - 1, s: 400 } }))).toBe(true);
  });

  it('a save of a world with more regions than this build has is set aside, and the line says why', () => {
    const s = roadSave({ world: { seed: SEED, version: 2, regionCount: BIOMES.length + 3, rev: WORLD_REV } });
    writeSave(s);
    const text = store.get(KEY)!;
    expect(loadSave()).toBeNull();
    // (set aside as a save with a vehicle this build does not know is: not deleted, a later build may read it)
    expect(store.has(KEY)).toBe(false);
    expect(store.get(`${KEY}.unread`)).toBe(text);
    const why = loadRefusal()!;
    expect(why.zh).toContain(String(BIOMES.length + 3));
    expect(why.zh).toContain(String(BIOMES.length));
    expect(why.en).toContain(`${BIOMES.length + 3} regions`);
    // the next load that reads has nothing to say
    writeSave(roadSave({ world: { seed: SEED, version: 2, regionCount: BIOMES.length, rev: WORLD_REV } }));
    expect(loadSave()).not.toBeNull();
    expect(loadRefusal()).toBeNull();
  });

  it('so is a save of a version of the generator this build does not have, and one with a count that is no count', () => {
    writeSave(roadSave({ world: { seed: SEED, version: 3 as never, regionCount: 6, rev: 1 } }));
    expect(loadSave()).toBeNull();
    expect(loadRefusal()!.en).toContain('version 3');
    expect(loadRefusal()!.zh).toContain('第 3 版');
    writeSave(roadSave({ world: { seed: SEED, version: 2, regionCount: 2.5, rev: 1 } }));
    expect(loadSave()).toBeNull();
    expect(loadRefusal()).not.toBeNull();
    // a save that is no save at all is set aside without words, as before
    store.set(KEY, '{"v":1}');
    expect(loadSave()).toBeNull();
    expect(loadRefusal()).toBeNull();
  });

  it('a moved save goes through the real load, is made fit, written again and is then of this revision', () => {
    const s = roadSave({ loose: [{ item: newItem('drink_water'), x: 2, y: 0.9, z: -4, yaw: 0 }] });
    writeSave(s);
    const back = loadSave()!;
    expect(worldMoved(back)).toBe(true);
    const done = rehome(back, now);
    expect(done.vehicles).toBe(1);
    expect(worldMoved(back)).toBe(false);
    writeSave(back);
    const again = loadSave()!;
    expect(again.world?.rev).toBe(WORLD_REV);
    expect(worldMoved(again)).toBe(false);
    expect(again.vehicles[0].s).toBe(12_345);
    expect(again.loose).toHaveLength(1);
  });
});

describe('what a version 2 save keeps for a later revision (stampWorld)', () => {
  it('how far along the road every vehicle, the walker and every thing lying about beyond the plots is', () => {
    const car = inLane(now, 8_000);
    const s = roadSave({
      world: savedWorldOf(now, SEED),
      vehicles: [
        { build: stockBuild('sedan'), x: car.x, z: car.z, yaw: car.yaw },
        { build: stockBuild('pickup'), x: 9, z: 3, yaw: 0.4 },
      ],
      player: { x: car.x + 3, z: car.z - 2, heading: 0 },
      loose: [
        { part: newInstance('bat_std'), x: car.x + 6, y: 0, z: car.z + 1, yaw: 0 },
        { tool: newTool('bottle'), x: 1, y: 0.9, z: 2, yaw: 0 },
        { item: newItem('drink_water'), x: 0, y: 0, z: 0, yaw: 0, on: 0, pos: [0, 0.5, 0], rot: [0, 0, 0, 1] },
      ],
    });
    stampWorld(s, now);
    expect(s.vehicles[0].s).toBeCloseTo(8_000, 1);
    expect(s.player.s).toBeCloseTo(byRoad(now, car.x + 3, car.z - 2).s, 1);
    expect(s.loose[0].s).toBeCloseTo(byRoad(now, car.x + 6, car.z + 1).s, 1);
    // in the yard, and riding: nothing to keep
    expect('s' in s.vehicles[1]).toBe(false);
    expect('s' in s.loose[1]).toBe(false);
    expect('s' in s.loose[2]).toBe(false);
  });

  it('the kind of every place something is remembered of, by the place', () => {
    const sites = sitesOf(now).filter((x) => x.kind !== 'roadside');
    const withBox = sites.find((x) => x.containers.length > 0)!;
    const withWreck = sites.find((x) => x.objects.some((o) => o.kind === 'wreck'))!;
    const wi = withWreck.objects.findIndex((o) => o.kind === 'wreck');
    const s = roadSave({
      world: savedWorldOf(now, SEED),
      places: { searched: [withBox.containers[0].id], left: {}, pumps: {}, taken: [], doors: { [`${withBox.id}/b0/d0`]: 1 } },
      wrecks: { kept: {}, gone: [`${withWreck.id}/w${wi}`, 'site999999p/w0', 'nonsense'] },
    });
    stampWorld(s, now);
    expect(s.world!.sites).toEqual({ [withBox.id]: withBox.kind, [withWreck.id]: withWreck.kind });
    // a place further down the road than this session has laid any out: nothing is laid out for it, and it
    // keeps the kind the save the game was loaded from had for it
    const laid = (k: number): boolean => now.sites.ready(k);
    expect(laid(4000)).toBe(false);
    s.wrecks!.gone.push('site4000p/w2');
    stampWorld(s, now, { site4000p: 'camp', [withBox.id]: 'not what it is now' });
    expect(laid(4000)).toBe(false);
    expect(s.world!.sites).toEqual({ [withBox.id]: withBox.kind, [withWreck.id]: withWreck.kind, site4000p: 'camp' });
  });

  it('a save of a version 1 world is left exactly as it is', () => {
    const one = modcarWorld(SEED, {}).world;
    const car = inLane(one, 8_000);
    const s = roadSave({ world: savedWorldOf(one, SEED), vehicles: [{ build: stockBuild('sedan'), x: car.x, z: car.z, yaw: car.yaw }], player: { x: car.x, z: car.z + 3, heading: 0 } });
    const before = JSON.stringify(s);
    stampWorld(s, one);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('a version 2 save of another revision, made fit for the world as it is now (rehome)', () => {
  it('the car stands on the road at the arc length it had reached, in the lane, facing down the road', () => {
    const s = roadSave();
    const done = rehome(s, now);
    const car = s.vehicles[0];
    const at = byRoad(now, car.x, car.z);
    expect(at.s).toBeCloseTo(12_345, 1);
    expect(at.d).toBeCloseTo(1.6, 2);
    // (on the paved road)
    expect(at.zone).toBe(1);
    now.spine.at(12_345, st);
    expect(car.yaw).toBeCloseTo(-st.phi, 6);
    expect(car.s).toBe(12_345);
    expect(done.vehicles).toBe(1);
    expect(s.world!.rev).toBe(WORLD_REV);
  });

  it('what stands in the yard stays where it stands', () => {
    const s = roadSave({ loose: [{ part: newInstance('bat_std'), x: 1, y: 0.92, z: 2, yaw: 0.5 }] });
    const pickup = { ...s.vehicles[1] };
    rehome(s, now);
    expect(s.vehicles[1]).toEqual(pickup);
    expect(s.loose[0]).toMatchObject({ x: 1, y: 0.92, z: 2, yaw: 0.5 });
  });

  it('a vehicle saved without its arc length goes to the road point nearest to where it stood', () => {
    const s = roadSave();
    delete s.vehicles[0].s;
    const was = { x: s.vehicles[0].x, z: s.vehicles[0].z };
    const nearest = byRoad(now, was.x, was.z).s;
    rehome(s, now);
    expect(byRoad(now, s.vehicles[0].x, s.vehicles[0].z).s).toBeCloseTo(Math.max(6, nearest), 1);
    expect(byRoad(now, s.vehicles[0].x, s.vehicles[0].z).d).toBeCloseTo(1.6, 2);
  });

  it('the walker on foot is beside the vehicle they were nearest to, off its flank, looking down the road', () => {
    const s = roadSave();
    const done = rehome(s, now);
    expect(done.walker).toBe('vehicle');
    const p = byRoad(now, s.player.x, s.player.z);
    const half = frameDef('sedan').body.halfWidth;
    expect(p.s).toBeCloseTo(12_345, 1);
    expect(p.d).toBeCloseTo(1.6 + half + 1.3, 2);
    now.spine.at(12_345, st);
    expect(s.player.heading).toBeCloseTo(st.phi, 6);
  });

  it('the walker in the seat is put by the vehicle they sit in, wherever they were saved', () => {
    const far = inLane(then, 2_000);
    const s = roadSave({ seat: 0, player: { x: far.x, z: far.z, heading: 0, s: 2_000 } });
    expect(rehome(s, now).walker).toBe('vehicle');
    expect(byRoad(now, s.player.x, s.player.z).s).toBeCloseTo(12_345, 1);
  });

  it('the walker far from any vehicle stands on the verge at their own arc length; the walker in the yard stays', () => {
    const far = inLane(then, 20_000, 30);
    const s = roadSave({ player: { x: far.x, z: far.z, heading: 0, s: 20_000 } });
    expect(rehome(s, now).walker).toBe('verge');
    const p = byRoad(now, s.player.x, s.player.z);
    expect(p.d).toBeCloseTo(5.2, 1);
    expect(p.s).toBeGreaterThanOrEqual(20_000 - 0.1);
    expect(p.s).toBeLessThan(20_000 + 80 * 12);
    expect(p.wl).toBeLessThanOrEqual(p.h + 0.02);
    const home = roadSave({ player: { x: -4.6, z: -0.4, heading: 0.15 } });
    expect(rehome(home, now).walker).toBe('kept');
    expect(home.player).toEqual({ x: -4.6, z: -0.4, heading: 0.15 });
  });

  it('two vehicles that stood close together stand one behind the other, the one driven where it was', () => {
    const a = inLane(then, 9_000);
    const b = inLane(then, 9_003);
    const c = inLane(then, 8_999);
    const s = roadSave({
      vehicles: [
        { build: stockBuild('sedan'), ...a },
        { build: stockBuild('rv'), ...b },
        { build: stockBuild('pickup'), ...c },
      ],
      seat: 0,
    });
    expect(rehome(s, now).vehicles).toBe(3);
    const at = s.vehicles.map((v) => byRoad(now, v.x, v.z).s);
    expect(at[0]).toBeCloseTo(9_000, 1);
    const body = (i: number): { front: number; rear: number } => frameDef(s.vehicles[i].build.frame).body;
    // the motorhome ahead of the car, the pickup behind it, two metres between each two
    expect(at[1] + body(1).rear - (at[0] + body(0).front)).toBeGreaterThanOrEqual(2 - 0.01);
    expect(at[0] + body(0).rear - (at[2] + body(2).front)).toBeGreaterThanOrEqual(2 - 0.01);
    for (const v of s.vehicles) expect(byRoad(now, v.x, v.z).d).toBeCloseTo(1.6, 2);
  });

  it('a thing lying about keeps its place on the plan and takes its height from the land; one riding goes with its vehicle', () => {
    const lay = inLane(then, 12_350, 3);
    const s = roadSave({
      loose: [
        { part: newInstance('bat_std'), x: lay.x, y: 512, z: lay.z, yaw: 0.3, s: 12_350 },
        { item: newItem('drink_water'), x: 0, y: 0, z: 0, yaw: 0, on: 0, pos: [0, 0.5, 0], rot: [0, 0, 0, 1], zone: 'trunk' },
      ],
    });
    // (this spot of the plan is dry open land in the world as it is now: the test's own premise)
    const land = byRoad(now, lay.x, lay.z);
    expect(land.wl).toBeLessThanOrEqual(land.h + 0.02);
    const done = rehome(s, now);
    expect(done.dropped).toBe(1);
    expect(done.roadside).toBe(0);
    expect(s.loose[0]).toMatchObject({ x: lay.x, z: lay.z, yaw: 0.3 });
    expect(s.loose[0].y).toBeCloseTo(land.h, 6);
    expect(s.loose[0].s).toBeCloseTo(land.s, 1);
    expect(s.loose[1]).toEqual({ item: s.loose[1].item, x: 0, y: 0, z: 0, yaw: 0, on: 0, pos: [0, 0.5, 0], rot: [0, 0, 0, 1], zone: 'trunk' });
  });

  it('a thing that would lie in water, or inside what stands at a place, is put beside the road at its arc length', () => {
    // a lake of the world as it is now, open water: its middle
    let lake: { cx: number; cz: number; s: number } | null = null;
    for (let k = 1; k < 80 && !lake; k++) {
      const f = now.water.feature(k);
      if (f && f.kind === 'lake' && f.frozen < 0.5) lake = f;
    }
    expect(lake).not.toBeNull();
    const wet = byRoad(now, lake!.cx, lake!.cz);
    expect(wet.wl).toBeGreaterThan(wet.h + 0.02);
    // and something solid that is no floor at a place: its middle
    const push = new Push();
    const solid = sitesOf(now)
      .flatMap((x) => x.solids)
      .find((sd) => !sd.floor && !sd.round && sd.hx > 0.4 && sd.hz > 0.4 && pushOut(sd, sd.x, sd.z, 0.1, push))!;
    expect(solid).toBeDefined();
    const s = roadSave({
      loose: [
        { part: newInstance('bat_std'), x: lake!.cx, y: 3, z: lake!.cz, yaw: 0, s: 7_000 },
        { tool: newTool('bottle'), x: lake!.cx + 1, y: 3, z: lake!.cz, yaw: 0, s: 7_000 },
        { item: newItem('drink_water'), x: solid.x, y: 3, z: solid.z, yaw: 0, s: 15_000 },
      ],
    });
    const done = rehome(s, now);
    expect(done.roadside).toBe(3);
    expect(done.dropped).toBe(0);
    const at = s.loose.map((l) => ({ ...byRoad(now, l.x, l.z), y: l.y }));
    for (const [i, want] of [7_000, 7_000, 15_000].entries()) {
      // beside the road, off the paved surface, dry, on the land; at its arc length or the next dry place after it
      expect(at[i].s).toBeGreaterThanOrEqual(want - 0.1);
      expect(at[i].s).toBeLessThan(want + 80 * 12);
      expect(at[i].d).toBeGreaterThan(4.5);
      expect(at[i].d).toBeLessThan(8);
      expect(at[i].wl).toBeLessThanOrEqual(at[i].h + 0.02);
      expect(at[i].y).toBeCloseTo(at[i].h, 6);
    }
    // (two from one spot do not lie in one heap)
    expect(Math.hypot(s.loose[0].x - s.loose[1].x, s.loose[0].z - s.loose[1].z)).toBeGreaterThan(0.5);
  });

  it('what was remembered of a place is kept where the place is still of its kind, and forgotten otherwise', () => {
    const sites = sitesOf(now).filter((x) => x.kind !== 'roadside');
    const house = sites.find((x) => x.containers.length >= 2)!;
    const other = sites.find((x) => x !== house && x.containers.length >= 1)!;
    const station = sites.find((x) => x.fuel.length > 0)!;
    const lying = sites.find((x) => x.loose.length > 0)!;
    expect(house && other && station && lying).toBeTruthy();
    const [c0, c1] = house.containers;
    const s = roadSave({
      world: {
        seed: SEED,
        version: 2,
        regionCount: BIOMES.length,
        rev: WORLD_REV - 1,
        // `other` was another kind of place under the last revision; the rest are what they were
        sites: { [house.id]: house.kind, [other.id]: other.kind === 'house' ? 'shop' : 'house', [station.id]: station.kind, [lying.id]: lying.kind, site999999p: 'house' },
      },
      places: {
        searched: [c0.id, c1.id, `${house.id}/c99`, other.containers[0].id, 'site999999p/c0'],
        left: { [c1.id]: [{ item: newItem('drink_water') }], [other.containers[0].id]: [{ item: newItem('drink_soda') }] },
        pumps: { [station.fuel[0].id]: { petrol: 11, diesel: 7 }, [`${other.id}/f0`]: { petrol: 1, diesel: 1 } },
        taken: [lying.loose[0].id, `${lying.id}/l999`, `${other.id}/l0`],
        shops: { [house.id]: { gen: 1 } as never, [other.id]: { gen: 2 } as never },
        doors: { [`${house.id}/b0/d0`]: 1, [`${other.id}/b0/d0`]: 1 },
      },
    });
    const done = rehome(s, now);
    const pl = s.places!;
    expect(pl.searched).toEqual([c0.id, c1.id]);
    expect(Object.keys(pl.left)).toEqual([c1.id]);
    expect(pl.pumps).toEqual({ [station.fuel[0].id]: { petrol: 11, diesel: 7 } });
    expect(pl.taken).toEqual([lying.loose[0].id]);
    expect(Object.keys(pl.shops!)).toEqual([house.id]);
    expect(pl.doors).toEqual({ [`${house.id}/b0/d0`]: 1 });
    expect(done.forgotten).toBe(3 + 1 + 1 + 2 + 1 + 1);
  });

  it('a save that kept no kinds of its places forgets them all', () => {
    const site = sitesOf(now).find((x) => x.kind !== 'roadside' && x.containers.length > 0)!;
    const s = roadSave({ places: { searched: [site.containers[0].id], left: {}, pumps: {}, taken: [] } });
    rehome(s, now);
    expect(s.places!.searched).toEqual([]);
  });

  it('a kept wreck lies where the world has it now; one whose place is gone, or is no wreck there, is forgotten', () => {
    const sites = sitesOf(now).filter((x) => x.objects.some((o) => o.kind === 'wreck'));
    expect(sites.length).toBeGreaterThanOrEqual(2);
    const [a, b] = sites;
    const ai = a.objects.findIndex((o) => o.kind === 'wreck');
    const bi = b.objects.findIndex((o) => o.kind === 'wreck');
    const notWreck = a.objects.findIndex((o) => o.kind !== 'wreck');
    const kept = (): { build: ReturnType<typeof stockBuild>; x: number; z: number; yaw: number; loose: [] } => ({ build: stockBuild('sedan'), x: 123, z: 456, yaw: 1, loose: [] });
    const s = roadSave({
      world: { seed: SEED, version: 2, regionCount: BIOMES.length, rev: WORLD_REV - 1, sites: { [a.id]: a.kind, [b.id]: 'elsewhere' } },
      wrecks: {
        kept: { [`${a.id}/w${ai}`]: kept(), [`${b.id}/w${bi}`]: kept(), [`${a.id}/w${notWreck}`]: kept(), 'site999999p/w0': kept() },
        gone: [`${a.id}/w${ai}`, `${b.id}/w${bi}`, `${a.id}/w999`],
      },
    });
    const done = rehome(s, now);
    expect(Object.keys(s.wrecks!.kept)).toEqual([`${a.id}/w${ai}`]);
    const o = a.objects[ai];
    expect(s.wrecks!.kept[`${a.id}/w${ai}`]).toMatchObject({ x: o.x, z: o.z, yaw: -o.yaw });
    expect(s.wrecks!.gone).toEqual([`${a.id}/w${ai}`]);
    expect(done.wrecksMoved).toBe(1);
    expect(done.forgotten).toBe(3 + 2);
  });

  it('is the same every time, and a save made fit is left alone by a second pass', () => {
    const make = (): SaveV1 => {
      const lay = inLane(then, 12_350, 3);
      return roadSave({ loose: [{ part: newInstance('bat_std'), x: lay.x, y: 512, z: lay.z, yaw: 0.3, s: 12_350 }] });
    };
    const strip = (s: SaveV1): string => JSON.stringify(s, (k, v: unknown) => (k === 'uid' ? undefined : v));
    const a = make();
    const b = make();
    rehome(a, now);
    rehome(b, now);
    expect(strip(a)).toBe(strip(b));
    const once = strip(a);
    rehome(a, now);
    expect(strip(a)).toBe(once);
  });

  it('the line said has both languages', () => {
    expect(WORLD_CHANGED.zh).toBe('世界有了变化，车和人已放回路上');
    expect(WORLD_CHANGED.en.length).toBeGreaterThan(20);
  });
});
