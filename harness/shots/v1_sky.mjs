// The sky probe (V1): stand by the road at a place and look round the sky — north, east, south, west, and up.
//   SHOTS_GPU=1 HOUR=21.5 MOON=0.02 node harness/shots/v1_sky.mjs <name> seed:place
// Out: loop/shots/v1/sky/<name>/<dir>.png
import fs from 'node:fs';
import path from 'node:path';
import { built, idle } from './landscapeCapture.mjs';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const [name = 'sky', spot = '1:28'] = process.argv.slice(2);
const [seed, place] = spot.split(':').map(Number);
const out = path.join(ROOT, `loop/shots/v1/sky/${name}`);
fs.mkdirSync(out, { recursive: true });
const hour = Number(process.env.HOUR ?? 21.5);
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=${seed}&start=road&build=stock:pickup&s=300&time=${hour}&weather=${process.env.WEATHER ?? 'clear'}`, { width: 1920, height: 1080 });
  await idle(page);
  const info = await page.evaluate((k) => {
    const j = window.__rt.game.world.earth;
    while (j.pieces.length <= k + 1) j.chapter(j.chapters.length);
    return { start: j.pieces[k].start, end: j.pieces[k].end };
  }, place);
  await page.evaluate((km) => window.__rt.devGoKm(km, true), (info.start + info.end) / 2000);
  await built(page);
  await idle(page);
  // heading: the direction looked in (rad, 0 = +x east, toward +z = south positive)
  const dirs = { east: 0, south: Math.PI / 2, west: Math.PI, north: -Math.PI / 2, ene: -0.3 };
  for (const [dir, heading] of Object.entries(dirs)) {
    await page.evaluate(({ heading, hour, moon, pitch }) => {
      const rt = window.__rt;
      const g = rt.game;
      if (moon !== null) g.env.clock.moonOverride = moon;
      const p = g.focus.sim;
      rt.stand(p.px + 6, p.pz + 6, heading, pitch);
      rt.setHour(hour);
      g.simulate(0.3);
      for (let i = 0; i < 4; i++) rt.render();
    }, { heading, hour, moon: process.env.MOON !== undefined ? Number(process.env.MOON) : null, pitch: Number(process.env.PITCH ?? 0.3) });
    await built(page);
    await page.waitForTimeout(900);
    await page.evaluate(() => { window.__rt.render(); window.__rt.render(); });
    await page.screenshot({ path: path.join(out, `${dir}.png`) });
  }
  console.log('done', out);
} finally {
  await browser.close();
  await server.close();
}
