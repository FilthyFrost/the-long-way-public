// ND2's water in the game (docs/ND/PLAN.md): the hand pump by the road filling an empty water can (E held: the handle
// rocking, the stream into the can's neck), the can poured into a bucket left on the ground, the bucket's level, water
// drawn back with F, then a storm: the bucket left out filling in the rain.
//   SHOTS_GPU=1 node harness/shots/nd2_water.mjs [seed] [hour]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/nd2');
fs.mkdirSync(out, { recursive: true });
const seed = process.argv[2] || '7';
const hour = process.argv[3] || '15.6';
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=${seed}&start=road&build=stock:pickup&nd=pump,cabin&time=${hour}&weather=clear`, { width: 1280, height: 720 });
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
  const held = () => page.evaluate(() => { const h = window.__rt.game.player.held; return h?.kind === 'item' ? { item: h.item.item, litres: h.item.litres, liquid: h.item.state?.liquid ?? null } : null; });
  /** E held for `seconds`, a shot taken at `at` s into it (still held) */
  const holdE = async (seconds, at = -1, name = '') => {
    await page.evaluate(() => window.__rt.game.player.press());
    const dt = 1 / 60;
    let t = 0;
    let shotDone = at < 0;
    while (t < seconds) {
      const n = !shotDone && at - t < 0.5 ? Math.max(1, Math.round((at - t) / dt)) : 30;
      await page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) { g.player.primary = true; g.step(1 / 60, 1); } }, n);
      t += n * dt;
      if (!shotDone && t >= at - 1e-6) {
        await shot(name);
        shotDone = true;
      }
    }
    await page.evaluate(() => { const g = window.__rt.game; g.player.release(); g.simulate(0); });
  };
  const places = await H('nd-build', 'places');
  const P = places.find((p) => p.prefab === 'pump');
  if (!P) throw new Error('no pump laid: ' + JSON.stringify(places.map((p) => p.prefab)));
  console.log('pump place', JSON.stringify(P));
  await page.evaluate(({ x, z }) => { const g = window.__rt.game; g.teleportTo(x, z, 0, true); g.simulate(0); }, { x: P.x + 6, z: P.z + 6 });
  await settle();
  const pumps = await H('nd-water', 'pumps');
  console.log('pumps', JSON.stringify(pumps));
  const pump = pumps[0];
  if (!pump) throw new Error('no pump fixture');
  // a bucket put down on the ground a little way from the well (empty)
  const fx = Math.cos(pump.yaw);
  const fz = Math.sin(pump.yaw);
  await page.evaluate(() => window.__rt.hold('item:nd_bucket'));
  await page.evaluate(() => { const h = window.__rt.game.player.held; h.item.litres = 0; h.item.state = { ...(h.item.state ?? {}), found: true }; });
  // (stood off to the pump's right, a step out from it, facing along the road)
  const sx = pump.x + fx * 1.6 - fz * 1.3;
  const sz = pump.z + fz * 1.6 + fx * 1.3;
  await page.evaluate(({ sx, sz, h }) => window.__rt.stand(sx, sz, h, -0.6), { sx, sz, h: Math.atan2(fz, fx) });
  await step(6);
  await page.evaluate(() => window.__rt.drop());
  await secs(0.8);
  let vessels = await H('nd-water', 'vessels');
  const bk = vessels.find((v) => v.item === 'nd_bucket' && v.litres === 0) ?? vessels.find((v) => v.item === 'nd_bucket');
  console.log('bucket', JSON.stringify(bk));
  // an empty water can in the hands, held to the pump
  await page.evaluate(() => window.__rt.hold('item:nd_water_can'));
  await page.evaluate(() => { const h = window.__rt.game.player.held; h.item.litres = 0; h.item.state = { ...(h.item.state ?? {}), found: true }; });
  console.log('aim pump', await page.evaluate(({ p }) => window.__rt.aimPoint(p.spout.x, p.spout.y - 0.12, p.spout.z, p.yaw + 0.5, 0.85), { p: pump }));
  console.log('can', JSON.stringify(await held()));
  await holdE(3.2, 1.25, '20_pump_filling_can.png');
  console.log('after pump', JSON.stringify(await held()), JSON.stringify((await H('nd-water', 'pumps'))[0]));
  await holdE(3.0);
  console.log('after more', JSON.stringify(await held()), JSON.stringify((await H('nd-water', 'pumps'))[0]));
  // the can poured into the bucket
  const mouth = await H('nd-water', 'mouth', bk.uid);
  const toB = Math.atan2(sz - mouth.z, sx - mouth.x);
  // (from the side and a step back, so that the can tipped over it is seen pouring, not from over it)
  console.log('aim bucket', await page.evaluate(({ m, f }) => window.__rt.aimPoint(m.x, m.y - 0.14, m.z, f, 1.6), { m: mouth, f: toB + 0.9 }));
  await holdE(2.0, 1.2, '21_can_into_bucket.png');
  vessels = await H('nd-water', 'vessels');
  console.log('bucket now', JSON.stringify(vessels.find((v) => v.uid === bk.uid)), 'can', JSON.stringify(await held()));
  // its level, from over it
  await page.evaluate(({ m, f }) => window.__rt.aimPoint(m.x, m.y - 0.2, m.z, f, 0.45), { m: mouth, f: toB });
  await page.evaluate(() => { const g = window.__rt.game; const p = g.player; p.slots[p.sel] = null; g.simulate(0); });
  await step(4);
  await shot('22_bucket_level.png');
  // water drawn back into a can with F
  await page.evaluate(() => window.__rt.hold('item:nd_water_can'));
  await page.evaluate(() => { const h = window.__rt.game.player.held; h.item.litres = 1; h.item.state = { ...(h.item.state ?? {}), found: true }; });
  console.log('aim bucket F', await page.evaluate(({ m, f }) => window.__rt.aimPoint(m.x, m.y - 0.1, m.z, f, 0.75), { m: mouth, f: toB }));
  console.log('F words', JSON.stringify(await page.evaluate(() => window.__rt.game.player.telemetry().actions ?? null)));
  await page.evaluate(() => window.__rt.takeFor(1.5));
  vessels = await H('nd-water', 'vessels');
  console.log('after F', JSON.stringify(await held()), JSON.stringify(vessels.find((v) => v.uid === bk.uid)));
  // a storm: the bucket left out fills
  await page.evaluate(() => { const g = window.__rt.game; const p = g.player; p.slots[p.sel] = null; g.simulate(0); });
  const before = (await H('nd-water', 'vessels')).find((v) => v.uid === bk.uid).litres;
  await page.evaluate(() => window.__rt.setWeather('storm'));
  await secs(45);
  console.log('rain', await page.evaluate(() => window.__rt.game.env.state.rain));
  await secs(120);
  vessels = await H('nd-water', 'vessels');
  const after = vessels.find((v) => v.uid === bk.uid);
  console.log('rain bucket', before, '->', JSON.stringify(after), 'caught', JSON.stringify(await H('nd-water', 'totals')));
  await page.evaluate(({ m, f }) => window.__rt.aimPoint(m.x, m.y - 0.15, m.z, f, 1.7), { m: mouth, f: toB + 0.6 });
  await step(6);
  await shot('23_rain_filling_bucket.png');
  await page.evaluate(({ m, f }) => window.__rt.aimPoint(m.x, m.y - 0.2, m.z, f, 0.5), { m: mouth, f: toB + 0.6 });
  await step(4);
  await shot('24_rain_bucket_level.png');
  // the can watering a plant pot (the garden's pour, shown as the water's own: a litre a second)
  await page.evaluate(() => window.__rt.setWeather('clear'));
  await page.evaluate(() => window.__rt.hold('item:nd_plant_pot'));
  await page.evaluate(({ sx, sz, h }) => window.__rt.stand(sx, sz, h, -0.6), { sx: sx - fz * 1.2, sz: sz + fx * 1.2, h: Math.atan2(fz, fx) });
  await step(4);
  await page.evaluate(() => window.__rt.drop());
  await secs(0.8);
  const pot = (await H('nd-garden', 'pots')).sort((a, b) => Math.hypot(a.x - sx, a.z - sz) - Math.hypot(b.x - sx, b.z - sz))[0];
  await page.evaluate(() => window.__rt.hold('item:nd_water_can'));
  await page.evaluate(() => { const h = window.__rt.game.player.held; h.item.litres = 6; h.item.state = { ...(h.item.state ?? {}), found: true }; });
  console.log('aim pot', await page.evaluate(({ p, f }) => window.__rt.aimPoint(p.x, p.y + 0.12, p.z, f, 1.5), { p: pot, f: Math.atan2(sz - pot.z, sx - pot.x) + 0.9 }));
  await holdE(1.2, 0.6, '25_can_waters_pot.png');
  console.log('pot after', JSON.stringify((await H('nd-garden', 'pots')).find((p) => p.uid === pot.uid)), 'can', JSON.stringify(await held()));
  if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
} finally {
  await browser.close();
  await server.close();
}
