// ND4's keepsakes in the game (docs/ND/PLAN.md): two bobbleheads on the pickup's dashboard, nodding as it pulls away,
// brakes and turns; a tape put into the motorhome's deck from its seat (the lid open, the tape in, its song playing);
// a plate, a picture frame and the wall cabinet hung on the motorhome's wall; a buried chest's first opening (a
// bobblehead and a tape dealt to it); a print stuck on the cabin's chair following the chair when it is moved.
//   SHOTS_GPU=1 node harness/shots/nd4_collect.mjs [seed] [hour]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/nd4');
fs.mkdirSync(out, { recursive: true });
const seed = process.argv[2] || '7';
const hour = process.argv[3] || '15.6';
const { server, url } = await startServer();
const browser = await launchBrowser();
let page;
let errors;
const step = (n = 6) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.simulate(1 / 30); }, n);
const frames = (n) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.step(1 / 60, 1); }, n);
const H = (sys, fn, ...a) => page.evaluate(({ sys, fn, a }) => window.__rt.game.systems.harness(sys, fn, ...a), { sys, fn, a });
const shot = async (f, extra = '') => {
  await page.evaluate(() => window.__rt.render());
  await page.screenshot({ path: path.join(out, f) });
  console.log('shot', f, extra);
};
/** a picture with the camera's field narrowed to this (°): a close look without moving it */
const zoomShot = async (f, fov, extra = '') => {
  await page.evaluate((fov) => { const c = window.__rt.game.core.camera; c.userData.fov0 = c.fov; c.fov = fov; c.updateProjectionMatrix(); window.__rt.render(); }, fov);
  await page.screenshot({ path: path.join(out, f) });
  await page.evaluate(() => { const c = window.__rt.game.core.camera; c.fov = c.userData.fov0; c.updateProjectionMatrix(); });
  console.log('shot', f, extra);
};
/** the thing in the hands measured (its model in: its box known, as it is before it can be stowed) */
const measured = async () => {
  for (let i = 0; i < 60; i++) {
    const ok = await page.evaluate(() => { const g = window.__rt.game; return !!g.cargo.boxOf(g.player.held); });
    if (ok) return true;
    await frames(5);
  }
  return false;
};
/** a thing held into a zone of the first vehicle near a point of its frame, as stowing it there would */
const stowAt = (zone, x, z, yaw = 0) =>
  page.evaluate(({ zone, x, z, yaw }) => {
    const g = window.__rt.game;
    const v = g.vehicles[0];
    const p = g.player;
    const h = p.held;
    const at = g.cargo.spotIn(v, zone, h, { x, z }, yaw);
    if (!at) return null;
    g.cargo.stow(v, at.zone, at.spot, h);
    p.slots[p.sel] = null;
    return { x: +at.spot.x.toFixed(2), y: +at.spot.y.toFixed(2), z: +at.spot.z.toFixed(2) };
  }, { zone, x, z, yaw });
try {
  // ---------------------------------------------------------------- the pickup: bobbleheads on its dashboard
  ({ page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=${seed}&start=road&build=stock:pickup&time=${hour}&weather=clear`, { width: 1280, height: 720 }));
  for (let i = 0; i < 30; i++) await step(4);
  await page.evaluate(() => window.__rt.game.loose.settled());
  for (const [id, z] of [['nd_bobble_1', -0.02], ['nd_bobble_3', 0.2]]) {
    await page.evaluate((id) => window.__rt.hold(`item:${id}`), id);
    await measured();
    // (facing the driver: turned half round)
    console.log('on the dash', id, JSON.stringify(await stowAt('dash', 0.74, z, Math.PI)));
  }
  await page.evaluate(() => window.__rt.game.loose.settled());
  await page.evaluate(() => { window.__rt.setView('cockpit'); window.__rt.look(0.22, -0.3); });
  await frames(30);
  await shot('20_bobbleheads_on_the_dash.png', JSON.stringify(await H('nd-collect', 'nods')));
  await zoomShot('20b_bobbleheads_close.png', 24);
  // pulling away hard, braking, a swerve
  await page.evaluate(() => { const v = window.__rt.game.vehicles[0]; v.sim.setParkBrake(false); });
  await page.evaluate(() => window.__rt.crank(1.6));
  const drive = (s, inp) => page.evaluate(({ s, inp }) => { const g = window.__rt.game; g.scripted = inp; for (let t = 0; t < s; t += 1 / 60) g.step(1 / 60, 1); }, { s, inp });
  await drive(1.0, { steer: 0, throttle: 1, brake: 0, handbrake: 0 });
  await zoomShot('21_pulling_away.png', 24, JSON.stringify(await H('nd-collect', 'nods')) + ' kmh ' + (await page.evaluate(() => window.__rt.game.vehicles[0].sim.kmh.toFixed(1))));
  await drive(1.6, { steer: 0, throttle: 1, brake: 0, handbrake: 0 });
  await drive(0.35, { steer: 0, throttle: 0, brake: 1, handbrake: 0 });
  await zoomShot('22_braking.png', 24, JSON.stringify(await H('nd-collect', 'nods')));
  await drive(0.8, { steer: 0.8, throttle: 0.4, brake: 0, handbrake: 0 });
  await zoomShot('23_swerving.png', 24, JSON.stringify(await H('nd-collect', 'nods')));
  await page.evaluate(() => { window.__rt.game.scripted = { steer: 0, throttle: 0, brake: 1, handbrake: 1 }; });
  if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
  await page.close();

  // ---------------------------------------------------------------- the motorhome: a tape in its deck, things on its wall
  ({ page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=2&seed=7&start=road&build=stock:rv&s=300&time=${hour}&weather=clear`, { width: 1280, height: 720 }));
  for (let i = 0; i < 30; i++) await step(4);
  await page.evaluate(() => window.__rt.game.loose.settled());
  await page.evaluate(() => window.__rt.hold('item:nd_tape_08'));
  await page.evaluate(() => window.__rt.game.audio.start());
  // (from the seat beside the driver's: the radio between the two, the wheel not in the way)
  await page.evaluate(() => { const g = window.__rt.game; g.enter(g.vehicles[0], 'pass'); window.__rt.setView('cockpit'); });
  await frames(4);
  const lookAtRadio = () => page.evaluate(() => {
    const g = window.__rt.game;
    const v = g.vehicles[0];
    const m = v.view.frame.mounts.find((x) => x.cat === 'radio');
    const n = v.view.nodeOf(m.id);
    const p = n.getWorldPosition(g.core.camera.position.clone());
    const c = g.core.camera.position.clone();
    v.view.model.updateMatrixWorld(true);
    const lp = v.view.model.worldToLocal(p.clone());
    const lc = v.view.model.worldToLocal(c.clone());
    g.input.lookYaw = Math.atan2(lp.z - lc.z, lp.x - lc.x);
    g.input.lookPitch = Math.atan2(lp.y - lc.y, Math.hypot(lp.x - lc.x, lp.z - lc.z));
    g.simulate(0);
  });
  // (held on it: a seat's view turns back to the road by itself)
  const holdOnRadio = async (n) => {
    for (let k = 0; k < n; k++) {
      await lookAtRadio();
      await frames(2);
    }
  };
  await holdOnRadio(18);
  console.log('aimed', await page.evaluate(() => window.__rt.game.cockpit.aimed?.id ?? null), JSON.stringify(await H('nd-tape', 'deck')));
  await shot('24_deck_lid_open.png');
  await zoomShot('24b_deck_lid_close.png', 16);
  console.log('in', await H('nd-tape', 'insert'));
  await holdOnRadio(45);
  console.log('deck', JSON.stringify(await H('nd-tape', 'deck')), 'heard', JSON.stringify(await H('nd-tape', 'heard')));
  await shot('25_tape_playing.png');
  await zoomShot('25b_deck_with_its_tape.png', 16);
  // back into the living space: the wall behind the dinette
  await page.evaluate(() => { window.__rt.setView('cockpit'); window.__rt.look(2.7, -0.15); });
  await step(4);
  await page.keyboard.press('KeyE');
  await step(6);
  const aboard = await page.evaluate(() => !!window.__rt.game.player.aboard);
  console.log('aboard', aboard);
  // standing in the aisle, looking at a point of the frame (model space)
  const standLook = (x, z, tx, ty, tz) =>
    page.evaluate(({ x, z, tx, ty, tz }) => {
      const g = window.__rt.game;
      const ab = g.player.aboard;
      if (!ab) return null;
      ab.w.place(x, z, 0);
      const e = { x: 0, y: 0, z: 0 };
      const t = { x: 0, y: 0, z: 0 };
      ab.toWorld(ab.w.x, ab.w.floorAt(ab.w.x, ab.w.z) + 1.62, ab.w.z, { x: 0, y: 0, z: 0 }, e);
      ab.toWorld(tx, ty, tz, { x: 0, y: 0, z: 0 }, t);
      g.input.lookYaw = Math.atan2(t.z - e.z, t.x - e.x);
      g.input.lookPitch = Math.atan2(t.y - e.y, Math.hypot(t.x - e.x, t.z - e.z));
      for (let i = 0; i < 6; i++) g.simulate(1 / 30);
      const tg = g.player.target;
      return { target: tg?.kind ?? null, zone: tg?.kind === 'stow' ? tg.aim.zone.id : null, spot: tg?.kind === 'stow' ? !!tg.aim.spot : null, why: tg?.kind === 'stow' ? tg.aim.why : null };
    }, { x, z, tx, ty, tz });
  const hang = async (id, x, z, tx, ty, tz) => {
    await page.evaluate((id) => window.__rt.hold(`item:${id}`), id);
    await measured();
    const a = await standLook(x, z, tx, ty, tz);
    if (a?.target === 'stow' && a.spot) await page.evaluate(() => window.__rt.press());
    await frames(6);
    console.log('hung', id, JSON.stringify(a));
  };
  if (aboard) {
    await hang('nd_plate', -2.2, 0.35, -2.2, 1.3, 1.12);
    await hang('nd_frame', -1.6, 0.35, -1.65, 1.45, 1.12);
    await hang('nd_top_cabinet', -2.85, 0.35, -2.85, 1.35, 1.12);
    await standLook(-1.7, -0.6, -2.2, 1.45, 1.12);
    await frames(20);
    await shot('26_plate_frame_cabinet_on_the_wall.png');
  }
  if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
  await page.close();

  // ---------------------------------------------------------------- the cabin: a chest's first opening; a print on the chair, the chair moved
  ({ page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=${seed}&start=road&build=stock:pickup&nd=cabin&time=${hour}&weather=clear`, { width: 1280, height: 720 }));
  const P = (await H('nd-build', 'places')).find((p) => p.prefab === 'cabin');
  const W = (u, v) => ({ x: P.x + Math.cos(P.yaw) * u - Math.sin(P.yaw) * v, z: P.z + Math.sin(P.yaw) * u + Math.cos(P.yaw) * v });
  await page.evaluate(({ x, z }) => { const g = window.__rt.game; g.teleportTo(x, z, 0, true); g.simulate(0); }, W(-7, -8));
  for (let i = 0; i < 80; i++) {
    await step(4);
    const st = await page.evaluate(() => ({ pending: window.__rt.worldPending(), drawn: window.__rt.game.systems.harness('nd-build', 'drawn') }));
    if (st.pending <= 0 && st.drawn.length && st.drawn.every((d) => d.ready)) break;
  }
  await page.evaluate(() => window.__rt.game.loose.settled());
  await H('nd-build', 'door', P.id, true);
  // what the cabin was furnished with of ND4's: a tape (the world's next), a frame
  console.log('found', JSON.stringify(await page.evaluate(({ x, z }) => window.__rt.game.loose.list.filter((l) => l.item && /^nd_(tape|frame|plate|bobble)/.test(l.item.item) && Math.hypot(l.x - x, l.z - z) < 8).map((l) => l.item.item), { x: P.x, z: P.z })));
  // a buried chest opened the first time: a bobblehead (the world's deck) and a tape dealt to it before its own
  await page.evaluate(({ x, z }) => window.__rt.stand(x, z, 0, -0.6), W(-5.5, -6.5));
  await page.evaluate(() => window.__rt.hold('item:nd_chest_1'));
  await page.evaluate(() => window.__rt.drop());
  await frames(40);
  const ch = (await H('nd-dig', 'chests'))[0];
  if (ch) console.log('chest first opened', JSON.stringify(await H('nd-dig', 'open', ch.uid)), 'bobbleheads dealt', await H('nd-collect', 'dealt'));
  const pieces = await H('nd-home', 'pieces');
  const chair = pieces.find((p) => p.item === 'nd_chair');
  if (chair) {
    // a print stuck on the chair's back
    await page.evaluate(() => window.__rt.hold('item:nd_photo'));
    await frames(10);
    await page.evaluate(({ c }) => window.__rt.aimPoint(c.x, c.y + 0.47, c.z, 0.6, 0.8), { c: chair });
    await frames(10);
    console.log('stuck', JSON.stringify(await H('nd-camera', 'stick')));
    await frames(10);
    await page.evaluate(({ c }) => window.__rt.aimPoint(c.x, c.y + 0.7, c.z, 0.6, 2.0), { c: chair });
    await frames(6);
    await shot('27_print_on_the_chair.png', JSON.stringify(await H('nd-camera', 'stuck')));
    // the chair picked up and put down a step away: the print with it
    await page.evaluate(({ uid }) => { const g = window.__rt.game; const l = g.loose.list.find((x) => x.uid === uid); if (l) g.player.takeLoose(l); }, { uid: chair.uid });
    await frames(10);
    await page.evaluate(({ c }) => window.__rt.stand(c.x + 1.3, c.z - 0.2, Math.PI, -0.5), { c: chair });
    await page.evaluate(() => window.__rt.drop());
    await frames(40);
    const moved = await page.evaluate(() => window.__rt.game.loose.list.filter((l) => l.item?.item === 'nd_chair').map((l) => ({ x: +l.x.toFixed(2), z: +l.z.toFixed(2) })));
    console.log('chair moved', JSON.stringify(moved), 'print', JSON.stringify(await H('nd-camera', 'stuck')));
    const c2 = (await H('nd-home', 'pieces')).filter((p) => p.item === 'nd_chair').sort((a, b) => Math.hypot(a.x - chair.x - 1.3, a.z - chair.z + 0.2) - Math.hypot(b.x - chair.x - 1.3, b.z - chair.z + 0.2))[0];
    await page.evaluate(({ c }) => window.__rt.aimPoint(c.x, c.y + 0.7, c.z, 0.6, 2.0), { c: c2 });
    await frames(6);
    await shot('28_print_moved_with_the_chair.png');
  }
  if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
} finally {
  await browser.close();
  await server.close();
}
