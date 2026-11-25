// ND5's filling station pump in the game (docs/ND/PLAN.md: Nomad Drive's gas pump nozzle): the nozzle on its holster,
// taken into the hands with its hose after it, held to the pickup's filler and run, then to a jerrycan; what ran.
//   SHOTS_GPU=1 node harness/shots/nd5_fuel.mjs [seed]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/nd5');
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
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=${seed}&start=road&build=stock:pickup&nd=station&time=15.5&weather=clear`, { width: 1280, height: 720 });
  const step = (n = 6) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.simulate(1 / 30); }, n);
  const H = (sys, fn, ...a) => page.evaluate(({ sys, fn, a }) => window.__rt.game.systems.harness(sys, fn, ...a), { sys, fn, a });
  const shot = async (f, extra = '') => {
    await page.evaluate(() => window.__rt.render());
    await page.screenshot({ path: path.join(out, f) });
    console.log('shot', f, extra);
  };
  const P = (await H('nd-build', 'places')).find((p) => p.prefab === 'station');
  if (!P) throw new Error('no station laid');
  const W = (u, v) => ({ x: P.x + Math.cos(P.yaw) * u - Math.sin(P.yaw) * v, z: P.z + Math.sin(P.yaw) * u + Math.cos(P.yaw) * v });
  await page.evaluate(({ x, z }) => { const g = window.__rt.game; g.teleportTo(x, z, 0, true); g.simulate(0); }, W(1, -9));
  for (let i = 0; i < 90; i++) {
    await step(4);
    const st = await page.evaluate(() => ({ pending: window.__rt.worldPending(), drawn: window.__rt.game.systems.harness('nd-build', 'drawn') }));
    if (st.pending <= 0 && st.drawn.length && st.drawn.every((d) => d.ready)) break;
  }
  await page.evaluate(() => window.__rt.game.loose.settled());
  await step(8);
  const pumps = await H('nd-fuel', 'pumps');
  console.log('pumps', JSON.stringify(pumps));
  check(pumps.length === 1 && pumps[0].litres >= 14.8 && pumps[0].litres <= 50, 'one pump, 29.7-100 % of 50 L in it');
  const pump = pumps[0];
  // the pickup parked by the island, its tank part empty
  await page.evaluate(({ x, z, yaw }) => window.__rt.placeVehicle(0, x, z, yaw), { ...W(-0.7, -5.2), yaw: P.yaw + Math.PI / 2 });
  // (its handbrake on: leant on while one fills it, it stays where it is)
  await page.evaluate(() => window.__rt.game.vehicles[0].sim.setParkBrake(true));
  await step(20);
  const look = async (from, to, pitch) => {
    const a = W(from[0], from[1]);
    const b = W(to[0], to[1]);
    await page.evaluate(({ a, b, pitch }) => window.__rt.stand(a.x, a.z, Math.atan2(b.z - a.z, b.x - a.x), pitch), { a, b, pitch });
    await step(6);
  };
  await look([-3.0, -6.6], [-3.0, -5.0], -0.3);
  await shot('30_the_nozzle_on_its_pump.png');
  // E on the pump with empty hands: the nozzle into them
  const dev = `nd-fuel:${pump.site}`;
  await page.evaluate(({ x, y, z }) => window.__rt.aimPoint(x, y, z, Math.PI / 2, 1.1), pump);
  const t0 = await page.evaluate(() => String(window.__rt.game.player.telemetry().target));
  console.log('aimed at', t0);
  await page.evaluate(() => window.__rt.press());
  await step(4);
  let st = await H('nd-fuel', 'state');
  console.log('state', JSON.stringify(st));
  check(st.out === pump.site, 'E on the pump took the nozzle');
  const held = await page.evaluate(() => window.__rt.game.player.held?.item?.item ?? null);
  check(held === 'nd_nozzle', 'the nozzle is in the hands');
  await look([-1.6, -7.4], [-2.2, -2.0], -0.18);
  await shot('31_the_nozzle_in_the_hand.png');
  // to the pickup's filler: it goes in (the pump set to the fuel the pickup burns)
  const burns = await page.evaluate(() => window.__rt.game.vehicles[0].sys.derived.engine?.engine?.fuel ?? 'petrol');
  await H('nd-fuel', 'setPump', pump.site, pump.litres, burns);
  pump.fuel = burns;
  const before = await page.evaluate(() => window.__rt.filler(0));
  console.log('tank before', JSON.stringify(before));
  // (stand where the filler is looked at, as with empty hands: the mark of a held nozzle is its own)
  await page.evaluate(() => {
    const g = window.__rt.game;
    const v = g.vehicles[0];
    const m = new (v.view.model.position.constructor)();
    const n = m.clone();
    v.view.fillerMouth('fuel', m, n);
    const o = g.core.origin;
    const px = m.x + o.x + n.x * 0.9, pz = m.z + o.z + n.z * 0.9;
    g.player.walker.place(px, pz, 0, 0);
    g.simulate(0.05);
    ({ yaw: g.input.lookYaw, pitch: g.input.lookPitch } = g.player.walker.lookAt(m.x + o.x, m.y + o.y, m.z + o.z));
  });
  // (kept looking at it while one settles where one stands: the walker is eased off the vehicle's side)
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => {
      const g = window.__rt.game;
      const v = g.vehicles[0];
      const m = new (v.view.model.position.constructor)();
      const n = m.clone();
      v.view.fillerMouth('fuel', m, n);
      const o = g.core.origin;
      ({ yaw: g.input.lookYaw, pitch: g.input.lookPitch } = g.player.walker.lookAt(m.x + o.x, m.y + o.y, m.z + o.z));
      g.simulate(1 / 30);
    });
  }
  st = await H('nd-fuel', 'state');
  console.log('state', JSON.stringify(st));
  check(!!st.into && st.into.startsWith('filler:') && st.pinned, 'held to the filler, it went in');
  await shot('32_the_nozzle_in_the_filler.png');
  const run = await page.evaluate(() => window.__rt.rightFor(4));
  await step(2);
  const after = await page.evaluate(() => window.__rt.filler(0));
  const pumps2 = await H('nd-fuel', 'pumps');
  st = await H('nd-fuel', 'state');
  const ran = Object.values(after.fuel ?? {}).reduce((a, b) => a + b, 0) - Object.values(before.fuel ?? {}).reduce((a, b) => a + b, 0);
  console.log('tank after', JSON.stringify(after), 'ran', ran.toFixed(2), 'pump', pumps2[0].litres, 'given', st.given);
  check(Math.abs(ran - Math.min(8, pump.litres)) < 0.25, 'four seconds of the right button ran 8 L (2 L/s)');
  check(Math.abs(pump.litres - pumps2[0].litres - ran) < 0.05, 'what ran came out of the pump');
  await shot('33_filled.png', JSON.stringify(run?.target ?? ''));
  // a jerrycan lying by the island, if there is one
  const can = await page.evaluate(({ pump }) => {
    const cans = window.__rt.game.loose.list.filter((x) => x.tool?.kind === 'jerrycan' && !x.riding).sort((a, b) => Math.hypot(a.x - pump.x, a.z - pump.z) - Math.hypot(b.x - pump.x, b.z - pump.z));
    const l = cans[0];
    return l ? { uid: l.uid, x: l.x, y: l.y, z: l.z, litres: l.tool.litres ?? 0, fuel: l.tool.fuel ?? null } : null;
  }, { pump });
  if (can) {
    const d = Math.hypot(can.x - pump.x, can.z - pump.z);
    console.log('jerrycan', JSON.stringify(can), 'from the holster', d.toFixed(2));
    if (d < 7) {
      await page.evaluate(({ x, y, z }) => window.__rt.aimPoint(x, y + 0.42, z, Math.PI * 0.75, 0.9), can);
      await step(10);
      st = await H('nd-fuel', 'state');
      console.log('state', JSON.stringify(st));
      check(!!st.into && st.into.startsWith('can:'), 'held to the jerrycan, it went in');
      await shot('34_the_nozzle_in_a_jerrycan.png');
      const room = 20 - can.litres;
      await page.evaluate(() => window.__rt.rightFor(3));
      const can2 = await page.evaluate((uid) => { const l = window.__rt.game.loose.list.find((x) => x.uid === uid); return l ? { litres: l.tool.litres ?? 0, fuel: l.tool.fuel ?? null } : null; }, can.uid);
      console.log('jerrycan after', JSON.stringify(can2));
      if (!can.fuel || can.fuel === pump.fuel || can.litres <= 0.01) check(Math.abs((can2?.litres ?? 0) - can.litres - Math.min(6, room)) < 0.25, 'three seconds ran 6 L into the can');
    }
  }
  // put down: back on its holster, nothing left lying about
  await page.evaluate(() => window.__rt.drop());
  await step(40);
  st = await H('nd-fuel', 'state');
  const lying = await page.evaluate(() => window.__rt.game.loose.list.filter((l) => l.item?.item === 'nd_nozzle').length);
  const held2 = await page.evaluate(() => window.__rt.game.player.held?.item?.item ?? null);
  check(st.out === null && lying === 0 && held2 === null, 'put down, it went back on its holster');
  // taken again and walked off: pulled back past 8 m
  await H('nd-fuel', 'take', pump.site);
  await step(2);
  await look([-3.0, -16.0], [-3.0, -20.0], 0);
  await step(6);
  st = await H('nd-fuel', 'state');
  check(st.out === null, 'walked off with it past 8 m, it went back');
  await look([-1.0, -8.6], [-3.0, -5.0], -0.25);
  await shot('35_back_on_the_pump.png');
  console.log('telemetry', JSON.stringify(await page.evaluate(() => window.__rt.game.systems.telemetry?.()['nd-fuel'] ?? null)));
  if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
} finally {
  await browser.close();
  await server.close();
}
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
