// F6 (docs/V3/plan/finish.md §二 6: 汽车旅馆单列成一种地点), in the game — a world of version 7: the motel.
//  - the first motel down the road is a sort of place of its own: its boxes' cards (the whole ones) say 汽车旅馆, not 民房;
//  - what the plan laid in its boxes is what a traveller leaves: no stove, no pan, no coffee machine, no furniture;
//  - a nightstand in one of its rooms: shut, its card says nothing of what is in it; the left button pulls its drawer
//    out and what is in it is seen standing in the drawer, no list coming up (the player's ask of 2026-11-26); the mark
//    on one of them and the left button take it into the hands — and the nightstand, opened, is one's own from then on
//    (the place lets it go: it is kept with the game);
//  - a nightstand carried takes nothing in by itself: what is picked up goes into a slot of its own.
//   SHOTS_GPU=1 node harness/shots/f6_motel.mjs [seed]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/f6_motel');
fs.mkdirSync(out, { recursive: true });
const seed = process.argv[2] || '2';
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
const ok = (cond, why) => (cond ? console.log('ok  ', why) : fail(why));

try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=7&seed=${seed}&start=road&build=stock:sedan&s=200&time=11&weather=clear`, { width: 1280, height: 720 });
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

  // the first motel down the road
  const motel = await page.evaluate(() => {
    const g = window.__rt.game;
    const sites = [];
    g.world.sites.between(0, 200000, sites);
    sites.sort((a, b) => a.s - b.s);
    const m = sites.find((x) => x.sort === 'motel');
    if (!m) return null;
    return { id: m.id, s: m.s, kind: m.kind, sort: m.sort, prefab: m.prefab, boxes: m.containers.map((c) => ({ id: c.id, kind: c.kind, plan: !!c.plan })), nightstands: m.loose.filter((l) => l.item === 'nd_nightstand').length, others: sites.filter((x) => x.sort !== x.kind && x.sort !== 'motel').length };
  });
  ok(!!motel, `a motel within 200 km of the world of seed ${seed}: ${motel ? `${motel.id} at ${(motel.s / 1000).toFixed(1)} km` : 'none'}`);
  if (!motel) throw new Error('no motel');
  ok(motel.sort === 'motel' && motel.kind === 'house' && motel.prefab === 'motel' && motel.others === 0, `its sort is motel, its kind a house's still (${motel.sort}, ${motel.kind}); every other place of its own kind`);
  console.log(`     its boxes: ${motel.boxes.map((b) => `${b.kind}${b.plan ? '*' : ''}`).join(' ')}; nightstands ${motel.nightstands}`);

  await rt('devGoKm', motel.s / 1000, false);
  let live = null;
  for (let k = 0; k < 120; k++) {
    await rt('simulate', 0.25);
    const p = await rt('places');
    live = p?.live?.find((x) => x.id === motel.id) ?? null;
    const drawn = await page.evaluate(() => window.__rt.game.systems.harness('nd-build', 'drawn'));
    if (live && live.laid === live.containers && drawn.length && drawn.every((d) => d.ready) && (await rt('worldPending')) <= 0) break;
    await page.waitForTimeout(60);
  }
  ok(!!live && live.sort === 'motel' && live.laid === live.containers, `there, its boxes laid out (${JSON.stringify(live && { sort: live.sort, containers: live.containers, laid: live.laid, loose: live.loose })})`);
  await page.evaluate(() => window.__rt.game.loose.settled());
  await rt('simulate', 0.5);

  // from across its forecourt
  await page.evaluate((id) => {
    const g = window.__rt.game;
    const sites = [];
    g.world.sites.between(0, 200000, sites);
    const m = sites.find((x) => x.id === id);
    const o = m.objects.find((x) => x.kind === 'prefab');
    // (in front of it — its front is its −v side — some way off, looking at it)
    const c = Math.cos(o.yaw);
    const s = Math.sin(o.yaw);
    const x = o.x + s * (o.d / 2 + 13);
    const z = o.z - c * (o.d / 2 + 13);
    window.__rt.stand(x, z, Math.atan2(o.z - z, o.x - x), 0.02);
  }, motel.id);
  await rt('simulate', 0.4);
  await shot('01_motel.png');

  // what the plan laid in its boxes, and what lies about it
  const holds = await page.evaluate((id) => {
    const g = window.__rt.game;
    const lp = [...g.places.live.values()].find((x) => x.site.id === id);
    const name = (h) => (h.kind === 'item' ? h.item.item : h.kind === 'part' ? `part:${h.inst.part}` : `tool:${h.tool.kind}`);
    return {
      boxes: lp.containers.map((pc) => ({ id: pc.id, kind: pc.c.kind, plan: !!pc.c.plan, contents: (pc.contents ?? []).map(name) })),
      loose: [...lp.loose.values()].map((t) => name(t.l.item ? { kind: 'item', item: t.l.item } : t.l.part ? { kind: 'part', inst: t.l.part } : { kind: 'tool', tool: t.l.tool })),
    };
  }, motel.id);
  const inBoxes = holds.boxes.filter((b) => b.plan).flatMap((b) => b.contents);
  console.log(`     the plan's boxes hold: ${JSON.stringify(inBoxes)}`);
  console.log(`     lying about: ${JSON.stringify(holds.loose)}`);
  const household = /^(kit_|nd_coffee_machine|coffee_pot|nd_coffee_pack|nd_plant_pot|nd_seeds_|nd_chair|nd_table|nd_wall_shelf|nd_fridge|rod_|bait_|forage_|nd_grinder|nd_polisher|nd_metal_detector)/;
  ok(!inBoxes.some((k) => household.test(k)), 'nothing a household keeps among the plan\'s finds there (no stove, pan, coffee machine, pot, furniture, rod)');

  // a box of it that opens (its refrigerator): the card says 汽车旅馆
  const fridge = holds.boxes.find((b) => b.kind === 'fridge');
  const cardOf = (id) => page.evaluate((id) => window.__rt.game.devices.find((d) => d.id === `box:${id}`)?.card?.cat ?? null, id);
  for (const b of holds.boxes.slice(0, 3)) {
    const cat = await cardOf(b.id);
    ok(typeof cat === 'string' && cat.startsWith('汽车旅馆'), `the card of its ${b.kind}: ${cat}`);
  }
  if (fridge) {
    const yaw = await page.evaluate((id) => window.__rt.game.places.containerOf(id)?.c.yaw ?? 0, fridge.id);
    let m = '';
    for (const turn of [Math.PI / 2, -Math.PI / 2, 0, Math.PI, 0.8, -0.8, 2.4, -2.4]) {
      m = await rt('aimAt', `box:${fridge.id}`, yaw + turn, 1.5);
      if (m === `device:box:${fridge.id}`) break;
    }
    ok(m === `device:box:${fridge.id}`, `the mark on its refrigerator (${m})`);
    await rt('simulate', 0.2);
    // (the card by the mark is the cut-down one — docs/V3/plan/prompts.md §五 4: its name and how it stands, no line
    // of the place's sort; the whole card, read above, has it)
    const said = await page.evaluate(() => document.body.innerText);
    ok(said.includes('冰箱') && !said.includes('民房'), 'on screen: its name, and nowhere 民房');
    await shot('02_fridge_card.png');
  } else console.log('     (this motel has no refrigerator: its cards read above)');

  // its nightstands, and what their drawers hold
  const stands = await page.evaluate((id) => {
    const g = window.__rt.game;
    const lp = [...g.places.live.values()].find((x) => x.site.id === id);
    const mine = new Set([...lp.loose.values()].map((t) => t.l));
    return g.loose.list
      .filter((l) => l.item?.item === 'nd_nightstand' && mine.has(l))
      .map((l) => ({ uid: l.uid, x: l.x, y: l.y, z: l.z, yaw: l.yaw, inside: (l.item.inside ?? []).map((x) => x.item), owned: g.places.owns(l) }));
  }, motel.id);
  console.log(`     nightstands: ${stands.map((s) => `[${s.inside.join('+') || '-'}]`).join(' ')}`);
  ok(stands.length > 0 && stands.every((s) => s.owned && s.inside.length <= 2), `${stands.length} nightstands in its rooms, the place's own, none with more than two things in its drawer`);
  // (nothing kept back for now is in them: no film before the camera, no tape before the radio, no key before the detector)
  ok(!stands.some((s) => s.inside.some((k) => /^(nd_film_pack|nd_tape_|nd_key_)/.test(k))), 'no piece of a set not begun in any drawer (film, tape, key)');
  const full = stands.find((s) => s.inside.length > 0);
  ok(!!full, 'one of them has something in its drawer');

  if (full) {
    // where its drawer is, as drawn (world)
    const drawer = await page.evaluate(async (uid) => {
      const g = window.__rt.game;
      const l = g.loose.list.find((x) => x.uid === uid);
      for (let i = 0; i < 200 && !l.obj.children.length; i++) await new Promise((r) => setTimeout(r, 20));
      g.simulate(0.1);
      l.obj.updateWorldMatrix(true, true);
      let node = null;
      l.obj.traverse((o) => {
        if (!node && /^P_drawer(_[a-z]+)?$/.test(o.name)) node = o;
      });
      if (!node) return null;
      const o = g.core.origin;
      let lo = [Infinity, Infinity, Infinity];
      let hi = [-Infinity, -Infinity, -Infinity];
      const v = l.obj.position.clone();
      node.traverse((m) => {
        const geo = m.geometry;
        if (!geo) return;
        if (!geo.boundingBox) geo.computeBoundingBox();
        const b = geo.boundingBox;
        for (const cx of [b.min.x, b.max.x]) for (const cy of [b.min.y, b.max.y]) for (const cz of [b.min.z, b.max.z]) {
          v.set(cx, cy, cz).applyMatrix4(m.matrixWorld);
          lo = [Math.min(lo[0], v.x), Math.min(lo[1], v.y), Math.min(lo[2], v.z)];
          hi = [Math.max(hi[0], v.x), Math.max(hi[1], v.y), Math.max(hi[2], v.z)];
        }
      });
      return { name: node.name, x: (lo[0] + hi[0]) / 2 + o.x, y: (lo[1] + hi[1]) / 2 + o.y, z: (lo[2] + hi[2]) / 2 + o.z };
    }, full.uid);
    ok(!!drawer, `its drawer on its model (${drawer?.name})`);
    if (drawer) {
      const want = `device:nd-home:${full.uid}:${drawer.name}`;
      let m = '';
      for (const [turn, dist] of [[0, 0.9], [0.5, 0.9], [-0.5, 0.9], [0, 0.7], [1, 0.9], [-1, 0.9], [0.3, 1.2], [-0.3, 1.2], [1.5, 0.8], [-1.5, 0.8], [Math.PI, 0.9]]) {
        m = await rt('aimPoint', drawer.x, drawer.y, drawer.z, full.yaw + turn, dist);
        if (m === want) break;
      }
      ok(m === want, `the mark on its drawer (${m})`);
      await rt('simulate', 0.2);
      let said = await page.evaluate(() => document.body.innerText);
      const names = await page.evaluate(async (ids) => {
        const I = await import('/src/core/modcar/items.ts');
        return ids.map((id) => I.itemDef(id).name.zh);
      }, full.inside);
      ok(said.includes('床头柜') && said.includes('关着') && !names.some((n) => said.includes(n)), `shut: its card says 关着 and nothing of what is in it (${names.join('、')})`);
      ok(said.includes('拉开抽屉'), 'the word for the left button: 拉开抽屉');
      await shot('03_nightstand_shut.png');
      await rt('press');
      await rt('simulate', 0.6);
      // (no list comes up: what is in the drawer stands in it, v3/nd-store — the player's ask of 2026-11-26; drawn as
      // soon as the things' models are in)
      const after = await page.evaluate(async (uid) => {
        const g = window.__rt.game;
        const l = g.loose.list.find((x) => x.uid === uid);
        const view = () => g.systems.harness('nd-store', 'views').find((x) => x.uid === uid);
        for (let i = 0; i < 60 && (view()?.things.length ?? 0) < (l?.item?.inside?.length ?? 0); i++) {
          g.simulate(0.05);
          await new Promise((r) => setTimeout(r, 50));
        }
        const v = view();
        return { open: l?.item?.state?.open ?? [], list: !!g.listV, owned: l ? g.places.owns(l) : null, drawn: !!v?.drawn, things: (v?.things ?? []).map((t) => ({ uid: t.uid, item: t.item, at: t.at })) };
      }, full.uid);
      ok(after.open.includes(drawer.name) && !after.list && after.drawn, `the left button: the drawer out, and no list comes up (${JSON.stringify({ open: after.open, list: after.list, drawn: after.drawn })})`);
      ok(after.owned === false, 'opened, the nightstand is one\'s own (the place has let it go: kept with the game from now on)');
      ok(after.things.length === full.inside.length && full.inside.every((k) => after.things.some((t) => t.item === k)), `what is in it stands in the drawer: ${names.join('、')} (${JSON.stringify(after.things.map((t) => t.item))})`);
      await shot('04_drawer_open.png');
      // (the mark on one of them in the drawer, the left button: it is in the hands)
      const one = after.things[0];
      const wantThing = one ? `device:nd-store:${full.uid}:${one.uid}` : '-';
      let mk = '';
      for (const [turn, dist] of [[0, 0.7], [0.4, 0.7], [-0.4, 0.7], [0, 0.55], [0.8, 0.7], [-0.8, 0.7], [0, 0.9]]) {
        if (!one) break;
        mk = await rt('aimPoint', one.at.x, one.at.y, one.at.z, full.yaw + turn, dist);
        if (mk === wantThing) break;
      }
      ok(mk === wantThing, `the mark on the ${one?.item} in the drawer (${mk})`);
      await rt('press');
      await rt('simulate', 0.3);
      const hand = await page.evaluate((uid) => {
        const g = window.__rt.game;
        const h = g.player.held;
        const l = g.loose.list.find((x) => x.uid === uid);
        return { held: h?.kind === 'item' ? h.item.item : null, left: (l?.item?.inside ?? []).map((x) => x.item), list: !!g.listV };
      }, full.uid);
      ok(hand.held === one?.item && hand.left.length === full.inside.length - 1 && !hand.list, `the left button on it: ${hand.held} in the hands, ${hand.left.length} left in the drawer`);
      await shot('05_taken.png');
    }
  }

  // a nightstand carried takes nothing in by itself: a bandage picked up goes into a slot of its own
  const carried = await page.evaluate(async () => {
    const g = window.__rt.game;
    const I = await import('/src/core/modcar/items.ts');
    for (let i = 0; i < g.player.slots.length; i++) g.player.slots[i] = null;
    const stand = I.newItem('nd_nightstand');
    g.player.slots[0] = { kind: 'item', item: stand };
    const left = g.player.receive({ kind: 'item', item: I.newItem('med_bandage') });
    const res = { left, inside: (stand.inside ?? []).length, slots: g.player.slots.map((h) => (h?.kind === 'item' ? h.item.item : null)) };
    for (let i = 0; i < g.player.slots.length; i++) g.player.slots[i] = null;
    return res;
  });
  ok(carried.left === 0 && carried.inside === 0 && carried.slots.includes('med_bandage'), `a nightstand in the hands swallows nothing: the bandage in a slot of its own (${JSON.stringify(carried)})`);

  const lastError = await page.evaluate(() => window.__rt.lastError);
  if (lastError) fail(`a frame threw: ${lastError}`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
} catch (e) {
  fail(e.stack ?? e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `f6_motel: ${bad} FAILED` : 'f6_motel: ok');
process.exit(bad ? 1 : 0);
