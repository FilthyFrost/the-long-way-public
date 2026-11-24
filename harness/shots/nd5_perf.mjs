// ND5's frame cost (docs/ND/PLAN.md): rendered frames in front of each big place — the filling station with the
// pump's nozzle in the hand and its hose drawn after it, the motel at night (nine lamps over its doors and their
// pools, its neon striking, two or three rooms lit), the commune's houses, the starter house — the ND systems' own
// milliseconds among them, and the draw calls.
//   SHOTS_GPU=1 node harness/shots/nd5_perf.mjs [seed]
import { launchBrowser, openGame, startServer } from './lib.mjs';

const seed = process.argv[2] || '7';
const { server, url } = await startServer();
const browser = await launchBrowser();
const probe = (page) =>
  page.evaluate(() => {
    const g = window.__rt.game;
    g.systems.resetTimings?.();
    const t = [];
    for (let i = 0; i < 120; i++) {
      const a = performance.now();
      g.step(1 / 60);
      g.render();
      t.push(performance.now() - a);
    }
    t.sort((x, y) => x - y);
    const sys = g.systems.telemetry();
    const nd = Object.fromEntries(Object.entries(sys).filter(([k]) => k.startsWith('nd-')).map(([k, v]) => [k, +(v.ms?.total ?? 0).toFixed(3)]));
    return { median: +t[60].toFixed(2), p95: +t[114].toFixed(2), calls: g.core.stats.calls, tris: g.core.stats.triangles ?? null, nd };
  });
const CASES = [
  ['station', 15.5, [1.6, -9.0], [-3.0, -5.0], true],
  ['motel', 21.5, [-4, -18], [-2, 0], false],
  ['commune', 15.5, [2, -19], [0, 0], false],
  ['starter', 15.5, [-1, -17], [-1, 0], false],
];
try {
  for (const [prefab, hour, from, to, nozzle] of CASES) {
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=${seed}&start=road&build=stock:pickup&nd=${prefab}&time=${hour}&weather=clear`, { width: 1280, height: 720 });
    const H = (sys, fn, ...a) => page.evaluate(({ sys, fn, a }) => window.__rt.game.systems.harness(sys, fn, ...a), { sys, fn, a });
    const P = (await H('nd-build', 'places')).find((p) => p.prefab === prefab);
    const W = (u, v) => ({ x: P.x + Math.cos(P.yaw) * u - Math.sin(P.yaw) * v, z: P.z + Math.sin(P.yaw) * u + Math.cos(P.yaw) * v });
    await page.evaluate(({ x, z }) => { const g = window.__rt.game; g.teleportTo(x, z, 0, true); g.simulate(0); }, W(from[0], from[1]));
    for (let i = 0; i < 90; i++) {
      await page.evaluate(() => { const g = window.__rt.game; for (let i = 0; i < 4; i++) g.simulate(1 / 30); });
      const st = await page.evaluate(() => ({ pending: window.__rt.worldPending(), drawn: window.__rt.game.systems.harness('nd-build', 'drawn') }));
      if (st.pending <= 0 && st.drawn.length && st.drawn.every((d) => d.ready)) break;
    }
    const a = W(from[0], from[1]);
    const b = W(to[0], to[1]);
    await page.evaluate(({ a, b }) => { const g = window.__rt.game; if (g.seated) g.getOut(); window.__rt.stand(a.x, a.z, Math.atan2(b.z - a.z, b.x - a.x), -0.05); }, { a, b });
    if (nozzle) {
      const pump = (await H('nd-fuel', 'pumps'))[0];
      await H('nd-fuel', 'take', pump.site);
    }
    await page.evaluate(() => { const g = window.__rt.game; for (let i = 0; i < 120; i++) { g.step(1 / 60); g.render(); } });
    await probe(page);
    const r = await probe(page);
    const extra = nozzle ? JSON.stringify(await H('nd-fuel', 'state')) : '';
    console.log(`${prefab}${nozzle ? ' (the nozzle in the hand)' : ''} at ${hour}h`, JSON.stringify(r), extra);
    if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
