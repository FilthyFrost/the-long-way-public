// Things stowed in vehicles and the backpack (src/game/modcar/cargo.ts, cargoList.ts; docs/MODCAR.md §5.6), with the
// keys as they are now (docs/V3/plan/growth.md §二, J1: the left button does, the right button uses what is in the hands,
// the wheel picks, Q puts down — looking at a vehicle, into it; R holds a thing out to place it, docs/V3/plan/prompts.md
// §四) and J6's Tab lists: a box of components held out with R into the donor pickup's bed and put in with the left
// button (aimed stowing with E went with I1: placing took its place); a jerrycan packed into the sedan with Q looking
// at its shut boot (the lid opens for it, the can lies down if it is too tall to stand); the load weighs on the
// vehicles; a backpack put on with the right button held (more hotbar slots); saved and read back (all where they
// were); the backpack taken off from Tab's 我身上 (no vehicle by); the can taken out from Tab's list (the sedan's, beside
// the hands'), the box out of the bed with the left button.
//   SHOTS_GPU=1 node harness/shots/modcar_stow.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/modcar_stow');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
const ok = (cond, why) => (cond ? console.log('ok  ', why) : fail(why));
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const ready = () => page.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 180000 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const H = (sys, fn, ...a) => page.evaluate(({ sys, fn, a }) => window.__rt.game.systems.harness(sys, fn, ...a), { sys, fn, a });
  const settle = (s = 0.4) => page.waitForTimeout(s * 1000);
  /** a key as the keyboard gives it (the game's own key table: Q, R, Tab), then a few frames */
  const key = async (code) => {
    await page.keyboard.press(code);
    await rt('simulate', 0.1);
  };
  /** the right button held so long (the game's own flag for it: a click needs the mouse captured, which a page in the harness has not) */
  const rightHold = (seconds) =>
    page.evaluate((s) => {
      const g = window.__rt.game;
      g.rightButton = true;
      for (let t = 0; t < s; t += 1 / 60) g.step(1 / 60, 1);
      g.rightButton = false;
      for (let i = 0; i < 4; i++) g.step(1 / 60, 1);
    }, seconds);
  /** the wheel turned over the view n notches (+ down the list) */
  const wheel = (n) =>
    page.evaluate((n) => {
      for (let i = 0; i < Math.abs(n); i++) window.__rt.game.core.renderer.domElement.dispatchEvent(new WheelEvent('wheel', { deltaY: n > 0 ? 100 : -100 }));
    }, n);
  /** look at the middle of a vehicle's place for things from where one stands now (the walker settles a little after it is put somewhere) */
  const lookIntoZone = (vi, zoneId) =>
    page.evaluate(
      async ({ vi, zoneId }) => {
        const g = window.__rt.game;
        const { zonesFor } = await import('/src/core/modcar/cargo.ts');
        const v = g.vehicles[vi];
        const zone = zonesFor(v.view.frame.id, v.build).find((z) => z.id === zoneId);
        v.view.model.updateMatrixWorld(true);
        const p = v.view.model.localToWorld(g.player.ray.origin.clone().set((zone.x[0] + zone.x[1]) / 2, zone.floor + 0.05, (zone.z[0] + zone.z[1]) / 2));
        const o = g.core.origin;
        const w = g.player.walker;
        ({ yaw: g.input.lookYaw, pitch: g.input.lookPitch } = w.lookAt(p.x + o.x, p.y + o.y, p.z + o.z));
        g.simulate(0);
      },
      { vi, zoneId },
    );
  /** the open list: its title, its rows (zone, name), the row picked, which of two side by side is worked */
  const list = () =>
    page.evaluate(() => {
      const g = window.__rt.game;
      const v = g.listing?.view;
      return { open: !!g.listV, title: v?.title ?? '', rows: (v?.rows ?? []).map((r) => `${r.zone}:${r.name}`), sel: g.listSel, side: g.listSide, text: document.querySelector('.mc-cargo:not(.side-l)')?.textContent ?? '' };
    });
  await page.goto(`${url}/modcar.html`, { waitUntil: 'domcontentloaded' });
  await ready();
  const frames = await page.evaluate(() => window.__rt.game.vehicles.map((v) => v.view.frame.id));
  const sd = frames.indexOf('sedan');
  const pk = frames.indexOf('pickup');
  const mass0 = { sedan: (await rt('stowed', sd)).mass, pickup: (await rt('stowed', pk)).mass };

  // the floors as drawn from above: the boot's at 0.36, the bed's at 0.69 with its wheel arches higher
  const trunk = await rt('floorOf', sd, 'trunk');
  const bed = await rt('floorOf', pk, 'bed');
  console.log('floors', JSON.stringify({ trunk: [trunk.floor, trunk.lo, trunk.hi], bed: [bed.floor, bed.lo, bed.hi] }));
  ok(trunk.floor >= 0.9 && Math.abs(trunk.lo - 0.31) <= 0.08, `the boot's floor drawn: ${(trunk.floor * 100).toFixed(0)} % of it, ${trunk.lo.toFixed(2)}–${trunk.hi.toFixed(2)} m`);
  ok(bed.floor >= 0.9 && Math.abs(bed.lo - 0.6) <= 0.08 && bed.hi >= 0.9, `the bed's floor drawn: ${(bed.floor * 100).toFixed(0)} % of it, ${bed.lo.toFixed(2)}–${bed.hi.toFixed(2)} m (its arches)`);

  // 1. a box of components into the bed, aimed: R holds it out, its ghost goes into the bed, the left button puts it there
  await rt('hold', 'item:crate_parts');
  await settle();
  await rt('aimZone', pk, 'bed', 1.2);
  await rt('simulate', 0.5);
  await lookIntoZone(pk, 'bed');
  await key('KeyR');
  await rt('simulate', 0.3);
  const aimBed = await H('nd-place', 'aim');
  console.log('held out at the bed', JSON.stringify(aimBed));
  ok(aimBed.ok && aimBed.into === 'bed', `R: held out, its ghost in the bed (${aimBed.into ?? '—'} ${aimBed.why})`);
  await rt('press');
  // (put down, the placing is over; else R takes it back into the hands)
  if (await H('nd-place', 'placing')) await key('KeyR');
  const inBed = await rt('stowed', pk);
  ok(inBed.things.some((t) => t.what === 'item:crate_parts' && t.zone === 'bed'), `the left button: the box in the bed ${JSON.stringify(inBed.things)}`);
  ok(inBed.mass > mass0.pickup + 1.5, `the pickup weighs the box (${mass0.pickup.toFixed(1)} → ${inBed.mass.toFixed(1)} kg)`);
  await page.screenshot({ path: path.join(out, 'box_in_the_bed.png') });

  // 2. the petrol can into the sedan without aiming: Q looking at its shut boot
  await rt('pickUp', 'tool:jerrycan');
  await settle();
  await rt('aim', sd, 'trunk', 1.6);
  const looked = await rt('telemetry');
  const said = await page.evaluate(() => [...document.querySelectorAll('.mc-acts *')].map((e) => e.textContent).join(' '));
  await key('KeyQ');
  await rt('simulate', 0.5);
  const inCar = await rt('stowed', sd);
  const lid = await page.evaluate((i) => window.__rt.game.vehicles[i].view.panelOpen('trunk'), sd);
  console.log('packed in', JSON.stringify({ looked: looked.target, inCar, lid }));
  ok(/收进车里/.test(said), `looking at the boot with the can: "Q 收进车里" (${said.slice(0, 60)})`);
  ok(inCar.things.some((t) => t.what === 'tool:jerrycan' && t.zone === 'trunk'), `Q: the can in the boot ${JSON.stringify(inCar.things)}`);
  ok(lid > 0, `the boot opened for the can (${lid.toFixed(2)})`);
  ok(inCar.load > 15, `the sedan's load: ${inCar.load.toFixed(1)} kg`);

  // 3. a backpack on: the right button held, three more slots
  await rt('hold', 'item:pack_std');
  await rightHold(0.7);
  const packed = await page.evaluate(() => ({ slots: window.__rt.game.player.slots.length, pack: window.__rt.game.player.pack?.item ?? null, held: window.__rt.telemetry().held }));
  ok(packed.slots === 5 && packed.pack === 'pack_std' && !packed.held, `the right button held: the backpack on, ${packed.slots} slots ${JSON.stringify(packed)}`);

  // 4. saved and read back
  await page.evaluate(() => window.__rt.game.save());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready();
  await settle(1);
  const back = { bed: await rt('stowed', pk), car: await rt('stowed', sd), slots: await page.evaluate(() => window.__rt.game.player.slots.length), pack: await page.evaluate(() => window.__rt.game.player.pack?.item ?? null) };
  console.log('read back', JSON.stringify(back));
  ok(back.bed.things.some((t) => t.what === 'item:crate_parts' && t.zone === 'bed'), 'read back: the box in the bed');
  ok(back.car.things.some((t) => t.what === 'tool:jerrycan' && t.zone === 'trunk'), 'read back: the can in the boot');
  ok(back.car.load > 15, `read back: the sedan's load weighed again (${back.car.load.toFixed(1)} kg)`);
  ok(back.slots === 5 && back.pack === 'pack_std', 'read back: the backpack on');

  // 5. the backpack off again: Tab with no vehicle by opens 我身上 (what one has on), the wheel picks the backpack, the left button takes it off into the hands
  const clear = await page.evaluate(() => {
    // (the spot of the workshop's floor furthest from every vehicle's body, a stride from its walls)
    const g = window.__rt.game;
    const inside = (x, z) => !g.garage || [-0.8, 0.8].every((dx) => [-0.8, 0.8].every((dz) => g.garage.indoors(x + dx, z + dz)));
    let best = null;
    for (let x = -20; x <= 20; x += 0.5) {
      for (let z = -20; z <= 20; z += 0.5) {
        if (!inside(x, z)) continue;
        let d = Infinity;
        for (const v of g.vehicles) d = Math.min(d, Math.hypot(v.sim.px - x, v.sim.pz - z) - v.sim.spec.body.halfLength);
        if (d > 3 && (!best || d > best.d)) best = { x, z, d };
      }
    }
    return best;
  });
  if (!clear) throw new Error('no spot of the floor 3 m from every vehicle');
  await rt('stand', clear.x, clear.z, 0, -0.3);
  await key('Tab');
  let l = await list();
  const at = l.rows.findIndex((r) => r.includes('背包'));
  console.log('Tab away from the vehicles', JSON.stringify({ spot: clear, ...l, text: undefined }));
  ok(l.open && l.title === '我身上' && at >= 0, `Tab with no vehicle within ${clear.d.toFixed(1)} m: 我身上, the backpack among ${JSON.stringify(l.rows)}`);
  await wheel(at - l.sel);
  await rt('simulate', 0.1);
  l = await list();
  ok(l.sel === at, `the wheel picks the backpack (row ${l.sel})`);
  await page.evaluate(() => window.__rt.game.takeFromList());
  await rt('simulate', 0.1);
  const off = await page.evaluate(() => ({ slots: window.__rt.game.player.slots.length, pack: window.__rt.game.player.pack?.item ?? null, held: window.__rt.game.player.slots.map((h) => (h?.kind === 'item' ? h.item.item : '')) }));
  ok(off.slots === 2 && !off.pack && off.held.includes('pack_std'), `the left button: the backpack off, into the hands ${JSON.stringify(off)}`);
  if ((await list()).open) await key('Tab');
  await rt('drop');

  // 6. the can out of the sedan from Tab's list: by the car, its list beside the hands'
  await rt('aim', sd, 'door_FR', 1.6);
  await key('Tab');
  l = await list();
  await page.screenshot({ path: path.join(out, 'list.png') });
  console.log('Tab by the sedan', JSON.stringify({ ...l, text: l.text.slice(0, 80) }));
  const can = l.rows.findIndex((r) => r.includes('油桶'));
  ok(l.open && l.side === 1 && can >= 0 && /油桶/.test(l.text), `Tab by the sedan: its list, the can in it ${JSON.stringify(l.rows)}`);
  if (can !== l.sel) await wheel(can - l.sel);
  await page.evaluate(() => window.__rt.game.takeFromList());
  await rt('simulate', 0.1);
  const took = await rt('telemetry');
  ok(took.held === 'tool:jerrycan', `the left button: the can out of the list into the hands (${took.held})`);
  ok((await rt('stowed', sd)).load < 0.1, 'the sedan no longer weighs the can');
  if ((await list()).open) await key('Tab');
  await rt('drop');

  // 7. the box out of the bed with the left button
  await rt('aimLoose', 'item:crate_parts', 1.2, 'stowed');
  const t7 = await rt('telemetry');
  await rt('press');
  await rt('simulate', 0.3);
  const got = await rt('telemetry');
  ok(got.held === 'item:crate_parts', `the left button on the box in the bed: in the hands (aimed ${t7.target}, held ${got.held})`);
  ok(!(await rt('stowed', pk)).things.length, 'the bed is empty');
  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
} catch (e) {
  fail(e.stack ?? e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `modcar_stow: ${bad} FAILED` : 'modcar_stow: ok');
process.exit(bad ? 1 : 0);
