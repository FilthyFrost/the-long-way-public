// J7 (docs/V3/plan/growth.md §五), in the game: thirty kilometres in the Sugar Cube as the start has it (the engine at 45 %,
// its oil 85 %, water in the radiator, the battery half charged, part-worn tyres), driven along the road at 60 km/h by a
// hand that follows its lane — what the car is like every kilometre (the engine, the oil, the water, the battery, the
// dirt, the fuel, the tyres, the temperature); then the engine kit on its engine (pulled up, the handbrake on, out of it
// with the engine idling in D, the bonnet up, the left button held) — the car staying where it was left, idling on its
// handbrake — and the engine worn right out: it limps, it does not seize.
//   SHOTS_GPU=1 node harness/shots/j7_drive.mjs [km]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const KM = Number(process.argv[2] ?? 30);
const out = path.join(ROOT, 'loop/shots/j7_drive');
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
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:sedan&s=200&time=8.5&weather=clear`, { width: 1280, height: 720 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const shot = async (f) => {
    await page.evaluate(() => window.__rt.render());
    await page.screenshot({ path: path.join(out, f) });
  };
  // the Sugar Cube as J5's start has it
  await page.evaluate(async () => {
    const g = window.__rt.game;
    const v = g.seated;
    const b = v.build.parts;
    b.engine.cond = 0.45;
    b.engine.fluids.oilL = 3.5 * 0.85;
    b.radiator.fluids.coolantL = 5;
    b.radiator.fluids.coolantMix = 0;
    b.battery.fluids.charge = 0.5;
    for (const h of ['hub_FL', 'hub_FR', 'hub_RL', 'hub_RR']) if (b[h]?.sub.tire) b[h].sub.tire.tread = 0.88;
    b.fuelTank.fluids.fuel = { petrol: 20 };
    v.build.dirt = 0;
    for (const inst of Object.values(b)) inst.dirt = 0;
    v.sim.setManual?.(false);
    v.sys.rebuild();
    window.__car = v;
    const SS = await import('/src/core/world/spine.ts');
    const st = new SS.SpineSample();
    const pr = { s: 0, d: 0 };
    g.world.spine.project(v.sim.px, v.sim.pz, NaN, pr);
    const lane = Math.max(1.2, Math.min(2.2, Math.abs(pr.d))) * (pr.d < 0 ? -1 : 1);
    const basis = new Float64Array(9);
    /** the steering that follows the lane from where the car is now */
    const laneSteer = (sp, hint) => {
      sp.project(v.sim.px, v.sim.pz, hint, pr);
      const look = 14 + Math.abs(v.sim.kmh) * 0.25;
      sp.at(pr.s + look, st);
      const tx = st.x - Math.sin(st.phi) * lane;
      const tz = st.z + Math.cos(st.phi) * lane;
      v.sim.basis(basis);
      const head = Math.atan2(basis[2], basis[0]);
      let a = Math.atan2(tz - v.sim.pz, tx - v.sim.px) - head;
      while (a > Math.PI) a -= 2 * Math.PI;
      while (a < -Math.PI) a += 2 * Math.PI;
      return Math.max(-1, Math.min(1, a * 2.2));
    };
    /** drive so many seconds of the game, following the lane at kmh; how far it got (m) */
    window.__j7 = {
      drive(seconds, kmh = 60) {
        const sp = g.world.spine;
        let hint = pr.s;
        for (let t = 0; t < seconds; t += 1 / 60) {
          const steer = laneSteer(sp, hint);
          hint = pr.s;
          const k = v.sim.kmh;
          g.scripted = { steer, throttle: Math.max(0, Math.min(1, (kmh - k) * 0.09 + 0.15)), brake: k > kmh + 8 ? 0.35 : 0, handbrake: 0 };
          g.step(1 / 60, 1);
        }
        g.scripted = null;
        return pr.s;
      },
      /**
       * Pull up as a driver does: braking along the lane, the pedal eased at walking pace (held at a standstill it
       * would select reverse) for the assist to hold it, until the car stands still — its whole speed, not only along
       * its length (braked hard with the wheel straight, the left wheels on the gravel verge and the right on the tarmac,
       * it spun round; under 0.5 km/h along its length it was still sliding sideways at 13 km/h, and got out of then it
       * slid on for two seconds: the "creep" of J8–J10).
       */
      stop() {
        const sp = g.world.spine;
        let hint = pr.s;
        let t = 0;
        for (; t < 30 && (v.sim.speed > 0.03 || !v.sim.hold); t += 1 / 60) {
          const steer = laneSteer(sp, hint);
          hint = pr.s;
          g.scripted = { steer, throttle: 0, brake: v.sim.vForward > 0.5 ? 0.45 : 0.15, handbrake: 0 };
          g.step(1 / 60, 1);
        }
        g.scripted = null;
        return { seconds: t, speed: v.sim.speed, hold: v.sim.hold, selector: v.sim.selector };
      },
      log() {
        const b2 = v.build.parts;
        const tread = ['hub_FL', 'hub_FR', 'hub_RL', 'hub_RR'].map((h) => b2[h]?.sub.tire?.tread ?? 0);
        return {
          s: pr.s,
          kmh: v.sim.kmh,
          engine: b2.engine?.cond ?? 0,
          oil: b2.engine?.fluids.oilL ?? 0,
          water: b2.radiator?.fluids.coolantL ?? 0,
          battery: b2.battery?.fluids.charge ?? 0,
          dirt: v.build.dirt,
          fuel: Object.values(b2.fuelTank?.fluids.fuel ?? {}).reduce((a, c) => a + (c ?? 0), 0),
          tread: tread.reduce((a, c) => a + c, 0) / 4,
          temp: v.sys.coolantC,
          running: v.sys.running,
          time: g.time,
        };
      },
    };
  });
  await rt('crank', 1.6);
  await page.evaluate(() => window.__rt.game.seated.sim.setParkBrake(false));
  await rt('setView', 'chase');
  await shot('00_off.png');
  const rows = [];
  const first = await page.evaluate(() => window.__j7.log());
  rows.push({ km: 0, ...first });
  let km = 0;
  const s0 = first.s;
  while (km < KM) {
    const s = await page.evaluate(() => window.__j7.drive(20, 60));
    const now = await page.evaluate(() => window.__j7.log());
    const at = Math.floor((s - s0) / 1000);
    if (at > km) {
      km = at;
      rows.push({ km, ...now });
      console.log(`  ${String(km).padStart(2)} km  ${((now.time - first.time) / 60).toFixed(1)} min  engine ${(now.engine * 100).toFixed(1)} %  oil ${now.oil.toFixed(2)} L  water ${now.water.toFixed(2)} L  battery ${(now.battery * 100).toFixed(0)} %  dirt ${now.dirt.toFixed(2)}  fuel ${now.fuel.toFixed(1)} L  tread ${(now.tread * 100).toFixed(1)} %  ${now.temp.toFixed(0)} °C  ${now.kmh.toFixed(0)} km/h`);
      if (km === 15) await shot('01_15km.png');
    }
    if (!now.running) {
      fail(`the engine stopped at ${km} km`);
      break;
    }
  }
  await rt('setView', 'cockpit');
  await shot('02_30km_cockpit.png');
  await rt('setView', 'chase');
  await shot('03_30km.png');
  fs.writeFileSync(path.join(out, 'drive.json'), JSON.stringify(rows, null, 1));
  const a = rows[0];
  const z = rows[rows.length - 1];
  const hours = (z.time - a.time) / 3600;
  ok(z.km >= KM, `${z.km} km in ${(hours * 60).toFixed(0)} minutes`);
  ok(Math.abs((a.engine - z.engine) / hours - 0.14) < 0.03, `the engine wore ${((a.engine - z.engine) * 100).toFixed(1)} points (${(((a.engine - z.engine) / hours) * 100).toFixed(1)} an hour)`);
  ok((a.oil - z.oil) / hours > 0.45 && (a.oil - z.oil) / hours < 0.7, `the oil: ${(a.oil - z.oil).toFixed(2)} L burnt (${((a.oil - z.oil) / hours).toFixed(2)} L an hour, a worn engine)`);
  ok(z.water < a.water && (a.water - z.water) / hours < 0.4, `the water: ${(a.water - z.water).toFixed(2)} L gone`);
  ok(z.dirt > 0.3, `the dirt after ${z.km} km: ${z.dirt.toFixed(2)}`);
  ok(z.fuel < a.fuel, `fuel: ${a.fuel.toFixed(1)} → ${z.fuel.toFixed(1)} L`);
  ok(z.battery >= a.battery - 0.02, `the battery kept up running (${(a.battery * 100).toFixed(0)} → ${(z.battery * 100).toFixed(0)} %)`);

  // ---- the engine kit: pulled up, the handbrake on and out with the engine idling in D as J7 had it (J8–J10 switched
  // it off first, taking a car still sliding out of a spin for one creeping against its handbrake), the bonnet up, the
  // kit held to the engine
  const pulled = await page.evaluate(() => window.__j7.stop());
  await page.evaluate(() => window.__rt.game.seated.sim.setParkBrake(true));
  await rt('exit');
  const parked = await page.evaluate(() => {
    const g = window.__rt.game;
    const s = window.__car.sim;
    return { x: s.px, z: s.pz, t: g.time, seated: !!g.seated, running: window.__car.sys.running, selector: s.selector, lever: s.parkBrake, grade: Math.tan(s.pitch) * 100, camber: (s.roll * 180) / Math.PI };
  });
  console.log('pulled up', JSON.stringify({ ...pulled, ...parked }));
  ok(!parked.seated && parked.running && parked.selector === 'D' && parked.lever === 1, `out of it with the engine idling in D, the handbrake on (pulled up in ${pulled.seconds.toFixed(1)} s)`);
  await rt('setView', 'cockpit');
  const vi = await page.evaluate(() => window.__rt.game.vehicles.indexOf(window.__car));
  await rt('openPanel', vi, 'hood', true);
  await rt('simulate', 1);
  const before = await page.evaluate(() => window.__car.build.parts.engine.cond);
  await rt('hold', 'item:nd_engine_kit');
  await rt('aim', vi, 'engine', 1.2);
  const word = await page.evaluate(() => [...document.querySelectorAll('.mc-acts *')].map((e) => e.textContent).join(' '));
  await shot('04_engine_kit.png');
  await rt('useFor', 2.3);
  const after = await page.evaluate(() => ({ cond: window.__car.build.parts.engine.cond, held: window.__rt.game.player.held?.item?.item ?? null }));
  ok(after.cond > before + 0.45 && !after.held, `the engine kit: ${(before * 100).toFixed(0)} → ${(after.cond * 100).toFixed(0)} %, used up (${word.includes('修') ? '修 said' : word.slice(0, 40)})`);
  await shot('05_mended.png');
  // ---- and it stays where it was left: idling in D on its handbrake, twenty seconds more
  const kitDone = await page.evaluate(() => ({ x: window.__car.sim.px, z: window.__car.sim.pz }));
  await rt('simulate', 20);
  const stayed = await page.evaluate(
    ({ p, k }) => {
      const s = window.__car.sim;
      return { moved: Math.hypot(s.px - p.x, s.pz - p.z), idle: Math.hypot(s.px - k.x, s.pz - k.z), seconds: window.__rt.game.time - p.t, kmh: s.kmh, running: window.__car.sys.running, selector: s.selector };
    },
    { p: parked, k: kitDone },
  );
  // (it settles once, as the hold hands over to the handbrake and one gets out and works at the bonnet — its tyres and
  // springs giving: 3.1 mm on a 2.4 % slope, 11.0 mm on −1.1 % with 2.5° across — and then creeps not at all)
  ok(stayed.running && stayed.selector === 'D' && stayed.moved < 0.025 && stayed.idle < 0.002, `parked on its handbrake idling in D (a ${parked.grade.toFixed(1)} % slope, ${parked.camber.toFixed(1)}° across): moved ${(stayed.moved * 1000).toFixed(1)} mm in ${stayed.seconds.toFixed(0)} s (the bonnet opened and the kit used), ${(stayed.idle * 1000).toFixed(1)} mm of it in the last 20 s`);
  await rt('openPanel', vi, 'hood', false);

  // ---- worn right out: it limps (no faster than 38 km/h), it does not seize
  await rt('enter', vi);
  await page.evaluate(() => {
    const g = window.__rt.game;
    g.seated.build.parts.engine.cond = 0;
    g.seated.sim.setParkBrake(false);
  });
  if (!(await page.evaluate(() => window.__rt.game.seated.sys.running))) await rt('crank', 1.6);
  await page.evaluate(() => window.__j7.drive(40, 70));
  const limp = await page.evaluate(() => ({ ...window.__j7.log(), said: window.__rt.game.seated.sys.dash.message?.text?.zh ?? '' }));
  await rt('setView', 'chase');
  await shot('06_limping.png');
  ok(limp.running && limp.engine === 0 && limp.kmh < 41 && limp.kmh > 15, `worn out: still running, limping at ${limp.kmh.toFixed(0)} km/h`);

  const lastError = await page.evaluate(() => window.__rt.lastError);
  if (lastError) fail(`a frame threw: ${lastError}`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
} catch (e) {
  fail(e.stack ?? e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `j7_drive: ${bad} FAILED` : 'j7_drive: ok');
process.exit(bad ? 1 : 0);
