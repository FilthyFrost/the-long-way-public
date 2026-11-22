/**
 * The kitchen's sounds (docs/V3/plan/cooking.md §5 "幸福感", step 4): synthesized in foley.ts, so that a game without the
 * sound archive hears them too, and the archive's recordings where it has the very thing (a pan set on a burner, a propane
 * locker, china, a journal, a pencil, the oil's flare).
 *
 * Each renders finite, unclipped and audible, and sounds like what it is: the knife's stroke short and woody, the oil's
 * flare and a pan frying bright, a pot on the boil and the flame low, the china brighter than the pan on the grate, a pot
 * that came to nothing two falling notes. In the stand-in game a meal plays them where they belong — the igniter, the
 * flare as the egg goes into the hot pan, the knife, the caddy, the china then the reveal by stars and the pencil for a new
 * recipe, the knob and the burner's pop — and the flame, the frying and the boil are loops that follow how near one is.
 */
import { describe, expect, it } from 'vitest';
import { CUE_SPEC } from '../../src/core/audio/cueSpec';
import { newItem } from '../../src/core/modcar/items';
import { newBook } from '../../src/core/v3/kitchen/book';
import { ingItem, PLATE, STOVE, VESSEL } from '../../src/core/v3/kitchen/items';
import { asksStir, fireOf, phaseOf, putVessel, takeVessel } from '../../src/core/v3/kitchen/kit';
import { FOLEY_LOOPS, FOLEY_SHOTS, foleyLevel, recipe, type FoleyLoop, type FoleyShot } from '../../src/game/modcar/foley';
import { measure, Rng } from '../../src/game/modcar/synth';
import { kitchen } from '../../src/game/modcar/v3/kitchen/index';
import { kitchenRig } from './v3/kitchenRig';

const SHOTS: FoleyShot[] = ['chop', 'sizzle_in', 'plop', 'toss', 'toss_dry', 'stir', 'shake', 'ignite', 'knob_click', 'flame_out', 'pan_place', 'pan_lift', 'stove_cover_open', 'stove_cover_close', 'canister_in', 'canister_out', 'plate_clink', 'dish_fail', 'book_open', 'book_close', 'book_page', 'book_write'];
const LOOPS: FoleyLoop[] = ['flame_gas', 'sizzle', 'boil', 'kettle_whistle'];
const sr = 48000;
const render = (k: FoleyShot | FoleyLoop, seed = 1234): Float32Array => recipe(k)(sr, new Rng(seed));
/** the share of a sound's energy in its first fraction */
function front(x: Float32Array, part = 0.2): number {
  let e = 0;
  let e1 = 0;
  for (let i = 0; i < x.length; i++) {
    e += x[i] * x[i];
    if (i < x.length * part) e1 += x[i] * x[i];
  }
  return e1 / e;
}
/** when the loudest 10 ms of a sound begins (s) */
function loudestAt(x: Float32Array): number {
  const w = Math.floor(0.01 * sr);
  let best = 0;
  let at = 0;
  for (let i = 0; i + w <= x.length; i += w) {
    let s = 0;
    for (let j = 0; j < w; j++) s += x[i + j] * x[i + j];
    if (s > best) {
      best = s;
      at = i / sr;
    }
  }
  return at;
}

describe('the kitchen’s sounds', () => {
  it('are in the catalogue with a level, render finite, unclipped and audible, and the loops wrap without a click', () => {
    for (const k of SHOTS) expect(FOLEY_SHOTS, k).toContain(k);
    for (const k of LOOPS) expect(FOLEY_LOOPS, k).toContain(k);
    for (const k of [...SHOTS, ...LOOPS]) {
      expect(foleyLevel(k), k).toBeGreaterThan(0);
      expect(foleyLevel(k), k).toBeLessThanOrEqual(1);
      for (const seed of [1, 1234, 777]) {
        const x = render(k, seed);
        let bad = 0;
        for (const v of x) if (!Number.isFinite(v)) bad++;
        expect(bad, k).toBe(0);
        const m = measure(x, sr);
        expect(m.peak, k).toBeLessThanOrEqual(1.0001);
        expect(m.rms, k).toBeGreaterThan(0.01);
        expect(x.length / sr, k).toBeLessThan(4);
      }
    }
    for (const k of LOOPS) {
      const x = render(k);
      const steps = new Float32Array(x.length - 1);
      for (let i = 1; i < x.length; i++) steps[i - 1] = Math.abs(x[i] - x[i - 1]);
      steps.sort();
      expect(Math.abs(x[0] - x[x.length - 1]), k).toBeLessThan(Math.max(1.05 * steps[Math.floor(steps.length * 0.999)], 0.002));
    }
    // (the flame is a bed under the rest: quieter than the frying and the boil)
    expect(foleyLevel('flame_gas')).toBeLessThan(Math.min(foleyLevel('sizzle'), foleyLevel('boil')));
  });

  it('sound like what they are', () => {
    const c = (k: FoleyShot | FoleyLoop): number => measure(render(k), sr).centroid;
    // the knife: short, its energy at once, a woody tok (low hundreds to a couple of kHz)
    const chop = render('chop');
    expect(chop.length / sr).toBeLessThan(0.3);
    expect(front(chop)).toBeGreaterThan(0.8);
    expect(c('chop')).toBeGreaterThan(700);
    expect(c('chop')).toBeLessThan(2500);
    // hot oil is bright; water and the flame are low
    expect(c('sizzle_in')).toBeGreaterThan(3500);
    expect(c('sizzle')).toBeGreaterThan(3500);
    for (const k of ['boil', 'plop', 'flame_gas'] as const) expect(c(k), k).toBeLessThan(1200);
    // the oil flares at once and dies back
    expect(front(render('sizzle_in'), 0.3)).toBeGreaterThan(0.5);
    // china rings brighter than a pan on the grate
    expect(c('plate_clink')).toBeGreaterThan(c('pan_place') * 1.5);
    // a stroke of the pencil is paper and graphite: bright, quiet, spread out over the line
    expect(c('book_write')).toBeGreaterThan(2500);
    expect(front(render('book_write'))).toBeLessThan(0.5);
    // the failed dish: two notes, the second the louder, and the same every time (it is tuned)
    expect(loudestAt(render('dish_fail'))).toBeGreaterThan(0.18);
    expect(c('dish_fail')).toBeLessThan(1000);
    // the igniter's snap comes before the gas catches
    expect(loudestAt(render('ignite'))).toBeGreaterThan(0.06);
  });

  it('use the archive’s recordings of the very things it has', () => {
    for (const k of ['pan_place', 'pan_lift', 'stove_cover_open', 'stove_cover_close', 'canister_in', 'plate_clink', 'book_open', 'book_close', 'book_write', 'sizzle_in']) {
      expect(CUE_SPEC[k]?.length ?? 0, k).toBeGreaterThan(0);
    }
    // (a grunt over a failed dish: the archive's alone, no synthesized one)
    expect(CUE_SPEC.yuck?.length).toBeGreaterThan(0);
    expect(FOLEY_SHOTS as readonly string[]).not.toContain('yuck');
  });

  it('a meal in the stand-in game: each sound where it belongs, the loops by how near one is', async () => {
    kitchen.book = newBook();
    const rig = await kitchenRig();
    rig.button('摆一套厨房');
    rig.frames(2);
    // the kitchen's sounds made ready as soon as cookware is near
    for (const k of ['chop', 'sizzle_in', 'ignite', 'plate_clink', 'flame_gas', 'sizzle', 'boil', 'yuck']) expect(rig.game.warmed.has(k), k).toBe(true);
    const stove = rig.unit(STOVE);
    const heard = (): string[] => rig.game.sounds.splice(0);
    heard();
    // lit: the igniter; nothing frying yet, only the flame
    rig.empty();
    rig.aim(stove, 'knob');
    rig.pressE();
    expect(heard()).toContain('ignite');
    expect([...rig.game.loops.keys()]).toEqual(['flame_gas']);
    expect(rig.game.loops.get('flame_gas')).toBeCloseTo(1, 2);
    // an egg into the hot pan: the oil flares, and it fries
    rig.give(newItem(ingItem('egg')));
    rig.aim(stove, 'top');
    rig.pressE();
    expect(heard()).toContain('sizzle_in');
    expect(rig.game.loops.get('sizzle')).toBeGreaterThan(0.5);
    // the caddy
    rig.empty();
    rig.aim(rig.unit('kit_spice'));
    rig.pressE();
    expect(heard()).toContain('shake');
    // a low flame: the knob, and everything quieter
    const before = rig.game.loops.get('sizzle')!;
    rig.aim(stove, 'knob');
    rig.tapF();
    expect(fireOf(stove.item)).toBe(1);
    expect(heard()).toContain('knob_click');
    expect(rig.game.loops.get('sizzle')).toBeLessThan(before);
    rig.tapF();
    // the toss when it asks
    for (let t = 0; t < 900 && !asksStir(stove.item); t++) rig.frames(1, 1 / 30);
    rig.aim(stove, 'top');
    rig.pressE();
    expect(heard()).toContain('toss');
    // walked off: the loops fade out; back: they are there again
    const w = rig.player.walker;
    const at = { x: w.x, z: w.z };
    w.place(at.x - 9, at.z, 0);
    rig.frames(2);
    expect(rig.game.loops.size).toBe(0);
    w.place(at.x, at.z, 0);
    rig.frames(2);
    expect(rig.game.loops.has('flame_gas')).toBe(true);
    // dished up when just right: the china, then the reveal by its stars, then the pencil (a new recipe)
    for (let t = 0; t < 900 && phaseOf(stove.item) !== 'right'; t++) rig.frames(1, 1 / 30);
    heard();
    rig.give(newItem(PLATE));
    rig.aim(stove, 'top');
    rig.pressE();
    expect(heard()).toEqual(['plate_clink']);
    rig.pass(0.4);
    expect(heard().some((s) => /^loot_reveal_[1-5]$/.test(s))).toBe(true);
    rig.pass(1);
    expect(heard()).toContain('book_write');
    // the flame off: the burner's pop, no loops
    rig.empty();
    rig.aim(stove, 'knob');
    rig.pressE();
    expect(heard()).toContain('flame_out');
    expect(rig.game.loops.size).toBe(0);
    // the pan off and on again: the grate
    rig.aim(stove, 'top');
    rig.tapF();
    expect(heard()).toContain('pan_lift');
    rig.aim(stove, 'top');
    rig.pressE();
    expect(heard()).toContain('pan_place');
    // a pot of water on the flame: the potato plops in, and it comes to the boil
    const pan = takeVessel(stove.item)!;
    expect(pan.item).toBe(VESSEL.fry);
    putVessel(stove.item, newItem(VESSEL.boil));
    rig.aim(stove, 'knob');
    rig.pressE();
    heard();
    rig.empty();
    rig.give(newItem(ingItem('potato')));
    rig.aim(stove, 'top');
    rig.pressE();
    expect(heard()).toContain('plop');
    const first = rig.game.loops.get('boil')!;
    expect(first).toBeGreaterThan(0);
    rig.pass(6);
    expect(rig.game.loops.get('boil')).toBeGreaterThan(first);
    expect(rig.game.loops.has('sizzle')).toBe(false);
  });

  it('a pot that came to nothing: the china and the falling notes; eaten, a grunt', async () => {
    kitchen.book = newBook();
    const rig = await kitchenRig();
    rig.button('摆一套厨房');
    rig.frames(2);
    const stove = rig.unit(STOVE);
    for (const id of ['milk', 'salmon']) {
      rig.empty();
      rig.give(newItem(ingItem(id)));
      rig.aim(stove, 'top');
      rig.pressE();
    }
    rig.empty();
    rig.aim(stove, 'knob');
    rig.pressE();
    for (let t = 0; t < 900 && phaseOf(stove.item) !== 'right'; t++) {
      rig.frames(1, 1 / 30);
      if (asksStir(stove.item)) {
        rig.aim(stove, 'top');
        rig.pressE();
      }
    }
    rig.game.sounds.splice(0);
    rig.give(newItem(PLATE));
    rig.aim(stove, 'top');
    rig.pressE();
    rig.pass(0.4);
    const s = rig.game.sounds.splice(0);
    expect(s[0]).toBe('plate_clink');
    expect(s).toContain('dish_fail');
    expect(s.some((x) => x.startsWith('loot_reveal'))).toBe(false);
    const mess = rig.held()!;
    rig.empty();
    rig.game.events.emit('body:ate', { item: mess });
    expect(rig.game.sounds).toContain('yuck');
  });
});
