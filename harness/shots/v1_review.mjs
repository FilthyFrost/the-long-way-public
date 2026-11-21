// The visual loop's review route (docs/V3/plan/visual-loop.md): the same places of world version 5, the driver's view
// at the same hours every round, for the before and after of each round.
//   SHOTS_GPU=1 HOURS=7,15.5,19,23 node harness/shots/v1_review.mjs <round> seed:place ...   (no places: the route)
// Out: loop/shots/v1/<round>/<seed>_<place>_h<hour>.png and shots.json. DRONE=1: a drone's view too, at the first hour.
import fs from 'node:fs';
import path from 'node:path';
import { built, idle } from './landscapeCapture.mjs';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

/** the route: forest, snow, peaks, lava, canyon, coast, stacks, savanna, tropics, river, flowers, terraces, karst, geothermal, mesas, tundra, waterfall */
export const ROUTE = ['1:2', '1:3', '1:7', '1:9', '1:13', '1:20', '1:24', '1:28', '1:31', '7:1', '7:3', '7:6', '7:13', '7:23', '7:27', '7:34', '3:16', '3:20', '3:30', '3:37', '3:38'];
const [round = 'r0', ...given] = process.argv.slice(2);
const spots = (given.length ? given : ROUTE).map((x) => {
  const [seed, place] = x.split(':');
  return { seed: Number(seed), place: Number(place) };
});
const HOURS = (process.env.HOURS ?? '7,15.5,19,23').split(',').map(Number);
const out = path.join(ROOT, `loop/shots/v1/${round}`);
fs.mkdirSync(out, { recursive: true });
const bySeed = new Map();
for (const s of spots) bySeed.set(s.seed, [...(bySeed.get(s.seed) ?? []), s]);
const { server, url } = await startServer();
const browser = await launchBrowser();
const report = [];
try {
  for (const [seed, places] of bySeed) {
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=${process.env.WORLD ?? 5}&seed=${seed}&start=road&build=stock:pickup&s=300&time=${HOURS[0]}&weather=${process.env.WEATHER ?? 'clear'}`, { width: 1920, height: 1080 });
    await idle(page);
    for (const p of places) {
      const info = await page.evaluate((k) => {
        const j = window.__rt.game.world.earth;
        while (j.pieces.length <= k + 1) j.chapter(j.chapters.length);
        const piece = j.pieces[k];
        const sc = piece.scene.place;
        return { start: piece.start, end: piece.end, name: sc.name, tag: piece.scene.tag, road: piece.scene.road?.id ?? '', efg: sc.look.efg.code, landform: sc.look.landform.id, base: Math.round(sc.macro.base), month: sc.macro.month };
      }, p.place);
      const s = (info.start + info.end) / 2 + Number(process.env.ALONG ?? 0);
      await page.evaluate((km) => window.__rt.devGoKm(km, true), s / 1000);
      await built(page);
      await idle(page);
      const low = await page.evaluate(async (s) => {
        const lf = await import('/src/core/world/landform.ts');
        const lp = window.__rt.game.world.land.at(s, new lf.LandParams());
        return lp.shelf > 30 ? -lp.shelfSide : lp.rim > 30 ? lp.rimSide : 0;
      }, s);
      const views = process.env.DRONE === '1' ? ['cockpit', 'drone'] : ['cockpit'];
      for (const [hi, hour] of HOURS.entries()) {
        for (const view of views) {
          if (view === 'drone' && hi > 0) continue;
          await page.evaluate(
            ({ view, low, hour, moon }) => {
              const rt = window.__rt;
              const g = rt.game;
              if (!g.seated) g.enter(g.focus, 'driver');
              if (moon !== null) g.env.clock.moonOverride = moon;
              rt.setHour(hour);
              if (view === 'cockpit') {
                rt.setView('cockpit');
                rt.look(0.8 * low, low ? -0.07 : 0.02);
              } else rt.setOrbit(180 + 38 * low, 26, 125, 2.5);
              g.simulate(0.4);
              for (let i = 0; i < 4; i++) rt.render();
            },
            { view, low, hour, moon: process.env.MOON !== undefined ? Number(process.env.MOON) : null },
          );
          await built(page);
          await page.waitForTimeout(1200);
          await page.evaluate(() => { window.__rt.render(); window.__rt.render(); });
          const file = path.join(out, `${seed}_${String(p.place).padStart(2, '0')}_h${hour}${view === 'drone' ? '_drone' : ''}.png`);
          await page.screenshot({ path: file });
          report.push({ ...p, ...info, hour, view, file: path.basename(file) });
        }
      }
      console.log(`${seed}:${p.place} ${info.name} · ${info.tag} (${info.road}, ${info.efg}, ${info.landform}, ${info.base} m, month ${info.month})`);
    }
    if (errors.length) console.log('errors', errors.slice(0, 3).join(' | '));
    await page.close();
  }
  fs.writeFileSync(path.join(out, 'shots.json'), JSON.stringify(report, null, 1));
} finally {
  await browser.close();
  await server.close();
}
