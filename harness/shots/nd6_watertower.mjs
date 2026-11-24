// ND6's water tower in the game (docs/ND/PLAN.md): Nomad Drive's WaterTower and its ladder — walked into facing it and
// taken hold of, climbed to the walkway and let go there, taken hold of again from the walkway with one's back to it
// and climbed down; the kit it is always found with.
//   SHOTS_GPU=1 node harness/shots/nd6_watertower.mjs [seed]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/nd6');
fs.mkdirSync(out, { recursive: true });
const seed = process.argv[2] || '7';
const { server, url } = await startServer();
const browser = await launchBrowser();
let fails = 0;
const check = (ok, what) => {
  console.log(ok ? 'ok  ' : 'FAIL', what);
  if (!ok) fails++;
};
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=${seed}&start=road&build=stock:pickup&nd=watertower&time=15.5&weather=clear`, { width: 1280, height: 720 });
  const step = (n = 6) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.step(1 / 60, 1); }, n);
  const sim = (n = 6) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.simulate(1 / 30); }, n);
  const H = (sys, fn, ...a) => page.evaluate(({ sys, fn, a }) => window.__rt.game.systems.harness(sys, fn, ...a), { sys, fn, a });
  const shot = async (f, extra = '') => {
    await page.evaluate(() => window.__rt.render());
    await page.screenshot({ path: path.join(out, f) });
    console.log('shot', f, extra);
  };
  const P = (await H('nd-build', 'places')).find((p) => p.prefab === 'watertower');
  if (!P) throw new Error('no water tower laid');
  const W = (u, v) => ({ x: P.x + Math.cos(P.yaw) * u - Math.sin(P.yaw) * v, z: P.z + Math.sin(P.yaw) * u + Math.cos(P.yaw) * v });
  await page.evaluate(({ x, z }) => { const g = window.__rt.game; g.teleportTo(x, z, 0, true); g.simulate(0); }, W(0, -14));
  for (let i = 0; i < 90; i++) {
    await sim(4);
    const st = await page.evaluate(() => ({ pending: window.__rt.worldPending(), drawn: window.__rt.game.systems.harness('nd-build', 'drawn') }));
    if (st.pending <= 0 && st.drawn.length && st.drawn.every((d) => d.ready)) break;
  }
  await page.evaluate(() => window.__rt.game.loose.settled());
  await page.evaluate(({ x, z, yaw }) => { const g = window.__rt.game; if (g.seated) g.getOut(); window.__rt.placeVehicle(0, x, z, yaw); }, { ...W(-12, -8), yaw: P.yaw });
  await sim(8);
  const things = await page.evaluate(({ x, z }) => window.__rt.game.loose.list.filter((l) => Math.hypot(l.x - x, l.z - z) < 10).map((l) => `${l.item?.item ?? l.tool?.kind ?? '?'}@${(l.y - window.__rt.game.systems.harness('nd-build', 'places')[0].y).toFixed(1)}`), { x: P.x, z: P.z });
  console.log('found', things.length, JSON.stringify(things));
  // (its two bottles of water are the place's own drink: since J10 a place keeps 27 % of its food and drink — loot.ts
  // PLACES_KEEP — so they are there only now and then; the cans and the bucket are its kit)
  check(things.filter((t) => t.startsWith('nd_water_can')).length >= 3 && things.some((t) => t.startsWith('nd_bucket')), 'its water kit: three cans and a bucket');
  const lad = (await H('nd-climb', 'ladders'))[0];
  console.log('ladder', JSON.stringify(lad));
  const look = async (from, to, pitch) => {
    const a = W(from[0], from[1]);
    const b = W(to[0], to[1]);
    await page.evaluate(({ a, b, pitch }) => window.__rt.stand(a.x, a.z, Math.atan2(b.z - a.z, b.x - a.x), pitch), { a, b, pitch });
    await sim(4);
  };
  await look([4.5, -12.5], [0, 0], 0.32);
  await shot('10_the_water_tower.png');
  // walking into its ladder, facing it: taken hold of
  await look([0, -6.4], [0, 0], 0.05);
  await page.keyboard.down('KeyW');
  await step(40);
  let st = await H('nd-climb', 'state');
  console.log('after walking into it', JSON.stringify(st));
  check(st.phase === 'on' || st.phase === 'grab', 'walked into it facing it, one takes hold of it');
  await step(120);
  await page.evaluate(() => { window.__rt.game.input.lookPitch = 0.9; });
  await step(2);
  await shot('11_climbing_it.png', JSON.stringify(await H('nd-climb', 'state')));
  // on up to its head: let go on the walkway
  await page.evaluate(() => { window.__rt.game.input.lookPitch = 0; });
  let t = 0;
  for (; t < 9; t += 0.5) {
    await step(30);
    st = await H('nd-climb', 'state');
    if (!st.phase) break;
  }
  await page.keyboard.up('KeyW');
  await step(20);
  const feet = await page.evaluate((y) => window.__rt.game.player.walker.y - y, P.y);
  console.log('climbed in about', (t + 0.5 + 2.67).toFixed(1), 's, feet', feet.toFixed(2), JSON.stringify(st));
  check(!st.phase && Math.abs(feet - 10.81) < 0.2, 'up to its head and let go on the walkway (10.81 m)');
  check(st.rungs >= 20, `a rung's sound every 0.45 m (${st.rungs})`);
  await page.evaluate(() => { window.__rt.game.input.lookYaw += Math.PI * 0.6; window.__rt.game.input.lookPitch = -0.25; });
  await step(4);
  await shot('12_on_the_walkway.png');
  // its tank's door swung open on the walkway: out of the tank, back along its wall
  {
    const card = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/core/v3/nd/cards/watertower.json'), 'utf8'));
    const dc = card.doors.find((d) => d.name === 'DOOR_tank');
    const mu = dc.u + (dc.su * dc.width) / 2, mv = dc.v + (dc.sv * dc.width) / 2;
    const phi = Math.atan2(mv, mu), r = Math.hypot(mu, mv) + 0.55;
    const a2 = W(Math.cos(phi + 0.75) * r, Math.sin(phi + 0.75) * r);
    const b2 = W(mu, mv);
    await H('nd-build', 'door', P.id, true, 'DOOR_tank');
    await page.evaluate(({ a, b, y }) => { const g = window.__rt.game; g.player.walker.place(a.x, a.z, 0); g.player.walker.y = y + 10.81; g.input.lookYaw = Math.atan2(b.z - a.z, b.x - a.x); g.input.lookPitch = -0.12; }, { a: a2, b: b2, y: P.y });
    await step(6);
    await shot('15_its_door_open.png');
    await H('nd-build', 'door', P.id, false, 'DOOR_tank');
  }
  // with one's back to it at its head, walking on: taken hold of from above, then down it
  const a = W(0, -3.0);
  const b = W(0, -6.0);
  await page.evaluate(({ a, b, y }) => { const g = window.__rt.game; g.player.walker.place(a.x, a.z, Math.atan2(b.z - a.z, b.x - a.x)); g.player.walker.y = y + 10.81; g.input.lookYaw = Math.atan2(b.z - a.z, b.x - a.x); g.input.lookPitch = -0.4; }, { a, b, y: P.y });
  await step(4);
  await shot('13_at_its_head.png');
  await page.keyboard.down('KeyW');
  await step(30);
  await page.keyboard.up('KeyW');
  st = await H('nd-climb', 'state');
  console.log('at its head, back to it', JSON.stringify(st));
  check(st.phase === 'on' || st.phase === 'grab', 'its back to it at its head, walking on: taken hold of from above');
  await page.keyboard.down('KeyS');
  for (t = 0; t < 9; t += 0.5) {
    await step(30);
    st = await H('nd-climb', 'state');
    if (!st.phase) break;
  }
  await page.keyboard.up('KeyS');
  await step(10);
  const feet2 = await page.evaluate((y) => window.__rt.game.player.walker.y - y, P.y);
  check(!st.phase && feet2 < 0.9, `down it and off at its foot (feet ${feet2.toFixed(2)} m)`);
  await look([1.6, 1.2], [0, 0], 0.05);
  await shot('14_under_it.png');
  if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
} finally {
  await browser.close();
  await server.close();
}
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
