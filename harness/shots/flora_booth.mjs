// The plant booth (docs/V3/art/plants-standard.md): one plant of the toolkit at a time, on open ground in the game's
// own light and paint finish, the world's trees hidden, seen from the views Painted Valley's plants are pictured
// from (D:/modcar-scratch/pv/pv_shots.mjs) — 8 m and 16 m at eye height, its trunk from 10 m, the whole of it from
// 30 m — at 15:30 and at 18:36; and a sheet of each beside Painted Valley's.
//   SHOTS_GPU=1 node harness/shots/flora_booth.mjs [kind …]
// Pictures in loop/shots/flora_booth/, sheets <kind>_vs_pv.png (Painted Valley's pictures where they are: outside
// the repository, never in it).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const kinds = process.argv.slice(2).length ? process.argv.slice(2) : ['oak', 'spruce', 'birch'];
const out = path.join(ROOT, 'loop/shots/flora_booth');
fs.mkdirSync(out, { recursive: true });
const VIEWS = [
  { name: '8m', d: 8, az: 1.1, eye: 1.7, aim: 0.45 },
  { name: '16m', d: 16, az: 3.3, eye: 1.7, aim: 0.45 },
  { name: 'trunk10m', d: 10, az: 0.6, eye: 1.7, aim: 0.3 },
  { name: 'whole30m', d: 30, az: 4.2, eye: 1.7, aim: 0.5 },
];
const HOURS = [15.5, 18.6];
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?new=1&shot=1&world=2&seed=7&start=road&build=stock:pickup&s=1200&time=15.5&weather=clear&biome=plains`, { width: 1600, height: 900 });
  const result = await page.evaluate(async ({ kinds, VIEWS, HOURS }) => {
    const rt = window.__rt;
    const g = rt.game;
    g.ui.root.style.visibility = 'hidden';
    const stage = await import('/src/game/scene/flora/stage.ts');
    const v = g.seated ?? g.vehicles[0];
    const b = new Array(9).fill(0);
    v.sim.basis(b);
    const fx = b[0], fz = b[2], rx = b[6], rz = b[8];
    const px = v.sim.px, pz = v.sim.pz;
    // (the plant: on open ground left of the road, 60 m on)
    const tx = px + fx * 60 - rx * 24;
    const tz = pz + fz * 60 - rz * 24;
    const hideTrees = () => g.core.scene.traverse((o) => {
      if (/flora-trees|flora-shadow|trees-v1|meadow-flora|ground-kit/.test(o.name) || o.name === 'crowns') o.visible = false;
    });
    const settle = async () => {
      for (let i = 0; i < 300 && (g.worldView?.pending ?? 0) > 0; i++) {
        g.worldView.update(g.player.walker.x, g.player.walker.z, 40);
        await new Promise((r) => setTimeout(r, 0));
      }
      hideTrees();
      for (let i = 0; i < 3; i++) rt.render();
    };
    const shots = [];
    for (const id of kinds) {
      const placed = stage.placeFlora(g, [{ id, x: tx, z: tz, seed: 23, turn: 0.4, level: 0 }]);
      const h = placed.placed[0].height;
      for (const hour of HOURS) {
        rt.devHour?.(hour);
        for (const view of VIEWS) {
          const d = view.d * Math.max(0.6, h / 14);
          const ax = tx + Math.cos(view.az) * d;
          const az = tz + Math.sin(view.az) * d;
          rt.stand(ax, az, Math.atan2(tz - az, tx - ax), Math.atan2(h * view.aim - view.eye, d) * 0.85);
          await settle();
          shots.push({ name: `${id}_${view.name}_${String(hour).replace('.', 'h')}`, png: g.core.renderer.domElement.toDataURL('image/png') });
        }
      }
      shots.push({ name: `${id}_info`, info: placed.placed[0] });
      placed.remove();
    }
    return shots;
  }, { kinds, VIEWS, HOURS });
  for (const s of result) {
    if (s.png) fs.writeFileSync(path.join(out, `${s.name}.png`), Buffer.from(s.png.slice(s.png.indexOf(',') + 1), 'base64'));
    else console.log(s.name, JSON.stringify(s.info));
  }
  if (errors.length) {
    bad++;
    console.log('errors', errors.slice(0, 4).join(' | '));
  }
  console.log('shots in', out);
} finally {
  await browser.close();
  await server.close();
}
process.exit(bad ? 1 : 0);
