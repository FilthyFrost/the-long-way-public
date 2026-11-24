// The ND cabin in the game (docs/ND/PLAN.md): driven up to from the driver's seat, walked up to its porch, its
// door opened, gone into; and at dusk with its lamps on. A world asked for the cabin (?nd=cabin) lays it at the
// first stretch it fits in.
//   SHOTS_GPU=1 node harness/shots/nd1_cabin.mjs [seed] [hour]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/nd1');
fs.mkdirSync(out, { recursive: true });
const seed = process.argv[2] || '7';
const hour = process.argv[3] || '16.3';
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=${seed}&start=road&build=stock:pickup&nd=cabin&time=${hour}&weather=clear`, { width: 1280, height: 720 });
  const step = (n = 6) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.simulate(1 / 30); }, n);
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
    await page.evaluate(() => { window.__rt.game.player.clearHighlight?.(); window.__rt.render(); });
    await page.screenshot({ path: path.join(out, f) });
    console.log('shot', f);
  };
  const places = await page.evaluate(() => window.__rt.game.systems.harness('nd-build', 'places'));
  console.log('places', JSON.stringify(places));
  const P = places.find((p) => p.prefab === 'cabin');
  if (!P) throw new Error('no cabin laid');
  // card frame -> world (u along the road, v away from it)
  const W = (u, v) => ({ x: P.x + Math.cos(P.yaw) * u - Math.sin(P.yaw) * v, z: P.z + Math.sin(P.yaw) * u + Math.cos(P.yaw) * v });
  const side = await page.evaluate((id) => {
    const out = [];
    window.__rt.game.world.sites.between(0, 60000, out);
    return out.find((s) => s.id === id).side;
  }, P.id);
  // ---- from the driver's seat, 70 m and 25 m before it
  for (const [d, look, f] of [[70, 0.3, '1_drive_70m.png'], [28, 0.95, '2_drive_28m.png']]) {
    await page.evaluate(({ s }) => {
      const g = window.__rt.game;
      const st = {};
      g.world.spine.at(s, st);
      g.teleportTo(st.x, st.z, -st.phi, true);
      g.simulate(0);
    }, { s: P.s - d });
    await page.evaluate(() => window.__rt.setView('cockpit'));
    await settle();
    await page.evaluate((y) => window.__rt.look(y, -0.04), look * side);
    await step(4);
    await shot(f);
  }
  // ---- on foot: before the steps, looking at the porch and its door
  const stand = async (from, to, pitch = 0) => {
    const a = W(from[0], from[1]);
    const b = W(to[0], to[1]);
    await page.evaluate(({ a, b, pitch }) => window.__rt.stand(a.x, a.z, Math.atan2(b.z - a.z, b.x - a.x), pitch), { a, b, pitch });
    await step(12);
  };
  await stand([-1.2, -9.0], [-1.0, 0.0], 0.05);
  await settle();
  await shot('3_front.png');
  await stand([-3.65, -4.7], [-2.75, -0.6], 0.02);
  await shot('4_steps.png');
  await page.evaluate((id) => window.__rt.game.systems.harness('nd-build', 'door', id, true), P.id);
  await stand([-4.0, -0.6], [1.0, -0.6], -0.05);
  await shot('5_porch_door_open.png');
  // ---- inside
  await stand([-1.9, 0.3], [2.6, 1.6], -0.12);
  await shot('6_inside_kitchen.png');
  await stand([2.2, 1.0], [-1.6, -2.0], -0.15);
  await shot('7_inside_table.png');
  // ---- dusk, the lamps on
  await page.evaluate((id) => { window.__rt.setHour(19.7); window.__rt.game.systems.harness('nd-build', 'lights', id, true); }, P.id);
  await step(10);
  await stand([2.2, 1.0], [-1.6, -2.0], -0.15);
  await shot('8_dusk_inside.png');
  await stand([-7.5, -10.0], [0.0, 0.0], 0.06);
  await shot('9_dusk_outside.png');
  if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
} finally {
  await browser.close();
  await server.close();
}
