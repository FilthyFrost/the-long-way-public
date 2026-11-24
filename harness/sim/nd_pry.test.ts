// The ND prying's rules (docs/ND/PLAN.md ND3, core/v3/nd/pry.ts) at Nomad Drive's numbers: a house's door found locked
// five times in a hundred and stuck fifteen, apart and the same each time; 1.6 s a stuck one, 2.4 a locked one, 3.2 both,
// with two, three or four bites; a key opens a lock only; a crowbar is good for five.
import { describe, expect, it } from 'vitest';
import { newItem } from '../../src/core/modcar/items';
import { registerNdItems } from '../../src/core/v3/nd/items';
import { ND_CROWBAR, PRY, priesLeft, pryBites, pryFound, pryS, spendPry, unlockWithKey } from '../../src/core/v3/nd/pry';

registerNdItems();

describe('ND prying', () => {
  it('a house door is found locked 5 % of the time and stuck 15 %, rolled apart, the same each time', () => {
    let locked = 0;
    let stuck = 0;
    let both = 0;
    for (let i = 0; i < 4000; i++) {
      const s = pryFound(7, `site${i}/DOOR`, 'house');
      expect(pryFound(7, `site${i}/DOOR`, 'house')).toEqual(s);
      if (s.locked) locked++;
      if (s.stuck) stuck++;
      if (s.locked && s.stuck) both++;
    }
    expect(locked / 4000).toBeGreaterThan(0.035);
    expect(locked / 4000).toBeLessThan(0.065);
    expect(stuck / 4000).toBeGreaterThan(0.13);
    expect(stuck / 4000).toBeLessThan(0.17);
    // (apart: both about as often as the two together)
    expect(both / 4000).toBeLessThan(0.02);
    expect(pryFound(7, 'x', 'none')).toEqual({ locked: false, stuck: false });
  });

  it('pries in 1.6, 2.4 or 3.2 s, biting 2, 3 or 4 times, harder each time', () => {
    expect(pryS({ locked: false, stuck: true })).toBe(1.6);
    expect(pryS({ locked: true, stuck: false })).toBe(2.4);
    expect(pryS({ locked: true, stuck: true })).toBe(3.2);
    expect(pryS({ locked: false, stuck: false })).toBe(0);
    const b = pryBites({ locked: true, stuck: false });
    expect(b.map((x) => x.at)).toEqual([0.25, 0.5, 0.75]);
    expect(b[0].strength).toBeCloseTo(0.6, 6);
    expect(b[2].strength).toBeCloseTo(1, 6);
    // (Locked: the bites at 0.6, 1.2 and 1.8 s of its 2.4)
    b.forEach((x, i) => expect(x.at * 2.4).toBeCloseTo([0.6, 1.2, 1.8][i], 9));
    expect(pryBites({ locked: true, stuck: true }).length).toBe(4);
  });

  it('a key opens the lock only; a crowbar is good for five', () => {
    expect(unlockWithKey({ locked: true, stuck: true })).toEqual({ locked: false, stuck: true });
    const bar = newItem(ND_CROWBAR);
    expect(priesLeft(bar)).toBe(PRY.uses);
    for (let i = 0; i < 4; i++) expect(spendPry(bar)).toBe(false);
    expect(spendPry(bar)).toBe(true);
    expect(priesLeft(bar)).toBe(0);
  });
});
