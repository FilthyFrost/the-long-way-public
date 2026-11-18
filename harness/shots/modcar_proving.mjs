// The proving ground in the game (docs/MODCAR.md §28), driven by its robot: each section's run measures itself and
// ends with its figures (0–100, 100→0, the skid pad's laps and g, the slalom clean through its cones, the
// off-road course, the 30 % ramp); a comparison of two builds, A then B, on the straight, B the faster with a V8, the
// vehicle back as it was after; and the player's own run, timed the same. A screenshot of the panel mid-run and of
// the comparison; the numbers each.
//   SHOTS_GPU=1 node harness/shots/modcar_proving.mjs
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser, openGame, ROOT, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/modcar_proving');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let failed = 0;
const fail = (m) => {
  console.log(' FAIL', m);
  failed++;
};
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&start=road&build=stock:sedan&seed=7&s=3180&time=10`, { width: 1280, height: 720 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const shot = async (name) => {
    await page.evaluate(async () => {
      const g = window.__rt.game;
      g.ui.showHelp(false);
      await Promise.all(g.vehicles.map((v) => v.view.settled()));
      for (let i = 0; i < 2; i++) window.__rt.render();
    });
    await page.screenshot({ path: path.join(out, `${name}.png`) });
  };
  await rt('enter', 0);
  /** run the robot on a section until its run has ended (or `limit` s of game time) */
  const robot = async (id, opts = {}, limit = 120, shotAt = -1) => {
    const n0 = (await rt('provingState')).results.length;
    if (!(await rt('provingRobot', id, opts))) {
      fail(`${id}: the robot did not take the wheel`);
      return null;
    }
    for (let t = 0; t < limit; t += 1) {
      await rt('simulate', 1);
      if (shotAt >= 0 && Math.abs(t - shotAt) < 0.5) await shot(`${id}_mid`);
      const s = await rt('provingState');
      if (s.results.length > n0 && !s.robot) return s.results[n0];
    }
    const s = await rt('provingState');
    return s.results.length > n0 ? s.results[n0] : null;
  };
  // each section by the robot
  const accel = await robot('accel', {}, 90, 6);
  console.log('accel', accel?.line);
  if (!accel?.ok || !(accel.figures.t100 > 5 && accel.figures.t100 < 30)) fail(`accel: ${JSON.stringify(accel)}`);
  const brake = await robot('brake', {}, 90);
  console.log('brake', brake?.line);
  if (!brake?.ok || !(brake.figures.d100 > 25 && brake.figures.d100 < 70)) fail(`brake: ${JSON.stringify(brake)}`);
  const skid = await robot('skidpad', {}, 120, 30);
  console.log('skidpad', skid?.line);
  if (!skid?.ok || !(skid.figures.laps >= 2) || !(skid.figures.g > 0.5)) fail(`skidpad: ${JSON.stringify(skid)}`);
  const slalom = await robot('slalom', { slalomKmh: 45 }, 90, 22);
  console.log('slalom', slalom?.line);
  if (!slalom?.ok || slalom.figures.cones !== 0 || slalom.figures.missed !== 0) fail(`slalom: ${JSON.stringify(slalom)}`);
  // (pushed to the grip: faster than at a set 45)
  const pushed = await robot('slalom', { slalomKmh: 0 }, 90);
  console.log('slalom pushed', pushed?.line);
  if (!pushed?.ok || !(pushed.figures.total < slalom.figures.total + 4)) fail(`slalom pushed: ${JSON.stringify(pushed)}`);
  const off = await robot('offroad', {}, 160, 40);
  console.log('offroad', off?.line);
  if (!off?.ok || !(off.figures.roll > 3)) fail(`offroad: ${JSON.stringify(off)}`);
  const hill = await robot('hill', { ramp: 0 }, 90, 12);
  console.log('hill', hill?.line);
  if (!hill?.ok || hill.figures.grade !== 20) fail(`hill: ${JSON.stringify(hill)}`);
  // a comparison on the straight: A the sedan as it is, B with a V8
  const was = (await rt('provingState')).build;
  const ab = await rt('provingAB', 'accel', 'eng_v8', true);
  if (ab !== 'ok') fail(`the comparison did not start: ${ab}`);
  let st = null;
  for (let t = 0; t < 200; t += 1) {
    await rt('simulate', 1);
    st = await rt('provingState');
    if (st.ab && st.ab.i >= 2) break;
  }
  console.log('A/B', JSON.stringify(st?.ab?.legs), (st?.ab?.rows ?? []).slice(0, 3).map((r) => `${r.zh} ${r.a} → ${r.b} ${r.delta}`).join(' | '));
  const t100 = st?.ab?.rows?.find((r) => r.key === 't100');
  if (!t100 || t100.better !== true) fail(`B (V8) was not the faster to 100: ${JSON.stringify(t100)}`);
  if (st?.build !== was) fail('the vehicle was not set back as it was after the comparison');
  await shot('ab_done');
  // the player's own run: set down at the start line, full throttle (the pedals scripted), timed the same
  await rt('provingGo', 'accel');
  await rt('simulate', 1);
  const n1 = (await rt('provingState')).results.length;
  await rt('drive', 48, 1, 0, 0);
  const all = (await rt('provingState')).results;
  const mine = all.length > n1 ? all[n1] : null;
  console.log('own run', mine?.line);
  if (mine?.section !== 'accel' || !mine.ok || !(mine.figures.tk > 20)) fail(`the player's own run was not timed: ${JSON.stringify(mine)}`);
  // (the sedan as it was: its own run near the robot's A)
  if (!(Math.abs(mine.figures.t100 - accel.figures.t100) < 1.5)) fail(`the own run's 0–100 (${mine?.figures.t100}) far from the robot's (${accel?.figures.t100})`);
  // the developer panel's tab: a section's button takes the vehicle to its start
  await page.evaluate(() => {
    const g = window.__rt.game;
    g.toggleDev(true);
    g.devPanel.showTab('proving');
  });
  await page.click('.mc-dev [data-go="skidpad"]');
  await rt('simulate', 0.5);
  const at = await page.evaluate(() => {
    const v = window.__rt.game.seated;
    return { x: v.sim.px, z: v.sim.pz, buttons: document.querySelectorAll('.mc-dev [data-go]').length };
  });
  console.log('tab', JSON.stringify(at));
  if (at.buttons !== 6 || Math.hypot(at.x - -1085, at.z - -120) > 2) fail(`the tab's skid pad button: ${JSON.stringify(at)}`);
  await shot('tab');
  if (errors.length) fail(`page errors: ${errors.join(' | ')}`);
} finally {
  await browser.close();
  server.close();
}
console.log(failed ? `${failed} failed` : 'ok');
process.exit(failed ? 1 : 0);
