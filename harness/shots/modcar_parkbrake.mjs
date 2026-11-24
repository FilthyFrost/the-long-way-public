// A car left idling in D on its handbrake stays where it was left (fix1; harness/sim/modcar_parkbrake_idle.test.ts), in the
// game: on world 5's road the Sugar Cube (its rear wheels driven, and held by the lever) and the Goat (all four driven: the
// converter pushed at the front wheels the lever does not hold, 4 mm/s against it) stood in the lane where the road is
// level, and where it climbs and falls most in its first 30 km, nose up and nose down; started, the handbrake on, got out of — half a minute
// later where they were left. The handbrake off, the same car idling in D creeps off at walking pace, as an automatic does.
//   SHOTS_GPU=1 node harness/shots/modcar_parkbrake.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/modcar_parkbrake');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
const ok = (cond, why) => (cond ? console.log('ok  ', why) : fail(why));
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:sedan&s=200&time=10&weather=clear`, { width: 1280, height: 720 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });

  // where the road is level, and where it climbs and falls most over a car's length (the lane the game puts one in)
  const spots = await page.evaluate(async () => {
    const g = window.__rt.game;
    const { SpineSample } = await import('/src/core/world/spine.ts');
    const { GroundSample } = await import('/src/core/world/ground.ts');
    const st = new SpineSample();
    const gs = new GroundSample();
    const at = (s) => {
      g.world.spine.at(s, st);
      g.ground.sample(st.x - Math.sin(st.phi) * 1.6, st.z + Math.cos(st.phi) * 1.6, gs);
      return gs.h;
    };
    // (the grade over 5 m, the same over the 2 m either side of it: a steady stretch, not a hump)
    const grade = (s) => (at(s + 2.5) - at(s - 2.5)) / 5;
    let level = null;
    let up = null;
    let down = null;
    for (let s = 300; s < 30000; s += 5) {
      const k = grade(s);
      if (Math.abs(grade(s - 2) - k) > 0.01 || Math.abs(grade(s + 2) - k) > 0.01) continue;
      if (!level || Math.abs(k) < Math.abs(level.grade)) level = { s, grade: k };
      if (k <= 0.12 && (!up || k > up.grade)) up = { s, grade: k };
      if (k >= -0.12 && (!down || k < down.grade)) down = { s, grade: k };
    }
    return [level, up, down];
  });
  console.log('spots', JSON.stringify(spots.map((p) => ({ km: +(p.s / 1000).toFixed(2), grade: `${(p.grade * 100).toFixed(1)} %` }))));
  ok(spots[1].grade > 0.03 && spots[2].grade < -0.03, `the road climbs ${(spots[1].grade * 100).toFixed(1)} % and falls ${(-spots[2].grade * 100).toFixed(1)} % at most in its first 30 km (steady over a car's length)`);

  /** the vehicle in the lane at s facing down the road, started, the handbrake as asked, got out of; how far it goes in `seconds` */
  const leave = (s, lever, seconds) =>
    page.evaluate(
      ({ s, lever, seconds }) => {
        const g = window.__rt.game;
        const v = g.vehicles[0];
        if (!g.seated) g.enter(v);
        g.teleport(s, true);
        g.simulate(1.5);
        if (!v.sys.running) {
          v.sys.crank(true);
          g.simulate(1.6);
          v.sys.crank(false);
        }
        v.sim.setParkBrake(true);
        g.simulate(1);
        v.sim.setParkBrake(lever);
        g.getOut();
        g.simulate(0);
        const x0 = v.sim.px;
        const z0 = v.sim.pz;
        const t0 = g.time;
        const b = new Float64Array(9);
        v.sim.basis(b);
        const fx = b[0];
        const fz = b[2];
        g.simulate(seconds);
        const along = (v.sim.px - x0) * fx + (v.sim.pz - z0) * fz;
        return { seated: !!g.seated, running: v.sys.running, selector: v.sim.selector, lever: v.sim.parkBrake, grade: Math.tan(v.sim.pitch) * 100, moved: Math.hypot(v.sim.px - x0, v.sim.pz - z0), along, seconds: g.time - t0, kmh: v.sim.vForward * 3.6 };
      },
      { s, lever, seconds },
    );

  for (const frame of ['sedan', 'goat']) {
    await rt('setBuild', 0, `stock:${frame}`);
    const name = frame === 'sedan' ? 'the Sugar Cube' : 'the Goat';
    for (const [i, p] of spots.entries()) {
      const r = await leave(p.s, true, 30);
      console.log(`  ${frame} at ${(p.s / 1000).toFixed(2)} km`, JSON.stringify(r));
      ok(!r.seated && r.running && r.selector === 'D' && r.lever === 1 && r.moved < 0.005, `${name} idling in D on its handbrake, ${['level', 'nose up', 'nose down'][i]} (${r.grade.toFixed(1)} %): moved ${(r.moved * 1000).toFixed(1)} mm in ${r.seconds.toFixed(0)} s`);
      if (frame === 'goat' && i === 1) {
        await rt('setView', 'chase');
        await rt('setOrbit', (120 * Math.PI) / 180, (18 * Math.PI) / 180, 7, 0.8, 0);
        await rt('render');
        await page.screenshot({ path: path.join(out, 'goat_nose_up.png') });
        await rt('setView', 'cockpit');
      }
    }
    // the handbrake off: an automatic idling in D creeps off on the level
    const c = await leave(spots[0].s, false, 10);
    console.log(`  ${frame} without the handbrake`, JSON.stringify(c));
    ok(!c.seated && c.running && c.along > 3 && c.kmh > 2 && c.kmh < 8, `${name} idling in D without the handbrake creeps: ${c.along.toFixed(1)} m in ${c.seconds.toFixed(0)} s, ${c.kmh.toFixed(1)} km/h`);
  }

  const lastError = await page.evaluate(() => window.__rt.lastError);
  if (lastError) fail(`a frame threw: ${lastError}`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
} catch (e) {
  fail(e.stack ?? e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `modcar_parkbrake: ${bad} FAILED` : 'modcar_parkbrake: ok');
process.exit(bad ? 1 : 0);
