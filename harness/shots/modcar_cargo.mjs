// Things ride on vehicles: a jerrycan put down into the donor pickup's bed lands on its floor, goes out to
// the road with it, and can be taken out there. Writes loop/shots/modcar_cargo/*.png.
//   SHOTS_GPU=1 node harness/shots/modcar_cargo.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/modcar_cargo');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&project=full`, { width: 1280, height: 720 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  // the petrol can, held behind the donor's bed, put down
  if (!(await rt('pickUp', 'tool:jerrycan'))) fail('no jerrycan');
  await rt('aim', 1, 'seat_rear', 1.2);
  const put = await page.evaluate(async () => {
    const g = window.__rt.game;
    g.player.putDown();
    for (let i = 0; i < 60; i++) g.step(1 / 60, 1);
    const l = g.loose.list.find((x) => x.tool?.kind === 'jerrycan' && x.tool.fuel === 'petrol');
    const v = g.vehicles[1];
    return { riding: l?.riding?.on === v, y: l?.y, ground: v.sim.py - v.sys.derived.cg.y };
  });
  console.log('put in the bed', JSON.stringify(put));
  if (!put.riding) fail('the can did not land in the bed');
  // (looked at from beside the bed)
  await page.evaluate(() => {
    const g = window.__rt.game;
    const v = g.vehicles[1];
    g.viewMode = 'orbit';
    g.focus = v;
    g.orbit.yaw = (150 * Math.PI) / 180;
    g.orbit.pitch = (35 * Math.PI) / 180;
    g.orbit.dist = 5.5;
    g.orbit.target = 0.8;
    g.simulate(0);
    window.__rt.render();
  });
  await page.screenshot({ path: path.join(out, 'in_the_bed.png') });
  await rt('setView', 'cockpit');
  // out to the road in the pickup
  await rt('useDevice', 'door');
  await rt('simulate', 4);
  await rt('enter', 1);
  await rt('crank', 2.5);
  await page.evaluate(() => window.__rt.game.seated.sim.setParkBrake(false));
  await rt('drive', 10, 0.7, 0);
  // (braked to a stop, not on into reverse)
  await page.evaluate(() => {
    const g = window.__rt.game;
    g.scripted = { steer: 0, throttle: 0, brake: 1, handbrake: 1 };
    for (let i = 0; i < 900 && Math.abs(g.seated.sim.kmh) > 1; i++) g.step(1 / 60, 1);
    g.seated.sim.setParkBrake(true);
    g.scripted = null;
  });
  const road = await page.evaluate(() => {
    const g = window.__rt.game;
    const v = g.seated;
    const l = g.loose.list.find((x) => x.tool?.kind === 'jerrycan');
    return { place: g.place, things: g.loose.list.length, riding: l?.riding?.on === v, d: l ? Math.hypot(l.x - v.sim.px, l.z - v.sim.pz) : -1 };
  });
  console.log('on the road', JSON.stringify(road));
  if (road.place !== 'road' || !road.riding || road.d > 3) fail('the can did not come along');
  await rt('setView', 'orbit');
  await page.evaluate(() => {
    const g = window.__rt.game;
    g.orbit.yaw = (200 * Math.PI) / 180;
    g.orbit.pitch = (25 * Math.PI) / 180;
    g.orbit.dist = 6;
    g.orbit.target = 0.8;
  });
  await rt('simulate', 0.1);
  await rt('render');
  await page.screenshot({ path: path.join(out, 'on_the_road.png') });
  // out, and the can taken from the bed
  await page.evaluate(() => window.__rt.game.seated.sim.setParkBrake(true));
  await rt('exit');
  await rt('setView', 'cockpit');
  const t1 = await rt('telemetry');
  if (t1.seated) fail(`could not get out (${JSON.stringify({ kmh: t1.kmh, place: t1.place })})`);
  const took = await page.evaluate(() => {
    const g = window.__rt.game;
    const l = g.loose.list.find((x) => x.tool?.kind === 'jerrycan');
    if (!l) return 'gone';
    g.player.walker.place(l.x + 0.9, l.z, Math.PI);
    return 'ok';
  });
  if (took !== 'ok') fail('the can is gone');
  const held = await page.evaluate(async () => {
    const g = window.__rt.game;
    const l = g.loose.list.find((x) => x.tool?.kind === 'jerrycan');
    const w = g.player.walker;
    const eye = w.eye();
    g.input.lookYaw = Math.atan2(l.z - w.z, l.x - w.x);
    g.input.lookPitch = Math.atan2(l.y + l.mid - eye.y, Math.hypot(l.x - w.x, l.z - w.z));
    g.simulate(0);
    const t = window.__rt.telemetry().target;
    g.player.press();
    g.step(1 / 60, 1);
    g.player.release();
    g.simulate(0);
    return { target: t, held: window.__rt.telemetry().held };
  });
  console.log('taken out', JSON.stringify(held));
  if (held.held !== 'tool:jerrycan') fail('could not take the can out of the bed');
  if (errors.length) fail(`page errors ${errors.slice(0, 3)}`);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `${bad} failed` : 'cargo ok');
process.exit(bad ? 1 : 0);
