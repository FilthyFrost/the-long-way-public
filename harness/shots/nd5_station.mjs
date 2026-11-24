// ND5's filling station in the game (docs/ND/PLAN.md): Nomad Drive's GasStation01 — its shop, its garage bay, its
// store room, the canopy over its pump, its neon sign — seen from the road, walked into, and at night with its sign lit;
// what it was found with.
//   SHOTS_GPU=1 node harness/shots/nd5_station.mjs [seed]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/nd5');
fs.mkdirSync(out, { recursive: true });
const seed = process.argv[2] || '7';
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=${seed}&start=road&build=stock:pickup&nd=station&time=15.5&weather=clear`, { width: 1280, height: 720 });
  const step = (n = 6) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.simulate(1 / 30); }, n);
  const H = (sys, fn, ...a) => page.evaluate(({ sys, fn, a }) => window.__rt.game.systems.harness(sys, fn, ...a), { sys, fn, a });
  const shot = async (f, extra = '') => {
    await page.evaluate(() => window.__rt.render());
    await page.screenshot({ path: path.join(out, f) });
    console.log('shot', f, extra);
  };
  const P = (await H('nd-build', 'places')).find((p) => p.prefab === 'station');
  if (!P) throw new Error('no station laid');
  console.log('station', JSON.stringify(P));
  const W = (u, v) => ({ x: P.x + Math.cos(P.yaw) * u - Math.sin(P.yaw) * v, z: P.z + Math.sin(P.yaw) * u + Math.cos(P.yaw) * v });
  await page.evaluate(({ x, z }) => { const g = window.__rt.game; g.teleportTo(x, z, 0, true); g.simulate(0); }, W(4, -22));
  for (let i = 0; i < 90; i++) {
    await step(4);
    const st = await page.evaluate(() => ({ pending: window.__rt.worldPending(), drawn: window.__rt.game.systems.harness('nd-build', 'drawn') }));
    if (st.pending <= 0 && st.drawn.length && st.drawn.every((d) => d.ready)) break;
  }
  await page.evaluate(() => window.__rt.game.loose.settled());
  await step(8);
  const look = async (from, to, pitch) => {
    const a = W(from[0], from[1]);
    const b = W(to[0], to[1]);
    await page.evaluate(({ a, b, pitch }) => window.__rt.stand(a.x, a.z, Math.atan2(b.z - a.z, b.x - a.x), pitch), { a, b, pitch });
    await step(6);
  };
  const things = await page.evaluate(({ x, z }) => window.__rt.game.loose.list.filter((l) => Math.hypot(l.x - x, l.z - z) < 16).map((l) => l.item?.item ?? l.tool?.kind ?? l.part?.part ?? '?'), { x: P.x, z: P.z });
  console.log('found', things.length, JSON.stringify(things));
  // (the pickup one came in out of the way: parked behind the station)
  await page.evaluate(({ x, z, yaw }) => window.__rt.placeVehicle(0, x, z, yaw), { ...W(-18, 16), yaw: P.yaw });
  await step(4);
  await look([-14, -26], [-1, -1], -0.05);
  await shot('20_station_from_the_road.png');
  await look([1.2, -9.5], [-3.4, -4.2], -0.12);
  await shot('21_by_the_pump.png');
  // inside, its lights on
  await H('nd-build', 'lights', P.id, true);
  await step(4);
  await look([-3.0, 3.9], [0.2, 9.5], -0.16);
  await shot('22_in_the_shop.png');
  await look([1.2, 4.0], [3.6, 5.2], -0.25);
  await shot('23_the_counter.png');
  await look([7.6, 3.4], [7.6, 10.6], -0.18);
  await shot('24_the_garage.png');
  await look([-9.2, 6.6], [-8.6, 9.6], -0.1);
  await shot('25_the_store_room_door.png');
  // at night: the sign and the canopy lit
  await H('nd-build', 'lights', P.id, false);
  await page.evaluate(() => window.__rt.setHour(21.5));
  await step(150);
  await look([9, -26], [-1, -2], -0.04);
  await shot('26_lit_at_night.png', JSON.stringify((await H('nd-build', 'drawn')).find((d) => d.site === P.id)));
  await look([2.6, -10.5], [-3, -5], -0.1);
  await shot('27_the_canopy_at_night.png');
  await look([4.5, -17], [11.6, -12], 0.42);
  await shot('28_the_sign_at_night.png');
  if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
} finally {
  await browser.close();
  await server.close();
}
