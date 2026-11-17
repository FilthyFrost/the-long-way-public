/**
 * ModCar's gamepad (docs/MODCAR.md §24, src/game/modcar/pad.ts): on foot, in a list, at the bench and in the seat
 * each button does what its key or mouse button does, once a press (or held, for what is held), and a pad that
 * comes or goes is said.
 */
import { describe, expect, it } from 'vitest';
import { ModPad, type PadHost } from '../../src/game/modcar/pad';

type Mode = 'foot' | 'seat' | 'list' | 'bench';

function host(mode: () => Mode): { h: PadHost; log: string[] } {
  const log: string[] = [];
  const h: PadHost = {
    seated: () => mode() === 'seat',
    listing: () => mode() === 'list',
    benchOpen: () => mode() === 'bench',
    bench: (code) => (log.push(`bench:${code}`), true),
    primary: (d) => log.push(`primary:${d}`),
    use: (d) => log.push(`use:${d}`),
    pack: () => log.push('pack'),
    hotbar: (s) => log.push(`hotbar:${s}`),
    listMove: (s) => log.push(`list:${s}`),
    listClose: () => log.push('listClose'),
    cards: () => log.push('cards'),
    help: () => log.push('help'),
    highlight: () => log.push('highlight'),
    camera: () => log.push('camera'),
    horn: (d) => log.push(`horn:${d}`),
    hazard: () => log.push('hazard'),
    upright: () => log.push('upright'),
    connected: (n) => log.push(`connected:${n}`),
  };
  return { h, log };
}

/** a pad in the standard layout with some buttons held */
function pad(held: number[], axes: number[] = [0, 0, 0, 0]): Gamepad {
  return {
    id: 'Test Pad (STANDARD GAMEPAD)',
    connected: true,
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: held.includes(i), touched: held.includes(i), value: held.includes(i) ? 1 : 0 })),
  } as unknown as Gamepad;
}

/** press a button for a frame and let it go */
function tap(p: ModPad, h: PadHost, b: number): void {
  p.update(h, [pad([b])]);
  p.update(h, [pad([])]);
}

describe('modcar · a gamepad', () => {
  it('is said when it comes and when it goes', () => {
    const { h, log } = host(() => 'foot');
    const p = new ModPad();
    p.update(h, [pad([])]);
    p.update(h, [null]);
    expect(log).toEqual(['connected:Test Pad (STANDARD GAMEPAD)', 'connected:']);
  });

  it('on foot: RT is the left button, X is E, the shoulders go through the hotbar, held buttons held', () => {
    const { h, log } = host(() => 'foot');
    const p = new ModPad();
    p.update(h, [pad([])]);
    log.length = 0;
    tap(p, h, 7);
    tap(p, h, 2);
    tap(p, h, 4);
    tap(p, h, 5);
    tap(p, h, 8);
    tap(p, h, 11);
    tap(p, h, 13);
    tap(p, h, 9);
    expect(log).toEqual(['primary:true', 'primary:false', 'use:true', 'use:false', 'hotbar:-1', 'hotbar:1', 'pack', 'cards', 'highlight', 'help']);
    // (held while held: take off with LT or B, put down Y, jump A, run with the stick pressed in)
    p.update(h, [pad([6, 3, 0, 10])]);
    expect([p.take, p.drop, p.jump, p.run]).toEqual([true, true, true, true]);
    p.update(h, [pad([1])]);
    expect([p.take, p.drop, p.jump, p.run]).toEqual([true, false, false, false]);
    p.update(h, [pad([])]);
    expect(p.take).toBe(false);
    // (once a press: a button held for many frames does it once)
    log.length = 0;
    for (let i = 0; i < 10; i++) p.update(h, [pad([5])]);
    expect(log).toEqual(['hotbar:1']);
  });

  it('in the seat: X gets out, LB the horn while held, RB the view, B the hazards, View sets it upright', () => {
    const { h, log } = host(() => 'seat');
    const p = new ModPad();
    p.update(h, [pad([])]);
    log.length = 0;
    tap(p, h, 2);
    p.update(h, [pad([4])]);
    p.update(h, [pad([4])]);
    p.update(h, [pad([])]);
    tap(p, h, 5);
    tap(p, h, 1);
    tap(p, h, 8);
    tap(p, h, 11);
    expect(log).toEqual(['use:true', 'use:false', 'horn:true', 'horn:false', 'camera', 'hazard', 'upright', 'primary:true', 'primary:false']);
    // (nothing on foot's held: the triggers and A are the pedals and the handbrake, the shared input's)
    p.update(h, [pad([6, 7, 0, 3])]);
    expect([p.take, p.drop, p.jump, p.run]).toEqual([false, false, false, false]);
  });

  it('in a list the d-pad chooses, X takes out, B closes; at the bench its keys', () => {
    let m: Mode = 'list';
    const { h, log } = host(() => m);
    const p = new ModPad();
    p.update(h, [pad([])]);
    log.length = 0;
    tap(p, h, 12);
    tap(p, h, 13);
    tap(p, h, 2);
    tap(p, h, 1);
    expect(log).toEqual(['list:-1', 'list:1', 'use:true', 'use:false', 'listClose']);
    m = 'bench';
    log.length = 0;
    tap(p, h, 13);
    tap(p, h, 15);
    tap(p, h, 0);
    tap(p, h, 1);
    expect(log).toEqual(['bench:ArrowDown', 'bench:ArrowRight', 'bench:Space', 'bench:Escape']);
  });

  it('a trigger counts once it is past half way; the right stick moves a scrubbing tool, past its dead zone', () => {
    const { h, log } = host(() => 'foot');
    const p = new ModPad();
    const half = (v: number): Gamepad => {
      const g = pad([]);
      (g.buttons as unknown as { value: number; pressed: boolean }[])[7] = { value: v, pressed: v > 0 };
      return g;
    };
    p.update(h, [half(0)]);
    log.length = 0;
    p.update(h, [half(0.4)]);
    expect(log).toEqual([]);
    p.update(h, [half(0.8)]);
    expect(log).toEqual(['primary:true']);
    p.update(h, [pad([], [0, 0, 0.05, -0.05])]);
    expect([p.rx, p.ry]).toEqual([0, 0]);
    p.update(h, [pad([], [0, 0, 1, -1])]);
    expect([p.rx, p.ry]).toEqual([1, -1]);
  });
});
