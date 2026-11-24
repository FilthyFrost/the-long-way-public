// ND2's prints stuck (docs/ND/PLAN.md): two pictures taken in the cabin, one stuck on its wall by the door (the ghost
// first), the other on the pickup's door outside (it rides with the vehicle); what the save keeps of them.
//   SHOTS_GPU=1 node harness/shots/nd2_photos.mjs [seed] [hour]
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
  if (!P) throw new Error('no cabin laid');
  // card frame -> world (u along the road, v away from it: the Blender script's y is −v)
  const W = (u, v) => ({ x: P.x + Math.cos(P.yaw) * u - Math.sin(P.yaw) * v, z: P.z + Math.sin(P.yaw) * u + Math.cos(P.yaw) * v });
  const stand = async (from, to, pitch = 0) => {
    const a = W(from[0], -from[1]);
    const b = W(to[0], -to[1]);
    await page.evaluate(({ a, b, pitch }) => window.__rt.stand(a.x, a.z, Math.atan2(b.z - a.z, b.x - a.x), pitch), { a, b, pitch });
    await step(10);
  };
  await page.evaluate(({ x, z }) => { const g = window.__rt.game; g.teleportTo(x, z, 0, true); g.simulate(0); }, W(-7, 8));
  await settle();
  await H('nd-build', 'door', P.id, true);
  // two pictures of the kitchen corner, a few seconds apart (the first falls when the second is taken)
  await page.evaluate(() => window.__rt.hold('item:nd_camera'));
  await stand([-1.6, -0.9], [2.9, -0.4], -0.04);
  for (let k = 0; k < 2; k++) {
    await H('nd-camera', 'raise', true, 0.2);
    await secs(0.5);
    await H('nd-camera', 'shoot');
    await page.evaluate(() => window.__rt.render());
    await H('nd-camera', 'raise', false);
    await secs(k === 0 ? 3 : 13);
  }
  // the first print picked up off the floor, developed by now
  const prints = await H('nd-camera', 'prints');
  console.log('prints lying', prints.length);
  await page.evaluate(({ p }) => window.__rt.aimPoint(p.x, p.y + 0.02, p.z, 0.3, 0.8), { p: prints[0] });
  await page.evaluate(() => window.__rt.press());
  await secs(0.3);
  // to the wall beside the door, inside: the ghost, then stuck
  await stand([-1.35, -0.15], [-2.6, 0.1], 0.05);
  await secs(0.3);
  await shot('01_print_ghost_on_wall.png');
  console.log('stuck on', await H('nd-camera', 'stick'));
  await secs(0.4);
  await shot('02_print_stuck_on_wall.png');
  await stand([-0.6, -0.9], [-2.7, 0.2], -0.02);
  await shot('03_print_on_wall_from_room.png');
  // the second print (hanging from the camera: put the camera away, it falls), onto the pickup's door
  await page.evaluate(() => { const p = window.__rt.game.player; p.slots[p.sel] = null; });
  await secs(1.5);
  const p2 = (await H('nd-camera', 'prints'))[0];
  if (p2) {
    // (taken into the hands as E on it would: it fell beside the sofa, whose box is nearer the eye)
    await page.evaluate(({ uid }) => { const g = window.__rt.game; const l = g.loose.list.find((x) => x.uid === uid); if (l) g.player.takeLoose(l); }, { uid: p2.uid });
    await secs(0.3);
    const ok = await page.evaluate(() => window.__rt.aim(0, 'door_l', 0.9) || window.__rt.aim(0, 'door_fl', 0.9) || window.__rt.aim(0, 'door_r', 0.9) || window.__rt.aim(0, 'hood', 0.9));
    console.log('at the pickup', ok);
    await secs(0.3);
    await shot('04_print_ghost_on_pickup.png');
    console.log('stuck on', await H('nd-camera', 'stick'));
    await secs(0.5);
    await shot('05_print_stuck_on_pickup.png');
  }
  // what the save keeps: the wall's in this module's slice, the pickup's riding with it
  const kept = await page.evaluate(() => {
    const g = window.__rt.game;
    const slice = g.slices?.get?.('nd-camera');
    const riders = g.loose.list.filter((l) => l.item?.item === 'nd_photo' && l.riding).length;
    return { wall: window.__rt.game.systems.harness('nd-camera', 'stuck').length, riders, slice: slice ? JSON.stringify(slice.snapshot()).slice(0, 160) : 'n/a' };
  });
  console.log('kept', JSON.stringify(kept));
  if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
} finally {
  await browser.close();
  await server.close();
}
