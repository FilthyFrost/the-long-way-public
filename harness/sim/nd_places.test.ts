import { describe, expect, it } from 'vitest';
import { hasItem } from '../../src/core/modcar/items';
// (the places' kitchens are the kitchen module's kinds: docs/V3/plan/growth.md §三)
import '../../src/game/modcar/v3/kitchen/index';
import { ND_BUILDINGS, furnishOf } from '../../src/core/v3/nd/cards';
import { ND_FUEL, hoseLength, pumpFound, pumpFuel, runFor } from '../../src/core/v3/nd/fuel';
import { PRY_KINDS } from '../../src/core/v3/nd/pry';
import type { PrefabThing } from '../../src/core/world/prefabs';

describe('ND5 places (core/v3/nd/cards.ts)', () => {
  it('every place the furnishing names is on its card, every kind it names is known', () => {
    for (const [id, b] of Object.entries(ND_BUILDINGS)) {
      const spots = new Set(b.geo.spots.map((s) => s.name));
      for (const f of b.furnish) {
        expect(spots.has(f.spot), `${id}: no spot ${f.spot}`).toBe(true);
        // (a line takes the first kind the catalogue knows: a fallback after it may be the game's that is not there;
        // one picking any of them by the seed must know them all, else one of them is silently never found)
        const known = (it: string): boolean => it.includes('.') || hasItem(it);
        expect(f.items.some(known), `${id}: ${f.spot}: no kind known`).toBe(true);
        if (f.any) for (const it of f.items) expect(known(it), `${id}: ${f.spot}: no kind ${it}`).toBe(true);
      }
    }
  });

  it('the five ND5 places: their sizes, their doors, their lamps (Nomad Drive\'s)', () => {
    const st = ND_BUILDINGS.station.geo;
    expect([st.w, st.d]).toEqual([28.4, 29.3]);
    // (the shop's door is never locked; the old store room's, as a locker's, a quarter of the time)
    expect(st.doors.find((d) => d.name === 'DOOR_shop')?.pry).toBe('none');
    expect(st.doors.find((d) => d.name === 'DOOR_old')?.pry).toBe('locker');
    expect(PRY_KINDS.locker.locked).toBeCloseTo(0.25, 6);
    // (its sign lit by the clock from six in the evening, striking as neon does)
    const sign = st.lamps.find((l) => l.name === 'sign');
    expect(sign?.hours).toEqual([18, 6]);
    expect(sign?.neon).toBe(true);
    // (five double-sided shelves: two shelves a face, two places to a shelf)
    expect(st.spots.filter((s) => /^sh\d[ew][mh]\d$/.test(s.name)).length).toBe(40);
    const mo = ND_BUILDINGS.motel;
    expect(mo.geo.doors.filter((d) => /^DOOR_r\d$/.test(d.name)).length).toBe(8);
    // (eleven lockers: six of one door, five of two)
    const lockers = mo.geo.doors.filter((d) => d.name.startsWith('DOOR_lk'));
    expect(lockers.length).toBe(16);
    expect(lockers.every((d) => d.pry === 'locker' && !!d.box)).toBe(true);
    expect(mo.geo.doors.filter((d) => d.name.startsWith('DOOR_eb')).every((d) => d.pry === 'stuck')).toBe(true);
    expect(mo.geo.switches.length).toBe(9);
    expect(mo.startLit).toEqual([2, 3]);
    // (the starter house's doors: never locked nor stuck; its upper floor's doors from 4.01 m)
    const sh = ND_BUILDINGS.starter.geo;
    expect(sh.doors.filter((d) => !d.name.startsWith('DOOR_eb')).every((d) => d.pry === 'none')).toBe(true);
    expect(sh.doors.find((d) => d.name === 'DOOR_bed')?.y0).toBeCloseTo(4.01, 3);
    // (its houses' doors, the tower's two upstairs among them: to the landing and to the balcony)
    expect(ND_BUILDINGS.commune.geo.doors.filter((d) => /^DOOR_h\d/.test(d.name)).length).toBe(6);
    expect(ND_BUILDINGS.camp.geo.lamps.some((l) => l.name.startsWith('fire'))).toBe(true);
  });

  it('every place\'s spots, doors and lamps have names of their own (a spot named twice is one of them lost)', () => {
    for (const [id, b] of Object.entries(ND_BUILDINGS)) {
      for (const list of [b.geo.spots, b.geo.doors, b.geo.lamps] as { name: string }[][]) {
        const seen = new Set<string>();
        for (const x of list) {
          expect(seen.has(x.name), `${id}: ${x.name} twice`).toBe(false);
          seen.add(x.name);
        }
      }
    }
  });

  it('ND7: the small places as Nomad Drive has them — the bowl always in the outhouse, the mailboxes\' tilting doors, the windmill\'s wheel, a wreck place\'s wreck', () => {
    const toilets = ND_BUILDINGS.toilets.geo;
    expect(toilets.doors.map((d) => [d.open, d.secs, d.shutSecs, d.pry])).toEqual([
      [110, 1, 1, 'stuck'],
      [110, 1, 1, 'stuck'],
    ]);
    const out: PrefabThing[] = [];
    furnishOf(ND_BUILDINGS.toilets, 1234, 0, out);
    expect(out.filter((t) => t.item === 'nd_wc').length).toBe(1);
    const mail = ND_BUILDINGS.mailboxes.geo.doors;
    expect(mail.length).toBe(8);
    expect(mail.every((d) => d.tilt && d.pry === 'stuck' && d.box && d.mat === 'metal')).toBe(true);
    expect(mail.filter((d) => d.open === 100 && d.secs === 0.45 && d.shutSecs === 0.35).length).toBe(6);
    expect(mail.filter((d) => d.open === 105 && d.secs === 0.5 && d.shutSecs === 0.4).length).toBe(2);
    const wheel = ND_BUILDINGS.windmill.geo.spins![0];
    expect([wheel.rpm, wheel.gust, wheel.gustHz, wheel.upS, wheel.downS]).toEqual([80, 0.12, 0.25, 1.5, 3]);
    expect(JSON.parse(JSON.stringify(ND_BUILDINGS.wreck1.geo.wrecks))).toEqual([{ u: 0, v: 0, yaw: -1.5708, type: 0 }]);
    expect(ND_BUILDINGS.wreck3.geo.wrecks?.[0].stripped).toBe(true);
    expect(ND_BUILDINGS.wreck2.geo.wrecks?.[0].type).toBe(1);
  });

  it('a place is furnished the same for the same seed, otherwise for another', () => {
    const a: PrefabThing[] = [];
    const b: PrefabThing[] = [];
    const c: PrefabThing[] = [];
    furnishOf(ND_BUILDINGS.motel, 1234, 0, a);
    furnishOf(ND_BUILDINGS.motel, 1234, 0, b);
    furnishOf(ND_BUILDINGS.motel, 98765, 0, c);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
    // (lodging's furniture the likelier: most rooms have their nightstand and their WC)
    expect(a.filter((t) => t.item === 'nd_wc').length).toBeGreaterThanOrEqual(5);
    // (the old game's kinds pass through as they are: the places make them ModCar's)
    const s: PrefabThing[] = [];
    for (let k = 0; k < 20; k++) furnishOf(ND_BUILDINGS.station, k * 7919, 0, s);
    expect(s.some((t) => t.item === 'fuel.jerrycan')).toBe(true);
  });
});

describe('ND5 filling station pump (core/v3/nd/fuel.ts)', () => {
  it('found between 29.7 % of fifty litres and full, the same every visit', () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let k = 0; k < 400; k++) {
      const l = pumpFound(k * 31 + 7, 5);
      lo = Math.min(lo, l);
      hi = Math.max(hi, l);
      expect(l).toBeGreaterThanOrEqual(ND_FUEL.litres * ND_FUEL.low - 0.05);
      expect(l).toBeLessThanOrEqual(ND_FUEL.litres);
    }
    expect(lo).toBeLessThan(20);
    expect(hi).toBeGreaterThan(45);
    expect(pumpFound(77, 5)).toBe(pumpFound(77, 5));
  });

  it('one station in three gives diesel', () => {
    let d = 0;
    for (let k = 0; k < 900; k++) if (pumpFuel(k * 13 + 1, 9) === 'diesel') d++;
    expect(d / 900).toBeGreaterThan(0.25);
    expect(d / 900).toBeLessThan(0.42);
  });

  it('two litres a second, no more than there is nor than there is room for; the hose never shorter than 2.1 m', () => {
    expect(runFor(1, 50, 100)).toBeCloseTo(2, 6);
    expect(runFor(1, 0.5, 100)).toBeCloseTo(0.5, 6);
    expect(runFor(1, 50, 0.3)).toBeCloseTo(0.3, 6);
    expect(runFor(1, 0, 10)).toBe(0);
    expect(hoseLength(0.5)).toBeCloseTo(2.1, 6);
    expect(hoseLength(6)).toBeCloseTo(6.12, 6);
    expect(ND_FUEL.tether).toBe(8);
  });
});
