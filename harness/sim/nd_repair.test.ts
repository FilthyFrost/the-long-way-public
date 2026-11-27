/**
 * docs/V3/plan/finish.md §十九, step 1 (fix what is broken): the steering wheel turns as Nomad Drive's, 1.5 times the
 * road wheels' angle (the worn, sport and ship's wheels in their old proportions to the standard one, the grip they ask
 * for at speed as before); the three generic repair kits that never mended anything are gone from the catalogue and the
 * loot, a save's read back as engine repair kits; a part's card says its condition as Nomad Drive's does (状态极佳 /
 * 良好 / 一般 / 较差 / 已损坏 at 75 / 50 / 25 / above 0 / 0, the percentage) under one to three stars of its level.
 */
import { describe, expect, it } from 'vitest';
import { fitPart, newInstance, stockBuild } from '../../src/core/modcar/build';
import { derive } from '../../src/core/modcar/derive';
import { frameDef } from '../../src/core/modcar/frames';
import { cleanItem, hasItem, ITEMS } from '../../src/core/modcar/items';
import { LOOT_TABLES, rollContainer } from '../../src/core/modcar/loot';
import { partDef } from '../../src/core/modcar/parts';
import '../../src/core/v3/nd/cards';
import { cardHtml, stateOf } from '../../src/game/modcar/cards';
import { partCard, partLevel } from '../../src/game/modcar/itemInfo';

describe('step 1: the steering wheel, the repair kits, the part card', () => {
  it('the steering wheel turns 1.5 times the road wheels; the others in their old proportions, asking the same grip as before', () => {
    expect(partDef('steer_std').steering!.ratio).toBe(1.5);
    expect(derive(stockBuild('pickup')).spec.steering.ratio).toBe(1.5);
    const old: Record<string, number> = { steer_std: 16, steer_bad: 18, steer_sport: 12, steer_ship: 28 };
    const g0 = frameDef('pickup').steering.gripLimitG;
    for (const [id, was] of Object.entries(old)) {
      const r = partDef(id).steering!.ratio;
      expect(r / 1.5, id).toBeCloseTo(was / 16, 12);
      const b = stockBuild('pickup');
      fitPart(b, 'steering', newInstance(id));
      expect(derive(b).spec.steering.gripLimitG, id).toBeCloseTo(g0 * Math.max(0.6, Math.min(1.35, Math.pow(16 / was, 0.6))), 9);
    }
  });

  it('the generic repair kits are gone: not in the catalogue nor in any box; a save\'s are engine repair kits', () => {
    for (const id of ['repair_1', 'repair_2', 'repair_3']) {
      expect(hasItem(id), id).toBe(false);
      expect(cleanItem({ item: id, uid: 'i1', uses: 500 }, { items: 0, parts: 0 } as never)?.item, id).toBe('nd_engine_kit');
    }
    expect(ITEMS.some((d) => d.id.startsWith('repair_'))).toBe(false);
    for (const kind of Object.keys(LOOT_TABLES) as (keyof typeof LOOT_TABLES)[]) {
      for (let seed = 1; seed <= 300; seed++) for (const f of rollContainer(kind, seed, 3000, 'garage')) expect('item' in f ? f.item : '', `${kind} ${seed}`).not.toMatch(/^repair_/);
    }
  });

  it('a part\'s condition in Nomad Drive\'s words and colours, by its percentage', () => {
    const at = (c: number): string => `${stateOf(c).word} ${stateOf(c).pct}%`;
    expect([1, 0.75, 0.749, 0.5, 0.3, 0.25, 0.2, 0.004, 0].map(at)).toEqual(['状态极佳 100%', '状态极佳 75%', '状态极佳 75%', '状态良好 50%', '状态一般 30%', '状态一般 25%', '状态较差 20%', '状态较差 1%', '已损坏 0%']);
    expect(stateOf(0.9).colour).toBe('#54b554');
    expect(stateOf(0).colour).toBe('#e6594d');
  });

  it('a part\'s card: its level in one to three stars, its state under its name (a wheel\'s its tyre\'s), on the cut-down card too', () => {
    expect([0, 1, 2, 3, 4, 5].map(partLevel)).toEqual([0, 1, 1, 2, 3, 3]);
    const eng = newInstance('eng_i4d', { cond: 0.3 });
    const card = partCard(eng, { mount: '发动机' });
    expect(card.state).toBe(0.3);
    expect(card.level).toBe(2);
    expect(card.foot.cond).toBeUndefined();
    for (const compact of [false, true]) {
      const html = cardHtml(card, compact);
      expect(html, String(compact)).toContain('状态一般');
      expect(html, String(compact)).toContain('30%');
      expect(html, String(compact)).toMatch(/data-level="2"/);
    }
    const b = stockBuild('pickup');
    const wheel = b.parts.hub_FL!;
    wheel.cond = 0.9;
    wheel.sub.tire!.cond = 0.2;
    expect(partCard(wheel).state).toBe(0.2);
  });
});
