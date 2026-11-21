// Milestone R4 (docs/V3/nodes/R4-trees.md): the toolkit's trees of the fourth round in the game's own world, each by
// the road and photographed on foot from the road's side (the world's own trees hidden), and the row of them.
//   SHOTS_GPU=1 node harness/shots/r4_trees.mjs [biome] [hour] [kind ...]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const biome = process.argv[2] ?? 'plains';
const hour = Number(process.argv[3] ?? 15.5);
const want = process.argv.slice(4);
const out = path.join(ROOT, 'loop/shots/r4_trees', `${biome}_${String(hour).replace('.', 'h')}`);
fs.mkdirSync(out, { recursive: true });
const KINDS = want.length ? want : ['oak', 'maple', 'linden', 'beech', 'ash', 'chestnut', 'camphor', 'marula', 'nothofagus', 'tugai', 'emergent', 'fig', 'araucaria', 'dragon', 'ocotillo', 'frailejon'];
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?new=1&shot=1&world=2&seed=7&start=road&build=stock:pickup&s=1200&time=${hour}&weather=clear&biome=${biome}`, { width: 1600, height: 1000 });
  const result = await page.evaluate(async (kinds) => {
    const rt = window.__rt;
    const g = rt.game;
    g.ui.root.style.visibility = 'hidden';
    const stage = await import('/src/game/scene/flora/stage.ts');
    const v = g.seated ?? g.vehicles[0];
    const b = new Array(9).fill(0);
    v.sim.basis(b);
    const fx = b[0], fz = b[2], rx = b[6], rz = b[8];
    const px = v.sim.px, pz = v.sim.pz;
    const at = (ahead, side) => [px + fx * ahead + rx * side, pz + fz * ahead + rz * side];
    const trees = kinds.map((id, i) => {
      const [x, z] = at(30 + i * 34, 22);
      return { id, x, z, seed: 11 + i * 12 };
    });
    const hidden = [];
    g.core.scene.traverse((o) => {
      if (/flora-trees|flora-shadow|trees-v1/.test(o.name) || o.name === 'crowns') {
        if (o.visible) hidden.push(o);
        o.visible = false;
      }
    });
    const settle = async () => {
      for (let i = 0; i < 300 && (g.worldView?.pending ?? 0) > 0; i++) {
        g.worldView.update(g.player.walker.x, g.player.walker.z, 40);
        await new Promise((r) => setTimeout(r, 0));
      }
      g.core.scene.traverse((o) => {
        if (/flora-trees|flora-shadow|trees-v1/.test(o.name) || o.name === 'crowns') o.visible = false;
      });
      for (let i = 0; i < 3; i++) rt.render();
    };
    const shots = [];
    const heights = {};
    {
      const placed = stage.placeFlora(g, trees, {});
      for (const p of placed.placed) heights[p.id] = p.height;
      placed.remove();
    }
    for (const t of trees) {
      const h = heights[t.id] ?? 10;
      const d = Math.min(46, Math.max(7, h * 1.2));
      const [ax, az] = [t.x - rx * d, t.z - rz * d];
      const pitch = Math.atan2(h * 0.45 - 1.6, d) * 0.9;
      rt.stand(ax, az, Math.atan2(t.z - az, t.x - ax), pitch);
      const placed = stage.placeFlora(g, [t], {});
      await settle();
      shots.push({ name: `tree_${t.id}`, png: g.core.renderer.domElement.toDataURL('image/png') });
      placed.remove();
    }
    for (const o of hidden) o.visible = true;
    return { shots, heights };
  }, KINDS);
  for (const s of result.shots) fs.writeFileSync(path.join(out, `${s.name}.png`), Buffer.from(s.png.slice(s.png.indexOf(',') + 1), 'base64'));
  console.log('heights', JSON.stringify(result.heights));
  console.log('shots in', out);
  if (errors.length) console.log('errors', errors.slice(0, 4).join(' | '));
} finally {
  await browser.close();
  await server.close();
}
