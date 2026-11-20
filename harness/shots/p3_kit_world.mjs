// The plant toolkit's trees in the world (docs/V3/nodes/P3-kit-world.md): the same spots from the driver's seat with
// the world's own trees and with ?flora=kit, and what the crowns cost in each.
//   SHOTS_GPU=1 node harness/shots/p3_kit_world.mjs
import fs from 'node:fs';
import path from 'node:path';
import { built, idle } from './landscapeCapture.mjs';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const SPOTS = [
  { name: 'forest', km: 388.125 },
  { name: 'plains', km: 3.125 },
  { name: 'alpine', km: 394.375 },
  { name: 'lakes', km: 326.875 },
  { name: 'maple', km: 120.625 },
];
const only = process.argv.slice(2);
const out = path.join(ROOT, 'loop/shots/p3_kit_world');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
const report = {};
try {
  for (const mode of ['world', 'kit']) {
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=2&seed=7&start=road&build=stock:pickup&s=300&time=15.5&weather=clear${mode === 'kit' ? '&flora=kit' : ''}`, { width: 1920, height: 1080 });
    await idle(page);
    for (const spot of SPOTS.filter((s) => !only.length || only.includes(s.name))) {
      await page.evaluate((km) => window.__rt.devGoKm(km, true), spot.km);
      await built(page);
      await idle(page);
      const shots = await page.evaluate(async () => {
        const rt = window.__rt;
        const g = rt.game;
        if (!g.seated) g.enter(g.focus, 'driver');
        g.ui.root.style.visibility = 'hidden';
        rt.setView('cockpit');
        rt.simulate(0.5);
        const res = [];
        for (const [name, yaw] of [['ahead', 0], ['right', 0.75], ['left', -0.75]]) {
          rt.look(yaw, 0.04);
          for (let i = 0; i < 4; i++) rt.render();
          const crowns = g.worldView?.crowns ?? g.worldView?.crownView ?? null;
          res.push({ name, png: g.core.renderer.domElement.toDataURL('image/png'), drawn: crowns?.drawn ? JSON.parse(JSON.stringify(crowns.drawn)) : null });
        }
        return res;
      });
      report[`${mode}:${spot.name}`] = shots.map((s) => ({ view: s.name, drawn: s.drawn }));
      for (const s of shots) fs.writeFileSync(path.join(out, `${spot.name}_${s.name}_${mode}.png`), Buffer.from(s.png.slice(s.png.indexOf(',') + 1), 'base64'));
    }
    if (errors.length) console.log(mode, 'errors', errors.slice(0, 3).join(' | '));
    await page.close();
  }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  for (const [k, v] of Object.entries(report)) console.log(k, v.map((s) => `${s.view}: ${s.drawn ? `${Math.round(s.drawn.triangles / 1000)}k tris, levels ${s.drawn.levels.join('/')}` : '?'}`).join('  '));
  console.log('shots in', out);
} finally {
  await browser.close();
  await server.close();
}
