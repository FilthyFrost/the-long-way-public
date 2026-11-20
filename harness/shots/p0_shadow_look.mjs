// The vehicle's shadows after the shadow maps were thinned (docs/V3/perf-budget.json): the dash from the seat in a low
// sun, and the car's own shadow on the road from beside it. SHOTS_GPU=1 node harness/shots/p0_shadow_look.mjs [label]
import path from 'node:path';
import fs from 'node:fs';
import { built, idle } from './landscapeCapture.mjs';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const label = process.argv[2] ?? 'after';
const out = path.join(ROOT, 'loop/shots/p0_shadows');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openGame(browser, `${url}/modcar.html?shot=1&world=2&seed=7&start=road&build=stock:pickup&s=300&time=9&weather=clear`, { width: 1600, height: 900 });
  await idle(page);
  await page.evaluate(() => window.__rt.devGoKm(3.125, true));
  await built(page);
  await idle(page);
  await page.evaluate(() => {
    const rt = window.__rt;
    const g = rt.game;
    if (!g.seated) g.enter(g.focus, 'driver');
    g.ui.root.style.visibility = 'hidden';
    rt.setHour(9);
    rt.setView('cockpit');
    rt.look(0.35, -0.12);
    for (let i = 0; i < 20; i++) g.simulate(1 / 30);
  });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { const g = window.__rt.game; for (let i = 0; i < 10; i++) g.simulate(1 / 30); window.__rt.render(); });
  await page.screenshot({ path: path.join(out, `${label}_dash.png`) });
  await page.evaluate(() => {
    const rt = window.__rt;
    rt.setView('orbit');
    rt.setOrbit(2.2, 0.32, 9, 0.8);
    rt.render();
  });
  await page.screenshot({ path: path.join(out, `${label}_road_shadow.png`) });
} finally {
  await browser.close();
  await server.close();
}
console.log('shots in', out);
