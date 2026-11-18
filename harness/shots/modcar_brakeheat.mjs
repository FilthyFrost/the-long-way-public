// The brakes' heat (docs/MODCAR.md §22), in the game: a pickup on drum brakes stopped hard from 90 km/h again and
// again on the road: its stops grow longer, the car says the brakes are fading, the hubs smoke; driven on at
// 60 km/h for a few minutes, they bite again.
//   SHOTS_GPU=1 node harness/shots/modcar_brakeheat.mjs
import { launchBrowser, startServer } from './lib.mjs';

const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  await page.goto(`${url}/modcar.html?new=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 240000 });
  await rt('setHour', 11);
  await rt('setWeather', 'clear');
  const builds = await rt('builds');
  const vi = builds.findIndex((b) => b.startsWith('pickup') || b.startsWith('stock:pickup'));
  await rt('setBuild', vi, 'stock:pickup');
  await rt('fit', vi, 'brakes_F', 'brakes_drum');
  await rt('fit', vi, 'brakes_R', 'brakes_drum');
  await rt('setOrbit', 0, 10, 6, 0.8, vi);
  console.log(await rt('devGo', 'desert', true));
  for (let k = 0; k < 16; k++) await rt('simulate', 0.25);
  await rt('enter', vi);
  await rt('setView', 'cockpit');
  await rt('crank', 2.0);
  const state = () =>
    page.evaluate((i) => {
      const v = window.__rt.game.vehicles[i];
      return { kmh: v.sim.kmh, x: v.sim.px, z: v.sim.pz, bite: v.sys.dash.brakes[0].bite, c: v.sys.dash.brakes[0].c, msg: v.sys.dash.message?.code ?? '' };
    }, vi);
  // driven along the road in its lane (the probe steers: towards the lane a dozen metres ahead), pedals fixed
  await page.evaluate(() => {
    window.__lane = (vi, seconds, throttle, brake) => {
      const g = window.__rt.game;
      const v = g.vehicles[vi];
      const sp = g.world.spine;
      const pr = { s: 0, d: 0 };
      const st = { x: 0, y: 0, z: 0, phi: 0, kappa: 0, grade: 0, bank: 0 };
      const b = new Float64Array(9);
      v.sim.setParkBrake(false);
      const dt = 1 / 60;
      for (let t = 0; t < seconds; t += dt) {
        sp.project(v.sim.px, v.sim.pz, window.__laneS ?? NaN, pr);
        window.__laneS = pr.s;
        sp.at(pr.s + 12, st);
        const tx = st.x - Math.sin(st.phi) * 1.6;
        const tz = st.z + Math.cos(st.phi) * 1.6;
        v.sim.basis(b);
        const want = Math.atan2(tz - v.sim.pz, tx - v.sim.px);
        let err = want - Math.atan2(b[2], b[0]);
        while (err > Math.PI) err -= 2 * Math.PI;
        while (err < -Math.PI) err += 2 * Math.PI;
        g.scripted = { steer: Math.max(-1, Math.min(1, err * 2.2 * window.__steerSign)), throttle, brake, handbrake: 0 };
        g.step(dt, 1);
      }
      g.scripted = null;
      return { kmh: v.sim.kmh, d: pr.d };
    };
    window.__steerSign = 1;
  });
  // (which way the steering turns: a second's drive either way, keep the one that stays nearer the lane)
  const trial = async (sign) => page.evaluate(({ vi, sign }) => {
    const g = window.__rt.game;
    const v = g.vehicles[vi];
    const save = { x: v.sim.px, z: v.sim.pz };
    window.__steerSign = sign;
    window.__laneS = undefined;
    const r = window.__lane(vi, 3, 0.6, 0);
    return Math.abs(r.d - 1.6) + 0 * save.x;
  }, { vi, sign });
  const off1 = await trial(1);
  console.log('lane error steering +1:', off1.toFixed(2));
  if (off1 > 1.2) {
    const off2 = await trial(-1);
    console.log('lane error steering -1:', off2.toFixed(2));
  }
  const lane = (seconds, throttle, brake) => page.evaluate(({ vi, seconds, throttle, brake }) => window.__lane(vi, seconds, throttle, brake), { vi, seconds, throttle, brake });
  const said = new Set();
  const stopsM = [];
  const fromKmh = [];
  let smoked = 0;
  // (each run-up from the lane's middle where it stopped, along the road: a stop on a bend can leave it on the verge)
  const toLane = () =>
    page.evaluate((vi) => {
      const g = window.__rt.game;
      const v = g.vehicles[vi];
      const pr = { s: 0, d: 0 };
      const st = { x: 0, y: 0, z: 0, phi: 0, kappa: 0, grade: 0, bank: 0 };
      g.world.spine.project(v.sim.px, v.sim.pz, NaN, pr);
      g.world.spine.at(pr.s, st);
      window.__rt.placeVehicle(vi, st.x - Math.sin(st.phi) * 1.6, st.z + Math.cos(st.phi) * 1.6, -st.phi);
      window.__laneS = pr.s;
      return pr.d;
    }, vi);
  for (let k = 0; k < 6; k++) {
    await toLane();
    for (let t = 0; t < 25 && (await state()).kmh < 90; t += 0.5) await lane(0.5, 1, 0);
    const a = await state();
    let s = a;
    const t0 = (await rt('telemetry')).dust.thrown;
    for (let t = 0; t < 12 && s.kmh > 3; t += 0.25) {
      await lane(0.25, 0, 0.85);
      s = await state();
      if (s.msg) said.add(s.msg);
    }
    smoked = Math.max(smoked, (await rt('telemetry')).dust.thrown - t0);
    stopsM.push(Math.hypot(s.x - a.x, s.z - a.z));
    fromKmh.push(a.kmh);
    console.log(`stop ${k + 1}: from ${a.kmh.toFixed(0)} km/h ${stopsM[k].toFixed(0)} m, front brake ${s.c.toFixed(0)} °C, bite ${s.bite.toFixed(2)}`);
  }
  const hot = await state();
  if (!(hot.bite < 0.85)) fail(`the drums did not fade (${hot.bite})`);
  // (against the first stop made from speed; the longer of the last two, as a stop now and then ends early on
  // the way down the road — a rise, the verge)
  const first = fromKmh.findIndex((k) => k > 80);
  if (first < 0 || first > 2 || !(Math.max(stopsM[4], stopsM[5]) > stopsM[first] * 1.3)) fail(`the stops did not grow (${stopsM.map((m) => m.toFixed(0))} from ${fromKmh.map((k) => k.toFixed(0))} km/h)`);
  if (!said.has('brakes_hot')) fail(`the car did not say the brakes were fading (${[...said]})`);
  if (smoked < 3) fail(`the hot brakes did not smoke (${smoked} puffs over a stop)`);
  // the smoke, from outside by the front wheel
  await rt('setOrbit', 70, 6, 5.5, 0.6, vi);
  for (let i = 0; i < 6; i++) await rt('simulate', 0.1);
  await page.evaluate(async () => {
    const g = window.__rt.game;
    g.ui.showHelp(false);
    await Promise.all(g.vehicles.map((v) => v.view.settled()));
    for (let i = 0; i < 3; i++) window.__rt.render();
  });
  await page.screenshot({ path: 'loop/shots/modcar_brakeheat_smoke.png' });
  await rt('setView', 'cockpit');
  // driven on at 60 km/h for three and a half minutes
  await toLane();
  for (let t = 0; t < 210; t += 1) await lane(1, (await state()).kmh < 60 ? 0.6 : 0.12, 0);
  const cool = await state();
  console.log('after driving on', JSON.stringify(cool));
  if (!(cool.bite > 0.95)) fail(`the brakes did not come back after driving on (${cool.bite})`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
} catch (e) {
  fail(String(e?.stack ?? e));
} finally {
  await browser.close();
  server.close();
}
console.log(bad ? `modcar_brakeheat: ${bad} FAILED` : 'modcar_brakeheat: ok');
process.exit(bad ? 1 : 0);
