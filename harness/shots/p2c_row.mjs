// A row of a dozen trees of one species by the road, its variants in turn (every eighth the same model as before):
// seen from the driver's seat with every tree its species' variant (as before) and with each grown as itself
// (docs/V3/nodes/P2-C-unique-trees.md).
//   SHOTS_GPU=1 node harness/shots/p2c_row.mjs [species] [km]
import fs from 'node:fs';
import path from 'node:path';
import { built, idle } from './landscapeCapture.mjs';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const family = process.argv[2] ?? 'oak';
const km = Number(process.argv[3] ?? 3.125);
const out = path.join(ROOT, 'loop/shots/p2c_unique_trees');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=2&seed=7&start=road&build=stock:pickup&s=300&time=15.5&weather=clear`, { width: 1920, height: 1080 });
  await idle(page);
  await page.evaluate((km) => window.__rt.devGoKm(km, true), km);
  await built(page);
  await idle(page);
  const shots = await page.evaluate(async (family) => {
    const rt = window.__rt;
    const g = rt.game;
    if (!g.seated) g.enter(g.focus, 'driver');
    g.ui.root.style.visibility = 'hidden';
    rt.setView('cockpit');
    rt.simulate(0.5);
    const crowns = g.worldView.crowns;
    const sp = crowns.species.findIndex((s) => s.family === family);
    if (sp < 0) throw new Error(`no species ${family}`);
    // (a look of the region's: copied from a tree there)
    let look = [0, 0, -1, 0, 0.5];
    for (const t of crowns.tiles.values()) {
      if (t.ground !== undefined || t.n === 0) continue;
      look = Array.from(t.data.slice(8, 13));
      break;
    }
    // the row: along the car's right, 9 m out, a tree every 7 m from 6 m ahead
    const cam = g.core.camera;
    const o = g.core.origin;
    const fwd = new cam.position.constructor();
    cam.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    const right = { x: -fwd.z, z: fwd.x };
    const n = 12;
    const d = new Float32Array(n * 16);
    const sp0 = crowns.species[sp];
    for (let i = 0; i < n; i++) {
      const along = 6 + i * 7;
      const x = cam.position.x + o.x + fwd.x * along + right.x * 11;
      const z = cam.position.z + o.z + fwd.z * along + right.z * 11;
      const y = g.world.heightAt(x, z);
      const s = 1;
      d.set([x, y, z, i * 2.39996, s, s, sp, i % 8, look[0], look[1], look[2], look[3], (i * 0.618) % 1, 0, sp0.radius * s, sp0.height * s], i * 16);
    }
    crowns.setTile('demo-row', d, n);
    const View = crowns.constructor;
    const res = [];
    for (const own of [false, true]) {
      View.uniqueTrees = own;
      for (const t of crowns.tiles.values()) t.state = null;
      crowns.changed = true;
      rt.look(0.62, 0.05);
      for (let i = 0; i < 6; i++) rt.render();
      res.push({ own, png: g.core.renderer.domElement.toDataURL('image/png'), drawn: JSON.parse(JSON.stringify(crowns.drawn)) });
    }
    return res;
  }, family);
  for (const s of shots) {
    const file = path.join(out, `row_${family}_${s.own ? 'after' : 'before'}.png`);
    fs.writeFileSync(file, Buffer.from(s.png.slice(s.png.indexOf(',') + 1), 'base64'));
    console.log(file, `own ${s.drawn.unique}`);
  }
  if (errors.length) console.log('errors', errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  await server.close();
}
