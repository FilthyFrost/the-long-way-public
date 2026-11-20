/**
 * What the render side knows of a region (docs/V3/nodes/W1-worldgen.md step W1.3): every region of the registry
 * has a painted look, the first six their own entry of the art spec and every later one a look made from its
 * row of the palette table over its kin's; and whatever is looked up by a region's id falls back to the
 * region's KIN, never to the plains — whose plants it grows, how wooded it is, the air over it.
 *
 * The dummy regions are put into the registry by `registerRegion` and taken out again; the game's own added
 * regions are covered by the loops over BIOMES, however many there are.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { SkyState, DayClock } from '../../src/core/env/time';
import { WeatherState } from '../../src/core/env/weather';
import { BIOMES, BIOME_INDEX, registerRegion, type RegionDef } from '../../src/core/world/biomes';
import { Look, computeLook } from '../../src/game/env/colorScript';
import { BIOME_STYLES, STYLE, chapterRun, paletteUniforms, regionStyle, setSlotBiome, showChapters, styleFromPalette, type BiomeStyle } from '../../src/game/render/style';
import { GLSL_PAINT } from '../../src/game/render/paint';
import { riserFor, terrace } from '../../src/core/world/operators';
import { modcarWorld } from '../../src/game/modcar/seamless';
import { nextChapterOf } from '../../src/game/modcar/devJourney';
import { GROUND_FAR, GROUND_PAINT, ON_LANDFORM } from '../../src/game/render/terrainMaterials';
import { groundAttrs } from '../../src/game/scene/worldBuild';
import { SpineSample } from '../../src/core/world/spine';
import { TerrainPoint } from '../../src/core/world/terrain';
import { PAL, PALETTES, floraOf, paletteOf, woodland, type BiomePalette } from '../../src/game/scene/palette';

const SIX = ['plains', 'desert', 'alpine', 'forest', 'lakes', 'maple'];
const KINS = ['plains', 'desert', 'alpine'] as const;
type RGB = [number, number, number];
const luma = (c: RGB): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** a region that is its kin in everything the core says of it, under an id nothing on the render side has heard of */
const dummy = (kin: (typeof KINS)[number], id = `test_${kin}`): RegionDef => ({ ...BIOMES[BIOME_INDEX[kin]], id, label: `${kin} dummy`, kin });

const undo: (() => void)[] = [];
/** put a region at the end of the registry until the test is over; its index */
function put(def: RegionDef): number {
  undo.push(registerRegion(def));
  return BIOMES.length - 1;
}
afterEach(() => {
  while (undo.length) undo.pop()!();
});

describe('the palette table', () => {
  it('has a row for every region of the registry, the three kins among them', () => {
    for (const b of BIOMES) expect(paletteOf(b), `a row for ${b.id}`).toBeDefined();
    for (const k of KINS) expect(PALETTES[k]).toBeDefined();
    // (the first renderer's palette, kept in step: one entry to a region)
    expect(PAL).toHaveLength(BIOMES.length);
  });

  it('holds colours only: three ground tones, a dust, two rocks, a forest tint, crowns and a trunk', () => {
    const hex = (c: unknown): boolean => typeof c === 'number' && Number.isInteger(c) && c >= 0 && c <= 0xffffff;
    for (const [id, row] of Object.entries(PALETTES)) {
      expect(row.ground, id).toHaveLength(3);
      for (const c of [...row.ground, row.dust, row.rock, row.rock2, row.forest, ...row.crowns, row.trunk, ...(row.flowers ?? [])]) expect(hex(c), `${id}: ${String(c)}`).toBe(true);
      expect(row.crowns.length, id).toBeGreaterThanOrEqual(3);
    }
  });

  it('a region without a row has none, whatever Object carries under its name', () => {
    expect(paletteOf(dummy('desert'))).toBeUndefined();
    expect(paletteOf(dummy('plains', 'constructor'))).toBeUndefined();
  });
});

describe('the painted look of a region', () => {
  it('is its own entry of the art spec for the first six', () => {
    for (const id of SIX) {
      expect(regionStyle(BIOMES[BIOME_INDEX[id]])).toBe(STYLE.biomes[id]);
      expect(BIOME_STYLES[BIOME_INDEX[id]]).toBe(STYLE.biomes[id]);
    }
    expect(BIOME_STYLES).toHaveLength(BIOMES.length);
  });

  it('is its kin\'s look for a region with no row: a copy of it, and never the plains\' for want of an entry', () => {
    for (const kin of KINS) {
      const st = regionStyle(dummy(kin));
      expect(st).toEqual(STYLE.biomes[kin]);
      expect(st).not.toBe(STYLE.biomes[kin]);
    }
    expect(regionStyle(dummy('desert')).strata).toBe(1);
    expect(regionStyle(dummy('alpine')).snow).toBe(1);
  });

  it('made from a row equal to its kin\'s is the kin\'s look to the last figure', () => {
    for (const kin of KINS) expect(styleFromPalette(PALETTES[kin], PALETTES[kin], STYLE.biomes[kin])).toEqual(STYLE.biomes[kin]);
  });

  it('made from a row follows the row: a redder rock is redder, a darker earth darker, its own flowers and numbers its own', () => {
    const kin = STYLE.biomes.plains;
    const row: BiomePalette = { ...PALETTES.plains, rock: 0xb85a3c, rock2: 0x9c4630, dust: 0x5a4632, flowers: [0xff0000, 0x00ff00, 0x0000ff], look: { flowerAmount: 0.25, dryness: 0.5 } };
    const st = styleFromPalette(row, PALETTES.plains, kin);
    // the rock: more red to its green than the plains' grey, in the light and in the shade
    expect(st.rock.lit[0] / st.rock.lit[1]).toBeGreaterThan(2 * (kin.rock.lit[0] / kin.rock.lit[1]));
    expect(st.rock.shade[0] / st.rock.shade[1]).toBeGreaterThan(2 * (kin.rock.shade[0] / kin.rock.shade[1]));
    expect(luma(st.dry)).toBeLessThan(0.4 * luma(kin.dry));
    expect(st.flowers).toEqual([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
    expect(st.flowerAmount).toBe(0.25);
    expect(st.dryness).toBe(0.5);
    // what the row does not speak of is the kin's: the ground, the woods, the patches, the far lift, the other numbers
    expect(st.ground).toEqual(kin.ground);
    expect(st.forest).toEqual(kin.forest);
    expect(st.patchWarm).toBe(kin.patchWarm);
    expect(st.farLift).toBe(kin.farLift);
    expect(st.grassGrow).toBe(kin.grassGrow);
    // and the kin's own look is not touched
    expect(STYLE.biomes.plains.flowerAmount).toBe(1);
  });

  it('a row far off its kin\'s cannot blow a paint out', () => {
    const wild: BiomePalette = { ground: [0xffffff, 0xffffff, 0x000000], dust: 0xffffff, rock: 0x000000, rock2: 0xffffff, forest: 0xffffff, crowns: [0x000000, 0xffffff, 0xffffff], trunk: 0 };
    for (const kin of KINS) {
      const st = styleFromPalette(wild, PALETTES[kin], STYLE.biomes[kin]);
      const paints: RGB[] = [st.ground.deep, st.ground.mid, st.ground.lit, st.dry, ...st.forest, st.rock.lit, st.rock.shade];
      for (const c of paints) for (const v of c) expect(v >= 0 && v <= 1 && Number.isFinite(v)).toBe(true);
      // (no more than four times the kin's paint, no less than a quarter)
      expect(st.rock.lit[0]).toBeCloseTo(STYLE.biomes[kin].rock.lit[0] / 4, 3);
    }
  });

  it('every region of the registry has a look whose paints run from shade to light', () => {
    const check = (id: string, st: BiomeStyle): void => {
      expect(luma(st.ground.deep), `${id}: ground shade under middle`).toBeLessThan(luma(st.ground.mid));
      expect(luma(st.ground.mid), `${id}: ground middle under light`).toBeLessThan(luma(st.ground.lit));
      expect(luma(st.rock.shade), `${id}: rock shade under light`).toBeLessThan(luma(st.rock.lit));
      for (let i = 0; i < 3; i++) expect(luma(st.forest[i]), `${id}: wood paint ${i} under ${i + 1}`).toBeLessThan(luma(st.forest[i + 1]));
      // (no dead black, no paint beyond white: STYLE.md section 3)
      for (const c of [st.ground.deep, st.ground.mid, st.ground.lit, st.dry, ...st.forest, st.rock.lit, st.rock.shade, ...st.flowers]) for (const v of c) expect(v >= 0 && v <= 1, `${id}: ${String(v)}`).toBe(true);
      expect(luma(st.ground.deep), `${id}: the ground's shade is a colour, not black`).toBeGreaterThan(0.05);
    };
    for (let i = 0; i < BIOMES.length; i++) check(BIOMES[i].id, BIOME_STYLES[i]);
    // and so has every row of the table over each kin it might be given, whether its region is registered yet or not
    for (const [id, row] of Object.entries(PALETTES)) if (!SIX.includes(id)) for (const kin of KINS) check(`${id} over ${kin}`, styleFromPalette(row, PALETTES[kin], STYLE.biomes[kin]));
  });

  it('a region added to the registry looks unlike its neighbours of the same kin: its ground\'s light paint is its own', () => {
    const later = BIOMES.map((b, i) => ({ b, st: BIOME_STYLES[i] })).filter((x) => !SIX.includes(x.b.id));
    for (const a of later) {
      for (const o of BIOMES.map((b, i) => ({ b, st: BIOME_STYLES[i] }))) {
        if (o.b === a.b) continue;
        const d = Math.hypot(a.st.ground.lit[0] - o.st.ground.lit[0], a.st.ground.lit[1] - o.st.ground.lit[1], a.st.ground.lit[2] - o.st.ground.lit[2]) + Math.hypot(a.st.rock.lit[0] - o.st.rock.lit[0], a.st.rock.lit[1] - o.st.rock.lit[1], a.st.rock.lit[2] - o.st.rock.lit[2]);
        expect(d, `${a.b.id} against ${o.b.id}`).toBeGreaterThan(0.03);
      }
    }
  });
});

describe('what is looked up by a region\'s id falls back to its kin', () => {
  it('whose plants a region grows: its own for the first six, its kin\'s for any other', () => {
    for (const id of SIX) expect(floraOf(BIOME_INDEX[id])).toBe(id);
    for (const kin of KINS) expect(floraOf(put(dummy(kin)))).toBe(kin);
    // (every region of the registry: one of the six sets of rules)
    for (let i = 0; i < BIOMES.length; i++) expect(SIX).toContain(floraOf(i));
    for (let i = 0; i < BIOMES.length; i++) if (!SIX.includes(BIOMES[i].id)) expect(floraOf(i)).toBe(BIOMES[i].kin);
  });

  it('and is asked again when another region stands at that index', () => {
    const i = put(dummy('desert'));
    expect(floraOf(i)).toBe('desert');
    undo.pop()!();
    expect(put(dummy('alpine'))).toBe(i);
    expect(floraOf(i)).toBe('alpine');
  });

  it('how wooded the land is: a region nothing knows is as wooded as its kin, spot for spot', () => {
    const spots: [number, number, number, number][] = [];
    for (let k = 0; k < 400; k++) spots.push([k * 137.5 - 9000, (k * 71.3) % 2400 - 1200, 12 + ((k * 53) % 900), (k * 29) % 260]);
    for (const kin of KINS) {
      const i = put(dummy(kin));
      let wooded = 0;
      for (const [x, z, ad, relief] of spots) {
        const want = woodland(BIOME_INDEX[kin], 77, x, z, ad, relief);
        expect(woodland(i, 77, x, z, ad, relief)).toBe(want);
        expect(woodland(i, 77, x, z, ad, relief, false)).toBe(woodland(BIOME_INDEX[kin], 77, x, z, ad, relief, false));
        if (want > 0) wooded++;
      }
      // (the comparison is of something: each kin has wood at some of the spots)
      expect(wooded).toBeGreaterThan(0);
    }
    // the dry kin's scrub is not the green kin's woods: a region of the dry kin taken for the plains would show here
    const dry = put(dummy('desert', 'test_dry2'));
    expect(spots.some(([x, z, ad, relief]) => woodland(dry, 77, x, z, ad, relief) !== woodland(BIOME_INDEX.plains, 77, x, z, ad, relief))).toBe(true);
  });

  it('the air over a region: its own row for the first six, its kin\'s for any other, never the plains\' for a dry or a cold one', () => {
    const sky = new SkyState();
    DayClock.skyAtHour(15, 58, sky);
    const w = new WeatherState();
    const at = (a: string, b = a, t = 0): { haze: number; horizon: number[]; zenith: number[] } => {
      const look = new Look();
      computeLook(sky, w, a, b, t, look);
      return { haze: look.haze, horizon: look.horizon.toArray(), zenith: look.zenith.toArray() };
    };
    for (const kin of KINS) {
      put(dummy(kin));
      expect(at(`test_${kin}`)).toEqual(at(kin));
    }
    expect(at('test_desert')).not.toEqual(at('plains'));
    expect(at('test_alpine')).not.toEqual(at('plains'));
    // across a border the two airs mix, each its own
    expect(at('test_desert', 'test_alpine', 0.5)).toEqual(at('desert', 'alpine', 0.5));
    // every region of the registry has an air (an id nothing knows is the first region's)
    for (const b of BIOMES) expect(Number.isFinite(at(b.id).haze)).toBe(true);
    expect(at('no such region')).toEqual(at(BIOMES[0].id));
  });
});

describe('the four palette slots', () => {
  const run = { from: 0, to: 0 };
  /** the nearest land (m of road) a run of four chapters leaves without a slot of its own */
  const leftOut = (from: number, to: number, s: number, starts: readonly number[]): number => Math.min(from > 0 ? s - starts[from] : Infinity, starts[to + 1] - s);

  it('hold the chapter behind, this one and the two ahead where nothing says how far the chapters are, and in the first two chapters', () => {
    const starts = [0, 8000, 16000, 24000, 32000, 40000, 48000, 56000];
    for (const c of [0, 1, 2, 5, 40]) {
      chapterRun(c, 123, null, run);
      expect(run).toEqual({ from: Math.max(0, c - 1), to: c + 2 });
    }
    for (const s of [0, 100, 7999]) {
      chapterRun(0, s, starts, run);
      expect(run).toEqual({ from: 0, to: 2 });
    }
    chapterRun(1, 8001, starts, run);
    expect(run).toEqual({ from: 0, to: 3 });
    // (a plan not dealt far enough, a place that is no number: the plain run)
    chapterRun(5, 40100, starts.slice(0, 7), run);
    expect(run).toEqual({ from: 4, to: 7 });
    chapterRun(3, NaN, starts, run);
    expect(run).toEqual({ from: 2, to: 5 });
  });

  it('in the first part of a chapter hold the two behind instead, and change over once, where both are as far off as they get', () => {
    const L = 8000;
    const starts = Array.from({ length: 12 }, (_, i) => i * L);
    chapterRun(5, 5 * L + 10, starts, run);
    expect(run).toEqual({ from: 3, to: 6 });
    chapterRun(5, 5 * L + 0.7 * L, starts, run);
    expect(run).toEqual({ from: 4, to: 7 });
    let changes = 0;
    let was = 3;
    for (let s = 5 * L; s < 6 * L; s += 50) {
      chapterRun(5, s, starts, run);
      expect(run.to - run.from).toBe(3);
      if (run.from !== was) {
        changes++;
        was = run.from;
        // half way through: the chapter two behind and the chapter two ahead are each a chapter and a half off
        expect(s).toBeGreaterThanOrEqual(5 * L + L / 2);
        expect(s).toBeLessThan(5 * L + L / 2 + 100);
      }
    }
    expect(changes).toBe(1);
  });

  it('on worlds of version 2 leave no land within eleven kilometres of road without its own palette, where the plain run leaves it at seven and a half', () => {
    let nearest = Infinity;
    let plain = Infinity;
    for (const seed of [1, 7, 4242]) {
      const plan = modcarWorld(seed, { worldVersion: 2 }).world.spine.plan;
      for (let s = 0; s < 400_000; s += 125) {
        const c = plan.chapterAt(s);
        plan.biomeOf(c + 3);
        chapterRun(c, s, plan.starts, run);
        // four chapters in a row, the one the traveller is in among them
        expect(run.to - run.from).toBe(c < 1 ? 2 : 3);
        expect(run.from <= c && c <= run.to).toBe(true);
        const d = leftOut(run.from, run.to, s, plan.starts);
        const other = leftOut(Math.max(0, c - 1), c + 2, s, plan.starts);
        expect(d).toBeGreaterThanOrEqual(other);
        nearest = Math.min(nearest, d);
        plain = Math.min(plain, other);
      }
    }
    expect(nearest).toBeGreaterThanOrEqual(11_000);
    expect(plain).toBeLessThan(7_600);
  });

  it('are loaded with the palettes of that run, each chapter in the slot of its number', () => {
    const starts = Array.from({ length: 12 }, (_, i) => i * 8000);
    const biomeOf = (c: number): number => c % BIOMES.length;
    // (a flat vec3 array, in the GPU's single precision)
    const deepOf = (slot: number): number[] => Array.from(paletteUniforms.uGroundPal.value.subarray(slot * 9, slot * 9 + 3));
    showChapters(biomeOf, 5, 5 * 8000 + 10, starts);
    for (const c of [3, 4, 5, 6]) expect(deepOf(c & 3)).toEqual(BIOME_STYLES[biomeOf(c)].ground.deep.map(Math.fround));
    showChapters(biomeOf, 5, 5 * 8000 + 6000, starts);
    for (const c of [4, 5, 6, 7]) expect(deepOf(c & 3)).toEqual(BIOME_STYLES[biomeOf(c)].ground.deep.map(Math.fround));
    // (as it was called before there were distances: the chapter behind, this one, the two ahead)
    showChapters(biomeOf, 9);
    for (const c of [8, 9, 10, 11]) expect(deepOf(c & 3)).toEqual(BIOME_STYLES[biomeOf(c)].ground.deep.map(Math.fround));
    for (let sl = 0; sl < 4; sl++) showChapters(() => 0, sl);
  });
});

describe('an anchored landform in the ground\'s paint', () => {
  const tp = new TerrainPoint();
  const st = new SpineSample();
  const bw = new Float32Array(4);
  const gd = new Float32Array(4);

  it('a point where none stands is handed to the paint as it always was, and a world of version 1 has none', () => {
    const w = modcarWorld(7, {}).world;
    let n = 0;
    for (let s = 500; s < 60_000; s += 370) {
      w.spine.at(s, st);
      for (const d of [-600, -140, -30, 0, 12, 90, 450]) {
        const x = st.x - Math.sin(st.phi) * d;
        const z = st.z + Math.cos(st.phi) * d;
        w.shape(x, z, tp);
        expect(tp.landform).toBe(0);
        groundAttrs(w.seed, tp, x, z, bw, gd, 0);
        expect(gd[0]).toBe(Math.fround(Math.min(Math.abs(tp.d), GROUND_FAR)));
        expect(gd[1]).toBe(Math.fround(tp.relief));
        n++;
      }
    }
    expect(n).toBeGreaterThan(1000);
  });

  it('a point on one says so by a road distance no land has, the more the higher it has risen, and its height is in the relief', () => {
    if (BIOME_INDEX.karst_peaks === undefined) return;
    const w = modcarWorld(7, { worldVersion: 2 }).world;
    const stop = nextChapterOf(w, BIOME_INDEX.karst_peaks, 0)!;
    expect(stop).not.toBeNull();
    let high = 0;
    let foot = 0;
    let off = 0;
    for (let s = stop.start + 600; s < stop.start + stop.length - 600; s += 45) {
      w.spine.at(s, st);
      for (let d = -700; d <= 700; d += 35) {
        if (Math.abs(d) < 40) continue;
        const x = st.x - Math.sin(st.phi) * d;
        const z = st.z + Math.cos(st.phi) * d;
        w.shape(x, z, tp);
        groundAttrs(w.seed, tp, x, z, bw, gd, 0);
        const ad = Math.min(Math.abs(tp.d), GROUND_FAR);
        expect(gd[1]).toBe(Math.fround(tp.relief + tp.landform));
        if (tp.landform >= 4) {
          high++;
          expect(gd[0]).toBe(Math.fround(ad + ON_LANDFORM));
        } else if (tp.landform > 0) {
          foot++;
          expect(gd[0]).toBeGreaterThan(ad);
          expect(gd[0]).toBeLessThan(ad + ON_LANDFORM);
        } else {
          off++;
          expect(gd[0]).toBe(Math.fround(ad));
        }
      }
    }
    // (karst country: towers beside the road in most stretches, and open floor between them)
    expect(high).toBeGreaterThan(50);
    expect(off).toBeGreaterThan(high);
    expect(foot).toBeGreaterThan(0);
  });

  it('is read back by the paint from that distance: nothing of it below the furthest road distance, all of it at the mark', () => {
    // (the two numbers the paint's own line is written with)
    expect(GROUND_PAINT).toContain(`(g.x - ${GROUND_FAR.toFixed(1)}) / ${(ON_LANDFORM - GROUND_FAR).toFixed(1)}`);
    const onForm = (gx: number): number => Math.min(1, Math.max(0, (gx - GROUND_FAR) / (ON_LANDFORM - GROUND_FAR)));
    expect(onForm(0)).toBe(0);
    expect(onForm(GROUND_FAR)).toBe(0);
    expect(onForm(GROUND_FAR + ON_LANDFORM)).toBe(1);
    expect(onForm(40 + ON_LANDFORM)).toBeGreaterThan(0.99);
    // half way up the foot of a landform 300 m from the road: about half
    expect(onForm(300 + ON_LANDFORM / 2)).toBeGreaterThan(0.4);
    expect(onForm(300 + ON_LANDFORM / 2)).toBeLessThan(0.6);
  });
});

describe('the risers of a terraced region in the ground\'s paint', () => {
  it('a slot is told how fully its region\'s slopes are cut into benches and how far apart they lie, from the core\'s own numbers', () => {
    // (a flat vec4 array, in the GPU's single precision)
    const misc = (slot: number): number[] => Array.from(paletteUniforms.uBiomeMisc2.value.subarray(slot * 4, slot * 4 + 4));
    for (let i = 0; i < BIOMES.length; i++) {
      setSlotBiome(3, i);
      const cut = BIOMES[i].land?.terrace;
      expect(misc(3)[2]).toBe(Math.fround(cut ? cut.strength : 0));
      expect(misc(3)[3]).toBe(Math.fround(cut ? cut.strength * cut.step : 0));
    }
    // none of the first six has terraces: every world of version 1 is painted without them
    for (const id of SIX) {
      setSlotBiome(3, BIOME_INDEX[id]);
      expect(misc(3).slice(2)).toEqual([0, 0]);
    }
    const benched = put({ ...dummy('plains', 'test_benched'), land: { odds: { hillside: 1 }, size: {}, terrace: { step: 6, strength: 0.5 } } });
    setSlotBiome(3, benched);
    expect(misc(3).slice(2)).toEqual([0.5, 3]);
    setSlotBiome(3, 0);
    // the paint reads them back, the step whole where a terraced region blends into one without
    expect(GLSL_PAINT).toContain('p.terrace = uBiomeMisc2[0].z * bw[0]');
    expect(GLSL_PAINT).toContain('/ max(p.terrace, 1e-4)');
  });

  it('the band the paint lays lies on the riser the core cuts, and never on the bench', () => {
    // (the paint's own line: the middle of the band 0.78 of a step up, 0.13 of a step to either side)
    expect(GROUND_PAINT).toContain('abs(fract(tu - 0.28) - 0.5)');
    expect(GROUND_PAINT).toContain('smoothstep(0.13 - tfw, 0.13 + tfw');
    const inBand = (f: number): boolean => Math.abs((((f - 0.28) % 1) + 1) % 1 - 0.5) < 0.13;
    const step = 4;
    // the riser's share of a step on the slopes that are benched at all (operators.ts riserFor, with the margin the land adds)
    for (const slope of [0.34, 0.42, 0.5, 0.62]) {
      const r = riserFor(slope);
      for (const band of [3, -2, 40]) {
        const at = (f: number): number => terrace((band + f) * step, step, 1, r);
        // on the bench — level ground — the paint lays nothing
        for (let f = 0; f < 1 - r - 0.02; f += 0.01) {
          expect(at(f)).toBeCloseTo(band * step, 9);
          expect(inBand(f), `slope ${slope}: paint on the bench at ${f.toFixed(2)} of a step`).toBe(false);
        }
        // where it lays its band the land is climbing
        for (let f = 0.66; f <= 0.9; f += 0.02) {
          expect(inBand(f)).toBe(true);
          if (f > 1 - r + 0.02) expect(at(f + 0.01)).toBeGreaterThan(at(f));
        }
        // and the bench above is clear of it again
        expect(inBand(0)).toBe(false);
        expect(inBand(0.999)).toBe(false);
      }
    }
  });
});
