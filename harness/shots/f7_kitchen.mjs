// F7 (docs/V3/plan/finish.md §八 3, 5, 6; §三 2), in the game — the kitchen easier to work, and worth it:
//  - a stove on the ground: the mark resting on it from close by, the view stays as it is and one stays standing (the
//    kitchen's own drawing in and crouching are off, as on 11-24: docs/V3/plan/finish.md §十八, 界面恢复);
//  - its knob bigger than modelled, a ring round it that says how high the flame is (dark, amber, red);
//  - lit, it warms the air one feels beside it on a cold night — not from across the yard;
//  - the recipe book of a new game is empty; an egg in the hands brings its dishes (said in a line), a tomato more;
//    the page shows those and no others.
//   SHOTS_GPU=1 node harness/shots/f7_kitchen.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/f7_kitchen');
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
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=7&seed=7&start=road&build=stock:sedan&s=200&time=11&weather=clear`, { width: 1280, height: 720 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const shot = async (f) => {
    await page.evaluate(async () => {
      const g = window.__rt.game;
      g.ui.showHelp(false);
      for (let i = 0; i < 300 && (g.worldView?.pending ?? 0) > 0; i++) {
        g.worldView.update(g.player.walker.x, g.player.walker.z, 40);
        await new Promise((r) => setTimeout(r, 0));
      }
      for (let i = 0; i < 2; i++) window.__rt.render();
    });
    await page.screenshot({ path: path.join(out, f) });
    console.log('shot', f);
  };
  await rt('exit');
  await rt('simulate', 0.3);

  // a stove on the road ahead, a canister in it, a pan with an egg on its burner
  const stove = await page.evaluate(async () => {
    const g = window.__rt.game;
    const I = await import('/src/core/modcar/items.ts');
    const K = await import('/src/core/v3/kitchen/kit.ts');
    const SP = await import('/src/core/world/spine.ts');
    const st = new SP.SpineSample();
    g.world.spine.at(g.roadS + 12, st);
    const item = I.newItem('kit_stove');
    K.loadCanister(item, K.canister());
    const pan = I.newItem('kit_pan');
    K.putVessel(item, pan);
    const l = g.loose.addItem(item, st.x, g.world.heightAt(st.x, st.z), st.z, st.phi);
    l.resting = true;
    g.simulate(0.5);
    return { uid: l.uid, x: l.x, y: l.y, z: l.z, yaw: l.yaw, mid: l.mid };
  });
  await page.waitForTimeout(800);
  await rt('simulate', 0.5);
  const view = () =>
    page.evaluate(() => {
      const g = window.__rt.game;
      return { fov: +g.core.camera.fov.toFixed(2), zoom: +g.workZoom.toFixed(3), crouch: g.workCrouch, eye: +(g.player.walker.eye({ x: 0, y: 0, z: 0 }).y - g.player.walker.y).toFixed(2), target: String(g.player.telemetry().target) };
    });
  // from across the road: nothing drawn in
  await page.evaluate(({ x, z }) => window.__rt.stand(x - 4, z, 0, -0.2), stove);
  await rt('simulate', 0.6);
  const far = await view();
  ok(far.zoom === 1 && !far.crouch, `four metres off: the view as it is (${JSON.stringify(far)})`);

  // ---- 1. the mark on it from close by: the view as it is, standing (no drawing in, no crouching by itself)
  let m = '';
  for (const turn of [0, 0.8, -0.8, Math.PI, 1.6, -1.6]) {
    m = await rt('aimPoint', stove.x, stove.y + stove.mid, stove.z, stove.yaw + turn, 0.9);
    if (m.startsWith(`device:kitchen:${stove.uid}`)) break;
  }
  ok(m.startsWith(`device:kitchen:${stove.uid}`), `the mark on the stove (${m})`);
  await rt('simulate', 0.8);
  const near = await view();
  ok(near.zoom === 1 && Math.abs(near.fov - far.fov) < 0.5, `rested on it a moment: the view as it is — ${far.fov}° and ${near.fov}°, ${near.zoom}×`);
  ok(!near.crouch && Math.abs(near.eye - far.eye) < 0.15, `the stove on the ground: one stays standing (the eye ${far.eye} m up, now ${near.eye})`);
  await shot('01_at_the_stove.png');

  // ---- 2. the knob: bigger, its ring by the flame
  const knob = () =>
    page.evaluate((uid) => {
      const g = window.__rt.game;
      const l = g.loose.list.find((x) => x.uid === uid);
      const k = l.obj.getObjectByName('KNOB_fire');
      const ring = l.obj.getObjectByName('kitchen:knob-ring');
      return { scale: k ? +k.scale.x.toFixed(2) : null, ring: ring ? ring.material.color.getHexString() : null, fire: l.item.state?.kit?.fire ?? 0 };
    }, stove.uid);
  const k0 = await knob();
  ok(k0.scale === 1.6 && k0.ring === '4a4f56' && !k0.fire, `the knob 1.6 times its model, its ring dark with the flame off (${JSON.stringify(k0)})`);
  // the left button on the knob (its box in the stove's frame: to the front, low, by the canister's bay)
  const at = await page.evaluate(({ x, y, z, yaw }) => {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const lx = 0.145;
    const lz = -0.0275;
    return { x: x + c * lx - s * lz, y: y + 0.045, z: z + s * lx + c * lz };
  }, stove);
  let km = '';
  for (const [turn, dist] of [[0, 0.7], [0.4, 0.7], [-0.4, 0.7], [0, 0.5], [0.8, 0.6], [-0.8, 0.6]]) {
    km = await rt('aimPoint', at.x, at.y, at.z, stove.yaw + turn, dist);
    if (km === `device:kitchen:${stove.uid}:knob`) break;
  }
  ok(km === `device:kitchen:${stove.uid}:knob`, `the mark on its knob (${km})`);
  await rt('press');
  await rt('simulate', 0.6);
  const k2 = await knob();
  ok(k2.fire === 2 && k2.ring === 'ff4a22', `the left button: lit on a high flame, the ring red (${JSON.stringify(k2)})`);
  for (const turn of [0.5, -0.5, 0, 1.2]) {
    m = await rt('aimPoint', stove.x, stove.y + stove.mid, stove.z, stove.yaw + turn, 0.9);
    if (m.startsWith(`device:kitchen:${stove.uid}`)) break;
  }
  await rt('simulate', 0.8);
  // (the view is from where her eyes are, and a hand's breadth ahead of them — HerInGame.eyeShift, Nomad Drive's: within
  // a few centimetres of that)
  const off = await page.evaluate(() => {
    const g = window.__rt.game;
    const rig = g.her.rig;
    if (!g.her.ready || !rig) return null;
    rig.root.updateMatrixWorld(true);
    const hers = rig.bones.Head.localToWorld(rig.eyeLocal.clone());
    const w = g.player.walker;
    hers.add(g.her.constructor.eyeShift(w.heading, w.pitch, hers.clone()));
    const c = g.core.camera.position;
    return +Math.hypot(c.x - hers.x, c.y - hers.y, c.z - hers.z).toFixed(3);
  });
  ok(off !== null && off < 0.06, `the view is where her eyes are, a hand's breadth ahead of them (${off} m from there)`);
  await shot('02_lit.png');

  // ---- 3. it warms the air beside it on a cold night
  await rt('setHour', 3);
  await rt('simulate', 2);
  const warm = await page.evaluate(({ x, z }) => {
    const g = window.__rt.game;
    const out = g.env.state.temp;
    window.__rt.stand(x - 1, z, 0, -0.3);
    g.simulate(0.2);
    const by = g.bodyAirC();
    window.__rt.stand(x - 8, z, 0, 0);
    g.simulate(0.2);
    const off = g.bodyAirC();
    return { out: +out.toFixed(1), by: +by.toFixed(1), off: +off.toFixed(1), at: +g.systems.get('kitchen').warmthAt(x - 1, z).toFixed(1) };
  }, stove);
  ok(warm.at === 10 && warm.by > warm.off + 4 && warm.by <= 22.01 && Math.abs(warm.off - warm.out) < 0.5, `a cold night (${warm.out} °C): beside the lit stove the air one feels is ${warm.by} °C, eight metres off ${warm.off} °C`);
  await rt('setHour', 11);
  await rt('simulate', 1);

  // ---- 4. the mark gone: the view as it was, standing again
  await page.evaluate(({ x, z }) => window.__rt.stand(x - 4, z, Math.PI, 0), stove);
  await rt('simulate', 1.2);
  const back = await view();
  ok(back.zoom === 1 && !back.crouch && Math.abs(back.fov - far.fov) < 0.05 && back.eye > far.eye - 0.05, `the mark gone: the view as it was, standing (${JSON.stringify(back)})`);

  // ---- 5. the recipe book: empty, then what one could make of what one has met
  const bookNow = () =>
    page.evaluate(async () => {
      const g = window.__rt.game;
      const B = await import('/src/core/v3/kitchen/book.ts');
      const D = await import('/src/core/v3/kitchen/dishes.ts');
      const book = g.systems.get('kitchen').book;
      return { seen: [...(book.seen ?? ['(all)'])], shown: D.DISHES.filter((d) => B.shown(book, d)).length, all: D.DISHES.length };
    });
  const b0 = await bookNow();
  ok(b0.seen.length === 0 && b0.shown === 0, `a new game's recipe book: nothing met, no dish in it (${JSON.stringify(b0)})`);
  await rt('hold', 'item:ing_egg');
  await rt('simulate', 0.4);
  const said = await page.evaluate(() => document.body.innerText);
  const b1 = await bookNow();
  ok(b1.seen.join() === 'egg' && b1.shown > 0 && said.includes('菜谱里多了') && said.includes(`${b1.shown} 道`), `an egg in the hands: ${b1.shown} dishes come into the book, and it is said (${(said.match(/菜谱里多了[^\n]*/) ?? [''])[0]})`);
  await rt('hold', 'item:ing_tomato');
  await rt('simulate', 0.4);
  const b2 = await bookNow();
  ok(b2.seen.join() === 'egg,tomato' && b2.shown > b1.shown && b2.shown < b2.all / 3, `a tomato too: ${b2.shown} of the ${b2.all} dishes`);
  await page.evaluate(() => (window.__rt.game.player.held = null));
  await page.evaluate(() => window.__rt.game.openTab('recipes'));
  await rt('simulate', 0.3);
  await page.waitForTimeout(700);
  await rt('simulate', 0.2);
  const pageNow = await page.evaluate(() => {
    const e = document.querySelector('.kt-book.open');
    return e ? { tiles: e.querySelectorAll('.tile').length, text: e.innerText.replace(/\s+/g, ' ').slice(0, 160) } : null;
  });
  ok(!!pageNow && pageNow.tiles > 0 && pageNow.tiles <= b2.shown, `the book's page shows them and no others (${JSON.stringify(pageNow)})`);
  await shot('03_book.png');
  await page.evaluate(() => window.__rt.game.closeTab());

  const lastError = await page.evaluate(() => window.__rt.lastError);
  if (lastError) fail(`a frame threw: ${lastError}`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
} catch (e) {
  fail(e.stack ?? e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `f7_kitchen: ${bad} FAILED` : 'f7_kitchen: ok');
process.exit(bad ? 1 : 0);
