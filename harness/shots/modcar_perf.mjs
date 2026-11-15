// Frame time of the ModCar game on this machine's GPU (SHOTS_GPU=1): renders the garage start, the
// garage seen from the car, and the road, N frames each through the game's own step + render, and
// prints the mean and the 95th percentile (ms) with the draw calls. Rough (headless Chrome, no vsync).
//   SHOTS_GPU=1 node harness/shots/modcar_perf.mjs
import { launchBrowser, openGame, startServer } from './lib.mjs';

const cases = [
  ['garage start', 'shot=1'],
  ['garage, car in view', 'shot=1&view=orbit&orbit=35,14,7.5,0.8'],
  ['road, chase', 'shot=1&start=road&build=stock:sedan&seed=7&s=3180&view=chase'],
  ['road, cockpit', 'shot=1&start=road&build=stock:sedan&seed=7&s=3180&view=cockpit'],
];
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  for (const [name, q] of cases) {
    const { page, errors } = await openGame(browser, `${url}/modcar.html?${q}`, { width: 1600, height: 900 });
    const r = await page.evaluate(async () => {
      const g = window.__rt.game;
      const gl = g.core.renderer.getContext();
      const times = [];
      // warm up (shaders, uploads)
      for (let i = 0; i < 10; i++) {
        g.step(1 / 60, 1);
        g.render();
      }
      gl.finish();
      for (let i = 0; i < 90; i++) {
        const t0 = performance.now();
        g.step(1 / 60, 1);
        g.render();
        gl.finish();
        times.push(performance.now() - t0);
      }
      times.sort((a, b) => a - b);
      const mean = times.reduce((a, b) => a + b, 0) / times.length;
      return { mean, p95: times[Math.floor(times.length * 0.95)], calls: g.core.stats.calls, tris: g.core.stats.triangles };
    });
    console.log(`${name.padEnd(22)} ${r.mean.toFixed(1)} ms mean  ${r.p95.toFixed(1)} ms p95  ${r.calls} calls  ${(r.tris / 1000).toFixed(0)}k tris${errors.length ? `  errors: ${errors.slice(0, 2)}` : ''}`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
