// ND5's camp site in the game (docs/ND/PLAN.md): Nomad Drive's CampSite — four tents round a camp fire — seen from
// the road, walked into, and at night with the fire lit; what it was found with.
//   SHOTS_GPU=1 node harness/shots/nd5_camp.mjs [seed]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/nd5');
fs.mkdirSync(out, { recursive: true });
const seed = process.argv[2] || '7';
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=${seed}&start=road&build=stock:pickup&nd=camp&time=16.2&weather=clear`, { width: 1280, height: 720 });
  const step = (n = 6) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.simulate(1 / 30); }, n);
  const H = (sys, fn, ...a) => page.evaluate(({ sys, fn, a }) => window.__rt.game.systems.harness(sys, fn, ...a), { sys, fn, a });
  const shot = async (f, extra = '') => {
    await page.evaluate(() => window.__rt.render());
    await page.screenshot({ path: path.join(out, f) });
    console.log('shot', f, extra);
  };
  const P = (await H('nd-build', 'places')).find((p) => p.prefab === 'camp');
  if (!P) throw new Error('no camp laid');
  const W = (u, v) => ({ x: P.x + Math.cos(P.yaw) * u - Math.sin(P.yaw) * v, z: P.z + Math.sin(P.yaw) * u + Math.cos(P.yaw) * v });
  await page.evaluate(({ x, z }) => { const g = window.__rt.game; g.teleportTo(x, z, 0, true); g.simulate(0); }, W(-6, -14));
  for (let i = 0; i < 80; i++) {
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
  const things = await page.evaluate(({ x, z }) => window.__rt.game.loose.list.filter((l) => l.item && Math.hypot(l.x - x, l.z - z) < 9).map((l) => l.item.item), { x: P.x, z: P.z });
  console.log('found', JSON.stringify(things));
  await look([-7.5, -10.5], [0, 0], -0.12);
  await shot('10_camp_from_the_road.png');
  await look([-1.6, -2.4], [-0.25, -0.33], -0.42);
  await shot('11_by_the_fire.png');
  await look([2.6, -3.5], [1.02, 3.64], -0.3);
  await shot('12_into_a_tent.png');
  // at night, the fire lit
  await page.evaluate(() => window.__rt.setHour(21.5));
  await H('nd-build', 'lights', P.id, true);
  await step(10);
  await look([-4.0, -4.8], [0, 0], -0.2);
  await shot('13_fire_lit_at_night.png', JSON.stringify((await H('nd-build', 'drawn')).find((d) => d.site === P.id)));
  if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
} finally {
  await browser.close();
  await server.close();
}
