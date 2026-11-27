// A pan put on a hob turned the way one wants it, as Nomad Drive does (the player's ask, 2026-11-26: "拿起平底锅（包括其他
// 锅），然后开启放置模式，然后用Q/E来调整平底锅放的朝向"): in the Old Elephant, with its four hobs on the galley's worktop,
// a pan held out with R over the first hob goes onto its middle (Nomad Drive's cooking zone), E turns it a quarter round
// to the next square of the hob's own frame, E again a quarter further, Q back (the same size of turn either way), the
// left button sets it on so; it stays turned there, an egg in it, the hob on: it cooks. The words down the right while
// placing: Q / E 旋转, the left button 放上炉头. Then out of doors: a cassette stove on the road, a pot held out over it,
// turned with Q, set on, lit, cooking. The thing held out over the middle of the view is seen through as it is carried.
//   SHOTS_GPU=1 node harness/shots/carry_pan_hob.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/carry_pan_hob');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
const ok = (cond, why) => (cond ? console.log('ok  ', why) : fail(why));
const Q = Math.PI / 2;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:elephant&s=900&time=10&weather=clear`, { width: 1280, height: 720 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const step = (n = 6) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.simulate(1 / 30); }, n);
  const words = () => page.evaluate(() => document.body.innerText);
  const H = (fn, ...a) => page.evaluate(({ fn, a }) => window.__rt.game.systems.harness('nd-place', fn, ...a), { fn, a });
  const key = async (code, frames = 12) => {
    await page.keyboard.press(code);
    await step(frames);
  };
  const shot = async (f) => {
    await page.evaluate(async () => {
      const g = window.__rt.game;
      g.ui.showHelp(false);
      g.player.clearHighlight();
      for (let i = 0; i < 300 && (g.worldView?.pending ?? 0) > 0; i++) {
        g.worldView.update(g.player.walker.x, g.player.walker.z, 40);
        await new Promise((r) => setTimeout(r, 0));
      }
      for (let i = 0; i < 2; i++) window.__rt.render();
    });
    await page.screenshot({ path: path.join(out, f) });
  };
  // ---- the Old Elephant parked by the road (empty shell since §十九 step 7: place a kitchen stand and two hobs), in by the entry door
  const set = await page.evaluate(async () => {
    const g = window.__rt.game;
    const v = g.vehicles.find((x) => x.build.frame === 'elephant');
    const It = await import('/src/core/modcar/items.ts');
    v.sim.setParkBrake(true);
    v.sys.stop('');
    g.simulate(1.5);
    g.getOut();
    g.simulate(0.5);
    const put = async (id, near, yaw) => {
      const held = { kind: 'item', item: It.newItem(id) };
      await g.cargo.measured(held);
      const at = g.cargo.spotIn(v, 'cabin', held, near, yaw, 0);
      return at ? g.cargo.stow(v, at.zone, at.spot, held) : null;
    };
    const stand = await put('nd_kitchen_stand', { x: -2.0, z: -0.82 }, Math.PI / 2);
    const hobs = [];
    if (stand) {
      const sx = stand.riding.pos.x + v.sys.derived.cg.x;
      const sz = stand.riding.pos.z + v.sys.derived.cg.z;
      for (const dx of [-0.35, 0.35]) {
        const h = await put('kit_hob', { x: sx + dx, z: sz }, -Math.PI / 2);
        if (h) hobs.push(h);
      }
    }
    g.simulate(0.2);
    const A = await import('/src/core/modcar/aboard.ts');
    v.view.setPanelOpen('door_side', true);
    g.simulate(0.8);
    g.board(v, A.aboardOf('elephant').doors[0]);
    g.simulate(0.3);
    window.__v = v;
    window.__hobs = hobs;
    const hx = hobs[0] ? +(hobs[0].riding.pos.x + v.sys.derived.cg.x).toFixed(2) : -2.0;
    return { aboard: g.player.aboard?.v === v, hobs: hobs.length, hx };
  });
  ok(set.aboard && set.hobs >= 1, `in the Old Elephant, a kitchen stand with its hobs along the left wall (${JSON.stringify(set)})`);
  await rt('setView', 'cockpit');
  /** standing in the room at (x, z) (model space), looking at the middle of hob k's burner */
  const lookAtHob = (x, z, k) =>
    page.evaluate(({ x, z, k }) => {
      const g = window.__rt.game;
      const ab = g.player.aboard;
      ab.w.place(x, z, 0);
      g.simulate(0);
      const hob = window.__hobs[k];
      hob.obj.updateWorldMatrix(true, true);
      const m = hob.obj.getObjectByName('M_pot');
      const p = m.getWorldPosition(new hob.obj.position.constructor());
      const o = g.core.origin;
      ({ yaw: g.input.lookYaw, pitch: g.input.lookPitch } = g.player.walker.lookAt(p.x + o.x, p.y + o.y, p.z + o.z));
      for (let i = 0; i < 6; i++) g.simulate(1 / 30);
      return { at: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)] };
    }, { x, z, k });
  const standX = set.hx + 0.3;
  // ---- a pan in the hands, carried: Q 放下 and R 摆放 down the right
  await rt('hold', 'item:kit_pan');
  await step(20);
  await lookAtHob(standX, 0.25, 0);
  let w = await words();
  ok(w.includes('放下') && w.includes('摆放'), 'carrying the pan: Q 放下 and R 摆放 said down the right');
  // ---- R: held out; over the first hob it goes onto its middle
  await key('KeyR');
  await step(12);
  let a = await H('aim');
  ok((await H('placing')) && a.into === 'slot' && a.ok, `R over the hob: the pan held out goes onto the hob's middle (${JSON.stringify(a)})`);
  w = await words();
  ok(w.includes('旋转') && w.includes('放上炉头') && !w.includes('转 90°'), `while placing the words say Q / E 旋转 and the left button 放上炉头 (${JSON.stringify(w.split('\n').filter((l) => /旋转|放上|距离|取消|自由/.test(l)))})`);
  await shot('1_pan_over_hob.png');
  // ---- E: a quarter round onto the hob's squares; E again a quarter further; Q back; E again
  await key('KeyE');
  const t1 = (await H('aim')).turn;
  ok(t1 !== null && Math.abs(Math.sin(2 * t1)) < 1e-3, `E: on the hob's own square (turned ${(t1 * 180 / Math.PI).toFixed(1)}° from it)`);
  await key('KeyE');
  const t2 = (await H('aim')).turn;
  ok(Math.abs(wrap(t2 - (t1 - Q))) < 1e-3, `E again: a quarter further round (${(t1 * 180 / Math.PI).toFixed(1)}° → ${(t2 * 180 / Math.PI).toFixed(1)}°)`);
  await shot('2_pan_turned_E.png');
  await key('KeyQ');
  const t3 = (await H('aim')).turn;
  ok(Math.abs(wrap(t3 - t1)) < 1e-3 && (await H('placing')), `Q: a quarter back the other way, the same size of turn (${(t3 * 180 / Math.PI).toFixed(1)}°), still placing (Q does not put it down)`);
  await key('KeyE');
  const want = (await H('aim')).turn;
  ok(Math.abs(wrap(want - t2)) < 1e-3, `E: turned 90° from where Q left it (${(want * 180 / Math.PI).toFixed(1)}°)`);
  // ---- the left button: set on the hob so
  const put = await page.evaluate(async () => {
    const g = window.__rt.game;
    const K = await import('/src/core/v3/kitchen/kit.ts');
    window.__rt.press();
    g.simulate(0.3);
    const hob = window.__hobs[0];
    return { on: K.vesselOf(hob.item), yaw: K.kitOf(hob.item).onYaw ?? null, held: g.player.held?.kind ?? null, placing: g.systems.harness('nd-place', 'placing') };
  });
  ok(put.on === 'kit_pan' && put.yaw !== null && Math.abs(wrap(put.yaw - want)) < 1e-3 && !put.held && !put.placing, `the left button: the pan on the hob, turned as it was held (${JSON.stringify(put)})`);
  // (the drawn pan turned so on the hob: the kitchen's own model of it)
  const drawn = await page.evaluate(async () => {
    const g = window.__rt.game;
    const hob = window.__hobs[0];
    g.simulate(0.2);
    let yaw = null;
    g.core.scene.traverse((o) => {
      if (o.name === `kitchen:${hob.uid}`) {
        const holder = o.children[0];
        yaw = holder ? holder.rotation.y : null;
      }
    });
    return yaw;
  });
  ok(drawn !== null && Math.abs(wrap(drawn - put.yaw)) < 1e-3, `drawn on the hob turned so (${drawn === null ? '—' : ((drawn * 180) / Math.PI).toFixed(1)}°)`);
  await lookAtHob(standX, 0.25, 0);
  await shot('3_pan_on_hob.png');
  // ---- an egg in it, the hob on: it cooks, still turned
  const cook = await page.evaluate(async () => {
    const g = window.__rt.game;
    const K = await import('/src/core/v3/kitchen/kit.ts');
    const Kit = await import('/src/game/modcar/v3/kitchen/index.ts');
    const hob = window.__hobs[0];
    K.addPortion(hob.item, { id: 'egg' });
    g.loose.touch(hob);
    g.simulate(0.2);
    Kit.kitchen.flame(Kit.kitchen.unitOf(hob), 2);
    g.simulate(5.0);
    return { fire: K.fireOf(hob.item), done: +(K.potOf(hob.item)?.done ?? 0).toFixed(3), yaw: K.kitOf(hob.item).onYaw ?? null };
  });
  ok(cook.fire === 2 && cook.done > 0.1 && cook.yaw !== null && Math.abs(wrap(cook.yaw - want)) < 1e-3, `an egg in it, the hob on: it cooks there, turned as it was set (${JSON.stringify(cook)})`);
  await lookAtHob(standX, 0.25, 0);
  await shot('4_cooking.png');
  // ---- off the hob into the hands again (the left button held on it): the turn was the hob's
  const lifted = await page.evaluate(async () => {
    const g = window.__rt.game;
    const K = await import('/src/core/v3/kitchen/kit.ts');
    const Kit = await import('/src/game/modcar/v3/kitchen/index.ts');
    const hob = window.__hobs[0];
    Kit.kitchen.flame(Kit.kitchen.unitOf(hob), 0);
    Kit.kitchen.liftVessel(Kit.kitchen.unitOf(hob));
    g.simulate(0.2);
    return { on: K.vesselOf(hob.item), yaw: K.kitOf(hob.item).onYaw ?? null, held: g.player.held?.kind === 'item' ? g.player.held.item.item : null };
  });
  ok(!lifted.on && lifted.yaw === null && lifted.held === 'kit_pan', `lifted off: the pan in the hands with the egg, the hob's turn gone with it (${JSON.stringify(lifted)})`);
  // ---- out of doors: a cassette stove on the road, a pot held out over it, Q, set on, lit
  const outside = await page.evaluate(async () => {
    const g = window.__rt.game;
    const A = await import('/src/core/modcar/aboard.ts');
    const It = await import('/src/core/modcar/items.ts');
    const K = await import('/src/core/v3/kitchen/kit.ts');
    const p = g.player;
    for (let i = 0; i < p.slots.length; i++) p.slots[i] = null;
    g.alight(window.__v, A.aboardOf('elephant').doors[0]);
    g.simulate(0.4);
    const w = p.walker;
    const stove = It.newItem('kit_stove');
    K.loadCanister(stove, It.newItem('kit_gas'));
    const x = w.x + Math.cos(w.heading) * 1.1;
    const z = w.z + Math.sin(w.heading) * 1.1;
    const l = g.loose.addItem(stove, x, w.y + 0.3, z, w.heading + Math.PI);
    g.loose.drop(l);
    g.simulate(1.5);
    window.__stove = l;
    return { aboard: !!p.aboard, at: [+l.x.toFixed(2), +l.y.toFixed(2), +l.z.toFixed(2)] };
  });
  ok(!outside.aboard, `out of doors: a cassette stove on the ground (${JSON.stringify(outside)})`);
  await rt('hold', 'item:kit_pot');
  await step(20);
  const aimStove = () =>
    page.evaluate(() => {
      const g = window.__rt.game;
      const l = window.__stove;
      l.obj.updateWorldMatrix(true, true);
      const m = l.obj.getObjectByName('M_pot');
      const p = m.getWorldPosition(new l.obj.position.constructor());
      const o = g.core.origin;
      ({ yaw: g.input.lookYaw, pitch: g.input.lookPitch } = g.player.walker.lookAt(p.x + o.x, p.y + o.y, p.z + o.z));
      for (let i = 0; i < 6; i++) g.simulate(1 / 30);
    });
  await aimStove();
  await key('KeyR');
  await aimStove();
  a = await H('aim');
  ok(a.into === 'slot' && a.ok, `R over the stove: the pot goes onto its burner (${JSON.stringify(a)})`);
  await key('KeyQ');
  const tq = (await H('aim')).turn;
  ok(tq !== null && Math.abs(Math.sin(2 * tq)) < 1e-3, `Q: on the stove's own square (${(tq * 180 / Math.PI).toFixed(1)}°)`);
  await shot('5_pot_over_stove.png');
  const pot = await page.evaluate(async () => {
    const g = window.__rt.game;
    const K = await import('/src/core/v3/kitchen/kit.ts');
    const Kit = await import('/src/game/modcar/v3/kitchen/index.ts');
    window.__rt.press();
    g.simulate(0.3);
    const l = window.__stove;
    const on = K.vesselOf(l.item);
    const yaw = K.kitOf(l.item).onYaw ?? null;
    K.addPortion(l.item, { id: 'potato' });
    g.loose.touch(l);
    g.simulate(0.2);
    Kit.kitchen.flame(Kit.kitchen.unitOf(l), 2);
    g.simulate(5.0);
    return { on, yaw, fire: K.fireOf(l.item), done: +(K.potOf(l.item)?.done ?? 0).toFixed(3) };
  });
  ok(pot.on === 'kit_pot' && pot.yaw !== null && Math.abs(wrap(pot.yaw - tq)) < 1e-3 && pot.fire === 2 && pot.done > 0.05, `the left button: the pot on the stove turned as it was held, lit, cooking (${JSON.stringify(pot)})`);
  await aimStove();
  await shot('6_pot_on_stove.png');
  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
} catch (e) {
  fail(`threw: ${e?.stack ?? e}`);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `${bad} FAILED` : 'all ok');
process.exit(bad ? 1 : 0);
