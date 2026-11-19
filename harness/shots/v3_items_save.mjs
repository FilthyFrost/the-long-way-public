// Stacks, baskets and freshness through the real game's save (src/game/modcar/save.ts, docs/V3/nodes/N0-items.md),
// with the test content of a page opened with v3test=1 (src/game/modcar/v3/v3test: a berry that stacks to twelve
// and goes off, a jerky that stacks to eight, a basket that holds four stacks).
//   A. a new kept game with v3test=1: the developer's panel lists the registered category after the nine and
//      hands a thing out of it; a stack of berries in one slot, a basket holding two stacks (one never started)
//      in the other, a stack put down; a snapshot changes nothing; saved. Every thing in the save's text sits
//      where the save's walk looks for things.
//   B. the page again: the same counts, contents, freshness (to a tolerance) and uids; what had no time starts
//      at the save's own; a thing made afterwards has a uid past all of them; a stack used up is not written.
//   C. the same save on a page WITHOUT v3test=1, where those kinds do not exist — and with a backpack of a kind
//      that does not exist either, a known thing in one of its slots: the game comes up, the test things are
//      gone, what was in the slot the hotbar no longer has lies at one's feet, everything else is as it was, and
//      the player is told once how many were left out.
// Nothing here waits on the wall clock: for the game being ready, and for what it is asked in one go.
//   SHOTS_GL=llvmpipe node harness/shots/v3_items_save.mjs
import { launchBrowser, startServer, waitFrames } from './lib.mjs';

const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
const check = (ok, why) => {
  if (!ok) fail(why);
};
const close = (a, b, eps) => Math.abs(a - b) <= eps;
const KEY = 'modcar.save.v1';
const DAY = 86400;

/** every object in a save that looks like a thing one carries (its kind under `item`, a uid), with where it sits; the systems' slices are theirs */
function thingsByShape(node, path = '', out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((x, i) => thingsByShape(x, `${path}[${i}]`, out));
    return out;
  }
  if (typeof node.item === 'string' && typeof node.uid === 'string') out.push({ uid: node.uid, item: node.item, n: node.n ?? 1, path });
  for (const [k, v] of Object.entries(node)) if (!(path === '' && k === 'slices')) thingsByShape(v, path ? `${path}.${k}` : k, out);
  return out;
}
/** where the save's walk looks for things (save.ts thingLists, and the backpack), a thing in a basket among them */
const HOLDERS = /^(loose\[\d+\]\.item|hands\[\d+\]\.item|pack|wrecks\.kept\.[^.]+\.loose\[\d+\]\.item|places\.left\.[^.[]+\[\d+\]\.item)(\.inside\[\d+\])?$/;
/** how fresh a thing of the test content is at a time of the world's clock (the berry goes off in 24 game hours) */
const freshAt = (x, now) => (x.fresh === undefined ? 1 : x.t0 === undefined ? x.fresh : Math.max(0, x.fresh - (Math.max(0, now - x.t0) / DAY) * (x.fk ?? 1)));
const worldSeconds = (s) => (s.clock.day * 24 + s.clock.hour - s.clock.start) * 3600;

try {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  const ready = () => page.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 240_000 });
  /** the page left for another: its save as it stands now, and no more written as it goes */
  const open = async (address) => {
    await page.evaluate(() => {
      if (window.__rt?.game) window.__rt.game.saveOff = true;
    });
    await page.goto(address, { waitUntil: 'domcontentloaded' });
    await ready();
  };
  /** the things of the test content the game holds now, and what else there is to compare */
  const look = () =>
    page.evaluate(() => {
      const g = window.__rt.game;
      const p = g.player;
      const thing = (x) => ({ uid: x.uid, item: x.item, n: x.n ?? 1, fresh: x.fresh, t0: x.t0, fk: x.fk, q: x.q, inside: x.inside?.map(thing) });
      const k = g.kernel.telemetry();
      return {
        now: g.clock.worldSeconds,
        slots: p.slots.map((h) => (h?.kind === 'item' ? thing(h.item) : h ? h.kind : null)),
        sel: p.sel,
        pack: p.pack ? p.pack.item : null,
        lying: g.loose.list.filter((l) => l.item).map((l) => ({ ...thing(l.item), x: l.x, z: l.z })),
        loose: g.loose.list.length,
        vehicles: g.vehicles.map((v) => `${v.build.uid}:${v.build.frame}:${Object.keys(v.build.parts).length}`),
        done: [...g.done].sort(),
        at: [p.walker.x, p.walker.z],
        last: window.__rt.lastError,
        errors: k.errors,
        toast: document.querySelector('.mc-toast')?.textContent ?? '',
      };
    });
  const stored = () => page.evaluate((KEY) => JSON.parse(localStorage.getItem(KEY)), KEY);

  // ------------------------------------------------------------------ A. a new game with the test content
  await page.goto(`${url}/modcar.html?v3test=1`, { waitUntil: 'domcontentloaded' });
  await ready();
  const fresh = await page.evaluate(() => ({ keep: window.__rt.params.keep, saved: !!localStorage.getItem('modcar.save.v1'), loose: window.__rt.game.loose.list.length }));
  check(fresh.keep === true, `not a kept game: ${JSON.stringify(fresh)}`);

  // the developer's panel: the registered category after the nine, with tiles like the others; a click hands one out
  await page.evaluate(() => window.__rt.game.toggleDev(true));
  const panel = await page.evaluate(() => {
    const sections = [...document.querySelectorAll('.mc-dev section')].map((s) => ({ title: s.querySelector('h5')?.textContent ?? '', keys: [...s.querySelectorAll('.tile')].map((t) => t.dataset.key) }));
    const items = sections.filter((s) => s.keys.some((k) => k.startsWith('item:')));
    return { titles: items.map((s) => s.title), last: items[items.length - 1], tile: document.querySelector('.mc-dev .tile[data-key="item:v3t_basket"]')?.textContent ?? '' };
  });
  console.log('the panel', JSON.stringify(panel));
  // the nine built-in sections first and in their order; the categories systems registered after them (foraging's
  // ten, and whatever later nodes add), each once; the test category, registered without an order, last
  const nine = '食物,饮料,药品,衣服,背包,头灯,器具,材料箱,杂物';
  const titles = panel.titles;
  check(titles.slice(0, 9).join() === nine && titles[titles.length - 1] === '试验品' && new Set(titles).size === titles.length, `the panel's item sections: ${titles.join()}`);
  check(panel.last?.keys.join() === 'item:v3t_berry,item:v3t_mush,item:v3t_jerky,item:v3t_basket', `the registered category's tiles: ${panel.last?.keys.join()}`);
  check(panel.tile.includes('试验篮') && panel.tile.includes('装 4 叠'), `the basket's tile: ${panel.tile}`);
  await page.click('.mc-dev .tile[data-key="item:v3t_basket"]');
  await page.evaluate(() => window.__rt.game.toggleDev(false));
  const handed = await look();
  check(handed.loose === fresh.loose + 1 && handed.lying.some((l) => l.item === 'v3t_basket'), `a click on the tile did not hand a basket out: ${JSON.stringify(handed.lying)}`);

  // a stack put down; a stack of berries in one slot; a basket holding two stacks in the other; one used up on the floor
  const made = await page.evaluate(() => {
    const rt = window.__rt;
    const g = rt.game;
    const p = g.player;
    const now = g.clock.worldSeconds;
    const land = () => {
      for (let i = 0; i < 90; i++) g.step(1 / 60, 1);
    };
    p.sel = 0;
    rt.hold('item:v3t_jerky', { n: 5 });
    p.putDown();
    land();
    // (a stack used up that somebody failed to let go of: it must not be written)
    rt.hold('item:v3t_mush', { n: 0 });
    p.putDown();
    land();
    // picked an hour of the world's time ago, of the fourth quality
    rt.hold('item:v3t_berry', { n: 7, t0: now - 3600, q: 4 });
    p.sel = 1;
    rt.hold('item:v3t_berry', { n: 5, t0: now - 7200, fk: 0.5 });
    const started = p.slots[1].item;
    // (never started: no time to count from yet)
    rt.hold('item:v3t_berry', { n: 3 });
    const waiting = p.slots[1].item;
    rt.hold('item:v3t_basket', { inside: [started, waiting] });
    p.sel = 0;
    rt.simulate(0);
    // a snapshot changes nothing: the game's things before and after two of them, and the two the same
    const things = () => JSON.stringify([p.slots, p.pack, g.loose.list.map((l) => [l.part, l.tool, l.item, l.x, l.y, l.z]), g.stock, [...g.done]]);
    const before = things();
    const strip = (s) => JSON.stringify({ ...s, at: 0 });
    const a = strip(g.snapshot());
    const b = strip(g.snapshot());
    const same = things() === before && a === b;
    g.save();
    return { same, now: g.clock.worldSeconds };
  });
  check(made.same, 'a snapshot changed something in the game, or two snapshots differ');
  const a = await look();
  const sA = await stored();
  console.log('made', JSON.stringify({ slots: a.slots, lying: a.lying.map((l) => `${l.item}*${l.n}`), now: a.now }));
  check(a.slots[0]?.item === 'v3t_berry' && a.slots[0].n === 7 && a.slots[1]?.item === 'v3t_basket' && a.slots[1].inside?.map((x) => x.n).join() === '5,3', `the hands are not a stack and a basket: ${JSON.stringify(a.slots)}`);
  // the save's text: every thing in it sits where the walk looks; none used up; whole things, with what is in them
  const shaped = thingsByShape(sA);
  for (const t of shaped) check(HOLDERS.test(t.path), `a thing at ${t.path} (${t.item}): a holder the save's walk (save.ts thingLists) does not know`);
  check(!JSON.stringify(sA).includes('"n":0') && shaped.every((t) => t.n >= 1), 'a stack used up was written');
  const savedNow = worldSeconds(sA);
  check(close(savedNow, made.now, 1e-6), `the save's clock is not the world's: ${savedNow} ${made.now}`);
  const testThings = (list) => list.filter((t) => t.item.startsWith('v3t_'));
  console.log('saved', JSON.stringify(testThings(shaped).map((t) => `${t.path} ${t.item}*${t.n} ${t.uid}`)));
  check(testThings(shaped).length === 6, `six test things should be in the save: ${testThings(shaped).length}`);
  check(a.last === '' && a.errors === 0, `the kernel reported: ${a.last}`);

  // ------------------------------------------------------------------ B. the page again
  await open(`${url}/modcar.html?v3test=1`);
  const b = await look();
  console.log('again', JSON.stringify({ slots: b.slots, lying: b.lying.map((l) => `${l.item}*${l.n}`), now: b.now, toast: b.toast }));
  const flat = (v) => [...v.slots.filter((s) => s && typeof s === 'object'), ...v.lying].flatMap((x) => [x, ...(x.inside ?? [])]);
  // (the one used up was never written: it is not there; everything else is, uid for uid, count for count)
  const was = flat(a).filter((x) => x.n >= 1);
  const is = flat(b);
  check(is.map((x) => `${x.uid} ${x.item}*${x.n} q${x.q ?? ''}`).sort().join('|') === was.map((x) => `${x.uid} ${x.item}*${x.n} q${x.q ?? ''}`).sort().join('|'), `the things did not come back as they were: ${JSON.stringify(is)} for ${JSON.stringify(was)}`);
  check(b.slots[0]?.n === 7 && b.slots[1]?.item === 'v3t_basket' && b.slots[1].inside?.map((x) => `${x.item}*${x.n}`).join() === 'v3t_berry*5,v3t_berry*3' && b.sel === a.sel, `the hands: ${JSON.stringify(b.slots)}`);
  check(b.loose === a.loose - 1 && b.vehicles.join() === a.vehicles.join(), `the things lying about or the vehicles: ${b.loose} for ${a.loose} less the one used up, ${b.vehicles.length} vehicles`);
  for (const x of is) {
    const y = was.find((w) => w.uid === x.uid);
    if (!y) continue;
    if (y.t0 === undefined && x.fresh !== undefined) {
      // had no time: starts at the save's own, at the rate of what holds it
      check(close(x.t0, savedNow, 1e-6) && x.fk === 0.5 && x.fresh === 1, `the stack that had not started: ${JSON.stringify(x)} at ${savedNow}`);
      continue;
    }
    check(x.fresh === y.fresh && x.t0 === y.t0 && x.fk === y.fk, `freshness as written: ${JSON.stringify(x)} for ${JSON.stringify(y)}`);
    // as fresh as it was (the world's clock has gone on a little since the save)
    const [f0, f1] = [freshAt(y, made.now), freshAt(x, b.now)];
    check(f1 <= f0 + 1e-9 && f0 - f1 < 0.01, `${x.item} ${x.uid} was ${f0} fresh and is ${f1}`);
  }
  check(close(freshAt(b.slots[0], b.now), 1 - 3600 / DAY, 0.01) && close(freshAt(b.slots[1].inside[0], b.now), 1 - (7200 / DAY) * 0.5, 0.01), 'the berries are not as fresh as an hour, and two hours in a basket, make them');
  check(b.now >= made.now && b.now - made.now < 600, `the world's clock did not go on from the save: ${b.now} after ${made.now}`);
  check(b.last === '' && b.errors === 0 && b.toast.startsWith('接着上次的进度'), `the load was not a quiet one: ${b.last} / ${b.toast}`);
  // a thing made afterwards: a uid past every one read back (those in the basket too)
  const after = await page.evaluate(() => {
    const p = window.__rt.game.player;
    const keep = p.slots[p.sel];
    window.__rt.hold('item:v3t_jerky');
    const uid = p.slots[p.sel].item.uid;
    p.slots[p.sel] = keep;
    window.__rt.simulate(0);
    return uid;
  });
  const num = (uid) => parseInt(uid.slice(1), 36);
  const top = Math.max(...thingsByShape(sA).map((t) => num(t.uid)));
  check(num(after) > top && !thingsByShape(sA).some((t) => t.uid === after), `a thing made after the load has the uid ${after}; the save's go up to ${top.toString(36)}`);

  check(errors.length === 0, `the pages with the test content wrote out: ${errors.slice(0, 3).join(' | ')}`);

  // ------------------------------------------------------------------ C. the same save where the kinds do not exist
  // (as the page stands now, with a backpack of a kind that does not exist on, and a tin in one of its slots)
  const sB = await page.evaluate((KEY) => {
    const g = window.__rt.game;
    g.save();
    g.saveOff = true;
    const s = JSON.parse(localStorage.getItem(KEY));
    s.pack = { uid: 'izzz1', item: 'v3t_pack' };
    s.hands.push({ item: { uid: 'izzz2', item: 'food_fish_can' } });
    localStorage.setItem(KEY, JSON.stringify(s));
    return s;
  }, KEY);
  const gone = thingsByShape(sB).filter((t) => t.item.startsWith('v3t_'));
  const lost = gone.reduce((n, t) => n + t.n, 0);
  errors.length = 0;
  await open(`${url}/modcar.html`);
  const c = await look();
  console.log('without the test content', JSON.stringify({ slots: c.slots, lying: c.lying.map((l) => `${l.item}*${l.n}`), toast: c.toast, last: c.last, lost }));
  check(lost === 7 + 1 + 5 + 3 + 5 + 1 + 1, `the save held ${lost} test things`);
  check(c.vehicles.join() === b.vehicles.join() && c.done.join() === b.done.join() && close(c.at[0], b.at[0], 0.5) && close(c.at[1], b.at[1], 0.5), `the game is not as it was: ${JSON.stringify({ vehicles: c.vehicles, done: c.done, at: c.at })}`);
  check(c.slots.length === 2 && c.slots.every((s) => s === null) && c.pack === null && c.sel === b.sel, `the hands are not empty: ${JSON.stringify(c.slots)} ${c.pack}`);
  check(!flat(c).some((x) => x.item.startsWith('v3t_')), 'a test thing is still there');
  // (the tin was in a slot the hotbar no longer has: put down where one stands; the jerky and the basket that lay about are gone)
  const tin = c.lying.find((l) => l.uid === 'izzz2');
  check(!!tin && Math.hypot(tin.x - c.at[0], tin.z - c.at[1]) < 1.5, `the tin of the slot that is gone is not at one's feet: ${JSON.stringify(tin)}`);
  check(c.loose === b.loose - 2 + 1, `things lying about: ${c.loose} for ${b.loose} less the jerky and the basket, plus the tin`);
  const words = `有 ${lost} 件认不出的东西没能读回来`;
  check(c.toast === words, `the player was not told: "${c.toast}"`);
  check(c.last === `save: ${lost} things of kinds this build does not have were not read back (v3t_basket, v3t_berry, v3t_jerky, v3t_pack)` && c.errors === 1, `the kernel's report: ${c.last} (${c.errors})`);
  // said once: the game goes on, nothing more is reported, and what it saves now has none of them
  await waitFrames(page, 3);
  const later = await page.evaluate((KEY) => {
    const g = window.__rt.game;
    g.save();
    return { errors: g.kernel.telemetry().errors, text: localStorage.getItem(KEY), unread: localStorage.getItem(`${KEY}.unread`) };
  }, KEY);
  check(later.errors === 1 && !later.text.includes('v3t_') && later.unread === null, `after the load: ${later.errors} reports, test things in the next save: ${later.text.includes('v3t_')}, set aside: ${later.unread !== null}`);
  check(errors.length === 1 && errors[0].includes('[kernel] save'), `what the page wrote out: ${errors.join(' | ')}`);
  errors.length = 0;

  await page.evaluate((KEY) => {
    window.__rt.game.saveOff = true;
    localStorage.removeItem(KEY);
  }, KEY);
  if (errors.length) fail(`page errors ${errors.slice(0, 3)}`);
  await ctx.close();
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `${bad} failed` : 'v3 items save ok');
process.exit(bad ? 1 : 0);
