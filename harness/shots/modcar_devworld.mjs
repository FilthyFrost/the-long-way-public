// The developer panel's world tabs: every tab has its dials; a teleport to each kind of country lands in it;
// one click of weather forces it (and its stage, a bolt of lightning); the rain dial makes the rain that much
// harder, the hour and the speed of the clock move the sky, a look dial reaches the frame; the moved dials can be
// exported and saved through the dev server; rain bursts on the road and the car; a terrain dial and "make the
// world again" reload with the world made from it, the panel open again. Writes loop/shots/modcar_devworld/*.png.
//   SHOTS_GPU=1 node harness/shots/modcar_devworld.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/modcar_devworld');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1`, { width: 1280, height: 720 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const settle = async () => {
    for (let i = 0; i < 150; i++) {
      await page.evaluate(() => window.__rt.game.simulate(0.1));
      if ((await rt('worldPending')) === 0) break;
    }
    await page.evaluate(() => window.__rt.game.simulate(0.2));
  };

  // every tab with its content
  for (const tab of ['place', 'weather', 'time', 'look', 'terrain']) {
    if ((await rt('devTab', tab)) !== tab) fail(`tab ${tab} did not open`);
    const n = await page.evaluate((t) => document.querySelectorAll(`.mc-dev .pane[data-p="${t}"] .dial, .mc-dev .pane[data-p="${t}"] button`).length, tab);
    if (n < 5) fail(`tab ${tab}: only ${n} controls`);
  }
  await rt('render');
  await page.screenshot({ path: path.join(out, 'terrain_tab.png'), clip: { x: 880, y: 0, width: 400, height: 720 } });
  // the bubble with what a dial does
  await rt('devTab', 'weather');
  const lb = await page.$('.mc-dev .dial[data-id="rain.amount"] .lb');
  if (lb) {
    const b = await lb.boundingBox();
    await page.mouse.move(b.x + 8, b.y + 6);
    await page.waitForTimeout(80);
  }
  const tip = await page.evaluate(() => {
    const t = document.querySelector('.mc-dev-tip');
    return t && t.style.display !== 'none' ? t.textContent : null;
  });
  if (!tip?.includes('雨下得多大')) fail(`no help bubble for the rain dial (${tip})`);
  await page.screenshot({ path: path.join(out, 'weather_tab.png'), clip: { x: 520, y: 0, width: 760, height: 720 } });
  await page.mouse.move(200, 300);
  await page.evaluate(() => window.__rt.game.toggleDev(false));

  // off to each kind of country, out of the garage first
  const kinds = { snowMountain: '针叶雪山', snowPlain: '针叶雪山', desert: '荒漠公路', canyon: '峡谷', lakes: '湖区', maple: '枫叶丘陵', coast: '海边', river: '有河' };
  for (const [kind, want] of Object.entries(kinds)) {
    const msg = await rt('devGo', kind, true);
    await settle();
    const where = await rt('devWhere');
    console.log(kind, '|', where);
    if (!where.includes(want)) fail(`${kind}: landed in ${where} (${msg})`);
    await rt('render');
    await page.screenshot({ path: path.join(out, `go_${kind}.png`) });
  }
  const place = await page.evaluate(() => window.__rt.game.place);
  if (place !== 'road') fail(`not on the road after the teleports (${place})`);

  // the weather at a click, made harder by the dial
  await rt('devGo', 'plains', true);
  await settle();
  await rt('devWeather', 'storm', null);
  await page.evaluate(() => window.__rt.game.simulate(1));
  const base = await page.evaluate(() => window.__rt.game.env.state.rain);
  await rt('devDial', 'rain.amount', 2);
  await page.evaluate(() => window.__rt.game.simulate(1));
  const harder = await page.evaluate(() => window.__rt.game.env.state.rain);
  console.log('rain', base.toFixed(2), '→', harder.toFixed(2));
  if (base < 0.4 || Math.abs(harder / base - 2) > 0.25) fail(`the rain dial: ${base} → ${harder}`);
  // rain bursting on the road and the car
  const bursts = await page.evaluate(() => {
    const sp = window.__rt.game.splashes;
    const now = sp.mat.uniforms.uNow.value;
    const live = (mesh) => {
      const at = mesh.geometry.getAttribute('aSplash');
      let n = 0;
      for (let i = 0; i < at.count; i++) if (now - at.getW(i) < 0.5) n++;
      return n;
    };
    return { ground: live(sp.ground.mesh), car: [...sp.tops.values()].reduce((a, t) => a + live(t.bursts.mesh), 0) };
  });
  console.log('bursts', JSON.stringify(bursts));
  if (bursts.ground < 20) fail(`few bursts on the ground (${bursts.ground})`);
  if (bursts.car < 3) fail(`few bursts on the car (${bursts.car})`);
  await rt('setView', 'orbit');
  await rt('setOrbit', 25, 30, 6, 0.9);
  await page.evaluate(() => window.__rt.game.simulate(0.2));
  await rt('render');
  await page.screenshot({ path: path.join(out, 'storm_x2.png') });
  await rt('setView', 'cockpit');
  await page.evaluate(() => window.__rt.game.env.strike());
  // stage and back
  await rt('devWeather', 'storm', 2.6);
  await page.evaluate(() => window.__rt.game.simulate(0.5));
  const clearing = await page.evaluate(() => window.__rt.game.env.state.act);
  if (clearing !== 3) fail(`the stage dial did not reach the clearing (act ${clearing})`);
  await rt('devWeather', null, null);

  // the hour, the speed of the clock
  const h = await rt('devHour', 18.5);
  if (Math.abs(h - 18.5) > 0.05) fail(`hour ${h}`);
  await page.evaluate(() => {
    window.__rt.game.devTools.timeSpeed = 60;
    window.__rt.game.simulate(4);
    window.__rt.game.devTools.timeSpeed = 1;
  });
  const later = await page.evaluate(() => window.__rt.game.devTools.hour);
  if (!(later > 18.55)) fail(`the clock at 60× did not move on (${later})`);
  // a look dial reaches the frame
  await rt('devDial', 'look.saturation', 0.3);
  await page.evaluate(() => window.__rt.game.simulate(0));
  const sat = await page.evaluate(() => window.__rt.game.core.frame.grade.saturation);
  if (Math.abs(sat - 0.3) > 1e-6) fail(`saturation dial: ${sat}`);

  // out of the panel: the export, the save through the dev server
  const text = await rt('devExport');
  if (!text.includes('雨量') || !text.includes('颜色鲜艳度')) fail('the export misses a moved dial');
  const saved = await page.evaluate(async () => {
    const t = window.__rt.game.tune.export(window.__rt.game.devTools.context());
    return window.__rt.game.devTools.saveTune(t.text, t.json, 'dev-tune-probe');
  });
  const file = path.join(ROOT, 'loop/dev-tune-probe.json');
  if (saved !== 'loop/dev-tune-probe.json' || !fs.existsSync(file)) fail(`save: ${saved}`);
  else {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (j.dials?.['rain.amount']?.value !== 2) fail('the saved file misses the rain dial');
    fs.rmSync(file);
    fs.rmSync(path.join(ROOT, 'loop/dev-tune-probe.txt'), { force: true });
  }
  for (const id of ['rain.amount', 'look.saturation']) await rt('devDial', id);

  // a terrain dial, the world made again: the new page made it with the dial, the panel open on the tab
  await rt('devDial', 'terrain.plains.nearAmp', 21);
  await Promise.all([page.waitForNavigation({ timeout: 120_000 }), page.evaluate(() => window.__rt.game.devTools.regenerate(false, 'terrain'))]);
  await page.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 180_000 });
  const after = await page.evaluate(() => ({ amp: window.__rt.biomeDef('plains').nearAmp, tab: window.__rt.game.devPanel?.tab ?? null, open: !!window.__rt.game.devPanel?.open, place: window.__rt.game.place, q: location.search }));
  console.log('regenerated', JSON.stringify(after));
  if (after.amp !== 21) fail(`the world was made with nearAmp ${after.amp}`);
  if (!after.open || after.tab !== 'terrain') fail('the panel did not open on the terrain tab again');
  if (after.place !== 'road') fail('not back on the road');
  await page.evaluate(() => window.__rt.game.tune.resetAll());

  if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
  await page.close();
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `modcar_devworld: ${bad} FAILED` : 'modcar_devworld: ok');
process.exit(bad ? 1 : 0);
