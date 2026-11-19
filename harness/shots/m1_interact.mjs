// Milestone M1, the interactions in and by the vehicle (docs/V3/nodes/M1-interact.md), walked through in the game:
//   1. the handbrake is in sight and in reach from the driver's seat (looking down to the right), in every
//      stock vehicle with doors; a click on it sets it, and Space held lifts the same lever
//   2. no standing "E 下车" in the seat's keys; on one's own door it is offered
//   3. over to the passenger's seat and back (E on the other seat), the driving keys gone there, out by the
//      passenger's door on the right
//   4. beside a vehicle the two lists: a can put in from the hands' list, a box taken out from the vehicle's
//   5. inside a building by the road in the rain: shut in (heard through it), and not rained on
//   SHOTS_GPU=1 node harness/shots/m1_interact.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/m1_interact');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
const BUILDS = ['sedan', 'pickup', 'rv', 'snail', 'van', 'wagon', 'fox', 'goat', 'buffalo', 'rhino'];
try {
  // ---- 1–3, vehicle by vehicle
  for (const b of BUILDS) {
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=2&seed=7&start=road&build=stock:${b}&s=300&time=14&weather=clear`, { width: 1280, height: 720 });
    const step = (n = 6) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.simulate(1 / 30); }, n);
    await step(40);
    await page.evaluate(() => window.__rt.setView('cockpit'));
    // the handbrake: looked for over the right-hand half of the view below the horizon
    const hb = await page.evaluate(async () => {
      const g = window.__rt.game;
      for (let yaw = 0.1; yaw <= 2.0; yaw += 0.1) {
        for (let pitch = -0.2; pitch >= -1.3; pitch -= 0.1) {
          window.__rt.look(yaw, pitch);
          for (let i = 0; i < 2; i++) g.simulate(1 / 30);
          if (g.cockpit.aimed?.cat === 'handbrake') return { yaw: +yaw.toFixed(1), pitch: +pitch.toFixed(1) };
        }
      }
      return null;
    });
    if (!hb) fail(`${b}: the handbrake is not in sight from the seat looking right and down`);
    else {
      await page.evaluate(({ yaw, pitch }) => window.__rt.look(yaw, pitch), hb);
      await step(2);
      await page.evaluate(() => window.__rt.render());
      await page.screenshot({ path: path.join(out, `${b}_handbrake.png`) });
      const set = await page.evaluate(() => {
        const g = window.__rt.game;
        const v = g.seated;
        const was = v.sim.parkBrake > 0;
        g.cockpit.press(v, false);
        return { was, now: v.sim.parkBrake > 0 };
      });
      if (set.now === set.was) fail(`${b}: a click on the handbrake did not work it ${JSON.stringify(set)}`);
    }
    // the seat's keys
    const keys = await page.evaluate(() => [...window.__rt.game.driveKeys(window.__rt.game.seated)].map((k) => k.text));
    if (keys.some((t) => t.includes('下车'))) fail(`${b}: the seat's keys still say 下车: ${keys.join(' · ')}`);
    // over to the passenger's seat, and the driving keys gone
    const over = await page.evaluate(async () => {
      const g = window.__rt.game;
      for (let yaw = 0.6; yaw <= 1.6; yaw += 0.1) {
        for (let pitch = -0.1; pitch >= -0.8; pitch -= 0.1) {
          window.__rt.look(yaw, pitch);
          for (let i = 0; i < 2; i++) g.simulate(1 / 30);
          if (g.cockpit.aimedSeat) {
            g.moveOver();
            for (let i = 0; i < 30; i++) g.simulate(1 / 30);
            return { seatAt: g.seatAt, keys: g.driveKeys(g.seated).map((k) => k.text) };
          }
        }
      }
      return null;
    });
    if (!over) fail(`${b}: the passenger's seat is not in sight from the driver's`);
    else {
      if (over.seatAt !== 'pass') fail(`${b}: not moved over (${over.seatAt})`);
      if (over.keys.some((t) => t.includes('油门'))) fail(`${b}: the throttle is still offered from the passenger's seat`);
      await page.evaluate(() => window.__rt.look(0, 0));
      await step(2);
      await page.evaluate(() => window.__rt.render());
      await page.screenshot({ path: path.join(out, `${b}_passenger.png`) });
      // out by the passenger's door: on the right of the vehicle
      const side = await page.evaluate(() => {
        const g = window.__rt.game;
        const v = g.seated;
        const bs = new Float64Array(9);
        v.sim.basis(bs);
        g.getOut();
        const w = g.player.walker;
        return { seated: !!g.seated, right: +(bs[6] * (w.x - v.sim.px) + bs[8] * (w.z - v.sim.pz)).toFixed(2) };
      });
      if (side.seated || side.right < 0.5) fail(`${b}: not out on the passenger's side ${JSON.stringify(side)}`);
    }
    console.log(`${b.padEnd(8)} handbrake ${JSON.stringify(hb)} over ${JSON.stringify(over?.seatAt ?? null)}`);
    if (errors.length) fail(`${b}: page errors ${errors.slice(0, 2).join(' | ')}`);
    await page.close();
  }

  // ---- 4, the two lists beside the pickup in the workshop's yard
  {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${url}/modcar.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 180000 });
    const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
    const step = (n = 4) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.simulate(1 / 30); }, n);
    const pk = (await page.evaluate(() => window.__rt.game.vehicles.map((v) => v.view.frame.id))).indexOf('pickup');
    await rt('hold', 'item:crate_parts');
    await step();
    await rt('aimZone', pk, 'bed', 1.2);
    await rt('press');
    await step();
    await rt('pickUp', 'tool:jerrycan');
    await step();
    await rt('aimZone', pk, 'bed', 1.6);
    await page.evaluate(() => window.__rt.game.toggleCargoList());
    await step();
    const lists = await page.evaluate(() => [...document.querySelectorAll('.mc-cargo')].filter((e) => e.style.display !== 'none').map((e) => e.querySelector('.n')?.textContent ?? ''));
    if (lists.length !== 2) fail(`beside the pickup the lists shown are ${JSON.stringify(lists)}`);
    await page.evaluate(() => { const g = window.__rt.game; g.switchListSide(0); });
    await step();
    await page.evaluate(() => window.__rt.render());
    await page.screenshot({ path: path.join(out, 'lists.png') });
    await page.evaluate(() => window.__rt.game.takeFromList());
    await step();
    const inBed = (await rt('stowed', pk)).things.map((t) => t.what);
    if (!inBed.includes('tool:jerrycan')) fail(`the can did not go in from the hands' list: ${JSON.stringify(inBed)}`);
    await page.evaluate(() => window.__rt.game.switchListSide(1));
    await step();
    const before = (await rt('stowed', pk)).things.length;
    await page.evaluate(() => window.__rt.game.takeFromList());
    await step();
    const after = (await rt('stowed', pk)).things.length;
    if (after !== before - 1) fail(`nothing came out from the vehicle's list (${before} → ${after})`);
    console.log('lists', JSON.stringify(lists), 'bed', JSON.stringify(inBed), `${before} → ${after}`);
    if (errors.length) fail(`lists: page errors ${errors.slice(0, 2).join(' | ')}`);
    await page.close();
  }

  // ---- 5, inside a building by the road in the rain
  {
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=2&seed=7&start=road&build=stock:pickup&s=300&time=14&weather=rain`, { width: 960, height: 540 });
    const step = (n = 10) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.simulate(1 / 30); }, n);
    await step(30);
    const b = await page.evaluate(() => {
      const g = window.__rt.game;
      const v = g.seated;
      const pr = { s: 0, d: 0 };
      g.world.spine.project(v.sim.px, v.sim.pz, NaN, pr);
      for (let k = Math.floor(pr.s / 1000); k < Math.floor(pr.s / 1000) + 40; k++) {
        for (const site of g.world.sites.sitesOf(k)) for (const o of site.objects) if (o.kind === 'building') return { x: o.x, z: o.z, yaw: o.yaw };
      }
      return null;
    });
    if (!b) fail('no building by the road within 40 km');
    else {
      await page.evaluate((b) => {
        const g = window.__rt.game;
        if (g.seated) g.getOut();
        g.player.walker.place(b.x, b.z, b.yaw);
      }, b);
      await step(20);
      const s = await page.evaluate(() => ({ shelter: window.__rt.game.shelterNow, cover: window.__rt.game.coverNow?.kind ?? null }));
      if (!(s.shelter >= 0.9) || s.cover !== 'building') fail(`inside the building one is not shut in ${JSON.stringify(s)}`);
      console.log('inside a building', JSON.stringify(s));
    }
    if (errors.length) fail(`building: page errors ${errors.slice(0, 2).join(' | ')}`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `m1_interact: ${bad} FAILED` : 'm1_interact: ok');
process.exit(bad ? 1 : 0);
