import { describe, expect, it } from 'vitest';
import { cleanItem, newItem } from '../../src/core/modcar/items';
import { COOLER } from '../../src/core/v3/kitchen/items';
import { ND_CHEST } from '../../src/core/v3/nd/dig';
import { ND_FRIDGE, ND_NIGHTSTAND, registerNdItems } from '../../src/core/v3/nd/items';
import { rectsOverlap, type Box3 } from '../../src/core/v3/nd/place';
import { aimOn, ANY_WAY, boardOpen, boardsOf, clearOf, firstFit, fitWhy, laid, layOut, placedOf, settle, spotOf, spotSaved, standing, UPRIGHT, type Placed } from '../../src/core/v3/nd/store';

/** a thing's box: its base on its origin, its middle over it (as most models are) */
const thing = (x: number, h: number, z: number): Box3 => ({ minX: -x / 2, maxX: x / 2, minY: 0, maxY: h, minZ: -z / 2, maxZ: z / 2 });
// (the game's own measures, harness/shots probe: a tomato, a can of cola, a big bottle of water, a bag of crackers lying flat)
const TOMATO = thing(0.102, 0.105, 0.101);
const COLA = thing(0.067, 0.115, 0.067);
const WATER = thing(0.112, 0.34, 0.112);
const CHIPS = thing(0.378, 0.082, 0.27);

describe('what a container holds stands in it (core/v3/nd/store.ts)', () => {
  it('the containers and their boards: what opens each, what each rides on', () => {
    expect(boardsOf(COOLER)).toHaveLength(1);
    expect(boardsOf(COOLER)[0].behind).toEqual(['LID']);
    const fridge = boardsOf(ND_FRIDGE);
    // (three shelves inside, three in the door: those ride on the door, reached from its inner side)
    expect(fridge.filter((b) => !b.on)).toHaveLength(3);
    expect(fridge.filter((b) => b.on === 'P_door' && b.from === 'back')).toHaveLength(3);
    expect(boardsOf(ND_NIGHTSTAND)[0].on).toBe('P_drawer_a');
    expect(boardsOf(ND_CHEST)[0].behind).toEqual(['LID']);
    expect(boardsOf('forage_basket')).toEqual([]);
    expect(boardOpen(fridge[0], ['P_door'])).toBe(true);
    expect(boardOpen(fridge[0], ['P_door_a'])).toBe(false);
    expect(boardOpen(fridge[0], undefined)).toBe(false);
  });

  it("a thing goes on a board by its size: as tall as it is clear, its base 0.7 m at the most, a twentieth of it over an edge", () => {
    const [floor] = boardsOf(COOLER);
    const fridge = boardsOf(ND_FRIDGE);
    expect(fitWhy(floor, standing(TOMATO, { x: 0, z: 0, r: 0 }))).toBe('');
    // (the big bottle stands in Nomad Drive's cooler, 0.34 m under 0.35; not on the fridge's middle shelf)
    expect(fitWhy(floor, standing(WATER, { x: 0, z: 0, r: 0 }))).toBe('');
    expect(fitWhy(fridge[1], standing(WATER, { x: -0.05, z: 0, r: 0 }))).toBe('tall');
    // (laid on its side along the shelf it lies on it; along its depth, off its back)
    expect(fitWhy(fridge[1], standing(WATER, { x: -0.05, z: 0.17, r: 0, lie: 'x' }))).toBe('');
    expect(fitWhy(fridge[1], standing(WATER, { x: -0.05, z: 0, r: 0, lie: 'z' }))).toBe('off');
    expect(laid(WATER, 'z').maxY - laid(WATER, 'z').minY).toBeCloseTo(0.112, 6);
    expect(fitWhy(floor, standing(thing(0.75, 0.05, 0.2), { x: 0, z: 0, r: 0 }))).toBe('big');
    // (a tomato with its edge 4 mm past the floor's front: within a twentieth of itself; 2 cm past: off)
    expect(fitWhy(floor, standing(TOMATO, { x: 0.15 - 0.051 + 0.004, z: 0, r: 0 }))).toBe('');
    expect(fitWhy(floor, standing(TOMATO, { x: 0.15 - 0.051 + 0.02, z: 0, r: 0 }))).toBe('off');
    // (the crackers fit on the cooler's floor turned so their length lies along it, not across it)
    expect(fitWhy(floor, standing(CHIPS, { x: 0, z: 0, r: Math.PI / 2 }))).toBe('');
    expect(fitWhy(floor, standing(CHIPS, { x: 0, z: 0, r: 0 }))).toBe('off');
    expect(fitWhy(floor, standing(thing(0.27, 0.082, 0.378), { x: 0, z: 0, r: 0 }))).toBe('');
  });

  it('put just so: its middle where one looks, kept on the board, on 5 cm squares from the back left corner', () => {
    const [floor] = boardsOf(COOLER);
    const a = aimOn(floor, COLA, 0, undefined, 0.01, 0.02, false);
    expect(a.x).toBeCloseTo(0.01, 6);
    expect(a.z).toBeCloseTo(0.02, 6);
    // (looked at past the floor's end: as far as it may stand out over it)
    const b = aimOn(floor, COLA, 0, undefined, 0.01, 0.6, false);
    expect(b.z).toBeCloseTo(0.26 - 0.0335 + 0.05 * 0.067, 6);
    // (on the squares: its back left corner on the lines from the floor's)
    const c = aimOn(floor, COLA, 0, undefined, 0.013, -0.141, true);
    expect(((c.x - 0.0335 - floor.x[0]) / 0.05) % 1).toBeCloseTo(0, 6);
    expect(Math.abs(((c.z - 0.0335 - floor.z[0]) / 0.05) % 1)).toBeCloseTo(0, 6);
    // (a thing whose origin is off its middle: its middle on the point)
    const off: Box3 = { minX: 0, maxX: 0.1, minY: 0, maxY: 0.1, minZ: 0, maxZ: 0.1 };
    const d = aimOn(floor, off, 0, undefined, 0, 0, false);
    expect(d.x).toBeCloseTo(-0.05, 6);
    expect(d.z).toBeCloseTo(-0.05, 6);
  });

  it('the first place a thing fits: as far back and along as it goes, clear of the others; none when the board is full', () => {
    const boards = boardsOf(COOLER);
    const placed: Placed[] = [];
    let n = 0;
    for (;;) {
      const s = firstFit(boards, [0], COLA, placed, UPRIGHT);
      if (!s) break;
      const st = standing(COLA, s);
      expect(fitWhy(boards[0], st)).toBe('');
      expect(clearOf(st.rect, placed.map((p) => p.rect))).toBe(true);
      placed.push({ b: 0, rect: st.rect, top: st.h });
      n++;
      if (n > 100) break;
    }
    // (the cooler's floor, 0.30 by 0.52, takes four rows of six cans a centimetre apart)
    expect(n).toBe(24);
    // the first stands in the back left corner
    const first = placed[0].rect;
    expect(first.x - first.hx).toBeCloseTo(-0.15, 3);
    expect(first.z - first.hz).toBeCloseTo(-0.26, 3);
  });

  it("a thing a little deeper than a shelf stands in its middle, over its edges by no more than a twentieth; a deeper one turned along it", () => {
    const fridge = boardsOf(ND_FRIDGE);
    // (the top shelf is 0.34 m deep: a box 0.37 deep stands out 1.5 cm at its back and its front)
    const deep = thing(0.37, 0.1, 0.1);
    const s = firstFit(fridge, [0], deep, [], UPRIGHT)!;
    expect(s.r).toBe(0);
    const st = standing(deep, s);
    expect(st.rect.x).toBeCloseTo((fridge[0].x[0] + fridge[0].x[1]) / 2, 6);
    expect(fitWhy(fridge[0], st)).toBe('');
    // (a big bag 0.48 by 0.38: across the shelf it would stand out 7 cm; turned, its length along the shelf, it goes)
    const bag = thing(0.48, 0.1, 0.38);
    const t = firstFit(fridge, [0], bag, [], UPRIGHT)!;
    expect(t.r).toBeCloseTo(Math.PI / 2, 6);
    expect(fitWhy(fridge[0], standing(bag, t))).toBe('');
    // (and laid out with others coming in, it is the first to go, on the top shelf, turned so)
    const many = layOut(fridge, [COLA, bag, TOMATO], []);
    expect(many[1].b).toBe(0);
    expect(fitWhy(fridge[0], standing(bag, many[1]))).toBe('');
  });

  it('things come in without a place: each laid out beside the others, tall ones on their sides, one that fits nowhere somewhere all the same', () => {
    const fridge = boardsOf(ND_FRIDGE);
    // (a big bottle stands on the top shelf; the next laid down on one below; a can in the door)
    const spots = layOut(fridge, [WATER, WATER, TOMATO, COLA], []);
    expect(spots[0].b).toBe(0);
    expect(spots[0].lie).toBeUndefined();
    expect(spots.every((s) => fitWhy(fridge[s.b], standing([WATER, WATER, TOMATO, COLA][spots.indexOf(s)], s)) === '')).toBe(true);
    const rects = spots.map((s, i) => ({ b: s.b, rect: standing([WATER, WATER, TOMATO, COLA][i], s).rect }));
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (rects[i].b === rects[j].b) expect(rectsOverlap(rects[i].rect, rects[j].rect)).toBe(false);
    // the cooler with twelve things in it, more than its floor holds (a big bottle, three tomatoes, four cans, beef,
    // milk, a potato, a bag of crackers): each on the floor or lying on others, none in another, all under the lid
    const cooler = boardsOf(COOLER);
    const twelve = [WATER, TOMATO, TOMATO, TOMATO, COLA, COLA, COLA, COLA, thing(0.206, 0.038, 0.146), thing(0.096, 0.259, 0.097), thing(0.13, 0.077, 0.094), CHIPS];
    const s12 = layOut(cooler, twelve, []);
    const p12 = s12.map((s, i) => placedOf(twelve[i], s));
    for (let i = 0; i < 12; i++) {
      expect(fitWhy(cooler[0], { ...standing(twelve[i], s12[i]), h: 0 })).toBe('');
      expect(p12[i].top).toBeLessThanOrEqual(cooler[0].clear + 0.005);
    }
    const apart = (a: number, b: number): boolean => !rectsOverlap(p12[a].rect, p12[b].rect, 0.002) || (s12[a].up ?? 0) >= p12[b].top - 1e-6 || (s12[b].up ?? 0) >= p12[a].top - 1e-6;
    for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) expect(apart(i, j)).toBe(true);
    expect(s12.some((s) => (s.up ?? 0) > 0)).toBe(true);
    // the same things, the same places
    expect(layOut(cooler, twelve, [])).toEqual(s12);
    // what lay on others comes down when what was under it is taken out
    const gone = s12.map((s, i) => ({ s, i })).filter(({ s }) => !s.up);
    const left = s12.filter((s) => s.up);
    const leftBoxes = s12.map((s, i) => (s.up ? twelve[i] : null)).filter((b): b is Box3 => !!b);
    expect(gone.length).toBeGreaterThan(0);
    expect(settle(leftBoxes, left).every((s) => !s.up)).toBe(true);
    // (nothing taken: nothing moves)
    expect(settle(twelve, s12)).toEqual(s12);
    // a box too big for anything: in the middle of the first board, all the same
    const huge = layOut(cooler, [thing(0.9, 0.5, 0.9)], []);
    expect(huge[0].b).toBe(0);
    expect(huge[0].x).toBeCloseTo(0, 6);
    // (laid on its side: the ways it may go in, the upright ones first)
    expect(ANY_WAY.slice(0, 2)).toEqual(UPRIGHT);
  });

  it('a place as the container keeps it, and read back', () => {
    const s = { b: 2, x: 0.12345, z: -0.2, r: Math.PI / 2, lie: 'x' as const };
    const a = spotSaved(s);
    expect(a).toEqual([2, 0.123, -0.2, 1.571, 2]);
    expect(spotOf(a, 6)).toEqual({ b: 2, x: 0.123, z: -0.2, r: 1.571, lie: 'x' });
    expect(spotOf([0, 0, 0, 0], 1)).toEqual({ b: 0, x: 0, z: 0, r: 0 });
    expect(spotSaved({ b: 0, x: 0, z: 0, r: 0, up: 0.0824 })).toEqual([0, 0, 0, 0, 0, 0.082]);
    expect(spotOf([0, 0, 0, 0, 0, 0.082], 1)).toEqual({ b: 0, x: 0, z: 0, r: 0, up: 0.082 });
    // (a board the kind has no more, a number that is none, not a place at all)
    expect(spotOf(a, 2)).toBeNull();
    expect(spotOf([0, Number.NaN, 0, 0], 1)).toBeNull();
    expect(spotOf('x', 1)).toBeNull();
    expect(spotOf([0.5, 0, 0, 0], 1)).toBeNull();
  });

  it("kept with the save: a fridge's things, where each stands, read back as they were", () => {
    registerNdItems();
    const fridge = newItem(ND_FRIDGE);
    const a = newItem('drink_cola');
    const b = newItem('drink_beer');
    fridge.inside = [a, b];
    fridge.state = { open: ['P_door'], spots: { [a.uid]: spotSaved({ b: 0, x: -0.08, z: 0.05, r: 0 }), [b.uid]: spotSaved({ b: 4, x: 0.186, z: 0, r: Math.PI / 2, lie: 'z', up: 0.03 }) } };
    const loss = { unknown: 0 };
    const back = cleanItem(JSON.parse(JSON.stringify(fridge)), loss)!;
    expect(loss.unknown).toBe(0);
    expect(back.inside!.map((x) => x.uid)).toEqual([a.uid, b.uid]);
    const n = boardsOf(ND_FRIDGE).length;
    expect(spotOf(back.state!.spots![a.uid], n)).toEqual({ b: 0, x: -0.08, z: 0.05, r: 0 });
    expect(spotOf(back.state!.spots![b.uid], n)).toEqual({ b: 4, x: 0.186, z: 0, r: 1.571, lie: 'z', up: 0.03 });
    expect(back.state!.open).toEqual(['P_door']);
  });
});
