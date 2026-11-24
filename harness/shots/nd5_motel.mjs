// ND5's motel in the game (docs/ND/PLAN.md): Nomad Drive's Motel — eight rooms in an L round a yard, the reception
// with its lockers, the sign by the road — seen from the road, walked along, into a room, into the reception, and at
// night with its lamps and its neon; what it was found with, its doors as they were found.
//   SHOTS_GPU=1 node harness/shots/nd5_motel.mjs [seed]
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
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=${seed}&start=road&build=stock:pickup&nd=motel&time=15.5&weather=clear`, { width: 1280, height: 720 });
  const step = (n = 6) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.simulate(1 / 30); }, n);
  const H = (sys, fn, ...a) => page.evaluate(({ sys, fn, a }) => window.__rt.game.systems.harness(sys, fn, ...a), { sys, fn, a });
  const shot = async (f, extra = '') => {
    await page.evaluate(() => window.__rt.render());
    await page.screenshot({ path: path.join(out, f) });
    console.log('shot', f, extra);
  };
  const P = (await H('nd-build', 'places')).find((p) => p.prefab === 'motel');
  if (!P) throw new Error('no motel laid');
  console.log('motel', JSON.stringify(P));
  const W = (u, v) => ({ x: P.x + Math.cos(P.yaw) * u - Math.sin(P.yaw) * v, z: P.z + Math.sin(P.yaw) * u + Math.cos(P.yaw) * v });
  await page.evaluate(({ x, z }) => { const g = window.__rt.game; g.teleportTo(x, z, 0, true); g.simulate(0); }, W(-6, -24));
  for (let i = 0; i < 90; i++) {
    await step(4);
    const st = await page.evaluate(() => ({ pending: window.__rt.worldPending(), drawn: window.__rt.game.systems.harness('nd-build', 'drawn') }));
    if (st.pending <= 0 && st.drawn.length && st.drawn.every((d) => d.ready)) break;
  }
  await page.evaluate(() => window.__rt.game.loose.settled());
  await page.evaluate(({ x, z, yaw }) => { const g = window.__rt.game; if (g.seated) g.getOut(); window.__rt.placeVehicle(0, x, z, yaw); }, { ...W(-24, 6), yaw: P.yaw });
  await step(8);
  const look = async (from, to, pitch) => {
    const a = W(from[0], from[1]);
    const b = W(to[0], to[1]);
    await page.evaluate(({ a, b, pitch }) => window.__rt.stand(a.x, a.z, Math.atan2(b.z - a.z, b.x - a.x), pitch), { a, b, pitch });
    await step(6);
  };
  const things = await page.evaluate(({ x, z }) => window.__rt.game.loose.list.filter((l) => Math.hypot(l.x - x, l.z - z) < 22).map((l) => l.item?.item ?? l.tool?.kind ?? l.part?.part ?? '?'), { x: P.x, z: P.z });
  console.log('found', things.length, JSON.stringify(things));
  const doors = await H('nd-build', 'doors', P.id);
  console.log('doors', doors.length, 'locked', doors.filter((d) => d.locked).map((d) => d.name).join(','), 'stuck', doors.filter((d) => d.stuck).map((d) => d.name).join(','), 'open', doors.filter((d) => d.open > 0.5).map((d) => d.name).join(','));
  check(doors.length === 30, 'thirty doors: eight rooms, the store room, the office, sixteen lockers, four box doors');
  const lit = (await page.evaluate((id) => window.__rt.game.systems.harness('nd-build', 'drawn'), P.id));
  console.log('drawn', JSON.stringify(lit));
  await look([-8, -24], [0, 0], -0.05);
  await shot('40_motel_from_the_road.png');
  await look([-1.5, 3.9], [-15, 4.1], -0.08);
  await shot('41_along_the_walk.png');
  // into room 1, its light on
  await H('nd-build', 'door', P.id, true, 'DOOR_r1');
  await H('nd-build', 'lights', P.id, true);
  await step(6);
  await look([-12.6, 7.7], [-15.7, 6.6], -0.24);
  await shot('42_in_a_room.png');
  await look([-12.95, 8.95], [-15.6, 9.9], -0.3);
  await shot('43_its_bathroom.png');
  // the reception: its desk, its lockers (three of them opened)
  await H('nd-build', 'door', P.id, true, 'DOOR_office');
  await step(4);
  await look([11.7, -8.6], [14.5, -7.2], -0.18);
  await shot('44_the_reception.png');
  const inLockers = async () => page.evaluate(({ P }) => {
    const c = Math.cos(P.yaw), s = Math.sin(P.yaw);
    return window.__rt.game.loose.list.filter((l) => {
      const dx = l.x - P.x, dz = l.z - P.z;
      const u = c * dx + s * dz, v = -s * dx + c * dz;
      return u > 11.2 && u < 15.6 && v > -4.7 && v < -4.1;
    }).map((l) => {
      const dx = l.x - P.x, dz = l.z - P.z;
      const u = c * dx + s * dz;
      const i = Math.floor((u - 11.3) / 0.38);
      const door = [0, 2, 3, 6, 8, 10].includes(i) ? 'DOOR_lk' + i : 'DOOR_lk' + i + (l.y - P.y < 0.98 ? 'a' : 'b');
      return { what: l.item?.item ?? '?', door, shut: !!l.shut };
    });
  }, { P });
  await step(12);
  const shut0 = await inLockers();
  console.log('in the lockers (shut)', JSON.stringify(shut0));
  const openNow = async () => new Set((await H('nd-build', 'doors', P.id)).filter((d) => d.open > 0.35).map((d) => d.name));
  let open = await openNow();
  check(shut0.length > 0 && shut0.every((x) => x.shut === !open.has(x.door)), 'what is in a shut locker is out of reach, in an open one not');
  for (const n of ['DOOR_lk0', 'DOOR_lk1a', 'DOOR_lk1b', 'DOOR_lk2', 'DOOR_lk3']) await H('nd-build', 'door', P.id, true, n);
  await step(12);
  const shut1 = await inLockers();
  console.log('in the lockers (five doors open)', JSON.stringify(shut1));
  open = await openNow();
  check(shut1.some((x) => !x.shut) && shut1.every((x) => x.shut === !open.has(x.door)), 'opened, what is in a locker can be taken');
  await look([12.9, -6.3], [12.6, -4.4], -0.12);
  await shot('45_the_lockers.png');
  // at night: the porch lamps, the office's, the sign's neon
  await H('nd-build', 'lights', P.id, false);
  await page.evaluate(() => window.__rt.setHour(21.5));
  await step(150);
  await look([-8, -25], [-2, 0], -0.04);
  await shot('46_at_night.png');
  await look([4.5, 3.7], [-10, 4.3], -0.08);
  await shot('47_the_walk_at_night.png');
  await look([-9.5, -15.5], [-14.9, -9.1], 0.38);
  await shot('48_the_sign_at_night.png');
  if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
} finally {
  await browser.close();
  await server.close();
}
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
