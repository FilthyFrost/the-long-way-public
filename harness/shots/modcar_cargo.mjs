// Things ride on vehicles: a jerrycan put down into the donor pickup's bed with Q looking into it (docs/V3/plan/growth.md
// §二, J1: Q puts down — looking at a vehicle, into it; it was the old G, and before it putting it down over the bed) lies
// on its floor, goes out to the road with it (the other can stays in the workshop: nothing is thrown away, docs/MODCAR.md
// §17), and can be taken out there with the left button. Writes loop/shots/modcar_cargo/*.png.
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
const ok = (cond, why) => (cond ? console.log('ok  ', why) : fail(why));
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&project=full`, { width: 1280, height: 720 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  /** the petrol can: stood beside it (on the side where the mark is on it and not on the diesel can by it), looked at, the left button pressed — what the mark was on, what is in the hands */
  const takeCan = () =>
    page.evaluate(() => {
      const g = window.__rt.game;
      const l = g.loose.list.find((x) => x.tool?.kind === 'jerrycan' && x.tool.fuel === 'petrol');
      if (!l) return { target: 'gone', held: '' };
      if (g.seated) g.getOut();
      g.viewMode = 'cockpit';
      const w = g.player.walker;
      let target = '';
      for (let k = 0; k < 8 && target !== `loose:${l.uid}`; k++) {
        const a = (k * Math.PI) / 4;
        w.place(l.x + Math.cos(a) * 0.9, l.z + Math.sin(a) * 0.9, a + Math.PI);
        for (let i = 0; i < 3; i++) {
          ({ yaw: g.input.lookYaw, pitch: g.input.lookPitch } = w.lookAt(l.x, l.y + l.mid, l.z));
          g.simulate(i ? 0.05 : 0);
        }
        target = window.__rt.telemetry().target;
      }
      g.player.press();
      g.step(1 / 60, 1);
      g.player.release();
      g.simulate(0);
      return { target, can: `loose:${l.uid}`, held: window.__rt.telemetry().held, fuel: g.player.held?.tool?.fuel ?? '' };
    });
  // the petrol can picked up off the workshop's floor, then Q looking into the donor's bed
  const picked = await takeCan();
  ok(picked.target === picked.can && picked.held === 'tool:jerrycan' && picked.fuel === 'petrol', `the petrol can picked up with the left button (${JSON.stringify(picked)})`);
  await rt('aimZone', 1, 'bed', 1.2);
  await rt('simulate', 0.5);
  const said = await page.evaluate(() => [...document.querySelectorAll('.mc-acts *')].map((e) => e.textContent).join(' '));
  await page.keyboard.press('KeyQ');
  const put = await page.evaluate(async () => {
    const g = window.__rt.game;
    for (let i = 0; i < 60; i++) g.step(1 / 60, 1);
    const l = g.loose.list.find((x) => x.tool?.kind === 'jerrycan' && x.tool.fuel === 'petrol');
    const v = g.vehicles[1];
    return { riding: l?.riding?.on === v, zone: l?.stow ?? null, y: l?.y, ground: v.sim.py - v.sys.derived.cg.y, held: window.__rt.telemetry().held };
  });
  console.log('put in the bed', JSON.stringify(put));
  ok(/收进车里/.test(said), `looking into the bed with the can: "Q 收进车里" (${said.slice(0, 50)})`);
  ok(put.riding && put.zone === 'bed' && !put.held && put.y > put.ground + 0.5, `Q: the can lies in the bed, riding with the pickup (${put.zone}, ${(put.y - put.ground).toFixed(2)} m up)`);
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
  // (braked to a stop — standing still, not only along its length — and not on into reverse)
  await page.evaluate(() => {
    const g = window.__rt.game;
    g.scripted = { steer: 0, throttle: 0, brake: 1, handbrake: 1 };
    for (let i = 0; i < 900 && g.seated.sim.speed * 3.6 > 1; i++) g.step(1 / 60, 1);
    g.seated.sim.setParkBrake(true);
    g.scripted = null;
  });
  const road = await page.evaluate(() => {
    const g = window.__rt.game;
    const v = g.seated;
    const l = g.loose.list.find((x) => x.tool?.kind === 'jerrycan' && x.tool.fuel === 'petrol');
    const other = g.loose.list.find((x) => x.tool?.kind === 'jerrycan' && x.tool.fuel !== 'petrol');
    return { place: g.place, things: g.loose.list.length, riding: l?.riding?.on === v, d: l ? Math.hypot(l.x - v.sim.px, l.z - v.sim.pz) : -1, other: other ? Math.hypot(other.x - v.sim.px, other.z - v.sim.pz) : -1 };
  });
  console.log('on the road', JSON.stringify(road));
  ok(road.place === 'road' && road.riding && road.d < 3, `on the road: the can came along in the bed (${road.d.toFixed(2)} m from the pickup's middle)`);
  ok(road.other > 20, `the other can stayed in the workshop (${road.other.toFixed(0)} m back)`);
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
  // out, and the can taken out of the bed with the left button
  await rt('exit');
  await rt('setView', 'cockpit');
  const t1 = await rt('telemetry');
  ok(!t1.seated, `out of the pickup (${JSON.stringify({ kmh: t1.kmh, place: t1.place })})`);
  const held = await takeCan();
  console.log('taken out', JSON.stringify(held));
  ok(held.target === held.can && held.held === 'tool:jerrycan' && held.fuel === 'petrol', `the left button on the can in the bed: in the hands (${held.target})`);
  if (errors.length) fail(`page errors ${errors.slice(0, 3)}`);
} catch (e) {
  fail(e.stack ?? e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `modcar_cargo: ${bad} FAILED` : 'modcar_cargo: ok');
process.exit(bad ? 1 : 0);
