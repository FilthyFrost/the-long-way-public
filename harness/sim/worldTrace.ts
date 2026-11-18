/**
 * A fingerprint of a whole world: the road, the chapters, the lie of the land, the water, the sea, the
 * places, the colossal remains, what stands along the road's edges, and twenty thousand heights — each
 * hashed over the first kilometres of a journey (docs/V3/maps/world-core.md, Appendix A: the definition
 * and the first four reference worlds, recorded at e50503c).
 *
 * World generation of version 1 must leave every one of these hashes untouched, whatever is added round
 * it: a save made in an old world opens onto the same road, the same lake, the same crate behind the same
 * shed. harness/sim/world_golden.test.ts holds the worlds below to harness/sim/world-golden.json.
 *
 * Beside the worlds stands the weather of the six regions version 1 knows (`weatherTrace`: not part of
 * Appendix A; taken on the generator as it stood at 473d257, before the weather's branches on a region's
 * id became tables): a region's weather is part of what an old save comes back to.
 *
 * The hashes are over exact doubles, and the height function, the water and the places go through the
 * engine's Math functions: they hold for one Node (the file says which). Write the file again only to add
 * a reference world, or on a Node whose Math rounds differently — never to make a changed version 1 pass:
 *   npx tsx harness/sim/worldTrace.ts --write
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WEATHER_KINDS, WeatherState, WeatherSystem } from '../../src/core/env/weather';
import { provingLevel, provingPlot } from '../../src/core/modcar/proving/layout';
import { Rng } from '../../src/core/math/rng';
import { BIOMES } from '../../src/core/world/biomes';
import type { RailRun, RoadPost } from '../../src/core/world/furniture';
import { LandParams } from '../../src/core/world/landform';
import { Landmark, landmarkAt, landmarkRange } from '../../src/core/world/landmarks';
import { SpineSample } from '../../src/core/world/spine';
import { TerrainPoint, World, type WorldOptions } from '../../src/core/world/terrain';
import { modcarWorld, modcarWorldOptions } from '../../src/game/modcar/seamless';

/** FNV-1a over 32-bit words: a double goes in as its two halves, the low one first (as RoadSpine.hash does), a string as its UTF-16 code units */
class Hasher {
  private h = 0x811c9dc5;
  private readonly f = new Float64Array(1);
  private readonly u = new Uint32Array(this.f.buffer);

  num(v: number): this {
    this.f[0] = v;
    this.h = Math.imul(this.h ^ this.u[0], 0x01000193);
    this.h = Math.imul(this.h ^ this.u[1], 0x01000193);
    return this;
  }

  str(s: string): this {
    for (let i = 0; i < s.length; i++) this.h = Math.imul(this.h ^ s.charCodeAt(i), 0x01000193);
    return this;
  }

  get hex(): string {
    return (this.h >>> 0).toString(16).padStart(8, '0');
  }
}

const hex = (n: number): string => (n >>> 0).toString(16).padStart(8, '0');

/** the parts of a fingerprint, in the order they are taken */
export const TRACE_PARTS = ['spine', 'spineHash', 'chapters', 'land', 'water', 'sea', 'sites', 'landmarks', 'furniture', 'heights'] as const;
export type TracePart = (typeof TRACE_PARTS)[number];

export type WorldFingerprint = Record<TracePart, string> & {
  /** how many of each the trace met: the first thing to look at when a hash differs */
  counts: { chapters: number; water: number; seas: number; sites: number; landmarks: number; posts: number; rails: number };
};

/** a stretch of road, as the trace counts them (m): the definition's own number, whatever the generator calls its slots */
const SLOT = 1250;
/** half widths of the bands the heights are taken in, by turns (m to either side of the road): the pavement, the verge, the near field, the far field, the skyline */
const HEIGHT_BANDS = [3, 30, 190, 2500, 12000];

/** the fingerprint of the first `km` kilometres of a world */
export function worldTrace(world: World, km = 60): WorldFingerprint {
  const len = km * 1000;
  const sp = world.spine;
  const plan = sp.plan;

  // ---- the road: every array of every station, and the road's own hash
  sp.ensure(len);
  const spine = new Hasher();
  for (let i = 0; i < km * 500; i++) spine.num(sp.xs[i]).num(sp.zs[i]).num(sp.ys[i]).num(sp.phi[i]).num(sp.kap[i]).num(sp.grd[i]).num(sp.bnk[i]);
  const spineHash = hex(sp.hash(km * 500));

  // ---- the chapters: which country, and where each begins
  const chapters = new Hasher();
  const lastChapter = plan.chapterAt(len);
  for (let c = 0; c <= lastChapter; c++) chapters.str(BIOMES[plan.biomeOf(c)].id).num(plan.starts[c]);

  // ---- the lie of the land, stretch by stretch
  const land = new Hasher();
  const lp = new LandParams();
  for (let k = 0; k < Math.floor(len / SLOT); k++) {
    land.str(world.land.kindOf(k)).num(world.land.sideOf(k)).num(world.quiet(k) ? 1 : 0);
    world.land.at((k + 0.5) * SLOT, lp);
    land.num(lp.tilt).num(lp.wall).num(lp.drop).num(lp.canyon).num(lp.far);
  }

  // ---- lakes and rivers: every field of every feature, by name
  const water = new Hasher();
  const features = world.water.between(0, len - 1, []);
  for (const f of features) {
    water.str(f.kind);
    const fields = f as unknown as Record<string, unknown>;
    for (const key of Object.keys(fields).sort()) {
      const v = fields[key];
      if (typeof v === 'number') water.num(v);
      else water.str(String(v));
    }
  }

  // ---- the sea
  const sea = new Hasher();
  const seas = world.sea.between(0, len, []);
  for (const c of seas) {
    sea.num(c.chapter).num(c.s0).num(c.s1).num(c.side).num(c.level).num(c.seed);
    for (const r of c.runs) sea.num(r.k0).num(r.k1).num(r.s0).num(r.s1);
  }

  // ---- the places and the verges: where everything stands, what can be searched, what cannot be walked through
  const sites = new Hasher();
  const places = world.sites.between(0, len - 1, []);
  for (const s of places) {
    sites.str(s.id).str(s.kind).str(s.biome).num(s.seed).num(s.s).num(s.side).num(s.x).num(s.y).num(s.z).num(s.phi);
    sites.num(s.halfL).num(s.depth).num(s.skirt).num(s.ground).num(s.zoneX).num(s.zoneZ).num(s.zoneR).num(s.reach);
    for (const o of s.objects) {
      sites.str(o.kind).num(o.x).num(o.y).num(o.z).num(o.yaw).num(o.w).num(o.d).num(o.h).num(o.v).num(o.pitch).num(o.roll);
      sites.str(o.b ? JSON.stringify(o.b) : '-');
    }
    for (const c of s.containers) sites.str(c.id).str(c.kind).num(c.x).num(c.y).num(c.z).num(c.yaw).num(c.hx).num(c.h).num(c.hz).num(c.shelf).num(c.solid ? 1 : 0).num(c.obj).num(c.seed);
    for (const l of s.loose) sites.str(l.id).str(l.item).num(l.n).num(l.x).num(l.y).num(l.z).num(l.yaw);
    for (const f of s.fuel) sites.str(f.id).str(f.from).num(f.x).num(f.y).num(f.z).num(f.litres);
    for (const d of s.solids) sites.str(d.tag).num(d.x).num(d.z).num(d.hx).num(d.hz).num(d.yaw).num(d.y0).num(d.y1).num(d.floor ? 1 : 0).num(d.ref);
    for (const b of s.bare) sites.num(b);
  }

  // ---- the colossal remains
  const landmarks = new Hasher();
  const lm = new Landmark();
  const [l0, l1] = landmarkRange(0, len);
  for (let k = l0; k <= l1; k++) {
    landmarkAt(world, k, lm);
    landmarks.str(lm.kind).num(lm.s).num(lm.d).num(lm.x).num(lm.y).num(lm.z).num(lm.yaw).num(lm.scale).num(lm.absent ? 1 : 0);
  }

  // ---- what the road carries along its edges
  const furniture = new Hasher();
  const posts: RoadPost[] = [];
  const rails: RailRun[] = [];
  world.furniture.between(0, len, posts, rails);
  for (const p of posts) furniture.str(p.kind).num(p.s).num(p.side).num(p.x).num(p.y).num(p.z).num(p.phi).num(p.state).num(p.h);
  for (const r of rails) furniture.num(r.side).num(r.s0).num(r.s1);

  // ---- the land itself: twenty thousand points beside the road, near and far, one in ten asked coarsely
  const heights = new Hasher();
  const rng = new Rng(0x7ace);
  const st = new SpineSample();
  const tp = new TerrainPoint();
  for (let i = 0; i < 20000; i++) {
    const s = rng.range(0, len);
    const d = (rng.next() * 2 - 1) * HEIGHT_BANDS[i % 5];
    sp.at(s, st);
    world.shape(st.x - Math.sin(st.phi) * d, st.z + Math.cos(st.phi) * d, tp, i % 10 === 9);
    heights.num(tp.h).num(tp.bed).num(tp.wl).num(tp.s).num(tp.d).num(tp.zone).num(tp.relief).num(tp.site).num(tp.bridge).num(tp.wkind).num(tp.frozen).num(tp.ba).num(tp.bb).num(tp.bt).num(tp.plot);
  }

  return {
    spine: spine.hex,
    spineHash,
    chapters: chapters.hex,
    land: land.hex,
    water: water.hex,
    sea: sea.hex,
    sites: sites.hex,
    landmarks: landmarks.hex,
    furniture: furniture.hex,
    heights: heights.hex,
    counts: { chapters: lastChapter + 1, water: features.length, seas: seas.length, sites: places.length, landmarks: l1 - l0 + 1, posts: posts.length, rails: rails.length },
  };
}

/** the fields of the weather that are numbers, in the order the trace takes them */
const WEATHER_FIELDS = ['cloud', 'overcast', 'overcastCalm', 'rain', 'snow', 'hail', 'dust', 'fog', 'wind', 'windDir', 'lightning', 'temp', 'wetness', 'snowCover', 'rainbow', 'act', 'severity', 'front', 'frontSide', 'fall', 'murkRain', 'murkSnow', 'murkDust'] as const;

/**
 * The fingerprint of the weather of the first six regions, for three seeds: every field of the sky over
 * each region and across its borders through sixty hours of schedule, the slow state stepped through
 * three hours, what the event selector means in each region (and in one that does not exist), and every
 * forced weather at four moments of its three acts.
 */
export function weatherTrace(): string {
  const hs = new Hasher();
  const out = new WeatherState();
  const take = (): void => {
    for (const key of WEATHER_FIELDS) hs.num(out[key]);
    hs.str(out.kind);
  };
  for (const seed of [1, 20261113, 777]) {
    const ws = new WeatherSystem(seed);
    for (let bi = 0; bi < 6; bi++) {
      for (let i = 0; i < 6000; i++) {
        const t = i * 37.3;
        const hour = (6 + t / 100) % 24;
        const daylight = Math.max(0, Math.sin(((hour - 6) / 13) * Math.PI));
        ws.targets(t, hour, daylight, bi, (bi + 1 + (i % 5)) % 6, i % 3 === 0 ? 0 : ((i * 7) % 100) / 100, out);
        take();
      }
      for (let i = 0; i < 3000; i++) {
        const t = i * 4;
        const st = ws.step(4, t, (5 + t / 100) % 24, 0.5, bi, bi, 0);
        hs.num(st.wetness).num(st.snowCover).num(st.temp).str(st.kind);
      }
    }
    for (let k = 0; k < 400; k++) {
      for (let bi = 0; bi < 6; bi++) {
        for (const p of [0, 0.1, 0.27999, 0.28, 0.38, 0.5, 0.55, 0.6, 0.66, 0.7, 0.72, 0.78, 0.82, 0.9, 0.95, 0.999]) hs.str(WeatherSystem.kindFor(BIOMES[bi].id, (p + k * 0.0025) % 1));
      }
    }
    hs.str(WeatherSystem.kindFor('nowhere', 0.6));
    for (const kind of WEATHER_KINDS) {
      for (let bi = 0; bi < 6; bi++) {
        for (const stage of [null, 0.4, 1.5, 2.6]) {
          ws.force = kind;
          ws.stage = stage;
          ws.targets(1234, 6.5, 0.3, bi, bi, 0, out);
          take();
        }
      }
    }
  }
  return hs.hex;
}

/**
 * Ask a fresh world about a place far down its road before anything else, the way a teleport or a far
 * view does: a height near the end of what the trace reads, then the places of its second half. A world
 * traced after this must hash exactly as one traced from its start ("whoever asks first" must not matter).
 */
export function askOutOfOrder(world: World, km = 60): void {
  world.heightAt((km * 1000 * 55) / 60, 40);
  world.sites.between(km * 500, (km * 1000 * 5) / 6, []);
}

/**
 * ModCar's world as the game makes it (src/game/modcar/seamless.ts: the road from the workshop's gate, the
 * yard and the proving ground as plots, a place most stretches). With `extra`, the same recipe with more
 * options laid over it: the game's own function takes only the chapter scale and the first biome.
 */
function modcar(seed: number, extra?: WorldOptions): World {
  if (!extra) return modcarWorld(seed, {}).world;
  const opts = { ...modcarWorldOptions({}), ...extra };
  const level = provingLevel(new World(seed, opts));
  return new World(seed, { ...opts, plots: [...(opts.plots ?? []), provingPlot(level)] });
}

export interface ReferenceWorld {
  /** how far down the road the trace reads (km) */
  km: number;
  /** what it is, and what it is there to pin */
  about: string;
  /** the world; `extra` options are laid over its own (a world version, a region count: for the tests of those) */
  make(extra?: WorldOptions): World;
}

/**
 * The reference worlds. The first four are Appendix A's; the others reach where those do not: chapters
 * dealt from all six kinds of country (the fifth chapter on), a sea in such a chapter, the quiet
 * stretches, frozen water, canyons, every kind of bridge, and ModCar's world far down its road.
 */
export const REFERENCE_WORLDS: Record<string, ReferenceWorld> = {
  'default-20261113': {
    km: 60,
    about: "new World(20261113, {}): the old game's world",
    make: (extra) => new World(20261113, { ...extra }),
  },
  'short-chapters-7': {
    km: 60,
    about: 'new World(7, { chapterScale: 0.2 }): twenty chapters and more in 60 km, too short for a sea',
    make: (extra) => new World(7, { chapterScale: 0.2, ...extra }),
  },
  'lakes-long-1': {
    km: 60,
    about: "new World(1, { startBiome: 'lakes', chapterScale: 2.5 }): a sea in chapter 0, on the left, its run over stretches 6–9",
    make: (extra) => new World(1, { startBiome: 'lakes', chapterScale: 2.5, ...extra }),
  },
  'modcar-20261113': {
    km: 60,
    about: 'modcarWorld(20261113, {}).world: the same chapters and landforms as the first, the road offset by its start',
    make: (extra) => modcar(20261113, extra),
  },
  'half-chapters-37': {
    km: 60,
    about: 'new World(37, { chapterScale: 0.5 }): ten chapters, all six kinds of country dealt after the fourth, a sea in chapter 5, eight quiet stretches',
    make: (extra) => new World(37, { chapterScale: 0.5, ...extra }),
  },
  'modcar-15-far': {
    km: 120,
    about: "modcarWorld(15, {}).world over 120 km: the game's own world as far as chapter 9, a sea in chapter 6",
    make: (extra) => modcar(15, extra),
  },
  'alpine-third-24': {
    km: 60,
    about: "new World(24, { startBiome: 'alpine', chapterScale: 0.35 }): fourteen chapters from another first biome, a sea in chapter 5, frozen lakes and rivers",
    make: (extra) => new World(24, { startBiome: 'alpine', chapterScale: 0.35, ...extra }),
  },
};

export const GOLDEN_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'world-golden.json');

/** the golden file's contents: one fingerprint per reference world, the weather's, and where they were taken */
export type WorldGolden = Record<string, WorldFingerprint> & { _recorded: string; _weather: string };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const all: Record<string, string | WorldFingerprint> = {
    _recorded: `node ${process.version} (${process.platform} ${process.arch}); the first four worlds are those of docs/V3/maps/world-core.md, Appendix A, and hash as recorded there at e50503c`,
    _weather: weatherTrace(),
  };
  for (const [name, ref] of Object.entries(REFERENCE_WORLDS)) all[name] = worldTrace(ref.make(), ref.km);
  const text = JSON.stringify(all, null, 2) + '\n';
  if (process.argv.includes('--write')) {
    fs.writeFileSync(GOLDEN_FILE, text);
    console.log(`wrote ${GOLDEN_FILE}`);
  }
  console.log(text);
}
