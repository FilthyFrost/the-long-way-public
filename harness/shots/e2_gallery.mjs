// Milestone E2 (docs/V3/nodes/E2-earth-land.md): a gallery of the emergent Earth's places in the game — each given
// as seed:place (the director's index), a moment after the road comes into it, the driver's view with its name on
// the screen (and with VIEW=side, out of the side window).
//   SHOTS_GPU=1 node harness/shots/e2_gallery.mjs <name> seed:place[:label] ...
import fs from 'node:fs';
import path from 'node:path';
import { built, idle } from './landscapeCapture.mjs';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const [name = 'gallery', ...spots] = process.argv.slice(2);
const side = process.env.VIEW === 'side';
const out = path.join(ROOT, `loop/shots/e2_gallery/${name}`);
fs.mkdirSync(out, { recursive: true });
const list = spots.map((x) => {
  const [seed, place, ...label] = x.split(':');
  return { seed: Number(seed), place: Number(place), label: label.join(':') };
});
const bySeed = new Map();
for (const s of list) bySeed.set(s.seed, [...(bySeed.get(s.seed) ?? []), s]);
const { server, url } = await startServer();
const browser = await launchBrowser();
const report = [];
try {
  for (const [seed, places] of bySeed) {
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=4&seed=${seed}&start=road&build=stock:pickup&s=300&time=15.5&weather=${process.env.WEATHER ?? "clear"}`, { width: 1920, height: 1080 });
    await idle(page);
    for (const p of places) {
      const info = await page.evaluate((k) => {
        const j = window.__rt.game.world.earth;
        while (j.pieces.length <= k + 1) j.chapter(j.chapters.length);
        const piece = j.pieces[k];
        const sc = piece.scene.place;
        return { start: piece.start, end: piece.end, border: piece.border, name: sc.name, tag: sc.tag, efg: sc.look.efg.code, landform: sc.look.landform.id, rock: sc.macro.rock, base: Math.round(sc.macro.base), relief: Math.round(sc.macro.relief) };
      }, p.place);
      const km = (info.start + Math.max(500, info.border / 2 + 400)) / 1000;
      await page.evaluate((km) => window.__rt.devGoKm(km, true), km);
      await built(page);
      await idle(page);
      await page.evaluate((side) => {
        const rt = window.__rt;
        const g = rt.game;
        if (!g.seated) g.enter(g.focus, 'driver');
        rt.setView('cockpit');
        rt.look(side ? 1.25 : 0, 0.03);
        g.simulate(0.4);
        for (let i = 0; i < 4; i++) rt.render();
      }, side);
      await page.waitForTimeout(1700);
      await page.evaluate(() => window.__rt.render());
      const file = path.join(out, `${seed}_${String(p.place).padStart(2, '0')}${side ? '_side' : ''}.png`);
      await page.screenshot({ path: file });
      report.push({ ...p, ...info, km, file });
      console.log(`${p.label || ''} ${seed}:${p.place} ${info.name} · ${info.tag} (${info.efg}, ${info.landform}, ${info.rock}, ${info.base} m, relief ${info.relief}) at ${km.toFixed(2)} km → ${file}`);
    }
    if (errors.length) console.log('errors', errors.slice(0, 3).join(' | '));
    await page.close();
  }
  fs.writeFileSync(path.join(out, 'gallery.json'), JSON.stringify(report, null, 1));
} finally {
  await browser.close();
  await server.close();
}
