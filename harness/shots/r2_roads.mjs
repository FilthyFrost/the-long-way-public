// Milestone R2 (docs/V3/nodes/R2-roads.md): the scenic roads of world version 5 in the game — each given as seed:place,
// in the middle of the place: the driver's view (turned a little toward the void where the road has one: a shelf's
// low side, a rim's canyon, a cliff road's sea) and a drone's from behind and above.
//   SHOTS_GPU=1 node harness/shots/r2_roads.mjs <name> seed:place[:label] ...
import fs from 'node:fs';
import path from 'node:path';
import { built, idle } from './landscapeCapture.mjs';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const [name = 'roads', ...spots] = process.argv.slice(2);
// (DRONE=pitch,distance: how high and far the drone stands, default 26° and 125 m)
const DRONE = (process.env.DRONE ?? '26,125').split(',');
const out = path.join(ROOT, `loop/shots/r2_roads/${name}`);
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
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=${process.env.WORLD ?? 5}&seed=${seed}&start=road&build=stock:pickup&s=300&time=${process.env.HOUR ?? 15.5}&weather=${process.env.WEATHER ?? 'clear'}`, { width: 1920, height: 1080 });
    await idle(page);
    for (const p of places) {
      const info = await page.evaluate((k) => {
        const j = window.__rt.game.world.earth;
        while (j.pieces.length <= k + 1) j.chapter(j.chapters.length);
        const piece = j.pieces[k];
        const sc = piece.scene.place;
        return { start: piece.start, end: piece.end, name: sc.name, tag: piece.scene.tag, road: piece.scene.road?.id ?? '', efg: sc.look.efg.code, landform: sc.look.landform.id, base: Math.round(sc.macro.base), relief: Math.round(sc.macro.relief) };
      }, p.place);
      // (LOOKOUT=1: at the place's lookout, if it has one, looking out from beside it)
      const look = process.env.LOOKOUT === '1' ? await page.evaluate(({ a, b }) => window.__rt.placeSites(a, b, 'lookout')[0] ?? null, { a: info.start, b: info.end }) : null;
      const s = look ? look.s - 18 : (info.start + info.end) / 2 + Number(process.env.ALONG ?? 0);
      await page.evaluate((km) => window.__rt.devGoKm(km, true), s / 1000);
      await built(page);
      await idle(page);
      // the void's side where the road has one (+1 the right, −1 the left; 0 none)
      const low = await page.evaluate(async (s) => {
        const lf = await import('/src/core/world/landform.ts');
        const lp = window.__rt.game.world.land.at(s, new lf.LandParams());
        return lp.shelf > 30 ? -lp.shelfSide : lp.rim > 30 ? lp.rimSide : 0;
      }, s);
      // (the side the lookout stands on: where its view is)
      const lowSide = look ? await page.evaluate((l) => { const q = {}; window.__rt.game.world.spine.at(l.s, q); return Math.sign(-(l.x - q.x) * Math.sin(q.phi) + (l.z - q.z) * Math.cos(q.phi)) || 1; }, look) : low;
      for (const view of ['cockpit', 'drone']) {
        await page.evaluate(
          ({ view, low, drone }) => {
            const rt = window.__rt;
            const g = rt.game;
            if (!g.seated) g.enter(g.focus, 'driver');
            if (view === 'cockpit') {
              rt.setView('cockpit');
              rt.look(0.8 * low, low ? -0.07 : 0.02);
            } else rt.setOrbit(180 + 38 * low, drone[0], drone[1], 2.5);
            g.simulate(0.4);
            for (let i = 0; i < 4; i++) rt.render();
          },
          { view, low: lowSide, drone: DRONE.map(Number) },
        );
        // (the land about the camera where it now is: the drone stands a hundred metres off)
        await built(page);
        await page.waitForTimeout(1600);
        await page.evaluate(() => window.__rt.render());
        const file = path.join(out, `${seed}_${String(p.place).padStart(2, '0')}_${view}.png`);
        await page.screenshot({ path: file });
        report.push({ ...p, ...info, low: lowSide, view, file });
      }
      console.log(`${p.label || ''} ${seed}:${p.place} ${info.name} · ${info.tag} (${info.road}, ${info.efg}, ${info.landform}, ${info.base} m, relief ${info.relief}) low ${low}`);
    }
    if (errors.length) console.log('errors', errors.slice(0, 3).join(' | '));
    await page.close();
  }
  fs.writeFileSync(path.join(out, 'roads.json'), JSON.stringify(report, null, 1));
} finally {
  await browser.close();
  await server.close();
}
