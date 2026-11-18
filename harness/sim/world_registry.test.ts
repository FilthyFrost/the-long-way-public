/**
 * Gate for what step W1.0 opened in the world generator (docs/V3/nodes/W1-worldgen.md):
 *
 *   the registry   BIOMES is the six regions of version 1 and then an append-only list; a region appended
 *                  changes no version 1 world (the trap R3 of docs/V3/maps/world-core.md), and a region
 *                  without rows of its own in a table gets its kin's, not the plains' (R4);
 *   the versions   a world says which version made it and how many regions it knows; version 2 is, until
 *                  its own dealer lands, the same world as version 1;
 *   the dealer     the chapter plan deals through the dealer its rules name, shows it nothing of the road,
 *                  and lets it deal no region beyond the world's count.
 *
 * The dummy regions here are put into the registry by `registerRegion` and taken out again by what it
 * returns, block by block: nothing of them is left for whoever runs after.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WeatherSystem, calmOf } from '../../src/core/env/weather';
import { Rng, hash2 } from '../../src/core/math/rng';
import { BIOMES, BIOME_INDEX, FIRST_BIOMES, regionById, regionRow, registerRegion, type RegionDef } from '../../src/core/world/biomes';
import { gameOf } from '../../src/core/world/fauna';
import { LAND_ODDS, LAND_SIZE, LAND_SLOT, LandParams, landOddsOf, landSizeOf } from '../../src/core/world/landform';
import { Landmark, landmarkAt, landmarkKindsOf } from '../../src/core/world/landmarks';
import { ADDED_REGIONS } from '../../src/core/world/regions/index';
import { DEALER_V1, RULES_V1, RULES_V2, rulesFor, type ChapterDealer, type DealerView, type WorldRules } from '../../src/core/world/rules';
import { seaAlong } from '../../src/core/world/sea';
import { SITE_SLOT, placeOddsOf } from '../../src/core/world/sites';
import { ChapterPlan, RoadSpine } from '../../src/core/world/spine';
import { World } from '../../src/core/world/terrain';
import { WATER_SLOT, waterOf } from '../../src/core/world/water';
import { GOLDEN_FILE, REFERENCE_WORLDS, TRACE_PARTS, worldTrace, type WorldFingerprint, type WorldGolden } from './worldTrace';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const golden = JSON.parse(fs.readFileSync(GOLDEN_FILE, 'utf8')) as WorldGolden;

function expectRecorded(got: WorldFingerprint, name: string, how: string): void {
  for (const part of TRACE_PARTS) expect.soft(got[part], `${part} of ${name} ${how}`).toBe(golden[name][part]);
  expect.soft(got.counts, `counts of ${name} ${how}`).toEqual(golden[name].counts);
}

const SIX = ['plains', 'desert', 'alpine', 'forest', 'lakes', 'maple'];

/** a region that is the desert in everything it says of the road and the land, under another name, and says nothing more */
const dryDummy = (): RegionDef => ({ ...BIOMES[BIOME_INDEX.desert], id: 'test_dry', label: 'dry dummy', kin: 'desert' });
/** a region of the cold kin with landforms and water of its own: valleys only, a frozen lake in every stretch */
const ownDummy = (): RegionDef => ({
  ...BIOMES[BIOME_INDEX.alpine],
  id: 'test_own',
  label: 'dummy with tables of its own',
  kin: 'alpine',
  land: { odds: { valley: 1 }, size: { wall: 33 } },
  water: { lake: 1, river: 0, frozen: 1, clear: 9 },
  sea: true,
});

/** put regions into the registry for the length of a describe block */
function withRegions(...make: (() => RegionDef)[]): void {
  const undo: (() => void)[] = [];
  beforeAll(() => {
    for (const m of make) undo.push(registerRegion(m()));
  });
  afterAll(() => {
    while (undo.length) undo.pop()!();
  });
}

describe('world · the registry of regions', () => {
  it('is the six regions of version 1 first, in their order, then the appended list', () => {
    expect(BIOMES.slice(0, 6).map((b) => b.id)).toEqual(SIX);
    expect(BIOMES.slice(6).map((b) => b.id)).toEqual(ADDED_REGIONS.map((b) => b.id));
    expect(FIRST_BIOMES).toBe(3);
    BIOMES.forEach((b, i) => expect(BIOME_INDEX[b.id]).toBe(i));
    expect(new Set(BIOMES.map((b) => b.id)).size).toBe(BIOMES.length);
  });

  it('keeps every entry laid out alike: the same fields in the same order, whatever the region left out', () => {
    const undo = [registerRegion(dryDummy()), registerRegion(ownDummy())];
    // (a third with its fields written the other way round, and other ones filled in)
    const other = { ...BIOMES[0], id: 'test_other', label: 'dummy', weight: 2, surreal: true, features: [{ kind: 'tower' }] };
    undo.push(registerRegion(Object.fromEntries(Object.entries(other).reverse()) as unknown as RegionDef));
    try {
      const fields = Object.keys(BIOMES[0]);
      for (const b of BIOMES) expect(Object.keys(b), b.id).toEqual(fields);
      // what a region says is what its entry holds
      const own = regionById('test_own');
      expect(own.water).toEqual({ lake: 1, river: 0, frozen: 1, clear: 9 });
      expect(own.sea).toBe(true);
      expect(regionById('test_dry').land).toBeUndefined();
      expect(regionById('test_other').weight).toBe(2);
    } finally {
      while (undo.length) undo.pop()!();
    }
  });

  it('puts a registered region last and takes it out again, the last one first', () => {
    const before = BIOMES.length;
    const undoA = registerRegion(dryDummy());
    const undoB = registerRegion(ownDummy());
    expect(BIOMES.length).toBe(before + 2);
    expect(BIOME_INDEX.test_dry).toBe(before);
    expect(BIOME_INDEX.test_own).toBe(before + 1);
    expect(() => registerRegion(dryDummy())).toThrow(/already/);
    expect(() => registerRegion({ ...dryDummy(), id: 'plains' })).toThrow(/already/);
    expect(() => undoA()).toThrow(/reverse/);
    undoB();
    undoA();
    expect(BIOMES.length).toBe(before);
    expect(BIOME_INDEX.test_dry).toBeUndefined();
    expect(BIOME_INDEX.test_own).toBeUndefined();
    expect(regionById('test_dry')).toBe(BIOMES[0]);
  });
});

describe('world · a region without rows of its own is its kin, not the plains (R4)', () => {
  withRegions(dryDummy, ownDummy);

  it('with only a kin, gets the kin\'s row from every table', () => {
    const dummy = regionById('test_dry');
    const desert = regionById('desert');
    expect(dummy.id).toBe('test_dry');
    // landforms: the very rows of the tables (the developer's dials write into them)
    expect(landOddsOf(dummy)).toBe(LAND_ODDS.desert);
    expect(landSizeOf(dummy)).toBe(LAND_SIZE.desert);
    expect(waterOf(dummy)).toBe(waterOf(desert));
    expect(waterOf(dummy)).not.toEqual(waterOf(BIOMES[0]));
    expect(placeOddsOf(dummy)).toBe(placeOddsOf(desert));
    expect(landmarkKindsOf(dummy)).toBe(landmarkKindsOf(desert));
    expect(seaAlong(dummy)).toBe(false);
    expect(gameOf(dummy)).toBe('deer');
    // weather: the desert's sandstorms and its clear, mistless mornings
    expect(calmOf(dummy)).toBe(calmOf(desert));
    for (let i = 0; i < 200; i++) expect(WeatherSystem.kindFor('test_dry', i / 200)).toBe(WeatherSystem.kindFor('desert', i / 200));
    expect(WeatherSystem.kindFor('test_dry', 0.1)).toBe('sandstorm');
    // (and each of the six still gets its own)
    for (const id of SIX) {
      expect(landOddsOf(regionById(id))).toBe(LAND_ODDS[id]);
      expect(landSizeOf(regionById(id))).toBe(LAND_SIZE[id]);
    }
    expect(seaAlong(regionById('lakes'))).toBe(true);
    expect(SIX.filter((id) => seaAlong(regionById(id)))).toEqual(['lakes']);
    expect(SIX.map((id) => gameOf(regionById(id)))).toEqual(['deer', 'deer', 'reindeer', 'deer', 'deer', 'deer']);
  });

  it('with land and water of its own, gets those, and its kin\'s where it says nothing', () => {
    const own = regionById('test_own');
    // a kind it leaves out never comes; a strength it leaves out is its kin's
    expect(landOddsOf(own)).toEqual([0, 0, 1, 0, 0]);
    expect(landSizeOf(own)).toEqual([LAND_SIZE.alpine[0], 33, LAND_SIZE.alpine[2], LAND_SIZE.alpine[3]]);
    expect(waterOf(own)).toEqual({ lake: 1, river: 0, frozen: 1, clear: 9 });
    expect(seaAlong(own)).toBe(true);
    expect(placeOddsOf(own)).toBe(placeOddsOf(regionById('alpine')));
    expect(landmarkKindsOf(own)).toBe(landmarkKindsOf(regionById('alpine')));
    expect(gameOf(own)).toBe('reindeer');
    expect(calmOf(own)).toBe(calmOf(regionById('alpine')));
    expect(WeatherSystem.kindFor('test_own', 0.1)).toBe('blizzard');
    expect(regionRow({ plains: 1, desert: 2, alpine: 3, test_own: 4 }, own)).toBe(4);
  });

  it('a world that begins in the dummy desert lays its first chapter out as the desert\'s: the same country, the same water, the same remains', () => {
    const lp = new LandParams();
    const lq = new LandParams();
    const lm = new Landmark();
    const ln = new Landmark();
    for (const seed of [3, 20261113]) {
      // (worlds of version 1 that know the whole registry: version 1's dealer, which begins where it is
      // asked to and will not change, and a first region registered after the six)
      const a = new World(seed, { regionCount: BIOMES.length, startBiome: 'test_dry', chapterScale: 4 });
      const b = new World(seed, { regionCount: BIOMES.length, startBiome: 'desert', chapterScale: 4 });
      expect(a.spine.plan.biomes[0]).toBe(BIOME_INDEX.test_dry);
      expect(b.spine.plan.biomes[0]).toBe(BIOME_INDEX.desert);
      // (well inside chapter 0: the chapters after it are dealt differently, their first region being another)
      const kMax = Math.floor((a.spine.plan.starts[1] - 3000) / LAND_SLOT);
      expect(kMax).toBeGreaterThan(12);
      for (let k = 0; k < kMax; k++) {
        expect(a.land.kindOf(k), `kind of stretch ${k}`).toBe(b.land.kindOf(k));
        expect(a.land.sideOf(k)).toBe(b.land.sideOf(k));
        expect({ ...a.land.at((k + 0.5) * LAND_SLOT, lp) }).toEqual({ ...b.land.at((k + 0.5) * LAND_SLOT, lq) });
        expect(a.water.diceOf(k)).toBe(b.water.diceOf(k));
        // (the road is the same road, and water is laid out from the road alone)
        expect(a.water.feature(k), `water of stretch ${k}`).toEqual(b.water.feature(k));
        // (the desert's water: a lake here and there, never a river)
        expect(a.water.diceOf(k)).not.toBe('river');
      }
      expect(a.spine.hash(kMax * 600)).toBe(b.spine.hash(kMax * 600));
      for (let i = 0; i * 2700 + 2400 < kMax * LAND_SLOT; i++) {
        landmarkAt(a, i, lm);
        landmarkAt(b, i, ln);
        expect(lm.kind, `remain ${i}`).toBe(ln.kind);
      }
      expect(a.sea.seaOf(0)).toBeNull();
    }
  });

  it('a world that begins in the dummy with tables of its own is all valleys with a frozen lake wherever one fits, and may have the sea along it', () => {
    const lp = new LandParams();
    let lakes = 0;
    let seas = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const w = new World(seed, { regionCount: BIOMES.length, startBiome: 'test_own', chapterScale: 4 });
      expect(w.spine.plan.biomes[0]).toBe(BIOME_INDEX.test_own);
      const sea = w.sea.seaOf(0);
      if (sea) seas++;
      const kMax = Math.floor((w.spine.plan.starts[1] - 3000) / LAND_SLOT);
      for (let k = 1; k < kMax; k++) {
        // (beside a coast run the sea has its own say: no lake there, and a hillside down to the beach)
        if (w.sea.near(k)) continue;
        expect(w.water.diceOf(k), `dice of stretch ${k}, seed ${seed}`).toBe('lake');
        expect(w.land.kindOf(k)).toBe('valley');
        w.land.at((k + 0.5) * LAND_SLOT, lp);
        expect(lp.wall).toBeGreaterThan(0.5 * 33);
        expect(lp.wall).toBeLessThanOrEqual(33);
        expect(lp.tilt).toBe(0);
        const f = w.water.feature(k);
        if (f) {
          expect(f.kind).toBe('lake');
          expect(f.frozen).toBe(1);
          lakes++;
        }
      }
    }
    expect(lakes).toBeGreaterThan(20);
    expect(seas).toBeGreaterThan(0);
  });
});

describe('world · appending regions changes no version 1 world (R3)', () => {
  withRegions(dryDummy, ownDummy);

  for (const [name, ref] of Object.entries(REFERENCE_WORLDS)) {
    it(`${name}: every part hashes as recorded with two more regions in the registry`, () => {
      expect(BIOMES.length).toBe(6 + ADDED_REGIONS.length + 2);
      const world = ref.make();
      expect(world.rules.version).toBe(1);
      expect(world.rules.regionCount).toBe(6);
      expectRecorded(worldTrace(world, ref.km), name, 'with two more regions registered');
    });
  }

  it('a world begins in a region registered after the six only if its count reaches it', () => {
    expect(new World(5, { startBiome: 'test_dry' }).spine.plan.biomes[0]).toBe(0);
    expect(new World(5, { regionCount: BIOMES.length, startBiome: 'test_dry' }).spine.plan.biomes[0]).toBe(BIOME_INDEX.test_dry);
    expect(new World(5, { worldVersion: 2 }).rules.regionCount).toBe(BIOMES.length);
    expect(new World(5, { worldVersion: 2, regionCount: 6, startBiome: 'test_dry' }).spine.plan.biomes[0]).toBe(0);
    // (while version 2 deals as version 1 does: its own dealer may begin a journey where it sees fit)
    expect(new World(5, { worldVersion: 2, startBiome: 'test_dry' }).spine.plan.biomes[0]).toBe(BIOME_INDEX.test_dry);
  });
});

describe('world · versions and rules', () => {
  it('a world made without a version is of version 1 and knows six regions; its road and its plan hold the same rules', () => {
    const w = new World(11, {});
    expect(w.rules.version).toBe(1);
    expect(w.rules.regionCount).toBe(6);
    expect(w.rules).toBe(RULES_V1);
    expect(w.spine.rules).toBe(w.rules);
    expect(w.spine.plan.rules).toBe(w.rules);
    expect(new World(11, { worldVersion: 1 }).rules).toBe(RULES_V1);
    expect(new RoadSpine(11, {}).rules).toBe(RULES_V1);
  });

  it('a world of version 2 says so and knows the whole registry, or the count it is given', () => {
    const w = new World(11, { worldVersion: 2 });
    expect(w.rules.version).toBe(2);
    expect(w.rules.regionCount).toBe(BIOMES.length);
    expect(w.spine.rules).toBe(w.rules);
    expect(new RoadSpine(11, { worldVersion: 2 }).rules.version).toBe(2);
    const few = new World(11, { worldVersion: 2, regionCount: 4 });
    expect(few.rules.version).toBe(2);
    expect(few.rules.regionCount).toBe(4);
    expect(few.rules.dealer).toBe(RULES_V2.dealer);
  });

  it('the two versions are separate, frozen objects that name one grid of stretches, and it is the plans\'', () => {
    expect(RULES_V2).not.toBe(RULES_V1);
    expect(RULES_V2.road).not.toBe(RULES_V1.road);
    expect(RULES_V2.transition).not.toBe(RULES_V1.transition);
    for (const r of [RULES_V1, RULES_V2]) {
      expect(Object.isFrozen(r)).toBe(true);
      expect(Object.isFrozen(r.road)).toBe(true);
      expect(r.slot).toBe(1250);
      expect(r.slot).toBe(LAND_SLOT);
      expect(r.slot).toBe(WATER_SLOT);
      expect(r.slot).toBe(SITE_SLOT);
    }
    expect(RULES_V1.version).toBe(1);
    expect(RULES_V2.version).toBe(2);
    expect(RULES_V1.regionCount).toBe(6);
    expect(RULES_V1.road).toEqual({ headingSoft: 40, headingLimit: 44, headingRoom: 8, headingHard: 49, radiusFloor: 60, gradeCap: 0.08 });
    for (const scale of [0.1, 0.2, 0.5, 1, 2.5]) expect(RULES_V1.transition(scale)).toBe(Math.max(300, 900 * Math.min(1, scale * 2)));
  });

  it('rulesFor refuses a version there is not and a region count no world can have', () => {
    expect(() => rulesFor(3 as 1)).toThrow(RangeError);
    expect(() => rulesFor(1, { regionCount: 2 })).toThrow(RangeError);
    expect(() => rulesFor(1, { regionCount: 4.5 })).toThrow(RangeError);
    expect(() => rulesFor(2, { regionCount: BIOMES.length + 1 })).toThrow(RangeError);
    expect(() => new World(1, { regionCount: BIOMES.length + 1 })).toThrow(RangeError);
    expect(rulesFor(1, { regionCount: 6 })).toBe(RULES_V1);
    expect(rulesFor()).toBe(RULES_V1);
    expect(rulesFor(1, { regionCount: 3 }).regionCount).toBe(3);
  });

  // UNTIL THE VERSION 2 DEALER AND QUIET RULE LAND (rules.ts RULES_V2): from then on a version 2 world is
  // another world, and this test gives way to version 2's own golden worlds.
  for (const [name, ref] of Object.entries(REFERENCE_WORLDS)) {
    it(`${name}: today a version 2 world is the version 1 world of the same seed and options`, () => {
      const world = ref.make({ worldVersion: 2 });
      expect(world.rules.version).toBe(2);
      expectRecorded(worldTrace(world, ref.km), name, 'made as version 2');
    });
  }
});

describe('world · the dealer and the region count', () => {
  const chapters = (plan: ChapterPlan, upTo: number): number[] => {
    plan.chapterAt(upTo);
    return plan.biomes.slice();
  };

  it('version 1 deals the first four chapters from three kinds and the rest from six, never from more', () => {
    for (const seed of [1, 7, 37, 20261113]) {
      const dealt = chapters(new World(seed, { chapterScale: 0.2 }).spine.plan, 400_000);
      expect(dealt.length).toBeGreaterThan(100);
      expect(Math.max(...dealt.slice(0, 4))).toBeLessThan(3);
      expect(Math.max(...dealt)).toBe(5);
      for (let c = 1; c < dealt.length; c++) expect(dealt[c]).not.toBe(dealt[c - 1]);
      for (let c = 4; c < dealt.length; c++) expect(dealt[c]).not.toBe(dealt[c - 2]);
    }
  });

  it('a region count below six keeps the dealer to that many, and leaves the first four chapters what they were', () => {
    for (const seed of [1, 7, 37]) {
      const all = new World(seed, { chapterScale: 0.2 }).spine.plan;
      const few = new World(seed, { chapterScale: 0.2, regionCount: 4 }).spine.plan;
      const dealt = chapters(few, 400_000);
      expect(Math.max(...dealt)).toBe(3);
      expect(dealt.slice(0, 4)).toEqual(chapters(all, 400_000).slice(0, 4));
      expect(few.starts.slice(0, 5)).toEqual(all.starts.slice(0, 5));
      const three = chapters(new World(seed, { chapterScale: 0.2, regionCount: 3 }).spine.plan, 400_000);
      expect(Math.max(...three)).toBe(2);
      for (let c = 1; c < three.length; c++) expect(three[c]).not.toBe(three[c - 1]);
    }
  });

  it('a first biome beyond the count, or of no such id, is the first region', () => {
    expect(new World(1, { startBiome: 'maple' }).spine.plan.biomes[0]).toBe(5);
    expect(new World(1, { startBiome: 'maple', regionCount: 4 }).spine.plan.biomes[0]).toBe(0);
    expect(new World(1, { startBiome: 'no such country' }).spine.plan.biomes[0]).toBe(0);
  });

  it('the plan refuses a region beyond the world\'s count and a length that is none', () => {
    const rogue = (region: number, length: number): WorldRules => ({ ...RULES_V1, dealer: { first: () => ({ region: 0, length: 8000 }), next: () => ({ region, length }) } });
    expect(() => new ChapterPlan(1, 1, 0, rogue(6, 12000)).chapterAt(50_000)).toThrow(RangeError);
    expect(() => new ChapterPlan(1, 1, 0, rogue(-1, 12000)).chapterAt(50_000)).toThrow(RangeError);
    expect(() => new ChapterPlan(1, 1, 0, rogue(1.5, 12000)).chapterAt(50_000)).toThrow(RangeError);
    expect(() => new ChapterPlan(1, 1, 0, rogue(1, 0)).chapterAt(50_000)).toThrow(RangeError);
    expect(() => new ChapterPlan(1, 1, 0, rogue(1, NaN)).chapterAt(50_000)).toThrow(RangeError);
    expect(() => new ChapterPlan(1, 1, 0, { ...RULES_V1, dealer: { first: () => ({ region: 9, length: 8000 }), next: DEALER_V1.next } })).toThrow(RangeError);
    expect(new ChapterPlan(1, 1, 0, rogue(5, 12000)).chapterAt(50_000)).toBe(4);
  });

  it('the dealer is shown the seed, the scale, the start, the rules and the chapters so far — and dealing through it is the old dealing, draw for draw', () => {
    const seen: { c: number; seed: number; scale: number; start: number; regions: number[]; starts: number[]; rules: WorldRules }[] = [];
    const note = (c: number, d: DealerView): void => void seen.push({ c, seed: d.seed, scale: d.scale, start: d.startRegion, regions: d.regions.slice(), starts: d.starts.slice(), rules: d.rules });
    const watching: ChapterDealer = {
      first(d) {
        note(0, d);
        return DEALER_V1.first(d);
      },
      next(d) {
        note(d.regions.length, d);
        return DEALER_V1.next(d);
      },
    };
    const rules: WorldRules = { ...RULES_V1, dealer: watching };
    const opts = { chapterScale: 0.2, startBiome: 'alpine' };
    const road = new RoadSpine(20261113, opts, rules);
    const plain = new RoadSpine(20261113, opts);
    expect(road.hash(30000)).toBe(plain.hash(30000));
    expect(road.plan.biomes).toEqual(plain.plan.biomes);
    expect(road.plan.starts).toEqual(plain.plan.starts);
    expect(seen.length).toBe(road.plan.biomes.length);
    seen.forEach((v, c) => {
      expect(v.c).toBe(c);
      expect(v.seed).toBe(20261113);
      expect(v.scale).toBe(0.2);
      expect(v.start).toBe(BIOME_INDEX.alpine);
      expect(v.rules).toBe(rules);
      expect(v.regions).toEqual(road.plan.biomes.slice(0, c));
      expect(v.starts).toEqual(road.plan.starts.slice(0, c + 1));
    });
    // the stream is the chapter plan's own (Appendix B): one number for chapter 0, two for each chapter after
    const rng = new Rng(hash2(20261113, 0xb10e, 77));
    expect(plain.plan.starts[1]).toBe(rng.range(6000, 9000) * 0.2);
    for (let c = 1; c < 6; c++) {
      const pool = [0, 1, 2, 3, 4, 5].slice(0, c < 4 ? 3 : 6).filter((b) => b !== plain.plan.biomes[c - 1] && (c < 4 || b !== plain.plan.biomes[c - 2]));
      expect(plain.plan.biomes[c]).toBe(pool[rng.int(pool.length)]);
      expect(plain.plan.starts[c + 1]).toBe(plain.plan.starts[c] + rng.range(10000, 18000) * 0.2);
    }
  });

  it('the road begins in the region chapter 0 was dealt, whatever was asked for', () => {
    const rules: WorldRules = { ...RULES_V2, dealer: { first: () => ({ region: BIOME_INDEX.alpine, length: 8000 }), next: DEALER_V1.next } };
    const road = new RoadSpine(9, { startBiome: 'plains' }, rules);
    expect(road.plan.biomes[0]).toBe(BIOME_INDEX.alpine);
    expect(road.ys[0]).toBe(BIOMES[BIOME_INDEX.alpine].baseElev);
  });
});

describe('world · the rules stand below the road', () => {
  /** the files a file loads to run: its relative imports, less those that bring in types only */
  const loads = (file: string): string[] => {
    const src = fs.readFileSync(file, 'utf8');
    const out: string[] = [];
    for (const m of src.matchAll(/^import\s+(type\s+)?([^;]*?)\s+from\s+'(\.[^']*)';/gm)) {
      if (m[1]) continue;
      const names = /^\{([^}]*)\}$/.exec(m[2].trim());
      if (names && names[1].split(',').every((n) => n.trim() === '' || n.trim().startsWith('type '))) continue;
      const target = path.resolve(path.dirname(file), m[3]);
      out.push(fs.existsSync(`${target}.ts`) ? `${target}.ts` : path.join(target, 'index.ts'));
    }
    return out;
  };

  it('nothing rules.ts loads to run loads the road: a dealer or a quiet rule knows the road by its types only', () => {
    // (spine.ts loads rules.ts; were a rule to load spine.ts, or anything that does — landform.ts,
    // water.ts, sea.ts, sites.ts, terrain.ts —, the modules would load in a circle and fail by the order
    // they happen to be asked in)
    const start = path.join(ROOT, 'src/core/world/rules.ts');
    const seen = new Set<string>([start]);
    const queue = [start];
    while (queue.length) for (const f of loads(queue.pop()!)) if (!seen.has(f)) (seen.add(f), queue.push(f));
    const reached = [...seen].map((f) => path.relative(ROOT, f));
    expect(reached).toContain(path.join('src/core/world', 'quiet.ts'));
    expect(reached).toContain(path.join('src/core/world', 'biomes.ts'));
    for (const f of reached) expect(f, `${f} is loaded by rules.ts`).not.toMatch(/world[\\/](spine|landform|water|sea|sites|terrain|furniture|landmarks)\.ts$/);
    // (and the check sees what it should: the road does load the rules)
    expect(loads(path.join(ROOT, 'src/core/world/spine.ts')).map((f) => path.basename(f))).toContain('rules.ts');
  });

  it('nothing the registry loads to run loads the rules or the road: a region\'s file is data', () => {
    // (rules.ts counts the registry as it is loaded; a region's file that loaded the rules, or the road,
    // or anything that does, would have them read a registry that is not there yet)
    const start = path.join(ROOT, 'src/core/world/biomes.ts');
    const seen = new Set<string>([start]);
    const queue = [start];
    while (queue.length) for (const f of loads(queue.pop()!)) if (!seen.has(f)) (seen.add(f), queue.push(f));
    const reached = [...seen].map((f) => path.relative(ROOT, f));
    expect(reached).toContain(path.join('src/core/world/regions', 'index.ts'));
    for (const f of reached) expect(f, `${f} is loaded by biomes.ts`).not.toMatch(/world[\\/](rules|quiet|spine|landform|water|sea|sites|terrain|furniture|landmarks)\.ts$/);
  });
});
