// ND1's plant pots and grinder in the game (docs/ND/PLAN.md): four pots set out on the cabin's porch, each sown with
// its seeds and watered, seen as they grow and when they are ripe, a fruit picked into the hands; the grinder run
// against the pickup's side.
//   SHOTS_GPU=1 node harness/shots/nd1_pot_grinder.mjs [seed] [hour]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/nd1');
fs.mkdirSync(out, { recursive: true });
const seed = process.argv[2] || '7';
const hour = process.argv[3] || '15.2';
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
  const places = await H('nd-build', 'places');
  const P = places.find((p) => p.prefab === 'cabin');
  if (!P) throw new Error('no cabin laid');
  const W = (u, v) => ({ x: P.x + Math.cos(P.yaw) * u - Math.sin(P.yaw) * v, z: P.z + Math.sin(P.yaw) * u + Math.cos(P.yaw) * v });
  const stand = async (from, to, pitch = 0) => {
    const a = W(from[0], from[1]);
    const b = W(to[0], to[1]);
    await page.evaluate(({ a, b, pitch }) => window.__rt.stand(a.x, a.z, Math.atan2(b.z - a.z, b.x - a.x), pitch), { a, b, pitch });
    await step(10);
  };
  const press = () => page.evaluate(() => window.__rt.press());
  await page.evaluate(({ x, z }) => { const g = window.__rt.game; g.teleportTo(x, z, 0, true); g.simulate(0); }, W(-7, -8));
  await settle();
  // ---- four pots on the porch, in a row along it (the card's porch: u −4.4 … −2.9, v −2.4 … 2.4)
  const before = (await H('nd-garden', 'pots')).map((p) => p.uid);
  const crops = ['tomato', 'apple', 'potato', 'watermelon'];
  for (let i = 0; i < 4; i++) {
    const v = -1.6 + i * 1.05;
    await page.evaluate(() => window.__rt.hold('item:nd_plant_pot'));
    await stand([-3.1, v], [-4.3, v], -0.75);
    await page.evaluate(() => window.__rt.drop());
    await secs(0.6);
  }
  const pots = (await H('nd-garden', 'pots')).filter((p) => !before.includes(p.uid));
  // (what the place left lying on the porch by them out of the way, so the mark is on the pots)
  await page.evaluate((ps) => { const g = window.__rt.game; for (const l of [...g.loose.list]) if (l.item?.item !== 'nd_plant_pot' && ps.some((p) => Math.hypot(l.x - p.x, l.z - p.z) < 0.9)) g.loose.remove(l); }, pots);
  console.log('pots', pots.length);
  const aimPot = (p, from = 0.0) => page.evaluate(({ p, from }) => window.__rt.aimPoint(p.x, p.y + 0.16, p.z, from, 0.6), { p, from });
  // the side the porch's edge is on, from the pot (towards the cabin: +u)
  const fromSide = Math.atan2(Math.sin(P.yaw), Math.cos(P.yaw));
  for (let i = 0; i < pots.length; i++) {
    await page.evaluate((c) => window.__rt.hold(`item:nd_seeds_${c}`), crops[i]);
    console.log('sow', crops[i], await aimPot(pots[i], fromSide));
    await press();
    await page.evaluate(() => window.__rt.hold('tool:bottle', { litres: 5 }));
    await aimPot(pots[i], fromSide);
    // (E held: it pours half a litre a second till the soil has its litre)
    await page.evaluate(() => window.__rt.useFor(2.3));
  }
  await page.evaluate(() => window.__rt.hold('item:nd_mug'));
  const view = async (f, near = false) => {
    if (near) await stand([-3.25, -0.35], [-3.85, 0.45], -0.62);
    else await stand([-3.15, -2.45], [-3.85, 0.4], -0.36);
    await shot(f);
  };
  await secs(1);
  await view('30_pots_sown.png');
  await secs(14);
  await view('31_pots_15s.png');
  await secs(15);
  await view('32_pots_30s.png');
  await secs(16);
  await view('33_pots_46s.png');
  await secs(15);
  console.log('pots now', JSON.stringify(await H('nd-garden', 'pots')));
  await view('34_pots_ripe.png');
  await view('35_pots_ripe_near.png', true);
  // a tomato picked
  const f = await H('nd-garden', 'fruitAt', pots[0].uid, 1);
  if (f) {
    await page.evaluate(() => window.__rt.hold('item:nd_mug'));
    await page.evaluate(() => { const p = window.__rt.game.player; p.slots[p.sel] = null; });
    console.log('aim fruit', await page.evaluate(({ f, from }) => window.__rt.aimPoint(f.x, f.y, f.z, from, 0.7), { f, from: fromSide }));
    await press();
    await secs(0.4);
    await shot('36_tomato_picked.png');
  }
  // ---- the grinder against the pickup's side
  const v0 = await page.evaluate(() => { const v = window.__rt.game.vehicles[0]; return { x: v.sim.px, z: v.sim.pz, yaw: v.sim.yaw ?? 0 }; });
  await page.evaluate(() => window.__rt.hold('item:nd_grinder'));
  console.log('aim vehicle', await page.evaluate(() => window.__rt.aim(0, 'door_l', 0.7) || window.__rt.aim(0, 'door_fl', 0.7) || window.__rt.aim(0, 'hood', 0.7)), JSON.stringify(v0));
  await secs(0.3);
  await H('nd-grinder', 'run', true);
  await secs(2.5);
  await shot('37_grinder_on_body.png');
  await secs(2.5);
  await H('nd-grinder', 'run', false);
  await secs(0.3);
  await shot('38_grinder_after.png');
  // a battery into the grinder once its own is spent (Nomad Drive: a battery in the hands, E held half a second on the tool lying)
  await page.evaluate(() => window.__rt.drop());
  await secs(0.6);
  const gl = (await H('nd-grinder', 'lying'))[0];
  if (gl) {
    await H('nd-grinder', 'spend', gl.uid);
    await page.evaluate(() => window.__rt.hold('item:nd_battery'));
    console.log('aim grinder with battery', await page.evaluate(({ g }) => window.__rt.aimPoint(g.x, g.y + 0.05, g.z, 1.2, 0.7), { g: gl }));
    await shot('39_battery_onto_grinder.png');
    await page.evaluate(() => window.__rt.useFor(0.6));
    console.log('grinder charge after the battery', JSON.stringify(await H('nd-grinder', 'lying')));
  }
  console.log('grinder', JSON.stringify(await page.evaluate(() => window.__rt.game.systems.telemetry()['nd-grinder']?.own ?? null)), 'charge', await H('nd-grinder', 'charge'));
  if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
} finally {
  await browser.close();
  await server.close();
}
