/**
 * F3: the stability gate (docs/V3/plan/finish.md §四.1). The fourteen vehicles one drives × what they carry (nothing,
 * every floor full, 80 kg on the roof, the Tadpole on the ball, a motorcycle on the rack) × the ground (dry and wet
 * asphalt, gravel, grass, snow) × what a driver in trouble does: the wheel hard over at every speed, lane to lane and
 * back, the throttle let go in a bend, the brake stood on in a bend, the brake stood on with the left wheels on one
 * ground and the right on another, along a 15 % cross slope, a wheel dropped off the shoulder and wrenched back, a
 * slide into a kerb, a crest taken flying.
 *
 * What is asked, with the game's aids as it has them by default (the roll guard always; ABS and the stability
 * control on):
 *  - none ends on its side or its roof;
 *  - none rolls more than 20° against the ground it stands on (the four with a living space: 15°);
 *  - none stands on the wheels of one side alone for more than 0.3 s — but thrown up by a kerb struck sideways at
 *    29 km/h, 0.6 s (the side that is up is the one that was struck: it comes down again, the roll within its limit);
 *  - braking straight on one ground it does not turn; on two, it turns no faster than 10 °/s, no more than 15° by
 *    the time it stands, and leaves its line by no more than 3 m.
 * And that the aids are what does it: without the roll guard the Loaf goes over at 40 km/h; without the stability
 * control the Sugar Cube braked on asphalt and gravel spins.
 */
import { describe, expect, it } from 'vitest';
import { stockBuild } from '../../src/core/modcar/build';
import { CARGO_CG_RISE, derive } from '../../src/core/modcar/derive';
import { frameDef } from '../../src/core/modcar/frames';
import { applyToSim } from '../../src/core/modcar/simlink';
import { VehicleSim, zeroInput } from '../../src/core/vehicle/sim';
import type { VehicleSpec } from '../../src/core/vehicle/spec';
import { brake, brakeInBend, crest, derivedOf, DRIVEN, HOMES, kerbSlide, lanes, liftOff, LOADS, lock, Pad, run, shoulder, topSpeed, traverse, type Grip, type Outcome, type Script } from './stability';

/** the game's aids, as a new game has them */
const aids = (v: VehicleSim): void => {
  v.abs = true;
  v.esc = true;
};

interface Row {
  what: string;
  man: string;
  o: Outcome;
}

/** every run of a frame: with each load, on each ground, through each manoeuvre */
function gate(frame: string): Row[] {
  const rows: Row[] = [];
  const top = topSpeed(frame);
  const speeds = (list: number[]): number[] => [...new Set(list.map((s) => Math.min(s, Math.floor(top * 0.95))))];
  for (const load of LOADS) {
    const d = derivedOf(frame, load);
    if (!d) continue;
    const go = (padName: string, pad: Pad, man: string, s: Script, z0 = 0): void => {
      rows.push({ what: `${frame}, ${load}, ${padName}, ${man} at ${s.kmh} km/h`, man, o: run(d, pad, s, z0, aids) });
    };
    // (laden, the grounds that grip: it is grip that turns a body over)
    const grips: Grip[] = load === 'empty' ? ['dry', 'wet', 'gravel', 'grass', 'snow'] : ['dry', 'gravel'];
    for (const g of grips) {
      const pad = new Pad({ grip: g });
      for (const k of speeds([40, 70, 100, 130])) go(g, pad, 'lock', lock(k));
      for (const k of speeds([50, 80, 110])) go(g, pad, 'lanes', lanes(k));
      for (const k of speeds([60, 90])) go(g, pad, 'liftOff', liftOff(k));
      for (const k of speeds([60, 90])) go(g, pad, 'brakeInBend', brakeInBend(k));
      for (const k of speeds([100])) go(g, pad, 'brake', brake(k));
    }
    for (const k of speeds([80])) {
      go('asphalt | gravel', new Pad({ grip: 'dry', right: 'gravel' }), 'brakeSplit', brake(k));
      go('asphalt | snow', new Pad({ grip: 'dry', right: 'snow' }), 'brakeSplit', brake(k));
    }
    for (const g of ['dry', 'grass'] as Grip[]) for (const k of speeds([40])) go(`${g}, a 15 % cross slope`, new Pad({ grip: g, cross: 0.15 }), 'traverse', traverse(k));
    // (a shoulder 12 cm down and a kerb 12 cm up, each over the 24 cm a wheel takes to roll over such an edge)
    for (const k of speeds([50, 80])) go('a 12 cm shoulder', new Pad({ grip: 'dry', right: 'gravel', step: { at: 1.0, depth: 0.12, over: 0.24 } }), 'shoulder', shoulder(k), -0.4);
    for (const sl of [5, 8]) go('a 12 cm kerb', new Pad({ grip: 'dry', step: { at: 4, depth: -0.12, over: 0.24 } }), sl === 8 ? 'kerbFast' : 'kerb', kerbSlide(20, sl), 4 - d.frame.body.halfWidth - 0.5 - sl * 1.2);
    for (const k of speeds([60, 90])) go('a crest', new Pad({ grip: 'dry', crest: { at: 30, rise: 0.6, run: 7 } }), 'crest', crest(k));
  }
  return rows;
}

describe('F3 · the stability gate', () => {
  for (const frame of DRIVEN) {
    it(`${frameDef(frame).name.en} (${frame}): on its wheels through all of it`, () => {
      const rows = gate(frame);
      expect(rows.length).toBeGreaterThan(frame === 'moto' ? 50 : 150);
      const single = !!frameDef(frame).balance;
      const rollMost = HOMES.has(frame) ? 15 : 20;
      const bad: string[] = [];
      for (const r of rows) {
        const o = r.o;
        if (o.lying) bad.push(`${r.what}: ends lying`);
        // (a single-track vehicle leans as it should: it is only asked not to go down)
        if (single) continue;
        if (o.roll > rollMost) bad.push(`${r.what}: rolled ${o.roll.toFixed(1)}°`);
        if (o.onSide > (r.man === 'kerbFast' ? 0.6 : 0.3)) bad.push(`${r.what}: on the wheels of one side for ${o.onSide.toFixed(2)} s`);
        if (r.man === 'brake' && (o.spin > 3 || o.turned > 3)) bad.push(`${r.what}: turned braking straight (${o.spin.toFixed(0)} °/s, ${o.turned.toFixed(0)}°)`);
        if (r.man === 'brakeSplit' && (o.spin > 10 || o.turned > 15 || o.off > 3)) bad.push(`${r.what}: ${o.spin.toFixed(0)} °/s, ${o.turned.toFixed(0)}° round, ${o.off.toFixed(1)} m off its line`);
      }
      expect(bad).toEqual([]);
    });
  }

  it('the aids are what does it: without the roll guard the Loaf goes over at 40 km/h, without the stability control the Sugar Cube spins braking on two grounds', () => {
    const loaf = derivedOf('van', 'empty')!;
    const flat = new Pad({ grip: 'dry' });
    expect(run(loaf, flat, lock(40), 0, (v) => (v.rollGuard = false)).lying).toBe(true);
    expect(run(loaf, flat, lock(40)).lying).toBe(false);
    const cube = derivedOf('sedan', 'empty')!;
    const split = new Pad({ grip: 'dry', right: 'gravel' });
    const bare = run(cube, split, brake(80));
    const aided = run(cube, split, brake(80), 0, aids);
    expect(bare.spin).toBeGreaterThan(40);
    expect(bare.turned).toBeGreaterThan(90);
    expect(aided.spin).toBeLessThan(10);
    expect(aided.turned).toBeLessThan(15);
    // ABS alone: the brake stood on and the wheel put over at once — round what is in the way. With it the car has
    // moved a good deal further aside a second and a half on (without it the braking has the front tyres' grip)
    const aside = (abs: boolean): number => {
      const v = new VehicleSim(cube.spec as VehicleSpec);
      applyToSim(v, cube, true);
      v.abs = abs;
      v.reset(0, 0.05, 0, 0, flat);
      v.setParkBrake(false);
      v.autoReverse = false;
      const inp = zeroInput();
      for (let t = 0; t < 1; t += v.h) v.substep(inp, flat);
      v.shift('D');
      v.vx = 90 / 3.6;
      inp.throttle = 0.4;
      for (let t = 0; t < 1; t += v.h) v.substep(inp, flat);
      const z0 = v.pz;
      inp.throttle = 0;
      inp.brake = 1;
      inp.steer = 1;
      for (let t = 0; t < 1.5; t += v.h) v.substep(inp, flat);
      return Math.abs(v.pz - z0);
    };
    expect(aside(true)).toBeGreaterThan(aside(false) * 1.3);
  });

  it('a single-track wheel on the line between two grounds has one grip: the Swallow braked along the road\'s edge does not spin', () => {
    const o = run(derivedOf('moto', 'empty')!, new Pad({ grip: 'dry', right: 'gravel' }), brake(80), 0, aids);
    expect(o.spin).toBeLessThan(5);
    expect(o.lying).toBe(false);
  });

  it('what it carries lifts its centre of gravity by a tenth at most, however high it is piled', () => {
    const b = stockBuild('sedan', { fuel: 0.6 });
    const bare = derive(b).spec.cgHeight;
    b.cargo = [{ m: 400, x: 0, y: 2.2, z: 0 }];
    const piled = derive(b);
    expect(piled.spec.cgHeight).toBeCloseTo(bare * CARGO_CG_RISE, 2);
    expect(piled.mass).toBeCloseTo(derive(stockBuild('sedan', { fuel: 0.6 })).mass + 400, 6);
    // (a load low down lowers it as it always did)
    b.cargo = [{ m: 400, x: 0, y: 0.2, z: 0 }];
    expect(derive(b).spec.cgHeight).toBeLessThan(bare);
  });

  it('on four bare rims it still gets along (never stranded for want of a tyre), and stays on them', () => {
    const b = stockBuild('sedan', { fuel: 0.6 });
    for (const m of frameDef('sedan').mounts) if (m.cat === 'rim' && b.parts[m.id]) delete b.parts[m.id].sub.tire;
    const d = derive(b);
    expect(d.wheels.every((w) => w.fit === 1)).toBe(true);
    const pad = new Pad({ grip: 'dry' });
    const v = new VehicleSim(d.spec as VehicleSpec);
    applyToSim(v, d, true);
    v.reset(0, 0.05, 0, 0, pad);
    v.setParkBrake(false);
    const inp = zeroInput();
    inp.throttle = 1;
    for (let t = 0; t < 25; t += v.h) v.substep(inp, pad);
    expect(v.kmh).toBeGreaterThan(15);
    inp.steer = 1;
    let roll = 0;
    for (let t = 0; t < 6; t += v.h) {
      v.substep(inp, pad);
      roll = Math.max(roll, Math.abs(v.roll));
    }
    expect((roll * 180) / Math.PI).toBeLessThan(20);
  });
});
