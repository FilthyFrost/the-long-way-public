// ND2's food, drink and medicine in the game (docs/ND/PLAN.md): the new kinds laid out on the cabin's floor, the
// bookshelf and the fridge's top as the cabin furnishes them, an orange eaten (its card, its water), milk poured
// into a mug.
//   SHOTS_GPU=1 node harness/shots/nd2_food.mjs [seed] [hour]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/nd2');
fs.mkdirSync(out, { recursive: true });
const seed = process.argv[2] || '7';
const hour = process.argv[3] || '15.6';
const IDS = ['nd_baked_beans', 'nd_tomato_soup', 'nd_tuna', 'nd_cereal', 'nd_peanut_butter', 'nd_chocolate_1', 'ing_banana', 'ing_orange', 'nd_mushroom', 'ing_milk', 'nd_pills', 'nd_first_aid'];
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=${seed}&start=road&build=stock:pickup&nd=cabin&time=${hour}&weather=clear`, { width: 1280, height: 720 });
  const step = (n = 6) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.simulate(1 / 30); }, n);
  const secs = (s) => page.evaluate((s) => { const g = window.__rt.game; for (let t = 0; t < s; t += 1 / 30) g.step(1 / 30, 1); g.simulate(0); }, s);
  const H = (sys, fn, ...a) => page.evaluate(({ sys, fn, a }) => window.__rt.game.systems.harness(sys, fn, ...a), { sys, fn, a });
  const settle = async () => {
    for (let i = 0; i < 80; i++) {
      await step(4);
      const st = await page.evaluate(() => ({ pending: window.__rt.worldPending(), drawn: window.__rt.game.systems.harness('nd-build', 'drawn') }));
      if (st.pending <= 0 && st.drawn.length && st.drawn.every((d) => d.ready)) break;
    }
    await page.evaluate(() => window.__rt.game.loose.settled());
    await step(8);
  };
  const shot = async (f) => {
    await page.evaluate(() => window.__rt.render());
    await page.screenshot({ path: path.join(out, f) });
    console.log('shot', f);
  };
  const P = (await H('nd-build', 'places')).find((p) => p.prefab === 'cabin');
  if (!P) throw new Error('no cabin');
  const W = (x, y) => ({ x: P.x + Math.cos(P.yaw) * x + Math.sin(P.yaw) * y, z: P.z + Math.sin(P.yaw) * x - Math.cos(P.yaw) * y });
  const stand = async (from, to, pitch = 0) => {
    const a = W(from[0], from[1]);
    const b = W(to[0], to[1]);
    await page.evaluate(({ a, b, pitch }) => window.__rt.stand(a.x, a.z, Math.atan2(b.z - a.z, b.x - a.x), pitch), { a, b, pitch });
    await step(10);
  };
  await page.evaluate(({ x, z }) => { const g = window.__rt.game; g.teleportTo(x, z, 0, true); g.simulate(0); }, W(-7, 8));
  await settle();
  await H('nd-build', 'door', P.id, true);
  // what the cabin has of them where it put them: the bookshelf, the fridge's top, the table
  const near = await page.evaluate(({ c }) => window.__rt.game.loose.list.filter((l) => l.item && l.item.item.startsWith('nd_') && Math.hypot(l.x - c.x, l.z - c.z) < 9).map((l) => `${l.item.item}`), { c: W(0, 0) });
  console.log('cabin has', near.join(' '));
  await page.evaluate(() => { const p = window.__rt.game.player; p.slots[p.sel] = null; });
  await stand([0.9, -0.6], [2.3, -2.3], -0.05);
  await shot('30_bookshelf_food.png');
  await stand([1.4, -0.6], [2.8, -1.36], 0.15);
  await shot('31_fridge_top_medicine.png');
  // all of them in a row on the floor between the table and the sofa
  for (let i = 0; i < IDS.length; i++) {
    const row = i < 7 ? 0 : 1;
    const k = i % 7;
    const u = -1.6 + k * 0.32;
    const v = row ? 0.55 : 0.2;
    await page.evaluate((id) => window.__rt.hold(`item:${id}`), IDS[i]);
    await stand([u, v - 0.55], [u, v], -1.2);
    await page.evaluate(() => window.__rt.drop());
    await secs(0.3);
  }
  await secs(1.0);
  await page.evaluate(() => { const p = window.__rt.game.player; p.slots[p.sel] = null; });
  await stand([-0.65, -0.45], [-0.65, 0.4], -0.98);
  await shot('32_food_lineup.png');
  // an orange eaten: F held
  await page.evaluate(() => window.__rt.hold('item:ing_orange'));
  const before = await page.evaluate(() => { const b = window.__rt.game.body; return { food: b.food, water: b.water }; });
  await page.evaluate(() => { const b = window.__rt.game.body; b.food = 40; b.water = 40; });
  await stand([-0.65, -0.9], [-0.65, 1.4], -0.1);
  await page.evaluate(() => { const g = window.__rt.game; for (let i = 0; i < 70; i++) { g.rightButton = true; g.step(1 / 60, 1); } });
  await shot('33_eating_orange.png');
  await page.evaluate(() => { const g = window.__rt.game; for (let i = 0; i < 260; i++) { g.rightButton = true; g.step(1 / 60, 1); } g.rightButton = false; g.simulate(0); });
  await secs(6);
  const after = await page.evaluate(() => { const b = window.__rt.game.body; return { food: b.food, water: b.water, held: window.__rt.game.player.held?.item?.item ?? null }; });
  console.log('orange: from 40/40 ->', JSON.stringify(after), '(was', JSON.stringify(before), ')');
  // milk poured into a mug on the table
  await page.evaluate(() => window.__rt.hold('item:nd_mug'));
  await stand([-1.0, 1.35], [-0.9, 1.95], -0.9);
  await page.evaluate(() => window.__rt.drop());
  await secs(0.6);
  const mug = (await H('nd-water', 'vessels')).filter((v) => v.item === 'nd_mug').sort((a, b) => {
    const c = W(-0.9, 1.95);
    return Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z);
  })[0];
  await page.evaluate(() => window.__rt.hold('item:ing_milk'));
  await page.evaluate(() => { const h = window.__rt.game.player.held; h.item.litres = 0.9; h.item.state = { found: true }; });
  const m = await H('nd-water', 'mouth', mug.uid);
  const from = W(-0.2, 1.3);
  console.log('aim mug', await page.evaluate(({ m, f }) => window.__rt.aimPoint(m.x, m.y - 0.05, m.z, f, 1.0), { m, f: Math.atan2(from.z - m.z, from.x - m.x) }));
  await page.evaluate(() => window.__rt.game.mouseDown(0));
  await page.evaluate(() => { const g = window.__rt.game; for (let i = 0; i < 14; i++) { g.step(1 / 60, 1); } });
  await shot('34_milk_into_mug.png');
  await page.evaluate(() => { const g = window.__rt.game; for (let i = 0; i < 60; i++) { g.step(1 / 60, 1); } g.mouseUp(0); g.simulate(0); });
  console.log('mug', JSON.stringify((await H('nd-water', 'vessels')).find((v) => v.uid === mug.uid)));
  if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
} finally {
  await browser.close();
  await server.close();
}
