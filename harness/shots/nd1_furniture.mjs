// ND1's furniture opened (docs/ND/PLAN.md): the cabin's fridge with its door open and its list, the kitchen stand's
// drawer pulled out and a door open, the wall cabinet's glass door open; and a frame-time probe in the cabin.
//   SHOTS_GPU=1 node harness/shots/nd1_furniture.mjs [seed] [hour]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/nd1');
fs.mkdirSync(out, { recursive: true });
const seed = process.argv[2] || '7';
const hour = process.argv[3] || '15.6';
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=${seed}&start=road&build=stock:pickup&nd=cabin&time=${hour}&weather=clear`, { width: 1280, height: 720 });
  const step = (n = 6) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.simulate(1 / 30); }, n);
  const secs = (s) => page.evaluate((s) => { const g = window.__rt.game; for (let t = 0; t < s; t += 1 / 30) g.step(1 / 30, 1); g.simulate(0); }, s);
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
    console.log('shot', f);
  };
  const P = (await H('nd-build', 'places')).find((p) => p.prefab === 'cabin');
  if (!P) throw new Error('no cabin laid');
  const W = (u, v) => ({ x: P.x + Math.cos(P.yaw) * u - Math.sin(P.yaw) * v, z: P.z + Math.sin(P.yaw) * u + Math.cos(P.yaw) * v });
  const stand = async (from, to, pitch = 0) => {
    const a = W(from[0], from[1]);
    const b = W(to[0], to[1]);
    await page.evaluate(({ a, b, pitch }) => window.__rt.stand(a.x, a.z, Math.atan2(b.z - a.z, b.x - a.x), pitch), { a, b, pitch });
    await step(10);
  };
  await page.evaluate(({ x, z }) => { const g = window.__rt.game; g.teleportTo(x, z, 0, true); g.simulate(0); }, W(-7, -8));
  await settle();
  await H('nd-build', 'door', P.id, true);
  const things = await page.evaluate(({ x, z }) => window.__rt.game.loose.list.filter((l) => l.item && Math.hypot(l.x - x, l.z - z) < 8).map((l) => l.item.item), { x: P.x, z: P.z });
  console.log('things', JSON.stringify(things));
  const pieces = await H('nd-home', 'pieces');
  console.log('pieces', pieces.map((p) => `${p.item}[${p.movers.join(',')}]`).join(' '));
  const of = (id) => pieces.find((p) => p.item === id);
  const stand_ = of('nd_kitchen_stand');
  const top = of('nd_top_cabinet');
  const fridge = of('nd_fridge');
  if (stand_) {
    await H('nd-home', 'open', stand_.uid, 'P_drawer_a', true);
    await H('nd-home', 'open', stand_.uid, 'P_door_b', true);
  }
  if (top) await H('nd-home', 'open', top.uid, 'P_door_a', true);
  await secs(0.6);
  await stand([0.9, 0.4], [3.0, 0.5], -0.22);
  await shot('40_kitchen_open.png');
  if (fridge) {
    await H('nd-home', 'open', fridge.uid, 'P_door', true);
    await page.evaluate(() => window.__rt.game.closeCargoList?.());
    await secs(0.6);
    await stand([0.9, 0.2], [2.8, 1.3], -0.2);
    await shot('41_fridge_open.png');
  }
  // a frame-time probe in the cabin, looking across it (rendered frames, the ND systems running)
  await stand([-1.9, 0.3], [2.6, 1.0], -0.1);
  const perf = await page.evaluate(() => {
    const g = window.__rt.game;
    const t = [];
    for (let i = 0; i < 90; i++) {
      const a = performance.now();
      g.frame(1 / 60);
      t.push(performance.now() - a);
    }
    t.sort((x, y) => x - y);
    const st = g.core.stats;
    const sys = g.systems.telemetry();
    const nd = Object.fromEntries(Object.entries(sys).filter(([k]) => k.startsWith('nd-')).map(([k, v]) => [k, +(v.ms?.total ?? 0).toFixed(3)]));
    return { median: +t[45].toFixed(2), p95: +t[85].toFixed(2), calls: st.calls, tris: st.triangles, nd };
  });
  console.log('perf', JSON.stringify(perf));
  if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
} finally {
  await browser.close();
  await server.close();
}
