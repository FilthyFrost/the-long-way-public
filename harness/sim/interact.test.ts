/**
 * Looking at things and using them (src/core/interact): the pick's range and cone, nearest wins,
 * walls hide things, E pressed / held / let go early, the long hold and the channel, and every use
 * replayable as an event.
 */
import { describe, expect, it } from 'vitest';
import { applyUse, holdOf, InteractSet, Picker, segmentHits, UseDriver, type Actor, type Interactable, type InteractSource, type UseEvent, type Vec3 } from '../../src/core/interact/interact';
import { Hands, newPack } from '../../src/core/items/carry';
import { StaticSolids } from '../../src/core/onfoot/statics';
import { Solid } from '../../src/core/world/solids';

function actor(x = 0, y = 1.62, z = 0): Actor & { eye: Vec3 } {
  return { id: 'p1', hands: new Hands(), pack: newPack(), eye: { x, y, z }, heading: 0 };
}

class Thing implements Interactable {
  used = 0;
  longUsed = 0;
  constructor(
    readonly id: string,
    readonly p: Vec3,
    readonly radius = 0.1,
    readonly hold = 0,
    readonly word: string | null = '拿',
  ) {}
  aim(out: Vec3): void {
    out.x = this.p.x;
    out.y = this.p.y;
    out.z = this.p.z;
  }
  prompt(): string | null {
    return this.word;
  }
  act(): boolean {
    this.used++;
    return true;
  }
}

class Bag implements InteractSource {
  constructor(readonly things: Interactable[]) {}
  interactablesNear(x: number, z: number, r: number, out: Interactable[]): void {
    for (const t of this.things) {
      const p = { x: 0, y: 0, z: 0 };
      t.aim(p);
      if (Math.hypot(p.x - x, p.z - z) <= r) out.push(t);
    }
  }
}

const ahead = { x: 1, y: 0, z: 0 };
/** a unit direction turned deg to the right of +x on the plan */
const turned = (deg: number) => ({ x: Math.cos((deg * Math.PI) / 180), y: 0, z: Math.sin((deg * Math.PI) / 180) });

describe('pick', () => {
  const a = actor();
  it('reaches 2.2 m and no further', () => {
    const pk = new Picker();
    const near = new Thing('a', { x: 2.25, y: 1.62, z: 0 }, 0.1);
    const far = new Thing('b', { x: 2.4, y: 1.62, z: 0 }, 0.1);
    expect(pk.pick(new Bag([near]), null, a, a.eye, ahead)?.id).toBe('a');
    expect(pk.pick(new Bag([far]), null, a, a.eye, ahead)).toBe(null);
  });
  it('takes what is within 9° of the view ray and nothing wider', () => {
    const pk = new Picker();
    // a point thing 1.5 m away: 8° off is picked, 10° is not
    const t = new Thing('a', { x: 1.5, y: 1.62, z: 0 }, 0.0001);
    expect(pk.pick(new Bag([t]), null, a, a.eye, turned(8))?.id).toBe('a');
    expect(pk.pick(new Bag([t]), null, a, a.eye, turned(10))).toBe(null);
    // a bigger thing reaches further round the ray by its size
    const big = new Thing('b', { x: 1.5, y: 1.62, z: 0 }, 0.4);
    expect(pk.pick(new Bag([big]), null, a, a.eye, turned(20))?.id).toBe('b');
  });
  it('the nearest of those on the ray wins; one on the ray beats one only near it', () => {
    const pk = new Picker();
    const n = new Thing('near', { x: 1.0, y: 1.62, z: 0 }, 0.1);
    const f = new Thing('far', { x: 2.0, y: 1.62, z: 0 }, 0.1);
    expect(pk.pick(new Bag([f, n]), null, a, a.eye, ahead)?.id).toBe('near');
    const side = new Thing('side', { x: 0.8, y: 1.62, z: 0.1 }, 0.02);
    const on = new Thing('on', { x: 1.8, y: 1.62, z: 0 }, 0.1);
    expect(pk.pick(new Bag([side, on]), null, a, a.eye, ahead)?.id).toBe('on');
  });
  it('things with nothing to do now are passed over', () => {
    const pk = new Picker();
    const quiet = new Thing('quiet', { x: 1.0, y: 1.62, z: 0 }, 0.1, 0, null);
    const busy = new Thing('busy', { x: 1.8, y: 1.62, z: 0 }, 0.1);
    expect(pk.pick(new Bag([quiet, busy]), null, a, a.eye, ahead)?.id).toBe('busy');
  });
  it('a wall in between hides it; a box it sits in does not', () => {
    const pk = new Picker();
    const t = new Thing('a', { x: 2.0, y: 1.0, z: 0 }, 0.1);
    const s = new StaticSolids();
    s.box(1.0, 0, 0.1, 1, 0, 0, 2.2);
    const toT = { x: 2 / Math.hypot(2, 0.62), y: -0.62 / Math.hypot(2, 0.62), z: 0 };
    expect(pk.pick(new Bag([t]), null, a, a.eye, toT)?.id).toBe('a');
    expect(pk.pick(new Bag([t]), s, a, a.eye, toT)).toBe(null);
    const s2 = new StaticSolids();
    s2.box(2.0, 0, 0.3, 0.3, 0, 0, 1.05, false, 'crate');
    expect(pk.pick(new Bag([t]), s2, a, a.eye, toT)?.id).toBe('a');
    // a thing lying inside a box is seen when the box is named as see-through for it
    const inside = Object.assign(new Thing('in', { x: 2.0, y: 0.6, z: 0 }, 0.08), { through: 'crate' });
    const s3 = new StaticSolids();
    s3.box(2.0, 0, 0.3, 0.3, 0, 0, 0.7, false, 'crate');
    const dir = { x: 2, y: 0.6 - 1.62, z: 0 };
    const l = Math.hypot(dir.x, dir.y);
    expect(pk.pick(new Bag([inside]), s3, a, a.eye, { x: dir.x / l, y: dir.y / l, z: 0 })?.id).toBe('in');
  });
  it('segment against a turned box and a post', () => {
    const b = new Solid().set(0, 0, 1, 0.2, Math.PI / 4, 0, 1);
    expect(segmentHits(b, -2, 0.5, 2, 2, 0.5, -2)).toBe(true);
    expect(segmentHits(b, -2, 0.5, -2, 2, 0.5, 2)).toBe(true);
    expect(segmentHits(b, -2, 1.5, 2, 2, 1.5, -2)).toBe(false);
    const post = new Solid().set(5, 0, 0.1, 0, 0, 0, 2);
    expect(segmentHits(post, 5, 1, -1, 5, 1, 1)).toBe(true);
    expect(segmentHits(post, 5.3, 1, -1, 5.3, 1, 1)).toBe(false);
  });
});

describe('E: press, hold, let go', () => {
  const a = actor();
  const dt = 1 / 60;
  it('a press acts once, at once', () => {
    const t = new Thing('a', { x: 1, y: 1.6, z: 0 });
    const d = new UseDriver();
    d.update(dt, t, true, a);
    expect(t.used).toBe(1);
    for (let i = 0; i < 30; i++) d.update(dt, t, true, a);
    expect(t.used).toBe(1);
    d.update(dt, t, false, a);
    d.update(dt, t, true, a);
    expect(t.used).toBe(2);
  });
  it('a hold fills the ring and acts when full; let go early, nothing happens', () => {
    const t = new Thing('crate', { x: 1, y: 1.6, z: 0 }, 0.3, 1.5);
    const d = new UseDriver();
    let n = 0;
    for (; n < 200 && t.used === 0; n++) {
      d.update(dt, t, true, a);
      if (t.used === 0) expect(d.ring).toBeCloseTo(Math.min(1, ((n + 1) * dt) / 1.5), 5);
    }
    expect(n * dt).toBeCloseTo(1.5, 1);
    const t2 = new Thing('crate2', { x: 1, y: 1.6, z: 0 }, 0.3, 1.5);
    for (let i = 0; i < 60; i++) d.update(dt, t2, true, a);
    d.update(dt, t2, false, a);
    expect(t2.used).toBe(0);
    expect(d.ring).toBe(-1);
    // looking away cancels too
    for (let i = 0; i < 60; i++) d.update(dt, t2, true, a);
    for (let i = 0; i < 60; i++) d.update(dt, null, true, a);
    for (let i = 0; i < 60; i++) d.update(dt, t2, true, a);
    expect(t2.used).toBe(0);
  });
  it('holds are kept within 0.6–2.5 s', () => {
    expect(holdOf(0)).toBe(0);
    expect(holdOf(0.2)).toBe(0.6);
    expect(holdOf(9)).toBe(2.5);
  });
  it('a long hold: a tap does the press, held through it does the long thing', () => {
    const t = Object.assign(new Thing('slot', { x: 1, y: 1.6, z: 0 }), {
      long: { hold: 0.8, prompt: () => '全拿', act: () => ((t.longUsed += 1), true) },
    });
    const d = new UseDriver();
    for (let i = 0; i < 6; i++) d.update(dt, t, true, a);
    d.update(dt, t, false, a);
    expect([t.used, t.longUsed]).toEqual([1, 0]);
    for (let i = 0; i < 30; i++) d.update(dt, t, true, a);
    expect(d.word).toBe('全拿');
    expect(d.ring).toBeGreaterThan(0.5);
    for (let i = 0; i < 30; i++) d.update(dt, t, true, a);
    d.update(dt, t, false, a);
    expect([t.used, t.longUsed]).toEqual([1, 1]);
  });
  it('a channel runs while held and stops when it is done; every use is an event that replays', () => {
    let litres = 0;
    const t = Object.assign(new Thing('tap', { x: 1, y: 1.6, z: 0 }), {
      channel: (_a: Actor, h: number) => {
        litres = Math.min(2, litres + h);
        return litres < 2;
      },
    });
    const d = new UseDriver();
    const log: UseEvent[] = [];
    d.onUse((e) => log.push(e));
    for (let i = 0; i < 300; i++) d.update(dt, t, true, a);
    expect(litres).toBe(2);
    expect(log.every((e) => e.verb === 'channel' && e.target === 'tap')).toBe(true);
    expect(log.reduce((s, e) => s + e.dt, 0)).toBeCloseTo(2, 1);
    // the host replays them on its own copy
    litres = 0;
    const set = new InteractSet();
    set.add(new Bag([t]));
    for (const e of log) applyUse(set, a, e);
    expect(litres).toBe(2);
    // a remote client only reports
    const remote = new UseDriver();
    remote.local = false;
    const sent: UseEvent[] = [];
    remote.onUse((e) => sent.push(e));
    const p = new Thing('can', { x: 1, y: 1.6, z: 0 });
    remote.update(dt, p, true, a);
    expect(p.used).toBe(0);
    expect(sent).toEqual([{ actor: 'p1', target: 'can', verb: 'act', dt: 0 }]);
    expect(applyUse(set, a, { actor: 'p1', target: 'nothing', verb: 'act', dt: 0 })).toBe(false);
  });
});
