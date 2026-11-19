/**
 * The modal seam of the kernel (src/game/modcar/kernel/modal.ts, node C1): one panel at a time has the keys;
 * Escape shuts it, the number keys stay the hotbar's, it shuts by itself when one walks away or sits in a
 * vehicle, a second one replaces the first, a hook that throws is reported and shuts it. Through the stand-in
 * game, so that the kernel's own one is what is tried, stepped where the game steps it.
 */
import { describe, expect, it } from 'vitest';
import type { Modal, ModalClose } from '../../src/game/modcar/kernel/modal';
import { FakeGame } from './v3/fakeGame';

function panel(id: string, o: { mouse?: boolean; near?: () => boolean; uses?: string[]; throwOn?: string } = {}) {
  const keys: string[] = [];
  const wheels: number[] = [];
  const closed: ModalClose[] = [];
  const m: Modal = {
    id,
    mouse: o.mouse,
    key: (code) => {
      if (code === o.throwOn) throw new Error(`${id} cannot take ${code}`);
      keys.push(code);
      return (o.uses ?? ['KeyE', 'Space', 'KeyW']).includes(code);
    },
    wheel: (dy) => wheels.push(dy) > 0,
    near: o.near ?? (() => true),
    closed: (why) => void closed.push(why),
  };
  return { m, keys, wheels, closed };
}

describe('the modal seam', () => {
  it('a modal open has the keys it uses; Escape shuts it; the number keys are never its', async () => {
    const game = await new FakeGame([]).start();
    const changes: (string | null)[] = [];
    game.modal.onChange = (m) => void changes.push(m ? m.id : null);
    const p = panel('cooking', { mouse: true });
    expect(game.modal.key('KeyE')).toBe(false);
    game.modal.open(p.m);
    expect(game.ctx.modal.isOpen).toBe(true);
    expect(game.modal.wantsMouse).toBe(true);
    expect(game.modal.key('KeyE')).toBe(true);
    // (a key it does not use goes on to the game)
    expect(game.modal.key('F1')).toBe(false);
    // the hotbar's keys are not even offered
    expect(game.modal.key('Digit2')).toBe(false);
    expect(p.keys).toEqual(['KeyE', 'F1']);
    expect(game.modal.wheel(120)).toBe(true);
    expect(p.wheels).toEqual([120]);
    expect(game.modal.key('Escape')).toBe(true);
    expect(game.modal.isOpen).toBe(false);
    expect(p.closed).toEqual(['escape']);
    expect(changes).toEqual(['cooking', null]);
    expect(game.kernel.telemetry().modal).toEqual({ open: null, mouse: false, opened: 1 });
  });

  it('it shuts by itself when one walks away or sits in a vehicle, in the frame', async () => {
    const game = await new FakeGame([]).start();
    let here = true;
    const a = panel('a', { near: () => here });
    game.modal.open(a.m);
    game.frame();
    expect(game.modal.isOpen).toBe(true);
    here = false;
    game.frame();
    expect(game.modal.isOpen).toBe(false);
    expect(a.closed).toEqual(['away']);
    here = true;
    game.modal.open(a.m);
    game.seated = {} as never;
    game.frame();
    expect(a.closed).toEqual(['away', 'seated']);
  });

  it('one at a time: a second replaces the first; only the one open is shut by its owner', async () => {
    const game = await new FakeGame([]).start();
    const changes: (string | null)[] = [];
    game.modal.onChange = (m) => void changes.push(m ? m.id : null);
    const a = panel('a');
    const b = panel('b');
    game.modal.open(a.m);
    game.modal.open(b.m);
    expect(a.closed).toEqual(['replaced']);
    expect(game.modal.current?.id).toBe('b');
    expect(game.modal.close(a.m)).toBe(false);
    expect(game.modal.close(b.m)).toBe(true);
    expect(b.closed).toEqual(['owner']);
    // (the game hears of the second opening and of the end, never of a moment with none between the two)
    expect(changes).toEqual(['a', 'b', null]);
  });

  it('a modal whose hook throws is reported and shut; the game goes on', async () => {
    const game = await new FakeGame([]).start();
    const p = panel('broken', { throwOn: 'KeyQ' });
    game.modal.open(p.m);
    expect(game.modal.key('KeyQ')).toBe(true);
    expect(game.modal.isOpen).toBe(false);
    expect(p.closed).toEqual(['fault']);
    expect(game.reports.some((r) => r.startsWith('modal broken (key)'))).toBe(true);
    const q = panel('near', { near: () => { throw new Error('lost'); } });
    game.modal.open(q.m);
    game.frame();
    expect(game.modal.isOpen).toBe(false);
    expect(game.reports.some((r) => r.startsWith('modal near (near)'))).toBe(true);
  });

  it('a new game shuts what is open', async () => {
    const game = await new FakeGame([]).start();
    const p = panel('a');
    game.modal.open(p.m);
    game.newGame();
    expect(game.modal.isOpen).toBe(false);
    expect(p.closed).toEqual(['owner']);
  });
});
