// The developer's parts bin (` opens it): its tiles get their pictures; a tile dragged out over the world and
// let go puts the thing there (a ghost shows where while it is dragged), a click puts it at one's feet, a
// vehicle can be dropped too; the bin's buttons clear the floor and mend every vehicle; ` shuts it again.
// Writes loop/shots/modcar_dev/*.png.
//   SHOTS_GPU=1 node harness/shots/modcar_dev.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/modcar_dev');
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
  const state = () =>
    page.evaluate(() => {
      const g = window.__rt.game;
      // (the tiles in view: the ones whose pictures are asked for)
      const list = document.querySelector('.mc-dev .list')?.getBoundingClientRect();
      const tiles = list ? [...document.querySelectorAll('.mc-dev .tile')].filter((t) => { const r = t.getBoundingClientRect(); return r.height > 0 && r.bottom > list.top && r.top < list.bottom; }) : [];
      const drawn = tiles.filter((t) => t.querySelector('img.pic')?.src.startsWith('data:')).length;
      return { open: !!g.devPanel?.open, pictures: drawn, inView: tiles.length, loose: g.loose.list.length, vehicles: g.vehicles.length };
    });
  // looking a little down at the floor in front
  await page.evaluate(() => {
    const g = window.__rt.game;
    g.input.lookPitch = -0.42;
    g.simulate(0.2);
  });
  // ` opens the bin
  await page.keyboard.press('Backquote');
  let s = await state();
  if (!s.open) fail('` did not open the bin');
  // its pictures come in
  for (let i = 0; i < 80 && s.pictures < s.inView; i++) {
    await page.waitForTimeout(250);
    s = await state();
  }
  console.log('open', JSON.stringify(s));
  if (s.inView < 6 || s.pictures < s.inView) fail(`${s.pictures} of the ${s.inView} tiles in view have their pictures`);
  await rt('render');
  await page.screenshot({ path: path.join(out, 'bin.png') });
  // each kind's tiles, their pictures drawn
  for (const g of ['wheels', 'body', 'cab', 'electric', 'tools', 'vehicles']) {
    await page.click(`.mc-dev .chips span[data-g="${g}"]`);
    let k = await state();
    for (let i = 0; i < 80 && k.pictures < k.inView; i++) {
      await page.waitForTimeout(250);
      k = await state();
    }
    if (k.pictures < k.inView) fail(`${g}: ${k.pictures} of ${k.inView} pictures`);
    await page.screenshot({ path: path.join(out, `bin_${g}.png`), clip: { x: 880, y: 0, width: 400, height: 720 } });
  }
  await page.click('.mc-dev .chips span[data-g="all"]');
  const before = s.loose;

  // search, then drag the V8 out onto the floor and let go
  await page.fill('.mc-dev input.q', 'v8');
  await page.waitForTimeout(400);
  const tile = await page.$('.mc-dev .tile[data-key="part:eng_v8"]');
  const box = tile ? await tile.boundingBox() : null;
  if (!box) fail('no V8 tile after the search');
  else {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(700, 520, { steps: 6 });
    await page.mouse.move(460, 560, { steps: 8 });
    // (mid-drag: the ghost where it would land)
    const ghost = await page.evaluate(() => {
      const g = window.__rt.game.core.scene.getObjectByName('ghost:dev');
      return g ? { visible: g.visible, children: g.children.length } : null;
    });
    console.log('dragging', JSON.stringify(ghost));
    if (!ghost?.visible) fail('no ghost while dragging');
    await page.waitForTimeout(300);
    await rt('render');
    await page.screenshot({ path: path.join(out, 'dragging.png') });
    const aim = await rt('devPick', 460 / 1280, 560 / 720);
    await page.mouse.up();
    s = await state();
    const v8 = await page.evaluate(() => window.__rt.loose().at(-1));
    console.log('dropped', JSON.stringify({ aim, v8 }));
    if (s.loose !== before + 1 || v8?.part !== 'eng_v8') fail('the V8 was not put down');
    else if (aim && Math.hypot(v8.x - aim.x, v8.z - aim.z) > 0.3) fail('the V8 is not where it was let go');
  }
  const ghostAfter = await page.evaluate(() => window.__rt.game.core.scene.getObjectByName('ghost:dev'));
  if (ghostAfter) fail('the ghost stayed after the drop');

  // a click on a tile: at one's feet
  await page.fill('.mc-dev input.q', '');
  await page.click('.mc-dev .chips span[data-g="tools"]');
  await page.waitForTimeout(200);
  await page.click('.mc-dev .tile[data-key="tool:jerrycan:diesel:20"]');
  const can = await page.evaluate(() => {
    const w = window.__rt.game.player.walker;
    const l = window.__rt.loose().at(-1);
    return l?.tool === 'jerrycan' ? { d: Math.hypot(l.x - w.x, l.z - w.z) } : null;
  });
  console.log('clicked', JSON.stringify(can));
  if (!can || can.d > 2) fail('the clicked can is not at the feet');

  // a rim (it comes with its tyre), a seat on a bench, a vehicle on the floor
  const cars = s.vehicles;
  const rim = await rt('devDrop', 'part:rim_alloy15', 0.32, 0.8);
  const bike = await rt('devDrop', 'vehicle:moto:stock', 0.2, 0.62);
  const bare = await rt('devDrop', 'vehicle:sedan:bare', 0.55, 0.45);
  console.log('dropped', JSON.stringify({ rim, bike, bare }));
  s = await state();
  if (!rim) fail('the rim found nowhere to land');
  if (s.vehicles !== cars + 2) fail(`vehicles: ${cars} then ${s.vehicles}`);
  const tyred = await page.evaluate(() => window.__rt.game.loose.list.find((l) => l.part?.part === 'rim_alloy15')?.part.sub.tire?.part ?? null);
  // (its frame's factory tyre: the alloy is the Fox's, on sport tyres)
  if (tyred !== 'tire_sport') fail(`the rim came without its tyre (${tyred})`);
  // everything settles
  await page.evaluate(() => window.__rt.game.simulate(2.5));
  const rest = await page.evaluate(() => window.__rt.loose().map((l) => ({ what: l.part ?? l.tool, y: +l.y.toFixed(2), resting: l.resting })));
  console.log('settled', JSON.stringify(rest));
  if (rest.some((l) => !l.resting)) fail('something did not come to rest');
  await page.click('.mc-dev .chips span[data-g="all"]');
  await rt('render');
  await page.screenshot({ path: path.join(out, 'dropped.png') });

  // the buttons
  await page.evaluate(() => {
    const v = window.__rt.game.vehicles[0];
    for (const inst of Object.values(v.build.parts)) inst.cond = 0.2;
  });
  await page.click('.mc-dev button[data-act="repair"]');
  const mended = await page.evaluate(() => Object.values(window.__rt.game.vehicles[0].build.parts).every((i) => i.cond === 1));
  if (!mended) fail('repair left a part worn');
  await page.click('.mc-dev button[data-act="clear"]');
  s = await state();
  if (s.loose !== 0) fail(`clear left ${s.loose} things`);

  // ` shuts it, the game has the keys again
  await page.keyboard.press('Backquote');
  s = await state();
  if (s.open) fail('` did not shut the bin');
  const lockable = await page.evaluate(() => window.__rt.game.input.lockable);
  if (!lockable) fail('the mouse cannot be taken again');
  await page.keyboard.press('Backquote');
  s = await state();
  if (!s.open) fail('` did not open the bin again');
  await page.keyboard.press('Escape');
  s = await state();
  if (s.open) fail('Esc did not shut the bin');

  if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
  await page.close();
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `modcar_dev: ${bad} FAILED` : 'modcar_dev: ok');
process.exit(bad ? 1 : 0);
