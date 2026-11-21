// Which of the world's meshes is it? The driver's view at a place's viaduct, then again with one kind of the world's
// pieces hidden at a time (world:bridge, world:water, world:terrain, world:road …).
//   SHOTS_GPU=1 node harness/shots/r7_which.mjs seed place along
import fs from 'node:fs';
import path from 'node:path';
import { built, idle } from './landscapeCapture.mjs';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const [seed = '1', place = '15', along = '-60'] = process.argv.slice(2);
const out = path.join(ROOT, 'loop/shots/r7_which');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=${seed}&start=road&build=stock:pickup&s=300&time=15.5&weather=clear`, { width: 1600, height: 900 });
  await idle(page);
  const s = await page.evaluate((k) => {
    const w = window.__rt.game.world;
    const j = w.earth;
    while (j.pieces.length <= k + 1) j.chapter(j.chapters.length);
    const p = j.pieces[k];
    const f = w.water.between(p.start, p.end, []).find((f) => f.kind === 'river' && f.wall !== undefined);
    return f ? f.span0 : (p.start + p.end) / 2;
  }, Number(place));
  await page.evaluate((km) => window.__rt.devGoKm(km, true), (s + Number(along)) / 1000);
  await built(page);
  await idle(page);
  const kinds = await page.evaluate(() => {
    const rt = window.__rt;
    const g = rt.game;
    if (!g.seated) g.enter(g.focus, 'driver');
    rt.setView('cockpit');
    rt.look(0, 0.02);
    g.simulate(0.4);
    const names = new Set();
    g.worldView.group.traverse((o) => o.name && names.add(o.name));
    return [...names];
  });
  console.log('kinds', kinds.join(' '));
  for (const hide of ['', ...kinds]) {
    await page.evaluate((hide) => {
      const g = window.__rt.game;
      g.worldView.group.traverse((o) => {
        if (o.name) o.visible = o.name !== hide;
      });
      for (let i = 0; i < 4; i++) window.__rt.render();
    }, hide);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(out, `${seed}_${place}_${hide.replace(/[:/]/g, '_') || 'all'}.png`) });
  }
} finally {
  await browser.close();
  await server.close();
}
