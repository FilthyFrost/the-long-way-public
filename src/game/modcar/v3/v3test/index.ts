/**
 * Test content for the item model (docs/V3/nodes/N0-items.md): kinds that stack, go off and hold things, so
 * that the browser scripts can try stacks, a basket and freshness before any real system has such things.
 *
 * Registered ONLY when the page's address carries v3test=1. Without it this module brings nothing at all: no
 * category, no kind, nothing in the developer's panel, nothing in any loot. (In Node, where the tests import
 * every module, there is no address, so nothing is registered there either.)
 *
 * The models are borrowed from kinds that exist: the berry and what it turns into use the liquorice's, the
 * jerky the tin of mackerel's, the basket the box of components'.
 */
import { registerItemCat, registerItems } from '../../../../core/modcar/items';
import type { GameModule } from '../../kernel/modules';

/** whether this page asked for the test content */
export const V3TEST = typeof location !== 'undefined' && new URLSearchParams(location.search).get('v3test') === '1';

if (V3TEST) {
  registerItemCat({ id: 'v3t', name: { zh: '试验品', en: 'Test things' } });
  registerItems([
    // stacks to 12, goes off in a game day in the open air, becomes mush
    { id: 'v3t_berry', cat: 'v3t', name: { zh: '试验莓', en: 'Test berry' }, stars: 1, mass: 0.05, stack: 12, tags: ['v3t', 'forage'], perish: { hours: 24, into: 'v3t_mush' }, eat: { food: 6, hp: 0, sec: 1.5 }, salvage: { organics: 1 }, model: 'food_licorice', paint: 0x6a4c93, paint2: 0x3b7d4f, blurb: '只在试验页里有的莓子：能叠十二颗，放一天就坏。' },
    { id: 'v3t_mush', cat: 'v3t', name: { zh: '烂掉的试验莓', en: 'Spoiled test berry' }, stars: 0, mass: 0.05, stack: 12, salvage: { organics: 1 }, model: 'food_licorice', paint: 0x5b4636, paint2: 0x3a2f28, blurb: '试验莓放坏了以后的样子。' },
    // stacks to 8, keeps for ever
    { id: 'v3t_jerky', cat: 'v3t', name: { zh: '试验肉干', en: 'Test jerky' }, stars: 2, mass: 0.1, stack: 8, tags: ['v3t', 'meat'], eat: { food: 15, hp: 1, sec: 2 }, salvage: { organics: 2 }, model: 'food_fish_can', paint: 0x8a4b32, paint2: 0xd8c29a, blurb: '只在试验页里有的肉干：能叠八块，不会坏。' },
    // holds four stacks of test things, up to 3 kg; things in it go off half as fast
    { id: 'v3t_basket', cat: 'v3t', name: { zh: '试验篮', en: 'Test basket' }, stars: 1, mass: 0.6, carry: 'small', holds: { slots: 4, accepts: ['#v3t'], maxKg: 3, decay: 0.5 }, salvage: { organics: 2 }, model: 'crate_parts', paint: 0xb9915f, paint2: 0x7a5c3a, blurb: '只在试验页里有的篮子：装四叠试验品，里面的东西坏得慢一半。' },
  ]);
}

export default { id: 'v3test' } satisfies GameModule;
