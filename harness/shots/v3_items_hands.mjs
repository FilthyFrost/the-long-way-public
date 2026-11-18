// The hands and things that stack, hold things and go off (docs/V3/nodes/N0-items-hands.md), in the live game
// loop with the real keys, on a page with the test content (v3test=1: a berry that stacks to twelve and goes off
// in a day, a basket that holds four stacks): three berries lying apart end as one slot of three with its count
// on the hotbar; F eats one of them and the game says one was eaten; G puts the stack down as one thing and E
// takes it up again; with a full stack in a slot the next berry takes the other slot; of a stack lying about
// only what the hands have room for goes in and the rest stays lying, the same thing with fewer in it; with a
// basket in a slot the pick goes into the basket (its slot on the hotbar shows how full it is), and the basket
// goes down and comes up with it inside; while a list is open the hands do not offer G for putting down; a day
// on, the stack in the hands has turned into what its kind says, by its name, its card and the model in the
// hand, and the berries in the basket have not; a thing with a quality shows it as stars. On a page without
// v3test=1 none of these kinds exist.
// Nothing here waits on the clock on the wall for a result: only for the thing itself, or for frames.
// Writes loop/shots/v3_items_hands/*.png.
//   SHOTS_GL=llvmpipe node harness/shots/v3_items_hands.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, holdKeyUntil, launchBrowser, openGame, startServer, waitFrames } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/v3_items_hands');
fs.mkdirSync(out, { recursive: true });
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
try {
  // ---------------------------------------------------------------- the page with the test content
  const { page, errors } = await openGame(browser, `${url}/modcar.html?new=1&v3test=1`);
  await page.evaluate(() => window.__rt.game.ui.showHelp(false));
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  /** wait until something is so in the page (the game's own state, never the clock on the wall); false: it never was */
  const until = async (fn, arg = null, timeout = 90_000) => {
    try {
      await page.waitForFunction(fn, arg, { timeout, polling: 50 });
      return true;
    } catch {
      return false;
    }
  };
  /** the hands, what lies about of the test things, and the words on screen */
  const look = () =>
    page.evaluate(() => {
      const g = window.__rt.game;
      const p = g.player;
      const thing = (it) => (it ? { item: it.item, n: it.n ?? 1, uid: it.uid, inside: (it.inside ?? []).map((x) => `${x.item}*${x.n ?? 1}`) } : null);
      const shown = (sel) => {
        const e = document.querySelector(sel);
        return !!e && e.style.display !== 'none';
      };
      return {
        slots: p.slots.map((h) => (h?.kind === 'item' ? thing(h.item) : h ? { item: h.kind, n: 1, inside: [] } : null)),
        sel: p.sel,
        tele: p.telemetry(),
        lying: g.loose.list.filter((l) => l.item?.item.startsWith('v3t_')).map((l) => ({ ...thing(l.item), resting: l.resting })),
        counts: [...document.querySelectorAll('.mc-hot .s .c')].map((e) => e.textContent),
        titles: [...document.querySelectorAll('.mc-hot .s')].map((e) => e.getAttribute('title')),
        held: shown('.mc-ic.held') ? document.querySelector('.mc-ic.held .nm').textContent : '',
        heldText: shown('.mc-ic.held') ? document.querySelector('.mc-ic.held').textContent : '',
        acts: shown('.mc-acts') ? document.querySelector('.mc-acts').textContent : '',
        model: g.heldThing.key,
      };
    });
  /** the test things lying about have come to rest */
  const atRest = () => until(() => window.__rt.game.loose.list.filter((l) => l.item?.item.startsWith('v3t_')).every((l) => l.resting));
  /**
   * Lay a new thing on the floor ahead, turned by `turn` from the way one faces: into the hands the way the
   * scripts put things there (hold: the hand it is in is the selected one), then put down as G does.
   */
  const lay = async (id, turn = 0, opts = {}) => {
    const ok = await page.evaluate(
      ({ id, turn, opts }) => {
        const g = window.__rt.game;
        window.__rt.hold(`item:${id}`, opts);
        const h = g.player.held;
        if (h?.kind !== 'item' || h.item.item !== id) return false;
        g.player.walker.heading = g.input.lookYaw + turn;
        return g.player.putDown();
      },
      { id, turn, opts },
    );
    if (!ok) fail(`could not lay a ${id} on the floor`);
    return ok;
  };
  /** stand before the first thing of a kind lying about, the mark on it, and stay on it through the loop's own frames */
  const aim = async (id) => {
    for (let i = 0; i < 4; i++) {
      if (!(await rt('aimLoose', `item:${id}`, 1.0))) continue;
      await waitFrames(page, 2);
      if (await page.evaluate((id) => window.__rt.game.player.target?.kind === 'loose' && window.__rt.game.player.target.loose.item?.item === id, id)) return true;
    }
    return false;
  };
  /** E on the first thing of a kind lying about, until `done` is so; the words over the hotbar as they were before the press */
  const take = async (id, done, arg = null) => {
    let said = '';
    for (let i = 0; i < 3; i++) {
      if (!(await aim(id))) continue;
      said = (await look()).acts;
      await page.keyboard.press('KeyE');
      if (await until(done, arg, 30_000)) return said;
    }
    fail(`E did not take the ${id} up (${said})`);
    return said;
  };
  const shot = (name) => page.screenshot({ path: path.join(out, `${name}.png`) });
  const here = await page.evaluate(() => ({ x: window.__rt.game.player.walker.x, z: window.__rt.game.player.walker.z, renderer: window.__rt.info.renderer }));
  console.log('standing at', JSON.stringify(here));

  // ---- three berries lying apart, picked up one after another: one slot of three
  await lay('v3t_berry', 0);
  await lay('v3t_berry', 2.1);
  await lay('v3t_berry', -2.1);
  check(await atRest(), 'the berries did not come to rest');
  let s = await look();
  check(s.lying.length === 3 && s.lying.every((l) => l.item === 'v3t_berry' && l.n === 1) && s.slots.every((h) => !h), `three berries are not lying about with empty hands (${JSON.stringify(s.lying)}, ${JSON.stringify(s.slots)})`);
  const lyingN = (n) => until((n) => window.__rt.game.loose.list.filter((l) => l.item?.item.startsWith('v3t_')).length === n, n, 30_000);
  let said = await take('v3t_berry', (n) => window.__rt.game.loose.list.filter((l) => l.item?.item.startsWith('v3t_')).length === n, 2);
  check(/拿起/.test(said) && !/快捷栏/.test(said), `the first berry's words (${said})`);
  said = await take('v3t_berry', (n) => window.__rt.game.loose.list.filter((l) => l.item?.item.startsWith('v3t_')).length === n, 1);
  check(/叠到快捷栏 1/.test(said), `the second berry's words do not say it goes onto the stack in slot 1 (${said})`);
  await take('v3t_berry', (n) => window.__rt.game.loose.list.filter((l) => l.item?.item.startsWith('v3t_')).length === n, 0);
  check(await lyingN(0), 'a berry is still lying about');
  // (the hotbar's count and the card are written in the frame the count changes in)
  check(await until(() => document.querySelectorAll('.mc-hot .s .c')[0]?.textContent === '3'), 'the hotbar does not show a count of 3');
  s = await look();
  console.log('three picked up', JSON.stringify({ slots: s.slots, sel: s.sel, counts: s.counts, held: s.held, tele: { held: s.tele.held, heldN: s.tele.heldN, counts: s.tele.counts } }));
  check(s.slots[0]?.item === 'v3t_berry' && s.slots[0].n === 3 && s.slots[1] === null && s.sel === 0, `three berries are not one slot of three (${JSON.stringify(s.slots)})`);
  check(s.tele.held === 'item:v3t_berry' && s.tele.heldN === 3 && s.tele.slot1N === 3 && s.tele.slot2N === 0 && s.tele.counts === '3,0', `the telemetry does not count them (${JSON.stringify(s.tele)})`);
  check(s.counts[0] === '3' && s.counts[1] === '' && s.titles[0] === '试验莓', `the hotbar's counts (${JSON.stringify(s.counts)}, ${JSON.stringify(s.titles)})`);
  check(await until(() => document.querySelector('.mc-ic.held .nm')?.textContent === '试验莓 ×3'), `the card in the hands is not three berries (${s.held})`);
  // (the card in the hands is cut down to its name and its bars for a moment after the card of what the mark was on has gone: wait for the whole of it)
  check(await until(() => /3 个一叠（最多 12 个）/.test(document.querySelector('.mc-ic.held')?.textContent ?? '')), `the card does not say how many of how many (${(await look()).heldText})`);
  s = await look();
  check(/新鲜程度/.test(s.heldText) && /新鲜 · 还能放约 2[34] 小时/.test(s.heldText) && /饱腹（每个）/.test(s.heldText), `the card lacks the freshness or what one of them does (${s.heldText})`);
  await shot('01_three_in_one_slot');

  // ---- F eats one: two left, and what the game says was eaten is one
  await page.evaluate(() => {
    window.__ate = [];
    window.__rt.game.events.on('body:ate', (e) => window.__ate.push({ item: e.item.item, n: e.item.n ?? 1, uid: e.item.uid }));
  });
  const stackUid = s.slots[0]?.uid;
  check(await holdKeyUntil(page, 'KeyF', () => !!window.__rt.game.player.use, null, 60_000), 'F did not start eating');
  check(await until(() => window.__ate.length > 0), 'nothing was eaten');
  check(await until(() => document.querySelectorAll('.mc-hot .s .c')[0]?.textContent === '2'), 'the hotbar does not show a count of 2 after eating');
  s = await look();
  const ate = await page.evaluate(() => window.__ate);
  console.log('ate', JSON.stringify({ ate, slots: s.slots, counts: s.counts }));
  check(ate.length === 1 && ate[0].item === 'v3t_berry' && ate[0].n === 1 && ate[0].uid !== stackUid, `what was eaten is not one berry off the stack (${JSON.stringify(ate)})`);
  check(s.slots[0]?.n === 2 && s.slots[0].uid === stackUid && s.tele.heldN === 2, `eating one did not leave two in the slot (${JSON.stringify(s.slots)})`);

  // ---- G puts the stack down as one thing with its count; E takes it up again
  check(await holdKeyUntil(page, 'KeyG', () => window.__rt.game.player.telemetry().held === '', null, 60_000), 'G did not put the stack down');
  check(await atRest(), 'the stack did not come to rest');
  s = await look();
  console.log('put down', JSON.stringify({ lying: s.lying, slots: s.slots }));
  check(s.lying.length === 1 && s.lying[0].item === 'v3t_berry' && s.lying[0].n === 2 && s.lying[0].uid === stackUid && s.slots.every((h) => !h), `the stack put down is not one thing of two (${JSON.stringify(s.lying)})`);
  said = await take('v3t_berry', () => window.__rt.game.player.telemetry().heldN === 2);
  s = await look();
  check(/试验莓 ×2/.test(said), `the words for a stack lying about do not say how many (${said})`);
  check(s.lying.length === 0 && s.slots[0]?.n === 2 && s.slots[0].uid === stackUid && s.slots[1] === null, `taking the stack up again did not restore it (${JSON.stringify(s.slots)}, ${JSON.stringify(s.lying)})`);

  // ---- a full stack of twelve in a slot: the next berry takes the other slot
  await rt('hold', 'item:v3t_berry', { n: 12 });
  await page.keyboard.press('Digit2');
  check(await until(() => window.__rt.game.player.sel === 1), '2 did not select the second slot');
  await lay('v3t_berry', 0);
  check(await atRest(), 'the fourth berry did not come to rest');
  await page.keyboard.press('Digit1');
  check(await until(() => window.__rt.game.player.sel === 0), '1 did not select the first slot');
  said = await take('v3t_berry', () => window.__rt.game.player.telemetry().slot2N === 1);
  check(/放进快捷栏 2/.test(said), `with a full stack in the hands the words do not say slot 2 (${said})`);
  check(await until(() => document.querySelectorAll('.mc-hot .s .c')[0]?.textContent === '12'), 'the hotbar does not show the full stack');
  s = await look();
  console.log('a full stack and one more', JSON.stringify({ slots: s.slots, sel: s.sel, counts: s.counts }));
  check(s.slots[0]?.n === 12 && s.slots[1]?.item === 'v3t_berry' && s.slots[1].n === 1 && s.sel === 1 && s.lying.length === 0, `the thirteenth berry did not take a new slot (${JSON.stringify(s.slots)})`);
  check(s.counts[0] === '12' && s.counts[1] === '', `the hotbar's counts with a full stack and a single one (${JSON.stringify(s.counts)})`);

  // ---- a stack of three lying about, room for one in the hands: one goes in, the same thing stays lying with two
  await lay('v3t_berry', 0, { n: 3 });
  check(await atRest(), 'the stack of three did not come to rest');
  await rt('hold', 'item:v3t_berry', { n: 11 });
  s = await look();
  const threeUid = s.lying[0]?.uid;
  check(s.lying.length === 1 && s.lying[0].n === 3 && s.slots[0]?.n === 12 && s.slots[1]?.n === 11, `not a stack of three lying about before two stacks in the hands (${JSON.stringify(s.lying)}, ${JSON.stringify(s.slots)})`);
  said = await take('v3t_berry', () => window.__rt.game.player.telemetry().slot2N === 12);
  check(/叠到快捷栏 2/.test(said) && /只拿得下 1 个/.test(said), `the words do not say that one of the three goes onto the stack in slot 2 (${said})`);
  s = await look();
  console.log('part of a stack', JSON.stringify({ said, slots: s.slots, lying: s.lying }));
  check(s.slots[0]?.n === 12 && s.slots[1]?.n === 12 && s.lying.length === 1 && s.lying[0].n === 2 && s.lying[0].uid === threeUid, `the rest of the stack is not lying there, the same thing with two in it (${JSON.stringify(s.lying)}, ${JSON.stringify(s.slots)})`);
  // (no room for any of it now: the mark does not take it)
  check(!(await rt('aimLoose', 'item:v3t_berry', 1.0)), 'the mark is on a stack the hands have no room for');

  // ---- a basket in a slot: the pick goes into the basket (no slot is free)
  await rt('hold', 'item:v3t_basket');
  said = await take('v3t_berry', () => (window.__rt.game.player.slots[1]?.item?.inside?.length ?? 0) === 1);
  check(/装进试验篮/.test(said) && !/只拿得下/.test(said), `the words do not say the berries go into the basket (${said})`);
  check(await until(() => /试验莓/.test(document.querySelector('.mc-ic.held')?.textContent ?? '') && document.querySelector('.mc-ic.held .nm')?.textContent === '试验篮'), 'the basket card does not say what is in it');
  s = await look();
  console.log('into the basket', JSON.stringify({ slots: s.slots, sel: s.sel, lying: s.lying }));
  check(s.slots[0]?.n === 12 && s.slots[1]?.item === 'v3t_basket' && s.slots[1].inside.join() === 'v3t_berry*2' && s.lying.length === 0 && s.sel === 1, `the berries did not go into the basket (${JSON.stringify(s.slots)})`);
  // (the card in the hands cut down while another card is up shows only its bars: wait for the whole of it)
  check(await until(() => /×2试验莓/.test(document.querySelector('.mc-ic.held')?.textContent ?? '') && /1 \/ 4 格 · 0\.10 \/ 3 kg/.test(document.querySelector('.mc-ic.held')?.textContent ?? '') && /坏得慢/.test(document.querySelector('.mc-ic.held')?.textContent ?? '')), `the basket card lacks what is in it, how full it is or how it keeps things (${(await look()).heldText})`);
  // (the bar under the basket's slot: one of its four slots taken)
  const bar = await page.evaluate(() => [...document.querySelectorAll('.mc-hot .s')].map((e) => e.querySelector('.f i')?.style.width ?? ''));
  check(bar[0] === '' && bar[1] === '25%', `the hotbar does not show how full the basket is (${JSON.stringify(bar)})`);
  await shot('02_in_the_basket');
  // a list open (Tab): G is the list's then, and the hands do not offer it for putting down
  const keysSay = (re) => until((src) => new RegExp(src).test(document.querySelector('.mc-keys')?.textContent ?? ''), re.source, 30_000);
  const keysLack = (re) => until((src) => !new RegExp(src).test(document.querySelector('.mc-keys')?.textContent ?? ''), re.source, 30_000);
  check(await keysSay(/放下/), 'G is not offered for putting the basket down');
  await page.keyboard.press('Tab');
  check(await until(() => window.__rt.listOpen() !== null, null, 30_000), 'Tab did not open a list');
  check(await keysLack(/放下/), 'G is still offered for putting down while a list is open');
  await page.keyboard.press('Tab');
  check(await until(() => window.__rt.listOpen() === null, null, 30_000), 'Tab did not shut the list');
  check(await keysSay(/放下/), 'G is not offered for putting down again once the list is shut');
  // the basket goes down and comes up again with the berry in it
  const basketUid = s.slots[1]?.uid;
  check(await holdKeyUntil(page, 'KeyG', () => window.__rt.game.player.telemetry().held === '', null, 60_000), 'G did not put the basket down');
  check(await atRest(), 'the basket did not come to rest');
  s = await look();
  check(s.lying.length === 1 && s.lying[0].uid === basketUid && s.lying[0].inside.join() === 'v3t_berry*2', `the basket put down lost what was in it (${JSON.stringify(s.lying)})`);
  await take('v3t_basket', () => window.__rt.game.player.telemetry().held === 'item:v3t_basket');
  s = await look();
  check(s.slots[1]?.uid === basketUid && s.slots[1].inside.join() === 'v3t_berry*2' && s.slots[0]?.n === 12 && s.lying.length === 0, `the basket taken up again is not as it was (${JSON.stringify(s.slots)})`);

  // ---- a day on: the stack in the open hand has turned into what its kind says; the berries in the basket (half as fast) have not
  await page.keyboard.press('Digit1');
  check(await until(() => window.__rt.game.player.sel === 0 && String(window.__rt.game.heldThing.key).includes('v3t_berry')), 'the berries are not in the hand');
  const t0 = await page.evaluate(() => ({ s: window.__rt.game.clock.worldSeconds, h: window.__rt.game.env.clock.hourAt(window.__rt.game.time) }));
  // (three hours on, then the hour hand an hour back: the next day, 26 hours in all)
  await rt('setHour', t0.h + 3);
  await rt('setHour', t0.h + 2);
  check(await until(() => window.__rt.game.player.telemetry().held === 'item:v3t_mush'), 'the berries in the hand did not turn after a day');
  check(await until(() => document.querySelector('.mc-ic.held .nm')?.textContent === '烂掉的试验莓 ×12' && String(window.__rt.game.heldThing.key).includes('v3t_mush')), 'the card or the model in the hand is not what the berries turned into');
  s = await look();
  const passed = (await page.evaluate(() => window.__rt.game.clock.worldSeconds)) - t0.s;
  console.log('a day on', JSON.stringify({ hours: +(passed / 3600).toFixed(2), slots: s.slots, titles: s.titles, counts: s.counts, held: s.held, model: s.model }));
  check(passed > 24 * 3600 && passed < 28 * 3600, `the world's clock went on ${passed} s, not a day and two hours`);
  check(s.slots[0]?.item === 'v3t_mush' && s.slots[0].n === 12 && s.titles[0] === '烂掉的试验莓' && s.counts[0] === '12', `the stack did not turn whole (${JSON.stringify(s.slots)}, ${JSON.stringify(s.titles)})`);
  check(!/新鲜程度/.test(s.heldText), `what the berries turned into still has a freshness (${s.heldText})`);
  check(s.slots[1]?.inside.join() === 'v3t_berry*2', `the berries in the basket turned too (${JSON.stringify(s.slots[1])})`);
  await page.keyboard.press('Digit2');
  check(await until(() => document.querySelector('.mc-ic.held .nm')?.textContent === '试验篮' && /×2试验莓/.test(document.querySelector('.mc-ic.held')?.textContent ?? '')), `the basket card does not show the berries still in it (${(await look()).heldText})`);
  await shot('03_a_day_on');

  // ---- a thing with a quality: its stars on the card, beside the kind's grade
  await rt('hold', 'item:v3t_jerky', { n: 3, q: 4 });
  check(await until(() => document.querySelector('.mc-ic.held .nm')?.textContent === '试验肉干 ×3' && !!document.querySelector('.mc-ic.held .rw [data-q="4"]')), `the card does not draw the quality as stars (${(await look()).heldText})`);
  s = await look();
  check(/品质/.test(s.heldText) && s.counts[1] === '3' && s.tele.heldN === 3, `the jerky's card or count (${s.heldText}, ${JSON.stringify(s.counts)})`);
  await shot('04_quality');

  const lastError = await page.evaluate(() => window.__rt.lastError);
  if (lastError) fail(`a frame threw: ${lastError}`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
  await page.close();

  // ---------------------------------------------------------------- a page without the test content: none of its kinds exist
  const plain = await openGame(browser, `${url}/modcar.html?new=1`);
  const made = await plain.page.evaluate(() =>
    ['v3t_berry', 'v3t_mush', 'v3t_jerky', 'v3t_basket'].map((id) => {
      try {
        window.__rt.hold(`item:${id}`);
        return `${id}: made`;
      } catch (e) {
        return String(e.message);
      }
    }),
  );
  console.log('without v3test=1', JSON.stringify(made));
  check(made.length === 4 && made.every((m) => /^no item v3t_/.test(m)), `the test kinds exist on a page that did not ask for them (${JSON.stringify(made)})`);
  // (and the hands are as they always were: a thing held, one of it, nothing in the slot's corner)
  await plain.page.evaluate(() => window.__rt.hold('item:food_chips'));
  check(await (async () => {
    try {
      await plain.page.waitForFunction(() => document.querySelectorAll('.mc-hot .s').length === 2 && document.querySelector('.mc-ic.held .nm')?.textContent === '虾片', null, { timeout: 60_000, polling: 50 });
      return true;
    } catch {
      return false;
    }
  })(), 'the crackers are not in the hands on the plain page');
  const plainHud = await plain.page.evaluate(() => ({ counts: [...document.querySelectorAll('.mc-hot .s .c')].map((e) => e.textContent), tele: window.__rt.game.player.telemetry(), text: document.querySelector('.mc-ic.held')?.textContent ?? '' }));
  check(plainHud.counts.join('|') === '|' && plainHud.tele.heldN === 1 && plainHud.tele.counts === '1,0' && !/一叠|新鲜程度/.test(plainHud.text), `a plain thing shows a count or a freshness (${JSON.stringify(plainHud)})`);
  const plainError = await plain.page.evaluate(() => window.__rt.lastError);
  if (plainError) fail(`a frame threw on the plain page: ${plainError}`);
  if (plain.errors.length) fail(`page errors on the plain page: ${plain.errors.slice(0, 5).join(' | ')}`);
  await plain.page.close();
} catch (e) {
  fail(e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `v3_items_hands: ${bad} FAILED` : 'v3_items_hands: ok');
process.exit(bad ? 1 : 0);
