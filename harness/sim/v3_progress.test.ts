/**
 * Skills and the compendium (src/core/v3/progress/progress.ts): the curve of levels, perks by level, what is
 * met and what is known, and the save's round trip.
 */
import { describe, expect, it } from 'vitest';
import { levelOf, levelShare, Progress, registerSkill, skillDef, skills, xpForLevel } from '../../src/core/v3/progress/progress';
import { SKILL_MAX_LEVEL } from '../../src/core/v3/progress/types';

registerSkill({
  id: 't_forage',
  name: { zh: '采集', en: 'Foraging' },
  perks: [
    { id: 't_forage_glow', level: 5, name: { zh: '眼尖', en: 'Sharp eyes' }, blurb: { zh: '更远就看得到微光提示。', en: 'The glint shows from further off.' } },
    { id: 't_forage_double', level: 10, name: { zh: '手熟', en: 'Practised hands' }, blurb: { zh: '有机会采到双份。', en: 'A chance of twice as much.' } },
  ],
});

describe('levels', () => {
  it('rise with experience, each asking more than the last, twenty in all', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(levelOf(0)).toBe(1);
    let prev = 0;
    let step = 0;
    for (let l = 2; l <= SKILL_MAX_LEVEL; l++) {
      const need = xpForLevel(l);
      expect(need - prev).toBeGreaterThan(step);
      step = need - prev;
      prev = need;
      expect(levelOf(need)).toBe(l);
      expect(levelOf(need - 1)).toBe(l - 1);
    }
    expect(levelOf(1e9)).toBe(SKILL_MAX_LEVEL);
    expect(levelShare(xpForLevel(4))).toBe(0);
    expect(levelShare((xpForLevel(4) + xpForLevel(5)) / 2)).toBeCloseTo(0.5, 1);
    expect(levelShare(1e9)).toBe(1);
    // the first perk within a few stops of picking, the last after a long journey
    expect(xpForLevel(5)).toBeLessThan(120);
    expect(xpForLevel(SKILL_MAX_LEVEL)).toBeGreaterThan(4000);
    expect(xpForLevel(SKILL_MAX_LEVEL)).toBeLessThan(9000);
  });
});

describe('a skill', () => {
  it('is practised, levels up, and grants its perks at their levels', () => {
    const p = new Progress();
    expect(p.level('t_forage')).toBe(1);
    expect(p.hasPerk('t_forage_glow')).toBe(false);
    expect(p.addXp('t_forage', xpForLevel(5) - 1)).toBe(3);
    expect(p.hasPerk('t_forage_glow')).toBe(false);
    expect(p.addXp('t_forage', 1)).toBe(1);
    expect(p.hasPerk('t_forage_glow')).toBe(true);
    expect(p.hasPerk('t_forage_double')).toBe(false);
    expect(p.perksAt('t_forage', 5).map((x) => x.id)).toEqual(['t_forage_glow']);
    expect(p.addXp('t_forage', 0)).toBe(0);
    expect(p.addXp('t_forage', -5)).toBe(0);
    expect(p.hasPerk('no_such_perk')).toBe(false);
    expect(skills().some((s) => s.id === 't_forage')).toBe(true);
    expect(skillDef('t_forage').perks.length).toBe(2);
    expect(() => registerSkill({ id: 't_forage', name: { zh: 'x', en: 'x' }, perks: [] })).toThrow();
  });
});

describe('the compendium', () => {
  it('remembers what was met and counts it, and what is known and how', () => {
    const p = new Progress();
    expect(p.knowledge('forage', 'porcini')).toBe(0);
    expect(p.meet('forage', 'porcini', 3, 2)).toBe(true);
    expect(p.meet('forage', 'porcini', 4)).toBe(false);
    expect(p.knowledge('forage', 'porcini')).toBe(1);
    expect(p.entry('forage', 'porcini')).toMatchObject({ count: 3, firstDay: 3, state: 1 });
    expect(p.learn('forage', 'porcini', 'taste', 4)).toBe(true);
    expect(p.learn('forage', 'porcini', 'page', 9)).toBe(false);
    expect(p.entry('forage', 'porcini')!.by).toBe('taste');
    expect(p.learn('forage', 'truffle', 'page', 5)).toBe(true);
    expect(p.tally('forage')).toEqual({ met: 2, known: 2 });
    expect(p.tally('fish')).toEqual({ met: 0, known: 0 });
  });

  it('goes through a save whole, takes back nothing unsound, and a new game starts empty', () => {
    const p = new Progress();
    expect(p.snapshot()).toBeUndefined();
    p.addXp('t_forage', 77);
    p.meet('forage', 'wild_berry', 1, 4);
    p.learn('forage', 'mint', 'skill', 2);
    const s = JSON.parse(JSON.stringify(p.snapshot()));
    const q = new Progress();
    q.restore(s);
    expect(q.snapshot()).toEqual(p.snapshot());
    expect(q.xp('t_forage')).toBe(77);
    expect(q.knowledge('forage', 'mint')).toBe(2);
    q.restore({ xp: { a: -3, b: NaN as unknown as number }, entries: [null as never, { d: 'x' } as never, { d: 'forage', id: 'ok', s: 7 as never, n: -2 }] });
    expect(q.xp('a')).toBe(0);
    expect(q.knowledge('forage', 'ok')).toBe(1);
    expect(q.entry('forage', 'ok')!.count).toBe(0);
    q.restore(undefined);
    expect(q.snapshot()).toBeUndefined();
  });
});
