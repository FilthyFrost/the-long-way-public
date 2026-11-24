// Milestone M2, the motorhome lived in (docs/V3/nodes/M2-rv.md), walked through in the game with the keys as they are
// now (docs/V3/plan/growth.md §二, J1: the left button does — in the seat too, on what the cockpit's mark is on; R holds a
// thing out to place it, E turns it a quarter round onto the grid while placing — docs/V3/plan/prompts.md §四):
//   1. from the driver's seat, looking back: the left button — standing behind the seats; along the aisle to the rear
//   2. out by the side door (open: "下车") and in again from outside ("进…的车厢"), the left button
//   3. things put where one aims, held out with R and put down with the left button (aimed stowing with E went with
//      I1): a television hung on the wall, a lamp on the dinette's table, E putting it on the motorhome's 10 cm grid
//   4. the appliances: the motorhome furnished; the lamp, the clock radio, the television and the record player
//      switched on with the left button (something plays, the cabin is lit); the left button held picks the clock radio
//      up (the coffee machine: harness/shots/j4_kitchen.mjs)
//   SHOTS_GPU=1 node harness/shots/m2_rv.mjs [hour]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/m2_rv');
fs.mkdirSync(out, { recursive: true });
const hour = process.argv[2] || '22.3';
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
const ok = (cond, why) => (cond ? console.log('ok  ', why) : fail(why));
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=2&seed=7&start=road&build=stock:rv&s=300&time=${hour}&weather=clear`, { width: 1280, height: 720 });
  const step = (n = 6) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.simulate(1 / 30); }, n);
  // a picture (lit: with the mark's highlight on what it is on)
  const shot = async (f, lit = false) => {
    await page.evaluate((lit) => {
      if (!lit) window.__rt.game.player.clearHighlight();
      window.__rt.render();
    }, lit);
    await page.screenshot({ path: path.join(out, f) });
  };
  const state = () =>
    page.evaluate(() => {
      const g = window.__rt.game;
      const ab = g.player.aboard;
      return { seated: !!g.seated, aboard: ab ? { x: +ab.w.x.toFixed(2), z: +ab.w.z.toFixed(2) } : null, target: g.player.target?.kind ?? null, aft: g.cockpit.aimedAft };
    });
  // standing in the living space at (x, z), looking at a point of the motorhome (frame model space)
  const standLook = (x, z, tx, ty, tz) =>
    page.evaluate(({ x, z, tx, ty, tz }) => {
      const g = window.__rt.game;
      const ab = g.player.aboard;
      ab.w.place(x, z, 0);
      const e = { x: 0, y: 0, z: 0 };
      const t = { x: 0, y: 0, z: 0 };
      ab.toWorld(ab.w.x, ab.w.floorAt(ab.w.x, ab.w.z) + 1.62, ab.w.z, { x: 0, y: 0, z: 0 }, e);
      ab.toWorld(tx, ty, tz, { x: 0, y: 0, z: 0 }, t);
      g.input.lookYaw = Math.atan2(t.z - e.z, t.x - e.x);
      g.input.lookPitch = Math.atan2(t.y - e.y, Math.hypot(t.x - e.x, t.z - e.z));
      for (let i = 0; i < 6; i++) g.simulate(1 / 30);
      const tg = g.player.target;
      return { target: tg?.kind ?? null, zone: tg?.kind === 'stow' ? tg.aim.zone.id : null, spot: tg?.kind === 'stow' ? !!tg.aim.spot : null, device: tg?.kind === 'device' ? (tg.device.loose?.item?.item ?? tg.device.id) : null };
    }, { x, z, tx, ty, tz });
  const stowed = (what) => page.evaluate((what) => window.__rt.stowed(0).things.filter((t) => t.what === what).map((t) => t.zone), what);
  const H = (fn, ...a) => page.evaluate(({ fn, a }) => window.__rt.game.systems.harness('nd-place', fn, ...a), { fn, a });
  /** a key as the keyboard gives it (the game's own key table: R, E), then a few frames */
  const key = async (code) => {
    await page.keyboard.press(code);
    await step(2);
  };
  /**
   * The left button clicked over the view: the game's own mousedown and mouseup (they want the mouse captured, as it
   * is in play: taken for the click — a page in the harness has no pointer lock)
   */
  const click = () =>
    page.evaluate(() => {
      const g = window.__rt.game;
      const c = g.core.renderer.domElement;
      const was = g.input.locked;
      g.input.locked = true;
      c.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
      g.step(1 / 60, 1);
      window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
      g.input.locked = was;
    });
  /** where the thing held out would go: into which of the motorhome's places, and how far its footprint's least edges are off the grid's 10 cm lines (m) */
  const placed = () =>
    page.evaluate(async () => {
      const g = window.__rt.game;
      const C = await import('/src/core/modcar/cargo.ts');
      const a = g.systems.harness('nd-place', 'aim');
      const fr = g.systems.harness('nd-place', 'frame');
      const box = g.cargo.boxOf(g.player.held);
      if (!a.spot || !box) return { ...a, off: null, quarter: null };
      const corners = C.footprint(box, a.spot.x, a.spot.z, a.spot.yaw);
      const off = (u) => Math.abs(u / 0.1 - Math.round(u / 0.1)) * 0.1;
      return { ...a, off: Math.max(off(Math.min(...corners.map((c) => c[0])) - fr.ox), off(Math.min(...corners.map((c) => c[1])) - fr.oz)), quarter: Math.abs(Math.sin(2 * a.spot.yaw)), grid: g.systems.harness('nd-place', 'grid') };
    });
  // F (or the right button) down for so many frames, then let go
  const holdF = (frames) =>
    page.evaluate((frames) => {
      const g = window.__rt.game;
      g.rightButton = true;
      for (let i = 0; i < frames; i++) g.step(1 / 60, 1);
      g.rightButton = false;
      for (let i = 0; i < 4; i++) g.step(1 / 60, 1);
    }, frames);
  await step(40);

  // ---- 1. back from the seat, along the aisle
  await page.evaluate(() => { window.__rt.setView('cockpit'); window.__rt.look(2.7, -0.15); });
  await step(4);
  let s = await state();
  ok(s.seated && s.aft, `looking back from the seat offers the living space (${JSON.stringify(s)})`);
  await shot('1_seat_looking_back.png');
  // (the left button, the mark on the living space behind: in the seat it does what the cockpit's mark is on)
  await click();
  await step(4);
  s = await state();
  ok(!s.seated && s.aboard && Math.abs(s.aboard.x - 0.72) < 0.05, `the left button: standing behind the seats (${JSON.stringify(s)})`);
  await shot('2_behind_the_seats.png');
  await page.evaluate(() => {
    const g = window.__rt.game;
    const ab = g.player.aboard;
    for (let t = 0; t < 2.6; t += 1 / 30) {
      ab.step(1 / 30, 1, 0, g.input.lookYaw);
      g.simulate(1 / 30);
    }
  });
  s = await state();
  ok(s.aboard && s.aboard.x < -2.4, `walked aft along the aisle to the rear (${JSON.stringify(s)})`);
  await shot('3_at_the_rear.png');

  // ---- 2. out by the side door and in again
  await page.evaluate(() => window.__rt.openPanel(0, 'door_side', true));
  await step(20);
  let a = await standLook(-0.08, 0.6, -0.08, 1.7, 1.3);
  ok(a.target === 'alight', `the open side door from inside: 下车 (${JSON.stringify(a)})`);
  await shot('4_side_door_from_inside.png', true);
  await page.evaluate(() => window.__rt.press());
  await step(10);
  s = await state();
  ok(!s.aboard && !s.seated, `the left button: out by the side door (${JSON.stringify(s)})`);
  await page.evaluate(() => { const g = window.__rt.game; g.input.lookYaw += Math.PI; g.input.lookPitch = -0.1; });
  await step(6);
  s = await state();
  ok(s.target === 'board', `the doorway from outside: in again (${JSON.stringify(s)})`);
  await shot('5_side_door_from_outside.png', true);
  await page.evaluate(() => window.__rt.press());
  await step(10);
  s = await state();
  ok(!!s.aboard, `the left button: in the living space again (${JSON.stringify(s)})`);

  // ---- 3. things put where one aims: held out with R, put down with the left button (the television's and the lamp's
  // models in first: a thing's box is measured from its model, a rough one standing in until it has come)
  await page.evaluate(async () => {
    const items = await import('/src/core/modcar/items.ts');
    for (const id of ['junk_tv', 'junk_lamp']) await window.__rt.game.cargo.measured({ kind: 'item', item: items.newItem(id) });
  });
  // (the left wall between the dinette's window and the galley's lockers: held out, the television's own box must
  // clear the table, the seat backs and oneself — from where one stands, where on the wall one looks decides that)
  let p = null;
  await page.evaluate(() => window.__rt.hold('item:junk_tv'));
  await step(3);
  await key('KeyR');
  found: for (const [sx, sz] of [[0.1, 0.3], [-0.6, 0.3], [-0.6, 0.0], [0.1, 0.0]]) {
    for (const [tx, ty, tz] of [[-0.6, 1.5, -1.08], [-0.55, 1.7, -1.08], [-0.65, 1.35, -1.08], [-0.6, 1.9, -1.08]]) {
      await standLook(sx, sz, tx, ty, tz);
      p = await placed();
      if (p.into === 'wall' && p.ok) break found;
    }
  }
  ok(p.into === 'wall' && p.ok, `R: a television held out at the wall over the table (${JSON.stringify(p)})`);
  await shot('6_tv_aimed_at_wall.png', true);
  await page.evaluate(() => window.__rt.press());
  await step(6);
  ok((await stowed('item:junk_tv')).includes('wall'), 'the left button: the television hangs on the wall');
  if (await H('placing')) await key('KeyR');
  await page.evaluate(() => window.__rt.hold('item:junk_lamp'));
  await step(3);
  await key('KeyR');
  // (a lamp half a metre long with its arm out, on a table 42 cm across and 67 long: where on it one looks, and which way
  // it is turned, decide whether it goes — on the grid its edges go to the nearest 10 cm line, a few centimetres either way)
  let first = null;
  found: for (const tz of [-0.7, -0.78, -0.62, -0.86]) {
    await standLook(0.1, 0.0, 0.38, 1.59, tz);
    first ??= await placed();
    // E: a quarter round onto the grid, its footprint's edges on the motorhome's 10 cm lines (it was the aimed spot's
    // own 10 cm grid); turned across the table it does not fit, so on round to the next quarter that does
    for (let k = 0; k < 4; k++) {
      await key('KeyE');
      await step(12);
      p = await placed();
      if (p.ok) break found;
    }
  }
  ok(first.into === 'table', `R: a lamp held out at the dinette's table (${JSON.stringify(first)})`);
  ok(p.into === 'table' && p.ok && p.grid && p.off < 0.002 && p.quarter < 1e-3, `E: onto the motorhome's grid, the lamp's edges ${p.off === null ? '—' : (p.off * 1000).toFixed(1)} mm off its 10 cm lines, turned on a square`);
  await page.evaluate(() => window.__rt.press());
  await step(6);
  ok((await stowed('item:junk_lamp')).includes('table'), 'the left button: the lamp stands on the table');
  if (await H('placing')) await key('KeyR');
  await shot('7_lamp_on_table.png');

  // ---- 4. the appliances (what was put in by hand taken out again first: the motorhome furnished as the tab furnishes it)
  await page.evaluate(() => {
    const g = window.__rt.game;
    for (const l of g.loose.list.filter((x) => x.riding?.on === g.vehicles[0] && x.item)) g.loose.remove(l);
    g.cargoChanged(g.vehicles[0]);
  });
  const n = await page.evaluate(async () => {
    const m = await import('/src/game/modcar/v3/appliances/devTab.ts');
    const g = window.__rt.game;
    return m.furnish(g, g.vehicles[0]);
  });
  ok(n >= 7, `the developer tab furnishes the motorhome (${n} things)`);
  for (let i = 0; i < 10; i++) {
    await step(10);
    await page.waitForTimeout(100);
  }
  const pos = await page.evaluate(() => {
    const g = window.__rt.game;
    const v = g.vehicles[0];
    const sys = g.systems.get('appliances');
    v.view.model.updateMatrixWorld(true);
    const inv = v.view.model.matrixWorld.clone().invert();
    const o = g.core.origin;
    // (the furnished ones: the last of each kind)
    const out = {};
    for (const u of sys.all) {
      const q = new v.view.model.position.constructor(u.loose.x - o.x, u.loose.y - o.y, u.loose.z - o.z).applyMatrix4(inv);
      out[u.item.item] = { x: q.x, y: q.y, z: q.z, uid: u.loose.uid };
    }
    return out;
  });
  const appOn = (id) => page.evaluate((uid) => window.__rt.game.loose.list.find((l) => l.uid === uid)?.item?.state?.app?.on === true, pos[id]?.uid);
  const pressOn = async (id, from, dy) => {
    const p = pos[id];
    if (!p) return fail(`no ${id} in the motorhome`);
    const r = await standLook(from[0], from[1], p.x, p.y + dy, p.z);
    await page.evaluate(() => window.__rt.press());
    await step(4);
    ok(r.device === id && (await appOn(id)), `the left button on the ${id}: switched on (${JSON.stringify(r)})`);
  };
  await pressOn('junk_lamp', [0.3, 0.3], 0.3);
  await pressOn('junk_clockradio', [-1.2, -0.15], 0.05);
  await pressOn('junk_tv', [0.2, 0.45], 0.25);
  await pressOn('junk_record', [0.5, 0.3], 0.12);
  await step(30);
  const tel = await page.evaluate(() => window.__rt.game.systems.get('appliances').telemetry());
  ok(tel.playing.length >= 3, `the radio, the television and the record play (${JSON.stringify(tel.playing)})`);
  const lit = await page.evaluate(() => {
    const v = window.__rt.game.vehicles[0];
    const c = v.view.mats.lookOf('merged') ?? v.view.mats.lookOf('body');
    const u = c?.material?.('paint')?.uniforms?.uCabinLamp?.value;
    return u ? u.r + u.g + u.b : -1;
  });
  ok(lit > 0.1, `the motorhome's inside is lit by its lamps (${lit.toFixed(2)})`);
  await standLook(0.6, 0.3, -3.0, 1.45, -0.15);
  await shot('8_furnished_at_night.png');
  if (pos.junk_tv) {
    await standLook(0.5, pos.junk_tv.z + 0.05, pos.junk_tv.x + 0.2, pos.junk_tv.y + 0.28, pos.junk_tv.z + 0.05);
    await shot('9_tv.png');
  }
  if (pos.junk_lamp) {
    await standLook(0.2, 0.35, pos.junk_lamp.x - 0.1, pos.junk_lamp.y + 0.15, pos.junk_lamp.z + 0.2);
    await shot('10_table_lamps.png');
  }
  if (pos.junk_clockradio) {
    await standLook(pos.junk_clockradio.x, -0.2, pos.junk_clockradio.x, pos.junk_clockradio.y + 0.05, pos.junk_clockradio.z + 0.05);
    await shot('11_clock_radio.png');
  }
  // (the coffee: the coffee machine since J4, walked through in harness/shots/j4_kitchen.mjs)
  let hand;
  // the left button held on the clock radio: picked up (docs/V3/plan/growth.md J1)
  const cr = pos.junk_clockradio;
  await standLook(-1.2, -0.15, cr.x, cr.y + 0.05, cr.z);
  await page.evaluate(() => { const g = window.__rt.game; g.player.press('mouse'); g.leftDown = true; });
  await step(60);
  await page.evaluate(() => { const g = window.__rt.game; g.player.release('mouse'); g.leftDown = false; });
  await step(4);
  hand = await page.evaluate(() => { const h = window.__rt.game.player.held; return h?.kind === 'item' ? h.item.item : null; });
  ok(hand === 'junk_clockradio', `the left button held: the clock radio picked up (${hand})`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `${bad} FAILED` : 'all passed');
process.exit(bad ? 1 : 0);
