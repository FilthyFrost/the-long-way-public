/**
 * The V3 kernel's pure parts (src/core/kernel, docs/V3/nodes/N0-foundation.md): the event bus, the system
 * registry with its order, its error isolation and its timing, the save slices with their tolerant reading,
 * and the world clock that follows the hour of the day and never runs backwards. Also what the per-frame calls
 * cost and allocate with no system registered, which is how the game runs until the first system is in.
 */
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { DayClock } from '../../src/core/env/time';
import { DAY_SECONDS, WorldClock } from '../../src/core/kernel/clock';
import { EventBus, NOTHING, type GameEvents } from '../../src/core/kernel/events';
import { SaveSliceRegistry, type SaveSlice, type SliceRecord, type SliceReport } from '../../src/core/kernel/slices';
import { SystemRegistry, type System, type SystemPhase } from '../../src/core/kernel/systems';
import { Rng } from '../../src/core/math/rng';
import { ALLOCATES, HEAP_RUNS, heapGrowth } from './v3/heap';

// ------------------------------------------------------------------ events

interface TestEvents {
  ping: { n: number };
  pong: { text: string };
}

describe('kernel: event bus', () => {
  it('calls the listeners in the order they subscribed, and stops calling one that unsubscribed', () => {
    const bus = new EventBus<TestEvents>();
    const log: string[] = [];
    const offA = bus.on('ping', (e) => log.push(`a${e.n}`));
    bus.on('ping', (e) => log.push(`b${e.n}`));
    bus.on('pong', (e) => log.push(e.text));
    bus.emit('ping', { n: 1 });
    expect(log).toEqual(['a1', 'b1']);
    expect(bus.count('ping')).toBe(2);
    offA();
    offA();
    bus.emit('ping', { n: 2 });
    bus.emit('pong', { text: 'x' });
    expect(log).toEqual(['a1', 'b1', 'b2', 'x']);
    expect(bus.count('ping')).toBe(1);
  });

  it('the same function subscribed twice is two subscriptions', () => {
    const bus = new EventBus<TestEvents>();
    let n = 0;
    const fn = (): void => void n++;
    const off1 = bus.on('ping', fn);
    bus.on('ping', fn);
    bus.emit('ping', { n: 0 });
    expect(n).toBe(2);
    off1();
    bus.emit('ping', { n: 0 });
    expect(n).toBe(3);
  });

  it('reports a listener that throws and still calls the others', () => {
    const bus = new EventBus<TestEvents>();
    const log: string[] = [];
    const seen: [string, unknown][] = [];
    bus.onError = (type, error) => seen.push([type, error]);
    bus.on('ping', () => log.push('first'));
    bus.on('ping', () => {
      throw new Error('boom');
    });
    bus.on('ping', () => log.push('last'));
    bus.emit('ping', { n: 1 });
    expect(log).toEqual(['first', 'last']);
    expect(seen).toHaveLength(1);
    expect(seen[0][0]).toBe('ping');
    expect((seen[0][1] as Error).message).toBe('boom');
    expect(bus.errors).toBe(1);
    // (nobody told: still not thrown on)
    bus.onError = null;
    expect(() => bus.emit('ping', { n: 2 })).not.toThrow();
    expect(bus.errors).toBe(2);
  });

  it('does nothing with no listener', () => {
    const bus = new EventBus<TestEvents>();
    expect(bus.has('ping')).toBe(false);
    expect(() => bus.emit('ping', { n: 1 })).not.toThrow();
    const off = bus.on('ping', () => {});
    expect(bus.has('ping')).toBe(true);
    off();
    expect(bus.has('ping')).toBe(false);
    expect(bus.count('ping')).toBe(0);
  });

  it('a listener added during an emit is first called for the next one', () => {
    const bus = new EventBus<TestEvents>();
    const log: string[] = [];
    bus.on('ping', (e) => {
      log.push(`a${e.n}`);
      if (e.n === 1) bus.on('ping', (x) => log.push(`late${x.n}`));
    });
    bus.emit('ping', { n: 1 });
    expect(log).toEqual(['a1']);
    bus.emit('ping', { n: 2 });
    expect(log).toEqual(['a1', 'a2', 'late2']);
  });

  it('a listener removed during an emit is not called again, not even by that emit', () => {
    const bus = new EventBus<TestEvents>();
    const log: string[] = [];
    let offA: () => void = () => {};
    let offB: () => void = () => {};
    offA = bus.on('ping', () => {
      log.push('a');
      // (takes out the one after it, and itself)
      offB();
      offA();
    });
    offB = bus.on('ping', () => log.push('never'));
    bus.on('ping', () => log.push('c'));
    bus.emit('ping', { n: 1 });
    expect(log).toEqual(['a', 'c']);
    bus.emit('ping', { n: 2 });
    expect(log).toEqual(['a', 'c', 'c']);
    // one that takes itself out while it is called
    const bus2 = new EventBus<TestEvents>();
    let calls = 0;
    const off = bus2.on('ping', () => {
      calls++;
      off();
    });
    bus2.on('ping', () => void calls++);
    bus2.emit('ping', { n: 1 });
    bus2.emit('ping', { n: 2 });
    expect(calls).toBe(3);
  });

  it('an emit inside a listener runs to its end before the outer one goes on', () => {
    const bus = new EventBus<TestEvents>();
    const log: string[] = [];
    bus.on('ping', (e) => {
      log.push(`ping${e.n}`);
      if (e.n === 1) bus.emit('pong', { text: 'inner' });
    });
    bus.on('ping', () => log.push('after'));
    bus.on('pong', (e) => log.push(e.text));
    bus.emit('ping', { n: 1 });
    expect(log).toEqual(['ping1', 'inner', 'after']);
  });

  it('the open list of game events takes the clock’s by declaration merging', () => {
    const bus = new EventBus<GameEvents>();
    const days: number[] = [];
    bus.on('clock:day', (e) => days.push(e.day));
    bus.emit('clock:day', { day: 3, crossed: 1 });
    expect(days).toEqual([3]);
    expect(Object.isFrozen(NOTHING)).toBe(true);
  });

  it('allocates nothing when it emits, with or without listeners', () => {
    const bus = new EventBus<TestEvents>();
    const payload = { n: 1 };
    const counts = new Int32Array(1);
    expect(heapGrowth(() => bus.emit('ping', payload))).toBeLessThan(ALLOCATES / 4);
    bus.on('ping', (e) => void (counts[0] += e.n));
    bus.on('ping', (e) => void (counts[0] -= e.n));
    expect(heapGrowth(() => bus.emit('ping', payload))).toBeLessThan(ALLOCATES / 4);
    // (and the measure does see an allocation where there is one)
    let keep: unknown = null;
    expect(heapGrowth(() => void (keep = { n: counts[0] }))).toBeGreaterThan(ALLOCATES);
    void keep;
  });
});

// ------------------------------------------------------------------ systems

type Ctx = { log: string[] };

/** a clock for the timing that the test moves by hand */
function fakeClock(): { now: () => number; pass: (ms: number) => void } {
  let t = 0;
  return { now: () => t, pass: (ms) => void (t += ms) };
}

/** a system that writes each of its hooks into the context's log */
function logging(id: string, extra: Partial<System<Ctx>> = {}): System<Ctx> {
  return {
    id,
    init: (ctx) => void ctx.log.push(`${id}.init`),
    preStep: (_dt, ctx) => void ctx.log.push(`${id}.pre`),
    step: (_dt, ctx) => void ctx.log.push(`${id}.step`),
    lateUpdate: (_dt, ctx) => void ctx.log.push(`${id}.late`),
    dispose: () => {},
    ...extra,
  };
}

describe('kernel: system registry', () => {
  it('refuses a second system with the same id, a bad id, and one that comes after init', async () => {
    const reg = new SystemRegistry<Ctx>({ now: () => 0 });
    reg.add({ id: 'a' });
    expect(() => reg.add({ id: 'a' })).toThrow(/'a' is already registered/);
    expect(() => reg.add({ id: 'Bad Id' })).toThrow(/id must be/);
    expect(() => reg.add({ id: '' })).toThrow(/id must be/);
    await reg.init({ log: [] });
    expect(() => reg.add({ id: 'late' })).toThrow(/too late/);
    await expect(reg.init({ log: [] })).rejects.toThrow(/already/);
    expect(reg.size).toBe(1);
    expect(reg.get('a')?.id).toBe('a');
    expect(reg.get('nobody')).toBeUndefined();
  });

  it('keeps the order of registration, except that a system comes after those it names', () => {
    const reg = new SystemRegistry<Ctx>({ now: () => 0 });
    reg.add({ id: 'd', after: ['c'] });
    reg.add({ id: 'a' });
    reg.add({ id: 'c', after: ['b'] });
    reg.add({ id: 'b' });
    reg.add({ id: 'e' });
    // (a and b have nothing to wait for: in the order they came; c the moment b is placed; d after c; e last as it came)
    expect(reg.ids()).toEqual(['a', 'b', 'c', 'd', 'e']);
    // the same systems registered the other way round: still a valid order, and the same every time
    const reg2 = new SystemRegistry<Ctx>({ now: () => 0 });
    for (const s of [{ id: 'e' }, { id: 'b' }, { id: 'c', after: ['b'] }, { id: 'a' }, { id: 'd', after: ['c'] }]) reg2.add(s);
    expect(reg2.ids()).toEqual(['e', 'b', 'c', 'a', 'd']);
    expect(reg2.ids()).toEqual(reg2.ids());
  });

  it('says clearly what is wrong with an order that cannot be', async () => {
    const unknown = new SystemRegistry<Ctx>({ now: () => 0 });
    unknown.add({ id: 'hunting', after: ['ecology'] });
    unknown.add({ id: 'forage' });
    expect(() => unknown.ids()).toThrow("the system 'hunting' is to come after 'ecology', but no system with that id is registered (there are: hunting, forage)");
    await expect(unknown.init({ log: [] })).rejects.toThrow(/'ecology'/);

    const ring = new SystemRegistry<Ctx>({ now: () => 0 });
    ring.add({ id: 'free' });
    ring.add({ id: 'a', after: ['c'] });
    ring.add({ id: 'b', after: ['a'] });
    ring.add({ id: 'c', after: ['b', 'free'] });
    expect(() => ring.ids()).toThrow('systems wait for each other in a circle: a → c → b → a');
    await expect(ring.init({ log: [] })).rejects.toThrow(/in a circle/);

    const self = new SystemRegistry<Ctx>({ now: () => 0 });
    self.add({ id: 'me', after: ['me'] });
    expect(() => self.ids()).toThrow('systems wait for each other in a circle: me → me');
  });

  it('sets the systems up in order, each waiting for the one before it, and runs nothing until all are up', async () => {
    const ctx: Ctx = { log: [] };
    const reg = new SystemRegistry<Ctx>({ now: () => 0 });
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    reg.add(
      logging('slow', {
        init: async (c) => {
          c.log.push('slow.init begins');
          await gate;
          c.log.push('slow.init ends');
        },
      }),
    );
    reg.add(logging('quick'));
    const up = reg.init(ctx);
    await Promise.resolve();
    // (the frame's calls before the systems are up: nothing)
    reg.preStep(0.016, ctx);
    reg.step(0.016, ctx);
    reg.lateUpdate(0.016, ctx);
    expect(ctx.log).toEqual(['slow.init begins']);
    release();
    await up;
    expect(ctx.log).toEqual(['slow.init begins', 'slow.init ends', 'quick.init']);
    reg.preStep(0.016, ctx);
    reg.step(0.016, ctx);
    reg.lateUpdate(0.016, ctx);
    expect(ctx.log.slice(3)).toEqual(['slow.pre', 'quick.pre', 'slow.step', 'quick.step', 'slow.late', 'quick.late']);
  });

  it('reports a system whose init fails and never runs it; the others run', async () => {
    const ctx: Ctx = { log: [] };
    const errors: [string, SystemPhase, string][] = [];
    const reg = new SystemRegistry<Ctx>({ now: () => 0, onError: (id, phase, e) => errors.push([id, phase, (e as Error).message]) });
    reg.add(logging('good'));
    reg.add(logging('throws', { init: () => { throw new Error('no table'); } }));
    reg.add(logging('rejects', { init: () => Promise.reject(new Error('no model')) }));
    reg.add(logging('also-good', { after: ['throws'] }));
    await expect(reg.init(ctx)).resolves.toBeUndefined();
    expect(errors).toEqual([
      ['throws', 'init', 'no table'],
      ['rejects', 'init', 'no model'],
    ]);
    reg.preStep(0, ctx);
    reg.step(0, ctx);
    reg.lateUpdate(0, ctx);
    expect(ctx.log).toEqual(['good.init', 'also-good.init', 'good.pre', 'also-good.pre', 'good.step', 'also-good.step', 'good.late', 'also-good.late']);
    const t = reg.telemetry();
    expect(t.throws.failed).toBe(true);
    expect(t.rejects.failed).toBe(true);
    expect(t.good.failed).toBe(false);
    expect(t.throws.errors).toBe(1);
  });

  it('reports a system that throws in a frame, with its id and phase, and the frame goes on', async () => {
    const ctx: Ctx = { log: [] };
    const errors: string[] = [];
    const reg = new SystemRegistry<Ctx>({ now: () => 0 });
    reg.onError = (id, phase, e) => errors.push(`${id}/${phase}/${(e as Error).message}`);
    reg.add(logging('a'));
    reg.add(logging('b', { preStep: () => { throw new Error('pre'); }, step: () => { throw new Error('step'); }, lateUpdate: () => { throw new Error('late'); } }));
    reg.add(logging('c'));
    await reg.init(ctx);
    ctx.log.length = 0;
    for (let f = 0; f < 2; f++) {
      reg.preStep(0.016, ctx);
      reg.step(0.016, ctx);
      reg.lateUpdate(0.016, ctx);
    }
    expect(ctx.log).toEqual(['a.pre', 'c.pre', 'a.step', 'c.step', 'a.late', 'c.late', 'a.pre', 'c.pre', 'a.step', 'c.step', 'a.late', 'c.late']);
    expect(errors).toEqual(['b/preStep/pre', 'b/step/step', 'b/lateUpdate/late', 'b/preStep/pre', 'b/step/step', 'b/lateUpdate/late']);
    expect(reg.telemetry().b.errors).toBe(6);
    expect(reg.telemetry().a.errors).toBe(0);
    // (nobody told: the frame still goes on)
    reg.onError = null;
    expect(() => reg.step(0.016, ctx)).not.toThrow();
  });

  it('never hands a hook negative seconds: a frame of them is a frame of none', async () => {
    const ctx: Ctx = { log: [] };
    const seen: number[] = [];
    const reg = new SystemRegistry<Ctx>({ now: () => 0 });
    reg.add({ id: 'a', preStep: (dt) => void seen.push(dt), step: (dt) => void seen.push(dt), lateUpdate: (dt) => void seen.push(dt) });
    await reg.init(ctx);
    // (the game's loop can make its first frame a step of negative seconds; a harness steps with none)
    for (const dt of [-0.3, 0, 1 / 60, NaN, -0]) {
      reg.preStep(dt, ctx);
      reg.step(dt, ctx);
      reg.lateUpdate(dt, ctx);
    }
    expect(seen).toEqual([0, 0, 0, 0, 0, 0, 1 / 60, 1 / 60, 1 / 60, 0, 0, 0, 0, 0, 0]);
  });

  it('knows which systems are up: none before they are set up, not one whose init failed, none once they are taken down', async () => {
    const reg = new SystemRegistry<Ctx>({ now: () => 0 });
    reg.add({ id: 'second', after: ['first'] });
    reg.add({ id: 'broken', init: () => { throw new Error('x'); } });
    reg.add({ id: 'first' });
    // (as they were registered, whatever order they run in)
    expect(reg.registered).toEqual(['second', 'broken', 'first']);
    expect(reg.ids()).toEqual(['broken', 'first', 'second']);
    expect(['first', 'second', 'broken', 'nobody'].map((id) => reg.isLive(id))).toEqual([false, false, false, false]);
    await reg.init({ log: [] });
    expect(['first', 'second', 'broken', 'nobody'].map((id) => reg.isLive(id))).toEqual([true, true, false, false]);
    reg.dispose();
    expect(['first', 'second', 'broken'].map((id) => reg.isLive(id))).toEqual([false, false, false]);
    // an order that cannot be: nothing is set up, nothing is up
    const ring = new SystemRegistry<Ctx>({ now: () => 0 });
    ring.add({ id: 'a', after: ['b'] });
    ring.add({ id: 'b', after: ['a'] });
    ring.add({ id: 'free' });
    await expect(ring.init({ log: [] })).rejects.toThrow(/in a circle/);
    expect(['a', 'b', 'free'].map((id) => ring.isLive(id))).toEqual([false, false, false]);
  });

  it('runs only the hooks a system has', async () => {
    const ctx: Ctx = { log: [] };
    const reg = new SystemRegistry<Ctx>({ now: () => 0 });
    reg.add({ id: 'only-step', step: (_dt, c) => void c.log.push('s') });
    reg.add({ id: 'only-late', lateUpdate: (_dt, c) => void c.log.push('l') });
    reg.add({ id: 'nothing' });
    await reg.init(ctx);
    reg.preStep(0, ctx);
    reg.step(0, ctx);
    reg.lateUpdate(0, ctx);
    expect(ctx.log).toEqual(['s', 'l']);
    expect(reg.telemetry().nothing.frames).toBe(1);
  });

  it('times every system and phase with the clock handed in: smoothed, the longest, against the budget', async () => {
    const clock = fakeClock();
    const ctx: Ctx = { log: [] };
    const cost = { pre: 0.1, step: 0.2, late: 0.3 };
    const reg = new SystemRegistry<Ctx>({ now: clock.now });
    reg.add({ id: 'timed', budget: { cpuMs: 1 }, preStep: () => clock.pass(cost.pre), step: () => clock.pass(cost.step), lateUpdate: () => clock.pass(cost.late) });
    reg.add({ id: 'cheap', budget: { cpuMs: 0.05 }, step: () => clock.pass(0.01) });
    reg.add({ id: 'unbudgeted', step: () => clock.pass(5) });
    await reg.init(ctx);
    const frame = (): void => {
      reg.preStep(0.016, ctx);
      // (time that passes between the phases is nobody's)
      clock.pass(7);
      reg.step(0.016, ctx);
      clock.pass(7);
      reg.lateUpdate(0.016, ctx);
    };
    frame();
    let t = reg.telemetry();
    expect(t.timed.ms.pre).toBeCloseTo(0.1, 9);
    expect(t.timed.ms.step).toBeCloseTo(0.2, 9);
    expect(t.timed.ms.late).toBeCloseTo(0.3, 9);
    expect(t.timed.ms.total).toBeCloseTo(0.6, 9);
    expect(t.timed.max.total).toBeCloseTo(0.6, 9);
    expect(t.timed.budgetMs).toBe(1);
    expect(t.timed.over).toBe(false);
    expect(t.timed.overFrames).toBe(0);
    expect(t.cheap.ms.step).toBeCloseTo(0.01, 9);
    expect(t.cheap.ms.pre).toBe(0);
    expect(t.unbudgeted.budgetMs).toBeNull();
    expect(t.unbudgeted.over).toBe(false);
    expect(t.unbudgeted.ms.total).toBeCloseTo(5, 9);
    // one heavy frame: the longest remembers it, the smoothed value moves a twentieth of the way, the frame is counted
    cost.step = 4.2;
    frame();
    t = reg.telemetry();
    expect(t.timed.max.step).toBeCloseTo(4.2, 9);
    expect(t.timed.max.total).toBeCloseTo(4.6, 9);
    expect(t.timed.ms.total).toBeCloseTo(0.6 + (4.6 - 0.6) * 0.05, 9);
    expect(t.timed.over).toBe(false);
    expect(t.timed.overFrames).toBe(1);
    expect(t.timed.frames).toBe(2);
    // heavy for good: the smoothed value settles on it and the system is over its budget
    for (let i = 0; i < 200; i++) frame();
    t = reg.telemetry();
    expect(t.timed.ms.total).toBeCloseTo(4.6, 2);
    expect(t.timed.over).toBe(true);
    expect(t.timed.overFrames).toBe(201);
    expect(t.cheap.over).toBe(false);
    // from here on
    reg.resetTimings();
    cost.step = 0.2;
    frame();
    t = reg.telemetry();
    expect(t.timed.frames).toBe(1);
    expect(t.timed.max.total).toBeCloseTo(0.6, 9);
    expect(t.timed.over).toBe(false);
  });

  it('takes the systems down in reverse order, once, and nothing runs afterwards', async () => {
    const ctx: Ctx = { log: [] };
    const errors: string[] = [];
    const reg = new SystemRegistry<Ctx>({ now: () => 0, onError: (id, phase) => errors.push(`${id}/${phase}`) });
    reg.add(logging('a', { dispose: () => void ctx.log.push('a.dispose') }));
    reg.add(logging('b', { dispose: () => { ctx.log.push('b.dispose'); throw new Error('stuck'); } }));
    reg.add(logging('c', { dispose: () => void ctx.log.push('c.dispose') }));
    reg.add(logging('failed', { init: () => { throw new Error('x'); }, dispose: () => void ctx.log.push('failed.dispose') }));
    await reg.init(ctx);
    ctx.log.length = 0;
    reg.dispose();
    reg.dispose();
    expect(ctx.log).toEqual(['c.dispose', 'b.dispose', 'a.dispose']);
    expect(errors).toEqual(['failed/init', 'b/dispose']);
    reg.preStep(0, ctx);
    reg.step(0, ctx);
    reg.lateUpdate(0, ctx);
    expect(ctx.log).toHaveLength(3);
  });

  it('a registry taken down while the systems are still setting up takes down those that were up', async () => {
    const ctx: Ctx = { log: [] };
    const reg = new SystemRegistry<Ctx>({ now: () => 0 });
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    reg.add(logging('first', { dispose: () => void ctx.log.push('first.dispose') }));
    reg.add(logging('slow', { init: () => gate, dispose: () => void ctx.log.push('slow.dispose') }));
    reg.add(logging('never', { dispose: () => void ctx.log.push('never.dispose') }));
    const up = reg.init(ctx);
    await Promise.resolve();
    await Promise.resolve();
    reg.dispose();
    release();
    await up;
    expect(ctx.log).toEqual(['first.init', 'slow.dispose', 'first.dispose']);
    reg.step(0, ctx);
    expect(ctx.log).toHaveLength(3);
  });

  it('gives its telemetry as plain data, with what each system says of itself', async () => {
    const reg = new SystemRegistry<Ctx>({ now: () => 0 });
    reg.add({ id: 'says', telemetry: () => ({ nodes: 12, near: ['a', 'b'] }) });
    reg.add({ id: 'silent' });
    reg.add({ id: 'breaks', telemetry: () => { throw new Error('no'); } });
    // (before the systems are up nothing is asked of them)
    expect(reg.telemetry().says.own).toBeNull();
    await reg.init({ log: [] });
    const t = reg.telemetry();
    expect(Object.keys(t)).toEqual(['says', 'silent', 'breaks']);
    expect(t.says.own).toEqual({ nodes: 12, near: ['a', 'b'] });
    expect(t.silent.own).toBeNull();
    expect(t.breaks.own).toBeNull();
    expect(t.breaks.errors).toBe(1);
    expect(JSON.parse(JSON.stringify(t))).toEqual(t);
  });

  it('calls a system’s harness functions by name', async () => {
    const reg = new SystemRegistry<Ctx>({ now: () => 0 });
    let n = 0;
    reg.add({ id: 'forage', harness: { add: (by: number) => (n += by), count: () => n } });
    reg.add({ id: 'bare' });
    expect(reg.harness('forage', 'add', 3)).toBe(3);
    expect(reg.harness('forage', 'count')).toBe(3);
    expect(() => reg.harness('forage', 'nope')).toThrow("the system 'forage' has no harness function 'nope' (it has: add, count)");
    expect(() => reg.harness('bare', 'x')).toThrow(/has no harness function 'x'/);
    expect(() => reg.harness('ghost', 'x')).toThrow("no system 'ghost' (there are: forage, bare)");
  });

  it('allocates nothing in the frame’s three calls, with systems or without', async () => {
    const ctx: Ctx = { log: [] };
    const empty = new SystemRegistry<Ctx>({ now: () => 0 });
    await empty.init(ctx);
    const frameOf = (reg: SystemRegistry<Ctx>) => (): void => {
      reg.preStep(0.016, ctx);
      reg.step(0.016, ctx);
      reg.lateUpdate(0.016, ctx);
    };
    expect(heapGrowth(frameOf(empty))).toBeLessThan(ALLOCATES / 4);
    // (a clock of whole numbers, so that what is measured is the registry's own code: a clock that returns
    // fractions costs whatever the engine makes of its numbers, which the last test of this file prints)
    const counts = new Int32Array(4);
    const full = new SystemRegistry<Ctx>({ now: () => (counts[3] = (counts[3] + 1) & 0xffff) });
    for (let i = 0; i < 8; i++) full.add({ id: `s${i}`, budget: { cpuMs: 1 }, preStep: () => void counts[0]++, step: () => void counts[1]++, lateUpdate: () => void counts[2]++ });
    await full.init(ctx);
    expect(heapGrowth(frameOf(full))).toBeLessThan(ALLOCATES / 4);
    expect(full.telemetry().s7.frames).toBeGreaterThan(1000);
  });
});

// ------------------------------------------------------------------ save slices

/** a slice that keeps one value, and writes down what was done to it */
function slice<T>(id: string, version: number, first: T, more: Partial<SaveSlice<T>> = {}): SaveSlice<T> & { value: T; log: string[] } {
  const s = {
    id,
    version,
    value: first,
    log: [] as string[],
    snapshot: (): T | undefined => s.value,
    restore: (data: T, from: number): void => {
      s.value = data;
      s.log.push(`restore v${from}`);
    },
    clear: (): void => {
      s.value = first;
      s.log.push('clear');
    },
    ...more,
  };
  return s;
}

/** a registry that keeps what it reports */
function slices(): { reg: SaveSliceRegistry; told: SliceReport[] } {
  const reg = new SaveSliceRegistry();
  const told: SliceReport[] = [];
  reg.onReport = (r) => told.push(r);
  return { reg, told };
}

describe('kernel: save slices', () => {
  it('refuses a second slice with the same id, a bad id, a bad version', () => {
    const { reg } = slices();
    reg.register(slice('forage', 1, 0));
    expect(() => reg.register(slice('forage', 2, 0))).toThrow(/'forage' is already registered/);
    expect(() => reg.register(slice('Forage', 1, 0))).toThrow(/id must be/);
    expect(() => reg.register(slice('7', 1, 0))).toThrow(/id must be/);
    expect(() => reg.register(slice('ok', 0, 0))).toThrow(/whole version number/);
    expect(() => reg.register(slice('ok', 1.5, 0))).toThrow(/whole version number/);
    expect(reg.ids).toEqual(['forage']);
  });

  it('writes every slice under its id and version, in alphabetical order whatever order they came in', () => {
    const { reg } = slices();
    reg.register(slice('zeta', 3, { z: 1 }));
    reg.register(slice('alpha', 1, [1, 2]));
    reg.register(slice('nothing', 1, undefined));
    reg.register(slice('mid', 2, 'text'));
    const snap = reg.snapshot()!;
    expect(Object.keys(snap)).toEqual(['alpha', 'mid', 'zeta']);
    expect(snap).toEqual({ alpha: { v: 1, d: [1, 2] }, mid: { v: 2, d: 'text' }, zeta: { v: 3, d: { z: 1 } } });
    expect(JSON.stringify(snap)).toBe('{"alpha":{"v":1,"d":[1,2]},"mid":{"v":2,"d":"text"},"zeta":{"v":3,"d":{"z":1}}}');
  });

  it('writes nothing at all when no slice has anything to keep', () => {
    const { reg } = slices();
    expect(reg.snapshot()).toBeUndefined();
    reg.register(slice('empty', 1, undefined));
    expect(reg.snapshot()).toBeUndefined();
  });

  it('reads a record back: same version restored, older migrated first, missing cleared', () => {
    const { reg, told } = slices();
    const same = slice('same', 2, 0);
    const old = slice<{ picked: string[] }>('old', 3, { picked: [] }, {
      // (version 1 kept a plain list, version 2 an object without the wrapper's name)
      migrate: (data, from) => (from === 1 ? { picked: data as string[] } : { picked: (data as { list: string[] }).list }),
    });
    const missing = slice('missing', 1, 'fresh');
    missing.value = 'played';
    const handlesOld = slice<number | string>('handles-old', 2, 0);
    for (const s of [same, old, missing, handlesOld]) reg.register(s as SaveSlice);
    reg.restore({ same: { v: 2, d: 41 }, old: { v: 1, d: ['a', 'b'] }, 'handles-old': { v: 1, d: 'seven' } });
    expect(same.value).toBe(41);
    expect(same.log).toEqual(['restore v2']);
    expect(old.value).toEqual({ picked: ['a', 'b'] });
    expect(old.log).toEqual(['restore v1']);
    expect(missing.value).toBe('fresh');
    expect(missing.log).toEqual(['clear']);
    // (no migrate: restore is handed the old data and told its version)
    expect(handlesOld.value).toBe('seven');
    expect(handlesOld.log).toEqual(['restore v1']);
    expect(told).toEqual([]);
    expect(reg.reports).toEqual([]);
    // and version 2 of the same slice
    reg.restore({ old: { v: 2, d: { list: ['c'] } } });
    expect(old.value).toEqual({ picked: ['c'] });
  });

  it('does not read a newer version: the slice is cleared and the record carried unchanged into every snapshot', () => {
    const { reg, told } = slices();
    const forage = slice('forage', 2, { nodes: 0 });
    const other = slice('other', 1, 5);
    reg.register(forage);
    reg.register(other);
    const newer = { v: 7, d: { nodes: 99, somethingThisCodeDoesNotKnow: [1, 2, 3] } };
    reg.restore({ forage: newer, other: { v: 1, d: 6 } });
    expect(forage.log).toEqual(['clear']);
    expect(forage.value).toEqual({ nodes: 0 });
    expect(other.value).toBe(6);
    expect(told).toEqual([{ id: 'forage', what: 'newer', v: 7 }]);
    expect(reg.carriedIds).toEqual(['forage']);
    // played on with the older code: what it writes is the newer record, not its own state
    forage.value = { nodes: 3 };
    other.value = 8;
    const snap = reg.snapshot()!;
    expect(snap.forage).toBe(newer);
    expect(snap.other).toEqual({ v: 1, d: 8 });
    // … and through the save's text and back, again and again
    const again = slices();
    const forage2 = slice('forage', 2, { nodes: 0 });
    again.reg.register(forage2);
    again.reg.restore(JSON.parse(JSON.stringify(snap)));
    expect(again.reg.snapshot()!.forage).toEqual(newer);
    // the code catches up: the record is read
    const later = slices();
    const forage7 = slice('forage', 7, { nodes: 0 });
    later.reg.register(forage7);
    later.reg.restore(JSON.parse(JSON.stringify(again.reg.snapshot())));
    expect(forage7.value).toEqual(newer.d);
    // (this registry has no 'other': that one is carried here instead)
    expect(later.reg.carriedIds).toEqual(['other']);
    expect(later.told).toEqual([{ id: 'other', what: 'unknown', v: 1 }]);
  });

  it('carries a slice nobody registered, unchanged, so a save written with a system absent today is not destroyed', () => {
    const { reg, told } = slices();
    const here = slice('here', 1, 1);
    reg.register(here);
    const hunting = { v: 4, d: { herds: [{ at: [10, 20], n: 7 }], pressure: 0.25 } };
    reg.restore({ hunting, here: { v: 1, d: 2 }, aaa: { v: 1, d: null } });
    expect(told).toEqual([
      { id: 'hunting', what: 'unknown', v: 4 },
      { id: 'aaa', what: 'unknown', v: 1 },
    ]);
    expect(reg.carriedIds).toEqual(['aaa', 'hunting']);
    const snap = reg.snapshot()!;
    expect(Object.keys(snap)).toEqual(['aaa', 'here', 'hunting']);
    expect(snap.hunting).toBe(hunting);
    expect(snap.aaa).toEqual({ v: 1, d: null });
    // a new game drops them
    reg.clear();
    expect(reg.carriedIds).toEqual([]);
    expect(Object.keys(reg.snapshot()!)).toEqual(['here']);
  });

  it('a slice whose restore or migrate throws is reported and cleared, and the others are still read', () => {
    const { reg, told } = slices();
    const before = slice('a-before', 1, 0);
    const breaks = slice('b-breaks', 1, 'fresh', {
      restore: () => {
        throw new Error('bad shape');
      },
    });
    const migrates = slice('c-migrates', 2, 'fresh', {
      migrate: () => {
        throw new Error('too old');
      },
    });
    const after = slice('d-after', 1, 0);
    for (const s of [before, breaks, migrates, after]) reg.register(s as SaveSlice);
    reg.restore({ 'a-before': { v: 1, d: 1 }, 'b-breaks': { v: 1, d: 'x' }, 'c-migrates': { v: 1, d: 'y' }, 'd-after': { v: 1, d: 4 } });
    expect(before.value).toBe(1);
    expect(after.value).toBe(4);
    expect(breaks.log).toEqual(['clear']);
    expect(migrates.log).toEqual(['clear']);
    expect(told.map((r) => [r.id, r.what, r.v, (r.error as Error).message])).toEqual([
      ['b-breaks', 'restore', 1, 'bad shape'],
      ['c-migrates', 'migrate', 1, 'too old'],
    ]);
    expect(reg.telemetry().reports).toEqual([
      { id: 'b-breaks', what: 'restore', v: 1, error: 'bad shape' },
      { id: 'c-migrates', what: 'migrate', v: 1, error: 'too old' },
    ]);
    // (the cleared slices write their new-game state from now on; the records that would not read go on beside them)
    expect(reg.snapshot()).toEqual({
      'a-before': { v: 1, d: 1 },
      'b-breaks': { v: 1, d: 'fresh' },
      'b-breaks.unread': { v: 1, d: 'x' },
      'c-migrates': { v: 2, d: 'fresh' },
      'c-migrates.unread': { v: 1, d: 'y' },
      'd-after': { v: 1, d: 4 },
    });
    expect(reg.carriedIds).toEqual(['b-breaks.unread', 'c-migrates.unread']);
  });

  it('keeps a record that would not read under <id>.unread, from save to save, until a build takes it back', () => {
    const worth = { v: 1, d: { known: ['morel', 'nettle'], picked: 212 } };
    /** a build whose forage slice cannot read what is there (it throws whatever it is handed) */
    const broken = (): { reg: SaveSliceRegistry; told: SliceReport[]; forage: ReturnType<typeof slice<unknown>> } => {
      const x = slices();
      const forage = slice<unknown>('forage', 1, { known: [], picked: 0 }, {
        restore: () => {
          throw new Error('known is not a set');
        },
      });
      x.reg.register(forage);
      return { ...x, forage };
    };
    // the first page: the record does not read; the slice starts as new and is played on
    const first = broken();
    first.reg.restore({ forage: worth });
    expect(first.told.map((r) => `${r.id}:${r.what}`)).toEqual(['forage:restore']);
    first.forage.value = { known: ['dandelion'], picked: 1 };
    const save1 = JSON.parse(JSON.stringify(first.reg.snapshot())) as SliceRecord;
    expect(save1).toEqual({ forage: { v: 1, d: { known: ['dandelion'], picked: 1 } }, 'forage.unread': worth });
    // the second page, the same build: it fails again, on what the first page wrote — the record worth having stays
    const second = broken();
    second.reg.restore(save1);
    expect(second.told.map((r) => `${r.id}:${r.what}`)).toEqual(['forage.unread:unknown', 'forage:restore']);
    const save2 = JSON.parse(JSON.stringify(second.reg.snapshot())) as SliceRecord;
    expect(save2['forage.unread']).toEqual(worth);
    // a later build reads the slice again, and registers one under the other id to take the old record back
    const later = slices();
    const forage = slice('forage', 1, { known: [] as string[], picked: 0 });
    const rescued = slice<unknown>('forage.unread', 1, undefined);
    later.reg.register(forage);
    later.reg.register(rescued);
    later.reg.restore(save2);
    expect(rescued.value).toEqual(worth.d);
    expect(later.told).toEqual([]);
    expect(later.reg.carriedIds).toEqual([]);
    // (and a new game lets go of it)
    second.reg.clear();
    expect(second.reg.carriedIds).toEqual([]);
  });

  it('takes a slice’s data through the save’s own format: what it hands out is a copy, and what it keeps for a bad day is not the slice’s own object', () => {
    const { reg, told } = slices();
    // (a slice that hands out the very object it works on, and keeps the one it is handed: nothing forbids either)
    const state = { picked: 1, bare: [1] };
    let live = state;
    let broken = false;
    reg.register<typeof state>({
      id: 'live',
      version: 1,
      snapshot: () => {
        if (broken) throw new Error('mid-change');
        return live;
      },
      restore: (d) => void (live = d),
    });
    const first = reg.snapshot()!;
    expect(first.live).toEqual({ v: 1, d: { picked: 1, bare: [1] } });
    expect(first.live.d).not.toBe(state);
    // the slice's state moves on: the snapshot handed out does not
    state.picked = 2;
    state.bare.push(2, 3);
    expect(first.live.d).toEqual({ picked: 1, bare: [1] });
    // … and when the next snapshot throws, the slice is written as it last WAS
    broken = true;
    expect(reg.snapshot()).toEqual({ live: { v: 1, d: { picked: 1, bare: [1] } } });
    // the same for what it was restored from: the slice keeps the object it is handed and changes it
    const record = { live: { v: 1, d: { picked: 40, bare: [7] } } };
    broken = false;
    reg.restore(record);
    live.picked = 41;
    live.bare.length = 0;
    broken = true;
    expect(reg.snapshot()).toEqual({ live: { v: 1, d: { picked: 40, bare: [7] } } });
    expect(told.map((r) => `${r.id}:${r.what}`)).toEqual(['live:snapshot', 'live:snapshot']);
    // (what cannot be had in JSON is written as JSON has it: a member that is not there, a number that is not one)
    const odd = slices();
    odd.reg.register({ id: 'odd', version: 1, snapshot: () => ({ a: undefined, n: NaN, when: new Date(0) }), restore: () => {} });
    expect(odd.reg.snapshot()).toEqual({ odd: { v: 1, d: { n: null, when: '1970-01-01T00:00:00.000Z' } } });
  });

  it('a slice whose data JSON cannot hold is reported and written as it last was; the others are written, and the whole is a save that can be', () => {
    const circle: Record<string, unknown> = { name: 'bush' };
    circle.owner = { bushes: [circle] };
    const cases: [string, () => unknown, RegExp][] = [
      ['a circle between live objects', () => circle, /circular/i],
      ['a BigInt', () => ({ n: 10n }), /BigInt/],
      ['a toJSON that throws', () => ({ toJSON: () => { throw new Error('half built'); } }), /half built/],
      ['a function for its data', () => () => 1, /not something JSON can hold/],
    ];
    for (const [name, bad, why] of cases) {
      const { reg, told } = slices();
      let faulty = false;
      const picked = { picked: 1 };
      reg.register<unknown>({ id: 'bad', version: 3, snapshot: () => (faulty ? bad() : { fine: true }), restore: () => {} });
      const good = slice('good', 1, picked);
      reg.register(good);
      expect(JSON.stringify(reg.snapshot()), name).toBe('{"bad":{"v":3,"d":{"fine":true}},"good":{"v":1,"d":{"picked":1}}}');
      // the fault sets in; the good slice has moved on meanwhile
      faulty = true;
      picked.picked = 2;
      const snap = reg.snapshot();
      // (the test of it: the save's text can be made — this is what writeSave does, and what used to throw)
      expect(JSON.stringify(snap), name).toBe('{"bad":{"v":3,"d":{"fine":true}},"good":{"v":1,"d":{"picked":2}}}');
      expect(told.map((r) => `${r.id}:${r.what}`), name).toEqual(['bad:snapshot']);
      expect((told[0].error as Error).message, name).toMatch(why);
      // every save from then on is written the same way, and reported
      picked.picked = 3;
      expect(JSON.stringify(reg.snapshot()), name).toContain('"good":{"v":1,"d":{"picked":3}}');
      expect(told).toHaveLength(2);
      // (what there is to report holds one entry for the slice, however often it fails)
      expect(reg.reports).toHaveLength(1);
      expect(reg.telemetry().reports[0]).toMatchObject({ id: 'bad', what: 'snapshot' });
    }
    // one that never had anything good to write is left out, alone
    const { reg } = slices();
    reg.register<unknown>({ id: 'bad', version: 1, snapshot: () => circle, restore: () => {} });
    reg.register(slice('good', 1, 5));
    expect(reg.snapshot()).toEqual({ good: { v: 1, d: 5 } });
  });

  it('a slice set aside is neither read, cleared nor asked: its record goes on as it came until the slice is read again', () => {
    const record = { forage: { v: 2, d: { bare: { 0: 0, 3: 0, 5: 0 }, picked: 12 } }, skills: { v: 1, d: [3, 0, 1] } };
    const { reg, told } = slices();
    const forage = slice<unknown>('forage', 2, { bare: {}, picked: 0 });
    const skills = slice('skills', 1, [0, 0, 0]);
    reg.register(forage);
    reg.register(skills);
    // (the system the forage slice belongs to did not come up)
    reg.hold('forage');
    reg.hold('forage');
    reg.hold('nobody');
    expect(reg.heldIds).toEqual(['forage']);
    reg.restore(JSON.parse(JSON.stringify(record)));
    expect(forage.log).toEqual([]);
    expect(skills.value).toEqual([3, 0, 1]);
    expect(told).toEqual([{ id: 'forage', what: 'held', v: 2 }]);
    expect(reg.carriedIds).toEqual(['forage']);
    // played on: the slice's own state (a system that never built its bushes) is not what is written
    forage.value = { bare: {}, picked: 12 };
    skills.value = [4, 0, 1];
    const save = JSON.parse(JSON.stringify(reg.snapshot())) as SliceRecord;
    expect(save).toEqual({ forage: record.forage, skills: { v: 1, d: [4, 0, 1] } });
    expect(forage.log).toEqual([]);
    expect(reg.telemetry()).toMatchObject({ held: ['forage'], carried: ['forage'] });
    // the next page, on which the system comes up: the record is read as if nothing had been
    const next = slices();
    const forage2 = slice<unknown>('forage', 2, { bare: {}, picked: 0 });
    next.reg.register(forage2);
    next.reg.register(slice('skills', 1, [0, 0, 0]));
    next.reg.restore(save);
    expect(forage2.value).toEqual(record.forage.d);
    expect(next.told).toEqual([]);
    // set aside with nothing in the save: nothing is written of it, and nothing said
    const fresh = slices();
    const idle = slice('forage', 2, 'state of a system that is not running');
    fresh.reg.register(idle);
    fresh.reg.hold('forage');
    fresh.reg.restore(undefined);
    expect(fresh.reg.snapshot()).toBeUndefined();
    expect(fresh.told).toEqual([]);
    // a new game: its record is let go like the others, the slice itself still left alone
    reg.clear();
    expect(forage.log).toEqual([]);
    expect(reg.snapshot()).toEqual({ skills: { v: 1, d: [0, 0, 0] } });
  });

  it('a slice set aside after it was read goes on as it was read, or as it last wrote', () => {
    const { reg } = slices();
    const a = slice('a', 1, 0);
    const b = slice('b', 1, 0);
    reg.register(a);
    reg.register(b);
    reg.restore({ a: { v: 1, d: 7 }, b: { v: 1, d: 8 } });
    b.value = 9;
    reg.snapshot();
    a.value = 100;
    b.value = 100;
    reg.hold('a');
    reg.hold('b');
    expect(reg.snapshot()).toEqual({ a: { v: 1, d: 7 }, b: { v: 1, d: 9 } });
  });

  it('a slice whose clear throws, or whose record is not a record, stops nothing', () => {
    const { reg, told } = slices();
    const stuck = slice('stuck', 1, 0, {
      clear: () => {
        throw new Error('held');
      },
    });
    const odd = slice('odd', 1, 'fresh');
    const fine = slice('fine', 1, 0);
    for (const s of [stuck, odd, fine]) reg.register(s as SaveSlice);
    odd.value = 'played';
    // (as the save's text gives it: a key named __proto__ is a key like any other there)
    reg.restore(JSON.parse('{"odd":"not a record","fine":{"v":1,"d":9},"junk":5,"__proto__":{"v":1,"d":0}}'));
    expect(fine.value).toBe(9);
    expect(odd.value).toBe('fresh');
    expect(told.map((r) => `${r.id}:${r.what}`)).toEqual(['stuck:clear', 'odd:malformed']);
    expect(reg.carriedIds).toEqual([]);
    expect(() => reg.clear()).not.toThrow();
  });

  it('a save from before there were slices clears every slice', () => {
    const { reg, told } = slices();
    const a = slice('a', 1, 'fresh');
    const b = slice('b', 1, 'fresh');
    reg.register(a);
    reg.register(b);
    for (const none of [undefined, null, 'text', 7, [1, 2]]) {
      a.value = b.value = 'played';
      reg.restore(none);
      expect([a.value, b.value]).toEqual(['fresh', 'fresh']);
    }
    expect(told).toEqual([]);
  });

  it('a slice whose snapshot throws is reported and written as it last was', () => {
    const { reg, told } = slices();
    let broken = false;
    let value = 1;
    const shaky: SaveSlice<number> = {
      id: 'shaky',
      version: 1,
      snapshot: () => {
        if (broken) throw new Error('mid-change');
        return value;
      },
      restore: (d) => void (value = d),
      clear: () => void (value = 1),
    };
    const steady = slice('steady', 1, 'ok');
    reg.register(shaky);
    reg.register(steady);
    // (never written, nothing restored: there is nothing to write in its stead)
    broken = true;
    expect(reg.snapshot()).toEqual({ steady: { v: 1, d: 'ok' } });
    broken = false;
    value = 2;
    expect(reg.snapshot()!.shaky).toEqual({ v: 1, d: 2 });
    broken = true;
    value = 3;
    expect(reg.snapshot()).toEqual({ shaky: { v: 1, d: 2 }, steady: { v: 1, d: 'ok' } });
    expect(told.map((r) => `${r.id}:${r.what}`)).toEqual(['shaky:snapshot', 'shaky:snapshot']);
    // restored from a save and then failing: the save's own record goes back out
    reg.restore({ shaky: { v: 1, d: 40 } });
    expect(reg.snapshot()!.shaky).toEqual({ v: 1, d: 40 });
  });

  it('a slice registered after the save was read is restored from its carried record there and then', () => {
    const { reg, told } = slices();
    reg.restore({ late: { v: 1, d: 'kept' }, later: { v: 5, d: 'newer' } });
    expect(reg.carriedIds).toEqual(['late', 'later']);
    const late = slice('late', 1, 'fresh');
    reg.register(late);
    expect(late.value).toBe('kept');
    expect(reg.carriedIds).toEqual(['later']);
    // (one that came late and is too old for its record: still carried)
    const later = slice('later', 2, 'fresh');
    reg.register(later);
    expect(later.value).toBe('fresh');
    expect(reg.snapshot()).toEqual({ late: { v: 1, d: 'kept' }, later: { v: 5, d: 'newer' } });
    expect(told.map((r) => `${r.id}:${r.what}`)).toEqual(['late:unknown', 'later:unknown', 'later:newer']);
  });

  it('clears every slice for a new game', () => {
    const { reg } = slices();
    const a = slice('a', 1, 'fresh');
    const noClear: SaveSlice<number> = { id: 'no-clear', version: 1, snapshot: () => 1, restore: () => {} };
    reg.register(a);
    reg.register(noClear);
    reg.restore({ a: { v: 1, d: 'played' }, gone: { v: 1, d: 1 } });
    reg.clear();
    expect(a.value).toBe('fresh');
    expect(reg.snapshot()).toEqual({ a: { v: 1, d: 'fresh' }, 'no-clear': { v: 1, d: 1 } } satisfies SliceRecord);
    expect(reg.telemetry()).toEqual({ ids: ['a', 'no-clear'], carried: [], held: [], reports: [] });
  });
});

// ------------------------------------------------------------------ the world clock

/** tell a clock the hour (through one hand that is used again and again, as the game's sky is) */
const hand = { hour: 0 };
function tell(c: WorldClock, hour: number): boolean {
  hand.hour = hour;
  return c.sync(hand);
}

describe('kernel: world clock', () => {
  it('begins at nothing and moves forward with the hour, 86,400 seconds to a day', () => {
    const c = new WorldClock();
    c.begin(9.2);
    expect([c.worldSeconds, c.day, c.hour, c.startHour]).toEqual([0, 0, 9.2, 9.2]);
    expect(tell(c, 9.2)).toBe(false);
    expect(tell(c, 9.7)).toBe(true);
    expect(c.worldSeconds).toBeCloseTo(1800, 9);
    expect([c.hoursCrossed, c.daysCrossed]).toEqual([0, 0]);
    expect(tell(c, 10.25)).toBe(true);
    expect([c.hoursCrossed, c.daysCrossed, c.day]).toEqual([1, 0, 0]);
    // round the dial in small steps, to the hour it began at the next day
    let h = 10.25;
    let hours = 0;
    let days = 0;
    // (24 hours in steps of 0.013: some 1,850 of them; a clock that stopped counting days must fail here, not spin)
    let steps = 0;
    while ((c.day === 0 || c.hour < 9.2) && steps++ < 4000) {
      h = (h + 0.013) % 24;
      if (c.day === 1 && h > 9.2) h = 9.2;
      tell(c, h);
      hours += c.hoursCrossed;
      days += c.daysCrossed;
    }
    expect(steps).toBeLessThan(4000);
    expect(c.worldSeconds).toBeCloseTo(DAY_SECONDS, 6);
    expect([c.day, c.hour]).toEqual([1, 9.2]);
    expect(days).toBe(1);
    // (11, 12, … 23, 0, 1, … 9: twenty-three more whole hours)
    expect(hours).toBe(23);
  });

  it('never runs backwards: an hour set back by hand is that hour the next day', () => {
    const c = new WorldClock();
    c.begin(12);
    tell(c, 18);
    expect(c.worldSeconds).toBe(6 * 3600);
    // back to 15:00 by hand
    tell(c, 15);
    expect([c.day, c.hour]).toEqual([1, 15]);
    expect(c.worldSeconds).toBe(27 * 3600);
    expect([c.hoursCrossed, c.daysCrossed]).toEqual([21, 1]);
    // forward by hand past midnight
    tell(c, 2.5);
    expect([c.day, c.hour, c.hoursCrossed, c.daysCrossed]).toEqual([2, 2.5, 11, 1]);
    // any hours at all, in any order: the seconds only ever grow, by the way round the dial
    const rng = new Rng(20261118);
    let last = c.worldSeconds;
    let lastHour = c.hour;
    for (let i = 0; i < 5000; i++) {
      const to = rng.next() < 0.5 ? (lastHour + rng.range(0, 0.4)) % 24 : rng.range(0, 24);
      const moved = tell(c, to);
      const forward = (((to - lastHour) % 24) + 24) % 24;
      if (moved) {
        expect(c.worldSeconds).toBeGreaterThan(last);
        expect(c.worldSeconds - last).toBeCloseTo(forward * 3600, 5);
        expect(c.hour).toBe(to);
        lastHour = to;
      } else expect(c.worldSeconds).toBe(last);
      expect(c.worldSeconds).toBeCloseTo((c.day * 24 + c.hour - 12) * 3600, 6);
      last = c.worldSeconds;
    }
    expect(c.day).toBeGreaterThan(1000);
  });

  it('holds its hour when the hour hand only quivers back, across midnight too', () => {
    const c = new WorldClock();
    c.begin(8);
    tell(c, 8.5);
    const s = c.worldSeconds;
    expect(tell(c, 8.5 - 1e-9)).toBe(false);
    expect([c.worldSeconds, c.day, c.hour]).toEqual([s, 0, 8.5]);
    // just after midnight, a quiver back to just before it
    tell(c, 23.9999999);
    tell(c, 1e-8);
    expect([c.day, c.hoursCrossed, c.daysCrossed]).toEqual([1, 1, 1]);
    const s2 = c.worldSeconds;
    expect(tell(c, 23.99999999)).toBe(false);
    expect([c.worldSeconds, c.day, c.hour]).toEqual([s2, 1, 1e-8]);
    // a real step back (a slider's smallest) is the next day
    expect(tell(c, 24 - 0.0167)).toBe(true);
    expect(c.day).toBe(1);
    expect(tell(c, 24 - 2 * 0.0167)).toBe(true);
    expect(c.day).toBe(2);
  });

  it('takes any number for an hour, and nothing for what is not a number', () => {
    const c = new WorldClock();
    c.begin(30);
    expect(c.hour).toBe(6);
    tell(c, 25.5);
    expect([c.day, c.hour]).toEqual([1, 1.5]);
    tell(c, -1);
    expect([c.day, c.hour]).toEqual([1, 23]);
    const s = c.worldSeconds;
    expect(tell(c, NaN)).toBe(false);
    expect(tell(c, Infinity)).toBe(false);
    expect(c.worldSeconds).toBe(s);
    c.begin(NaN);
    expect([c.hour, c.worldSeconds]).toEqual([0, 0]);
  });

  it('follows the environment’s day clock: its uneven pace, a stopped clock, the hour set by hand', () => {
    const day = new DayClock();
    day.setHour(9.2, 0);
    const c = new WorldClock();
    c.begin(day.hourAt(0));
    const dt = 1 / 60;
    let t = 0;
    let last = 0;
    let hours = 0;
    let days = 0;
    let wentBack = 0;
    const run = (seconds: number, speed = 1): void => {
      const n = Math.round(seconds / dt);
      for (let i = 0; i < n; i++) {
        t += dt;
        // (the developer's time speed, as devWorld.ts applies it every frame before the hour is read)
        if (speed !== 1) day.advance(dt * (speed - 1));
        tell(c, day.hourAt(t));
        if (c.worldSeconds < last) wentBack++;
        last = c.worldSeconds;
        hours += c.hoursCrossed;
        days += c.daysCrossed;
      }
    };
    // three of the day clock's days (2,400 s each): three game days, whatever the pace within them
    run(3 * day.dayLength);
    expect(c.worldSeconds).toBeCloseTo(3 * DAY_SECONDS, 3);
    expect(c.day).toBe(3);
    expect(days).toBe(3);
    expect(hours).toBe(72);
    expect(c.hour).toBeCloseTo(9.2, 6);
    // the working day passes more slowly than the night: an hour of real time at noon is less game time than one at midnight
    const noon = new WorldClock();
    const night = new WorldClock();
    const d2 = new DayClock();
    d2.setHour(12, 0);
    noon.begin(12);
    tell(noon, d2.hourAt(60));
    d2.setHour(0, 0);
    night.begin(0);
    tell(night, d2.hourAt(60));
    expect(night.worldSeconds).toBeGreaterThan(noon.worldSeconds * 1.2);
    // time held still in the panel (every frame's seconds taken off the day clock again): the clock stands, for
    // as long as it lasts, but for what the rounding of those sums lets through — and that never backwards
    const held = c.worldSeconds;
    const heldHour = c.hour;
    run(120, 0);
    expect(c.worldSeconds - held).toBeGreaterThanOrEqual(0);
    expect(c.worldSeconds - held).toBeLessThan(1e-6);
    expect(c.day).toBe(3);
    // sixty times as fast for a minute: the day clock goes round one and a half times — a whole day, and on to
    // the hour that is half its round further (not twelve hours further: its round is uneven)
    run(60, 60);
    const there = DayClock.hourOfPhase(DayClock.phaseOfHour(heldHour) + 1.5);
    expect(there).toBeGreaterThan(heldHour);
    expect(c.worldSeconds - held).toBeCloseTo((24 + there - heldHour) * 3600, 2);
    expect(c.day).toBe(4);
    // the hour set by hand, forward and back
    const before = c.worldSeconds;
    const was = c.hour;
    day.setHour((was + 2) % 24, t);
    tell(c, day.hourAt(t));
    expect(c.worldSeconds - before).toBeCloseTo(2 * 3600, 3);
    day.setHour(was, t);
    tell(c, day.hourAt(t));
    expect(c.worldSeconds - before).toBeCloseTo(DAY_SECONDS, 3);
    // a day of another length keeps the hour: the clock does not notice
    const kept = c.worldSeconds;
    day.setDayLength(600, t);
    tell(c, day.hourAt(t));
    expect(c.worldSeconds - kept).toBeLessThan(0.01);
    expect(c.worldSeconds).toBeGreaterThanOrEqual(kept);
    expect(wentBack).toBe(0);
  });

  it('waits when the session’s time steps back (the loop can hand its first frame negative seconds), then goes on', () => {
    const day = new DayClock();
    day.setHour(9.2, 0);
    const sky = { hour: 0 };
    const session = { time: 0 };
    const c = new WorldClock();
    c.begin(day.hourAt(0));
    const step = (dt: number): boolean => {
      session.time += dt;
      sky.hour = day.hourAt(session.time);
      return c.sync(sky, session);
    };
    // the first frame: a third of a second backwards. The hour is behind the one the journey began at
    expect(step(-0.3)).toBe(false);
    expect(sky.hour).toBeLessThan(c.hour - 1e-4);
    expect([c.day, c.worldSeconds, c.hoursCrossed, c.daysCrossed]).toEqual([0, 0, 0, 0]);
    // the next frames catch up: still nothing
    expect(step(0.1)).toBe(false);
    expect(step(0.1)).toBe(false);
    expect([c.day, c.worldSeconds]).toEqual([0, 0]);
    // caught up and past: the clock goes on, on the same day
    step(0.1);
    expect(step(0.1)).toBe(true);
    expect(c.day).toBe(0);
    expect(c.worldSeconds).toBeGreaterThan(3);
    expect(c.worldSeconds).toBeLessThan(6);
    // (a clock not told the session's time takes the same first frame for the hour set back: a day gone)
    const naive = new WorldClock();
    naive.begin(day.hourAt(0));
    sky.hour = day.hourAt(-0.3);
    naive.sync(sky);
    expect(naive.day).toBe(1);
    // the hour set back by hand, at a time that has not stepped back, is still the next day
    const before = c.worldSeconds;
    day.setHour(c.hour - 0.5, session.time);
    expect(step(0)).toBe(true);
    expect(c.day).toBe(1);
    expect(c.worldSeconds - before).toBeCloseTo(23.5 * 3600, 3);
    // and a step back in the middle of a session is waited out the same way
    const there = c.worldSeconds;
    expect(step(-1)).toBe(false);
    expect(step(0.5)).toBe(false);
    expect(c.worldSeconds).toBe(there);
    expect(step(0.6)).toBe(true);
    expect(c.day).toBe(1);
    expect(c.worldSeconds - there).toBeLessThan(10);
  });

  it('waits for the hour hand when the day’s length is set on a first frame of negative seconds (the developer’s dial)', () => {
    // A step of the game, in its order (ModGame.step, updateViews): the session's time goes on; the developer's
    // tools give the day its length the first time they run, keeping the hour AT THAT TIME (devWorld.ts
    // beforeEnv); the environment reads the hour; the clock is told. With the first step one of negative
    // seconds, the day is anchored at a time before the session began, and a longer day then brings the hour
    // back to where the clock stands more slowly than the time comes back.
    for (const [minutes, first] of [[120, -0.01], [240, -0.004], [60, -0.04], [240, -0.5], [40, -0.3], [2, -0.3]] as const) {
      const day = new DayClock();
      day.setHour(9.2, 0);
      const c = new WorldClock();
      c.begin(day.hourAt(0));
      const sky = { hour: 0 };
      const session = { time: 0 };
      let applied = false;
      let days = 0;
      let behind = 0;
      const step = (dt: number): void => {
        session.time += dt;
        if (!applied) {
          day.setDayLength(minutes * 60, session.time);
          applied = true;
        }
        sky.hour = day.hourAt(session.time);
        // (the time has caught up, the hour has not: the case that used to cost a day)
        if (session.time >= 0 && sky.hour < c.hour - 1e-6) behind++;
        c.sync(sky, session);
        days += c.daysCrossed;
      };
      step(first);
      expect(c.waiting, `${minutes} min`).toBe(true);
      for (let i = 0; i < 600; i++) step(1 / 60);
      expect([c.day, days], `${minutes} min, first frame ${first} s`).toEqual([0, 0]);
      expect(c.waiting).toBe(false);
      // ten seconds on, the clock has gone on with the hour and by no more than the hour went
      expect(c.hour).toBe(sky.hour);
      expect(c.worldSeconds).toBeCloseTo((sky.hour - 9.2) * 3600, 6);
      expect(c.worldSeconds).toBeGreaterThan(0);
      // (the longer days are the ones that leave the hour behind for a while)
      if (minutes > 40) expect(behind, `${minutes} min`).toBeGreaterThan(0);
    }
  });

  it('a save written while the clock waits is taken up without a day gone by', () => {
    const day = new DayClock();
    day.setHour(9.2, 0);
    const c = new WorldClock();
    c.begin(day.hourAt(0));
    const sky = { hour: 0 };
    const session = { time: 0 };
    // the first frame, a third of a second backwards; the page is hidden there and then and writes its save
    // (ModGame.snapshot: the hour the environment shows at the session's time, and the clock beside it)
    session.time -= 0.3;
    sky.hour = day.hourAt(session.time);
    expect(c.sync(sky, session)).toBe(false);
    expect(c.waiting).toBe(true);
    const save = JSON.parse(JSON.stringify({ hour: day.hourAt(session.time), clock: c.snapshot() })) as { hour: number; clock: unknown };
    expect(save.clock).toEqual({ day: 0, hour: day.hourAt(0), start: day.hourAt(0) });
    // (the hour in it is behind the clock in it)
    expect(save.hour).toBeLessThan(day.hourAt(0) - 1e-3);
    // The page opened again (ModGame: the environment starts at the saved hour, the clock is begun there and
    // then takes the saved clock back), and played for ten seconds — its own first frame backwards again or not
    for (const first of [1 / 60, -0.05, 0]) {
      const day2 = new DayClock();
      day2.setHour(save.hour, 0);
      const c2 = new WorldClock();
      c2.begin(day2.hourAt(0));
      expect(c2.restore(save.clock)).toBe(true);
      expect(c2.waiting).toBe(true);
      const session2 = { time: 0 };
      let crossed = 0;
      const step = (dt: number): void => {
        session2.time += dt;
        sky.hour = day2.hourAt(session2.time);
        c2.sync(sky, session2);
        crossed += c2.daysCrossed + c2.hoursCrossed;
      };
      step(first);
      // (still behind where the clock was saved: nothing has passed, and above all not a day)
      expect([c2.day, c2.worldSeconds, c2.waiting], `first frame ${first} s`).toEqual([0, 0, true]);
      for (let i = 0; i < 600; i++) step(1 / 60);
      expect([c2.day, crossed, c2.waiting]).toEqual([0, 0, false]);
      expect(c2.hour).toBe(sky.hour);
      expect(c2.worldSeconds).toBeGreaterThan(0);
      expect(c2.worldSeconds).toBeLessThan(600);
    }
  });

  it('waits only for a hand a little behind, and only until the hand has come up: after that an hour set back is the next day again', () => {
    const saved = { day: 2, hour: 14, start: 9 };
    // a clock taken back from a save waits; a hand at its hour, or past it, ends the wait at once
    for (const first of [14, 14.0001, 17.5, 3]) {
      const c = new WorldClock();
      c.restore(saved);
      expect(c.waiting).toBe(true);
      tell(c, first);
      expect(c.waiting, `first hour ${first}`).toBe(false);
      // (3 o'clock is 13 hours on round the dial: the next day)
      expect([c.day, c.hour]).toEqual([first < 14 ? 3 : 2, first]);
      // … and from then on a minute back by hand is the next day, as it always was
      const day = c.day;
      tell(c, first - 1 / 60);
      expect(c.day).toBe(day + 1);
    }
    // a hand found a little behind is waited for: nothing passes until it has come up to the clock
    const c = new WorldClock();
    c.restore(saved);
    expect(tell(c, 13.95)).toBe(false);
    expect(tell(c, 13.99)).toBe(false);
    expect([c.day, c.hour, c.worldSeconds, c.waiting]).toEqual([2, 14, (2 * 24 + 14 - 9) * 3600, true]);
    expect(tell(c, 14.02)).toBe(true);
    expect([c.day, c.waiting]).toEqual([2, false]);
    // a hand found further behind than a quarter of an hour was set there by hand: the next day, wait or no wait
    const d = new WorldClock();
    d.restore(saved);
    expect(tell(d, 13.5)).toBe(true);
    expect([d.day, d.hour, d.waiting]).toEqual([3, 13.5, false]);
    // a journey begun (not taken up) does not wait: its first hour set back is the next day
    const e = new WorldClock();
    e.begin(14);
    expect(e.waiting).toBe(false);
    tell(e, 13.95);
    expect(e.day).toBe(1);
    // … and beginning again ends a wait
    c.restore(saved);
    c.begin(8);
    expect(c.waiting).toBe(false);
  });

  it('goes into the save and comes back the same', () => {
    const c = new WorldClock();
    c.begin(9.2);
    tell(c, 17.123456789);
    tell(c, 3.3);
    const saved = JSON.parse(JSON.stringify(c.snapshot())) as unknown;
    expect(saved).toEqual({ day: 1, hour: 3.3, start: 9.2 });
    const back = new WorldClock();
    back.begin(20);
    expect(back.restore(saved)).toBe(true);
    expect([back.worldSeconds, back.day, back.hour, back.startHour]).toEqual([c.worldSeconds, 1, 3.3, 9.2]);
    // the environment shows the saved hour to within rounding: nothing passes on the first frame
    expect(tell(back, 3.3 - 1e-13)).toBe(false);
    expect(tell(back, 3.3 + 1e-13)).toBe(true);
    expect(back.worldSeconds - c.worldSeconds).toBeLessThan(1e-6);
  });

  it('refuses a saved clock that is not one, and stays as it was', () => {
    const c = new WorldClock();
    c.begin(7);
    tell(c, 8);
    for (const bad of [undefined, null, 5, 'x', {}, { day: -1, hour: 3, start: 3 }, { day: 1.5, hour: 3, start: 3 }, { day: 0, hour: 24, start: 3 }, { day: 0, hour: 3, start: -1 }, { day: 0, hour: 3, start: 9 }, { day: 1, hour: NaN, start: 3 }, { day: '1', hour: 3, start: 3 }]) {
      expect(c.restore(bad)).toBe(false);
      expect([c.worldSeconds, c.day, c.hour, c.startHour]).toEqual([3600, 0, 8, 7]);
    }
  });

  it('allocates nothing when it is told the hour', () => {
    const hours = new Float64Array(4096);
    for (let i = 0; i < hours.length; i++) hours[i] = (9.2 + i * 0.0061) % 24;
    const c = new WorldClock();
    c.begin(9.2);
    const at = new Int32Array(1);
    const sky = { hour: 9.2 };
    // (as the game tells it: the sky, and itself for the session's seconds)
    const session = { time: 0.5 };
    expect(
      heapGrowth(() => {
        at[0] = (at[0] + 1) & 4095;
        sky.hour = hours[at[0]];
        session.time += 0.016;
        c.sync(sky, session);
      }),
    ).toBeLessThan(ALLOCATES / 4);
    expect(c.day).toBeGreaterThan(10);
  });
});

// ------------------------------------------------------------------ what the frame pays

describe('kernel: the cost of the per-frame calls', () => {
  it('with no system registered the three calls and the clock cost a few nanoseconds', async () => {
    const ctx = {};
    const reg = new SystemRegistry<object>({ now: () => performance.now() });
    await reg.init(ctx);
    const bus = new EventBus<GameEvents>();
    const clock = new WorldClock();
    clock.begin(9.2);
    const hours = new Float64Array(4096);
    for (let i = 0; i < hours.length; i++) hours[i] = 9.2 + i * 0.000001;
    const sky = { hour: 9.2 };
    const session = { time: 0 };
    // (one frame of the game's additions: the three hooks, the clock told the hour, the test for a crossed hour)
    const frame = (i: number): void => {
      reg.preStep(0.016, ctx);
      reg.step(0.016, ctx);
      sky.hour = hours[i & 4095];
      session.time += 0.016;
      clock.sync(sky, session);
      if (clock.hoursCrossed > 0) bus.emit('clock:hour', { day: clock.day, hour: Math.floor(clock.hour), crossed: clock.hoursCrossed });
      reg.lateUpdate(0.016, ctx);
    };
    for (let i = 0; i < 200_000; i++) frame(i);
    let best = Infinity;
    const N = 1_000_000;
    for (let round = 0; round < 5; round++) {
      const t0 = performance.now();
      for (let i = 0; i < N; i++) frame(i);
      best = Math.min(best, ((performance.now() - t0) / N) * 1e6);
    }
    console.log(`[v3 kernel] per frame with no system registered: ${best.toFixed(1)} ns (three hooks and the world clock; Node ${process.version})`);
    // (a thousandth of a millisecond would still be nothing in a frame; it measures far under that)
    expect(best).toBeLessThan(1000);
  });

  it('with twelve systems that do nothing, what the registry itself adds to a frame is measured and printed', async () => {
    const ctx = {};
    const counts = new Int32Array(3);
    const reg = new SystemRegistry<object>({ now: () => performance.now() });
    for (let i = 0; i < 12; i++) reg.add({ id: `s${i}`, budget: { cpuMs: 0.2 }, preStep: () => void counts[0]++, step: () => void counts[1]++, lateUpdate: () => void counts[2]++ });
    await reg.init(ctx);
    const frame = (): void => {
      reg.preStep(0.016, ctx);
      reg.step(0.016, ctx);
      reg.lateUpdate(0.016, ctx);
    };
    const garbage = heapGrowth(frame) / HEAP_RUNS;
    let best = Infinity;
    const N = 200_000;
    for (let round = 0; round < 5; round++) {
      const t0 = performance.now();
      for (let i = 0; i < N; i++) frame();
      best = Math.min(best, ((performance.now() - t0) / N) * 1e6);
    }
    console.log(`[v3 kernel] per frame with twelve empty systems, three phases each: ${best.toFixed(0)} ns, of which the clock is read 39 times; the readings left about ${Math.max(0, garbage).toFixed(0)} bytes a frame on the heap`);
    expect(best).toBeLessThan(20_000);
    const t = reg.telemetry();
    expect(t.s0.over).toBe(false);
    expect(t.s11.frames).toBeGreaterThan(N);
  });
});
