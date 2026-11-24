// ND5's commune houses and starter house in the game (docs/ND/PLAN.md): Nomad Drive's CommuneHouses-01 and
// StarterHouse — seen from the road, walked round and into, upstairs and into the attic; what they were found with.
//   SHOTS_GPU=1 node harness/shots/nd5_houses.mjs [commune|starter|both] [seed]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/nd5');
fs.mkdirSync(out, { recursive: true });
const which = process.argv[2] || 'both';
const seed = process.argv[3] || '7';
const { server, url } = await startServer();
const browser = await launchBrowser();
let fails = 0;
const check = (ok, what) => {
  console.log(ok ? 'ok  ' : 'FAIL', what);
  if (!ok) fails++;
};

// (u, v: the card's frame; y: over its floor)
const VIEWS = {
  commune: {
    open: ['DOOR_h1', 'DOOR_h2', 'DOOR_h4u'],
    views: [
      ['50_commune_from_the_road.png', [2, -19, 0], [0, 0], -0.05],
      ['51_the_yard.png', [4.0, -3.6, 0], [-5.5, 5.5], -0.12],
      ['52_the_two_storey_house.png', [11.0, 1.0, 0], [6.0, 8.3], 0.12],
      ['53_in_house_one.png', [9.75, -6.0, 0.3], [13.1, -7.6], -0.2],
      ['54_its_upper_room.png', [6.7, 7.4, 3.33], [4.2, 9.2], -0.15],
      ['55_house_two.png', [-9.0, 2.6, 0], [-13.9, 0.0], -0.02],
    ],
  },
  starter: {
    open: ['DOOR_front', 'DOOR_gar_l', 'DOOR_gar_r', 'DOOR_bed', 'DOOR_room', 'DOOR_cl0'],
    views: [
      ['60_starter_from_the_road.png', [-1, -17, 0], [-1, 0], -0.02],
      ['61_its_living_room.png', [-1.0, -2.2, 0.4], [-6.5, 0.6], -0.12],
      ['62_its_kitchen.png', [-0.6, -1.6, 0.4], [3.0, 2.0], -0.15],
      ['63_the_garage.png', [7.0, -5.6, 0.05], [7.0, 2.5], -0.12],
      ['64_upstairs_the_bedroom.png', [-3.3, 2.9, 4.01], [-7.6, -0.6], -0.2],
      ['65_the_attic.png', [3.6, 0.15, 7.15], [-6.0, 0.15], -0.12],
      ['66_the_patio_behind.png', [-1.0, 10.5, 0], [-4.5, 4.5], -0.05],
    ],
  },
};

try {
  for (const prefab of which === 'both' ? ['commune', 'starter'] : [which]) {
    const cfg = VIEWS[prefab];
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=${seed}&start=road&build=stock:pickup&nd=${prefab}&time=15.5&weather=clear`, { width: 1280, height: 720 });
    const step = (n = 6) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.simulate(1 / 30); }, n);
    const H = (sys, fn, ...a) => page.evaluate(({ sys, fn, a }) => window.__rt.game.systems.harness(sys, fn, ...a), { sys, fn, a });
    const shot = async (f) => {
      await page.evaluate(() => window.__rt.render());
      await page.screenshot({ path: path.join(out, f) });
      console.log('shot', f);
    };
    const P = (await H('nd-build', 'places')).find((p) => p.prefab === prefab);
    if (!P) throw new Error(`no ${prefab} laid`);
    console.log(prefab, JSON.stringify(P));
    const W = (u, v) => ({ x: P.x + Math.cos(P.yaw) * u - Math.sin(P.yaw) * v, z: P.z + Math.sin(P.yaw) * u + Math.cos(P.yaw) * v });
    await page.evaluate(({ x, z }) => { const g = window.__rt.game; g.teleportTo(x, z, 0, true); g.simulate(0); }, W(0, -22));
    for (let i = 0; i < 90; i++) {
      await step(4);
      const st = await page.evaluate(() => ({ pending: window.__rt.worldPending(), drawn: window.__rt.game.systems.harness('nd-build', 'drawn') }));
      if (st.pending <= 0 && st.drawn.length && st.drawn.every((d) => d.ready)) break;
    }
    await page.evaluate(() => window.__rt.game.loose.settled());
    await page.evaluate(({ x, z, yaw }) => { const g = window.__rt.game; if (g.seated) g.getOut(); window.__rt.placeVehicle(0, x, z, yaw); }, { ...W(-22, -6), yaw: P.yaw });
    await step(8);
    const things = await page.evaluate(({ x, z }) => window.__rt.game.loose.list.filter((l) => Math.hypot(l.x - x, l.z - z) < 20).map((l) => l.item?.item ?? l.tool?.kind ?? l.part?.part ?? '?'), { x: P.x, z: P.z });
    console.log('found', things.length, JSON.stringify(things));
    check(things.length >= 15, `${prefab}: furnished (${things.length} things)`);
    const doors = await H('nd-build', 'doors', P.id);
    console.log('doors', doors.length, JSON.stringify(doors.map((d) => `${d.name}${d.locked ? ':locked' : ''}${d.stuck ? ':stuck' : ''}`)));
    for (const n of cfg.open) await H('nd-build', 'door', P.id, true, n);
    await H('nd-build', 'lights', P.id, true);
    await step(6);
    for (const [f, from, to, pitch] of cfg.views) {
      const a = W(from[0], from[1]);
      const b = W(to[0], to[1]);
      await page.evaluate(({ a, b, y, pitch, fy }) => {
        const g = window.__rt.game;
        window.__rt.stand(a.x, a.z, Math.atan2(b.z - a.z, b.x - a.x), pitch);
        // (on the floor asked for: the walker's own placing finds the highest)
        if (y > 0.01) g.player.walker.y = fy + y;
        else g.player.walker.y = Math.min(g.player.walker.y, fy + 0.5);
        g.simulate(0);
      }, { a, b, y: from[2], pitch, fy: P.y });
      await step(4);
      await shot(f);
    }
    if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
