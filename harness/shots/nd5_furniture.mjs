// ND5's furniture in the game (docs/ND/PLAN.md): the nine new pieces put down in a row on the cabin's yard — the
// nightstand, the folding chair, the kitchen table, its chair, the stool, the second sofa, the toilet, the wall shelf,
// the cupboard — and one sat on.
//   SHOTS_GPU=1 node harness/shots/nd5_furniture.mjs [seed] [hour]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/nd5');
fs.mkdirSync(out, { recursive: true });
const seed = process.argv[2] || '7';
const hour = process.argv[3] || '15.6';
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=${seed}&start=road&build=stock:pickup&nd=cabin&time=${hour}&weather=clear`, { width: 1280, height: 720 });
  const step = (n = 6) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.simulate(1 / 30); }, n);
  const frames = (n) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.step(1 / 60, 1); }, n);
  const H = (sys, fn, ...a) => page.evaluate(({ sys, fn, a }) => window.__rt.game.systems.harness(sys, fn, ...a), { sys, fn, a });
  const shot = async (f, extra = '') => {
    await page.evaluate(() => window.__rt.render());
    await page.screenshot({ path: path.join(out, f) });
    console.log('shot', f, extra);
  };
  const P = (await H('nd-build', 'places')).find((p) => p.prefab === 'cabin');
  const W = (u, v) => ({ x: P.x + Math.cos(P.yaw) * u - Math.sin(P.yaw) * v, z: P.z + Math.sin(P.yaw) * u + Math.cos(P.yaw) * v });
  await page.evaluate(({ x, z }) => { const g = window.__rt.game; g.teleportTo(x, z, 0, true); g.simulate(0); }, W(-7, -8));
  for (let i = 0; i < 60; i++) await step(4);
  await page.evaluate(() => window.__rt.game.loose.settled());
  const kinds = ['nd_nightstand', 'nd_chair_fold', 'nd_dinner_table', 'nd_dinner_chair', 'nd_stool', 'nd_sofa_2', 'nd_wc', 'nd_wall_shelf', 'nd_cabinet'];
  // a row along the yard in front of the cabin, each facing the road
  for (let k = 0; k < kinds.length; k++) {
    const at = W(-6 + k * 1.35, -7.5);
    const face = W(-6 + k * 1.35, -12);
    await page.evaluate(({ id, at, face }) => {
      const g = window.__rt.game;
      window.__rt.hold(`item:${id}`);
      const w = g.player.walker;
      w.place(at.x, at.z, Math.atan2(face.z - at.z, face.x - at.x));
      w.heading = Math.atan2(face.z - at.z, face.x - at.x);
      g.player.putDown();
    }, { id: kinds[k], at, face });
    await frames(10);
  }
  await frames(60);
  const c = W(-0.6, -10.6);
  const t = W(-0.6, -8.3);
  await page.evaluate(({ c, t }) => window.__rt.stand(c.x, c.z, Math.atan2(t.z - c.z, t.x - c.x), -0.28), { c, t });
  await frames(10);
  await shot('01_new_furniture_row.png', JSON.stringify((await H('nd-home', 'pieces')).filter((p) => kinds.includes(p.item)).map((p) => `${p.item}[${p.movers.join(',')}]`)));
  // sat on the stool, the toilet
  const pieces = await H('nd-home', 'pieces');
  for (const id of ['nd_wc', 'nd_sofa_2']) {
    const p = pieces.find((x) => x.item === id);
    if (!p) continue;
    console.log('sit', id, await H('nd-home', 'sit', p.uid, 0));
    await frames(40);
    await page.evaluate(() => { window.__rt.game.input.lookPitch = -0.15; });
    await frames(4);
    await shot(`02_sat_on_${id}.png`, JSON.stringify(await page.evaluate(() => { const w = window.__rt.game.player.walker; return +(w.eye().y - w.y).toFixed(2); })));
    await H('nd-home', 'stand', true);
    await frames(10);
  }
  if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
} finally {
  await browser.close();
  await server.close();
}
