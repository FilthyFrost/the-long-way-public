import { describe, expect, it } from 'vitest';
import { newItem } from '../../src/core/modcar/items';
// (the kitchen's things are made known as its module is loaded)
import '../../src/game/modcar/v3/kitchen/index';
import { burnersOf, canister, fireOf, gasFeed, kitOf, loadCanister, setFire, stoveStep, type StoveTick } from '../../src/core/v3/kitchen/kit';

const tick = (): StoveTick => ({ burning: false, ranOut: false, before: null, after: null, asked: false }) as StoveTick;

// A two-burner stove's canister feeds both burners (the player, 2026-11-26: the right burner gave no knob to light —
// its bay was empty, and what cannot be done is not drawn).
describe('a two-burner stove shares its canister', () => {
  it('lights either burner from one canister in either bay, and burns that canister', () => {
    const st = newItem('kit_stove2');
    const [left, right] = burnersOf(st);
    expect(setFire(right, 2)).toBe('nocan');
    loadCanister(left, canister());
    expect(gasFeed(right)).toBe(left);
    expect(setFire(right, 2)).toBeNull();
    expect(fireOf(right)).toBe(2);
    expect(setFire(left, 1)).toBeNull();
    const before = kitOf(left).gas!;
    stoveStep(right, 10, tick());
    stoveStep(left, 10, tick());
    expect(kitOf(left).gas!).toBeLessThan(before);
    expect(kitOf(right).gas).toBeUndefined();
  });

  it('draws its own canister first, the other when its own is empty, and goes out when both are', () => {
    const st = newItem('kit_stove2');
    const [left, right] = burnersOf(st);
    loadCanister(left, canister(5));
    loadCanister(right, canister(0));
    expect(gasFeed(right)).toBe(left);
    expect(setFire(right, 2)).toBeNull();
    let out = tick();
    for (let i = 0; i < 200 && fireOf(right); i++) out = stoveStep(right, 1, tick());
    expect(fireOf(right)).toBe(0);
    expect(out.ranOut).toBe(true);
    expect(kitOf(left).gas).toBe(0);
    expect(setFire(right, 2)).toBe('empty');
  });

  it('keeps a stove of one burner as it was', () => {
    const one = newItem('kit_stove');
    expect(setFire(one, 2)).toBe('nocan');
    expect(gasFeed(one)).toBe(one);
  });
});
