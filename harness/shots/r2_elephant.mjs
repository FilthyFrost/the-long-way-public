// R2 (docs/V3/plan/rv.md), in the game: the Old Elephant and its electricity. A flat-fronted motorhome by the road, found
// with its range — four electric hobs on the galley's worktop (its fittings); in by the entry door, the room from the
// cab to the bed; a fridge in the niche behind the passenger's seat with milk in it (kept cold: a quarter the rate); a pan
// with an egg on a hob, lit, a desk lamp on the table on — drawing on the house battery (生活电瓶); run flat: the hob
// goes out, the lamp off, the fridge keeps nothing cold, 没电了 said, and the knob says 没电了; the engine started, the
// alternator charges it again and the fridge is cold again; driven round a bend with the hobs and the fridge in place;
// stopped, the bed across the back slept in; its ladder fitted up its side.
//   SHOTS_GPU=1 node harness/shots/r2_elephant.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/r2');
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
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:elephant&s=900&time=10&weather=clear`, { width: 1280, height: 720 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const words = () => page.evaluate(() => document.body.innerText);
  const shot = async (f) => {
    await page.evaluate(async () => {
      const g = window.__rt.game;
      g.ui.showHelp(false);
      for (let i = 0; i < 300 && (g.worldView?.pending ?? 0) > 0; i++) {
        const v = g.seated;
        g.worldView.update(v ? v.sim.px : g.player.walker.x, v ? v.sim.pz : g.player.walker.z, 40);
        await new Promise((r) => setTimeout(r, 0));
      }
      for (let i = 0; i < 2; i++) window.__rt.render();
    });
    await page.screenshot({ path: path.join(out, f) });
  };
  // parked: the engine off, the handbrake on, out of it
  const vi = await page.evaluate(() => {
    const g = window.__rt.game;
    const v = g.vehicles.find((x) => x.build.frame === 'elephant');
    v.sim.setParkBrake(true);
    v.sys.stop('');
    g.simulate(1.5);
    g.getOut();
    g.simulate(0.5);
    window.__v = v;
    return g.vehicles.indexOf(v);
  });
  ok(vi >= 0, `an Old Elephant on the road (vehicle ${vi})`);
  await rt('setOrbit', 32, 9, 15.5, 1.5, vi);
  await shot('01_elephant.png');
  // empty shell (§十九 step 7): stowFittings leaves nothing in it; fit out two kitchen stands with four electric hobs
  const fit = await page.evaluate(async () => {
    const g = window.__rt.game;
    const v = window.__v;
    const It = await import('/src/core/modcar/items.ts');
    await g.stowFittings(v);
    g.simulate(0.2);
    const stockRiders = g.loose.ridersOf(v).length;
    const put = async (id, zone, near, yaw) => {
      const held = { kind: 'item', item: It.newItem(id) };
      await g.cargo.measured(held);
      const at = g.cargo.spotIn(v, zone, held, near, yaw, 0);
      if (!at) return null;
      return g.cargo.stow(v, at.zone, at.spot, held);
    };
    const stands = [];
    const hobs = [];
    for (const sx0 of [-1.7, -3.15]) {
      const st = await put('nd_kitchen_stand', 'cabin', { x: sx0, z: -0.82 }, Math.PI / 2);
      if (!st) continue;
      stands.push(st);
      const sx = st.riding.pos.x + v.sys.derived.cg.x;
      const sz = st.riding.pos.z + v.sys.derived.cg.z;
      for (const dx of [-0.35, 0.35]) {
        const h = await put('kit_hob', 'cabin', { x: sx + dx, z: sz }, -Math.PI / 2);
        if (h) hobs.push(h);
      }
    }
    g.simulate(0.2);
    window.__hobs = hobs;
    const yawOf = (l) => +new (window.__rt.game.core.scene.rotation.constructor)().setFromQuaternion(l.riding.rot, 'YXZ').y.toFixed(3);
    return { stockRiders, stands: stands.length, n: hobs.length, zones: [...new Set(hobs.map((l) => l.stow))], y: hobs.map((l) => +(l.riding.pos.y + v.sys.derived.cg.y).toFixed(2)), x: hobs.map((l) => +(l.riding.pos.x + v.sys.derived.cg.x).toFixed(2)), yaw: hobs.map(yawOf) };
  });
  ok(fit.stockRiders === 0 && fit.stands === 2 && fit.n === 4 && fit.zones.length === 1 && fit.zones[0] === 'cabin' && fit.y.every((y) => y > 1.5) && fit.yaw.every((y) => Math.abs(Math.abs(y) - Math.PI / 2) < 0.02), `found empty; two kitchen stands with four hobs fitted along the left wall (${JSON.stringify(fit)})`);
  // in by the entry door
  const board = await page.evaluate(async () => {
    const g = window.__rt.game;
    const v = window.__v;
    const A = await import('/src/core/modcar/aboard.ts');
    v.view.setPanelOpen('door_side', true);
    g.simulate(0.8);
    g.board(v, A.aboardOf('elephant').doors[0]);
    g.simulate(0.3);
    return { aboard: g.player.aboard?.v === v, eyeY: +g.player.walker.eye().y.toFixed(2) };
  });
  ok(board.aboard, `in by the entry door, standing in the room (${JSON.stringify(board)})`);
  // a fridge on the front floor with milk in it; a dinner table with a desk lamp on it; a camp cot in the back
  const things = await page.evaluate(async () => {
    const g = window.__rt.game;
    const v = window.__v;
    const It = await import('/src/core/modcar/items.ts');
    const T = await import('/src/game/modcar/itemTime.ts');
    const put = async (id, zone, near, yaw = 0) => {
      const held = { kind: 'item', item: It.newItem(id) };
      await g.cargo.measured(held);
      const at = g.cargo.spotIn(v, zone, held, near, yaw, 0);
      if (!at) return null;
      return g.cargo.stow(v, at.zone, at.spot, held);
    };
    const fridge = await put('nd_fridge', 'fore', { x: 1.6, z: 0.78 }, Math.PI / 2);
    const table = await put('nd_dinner_table', 'fore', { x: 0.6, z: -0.7 }, 0);
    let lamp = null;
    if (table) {
      const tx = table.riding.pos.x + v.sys.derived.cg.x;
      const tz = table.riding.pos.z + v.sys.derived.cg.z;
      lamp = await put('junk_lamp', 'fore', { x: tx, z: tz }, 0);
    }
    const cot = await put('nd_cot', 'cabin', { x: -2.4, z: 0.65 }, Math.PI / 2);
    if (!fridge || !table || !lamp || !cot) return { fridge: !!fridge, table: !!table, lamp: !!lamp, cot: !!cot };
    It.putInside(fridge.item, It.newItem('ing_milk'), T.itemNow());
    window.__fridge = fridge;
    window.__lamp = lamp;
    window.__cot = cot;
    g.simulate(0.3);
    return { fridge: fridge.stow, lamp: lamp.stow, lampY: +(lamp.riding.pos.y + v.sys.derived.cg.y).toFixed(2), tableY: +(table.riding.pos.y + v.sys.derived.cg.y).toFixed(2), milkRate: fridge.item.inside[0].fk, cot: cot.stow };
  });
  ok(things.fridge === 'fore' && things.lamp === 'fore' && things.lampY > things.tableY + 0.6 && things.milkRate === 0.25 && things.cot === 'cabin', `a fridge on the floor, milk at a quarter the rate; a table with a lamp on it; a cot in the back (${JSON.stringify(things)})`);
  // (where one stands in the room and which way one looks: model space x, z; yaw 0 forward, + to the right; pitch)
  const standIn = (x, z, yaw, pitch) =>
    page.evaluate(({ x, z, yaw, pitch }) => {
      const g = window.__rt.game;
      const ab = g.player.aboard;
      ab.w.place(x, z, yaw);
      g.input.lookYaw = ab.heading() + yaw;
      g.input.lookPitch = pitch;
      g.simulate(0.15);
    }, { x, z, yaw, pitch });
  // looking back down the room from behind the seats (the eye's view): the dinette and the galley on the left, the
  // fridge's niche, the door and the sofa on the right, the bed across the back
  await rt('setView', 'cockpit');
  await standIn(2.3, 0.0, Math.PI, -0.1);
  await shot('02_room.png');
  // a pan with an egg on the first hob, lit high; the lamp on: the house battery draws
  const lit = await page.evaluate(async () => {
    const g = window.__rt.game;
    const v = window.__v;
    const K = await import('/src/core/v3/kitchen/kit.ts');
    const It = await import('/src/core/modcar/items.ts');
    const Kit = await import('/src/game/modcar/v3/kitchen/index.ts');
    const Ap = await import('/src/core/v3/appliances/appliances.ts');
    const hob = window.__hobs[0];
    K.putVessel(hob.item, It.newItem('kit_pan'));
    K.addPortion(hob.item, { id: 'egg' });
    g.loose.touch(hob);
    g.simulate(0.2);
    const u = Kit.kitchen.unitOf(hob);
    Kit.kitchen.flame(u, 2);
    Ap.toggle(window.__lamp.item, true);
    g.loose.touch(window.__lamp);
    const c0 = v.build.parts.houseBattery.fluids.charge;
    g.simulate(3.0);
    const P = await import('/src/game/modcar/v3/power/index.ts');
    const tel = P.power.telemetry().vehicles.find((x) => x.frame === 'elephant');
    return { fire: K.fireOf(hob.item), watts: tel?.watts, c0: +c0.toFixed(5), c1: +v.build.parts.houseBattery.fluids.charge.toFixed(5), done: +(K.potOf(hob.item)?.done ?? 0).toFixed(3) };
  });
  ok(lit.fire === 2 && lit.watts === 1000 + 25 + 60 && lit.c1 < lit.c0 && lit.done > 0, `a pan with an egg on a hob, lit, the lamp on: the hob, the lamp and the fridge draw ${lit.watts} W on the house battery (${lit.c0} → ${lit.c1}), the egg cooking (${lit.done})`);
  // the galley from the aisle: the four hobs, the pan on the glowing one (across the aisle, looking left and down)
  const hx = await page.evaluate(() => +window.__hobs[0].riding.pos.x.toFixed(2));
  await standIn(-1.1, 0.35, -Math.PI / 2 - 0.55, -0.62);
  await shot('03_galley_hob.png');
  void hx;
  let w = await words();
  // the card of the hob looked at: its power
  const card = await page.evaluate(async () => {
    const I = await import('/src/game/modcar/itemInfo.ts');
    const T = await import('/src/game/modcar/itemTime.ts');
    const c = I.itemCard(window.__hobs[0].item, T.itemNow());
    return c.bars.map((b) => `${b.label} ${b.text}`).join(' · ');
  });
  ok(/电 还剩 \d+%/.test(card), `the hob's card: what there is to draw on (${card})`);
  // run flat: everything in it stops, 没电了 said
  const flat = await page.evaluate(async () => {
    const g = window.__rt.game;
    const v = window.__v;
    const K = await import('/src/core/v3/kitchen/kit.ts');
    const Ap = await import('/src/core/v3/appliances/appliances.ts');
    v.build.parts.houseBattery.fluids.charge = 0.00001;
    g.simulate(1.0);
    return {
      fire: K.fireOf(window.__hobs[0].item),
      lamp: !!Ap.appOf(window.__lamp.item).on,
      unpowered: !!window.__fridge.item.state?.unpowered,
      milkRate: window.__fridge.item.inside[0].fk ?? 1,
      said: document.body.innerText.includes('没电了'),
    };
  });
  ok(flat.fire === 0 && !flat.lamp && flat.unpowered && flat.milkRate === 1 && flat.said, `run flat: the hob out, the lamp off, the fridge keeping nothing cold (milk at the open air's rate), 没电了 said (${JSON.stringify(flat)})`);
  // the knob pressed again: 没电了
  const again = await page.evaluate(async () => {
    const g = window.__rt.game;
    const Kit = await import('/src/game/modcar/v3/kitchen/index.ts');
    const K = await import('/src/core/v3/kitchen/kit.ts');
    g.simulate(4.0);
    const u = Kit.kitchen.unitOf(window.__hobs[0]);
    const knob = u.devices.find((d) => d.part === 'knob');
    const why = knob.why?.zh ?? null;
    Kit.kitchen.flame(u, 2);
    g.simulate(0.1);
    return { why, fire: K.fireOf(window.__hobs[0].item), said: document.body.innerText.includes('没电了') };
  });
  ok(again.why === '没电了' && again.fire === 0 && again.said, `the knob turned again: 没电了 (${JSON.stringify(again)})`);
  await shot('04_flat.png');
  // the engine started: the alternator fills the house battery, the fridge cold again
  const charged = await page.evaluate(async () => {
    const g = window.__rt.game;
    const v = window.__v;
    g.enter(v);
    g.simulate(0.2);
    v.sys.startNow();
    const c0 = v.build.parts.houseBattery.fluids.charge;
    g.simulate(40);
    return { running: v.sys.running, c0: +c0.toFixed(4), c1: +v.build.parts.houseBattery.fluids.charge.toFixed(4), unpowered: !!window.__fridge.item.state?.unpowered, milkRate: window.__fridge.item.inside[0].fk ?? 1 };
  });
  ok(charged.running && charged.c1 > charged.c0 + 0.03 && !charged.unpowered && charged.milkRate === 0.25, `the engine running 40 s: the house battery charging (${charged.c0} → ${charged.c1}), the fridge cold again (${JSON.stringify(charged)})`);
  // driven 12 s round a bend: the hobs on the worktop, the fridge in its niche
  // (the entry door shut, off; a shot on the way)
  const drive = (from, to) =>
    page.evaluate(
      ({ from, to }) => {
        const g = window.__rt.game;
        const v = window.__v;
        for (let i = from; i < to; i++) {
          const steer = i > 60 * 4 && i < 60 * 8 ? 0.05 : 0;
          g.scripted = { steer, throttle: i < 60 * 10 ? 0.5 : 0, brake: i >= 60 * 10 ? 0.7 : 0, handbrake: 0 };
          g.step(1 / 60, 1);
        }
        g.scripted = null;
        return +v.sim.kmh.toFixed(1);
      },
      { from, to },
    );
  await page.evaluate(() => {
    const g = window.__rt.game;
    const v = window.__v;
    v.view.setPanelOpen('door_side', false);
    v.sim.setParkBrake(false);
    window.__p0 = [...window.__hobs, window.__fridge].map((l) => l.riding.pos.clone());
    g.simulate(0.2);
  });
  const mid = await drive(0, 60 * 7);
  await rt('setOrbit', 140, 12, 15.5, 1.5, vi);
  await shot('05_driving.png');
  await rt('setView', 'cockpit');
  await drive(60 * 7, 60 * 12);
  const run = await page.evaluate(() => {
    const g = window.__rt.game;
    const v = window.__v;
    const watch = [...window.__hobs, window.__fridge];
    const moved = Math.max(...watch.map((l, k) => l.riding.pos.distanceTo(window.__p0[k])));
    return { kmh: +v.sim.kmh.toFixed(1), moved: +moved.toFixed(4), rides: watch.every((l) => g.loose.ridersOf(v).includes(l)) };
  });
  ok(run.rides && run.moved < 0.02 && mid > 15, `driven 12 s round a bend (${mid} km/h at 7 s): the four hobs on the worktop, the fridge in its niche (${JSON.stringify(run)})`);
  // the driver's view
  await rt('setView', 'cockpit');
  await page.evaluate(() => {
    const g = window.__rt.game;
    g.input.lookYaw = 0;
    g.input.lookPitch = -0.05;
    g.simulate(0.1);
  });
  await shot('06_driver.png');
  // stopped, back into the room from the seat; tired, at the bed: 长按 睡觉
  const back = await page.evaluate(() => {
    const g = window.__rt.game;
    const v = window.__v;
    // (stopped already: the handbrake on — held brake at a standstill would back it up)
    for (let i = 0; i < 60 * 2; i++) {
      g.scripted = { steer: 0, throttle: 0, brake: 0, handbrake: 1 };
      g.step(1 / 60, 1);
    }
    g.scripted = null;
    v.sim.setParkBrake(true);
    v.sys.stop('');
    g.simulate(1.0);
    g.goAft(v);
    g.simulate(0.3);
    g.body.energy = 10;
    g.simulate(0.1);
    return { aboard: g.player.aboard?.v === v, kmh: +v.sim.kmh.toFixed(2) };
  });
  ok(back.aboard, `stopped, back from the seat into the room (${JSON.stringify(back)})`);
  // Sleep removed (2026-11-27): verify placed camp cot is aimed cleanly with no sleep prompt
  await page.evaluate(() => {
    const g = window.__rt.game;
    const ab = g.player.aboard;
    const cot = window.__cot;
    ab.w.place(-2.2, -0.1, 0);
    g.simulate(0);
    ({ yaw: g.input.lookYaw, pitch: g.input.lookPitch } = g.player.walker.lookAt(cot.x, cot.y + 0.38, cot.z));
    g.simulate(0.2);
  });
  w = await words();
  ok(!/睡觉/.test(w), `placed camp cot inside Old Elephant has no sleep prompt`);
  await shot('07_bed.png');
  // its ladder up its left side, behind the galley's window
  await page.evaluate(async () => {
    const g = window.__rt.game;
    const A = await import('/src/core/modcar/aboard.ts');
    g.alight(window.__v, A.aboardOf('elephant').doors[0]);
    g.simulate(0.3);
  });
  await rt('fit', vi, 'ladder', 'ladder');
  const lad = await page.evaluate(async () => {
    const v = window.__v;
    await v.view.settled();
    window.__rt.game.simulate(0.5);
    return { ladder: v.build.parts.ladder?.part ?? null };
  });
  ok(lad.ladder === 'ladder', `a ladder fitted up its side (${JSON.stringify(lad)})`);
  await rt('setOrbit', 215, 8, 14.5, 1.6, vi);
  await shot('08_ladder.png');
  const lastError = await page.evaluate(() => window.__rt.lastError);
  if (lastError) fail(`a frame threw: ${lastError}`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
} catch (e) {
  fail(e.stack ?? e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `r2_elephant: ${bad} FAILED` : 'r2_elephant: ok');
process.exit(bad ? 1 : 0);
