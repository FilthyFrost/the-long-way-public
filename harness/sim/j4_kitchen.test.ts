/**
 * J4 (docs/V3/plan/growth.md §一 4): the kitchen's things are things like any other. A pan with food in it is lifted
 * off the burner and dishes up onto a plate lying about (端着锅对着盘子), as a plate in the hands does under it; a
 * vessel in the hands takes the place of the one on the burner, which comes into the hands; a pot off the flame stops
 * where it is and goes on from there when it is put back.
 */
import { describe, expect, it } from 'vitest';
import { newItem } from '../../src/core/modcar/items';
import { newBook } from '../../src/core/v3/kitchen/book';
import { cutItem, dishItem, ingItem, PLATE, STOVE, VESSEL } from '../../src/core/v3/kitchen/items';
import { asksStir, fireOf, phaseOf, potOf, vesselOf } from '../../src/core/v3/kitchen/kit';
import { kitchen } from '../../src/game/modcar/v3/kitchen/index';
import { kitchenRig } from './v3/kitchenRig';

type Rig = Awaited<ReturnType<typeof kitchenRig>>;

async function laid(): Promise<Rig> {
  kitchen.book = newBook();
  const rig = await kitchenRig();
  expect(rig.button('摆一套厨房')).toMatch(/^摆好了 \d+ 样/);
  rig.frames(2);
  return rig;
}

/** a cut tomato and an egg into the pan on the stove, the flame lit */
function tomatoAndEgg(rig: Rig): void {
  const stove = rig.unit(STOVE);
  rig.give(newItem(cutItem('tomato')));
  rig.aim(stove, 'top');
  rig.pressE();
  rig.give(newItem(ingItem('egg')));
  rig.aim(stove, 'top');
  rig.pressE();
  expect(potOf(stove.item)?.items.map((p) => p.id)).toEqual(['tomato', 'egg']);
  rig.aim(stove, 'knob');
  rig.pressE();
  expect(fireOf(stove.item)).toBe(2);
}

/** on until it is just right (tossed when it asks) */
function cookRight(rig: Rig, most = 60): void {
  const stove = rig.unit(STOVE);
  for (let t = 0; t < most * 30 && phaseOf(stove.item) !== 'right'; t++) {
    rig.frames(1, 1 / 30);
    if (asksStir(stove.item)) {
      rig.aim(stove, 'top');
      rig.pressE();
    }
  }
  expect(phaseOf(stove.item)).toBe('right');
}

describe('J4: the kitchen things are things like any other', () => {
  it('a pan with food in the hands dishes up onto a plate lying about', async () => {
    const rig = await laid();
    const stove = rig.unit(STOVE);
    tomatoAndEgg(rig);
    cookRight(rig);
    rig.aim(stove, 'knob');
    rig.pressE();
    // the pan off the burner (Hold E 0.5 s on a functional device): in the hands with what is in it
    rig.aim(stove, 'top');
    rig.holdE();
    expect(rig.held()?.item).toBe(VESSEL.fry);
    expect(potOf(rig.held()!)?.items.length).toBe(2);
    expect(vesselOf(stove.item)).toBe(null);
    // a plate lying beside the stove: a place to dish up onto while the pan has food in it
    const plate = rig.ctx.loose.addItem(newItem(PLATE), stove.loose.x, 0, stove.loose.z + 0.45);
    rig.frames(2);
    expect(plate.device).toBe(true);
    rig.lookAt(plate.x, plate.y + plate.mid, plate.z);
    expect(rig.word()).toBe('装盘');
    rig.pressE();
    // the plate where it lies is the dish now; the pan stays in the hands, emptied; the book has it
    expect(plate.item!.item).toBe(dishItem('tomato_egg'));
    expect(rig.held()?.item).toBe(VESSEL.fry);
    expect(potOf(rig.held()!)?.items.length ?? 0).toBe(0);
    expect(kitchen.book.made.tomato_egg?.n).toBe(1);
    expect(rig.game.said.some((s) => /番茄炒蛋/.test(s))).toBe(true);
    // the pan empty: a plate lying about is a thing to pick up again
    const other = rig.ctx.loose.addItem(newItem(PLATE), stove.loose.x + 0.4, 0, stove.loose.z + 0.45);
    rig.frames(2);
    expect(other.device).toBeFalsy();
  });

  it('a vessel in the hands takes the place of the one on the burner, which comes into the hands', async () => {
    const rig = await laid();
    const stove = rig.unit(STOVE);
    expect(vesselOf(stove.item)).toBe(VESSEL.fry);
    rig.empty();
    rig.give(newItem(VESSEL.boil));
    rig.aim(stove, 'top');
    expect(rig.word()).toBe('换锅');
    rig.pressE();
    expect(vesselOf(stove.item)).toBe(VESSEL.boil);
    expect(rig.held()?.item).toBe(VESSEL.fry);
    expect(rig.player.slots.filter((h) => h?.kind === 'item' && h.item.item === VESSEL.boil).length).toBe(0);
  });

  it('a pan off the flame stops where it is, and goes on from there when it is put back', async () => {
    const rig = await laid();
    const stove = rig.unit(STOVE);
    tomatoAndEgg(rig);
    rig.pass(5);
    const done0 = potOf(stove.item)!.done ?? 0;
    expect(done0).toBeGreaterThan(0.05);
    rig.empty();
    rig.aim(stove, 'top');
    rig.holdE();
    const pan = rig.held()!;
    expect(pan.item).toBe(VESSEL.fry);
    const lifted = potOf(pan)!.done ?? 0;
    expect(lifted).toBeGreaterThanOrEqual(done0);
    rig.pass(10);
    expect(potOf(pan)!.done ?? 0).toBe(lifted);
    // back on the burner, still alight: on from where it was
    rig.aim(stove, 'top');
    rig.pressE();
    expect(vesselOf(stove.item)).toBe(VESSEL.fry);
    // (the flame still lit: the frames of putting it back have cooked it a little)
    expect(Math.abs((potOf(stove.item)!.done ?? 0) - lifted)).toBeLessThan(0.01);
    rig.pass(2);
    expect(potOf(stove.item)!.done ?? 0).toBeGreaterThan(lifted);
  });
});
