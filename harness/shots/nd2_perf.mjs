// ND2's frame cost (docs/ND/PLAN.md): rendered frames looking across the cabin (every ND system running, its kitchen
// furnished) and at the water pump while a can fills under it (the stream, the handle, the pour's sound), the ND
// systems' own milliseconds among them.
//   SHOTS_GPU=1 node harness/shots/nd2_perf.mjs [seed] [hour]
import { launchBrowser, openGame, startServer } from './lib.mjs';

const seed = process.argv[2] || '7';
const hour = process.argv[3] || '15.6';
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=${seed}&start=road&build=stock:pickup&nd=pump,cabin&time=${hour}&weather=clear`, { width: 1280, height: 720 });
  const step = (n = 6) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.simulate(1 / 30); }, n);
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
  const probe = (holdE) =>
    page.evaluate((holdE) => {
      const g = window.__rt.game;
      g.systems.resetTimings?.();
      const t = [];
      if (holdE) g.player.press();
      for (let i = 0; i < 120; i++) {
        if (holdE) g.player.primary = true;
        const a = performance.now();
        g.frame(1 / 60);
        t.push(performance.now() - a);
      }
      if (holdE) g.player.release();
      t.sort((x, y) => x - y);
      const st = g.core.stats;
      const sys = g.systems.telemetry();
      const nd = Object.fromEntries(Object.entries(sys).filter(([k]) => k.startsWith('nd-')).map(([k, v]) => [k, +(v.ms?.total ?? v.ms?.mean ?? 0).toFixed(3)]));
      return { median: +t[60].toFixed(2), p95: +t[114].toFixed(2), calls: st.calls, tris: st.triangles, nd };
    }, holdE);
  const places = await H('nd-build', 'places');
  // the cabin, looked across
  const C = places.find((p) => p.prefab === 'cabin');
  const W = (x, y) => ({ x: C.x + Math.cos(C.yaw) * x + Math.sin(C.yaw) * y, z: C.z + Math.sin(C.yaw) * x - Math.cos(C.yaw) * y });
  await page.evaluate(({ x, z }) => { const g = window.__rt.game; g.teleportTo(x, z, 0, true); g.simulate(0); }, W(-7, 8));
  await settle();
  await H('nd-build', 'door', C.id, true);
  const a = W(-1.9, 0.3);
  const b = W(2.6, 1.0);
  await page.evaluate(({ a, b }) => window.__rt.stand(a.x, a.z, Math.atan2(b.z - a.z, b.x - a.x), -0.1), { a, b });
  await step(10);
  console.log('cabin', JSON.stringify(await probe(false)));
  // the pump, a can filling under it
  const P = places.find((p) => p.prefab === 'pump');
  await page.evaluate(({ x, z }) => { const g = window.__rt.game; g.teleportTo(x + 6, z + 6, 0, true); g.simulate(0); }, { x: P.x, z: P.z });
  await settle();
  const pump = (await H('nd-water', 'pumps'))[0];
  await page.evaluate(() => window.__rt.hold('item:nd_water_can'));
  await page.evaluate(() => { const h = window.__rt.game.player.held; h.item.litres = 0; h.item.state = { found: true }; });
  await page.evaluate(({ p }) => window.__rt.aimPoint(p.spout.x, p.spout.y - 0.12, p.spout.z, p.yaw + 0.5, 0.85), { p: pump });
  console.log('pump filling', JSON.stringify(await probe(true)));
  if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
} finally {
  await browser.close();
  await server.close();
}
