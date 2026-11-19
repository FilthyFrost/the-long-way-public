// Milestone M3, what the places hold where one sees it (docs/V3/nodes/M3-loot.md), walked through in the game:
//   1. at a filling station: the shelves' things lie on their boards and the till's on its counter, picked up with E
//      as any thing lying about (the mark on it, its card); the things on the keeper's side behind the counter are
//      reached from behind it, not through it
//   2. at a house: the wardrobe and the crate are shut, their things in them out of reach; E opens them (doors, lid),
//      the things inside are reached and picked up; E shuts them again
//   3. what was taken stays taken, what was opened stays open, as one comes back
//   SHOTS_GPU=1 node harness/shots/m3_loot.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/m3_loot');
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
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const shot = async (name, lit = true) => {
    await page.evaluate(async (lit) => {
      const g = window.__rt.game;
      g.ui.showHelp(false);
      for (let i = 0; i < 300 && (g.worldView?.pending ?? 0) > 0; i++) {
        g.worldView.update(g.player.walker.x, g.player.walker.z, 40);
        await new Promise((r) => setTimeout(r, 0));
      }
      if (!lit) g.player.clearHighlight();
      for (let i = 0; i < 2; i++) window.__rt.render();
    }, lit);
    await page.screenshot({ path: path.join(out, `${name}.png`) });
  };
  const goTo = async (site) => {
    await rt('devGoKm', site.s / 1000, false);
    for (let k = 0; k < 80; k++) {
      await rt('simulate', 0.25);
      const p = await rt('places');
      const lp = p?.live?.find((x) => x.id === site.id);
      if (lp && lp.laid === lp.containers) return lp;
      await page.waitForTimeout(60);
    }
    return null;
  };
  // a container's things now: shut or not, where they are (world), what
  const things = (id) =>
    page.evaluate((id) => {
      const pc = window.__rt.game.places?.containerOf(id);
      return pc ? pc.things.map((l) => ({ what: l.item?.item ?? l.tool?.kind ?? l.part?.part, shut: !!l.shut, x: l.x, y: l.y + l.mid, z: l.z })) : null;
    }, id);
  const contents = (id) => page.evaluate((id) => window.__rt.game.places?.containerOf(id)?.contents?.length ?? -1, id);
  // standing out of a container's front as it is drawn (its first place for things), d metres off, looking at it
  const frontOf = (id) =>
    page.evaluate((id) => {
      const g = window.__rt.game;
      const s = g.places?.containerOf(id)?.slots?.[0];
      if (!s) return null;
      s.frame.updateWorldMatrix(true, false);
      const e = s.frame.matrixWorld.elements;
      const o = g.core.origin;
      return { x: e[12] + o.x, y: e[13] + o.y, z: e[14] + o.z, from: Math.atan2(e[2], e[0]) };
    }, id);
  const held = () => page.evaluate(() => {
    const h = window.__rt.game.player.held;
    return h ? (h.kind === 'item' ? h.item.item : h.kind === 'tool' ? h.tool.kind : h.inst.part) : null;
  });
  const empty = () => page.evaluate(() => { window.__rt.game.player.held = null; });
  await page.goto(`${url}/modcar.html?new=1&shot=1&world=2`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 240000 });
  await rt('setHour', 11);
  const sites = await rt('placeSites', 0, 80000);
  const station = sites.find((x) => x.kind === 'station' && x.containers.some((c) => c.kind === 'counter') && x.containers.some((c) => c.kind === 'shelf'));
  const house = sites.find((x) => x.kind === 'house' && x.containers.some((c) => c.kind === 'wardrobe') && x.containers.some((c) => c.kind === 'crate'));
  ok(!!station && !!house, `a filling station and a house in the first 80 km (${station?.id}, ${house?.id})`);

  // ---- 1. the filling station: shelves and the till
  if (station) {
    ok(!!(await goTo(station)), 'at the filling station, the things in its containers laid out');
    const shelf = station.containers.find((c) => c.kind === 'shelf');
    const on = (await things(shelf.id)) ?? [];
    ok(on.length > 0 && on.every((t) => !t.shut), `the shelf's things lie on it, in reach (${on.map((t) => t.what).join(', ')})`);
    const f = await frontOf(shelf.id);
    await rt('aimPoint', f.x, f.y + 0.1, f.z, f.from, 1.3);
    await shot('1_shelf', false);
    const t = on.find((x) => Math.abs(x.y - f.y) < 0.6) ?? on[0];
    const n0 = await contents(shelf.id);
    const m = await rt('aimPoint', t.x, t.y, t.z, f.from, 1.1);
    ok(/^loose:/.test(m), `the mark on a thing on the shelf (${t.what}: ${m})`);
    await shot('2_shelf_aim');
    await rt('press');
    ok((await held()) === t.what, `E: the ${t.what} in the hands`);
    await rt('simulate', 0.1);
    ok((await contents(shelf.id)) === n0 - 1, 'the shelf holds one thing fewer');
    await empty();
    const till = station.containers.find((c) => c.kind === 'counter');
    const tf = await frontOf(till.id);
    const tt = (await things(till.id)) ?? [];
    // (the keeper's side: the place for things there opens to the back)
    const back = await page.evaluate((id) => {
      const pc = window.__rt.game.places.containerOf(id);
      const s = pc.slots.find((x) => x.back);
      if (!s) return null;
      const e = s.frame.matrixWorld.elements;
      const o = window.__rt.game.core.origin;
      return { x: e[12] + o.x, y: e[13] + o.y, z: e[14] + o.z, from: Math.atan2(-e[2], -e[0]) };
    }, till.id);
    if (back && tt.some((x) => Math.abs(x.y - back.y) < 0.3)) {
      await rt('aimPoint', back.x, back.y, back.z, back.from + Math.PI, 1.4);
      const fromFront = (await things(till.id)).filter((x) => Math.abs(x.y - back.y) < 0.3);
      ok(fromFront.every((x) => x.shut), "from the customers' side the things behind the counter are out of reach");
      await rt('aimPoint', back.x, back.y, back.z, back.from, 1.0);
      await rt('simulate', 0.05);
      const fromBack = (await things(till.id)).filter((x) => Math.abs(x.y - back.y) < 0.3);
      ok(fromBack.every((x) => !x.shut), "from the keeper's side behind it they are in reach");
      await shot('3_behind_the_counter', false);
    } else console.log('(nothing on the keeper’s side of this till)');
    if (tf) {
      await rt('aimPoint', tf.x, tf.y + 0.4, tf.z, tf.from, 1.5);
      await shot('4_till', false);
    }
  }

  // ---- 2. the house: the wardrobe and the crate, shut until opened
  if (house) {
    ok(!!(await goTo(house)), 'at the house, the things in its containers laid out');
    let k = 5;
    for (const kind of ['wardrobe', 'crate']) {
      const c = house.containers.find((x) => x.kind === kind);
      const in0 = (await things(c.id)) ?? [];
      const f = await frontOf(c.id);
      const m0 = await rt('aimPoint', f.x, f.y + 0.1, f.z, f.from, 1.2);
      ok(/device:box:/.test(m0) && in0.every((t) => t.shut), `the ${kind} shut, its things in it out of reach (${in0.map((t) => t.what).join(', ') || 'none'}; ${m0})`);
      await shot(`${k++}_${kind}_shut`, false);
      await rt('press');
      await rt('simulate', 0.7);
      const in1 = (await things(c.id)) ?? [];
      const open = await page.evaluate((id) => window.__rt.game.siteArt?.openOf(id) ?? -1, c.id);
      ok(open > 0.99 && in1.every((t) => !t.shut), `E: the ${kind} open (${open.toFixed(2)}), its things in reach`);
      await rt('aimPoint', f.x, f.y + 0.1, f.z, f.from, 1.2);
      await shot(`${k++}_${kind}_open`, false);
      if (in1.length) {
        const t = in1[0];
        const n0 = await contents(c.id);
        const m = await rt('aimPoint', t.x, t.y, t.z, f.from, 1.0);
        await shot(`${k++}_${kind}_aim`);
        await rt('press');
        ok(/^loose:/.test(m) && (await held()) === t.what, `the ${t.what} in the ${kind} picked up with E (${m})`);
        await rt('simulate', 0.1);
        ok((await contents(c.id)) === n0 - 1, `the ${kind} holds one thing fewer`);
        await empty();
      }
    }
    // ---- 3. come back: taken stays taken, opened stays open
    const wardrobe = house.containers.find((x) => x.kind === 'wardrobe');
    const before = await contents(wardrobe.id);
    await rt('devGoKm', (house.s + 3000) / 1000, false);
    await rt('simulate', 2);
    await goTo(house);
    const again = await contents(wardrobe.id);
    const open = await page.evaluate((id) => window.__rt.game.siteArt?.openOf(id) ?? -1, wardrobe.id);
    ok(again === before && open > 0.99, `come back to, the wardrobe holds what was left (${before} → ${again}) and is open still (${open.toFixed(2)})`);
  }
  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `${bad} FAILED` : 'all passed');
process.exit(bad ? 1 : 0);
