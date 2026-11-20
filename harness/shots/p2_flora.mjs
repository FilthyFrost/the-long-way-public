// The plant toolkit's samples in the game's own world (docs/V3/nodes/P2-flora.md), for the player to judge: the
// fourteen trees in a row along the right of the road and the ground plants (tufts, flowers, shrubs) by its left,
// drawn by the crowns' material in the game's light and paint finish. The world's own trees are hidden for the
// pictures, so that every tree in them is a sample.
//   SHOTS_GPU=1 node harness/shots/p2_flora.mjs [biome] [hour]
// Pictures in loop/shots/p2_flora/<biome>_<hour>/, with report.json: every kind's triangles at both levels against
// its budget, and its grow time.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const biome = process.argv[2] ?? 'plains';
const hour = Number(process.argv[3] ?? 15.5);
const out = path.join(ROOT, 'loop/shots/p2_flora', `${biome}_${String(hour).replace('.', 'h')}`);
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?new=1&shot=1&world=2&seed=7&start=road&build=stock:pickup&s=1200&time=${hour}&weather=clear&biome=${biome}`, { width: 1920, height: 1080 });
  const result = await page.evaluate(async () => {
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
    // the trees: along the right of the road, each where it has room
    const row = [
      ['spruce', 30, 18],
      ['oak', 54, 26],
      ['pine', 80, 20],
      ['stone_pine', 104, 26],
      ['birch', 126, 16],
      ['poplar', 144, 17],
      ['cherry', 162, 19],
      ['cypress', 180, 14],
      ['palm', 198, 18],
      ['acacia', 222, 27],
      ['dragon', 244, 18],
      ['bamboo', 262, 16],
      ['saguaro', 278, 12],
      ['baobab', 302, 28],
    ];
    const trees = row.map(([id, ahead, side], i) => {
      const [x, z] = at(ahead, side);
      return { id, x, z, seed: 11 + i * 12 };
    });
    // the ground plants: in little patches by the left of the road, a few paces ahead of the car
    const ground = [];
    const patch = (id, ahead, side, n, spread, seed) => {
      for (let k = 0; k < n; k++) {
        const a = k * 2.39996 + seed;
        const r = spread * Math.sqrt((k + 0.5) / n);
        const [x, z] = at(ahead + Math.cos(a) * r, side + Math.sin(a) * r);
        ground.push({ id, x, z, seed: seed + k * 7 });
      }
    };
    // (on the verge, where the world's grass is short, so that they are seen)
    patch('tuft_meadow', 8, -4.9, 4, 0.6, 3);
    patch('tuft_tussock', 10.5, -5.4, 2, 0.7, 5);
    patch('tuft_needle', 13, -4.9, 3, 0.6, 7);
    patch('tuft_spinifex', 15.5, -5.5, 2, 0.6, 9);
    patch('flower_poppy', 8.5, -6.3, 6, 0.7, 11);
    patch('flower_goldpoppy', 10.5, -6.6, 6, 0.6, 13);
    patch('flower_tulip', 12.5, -6.3, 6, 0.7, 15);
    patch('flower_daisy', 14.5, -6.7, 6, 0.7, 17);
    patch('flower_lupin', 16.5, -6.4, 6, 0.8, 19);
    patch('shrub_round', 19.5, -6.2, 1, 0, 21);
    patch('shrub_heather', 21.8, -5.2, 2, 0.6, 23);
    patch('shrub_sage', 24, -6.4, 1, 0, 25);
    patch('shrub_lavender', 26.2, -5.3, 3, 0.8, 27);
    patch('shrub_protea', 28.6, -6.4, 1, 0, 29);
    // the variety of one kind: six oaks and six spruces of different seeds, across the road from the row
    const variants = [];
    [3, 19, 41, 67, 89, 113].forEach((seed, k) => {
      const [x, z] = at(70 + k * 24, -30 - (k % 2) * 6);
      variants.push({ id: 'oak', x, z, seed });
      const [x2, z2] = at(82 + k * 24, -52 - (k % 2) * 5);
      variants.push({ id: 'spruce', x: x2, z: z2, seed: seed + 1 });
    });
    const all = [...trees, ...ground, ...variants];
    // the world's own trees out of the pictures
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
    const take = async (name, place, opts = {}) => {
      const placed = stage.placeFlora(g, all, opts);
      await settle();
      shots.push({ name, png: g.core.renderer.domElement.toDataURL('image/png'), placed: placed.placed.filter((p) => !p.id.startsWith('tuft') && !p.id.startsWith('flower')) });
      placed.remove();
      void place;
    };
    // from the driving seat, looking out to the right
    if (!g.seated) rt.enter(0);
    rt.setView('cockpit');
    rt.look(0.62, 0.1);
    await take('seat_right');
    rt.look(-0.55, -0.12);
    await take('seat_left_ground');
    // each tree on foot, from the road's side, far enough to see all of it
    const heights = {};
    {
      const placed = stage.placeFlora(g, trees, { });
      for (const p of placed.placed) heights[p.id] = p.height;
      placed.remove();
    }
    for (const t of trees) {
      const h = heights[t.id];
      const d = Math.min(40, Math.max(8, h * 1.15));
      // stand between the tree and the road, square on to it
      const [ax, az] = [t.x - rx * d, t.z - rz * d];
      const pitch = Math.atan2(h * 0.45 - 1.6, d) * 0.9;
      rt.stand(ax, az, Math.atan2(t.z - az, t.x - ax), pitch);
      await take(`tree_${t.id}`);
    }
    // the ground plants close to
    {
      const [ax, az] = at(12, -1.5);
      const [tx, tz] = at(12, -6);
      rt.stand(ax, az, Math.atan2(tz - az, tx - ax), -0.3);
      await take('ground_flowers');
      const [bx, bz] = at(24, -1.5);
      const [cx, cz] = at(24, -6);
      rt.stand(bx, bz, Math.atan2(cz - bz, cx - bx), -0.25);
      await take('ground_shrubs');
      const [dx, dz] = at(1, -2.2);
      const [ex, ez] = at(16, -6);
      rt.stand(dx, dz, Math.atan2(ez - dz, ex - dx), -0.18);
      await take('ground_along');
    }
    // the variety of one kind
    {
      const [ax, az] = at(60, -4);
      const [tx, tz] = at(130, -40);
      rt.stand(ax, az, Math.atan2(tz - az, tx - ax), 0.12);
      await take('variants_oak_spruce');
    }
    // the whole row from across the road: in colour and as silhouettes
    {
      const [ax, az] = at(150, -95);
      const [tx, tz] = at(165, 20);
      rt.stand(ax, az, Math.atan2(tz - az, tx - ax), 0.06);
      await take('row_100m');
      await take('row_100m_silhouette', null, { silhouette: true });
      const [bx, bz] = at(160, -230);
      rt.stand(bx, bz, Math.atan2(tz - bz, tx - bx), 0.03);
      await take('row_240m');
    }
    for (const o of hidden) o.visible = true;
    const report = stage.floraReport();
    return { shots, report };
  });
  for (const s of result.shots) fs.writeFileSync(path.join(out, `${s.name}.png`), Buffer.from(s.png.slice(s.png.indexOf(',') + 1), 'base64'));
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ report: result.report, shots: result.shots.map((s) => ({ name: s.name, placed: s.placed })) }, null, 1));
  for (const r of result.report) console.log(`${r.id.padEnd(17)} near ${String(r.near).padStart(5)}  mid ${String(r.mid).padStart(4)}  (${r.budget}; ${r.nearMs.toFixed(1)} ms near)`);
  console.log('shots in', out);
  if (errors.length) {
    bad++;
    console.log('errors', errors.slice(0, 4).join(' | '));
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(bad ? 1 : 0);
