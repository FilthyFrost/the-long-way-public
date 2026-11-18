// Stacks, things that hold things and the list's sources in the real game (docs/V3/nodes/N0-items-world.md;
// src/game/modcar/loose.ts, cargo.ts, listSources.ts, workshop.ts), on a page with the test content (v3test=1:
// a berry that stacks to twelve and goes off, a basket that holds four stacks):
//  - a stack of five berries put down is ONE thing lying about, named with its count, weighing five berries;
//  - stowed in a vehicle it is one row of the list with its count and the load rose by five berries; taken from
//    the list (E) it is back in the hands whole;
//  - with the basket in the hands Tab opens the basket's list, empty; the berries in the other slot are brought
//    into the hands with that slot's number key and put in with G (the key is shown only while they would go
//    in); the row shows them; E takes them out again, into the free hand and not back into the basket;
//  - the list stays open on the basket put down within reach and shuts when one has walked away; Tab with the
//    mark on the basket lying there opens it again, and G puts the berries into it where it lies;
//  - a stack that has gone off is another kind where it lies, drawn again;
//  - the recycler gives five berries' organics for the stack (counted up as it is ground), and for the basket
//    with five berries in it the basket's and theirs, its list shutting as it goes in;
//  - a system's own source that throws is reported by the kernel, its list shuts and the game goes on.
// The page is not drawn (shot=1): the game is stepped from here, so nothing waits on the clock on the wall.
//   SHOTS_GL=llvmpipe node harness/shots/v3_items_world.mjs
import { launchBrowser, openGame, startServer } from './lib.mjs';

const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&v3test=1`, { width: 1280, height: 720 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const key = async (code) => {
    await page.keyboard.press(code);
    await rt('simulate', 0.1);
  };
  // the game's own modules (the same instances the page runs: the catalogue has the test kinds only there)
  const has = await page.evaluate(async () => {
    const I = await import('/src/core/modcar/items.ts');
    const C = await import('/src/game/modcar/cargo.ts');
    const T = await import('/src/game/modcar/itemTime.ts');
    window.__w = { I, C, T };
    return I.hasItem('v3t_berry') && I.hasItem('v3t_basket') && I.hasItem('v3t_mush');
  });
  if (!has) throw new Error('the page has no test content: was it opened with v3test=1?');
  const kinds = await page.evaluate(() => {
    const { I } = window.__w;
    const b = I.itemDef('v3t_berry');
    const k = I.itemDef('v3t_basket');
    return { berry: { mass: b.mass, organics: b.salvage.organics ?? 0, name: b.name.zh }, basket: { organics: k.salvage.organics ?? 0, name: k.name.zh, slots: k.holds.slots, decay: k.holds.decay ?? 1 } };
  });
  const five = 5 * kinds.berry.mass;
  /** the list as it is drawn: null when shut */
  const list = () =>
    page.evaluate(() => {
      const el = document.querySelector('.mc-cargo');
      if (!el || el.style.display === 'none') return null;
      return {
        title: el.querySelector('.n')?.textContent ?? '',
        sum: el.querySelector('.ld')?.textContent ?? '',
        rows: [...el.querySelectorAll('.r')].map((r) => r.textContent ?? ''),
        empty: el.querySelector('.none')?.textContent ?? '',
        keys: [...el.querySelectorAll('.ks span')].map((s) => s.textContent ?? ''),
      };
    });
  /** the hands: each slot's kind and count, which is selected */
  const hands = () =>
    page.evaluate(() => {
      const p = window.__rt.game.player;
      return { sel: p.sel, slots: p.slots.map((h) => (h?.kind === 'item' ? { item: h.item.item, n: h.item.n ?? 1, uid: h.item.uid, inside: (h.item.inside ?? []).map((x) => `${x.item}*${x.n ?? 1}`) } : h ? { item: h.kind } : null)) };
    });
  const frames = await page.evaluate(() => window.__rt.game.vehicles.map((v) => v.view.frame.id));
  const pk = frames.indexOf('pickup') >= 0 ? frames.indexOf('pickup') : 0;
  if (!frames.length) throw new Error('no vehicle in the workshop');
  const home = await rt('telemetry');

  // 1. a stack of five berries put down: one thing lying about, named with its count, weighing five berries
  await rt('stand', home.footX, home.footZ, home.heading);
  const loose0 = await page.evaluate(() => window.__rt.game.loose.list.length);
  await rt('hold', 'item:v3t_berry', { n: 5 });
  await rt('drop');
  await rt('simulate', 1.5);
  const lying = await page.evaluate(() => {
    const g = window.__rt.game;
    const { I, C } = window.__w;
    return { all: g.loose.list.length, berries: g.loose.list.filter((l) => l.item?.item === 'v3t_berry').map((l) => ({ n: l.item.n ?? 1, name: I.itemName(l.item), kg: C.massOf({ kind: 'item', item: l.item }), resting: l.resting, t0: l.item.t0 ?? null })) };
  });
  console.log('put down', JSON.stringify(lying));
  if (lying.all !== loose0 + 1 || lying.berries.length !== 1) fail(`five berries put down are not one thing lying about (${lying.all - loose0} more things, ${lying.berries.length} of berries)`);
  const b0 = lying.berries[0];
  if (b0?.n !== 5 || b0?.name !== `${kinds.berry.name} ×5`) fail(`the stack lying about is not named with its count (${b0?.name}, n ${b0?.n})`);
  if (!b0 || !near(b0.kg, five)) fail(`the stack lying about does not weigh five berries (${b0?.kg} kg, not ${five})`);
  if (b0?.t0 === null) fail('the berries lying about have not started going off');
  // (what the mark says of it: the prompt carries the count)
  if (await rt('aimLoose', 'item:v3t_berry', 0.9)) {
    const words = await page.evaluate(() => document.body.textContent ?? '');
    if (!/试验莓\s*×\s*5/.test(words)) fail('the words for the stack under the mark do not carry its count');
  } else console.log('(the mark could not be put on the berries: the prompt was not read)');

  // 2. stowed in a vehicle: one row with its count, the load up by five berries; taken from the list: whole again
  if (!(await rt('pickUp', 'item:v3t_berry'))) fail('the berries could not be picked up again');
  const uid = (await hands()).slots.find((s) => s?.item === 'v3t_berry')?.uid;
  await page.waitForFunction(() => window.__rt.game.cargo.boxOf(window.__rt.game.player.held) !== null, null, { timeout: 120_000 });
  const before = await rt('stowed', pk);
  const zone = frames[pk] === 'pickup' ? 'bed' : 'trunk';
  const aimed = await rt('aimZone', pk, zone, 1.2);
  if (!String(aimed.target).startsWith('stow:')) {
    // (a shut lid over it: packed in with G held instead, which opens it)
    await rt('dropFor', 0.6);
  } else await rt('press');
  const after = await rt('stowed', pk);
  const rows = after.things.filter((t) => t.what === 'item:v3t_berry');
  console.log('stowed', JSON.stringify({ load: [before.load, after.load], things: after.things.length, zone: rows[0]?.zone }));
  if (rows.length !== 1) fail(`the stack is not one thing in the ${frames[pk]} (${rows.length})`);
  if (!near(after.load - before.load, five)) fail(`the load rose by ${after.load - before.load} kg, not by five berries (${five})`);
  if ((await hands()).slots.some((s) => s?.item === 'v3t_berry')) fail('the berries are still in the hands after they were stowed');
  await key('Tab');
  const l2 = await list();
  console.log('the list', JSON.stringify(l2));
  const mine = l2?.rows.filter((r) => r.includes(kinds.berry.name)) ?? [];
  if (!l2 || mine.length !== 1 || !mine[0].includes(`${kinds.berry.name} ×5`)) fail(`the vehicle's list does not show the stack as one row with its count (${JSON.stringify(l2?.rows)})`);
  // (down to its row, and out with E)
  for (let i = 0; i < (l2?.rows.length ?? 0) && !(await page.evaluate((nm) => document.querySelector('.mc-cargo .r.on')?.textContent?.includes(nm), kinds.berry.name)); i++) await key('KeyS');
  await key('KeyE');
  const h2 = await hands();
  const got = h2.slots[h2.sel];
  const back = await rt('stowed', pk);
  console.log('taken out', JSON.stringify({ got, load: back.load }));
  if (got?.item !== 'v3t_berry' || got.n !== 5 || got.uid !== uid) fail(`the stack did not come back into the hands whole (${JSON.stringify(got)})`);
  if (!near(back.load, before.load)) fail(`the vehicle still weighs the berries (${back.load} kg, was ${before.load})`);
  if (back.things.some((t) => t.what === 'item:v3t_berry')) fail('the berries are still in the vehicle');
  await page.evaluate(() => window.__rt.game.closeCargoList());

  // 3. the basket in the hands (slot 1), the berries in the other slot: Tab opens the basket's list, empty
  await page.evaluate(() => {
    const p = window.__rt.game.player;
    const berries = p.slots[p.sel];
    p.slots[0] = null;
    p.slots[1] = berries;
    p.sel = 0;
  });
  await rt('stand', home.footX, home.footZ, home.heading);
  await rt('hold', 'item:v3t_basket');
  const basket = (await hands()).slots[0];
  await key('Tab');
  const l3 = await list();
  const on3 = await page.evaluate(() => window.__rt.game.listV?.box?.uid ?? null);
  console.log('the basket', JSON.stringify(l3));
  if (!l3 || on3 !== basket.uid || l3.title !== kinds.basket.name) fail(`Tab with the basket in the hands did not open the basket's list (${JSON.stringify(l3)})`);
  if (l3 && (l3.rows.length || !l3.empty)) fail('the empty basket does not list as empty');
  if (l3 && !l3.sum.includes(`0 / ${kinds.basket.slots}`)) fail(`the basket's list does not say how much it holds (${l3.sum})`);
  if (l3?.keys.some((k) => k.startsWith('G'))) fail('G is offered for putting the basket into itself');
  // the other slot's number key brings the berries into the hands; G is offered now, and puts them in
  await key('Digit2');
  const l3b = await list();
  if (!l3b) fail('the list shut when the other slot was selected (the basket is still in the hands)');
  if (!l3b?.keys.some((k) => k.startsWith('G') && k.includes(`${kinds.berry.name} ×5`))) fail(`G is not offered for the berries (${JSON.stringify(l3b?.keys)})`);
  await key('KeyG');
  const l3c = await list();
  const h3c = await hands();
  const fk = await page.evaluate(() => window.__rt.game.player.slots[0]?.item.inside?.[0]?.fk ?? 1);
  console.log('put in', JSON.stringify({ rows: l3c?.rows, sum: l3c?.sum, hands: h3c }));
  if (h3c.slots[1] !== null) fail('the berries did not leave the hands as they went into the basket');
  if (h3c.slots[0]?.inside?.join() !== 'v3t_berry*5') fail(`the berries are not in the basket (${JSON.stringify(h3c.slots[0])})`);
  if (l3c?.rows.length !== 1 || !l3c.rows[0].includes(`${kinds.berry.name} ×5`)) fail(`the basket's list does not show the berries (${JSON.stringify(l3c?.rows)})`);
  if (l3c && !l3c.sum.includes(`1 / ${kinds.basket.slots}`)) fail(`the basket's list does not count what is in it (${l3c.sum})`);
  if (l3c?.keys.some((k) => k.startsWith('G'))) fail('G is still offered with nothing in the hands');
  if (!near(fk, kinds.basket.decay)) fail(`the berries in the basket do not go off at its rate (${fk}, not ${kinds.basket.decay})`);
  // E takes the row out: into the free hand, not back into the basket it came from
  await key('KeyE');
  const l3d = await list();
  const h3d = await hands();
  console.log('taken out of the basket', JSON.stringify(h3d));
  if (h3d.slots[0]?.item !== 'v3t_basket' || h3d.slots[0].inside.length) fail(`the basket is not in its slot, empty (${JSON.stringify(h3d.slots[0])})`);
  if (h3d.slots[1]?.item !== 'v3t_berry' || h3d.slots[1].n !== 5 || h3d.sel !== 1) fail(`the berries did not come back into the free hand (${JSON.stringify(h3d)})`);
  if (!l3d || l3d.rows.length) fail('the basket\'s list did not stay open, empty, after its last thing was taken');

  // 4. the basket put down within reach: the list stays; walked away from: it shuts
  await page.evaluate(() => {
    const g = window.__rt.game;
    g.player.sel = 0;
    g.player.putDown();
  });
  await rt('simulate', 1.5);
  const l4 = await list();
  if (!l4) fail('the list shut when the basket was put down within reach');
  const away = await page.evaluate(() => {
    const g = window.__rt.game;
    const w = g.player.walker;
    const l = g.loose.list.find((x) => x.item?.item === 'v3t_basket');
    if (!l) return -1;
    for (let k = 0; k < 8; k++) {
      w.place(l.x + Math.cos((k * Math.PI) / 4) * 6, l.z + Math.sin((k * Math.PI) / 4) * 6, 0, 0);
      if (Math.hypot(w.x - l.x, w.z - l.z) > 4) break;
    }
    return Math.hypot(w.x - l.x, w.z - l.z);
  });
  await rt('simulate', 0.1);
  const l4b = await list();
  console.log('walked away', JSON.stringify({ away, open: !!l4b }));
  if (!(away > 4)) fail(`could not walk away from the basket (${away} m)`);
  else if (l4b) fail('the list did not shut when one walked away from the basket');
  // Tab with the mark on the basket lying there opens it; G puts the berries into it where it lies
  if (!(await rt('aimLoose', 'item:v3t_basket', 1.1))) fail('the mark could not be put on the basket lying about');
  await page.evaluate(() => (window.__rt.game.player.sel = 1));
  await key('Tab');
  const on4 = await page.evaluate(() => window.__rt.game.listV?.box?.uid ?? null);
  if (on4 !== basket.uid) fail('Tab with the mark on the basket lying about did not open its list');
  await key('KeyG');
  const in4 = await page.evaluate(() => {
    const g = window.__rt.game;
    const l = g.loose.list.find((x) => x.item?.item === 'v3t_basket');
    return { inside: (l?.item.inside ?? []).map((x) => `${x.item}*${x.n ?? 1}`), kg: l ? window.__w.C.massOf({ kind: 'item', item: l.item }) : 0, hand: g.player.slots[1] };
  });
  console.log('into the basket lying about', JSON.stringify(in4));
  if (in4.inside.join() !== 'v3t_berry*5' || in4.hand !== null) fail(`the berries did not go into the basket lying about (${JSON.stringify(in4)})`);
  await key('Tab');
  if (await list()) fail('Tab did not shut the list');

  // 5. a stack that has gone off is another kind where it lies, and is drawn again as that
  await rt('stand', home.footX, home.footZ, home.heading);
  await page.evaluate(() => {
    const p = window.__rt.game.player;
    p.sel = 1;
  });
  await rt('hold', 'item:v3t_berry', { n: 3 });
  await rt('drop');
  await rt('simulate', 1);
  const turned = await page.evaluate(() => {
    const g = window.__rt.game;
    const l = g.loose.list.find((x) => x.item?.item === 'v3t_berry');
    if (!l) return null;
    // (picked two days ago)
    l.item.t0 = window.__w.T.itemNow() - 48 * 3600;
    const uid = l.uid;
    // one thing lying about is looked at each frame
    for (let i = 0; i < g.loose.list.length + 2; i++) g.step(1 / 60, 1);
    const now = g.loose.list.find((x) => x.uid === uid);
    return now ? { item: now.item.item, n: now.item.n ?? 1, madeAs: now.madeAs, obj: now.obj.name, drawn: now.obj.children.length } : null;
  });
  console.log('gone off', JSON.stringify(turned));
  if (turned?.item !== 'v3t_mush' || turned.n !== 3) fail(`the berries lying about did not turn into what they go off into (${JSON.stringify(turned)})`);
  else if (turned.madeAs !== 'v3t_mush' || turned.obj !== 'loose:v3t_mush' || turned.drawn !== 1) fail(`what the berries turned into is not drawn again (${JSON.stringify(turned)})`);

  // 6. the recycler: five berries' organics for the stack, the basket's own and its berries' for the basket
  const cord = await rt('aimAt', 'gen_cord', 0, 1.0);
  if (cord !== 'device:gen_cord') console.log(`(the recycler was not tried: the generator's rope could not be aimed at, ${cord})`);
  else {
    let pulls = 0;
    while (!(await rt('workshop')).power && pulls < 6) {
      await rt('holdFor', 0.7);
      await rt('simulate', 0.3);
      pulls++;
    }
    if (!(await rt('workshop')).power) fail(`the generator did not start in ${pulls} pulls`);
    const s0 = (await rt('workshop')).stock.organics;
    await page.evaluate(() => (window.__rt.game.player.sel = 1));
    await rt('hold', 'item:v3t_berry', { n: 5 });
    const t = await rt('aimAt', 'recycler', Math.PI, 0.95);
    if (t !== 'device:recycler') fail(`not aimed at the recycler (${t})`);
    await rt('press');
    // (ground over 2.4 s whatever the count: counted up as it goes)
    await rt('simulate', 1.2);
    const mid = (await rt('workshop')).stock.organics - s0;
    await rt('simulate', 2);
    const s1 = (await rt('workshop')).stock.organics;
    console.log('the stack ground', JSON.stringify({ mid, all: s1 - s0 }));
    if (s1 - s0 !== 5 * kinds.berry.organics) fail(`five berries gave ${s1 - s0} organics, not ${5 * kinds.berry.organics}`);
    if (!(mid >= 1 && mid < 5 * kinds.berry.organics)) fail(`the stack's organics were not counted up as it was ground (${mid} half way)`);
    if ((await hands()).slots[1] !== null) fail('the stack is still in the hands after it went into the recycler');
    // the basket with the five berries in it, its list open: it goes in with them, and the list shuts
    if (!(await rt('pickUp', 'item:v3t_basket'))) fail('the basket could not be picked up');
    await key('Tab');
    if (!(await list())) fail('the list of the basket in the hands did not open');
    const t2 = await rt('aimAt', 'recycler', Math.PI, 0.95);
    const says = await page.evaluate(() => document.body.textContent ?? '');
    if (t2 === 'device:recycler' && !/连里面的 1 样/.test(says)) fail('the recycler does not say that the basket goes in with what is in it');
    await rt('press');
    await rt('simulate', 3.5);
    const s2 = (await rt('workshop')).stock.organics;
    const want = kinds.basket.organics + 5 * kinds.berry.organics;
    console.log('the basket ground', JSON.stringify({ organics: s2 - s1, open: !!(await list()) }));
    if (s2 - s1 !== want) fail(`the basket with five berries gave ${s2 - s1} organics, not ${want}`);
    if (await list()) fail('the list did not shut when its basket went into the recycler');
  }
  const last = await page.evaluate(() => window.__rt.lastError);
  if (last) fail(`the game reported an error: ${last}`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);

  // 7. a system's own source that throws (opened as a system would, with openList): told by the kernel, the list shut, the game going on
  // (the kernel writes what it sets apart to the console: the one error in this script's output is this one, thrown on purpose)
  const broke = await page.evaluate(async () => {
    const L = await import('/src/game/modcar/listSources.ts');
    const g = window.__rt.game;
    const rows = () => {
      throw new Error('thrown on purpose by v3_items_world.mjs');
    };
    const opened = L.openList({ title: '坏箱子', head: '坏箱子里的东西', empty: '', takeWord: '拿出来', near: () => true, version: () => 1, rows, takeAt: () => false });
    const listed = !!g.listV;
    g.simulate(0.2);
    const t0 = g.time;
    g.simulate(0.2);
    return { opened, listed, open: !!g.listV, last: window.__rt.lastError, went: g.time > t0 };
  });
  console.log('a source that throws', JSON.stringify(broke));
  if (!broke.opened || !broke.listed) fail('a source of a system\'s own did not open with openList');
  if (broke.open) fail('the list of a source that threw did not shut');
  if (!/list source 坏箱子 \(rows\): thrown on purpose/.test(broke.last)) fail(`the source that threw was not reported by the kernel (${broke.last})`);
  if (!broke.went) fail('the game did not go on after a source threw');
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `v3_items_world: ${bad} FAILED` : 'v3_items_world: ok');
process.exit(bad ? 1 : 0);
