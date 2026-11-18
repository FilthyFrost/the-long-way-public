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
import { BIOME_STYLES, STYLE, chapterRun, paletteUniforms, regionStyle, showChapters, styleFromPalette, type BiomeStyle } from '../../src/game/render/style';
import { modcarWorld } from '../../src/game/modcar/seamless';
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
    const deepOf = (slot: number): number[] => paletteUniforms.uGroundPal.value[slot * 3].toArray();
    showChapters(biomeOf, 5, 5 * 8000 + 10, starts);
    for (const c of [3, 4, 5, 6]) expect(deepOf(c & 3)).toEqual(BIOME_STYLES[biomeOf(c)].ground.deep);
    showChapters(biomeOf, 5, 5 * 8000 + 6000, starts);
    for (const c of [4, 5, 6, 7]) expect(deepOf(c & 3)).toEqual(BIOME_STYLES[biomeOf(c)].ground.deep);
    // (as it was called before there were distances: the chapter behind, this one, the two ahead)
    showChapters(biomeOf, 9);
    for (const c of [8, 9, 10, 11]) expect(deepOf(c & 3)).toEqual(BIOME_STYLES[biomeOf(c)].ground.deep);
    for (let sl = 0; sl < 4; sl++) showChapters(() => 0, sl);
  });
});
