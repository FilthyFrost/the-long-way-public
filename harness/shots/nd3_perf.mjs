// ND3's frame cost (docs/ND/PLAN.md): rendered frames across the cabin at night with the flashlight lit in the hands,
// every ND system running (the digging's places looked over too), the ND systems' own milliseconds among them.
//   SHOTS_GPU=1 node harness/shots/nd3_perf.mjs [seed]
import { launchBrowser, openGame, startServer } from './lib.mjs';

const seed = process.argv[2] || '7';
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=${seed}&start=road&build=stock:pickup&nd=cabin&time=22.5&weather=clear`, { width: 1280, height: 720 });
  const step = (n = 6) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.simulate(1 / 30); }, n);
  const H = (sys, fn, ...a) => page.evaluate(({ sys, fn, a }) => window.__rt.game.systems.harness(sys, fn, ...a), { sys, fn, a });
  const C = (await H('nd-build', 'places')).find((p) => p.prefab === 'cabin');
  const W = (x, y) => ({ x: C.x + Math.cos(C.yaw) * x + Math.sin(C.yaw) * y, z: C.z + Math.sin(C.yaw) * x - Math.cos(C.yaw) * y });
  await page.evaluate(({ x, z }) => { const g = window.__rt.game; g.teleportTo(x, z, 0, true); g.simulate(0); }, W(-7, 8));
  for (let i = 0; i < 60; i++) {
    await step(4);
    const st = await page.evaluate(() => ({ pending: window.__rt.worldPending(), drawn: window.__rt.game.systems.harness('nd-build', 'drawn') }));
    if (st.pending <= 0 && st.drawn.length && st.drawn.every((d) => d.ready)) break;
  }
  await page.evaluate(() => window.__rt.game.loose.settled());
  await H('nd-build', 'door', C.id, true);
  const a = W(-1.9, 0.3);
  const b = W(2.6, 1.0);
  await page.evaluate(({ a, b }) => window.__rt.stand(a.x, a.z, Math.atan2(b.z - a.z, b.x - a.x), -0.15), { a, b });
  await page.evaluate(() => window.__rt.hold('item:nd_flashlight'));
  await page.evaluate(() => { const g = window.__rt.game; g.player.held.item.state = { charge: 100, found: true }; g.player.press('mouse'); g.step(1 / 60, 1); g.player.release('mouse'); });
  await step(10);
  const perf = await page.evaluate(() => {
    const g = window.__rt.game;
    g.systems.resetTimings?.();
    const t = [];
    for (let i = 0; i < 120; i++) {
      const a = performance.now();
      g.frame(1 / 60);
      t.push(performance.now() - a);
    }
    t.sort((x, y) => x - y);
    const st = g.core.stats;
    const sys = g.systems.telemetry();
    const nd = Object.fromEntries(Object.entries(sys).filter(([k]) => k.startsWith('nd-')).map(([k, v]) => [k, +(v.ms?.total ?? 0).toFixed(3)]));
    return { median: +t[60].toFixed(2), p95: +t[114].toFixed(2), calls: st.calls, nd };
  });
  console.log('cabin at night, flashlight on', JSON.stringify(perf));
  if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
} finally {
  await browser.close();
  await server.close();
}
