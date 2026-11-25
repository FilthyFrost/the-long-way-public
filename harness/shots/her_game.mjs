// Her in the real game (docs/V3/plan/character-pv.md §9): in the driver's seat (first person and from behind the car),
// standing on the road beside it (first person looking down at herself, and from behind her), in the game's own
// world and light. Pictures go to loop/shots/her_game/.
//   SHOTS_GPU=1 node harness/shots/her_game.mjs [--q=extra&params] [--only a,b]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const args = process.argv.slice(2);
const extra = (args.find((a) => a.startsWith('--q=')) ?? '').slice(4);
const onlyAt = args.indexOf('--only');
const only = onlyAt >= 0 ? new Set(args[onlyAt + 1].split(',')) : null;
const outDir = path.join(ROOT, 'loop/shots/her_game');
fs.mkdirSync(outDir, { recursive: true });

const { server, url } = await startServer();
const browser = await launchBrowser();
let failed = 0;
const want = (n) => !only || only.has(n);
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&start=road&new=1&time=15.5&weather=clear&quality=high${extra ? `&${extra}` : ''}`, { width: 1280, height: 720 });
  await page.waitForFunction(() => window.__rt.game.her.ready || window.__rt.game.her.error, null, { timeout: 120000 });
  const herErr = await page.evaluate(() => window.__rt.game.her.error);
  if (herErr) throw new Error(herErr);
  const shot = async (name, fn, raw = false) => {
    if (!want(name)) return;
    await page.evaluate(fn);
    if (!raw) await page.evaluate(() => { window.__rt.simulate(1 / 30); window.__rt.render(); });
    await page.screenshot({ path: path.join(outDir, `${name}.png`) });
    console.log(name, (await page.evaluate(() => JSON.stringify(window.__rt.telemetry()))).slice(0, 160));
  };
  // in the seat: let the cloth settle where she sits
  await page.evaluate(() => { const rt = window.__rt; rt.game.viewMode = 'cockpit'; for (let i = 0; i < 60; i++) rt.simulate(1 / 60); });
  await shot('seat_first', () => { window.__rt.look(0, -0.12); });
  await shot('seat_first_down', () => { window.__rt.look(0.35, -0.55); });
  await shot('seat_chase', () => { window.__rt.setView('chase'); window.__rt.look(0, 0); });
  await shot('seat_orbit', () => { window.__rt.setOrbit(-60, 12, 4.2, 1.0); });
  // out on the road beside the car
  const where = await page.evaluate(() => {
    const g = window.__rt.game;
    const v = g.seated ?? g.vehicles[0];
    const sim = v.sim;
    const b = []; sim.basis(b);
    // two metres to the car's left, facing along it
    return { x: sim.px - b[6] * 2.4, z: sim.pz - b[8] * 2.4, h: Math.atan2(b[2], b[0]) };
  });
  await page.evaluate((w) => { const rt = window.__rt; rt.stand(w.x, w.z, w.h, 0); for (let i = 0; i < 60; i++) rt.simulate(1 / 60); }, where);
  await shot('foot_first', () => { window.__rt.game.her.thirdPerson = false; window.__rt.look(window.__rt.game.player.walker.heading, -0.15); });
  await shot('foot_first_down', () => { window.__rt.look(window.__rt.game.player.walker.heading, -0.95); });
  await shot('foot_third', () => { window.__rt.game.her.thirdPerson = true; window.__rt.look(window.__rt.game.player.walker.heading, -0.12); });
  // the camera turned round to look at her face (set after the step: the frame only draws)
  await shot('foot_face', () => {
    const rt = window.__rt, g = rt.game, w = g.player.walker, o = g.core.origin, c = g.core.camera;
    rt.simulate(1 / 30);
    const d = 2.1;
    c.position.set(w.x - o.x + Math.cos(w.heading) * d + Math.sin(w.heading) * 0.6, w.y - o.y + 1.3, w.z - o.z + Math.sin(w.heading) * d - Math.cos(w.heading) * 0.6);
    c.lookAt(w.x - o.x, w.y - o.y + 0.95, w.z - o.z);
    c.updateMatrixWorld();
    rt.render();
  }, true);
  // things in her hands, first person
  await page.evaluate(() => { window.__rt.game.her.thirdPerson = false; });
  const held = [['hold_soda', 'item:drink_soda'], ['hold_chips', 'item:food_chips'], ['hold_water', 'item:drink_water'], ['hold_jerrycan', 'tool:jerrycan'], ['hold_spray', 'tool:spray'], ['hold_scraper', 'tool:scraper'], ['hold_battery', 'battery_std'], ['hold_wheel', 'wheel_std']];
  for (const [name, id] of held) {
    if (!want(name)) continue;
    const ok = await page.evaluate((id) => { try { window.__rt.hold(id); return true; } catch (e) { return String(e); } }, id);
    if (ok !== true) { console.log(name, 'could not hold', ok); continue; }
    await shot(name, () => { const rt = window.__rt; rt.look(rt.game.player.walker.heading, -0.1); for (let i = 0; i < 30; i++) rt.simulate(1 / 60); });
  }
  if (want('drink')) {
    await page.evaluate(() => window.__rt.hold('item:drink_soda'));
    await shot('drink', () => { const rt = window.__rt; rt.look(rt.game.player.walker.heading, -0.05); rt.game.player.press(); for (let i = 0; i < 50; i++) { rt.game.player.primary = false; rt.game.player.secondary = true; rt.game.step(1 / 60, 1); } });
  }
  // dressed for the cold, the game's own way: each piece held, then put on (ModPlayer.wearClothes / wearPack)
  if (want('dressed_third') || want('dressed_first') || want('dressed_face')) {
    await page.evaluate(() => {
      const rt = window.__rt, p = rt.game.player;
      for (const id of ['wear_down', 'wear_pants_snow', 'wear_shoes', 'wear_gloves_wool', 'wear_beanie']) {
        rt.hold('item:' + id);
        const h = p.held;
        if (h && h.kind === 'item') p.wearClothes(h.item);
      }
      rt.hold('item:pack_hike');
      const h = p.held;
      if (h && h.kind === 'item') p.wearPack(h.item);
      for (let i = 0; i < 40; i++) rt.simulate(1 / 60);
    });
    await shot('dressed_third', () => { const rt = window.__rt; rt.game.her.thirdPerson = true; rt.look(rt.game.player.walker.heading, -0.12); });
    await shot('dressed_face', () => {
      const rt = window.__rt, g = rt.game, w = g.player.walker, o = g.core.origin, c = g.core.camera;
      rt.simulate(1 / 30);
      const d = 2.3;
      c.position.set(w.x - o.x + Math.cos(w.heading) * d + Math.sin(w.heading) * 0.7, w.y - o.y + 1.25, w.z - o.z + Math.sin(w.heading) * d - Math.cos(w.heading) * 0.7);
      c.lookAt(w.x - o.x, w.y - o.y + 0.9, w.z - o.z);
      c.updateMatrixWorld();
      rt.render();
    }, true);
    await shot('dressed_first', () => { const rt = window.__rt; rt.game.her.thirdPerson = false; rt.hold('item:drink_soda'); rt.look(rt.game.player.walker.heading, -0.25); });
  }
  if (errors.length) { console.log(errors.slice(0, 5).join('\n')); failed++; }
  await page.close();
} catch (e) {
  console.error(e);
  failed++;
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
