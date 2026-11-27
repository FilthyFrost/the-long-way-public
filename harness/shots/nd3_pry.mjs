// ND3's crowbar in the game (docs/ND/PLAN.md): the cabin's door found locked and stuck — E rattles it; a key turned in it
// (still stuck); the crowbar set into its gap, E held, the bar biting; the door forced open for good.
//   SHOTS_GPU=1 node harness/shots/nd3_pry.mjs [seed] [hour]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/nd3');
fs.mkdirSync(out, { recursive: true });
const seed = process.argv[2] || '7';
const hour = process.argv[3] || '15.6';
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=${seed}&start=road&build=stock:pickup&nd=cabin&time=${hour}&weather=clear`, { width: 1280, height: 720 });
  const step = (n = 6) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.simulate(1 / 30); }, n);
  const frames = (n) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.step(1 / 60, 1); }, n);
  const H = (sys, fn, ...a) => page.evaluate(({ sys, fn, a }) => window.__rt.game.systems.harness(sys, fn, ...a), { sys, fn, a });
  const shot = async (f) => {
    await page.evaluate(() => window.__rt.render());
    await page.screenshot({ path: path.join(out, f) });
    console.log('shot', f, JSON.stringify(await H('nd-build', 'pry', P.id)));
  };
  const P = (await H('nd-build', 'places')).find((p) => p.prefab === 'cabin');
  const W = (x, y) => ({ x: P.x + Math.cos(P.yaw) * x + Math.sin(P.yaw) * y, z: P.z + Math.sin(P.yaw) * x - Math.cos(P.yaw) * y });
  await page.evaluate(({ x, z }) => { const g = window.__rt.game; g.teleportTo(x, z, 0, true); g.simulate(0); }, W(-7, 8));
  for (let i = 0; i < 60; i++) {
    await step(4);
    const st = await page.evaluate(() => ({ pending: window.__rt.worldPending(), drawn: window.__rt.game.systems.harness('nd-build', 'drawn') }));
    if (st.pending <= 0 && st.drawn.length && st.drawn.every((d) => d.ready)) break;
  }
  await page.evaluate(() => window.__rt.game.loose.settled());
  await step(8);
  await H('nd-build', 'door', P.id, false);
  console.log('set', await H('nd-build', 'setPry', P.id, true, true));
  // on the porch facing the door (its middle on the west wall)
  const door = W(-2.6, 0.62);
  const from = W(-3.75, 0.7);
  const look = async (pitch = 0) => {
    await page.evaluate(({ door, from, y }) => window.__rt.aimPoint(door.x, y, door.z, Math.atan2(from.z - door.z, from.x - door.x), Math.hypot(from.x - door.x, from.z - door.z)), { door, from, y: P.y + 1.05 });
    if (pitch) await page.evaluate((p) => { const g = window.__rt.game; g.input.lookPitch += p; g.simulate(0); }, pitch);
  };
  await page.evaluate(() => { const p = window.__rt.game.player; p.slots[p.sel] = null; });
  await look();
  console.log('target', JSON.stringify(await page.evaluate(() => window.__rt.game.player.telemetry().target)));
  await page.evaluate(() => window.__rt.press());
  await frames(5);
  await shot('20_door_locked_rattles.png');
  // a key turned: unlocked, still stuck
  await page.evaluate(() => window.__rt.hold('item:nd_key_1'));
  await look();
  await page.evaluate(() => window.__rt.press());
  await frames(20);
  await shot('21_key_turned_still_stuck.png');
  // the crowbar: E held, the bar in the gap
  await page.evaluate(() => window.__rt.hold('item:nd_crowbar'));
  await look(-0.05);
  await page.evaluate(() => { const g = window.__rt.game; g.mouseDown(0); for (let i = 0; i < 54; i++) { g.step(1 / 60, 1); } });
  await shot('22_crowbar_prying.png');
  await page.evaluate(() => { const g = window.__rt.game; for (let i = 0; i < 60; i++) { g.step(1 / 60, 1); } g.mouseUp(0); g.simulate(0); });
  await frames(30);
  await shot('23_forced_open.png');
  console.log('bar', JSON.stringify(await page.evaluate(() => { const h = window.__rt.game.player.held; return h ? { item: h.item.item, pries: h.item.state?.pries } : null; })));
  if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
} finally {
  await browser.close();
  await server.close();
}
