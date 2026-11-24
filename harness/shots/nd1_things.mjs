// ND1's things in the game (docs/ND/PLAN.md): the cabin's furniture from inside; the coffee machine worked through
// (its lid, a bag poured in, a mug under the spout, the switch, the coffee running in, the mug taken); the camera
// raised to the eye, a picture taken, the print coming out of its slot and developing, a second one pushing the first
// out to fall, the print picked up and looked at.
//   SHOTS_GPU=1 node harness/shots/nd1_things.mjs [seed] [hour]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/nd1');
fs.mkdirSync(out, { recursive: true });
const seed = process.argv[2] || '7';
const hour = process.argv[3] || '15.6';
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
    await step(12);
  };
  // there, the door open
  await page.evaluate(({ x, z }) => { const g = window.__rt.game; g.teleportTo(x, z, 0, true); g.simulate(0); }, W(-7, -8));
  await settle();
  await H('nd-build', 'door', P.id, true);
  // ---- the furniture
  await stand([-1.9, 0.3], [2.6, 1.0], -0.1);
  await settle();
  await shot('10_inside_kitchen.png');
  await stand([2.3, 1.2], [-1.4, -1.0], -0.12);
  await shot('11_inside_sofa_table.png');
  await stand([0.3, -0.6], [2.6, -2.2], -0.05);
  await shot('12_inside_shelf_fridge.png');
  // ---- the coffee machine (the cabin's, or one put on its worktop)
  let mc = (await H('nd-coffee', 'machines'))[0];
  if (!mc) throw new Error('no coffee machine in the cabin');
  console.log('machine', JSON.stringify(mc));
  const aimPart = async (kind, dist = 0.75) => {
    const a = await H('nd-coffee', 'partAt', mc.uid, kind);
    return page.evaluate(({ a, dist }) => window.__rt.aimPoint(a.x, a.y, a.z, a.from, dist), { a, dist });
  };
  const press = () => page.evaluate(() => window.__rt.press());
  // (its lid opens as one looks at the hopper, as Nomad Drive's does; a bag goes in with E held a second)
  await page.evaluate(() => window.__rt.hold('item:nd_coffee_pack'));
  console.log('aim hopper with bag', await aimPart('hopper'));
  await secs(0.5);
  console.log('lid open (looked at)', await H('nd-coffee', 'looked', mc.uid));
  await shot('13_coffee_lid_open.png');
  await page.evaluate(() => window.__rt.useFor(1.15));
  console.log('after the bag', JSON.stringify((await page.evaluate(() => window.__rt.game.systems.telemetry()['nd-coffee']?.own))?.machines?.[0]));
  await page.evaluate(() => window.__rt.hold('item:nd_mug'));
  console.log('aim cup with mug', await aimPart('cup'));
  await press();
  await secs(0.3);
  console.log('aim switch', await aimPart('switch'));
  await press();
  await secs(3);
  await aimPart('cup', 0.6);
  await shot('14_coffee_brewing.png');
  await secs(4.9);
  await aimPart('cup', 0.55);
  await shot('15_coffee_pouring.png');
  await secs(1.5);
  console.log('machine now', JSON.stringify(await page.evaluate(() => window.__rt.game.systems.telemetry()['nd-coffee'] ?? null)));
  await aimPart('cup', 0.55);
  await shot('16_coffee_done.png');
  await press();
  await secs(0.4);
  await shot('17_coffee_mug_in_hand.png');
  // ---- film, both of Nomad Drive's ways (E held half a second): the box in the hands on the camera lying, the camera in the hands on a box lying
  await page.evaluate(() => window.__rt.hold('item:nd_camera'));
  await stand([-1.6, -0.9], [-1.0, -1.9], -0.55);
  await page.evaluate(() => window.__rt.drop());
  await secs(0.6);
  const camLying = await page.evaluate(() => { const l = window.__rt.game.loose.list.find((x) => x.item?.item === 'nd_camera'); return l ? { x: l.x, y: l.y, z: l.z } : null; });
  await page.evaluate(() => window.__rt.hold('item:nd_film_pack'));
  console.log('aim camera with film', await page.evaluate(({ c }) => window.__rt.aimPoint(c.x, c.y + 0.07, c.z, 0.4, 0.7), { c: camLying }));
  await shot('17b_film_onto_camera.png');
  await page.evaluate(() => window.__rt.useFor(0.6));
  console.log('camera film now', await page.evaluate(() => window.__rt.game.loose.list.find((x) => x.item?.item === 'nd_camera')?.item.state?.camera?.film ?? 10));
  // ---- the camera
  await page.evaluate(() => window.__rt.hold('item:nd_camera'));
  // the other way: the camera in the hands, the box of film lying on the table
  const filmLying = await page.evaluate(() => { const l = window.__rt.game.loose.list.find((x) => x.item?.item === 'nd_film_pack'); return l ? { x: l.x, y: l.y, z: l.z } : null; });
  if (filmLying) {
    console.log('aim film with camera', await page.evaluate(({ f }) => window.__rt.aimPoint(f.x, f.y + 0.02, f.z, 0.3, 0.6), { f: filmLying }));
    await shot('17c_camera_onto_film.png');
    await page.evaluate(() => window.__rt.useFor(0.6));
    console.log('held camera film now', await page.evaluate(() => { const h = window.__rt.game.player.held; return h?.item?.state?.camera?.film ?? 10; }));
  }
  await stand([-1.6, 0.9], [2.9, 0.4], -0.04);
  await secs(0.5);
  await shot('18_camera_in_hand.png');
  await H('nd-camera', 'raise', true, 0.25);
  await secs(0.5);
  await shot('19_camera_finder.png');
  await H('nd-camera', 'shoot');
  // (the picture is cut from the next frame drawn: the game draws one each frame, the harness when asked)
  await page.evaluate(() => window.__rt.render());
  await secs(0.2);
  await H('nd-camera', 'raise', false);
  await secs(0.9);
  await shot('20_print_coming_out.png');
  await secs(5);
  await shot('21_print_developing.png');
  await secs(7);
  await shot('22_print_developed.png');
  // a second one, from the table: the first falls
  await stand([0.6, 1.6], [-1.6, 1.9], -0.1);
  await H('nd-camera', 'raise', true, 0.0);
  await secs(0.5);
  await H('nd-camera', 'shoot');
  // (the picture is cut from the next frame drawn: the game draws one each frame, the harness when asked)
  await page.evaluate(() => window.__rt.render());
  await secs(0.1);
  await H('nd-camera', 'raise', false);
  await secs(2.5);
  const prints = await H('nd-camera', 'prints');
  console.log('prints', JSON.stringify(prints));
  if (prints[0]) {
    await page.evaluate(({ p }) => window.__rt.aimPoint(p.x, p.y + 0.02, p.z, 0.3, 0.9), { p: prints[0] });
    await shot('23_print_on_floor.png');
    await page.evaluate(() => window.__rt.press());
    await secs(0.4);
    await page.evaluate(() => window.__rt.look(window.__rt.game.input.lookYaw, -0.05));
    await H('nd-camera', 'lookPhoto', true);
    await secs(0.5);
    await shot('24_print_in_hand.png');
  }
  console.log('camera', JSON.stringify(await page.evaluate(() => window.__rt.game.systems.telemetry()['nd-camera'] ?? null)));
  if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
} finally {
  await browser.close();
  await server.close();
}
