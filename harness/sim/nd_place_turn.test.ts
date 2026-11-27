// Placing turned (docs/ND/PLAN.md ND4; the player's ask of 2026-11-26: a pan held out with R, turned with Q and E, set on
// the hob so and cooking there): a vessel keeps the turn it was set on with, and loses it as it comes off; Q and E go to
// the next square of the burner's own frame either way, a quarter at a time (Nomad Drive's 90°, 0.2 s easing out).
import { describe, expect, it } from 'vitest';
import { newItem } from '../../src/core/modcar/items';
import { GAS, HOB, STOVE, VESSEL } from '../../src/core/v3/kitchen/items';
import { addPortion, fireOf, kitOf, loadCanister, phaseOf, potOf, putVessel, setFire, stoveStep, takeVessel, vesselOf, type StoveTick } from '../../src/core/v3/kitchen/kit';
import { nextQuarter, outCubic, PLACE } from '../../src/core/v3/nd/place';
import { turnOnSlot } from '../../src/game/modcar/v3/nd-place/slots';
import '../../src/game/modcar/v3/kitchen/index';

const tick = (): StoveTick => ({ burning: false, ranOut: false, before: null, after: null, asked: false });

describe('a vessel set on a burner turned (core/v3/kitchen/kit.ts, nd-place slots)', () => {
  it('keeps the turn it was set on with, and cooks so', () => {
    const stove = newItem(STOVE);
    loadCanister(stove, newItem(GAS));
    expect(putVessel(stove, newItem(VESSEL.fry), Math.PI / 2)).toBe(true);
    expect(vesselOf(stove)).toBe(VESSEL.fry);
    expect(kitOf(stove).onYaw).toBeCloseTo(Math.PI / 2, 4);
    addPortion(stove, { id: 'egg' });
    expect(setFire(stove, 2)).toBeNull();
    for (let t = 0; t < 6; t += 0.1) stoveStep(stove, 0.1, tick());
    expect(fireOf(stove)).toBe(2);
    expect(potOf(stove)!.done ?? 0).toBeGreaterThan(0.2);
    for (let t = 0; t < 20; t += 0.1) stoveStep(stove, 0.1, tick());
    expect(phaseOf(stove)).not.toBe('raw');
    expect(kitOf(stove).onYaw).toBeCloseTo(Math.PI / 2, 4);
    // off the burner, into the hands with what is in it: the turn was the stove's, it goes
    const pan = takeVessel(stove)!;
    expect(pan.item).toBe(VESSEL.fry);
    expect(potOf(pan)!.items.length).toBe(1);
    expect(kitOf(stove).onYaw).toBeUndefined();
  });

  it('set on with the button: no turn of its own (it stands as it always has); a turn is kept within a half round', () => {
    const hob = newItem(HOB);
    expect(putVessel(hob, newItem(VESSEL.boil))).toBe(true);
    expect(kitOf(hob).onYaw).toBeUndefined();
    takeVessel(hob);
    expect(putVessel(hob, newItem(VESSEL.brew), 3 * Math.PI)).toBe(true);
    expect(Math.abs(kitOf(hob).onYaw!)).toBeCloseTo(Math.PI, 4);
    // (one on it already: nothing goes on, the turn stays the first one's)
    expect(putVessel(hob, newItem(VESSEL.fry), 0.3)).toBe(false);
    expect(Math.abs(kitOf(hob).onYaw!)).toBeCloseTo(Math.PI, 4);
  });

  it("the steamer onto the pot of water there takes the turn; off again, the pot stands as it did", () => {
    const stove = newItem(STOVE);
    putVessel(stove, newItem(VESSEL.boil), 0.5);
    expect(putVessel(stove, newItem(VESSEL.steam), -1)).toBe(true);
    expect(kitOf(stove).onYaw).toBeCloseTo(-1, 4);
    expect(takeVessel(stove)!.item).toBe(VESSEL.steam);
    expect(vesselOf(stove)).toBe(VESSEL.boil);
    expect(kitOf(stove).onYaw).toBeUndefined();
  });

  it('a heading turned onto a slot: the turn about its up (three’s way round), and back', () => {
    // a pan heading along the stove's own front: no turn; a quarter round to the right (E, the heading up by a quarter): −90°
    expect(turnOnSlot(0.4, 0.4)).toBeCloseTo(0, 9);
    expect(turnOnSlot(0.4 + Math.PI / 2, 0.4)).toBeCloseTo(-Math.PI / 2, 9);
    expect(turnOnSlot(0.4 - Math.PI / 2, 0.4)).toBeCloseTo(Math.PI / 2, 9);
    expect(Math.abs(turnOnSlot(0.4 + Math.PI, 0.4))).toBeCloseTo(Math.PI, 9);
  });

  it('Q and E alike: a quarter round to the next square of the slot’s frame either way, in 0.2 s easing out', () => {
    const slot = 0.3;
    const q = Math.PI / 2;
    // facing one at some heading off the squares: E to the next square up, Q to the next one down
    const h = slot + 0.7;
    const e = nextQuarter(h, 1, slot);
    const qq = nextQuarter(h, -1, slot);
    expect(e - slot).toBeCloseTo(q, 9);
    expect(qq - slot).toBeCloseTo(0, 9);
    // from a square, each a whole quarter the one way and the other
    expect(nextQuarter(e, 1, slot) - e).toBeCloseTo(q, 9);
    expect(e - nextQuarter(e, -1, slot)).toBeCloseTo(q, 9);
    // on the slot E turns it −90° about its up, Q +90°: the same size of turn either way
    expect(turnOnSlot(nextQuarter(slot, 1, slot), slot)).toBeCloseTo(-q, 9);
    expect(turnOnSlot(nextQuarter(slot, -1, slot), slot)).toBeCloseTo(q, 9);
    expect(PLACE.stepS).toBe(0.2);
    expect(outCubic(1)).toBe(1);
  });
});
