// ND3's digging in the game (docs/ND/PLAN.md): a place's buried chest found with the metal detector (beeping far,
// faster near, a steady tone over it), dug up with the shovel in four strokes (the shovel in the ground, the chest
// coming up its hole, out in a puff of dust), its padlock rattled without a key, opened with the place's key (the
// padlock falling off), its lid opened and what is in it seen lying in it (v3/nd-store: no list comes up).
//   SHOTS_GPU=1 node harness/shots/nd3_dig.mjs [seed] [hour]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/nd3');
fs.mkdirSync(out, { recursive: true });
const seed = process.argv[2] || '7';
const hour = process.argv[3] || '15.6';
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=${seed}&start=road&build=stock:pickup&nd=cabin&time=${hour}&weather=clear`, { width: 1280, height: 720 });
  const step = (n = 6) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.simulate(1 / 30); }, n);
  const frames = (n) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.step(1 / 60, 1); }, n);
  const H = (sys, fn, ...a) => page.evaluate(({ sys, fn, a }) => window.__rt.game.systems.harness(sys, fn, ...a), { sys, fn, a });
  const settle = async () => {
    for (let i = 0; i < 80; i++) {
      await step(4);
      const st = await page.evaluate(() => ({ pending: window.__rt.worldPending() }));
      if (st.pending <= 0) break;
    }
    await page.evaluate(() => window.__rt.game.loose.settled());
    await step(8);
  };
  const shot = async (f, extra = '') => {
    await page.evaluate(() => window.__rt.render());
    await page.screenshot({ path: path.join(out, f) });
    console.log('shot', f, extra);
  };
  const ground = (x, z) => page.evaluate(({ x, z }) => window.__rt.game.world.heightAt(x, z), { x, z });
  // a place with a chest: the cabin first, else along the road
  const cabin = (await H('nd-build', 'places')).find((p) => p.prefab === 'cabin');
  let T = null;
  for (let k = 0; k < 14 && !T; k++) {
    const at = k === 0 ? { x: cabin.x - 6, z: cabin.z + 6 } : await page.evaluate((k) => { const w = window.__rt.game.world; const s = 2400 + k * 700; const p = {}; w.spine.at(s, p); return { x: p.x, z: p.z }; }, k);
    await page.evaluate(({ x, z }) => { const g = window.__rt.game; g.teleportTo(x, z, 0, true); g.simulate(0); }, at);
    await settle();
    await page.evaluate(({ x, z }) => window.__rt.stand(x, z, 0, 0), at);
    await step(4);
    await H('nd-dig', 'lookNow');
    const list = (await H('nd-dig', 'treasures')).filter((t) => t.stage === 0 && !t.out);
    console.log('look', k, JSON.stringify(await H('nd-dig', 'fields')).slice(0, 300));
    if (list.length) T = list[0];
  }
  if (!T) throw new Error('no buried chest found');
  console.log('treasure', JSON.stringify(T));
  // its key, lying on the place's road side: picked up
  await page.evaluate(({ x, z }) => window.__rt.stand(x + 1.5, z + 1.5, 0, 0), { x: T.kx, z: T.kz });
  await step(10);
  await H('nd-dig', 'lookNow');
  const gotKey = await page.evaluate((id) => { const g = window.__rt.game; const l = g.loose.list.find((x) => x.item?.state?.keyOf === id); if (!l) return false; return g.player.takeLoose(l); }, T.id);
  console.log('key taken', gotKey);
  await page.evaluate(() => { const p = window.__rt.game.player; p.sel = 1 - p.sel; });
  // the detector: far, near, over it
  await page.evaluate(() => window.__rt.hold('item:nd_metal_detector'));
  const g0 = await ground(T.x, T.z);
  const from = Math.atan2(T.kz - T.z, T.kx - T.x);
  for (const [d, name] of [[12, '10_detector_far.png'], [3, '11_detector_near.png'], [1.15, '12_detector_over.png']]) {
    await page.evaluate(({ T, g0, from, d }) => window.__rt.aimPoint(T.x, g0, T.z, from, d), { T, g0, from, d });
    await page.evaluate(({ T, g0, from, d }) => { const g = window.__rt.game; const w = g.player.walker; g.input.lookYaw = Math.atan2(T.z - w.z, T.x - w.x); g.input.lookPitch = d < 2 ? -0.75 : -0.35; g.simulate(0); }, { T, g0, from, d });
    await frames(40);
    await shot(name, JSON.stringify(await H('nd-dig', 'heard')));
  }
  // the shovel: four strokes
  await page.evaluate(() => window.__rt.hold('item:nd_shovel'));
  await page.evaluate(({ T, g0, from }) => window.__rt.aimPoint(T.x, g0, T.z, from, 1.35), { T, g0, from });
  const strokeShot = async (name) => {
    await page.evaluate(() => { const g = window.__rt.game; g.player.press('mouse'); g.step(1 / 60, 1); g.player.release('mouse'); });
    await frames(7);
    if (name) await shot(name, JSON.stringify((await H('nd-dig', 'treasures')).find((t) => t.id === T.id)));
    await frames(40);
  };
  await strokeShot('13_shovel_stroke.png');
  await strokeShot('');
  await strokeShot('');
  await frames(20);
  await page.evaluate(({ T, g0, from }) => window.__rt.aimPoint(T.x, g0 + 0.1, T.z, from + 0.5, 1.9), { T, g0, from });
  await shot('14_chest_rising.png', JSON.stringify((await H('nd-dig', 'treasures')).find((t) => t.id === T.id)));
  await page.evaluate(({ T, g0, from }) => window.__rt.aimPoint(T.x, g0, T.z, from, 1.35), { T, g0, from });
  await strokeShot('');
  await frames(4);
  await page.evaluate(({ T, g0, from }) => window.__rt.aimPoint(T.x, g0 + 0.2, T.z, from + 0.5, 2.0), { T, g0, from });
  await shot('15_chest_out.png', JSON.stringify(await H('nd-dig', 'chests')));
  // the chest: locked — E rattles it; with the key, E held opens the padlock; E opens the lid
  await frames(60);
  const chest = (await H('nd-dig', 'chests'))[0];
  await page.evaluate(() => { const p = window.__rt.game.player; p.slots[p.sel] = null; });
  await page.evaluate(({ c, from }) => window.__rt.aimPoint(c.x, c.y + 0.25, c.z, from, 1.2), { c: chest, from });
  console.log('rattle', JSON.stringify(await page.evaluate(() => window.__rt.press())).slice(0, 80));
  await frames(3);
  await shot('16_locked_rattle.png');
  await page.evaluate(() => { const p = window.__rt.game.player; p.sel = 1 - p.sel; });
  console.log('held now', await page.evaluate(() => window.__rt.game.player.held?.item?.item ?? null));
  await page.evaluate(({ c, from }) => window.__rt.aimPoint(c.x, c.y + 0.25, c.z, from, 1.2), { c: chest, from });
  await page.evaluate(() => { const g = window.__rt.game; g.player.press(); for (let i = 0; i < 40; i++) { g.player.primary = true; g.step(1 / 60, 1); } g.player.release(); g.simulate(0); });
  await frames(26);
  await shot('17_unlocked_padlock_falls.png', JSON.stringify(await H('nd-dig', 'chests')));
  await frames(60);
  await page.evaluate(() => window.__rt.press());
  await frames(40);
  // (what is in it drawn lying in it once the things' models are in)
  for (let i = 0; i < 60 && !(await H('nd-store', 'views')).some((v) => v.drawn && v.things.length); i++) {
    await frames(3);
    await page.waitForTimeout(50);
  }
  await shot('18_chest_open.png', JSON.stringify(await H('nd-dig', 'chests')) + ' in it: ' + JSON.stringify((await H('nd-store', 'views')).filter((v) => v.drawn).map((v) => v.things.map((t) => t.item))) + ' list: ' + (await page.evaluate(() => !!window.__rt.game.listOpen)));
  if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
} finally {
  await browser.close();
  await server.close();
}
