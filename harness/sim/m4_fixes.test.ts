/**
 * The M4 fixes the player asked for (docs/V3/nodes/M4-fixes.md): the archive's recordings in place of the synthesized
 * sounds — two recordings of one name told apart by their files (the pee's start and its end), the stream heard on what
 * it falls on, a recording following a loop's rate its own way; and the walk in a living space eased round a corner into
 * the way on, not pressed to the wall.
 */
import { describe, expect, it } from 'vitest';
import { resolveCues, type CatalogEntry } from '../../src/core/audio/cueTable';
import { CUE_SPEC } from '../../src/core/audio/cueSpec';
import { cueKeys, loopPlaybackRate, peeOn } from '../../src/game/modcar/foley';
import { Walker } from '../../src/core/onboard/walker';
import { aboardOf } from '../../src/core/modcar/aboard';

const entry = (name: string, file: string): CatalogEntry => ({ kind: 'source', game: 'Arctic Drive', name, file: `Arctic Drive/02_人物/生存与动作/${file}.wav`, duration_seconds: 1 });

describe('M4 fixes · the sounds are the archive\'s', () => {
  it('two recordings of the same name are told apart by their files: the stream\'s start and its end', () => {
    const cat = [entry('audiosources_temp\\Player\\Action-Pee.wav', 'Action-Pee__w403325015'), entry('audiosources_temp\\Player\\Action-Pee.wav', 'Action-Pee__w875654566'), entry('player_action_pee_concrete.wav', 'player_action_pee_concrete__w1040497985')];
    const t = resolveCues(cat, { pee_start: CUE_SPEC.pee_start, pee_end: CUE_SPEC.pee_end, 'pee:concrete': CUE_SPEC['pee:concrete'] }, []);
    expect(t.cues.pee_start.map((f) => f.file)).toEqual(['A_lib/02_人物/生存与动作/Action-Pee__w403325015.wav']);
    expect(t.cues.pee_end.map((f) => f.file)).toEqual(['A_lib/02_人物/生存与动作/Action-Pee__w875654566.wav']);
    expect(t.cues['pee:concrete']).toHaveLength(1);
  });

  it('the stream heard on what it falls on: hard ground as concrete, boards as wood, soft ground as snow', () => {
    expect(peeOn('concrete')).toBe('concrete');
    expect(peeOn('gravel')).toBe('concrete');
    expect(peeOn('metal')).toBe('metal');
    expect(peeOn('wood')).toBe('wood');
    expect(peeOn('carpet')).toBe('wood');
    expect(peeOn('dirt')).toBe('snow');
    expect(peeOn('snow')).toBe('snow');
    expect(peeOn(undefined)).toBe('snow');
    expect(cueKeys('pee', { footing: 'dirt' })).toEqual(['pee:snow']);
    expect(cueKeys('pee', { footing: 'concrete' })).toEqual(['pee:concrete']);
  });

  it('the body, the tyres: cues the archive has (the panting, the heart, the squeal, the gravel)', () => {
    for (const cue of ['breath_fast', 'breath_slow', 'breath_end', 'heartbeat', 'pee_relief', 'skid_asphalt', 'roll_gravel', 'skid_gravel']) expect(CUE_SPEC[cue]?.length ?? 0).toBeGreaterThan(0);
  });

  it('a recording follows a loop\'s rate its own way: the asphalt\'s squeal lower for a spin, the gravel\'s crunch pitched less', () => {
    // (synthesized, as before)
    expect(loopPlaybackRate('skid_asphalt', 0.5)).toBeCloseTo(0.85, 6);
    expect(loopPlaybackRate('roll_gravel', 2)).toBeCloseTo(1.6, 6);
    // (the recordings)
    expect(loopPlaybackRate('skid_asphalt', 0.5, true)).toBeCloseTo(0.75, 6);
    expect(loopPlaybackRate('roll_gravel', 2, true)).toBeCloseTo(1.35, 6);
    // (a loop with no span of its own for a recording follows as its synthesized one does)
    expect(loopPlaybackRate('pee', 1.5, true)).toBeCloseTo(loopPlaybackRate('pee', 1.5), 9);
  });
});

describe('M4 fixes · walking about inside the motorhome', () => {
  const rv = aboardOf('rv')!;
  // (from just inside the side door, straight back: the dinette and the wardrobe are in the way, the aisle a step aside)
  const walkBack = (funnel: boolean, seconds = 3): Walker => {
    const w = new Walker(rv);
    w.funnel = funnel;
    w.place(-0.08, 0.72, Math.PI);
    for (let t = 0; t < seconds; t += 1 / 60) w.step(1 / 60, 1, 0);
    return w;
  };

  it('straight back from the door, eased round the corner into the aisle and on to the back', () => {
    const w = walkBack(true);
    expect(w.x).toBeLessThan(-2.4);
    expect(w.inside(w.x, w.z)).toBe(true);
  });

  it('without the easing (the older game), pressed to the wall at the end of the lounge, as before', () => {
    const w = walkBack(false);
    expect(w.x).toBeCloseTo(-1.35, 6);
    expect(w.z).toBeCloseTo(0.72, 6);
  });

  it('no way on within reach to either side: not eased anywhere (the walk stays where the wall stops it)', () => {
    const w = new Walker(rv);
    w.funnel = true;
    // (at the very back, walking on into the rear wall)
    w.place(-2.9, 0, Math.PI);
    w.step(1 / 60, 1, 0);
    const x = w.x;
    const z = w.z;
    for (let i = 0; i < 60; i++) w.step(1 / 60, 1, 0);
    expect(w.x).toBeCloseTo(x, 6);
    expect(Math.abs(w.z - z)).toBeLessThan(1e-9);
  });
});
