// What the starting garage costs to draw (docs/MODCAR.md §9 budget: <= 150 draw calls, <= 400k triangles):
// its own meshes and triangles, its shadow casters, and the frame's totals at the spawn view.
//   SHOTS_GPU=1 node harness/shots/modcar_garage_cost.mjs
import { launchBrowser, openGame, startServer } from './lib.mjs';

const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openGame(browser, `${url}/modcar.html?shot=1`, { width: 1280, height: 720 });
  await page.evaluate(() => window.__rt.render());
  const cost = await page.evaluate(() => window.__rt.garageCost());
  const tele = await page.evaluate(() => window.__rt.telemetry());
  console.log(JSON.stringify({ garage: cost, frame: { calls: tele.calls, triangles: tele.triangles } }));
} finally {
  await browser.close();
  await server.close();
}
