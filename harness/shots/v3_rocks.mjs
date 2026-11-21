// The rock probe (V3, docs/V3/nodes/V3-rocks.md): at a place, the stones lying on its ground found (core/world/
// groundField.ts) and each form's biggest near the road looked at from beside it — a few metres off and twelve —
// with the sun behind the shoulder, at the hour asked.
//   SHOTS_GPU=1 HOUR=15.5 node harness/shots/v3_rocks.mjs <name> seed:place ...
// Out: loop/shots/v3/rocks/<name>/<seed>_<place>_<form>_<view>.png, and what lies where (counts of each form).
import fs from 'node:fs';
import path from 'node:path';
import { built, idle } from './landscapeCapture.mjs';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const [name = 'rk', ...given] = process.argv.slice(2);
const spots = (given.length ? given : ['1:9', '1:13']).map((x) => {
  const [seed, place] = x.split(':');
  return { seed: Number(seed), place: Number(place) };
});
const hour = Number(process.env.HOUR ?? 15.5);
const FORMS = process.env.FORMS ? process.env.FORMS.split(',') : null;
const out = path.join(ROOT, `loop/shots/v3/rocks/${name}`);
fs.mkdirSync(out, { recursive: true });
const bySeed = new Map();
for (const s of spots) bySeed.set(s.seed, [...(bySeed.get(s.seed) ?? []), s]);
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  for (const [seed, places] of bySeed) {
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=${seed}&start=road&build=stock:pickup&s=300&time=${hour}&weather=clear`, { width: 1600, height: 900 });
    await idle(page);
    for (const p of places) {
      const info = await page.evaluate((k) => {
        const j = window.__rt.game.world.earth;
        while (j.pieces.length <= k + 1) j.chapter(j.chapters.length);
        const piece = j.pieces[k];
        const sc = piece.scene.place;
        return { start: piece.start, end: piece.end, name: sc.name, landform: sc.look.landform.id, efg: sc.look.efg.code };
      }, p.place);
      await page.evaluate((km) => window.__rt.devGoKm(km, true), (info.start + info.end) / 2000);
      await built(page);
      await idle(page);
      // what lies about: every stone within 300 m, each form's biggest within 120 m of here
      const found = await page.evaluate(async (forms) => {
        const gf = await import('/src/core/world/groundField.ts');
        const g = window.__rt.game;
        const field = gf.groundField(g.world);
        const s = g.focus.sim;
        const cx = s.px, cz = s.pz;
        const counts = {};
        const best = {};
        for (let tz = Math.floor((cz - 300) / 128); tz <= Math.floor((cz + 300) / 128); tz++)
          for (let tx = Math.floor((cx - 300) / 128); tx <= Math.floor((cx + 300) / 128); tx++)
            for (const r of field.tile(tx, tz, true)) {
              const d = Math.hypot(r.x - cx, r.z - cz);
              if (d > 300) continue;
              counts[r.form] = (counts[r.form] ?? 0) + 1;
              if (d > 120 || (forms && !forms.includes(r.form))) continue;
              const b = best[r.form];
              if (!b || r.height > b.height) best[r.form] = { form: r.form, x: r.x, y: r.y, z: r.z, radius: r.radius, height: r.height, seed: r.seed, paint: r.paint, d };
            }
        return { counts, picks: Object.values(best), car: { x: cx, z: cz } };
      }, FORMS);
      console.log(`${seed}:${p.place} ${info.name} (${info.landform}, ${info.efg})`, JSON.stringify(found.counts));
      for (const r of found.picks) {
        for (const [view, k] of [['near', 1.7], ['far', 5]]) {
          await page.evaluate(async ({ r, k, hour, hide }) => {
            const rt = window.__rt;
            const g = rt.game;
            rt.setHour(hour);
            g.simulate(0.1);
            // (the sun behind the shoulder: the camera on the rock's sunward side, a little round)
            const sun = (await import('/src/game/render/shaderlib.ts')).globals.uSunDir.value;
            const az = Math.atan2(sun.z, sun.x) + 0.55;
            const d = r.radius * k + 2.5;
            const x = r.x + Math.cos(az) * d;
            const z = r.z + Math.sin(az) * d;
            rt.stand(x, z, Math.atan2(r.z - z, r.x - x), Math.atan2(r.height * 0.4 - 1.6, d));
            // (HIDE=1: the trees out of the way)
            if (hide) g.core.scene.traverse((o) => { if (/flora-trees|flora-shadow|trees-v1/.test(o.name) || o.name === 'crowns') o.visible = false; });
            rt.setHour(hour);
            g.simulate(0.3);
            for (let i = 0; i < 4; i++) rt.render();
          }, { r, k, hour, hide: process.env.HIDE === '1' });
          await built(page);
          await page.waitForTimeout(700);
          await page.evaluate(() => { window.__rt.render(); window.__rt.render(); });
          await page.screenshot({ path: path.join(out, `${seed}_${String(p.place).padStart(2, '0')}_${r.form}_${view}.png`) });
        }
        console.log(`  ${r.form}: ${r.radius.toFixed(1)} × ${r.height.toFixed(1)} m, ${Math.round(r.d)} m off, paint #${r.paint.toString(16)}`);
      }
    }
    if (errors.length) console.log('errors', errors.slice(0, 3).join(' | '));
    await page.close();
  }
  console.log('shots in', out);
} finally {
  await browser.close();
  await server.close();
}
