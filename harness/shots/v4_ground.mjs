// What grows on a place's ground (V4): the ground field's clumps within 150 m of the road's middle of a place, by
// form and name, and the crowns' trees and shrubs drawn there (core/world/groundField.ts, flora.ts).
//   SHOTS_GPU=1 node harness/shots/v4_ground.mjs seed:place ...
import { built, idle } from './landscapeCapture.mjs';
import { launchBrowser, openGame, startServer } from './lib.mjs';

const spots = process.argv.slice(2).map((x) => x.split(':').map(Number));
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  for (const [seed, place] of spots) {
    const { page } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=${seed}&start=road&build=stock:pickup&s=300&time=15.5&weather=clear`, { width: 1280, height: 720 });
    await idle(page);
    const info = await page.evaluate((k) => {
      const j = window.__rt.game.world.earth;
      while (j.pieces.length <= k + 1) j.chapter(j.chapters.length);
      const p = j.pieces[k];
      return { start: p.start, end: p.end, name: p.scene.place.name, code: p.scene.place.look.efg.code };
    }, place);
    await page.evaluate((km) => window.__rt.devGoKm(km, true), (info.start + info.end) / 2000);
    await built(page);
    const res = await page.evaluate(async () => {
      const gf = await import('/src/core/world/groundField.ts');
      const fl = await import('/src/core/world/flora.ts');
      const pl = await import('/src/core/world/plants.ts');
      const g = window.__rt.game;
      const field = gf.groundField(g.world);
      const s = g.focus.sim;
      const cx = s.px, cz = s.pz;
      const R = 150;
      const ground = {};
      for (let tz = Math.floor((cz - R) / 128); tz <= Math.floor((cz + R) / 128); tz++)
        for (let tx = Math.floor((cx - R) / 128); tx <= Math.floor((cx + R) / 128); tx++)
          for (const c of field.tile(tx, tz, false)) {
            if (Math.hypot(c.x - cx, c.z - cz) > R) continue;
            const k = c.form + ' ' + c.name;
            ground[k] = (ground[k] ?? 0) + 1;
          }
      const flora = {};
      for (const layer of [fl.LAYER_TREE, fl.LAYER_SHRUB]) {
        for (let tz = Math.floor((cz - R) / 128); tz <= Math.floor((cz + R) / 128); tz++)
          for (let tx = Math.floor((cx - R) / 128); tx <= Math.floor((cx + R) / 128); tx++) {
            const t = g.world.flora.tile(layer, tx, tz);
            for (let i = 0; i < t.n; i++) {
              if (Math.hypot(t.x[i] - cx, t.z[i] - cz) > R) continue;
              const k = layer + ':' + pl.PLANTS[t.plant[i]].id;
              flora[k] = (flora[k] ?? 0) + 1;
            }
          }
      }
      return { ground, flora, ha: (Math.PI * R * R) / 10000 };
    });
    const per = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / res.ha).toFixed(1)}`).join(', ');
    console.log(`${seed}:${place} ${info.name} ${info.code}\n  ground /ha: ${per(res.ground)}\n  flora /ha: ${per(res.flora)}`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
