// The journey in the world (docs/V3/nodes/P3-1-journey-world.md): a new game's world of version 3, driven into its
// first scenes one after another — at each, a moment after crossing into it, the driver's view with the HUD as the
// player sees it (the scene's name on the screen), and the journey's pieces as laid on the road.
//   SHOTS_GPU=1 node harness/shots/p31_journey.mjs [seed] [scenes]
import fs from 'node:fs';
import path from 'node:path';
import { built, idle } from './landscapeCapture.mjs';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const seed = Number(process.argv[2] ?? 7);
const count = Number(process.argv[3] ?? 8);
const out = path.join(ROOT, 'loop/shots/p31_journey');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=3&seed=${seed}&start=road&build=stock:pickup&s=300&time=15.5&weather=clear`, { width: 1920, height: 1080 });
  await idle(page);
  const pieces = await page.evaluate((count) => {
    const g = window.__rt.game;
    const j = g.world.journey;
    if (!j) throw new Error('no journey: the world is not of version 3');
    while (j.pieces.filter((p) => p.kind === 'scene').length < count + 1) j.chapter(j.chapters.length);
    // (the session's first moment, before any name)
    g.simulate(3);
    return j.pieces.map((p) => ({ kind: p.kind, start: p.start, end: p.end, border: p.border, threshold: p.threshold, region: g.world.spine.plan.rules && p.region, scene: p.scene ? { no: p.scene.no, name: p.scene.name, tag: p.scene.tag } : null, buffer: p.buffer?.name ?? null }));
  }, count);
  const regions = await page.evaluate(() => window.__rt.game.world.spine.plan.rules && (window.__rt.devRegions?.() ?? null));
  const scenes = pieces.filter((p) => p.kind === 'scene').slice(0, count);
  const report = [];
  for (const [k, p] of scenes.entries()) {
    // (into the scene, past the blend at its start, a little way)
    const km = (p.start + Math.max(250, p.border / 2 + 150)) / 1000;
    await page.evaluate((km) => window.__rt.devGoKm(km, true), km);
    await built(page);
    await idle(page);
    await page.evaluate(() => {
      const rt = window.__rt;
      const g = rt.game;
      if (!g.seated) g.enter(g.focus, 'driver');
      rt.setView('cockpit');
      rt.look(0, 0.03);
      g.simulate(0.4);
      for (let i = 0; i < 4; i++) rt.render();
    });
    // (the name fades in over a second and a half of the page's own clock)
    await page.waitForTimeout(1700);
    await page.evaluate(() => window.__rt.render());
    const file = path.join(out, `${String(k + 1).padStart(2, '0')}_${p.scene.no}.png`);
    await page.screenshot({ path: file });
    report.push({ k, km: +km.toFixed(2), scene: p.scene, file });
    console.log(`${k + 1}. ${p.scene.no} ${p.scene.name} · ${p.scene.tag} at ${km.toFixed(2)} km → ${file}`);
  }
  fs.writeFileSync(path.join(out, 'pieces.json'), JSON.stringify({ seed, pieces, regions }, null, 1));
  if (errors.length) console.log('errors', errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  await server.close();
}
