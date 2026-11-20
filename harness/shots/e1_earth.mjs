// Milestone E1 (docs/V3/nodes/E1-earth-world.md): the emergent Earth in the world — a new game's world of version 4
// driven into its first places one after another: at each, a moment after crossing into it, the driver's view with
// the HUD as the player sees it (the place's name on the screen), and what the director made of it.
//   SHOTS_GPU=1 node harness/shots/e1_earth.mjs [seed] [places] [first]
//   VIEW=side: a view out of the side window instead of ahead (the land beside the road)
import fs from 'node:fs';
import path from 'node:path';
import { built, idle } from './landscapeCapture.mjs';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const seed = Number(process.argv[2] ?? 7);
const count = Number(process.argv[3] ?? 8);
const first = Number(process.argv[4] ?? 1);
const side = process.env.VIEW === 'side';
const out = path.join(ROOT, `loop/shots/e1_earth/${seed}`);
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=4&seed=${seed}&start=road&build=stock:pickup&s=300&time=15.5&weather=clear`, { width: 1920, height: 1080 });
  await idle(page);
  const pieces = await page.evaluate(({ count, first }) => {
    const g = window.__rt.game;
    const j = g.world.earth;
    if (!j) throw new Error('no earth: the world is not of version 4');
    while (j.pieces.length < first + count + 1) j.chapter(j.chapters.length);
    g.simulate(3);
    return j.pieces.map((p) => {
      const sc = p.scene?.place;
      return { kind: p.kind, index: p.index, start: p.start, end: p.end, border: p.border, region: p.region, name: p.scene?.name ?? null, tag: p.scene?.tag ?? null, moment: sc?.moment ?? null, efg: sc?.look.efg.code ?? null, landform: sc?.look.landform.id ?? null, base: sc ? Math.round(sc.macro.base) : null, relief: sc ? Math.round(sc.macro.relief) : null, water: sc?.macro.water ?? null, month: sc?.macro.month ?? null };
    });
  }, { count, first });
  const places = pieces.filter((p) => p.kind === 'scene').slice(first - 1, first - 1 + count);
  const report = [];
  for (const p of places) {
    // (into the place, past the blend at its start, a little way)
    const km = (p.start + Math.max(400, p.border / 2 + 300)) / 1000;
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
    // (the name fades in over a second and a half of the page's own clock)
    await page.waitForTimeout(1700);
    await page.evaluate(() => window.__rt.render());
    const file = path.join(out, `${String(p.index).padStart(2, '0')}${side ? '_side' : ''}.png`);
    await page.screenshot({ path: file });
    report.push({ ...p, km: +km.toFixed(2), file });
    console.log(`${p.index}. ${p.name} · ${p.tag} at ${km.toFixed(2)} km (${p.efg}, ${p.landform}, ${p.base} m, relief ${p.relief} m, ${p.water}, month ${p.month}) → ${file}`);
  }
  fs.writeFileSync(path.join(out, 'places.json'), JSON.stringify({ seed, pieces, report }, null, 1));
  if (errors.length) console.log('errors', errors.slice(0, 5).join(' | '));
} finally {
  await browser.close();
  await server.close();
}
