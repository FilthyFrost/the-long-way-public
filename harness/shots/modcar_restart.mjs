// From the start, for showing the game to somebody: the developer's panel's 「从头开始」 (a question first)
// clears the save and begins a new game in the workshop — from a page opened on the road after the world was
// made again too, the address back to the plain one (the picture's quality kept); the moved dials stay unless
// asked, and are kept on the dev server first when they go; F9 twice does the same. In the live game loop,
// in a browser of its own (its own storage). Writes loop/shots/modcar_restart/*.png.
//   SHOTS_GPU=1 node harness/shots/modcar_restart.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/modcar_restart');
fs.mkdirSync(out, { recursive: true });
// (the copy of the dials the dial reset leaves on the dev server: one there already is put back at the end)
const copies = ['json', 'txt'].map((x) => path.join(ROOT, `loop/dev-tune-before-restart.${x}`));
const had = copies.map((f) => (fs.existsSync(f) ? fs.readFileSync(f) : null));
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  const ready = () => page.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 180_000 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const open = async (q = '') => {
    await page.goto(`${url}/modcar.html${q}`, { waitUntil: 'domcontentloaded' });
    await ready();
  };
  // (a reload of the page: the new page's game waited for, not the old one's)
  const reloaded = async (act) => {
    const loaded = page.waitForEvent('domcontentloaded', { timeout: 120_000 });
    await act();
    await loaded;
    await ready();
    await page.waitForTimeout(300);
  };
  const state = () =>
    page.evaluate(() => {
      const g = window.__rt.game;
      const raw = localStorage.getItem('modcar.save.v1');
      const s = raw ? JSON.parse(raw) : null;
      return {
        search: location.search,
        place: g.place,
        keep: window.__rt.params.keep,
        battery: !!g.vehicles[0]?.build.parts.battery,
        vehicles: g.vehicles.length,
        loose: g.loose.list.length,
        done: [...g.done].sort(),
        saved: s ? { place: s.place, battery: !!s.vehicles[0]?.build.parts.battery, done: s.done.length } : null,
        dials: g.tune.changed().map((d) => d.id),
        panel: !!g.devPanel?.open,
        help: g.ui.helpShown,
      };
    });
  // some progress: the bonnet open, the battery fitted, written down
  const progress = async () => {
    await rt('aim', 0, 'hood', 1.5);
    await rt('press');
    await rt('simulate', 0.8);
    await rt('pickUp', 'bat_std');
    await rt('aim', 0, 'battery', 1.4);
    await rt('useFor', 1.6);
    await page.evaluate(() => (window.__rt.game.player.held = null));
    await page.evaluate(() => window.__rt.game.save());
  };
  const fresh = (s, s0, what) => {
    if (s.search !== '') fail(`${what}: the address still asks for something (${s.search})`);
    if (s.place !== 'garage') fail(`${what}: not in the workshop (${s.place})`);
    if (!s.keep) fail(`${what}: the new game is not kept`);
    if (s.battery) fail(`${what}: the project car still has the battery fitted`);
    if (s.vehicles !== s0.vehicles || s.loose !== s0.loose) fail(`${what}: ${s.vehicles} vehicles and ${s.loose} things about, a new game has ${s0.vehicles} and ${s0.loose}`);
    if (s.done.join() !== s0.done.join()) fail(`${what}: the checklist has ${s.done} done`);
    if (s.saved?.battery) fail(`${what}: the old save came back`);
    if (s.panel) fail(`${what}: the panel is open`);
    if (!s.help) fail(`${what}: no key card at the start`);
  };

  // ---- a new game, as on a first visit
  await open();
  const s0 = await state();
  console.log('new game', JSON.stringify(s0));
  if (!s0.keep || s0.battery || s0.place !== 'garage') fail('the first visit is not a new game in the workshop');
  await progress();
  await rt('devDial', 'rain.count', 2);
  const s1 = await state();
  if (!s1.saved?.battery || !s1.done.includes('hood')) fail(`no progress to clear ${JSON.stringify(s1)}`);

  // ---- the page as the terrain tab leaves it (on the road, the panel open again), the save still there
  await open('?start=road&s=3000&seed=4242&time=15.00&build=stock:sedan&devpanel=weather');
  const s2 = await state();
  console.log('made again', JSON.stringify(s2));
  if (s2.place !== 'road' || !s2.panel || !s2.saved?.battery) fail(`not the made-again page with the save kept ${JSON.stringify(s2)}`);
  // the button's bubble
  await page.hover('.mc-dev .hd .restart');
  await page.waitForTimeout(150);
  const tip = await page.evaluate(() => {
    const t = document.querySelector('.mc-dev-tip');
    return t && t.style.display !== 'none' ? t.textContent : '';
  });
  if (!/从头开始/.test(tip)) fail(`no bubble on the button (${tip})`);
  await page.screenshot({ path: path.join(out, 'tip.png') });
  // the question; no: nothing happens
  await page.click('.mc-dev .hd .restart');
  const ask = await page.evaluate(() => {
    const a = document.querySelector('.mc-dev .ask');
    return { shown: a.style.display !== 'none', text: a.textContent, check: !!a.querySelector('input[data-act="dials"]') };
  });
  console.log('asked', JSON.stringify(ask));
  if (!ask.shown || !/清空存档/.test(ask.text)) fail('no question under the title');
  if (!ask.check) fail('no box for the moved dial');
  await page.screenshot({ path: path.join(out, 'ask.png') });
  const box = await page.evaluate(() => {
    const r = document.querySelector('.mc-dev').getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: Math.min(r.height, 330) };
  });
  await page.screenshot({ path: path.join(out, 'ask_panel.png'), clip: box });
  await page.click('.mc-dev .ask [data-act="restart-no"]');
  if (await page.evaluate(() => document.querySelector('.mc-dev .ask').style.display !== 'none')) fail('取消 did not put the question away');
  if (!(await state()).saved?.battery) fail('取消 cleared the save');
  // yes: a new game in the workshop, the moved dial kept
  await page.click('.mc-dev .hd .restart');
  await reloaded(() => page.click('.mc-dev .ask [data-act="restart-yes"]'));
  const s3 = await state();
  console.log('from the start', JSON.stringify(s3));
  fresh(s3, s0, 'from the start');
  if (s3.dials.join() !== 'rain.count') fail(`the moved dial was not kept (${s3.dials})`);
  await page.screenshot({ path: path.join(out, 'fresh.png') });

  // ---- again with the dials back to the game's own (kept on the dev server first)
  for (const f of copies) if (fs.existsSync(f)) fs.rmSync(f);
  await progress();
  await page.keyboard.press('Backquote');
  await page.click('.mc-dev .hd .restart');
  await page.check('.mc-dev .ask input[data-act="dials"]');
  await reloaded(() => page.click('.mc-dev .ask [data-act="restart-yes"]'));
  const s4 = await state();
  console.log('dials too', JSON.stringify(s4));
  fresh(s4, s0, 'dials too');
  if (s4.dials.length) fail(`dials still moved: ${s4.dials}`);
  const copy = fs.existsSync(copies[0]) ? JSON.parse(fs.readFileSync(copies[0], 'utf8')) : null;
  if (!copy?.dials?.['rain.count']) fail('the moved dials were not kept on the dev server before they went');

  // ---- F9 twice, from the made-again page too
  await progress();
  await open('?start=road&s=3000&devpanel=place');
  await page.keyboard.press('F9');
  await reloaded(() => page.keyboard.press('F9'));
  const s5 = await state();
  console.log('F9 F9', JSON.stringify(s5));
  fresh(s5, s0, 'F9 twice');

  // ---- the picture's quality is kept
  await open('?quality=low&start=road&s=3000');
  await reloaded(() => page.evaluate(() => window.__rt.game.newGame()));
  const q = await page.evaluate(() => ({ search: location.search, quality: window.__rt.params.quality, place: window.__rt.game.place }));
  console.log('quality', JSON.stringify(q));
  if (q.search !== '?quality=low' || q.quality !== 'low' || q.place !== 'garage') fail(`the quality was not kept ${JSON.stringify(q)}`);

  const lastError = await page.evaluate(() => window.__rt.lastError);
  if (lastError) fail(`a frame threw: ${lastError}`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
  await ctx.close();
} catch (e) {
  fail(e.message);
} finally {
  await browser.close();
  await server.close();
  copies.forEach((f, i) => {
    if (had[i]) fs.writeFileSync(f, had[i]);
    else if (fs.existsSync(f)) fs.rmSync(f);
  });
}
console.log(bad ? `modcar_restart: ${bad} FAILED` : 'modcar_restart: ok');
process.exit(bad ? 1 : 0);
