// ND3's flashlight in the game (docs/ND/PLAN.md): at night by the cabin — no light, the flashlight on (wide), focused
// (narrow, further), inside the cabin, put down lit on the floor, and nearly spent (dimmer, warmer, flickering).
//   SHOTS_GPU=1 node harness/shots/nd3_light.mjs [seed] [hour]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/nd3');
fs.mkdirSync(out, { recursive: true });
const seed = process.argv[2] || '7';
const hour = process.argv[3] || '22.5';
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=${seed}&start=road&build=stock:pickup&nd=cabin&time=${hour}&weather=clear`, { width: 1280, height: 720 });
  const step = (n = 6) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.simulate(1 / 30); }, n);
  const frames = (n, f = false) => page.evaluate(({ n, f }) => { const g = window.__rt.game; for (let i = 0; i < n; i++) { g.rightButton = f; g.step(1 / 60, 1); } g.rightButton = false; }, { n, f });
  const H = (sys, fn, ...a) => page.evaluate(({ sys, fn, a }) => window.__rt.game.systems.harness(sys, fn, ...a), { sys, fn, a });
  const settle = async () => {
    for (let i = 0; i < 80; i++) {
      await step(4);
      const st = await page.evaluate(() => ({ pending: window.__rt.worldPending(), drawn: window.__rt.game.systems.harness('nd-build', 'drawn') }));
      if (st.pending <= 0 && st.drawn.length && st.drawn.every((d) => d.ready)) break;
    }
    await page.evaluate(() => window.__rt.game.loose.settled());
    await step(8);
  };
  const shot = async (f) => {
    await page.evaluate(() => window.__rt.render());
    await page.screenshot({ path: path.join(out, f) });
    console.log('shot', f, JSON.stringify(await H('nd-light', 'beam')));
  };
  const P = (await H('nd-build', 'places')).find((p) => p.prefab === 'cabin');
  const W = (x, y) => ({ x: P.x + Math.cos(P.yaw) * x + Math.sin(P.yaw) * y, z: P.z + Math.sin(P.yaw) * x - Math.cos(P.yaw) * y });
  const stand = async (from, to, pitch = 0) => {
    const a = W(from[0], from[1]);
    const b = W(to[0], to[1]);
    await page.evaluate(({ a, b, pitch }) => window.__rt.stand(a.x, a.z, Math.atan2(b.z - a.z, b.x - a.x), pitch), { a, b, pitch });
    await step(6);
  };
  await page.evaluate(({ x, z }) => { const g = window.__rt.game; g.teleportTo(x, z, 0, true); g.simulate(0); }, W(-7, 8));
  await settle();
  await H('nd-build', 'door', P.id, true);
  // the cabin's front at night from the road side, nothing in the hands
  await page.evaluate(() => { const p = window.__rt.game.player; p.slots[p.sel] = null; });
  await stand([-2.0, 9.0], [-1.0, 2.5], -0.12);
  await frames(4);
  await shot('01_night_no_light.png');
  // the flashlight, full, switched on with the left button
  await page.evaluate(() => window.__rt.hold('item:nd_flashlight'));
  await page.evaluate(() => { const h = window.__rt.game.player.held; h.item.state = { charge: 100, found: true }; });
  await stand([-2.0, 9.0], [-1.0, 2.5], -0.12);
  await page.evaluate(() => { const g = window.__rt.game; g.player.press('mouse'); g.step(1 / 60, 1); g.player.release('mouse'); });
  await frames(30);
  console.log('held', JSON.stringify(await H('nd-light', 'held')));
  await shot('02_flashlight_wide.png');
  // focused: F held
  await frames(40, true);
  await page.evaluate(() => { const g = window.__rt.game; g.rightButton = true; g.simulate(0); });
  await shot('03_flashlight_focused.png');
  await frames(2);
  // inside the cabin, across the room
  await stand([-1.9, 0.3], [2.6, 0.2], -0.18);
  await frames(30);
  await shot('04_cabin_by_flashlight.png');
  // put down lit on the floor, pointing at the kitchen
  await stand([-0.2, 0.4], [2.6, 0.5], -0.6);
  await page.evaluate(() => window.__rt.drop());
  await frames(40);
  await stand([-1.9, -1.2], [2.0, 0.9], -0.2);
  await frames(10);
  console.log('lying', JSON.stringify(await H('nd-light', 'lying')));
  await shot('05_left_lit_on_the_floor.png');
  // nearly spent: dim, warm, flickering
  await page.evaluate(() => { const g = window.__rt.game; const l = g.loose.list.find((x) => x.item?.item === 'nd_flashlight'); g.player.takeLoose(l); g.simulate(0); });
  await page.evaluate(() => { const h = window.__rt.game.player.held; h.item.state.charge = 9; });
  await stand([-1.9, 0.3], [2.6, 0.2], -0.18);
  await frames(30);
  await shot('06_nearly_spent.png');
  if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
} finally {
  await browser.close();
  await server.close();
}
