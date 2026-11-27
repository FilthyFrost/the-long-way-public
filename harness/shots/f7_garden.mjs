// F7 (docs/V3/plan/finish.md §八 2), in the game — the garden's seventeen crops:
//  - a pot of each, sown by the right packet (the left button on the pot, the packet in the hands), watered, grown
//    through its day or two; ripe, it bears what its packet says, each fruit a thing of the kitchen's;
//  - a fruit picked by the left button; picked bare, the plant is half grown again and bears once more;
//  - another packet on a pot that has a plant: 改种 by the left button held (a press does nothing to it), the new crop in its place;
//  - the sun: by day it grows, at night it waits (its soil wet all the while);
//  - the pot's card: what grows in it and how far along, the water in its soil.
// Pictures of every crop ripe: loop/shots/f7_garden/.
//   SHOTS_GPU=1 node harness/shots/f7_garden.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/f7_garden');
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
  const H = (sys, fn, ...a) => page.evaluate(({ sys, fn, a }) => window.__rt.game.systems.harness(sys, fn, ...a), { sys, fn, a });
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

  // a row of pots on the road ahead, one for each crop, each with its packet lying by it
  const crops = await page.evaluate(async () => {
    const g = window.__rt.game;
    const I = await import('/src/core/modcar/items.ts');
    const N = await import('/src/core/v3/nd/items.ts');
    const SP = await import('/src/core/world/spine.ts');
    const st = new SP.SpineSample();
    const s0 = g.roadS + 14;
    const list = [];
    N.CROP_IDS.forEach((id, i) => {
      // (three rows across the road, 0.9 m apart each way)
      const row = i % 3;
      g.world.spine.at(s0 + Math.floor(i / 3) * 0.9, st);
      const d = (row - 1) * 0.9;
      const x = st.x - Math.sin(st.phi) * d;
      const z = st.z + Math.cos(st.phi) * d;
      const pot = g.loose.addItem(I.newItem(N.ND_POT), x, g.world.heightAt(x, z), z, 0);
      pot.resting = true;
      list.push({ id, uid: pot.uid, x, z, seeds: N.ND_SEEDS[id], fruit: N.ND_FRUIT[id], bears: N.CROP_INFO[id].bears, zh: N.CROP_INFO[id].zh });
    });
    g.simulate(0.5);
    return list;
  });
  ok(crops.length === 17, `seventeen pots laid out, one for each crop (${crops.map((c) => c.zh).join(' ')})`);
  await page.waitForTimeout(600);
  await rt('simulate', 0.5);
  const pots = () => H('nd-garden', 'pots');
  const potOf = async (uid) => (await pots()).find((p) => p.uid === uid);

  // ---- 1. sown by hand: the first three with the packet in the hands and the left button on the pot; the rest as that does it
  for (const c of crops.slice(0, 3)) {
    await rt('hold', `item:${c.seeds}`);
    const p = await potOf(c.uid);
    let m = '';
    for (const turn of [0, 1.2, -1.2, Math.PI]) {
      m = await rt('aimPoint', p.x, p.y + 0.15, p.z, turn, 0.9);
      if (m === `device:nd-garden:${c.uid}`) break;
    }
    await rt('simulate', 0.2);
    const said = await page.evaluate(() => document.body.innerText);
    await rt('press');
    await rt('simulate', 0.3);
    const after = await potOf(c.uid);
    const held = (await rt('telemetry')).held;
    ok(m === `device:nd-garden:${c.uid}` && said.includes(`种下`) && said.includes(c.zh) && after.crop === c.id && !held, `${c.zh}: the packet in the hands, the left button on the pot — sown, the packet used up (${m}; ${after.crop}; held ${held || 'nothing'})`);
  }
  await page.evaluate(async (crops) => {
    const g = window.__rt.game;
    const P = await import('/src/core/v3/nd/plants.ts');
    for (const c of crops) {
      const l = g.loose.list.find((x) => x.uid === c.uid);
      if (!P.potOf(l.item).crop) P.sow(l.item, c.id);
      P.water(l.item, 1);
      g.loose.touch(l);
    }
    g.simulate(0.3);
  }, crops);

  // ---- 2. the sun: by day it grows, at night it waits
  const first = crops[0];
  await rt('setHour', 12);
  await rt('simulate', 3);
  const g0 = await page.evaluate((uid) => window.__rt.game.loose.list.find((x) => x.uid === uid).item.state.pot.grown, first.uid);
  await rt('simulate', 30);
  const g1 = await page.evaluate((uid) => window.__rt.game.loose.list.find((x) => x.uid === uid).item.state.pot.grown, first.uid);
  await rt('setHour', 23.5);
  await rt('simulate', 4);
  const g2 = await page.evaluate((uid) => window.__rt.game.loose.list.find((x) => x.uid === uid).item.state.pot.grown, first.uid);
  await rt('simulate', 30);
  const g3 = await page.evaluate((uid) => window.__rt.game.loose.list.find((x) => x.uid === uid).item.state.pot.grown, first.uid);
  ok(g1 - g0 > 25 && g3 - g2 < 0.5, `at noon it grows (${(g1 - g0).toFixed(1)} s in 30 s), at night it waits (${(g3 - g2).toFixed(1)} s in 30 s)`);
  await rt('setHour', 11);
  await rt('simulate', 3);

  // ---- 3. grown through its day or two: every one ripe, bearing what its packet says
  for (const c of crops) await H('nd-garden', 'grow', c.uid, 3000);
  await rt('simulate', 0.5);
  await page.waitForTimeout(1200);
  await rt('simulate', 0.5);
  const ripe = await pots();
  const tel = await page.evaluate(() => window.__rt.game.systems.get('nd-garden').telemetry().pots);
  for (const c of crops) {
    const p = ripe.find((x) => x.uid === c.uid);
    const t = tel.find((x) => x.uid === c.uid);
    ok(p?.stage === 4 && t?.fruits === c.bears, `${c.zh}: ripe, ${t?.fruits} on it (its packet says ${c.bears})`);
  }
  // pictures: each row of three from the side, and all of them from above
  const stand = async (i, back, pitch) =>
    page.evaluate(
      ({ a, b, back, pitch }) => {
        const mx = (a.x + b.x) / 2;
        const mz = (a.z + b.z) / 2;
        // (from the road's side of the row, looking across it)
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const n = Math.hypot(dx, dz) || 1;
        const px = mx - (dz / n) * back * 0 - (dx / n) * 0;
        const x = mx - (dz / n) * 0 + (-dz / n) * 0;
        void px;
        void x;
        const sx = mx + (dz / n) * 0;
        void sx;
        const ox = -dz / n;
        const oz = dx / n;
        window.__rt.stand(mx + ox * back, mz + oz * back, Math.atan2(-oz, -ox), pitch);
      },
      { a: crops[i * 3], b: crops[Math.min(crops.length - 1, i * 3 + 2)], back, pitch },
    );
  for (let i = 0; i < Math.ceil(crops.length / 3); i++) {
    await stand(i, 1.5, -0.42);
    await rt('simulate', 0.3);
    await shot(`0${i + 1}_${crops.slice(i * 3, i * 3 + 3).map((c) => c.id).join('_')}.png`);
  }

  // (and each one close to, crouched by it)
  for (const c of crops) {
    await page.evaluate(({ x, z }) => {
      const g = window.__rt.game;
      window.__rt.stand(x - 0.62, z - 0.25, Math.atan2(0.25, 0.62), -0.62);
      g.input.crouch = true;
    }, c);
    await rt('simulate', 0.25);
    await shot(`c_${c.id}.png`);
  }
  // ---- 4. a fruit picked by the left button; picked bare, half grown again and bearing once more
  const pickAll = async (c) => {
    const got = [];
    for (let i = 0; i < c.bears; i++) {
      const at = await H('nd-garden', 'fruitAt', c.uid, i);
      if (!at) break;
      let m = '';
      for (const [turn, dist] of [[0, 0.8], [1.5, 0.8], [-1.5, 0.8], [Math.PI, 0.8], [0.7, 0.6], [-0.7, 0.6], [2.3, 0.7], [-2.3, 0.7]]) {
        m = await rt('aimPoint', at.x, at.y, at.z, turn, dist);
        if (m === `device:nd-garden:${c.uid}:f${i}`) break;
      }
      const t = await rt('press');
      got.push(t.held);
      await page.evaluate(() => {
        window.__rt.game.player.held = null;
        for (let k = 0; k < window.__rt.game.player.slots.length; k++) window.__rt.game.player.slots[k] = null;
      });
      await rt('simulate', 0.2);
    }
    return got;
  };
  for (const c of [crops.find((x) => x.id === 'tomato'), crops.find((x) => x.id === 'cabbage'), crops.find((x) => x.id === 'corn'), crops.find((x) => x.id === 'strawberry')]) {
    const got = await pickAll(c);
    const after = await page.evaluate((uid) => ({ ...window.__rt.game.loose.list.find((x) => x.uid === uid).item.state.pot }), c.uid);
    ok(got.length === c.bears && got.every((h) => h === `item:${c.fruit}`) && after.crop === c.id && after.left === undefined && after.borne === 1, `${c.zh}: ${got.length} picked by the left button (${[...new Set(got)].join(' ')}); bare, it stays in its pot, half grown again (${JSON.stringify(after)})`);
  }
  const tomato = crops.find((x) => x.id === 'tomato');
  await H('nd-garden', 'grow', tomato.uid, 3000);
  await rt('simulate', 0.4);
  const again = (await page.evaluate(() => window.__rt.game.systems.get('nd-garden').telemetry().pots)).find((x) => x.uid === tomato.uid);
  ok(again.stage === 4 && again.fruits === tomato.bears && again.borne === 1, `the tomato bears again (${again.fruits} on it, borne ${again.borne} before)`);

  // ---- 5. another packet on a pot that has a plant (the cabbage's, picked bare and growing again): 改种, by the button held
  const lettuce = crops.find((x) => x.id === 'cabbage');
  await rt('hold', 'item:nd_seeds_pumpkin');
  const lp = await potOf(lettuce.uid);
  let m = '';
  for (const turn of [0, 1.2, -1.2, Math.PI, 2.2, -2.2]) {
    m = await rt('aimPoint', lp.x, lp.y + 0.15, lp.z, turn, 0.9);
    if (m === `device:nd-garden:${lettuce.uid}`) break;
  }
  await rt('simulate', 0.2);
  const word = await page.evaluate(() => document.body.innerText);
  await rt('press');
  await rt('simulate', 0.3);
  const pressed = await potOf(lettuce.uid);
  ok(pressed.crop === 'cabbage' && (await rt('telemetry')).held === 'item:nd_seeds_pumpkin', `a press with other seeds over a plant: nothing lost (${pressed.crop} still, the packet in the hands)`);
  await rt('useFor', 1.3);
  await rt('simulate', 0.3);
  const resown = await potOf(lettuce.uid);
  ok(word.includes('改种') && word.includes('南瓜') && resown.crop === 'pumpkin' && resown.stage === 0 && !(await rt('telemetry')).held, `the button held: 改种 — the pumpkin in the cabbage's place, a sprout, the packet used up (${resown.crop}, stage ${resown.stage})`);
  // the same packet on its own crop: said, not sown
  await rt('hold', 'item:nd_seeds_pumpkin');
  for (const turn of [0, 1.2, -1.2, Math.PI, 2.2, -2.2]) {
    m = await rt('aimPoint', lp.x, lp.y + 0.15, lp.z, turn, 0.9);
    if (m === `device:nd-garden:${lettuce.uid}`) break;
  }
  await rt('press');
  await rt('simulate', 0.2);
  const same = await page.evaluate(() => document.body.innerText);
  ok(same.includes('已经种着南瓜'), 'the same seeds over their own crop: 已经种着南瓜了');
  await page.evaluate(() => (window.__rt.game.player.held = null));

  // ---- 6. the pot's card: on the mark (the pumpkin's sprout), and a ripe one's as the card has it
  for (const turn of [0, 1.2, -1.2, Math.PI]) {
    m = await rt('aimPoint', lp.x, lp.y + 0.15, lp.z, turn, 0.9);
    if (m === `device:nd-garden:${lettuce.uid}`) break;
  }
  await rt('simulate', 0.4);
  const card = await page.evaluate(() => document.body.innerText);
  ok(card.includes('花盆') && card.includes('南瓜') && card.includes('长到') && card.includes('土里的水'), 'the pot\'s card on screen: 花盆, what grows in it and how far along (南瓜 · 长到 …), 土里的水');
  await shot('07_card.png');
  const carrot = crops.find((x) => x.id === 'carrot');
  const ripeCard = await page.evaluate(async (uid) => {
    const g = window.__rt.game;
    const II = await import('/src/game/modcar/itemInfo.ts');
    const T = await import('/src/game/modcar/itemTime.ts');
    const l = g.loose.list.find((x) => x.uid === uid);
    const c = II.itemCard(l.item, T.itemNow());
    return { bars: c.bars.map((b) => `${b.label}:${b.text}`), notes: c.notes.map((n) => n.text) };
  }, carrot.uid);
  ok(ripeCard.bars.some((b) => b.startsWith('胡萝卜:熟了')) && ripeCard.bars.some((b) => b.startsWith('土里的水')), `a ripe pot's card: ${JSON.stringify(ripeCard)}`);

  const lastError = await page.evaluate(() => window.__rt.lastError);
  if (lastError) fail(`a frame threw: ${lastError}`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
} catch (e) {
  fail(e.stack ?? e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `f7_garden: ${bad} FAILED` : 'f7_garden: ok');
process.exit(bad ? 1 : 0);
