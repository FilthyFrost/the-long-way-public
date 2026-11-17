// The handling lab in the developer's panel (docs/MODCAR.md §21), in the game: sat in the sedan, the 手感 tab
// measures it (a table of figures), tries a V8 in place of its engine (each figure before and after, the one it
// moves most named), and tries every engine in turn; the sedan in the world keeps its own engine throughout.
//   SHOTS_GPU=1 node harness/shots/modcar_lab.mjs
import { launchBrowser, startServer } from './lib.mjs';

const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  await page.goto(`${url}/modcar.html?new=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 240000 });
  const builds = await rt('builds');
  const vi = builds.findIndex((b) => b.startsWith('stock:sedan') || b.startsWith('sedan'));
  await rt('setBuild', vi, 'stock:sedan');
  await rt('enter', vi);
  const before = (await rt('builds'))[vi];
  console.log('tab', await rt('devTab', 'lab'));
  await page.waitForTimeout(400);
  const lab = '.mc-dev .pane[data-p="lab"]';
  const head = await page.textContent(`${lab} .lab-veh`);
  console.log('vehicle', head);
  if (!head?.includes('方糖')) fail(`the lab does not name the sedan (${head})`);
  // measure it
  await page.click(`${lab} button[data-act="measure"]`);
  await page.waitForFunction((sel) => /量完了/.test(document.querySelector(sel)?.textContent ?? ''), `${lab} .msg`, { timeout: 60000 });
  const rows = await page.$$eval(`${lab} .lab-out tr`, (t) => t.length);
  console.log('figures', rows);
  if (rows < 20) fail(`the measurement shows only ${rows} figures`);
  // a V8 tried in place of the engine
  await page.selectOption(`${lab} .lab-cat`, 'engine');
  await page.selectOption(`${lab} .lab-part`, 'eng_v8');
  await page.click(`${lab} button[data-act="try"]`);
  await page.waitForFunction((sel) => /变化最大/.test(document.querySelector(sel)?.textContent ?? ''), `${lab} .msg`, { timeout: 60000 });
  const said = await page.textContent(`${lab} .msg`);
  console.log('tried', said);
  await page.evaluate(() => window.__rt.render());
  await page.screenshot({ path: 'loop/shots/modcar_lab_try.png' });
  // every engine in turn
  await page.click(`${lab} button[data-act="all"]`);
  await page.waitForFunction((sel) => /个零件变化不到|个都至少/.test(document.querySelector(sel)?.textContent ?? ''), `${lab} .msg`, { timeout: 120000 });
  const all = await page.$$eval(`${lab} .lab-out tr`, (t) => t.map((r) => r.textContent));
  console.log('all engines', all.length, JSON.stringify(all.slice(0, 4)), await page.textContent(`${lab} .msg`));
  if (all.length < 8) fail(`only ${all.length} engines tried`);
  await page.screenshot({ path: 'loop/shots/modcar_lab_all.png' });
  const after = (await rt('builds'))[vi];
  if (after !== before) fail(`the sedan in the world changed (${before} → ${after})`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
} catch (e) {
  fail(String(e?.stack ?? e));
} finally {
  await browser.close();
  server.close();
}
console.log(bad ? `modcar_lab: ${bad} FAILED` : 'modcar_lab: ok');
process.exit(bad ? 1 : 0);
